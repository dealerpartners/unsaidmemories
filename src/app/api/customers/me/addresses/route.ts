import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/customer-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/customers/me/addresses — list the customer's saved addresses.
// Default address first, then most recently created.
export async function GET() {
  try {
    const auth = await requireCustomer();
    if (auth.error) return auth.error;
    const { supabase, user } = auth;

    const { data, error } = await supabase
      .from("customer_addresses")
      .select("*")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ addresses: data || [], total: (data || []).length });
  } catch (err: any) {
    console.error("[GET /api/customers/me/addresses]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load addresses." },
      { status: 500 }
    );
  }
}

// POST /api/customers/me/addresses — add a saved address.
// Body: { label?, first_name?, last_name?, company?, line1, line2?, city,
//         state?, postal_code, country_code?, phone?, is_default? }
// If is_default is true, all other addresses are unset as default.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireCustomer();
    if (auth.error) return auth.error;
    const { supabase, user } = auth;

    const body = await req.json().catch(() => null);
    const line1 = String(body?.line1 || "").trim();
    const city = String(body?.city || "").trim();
    const postal_code = String(body?.postal_code || "").trim();
    const country_code = String(body?.country_code || "US").trim().toUpperCase();

    if (!line1 || !city || !postal_code) {
      return NextResponse.json(
        { error: "line1, city, and postal_code are required." },
        { status: 400 }
      );
    }

    const is_default = !!body?.is_default;

    if (is_default) {
      await supabase
        .from("customer_addresses")
        .update({ is_default: false })
        .eq("user_id", user.id);
    }

    const { data, error } = await supabase
      .from("customer_addresses")
      .insert({
        user_id: user.id,
        label: body?.label ? String(body.label).trim() : null,
        first_name: body?.first_name ? String(body.first_name).trim() : null,
        last_name: body?.last_name ? String(body.last_name).trim() : null,
        company: body?.company ? String(body.company).trim() : null,
        line1,
        line2: body?.line2 ? String(body.line2).trim() : null,
        city,
        state: body?.state ? String(body.state).trim() : null,
        postal_code,
        country_code,
        phone: body?.phone ? String(body.phone).trim() : null,
        is_default,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, address: data }, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/customers/me/addresses]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to add address." },
      { status: 500 }
    );
  }
}
