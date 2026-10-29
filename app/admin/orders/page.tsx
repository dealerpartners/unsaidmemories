import { getAdminOrders } from '@/lib/admin-orders';
export const dynamic = 'force-dynamic';
export default async function AdminOrders() {
  const rows = await getAdminOrders();
  return (<><h1>Orders</h1><p>{rows.length} orders in the database. Payment first, fulfillment second — an order only goes to a supplier after Stripe payment succeeds.</p>
  <table style={{ borderCollapse: 'collapse', width: '100%' }}><thead><tr><th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>Order</th><th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>Status</th><th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>Total</th><th style={{ border: '1px solid #ddd', padding: 8, textAlign: 'left' }}>Created</th></tr></thead><tbody>{rows.map((r) => (<tr key={r.id}><td>{r.id}</td><td>{r.status}</td><td>{r.total ?? '—'}</td><td>{r.created}</td></tr>))}</tbody></table></>);
}
