import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, platformAudit } from "@/lib/crm/enterprise";

// PATCH /api/admin/crm/documents/[id] — update a document's status and/or
// expiry date. Body: { status?, rejectionReason?, expires_at? }
// Used by CustomerDetailsView: verify → { status: 'approved' },
// Set Expiry → { expires_at: 'YYYY-MM-DD' | null }.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("customers", "write"); if (gate) return gate;
  const { id } = await ctx.params;
  let body: any; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const hasStatus = typeof body?.status === "string" && body.status.trim() !== "";
  const hasExpiry = Object.prototype.hasOwnProperty.call(body ?? {}, "expires_at");
  if (!hasStatus && !hasExpiry) {
    return NextResponse.json({ error: "Nothing to update — provide status and/or expires_at" }, { status: 400 });
  }
  let expiresAt: string | null = null;
  if (hasExpiry) {
    const raw = body.expires_at;
    if (raw === null || raw === "") {
      expiresAt = null;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) {
      expiresAt = String(raw);
    } else {
      return NextResponse.json({ error: "expires_at must be a YYYY-MM-DD date or null" }, { status: 400 });
    }
  }
  return withPg(async (client) => {
    const tenant = resolveTenantId(req);
    const doc = await client.query(`SELECT * FROM public.crm_documents WHERE tenant_id = $1 AND id = $2::uuid LIMIT 1`, [tenant, id]);
    if (!doc.rows[0]) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    const status = hasStatus ? String(body.status) : String(doc.rows[0].status);
    await client.query("BEGIN");
    try {
      await client.query(
        `UPDATE public.crm_documents SET status = $2, rejection_reason = $3, expires_at = $4, updated_at = now() WHERE id = $1::uuid`,
        [id, status, hasStatus ? (body.rejectionReason || null) : doc.rows[0].rejection_reason, hasExpiry ? expiresAt : doc.rows[0].expires_at],
      );
      try { await client.query("SAVEPOINT audit_sp"); await platformAudit(client, { action: hasStatus ? "crm.document.verified" : "crm.document.expiry_updated", targetType: "crm_document", targetId: id, actorRole: "admin", metadata: { status, expires_at: hasExpiry ? expiresAt : undefined } }); await client.query("RELEASE SAVEPOINT audit_sp"); } catch { await client.query("ROLLBACK TO SAVEPOINT audit_sp").catch(() => {}); }
      await client.query("COMMIT");
      return NextResponse.json({ ok: true, status, expires_at: hasExpiry ? expiresAt : (doc.rows[0].expires_at ? String(doc.rows[0].expires_at).slice(0, 10) : null) });
    } catch (e: any) { await client.query("ROLLBACK").catch(() => {}); return NextResponse.json({ error: e?.message }, { status: 500 }); }
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 })).catch((e: any) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
