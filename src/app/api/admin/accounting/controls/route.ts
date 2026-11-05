import { NextRequest, NextResponse } from "next/server";
import { adminCreate, adminUpdate, resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/controls
// POST /api/admin/accounting/controls
//
// Controls & Compliance register (owner's controls_compliance
// .html) over acct_controls: every internal control with its
// domain/process, the policy rule and threshold it enforces, its
// owner role, enforcement mechanism, frequency, status, and its
// audit-evidence attachment (acct_attachments). The register is
// created empty and filled by hand — rows are only ever what an
// admin registers here; nothing is seeded or attested on anyone's
// behalf. POST creates a control; { action: "update", id, ... }
// edits one; { action: "evaluate", id } stamps last_evaluated_at.

const FIELDS = [
  "control_code", "domain", "process", "policy_rule", "threshold",
  "owner_role", "enforcement", "frequency", "status", "evidence_attachment_id",
] as const;

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const [controls, attachments] = await Promise.all([
      pgQuery<any>(
        `SELECT c.id::text AS id, c.control_code, c.domain, c.process, c.policy_rule,
                c.threshold, c.owner_role, c.enforcement, c.frequency, c.status,
                c.evidence_attachment_id::text AS evidence_attachment_id,
                a.file_name AS evidence_file_name,
                c.last_evaluated_at::text AS last_evaluated_at,
                c.created_at::text AS created_at, c.updated_at::text AS updated_at
           FROM public.acct_controls c
           LEFT JOIN public.acct_attachments a ON a.id = c.evidence_attachment_id
          WHERE c.tenant_id = $1
          ORDER BY c.domain, c.control_code`, [tenant]),
      pgQuery<{ id: string; file_name: string }>(
        `SELECT id::text AS id, file_name FROM public.acct_attachments
          WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200`, [tenant]),
    ]);
    return NextResponse.json({
      controls: controls.map((c: any) => ({
        id: c.id, controlCode: c.control_code, domain: c.domain, process: c.process,
        policyRule: c.policy_rule, threshold: c.threshold, ownerRole: c.owner_role,
        enforcement: c.enforcement, frequency: c.frequency, status: c.status,
        evidenceAttachmentId: c.evidence_attachment_id, evidenceFileName: c.evidence_file_name,
        lastEvaluatedAt: c.last_evaluated_at, createdAt: c.created_at, updatedAt: c.updated_at,
      })),
      attachments,
      total: controls.length,
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/controls]", e);
    return NextResponse.json({ error: e?.message || "Failed to load controls" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    if (body.action === "evaluate") {
      if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      return adminUpdate("acct_controls", String(body.id),
        { last_evaluated_at: new Date().toISOString() },
        { preGated: true, tenantId: tenant, schema: "public" });
    }

    const record: Record<string, unknown> = {};
    for (const f of FIELDS) {
      if (body[f] !== undefined) {
        record[f] = f === "evidence_attachment_id"
          ? (body[f] ? String(body[f]) : null)
          : (body[f] === "" ? null : body[f]);
      }
    }
    if (body.action === "update") {
      if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      return adminUpdate("acct_controls", String(body.id), record, { preGated: true, tenantId: tenant, schema: "public" });
    }

    if (!record.control_code || !record.domain || !record.policy_rule) {
      return NextResponse.json({ error: "control_code, domain, and policy_rule are required" }, { status: 400 });
    }
    if (!record.status) record.status = "Active";
    return adminCreate("acct_controls", record, { preGated: true, tenantId: tenant, schema: "public" });
  } catch (e: any) {
    console.error("[POST /api/admin/accounting/controls]", e);
    return NextResponse.json({ error: e?.message || "Failed to save control" }, { status: 500 });
  }
}
