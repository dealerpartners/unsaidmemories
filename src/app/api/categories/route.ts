/**
 * GET /api/categories
 *
 * Public full category tree (nested). Same tree shape as the admin
 * endpoint, but only active categories, no tenant internals.
 */
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TENANT_ID = getTenantId();

type CategoryRow = {
  id: string;
  parent_id: string | null;
  level: number;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number | null;
};

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("categories")
      .select("id, parent_id, level, name, slug, description, sort_order")
      .or(`tenant_id.eq.${TENANT_ID},tenant_id.is.null`)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;

    const rows = (data ?? []) as CategoryRow[];
    const byId = new Map<string, CategoryRow & { children: unknown[] }>();
    for (const r of rows) byId.set(r.id, { ...r, children: [] });
    const roots: unknown[] = [];
    for (const r of rows) {
      const node = byId.get(r.id)!;
      if (r.parent_id && byId.has(r.parent_id)) {
        (byId.get(r.parent_id)!.children as unknown[]).push(node);
      } else {
        roots.push(node);
      }
    }
    return NextResponse.json({ categories: roots, total: rows.length });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to list categories" },
      { status: 500 }
    );
  }
}
