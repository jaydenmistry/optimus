'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { Store } from './types';

/**
 * Load data with `fn`, re-running when `deps` change. Previous data stays
 * visible while a reload is in flight (`refreshing`), so screens don't
 * flash back to a skeleton on every filter change.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const requestId = useRef(0);
  const hasData = useRef(false);

  const run = useCallback(async (opts?: { silent?: boolean }) => {
    const id = ++requestId.current;
    if (!hasData.current) setLoading(true);
    else if (!opts?.silent) setRefreshing(true);
    try {
      const result = await fnRef.current();
      if (id !== requestId.current) return;
      setData(result);
      hasData.current = true;
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, refreshing, reload: run, setData };
}

/** Call `fn` every `ms` while the tab is visible (and once on becoming visible). */
export function useInterval(fn: () => void, ms: number, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer == null) timer = setInterval(() => fnRef.current(), ms);
    };
    const stop = () => {
      if (timer != null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        fnRef.current();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ms, enabled]);
}

let storesCache: Store[] | null = null;

/** Store list from the API, cached for the session */
export function useStores() {
  const [stores, setStores] = useState<Store[]>(storesCache ?? []);
  useEffect(() => {
    if (storesCache) return;
    api
      .getStores()
      .then((s) => {
        storesCache = s;
        setStores(s);
      })
      .catch(() => setStores([]));
  }, []);
  return stores;
}

/** Re-render every `ms` so relative times ("8s ago") stay current */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useInterval(() => setNow(Date.now()), ms);
  return now;
}
