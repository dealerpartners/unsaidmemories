/**
 * Inspect product_canvas_templates: columns, existing rows, unique index.
 */
import { supabaseAdmin } from '../src/lib/supabaseAdmin';

async function main() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('product_canvas_templates')
    .select('*')
    .limit(10);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    console.log('no rows');
    return;
  }
  console.log('COLUMNS:', Object.keys(data[0]).join(', '));
  for (const r of data) {
    console.log(
      JSON.stringify({
        id: r.id,
        canonical: r.canonical_product_id,
        view: r.view_angle,
        ppi: r.px_per_inch,
        zone: [r.print_zone_x, r.print_zone_y, r.print_zone_width, r.print_zone_height],
        phys: [r.physical_width_inches, r.physical_height_inches],
        base: r.stored_base_path,
        verified: r.verified,
        active: r.is_active,
        source: r.source,
      }),
    );
  }
}
void main();
