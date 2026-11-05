import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/newsletter — the newsletter subscriber list for the
 * admin Newsletter page: rows from public.newsletter_subscribers
 * (tenant-scoped, newest first, up to 500). The table carries
 * confirmation as confirmed_at (nullable), mapped here to the boolean
 * the page renders. This replaces the page's former fetch of
 * /api/cms/newsletter, an endpoint that does not exist in this codebase
 * (pre-existing dead wiring, carried at HEAD) — same read the Website
 * Analytics page performs server-side against the same table.
 */
export async function GET() {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const db = createServerClient();
  const tenantId = getTenantId();
  const { data, error } = await db
    .from("newsletter_subscribers")
    .select("id, email, source, confirmed_at, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(
    (data ?? []).map((s) => ({
      id: s.id,
      email: s.email,
      source: s.source,
      confirmed: s.confirmed_at != null,
      created_at: s.created_at,
    })),
  );
}
