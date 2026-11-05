import { NextRequest, NextResponse } from "next/server";
import { getWebsiteSettingsRow } from "@/lib/cms";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getWebsiteSettingsRow();
  return NextResponse.json({ settings });
}
