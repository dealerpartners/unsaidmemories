import { NextRequest, NextResponse } from "next/server";
import { getOffers } from "@/lib/cms";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;
  const offers = await getOffers(status);
  return NextResponse.json({ offers });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { createOffer } = await import("@/lib/cms");
  if (!body.code || !body.name) {
    return NextResponse.json({ error: "code and name required" }, { status: 400 });
  }
  const offer = await createOffer(body);
  if (!offer) return NextResponse.json({ error: "Failed to create offer" }, { status: 500 });
  return NextResponse.json({ offer }, { status: 201 });
}
