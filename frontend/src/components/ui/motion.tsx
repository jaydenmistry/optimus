'use client';

import { Children, isValidElement, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  type Transition,
  type Variants,
} from 'motion/react';
import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Presets                                                                    */
/* -------------------------------------------------------------------------- */

/** Apple-style ease-out: fast start, long gentle settle */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const SPRING: Transition = { type: 'spring', stiffness: 420, damping: 34, mass: 0.9 };
export const SOFT_SPRING: Transition = { type: 'spring', stiffness: 260, damping: 30 };

const containerVariants: Variants = {
  hidden: {},
  show: (stagger: number = 0.06) => ({ transition: { staggerChildren: stagger, delayChildren: 0.04 } }),
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease: EASE_OUT } },
};

/* -------------------------------------------------------------------------- */
/* Entrance animations                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Children appear one after another (fade + rise). Each direct child gets a
 * wrapper, so it works for grids and stacks without touching the children.
 */
export function Stagger({
  children,
  className,
  stagger = 0.06,
  itemClassName,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
  itemClassName?: string;
}) {
  return (
    <motion.div className={className} variants={containerVariants} custom={stagger} initial="hidden" animate="show">
      {Children.map(children, (child, i) =>
        child == null || child === false ? null : (
          <motion.div key={isValidElement(child) && child.key != null ? child.key : i} variants={itemVariants} className={itemClassName}>
            {child}
          </motion.div>
        )
      )}
    </motion.div>
  );
}

/** Fade + rise when scrolled into view (once) */
export function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -40px 0px' }}
      transition={{ duration: 0.6, ease: EASE_OUT, delay }}
    >
      {children}
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Numbers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Number that counts up on first appearance and tweens to new values, e.g.
 * when a sensor reading or an alert count changes. Writes straight to the
 * DOM, so a tween doesn't re-render React on every frame.
 */
export function AnimatedNumber({
  value,
  format = (n) => Math.round(n).toLocaleString(),
  duration = 0.9,
  className,
  countUp = true,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
  /** Count up from zero on first appearance (off for readings like temperatures) */
  countUp?: boolean;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const mv = useMotionValue(reduced || !countUp ? value : 0);
  const formatRef = useRef(format);
  useEffect(() => {
    formatRef.current = format;
  });

  useMotionValueEvent(mv, 'change', (v) => {
    if (ref.current) ref.current.textContent = formatRef.current(v);
  });

  useEffect(() => {
    if (reduced) {
      mv.set(value);
      if (ref.current) ref.current.textContent = formatRef.current(value);
      return;
    }
    const controls = animate(mv, value, { duration, ease: EASE_OUT });
    return () => controls.stop();
  }, [value, duration, mv, reduced]);

  return (
    <span ref={ref} className={cn('tabular', className)}>
      {format(reduced || !countUp ? value : mv.get())}
    </span>
  );
}

/**
 * Wraps content and plays a soft glow whenever `watch` changes after the
 * first render, to draw the eye to live updates. Uses the Web Animations API
 * directly so the color can reference CSS variables (theme-aware).
 */
export function ChangeGlow({
  watch,
  rgbVar = '--accent',
  className,
  children,
}: {
  watch: unknown;
  /** CSS variable holding the glow's RGB channels */
  rgbVar?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const previous = useRef<string | null>(null);
  const key = watch == null ? null : JSON.stringify(watch);
  useEffect(() => {
    // Only glow when one real value changes to another, not when data first arrives
    const before = previous.current;
    previous.current = key;
    if (before === null || key === null || before === key) return;
    if (reduced || !ref.current?.animate) return;
    ref.current.animate(
      [
        { boxShadow: `0 0 0 0 rgb(var(${rgbVar}) / 0.5)` },
        { boxShadow: `0 0 0 10px rgb(var(${rgbVar}) / 0)` },
      ],
      { duration: 1100, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    );
  }, [key, reduced, rgbVar]);
  return (
    <div ref={ref} className={cn('rounded-card', className)}>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Subscribe to a media query (false during server rendering) */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

export { motion };
