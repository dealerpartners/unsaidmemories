import Link from 'next/link';
import { getCategories, getProducts, getSupplierProducts, descendantsOf } from '@/lib/catalog-db';
import CategorySidebar from '@/components/CategorySidebar';
export const revalidate = 3600;

export default async function ShopPage({ params }: { params: { slug?: string[] } }) {
  const categories = await getCategories();
  const products = await getSupplierProducts(5000);
  const brands = [...new Set(products.map((p) => p.brand).filter(Boolean))].sort();
  const slug = params.slug?.[params.slug.length - 1];
  const cat = categories.find((c) => c.slug === slug);
  const children = categories.filter((c) => c.parent === (slug ?? undefined) || (!slug && c.level === 1));
  const l1 = categories.filter((c) => c.level === 1);
  const allowed = slug ? new Set(descendantsOf(categories, slug)) : new Set<string>();
  const matched = slug ? products.filter((p) => allowed.has(p.category)) : [];
  // If category filter yields nothing, show all products rather than an empty page
  const shown = slug && matched.length === 0 ? products.slice(0, 48) : matched;

  if (!slug) {
    return (
      <div className="wrap" style={{ padding: '24px 0 64px', display: 'flex', gap: 32 }}>
      <CategorySidebar categories={categories} brands={brands} activeSlug={slug} />
      <div style={{ flex: 1 }}>
      <section className="section products" id="products"><div className="wrap"><div className="section-head"><div><div className="eyebrow">Thoughtful things, chosen well</div><h2 id="shopHeading">Little pieces.<br/>Whole lifetimes.</h2></div><p>Start with one meaningful thing. Add to it over the years. Every piece has a place in the bigger story.</p></div><div className="shop-switcher"><div className="shop-switcher-top"><strong>Browse by department</strong><a href="/shop" className="text-link">All products <span>↗</span></a></div><div className="shop-dept-pills" aria-label="Filter products by department">{l1.map((c) => (<Link key={c.slug} href={`/shop/${c.slug}`} className="pill">{c.name}</Link>))}</div></div><div className="catalog-toolbar product-toolbar"><div><div className="eyebrow">Shop the catalog</div><h3>Find your next keepsake</h3></div><span className="catalog-count" id="productCount" aria-live="polite">{products.length} products</span></div><div className="filter-panel"><div><div className="eyebrow">Find your fit</div><h3>Filter across the whole store</h3><p>Shop by the person, occasion, personalization, material or budget that matters to you. Seeded sample products, prices and lead times are illustrative; supplier feeds are not connected yet.</p></div><div className="filter-controls"><label>Recipient<select id="filterRecipient"><option value="">Anyone</option><option>Mom</option><option>Dad</option><option>Grandparent</option><option>Child</option><option>Baby</option><option>Partner</option><option>Pet</option><option>Whole family</option></select></label><label>Occasion<select id="filterOccasion"><option value="">Any occasion</option><option>Birthday</option><option>Wedding</option><option>Anniversary</option><option>New baby</option><option>Holiday</option><option>Graduation</option><option>Sympathy</option></select></label><label>Personalization<select id="filterPersonalization"><option value="">Any</option><option>Name</option><option>Photo</option><option>Text</option><option>Date</option><option>Engraving</option><option>None</option></select></label><label>Memory Link<select id="filterMemoryLink"><option value="">Any link type</option><option>QR printed on item</option><option>NFC</option><option>Insert card</option><option>None</option></select></label><label>Material<select id="filterMaterial"><option value="">Any material</option><option>Ceramic</option><option>Glass</option><option>Wood</option><option>Metal</option><option>Cotton</option><option>Fleece</option><option>Wax</option><option>Paper</option></select></label><label>Price range<select id="filterPrice"><option value="">Any price</option><option value="under15">Under $15</option><option value="15to30">$15–30</option><option value="30to60">$30–60</option><option value="60plus">$60+</option></select></label><label>Fulfillment<select id="filterFulfillment"><option value="">Any fulfillment</option><option>Print-on-demand</option><option>Standard dropship</option></select></label><label>Ships in<select id="filterShips"><option value="">Any production time</option><option>1–3 business days</option><option>4–7 business days</option><option>8–14 business days</option><option>15+ business days</option></select></label></div><div className="filter-actions"><button className="btn btn-primary filter-apply" id="applyStoreFilters">Apply filters <span>→</span></button><button className="btn filter-reset" id="resetStoreFilters" type="button">Reset</button></div><p className="filter-feedback" id="filterFeedback" aria-live="polite">Choose filters to narrow the catalog.</p></div><div className="product-grid" aria-live="polite">{products.map((p) => (
                <Link key={p.slug} className="card" href={`/products/${p.slug}`}>
                  <div aria-hidden="true" style={{ height: 140, borderRadius: 'var(--radius)', background: 'var(--soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, color: 'var(--muted)', marginBottom: 12 }}>{p.name.charAt(0)}</div>
                  <strong>{p.name}</strong><br />
                  <span style={{ color: 'var(--muted)', fontSize: 14 }}>{p.brand || 'UnSaid'}</span><br />
                  <span style={{ fontWeight: 600 }}>${p.price.toFixed(2)}</span>
                </Link>))}</div></div></section>
      </div>
      </div>
    );
  }

  return (
    <div className="wrap" style={{ padding: '24px 0 64px', display: 'flex', gap: 32 }}>
      <CategorySidebar categories={categories} brands={brands} activeSlug={slug} />
      <div style={{ flex: 1 }}>
      <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
        <Link href="/shop">Shop</Link>
        {cat && <> &nbsp;›&nbsp; {cat.name}</>}
      </nav>
      <h1 style={{ margin: '0 0 8px' }}>{cat ? cat.name : 'Shop all'}</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        {`${shown.length} product${shown.length === 1 ? '' : 's'}`}
      </p>

      {children.length > 0 && (
        <>
          <h2 style={{ fontSize: 18, margin: '24px 0 12px' }}>Departments</h2>
          <div className="grid">
            {children.map((c) => (
              <Link key={c.slug} className="card" href={`/shop/${c.slug}`}>{c.name}</Link>
            ))}
          </div>
        </>
      )}

      {
        <>
          <h2 style={{ fontSize: 18, margin: '24px 0 12px' }}>Products</h2>
          {shown.length === 0 ? (
            <p style={{ color: 'var(--muted)', border: '1px dashed var(--line)', borderRadius: 'var(--radius)', padding: 24 }}>
              No published products in {cat?.name ?? 'this category'} yet. Products appear here once they are
              published in the admin catalog.
            </p>
          ) : (
            <div className="grid">
              {shown.map((p) => (
                <Link key={p.slug} className="card" href={`/products/${p.slug}`}>
                  <div
                    aria-hidden="true"
                    style={{
                      height: 140, borderRadius: 'var(--radius)', background: 'var(--soft)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 40, color: 'var(--muted)', marginBottom: 12,
                    }}
                  >
                    {p.name.charAt(0)}
                  </div>
                  <strong>{p.name}</strong>
                  <br />
                  <span style={{ color: 'var(--muted)', fontSize: 14 }}>{p.brand || 'UnSaid'}</span>
                  <br />
                  <span style={{ fontWeight: 600 }}>${p.price.toFixed(2)}</span>
                </Link>
              ))}
            </div>
          )}
        </>
      }
      </div>
    </div>
  );
}
