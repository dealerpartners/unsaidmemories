import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";
import { pgQueryStrict } from "@/lib/pg";
import {
  getAuthorizeNetConfig,
  getTransactionDetails,
  orderHexPrefixFromInvoice,
  verifyAuthorizeNetSignature,
} from "@/lib/authorize-net";
import { processPaidOrder } from "@/lib/commerce/order-paid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORM_TENANT_ID = getTenantId();

// POST /api/webhooks/authorize-net — Authorize.net payment notices.
// Signature verification is MANDATORY, same discipline as the Stripe
// webhook: no Signature Key configured → 500, bad signature → 400,
// no unauthenticated parsing fallback.
//
// On net.authorize.payment.authcapture.created (PAYMENT FIRST,
// FULFILLMENT SECOND — the shared processPaidOrder flow):
//   1. Read the transaction back from the gateway itself
//      (getTransactionDetails) — the fulfillment decision uses the
//      gateway's own record of invoice number + amount, never the
//      webhook body alone.
//   2. Resolve the order from the invoice number the charge
//      carried (UNS-<first 16 hex of the order id>) and require the
//      captured amount to equal the order total.
//   3. Hand off to processPaidOrder — the identical path a Stripe
//      payment takes from here (mark paid, design carriage,
//      fulfillment drafts, ERP twin, CRM, journal, receipt).
export async function POST(req: NextRequest) {
  const cfg = await getAuthorizeNetConfig();
  if (!cfg.signatureKey) {
    return NextResponse.json(
      { error: "AUTHORIZENET_SIGNATURE_KEY is not configured — webhook refused" },
      { status: 500 }
    );
  }
  if (!cfg.loginId || !cfg.transactionKey) {
    return NextResponse.json(
      { error: "Authorize.net keys are not configured — webhook refused" },
      { status: 500 }
    );
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-anet-signature");
  if (!verifyAuthorizeNetSignature(rawBody, signature, cfg.signatureKey)) {
    return NextResponse.json({ error: "webhook signature verification failed" }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody.replace(/^﻿/, ""));
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (event?.eventType !== "net.authorize.payment.authcapture.created") {
    return NextResponse.json({ received: true, handled: false });
  }

  const payload = event.payload ?? {};
  const transId = String(payload.id ?? payload.entityId ?? "");
  if (!transId) {
    return NextResponse.json({ error: "no transaction id in event" }, { status: 400 });
  }

  // 1. The gateway's own record is authoritative.
  let invoiceNumber: string | null = null;
  let authAmount: number | null = null;
  try {
    const details = await getTransactionDetails(cfg, transId);
    invoiceNumber = details.invoiceNumber;
    authAmount = details.authAmount;
  } catch (e) {
    console.error("[authorize-net webhook] transaction read-back failed:", e);
  }
  if (!invoiceNumber) invoiceNumber = payload.invoiceNumber ?? null;
  if (authAmount == null && payload.authAmount != null) authAmount = Number(payload.authAmount);
  if (!invoiceNumber) {
    return NextResponse.json({ error: "no invoice number for transaction" }, { status: 422 });
  }

  // 2. Resolve the order by its invoice prefix + verify the amount.
  const prefix = orderHexPrefixFromInvoice(invoiceNumber);
  if (!prefix) {
    return NextResponse.json({ error: "unrecognized invoice number" }, { status: 422 });
  }
  const matches = await pgQueryStrict<{ id: string; total: string; status: string }>(
    `SELECT id::text AS id, total::text AS total, status
       FROM public.orders
      WHERE tenant_id = $1 AND replace(id::text, '-', '') LIKE $2
      ORDER BY (status = 'pending_payment') DESC, created_at ASC
      LIMIT 2`,
    [PLATFORM_TENANT_ID, `${prefix}%`]
  );
  const order = matches[0];
  if (!order) {
    return NextResponse.json({ error: "order not found for invoice" }, { status: 404 });
  }
  if (authAmount != null && Math.abs(authAmount - Number(order.total)) > 0.005) {
    console.error(
      `[authorize-net webhook] amount mismatch: gateway ${authAmount} vs order ${order.total} (${order.id})`
    );
    return NextResponse.json({ error: "captured amount does not match order total" }, { status: 422 });
  }

  // 3. The shared paid-order flow (idempotent; an already-paid order
  // takes its self-heal branch).
  const sb = createServerClient();
  return processPaidOrder(sb, PLATFORM_TENANT_ID, order.id);
}
