'use client';
import { usePathname } from 'next/navigation';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';

// Storefront chrome everywhere except the admin panel.
// Admin gets its own shell (sidebar in app/admin/layout, when present)
// and no storefront header/footer.
export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  if (isAdmin) {
    return <main>{children}</main>;
  }
  return (<><SiteHeader /><main>{children}</main><SiteFooter /></>);
}
