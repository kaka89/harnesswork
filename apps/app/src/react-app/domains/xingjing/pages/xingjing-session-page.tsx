/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart2,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  LayoutDashboard,
  Briefcase,
  Moon,
  Plus,
  RefreshCcw,
  Rocket,
  Settings,
  Shield,
  Target,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { t } from "../../../../i18n";
import type { OpenworkServerClient, OpenworkServerStatus } from "../../../../app/lib/openwork-server";
import { buildOpenworkWorkspaceBaseUrl } from "../../../../app/lib/openwork-server";
import { getDisplaySessionTitle } from "../../../../app/lib/session-title";
import type { SettingsTab } from "../../../../app/types";
import { Button } from "../../../design-system/button";
import { ConfirmModal } from "../../../design-system/modals/confirm-modal";
import ProviderAuthModal from "../../connections/provider-auth/provider-auth-modal";
import { QuestionModal } from "../../session/modals/question-modal";
import { RenameSessionModal } from "../../session/modals/rename-session-modal";
import { SessionSurface } from "../../session/surface/session-surface";
import { ShareWorkspaceModal } from "../../workspace/share-workspace-modal";
import { OwDotTicker } from "../../../shell/dot-ticker";
import { useReactRenderWatchdog } from "../../../shell/react-render-watchdog";
import { SettingsRoute } from "../../../shell/settings-route";
import { ArtifactsDrawer } from "../components/artifacts-drawer";
import { HistorySessionDrawer } from "../components/history-session-drawer";
import { AiPartnerPage } from "./ai-partner-page";
import { ProductWorkbenchPage } from "./product-workbench-page";
import type { SessionPageProps } from "../../session/chat/session-page";
import { PipelineLaunchDialog } from "../components/pipeline/pipeline-launch-dialog";
import { PipelineTriggerBar } from "../components/pipeline/pipeline-trigger-bar";
import { SessionHeaderExtensions } from "../components/pipeline/session-header-extensions";
import type { PipelineLaunchMode } from "../components/pipeline/session-header-extensions";
import { usePipelineDefinitions } from "../hooks/use-pipeline-definitions";
import { usePipelineLauncher } from "../hooks/use-pipeline-launcher";
import type { PipelineDefinition, PipelineScope } from "../pipeline/types";

// ── Nav section type ──────────────────────────────────────────────────────────

type XingjingNavSection =
  | "cockpit"
  | "focus"
  | "product-insight"
  | "product-dev"
  | "release"
  | "data-review"
  | "knowledge"
  | "ai-partner"
  | "settings";

type NavLeaf = { id: XingjingNavSection; label: string; icon: LucideIcon };
type NavGroup = {
  kind: "group";
  id: "autopilot-group";
  label: string;
  icon: LucideIcon;
  children: NavLeaf[];
};
type NavNode = NavLeaf | NavGroup;

function isNavGroup(node: NavNode): node is NavGroup {
  return (node as NavGroup).kind === "group";
}

const NAV_TREE: NavNode[] = [
  {
    kind: "group",
    id: "autopilot-group",
    label: "自动驾驶",
    icon: Zap,
    children: [
      { id: "cockpit", label: "驾驶舱", icon: LayoutDashboard },
      { id: "focus", label: "今日焦点", icon: Target },
      { id: "product-insight", label: "产品工作台", icon: Briefcase },
      { id: "product-dev", label: "产品研发", icon: Code2 },
      { id: "release", label: "发布管理", icon: Rocket },
      { id: "data-review", label: "数据复盘", icon: BarChart2 },
    ],
  },
  { id: "knowledge", label: "个人知识库", icon: BookOpen },
  { id: "ai-partner", label: "AI搭档", icon: Bot },
  { id: "settings", label: "设置", icon: Settings },
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

// ── Section metadata（二级菜单占位页信息）───────────────────────────────────────

const SECTION_META: Partial<
  Record<XingjingNavSection, { label: string; icon: LucideIcon; description: string }>
> = {
  focus: {
    label: "今日焦点",
    icon: Target,
    description: "用户今日需要处理的任务",
  },
  "product-dev": {
    label: "产品研发",
    icon: Code2,
    description: "研发角色的工作页面",
  },
  release: {
    label: "发布管理",
    icon: Rocket,
    description: "产品发布的工作页面",
  },
  "data-review": {
    label: "数据复盘",
    icon: BarChart2,
    description: "产品运营的数据页面",
  },
};

// ── Section → PipelineScope 映射 ─────────────────────────────────────────────

const SECTION_SCOPE: Partial<Record<XingjingNavSection, PipelineScope>> = {
  "product-insight": "product-insight",
  "product-dev": "product-dev",
  "release": "release-ops",
};

// ── XingjingPlaceholderPage launch props ─────────────────────────────────────

interface PlaceholderLaunchProps {
  openworkServerClient: import("../../../../app/lib/openwork-server").OpenworkServerClient | null;
  workspaceId: string | null;
  opencodeBaseUrl: string;
  token: string;
  workspacePath?: string;
  onNavigateToSettings: () => void;
  onSessionCreated: (sessionId: string) => void;
}

// ── XingjingPlaceholderPage ───────────────────────────────────────────────────

function XingjingPlaceholderPage({
  section,
  launchProps,
}: {
  section: XingjingNavSection;
  launchProps: PlaceholderLaunchProps;
}) {
  const meta = SECTION_META[section];
  if (!meta) return null;
  const Icon = meta.icon;

  const scope = SECTION_SCOPE[section] ?? null;

  const { pipelines, isLoading } = usePipelineDefinitions(
    launchProps.openworkServerClient,
    launchProps.workspaceId,
  );

  const scopedPipelines = scope ? pipelines.filter((p) => p.scope === scope) : [];

  const [launchDialogDef, setLaunchDialogDef] = useState<PipelineDefinition | null>(null);

  const { launch, launching, launchError, clearError } = usePipelineLauncher({
    opencodeBaseUrl: launchProps.opencodeBaseUrl,
    token: launchProps.token,
    workspacePath: launchProps.workspacePath,
    onSessionCreated: launchProps.onSessionCreated,
  });

  const handleLaunchRequest = (def: PipelineDefinition) => {
    clearError();
    if (def.inputs.length === 0) {
      // 无需收集 inputs，直接用空 goal 启动（兜底）
      void launch(def, "", {});
    } else {
      setLaunchDialogDef(def);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Pipeline trigger bar */}
      {scope ? (
        <PipelineTriggerBar
          scope={scope}
          pipelines={scopedPipelines}
          isLoading={isLoading}
          launching={launching}
          launchError={launchError}
          onLaunch={handleLaunchRequest}
          onOpenSettings={launchProps.onNavigateToSettings}
        />
      ) : null}

      {/* Main placeholder content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-dls-border bg-dls-hover/60">
          <Icon size={28} className="text-dls-secondary" />
        </div>
        <div className="space-y-1.5 text-center">
          <h2 className="text-[18px] font-semibold text-dls-text">{meta.label}</h2>
          <p className="text-[13px] text-dls-secondary">{meta.description}</p>
        </div>
      </div>

      {/* Launch dialog */}
      <PipelineLaunchDialog
        open={Boolean(launchDialogDef)}
        def={launchDialogDef}
        launching={launching}
        launchError={launchError}
        onLaunch={(def, goal, inputValues) => {
          setLaunchDialogDef(null);
          void launch(def, goal, inputValues);
        }}
        onClose={() => {
          setLaunchDialogDef(null);
          clearError();
        }}
      />
    </div>
  );
}

// ── XingjingNavSidebar (180px left panel) ─────────────────────────────────────

// ── CopyUrlButton ────────────────────────────────────────────────────────────────

function CopyUrlButton({ owUrl, owToken }: { owUrl: string; owToken: string }) {
  const [copied, setCopied] = useState(false);
  const buildInviteUrl = () => {
    const base = window.location.origin;
    const params = new URLSearchParams({
      ow_url: owUrl,
      ow_startup: "server",
      ow_auto_connect: "1",
    });
    if (owToken) params.set("ow_token", owToken);
    return `${base}?${params.toString()}`;
  };
  const handleCopy = () => {
    void navigator.clipboard.writeText(buildInviteUrl()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  const display = owUrl.replace(/^https?:\/\//, "");
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-[10px] text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
      title={copied ? "已复制" : "点击复制浏览器访问链接"}
    >
      <Copy size={10} className="shrink-0" />
      <span className="truncate">{copied ? "已复制!" : display}</span>
    </button>
  );
}

// ── XingjingNavSidebar ─────────────────────────────────────────────────────

function XingjingNavSidebar({
  activeSection,
  onSelect,
  clientConnected,
  openworkServerClient,
}: {
  activeSection: XingjingNavSection;
  onSelect: (section: XingjingNavSection) => void;
  clientConnected: boolean;
  openworkServerClient: OpenworkServerClient | null;
  openworkServerStatus: OpenworkServerStatus;
}) {
  // 一级分组"自动驾驶"的折叠态，默认展开
  const [autopilotExpanded, setAutopilotExpanded] = useState(true);
  return (
    <div className="flex h-full flex-col overflow-hidden">
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
        {NAV_TREE.map((node) => {
          // 一级分组标题：自动驾驶（可折叠，默认展开，不参与 active 高亮）
          if (isNavGroup(node)) {
            const GroupIcon = node.icon;
            const ChevronIcon = autopilotExpanded ? ChevronDown : ChevronRight;
            return (
              <div key={node.id} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => setAutopilotExpanded((v) => !v)}
                  className="flex items-center gap-2 px-3 py-1.5 text-left text-[12px] font-medium text-dls-secondary transition-colors hover:bg-dls-hover hover:text-dls-text"
                  aria-expanded={autopilotExpanded}
                >
                  <GroupIcon size={13} className="shrink-0" />
                  <span className="flex-1">{node.label}</span>
                  <ChevronIcon size={12} className="shrink-0 opacity-70" />
                </button>
                {autopilotExpanded
                  ? node.children.map((child) => {
                      const ChildIcon = child.icon;
                      const isActive = child.id === activeSection;
                      return (
                        <button
                          key={child.id}
                          type="button"
                          onClick={() => onSelect(child.id)}
                          className={`flex items-center gap-2 py-1.5 pr-3 text-left text-[12px] transition-colors ${
                            isActive
                              ? "border-l-2 border-green-9 bg-green-2/50 pl-[26px] font-medium text-green-11"
                              : "pl-7 text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
                          }`}
                        >
                          <ChildIcon size={13} className="shrink-0" />
                          {child.label}
                        </button>
                      );
                    })
                  : null}
              </div>
            );
          }

          // 其余一级叶子项：个人知识库 / AI搭档 / 设置
          const Icon = node.icon;
          const isActive = node.id === activeSection;
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelect(node.id)}
              className={`flex items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
                isActive
                  ? "bg-green-2/50 font-medium text-green-11"
                  : "text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
              }`}
            >
              <Icon size={13} className="shrink-0" />
              {node.label}
            </button>
          );
        })}
      </nav>

      {/* Connection status panel */}
      <div className="shrink-0 space-y-1.5 border-t border-dls-border p-2">
        {/* OpenWork 状态行 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              clientConnected ? "bg-green-9" : "bg-gray-7"
            }`} />
            <span className={clientConnected ? "text-green-10" : "text-gray-10"}>
              OpenWork
            </span>
          </div>
          <span className={`text-[10px] ${
            clientConnected ? "text-green-10" : "text-gray-9"
          }`}>
            {clientConnected ? "已连接" : "断开"}
          </span>
        </div>
        {/* OpenCode 状态行 */}
        {(() => {
          const baseUrl = openworkServerClient?.baseUrl ?? "";
          const opencodeConnected = clientConnected && Boolean(baseUrl);
          return (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  opencodeConnected ? "bg-green-9" : "bg-gray-7"
                }`} />
                <span className={opencodeConnected ? "text-green-10" : "text-gray-10"}>
                  OpenCode
                </span>
              </div>
              <span className={`text-[10px] ${
                opencodeConnected ? "text-green-10" : "text-gray-9"
              }`}>
                {opencodeConnected ? "已连接" : "断开"}
              </span>
            </div>
          );
        })()}
        {/* 浏览器访问 URL（点击复制） */}
        {openworkServerClient?.baseUrl ? (
          <CopyUrlButton
            owUrl={openworkServerClient.baseUrl}
            owToken={openworkServerClient.token?.trim() ?? ""}
          />
        ) : null}
      </div>
    </div>
  );
}

// ── WorkspaceSwitcher ───────────────────────────────────────────────────────

/**
 * 产品（workspace）切换下拉组件。
 * 触发器显示当前产品名，下拉面板列出所有产品并提供「新建产品」入口。
 */
function WorkspaceSwitcher({
  workspaces,
  selectedWorkspaceId,
  selectedWorkspaceDisplay,
  onSelectWorkspace,
  onOpenCreateWorkspace,
}: {
  workspaces: SessionPageProps["workspaces"];
  selectedWorkspaceId: string;
  selectedWorkspaceDisplay: SessionPageProps["selectedWorkspaceDisplay"];
  onSelectWorkspace: (id: string) => void;
  onOpenCreateWorkspace: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const currentName =
    selectedWorkspaceDisplay.displayName ||
    selectedWorkspaceDisplay.name ||
    workspaces.find((w) => w.id === selectedWorkspaceId)?.displayName ||
    workspaces.find((w) => w.id === selectedWorkspaceId)?.name ||
    "选择或新建产品";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 items-center gap-1.5 rounded-md border border-dls-border px-3 text-[12px] hover:bg-dls-hover"
      >
        <span className="max-w-[160px] truncate">{currentName}</span>
        <ChevronDown size={12} className="shrink-0 text-dls-secondary" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-[200px] overflow-hidden rounded-lg border border-dls-border bg-white shadow-lg">
          {workspaces.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-dls-secondary">
              <div className="mb-2 text-[32px] opacity-30">📭</div>
              <span className="text-[12px]">暂无数据</span>
            </div>
          ) : (
            <div className="py-1">
              {workspaces.map((ws) => {
                const isActive = ws.id === selectedWorkspaceId;
                const wsName = ws.displayName || ws.name;
                return (
                  <button
                    key={ws.id}
                    type="button"
                    onClick={() => {
                      onSelectWorkspace(ws.id);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] hover:bg-dls-hover"
                  >
                    <Check
                      size={12}
                      className={`shrink-0 ${isActive ? "text-green-11" : "opacity-0"}`}
                    />
                    <span className="flex-1 truncate">{wsName}</span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="border-t border-dls-border">
            <button
              type="button"
              onClick={() => {
                onOpenCreateWorkspace();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-green-11 hover:bg-dls-hover"
            >
              <Plus size={12} className="shrink-0" />
              新建产品
            </button>
          </div>
        </div>
      )}
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
  // 仅在驾驶舱（cockpit）挂载左右两栏（历史会话、产物抽屉）；切到其他 Section 时整块从 DOM 移除
  const isCockpit = activeSection === "cockpit";
    const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>("appearance");
  const [rightExpanded, setRightExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [showDelayedSessionLoadingState, setShowDelayedSessionLoadingState] = useState(false);

  const currentWorkspaceSessions = useMemo(() => {
    const group = props.sidebar.workspaceSessionGroups.find(
      (g) => g.workspace.id === props.selectedWorkspaceId,
    );
    return group?.sessions ?? [];
  }, [props.sidebar.workspaceSessionGroups, props.selectedWorkspaceId]);

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

  // ── launchProps — 传给 XingjingPlaceholderPage 的启动参数 ──────────────────
  const workspacePath = useMemo(() => {
    const ws = props.workspaces.find((w) => w.id === props.selectedWorkspaceId);
    return ws?.path?.trim() || undefined;
  }, [props.workspaces, props.selectedWorkspaceId]);

  const placeholderLaunchProps = useMemo<PlaceholderLaunchProps>(
    () => ({
      openworkServerClient: props.openworkServerClient,
      workspaceId: props.selectedWorkspaceId || null,
      opencodeBaseUrl: reactSessionBaseUrl,
      token: reactSessionToken,
      workspacePath,
      onNavigateToSettings: () => setActiveSection("settings"),
      onSessionCreated: (sessionId: string) => {
        setActiveSection("cockpit");
        navigate(`/session/${sessionId}`);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.openworkServerClient, props.selectedWorkspaceId, reactSessionBaseUrl, reactSessionToken, workspacePath, navigate],
  );

  // ── 驾驶舱 HeaderExtensions 的流水线启动 hook ─────────────────────────────
  const { pipelines: allPipelines, isLoading: pipelinesLoading } = usePipelineDefinitions(
    props.openworkServerClient,
    props.selectedWorkspaceId || null,
  );

  const { launch: headerLaunch, launching: headerLaunching } = usePipelineLauncher({
    opencodeBaseUrl: reactSessionBaseUrl,
    token: reactSessionToken,
    workspacePath,
    onSessionCreated: (sessionId: string) => {
      setActiveSection("cockpit");
      navigate(`/session/${sessionId}`);
    },
  });

  const [headerLaunchDialogDef, setHeaderLaunchDialogDef] = useState<PipelineDefinition | null>(null);
  const [headerLaunchMode, setHeaderLaunchMode] = useState<PipelineLaunchMode>("new-session");

  const handleHeaderLaunchRequest = (def: PipelineDefinition, mode: PipelineLaunchMode) => {
    setHeaderLaunchMode(mode);
    if (def.inputs.length === 0) {
      void headerLaunch(def, "", {}, { mode, parentSessionId: mode === "current-session" ? (props.selectedSessionId ?? undefined) : undefined });
    } else {
      setHeaderLaunchDialogDef(def);
    }
  };

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
      {/* ── Row 1: 返回行 h-7 ────────────────────────────────────────── */}
      <div className="flex h-7 shrink-0 items-center bg-white/60 px-2">
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem("xingjing.app-mode");
            navigate("/mode-select");
          }}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
        >
          <ChevronLeft size={12} />
          返回模式选择
        </button>
      </div>

      {/* ── Row 2: 全宽 Logo + slogan + WorkspaceSwitcher h-10 ────────────── */}
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-dls-border bg-white/80 px-3">
        <Moon size={15} className="shrink-0 text-yellow-9/70" />
        <span className="text-[13px] font-semibold text-green-11">星静</span>
        <span className="text-[10px] text-dls-secondary/60">All-in-One</span>
        <span className="mx-2 text-dls-border/40">|</span>
        <span className="flex-1 text-[12px] italic text-dls-secondary">万物并作，吾以观其复</span>
        {/* 驾驶舱模式下显示流水线启动入口 */}
        <SessionHeaderExtensions
          pipelines={allPipelines}
          isLoading={pipelinesLoading}
          hasActiveSession={Boolean(props.selectedSessionId)}
          launching={headerLaunching}
          onLaunch={handleHeaderLaunchRequest}
          onOpenSettings={() => setActiveSection("settings")}
        />
        <WorkspaceSwitcher
          workspaces={props.workspaces}
          selectedWorkspaceId={props.selectedWorkspaceId}
          selectedWorkspaceDisplay={props.selectedWorkspaceDisplay}
          onSelectWorkspace={(id) => props.sidebar.onSelectWorkspace(id)}
          onOpenCreateWorkspace={props.sidebar.onOpenCreateWorkspace}
        />
      </div>

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Left nav 180px */}
        <div className="flex w-[180px] shrink-0 flex-col border-r border-dls-border bg-white">
          <XingjingNavSidebar
            activeSection={activeSection}
            onSelect={(section) => {
              setActiveSection(section);
            }}
            clientConnected={props.clientConnected}
            openworkServerClient={props.openworkServerClient}
            openworkServerStatus={props.openworkServerStatus}
          />
        </div>

        {/* History session drawer 40-240px —— 仅驾驶舱挂载 */}
        {isCockpit ? (
          <div
            className="flex shrink-0 flex-col border-r border-dls-border bg-white transition-[width] duration-200"
            style={{ width: historyExpanded ? 240 : 40 }}
          >
            <HistorySessionDrawer
              workspaceId={props.selectedWorkspaceId}
              selectedSessionId={props.selectedSessionId}
              sessions={currentWorkspaceSessions}
              expanded={historyExpanded}
              onToggle={() => setHistoryExpanded((v) => !v)}
              onOpenSession={props.sidebar.onOpenSession}
            />
          </div>
        ) : null}

        {/* Main content flex-1 */}
        <div className="flex min-w-0 flex-1 flex-col bg-dls-surface">
          {/* Session surface area */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            {/* 产品工作台覆盖层 */}
            {activeSection === "product-insight" ? (
              <div className="absolute inset-0 z-40 flex flex-col overflow-hidden bg-dls-surface">
                <ProductWorkbenchPage
                  openworkServerClient={props.openworkServerClient}
                  workspaceId={props.runtimeWorkspaceId ?? props.selectedWorkspaceId}
                  opencodeBaseUrl={reactSessionBaseUrl}
                  token={reactSessionToken}
                  workspacePath={workspacePath}
                  listAgents={props.listAgents}
                  onSessionCreated={(sessionId) => {
                    setActiveSection("cockpit");
                    navigate(`/session/${sessionId}`);
                  }}
                  onNavigate={(section) => setActiveSection(section as XingjingNavSection)}
                />
              </div>
            ) : null}

            {/* 非驾驶舱二级页占位覆盖层：用绝对定位覆盖 SessionSurface，保持内层 SSE 连接不被杀中 */}
            {SECTION_META[activeSection] ? (
              <div className="absolute inset-0 z-40 flex flex-col bg-dls-surface">
                <XingjingPlaceholderPage
                  section={activeSection}
                  launchProps={placeholderLaunchProps}
                />
              </div>
            ) : null}

            {/* 设置页内联覆盖层：保持左侧主菜单可见，仅覆盖内容区 */}
            {activeSection === "settings" ? (
              <div className="absolute inset-0 z-40 flex flex-col overflow-hidden bg-dls-surface">
                <SettingsRoute
                  xingjingMode
                  controlledTab={activeSettingsTab}
                  onControlledTabChange={setActiveSettingsTab}
                />
              </div>
            ) : null}

            {/* AI 搭档页面覆盖层 */}
            {activeSection === "ai-partner" ? (
              <div className="absolute inset-0 z-40 flex flex-col overflow-hidden bg-dls-surface">
                <AiPartnerPage
                  openworkServerClient={props.openworkServerClient}
                  workspaceId={props.runtimeWorkspaceId ?? props.selectedWorkspaceId}
                  listAgents={props.listAgents}
                />
              </div>
            ) : null}

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

        {/* Right ArtifactsDrawer —— 仅驾驶舱挂载 */}
        {isCockpit ? (
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
        ) : null}
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

      {/* 驾驶舱 Header 流水线启动对话框（有 inputs 字段时弹出） */}
      <PipelineLaunchDialog
        open={Boolean(headerLaunchDialogDef)}
        def={headerLaunchDialogDef}
        launching={headerLaunching}
        onLaunch={(def, goal, inputValues) => {
          setHeaderLaunchDialogDef(null);
          void headerLaunch(def, goal, inputValues, {
            mode: headerLaunchMode,
            parentSessionId: headerLaunchMode === "current-session" ? (props.selectedSessionId ?? undefined) : undefined,
          });
        }}
        onClose={() => setHeaderLaunchDialogDef(null)}
      />
    </div>
  );
}
