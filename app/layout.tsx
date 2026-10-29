import './globals.css';
import SiteChrome from '@/components/SiteChrome';
export const metadata = { title: 'UnSaid Memories — Celebrate. Preserve. Remember.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body><SiteChrome>{children}</SiteChrome></body></html>);
}
