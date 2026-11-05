import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SiteShell } from "@/components/site-shell";
import AnalyticsLoader from "@/components/analytics-loader";
import { getWebsiteSettings } from "@/lib/site-settings";

// Fonts are loaded via <link> (Google Fonts CDN) instead of next/font/google.
// next/font/google crashes the Vercel Turbopack build with
// "next/font/google queries have exactly one entry" on Next.js 16.1.3.
// The <link> approach is build-safe and renders identically.

// Site metadata — title, description and the social share image come
// from Website → Settings (seo_title / seo_description / og_image_url)
// when the admin has saved them; the built-in values below are the
// fallback, so an untouched shop emits exactly the metadata it always
// did (including no openGraph block until a share image is set). The
// settings read is data-cached (lib/site-settings), keeping static
// pages static-safe.
export async function generateMetadata(): Promise<Metadata> {
  const s = await getWebsiteSettings();
  const title = s.seoTitle ?? "UnSaid — Make the feeling tangible";
  const description =
    s.seoDescription ??
    "Meaningful gifts, considered essentials, and everyday ways to say what matters.";
  return {
    title,
    description,
    verification: { google: "IxHXpOqjp4eA--Qq--RRcyk1fQv9PtDypxGxPtV0VqA" },
    ...(s.ogImageUrl
      ? { openGraph: { title, description, images: [{ url: s.ogImageUrl }] } }
      : {}),
    // Favicon: the orbital "u." mark — SVG first (the same artwork,
    // raster-backed at favicon scale), then sized PNGs for browsers
    // that don't support SVG favicons, ICO as the legacy shortcut.
    icons: {
      icon: [
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/favicon-512x512.png", sizes: "512x512", type: "image/png" },
        { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
        { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
        { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      ],
      shortcut: "/favicon.ico",
      apple: "/apple-touch-icon.png",
    },
    manifest: "/site.webmanifest",
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&family=Questrial&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
        />
        {/* CMS design tokens — CSS custom properties from the CMS database */}
        <link rel="stylesheet" href="/api/public/cms/tokens.css" />
      </head>
      <body className="antialiased">
        <SiteShell>{children}</SiteShell>
        <AnalyticsLoader />
        <Toaster />
      </body>
    </html>
  );
}
