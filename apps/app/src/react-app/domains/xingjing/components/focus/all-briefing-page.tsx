/** @jsxImportSource react */
import { useState, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import type { FocusBriefing, FocusBriefingItem, TaskPriority } from "../../types/focus";
import { FocusItemRow, PRIORITY_CONFIG } from "./ai-briefing-banner";

// ── 优先级筛选 chip ────────────────────────────────────────────────────────────

const PRIORITY_OPTIONS: Array<{ value: TaskPriority | "all"; label: string }> = [
  { value: "all",       label: "全部"  },
  { value: "urgent",    label: "紧急"  },
  { value: "important", label: "重要"  },
  { value: "normal",    label: "普通"  },
  { value: "low",       label: "低优"  },
];

// ── AllBriefingPage ────────────────────────────────────────────────────────────

export interface AllBriefingPageProps {
  briefing:  FocusBriefing;
  onBack:    () => void;
  onAction:  (action: string) => void;
}

export function AllBriefingPage({ briefing, onBack, onAction }: AllBriefingPageProps) {
  const [keyword,        setKeyword]        = useState("");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return briefing.items.filter((item: FocusBriefingItem) => {
      const matchKw = !kw ||
        item.title.toLowerCase().includes(kw) ||
        item.reason.toLowerCase().includes(kw);
      const matchPriority = priorityFilter === "all" || item.priority === priorityFilter;
      return matchKw && matchPriority;
    });
  }, [briefing.items, keyword, priorityFilter]);

  return (
    <div
      style={{
        height:        "100%",
        display:       "flex",
        flexDirection: "column",
        background:    "linear-gradient(135deg, #f0f9ff 0%, #e6f7ff 100%)",
        boxSizing:     "border-box",
      }}
    >
      {/* ── 顶栏 */}
      <div
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          "12px",
          padding:      "14px 20px",
          borderBottom: "1px solid #bae0ff",
          flexShrink:   0,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{
            display:    "flex",
            alignItems: "center",
            gap:        "4px",
            padding:    0,
            background: "none",
            border:     "none",
            cursor:     "pointer",
            fontSize:   "13px",
            color:      "#1677ff",
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={14} />
          返回
        </button>
        <div style={{ flex: "1 1 0%", fontSize: "15px", fontWeight: 700, color: "#1a1a1a" }}>
          AI 今日简报
        </div>
        <div style={{ fontSize: "12px", color: "#888" }}>
          共 {filtered.length} 条焦点事项
        </div>
      </div>

      {/* ── 搜索 + 筛选 */}
      <div
        style={{
          padding:       "12px 20px 8px",
          display:       "flex",
          flexDirection: "column",
          gap:           "8px",
          flexShrink:    0,
          borderBottom:  "1px solid #bae0ff",
        }}
      >
        {/* 关键字搜索 */}
        <input
          type="text"
          placeholder="搜索焦点事项…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{
            width:        "100%",
            padding:      "7px 12px",
            borderRadius: "8px",
            border:       "1px solid #bae0ff",
            background:   "rgba(255,255,255,0.8)",
            fontSize:     "13px",
            color:        "#1a1a1a",
            outline:      "none",
            boxSizing:    "border-box",
          }}
        />
        {/* 优先级筛选 chips */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {PRIORITY_OPTIONS.map((opt) => {
            const isActive = priorityFilter === opt.value;
            const cfg = opt.value !== "all" ? PRIORITY_CONFIG[opt.value] : null;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPriorityFilter(opt.value)}
                style={{
                  padding:      "3px 10px",
                  borderRadius: "12px",
                  fontSize:     "12px",
                  fontWeight:   isActive ? 600 : 400,
                  border:       isActive
                    ? `1.5px solid ${cfg ? cfg.badgeBg : "#1677ff"}`
                    : "1.5px solid #bae0ff",
                  background: isActive
                    ? (cfg ? cfg.tagBg : "#1677ff")
                    : "rgba(255,255,255,0.7)",
                  color:  isActive ? "#fff" : "#444",
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 列表 */}
      <div
        style={{
          flex:          "1 1 0%",
          overflowY:     "auto",
          padding:       "12px 20px",
          display:       "flex",
          flexDirection: "column",
          gap:           "8px",
        }}
      >
        {filtered.length === 0 ? (
          <div
            style={{
              flex:           "1 1 0%",
              display:        "flex",
              flexDirection:  "column",
              alignItems:     "center",
              justifyContent: "center",
              gap:            "8px",
              color:          "#888",
              fontSize:       "13px",
              paddingTop:     "40px",
            }}
          >
            <span style={{ fontSize: "28px" }}>🔍</span>
            暂无符合条件的焦点事项
          </div>
        ) : (
          filtered.map((item: FocusBriefingItem, idx: number) => (
            <FocusItemRow
              key={item.id}
              item={item}
              index={idx}
              onAction={onAction}
            />
          ))
        )}
      </div>
    </div>
  );
}
