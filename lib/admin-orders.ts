import { supabase } from './supabase';
export type AdminOrder = { id: string; status: string; total: number | null; created: string };
export type AdminCatalogRow = { name: string; supplier: string; external: string };
export async function getAdminOrders(): Promise<AdminOrder[]> {
  try {
    if (!supabase) throw new Error('no supabase');
    const { data, error } = await supabase.from('orders').select('id,status,total_amount,created_at').order('created_at', { ascending: false }).limit(200);
    if (error || !data) throw new Error('no orders');
    return data.map((o: any) => ({ id: o.id, status: o.status, total: o.total_amount ? Number(o.total_amount) : null, created: o.created_at }));
  } catch { return []; }
}
export async function getAdminCatalog(): Promise<AdminCatalogRow[]> {
  try {
    if (!supabase) throw new Error('no supabase');
    const [prods, sups] = await Promise.all([
      supabase.from('supplier_catalog_products').select('name,supplier_id,external_id').limit(500),
      supabase.from('suppliers').select('id,name').limit(100),
    ]);
    if (prods.error || !prods.data) throw new Error('no catalog');
    const supById = new Map((sups.data ?? []).map((s: any) => [s.id, s.name]));
    return (prods.data as any[]).map((p) => ({ name: p.name, supplier: supById.get(p.supplier_id) ?? '', external: p.external_id ?? '' }));
  } catch { return []; }
}
