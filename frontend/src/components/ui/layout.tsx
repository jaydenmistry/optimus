'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Container({
  className,
  children,
  narrow,
}: {
  className?: string;
  children: React.ReactNode;
  /** Settings-style pages use a narrower reading width */
  narrow?: boolean;
}) {
  return (
    <div className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', narrow ? 'max-w-3xl' : 'max-w-6xl', className)}>{children}</div>
  );
}

/**
 * Large-title page header. `back` renders an iOS-style "‹ Overview" link
 * above the title; `actions` sit to the right on wide screens.
 */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  back,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
}) {
  return (
    <header className="pb-6 pt-6 sm:pt-10">
      {back && (
        <Link
          href={back.href}
          className="-ml-1.5 mb-3 inline-flex items-center gap-0.5 rounded-md text-callout text-accent-text hover:opacity-80"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className="mb-2">{eyebrow}</div>}
          <h1 className="text-large-title text-label">{title}</h1>
          {subtitle && <p className="mt-1 text-body text-label-secondary">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** White rounded surface on the grouped background */
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-card bg-surface shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}

/**
 * Grouped section: small header above a card, optional footnote below,
 * like an inset grouped list in iOS Settings.
 */
export function Section({
  title,
  description,
  action,
  footer,
  children,
  className,
  bare,
  id,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Render children without the card wrapper */
  bare?: boolean;
  id?: string;
}) {
  return (
    <section className={cn('mb-8', className)} aria-labelledby={id ? `${id}-title` : undefined}>
      {(title || action) && (
        <div className="mb-2.5 flex flex-wrap items-end justify-between gap-3 px-1">
          <div className="min-w-0">
            {title && (
              <h2 id={id ? `${id}-title` : undefined} className="text-title-3 text-label">
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-footnote text-label-secondary">{description}</p>}
          </div>
          {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
        </div>
      )}
      {bare ? children : <Card className="overflow-hidden">{children}</Card>}
      {footer && <p className="mt-2 px-4 text-footnote text-label-secondary">{footer}</p>}
    </section>
  );
}

export type Tone = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'teal' | 'gray' | 'accent';

const iconTiles: Record<Tone, string> = {
  red: 'bg-sys-red',
  orange: 'bg-sys-orange',
  yellow: 'bg-sys-yellow',
  green: 'bg-sys-green',
  blue: 'bg-sys-blue',
  teal: 'bg-sys-teal',
  gray: 'bg-sys-gray',
  accent: 'bg-accent',
};

/** Rounded-square colored icon, as used in iOS Settings rows */
export function IconTile({ tone = 'accent', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] text-white [&>svg]:h-[18px] [&>svg]:w-[18px]',
        iconTiles[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * One row of a grouped list. Use inside <Section> (or <Card>) — rows draw
 * their own inset separators.
 */
export function ListRow({
  icon,
  title,
  subtitle,
  detail,
  trailing,
  href,
  external,
  onClick,
  chevron,
  destructive,
  className,
  disabled,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  detail?: React.ReactNode;
  trailing?: React.ReactNode;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const interactive = Boolean(href || onClick);
  const content = (
    <>
      {icon}
      <div className="flex min-w-0 flex-1 items-center gap-3 self-stretch py-3 list-row-body">
        <div className="min-w-0 flex-1">
          <div className={cn('text-body', destructive ? 'text-sys-red' : interactive && !chevron ? 'text-accent-text' : 'text-label')}>
            {title}
          </div>
          {subtitle && <div className="mt-0.5 text-footnote text-label-secondary">{subtitle}</div>}
        </div>
        {detail != null && <div className="tabular shrink-0 text-body text-label-secondary">{detail}</div>}
        {trailing}
        {(chevron || (href && !external && chevron !== false)) && (
          <ChevronRight className="h-4 w-4 shrink-0 text-label-tertiary" aria-hidden />
        )}
      </div>
    </>
  );

  const base = cn(
    'list-row flex w-full items-center gap-3 pl-4 pr-4 text-left',
    interactive && 'transition-colors duration-100 hover:bg-fill/8 active:bg-fill/16',
    disabled && 'pointer-events-none opacity-50',
    className
  );

  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={base}>
        {content}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={base}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={base} disabled={disabled}>
        {content}
      </button>
    );
  }
  return <div className={base}>{content}</div>;
}

/** Small label/value pair for detail grids */
export function KeyValue({ label, value, className }: { label: React.ReactNode; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-footnote text-label-secondary">{label}</dt>
      <dd className="tabular mt-0.5 text-headline text-label">{value}</dd>
    </div>
  );
}
