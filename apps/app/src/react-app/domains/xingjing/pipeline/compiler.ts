/**
 * 星静流水线编译器
 *
 * 将 PipelineDefinition 编译为两个产物：
 * 1. `.opencode/agents/xingjing-pipeline-<id>.md`  — 编排 agent（引擎执行）
 * 2. `.opencode/command/<triggerCommand>.md`        — slash command（Composer 触发）
 *
 * 设计依据：SDD §5 编译器规则
 *
 * 核心不变式（六道闸门 §11 闸门 1/2/5/6 在 system prompt 中声明）：
 * - 每节点必须产出 `.opencode/docs/pipeline-<id>/node-<nodeId>.md`
 * - 进入下一节点前必须 read_file 验证产出非空
 * - 启动第一步一次性写入全部节点 Todo（id=`pipeline-<pipelineId>:node-<nodeId>`）
 * - parallel 组内 ≤ 4 并发，全组完成后统一更新 Todo，子 session 不直接改 Todo
 * - review 节点 reviewer ≠ implementer
 * - 末尾输出 summary.md
 */

import type {
  PipelineDefinition,
  PipelineNode,
  PipelineLaunchContext,
  PipelineValidationError,
} from "./types";
import { PIPELINE_LIMITS } from "./types";

// ── 常量 ─────────────────────────────────────────────────────────────────────

export const AGENTS_DIR = ".opencode/agents";
export const COMMAND_DIR = ".opencode/commands";
export const DOCS_BASE = ".opencode/docs";

/** 节点产出文件路径（相对 workspace root） */
export function nodeOutputPath(pipelineId: string, nodeId: string): string {
  return `${DOCS_BASE}/pipeline-${pipelineId}/node-${nodeId}.md`;
}
/** review 节点评审结论文件 */
export function nodeReviewPath(pipelineId: string, nodeId: string): string {
  return `${DOCS_BASE}/pipeline-${pipelineId}/node-${nodeId}-review.md`;
}
/** 执行日志 */
export function executionLogPath(pipelineId: string): string {
  return `${DOCS_BASE}/pipeline-${pipelineId}/execution.log.md`;
}
/** 全流程汇总 */
export function summaryPath(pipelineId: string): string {
  return `${DOCS_BASE}/pipeline-${pipelineId}/summary.md`;
}

// ── 占位符渲染器 ─────────────────────────────────────────────────────────────

/**
 * 将节点 prompt 模板中的占位符替换为实际值。
 * 供 compiler 生成 agent body 与 launcher 构建 user text 共用。
 */
export function renderPrompt(
  template: string,
  ctx: Pick<PipelineLaunchContext, "goal" | "inputValues" | "attachments" | "knowledgeRefs">,
  prevOutputPath?: string,
): string {
  let result = template;

  // {{goal}}
  result = result.replaceAll("{{goal}}", ctx.goal || "");

  // {{inputs.<key>}}
  result = result.replace(/\{\{inputs\.([^}]+)\}\}/g, (_, key: string) => {
    const val = ctx.inputValues[key];
    if (Array.isArray(val)) return val.join(", ");
    return val ?? "";
  });

  // {{attachments}}
  if (ctx.attachments && ctx.attachments.length > 0) {
    result = result.replaceAll(
      "{{attachments}}",
      ctx.attachments.map((p) => `@${p}`).join(" "),
    );
  } else {
    result = result.replace(/.*\{\{attachments\}\}.*\n?/g, "");
  }

  // {{knowledge}}
  if (ctx.knowledgeRefs && ctx.knowledgeRefs.length > 0) {
    result = result.replaceAll(
      "{{knowledge}}",
      ctx.knowledgeRefs.join(", "),
    );
  } else {
    result = result.replace(/.*\{\{knowledge\}\}.*\n?/g, "");
  }

  // {{prev.output}}
  result = result.replaceAll(
    "{{prev.output}}",
    prevOutputPath ? `Read the previous node output at: ${prevOutputPath}` : "",
  );

  return result.trim();
}

// ── 编译期校验 ───────────────────────────────────────────────────────────────

/**
 * 对 PipelineDefinition 进行编译期校验。
 * 返回错误列表；空数组表示通过。
 * knownAgentNames / knownSkillNames 可选，缺省时跳过 ref 存在性检查。
 */
export function validatePipeline(
  def: PipelineDefinition,
  opts: {
    knownAgentNames?: Set<string>;
    knownSkillNames?: Set<string>;
    existingTriggerCommands?: Set<string>;
  } = {},
): PipelineValidationError[] {
  const errors: PipelineValidationError[] = [];

  // 总节点数
  if (def.nodes.length > PIPELINE_LIMITS.totalNodes) {
    errors.push({
      code: "NODES_EXCEED_LIMIT",
      max: PIPELINE_LIMITS.totalNodes,
      actual: def.nodes.length,
    });
  }

  // 重复 trigger
  if (
    opts.existingTriggerCommands &&
    opts.existingTriggerCommands.has(def.triggerCommand)
  ) {
    errors.push({ code: "DUPLICATE_TRIGGER_COMMAND", command: def.triggerCommand });
  }

  // parallel 组校验
  let groupCount = 0;
  let groupStartId = "";
  for (let i = 0; i < def.nodes.length; i++) {
    const node = def.nodes[i];
    if (node.parallel && i > 0) {
      if (groupCount === 0) {
        groupStartId = def.nodes[i - 1].id;
        groupCount = 2;
      } else {
        groupCount++;
      }
      if (groupCount > PIPELINE_LIMITS.parallelGroupSize) {
        errors.push({
          code: "PARALLEL_GROUP_EXCEED_LIMIT",
          max: PIPELINE_LIMITS.parallelGroupSize,
          groupStartNodeId: groupStartId,
          actual: groupCount,
        });
      }
    } else {
      groupCount = 0;
    }

    // agent/skill ref 存在性
    if (node.kind === "agent") {
      if (!node.ref?.trim()) {
        errors.push({ code: "AGENT_REF_REQUIRED", nodeId: node.id });
      } else if (opts.knownAgentNames && !opts.knownAgentNames.has(node.ref)) {
        errors.push({ code: "UNKNOWN_AGENT_REF", nodeId: node.id, ref: node.ref });
      }
    }
    if (node.kind === "skill" && node.ref && opts.knownSkillNames) {
      if (!opts.knownSkillNames.has(node.ref)) {
        errors.push({ code: "UNKNOWN_SKILL_REF", nodeId: node.id, ref: node.ref });
      }
    }

    // branch target 存在性
    if (node.kind === "branch") {
      const ids = new Set(def.nodes.map((n) => n.id));
      if (node.branchTrueTargetId && !ids.has(node.branchTrueTargetId)) {
        errors.push({ code: "BRANCH_TARGET_NOT_FOUND", nodeId: node.id, target: node.branchTrueTargetId });
      }
      if (node.branchFalseTargetId && !ids.has(node.branchFalseTargetId)) {
        errors.push({ code: "BRANCH_TARGET_NOT_FOUND", nodeId: node.id, target: node.branchFalseTargetId });
      }
    }

    // review 不能 self-review
    if (node.kind === "review" && node.ref && node.reviewers) {
      if (node.reviewers.includes(node.ref)) {
        errors.push({ code: "REVIEWER_IS_SELF", nodeId: node.id, ref: node.ref });
      }
    }
  }

  return errors;
}

// ── agent md 生成 ────────────────────────────────────────────────────────────

/** 生成 agent md 的 frontmatter */
function buildFrontmatter(def: PipelineDefinition): string {
  return [
    "---",
    `description: 星静流水线 · ${def.name}`,
    "mode: primary",
    "---",
  ].join("\n");
}

/** 生成所有节点的 Todo 一次性写入指令 */
function buildTodoInitSection(def: PipelineDefinition): string {
  const items = def.nodes
    .map((n, i) =>
      `  - id: "pipeline-${def.id}:node-${n.id}", title: "${i + 1}. ${n.label}", status: "pending"`,
    )
    .join("\n");

  return `## 步骤 0：初始化执行账本（MANDATORY）

Your FIRST action MUST be to call the Todo tool to create todos for ALL ${def.nodes.length} nodes at once.
Use the following exact todo entries:
\`\`\`
${items}
\`\`\`
Do NOT proceed to any node until all todos have been created.
`;
}

/** 生成单节点的执行描述 */
function buildNodeSection(
  node: PipelineNode,
  index: number,
  prevNode: PipelineNode | null,
  pipelineId: string,
): string {
  const outPath = nodeOutputPath(pipelineId, node.id);
  const prevPath = prevNode ? nodeOutputPath(pipelineId, prevNode.id) : null;
  const lines: string[] = [];

  lines.push(`### 节点 ${index + 1}：${node.label} [kind=${node.kind}]`);

  if (prevPath) {
    lines.push(
      `**前置条件**：在执行本节点前，必须先用 read_file 读取 \`${prevPath}\`，确认其存在且非空。若不满足则 STOP 并报告异常。`,
    );
  }

  switch (node.kind) {
    case "agent": {
      const promptLine = node.prompt
        ? `\n**给子 agent 的指令**：\n${node.prompt}`
        : "";
      lines.push(
        `使用 Task tool 派发子 agent \`@${node.ref}\`。\n` +
        `**Task 工具参数约束（CRITICAL）**：仅传入 \`description\`、\`prompt\`、\`subagent_type\` 三个字段；` +
        `严禁传入 \`task_id\`、\`id\`、\`taskId\` 等任何额外字段，否则 binary 会以 Zod schema 校验失败。` +
        `${promptLine}`,
      );
      break;
    }
    case "skill": {
      lines.push(
        `将 Skill \`${node.ref}\` 的内容作为 user message 注入当前 session。${node.prompt ? `\n附加提示：${node.prompt}` : ""}`,
      );
      break;
    }
    case "review": {
      const reviewers = (node.reviewers ?? ["spec-reviewer", "code-quality-reviewer"]).join("` 和 `@");
      lines.push(
        `依次派发 \`@${reviewers}\` 进行评审。评审结论写入 \`${nodeReviewPath(pipelineId, node.id)}\`，必须包含 \`approved: true\` 或 \`approved: false\`。若 \`approved: false\` 则回到上一节点修复，重试最多 1 次。`,
      );
      break;
    }
    case "human_approval": {
      lines.push(
        `创建 Todo：\`Awaiting approval: ${node.approvalPrompt ?? node.label}\`（status=pending），然后 STOP，等待用户将该 Todo 勾选为 completed 后再继续。`,
      );
      break;
    }
    case "branch": {
      lines.push(
        `评估条件：\`${node.branchCondition ?? "(no condition)"}\`。`,
      );
      if (node.branchTrueTargetId) {
        lines.push(`- 条件为真 → 跳转到节点 ID \`${node.branchTrueTargetId}\``);
      }
      if (node.branchFalseTargetId) {
        lines.push(`- 条件为假 → 跳转到节点 ID \`${node.branchFalseTargetId}\``);
      }
      break;
    }
  }

  // 产出与退出条件（branch 和 human_approval 不写文件）
  if (node.kind !== "branch" && node.kind !== "human_approval") {
    lines.push(
      `**产出**：将本节点的完整结论/代码/文件写入 \`${outPath}\`。`,
      `**退出条件**：\`${outPath}\` 必须存在、字符数 ≥ 100 且包含标题 \`## ${node.label}\`，否则重试。`,
    );
  }

  // onFail 策略
  if (node.onFail === "skip") {
    lines.push(`**失败策略**：本节点失败时跳过（skip），不终止 pipeline。`);
  } else if (node.onFail === "retry") {
    lines.push(`**失败策略**：最多重试 1 次，重试后仍失败则终止整条 pipeline。`);
  } else {
    lines.push(`**失败策略**：本节点失败则立即终止整条 pipeline（abort）。`);
  }

  // 完成后更新 Todo
  if (node.kind !== "human_approval") {
    lines.push(
      `**完成后**：更新 Todo \`pipeline-${pipelineId}:node-${node.id}\` 状态为 completed（或 failed/skipped），然后在 \`${executionLogPath(pipelineId)}\` 追加一行：\`节点 ${index + 1} ${node.label}: [start=xxx, end=xxx]\`。`,
    );
  }

  return lines.join("\n\n");
}

/** 生成并行组块说明 */
function buildParallelGroupNote(nodes: PipelineNode[]): string {
  return `> **并行组**（${nodes.length} 个节点）：通过 Task tool 一次性派发以下所有节点，等待全部完成后统一更新 Todo，不允许单个子 session 直接修改 Todo。并行节点间只读共享文件，不得写入同名文件。最多同时派发 ${PIPELINE_LIMITS.parallelGroupSize} 个。
> **Task 工具参数约束（CRITICAL）**：每次派发仅传入 \`description\`、\`prompt\`、\`subagent_type\` 三个字段；严禁传入 \`task_id\`、\`id\`、\`taskId\` 等任何额外字段。`;
}

/**
 * 将 PipelineDefinition 编译为编排 agent markdown 内容。
 */
export function compilePipelineToAgentMd(def: PipelineDefinition): string {
  const sections: string[] = [];

  sections.push(buildFrontmatter(def));
  sections.push(`\n# 星静流水线编排 Agent：${def.name}\n`);

  // 必须第一步调用 skill
  sections.push(`## 必要前置 Skill

You MUST invoke the \`subagent-driven-development\` skill as your FIRST action before anything else.
Also invoke the \`dispatching-parallel-agents\` skill when you encounter parallel node groups.
`);

  // 并发限额声明
  sections.push(`## 执行约束（MANDATORY，不可忽略）

- **单并行组上限**：单次 Task 派发最多 ${PIPELINE_LIMITS.parallelGroupSize} 个子 agent
- **总节点上限**：已编译 ${def.nodes.length} 个节点（上限 ${PIPELINE_LIMITS.totalNodes}）
- **单节点超时**：${PIPELINE_LIMITS.defaultNodeTimeoutMinutes} 分钟无进展则标记 timeout 并终止
- **并行组写文件规则**：并行组内各节点只读共享文件，严禁写入同名文件
- **Todo 更新规则**：只有编排 agent（本 agent）才能更新 Todo 状态，子 session 不得直接修改 Todo
- **单 workspace 并发**：同一 workspace 同时只能运行一条 pipeline
`);

  // Todo 初始化
  sections.push(`## 节点执行指南\n`);
  sections.push(buildTodoInitSection(def));

  // 按节点顺序输出，识别 parallel 组
  let i = 0;
  while (i < def.nodes.length) {
    const node = def.nodes[i];
    const isParallel = node.parallel && i > 0;

    if (isParallel) {
      // 收集整个并行组
      const group: PipelineNode[] = [];
      let j = i;
      while (j < def.nodes.length && (def.nodes[j].parallel || j === i)) {
        if (def.nodes[j].parallel || j === i) group.push(def.nodes[j]);
        else break;
        j++;
      }
      // 倒退：第一个 parallel=true 往前找组起始
      // 实际：parallel=true 标记在与前节点并行的节点上，前一节点也在组内
      const prevNode = i > 0 ? def.nodes[i - 1] : null;
      if (prevNode) {
        // 组包含 prevNode
        sections.push(buildParallelGroupNote([prevNode, ...group]));
      }
      for (const pNode of group) {
        const idx = def.nodes.indexOf(pNode);
        sections.push(buildNodeSection(pNode, idx, idx > 0 ? def.nodes[idx - 1] : null, def.id));
      }
      i = i + group.length;
    } else {
      sections.push(buildNodeSection(node, i, i > 0 ? def.nodes[i - 1] : null, def.id));
      i++;
    }
  }

  // 汇总
  sections.push(`## 收尾步骤

所有节点执行完毕后：
1. 生成 \`${summaryPath(def.id)}\`，含每节点产出摘要（路径 + 关键结论）
2. 更新所有剩余 pending Todo 为 completed 或 cancelled
3. 在 \`${executionLogPath(def.id)}\` 追加 \`pipeline 完成: [total_nodes=${def.nodes.length}]\`
`);

  return sections.join("\n---\n\n");
}

/**
 * 将 PipelineDefinition 编译为 slash command markdown 内容。
 * 该文件放置在 `.opencode/command/<triggerCommand>.md`，
 * Composer 输入 `/<triggerCommand>` 时自动识别并触发编排 agent。
 */
export function compilePipelineToCommandMd(def: PipelineDefinition): string {
  return [
    "---",
    `description: ${def.name} — ${def.description}`,
    `agent: xingjing-pipeline-${def.id}`,
    "---",
    "",
    `# ${def.name}`,
    "",
    def.description,
    "",
    `**触发方式**：在 Composer 输入 \`/${def.triggerCommand}\` 或 \`@xingjing-pipeline-${def.id}\``,
    "",
    `**节点数**：${def.nodes.length}`,
    `**作用域**：${def.scope}`,
    "",
    "## 节点概览",
    "",
    def.nodes
      .map(
        (n, i) =>
          `${i + 1}. **${n.label}** (${n.kind})${n.parallel ? " ⚡并行" : ""}`,
      )
      .join("\n"),
  ].join("\n");
}

// ── 产物路径 ─────────────────────────────────────────────────────────────────

/** 编排 agent 文件路径（workspace 相对） */
export function agentFilePath(pipelineId: string): string {
  return `${AGENTS_DIR}/xingjing-pipeline-${pipelineId}.md`;
}

/** slash command 文件路径（workspace 相对） */
export function commandFilePath(triggerCommand: string): string {
  return `${COMMAND_DIR}/${triggerCommand}.md`;
}
