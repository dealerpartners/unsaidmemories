"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// ============================================================================
// PortalChildrenNav — the tree-navigation rule for routed portal pages.
//
// Standing rule (seller's SellerSectionNav states it as law): a page
// that has routed tree children carries those children as in-page
// navigation on the page itself — the sidebar is not a substitute, and
// a child route reachable only by typing its URL is a defect. The
// seller portal implements this per-section; admin and customer pages
// had no equivalent, so whole subtrees (/admin/settings/*,
// /admin/telemed/*, …) were unreachable from their parent page
// (Track 4 design inventory, 2026-10-25).
//
// This component renders a quiet hairline tab row — the parent itself
// plus its children — whenever the current path is a mapped parent or
// one of its children, and nothing anywhere else.
// ============================================================================

interface ChildRoute {
  href: string;
  label: string;
}

const ROUTE_CHILDREN: Record<string, { label: string; children: ChildRoute[] }> = {
  "/admin/settings": {
    label: "Settings",
    children: [
      { href: "/admin/settings/backups", label: "Backups" },
      { href: "/admin/settings/email", label: "Email" },
      { href: "/admin/settings/locations", label: "Locations" },
      { href: "/admin/settings/mux", label: "Mux" },
      { href: "/admin/settings/printing", label: "Printing" },
      { href: "/admin/settings/shipping", label: "Shipping" },
      { href: "/admin/settings/twilio", label: "Twilio" },
      { href: "/admin/settings/users", label: "Users" },
      { href: "/admin/settings/video", label: "Video" },
    ],
  },
  "/admin/telemed": {
    label: "Telemed",
    children: [
      { href: "/admin/telemed/commercial", label: "Commercial" },
      { href: "/admin/telemed/demand", label: "Demand" },
      { href: "/admin/telemed/health", label: "Health" },
      { href: "/admin/telemed/insurance-partners", label: "Insurance Partners" },
      { href: "/admin/telemed/payouts", label: "Payouts" },
      { href: "/admin/telemed/regulatory", label: "Regulatory" },
    ],
  },
  "/admin/notifications": {
    label: "Notifications",
    children: [
      { href: "/admin/notifications/customers", label: "Customers" },
      { href: "/admin/notifications/seller", label: "Seller" },
      { href: "/admin/notifications/vets", label: "Vets" },
    ],
  },
  "/admin/social": {
    label: "Social",
    children: [{ href: "/admin/social/platform-keys", label: "Platform Keys" }],
  },
  "/admin/subscriptions": {
    label: "Subscriptions",
    children: [{ href: "/admin/subscriptions/offers", label: "Offers" }],
  },
  "/customer/appointments": {
    label: "Appointments",
    children: [{ href: "/customer/appointments/vet", label: "Vet" }],
  },
  "/customer/pets": {
    label: "Pets",
    children: [{ href: "/customer/pets/gallery", label: "Gallery" }],
  },
};

export function PortalChildrenNav() {
  const pathname = usePathname() || "";
  const parent = Object.keys(ROUTE_CHILDREN)
    .filter((p) => pathname === p || pathname.startsWith(`${p}/`))
    .sort((a, b) => b.length - a.length)[0];
  if (!parent) return null;
  const group = ROUTE_CHILDREN[parent];
  const links: ChildRoute[] = [
    { href: parent, label: group.label },
    ...group.children,
  ];
  return (
    <nav
      aria-label={`${group.label} sections`}
      className="flex flex-wrap items-center gap-1 border-b border-border bg-background px-5 py-2"
    >
      {links.map((l) => {
        const active =
          pathname === l.href ||
          (l.href !== parent && pathname.startsWith(`${l.href}/`));
        return (
          <Link
            key={l.href}
            href={l.href}
            className={cn(
              "rounded-lg px-2.5 py-1 text-[13px] transition-colors",
              active
                ? "font-medium text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
