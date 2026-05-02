/** @jsxImportSource react */
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Send, Sparkles } from "lucide-react";
import type { XingjingAgentView } from "../../types";

export interface AgentInvokeButtonProps {
  /** 可供选择的搭档列表 */
  agents: XingjingAgentView[];
  /** 按钮文案，如 "询问搭档" / "AI 建议" */
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  /** 预选中的搭档（按 name/slug） */
  preselectAgentName?: string;
  /**
   * 发送回调；返回的字符串作为回复内容（由宿主 Panel 决定如何展示）。
   * 抛错会被组件捕获并清理 loading 态。
   */
  onInvoke: (agentName: string, intent: string) => Promise<string | void>;
  /** 空态：没有可用 agent 时的 CTA（通常跳到 AI 搭档页） */
  onEmptyStateCta?: () => void;
}

const displayNameOf = (agent: XingjingAgentView) =>
  agent.options?.displayName || agent.name;

export function AgentInvokeButton({
  agents,
  label = "问询搭档",
  placeholder = "描述你的意图，回车发送",
  disabled,
  preselectAgentName,
  onInvoke,
  onEmptyStateCta,
}: AgentInvokeButtonProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>(() => preselectAgentName ?? agents[0]?.name ?? "");
  const [intent, setIntent] = useState("");
  const [sending, setSending] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // 搭档列表变化时尝试恢复预选
  useEffect(() => {
    if (!agents.length) {
      setSelected("");
      return;
    }
    if (!selected || !agents.some((a) => a.name === selected)) {
      setSelected(preselectAgentName ?? agents[0].name);
    }
  }, [agents, preselectAgentName]); // eslint-disable-line react-hooks/exhaustive-deps

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const canSend = Boolean(selected && intent.trim() && !sending);

  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    try {
      await onInvoke(selected, intent.trim());
      setIntent("");
      setOpen(false);
    } catch {
      // 宿主通常会 toast，此处只兜底清 loading
    } finally {
      setSending(false);
    }
  }

  return (
    <div ref={popoverRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-purple-10 hover:bg-purple-2 disabled:opacity-50"
      >
        <Sparkles size={14} />
        {label}
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+4px)] z-50 w-[360px] rounded-2xl border border-dls-border bg-dls-surface p-4 shadow-xl">
          {agents.length === 0 ? (
            <div className="flex flex-col items-start gap-2">
              <div className="text-[13px] text-dls-text">还没有 AI 搭档</div>
              <div className="text-[12px] text-dls-secondary">
                先在「AI 搭档」页面创建一个搭档，就能在这里调用。
              </div>
              {onEmptyStateCta ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onEmptyStateCta();
                  }}
                  className="mt-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-green-10 hover:bg-green-2"
                >
                  <ArrowRight size={12} /> 去 AI 搭档页创建
                </button>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-[12px] text-dls-secondary">
                选择搭档
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  className="h-8 rounded-lg border border-dls-border bg-dls-surface px-2 text-[13px] text-dls-text outline-none focus:border-dls-accent"
                >
                  {agents.map((agent) => (
                    <option key={agent.name} value={agent.name}>
                      {displayNameOf(agent)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-[12px] text-dls-secondary">
                意图
                <textarea
                  rows={3}
                  value={intent}
                  placeholder={placeholder}
                  onChange={(e) => setIntent(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  className="resize-none rounded-lg border border-dls-border bg-dls-surface p-2 text-[13px] text-dls-text outline-none focus:border-dls-accent"
                />
              </label>

              <div className="flex items-center justify-between">
                <span className="text-[11px] text-dls-secondary">⌘/Ctrl + ↵ 发送</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="h-8 rounded-lg px-3 text-[12px] text-dls-secondary hover:bg-dls-hover"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={!canSend}
                    onClick={() => void handleSend()}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-dls-accent px-3 text-[12px] text-white hover:opacity-90 disabled:opacity-50"
                  >
                    <Send size={12} />
                    {sending ? "发送中…" : "发送"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
