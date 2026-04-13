import { Database } from "bun:sqlite";
import { type Product, type PRD, type Task, type BacklogItem, type Sprint, type KnowledgeDoc, type DoraMetrics, type AiSession } from "./types";

export const db = new Database(process.env.XINGJING_DB ?? "xingjing.db");

export function initDB() {
  // Create products table
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT,
      mode TEXT,
      techStack TEXT,
      tagline TEXT,
      createdAt TEXT NOT NULL
    )
  `);

  // Create prds table
  db.exec(`
    CREATE TABLE IF NOT EXISTS prds (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      owner TEXT,
      status TEXT NOT NULL,
      aiScore REAL,
      reviewComments INTEGER,
      createdAt TEXT NOT NULL,
      sddStatus TEXT,
      devProgress TEXT,
      description TEXT,
      userStories TEXT,
      nfr TEXT,
      impactApps TEXT
    )
  `);

  // Create tasks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      sddId TEXT,
      assignee TEXT,
      status TEXT NOT NULL,
      estimate REAL,
      actual REAL,
      branch TEXT,
      ciStatus TEXT,
      coverage INTEGER,
      dod TEXT,
      dependencies TEXT,
      priority TEXT
    )
  `);

  // Create backlog_items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS backlog_items (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT,
      storyPoints REAL,
      epic TEXT,
      tags TEXT,
      status TEXT
    )
  `);

  // Create sprints table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sprints (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      goal TEXT,
      startDate TEXT,
      endDate TEXT,
      status TEXT NOT NULL,
      velocity REAL
    )
  `);

  // Create sprint_tasks association table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sprint_tasks (
      sprint_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      PRIMARY KEY (sprint_id, task_id),
      FOREIGN KEY (sprint_id) REFERENCES sprints(id),
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    )
  `);

  // Create knowledge_docs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_docs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT,
      tags TEXT,
      author TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  // Create ai_sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_sessions (
      id TEXT PRIMARY KEY,
      goal TEXT NOT NULL,
      status TEXT NOT NULL,
      opencodeSessionId TEXT,
      result TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `);

  // Create dora_metrics table
  db.exec(`
    CREATE TABLE IF NOT EXISTS dora_metrics (
      id TEXT PRIMARY KEY,
      period TEXT NOT NULL,
      deploy_frequency TEXT,
      change_lead_time TEXT,
      change_failure_rate TEXT,
      mttr TEXT,
      createdAt TEXT NOT NULL
    )
  `);
}

// Helper functions for database operations

export function getAllProducts(): Product[] {
  const stmt = db.prepare("SELECT * FROM products ORDER BY createdAt DESC");
  return stmt.all() as Product[];
}

export function getProductById(id: string): Product | null {
  const stmt = db.prepare("SELECT * FROM products WHERE id = ?");
  return (stmt.get(id) as Product) || null;
}

export function createProduct(product: Product): void {
  const stmt = db.prepare(`
    INSERT INTO products (id, name, description, type, mode, techStack, tagline, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(product.id, product.name, product.description, product.type, product.mode, product.techStack, product.tagline, product.createdAt);
}

export function updateProduct(id: string, updates: Partial<Product>): void {
  const fields = Object.keys(updates).filter(k => k !== 'id');
  const values = fields.map(k => updates[k as keyof Product]);
  values.push(id);
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const stmt = db.prepare(`UPDATE products SET ${setClause} WHERE id = ?`);
  stmt.run(...values);
}

export function deleteProduct(id: string): void {
  const stmt = db.prepare("DELETE FROM products WHERE id = ?");
  stmt.run(id);
}

export function getPRDs(productId?: string): PRD[] {
  let stmt;
  if (productId) {
    stmt = db.prepare("SELECT * FROM prds WHERE id LIKE ? ORDER BY createdAt DESC");
    const results = stmt.all(`${productId}%`) as any[];
    return results.map(row => ({
      ...row,
      userStories: row.userStories ? JSON.parse(row.userStories) : [],
      impactApps: row.impactApps ? JSON.parse(row.impactApps) : [],
    }));
  }
  stmt = db.prepare("SELECT * FROM prds ORDER BY createdAt DESC");
  const results = stmt.all() as any[];
  return results.map(row => ({
    ...row,
    userStories: row.userStories ? JSON.parse(row.userStories) : [],
    impactApps: row.impactApps ? JSON.parse(row.impactApps) : [],
  }));
}

export function getPRDById(id: string): PRD | null {
  const stmt = db.prepare("SELECT * FROM prds WHERE id = ?");
  const row = (stmt.get(id) as any) || null;
  if (!row) return null;
  return {
    ...row,
    userStories: row.userStories ? JSON.parse(row.userStories) : [],
    impactApps: row.impactApps ? JSON.parse(row.impactApps) : [],
  };
}

export function createPRD(prd: PRD): void {
  const stmt = db.prepare(`
    INSERT INTO prds (id, title, owner, status, aiScore, reviewComments, createdAt, sddStatus, devProgress, description, userStories, nfr, impactApps)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    prd.id,
    prd.title,
    prd.owner,
    prd.status,
    prd.aiScore,
    prd.reviewComments,
    prd.createdAt,
    prd.sddStatus,
    prd.devProgress,
    prd.description,
    JSON.stringify(prd.userStories),
    prd.nfr,
    JSON.stringify(prd.impactApps || [])
  );
}

export function updatePRD(id: string, updates: Partial<PRD>): void {
  const updateObj = { ...updates };
  if (updateObj.userStories) {
    (updateObj as any).userStories = JSON.stringify(updateObj.userStories);
  }
  if (updateObj.impactApps) {
    (updateObj as any).impactApps = JSON.stringify(updateObj.impactApps);
  }

  const fields = Object.keys(updateObj).filter(k => k !== 'id');
  const values = fields.map(k => updateObj[k as keyof typeof updateObj]);
  values.push(id);
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const stmt = db.prepare(`UPDATE prds SET ${setClause} WHERE id = ?`);
  stmt.run(...values);
}

export function deletePRD(id: string): void {
  const stmt = db.prepare("DELETE FROM prds WHERE id = ?");
  stmt.run(id);
}

export function getTasks(productId?: string): Task[] {
  let stmt;
  if (productId) {
    stmt = db.prepare("SELECT * FROM tasks WHERE id LIKE ? ORDER BY priority DESC, id DESC");
    const results = stmt.all(`${productId}%`) as any[];
    return results.map(row => ({
      ...row,
      dod: row.dod ? JSON.parse(row.dod) : [],
      dependencies: row.dependencies ? JSON.parse(row.dependencies) : [],
    }));
  }
  stmt = db.prepare("SELECT * FROM tasks ORDER BY priority DESC, id DESC");
  const results = stmt.all() as any[];
  return results.map(row => ({
    ...row,
    dod: row.dod ? JSON.parse(row.dod) : [],
    dependencies: row.dependencies ? JSON.parse(row.dependencies) : [],
  }));
}

export function getTaskById(id: string): Task | null {
  const stmt = db.prepare("SELECT * FROM tasks WHERE id = ?");
  const row = (stmt.get(id) as any) || null;
  if (!row) return null;
  return {
    ...row,
    dod: row.dod ? JSON.parse(row.dod) : [],
    dependencies: row.dependencies ? JSON.parse(row.dependencies) : [],
  };
}

export function createTask(task: Task): void {
  const stmt = db.prepare(`
    INSERT INTO tasks (id, title, sddId, assignee, status, estimate, actual, branch, ciStatus, coverage, dod, dependencies, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    task.id,
    task.title,
    task.sddId,
    task.assignee,
    task.status,
    task.estimate,
    task.actual,
    task.branch,
    task.ciStatus,
    task.coverage,
    JSON.stringify(task.dod),
    JSON.stringify(task.dependencies || []),
    task.priority
  );
}

export function updateTask(id: string, updates: Partial<Task>): void {
  const updateObj = { ...updates };
  if (updateObj.dod) {
    (updateObj as any).dod = JSON.stringify(updateObj.dod);
  }
  if (updateObj.dependencies) {
    (updateObj as any).dependencies = JSON.stringify(updateObj.dependencies);
  }

  const fields = Object.keys(updateObj).filter(k => k !== 'id');
  const values = fields.map(k => updateObj[k as keyof typeof updateObj]);
  values.push(id);
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const stmt = db.prepare(`UPDATE tasks SET ${setClause} WHERE id = ?`);
  stmt.run(...values);
}

export function deleteTask(id: string): void {
  const stmt = db.prepare("DELETE FROM tasks WHERE id = ?");
  stmt.run(id);
}

export function getBacklogItems(productId?: string): BacklogItem[] {
  let stmt;
  if (productId) {
    stmt = db.prepare("SELECT * FROM backlog_items WHERE id LIKE ? ORDER BY priority DESC, id DESC");
    const results = stmt.all(`${productId}%`) as any[];
    return results.map(row => ({
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : [],
    }));
  }
  stmt = db.prepare("SELECT * FROM backlog_items ORDER BY priority DESC, id DESC");
  const results = stmt.all() as any[];
  return results.map(row => ({
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
  }));
}

export function createBacklogItem(item: BacklogItem): void {
  const stmt = db.prepare(`
    INSERT INTO backlog_items (id, title, description, priority, storyPoints, epic, tags, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    item.id,
    item.title,
    item.description,
    item.priority,
    item.storyPoints,
    item.epic,
    JSON.stringify(item.tags || []),
    item.status
  );
}

export function getSprints(productId?: string): Sprint[] {
  const stmt = db.prepare("SELECT * FROM sprints ORDER BY startDate DESC");
  return stmt.all() as Sprint[];
}

export function getSprintById(id: string): Sprint | null {
  const stmt = db.prepare("SELECT * FROM sprints WHERE id = ?");
  return (stmt.get(id) as Sprint) || null;
}

export function createSprint(sprint: Sprint): void {
  const stmt = db.prepare(`
    INSERT INTO sprints (id, name, goal, startDate, endDate, status, velocity)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(sprint.id, sprint.name, sprint.goal, sprint.startDate, sprint.endDate, sprint.status, sprint.velocity);
}

export function getKnowledgeDocs(category?: string): KnowledgeDoc[] {
  let stmt;
  if (category) {
    stmt = db.prepare("SELECT * FROM knowledge_docs WHERE category = ? ORDER BY updatedAt DESC");
    const results = stmt.all(category) as any[];
    return results.map(row => ({
      ...row,
      tags: row.tags ? JSON.parse(row.tags) : [],
    }));
  }
  stmt = db.prepare("SELECT * FROM knowledge_docs ORDER BY updatedAt DESC");
  const results = stmt.all() as any[];
  return results.map(row => ({
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
  }));
}

export function createKnowledgeDoc(doc: KnowledgeDoc): void {
  const stmt = db.prepare(`
    INSERT INTO knowledge_docs (id, title, content, category, tags, author, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    doc.id,
    doc.title,
    doc.content,
    doc.category,
    JSON.stringify(doc.tags || []),
    doc.author,
    doc.createdAt,
    doc.updatedAt
  );
}

export function getAiSessions(productId?: string): AiSession[] {
  let stmt;
  if (productId) {
    stmt = db.prepare("SELECT * FROM ai_sessions WHERE goal LIKE ? ORDER BY createdAt DESC");
    return stmt.all(`%${productId}%`) as AiSession[];
  }
  stmt = db.prepare("SELECT * FROM ai_sessions ORDER BY createdAt DESC");
  return stmt.all() as AiSession[];
}

export function getAiSessionById(id: string): AiSession | null {
  const stmt = db.prepare("SELECT * FROM ai_sessions WHERE id = ?");
  return (stmt.get(id) as AiSession) || null;
}

export function createAiSession(session: AiSession): void {
  const stmt = db.prepare(`
    INSERT INTO ai_sessions (id, goal, status, opencodeSessionId, result, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(session.id, session.goal, session.status, session.opencodeSessionId, session.result, session.createdAt, session.updatedAt);
}

export function updateAiSession(id: string, updates: Partial<AiSession>): void {
  const fields = Object.keys(updates).filter(k => k !== 'id');
  const values = fields.map(k => updates[k as keyof typeof updates]);
  values.push(id);
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const stmt = db.prepare(`UPDATE ai_sessions SET ${setClause} WHERE id = ?`);
  stmt.run(...values);
}

export function getDoraMetrics(period?: string): DoraMetrics[] {
  let stmt;
  if (period) {
    stmt = db.prepare("SELECT * FROM dora_metrics WHERE period = ? ORDER BY createdAt DESC");
    return stmt.all(period) as DoraMetrics[];
  }
  stmt = db.prepare("SELECT * FROM dora_metrics ORDER BY createdAt DESC LIMIT 3");
  return stmt.all() as DoraMetrics[];
}

export function createDoraMetrics(metrics: DoraMetrics & { id: string; createdAt: string }): void {
  const stmt = db.prepare(`
    INSERT INTO dora_metrics (id, period, deploy_frequency, change_lead_time, change_failure_rate, mttr, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(metrics.id, metrics.period, metrics.deployFrequency, metrics.changeLeadTime, metrics.changeFailureRate, metrics.mttr, metrics.createdAt);
}
