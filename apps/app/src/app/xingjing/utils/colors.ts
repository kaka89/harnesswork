/**
 * Theme Colors Utility
 * Centralized color management using CSS variables
 * Replaces hardcoded color values throughout the application
 */

export const themeColors = {
  // Primary colors
  primary: 'var(--blue-9)',
  primaryLight: 'var(--dls-info-border)',
  primaryBg: 'var(--dls-info-bg)',
  primaryBorder: 'var(--dls-info-border)',

  // Success colors
  success: 'var(--green-9)',
  successLight: 'var(--green-11)',
  successBg: 'var(--dls-success-bg)',
  successBorder: 'var(--dls-success-border)',

  // Warning colors
  warning: '#faad14',
  warningDark: '#d48806',
  warningBg: 'var(--dls-warning-bg)',
  warningBorder: '#ffd591',

  // Error colors
  error: '#ff4d4f',
  errorBg: '#fff2f0',
  errorBorder: '#ffccc7',

  // Brand colors
  purple: 'var(--purple-9)',
  purpleLight: 'var(--purple-11)',
  purpleBg: 'var(--purple-3)',
  purpleBorder: 'var(--purple-7)',

  // Neutral colors
  border: 'var(--dls-border)',
  borderLight: 'var(--dls-border-light)',
  text: 'var(--dls-text-primary)',
  textPrimary: 'var(--dls-text-primary)',
  textSecondary: 'var(--dls-text-secondary)',
  textMuted: 'var(--dls-text-muted)',
  surface: 'var(--dls-surface)',
  surfaceOverlay: 'var(--dls-surface-overlay)',
  bgSubtle: 'var(--dls-bg-subtle)',
  cardBg: 'var(--dls-card-bg)',
  appBg: 'var(--dls-app-bg)',
  hover: 'var(--dls-hover)',
  backgroundSecondary: 'var(--dls-bg-subtle)',

  // Specific colors
  cyan: '#08979c',

  // Gray scale
  gray1: 'var(--gray-1)',
  gray2: 'var(--gray-2)',
  gray3: 'var(--gray-3)',
  gray4: 'var(--gray-4)',
  gray5: 'var(--gray-5)',
  gray6: 'var(--gray-6)',
  gray9: 'var(--gray-9)',
  gray10: 'var(--gray-10)',
  gray11: 'var(--gray-11)',
  gray12: 'var(--gray-12)',
} as const;

/**
 * Get color based on status
 */
export const getStatusColor = (status: string): string => {
  const map: Record<string, string> = {
    // Success states
    success: themeColors.success,
    done: themeColors.success,
    passed: themeColors.success,
    completed: themeColors.success,
    resolved: themeColors.success,
    healthy: themeColors.success,

    // Warning states
    warning: themeColors.warning,
    pending: themeColors.warning,
    acknowledged: themeColors.warning,
    degraded: themeColors.warning,

    // Error states
    error: themeColors.error,
    failed: themeColors.error,
    firing: themeColors.error,
    down: themeColors.error,

    // Processing states
    running: themeColors.primary,
    processing: themeColors.primary,
    'in-progress': themeColors.primary,
    'in-dev': themeColors.primary,
    'in-review': themeColors.primary,

    // Idle states
    idle: themeColors.textMuted,
    waiting: themeColors.textMuted,
    default: themeColors.textMuted,
  };

  return map[status.toLowerCase()] || themeColors.textSecondary;
};

/**
 * Get background color based on status
 */
export const getStatusBgColor = (status: string): string => {
  const map: Record<string, string> = {
    success: themeColors.successBg,
    done: themeColors.successBg,
    passed: themeColors.successBg,
    completed: themeColors.successBg,
    resolved: themeColors.successBg,

    warning: themeColors.warningBg,
    pending: themeColors.warningBg,
    acknowledged: themeColors.warningBg,

    error: themeColors.errorBg,
    failed: themeColors.errorBg,
    firing: themeColors.errorBg,

    running: themeColors.primaryBg,
    processing: themeColors.primaryBg,
    'in-progress': themeColors.primaryBg,
  };

  return map[status.toLowerCase()] || 'transparent';
};

/**
 * Get border color based on status
 */
export const getStatusBorderColor = (status: string): string => {
  const map: Record<string, string> = {
    success: themeColors.successBorder,
    done: themeColors.successBorder,
    passed: themeColors.successBorder,

    warning: themeColors.warningBorder,
    pending: themeColors.warningBorder,

    error: themeColors.errorBorder,
    failed: themeColors.errorBorder,

    running: themeColors.primaryBorder,
    processing: themeColors.primaryBorder,
  };

  return map[status.toLowerCase()] || themeColors.border;
};

/**
 * Get priority color
 */
export const getPriorityColor = (priority: string): string => {
  const map: Record<string, string> = {
    P0: themeColors.error,
    P1: themeColors.warning,
    P2: themeColors.primary,
    P3: themeColors.textSecondary,
  };

  return map[priority] || themeColors.textSecondary;
};

/**
 * Get priority background color
 */
export const getPriorityBgColor = (priority: string): string => {
  const map: Record<string, string> = {
    P0: themeColors.errorBg,
    P1: themeColors.warningBg,
    P2: themeColors.primaryBg,
    P3: 'var(--gray-3)',
  };

  return map[priority] || 'transparent';
};

/**
 * Get category color (for Agent Workshop)
 */
export const getCategoryColor = (category: string): string => {
  const map: Record<string, string> = {
    产品: themeColors.primary,
    架构: themeColors.purple,
    开发: '#08979c',
    质量: '#d46b08',
    运维: themeColors.success,
    管理: themeColors.error,
  };

  return map[category] || themeColors.textSecondary;
};

/**
 * Chart colors for ECharts
 */
export const chartColors = {
  primary: themeColors.primary,
  purple: themeColors.purple,
  success: themeColors.success,
  warning: themeColors.warning,
  error: themeColors.error,
  cyan: '#08979c',
  orange: '#d46b08',
} as const;

/**
 * Get chart color by index
 */
export const getChartColor = (index: number): string => {
  const colors = Object.values(chartColors);
  return colors[index % colors.length];
};
