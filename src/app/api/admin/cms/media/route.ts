import { NextRequest, NextResponse } from "next/server";
import { getMediaAssets, createMediaAsset } from "@/lib/cms";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!) : undefined;
  const assets = await getMediaAssets({ limit });
  return NextResponse.json({ assets });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!body.url || !body.mime_type) return NextResponse.json({ error: "url and mime_type required" }, { status: 400 });
  const asset = await createMediaAsset(body);
  return NextResponse.json({ asset }, { status: 201 });
}
