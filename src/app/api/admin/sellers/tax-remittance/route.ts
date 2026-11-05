import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// E3 · Sales tax remittance — seller tax oversight leg.
// FINDING (schema read, 2026-10-16): NO accounting remittance store exists.
// The Accounting tax surface holds only acct_tax_rules (rates); there is no
// acct_tax_filings / remittance table anywhere to read filing state from.
// So migration 20261081 creates public.seller_tax_remittance_filings and
// this route is its recording surface, surfaced inside the sellers tax
// desk (/admin/sellers/tax) — seller tax oversight can now see filing state.
//
// ATTRIBUTION LIMIT (stated in the UI too): filings are PLATFORM-level.
// Tax actually collected is aggregated here from the real platform store
// commerce_sale_taxes (POS sale tax lines: jurisdiction, taxable_amount,
// tax_amount) — those rows carry no seller_id, and marketplace order tax
// is not attributed per seller in any store. This desk never invents a
// per-seller split: it shows platform collected-vs-remitted per
// jurisdiction/period alongside the filing register.
//
// Gate: "sellers". Tenancy: tenant_id is a predicate in every statement.
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["draft", "filed", "accepted", "amended"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const FILING_COLS = `
  f.id, f.jurisdiction, f.period_start, f.period_end,
  f.tax_collected::float AS tax_collected,
  f.amount_remitted::float AS amount_remitted,
  f.filed_at, f.confirmation_number, f.status, f.notes,
  f.created_at, f.updated_at
`;

function badDate(v: unknown): boolean {
  return typeof v !== "string" || !DATE_RE.test(v) || Number.isNaN(Date.parse(v));
}

// GET -> filings register + platform collected-tax context aggregated from
// commerce_sale_taxes per jurisdiction (all-time + per filing period is
// computed client-side from the period buckets returned here).
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  try {
    const out = await withPg(async (c) => {
      const { rows: filings } = await c.query(
        `SELECT ${FILING_COLS}
           FROM public.seller_tax_remittance_filings f
          WHERE f.tenant_id = $1
          ORDER BY f.period_end DESC, f.created_at DESC LIMIT 200`,
        [tenant]
      );
      // Platform collected tax, by jurisdiction + month, from the real POS
      // tax-line store. Fail-soft: if the store is absent in an environment
      // the register still serves, with collected = null (unknown, not 0).
      let collected: unknown[] | null = null;
      try {
        const { rows } = await c.query(
          `SELECT t.jurisdiction,
                  to_char(date_trunc('month', s.created_at), 'YYYY-MM') AS period_month,
                  COALESCE(SUM(t.taxable_amount), 0)::float AS taxable_amount,
                  COALESCE(SUM(t.tax_amount), 0)::float AS tax_collected,
                  COUNT(*)::int AS sale_tax_lines
             FROM public.commerce_sale_taxes t
             JOIN public.commerce_sales s ON s.id = t.sale_id AND s.tenant_id = $1
            WHERE s.tenant_id = $1
            GROUP BY t.jurisdiction, period_month
            ORDER BY period_month DESC, t.jurisdiction`,
          [tenant]
        );
        collected = rows;
      } catch {
        collected = null;
      }
      const { rows: jurisdictions } = await c.query(
        `SELECT DISTINCT jurisdiction FROM public.acct_tax_rules
          WHERE tenant_id = $1 AND is_active = true ORDER BY jurisdiction`,
        [tenant]
      );
      return { filings, collected, jurisdictions: jurisdictions.map((r) => r.jurisdiction) };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json({
      ...out,
      attribution:
        "Filings and collected-tax figures are platform-level. commerce_sale_taxes carries no seller attribution and no store attributes marketplace order tax per seller, so no per-seller remittance split is shown — it would be invented.",
    });
  } catch (e: any) {
    if (String(e?.message || "").includes("seller_tax_remittance_filings")) {
      return NextResponse.json(
        { error: "Remittance store not set up yet — apply migration 20261081.", filings: [], collected: null, jurisdictions: [] },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "remittance list failed" }, { status: 500 });
  }
}

// POST { jurisdiction, period_start, period_end, amount_remitted,
// tax_collected?, filed_at?, confirmation_number?, status?, notes? }
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const jurisdiction = String(b.jurisdiction || "").trim().slice(0, 120);
  const periodStart = b.period_start;
  const periodEnd = b.period_end;
  const amount = b.amount_remitted === "" || b.amount_remitted == null ? null : Number(b.amount_remitted);
  const collected = b.tax_collected === "" || b.tax_collected == null ? null : Number(b.tax_collected);
  const filedAt = b.filed_at ? String(b.filed_at) : null;
  const confirmation = b.confirmation_number ? String(b.confirmation_number).slice(0, 120) : null;
  const status = b.status ? String(b.status).trim().toLowerCase() : "draft";
  const notes = b.notes ? String(b.notes).slice(0, 2000) : null;

  if (!jurisdiction) return NextResponse.json({ error: "jurisdiction is required" }, { status: 400 });
  if (badDate(periodStart) || badDate(periodEnd)) {
    return NextResponse.json({ error: "period_start and period_end must be YYYY-MM-DD dates" }, { status: 400 });
  }
  if (String(periodEnd) < String(periodStart)) {
    return NextResponse.json({ error: "period_end must be on or after period_start" }, { status: 400 });
  }
  if (amount === null || !Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "amount_remitted must be a non-negative number" }, { status: 400 });
  }
  if (collected !== null && (!Number.isFinite(collected) || collected < 0)) {
    return NextResponse.json({ error: "tax_collected must be a non-negative number" }, { status: 400 });
  }
  if (!(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${STATUSES.join(", ")}` }, { status: 400 });
  }
  if ((status === "filed" || status === "accepted") && !filedAt) {
    return NextResponse.json({ error: "A filed/accepted remittance needs its filed_at date." }, { status: 400 });
  }
  if (filedAt && badDate(filedAt)) {
    return NextResponse.json({ error: "filed_at must be a YYYY-MM-DD date" }, { status: 400 });
  }
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);
  try {
    const out = await withPg(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO public.seller_tax_remittance_filings
           (tenant_id, jurisdiction, period_start, period_end, tax_collected,
            amount_remitted, filed_at, confirmation_number, status, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::uuid)
         RETURNING id`,
        [tenant, jurisdiction, periodStart, periodEnd, collected, amount, filedAt, confirmation, status, notes,
         actorId && UUID_RE.test(actorId) ? actorId : null]
      );
      if (!rows[0]) throw new Error("Tax remittance filing insert did not land");
      await writeSellerAudit(c, {
        tenantId: tenant, actorId, ipAddress,
        action: "tax_remittance.recorded", entityType: "seller_tax_remittance_filing",
        entityId: rows[0].id, afterState: { jurisdiction, periodStart, periodEnd, amount, status },
      });
      const { rows: full } = await c.query(
        `SELECT ${FILING_COLS} FROM public.seller_tax_remittance_filings f WHERE f.tenant_id = $1 AND f.id = $2::uuid`,
        [tenant, rows[0].id]
      );
      return { filing: full[0] };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: "remittance record failed" }, { status: 500 });
  }
}

// PATCH { id, status?, amount_remitted?, tax_collected?, filed_at?,
// confirmation_number?, notes? }
export async function PATCH(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const id = String(b.id || "");
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "id must be a filing uuid" }, { status: 400 });
  const status = b.status ? String(b.status).trim().toLowerCase() : null;
  if (status && !(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: `status must be one of: ${STATUSES.join(", ")}` }, { status: 400 });
  }
  if (b.filed_at && badDate(b.filed_at)) {
    return NextResponse.json({ error: "filed_at must be a YYYY-MM-DD date" }, { status: 400 });
  }
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);
  try {
    const out = await withPg(async (c) => {
      const { rows: before } = await c.query(
        `SELECT ${FILING_COLS} FROM public.seller_tax_remittance_filings f WHERE f.tenant_id = $1 AND f.id = $2::uuid`,
        [tenant, id]
      );
      if (before.length === 0) return { kind: "missing" as const };
      const row = before[0];
      const nextStatus = status ?? row.status;
      const nextFiledAt = b.filed_at !== undefined ? b.filed_at : row.filed_at;
      if ((nextStatus === "filed" || nextStatus === "accepted") && !nextFiledAt) {
        return { kind: "bad" as const, error: "A filed/accepted remittance needs its filed_at date." };
      }
      await c.query(
        `UPDATE public.seller_tax_remittance_filings
            SET status = $3,
                amount_remitted = COALESCE($4, amount_remitted),
                tax_collected = COALESCE($5, tax_collected),
                filed_at = COALESCE($6::date, filed_at),
                confirmation_number = COALESCE($7, confirmation_number),
                notes = COALESCE($8, notes),
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid`,
        [tenant, id, nextStatus,
         b.amount_remitted === "" || b.amount_remitted == null ? null : Number(b.amount_remitted),
         b.tax_collected === "" || b.tax_collected == null ? null : Number(b.tax_collected),
         b.filed_at || null,
         b.confirmation_number ? String(b.confirmation_number).slice(0, 120) : null,
         b.notes ? String(b.notes).slice(0, 2000) : null]
      );
      await writeSellerAudit(c, {
        tenantId: tenant, actorId, ipAddress,
        action: "tax_remittance.updated", entityType: "seller_tax_remittance_filing", entityId: id,
        beforeState: { status: row.status }, afterState: { status: nextStatus },
      });
      const { rows: full } = await c.query(
        `SELECT ${FILING_COLS} FROM public.seller_tax_remittance_filings f WHERE f.tenant_id = $1 AND f.id = $2::uuid`,
        [tenant, id]
      );
      return { kind: "ok" as const, filing: full[0] };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if (out.kind === "missing") return NextResponse.json({ error: "Filing not found in this tenant" }, { status: 404 });
    if (out.kind === "bad") return NextResponse.json({ error: out.error }, { status: 400 });
    return NextResponse.json({ filing: out.filing });
  } catch (e: any) {
    return NextResponse.json({ error: "remittance update failed" }, { status: 500 });
  }
}
