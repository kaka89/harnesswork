import { createResource, createSignal, For, Show } from "solid-js";
import { pickDirectory } from "../../lib/tauri";

// ---------- types ----------

export interface FsEntry {
  name: string;
  path: string;
  type: "file" | "dir";
  ext?: string;
}

interface WorkspaceFileTreeProps {
  onSelect: (path: string) => void;
}

// ---------- constants ----------

const WS_PATH_KEY = "harnesswork:cockpit:ws-path";

// ---------- helpers ----------

async function loadDir(path: string): Promise<FsEntry[]> {
  try {
    const res = await fetch(`/workspace/readdir?path=${encodeURIComponent(path)}`);
    if (!res.ok) return [];
    return (await res.json()) as FsEntry[];
  } catch {
    return [];
  }
}

function fileIcon(entry: FsEntry): string {
  if (entry.type === "dir") return "";
  switch (entry.ext) {
    case "md":
    case "mdx":
      return "📝";
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mts":
    case "mjs":
      return "⚡";
    case "json":
    case "jsonc":
    case "yaml":
    case "yml":
    case "toml":
      return "{}";
    case "png":
    case "jpg":
    case "jpeg":
    case "svg":
    case "gif":
    case "webp":
      return "🖼";
    case "rs":
      return "🦀";
    case "sh":
    case "bash":
    case "zsh":
      return "⚙";
    default:
      return "·";
  }
}

// ---------- FileTreeEntry (recursive) ----------

function FileTreeEntry(entryProps: {
  entry: FsEntry;
  depth: number;
  expanded: Set<string>;
  childrenMap: Map<string, FsEntry[]>;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
}) {
  const isExpanded = () => entryProps.expanded.has(entryProps.entry.path);
  const children = () => entryProps.childrenMap.get(entryProps.entry.path) ?? [];
  const isHidden = () => entryProps.entry.name.startsWith(".");
  const indentPx = () => `${12 + entryProps.depth * 12}px`;

  if (entryProps.entry.type === "dir") {
    return (
      <div>
        <button
          class={[
            "w-full flex items-center gap-1.5 py-[3px] pr-3 text-xs text-left transition-colors",
            "hover:bg-dls-hover",
            isHidden() ? "text-gray-8" : "text-gray-11 font-medium",
          ].join(" ")}
          style={{ "padding-left": indentPx() }}
          onClick={() => entryProps.onToggleDir(entryProps.entry.path)}
          data-testid={`ws-dir-${entryProps.entry.name}`}
        >
          <span class="shrink-0 text-gray-9 w-3 text-center">
            {isExpanded() ? "▾" : "▸"}
          </span>
          <span class="truncate">{entryProps.entry.name}</span>
        </button>
        <Show when={isExpanded()}>
          <For each={children()}>
            {(child) => (
              <FileTreeEntry
                entry={child}
                depth={entryProps.depth + 1}
                expanded={entryProps.expanded}
                childrenMap={entryProps.childrenMap}
                onToggleDir={entryProps.onToggleDir}
                onSelectFile={entryProps.onSelectFile}
              />
            )}
          </For>
        </Show>
      </div>
    );
  }

  // File row
  return (
    <button
      class={[
        "w-full flex items-center gap-1.5 py-[3px] pr-3 text-xs text-left transition-colors",
        "hover:bg-dls-hover hover:text-gray-12",
        isHidden() ? "text-gray-7" : "text-gray-10",
      ].join(" ")}
      style={{ "padding-left": indentPx() }}
      onClick={() => entryProps.onSelectFile(entryProps.entry.path)}
      data-testid={`ws-file-${entryProps.entry.name}`}
    >
      <span class="shrink-0 w-3 text-center text-gray-8">{fileIcon(entryProps.entry)}</span>
      <span class="truncate">{entryProps.entry.name}</span>
    </button>
  );
}

// ---------- WorkspaceFileTreePanel ----------

export default function WorkspaceFileTreePanel(props: WorkspaceFileTreeProps) {
  const [rootPath, setRootPath] = createSignal<string | null>(
    typeof localStorage !== "undefined" ? localStorage.getItem(WS_PATH_KEY) : null,
  );
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set());
  const [childrenMap, setChildrenMap] = createSignal<Map<string, FsEntry[]>>(new Map());

  const [rootEntries] = createResource(rootPath, async (path) => {
    if (!path) return null;
    return loadDir(path);
  });

  const handlePickFolder = async () => {
    try {
      const picked = await pickDirectory({ title: "选择工作目录" });
      if (typeof picked === "string" && picked) {
        localStorage.setItem(WS_PATH_KEY, picked);
        setRootPath(picked);
        setExpanded(new Set<string>());
        setChildrenMap(new Map<string, FsEntry[]>());
      }
    } catch {
      // non-Tauri env or user cancelled
    }
  };

  const handleToggleDir = async (path: string) => {
    const exp = expanded();
    if (exp.has(path)) {
      const next = new Set(exp);
      next.delete(path);
      setExpanded(next);
    } else {
      if (!childrenMap().has(path)) {
        const children = await loadDir(path);
        setChildrenMap(new Map([...childrenMap(), [path, children]]));
      }
      setExpanded(new Set([...exp, path]));
    }
  };

  const dirName = () => {
    const p = rootPath();
    if (!p) return "";
    const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts[parts.length - 1] ?? p;
  };

  return (
    <div class="h-full flex flex-col" data-testid="workspace-file-tree">
      {/* Header: 工作空间名称 + 更换按钮 */}
      <Show when={rootPath()}>
        <div class="flex items-center gap-2 px-3 py-2 border-b border-dls-border shrink-0 bg-dls-surface">
          <span class="text-xs font-semibold text-gray-12 truncate flex-1" title={rootPath()!}>
            📁 {dirName()}
          </span>
          <button
            class="shrink-0 text-xs text-gray-9 hover:text-blue-11 transition-colors px-1.5 py-0.5 rounded hover:bg-dls-hover"
            onClick={handlePickFolder}
            title="更换工作目录"
          >
            更换
          </button>
        </div>
      </Show>

      {/* Body */}
      <div class="flex-1 overflow-y-auto">
        <Show
          when={rootPath()}
          fallback={
            /* 空状态：未选择工作目录 */
            <div class="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
              <div>
                <div class="text-4xl mb-3">📂</div>
                <p class="text-gray-11 text-sm font-medium mb-1">未选择工作目录</p>
                <p class="text-gray-9 text-xs">选择一个本地目录作为工作空间</p>
              </div>
              <button
                class="px-4 py-2 rounded-lg bg-blue-9 text-white text-sm font-medium hover:bg-blue-10 transition-colors"
                onClick={handlePickFolder}
                data-testid="pick-workspace-btn"
              >
                选择工作目录
              </button>
            </div>
          }
        >
          {/* 骨架屏 */}
          <Show when={rootEntries.loading}>
            <div class="p-3 flex flex-col gap-2" data-testid="ws-tree-loading">
              <For each={[1, 2, 3, 4, 5, 6, 7]}>
                {() => <div class="h-4 bg-gray-4 rounded animate-pulse" />}
              </For>
            </div>
          </Show>

          {/* 错误 / 空目录 */}
          <Show when={!rootEntries.loading && rootEntries()?.length === 0}>
            <p class="p-4 text-xs text-gray-9">目录为空</p>
          </Show>

          {/* 文件树 */}
          <Show when={rootEntries() && rootEntries()!.length > 0}>
            <div class="py-1">
              <For each={rootEntries()!}>
                {(entry) => (
                  <FileTreeEntry
                    entry={entry}
                    depth={0}
                    expanded={expanded()}
                    childrenMap={childrenMap()}
                    onToggleDir={handleToggleDir}
                    onSelectFile={props.onSelect}
                  />
                )}
              </For>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
}
