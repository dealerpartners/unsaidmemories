import { NextRequest, NextResponse } from "next/server";
import { getDesignTokens } from "@/lib/cms";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") ?? undefined;
  const tokens = await getDesignTokens(category);
  return NextResponse.json({ tokens });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { createDesignToken } = await import("@/lib/cms");
  if (!body.category || !body.token_key || !body.token_value) {
    return NextResponse.json({ error: "category, token_key, and token_value required" }, { status: 400 });
  }
  const token = await createDesignToken(body);
  if (!token) return NextResponse.json({ error: "Failed to create token" }, { status: 500 });
  return NextResponse.json({ token }, { status: 201 });
}
