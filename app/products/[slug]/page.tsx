import Link from 'next/link';
import { getProductDetail, getSupplierProductDetail } from '@/lib/catalog-db';
import VariantSelector from '@/components/VariantSelector';
export const revalidate = 3600;

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const p = (await getProductDetail(params.slug)) ?? (await getSupplierProductDetail(params.slug));
  if (!p) {
    return (
      <div className="wrap" style={{ padding: '48px 0' }}>
        <h1>Product not found</h1>
        <p style={{ color: 'var(--muted)' }}>This product is not published yet.</p>
        <Link href="/shop">Back to shop</Link>
      </div>
    );
  }

  const priceText =
    p.price_min == null
      ? 'Price coming soon'
      : p.price_min === p.price_max
        ? `$${p.price_min.toFixed(2)}`
        : `$${p.price_min.toFixed(2)} – $${(p.price_max as number).toFixed(2)}`;

  return (
    <div className="wrap" style={{ padding: '24px 0 64px' }}>
      <nav aria-label="Breadcrumb" style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
        <Link href="/shop">Shop</Link>
        {p.category_path.map((c: any) => (
          <span key={c.slug}>&nbsp;›&nbsp;<Link href={`/shop/${c.slug}`}>{c.name}</Link></span>
        ))}
        &nbsp;›&nbsp; {p.name}
      </nav>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32 }}>
        <div
          aria-hidden="true"
          style={{
            minHeight: 320, borderRadius: 'var(--radius)', background: 'var(--soft)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 72, color: 'var(--muted)',
          }}
        >
          {p.name.charAt(0)}
        </div>

        <div>
          {p.brand && <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>{p.brand}</div>}
          <h1 style={{ margin: '0 0 8px' }}>{p.name}</h1>
          <p style={{ color: 'var(--muted)', marginTop: 0 }}>{priceText}</p>
          {p.description && <p style={{ lineHeight: 1.6 }}>{p.description}</p>}

          <VariantSelector variants={p.variants} />

          {(p.collections ?? []).length > 0 && (
            <div style={{ marginTop: 24, fontSize: 14 }}>
              <span style={{ color: 'var(--muted)' }}>Collections: </span>
              {p.collections.map((c: any, i: number) => (
                <span key={c}>
                  <Link href={`/collections/${c}`}>{c}</Link>
                  {i < (p.collections ?? []).length - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
