"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import { taxonomy, products, iconFor, getProductsInCategory, categoryIcons } from "@/lib/marketplace-static";

const PER_PAGE = 8;

export default function MarketplaceApp({ slugs }: { slugs: string[] }) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<number[]>([]);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [quickAdd, setQuickAdd] = useState<number | null>(null);
  const [qty, setQty] = useState(1);

  // Determine category from slugs
  const currentSlug = slugs[slugs.length - 1] || "";
  const currentCategory = useMemo(() => {
    if (!slugs.length) return "All Products";
    // Walk the taxonomy to find the category by slug path
    let nodes = taxonomy;
    let found: any = null;
    for (const slug of slugs) {
      found = nodes.find((n: any) => n.slug === slug);
      if (!found) return "All Products";
      nodes = found.children || [];
    }
    return found?.name || "All Products";
  }, [slugs]);

  // Filter products
  const filtered = useMemo(() => {
    let list = getProductsInCategory(currentCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q) ||
        p.desc.toLowerCase().includes(q)
      );
    }
    return list;
  }, [currentCategory, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentProducts = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Reset page when category changes
  useEffect(() => { setPage(1); }, [currentCategory]);

  // Navigate to a category
  const navigate = useCallback((name: string) => {
    // Find the slug path for this category
    function findPath(nodes: any[], target: string, path: string[] = []): string[] | null {
      for (const n of nodes) {
        if (n.name === target) return [...path, n.slug];
        if (n.children) {
          const f = findPath(n.children, target, [...path, n.slug]);
          if (f) return f;
        }
      }
      return null;
    }
    if (name === "All Products") {
      router.push("/marketplace");
    } else {
      const path = findPath(taxonomy, name);
      if (path) router.push(`/marketplace/${path.join("/")}`);
    }
  }, [router]);

  const breadcrumb = ["MARKETPLACE", ...slugs.map((s, i) => {
    const nodes: any[] = (() => { let n = taxonomy; for (let j = 0; j <= i; j++) { const f = n.find(x => x.slug === slugs[j]); if (!f) return []; n = f.children || []; } return n; })();
    return slugs[i].toUpperCase();
  })];

  return (
    <div className="shell">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <Link href="/marketplace" className="wordmark">UnSaid Memories</Link>
        <div className="brand-note">THE THINGS WE FEEL. THE THINGS WE KEEP.</div>
        <nav className="nav primary-nav" aria-label="Marketplace navigation">
          <button className={currentCategory === "All Products" ? "active" : ""} onClick={() => navigate("All Products")}>
            <span className="nav-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg></span>
            <span>Marketplace home</span><span className="nav-count">↗</span>
          </button>
        </nav>

        <div className="workspace-label">SHOP DEPARTMENTS</div>
        <nav className="nav taxonomy-nav" aria-label="Shop departments">
          {taxonomy.filter((n: any) => !["All products","Brands","Collections"].includes(n.name)).map((node: any, i: number) => (
            <TreeNode key={i} node={node} currentCategory={currentCategory} onNavigate={navigate} />
          ))}
        </nav>

        <div className="workspace-label">SHOP BY EDIT</div>
        <nav className="nav">
          {["Best sellers", "New arrivals", "Gift Sets", "Personalized"].map(name => (
            <button key={name} onClick={() => navigate(name)} className={currentCategory === name ? "active" : ""}>
              <span className="nav-ico"><svg viewBox="0 0 24 24"><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z"/></svg></span>
              <span>{name === "Gift Sets" ? "Bundles & gifts" : name}</span>
            </button>
          ))}
        </nav>

        <div className="workspace-label">RELATIONSHIPS &amp; COLLECTIONS</div>
        <nav className="nav">
          {(() => {
            const collections = taxonomy.find((n: any) => n.name === "Collections");
            const relationships = taxonomy.find((n: any) => n.name === "Relationships");
            const collectionItems = (collections?.children || []).filter((n: any) => /kin keeper|family by choice|day ones|just because/i.test(n.name));
            const relItems = relationships?.children || [];
            return [...collectionItems, ...relItems].map((n: any, i: number) => (
              <button key={i} onClick={() => navigate(n.name)} className={currentCategory === n.name ? "active" : ""}>
                <span className="nav-ico" dangerouslySetInnerHTML={{ __html: '<svg viewBox="0 0 24 24">' + (categoryIcons["Relationships"] || categoryIcons["default"]) + '</svg>' }} />
                <span>{n.name}</span>
              </button>
            ));
          })()}
        </nav>

        <div className="sidebar-footer">
          <div className="help-card">
            <div className="tiny">NEED HELP?</div>
            <p>Find the right words.</p>
            <button type="button" className="shoppy-textbtn" onClick={() => useStore.getState().setAssistantOpen(true)}>Ask Shoppy ↗</button>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <main>
        {/* TOPBAR */}
        <header className="topbar">
          <label className="searchbox">
            <span>⌕</span>
            <input type="search" placeholder="Search products, collections, categories…" value={search} onChange={e => setSearch(e.target.value)} />
          </label>
          <div className="top-actions">
            <button className="icon-button" aria-label="Saved items">♡</button>
            <button className="icon-button" aria-label="Shopping bag">♧<span className="count">{cart.length}</span></button>
            <div className="avatar">u.</div>
          </div>
        </header>

        {/* CONTENT */}
        <div className="content">
          <div className="crumb">{breadcrumb.join(" / ")}</div>

          <div className="listing-toolbar">
            <div>
              <h2 className="serif">{currentCategory === "All Products" ? "All products" : currentCategory}</h2>
              <div className="listing-meta">{filtered.length ? `Showing ${(page-1)*PER_PAGE+1}–${Math.min(page*PER_PAGE, filtered.length)} of ${filtered.length} products` : "0 products"}</div>
            </div>
            <div className="toolbar-right">
              <button className="filter-button">☷ &nbsp; Filters</button>
              <select className="sort-select" aria-label="Sort products">
                <option value="featured">Sort by: Featured</option>
                <option value="low">Price: Low to high</option>
                <option value="high">Price: High to low</option>
                <option value="name">Name: A to Z</option>
              </select>
            </div>
          </div>

          {/* PRODUCT GRID */}
          <div className="grid">
            {currentProducts.length === 0 ? (
              <div style={{ gridColumn: "1/-1", padding: "70px", textAlign: "center" }}>
                <h3 className="serif">No products found</h3>
                <p style={{ color: "var(--muted)" }}>Try a different search or category.</p>
                <button className="page" onClick={() => { setSearch(""); navigate("All Products"); }}>Show all products</button>
              </div>
            ) : (
              currentProducts.map(p => (
                <article className="card" key={p.id}>
                  <div className="media">
                    <span className="badge">{p.badge || "UNSAID EDIT"}</span>
                    <button className={`save ${saved.has(p.id) ? "saved" : ""}`} onClick={() => {
                      const ns = new Set(saved);
                      ns.has(p.id) ? ns.delete(p.id) : ns.add(p.id);
                      setSaved(ns);
                    }} aria-label="Save product" dangerouslySetInnerHTML={{ __html: saved.has(p.id) ? "♥" : "♡" }} />
                    <img src={p.images[0]} alt={p.name} loading="lazy" />
                    <button className="quick" onClick={() => { setQuickAdd(p.id); setQty(1); }}>＋ &nbsp; QUICK ADD</button>
                  </div>
                  <div className="details">
                    <div className="product-category">{p.type}</div>
                    <div className="name-price">
                      <h3 className="product-name">{p.name}</h3>
                      <span className="price">${p.price.toFixed(2)}</span>
                    </div>
                    <div className="rating">★★★★★ <span>· Product preview</span></div>
                  </div>
                </article>
              ))
            )}
          </div>

          {/* PAGINATION */}
          {totalPages > 1 && (
            <div className="pagination">
              <button className="page" disabled={page === 1} onClick={() => setPage(page - 1)}>←</button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i} className={`page ${page === i + 1 ? "active" : ""}`} onClick={() => setPage(i + 1)}>{i + 1}</button>
              ))}
              <button className="page" disabled={page === totalPages} onClick={() => setPage(page + 1)}>NEXT →</button>
            </div>
          )}

          <section className="ad-banner">
            <div>
              <h3 className="serif">Built around the people who matter.</h3>
              <p>Explore collections for your chosen family, day ones, and every connection in between.</p>
            </div>
            <button onClick={() => navigate("Relationships")}>EXPLORE COLLECTIONS ↗</button>
          </section>

          <footer className="footer">
            <span>© 2026 UNSAID MARKETPLACE</span>
            <span>PRODUCTS · COLLECTIONS · MEANING</span>
            <span>SUPPORT &nbsp; / &nbsp; SHIPPING &nbsp; / &nbsp; RETURNS</span>
          </footer>
        </div>
      </main>

      {/* QUICK ADD MODAL */}
      {quickAdd !== null && (() => {
        const p = products.find(x => x.id === quickAdd);
        if (!p) return null;
        return (
          <div className="overlay open" role="dialog" aria-modal="true" onClick={e => { if (e.target === e.currentTarget) setQuickAdd(null); }}>
            <div className="modal">
              <button className="close" onClick={() => setQuickAdd(null)} aria-label="Close">×</button>
              <img className="modal-image" src={p.images[0]} alt={p.name} />
              <div className="modal-body">
                <div className="eyebrow">{p.type}</div>
                <h2 className="serif" id="modalName">{p.name}</h2>
                <div className="modal-price">${p.price.toFixed(2)}</div>
                <p className="modal-desc">{p.desc}</p>
                <span className="label">SELECT OPTION</span>
                <div className="option-row">
                  <button className="option selected">Standard</button>
                  <button className="option">Gift-ready</button>
                  <button className="option">Personalized</button>
                </div>
                <div className="qtyrow">
                  <span style={{ fontSize: "10px", color: "var(--muted)" }}>Quantity</span>
                  <div className="qty">
                    <button onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
                    <span>{qty}</span>
                    <button onClick={() => setQty(qty + 1)}>+</button>
                  </div>
                </div>
                <button className="add-btn" onClick={() => { setCart(c => [...c, ...Array(qty).fill(p.id)]); setQuickAdd(null); }}>ADD TO BAG</button>
                <div className="modal-note">Product options shown for prototype · Checkout not connected</div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// Collapsible tree node for sidebar
function TreeNode({ node, currentCategory, onNavigate, level = 0 }: { node: any; currentCategory: string; onNavigate: (name: string) => void; level?: number }) {
  const [open, setOpen] = useState(false);
  const children = node.children || [];
  const has = children.length > 0;
  const isActive = currentCategory === node.name;

  return (
    <div className="tree-node">
      <button
        className={`tree-toggle ${isActive ? "active" : ""} ${open ? "active" : ""}`}
        data-slug={node.slug}
        data-name={node.name}
        onClick={(e) => {
          e.stopPropagation();
          if (has) { setOpen(!open); }
          onNavigate(node.name);
        }}
      >
        <span className="nav-ico" dangerouslySetInnerHTML={{ __html: '<svg viewBox="0 0 24 24">' + (categoryIcons[node.name] || categoryIcons["default"]) + '</svg>' }} />
        <span>{node.name}</span>
        {has && <span className="chev">{open ? "−" : "＋"}</span>}
      </button>
      {has && open && (
        <div className="tree-children open">
          {children.map((child: any, j: number) => (
            <TreeNode key={j} node={child} currentCategory={currentCategory} onNavigate={onNavigate} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
