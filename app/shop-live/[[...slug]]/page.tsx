import Link from 'next/link';
import { getCategories, getProducts, descendantsOf } from '@/lib/catalog-db';
export const revalidate = 3600;

export default async function ShopPage({ params }: { params: { slug?: string[] } }) {
  const categories = await getCategories();
  const products = await getProducts();
  const slug = params.slug?.[params.slug.length - 1];
  const cat = categories.find((c) => c.slug === slug);
  const children = categories.filter((c) => c.parent === (slug ?? undefined) || (!slug && c.level === 1));
  const allowed = slug ? new Set(descendantsOf(categories, slug)) : new Set<string>();
  const shown = slug ? products.filter((p) => allowed.has(p.category)) : [];

  return (
    <div className="wrap" style={{ padding: '24px 0 64px' }}>
      <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
        <Link href="/shop-live">Shop</Link>
        {cat && <> &nbsp;›&nbsp; {cat.name}</>}
      </nav>
      <h1 style={{ margin: '0 0 8px' }}>{cat ? cat.name : 'Shop all'}</h1>
      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        {slug ? `${shown.length} product${shown.length === 1 ? '' : 's'}` : 'Browse departments below.'}
      </p>

      {children.length > 0 && (
        <>
          <h2 style={{ fontSize: 18, margin: '24px 0 12px' }}>Departments</h2>
          <div className="grid">
            {children.map((c) => (
              <Link key={c.slug} className="card" href={`/shop-live/${c.slug}`}>{c.name}</Link>
            ))}
          </div>
        </>
      )}

      {slug && (
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
      )}
    </div>
  );
}
