/** @jsxImportSource react */
/**
 * PipelineLaunchDialog — 启动流水线前收集 goal 和 inputs 的模态对话框
 *
 * 根据 PipelineDefinition.inputs 动态渲染表单字段。
 * 简化 v1：支持 text / textarea / enum 类型输入 + 高级选项折叠区。
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Paperclip, Play, X } from "lucide-react";
import type { PipelineDefinition, PipelineInputField } from "../../pipeline/types";

// ── Types ───────────────────────────────────────────────────────────────────────────────

export interface PipelineLaunchDialogProps {
  open: boolean;
  def: PipelineDefinition | null;
  launching?: boolean;
  launchError?: string | null;
  onLaunch: (
    def: PipelineDefinition,
    goal: string,
    inputValues: Record<string, string>,
    advancedOptions?: AdvancedLaunchOptions,
  ) => void;
  onClose: () => void;
}

export interface AdvancedLaunchOptions {
  dryRun?: boolean;
  skipApproval?: boolean;
  attachments?: string[];  // 工作区文件路径
}

// ── Component ─────────────────────────────────────────────────────────────────────────────────

export function PipelineLaunchDialog({
  open,
  def,
  launching = false,
  launchError,
  onLaunch,
  onClose,
}: PipelineLaunchDialogProps) {
  const [goal, setGoal] = useState("");
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [skipApproval, setSkipApproval] = useState(false);
  const [attachmentsText, setAttachmentsText] = useState(""); // 每行一个文件路径
  const goalRef = useRef<HTMLTextAreaElement>(null);

  // 打开时重置表单
  useEffect(() => {
    if (open && def) {
      setGoal("");
      setAdvancedOpen(false);
      setDryRun(false);
      setSkipApproval(false);
      setAttachmentsText("");
      const defaults: Record<string, string> = {};
      for (const field of def.inputs) {
        defaults[field.key] = field.default ?? "";
      }
      setInputValues(defaults);
      setTimeout(() => goalRef.current?.focus(), 50);
    }
  }, [open, def]);

  // ESC 关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !launching) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, launching, onClose]);

  if (!open || !def) return null;

  const canSubmit = !launching && goal.trim().length > 0;

  const parseAttachments = (text: string): string[] =>
    text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const attachments = parseAttachments(attachmentsText);
    onLaunch(def, goal.trim(), inputValues, {
      dryRun,
      skipApproval,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
  };

  const setField = (key: string, value: string) => {
    setInputValues((prev) => ({ ...prev, [key]: value }));
  };

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !launching) onClose();
      }}
    >
      <div className="w-[500px] max-w-[95vw] overflow-hidden rounded-2xl border border-dls-border bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-dls-border px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-dls-text">{def.name}</h2>
            {def.description ? (
              <p className="mt-0.5 text-[12px] text-dls-secondary">{def.description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={launching}
            className="rounded-md p-1 text-dls-secondary hover:bg-dls-hover hover:text-dls-text disabled:opacity-40"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {/* Goal */}
          <div className="mb-4">
            <label className="mb-1.5 block text-[12px] font-medium text-dls-text">
              这次要做什么？
              <span className="ml-1 text-red-9">*</span>
            </label>
            <textarea
              ref={goalRef}
              rows={3}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="简要描述本次流水线的目标，例如：完成用户注册模块的需求分析与开发"
              className="w-full resize-none rounded-lg border border-dls-border bg-dls-hover/30 px-3 py-2 text-[13px] text-dls-text placeholder:text-dls-secondary/60 focus:border-green-7 focus:outline-none focus:ring-1 focus:ring-green-7"
              disabled={launching}
            />
          </div>

          {/* Dynamic input fields */}
          {def.inputs.length > 0 ? (
            <div className="mb-4 space-y-3">
              {def.inputs.map((field) => (
                <InputFieldRow
                  key={field.key}
                  field={field}
                  value={inputValues[field.key] ?? ""}
                  onChange={(v) => setField(field.key, v)}
                  disabled={launching}
                />
              ))}
            </div>
          ) : null}

          {/* Attachments */}
          <div className="mb-4">
            <label className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-dls-text">
              <Paperclip size={12} className="text-dls-secondary" />
              附加工作区文件路径
              <span className="font-normal text-dls-secondary">(可选)</span>
            </label>
            <textarea
              rows={2}
              value={attachmentsText}
              onChange={(e) => setAttachmentsText(e.target.value)}
              placeholder="每行一个文件路径，例如：README.md"
              className="w-full resize-none rounded-lg border border-dls-border bg-dls-hover/30 px-3 py-2 text-[12px] font-mono text-dls-text placeholder:text-dls-secondary/60 focus:border-green-7 focus:outline-none focus:ring-1 focus:ring-green-7"
              disabled={launching}
            />
          </div>

          {/* Advanced options collapsible */}
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex items-center gap-1 text-[12px] text-dls-secondary hover:text-dls-text"
            >
              {advancedOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              高级选项
            </button>
            {advancedOpen ? (
              <div className="mt-2 space-y-2 rounded-lg border border-dls-border/60 bg-dls-hover/20 p-3">
                <CheckboxRow
                  label="干跑模式（仅编译预览，不派子 agent）"
                  checked={dryRun}
                  onChange={setDryRun}
                  disabled={launching}
                />
                <CheckboxRow
                  label="跳过人工审批节点 (dev only)"
                  checked={skipApproval}
                  onChange={setSkipApproval}
                  disabled={launching}
                />
              </div>
            ) : null}
          </div>

          {/* Error */}
          {launchError ? (
            <div className="mt-3 rounded-lg border border-red-6/30 bg-red-2 px-3 py-2 text-[12px] text-red-11">
              {launchError}
            </div>
          ) : null}

          {/* Buttons */}
          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={launching}
              className="rounded-lg border border-dls-border px-4 py-2 text-[13px] text-dls-secondary hover:bg-dls-hover disabled:opacity-40"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex items-center gap-1.5 rounded-lg bg-green-9 px-4 py-2 text-[13px] font-medium text-white hover:bg-green-10 disabled:opacity-50"
            >
              {launching ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  启动中…
                </span>
              ) : (
                <>
                  <Play size={13} />
                  启动流水线
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── InputFieldRow ───────────────────────────────────────────────────────────────────────────────

function InputFieldRow({
  field,
  value,
  onChange,
  disabled,
}: {
  field: PipelineInputField;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const labelEl = (
    <label className="mb-1 block text-[12px] font-medium text-dls-text">
      {field.label}
      {field.required && <span className="ml-1 text-red-9">*</span>}
      {field.description ? (
        <span className="ml-1 font-normal text-dls-secondary">({field.description})</span>
      ) : null}
    </label>
  );

  if (field.type === "textarea") {
    return (
      <div>
        {labelEl}
        <textarea
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          disabled={disabled}
          className="w-full resize-none rounded-lg border border-dls-border bg-dls-hover/30 px-3 py-2 text-[13px] text-dls-text placeholder:text-dls-secondary/60 focus:border-green-7 focus:outline-none focus:ring-1 focus:ring-green-7"
        />
      </div>
    );
  }

  if (field.type === "enum" && field.options?.length) {
    return (
      <div>
        {labelEl}
        <div className="relative">
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="w-full appearance-none rounded-lg border border-dls-border bg-dls-hover/30 px-3 py-2 pr-8 text-[13px] text-dls-text focus:border-green-7 focus:outline-none focus:ring-1 focus:ring-green-7"
          >
            <option value="">请选择</option>
            {field.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <ChevronDown
            size={13}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-dls-secondary"
          />
        </div>
      </div>
    );
  }

  // default: text
  return (
    <div>
      {labelEl}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder ?? ""}
        disabled={disabled}
        className="w-full rounded-lg border border-dls-border bg-dls-hover/30 px-3 py-2 text-[13px] text-dls-text placeholder:text-dls-secondary/60 focus:border-green-7 focus:outline-none focus:ring-1 focus:ring-green-7"
      />
    </div>
  );
}

// ── CheckboxRow ─────────────────────────────────────────────────────────────────────────────────

function CheckboxRow({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="h-3.5 w-3.5 rounded border-dls-border accent-green-9"
      />
      <span className="text-[12px] text-dls-secondary">{label}</span>
    </label>
  );
}

