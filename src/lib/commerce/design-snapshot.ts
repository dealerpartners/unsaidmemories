import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The design DATA snapshot for one publication — the studio's saved
 * canvas node tree plus the product binding it was designed on, frozen
 * at order time. This is what makes the design first-class order data
 * rather than a loose reference: order_items.design_snapshot carries
 * the artwork itself, so fulfillment and the ERP ledger read the design
 * from the order line and never chase (or lose) the live design row.
 * Returns null when the publication or its design cannot be found —
 * callers keep the existing file-URL snapshot and never fail the
 * order for a missing design snapshot.
 */
export interface DesignDataSnapshot {
  design_id: string;
  design_name: string | null;
  canvas_state: unknown;
  supplier_catalog_product_id: string | null;
  product_title: string | null;
  garment_color: string | null;
  print_file_path: string | null;
  print_file_url: string | null;
}

export async function resolveDesignDataSnapshot(
  sb: SupabaseClient,
  designPublicationId: string,
): Promise<DesignDataSnapshot | null> {
  const { data: pub } = await sb
    .from("design_publications")
    .select("design_id, mockup_url")
    .eq("id", designPublicationId)
    .maybeSingle();
  if (!pub?.design_id) return null;

  const { data: design } = await sb
    .from("designs")
    .select("id, name, canvas_state, supplier_catalog_product_id, product_title, garment_color, print_file_path")
    .eq("id", pub.design_id)
    .maybeSingle();
  if (!design) return null;

  let printFileUrl: string | null = null;
  const { data: files } = await sb
    .from("design_files")
    .select("file_url, placement, version")
    .eq("design_id", pub.design_id)
    .order("version", { ascending: false });
  if (files?.length) {
    const front = files.find((f) => f.placement === "front") ?? files[0];
    printFileUrl = front?.file_url ?? null;
  }

  return {
    design_id: design.id,
    design_name: design.name ?? null,
    canvas_state: design.canvas_state ?? null,
    supplier_catalog_product_id: design.supplier_catalog_product_id ?? null,
    product_title: design.product_title ?? null,
    garment_color: design.garment_color ?? null,
    print_file_path: design.print_file_path ?? null,
    print_file_url: printFileUrl ?? pub.mockup_url ?? null,
  };
}

/**
 * Resolve the print-file snapshot for a design publication.
 * Chain: design_publications.design_id → design_files (newest version,
 * front placement preferred) → file_url. Falls back to the publication's
 * mockup_url so an order item always carries the best file reference the
 * system has. Returns null only when the publication has no file at all.
 */
export async function resolveDesignSnapshot(
  sb: SupabaseClient,
  designPublicationId: string
): Promise<string | null> {
  const { data: pub } = await sb
    .from("design_publications")
    .select("design_id, mockup_url")
    .eq("id", designPublicationId)
    .maybeSingle();
  if (!pub) return null;

  if (pub.design_id) {
    const { data: files } = await sb
      .from("design_files")
      .select("file_url, placement, version")
      .eq("design_id", pub.design_id)
      .order("version", { ascending: false });
    if (files?.length) {
      const front = files.find((f) => f.placement === "front") ?? files[0];
      if (front?.file_url) return front.file_url;
    }
  }
  return pub.mockup_url ?? null;
}
