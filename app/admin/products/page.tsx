import Link from 'next/link';
import { getAdminProducts } from '@/lib/admin-catalog';
export const dynamic = 'force-dynamic';
export default async function AdminProducts() {
  const products = await getAdminProducts();
  const variantCount = products.reduce((n, p) => n + p.variants.length, 0);
  return (<><h1>Products &amp; variants — admin first</h1><p>{products.length} products · {variantCount} variants. Every product hits admin first: design it in the studio, then publish it. Nothing here is a storefront listing until its status is published.</p>
  <table style={{ borderCollapse: 'collapse', width: '100%' }}><thead><tr>{['Product','Category','Brand','Status','Holidays / collections','Variant SKU','Size','Color','Price','Active','Design'].map((h) => (<th key={h} style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>{h}</th>))}</tr></thead><tbody>
  {products.map((p) => p.variants.length === 0 ? (<tr key={p.slug}><td><Link href={`/products/${p.slug}`}>{p.name}</Link></td><td>{p.category}</td><td>{p.brand}</td><td>{p.status}</td><td>{p.collections.join(', ') || '—'}</td><td colSpan={5}>No variants yet — add one in admin, then design it.</td><td><Link href={`/admin/designs?product=${p.slug}`}>Design</Link></td></tr>) : p.variants.map((v, i) => (<tr key={`${p.slug}-${v.sku}`}><td>{i === 0 ? (<Link href={`/products/${p.slug}`}>{p.name}</Link>) : ''}</td><td>{i === 0 ? p.category : ''}</td><td>{i === 0 ? p.brand : ''}</td><td>{i === 0 ? p.status : ''}</td><td>{i === 0 ? (p.collections.join(', ') || '—') : ''}</td><td>{v.sku}</td><td>{v.size ?? '—'}</td><td>{v.color ?? '—'}</td><td>${v.price}</td><td>{v.is_active ? 'Yes' : 'No'}</td><td><Link href={`/admin/designs?product=${p.slug}&variant=${v.sku}`}>Design</Link></td></tr>)))}
  </tbody></table>
  <p>Design flow: admin uploads/creates a design in the studio (Konva canvas, bleed/trim/safe zones, 300 DPI export) → design is saved → design publication links it to products/collections → checkout → Stripe webhook → Printful order with the design file URL + variant ID. Payment first, fulfillment second.</p></>);
}
