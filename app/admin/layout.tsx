export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (<><nav style={{ display: 'flex', gap: 16, padding: '12px 0', borderBottom: '1px solid #ddd' }}><strong>Admin</strong><a href="/admin">Dashboard</a><a href="/admin/products">Products & variants</a><a href="/admin/designs">Design studio</a><a href="/">Back to store</a></nav>{children}</>);
}
