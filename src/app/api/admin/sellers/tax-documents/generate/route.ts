import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// E3 · 1099-K GENERATION.
// Computes each seller's reportable gross for a tax year from the recorded
// money path — public.seller_orders.total over the seller's non-cancelled,
// non-refunded orders in the year — and writes:
//   1. a generation record (public.seller_1099k_generations, migration
//      20261087) carrying the computed figures + filing_status, and
//   2. the register row in seller_tax_documents (doc_type '1099-K') whose
//      document_url points at the generated form view for that record.
// Re-running generation for the same (seller, year) recomputes and updates
// the same rows — it never duplicates them.
// FILING HONESTY: generation produces the form from recorded data. The
// platform does not transmit to the IRS; filing_status stays 'not_filed'
// until a real filing integration records otherwise.
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const GEN_COLS = `
  g.id, g.seller_id, s.display_name AS seller_name,
  (s.tax_id_last4 IS NOT NULL) AS tax_id_on_file,
  g.tax_year, g.gross_amount::float AS gross_amount, g.transaction_count,
  g.basis, g.filing_status, g.tax_document_id, g.generated_at, g.updated_at
`;
const GEN_FROM = `
  FROM public.seller_1099k_generations g
  JOIN public.sellers s ON s.id = g.seller_id AND s.tenant_id = g.tenant_id
`;

// GET ?id=<generation uuid>  -> one generation (the form view's data)
// GET ?tax_year=<yyyy>       -> all generations for a year in this tenant
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const id = (req.nextUrl.searchParams.get("id") || "").trim();
  const taxYearRaw = (req.nextUrl.searchParams.get("tax_year") || "").trim();
  if (id && !UUID_RE.test(id)) {
    return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  }
  const taxYear = taxYearRaw ? Number(taxYearRaw) : null;
  if (taxYearRaw && (!Number.isInteger(taxYear) || taxYear! < 2000 || taxYear! > 2100)) {
    return NextResponse.json({ error: "tax_year must be a year" }, { status: 400 });
  }
  if (!id && taxYear === null) {
    return NextResponse.json({ error: "id or tax_year is required" }, { status: 400 });
  }
  try {
    const out = await withPg(async (c) => {
      if (id) {
        const { rows } = await c.query(
          `SELECT ${GEN_COLS} ${GEN_FROM} WHERE g.tenant_id = $1 AND g.id = $2::uuid`,
          [tenant, id]
        );
        return { generation: rows[0] ?? null };
      }
      const { rows } = await c.query(
        `SELECT ${GEN_COLS} ${GEN_FROM} WHERE g.tenant_id = $1 AND g.tax_year = $2
          ORDER BY s.display_name`,
        [tenant, taxYear]
      );
      return { generations: rows };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json(
      { error: "1099-K generations failed (is migration 20261087 applied?)" },
      { status: 500 }
    );
  }
}

// POST { tax_year } -> generate (or regenerate) 1099-K records for every
// seller with reportable activity in the year. Sellers with zero included
// orders are reported as skipped, never given a zero form.
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const taxYear = Number(b.tax_year);
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) {
    return NextResponse.json({ error: "tax_year must be a year" }, { status: 400 });
  }
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);

  try {
    const out = await withPg(async (c) => {
      const { rows: totals } = await c.query(
        `SELECT so.seller_id::text AS seller_id, s.display_name AS seller_name,
                COALESCE(SUM(so.total), 0)::float AS gross_amount,
                count(*)::int AS transaction_count
           FROM public.seller_orders so
           JOIN public.sellers s ON s.id = so.seller_id AND s.tenant_id = so.tenant_id
          WHERE so.tenant_id = $1
            AND so.created_at >= make_date($2, 1, 1)
            AND so.created_at < make_date($2 + 1, 1, 1)
            AND lower(so.status) NOT IN ('cancelled', 'canceled', 'refunded')
          GROUP BY so.seller_id, s.display_name
          ORDER BY s.display_name`,
        [tenant, taxYear]
      );
      const { rows: allSellers } = await c.query(
        `SELECT id::text AS seller_id, display_name FROM public.sellers
          WHERE tenant_id = $1 ORDER BY display_name`,
        [tenant]
      );
      const activeIds = new Set(totals.map((t: any) => t.seller_id));
      const results: any[] = [];
      for (const t of totals) {
        const { rows: gen } = await c.query(
          `INSERT INTO public.seller_1099k_generations
             (tenant_id, seller_id, tax_year, gross_amount, transaction_count, generated_by)
           VALUES ($1, $2::uuid, $3, $4, $5, $6)
           ON CONFLICT (tenant_id, seller_id, tax_year) DO UPDATE
             SET gross_amount = EXCLUDED.gross_amount,
                 transaction_count = EXCLUDED.transaction_count,
                 generated_by = EXCLUDED.generated_by,
                 updated_at = now()
           RETURNING id`,
          [tenant, t.seller_id, taxYear, t.gross_amount, t.transaction_count, actorId]
        );
        const generationId = String(gen[0].id);
        const formUrl = `/admin/sellers/tax/1099k/${generationId}`;
        const { rows: existing } = await c.query(
          `SELECT id FROM public.seller_tax_documents
            WHERE tenant_id = $1 AND seller_id = $2::uuid
              AND doc_type = '1099-K' AND tax_year = $3
            ORDER BY created_at DESC LIMIT 1`,
          [tenant, t.seller_id, taxYear]
        );
        let documentId: string;
        if (existing[0]) {
          documentId = String(existing[0].id);
          await c.query(
            `UPDATE public.seller_tax_documents
                SET status = 'issued', document_url = $3
              WHERE tenant_id = $1 AND id = $2::uuid`,
            [tenant, documentId, formUrl]
          );
        } else {
          const { rows: ins } = await c.query(
            `INSERT INTO public.seller_tax_documents
               (tenant_id, seller_id, doc_type, tax_year, document_url, status)
             VALUES ($1, $2::uuid, '1099-K', $3, $4, 'issued')
             RETURNING id`,
            [tenant, t.seller_id, taxYear, formUrl]
          );
          documentId = String(ins[0].id);
        }
        await c.query(
          `UPDATE public.seller_1099k_generations SET tax_document_id = $3::uuid
            WHERE tenant_id = $1 AND id = $2::uuid`,
          [tenant, generationId, documentId]
        );
        await writeSellerAudit(c, {
          tenantId: tenant,
          sellerId: t.seller_id,
          actorId,
          ipAddress,
          action: "tax_document.1099k_generated",
          entityType: "seller_tax_document",
          entityId: documentId,
          afterState: {
            tax_year: taxYear,
            gross_amount: t.gross_amount,
            transaction_count: t.transaction_count,
            generation_id: generationId,
            filing_status: "not_filed",
          },
        });
        results.push({
          seller_id: t.seller_id,
          seller_name: t.seller_name,
          outcome: "generated",
          gross_amount: t.gross_amount,
          transaction_count: t.transaction_count,
          generation_id: generationId,
          document_id: documentId,
          form_url: formUrl,
        });
      }
      for (const s of allSellers) {
        if (!activeIds.has(s.seller_id)) {
          results.push({
            seller_id: s.seller_id,
            seller_name: s.display_name,
            outcome: "skipped_no_activity",
          });
        }
      }
      return { tax_year: taxYear, results };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json(
      { error: "1099-K generation failed (is migration 20261087 applied?)" },
      { status: 500 }
    );
  }
}
