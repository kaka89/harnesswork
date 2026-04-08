import { For } from "solid-js";
import type { TabId } from "../../pages/cockpit";

interface CockpitTabNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const TAB_ITEMS: { id: TabId; label: string }[] = [
  { id: "product", label: "产品" },
  { id: "engineering", label: "研发" },
  { id: "release", label: "发布&运维" },
  { id: "growth", label: "运营" },
];

export default function CockpitTabNav(props: CockpitTabNavProps) {
  const handleKeyDown = (e: KeyboardEvent, idx: number) => {
    let nextIdx = idx;
    if (e.key === "ArrowRight") {
      nextIdx = (idx + 1) % TAB_ITEMS.length;
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      nextIdx = (idx - 1 + TAB_ITEMS.length) % TAB_ITEMS.length;
      e.preventDefault();
    } else if (e.key === "Enter" || e.key === " ") {
      props.onTabChange(TAB_ITEMS[idx]!.id);
      e.preventDefault();
      return;
    }
    if (nextIdx !== idx) {
      props.onTabChange(TAB_ITEMS[nextIdx]!.id);
      // 移动焦点到下一个 tab
      const tabs = document.querySelectorAll<HTMLButtonElement>("[data-tab-nav] button");
      tabs[nextIdx]?.focus();
    }
  };

  return (
    <nav class="flex gap-1" data-tab-nav role="tablist" aria-label="工程驾驶舱导航">
      <For each={TAB_ITEMS}>
        {(tab, idx) => (
          <button
            role="tab"
            aria-selected={props.activeTab === tab.id}
            tabIndex={props.activeTab === tab.id ? 0 : -1}
            data-testid={`tab-${tab.id}`}
            class={[
              "px-4 py-2 text-sm font-medium rounded-t transition-colors",
              props.activeTab === tab.id
                ? "border-b-2 border-blue-9 text-blue-11 bg-dls-hover"
                : "text-gray-10 hover:text-gray-12 hover:bg-dls-hover",
            ].join(" ")}
            onClick={() => props.onTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx())}
          >
            {tab.label}
          </button>
        )}
      </For>
    </nav>
  );
}
