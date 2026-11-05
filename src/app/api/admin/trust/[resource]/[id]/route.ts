import { NextResponse } from "next/server";
import { requireAdmin, isError } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { tenantId } from "@/lib/trust/constants";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ resource: string; id: string }> }) {
  const gate = await requireAdmin(req);
  if (isError(gate)) return gate;
  const { resource, id } = await params;
  const body = await req.json().catch(() => ({}));
  const sb = createServerClient();
  const T = tenantId();
  const now = new Date().toISOString();
  const done = (row: unknown) => NextResponse.json({ row });
  const fail = (e: any) => NextResponse.json({ error: e.message }, { status: 500 });

  if (resource === "violations") {
    const { data, error } = await sb.from("seller_violations")
      .update({ status: body.status, updated_at: now }).eq("id", id).eq("tenant_id", T).select("*").single();
    return error ? fail(error) : done(data);
  }
  if (resource === "investigations") {
    const patch: Record<string, unknown> = { updated_at: now };
    if (body.status) patch.status = body.status;
    if (body.findings !== undefined) patch.findings = body.findings;
    if (body.notes !== undefined) patch.notes = body.notes;
    const { data, error } = await sb.from("seller_investigations").update(patch).eq("id", id).eq("tenant_id", T).select("*").single();
    return error ? fail(error) : done(data);
  }
  if (resource === "appeals") {
    const decision = body.status === "granted" ? "granted" : body.status === "denied" ? "denied" : null;
    if (!decision) return NextResponse.json({ error: "status must be granted or denied" }, { status: 400 });
    const { data, error } = await sb.from("seller_appeals").update({
      status: decision, decision, decided_by: gate.portalUserId, decided_at: now, updated_at: now,
    }).eq("id", id).eq("tenant_id", T).select("*").single();
    if (error) return fail(error);
    if (decision === "granted" && data.violation_id) {
      await sb.from("seller_violations").update({ status: "dismissed", updated_at: now }).eq("id", data.violation_id);
    }
    return done(data);
  }
  if (resource === "verification") {
    if (!["approved", "rejected", "needs_info", "in_review"].includes(body.status)) {
      return NextResponse.json({ error: "invalid verification status" }, { status: 400 });
    }
    const { data, error } = await sb.from("verification_tasks").update({
      status: body.status, reviewed_by: gate.portalUserId, reviewed_at: now,
      notes: body.notes ?? undefined, updated_at: now,
    }).eq("id", id).eq("tenant_id", T).select("*").single();
    return error ? fail(error) : done(data);
  }
  if (resource === "moderation") {
    const { data, error } = await sb.from("quarantine").update({
      resolved: true, resolved_by: gate.displayName || gate.email, resolved_category: body.resolution || body.status || "released",
    }).eq("id", id).select("*").single();
    return error ? fail(error) : done(data);
  }
  if (resource === "dmca") {
    const { data: notice, error } = await sb.from("dmca_details").update({
      workflow_status: body.status, updated_at: now,
      reviewed_at: body.status === "under_review" ? now : undefined,
      actioned_at: body.status === "actioned" ? now : undefined,
      takedown_at: body.status === "actioned" ? now : undefined,
      takedown_by: body.status === "actioned" ? gate.portalUserId : undefined,
      restored_at: body.status === "restored" ? now : undefined,
      restored_by: body.status === "restored" ? gate.portalUserId : undefined,
    }).eq("id", id).eq("tenant_id", T).select("*").single();
    if (error) return fail(error);
    if (body.status === "actioned" || body.status === "restored") {
      await sb.from("dmca_takedown_log").insert({
        tenant_id: T, ticket_id: notice.ticket_id, dmca_details_id: id,
        action: body.status === "actioned" ? "takedown" : "restore",
        listing_ref: notice.target_listing_ref, seller_id: notice.target_seller_id,
        actor_staff_id: gate.portalUserId,
        detail: { reason: body.status === "actioned" ? "DMCA notice actioned from compliance desk" : "Listing restored after counter-notice window" },
      });
      if (body.status === "actioned") {
        await sb.from("dmca_strikes").insert({
          tenant_id: T, ticket_id: notice.ticket_id, seller_id: notice.target_seller_id, strike_at: now, status: "active",
        });
      }
    }
    return done(notice);
  }
  if (resource === "policies") {
    const { data: cur } = await sb.from("trust_policies").select("version").eq("id", id).single();
    const { data, error } = await sb.from("trust_policies").update({
      title: body.title, body: body.body, status: body.status,
      version: (cur?.version ?? 1) + 1, updated_by: gate.portalUserId, updated_at: now,
    }).eq("id", id).eq("tenant_id", T).select("*").single();
    return error ? fail(error) : done(data);
  }
  return NextResponse.json({ error: "unknown resource" }, { status: 404 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ resource: string; id: string }> }) {
  const gate = await requireAdmin(req);
  if (isError(gate)) return gate;
  const { resource, id } = await params;
  if (resource !== "policies") return NextResponse.json({ error: "delete is only supported for policies" }, { status: 400 });
  const { error } = await createServerClient().from("trust_policies").delete().eq("id", id).eq("tenant_id", tenantId());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
