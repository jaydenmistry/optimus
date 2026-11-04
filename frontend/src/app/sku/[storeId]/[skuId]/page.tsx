'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  Minus,
  Package,
  PackagePlus,
  SearchX,
  TrendingUp,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, formatNumber, formatTime } from '@/lib/utils';
import { useAsync, useDataChanged } from '@/lib/hooks';
import {
  Card,
  Container,
  EmptyState,
  ErrorCard,
  GradeRing,
  IconTile,
  KeyValue,
  ListRow,
  PageHeader,
  Section,
  SegmentedControl,
  Skeleton,
  Spinner,
  StatTile,
  StatusBadge,
  StatusDot,
  confidenceTone,
  type Tone,
} from '@/components/ui';
import { DailyDemandChart, HourlyDemandChart, LegendItem } from '@/components/ui/charts';

type View = 'daily' | 'hourly';

/** Only warn about a stockout when it's close enough to act on */
const STOCKOUT_ALERT_DAYS = 7;

const SEVERITY_TONE: Record<string, Tone> = { critical: 'red', high: 'orange', medium: 'yellow', low: 'gray' };

export default function SKUDetailPage() {
  const params = useParams();
  const storeId = parseInt(params.storeId as string, 10);
  const skuId = parseInt(params.skuId as string, 10);
  const [view, setView] = useState<View>('daily');

  const detail = useAsync(() => api.getSKUDetail(storeId, skuId, 30), [storeId, skuId]);
  useDataChanged(() => detail.reload({ silent: true }));
  const [hourlyRequested, setHourlyRequested] = useState(false);
  const hourly = useAsync(
    () => (hourlyRequested ? api.getSKUHourlyForecast(storeId, skuId) : Promise.resolve(null)),
    [storeId, skuId, hourlyRequested]
  );

  function changeView(v: View) {
    setView(v);
    if (v === 'hourly') setHourlyRequested(true);
  }

  const data = detail.data;

  const daily = useMemo(() => {
    if (!data) return { points: [], todayLabel: undefined as string | undefined };
    const label = (d: string) => formatDate(d, { year: false });
    const history = data.history.map((h) => ({ label: label(h.date), sales: h.sales, onHand: h.on_hand }));
    const forecast = data.forecast.next_7_days.map((f) => ({ label: label(f.date), forecast: f.predicted_demand }));
    return { points: [...history, ...forecast], todayLabel: forecast[0]?.label };
  }, [data]);

  if (detail.loading) return <DetailSkeleton />;

  if (detail.error || !data) {
    return (
      <Container>
        <PageHeader back={{ href: '/', label: 'Overview' }} title="Item" />
        <ErrorCard message={detail.error ?? 'Item not found'} onRetry={() => detail.reload()} />
      </Container>
    );
  }

  const { current_state: state, recommendations: recs, confidence_details: conf } = data;
  const hasAnyRec = recs.reorder.recommended || recs.transfer.recommended || recs.cycle_count.recommended;

  return (
    <Container>
      <PageHeader
        back={{ href: '/', label: 'Overview' }}
        title={data.sku.name}
        subtitle={`${data.store.name} · ${data.sku.category}`}
        eyebrow={data.sku.is_perishable ? <StatusBadge tone="orange">Perishable</StatusBadge> : undefined}
      />

      {state.stockout_date && state.days_of_cover <= STOCKOUT_ALERT_DAYS && (
        <div
          role="status"
          className="mb-6 flex items-start gap-3 rounded-card bg-sys-red/10 p-4 ring-1 ring-sys-red/20"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-sys-red" aria-hidden />
          <div>
            <p className="text-headline">Predicted stockout on {formatDate(state.stockout_date)}</p>
            <p className="text-footnote text-label-secondary">
              {recs.reorder.recommended
                ? `Reorder ${recs.reorder.qty} units${recs.transfer.recommended ? ' or transfer from a nearby store' : ''}.`
                : 'Review the recommendations below.'}
            </p>
          </div>
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="On Hand" tone="blue" icon={<Package />} value={state.on_hand} caption="units" />
        <StatTile label="Daily Demand" tone="accent" icon={<TrendingUp />} value={formatNumber(state.daily_demand, 1)} caption="units per day" />
        <StatTile
          label="Days of Cover"
          tone={state.days_of_cover < 2 ? 'red' : state.days_of_cover < 4 ? 'orange' : 'green'}
          icon={<CalendarClock />}
          value={formatNumber(state.days_of_cover, 1)}
          caption={state.stockout_date ? `runs out ${formatDate(state.stockout_date, { year: false })}` : 'at current demand'}
        />
        <StatTile
          label="Confidence"
          tone={confidenceTone(state.confidence_score)}
          icon={<Gauge />}
          value={
            <span className="flex items-center gap-3">
              {formatNumber(state.confidence_score, 0)}%
              <GradeRing score={state.confidence_score} grade={state.confidence_grade} size={34} stroke={3.5} />
            </span>
          }
          caption="inventory accuracy"
        />
      </div>

      <div className="grid gap-x-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section
            title="Demand"
            description={view === 'daily' ? 'Last 30 days of sales and the next 7 days of forecast' : 'Predicted demand for the rest of today'}
            action={
              <SegmentedControl
                label="Demand view"
                size="sm"
                value={view}
                onChange={changeView}
                options={[
                  { value: 'daily', label: 'Daily' },
                  { value: 'hourly', label: 'Hourly' },
                ]}
              />
            }
          >
            <div className="p-4 sm:p-5">
              {view === 'daily' ? (
                <>
                  <DailyDemandChart data={daily.points} todayLabel={daily.todayLabel} />
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <LegendItem color="bg-accent" label="Sold" />
                    <LegendItem color="bg-accent/40 dark:bg-accent/55" label="Forecast" />
                    <LegendItem color="bg-sys-blue" label="On hand" />
                  </div>
                  <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-separator/70 pt-4 sm:grid-cols-4">
                    <KeyValue label="Weekday avg" value={formatNumber(data.forecast.weekday_avg, 1)} />
                    <KeyValue label="Weekend avg" value={formatNumber(data.forecast.weekend_avg, 1)} />
                    <KeyValue label="Forecast confidence" value={<span className="capitalize">{data.forecast.confidence}</span>} />
                    <KeyValue label="Data points" value={data.forecast.data_points} />
                  </dl>
                </>
              ) : hourly.loading || !hourly.data ? (
                hourly.error ? (
                  <ErrorCard message={hourly.error} onRetry={() => hourly.reload()} className="shadow-none" />
                ) : (
                  <div className="flex h-[260px] items-center justify-center text-label-secondary">
                    <Spinner />
                  </div>
                )
              ) : (
                <HourlyView data={hourly.data} />
              )}
            </div>
          </Section>

          <Section title="Anomalies" description="Unexplained drops in stock over the last 30 days">
            {data.anomalies.length === 0 ? (
              <EmptyState icon={<CheckCircle2 />} title="No anomalies" message="Stock movements match recorded sales and receipts." className="py-8" />
            ) : (
              <>
                <ul>
                  {data.anomalies.slice(0, 5).map((a, i) => (
                    <li key={i} className="list-row flex items-start gap-3 pl-4 pr-4">
                      <StatusDot tone={SEVERITY_TONE[a.severity] ?? 'gray'} className="mt-[1.15rem]" />
                      <div className="list-row-body min-w-0 flex-1 py-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-subhead font-semibold">{formatDate(a.date)}</p>
                          <p className="tabular text-footnote text-label-secondary">
                            {formatNumber(a.residual, 1)} units · <span className="capitalize">{a.severity}</span>
                          </p>
                        </div>
                        <p className="mt-0.5 text-subhead text-label-secondary">{a.explanation}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                {data.anomaly_patterns.has_pattern && (
                  <div className="hairline-t flex items-start gap-3 bg-sys-orange/10 px-4 py-3">
                    <SearchX className="mt-0.5 h-4 w-4 shrink-0 text-sys-orange" aria-hidden />
                    <p className="text-footnote">
                      <span className="font-semibold">Systematic pattern:</span> {data.anomaly_patterns.frequency} anomalies in 30 days,{' '}
                      {formatNumber(data.anomaly_patterns.total_loss, 0)} units lost in total.
                    </p>
                  </div>
                )}
              </>
            )}
          </Section>
        </div>

        <div>
          <Section title="Recommendations">
            {!hasAnyRec && (
              <ListRow icon={<IconTile tone="green"><CheckCircle2 /></IconTile>} title="No action needed" subtitle="Stock and accuracy look healthy." />
            )}
            {recs.reorder.recommended && (
              <ListRow
                icon={<IconTile tone="blue"><PackagePlus /></IconTile>}
                title={`Reorder ${recs.reorder.qty} units`}
                subtitle={recs.reorder.reason}
              />
            )}
            {recs.transfer.recommended && (
              <ListRow
                icon={<IconTile tone="green"><ArrowLeftRight /></IconTile>}
                title="Transfer available"
                subtitle={recs.transfer.reason}
                href="/transfers"
                chevron
              />
            )}
            {recs.cycle_count.recommended && (
              <ListRow
                icon={<IconTile tone="yellow"><ClipboardCheck /></IconTile>}
                title={`Cycle count · ${recs.cycle_count.priority} priority`}
                subtitle={recs.cycle_count.reason}
              />
            )}
          </Section>

          <Section
            title="Confidence"
            footer="How much we trust that the on-hand number matches what's on the shelf. A low score means you should schedule a physical count."
          >
            <div className="flex items-center gap-4 p-4">
              <GradeRing score={conf.score} grade={conf.grade} size={64} stroke={6} />
              <div>
                <p className="tabular text-title-2">{formatNumber(conf.score, 0)}%</p>
                <p className="text-footnote text-label-secondary">
                  {conf.days_since_count != null ? `Last counted ${conf.days_since_count} days ago` : 'Never cycle counted'}
                </p>
              </div>
            </div>
            {conf.deductions.length > 0 && (
              <ul className="hairline-t">
                {conf.deductions.map((d, i) => (
                  <li key={i} className="list-row flex items-start gap-3 pl-4 pr-4">
                    <Minus className="mt-3.5 h-4 w-4 shrink-0 text-sys-red" aria-hidden />
                    <p className="list-row-body flex-1 py-3 text-subhead">{d}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </Container>
  );
}

/* -------------------------------------------------------------------------- */

function HourlyView({ data }: { data: NonNullable<Awaited<ReturnType<typeof api.getSKUHourlyForecast>>> }) {
  const points = data.hourly_forecast.map((f) => ({
    label: f.hour_display,
    demand: f.predicted_demand || 0,
    isPeak: f.is_peak_hour,
    stockout: f.will_stockout_this_hour,
  }));
  const allZero = points.every((p) => p.demand === 0);
  const pred = data.stockout_prediction;

  if (points.length === 0) {
    return <EmptyState title="No hours left today" message="Check back tomorrow for the next hourly forecast." className="py-8" />;
  }

  return (
    <>
      <dl className="mb-4 grid grid-cols-2 gap-4">
        <KeyValue label="On hand now" value={`${data.current_on_hand} units`} />
        <KeyValue
          label="Predicted stockout"
          value={
            pred.will_stockout && pred.stockout_time ? (
              <span className="text-sys-red">
                {formatTime(pred.stockout_time)}
                {pred.is_during_peak && <span className="ml-1.5 text-footnote font-medium">during {pred.peak_period} rush</span>}
              </span>
            ) : (
              'None today'
            )
          }
        />
      </dl>
      {allZero && (
        <p className="mb-4 rounded-xl bg-sys-yellow/15 px-3.5 py-2.5 text-footnote">
          No hourly history for this item, so values are estimated from daily demand. Proteins and salsas have real hourly
          patterns.
        </p>
      )}
      <HourlyDemandChart data={points} height={220} />
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <LegendItem color="bg-accent" label="Regular" />
        <LegendItem color="bg-sys-orange" label="Peak (11–2, 5–8)" />
        <LegendItem color="bg-sys-red" label="Stockout" />
      </div>
    </>
  );
}

function DetailSkeleton() {
  return (
    <Container>
      <div className="pb-6 pt-6 sm:pt-10" aria-busy="true" aria-label="Loading item">
        <Skeleton className="mb-4 h-5 w-24" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="mt-3 h-5 w-48" />
      </div>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-8 w-16" />
          </Card>
        ))}
      </div>
      <Card className="p-5">
        <Skeleton className="h-[240px] w-full" />
      </Card>
    </Container>
  );
}

