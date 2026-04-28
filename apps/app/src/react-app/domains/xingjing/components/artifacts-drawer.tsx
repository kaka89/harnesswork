/** @jsxImportSource react */
import { useState, type ReactNode } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Files,
  ListTodo,
  Wrench,
} from "lucide-react";

import type { ArtifactPanelTab } from "../types";
import type { ArtifactEntry, ToolEntry } from "../hooks/use-xingjing-artifacts";
import { useXingjingArtifacts } from "../hooks/use-xingjing-artifacts";
import type { Todo } from "@opencode-ai/sdk/v2/client";

export type ArtifactsDrawerProps = {
  workspaceId: string | null;
  sessionId: string | null;
  /** 来自 useWorkspaceShellLayout().rightSidebarExpanded */
  expanded: boolean;
  /** 来自 useWorkspaceShellLayout().toggleRightSidebar */
  onToggle: () => void;
};

/**
 * 右侧产出物抽屉（折叠/展开）。
 *
 * 三 tab：Artifacts（落盘文件）/ Tools（工具调用）/ Todos（待办项）。
 * 数据来源：useXingjingArtifacts()，只读 React Query 缓存，不新建 SSE 连接。
 *
 * 对应 30-autopilot.md §9.2「右侧抽屉」+ 10-product-shell.md §4.1「右：折叠抽屉」。
 */
export function ArtifactsDrawer({
  workspaceId,
  sessionId,
  expanded,
  onToggle,
}: ArtifactsDrawerProps) {
  const [activeTab, setActiveTab] = useState<ArtifactPanelTab>("todos");
  const { artifacts, tools, todos } = useXingjingArtifacts(workspaceId, sessionId);

  if (!expanded) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 pt-3">
        <CollapsedTabButton
          icon={<Files size={15} />}
          count={artifacts.length}
          active={activeTab === "artifacts"}
          label="Files"
          onClick={() => {
            setActiveTab("artifacts");
            onToggle();
          }}
        />
        <CollapsedTabButton
          icon={<Wrench size={15} />}
          count={tools.length}
          active={activeTab === "tools"}
          label="Tools"
          onClick={() => {
            setActiveTab("tools");
            onToggle();
          }}
        />
        <CollapsedTabButton
          icon={<ListTodo size={15} />}
          count={todos.length}
          active={activeTab === "todos"}
          label="Tasks"
          onClick={() => {
            setActiveTab("todos");
            onToggle();
          }}
        />
        <div className="mt-auto pb-3">
          <button
            type="button"
            onClick={onToggle}
            className="rounded-md p-1.5 text-gray-9 transition-colors hover:bg-dls-hover hover:text-dls-text"
            aria-label="Expand panel"
          >
            <ChevronLeft size={13} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Tab bar */}
      <div className="flex shrink-0 items-center border-b border-dls-border pl-1 pr-2">
        <div className="flex min-w-0 flex-1">
          {(["artifacts", "tools", "todos"] as const).map((tab) => {
            const label =
              tab === "artifacts" ? "Files" : tab === "tools" ? "Tools" : "Tasks";
            const count =
              tab === "artifacts"
                ? artifacts.length
                : tab === "tools"
                  ? tools.length
                  : todos.length;
            return (
              <button
                key={tab}
                type="button"
                className={`relative flex items-center gap-1.5 px-3 py-2.5 text-[12px] font-medium transition-colors ${
                  activeTab === tab
                    ? "text-dls-text after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:rounded-full after:bg-blue-9"
                    : "text-gray-9 hover:text-gray-11"
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {label}
                {count > 0 ? (
                  <span className="rounded-full bg-gray-3 px-1.5 py-0.5 text-[10px] leading-none text-gray-10">
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 rounded-md p-1.5 text-gray-9 transition-colors hover:bg-dls-hover hover:text-dls-text"
          aria-label="Collapse panel"
        >
          <ChevronRight size={13} />
        </button>
      </div>

      {/* Tab content */}
      <div className="min-h-0 flex-1 overflow-auto">
        {activeTab === "artifacts" && <ArtifactsTab artifacts={artifacts} />}
        {activeTab === "tools" && <ToolsTab tools={tools} />}
        {activeTab === "todos" && <TodosTab todos={todos} />}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CollapsedTabButton({
  icon,
  count,
  active,
  label,
  onClick,
}: {
  icon: ReactNode;
  count: number;
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`relative flex flex-col items-center gap-0.5 rounded-lg p-2 transition-colors ${
        active ? "bg-dls-hover text-dls-text" : "text-gray-9 hover:bg-dls-hover hover:text-gray-11"
      }`}
    >
      {icon}
      {count > 0 ? (
        <span className="text-[9px] font-medium leading-none text-gray-9">{count}</span>
      ) : null}
    </button>
  );
}

function ArtifactsTab({ artifacts }: { artifacts: ArtifactEntry[] }) {
  if (artifacts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <Files size={20} className="text-gray-7" />
        <span className="text-[12px] text-gray-9">No files yet</span>
      </div>
    );
  }
  return (
    <div className="divide-y divide-dls-border">
      {artifacts.map((artifact) => (
        <div key={artifact.id} className="flex items-start gap-2 px-3 py-2.5">
          <FileText size={13} className="mt-0.5 shrink-0 text-gray-9" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] text-dls-text">{artifact.name}</div>
            <div className="truncate text-[10px] text-gray-9">{artifact.path}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ToolsTab({ tools }: { tools: ToolEntry[] }) {
  if (tools.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <Wrench size={20} className="text-gray-7" />
        <span className="text-[12px] text-gray-9">No tool calls yet</span>
      </div>
    );
  }
  return (
    <div className="divide-y divide-dls-border">
      {tools.map((tool) => (
        <div key={tool.id} className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <Wrench size={11} className="shrink-0 text-gray-9" />
            <span className="truncate text-[12px] font-medium text-dls-text">
              {tool.toolName}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TodosTab({ todos }: { todos: Todo[] }) {
  const filtered = todos.filter((todo) => todo.content.trim());
  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <ListTodo size={20} className="text-gray-7" />
        <span className="text-[12px] text-gray-9">No tasks yet</span>
      </div>
    );
  }
  return (
    <div className="space-y-2 px-3 py-3">
      {filtered.map((todo, index) => {
        const done = todo.status === "completed";
        const cancelled = todo.status === "cancelled";
        const active = todo.status === "in_progress";
        return (
          <div key={`${todo.content}-${index}`} className="flex items-start gap-2">
            <div
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                done
                  ? "border-green-6 bg-green-2 text-green-11"
                  : active
                    ? "border-amber-6 bg-amber-2 text-amber-11"
                    : cancelled
                      ? "border-gray-6 bg-gray-2 text-gray-8"
                      : "border-gray-6 bg-gray-1 text-gray-8"
              }`}
            >
              {done ? (
                <Check size={9} />
              ) : active ? (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-9" />
              ) : null}
            </div>
            <span
              className={`text-[12px] leading-relaxed ${
                cancelled ? "text-gray-9 line-through" : "text-gray-12"
              }`}
            >
              {todo.content}
            </span>
          </div>
        );
      })}
    </div>
  );
}
