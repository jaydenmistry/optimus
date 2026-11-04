'use client';

import { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Flame,
  Inbox,
  Package,
  Truck,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Transfer, TransferRecommendation } from '@/lib/types';
import { cn, formatCurrency, formatDate, formatNumber, shortStoreName } from '@/lib/utils';
import { useAsync, useDataChanged } from '@/lib/hooks';
import {
  Button,
  Card,
  Container,
  EmptyState,
  ErrorCard,
  PageHeader,
  Section,
  SegmentedControl,
  Sheet,
  Skeleton,
  StatTile,
  StatusBadge,
  useToast,
  type Tone,
} from '@/components/ui';

function urgency(score: number): { tone: Tone; label: string } {
  if (score >= 0.8) return { tone: 'red', label: 'High urgency' };
  if (score >= 0.6) return { tone: 'orange', label: 'Medium urgency' };
  return { tone: 'yellow', label: 'Low urgency' };
}

const STATUS: Record<string, { tone: Tone; label: string }> = {
  draft: { tone: 'gray', label: 'Draft' },
  approved: { tone: 'blue', label: 'Approved' },
  in_transit: { tone: 'orange', label: 'In Transit' },
  received: { tone: 'green', label: 'Received' },
  cancelled: { tone: 'red', label: 'Cancelled' },
};

/** The next step in the transfer lifecycle, if any */
const NEXT_STEP: Record<string, { status: string; label: string; done: string }> = {
  draft: { status: 'approved', label: 'Approve', done: 'Transfer approved' },
  approved: { status: 'in_transit', label: 'Mark Shipped', done: 'Marked as in transit' },
  in_transit: { status: 'received', label: 'Mark Received', done: 'Marked as received' },
};

type TransferFilter = 'active' | 'completed' | 'all';

export default function TransfersPage() {
  const toast = useToast();
  const page = useAsync(async () => {
    const [recs, transfers] = await Promise.all([
      api.getTransferRecommendations({ min_urgency: 0.5 }),
      api.getTransfers({ limit: 50 }),
    ]);
    return { recs, transfers: transfers.transfers };
  }, []);

  useDataChanged(() => page.reload({ silent: true }));

  const [pendingRec, setPendingRec] = useState<TransferRecommendation | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<Transfer | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<TransferFilter>('active');

  async function confirmCreate() {
    if (!pendingRec) return;
    setCreating(true);
    try {
      await api.createTransferDraft({
        from_store_id: pendingRec.from_store_id,
        to_store_id: pendingRec.to_store_id,
        sku_id: pendingRec.sku_id,
        qty: pendingRec.qty,
      });
      toast.show({
        tone: 'success',
        title: 'Transfer draft created',
        message: `${pendingRec.qty} units of ${pendingRec.sku_name} to ${shortStoreName(pendingRec.to_store_name)}`,
      });
      setPendingRec(null);
      setFilter('active');
      page.reload({ silent: true });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Couldn’t create transfer', message: err instanceof Error ? err.message : undefined });
    } finally {
      setCreating(false);
    }
  }

  async function updateStatus(t: Transfer, status: string, doneMessage: string) {
    setUpdatingId(t.id);
    try {
      await api.updateTransferStatus(t.id, status);
      toast.show({ tone: 'success', title: doneMessage, message: `${t.sku_name} · ${t.qty} units` });
      page.reload({ silent: true });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Couldn’t update transfer', message: err instanceof Error ? err.message : undefined });
    } finally {
      setUpdatingId(null);
    }
  }

  const summary = page.data?.recs.summary;
  const recommendations = page.data?.recs.recommendations ?? [];
  const transfers = useMemo(() => {
    const all = page.data?.transfers ?? [];
    if (filter === 'all') return all;
    const done = ['received', 'cancelled'];
    return all.filter((t) => (filter === 'completed' ? done.includes(t.status) : !done.includes(t.status)));
  }, [page.data, filter]);

  return (
    <Container>
      <PageHeader title="Transfers" subtitle="Balance stock between stores before placing new orders." />

      {page.error && <ErrorCard className="mb-6" message={page.error} onRetry={() => page.reload()} />}

      <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Opportunities" tone="accent" icon={<ArrowLeftRight />} value={summary?.total_opportunities ?? '—'} loading={page.loading} />
        <StatTile label="High Urgency" tone="red" icon={<Flame />} value={summary?.high_urgency ?? '—'} loading={page.loading} />
        <StatTile label="Units to Move" tone="blue" icon={<Package />} value={summary?.total_units ?? '—'} loading={page.loading} />
        <StatTile
          label="Est. Savings"
          tone="green"
          icon={<CircleDollarSign />}
          value={summary ? formatCurrency(summary.estimated_savings) : '—'}
          loading={page.loading}
        />
      </div>

      <Section bare title="Recommended" description="Ordered by urgency. Each move is checked so the sending store keeps enough stock.">
        {page.loading ? (
          <div className="space-y-4">
            {[0, 1].map((i) => (
              <Card key={i} className="p-5">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="mt-4 h-10 w-full" />
                <Skeleton className="mt-4 h-16 w-full" />
              </Card>
            ))}
          </div>
        ) : recommendations.length === 0 ? (
          <Card>
            <EmptyState
              icon={<CheckCircle2 />}
              title="Stores are balanced"
              message="There are no transfer opportunities right now."
            />
          </Card>
        ) : (
          <div className="space-y-4">
            {recommendations.map((rec, i) => (
              <RecommendationCard key={`${rec.sku_id}-${rec.from_store_id}-${rec.to_store_id}-${i}`} rec={rec} onCreate={() => setPendingRec(rec)} />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Created Transfers"
        description="Move each transfer through approval, shipping and receiving."
        action={
          <SegmentedControl
            label="Filter transfers"
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'completed', label: 'Completed' },
              { value: 'all', label: 'All' },
            ]}
          />
        }
      >
        {page.loading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : transfers.length === 0 ? (
          <EmptyState
            icon={<Inbox />}
            title={filter === 'completed' ? 'No completed transfers' : 'No transfers yet'}
            message={filter === 'completed' ? undefined : 'Create one from a recommendation above.'}
          />
        ) : (
          <ul>
            {transfers.map((t) => {
              const status = STATUS[t.status] ?? { tone: 'gray' as Tone, label: t.status };
              const next = NEXT_STEP[t.status];
              const canCancel = t.status === 'draft' || t.status === 'approved';
              const busy = updatingId === t.id;
              return (
                <li key={t.id} className="list-row flex items-center gap-3 pl-4 pr-4">
                  <span
                    aria-hidden
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fill/12 text-label-secondary"
                  >
                    <Truck className="h-[18px] w-[18px]" />
                  </span>
                  <div className="list-row-body flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 py-3">
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="text-body font-medium">
                        {t.sku_name} <span className="tabular font-normal text-label-secondary">· {t.qty} units</span>
                      </p>
                      <p className="truncate text-footnote text-label-secondary">
                        {shortStoreName(t.from_store_name)} → {shortStoreName(t.to_store_name)} · {formatDate(t.created_at, { year: false })}
                      </p>
                    </div>
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    {(next || canCancel) && (
                      <div className="flex items-center gap-1.5">
                        {canCancel && (
                          <Button variant="plain" size="sm" className="text-sys-red" disabled={busy} onClick={() => setPendingCancel(t)}>
                            Cancel
                          </Button>
                        )}
                        {next && (
                          <Button variant="tinted" size="sm" loading={busy} onClick={() => updateStatus(t, next.status, next.done)}>
                            {next.label}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Sheet
        open={pendingRec != null}
        title="Create transfer draft?"
        message={
          pendingRec && (
            <>
              Move <span className="font-semibold text-label">{pendingRec.qty} units</span> of{' '}
              <span className="font-semibold text-label">{pendingRec.sku_name}</span> from{' '}
              {shortStoreName(pendingRec.from_store_name)} to {shortStoreName(pendingRec.to_store_name)}.
            </>
          )
        }
        confirmLabel="Create Draft"
        loading={creating}
        onConfirm={confirmCreate}
        onCancel={() => setPendingRec(null)}
      />

      <Sheet
        open={pendingCancel != null}
        title="Cancel this transfer?"
        message={pendingCancel && `${pendingCancel.sku_name} · ${pendingCancel.qty} units to ${shortStoreName(pendingCancel.to_store_name)}`}
        confirmLabel="Cancel Transfer"
        cancelLabel="Keep"
        destructive
        loading={pendingCancel != null && updatingId === pendingCancel.id}
        onConfirm={async () => {
          if (!pendingCancel) return;
          await updateStatus(pendingCancel, 'cancelled', 'Transfer cancelled');
          setPendingCancel(null);
        }}
        onCancel={() => setPendingCancel(null)}
      />
    </Container>
  );
}

/* -------------------------------------------------------------------------- */

function RecommendationCard({ rec, onCreate }: { rec: TransferRecommendation; onCreate: () => void }) {
  const u = urgency(rec.urgency_score);
  const routeMeta = [
    rec.distance_km != null ? `${formatNumber(rec.distance_km, 0)} km` : null,
    rec.transfer_cost != null ? formatCurrency(rec.transfer_cost) : null,
  ].filter(Boolean);

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-headline">{rec.sku_name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <StatusBadge tone={u.tone}>{u.label}</StatusBadge>
            <span className="tabular text-footnote text-label-secondary">{rec.qty} units</span>
          </div>
        </div>
        <Button onClick={onCreate} className="w-full sm:w-auto">
          Create Transfer
        </Button>
      </div>

      {/* Route */}
      <div className="mt-5 flex items-center gap-3">
        <StoreChip label="From" name={rec.from_store_name} />
        <div className="relative flex min-w-[3rem] flex-1 items-center" aria-hidden>
          <div className="h-px flex-1 bg-separator" />
          <ArrowRight className="-ml-1 h-4 w-4 text-label-tertiary" />
          {routeMeta.length > 0 && (
            <span className="tabular absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-surface px-2 text-caption text-label-secondary">
              {routeMeta.join(' · ')}
            </span>
          )}
        </div>
        <StoreChip label="To" name={rec.to_store_name} align="right" />
      </div>
      {routeMeta.length > 0 && <span className="sr-only">Route: {routeMeta.join(', ')}</span>}

      {/* Impact */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <CoverBar label="Receiving store" before={rec.receiver_days_before} after={rec.receiver_days_after} tone="up" />
        <CoverBar label="Sending store" before={rec.donor_days_before} after={rec.donor_days_after} tone="down" />
      </div>

      <p className="mt-4 rounded-xl bg-fill/8 px-3.5 py-2.5 text-footnote text-label-secondary">{rec.rationale}</p>
    </Card>
  );
}

function StoreChip({ label, name, align = 'left' }: { label: string; name: string; align?: 'left' | 'right' }) {
  return (
    <div className={cn('min-w-0 max-w-[40%]', align === 'right' && 'text-right')}>
      <p className="text-caption font-medium uppercase tracking-wide text-label-tertiary">{label}</p>
      <p className="truncate text-subhead font-semibold">{shortStoreName(name)}</p>
    </div>
  );
}

/** Days-of-cover before → after for one store, drawn as two stacked bars on the store's own scale */
function CoverBar({
  label,
  before,
  after,
  tone,
}: {
  label: string;
  before: number;
  after: number;
  tone: 'up' | 'down';
}) {
  const scale = Math.max(before, after, 1) * 1.08;
  const pct = (v: number) => `${Math.max(2, Math.min(100, (v / scale) * 100))}%`;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-footnote font-medium text-label-secondary">{label}</p>
        <p className="tabular text-footnote">
          <span className="text-label-secondary">{formatNumber(before, 1)}d</span>
          <span className="mx-1 text-label-tertiary">→</span>
          <span className="font-semibold">{formatNumber(after, 1)}d</span>
        </p>
      </div>
      <div className="mt-2 space-y-1" aria-hidden>
        <div className="h-1.5 rounded-full bg-fill/12">
          <div className="h-full rounded-full bg-sys-gray/60" style={{ width: pct(before) }} />
        </div>
        <div className="h-1.5 rounded-full bg-fill/12">
          <div
            className={cn('h-full rounded-full transition-[width] duration-700', tone === 'up' ? 'bg-sys-green' : 'bg-sys-blue')}
            style={{ width: pct(after) }}
          />
        </div>
      </div>
    </div>
  );
}
