import type { CSSProperties } from "react";
import "./portals.css";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { PortalThemeApplier } from "@/components/portal/PortalThemeApplier";

// Prerender scope (owner doctrine, 2026-10-22): authenticated interiors
// are never statically prerendered — the build generates the public
// site only. Every portal page is session-gated; this changes
// build/render mode only, never what a signed-in user sees.
export const dynamic = "force-dynamic";

// ============================================================================
// (portals) route-group layout — shared chrome for the Unsaid portals (imported from UnSaid Memories 2026-10-30, re-themed white + purple)
// (admin OS, groomer station, customer portal) and the five bifurcated auth
// pages. Loads the portal fonts and applies the scoped .portal-theme token set
// so the public website's root tokens are never touched.
//
// Fonts load via a SELF-HOSTED stylesheet <link> (/fonts/fonts.css,
// defect census Class F) — no Google Fonts fetch at build or render
// time, and NOT next/font/google: Turbopack in
// Next.js 16.1.3 fails cold builds on next/font/google — the generated font
// CSS points at @vercel/turbopack-next/internal/font/google/font with
// fonts.gstatic.com/l/font?kit= URLs and the build dies with "Module not
// found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'"
// + "next/font/google queries have exactly one entry" (16 errors, Hanken
// Grotesk module). Same families, same weights, same CSS variables
// (--font-bar / --font-sans) — only the loader changed.
//
// The layout itself stays a SERVER component (the shell is static HTML).
// The QueryProvider is the one client boundary: it gives every portal page
// the client-side data layer (stale-while-revalidate queries against the
// /api routes) so no render path ever waits on the database — cached data
// paints instantly, fresh data arrives in the background.
// ============================================================================

/* Ad Center type system (portal unification, owner directive 2026-10-26):
 * DM Sans everywhere (--font-bar = sidebar/topbar, --font-sans = canvas),
 * Space Grotesk for headings (--font-display) — the exact stacks declared in
 * (adportal)/globals.css for /ads, self-hosted via /fonts/fonts.css. */
const PORTAL_FONT_CSS = "/fonts/fonts.css";

const fontVars = {
  "--font-bar": "'DM Sans'",
  "--font-sans": "'DM Sans'",
  "--font-display": "'Space Grotesk'",
} as CSSProperties;

export default function PortalsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="portal-theme" style={fontVars}>
      <link rel="stylesheet" href={PORTAL_FONT_CSS} />
      {/* The ONE theme application point: stamps the signed-in user's saved
          band/sidebar color on this root for every portal under the group. */}
      <PortalThemeApplier />
      <QueryProvider>{children}</QueryProvider>
    </div>
  );
}
