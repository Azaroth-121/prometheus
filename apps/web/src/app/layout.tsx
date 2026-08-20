import type { Metadata } from 'next';
import { Sora, Manrope, JetBrains_Mono } from 'next/font/google';
import { SessionProvider } from 'next-auth/react';
import './globals.css';

const display = Sora({ subsets: ['latin'], variable: '--font-display', weight: ['600', '700'] });
const body = Manrope({ subsets: ['latin'], variable: '--font-body' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400', '500'] });

export const metadata: Metadata = {
  title: 'Prometheus',
  description: 'Turn a rough request into a structured, copy-ready prompt.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-void bg-radial-glow font-sans text-ink">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
