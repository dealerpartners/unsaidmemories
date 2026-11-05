import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { ensureDeveloperContext } from "@/lib/devportal-server";
import { ensureAdAccount } from "@/lib/ads-server";
import { MASTER_TENANT_ID } from "@/lib/site-tenant";

export const dynamic = "force-dynamic";

/**
 * /api/ads/notifications — the ad notification system (ad_notifications,
 * AC4). Rows are written by platform events (billing, verification,
 * campaign lifecycle); this route is the account's inbox: list +
 * mark-read. Preferences (which types arrive) live in
 * /api/ads/settings kind=notifications.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const ctx = await ensureDeveloperContext(user);
    const account = await ensureAdAccount(
      ctx.organizationId,
      ctx.tenantId ?? MASTER_TENANT_ID,
      ctx.organizationName,
    );
    const notifications = await pgQueryStrict(
      `SELECT id, type, title, body, read_at, metadata, created_at
         FROM public.ad_notifications
        WHERE account_id = $1 AND (user_id IS NULL OR user_id = $2)
        ORDER BY created_at DESC
        LIMIT 100`,
      [account.id, user.id],
    );
    const unread = notifications.filter((n) => !n.read_at).length;
    return NextResponse.json({ notifications, unread });
  } catch {
    return NextResponse.json({ error: "notifications_unavailable" }, { status: 503 });
  }
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  try {
    const ctx = await ensureDeveloperContext(user);
    const account = await ensureAdAccount(
      ctx.organizationId,
      ctx.tenantId ?? MASTER_TENANT_ID,
      ctx.organizationName,
    );
    if (body.all === true) {
      await pgQueryStrict(
        `UPDATE public.ad_notifications SET read_at = now()
          WHERE account_id = $1 AND read_at IS NULL AND (user_id IS NULL OR user_id = $2)`,
        [account.id, user.id],
      );
      return NextResponse.json({ marked: "all" });
    }
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
    const rows = await pgQueryStrict(
      `UPDATE public.ad_notifications SET read_at = now()
        WHERE id = $1 AND account_id = $2
        RETURNING id`,
      [id, account.id],
    );
    if (!rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ marked: id });
  } catch {
    return NextResponse.json({ error: "notification_update_unavailable" }, { status: 503 });
  }
}
