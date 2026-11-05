"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import { sellerActionsForSurface } from "@/config/sellerQuickActions";

// Per-surface quick actions for the seller shell (Sunny's model: quick
// actions sit INSIDE each surface — the actions below belong to the
// section being viewed, from the canonical A–O families). On the
// dashboard the bar carries every family as the seller-global index.
// Section aliases follow the tree's own tags: Promotions actions live in
// the Pricing family (D.8/D.9 → tree 4.6), Reports in Analytics (I → 9).
const SECTION_ALIASES: Record<string, string> = {
  promotions: "pricing",
  reports: "analytics",
};
export function SellerQuickActionsBar({ section }: { section: string }) {
  const actions = sellerActionsForSurface(SECTION_ALIASES[section] || section);
  if (section === "dashboard") {
    return (
      <div className="border-b border-border bg-card px-5 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            <Zap className="size-3.5" /> Quick Actions
          </span>
          {FAMILY_INDEX.map((f) => (
            <Link
              key={f.family}
              href={f.href}
              className="rounded-full border border-border px-2.5 py-1 text-[11.5px] font-semibold text-foreground/80 transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              {f.family} · {f.label}
            </Link>
          ))}
        </div>
      </div>
    );
  }
  if (!actions.length) return null;
  return (
    <div className="border-b border-border bg-card px-5 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
          <Zap className="size-3.5" /> Quick Actions
        </span>
        {actions.map((a) => (
          <Link
            key={a.code}
            href={a.href}
            className="rounded-full border border-border px-2.5 py-1 text-[11.5px] font-semibold text-foreground/80 transition-colors hover:border-foreground/40 hover:text-foreground"
          >
            {a.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

const FAMILY_INDEX: { family: string; label: string; href: string }[] = [
  { family: "A", label: "Onboarding", href: "/seller/onboarding/wizard" },
  { family: "B", label: "Catalog", href: "/seller/catalog/listings" },
  { family: "C", label: "Inventory", href: "/seller/inventory/overview" },
  { family: "D", label: "Pricing", href: "/seller/pricing/overview" },
  { family: "E", label: "Orders", href: "/seller/orders/inbox" },
  { family: "F", label: "Returns", href: "/seller/returns/overview" },
  { family: "G", label: "Shipping", href: "/seller/shipping/templates" },
  { family: "H", label: "Payments", href: "/seller/payments/overview" },
  { family: "I", label: "Analytics", href: "/seller/analytics/sales" },
  { family: "J", label: "Communication", href: "/seller/messages/inbox" },
  { family: "K", label: "Performance", href: "/seller/performance/overview" },
  { family: "L", label: "Account", href: "/seller/settings/profile" },
  { family: "M", label: "Governance", href: "/seller/governance/violations" },
  { family: "N", label: "Advertising", href: "/seller/advertising/business" },
  { family: "O", label: "API & Integrations", href: "/seller/settings/api-access" },
];
