/**
 * PermissionDialog — 工具权限授权对话框
 *
 * 当 Agent 请求工具权限时显示，含 30 秒倒计时。
 * 倒计时归零自动触发"允许一次"。
 */
import { createSignal, onMount, onCleanup } from 'solid-js';
import { ShieldQuestion, Clock } from 'lucide-solid';
import { themeColors } from '../../utils/colors';
import { getXingjingClient } from '../../services/opencode-client';

export interface PermissionRequest {
  permissionId: string;
  sessionId: string;
  tool?: string;
  description?: string;
  input?: string;
  resolve: (action: 'once' | 'always' | 'reject') => void;
}

interface PermissionDialogProps {
  request: PermissionRequest;
  onResolve: (action: 'once' | 'always' | 'reject') => void;
}

const COUNTDOWN_SECONDS = 30;

const PermissionDialog = (props: PermissionDialogProps) => {
  const [countdown, setCountdown] = createSignal(COUNTDOWN_SECONDS);

  // 通过 OpenCode SDK 响应权限请求，同时通知上层组件
  const handleResolve = async (action: 'once' | 'always' | 'reject') => {
    try {
      const client = getXingjingClient();
      await (client.permission as any).reply({
        requestID: props.request.permissionId,
        reply: action === 'reject' ? 'deny' : action,
      });
    } catch (e) {
      console.warn('[xingjing] permission reply failed:', e);
    }
    props.onResolve(action);
  };

  // 倒计时驱动：每秒递减，归零时自动允许一次
  onMount(() => {
    const timer = setInterval(() => {
      setCountdown((n: number) => {
        if (n <= 1) {
          props.onResolve('once');
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    onCleanup(() => clearInterval(timer));
  });

  const progress = () => (countdown() / COUNTDOWN_SECONDS) * 100;
  const toolLabel = () => props.request.tool ?? '工具调用';
  const descLabel = () => props.request.description ?? '模型需要执行一个工具操作';
  const inputLabel = () => props.request.input ?? '';

  return (
    // 全屏遮罩
    <div
      style={{
        position: 'fixed',
        inset: '0',
        'z-index': '10000',
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
      }}
    >
      {/* 对话框 */}
      <div
        style={{
          width: '440px',
          background: themeColors.surface,
          'border-radius': '12px',
          'box-shadow': '0 24px 64px rgba(0,0,0,0.25)',
          padding: '24px',
          display: 'flex',
          'flex-direction': 'column',
          gap: '16px',
        }}
      >
        {/* 标题 */}
        <div style={{ display: 'flex', 'align-items': 'center', gap: '10px' }}>
          <ShieldQuestion size={20} color={themeColors.primary} />
          <span style={{ 'font-size': '16px', 'font-weight': '600', color: themeColors.text }}>
            Agent 请求工具权限
          </span>
        </div>

        {/* 权限详情 */}
        <div
          style={{
            background: themeColors.backgroundSecondary,
            'border-radius': '8px',
            padding: '12px 14px',
            display: 'flex',
            'flex-direction': 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', 'align-items': 'center' }}>
            <span style={{ 'font-size': '12px', color: themeColors.textMuted, 'min-width': '36px' }}>工具</span>
            <span
              style={{
                'font-size': '13px',
                'font-weight': '600',
                color: themeColors.primary,
                background: themeColors.primaryLight,
                padding: '2px 8px',
                'border-radius': '4px',
              }}
            >
              {toolLabel()}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span style={{ 'font-size': '12px', color: themeColors.textMuted, 'min-width': '36px' }}>描述</span>
            <span style={{ 'font-size': '13px', color: themeColors.text }}>{descLabel()}</span>
          </div>
          {inputLabel() && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ 'font-size': '12px', color: themeColors.textMuted, 'min-width': '36px' }}>内容</span>
              <span
                style={{
                  'font-size': '12px',
                  color: themeColors.textSecondary,
                  'font-family': 'monospace',
                  'word-break': 'break-all',
                }}
              >
                {inputLabel()}
              </span>
            </div>
          )}
        </div>

        {/* 倒计时提示 */}
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
          <div style={{ display: 'flex', 'justify-content': 'space-between', 'align-items': 'center' }}>
            <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
              <Clock size={13} color={themeColors.textMuted} />
              <span style={{ 'font-size': '12px', color: themeColors.textMuted }}>
                Agent 执行已暂停，请确认是否允许
              </span>
            </div>
            <span style={{ 'font-size': '12px', color: countdown() <= 5 ? themeColors.warning : themeColors.textMuted }}>
              将在 {countdown()}s 后自动允许
            </span>
          </div>
          {/* 进度条 */}
          <div
            style={{
              height: '4px',
              background: themeColors.borderLight,
              'border-radius': '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${progress()}%`,
                background: countdown() <= 5 ? themeColors.warning : themeColors.primary,
                'border-radius': '2px',
                transition: 'width 0.9s linear',
              }}
            />
          </div>
        </div>

        {/* 操作按钮 */}
        <div style={{ display: 'flex', gap: '8px', 'justify-content': 'flex-end' }}>
          <button
            onClick={() => handleResolve('reject')}
            style={{
              padding: '7px 16px',
              'border-radius': '6px',
              border: `1px solid ${themeColors.border}`,
              background: 'transparent',
              color: themeColors.textSecondary,
              'font-size': '13px',
              cursor: 'pointer',
            }}
          >
            拒绝
          </button>
          <button
            onClick={() => handleResolve('once')}
            style={{
              padding: '7px 16px',
              'border-radius': '6px',
              border: `1px solid ${themeColors.primaryBorder}`,
              background: themeColors.primaryLight,
              color: themeColors.primary,
              'font-size': '13px',
              cursor: 'pointer',
              'font-weight': '500',
            }}
          >
            允许一次
          </button>
          <button
            onClick={() => handleResolve('always')}
            style={{
              padding: '7px 16px',
              'border-radius': '6px',
              border: 'none',
              background: themeColors.primary,
              color: '#fff',
              'font-size': '13px',
              cursor: 'pointer',
              'font-weight': '500',
            }}
          >
            始终允许本次会话
          </button>
        </div>
      </div>
    </div>
  );
};

export default PermissionDialog;
