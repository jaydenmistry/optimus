'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ChevronRight,
  Droplets,
  Info,
  PackageSearch,
  ShieldAlert,
  Snowflake,
  Store as StoreIcon,
  Thermometer,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { InventoryItem } from '@/lib/types';
import { cn, formatDate, formatNumber, shortStoreName } from '@/lib/utils';
import { useAsync, useDataChanged, useInterval, useStores } from '@/lib/hooks';
import { useSimulation } from '@/components/simulation/provider';
import {
  formatAge,
  formatSensorName,
  formatSensorValue,
  getSensorStatus,
  sensorKind,
  visibleSensors,
  type SensorStatus,
} from '@/lib/telemetry';
import {
  ButtonLink,
  Card,
  Container,
  EmptyState,
  ErrorCard,
  GradeRing,
  PageHeader,
  Picker,
  Popover,
  RiskBadge,
  SearchField,
  Section,
  SegmentedControl,
  Skeleton,
  Spinner,
  StatTile,
  StatusBadge,
  StatusDot,
  riskTone,
} from '@/components/ui';

type Filter = 'all' | 'risk';
type SortKey = 'risk' | 'sku_name' | 'on_hand' | 'daily_demand' | 'days_of_cover' | 'stockout_date' | 'confidence_score';

const RISK_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default function OverviewPage() {
  const stores = useStores();
  const [storeId, setStoreId] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'risk', dir: 'asc' });

  const overview = useAsync(
    () => api.getOverview({ risk_only: filter === 'risk', store_id: storeId ?? undefined, limit: 50 }),
    [filter, storeId]
  );

  // With "All Stores" selected, follow a running cooler failure so the visitor can watch it
  const { coolerFailureStore, status: simStatus } = useSimulation();
  const telemetryStore = storeId ?? coolerFailureStore ?? stores[0]?.id ?? 1;
  const telemetry = useAsync(() => api.getLatestTelemetry(telemetryStore), [telemetryStore]);
  useInterval(() => telemetry.reload({ silent: true }), 10000);
  useDataChanged(() => {
    overview.reload({ silent: true });
    telemetry.reload({ silent: true });
  });

  const items = useMemo(() => {
    const list = overview.data?.items ?? [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? list.filter((i) =>
          [i.sku_name, i.store_name, i.category].some((v) => v.toLowerCase().includes(q))
        )
      : list;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case 'risk':
          return (RISK_ORDER[a.risk_level] - RISK_ORDER[b.risk_level] || a.days_of_cover - b.days_of_cover) * dir;
        case 'sku_name':
          return a.sku_name.localeCompare(b.sku_name) * dir;
        case 'stockout_date':
          return ((a.stockout_date ? Date.parse(a.stockout_date) : Infinity) - (b.stockout_date ? Date.parse(b.stockout_date) : Infinity)) * dir || 0;
        default:
          return ((a[sort.key] as number) - (b[sort.key] as number)) * dir;
      }
    });
  }, [overview.data, query, sort]);

  const storeOptions = [
    { value: null as number | null, label: 'All Stores', icon: <StoreIcon className="h-4 w-4 opacity-70" aria-hidden /> },
    ...stores.map((s) => ({ value: s.id as number | null, label: s.name })),
  ];
  const storeName = stores.find((s) => s.id === storeId)?.name;
  const alerts = overview.data?.alerts;

  return (
    <Container>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center rounded-full bg-accent/12 px-2.5 py-0.5 text-caption font-semibold text-accent-text dark:bg-accent/24">
            UGAHacks 11
          </span>
        }
        title="Overview"
        subtitle={storeName ? `Inventory health at ${storeName}` : 'Inventory health across all stores'}
        actions={<Picker label="Store" options={storeOptions} value={storeId} onChange={setStoreId} />}
      />

      {overview.error && <ErrorCard className="mb-6" message={overview.error} onRetry={() => overview.reload()} />}

      {/* Summary */}
      <div className="mb-8 grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-4">
        <StatTile
          compact
          label="Critical Stockouts"
          tone="red"
          icon={<AlertTriangle />}
          value={alerts?.critical_stockouts ?? '—'}
          loading={overview.loading}
          caption={filter === 'risk' ? 'Showing at-risk items' : 'Tap to show at-risk items'}
          onClick={() => setFilter(filter === 'risk' ? 'all' : 'risk')}
          active={filter === 'risk'}
        />
        <StatTile
          compact
          label="Low Confidence"
          tone="orange"
          icon={<ShieldAlert />}
          value={alerts?.low_confidence ?? '—'}
          loading={overview.loading}
          caption="Items that need a physical count"
        />
        <StatTile
          compact
          label="Transfer Opportunities"
          tone="accent"
          icon={<ArrowLeftRight />}
          value={alerts?.transfer_opportunities ?? '—'}
          loading={overview.loading}
          caption="Review recommended transfers"
          href="/transfers"
        />
      </div>

      <SensorsSection
        storeName={telemetry.data?.store_name}
        sensors={telemetry.data?.sensors}
        loading={telemetry.loading}
        intervalSeconds={simStatus?.sensor_interval_seconds}
        coolerFailure={coolerFailureStore != null && coolerFailureStore === telemetryStore}
      />

      {/* Inventory */}
      <Section
        id="inventory"
        title="Inventory"
        description="Each row is one item at one store. Select an item for its forecast, anomalies and hourly demand."
        action={
          <>
            <SearchField value={query} onChange={setQuery} placeholder="Search items" className="w-full sm:w-56" />
            <SegmentedControl
              label="Filter inventory"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'risk', label: 'At Risk' },
              ]}
            />
            <Popover label="About this table" trigger={<Info className="h-[18px] w-[18px]" aria-hidden />}>
              <p className="font-semibold">Multi-store view</p>
              <p className="mt-1 text-label-secondary">
                The same ingredient can appear once per store with different stock and risk. Use the store picker to
                focus on one location.
              </p>
              <p className="mt-3 font-semibold">Confidence score</p>
              <p className="mt-1 text-label-secondary">
                How much we trust that the on-hand number matches what&apos;s on the shelf. A or B means a recent count
                and few issues. C, D or F means you should schedule a cycle count.
              </p>
            </Popover>
          </>
        }
        footer={
          overview.data
            ? `Showing ${items.length} of ${overview.data.total} items${query ? ` matching “${query}”` : ''}`
            : undefined
        }
      >
        <div className={cn('relative transition-opacity duration-200', overview.refreshing && 'opacity-60')}>
          {overview.refreshing && (
            <div className="absolute right-4 top-3 z-10 text-label-secondary">
              <Spinner className="h-4 w-4" />
            </div>
          )}
          {overview.loading ? (
            <InventorySkeleton />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<PackageSearch />}
              title={query ? 'No matching items' : 'No inventory items'}
              message={
                query
                  ? 'Try a different search term.'
                  : filter === 'risk'
                    ? 'Nothing is at risk right now.'
                    : 'Generate demo data to populate the dashboard.'
              }
              action={
                !query && filter === 'all' ? (
                  <ButtonLink href="/admin" variant="tinted">
                    Go to Admin
                  </ButtonLink>
                ) : undefined
              }
            />
          ) : (
            <>
              <InventoryTable items={items} sort={sort} onSort={setSort} />
              <InventoryList items={items} />
            </>
          )}
        </div>
      </Section>
    </Container>
  );
}

/* -------------------------------------------------------------------------- */

const sensorStatusTone: Record<SensorStatus, 'green' | 'yellow' | 'red'> = {
  ok: 'green',
  warning: 'yellow',
  critical: 'red',
};
const sensorStatusLabel: Record<SensorStatus, string> = { ok: 'Normal', warning: 'Warning', critical: 'Critical' };

function SensorIcon({ sensor }: { sensor: string }) {
  const kind = sensorKind(sensor);
  const cls = 'h-[18px] w-[18px]';
  if (kind === 'freezer') return <Snowflake className={cn(cls, 'text-sys-teal')} aria-hidden />;
  if (kind === 'humidity') return <Droplets className={cn(cls, 'text-sys-blue')} aria-hidden />;
  return <Thermometer className={cn(cls, 'text-sys-orange')} aria-hidden />;
}

function SensorsSection({
  storeName,
  sensors,
  loading,
  intervalSeconds,
  coolerFailure,
}: {
  storeName?: string;
  sensors?: Record<string, { value: number; unit: string | null; age_seconds: number; source?: string }>;
  loading: boolean;
  intervalSeconds?: number;
  coolerFailure?: boolean;
}) {
  const entries = visibleSensors(sensors ?? {});
  if (!loading && entries.length === 0) return null;
  const simulated = entries.some(([, r]) => r.source === 'simulator');

  return (
    <Section
      bare
      title="Sensors"
      description={coolerFailure ? `${storeName} · cooler failure scenario running` : storeName}
      action={
        <span className="inline-flex items-center gap-2 text-footnote font-medium text-label-secondary">
          <StatusDot tone={coolerFailure ? 'orange' : 'green'} pulse />
          {simulated ? `Simulated · every ${intervalSeconds ?? 20}s` : 'Live'}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="mt-4 h-8 w-20" />
                <Skeleton className="mt-3 h-3 w-16" />
              </Card>
            ))
          : entries.map(([sensor, reading]) => {
              const status = getSensorStatus(sensor, reading.value);
              return (
                <Card key={sensor} className="p-4">
                  <div className="flex items-center gap-2">
                    <SensorIcon sensor={sensor} />
                    <p className="truncate text-subhead font-medium text-label-secondary">{formatSensorName(sensor)}</p>
                  </div>
                  <p className="tabular mt-3 text-[1.75rem] font-semibold leading-none tracking-tight">
                    {formatSensorValue(sensor, reading.value, reading.unit)}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <StatusBadge tone={sensorStatusTone[status]}>{sensorStatusLabel[status]}</StatusBadge>
                    <span className="text-caption text-label-secondary">{formatAge(reading.age_seconds)}</span>
                  </div>
                </Card>
              );
            })}
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (s: { key: SortKey; dir: 'asc' | 'desc' }) => void;
  align?: 'left' | 'right';
}) {
  const active = sort.key === sortKey;
  const Arrow = sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('px-3 py-2.5 first:pl-4 last:pr-4', align === 'right' && 'text-right')}
    >
      <button
        type="button"
        onClick={() => onSort({ key: sortKey, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })}
        className={cn(
          'inline-flex items-center gap-1 whitespace-nowrap rounded text-footnote font-semibold transition-colors',
          active ? 'text-label' : 'text-label-secondary hover:text-label'
        )}
      >
        {label}
        <Arrow className={cn('h-3 w-3', active ? 'opacity-100' : 'opacity-0')} aria-hidden />
      </button>
    </th>
  );
}

function InventoryTable({
  items,
  sort,
  onSort,
}: {
  items: InventoryItem[];
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (s: { key: SortKey; dir: 'asc' | 'desc' }) => void;
}) {
  const router = useRouter();
  const headerProps = { sort, onSort };
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full text-left">
        <thead className="hairline-b bg-fill/5">
          <tr>
            <SortHeader label="Item" sortKey="sku_name" {...headerProps} />
            <th scope="col" className="px-3 py-2.5 text-footnote font-semibold text-label-secondary">
              Store
            </th>
            <SortHeader label="On Hand" sortKey="on_hand" align="right" {...headerProps} />
            <SortHeader label="Per Day" sortKey="daily_demand" align="right" {...headerProps} />
            <SortHeader label="Cover" sortKey="days_of_cover" align="right" {...headerProps} />
            <SortHeader label="Stockout" sortKey="stockout_date" {...headerProps} />
            <SortHeader label="Confidence" sortKey="confidence_score" {...headerProps} />
            <SortHeader label="Risk" sortKey="risk" {...headerProps} />
            <th scope="col" className="hidden px-3 py-2.5 text-footnote font-semibold text-label-secondary xl:table-cell">
              Suggested Action
            </th>
            <th scope="col" className="w-8 pr-4">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const href = `/sku/${item.store_id}/${item.sku_id}`;
            return (
              <tr
                key={`${item.store_id}-${item.sku_id}`}
                onClick={() => router.push(href)}
                className="group cursor-pointer text-subhead transition-colors hover:bg-fill/8 [&:not(:last-child)>td]:hairline-b"
              >
                <td className="min-w-[12rem] py-3 pl-4 pr-3">
                  <Link href={href} onClick={(e) => e.stopPropagation()} className="font-medium text-label hover:text-accent-text">
                    {item.sku_name}
                  </Link>
                  <div className="text-footnote text-label-secondary">{item.category}</div>
                </td>
                <td className="max-w-[12rem] truncate px-3 py-3 text-label-secondary">
                  {shortStoreName(item.store_name)}
                </td>
                <td className="tabular px-3 py-3 text-right">{item.on_hand}</td>
                <td className="tabular px-3 py-3 text-right">{formatNumber(item.daily_demand, 1)}</td>
                <td className="tabular px-3 py-3 text-right">
                  <span className={cn(item.days_of_cover < 2 && 'font-semibold text-sys-red')}>
                    {formatNumber(item.days_of_cover, 1)}d
                  </span>
                </td>
                <td className="tabular whitespace-nowrap px-3 py-3 text-label-secondary">
                  {item.stockout_date ? formatDate(item.stockout_date, { year: false }) : '—'}
                </td>
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-2">
                    <GradeRing score={item.confidence_score} grade={item.confidence_grade} size={28} stroke={3} />
                    <span className="tabular text-label-secondary">{formatNumber(item.confidence_score, 0)}%</span>
                  </span>
                </td>
                <td className="px-3 py-3">
                  <RiskBadge level={item.risk_level} />
                </td>
                <td className="hidden max-w-[14rem] px-3 py-3 text-footnote text-label-secondary xl:table-cell">
                  {item.suggested_action}
                </td>
                <td className="pr-4">
                  <ChevronRight className="h-4 w-4 text-label-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Phone layout: one tappable row per item */
function InventoryList({ items }: { items: InventoryItem[] }) {
  return (
    <ul className="md:hidden">
      {items.map((item) => (
        <li key={`${item.store_id}-${item.sku_id}`} className="list-row">
          <Link
            href={`/sku/${item.store_id}/${item.sku_id}`}
            className="flex items-center gap-3 pl-4 pr-3 transition-colors active:bg-fill/16"
          >
            <StatusDot tone={riskTone[item.risk_level] ?? 'gray'} />
            <div className="list-row-body flex min-w-0 flex-1 items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium">{item.sku_name}</p>
                <p className="truncate text-footnote text-label-secondary">
                  {shortStoreName(item.store_name)} · {item.on_hand} on hand
                </p>
              </div>
              <div className="text-right">
                <p className={cn('tabular text-subhead font-semibold', item.days_of_cover < 2 && 'text-sys-red')}>
                  {formatNumber(item.days_of_cover, 1)}d
                </p>
                <p className="text-caption text-label-secondary">cover</p>
              </div>
              <GradeRing score={item.confidence_score} grade={item.confidence_grade} size={30} stroke={3} />
              <ChevronRight className="h-4 w-4 shrink-0 text-label-tertiary" aria-hidden />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function InventorySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading inventory">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5 [&:not(:last-child)]:hairline-b">
          <div className="flex-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
          <Skeleton className="hidden h-4 w-16 md:block" />
          <Skeleton className="hidden h-4 w-12 md:block" />
          <Skeleton className="h-7 w-7 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
