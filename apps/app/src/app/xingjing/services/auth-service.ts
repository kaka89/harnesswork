/**
 * Auth Service — Solo Bypass
 *
 * 星静独立版暂不维护独立认证流程，所有方法默认返回「已登录」状态。
 * 后续完善用户体系时再接入真实认证逻辑。
 * 此文件保留导出签名，供认证守卫和 Team 页面编译通过。
 */

import { createSignal } from 'solid-js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  phone?: string;
  avatar_url?: string;
  role: string;
  tenant_id: number;
  status: string;
  created_at: string;
  tenant?: { id: number; name: string; plan: string };
}

// ── Default solo user (bypass auth) ───────────────────────────────────────────

const SOLO_USER: AuthUser = {
  id: 0,
  email: 'solo@xingjing.local',
  name: '独立用户',
  role: 'admin',
  tenant_id: 0,
  status: 'active',
  created_at: new Date().toISOString(),
  tenant: { id: 0, name: '本地', plan: 'solo' },
};

// ── Reactive state (auto-authenticated) ───────────────────────────────────────

const [currentUser] = createSignal<AuthUser | null>(SOLO_USER);
const [authLoading] = createSignal(false);
export { currentUser, authLoading };

// ── Bypass implementations ────────────────────────────────────────────────────

export function getAuthToken(): string | null { return 'solo-standalone-token'; }
export async function checkAuth(): Promise<boolean> { return true; }
export async function login(_email: string, _password: string): Promise<AuthUser> { return SOLO_USER; }
export async function register(_e: string, _p: string, _n: string, _c: string): Promise<AuthUser> { return SOLO_USER; }
export function logout(): void { /* no-op */ }
export async function updateProfile(_name: string, _phone?: string, _avatar?: string): Promise<AuthUser> { return SOLO_USER; }
export async function changePassword(_old: string, _new: string): Promise<void> { /* no-op */ }
export async function deleteAccount(): Promise<void> { /* no-op */ }
