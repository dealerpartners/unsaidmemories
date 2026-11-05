import { NextResponse } from "next/server";
import { requireAdmin, isError } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { tenantId } from "@/lib/trust/constants";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ resource: string }> }) {
  const gate = await requireAdmin(req);
  if (isError(gate)) return gate;
  const { resource } = await params;
  const body = await req.json().catch(() => ({}));
  const sb = createServerClient();
  const T = tenantId();
  if (resource === "violations") {
    if (!body.violation_type) return NextResponse.json({ error: "violation_type is required" }, { status: 400 });
    const { data, error } = await sb.from("seller_violations").insert({
      tenant_id: T, seller_id: body.subject_id || body.subject_ref || "00000000-0000-0000-0000-000000000000",
      violation_type: body.violation_type, severity: body.severity || "medium", status: "open",
      description: body.description || null, listing_id: null,
      evidence: { listing_ref: body.listing_ref || null, order_ref: body.order_ref || null, subject_ref: body.subject_ref || null },
    }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data }, { status: 201 });
  }
  if (resource === "investigations") {
    const { data, error } = await sb.from("seller_investigations").insert({
      tenant_id: T, seller_id: body.subject_id || body.subject_ref || null,
      investigation_type: body.investigation_type || "fraud", status: "open",
      priority: body.priority || "normal", notes: body.notes || null,
      order_id: body.order_ref || null, investigator_id: gate.portalUserId,
    }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data }, { status: 201 });
  }
  if (resource === "policies") {
    if (!body.code || !body.title || !body.body) return NextResponse.json({ error: "code, title and body are required" }, { status: 400 });
    const { data, error } = await sb.from("trust_policies").insert({
      tenant_id: T, code: body.code, title: body.title, body: body.body,
      status: body.status || "active", version: 1, updated_by: gate.portalUserId,
    }).select("*").single();
    if (error) return NextResponse.json({ error: `trust_policies unavailable (migration pending?): ${error.message}` }, { status: 500 });
    return NextResponse.json({ row: data }, { status: 201 });
  }
  return NextResponse.json({ error: "unknown resource" }, { status: 404 });
}
