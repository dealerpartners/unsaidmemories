import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/inventory-pos
//
// Store Locations & POS (owner's store_locations_pos.html). Unsaid
// has NO point-of-sale data: there is no pos/register/till table in
// the schema (verified against information_schema), so this endpoint
// returns only the real physical locations — warehouses that double
// as storefront locations — and the page renders an honest empty
// state for registers instead of inventing tills, drawers or sales.

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const locations = await pgQuery<{
      id: string; code: string; name: string; warehouse_type: string | null;
      address_line1: string | null; city: string | null; state: string | null;
      postal_code: string | null; is_active: boolean;
    }>(
      `SELECT id::text AS id, code, name, warehouse_type, address_line1, city, state,
              postal_code, is_active
         FROM public.erp_warehouses
        WHERE tenant_id = $1
        ORDER BY name ASC`,
      [tenant],
    );
    return NextResponse.json({
      locations,
      registers: [],
      hasRegisterStorage: false,
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/inventory-pos]", e);
    return NextResponse.json({ error: e?.message || "Failed to load locations" }, { status: 500 });
  }
}
