"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SubNav({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="ts-subnav">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={path === i.href || (i.href !== items[0].href && path.startsWith(i.href)) ? "on" : ""}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export const SUPPORT_NAV = [
  { href: "/admin/support", label: "Ticket Queue" },
  { href: "/admin/support/reporting", label: "Reporting" },
  { href: "/admin/support/ops", label: "Operations" },
  { href: "/admin/support/config", label: "Configuration" },
  { href: "/admin/support/notifications", label: "My Notifications" },
  { href: "/admin/trust", label: "Trust & Safety →" },
];

export const TRUST_NAV = [
  { href: "/admin/trust", label: "Overview" },
  { href: "/admin/trust/verification", label: "Verification" },
  { href: "/admin/trust/risk", label: "Customer & Listing Risk" },
  { href: "/admin/trust/disputes", label: "Disputes & Chargebacks" },
  { href: "/admin/trust/fraud", label: "Fraud Review" },
  { href: "/admin/trust/moderation", label: "Moderation" },
  { href: "/admin/trust/appeals", label: "Appeals" },
  { href: "/admin/trust/policies", label: "Policies" },
  { href: "/admin/trust/compliance", label: "Compliance / DMCA" },
  { href: "/admin/trust/audit", label: "Audit Log" },
  { href: "/admin/support", label: "← Support Desk" },
];
