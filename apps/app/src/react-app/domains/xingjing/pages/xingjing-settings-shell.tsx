/** @jsxImportSource react */
import type { ReactNode } from "react";
import {
  Brain,
  ExternalLink,
  Palette,
  Puzzle,
  RefreshCw,
  RotateCcw,
  Settings2,
  UserCircle,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { SettingsTab } from "../../../../app/types";

// ─────────────────────────────────────────────────────────────────────────────
// Tab 列表定义
// ─────────────────────────────────────────────────────────────────────────────

type XingjingSettingsTabItem = {
  tab: SettingsTab;
  label: string;
  icon: LucideIcon;
};

const XINGJING_SETTINGS_TABS: XingjingSettingsTabItem[] = [
  { tab: "appearance", label: "外观",      icon: Palette    },
  { tab: "general",    label: "AI 模型",   icon: Brain      },
  { tab: "skills",     label: "Skills",   icon: Settings2  },
  { tab: "pipeline",   label: "流水线",    icon: Workflow   },
  { tab: "extensions", label: "工具与插件", icon: Wrench     },
  { tab: "den",        label: "账户",      icon: UserCircle },
  { tab: "advanced",   label: "高级",      icon: Puzzle     },
  { tab: "updates",    label: "更新",      icon: RefreshCw  },
  { tab: "recovery",   label: "恢复",      icon: RotateCcw  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export type XingjingSettingsShellProps = {
  /** 当前激活的 OpenWork tab */
  activeTab: SettingsTab;
  /** 切换到某个 xingjing tab，由 SettingsRoute 传入 navigate */
  onSelectTab: (tab: SettingsTab) => void;
  /** 点击「OpenWork 原始配置」tab，由 SettingsRoute 传入 navigate("/settings/general") */
  onNavigateToOpenWork: () => void;
  /** 当前 tab 的视图内容（OpenWork 原有视图组件） */
  children: ReactNode;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 星静设置页面壳层（独立版专用）。
 *
 * 采用横向 Tab 模式，直接填充到星静主区域（不创建独立全屏外壳）。
 * Tab 复用 OpenWork 原有视图组件，仅替换导航样式与品牌化标题。
 *
 * - 无「返回星静」按钮：由左侧星静主菜单承担导航职责
 * - 末尾追加「OpenWork 原始配置」跳转 Tab，点击直接 navigate 到 /settings/general
 */
export function XingjingSettingsShell(props: XingjingSettingsShellProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* 页面标题区 */}
      <div className="shrink-0 px-6 pt-6 pb-4">
        <h1 className="text-[22px] font-semibold tracking-tight text-gray-12">系统设置</h1>
        <p className="mt-1 text-[13px] text-dls-secondary">
          管理主题、大模型接入、代码仓库、定时任务与流程编排配置
        </p>
      </div>

      {/* 横向 Tab 栏 */}
      <div className="shrink-0 border-b border-dls-border px-6">
        <div className="flex gap-0 overflow-x-auto">
          {XINGJING_SETTINGS_TABS.map(({ tab, label, icon: Icon }) => (
            <button
              key={tab}
              type="button"
              onClick={() => props.onSelectTab(tab)}
              className={[
                "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5",
                "text-[13px] transition-colors",
                props.activeTab === tab
                  ? "border-green-9 font-medium text-green-11"
                  : "border-transparent text-dls-secondary hover:text-dls-text",
              ].join(" ")}
            >
              <Icon size={14} className="shrink-0" />
              {label}
            </button>
          ))}

          {/* 跳转型特殊 Tab：OpenWork 原始配置（无 active 高亮，点击直接跳出） */}
          <button
            type="button"
            onClick={() => props.onNavigateToOpenWork()}
            className="flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-[13px] text-dls-secondary transition-colors hover:text-dls-text"
          >
            <ExternalLink size={14} className="shrink-0" />
            OpenWork 原始配置
          </button>
        </div>
      </div>

      {/* Tab 内容区 */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full space-y-6 p-6">
          {props.children}
        </div>
      </div>
    </div>
  );
}
