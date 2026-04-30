/** @jsxImportSource react */
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Workflow, Plus, Copy, Trash2, Star, ChevronRight, Settings,
  Loader2, GripVertical, ChevronDown, X, AlertCircle, CheckCircle2,
} from "lucide-react";
import type { OpenworkServerClient } from "../../../../app/lib/openwork-server";
import type {
  PipelineDefinition, PipelineNode, PipelineNodeKind, PipelineScope,
  PipelineInputField, PipelineInputFieldType,
} from "../pipeline/types";
import { PIPELINE_SCOPE_LABELS } from "../pipeline/types";
import { DEFAULT_PIPELINE_TEMPLATES } from "../pipeline/default-templates";

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
import { usePipelineDefinitions } from "../hooks/use-pipeline-definitions";
import { usePipelineSave } from "../hooks/use-pipeline-save";

// ── 常量 ─────────────────────────────────────────────────────────────────────

const NODE_KIND_LABELS: Record<PipelineNodeKind, string> = {
  agent: "Agent",
  skill: "Skill",
  review: "评审",
  human_approval: "人工审批",
  branch: "分支",
};

const NODE_KIND_COLORS: Record<PipelineNodeKind, string> = {
  agent: "bg-dls-bg-3 text-dls-text border-dls-border",
  skill: "bg-blue-3 text-blue-11 border-blue-6",
  review: "bg-amber-3 text-amber-11 border-amber-6",
  human_approval: "bg-green-3 text-green-11 border-green-6",
  branch: "bg-purple-3 text-purple-11 border-purple-6",
};

const SCOPE_OPTIONS: { value: PipelineScope; label: string }[] = [
  { value: "product-planning", label: "产品规划" },
  { value: "product-design", label: "产品设计" },
  { value: "product-insight", label: "产品洞察" },
  { value: "product-dev", label: "研发工坊" },
  { value: "quality-assurance", label: "质量中心" },
  { value: "project-management", label: "项目管理" },
  { value: "release-ops", label: "发布运维" },
  { value: "knowledge-center", label: "知识中心" },
  { value: "custom", label: "自定义" },
];

const DEFAULT_REVIEWERS = ["spec-reviewer", "code-quality-reviewer"];

// ── Props ─────────────────────────────────────────────────────────────────────

export interface XingjingPipelineTabProps {
  client: OpenworkServerClient | null;
  workspaceId: string | null;
  /** 由 session-route 注入：获取当前 workspace 可用 agent 列表 */
  listAgents?: () => Promise<Array<{ name: string; hidden?: boolean; mode?: string }>>;
}

// ── 主组件 ──────────────────────────────────────────────────────────────────

/**
 * 星静流水线设置 Tab（独立版专用）。
 *
 * 左列表 + 右编辑器双栏；全量内联编辑支持。
 *
 * @see product/features/xingjing-pipeline/SDD.md §6
 */
export function XingjingPipelineTab({ client, workspaceId, listAgents }: XingjingPipelineTabProps) {
  const { pipelines, isLoading, error } = usePipelineDefinitions(client, workspaceId);
  const { save, createFromBlank, clone, remove, setDefault, saveStatus, saveError } =
    usePipelineSave(client, workspaceId);

  // 可用 agent / skill 名称（供节点编辑器下拉选择）
  const [agentNames, setAgentNames] = useState<string[]>([]);
  const [skillNames, setSkillNames] = useState<string[]>([]);

  useEffect(() => {
    if (!listAgents) return;
    void (async () => {
      try {
        const agents = await listAgents();
        setAgentNames(
          agents
            .filter((a) => !a.hidden && a.mode !== "subagent")
            .map((a) => a.name),
        );
      } catch {
        // 忳略加载失败，降级为文本输入
      }
    })();
  }, [listAgents]);

  useEffect(() => {
    if (!client || !workspaceId) return;
    void (async () => {
      try {
        const res = await client.listSkills(workspaceId, { includeGlobal: true });
        setSkillNames(res.items.map((s) => s.name));
      } catch {
        // 忳略
      }
    })();
  }, [client, workspaceId]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const effectiveSelectedId =
    selectedId ?? (pipelines.length > 0 ? (pipelines[0]?.id ?? null) : null);
  const selectedDef = pipelines.find((p) => p.id === effectiveSelectedId) ?? null;

  // ── draft 状态（本地可编辑副本） ───────────────────────────────────────
  const [draft, setDraft] = useState<PipelineDefinition | null>(null);
  const prevSelectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (effectiveSelectedId !== prevSelectedIdRef.current) {
      prevSelectedIdRef.current = effectiveSelectedId;
      if (selectedDef) {
        // 切换到已保存的 pipeline → 同步 draft
        setDraft(structuredClone(selectedDef));
      } else if (!effectiveSelectedId) {
        // 明确取消选中（删除后列表为空）→ 清空 draft
        setDraft(null);
      }
      // 若 effectiveSelectedId 有值但 selectedDef 为 null，
      // 说明是 handleNew/handleClone 创建了尚未入库的 blank，
      // draft 已由 handleNew/handleClone 设置好，不覆盖。
    }
  }, [effectiveSelectedId, selectedDef]);

  const isDirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(selectedDef);

  // ── 操作 ────────────────────────────────────────────────────────────────
  function handleNew() {
    const blank = createFromBlank();
    // 先更新 ref，防止 useEffect 误判为「选中切换」而覆盖 draft
    prevSelectedIdRef.current = blank.id;
    setDraft(blank);
    setSelectedId(blank.id);
  }

  function handleClone() {
    if (!selectedDef) return;
    const cloned = clone(selectedDef);
    prevSelectedIdRef.current = cloned.id;
    setDraft(cloned);
    setSelectedId(cloned.id);
  }

  async function handleDelete() {
    if (!effectiveSelectedId) return;
    await remove(effectiveSelectedId);
    setSelectedId(null);
    setDraft(null);
  }

  async function handleSave() {
    if (!draft) return;
    const result = await save(draft);
    if (result.ok) {
      // 确保 selectedId 指向已保存的 id（新建场景 id 不变，clone 也一致）
      setSelectedId(result.def.id);
      setDraft(structuredClone(result.def));
    }
  }

  function handleCancel() {
    setDraft(selectedDef ? structuredClone(selectedDef) : null);
  }

  async function handleSetDefault() {
    if (!effectiveSelectedId) return;
    await setDefault(effectiveSelectedId);
  }

  function handleFromTemplate(tpl: PipelineDefinition) {
    const now = new Date().toISOString();
    const derived: PipelineDefinition = {
      ...tpl,
      id: generateId(),
      name: `${tpl.name}(副本)`,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    prevSelectedIdRef.current = derived.id;
    setDraft(derived);
    setSelectedId(derived.id);
  }

  // ── 加载 / 错误态 ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-dls-secondary">
        <Loader2 size={20} className="animate-spin" />
        <span className="ml-2 text-[13px]">加载流水线…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-red-11">
        <AlertCircle size={16} className="mr-2" />
        <span className="text-[13px]">加载失败：{error}</span>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-0 overflow-hidden rounded-lg border border-dls-border bg-dls-bg-1">
      <PipelineListPanel
        pipelines={pipelines}
        selectedId={effectiveSelectedId}
        onSelect={(id) => { setSelectedId(id); }}
        onNew={handleNew}
        onClone={handleClone}
        onDelete={handleDelete}
      />
      <div className="flex flex-1 flex-col overflow-hidden border-l border-dls-border">
        {draft ? (
          <PipelineEditor
            draft={draft}
            isDirty={isDirty}
            saveStatus={saveStatus}
            saveError={saveError ?? null}
            onChange={setDraft}
            onSave={handleSave}
            onCancel={handleCancel}
            onSetDefault={handleSetDefault}
            agentNames={agentNames}
            skillNames={skillNames}
          />
        ) : (
          <PipelineEmptyState onNew={handleNew} onFromTemplate={handleFromTemplate} />
        )}
      </div>
    </div>
  );
}

// ── PipelineListPanel ───────────────────────────────────────────────────────

function PipelineListPanel({
  pipelines, selectedId, onSelect, onNew, onClone, onDelete,
}: {
  pipelines: PipelineDefinition[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClone: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex w-64 shrink-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 text-[13px] font-medium text-dls-text">
        <span>
          流水线
          <span className="ml-1.5 rounded-full bg-dls-bg-3 px-1.5 py-0.5 text-[11px] text-dls-secondary">
            {pipelines.length}
          </span>
        </span>
        <button type="button" onClick={onNew} title="新建流水线"
          className="rounded p-1 text-dls-secondary transition-colors hover:bg-dls-bg-3 hover:text-dls-text">
          <Plus size={15} />
        </button>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        {pipelines.map((p) => (
          <PipelineRow key={p.id} def={p} selected={p.id === selectedId} onSelect={() => onSelect(p.id)} />
        ))}
        {pipelines.length === 0 && (
          <div className="px-2 py-8 text-center text-[12px] text-dls-secondary">
            暂无流水线，点击 + 新建
          </div>
        )}
      </div>
      <div className="flex gap-1 border-t border-dls-border px-3 py-2">
        <button type="button" onClick={onClone} disabled={!selectedId} title="克隆"
          className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-dls-secondary transition-colors hover:bg-dls-bg-3 hover:text-dls-text disabled:pointer-events-none disabled:opacity-40">
          <Copy size={12} /> 克隆
        </button>
        <button type="button" onClick={onDelete} disabled={!selectedId} title="删除"
          className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-dls-secondary transition-colors hover:bg-dls-bg-3 hover:text-red-11 disabled:pointer-events-none disabled:opacity-40">
          <Trash2 size={12} /> 删除
        </button>
      </div>
    </div>
  );
}

function PipelineRow({ def, selected, onSelect }: {
  def: PipelineDefinition; selected: boolean; onSelect: () => void;
}) {
  return (
    <button type="button" onClick={onSelect}
      className={["w-full rounded-md px-3 py-2.5 text-left transition-colors",
        selected ? "border-l-2 border-green-9 bg-green-2 pl-[10px]"
          : "border-l-2 border-transparent pl-[10px] hover:bg-dls-bg-3"].join(" ")}>
      <div className="flex items-center gap-1.5">
        <span className={`text-[13px] font-medium ${selected ? "text-green-11" : "text-dls-text"}`}>
          {def.name}
        </span>
        {def.isDefault && <Star size={11} className="shrink-0 fill-amber-9 text-amber-9" />}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-dls-secondary">
        <span>{PIPELINE_SCOPE_LABELS[def.scope as PipelineScope] ?? def.scope}</span>
        <span className="opacity-50">·</span>
        <span className="font-mono">/{def.triggerCommand}</span>
      </div>
    </button>
  );
}

// ── PipelineEditor（全量编辑器） ─────────────────────────────────────────────

function PipelineEditor({
  draft, isDirty, saveStatus, saveError, onChange, onSave, onCancel, onSetDefault,
  agentNames, skillNames,
}: {
  draft: PipelineDefinition;
  isDirty: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  saveError: string | null;
  onChange: (def: PipelineDefinition) => void;
  onSave: () => void;
  onCancel: () => void;
  onSetDefault: () => void;
  agentNames: string[];
  skillNames: string[];
}) {
  function updateField<K extends keyof PipelineDefinition>(key: K, value: PipelineDefinition[K]) {
    onChange({ ...draft, [key]: value });
  }

  function updateNode(index: number, node: PipelineNode) {
    const nodes = [...draft.nodes];
    nodes[index] = node;
    onChange({ ...draft, nodes });
  }

  function removeNode(index: number) {
    const nodes = draft.nodes.filter((_, i) => i !== index);
    onChange({ ...draft, nodes });
  }

  function moveNode(index: number, direction: -1 | 1) {
    const nodes = [...draft.nodes];
    const target = index + direction;
    if (target < 0 || target >= nodes.length) return;
    [nodes[index], nodes[target]] = [nodes[target]!, nodes[index]!];
    onChange({ ...draft, nodes });
  }

  function addNode(kind: PipelineNodeKind) {
    const id = `n${Date.now()}`;
    const base: PipelineNode = { id, kind, label: NODE_KIND_LABELS[kind] };
    if (kind === "review") {
      base.reviewers = [...DEFAULT_REVIEWERS];
    }
    onChange({ ...draft, nodes: [...draft.nodes, base] });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-dls-border px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-2">
            <input
              type="text"
              value={draft.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="流水线名称"
              className="w-full rounded-md border border-dls-border bg-dls-bg-1 px-3 py-1.5 text-[14px] font-semibold text-dls-text outline-none ring-0 transition-colors placeholder:text-dls-secondary/50 hover:border-green-7 focus:border-green-8 focus:ring-1 focus:ring-green-7/30"
            />
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[11px] text-dls-secondary">/</span>
              <input
                type="text"
                value={draft.triggerCommand}
                onChange={(e) => updateField("triggerCommand", e.target.value.replace(/^\/+/, "").replace(/\s/g, "-"))}
                placeholder="trigger-command"
                className="w-32 rounded-md border border-dls-border bg-dls-bg-2 px-2 py-1 font-mono text-[11px] text-dls-text outline-none transition-colors hover:border-green-7 focus:border-green-8 focus:ring-1 focus:ring-green-7/30"
              />
              <select
                value={draft.scope}
                onChange={(e) => updateField("scope", e.target.value as PipelineScope)}
                className="rounded-md border border-dls-border bg-dls-bg-2 px-2 py-1 text-[11px] text-dls-secondary outline-none transition-colors hover:border-green-7 focus:border-green-8"
              >
                {SCOPE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              {draft.isDefault ? (
                <span className="flex items-center gap-1 rounded-md bg-amber-3 px-2 py-1 text-[11px] text-amber-11">
                  <Star size={10} className="fill-amber-9 text-amber-9" /> 默认
                </span>
              ) : (
                <button type="button" onClick={onSetDefault}
                  className="flex items-center gap-1 rounded-md border border-dls-border px-2 py-1 text-[11px] text-dls-secondary transition-colors hover:border-amber-7 hover:text-amber-11">
                  <Star size={10} /> 设为默认
                </button>
              )}
            </div>
          </div>
        </div>
        <textarea
          value={draft.description}
          onChange={(e) => updateField("description", e.target.value)}
          placeholder="流水线描述（可选）"
          rows={2}
          className="mt-2 w-full resize-none rounded-md border border-dls-border bg-dls-bg-1 px-3 py-2 text-[12px] text-dls-secondary outline-none transition-colors placeholder:text-dls-secondary/40 hover:border-green-7 focus:border-green-8 focus:ring-1 focus:ring-green-7/30"
        />
      </div>

      {/* 输入字段管理 */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <InputsEditor
          inputs={draft.inputs}
          onChange={(inputs) => updateField("inputs", inputs)}
        />

        {/* 分隔线 */}
        <div className="my-4 flex items-center gap-3">
          <div className="flex-1 border-t border-dls-border" />
          <span className="shrink-0 text-[11px] text-dls-secondary">节点列表（{draft.nodes.length} 个节点）</span>
          <div className="flex-1 border-t border-dls-border" />
        </div>
        <div className="space-y-2">
          {draft.nodes.map((node, i) => (
            <PipelineNodeCard
              key={node.id}
              node={node}
              index={i}
              total={draft.nodes.length}
              onChange={(n) => updateNode(i, n)}
              onRemove={() => removeNode(i)}
              onMoveUp={() => moveNode(i, -1)}
              onMoveDown={() => moveNode(i, 1)}
              agentNames={agentNames}
              skillNames={skillNames}
            />
          ))}
        </div>
        <AddNodeMenu onAdd={addNode} />
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between border-t border-dls-border px-5 py-3">
        <div>
          {saveStatus === "error" && saveError && (
            <span className="flex items-center gap-1 text-[11px] text-red-11">
              <AlertCircle size={12} /> {saveError}
            </span>
          )}
          {saveStatus === "saved" && !isDirty && (
            <span className="flex items-center gap-1 text-[11px] text-green-11">
              <CheckCircle2 size={12} /> 已保存并编译
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <button type="button" onClick={onCancel}
              className="rounded-md px-3 py-1.5 text-[12px] text-dls-secondary transition-colors hover:text-dls-text">
              取消
            </button>
          )}
          <button
            type="button"
            disabled={saveStatus === "saving" || !isDirty}
            onClick={onSave}
            className="rounded-md bg-green-9 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-green-10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveStatus === "saving" ? (
              <span className="flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />保存中…</span>
            ) : "保存并编译"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── PipelineNodeCard ─────────────────────────────────────────────────────────

function PipelineNodeCard({
  node, index, total, onChange, onRemove, onMoveUp, onMoveDown,
  agentNames, skillNames,
}: {
  node: PipelineNode;
  index: number;
  total: number;
  onChange: (n: PipelineNode) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  agentNames: string[];
  skillNames: string[];
}) {
  const [expanded, setExpanded] = useState(true);

  function setField<K extends keyof PipelineNode>(key: K, value: PipelineNode[K]) {
    onChange({ ...node, [key]: value });
  }

  const kindColor = NODE_KIND_COLORS[node.kind] ?? "";

  return (
    <div className={`rounded-lg border bg-dls-bg-1 transition-colors ${kindColor}`}>
      {/* Card Header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* 排序手柄 */}
        <div className="flex shrink-0 flex-col gap-0.5">
          <button type="button" disabled={index === 0} onClick={onMoveUp}
            className="rounded p-0.5 text-dls-secondary/50 hover:text-dls-secondary disabled:opacity-20 disabled:pointer-events-none">
            <ChevronRight size={11} className="-rotate-90" />
          </button>
          <button type="button" disabled={index === total - 1} onClick={onMoveDown}
            className="rounded p-0.5 text-dls-secondary/50 hover:text-dls-secondary disabled:opacity-20 disabled:pointer-events-none">
            <ChevronRight size={11} className="rotate-90" />
          </button>
        </div>
        {/* 序号 */}
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-dls-bg-3 text-[10px] font-medium text-dls-secondary">
          {index + 1}
        </div>
        {/* 类型选择 */}
        <select
          value={node.kind}
          onChange={(e) => setField("kind", e.target.value as PipelineNodeKind)}
          className="rounded border border-dls-border/60 bg-transparent px-1.5 py-0.5 text-[11px] font-medium outline-none"
        >
          {(Object.keys(NODE_KIND_LABELS) as PipelineNodeKind[]).map((k) => (
            <option key={k} value={k}>{NODE_KIND_LABELS[k]}</option>
          ))}
        </select>
        {/* 标签输入 */}
        <input
          type="text"
          value={node.label}
          onChange={(e) => setField("label", e.target.value)}
          placeholder="节点名称"
          className="flex-1 min-w-0 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[13px] font-medium text-dls-text outline-none transition-colors hover:border-dls-border focus:border-green-7"
        />
        {/* 并行标记 */}
        <label className="flex items-center gap-1 text-[11px] text-dls-secondary">
          <input type="checkbox" checked={node.parallel ?? false}
            onChange={(e) => setField("parallel", e.target.checked || undefined)}
            className="h-3 w-3 rounded accent-green-9"
          />
          并行
        </label>
        {/* 展开/收起 */}
        <button type="button" onClick={() => setExpanded(!expanded)}
          className="rounded p-1 text-dls-secondary/50 hover:text-dls-secondary">
          <ChevronDown size={13} className={`transition-transform ${expanded ? "" : "-rotate-90"}`} />
        </button>
        {/* 删除 */}
        <button type="button" onClick={onRemove}
          className="rounded p-1 text-dls-secondary/50 transition-colors hover:text-red-11">
          <X size={13} />
        </button>
      </div>

      {/* Card Body（展开时显示） */}
      {expanded && (
        <div className="border-t border-dls-border/40 px-3 pb-3 pt-2 space-y-2">
          <NodeBodyByKind node={node} onChange={onChange} agentNames={agentNames} skillNames={skillNames} />
          {/* 失败策略 */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-dls-secondary">失败时</span>
            <select
              value={node.onFail ?? "abort"}
              onChange={(e) => setField("onFail", e.target.value as "abort" | "retry" | "skip")}
              className="rounded border border-dls-border bg-dls-bg-2 px-2 py-0.5 text-[11px] text-dls-secondary outline-none"
            >
              <option value="abort">中止</option>
              <option value="retry">重试</option>
              <option value="skip">跳过</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// ── NodeBodyByKind（多态节点正文） ─────────────────────────────────────────────

function NodeBodyByKind({ node, onChange, agentNames, skillNames }: {
  node: PipelineNode;
  onChange: (n: PipelineNode) => void;
  agentNames: string[];
  skillNames: string[];
}) {
  function set<K extends keyof PipelineNode>(key: K, value: PipelineNode[K]) {
    onChange({ ...node, [key]: value });
  }

  switch (node.kind) {
    case "agent":
    case "skill": {
      const refOptions = node.kind === "agent" ? agentNames : skillNames;
      return (
        <div className="space-y-1.5">
          <RefSelectField
            prefix={node.kind === "agent" ? "@" : "/"}
            value={node.ref ?? ""}
            options={refOptions}
            onChange={(v: string) => set("ref", v || undefined)}
            placeholder={node.kind === "agent" ? "agent-name" : "skill-name"}
          />
          <textarea
            value={node.prompt ?? ""}
            onChange={(e) => set("prompt", e.target.value || undefined)}
            placeholder={`指令模板（支持 goal inputs.xxx prev.output）`}
            rows={3}
            className="w-full resize-none rounded border border-dls-border bg-dls-bg-2 px-2 py-1.5 text-[11px] text-dls-secondary outline-none transition-colors placeholder:opacity-50 focus:border-green-7 focus:text-dls-text"
          />
        </div>
      );
    }
    case "review":
      return (
        <div className="space-y-1.5">
          <div className="text-[11px] text-dls-secondary mb-1">评审者（逗号分隔）</div>
          <input
            type="text"
            value={(node.reviewers ?? DEFAULT_REVIEWERS).join(", ")}
            onChange={(e) => set("reviewers", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            placeholder="spec-reviewer, code-quality-reviewer"
            className="w-full rounded border border-dls-border bg-dls-bg-2 px-2 py-1 font-mono text-[11px] text-dls-text outline-none transition-colors focus:border-amber-7"
          />
        </div>
      );
    case "human_approval":
      return (
        <div className="space-y-1.5">
          <textarea
            value={node.approvalPrompt ?? ""}
            onChange={(e) => set("approvalPrompt", e.target.value || undefined)}
            placeholder="审批提示（用户看到后勾选 Todo 继续）"
            rows={2}
            className="w-full resize-none rounded border border-dls-border bg-dls-bg-2 px-2 py-1.5 text-[11px] text-dls-secondary outline-none transition-colors placeholder:opacity-50 focus:border-green-7 focus:text-dls-text"
          />
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-dls-secondary">超时（分钟）</span>
            <input
              type="number"
              min={0}
              value={node.timeoutMinutes ?? ""}
              onChange={(e) => set("timeoutMinutes", e.target.value ? Number(e.target.value) : undefined)}
              placeholder="不限"
              className="w-20 rounded border border-dls-border bg-dls-bg-2 px-2 py-0.5 text-[11px] text-dls-text outline-none transition-colors focus:border-green-7"
            />
          </div>
        </div>
      );
    case "branch":
      return (
        <div className="space-y-1.5">
          <div>
            <div className="mb-1 text-[11px] text-dls-secondary">条件表达式</div>
            <input
              type="text"
              value={node.branchCondition ?? ""}
              onChange={(e) => set("branchCondition", e.target.value || undefined)}
              placeholder="prev.output.includes('approved')"
              className="w-full rounded border border-dls-border bg-dls-bg-2 px-2 py-1 font-mono text-[11px] text-dls-text outline-none transition-colors focus:border-purple-7"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <div className="mb-1 text-[10px] text-green-11">✓ true → 跳转节点 ID</div>
              <input type="text" value={node.branchTrueTargetId ?? ""}
                onChange={(e) => set("branchTrueTargetId", e.target.value || undefined)}
                placeholder="node-id"
                className="w-full rounded border border-dls-border bg-dls-bg-2 px-2 py-0.5 font-mono text-[11px] text-dls-text outline-none transition-colors focus:border-green-7"
              />
            </div>
            <div className="flex-1">
              <div className="mb-1 text-[10px] text-red-11">✗ false → 跳转节点 ID</div>
              <input type="text" value={node.branchFalseTargetId ?? ""}
                onChange={(e) => set("branchFalseTargetId", e.target.value || undefined)}
                placeholder="node-id"
                className="w-full rounded border border-dls-border bg-dls-bg-2 px-2 py-0.5 font-mono text-[11px] text-dls-text outline-none transition-colors focus:border-red-7"
              />
            </div>
          </div>
        </div>
      );
    default:
      return null;
  }
}

// ── RefSelectField — 下拉选择 + 手动输入双模式 ────────────────────────────────────────────────────

/**
 * 支持从已知列表中选择，也支持“手动输入…”降级到文本框。
 * options 为空时直接显示文本框（等待加载或未配置 listAgents 时）。
 */
function RefSelectField({
  prefix,
  value,
  options,
  onChange,
  placeholder,
}: {
  prefix: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const MANUAL = "__manual__";
  // 当前值不在选项列表中（且非空）时，自动进入手动模式
  const isCustom = value !== "" && !options.includes(value);
  const [showManual, setShowManual] = useState(isCustom);

  // options 确定前降级为文本框
  if (options.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] text-dls-secondary">{prefix}</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded border border-dls-border bg-dls-bg-2 px-2 py-1 font-mono text-[11px] text-dls-text outline-none transition-colors focus:border-green-7"
        />
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[11px] text-dls-secondary">{prefix}</span>
        <select
          value={showManual ? MANUAL : (value || "")}
          onChange={(e) => {
            if (e.target.value === MANUAL) {
              setShowManual(true);
            } else {
              setShowManual(false);
              onChange(e.target.value);
            }
          }}
          className="flex-1 rounded border border-dls-border bg-dls-bg-2 px-2 py-1 font-mono text-[11px] text-dls-text outline-none transition-colors focus:border-green-7"
        >
          <option value="">请选择…</option>
          {options.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
          <option value={MANUAL}>手动输入…</option>
        </select>
      </div>
      {showManual && (
        <div className="flex items-center gap-2">
          {/* 占位，与上面 prefix 对齐 */}
          <span className="shrink-0 text-[11px] opacity-0">{prefix}</span>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            className="flex-1 rounded border border-dls-border bg-dls-bg-2 px-2 py-1 font-mono text-[11px] text-dls-text outline-none transition-colors focus:border-green-7"
          />
        </div>
      )}
    </div>
  );
}

// ── InputsEditor ──────────────────────────────────────────────────────────────────

const INPUT_FIELD_TYPE_LABELS: Record<PipelineInputFieldType, string> = {
  text: "单行文本",
  textarea: "多行文本",
  enum: "下拉单选",
  "file-picker": "文件选择",
  "knowledge-ref": "知识库",
  date: "日期",
};

function InputsEditor({
  inputs,
  onChange,
}: {
  inputs: PipelineInputField[];
  onChange: (inputs: PipelineInputField[]) => void;
}) {
  function addInput() {
    const newField: PipelineInputField = {
      key: `field_${Date.now().toString(36)}`,
      label: "新字段",
      type: "text",
      required: false,
    };
    onChange([...inputs, newField]);
  }

  function updateInput(index: number, field: PipelineInputField) {
    const next = [...inputs];
    next[index] = field;
    onChange(next);
  }

  function removeInput(index: number) {
    onChange(inputs.filter((_, i) => i !== index));
  }

  return (
    <div className="mb-2">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-medium text-dls-secondary">
          启动参数（{inputs.length} 个）
        </span>
        <button
          type="button"
          onClick={addInput}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-dls-secondary hover:bg-dls-bg-3 hover:text-dls-text"
        >
          <Plus size={11} /> 添加
        </button>
      </div>
      {inputs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-dls-border px-3 py-2 text-[11px] text-dls-secondary">
          无启动参数（默认仅收集「这次要做什么」目标文本）
        </p>
      ) : (
        <div className="space-y-1.5">
          {inputs.map((field, i) => (
            <InputFieldEditor
              key={field.key}
              field={field}
              onChange={(f) => updateInput(i, f)}
              onRemove={() => removeInput(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InputFieldEditor({
  field,
  onChange,
  onRemove,
}: {
  field: PipelineInputField;
  onChange: (f: PipelineInputField) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  function set<K extends keyof PipelineInputField>(key: K, value: PipelineInputField[K]) {
    onChange({ ...field, [key]: value });
  }

  return (
    <div className="rounded-lg border border-dls-border/60 bg-dls-bg-2">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-dls-secondary/50 hover:text-dls-secondary"
        >
          <ChevronRight size={12} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
        <select
          value={field.type}
          onChange={(e) => set("type", e.target.value as PipelineInputFieldType)}
          className="rounded border border-dls-border bg-dls-bg-1 px-1.5 py-0.5 text-[10px] text-dls-secondary outline-none"
        >
          {(Object.keys(INPUT_FIELD_TYPE_LABELS) as PipelineInputFieldType[]).map((t) => (
            <option key={t} value={t}>{INPUT_FIELD_TYPE_LABELS[t]}</option>
          ))}
        </select>
        <input
          type="text"
          value={field.label}
          onChange={(e) => set("label", e.target.value)}
          placeholder="字段标签"
          className="flex-1 min-w-0 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[12px] font-medium text-dls-text outline-none hover:border-dls-border focus:border-green-7"
        />
        <label className="flex items-center gap-1 text-[10px] text-dls-secondary">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => set("required", e.target.checked)}
            className="h-3 w-3 accent-green-9"
          />
          必填
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-0.5 text-dls-secondary/40 hover:text-red-11"
        >
          <X size={12} />
        </button>
      </div>
      {expanded && (
        <div className="border-t border-dls-border/40 px-3 py-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[10px] text-dls-secondary">key</span>
            <input
              type="text"
              value={field.key}
              onChange={(e) => set("key", e.target.value.replace(/\s/g, "_"))}
              className="flex-1 rounded border border-dls-border bg-dls-bg-1 px-2 py-0.5 font-mono text-[10px] text-dls-text outline-none focus:border-green-7"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[10px] text-dls-secondary">placeholder</span>
            <input
              type="text"
              value={field.placeholder ?? ""}
              onChange={(e) => set("placeholder", e.target.value || undefined)}
              className="flex-1 rounded border border-dls-border bg-dls-bg-1 px-2 py-0.5 text-[10px] text-dls-text outline-none focus:border-green-7"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[10px] text-dls-secondary">默认值</span>
            <input
              type="text"
              value={field.default ?? ""}
              onChange={(e) => set("default", e.target.value || undefined)}
              className="flex-1 rounded border border-dls-border bg-dls-bg-1 px-2 py-0.5 text-[10px] text-dls-text outline-none focus:border-green-7"
            />
          </div>
          {field.type === "enum" && (
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[10px] text-dls-secondary">选项（逗号分隔）</span>
              <input
                type="text"
                value={(field.options ?? []).join(", ")}
                onChange={(e) => set("options", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                placeholder="选项A, 选项B, 选项C"
                className="flex-1 rounded border border-dls-border bg-dls-bg-1 px-2 py-0.5 text-[10px] text-dls-text outline-none focus:border-green-7"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── AddNodeMenu ───────────────────────────────────────────────────────────────

function AddNodeMenu({ onAdd }: { onAdd: (kind: PipelineNodeKind) => void }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleToggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuStyle({
        position: "fixed",
        bottom: `${window.innerHeight - rect.top + 4}px`,
        left: `${rect.left + rect.width / 2}px`,
        transform: "translateX(-50%)",
        zIndex: 9999,
      });
    }
    setOpen((v) => !v);
  }

  return (
    <div className="relative mt-3">
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-dls-border py-2.5 text-[12px] text-dls-secondary transition-colors hover:border-green-7 hover:text-green-11"
      >
        <Plus size={13} /> 添加节点
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className="rounded-lg border border-dls-border bg-dls-surface shadow-lg"
        >
          <div className="p-1">
            {(Object.entries(NODE_KIND_LABELS) as [PipelineNodeKind, string][]).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => { onAdd(kind); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[12px] text-dls-text transition-colors hover:bg-dls-bg-3"
              >
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium border ${NODE_KIND_COLORS[kind]}`}>
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── 空态 ─────────────────────────────────────────────────────────────────────

function PipelineEmptyState({
  onNew,
  onFromTemplate,
}: {
  onNew: () => void;
  onFromTemplate: (tpl: PipelineDefinition) => void;
}) {
  const [showTemplates, setShowTemplates] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowTemplates(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-dls-bg-3">
        <Workflow size={26} className="text-dls-secondary" />
      </div>
      <div>
        <p className="text-[14px] font-medium text-dls-text">选择或新建一个流水线</p>
        <p className="mt-1 text-[12px] text-dls-secondary">
          流水线让你把重复的 AI 协作节点保存为可一键触发的模板
        </p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onNew}
          className="flex items-center gap-1.5 rounded-lg bg-green-9 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-green-10">
          <Plus size={14} /> 新建流水线
        </button>
        <div ref={ref} className="relative">
          <button
            type="button"
            onClick={() => setShowTemplates(!showTemplates)}
            className="flex items-center gap-1.5 rounded-lg border border-dls-border px-4 py-2 text-[13px] text-dls-secondary transition-colors hover:bg-dls-bg-3 hover:text-dls-text"
          >
            <Settings size={14} /> 从模板创建
            <ChevronDown size={12} className={`transition-transform ${showTemplates ? "rotate-180" : ""}`} />
          </button>
          {showTemplates && (
            <div className="absolute bottom-full left-0 mb-1 w-64 rounded-lg border border-dls-border bg-dls-surface shadow-xl">
              <div className="max-h-72 overflow-y-auto p-1">
                {DEFAULT_PIPELINE_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => { onFromTemplate(tpl); setShowTemplates(false); }}
                    className="flex w-full flex-col items-start rounded-md px-3 py-2 text-left transition-colors hover:bg-dls-bg-3"
                  >
                    <span className="text-[12px] font-medium text-dls-text">{tpl.name}</span>
                    <span className="mt-0.5 text-[11px] text-dls-secondary">
                      {PIPELINE_SCOPE_LABELS[tpl.scope]} · {tpl.nodes.length} 个节点
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
