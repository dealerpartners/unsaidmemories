export const dynamic = 'force-dynamic';
export default function Admin() { return (<><h1>Admin</h1><ul><li><a href="/admin/products">Products &amp; variants — real table, admin first</a></li><li><a href="/admin/designs">Design studio — upload/add your design (Konva), publish to products</a></li><li>Orders / fulfillment (via /api/fulfillment)</li><li>Social drafts (via /api/social)</li></ul></>); }
