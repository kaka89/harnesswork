# API 快速开始指南

## 5 分钟快速上手

### 1. 验证 API 连接

访问 Dashboard 页面，检查左上角的状态指示器：
- 绿色 "已连接" → API 正常运行
- 橙色 "演示数据" → 服务离线，使用 Mock 数据

### 2. 最常见的用法

#### 获取数据
```typescript
import { useApi } from '@/hooks/useApi';
import { metricsApi } from '@/api';
import { doraMetrics } from '@/mock/dora';

const { data, loading, error, isUsingFallback } = useApi(
  () => metricsApi.get(),
  doraMetrics,
);
```

#### 修改数据
```typescript
import { useMutation } from '@/hooks/useApi';
import { productsApi } from '@/api';

const { execute, loading } = useMutation((name: string) =>
  productsApi.create({ name, description: '', type: '', mode: 'team' })
);

const result = await execute('Product Name');
```

#### AI 自动驾驶
```typescript
import { aiSessionsApi } from '@/api';

const session = await aiSessionsApi.create('目标', productId);

const stopPolling = await aiSessionsApi.poll(
  session.id,
  (updated) => {
    console.log(updated.status, updated.result);
  }
);
```

### 3. 可用的 API

| 模块 | 方法 |
|------|------|
| `productsApi` | `.list()`, `.create()`, `.update()`, `.remove()` |
| `prdsApi` | `.list()`, `.create()`, `.update()`, `.remove()` |
| `tasksApi` | `.list()`, `.create()`, `.update()`, `.remove()` |
| `backlogApi` | `.list()`, `.create()`, `.update()` |
| `sprintsApi` | `.list()`, `.create()`, `.update()` |
| `knowledgeApi` | `.list()`, `.create()`, `.update()` |
| `metricsApi` | `.get()`, `.list()` |
| `aiSessionsApi` | `.list()`, `.create()`, `.get()`, `.poll()` |

### 4. 配置（可选）

在 `.env` 中设置 API 地址：
```env
VITE_XINGJING_API_URL=http://localhost:4100
```

默认值：`http://localhost:4100`

## 关键特性

- **自动 Fallback**：API 不可用时自动使用 Mock 数据
- **类型安全**：完整的 TypeScript 支持
- **错误处理**：所有错误都有状态码和消息
- **状态轮询**：AI Session 实时状态更新

## 常见问题

**Q: 如何知道是否使用了 Mock 数据？**
A: 检查 `isUsingFallback` 标志或 Dashboard 的状态指示器。

**Q: API 不可用会怎样？**
A: 自动使用 Mock 数据，应用继续正常运行。

**Q: 如何停止轮询？**
A: 调用 `aiSessionsApi.poll()` 返回的函数。

**Q: 如何添加新的 API？**
A: 在 `src/api/index.ts` 中添加新模块，参考现有模式。

## 文件位置

```
src/
├── api/
│   ├── client.ts      ← HTTP 客户端
│   ├── index.ts       ← API 定义（主要编辑这里）
│   ├── types.ts       ← 类型定义
│   ├── examples.tsx   ← 使用示例
│   └── README.md      ← 完整文档
└── hooks/
    └── useApi.ts      ← React Hooks
```

## 下一步

1. 打开 Dashboard 验证连接
2. 在 Autopilot 页面测试 AI Session
3. 在 `src/api/examples.tsx` 查看更多示例
4. 参考 `src/api/README.md` 了解详细文档

## 技术支持

遇到问题？检查：
1. 后端服务是否运行在 `http://localhost:4100`
2. 浏览器控制台错误信息
3. Network tab 中的请求状态
4. `src/api/README.md` 故障排除部分
