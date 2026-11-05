import { NextRequest, NextResponse } from "next/server";
import { syncPrintfulTracking } from "@/lib/suppliers/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/cron/printful-tracking — CRON_SECRET-gated tracking sync.
// Polls Printful for open fulfillments and applies shipped effects
// (fulfillment tracking + ERP order status + history). Pattern copied from
// UnSaid Memories's cron routes (cj-inventory / cj tracking sync).
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncPrintfulTracking();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
