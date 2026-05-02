/** @jsxImportSource react */
import { ArrowRight } from "lucide-react";
import type { AiReport, AiReportType } from "../../types/focus";

// ── 报告类型配置 ──────────────────────────────────────────────────────────────

const REPORT_TYPE_CONFIG: Record<AiReportType, { label: string; bg: string; color: string; iconBg: string }> = {
  "competitive-analysis": { label: "竞品分析",   bg: "#fff7e6", color: "#d46b08", iconBg: "#fa8c16" },
  "user-feedback":        { label: "用户反馈",   bg: "#e6f4ff", color: "#1677ff", iconBg: "#1677ff" },
  "market-trend":         { label: "市场趋势",   bg: "#f6ffed", color: "#389e0d", iconBg: "#52c41a" },
  custom:                 { label: "自定义报告", bg: "#f9f0ff", color: "#722ed1", iconBg: "#722ed1" },
};

// ── 时间格式化 ────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const now     = Date.now();
  const then    = new Date(iso).getTime();
  const diffMs  = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour= Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);
  if (diffMin  <  1) return "刚刚";
  if (diffMin  < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffDay  ===1) return "昨天";
  return `${diffDay} 天前`;
}

// ── ReportRow（对齐 FocusItemRow 结构，纯灰色调） ─────────────────────────────

function ReportRow({
  report,
  onSelectReport,
}: {
  report: AiReport;
  onSelectReport?: (reportId: string) => void;
}) {
  const isNew = report.status === "new";

  return (
    <div
      style={{
        display:       "flex",
        alignItems:    "flex-start",
        gap:           "10px",
        background:    "#fafafa",
        border:        "1px solid #e5e7eb",
        borderRadius:  "8px",
        padding:       "10px 14px",
        position:      "relative",
      }}
    >
      {/* 搭档图标圆（彩色底 emoji） */}
      <div
        style={{
          width:          "22px",
          height:         "22px",
          borderRadius:   "50%",
          background:     REPORT_TYPE_CONFIG[report.reportType].iconBg,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          fontSize:       "13px",
          flexShrink:     0,
          lineHeight:     1,
        }}
      >
        {report.agentIcon}
      </div>

      {/* 内容 */}
      <div style={{ flex: "1 1 0%", minWidth: 0 }}>
        {/* 搭档名 + 类型 tag + NEW badge */}
        <div
          style={{
            display:    "flex",
            alignItems: "center",
            gap:        "6px",
            marginBottom: "2px",
            flexWrap:   "wrap",
          }}
        >
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a" }}>
            {report.agentName}
          </span>
          <span
            style={{
              background:   REPORT_TYPE_CONFIG[report.reportType].bg,
              color:        REPORT_TYPE_CONFIG[report.reportType].color,
              fontSize:     "10px",
              padding:      "0 5px",
              lineHeight:   "18px",
              borderRadius: "4px",
              fontWeight:   600,
              flexShrink:   0,
            }}
          >
            {REPORT_TYPE_CONFIG[report.reportType].label}
          </span>
          {isNew && (
            <span
              style={{
                background:   "#8c8c8c",
                color:        "#fff",
                fontSize:     "9px",
                padding:      "0 4px",
                lineHeight:   "16px",
                borderRadius: "4px",
                fontWeight:   700,
              }}
            >
              NEW
            </span>
          )}
        </div>

        {/* 报告标题 */}
        <div
          style={{
            fontSize:     "12px",
            fontWeight:   500,
            color:        "#444",
            marginBottom: "2px",
            overflow:     "hidden",
            display:      "-webkit-box",
            WebkitLineClamp: 1,
            WebkitBoxOrient: "vertical" as const,
          }}
        >
          {report.title}
        </div>

        {/* 摘要 */}
        <div
          style={{
            fontSize:        "11px",
            color:           "#888",
            lineHeight:      1.6,
            overflow:        "hidden",
            display:         "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as const,
          }}
        >
          {report.summary}
        </div>

        {/* 时间 */}
        <div style={{ fontSize: "11px", color: "#aaa", marginTop: "4px" }}>
          {formatRelativeTime(report.generatedAt)}
        </div>
      </div>

      {/* 查看报告按钮 */}
      <button
          type="button"
          onClick={() => onSelectReport?.(report.id)}
          style={{
            padding:    0,
            flexShrink: 0,
            fontSize:   "12px",
            color:      "#595959",
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
          查看
        </button>
    </div>
  );
}

// ── 空状态 ────────────────────────────────────────────────────────────────────

function EmptyReports() {
  return (
    <div
      style={{
        flex:           "1 1 0%",
        display:        "flex",
        flexDirection:  "column",
        alignItems:     "center",
        justifyContent: "center",
        gap:            "10px",
        textAlign:      "center",
        padding:        "24px 0",
      }}
    >
      <div
        style={{
          width:          "40px",
          height:         "40px",
          borderRadius:   "50%",
          background:     "#e5e7eb",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          fontSize:       "20px",
        }}
      >
        🤖
      </div>
      <div>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "#444" }}>暂无 AI 报告</div>
        <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>
          配置 AI 搭档后，报告将自动生成
        </div>
      </div>
    </div>
  );
}

// ── AiReportsPanel ───────────────────────────────────────────────────────────

export interface AiReportsPanelProps {
  reports: AiReport[];
  onSelectReport?: (reportId: string) => void;
  onViewAllReports?: () => void;
}

export function AiReportsPanel({ reports, onSelectReport, onViewAllReports }: AiReportsPanelProps) {
  return (
    <div
      style={{
        height:        "100%",
        width:         "100%",
        borderRadius:  "12px",
        border:        "1px solid #d9d9d9",
        background:    "linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%)",
        padding:       "16px 20px",
        display:       "flex",
        flexDirection: "column",
        boxSizing:     "border-box",
      }}
    >
      {/* 标题行：图标 + 标题 + 全部按钮 */}
      <div
        style={{
          display:        "flex",
          alignItems:     "center",
          gap:            "12px",
          marginBottom:   "12px",
        }}
      >
        {/* 图标圆（灰色） */}
        <div
          style={{
            width:          "36px",
            height:         "36px",
            borderRadius:   "50%",
            background:     "#595959",
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
            flexShrink:     0,
            fontSize:       "18px",
          }}
        >
          <span style={{ filter: "grayscale(1) brightness(10)" }}>🤖</span>
        </div>

        {/* 标题 + "全部报告" */}
        <div style={{ flex: "1 1 0%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a1a" }}>
            AI 搭档报告
          </span>
          {reports.length > 0 && (
            <button
              type="button"
              onClick={() => onViewAllReports?.()}
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
              }}
            >
              全部报告
              <ArrowRight size={12} />
            </button>
          )}
        </div>
      </div>

      {/* 报告列表 / 空状态 */}
      {reports.length === 0 ? (
        <EmptyReports />
      ) : (
        <div
          style={{
            display:       "flex",
            flexDirection: "column",
            gap:           "8px",
            flex:          "1 1 0%",
            overflowY:     "auto",
          }}
        >
          {reports.map((report) => (
            <ReportRow key={report.id} report={report} onSelectReport={onSelectReport} />
          ))}
        </div>
      )}
    </div>
  );
}
