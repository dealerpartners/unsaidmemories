import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/gate";
import { INTEGRATION_SERVICES } from "@/lib/integrations/catalog";
import { testConnection } from "@/lib/integrations/test-connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { serviceId } — the Connect wizard's Step 4 test ("We test it").
 * Runs the real read for the service through lib/integrations/
 * test-connection (keys resolved vault-first by lib/integrations/
 * keys, never returned) and answers with the honest outcome:
 * { status: "connected", proofLine } built only from values the
 * service returned, { status: "failed", detail, fix } in plain words,
 * or { status: "untestable", detail, verified } when no read endpoint
 * is wired for that service. Never returns a key value — last four
 * only, inside `verified`.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const body = await req.json().catch(() => ({}));
  const serviceId = String(body.serviceId ?? "");
  if (!INTEGRATION_SERVICES.some((s) => s.id === serviceId)) {
    return NextResponse.json({ error: `Unknown service: ${serviceId}` }, { status: 400 });
  }
  const result = await testConnection(serviceId);
  return NextResponse.json(result);
}
