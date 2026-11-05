import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, withPgStrict } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// ============================================================================
// /api/admin/taxes/rules — configurable tax jurisdictions (3.12 Taxes).
// Rates live in acct_tax_rules, not hardcoded in the UI.
// ============================================================================

const SEL = `id, jurisdiction, tax_type, state_code, rate, tax_code, classification, auto_calc, is_active, created_at`;

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const rows = await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT ${SEL} FROM public.acct_tax_rules WHERE tenant_id = $1 AND is_active = true ORDER BY tax_type, jurisdiction`,
      [tenant]
    );
    return rows;
  });
  // Table may not exist yet (owner runs tax-rules-schema.sql) — honest empty.
  return NextResponse.json({ rules: rows ?? [], tableMissing: rows === null });
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => ({}));
  const jurisdiction = String(body.jurisdiction || "").trim();
  if (!jurisdiction) return NextResponse.json({ error: "jurisdiction required" }, { status: 400 });
  const rate = Number(body.rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100)
    return NextResponse.json({ error: "rate must be 0–100" }, { status: 400 });
  try {
    const row = await withPgStrict(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO public.acct_tax_rules
           (tenant_id, jurisdiction, tax_type, state_code, rate, tax_code, classification, auto_calc)
         VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,true))
         RETURNING ${SEL}`,
        [tenant, jurisdiction, body.tax_type || "STATE_SALES_TAX",
         String(body.state_code || "TN").toUpperCase(), rate,
         body.tax_code || null, body.classification || "ALL_SALES",
         body.auto_calc === undefined ? true : !!body.auto_calc]
      );
      if (!rows[0]) throw new Error("tax rule insert did not land");
      return rows[0];
    });
    return NextResponse.json({ rule: row }, { status: 201 });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg.includes("acct_tax_rules")) return NextResponse.json({ error: "tax rules table not set up — run tax-rules-schema.sql" }, { status: 503 });
    return NextResponse.json({ error: "create failed" }, { status: 500 });
  }
}
