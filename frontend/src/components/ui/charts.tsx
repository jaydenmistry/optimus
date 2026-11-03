'use client';

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
} from 'recharts';
import { useTheme } from '@/lib/theme';
import { useIsClient } from '@/lib/hooks';

interface Palette {
  accent: string;
  accentSoft: string;
  orange: string;
  red: string;
  blue: string;
  grid: string;
  axis: string;
  label: string;
  surface: string;
}

function readVar(name: string, alpha = 1) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  return raw ? `rgb(${raw} / ${alpha})` : '#888';
}

/**
 * Chart colors pulled from the CSS tokens, recomputed when the theme flips.
 * Returns null during server rendering, where there are no computed styles.
 */
export function useChartPalette(): Palette | null {
  const { resolved } = useTheme();
  const isClient = useIsClient();
  return useMemo(() => {
    if (!isClient) return null;
    return {
      accent: readVar('accent'),
      accentSoft: readVar('accent', resolved === 'dark' ? 0.55 : 0.4),
      orange: readVar('orange'),
      red: readVar('red'),
      blue: readVar('blue'),
      grid: readVar('separator', 0.8),
      axis: readVar('label-secondary'),
      label: readVar('label'),
      surface: readVar('elevated'),
    };
  }, [resolved, isClient]);
}

function ChartTooltip({
  active,
  payload,
  label,
  unit = 'units',
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string; payload?: Record<string, unknown> }>;
  label?: string;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="material-thick rounded-xl px-3 py-2 text-footnote shadow-float ring-1 ring-separator/60">
      <p className="mb-1 font-semibold text-label">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="tabular flex items-center gap-2 text-label-secondary">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
          {p.name}: <span className="font-semibold text-label">{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</span>{' '}
          {unit}
        </p>
      ))}
    </div>
  );
}

const axisProps = (p: Palette) => ({
  tick: { fill: p.axis, fontSize: 11 },
  tickLine: false,
  axisLine: false,
});

export interface HourlyDatum {
  label: string;
  demand: number;
  isPeak: boolean;
  stockout?: boolean;
}

/** Hourly demand bars; peak hours orange, a stockout hour red */
export function HourlyDemandChart({ data, height = 180 }: { data: HourlyDatum[]; height?: number }) {
  const p = useChartPalette();
  if (!p) return <div style={{ height }} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }} barCategoryGap="18%">
        <CartesianGrid vertical={false} stroke={p.grid} strokeDasharray="0" />
        <XAxis dataKey="label" {...axisProps(p)} interval="preserveStartEnd" minTickGap={12} />
        <YAxis {...axisProps(p)} width={44} allowDecimals={false} tickCount={4} interval={0} />
        <Tooltip cursor={{ fill: p.accentSoft, opacity: 0.25 }} content={<ChartTooltip />} />
        <Bar dataKey="demand" name="Demand" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.stockout ? p.red : d.isPeak ? p.orange : p.accent} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface DailyDatum {
  label: string;
  sales?: number;
  forecast?: number;
  onHand?: number;
}

/** Daily sales history bars with forecast bars and an on-hand line */
export function DailyDemandChart({ data, height = 240, todayLabel }: { data: DailyDatum[]; height?: number; todayLabel?: string }) {
  const p = useChartPalette();
  if (!p) return <div style={{ height }} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke={p.grid} />
        <XAxis dataKey="label" {...axisProps(p)} interval="preserveStartEnd" minTickGap={24} />
        <YAxis yAxisId="units" {...axisProps(p)} width={44} allowDecimals={false} tickCount={5} interval={0} />
        <YAxis yAxisId="stock" orientation="right" hide />
        <Tooltip cursor={{ fill: p.accentSoft, opacity: 0.2 }} content={<ChartTooltip />} />
        {todayLabel && <ReferenceLine x={todayLabel} yAxisId="units" stroke={p.axis} strokeDasharray="3 3" />}
        <Area
          yAxisId="stock"
          dataKey="onHand"
          name="On hand"
          type="monotone"
          stroke={p.blue}
          strokeWidth={2}
          fill={p.blue}
          fillOpacity={0.08}
          dot={false}
          isAnimationActive={false}
          connectNulls={false}
        />
        <Bar yAxisId="units" dataKey="sales" name="Sold" stackId="day" fill={p.accent} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        <Bar yAxisId="units" dataKey="forecast" name="Forecast" stackId="day" fill={p.accentSoft} radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Inline legend chip */
export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-caption text-label-secondary">
      <span className={`h-2.5 w-2.5 rounded-[3px] ${color}`} aria-hidden />
      {label}
    </span>
  );
}

