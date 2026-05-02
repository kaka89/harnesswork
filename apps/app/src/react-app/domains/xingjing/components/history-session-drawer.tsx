/** @jsxImportSource react */
import { useMemo } from "react";
import { ChevronLeft, History, MessageSquare, Plus } from "lucide-react";

import { getDisplaySessionTitle } from "../../../../app/lib/session-title";
import type { SidebarSessionItem } from "../../../../app/types";

export type HistorySessionDrawerProps = {
  workspaceId: string | null;
  selectedSessionId: string | null;
  sessions: SidebarSessionItem[];
  expanded: boolean;
  onToggle: () => void;
  onOpenSession: (workspaceId: string, sessionId: string) => void;
  /** 点击 "+ 新建会话" 按钮时触发（复用 OpenWork 原生 onCreateTaskInWorkspace）。 */
  onCreateSession: () => void;
  /** 新建按钮是否禁用（如无 workspace 或 sidebar.newTaskDisabled）。 */
  createDisabled?: boolean;
};

/**
 * 历史会话抽屉（左侧，折叠/展开）。
 *
 * 收起态（40px）：显示 History 图标，点击展开。
 * 展开态（240px）：按 time.updated 倒序列出当前 workspace 的历史会话，
 * 点击切换到对应会话，当前会话高亮。
 */
export function HistorySessionDrawer({
  workspaceId,
  selectedSessionId,
  sessions,
  expanded,
  onToggle,
  onOpenSession,
  onCreateSession,
  createDisabled = false,
}: HistorySessionDrawerProps) {
  const handleCreate = () => {
    if (createDisabled || !workspaceId) return;
    onCreateSession();
  };
  // 按 time.updated 倒序排列，时间缺失的排最后
  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        const ta = a.time?.updated ?? a.time?.created ?? 0;
        const tb = b.time?.updated ?? b.time?.created ?? 0;
        return tb - ta;
      }),
    [sessions],
  );

  if (!expanded) {
    const createBtnDisabled = createDisabled || !workspaceId;
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 pt-3">
        <button
          type="button"
          title="历史会话"
          onClick={onToggle}
          className="flex h-8 w-8 items-center justify-center rounded-md text-gray-9 transition-colors hover:bg-dls-hover hover:text-dls-text"
          aria-label="展开历史会话"
        >
          <History size={15} />
        </button>
        <button
          type="button"
          title="新建会话"
          onClick={handleCreate}
          disabled={createBtnDisabled}
          className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
            createBtnDisabled
              ? "cursor-not-allowed text-gray-7 opacity-50"
              : "text-gray-9 hover:bg-dls-hover hover:text-dls-text"
          }`}
          aria-label="新建会话"
        >
          <Plus size={15} />
        </button>
      </div>
    );
  }

  const createBtnDisabled = createDisabled || !workspaceId;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-dls-border pl-3 pr-2">
        <span className="text-[13px] font-medium text-dls-text">历史会话</span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={handleCreate}
            disabled={createBtnDisabled}
            title="新建会话"
            aria-label="新建会话"
            className={`rounded-md p-1.5 transition-colors ${
              createBtnDisabled
                ? "cursor-not-allowed text-gray-7 opacity-50"
                : "text-gray-9 hover:bg-dls-hover hover:text-dls-text"
            }`}
          >
            <Plus size={13} />
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md p-1.5 text-gray-9 transition-colors hover:bg-dls-hover hover:text-dls-text"
            aria-label="收起历史会话"
          >
            <ChevronLeft size={13} />
          </button>
        </div>
      </div>

      {/* Session list */}
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {sortedSessions.length === 0 ? (
          <div className="px-3 py-6 text-center text-[13px] text-dls-secondary">
            暂无历史会话
          </div>
        ) : (
          sortedSessions.map((session) => {
            const isSelected = session.id === selectedSessionId;
            const title = getDisplaySessionTitle(session.title);
            const timeMs = session.time?.updated ?? session.time?.created ?? null;
            const timeLabel = timeMs ? formatRelativeTime(timeMs) : null;

            return (
              <button
                key={session.id}
                type="button"
                onClick={() => {
                  if (workspaceId) {
                    onOpenSession(workspaceId, session.id);
                  }
                }}
                className={`group flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-dls-hover ${
                  isSelected ? "bg-dls-hover" : ""
                }`}
                title={title}
              >
                <div className="flex items-center gap-1.5">
                  <MessageSquare
                    size={12}
                    className={`shrink-0 ${isSelected ? "text-blue-9" : "text-gray-8 group-hover:text-gray-10"}`}
                  />
                  <span
                    className={`min-w-0 truncate text-[13px] leading-4 ${
                      isSelected ? "font-medium text-dls-text" : "text-dls-secondary group-hover:text-dls-text"
                    }`}
                  >
                    {title}
                  </span>
                </div>
                {timeLabel ? (
                  <span className="pl-[20px] text-[11px] text-gray-8">{timeLabel}</span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── 相对时间格式化 ─────────────────────────────────────────────────────────────

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
