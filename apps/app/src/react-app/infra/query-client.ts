import { QueryClient } from "@tanstack/react-query";

type QueryClientGlobal = typeof globalThis & {
  __owReactQueryClient?: QueryClient;
};

export function getReactQueryClient(): QueryClient {
  const target = globalThis as QueryClientGlobal;
  if (target.__owReactQueryClient) return target.__owReactQueryClient;
  target.__owReactQueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // 纯缓存订阅 query（由 session-sync setQueryData 写入）不需要拉取，
        // 提供 noop queryFn 避免 TanStack Query v5 "No queryFn" 报错。
        queryFn: () => Promise.resolve(null),
      },
    },
  });
  return target.__owReactQueryClient;
}
