'use client';

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { CheckCircle2, XCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { useIsClient, useLatest } from '@/lib/hooks';

/* -------------------------------------------------------------------------- */
/* Sheet / alert dialog                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Confirmation dialog: a bottom sheet on phones, a centered alert on wider
 * screens. Escape and the backdrop cancel; focus moves to Cancel on open.
 */
export function Sheet({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive,
  loading,
  onConfirm,
  onCancel,
  icon,
  children,
}: {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const mounted = useIsClient();
  const cancelCb = useLatest(onCancel);
  const loadingRef = useLatest(loading);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loadingRef.current) cancelCb.current();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, cancelCb, loadingRef]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px] animate-fade-in dark:bg-black/50"
        onClick={() => !loading && onCancel()}
        aria-hidden
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-md rounded-t-[1.25rem] bg-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-float animate-sheet-in dark:bg-elevated sm:rounded-[1.25rem] sm:pb-6"
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-fill/35 sm:hidden" aria-hidden />
        {icon && <div className="mb-3 flex justify-center">{icon}</div>}
        <h2 id={titleId} className="text-center text-title-3">
          {title}
        </h2>
        {message && <div className="mt-2 text-center text-subhead text-label-secondary">{message}</div>}
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row">
          <Button ref={cancelRef} variant="gray" size="lg" className="flex-1" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'filled'}
            size="lg"
            className="flex-1"
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* -------------------------------------------------------------------------- */

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  title: string;
  message?: string;
  tone: ToastTone;
  action?: { label: string; href: string; onClick?: () => void };
}

const ToastContext = createContext<{ show: (t: Omit<ToastItem, 'id'>) => void }>({ show: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const toneIcon: Record<ToastTone, React.ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-sys-green" aria-hidden />,
  error: <XCircle className="h-5 w-5 text-sys-red" aria-hidden />,
  info: <Info className="h-5 w-5 text-accent-text" aria-hidden />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const show = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = ++counter.current;
    setItems((prev) => [...prev.slice(-2), { ...t, id }]);
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), t.tone === 'error' || t.action ? 6000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-3 z-[110] flex flex-col items-center gap-2 px-4 sm:top-5"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'material-thick pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl px-4 py-3 shadow-float ring-1 ring-separator/50 animate-toast-in'
            )}
          >
            <span className="mt-px">{toneIcon[t.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-subhead font-semibold text-label">{t.title}</p>
              {t.message && <p className="text-footnote text-label-secondary">{t.message}</p>}
            </div>
            {t.action && (
              <Link
                href={t.action.href}
                onClick={t.action.onClick}
                className="shrink-0 self-center rounded-full bg-accent/12 px-3 py-1 text-footnote font-semibold text-accent-text hover:bg-accent/20 dark:bg-accent/25"
              >
                {t.action.label}
              </Link>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
