/** @jsxImportSource react */
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  GitBranch,
  MessageSquare,
  Search,
  Send,
  X,
  Bot,
  Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { OpenworkServerClient } from "../../../../app/lib/openwork-server";
import type { DirGraph, DirGraphNode } from "../workspace-knowledge/types/dir-graph";
import { loadDirGraph } from "../workspace-knowledge/services/dir-graph-loader";
import { readFile } from "../workspace-knowledge/services/fs-primitives";

// ── Types ────────────────────────────────────────────────────────────────────

export interface KnowledgeBasePageProps {
  openworkServerClient: OpenworkServerClient | null | undefined;
  workspaceId: string | null | undefined;
}

type TreeNode = {
  id: string;
  name: string;
  type: "file" | "dir";
  path: string;
  isGitRepo?: boolean;
  dirGraphNodeKey?: string;
  nodeKind?: DirGraphNode["kind"];
  docRole?: string;
  docStatus?: string;
  isReadonly?: boolean;
  children?: TreeNode[];
};

type RightMode = "browser" | "search" | "ai-qa";

type AiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
};

// ── Node kind → visual config ────────────────────────────────────────────────

type NodeKindMeta = {
  label: string;
  icon: LucideIcon;
  bgClass: string;
  textClass: string;
};

const NODE_KIND_META: Record<string, NodeKindMeta> = {
  "personal-kb":  { label: "知识文档", icon: BookOpen,    bgClass: "bg-blue-2",   textClass: "text-blue-9" },
  "live-doc":     { label: "产品文档", icon: BookOpen,    bgClass: "bg-green-2",  textClass: "text-green-9" },
  "feature-tree": { label: "特性",     icon: Folder,      bgClass: "bg-purple-2", textClass: "text-purple-9" },
  "incremental":  { label: "迭代",     icon: Folder,      bgClass: "bg-orange-2", textClass: "text-orange-9" },
  "runtime-yml":  { label: "运行时",   icon: File,        bgClass: "bg-gray-2",   textClass: "text-gray-8" },
};

const DOC_ROLE_META: Record<string, { bgClass: string; textClass: string }> = {
  PRD:      { bgClass: "bg-green-2",  textClass: "text-green-9" },
  SDD:      { bgClass: "bg-blue-2",   textClass: "text-blue-9" },
  ADR:      { bgClass: "bg-amber-2",  textClass: "text-amber-9" },
  RESEARCH: { bgClass: "bg-teal-2",   textClass: "text-teal-9" },
  GUIDE:    { bgClass: "bg-gray-2",   textClass: "text-gray-8" },
  OPS:      { bgClass: "bg-gray-2",   textClass: "text-gray-8" },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function docRoleFromFileName(name: string): string | undefined {
  const lower = name.toLowerCase();
  if (lower === "spec.md" || lower.includes("prd")) return "PRD";
  if (lower === "plan.md" || lower.includes("sdd")) return "SDD";
  if (lower.startsWith("adr-")) return "ADR";
  if (lower === "tech-research.md" || lower.includes("research")) return "RESEARCH";
  if (lower.includes("guide")) return "GUIDE";
  if (lower.includes("deploy") || lower.includes("ops")) return "OPS";
  return undefined;
}

function docStatusFromContent(content: string | null): string | undefined {
  if (!content) return undefined;
  const m = content.match(/^---[\s\S]*?status:\s*(\S+)[\s\S]*?---/);
  return m ? m[1] : undefined;
}

function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      result.push(n);
      if (n.children) walk(n.children);
    }
  };
  walk(nodes);
  return result;
}

// ── useKnowledgeTree hook ────────────────────────────────────────────────────
// 注意：直接使用传入的 wsId，不依赖 store 中的 activeWorkspaceId（该字段目前未被设置）

function useKnowledgeTree(
  owClient: OpenworkServerClient | null | undefined,
  wsId: string | null | undefined,
) {
  return useQuery<TreeNode[]>({
    queryKey: ["xj", "wk", wsId, "knowledge-tree"],
    queryFn: async () => {
      if (!owClient || !wsId) return [];
      const graph = await loadDirGraph(owClient, wsId);
      return buildTreeFromDirGraph(owClient, wsId, graph);
    },
    enabled: !!owClient && !!wsId,
    staleTime: 30_000,
  });
}

async function buildTreeFromDirGraph(
  client: OpenworkServerClient,
  wsId: string,
  graph: DirGraph,
): Promise<TreeNode[]> {
  // 优先走通用字段探测（支持任意 dir-graph 格式）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (graph as any)._raw;
  if (raw && typeof raw === "object") {
    return buildGenericTree(client, wsId, raw as Record<string, unknown>);
  }

  // fallback: 原有 v1 nodes 逻辑
  const nodes = graph.nodes;
  const rootIsGit = (await readFile(client, wsId, ".git/HEAD")) !== null;
  const children: TreeNode[] = [];

  for (const [key, node] of Object.entries(nodes)) {
    if (!node || typeof node !== "object" || !("kind" in node)) continue;
    const dgNode = node as DirGraphNode;
    const treeNodes = await buildNodeChildren(client, wsId, key, dgNode);
    children.push(...treeNodes);
  }

  // Add a root node wrapping everything
  return [
    {
      id: "root",
      name: "workspace",
      type: "dir",
      path: ".",
      isGitRepo: rootIsGit,
      children,
    },
  ];
}

// 通用文档文件尝试（spec.md / plan.md + 历史兼容名）
async function tryReadCommonDocs(
  client: OpenworkServerClient,
  wsId: string,
  dirPath: string,
): Promise<TreeNode[]> {
  const results: TreeNode[] = [];
  for (const f of ["spec.md", "plan.md", "PRD.md", "SDD.md", "tech-research.md"]) {
    if (await readFile(client, wsId, `${dirPath}/${f}`)) {
      results.push({
        id: `file-${dirPath}/${f}`,
        name: f.replace(/\.md$/, ""),
        type: "file",
        path: `${dirPath}/${f}`,
        docRole: docRoleFromFileName(f),
      });
    }
  }
  return results;
}

// ── YAML 台账解析（格式: key: [{id, path?, ...}]）───────────────────────────
type YamlEntry = { id: string; path?: string };

function parseYamlListEntries(content: string): YamlEntry[] {
  const entries: YamlEntry[] = [];
  let current: YamlEntry | null = null;
  for (const line of content.split("\n")) {
    // 列表项起始：`  - id: some-id`
    const idMatch = line.match(/^\s+-\s+id:\s*(\S+)/);
    if (idMatch) {
      if (current) entries.push(current);
      current = { id: idMatch[1] };
      continue;
    }
    // 路径字段：`    path: ./filename.md` 或 `    path: filename.md`
    if (current) {
      const pathMatch = line.match(/^\s+path:\s*\.?\/?(\S+)/);
      if (pathMatch) current.path = pathMatch[1];
    }
  }
  if (current) entries.push(current);
  return entries;
}

// 通用脚本型探测树构建（不依赖 schema 版本）
async function buildGenericTree(
  client: OpenworkServerClient,
  wsId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: Record<string, any>,
): Promise<TreeNode[]> {
  // 跳过纯元数据 key
  const META_KEYS = new Set([
    "schema", "workspace", "conventions", "context_injection",
    "agent_hints", "query-capabilities", "constraints", "doc-types", "archive",
  ]);

  const children: TreeNode[] = [];

  for (const [key, section] of Object.entries(raw)) {
    if (META_KEYS.has(key)) continue;
    if (!section || typeof section !== "object" || Array.isArray(section)) continue;
    const s = section as Record<string, unknown>;

    // ── Case A: 有 root 字段 → 目录型节点 ──────────────────────────────
    if (typeof s.root === "string") {
      const basePath = s.root.replace(/\/$/, "");
      const sectionChildren: TreeNode[] = [];

      // A1: 有 index 文件 → 解析索引得到子条目
      if (typeof s.index === "string") {
        const isYamlIndex = /\.(yml|yaml)$/i.test(s.index);
        const indexContent = await readFile(client, wsId, s.index);
        if (indexContent) {
          if (isYamlIndex) {
            // YAML 格式：提取 `- id:` 条目，每个 id 对应 basePath 下的特性目录
            for (const entry of parseYamlListEntries(indexContent)) {
              const entryPath = `${basePath}/${entry.id}`;
              const docChildren = await tryReadCommonDocs(client, wsId, entryPath);
              sectionChildren.push({
                id: `dir-${entryPath}`,
                name: entry.id,
                type: "dir",
                path: entryPath,
                children: docChildren,
              });
            }
          } else {
            // Markdown 格式：表格行 或 列表行
            // 已知表头关键字，跳过
            const TABLE_HEADER_WORDS = new Set(["slug", "id", "name", "status", "scope", "version", "feature"]);
            for (const line of indexContent.split("\n")) {
              // 跳过表格分隔行
              if (/^\|[-:\s|]+\|/.test(line)) continue;
              // 匹配表格第一列（小写英文 slug）
              const tableMatch = line.match(/^\|\s*([a-z][a-z0-9-]+)\s*\|/);
              if (tableMatch) {
                const slug = tableMatch[1].trim();
                if (TABLE_HEADER_WORDS.has(slug)) continue; // 跳过表头
                const entryPath = `${basePath}/${slug}`;
                const docChildren = await tryReadCommonDocs(client, wsId, entryPath);
                sectionChildren.push({
                  id: `dir-${entryPath}`,
                  name: slug,
                  type: "dir",
                  path: entryPath,
                  children: docChildren,
                });
                continue;
              }
              // 匹配列表项（- filename 或 - path/to/file.md）
              const listMatch = line.match(/^[-*]\s+(.+\.md)/);
              if (listMatch) {
                const filePath = listMatch[1].trim();
                const name = filePath.split("/").pop()!.replace(/\.md$/, "");
                sectionChildren.push({
                  id: `file-${filePath}`,
                  name,
                  type: "file",
                  path: filePath,
                  docRole: docRoleFromFileName(filePath),
                });
              }
            }
          }
        }
      }

      // A2: 有 buckets 对象 → 每个 bucket 作为子目录
      if (s.buckets && typeof s.buckets === "object" && !Array.isArray(s.buckets)) {
        for (const [bKey, bVal] of Object.entries(s.buckets as Record<string, unknown>)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const bPath = typeof (bVal as any)?.path === "string"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? (bVal as any).path.replace(/\/$/, "")
            : `${basePath}/${bKey}`;
          sectionChildren.push({
            id: `dir-${bPath}`,
            name: bKey,
            type: "dir",
            path: bPath,
            children: [],
          });
        }
      }

      // A3: 有 subdirs 对象 → 每个 subdir 作为子目录
      if (s.subdirs && typeof s.subdirs === "object" && !Array.isArray(s.subdirs)) {
        for (const [, sdVal] of Object.entries(s.subdirs as Record<string, unknown>)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sdAny = sdVal as any;
          const sdPath = typeof sdAny?.path === "string"
            ? sdAny.path.replace(/\/$/, "")
            : "";
          if (!sdPath) continue;
          const name = sdPath.split("/").pop() ?? sdPath;

          // 如果 subdir 自带 index 字段，读取并解析为文件子节点
          let subChildren: TreeNode[] = [];
          if (typeof sdAny?.index === "string") {
            const subIndexContent = await readFile(client, wsId, sdAny.index);
            if (subIndexContent) {
              for (const entry of parseYamlListEntries(subIndexContent)) {
                // 优先用 path 字段，否则用 id.md
                const filePath = entry.path
                  ? `${sdPath}/${entry.path.replace(/^\.\//, "")}`
                  : `${sdPath}/${entry.id}.md`;
                subChildren.push({
                  id: `file-${filePath}`,
                  name: entry.id,
                  type: "file",
                  path: filePath,
                  docRole: docRoleFromFileName(filePath),
                });
              }
            }
          }

          sectionChildren.push({
            id: `dir-${sdPath}`,
            name,
            type: "dir",
            path: sdPath,
            children: subChildren,
          });
        }
      }

      children.push({
        id: `section-${key}`,
        name: key,
        type: "dir",
        path: basePath,
        children: sectionChildren,
      });
      continue;
    }

    // ── Case B: 有 files 数组 → 运行时文件列表 ───────────────────────
    if (Array.isArray(s.files)) {
      const fileNodes = s.files.map((f: unknown) => {
        const fp = String(f);
        return {
          id: `file-${fp}`,
          name: fp.split("/").pop() ?? fp,
          type: "file" as const,
          path: fp,
        };
      });
      children.push({
        id: `section-${key}`,
        name: key,
        type: "dir",
        path: ".",
        children: fileNodes,
      });
    }
  }

  return [{ id: "root", name: "workspace", type: "dir", path: ".", children }];
}

async function buildNodeChildren(
  client: OpenworkServerClient,
  wsId: string,
  key: string,
  node: DirGraphNode,
): Promise<TreeNode[]> {
  const kind = node.kind;

  if (kind === "personal-kb") {
    return [await buildPersonalKbNode(client, wsId, key, node)];
  }
  if (kind === "live-doc") {
    return [await buildLiveDocNode(client, wsId, key, node)];
  }
  if (kind === "feature-tree") {
    return [await buildFeatureTreeNode(client, wsId, key, node)];
  }
  if (kind === "incremental") {
    return [await buildIncrementalNode(client, wsId, key, node)];
  }
  if (kind === "runtime-yml") {
    return [buildRuntimeYmlNode(key, node)];
  }

  // Unknown kind — show as plain directory
  const path = "path" in node ? (node as { path: string }).path : key;
  const isGit = (await readFile(client, wsId, `${path}/.git/HEAD`)) !== null;
  return [
    {
      id: `node-${key}`,
      name: key,
      type: "dir",
      path,
      isGitRepo: isGit,
      dirGraphNodeKey: key,
      children: [],
    },
  ];
}

async function buildPersonalKbNode(
  client: OpenworkServerClient,
  wsId: string,
  key: string,
  node: DirGraphNode & { path: string; index?: string },
): Promise<TreeNode> {
  const basePath = node.path;
  const isGit = (await readFile(client, wsId, `${basePath}/.git/HEAD`)) !== null;
  const children: TreeNode[] = [];

  // Try reading index file
  const indexPath = node.index ?? `${basePath}/_index.yml`;
  let indexContent = await readFile(client, wsId, indexPath);

  // Fallback: try .md extension if .yml fails
  if (!indexContent && indexPath.endsWith(".yml")) {
    indexContent = await readFile(client, wsId, indexPath.replace(/\.yml$/, ".md"));
  }

  if (indexContent) {
    // Parse entries from index content
    for (const line of indexContent.split("\n")) {
      const m = line.match(/^[-*]\s+(.+)/);
      if (m) {
        const entry = m[1].trim();
        const entryPath = `${basePath}/${entry.endsWith(".md") ? entry : entry + ".md"}`;
        children.push({
          id: `file-${entryPath}`,
          name: entry.replace(/\.md$/, ""),
          type: "file",
          path: entryPath,
          docRole: docRoleFromFileName(entry),
        });
      }
      // Also match YAML-style entries: id: xxx
      const yamlMatch = line.match(/^-\s+id:\s*(\S+)/);
      if (yamlMatch) {
        const entryId = yamlMatch[1];
        const entryPath = `${basePath}/${entryId}.md`;
        children.push({
          id: `file-${entryPath}`,
          name: entryId,
          type: "file",
          path: entryPath,
          docRole: docRoleFromFileName(entryId),
        });
      }
    }
  }

  // If no children from index, try reading common files
  if (children.length === 0) {
    for (const candidate of ["overview.md", "README.md", "index.md"]) {
      const content = await readFile(client, wsId, `${basePath}/${candidate}`);
      if (content) {
        children.push({
          id: `file-${basePath}/${candidate}`,
          name: candidate.replace(/\.md$/, ""),
          type: "file",
          path: `${basePath}/${candidate}`,
        });
      }
    }
  }

  return {
    id: `node-${key}`,
    name: key,
    type: "dir",
    path: basePath,
    isGitRepo: isGit,
    dirGraphNodeKey: key,
    nodeKind: "personal-kb",
    children,
  };
}

async function buildLiveDocNode(
  client: OpenworkServerClient,
  wsId: string,
  key: string,
  node: DirGraphNode & { path: string; index?: string },
): Promise<TreeNode> {
  const basePath = node.path;
  const isGit = (await readFile(client, wsId, `${basePath}/.git/HEAD`)) !== null;
  const children: TreeNode[] = [];

  // Read index file as a single entry
  if (node.index) {
    children.push({
      id: `file-${node.index}`,
      name: node.index.split("/").pop()!.replace(/\.md$/, ""),
      type: "file",
      path: node.index,
      docRole: docRoleFromFileName(node.index),
    });
  }

  // Also try overview.md / roadmap.md
  for (const candidate of ["overview.md", "roadmap.md"]) {
    const content = await readFile(client, wsId, `${basePath}/${candidate}`);
    if (content && !children.some((c) => c.path === `${basePath}/${candidate}`)) {
      children.push({
        id: `file-${basePath}/${candidate}`,
        name: candidate.replace(/\.md$/, ""),
        type: "file",
        path: `${basePath}/${candidate}`,
        docRole: docRoleFromFileName(candidate),
      });
    }
  }

  return {
    id: `node-${key}`,
    name: key,
    type: "dir",
    path: basePath,
    isGitRepo: isGit,
    dirGraphNodeKey: key,
    nodeKind: "live-doc",
    children,
  };
}

async function buildFeatureTreeNode(
  client: OpenworkServerClient,
  wsId: string,
  key: string,
  node: DirGraphNode & { path: string; feature_key?: string },
): Promise<TreeNode> {
  const basePath = node.path;
  const isGit = (await readFile(client, wsId, `${basePath}/.git/HEAD`)) !== null;
  const children: TreeNode[] = [];

  // Try reading _index.md for feature list
  const indexContent = await readFile(client, wsId, `${basePath}/_index.md`);

  if (indexContent) {
    for (const line of indexContent.split("\n")) {
      // Match markdown list items or feature references
      const listMatch = line.match(/^[-*]\s+`?(\d{3,}-[^`]+)`?/);
      if (listMatch) {
        const featureSlug = listMatch[1].trim();
        const featurePath = `${basePath}/${featureSlug}`;
        const featureChildren: TreeNode[] = [];

        // Common files in a feature directory
        for (const docName of ["spec.md", "plan.md", "tech-research.md"]) {
          const exists = await readFile(client, wsId, `${featurePath}/${docName}`);
          if (exists) {
            featureChildren.push({
              id: `file-${featurePath}/${docName}`,
              name: docName.replace(/\.md$/, ""),
              type: "file",
              path: `${featurePath}/${docName}`,
              docRole: docRoleFromFileName(docName),
            });
          }
        }

        children.push({
          id: `dir-${featurePath}`,
          name: featureSlug,
          type: "dir",
          path: featurePath,
          children: featureChildren,
        });
      }
    }
  }

  // Fallback removed: glob paths like `001-*/spec.md` are not supported by the server

  return {
    id: `node-${key}`,
    name: key,
    type: "dir",
    path: basePath,
    isGitRepo: isGit,
    dirGraphNodeKey: key,
    nodeKind: "feature-tree",
    children,
  };
}

async function buildIncrementalNode(
  client: OpenworkServerClient,
  wsId: string,
  key: string,
  node: DirGraphNode & { path: string; buckets?: string[] },
): Promise<TreeNode> {
  const basePath = node.path;
  const isGit = (await readFile(client, wsId, `${basePath}/.git/HEAD`)) !== null;
  const buckets = node.buckets ?? [];
  const children: TreeNode[] = [];

  for (const bucket of buckets) {
    const bucketPath = `${basePath}/${bucket}`;
    const bucketChildren: TreeNode[] = [];

    // Try reading _index.md in bucket
    const idxContent = await readFile(client, wsId, `${bucketPath}/_index.md`);
    if (idxContent) {
      for (const line of idxContent.split("\n")) {
        const m = line.match(/^[-*]\s+\[?([^\]|\n]+?)\]?\(?.*\.md/);
        if (m) {
          const entryName = m[1].trim();
          bucketChildren.push({
            id: `file-${bucketPath}/${entryName}.md`,
            name: entryName,
            type: "file",
            path: `${bucketPath}/${entryName}.md`,
          });
        }
      }
    }

    children.push({
      id: `dir-${bucketPath}`,
      name: bucket,
      type: "dir",
      path: bucketPath,
      children: bucketChildren,
    });
  }

  return {
    id: `node-${key}`,
    name: key,
    type: "dir",
    path: basePath,
    isGitRepo: isGit,
    dirGraphNodeKey: key,
    nodeKind: "incremental",
    children,
  };
}

function buildRuntimeYmlNode(
  key: string,
  node: DirGraphNode & { files: string[] },
): TreeNode {
  const files = node.files ?? [];
  return {
    id: `node-${key}`,
    name: key,
    type: "dir",
    path: key,
    dirGraphNodeKey: key,
    nodeKind: "runtime-yml",
    children: files.map((f) => ({
      id: `file-${f}`,
      name: f,
      type: "file" as const,
      path: f,
    })),
  };
}

// ── useFileContent hook ──────────────────────────────────────────────────────

function useFileContent(
  owClient: OpenworkServerClient | null | undefined,
  workspaceId: string | null | undefined,
  path: string | null,
) {
  return useQuery<{ content: string | null; error: string | null }>({
    queryKey: ["workspace", "files", workspaceId, path],
    queryFn: async () => {
      if (!owClient || !workspaceId || !path) return { content: null, error: null };
      try {
        const result = await readFile(owClient, workspaceId, path);
        if (result === null) {
          return { content: null, error: "该文件类型暂不支持预览" };
        }
        return { content: result, error: null };
      } catch {
        return { content: null, error: "文件读取失败" };
      }
    },
    enabled: !!owClient && !!workspaceId && !!path,
    staleTime: 30_000,
  });
}

// ── Sub-components ───────────────────────────────────────────────────────────

// GitBadge
function GitBadge() {
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-orange-3 px-1 py-0 text-[9px] font-medium leading-[14px] text-orange-10">
      <GitBranch size={9} />
      git
    </span>
  );
}

// NodeKindChip
function NodeKindChip({ kind }: { kind: string }) {
  const meta = NODE_KIND_META[kind];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span className={`ml-1.5 inline-flex items-center gap-0.5 rounded px-1 py-0 text-[9px] font-medium leading-[14px] ${meta.bgClass} ${meta.textClass}`}>
      <Icon size={9} />
      {meta.label}
    </span>
  );
}

// DocRoleBadge
function DocRoleBadge({ role }: { role: string }) {
  const meta = DOC_ROLE_META[role];
  if (!meta) return null;
  return (
    <span className={`ml-1 inline-flex rounded px-1 py-0 text-[9px] font-medium leading-[14px] ${meta.bgClass} ${meta.textClass}`}>
      {role}
    </span>
  );
}

// DocStatusBadge
function DocStatusBadge({ status }: { status: string }) {
  if (status === "draft") {
    return (
      <span className="ml-1 inline-flex rounded border border-gray-6 px-1 py-0 text-[9px] leading-[14px] text-gray-8">
        draft
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="ml-1 inline-flex rounded bg-green-2 px-1 py-0 text-[9px] font-medium leading-[14px] text-green-9">
        approved
      </span>
    );
  }
  return null;
}

// TreeNodeItem — recursive tree node
function TreeNodeItem({
  node,
  depth,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (node: TreeNode) => void;
  onToggle: (id: string) => void;
}) {
  const isDir = node.type === "dir";
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;

  // Only count real file children (not empty dirs)
  const childCount = node.children?.filter((c) => c.type === "file").length ?? 0;
  const hasChildren = (node.children?.length ?? 0) > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (isDir) {
            onToggle(node.id);
          }
          onSelect(node);
        }}
        className={`flex w-full items-center gap-1 rounded-sm py-[3px] pr-2 text-left text-[13px] transition-colors ${
          isSelected
            ? "bg-green-2/70 font-medium text-green-11"
            : "text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
        }`}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
      >
        {/* Expand/collapse chevron */}
        {isDir ? (
          isExpanded ? (
            <ChevronDown size={12} className="shrink-0 opacity-60" />
          ) : (
            <ChevronRight size={12} className="shrink-0 opacity-60" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}

        {/* Icon */}
        {isDir ? (
          isExpanded ? (
            <FolderOpen size={13} className="shrink-0 text-amber-9/70" />
          ) : (
            <Folder size={13} className="shrink-0 text-amber-9/70" />
          )
        ) : (
          <File size={13} className="shrink-0 text-blue-9/70" />
        )}

        {/* Name */}
        <span className="min-w-0 truncate">{node.name}</span>

        {/* Badges */}
        {node.isGitRepo && <GitBadge />}
        {node.nodeKind && <NodeKindChip kind={node.nodeKind} />}
        {node.docRole && <DocRoleBadge role={node.docRole} />}
        {node.docStatus && <DocStatusBadge status={node.docStatus} />}
        {node.isReadonly && (
          <span className="ml-1 text-[9px] text-gray-8">🔒</span>
        )}

        {/* Child count for collapsed dirs */}
        {isDir && !isExpanded && childCount > 0 && (
          <span className="ml-auto shrink-0 text-[10px] text-gray-8">
            {childCount}
          </span>
        )}
      </button>

      {/* Children */}
      {isDir && isExpanded && node.children?.map((child) => (
        <TreeNodeItem
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          expandedIds={expandedIds}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

// FileViewer — markdown file preview
function FileViewer({
  node,
  fileData,
  isLoading,
}: {
  node: TreeNode | null;
  fileData: { content: string | null; error: string | null } | undefined;
  isLoading: boolean;
}) {
  if (!node) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-dls-secondary">
        选择左侧文件查看内容
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[13px] text-dls-secondary">
        <Loader2 size={14} className="animate-spin" />
        加载中...
      </div>
    );
  }

  if (fileData?.error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <p className="text-[13px] text-amber-9">{fileData.error}</p>
        <p className="text-[11px] text-dls-secondary">{node.path}</p>
      </div>
    );
  }

  if (!fileData?.content) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-dls-secondary">
        文件内容为空
      </div>
    );
  }

  // Breadcrumb from path
  const parts = node.path.split("/");

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Breadcrumb + meta row */}
      <div className="flex shrink-0 items-center gap-2 border-b border-dls-border px-4 py-2">
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-[11px] text-dls-secondary">
          {parts.map((part, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-6">/</span>}
              <span className={i === parts.length - 1 ? "font-medium text-dls-text" : ""}>
                {part}
              </span>
            </span>
          ))}
        </nav>
        {node.docRole && <DocRoleBadge role={node.docRole} />}
        {node.docStatus && <DocStatusBadge status={node.docStatus} />}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="prose prose-sm max-w-none prose-headings:font-semibold prose-h1:text-xl prose-h2:text-lg prose-h3:text-base prose-p:text-[13px] prose-p:leading-relaxed prose-code:text-[12px] prose-pre:bg-dls-hover prose-pre:rounded-lg">
          {/* Simple markdown rendering: split by lines, apply basic formatting */}
          {renderMarkdownContent(fileData.content)}
        </div>
      </div>
    </div>
  );
}

function renderMarkdownContent(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeBlockLines: string[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block fence
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        // End code block
        elements.push(
          <pre key={key++} className="overflow-x-auto rounded-lg bg-dls-hover p-3 text-[12px] leading-relaxed">
            <code>{codeBlockLines.join("\n")}</code>
          </pre>,
        );
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        // Start code block
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Empty line → paragraph break
    if (line.trim() === "") {
      elements.push(<div key={key++} className="h-3" />);
      continue;
    }

    // Horizontal rule
    if (/^-{3,}$/.test(line.trim()) || /^\*{3,}$/.test(line.trim())) {
      elements.push(<hr key={key++} className="my-4 border-dls-border" />);
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      elements.push(<h3 key={key++} className="mt-4 mb-1 text-base font-semibold">{inlineFormat(line.slice(4))}</h3>);
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(<h2 key={key++} className="mt-5 mb-1 text-lg font-semibold">{inlineFormat(line.slice(3))}</h2>);
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(<h1 key={key++} className="mt-6 mb-2 text-xl font-semibold">{inlineFormat(line.slice(2))}</h1>);
      continue;
    }

    // List items
    if (/^[-*]\s/.test(line)) {
      elements.push(
        <div key={key++} className="flex gap-2 text-[13px] leading-relaxed">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-dls-text" />
          <span>{inlineFormat(line.replace(/^[-*]\s/, ""))}</span>
        </div>,
      );
      continue;
    }

    // Numbered list items
    if (/^\d+\.\s/.test(line)) {
      const numMatch = line.match(/^(\d+)\.\s(.*)/);
      if (numMatch) {
        elements.push(
          <div key={key++} className="flex gap-2 text-[13px] leading-relaxed">
            <span className="shrink-0 text-dls-secondary">{numMatch[1]}.</span>
            <span>{inlineFormat(numMatch[2])}</span>
          </div>,
        );
      }
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={key++} className="border-l-2 border-green-8 pl-3 text-[13px] text-dls-secondary italic">
          {inlineFormat(line.slice(2))}
        </blockquote>,
      );
      continue;
    }

    // Regular paragraph
    elements.push(<p key={key++} className="text-[13px] leading-relaxed">{inlineFormat(line)}</p>);
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <pre key={key++} className="overflow-x-auto rounded-lg bg-dls-hover p-3 text-[12px]">
        <code>{codeBlockLines.join("\n")}</code>
      </pre>,
    );
  }

  return elements;
}

function inlineFormat(text: string): React.ReactNode {
  // Bold: **text**
  // Italic: *text*
  // Code: `text`
  // This is a simplified inline formatter

  const parts: React.ReactNode[] = [];
  let remaining = text;
  let partKey = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Inline code
    const codeMatch = remaining.match(/`([^`]+)`/);
    // Italic
    const italicMatch = remaining.match(/\*(.+?)\*/);

    interface InlineMatch { idx: number; len: number; node: React.ReactNode }
    const candidates: InlineMatch[] = [];

    if (boldMatch && boldMatch.index != null) {
      candidates.push({ idx: boldMatch.index, len: boldMatch[0].length, node: <strong key={partKey++}>{boldMatch[1]}</strong> });
    }
    if (codeMatch && codeMatch.index != null) {
      candidates.push({ idx: codeMatch.index, len: codeMatch[0].length, node: <code key={partKey++} className="rounded bg-dls-hover px-1 py-0.5 text-[12px]">{codeMatch[1]}</code> });
    }
    if (italicMatch && italicMatch.index != null) {
      candidates.push({ idx: italicMatch.index, len: italicMatch[0].length, node: <em key={partKey++}>{italicMatch[1]}</em> });
    }

    const firstMatch = candidates.length > 0
      ? candidates.reduce((best, c) => c.idx < best.idx ? c : best)
      : null;

    if (!firstMatch) {
      parts.push(remaining);
      break;
    }

    if (firstMatch.idx > 0) {
      parts.push(remaining.slice(0, firstMatch.idx));
    }
    parts.push(firstMatch.node);
    remaining = remaining.slice(firstMatch.idx + firstMatch.len);
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// SearchResults — search results panel
function SearchResults({
  query,
  allNodes,
  onSelectFile,
}: {
  query: string;
  allNodes: TreeNode[];
  onSelectFile: (node: TreeNode) => void;
}) {
  const lq = query.toLowerCase();

  const matchedFiles = useMemo(() => {
    return allNodes.filter(
      (n) =>
        n.type === "file" &&
        (n.name.toLowerCase().includes(lq) || n.path.toLowerCase().includes(lq)),
    );
  }, [allNodes, lq]);

  // Group by nodeKind
  const grouped = useMemo(() => {
    const map = new Map<string, TreeNode[]>();
    for (const n of matchedFiles) {
      const group = n.nodeKind ?? "其他";
      const list = map.get(group) ?? [];
      list.push(n);
      map.set(group, list);
    }
    return map;
  }, [matchedFiles]);

  if (matchedFiles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-dls-secondary">
        未找到匹配 &ldquo;{query}&rdquo; 的文档
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      <p className="mb-3 text-[12px] text-dls-secondary">
        共找到 <span className="font-medium text-dls-text">{matchedFiles.length}</span> 个结果
      </p>
      {Array.from(grouped.entries()).map(([group, nodes]) => (
        <div key={group} className="mb-4">
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-medium text-dls-secondary">
            <span>{NODE_KIND_META[group]?.label ?? group}</span>
            <span className="text-gray-6">({nodes.length})</span>
          </div>
          {nodes.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onSelectFile(n)}
              className="mb-1 w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-dls-hover"
            >
              <p className="text-[13px] font-medium text-dls-text">{highlightMatch(n.name, lq)}</p>
              <p className="text-[11px] text-dls-secondary">{highlightMatch(n.path, lq)}</p>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-2/80 text-dls-text">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// AiQaPanel — AI Q&A panel
function AiQaPanel({
  messages,
  onSend,
  typing,
  inputValue,
  onInputChange,
  onSelectSource,
}: {
  messages: AiMessage[];
  onSend: () => void;
  typing: boolean;
  inputValue: string;
  onInputChange: (v: string) => void;
  onSelectSource: (path: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`mb-3 ${msg.role === "user" ? "flex justify-end" : ""}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
                msg.role === "user"
                  ? "bg-green-2/70 text-green-11"
                  : "bg-white text-dls-text shadow-sm border border-dls-border"
              }`}
            >
              {msg.content}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 border-t border-dls-border pt-2">
                  <p className="mb-1 text-[10px] text-dls-secondary">来源：</p>
                  {msg.sources.map((src) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => onSelectSource(src)}
                      className="mr-2 inline-flex items-center gap-0.5 rounded bg-blue-2 px-1.5 py-0.5 text-[11px] text-blue-9 hover:bg-blue-3"
                    >
                      <File size={9} />
                      {src.split("/").pop()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {typing && (
          <div className="mb-3">
            <div className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-[13px] text-dls-secondary shadow-sm border border-dls-border">
              <Loader2 size={12} className="animate-spin" />
              思考中...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-dls-border p-3">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && inputValue.trim()) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="输入问题..."
            className="flex-1 rounded-lg border border-dls-border bg-white px-3 py-2 text-[13px] text-dls-text placeholder:text-gray-8 focus:border-green-8 focus:outline-none"
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!inputValue.trim() || typing}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-9 text-white transition-colors hover:bg-green-10 disabled:opacity-40"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── KnowledgeBasePage ────────────────────────────────────────────────────────

export function KnowledgeBasePage({
  openworkServerClient,
  workspaceId,
}: KnowledgeBasePageProps) {
  // ── Data hooks ───────────────────────────────────────────────────────────────
  const { data: treeNodes, isLoading: treeLoading } = useKnowledgeTree(openworkServerClient, workspaceId);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set(["root"]));
  const [searchQuery, setSearchQuery] = useState("");
  const [rightMode, setRightMode] = useState<RightMode>("browser");
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "你好！我是知识库助手，可以帮你检索和总结 workspace 中的文档。试试问我关于项目文档的问题吧！",
    },
  ]);
  const [aiInput, setAiInput] = useState("");
  const [aiTyping, setAiTyping] = useState(false);

  // ── File content hook ────────────────────────────────────────────────────────
  const { data: fileData, isLoading: fileLoading } = useFileContent(
    openworkServerClient,
    workspaceId ?? null,
    selectedNode?.type === "file" ? selectedNode.path : null,
  );

  // ── Derived data ─────────────────────────────────────────────────────────────
  const allNodes = useMemo(() => (treeNodes ? flattenTree(treeNodes) : []), [treeNodes]);

  // Auto-expand top-level dirs on first load — 只执行一次，避免用户手动收起后重复展开
  const autoExpandedRef = useRef(false);
  useEffect(() => {
    if (!autoExpandedRef.current && treeNodes && treeNodes.length > 0) {
      autoExpandedRef.current = true;
      const root = treeNodes[0];
      const newIds = new Set<string>();
      newIds.add(root.id);
      if (root.children) {
        for (const child of root.children) {
          newIds.add(child.id);
        }
      }
      setExpandedIds(newIds);
    }
  }, [treeNodes]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleSelect = useCallback(
    (node: TreeNode) => {
      if (node.type === "file") {
        setSelectedNode(node);
        // Derive docStatus from file content after loading
        if (rightMode === "search") {
          setRightMode("browser");
        }
      }
    },
    [rightMode],
  );

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    if (value.length > 0) {
      setRightMode("search");
    } else {
      setRightMode("browser");
    }
  }, []);

  const handleAiSend = useCallback(() => {
    if (!aiInput.trim() || aiTyping) return;
    const question = aiInput.trim();
    setAiInput("");

    const userMsg: AiMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: question,
    };
    setAiMessages((prev) => [...prev, userMsg]);
    setAiTyping(true);

    // Mock AI response: find relevant files from allNodes
    setTimeout(() => {
      const lq = question.toLowerCase();
      const relevantFiles = allNodes.filter(
        (n) =>
          n.type === "file" &&
          (n.name.toLowerCase().includes(lq) ||
            n.path.toLowerCase().includes(lq) ||
            (n.docRole && n.docRole.toLowerCase().includes(lq))),
      );

      const sourcePaths = relevantFiles.slice(0, 3).map((n) => n.path);
      let responseText: string;

      if (relevantFiles.length > 0) {
        responseText = `根据你的问题，我找到了以下相关文档：\n\n${relevantFiles
          .slice(0, 3)
          .map((n) => `- ${n.path}${n.docRole ? ` (${n.docRole})` : ""}`)
          .join("\n")}\n\n你可以点击下方来源链接查看详情。`;
      } else {
        responseText =
          "抱歉，在当前 workspace 中未找到与您问题直接相关的文档。请尝试换一个关键词或浏览左侧目录树。";
      }

      const aiMsg: AiMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: responseText,
        sources: sourcePaths.length > 0 ? sourcePaths : undefined,
      };
      setAiMessages((prev) => [...prev, aiMsg]);
      setAiTyping(false);
    }, 800);
  }, [aiInput, aiTyping, allNodes]);

  const handleSelectSource = useCallback(
    (path: string) => {
      const node = allNodes.find((n) => n.path === path);
      if (node) {
        setSelectedNode(node);
        setRightMode("browser");
      }
    },
    [allNodes],
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-dls-border bg-white/80 px-4">
        <BookOpen size={15} className="shrink-0 text-green-9/70" />
        <span className="text-[14px] font-semibold text-dls-text">个人知识库</span>
        {workspaceId && (
          <span className="text-[11px] text-dls-secondary">
            workspace: {workspaceId}
          </span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setRightMode(rightMode === "ai-qa" ? "browser" : "ai-qa")}
          className={`flex items-center gap-1 rounded-md px-2 py-1 text-[12px] transition-colors ${
            rightMode === "ai-qa"
              ? "bg-green-2 font-medium text-green-11"
              : "text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
          }`}
        >
          <Bot size={13} />
          AI问答
        </button>
      </div>

      {/* ── Main area: left tree + right content ──────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left tree panel */}
        <div className="flex w-[260px] shrink-0 flex-col border-r border-dls-border bg-white">
          {/* Search input */}
          <div className="shrink-0 border-b border-dls-border p-2">
            <div className="flex items-center gap-1.5 rounded-md border border-dls-border bg-dls-surface px-2 py-1.5">
              <Search size={13} className="shrink-0 text-gray-8" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="搜索文档..."
                className="min-w-0 flex-1 bg-transparent text-[12px] text-dls-text placeholder:text-gray-8 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => handleSearchChange("")}
                  className="shrink-0 text-gray-8 hover:text-dls-text"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Tree */}
          <div className="flex-1 overflow-y-auto py-1">
            {treeLoading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-dls-secondary">
                <Loader2 size={14} className="animate-spin" />
                加载目录...
              </div>
            ) : treeNodes && treeNodes.length > 0 ? (
              treeNodes.map((root) => (
                <TreeNodeItem
                  key={root.id}
                  node={root}
                  depth={0}
                  selectedId={selectedNode?.id ?? null}
                  expandedIds={expandedIds}
                  onSelect={handleSelect}
                  onToggle={handleToggle}
                />
              ))
            ) : (
              <div className="px-4 py-8 text-center text-[12px] text-dls-secondary">
                暂无知识库内容
              </div>
            )}
          </div>
        </div>

        {/* Right content area */}
        <div className="flex min-w-0 flex-1 flex-col bg-dls-surface">
          {rightMode === "ai-qa" ? (
            <AiQaPanel
              messages={aiMessages}
              onSend={handleAiSend}
              typing={aiTyping}
              inputValue={aiInput}
              onInputChange={setAiInput}
              onSelectSource={handleSelectSource}
            />
          ) : rightMode === "search" && searchQuery.length > 0 ? (
            <SearchResults
              query={searchQuery}
              allNodes={allNodes}
              onSelectFile={(node) => {
                setSelectedNode(node);
                setRightMode("browser");
                setSearchQuery("");
              }}
            />
          ) : (
            <FileViewer
              node={selectedNode}
              fileData={fileData}
              isLoading={fileLoading}
            />
          )}
        </div>
      </div>
    </div>
  );
}
