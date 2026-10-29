import { getAdminCatalog } from '@/lib/admin-orders';
export const dynamic = 'force-dynamic';
export default async function AdminCatalog() {
  const rows = await getAdminCatalog();
  return (<><h1>Catalog &amp; suppliers</h1><p>{rows.length} supplier catalog products in the database (Printful catalog imported). This is the GitHub admin catalog panel, restored into this scaffold.</p>
  <table style={{ borderCollapse: 'collapse', width: '100%' }}><thead><tr><th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>Product</th><th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>Supplier</th><th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>Supplier ID</th></tr></thead><tbody>{rows.map((r, i) => (<tr key={i}><td>{r.name}</td><td>{r.supplier}</td><td>{r.external}</td></tr>))}</tbody></table></>);
}
