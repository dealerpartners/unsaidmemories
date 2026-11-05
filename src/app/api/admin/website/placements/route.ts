import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/gate";
import { listPlacements } from "@/lib/website-cms";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/website/placements — every page a banner or pop-up can
 * target: static pages, every shop category path from the taxonomy,
 * every collection from the database, every resolving relationship
 * page. Generated, never typed — a new category or collection appears
 * here on its own.
 */
export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const groups = await listPlacements();
  return NextResponse.json({ groups, total: groups.reduce((n, g) => n + g.items.length, 0) });
}
