/** @jsxImportSource react */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart2,
  BookOpen,
  Bot,
  ChevronLeft,
  ChevronRight,
  Code2,
  LayoutDashboard,
  Lightbulb,
  Loader2,
  Moon,
  RefreshCcw,
  Redo2,
  Rocket,
  Settings,
  Shield,
  Target,
  Undo2,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { t } from "../../../../i18n";
import { buildOpenworkWorkspaceBaseUrl } from "../../../../app/lib/openwork-server";
import { getDisplaySessionTitle } from "../../../../app/lib/session-title";
import { Button } from "../../../design-system/button";
import { ConfirmModal } from "../../../design-system/modals/confirm-modal";
import ProviderAuthModal from "../../connections/provider-auth/provider-auth-modal";
import { QuestionModal } from "../../session/modals/question-modal";
import { RenameSessionModal } from "../../session/modals/rename-session-modal";
import { SessionSurface } from "../../session/surface/session-surface";
import { ShareWorkspaceModal } from "../../workspace/share-workspace-modal";
import { OwDotTicker } from "../../../shell/dot-ticker";
import { useReactRenderWatchdog } from "../../../shell/react-render-watchdog";
import { ArtifactsDrawer } from "../components/artifacts-drawer";
import type { SessionPageProps } from "../../session/chat/session-page";

// ── Nav section type ──────────────────────────────────────────────────────────

type XingjingNavSection =
  | "autopilot"
  | "cockpit"
  | "focus"
  | "product-insight"
  | "product-dev"
  | "release"
  | "data-review"
  | "knowledge"
  | "ai-partner"
  | "settings";

const NAV_ITEMS: { id: XingjingNavSection; label: string; icon: LucideIcon }[] = [
  { id: "autopilot", label: "自动驾驶", icon: Zap },
  { id: "cockpit", label: "驾驶舱", icon: LayoutDashboard },
  { id: "focus", label: "今日焦点", icon: Target },
  { id: "product-insight", label: "产品洞察", icon: Lightbulb },
  { id: "product-dev", label: "产品研发", icon: Code2 },
  { id: "release", label: "发布管理", icon: Rocket },
  { id: "data-review", label: "数据复盘", icon: BarChart2 },
  { id: "knowledge", label: "个人知识库", icon: BookOpen },
  { id: "ai-partner", label: "AI搭档", icon: Bot },
  { id: "settings", label: "设置", icon: Settings },
];

const AGENTS = [
  { id: "atmosphere", label: "AI氛围搭档", color: "bg-purple-3 text-purple-11" },
  { id: "product", label: "AI产品搭档", color: "bg-blue-3 text-blue-11" },
  { id: "engineer", label: "AI工程搭档", color: "bg-green-3 text-green-11" },
  { id: "growth", label: "AI增长搭档", color: "bg-orange-3 text-orange-11" },
  { id: "operations", label: "AI运营搭档", color: "bg-pink-3 text-pink-11" },
];

// ── Private helper ────────────────────────────────────────────────────────────

function sessionTitleForId(
  groups: SessionPageProps["sidebar"]["workspaceSessionGroups"],
  id: string | null | undefined,
) {
  if (!id) return "";
  for (const group of groups) {
    const match = group.sessions.find((session: { id: string; title?: string }) => session.id === id);
    if (match) return getDisplaySessionTitle(match.title);
  }
  return "";
}

// ── XingjingNavSidebar (180px left panel) ─────────────────────────────────────

function XingjingNavSidebar({
  activeSection,
  onSelect,
  clientConnected,
}: {
  activeSection: XingjingNavSection;
  onSelect: (section: XingjingNavSection) => void;
  clientConnected: boolean;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Logo */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-dls-border px-3">
        <Moon size={15} className="shrink-0 text-yellow-9/70" />
        <span className="text-[13px] font-semibold text-green-11">星静</span>
        <span className="ml-1 text-[10px] text-dls-secondary/60">All-in-One</span>
      </div>

      {/* Edition toggle */}
      <div className="flex shrink-0 gap-1 border-b border-dls-border px-2 py-1.5">
        <button
          type="button"
          className="flex-1 rounded py-0.5 text-[11px] text-dls-secondary hover:bg-dls-hover"
        >
          团队版
        </button>
        <button
          type="button"
          className="flex-1 rounded bg-green-2/70 py-0.5 text-[11px] font-medium text-green-11"
        >
          独立版
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto py-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeSection;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`flex items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
                isActive
                  ? "bg-green-2/50 font-medium text-green-11"
                  : "text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
              }`}
            >
              <Icon size={13} className="shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Work mode & connection status */}
      <div className="shrink-0 border-t border-dls-border p-2">
        <p className="mb-1 text-[10px] text-dls-secondary">今日工作模式</p>
        <div className="flex gap-1">
          <button
            type="button"
            className="flex-1 rounded bg-green-3/70 py-0.5 text-[11px] font-medium text-green-11"
          >
            专注
          </button>
          <button
            type="button"
            className="flex-1 rounded py-0.5 text-[11px] text-dls-secondary hover:bg-dls-hover"
          >
            碎片
          </button>
        </div>
        <div
          className={`mt-1.5 flex items-center gap-1.5 text-[10px] ${
            clientConnected ? "text-green-10" : "text-gray-10"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              clientConnected ? "bg-green-9" : "bg-gray-7"
            }`}
          />
          OpenWork {clientConnected ? "✓ 已连接" : "断开"}
        </div>
      </div>
    </div>
  );
}

// ── XingjingAgentsPanel (168px, collapsible) ──────────────────────────────────

function XingjingAgentsPanel({ onCollapse }: { onCollapse: () => void }) {
  return (
    <div className="flex w-[168px] shrink-0 flex-col border-r border-dls-border bg-dls-surface/60">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-dls-border px-3">
        <span className="text-[12px] font-medium text-dls-text">AI虚拟团队</span>
        <button
          type="button"
          onClick={onCollapse}
          className="rounded p-0.5 text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
          title="收起"
        >
          <ChevronLeft size={13} />
        </button>
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto py-2">
        {AGENTS.map((agent) => (
          <button
            key={agent.id}
            type="button"
            className={`mx-2 rounded-lg px-2 py-2 text-left text-[12px] font-medium transition-colors hover:opacity-80 ${agent.color}`}
          >
            {agent.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── XingjingSessionPage ───────────────────────────────────────────────────────

/**
 * 星静独立会话页（5区域布局）。
 *
 * 接受与 SessionPage 完全相同的 SessionPageProps，作为 session-route.tsx 中
 * SessionPage 的直接替换（当 localStorage xingjing.app-mode === "xingjing" 时）。
 *
 * 布局：顶栏(h-10) + 左导航(180px) + Agent面板(168px，可折叠) + 主内容(flex-1) + 右 ArtifactsDrawer
 *
 * 不修改 session-page.tsx，通过 import type 复用其公开类型。
 */
export function XingjingSessionPage(props: SessionPageProps) {
  const navigate = useNavigate();

  useReactRenderWatchdog("XingjingSessionPage", {
    selectedSessionId: props.selectedSessionId,
    selectedWorkspaceId: props.selectedWorkspaceId,
    clientConnected: props.clientConnected,
    startupPhase: props.startupPhase,
    hasSurface: Boolean(props.surface),
    workspaceCount: props.workspaces.length,
  });

  const [activeSection, setActiveSection] = useState<XingjingNavSection>("cockpit");
  const [agentsPanelOpen, setAgentsPanelOpen] = useState(true);
  const [rightExpanded, setRightExpanded] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [showDelayedSessionLoadingState, setShowDelayedSessionLoadingState] = useState(false);

  const selectedSessionTitle = useMemo(
    () => sessionTitleForId(props.sidebar.workspaceSessionGroups, props.selectedSessionId),
    [props.selectedSessionId, props.sidebar.workspaceSessionGroups],
  );

  const showWorkspaceSetupEmptyState = props.workspaces.length === 0 && !props.selectedSessionId;
  const showStartupSkeleton =
    !props.selectedSessionId &&
    !props.clientConnected &&
    props.startupPhase !== "sessionIndexReady" &&
    props.startupPhase !== "firstSessionReady" &&
    props.startupPhase !== "ready";
  const showSessionLoadingState =
    Boolean(props.selectedSessionId) &&
    props.sessionLoadingById(props.selectedSessionId) &&
    !showWorkspaceSetupEmptyState;

  const reactSessionBaseUrl = useMemo(() => {
    const workspaceId = props.runtimeWorkspaceId?.trim() ?? "";
    const baseUrl = props.openworkServerClient?.baseUrl?.trim() ?? "";
    if (!workspaceId || !baseUrl) return "";
    const mounted = buildOpenworkWorkspaceBaseUrl(baseUrl, workspaceId) ?? baseUrl;
    return `${mounted.replace(/\/+$/, "")}/opencode`;
  }, [props.openworkServerClient?.baseUrl, props.runtimeWorkspaceId]);

  const reactSessionToken =
    props.openworkServerClient?.token?.trim() || props.openworkServerToken?.trim() || "";
  const canRenderReactSurface = Boolean(
    props.selectedSessionId &&
      props.runtimeWorkspaceId &&
      props.openworkServerClient &&
      reactSessionBaseUrl &&
      reactSessionToken &&
      props.surface,
  );

  useEffect(() => {
    if (!showSessionLoadingState) {
      setShowDelayedSessionLoadingState(false);
      return;
    }
    const id = window.setTimeout(() => setShowDelayedSessionLoadingState(true), 1000);
    return () => window.clearTimeout(id);
  }, [showSessionLoadingState]);

  useEffect(() => {
    setRenameOpen(false);
    setDeleteOpen(false);
    setRenameBusy(false);
    setDeleteBusy(false);
  }, [props.selectedSessionId]);

  const openRenameModal = () => {
    if (!props.selectedSessionId || !props.onRenameSession) return;
    setRenameTitle(selectedSessionTitle);
    setRenameOpen(true);
  };

  const submitRename = async () => {
    const sessionId = props.selectedSessionId;
    const nextTitle = renameTitle.trim();
    if (!sessionId || !props.onRenameSession || !nextTitle || nextTitle === selectedSessionTitle.trim())
      return;
    setRenameBusy(true);
    try {
      await props.onRenameSession(sessionId, nextTitle);
      setRenameOpen(false);
    } finally {
      setRenameBusy(false);
    }
  };

  const confirmDelete = async () => {
    const sessionId = props.selectedSessionId;
    if (!sessionId || !props.onDeleteSession) return;
    setDeleteBusy(true);
    try {
      await props.onDeleteSession(sessionId);
      setDeleteOpen(false);
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f7f7f8] text-dls-text">
      {/* ── TitleBar h-10 ──────────────────────────────────────────────────── */}
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-dls-border bg-white/80 px-3 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem("xingjing.app-mode");
            navigate("/mode-select");
          }}
          className="flex items-center gap-1 rounded px-2 py-1 text-[12px] text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
        >
          <ChevronLeft size={13} />
          返回模式选择
        </button>
        <span className="mx-1 text-dls-border/60">|</span>
        <Moon size={13} className="shrink-0 text-yellow-9/70" />
        <span className="text-[13px] font-semibold text-green-11">星静</span>
        <span className="text-[11px] text-dls-secondary">All-in-One 研发平台</span>
      </header>

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Left nav 180px */}
        <div className="flex w-[180px] shrink-0 flex-col border-r border-dls-border bg-white">
          <XingjingNavSidebar
            activeSection={activeSection}
            onSelect={setActiveSection}
            clientConnected={props.clientConnected}
          />
        </div>

        {/* Agents panel (collapsible) */}
        {agentsPanelOpen ? (
          <XingjingAgentsPanel onCollapse={() => setAgentsPanelOpen(false)} />
        ) : (
          <div className="flex w-6 shrink-0 flex-col items-center border-r border-dls-border bg-dls-surface/50 pt-3">
            <button
              type="button"
              onClick={() => setAgentsPanelOpen(true)}
              className="rounded p-0.5 text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
              title="展开 AI 虚拟团队"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        )}

        {/* Main content flex-1 */}
        <div className="flex min-w-0 flex-1 flex-col bg-dls-surface">
          {/* Sub header h-10 */}
          <div className="flex h-10 shrink-0 items-center justify-between border-b border-dls-border px-4">
            <div className="flex items-center gap-2 text-[12px] text-dls-secondary">
              <span className="font-medium text-dls-text">独立版</span>
              <span>·</span>
              <span>AI虚拟团队</span>
              {props.history ? (
                <>
                  <span>·</span>
                  <button
                    type="button"
                    className="flex items-center rounded px-1 py-0.5 hover:bg-dls-hover disabled:opacity-40"
                    onClick={() => void props.history?.onUndo()}
                    disabled={!props.history.canUndo || props.history.busyAction !== null}
                    title={t("session.undo_title")}
                  >
                    {props.history.busyAction === "undo" ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Undo2 size={12} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="flex items-center rounded px-1 py-0.5 hover:bg-dls-hover disabled:opacity-40"
                    onClick={() => void props.history?.onRedo()}
                    disabled={!props.history.canRedo || props.history.busyAction !== null}
                    title={t("session.redo_title")}
                  >
                    {props.history.busyAction === "redo" ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Redo2 size={12} />
                    )}
                  </button>
                </>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={props.sidebar.onOpenCreateWorkspace}>
                + 新建
              </Button>
            </div>
          </div>

          {/* Session surface area */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {showStartupSkeleton ? (
              <div className="px-6 py-14" role="status" aria-live="polite">
                <div className="mx-auto max-w-2xl space-y-6">
                  <div className="space-y-2">
                    <div className="h-4 w-32 animate-pulse rounded-full bg-dls-hover/80" />
                    <div className="h-3 w-64 animate-pulse rounded-full bg-dls-hover/60" />
                  </div>
                  <div className="space-y-3">
                    {[0, 1, 2].map((idx) => (
                      <div
                        key={idx}
                        className="rounded-2xl border border-dls-border bg-dls-hover/40 p-4"
                      >
                        <div
                          className="mb-3 h-3 animate-pulse rounded-full bg-dls-hover/80"
                          style={{ width: idx === 0 ? "42%" : idx === 1 ? "56%" : "36%" }}
                        />
                        <div className="space-y-2">
                          <div className="h-2.5 animate-pulse rounded-full bg-dls-hover/70" />
                          <div
                            className="h-2.5 animate-pulse rounded-full bg-dls-hover/60"
                            style={{ width: idx === 2 ? "74%" : "88%" }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {showDelayedSessionLoadingState ? (
              <div className="px-6 py-16">
                <div
                  className="mx-auto flex max-w-[320px] flex-col items-center gap-3 text-center"
                  role="status"
                  aria-live="polite"
                >
                  <OwDotTicker size="md" />
                  <div className="text-[12px] leading-5 text-dls-secondary">
                    {t("session.loading_detail")}
                  </div>
                </div>
              </div>
            ) : null}

            {!showDelayedSessionLoadingState && canRenderReactSurface ? (
              <SessionSurface
                client={props.openworkServerClient!}
                workspaceId={props.runtimeWorkspaceId!}
                sessionId={props.selectedSessionId!}
                opencodeBaseUrl={reactSessionBaseUrl}
                openworkToken={reactSessionToken}
                {...props.surface!}
              />
            ) : null}

            {!showDelayedSessionLoadingState && !canRenderReactSurface && !showStartupSkeleton ? (
              <div
                className={`mx-auto max-w-[800px] px-6 ${
                  showWorkspaceSetupEmptyState ? "pt-20" : "pt-10"
                }`}
              >
                {showWorkspaceSetupEmptyState ? (
                  <div className="space-y-6 px-6 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-dls-border bg-dls-hover">
                      <Zap className="text-dls-secondary" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-xl font-medium">
                        {t("session.create_or_connect_workspace")}
                      </h3>
                      <p className="mx-auto max-w-sm text-sm text-dls-secondary">
                        {t("workspace.empty_state_body")}
                      </p>
                    </div>
                    <div className="flex justify-center">
                      <Button onClick={props.sidebar.onOpenCreateWorkspace}>
                        {t("workspace.create_workspace")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="px-6 py-16 text-center text-sm text-dls-secondary">
                    {props.selectedSessionId
                      ? t("session.loading_detail")
                      : t("session.select_or_create_session")}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {/* Right ArtifactsDrawer */}
        <div
          className="flex shrink-0 flex-col border-l border-dls-border bg-dls-sidebar transition-[width] duration-200"
          style={{ width: rightExpanded ? 280 : 40 }}
        >
          <ArtifactsDrawer
            workspaceId={props.selectedWorkspaceId}
            sessionId={props.selectedSessionId}
            expanded={rightExpanded}
            onToggle={() => setRightExpanded((v) => !v)}
          />
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {props.providerAuthModal ? <ProviderAuthModal {...props.providerAuthModal} /> : null}

      {props.onRenameSession ? (
        <RenameSessionModal
          open={renameOpen}
          title={renameTitle}
          busy={renameBusy}
          canSave={
            renameTitle.trim().length > 0 &&
            renameTitle.trim() !== selectedSessionTitle.trim()
          }
          onClose={() => {
            if (!renameBusy) setRenameOpen(false);
          }}
          onSave={() => void submitRename()}
          onTitleChange={setRenameTitle}
        />
      ) : null}

      {props.onDeleteSession ? (
        <ConfirmModal
          open={deleteOpen}
          title={t("session.delete_session_title")}
          message={
            selectedSessionTitle.trim()
              ? t("session.delete_named_session_message", undefined, {
                  title: selectedSessionTitle.trim(),
                })
              : t("session.delete_session_generic")
          }
          confirmLabel={deleteBusy ? t("session.deleting") : t("session.delete")}
          cancelLabel={t("common.cancel")}
          variant="danger"
          onConfirm={() => void confirmDelete()}
          onCancel={() => {
            if (!deleteBusy) setDeleteOpen(false);
          }}
        />
      ) : null}

      {props.shareWorkspaceModal ? <ShareWorkspaceModal {...props.shareWorkspaceModal} /> : null}

      {props.activePermission ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-1/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-amber-7/30 bg-gray-2 shadow-2xl">
            <div className="p-6">
              <div className="mb-4 flex items-start gap-4">
                <div className="rounded-full bg-amber-7/10 p-3 text-amber-6">
                  {props.activePermission.permission === "doom_loop" ? (
                    <RefreshCcw size={24} />
                  ) : (
                    <Shield size={24} />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-dls-text">
                    {t("session.permission_required")}
                  </h3>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-amber-9 px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-amber-10 disabled:opacity-60"
                  onClick={() => props.respondPermission?.(props.activePermission!.id, "once")}
                  disabled={props.permissionReplyBusy}
                >
                  {t("session.allow_once")}
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-lg border border-dls-border bg-dls-hover px-3 py-2 text-[13px] font-medium text-dls-text transition-colors hover:bg-gray-3 disabled:opacity-60"
                  onClick={() => props.respondPermission?.(props.activePermission!.id, "reject")}
                  disabled={props.permissionReplyBusy}
                >
                  {t("session.deny")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <QuestionModal
        open={Boolean(props.activeQuestion)}
        questions={props.activeQuestion?.questions ?? []}
        busy={props.questionReplyBusy ?? false}
        onReply={(answers) => {
          if (props.activeQuestion) {
            props.respondQuestion?.(props.activeQuestion.id, answers);
          }
        }}
      />
    </div>
  );
}
