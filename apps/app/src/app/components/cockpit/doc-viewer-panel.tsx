import { createResource, For, Show } from "solid-js";
import { marked } from "marked";
import DOMPurify from "dompurify";

export interface DocViewerPanelProps {
  path: string;
}

interface DocResult {
  html: string;
  status: number;
}

/**
 * 将 Markdown 文本转换为经过 XSS 净化的 HTML 字符串。
 * 使用项目已有的 marked 库解析，DOMPurify 防注入。
 */
function markdownToSafeHtml(md: string): string {
  const rawHtml = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(rawHtml);
}

async function fetchDocContent(path: string): Promise<DocResult> {
  if (!path) return { html: "", status: 0 };
  // 绝对路径（工作区文件树选中）→ 使用 /workspace/file 接口
  const isAbsolute = path.startsWith("/") || /^[A-Za-z]:[/\\]/.test(path);
  const url = isAbsolute
    ? `/workspace/file?path=${encodeURIComponent(path)}`
    : `/docs/${encodeURIComponent(path)}`;
  const res = await fetch(url);
  if (!res.ok) return { html: "", status: res.status };
  const text = await res.text();
  // Markdown 文件 → 渲染为 HTML；其他文件 → 纯文本预览
  const isMarkdown = /\.(md|mdx)$/i.test(path);
  if (isMarkdown) {
    return { html: markdownToSafeHtml(text), status: res.status };
  }
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return {
    html: `<pre class="text-xs text-gray-11 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">${escaped}</pre>`,
    status: res.status,
  };
}

export default function DocViewerPanel(props: DocViewerPanelProps) {
  const [doc] = createResource(() => props.path, fetchDocContent);

  return (
    <div class="h-full overflow-y-auto" data-testid="doc-viewer-panel">
      {/* 初始状态：未选择文档 */}
      <Show when={!props.path}>
        <div class="h-full flex items-center justify-center text-gray-9 text-sm">
          请选择左侧文件
        </div>
      </Show>

      <Show when={props.path}>
        {/* 加载骨架屏 */}
        <Show when={doc.loading}>
          <div class="p-6 flex flex-col gap-3" data-testid="doc-viewer-loading">
            <For each={[1, 2, 3, 4, 5]}>
              {() => <div class="h-4 bg-gray-4 rounded animate-pulse" />}
            </For>
          </div>
        </Show>

        {/* 就绪态：按状态码分支 */}
        <Show when={!doc.loading && doc() !== undefined}>
          <Show
            when={doc()!.status === 200}
            fallback={
              <Show
                when={doc()!.status === 404}
                fallback={
                  /* 403 / 500 等其他错误 */
                  <div class="p-6">
                    <p
                      class="text-red-400 text-sm"
                      data-testid="doc-viewer-error"
                    >
                      加载失败，请重试
                    </p>
                  </div>
                }
              >
                {/* 404 */}
                <div class="p-6">
                  <p
                    class="text-gray-9 text-sm"
                    data-testid="doc-viewer-not-found"
                  >
                    文档未找到
                  </p>
                </div>
              </Show>
            }
          >
            {/* 成功：渲染 Markdown HTML */}
            <article
              class="p-6 text-gray-12 text-sm leading-relaxed max-w-4xl prose"
              data-testid="doc-viewer-content"
              innerHTML={doc()!.html}
            />
          </Show>
        </Show>
      </Show>
    </div>
  );
}
