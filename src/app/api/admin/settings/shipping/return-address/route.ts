import { NextRequest, NextResponse } from "next/server";
import { requireModuleApi } from "@/lib/admin/gate";
import { resolveTenantId } from "@/lib/admin-api";
import { getDefaultShipFrom, upsertDefaultShipFrom } from "@/lib/shipping/ship-from";

// GET /api/admin/settings/shipping/return-address — the signed-in tenant's
// own label return (ship-from) address (ship_from_addresses, seller_id NULL).
// This is per-tenant data: a franchise tenant sets its own; the master
// tenant's address is never used for another tenant or for a seller.
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("administration", "read");
  if (gate) return gate;

  try {
    const tenant = resolveTenantId(req);
    const row = await getDefaultShipFrom(tenant, null);
    return NextResponse.json({ ok: true, address: row });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to load return address" }, { status: 500 });
  }
}

// PUT — save the tenant's default return address. Partial saves are fine
// (e.g. street now, ZIP later); completeness is enforced when a label is
// bought, not here.
export async function PUT(req: NextRequest) {
  const gate = await requireModuleApi("administration", "write");
  if (gate) return gate;

  try {
    const tenant = resolveTenantId(req);
    const body = (await req.json()) as Record<string, unknown>;
    const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : "");
    const saved = await upsertDefaultShipFrom(tenant, null, {
      name: str("name"),
      street: str("street"),
      city: str("city"),
      state: str("state"),
      zip: str("zip"),
      phone: str("phone"),
    });
    return NextResponse.json({ ok: true, address: saved });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to save return address" }, { status: 500 });
  }
}
