'use client';

import { ThemeProvider } from '@/lib/theme';
import { ToastProvider } from '@/components/ui/overlay';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  );
}
