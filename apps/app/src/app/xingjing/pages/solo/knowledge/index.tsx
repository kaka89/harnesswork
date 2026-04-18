/**
 * 星静独立版 · 产品知识库页面
 *
 * 三栏布局：左侧文档树 | 中央阅读器/网格 | 右侧关联面板
 * 支持四源统一浏览：产品文档 / 迭代记录 / 个人笔记 / 行为知识
 * 提供 AI 使用路径：发送给AI / 启动 Autopilot / 复制引用
 */
import { Component, createSignal, createEffect, Show } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import {
  buildKnowledgeIndex, groupEntriesForTree,
  searchKnowledge, type KnowledgeEntry, type KnowledgeIndex, type KnowledgeTreeGroup,
} from '../../../services/knowledge-index';
import { checkKnowledgeHealth, type KnowledgeHealthScore } from '../../../services/knowledge-health';
import { saveSoloKnowledge, type SoloKnowledgeCategory, type SoloKnowledgeItem } from '../../../services/file-store';
import { invalidateKnowledgeCache } from '../../../services/knowledge-retrieval';
import { scanWorkspaceDocs } from '../../../services/knowledge-scanner';
import type { SkillApiAdapter } from '../../../services/knowledge-behavior';
import { useAppStore } from '../../../stores/app-store';
import { themeColors, chartColors } from '../../../utils/colors';

// Components
import KnowledgeTreeNav from '../../../components/knowledge/knowledge-tree-nav';
import KnowledgeDocViewer from '../../../components/knowledge/knowledge-doc-viewer';
import KnowledgeGridView from '../../../components/knowledge/knowledge-grid-view';
import DocRelationPanel from '../../../components/knowledge/doc-relation-panel';
import KnowledgeSearchBar, { type KnowledgeSourceFilter } from '../../../components/knowledge/knowledge-search-bar';
import KnowledgeHealthDashboard from '../../../components/knowledge/knowledge-health-dashboard';
import QuickAITaskDialog from '../../../components/knowledge/quick-ai-task-dialog';
import CreateNoteModal from '../../../components/knowledge/create-note-modal';

const SoloKnowledge: Component = () => {
  const { productStore, actions } = useAppStore();
  const navigate = useNavigate();

  // ── 核心状态 ──────────────────────────────────────────────────────────────
  const [index, setIndex] = createSignal<KnowledgeIndex | null>(null);
  const [groups, setGroups] = createSignal<KnowledgeTreeGroup[]>([]);
  const [allEntries, setAllEntries] = createSignal<KnowledgeEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = createSignal<KnowledgeEntry | null>(null);
  const [indexLoading, setIndexLoading] = createSignal(true);

  // ── 搜索状态 ──────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = createSignal('');
  const [sourceFilter, setSourceFilter] = createSignal<KnowledgeSourceFilter>('all');
  const [docTypeFilter, setDocTypeFilter] = createSignal<string | null>(null);
  const [sceneFilter, setSceneFilter] = createSignal<string | null>(null);
  const [searchResults, setSearchResults] = createSignal<KnowledgeEntry[]>([]);

  // ── 健康度 ────────────────────────────────────────────────────────────────
  const [health, setHealth] = createSignal<KnowledgeHealthScore | null>(null);
  const [healthLoading, setHealthLoading] = createSignal(false);

  // ── AI 任务对话框 ─────────────────────────────────────────────────────────
  const [autopilotEntry, setAutopilotEntry] = createSignal<KnowledgeEntry | null>(null);

  // ── 笔记创建状态 ───────────────────────────────────────────────────────────
  const [createNoteCategory, setCreateNoteCategory] = createSignal<SoloKnowledgeCategory | null>(null);

  // ── 通知 toast ────────────────────────────────────────────────────────────
  const [toast, setToast] = createSignal<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const showToast = (msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => setToast(null), 2500);
  };

  // ── SkillApiAdapter ───────────────────────────────────────────────────────
  const skillApi: SkillApiAdapter = {
    listSkills: () => actions.listOpenworkSkills(),
    getSkill: (name) => actions.getOpenworkSkill(name),
    upsertSkill: (name, content, desc) => actions.upsertOpenworkSkill(name, content, desc),
  };

  // ── 索引加载 ──────────────────────────────────────────────────────────────

  const loadIndex = async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) { setIndexLoading(false); return; }

    setIndexLoading(true);
    try {
      // dir-graph 扫描 + 行为知识 → 构建索引
      const scannedDocs = await scanWorkspaceDocs(workDir);
      const fresh = await buildKnowledgeIndex(workDir, skillApi, scannedDocs);
      applyIndex(fresh);
    } catch (e) {
      console.warn('[knowledge] index build failed', e);
    } finally {
      setIndexLoading(false);
    }
  };

  const applyIndex = (idx: KnowledgeIndex) => {
    setIndex(idx);
    setAllEntries(idx.entries);
    setGroups(groupEntriesForTree(idx));
  };

  const handleRefresh = async () => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    invalidateKnowledgeCache();
    await loadIndex();
    // 健康度也刷新
    if (index()) {
      setHealthLoading(true);
      checkKnowledgeHealth(workDir, index()!).then(setHealth).finally(() => setHealthLoading(false));
    }
  };

  // ── 健康度检查 ────────────────────────────────────────────────────────────
  createEffect(() => {
    const idx = index();
    const workDir = productStore.activeProduct()?.workDir;
    if (!idx || !workDir) return;
    setHealthLoading(true);
    checkKnowledgeHealth(workDir, idx).then(setHealth).finally(() => setHealthLoading(false));
  });

  // ── 搜索 ──────────────────────────────────────────────────────────────────
  createEffect(() => {
    const q = searchQuery();
    const idx = index();
    const dt = docTypeFilter();
    const sc = sceneFilter();

    // 无查询词且无高级过滤时清空结果
    if (!q.trim() && !dt && !sc) {
      setSearchResults([]);
      return;
    }
    if (!idx) { setSearchResults([]); return; }

    const results = searchKnowledge(idx, {
      query: q || '',
      targetDocType: dt ?? undefined,
      scene: sc ?? undefined,
    }, 50);
    setSearchResults(results);
  });

  // ── 响应式加载（activeProduct 变化时自动刷新） ─────────────────────────────
  createEffect(() => {
    const workDir = productStore.activeProduct()?.workDir;
    if (workDir) { loadIndex(); }
  });

  // ── 显示的条目列表（搜索 or 全量） ────────────────────────────────────────
  const displayEntries = () =>
    (searchQuery().trim() || docTypeFilter() || sceneFilter()) ? searchResults() : allEntries();

  // ── 选中一个条目 ──────────────────────────────────────────────────────────
  const handleSelect = (entry: KnowledgeEntry) => {
    setSelectedEntry(entry);
    setSearchQuery(''); // 选中后清除搜索
  };

  // ── AI 路径处理 ───────────────────────────────────────────────────────────
  const handleSendToAI = (entry: KnowledgeEntry) => {
    navigate('/solo/autopilot', { state: { preloadKnowledge: `[${entry.docType ?? entry.category}] ${entry.title}\n\n${entry.summary}` } });
  };

  const handleStartAutopilot = (entry: KnowledgeEntry) => {
    setAutopilotEntry(entry);
  };

  const handleAutopilotConfirm = (prompt: string, entry: KnowledgeEntry) => {
    setAutopilotEntry(null);
    navigate('/solo/autopilot', { state: { goal: prompt, preloadKnowledge: `[${entry.docType ?? entry.category}] ${entry.title}\n\n${entry.summary}` } });
  };

  const handleCopyRef = (entry: KnowledgeEntry) => {
    const ref = `[${entry.docType ?? entry.category}@${entry.layer ?? 'app'} ${entry.title}]`;
    navigator.clipboard.writeText(ref).then(() => showToast('引用已复制')).catch(() => showToast(ref));
  };

  const handleViewSession = (sessionId: string) => {
    navigate('/solo/autopilot', { state: { viewSessionId: sessionId } });
  };

  // ── 创建笔记 ──────────────────────────────────────────────────────────────
  const handleCreateNote = (category: SoloKnowledgeCategory) => {
    setCreateNoteCategory(category);
  };

  const handleNoteSave = async (item: SoloKnowledgeItem) => {
    const workDir = productStore.activeProduct()?.workDir;
    if (!workDir) return;
    const ok = await saveSoloKnowledge(workDir, item);
    if (ok) {
      setCreateNoteCategory(null);
      showToast('笔记已保存');
      invalidateKnowledgeCache();
      await loadIndex();
    } else {
      showToast('保存失败');
    }
  };

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', height: '100%', background: '#f8f9fa', overflow: 'hidden' }}>

      {/* ── 顶部搜索 + 健康度 ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'flex-shrink': 0 }}>
        <div style={{ flex: 1 }}>
          <KnowledgeSearchBar
            value={searchQuery()}
            sourceFilter={sourceFilter()}
            docTypeFilter={docTypeFilter()}
            sceneFilter={sceneFilter()}
            onSearch={setSearchQuery}
            onSourceChange={setSourceFilter}
            onDocTypeChange={setDocTypeFilter}
            onSceneChange={setSceneFilter}
            onClear={() => setSearchQuery('')}
            totalCount={allEntries().length}
            resultCount={searchResults().length}
          />
        </div>
        <div style={{ padding: '0 12px', 'flex-shrink': 0 }}>
          <KnowledgeHealthDashboard health={health()} loading={healthLoading()} />
        </div>
      </div>

      {/* ── 三栏主体 ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', 'min-height': 0 }}>

        {/* 左侧：文档树 (240px) */}
        <div style={{
          width: '240px', 'flex-shrink': 0,
          background: 'white', 'border-right': `1px solid ${themeColors.border}`,
          display: 'flex', 'flex-direction': 'column', overflow: 'hidden',
        }}>
          <KnowledgeTreeNav
            groups={groups()}
            selectedId={selectedEntry()?.id ?? null}
            loading={indexLoading()}
            onSelect={handleSelect}
            onCreateNote={handleCreateNote}
            onRefresh={handleRefresh}
          />
        </div>

        {/* 中央：阅读器 or 网格 (flex-1) */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', 'flex-direction': 'column', 'min-width': 0 }}>
          <Show
            when={selectedEntry()}
            fallback={
              <KnowledgeGridView
                entries={displayEntries()}
                sourceFilter={sourceFilter()}
                onSelect={handleSelect}
                onSendToAI={handleSendToAI}
              />
            }
          >
            <KnowledgeDocViewer
              entry={selectedEntry()!}
              workDir={productStore.activeProduct()?.workDir ?? ''}
              allEntries={allEntries()}
              onNavigate={(id) => {
                const e = allEntries().find((x) => x.id === id);
                if (e) setSelectedEntry(e);
              }}
              onBack={() => setSelectedEntry(null)}
            />
          </Show>
        </div>

        {/* 右侧：关联面板 (280px) */}
        <div style={{
          width: '260px', 'flex-shrink': 0,
          background: 'white', 'border-left': `1px solid ${themeColors.border}`,
          overflow: 'hidden',
        }}>
          <DocRelationPanel
            entry={selectedEntry()}
            allEntries={allEntries()}
            onNavigate={(id) => {
              const e = allEntries().find((x) => x.id === id);
              if (e) setSelectedEntry(e);
            }}
            onSendToAI={handleSendToAI}
            onStartAutopilot={handleStartAutopilot}
            onCopyRef={handleCopyRef}
            onViewSession={handleViewSession}
          />
        </div>
      </div>

      {/* ── Toast 通知 ──────────────────────────────────────────────────── */}
      <Show when={toast()}>
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          background: '#1f2937', color: 'white', padding: '8px 16px', 'border-radius': '8px',
          'font-size': '13px', 'z-index': 9999, 'box-shadow': '0 4px 12px rgba(0,0,0,0.2)',
        }}>
          {toast()}
        </div>
      </Show>

      {/* ── Autopilot 快速任务对话框 ────────────────────────────────────── */}
      <Show when={autopilotEntry()}>
        <QuickAITaskDialog
          entry={autopilotEntry()!}
          onConfirm={handleAutopilotConfirm}
          onClose={() => setAutopilotEntry(null)}
        />
      </Show>

      {/* ── 创建笔记 Modal ────────────────────────────────────────────── */}
      <Show when={createNoteCategory()}>
        <CreateNoteModal
          initialCategory={createNoteCategory()!}
          onSave={handleNoteSave}
          onClose={() => setCreateNoteCategory(null)}
        />
      </Show>

    </div>
  );
};

export default SoloKnowledge;
