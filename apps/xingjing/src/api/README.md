# API Client Module

完整的 API 客户端模块，用于与 xingjing-server 通信。

## 文件结构

```
src/api/
├── client.ts       # 基础 HTTP 客户端
├── index.ts        # API 端点定义（主入口）
├── types.ts        # TypeScript 类型定义
└── README.md       # 本文件
```

## 配置

API 基础 URL 通过环境变量配置：

```env
VITE_XINGJING_API_URL=http://localhost:4100
```

如果未设置，默认使用 `http://localhost:4100`。

## 使用示例

### 获取 DORA 指标

```typescript
import { metricsApi } from '@/api';

const metrics = await metricsApi.get();
```

### 创建 AI Session

```typescript
import { aiSessionsApi } from '@/api';

const session = await aiSessionsApi.create('为苍穹增加新功能', 'product-123');
```

### 轮询 AI Session 状态

```typescript
const stopPolling = await aiSessionsApi.poll(
  session.id,
  (updated) => {
    console.log('Session updated:', updated);
  },
  2000 // 轮询间隔（毫秒）
);

// 停止轮询
stopPolling();
```

## Hook 使用

### useApi Hook - 数据获取

```typescript
import { useApi } from '@/hooks/useApi';
import { metricsApi } from '@/api';
import { doraMetrics } from '@/mock/dora';

function MyComponent() {
  const { data, loading, error, isUsingFallback, refetch } = useApi(
    () => metricsApi.get(),
    doraMetrics, // 如果 API 失败，使用 mock 数据作为 fallback
  );

  if (loading) return <div>加载中...</div>;
  if (error) return <div>错误：{error}</div>;

  return (
    <div>
      {isUsingFallback && <p>使用演示数据（服务器离线）</p>}
      {/* 使用 data */}
    </div>
  );
}
```

### useMutation Hook - 数据修改

```typescript
import { useMutation } from '@/hooks/useApi';
import { aiSessionsApi } from '@/api';

function MyComponent() {
  const { data, loading, error, execute } = useMutation(
    (goal: string) => aiSessionsApi.create(goal)
  );

  const handleClick = async () => {
    try {
      const result = await execute('我的目标');
      console.log('创建成功:', result);
    } catch (err) {
      console.error('创建失败:', err);
    }
  };

  return <button onClick={handleClick} disabled={loading}>创建</button>;
}
```

## API 端点列表

### 产品管理

- `productsApi.list()` - 获取产品列表
- `productsApi.create(data)` - 创建产品
- `productsApi.update(id, data)` - 更新产品
- `productsApi.remove(id)` - 删除产品

### PRD 管理

- `prdsApi.list(productId?)` - 获取 PRD 列表
- `prdsApi.create(data)` - 创建 PRD
- `prdsApi.update(id, data)` - 更新 PRD
- `prdsApi.remove(id)` - 删除 PRD

### 任务管理

- `tasksApi.list(productId?)` - 获取任务列表
- `tasksApi.create(data)` - 创建任务
- `tasksApi.update(id, data)` - 更新任务
- `tasksApi.remove(id)` - 删除任务

### 积压项管理

- `backlogApi.list(productId?)` - 获取积压项列表
- `backlogApi.create(data)` - 创建积压项
- `backlogApi.update(id, data)` - 更新积压项

### Sprint 管理

- `sprintsApi.list(productId?)` - 获取 Sprint 列表
- `sprintsApi.create(data)` - 创建 Sprint
- `sprintsApi.update(id, data)` - 更新 Sprint

### 知识库

- `knowledgeApi.list(category?)` - 获取知识文档列表
- `knowledgeApi.create(data)` - 创建知识文档
- `knowledgeApi.update(id, data)` - 更新知识文档

### 效能指标

- `metricsApi.get(period?)` - 获取 DORA 指标
- `metricsApi.list(period?)` - 列表方式获取指标

### AI Sessions (自动驾驶)

- `aiSessionsApi.list(productId?)` - 获取 AI Session 列表
- `aiSessionsApi.create(goal, productId?)` - 创建 AI Session
- `aiSessionsApi.get(id)` - 获取单个 Session
- `aiSessionsApi.poll(id, onUpdate, intervalMs?)` - 轮询 Session 状态

## 错误处理

所有 API 调用都会在出错时抛出 `Error`，错误对象包含 `status` 属性：

```typescript
try {
  const metrics = await metricsApi.get();
} catch (err) {
  console.error('API 错误:', err.message);
  console.error('状态码:', (err as any).status);
}
```

## Mock 数据 Fallback

`useApi` Hook 自动实现了 Mock 数据 fallback 机制：

1. 首先尝试从 API 获取数据
2. 如果网络错误或服务器不可用，自动使用提供的 fallback 数据
3. 设置 `isUsingFallback` 标志，UI 可据此显示 "离线模式" 提示

这确保了即使后端服务离线，前端仍然可以正常运行。

## 类型定义

所有 API 响应都有完整的 TypeScript 类型定义：

```typescript
import type { Product, DoraMetrics, AiSession, PRD, Task } from '@/api';
```

## 扩展 API

要添加新的 API 端点，在 `src/api/index.ts` 中添加：

```typescript
export const newApi = {
  get: (id: string) =>
    api.get<NewType>(`/api/new/${id}`),

  create: (data: Partial<NewType>) =>
    api.post<NewType>('/api/new', data),
};
```

## 注意事项

1. 所有 API 调用都是异步的，返回 Promise
2. 使用 `useApi` Hook 时，确保提供合理的 mock fallback 数据
3. 轮询 AI Session 时，记得在组件卸载时清理定时器
4. 跨域请求需要后端配置 CORS 头
