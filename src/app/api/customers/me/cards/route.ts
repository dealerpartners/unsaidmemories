import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/customer-auth";
import { createServerClient } from "@/lib/supabase";
import { PLATFORM_TENANT_ID } from "@/lib/admin/gate";
import {
  addPaymentProfileFromNonce,
  createCustomerProfileFromNonce,
  getAuthorizeNetConfig,
  getSavedCardDisplay,
  isAuthorizeNetConfigured,
} from "@/lib/authorize-net";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The customer's saved cards — Authorize.net customer profiles (CIM).
 * Card data never reaches this server: the browser tokenizes with
 * Accept.js and posts only the opaque nonce; the gateway stores the
 * card and returns profile ids, which is all we keep (in
 * commerce_customer_payment_methods with the masked display fields).
 * Rows are pinned to the account by metadata.auth_user_id — the
 * table's customer_id carries the CRM party id when one exists for
 * the email, so the admin record and the portal read the same card.
 */

function toCard(row: any) {
  return {
    id: row.id,
    brand: row.brand,
    last4: row.last4,
    expMonth: row.exp_month,
    expYear: row.exp_year,
    isDefault: Boolean(row.is_default),
  };
}

async function listRows(sb: any, userId: string) {
  const { data } = await sb
    .from("commerce_customer_payment_methods")
    .select("*")
    .eq("provider", "authorize_net")
    .eq("status", "active")
    .eq("metadata->>auth_user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  return data ?? [];
}

// GET /api/customers/me/cards — the signed-in customer's saved cards.
export async function GET() {
  const auth = await requireCustomer();
  if (auth.error) return auth.error;
  try {
    const sb = createServerClient();
    const rows = await listRows(sb, auth.user.id);
    return NextResponse.json({ cards: rows.map(toCard), total: rows.length });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not load your cards." }, { status: 500 });
  }
}

// POST /api/customers/me/cards — save a card from an Accept.js nonce.
// Body: { data_descriptor, data_value, exp_month, exp_year, is_default? }
export async function POST(req: NextRequest) {
  const auth = await requireCustomer();
  if (auth.error) return auth.error;
  const { user } = auth;
  try {
    if (!(await isAuthorizeNetConfigured())) {
      return NextResponse.json(
        { error: "Card saving is not switched on yet." },
        { status: 503 },
      );
    }
    const payload = await req.json().catch(() => null);
    const dataDescriptor = String(payload?.data_descriptor || "");
    const dataValue = String(payload?.data_value || "");
    const expMonth = Number(payload?.exp_month);
    const expYear = Number(payload?.exp_year);
    if (!dataDescriptor || !dataValue) {
      return NextResponse.json({ error: "The card token is missing. Please try again." }, { status: 400 });
    }
    if (!(expMonth >= 1 && expMonth <= 12) || !(expYear >= 2000 && expYear <= 2200)) {
      return NextResponse.json({ error: "The card expiry looks wrong. Please check it." }, { status: 400 });
    }

    const cfg = await getAuthorizeNetConfig();
    const sb = createServerClient();
    const existing = await listRows(sb, user.id);
    const existingProfileId = existing.find((r: any) => r.provider_customer_id)?.provider_customer_id as
      | string
      | undefined;

    let customerProfileId: string;
    let paymentProfileId: string;
    if (existingProfileId) {
      customerProfileId = existingProfileId;
      paymentProfileId = await addPaymentProfileFromNonce({
        cfg,
        customerProfileId,
        dataDescriptor,
        dataValue,
      });
    } else {
      const created = await createCustomerProfileFromNonce({
        cfg,
        email: user.email ?? "",
        dataDescriptor,
        dataValue,
      });
      customerProfileId = created.customerProfileId;
      paymentProfileId = created.paymentProfileId;
    }

    const display = await getSavedCardDisplay({ cfg, customerProfileId, paymentProfileId }).catch(
      () => ({ brand: null, last4: null }),
    );

    // The CRM party id when the contact record already exists for
    // this email — the admin side reads the same row by it.
    let customerId: string = user.id;
    if (user.email) {
      const { data: crm } = await sb
        .from("crm_customers")
        .select("id")
        .eq("tenant_id", PLATFORM_TENANT_ID)
        .ilike("email", user.email)
        .is("merged_into_customer_id", null)
        .maybeSingle();
      if (crm?.id) customerId = crm.id;
    }

    const isDefault = existing.length === 0 || Boolean(payload?.is_default);
    if (isDefault) {
      await sb
        .from("commerce_customer_payment_methods")
        .update({ is_default: false })
        .eq("provider", "authorize_net")
        .eq("metadata->>auth_user_id", user.id);
    }

    const { data: row, error } = await sb
      .from("commerce_customer_payment_methods")
      .insert({
        tenant_id: PLATFORM_TENANT_ID,
        customer_id: customerId,
        provider: "authorize_net",
        provider_customer_id: customerProfileId,
        provider_token: paymentProfileId,
        method_type: "card",
        brand: display.brand,
        last4: display.last4,
        exp_month: expMonth,
        exp_year: expYear,
        is_default: isDefault,
        is_verified: true,
        verified_at: new Date().toISOString(),
        status: "active",
        metadata: { auth_user_id: user.id },
      })
      .select()
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ card: toCard(row) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "That card could not be saved." },
      { status: 500 },
    );
  }
}
