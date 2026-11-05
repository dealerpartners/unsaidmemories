import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdminApi } from "@/lib/admin/gate";
import { createAuthClient } from "@/lib/supabase/server";
import {
  approvePost,
  cancelPost,
  deletePost,
  dispatchPost,
  reschedulePost,
} from "@/lib/integrations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/admin/integrations/social/posts/[id] — calendar + queue
// actions. Body: { action: "reschedule", scheduledAt } |
// { action: "cancel" } | { action: "approve" } | { action: "publish-now" }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const db = createServerClient();
  try {
    switch (body.action) {
      case "reschedule": {
        if (!body.scheduledAt) throw new Error("scheduledAt is required.");
        await reschedulePost(db, id, String(body.scheduledAt));
        return NextResponse.json({ ok: true });
      }
      case "cancel":
        await cancelPost(db, id);
        return NextResponse.json({ ok: true });
      case "approve": {
        const auth = await createAuthClient();
        const {
          data: { user },
        } = await auth.auth.getUser();
        if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
        await approvePost(db, id, user.id);
        return NextResponse.json({ ok: true });
      }
      case "publish-now": {
        const result = await dispatchPost(db, id);
        return NextResponse.json({ ok: true, ...result });
      }
      default:
        return NextResponse.json({ error: `Unknown action "${body.action}".` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Action failed." },
      { status: 400 }
    );
  }
}

// DELETE /api/admin/integrations/social/posts/[id] — remove a draft,
// canceled, or failed post.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const { id } = await params;
  const db = createServerClient();
  try {
    await deletePost(db, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed." },
      { status: 400 }
    );
  }
}
