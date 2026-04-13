# API 集成指南

本指南说明如何将 xingjing 前端与 xingjing-server 后端完全集成。

## 概览

已创建完整的 API 客户端模块，支持：
- 所有数据类型的完整 CRUD 操作
- 自动 Mock Fallback 机制
- TypeScript 类型安全
- 优雅的错误处理
- 实时数据轮询（用于 AI Sessions）

## 已完成的工作

### 1. API 客户端模块 (`src/api/`)

#### 文件结构
```
src/api/
├── client.ts          # 基础 HTTP 客户端 (1.8KB)
├── index.ts           # 所有 API 端点定义 (5.5KB)
├── types.ts           # TypeScript 类型定义 (860B)
├── examples.tsx       # 使用示例 (5.5KB)
└── README.md          # 完整文档 (5.0KB)
```

#### 核心功能

**client.ts** - 基础 HTTP 客户端
```typescript
// 支持 GET, POST, PUT, PATCH, DELETE
api.get<T>(path, options?)
api.post<T>(path, body?, options?)
api.put<T>(path, body?, options?)
api.patch<T>(path, body?, options?)
api.del<T>(path, options?)
```

**index.ts** - 所有 API 定义

提供以下模块化 API：
- `productsApi` - 产品管理
- `prdsApi` - PRD 管理
- `tasksApi` - 任务管理
- `backlogApi` - 积压项管理
- `sprintsApi` - Sprint 管理
- `knowledgeApi` - 知识库管理
- `metricsApi` - DORA 指标获取
- `aiSessionsApi` - AI Session 创建和轮询

### 2. React Hooks (`src/hooks/useApi.ts`)

#### useApi - 数据获取 Hook
```typescript
const { data, loading, error, isUsingFallback, refetch } = useApi(
  fetcher: () => Promise<T>,
  fallback: T,
  deps?: unknown[]
);
```

**特性：**
- 自动错误处理
- Mock 数据 Fallback
- `isUsingFallback` 标志，用于显示离线提示
- `refetch()` 方法手动重新获取

#### useMutation - 数据修改 Hook
```typescript
const { data, loading, error, execute } = useMutation(
  mutator: (input?: unknown) => Promise<T>
);
```

### 3. 已更新的页面

#### Dashboard (`src/pages/Dashboard/index.tsx`)
- 使用 `useApi` 获取 DORA 指标
- 添加 API 状态指示器（绿色/橙色小点）
- 保持 Mock 数据作为 Fallback
- 显示加载状态

**改动：**
```typescript
// 新增
const { data: metricsData, loading, error, isUsingFallback } = useApi(
  () => metricsApi.get(),
  doraMetrics, // Mock fallback
);

// UI 中添加连接状态指示器
<Badge
  status={isUsingFallback ? 'warning' : 'success'}
  text={isUsingFallback ? '演示数据' : '已连接'}
/>
```

#### Autopilot (`src/pages/Autopilot/index.tsx`)
- 尝试使用真实 API 创建 AI Session
- 如果 API 不可用，自动降级到 Mock 模拟
- 轮询 Session 状态更新
- 显示实际 API 结果（如果可用）

**改动：**
```typescript
// 新增 API 调用
try {
  const session = await aiSessionsApi.create(goal, currentProject);
  // 轮询状态
  const stopPolling = await aiSessionsApi.poll(session.id, (updated) => {
    // 更新 UI
  });
} catch {
  // API 不可用，使用 Mock 模拟
}
```

## 使用方法

### 环境变量配置

在 `.env` 中配置 API 地址（可选，默认为 `http://localhost:4100`）：

```env
VITE_XINGJING_API_URL=http://localhost:4100
```

### 在组件中使用 API

#### 方法 1：useApi Hook（推荐用于读取）

```typescript
import { useApi } from '@/hooks/useApi';
import { metricsApi } from '@/api';
import { doraMetrics } from '@/mock/dora';

function MyComponent() {
  const { data, loading, error, isUsingFallback } = useApi(
    () => metricsApi.get(),
    doraMetrics, // Mock fallback
  );

  if (loading) return <Spin />;
  if (error && !isUsingFallback) return <Alert type="error" message={error} />;

  return <div>{/* 使用 data */}</div>;
}
```

#### 方法 2：useMutation Hook（推荐用于写入）

```typescript
import { useMutation } from '@/hooks/useApi';
import { aiSessionsApi } from '@/api';

function MyComponent() {
  const { execute, loading, error } = useMutation(
    (goal: string) => aiSessionsApi.create(goal)
  );

  const handleCreate = async () => {
    try {
      const result = await execute('目标');
      console.log('成功:', result);
    } catch (err) {
      console.error('失败:', err);
    }
  };

  return <button onClick={handleCreate} disabled={loading}>创建</button>;
}
```

#### 方法 3：直接调用 API

```typescript
import { metricsApi } from '@/api';

async function fetchMetrics() {
  try {
    const metrics = await metricsApi.get();
    return metrics;
  } catch (err) {
    console.error('API 错误:', err);
  }
}
```

### AI Session 轮询示例

```typescript
const sessionId = 'session-123';

// 开始轮询
const stopPolling = await aiSessionsApi.poll(
  sessionId,
  (updated) => {
    console.log('Session status:', updated.status);
    if (updated.result) {
      console.log('Result:', updated.result);
    }
  },
  2000 // 轮询间隔（毫秒）
);

// 组件卸载时停止轮询
useEffect(() => {
  return () => stopPolling();
}, []);
```

## 特性详解

### 1. 自动 Fallback 机制

`useApi` Hook 自动处理 API 不可用的情况：

```
API 不可用 → 自动使用 Mock 数据 → 显示 "演示数据" 提示
```

这确保了应用在后端服务离线时仍然可用。

### 2. API 状态指示器

Dashboard 和其他页面显示 API 连接状态：

- 绿色 + "已连接" - API 正常
- 橙色 + "演示数据" - 使用 Mock Fallback

### 3. 错误处理

所有 API 错误都包含 `status` 属性：

```typescript
try {
  const data = await api.get('/some-path');
} catch (err) {
  console.error('Status:', (err as any).status);
  console.error('Message:', err.message);
}
```

### 4. 请求头自动注入

所有请求自动包含：
```
Content-Type: application/json
```

## 扩展指南

### 添加新的 API 端点

在 `src/api/index.ts` 中添加：

```typescript
export const newApi = {
  list: (filter?: string) =>
    api.get<NewType[]>(`/api/new${filter ? `?filter=${filter}` : ''}`),

  get: (id: string) =>
    api.get<NewType>(`/api/new/${id}`),

  create: (data: Partial<NewType>) =>
    api.post<NewType>('/api/new', data),

  update: (id: string, data: Partial<NewType>) =>
    api.put<NewType>(`/api/new/${id}`, data),

  delete: (id: string) =>
    api.del(`/api/new/${id}`),
};
```

### 添加新的类型

在 `src/api/types.ts` 中添加：

```typescript
export interface NewType {
  id: string;
  name: string;
  // 其他字段
}
```

## API 响应期望

### 标准响应格式

#### 单个资源
```json
{
  "id": "123",
  "name": "Example"
}
```

#### 列表响应
```json
[
  { "id": "1", "name": "Item 1" },
  { "id": "2", "name": "Item 2" }
]
```

#### AI Session
```json
{
  "id": "session-123",
  "goal": "目标描述",
  "status": "running|done|failed",
  "result": "执行结果",
  "createdAt": "2026-04-11T00:00:00Z",
  "updatedAt": "2026-04-11T00:00:00Z"
}
```

#### DORA Metrics
```json
[
  {
    "period": "2026-04",
    "deployFrequency": 14,
    "changeLeadTime": 3.2,
    "changeFailureRate": 4.2,
    "mttr": 3.2
  }
]
```

## 测试 API 连接

### 1. 启动 xingjing-server
```bash
# 确保后端服务运行在 http://localhost:4100
```

### 2. 在浏览器控制台测试
```javascript
// 导入 API
import { metricsApi } from './api';

// 测试获取指标
metricsApi.get()
  .then(data => console.log('Success:', data))
  .catch(err => console.error('Error:', err));
```

### 3. 检查 Network Tab
- 确认请求到达正确的 URL
- 检查响应状态码和内容
- 查看错误消息（如果有）

## 故障排除

### API 始终返回 Mock 数据

**原因：** xingjing-server 未运行或无法访问

**解决：**
1. 确认后端服务运行：`curl http://localhost:4100`
2. 检查防火墙设置
3. 查看浏览器控制台错误

### CORS 错误

**原因：** 后端未配置 CORS

**解决：** 在 xingjing-server 中添加 CORS 头：
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE
Access-Control-Allow-Headers: Content-Type
```

### 轮询未停止

**原因：** 未调用 cleanup 函数

**解决：**
```typescript
useEffect(() => {
  let stopPolling: () => void;

  aiSessionsApi.poll(id, onUpdate)
    .then(fn => { stopPolling = fn; });

  // 组件卸载时停止
  return () => stopPolling?.();
}, []);
```

## 性能考虑

### 轮询间隔

- 默认 2000ms（2秒）
- 对于实时性要求高的场景，可降低到 1000ms
- 对于后台任务，可增加到 5000ms 以上

### 请求缓存

考虑使用 React Query 或 SWR 进行缓存：

```typescript
// 示例：使用 React Query
import { useQuery } from '@tanstack/react-query';

function MyComponent() {
  const { data, isLoading } = useQuery({
    queryKey: ['metrics'],
    queryFn: () => metricsApi.get(),
  });
}
```

## 文件大小统计

| 文件 | 大小 |
|------|------|
| client.ts | 1.8 KB |
| index.ts | 5.5 KB |
| types.ts | 0.9 KB |
| useApi.ts | 3.0 KB |
| examples.tsx | 5.5 KB |
| README.md | 5.0 KB |
| **总计** | **21.7 KB** |

## 下一步

1. 启动 xingjing-server 服务
2. 在 Dashboard 页面验证 API 连接状态指示器
3. 在 Autopilot 页面启动自动驾驶，验证 AI Session 创建
4. 根据需要扩展其他页面的 API 集成
5. 考虑添加请求/响应日志用于调试

## 参考资源

- API 模块源代码：`src/api/`
- React Hooks：`src/hooks/useApi.ts`
- 使用示例：`src/api/examples.tsx`
- 完整文档：`src/api/README.md`
