import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/gate";
import { getBlankWorkspace } from "@/lib/fabric/blanks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/catalog/blanks/[id] — one blank's workspace data. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { id } = await params;
  const ws = await getBlankWorkspace(id);
  if (!ws) return NextResponse.json({ error: "Blank not found." }, { status: 404 });
  return NextResponse.json(ws);
}
