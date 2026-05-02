/** @jsxImportSource react */
import { useState, useMemo } from "react";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import type { AiReport, AiReportType } from "../../types/focus";
import { FocusDetailPanel } from "./focus-detail-panel";

// ── 报告类型配置（与 ai-reports-panel.tsx 保持一致） ──────────────────────────

const REPORT_TYPE_CONFIG: Record<AiReportType, { label: string; bg: string; color: string; iconBg: string }> = {
  "competitive-analysis": { label: "竞品分析",   bg: "#fff7e6", color: "#d46b08", iconBg: "#fa8c16" },
  "user-feedback":        { label: "用户反馈",   bg: "#e6f4ff", color: "#1677ff", iconBg: "#1677ff" },
  "market-trend":         { label: "市场趋势",   bg: "#f6ffed", color: "#389e0d", iconBg: "#52c41a" },
  custom:                 { label: "自定义报告", bg: "#f9f0ff", color: "#722ed1", iconBg: "#722ed1" },
};

const TYPE_TABS: { key: AiReportType | "all"; label: string }[] = [
  { key: "all",                    label: "全部" },
  { key: "competitive-analysis",   label: "竞品分析" },
  { key: "user-feedback",          label: "用户反馈" },
  { key: "market-trend",           label: "市场趋势" },
  { key: "custom",                 label: "自定义报告" },
];

// ── 时间格式化 ────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const diffMs  = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour= Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);
  if (diffMin  <  1) return "刚刚";
  if (diffMin  < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffDay === 1) return "昨天";
  return `${diffDay} 天前`;
}

// ── AllReportRow ──────────────────────────────────────────────────────────────

function AllReportRow({
  report,
  isSelected,
  onSelect,
}: {
  report:     AiReport;
  isSelected: boolean;
  onSelect:   (id: string) => void;
}) {
  const typeCfg = REPORT_TYPE_CONFIG[report.reportType];
  const isNew       = report.status === "new";
  const isImportant = report.status === "important";

  return (
    <div
      onClick={() => onSelect(report.id)}
      style={{
        background:   "#fff",
        border:       isSelected ? "2px solid #1677ff" : "1px solid #e5e7eb",
        borderRadius: "10px",
        padding:      "12px 16px",
        cursor:       "pointer",
        transition:   "box-shadow 0.15s, border-color 0.15s",
        boxShadow:    isSelected ? "0 0 0 3px rgba(22,119,255,0.08)" : "0 1px 3px rgba(0,0,0,0.05)",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)";
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        {/* 搭档图标圆 */}
        <div style={{
          width:          "28px",
          height:         "28px",
          borderRadius:   "50%",
          background:     typeCfg.iconBg,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          fontSize:       "15px",
          flexShrink:     0,
          lineHeight:     1,
        }}>
          {report.agentIcon}
        </div>

        {/* 内容区 */}
        <div style={{ flex: "1 1 0%", minWidth: 0 }}>
          {/* 第一行：搭档名 + 类型 + 状态 + 时间 */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a" }}>
              {report.agentName}
            </span>
            <span style={{
              background:   typeCfg.bg,
              color:        typeCfg.color,
              fontSize:     "10px",
              padding:      "0 5px",
              lineHeight:   "18px",
              borderRadius: "4px",
              fontWeight:   600,
              flexShrink:   0,
            }}>
              {typeCfg.label}
            </span>
            {isNew && (
              <span style={{
                background: "#8c8c8c", color: "#fff",
                fontSize: "9px", padding: "0 4px", lineHeight: "16px", borderRadius: "4px", fontWeight: 700,
              }}>
                NEW
              </span>
            )}
            {isImportant && (
              <span style={{
                background: "#fff7e6", color: "#d46b08",
                fontSize: "9px", padding: "0 4px", lineHeight: "16px", borderRadius: "4px", fontWeight: 700,
              }}>
                重要
              </span>
            )}
            <span style={{ marginLeft: "auto", fontSize: "11px", color: "#aaa", flexShrink: 0 }}>
              {formatRelativeTime(report.generatedAt)}
            </span>
          </div>

          {/* 报告标题 */}
          <div style={{
            fontSize: "13px", fontWeight: 500, color: "#333",
            marginBottom: "4px",
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 1,
            WebkitBoxOrient: "vertical" as const,
          }}>
            {report.title}
          </div>

          {/* 摘要（3行） */}
          <div style={{
            fontSize:        "12px",
            color:           "#888",
            lineHeight:      1.65,
            overflow:        "hidden",
            display:         "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical" as const,
          }}>
            {report.summary}
          </div>
        </div>

        {/* 查看按钮 */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelect(report.id); }}
          style={{
            flexShrink: 0,
            padding:    0,
            fontSize:   "12px",
            color:      "#595959",
            background: "none",
            border:     "none",
            cursor:     "pointer",
            display:    "flex",
            alignItems: "center",
            gap:        "3px",
            marginTop:  "2px",
            whiteSpace: "nowrap",
          }}
        >
          <ArrowRight size={12} />
          查看
        </button>
      </div>
    </div>
  );
}

// ── 空搜索结果 ────────────────────────────────────────────────────────────────

function EmptySearch() {
  return (
    <div style={{
      flex:           "1 1 0%",
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      gap:            "12px",
      padding:        "60px 0",
      textAlign:      "center",
    }}>
      <div style={{
        width:          "48px",
        height:         "48px",
        borderRadius:   "50%",
        background:     "#e5e7eb",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        fontSize:       "22px",
      }}>
        🔍
      </div>
      <div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#444" }}>没有匹配的报告</div>
        <div style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}>调整搜索词或筛选条件试试</div>
      </div>
    </div>
  );
}

// ── AgentChip ─────────────────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onClick,
}: {
  label:   string;
  active:  boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize:     "12px",
        padding:      "3px 10px",
        borderRadius: "16px",
        border:       active ? "1px solid #1677ff" : "1px solid #e5e7eb",
        background:   active ? "#e6f4ff" : "#fff",
        color:        active ? "#1677ff" : "#555",
        cursor:       "pointer",
        fontWeight:   active ? 600 : 400,
        whiteSpace:   "nowrap",
        transition:   "all 0.12s",
      }}
    >
      {label}
    </button>
  );
}

// ── AllReportsPage ────────────────────────────────────────────────────────────

export interface AllReportsPageProps {
  reports:          AiReport[];
  onBack:           () => void;
  onSelectReport:   (reportId: string) => void;
  selectedReportId: string | null;
}

export function AllReportsPage({
  reports,
  onBack,
  onSelectReport,
  selectedReportId,
}: AllReportsPageProps) {
  const [keyword,     setKeyword]     = useState("");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [typeFilter,  setTypeFilter]  = useState<AiReportType | "all">("all");

  // 动态提取所有搭档名（去重，保持原顺序）
  const agents = useMemo(
    () => Array.from(new Set(reports.map((r) => r.agentName))),
    [reports],
  );

  // 过滤逻辑
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return reports.filter((r) => {
      const matchKw =
        !kw ||
        r.title.toLowerCase().includes(kw) ||
        r.summary.toLowerCase().includes(kw) ||
        r.agentName.toLowerCase().includes(kw);
      const matchAgent = agentFilter === "all" || r.agentName === agentFilter;
      const matchType  = typeFilter  === "all" || r.reportType === typeFilter;
      return matchKw && matchAgent && matchType;
    });
  }, [reports, keyword, agentFilter, typeFilter]);

  const selectedReport = reports.find((r) => r.id === selectedReportId) ?? null;
  const hasPanel = selectedReport !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f7f8fa" }}>

      {/* ── 顶栏 ──────────────────────────────────────────────────────────── */}
      <header style={{
        display:       "flex",
        alignItems:    "center",
        gap:           "12px",
        padding:       "0 20px",
        height:        "48px",
        flexShrink:    0,
        background:    "#fff",
        borderBottom:  "1px solid #e5e7eb",
      }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            display:    "flex",
            alignItems: "center",
            gap:        "4px",
            fontSize:   "13px",
            color:      "#595959",
            background: "none",
            border:     "none",
            cursor:     "pointer",
            padding:    "4px 8px 4px 0",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#1a1a1a"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#595959"; }}
        >
          <ArrowLeft size={14} />
          返回今日焦点
        </button>

        <div style={{ width: "1px", height: "16px", background: "#e5e7eb", flexShrink: 0 }} />

        <span style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a1a" }}>AI 搭档报告</span>

        <span style={{
          marginLeft:   "auto",
          fontSize:     "12px",
          color:        "#888",
          flexShrink:   0,
        }}>
          共 {filtered.length} 份报告
        </span>
      </header>

      {/* ── 主区：左侧列表 + 右侧详情 ────────────────────────────────────── */}
      <div style={{ display: "flex", flex: "1 1 0%", overflow: "hidden" }}>

        {/* 左侧：搜索 + 筛选 + 列表 */}
        <div style={{
          flex:          "1 1 0%",
          display:       "flex",
          flexDirection: "column",
          overflow:      "hidden",
          minWidth:      0,
        }}>
          {/* 搜索 + 筛选区 */}
          <div style={{
            padding:      "14px 20px 10px",
            background:   "#fff",
            borderBottom: "1px solid #f0f0f0",
            flexShrink:   0,
          }}>
            {/* 搜索栏 */}
            <div style={{
              display:      "flex",
              alignItems:   "center",
              gap:          "8px",
              background:   "#f5f5f5",
              border:       "1px solid #e5e7eb",
              borderRadius: "8px",
              padding:      "7px 12px",
              marginBottom: "10px",
            }}>
              <Search size={13} style={{ color: "#aaa", flexShrink: 0 }} />
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索报告标题、摘要、搭档名..."
                style={{
                  flex:       "1 1 0%",
                  border:     "none",
                  background: "none",
                  outline:    "none",
                  fontSize:   "13px",
                  color:      "#333",
                }}
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => setKeyword("")}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: "12px", color: "#aaa", padding: 0, lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* 筛选行 1：搭档 */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "11px", color: "#aaa", flexShrink: 0, minWidth: "28px" }}>搭档</span>
              <FilterChip label="全部" active={agentFilter === "all"} onClick={() => setAgentFilter("all")} />
              {agents.map((name) => (
                <FilterChip
                  key={name}
                  label={name}
                  active={agentFilter === name}
                  onClick={() => setAgentFilter(agentFilter === name ? "all" : name)}
                />
              ))}
            </div>

            {/* 筛选行 2：类型 */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "11px", color: "#aaa", flexShrink: 0, minWidth: "28px" }}>类型</span>
              {TYPE_TABS.map((tab) => (
                <FilterChip
                  key={tab.key}
                  label={tab.label}
                  active={typeFilter === tab.key}
                  onClick={() => setTypeFilter(tab.key)}
                />
              ))}
            </div>
          </div>

          {/* 报告列表 */}
          <div style={{
            flex:      "1 1 0%",
            overflowY: "auto",
            padding:   "12px 20px",
            display:   "flex",
            flexDirection: "column",
            gap:       "8px",
          }}>
            {filtered.length === 0 ? (
              <EmptySearch />
            ) : (
              filtered.map((r) => (
                <AllReportRow
                  key={r.id}
                  report={r}
                  isSelected={r.id === selectedReportId}
                  onSelect={onSelectReport}
                />
              ))
            )}
          </div>
        </div>

        {/* 右侧：详情面板（复用 FocusDetailPanel） */}
        {hasPanel && (
          <FocusDetailPanel
            task={null}
            report={selectedReport}
            onClose={() => onSelectReport(selectedReportId!)}
            onUpdateTask={() => {}}
          />
        )}
      </div>
    </div>
  );
}
