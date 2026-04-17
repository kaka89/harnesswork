/**
 * useOpenCodeStatus — 检测 OpenCode 服务连接状态的 SolidJS hook
 *
 * 通过定时 ping OpenCode 服务端 /config/providers 端点判断是否可达。
 * 首次挂载立即检测，之后每 10 秒轮询一次。
 */

import { createSignal, onMount, onCleanup } from 'solid-js';
import { getXingjingClient } from '../services/opencode-client';

export type OpenCodeStatus = 'connected' | 'disconnected';

const POLL_INTERVAL = 10_000; // 10 秒

/**
 * 返回一个响应式信号，表示 OpenCode 服务的连接状态。
 */
export function useOpenCodeStatus(): () => OpenCodeStatus {
  const [status, setStatus] = createSignal<OpenCodeStatus>('disconnected');

  async function check() {
    try {
      const client = getXingjingClient();
      const result = await client.config.providers();
      setStatus(result.data ? 'connected' : 'disconnected');
    } catch {
      setStatus('disconnected');
    }
  }

  onMount(() => {
    // 立即检测一次
    void check();
    // 定时轮询
    const timer = setInterval(() => void check(), POLL_INTERVAL);
    onCleanup(() => clearInterval(timer));
  });

  return status;
}
