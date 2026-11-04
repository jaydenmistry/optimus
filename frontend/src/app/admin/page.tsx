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
  FlaskConical,
  Layers,
  RefreshCw,
  Receipt,
  Store,
  Tag,
} from 'lucide-react';
import { api, API_URL } from '@/lib/api';
import { useAsync, useDataChanged } from '@/lib/hooks';
import { formatDate } from '@/lib/utils';
import { useSimulation } from '@/components/simulation/provider';
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
  AnimatedNumber,
} from '@/components/ui';

const DEMO_PARAMS = { num_stores: 5, num_skus: 200, days_history: 60 };

export default function AdminPage() {
  const toast = useToast();
  const stats = useAsync(() => api.getDemoStats(), []);
  const preview = useAsync(() => api.getDemoPreview(DEMO_PARAMS).catch(() => null), []);
  const health = useAsync(() => api.healthCheck() as Promise<{ status: string; version: string }>, []);
  const access = useAsync(() => api.getDemoAccess(), []);
  const sim = useSimulation();
  useDataChanged(() => stats.reload({ silent: true }));
  const [confirming, setConfirming] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  // Kept in memory only for this confirmation; never stored
  const [adminToken, setAdminToken] = useState('');
  const [tokenError, setTokenError] = useState<string | null>(null);
  const resetMode = access.data?.reset ?? 'open';
  const needsToken = resetMode === 'token';

  function closeSheet() {
    setConfirming(false);
    setAdminToken('');
    setTokenError(null);
  }

  async function regenerate() {
    if (needsToken && !adminToken) {
      setTokenError('Enter the admin token to continue.');
      return;
    }
    setRegenerating(true);
    setTokenError(null);
    try {
      await api.regenerateDemoData(DEMO_PARAMS, needsToken ? adminToken : undefined);
      closeSheet();
      toast.show({ tone: 'success', title: 'Demo data regenerated', message: 'All pages now show the new data set.' });
      stats.reload({ silent: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : undefined;
      if (message?.includes('(401)')) {
        setTokenError('That token isn’t right.');
      } else {
        toast.show({ tone: 'error', title: 'Couldn’t regenerate data', message });
      }
    } finally {
      setRegenerating(false);
    }
  }

  const s = stats.data;
  const p = preview.data;
  const num = (v: number | undefined) => (stats.loading ? <Skeleton className="h-4 w-12" /> : <AnimatedNumber value={v ?? 0} />);

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
        {sim.status?.enabled && (
          <ListRow
            icon={<IconTile tone="accent"><FlaskConical /></IconTile>}
            title="Simulator"
            subtitle={[
              sim.status.data_through ? `Data through ${formatDate(sim.status.data_through, { year: false })}, rolled forward daily` : 'Rolls data forward daily',
              sim.status.sensors_simulated ? `sensors every ${sim.status.sensor_interval_seconds}s` : null,
              `${sim.status.active.length} scenario${sim.status.active.length === 1 ? '' : 's'} running`,
            ].filter(Boolean).join(' · ')}
            trailing={<StatusBadge tone="green">Running</StatusBadge>}
            onClick={() => sim.setOpen(true)}
          />
        )}
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
          subtitle={
            regenerating
              ? 'This takes about 20 seconds.'
              : resetMode === 'disabled'
                ? 'Disabled on this server. Set ADMIN_TOKEN to enable it.'
                : needsToken
                  ? 'Requires the admin token.'
                  : undefined
          }
          destructive
          onClick={() => setConfirming(true)}
          disabled={regenerating || resetMode === 'disabled'}
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
        onCancel={closeSheet}
      >
        {needsToken && (
          <label className="block">
            <span className="text-footnote font-medium text-label-secondary">Admin token</span>
            <input
              type="password"
              autoComplete="off"
              value={adminToken}
              onChange={(e) => {
                setAdminToken(e.target.value);
                setTokenError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && regenerate()}
              aria-invalid={tokenError ? true : undefined}
              aria-describedby={tokenError ? 'token-error' : undefined}
              className="mt-1.5 h-11 w-full rounded-xl bg-fill/12 px-3.5 text-body text-label placeholder:text-label-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
              placeholder="Paste the ADMIN_TOKEN value"
            />
            {tokenError && (
              <span id="token-error" role="alert" className="mt-1.5 block text-footnote text-sys-red">
                {tokenError}
              </span>
            )}
          </label>
        )}
      </Sheet>
    </Container>
  );
}
