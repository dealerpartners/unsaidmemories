import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/gate";
import { listBlanks } from "@/lib/fabric/blanks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/catalog/blanks — the Blanks queue (Loop A of the play). */
export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const blanks = await listBlanks();
  return NextResponse.json({ blanks });
}
