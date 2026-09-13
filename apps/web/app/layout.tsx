import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GreenAgain | Recovery control center',
  description: 'Measured recovery for AI applications in production.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
