import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/customer-auth";
import { createServerClient } from "@/lib/supabase";
import { deleteSavedCard, getAuthorizeNetConfig } from "@/lib/authorize-net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/customers/me/cards/[id] — remove a saved card: deleted
// at the gateway first, then marked removed on our row.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCustomer();
  if (auth.error) return auth.error;
  const { id } = await params;
  try {
    const sb = createServerClient();
    const { data: row } = await sb
      .from("commerce_customer_payment_methods")
      .select("*")
      .eq("id", id)
      .eq("provider", "authorize_net")
      .eq("metadata->>auth_user_id", auth.user.id)
      .maybeSingle();
    if (!row) {
      return NextResponse.json({ error: "That card was not found." }, { status: 404 });
    }
    if (row.provider_customer_id && row.provider_token) {
      const cfg = await getAuthorizeNetConfig();
      await deleteSavedCard({
        cfg,
        customerProfileId: String(row.provider_customer_id),
        paymentProfileId: String(row.provider_token),
      });
    }
    const { error } = await sb
      .from("commerce_customer_payment_methods")
      .update({ status: "removed", is_default: false })
      .eq("id", row.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "That card could not be removed." },
      { status: 500 },
    );
  }
}
