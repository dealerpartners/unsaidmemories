import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import Stripe from "stripe";

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return _stripe;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://unsaidmemories.com";

// ---------------------------------------------------------------------------
// POST /api/admin/payments/[id]/resend
// Creates a Stripe Checkout Session for a failed payment so the customer can
// retry. [id] is "internal-<uuid>" or "stripe-<pi_id>".
// Returns { payment_link, session_id }.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("payments", "write"); if (gate) return gate;
  const { id } = await params;

  let amountCents = 0;
  let currency = "usd";
  let customerEmail: string | null = null;
  let customerName: string | null = null;
  let description = "Payment retry — UnSaid Memories";

  try {
    if (id.startsWith("internal-")) {
      const internalId = id.replace("internal-", "");
      await withPg(async (client) => {
        const r = await client.query(
          `SELECT cp.amount, cp.currency, cp.payment_number,
                  cc.first_name, cc.last_name, cc.email
           FROM public.commerce_payments cp
           LEFT JOIN public.crm_customers cc ON cc.id = cp.customer_id
           WHERE cp.id = $1::uuid AND cp.tenant_id = $2 LIMIT 1`,
          [internalId, resolveTenantId(req)]
        );
        if (r.rows.length === 0) throw new Error("Payment not found");
        const row = r.rows[0];
        amountCents = Math.round(parseFloat(String(row.amount || "0")) * 100);
        currency = (row.currency || "usd").toLowerCase();
        customerEmail = row.email || null;
        customerName = [row.first_name, row.last_name].filter(Boolean).join(" ") || null;
        description = `Payment retry — ${row.payment_number || "UnSaid Memories"}`;
      });
    } else if (id.startsWith("stripe-")) {
      const piId = id.replace("stripe-", "");
      const stripe = getStripe();
      const pi = await stripe.paymentIntents.retrieve(piId);
      amountCents = pi.amount || 0;
      currency = (pi.currency || "usd").toLowerCase();
      customerEmail = (pi.receipt_email as string) || pi.metadata?.customer_email || null;
      customerName = pi.metadata?.customer_name || null;
      if (typeof pi.customer === "string" && pi.customer) {
        try {
          const c = await stripe.customers.retrieve(pi.customer) as Stripe.Customer;
          if (!c.deleted) { customerEmail = c.email || customerEmail; customerName = c.name || customerName; }
        } catch { /* best-effort */ }
      }
      description = `Payment retry — UnSaid Memories`;
    } else {
      return NextResponse.json({ error: "Invalid payment id" }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load payment" }, { status: 404 });
  }

  if (amountCents <= 0) {
    return NextResponse.json({ error: "Invalid amount for retry" }, { status: 400 });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency,
      customer_email: customerEmail || undefined,
      line_items: [
        {
          price_data: {
            currency,
            unit_amount: amountCents,
            product_data: { name: description },
          },
          quantity: 1,
        },
      ],
      metadata: {
        retry_of: id,
        customer_name: customerName || "",
        tenant_id: resolveTenantId(req),
      },
      success_url: `${SITE_URL}/shop?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/shop?checkout=cancelled`,
    });
    return NextResponse.json({
      payment_link: session.url,
      session_id: session.id,
      amount: amountCents / 100,
      currency: currency.toUpperCase(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Stripe: ${e?.message || "failed to create session"}` }, { status: 502 });
  }
}
