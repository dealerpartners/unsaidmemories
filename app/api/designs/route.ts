import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// GET /api/designs — saved studio designs with their print files and
// how many product variants each is published to.
export async function GET() {
  const sb = getServiceClient();
  if (!sb) return NextResponse.json({ error: 'Supabase is not configured (missing URL/key)' }, { status: 503 });
  const { data: designs, error } = await sb.from('designs')
    .select('id, name, status, source, created_at')
    .order('created_at', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ids = (designs ?? []).map((d: any) => d.id);
  let filesByDesign: Record<string, any[]> = {};
  let pubsByDesign: Record<string, number> = {};
  if (ids.length) {
    const { data: files } = await sb.from('design_files').select('design_id, file_url, width_px, height_px, dpi, version').in('design_id', ids);
    for (const f of (files ?? []) as any[]) { (filesByDesign[f.design_id] ||= []).push(f); }
    const { data: pubs } = await sb.from('design_publications').select('design_id, status').in('design_id', ids);
    for (const p of (pubs ?? []) as any[]) { pubsByDesign[p.design_id] = (pubsByDesign[p.design_id] || 0) + 1; }
  }
  return NextResponse.json({
    designs: (designs ?? []).map((d: any) => ({
      ...d, files: filesByDesign[d.id] ?? [], publications: pubsByDesign[d.id] ?? 0,
    })),
  });
}
