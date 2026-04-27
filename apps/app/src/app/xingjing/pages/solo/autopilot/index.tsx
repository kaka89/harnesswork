/**
 * SoloAutopilot — 独立版 AI 会话主界面
 *
 * 提供完备的 AI 会话能力：
 * 1. EnhancedComposer：自动高度、@agent/@file mention、/slash 命令、模型选择器
 * 2. OpenWork 能力集成：MCP 工具、Skills、Knowledge、Commands 实时展示
 * 3. 会话历史侧边栏：基于 OpenCode Session API 的持久化多轮记忆
 * 4. 产出物自动保存：检测到文档级内容后自动保存到产品目录
 */
import {
  createSignal,
  createMemo,
  Show,
  For,
  onCleanup,
  onMount,
  createEffect,
} from 'solid-js';
import {
  FileText,
  Loader2,
  History,
  X,
  AlertCircle,
  Plus,
  Minimize2,
} from 'lucide-solid';
import CreateProductModal from '../../../components/product/new-product-modal';
import { useAppStore } from '../../../stores/app-store';
import { themeColors, chartColors } from '../../../utils/colors';
import { modelOptions } from '../../../utils/defaults';
import { loadProjectSettings, readYaml } from '../../../services/file-store';
import { initProductDir } from '../../../../lib/tauri';
import { getHealthScore } from '../../../services/knowledge-health';
import { buildKnowledgeIndex } from '../../../services/knowledge-index';
import { loadSession as loadMemorySession, loadMemoryIndex, saveMemoryMeta } from '../../../services/memory-store';
import { retrieveKnowledge } from '../../../services/knowledge-retrieval';
import { recallRelevantContext } from '../../../services/memory-recall';
import {
  type AutopilotAgent,
  parseMention,
} from '../../../services/autopilot-executor';
import { listAllAgents } from '../../../services/agent-registry';
import { isClientReady, buildGitSystemContext } from '../../../services/opencode-client';
import { resolveSkillArtifactConfig, extractArtifactBlock, type SkillContentResolver } from '../../../utils/skill-artifact';
import SavedFileList, { type SavedFileItem } from '../../../components/autopilot/saved-file-list';
import PermissionDialog, {
  type PermissionRequest,
} from '../../../components/autopilot/permission-dialog';
import MessageList from '../../../../components/session/message-list';
import type { MessageWithParts, ComposerAttachment } from '../../../../types';
import EnhancedComposer, {
  type CapabilityBadge,
  type SlashCommand,
} from '../../../components/autopilot/enhanced-composer';
import { listCommands as listCommandsTyped, compactSession, abortSessionSafe } from '../../../../lib/opencode-session';

// ─── 类型 ─────────────────────────────────────────────────────────────────────



/** 普通对话（chat 模式）的消息气泡 */
interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: string;
  loading?: boolean;
  /** 关联的产出物 ID（内容被提取为产出物后设置） */
  artifactId?: string;
  /** 产出物标题（展示链接时用） */
  artifactTitle?: string;
}

const genMsgId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const nowTimeStr = () => new Date().toTimeString().slice(0, 5);

/**
/**
 * 从完整提示词中提取用户实际输入。
 *
 * 改造后（system 参数重构），新会话的 user prompt 已不包含系统上下文。
 * 此函数保留为向后兼容：历史 session 的消息可能仍包含旧格式的嵌入式系统上下文。
 *
 * 检测到 "当前系统时间" 标记时，取最后一段为用户输入。
 * 未检测到标记时原样返回。
 */
function stripSystemContext(content: string): string {
  const SEP = '\n\n---\n\n';
  const MARKER = '## 当前系统时间';
  if (!content.includes(MARKER)) return content;
  const parts = content.split(SEP);
  // 用户输入始终在最后一段
  const userInput = parts[parts.length - 1]?.trim();
  return userInput || content;
}

/**
 * 对 accumulator 消息中含有系统上下文注入标记的 text part 进行剥离。
 *
 * 改造后（system 参数重构），新会话不再在 user prompt 中嵌入系统上下文。
 * 此函数保留为向后兼容：历史 session 的消息可能仍包含旧格式的嵌入式系统上下文。
 *
 * 不依赖 role 字段：OpenCode 的 message.part.updated 事件先于 message.updated 到达时，
 * 占位 message 的 role 默认为 'assistant'，导致用户消息被误判。
 * 改为通过内容特征（## 当前系统时间 标记）识别注入消息，并同时修正 role 为 'user'。
 */
function stripAccUserMsg(msg: MessageWithParts): MessageWithParts {
  const hasSystemCtx = msg.parts.some(
    p => p.type === 'text' && ((p as any).text ?? '').includes('## 当前系统时间')
  );
  if (!hasSystemCtx) return msg;
  // 含有系统上下文 → 剥离注入内容，并将 role 修正为 'user'
  return {
    ...msg,
    info: { ...(msg.info as any), role: 'user' as const } as any,
    parts: msg.parts.map(part => {
      if (part.type !== 'text') return part;
      const raw = (part as any).text ?? '';
      const stripped = stripSystemContext(raw);
      return stripped === raw ? part : { ...part, text: stripped } as any;
    }),
  };
}

// ─── 产出物自动检测 ──────────────────────────────────────────────────────────

/** 检测消息内容格式（仅供产出物检测使用） */
type MsgFormat = 'html' | 'markdown' | 'text';
function detectMsgFormatForArtifact(content: string): MsgFormat {
  const t = content.trimStart().toLowerCase();
  if (t.startsWith('<!doctype html') || t.startsWith('<html')) return 'html';
  if (/<head[\s>]/i.test(t) && /<body[\s>]/i.test(t)) return 'html';
  const blockTags = (t.match(/<(div|section|table|style|header|footer|main|form)\b/gi) || []).length;
  if (blockTags >= 3) return 'html';
  const mdMarkers = [
    /^#{1,3} /m, /\*\*.+?\*\*/, /^[-*] /m, /```/, /^\|.+\|/m,
  ].filter(re => re.test(content)).length;
  if (mdMarkers >= 2) return 'markdown';
  return 'text';
}

/** 判断 AI 回复是否构成一篇独立文档（达到产出物标准） */
function looksLikeDocument(content: string): boolean {
  if (content.length < 400) return false;
  const fmt = detectMsgFormatForArtifact(content);
  if (fmt === 'html') return true;
  // Markdown：至少有 2 个标题
  const headings = (content.match(/^#{1,3} /gm) || []).length;
  return headings >= 2;
}

/** 从 AI 回复中提取文档标题（取第一个标题行 or 截断） */
function extractDocTitle(content: string): string {
  const m = content.match(/^#{1,3} (.+)$/m);
  if (m) return m[1].trim().slice(0, 60);
  const line1 = content.trim().split('\n')[0].replace(/^[#*\->\s]+/, '').trim();
  return (line1 || '对话产出物').slice(0, 60);
}

// ─── 快速示例（按模式分类） ──────────────────────────────────────────────────

const QUICK_SAMPLES = [
  '帮我分析一下产品的核心用户场景',
  '给当前功能写一份竞品对比',
  '如何优化我们的用户留存策略？',
  '帮我想 5 个增长实验方案',
  '为 WriteFlow 实现「段落一键重写」功能，选中段落后 AI 重写，保留原意改写表达，MVP 版本',
  '修复 Editor 在 iOS 上的光标偏移 bug，并上线到生产环境',
];





// ─── HistorySidebar ───────────────────────────────────────────────────────────

interface HistoryItem {
  id: string;
  title: string;
  ts: string;
}

const HistorySidebar = (props: {
  items: HistoryItem[];
  activeId: string | null;
  restoringId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onNewSession: () => void;
}) => (
  <div style={{
    width: '220px', 'flex-shrink': '0', display: 'flex', 'flex-direction': 'column',
    border: `1px solid ${themeColors.border}`, 'border-radius': '10px',
    background: themeColors.surface, overflow: 'hidden',
  }}>
    <div style={{
      display: 'flex', 'align-items': 'center', 'justify-content': 'space-between',
      padding: '10px 12px', 'border-bottom': `1px solid ${themeColors.border}`, 'flex-shrink': '0',
    }}>
      <span style={{ 'font-size': '12px', 'font-weight': '600' }}>会话历史</span>
      <div style={{ display: 'flex', 'align-items': 'center', gap: '4px' }}>
        {/* 新建会话按钮 */}
        <button
          onClick={props.onNewSession}
          title="新建会话"
          style={{
            background: 'none', border: 'none', cursor: 'pointer', color: themeColors.textMuted,
            display: 'flex', 'align-items': 'center', padding: '2px 4px', 'border-radius': '4px',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#22c55e'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = themeColors.textMuted; }}
        >
          <Plus size={14} />
        </button>
        <button onClick={props.onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: themeColors.textMuted, display: 'flex', 'align-items': 'center' }}>
          <X size={14} />
        </button>
      </div>
    </div>
    <div style={{ flex: 1, 'overflow-y': 'auto' }}>
      <Show
        when={props.items.length > 0}
        fallback={
          <div style={{ padding: '20px', 'text-align': 'center', color: themeColors.textMuted, 'font-size': '12px' }}>
            <History size={24} style={{ 'margin-bottom': '8px', opacity: '0.4' }} />
            <div>暂无历史记录</div>
          </div>
        }
      >
        <For each={props.items}>
          {(item) => {
            const isActive = () => props.activeId === item.id;
            const isRestoring = () => props.restoringId === item.id;
            return (
              <button
                onClick={() => { if (!props.restoringId) props.onSelect(item.id); }}
                disabled={!!props.restoringId}
                style={{
                  display: 'block', width: '100%', padding: '10px 12px', border: 'none',
                  background: isActive() ? themeColors.primaryBg : 'transparent',
                  cursor: props.restoringId ? 'wait' : 'pointer',
                  'text-align': 'left', 'border-bottom': `1px solid ${themeColors.border}`,
                  transition: 'background 0.15s', opacity: (props.restoringId && !isRestoring()) ? '0.5' : '1',
                }}
                onMouseEnter={(e) => { if (!isActive() && !props.restoringId) (e.currentTarget as HTMLElement).style.background = themeColors.bgSubtle; }}
                onMouseLeave={(e) => { if (!isActive()) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div style={{
                  'font-size': '12px', 'font-weight': '500',
                  color: isActive() ? chartColors.primary : themeColors.text,
                  overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap',
                  display: 'flex', 'align-items': 'center', gap: '4px',
                }}>
                  {/* 会话图标 */}
                  <span style={{
                    'flex-shrink': '0',
                    padding: '1px 5px', 'border-radius': '3px', 'font-size': '9px', 'font-weight': '600',
                    background: 'rgba(34,197,94,0.15)',
                    color: '#16a34a',
                    border: '1px solid rgba(34,197,94,0.3)',
                  }}>
                    {'💬对话'}
                  </span>
                  <span style={{ flex: '1', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
                    {item.title}
                  </span>
                  <Show when={isRestoring()}>
                    <span style={{ 'font-size': '10px', color: chartColors.primary, 'flex-shrink': '0' }}>加载中…</span>
                  </Show>
                </div>
                <Show when={!!item.ts}>
                  <div style={{ 'font-size': '10px', color: themeColors.textMuted, 'margin-top': '2px' }}>
                    {item.ts}
                  </div>
                </Show>
              </button>
            );
          }}
        </For>
      </Show>
    </div>
  </div>
);

// ─── 主页面 ────────────────────────────────────────────────────────────────────

const SoloAutopilot = () => {
  const { state, productStore, actions, resolvedWorkspaceId, openworkCtx } = useAppStore();
  const soloProducts = () => productStore.products().filter((p) => (p.productType ?? 'solo') === 'solo');

  // ── OpenCode Client 就绪状态（防止 client 未注入时调用 AI 功能）──────────────
  const [clientReady, setClientReady] = createSignal(isClientReady());
  createEffect(() => { setClientReady(isClientReady()); });

  // ── 基础状态 ────────────────────────────────────────────────────────────────
  const [createModalOpen, setCreateModalOpen] = createSignal(false);
  const [goal, setGoal] = createSignal('');
  // Agent 列表：异步加载，初始为空数组
  const [allAgents, setAllAgents] = createSignal<AutopilotAgent[]>([]);
  const [agentError, setAgentError] = createSignal<string | null>(null);

  // ── UI 面板状态 ──────────────────────────────────────────────────────────────
  const [showHistory, setShowHistory] = createSignal(false);
  const [historyItems, setHistoryItems] = createSignal<HistoryItem[]>([]);


  // ── OpenWork 能力状态 ────────────────────────────────────────────────────────
  const [capabilities, setCapabilities] = createSignal<CapabilityBadge[]>([]);
  const [knowledgeHealthScore, setKnowledgeHealthScore] = createSignal<number | null>(null);

  // ── 权限授权队列 ─────────────────────────────────────────────────────────────
  const [permissionQueue, setPermissionQueue] = createSignal<PermissionRequest[]>([]);
  const handlePermissionAsked = (params: PermissionRequest) =>
    setPermissionQueue((prev) => [...prev, params]);
  const handlePermissionResolve = (action: 'once' | 'always' | 'reject') => {
    const current = permissionQueue()[0];
    if (current) { current.resolve(action); setPermissionQueue((prev) => prev.slice(1)); }
  };



  // ── 模型选择 ──────────────────────────────────────────────────────────────────
  const [providerKeys, setProviderKeys] = createSignal<Record<string, string>>({});
  const [sessionModelId, setSessionModelId] = createSignal<string>(
    state.llmConfig.modelID ?? 'deepseek-chat'
  );

  const configuredModels = () =>
    modelOptions.filter(
      (opt) =>
        opt.providerID !== 'custom' &&
        (providerKeys()[opt.providerID]?.trim().length ?? 0) > 0,
    );

  const getSessionModel = () => {
    const opt = modelOptions.find((o) => o.modelID === sessionModelId());
    if (!opt || opt.providerID === 'custom') return undefined;
    if (!providerKeys()[opt.providerID]) return undefined;
    return { providerID: opt.providerID, modelID: opt.modelID };
  };

  // ── Chat 模式：普通对话消息（不走 Orchestrator，直接 callAgent）──────────────
  const [chatMessages, setChatMessages] = createSignal<ChatMsg[]>([]);
  const [chatLoading, setChatLoading] = createSignal(false);
  /** 标记"正在等待命令流式响应"，用于 session.command() 后的异步完成检测 */
  const [commandPending, setCommandPending] = createSignal(false);
  /** 标记 prompt 是否已真正发送到服务端：完成检测的入场券，防止复用 session 时残留 idle 状态被误判为完成 */
  const [promptSent, setPromptSent] = createSignal(false);
  /** 当前对话的 OpenCode Session ID（多轮复用同一 session） */
  const [currentChatSessionId, setCurrentChatSessionId] = createSignal<string | null>(null);
  // 历史会话恢复中的 sessionId（用于 loading 指示）
  const [restoringSessionId, setRestoringSessionId] = createSignal<string | null>(null);

  // ── SDD-015: 从 OpenWork 全局 session store 读取消息 ──────────────────────────
  // 全局 SSE 已捕获所有 session 事件，无需独立 accumulator
  const getSessionMessages = (sid: string | null): MessageWithParts[] => {
    if (!sid) return [];
    return openworkCtx?.messagesBySessionId?.(sid) ?? [];
  };

  // 乐观 UI：用户消息即时展示占位
  const [pendingUserMsg, setPendingUserMsg] = createSignal<MessageWithParts | null>(null);

  // 将旧 ChatMsg 格式转为 MessageWithParts（历史恢复兼容）
  function legacyToMessageWithParts(msg: ChatMsg): MessageWithParts {
    return {
      info: {
        id: msg.id,
        sessionID: '',
        role: msg.role,
        time: { created: msg.ts ? Date.parse(msg.ts) / 1000 : Date.now() / 1000 },
      } as any,
      parts: [{
        id: `part-${msg.id}`,
        type: 'text',
        text: msg.content,
        messageID: msg.id,
      } as any],
    };
  }

  // 合并消息源用于渲染：store 优先完全接管，避免 legacy 与 store 同时存在时消息重复（fix Bug 2 辅因）
  const chatDisplayMessages = createMemo((): MessageWithParts[] => {
    const sid = currentChatSessionId();
    const storeMsgs = getSessionMessages(sid);
    const legacy = chatMessages();
    const pending = pendingUserMsg();

    // store 有消息 → 以 store 为准（实时会话），pending 按时间戳插入到正确位置
    // 修复：SSE 先推送 assistant 流式响应时，若直接追加 pending 到末尾
    // 会导致用户输入显示在 AI 回复下方
    if (storeMsgs.length > 0) {
      const result = storeMsgs.map(stripAccUserMsg);
      if (pending) {
        const getTime = (m: MessageWithParts) =>
          Number((m.info as any).time?.created ?? 0);
        const pendingTime = getTime(pending);
        // 插入到第一条 time > pendingTime 的消息之前；
        // 若 store 全是更早的历史消息，则落到末尾（与旧行为一致）
        let insertIdx = result.length;
        for (let i = 0; i < result.length; i++) {
          if (getTime(result[i]) > pendingTime) {
            insertIdx = i;
            break;
          }
        }
        result.splice(insertIdx, 0, pending);
      }
      return result;
    }

    // store 无消息 → legacy（历史恢复）+ pending
    const result: MessageWithParts[] = legacy.map(legacyToMessageWithParts);
    if (pending) result.push(pending);
    return result;
  });

  // 清除乐观占位：store 中任一消息文本包含 pending 文本即认为已到达（fix Bug 2 主因）
  // 不限 role —— 规避 SSE 事件顺序竞态（message.part.updated 可能先于 message.updated 到达，此时 role 尚未填充）
  // 不再检查 '## 当前系统时间' —— system 参数已重构为独立注入，该标记不再出现在用户消息中
  createEffect(() => {
    const sid = currentChatSessionId();
    const storeMsgs = getSessionMessages(sid);
    const pending = pendingUserMsg();
    if (!pending) return;
    const pendingText = (pending.parts.find(p => p.type === 'text') as any)?.text ?? '';
    if (!pendingText) return;
    const arrived = storeMsgs.some(m =>
      m.parts.some(p => p.type === 'text' && ((p as any).text ?? '').includes(pendingText))
    );
    if (arrived) setPendingUserMsg(null);
  });

  // 新消息出现或流式更新时自动滚到底部
  createEffect(() => {
    chatDisplayMessages(); // 响应消息内容变化（含流式增量）
    requestAnimationFrame(() => {
      if (chatScrollRef) {
        chatScrollRef.scrollTop = chatScrollRef.scrollHeight;
      }
    });
  });

  // ── 从 OpenWork store 提取 assistant 文本（供产出物检测使用）──────────────────
  const extractAssistantTextFromStore = (sid: string | null): string => {
    if (!sid) return '';
    const msgs = openworkCtx?.messagesBySessionId?.(sid) ?? [];
    return msgs
      .filter(m => (m.info as any).role === 'assistant')
      .flatMap(m => m.parts.filter(p => p.type === 'text').map(p => (p as any).text ?? ''))
      .join('\n');
  };

  // ── 对齐 OpenWork session.tsx startRun/runHasBegun 模式 ──────────────────────
  // 统一完成检测（命令路径 + 普通对话路径）：
  // 通过 SolidJS reactive effect 监听 sessionStatusById，
  // 主路径：SSE 报告过 running/retry 状态后再转为 idle → 释放 loading。
  // 后备路径：Tauri 客户端中 SSE 事件可能被合并（session.status:busy 与 :idle 同 key），
  //   导致 running 状态被跳过，此时通过检查 assistant 消息数量变化来检测完成。
  let sessionSawRunning = false;
  /** 当前会话关联的 Skill 名称（斜杠命令路径设置，普通聊天为 null） */
  const [activeSessionSkill, setActiveSessionSkill] = createSignal<string | null>(null);
  /** prompt 发送前的 assistant 消息数量（用于后备完成检测） */
  let prePromptAssistantCount = -1;

  /** 定时器兜底：Tauri 环境下 reactive effect 可能不触发，每 2s 主动轮询检查 */
  let completionTimer: ReturnType<typeof setInterval> | undefined;
  const clearCompletionTimer = () => {
    if (completionTimer) { clearInterval(completionTimer); completionTimer = undefined; }
  };

  /** 完成时的统一处理：释放 loading + 产出物检测 */
  const handleSessionComplete = (sid: string, status: string, path: 'fast' | 'fallback' | 'timer') => {
    console.log(`[solo-chat] session ${sid} completed (${status}) via ${path}`);
    clearCompletionTimer();
    setChatLoading(false);
    setCommandPending(false);
    setPromptSent(false);
    sessionSawRunning = false;
    prePromptAssistantCount = -1;
    const fullText = extractAssistantTextFromStore(sid);
    if (fullText) {
      tryExtractArtifact('auto', fullText);
    }
  };

  /** 启动定时器兜底检测（不依赖 SolidJS reactive） */
  const startCompletionTimer = () => {
    clearCompletionTimer();
    let pollCount = 0;
    completionTimer = setInterval(async () => {
      const sid = currentChatSessionId();
      if (!sid || !chatLoading()) {
        clearCompletionTimer();
        return;
      }
      pollCount++;
      const statusMap = openworkCtx?.sessionStatusById?.() ?? {};
      const storeStatus = statusMap[sid];
      const msgs = openworkCtx?.messagesBySessionId?.(sid) ?? [];
      const assistantCount = msgs.filter(m => (m.info as any).role === 'assistant').length;
      // ▸ SSE 连通性诊断：检查全局 store 中是否有任何 session 状态
      const allStatusKeys = Object.keys(statusMap);
      console.log(`[solo-chat] timer-poll #${pollCount}: sid=${sid}, storeStatus=${storeStatus}, assistantCount=${assistantCount}, preCount=${prePromptAssistantCount}, allStatusKeys=${allStatusKeys.length}, keys=[${allStatusKeys.slice(0, 5).join(',')}], hasSessionStatusFn=${!!openworkCtx?.sessionStatusById}, hasMsgFn=${!!openworkCtx?.messagesBySessionId}`);

      // 路径 A：store 已显示 idle 且有新 assistant 消息 → 完成
      if ((storeStatus === 'idle' || storeStatus === 'completed') && prePromptAssistantCount >= 0 && assistantCount > prePromptAssistantCount) {
        handleSessionComplete(sid, storeStatus ?? 'idle', 'timer');
        return;
      }

      // 路径 B：store 仍显示 running 但有新 assistant 消息 ——
      // Tauri SSE 可能丢失了 session.idle 事件（连接超时重连期间错过）。
      // 通过 REST API 主动查询真实状态。
      if (storeStatus === 'running' && prePromptAssistantCount >= 0 && assistantCount > prePromptAssistantCount && pollCount >= 2) {
        const client = openworkCtx?.opencodeClient?.();
        if (client) {
          try {
            const result = await client.session.get({ sessionID: sid });
            const sessionData = result.data as Record<string, unknown> | undefined;
            // OpenCode session 返回 idle 或无 status 表示已完成
            const restStatus = sessionData?.status;
            const isRestIdle = !restStatus || restStatus === 'idle' || (typeof restStatus === 'object' && (restStatus as any)?.type === 'idle');
            console.log(`[solo-chat] timer-REST: sid=${sid}, restStatus=${JSON.stringify(restStatus)}, isRestIdle=${isRestIdle}`);
            if (isRestIdle) {
              handleSessionComplete(sid, 'idle', 'timer');
              return;
            }
          } catch (e) {
            console.warn('[solo-chat] timer-REST 查询失败:', e);
          }
        }
      }
    }, 2000);
  };

  createEffect(() => {
    const sid = currentChatSessionId();
    if (!sid || !chatLoading()) {
      sessionSawRunning = false;
      return;
    }
    // 门控：prompt 未真正发送到服务端前，任何 status 都不触发完成检测
    // 防止复用 existingSessionId 多轮会话时，sessionStatusById[sid] 残留的 idle 被 fallback 路径立即命中（fix Bug 1）
    if (!promptSent()) return;
    const statusMap = openworkCtx?.sessionStatusById?.() ?? {};
    const status = statusMap[sid];
    // 未被 SSE 追踪的 session（新建后首次 SSE 事件到达前）→ 等待
    if (!status) return;

    console.log(`[solo-chat] effect: sid=${sid}, status=${status}, sawRunning=${sessionSawRunning}, preCount=${prePromptAssistantCount}`);

    // 标记 session 曾进入活跃状态（对齐 OpenWork runHasBegun）
    if (status !== 'idle' && status !== 'completed') {
      sessionSawRunning = true;
    }

    const isIdle = status === 'idle' || status === 'completed';

    // 主路径：曾经活跃后回到 idle → 完成
    if (sessionSawRunning && isIdle) {
      handleSessionComplete(sid, status, 'fast');
      return;
    }

    // 后备路径：从未见过 running（事件被合并），但 status 已是 idle
    // 通过检查 assistant 消息数量增加来确认「这次 idle 是新对话完成后的 idle」
    if (!sessionSawRunning && isIdle && prePromptAssistantCount >= 0) {
      const msgs = openworkCtx?.messagesBySessionId?.(sid) ?? [];
      const currentAssistantCount = msgs.filter(m => (m.info as any).role === 'assistant').length;
      if (currentAssistantCount > prePromptAssistantCount) {
        handleSessionComplete(sid, status, 'fallback');
        return;
      }
    }
  });

  // MessageList 工具步骤展开状态
  const [chatExpandedStepIds, setChatExpandedStepIds] = createSignal<Set<string>>(new Set());
  let chatScrollRef: HTMLDivElement | undefined;

  // ── 已保存文件列表 ──────────────────────────────────────────────────────────
  const [savedFiles, setSavedFiles] = createSignal<SavedFileItem[]>([]);

  // 追踪最近保存的文件
  const latestSavedFile = createMemo(() => {
    const files = savedFiles();
    return files.length > 0 ? files[files.length - 1] : null;
  });

  // ── 自动保存产出物到磁盘 ───────────────────────────────────────────────────────
  const autoSaveArtifact = async (title: string, content: string, agentId: string, agentName: string, agentEmoji: string, customSavePath?: string) => {
    const product = productStore.activeProduct();
    const workDir = product?.workDir;
    if (!workDir) return;
    try {
      let appCode: string | undefined;
      try {
        const config = await readYaml<{ apps?: string[] }>('.xingjing/config.yaml', { apps: [] }, workDir);
        appCode = config.apps?.[0];
      } catch {}
      if (!appCode && product?.code) appCode = product.code;
      if (!appCode) return; // 静默失败

      const dirMap: Record<string, string> = {
        'product-brain': `apps/${appCode}/docs/product/prd`,
        'eng-brain': `apps/${appCode}/docs/product/architecture`,
      };
      const subDir = customSavePath
        ? `apps/${appCode}/${customSavePath}`
        : (dirMap[agentId] ?? `apps/${appCode}/docs/delivery`);
      const safeName = title.replace(/[\/\\:*?"<>|]/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
      const timestamp = new Date().toISOString().slice(0, 10);
      const format = detectMsgFormatForArtifact(content) === 'html' ? 'html' : 'markdown';
      const ext = format === 'html' ? '.html' : '.md';
      const fileName = `${safeName}-${timestamp}${ext}`;
      const relativePath = `${subDir}/${fileName}`;
      const result = await initProductDir(workDir, [{ path: relativePath, content }]);
      if (!result.ok) return;

      setSavedFiles((prev) => [...prev, {
        id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        relativePath,
        format: format as 'markdown' | 'html',
        agentName,
        agentEmoji,
        savedAt: nowTimeStr(),
      }]);
    } catch (e) {
      console.error('[solo-chat] autoSaveArtifact failed:', e);
    }
  };

  // ── 从 chat 回复中自动提取并保存产出物 ──────────────────────────────────────────
  const tryExtractArtifact = async (_aiMsgId: string, fullText: string) => {
    const skillName = activeSessionSkill();

    if (skillName) {
      // === Skill 驱动路径 ===
      const resolver: SkillContentResolver = {
        getSkill: async (name) => {
          try {
            const detail = await actions.getOpenworkSkill(name);
            return detail ? { content: detail.content } : null;
          } catch { return null; }
        },
      };
      const artifactConfig = await resolveSkillArtifactConfig(skillName, resolver);
      if (!artifactConfig?.enabled) {
        setActiveSessionSkill(null);
        return;
      }

      // 尝试从 AI 输出提取标记块
      const block = extractArtifactBlock(fullText);
      // 降级：如果没有标记块但内容达到文档标准，用全文作为产出物
      const content = block?.content ?? (looksLikeDocument(fullText) ? fullText : null);
      if (!content) {
        setActiveSessionSkill(null);
        return;
      }

      const title = block?.title ?? extractDocTitle(content);

      // 根据 Skill 配置决定是否保存
      if (artifactConfig.autoSave !== false) {
        void autoSaveArtifact(title, content, skillName, skillName, '📄', artifactConfig.savePath);
      }
    } else {
      // === 普通聊天路径：仅展示，不自动保存 ===
      if (!looksLikeDocument(fullText)) return;
      // 添加到产出物面板展示（不调用 autoSaveArtifact）
      const title = extractDocTitle(fullText);
      const format = detectMsgFormatForArtifact(fullText) === 'html' ? 'html' as const : 'markdown' as const;
      setSavedFiles((prev) => [...prev, {
        id: `artifact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title,
        relativePath: '',
        format,
        agentName: 'AI 助手',
        agentEmoji: '💬',
        savedAt: nowTimeStr(),
      }]);
    }

    setActiveSessionSkill(null);
  };

  // ── 加载 OpenWork 能力徽标 ─────────────────────────────────────────────────────
  const loadCapabilities = async (wsId: string | null) => {
    if (!wsId || !openworkCtx) return;
    const badges: CapabilityBadge[] = [];
    try {
      if (openworkCtx.listMcp) {
        const mcps = await openworkCtx.listMcp(wsId);
        if (mcps.length > 0) badges.push({ type: 'mcp', count: mcps.length, label: 'MCP 工具' });
      }
    } catch {}
    try {
      if (openworkCtx.listSkills) {
        const skills = await openworkCtx.listSkills(wsId);
        if (skills.length > 0) badges.push({ type: 'skill', count: skills.length, label: 'Skills' });
      }
    } catch {}
    try {
      if (openworkCtx.listCommands) {
        const cmds = await openworkCtx.listCommands(wsId);
        if (cmds.length > 0) badges.push({ type: 'command', count: cmds.length, label: '命令' });
      }
    } catch {}
    setCapabilities(badges);
  };

  // ── 加载历史会话 ──────────────────────────────────────────────────────────────
  const loadHistory = async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    try {
      // 优先通过 loadMemoryIndex 获取（已融合 sidecar.json 中的 mode 信息）
      const memIndex = await loadMemoryIndex(workDir);
      if (memIndex.sessions.length > 0) {
        const items: HistoryItem[] = memIndex.sessions.slice(0, 30).map((entry) => ({
          id: entry.id,
          title: entry.summary || entry.id.slice(0, 12),
          ts: entry.createdAt,

        }));
        setHistoryItems(items);
        return;
      }
    } catch { /* 降级到原始 title 判断 */ }

    // 降级：直接从 OpenCode session.list 读取，通过 title 前缀判断（历史数据兼容）
    const client = openworkCtx?.opencodeClient?.();
    if (!client) return;
    try {
      const result = await client.session.list({ directory: workDir });
      const sessions = Array.isArray(result.data) ? result.data : [];
      const toTs = (s: any) => {
        const ms = s.time?.updated ?? s.time?.created;
        if (!ms) return '—';
        return new Date(ms).toLocaleString('zh-CN', {
          month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });
      };
      const sorted = [...sessions].sort((a: any, b: any) => {
        const ta = a.time?.updated ?? a.time?.created ?? 0;
        const tb = b.time?.updated ?? b.time?.created ?? 0;
        return tb - ta;
      });
      const items: HistoryItem[] = sorted.slice(0, 30).map((s: any) => ({
        id: s.id,
        title: s.title || s.id.slice(0, 12),
        ts: toTs(s),
      }));
      setHistoryItems(items);
    } catch {}
  };

  // ── 恢复历史会话：通过 memory-store 加载消息并以 chat 气泡形式展示 ─────────────
  const restoreHistorySession = async (item: HistoryItem) => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;

    setRestoringSessionId(item.id);
    try {
      const detail = await loadMemorySession(workDir, item.id);
      if (!detail || detail.messages.length === 0) {
        console.warn('[solo-autopilot] 会话无消息:', item.id);
        setShowHistory(false);
        return;
      }

      // 将 MemoryMessage 转为 ChatMsg[]，只保留有文字内容的消息
      const converted: ChatMsg[] = [];
      for (const m of detail.messages) {
        const rawText = m.content?.trim();
        const text = (rawText && m.role === 'user') ? stripSystemContext(rawText) : rawText;
        if (!text) continue;

        const tsStr = m.ts
          ? new Date(m.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
          : nowTimeStr();

        converted.push({
          id: m.id || genMsgId(),
          role: m.role === 'user' ? 'user' : 'assistant',
          content: text,
          ts: tsStr,
        });
      }

      // 用历史消息替换当前 chat 消息
      setChatMessages(converted);
      // 恢复历史时，让用户可继续在同一 session 中对话
      setCurrentChatSessionId(item.id);
      // SDD-015: 确保全局 store 加载该 session 的消息
      if (openworkCtx?.ensureSessionLoaded) {
        void openworkCtx.ensureSessionLoaded(item.id);
      }
      setShowHistory(false);
    } catch (err) {
      console.error('[solo-autopilot] Failed to restore session:', err);
      setShowHistory(false);
    } finally {
      setRestoringSessionId(null);
    }
  };

  // ── 加载/刷新 providerKeys 的通用函数（onMount 和 activeProduct 变化时复用）──
  const loadProviderKeys = async (workDir: string | undefined) => {
    // 无论有无 workDir，始终先把全局 llmConfig 中的 key 加载进来
    const cur = state.llmConfig;
    const keys: Record<string, string> = {};
    if (cur.providerID && cur.apiKey) keys[cur.providerID] = cur.apiKey;

    if (workDir) {
      try {
        const settings = await loadProjectSettings(workDir);
        // 项目级 key 优先级更高，merge 到全局 key 之上
        Object.assign(keys, settings.llmProviderKeys ?? {});
      } catch {}
    }

    setProviderKeys(keys);
    const configured = modelOptions.filter(
      (opt) => opt.providerID !== 'custom' && (keys[opt.providerID]?.trim().length ?? 0) > 0,
    );
    if (configured.length > 0 && !configured.find((o) => o.modelID === sessionModelId())) {
      setSessionModelId(configured[0].modelID);
    }
  };

  // ── 响应式监听：activeProduct 变化时自动刷新 providerKeys ──────────────────────
  createEffect(() => {
    const workDir = productStore.activeProduct()?.workDir;
    loadProviderKeys(workDir);
  });

  // ── onMount ────────────────────────────────────────────────────────────────────
  onMount(async () => {
    const workDir = productStore.activeProduct()?.workDir;

    // 异步加载完整 Agent 列表（内置 + 自定义）
    listAllAgents('solo').then((agents) => {
      setAllAgents(agents);
    }).catch(() => {});

    if (workDir) {
      // 知识健康度
      buildKnowledgeIndex(workDir, null).then((idx) => {
        if (idx) return getHealthScore(workDir, idx);
        return null;
      }).then((score) => {
        if (score !== null) setKnowledgeHealthScore(score);
      }).catch(() => {});
    }

    // 能力徽标 + 历史
    const wsId = resolvedWorkspaceId();
    await loadCapabilities(wsId);
    await loadHistory();

    // 自动恢复最近一次会话（若存在）
    const items = historyItems();
    if (items.length > 0) {
      await restoreHistorySession(items[0]);
    }
  });

  const reset = () => {
    setSavedFiles([]);
    permissionQueue().forEach((req) => { try { req.resolve('reject'); } catch {} });
    setPermissionQueue([]);
  };

  // ── handleChatSend：💬 普通对话模式，支持 callAgent + session.command ──────────
  const handleChatSend = async (attachments?: ComposerAttachment[]) => {
    const text = goal().trim();
    // ✅ 保留 chatLoading() 防重复发送 + 扩展为支持仅附件发送
    if ((!text && !(attachments?.length)) || chatLoading()) return;

    // ▸ 诊断日志：记录入口状态
    const _model = getSessionModel();
    console.log('[solo-chat] handleChatSend 入口', {
      hasModel: !!_model,
      modelID: _model?.modelID,
      providerID: _model?.providerID,
      existingSessionId: currentChatSessionId(),
      configuredModelsCount: configuredModels().length,
      workDir: productStore.activeProduct()?.workDir,
      pendingCommand: pendingCommand(),
    });

    // ▸ 前置模型验证（与 dispatch 模式保持一致）
    if (!_model && configuredModels().length === 0) {
      setAgentError('尚未配置可用的大模型，请先前往「设置 → 大模型配置」填写 API Key');
      return;
    }

    // ── 检测命令执行路径 ──
    const cmd = pendingCommand();
    setPendingCommand(null);  // 消费一次性命令

    let commandName = cmd?.name ?? null;
    let commandArgs = '';
    if (!commandName && text.startsWith('/')) {
      // 支持直接输入 /command-name args 的文本格式
      const spaceIdx = text.indexOf(' ');
      commandName = spaceIdx > 0 ? text.slice(1, spaceIdx) : text.slice(1);
      commandArgs = spaceIdx > 0 ? text.slice(spaceIdx + 1).trim() : '';
    } else if (commandName) {
      // 面板选中路径：尝试从输入框文本中去掉 /commandName 前缀
      // P3 修复：若用户已修改输入框内容（删除了 /commandName），则直接将整个 text 作为 args
      // 这样用户修改过的内容不会展示为命令名套骗
      const prefix = `/${commandName}`;
      if (text.startsWith(prefix)) {
        // 正常情况：输入框含有 /commandName 前缀，前缀后面即为 args
        commandArgs = text.slice(prefix.length).trim();
      } else if (text.trim() === '') {
        // 输入框已被清空（用户删除了全部内容），无 args
        commandArgs = '';
      } else {
        // 用户修改了输入框（删除了 /commandName 前缀但添加了自定义内容），认为是手动输入的 args
        commandArgs = text.trim();
      }
    }

    // ── 命令执行路径：通过 session.command() ──
    if (commandName) {
      setActiveSessionSkill(commandName);
      const client = openworkCtx?.opencodeClient?.();
      if (!client) { setAgentError('OpenCode 未连接'); return; }

      // ▸ 兜底：确保 Provider auth 已同步到 OpenCode（复用 store 的 ensureProviderAuth，内置 dedup）
      await actions.ensureProviderAuth();

      // 乐观 UI + 加载状态
      const syntheticUserMsg: MessageWithParts = {
        info: {
          id: `pending-${Date.now()}`,
          sessionID: currentChatSessionId() || 'pending',
          role: 'user',
          time: { created: Date.now() / 1000 },
        } as any,
        parts: [{ id: `part-${Date.now()}`, type: 'text', text: `/${commandName} ${commandArgs}`, messageID: '' } as any],
      };
      setPendingUserMsg(syntheticUserMsg);

      setChatLoading(true);
      setGoal('');
      setAgentError(null);

      const model = getSessionModel();
      const modelStr = model ? `${model.providerID}/${model.modelID}` : undefined;
      const workDir = productStore.activeProduct()?.workDir;

      // 确保有 session（直接创建，不发送空 prompt）
      let sid = currentChatSessionId();
      if (!sid) {
        try {
          console.log('[solo-chat] 为命令创建新 session（不发送空 prompt）');
          const result = await client.session.create({
            title: `/${commandName}`,
            ...(workDir ? { directory: workDir } : {}),
          } as any);
          sid = (result.data as { id: string } | undefined)?.id ?? null;
          // ▸ 检查 result.error（HeyAPI SDK 不抛异常，错误在 result.error 中返回）
          if (!sid) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const err = (result as any).error;
            const errName = err?.name;
            if (errName === 'ConfigInvalidError') {
              setAgentError('大模型未配置，请在设置页配置 API Key 后重试');
              setChatLoading(false);
              return;
            }
            console.error('[xingjing] session.create for command failed (result.error):', err);
          }
          if (sid) {
            setCurrentChatSessionId(sid);
            console.log('[solo-chat] 命令 session 已创建', { sid, command: commandName });
            // SDD-015: 确保全局 store 加载该 session 的消息（await 对齐 runAgentSession）
            if (openworkCtx?.ensureSessionLoaded) {
              try {
                await openworkCtx.ensureSessionLoaded(sid);
              } catch { /* 非致命，store 可能稍后同步 */ }
            }
            // /skill 命令路径：mode 标记为 chat（命令在单一 session 中执行）
            if (workDir) void saveMemoryMeta(workDir, sid, { tags: [], mode: 'chat' });
          }
        } catch (e) {
          // 网络异常等运行时错误
          console.error('[xingjing] session.create for command threw:', e);
        }
      }

      if (!sid) {
        setAgentError('无法创建会话');
        setChatLoading(false);
        return;
      }

      // [FIX] 记录 prompt 发送前的 assistant 消息数（供后备完成检测使用，对齐普通对话路径）
      const cmdMsgs = openworkCtx?.messagesBySessionId?.(sid) ?? [];
      prePromptAssistantCount = cmdMsgs.filter(m => (m.info as any).role === 'assistant').length;

      // P2 修复：命令路径导入 knowledge/recall 上下文（对齐普通对话路径）
      // 如果有知识库内容则拼接到 commandArgs 后面作为辅助上下文
      let enrichedArgs = commandArgs;
      if (workDir) {
        try {
          const skillApiAdapter = openworkCtx ? {
            listSkills: () => actions.listOpenworkSkills(),
            getSkill: (name: string) => actions.getOpenworkSkill(name),
            upsertSkill: (name: string, content: string, desc?: string) =>
              actions.upsertOpenworkSkill(name, content, desc ?? ''),
          } : null;
          const [knowledgeCtx, recallResult] = await Promise.all([
            retrieveKnowledge({ workDir, skillApi: skillApiAdapter, query: commandArgs || commandName, scene: 'autopilot' }).catch(() => ''),
            recallRelevantContext(workDir, commandArgs || commandName).then(r => r.contextText).catch(() => ''),
          ]);
          const ctxParts: string[] = [];
          if (knowledgeCtx?.trim()) ctxParts.push(`## 相关知识\n${knowledgeCtx.trim()}`);
          if (recallResult?.trim()) ctxParts.push(`## 第三方回忆\n${recallResult.trim()}`);
          if (ctxParts.length > 0) {
            enrichedArgs = ctxParts.join('\n\n') + (commandArgs ? `\n\n## 用户指令\n${commandArgs}` : '');
          }
        } catch { /* 上下文获取失败不阻塞主流程 */ }
      }

      // [FIX] 在 HTTP 调用前设置 commandPending，确保 streaming 完成检测 effect
      // 能捕获 SSE 流式在 await 期间完成的 isStreaming true→false 转换
      setCommandPending(true);
      setPromptSent(false); // 关门：HTTP 调用返回前拒绝任何完成检测
      try {
        console.log('[solo-chat] 调用 session.command', { sid, command: commandName, model: modelStr });
        await client.session.command({
          sessionID: sid,
          command: commandName,
          arguments: enrichedArgs,
          model: modelStr,
        });
        setPromptSent(true); // 开门：HTTP 已返回，允许完成检测接管
        console.log('[solo-chat] session.command HTTP 已返回，等待 SSE 完成', { sid });
        // HTTP 调用返回后 SSE 异步执行，chatLoading 由 commandPending effect 管理
        // 补偿检查：如果 SSE 流在 HTTP 等待期间已完成，effect 可能已清除了 commandPending
        // 这里无需额外处理，effect 的补偿路径会在下一个 tick 自动检测
        // 超时兜底：复杂 Skill（brainstorming/writing-plans 等）可能需要多轮工具调用，
        // 延长至 120s 避免过早中断，同时保留 loading 状态防止用户误操作
        setTimeout(() => {
          if (commandPending()) {
            console.warn('[solo-chat] 命令流式超时 120s，释放 loading');
            setChatLoading(false);
            setCommandPending(false);
          }
        }, 120000);
        // 启动定时器兜底：确保 Tauri 环境下即使 reactive effect 不触发也能检测完成（对齐普通对话路径）
        startCompletionTimer();
      } catch (e) {
        setCommandPending(false);
        setAgentError(`命令执行失败：${e}`);
        setChatLoading(false);
      }
      return;
    }

    // ── 普通对话路径（含 @agent / @skill:xxx 解析）──
    setActiveSessionSkill(null);

    // 解析 @mention：支持三种形式
    //   @agentId text  → targetAgent 直连 Agent
    //   @skill:name t  → targetSkill 注入 Skill 上下文执行（runDirectSkill）
    //   普通文本        → 普通对话
    const { targetAgent, targetSkill, cleanText } = parseMention(text, allAgents());

    // ── @skill:xxx 路径 ──
    // P0 修复：独立版之前丢弃了 targetSkill，此处补充分支
    if (targetSkill) {
      setActiveSessionSkill(targetSkill);
      const workDirSkill = productStore.activeProduct()?.workDir;
      const modelSkill = getSessionModel();

      // 乐观 UI
      const skillUserMsg: MessageWithParts = {
        info: {
          id: `pending-${Date.now()}`,
          sessionID: currentChatSessionId() || 'pending',
          role: 'user',
          time: { created: Date.now() / 1000 },
        } as any,
        parts: [{ id: `part-${Date.now()}`, type: 'text', text, messageID: '' } as any],
      };
      setPendingUserMsg(skillUserMsg);
      setGoal('');
      setChatLoading(true);
      setAgentError(null);

      const skillApiAdapter = openworkCtx ? {
        listSkills: () => actions.listOpenworkSkills(),
        getSkill: (name: string) => actions.getOpenworkSkill(name),
        upsertSkill: (name: string, content: string, desc?: string) =>
          actions.upsertOpenworkSkill(name, content, desc ?? ''),
      } : null;

      const { runDirectSkill } = await import('../../../services/autopilot-executor');
      try {
        await runDirectSkill(targetSkill, cleanText, {
          workDir: workDirSkill,
          model: modelSkill ?? undefined,
          callAgentFn: (o) => actions.callAgent(o),
          skillApi: skillApiAdapter,
          onPermissionAsked: handlePermissionAsked,
          onStatus: (status) => {
            if (status === 'done' || status === 'error') {
              setChatLoading(false);
              setActiveSessionSkill(null);
            }
          },
          onStream: (_text) => {
            // SSE 消息由全局 store 驱动，无需手动追加
          },
          onDone: (fullText) => {
            setChatLoading(false);
            setActiveSessionSkill(null);
            if (fullText) void tryExtractArtifact('auto', fullText);
          },
          onError: (err) => {
            setChatLoading(false);
            setActiveSessionSkill(null);
            setAgentError(`Skill ${targetSkill} 执行失败：${err}`);
          },
        });
      } catch (e) {
        setChatLoading(false);
        setActiveSessionSkill(null);
        setAgentError(String(e));
      }
      return;
    }

    const finalPrompt = targetAgent ? cleanText : text;

    // 乐观 UI：立即展示用户消息（含附件 file parts 供 MessageList 渲染）
    // UI 仍显示原始 text（含 @mention），用户可见
    const userParts: any[] = [{ id: `part-${Date.now()}`, type: 'text', text, messageID: '' }];
    if (attachments?.length) {
      for (const att of attachments) {
        userParts.push({
          id: `att-${att.id}`,
          type: 'file',
          url: att.previewUrl || '',
          filename: att.name,
          mime: att.mimeType,
          messageID: '',
        });
      }
    }
    const syntheticUserMsg: MessageWithParts = {
      info: {
        id: `pending-${Date.now()}`,
        sessionID: currentChatSessionId() || 'pending',
        role: 'user',
        time: { created: Date.now() / 1000 },
      } as any,
      parts: userParts,
    };
    setPendingUserMsg(syntheticUserMsg);

    setGoal('');          // 立即清空输入框
    setChatLoading(true);
    setPromptSent(false); // 关门：prompt 真正发送到服务端前拒绝任何完成检测（fix Bug 1）
    setAgentError(null);

    // P3 修复：快照时机对齐 session 创建异步
    // 若已有 existingSid，在发送前读取当前数量；若没有，则等 callAgent 创建 session 后（在 onSessionCreated 回调中）再快照
    // 此处先设为 -1 表示“尚未就绪”，如果是新建 session 由 onSessionCreated 覆盖为 0
    const existingSid = currentChatSessionId();
    if (existingSid) {
      const msgs = openworkCtx?.messagesBySessionId?.(existingSid) ?? [];
      prePromptAssistantCount = msgs.filter(m => (m.info as any).role === 'assistant').length;
    } else {
      prePromptAssistantCount = -1; // 新建 session，在 onSessionCreated 中覆盖为 0
    }

    const productName = productStore.activeProduct()?.name;
    const productDesc = productName ? `你是「${productName}」产品的 AI 助手，精通产品策略、技术架构与增长分析。` : '你是一个专业的产品 AI 助手，精通产品策略、技术架构与增长分析。';
    const workDir = productStore.activeProduct()?.workDir;

    // 仅当用户意图涉及 Git 操作时才注入认证上下文
    const GIT_TRIGGER_KEYWORDS = ['保存', '保存成果', '提交', '提交git', 'commit', 'push', 'git', '推送', '同步到仓库'];
    const needGitContext = GIT_TRIGGER_KEYWORDS.some(kw => text.toLowerCase().includes(kw));
    const gitContext = needGitContext
      ? buildGitSystemContext(productStore.activeProduct()?.gitUrl)
      : '';

    // 使用 actions.callAgent 创建 session + 发送 prompt，确保注入 OpenWork 上下文。
    // callAgent 在 prompt 发送后立即返回（对齐 OpenWork 原生方案），
    // 完成检测由上方的 reactive effect 监听 sessionStatusById 驱动。
    // [FIX Bug 1] 关键：必须等待 callAgent 完成（prompt 真正发送）后再置 promptSent=true 并启动 timer，
    // 否则复用 session 时 sessionStatusById[sid] 残留的 idle 会被 timer 立即命中，
    // 导致 chatLoading 提前释放 → UI 只显示部分内容就终止。
    actions.callAgent({
      userPrompt: finalPrompt,
      agentId: targetAgent?.id,
      // 命中 Agent 时不再重复拼接默认 systemPrompt（OpenCode 从 .opencode/agents/ 加载）
      systemPrompt: targetAgent
        ? undefined
        : `${productDesc}请用简洁、专业的中文回答用户的问题。${gitContext}`,
      title: currentChatSessionId()
        ? undefined
        : (finalPrompt.length > 50 ? finalPrompt.slice(0, 50) + '...' : finalPrompt),
      model: getSessionModel(),
      directory: workDir,
      existingSessionId: currentChatSessionId() || undefined,
      attachments,
      // 关键：session 建立后确保全局 store 加载
      onSessionCreated: (sid) => {
        setCurrentChatSessionId(sid);
        // P3 修复：新建 session 时，在 session 创建后立即快照 assistant 消息数（应为 0）
        // 避免先设为 0 而 SSE 极快到达时被后备路径立即命中
        if (prePromptAssistantCount < 0) {
          const newMsgs = openworkCtx?.messagesBySessionId?.(sid) ?? [];
          prePromptAssistantCount = newMsgs.filter(m => (m.info as any).role === 'assistant').length;
        }
        // 确保全局 store 加载该 session 消息（全局 SSE 已在接收事件）
        if (openworkCtx?.ensureSessionLoaded) {
          void openworkCtx.ensureSessionLoaded(sid);
        }
        // P1 修复：@agent 路径应标记为 'dispatch'（直连 Agent 与调度模式语义一致）
        if (workDir) void saveMemoryMeta(workDir, sid, { tags: [], mode: targetAgent ? 'dispatch' : 'chat' });
      },
      // onError 仅处理创建/发送阶段的错误（完成检测由 reactive effect 管理）
      onError: (errMsg) => {
        setChatLoading(false);
        setAgentError(errMsg);
      },
    })
      .then(() => {
        // prompt 已真正发送 → 开门并启动 timer 兜底
        setPromptSent(true);
        startCompletionTimer();
      })
      .catch((e) => {
        setChatLoading(false);
        setAgentError(String(e));
      });
  };

  // ── handleStart：🚀 团队调度模式 ─────────────────────────────────────────────
  onCleanup(() => {
    console.log('[solo-chat] onCleanup: 清理资源');
    clearCompletionTimer();
  });

  // ── 文件搜索（供 @file mention 使用）─────────────────────────────────────────
  const searchWorkspaceFiles = async (query: string): Promise<string[]> => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const client = openworkCtx?.opencodeClient?.();
    if (!client) return [];
    try {
      const workDir = productStore.activeProduct()?.workDir;
      const result = await client.find.files({
        query: trimmed,
        dirs: 'true',
        limit: 50,
        ...(workDir ? { directory: workDir } : {}),
      } as any);
      // unwrap: result.data 是 string[]
      return Array.isArray(result.data) ? result.data : [];
    } catch {
      return [];
    }
  };

  // ── Slash 命令（动态加载）─────────────────────────────────────────────────────────

  // 待执行的命令（用户选中后暂存，提交时执行）
  const [pendingCommand, setPendingCommand] = createSignal<{ name: string } | null>(null);

  // 从 OpenCode 获取可用命令 + OpenWork Skills 合并
  const listSlashCommands = async (): Promise<SlashCommand[]> => {
    const client = openworkCtx?.opencodeClient?.();
    const workDir = productStore.activeProduct()?.workDir;
    const wsId = resolvedWorkspaceId();

    // 并行获取 OpenCode commands + OpenWork skills
    const [cmds, skills] = await Promise.all([
      client ? listCommandsTyped(client, workDir) : Promise.resolve([]),
      (wsId && openworkCtx?.listSkills)
        ? openworkCtx!.listSkills(wsId).catch(() => [] as never[])
        : Promise.resolve([] as never[]),
    ]);

    const seen = new Set<string>();
    const result: SlashCommand[] = [];

    // OpenCode commands 优先
    for (const c of cmds) {
      seen.add(c.name);
      result.push({ id: c.id, name: c.name, description: c.description, source: c.source });
    }

    // 补充 OpenWork skills（去重）
    for (const s of skills) {
      const name = s.name.startsWith('skill-') ? s.name.slice(6) : s.name;
      if (!seen.has(name)) {
        seen.add(name);
        result.push({ id: `skill:${s.name}`, name, description: s.description, source: 'skill' });
      }
    }

    return result;
  };

  // 用户选中斜杠命令
  const handleCommandSelect = (cmd: SlashCommand) => {
    setPendingCommand({ name: cmd.name });
  };

  // ── Session Compact（长对话压缩摘要）─────────────────────────────────────
  const [compacting, setCompacting] = createSignal(false);

  const handleCompactSession = async () => {
    const sid = currentChatSessionId();
    if (!sid || compacting() || chatLoading()) return;
    const client = openworkCtx?.opencodeClient?.();
    if (!client) { setAgentError('OpenCode 未连接'); return; }
    const model = getSessionModel();
    if (!model) { setAgentError('未配置模型，无法压缩'); return; }
    setCompacting(true);
    try {
      const workDir = productStore.activeProduct()?.workDir;
      await compactSession(client, sid, model, workDir ? { directory: workDir } : undefined);
      console.log('[solo-chat] session compacted:', sid);
    } catch (e) {
      console.error('[solo-chat] compact failed:', e);
      setAgentError(`压缩失败：${e}`);
    } finally {
      setCompacting(false);
    }
  };

  // 显示压缩按钮的条件：有活跃 session 且消息数 >= 10
  const showCompactBtn = () =>
    !!currentChatSessionId() && chatDisplayMessages().length >= 10 && !chatLoading();

  // ── 渲染 ────────────────────────────────────────────────────────────────────────

  // 全局 store 有消息 OR 有乐观占位消息 OR 正在加载
  const hasContent = () =>
    chatDisplayMessages().length > 0 || chatLoading();

  const isRunning = () => chatLoading();

  return (
    <Show
      when={clientReady()}
      fallback={
        <div style={{
          display: 'flex', 'flex-direction': 'column', 'align-items': 'center',
          'justify-content': 'center', height: '100%', gap: '12px',
          background: themeColors.appBg,
        }}>
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: chartColors.primary }} />
          <div style={{ 'font-size': '14px', color: themeColors.text }}>正在连接 OpenCode 服务...</div>
          <div style={{ 'font-size': '12px', color: themeColors.textMuted }}>请确保 OpenWork 已启动并选择了工作区</div>
        </div>
      }
    >
    <div style={{ display: 'flex', 'align-items': 'stretch', width: '100%', height: '100%', overflow: 'hidden', gap: '8px' }}>

      {/* ── 历史侧边栏 ── */}
      <Show when={showHistory()}>
        <HistorySidebar
          items={historyItems()}
          activeId={currentChatSessionId()}
          restoringId={restoringSessionId()}
          onSelect={(id) => {
            const item = historyItems().find((h) => h.id === id);
            if (item) restoreHistorySession(item);
            else setShowHistory(false);
          }}
          onClose={() => setShowHistory(false)}
          onNewSession={() => {
            // 新建会话：重置所有状态，关闭历史侧边栏
            reset();
            setChatMessages([]);
            setCurrentChatSessionId(null);
            setPendingUserMsg(null);
            setShowHistory(false);
          }}
        />
      </Show>



      {/* ── 中间列：对话区 ── */}
      <div style={{ flex: '1', 'min-width': '0', display: 'flex', 'flex-direction': 'column', overflow: 'hidden' }}>

        {/* 顶部横幅 */}
        <div style={{
          display: 'flex', 'align-items': 'center', 'justify-content': 'space-between',
          padding: '6px 12px', 'border-radius': '8px', 'margin-bottom': '8px',
          background: themeColors.primaryBg, border: `1px solid ${themeColors.primaryBorder}`,
          'flex-shrink': '0',
        }}>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
            <strong style={{ 'font-size': '12px', color: chartColors.primary }}>
              独立版 · AI 虚拟团队
            </strong>
            <Show when={knowledgeHealthScore() !== null}>
              <span style={{
                'font-size': '10px', padding: '1px 6px', 'border-radius': '9999px',
                background: knowledgeHealthScore()! >= 80 ? chartColors.success : knowledgeHealthScore()! >= 50 ? '#fa8c16' : chartColors.error,
                color: 'white', 'font-weight': 600,
              }}>
                🧠 {knowledgeHealthScore()}分
              </span>
            </Show>
            <span style={{ 'font-size': '11px', color: themeColors.textSecondary }}>
              {'💬 直接问 AI，快速获取答案 · 支持 @agent / @file / /命令'}
            </span>
          </div>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
            {/* 新建会话按钮（有内容时显示，提供返回/清空入口） */}
            <Show when={hasContent()}>
              <button
                onClick={() => {
                  reset();
                  setChatMessages([]);
                  setCurrentChatSessionId(null);
                  setPendingUserMsg(null);
                }}
                title="新建会话"
                style={{
                  display: 'flex', 'align-items': 'center', gap: '4px',
                  padding: '3px 8px', 'border-radius': '6px', 'font-size': '11px',
                  border: `1px solid ${themeColors.border}`, background: 'transparent',
                  color: themeColors.textMuted,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = '#22c55e';
                  (e.currentTarget as HTMLElement).style.borderColor = '#22c55e';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = themeColors.textMuted;
                  (e.currentTarget as HTMLElement).style.borderColor = themeColors.border;
                }}
              >
                <Plus size={12} />
                新建
              </button>
            </Show>
            {/* 压缩会话按钮（消息较多时显示） */}
            <Show when={showCompactBtn()}>
              <button
                onClick={handleCompactSession}
                disabled={compacting()}
                title="压缩当前会话（减少上下文长度，提升响应速度）"
                style={{
                  display: 'flex', 'align-items': 'center', gap: '4px',
                  padding: '3px 8px', 'border-radius': '6px', 'font-size': '11px',
                  border: `1px solid ${themeColors.border}`, background: 'transparent',
                  color: compacting() ? chartColors.primary : themeColors.textMuted,
                  cursor: compacting() ? 'wait' : 'pointer', transition: 'all 0.15s',
                  opacity: compacting() ? '0.7' : '1',
                }}
                onMouseEnter={(e) => {
                  if (!compacting()) {
                    (e.currentTarget as HTMLElement).style.color = chartColors.primary;
                    (e.currentTarget as HTMLElement).style.borderColor = chartColors.primary;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!compacting()) {
                    (e.currentTarget as HTMLElement).style.color = themeColors.textMuted;
                    (e.currentTarget as HTMLElement).style.borderColor = themeColors.border;
                  }
                }}
              >
                <Show when={compacting()} fallback={<Minimize2 size={12} />}>
                  <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                </Show>
                {compacting() ? '压缩中...' : '压缩'}
              </button>
            </Show>
            {/* 历史按钮 */}
            <button
              onClick={() => {
                const opening = !showHistory();
                setShowHistory(opening);
                if (opening) loadHistory();
              }}
              title="会话历史"
              style={{
                display: 'flex', 'align-items': 'center', gap: '4px',
                padding: '3px 8px', 'border-radius': '6px', 'font-size': '11px',
                border: `1px solid ${themeColors.border}`, background: showHistory() ? themeColors.primaryBg : 'transparent',
                color: showHistory() ? chartColors.primary : themeColors.textMuted,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <History size={12} />
              历史
            </button>
          </div>
        </div>

        {/* 无产品空状态 */}
        <Show when={soloProducts().length === 0}>
          <div style={{
            background: themeColors.successBg, border: `1px dashed ${themeColors.successBorder}`,
            'text-align': 'center', 'border-radius': '10px', padding: '20px', 'flex-shrink': '0', 'margin-bottom': '8px',
          }}>
            <div style={{ 'font-size': '40px', 'margin-bottom': '10px' }}>🤖</div>
            <div style={{ 'font-weight': '600', color: themeColors.success, 'margin-bottom': '6px' }}>开始你的独立产品之旅</div>
            <div style={{ 'font-size': '13px', color: themeColors.textSecondary, 'margin-bottom': '14px' }}>
              还没有创建项目？先建一个，让 AI 虚拟团队为你服务
            </div>
            <button
              onClick={() => setCreateModalOpen(true)}
              style={{
                background: chartColors.success, color: 'white', border: 'none',
                'border-radius': '6px', padding: '7px 20px', 'font-size': '13px', cursor: 'pointer',
              }}
            >
              创建我的第一个产品
            </button>
          </div>
        </Show>

        {/* ── 空状态（无内容）：显示欢迎引导 ── */}
        <Show when={!hasContent()}>
          <div style={{
            flex: '1', display: 'flex', 'flex-direction': 'column',
            'align-items': 'center', 'justify-content': 'center', 'padding-bottom': '20px',
          }}>
            <div style={{ width: '100%', 'max-width': '600px' }}>
              <div style={{ 'text-align': 'center', 'margin-bottom': '20px' }}>
                <div style={{ 'font-size': '36px', 'margin-bottom': '8px' }}>{'💬'}</div>
                <div style={{ 'font-size': '16px', 'font-weight': '600', color: themeColors.text, 'margin-bottom': '4px' }}>
                  {'和 AI 直接对话'}
                </div>
                <div style={{ 'font-size': '13px', color: themeColors.textMuted }}>
                  {'提问、头脑风暴、分析——支持 @agent / @file / /命令'}
                </div>
              </div>
              <div style={{ display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '8px', 'margin-bottom': '16px' }}>
                <For each={QUICK_SAMPLES}>
                  {(sample) => (
                    <button
                      onClick={() => setGoal(sample)}
                      style={{
                        padding: '10px 12px', 'border-radius': '8px',
                        border: `1px solid ${themeColors.border}`,
                        background: themeColors.surface, cursor: 'pointer',
                        'text-align': 'left', 'font-size': '12px',
                        color: themeColors.text, transition: 'all 0.15s', 'line-height': '1.5',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = chartColors.success;
                        (e.currentTarget as HTMLElement).style.background = themeColors.successBg;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.borderColor = themeColors.border;
                        (e.currentTarget as HTMLElement).style.background = themeColors.surface;
                      }}
                    >
                      {sample}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </div>
        </Show>

        {/* ── 💬 Chat 消息列表 ── */}
        <Show when={hasContent()}>
          <div
            ref={(el) => { chatScrollRef = el; }}
            style={{ flex: '1', 'overflow-y': 'auto', 'min-height': '0', padding: '12px 4px' }}
          >
            <MessageList
              messages={chatDisplayMessages()}
              isStreaming={chatLoading()}
              developerMode={false}
              showThinking={true}
              expandedStepIds={chatExpandedStepIds()}
              setExpandedStepIds={setChatExpandedStepIds}
              scrollElement={() => chatScrollRef}
              variant="bubble"
            />
          </div>
          {/* 产出物自动保存提示条 */}
          <Show when={!chatLoading() && latestSavedFile()}>
            {(file) => (
              <div style={{
                display: 'flex', 'align-items': 'center', gap: '8px',
                padding: '8px 14px', margin: '0 4px 8px',
                'border-radius': '8px',
                border: `1px solid ${themeColors.border}`,
                background: themeColors.surface,
                'font-size': '12px',
              }}>
                <FileText size={14} style={{ color: chartColors.success, 'flex-shrink': '0' }} />
                <span style={{ color: themeColors.textMuted }}>已保存产出物：</span>
                <span style={{ color: chartColors.primary, 'font-weight': 600, 'font-size': '12px' }}>
                  {file().title}
                </span>
              </div>
            )}
          </Show>
        </Show>



        {/* ── 底部：增强输入组件 ── */}
        <div style={{
          'flex-shrink': '0',
          'border-top': hasContent() ? `1px solid ${themeColors.border}` : 'none',
          'padding-top': hasContent() ? '10px' : '0',
          'margin-top': '6px',
        }}>
          {/* 错误提示 */}
          <Show when={agentError() !== null}>
            <div style={{
              'margin-bottom': '8px', padding: '8px 12px', 'border-radius': '7px',
              'font-size': '12px', background: '#fff2f0', border: '1px solid #ffccc7',
              color: '#cf1322', display: 'flex', 'align-items': 'flex-start', gap: '8px',
            }}>
              <AlertCircle size={14} style={{ 'flex-shrink': '0', 'margin-top': '1px' }} />
              <div style={{ flex: '1' }}>
                <div style={{ 'font-weight': '600', 'margin-bottom': '2px' }}>AI 调用失败</div>
                <div>{agentError()}</div>
              </div>
              <button onClick={() => setAgentError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cf1322', padding: '0' }}>
                <X size={14} />
              </button>
            </div>
          </Show>

          {/* EnhancedComposer */}
          <EnhancedComposer
            value={goal()}
            onChange={setGoal}
            isRunning={isRunning()}
            hasSession={hasContent()}
            agents={allAgents()}
            configuredModels={configuredModels()}
            selectedModelId={sessionModelId()}
            onModelChange={setSessionModelId}
            onSubmit={handleChatSend}
            onStop={() => {
              clearCompletionTimer();
              setChatLoading(false);
              // 同时通知 OpenCode 中止当前 session，确保状态一致
              const sid = currentChatSessionId();
              const client = openworkCtx?.opencodeClient?.();
              if (sid && client) {
                void abortSessionSafe(client, sid);
              }
            }}
            onReset={reset}
            capabilities={capabilities()}
            listCommands={listSlashCommands}
            onCommandSelect={handleCommandSelect}
            knowledgeScore={knowledgeHealthScore()}
            placeholder="问我任何关于你产品的问题，@ 召唤 Agent，/ 触发命令..."
            searchFiles={searchWorkspaceFiles}
          />

          <div style={{ 'font-size': '10px', color: themeColors.textMuted, 'margin-top': '5px', 'text-align': 'center' }}>
            Enter 发送 · Shift+Enter 换行 · @ 召唤 Agent · / 触发命令
          </div>
        </div>
      </div>

      {/* ── 已保存文件列表侧栏 ── */}
      <Show when={savedFiles().length > 0}>
        <SavedFileList
          files={savedFiles()}
          workDir={productStore.activeProduct()?.workDir ?? ''}
        />
      </Show>

      {/* ── 权限授权 Dialog ── */}
      <Show when={permissionQueue()[0]} keyed>
        {(req) => (
          <PermissionDialog request={req} onResolve={handlePermissionResolve} />
        )}
      </Show>

      <CreateProductModal open={createModalOpen()} onClose={() => setCreateModalOpen(false)} />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
    </Show>
  );
};

export default SoloAutopilot;
