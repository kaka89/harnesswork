/**
 * dir-graph.ts — TypeScript 类型定义（workspace 知识目录规约）
 * 对应 .xingjing/dir-graph.yaml 文件结构。
 */

export type LiveDocNode     = { kind: "live-doc";     path: string; index?: string; writable?: boolean };
export type FeatureTreeNode = { kind: "feature-tree"; path: string; feature_key?: string };
export type IncrementalNode = { kind: "incremental";  path: string; buckets?: string[] };
export type PersonalKbNode  = { kind: "personal-kb";  path: string; index?: string };
export type RuntimeYmlNode  = { kind: "runtime-yml";  files: string[] };
export type OpenworkNativeMapping = { path: string; api: string };
export type OpenworkNativeNode = {
  skills?:   OpenworkNativeMapping;
  agents?:   OpenworkNativeMapping;
  commands?: OpenworkNativeMapping;
};

export type DirGraphNode = LiveDocNode | FeatureTreeNode | IncrementalNode | PersonalKbNode | RuntimeYmlNode;

export type DirGraphNodes = {
  product?:         LiveDocNode;
  features?:        FeatureTreeNode;
  iterations?:      IncrementalNode;
  knowledge?:       PersonalKbNode;
  runtime?:         RuntimeYmlNode;
  openwork_native?: OpenworkNativeNode;
  [key: string]:    DirGraphNode | OpenworkNativeNode | undefined;
};

export type DirGraphConventions = {
  naming?: Record<string, string>;
  frontmatter_required?: string[];
};

export type DirGraphContextInjection = {
  budget_bytes: number;
  order: string[];
};

export type DirGraph = {
  schema: string;
  workspace: { root: string; timezone?: string };
  nodes: DirGraphNodes;
  conventions?: DirGraphConventions;
  context_injection: DirGraphContextInjection;
};

export type ValidationWarning = { field: string; message: string };
