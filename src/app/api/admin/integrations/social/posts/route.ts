import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdminApi } from "@/lib/admin/gate";
import { createPost, listPosts } from "@/lib/integrations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/integrations/social/posts?from&to&productId — the queue
// and calendar feed, each post with its per-network delivery rows.
export async function GET(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const url = new URL(req.url);
  const db = createServerClient();
  const posts = await listPosts(db, {
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    productId: url.searchParams.get("productId") ?? undefined,
  });
  return NextResponse.json({ posts });
}

// POST /api/admin/integrations/social/posts — create a post from a
// published product (or free-standing): share now, schedule, or draft.
// Body: { caption, mediaUrls, productId, productUrl, targets: [{network, accountId}], scheduledAt, publishNow }
export async function POST(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const db = createServerClient();
  try {
    const id = await createPost(db, {
      caption: String(body.caption ?? ""),
      mediaUrls: Array.isArray(body.mediaUrls) ? body.mediaUrls.map(String) : [],
      productId: body.productId ?? null,
      productUrl: body.productUrl ?? null,
      targets: Array.isArray(body.targets)
        ? body.targets.map((t: any) => ({ network: String(t.network), accountId: t.accountId ?? null }))
        : [],
      scheduledAt: body.scheduledAt ?? null,
      publishNow: !!body.publishNow,
    });
    const posts = await listPosts(db, { productId: body.productId ?? undefined });
    return NextResponse.json({ ok: true, id, post: posts.find((p) => p.id === id) ?? null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create the post." },
      { status: 400 }
    );
  }
}
