import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { isAdmin } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/ads/tiers/:id — the admin-owned write over a v2
 * delivery tier definition (ad_tiers). This is the lever the
 * frequency-caps read model promised: changing frequency_cap_daily
 * here changes the cap every campaign on that tier enforces at serve
 * the next time it reads the tier row. Edits: code (unique), name,
 * priority, max_ads_per_page, frequency_cap_daily, active. A tier is
 * NEVER deleted (campaigns reference it by FK and the rate-card ladder
 * depends on the code being stable); deactivation (active=false) is the
 * retire path, which stops new campaigns picking it while existing ones
 * keep serving. Admin only.
 */
const CODE_RE = /^[a-z0-9_]{1,20}$/;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  const push = (col: string, v: unknown) => {
    values.push(v);
    sets.push(`${col} = $${values.length + 1}`);
  };

  if (body.code !== undefined) {
    const code = String(body.code).trim().toLowerCase();
    if (!CODE_RE.test(code)) {
      return NextResponse.json({ error: "invalid_code" }, { status: 400 });
    }
    push("code", code);
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length > 50) {
      return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    }
    push("name", name);
  }
  if (body.priority !== undefined) {
    const p = Number(body.priority);
    if (!Number.isInteger(p) || p < 0 || p > 32767) {
      return NextResponse.json({ error: "invalid_priority" }, { status: 400 });
    }
    push("priority", p);
  }
  if (body.max_ads_per_page !== undefined) {
    const m = Number(body.max_ads_per_page);
    if (!Number.isInteger(m) || m < 0 || m > 32767) {
      return NextResponse.json(
        { error: "invalid_max_ads_per_page" },
        { status: 400 },
      );
    }
    push("max_ads_per_page", m);
  }
  if (body.frequency_cap_daily !== undefined) {
    const f = Number(body.frequency_cap_daily);
    if (!Number.isInteger(f) || f < 0 || f > 32767) {
      return NextResponse.json(
        { error: "invalid_frequency_cap_daily" },
        { status: 400 },
      );
    }
    push("frequency_cap_daily", f);
  }
  if (body.active !== undefined) {
    push("active", Boolean(body.active));
  }
  if (!sets.length) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  try {
    const updated = await pgQueryStrict(
      `UPDATE public.ad_tiers
          SET ${sets.join(", ")}
        WHERE id = $1
        RETURNING id::text AS id, code, name, priority,
                  max_ads_per_page, frequency_cap_daily, active`,
      [id, ...values],
    );
    if (!updated[0]) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ tier: updated[0] });
  } catch (err) {
    // unique(code) violation is the one expected constraint hit.
    const msg = String((err as Error)?.message ?? "");
    if (msg.includes("ad_tiers_code_key")) {
      return NextResponse.json({ error: "code_in_use" }, { status: 409 });
    }
    return NextResponse.json(
      { error: "tier_update_unavailable" },
      { status: 503 },
    );
  }
}
