import { initDB, seedIfEmpty, getAllProducts, getProductById, createProduct, updateProduct, deleteProduct, getPRDs, getPRDById, createPRD, updatePRD, deletePRD, getTasks, getTaskById, createTask, updateTask, deleteTask, getBacklogItems, createBacklogItem, getSprints, getSprintById, createSprint, getKnowledgeDocs, createKnowledgeDoc, getAiSessions, getAiSessionById, createAiSession, updateAiSession, getDoraMetrics } from "./db";
import { type Product, type PRD, type Task, type BacklogItem, type Sprint, type KnowledgeDoc, type AiSession } from "./types";

const PORT = parseInt(process.env.XINGJING_PORT ?? "4100");
const VERSION = "1.0.0";

// Helper function to generate IDs
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Helper function to format JSON response
function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: getCorsHeaders(),
  });
}

// Helper for CORS headers
function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };
}

// Route handlers
async function handleHealthCheck(): Promise<Response> {
  return jsonResponse({ status: "ok", version: VERSION });
}

async function handleGetProducts(): Promise<Response> {
  try {
    const products = getAllProducts();
    return jsonResponse(products);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

async function handleCreateProduct(request: Request): Promise<Response> {
  try {
    const body = await request.json() as Partial<Product>;
    const product: Product = {
      id: generateId("PROJ"),
      name: body.name || "Untitled",
      description: body.description || "",
      type: body.type || "enterprise",
      mode: body.mode || "team",
      techStack: body.techStack,
      tagline: body.tagline,
      createdAt: new Date().toISOString().split('T')[0],
    };
    createProduct(product);
    return jsonResponse(product, 201);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

async function handleUpdateProduct(id: string, request: Request): Promise<Response> {
  try {
    const body = await request.json() as Partial<Product>;
    const existing = getProductById(id);
    if (!existing) {
      return jsonResponse({ error: "Product not found" }, 404);
    }
    updateProduct(id, body);
    return jsonResponse({ ...existing, ...body });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

async function handleDeleteProduct(id: string): Promise<Response> {
  try {
    const existing = getProductById(id);
    if (!existing) {
      return jsonResponse({ error: "Product not found" }, 404);
    }
    deleteProduct(id);
    return jsonResponse({ deleted: true });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

async function handleGetPRDs(url: URL): Promise<Response> {
  try {
    const productId = url.searchParams.get("productId");
    const prds = getPRDs(productId ?? undefined);
    return jsonResponse(prds);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

async function handleCreatePRD(request: Request): Promise<Response> {
  try {
    const body = await request.json() as Partial<PRD>;
    const prd: PRD = {
      id: generateId("PRD"),
      title: body.title || "Untitled PRD",
      owner: body.owner || "",
      status: body.status || "draft",
      aiScore: body.aiScore || 0,
      reviewComments: body.reviewComments || 0,
      createdAt: new Date().toISOString().split('T')[0],
      sddStatus: body.sddStatus,
      devProgress: body.devProgress,
      description: body.description,
      userStories: body.userStories || [],
      nfr: body.nfr,
      impactApps: body.impactApps,
    };
    createPRD(prd);
    return jsonResponse(prd, 201);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

async function handleUpdatePRD(id: string, request: Request): Promise<Response> {
  try {
    const body = await request.json() as Partial<PRD>;
    const existing = getPRDById(id);
    if (!existing) {
      return jsonResponse({ error: "PRD not found" }, 404);
    }
    updatePRD(id, body);
    return jsonResponse({ ...existing, ...body });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

async function handleDeletePRD(id: string): Promise<Response> {
  try {
    const existing = getPRDById(id);
    if (!existing) {
      return jsonResponse({ error: "PRD not found" }, 404);
    }
    deletePRD(id);
    return jsonResponse({ deleted: true });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

async function handleGetTasks(url: URL): Promise<Response> {
  try {
    const productId = url.searchParams.get("productId");
    const tasks = getTasks(productId ?? undefined);
    return jsonResponse(tasks);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

async function handleCreateTask(request: Request): Promise<Response> {
  try {
    const body = await request.json() as Partial<Task>;
    const task: Task = {
      id: generateId("TASK"),
      title: body.title || "Untitled",
      sddId: body.sddId || "",
      assignee: body.assignee || "",
      status: body.status || "todo",
      estimate: body.estimate || 0,
      actual: body.actual,
      branch: body.branch,
      ciStatus: body.ciStatus,
      coverage: body.coverage,
      dod: body.dod || [],
      dependencies: body.dependencies,
      priority: body.priority || "P2",
    };
    createTask(task);
    return jsonResponse(task, 201);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

async function handleUpdateTask(id: string, request: Request): Promise<Response> {
  try {
    const body = await request.json() as Partial<Task>;
    const existing = getTaskById(id);
    if (!existing) {
      return jsonResponse({ error: "Task not found" }, 404);
    }
    updateTask(id, body);
    return jsonResponse({ ...existing, ...body });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

async function handleDeleteTask(id: string): Promise<Response> {
  try {
    const existing = getTaskById(id);
    if (!existing) {
      return jsonResponse({ error: "Task not found" }, 404);
    }
    deleteTask(id);
    return jsonResponse({ deleted: true });
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

async function handleGetBacklog(url: URL): Promise<Response> {
  try {
    const productId = url.searchParams.get("productId");
    const items = getBacklogItems(productId ?? undefined);
    return jsonResponse(items);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

async function handleCreateBacklogItem(request: Request): Promise<Response> {
  try {
    const body = await request.json() as Partial<BacklogItem>;
    const item: BacklogItem = {
      id: generateId("BL"),
      title: body.title || "Untitled",
      description: body.description,
      priority: body.priority || "P2",
      storyPoints: body.storyPoints,
      epic: body.epic,
      tags: body.tags || [],
      status: body.status || "todo",
    };
    createBacklogItem(item);
    return jsonResponse(item, 201);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

async function handleGetSprints(url: URL): Promise<Response> {
  try {
    const productId = url.searchParams.get("productId");
    const sprints = getSprints(productId ?? undefined);
    return jsonResponse(sprints);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

async function handleCreateSprint(request: Request): Promise<Response> {
  try {
    const body = await request.json() as Partial<Sprint>;
    const sprint: Sprint = {
      id: generateId("SPRINT"),
      name: body.name || "Untitled Sprint",
      goal: body.goal,
      startDate: body.startDate || new Date().toISOString().split('T')[0],
      endDate: body.endDate || new Date().toISOString().split('T')[0],
      status: body.status || "planning",
      velocity: body.velocity,
    };
    createSprint(sprint);
    return jsonResponse(sprint, 201);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

async function handleGetKnowledge(url: URL): Promise<Response> {
  try {
    const category = url.searchParams.get("category");
    const docs = getKnowledgeDocs(category ?? undefined);
    return jsonResponse(docs);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

async function handleCreateKnowledge(request: Request): Promise<Response> {
  try {
    const body = await request.json() as Partial<KnowledgeDoc>;
    const doc: KnowledgeDoc = {
      id: generateId("DOC"),
      title: body.title || "Untitled",
      content: body.content || "",
      category: body.category || "general",
      tags: body.tags || [],
      author: body.author || "Unknown",
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
    };
    createKnowledgeDoc(doc);
    return jsonResponse(doc, 201);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

async function handleGetMetrics(url: URL): Promise<Response> {
  try {
    const period = url.searchParams.get("period");
    const metrics = getDoraMetrics(period ?? undefined);
    return jsonResponse(metrics);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

async function handleGetAiSessions(url: URL): Promise<Response> {
  try {
    const productId = url.searchParams.get("productId");
    const sessions = getAiSessions(productId ?? undefined);
    return jsonResponse(sessions);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

// ── OpenCode SDK 集成 ─────────────────────────────────────────────────────
// xingjing-server 通过 OpenCode SDK 创建真实 AI 会话（可选，graceful fallback）

const OPENCODE_URL = process.env.OPENCODE_URL ?? "http://localhost:4096";
const OPENCODE_TOKEN = process.env.OPENCODE_TOKEN ?? "";

/** 尝试通过 OpenCode SDK 执行 AI 任务，失败时返回 null */
async function runOpencodeSession(goal: string): Promise<{ sessionId: string; result: string } | null> {
  try {
    const { createOpencodeClient } = await import("@opencode-ai/sdk/v2/client");
    const client = createOpencodeClient({ baseUrl: OPENCODE_URL });

    // 健康检查
    const health = await client.global.health().catch(() => null);
    if (!health?.data?.healthy) {
      console.warn("[xingjing-server] OpenCode unreachable, skipping real session");
      return null;
    }

    // 创建 session（使用 home 目录作为工作区）
    const created = await client.session.create({ directory: process.env.HOME ?? "/" });
    if (!created.data?.id) return null;
    const sessionId = created.data.id;

    // 发送 prompt（包含系统指令）
    const systemPrompt = `你是 xingjing 平台的 AI 工程效能助手。
你的职责是：帮助团队规划迭代、生成 PRD 草稿、分析 DORA 指标并给出改进建议。
请用中文回答，保持简洁专业，以 JSON 格式输出结构化结果（如适用）。`;

    const msg = await client.session.promptAsync({
      sessionID: sessionId,
      parts: [{ type: "text", text: `${systemPrompt}\n\n任务：${goal}` }],
    }).catch(() => null);

    if (!msg) return { sessionId, result: "" };

    // 等待完成（最多 120s）
    let result = "";
    const timeout = Date.now() + 120_000;
    while (Date.now() < timeout) {
      await Bun.sleep(2000);
      const messages = await client.session.messages({ sessionID: sessionId }).catch(() => null);
      if (!messages?.data) break;
      const lastMsg = messages.data[messages.data.length - 1];
      if (lastMsg?.role === "assistant") {
        const textPart = lastMsg.parts?.find((p: { type: string }) => p.type === "text") as { text?: string } | undefined;
        result = textPart?.text ?? "";
        break;
      }
    }

    return { sessionId, result };
  } catch (err) {
    console.warn("[xingjing-server] OpenCode session error:", err);
    return null;
  }
}

async function handleCreateAiSession(request: Request): Promise<Response> {
  try {
    const body = await request.json() as { goal: string; productId?: string };
    const session: AiSession = {
      id: generateId("AISESS"),
      goal: body.goal || "",
      status: "running",
      opencodeSessionId: undefined,
      result: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    createAiSession(session);

    // 立即返回，后台异步执行 OpenCode 任务
    const responseSession = { ...session };
    void (async () => {
      const openResult = await runOpencodeSession(session.goal);
      const now = new Date().toISOString();
      if (openResult) {
        updateAiSession(session.id, {
          status: "done",
          opencodeSessionId: openResult.sessionId,
          result: openResult.result || `✅ 任务完成：${session.goal}`,
          updatedAt: now,
        });
      } else {
        // Simulation fallback：模拟 AI 处理过程
        await Bun.sleep(3000);
        updateAiSession(session.id, {
          status: "done",
          result: `✅ [演示模式] 目标「${session.goal}」已分析完成。\n\n建议：\n1. 将需求拆解为 3-5 个迭代可交付的子目标\n2. 优先完成用户价值最高的功能\n3. 在每个迭代结束时进行 DORA 指标复盘\n\n（连接 OpenCode 服务以获取真实 AI 分析）`,
          updatedAt: now,
        });
      }
    })();

    return jsonResponse(responseSession, 201);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

async function handleGetAiSession(id: string): Promise<Response> {
  try {
    const session = getAiSessionById(id);
    if (!session) {
      return jsonResponse({ error: "Session not found" }, 404);
    }
    return jsonResponse(session);
  } catch (error) {
    return jsonResponse({ error: String(error) }, 500);
  }
}

// Main request handler
async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method;

  // Handle CORS preflight
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(),
    });
  }

  try {
    // Health check
    if (pathname === "/health" && method === "GET") {
      return await handleHealthCheck();
    }

    // Products
    if (pathname === "/api/products" && method === "GET") {
      return await handleGetProducts();
    }
    if (pathname === "/api/products" && method === "POST") {
      return await handleCreateProduct(request);
    }

    const productMatch = pathname.match(/^\/api\/products\/(.+)$/);
    if (productMatch && method === "PUT") {
      return await handleUpdateProduct(productMatch[1], request);
    }
    if (productMatch && method === "DELETE") {
      return await handleDeleteProduct(productMatch[1]);
    }

    // PRDs
    if (pathname === "/api/prds" && method === "GET") {
      return await handleGetPRDs(url);
    }
    if (pathname === "/api/prds" && method === "POST") {
      return await handleCreatePRD(request);
    }

    const prdMatch = pathname.match(/^\/api\/prds\/(.+)$/);
    if (prdMatch && method === "PUT") {
      return await handleUpdatePRD(prdMatch[1], request);
    }
    if (prdMatch && method === "DELETE") {
      return await handleDeletePRD(prdMatch[1]);
    }

    // Tasks
    if (pathname === "/api/tasks" && method === "GET") {
      return await handleGetTasks(url);
    }
    if (pathname === "/api/tasks" && method === "POST") {
      return await handleCreateTask(request);
    }

    const taskMatch = pathname.match(/^\/api\/tasks\/(.+)$/);
    if (taskMatch && method === "PUT") {
      return await handleUpdateTask(taskMatch[1], request);
    }
    if (taskMatch && method === "DELETE") {
      return await handleDeleteTask(taskMatch[1]);
    }

    // Backlog
    if (pathname === "/api/backlog" && method === "GET") {
      return await handleGetBacklog(url);
    }
    if (pathname === "/api/backlog" && method === "POST") {
      return await handleCreateBacklogItem(request);
    }

    // Sprints
    if (pathname === "/api/sprints" && method === "GET") {
      return await handleGetSprints(url);
    }
    if (pathname === "/api/sprints" && method === "POST") {
      return await handleCreateSprint(request);
    }

    // Knowledge
    if (pathname === "/api/knowledge" && method === "GET") {
      return await handleGetKnowledge(url);
    }
    if (pathname === "/api/knowledge" && method === "POST") {
      return await handleCreateKnowledge(request);
    }

    // Metrics
    if (pathname === "/api/metrics" && method === "GET") {
      return await handleGetMetrics(url);
    }

    // AI Sessions
    if (pathname === "/api/ai-sessions" && method === "GET") {
      return await handleGetAiSessions(url);
    }
    if (pathname === "/api/ai-sessions" && method === "POST") {
      return await handleCreateAiSession(request);
    }

    const sessionMatch = pathname.match(/^\/api\/ai-sessions\/(.+)$/);
    if (sessionMatch && method === "GET") {
      return await handleGetAiSession(sessionMatch[1]);
    }

    // 404
    return jsonResponse({ error: "Not found" }, 404);
  } catch (error) {
    console.error("Request error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
}

// Initialize database and start server
initDB();
seedIfEmpty();

const server = Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

console.log(`🌙 Xingjing Server v${VERSION}`);
console.log(`📦 Database: ${process.env.XINGJING_DB ?? "xingjing.db"}`);
console.log(`🚀 Listening on http://localhost:${PORT}`);
