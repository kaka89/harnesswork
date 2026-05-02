/** @jsxImportSource react */
import { ArrowRight } from "lucide-react";
import type { FocusBriefing, FocusBriefingItem, TaskPriority } from "../../types/focus";

// ── 优先级配置（精确对照源码色值） ────────────────────────────────────────────

export const PRIORITY_CONFIG: Record<
  TaskPriority,
  {
    label:     string;
    rowBg:     string;   // background
    rowBorder: string;   // border color
    badgeBg:   string;   // 序号圆背景
    tagBg:     string;   // 优先级 tag 背景
  }
> = {
  urgent: {
    label:     "紧急",
    rowBg:     "#fff2f0",
    rowBorder: "#ffccc7",
    badgeBg:   "#ff4d4f",
    tagBg:     "#ff4d4f",
  },
  important: {
    label:     "重要",
    rowBg:     "#fffbe6",
    rowBorder: "#ffe58f",
    badgeBg:   "#faad14",
    tagBg:     "#faad14",
  },
  normal: {
    label:     "普通",
    rowBg:     "#f0f9ff",
    rowBorder: "#bae0ff",
    badgeBg:   "#1677ff",
    tagBg:     "#1677ff",
  },
  low: {
    label:     "低优",
    rowBg:     "#f9fafb",
    rowBorder: "#d9d9d9",
    badgeBg:   "#8c8c8c",
    tagBg:     "#8c8c8c",
  },
};

// ── action → 跳转文字 ─────────────────────────────────────────────────────────

const ACTION_LABEL: Record<string, string> = {
  cockpit:           "去驾驶舱",
  "product-insight": "去产品洞察",
  "product-dev":     "去产品研发",
  knowledge:         "去知识库",
  "ai-partner":      "去AI搭档",
};

// ── FocusItemRow ──────────────────────────────────────────────────────────────

export function FocusItemRow({
  item,
  index,
  onAction,
}: {
  item: FocusBriefingItem;
  index: number;
  onAction: (action: string) => void;
}) {
  const cfg = PRIORITY_CONFIG[item.priority];

  return (
    <div
      style={{
        display:       "flex",
        alignItems:    "flex-start",
        gap:           "10px",
        background:    cfg.rowBg,
        border:        `1px solid ${cfg.rowBorder}`,
        borderRadius:  "8px",
        padding:       "10px 14px",
      }}
    >
      {/* 序号圆 */}
      <div
        style={{
          width:          "22px",
          height:         "22px",
          borderRadius:   "50%",
          background:     cfg.badgeBg,
          color:          "#fff",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          fontWeight:     700,
          fontSize:       "12px",
          flexShrink:     0,
        }}
      >
        {index + 1}
      </div>

      {/* 内容 */}
      <div style={{ flex: "1 1 0%", minWidth: 0 }}>
        {/* 标题 + 优先级 tag */}
        <div
          style={{
            display:    "flex",
            alignItems: "center",
            gap:        "8px",
            marginBottom: "2px",
            flexWrap:   "wrap",
          }}
        >
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a" }}>
            {item.title}
          </span>
          <span
            style={{
              background:  cfg.tagBg,
              color:       "#fff",
              fontSize:    "10px",
              padding:     "0 5px",
              lineHeight:  "18px",
              borderRadius: "4px",
              fontWeight:  500,
              flexShrink:  0,
            }}
          >
            {cfg.label}
          </span>
        </div>
        {/* 原因描述 */}
        <span style={{ fontSize: "12px", color: "#888" }}>
          {item.reason}
        </span>
      </div>

      {/* 跳转按钮（有 action 才显示） */}
      {item.action && (
        <button
          type="button"
          onClick={() => onAction(item.action!)}
          style={{
            padding:    0,
            flexShrink: 0,
            fontSize:   "12px",
            color:      "#1677ff",
            background: "none",
            border:     "none",
            cursor:     "pointer",
            display:    "flex",
            alignItems: "center",
            gap:        "3px",
            whiteSpace: "nowrap",
          }}
        >
          <ArrowRight size={12} />
          {ACTION_LABEL[item.action] ?? "查看"}
        </button>
      )}
    </div>
  );
}

// ── AiBriefingBanner ─────────────────────────────────────────────────────────

export interface AiBriefingBannerProps {
  briefing: FocusBriefing;
  onAction: (action: string) => void;
  onViewAll?: () => void;
}

export function AiBriefingBanner({ briefing, onAction, onViewAll }: AiBriefingBannerProps) {
  return (
    <div
      style={{
        height:       "100%",
        width:        "100%",
        borderRadius: "12px",
        border:       "1px solid #91caff",
        background:   "linear-gradient(135deg, #f0f9ff 0%, #e6f7ff 100%)",
        padding:      "16px 20px",
        display:      "flex",
        flexDirection: "column",
        boxSizing:    "border-box",
      }}
    >
      {/* 标题行：机器人图标 + 标题 + 全部简报按钮 + 摘要 */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "12px" }}>
        {/* 机器人图标圆 */}
        <div
          style={{
            width:          "36px",
            height:         "36px",
            borderRadius:   "50%",
            background:     "#1264e5",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            flexShrink:     0,
          }}
        >
          <span style={{ color: "#fff", fontSize: "18px", lineHeight: 1 }}>🤖</span>
        </div>

        {/* 标题 + 全部简报按钮 + 摘要 */}
        <div style={{ flex: "1 1 0%", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a1a" }}>
              AI 今日简报
            </div>
            {briefing.items.length > 0 && (
              <button
                type="button"
                onClick={() => onViewAll?.()}
                style={{
                  padding:    0,
                  fontSize:   "12px",
                  color:      "#595959",
                  background: "none",
                  border:     "none",
                  cursor:     "pointer",
                  display:    "flex",
                  alignItems: "center",
                  gap:        "3px",
                  flexShrink: 0,
                }}
              >
                全部简报
                <ArrowRight size={12} />
              </button>
            )}
          </div>
          <div style={{ marginTop: "6px", fontSize: "13px", color: "#444" }}>
            {briefing.summary}
          </div>
        </div>
      </div>

      {/* 焦点项列表 */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: "1 1 0%", overflowY: "auto" }}>
        {briefing.items.map((item, idx) => (
          <FocusItemRow
            key={item.id}
            item={item}
            index={idx}
            onAction={onAction}
          />
        ))}
      </div>
    </div>
  );
}
