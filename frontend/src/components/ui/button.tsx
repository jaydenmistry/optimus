'use client';

import Link from 'next/link';
import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from './feedback';

type Variant = 'filled' | 'tinted' | 'gray' | 'plain' | 'destructive' | 'destructive-tinted';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  filled: 'bg-accent text-accent-contrast hover:brightness-110 active:brightness-95',
  tinted: 'bg-accent/12 text-accent-text hover:bg-accent/20 dark:bg-accent/25 dark:hover:bg-accent/35',
  gray: 'bg-fill/15 text-label hover:bg-fill/25',
  plain: 'text-accent-text hover:bg-accent/10',
  destructive: 'bg-sys-red text-white hover:brightness-110 active:brightness-95',
  'destructive-tinted': 'bg-sys-red/12 text-sys-red hover:bg-sys-red/20',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-footnote gap-1.5 rounded-full',
  md: 'h-10 px-4 text-subhead gap-2 rounded-full',
  lg: 'h-12 px-6 text-callout gap-2 rounded-xl w-full sm:w-auto',
};

interface BaseProps {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

type ButtonProps = BaseProps & React.ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type LinkProps = BaseProps & { href: string; external?: boolean; 'aria-label'?: string };

function classes(variant: Variant, size: Size, className?: string) {
  return cn(
    'inline-flex items-center justify-center font-semibold whitespace-nowrap select-none',
    'transition-[background-color,filter,opacity,transform] duration-150 ease-out active:scale-[0.98]',
    'disabled:opacity-40 disabled:pointer-events-none',
    variants[variant],
    sizes[size],
    className
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'filled', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      className={classes(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </button>
  );
});

export function ButtonLink({ variant = 'filled', size = 'md', icon, className, children, href, external, ...rest }: LinkProps) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes(variant, size, className)} {...rest}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

/** Round icon-only button (toolbar style). Always pass an aria-label. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { 'aria-label': string; active?: boolean }
>(function IconButton({ className, children, active, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-full text-label-secondary',
        'transition-colors duration-150 hover:bg-fill/15 hover:text-label',
        active && 'bg-fill/15 text-label',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
