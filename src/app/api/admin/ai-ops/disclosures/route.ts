import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg, withPgStrict } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";

export const dynamic = "force-dynamic";

// J6 · AI Disclosures — public.ai_disclosures (created live, migration
// record 20261061; the data graph's J6 store: Seller + Customer + Telemed,
// each sees own). Registry rows are PLATFORM records (tenant_id NULL): a
// disclosure is authored once, per audience — tag is the feature tag the
// surfaces key on (e.g. kinnect-ai-tele-triage), body is the disclosure
// copy, version bumps on edit (the ai_prompts idiom), status
// active/archived.
//
// ACCEPTANCE LOG: seller acknowledgments are recorded in
// public.seller_ai_disclosures (feature-keyed, wired on the seller track);
// customer acknowledgments in public.customer_ai_disclosure_acks (POST
// /api/customer/ai-disclosures) and telemedicine acknowledgments in
// public.telemed_ai_disclosure_acks (POST /api/telemed/ai-disclosures) —
// both stores from migration 20261109, read fail-soft until it lands.

const AUDIENCES = ["seller", "customer", "telemedicine"];
const COLS = `id, tenant_id, tag, audience, title, body, version, status, created_at, updated_at`;

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  try {
    const out = await withPg(async (c) => {
      const { rows: disclosures } = await c.query(
        `SELECT ${COLS} FROM public.ai_disclosures
          WHERE tenant_id IS NULL OR tenant_id = $1
          ORDER BY audience, tag, version DESC LIMIT 300`,
        [tenant],
      );
      const { rows: acceptanceLog } = await c.query(
        `SELECT d.id, d.feature, d.acknowledged_at, d.seller_id, s.business_name AS seller_name
           FROM public.seller_ai_disclosures d
           LEFT JOIN public.sellers s ON s.id = d.seller_id
          WHERE d.tenant_id = $1
          ORDER BY d.acknowledged_at DESC LIMIT 300`,
        [tenant],
      );
      let customerLog: any[] = [];
      try {
        const { rows } = await c.query(
          `SELECT a.id, a.feature, a.acknowledged_at, a.customer_id,
                  NULLIF(TRIM(COALESCE(cu."firstName", '') || ' ' || COALESCE(cu."lastName", '')), '') AS customer_name,
                  cu.email AS customer_email
             FROM public.customer_ai_disclosure_acks a
             LEFT JOIN public.customers cu ON cu.id = a.customer_id
            WHERE a.tenant_id = $1
            ORDER BY a.acknowledged_at DESC LIMIT 300`,
          [tenant],
        );
        customerLog = rows;
      } catch (e: any) {
        // Store not applied yet (42P01 undefined table / 3F000 bad schema)
        // reads as an empty log; real query failures surface.
        if (e?.code !== "42P01" && e?.code !== "3F000") throw e;
      }
      let telemedLog: any[] = [];
      try {
        const { rows } = await c.query(
          `SELECT a.id, a.feature, a.acknowledged_at, a.actor_type, a.user_id,
                  v.display_name AS actor_name
             FROM public.telemed_ai_disclosure_acks a
             LEFT JOIN clinical.veterinarians v ON v.tenant_id = a.tenant_id AND v.user_id = a.user_id
            WHERE a.tenant_id = $1
            ORDER BY a.acknowledged_at DESC LIMIT 300`,
          [tenant],
        );
        telemedLog = rows;
      } catch (e: any) {
        // Store not applied yet (42P01 undefined table / 3F000 bad schema)
        // reads as an empty log; real query failures surface.
        if (e?.code !== "42P01" && e?.code !== "3F000") throw e;
      }
      return {
        disclosures,
        acceptanceLog,
        customerLog,
        telemedLog,
        acceptanceNote:
          "Acknowledgments are recorded per audience: sellers in seller_ai_disclosures, customers in customer_ai_disclosure_acks, telemedicine actors (vet/pharmacy) in telemed_ai_disclosure_acks — each written by that audience's own surface at the moment of acceptance.",
      };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai disclosures list failed" }, { status: 500 });
  }
}

// POST /api/admin/ai-ops/disclosures -> author a disclosure (platform record)
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const tenant = resolveTenantId(req);
  const tag = String(b.tag || "").trim();
  const audience = String(b.audience || "").trim();
  if (!tag) return NextResponse.json({ error: "tag is required (the feature tag the surfaces key on)" }, { status: 400 });
  if (!AUDIENCES.includes(audience)) {
    return NextResponse.json({ error: `audience must be one of: ${AUDIENCES.join(", ")}` }, { status: 400 });
  }
  const title = b.title ? String(b.title) : null;
  const body = b.body ? String(b.body) : null;
  const actorId = await getActorIdFromRequest(req);
  try {
    const out = await withPgStrict(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO public.ai_disclosures (tenant_id, tag, audience, title, body, version, status)
         VALUES (NULL, $1, $2, $3, $4, 1, 'active') RETURNING ${COLS}`,
        [tag, audience, title, body],
      );
      if (!rows[0]) throw new Error("AI disclosure insert did not land");
      await writeSellerAudit(c, {
        tenantId: tenant,
        actorId,
        action: "ai_disclosure.created",
        entityType: "ai_disclosure",
        entityId: rows[0].id,
        afterState: { tag, audience },
        ipAddress: requestIp(req),
      });
      return { disclosure: rows[0] };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "ai disclosure create failed" }, { status: 500 });
  }
}
