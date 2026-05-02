/** @jsxImportSource react */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import type { Agent } from "@opencode-ai/sdk/v2/client";
import type { OpenworkServerClient } from "../../../../app/lib/openwork-server";

import { useAgents }              from "../hooks/use-agents";
import { usePipelineDefinitions } from "../hooks/use-pipeline-definitions";
import { usePipelineLauncher }    from "../hooks/use-pipeline-launcher";

import { AgentInvokeButton }       from "../components/product-workbench/agent-invoke-button";
import { CompetitorPanel }         from "../components/product-workbench/competitor-panel";
import { MarketInsightPanel }      from "../components/product-workbench/market-insight-panel";
import { PlanningPanel }           from "../components/product-workbench/planning-panel";
import { RequirementSearchPanel }  from "../components/product-workbench/requirement-search-panel";
import { DetailDrawer }             from "../components/product-workbench/requirement-search-panel";
import type { ChatTurn }            from "../components/product-workbench/requirement-search-panel";
import { RequirementWriterPanel }  from "../components/product-workbench/requirement-writer-panel";
import { SkillQuickActions }        from "../components/product-workbench/skill-quick-actions";
import { WorkbenchTabs }           from "../components/product-workbench/workbench-tabs";

import {
  MOCK_AGENT_REPLY_TEMPLATES,
  MOCK_COMPETITORS,
  MOCK_GOALS,
  MOCK_INSIGHTS,
  MOCK_REQUIREMENT_DRAFTS,
  MOCK_REQUIREMENTS,
  MOCK_SKILL_REGISTRY,
} from "../mock/mock-product-workbench";

import type {
  Competitor,
  MarketInsight,
  ProductGoal,
  RequirementDraft,
  ToastKind,
  WorkbenchTabId,
} from "../types/product-workbench";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ProductWorkbenchPageProps {
  openworkServerClient: OpenworkServerClient | null;
  workspaceId: string | null;
  opencodeBaseUrl: string;
  token: string;
  workspacePath?: string;
  listAgents?: () => Promise<Agent[]>;
  onSessionCreated: (sessionId: string) => void;
  /** 关闭覆盖层，返回上级 section（如 "cockpit"）。 */
  onNavigate: (section: string) => void;
}

// ── Toast ─────────────────────────────────────────────────────────────────────

interface ToastItem {
  id: string;
  msg: string;
  kind: ToastKind;
}

function miniId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function ToastStack({
  items,
  onDismiss,
}: {
  items: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  const iconMap = {
    success: <CheckCircle2 size={14} className="shrink-0 text-green-11" />,
    error:   <AlertCircle  size={14} className="shrink-0 text-red-11"   />,
    info:    <Info         size={14} className="shrink-0 text-dls-secondary" />,
  };
  const bgMap = {
    success: "bg-green-2  border-green-7  text-green-11",
    error:   "bg-red-2    border-red-7    text-red-11",
    info:    "bg-dls-hover border-dls-border text-dls-text",
  };
  if (!items.length) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-[80] flex flex-col-reverse gap-2"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={`flex w-80 items-center gap-2 rounded-md border px-3 py-2.5 text-sm shadow-md ${bgMap[t.kind]}`}
        >
          {iconMap[t.kind]}
          <span className="flex-1">{t.msg}</span>
          <button
            type="button"
            aria-label="关闭通知"
            onClick={() => onDismiss(t.id)}
            className="opacity-60 hover:opacity-100"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function ProductWorkbenchPage({
  openworkServerClient,
  workspaceId,
  opencodeBaseUrl,
  token,
  workspacePath,
  listAgents,
  onSessionCreated,
  onNavigate,
}: ProductWorkbenchPageProps) {
  // ── Tab ──────────────────────────────────────────────────────────────────
  const [overlayRoot, setOverlayRoot] = useState<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<WorkbenchTabId>("planning");

  // ── Panel data state ─────────────────────────────────────────────────────
  const [goals,       setGoals]       = useState<ProductGoal[]>(MOCK_GOALS);
  const [competitors, setCompetitors] = useState<Competitor[]>(MOCK_COMPETITORS);
  const [insights,    setInsights]    = useState<MarketInsight[]>(MOCK_INSIGHTS);
  const [drafts,      setDrafts]      = useState<RequirementDraft[]>(MOCK_REQUIREMENT_DRAFTS);
  const requirementIndex = MOCK_REQUIREMENTS;

  // ── Cross-panel preselect ─────────────────────────────────────────────────
  const [preselectRequirementId, setPreselectRequirementId] = useState<string | null>(null);
  const [preselectDraftId,       setPreselectDraftId]       = useState<string | null>(null);

  // ── Requirement detail (提升自 RequirementSearchPanel) ───────────────────
  const [detailId,     setDetailId]     = useState<string | null>(null);
  const [chatTurns,    setChatTurns]    = useState<ChatTurn[]>([]);
  const [chatInput,    setChatInput]    = useState("");
  const [chatSending,  setChatSending]  = useState(false);

  const detailItem = detailId
    ? requirementIndex.find((it) => it.id === detailId) ?? null
    : null;

  function handleCloseDetail() {
    setDetailId(null);
    setChatTurns([]);
    setChatInput("");
  }

  function handleDetailChange(id: string | null) {
    setDetailId(id);
    setChatTurns([]);
    setChatInput("");
  }

  // ── Toast queue ───────────────────────────────────────────────────────────
  const [toastQueue, setToastQueue] = useState<ToastItem[]>([]);

  const toast = useCallback((msg: string, kind: ToastKind = "info") => {
    const id = miniId();
    setToastQueue((q) => [...q, { id, msg, kind }]);
    setTimeout(() => setToastQueue((q) => q.filter((t) => t.id !== id)), kind === "error" ? 6000 : kind === "success" ? 3000 : 4000);
  }, []);

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const { agents }      = useAgents(openworkServerClient, workspaceId, listAgents);
  const { pipelines }   = usePipelineDefinitions(openworkServerClient, workspaceId);
  const launcher        = usePipelineLauncher({
    opencodeBaseUrl,
    token,
    workspacePath,
    onSessionCreated,
    owClient: openworkServerClient,
  });

  // ── AI Agent invoke (mock) ────────────────────────────────────────────────
  const agentAbortRef = useRef<AbortController | null>(null);

  const handleAgentInvoke = useCallback(
    async (agentName: string, intent: string): Promise<string> => {
      agentAbortRef.current?.abort();
      const ctrl = new AbortController();
      agentAbortRef.current = ctrl;

      const kind: "planning" | "requirement" | "default" =
        activeTab === "planning"
          ? "planning"
          : activeTab === "requirement-writer" || activeTab === "requirement-search"
          ? "requirement"
          : "default";

      return new Promise<string>((resolve, reject) => {
        if (ctrl.signal.aborted) return reject(new Error("canceled"));
        const timer = setTimeout(() => {
          if (Math.random() < 0.05) {
            toast("搭档暂时无响应，稍后再试一次。", "error");
            reject(new Error("MOCK_RANDOM_FAILURE"));
            return;
          }
          resolve(MOCK_AGENT_REPLY_TEMPLATES[kind](intent));
        }, 1800);
        ctrl.signal.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("canceled")); }, { once: true });
      });
    },
    [activeTab, toast],
  );

  // Tab 切换时取消挂起中的 agent 调用
  useEffect(() => {
    return () => { agentAbortRef.current?.abort(); };
  }, [activeTab]);

  // ── Pipeline launch ───────────────────────────────────────────────────────
  const handlePipelineLaunch = useCallback(
    async (slug: string, inputs?: Record<string, string>): Promise<boolean> => {
      const def = pipelines.find(
        (d) => d.scope === "product-insight" && (d.triggerCommand === slug || d.id === slug),
      );
      if (def) {
        try {
          await launcher.launch(def, "", inputs);
          toast(`已启动 Pipeline《${def.name}》`, "success");
          return true;
        } catch {
          toast("Pipeline 启动失败", "error");
          return false;
        }
      }
      // mock fallback
      return new Promise<boolean>((resolve) => {
        setTimeout(() => {
          if (Math.random() < 0.03) {
            toast("Pipeline 启动失败", "error");
            resolve(false);
          } else {
            toast(`已启动 Pipeline《${slug}》（mock）`, "success");
            resolve(true);
          }
        }, 2000);
      });
    },
    [pipelines, launcher, toast],
  );

  // ── Agent reply template ──────────────────────────────────────────────────
  const getAgentReplyTemplate = useCallback(
    (kind: "default" | "planning" | "requirement", intent: string): string => {
      return MOCK_AGENT_REPLY_TEMPLATES[kind](intent);
    },
    [],
  );

  // ── Cross-panel callbacks ─────────────────────────────────────────────────
  const handleAskAgentForDetail = useCallback(async () => {
    const question = chatInput.trim();
    if (!question || !detailItem || chatSending) return;
    setChatTurns((prev) => [...prev, { role: "user" as const, content: question }]);
    setChatInput("");
    setChatSending(true);
    try {
      if (agents.length > 0) {
        const reply = await handleAgentInvoke(agents[0].name, question);
        setChatTurns((prev) => [
          ...prev,
          {
            role: "agent" as const,
            content: `根据需求《${detailItem.title}》，${question.slice(0, 20)} 的处理方式是……\n\n${reply}`,
          },
        ]);
      } else {
        const tpl = getAgentReplyTemplate("requirement", question);
        setChatTurns((prev) => [
          ...prev,
          { role: "agent" as const, content: `根据需求《${detailItem.title}》，${tpl}` },
        ]);
      }
    } catch {
      toast("搭档暂时无响应，稍后再试一次。", "error");
      setChatTurns((prev) => [
        ...prev,
        { role: "agent" as const, content: "（搭档无响应）" },
      ]);
    } finally {
      setChatSending(false);
    }
  }, [chatInput, chatSending, detailItem, agents, handleAgentInvoke, getAgentReplyTemplate, toast]);

  const handleArchiveToDraft = useCallback((insight: MarketInsight) => {
    const id = miniId();
    const newDraft: RequirementDraft = {
      id,
      title:   `基于「${insight.title.slice(0, 20)}」的需求草稿`,
      content: `## 来源\n\n${insight.title}\n\n${insight.content}`,
      status:  "draft",
      updatedAt: new Date().toISOString(),
      fromInsightId: insight.id,
    };
    setDrafts((prev) => [newDraft, ...prev]);
    setPreselectDraftId(id);
    setActiveTab("requirement-writer");
    toast("已归档到需求草稿", "success");
  }, [toast]);

  const handleOpenRequirement = useCallback((reqId: string) => {
    setPreselectRequirementId(reqId);
    setActiveTab("requirement-search");
  }, []);

  const handleArchiveToInsight = useCallback((insight: MarketInsight) => {
    setInsights((prev) => [{ ...insight, pinned: true }, ...prev]);
    toast("已归档为市场洞察", "success");
  }, [toast]);

  // ── Panel context ─────────────────────────────────────────────────────────
  const panelCtx = useMemo(
    () => ({
      overlayRoot,
      agents,
      onAgentInvoke:     handleAgentInvoke,
      onPipelineLaunch:  handlePipelineLaunch,
      toast,
      getAgentReplyTemplate,
    }),
    [overlayRoot, agents, handleAgentInvoke, handlePipelineLaunch, toast, getAgentReplyTemplate],
  );

  // ── Tab counts ────────────────────────────────────────────────────────────
  const counts = useMemo(
    () => ({
      planning:             goals.length,
      competitor:           competitors.length,
      "market-insight":     insights.length,
      "requirement-writer": drafts.length,
      "requirement-search": requirementIndex.length,
    }),
    [goals.length, competitors.length, insights.length, drafts.length, requirementIndex.length],
  );

  // ── Global shortcut ───────────────────────────────────────────────────────
  useEffect(() => {
    const TAB_MAP: Record<string, WorkbenchTabId> = {
      "1": "planning", "2": "competitor", "3": "market-insight",
      "4": "requirement-writer", "5": "requirement-search",
    };
    const handle = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      const tab = TAB_MAP[e.key];
      if (tab) { e.preventDefault(); setActiveTab(tab); return; }
      if (e.key === "k") { e.preventDefault(); setActiveTab("requirement-search"); }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main
      role="main"
      aria-label="产品工作台"
      className="flex h-full w-full flex-col bg-dls-surface text-dls-text"
    >
      <h1 className="sr-only">产品工作台</h1>

      {/* Header */}
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b border-dls-border bg-dls-surface/95 px-6 backdrop-blur">
        <button
          type="button"
          aria-label="返回概览"
          onClick={() => onNavigate("cockpit")}
          className="-ml-1 flex size-8 items-center justify-center rounded-md text-dls-secondary hover:bg-dls-hover hover:text-dls-text focus-visible:outline-2 focus-visible:outline-blue-7"
        >
          <ArrowLeft size={18} />
        </button>

        <Briefcase size={20} className="shrink-0 text-dls-accent" aria-hidden="true" />

        <div className="flex flex-col leading-none">
          <span className="text-sm font-semibold text-dls-text">产品工作台</span>
          <span className="mt-0.5 text-[11px] text-dls-secondary">规划 · 竞品 · 洞察 · 需求，贯穿从想法到落地</span>
        </div>

        <div className="flex-1" />

        <AgentInvokeButton
          agents={agents}
          label="问询搭档"
          placeholder="告诉搭档你想做什么…"
          onInvoke={(name, intent) => handleAgentInvoke(name, intent).then((reply) => { toast(reply.slice(0, 60) + "…", "info"); return reply; })}
          onEmptyStateCta={() => onNavigate("ai-partner")}
        />

        <SkillQuickActions
          skills={MOCK_SKILL_REGISTRY[activeTab]}
          label="Skill"
          onInvoke={(slug) => {
            toast(`技能「${MOCK_SKILL_REGISTRY[activeTab].find((s) => s.slug === slug)?.label ?? slug}」已触发`, "info");
          }}
        />
      </header>

      {/* Tab bar */}
      <WorkbenchTabs
        activeTab={activeTab}
        onChange={setActiveTab}
        counts={counts}
      />

      {/* Tab content */}
      <div
        role="tabpanel"
        aria-labelledby={`pw-tab-${activeTab}`}
        tabIndex={0}
        className="relative min-h-0 flex-1 overflow-hidden"
        ref={setOverlayRoot}
      >
        {/* 可滚动内容区 */}
        <div className="absolute inset-0 overflow-auto px-6 py-5 focus:outline-none">
          <div className="mx-auto w-[90%]">
            {activeTab === "planning" && (
              <PlanningPanel
                goals={goals}
                setGoals={setGoals}
                requirementIndex={requirementIndex}
                onOpenRequirement={handleOpenRequirement}
                skills={MOCK_SKILL_REGISTRY.planning}
                {...panelCtx}
              />
            )}
            {activeTab === "competitor" && (
              <CompetitorPanel
                items={competitors}
                setItems={setCompetitors}
                onArchiveToInsight={handleArchiveToInsight}
                skills={MOCK_SKILL_REGISTRY.competitor}
                {...panelCtx}
              />
            )}
            {activeTab === "market-insight" && (
              <MarketInsightPanel
                insights={insights}
                setInsights={setInsights}
                onArchiveToDraft={handleArchiveToDraft}
                skills={MOCK_SKILL_REGISTRY["market-insight"]}
                {...panelCtx}
              />
            )}
            {activeTab === "requirement-writer" && (
              <RequirementWriterPanel
                drafts={drafts}
                setDrafts={setDrafts}
                preselectDraftId={preselectDraftId}
                skills={MOCK_SKILL_REGISTRY["requirement-writer"]}
                {...panelCtx}
              />
            )}
            {activeTab === "requirement-search" && (
              <RequirementSearchPanel
                items={requirementIndex}
                preselectId={preselectRequirementId}
                skills={MOCK_SKILL_REGISTRY["requirement-search"]}
                detailId={detailId}
                onDetailChange={handleDetailChange}
                {...panelCtx}
              />
            )}
          </div>
        </div>

        {/* 需求详情抽屉：absolute 定位在内容区，不再盖盖导航侧边栏 */}
        {detailItem ? (
          <DetailDrawer
            item={detailItem}
            chatTurns={chatTurns}
            chatInput={chatInput}
            setChatInput={setChatInput}
            chatSending={chatSending}
            onAsk={() => void handleAskAgentForDetail()}
            onClose={handleCloseDetail}
          />
        ) : null}
      </div>

      {/* Toast */}
      <ToastStack items={toastQueue} onDismiss={(id) => setToastQueue((q) => q.filter((t) => t.id !== id))} />
    </main>
  );
}
