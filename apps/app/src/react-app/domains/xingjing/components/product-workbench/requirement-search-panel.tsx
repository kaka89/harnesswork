/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Search, Send, Sparkles, X } from "lucide-react";
import type {
  RequirementIndexItem,
  RequirementSearchPanelProps,
  RequirementStatus,
} from "../../types/product-workbench";
import { SkillQuickActions } from "./skill-quick-actions";

const STATUS_LABEL: Record<RequirementStatus, string> = {
  draft:     "草稿",
  reviewing: "评审中",
  approved:  "已立项",
  released:  "已发布",
};

const STATUS_COLOR: Record<RequirementStatus, string> = {
  draft:     "bg-dls-hover text-dls-secondary",
  reviewing: "bg-blue-2 text-blue-10",
  approved:  "bg-purple-2 text-purple-10",
  released:  "bg-green-2 text-green-10",
};

const STATUS_FILTERS: Array<{ id: RequirementStatus | "all"; label: string }> = [
  { id: "all",       label: "全部" },
  { id: "draft",     label: "草稿" },
  { id: "reviewing", label: "评审中" },
  { id: "approved",  label: "已立项" },
  { id: "released",  label: "已发布" },
];

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前`;
  return iso.slice(0, 10);
}

interface ChatTurn {
  role: "user" | "agent";
  content: string;
}

export function RequirementSearchPanel(props: RequirementSearchPanelProps) {
  const {
    items,
    preselectId,
    skills,
    agents,
    onAgentInvoke,
    onPipelineLaunch,
    toast,
    getAgentReplyTemplate,
  } = props;

  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<RequirementStatus | "all">("all");
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tagPopoverRef = useRef<HTMLDivElement>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => it.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return items.filter((it) => {
      if (kw && !it.title.toLowerCase().includes(kw) && !it.summary.toLowerCase().includes(kw)) {
        return false;
      }
      if (statusFilter !== "all" && it.status !== statusFilter) return false;
      if (tagFilter.length > 0 && !tagFilter.some((t) => it.tags.includes(t))) return false;
      return true;
    });
  }, [items, keyword, statusFilter, tagFilter]);

  // ⌘/Ctrl+K 聚焦
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // preselectId 联动：滚动 + 高亮 2s
  useEffect(() => {
    if (!preselectId) return;
    setHighlightId(preselectId);
    const row = rowRefs.current[preselectId];
    if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(() => setHighlightId(null), 2000);
    return () => window.clearTimeout(timer);
  }, [preselectId]);

  // 点击外部关闭 Tag popover
  useEffect(() => {
    if (!tagPopoverOpen) return;
    const handler = (e: MouseEvent) => {
      if (tagPopoverRef.current && !tagPopoverRef.current.contains(e.target as Node)) {
        setTagPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [tagPopoverOpen]);

  const detailItem = detailId ? items.find((it) => it.id === detailId) ?? null : null;

  // 关闭抽屉清空对话
  function closeDetail() {
    setDetailId(null);
    setChatTurns([]);
    setChatInput("");
  }

  function openDetail(id: string) {
    setDetailId(id);
    setChatTurns([]);
    setChatInput("");
  }

  function handleSkill(slug: string) {
    if (slug === "requirement-summary") {
      toast(`已生成 ${filtered.length} 条需求的一句话摘要（mock）。`, "success");
    } else {
      toast(`Skill《${slug}》执行完成（mock）。`, "info");
    }
  }

  async function handleSemanticSearch() {
    if (!keyword.trim()) {
      toast("请先输入一段描述（以便语义检索）。", "info");
      return;
    }
    setSemanticLoading(true);
    try {
      await onPipelineLaunch("requirement-semantic-search", { query: keyword.trim() });
      toast(`语义检索完成，返回 ${filtered.length} 条相关需求（mock）。`, "success");
    } catch {
      toast("语义检索暂时失败，请稍后再试。", "error");
    } finally {
      setSemanticLoading(false);
    }
  }

  async function handleAskAgent() {
    const question = chatInput.trim();
    if (!question || !detailItem || chatSending) return;
    setChatTurns((prev) => [...prev, { role: "user", content: question }]);
    setChatInput("");
    setChatSending(true);
    try {
      if (agents.length > 0) {
        const reply = await onAgentInvoke(agents[0].name, question);
        setChatTurns((prev) => [
          ...prev,
          {
            role: "agent",
            content: `根据需求《${detailItem.title}》，${question.slice(0, 20)} 的处理方式是……\n\n${reply}`,
          },
        ]);
      } else {
        const tpl = getAgentReplyTemplate("requirement", question);
        setChatTurns((prev) => [
          ...prev,
          { role: "agent", content: `根据需求《${detailItem.title}》，${tpl}` },
        ]);
      }
    } catch {
      toast("搭档暂时无响应，稍后再试一次。", "error");
      setChatTurns((prev) => [
        ...prev,
        { role: "agent", content: "（搭档无响应）" },
      ]);
    } finally {
      setChatSending(false);
    }
  }

  function toggleTag(tag: string) {
    setTagFilter((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-dls-border bg-dls-hover/30 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-dls-secondary" />
            <input
              ref={searchRef}
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索需求标题/摘要（⌘/Ctrl + K 聚焦）"
              className="h-9 w-full rounded-lg border border-dls-border bg-dls-surface pl-9 pr-3 text-[13px] text-dls-text outline-none focus:border-dls-accent"
            />
          </div>
          <div className="flex items-center gap-1">
            {STATUS_FILTERS.map((f) => {
              const active = statusFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={`h-7 rounded-lg px-2.5 text-[12px] transition-colors ${
                    active
                      ? "bg-dls-accent/15 text-dls-accent"
                      : "text-dls-secondary hover:bg-dls-hover"
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          {/* Tag 多选 */}
          <div ref={tagPopoverRef} className="relative">
            <button
              type="button"
              onClick={() => setTagPopoverOpen((v) => !v)}
              className="inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-[12px] text-dls-secondary hover:bg-dls-hover"
            >
              #标签
              {tagFilter.length > 0 ? (
                <span className="rounded-full bg-dls-accent/15 px-1.5 text-[10px] text-dls-accent">
                  {tagFilter.length}
                </span>
              ) : null}
            </button>
            {tagPopoverOpen ? (
              <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-[220px] rounded-2xl border border-dls-border bg-dls-surface p-2 shadow-xl">
                {allTags.length === 0 ? (
                  <div className="px-2 py-1 text-[12px] text-dls-secondary">暂无标签</div>
                ) : (
                  allTags.map((tag) => (
                    <label
                      key={tag}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-dls-text hover:bg-dls-hover"
                    >
                      <input
                        type="checkbox"
                        checked={tagFilter.includes(tag)}
                        onChange={() => toggleTag(tag)}
                      />
                      {tag}
                    </label>
                  ))
                )}
                {tagFilter.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setTagFilter([])}
                    className="mt-1 w-full rounded-md px-2 py-1 text-left text-[11px] text-dls-secondary hover:bg-dls-hover"
                  >
                    清空筛选
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex-1" />
          <span className="text-[12px] text-dls-secondary">共 {filtered.length} 条</span>
          <button
            type="button"
            disabled={semanticLoading}
            onClick={() => void handleSemanticSearch()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-purple-10 hover:bg-purple-2 disabled:opacity-50"
          >
            <Sparkles size={14} />
            {semanticLoading ? "语义匹配中…" : "语义检索"}
          </button>
          <SkillQuickActions skills={skills} onInvoke={handleSkill} />
        </div>
      </div>

      {/* Result table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-dls-border px-4 py-10 text-center">
          <div className="text-[13px] text-dls-text">没有匹配的需求</div>
          <div className="text-[12px] text-dls-secondary">试试调整筛选条件，或切换竞品与洞察 Tab 找灵感</div>
          <button
            type="button"
            onClick={() => {
              setKeyword("");
              setStatusFilter("all");
              setTagFilter([]);
            }}
            className="mt-1 rounded-md px-2 py-1 text-[12px] text-green-10 hover:bg-green-2"
          >
            清除筛选
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-dls-border bg-dls-surface">
          {/* header */}
          <div className="flex items-center gap-3 border-b border-dls-border bg-dls-hover/30 px-4 py-2 text-[12px] font-medium text-dls-secondary">
            <span className="flex-1">标题</span>
            <span className="w-[80px]">状态</span>
            <span className="w-[80px]">负责人</span>
            <span className="w-[120px]">更新时间</span>
            <span className="w-[16px]" />
          </div>
          <div className="flex flex-col">
            {filtered.map((it) => {
              const highlight = highlightId === it.id;
              const selected = detailId === it.id;
              return (
                <button
                  key={it.id}
                  ref={(el) => {
                    rowRefs.current[it.id] = el;
                  }}
                  type="button"
                  onClick={() => openDetail(it.id)}
                  className={`flex items-center gap-3 border-b border-dls-border px-4 py-3 text-left transition-colors last:border-b-0 ${
                    highlight ? "bg-dls-accent/10" : selected ? "bg-dls-hover" : "hover:bg-dls-hover"
                  }`}
                >
                  <span className="flex-1 truncate text-[13px] text-dls-text">{it.title}</span>
                  <span className="w-[80px]">
                    <span className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] ${STATUS_COLOR[it.status]}`}>
                      {STATUS_LABEL[it.status]}
                    </span>
                  </span>
                  <span className="w-[80px] truncate text-[12px] text-dls-secondary">{it.owner}</span>
                  <span className="w-[120px] text-[12px] text-dls-secondary">{formatRelative(it.updatedAt)}</span>
                  <ChevronRight size={14} className="w-[16px] text-dls-secondary" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {detailItem ? <DetailDrawer
        item={detailItem}
        chatTurns={chatTurns}
        chatInput={chatInput}
        setChatInput={setChatInput}
        chatSending={chatSending}
        onAsk={() => void handleAskAgent()}
        onClose={closeDetail}
      /> : null}
    </div>
  );
}

// ── Detail Drawer ───────────────────────────────────────────────────

interface DetailDrawerProps {
  item: RequirementIndexItem;
  chatTurns: ChatTurn[];
  chatInput: string;
  setChatInput: (v: string) => void;
  chatSending: boolean;
  onAsk: () => void;
  onClose: () => void;
}

function DetailDrawer({ item, chatTurns, chatInput, setChatInput, chatSending, onAsk, onClose }: DetailDrawerProps) {
  return (
    <div className="fixed right-0 top-0 z-50 flex h-full w-[480px] flex-col border-l border-dls-border bg-dls-surface shadow-xl">
      {/* header */}
      <div className="flex items-start gap-2 border-b border-dls-border px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] ${STATUS_COLOR[item.status]}`}>
              {STATUS_LABEL[item.status]}
            </span>
            <span className="truncate text-[14px] font-semibold text-dls-text">{item.title}</span>
          </div>
          <div className="mt-1 text-[11px] text-dls-secondary">
            {item.owner} · 更新于 {formatRelative(item.updatedAt)}
          </div>
          {item.tags.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {item.tags.map((t) => (
                <span key={t} className="rounded-md bg-dls-hover px-1.5 py-0.5 text-[11px] text-dls-secondary">
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-dls-secondary hover:bg-dls-hover"
        >
          <X size={14} />
        </button>
      </div>

      {/* body */}
      <div className="flex-1 overflow-auto px-4 py-3">
        <pre className="whitespace-pre-wrap text-[13px] leading-relaxed text-dls-text">
          {item.content}
        </pre>
      </div>

      {/* chat */}
      <div className="border-t border-dls-border">
        {chatTurns.length > 0 ? (
          <div className="max-h-[200px] overflow-auto px-4 py-2">
            {chatTurns.map((turn, idx) => (
              <div key={idx} className={`mb-2 flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-xl px-3 py-2 text-[12px] ${
                    turn.role === "user"
                      ? "bg-dls-accent/15 text-dls-text"
                      : "bg-dls-hover text-dls-text"
                  }`}
                >
                  <div className="mb-0.5 text-[10px] text-dls-secondary">
                    {turn.role === "user" ? "我" : "🤖 搭档"}
                  </div>
                  <pre className="whitespace-pre-wrap font-sans">{turn.content}</pre>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-2 px-4 py-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                onAsk();
              }
            }}
            placeholder="问询搭档（⌘/Ctrl + ↵ 发送）"
            className="h-9 flex-1 rounded-lg border border-dls-border bg-dls-surface px-3 text-[13px] text-dls-text outline-none focus:border-dls-accent"
          />
          <button
            type="button"
            disabled={!chatInput.trim() || chatSending}
            onClick={onAsk}
            className="inline-flex h-9 items-center gap-1 rounded-lg bg-dls-accent px-3 text-[12px] text-white hover:opacity-90 disabled:opacity-50"
          >
            <Send size={12} />
            {chatSending ? "发送中…" : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}
