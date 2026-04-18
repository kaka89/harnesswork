/**
 * useOpenCodeStatus — 检测 OpenCode 服务连接状态的 SolidJS hook
 *
 * 通过定时 ping OpenCode 服务端 /config/providers 端点判断是否可达。
 * 首次挂载立即检测，之后每 10 秒轮询一次。
 *
 * 自动重连机制：
 * - 检测到断开时，进入 'reconnecting' 状态
 * - 调用 refreshLocalClient() 刷新 Tauri 动态端口 + 认证信息
 * - 按 2s/3s/5s/8s/10s 退避重试，共 5 次
 * - 重连成功恢复 'connected'，全部失败回到 'disconnected'
 */

import { createSignal, onMount, onCleanup } from 'solid-js';
import { getXingjingClient, refreshLocalClient } from '../services/opencode-client';

export type OpenCodeStatus = 'connected' | 'disconnected' | 'reconnecting';

const POLL_INTERVAL = 10_000; // 10 秒

/** 重连退避间隔（ms）：比 Agent 调用层更保守，减少资源消耗 */
const RECONNECT_DELAYS = [2000, 3000, 5000, 8000, 10000] as const;

/** 异步等待指定毫秒 */
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * 返回一个响应式信号，表示 OpenCode 服务的连接状态。
 * 支持 'connected' | 'disconnected' | 'reconnecting' 三种状态。
 */
export function useOpenCodeStatus(): () => OpenCodeStatus {
  const [status, setStatus] = createSignal<OpenCodeStatus>('disconnected');
  let reconnecting = false;

  /** Ping OpenCode 端点，返回是否可达 */
  async function ping(): Promise<boolean> {
    try {
      const client = getXingjingClient();
      const result = await client.config.providers();
      return result.data !== null && result.data !== undefined;
    } catch {
      return false;
    }
  }

  /** 主动重连：刷新客户端 + 退避重试 ping */
  async function tryReconnect() {
    if (reconnecting) return; // 防止并发
    reconnecting = true;
    setStatus('reconnecting');
    console.log('[xingjing] OpenCode 断开，开始自动重连...');

    for (let i = 0; i < RECONNECT_DELAYS.length; i++) {
      // 刷新本地客户端（Tauri 环境下可能已换端口）
      await refreshLocalClient();
      if (await ping()) {
        console.log(`[xingjing] OpenCode 重连成功（第 ${i + 1} 次尝试）`);
        setStatus('connected');
        reconnecting = false;
        return;
      }
      console.log(`[xingjing] OpenCode 重连第 ${i + 1} 次失败，${RECONNECT_DELAYS[i]}ms 后重试`);
      await sleep(RECONNECT_DELAYS[i]);
    }

    // 重连耗尽
    console.warn('[xingjing] OpenCode 重连 5 次均失败，回到断开状态');
    setStatus('disconnected');
    reconnecting = false;
  }

  /** 定时检测入口 */
  async function check() {
    // 重连进行中时跳过常规检测
    if (reconnecting) return;

    const ok = await ping();
    if (ok) {
      setStatus('connected');
    } else if (status() === 'connected') {
      // 从 connected → 断开：立即触发重连
      void tryReconnect();
    } else if (status() === 'disconnected') {
      // disconnected 下 ping 仍失败：也尝试重连
      void tryReconnect();
    }
  }

  onMount(() => {
    // 立即检测一次
    void check();
    // 定时轮询（重连期间自动跳过）
    const timer = setInterval(() => void check(), POLL_INTERVAL);
    onCleanup(() => clearInterval(timer));
  });

  return status;
}
