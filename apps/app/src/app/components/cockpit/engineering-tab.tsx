import { lazy, Suspense, For } from "solid-js";

// 懒加载 SessionView（SolidJS lazy，非 React.lazy）
const SessionView = lazy(() => import("../../pages/session"));

interface EngineeringTabProps {
  workspaceId?: string;
}

function EngineeringTabSkeleton() {
  return (
    <div class="flex h-full gap-0">
      {/* 左侧代码树骨架 20% */}
      <div class="w-1/5 border-r border-gray-800 p-3 flex flex-col gap-2">
        <For each={[1, 2, 3, 4, 5, 6, 7, 8]}>
          {() => <div class="h-4 bg-gray-800 rounded animate-pulse" />}
        </For>
      </div>
      {/* 中间编辑区骨架 55% */}
      <div class="flex-1 p-4 flex flex-col gap-3">
        <For each={[1, 2, 3, 4, 5]}>
          {() => <div class="h-4 bg-gray-800 rounded animate-pulse" />}
        </For>
      </div>
      {/* 右侧 AI 对话骨架 25% */}
      <div class="w-1/4 border-l border-gray-800 p-3 flex flex-col gap-2">
        <For each={[1, 2, 3]}>
          {() => <div class="h-12 bg-gray-800 rounded animate-pulse" />}
        </For>
      </div>
    </div>
  );
}

export default function EngineeringTab(props: EngineeringTabProps) {
  return (
    <div
      class="h-full overflow-hidden [&>*]:!h-full"
      data-testid="engineering-tab"
    >
      <Suspense fallback={<EngineeringTabSkeleton />}>
        {/* @ts-ignore - workspaceId may not be in SessionView props */}
        <SessionView workspaceId={props.workspaceId} />
      </Suspense>
    </div>
  );
}
