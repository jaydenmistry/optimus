'use client';

import { AlertCircle, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';

/** iOS-style activity indicator */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label ?? 'Loading'} className={cn('inline-block h-5 w-5', className)}>
      <svg viewBox="0 0 24 24" className="h-full w-full animate-spin" style={{ animationDuration: '0.9s' }}>
        <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.5" />
        <path d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton-shimmer animate-shimmer rounded-md', className)} />;
}

export function EmptyState({
  icon,
  title,
  message,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-fill/12 text-label-secondary [&>svg]:h-7 [&>svg]:w-7">
          {icon}
        </div>
      )}
      <p className="text-headline text-label">{title}</p>
      {message && <p className="mt-1 max-w-sm text-subhead text-label-secondary">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorCard({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-card bg-surface p-4 shadow-card ring-1 ring-sys-red/25',
        className
      )}
    >
      <AlertCircle className="h-5 w-5 shrink-0 text-sys-red" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-headline">Couldn&apos;t load data</p>
        <p className="text-footnote text-label-secondary">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-fill/15 px-3 text-footnote font-semibold hover:bg-fill/25"
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden />
          Try Again
        </button>
      )}
    </div>
  );
}
