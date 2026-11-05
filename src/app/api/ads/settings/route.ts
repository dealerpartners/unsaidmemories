import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { getCurrentUser } from "@/lib/auth/server";
import { ensureDeveloperContext } from "@/lib/devportal-server";
import { ensureAdAccount } from "@/lib/ads-server";
import { MASTER_TENANT_ID } from "@/lib/site-tenant";

export const dynamic = "force-dynamic";

/**
 * /api/ads/settings — account settings documents (ad_account_settings).
 * One row per (account, kind); `settings` is the JSON document the
 * matching surface edits. Kinds in use:
 *   targeting_defaults — Z2 default targeting controls
 *   marketing          — 2.6 marketing settings
 *   branding           — 2.7 branding settings
 *   notifications      — AC4 notification preferences
 *   companion          — Z7 audio-visual companion behavior
 * GET ?kind= returns one document; without kind, all of them.
 * PUT { kind, settings } upserts the document.
 */
const KINDS = ["targeting_defaults", "marketing", "branding", "notifications", "companion", "general", "audience_controls", "brand_safety", "billing"];

async function accountFor(user: Parameters<typeof ensureDeveloperContext>[0]) {
  const ctx = await ensureDeveloperContext(user);
  return ensureAdAccount(ctx.organizationId, ctx.tenantId ?? MASTER_TENANT_ID, ctx.organizationName);
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const kind = new URL(req.url).searchParams.get("kind");
  try {
    const account = await accountFor(user);
    if (kind) {
      const rows = await pgQueryStrict<{ settings: unknown }>(
        `SELECT settings FROM public.ad_account_settings
          WHERE account_id = $1 AND kind = $2 LIMIT 1`,
        [account.id, kind],
      );
      return NextResponse.json({ kind, settings: rows[0]?.settings ?? {} });
    }
    const rows = await pgQueryStrict<{ kind: string; settings: unknown }>(
      `SELECT kind, settings FROM public.ad_account_settings WHERE account_id = $1`,
      [account.id],
    );
    const all: Record<string, unknown> = {};
    for (const r of rows) all[r.kind] = r.settings;
    return NextResponse.json({ settings: all });
  } catch {
    return NextResponse.json({ error: "settings_unavailable" }, { status: 503 });
  }
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const kind = String(body.kind ?? "");
  if (!KINDS.includes(kind))
    return NextResponse.json({ error: "invalid_kind" }, { status: 400 });
  const settings = body.settings && typeof body.settings === "object" ? body.settings : {};
  try {
    const account = await accountFor(user);
    const existing = await pgQueryStrict<{ id: string }>(
      `SELECT id FROM public.ad_account_settings WHERE account_id = $1 AND kind = $2 LIMIT 1`,
      [account.id, kind],
    );
    if (existing[0]) {
      await pgQueryStrict(
        `UPDATE public.ad_account_settings SET settings = $3::jsonb, updated_at = now()
          WHERE account_id = $1 AND kind = $2`,
        [account.id, kind, JSON.stringify(settings)],
      );
    } else {
      await pgQueryStrict(
        `INSERT INTO public.ad_account_settings (account_id, kind, settings)
         VALUES ($1, $2, $3::jsonb)`,
        [account.id, kind, JSON.stringify(settings)],
      );
    }
    return NextResponse.json({ saved: true, kind, settings });
  } catch {
    return NextResponse.json({ error: "settings_save_unavailable" }, { status: 503 });
  }
}
