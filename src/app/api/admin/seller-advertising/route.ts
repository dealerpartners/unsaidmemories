import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { withPgStrict } from "@/lib/crm/enterprise";
import { MASTER_TENANT_ID } from "@/lib/site-tenant";
import { requireModuleApi } from "@/lib/admin/gate";

export const dynamic = "force-dynamic";

/**
 * /api/admin/seller-advertising — the seller-advertising enrollment queue.
 *
 * Before ship-ads (2026-10-23), sellers could enroll through
 * /api/seller/advertising (a row in seller_advertising_enrollments,
 * status 'pending') but NOTHING reviewed the queue: there was no
 * admin list, and the can_advertise capability was a manual checkbox
 * in the admin user-permissions screen, disconnected from the
 * enrollment. An enrollment dead-ended at 'pending' forever.
 *
 * GET (module "sellers", read): every enrollment on the master tenant
 *   joined with the seller's display name and the current capability,
 *   pending first.
 * POST { enrollment_id, decision: "approved" | "declined" }
 *   (module "sellers", write): decides the enrollment. An approval
 *   also flips seller_capabilities.can_advertise = true for that
 *   seller (upsert on (tenant_id, seller_id), touching ONLY
 *   can_advertise — is_pro / can_bulk_import are preserved) — the
 *   flag the seller's own advertising surface already reads.
 */

interface QueueRow {
  id: string;
  seller_id: string;
  placement_keys: string[] | null;
  status: string;
  created_at: string;
  updated_at: string;
  display_name: string | null;
  legal_name: string | null;
  slug: string | null;
  seller_status: string | null;
  can_advertise: boolean | null;
}

export async function GET() {
  const gate = await requireModuleApi("sellers", "read");
  if (gate) return gate;
  try {
    const rows = await pgQueryStrict<QueueRow>(
      `SELECT e.id, e.seller_id, e.placement_keys, e.status, e.created_at, e.updated_at,
              s.display_name, s.legal_name, s.slug, s.status AS seller_status,
              c.can_advertise
         FROM public.seller_advertising_enrollments e
         JOIN public.sellers s ON s.id = e.seller_id
         LEFT JOIN public.seller_capabilities c
           ON c.seller_id = e.seller_id AND c.tenant_id = e.tenant_id
        WHERE e.tenant_id = $1
        ORDER BY CASE WHEN e.status = 'pending' THEN 0 ELSE 1 END, e.created_at DESC`,
      [MASTER_TENANT_ID],
    );
    return NextResponse.json({ enrollments: rows });
  } catch {
    return NextResponse.json({ error: "queue_unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const gate = await requireModuleApi("sellers", "write");
  if (gate) return gate;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const enrollmentId = String(body.enrollment_id ?? "").trim();
  const decision = String(body.decision ?? "").trim();
  if (!enrollmentId || (decision !== "approved" && decision !== "declined")) {
    return NextResponse.json({ error: "enrollment_id_and_decision_required" }, { status: 400 });
  }
  try {
    const result = await withPgStrict(async (client) => {
      const found = await client.query(
        `SELECT id, seller_id::text AS seller_id, tenant_id::text AS tenant_id, status
           FROM public.seller_advertising_enrollments
          WHERE id = $1::uuid AND tenant_id = $2::uuid`,
        [enrollmentId, MASTER_TENANT_ID],
      );
      const enrollment = found.rows[0] as
        | { id: string; seller_id: string; tenant_id: string; status: string }
        | undefined;
      if (!enrollment) return null;
      await client.query(
        `UPDATE public.seller_advertising_enrollments
            SET status = $2, updated_at = now()
          WHERE id = $1::uuid`,
        [enrollment.id, decision],
      );
      if (decision === "approved") {
        await client.query(
          `INSERT INTO public.seller_capabilities (tenant_id, seller_id, is_pro, can_advertise, can_bulk_import, status)
           VALUES ($1::uuid, $2::uuid, false, true, false, 'active')
           ON CONFLICT (tenant_id, seller_id)
           DO UPDATE SET can_advertise = true, updated_at = now()`,
          [enrollment.tenant_id, enrollment.seller_id],
        );
      }
      return { id: enrollment.id, seller_id: enrollment.seller_id, status: decision };
    });
    if (!result) {
      return NextResponse.json({ error: "enrollment_not_found" }, { status: 404 });
    }
    return NextResponse.json({ enrollment: result });
  } catch {
    return NextResponse.json({ error: "decision_unavailable" }, { status: 503 });
  }
}
