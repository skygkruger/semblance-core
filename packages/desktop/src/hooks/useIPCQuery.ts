// Generic hook for async IPC queries with loading/error state.

import { useState, useEffect, useCallback, useRef } from 'react';

interface IPCQueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Wraps an async IPC command with loading/error state management.
 *
 * @param queryFn - Async function that returns data (from ipc/commands.ts)
 * @param deps - Dependencies array that triggers re-fetch when changed
 * @param options - Configuration options
 *
 * @example
 * const { data, loading, error, refetch } = useIPCQuery(
 *   () => getInboxItems(50, 0),
 *   []
 * );
 */
export function useIPCQuery<T>(
  queryFn: () => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
  options?: { enabled?: boolean }
): IPCQueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const execute = useCallback(async () => {
    if (options?.enabled === false) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await queryFn();
      if (mountedRef.current) {
        setData(result);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    void execute();
    return () => {
      mountedRef.current = false;
    };
  }, [execute]);

  return { data, loading, error, refetch: execute };
}
