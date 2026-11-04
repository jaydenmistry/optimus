'use client';

import { ThemeProvider } from '@/lib/theme';
import { ToastProvider } from '@/components/ui/overlay';
import { SimulationProvider } from '@/components/simulation/provider';
import { SimulationPanel } from '@/components/simulation/panel';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <SimulationProvider>
          {children}
          <SimulationPanel />
        </SimulationProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
