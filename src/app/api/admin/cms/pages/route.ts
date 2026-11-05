import { NextRequest, NextResponse } from "next/server";
import { getPages } from "@/lib/cms";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET() {
  const pages = await getPages();
  return NextResponse.json({ pages });
}
