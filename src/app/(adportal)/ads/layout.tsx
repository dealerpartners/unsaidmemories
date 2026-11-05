"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { TopBar } from "@/components/ads/top-bar";
import { ContextualRightRail } from "@/components/ads/right-rail";
import { RailConfigProvider } from "@/components/ads/rail-context";
import { SidebarProfile } from "@/components/ads/profile-dropdown";

/* ─── Collapsible sidebar navigation tree — matches spec exactly ─── */
const navTree = [
  {
    label: "Dashboard",
    icon: "home",
    children: [
      { label: "Dashboard", href: "/ads/dashboard", icon: "dashboard" },
      { label: "GMV Max", href: "/ads/gmv-max", icon: "chart" },
    ],
  },
  {
    label: "Ads Manager",
    icon: "campaigns",
    children: [
      { label: "Campaigns", href: "/ads/ads-manager/campaigns", icon: "campaigns" },
      { label: "Ad Groups", href: "/ads/ads-manager/ad-groups", icon: "layers" },
      { label: "Ads", href: "/ads/ads-manager/ads", icon: "ad" },
      { label: "Monitoring", href: "/ads/ads-manager/monitor", icon: "chart" },
      { label: "Optimization", href: "/ads/ads-manager/optimize", icon: "zap" },
      { label: "Create Campaign", href: "/ads/ads-manager/campaigns/create", icon: "plus-circle", primary: true },
      { label: "Campaign Wizard", href: "/ads/ads-manager/campaigns/create", icon: "sparkles" },
    ],
  },
  {
    label: "Management Tools",
    icon: "zap",
    children: [
      { label: "Placement & Inventory", href: "/ads/inventory", icon: "layout" },
      { label: "Catalog Manager", href: "/ads/catalog", icon: "catalog" },
      { label: "Events Manager", href: "/ads/events", icon: "calendar" },
      { label: "Automated Rules", href: "/ads/automated-rules", icon: "zap" },
      { label: "Comments Manager", href: "/ads/comments-manager", icon: "message-square" },
      { label: "MMM Data Request", href: "/ads/mmm-data-request", icon: "report" },
      { label: "Notification Center", href: "/ads/notifications", icon: "bell" },
    ],
  },
  {
    label: "Audiences",
    icon: "users",
    children: [
      { label: "Audience List", href: "/ads/audiences", icon: "users" },
      { label: "Create Audience", href: "/ads/audiences/create", icon: "plus-circle", primary: true },
      { label: "Demographic Targeting", href: "/ads/audiences/demographic", icon: "users" },
      { label: "Location Targeting", href: "/ads/audiences/location", icon: "target" },
      { label: "Music Behavior", href: "/ads/audiences/music-behavior", icon: "chart" },
      { label: "Artist Affinity", href: "/ads/audiences/artist-affinity", icon: "sparkles" },
    ],
  },
  {
    label: "Creatives",
    icon: "palette",
    children: [
      { label: "Create an Ad", href: "/ads/creatives/create", icon: "plus-circle", primary: true },
      { label: "Creative Library", href: "/ads/creatives/library", icon: "folder" },
      { label: "Audio Upload", href: "/ads/creatives/audio", icon: "play-circle" },
      { label: "Companion Images", href: "/ads/creatives/companion", icon: "layout" },
      { label: "Logo Management", href: "/ads/creatives/logo", icon: "folder" },
      { label: "CTA Selector", href: "/ads/creatives/cta", icon: "link" },
      { label: "Ad Preview", href: "/ads/creatives/preview", icon: "ad" },
      { label: "AI Creative Gen", href: "/ads/creatives/ai", icon: "sparkles" },
      { label: "Creator Partnerships", href: "/ads/creatives/partnerships", icon: "users" },
    ],
  },
  {
    label: "Analytics",
    icon: "chart",
    children: [
      { label: "Analytics Dashboard", href: "/ads/analytics", icon: "chart" },
      { label: "Audience Insights", href: "/ads/analytics/audience", icon: "insight" },
      { label: "Attribution", href: "/ads/analytics/attribution", icon: "path" },
      { label: "Experiments", href: "/ads/analytics/experiments", icon: "flask" },
      { label: "Cross-Media", href: "/ads/analytics/cross-media", icon: "layout" },
      { label: "Third-Party", href: "/ads/analytics/third-party", icon: "shield" },
      { label: "Metrics Glossary", href: "/ads/analytics/metrics-glossary", icon: "file-text" },
      { label: "Reports", href: "/ads/analytics/reports", icon: "report" },
    ],
  },
  {
    label: "Leads",
    icon: "user-check",
    children: [
      { label: "Leads Center", href: "/ads/leads", icon: "user-check" },
      { label: "Instant Forms", href: "/ads/leads/instant-forms", icon: "file-text" },
      { label: "Website Forms", href: "/ads/leads/website-forms", icon: "file-text" },
      { label: "Direct Messages", href: "/ads/leads/direct-messages", icon: "message" },
      { label: "Inbox", href: "/ads/leads/inbox", icon: "inbox" },
      { label: "Message Settings", href: "/ads/leads/messaging", icon: "settings" },
      { label: "CRM Integration", href: "/ads/leads/crm", icon: "link" },
    ],
  },
  {
    label: "Tools & Resources",
    icon: "puzzle",
    children: [
      { label: "Keyword Planner", href: "/ads/tools/keyword-planner", icon: "target" },
      { label: "Negative Keywords", href: "/ads/tools/negative-keywords", icon: "target" },
      { label: "Video Editor", href: "/ads/tools/video-editor", icon: "play-circle" },
      { label: "Integrations", href: "/ads/tools/integrations", icon: "puzzle" },
      { label: "MCP Server", href: "/ads/tools/mcp", icon: "code" },
      { label: "AI Skills", href: "/ads/ai/skills", icon: "sparkles" },
    ],
  },
  {
    label: "Agency",
    icon: "building",
    children: [
      { label: "Agency Dashboard", href: "/ads/agency", icon: "dashboard" },
      { label: "Client Management", href: "/ads/agency/clients", icon: "users" },
      { label: "Cross-Client Reporting", href: "/ads/agency/cross-client", icon: "chart" },
      { label: "Agency Billing", href: "/ads/agency/billing", icon: "credit-card" },
      { label: "Agency Team", href: "/ads/agency/team", icon: "users-cog" },
    ],
  },
];

/** Routes where the contextual Right Rail should be visible */
const RIGHT_RAIL_ROUTES = [
  "/ads/ads-manager/campaigns/create",
  "/ads/campaigns/create",
  "/ads/campaign/create",
];

export default function AdsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  /* Advertiser-privilege funnel (owner ruling, 2026-11-02): the Ad
   * Center runs on the customer account's advertiser privilege. A
   * signed-in customer WITHOUT the privilege who deep-links to any
   * ads page is sent to /ads, where activation lives — instead of a
   * maze of pages that recognize them but can't serve them. The
   * dashboard itself, onboarding, and the sign-in redirect are
   * exempt. Signed-out visitors are left to those pages' own states. */
  useEffect(() => {
    if (pathname === "/ads" || pathname.startsWith("/ads/onboarding") || pathname.startsWith("/ads/signin")) return;
    let live = true;
    fetch("/api/ads/account", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (live && data && !data.advertiser) router.replace("/ads");
      })
      .catch(() => null);
    return () => {
      live = false;
    };
  }, [pathname, router]);

  /* Auto-expand the section which contains the current route */
  const expandedByDefault = useMemo(() => {
    const idx = navTree.findIndex((s) =>
      s.children.some(
        (c) => pathname === c.href || (c.href !== "/ads" && pathname.startsWith(c.href))
      )
    );
    return idx >= 0 ? idx : 0;
  }, [pathname]);

  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set<number>([expandedByDefault])
  );

  function toggleSection(idx: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  /* Determine if Right Rail should be shown for this route — the create
     routes plus campaign EDIT pages (the rail's stated purpose covers
     editing; the route list previously named only the creates). */
  const showRightRail =
    RIGHT_RAIL_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(route + "/")
    ) || /^\/ads\/campaigns\/[^/]+\/edit\/?$/.test(pathname);

  /* Auth routes (signin + OAuth callback) render STANDALONE — no sidebar, no
     top bar, no right rail. They're full-screen 2-column layouts of their
     own (see src/components/auth/SignInForm.tsx) and would be visually broken
     if embedded inside the dashboard chrome. */
  const isAuthRoute =
    pathname === "/ads/signin" || pathname.startsWith("/ads/auth/");

  if (isAuthRoute) {
    return <div className="min-h-screen bg-white text-neutral-900">{children}</div>;
  }

  return (
    <div className="flex h-screen bg-white text-neutral-900">
      {/* ─── Left Sidebar ─── */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
        {/* Module identity — the reference carries the platform logo
            here; per the Musicosy standard the name is stripped and the
            module identity takes its place. No stock logo marks. */}
        <div className="flex h-14 items-center border-b border-neutral-200 px-5">
          <span className="text-[15px] font-semibold tracking-tight text-neutral-900">
            Ad Center
          </span>
        </div>

        {/* Global Create Campaign button */}
        <div className="px-4 pt-4 pb-2">
          <Link
            href="/ads/ads-manager/campaigns/create"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#f2eafe] px-4 py-2.5 text-sm font-medium text-[#6942c2] transition-colors hover:bg-[#e7dbfc]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create Campaign
          </Link>
        </div>

        {/* Collapsible nav tree */}
        <nav className="flex-1 overflow-y-auto px-3 py-1">
          {navTree.map((section, idx) => {
            const isExpanded = expanded.has(idx);
            const isActive = section.children.some(
              (c) => pathname === c.href || (c.href !== "/ads" && pathname.startsWith(c.href))
            );
            return (
              <div key={section.label} className="mb-0.5">
                <button
                  onClick={() => toggleSection(idx)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] font-medium transition-colors ${
                    isActive
                      ? "text-neutral-900"
                      : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  <SidebarIcon type={section.icon} size={16} />
                  <span className="flex-1 text-left">{section.label}</span>
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className={`text-neutral-400 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>

                <div className={`overflow-hidden transition-all duration-200 ${isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}>
                  <div className="ml-4 border-l border-neutral-200 py-0.5">
                    {section.children.map((child) => {
                      const childActive = pathname === child.href || (child.href !== "/ads" && pathname.startsWith(child.href));
                      return (
                        <Link
                          key={child.href + child.label}
                          href={child.href}
                          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-[6px] pl-3 text-[13px] transition-colors ${
                            childActive
                              ? "bg-neutral-100 font-medium text-neutral-900"
                              : child.primary
                                ? "font-medium text-neutral-900 hover:bg-neutral-50"
                                : "text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
                          }`}
                        >
                          <SidebarIcon type={child.icon} size={14} />
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        {/* Profile */}
        <SidebarProfile />
      </aside>

      {/* ─── Right area: Top Bar + Main + Right Rail ─── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* ─── Top Bar — all 8 sub-components ─── */}
        <TopBar />

        {/* ─── Main Content Area + Contextual Right Rail ─── */}
        <RailConfigProvider>
          <div className="flex flex-1 overflow-hidden">
            <main className="flex-1 overflow-y-auto bg-neutral-50/50 p-6">{children}</main>

            {/* ─── Contextual Right Rail — visible on campaign creation/editing pages ─── */}
            <ContextualRightRail visible={showRightRail} />
          </div>
        </RailConfigProvider>
      </div>
    </div>
  );
}

/* ─── Sidebar Icons ─── */
function SidebarIcon({ type, size = 16 }: { type: string; size?: number }) {
  const p: React.SVGProps<SVGSVGElement> = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  switch (type) {
    case "home":
      return <svg {...p}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>;
    case "dashboard":
      return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
    case "campaigns":
      return <svg {...p}><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>;
    case "layers":
      return <svg {...p}><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /></svg>;
    case "ad":
      return <svg {...p}><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></svg>;
    case "draft":
      return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
    case "plus-circle":
      return <svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>;
    case "folder":
      return <svg {...p}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>;
    case "palette":
      return <svg {...p}><circle cx="13.5" cy="6.5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="12" r="2.5" /><circle cx="8.5" cy="18.5" r="2.5" /><circle cx="15.5" cy="18.5" r="2.5" /></svg>;
    case "users":
      return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case "catalog":
      return <svg {...p}><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>;
    case "layout":
      return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="9" x2="9" y2="21" /></svg>;
    case "chart":
      return <svg {...p}><path d="M3 3v18h18" /><path d="M7 16l4-4 4 4 5-5" /></svg>;
    case "report":
      return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
    case "path":
      return <svg {...p}><circle cx="5" cy="6" r="3" /><circle cx="19" cy="18" r="3" /><path d="M15 9l-3-3 3-3" /><path d="M9 15l3 3-3 3" /><path d="M8 9h8" /><path d="M16 15H8" /></svg>;
    case "flask":
      return <svg {...p}><path d="M9 3h6" /><path d="M10 9V3h4v6l5 8.5a2 2 0 0 1-1.73 3H6.73a2 2 0 0 1-1.73-3L10 9z" /></svg>;
    case "insight":
      return <svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>;
    case "play-circle":
      return <svg {...p}><circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" /></svg>;
    case "user-check":
      return <svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><polyline points="17 11 19 13 23 9" /></svg>;
    case "file-text":
      return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
    case "message":
      return <svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case "inbox":
      return <svg {...p}><polyline points="22 12 18 12 15 15 9 15 6 12 2 12" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>;
    case "link":
      return <svg {...p}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>;
    case "calendar":
      return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
    case "zap":
      return <svg {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>;
    case "message-square":
      return <svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case "shield":
      return <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
    case "puzzle":
      return <svg {...p}><path d="M16 3h5v5M4 21h5v-5M21 8l-9 9M8 4l-4 4" /></svg>;
    case "sparkles":
      return <svg {...p}><path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z" /></svg>;
    case "credit-card":
      return <svg {...p}><rect x="1" y="4" width="22" height="16" rx="2" /><path d="M1 10h22" /></svg>;
    case "wallet":
      return <svg {...p}><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" /><path d="M4 6v12a2 2 0 0 0 2 2h14v-4" /><path d="M18 12a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" /></svg>;
    case "receipt":
      return <svg {...p}><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2z" /></svg>;
    case "arrow-left-right":
      return <svg {...p}><path d="M17 1l4 4-4 4" /><path d="M3 5h18" /><path d="M7 23l-4-4 4-4" /><path d="M21 19H3" /></svg>;
    case "percent":
      return <svg {...p}><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></svg>;
    case "gift":
      return <svg {...p}><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>;
    case "bell":
      return <svg {...p}><path d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
    case "building":
      return <svg {...p}><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4" /><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" /></svg>;
    case "users-cog":
      return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case "check-circle":
      return <svg {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>;
    case "lock":
      return <svg {...p}><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
    case "target":
      return <svg {...p}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>;
    case "code":
      return <svg {...p}><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>;
    case "settings":
      return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    case "help":
      return <svg {...p}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
    default:
      return <svg {...p}><circle cx="12" cy="12" r="1" /></svg>;
  }
}
