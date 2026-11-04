'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { notifyDataChanged, useAsync, useInterval } from '@/lib/hooks';
import type { ScenarioKind, SimulationStatus } from '@/lib/types';
import { useToast } from '@/components/ui/overlay';

/** Where to look after starting each scenario */
const FOLLOW_UP: Record<ScenarioKind, { label: string; href: string }> = {
  cooler_failure: { label: 'View sensors', href: '/' },
  catering_order: { label: 'View transfers', href: '/transfers' },
  unrecorded_loss: { label: 'View overview', href: '/' },
  deliveries: { label: 'View overview', href: '/' },
};

interface SimulationContextValue {
  status: SimulationStatus | null;
  open: boolean;
  setOpen: (open: boolean) => void;
  busy: string | null;
  start: (kind: ScenarioKind, storeId: number) => Promise<void>;
  end: (id: number) => Promise<void>;
  reset: () => Promise<void>;
  /** Store with a running cooler failure, so Overview can show its sensors */
  coolerFailureStore: number | null;
}

const SimulationContext = createContext<SimulationContextValue | null>(null);

function cleanError(err: unknown) {
  const message = err instanceof Error ? err.message : 'Something went wrong';
  return message.replace(/\s*\(\d{3}\)$/, '');
}

export function SimulationProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { data: status, reload } = useAsync(() => api.getSimulationStatus().catch(() => null), []);

  // Poll faster while someone is watching a scenario play out
  const activeCount = status?.active.length ?? 0;
  useInterval(() => reload({ silent: true }), open ? 5000 : activeCount ? 15000 : 60000);

  // Whenever the set of running scenarios changes (started, ended, expired),
  // tell every page to refetch so the effect shows up everywhere.
  const activeKey = status?.active.map((a) => a.id).join(',') ?? '';
  const previousKey = useRef<string | null>(null);
  useEffect(() => {
    if (previousKey.current !== null && previousKey.current !== activeKey) notifyDataChanged();
    previousKey.current = activeKey;
  }, [activeKey]);

  const start = useCallback(
    async (kind: ScenarioKind, storeId: number) => {
      setBusy(kind);
      try {
        const s = await api.startScenario(kind, storeId);
        const follow = FOLLOW_UP[kind];
        toast.show({
          tone: 'success',
          title: `${s.title} started`,
          message: s.summary,
          action: { ...follow, onClick: () => setOpen(false) },
        });
        reload({ silent: true });
      } catch (err) {
        toast.show({ tone: 'error', title: 'Couldn’t start scenario', message: cleanError(err) });
      } finally {
        setBusy(null);
      }
    },
    [toast, reload]
  );

  const end = useCallback(
    async (id: number) => {
      setBusy(`end-${id}`);
      try {
        await api.endScenario(id);
        toast.show({ tone: 'success', title: 'Scenario ended', message: 'Its changes were undone.' });
        reload({ silent: true });
      } catch (err) {
        toast.show({ tone: 'error', title: 'Couldn’t end scenario', message: cleanError(err) });
      } finally {
        setBusy(null);
      }
    },
    [toast, reload]
  );

  const reset = useCallback(async () => {
    setBusy('reset');
    try {
      const { ended } = await api.resetScenarios();
      toast.show({
        tone: 'success',
        title: 'Demo reset',
        message: ended ? `Ended ${ended} scenario${ended === 1 ? '' : 's'} and undid their changes.` : 'Nothing was running.',
      });
      reload({ silent: true });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Couldn’t reset', message: cleanError(err) });
    } finally {
      setBusy(null);
    }
  }, [toast, reload]);

  const coolerFailureStore = status?.active.find((a) => a.kind === 'cooler_failure')?.store_id ?? null;

  return (
    <SimulationContext.Provider value={{ status, open, setOpen, busy, start, end, reset, coolerFailureStore }}>
      {children}
    </SimulationContext.Provider>
  );
}

export function useSimulation() {
  const ctx = useContext(SimulationContext);
  if (!ctx) throw new Error('useSimulation must be used inside SimulationProvider');
  return ctx;
}
