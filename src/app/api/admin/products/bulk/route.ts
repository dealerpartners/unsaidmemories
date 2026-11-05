/**
 * POST /api/admin/products/bulk
 *
 * Bulk actions over admin products — adapted from the unsaidmemories
 * `inventory/actions` bulk-action pattern.
 *
 * Body: { action: "publish" | "unpublish" | "delete", ids: string[] }
 * - publish:   status -> published
 * - unpublish: status -> archived
 * - delete:    archives (never hard-deletes; pass hard:true for true delete)
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { requireAdminApi } from "@/lib/admin/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TENANT_ID = getTenantId();

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  try {
    const supabase = createServerClient();
    const body = await req.json().catch(() => ({}));
    const action: string = body?.action ?? "";
    const ids: string[] = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : [];
    const hard: boolean = body?.hard === true;

    if (!["publish", "unpublish", "delete"].includes(action)) {
      return NextResponse.json(
        { error: "action must be one of: publish, unpublish, delete" },
        { status: 400 }
      );
    }
    if (!ids.length) return NextResponse.json({ error: "ids is required" }, { status: 400 });
    if (ids.length > 500) return NextResponse.json({ error: "max 500 ids per call" }, { status: 400 });

    let affected = 0;
    if (action === "delete" && hard) {
      const { error, count } = await supabase
        .from("products")
        .delete({ count: "exact" })
        .in("id", ids)
        .eq("tenant_id", TENANT_ID);
      if (error) throw error;
      affected = count ?? 0;
    } else {
      const status = action === "publish" ? "published" : "archived";
      const { error, count } = await supabase
        .from("products")
        .update({ status }, { count: "exact" })
        .in("id", ids)
        .eq("tenant_id", TENANT_ID);
      if (error) throw error;
      affected = count ?? 0;
    }

    return NextResponse.json({ ok: true, action, affected, requested: ids.length });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bulk action failed" },
      { status: 500 }
    );
  }
}
