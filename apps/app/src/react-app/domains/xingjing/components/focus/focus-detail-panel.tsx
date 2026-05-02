/** @jsxImportSource react */
import { useState, useCallback } from "react";
import { X, ArrowRight, CheckCircle2, Clock, AlertCircle, MessageSquare, Pencil, Plus } from "lucide-react";
import type { FocusTask, AiReport, TaskStatus, TaskPriority, AiReportType } from "../../types/focus";

// ── 样式常量（与 kanban-board 保持一致） ──────────────────────────────────────

const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "待办", todo: "计划", in_progress: "进行中",
  in_review: "评审中", done: "已完成", blocked: "已阻塞", cancelled: "已取消",
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  urgent: "紧急", important: "重要", normal: "普通", low: "低优",
};

const PRIORITY_COLOR: Record<TaskPriority, string> = {
  urgent: "#ff4d4f", important: "#faad14", normal: "#1677ff", low: "#8c8c8c",
};

const REPORT_TYPE_CONFIG: Record<AiReportType, { label: string; bg: string; color: string; iconBg: string }> = {
  "competitive-analysis": { label: "竞品分析", bg: "#fff7e6", color: "#d46b08", iconBg: "#fa8c16" },
  "user-feedback":        { label: "用户反馈", bg: "#e6f4ff", color: "#1677ff", iconBg: "#1677ff" },
  "market-trend":         { label: "市场趋势", bg: "#f6ffed", color: "#389e0d", iconBg: "#52c41a" },
  custom:                 { label: "自定义报告", bg: "#f9f0ff", color: "#722ed1", iconBg: "#722ed1" },
};

// ── 时间格式化 ────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  if (diffHour < 24) return `${diffHour} 小时前`;
  if (diffDay === 1) return "昨天";
  if (diffDay < 7) return `${diffDay} 天前`;
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  return `${m}/${day} ${hh}:${mm}`;
}

// ── 活动类型图标 ──────────────────────────────────────────────────────────────

function ActivityIcon({ type }: { type: string }) {
  const base: React.CSSProperties = {
    width: "20px", height: "20px", borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  };
  if (type === "created") return (
    <div style={{ ...base, background: "#e6f4ff" }}>
      <CheckCircle2 size={11} color="#1677ff" />
    </div>
  );
  if (type === "status_change") return (
    <div style={{ ...base, background: "#f6ffed" }}>
      <Clock size={11} color="#52c41a" />
    </div>
  );
  if (type === "priority_change") return (
    <div style={{ ...base, background: "#fff7e6" }}>
      <AlertCircle size={11} color="#fa8c16" />
    </div>
  );
  if (type === "comment") return (
    <div style={{ ...base, background: "#f9f0ff" }}>
      <MessageSquare size={11} color="#722ed1" />
    </div>
  );
  // edited
  return (
    <div style={{ ...base, background: "#f5f5f5" }}>
      <Pencil size={11} color="#8c8c8c" />
    </div>
  );
}

// ── TaskDetailView ────────────────────────────────────────────────────────────

function TaskDetailView({
  task,
  onUpdate,
  onNavigate,
}: {
  task: FocusTask;
  onUpdate: (t: FocusTask) => void;
  onNavigate?: (section: string) => void;
}) {
  const [title,    setTitle]  = useState(task.title);
  const [status,   setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPrio]   = useState<TaskPriority>(task.priority);
  const [dueLabel, setDue]    = useState(task.dueLabel ?? "");
  const [desc,     setDesc]   = useState(task.description ?? "");
  const [tags,     setTags]   = useState<string[]>(task.tags);
  const [tagInput, setTagIn]  = useState("");
  const [dirty,    setDirty]  = useState(false);

  const mark = useCallback(() => setDirty(true), []);

  const addTag = () => {
    const v = tagInput.trim();
    if (v && !tags.includes(v)) { setTags([...tags, v]); mark(); }
    setTagIn("");
  };

  const handleSave = () => {
    onUpdate({ ...task, title: title.trim() || task.title, status, priority, dueLabel: dueLabel || undefined, description: desc, tags });
    setDirty(false);
  };

  const inputStyle: React.CSSProperties = {
    border: "1px solid #e5e7eb", borderRadius: "6px", padding: "5px 10px",
    fontSize: "12px", outline: "none", background: "#fff",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 标题 */}
      <div style={{ padding: "16px 16px 12px" }}>
        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value); mark(); }}
          style={{
            width: "100%", boxSizing: "border-box",
            border: "none", borderBottom: "1px solid #e5e7eb",
            padding: "4px 0", fontSize: "14px", fontWeight: 700,
            color: "#1a1a1a", outline: "none", background: "transparent",
          }}
        />
      </div>

      {/* 元信息 */}
      <div style={{ padding: "0 16px 12px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value as TaskStatus); mark(); }}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          {(Object.entries(STATUS_LABEL) as [TaskStatus, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => { setPrio(e.target.value as TaskPriority); mark(); }}
          style={{ ...inputStyle, cursor: "pointer", color: PRIORITY_COLOR[priority] }}
        >
          {(Object.entries(PRIORITY_LABEL) as [TaskPriority, string][]).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          value={dueLabel}
          onChange={(e) => { setDue(e.target.value); mark(); }}
          placeholder="截止时间"
          style={{ ...inputStyle, width: "80px" }}
        />
      </div>

      {/* 描述 */}
      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#888", marginBottom: "6px" }}>描述</div>
        <textarea
          value={desc}
          onChange={(e) => { setDesc(e.target.value); mark(); }}
          placeholder="添加任务描述…"
          rows={3}
          style={{
            ...inputStyle, width: "100%", boxSizing: "border-box",
            resize: "none", lineHeight: 1.6,
          }}
        />
      </div>

      {/* 标签 */}
      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#888", marginBottom: "6px" }}>标签</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "6px" }}>
          {tags.map((tag) => (
            <span
              key={tag}
              style={{
                display: "flex", alignItems: "center", gap: "3px",
                background: "#f3f4f6", borderRadius: "9999px",
                padding: "1px 8px", fontSize: "11px", color: "#555",
              }}
            >
              {tag}
              <button
                type="button"
                onClick={() => { setTags(tags.filter((x) => x !== tag)); mark(); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", padding: 0, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
          <div style={{ display: "flex", gap: "4px" }}>
            <input
              value={tagInput}
              onChange={(e) => setTagIn(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
              placeholder="+ 标签"
              style={{ ...inputStyle, width: "70px", fontSize: "11px" }}
            />
            <button
              type="button"
              onClick={addTag}
              style={{ ...inputStyle, cursor: "pointer", padding: "3px 8px", display: "flex", alignItems: "center" }}
            >
              <Plus size={11} color="#888" />
            </button>
          </div>
        </div>
      </div>

      {/* 分割线 */}
      <div style={{ borderTop: "1px solid #f0f0f0", margin: "0 16px" }} />

      {/* 活动记录 */}
      <div style={{ padding: "12px 16px", flex: "1 1 0%", overflowY: "auto" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#888", marginBottom: "10px" }}>活动记录</div>
        {(task.activity && task.activity.length > 0) ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {[...(task.activity)].reverse().map((entry) => (
              <div key={entry.id} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <ActivityIcon type={entry.type} />
                <div style={{ flex: "1 1 0%", minWidth: 0 }}>
                  <div style={{ fontSize: "12px", color: "#444", lineHeight: 1.5 }}>{entry.content}</div>
                  <div style={{ fontSize: "11px", color: "#aaa", marginTop: "2px" }}>{formatTime(entry.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: "12px", color: "#bbb", textAlign: "center", padding: "12px 0" }}>
            暂无活动记录
          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div style={{
        padding: "12px 16px",
        borderTop: "1px solid #f0f0f0",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={() => onNavigate?.("cockpit")}
          style={{
            display: "flex", alignItems: "center", gap: "4px",
            border: "1px solid #e5e7eb", borderRadius: "6px",
            padding: "5px 12px", fontSize: "12px", color: "#555",
            background: "#fff", cursor: "pointer",
          }}
        >
          <ArrowRight size={12} />
          开始执行
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty}
          style={{
            border: "none", borderRadius: "6px",
            padding: "5px 16px", fontSize: "12px",
            background: dirty ? "#1677ff" : "#e5e7eb",
            color: dirty ? "#fff" : "#aaa",
            cursor: dirty ? "pointer" : "default",
            fontWeight: 500, transition: "all 0.15s",
          }}
        >
          保存
        </button>
      </div>
    </div>
  );
}

// ── ReportDetailView ──────────────────────────────────────────────────────────

function ReportDetailView({
  report,
  onNavigate,
}: {
  report: AiReport;
  onNavigate?: (section: string) => void;
}) {
  const cfg = REPORT_TYPE_CONFIG[report.reportType];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 搭档信息 */}
      <div style={{ padding: "16px 16px 12px", display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{
          width: "36px", height: "36px", borderRadius: "50%",
          background: cfg.iconBg, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: "18px", flexShrink: 0,
        }}>
          {report.agentIcon}
        </div>
        <div style={{ flex: "1 1 0%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#1a1a1a" }}>{report.agentName}</span>
            <span style={{
              background: cfg.bg, color: cfg.color,
              fontSize: "10px", padding: "0 5px", lineHeight: "18px",
              borderRadius: "4px", fontWeight: 600,
            }}>
              {cfg.label}
            </span>
            {report.status === "new" && (
              <span style={{
                background: "#1677ff", color: "#fff",
                fontSize: "9px", padding: "0 4px", lineHeight: "16px",
                borderRadius: "4px", fontWeight: 700,
              }}>
                NEW
              </span>
            )}
          </div>
          <div style={{ fontSize: "11px", color: "#aaa", marginTop: "2px" }}>{formatTime(report.generatedAt)}</div>
        </div>
      </div>

      {/* 报告标题 */}
      <div style={{ padding: "0 16px 12px" }}>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "#1a1a1a", lineHeight: 1.4 }}>
          {report.title}
        </div>
      </div>

      {/* 内容区（可滚动） */}
      <div style={{ flex: "1 1 0%", overflowY: "auto", padding: "0 16px 12px" }}>
        {/* 摘要 */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "11px", fontWeight: 600, color: "#888", marginBottom: "6px" }}>摘要</div>
          <div style={{
            fontSize: "13px", color: "#444", lineHeight: 1.7,
            background: "#fafafa", borderRadius: "8px", padding: "10px 12px",
            border: "1px solid #f0f0f0",
          }}>
            {report.summary}
          </div>
        </div>

        {/* 关键发现 */}
        {report.keyFindings && report.keyFindings.length > 0 && (
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "#888", marginBottom: "8px" }}>关键发现</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {report.keyFindings.map((finding, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  <div style={{
                    width: "18px", height: "18px", borderRadius: "50%",
                    background: cfg.bg, color: cfg.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "10px", fontWeight: 700, flexShrink: 0, marginTop: "1px",
                  }}>
                    {i + 1}
                  </div>
                  <span style={{ fontSize: "12px", color: "#444", lineHeight: 1.6 }}>{finding}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 建议行动 */}
        {report.recommendations && report.recommendations.length > 0 && (
          <div>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "#888", marginBottom: "8px" }}>建议行动</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {report.recommendations.map((rec, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: "8px",
                  background: "#f0f9ff", borderRadius: "6px", padding: "8px 10px",
                  border: "1px solid #bae0ff",
                }}>
                  <ArrowRight size={12} color="#1677ff" style={{ marginTop: "2px", flexShrink: 0 }} />
                  <span style={{ fontSize: "12px", color: "#1a1a1a", lineHeight: 1.6 }}>{rec}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div style={{
        padding: "12px 16px",
        borderTop: "1px solid #f0f0f0",
        flexShrink: 0,
      }}>
        <button
          type="button"
          onClick={() => onNavigate?.("ai-partner")}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
            gap: "6px", border: "none", borderRadius: "8px",
            padding: "8px 0", fontSize: "13px",
            background: cfg.iconBg, color: "#fff",
            cursor: "pointer", fontWeight: 500,
          }}
        >
          <ArrowRight size={13} />
          与搭档对话
        </button>
      </div>
    </div>
  );
}

// ── FocusDetailPanel（主导出） ────────────────────────────────────────────────

export interface FocusDetailPanelProps {
  task:         FocusTask | null;
  report:       AiReport  | null;
  onClose:      () => void;
  onUpdateTask: (t: FocusTask) => void;
  onNavigate?:  (section: string) => void;
}

export function FocusDetailPanel({ task, report, onClose, onUpdateTask, onNavigate }: FocusDetailPanelProps) {
  const isTask = task !== null;

  return (
    <div style={{
      width: "360px", flexShrink: 0,
      borderLeft: "1px solid #e5e7eb",
      background: "#fff",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Panel 头部 */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px",
        borderBottom: "1px solid #f0f0f0",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: "12px", fontWeight: 600, color: "#888" }}>
          {isTask ? "任务详情" : "报告详情"}
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "4px", borderRadius: "4px", color: "#aaa",
            display: "flex", alignItems: "center",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#f3f4f6"; (e.currentTarget as HTMLButtonElement).style.color = "#555"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; (e.currentTarget as HTMLButtonElement).style.color = "#aaa"; }}
        >
          <X size={14} />
        </button>
      </div>

      {/* 内容区 */}
      <div style={{ flex: "1 1 0%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {isTask && task ? (
          <TaskDetailView task={task} onUpdate={onUpdateTask} onNavigate={onNavigate} />
        ) : report ? (
          <ReportDetailView report={report} onNavigate={onNavigate} />
        ) : null}
      </div>
    </div>
  );
}
