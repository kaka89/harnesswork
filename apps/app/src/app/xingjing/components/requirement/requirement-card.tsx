import { Component, Show } from 'solid-js';
import type { SoloRequirementOutput, SoloProductFeature, RequirementStatus } from '../../services/file-store';
import { themeColors, chartColors } from '../../utils/colors';

// ─── Status config ──────────────────────────────────────────────────────────

const statusConfig: Record<RequirementStatus, { label: string; bg: string; color: string }> = {
  draft:    { label: '草稿',   bg: themeColors.hover,      color: themeColors.textSecondary },
  review:   { label: '审核中', bg: themeColors.warningBg,  color: themeColors.warningDark },
  accepted: { label: '已确认', bg: themeColors.primaryBg,  color: chartColors.primary },
  'in-dev': { label: '研发中', bg: themeColors.purpleBg,   color: themeColors.purple },
  done:     { label: '已完成', bg: themeColors.successBg,  color: chartColors.success },
  rejected: { label: '已否决', bg: '#fff1f0',             color: '#cf1322' },
};

const priorityConfig: Record<string, { bg: string; color: string }> = {
  P0: { bg: '#fff1f0', color: '#cf1322' },
  P1: { bg: themeColors.warningBg, color: themeColors.warningDark },
  P2: { bg: themeColors.primaryBg, color: chartColors.primary },
  P3: { bg: themeColors.hover, color: themeColors.textSecondary },
};

// ─── Props ──────────────────────────────────────────────────────────────────

export interface RequirementCardProps {
  requirement: SoloRequirementOutput;
  features: SoloProductFeature[];
  onStatusChange: (id: string, status: RequirementStatus) => void;
  onPushToDev: (requirement: SoloRequirementOutput) => void;
}

// ─── Component ──────────────────────────────────────────────────────────────

const RequirementCard: Component<RequirementCardProps> = (props) => {
  const featureName = () => {
    if (!props.requirement.linkedFeatureId) return null;
    const feat = props.features.find((f) => f.id === props.requirement.linkedFeatureId);
    return feat ? (feat.title ?? feat.name) : props.requirement.linkedFeatureId;
  };

  const status = () => props.requirement.status ?? 'draft';
  const sCfg = () => statusConfig[status()] ?? statusConfig.draft;
  const pCfg = () => priorityConfig[props.requirement.priority] ?? priorityConfig.P3;

  const canConfirm = () => status() === 'draft' || status() === 'review';
  const canPush = () => status() === 'accepted';
  const canReject = () => status() === 'draft' || status() === 'review';

  return (
    <div style={{
      'border-radius': '12px',
      border: `1px solid ${themeColors.borderLight}`,
      padding: '14px 16px',
      background: themeColors.surface,
      transition: 'border-color 0.2s',
    }}>
      {/* Header: title + badges */}
      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '8px', 'flex-wrap': 'wrap' }}>
        <span style={{ 'font-weight': 600, 'font-size': '14px', color: themeColors.text, flex: 1, 'min-width': '120px' }}>
          {props.requirement.title}
        </span>
        <span style={{ 'font-size': '11px', padding: '2px 8px', 'border-radius': '4px', background: pCfg().bg, color: pCfg().color, 'font-weight': 500 }}>
          {props.requirement.priority}
        </span>
        <span style={{ 'font-size': '11px', padding: '2px 8px', 'border-radius': '4px', background: sCfg().bg, color: sCfg().color, 'font-weight': 500 }}>
          {sCfg().label}
        </span>
      </div>

      {/* Meta info */}
      <div style={{ display: 'flex', gap: '12px', 'flex-wrap': 'wrap', 'margin-bottom': '8px', 'font-size': '12px', color: themeColors.textMuted }}>
        <Show when={featureName()}>
          <span>📦 {featureName()}</span>
        </Show>
        <Show when={props.requirement.linkedHypothesis}>
          <span>💡 假设: {props.requirement.linkedHypothesis}</span>
        </Show>
        <span>创建: {props.requirement.createdAt?.slice(0, 10)}</span>
      </div>

      {/* Content preview */}
      <Show when={props.requirement.content}>
        <div style={{
          'font-size': '13px',
          color: themeColors.textSecondary,
          'margin-bottom': '10px',
          'max-height': '60px',
          overflow: 'hidden',
          'text-overflow': 'ellipsis',
          'white-space': 'pre-wrap',
        }}>
          {props.requirement.content.slice(0, 150)}{props.requirement.content.length > 150 ? '...' : ''}
        </div>
      </Show>

      {/* Linked tasks info */}
      <Show when={props.requirement.linkedTaskIds && props.requirement.linkedTaskIds.length > 0}>
        <div style={{ 'font-size': '12px', color: themeColors.textMuted, 'margin-bottom': '10px' }}>
          已关联任务: {props.requirement.linkedTaskIds!.length} 个
        </div>
      </Show>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', 'flex-wrap': 'wrap' }}>
        <Show when={canConfirm()}>
          <button
            style={{
              padding: '4px 12px', 'font-size': '12px', 'border-radius': '6px',
              border: `1px solid ${chartColors.success}`, background: themeColors.successBg,
              color: chartColors.success, cursor: 'pointer',
            }}
            onClick={() => props.onStatusChange(props.requirement.id, 'accepted')}
          >
            ✅ 确认需求
          </button>
        </Show>
        <Show when={canPush()}>
          <button
            style={{
              padding: '4px 12px', 'font-size': '12px', 'border-radius': '6px',
              border: `1px solid ${chartColors.primary}`, background: themeColors.primaryBg,
              color: chartColors.primary, cursor: 'pointer',
            }}
            onClick={() => props.onPushToDev(props.requirement)}
          >
            🚀 推送至研发
          </button>
        </Show>
        <Show when={canReject()}>
          <button
            style={{
              padding: '4px 12px', 'font-size': '12px', 'border-radius': '6px',
              border: `1px solid ${themeColors.border}`, background: 'transparent',
              color: themeColors.textMuted, cursor: 'pointer',
            }}
            onClick={() => props.onStatusChange(props.requirement.id, 'rejected')}
          >
            ❌ 否决
          </button>
        </Show>
      </div>
    </div>
  );
};

export default RequirementCard;
