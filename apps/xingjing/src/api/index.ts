/**
 * API Endpoints - All data fetching functions for xingjing frontend
 * This module provides a unified interface for all backend API calls
 */

import { api } from './client';
import type {
  Product,
  DoraMetrics,
  AiSession,
  PRD,
  Task,
  BacklogItem,
  Sprint,
  KnowledgeDoc,
} from './types';

// ─── Products ─────────────────────────────────────────────

export const productsApi = {
  list: () =>
    api.get<Product[]>('/api/products'),

  create: (data: Partial<Product>) =>
    api.post<Product>('/api/products', data),

  update: (id: string, data: Partial<Product>) =>
    api.put<Product>(`/api/products/${id}`, data),

  remove: (id: string) =>
    api.del(`/api/products/${id}`),
};

// ─── PRDs ─────────────────────────────────────────────

export const prdsApi = {
  list: (productId?: string) =>
    api.get<PRD[]>(`/api/prds${productId ? `?productId=${productId}` : ''}`),

  create: (data: Partial<PRD>) =>
    api.post<PRD>('/api/prds', data),

  update: (id: string, data: Partial<PRD>) =>
    api.put<PRD>(`/api/prds/${id}`, data),

  remove: (id: string) =>
    api.del(`/api/prds/${id}`),
};

// ─── Tasks ─────────────────────────────────────────────

export const tasksApi = {
  list: (productId?: string) =>
    api.get<Task[]>(`/api/tasks${productId ? `?productId=${productId}` : ''}`),

  create: (data: Partial<Task>) =>
    api.post<Task>('/api/tasks', data),

  update: (id: string, data: Partial<Task>) =>
    api.put<Task>(`/api/tasks/${id}`, data),

  remove: (id: string) =>
    api.del(`/api/tasks/${id}`),
};

// ─── Backlog ─────────────────────────────────────────────

export const backlogApi = {
  list: (productId?: string) =>
    api.get<BacklogItem[]>(`/api/backlog${productId ? `?productId=${productId}` : ''}`),

  create: (data: Partial<BacklogItem>) =>
    api.post<BacklogItem>('/api/backlog', data),

  update: (id: string, data: Partial<BacklogItem>) =>
    api.put<BacklogItem>(`/api/backlog/${id}`, data),
};

// ─── Sprints ─────────────────────────────────────────────

export const sprintsApi = {
  list: (productId?: string) =>
    api.get<Sprint[]>(`/api/sprints${productId ? `?productId=${productId}` : ''}`),

  create: (data: Partial<Sprint>) =>
    api.post<Sprint>('/api/sprints', data),

  update: (id: string, data: Partial<Sprint>) =>
    api.put<Sprint>(`/api/sprints/${id}`, data),
};

// ─── Knowledge ─────────────────────────────────────────────

export const knowledgeApi = {
  list: (category?: string) =>
    api.get<KnowledgeDoc[]>(`/api/knowledge${category ? `?category=${category}` : ''}`),

  create: (data: Partial<KnowledgeDoc>) =>
    api.post<KnowledgeDoc>('/api/knowledge', data),

  update: (id: string, data: Partial<KnowledgeDoc>) =>
    api.put<KnowledgeDoc>(`/api/knowledge/${id}`, data),
};

// ─── DORA Metrics ─────────────────────────────────────────────

export const metricsApi = {
  get: (period?: string) =>
    api.get<DoraMetrics[]>(`/api/metrics${period ? `?period=${period}` : ''}`),

  list: (period?: string) =>
    api.get<DoraMetrics[]>(`/api/metrics${period ? `?period=${period}` : ''}`),
};

// ─── AI Sessions (Autopilot) ─────────────────────────────────────────────

export interface AiSessionStartRequest {
  goal: string;
  productId?: string;
}

export const aiSessionsApi = {
  list: (productId?: string) =>
    api.get<AiSession[]>(`/api/ai-sessions${productId ? `?productId=${productId}` : ''}`),

  create: (goal: string, productId?: string) =>
    api.post<AiSession>('/api/ai-sessions', { goal, productId }),

  get: (id: string) =>
    api.get<AiSession>(`/api/ai-sessions/${id}`),

  /**
   * Poll for session status updates
   * @param id Session ID
   * @param onUpdate Callback when session is updated
   * @param intervalMs Polling interval in milliseconds (default: 2000ms)
   * @returns Cleanup function to stop polling
   */
  poll: async (
    id: string,
    onUpdate: (session: AiSession) => void,
    intervalMs = 2000,
  ): Promise<() => void> => {
    const timer = setInterval(async () => {
      try {
        const session = await aiSessionsApi.get(id);
        onUpdate(session);
        // Stop polling when session is complete
        if (session.status === 'done' || session.status === 'failed') {
          clearInterval(timer);
        }
      } catch (err) {
        console.error('[aiSessionsApi.poll] Failed to poll session:', err);
        clearInterval(timer);
      }
    }, intervalMs);

    return () => clearInterval(timer);
  },
};

// Export all APIs as a namespace
export const apis = {
  products: productsApi,
  prds: prdsApi,
  tasks: tasksApi,
  backlog: backlogApi,
  sprints: sprintsApi,
  knowledge: knowledgeApi,
  metrics: metricsApi,
  aiSessions: aiSessionsApi,
};

export default apis;
