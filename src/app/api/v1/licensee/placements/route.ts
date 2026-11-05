import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { authenticateLicensee } from "@/lib/licensee/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — active placements an advertiser can buy (shop, PDP, cart, home).
export async function GET(req: Request) {
  const auth = await authenticateLicensee(req);
  if (!auth) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rows = await pgQueryStrict(
    `SELECT id, code, name, max_per_page, active
       FROM public.ad_placements WHERE active = true ORDER BY id ASC`,
  );
  return NextResponse.json({ placements: rows });
}
