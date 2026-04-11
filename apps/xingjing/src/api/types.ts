/**
 * API Types - Shared data structures for xingjing-server communication
 */

export interface Product {
  id: string;
  name: string;
  description: string;
  type: string;
  mode: 'team' | 'solo';
  techStack?: string;
  tagline?: string;
  createdAt: string;
}

export interface DoraMetrics {
  period: string;
  deployFrequency: number;
  changeLeadTime: number;
  changeFailureRate: number;
  mttr: number;
}

export interface AiSession {
  id: string;
  goal: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  opencodeSessionId?: string;
  result?: string;
  createdAt: string;
  updatedAt: string;
}

// Re-export types from mock for convenience
export type { PRD, Task } from '../mock/prd';
export type { BacklogItem, SprintData as Sprint } from '../mock/sprint';
export type { KnowledgeItem as KnowledgeDoc } from '../mock/knowledge';
