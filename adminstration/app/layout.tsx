import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Administration Platform',
  description: 'Operational commerce admin platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
