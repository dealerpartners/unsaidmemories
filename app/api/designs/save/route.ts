import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getServiceClient, getPlatformTenantId } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// POST /api/designs/save
// Body: { name, pngDataUrl, product?: slug, variant?: sku, widthPx, heightPx, dpi? }
// Saves the studio export end-to-end: designs row -> storage upload ->
// design_files row -> design_publications row (one design, many products).
export async function POST(req: Request) {
  const sb = getServiceClient();
  if (!sb) return NextResponse.json({ error: 'Supabase is not configured (missing URL/key)' }, { status: 503 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const { name, pngDataUrl, product, variant, widthPx, heightPx } = body ?? {};
  const dpi = Number(body?.dpi) || 300;
  if (!name || typeof name !== 'string') return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (!pngDataUrl || typeof pngDataUrl !== 'string' || !pngDataUrl.startsWith('data:image/png;base64,')) {
    return NextResponse.json({ error: 'pngDataUrl must be a data:image/png;base64,... URL' }, { status: 400 });
  }
  const tenantId = await getPlatformTenantId(sb);
  if (!tenantId) return NextResponse.json({ error: 'Platform tenant not found' }, { status: 500 });

  // 1. designs row
  const { data: design, error: dErr } = await sb.from('designs')
    .insert({ tenant_id: tenantId, name: name.slice(0, 200), status: 'draft', source: 'konva' })
    .select('id').single();
  if (dErr || !design) return NextResponse.json({ error: 'design insert failed', detail: dErr?.message }, { status: 500 });
  const designId = design.id as string;

  // 2. upload PNG to the design-files bucket
  const buf = Buffer.from(pngDataUrl.split(',', 2)[1], 'base64');
  const path = `${designId}.png`;
  const { error: uErr } = await sb.storage.from('design-files').upload(path, buf, { contentType: 'image/png', upsert: true });
  if (uErr) return NextResponse.json({ error: 'storage upload failed', detail: uErr.message, designId }, { status: 500 });
  const { data: pub } = sb.storage.from('design-files').getPublicUrl(path);
  const fileUrl = pub.publicUrl;

  // 3. design_files row
  const { error: fErr } = await sb.from('design_files').insert({
    design_id: designId, placement: 'front', file_url: fileUrl,
    width_px: Number(widthPx) || 0, height_px: Number(heightPx) || 0, dpi, version: 1,
  });
  if (fErr) return NextResponse.json({ error: 'design_files insert failed', detail: fErr.message, designId, fileUrl }, { status: 500 });

  // 4. design_publications row, if a product/variant was passed
  let publicationId: string | null = null;
  if (product || variant) {
    let variantRow: any = null;
    if (variant) {
      let q = sb.from('product_variants').select('id, tenant_id, product_id').eq('tenant_id', tenantId).eq('sku', variant).limit(1);
      const { data } = await q.maybeSingle();
      variantRow = data;
    } else if (product) {
      const { data: prod } = await sb.from('products').select('id').eq('tenant_id', tenantId).eq('slug', product).limit(1).maybeSingle();
      if (prod) {
        const { data: v } = await sb.from('product_variants').select('id, tenant_id, product_id')
          .eq('tenant_id', tenantId).eq('product_id', prod.id).limit(1).maybeSingle();
        variantRow = v;
      }
    }
    if (!variantRow) {
      return NextResponse.json({ error: 'product/variant not found', designId, fileUrl }, { status: 404 });
    }
    publicationId = randomUUID();
    const { error: pErr } = await sb.from('design_publications').insert({
      id: publicationId, tenant_id: variantRow.tenant_id, design_id: designId,
      product_variant_id: variantRow.id, status: 'draft',
    });
    if (pErr) return NextResponse.json({ error: 'design_publications insert failed', detail: pErr.message, designId, fileUrl }, { status: 500 });
  }

  return NextResponse.json({ ok: true, designId, fileUrl, publicationId });
}
