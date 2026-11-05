// ============================================================================
// Portal theme — the per-user top band + sidebar color for the shared
// (portals) shell. Sunny's directive (2026-10-14): White, Black, Orange,
// Turquoise — chosen by the user in their portal/profile settings,
// persisted on their account (public.portal_user_preferences, migration
// 20261048), and applied ONCE at the shared shell: the (portals) layout
// mounts PortalThemeApplier, which stamps data-portal-theme on the
// .portal-theme root; globals.css maps each value to the --sidebar* /
// --topbar* custom properties the one Sidebar and the one Header read.
// No value (NULL / no row / signed out) = the shell's default gray,
// byte-for-byte what every user sees today.
// ============================================================================

export const PORTAL_THEMES = [
  "white",
  "black",
  "orange",
  "turquoise",
] as const;

export type PortalTheme = (typeof PORTAL_THEMES)[number];

export const PORTAL_THEME_LABELS: Record<PortalTheme, string> = {
  white: "White",
  black: "Black",
  orange: "Orange",
  turquoise: "Turquoise",
};

/** The band color each option paints (matches the globals.css token sets);
 *  used for the settings swatches so the picker shows the real color. */
export const PORTAL_THEME_SWATCH: Record<PortalTheme, string> = {
  white: "#ffffff",
  black: "#111111",
  orange: "#c2410c",
  turquoise: "#0f766e",
};

export function isPortalTheme(value: unknown): value is PortalTheme {
  return (
    typeof value === "string" &&
    (PORTAL_THEMES as readonly string[]).includes(value)
  );
}

/** Window event the settings UI dispatches after the server confirms a
 *  save, so the shell recolors in place (PortalThemeApplier listens). */
export const PORTAL_THEME_EVENT = "portal:portal-theme-changed";

export function broadcastPortalTheme(theme: PortalTheme | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(PORTAL_THEME_EVENT, { detail: { theme } }),
  );
}
