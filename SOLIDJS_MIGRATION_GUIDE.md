# Solo Pages SolidJS Migration - Complete Implementation Guide

## Project Status

**Completed**: Solo Autopilot page (100% complete with all features)
**Remaining**: 7 pages to migrate using standardized patterns

## File Structure

All Solo pages are located at:
```
apps/app/src/app/xingjing/pages/solo/
├── autopilot/index.tsx      ✅ COMPLETE
├── focus/index.tsx          📝 Ready for migration
├── product/index.tsx        📝 Ready for migration
├── build/index.tsx          📝 Ready for migration
├── release/index.tsx        📝 Ready for migration
├── review/index.tsx         📝 Ready for migration
├── knowledge/index.tsx      📝 Ready for migration
└── agent-workshop/index.tsx 📝 Ready for migration
```

## Solo Autopilot - Completed Example

### Key Features Implemented:
1. **Parallel State Management** - 4 independent brain agents running in parallel
2. **Timeline Animation** - Real-time execution flow visualization
3. **Progress Tracking** - Percentage-based progress with step indicators
4. **Artifacts Display** - Post-execution output collection and display
5. **Create Modal Integration** - Empty state with product creation

### Code Patterns Used:

#### 1. Signal-based State
```typescript
const [runState, setRunState] = createSignal<RunState>('idle');
const [progress, setProgress] = createSignal(0);
const [visibleSteps, setVisibleSteps] = createSignal<typeof soloWorkflowSteps>([]);
```

#### 2. Conditional Rendering
```typescript
<Show when={soloProducts().length === 0}>
  {/* Empty state card */}
</Show>
```

#### 3. List Iteration
```typescript
<For each={soloAgents}>
  {(agent) => (
    <SoloBrainCard
      agent={agent}
      status={agentStatuses()[agent.id]}
      currentTask={agentTasks()[agent.id]}
      doneToday={agentDone()[agent.id]}
    />
  )}
</For>
```

#### 4. Inline Styling (No Tailwind, No Ant Design)
```typescript
style={{
  border: '1px solid #f0f0f0',
  'border-radius': '8px',
  padding: '16px',
  background: '#fff',
}}
```

#### 5. Event Handlers
```typescript
// Input events use onInput, not onChange
onInput={(e) => setGoal(e.currentTarget.value)}

// Keyboard events
onKeyPress={(e) => {
  if (e.key === 'Enter') handleStart();
}}

// Click events stay the same
onClick={() => setCreateModalOpen(true)}
```

## Remaining Pages - Migration Templates

### Page 2: Solo Focus
**React Source**: `apps/xingjing/src/pages/Solo/Focus/index.tsx`
**Target**: `apps/app/src/app/xingjing/pages/solo/focus/index.tsx`

**Key Imports**:
```typescript
import { createSignal, Show, For } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { Fire, Code, Lightbulb, TrendingUp } from 'lucide-solid';
import {
  todayFocus,
  businessMetrics,
  soloTasks,
  FocusItem,
  BusinessMetric,
  SoloTask,
} from '../../../mock/solo';
```

**Components**:
- AI Daily Brief (gradient card with priority items)
- Today's Task Checklist (5 tasks with checkboxes)
- Business Health Cards (4 metrics: DAU, MRR, 7d retention, NPS)
- Work Mode Cards (3 navigation cards)
- Streak Widget (14-day fire calendar)

**State Requirements**:
```typescript
const [checkedTasks, setCheckedTasks] = createSignal<Set<string>>(new Set());
```

---

### Page 3: Solo Product
**React Source**: `apps/xingjing/src/pages/Solo/Product/index.tsx`
**Target**: `apps/app/src/app/xingjing/pages/solo/product/index.tsx`

**Key Imports**:
```typescript
import {
  hypotheses,
  featureIdeas,
  competitors,
  Hypothesis,
  HypothesisStatus,
} from '../../../mock/solo';
```

**Components**:
- Hypothesis Kanban (3 columns: testing, validated, invalidated)
- Feature Ideas List (with AI priority scoring)
- Competitors Comparison (2-col grid)
- Product Agent Chat Panel (message history + input)
- Hypothesis Detail Modal

**State Requirements**:
```typescript
const [activeTab, setActiveTab] = createSignal('hypotheses');
const [detailHypo, setDetailHypo] = createSignal<Hypothesis | null>(null);
const [agentInput, setAgentInput] = createSignal('');
const [agentMessages, setAgentMessages] = createSignal<Array<{
  role: 'user' | 'assistant';
  content: string;
}>>([]);
```

**Agent Response Pattern**:
```typescript
const handleAgentSend = () => {
  if (!agentInput().trim()) return;
  const q = agentInput().trim();
  setAgentMessages((prev) => [...prev, { role: 'user', content: q }]);
  setAgentInput('');
  setTimeout(() => {
    // Simulate AI response based on question content
    const reply = generateResponse(q);
    setAgentMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
  }, 700);
};
```

---

### Page 4: Solo Build
**React Source**: `apps/xingjing/src/pages/Solo/Build/index.tsx`
**Target**: `apps/app/src/app/xingjing/pages/solo/build/index.tsx`

**Key Imports**:
```typescript
import {
  soloTasks,
  adrs,
  SoloTask,
  ADR,
} from '../../../mock/solo';
```

**Components**:
- Task Tabs (all/todo/doing/done)
- Task Card with DoD (Definition of Done) checklist
- ADR Cards (3-column format: question/decision/reason)
- Dev Agent Chat Panel

**State Requirements**:
```typescript
const [activeTab, setActiveTab] = createSignal('tasks');
const [agentInput, setAgentInput] = createSignal('');
const [agentMessages, setAgentMessages] = createSignal<any[]>([
  { role: 'assistant', content: '...' }
]);
```

**Task Card Pattern**:
```typescript
const TaskCard = (props: { task: SoloTask; active?: boolean }) => {
  const [checked, setChecked] = createSignal<Record<number, boolean>>({});
  const doneCount = () => props.task.dod.filter((_, i) => checked()[i]).length;
  
  return (
    <div style={{ /* card styles */ }}>
      {/* Task info */}
      <div>DoD ({doneCount()}/{props.task.dod.length})</div>
      <div style={{ /* progress bar */ }} />
      <For each={props.task.dod}>
        {(item, i) => (
          <div>
            <input
              type="checkbox"
              checked={!!checked()[i()]}
              onChange={(e) => setChecked((prev) => ({ 
                ...prev, 
                [i()]: e.currentTarget.checked 
              }))}
            />
          </div>
        )}
      </For>
    </div>
  );
};
```

---

### Page 5: Solo Release
**React Source**: `apps/xingjing/src/pages/Solo/Release/index.tsx`
**Target**: `apps/app/src/app/xingjing/pages/solo/release/index.tsx`

**Key Imports**:
```typescript
import {
  featureFlags,
  releases,
  FeatureFlag,
  Release,
} from '../../../mock/solo';
import ECharts from '../../../components/common/echarts';
```

**Components**:
- Deploy Panel (env selector + deploy button)
- CI/CD Progress Steps
- Feature Flags with rollout sliders
- Release History Timeline
- Runtime Monitoring Charts (ECharts)
- Ops Integrations List

**State Requirements**:
```typescript
const [deployEnv, setDeployEnv] = createSignal<'staging' | 'prod'>('staging');
const [deploying, setDeploying] = createSignal(false);
const [ciProgress, setCiProgress] = createSignal(0);
const [ciDone, setCiDone] = createSignal(false);
const [flags, setFlags] = createSignal<FeatureFlag[]>(featureFlags);
const [rollouts, setRollouts] = createSignal<Record<string, number>>(
  Object.fromEntries(featureFlags.map((f) => [f.id, f.rollout]))
);
```

**Deploy Simulation**:
```typescript
const handleDeploy = () => {
  setDeploying(true);
  setCiProgress(0);
  setCiDone(false);
  let p = 0;
  const timer = setInterval(() => {
    p += Math.random() * 18 + 8;
    if (p >= 100) {
      p = 100;
      clearInterval(timer);
      setTimeout(() => {
        setDeploying(false);
        setCiDone(true);
      }, 400);
    }
    setCiProgress(Math.min(Math.round(p), 100));
  }, 280);
};
```

**ECharts Pattern**:
```typescript
<ECharts option={{
  tooltip: { trigger: 'axis' as const },
  legend: { data: ['错误率 (%)'], bottom: 0 },
  grid: { left: 40, right: 20, top: 10, bottom: 36 },
  xAxis: {
    type: 'category' as const,
    data: ['4/5', '4/6', '4/7', '4/8', '4/9', '4/10', '4/11'],
  },
  yAxis: { type: 'value' as const, max: 3 },
  series: [{
    name: '错误率 (%)',
    type: 'line',
    smooth: true,
    data: [0.8, 0.5, 0.6, 1.2, 0.4, 0.3, 0.5],
    itemStyle: { color: '#ff4d4f' },
    areaStyle: { opacity: 0.1 },
  }],
}} style={{ height: 160 }} />
```

---

### Page 6: Solo Review
**React Source**: `apps/xingjing/src/pages/Solo/Review/index.tsx`
**Target**: `apps/app/src/app/xingjing/pages/solo/review/index.tsx`

**Key Imports**:
```typescript
import {
  businessMetrics,
  metricsHistory,
  featureUsage,
  userFeedbacks,
  MetricHistory,
  FeatureUsage,
  UserFeedback,
} from '../../../mock/solo';
import ECharts from '../../../components/common/echarts';
```

**Components**:
- Business Metrics Cards (4-col grid)
- DAU + MRR Trend Chart (dual-axis ECharts)
- Feature Usage Bar Chart (ECharts horizontal bar)
- User Feedback List with sentiment avatars
- AI Insights Cards

**Chart Patterns**:

```typescript
// Dual-axis trend chart
const trendOption = {
  tooltip: { trigger: 'axis' as const },
  legend: { data: ['DAU', 'MRR ($)'], bottom: 0 },
  grid: { left: 40, right: 20, top: 20, bottom: 40 },
  xAxis: {
    type: 'category' as const,
    data: metricsHistory().map((d) => d.week),
  },
  yAxis: [
    { type: 'value' as const, name: 'DAU' },
    { type: 'value' as const, name: 'MRR ($)' },
  ],
  series: [
    {
      name: 'DAU',
      type: 'line',
      data: metricsHistory().map((d) => d.dau),
      smooth: true,
      itemStyle: { color: '#1264e5' },
      areaStyle: { color: 'rgba(18,100,229,0.08)' },
    },
    {
      name: 'MRR ($)',
      type: 'line',
      yAxisIndex: 1,
      data: metricsHistory().map((d) => d.mrr),
      smooth: true,
      itemStyle: { color: '#52c41a' },
      areaStyle: { color: 'rgba(82,196,26,0.08)' },
    },
  ],
};
```

```typescript
// Horizontal bar chart
const featureUsageOption = {
  tooltip: { trigger: 'axis' as const },
  grid: { left: 100, right: 20, top: 10, bottom: 20 },
  xAxis: { type: 'value' as const, max: 100 },
  yAxis: { type: 'category' as const, data: featureUsage().map((f) => f.feature).reverse() },
  series: [{
    type: 'bar',
    data: featureUsage().map((f) => ({
      value: f.usage,
      itemStyle: {
        color: f.trend === 'up' ? '#52c41a' : f.trend === 'down' ? '#ff4d4f' : '#1264e5',
      },
    })).reverse(),
    barMaxWidth: 24,
    label: { show: true, position: 'right' as const, formatter: '{c}%' },
  }],
};
```

---

### Page 7: Solo Knowledge
**React Source**: `apps/xingjing/src/pages/Solo/Knowledge/index.tsx`
**Target**: `apps/app/src/app/xingjing/pages/solo/knowledge/index.tsx`

**Key Imports**:
```typescript
import {
  myKnowledge,
  KnowledgeItem,
  KnowledgeCategory,
} from '../../../mock/solo';
import { BookOpen, AlertTriangle, User, Code } from 'lucide-solid';
```

**Components**:
- Search Input
- Category Filter Buttons
- 3-Column Knowledge Layout
- Knowledge Card with tags
- AI Alert Banner

**State Requirements**:
```typescript
const [search, setSearch] = createSignal('');
const [activeCategory, setActiveCategory] = createSignal<KnowledgeCategory | 'all'>('all');

const filtered = () => myKnowledge.filter((item) => {
  const matchCat = activeCategory() === 'all' || item.category === activeCategory();
  const matchSearch = !search() ||
    item.title.includes(search()) ||
    item.content.includes(search()) ||
    item.tags.some((t) => t.includes(search()));
  return matchCat && matchSearch;
});
```

**Conditional Column Rendering**:
```typescript
<Show when={(activeCategory() === 'all' || activeCategory() === 'pitfall') && pitfalls().length > 0}>
  <div style={{ /* column styles */ }}>
    <div style={{ /* category header */ }}>
      <AlertTriangle size={16} />
      踩过的坑
    </div>
    <For each={pitfalls()}>
      {(item) => <KnowledgeCard item={item} />}
    </For>
  </div>
</Show>
```

---

### Page 8: Solo AgentWorkshop
**React Source**: `apps/xingjing/src/pages/Solo/AgentWorkshop/index.tsx`
**Target**: `apps/app/src/app/xingjing/pages/solo/agent-workshop/index.tsx`

**Key Imports**:
```typescript
import {
  soloAgents,
  AgentDef,
} from '../../../mock/autopilot';
import {
  soloSkillPool,
  SkillDef,
  initialSoloAssignments,
  AgentAssignment,
  TaskOrchestration,
  soloOrchestrations,
} from '../../../mock/agentWorkshop';
```

**Components** (Complex with drag-and-drop):
- Agent Cards with customization
- Skill Pool (draggable items)
- Skill Assignment Area
- Skill Edit Modal
- Task Orchestration Timeline

**State Requirements**:
```typescript
const [agents, setAgents] = createSignal<AgentDef[]>([...soloAgents]);
const [agentSkills, setAgentSkills] = createSignal<Record<string, string[]>>({});
const [selectedAgent, setSelectedAgent] = createSignal<AgentDef | null>(null);
const [skillPool, setSkillPool] = createSignal<SkillDef[]>([...soloSkillPool]);
const [editingSkill, setEditingSkill] = createSignal<SkillDef | null>(null);
```

---

## Standard Component Patterns

### Card Container
```typescript
<div style={{
  border: '1px solid #f0f0f0',
  'border-radius': '8px',
  padding: '16px',
  background: '#fff',
}}>
  {/* content */}
</div>
```

### Tag
```typescript
<div style={{
  display: 'inline-flex',
  'align-items': 'center',
  padding: '2px 8px',
  'border-radius': '4px',
  'font-size': '11px',
  border: '1px solid #d9d9d9',
  color: '#595959',
}}>
  {label}
</div>
```

### Progress Bar
```typescript
<div style={{
  background: '#f0f0f0',
  'border-radius': '4px',
  height: '6px',
}}>
  <div style={{
    background: '#52c41a',
    height: '100%',
    'border-radius': '4px',
    width: `${percent}%`,
  }} />
</div>
```

### Agent Panel
```typescript
<div style={{
  'margin-top': '20px',
  border: '1px solid #e6f4ff',
  'border-radius': '8px',
  background: '#f0f9ff',
  padding: '16px',
}}>
  <div style={{
    display: 'flex',
    'align-items': 'center',
    gap: '8px',
    'font-weight': '600',
    'margin-bottom': '12px',
    color: '#1264e5',
  }}>
    <Bot size={16} /> Agent Name
  </div>
  {/* messages + input */}
</div>
```

### Message Bubble
```typescript
<For each={agentMessages()}>
  {(msg) => (
    <div style={{
      'margin-bottom': '8px',
      padding: '6px 10px',
      background: msg.role === 'user' ? '#e6f7ff' : '#fff',
      'border-radius': '6px',
      'font-size': '13px',
      'white-space': 'pre-wrap',
    }}>
      <strong style={{ 'font-size': '12px' }}>
        {msg.role === 'user' ? '你' : 'Agent'}:
      </strong>
      <br />
      {msg.content}
    </div>
  )}
</For>
```

---

## Important Notes

1. **No Ant Design**: All components use inline `style` attributes instead
2. **No Tailwind**: All styles are inline objects with CSS property names in camelCase or string format
3. **Icons**: Use `lucide-solid` not `lucide-react`
4. **State**: Use `createSignal` not `useState`
5. **Conditionals**: Use `<Show>` not ternary operators
6. **Loops**: Use `<For>` not `.map()`
7. **Event Handlers**: `onInput` for input fields, `onClick` for buttons
8. **Navigation**: `useNavigate()` from `@solidjs/router`
9. **Cleanup**: Use `onCleanup` for timer management

---

## Testing Checklist

For each page migration:
- [ ] All imports resolve correctly
- [ ] Page renders without errors
- [ ] Signal updates work (state changes visible)
- [ ] Event handlers fire correctly
- [ ] Lists render with `<For>`
- [ ] Conditionals work with `<Show>`
- [ ] Inline styles apply correctly
- [ ] Icons display properly
- [ ] Modal opens/closes
- [ ] Navigation links work
- [ ] Agent chat simulates responses
- [ ] Charts render (if applicable)

---

## Migration Timeline

**Estimated effort**: ~2-3 hours total (30 min per page)
- Each page follows established patterns
- Use Autopilot as reference for SolidJS patterns
- All styling is already defined (copy-paste from React code)
