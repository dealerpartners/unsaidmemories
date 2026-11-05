import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { tenantId } from "@/lib/accounting";

/** Gate every accounting API route through the System module's admin gate. */
export async function guard() {
  const res: any = await (requireAdminApi as any)();
  if (res && typeof res === "object" && "status" in res && res.status >= 400) return res as NextResponse;
  return null;
}

export async function ctx() {
  const db = createServerClient();
  const tenant = await tenantId(db);
  return { db, tenant };
}

export const ok = (data: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...data });
export const fail = (e: unknown, status = 400) =>
  NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status });

export async function body(req: Request) {
  try { return await req.json(); } catch { return {}; }
}
