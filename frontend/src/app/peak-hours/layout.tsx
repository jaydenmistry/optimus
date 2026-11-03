import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Peak Hours' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
