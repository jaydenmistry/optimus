/**
 * Utility functions
 */

export function formatNumber(num: number, decimals = 0): string {
  return num.toFixed(decimals);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatDate(dateString: string, opts?: { year?: boolean }): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(opts?.year === false ? {} : { year: 'numeric' }),
  }).format(date);
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** 135 → "2h 15m", 45 → "45m" */
export function formatMinutes(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

/** Drop the brand prefix from store names where space is tight */
export function shortStoreName(name: string): string {
  return name.replace(/^Chipotle\s+/i, '');
}

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
