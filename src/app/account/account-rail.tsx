"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// The account rail from Sunny's mockup: Overview / Orders / Saved /
// My posts / Notifications — divider — Preferences / Help and care,
// each with its live count on the right.
const NAV: { href: string; label: string; key?: string }[] = [
  { href: "/account", label: "Overview" },
  { href: "/account/orders", label: "Orders", key: "orders" },
  { href: "/account/saved", label: "Saved", key: "saved" },
  { href: "/account/posts", label: "Reviews & questions", key: "posts" },
  { href: "/account/notifications", label: "Notifications", key: "notifications" },
  { href: "/account/addresses", label: "Addresses" },
  { href: "/account/payment", label: "Payment" },
  { href: "|", label: "" },
  { href: "/account/preferences", label: "Preferences" },
  { href: "/account/help", label: "Help and care" },
];

export function AccountRail() {
  const pathname = usePathname();
  const [counts, setCounts] = useState<Record<string, number>>({});
  // The Ad Center entry recognizes whether this account has walked
  // the advertiser path before: an existing advertiser goes straight
  // in; a new one goes to get-started. Defaults to get-started until
  // the check answers.
  const [adsHref, setAdsHref] = useState("/advertise/get-started");

  useEffect(() => {
    let live = true;
    (async () => {
      const next: Record<string, number> = {};
      try {
        const [o, w, p, n, a] = await Promise.all([
          fetch("/api/customers/me/orders", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
          fetch("/api/customers/me/wishlist", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
          fetch("/api/customers/me/posts", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
          fetch("/api/customers/me/notifications", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
          fetch("/api/customers/me/advertiser", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)),
        ]);
        if (o) next.orders = Number(o.total) || 0;
        if (w) next.saved = Number(w.total) || 0;
        if (p) next.posts = Number(p.total) || 0;
        if (n) next.notifications = Number(n.unread) || 0;
        if (live && a?.active) setAdsHref("/ads");
      } catch {
        // Counts are decoration on the rail — a failed count leaves the
        // number off rather than blocking navigation.
      }
      if (live) setCounts(next);
    })();
    return () => {
      live = false;
    };
  }, [pathname]);

  return (
    <nav className="ua-rail" aria-label="Account">
      {NAV.map((item, i) => {
        if (item.href === "|") return <hr key={`hr-${i}`} />;
        const current =
          item.href === "/account"
            ? pathname === "/account"
            : pathname.startsWith(item.href);
        const count = item.key ? counts[item.key] : undefined;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
          >
            {item.label}
            <small>{count ? count : ""}</small>
          </Link>
        );
      })}
      <Link
        href={adsHref}
        aria-current={pathname.startsWith("/ads") || pathname.startsWith("/advertise") ? "page" : undefined}
      >
        Ad Center
        <small></small>
      </Link>
    </nav>
  );
}
