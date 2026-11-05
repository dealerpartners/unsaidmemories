import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/customer-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/customers/me/addresses/[id] — remove a saved address.
// Only the owning customer can delete their own address (enforced by
// user_id match; RLS is a second layer).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireCustomer();
    if (auth.error) return auth.error;
    const { supabase, user } = auth;

    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Address id is required." },
        { status: 400 }
      );
    }

    const { data: existing } = await supabase
      .from("customer_addresses")
      .select("id, is_default")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { error: "Address not found." },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from("customer_addresses")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    console.error("[DELETE /api/customers/me/addresses/[id]]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to delete address." },
      { status: 500 }
    );
  }
}
