/**
 * Auth Service — xingjing-server JWT authentication
 *
 * Manages token persistence (localStorage) and exposes reactive SolidJS signals
 * for the authentication state. Calls /api/v1/auth/* on xingjing-server.
 */

import { createSignal } from 'solid-js';

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE_URL = (
  typeof import.meta !== 'undefined' && typeof (import.meta as any).env?.VITE_XINGJING_API_URL === 'string'
    ? (import.meta as any).env.VITE_XINGJING_API_URL
    : ''
).trim() || 'http://localhost:4100';

const TOKEN_KEY = 'xingjing_auth_token';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  phone?: string;
  role: string;
  tenant_id: number;
  status: string;
  created_at: string;
  tenant?: {
    id: number;
    name: string;
    plan: string;
  };
}

interface AuthResponse {
  code: number;
  data: {
    token: string;
    user: AuthUser;
  };
}

interface MeResponse {
  code: number;
  data: AuthUser;
}

// ── Token helpers ──────────────────────────────────────────────────────────────

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY) || null;
}

function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
}

// ── Reactive state (module-level singleton) ────────────────────────────────────

const [currentUser, setCurrentUser] = createSignal<AuthUser | null>(null);
const [authLoading, setAuthLoading] = createSignal(false);

export { currentUser, authLoading };

// ── Core API calls ─────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  const json = await res.json() as { code: number; data?: unknown; error?: string };

  if (!res.ok || json.code !== 0) {
    throw new Error(json.error ?? `Request failed: ${res.status}`);
  }

  return json as T;
}

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * Check if the stored token is still valid.
 * Called on app startup — sets currentUser and authLoading accordingly.
 * @returns true if authenticated, false otherwise
 */
export async function checkAuth(): Promise<boolean> {
  const token = getAuthToken();
  if (!token) {
    setCurrentUser(null);
    return false;
  }

  setAuthLoading(true);
  try {
    const resp = await apiFetch<MeResponse>('/api/v1/auth/me');
    setCurrentUser(resp.data);
    return true;
  } catch {
    clearAuthToken();
    setCurrentUser(null);
    return false;
  } finally {
    setAuthLoading(false);
  }
}

/**
 * Login with email and password.
 * On success, stores token and updates currentUser.
 */
export async function login(email: string, password: string): Promise<AuthUser> {
  setAuthLoading(true);
  try {
    const resp = await apiFetch<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuthToken(resp.data.token);
    setCurrentUser(resp.data.user);
    return resp.data.user;
  } finally {
    setAuthLoading(false);
  }
}

/**
 * Register a new account.
 * On success, stores token and updates currentUser.
 */
export async function register(
  email: string,
  password: string,
  name: string,
  companyName: string,
): Promise<AuthUser> {
  setAuthLoading(true);
  try {
    const resp = await apiFetch<AuthResponse>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, company_name: companyName }),
    });
    setAuthToken(resp.data.token);
    setCurrentUser(resp.data.user);
    return resp.data.user;
  } finally {
    setAuthLoading(false);
  }
}

/**
 * Logout — clears token and currentUser.
 */
export function logout(): void {
  clearAuthToken();
  setCurrentUser(null);
}
