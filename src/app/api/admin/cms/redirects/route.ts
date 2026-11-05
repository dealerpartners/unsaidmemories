import { NextRequest, NextResponse } from "next/server";
import { getRedirects } from "@/lib/cms";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET() {
  const redirects = await getRedirects();
  return NextResponse.json({ redirects });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { createRedirect } = await import("@/lib/cms");
  if (!body.from_url || !body.to_url) {
    return NextResponse.json({ error: "from_url and to_url required" }, { status: 400 });
  }
  const redirect = await createRedirect(body);
  if (!redirect) return NextResponse.json({ error: "Failed to create redirect" }, { status: 500 });
  return NextResponse.json({ redirect }, { status: 201 });
}
