'use client';

import { MotionConfig } from 'motion/react';
import { ThemeProvider } from '@/lib/theme';
import { ToastProvider } from '@/components/ui/overlay';
import { SimulationProvider } from '@/components/simulation/provider';
import { SimulationPanel } from '@/components/simulation/panel';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // "user": follow the OS reduced-motion setting for every JS animation
    <MotionConfig reducedMotion="user">
    <ThemeProvider>
      <ToastProvider>
        <SimulationProvider>
          {children}
          <SimulationPanel />
        </SimulationProvider>
      </ToastProvider>
    </ThemeProvider>
    </MotionConfig>
  );
}
