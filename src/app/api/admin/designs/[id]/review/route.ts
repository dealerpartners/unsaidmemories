import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/gate";
import { publishDesign, unpublishDesign } from "@/lib/fabric/publish";
import { revalidateShop } from "@/lib/admin/revalidate-shop";
import { resolveTemplate } from "@/lib/fabric/templates";
import { runPreflight } from "@/lib/fabric/preflight";

export const dynamic = "force-dynamic";

/**
 * The design lifecycle (architecture doc §1):
 *   draft → needs_review → ready_to_publish → published
 *   published → (unpublish) → ready_to_publish
 *   any → archived
 *
 * GET  — run preflight against the design's real supplier template and
 *        report the issues without changing state.
 * POST — { action: "submit" | "approve" | "publish" | "unpublish" | "archive" }
 *        submit/approve are gated by preflight errors.
 */

async function loadContext(db: ReturnType<typeof createServerClient>, id: string) {
  const { data: design, error } = await db
    .from("designs")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !design) return { design: null, template: null };
  let template: import("@/lib/fabric/templates").ResolvedTemplate | null = null;
  if (design.supplier_catalog_product_id) {
    const { data: product } = await db
      .from("supplier_catalog_products")
      .select("name, image_url")
      .eq("id", design.supplier_catalog_product_id)
      .single();
    const { data: variants } = await db
      .from("supplier_catalog_variants")
      .select("print_specs")
      .eq("supplier_catalog_product_id", design.supplier_catalog_product_id)
      .limit(20);
    if (product) {
      template = resolveTemplate(
        { name: product.name, image_url: product.image_url },
        variants ?? [],
      );
    }
  }
  return { design, template };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const db = createServerClient();
    const { design, template } = await loadContext(db, id);
    if (!design) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }
    const preflight = runPreflight(design, template);
    return NextResponse.json({ status: design.status, preflight, template });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action: string = body.action;
    const db = createServerClient();
    const { design, template } = await loadContext(db, id);
    if (!design) {
      return NextResponse.json({ error: "Design not found" }, { status: 404 });
    }

    const setStatus = async (status: string) => {
      const { error } = await db.from("designs").update({ status }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true, status });
    };

    switch (action) {
      case "submit": {
        if (!["draft", "publish_failed"].includes(design.status)) {
          return NextResponse.json(
            { error: `Cannot submit for review from status "${design.status}"` },
            { status: 409 },
          );
        }
        const preflight = runPreflight(design, template);
        if (!preflight.ok) {
          return NextResponse.json(
            { error: "Preflight failed", preflight },
            { status: 422 },
          );
        }
        return setStatus("needs_review");
      }
      case "approve": {
        if (design.status !== "needs_review") {
          return NextResponse.json(
            { error: `Cannot approve from status "${design.status}"` },
            { status: 409 },
          );
        }
        const preflight = runPreflight(design, template);
        if (!preflight.ok) {
          return NextResponse.json(
            { error: "Preflight failed", preflight },
            { status: 422 },
          );
        }
        return setStatus("ready_to_publish");
      }
      case "publish": {
        if (design.status !== "ready_to_publish") {
          return NextResponse.json(
            { error: `Cannot publish from status "${design.status}" — approve the design first` },
            { status: 409 },
          );
        }
        const result = await publishDesign(db, id);
        // The PDP route is ISR-cached (24h) — bust any cached 404 so
        // the product page is live the moment publish returns.
        try { revalidatePath(`/product/${result.productId}`); } catch { /* non-request context */ }
        revalidateShop();
        return NextResponse.json({ ok: true, status: "published", ...result });
      }
      case "unpublish": {
        if (design.status !== "published") {
          return NextResponse.json(
            { error: `Cannot unpublish from status "${design.status}"` },
            { status: 409 },
          );
        }
        await unpublishDesign(db, id);
        if (design.published_product_id) {
          try { revalidatePath(`/product/${design.published_product_id}`); } catch { /* non-request context */ }
        }
        revalidateShop();
        return NextResponse.json({ ok: true, status: "ready_to_publish" });
      }
      case "archive": {
        if (design.status === "published") await unpublishDesign(db, id);
        revalidateShop();
        return setStatus("archived");
      }
      default:
        return NextResponse.json(
          { error: `Unknown action "${action}"` },
          { status: 400 },
        );
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
