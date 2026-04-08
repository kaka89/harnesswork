import { createResource, createSignal, For, Show } from "solid-js";

export interface DocEntry {
  path: string;
  title: string;
  type: string;
  status: string;
}

export interface DocTreePanelProps {
  onSelect: (path: string) => void;
}

const TYPE_LABEL: Record<string, string> = {
  prd: "PRD",
  sdd: "SDD",
  module: "MODULE",
  plan: "PLAN",
  task: "TASK",
  feature: "FEATURE",
  doc: "DOC",
};

/** draft → 灰色; approved → 绿色; released → 蓝色 */
const STATUS_CLASS: Record<string, string> = {
  draft: "bg-gray-700 text-gray-300",
  approved: "bg-green-900 text-green-300",
  released: "bg-blue-900 text-blue-300",
};
const STATUS_CLASS_FALLBACK = "bg-gray-800 text-gray-400";

function groupByType(entries: DocEntry[]): [string, DocEntry[]][] {
  const map = new Map<string, DocEntry[]>();
  for (const entry of entries) {
    const key = entry.type || "doc";
    const list = map.get(key);
    if (list) {
      list.push(entry);
    } else {
      map.set(key, [entry]);
    }
  }
  return Array.from(map.entries());
}

export default function DocTreePanel(props: DocTreePanelProps) {
  const [docs] = createResource<DocEntry[]>(async () => {
    const res = await fetch("/docs");
    if (!res.ok) throw new Error(`Failed to load docs: ${res.status}`);
    return res.json() as Promise<DocEntry[]>;
  });

  const [expandedGroups, setExpandedGroups] = createSignal<Set<string>>(
    new Set(["prd", "sdd", "plan", "task"]),
  );

  const toggleGroup = (type: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  return (
    <div class="h-full overflow-y-auto text-sm" data-testid="doc-tree-panel">
      {/* 加载态：骨架屏 */}
      <Show when={docs.loading}>
        <div class="p-4 flex flex-col gap-2" data-testid="doc-tree-loading">
          <For each={[1, 2, 3]}>
            {() => <div class="h-5 bg-gray-800 rounded animate-pulse" />}
          </For>
        </div>
      </Show>

      {/* 错误态 */}
      <Show when={docs.error}>
        <div class="p-4 text-red-400 text-xs" data-testid="doc-tree-error">
          加载失败，请重试
        </div>
      </Show>

      {/* 就绪态 */}
      <Show when={!docs.loading && !docs.error && docs() !== undefined}>
        <Show
          when={(docs()?.length ?? 0) > 0}
          fallback={
            <p
              class="p-4 text-gray-500 text-xs"
              data-testid="doc-tree-empty"
            >
              暂无文档
            </p>
          }
        >
          <div class="py-2">
            <For each={groupByType(docs()!)}>
              {([type, entries]) => (
                <div>
                  {/* 分组标题 */}
                  <button
                    class="w-full flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors text-left"
                    onClick={() => toggleGroup(type)}
                    data-testid={`doc-group-${type}`}
                  >
                    <span class="text-gray-600">
                      {expandedGroups().has(type) ? "▼" : "▶"}
                    </span>
                    <span>{TYPE_LABEL[type] ?? type.toUpperCase()}</span>
                    <span class="ml-auto text-gray-600">{entries.length}</span>
                  </button>

                  {/* 文档列表（展开/折叠） */}
                  <Show when={expandedGroups().has(type)}>
                    <For each={entries}>
                      {(entry) => (
                        <button
                          class="w-full flex items-center gap-2 px-6 py-1.5 text-xs text-gray-300 hover:text-white hover:bg-gray-800 transition-colors text-left"
                          onClick={() => props.onSelect(entry.path)}
                          data-testid={`doc-entry-${entry.path}`}
                        >
                          <span class="flex-1 truncate">{entry.title}</span>
                          <span
                            class={`shrink-0 px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_CLASS[entry.status] ?? STATUS_CLASS_FALLBACK}`}
                          >
                            {entry.status}
                          </span>
                        </button>
                      )}
                    </For>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}
