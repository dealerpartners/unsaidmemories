import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// POST /api/admin/disputes/sync
// Pulls disputes from Stripe and upserts them into commerce_disputes.
// Idempotent per Stripe dispute id. Honest 503 when Stripe isn't configured.
export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("refunds_disputes", "write");
  if (gate) return gate;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json(
      { error: "Stripe is not configured (STRIPE_SECRET_KEY missing) — cannot sync disputes" },
      { status: 503 },
    );
  }

  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey);
    const list = await stripe.disputes.list({ limit: 100 });

    const result = await withPg(async (client) => {
      const tenant = resolveTenantId(req);
      let synced = 0;
      // commerce_disputes.status CHECK allows only open / under_review /
      // won / lost / accepted — Stripe's raw statuses (needs_response,
      // warning_needs_response, …) would die on the constraint, so map
      // them onto the local lifecycle before writing.
      const mapStatus = (s: string | null | undefined): string => {
        switch (s) {
          case "under_review":
          case "warning_under_review":
            return "under_review";
          case "won":
          case "warning_closed":
            return "won";
          case "lost":
          case "charge_refunded":
            return "lost";
          case "accepted":
            return "accepted";
          default:
            return "open"; // needs_response, warning_needs_response, unknown
        }
      };
      for (const d of list.data) {
        const amount = (d.amount || 0) / 100;
        const localStatus = mapStatus(d.status);
        const upd = await client.query(
          `UPDATE public.commerce_disputes
              SET reason = $1, status = $2, amount = $3::numeric, updated_at = now()
            WHERE tenant_id = $4 AND processor_dispute_id = $5`,
          [d.reason || "unknown", localStatus, amount.toFixed(2), tenant, d.id],
        );
        if ((upd.rowCount || 0) === 0) {
          await client.query(
            `INSERT INTO public.commerce_disputes
               (id, tenant_id, dispute_number, reason, status, amount,
                processor_dispute_id, opened_at, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::numeric, $6,
                     to_timestamp($7), now(), now())`,
            [
              tenant,
              `DIS-${String(d.id).slice(3, 11).toUpperCase()}`,
              d.reason || "unknown",
              localStatus,
              amount.toFixed(2),
              d.id,
              d.created || Math.floor(Date.now() / 1000),
            ],
          );
        }
        synced += 1;
      }
      return { synced, fetched: list.data.length, hasMore: list.has_more };
    });

    return NextResponse.json({ ok: true, ...(result || { synced: 0, fetched: 0 }) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Stripe dispute sync failed" }, { status: 502 });
  }
}
