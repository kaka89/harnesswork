/**
 * 用户反馈卡片组件
 * 展示单条用户反馈：用户名 + 渠道标签 + 情感色标 + 内容摘要 + 日期
 */
import { Component, createSignal, Show } from 'solid-js';
import type { SoloUserFeedback } from '../../services/file-store';
import { themeColors } from '../../utils/colors';

const SENTIMENT_CONFIG: Record<string, { label: string; bg: string; color: string; icon: string }> = {
  positive: { label: '正面', bg: '#f6ffed', color: '#389e0d', icon: '😊' },
  negative: { label: '负面', bg: '#fff2f0', color: '#cf1322', icon: '😟' },
  neutral:  { label: '中性', bg: '#f5f5f5', color: '#595959', icon: '😐' },
};

const CHANNEL_CONFIG: Record<string, { bg: string; color: string }> = {
  'Product Hunt': { bg: '#fff7e6', color: '#d46b08' },
  'Twitter':      { bg: '#e6f4ff', color: '#0958d9' },
  'In-app':       { bg: '#f9f0ff', color: '#722ed1' },
  'Email':        { bg: '#f5f5f5', color: '#595959' },
};

interface FeedbackCardProps {
  feedback: SoloUserFeedback;
}

const FeedbackCard: Component<FeedbackCardProps> = (props) => {
  const [expanded, setExpanded] = createSignal(false);

  const sentiment = () => SENTIMENT_CONFIG[props.feedback.sentiment] ?? SENTIMENT_CONFIG.neutral;
  const channel = () => CHANNEL_CONFIG[props.feedback.channel] ?? CHANNEL_CONFIG.Email;
  const content = () => props.feedback.content ?? '';
  const isLong = () => content().length > 80;

  return (
    <div
      style={{
        'border-radius': '12px',
        border: `1px solid ${themeColors.borderLight}`,
        padding: '14px 16px',
        cursor: isLong() ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s',
        background: themeColors.surface,
      }}
      onClick={() => isLong() && setExpanded((v) => !v)}
    >
      {/* Header: user + channel + sentiment */}
      <div style={{ display: 'flex', 'align-items': 'center', gap: '8px', 'margin-bottom': '8px', 'flex-wrap': 'wrap' }}>
        <span style={{ 'font-weight': 600, 'font-size': '13px', color: themeColors.text }}>
          {props.feedback.user}
        </span>
        <span style={{
          'font-size': '11px', padding: '1px 6px', 'border-radius': '4px',
          background: channel().bg, color: channel().color,
        }}>
          {props.feedback.channel}
        </span>
        <span style={{
          'font-size': '11px', padding: '1px 6px', 'border-radius': '4px',
          background: sentiment().bg, color: sentiment().color,
        }}>
          {sentiment().icon} {sentiment().label}
        </span>
        <span style={{ 'margin-left': 'auto', 'font-size': '11px', color: themeColors.textMuted }}>
          {props.feedback.date}
        </span>
      </div>

      {/* Content */}
      <div style={{
        'font-size': '13px', color: themeColors.textSecondary, 'line-height': '1.6',
        ...(expanded() ? {} : { 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis' }),
      }}>
        {content() || '（无内容）'}
      </div>

      <Show when={isLong()}>
        <div style={{ 'font-size': '11px', color: themeColors.textMuted, 'margin-top': '4px' }}>
          {expanded() ? '点击收起' : '点击展开全文 →'}
        </div>
      </Show>
    </div>
  );
};

export default FeedbackCard;
