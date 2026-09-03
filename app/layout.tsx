import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'BFZ Swag Tracker — Request Employee Gear',
  description: 'Request, track, and fulfill BFZ employee gear from one simple workspace.',
  metadataBase: new URL('https://swag-tracker.vercel.app/'),
  icons: { icon: '/bfz-logo.png' },
  openGraph: {
    title: 'BFZ Swag Tracker',
    description: 'Employee gear, made simple.',
    images: [{ url: 'og.png', width: 1734, height: 909, alt: 'BFZ Swag Tracker — Employee gear, made simple.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BFZ Swag Tracker',
    description: 'Employee gear, made simple.',
    images: ['og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body><Script id="theme-bootstrap" strategy="beforeInteractive">{`try{document.documentElement.dataset.theme=localStorage.getItem('bfz-swag-theme')||'dark'}catch(e){document.documentElement.dataset.theme='dark'}`}</Script>{children}</body></html>;
}
