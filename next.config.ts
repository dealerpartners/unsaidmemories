import type { NextConfig } from "next";
import { withPayload } from "@payloadcms/next/withPayload";
import path from "path";

// On Vercel, `output: "standalone"` is unnecessary and the custom `cp`
// commands in the build script would fail. We only enable standalone for
// Docker / bare-metal deployments (detected via VERCEL env absence).
const isVercel = !!process.env.VERCEL;

const nextConfig: NextConfig = {
  ...(isVercel ? {} : { output: "standalone" }),
  // Typechecking is enforced separately (local tsc --noEmit gate);
  // the Vercel build's TypeScript step OOM/stalls on this app's size,
  // so the build itself skips type validation (owner order 2026-11-02).
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: false,
  // Build-memory diet: the full tree (admin + Payload + storefront) OOM'd
  // Vercel's basic build machine (SIGKILL in "Creating an optimized
  // production build", deployment dpl_BbFeHfH7). Webpack memory
  // optimizations + the heap cap in the build script keep peak RSS
  // inside the machine.
  experimental: {
    webpackMemoryOptimizations: true,
    // The build machine has 2 cores / 8 GB — match worker parallelism
    // to it so compile workers don't multiply peak RSS.
    cpus: 2,
  },
  allowedDevOrigins: ["external", "localhost", "127.0.0.1"],
  // pg is a CJS package with an optional native addon (pg-native) that the
  // bundler chokes on at runtime on Vercel — externalize it so the route
  // requires it from node_modules instead (used by /api/admin/ensure-indexes
  // and /api/product-questions for pooled DDL).
  serverExternalPackages: ["pg"],
  // Turbopack equivalent of the webpack alias below (Turbopack ignores
  // the webpack() callback; without this the Payload routes fail with
  // "Can't resolve '@payload-config'" — build log dpl_3n2CDmV).
  turbopack: {
    resolveAlias: {
      "@payload-config": "./payload.config.ts",
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@payload-config": path.resolve(process.cwd(), "payload.config.ts"),
    };
    return config;
  },
  // Audit fix (T126 / claim #73): the FAQ lives at /help/faq; /faq 404'd.
  // Permanent redirect so every published /faq link lands on the real page.
  async redirects() {
    return [
      { source: "/faq", destination: "/help/faq", permanent: true },
      // Deprecated fabric CRM routes — the mega menu and sidebar now serve
      // the portals customers page; old fabric customers URLs land there.
      { source: "/admin/crm", destination: "/admin/customers", permanent: true },
      { source: "/admin/crm/customers/:id", destination: "/admin/customers", permanent: true },
      { source: "/admin/customers/:id", destination: "/admin/customers", permanent: true },
      // Owner's routing (2026-11-01): Our World routes to Our Story.
      { source: "/our-world", destination: "/our-story", permanent: true },
      // /occasions is promised by menus/footers but has no page of its
      // own — land it on the Collections & Occasions department, which
      // renders the live catalog.
      { source: "/occasions", destination: "/shop/collections-and-occasions", permanent: true },
    ];
  },
  // City guides: served by the Next.js route src/app/guides/[slug]/page.tsx
  // which wraps the static HTML in the site's nav/footer. The /guides
  // index page stays as a rewrite to the static index.html.
  async rewrites() {
    return [
      { source: "/guides", destination: "/guides/index.html" },
      // The owner's finished standalone pages (uploaded HTML, 2026-11-01),
      // served at clean URLs like the city guides.
      { source: "/memory-box", destination: "/memory-box.html" },
      { source: "/partnerships", destination: "/partnerships.html" },
    ];
  },
  images: {
    // The Vercel image optimizer is OFF, globally (owner order, first
    // given 2026-11-03, completed 2026-11-05): every next/image serves
    // its source direct. Supplier photos live on supplier CDNs that
    // resize on their own edge; the optimizer's transformations ran on
    // function CPU and are what tripped the fair-use block.
    unoptimized: true,
  },
};

export default withPayload(nextConfig, {
  // The Payload config path relative to the project root
  // withPayload will handle loading it
});
