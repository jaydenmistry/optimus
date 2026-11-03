'use client';

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'optimus-theme';

/**
 * Runs in <head> before React hydrates so the right palette is applied on
 * first paint (no light flash for dark-mode users).
 */
export const themeInitScript = `(function(){try{var m=localStorage.getItem('${STORAGE_KEY}');var d=m==='dark'||((!m||m==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

/* -------------------------------------------------------------------------- */
/* Theme store: the saved choice (localStorage) plus the OS preference.       */
/* Read through useSyncExternalStore so React never renders a stale value.    */
/* -------------------------------------------------------------------------- */

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function readMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* storage unavailable */
  }
  return 'system';
}

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', listener);
  // Keep tabs in sync when the choice changes in another tab
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    mq.removeEventListener('change', listener);
    window.removeEventListener('storage', listener);
  };
}

// Snapshot is a string so React can compare it cheaply
function getSnapshot(): string {
  const mode = readMode();
  const dark = mode === 'dark' || (mode === 'system' && systemPrefersDark());
  return `${mode}:${dark ? 'dark' : 'light'}`;
}

const getServerSnapshot = () => 'system:light';

/* -------------------------------------------------------------------------- */

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  resolved: 'light',
  setMode: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [mode, resolved] = snapshot.split(':') as [ThemeMode, 'light' | 'dark'];

  // Apply the palette class whenever the resolved theme changes. Read the live
  // value, not `resolved`: the hydration pass renders with the server snapshot
  // (light) and would otherwise flash dark-mode users to light for a frame.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', getSnapshot().endsWith(':dark'));
  }, [resolved]);

  const setMode = useCallback((m: ThemeMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* storage unavailable */
    }
    notify();
  }, []);

  return <ThemeContext.Provider value={{ mode, resolved, setMode }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
