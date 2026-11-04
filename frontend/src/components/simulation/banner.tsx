'use client';

import { FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSimulation } from './provider';

/** Disclaimer shown on every page: this is a demo with simulated data. */
export function DemoBanner() {
  const { setOpen, status } = useSimulation();
  const running = status?.active.length ?? 0;
  return (
    <div className="hairline-b bg-accent/8 dark:bg-accent/15">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 sm:px-6 lg:px-8">
        <FlaskConical className="h-4 w-4 shrink-0 text-accent-text" aria-hidden />
        <p className="min-w-0 flex-1 text-footnote text-label">
          <span className="font-semibold">Demo with simulated data.</span>{' '}
          <span className="text-label-secondary">
            The stores, sales, inventory and sensor readings are generated, not real, and this project isn&apos;t
            affiliated with Chipotle.
          </span>
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-footnote font-semibold text-accent-contrast transition hover:brightness-110"
        >
          Run a scenario
          {running > 0 && (
            <span className="rounded-full bg-white/25 px-1.5 text-caption tabular">{running}</span>
          )}
        </button>
      </div>
    </div>
  );
}

/** Compact nav-bar button that opens the simulation panel */
export function SimulationButton({ className }: { className?: string }) {
  const { setOpen, status } = useSimulation();
  const running = status?.active.length ?? 0;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={running ? `Simulation, ${running} running` : 'Simulation'}
      className={cn(
        'relative inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-subhead font-medium text-label-secondary transition-colors hover:bg-fill/15 hover:text-label',
        className
      )}
    >
      <FlaskConical className="h-[18px] w-[18px]" aria-hidden />
      <span className="hidden lg:inline">Simulate</span>
      {running > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-sys-orange lg:static" aria-hidden />}
    </button>
  );
}
