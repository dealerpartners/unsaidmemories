"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMarketplaceStore } from "@/lib/marketplace-store";

/**
 * Marketplace topbar — copied verbatim from the mockup HTML (.topbar,
 * .mobile-menu, .searchbox, .top-actions, .icon-button, .count, .avatar).
 * Cart count is driven by the marketplace store. Search submits to
 * /marketplace?q=… which the landing page reads server-side.
 */
export function MarketplaceTopbar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  const cartCount = useMarketplaceStore((s) => s.cartCount);
  const saved = useMarketplaceStore((s) => s.saved);
  const setSidebarOpen = useMarketplaceStore((s) => s.setSidebarOpen);
  const sidebarOpen = useMarketplaceStore((s) => s.sidebarOpen);
  const showToast = useMarketplaceStore((s) => s.showToast);
  const syncCartCount = useMarketplaceStore((s) => s.syncCartCount);

  // Badge reflects the server cart from the first render.
  useEffect(() => {
    void syncCartCount();
  }, [syncCartCount]);

  function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/marketplace?q=${encodeURIComponent(q)}` : "/marketplace");
  }

  return (
    <header className="topbar">
      <button
        className="mobile-menu"
        aria-label="Open navigation"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        ☰
      </button>
      <label className="searchbox">
        <span>⌕</span>
        <input
          placeholder="Search products, collections, categories…"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearch(e as unknown as React.FormEvent);
          }}
        />
      </label>
      <div className="top-actions">
        <button
          className="icon-button"
          aria-label="Saved items"
          onClick={() =>
            showToast(
              saved.size
                ? `You have ${saved.size} saved item(s).`
                : "Use the heart on a product card to save items.",
            )
          }
        >
          ♡
        </button>
        <Link
          className="icon-button"
          aria-label={`Shopping bag, ${cartCount} items`}
          href="/cart"
        >
          ♧
          <span className="count">{cartCount}</span>
        </Link>
        <div className="avatar">u.</div>
      </div>
    </header>
  );
}
