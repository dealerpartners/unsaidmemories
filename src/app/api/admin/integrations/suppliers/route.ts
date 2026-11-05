import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdminApi } from "@/lib/admin/gate";
import { supplierHealth } from "@/lib/integrations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/integrations/suppliers — connection status, credential
// presence, catalog size, and last catalog sync per supplier.
export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const db = createServerClient();
  return NextResponse.json({ suppliers: await supplierHealth(db) });
}
