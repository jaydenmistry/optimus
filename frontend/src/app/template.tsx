'use client';

import { motion } from 'motion/react';
import { EASE_OUT } from '@/components/ui/motion';

/**
 * Re-mounts on every navigation, so each page fades and rises into place.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE_OUT }}>
      {children}
    </motion.div>
  );
}
