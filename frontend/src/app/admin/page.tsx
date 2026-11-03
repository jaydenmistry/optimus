'use client';

import { useState } from 'react';
import {
  Activity,
  AlertOctagon,
  ArrowLeftRight,
  BookOpen,
  Boxes,
  CalendarRange,
  ExternalLink,
  Layers,
  RefreshCw,
  Receipt,
  Store,
  Tag,
} from 'lucide-react';
import { api, API_URL } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import {
  Container,
  IconTile,
  ListRow,
  PageHeader,
  Section,
  Sheet,
  Skeleton,
  Spinner,
  StatusBadge,
  ErrorCard,
  useToast,
} from '@/components/ui';

const DEMO_PARAMS = { num_stores: 5, num_skus: 200, days_history: 60 };

export default function AdminPage() {
  const toast = useToast();
  const stats = useAsync(() => api.getDemoStats(), []);
  const preview = useAsync(() => api.getDemoPreview(DEMO_PARAMS).catch(() => null), []);
  const health = useAsync(() => api.healthCheck() as Promise<{ status: string; version: string }>, []);
  const [confirming, setConfirming] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  async function regenerate() {
    setRegenerating(true);
    try {
      await api.regenerateDemoData(DEMO_PARAMS);
      setConfirming(false);
      toast.show({ tone: 'success', title: 'Demo data regenerated', message: 'All pages now show the new data set.' });
      await stats.reload({ silent: true });
    } catch (err) {
      toast.show({ tone: 'error', title: 'Couldn’t regenerate data', message: err instanceof Error ? err.message : undefined });
    } finally {
      setRegenerating(false);
    }
  }

  const s = stats.data;
  const p = preview.data;
  const num = (v: number | undefined) => (stats.loading ? <Skeleton className="h-4 w-12" /> : (v ?? 0).toLocaleString());

  return (
    <Container narrow>
      <PageHeader title="Admin" subtitle="Demo data and system information." />

      {stats.error && <ErrorCard className="mb-6" message={stats.error} onRetry={() => stats.reload()} />}

      <Section
        title="Database"
        footer={
          s?.date_range
            ? `Data covers ${new Date(s.date_range.start).toLocaleDateString()} – ${new Date(s.date_range.end).toLocaleDateString()} (${s.date_range.days} days).`
            : undefined
        }
      >
        <ListRow icon={<IconTile tone="accent"><Store /></IconTile>} title="Stores" detail={num(s?.stores)} />
        <ListRow icon={<IconTile tone="blue"><Tag /></IconTile>} title="SKUs" detail={num(s?.skus)} />
        <ListRow icon={<IconTile tone="teal"><Boxes /></IconTile>} title="Inventory snapshots" detail={num(s?.inventory_snapshots)} />
        <ListRow icon={<IconTile tone="green"><Receipt /></IconTile>} title="Sales records" detail={num(s?.sales_records)} />
        <ListRow icon={<IconTile tone="red"><AlertOctagon /></IconTile>} title="Anomalies detected" detail={num(s?.anomalies)} />
        <ListRow
          icon={<IconTile tone="orange"><ArrowLeftRight /></IconTile>}
          title="Transfer recommendations"
          detail={num(s?.transfer_recommendations)}
          href="/transfers"
          chevron
        />
      </Section>

      <Section
        title="Demo Data"
        footer="Regenerating deletes all existing data, including transfers you created, and builds a new synthetic data set. This can't be undone."
      >
        {p ? (
          <>
            <ListRow
              icon={<IconTile tone="accent"><Store /></IconTile>}
              title={`${p.stores} stores`}
              subtitle={p.store_names.join(', ')}
            />
            <ListRow
              icon={<IconTile tone="blue"><Layers /></IconTile>}
              title={`${p.skus} SKUs in ${p.categories.length} categories`}
              subtitle={p.categories.join(', ')}
            />
            <ListRow
              icon={<IconTile tone="green"><CalendarRange /></IconTile>}
              title={`${p.days_history} days of history`}
              subtitle={`About ${p.inventory_snapshots_approx.toLocaleString()} inventory snapshots with weekday and weekend patterns. Receipts arrive on ${p.receipt_chance_pct}% of days.`}
            />
            <ListRow
              icon={<IconTile tone="red"><AlertOctagon /></IconTile>}
              title={`About ${p.anomalies_approx} injected anomalies`}
              subtitle={`Cycle counts: ${p.cycle_recent_pct}% recent, ${p.cycle_older_pct}% older, ${p.cycle_none_pct}% never. Transfer recommendations: ${p.transfer_recommendations_approx}.`}
            />
            <ListRow
              icon={<IconTile tone="orange"><Activity /></IconTile>}
              title={`Hourly sales and ${p.telemetry_sensors} sensors`}
              subtitle={`${p.sales_hourly_days} days of hourly sales for ${p.sales_hourly_categories.join(', ')}. ${p.telemetry_description}`}
            />
          </>
        ) : preview.loading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : null}
        <ListRow
          icon={
            <IconTile tone="red">{regenerating ? <Spinner className="h-[18px] w-[18px]" /> : <RefreshCw />}</IconTile>
          }
          title={regenerating ? 'Regenerating…' : 'Regenerate Demo Data'}
          subtitle={regenerating ? 'This takes about 20 seconds.' : undefined}
          destructive
          onClick={() => setConfirming(true)}
          disabled={regenerating}
        />
      </Section>

      <Section title="API">
        <ListRow
          icon={<IconTile tone="gray"><Activity /></IconTile>}
          title="Status"
          trailing={
            health.loading ? (
              <Spinner className="h-4 w-4 text-label-secondary" />
            ) : health.data?.status === 'ok' ? (
              <StatusBadge tone="green">Healthy</StatusBadge>
            ) : (
              <StatusBadge tone="red">Unreachable</StatusBadge>
            )
          }
        />
        <ListRow icon={<IconTile tone="gray"><Tag /></IconTile>} title="Version" detail={health.data?.version ?? '1.0.0'} />
        <ListRow
          icon={<IconTile tone="blue"><BookOpen /></IconTile>}
          title="API documentation"
          subtitle={`${API_URL.replace(/^https?:\/\//, '')}/docs`}
          href={`${API_URL}/docs`}
          external
          trailing={<ExternalLink className="h-4 w-4 text-label-tertiary" aria-hidden />}
        />
        <ListRow
          icon={<IconTile tone="green"><Activity /></IconTile>}
          title="Health check"
          subtitle={`${API_URL.replace(/^https?:\/\//, '')}/api/health`}
          href={`${API_URL}/api/health`}
          external
          trailing={<ExternalLink className="h-4 w-4 text-label-tertiary" aria-hidden />}
        />
      </Section>

      <Sheet
        open={confirming}
        destructive
        title="Regenerate demo data?"
        message="All current data, including transfers you created, will be deleted and replaced. This takes about 20 seconds."
        confirmLabel="Regenerate"
        loading={regenerating}
        onConfirm={regenerate}
        onCancel={() => setConfirming(false)}
      />
    </Container>
  );
}
