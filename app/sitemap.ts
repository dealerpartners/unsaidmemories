import type { MetadataRoute } from 'next';
import data from '@/lib/sitemap-data.json';

// The 32 static pixel-for-pixel routes (route.ts handlers) — fixed paths.
const STATIC_ROUTES = [
  '/',
  '/accessibility',
  '/best-sellers',
  '/bundles-gifts',
  '/departments',
  '/family-by-choice',
  '/gift-finder',
  '/guides-stories',
  '/help-contact',
  '/help-faq',
  '/help-shipping-returns',
  '/help-size-guide',
  '/help-track-order',
  '/holidays',
  '/just-because',
  '/kin-keeper-month',
  '/kinnectai',
  '/memory-box',
  '/memory-links',
  '/new-arrivals',
  '/organizations-corporate-gifting',
  '/organizations-funeral-homes',
  '/organizations-schools-hospitals',
  '/organizations-senior-living',
  '/organizations-wedding-planners',
  '/our-story',
  '/our-world',
  '/privacy-policy',
  '/shop',
  '/signature',
  '/terms-of-service',
  '/unsaid-memories',
];

// Dynamic Next.js pages (not in the static 32). /checkout, /admin/*, /api/* are
// intentionally excluded — see robots.ts.
const DYNAMIC_PAGES = ['/how', '/seller', '/shop'];

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://unsaid-memories.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const urls: MetadataRoute.Sitemap = [];

  for (const path of STATIC_ROUTES) {
    urls.push({ url: BASE + path, lastModified: now, priority: path === '/' ? 1 : 0.5 });
  }
  for (const path of DYNAMIC_PAGES) {
    urls.push({ url: BASE + path, lastModified: now, priority: 0.6 });
  }
  for (const slug of data.products ?? []) {
    urls.push({ url: `${BASE}/products/${slug}`, lastModified: now, priority: 0.8 });
  }
  for (const slug of data.collections ?? []) {
    urls.push({ url: `${BASE}/collections/${slug}`, lastModified: now, priority: 0.7 });
  }
  for (const slug of data.categories ?? []) {
    urls.push({ url: `${BASE}/shop/${slug}`, lastModified: now, priority: 0.7 });
  }
  return urls;
}
