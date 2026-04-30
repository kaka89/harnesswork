/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, X, ChevronRight, Bold, Italic, Code, List, Heading1, Heading2, Heading3 } from "lucide-react";
import type { OpenworkSkillItem } from "../../../../app/lib/openwork-server";
import type { XingjingAgentMeta, XingjingAgentOptions } from "../types";
import { displayNameToSlug } from "../hooks/use-agents";
import { SkillSelectorPanel } from "./skill-selector-panel";

// ── 类型 ─────────────────────────────────────────────────────────────────────

export interface AgentEditorModalProps {
  /** null = 新建；非 null = 编辑已有 Agent */
  initialAgent?: XingjingAgentMeta | null;
  /** 已存在的 slug 列表，用于唯一性校验（新建时使用） */
  existingSlugs?: string[];
  /** 可用的 Skill 列表 */
  availableSkills: OpenworkSkillItem[];
  /** 可用的模型列表（来自 provider configs） */
  availableModels?: string[];
  /** 保存时调用，返回值被忽略 */
  onSave: (meta: XingjingAgentMeta) => Promise<void>;
  /** 关闭弹窗 */
  onClose: () => void;
  /** 是否正在保存 */
  saving?: boolean;
}

// ── 常量 ─────────────────────────────────────────────────────────────────────

const DEFAULT_MODELS = [
  "claude-sonnet-4-5",
  "claude-opus-4-5",
  "claude-haiku-4-5",
  "gpt-4o",
  "gpt-4o-mini",
  "o3",
  "gemini-2.5-pro",
];

const DEFAULT_ICON = "🤖";

// ── 必填提示 ─────────────────────────────────────────────────────────────────

function RequiredBadge() {
  return <span className="ml-1 text-[10px] font-normal text-red-9">*</span>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-[11px] text-red-9">{message}</p>;
}

// ── Emoji Picker（精简版） ────────────────────────────────────────────────────

const COMMON_EMOJIS = [
  "🤖", "🧠", "🎯", "🛸", "⚡", "🔥", "💡", "🌟", "🎪", "🦾",
  "🔬", "📊", "🎨", "🚀", "🌈", "🧩", "💎", "🎭", "🦅", "🌊",
  "📝", "🔧", "🎯", "💼", "🌱", "🦁", "🐉", "🌙", "☀️", "🎵",
];

function EmojiPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-dls-border bg-dls-hover/40 text-2xl hover:bg-dls-hover"
      >
        {value || DEFAULT_ICON}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 grid w-56 grid-cols-6 gap-0.5 rounded-xl border border-dls-border bg-white p-2 shadow-lg">
          {COMMON_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onChange(emoji);
                setOpen(false);
              }}
              className={`flex items-center justify-center rounded-lg p-1.5 text-lg hover:bg-dls-hover ${
                value === emoji ? "bg-green-1 ring-1 ring-green-9/30" : ""
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── System Prompt 编辑器（第二步） ────────────────────────────────────────────

function SystemPromptEditor({
  displayName,
  value,
  onChange,
  onDone,
}: {
  displayName: string;
  value: string;
  onChange: (v: string) => void;
  onDone: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自动聚焦
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // 工具栏按钮操作
  const insertMarkdown = (prefix: string, suffix: string = "") => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.slice(start, end);
    const replacement = `${prefix}${selected || "文本"}${suffix}`;
    const newVal = ta.value.slice(0, start) + replacement + ta.value.slice(end);
    onChange(newVal);
    // 恢复光标
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length + (selected || "文本").length);
    });
  };

  const insertLinePrefix = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const lineStart = before.lastIndexOf("\n") + 1;
    const newVal = ta.value.slice(0, lineStart) + prefix + ta.value.slice(lineStart);
    onChange(newVal);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(pos + prefix.length, pos + prefix.length);
    });
  };

  // ESC 键返回
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDone]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="flex h-[90vh] w-[80vw] flex-col overflow-hidden rounded-2xl border border-dls-border bg-white shadow-2xl">
        {/* 头部 */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-dls-border px-5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDone}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
            >
              <ArrowLeft size={13} />
              返回
            </button>
            <span className="text-[13px] font-medium text-dls-text">
              {displayName ? `「${displayName}」的 System Prompt` : "编辑 System Prompt"}
            </span>
          </div>
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg bg-green-9 px-4 py-1.5 text-[12px] font-medium text-white hover:bg-green-10"
          >
            完成
          </button>
        </div>

        {/* Markdown 工具栏 */}
        <div className="flex shrink-0 items-center gap-0.5 border-b border-dls-border bg-dls-hover/30 px-3 py-1.5">
          {[
            { icon: Heading1, label: "H1", action: () => insertLinePrefix("# ") },
            { icon: Heading2, label: "H2", action: () => insertLinePrefix("## ") },
            { icon: Heading3, label: "H3", action: () => insertLinePrefix("### ") },
          ].map(({ icon: Icon, label, action }) => (
            <button
              key={label}
              type="button"
              onClick={action}
              title={label}
              className="rounded px-2 py-1 text-[12px] font-medium text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
            >
              {label}
            </button>
          ))}

          <span className="mx-1 h-4 w-px bg-dls-border" />

          {[
            { icon: Bold, label: "加粗", action: () => insertMarkdown("**", "**") },
            { icon: Italic, label: "斜体", action: () => insertMarkdown("_", "_") },
            { icon: Code, label: "行内代码", action: () => insertMarkdown("`", "`") },
          ].map(({ icon: Icon, label, action }) => (
            <button
              key={label}
              type="button"
              onClick={action}
              title={label}
              className="rounded p-1.5 text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
            >
              <Icon size={13} />
            </button>
          ))}

          <span className="mx-1 h-4 w-px bg-dls-border" />

          <button
            type="button"
            onClick={() => insertLinePrefix("- ")}
            title="无序列表"
            className="rounded p-1.5 text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
          >
            <List size={13} />
          </button>

          <button
            type="button"
            onClick={() => insertMarkdown("\n```\n", "\n```\n")}
            title="代码块"
            className="rounded px-2 py-1 text-[11px] font-mono text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
          >
            {"</>"}
          </button>

          <span className="mx-1 h-4 w-px bg-dls-border" />

          <button
            type="button"
            onClick={() => insertLinePrefix("> ")}
            title="引用"
            className="rounded px-2 py-1 text-[12px] text-dls-secondary hover:bg-dls-hover hover:text-dls-text"
          >
            引用
          </button>
        </div>

        {/* 编辑区 */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="用自然语言描述 Agent 的角色、能力范围和工作方式……"
          className="flex-1 resize-none bg-white p-5 font-mono text-[13px] leading-7 text-dls-text outline-none placeholder:text-dls-secondary/50"
        />

        {/* 字数提示 */}
        <div className="shrink-0 border-t border-dls-border px-5 py-1.5 text-right text-[11px] text-dls-secondary/60">
          {value.length} 字符 · 按 ESC 返回
        </div>
      </div>
    </div>
  );
}

// ── AgentEditorModal 主组件 ───────────────────────────────────────────────────

/**
 * 新建/编辑 Agent 弹窗（两步式）。
 *
 * 第一步：基本信息表单（显示名、描述、模型等）
 * 第二步：System Prompt 全屏编辑器（覆盖弹窗）
 * Skill 选择：点击「选择 Skill」按钮打开 SkillSelectorPanel
 */
export function AgentEditorModal({
  initialAgent,
  availableSkills,
  availableModels,
  existingSlugs,
  onSave,
  onClose,
  saving = false,
}: AgentEditorModalProps) {
  const isEdit = Boolean(initialAgent?.name);
  const models = availableModels?.length ? availableModels : DEFAULT_MODELS;

  // ── 表单状态 ──────────────────────────────────────────────────────────────

  const [icon, setIcon] = useState(initialAgent?.options?.icon ?? DEFAULT_ICON);
  const [displayName, setDisplayName] = useState(initialAgent?.options?.displayName ?? "");
  const [slug, setSlug] = useState(initialAgent?.name ?? "");
  const [subtitle, setSubtitle] = useState(initialAgent?.options?.subtitle ?? "");
  const [description, setDescription] = useState(initialAgent?.description ?? "");
  const [model, setModel] = useState(initialAgent?.model ?? "");
  const [mode, setMode] = useState<"primary" | "all">(
    (initialAgent?.mode === "all" ? "all" : "primary"),
  );
  const [steps, setSteps] = useState(
    typeof initialAgent?.steps === "number" ? String(initialAgent.steps) : "",
  );
  const [selectedSkills, setSelectedSkills] = useState<string[]>(
    initialAgent?.options?.skills ?? [],
  );
  const [systemPrompt, setSystemPrompt] = useState(initialAgent?.systemPrompt ?? "");

  // ── UI 状态 ───────────────────────────────────────────────────────────────

  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [showSkillSelector, setShowSkillSelector] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // displayName 变化时自动生成 slug（仅新建时）
  useEffect(() => {
    if (!isEdit) {
      setSlug(displayNameToSlug(displayName));
    }
  }, [displayName, isEdit]);

  // ── 校验 ─────────────────────────────────────────────────────────────────

  const validate = () => {
    const next: Record<string, string> = {};
    if (!displayName.trim()) next.displayName = "请填写显示名";
    if (!description.trim()) next.description = "请填写描述";
    if (!model.trim()) next.model = "请选择模型";
    if (!systemPrompt.trim()) next.systemPrompt = "请编写 System Prompt";
    const currentSlug = slug.trim() || displayNameToSlug(displayName);
    if (!currentSlug || currentSlug === "agent") next.slug = "标识符无效，请修改显示名或手动填写";
    if (!isEdit && existingSlugs?.includes(currentSlug)) next.slug = "此标识符已被其他搭档使用，请修改显示名";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  // ── 保存 ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!validate()) return;

    const options: XingjingAgentOptions & Record<string, unknown> = {
      icon,
      displayName: displayName.trim(),
      subtitle: subtitle.trim() || undefined,
      skills: selectedSkills.length > 0 ? selectedSkills : undefined,
    };

    const meta: XingjingAgentMeta = {
      name: slug.trim() || displayNameToSlug(displayName),
      description: description.trim(),
      model: model.trim(),
      mode,
      steps: steps.trim() ? Number(steps.trim()) : undefined,
      options,
      systemPrompt: systemPrompt.trim(),
    };

    await onSave(meta);
  };

  // ── 已选 Skill 显示名 ────────────────────────────────────────────────────

  const selectedSkillItems = useMemo(
    () => selectedSkills.map((slug) => availableSkills.find((s) => s.name === slug) ?? null),
    [selectedSkills, availableSkills],
  );

  // ── 渲染 ─────────────────────────────────────────────────────────────────

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      {/* System Prompt 全屏编辑器（第二步） */}
      {showPromptEditor && (
        <SystemPromptEditor
          displayName={displayName}
          value={systemPrompt}
          onChange={setSystemPrompt}
          onDone={() => setShowPromptEditor(false)}
        />
      )}

      {/* Skill 选择面板 */}
      {showSkillSelector && (
        <SkillSelectorPanel
          selectedSlugs={selectedSkills}
          availableSkills={availableSkills}
          onConfirm={(slugs) => {
            setSelectedSkills(slugs);
            setShowSkillSelector(false);
          }}
          onCancel={() => setShowSkillSelector(false)}
        />
      )}

      {/* 主弹窗（第一步：基本信息表单） */}
      <div className="flex h-[90vh] w-[80vw] flex-col overflow-hidden rounded-2xl border border-dls-border bg-white shadow-2xl">
        {/* 头部 */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-dls-border px-5">
          <h2 className="text-[14px] font-semibold text-dls-text">
            {isEdit ? "编辑 AI 搭档" : "新建 AI 搭档"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-dls-secondary hover:bg-dls-hover"
          >
            <X size={15} />
          </button>
        </div>

        {/* 表单 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">

            {/* 图标 + 显示名（同行） */}
            <div className="flex items-start gap-3">
              <div className="shrink-0 pt-5">
                <EmojiPicker value={icon} onChange={setIcon} />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[12px] font-medium text-dls-text">
                  显示名 <RequiredBadge />
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="如「AI产品搭档」"
                  className={`w-full rounded-lg border px-3 py-2 text-[13px] text-dls-text outline-none focus:border-green-9 ${
                    errors.displayName ? "border-red-7" : "border-dls-border"
                  }`}
                />
                <FieldError message={errors.displayName} />
              </div>
            </div>

            {/* slug（只读，自动生成） */}
            <div>
              <label className="mb-1 block text-[12px] font-medium text-dls-text">
                标识（slug）
                <span className="ml-1 text-[10px] font-normal text-dls-secondary">
                  {isEdit ? "创建后不可修改" : "由显示名自动生成"}
                </span>
              </label>
              <input
                type="text"
                value={slug}
                readOnly={isEdit}
                onChange={(e) => !isEdit && setSlug(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 font-mono text-[12px] outline-none ${
                  isEdit
                    ? "cursor-not-allowed border-dls-border bg-dls-hover/40 text-dls-secondary"
                    : "border-dls-border text-dls-text focus:border-green-9"
                }`}
              />
              <FieldError message={errors.slug} />
            </div>

            {/* 副标题 */}
            <div>
              <label className="mb-1 block text-[12px] font-medium text-dls-text">
                副标题
              </label>
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="如「产品搭档」"
                className="w-full rounded-lg border border-dls-border px-3 py-2 text-[13px] text-dls-text outline-none focus:border-green-9"
              />
            </div>

            {/* 描述（必填） */}
            <div>
              <label className="mb-1 block text-[12px] font-medium text-dls-text">
                描述 <RequiredBadge />
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简短描述 Agent 的能力范围和使用场景"
                rows={2}
                className={`w-full resize-none rounded-lg border px-3 py-2 text-[13px] text-dls-text outline-none focus:border-green-9 ${
                  errors.description ? "border-red-7" : "border-dls-border"
                }`}
              />
              <FieldError message={errors.description} />
            </div>

            {/* 模型（必填）+ 运行模式 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[12px] font-medium text-dls-text">
                  模型 <RequiredBadge />
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-[13px] text-dls-text outline-none focus:border-green-9 ${
                    errors.model ? "border-red-7" : "border-dls-border"
                  }`}
                >
                  <option value="">— 选择模型 —</option>
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.model} />
              </div>

              <div>
                <label className="mb-1 block text-[12px] font-medium text-dls-text">
                  运行模式
                </label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as "primary" | "all")}
                  className="w-full rounded-lg border border-dls-border px-3 py-2 text-[13px] text-dls-text outline-none focus:border-green-9"
                >
                  <option value="primary">primary（默认）</option>
                  <option value="all">all（全局）</option>
                </select>
              </div>
            </div>

            {/* 最大步骤数 */}
            <div>
              <label className="mb-1 block text-[12px] font-medium text-dls-text">
                最大步骤数
                <span className="ml-1 text-[10px] font-normal text-dls-secondary">留空表示不限</span>
              </label>
              <input
                type="number"
                min={1}
                max={999}
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                placeholder="不限"
                className="w-full rounded-lg border border-dls-border px-3 py-2 text-[13px] text-dls-text outline-none focus:border-green-9"
              />
            </div>

            {/* 绑定 Skills */}
            <div>
              <label className="mb-1 block text-[12px] font-medium text-dls-text">
                绑定 Skill
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {selectedSkillItems.map((item, i) => {
                  const s = selectedSkills[i];
                  return (
                    <span
                      key={s}
                      className="flex items-center gap-1 rounded-full border border-dls-border bg-dls-hover/60 px-2.5 py-0.5 text-[11px] text-dls-text"
                    >
                      {item?.name ?? s}
                      <button
                        type="button"
                        onClick={() => setSelectedSkills((prev) => prev.filter((x) => x !== s))}
                        className="ml-0.5 rounded-full text-dls-secondary hover:text-dls-text"
                      >
                        <X size={9} />
                      </button>
                    </span>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setShowSkillSelector(true)}
                  className="flex items-center gap-1 rounded-full border border-dashed border-dls-border px-2.5 py-0.5 text-[11px] text-dls-secondary hover:border-green-9/50 hover:text-green-11"
                >
                  + 选择 Skill
                </button>
              </div>
            </div>

            {/* System Prompt（必填） */}
            <div>
              <label className="mb-1 block text-[12px] font-medium text-dls-text">
                System Prompt <RequiredBadge />
              </label>
              <button
                type="button"
                onClick={() => setShowPromptEditor(true)}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-[13px] transition-colors hover:border-green-9/50 ${
                  errors.systemPrompt ? "border-red-7" : "border-dls-border"
                }`}
              >
                <span className={systemPrompt.trim() ? "text-dls-text" : "text-dls-secondary/60"}>
                  {systemPrompt.trim()
                    ? `${systemPrompt.slice(0, 60).trim()}${systemPrompt.length > 60 ? "…" : ""}`
                    : "点击编写 System Prompt…"}
                </span>
                <ChevronRight size={14} className="shrink-0 text-dls-secondary" />
              </button>
              <FieldError message={errors.systemPrompt} />
            </div>
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="flex shrink-0 items-center justify-between border-t border-dls-border px-5 py-3">
          <p className="text-[11px] text-dls-secondary">
            <span className="text-red-9">*</span> 为必填项
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg px-4 py-1.5 text-[12px] text-dls-secondary hover:bg-dls-hover disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-lg bg-green-9 px-5 py-1.5 text-[12px] font-medium text-white hover:bg-green-10 disabled:opacity-60"
            >
              {saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
