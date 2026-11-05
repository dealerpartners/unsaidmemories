import { NextRequest, NextResponse } from "next/server";
import { getCampaigns } from "@/lib/cms";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;
  const campaigns = await getCampaigns(status);
  return NextResponse.json({ campaigns });
}
