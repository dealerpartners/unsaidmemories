"use client";

import Link from "next/link";
import { useState, useRef, useEffect, useCallback } from "react";
import { ProfileDropdown } from "@/components/ads/profile-dropdown";
import { useCurrentUser } from "@/hooks/use-auth";

/* ═══════════════════════════════════════════════════════════
   Top Bar — App Shell component with all 8 sub-components:
   1. Advertiser / Business / Agency Client Switcher
   2. Ads Plan & Subscription Status
   3. Global Search
   4. Date Range Filter
   5. Help & Resources
   6. Notification Drawer
   7. Profile Menu
   8. Create Campaign [A]
   ═══════════════════════════════════════════════════════════ */

export function TopBar() {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    fetch("/api/ads/notifications").then((r) => (r.ok ? r.json() : null))
      .then((d) => setUnread(d?.unread ?? 0)).catch(() => {});
  }, []);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRangeOpen, setDateRangeOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifTab, setNotifTab] = useState(0);

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-5">
        {/* ─── Left side: Switcher + Plan Status ─── */}
        <div className="flex items-center gap-3">
          {/* 1. Advertiser / Business / Agency Client Switcher */}
          <AccountSwitcher />

          {/* 2. Ads Plan & Subscription Status */}
          <PlanBadge />
        </div>

        {/* ─── Right side: all action chrome ─── */}
        <div className="flex items-center gap-2">
          {/* 3. Global Search */}
          <GlobalSearch
            open={searchOpen}
            onOpenChange={setSearchOpen}
            query={searchQuery}
            onQueryChange={setSearchQuery}
          />

          {/* 4. Date Range Filter */}
          <DateRangeFilter open={dateRangeOpen} onOpenChange={setDateRangeOpen} />

          {/* 5. Help & Resources */}
          <HelpResources open={helpOpen} onOpenChange={setHelpOpen} />

          {/* 6. Notification Drawer trigger */}
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-50 hover:text-neutral-600"
            title="Notifications"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unread > 0 && <span className="absolute right-1 top-1 flex h-2 w-2 rounded-full bg-red-500" />}
          </button>

          {/* 7. Profile Menu */}
          <ProfileDropdown />

          {/* 8. Create Campaign [A] */}
          <Link
            href="/ads/ads-manager/campaigns/create"
            className="flex items-center gap-1.5 rounded-lg bg-[#f2eafe] px-3 py-1.5 text-sm font-medium text-[#6942c2] transition-colors hover:bg-[#e7dbfc]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create
          </Link>
        </div>
      </header>

      {/* ─── 6. Notification Drawer (overlay) ─── */}
      {notifOpen && (
        <NotificationDrawer
          tab={notifTab}
          onTabChange={setNotifTab}
          onClose={() => setNotifOpen(false)}
        />
      )}
    </>
  );
}

/* ─── 1. Account Switcher — Advertiser / Business / Agency Client ─── */
function AccountSwitcher() {
  const { user } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"advertiser" | "business" | "agency">("advertiser");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        {user?.accountName || "My Account"}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-64 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg z-50">
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Switch context</p>
          {([
            { id: "advertiser" as const, label: "Advertiser", desc: "Your own ad account" },
            { id: "business" as const, label: "Business Center", desc: "Manage business assets" },
            { id: "agency" as const, label: "Agency Client", desc: "Client ad accounts" },
          ]).map((item) => (
            <button
              key={item.id}
              onClick={() => { setMode(item.id); setOpen(false); }}
              className={`flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${mode === item.id ? "bg-neutral-100" : "hover:bg-neutral-50"}`}
            >
              <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold shrink-0" style={{ borderColor: mode === item.id ? "#171717" : "#d4d4d4", background: mode === item.id ? "#171717" : "transparent", color: mode === item.id ? "#fff" : "#a3a3a3" }}>
                {mode === item.id ? "✓" : ""}
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-900">{item.label}</p>
                <p className="text-xs text-neutral-500">{item.desc}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── 2. Ads Plan & Subscription Status ─── */
function PlanBadge() {
  const { user } = useCurrentUser();
  const [tier, setTier] = useState<string>("");
  useEffect(() => {
    fetch("/api/ads/tiers").then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.current?.name) setTier(d.current.name); }).catch(() => {});
  }, []);
  void user;
  return (
    <Link
      href="/ads/billing/plans"
      className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-neutral-700"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" /><path d="M1 10h22" />
      </svg>
      {tier || "Free"}
    </Link>
  );
}

/* ─── 3. Global Search ─── */
function GlobalSearch({ open, onOpenChange, query, onQueryChange }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  query: string; onQueryChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const [index, setIndex] = useState<{ type: string; label: string; href: string }[]>([]);
  useEffect(() => {
    let live = true;
    Promise.all([
      fetch("/api/ads/campaigns").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/ads/audiences").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/ads/creatives").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([c, a, cr]) => {
      if (!live) return;
      const rows: { type: string; label: string; href: string }[] = [];
      for (const x of c?.campaigns ?? []) rows.push({ type: "Campaign", label: x.name, href: `/ads/campaigns/${x.id}` });
      for (const x of a?.audiences ?? []) rows.push({ type: "Audience", label: x.name, href: `/ads/audiences/${x.id}` });
      for (const x of cr?.creatives ?? []) rows.push({ type: "Creative", label: x.name, href: `/ads/creatives/library/${x.id}` });
      setIndex(rows);
    });
    return () => { live = false; };
  }, []);
  const results = query.length > 0
    ? index.filter((r) => r.label.toLowerCase().includes(query.toLowerCase())).slice(0, 12)
    : [];

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      {!open && (
        <button
          onClick={() => onOpenChange(true)}
          className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-50 hover:text-neutral-600"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          Search…
          <kbd className="ml-4 rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">⌘K</kbd>
        </button>
      )}

      {/* Expanded search overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
          <div className="absolute inset-0 bg-black/20" onClick={() => onOpenChange(false)} />
          <div className="relative w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-neutral-100 px-4 py-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search campaigns, audiences, creatives, reports…"
                className="flex-1 bg-transparent text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
              />
              <kbd className="rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">ESC</kbd>
            </div>
            {results.length > 0 && (
              <div className="max-h-64 overflow-y-auto p-2">
                {results.map((r, i) => (
                  <Link
                    key={i}
                    href={r.href}
                    onClick={() => { onOpenChange(false); onQueryChange(""); }}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-neutral-50"
                  >
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-neutral-500">{r.type}</span>
                    <span className="text-neutral-900">{r.label}</span>
                  </Link>
                ))}
              </div>
            )}
            {query.length > 0 && results.length === 0 && (
              <div className="p-6 text-center text-sm text-neutral-400">No results for "{query}"</div>
            )}
            {query.length === 0 && (
              <div className="p-4 text-center text-xs text-neutral-400">Start typing to search across campaigns, audiences, creatives, and reports</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── 4. Date Range Filter ─── */
function DateRangeFilter({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [preset, setPreset] = useState("last-30");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onOpenChange]);

  const presets = [
    { id: "today", label: "Today" },
    { id: "yesterday", label: "Yesterday" },
    { id: "last-7", label: "Last 7 days" },
    { id: "last-14", label: "Last 14 days" },
    { id: "last-30", label: "Last 30 days" },
    { id: "last-90", label: "Last 90 days" },
    { id: "this-month", label: "This month" },
    { id: "last-month", label: "Last month" },
    { id: "custom", label: "Custom range…" },
  ];
  const activeLabel = presets.find((p) => p.id === preset)?.label || "Last 30 days";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => onOpenChange(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-neutral-50"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {activeLabel}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg z-50">
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Date range</p>
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => { setPreset(p.id); if (p.id !== "custom") onOpenChange(false); }}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${preset === p.id ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-600 hover:bg-neutral-50"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── 5. Help & Resources ─── */
function HelpResources({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onOpenChange]);

  const resources = [
    { label: "Getting Started Guide", href: "/ads/onboarding", icon: "guide" },
    { label: "Account Setup", href: "/ads/setup", icon: "book" },
    { label: "API Documentation", href: "/ads/settings/api", icon: "code" },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => onOpenChange(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-50 hover:text-neutral-600"
        title="Help & Resources"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg z-50">
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Help & resources</p>
          {resources.map((r) => (
            <Link
              key={r.label}
              href={r.href}
              onClick={() => onOpenChange(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
            >
              {r.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── 6. Notification Drawer ─── */
function NotificationDrawer({ tab, onTabChange, onClose }: {
  tab: number; onTabChange: (i: number) => void; onClose: () => void;
}) {
  const [all, setAll] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/ads/notifications").then((r) => (r.ok ? r.json() : { notifications: [] }))
      .then((d) => setAll(d.notifications ?? [])).catch(() => {});
  }, []);
  const typeLabel = (t: string) => (t || "general").replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
  const types = [...new Set(all.map((n) => n.type ?? "general"))];
  const tabs = ["All", ...types.map(typeLabel)];
  const currentTab = tabs[tab] ?? "All";
  const items = all
    .filter((n) => currentTab === "All" || typeLabel(n.type ?? "general") === currentTab)
    .map((n) => ({
      title: n.title ?? n.body ?? n.message ?? "Notification",
      time: n.created_at ? new Date(n.created_at).toLocaleString("en-US") : "",
      read: !!n.read_at,
    }));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-96 shrink-0 border-l border-neutral-200 bg-white shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-neutral-200 px-5 shrink-0">
          <h3 className="text-sm font-semibold text-neutral-900">Notifications</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex overflow-x-auto border-b border-neutral-100 px-2 shrink-0">
          {tabs.map((t, i) => (
            <button
              key={t}
              onClick={() => onTabChange(i)}
              className={`whitespace-nowrap px-2.5 py-2 text-xs font-medium transition-colors ${i === tab ? "border-b-2 border-neutral-900 text-neutral-900" : "text-neutral-500 hover:text-neutral-700"}`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {items.length === 0 ? (
            <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-4 text-center text-sm text-neutral-500">
              No notifications{currentTab !== "All" ? ` of this type` : " yet"}
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className={`rounded-lg border p-3 text-sm transition-colors ${item.read ? "border-neutral-100 bg-white" : "border-neutral-200 bg-neutral-50"}`}>
                  <div className="flex items-start gap-2">
                    {!item.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                    <div>
                      <p className={`text-neutral-900 ${!item.read ? "font-medium" : ""}`}>{item.title}</p>
                      <p className="mt-1 text-xs text-neutral-400">{item.time}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
