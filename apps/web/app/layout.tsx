import type { Metadata } from 'next';
import './globals.css';
import { Analytics } from '@vercel/analytics/react';

export const metadata: Metadata = {
  title: 'GreenAgain | Recovery control center',
  description: 'Measured recovery for AI applications in production.',
};

const themeScript = `try{if(localStorage.getItem('theme')==='light')document.documentElement.classList.add('light-mode')}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body>{children}<Analytics /></body></html>;
}
