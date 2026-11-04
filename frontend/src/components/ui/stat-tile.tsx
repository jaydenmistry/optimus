'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Tone } from './layout';
import { Skeleton } from './feedback';
import { AnimatedNumber, ChangeGlow } from './motion';

const glowVar: Record<Tone, string> = {
  red: '--red',
  orange: '--orange',
  yellow: '--yellow',
  green: '--green',
  blue: '--blue',
  teal: '--teal',
  gray: '--gray',
  accent: '--accent',
};

const iconColor: Record<Tone, string> = {
  red: 'text-sys-red',
  orange: 'text-sys-orange',
  yellow: 'text-sys-yellow',
  green: 'text-sys-green',
  blue: 'text-sys-blue',
  teal: 'text-sys-teal',
  gray: 'text-label-secondary',
  accent: 'text-accent-text',
};

const activeRing: Record<Tone, string> = {
  red: 'ring-2 ring-sys-red',
  orange: 'ring-2 ring-sys-orange',
  yellow: 'ring-2 ring-sys-yellow',
  green: 'ring-2 ring-sys-green',
  blue: 'ring-2 ring-sys-blue',
  teal: 'ring-2 ring-sys-teal',
  gray: 'ring-2 ring-sys-gray',
  accent: 'ring-2 ring-accent',
};

/**
 * Summary metric card. Becomes a link or toggle button when given
 * `href` / `onClick`; `active` draws a ring for a toggled filter.
 */
export function StatTile({
  label,
  value,
  icon,
  tone = 'accent',
  caption,
  href,
  onClick,
  active,
  loading,
  className,
  compact,
  format,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  caption?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  loading?: boolean;
  className?: string;
  /** On phones, lay the tile out as a single row (label left, value right) */
  compact?: boolean;
  /** Formats numeric values while they animate (default: whole numbers) */
  format?: (n: number) => string;
}) {
  const isNumber = typeof value === 'number';
  const interactive = Boolean(href || onClick);
  const body = (
    <div className={cn(compact && 'flex items-center gap-3 sm:block')}>
      <div className={cn('flex items-center justify-between gap-2', compact && 'min-w-0 flex-1')}>
        <span className={cn('flex min-w-0 items-center gap-2 text-subhead font-semibold', iconColor[tone])}>
          {icon && <span className="shrink-0 [&>svg]:h-[18px] [&>svg]:w-[18px]">{icon}</span>}
          <span className="truncate text-label-secondary">{label}</span>
        </span>
        {interactive && (
          <ChevronRight className={cn('h-4 w-4 shrink-0 text-label-tertiary', compact && 'hidden sm:block')} aria-hidden />
        )}
      </div>
      <div
        className={cn(
          'tabular font-bold leading-none tracking-tight text-label',
          compact ? 'text-title-2 sm:mt-3 sm:text-[2rem]' : 'mt-3 text-[2rem]'
        )}
      >
        {loading ? <Skeleton className="h-8 w-16" /> : isNumber ? <AnimatedNumber value={value} format={format} /> : value}
      </div>
      {compact && interactive && <ChevronRight className="h-4 w-4 shrink-0 text-label-tertiary sm:hidden" aria-hidden />}
      {caption && <div className={cn('mt-2 text-footnote text-label-secondary', compact && 'hidden sm:block')}>{caption}</div>}
    </div>
  );

  const base = cn(
    'block h-full rounded-card bg-surface p-4 text-left shadow-card transition-[box-shadow,transform] duration-200 ease-out sm:p-5',
    interactive && 'hover:-translate-y-0.5 hover:shadow-float active:translate-y-0 active:scale-[0.99]',
    active && activeRing[tone],
    className
  );

  let tile: React.ReactNode;
  if (href) {
    tile = (
      <Link href={href} className={base}>
        {body}
      </Link>
    );
  } else if (onClick) {
    tile = (
      <button type="button" onClick={onClick} aria-pressed={active} className={cn(base, 'w-full')}>
        {body}
      </button>
    );
  } else {
    tile = <div className={base}>{body}</div>;
  }
  // Glow in the tile's color whenever its number changes (e.g. after a scenario)
  return (
    <ChangeGlow watch={isNumber ? value : null} rgbVar={glowVar[tone]} className="h-full">
      {tile}
    </ChangeGlow>
  );
}
