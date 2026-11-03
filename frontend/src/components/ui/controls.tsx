'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Segmented control                                                          */
/* -------------------------------------------------------------------------- */

export interface SegmentOption<T extends string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  'aria-label'?: string;
}

/**
 * Equal-width segments with a sliding thumb. Renders as a radiogroup so
 * arrow keys move between options.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
  label,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'md';
  label: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = (index + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('relative inline-grid rounded-[9px] bg-fill/12 p-0.5', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute bottom-0.5 left-0.5 top-0.5 rounded-[7px] bg-surface shadow-thumb transition-transform duration-200 ease-out dark:bg-elevated"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((opt, i) => {
        const selected = i === index;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={opt['aria-label']}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(opt.value)}
            className={cn(
              'relative z-10 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] font-medium transition-colors',
              size === 'sm' ? 'h-7 px-2.5 text-footnote' : 'h-8 px-3.5 text-subhead',
              selected ? 'text-label' : 'text-label-secondary hover:text-label'
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Popover + menu picker                                                      */
/* -------------------------------------------------------------------------- */

function useDismiss(open: boolean, close: () => void, ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, ref]);
}

export interface PickerOption<T> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  description?: string;
}

/**
 * Pop-up menu button (like an iOS pull-down menu) for choosing one value.
 */
export function Picker<T extends string | number | null>({
  options,
  value,
  onChange,
  label,
  className,
  align = 'right',
  buttonContent,
  buttonClassName,
}: {
  options: PickerOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
  align?: 'left' | 'right';
  /** Replace the default "label + chevrons" button content */
  buttonContent?: React.ReactNode;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, root);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const current = options[selectedIndex];

  useEffect(() => {
    if (open) {
      setActive(Math.max(0, selectedIndex));
      requestAnimationFrame(() => listRef.current?.focus());
    }
  }, [open, selectedIndex]);

  function choose(i: number) {
    onChange(options[i].value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + options.length) % options.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div ref={root} className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${current?.label ?? ''}`}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          buttonClassName ??
            'inline-flex h-10 max-w-full items-center gap-2 rounded-full bg-surface pl-4 pr-3 text-subhead font-medium text-label shadow-card ring-1 ring-separator/70 transition-colors hover:bg-fill/8 dark:bg-elevated'
        )}
      >
        {buttonContent ?? (
          <>
            {current?.icon}
            <span className="truncate">{current?.label ?? label}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-label-tertiary" aria-hidden />
          </>
        )}
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onListKey}
          className={cn(
            'material-thick absolute z-50 mt-2 max-h-80 min-w-[15rem] origin-top overflow-auto rounded-xl p-1.5 shadow-float ring-1 ring-separator/60 animate-pop-in focus:outline-none',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {options.map((opt, i) => {
            const selected = i === selectedIndex;
            return (
              <li
                key={String(opt.value)}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-subhead',
                  i === active ? 'bg-accent text-accent-contrast' : 'text-label'
                )}
              >
                <Check
                  className={cn('h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')}
                  aria-hidden
                />
                {opt.icon}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{opt.label}</span>
                  {opt.description && (
                    <span className={cn('block text-caption', i === active ? 'opacity-80' : 'text-label-secondary')}>
                      {opt.description}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Info popover                                                               */
/* -------------------------------------------------------------------------- */

export function Popover({
  trigger,
  label,
  children,
  align = 'right',
  className,
}: {
  trigger: React.ReactNode;
  label: string;
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, root);
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-label-secondary transition-colors hover:bg-fill/15 hover:text-label"
      >
        {trigger}
      </button>
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={label}
          className={cn(
            'material-thick absolute z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] origin-top rounded-xl p-4 text-subhead text-label shadow-float ring-1 ring-separator/60 animate-pop-in',
            align === 'right' ? 'right-0' : 'left-0',
            className
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Search field                                                               */
/* -------------------------------------------------------------------------- */

export function SearchField({
  value,
  onChange,
  placeholder = 'Search',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={cn('relative flex h-9 items-center', className)}>
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-2.5 h-4 w-4 text-label-secondary" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-full w-full rounded-[10px] bg-fill/12 pl-8 pr-8 text-subhead text-label placeholder:text-label-secondary focus:bg-fill/16 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 flex h-4 w-4 items-center justify-center rounded-full bg-label-tertiary text-surface"
        >
          <X className="h-3 w-3" strokeWidth={3} aria-hidden />
        </button>
      )}
    </label>
  );
}
