import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createServerClient } from "@/lib/supabase/server";
import { requireSupabase } from "@/lib/supabase/guard";

/**
 * PATCH /api/dashboard/webhooks/[id]
 * Body: { enabled?: boolean, label?: string, url?: string, events?: string | string[] }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const __sb = requireSupabase(); if (__sb) return __sb;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const patch: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.label === "string" && body.label.trim()) {
    patch.label = body.label.trim();
    patch.name = body.label.trim();
  }
  if (typeof body.url === "string" && /^https?:\/\//.test(body.url)) {
    patch.url = body.url.trim();
  }
  if (typeof body.events === "string" && body.events.trim()) {
    patch.events = body.events.split(",").map((s: string) => s.trim()).filter(Boolean);
  } else if (Array.isArray(body.events) && body.events.length > 0) {
    patch.events = body.events.filter((s): s is string => typeof s === "string" && s.length > 0);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "no valid fields to update" },
      { status: 400 },
    );
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("webhook_subscriptions")
    .update(patch)
    .eq("id", id)
    .select("id, enabled")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ webhook: data });
}

/**
 * DELETE /api/dashboard/webhooks/[id]
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const __sb = requireSupabase(); if (__sb) return __sb;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const supabase = await createServerClient();
  const { error } = await supabase
    .from("webhook_subscriptions")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
