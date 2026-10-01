import type { Metadata } from 'next';
import { Bowlby_One, Figtree, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const display = Bowlby_One({ weight: '400', subsets: ['latin'], variable: '--f-display' });
const body = Figtree({ subsets: ['latin'], variable: '--f-body' });
const mono = JetBrains_Mono({ weight: ['500', '700'], subsets: ['latin'], variable: '--f-mono' });

export const metadata: Metadata = {
  // The live domain, used for link previews (set NEXT_PUBLIC_SITE_URL to override)
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://foregolf.lol'),
  title: 'Fore!',
  description: 'Yell FORE on pump.fun to get a ball on the tee. Bigger pool, faster rounds. Hole in one takes 10% of the pool.',
  // Link previews on X, Discord and Telegram show the banner
  openGraph: { title: 'Fore!', description: 'Yell FORE on pump.fun. Hole in one takes the pot.', images: [{ url: '/fore-banner.png', width: 1500, height: 500 }] },
  twitter: { card: 'summary_large_image', title: 'Fore!', description: 'Yell FORE on pump.fun. Hole in one takes the pot.', images: ['/fore-banner.png'] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
