"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { CONSENT_CHANGED_EVENT, readConsentCookie } from "@/lib/consent";

/**
 * Pushes the current page's headings (every H1, H2 and H3, in document
 * order) into the dataLayer as one `page_headings` event, so Tag
 * Manager tags and triggers can key off what a page actually says.
 */
function pushHeadings() {
  try {
    const w = window as any;
    w.dataLayer = w.dataLayer || [];
    const grab = (sel: string) =>
      Array.from(document.querySelectorAll(sel))
        .map((el) => (el.textContent || "").trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .slice(0, 50)
        .map((t) => t.slice(0, 200));
    w.dataLayer.push({
      event: "page_headings",
      page_path: window.location.pathname,
      h1: grab("h1"),
      h2: grab("h2"),
      h3: grab("h3"),
    });
  } catch {
    /* headings capture must never break the store */
  }
}

/**
 * Loads GA4 and/or PostHog on the storefront when she has connected
 * them on the Connections & Keys page. Configuration comes from
 * /api/public/analytics-config (public-safe values only). Nothing
 * loads when nothing is connected.
 *
 * CONSENT GATE (2026-10-30, UnSaid Memories analytics): nothing
 * fires before consent. The loaders run only when the visitor's
 * consent record grants analytics. With no record yet (banner
 * unanswered) or analytics denied, no tag script is added and no
 * pageview is captured. When the visitor grants analytics later
 * (Accept All, or Save Preferences with analytics on), the
 * consent-changed event loads the tags then.
 */
export default function AnalyticsLoader() {
  const loaded = useRef(false);
  const activated = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (loaded.current) return;
      try {
        const res = await fetch("/api/public/analytics-config");
        if (!res.ok || cancelled) return;
        const cfg = await res.json();
        if (cancelled) return;
        loaded.current = true;

        if (cfg.ga4MeasurementId && !(window as any).gtag) {
          const s = document.createElement("script");
          s.async = true;
          s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(cfg.ga4MeasurementId)}`;
          document.head.appendChild(s);
          const inline = document.createElement("script");
          inline.text = `window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} window.gtag = gtag; gtag('js', new Date()); gtag('config', '${cfg.ga4MeasurementId}');`;
          document.head.appendChild(inline);
        }

        if (cfg.gtmContainerId && !(window as any).google_tag_manager?.[cfg.gtmContainerId]) {
          const w = window as any;
          w.dataLayer = w.dataLayer || [];
          w.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
          const gtmScript = document.createElement("script");
          gtmScript.async = true;
          gtmScript.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(cfg.gtmContainerId)}`;
          document.head.appendChild(gtmScript);
        }

        if (cfg.clarityProjectId && !(window as any).clarity) {
          const clarityId = String(cfg.clarityProjectId);
          ((c: any, l: any, a: string, r: string, i: string) => {
            c[a] =
              c[a] ||
              function () {
                (c[a].q = c[a].q || []).push(arguments);
              };
            const t = l.createElement(r);
            t.async = 1;
            t.src = "https://www.clarity.ms/tag/" + i;
            const y = l.getElementsByTagName(r)[0];
            y.parentNode.insertBefore(t, y);
          })(window, document, "clarity", "script", clarityId);
        }

        if (cfg.posthogKey && !(window as any).posthog) {
          const ph = document.createElement("script");
          ph.async = true;
          ph.src = `${cfg.posthogHost || "https://us.i.posthog.com"}/static/array.js`;
          ph.onload = () => {
            try {
              (window as any).posthog?.init(cfg.posthogKey, {
                api_host: cfg.posthogHost || "https://us.i.posthog.com",
                capture_pageview: true,
              });
            } catch {
              /* analytics must never break the store */
            }
          };
          document.head.appendChild(ph);
        }
        activated.current = true;
        window.setTimeout(pushHeadings, 600);
      } catch {
        /* analytics must never break the store */
      }
    };

    // Only load now if analytics is already granted. No record or a
    // denial means: load nothing, and wait for a grant event.
    try {
      if (readConsentCookie()?.analytics) void load();
    } catch {
      /* consent unreadable — load nothing until granted */
    }

    const onConsent = (e: Event) => {
      const detail = (e as CustomEvent).detail as { analytics?: boolean } | undefined;
      const granted = detail?.analytics ?? readConsentCookie()?.analytics ?? false;
      if (granted) void load();
    };
    window.addEventListener(CONSENT_CHANGED_EVENT, onConsent);
    return () => {
      cancelled = true;
      window.removeEventListener(CONSENT_CHANGED_EVENT, onConsent);
    };
  }, []);

  // Every client-side page change re-pushes that page's headings, once
  // the tags are live for this visitor.
  useEffect(() => {
    if (!activated.current) return;
    const t = window.setTimeout(pushHeadings, 600);
    return () => window.clearTimeout(t);
  }, [pathname]);

  return null;
}
