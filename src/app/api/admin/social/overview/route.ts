import { NextResponse } from "next/server";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// /api/admin/social/overview — cross-seller oversight for the social
// module: connection counts, recent publish attempts, and the two queues
// that need a human (unknown outcomes, failed token refreshes), plus
// dead-lettered outbox events.
export async function GET() {
  const denied = await requireModuleApi("social", "read");
  if (denied) return denied;
  const out = await withPg(async (c) => {
    const accounts = await c.query(
      `SELECT a.platform, a.status, a.access_status, count(*)::int AS n,
              s.display_name AS seller_name
         FROM public.social_accounts a
         LEFT JOIN public.sellers s ON s.id = a.seller_id
        WHERE a.deleted_at IS NULL
        GROUP BY a.platform, a.status, a.access_status, s.display_name
        ORDER BY a.platform, n DESC LIMIT 200`);
    const attempts = await c.query(
      `SELECT at.id, at.started_at AS created_at, at.result AS outcome, at.error_code, at.error_message,
              t.platform, s.display_name AS seller_name
         FROM public.social_publish_attempts at
         JOIN public.social_post_targets t ON t.id = at.post_target_id
         JOIN public.social_posts p ON p.id = t.post_id
         LEFT JOIN public.sellers s ON s.id = p.seller_id
        ORDER BY at.created_at DESC LIMIT 50`);
    const unknown = await c.query(
      `SELECT t.id, t.platform, t.updated_at, s.display_name AS seller_name, p.body
         FROM public.social_post_targets t
         JOIN public.social_posts p ON p.id = t.post_id
         LEFT JOIN public.sellers s ON s.id = p.seller_id
        WHERE t.status = 'unknown' ORDER BY t.updated_at DESC LIMIT 50`);
    const refreshFailed = await c.query(
      `SELECT a.id, a.platform, a.display_name, a.last_refresh_error, s.display_name AS seller_name
         FROM public.social_accounts a
         LEFT JOIN public.sellers s ON s.id = a.seller_id
        WHERE a.access_status = 'refresh_failed' AND a.deleted_at IS NULL
        ORDER BY a.updated_at DESC LIMIT 50`);
    const dead = await c.query(
      `SELECT id, event_type, attempts, left(created_at::text, 19) AS created_at
         FROM public.social_outbox_events WHERE status = 'dead' ORDER BY created_at DESC LIMIT 50`);
    return { accounts: accounts.rows, attempts: attempts.rows, unknown: unknown.rows, refreshFailed: refreshFailed.rows, deadOutbox: dead.rows };
  });
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  return NextResponse.json(out);
}
