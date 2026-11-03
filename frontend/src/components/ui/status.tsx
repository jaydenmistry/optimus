'use client';

import { cn } from '@/lib/utils';
import type { Tone } from './layout';

const dotColor: Record<Tone, string> = {
  red: 'bg-sys-red',
  orange: 'bg-sys-orange',
  yellow: 'bg-sys-yellow',
  green: 'bg-sys-green',
  blue: 'bg-sys-blue',
  teal: 'bg-sys-teal',
  gray: 'bg-sys-gray',
  accent: 'bg-accent',
};

const tint: Record<Tone, string> = {
  red: 'bg-sys-red/12',
  orange: 'bg-sys-orange/15',
  yellow: 'bg-sys-yellow/18',
  green: 'bg-sys-green/15',
  blue: 'bg-sys-blue/12',
  teal: 'bg-sys-teal/15',
  gray: 'bg-fill/15',
  accent: 'bg-accent/12 dark:bg-accent/24',
};

export function StatusDot({ tone, pulse, className }: { tone: Tone; pulse?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex h-2 w-2 shrink-0', className)} aria-hidden>
      {pulse && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', dotColor[tone])} />}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', dotColor[tone])} />
    </span>
  );
}

/**
 * Status pill: colored dot + label on a soft tint. The label stays in the
 * primary label color so it remains readable for every tone.
 */
export function StatusBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption font-semibold text-label',
        tint[tone],
        className
      )}
    >
      <StatusDot tone={tone} />
      {children}
    </span>
  );
}

export const riskTone: Record<string, Tone> = {
  critical: 'red',
  high: 'orange',
  medium: 'yellow',
  low: 'green',
};

export const riskLabel: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function RiskBadge({ level }: { level: string }) {
  return <StatusBadge tone={riskTone[level] ?? 'gray'}>{riskLabel[level] ?? level}</StatusBadge>;
}

export function confidenceTone(score: number): Tone {
  if (score >= 90) return 'green';
  if (score >= 80) return 'teal';
  if (score >= 70) return 'yellow';
  if (score >= 60) return 'orange';
  return 'red';
}

const strokeColor: Record<Tone, string> = {
  red: 'stroke-sys-red',
  orange: 'stroke-sys-orange',
  yellow: 'stroke-sys-yellow',
  green: 'stroke-sys-green',
  blue: 'stroke-sys-blue',
  teal: 'stroke-sys-teal',
  gray: 'stroke-sys-gray',
  accent: 'stroke-accent',
};

/**
 * Activity-ring style gauge for the 0–100 confidence score with the letter
 * grade in the middle.
 */
export function GradeRing({
  score,
  grade,
  size = 36,
  stroke = 4,
  className,
  showLabel = true,
}: {
  score: number;
  grade?: string;
  size?: number;
  stroke?: number;
  className?: string;
  showLabel?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const tone = confidenceTone(score);
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Confidence ${Math.round(score)} percent${grade ? `, grade ${grade}` : ''}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-fill/20" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className={cn(strokeColor[tone], 'transition-[stroke-dashoffset] duration-700 ease-out')}
        />
      </svg>
      {showLabel && grade && (
        <span
          className="absolute font-bold text-label"
          style={{ fontSize: Math.max(10, size * 0.36), lineHeight: 1 }}
          aria-hidden
        >
          {grade}
        </span>
      )}
    </span>
  );
}
