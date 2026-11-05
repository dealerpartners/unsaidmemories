import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, withPgStrict } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";
import { FEE_TYPES } from "@/lib/sellers/accrual";

export const dynamic = "force-dynamic";

// Marketplace fee schedules on public.seller_fee_schedules (exists live —
// verified 2026-10-13; the admin Fees page previously claimed the backend
// "has not been configured", which was stale). A row with seller_id NULL is
// the platform-wide default for that fee type; category_id NULL means all
// categories. Schedules carry effective_from / effective_to dates so a
// change applies to future orders without rewriting history.

const COLS = `f.id, f.seller_id, s.display_name AS seller_name, f.category_id,
              f.fee_type, f.rate::float AS rate, f.flat_amount::float AS flat_amount,
              f.effective_from, f.effective_to, f.created_at`;

// GET /api/admin/fees -> real fee schedules for the tenant
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  try {
    const out = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT ${COLS}
           FROM public.seller_fee_schedules f
           LEFT JOIN public.sellers s ON s.id = f.seller_id AND s.tenant_id = f.tenant_id
          WHERE f.tenant_id = $1
          ORDER BY f.created_at DESC LIMIT 200`,
        [tenant]
      );
      return { schedules: rows };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: "fee schedules list failed" }, { status: 500 });
  }
}

// POST /api/admin/fees -> create a fee schedule
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("sellers", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);

  const feeType = String(b.fee_type || "").trim();
  if (!feeType) return NextResponse.json({ error: "fee_type is required" }, { status: 400 });
  // Fee validation (E2): the accrual resolves charges per canonical fee
  // type (lib/sellers/accrual FEE_TYPES). A schedule written under any
  // other fee_type could never be charged — it would sit in the table
  // as a silent no-op — so the desk refuses it at write time.
  if (!(FEE_TYPES as readonly string[]).includes(feeType)) {
    return NextResponse.json(
      { error: `fee_type must be one of: ${FEE_TYPES.join(", ")} — the fee types the accrual can charge.` },
      { status: 400 }
    );
  }

  const rate = b.rate === null || b.rate === undefined || b.rate === "" ? null : Number(b.rate);
  const flat = b.flat_amount === null || b.flat_amount === undefined || b.flat_amount === "" ? null : Number(b.flat_amount);
  if (rate !== null && Number.isNaN(rate)) return NextResponse.json({ error: "rate must be a number" }, { status: 400 });
  if (flat !== null && Number.isNaN(flat)) return NextResponse.json({ error: "flat_amount must be a number" }, { status: 400 });
  if (rate === null && flat === null) {
    return NextResponse.json({ error: "A schedule needs a rate, a flat amount, or both." }, { status: 400 });
  }
  const sellerId = b.seller_id ? String(b.seller_id) : null;
  const categoryId = b.category_id ? String(b.category_id) : null;
  const from = b.effective_from ? String(b.effective_from) : null;
  const to = b.effective_to ? String(b.effective_to) : null;
  const actorId = await getActorIdFromRequest(req);
  const ipAddress = requestIp(req);

  try {
    const out = await withPgStrict(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO public.seller_fee_schedules
           (tenant_id, seller_id, category_id, fee_type, rate, flat_amount, effective_from, effective_to)
         VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7::date, $8::date)
         RETURNING id`,
        [tenant, sellerId, categoryId, feeType, rate, flat, from, to]
      );
      const { rows: full } = await c.query(
        `SELECT ${COLS}
           FROM public.seller_fee_schedules f
           LEFT JOIN public.sellers s ON s.id = f.seller_id AND s.tenant_id = f.tenant_id
          WHERE f.id = $1`,
        [rows[0].id]
      );
      await writeSellerAudit(c, {
        tenantId: tenant, sellerId, actorId, ipAddress,
        action: "fee_schedule.created", entityType: "seller_fee_schedule",
        entityId: rows[0].id ? String(rows[0].id) : null,
        afterState: {
          fee_type: feeType, rate, flat_amount: flat,
          effective_from: from, effective_to: to, category_id: categoryId,
        },
      });
      if (!full[0]) throw new Error("fee schedule re-read did not land");
      return { schedule: full[0] };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: "fee schedule create failed" }, { status: 500 });
  }
}
