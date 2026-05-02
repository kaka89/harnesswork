/**
 * 研发工作台 Mock 数据
 *
 * 设计依据：product/features/dev-workbench/SDD.md §7
 */
import type {
  DevDesignTask,
  DevExecutionTask,
  ReviewItem,
} from "../types/dev-workbench";

// ── Tab 1: 架构设计 Mock 数据 ─────────────────────────────────────────────

export const MOCK_DESIGN_TASKS: DevDesignTask[] = [
  {
    id: "design-001",
    title: "PRD-005 用户认证模块",
    status: "in-progress",
    prdRefs: ["PRD-005.md", "技术约束.md"],
    outputArtifacts: [
      { name: "系统架构图.md", status: "done" },
      { name: "接口设计.md", status: "done" },
      { name: "模块拆解.md", status: "generating" },
    ],
    agentRunning: true,
    createdAt: "2026-05-01T09:00:00Z",
  },
  {
    id: "design-002",
    title: "PRD-003 搜索优化",
    status: "pending",
    prdRefs: ["PRD-003.md"],
    outputArtifacts: [],
    agentRunning: false,
    createdAt: "2026-05-02T10:00:00Z",
  },
  {
    id: "design-003",
    title: "PRD-001 商品列表",
    status: "done",
    prdRefs: ["PRD-001.md", "UI规范.md"],
    outputArtifacts: [
      { name: "系统架构图.md", status: "done" },
      { name: "接口设计.md", status: "done" },
      { name: "组件拆解.md", status: "done" },
    ],
    agentRunning: false,
    createdAt: "2026-04-28T14:00:00Z",
  },
];

// ── Tab 2: 开发执行 Mock 数据 ─────────────────────────────────────────────

export const MOCK_DEV_TASKS: DevExecutionTask[] = [
  {
    id: "dev-001",
    title: "认证接口开发",
    status: "running",
    progress: 50,
    pipelineId: "pipeline-auth-dev",
    nodes: [
      { label: "需求分析 Agent", status: "done" },
      { label: "接口设计 Agent", status: "done" },
      { label: "代码编写 Agent", status: "in-progress" },
      { label: "代码 Review", status: "pending" },
    ],
  },
  {
    id: "dev-002",
    title: "搜索模块重构",
    status: "blocked",
    progress: 0,
    nodes: [],
    blockedReason: "等待架构设计完成",
  },
  {
    id: "dev-003",
    title: "用户列表页面",
    status: "done",
    progress: 100,
    nodes: [
      { label: "需求分析 Agent", status: "done" },
      { label: "代码编写 Agent", status: "done" },
      { label: "代码 Review", status: "done" },
    ],
    prLink: "#23",
  },
];

// ── Tab 3: 成果评审 Mock 数据 ─────────────────────────────────────────────

const DESIGN_MARKDOWN_SAMPLE = `# 用户认证模块 架构设计

## 1. 背景与目标

为 PRD-005 "用户认证模块" 提供账号密码登录、JWT 鉴权、权限校验等核心能力。目标是在 2 周内完成 MVP，支持日活 1 万的用户规模。

## 2. 整体架构

采用分层架构：

- **API 层**：Express + TypeScript，承接 HTTP 请求
- **领域层**：纯业务逻辑，与存储解耦
- **持久层**：PostgreSQL + Redis（会话缓存）

## 3. 核心接口

\`\`\`ts
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/refresh
\`\`\`

## 4. JWT 策略

- Access Token：15 分钟有效期
- Refresh Token：7 天有效期，HttpOnly Cookie 存储
- 密钥轮换：每季度手动轮换

## 5. 风险与权衡

> 短有效期 + Refresh 机制提升了安全性，但增加了客户端复杂度。
> 当前版本暂不支持 OAuth2，后续迭代再补充。
`;

const CODE_DIFF_AUTH_OLD = `import jwt from "jsonwebtoken";

export function validateToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET);
  return payload;
}

export function getUser(token) {
  const payload = validateToken(token);
  return {
    id: payload.sub,
    name: payload.name,
  };
}

export function authMiddleware(req, res, next) {
  const token = req.headers.authorization;
  const user = getUser(token);
  req.user = user;
  next();
}
`;

const CODE_DIFF_AUTH_NEW = `import jwt, { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

export interface JwtPayload {
  sub: string;
  name: string;
  exp: number;
}

export function validateToken(token: string): JwtPayload {
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
  return payload;
}

export function getUser(token: string) {
  const payload = validateToken(token);
  return {
    id: payload.sub,
    name: payload.name,
  };
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const raw = req.headers.authorization;
  const token = raw?.replace(/^Bearer\\s+/i, "") ?? "";
  const user = getUser(token);
  req.user = user;
  next();
}
`;

const CODE_DIFF_USER_OLD = `export function renderUser(user) {
  return \`<div class="user">\${user.name}</div>\`;
}
`;

const CODE_DIFF_USER_NEW = `import { escapeHtml } from "./html-utils";

export function renderUser(user: { name: string }) {
  return \`<div class="user">\${escapeHtml(user.name)}</div>\`;
}
`;

const CODE_DIFF_LIST_OLD = `export function UserList({ users }) {
  return (
    <ul>
      {users.map((u, i) => <li key={i}>{u.name}</li>)}
    </ul>
  );
}
`;

const CODE_DIFF_LIST_NEW = `export interface User {
  id: string;
  name: string;
}

export function UserList({ users }: { users: User[] }) {
  return (
    <ul>
      {users.map((u) => <li key={u.id}>{u.name}</li>)}
    </ul>
  );
}
`;

export const MOCK_REVIEW_ITEMS: ReviewItem[] = [
  // ── 架构评审（pending） ──────────────────────────────────────────────
  {
    id: "review-001",
    title: "用户认证模块 架构评审",
    type: "design",
    status: "pending",
    reviewer: "spec-reviewer",
    findings: [
      {
        id: "f-001-a",
        severity: "medium",
        category: "安全性",
        description: "JWT 密钥轮换周期为季度，建议缩短至 1 个月，并增加自动化轮换流程。",
      },
      {
        id: "f-001-b",
        severity: "low",
        category: "扩展性",
        description: "接口层未提及限流策略，建议补充每 IP 登录频率限制。",
      },
    ],
    designDoc: { markdown: DESIGN_MARKDOWN_SAMPLE },
    designAnnotations: [
      {
        id: "da-001",
        anchor: "block-6",
        content: "建议在 MVP 中补充 OAuth2 占位接口，避免后续迭代改动过大。",
        resolved: false,
        createdAt: "2026-05-01T10:20:00Z",
      },
    ],
    summaryComment: "",
    lineComments: [],
  },

  // ── 代码评审（fail） ──────────────────────────────────────────────
  {
    id: "review-002",
    title: "认证接口代码评审",
    type: "code",
    status: "fail",
    reviewer: "code-quality-reviewer",
    findings: [
      {
        id: "f-002-a",
        severity: "high",
        category: "错误处理",
        description: "未捕获 JWT 过期异常，TokenExpiredError 会直接导致 500 错误。",
        file: "auth.ts",
        line: 12,
      },
      {
        id: "f-002-b",
        severity: "medium",
        category: "命名规范",
        description: "validateToken 命名未反映副作用（抛异常），建议改为 verifyTokenOrThrow。",
        file: "auth.ts",
        line: 11,
      },
      {
        id: "f-002-c",
        severity: "high",
        category: "XSS 防护",
        description: "user.name 未做 HTML 转义，存在 XSS 风险（已修复，但需确认覆盖所有入口）。",
        file: "user-render.ts",
        line: 4,
      },
    ],
    codeDiffFiles: [
      {
        file: "auth.ts",
        oldContent: CODE_DIFF_AUTH_OLD,
        newContent: CODE_DIFF_AUTH_NEW,
      },
      {
        file: "user-render.ts",
        oldContent: CODE_DIFF_USER_OLD,
        newContent: CODE_DIFF_USER_NEW,
      },
    ],
    lineComments: [
      {
        id: "lc-001",
        file: "auth.ts",
        line: 12,
        side: "right",
        content: "这里还是缺少对 TokenExpiredError 的 try/catch。",
        resolved: false,
        createdAt: "2026-05-01T11:30:00Z",
      },
      {
        id: "lc-002",
        file: "user-render.ts",
        line: 4,
        side: "right",
        content: "escapeHtml 是否也需要对属性值做处理？",
        resolved: true,
        createdAt: "2026-05-01T12:00:00Z",
      },
    ],
    designAnnotations: [],
    summaryComment: "",
  },

  // ── 代码评审（pass） ──────────────────────────────────────────────
  {
    id: "review-003",
    title: "用户列表组件代码评审",
    type: "code",
    status: "pass",
    reviewer: "code-quality-reviewer",
    findings: [],
    codeDiffFiles: [
      {
        file: "UserList.tsx",
        oldContent: CODE_DIFF_LIST_OLD,
        newContent: CODE_DIFF_LIST_NEW,
      },
    ],
    lineComments: [],
    designAnnotations: [],
    summaryComment: "类型与 key 改造合理，代码质量良好。",
  },
];
