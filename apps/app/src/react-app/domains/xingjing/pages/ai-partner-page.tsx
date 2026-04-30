/** @jsxImportSource react */
import { useState } from "react";
import { Bot, MoreHorizontal, Pencil, Trash2, Plus, RefreshCcw } from "lucide-react";
import type { Agent } from "@opencode-ai/sdk/v2/client";
import type { OpenworkServerClient } from "../../../../app/lib/openwork-server";
import type { XingjingAgentMeta, XingjingAgentView } from "../types";
import { useAgents } from "../hooks/use-agents";
import { AgentEditorModal } from "../components/agent-editor-modal";
import { ConfirmModal } from "../../../design-system/modals/confirm-modal";

// ── 类型 ─────────────────────────────────────────────────────────────────────

export interface AiPartnerPageProps {
  openworkServerClient: OpenworkServerClient | null;
  workspaceId: string | null;
  /** 列出原生 OpenWork agents（由 session-route 通过 opencode client 封装注入）。 */
  listAgents?: () => Promise<Agent[]>;
}

// ── Agent 卡片 ────────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  onEdit,
  onDelete,
}: {
  agent: XingjingAgentView;
  onEdit: (agent: XingjingAgentView) => void;
  onDelete: (agent: XingjingAgentView) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const displayName = agent.options?.displayName ?? agent.name;
  const subtitle = agent.options?.subtitle;
  const icon = agent.options?.icon ?? "🤖";
  const skillsToShow = agent.resolvedSkills.slice(0, 3);
  const extraCount = Math.max(0, agent.resolvedSkills.length - 3);

  return (
    <div className="group relative flex flex-col rounded-2xl border border-dls-border bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* 顶部：图标 + 名称 + 菜单 */}
      <div className="mb-2 flex items-start justify-between">
        <div className="flex items-start gap-3">
          {/* 图标 */}
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-dls-border bg-dls-hover/50 text-2xl">
            {icon}
          </div>

          {/* 名称 + 副标题 */}
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold leading-tight text-dls-text">
              {displayName}
            </h3>
            {subtitle && (
              <p className="mt-0.5 text-[11px] text-dls-secondary">{subtitle}</p>
            )}
          </div>
        </div>

        {/* 操作菜单 */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-lg p-1 text-dls-secondary opacity-0 transition-opacity hover:bg-dls-hover group-hover:opacity-100"
          >
            <MoreHorizontal size={15} />
          </button>

          {menuOpen && (
            <>
              {/* 点击外部关闭 */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full z-50 mt-1 w-[140px] overflow-hidden rounded-xl border border-dls-border bg-white shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onEdit(agent);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-dls-text hover:bg-dls-hover"
                >
                  <Pencil size={12} />
                  编辑搭档
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(agent);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-red-9 hover:bg-red-1"
                >
                  <Trash2 size={12} />
                  删除搭档
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 描述 */}
      {agent.description && (
        <p className="mb-3 text-[12px] leading-[1.5] text-dls-secondary line-clamp-2">
          {agent.description}
        </p>
      )}

      {/* Skill 标签 */}
      {skillsToShow.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1">
          {skillsToShow.map((skill, i) => {
            const slug = agent.options?.skills?.[i] ?? "";
            if (!skill) {
              return (
                <span
                  key={slug}
                  className="rounded-full border border-dashed border-dls-border px-2 py-0.5 text-[10px] text-dls-secondary/60 line-through"
                  title="Skill 已删除"
                >
                  {slug}
                </span>
              );
            }
            return (
              <span
                key={skill.name}
                className="rounded-full border border-dls-border bg-dls-hover/50 px-2 py-0.5 text-[10px] text-dls-secondary"
              >
                {skill.name}
              </span>
            );
          })}
          {extraCount > 0 && (
            <span className="rounded-full border border-dls-border bg-dls-hover/50 px-2 py-0.5 text-[10px] text-dls-secondary">
              +{extraCount}
            </span>
          )}
        </div>
      )}

      {/* 悬浮时展示模型 */}
      {agent.model && (
        <div className="absolute bottom-3 right-4 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="rounded bg-dls-hover px-1.5 py-0.5 text-[10px] text-dls-secondary/80">
            {agent.model}
          </span>
        </div>
      )}
    </div>
  );
}

// ── 顶部说明横幅 ───────────────────────────────────────────────────────────────

function AiPartnerBanner() {
  return (
    <div className="mb-5 flex items-center gap-4 rounded-2xl border border-green-6/20 bg-gradient-to-r from-green-1 to-emerald-1 px-5 py-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-green-9/10">
        <Bot size={22} className="text-green-10" />
      </div>
      <div>
        <h2 className="text-[14px] font-semibold text-green-11">AI 搭档团队</h2>
        <p className="mt-0.5 text-[12px] text-green-10/70">
          每位搭档是一个独立的 AI Agent，拥有专属的系统提示词和技能集合，协同助力你的产品工作。
        </p>
      </div>
    </div>
  );
}

// ── 空状态 ────────────────────────────────────────────────────────────────────

function EmptyState({ onNewAgent }: { onNewAgent: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-24">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-dashed border-dls-border bg-dls-hover/40 text-3xl">
        🤖
      </div>
      <div className="space-y-1.5 text-center">
        <h3 className="text-[16px] font-semibold text-dls-text">还没有 AI 搭档</h3>
        <p className="text-[13px] text-dls-secondary">
          创建你的第一位 AI 搭档，定义角色、技能与提示词
        </p>
      </div>
      <button
        type="button"
        onClick={onNewAgent}
        className="flex items-center gap-2 rounded-xl bg-green-9 px-5 py-2 text-[13px] font-medium text-white hover:bg-green-10"
      >
        <Plus size={14} />
        新建搭档
      </button>
    </div>
  );
}

// ── AiPartnerPage 主组件 ──────────────────────────────────────────────────────

/**
 * AI 搭档主页面。
 *
 * 全宽 Agent 卡片网格，无 Skill 池（Skill 仅在编辑 Agent 时通过弹窗选择）。
 */
export function AiPartnerPage({ openworkServerClient, workspaceId, listAgents }: AiPartnerPageProps) {
  const { agents, loading, error, refresh, saveAgent, deleteAgent, readAgent } = useAgents(
    openworkServerClient,
    workspaceId,
    listAgents,
  );

  // ── UI 状态 ───────────────────────────────────────────────────────────────

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<XingjingAgentMeta | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<XingjingAgentView | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── 获取可用 Skill 列表 ────────────────────────────────────────────────────

  // skills 通过 resolvedSkills 已隐式加载，从已有 agent 中提取去重
  const allAvailableSkills = (() => {
    const map = new Map<string, (typeof agents)[0]["resolvedSkills"][0]>();
    for (const agent of agents) {
      for (const skill of agent.resolvedSkills) {
        if (skill) map.set(skill.name, skill);
      }
    }
    return [...map.values()].filter(Boolean) as NonNullable<(typeof agents)[0]["resolvedSkills"][0]>[];
  })();

  // 注：完整 Skill 列表在编辑弹窗打开时需通过 client.listSkills() 获取
  // 为简化，将从 openworkServerClient 异步加载，存于组件状态
  const [availableSkills, setAvailableSkills] = useState(allAvailableSkills);

  const openEditor = async (agent?: XingjingAgentView) => {
    // 刷新 Skill 列表
    if (openworkServerClient && workspaceId) {
      try {
        const result = await openworkServerClient.listSkills(workspaceId, { includeGlobal: true });
        setAvailableSkills(result.items);
      } catch {
        // 沿用旧列表
      }
    }

    if (agent) {
      // 编辑时重新读取完整内容（含 systemPrompt）
      const full = await readAgent(agent.name);
      setEditingAgent(full ?? agent);
    } else {
      setEditingAgent(null);
    }
    setEditorOpen(true);
  };

  const handleSave = async (meta: XingjingAgentMeta) => {
    setSaving(true);
    try {
      await saveAgent(meta);
      setEditorOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAgent(deleteTarget.name);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  // ── 渲染 ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* 编辑弹窗 */}
      {editorOpen && (
        <AgentEditorModal
          initialAgent={editingAgent}
          availableSkills={availableSkills}
          existingSlugs={agents.map((a) => a.name)}
          onSave={handleSave}
          onClose={() => setEditorOpen(false)}
          saving={saving}
        />
      )}

      {/* 删除确认弹窗 */}
      {deleteTarget && (
        <ConfirmModal
          open
          title="删除 AI 搭档"
          message={`确认删除「${deleteTarget.options?.displayName ?? deleteTarget.name}」？此操作不可撤销。`}
          confirmLabel={deleting ? "删除中…" : "删除"}
          cancelLabel="取消"
          variant="danger"
          onConfirm={() => void handleDeleteConfirm()}
          onCancel={() => {
            if (!deleting) setDeleteTarget(null);
          }}
        />
      )}

      {/* 主内容 */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* 顶部横幅 */}
        <AiPartnerBanner />

        {/* 标题行 */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-dls-text">
            AI 搭档团队
            {agents.length > 0 && (
              <span className="ml-2 text-[13px] font-normal text-dls-secondary">
                ({agents.length})
              </span>
            )}
          </h3>

          <div className="flex items-center gap-2">
            {/* 刷新按钮 */}
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="rounded-lg p-1.5 text-dls-secondary hover:bg-dls-hover disabled:opacity-50"
              title="刷新"
            >
              <RefreshCcw size={14} className={loading ? "animate-spin" : ""} />
            </button>

            {/* 新建按钮 */}
            <button
              type="button"
              onClick={() => void openEditor()}
              className="flex items-center gap-1.5 rounded-xl bg-green-9 px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-green-10"
            >
              <Plus size={13} />
              新建搭档
            </button>
          </div>
        </div>

        {/* 错误状态 */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-6/30 bg-red-1 px-4 py-3 text-[13px] text-red-9">
            {error}
          </div>
        )}

        {/* 加载骨架 */}
        {loading && agents.length === 0 && (
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[130px] animate-pulse rounded-2xl border border-dls-border bg-dls-hover/40"
              />
            ))}
          </div>
        )}

        {/* 空状态 */}
        {!loading && agents.length === 0 && !error && (
          <EmptyState onNewAgent={() => void openEditor()} />
        )}

        {/* Agent 卡片网格（3列） */}
        {agents.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {agents.map((agent) => (
              <AgentCard
                key={agent.name}
                agent={agent}
                onEdit={(a) => void openEditor(a)}
                onDelete={(a) => setDeleteTarget(a)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
