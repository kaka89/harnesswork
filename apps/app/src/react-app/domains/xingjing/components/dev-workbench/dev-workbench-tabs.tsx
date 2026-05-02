/** @jsxImportSource react */
import type { LucideIcon } from "lucide-react";
import { Cpu, Code2, CheckSquare } from "lucide-react";
import type { DevWorkbenchTabId } from "../../types/dev-workbench";

export interface DevWorkbenchTabsProps {
  activeTab: DevWorkbenchTabId;
  onChange: (tab: DevWorkbenchTabId) => void;
  counts: Record<DevWorkbenchTabId, number>;
}

const TABS: Array<{ id: DevWorkbenchTabId; label: string; icon: LucideIcon }> = [
  { id: "arch-design",   label: "架构设计", icon: Cpu },
  { id: "dev-execution", label: "开发执行", icon: Code2 },
  { id: "review",        label: "成果评审", icon: CheckSquare },
];

export function DevWorkbenchTabs({ activeTab, onChange, counts }: DevWorkbenchTabsProps) {
  return (
    <div
      role="tablist"
      className="flex h-11 shrink-0 items-center gap-6 border-b border-dls-border px-6 text-sm"
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
            <Icon size={15} />
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
