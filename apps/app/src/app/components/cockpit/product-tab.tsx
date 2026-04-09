import { createSignal } from "solid-js";
import WorkspaceFileTreePanel from "./workspace-file-tree";
import DocViewerPanel from "./doc-viewer-panel";

export default function ProductTab() {
  const [selectedPath, setSelectedPath] = createSignal("");

  return (
    <div class="flex h-full" data-testid="product-tab">
      {/* 左侧工作区文件目录 */}
      <aside class="w-64 shrink-0 border-r border-dls-border overflow-y-auto">
        <WorkspaceFileTreePanel onSelect={setSelectedPath} />
      </aside>
      {/* 右侧文件内容预览 */}
      <section class="flex-1 overflow-y-auto p-4">
        <DocViewerPanel path={selectedPath()} />
      </section>
    </div>
  );
}
