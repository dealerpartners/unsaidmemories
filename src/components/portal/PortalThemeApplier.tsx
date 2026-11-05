"use client";

import { useEffect } from "react";
import {
  PORTAL_THEME_EVENT,
  isPortalTheme,
  type PortalTheme,
} from "@/lib/portal-theme";

// ============================================================================
// PortalThemeApplier — the ONE application point for the per-user portal
// theme. Mounted once by the shared (portals) layout, so every portal that
// renders under it (customer, employee, seller, admin) inherits the user's
// saved top band + sidebar color with no per-portal code.
//
// It stamps data-portal-theme on the .portal-theme root; globals.css maps
// that attribute to the --sidebar* / --topbar* tokens the shared Sidebar
// and Header read. Signed out or no saved preference → the attribute stays
// absent → the shell's default gray, exactly as today. After the settings
// UI saves, it dispatches PORTAL_THEME_EVENT and the shell recolors in
// place — no reload.
// ============================================================================

export function PortalThemeApplier() {
  useEffect(() => {
    const root = document.querySelector(".portal-theme");
    if (!root) return;

    const apply = (theme: PortalTheme | null) => {
      if (theme && isPortalTheme(theme)) {
        root.setAttribute("data-portal-theme", theme);
      } else {
        root.removeAttribute("data-portal-theme");
      }
    };

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account/theme", { cache: "no-store" });
        if (!res.ok) return; // signed out / unavailable → default white
        const json = await res.json().catch(() => ({}));
        if (!cancelled) apply(isPortalTheme(json?.theme) ? json.theme : null);
      } catch {
        /* the shell keeps its default appearance */
      }
    })();

    const onChange = (e: Event) => {
      const theme = (e as CustomEvent).detail?.theme;
      apply(isPortalTheme(theme) ? theme : null);
    };
    window.addEventListener(PORTAL_THEME_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(PORTAL_THEME_EVENT, onChange);
    };
  }, []);

  return null;
}
