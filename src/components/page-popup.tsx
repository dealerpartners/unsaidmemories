"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

/**
 * PagePopup — the storefront side of a published pop-up. Fetches the
 * ONE live pop-up for the current page (or nothing) and shows it on
 * its trigger: delay, scroll percent, exit intent, or immediately.
 * Frequency is honored in the shopper's browser: once per visit
 * (session storage), once a day (local storage with a date), or every
 * view. Rendered as a fixed overlay with inline styles only — no
 * template, no card, no banner stack. A banner and a pop-up never
 * compete: the banner is the page's top strip, the pop-up is an
 * overlay the shopper can close.
 */
export function PagePopup() {
  const pathname = usePathname();
  const [popup, setPopup] = useState<{
    id: string;
    title: string;
    body: string;
    cta_label: string;
    cta_href: string;
    bg_color: string;
    text_color: string;
    image_url: string;
    trigger_type: string;
    trigger_value: number;
    frequency: string;
    show_on_mobile: boolean;
    dismissible: boolean;
  } | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let live = true;
    let cleanup: (() => void) | undefined;
    setVisible(false);
    setPopup(null);
    fetch(`/api/public/website/popups?placement=${encodeURIComponent(pathname)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!live || !d?.popup) return;
        const p = d.popup;
        if (!p.show_on_mobile && typeof window !== "undefined" && window.innerWidth < 768) return;
        const key = `unsaid-popup-${p.id}`;
        if (p.frequency === "once_per_session" && sessionStorage.getItem(key)) return;
        if (p.frequency === "once_per_day" && localStorage.getItem(key) === new Date().toDateString()) return;
        setPopup(p);
        const mark = () => {
          if (p.frequency === "once_per_session") sessionStorage.setItem(key, "1");
          if (p.frequency === "once_per_day") localStorage.setItem(key, new Date().toDateString());
        };
        const show = () => {
          if (!live) return;
          mark();
          setVisible(true);
        };
        if (p.trigger_type === "immediate") show();
        else if (p.trigger_type === "delay") {
          const t = setTimeout(show, Math.max(0, p.trigger_value) * 1000);
          cleanup = () => clearTimeout(t);
        } else if (p.trigger_type === "scroll") {
          const onScroll = () => {
            const pct = (window.scrollY / Math.max(1, document.body.scrollHeight - window.innerHeight)) * 100;
            if (pct >= p.trigger_value) {
              window.removeEventListener("scroll", onScroll);
              show();
            }
          };
          window.addEventListener("scroll", onScroll, { passive: true });
          cleanup = () => window.removeEventListener("scroll", onScroll);
        } else if (p.trigger_type === "exit_intent") {
          const onOut = (e: MouseEvent) => {
            if (!e.relatedTarget && e.clientY <= 0) {
              document.removeEventListener("mouseout", onOut);
              show();
            }
          };
          document.addEventListener("mouseout", onOut);
          cleanup = () => document.removeEventListener("mouseout", onOut);
        }
      })
      .catch(() => null);
    return () => {
      live = false;
      cleanup?.();
    };
  }, [pathname]);

  if (!popup || !visible) return null;
  return (
    <div
      role="dialog"
      aria-label={popup.title || "Message"}
      style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(25,22,31,.48)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={() => popup.dismissible && setVisible(false)}
    >
      <div
        style={{ background: popup.bg_color, color: popup.text_color, maxWidth: 480, width: "100%", padding: 32, position: "relative" }}
        onClick={(e) => e.stopPropagation()}
      >
        {popup.dismissible && (
          <button aria-label="Close" onClick={() => setVisible(false)} style={{ position: "absolute", right: 12, top: 12, border: 0, background: "transparent", color: "inherit", cursor: "pointer" }}>
            <X size={18} />
          </button>
        )}
        {popup.image_url && <img src={popup.image_url} alt="" style={{ width: "100%", display: "block", marginBottom: 20 }} />}
        {popup.title && <h2 style={{ fontFamily: "var(--serif)", fontSize: 30, margin: "0 0 12px", fontWeight: 400 }}>{popup.title}</h2>}
        {popup.body && <p style={{ fontSize: 13, lineHeight: 1.7, margin: "0 0 20px" }}>{popup.body}</p>}
        {popup.cta_label && popup.cta_href && (
          <Link href={popup.cta_href} onClick={() => setVisible(false)} style={{ display: "inline-block", background: popup.text_color, color: popup.bg_color, padding: "12px 22px", fontSize: 11, fontWeight: 700 }}>
            {popup.cta_label}
          </Link>
        )}
      </div>
    </div>
  );
}
