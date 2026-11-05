import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getAdminContext, PLATFORM_TENANT_ID, requireAdminApi } from "@/lib/admin/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cloud-synced workspace tabs (Sunny's session schema): the admin
 * shell's browser-style tabs restore on any device. The cloud copy
 * stores the tab SET (paths, titles, order, active tab); live form
 * state stays in the mounted tab frames on the device itself.
 */

export async function GET() {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ tabs: [], activeTabId: null });
  const db = createServerClient();
  const { data: session } = await db
    .from("user_workspace_sessions")
    .select("id, active_tab_id")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!session) return NextResponse.json({ tabs: [], activeTabId: null });
  const { data: tabs } = await db
    .from("user_session_tabs")
    .select("tab_id, title, module_path, params, tab_order, group_id, group_title")
    .eq("session_id", session.id)
    .order("tab_order", { ascending: true });
  return NextResponse.json({
    activeTabId: session.active_tab_id,
    tabs: (tabs ?? []).map((t: any) => ({
      id: t.tab_id,
      title: t.title,
      path: t.module_path,
      params: t.params ?? {},
      groupId: t.group_id,
      groupTitle: t.group_title,
    })),
  });
}

export async function PUT(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "No admin context" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const tabs: any[] = Array.isArray(body.tabs) ? body.tabs.slice(0, 15) : [];
  const activeTabId: string | null = typeof body.activeTabId === "string" ? body.activeTabId : null;
  const db = createServerClient();

  const { data: session, error: sErr } = await db
    .from("user_workspace_sessions")
    .upsert(
      { user_id: ctx.userId, active_tab_id: activeTabId, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    )
    .select("id")
    .single();
  if (sErr || !session) return NextResponse.json({ error: sErr?.message ?? "session failed" }, { status: 500 });

  await db.from("user_session_tabs").delete().eq("session_id", session.id);
  if (tabs.length) {
    const rows = tabs.map((t, i) => ({
      session_id: session.id,
      tab_id: String(t.id),
      title: String(t.title ?? "Tab").slice(0, 255),
      module_path: String(t.path ?? "/admin").slice(0, 512),
      params: t.params ?? {},
      form_data_cache: {},
      scroll_position: 0,
      tab_order: i,
      group_id: t.groupId ?? null,
      group_title: t.groupTitle ?? null,
    }));
    const { error } = await db.from("user_session_tabs").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // tenant marker kept for consistency with other admin tables
  void PLATFORM_TENANT_ID;
  return NextResponse.json({ ok: true });
}
