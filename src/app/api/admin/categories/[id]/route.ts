/**
 * /api/admin/categories/[id]
 *
 * PATCH  — update name/description/sort_order/is_active/parent_id.
 *          Recomputes level from the parent; enforces 1–5.
 * DELETE — deactivates (is_active=false) by default — never destroys
 *          taxonomy without explicit opt-in. Pass ?hard=true for true delete.
 *          Refuses to hard-delete a category that still has children or
 *          products.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { requireAdminApi } from "@/lib/admin/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TENANT_ID = getTenantId();

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  try {
    const { id } = await ctx.params;
    const supabase = createServerClient();
    const body = await req.json().catch(() => ({}));

    const patch: Record<string, unknown> = {};
    if (typeof body?.name === "string" && body.name.trim()) patch.name = body.name.trim();
    if (body?.description !== undefined) patch.description = body.description ?? null;
    if (typeof body?.sortOrder === "number") patch.sort_order = body.sortOrder;
    if (typeof body?.is_active === "boolean") patch.is_active = body.is_active;

    if (body?.parent_id !== undefined) {
      const newParentId: string | null = body.parent_id ?? null;
      if (newParentId === id) {
        return NextResponse.json({ error: "A category cannot be its own parent" }, { status: 400 });
      }
      if (newParentId) {
        // Nor can it move UNDER one of its own subcategories — that would
        // loop the tree the storefront walks.
        const { data: all } = await supabase.from("categories").select("id, parent_id");
        const childrenOf = new Map<string, string[]>();
        for (const c of all ?? []) {
          if (!c.parent_id) continue;
          const list = childrenOf.get(c.parent_id) ?? [];
          list.push(c.id);
          childrenOf.set(c.parent_id, list);
        }
        const descendants = new Set<string>();
        const queue = [id];
        while (queue.length) {
          for (const child of childrenOf.get(queue.shift()!) ?? []) {
            if (!descendants.has(child)) { descendants.add(child); queue.push(child); }
          }
        }
        if (descendants.has(newParentId)) {
          return NextResponse.json(
            { error: "A category cannot be moved under one of its own subcategories" },
            { status: 400 },
          );
        }
      }
      let level = 1;
      if (newParentId) {
        const { data: parent } = await supabase
          .from("categories")
          .select("id, level")
          .eq("id", newParentId)
          .or(`tenant_id.eq.${TENANT_ID},tenant_id.is.null`)
          .single();
        if (!parent) return NextResponse.json({ error: "Parent category not found" }, { status: 404 });
        level = parent.level + 1;
      }
      if (level > 5) {
        return NextResponse.json({ error: "Category depth is limited to 5 levels" }, { status: 400 });
      }
      patch.parent_id = newParentId;
      patch.level = level;
    }

    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("categories")
      .update(patch)
      .eq("id", id)
      .or(`tenant_id.eq.${TENANT_ID},tenant_id.is.null`)
      .select("id, parent_id, level, name, slug, description, sort_order, is_active")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    // A move changes the whole subtree's depth — restamp the stored
    // levels below the moved category so they stay parent.level + 1.
    if (body?.parent_id !== undefined) {
      const { data: all } = await supabase.from("categories").select("id, parent_id, level");
      const byId = new Map((all ?? []).map((c: any) => [c.id, c]));
      const childrenOf = new Map<string, string[]>();
      for (const c of all ?? []) {
        if (!c.parent_id) continue;
        const list = childrenOf.get(c.parent_id) ?? [];
        list.push(c.id);
        childrenOf.set(c.parent_id, list);
      }
      const queue: Array<{ cid: string; level: number }> = [{ cid: id, level: data.level }];
      while (queue.length) {
        const { cid, level } = queue.shift()!;
        for (const child of childrenOf.get(cid) ?? []) {
          const row: any = byId.get(child);
          if (row && row.level !== level + 1) {
            await supabase.from("categories").update({ level: level + 1 }).eq("id", child);
          }
          queue.push({ cid: child, level: level + 1 });
        }
      }
    }

    return NextResponse.json({ ok: true, category: data });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update category" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  try {
    const { id } = await ctx.params;
    const supabase = createServerClient();
    const hard = req.nextUrl.searchParams.get("hard") === "true";

    if (!hard) {
      const { data, error } = await supabase
        .from("categories")
        .update({ is_active: false })
        .eq("id", id)
        .or(`tenant_id.eq.${TENANT_ID},tenant_id.is.null`)
        .select("id, is_active")
        .single();
      if (error || !data) {
        return NextResponse.json({ error: "Category not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, deactivated: true, category: data });
    }

    // Hard delete: refuse if children or products reference it.
    const { count: childCount } = await supabase
      .from("categories")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", id);
    if (childCount) {
      return NextResponse.json(
        { error: `Cannot delete: category has ${childCount} child categories` },
        { status: 409 }
      );
    }
    const { count: prodCount } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("category_id", id);
    if (prodCount) {
      return NextResponse.json(
        { error: `Cannot delete: ${prodCount} products are assigned to this category` },
        { status: 409 }
      );
    }
    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", id)
      .or(`tenant_id.eq.${TENANT_ID},tenant_id.is.null`);
    if (error) throw error;
    return NextResponse.json({ ok: true, deleted: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to delete category" },
      { status: 500 }
    );
  }
}
