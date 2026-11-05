import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { isAdmin } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/ads/broadcast — the W9 platform-to-advertisers
 * notification broadcast. Inserts one ad_notifications row per active
 * ad_accounts row (so every billing account the platform serves sees
 * the message in its notifications feed — the same feed
 * GET /api/ads/notifications reads for the licensee). Body:
 *   { type?: 'info'|'warning'|'success'|'billing'|'policy',
 *     title, body?, metadata? }
 * type defaults to 'info'. title is required (≤140 chars). Returns the
 * count of rows inserted (one per account). Admin only.
 */
const TYPES = ["info", "warning", "success", "billing", "policy"];

export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const title = String(body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "title_required" }, { status: 400 });
  }
  if (title.length > 140) {
    return NextResponse.json({ error: "title_too_long" }, { status: 400 });
  }
  const type = TYPES.includes(String(body.type))
    ? String(body.type)
    : "info";
  const text = body.body != null ? String(body.body).slice(0, 4000) : null;
  const metadata = body.metadata != null ? JSON.stringify(body.metadata) : null;

  try {
    // One insert per active account via a single INSERT...SELECT — no
    // N+1, no client-side loop, atomic in one statement.
    const rows = await pgQueryStrict<{ id: string }>(
      `INSERT INTO public.ad_notifications (account_id, type, title, body, metadata)
       SELECT id, $1, $2, $3, $4::jsonb
         FROM public.ad_accounts
        WHERE status = 'active'
       RETURNING id`,
      [type, title, text, metadata ?? "{}"],
    );
    return NextResponse.json({
      ok: true,
      delivered: rows.length,
      type,
      title,
    });
  } catch {
    return NextResponse.json(
      { error: "broadcast_unavailable" },
      { status: 503 },
    );
  }
}
