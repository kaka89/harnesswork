import { Component, createSignal, onMount } from 'solid-js';
import { commitNow, pushToRemote, getGitStatus, type GitStatus } from '../../services/git-sync';
import { themeColors, chartColors } from '../../utils/colors';

export interface GitStatusBadgeProps {
  workDir: () => string | undefined;
}

/**
 * Git 状态徽章组件
 * - 显示未提交变更数
 * - "同步到 Git" 按钮触发 commitNow + 可选 pushToRemote
 */
const GitStatusBadge: Component<GitStatusBadgeProps> = (props) => {
  const [status, setStatus] = createSignal<GitStatus>({ uncommittedCount: 0, hasRemote: false });
  const [syncing, setSyncing] = createSignal(false);
  const [toast, setToast] = createSignal<string | null>(null);

  const refreshStatus = async () => {
    const wd = props.workDir();
    if (!wd) return;
    const st = await getGitStatus(wd);
    setStatus(st);
  };

  onMount(() => void refreshStatus());

  const handleSync = async () => {
    const wd = props.workDir();
    if (!wd) return;
    setSyncing(true);
    setToast(null);
    try {
      const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const result = await commitNow(wd, `chore: sync product files ${timestamp}`);
      if (result.success) {
        // 如果有远端，尝试 push
        if (status().hasRemote) {
          const pushResult = await pushToRemote(wd);
          if (pushResult.success) {
            showToast('已同步到 Git 远端');
          } else {
            showToast(`已提交（${result.hash}），推送失败: ${pushResult.error}`);
          }
        } else {
          showToast(`已提交: ${result.hash ?? 'OK'}`);
        }
      } else {
        showToast(result.error ?? '提交失败');
      }
      await refreshStatus();
    } finally {
      setSyncing(false);
    }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', position: 'relative' }}>
      {/* Uncommitted count badge */}
      {status().uncommittedCount > 0 && (
        <span style={{
          'font-size': '11px', padding: '2px 8px', 'border-radius': '9999px',
          background: themeColors.warningBg, color: themeColors.warningDark,
        }}>
          ● {status().uncommittedCount} 未提交
        </span>
      )}

      {/* Sync button */}
      <button
        onClick={handleSync}
        disabled={syncing()}
        style={{
          padding: '4px 10px', 'font-size': '12px', 'border-radius': '6px',
          border: `1px solid ${themeColors.border}`, background: 'transparent',
          color: syncing() ? themeColors.textMuted : chartColors.primary,
          cursor: syncing() ? 'not-allowed' : 'pointer',
          opacity: syncing() ? 0.6 : 1, transition: 'opacity 0.2s',
        }}
      >
        {syncing() ? '⟳ 同步中...' : '↑ 同步到 Git'}
      </button>

      {/* Toast */}
      {toast() && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, 'margin-top': '8px',
          padding: '6px 12px', 'border-radius': '6px', 'white-space': 'nowrap',
          background: themeColors.surface, border: `1px solid ${themeColors.border}`,
          'font-size': '12px', color: themeColors.textSecondary,
          'box-shadow': '0 4px 12px rgba(0,0,0,0.1)', 'z-index': 100,
        }}>
          {toast()}
        </div>
      )}
    </div>
  );
};

export default GitStatusBadge;
