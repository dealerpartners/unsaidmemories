"use client";

/**
 * AdminShell — the ONE admin chrome, rebuilt on the admin's OWN teal
 * design system (.portal-theme / .adm-* in admin.css), 2026-10-31.
 *
 * The earlier purple .fabric-admin / .uns-* / .mframe-* chrome was a
 * second system laid over the teal one the pages already use — it is
 * retired. This chrome now carries the SAME teal #007c7d tokens the
 * module pages style against, so the topbar, the flyout cards, and the
 * ModuleFrame sidebar all read as one system with the tables.
 *
 *   • Topbar (.adm-topbar, 56px, teal accent): the HAMBURGER is the
 *     first element — it sits where the UnSaid image/icon sat (both
 *     deleted) and opens the 14-panel flyout (NavFlyout). Breadcrumb
 *     Module › Page, search slot, date, user chip, sign out.
 *   • Workspace tabs (.f-tabstrip): browser-style, persisted, max 8.
 *   • ModuleFrame renders the 240px teal .adm-sidebar (the module's
 *     children) + .adm-main content. Studio keeps the full viewport.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Plus, Receipt, Search, Sparkles, UserPlus } from "lucide-react";
import { useAppStore } from "@/lib/portal-store";
import { useCurrentUser } from "@/hooks/use-auth";
import { ADMIN_NAV_TREE, type AdminNavSection } from "@/lib/admin/nav-tree";
import { ModuleFrame } from "@/components/admin/ModuleFrame";
import NavFlyout from "@/components/admin/NavFlyout";
import AdminSearchPalette from "@/components/admin/AdminSearchPalette";
import TooltipHost from "@/components/admin/Tooltip";
import type { ModuleCode } from "@/lib/admin/modules";
import "./admin-chrome.css";

const TABS_KEY = "uns.admin.tabs.v1";
const MAX_TABS = 8;

/** Which nav section owns this URL? Longest matching href wins. */
function resolveSection(pathname: string, sections: AdminNavSection[]): AdminNavSection | null {
  let best: { section: AdminNavSection; len: number } | null = null;
  for (const s of sections) {
    const hrefs = s.children?.map((c) => c.href) ?? (s.href ? [s.href] : []);
    for (const href of hrefs) {
      const hit = pathname === href || pathname.startsWith(href + "/");
      if (hit && (!best || href.length > best.len)) best = { section: s, len: href.length };
    }
  }
  return best?.section ?? null;
}

/** The page label inside the section (longest matching child), if any. */
function resolvePageLabel(pathname: string, section: AdminNavSection | null): string | null {
  if (!section?.children) return null;
  let best: { label: string; len: number } | null = null;
  for (const c of section.children) {
    const hit = pathname === c.href || pathname.startsWith(c.href + "/");
    if (hit && (!best || c.href.length > best.len)) best = { label: c.label, len: c.href.length };
  }
  return best?.label ?? null;
}

/**
 * Quick actions — the global create menu in the topbar. The modal
 * system (QuickActionModals, mounted by the admin layout) never lost
 * its writes; it lost its LAUNCHER when the old header was retired —
 * the only remaining triggers were buried inside two modules' pages.
 * This restores the shell-level entry. Action set follows the owner's
 * business rulings: no take-payment (storefront money is Stripe; the
 * payment modal stays inside Accounting where it belongs) and no
 * retired search palette (⌘K goes to the search page).
 */
function QuickActionsMenu() {
  const setActiveModal = useAppStore((s) => s.setActiveModal);
  const [open, setOpen] = useState(false);
  const pick = (action: "customer" | "invoice") => {
    setOpen(false);
    setActiveModal(action);
  };
  return (
    <div className="uns-quickact">
      <button
        type="button"
        className="uns-quickact-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-tip="Quick actions — start the common jobs from anywhere: add a customer, write an invoice."
      >
        <Plus size={14} strokeWidth={2.4} />
        <span>New</span>
      </button>
      {open ? (
        <>
          <div className="uns-quickact-backdrop" onClick={() => setOpen(false)} />
          <div className="uns-quickact-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => pick("customer")}>
              <UserPlus size={15} />
              <span>
                <b>New customer</b>
                <small>Add a person to the CRM</small>
              </span>
            </button>
            <button type="button" role="menuitem" onClick={() => pick("invoice")}>
              <Receipt size={15} />
              <span>
                <b>New invoice</b>
                <small>Bill a customer</small>
              </span>
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function AdminShell({
  allowedModules,
  email,
  role,
  children,
}: {
  allowedModules: ModuleCode[] | null;
  email: string | null;
  role: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "/admin";
  const router = useRouter();
  // The user chip names the person actually signed in — resolved
  // from the live session (the same source the Ad Center shell
  // uses), never a hardcoded name. The /ads wrap passes email=null
  // by design (public authentication), so the session is the only
  // identity available there; on /admin it resolves the admin.
  const { user: sessionUser } = useCurrentUser();
  const chipName =
    sessionUser?.name?.trim() ||
    (email
      ? email
          .split("@")[0]
          .replace(/[._-]+/g, " ")
          .replace(/\d+$/g, "")
          .trim()
          .replace(/\b\w/g, (c) => c.toUpperCase()) || "Account"
      : "Account");
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [tabIds, setTabIds] = useState<string[]>([]);
  const [today, setToday] = useState<string | null>(null);

  const sections = useMemo(
    () =>
      ADMIN_NAV_TREE.filter((s) => {
        if (!s.module) return true;
        if (allowedModules === null) return true;
        return new Set(allowedModules).has(s.module);
      }),
    [allowedModules],
  );

  const activeSection = useMemo(() => resolveSection(pathname, sections), [pathname, sections]);
  const activePageLabel = useMemo(
    () => resolvePageLabel(pathname, activeSection),
    [pathname, activeSection],
  );

  // Workspace tabs — persisted, max 8.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TABS_KEY);
      if (raw) setTabIds(JSON.parse(raw) as string[]);
    } catch { /* fresh tab set */ }
  }, []);

  useEffect(() => {
    if (!activeSection) return;
    setTabIds((prev) => {
      const next = prev.includes(activeSection.id)
        ? prev
        : [...prev, activeSection.id].slice(-MAX_TABS);
      if (next.join("|") !== prev.join("|")) {
        try { window.localStorage.setItem(TABS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      }
      return next;
    });
  }, [activeSection]);

  // Date chip renders client-side only (avoids hydration mismatch).
  useEffect(() => {
    setToday(
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    );
  }, []);

  // ⌘K / Ctrl-K opens the global search palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      setTabIds((prev) => {
        const next = prev.filter((t) => t !== id);
        try { window.localStorage.setItem(TABS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
      if (activeSection?.id === id) {
        const remaining = tabIds.filter((t) => t !== id);
        const fallback = sections.find((s) => s.id === remaining[remaining.length - 1]);
        router.push(fallback?.children?.[0]?.href ?? fallback?.href ?? "/admin");
      }
    },
    [activeSection, tabIds, sections, router],
  );

  const signOut = useCallback(async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch { /* best effort */ }
    router.replace("/login");
  }, [router]);

  // Studio owns the full viewport (its own chrome) — no shell padding.
  const studioBare = pathname === "/admin/studio" || pathname.startsWith("/admin/studio/");

  // The Ad Center owns its own sidebar (the ads kit's Musicosy rail).
  // ModuleFrame's manifest sidebar must NOT stack on top of it — the
  // advertiser sees exactly one sidebar: the Ad Center's own.
  // (Owner ruling, 2026-11-03: the "Unsaid" manifest sidebar over /ads
  // goes away; the original ads sidebar is restored as the only one.)
  const adsBare = pathname === "/ads" || pathname.startsWith("/ads/");

  return (
    <div className="portal-theme uns-root">
      <header className="adm-topbar uns-topbar">
        {/* The hamburger — EXACTLY where the UnSaid image/icon sat. */}
        <button
          type="button"
          className="uns-burger"
          data-admin-burger
          onClick={() => setFlyoutOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={flyoutOpen}
          aria-label="Open navigation — all modules"
          data-tip="Every module of the admin, one flyout. Your current module is highlighted."
        >
          <Menu size={18} strokeWidth={2.2} />
        </button>

        {/* Breadcrumb — Module › Page */}
        <nav className="uns-crumb" aria-label="Breadcrumb">
          {activeSection ? (
            <>
              <Link
                href={activeSection.children?.[0]?.href ?? activeSection.href ?? "/admin"}
                className="uns-crumb-mod"
              >
                {activeSection.label}
              </Link>
              {activePageLabel ? (
                <span className="uns-crumb-sep" aria-hidden="true">›</span>
              ) : null}
              {activePageLabel ? <b>{activePageLabel}</b> : null}
            </>
          ) : (
            <b>Admin</b>
          )}
        </nav>

        <div className="uns-topspacer" />

        <button
          type="button"
          className="uns-searchslot"
          aria-label="Search the admin (⌘K)"
          onClick={() => setSearchOpen(true)}
          data-tip="Search customers, orders, products, sellers — opens with ⌘K too."
        >
          <Search size={14} />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </button>

        {/* Kinnect AI — the top bar's persistent AI entry (owner
            ruling: the AI lives in the top bar in EVERY shell). It
            was lost when this shell replaced the portal header;
            restored here with the same behavior — it opens the ONE
            Kinnect drawer mounted in the root layout via its
            "kinnect:open" event, scoped to the Manage context. */}
        <button
          type="button"
          className="uns-aibtn"
          aria-label="Open Kinnect AI"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("kinnect:open", { detail: { context: "manage" } }),
            )
          }
          data-tip="Kinnect AI — your assistant. Ask it to find, draft, or do things across the admin."
        >
          <Sparkles size={14} aria-hidden="true" />
          <span>Kinnect AI</span>
        </button>

        <QuickActionsMenu />

        {today ? (
          <div className="uns-date" title="Today">
            {today}
          </div>
        ) : null}

        <div className="uns-user" data-tip="Your admin identity and role.">
          <span className="uns-avatar" aria-hidden="true">
            {chipName.slice(0, 1).toUpperCase()}
          </span>
          <span className="uns-user-meta">
            <span className="uns-user-name">{chipName}</span>
            {role ? <span className="uns-user-role">{role}</span> : null}
          </span>
        </div>

        <button
          type="button"
          className="uns-signout"
          onClick={signOut}
          data-tip="Sign out of the admin. Your open tabs will be right here when you sign back in."
        >
          <LogOut size={14} />
          <span className="uns-signout-label">Sign out</span>
        </button>
      </header>

      {/* Workspace tabs */}
      <div className="f-tabstrip" role="tablist" aria-label="Open modules">
        {tabIds.map((id) => {
          const section = sections.find((s) => s.id === id);
          if (!section) return null;
          const active = activeSection?.id === id;
          return (
            <Link
              key={id}
              role="tab"
              aria-selected={active}
              href={section.children?.[0]?.href ?? section.href ?? "/admin"}
              className={`f-tab${active ? " active" : ""}`}
            >
              <span className="f-tab-title">{section.label}</span>
              <button
                type="button"
                className="f-tab-x"
                aria-label={`Close ${section.label} tab`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  closeTab(id);
                }}
              >
                ×
              </button>
            </Link>
          );
        })}
      </div>

      {/* ModuleFrame renders the teal sidebar + content; studio is bare.
          /ads keeps the shell top bar + tabs but renders in the plain
          content frame — its own sidebar lives inside the children. */}
      {studioBare ? (
        <>{children}</>
      ) : adsBare ? (
        <main className="adm-main">
          <div className="mframe-content">{children}</div>
        </main>
      ) : (
        <ModuleFrame allowedModules={allowedModules}>{children}</ModuleFrame>
      )}

      <NavFlyout open={flyoutOpen} onClose={() => setFlyoutOpen(false)} allowedModules={allowedModules} />
      <AdminSearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <TooltipHost />
    </div>
  );
}
