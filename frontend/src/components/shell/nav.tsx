'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeftRight, Clock, LayoutGrid, Monitor, Moon, Settings2, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme, type ThemeMode } from '@/lib/theme';
import { Picker } from '@/components/ui/controls';
import { SimulationButton } from '@/components/simulation/banner';

const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: LayoutGrid },
  { href: '/transfers', label: 'Transfers', icon: ArrowLeftRight },
  { href: '/peak-hours', label: 'Peak Hours', icon: Clock },
  { href: '/admin', label: 'Admin', icon: Settings2 },
] as const;

function isActive(pathname: string, href: string) {
  // SKU detail pages live under Overview
  if (href === '/') return pathname === '/' || pathname.startsWith('/sku');
  return pathname.startsWith(href);
}

const THEME_OPTIONS = [
  { value: 'system' as ThemeMode, label: 'System', icon: <Monitor className="h-4 w-4" aria-hidden /> },
  { value: 'light' as ThemeMode, label: 'Light', icon: <Sun className="h-4 w-4" aria-hidden /> },
  { value: 'dark' as ThemeMode, label: 'Dark', icon: <Moon className="h-4 w-4" aria-hidden /> },
];

function ThemeMenu() {
  const { mode, resolved, setMode } = useTheme();
  const Icon = mode === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun;
  return (
    <Picker
      label="Appearance"
      options={THEME_OPTIONS}
      value={mode}
      onChange={setMode}
      buttonClassName="inline-flex h-9 w-9 items-center justify-center rounded-full text-label-secondary transition-colors hover:bg-fill/15 hover:text-label"
      buttonContent={<Icon className="h-[18px] w-[18px]" aria-hidden />}
    />
  );
}

/** Frosted top bar. Section links show from md up; phones use the tab bar. */
export function NavBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="material hairline-b sticky top-0 z-40">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center rounded-md" aria-label="Optimus home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/optimus.svg" alt="Optimus" className="logo-adaptive h-[22px] w-auto" />
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map(({ href, label }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-subhead font-medium transition-colors duration-150',
                  active ? 'bg-fill/15 text-label' : 'text-label-secondary hover:text-label'
                )}
              >
                {label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-1">
          <SimulationButton />
          <ThemeMenu />
        </div>
      </div>
    </nav>
  );
}

/** iOS-style bottom tab bar for small screens */
export function TabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Sections" className="material hairline-t pb-safe fixed inset-x-0 bottom-0 z-40 md:hidden">
      <div className="mx-auto grid h-[52px] max-w-md grid-cols-4">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
                active ? 'text-accent-text' : 'text-label-secondary'
              )}
            >
              <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="mx-auto mt-4 flex max-w-6xl flex-col items-center justify-between gap-1 px-4 pb-28 pt-6 text-footnote text-label-secondary sm:flex-row sm:px-6 md:pb-10 lg:px-8">
      <p>© 2026 Optimus Corporation</p>
      <p className="font-semibold text-accent-text">UGAHacks 11</p>
    </footer>
  );
}
