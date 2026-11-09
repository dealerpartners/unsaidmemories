"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowRight, ArrowUpRight, Check, ChevronDown, Menu, Plus,
  Search, ShoppingBag, Store, Truck, User, X, Instagram, Youtube, Mail, Facebook, Linkedin,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { menus } from "@/lib/catalog";
import { FooterColumn, type FooterLink } from "@/components/footer-column";
import { AssistantPanel } from "@/components/assistant-panel";
import { AccountFlyout } from "@/components/account-flyout";
import { CookieConsent } from "@/components/consent/cookie-consent";
import { OPEN_PREFERENCES_EVENT } from "@/lib/consent";

// SiteShell wraps every page with the storefront chrome:
// - site header + desktop mega menu + backdrop (X closes, backdrop closes, hover does NOT auto-close)
// - quick-add modal (from the shared store)
// - search overlay (from the shared store)
// - mobile drawer (from the shared store)
// - footer
//
// `{children}` is rendered between the header and the footer.
// The mega-menu `activeMenu` state is local (not in the store) because it
// only affects the shell itself. The mega menu closes when a link inside it
// is clicked (the links call `setActiveMenu(null)`) — no route-change effect
// needed.
export function SiteShell({ children }: { children: React.ReactNode }) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const pathname = usePathname();
  // Website Settings for the chrome: the footer's Privacy/Terms
  // destinations and the cookie notice copy, from Website → Settings.
  // Nulls (or a failed fetch) leave the built-in defaults below in
  // place — the same fallback contract as the banner above.
  const [siteSettings, setSiteSettings] = useState<{
    cookieConsentText: string | null;
    privacyPolicyUrl: string | null;
    termsUrl: string | null;
  } | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/public/site-settings")
      .then((r) => r.json())
      .then((d) => {
        if (live && d) {
          setSiteSettings({
            cookieConsentText: d.cookieConsentText ?? null,
            privacyPolicyUrl: d.privacyPolicyUrl ?? null,
            termsUrl: d.termsUrl ?? null,
          });
        }
      })
      .catch(() => null);
    return () => {
      live = false;
    };
  }, []);

  const cartCount = useStore((s) => s.cartCount);
  const quickProduct = useStore((s) => s.quickProduct);
  const size = useStore((s) => s.size);
  const quantity = useStore((s) => s.quantity);
  const cartError = useStore((s) => s.cartError);
  const added = useStore((s) => s.added);
  const searchOpen = useStore((s) => s.searchOpen);
  const mobileMenu = useStore((s) => s.mobileMenu);
  const assistantOpen = useStore((s) => s.assistantOpen);
  const accountOpen = useStore((s) => s.accountOpen);

  const closeQuickAdd = useStore((s) => s.closeQuickAdd);
  const setSize = useStore((s) => s.setSize);
  const setQuantity = useStore((s) => s.setQuantity);
  const addToBag = useStore((s) => s.addToBag);
  const syncCartCount = useStore((s) => s.syncCartCount);

  // The bag badge reflects the server cart from the first render —
  // without this it reset to 0 on every navigation while /cart held
  // the real items.
  useEffect(() => {
    void syncCartCount();
  }, [syncCartCount]);
  const setSearchOpen = useStore((s) => s.setSearchOpen);
  const setMobileMenu = useStore((s) => s.setMobileMenu);
  const setAssistantOpen = useStore((s) => s.setAssistantOpen);
  const setAccountOpen = useStore((s) => s.setAccountOpen);

  // Lock body scroll when any overlay is open. This is the only effect the
  // shell needs — it syncs an external system (document.body) with React
  // state, which is exactly what effects are for.
  useEffect(() => {
    document.body.style.overflow =
      quickProduct || mobileMenu || searchOpen || assistantOpen || accountOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [quickProduct, mobileMenu, searchOpen, assistantOpen, accountOpen]);

  // ── Live search (Algolia-backed via /api/search) ───────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{
    id: string; name: string; brand: string | null; image: string | null; sku: string | null; slug: string;
  }[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Clear the query whenever the overlay closes.
  useEffect(() => {
    if (!searchOpen) { setSearchQuery(""); setSearchResults([]); setSearchLoading(false); }
  }, [searchOpen]);

  // Debounced search — hits /api/search which tries Algolia then Supabase.
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data) => { setSearchResults(data.hits || []); setSearchLoading(false); })
        .catch(() => { setSearchResults([]); setSearchLoading(false); });
    }, 220);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Footer link maps — the owner's structure, from his HTML (the
  // five-column footer his stylesheet was built for: .footer-top is
  // 1.35fr + repeat(5, 1fr)): Explore / Our world / Help & care /
  // Inspirations / Collections, every link a real route (crawl-verified).
  const exploreLinks: FooterLink[] = [
    { label: "Shop all products", href: "/shop" },
    { label: "Best sellers", href: "/shop" },
    { label: "New arrivals", href: "/shop" },
    { label: "Bundles & gifts", href: "/shop" },
    { label: "UnSaid signature line", href: "/collections/kin-score" },
  ];
  const ourWorldLinks: FooterLink[] = [
    { label: "How it works", href: "/how-it-works" },
    { label: "Gift finder", href: "/gift-finder" },
    { label: "Guides & stories", href: "/guides-stories" },
    { label: "Shoppy", href: "/kinnectai" },
    { label: "Our story", href: "/our-story" },
    { label: "Advertise with us", href: "/advertise" },
  ];
  const helpLinks: FooterLink[] = [
    { label: "Help Center", href: "/help" },
    { label: "Legal", href: "/help#policies" },
    { label: "Contact us", href: "/contact" },
    { label: "Shipping & returns", href: "/shipping-returns" },
    { label: "Track your order", href: "/track-order" },
    { label: "Size guide", href: "/size-guide" },
  ];
  const inspirationsLinks: FooterLink[] = [
    { label: "Funeral homes", href: "/funeral-homes" },
    { label: "Senior living", href: "/senior-living" },
    { label: "Schools & hospitals", href: "/schools-hospitals" },
    { label: "Wedding planners", href: "/wedding-planners" },
    { label: "Corporate gifting", href: "/corporate-gifting" },
  ];
  const collectionsLinks: FooterLink[] = [
    { label: "Kin Keeper Month", href: "/collections/kin-keeper-month" },
    { label: "Family by Choice", href: "/collections/family-by-choice" },
    { label: "Just Because", href: "/collections/just-because" },
    { label: "Day Ones", href: "/collections/day-ones" },
  ];

  // Admin routes and the marketplace are standalone workspaces — no storefront
  // chrome. The marketplace has its own sidebar + topbar (see marketplace.css)
  // copied verbatim from the user's HTML mockup. The auth pages (login,
  // signup, and the /advertise/get-started onboarding) likewise render bare,
  // in the AuthShell pattern. /advertise itself is now a public landing page
  // and gets the full storefront chrome.
  // (pathname is declared above, with the other hooks.)
  if (
    pathname.startsWith("/ads") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/advertise/get-started") ||
    pathname.startsWith("/auth/")
  ) {
    return <>{children}</>;
  }

  return (
    <>
      <header className="site-header">
        <button className="icon-btn mobile-menu-trigger" aria-label="Open menu" onClick={() => setMobileMenu(true)}>
          <Menu size={22} />
        </button>
        <Link className="wordmark" href="/" aria-label="UnSaid home">un<span>said</span><i>®</i></Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          {Object.keys(menus).map((item) => (
            <button
              key={item}
              className={`nav-link ${activeMenu === item ? "is-active" : ""}`}
              onMouseEnter={() => setActiveMenu(item)}
              onClick={() => setActiveMenu(activeMenu === item ? null : item)}
            >
              {item}<ChevronDown size={13} />
            </button>
          ))}
          <Link className="nav-link simple-link" href="/signature">UnSaid signature</Link>
        </nav>
        <div className="header-actions">
          <button
            className="icon-btn shoppy-btn"
            aria-label="Ask Shoppy"
            title="Shoppy — your shopping assistant"
            onClick={() => setAssistantOpen(true)}
            style={{ padding: 2 }}
          >
            <img src="/favicon-512x512.png" alt="" width={30} height={30} style={{ borderRadius: 8, display: "block" }} />
          </button>
          <button className="icon-btn" aria-label="Search" onClick={() => setSearchOpen(true)}>
            <Search size={20} />
          </button>
          <button
            className="icon-btn"
            aria-label="Account"
            aria-haspopup="dialog"
            onClick={() => setAccountOpen(true)}
          >
            <User size={20} />
          </button>
          <Link
            className="bag-btn"
            href="/cart"
            aria-label={`Shopping bag, ${cartCount} items`}
          >
            <ShoppingBag size={19} /><span>Bag</span><b>{cartCount}</b>
          </Link>
        </div>
      </header>

      {/* MOBILE BOTTOM BAR — owner order 2026-11-02, the AAPawZ global
          header's .mobilebar pattern: on mobile the primary navigation
          lives at the bottom. Menu / Shop / Search / Bag / Account, wired
          to the same store state as the header controls above. Rendered
          only ≤820px (.mobilebar in globals.css). */}
      <nav className="mobilebar" aria-label="Quick navigation">
        <button type="button" aria-label="Open menu" onClick={() => setMobileMenu(true)}>
          <Menu size={20} /><span>Menu</span>
        </button>
        <Link href="/shop" aria-label="Shop" className={pathname.startsWith("/shop") ? "mb-active" : undefined}>
          <Store size={20} /><span>Shop</span>
        </Link>
        <button type="button" aria-label="Search" onClick={() => setSearchOpen(true)}>
          <Search size={20} /><span>Search</span>
        </button>
        <Link href="/cart" aria-label={`Shopping bag, ${cartCount} items`} className={pathname === "/cart" ? "mb-active" : undefined}>
          <ShoppingBag size={20} /><span>Bag</span>
          {cartCount > 0 && <b className="mb-badge">{cartCount}</b>}
        </Link>
        <button type="button" aria-label="Account" onClick={() => setAccountOpen(true)}>
          <User size={20} /><span>Account</span>
        </button>
      </nav>

      {activeMenu && (
        <div className="mega-backdrop" onClick={() => setActiveMenu(null)}>
          <section
            className="mega-menu"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => setActiveMenu(activeMenu)}
          >
            <button className="mega-close" aria-label="Close menu" onClick={() => setActiveMenu(null)}>
              <X size={18} />
            </button>
            <div className="mega-intro">
              <span className="eyebrow">{menus[activeMenu].eyebrow}</span>
              <h2>{menus[activeMenu].feature}</h2>
              <Link href={menus[activeMenu].cta.href} className="text-link" onClick={() => setActiveMenu(null)}>
                {menus[activeMenu].cta.label} <ArrowUpRight size={15} />
              </Link>
              <div className="mega-art">
                <span>Made to<br />mean more.</span>
                <div className="art-orb" />
              </div>
            </div>
            {/* Every mega menu renders its groups from the menu config
                (src/lib/catalog.ts). Shop = the 13 departments in 4
                groups, no subcategories. */}
            <div className="mega-groups">
              {menus[activeMenu].groups.map((group) => (
                <div className="mega-group" key={group.title}>
                  <h3>{group.title}</h3>
                  {group.links.map((link) => (
                    <Link
                      href={link.href}
                      key={link.label}
                      onClick={() => setActiveMenu(null)}
                    >
                      {link.label} <ArrowUpRight size={12} />
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {children}

      <footer className="footer">
        <div className="footer-top">
          <div className="footer-brand">
            <Link className="footer-logo-link" href="/" aria-label="UnSaid home">
              <img src="/unsaid-footer-logo.png" alt="UnSaid Memories" height={132} width={132} style={{ display: "block", height: 132, width: 132 }} />
            </Link>
            <p>For all the things<br />you never quite say.</p>
            <div className="social-links">
              <a href="https://www.facebook.com/profile.php?id=61572950462880" target="_blank" rel="noopener noreferrer" aria-label="Facebook"><Facebook size={17} /></a>
              <a href="https://www.instagram.com/theunsaidmemories_marketplace/" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><Instagram size={17} /></a>
              <a href="https://www.tiktok.com/@unsaid_memories_marketpl" target="_blank" rel="noopener noreferrer" aria-label="TikTok">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.6 3c.4 2.2 1.8 3.6 4.1 3.8v3c-1.6 0-3-.5-4.1-1.3v6.2c0 3.5-2.6 5.8-5.9 5.8A5.7 5.7 0 0 1 5 14.7c0-3.2 2.6-5.7 5.9-5.7l1 .1v3.1a2.7 2.7 0 0 0-1-.2 2.6 2.6 0 0 0-2.6 2.7c0 1.5 1.1 2.6 2.5 2.6 1.5 0 2.7-1.1 2.7-2.9V3h3.1Z" /></svg>
              </a>
              <a href="https://www.youtube.com/results?search_query=unsaidmemories" target="_blank" rel="noopener noreferrer" aria-label="YouTube"><Youtube size={17} /></a>
              <a href="https://www.linkedin.com/showcase/107217266/admin/dashboard/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"><Linkedin size={17} /></a>
              <a href="mailto:support@unsaidmemories.com" aria-label="Email support"><Mail size={17} /></a>
            </div>
          </div>
          <FooterColumn title="Explore" links={exploreLinks} />
          <FooterColumn title="Our world" links={ourWorldLinks} />
          <FooterColumn title="Help & care" links={helpLinks} />
          <FooterColumn title="Inspirations" links={inspirationsLinks} />
          <FooterColumn title="Collections" links={collectionsLinks} />
        </div>
        <div className="footer-bottom">
          <span>© Unsaid Memories. Part of the KinnectAI family of products.</span>
          <div>
            <Link href={siteSettings?.privacyPolicyUrl ?? "/legal/privacy-policy"}>Privacy</Link>
            <Link href={siteSettings?.termsUrl ?? "/legal/terms-of-service"}>Terms</Link>
            <Link href="/help/accessibility">Accessibility</Link>
            <Link href="/sitemap">Site directory</Link>
            <Link href="/sitemap.xml">XML map</Link>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent(OPEN_PREFERENCES_EVENT))}
              style={{ background: "none", border: 0, cursor: "pointer", padding: 0, font: "inherit", color: "inherit" }}
            >
              Cookie preferences
            </button>
          </div>
          <span className="footer-location">Designed for connection <span>✳</span></span>
        </div>
      </footer>

      {/* Quick-add modal — driven by the shared store. */}
      {quickProduct && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeQuickAdd(); }}
        >
          <section
            className="quick-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Quick add ${quickProduct.name}`}
          >
            <button className="modal-close icon-btn" onClick={closeQuickAdd} aria-label="Close">
              <X size={21} />
            </button>
            <div className="modal-image">
              <img src={quickProduct.image} alt={quickProduct.name} />
              <span className="modal-image-label">THE UNSAID EDIT</span>
            </div>
            <div className="modal-info">
              <span className="eyebrow">{quickProduct.category}</span>
              <h2>{quickProduct.name}</h2>
              <div className="modal-price">${quickProduct.price.toFixed(2)}</div>
              <p>{quickProduct.description}</p>
              <div className="option-label">
                <span>Color</span><b>{quickProduct.color}</b>
              </div>
              <div className="color-dot-row">
                <span className="color-dot selected" />
                <span className="color-dot color-dot-alt" />
                <span className="color-dot color-dot-blue" />
              </div>
              {quickProduct.sizes.length > 0 && (
              <>
              <div className="option-label size-label">
                <span>Choose size</span>
                <Link href="/size-guide">Size guide</Link>
              </div>
              <div className="size-options">
                {quickProduct.sizes.map((s) => (
                  <button
                    key={s}
                    className={size === s ? "size-option selected" : "size-option"}
                    onClick={() => setSize(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              </>
              )}
              <div className="modal-qty">
                <span>Quantity</span>
                <div className="modal-qty-stepper">
                  <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity(quantity - 1)}>−</button>
                  <span aria-live="polite">{quantity}</span>
                  <button type="button" aria-label="Increase quantity" onClick={() => setQuantity(quantity + 1)}>+</button>
                </div>
              </div>
              {cartError && (
                <p className="modal-error" role="alert">{cartError}</p>
              )}
              {added ? (
                <div className="added-confirm">
                  <Check size={17} /> Added to your bag
                  <button onClick={closeQuickAdd}>Continue shopping</button>
                </div>
              ) : (
                <button
                  className="button button-dark modal-add"
                  onClick={addToBag}
                  disabled={quickProduct.sizes.length > 0 && !size}
                >
                  Add to bag — ${(quickProduct.price * quantity).toFixed(2)} <ArrowRight size={16} />
                </button>
              )}
              <div className="modal-footnote">
                <Truck size={15} /> Secure checkout with Stripe
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Search overlay — Algolia-backed live search, driven by the shared store. */}
      {searchOpen && (
        <div className="search-overlay">
          <button
            className="search-close icon-btn"
            aria-label="Close search"
            onClick={() => setSearchOpen(false)}
          >
            <X size={22} />
          </button>
          <span className="eyebrow">What are you looking for?</span>
          <form onSubmit={(e) => { e.preventDefault(); }}>
            <Search size={24} />
            <input
              autoFocus
              placeholder="Search products, brands, SKUs…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchLoading && <span className="search-loading">…</span>}
          </form>
          {searchQuery.trim().length >= 2 ? (
            <div className="search-results">
              <span className="search-results-count">
                {searchLoading ? "Searching…" : `${searchResults.length} result${searchResults.length === 1 ? "" : "s"}`}
              </span>
              {searchResults.length === 0 && !searchLoading ? (
                <p className="search-empty">No products match “{searchQuery}”.</p>
              ) : (
                searchResults.map((h) => (
                  <Link
                    key={h.id}
                    href={`/product/${h.slug}`}
                    className="search-result"
                    onClick={() => setSearchOpen(false)}
                  >
                    {h.image ? (
                      <img src={h.image} alt="" loading="lazy" />
                    ) : (
                      <div className="search-result-noimg" aria-hidden="true" />
                    )}
                    <span className="search-result-info">
                      <span className="search-result-name">{h.name}</span>
                      <span className="search-result-brand">{h.brand || "UnSaid"}{h.sku ? ` · ${h.sku}` : ""}</span>
                    </span>
                    <ArrowUpRight size={15} />
                  </Link>
                ))
              )}
            </div>
          ) : (
            <div className="search-suggestions">
              <span>POPULAR RIGHT NOW</span>
              <Link href="/relationships/kin-keeper" onClick={() => setSearchOpen(false)}>Kin Keeper</Link>
              <Link href="/shop" onClick={() => setSearchOpen(false)}>New arrivals</Link>
              <Link href="/shop" onClick={() => setSearchOpen(false)}>Gifts under $50</Link>
            </div>
          )}
        </div>
      )}

      {/* Mobile drawer — driven by the shared store. */}
      {mobileMenu && (
        <div className="mobile-drawer-backdrop" onClick={() => setMobileMenu(false)}>
          <aside className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <Link className="wordmark" href="/" onClick={() => setMobileMenu(false)}>un<span>said</span><i>®</i></Link>
              <button className="icon-btn" onClick={() => setMobileMenu(false)} aria-label="Close menu">
                <X size={22} />
              </button>
            </div>
            {/* Shop departments — the same 13 departments in 4 groups
                as the desktop mega menu (menus.Shop.groups); no
                subcategories, consistent by construction. */}
            {menus.Shop.groups.map((group) => (
              <details key={group.title} className="mobile-menu-group">
                <summary>{group.title}<Plus size={16} /></summary>
                {group.links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenu(false)}
                  >
                    {link.label}
                  </Link>
                ))}
              </details>
            ))}
            {Object.entries(menus)
              .filter(([key]) => key !== "Shop")
              .map(([key, menu]) => (
                <details key={key} className="mobile-menu-group">
                  <summary>{key}<Plus size={16} /></summary>
                  {menu.groups.flatMap((g) => g.links).map((link) => (
                    <Link
                      key={link.label}
                      href={link.href}
                      onClick={() => setMobileMenu(false)}
                    >
                      {link.label}
                    </Link>
                  ))}
                </details>
              ))}
            <Link
              href="/shop"
              className="button button-dark drawer-cta"
              onClick={() => setMobileMenu(false)}
            >
              Shop all products <ArrowRight size={16} />
            </Link>
          </aside>
        </div>
      )}

      {/* Shopping assistant + account flyout + cookie consent. */}
      <AssistantPanel />
      <AccountFlyout />
      <CookieConsent />
    </>
  );
}
