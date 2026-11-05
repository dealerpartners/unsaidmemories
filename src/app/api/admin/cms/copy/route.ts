import { NextRequest, NextResponse } from "next/server";
import { getGlobalCopy } from "@/lib/cms";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const locale = searchParams.get("locale") ?? "en-US";
  const copy = await getGlobalCopy(locale);
  return NextResponse.json({ copy });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { createGlobalCopy } = await import("@/lib/cms");
  if (!body.copy_key || !body.copy_value) {
    return NextResponse.json({ error: "copy_key and copy_value required" }, { status: 400 });
  }
  const item = await createGlobalCopy(body);
  if (!item) return NextResponse.json({ error: "Failed to create copy" }, { status: 500 });
  return NextResponse.json({ copy: item }, { status: 201 });
}
