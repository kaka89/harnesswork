/**
 * useApi Hook - Data fetching with loading/error states and mock fallback
 * Automatically falls back to mock data when API is unavailable
 * SolidJS version using signals
 */

import { createSignal, createEffect, onCleanup } from 'solid-js';

export interface UseApiState<T> {
  data: () => T;
  loading: () => boolean;
  error: () => string | null;
  isUsingFallback: () => boolean;
  refetch: () => void;
}

/**
 * Generic data fetching hook with automatic fallback
 * @param fetcher Async function to fetch data from API
 * @param fallback Default/mock data to use if API fails
 * @returns State object with data, loading, error, isUsingFallback, and refetch
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  fallback: T,
): UseApiState<T> {
  const [data, setData] = createSignal<T>(fallback);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [isUsingFallback, setIsUsingFallback] = createSignal(false);
  const [refetchTrigger, setRefetchTrigger] = createSignal(0);

  createEffect(() => {
    // Track refetchTrigger to re-run effect
    refetchTrigger();

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetcher()
      .then((result) => {
        if (!cancelled) {
          setData(() => result);
          setError(null);
          setIsUsingFallback(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.warn('[useApi] Server unavailable, using fallback:', errorMessage);
          setError(errorMessage);
          setData(() => fallback);
          setIsUsingFallback(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    onCleanup(() => {
      cancelled = true;
    });
  });

  const refetch = () => {
    setRefetchTrigger((prev) => prev + 1);
  };

  return { data, loading, error, isUsingFallback, refetch };
}

/**
 * Hook for mutations (POST, PUT, DELETE)
 * Useful for create/update operations
 */
export interface UseMutationState<T> {
  data: () => T | null;
  loading: () => boolean;
  error: () => string | null;
  execute: (input?: unknown) => Promise<T>;
}

export function useMutation<T>(
  mutator: (input?: unknown) => Promise<T>,
): UseMutationState<T> {
  const [data, setData] = createSignal<T | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const execute = async (input?: unknown) => {
    setLoading(true);
    setError(null);
    try {
      const result = await mutator(input);
      setData(() => result);
      return result;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { data, loading, error, execute };
}
