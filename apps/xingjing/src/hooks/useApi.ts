/**
 * useApi Hook - Data fetching with loading/error states and mock fallback
 * Automatically falls back to mock data when API is unavailable
 */

import { useState, useEffect, useCallback } from 'react';

export interface UseApiState<T> {
  data: T;
  loading: boolean;
  error: string | null;
  isUsingFallback: boolean;
  refetch: () => void;
}

/**
 * Generic data fetching hook with automatic fallback
 * @param fetcher Async function to fetch data from API
 * @param fallback Default/mock data to use if API fails
 * @param deps Dependency array for effect
 * @returns State object with data, loading, error, isUsingFallback, and refetch
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  fallback: T,
  deps: unknown[] = [],
): UseApiState<T> {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUsingFallback, setIsUsingFallback] = useState(false);
  const [refetchCount, setRefetchCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetcher()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
          setIsUsingFallback(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.warn('[useApi] Server unavailable, using fallback:', errorMessage);
          setError(errorMessage);
          setData(fallback);
          setIsUsingFallback(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refetchCount, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  const refetch = useCallback(() => {
    setRefetchCount((prev) => prev + 1);
  }, []);

  return { data, loading, error, isUsingFallback, refetch };
}

/**
 * Hook for mutations (POST, PUT, DELETE)
 * Useful for create/update operations
 */
export interface UseMutationState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  execute: (input?: unknown) => Promise<T>;
}

export function useMutation<T>(
  mutator: (input?: unknown) => Promise<T>,
): UseMutationState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(
    async (input?: unknown) => {
      setLoading(true);
      setError(null);
      try {
        const result = await mutator(input);
        setData(result);
        return result;
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [mutator],
  );

  return { data, loading, error, execute };
}
