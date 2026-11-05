import { NextRequest, NextResponse } from "next/server";
import { getAuditLog } from "@/lib/cms";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const entries = await getAuditLog(limit);
  return NextResponse.json({ entries });
}
