import './globals.css';
import SiteChrome from '@/components/SiteChrome';
export const metadata = {
  title: 'UnSaid Memories — Celebrate. Preserve. Remember.',
  description: 'Thoughtfully designed keepsakes, memory gifts, and celebration goods for every UnSaid Holiday — Kin Keeper, Ride or Die, Work Bestie, Family by Choice, and Just Because.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body><SiteChrome>{children}</SiteChrome></body></html>);
}
