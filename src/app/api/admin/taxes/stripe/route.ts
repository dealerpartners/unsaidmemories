import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { getStripeTaxAdminSummary } from "@/lib/shop/checkout-tax";

export const dynamic = "force-dynamic";

// ============================================================================
// /api/admin/taxes/stripe — the Stripe Tax read model for the admin
// Taxes surface (3.12): engine status + registrations live from
// Stripe, per-state collected totals from our own paid orders' tax
// records. Read-only — registrations are managed in Stripe (they
// are legal filings, created as nexus accrues); this surface makes
// them and the collections VISIBLE.
// ============================================================================

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const summary = await getStripeTaxAdminSummary(tenant);
  return NextResponse.json(summary);
}
