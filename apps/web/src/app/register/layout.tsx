import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create an account',
  description: 'Create a free Prometheus account.',
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
