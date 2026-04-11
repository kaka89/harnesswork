// Product/Project
export interface Product {
  id: string;
  name: string;
  description: string;
  type: string;
  mode: string;
  techStack?: string;
  tagline?: string;
  createdAt: string;
}

// User Story
export interface UserStory {
  id: string;
  content: string;
  acceptanceCriteria: string[];
}

// PRD - Product Requirements Document
export interface PRD {
  id: string;
  title: string;
  owner: string;
  status: 'draft' | 'reviewing' | 'approved';
  aiScore: number;
  reviewComments: number;
  createdAt: string;
  sddStatus?: string;
  devProgress?: string;
  description?: string;
  userStories: UserStory[];
  nfr?: string;
  impactApps?: string[];
}

// Definition of Done
export interface DoD {
  label: string;
  done: boolean;
}

// Task
export interface Task {
  id: string;
  title: string;
  sddId: string;
  assignee: string;
  status: 'todo' | 'in-dev' | 'in-review' | 'done';
  estimate: number;
  actual?: number;
  branch?: string;
  ciStatus?: 'running' | 'passed' | 'failed' | 'pending';
  coverage?: number;
  dod: DoD[];
  dependencies?: string[];
  priority: 'P0' | 'P1' | 'P2';
}

// Backlog Item
export interface BacklogItem {
  id: string;
  title: string;
  description?: string;
  priority: 'P0' | 'P1' | 'P2';
  storyPoints?: number;
  epic?: string;
  tags: string[];
  status: string;
}

// Sprint
export interface Sprint {
  id: string;
  name: string;
  goal?: string;
  startDate: string;
  endDate: string;
  status: 'planning' | 'active' | 'done';
  velocity?: number;
}

// Knowledge Document
export interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  author: string;
  createdAt: string;
  updatedAt: string;
}

// DORA Metrics
export interface DoraMetrics {
  deployFrequency: string;
  changeLeadTime: string;
  changeFailureRate: string;
  mttr: string;
  period: string;
}

// AI Session
export interface AiSession {
  id: string;
  goal: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  opencodeSessionId?: string;
  result?: string;
  createdAt: string;
  updatedAt: string;
}
