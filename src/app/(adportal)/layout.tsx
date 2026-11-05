import "./globals.css";
import "../(portals)/admin/admin.css";

// Prerender scope (owner doctrine, 2026-10-22): authenticated interiors
// are never statically prerendered — the build generates the public
// site only. Every Ad Center page is session-gated; this changes
// build/render mode only, never what a signed-in user sees.
export const dynamic = "force-dynamic";

/**
 * Ad portal route group layout — the entire Unsaid Ad Center
 * (the imported ad engine shell, serving /ads/*).
 *
 * NO AdminShell wrap (owner ruling, 2026-11-03, superseding the
 * 2026-11-01 wrap): the Ad Center is self-serve for advertisers and
 * must not know the shop admin exists. The admin shell stacked a
 * second sidebar, a second header with a second search, the admin
 * flyout (which dumped the shop's module list as raw text over the
 * ads pages), a "Kinnect AI" button, and a third copy of the account
 * identity on top of the ads kit's own sidebar + TopBar. The ads kit
 * now stands alone exactly as the reference portal does: one sidebar,
 * one header, one search, its own sign-out in the profile menu.
 *
 * The scoped globals.css (theme variables under `.adp-root`) still
 * provides the dashboard surface for the ad pages' own content.
 *
 * FONT (owner ruling 2026-10-22, build-critical): the next/font/google
 * DM_Sans loader that lived here is REMOVED — build-time font fetches
 * fail cold builds. DM Sans is not the approved typeface (owner law:
 * Inter only). FLAGGED: if the Ad Center should render in Inter, change
 * the --font-sans stack in (adportal)/globals.css.
 */
export default function AdsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="adp-root antialiased bg-background text-foreground">
      {children}
    </div>
  );
}
