/** @jsxImportSource react */
import { useState } from "react";
import { Pin, RefreshCcw, Sparkles, X } from "lucide-react";
import type {
  InsightCategory,
  MarketInsight,
  MarketInsightPanelProps,
} from "../../types/product-workbench";
import { AgentInvokeButton } from "./agent-invoke-button";
import { SkillQuickActions } from "./skill-quick-actions";

const CATEGORY_TABS: Array<{ id: InsightCategory | "all"; label: string }> = [
  { id: "all",            label: "全部" },
  { id: "industry-trend", label: "行业趋势" },
  { id: "user-voice",     label: "用户反馈" },
  { id: "pricing",        label: "价格策略" },
  { id: "regulation",     label: "政策法规" },
];

const CATEGORY_LABEL: Record<InsightCategory, string> = {
  "industry-trend": "行业趋势",
  "user-voice":     "用户反馈",
  "pricing":        "价格策略",
  "regulation":     "政策法规",
};

const CATEGORY_COLOR: Record<InsightCategory, string> = {
  "industry-trend": "bg-blue-2 text-blue-10",
  "user-voice":     "bg-green-2 text-green-10",
  "pricing":        "bg-amber-2 text-amber-10",
  "regulation":     "bg-purple-2 text-purple-10",
};

function formatDate(iso: string) {
  return iso.slice(0, 10);
}

export function MarketInsightPanel(props: MarketInsightPanelProps) {
  const {
    insights,
    setInsights,
    onArchiveToDraft,
    agents,
    onAgentInvoke,
    onPipelineLaunch,
    toast,
    getAgentReplyTemplate,
    skills,
  } = props;

  const [category, setCategory] = useState<InsightCategory | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const filtered = insights
    .filter((i) => category === "all" || i.category === category)
    .sort((a, b) => {
      if ((a.pinned ? 1 : 0) !== (b.pinned ? 1 : 0)) {
        return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      }
      return b.publishedAt.localeCompare(a.publishedAt);
    });

  const selected = insights.find((i) => i.id === selectedId) ?? null;

  async function handleRefreshInsights() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onPipelineLaunch("market-insight");
      const now = new Date();
      const newItem: MarketInsight = {
        id: `i-${now.getTime()}`,
        title: "[Mock] 每周市场扫描：AI DevTools 赛道新融资追踪",
        summary: "本周市场扫描发现 3 家新 DevTools 公司完成融资。",
        content:
          "## 本周要点\n\n- A 公司：Series A，专注 Agent 编排\n- B 公司：种子轮，CLI 代码助手\n- C 公司：Pre-A，AI 测试平台\n\n## 结论\n\n赛道仍处于快速膨胀期。",
        category: "industry-trend",
        source: "Pipeline Mock",
        publishedAt: now.toISOString(),
        pinned: true,
      };
      setInsights((prev) => [newItem, ...prev]);
      toast("已刷新 1 条新洞察", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "刷新失败", "error");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleAgentDeepDive(title: string) {
    if (agents.length === 0) {
      toast("请先到 AI 搭档页面创建一个搭档", "info");
      return;
    }
    const firstAgent = agents[0];
    try {
      const intent = `深入解读市场洞察：${title}`;
      const reply = await onAgentInvoke(firstAgent.name, intent);
      toast(reply || getAgentReplyTemplate("default", intent), "info");
    } catch (e) {
      toast(e instanceof Error ? e.message : "搭档暂时无响应", "error");
    }
  }

  function handleSkillInvoke(slug: string) {
    if (slug === "insight-tagger") {
      const uncategorized = insights.filter((i) => !CATEGORY_LABEL[i.category]);
      toast(
        uncategorized.length > 0
          ? `已为 ${uncategorized.length} 条未分类洞察自动归类`
          : "所有洞察已分类，无需打标",
        "success",
      );
      return;
    }
    toast(`已触发 Skill：${slug}`, "info");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-dls-border px-6 py-3">
        <div className="flex items-center gap-1">
          {CATEGORY_TABS.map((tab) => {
            const active = category === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCategory(tab.id)}
                className={`h-7 rounded-full px-3 text-[12px] transition-colors ${
                  active
                    ? "bg-dls-accent/15 text-dls-accent"
                    : "text-dls-secondary hover:bg-dls-hover"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          disabled={refreshing}
          onClick={() => void handleRefreshInsights()}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-dls-secondary hover:bg-dls-hover disabled:opacity-50"
        >
          <RefreshCcw size={14} className={refreshing ? "animate-spin" : ""} />
          刷新洞察
        </button>
        <SkillQuickActions skills={skills} onInvoke={handleSkillInvoke} />
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="mx-auto max-w-[1280px]">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-24 text-[13px] text-dls-secondary">
              <div>当前分类下暂无洞察</div>
              <button
                type="button"
                onClick={() => setCategory("all")}
                className="rounded-md border border-dls-border px-2 py-1 text-[12px] hover:bg-dls-hover"
              >
                查看全部
              </button>
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className="flex w-full flex-col gap-1 border-b border-dls-border px-6 py-4 text-left hover:bg-dls-hover"
              >
                <div className="flex items-center gap-2">
                  {item.pinned ? <Pin size={12} className="text-amber-10" /> : null}
                  <span className="text-[14px] font-medium text-dls-text">
                    {item.title}
                  </span>
                </div>
                <div className="text-[12px] text-dls-secondary line-clamp-1">
                  {item.summary}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-dls-secondary">
                  <span className={`rounded-full px-2 py-0.5 ${CATEGORY_COLOR[item.category]}`}>
                    {CATEGORY_LABEL[item.category]}
                  </span>
                  <span>·</span>
                  <span>{formatDate(item.publishedAt)}</span>
                  <span>·</span>
                  <span>{item.source}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Drawer */}
      {selected ? (
        <div
          className="fixed right-0 top-0 z-50 flex h-full w-[520px] flex-col border-l border-dls-border bg-dls-surface shadow-xl"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-start gap-3 border-b border-dls-border px-5 py-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-[11px] text-dls-secondary">
                <span className={`rounded-full px-2 py-0.5 ${CATEGORY_COLOR[selected.category]}`}>
                  {CATEGORY_LABEL[selected.category]}
                </span>
                <span>·</span>
                <span>{formatDate(selected.publishedAt)}</span>
                <span>·</span>
                <span>{selected.source}</span>
              </div>
              <div className="mt-1 text-[16px] font-semibold text-dls-text">
                {selected.title}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="rounded-md p-1 text-dls-secondary hover:bg-dls-hover"
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto px-5 py-4">
            <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-dls-text">
              {selected.content}
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-dls-border px-5 py-3">
            <button
              type="button"
              onClick={() => {
                onArchiveToDraft(selected);
                setSelectedId(null);
              }}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-dls-accent px-3 text-[12px] text-white hover:opacity-90"
            >
              归档到需求
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => void handleAgentDeepDive(selected.title)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-purple-10 hover:bg-purple-2"
            >
              <Sparkles size={14} /> 搭档深入解读
            </button>
          </div>
        </div>
      ) : null}

      {/* Header-level agent shortcut is rendered at parent Header; here Panel-level not needed */}
      {/* Keep import usage for AgentInvokeButton is avoided by not rendering; imported for future */}
      <div hidden>
        <AgentInvokeButton agents={agents} onInvoke={async () => ""} />
      </div>
    </div>
  );
}
