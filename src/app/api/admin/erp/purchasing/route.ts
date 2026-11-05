import { NextRequest, NextResponse } from "next/server";
import { requireAdminActor } from "@/lib/admin/gate";
import { createServerClient } from "@/lib/supabase";
import { PLATFORM_TENANT_ID } from "@/lib/admin/gate";
import { listVendors, listPurchaseBills, receiveStock } from "@/lib/orders/erp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/erp/purchasing — vendors + purchase bills (the PO record).
export async function GET() {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  try {
    const [vendors, bills] = await Promise.all([listVendors(), listPurchaseBills()]);
    return NextResponse.json({ vendors, bills });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/admin/erp/purchasing
//  { action: "create_vendor", legalName, email?, phone?, paymentTermsDays? }
//  { action: "create_po", vendorId, billNumber?, dueDate?, lines: [{description, quantity, unitCost, skuId?}] }
//  { action: "receive_po", billId, warehouseId } — receiving posts stock for lines carrying a skuId.
export async function POST(req: NextRequest) {
  const gate = await requireAdminActor();
  if ("error" in gate) return gate.error;
  const body = await req.json().catch(() => null);
  const sb = createServerClient();
  try {
    if (body?.action === "create_vendor") {
      if (!body.legalName) return NextResponse.json({ error: "legalName is required" }, { status: 400 });
      const { data, error } = await sb.from("acct_vendors").insert({
        tenant_id: PLATFORM_TENANT_ID, legal_name: body.legalName, email: body.email || null,
        phone: body.phone || null, currency: "USD", payment_terms_days: body.paymentTermsDays ?? 30,
        is_active: true, vendor_number: `V-${Date.now().toString(36).toUpperCase()}`,
      }).select("*").single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ vendor: data }, { status: 201 });
    }
    if (body?.action === "create_po") {
      if (!body.vendorId || !Array.isArray(body.lines) || !body.lines.length) {
        return NextResponse.json({ error: "vendorId and at least one line are required" }, { status: 400 });
      }
      const total = body.lines.reduce((s: number, l: any) => s + Number(l.quantity) * Number(l.unitCost), 0);
      // acct_ap_bills.entity_id is NOT NULL — resolve it from the chart of accounts.
      const { data: coa } = await sb.from("acct_chart_of_accounts").select("entity_id")
        .eq("tenant_id", PLATFORM_TENANT_ID).limit(1).maybeSingle();
      if (!coa?.entity_id) throw new Error("no accounting entity exists yet — seed the chart of accounts first");
      const { data: bill, error } = await sb.from("acct_ap_bills").insert({
        tenant_id: PLATFORM_TENANT_ID, entity_id: coa.entity_id, vendor_id: body.vendorId,
        bill_number: body.billNumber || `PO-${Date.now().toString(36).toUpperCase()}`,
        status: "open", subtotal: total, total, amount_paid: 0, currency: "USD",
        bill_date: new Date().toISOString().slice(0, 10), due_date: body.dueDate || null, source_system: "purchase_order", created_by: gate.actor.userId,
      }).select("*").single();
      if (error) throw new Error(error.message);
      const { data: cogs } = await sb.from("acct_chart_of_accounts").select("id")
        .eq("tenant_id", PLATFORM_TENANT_ID).eq("code", "5000").maybeSingle();
      const { error: lineErr } = await sb.from("acct_ap_bill_lines").insert(body.lines.map((l: any, i: number) => ({
        tenant_id: PLATFORM_TENANT_ID, bill_id: bill.id, line_no: i + 1, description: l.description,
        quantity: Number(l.quantity), unit_cost: Number(l.unitCost),
        line_subtotal: Number(l.quantity) * Number(l.unitCost),
        item_ref: l.skuId || null, expense_account_id: cogs?.id || null, dimensions: {},
      })));
      if (lineErr) throw new Error(lineErr.message);
      return NextResponse.json({ bill }, { status: 201 });
    }
    if (body?.action === "receive_po") {
      if (!body.billId || !body.warehouseId) return NextResponse.json({ error: "billId and warehouseId are required" }, { status: 400 });
      const { data: lines } = await sb.from("acct_ap_bill_lines").select("*").eq("bill_id", body.billId);
      const received: string[] = [];
      for (const line of lines || []) {
        const skuId = line.item_ref;
        if (!skuId) continue;
        await receiveStock({
          skuId, warehouseId: body.warehouseId, quantity: Number(line.quantity),
          unitCost: Number(line.unit_cost), actorId: gate.actor.userId,
          reference: `Receiving against PO bill ${body.billId}`,
        });
        received.push(skuId);
      }
      await sb.from("acct_ap_bills").update({ status: "received" }).eq("id", body.billId);
      return NextResponse.json({ receivedSkus: received });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
