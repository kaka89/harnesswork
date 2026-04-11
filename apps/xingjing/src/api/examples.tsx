/**
 * API Usage Examples
 * 演示如何在 React 组件中使用 API 客户端
 */

import React from 'react';
import { Button, Card, Spin, Alert, Empty } from 'antd';
import { metricsApi, aiSessionsApi, productsApi } from './index';
import { useApi, useMutation } from '../hooks/useApi';
import { doraMetrics } from '../mock/dora';

// ─── Example 1: Simple Data Fetching with Fallback ─────

/**
 * 示例：获取 DORA 指标，自动 fallback 到 mock 数据
 */
export const MetricsExample: React.FC = () => {
  const { data, loading, error, isUsingFallback, refetch } = useApi(
    () => metricsApi.get(),
    doraMetrics, // Mock fallback
  );

  if (loading) return <Spin />;

  return (
    <Card title="DORA 指标（自动 Fallback 演示）">
      {error && (
        <Alert
          type="warning"
          message="API 不可用"
          description={error}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      {isUsingFallback && (
        <Alert
          type="info"
          message="使用演示数据"
          description="xingjing-server 离线，展示的是本地 mock 数据"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}
      <pre>{JSON.stringify(data, null, 2)}</pre>
      <Button onClick={refetch} style={{ marginTop: 16 }}>
        刷新数据
      </Button>
    </Card>
  );
};

// ─── Example 2: AI Session Creation ─────

/**
 * 示例：创建 AI Session 并轮询状态
 */
export const AutopilotExample: React.FC = () => {
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = React.useState<string>('idle');

  const { execute: createSession, loading: creating } = useMutation(
    (goal: string) => aiSessionsApi.create(goal),
  );

  const handleStartAutopilot = async () => {
    try {
      const session = await createSession('为苍穹财务增加新功能');
      setSessionId(session.id);
      setSessionStatus('running');

      // 轮询状态
      const stopPolling = await aiSessionsApi.poll(session.id, (updated) => {
        setSessionStatus(updated.status);
        if (updated.status === 'done') {
          console.log('结果:', updated.result);
        }
      });

      // 组件卸载时停止轮询
      return () => stopPolling();
    } catch (err) {
      console.error('创建 AI Session 失败:', err);
      setSessionStatus('failed');
    }
  };

  return (
    <Card title="AI 自动驾驶演示">
      <Button
        type="primary"
        onClick={handleStartAutopilot}
        disabled={creating || sessionId !== null}
        loading={creating}
      >
        启动自动驾驶
      </Button>

      {sessionId && (
        <div style={{ marginTop: 16 }}>
          <Alert
            type={sessionStatus === 'done' ? 'success' : sessionStatus === 'failed' ? 'error' : 'info'}
            message={`Session: ${sessionId}`}
            description={`Status: ${sessionStatus}`}
            showIcon
          />
        </div>
      )}
    </Card>
  );
};

// ─── Example 3: Products CRUD ─────

/**
 * 示例：产品列表和创建
 */
export const ProductsExample: React.FC = () => {
  const { data: products, loading, error, refetch } = useApi(
    () => productsApi.list(),
    [], // Empty array as fallback
  );

  const { execute: createProduct, loading: creating } = useMutation((name: string) =>
    productsApi.create({ name, description: '新产品', type: 'platform', mode: 'team' }),
  );

  const handleCreate = async () => {
    try {
      await createProduct('新产品 ' + Date.now());
      refetch();
    } catch (err) {
      console.error('创建产品失败:', err);
    }
  };

  if (loading) return <Spin />;

  return (
    <Card
      title="产品列表"
      extra={
        <Button type="primary" onClick={handleCreate} loading={creating}>
          创建产品
        </Button>
      }
    >
      {error && <Alert type="error" message={error} />}
      {products.length === 0 ? (
        <Empty description="没有产品" />
      ) : (
        <ul>
          {products.map((p) => (
            <li key={p.id}>{p.name}</li>
          ))}
        </ul>
      )}
    </Card>
  );
};

// ─── Example 4: Error Handling ─────

/**
 * 示例：错误处理最佳实践
 */
export const ErrorHandlingExample: React.FC = () => {
  const [error, setError] = React.useState<string | null>(null);

  const handleFetchWithErrorHandling = async () => {
    try {
      const metrics = await metricsApi.get();
      console.log('成功获取指标:', metrics);
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      const status = (err as any).status;
      setError(`错误 [${status || 'N/A'}]: ${message}`);
    }
  };

  return (
    <Card title="错误处理演示">
      <Button onClick={handleFetchWithErrorHandling} style={{ marginBottom: 16 }}>
        尝试获取数据（会自动 fallback）
      </Button>
      {error && <Alert type="error" message={error} />}
    </Card>
  );
};

// ─── Main Example App ─────

/**
 * 完整示例应用
 */
export const ApiExamplesApp: React.FC = () => {
  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <h1>API 客户端使用示例</h1>
      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <MetricsExample />
        <AutopilotExample />
        <ProductsExample />
        <ErrorHandlingExample />
      </div>
    </div>
  );
};
