import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// E3 · Tax Oversight — the seller tax-document register.
// Tree leaves (admin-portal-tree.md §E3): W-9 collection · 1099-K issuance ·
// Sales tax remittance · Tax exemptions. Data-graph contract E3: admin
// writes `tax_documents`; the seller reads own docs.
//
// Real store (verified firsthand via information_schema + pg_constraint,
// 2026-10-14; the table carries ONLY its primary key — no CHECKs, no FKs):
//   public.seller_tax_documents — id, tenant_id, seller_id, doc_type
//   (text, NOT NULL), tax_year (int), document_url, status (text, default
//   'pending'), created_at. Plus sellers.tax_id_last4 — the W-9 evidence
//   the seller's own record already carries.
// The document vocabulary is Sunny's text, not an invention: the seller
// portal's tax-docs surface names exactly two documents — W-9 and 1099-K
// (seller-center-tree-a.md "Tax classifications"; original tree "Retrieve
// Form 1099-K"). This desk records those two, and only those two.
//
// What the records mean, honestly:
//   W-9 'received' / 'verified' — paperwork state: the seller's W-9 is on
//     file (collection) and, when stamped verified, an admin has reviewed
//     it. The desk records the state; the document itself lives at
//     document_url when one is supplied.
//   1099-K 'issued' — recordable ONLY with a document_url: the issued
//     form's artifact must exist for the record to point at. Generation
//     IS built (see ./generate — it computes the form from recorded
//     seller orders and the register row points at the generated form);
//     IRS filing is NOT built (no filing integration) — a manually
//     recorded 'issued' still registers an artifact produced elsewhere.
// The other two E3 leaves have NO seller-side store, and are named rather
// than faked: sales-tax remittance is platform accounting (acct_tax_* —
// the tenant Taxes surface in Accounting), and no tax-exemption field
// exists on any seller store (exemption flags exist only on customer
// accounts). Both are Sunny's schema/policy calls.
//
// Gate: "sellers". Tenancy: tenant_id is a predicate in every statement.
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DOC_TYPES = ["W-9", "1099-K"] as const;
const STATUSES = ["pending", "received", "verified", "issued", "rejected"] as const;

const DOC_COLS = `
  d.id, d.seller_id, s.display_name AS seller_name, s.status AS seller_status,
  (s.tax_id_last4 IS NOT NULL) AS tax_id_on_file,
  d.doc_type, d.tax_year, d.document_url, d.status, d.created_at
`;

const FROM = `
  FROM public.seller_tax_documents d
  JOIN public.sellers s ON s.id = d.seller_id AND s.tenant_id = d.tenant_id
`;

// GET /api/admin/sellers/tax-documents?seller_id=&doc_type=&tax_year=
//   -> the register + per-seller W-9 standing (tax_id on file, latest W-9
//      record, 1099-K years on record).
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const sellerId = (req.nextUrl.searchParams.get("seller_id") || "").trim();
  const docType = (req.nextUrl.searchParams.get("doc_type") || "").trim();
  const taxYearRaw = (req.nextUrl.searchParams.get("tax_year") || "").trim();
  if (sellerId && !UUID_RE.test(sellerId)) {
    return NextResponse.json({ error: "seller_id must be a uuid" }, { status: 400 });
  }
  const taxYear = taxYearRaw ? Number(taxYearRaw) : null;
  if (taxYearRaw && (!Number.isInteger(taxYear) || taxYear! < 2000 || taxYear! > 2100)) {
    return NextResponse.json({ error: "tax_year must be a year" }, { status: 400 });
  }
  try {
    const out = await withPg(async (c) => {
      const clauses: string[] = ["d.tenant_id = $1"];
      const params: unknown[] = [tenant];
      if (sellerId) {
        params.push(sellerId);
        clauses.push(`d.seller_id = $${params.length}::uuid`);
      }
      if (docType) {
        params.push(docType);
        clauses.push(`d.doc_type = $${params.length}`);
      }
      if (taxYear !== null) {
        params.push(taxYear);
        clauses.push(`d.tax_year = $${params.length}`);
      }
      const { rows: documents } = await c.query(
        `SELECT ${DOC_COLS} ${FROM}
          WHERE ${clauses.join(" AND ")}
          ORDER BY d.created_at DESC LIMIT 200`,
        params
      );
      const { rows: standing } = await c.query(
        `SELECT s.id AS seller_id, s.display_name, s.status AS seller_status,
                (s.tax_id_last4 IS NOT NULL) AS tax_id_on_file,
                (SELECT d.status FROM public.seller_tax_documents d
                  WHERE d.tenant_id = s.tenant_id AND d.seller_id = s.id
                    AND d.doc_type = 'W-9'
                  ORDER BY d.created_at DESC LIMIT 1) AS w9_status,
                (SELECT COALESCE(array_agg(DISTINCT d.tax_year ORDER BY d.tax_year), ARRAY[]::int[])
                   FROM public.seller_tax_documents d
                  WHERE d.tenant_id = s.tenant_id AND d.seller_id = s.id
                    AND d.doc_type = '1099-K' AND d.status = 'issued') AS form_1099k_years
           FROM public.sellers s
          WHERE s.tenant_id = $1
          ORDER BY s.display_name`,
        [tenant]
      );
      // E3 exemptions (migration 20261081): active exemption state rides
      // the standing read so it shows wherever the seller tax profile is
      // shown. Fail-soft until the migration lands — absence is "unknown",
      // rendered as no exemption on file, never a fabricated state.
      let exemptionBySeller = new Map<string, { count: number; types: string[] }>();
      try {
        const { rows: exRows } = await c.query(
          `SELECT seller_id::text AS seller_id, exemption_type
             FROM public.seller_tax_exemptions
            WHERE tenant_id = $1 AND status = 'active'
              AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)`,
          [tenant]
        );
        for (const r of exRows) {
          const cur = exemptionBySeller.get(r.seller_id) || { count: 0, types: [] };
          cur.count += 1;
          if (!cur.types.includes(r.exemption_type)) cur.types.push(r.exemption_type);
          exemptionBySeller.set(r.seller_id, cur);
        }
      } catch { /* store not applied yet */ }
      const standingOut = standing.map((s: Record<string, unknown>) => {
        const ex = exemptionBySeller.get(String(s.seller_id));
        return {
          ...s,
          active_exemptions: ex ? ex.count : 0,
          exemption_types: ex ? ex.types : [],
        };
      });
      return { documents, standing: standingOut };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: "tax documents failed" }, { status: 500 });
  }
}

// POST /api/admin/sellers/tax-documents { seller_id, doc_type, tax_year?,
// document_url?, status? } -> register a document record.
// W-9 lands 'received' (collection) unless a status is given; a 1099-K may
// only be recorded 'issued' WITH the issued form's document_url.
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const sellerId = String(b.seller_id || "");
  const docType = String(b.doc_type || "").trim();
  const documentUrl = b.document_url ? String(b.document_url).slice(0, 1000) : null;
  const taxYear = b.tax_year === null || b.tax_year === undefined || b.tax_year === ""
    ? null
    : Number(b.tax_year);
  let status = b.status ? String(b.status).trim().toLowerCase() : "";

  if (!UUID_RE.test(sellerId)) {
    return NextResponse.json({ error: "seller_id must be a uuid" }, { status: 400 });
  }
  if (!(DOC_TYPES as readonly string[]).includes(docType)) {
    return NextResponse.json(
      { error: `doc_type must be one of: ${DOC_TYPES.join(", ")} (the documents Sunny's text names).` },
      { status: 400 }
    );
  }
  if (taxYear !== null && (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100)) {
    return NextResponse.json({ error: "tax_year must be a year" }, { status: 400 });
  }
  if (!status) status = docType === "W-9" ? "received" : "pending";
  if (!(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${STATUSES.join(", ")}.` },
      { status: 400 }
    );
  }
  if (status === "issued" && docType !== "1099-K") {
    return NextResponse.json({ error: "Only a 1099-K can be recorded as issued." }, { status: 400 });
  }
  if (status === "issued" && !documentUrl) {
    return NextResponse.json(
      {
        error:
          "An issued 1099-K record needs the issued form's document_url. Use the 1099-K generation action on this desk to produce one in-platform; IRS filing is not performed by the platform.",
      },
      { status: 400 }
    );
  }
  if (docType === "1099-K" && taxYear === null) {
    return NextResponse.json({ error: "A 1099-K record needs its tax_year." }, { status: 400 });
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
        `INSERT INTO public.seller_tax_documents
           (tenant_id, seller_id, doc_type, tax_year, document_url, status)
         VALUES ($1, $2::uuid, $3, $4, $5, $6)
         RETURNING id`,
        [tenant, sellerId, docType, taxYear, documentUrl, status]
      );
      if (!rows[0]) throw new Error("Tax document insert did not land");
      await writeSellerAudit(c, {
        tenantId: tenant,
        sellerId,
        actorId,
        ipAddress,
        action: "tax_document.recorded",
        entityType: "seller_tax_document",
        entityId: rows[0].id ? String(rows[0].id) : null,
        afterState: { doc_type: docType, tax_year: taxYear, status, document_url: documentUrl },
      });
      const { rows: full } = await c.query(
        `SELECT ${DOC_COLS} ${FROM} WHERE d.tenant_id = $1 AND d.id = $2::uuid`,
        [tenant, rows[0].id]
      );
      return { kind: "ok" as const, document: full[0] };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (out.kind === "no_seller") {
      return NextResponse.json({ error: "Seller not found in this tenant" }, { status: 404 });
    }
    return NextResponse.json({ document: out.document }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: "tax document record failed" }, { status: 500 });
  }
}

// PATCH /api/admin/sellers/tax-documents { id, status, document_url? } ->
// record a paperwork-state transition (e.g. W-9 received -> verified;
// 1099-K pending -> issued, still requiring the artifact URL).
export async function PATCH(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const id = String(b.id || "");
  const status = String(b.status || "").trim().toLowerCase();
  const documentUrl = b.document_url ? String(b.document_url).slice(0, 1000) : undefined;

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "id must be a tax document uuid" }, { status: 400 });
  }
  if (!(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${STATUSES.join(", ")}.` },
      { status: 400 }
    );
  }
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);

  try {
    const out = await withPg(async (c) => {
      const { rows: before } = await c.query(
        `SELECT ${DOC_COLS} ${FROM} WHERE d.tenant_id = $1 AND d.id = $2::uuid`,
        [tenant, id]
      );
      if (before.length === 0) return { kind: "missing" as const };
      const row = before[0];
      if (status === "issued" && row.doc_type !== "1099-K") {
        return { kind: "bad_transition" as const, error: "Only a 1099-K can be recorded as issued." };
      }
      const effectiveUrl = documentUrl !== undefined ? documentUrl : row.document_url;
      if (status === "issued" && !effectiveUrl) {
        return {
          kind: "bad_transition" as const,
          error:
            "An issued 1099-K record needs the issued form's document_url. Use the 1099-K generation action on this desk to produce one in-platform; IRS filing is not performed by the platform.",
        };
      }
      const { rows: updated } = await c.query(
        `UPDATE public.seller_tax_documents
            SET status = $3, document_url = COALESCE($4, document_url)
          WHERE tenant_id = $1 AND id = $2::uuid
          RETURNING id`,
        [tenant, id, status, documentUrl ?? null]
      );
      if (updated.length === 0) return { kind: "missing" as const };
      await writeSellerAudit(c, {
        tenantId: tenant,
        sellerId: String(row.seller_id),
        actorId,
        ipAddress,
        action: "tax_document.status_changed",
        entityType: "seller_tax_document",
        entityId: id,
        beforeState: { status: row.status, doc_type: row.doc_type, tax_year: row.tax_year },
        afterState: { status, document_url: effectiveUrl ?? null },
      });
      const { rows: full } = await c.query(
        `SELECT ${DOC_COLS} ${FROM} WHERE d.tenant_id = $1 AND d.id = $2::uuid`,
        [tenant, id]
      );
      return { kind: "ok" as const, document: full[0] };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (out.kind === "missing") {
      return NextResponse.json({ error: "Tax document not found in this tenant" }, { status: 404 });
    }
    if (out.kind === "bad_transition") {
      return NextResponse.json({ error: out.error }, { status: 400 });
    }
    return NextResponse.json({ document: out.document });
  } catch (e: any) {
    return NextResponse.json({ error: "tax document update failed" }, { status: 500 });
  }
}
