/**
 * EnhancedComposer — Claude Cowork 风格的增强输入组件
 *
 * 功能：
 * 1. 自动高度自适应 textarea（支持 Shift+Enter 换行，Enter 发送）
 * 2. @mention Agent 弹出选择器（接入已有 MentionInput 逻辑）
 * 3. /slash 命令面板（快速触发 OpenWork 能力）
 * 4. 能力徽标区：显示已接入的 MCP / 知识库 / 技能数量
 * 5. 底部工具栏：模型选择器 + 发送 / 停止按钮
 * 6. 附件上传（点击/粘贴/拖拽，对齐 OpenWork Composer）
 * 7. IME 输入保护（三重防护，防止 CJK 误触发送）
 * 8. Mention/Slash 键盘导航（ArrowUp/Down/Tab/Enter）
 * 9. 附件错误通知（inline toast）
 */
import {
  createSignal,
  createEffect,
  createMemo,
  Show,
  For,
  onMount,
  onCleanup,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import {
  Send,
  Square,
  Paperclip,
  Zap,
  Brain,
  Wrench,
  BookOpen,
  ChevronDown,
  AtSign,
  Command,
  X,
  File as FileIcon,
} from 'lucide-solid';
import type { AutopilotAgent } from '../../services/autopilot-executor';
import type { ComposerAttachment } from '../../../types';
import { themeColors, chartColors } from '../../utils/colors';
import { modelOptions } from '../../mock/settings';

// ─── 附件常量（对齐 OpenWork Composer）──────────────────────────────────────────

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const IMAGE_COMPRESS_MAX_PX = 2048;
const IMAGE_COMPRESS_QUALITY = 0.82;
const IMAGE_COMPRESS_TARGET_BYTES = 1_500_000;
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const ACCEPTED_FILE_TYPES = [...ACCEPTED_IMAGE_TYPES, 'application/pdf'];
const isImageMime = (mime: string) => ACCEPTED_IMAGE_TYPES.includes(mime);
const isSupportedAttachmentType = (mime: string) => ACCEPTED_FILE_TYPES.includes(mime);

const estimateInlineAttachmentBytes = (file: Blob) => {
  const mimeType = file.type || 'application/octet-stream';
  const prefixBytes = `data:${mimeType};base64,`.length;
  const base64Bytes = Math.ceil(file.size / 3) * 4;
  return prefixBytes + base64Bytes + 512;
};

const compressImageFile = async (file: File): Promise<File> => {
  if (file.type === 'image/gif' || file.size <= IMAGE_COMPRESS_TARGET_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const maxDim = Math.max(width, height);
  const scale = maxDim > IMAGE_COMPRESS_MAX_PX ? IMAGE_COMPRESS_MAX_PX / maxDim : 1;
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);
  let blob: Blob | null = null;
  if (typeof OffscreenCanvas !== 'undefined') {
    const offscreen = new OffscreenCanvas(targetW, targetH);
    const ctx = offscreen.getContext('2d');
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0, targetW, targetH);
      blob = await offscreen.convertToBlob({ type: 'image/jpeg', quality: IMAGE_COMPRESS_QUALITY });
    }
  }
  if (!blob) {
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', IMAGE_COMPRESS_QUALITY),
    );
  }
  bitmap.close();
  if (!blob || blob.size >= file.size) return file;
  const ext = file.name.replace(/\.[^.]+$/, '');
  return new File([blob], `${ext || 'image'}.jpg`, { type: 'image/jpeg' });
};

// ─── 类型 ─────────────────────────────────────────────────────────────────────

export interface SlashCommand {
  id: string;
  name: string;         // 命令名（用于 session.command 调用）
  label?: string;       // 显示标签（缺省取 name）
  description?: string;
  source?: 'command' | 'skill' | 'mcp';  // 来源标识
}

export interface CapabilityBadge {
  type: 'mcp' | 'skill' | 'knowledge' | 'command';
  count: number;
  label: string;
}

export interface EnhancedComposerProps {
  /** 当前输入值 */
  value: string;
  onChange: (v: string) => void;
  /** 是否处于运行中（禁用发送） */
  isRunning: boolean;
  /** 是否有活跃 session（已经在对话中） */
  hasSession: boolean;
  /** 可用 Agent 列表（用于 @mention） */
  agents: AutopilotAgent[];
  /** 已配置的模型列表 */
  configuredModels: Array<{ modelID: string; label: string; providerID: string }>;
  /** 当前选中的模型 ID */
  selectedModelId: string;
  onModelChange: (id: string) => void;
  /** 发送 / 启动（携带附件列表，对齐 OpenWork onSend(draft) 模式） */
  onSubmit: (attachments?: ComposerAttachment[]) => void;
  /** 停止当前执行 */
  onStop?: () => void;
  /** 重置对话 */
  onReset?: () => void;
  /** 当前模式：chat（普通对话）| dispatch（团队调度） */
  mode: 'chat' | 'dispatch';
  onModeChange: (mode: 'chat' | 'dispatch') => void;
  /** 能力概览徽标 */
  capabilities?: CapabilityBadge[];
  /** 异步获取可用命令列表（每次 "/" 弹窗打开时调用） */
  listCommands?: () => Promise<SlashCommand[]>;
  /** 命令选中回调 -- 通知父组件执行命令 */
  onCommandSelect?: (cmd: SlashCommand, args: string) => void;
  /** 知识健康度分数（0-100） */
  knowledgeScore?: number | null;
  /** 占位提示 */
  placeholder?: string;
}

// ─── 斜杠命令面板 ──────────────────────────────────────────────────────────────

const SlashCommandPanel = (props: {
  commands: SlashCommand[];
  query: string;
  anchorRect: DOMRect | null;
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
  loading?: boolean;
  activeIndex?: number;
  onHover?: (index: number) => void;
}) => {
  const filtered = () => {
    const q = props.query.toLowerCase();
    if (!q) return props.commands;
    return props.commands.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.label ?? '').toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q),
    );
  };

  const sourceLabel = (s?: string) => {
    if (s === 'skill') return { text: 'Skill', color: '#4f46e5' };
    if (s === 'mcp') return { text: 'MCP', color: '#7c3aed' };
    return { text: 'CMD', color: '#2563eb' };
  };

  return (
    <Show when={props.anchorRect && (props.loading || filtered().length > 0)}>
      <Portal>
        <div
          style={{
            position: 'fixed',
            left: `${props.anchorRect!.left}px`,
            bottom: `${window.innerHeight - props.anchorRect!.top + 6}px`,
            width: `${Math.min(props.anchorRect!.width, 360)}px`,
            'z-index': '500',
            background: themeColors.surface,
            border: `1px solid ${themeColors.border}`,
            'border-radius': '10px',
            'box-shadow': '0 8px 32px rgba(0,0,0,0.16)',
            overflow: 'hidden',
            'max-height': '320px',
            'overflow-y': 'auto',
          }}
        >
          <div style={{
            padding: '6px 10px 4px',
            'font-size': '10px',
            'font-weight': '600',
            color: themeColors.textMuted,
            'letter-spacing': '0.5px',
            'text-transform': 'uppercase',
            'border-bottom': `1px solid ${themeColors.border}`,
          }}>
            Skills & 命令
          </div>
          <Show when={props.loading}>
            <div style={{ padding: '12px', 'text-align': 'center', 'font-size': '12px', color: themeColors.textMuted }}>
              加载中...
            </div>
          </Show>
          <Show when={!props.loading}>
            <For each={filtered()}>
              {(cmd, index) => {
                const badge = sourceLabel(cmd.source);
                const isActive = () => props.activeIndex === index();
                return (
                  <button
                    onClick={() => props.onSelect(cmd)}
                    style={{
                      display: 'flex',
                      'align-items': 'center',
                      gap: '10px',
                      width: '100%',
                      padding: '8px 12px',
                      background: isActive() ? themeColors.bgSubtle : 'none',
                      border: 'none',
                      cursor: 'pointer',
                      'text-align': 'left',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={() => props.onHover?.(index())}
                    onMouseLeave={(e) => { if (!isActive()) (e.currentTarget as HTMLElement).style.background = 'none'; }}
                  >
                    <div style={{
                      'font-size': '9px', 'font-weight': '600',
                      padding: '1px 5px', 'border-radius': '3px',
                      color: badge.color, background: badge.color + '18',
                      'flex-shrink': '0', 'text-transform': 'uppercase',
                    }}>
                      {badge.text}
                    </div>
                    <div style={{ flex: '1', 'min-width': '0' }}>
                      <div style={{ 'font-size': '13px', 'font-weight': '500', color: themeColors.text }}>
                        /{cmd.name}
                      </div>
                      <Show when={cmd.description}>
                        <div style={{ 'font-size': '11px', color: themeColors.textMuted, 'margin-top': '1px' }}>
                          {cmd.description}
                        </div>
                      </Show>
                    </div>
                  </button>
                );
              }}
            </For>
          </Show>
        </div>
      </Portal>
    </Show>
  );
};

// ─── @Mention 面板 ─────────────────────────────────────────────────────────────

const MentionPanel = (props: {
  agents: AutopilotAgent[];
  query: string;
  anchorRect: DOMRect | null;
  onSelect: (agent: AutopilotAgent) => void;
  activeIndex?: number;
  onHover?: (index: number) => void;
}) => {
  const filtered = () => {
    const q = props.query.toLowerCase();
    return props.agents.filter(
      (a) => a.id.toLowerCase().includes(q) || a.name.toLowerCase().includes(q),
    );
  };

  return (
    <Show when={props.anchorRect && filtered().length > 0}>
      <Portal>
        <div
          style={{
            position: 'fixed',
            left: `${props.anchorRect!.left}px`,
            bottom: `${window.innerHeight - props.anchorRect!.top + 6}px`,
            width: `${Math.min(props.anchorRect!.width, 280)}px`,
            'z-index': '500',
            background: themeColors.surface,
            border: `1px solid ${themeColors.border}`,
            'border-radius': '10px',
            'box-shadow': '0 8px 32px rgba(0,0,0,0.16)',
            overflow: 'hidden',
          }}
        >
          <div style={{
            padding: '6px 10px 4px',
            'font-size': '10px',
            'font-weight': '600',
            color: themeColors.textMuted,
            'letter-spacing': '0.5px',
            'text-transform': 'uppercase',
            'border-bottom': `1px solid ${themeColors.border}`,
          }}>
            选择 Agent
          </div>
          <For each={filtered()}>
            {(agent, index) => {
              const isActive = () => props.activeIndex === index();
              return (
                <button
                  onClick={() => props.onSelect(agent)}
                  style={{
                    display: 'flex',
                    'align-items': 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '8px 12px',
                    background: isActive() ? themeColors.bgSubtle : 'none',
                    border: 'none',
                    cursor: 'pointer',
                    'text-align': 'left',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={() => props.onHover?.(index())}
                  onMouseLeave={(e) => { if (!isActive()) (e.currentTarget as HTMLElement).style.background = 'none'; }}
                >
                  <div style={{
                    width: '28px', height: '28px', 'border-radius': '8px',
                    background: agent.bgColor, display: 'flex',
                    'align-items': 'center', 'justify-content': 'center', 'font-size': '14px', 'flex-shrink': '0',
                  }}>
                    {agent.emoji}
                  </div>
                  <div>
                    <div style={{ 'font-size': '13px', 'font-weight': '500', color: themeColors.text }}>{agent.name}</div>
                    <div style={{ 'font-size': '11px', color: themeColors.textMuted }}>{agent.description.slice(0, 32)}…</div>
                  </div>
                </button>
              );
            }}
          </For>
        </div>
      </Portal>
    </Show>
  );
};

// ─── 能力徽标 ──────────────────────────────────────────────────────────────────

const CapabilityChip = (props: { badge: CapabilityBadge }) => {
  const iconMap: Record<string, any> = {
    mcp: Wrench,
    skill: Brain,
    knowledge: BookOpen,
    command: Command,
  };
  const colorMap: Record<string, string> = {
    mcp: chartColors.primary,
    skill: '#722ed1',
    knowledge: '#08979c',
    command: '#d46b08',
  };
  const Icon = iconMap[props.badge.type] ?? Zap;
  const color = colorMap[props.badge.type] ?? themeColors.textMuted;

  return (
    <div
      title={`${props.badge.count} 个${props.badge.label}已接入`}
      style={{
        display: 'inline-flex',
        'align-items': 'center',
        gap: '3px',
        padding: '2px 7px',
        'border-radius': '9999px',
        'font-size': '11px',
        'font-weight': '500',
        color,
        background: color + '15',
        border: `1px solid ${color}30`,
        cursor: 'default',
        'flex-shrink': '0',
      }}
    >
      <Icon size={10} />
      <span>{props.badge.count}</span>
    </div>
  );
};

// ─── 模式切换按钮 ──────────────────────────────────────────────────────────────

const ModeToggle = (props: {
  mode: 'chat' | 'dispatch';
  onChange: (m: 'chat' | 'dispatch') => void;
}) => (
  <div style={{
    display: 'inline-flex',
    border: `1px solid ${themeColors.border}`,
    'border-radius': '7px',
    overflow: 'hidden',
    'flex-shrink': '0',
  }}>
    {(['chat', 'dispatch'] as const).map((m) => (
      <button
        onClick={() => props.onChange(m)}
        style={{
          padding: '3px 10px',
          'font-size': '11px',
          'font-weight': props.mode === m ? '600' : '400',
          border: 'none',
          cursor: 'pointer',
          background: props.mode === m ? chartColors.success : 'transparent',
          color: props.mode === m ? 'white' : themeColors.textMuted,
          transition: 'all 0.15s',
        }}
      >
        {m === 'chat' ? '💬 对话' : '🚀 团队'}
      </button>
    ))}
  </div>
);

// ─── 主组件 ───────────────────────────────────────────────────────────────────

export default function EnhancedComposer(props: EnhancedComposerProps) {
  let textareaRef: HTMLTextAreaElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  let fileInputRef: HTMLInputElement | undefined;
  let imeComposing = false;

  const [anchorRect, setAnchorRect] = createSignal<DOMRect | null>(null);
  const [mentionQuery, setMentionQuery] = createSignal('');
  const [slashQuery, setSlashQuery] = createSignal('');
  const [showMention, setShowMention] = createSignal(false);
  const [showSlash, setShowSlash] = createSignal(false);
  const [isFocused, setIsFocused] = createSignal(false);

  // 键盘导航索引
  const [mentionIdx, setMentionIdx] = createSignal(0);
  const [slashIdx, setSlashIdx] = createSignal(0);

  // 动态加载斜杠命令列表
  const [slashCmds, setSlashCmds] = createSignal<SlashCommand[]>([]);
  const [slashLoading, setSlashLoading] = createSignal(false);

  // ─── 附件状态（对齐 OpenWork Composer 内部管理模式）──────────────────────
  const objectUrls = new Set<string>();
  const createObjectUrl = (blob: Blob) => { const u = URL.createObjectURL(blob); objectUrls.add(u); return u; };
  const releaseObjectUrl = (url?: string) => { if (url && objectUrls.has(url)) { URL.revokeObjectURL(url); objectUrls.delete(url); } };
  const [attachments, setAttachments] = createSignal<ComposerAttachment[]>([]);

  onCleanup(() => { for (const u of objectUrls) URL.revokeObjectURL(u); objectUrls.clear(); });

  const clearSentAttachments = () => {
    for (const att of attachments()) releaseObjectUrl(att.previewUrl);
    setAttachments([]);
  };

  const removeAttachment = (id: string) => {
    setAttachments(cur => {
      const target = cur.find(a => a.id === id);
      releaseObjectUrl(target?.previewUrl);
      return cur.filter(a => a.id !== id);
    });
  };

  // ─── 附件错误通知（对齐 OpenWork ComposerNotice）─────────────────────────
  const [notice, setNotice] = createSignal<{ title: string; tone: 'warning' | 'error' | 'info' } | null>(null);
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;

  const showNotice = (title: string, tone: 'warning' | 'error' | 'info' = 'warning') => {
    clearTimeout(noticeTimer);
    setNotice({ title, tone });
    noticeTimer = setTimeout(() => setNotice(null), 4000);
  };

  const addAttachments = async (files: File[]) => {
    const supported = files.filter(f => isSupportedAttachmentType(f.type));
    const unsupported = files.filter(f => f.type && !isSupportedAttachmentType(f.type));
    if (unsupported.length) {
      showNotice('不支持的文件类型，仅支持图片和 PDF', 'info');
    }
    if (!supported.length) return;
    const next: ComposerAttachment[] = [];
    for (const file of supported) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        showNotice(`文件超过 8MB 限制: ${file.name}`, 'warning');
        continue;
      }
      try {
        const processed = isImageMime(file.type) ? await compressImageFile(file) : file;
        if (estimateInlineAttachmentBytes(processed) > MAX_ATTACHMENT_BYTES) {
          showNotice(`压缩后仍超过限制: ${file.name}`, 'warning');
          continue;
        }
        next.push({
          id: `${processed.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
          name: processed.name,
          mimeType: processed.type || 'application/octet-stream',
          size: processed.size,
          kind: isImageMime(processed.type) ? 'image' : 'file',
          file: processed,
          previewUrl: isImageMime(processed.type) ? createObjectUrl(processed) : undefined,
        });
      } catch (error) {
        showNotice(error instanceof Error ? error.message : '文件读取失败', 'error');
      }
    }
    if (next.length) setAttachments(cur => [...cur, ...next]);
  };

  // ─── 粘贴和拖拽处理（对齐 OpenWork handlePaste / handleDrop）────────────
  const handlePaste = (e: ClipboardEvent) => {
    if (!e.clipboardData) return;
    const clipboard = e.clipboardData;
    const fileItems = Array.from(clipboard.items || []).filter(i => i.kind === 'file');
    const files = Array.from(clipboard.files || []);
    const itemFiles = fileItems.map(i => i.getAsFile()).filter((f): f is File => !!f);
    const allFiles = files.length ? files : itemFiles;
    if (allFiles.length) {
      e.preventDefault();
      const supported = allFiles.filter(f => isSupportedAttachmentType(f.type));
      if (supported.length) void addAttachments(supported);
      else if (allFiles.length) showNotice('不支持的文件类型，仅支持图片和 PDF', 'info');
      return;
    }
    // 无文件时不拦截，让原有文本粘贴逻辑正常工作
  };

  const handleDrop = (e: DragEvent) => {
    if (!e.dataTransfer) return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) void addAttachments(files);
  };

  // ─── 过滤列表（供键盘导航用）──────────────────────────────────
  const filteredAgents = createMemo(() => {
    const q = mentionQuery().toLowerCase();
    return props.agents.filter(a => a.id.toLowerCase().includes(q) || a.name.toLowerCase().includes(q));
  });

  const filteredSlashCmds = createMemo(() => {
    const q = slashQuery().toLowerCase();
    if (!q) return slashCmds();
    return slashCmds().filter(
      c => c.name.toLowerCase().includes(q) || (c.label ?? '').toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q),
    );
  });

  // 重置导航索引
  createEffect(() => { mentionQuery(); setMentionIdx(0); });
  createEffect(() => { slashQuery(); setSlashIdx(0); });

  createEffect(() => {
    if (!showSlash()) return;
    if (!props.listCommands) return;
    setSlashLoading(true);
    props.listCommands()
      .then(cmds => setSlashCmds(cmds))
      .catch(() => setSlashCmds([]))
      .finally(() => setSlashLoading(false));
  });

  // 自动高度调整
  const autoResize = () => {
    const el = textareaRef;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = 200;
    el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
  };

  createEffect(() => {
    props.value; // track
    autoResize();
  });

  onMount(() => { autoResize(); });

  // 更新弹出面板的锚点位置
  const updateAnchor = () => {
    if (containerRef) {
      setAnchorRect(containerRef.getBoundingClientRect());
    }
  };

  const handleInput = (e: Event) => {
    const val = (e.currentTarget as HTMLTextAreaElement).value;
    props.onChange(val);

    const lastAt = val.lastIndexOf('@');
    const lastSlash = val.lastIndexOf('/');
    const cursor = (e.currentTarget as HTMLTextAreaElement).selectionStart ?? val.length;

    // @mention 检测
    if (lastAt >= 0 && lastAt < cursor) {
      const after = val.slice(lastAt + 1, cursor);
      if (!after.includes(' ') && !after.includes('\n')) {
        setMentionQuery(after);
        updateAnchor();
        setShowMention(true);
        setShowSlash(false);
        return;
      }
    }

    // /slash 检测（仅行首）
    const lineStart = val.lastIndexOf('\n', cursor - 1) + 1;
    if (lastSlash >= lineStart && lastSlash < cursor) {
      const after = val.slice(lastSlash + 1, cursor);
      if (!after.includes(' ') && !after.includes('\n')) {
        setSlashQuery(after);
        updateAnchor();
        setShowSlash(true);
        setShowMention(false);
        return;
      }
    }

    setShowMention(false);
    setShowSlash(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // ── Mention/Slash 面板键盘导航（对齐 OpenWork）──
    if (showMention() || showSlash()) {
      const isM = showMention();
      const list = isM ? filteredAgents() : filteredSlashCmds();
      const idx = isM ? mentionIdx() : slashIdx();
      const setIdx = isM ? setMentionIdx : setSlashIdx;

      if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
        e.preventDefault();
        setIdx(Math.min(idx + 1, list.length - 1));
        return;
      }
      if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
        e.preventDefault();
        setIdx(Math.max(idx - 1, 0));
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        if (list[idx]) {
          isM ? selectAgent(list[idx] as AutopilotAgent) : selectSlashCommand(list[idx] as SlashCommand);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMention(false);
        setShowSlash(false);
        return;
      }
    }
    // ── Enter 发送（带 IME 保护，对齐 OpenWork 三重防护）──
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.isComposing || imeComposing || e.keyCode === 229) return;
      e.preventDefault();
      if (canSend()) {
        props.onSubmit(attachments().length > 0 ? [...attachments()] : undefined);
        clearSentAttachments();
      }
    }
  };

  const selectAgent = (agent: AutopilotAgent) => {
    const val = props.value;
    const lastAt = val.lastIndexOf('@');
    const newVal = lastAt >= 0 ? val.slice(0, lastAt) + `@${agent.id} ` : val;
    props.onChange(newVal);
    setShowMention(false);
    textareaRef?.focus();
  };

  const selectSlashCommand = (cmd: SlashCommand) => {
    const val = props.value;
    const lastSlash = val.lastIndexOf('/');
    const beforeSlash = lastSlash >= 0 ? val.slice(0, lastSlash).trim() : '';
    // 将命令名注入输入框，让用户看到选中了什么
    props.onChange(`/${cmd.name} `);
    setShowSlash(false);
    textareaRef?.focus();
    // 通知父组件：用户选中了一个命令，后续提交时走 command 执行路径
    props.onCommandSelect?.(cmd, beforeSlash);
  };

  const placeholder = () => props.placeholder ?? (
    props.mode === 'dispatch'
      ? '描述你的目标，AI 虚拟团队并行执行... (Enter 发送，Shift+Enter 换行)'
      : '问我任何问题，或输入 @ 召唤 Agent... (Enter 发送，Shift+Enter 换行)'
  );

  const canSend = () => !props.isRunning && (props.value.trim().length > 0 || attachments().length > 0);

  // 知识库分数颜色
  const scoreColor = () => {
    const s = props.knowledgeScore;
    if (s === null || s === undefined) return themeColors.textMuted;
    if (s >= 80) return chartColors.success;
    if (s >= 50) return '#fa8c16';
    return chartColors.error;
  };

  return (
    <div
      ref={containerRef}
      onDrop={handleDrop}
      onDragOver={(e: DragEvent) => e.preventDefault()}
      style={{
        border: `1.5px solid ${isFocused() ? chartColors.success + 'aa' : themeColors.border}`,
        'border-radius': '12px',
        background: themeColors.surface,
        transition: 'border-color 0.2s, box-shadow 0.2s',
        'box-shadow': isFocused() ? `0 0 0 3px ${chartColors.success}18` : 'none',
        overflow: 'hidden',
      }}
    >
      {/* ── 顶部能力条 ── */}
      <Show when={(props.capabilities && props.capabilities.length > 0) || props.knowledgeScore !== null}>
        <div style={{
          display: 'flex',
          'align-items': 'center',
          gap: '6px',
          padding: '6px 12px 0',
          'flex-wrap': 'wrap',
        }}>
          {/* 知识健康度 */}
          <Show when={props.knowledgeScore !== null && props.knowledgeScore !== undefined}>
            <div style={{
              display: 'inline-flex',
              'align-items': 'center',
              gap: '3px',
              'font-size': '10px',
              'font-weight': '600',
              color: scoreColor(),
            }}>
              🧠 知识库 {props.knowledgeScore}分
            </div>
          </Show>

          <For each={props.capabilities ?? []}>
            {(badge) => <CapabilityChip badge={badge} />}
          </For>
        </div>
      </Show>

      {/* ── 附件错误通知 ── */}
      <Show when={notice()}>
        <div style={{
          padding: '6px 14px', 'font-size': '12px',
          color: notice()!.tone === 'error' ? '#ff4d4f' : notice()!.tone === 'warning' ? '#fa8c16' : themeColors.textMuted,
          display: 'flex', 'align-items': 'center', gap: '6px',
        }}>
          <span>{notice()!.title}</span>
          <button onClick={() => setNotice(null)} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', padding: '2px',
          }}><X size={10} /></button>
        </div>
      </Show>

      {/* ── 附件预览区 ── */}
      <Show when={attachments().length > 0}>
        <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '8px', padding: '8px 14px 0' }}>
          <For each={attachments()}>
            {(att) => (
              <div style={{
                display: 'flex', 'align-items': 'center', gap: '8px',
                padding: '6px 10px', 'border-radius': '12px',
                border: `1px solid ${themeColors.border}`, background: themeColors.bgSubtle,
                'font-size': '12px',
              }}>
                <Show when={att.kind === 'image'} fallback={<FileIcon size={14} />}>
                  <img src={att.previewUrl!} alt={att.name}
                    style={{ width: '32px', height: '32px', 'border-radius': '6px', 'object-fit': 'cover' }} />
                </Show>
                <span style={{ 'max-width': '120px', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
                  {att.name}
                </span>
                <button onClick={() => removeAttachment(att.id)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
                  color: themeColors.textMuted, display: 'flex',
                }}><X size={12} /></button>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* ── 文本输入区 ── */}
      <textarea
        ref={textareaRef}
        value={props.value}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCompositionStart={() => { imeComposing = true; }}
        onCompositionEnd={() => { imeComposing = false; }}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        disabled={props.isRunning}
        placeholder={placeholder()}
        rows={2}
        style={{
          display: 'block',
          width: '100%',
          'min-height': '64px',
          'max-height': '200px',
          'font-size': '14px',
          'line-height': '1.6',
          padding: '10px 14px 0',
          border: 'none',
          outline: 'none',
          resize: 'none',
          background: 'transparent',
          color: themeColors.text,
          'font-family': 'inherit',
          'box-sizing': 'border-box',
        }}
      />

      {/* ── 底部工具栏 ── */}
      <div style={{
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
        padding: '6px 10px 8px',
        gap: '8px',
      }}>
        {/* 左侧工具 */}
        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
          {/* 模式切换 */}
          <ModeToggle mode={props.mode} onChange={props.onModeChange} />

          {/* @mention 提示按钮 */}
          <button
            title="@mention Agent"
            onClick={() => {
              const cur = props.value;
              props.onChange(cur + '@');
              textareaRef?.focus();
              updateAnchor();
              setShowMention(true);
            }}
            style={{
              display: 'flex', 'align-items': 'center', 'justify-content': 'center',
              width: '26px', height: '26px', 'border-radius': '6px',
              border: `1px solid ${themeColors.border}`,
              background: 'transparent', cursor: 'pointer', color: themeColors.textMuted,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = themeColors.bgSubtle; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <AtSign size={12} />
          </button>

          {/* 附件按钮 + 隐藏 file input（对齐 OpenWork Composer） */}
          <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
            accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
            onChange={(e) => {
              const files = Array.from((e.currentTarget as HTMLInputElement).files ?? []);
              if (files.length) void addAttachments(files);
              (e.currentTarget as HTMLInputElement).value = '';
            }}
          />
          <button
            title="添加附件"
            onClick={() => fileInputRef?.click()}
            style={{
              display: 'flex', 'align-items': 'center', 'justify-content': 'center',
              width: '26px', height: '26px', 'border-radius': '6px',
              border: `1px solid ${themeColors.border}`,
              background: 'transparent', cursor: 'pointer', color: themeColors.textMuted,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = themeColors.bgSubtle; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <Paperclip size={12} />
          </button>

          {/* 模型选择器 */}
          <Show
            when={props.configuredModels.length > 0}
            fallback={
              <span style={{ 'font-size': '11px', color: themeColors.textMuted }}>未配置模型</span>
            }
          >
            <div style={{ position: 'relative', display: 'inline-flex', 'align-items': 'center' }}>
              <select
                value={props.selectedModelId}
                onChange={(e) => props.onModelChange(e.currentTarget.value)}
                disabled={props.isRunning}
                style={{
                  'font-size': '11px',
                  'font-weight': '500',
                  padding: '3px 20px 3px 8px',
                  'border-radius': '6px',
                  border: `1px solid ${themeColors.border}`,
                  background: themeColors.bgSubtle,
                  color: themeColors.text,
                  cursor: props.isRunning ? 'not-allowed' : 'pointer',
                  outline: 'none',
                  appearance: 'none',
                }}
              >
                <For each={props.configuredModels}>
                  {(opt) => <option value={opt.modelID}>{opt.label}</option>}
                </For>
              </select>
              <ChevronDown
                size={10}
                style={{
                  position: 'absolute', right: '5px',
                  'pointer-events': 'none', color: themeColors.textMuted,
                }}
              />
            </div>
          </Show>
        </div>

        {/* 右侧按钮 */}
        <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
          {/* 重置按钮（有 session 时才显示） */}
          <Show when={props.hasSession && props.onReset}>
            <button
              onClick={props.onReset}
              disabled={props.isRunning}
              title="重置对话"
              style={{
                padding: '4px 10px',
                'font-size': '11px',
                'border-radius': '6px',
                border: `1px solid ${themeColors.border}`,
                background: 'transparent',
                color: themeColors.textMuted,
                cursor: props.isRunning ? 'not-allowed' : 'pointer',
                opacity: props.isRunning ? 0.5 : 1,
              }}
            >
              重置
            </button>
          </Show>

          {/* 停止 / 发送 */}
          <Show
            when={!props.isRunning}
            fallback={
              <button
                onClick={props.onStop}
                title="停止执行"
                style={{
                  display: 'flex', 'align-items': 'center', gap: '5px',
                  padding: '5px 12px', 'border-radius': '7px', border: 'none',
                  background: '#ff4d4f', color: 'white', cursor: 'pointer',
                  'font-size': '12px', 'font-weight': '600',
                  animation: 'composerPulse 1.5s ease-in-out infinite',
                }}
              >
                <Square size={12} />
                停止
              </button>
            }
          >
            <button
              onClick={() => {
                if (canSend()) {
                  props.onSubmit(attachments().length > 0 ? [...attachments()] : undefined);
                  clearSentAttachments();
                }
              }}
              disabled={!canSend()}
              title="发送 (Enter)"
              style={{
                display: 'flex', 'align-items': 'center', gap: '5px',
                padding: '5px 14px', 'border-radius': '7px', border: 'none',
                background: canSend() ? chartColors.success : themeColors.border,
                color: canSend() ? 'white' : themeColors.textMuted,
                cursor: canSend() ? 'pointer' : 'not-allowed',
                'font-size': '12px', 'font-weight': '600',
                transition: 'background 0.2s',
              }}
            >
              <Send size={12} />
              {props.hasSession ? '发送' : (props.mode === 'dispatch' ? '启动团队' : '发送')}
            </button>
          </Show>
        </div>
      </div>

      {/* ── 弹出面板 ── */}
      <MentionPanel
        agents={props.agents}
        query={mentionQuery()}
        anchorRect={showMention() ? anchorRect() : null}
        onSelect={selectAgent}
        activeIndex={mentionIdx()}
        onHover={setMentionIdx}
      />

      <SlashCommandPanel
        commands={slashCmds()}
        query={slashQuery()}
        anchorRect={showSlash() ? anchorRect() : null}
        onSelect={selectSlashCommand}
        onClose={() => setShowSlash(false)}
        loading={slashLoading()}
        activeIndex={slashIdx()}
        onHover={setSlashIdx}
      />

      <style>{`
        @keyframes composerPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.75; }
        }
      `}</style>
    </div>
  );
}
