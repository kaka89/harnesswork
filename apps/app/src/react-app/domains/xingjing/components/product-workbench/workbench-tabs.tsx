/** @jsxImportSource react */
import { Newspaper, PenLine, Search, Target, Telescope } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { WorkbenchTabId } from "../../types/product-workbench";

export interface WorkbenchTabsProps {
  activeTab: WorkbenchTabId;
  onChange: (tab: WorkbenchTabId) => void;
  counts: Record<WorkbenchTabId, number>;
}

const TABS: Array<{ id: WorkbenchTabId; label: string; icon: LucideIcon }> = [
  { id: "planning",            label: "产品规划",     icon: Target },
  { id: "competitor",          label: "竞品分析",     icon: Telescope },
  { id: "market-insight",      label: "市场洞察",     icon: Newspaper },
  { id: "requirement-writer",  label: "需求编写",     icon: PenLine },
  { id: "requirement-search",  label: "需求检索",     icon: Search },
];

export function WorkbenchTabs({ activeTab, onChange, counts }: WorkbenchTabsProps) {
  return (
    <div
      role="tablist"
      className="flex h-11 items-center gap-6 border-b border-dls-border px-6 text-sm"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`relative flex h-11 items-center gap-2 transition-colors ${
              active ? "text-dls-text" : "text-dls-secondary hover:text-dls-text"
            }`}
          >
            <Icon size={16} />
            <span>{tab.label}</span>
            <span className="rounded-full bg-dls-hover px-2 text-[11px] leading-[18px] text-dls-secondary">
              {counts[tab.id] ?? 0}
            </span>
            {active ? (
              <span className="absolute inset-x-0 bottom-0 h-[2px] bg-dls-accent" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
