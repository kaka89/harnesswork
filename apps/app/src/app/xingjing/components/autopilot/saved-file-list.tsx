import { For, Show } from 'solid-js';
import { FileText, FolderOpen, Copy, Check } from 'lucide-solid';
import { createSignal } from 'solid-js';
import { themeColors, chartColors } from '../../utils/colors';

// ─── 已保存文件项 ──────────────────────────────────────────────────────────────
export interface SavedFileItem {
  id: string;
  title: string;
  relativePath: string;
  format: 'markdown' | 'html';
  agentName: string;
  agentEmoji: string;
  savedAt: string; // "HH:mm"
}

interface SavedFileListProps {
  files: SavedFileItem[];
  workDir: string;
}

const SavedFileList = (props: SavedFileListProps) => {
  const [copiedId, setCopiedId] = createSignal<string | null>(null);

  const handleOpen = async (file: SavedFileItem) => {
    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      const fullPath = `${props.workDir}/${file.relativePath}`;
      await open(fullPath);
    } catch (e) {
      console.error('[saved-file-list] open failed:', e);
    }
  };

  const handleCopy = async (file: SavedFileItem) => {
    try {
      await navigator.clipboard.writeText(file.relativePath);
      setCopiedId(file.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  return (
    <div style={{
      width: '200px', 'flex-shrink': '0', display: 'flex', 'flex-direction': 'column',
      border: `1px solid ${themeColors.border}`, 'border-radius': '10px',
      background: themeColors.surface, overflow: 'hidden',
    }}>
      {/* 标题栏 */}
      <div style={{
        display: 'flex', 'align-items': 'center', gap: '6px',
        padding: '10px 12px 8px',
        'border-bottom': `1px solid ${themeColors.border}`,
        'flex-shrink': '0',
      }}>
        <FileText size={14} style={{ color: themeColors.textMuted }} />
        <span style={{ 'font-weight': '600', 'font-size': '12px', color: themeColors.text }}>
          已保存文件
        </span>
        <span style={{
          'font-size': '10px', color: themeColors.textMuted,
          padding: '1px 5px', 'border-radius': '8px',
          border: `1px solid ${themeColors.border}`,
        }}>
          {props.files.length}
        </span>
      </div>

      {/* 文件列表 */}
      <div style={{ flex: '1', 'overflow-y': 'auto', padding: '4px' }}>
        <For each={props.files}>
          {(file) => (
            <div style={{
              display: 'flex', 'align-items': 'flex-start', gap: '6px',
              padding: '6px 8px', 'border-radius': '6px',
              cursor: 'pointer', transition: 'background 0.15s',
            }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = themeColors.hover; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              onClick={() => handleOpen(file)}
            >
              <span style={{ 'font-size': '14px', 'flex-shrink': '0', 'margin-top': '1px' }}>
                {file.agentEmoji}
              </span>
              <div style={{ flex: '1', 'min-width': '0' }}>
                <div style={{
                  'font-size': '11px', 'font-weight': '500', color: themeColors.text,
                  overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap',
                }}>
                  {file.title}
                </div>
                <div style={{
                  'font-size': '10px', color: themeColors.textMuted,
                  overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap',
                  'margin-top': '2px',
                }}>
                  {file.relativePath}
                </div>
                <div style={{ display: 'flex', 'align-items': 'center', gap: '6px', 'margin-top': '2px' }}>
                  <span style={{ 'font-size': '9px', color: themeColors.textMuted }}>
                    {file.agentName} · {file.savedAt}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCopy(file); }}
                    title="复制路径"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: '0',
                      color: copiedId() === file.id ? chartColors.success : themeColors.textMuted,
                      display: 'flex', 'align-items': 'center',
                    }}
                  >
                    <Show when={copiedId() === file.id} fallback={<Copy size={10} />}>
                      <Check size={10} />
                    </Show>
                  </button>
                </div>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

export default SavedFileList;
