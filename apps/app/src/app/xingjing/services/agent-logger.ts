/**
 * Agent 调用日志服务
 *
 * 将每次 callAgent 调用写入 ~/.xingjing/logs/agent-calls-YYYY-MM-DD.log
 * 每行一条 JSON 记录（NDJSON）。
 * 在非 Tauri 环境下降级到 console.log。
 */
import { isTauriRuntime } from '../../utils';

export interface AgentLogEntry {
  /** ISO 时间戳 */
  ts: string;
  /** 调用路径：opencode = 通过 OpenCode，direct-api = 直连 LLM API */
  path: 'opencode' | 'direct-api';
  /** 是否成功 */
  success: boolean;
  /** 耗时（毫秒） */
  durationMs: number;
  /** 使用的 provider ID（如 deepseek、openai） */
  provider?: string;
  /** 使用的 model ID（如 deepseek-chat） */
  model?: string;
  /** prompt 字符数（system + user） */
  promptLen?: number;
  /** 响应字符数 */
  responseLen?: number;
  /** 触发降级的原因（仅 direct-api 时有） */
  fallbackReason?: string;
  /** 错误信息（失败时有） */
  error?: string;
  /** 会话标题 */
  title?: string;
  /** 当前产品名称 */
  product?: string;
}

/**
 * 将一条调用日志异步追加写入日志文件。
 * 本函数永不抛出异常（日志为尽力而为）。
 */
export async function appendAgentLog(entry: AgentLogEntry): Promise<void> {
  const line = JSON.stringify(entry);
  if (isTauriRuntime()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('xingjing_append_log', { line });
    } catch (e) {
      console.warn('[agent-logger] 写入日志失败（Tauri invoke）:', e);
    }
  } else {
    // 浏览器模式：输出到 console（方便开发调试）
    console.log('[agent-log]', line);
  }
}
