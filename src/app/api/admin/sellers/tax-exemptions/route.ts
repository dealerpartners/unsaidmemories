import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// E3 · Tax exemptions — seller tax-exemption register.
// No seller tax-exemption store or field existed (exemption flags exist
// only on customer accounts). Migration 20261081 creates
// public.seller_tax_exemptions; this route is its real CRUD. The state is
// surfaced in the sellers tax desk, in the tax-documents standing read
// (active exemption per seller), and on the seller detail page — wherever
// the seller's tax profile is shown in admin.
//
// Gate: "sellers". Tenancy: tenant_id is a predicate in every statement.
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = ["resale", "nonprofit", "government", "tribal", "other"] as const;
const STATUSES = ["pending_review", "active", "expired", "revoked"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const COLS = `
  e.id, e.seller_id, s.display_name AS seller_name, e.exemption_type,
  e.certificate_ref, e.jurisdiction, e.valid_from, e.valid_to, e.status,
  e.notes, e.created_at, e.updated_at,
  (e.status = 'active' AND (e.valid_to IS NULL OR e.valid_to >= CURRENT_DATE)) AS effective_now
`;
const FROM = `
  FROM public.seller_tax_exemptions e
  JOIN public.sellers s ON s.id = e.seller_id AND s.tenant_id = e.tenant_id
`;

function optDate(v: unknown): string | null | "bad" {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v);
  return DATE_RE.test(s) && !Number.isNaN(Date.parse(s)) ? s : "bad";
}

// GET /api/admin/sellers/tax-exemptions?seller_id=
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const sellerId = (req.nextUrl.searchParams.get("seller_id") || "").trim();
  if (sellerId && !UUID_RE.test(sellerId)) {
    return NextResponse.json({ error: "seller_id must be a uuid" }, { status: 400 });
  }
  try {
    const out = await withPg(async (c) => {
      const clauses = ["e.tenant_id = $1"];
      const params: unknown[] = [tenant];
      if (sellerId) {
        params.push(sellerId);
        clauses.push(`e.seller_id = $${params.length}::uuid`);
      }
      const { rows } = await c.query(
        `SELECT ${COLS} ${FROM} WHERE ${clauses.join(" AND ")}
          ORDER BY e.created_at DESC LIMIT 300`,
        params
      );
      return { exemptions: rows };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    if (String(e?.message || "").includes("seller_tax_exemptions")) {
      return NextResponse.json(
        { error: "Exemption store not set up yet — apply migration 20261081.", exemptions: [] },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "exemptions list failed" }, { status: 500 });
  }
}

// POST { seller_id, exemption_type, certificate_ref?, jurisdiction?,
// valid_from?, valid_to?, status?, notes? }
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const sellerId = String(b.seller_id || "");
  const type = String(b.exemption_type || "").trim().toLowerCase();
  const validFrom = optDate(b.valid_from);
  const validTo = optDate(b.valid_to);
  const status = b.status ? String(b.status).trim().toLowerCase() : "pending_review";

  if (!UUID_RE.test(sellerId)) return NextResponse.json({ error: "seller_id must be a uuid" }, { status: 400 });
  if (!(TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: `exemption_type must be one of: ${TYPES.join(", ")}` }, { status: 400 });
  }
  if (validFrom === "bad" || validTo === "bad") {
    return NextResponse.json({ error: "valid_from / valid_to must be YYYY-MM-DD dates" }, { status: 400 });
  }
  if (validFrom && validTo && validTo < validFrom) {
    return NextResponse.json({ error: "valid_to must be on or after valid_from" }, { status: 400 });
  }
  if (!(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${STATUSES.join(", ")}` }, { status: 400 });
  }
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);
  try {
    const out = await withPg(async (c) => {
      const { rows: sellerRows } = await c.query(
        `SELECT id FROM public.sellers WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, sellerId]
      );
      if (sellerRows.length === 0) return { kind: "no_seller" as const };
      const { rows } = await c.query(
        `INSERT INTO public.seller_tax_exemptions
           (tenant_id, seller_id, exemption_type, certificate_ref, jurisdiction,
            valid_from, valid_to, status, notes, created_by)
         VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10::uuid)
         RETURNING id`,
        [tenant, sellerId, type,
         b.certificate_ref ? String(b.certificate_ref).slice(0, 200) : null,
         b.jurisdiction ? String(b.jurisdiction).slice(0, 120) : null,
         validFrom, validTo, status,
         b.notes ? String(b.notes).slice(0, 2000) : null,
         actorId && UUID_RE.test(actorId) ? actorId : null]
      );
      if (!rows[0]) throw new Error("Tax exemption insert did not land");
      await writeSellerAudit(c, {
        tenantId: tenant, sellerId, actorId, ipAddress,
        action: "tax_exemption.recorded", entityType: "seller_tax_exemption", entityId: rows[0].id,
        afterState: { exemption_type: type, status },
      });
      const { rows: full } = await c.query(
        `SELECT ${COLS} ${FROM} WHERE e.tenant_id = $1 AND e.id = $2::uuid`,
        [tenant, rows[0].id]
      );
      return { kind: "ok" as const, exemption: full[0] };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (out.kind === "no_seller") return NextResponse.json({ error: "Seller not found in this tenant" }, { status: 404 });
    return NextResponse.json({ exemption: out.exemption }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: "exemption record failed" }, { status: 500 });
  }
}

// PATCH { id, status?, exemption_type?, certificate_ref?, jurisdiction?,
// valid_from?, valid_to?, notes? }
export async function PATCH(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const id = String(b.id || "");
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "id must be an exemption uuid" }, { status: 400 });
  const status = b.status ? String(b.status).trim().toLowerCase() : null;
  const type = b.exemption_type ? String(b.exemption_type).trim().toLowerCase() : null;
  if (status && !(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${STATUSES.join(", ")}` }, { status: 400 });
  }
  if (type && !(TYPES as readonly string[]).includes(type)) {
    return NextResponse.json({ error: `exemption_type must be one of: ${TYPES.join(", ")}` }, { status: 400 });
  }
  const validFrom = b.valid_from !== undefined ? optDate(b.valid_from) : undefined;
  const validTo = b.valid_to !== undefined ? optDate(b.valid_to) : undefined;
  if (validFrom === "bad" || validTo === "bad") {
    return NextResponse.json({ error: "valid_from / valid_to must be YYYY-MM-DD dates" }, { status: 400 });
  }
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);
  try {
    const out = await withPg(async (c) => {
      const { rows: before } = await c.query(
        `SELECT ${COLS} ${FROM} WHERE e.tenant_id = $1 AND e.id = $2::uuid`,
        [tenant, id]
      );
      if (before.length === 0) return { kind: "missing" as const };
      const row = before[0];
      const nextFrom = validFrom !== undefined ? validFrom : row.valid_from ? String(row.valid_from).slice(0, 10) : null;
      const nextTo = validTo !== undefined ? validTo : row.valid_to ? String(row.valid_to).slice(0, 10) : null;
      if (nextFrom && nextTo && nextTo < nextFrom) {
        return { kind: "bad" as const, error: "valid_to must be on or after valid_from" };
      }
      await c.query(
        `UPDATE public.seller_tax_exemptions
            SET status = COALESCE($3, status),
                exemption_type = COALESCE($4, exemption_type),
                certificate_ref = COALESCE($5, certificate_ref),
                jurisdiction = COALESCE($6, jurisdiction),
                valid_from = CASE WHEN $7::boolean THEN $8::date ELSE valid_from END,
                valid_to = CASE WHEN $9::boolean THEN $10::date ELSE valid_to END,
                notes = COALESCE($11, notes),
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, id, status, type,
         b.certificate_ref ? String(b.certificate_ref).slice(0, 200) : null,
         b.jurisdiction ? String(b.jurisdiction).slice(0, 120) : null,
         validFrom !== undefined, validFrom ?? null,
         validTo !== undefined, validTo ?? null,
         b.notes ? String(b.notes).slice(0, 2000) : null]
      );
      await writeSellerAudit(c, {
        tenantId: tenant, sellerId: String(row.seller_id), actorId, ipAddress,
        action: "tax_exemption.updated", entityType: "seller_tax_exemption", entityId: id,
        beforeState: { status: row.status }, afterState: { status: status ?? row.status },
      });
      const { rows: full } = await c.query(
        `SELECT ${COLS} ${FROM} WHERE e.tenant_id = $1 AND e.id = $2::uuid`,
        [tenant, id]
      );
      return { kind: "ok" as const, exemption: full[0] };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (out.kind === "missing") return NextResponse.json({ error: "Exemption not found in this tenant" }, { status: 404 });
    if (out.kind === "bad") return NextResponse.json({ error: out.error }, { status: 400 });
    return NextResponse.json({ exemption: out.exemption });
  } catch (e: any) {
    return NextResponse.json({ error: "exemption update failed" }, { status: 500 });
  }
}

// DELETE { id } — removes a wrongly recorded exemption (audited first).
export async function DELETE(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const id = String(b.id || req.nextUrl.searchParams.get("id") || "");
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "id must be an exemption uuid" }, { status: 400 });
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);
  try {
    const out = await withPg(async (c) => {
      const { rows: before } = await c.query(
        `SELECT ${COLS} ${FROM} WHERE e.tenant_id = $1 AND e.id = $2::uuid`,
        [tenant, id]
      );
      if (before.length === 0) return { kind: "missing" as const };
      await writeSellerAudit(c, {
        tenantId: tenant, sellerId: String(before[0].seller_id), actorId, ipAddress,
        action: "tax_exemption.deleted", entityType: "seller_tax_exemption", entityId: id,
        beforeState: { status: before[0].status, exemption_type: before[0].exemption_type },
      });
      await c.query(
        `DELETE FROM public.seller_tax_exemptions WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, id]
      );
      return { kind: "ok" as const };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (out.kind === "missing") return NextResponse.json({ error: "Exemption not found in this tenant" }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (e: any) {
    return NextResponse.json({ error: "exemption delete failed" }, { status: 500 });
  }
}
