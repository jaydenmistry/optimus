'use client';

import { useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, Flame, Timer } from 'lucide-react';
import { api } from '@/lib/api';
import type { PeakHoursDashboard, PrepRecommendation } from '@/lib/types';
import { cn, formatMinutes, formatTime } from '@/lib/utils';
import { useAsync, useInterval, useStores } from '@/lib/hooks';
import {
  ButtonLink,
  Card,
  Container,
  EmptyState,
  ErrorCard,
  PageHeader,
  Picker,
  Section,
  Skeleton,
  StatusBadge,
  type Tone,
} from '@/components/ui';
import { HourlyDemandChart, LegendItem } from '@/components/ui/charts';

const PRIORITY: Record<string, { tone: Tone; label: string }> = {
  critical: { tone: 'red', label: 'Critical' },
  high: { tone: 'orange', label: 'High' },
  medium: { tone: 'yellow', label: 'Medium' },
  low: { tone: 'blue', label: 'Low' },
};

const DAY_START = 6;
const DAY_END = 23;
const PEAKS = [
  { label: 'Lunch', start: 11, end: 14 },
  { label: 'Dinner', start: 17, end: 20 },
];

export default function PeakHoursPage() {
  const stores = useStores();
  const [selectedId, setStoreId] = useState<number>(1);
  // Fall back to the first store if the selection doesn't exist (e.g. after a data reset)
  const storeId = stores.length && !stores.some((s) => s.id === selectedId) ? stores[0].id : selectedId;

  const dash = useAsync(() => api.getPeakHoursDashboard(storeId), [storeId]);
  useInterval(() => dash.reload({ silent: true }), 60000);
  const data = dash.data;

  return (
    <Container>
      <PageHeader
        title="Peak Hours"
        subtitle="Hourly demand forecast and prep plan for the lunch and dinner rushes."
        actions={
          <Picker
            label="Store"
            options={stores.map((s) => ({ value: s.id, label: s.name }))}
            value={storeId}
            onChange={setStoreId}
          />
        }
      />

      {dash.error && <ErrorCard className="mb-6" message={dash.error} onRetry={() => dash.reload()} />}

      {dash.loading ? (
        <PeakSkeleton />
      ) : data ? (
        <div className={cn('transition-opacity duration-200', dash.refreshing && 'opacity-60')}>
          <NowCard summary={data.summary} />

          {data.summary.at_risk_items.length > 0 && (
            <section
              aria-labelledby="at-risk-title"
              className="mb-8 overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-sys-red/25"
            >
              <div className="flex items-center gap-2.5 bg-sys-red/10 px-4 py-3">
                <AlertTriangle className="h-5 w-5 text-sys-red" aria-hidden />
                <h2 id="at-risk-title" className="text-headline">
                  {data.summary.total_at_risk} {data.summary.total_at_risk === 1 ? 'item' : 'items'} will run out during a rush
                </h2>
              </div>
              <ul>
                {data.summary.at_risk_items.map((item, i) => (
                  <li key={i} className="list-row pl-4 pr-4">
                    <div className="list-row-body flex flex-wrap items-baseline justify-between gap-2 py-3">
                      <p className="text-body font-medium">{item.sku_name}</p>
                      <p className="tabular text-subhead text-label-secondary">
                        Runs out at <span className="font-semibold text-sys-red">{formatTime(item.stockout_time)}</span> ·{' '}
                        {item.peak_period} rush{item.hours_until > 0 ? ` · in ${item.hours_until}h` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Section
            title="Prep Schedule"
            description={
              data.total_prep_tasks === 0
                ? 'No tasks today'
                : `${data.total_prep_tasks} ${data.total_prep_tasks === 1 ? 'task' : 'tasks'} today, in order`
            }
          >
            {data.prep_schedule.length === 0 ? (
              <EmptyState icon={<CheckCircle2 />} title="Nothing to prep" message="Every item has enough stock for today's rushes." />
            ) : (
              <ol className="py-2">
                {[...data.prep_schedule]
                  .sort((a, b) => Date.parse(a.prep_time) - Date.parse(b.prep_time))
                  .map((prep, i, arr) => (
                    <PrepRow key={`${prep.sku_id}-${i}`} prep={prep} last={i === arr.length - 1} />
                  ))}
              </ol>
            )}
          </Section>

          <Section
            bare
            title="Hourly Forecast"
            description="Items closest to running out today"
            action={
              <div className="flex items-center gap-4">
                <LegendItem color="bg-accent" label="Regular" />
                <LegendItem color="bg-sys-orange" label="Peak" />
              </div>
            }
            footer="Lunch rush 11:00 AM – 2:00 PM · Dinner rush 5:00 PM – 8:00 PM"
          >
            {data.critical_items.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<BarChart3 />}
                  title="No hourly data yet"
                  message="Regenerate demo data to populate hourly sales and forecasts."
                  action={
                    <ButtonLink href="/admin" variant="tinted">
                      Go to Admin
                    </ButtonLink>
                  }
                />
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {data.critical_items.slice(0, 6).map((item) => (
                  <Card key={item.sku_id} className="p-4 sm:p-5">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-headline">{item.sku_name}</h3>
                        <p className="text-footnote text-label-secondary">
                          {item.category} · {item.on_hand} on hand
                        </p>
                      </div>
                      {item.stockout_prediction.will_stockout && item.stockout_prediction.stockout_time && (
                        <StatusBadge tone="red">Out at {formatTime(item.stockout_prediction.stockout_time)}</StatusBadge>
                      )}
                    </div>
                    {item.hourly_forecast.length === 0 ? (
                      <p className="py-8 text-center text-footnote text-label-secondary">No hourly data for this item yet.</p>
                    ) : (
                      <HourlyDemandChart
                        height={150}
                        data={item.hourly_forecast.map((f) => ({
                          label: f.hour_display,
                          demand: f.predicted_demand,
                          isPeak: f.is_peak_hour,
                        }))}
                      />
                    )}
                  </Card>
                ))}
              </div>
            )}
          </Section>
        </div>
      ) : null}
    </Container>
  );
}

/* -------------------------------------------------------------------------- */

function hourLabel(h: number) {
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${h < 12 || h === 24 ? 'a' : 'p'}`;
}

/** Current time, countdown and a day timeline with the rush windows shaded */
function NowCard({ summary }: { summary: PeakHoursDashboard['summary'] }) {
  const now = new Date(summary.current_time);
  const nowHours = now.getHours() + now.getMinutes() / 60;
  const span = DAY_END - DAY_START;
  const pos = (h: number) => `${((Math.min(Math.max(h, DAY_START), DAY_END) - DAY_START) / span) * 100}%`;
  // Minutes until the rush starts, from the exact time (the API rounds to whole hours)
  let minutesUntil = summary.next_peak_hour * 60 - (now.getHours() * 60 + now.getMinutes());
  if (minutesUntil < 0) minutesUntil += 24 * 60;
  const period = summary.next_peak_period;
  const periodName = period.charAt(0).toUpperCase() + period.slice(1);

  return (
    <Card className="mb-8 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-subhead font-medium text-label-secondary">Now</p>
          <p className="tabular text-[2.75rem] font-semibold leading-none tracking-tight">{formatTime(summary.current_time)}</p>
        </div>
        <div className="sm:text-right">
          {summary.is_currently_peak ? (
            <>
              <p className="inline-flex items-center gap-1.5 text-subhead font-semibold text-sys-orange">
                <Flame className="h-4 w-4" aria-hidden />
                {periodName} rush
              </p>
              <p className="text-title-2">In progress</p>
            </>
          ) : (
            <>
              <p className="inline-flex items-center gap-1.5 text-subhead font-medium text-label-secondary">
                <Timer className="h-4 w-4" aria-hidden />
                {periodName} rush starts in
              </p>
              <p className="tabular text-title-2">{formatMinutes(minutesUntil)}</p>
            </>
          )}
        </div>
      </div>

      <div className="mt-6" aria-hidden>
        <div className="relative h-9 overflow-hidden rounded-[10px] bg-fill/12">
          {PEAKS.map((p) => (
            <div
              key={p.label}
              className="absolute inset-y-0 flex items-center justify-center bg-sys-orange/25 text-caption font-semibold text-label"
              style={{ left: pos(p.start), width: `calc(${pos(p.end)} - ${pos(p.start)})` }}
            >
              {p.label}
            </div>
          ))}
          {nowHours >= DAY_START && nowHours <= DAY_END && (
            <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-accent-text" style={{ left: pos(nowHours) }}>
              <span className="absolute -top-px left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-accent-text" />
            </div>
          )}
        </div>
        <div className="relative mt-1.5 h-4 text-caption text-label-secondary">
          {[6, 9, 12, 15, 18, 21].map((h) => (
            <span key={h} className="tabular absolute -translate-x-1/2 first:translate-x-0" style={{ left: pos(h) }}>
              {hourLabel(h)}
            </span>
          ))}
        </div>
      </div>
      <p className="sr-only">
        Lunch rush 11 AM to 2 PM, dinner rush 5 PM to 8 PM.
      </p>
    </Card>
  );
}

function PrepRow({ prep, last }: { prep: PrepRecommendation; last: boolean }) {
  const p = PRIORITY[prep.priority] ?? PRIORITY.low;
  const hours = Math.floor(prep.hours_until_prep);
  const minutes = Math.floor((prep.hours_until_prep % 1) * 60);
  return (
    <li className="relative flex gap-3 px-4 sm:gap-4">
      <div className="tabular w-[4.5rem] shrink-0 pt-3 text-right text-subhead font-semibold">{prep.prep_time_display}</div>
      <div className="relative flex w-3 shrink-0 justify-center" aria-hidden>
        <span className={cn('absolute top-0 w-px bg-separator', last ? 'h-5' : 'h-full')} />
        <span
          className={cn(
            'relative mt-[1.05rem] h-3 w-3 rounded-full ring-4 ring-surface',
            p.tone === 'red' ? 'bg-sys-red' : p.tone === 'orange' ? 'bg-sys-orange' : p.tone === 'yellow' ? 'bg-sys-yellow' : 'bg-sys-blue'
          )}
        />
      </div>
      <div className="min-w-0 flex-1 pb-4 pt-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-headline">{prep.sku_name}</h3>
          <StatusBadge tone={p.tone}>{p.label}</StatusBadge>
          {prep.hours_until_prep > 0 && (
            <span className="tabular ml-auto text-footnote text-label-secondary">in {hours ? `${hours}h ` : ''}{minutes}m</span>
          )}
        </div>
        <p className="mt-0.5 text-subhead text-label-secondary">{prep.reason}</p>
        <p className="tabular mt-1.5 text-footnote">
          Prep <span className="font-semibold">{prep.qty_to_prep} units</span>
          <span className="text-label-secondary"> · {prep.current_on_hand} on hand now</span>
        </p>
      </div>
    </li>
  );
}

function PeakSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading peak hours">
      <Card className="mb-8 p-6">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="mt-2 h-11 w-40" />
        <Skeleton className="mt-6 h-9 w-full" />
      </Card>
      <Card className="mb-8 space-y-4 p-5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </Card>
    </div>
  );
}
