'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api } from './api';
import type { Store } from './types';

// useLayoutEffect warns during server rendering; fall back to useEffect there
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Ref that always holds the latest value, updated before effects run */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useIsomorphicLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** True after hydration on the client, false during server rendering */
const noopSubscribe = () => () => {};
export function useIsClient() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

interface AsyncResult<T> {
  data: T | null;
  error: string | null;
  /** Which request produced this result, as `${depsKey}#${reloadToken}` */
  settledId: string | null;
}

/**
 * Load data with `fn`, re-running when `deps` change. Previous data stays
 * visible while a reload is in flight (`refreshing`), so screens don't flash
 * back to a skeleton on every filter change. `reload({ silent: true })`
 * refetches in the background without the refreshing state.
 *
 * Loading and refreshing are derived from request IDs rather than set inside
 * the effect, so a fetch never triggers an extra synchronous render.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[]) {
  const fnRef = useLatest(fn);
  const depsKey = JSON.stringify(deps);
  const [reload, setReload] = useState({ token: 0, silent: false });
  const requestId = `${depsKey}#${reload.token}`;
  const [result, setResult] = useState<AsyncResult<T>>({ data: null, error: null, settledId: null });

  useEffect(() => {
    let cancelled = false;
    fnRef.current().then(
      (data) => {
        if (!cancelled) setResult({ data, error: null, settledId: requestId });
      },
      (err) => {
        if (!cancelled) {
          const error = err instanceof Error ? err.message : 'Something went wrong';
          setResult((prev) => ({ data: prev.data, error, settledId: requestId }));
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [requestId, fnRef]);

  const pending = result.settledId !== requestId;
  const depsChanged = result.settledId?.split('#')[0] !== depsKey;
  const loading = pending && result.data === null;
  const refreshing = pending && result.data !== null && (depsChanged || !reload.silent);

  const reloadFn = useCallback((opts?: { silent?: boolean }) => {
    setReload((r) => ({ token: r.token + 1, silent: Boolean(opts?.silent) }));
  }, []);

  return { data: result.data, error: pending && result.data === null ? null : result.error, loading, refreshing, reload: reloadFn };
}

/** Call `fn` every `ms` while the tab is visible (and once on becoming visible). */
export function useInterval(fn: () => void, ms: number, enabled = true) {
  const fnRef = useLatest(fn);
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
  }, [ms, enabled, fnRef]);
}

/** Store list from the API, shared by every picker on the page */
export function useStores(): Store[] {
  const { data } = useAsync(loadStores, []);
  return data ?? [];
}

let storesPromise: Promise<Store[]> | null = null;
function loadStores() {
  storesPromise ??= api.getStores().catch(() => {
    storesPromise = null; // let the next mount retry
    return [];
  });
  return storesPromise;
}

/* -------------------------------------------------------------------------- */
/* Cross-page "data changed" signal (fired when a simulation scenario starts,  */
/* ends or expires) so every visible page refetches.                           */
/* -------------------------------------------------------------------------- */

const DATA_CHANGED = 'optimus:data-changed';

export function notifyDataChanged() {
  window.dispatchEvent(new Event(DATA_CHANGED));
}

export function useDataChanged(fn: () => void) {
  const fnRef = useLatest(fn);
  useEffect(() => {
    const handler = () => fnRef.current();
    window.addEventListener(DATA_CHANGED, handler);
    return () => window.removeEventListener(DATA_CHANGED, handler);
  }, [fnRef]);
}
