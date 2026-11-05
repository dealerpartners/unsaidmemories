import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/customer-auth";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/customers/me/notifications — the signed-in customer's
// in-app notifications (customer_notifications, keyed by "customerId"
// = the auth user id — the same identity checkout stamps on orders).
// Writers: the email hook (lib/email.ts), admin broadcasts, and the
// supplier-tracking applier (order shipped / delivered). Reads use the
// service-role client after requireCustomer(), the me/orders pattern:
// identity is the session check plus the explicit customerId filter.
export async function GET() {
  try {
    const auth = await requireCustomer();
    if (auth.error) return auth.error;
    const { user } = auth;
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from("customer_notifications")
      .select("id, type, title, body, link, relatedId, readAt, createdAt")
      .eq("customerId", user.id)
      .order("createdAt", { ascending: false })
      .limit(50);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const notifications = (data || []).map((n: any) => ({
      id: n.id,
      type: n.type ?? null,
      title: n.title ?? "",
      body: n.body ?? null,
      link: n.link ?? null,
      related_id: n.relatedId ?? null,
      read_at: n.readAt ?? null,
      created_at: n.createdAt ?? null,
    }));
    return NextResponse.json({
      notifications,
      unread: notifications.filter((n) => !n.read_at).length,
    });
  } catch (err: any) {
    console.error("[GET /api/customers/me/notifications]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load notifications." },
      { status: 500 }
    );
  }
}

// PATCH /api/customers/me/notifications — mark read.
// Body: { id } marks one; {} (or { all: true }) marks all of mine.
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireCustomer();
    if (auth.error) return auth.error;
    const { user } = auth;
    const supabase = createServerClient();
    const body = await req.json().catch(() => ({}) as any);
    const now = new Date().toISOString();

    let query = supabase
      .from("customer_notifications")
      .update({ readAt: now })
      .eq("customerId", user.id)
      .is("readAt", null);
    if (body?.id) query = query.eq("id", String(body.id));
    const { error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[PATCH /api/customers/me/notifications]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to update notifications." },
      { status: 500 }
    );
  }
}
