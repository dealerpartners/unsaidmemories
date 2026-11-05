import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/customer-auth";
import { getAdvertiserForUser } from "@/lib/ads/advertiser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/customers/me/advertiser — has this account walked the
// advertiser path before? The account rail's Ad Center entry reads
// this so it can serve the right door: an existing advertiser goes
// straight into the Ad Center; a new one goes to get-started.
export async function GET() {
  try {
    const auth = await requireCustomer();
    if (auth.error) return auth.error;
    const advertiser = await getAdvertiserForUser(auth.user.id).catch(() => null);
    return NextResponse.json({ active: Boolean(advertiser) });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed." }, { status: 500 });
  }
}
