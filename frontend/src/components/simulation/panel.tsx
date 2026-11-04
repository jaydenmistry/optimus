'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FlaskConical,
  PackageCheck,
  RotateCcw,
  SearchX,
  ThermometerSnowflake,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import type { ScenarioKind } from '@/lib/types';
import { formatDate, shortStoreName } from '@/lib/utils';
import { useInterval, useIsClient, useLatest, useStores } from '@/lib/hooks';
import { Button, IconButton } from '@/components/ui/button';
import { Picker } from '@/components/ui/controls';
import { IconTile, type Tone } from '@/components/ui/layout';
import { useSimulation } from './provider';
import { AnimatePresence, motion } from 'motion/react';
import { EASE_OUT, useMediaQuery } from '@/components/ui/motion';

const SCENARIO_LOOK: Record<ScenarioKind, { icon: React.ReactNode; tone: Tone }> = {
  cooler_failure: { icon: <ThermometerSnowflake />, tone: 'teal' },
  catering_order: { icon: <UtensilsCrossed />, tone: 'orange' },
  unrecorded_loss: { icon: <SearchX />, tone: 'red' },
  deliveries: { icon: <PackageCheck />, tone: 'green' },
};

function formatCountdown(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Re-render every second while `enabled`, for countdowns */
function useTicker(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useInterval(() => setNow(Date.now()), 1000, enabled);
  return now;
}

export function SimulationPanel() {
  const { status, open, setOpen, busy, start, end, reset } = useSimulation();
  const stores = useStores();
  const [storeId, setStoreId] = useState(1);
  const mounted = useIsClient();
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const setOpenRef = useLatest(setOpen);
  const now = useTicker(open);
  const desktop = useMediaQuery('(min-width: 768px)');

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenRef.current(false);
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, setOpenRef]);

  if (!mounted) return null;

  const storeName = (id: number) => shortStoreName(stores.find((s) => s.id === id)?.name ?? `Store ${id}`);
  const active = status?.active ?? [];
  const enabled = status?.scenarios_enabled ?? false;

  return createPortal(
    <AnimatePresence>
      {open && (
    <motion.div key="simulation-panel" className="fixed inset-0 z-[90] flex items-end justify-end md:items-stretch">
      <motion.div
        className="absolute inset-0 bg-black/30 dark:bg-black/50"
        onClick={() => setOpen(false)}
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // Desktop: slides in from the right edge. Phones: slides up from the bottom.
        initial={desktop ? { x: '100%' } : { y: '100%' }}
        animate={desktop ? { x: 0 } : { y: 0 }}
        exit={desktop ? { x: '100%' } : { y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        className="relative flex max-h-[88vh] w-full flex-col rounded-t-[1.25rem] bg-canvas shadow-float md:max-h-none md:w-[27rem] md:rounded-none md:rounded-l-[1.25rem]"
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-4">
          <h2 id={titleId} className="flex items-center gap-2 text-title-3">
            <FlaskConical className="h-5 w-5 text-accent-text" aria-hidden />
            Simulation
          </h2>
          <IconButton ref={closeRef} aria-label="Close simulation panel" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" aria-hidden />
          </IconButton>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <div className="rounded-card bg-surface p-4 text-subhead shadow-card dark:bg-elevated">
            <p className="font-semibold">Everything here is simulated.</p>
            <p className="mt-1 text-label-secondary">
              The hackathon is over and the Arduino sensor isn&apos;t connected anymore, so a simulator keeps the demo
              running.
            </p>
            <ul className="mt-3 space-y-1.5 text-footnote text-label-secondary">
              <li>
                · New sales, deliveries and counts are generated every day
                {status?.data_through ? ` (data through ${formatDate(status.data_through, { year: false })})` : ''}.
              </li>
              {status?.sensors_simulated && <li>· Sensor readings arrive every {status.sensor_interval_seconds} seconds.</li>}
              <li>· The scenarios below trigger events so you can watch the dashboard react.</li>
            </ul>
          </div>

          {enabled ? (
            <>
              <div className="mt-6 flex items-center justify-between gap-3 px-1">
                <h3 className="text-headline">Run a scenario</h3>
                <Picker
                  label="Store"
                  align="right"
                  options={stores.map((s) => ({ value: s.id, label: shortStoreName(s.name) }))}
                  value={storeId}
                  onChange={setStoreId}
                />
              </div>

              <ul className="mt-3 space-y-3">
                {(status?.catalog ?? []).map((sc, i) => {
                  const look = SCENARIO_LOOK[sc.kind];
                  const running = active.find((a) => a.kind === sc.kind && a.store_id === storeId);
                  const remaining = running ? Math.max(0, (Date.parse(running.expires_at) - now) / 1000) : 0;
                  return (
                    <motion.li
                      key={sc.kind}
                      className="relative overflow-hidden rounded-card bg-surface p-4 shadow-card dark:bg-elevated"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.08 + i * 0.06 }}
                    >
                      {/* Countdown: drains as the scenario runs */}
                      {running && (
                        <span
                          aria-hidden
                          className="absolute inset-x-0 bottom-0 h-1 origin-left bg-accent/60 transition-transform duration-1000 ease-linear"
                          style={{ transform: `scaleX(${remaining / sc.duration_seconds})` }}
                        />
                      )}
                      <div className="flex items-start gap-3">
                        <IconTile tone={look.tone}>{look.icon}</IconTile>
                        <div className="min-w-0 flex-1">
                          <p className="text-headline">{sc.title}</p>
                          <p className="mt-0.5 text-footnote text-label-secondary">{sc.description}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-end gap-2">
                        {running ? (
                          <>
                            <span className="tabular text-footnote text-label-secondary">
                              Running · {formatCountdown((Date.parse(running.expires_at) - now) / 1000)} left
                            </span>
                            <Button size="sm" variant="gray" loading={busy === `end-${running.id}`} onClick={() => end(running.id)}>
                              End
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="sm"
                            variant="tinted"
                            loading={busy === sc.kind}
                            disabled={busy !== null}
                            onClick={() => start(sc.kind, storeId)}
                          >
                            Run at {storeName(storeId)}
                          </Button>
                        )}
                      </div>
                    </motion.li>
                  );
                })}
              </ul>

              {active.length > 0 && (
                <section className="mt-6" aria-labelledby="running-title">
                  <div className="flex items-center justify-between px-1">
                    <h3 id="running-title" className="text-headline">
                      Running now
                    </h3>
                    <Button size="sm" variant="plain" icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />} loading={busy === 'reset'} onClick={reset}>
                      Reset all
                    </Button>
                  </div>
                  <ul className="mt-2 overflow-hidden rounded-card bg-surface shadow-card dark:bg-elevated">
                    <AnimatePresence initial={false}>
                    {active.map((a) => (
                      <motion.li
                        key={a.id}
                        layout
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: EASE_OUT }}
                        className="list-row flex items-center gap-3 overflow-hidden pl-4 pr-3"
                      >
                        <IconTile tone={SCENARIO_LOOK[a.kind].tone} className="h-7 w-7 rounded-[8px] [&>svg]:h-4 [&>svg]:w-4">
                          {SCENARIO_LOOK[a.kind].icon}
                        </IconTile>
                        <div className="list-row-body flex min-w-0 flex-1 items-center gap-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-subhead font-medium">
                              {a.title} · {storeName(a.store_id)}
                            </p>
                            <p className="truncate text-caption text-label-secondary">{a.summary}</p>
                          </div>
                          <span className="tabular text-footnote text-label-secondary">
                            {formatCountdown((Date.parse(a.expires_at) - now) / 1000)}
                          </span>
                          <Button size="sm" variant="gray" loading={busy === `end-${a.id}`} onClick={() => end(a.id)}>
                            End
                          </Button>
                        </div>
                      </motion.li>
                    ))}
                    </AnimatePresence>
                  </ul>
                </section>
              )}

              <p className="mt-4 px-1 text-footnote text-label-secondary">
                Scenarios undo themselves after 5 to 10 minutes, so the next visitor always sees a normal demo.
              </p>
            </>
          ) : (
            <p className="mt-6 px-1 text-subhead text-label-secondary">Scenarios are turned off on this server.</p>
          )}
        </div>
      </motion.div>
    </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
