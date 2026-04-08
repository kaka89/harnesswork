import { createSignal } from "solid-js";
import DocTreePanel from "./doc-tree-panel";
import DocViewerPanel from "./doc-viewer-panel";

export default function ProductTab() {
  const [selectedPath, setSelectedPath] = createSignal("");

  return (
    <div class="flex h-full" data-testid="product-tab">
      {/* 左侧文档树（固定宽度） */}
      <aside class="w-64 shrink-0 border-r border-dls-border overflow-y-auto">
        <DocTreePanel onSelect={setSelectedPath} />
      </aside>
      {/* 右侧文档内容区（撑满剩余宽度） */}
      <section class="flex-1 overflow-y-auto p-4">
        <DocViewerPanel path={selectedPath()} />
      </section>
    </div>
  );
}
