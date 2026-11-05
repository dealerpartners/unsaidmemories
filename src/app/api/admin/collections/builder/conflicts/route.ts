import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/gate";
import {
  buildConflictReport,
  type BuilderDesign,
} from "@/lib/collection-builder";
import { resolveBuilderDesigns } from "@/lib/fabric/builder-designs";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/collections/builder/conflicts
 * Body: { designIds: string[] }
 *
 * Returns the supplier conflict report for the selected designs:
 * which supplier each design ships from, whether they span multiple
 * suppliers, and any designs with no resolvable supplier.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const supabase = createServerClient();
    const body = await req.json();
    const designIds: string[] = body?.designIds ?? [];

    if (!designIds.length) {
      return NextResponse.json({
        hasConflict: false,
        supplierCount: 0,
        groups: [],
        unknownSupplier: [],
      });
    }

    const { data, error } = await supabase
      .from("designs")
      .select("id, name, status, supplier_catalog_product_id, updated_at")
      .in("id", designIds);

    if (error) throw error;

    // Suppliers resolve via separate lookups — the PostgREST embed
    // path does not exist in the real schema (see builder-designs.ts).
    const designs: BuilderDesign[] = await resolveBuilderDesigns(
      supabase,
      data ?? [],
    );

    return NextResponse.json(buildConflictReport(designs));
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to check supplier conflicts" },
      { status: 500 },
    );
  }
}
