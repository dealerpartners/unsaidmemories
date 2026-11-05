import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, requireModuleApi } from "@/lib/admin/gate";
import { runHealthChecks } from "@/lib/admin/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const mod = await requireModuleApi("administration", "read");
  if (mod) return mod;
  const checks = await runHealthChecks(req.nextUrl.origin);
  return NextResponse.json({ checks, at: new Date().toISOString() });
}
