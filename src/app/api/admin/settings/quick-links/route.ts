import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgExec, pgQuery } from "@/lib/pg";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/admin/settings/quick-links — CRUD for platform_quick_links, the
// tenant's admin quick links. This is the management path behind the
// palette's sys_view_quick_links (SA-107) and the Settings Overview's
// Quick Links card: until now the table could only be read, so the
// surface was honestly empty with no way to populate it.
//
// DELETE is a retire (is_active = false), not a row delete — the view
// only serves active links, and a retired link can be reactivated via
// PATCH. Reorder is PATCH with a new sort_order.

type QuickLinkRow = {
  id: string;
  label: string;
  url: string;
  icon: string | null;
  sort_order: number;
  opens_new_tab: boolean;
  is_active: boolean;
};

const SELECT = `SELECT id::text AS id, label, url, icon, sort_order, opens_new_tab, is_active
                  FROM public.platform_quick_links`;

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("administration", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const includeInactive = req.nextUrl.searchParams.get("all") === "1";
    const links = await pgQuery<QuickLinkRow>(
      `${SELECT} WHERE tenant_id = $1 ${includeInactive ? "" : "AND is_active = true"}
        ORDER BY sort_order, created_at`,
      [tenant],
    );
    // Built-in quick links (§4.0 Quick Links — Stripe Dashboard and
    // Video Tutorials were named in the tree but existed nowhere: the
    // Stripe dashboard link lived only inside Stripe Connections, and
    // no tutorials link existed at all). Built-ins are served with the
    // tenant's stored links unless the tenant already has a link with
    // the same label (theirs wins) — they are platform defaults, not
    // stored rows, so they never duplicate and can't be retired into a
    // broken state.
    const BUILTINS: QuickLinkRow[] = [
      { id: "builtin:stripe-dashboard", label: "Stripe Dashboard", url: "https://dashboard.stripe.com", icon: "stripe", sort_order: 900, opens_new_tab: true, is_active: true },
      { id: "builtin:video-tutorials", label: "Video Tutorials", url: "/learn", icon: "video", sort_order: 901, opens_new_tab: false, is_active: true },
    ];
    const storedLabels = new Set(links.map((l) => l.label.trim().toLowerCase()));
    const merged = includeInactive
      ? links
      : [...links, ...BUILTINS.filter((b) => !storedLabels.has(b.label.toLowerCase()))];
    return NextResponse.json({ links: merged, total: merged.length });
  } catch (err: any) {
    console.error("[GET /api/admin/settings/quick-links]", err);
    return NextResponse.json({ error: err?.message || "Failed to load quick links" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("administration", "write");
  if (gate) return gate;
  try {
    const body = await req.json().catch(() => ({}));
    const label = String(body.label || "").trim();
    const url = String(body.url || "").trim();
    if (!label || !url) {
      return NextResponse.json({ error: "label and url are required" }, { status: 400 });
    }
    const tenant = resolveTenantId(req);
    const actorId = await getActorIdFromRequest(req);
    const rows = await pgQuery<QuickLinkRow>(
      `INSERT INTO public.platform_quick_links
         (id, tenant_id, label, url, icon, sort_order, opens_new_tab, is_active, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4,
               COALESCE($5, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM public.platform_quick_links WHERE tenant_id = $1)),
               $6, true, $7::uuid, now(), now())
       RETURNING id::text AS id, label, url, icon, sort_order, opens_new_tab, is_active`,
      [
        tenant,
        label,
        url,
        body.icon ? String(body.icon) : null,
        body.sort_order !== undefined ? Number(body.sort_order) : null,
        body.opens_new_tab !== undefined ? body.opens_new_tab === true || body.opens_new_tab === "true" : true,
        actorId,
      ],
    );
    if (!rows[0]) return NextResponse.json({ error: "Quick link could not be created" }, { status: 500 });
    return NextResponse.json({ ok: true, link: rows[0] }, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/admin/settings/quick-links]", err);
    return NextResponse.json({ error: err?.message || "Failed to create quick link" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireModuleApi("administration", "write");
  if (gate) return gate;
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const tenant = resolveTenantId(req);
    const updated = await pgExec(
      `UPDATE public.platform_quick_links
          SET label = COALESCE($1, label),
              url = COALESCE($2, url),
              icon = COALESCE($3, icon),
              sort_order = COALESCE($4, sort_order),
              opens_new_tab = COALESCE($5, opens_new_tab),
              is_active = COALESCE($6, is_active),
              updated_at = now()
        WHERE id = $7::uuid AND tenant_id = $8`,
      [
        body.label !== undefined ? String(body.label) : null,
        body.url !== undefined ? String(body.url) : null,
        body.icon !== undefined ? String(body.icon) : null,
        body.sort_order !== undefined ? Number(body.sort_order) : null,
        body.opens_new_tab !== undefined ? body.opens_new_tab === true || body.opens_new_tab === "true" : null,
        body.is_active !== undefined ? body.is_active === true || body.is_active === "true" : null,
        id,
        tenant,
      ],
    );
    if (!updated) return NextResponse.json({ error: "Quick link not found" }, { status: 404 });
    const rows = await pgQuery<QuickLinkRow>(`${SELECT} WHERE id = $1::uuid AND tenant_id = $2`, [id, tenant]);
    return NextResponse.json({ ok: true, link: rows[0] ?? null });
  } catch (err: any) {
    console.error("[PATCH /api/admin/settings/quick-links]", err);
    return NextResponse.json({ error: err?.message || "Failed to update quick link" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireModuleApi("administration", "write");
  if (gate) return gate;
  try {
    const id = req.nextUrl.searchParams.get("id") || "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const tenant = resolveTenantId(req);
    const updated = await pgExec(
      `UPDATE public.platform_quick_links SET is_active = false, updated_at = now()
        WHERE id = $1::uuid AND tenant_id = $2`,
      [id, tenant],
    );
    if (!updated) return NextResponse.json({ error: "Quick link not found" }, { status: 404 });
    return NextResponse.json({ ok: true, retired: updated });
  } catch (err: any) {
    console.error("[DELETE /api/admin/settings/quick-links]", err);
    return NextResponse.json({ error: err?.message || "Failed to retire quick link" }, { status: 500 });
  }
}
