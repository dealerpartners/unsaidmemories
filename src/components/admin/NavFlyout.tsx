"use client";

/**
 * NavFlyout — the slide-out module menu, RESTORED to the owner's card
 * grid (image spec, 2026-10-31): ONE CARD PER MODULE and nothing else.
 * No child-link columns — the owner ruled those "a bit much" to scroll
 * (owner order 2026-10-30); each module's pages live in that module's
 * own on-page sidebar (ModuleFrame), not here. This is the exact panel
 * from the owner's reference image: white slide-out from the left,
 * grid of titled cards with one plain-language line each, the current
 * module marked by the soft-purple wash.
 *
 * Reuses the fabric .f-mega-* classes (fabric-shell.css) — the same
 * card grid the chrome used before, driven by the same static nav tree
 * and the same grants filter. Closes on ✕, backdrop, Esc, or picking a
 * module.
 */

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { ADMIN_NAV_TREE, type AdminNavSection } from "@/lib/admin/nav-tree";
import type { ModuleCode } from "@/lib/admin/modules";

/** Card blurbs — the owner's plain-language lines, verbatim. */
const SECTION_TIPS: Record<string, string> = {
  dashboard: "Your shop at a glance — orders, money, and what needs your attention.",
  crm: "Your customers — their details, orders, notes, and follow-ups.",
  orders: "Orders, and everything after a sale: packing, inventory, products, purchasing, and shipping.",
  inventory: "Every product in your catalog with the stock tracked for it — and one click from any blank into the Design Studio.",
  ecommerce: "How your online shop itself is set up — collections, publishing, shipping, taxes, returns.",
  accounting: "The money books — invoices, bills, payments, refunds, taxes, and reports.",
  marketplace: "Your storefront's listings, orders, payments, and settings, gathered in one place.",
  ads: "The Ad Center — where advertisers sign in to run ads on your store.",
  support: "Help requests from customers and partners — read, answer, and resolve them here.",
  analytics: "Charts and reports — what's selling, and where your visitors come from.",
  studio: "Design Studio — place your artwork on products, then publish them to the shop.",
  "trust-safety": "Safety and fairness — identity checks, fraud review, disputes, and policies.",
  integrations: "Connections to outside services — your printing suppliers, social accounts, and secret keys.",
  website: "Your shop's website — its pages, words, and pictures (the CMS).",
  "admin-users": "Who can sign in to this admin, and what each person is allowed to do.",
  system: "Settings for the whole business — organization, brand, security, and system health.",
  help: "Help Center — plain-language guides for every part of this admin.",
  developers: "For builders — the Store API, the ad API, keys, and the developer portal.",
};

/** Card titles — the short names from the owner's grid. */
function displayLabel(item: AdminNavSection): string {
  if (item.id === "support") return "Support Desk";
  if (item.id === "analytics") return "Analytics";
  if (item.id === "studio") return "Design Studio";
  if (item.id === "trust-safety") return "Trust & Safety";
  if (item.id === "ecommerce") return "Ecommerce";
  if (item.id === "admin-users") return "Admin Users";
  return item.label;
}

function sectionHref(s: AdminNavSection): string {
  return s.href ?? s.children?.[0]?.href ?? "/admin";
}

interface NavFlyoutProps {
  open: boolean;
  onClose: () => void;
  allowedModules: ModuleCode[] | null;
}

export default function NavFlyout({ open, onClose, allowedModules }: NavFlyoutProps) {
  const pathname = usePathname() ?? "";

  // Same visibility rule the deleted sidebar used: null grants show
  // everything (owner / fail-open), otherwise the section's module
  // must be in the grant set.
  const sections = useMemo(
    () =>
      ADMIN_NAV_TREE.filter((s) => {
        if (!s.module) return true;
        if (allowedModules === null) return true;
        return new Set(allowedModules).has(s.module);
      }),
    [allowedModules],
  );

  // Which section owns the current URL? Longest matching href wins.
  const activeSection = useMemo(() => {
    let best: { section: AdminNavSection; len: number } | null = null;
    for (const s of sections) {
      const hrefs = s.children?.map((c) => c.href) ?? (s.href ? [s.href] : []);
      for (const href of hrefs) {
        const hit = pathname === href || pathname.startsWith(href + "/");
        if (hit && (!best || href.length > best.len)) best = { section: s, len: href.length };
      }
    }
    return best?.section ?? null;
  }, [pathname, sections]);

  // Esc closes; focus returns to the opener (the topbar hamburger).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        document.querySelector<HTMLButtonElement>("[data-admin-burger]")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div className={`f-mega-wrap${open ? " open" : ""}`} aria-hidden={!open}>
      <div className="f-mega-backdrop" onClick={onClose} />
      <aside className="f-mega" role="dialog" aria-modal="true" aria-label="Full admin menu">
        <div className="f-mega-head">
          <div>
            <div className="f-mega-title">UnSaid</div>
            <p className="f-mega-sub">Every part of your shop&apos;s control room.</p>
          </div>
          <button
            type="button"
            className="f-mega-x"
            onClick={onClose}
            aria-label="Close the menu"
            data-tip="Close the menu and go back to the page you were on."
          >
            <X size={16} />
          </button>
        </div>
        <div className="f-mega-grid">
          {sections.map((s) => {
            const href = sectionHref(s);
            const active = activeSection?.id === s.id;
            return (
              <Link
                key={s.id}
                href={href}
                className={`f-mega-card${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={onClose}
              >
                <span className="f-mega-card-title">{displayLabel(s)}</span>
                <span className="f-mega-card-desc">
                  {SECTION_TIPS[s.id] ?? `Open ${displayLabel(s)}.`}
                </span>
              </Link>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
