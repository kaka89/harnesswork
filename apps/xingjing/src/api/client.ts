/**
 * Base HTTP Client
 * Handles all API communication with xingjing-server
 */

const BASE_URL = import.meta.env.VITE_XINGJING_API_URL ?? 'http://localhost:4100';

export interface RequestOptions extends Omit<RequestInit, 'method' | 'body'> {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
}

/**
 * Generic request handler
 */
async function request<T>(path: string, options?: RequestOptions): Promise<T> {
  const { body, ...init } = options ?? {};

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
    ...init,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = new Error(`API ${path} failed: ${res.status} ${res.statusText}`);
    (error as any).status = res.status;
    throw error;
  }

  return res.json() as Promise<T>;
}

/**
 * Convenience methods for common HTTP verbs
 */
export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),

  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PUT', body }),

  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),

  del: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

export function getBaseUrl(): string {
  return BASE_URL;
}
