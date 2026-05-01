import type { OpenworkServerClient } from "../../../../../app/lib/openwork-server";
import type { DirGraph, DirGraphNodes, ValidationWarning } from "../types/dir-graph";
import { readFile } from "./fs-primitives";

export const DIR_GRAPH_FILENAME = "dir-graph.yaml";
export const DIR_GRAPH_PATH = `.xingjing/${DIR_GRAPH_FILENAME}`;

export const DEFAULT_DIR_GRAPH: DirGraph = {
  schema: "xingjing.dir-graph/v1",
  workspace: { root: ".", timezone: "Asia/Shanghai" },
  nodes: {
    product:    { kind: "live-doc",     path: "product",          index: "product/_index.yml", writable: true },
    features:   { kind: "feature-tree", path: "product/features", feature_key: "feature" },
    iterations: { kind: "incremental",  path: "iterations",       buckets: ["hypotheses", "tasks", "releases", "archive"] },
    knowledge:  { kind: "personal-kb",  path: "knowledge",        index: "knowledge/_index.yml" },
    runtime:    { kind: "runtime-yml",  files: ["focus.yml", "metrics.yml", "adrs.yml", "feature-flags.yml"] },
  },
  conventions: {
    naming: {
      feature:    "{slug}/PRD.md|SDD.md",
      hypothesis: "H-{yyyymmdd}-{slug}.md",
      task:       "T-{id}-{slug}.md",
    },
    frontmatter_required: ["id", "feature", "status", "created_at", "updated_at"],
  },
  context_injection: {
    budget_bytes: 16384,
    order: ["focus", "active_feature_head", "active_iteration_todo", "recent_audit"],
  },
};

// ── 内置轻量 YAML 解析器（零外部依赖）──────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type YamlValue = string | number | boolean | null | Record<string, any> | any[];
type YamlObject = Record<string, YamlValue>;

function stripLineComment(line: string): string {
  let inQuote = false; let quoteChar = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (!inQuote && (ch === '"' || ch === "'")) { inQuote = true; quoteChar = ch; }
    else if (inQuote && ch === quoteChar) { inQuote = false; }
    else if (!inQuote && ch === "#" && (i === 0 || line[i - 1] === " " || line[i - 1] === "\t")) {
      return line.slice(0, i);
    }
  }
  return line;
}

function findFirstColon(trimmed: string): number {
  let inQuote = false; let quoteChar = ""; let depth = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (!inQuote && (ch === '"' || ch === "'")) { inQuote = true; quoteChar = ch; }
    else if (inQuote && ch === quoteChar) { inQuote = false; }
    else if (!inQuote && (ch === "{" || ch === "[")) depth++;
    else if (!inQuote && (ch === "}" || ch === "]")) depth--;
    else if (!inQuote && depth === 0 && ch === ":" &&
      (i + 1 >= trimmed.length || trimmed[i + 1] === " " || trimmed[i + 1] === "\t")) {
      return i;
    }
  }
  return -1;
}

function splitFlowItems(s: string): string[] {
  const items: string[] = []; let depth = 0, inQ = false, qc = "", start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (!inQ && (ch === '"' || ch === "'")) { inQ = true; qc = ch; }
    else if (inQ && ch === qc) { inQ = false; }
    else if (!inQ && (ch === "{" || ch === "[")) depth++;
    else if (!inQ && (ch === "}" || ch === "]")) depth--;
    else if (!inQ && depth === 0 && ch === ",") { items.push(s.slice(start, i)); start = i + 1; }
  }
  items.push(s.slice(start)); return items;
}

function parseScalar(s: string): YamlValue {
  const v = s.trim();
  if (!v || v === "~") return null;
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    return inner ? splitFlowItems(inner).map((i) => parseScalar(i.trim())) : [];
  }
  if (v.startsWith("{") && v.endsWith("}")) {
    const inner = v.slice(1, -1).trim(); const obj: YamlObject = {};
    if (inner) for (const pair of splitFlowItems(inner)) {
      const ci = pair.indexOf(":"); if (ci === -1) continue;
      obj[pair.slice(0, ci).trim()] = parseScalar(pair.slice(ci + 1).trim());
    }
    return obj;
  }
  if (v === "true") return true; if (v === "false") return false;
  if (v === "null") return null;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d+\.\d+$/.test(v)) return parseFloat(v);
  return v;
}

export function parseSimpleYaml(text: string): YamlObject {
  const lines = text.split("\n");
  const root: YamlObject = {};
  const stack: Array<{ keyIndent: number; obj: YamlObject }> = [{ keyIndent: -2, obj: root }];
  for (const raw of lines) {
    const stripped = stripLineComment(raw); const trimmed = stripped.trim();
    if (!trimmed) continue;
    const indent = stripped.length - stripped.trimStart().length;
    const colonIdx = findFirstColon(trimmed);
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    const valueStr = trimmed.slice(colonIdx + 1).trim();
    while (stack.length > 1 && stack[stack.length - 1].keyIndent >= indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    if (!valueStr) {
      const child: YamlObject = {}; parent[key] = child;
      stack.push({ keyIndent: indent, obj: child });
    } else { parent[key] = parseScalar(valueStr); }
  }
  return root;
}

// ── deep-merge + 公共 API ───────────────────────────────────────────────────

function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const key of Object.keys(source) as Array<keyof T>) {
    const sv = source[key]; const tv = target[key];
    if (sv !== null && sv !== undefined && typeof sv === "object" && !Array.isArray(sv) &&
        typeof tv === "object" && tv !== null && !Array.isArray(tv)) {
      result[key] = deepMerge(tv as Record<string, unknown>, sv as Record<string, unknown>) as T[typeof key];
    } else if (sv !== undefined) { result[key] = sv as T[typeof key]; }
  }
  return result;
}

export async function loadDirGraph(
  client: OpenworkServerClient,
  workspaceId: string,
): Promise<DirGraph> {
  try {
    const result = await client.readWorkspaceFile(workspaceId, DIR_GRAPH_PATH);
    const parsed = parseSimpleYaml(result.content) as unknown as Partial<DirGraph>;
    return defaultMerge(parsed, DEFAULT_DIR_GRAPH);
  } catch {
    return { ...DEFAULT_DIR_GRAPH };
  }
}

export function defaultMerge(user: Partial<DirGraph>, defaults: DirGraph): DirGraph {
  return deepMerge(defaults, user) as unknown as DirGraph;
}

export function validateDirGraph(graph: DirGraph): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  if (graph.schema !== "xingjing.dir-graph/v1")
    warnings.push({ field: "schema", message: `未知 schema 版本 "${graph.schema}"` });
  if (!graph.nodes || Object.keys(graph.nodes).length === 0)
    warnings.push({ field: "nodes", message: "nodes 为空" });
  if (!graph.context_injection?.budget_bytes || graph.context_injection.budget_bytes <= 0)
    warnings.push({ field: "context_injection.budget_bytes", message: "budget_bytes 必须为正整数" });
  if (!Array.isArray(graph.context_injection?.order) || graph.context_injection.order.length === 0)
    warnings.push({ field: "context_injection.order", message: "order 为空，将跳过上下文注入" });
  return warnings;
}

export function resolveNodePath(graph: DirGraph, nodeKey: string): string | undefined {
  const node = graph.nodes[nodeKey];
  if (!node || nodeKey === "openwork_native") return undefined;
  if ("path" in node && typeof node.path === "string") return node.path;
  if ("files" in node) return ".";
  return undefined;
}

export function serializeDirGraphTemplate(): string {
  return `# dir-graph.yaml — 星静 workspace 知识目录规约（默认模板，可自定义）
schema: "xingjing.dir-graph/v1"
workspace:
  root: "."
  timezone: "Asia/Shanghai"

nodes:
  product:
    kind: live-doc
    path: product
    index: product/_index.yml
    writable: true
  features:
    kind: feature-tree
    path: product/features
    feature_key: feature
  iterations:
    kind: incremental
    path: iterations
    buckets: [hypotheses, tasks, releases, archive]
  knowledge:
    kind: personal-kb
    path: knowledge
    index: knowledge/_index.yml
  runtime:
    kind: runtime-yml
    files: [focus.yml, metrics.yml, adrs.yml, feature-flags.yml]

context_injection:
  budget_bytes: 16384
  order: [focus, active_feature_head, active_iteration_todo, recent_audit]
`;
}

// suppress unused import warning for DirGraphNodes (used via DEFAULT_DIR_GRAPH type)
const _: DirGraphNodes = DEFAULT_DIR_GRAPH.nodes;
void _;
