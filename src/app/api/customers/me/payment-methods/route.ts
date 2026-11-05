import { NextResponse } from "next/server";
import { requireCustomer } from "@/lib/customer-auth";
import { listSavedCards } from "@/lib/stripe-customer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — the signed-in customer's saved cards (brand + last4 only). */
export async function GET() {
  const auth = await requireCustomer();
  if (auth.error) return auth.error;
  try {
    const cards = await listSavedCards({ id: auth.user.id, email: auth.user.email });
    return NextResponse.json({ cards });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Could not load your cards." }, { status: 500 });
  }
}
