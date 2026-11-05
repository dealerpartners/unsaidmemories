import { NextRequest, NextResponse } from "next/server";
import { guard, ctx, body } from "../_shared";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";
import { round2, nextNumber, bookContext, todayISO } from "@/lib/accounting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 3-way match state, derived from the PO lines only (ordered vs
// received vs billed quantities) — never stored, never invented.
function matchState(qty: number, received: number, billed: number): string {
  if (qty <= 0) return "No lines";
  if (received >= qty && billed >= qty) return "3-Way Matched";
  if (billed > 0) return "Progress Billed";
  if (received >= qty) return "Received — Awaiting Bill";
  if (received > 0) return "Partially Received";
  return "Awaiting Receipt";
}

// GET /api/admin/accounting/purchase-orders — Purchases & Payables
// → Purchase Orders: every acct_ap_purchase_orders row with its
// vendor, lines, and received/billed percentages computed from
// acct_ap_purchase_order_lines at request time.
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const pos = await pgQuery<any>(
      `SELECT po.id::text AS id, po.po_number, po.order_date::text AS order_date,
              po.expected_date::text AS expected_date, po.currency, po.subtotal::text,
              po.tax_total::text, po.total::text, po.status::text AS status,
              v.id::text AS vendor_id, v.legal_name AS vendor_name
         FROM public.acct_ap_purchase_orders po
         JOIN public.acct_vendors v ON v.id = po.vendor_id
        WHERE po.tenant_id = $1
        ORDER BY po.order_date DESC, po.po_number DESC
        LIMIT 500`,
      [tenant],
    );
    const lines = pos.length
      ? await pgQuery<any>(
          `SELECT id::text AS id, purchase_order_id::text AS po_id, line_no, description,
                  quantity::text, unit_cost::text, received_quantity::text, billed_quantity::text,
                  expense_account_id::text AS expense_account_id
             FROM public.acct_ap_purchase_order_lines
            WHERE purchase_order_id = ANY($1::uuid[])
            ORDER BY purchase_order_id, line_no`,
          [pos.map((p) => p.id)],
        )
      : [];
    const linesByPo = new Map<string, any[]>();
    for (const l of lines) {
      const arr = linesByPo.get(l.po_id) || [];
      arr.push({
        id: l.id, lineNo: l.line_no, description: l.description,
        quantity: Number(l.quantity), unitCost: Number(l.unit_cost),
        receivedQuantity: Number(l.received_quantity), billedQuantity: Number(l.billed_quantity),
        expenseAccountId: l.expense_account_id,
      });
      linesByPo.set(l.po_id, arr);
    }
    const vendors = await pgQuery<any>(
      `SELECT id::text AS id, legal_name FROM public.acct_vendors
        WHERE tenant_id = $1 AND is_active = true ORDER BY legal_name`,
      [tenant],
    );
    const accounts = await pgQuery<any>(
      `SELECT id::text AS id, code, name FROM public.acct_chart_of_accounts
        WHERE tenant_id = $1 AND account_type = 'expense' AND is_active = true ORDER BY code`,
      [tenant],
    );
    return NextResponse.json({
      purchaseOrders: pos.map((p) => {
        const ls = linesByPo.get(p.id) || [];
        const qty = ls.reduce((s, l) => s + l.quantity, 0);
        const received = ls.reduce((s, l) => s + l.receivedQuantity, 0);
        const billed = ls.reduce((s, l) => s + l.billedQuantity, 0);
        return {
          id: p.id, poNumber: p.po_number, orderDate: p.order_date, expectedDate: p.expected_date,
          currency: p.currency || "USD", subtotal: Number(p.subtotal), taxTotal: Number(p.tax_total),
          total: Number(p.total), status: p.status, vendorId: p.vendor_id, vendorName: p.vendor_name,
          lines: ls,
          recvPct: qty > 0 ? Math.round((received / qty) * 100) : 0,
          billedPct: qty > 0 ? Math.round((billed / qty) * 100) : 0,
          matchStatus: matchState(qty, received, billed),
        };
      }),
      vendors: vendors.map((v) => ({ id: v.id, name: v.legal_name })),
      expenseAccounts: accounts.map((a) => ({ id: a.id, code: a.code, name: a.name })),
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/purchase-orders]", e);
    return NextResponse.json({ error: e?.message || "Failed to load purchase orders" }, { status: 500 });
  }
}

// POST /api/admin/accounting/purchase-orders — actions:
//  create_po   { vendor_id, order_date?, expected_date?,
//                lines: [{ description, quantity, unit_cost, expense_account_id? }] }
//  approve     { id }                       draft/pending → approved
//  receive_line{ line_id, quantity }        increments received_quantity (capped)
//  bill_line   { line_id, quantity }        increments billed_quantity (capped)
export async function POST(req: NextRequest) {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const b = await body(req);

    if (b.action === "approve") {
      const { data: po } = await db.from("acct_ap_purchase_orders").select("status").eq("id", b.id).eq("tenant_id", tenant).single();
      if (!po) throw new Error("Purchase order not found");
      if (!["draft", "pending_approval"].includes(String(po.status))) throw new Error(`A ${po.status} purchase order cannot be approved`);
      const { error } = await db.from("acct_ap_purchase_orders").update({ status: "approved" }).eq("id", b.id).eq("tenant_id", tenant);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (b.action === "receive_line" || b.action === "bill_line") {
      const col = b.action === "receive_line" ? "received_quantity" : "billed_quantity";
      const { data: line } = await db.from("acct_ap_purchase_order_lines").select(`id, purchase_order_id, quantity, ${col}`).eq("id", b.line_id).single();
      if (!line) throw new Error("PO line not found");
      const { data: parent } = await db.from("acct_ap_purchase_orders").select("id").eq("id", (line as any).purchase_order_id).eq("tenant_id", tenant).single();
      if (!parent) throw new Error("PO line not found");
      const add = Number(b.quantity);
      if (!(add > 0)) throw new Error("Enter a quantity greater than zero");
      const next = Math.min(Number(line.quantity), round2(Number((line as any)[col]) + add));
      const { error } = await db.from("acct_ap_purchase_order_lines").update({ [col]: next }).eq("id", b.line_id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, [col]: next });
    }

    if (b.action !== "create_po") throw new Error("Unknown action");
    if (!b.vendor_id) throw new Error("Pick the vendor this order is for");
    const lines = (Array.isArray(b.lines) ? b.lines : []).filter(
      (l: any) => l && l.description && Number(l.quantity) > 0,
    );
    if (!lines.length) throw new Error("Add at least one order line with a description and quantity");
    const { entityId } = await bookContext(db, tenant);
    const subtotal = round2(lines.reduce((s: number, l: any) => s + Number(l.quantity) * Number(l.unit_cost || 0), 0));
    const poNumber = await nextNumber(db, "acct_ap_purchase_orders", "po_number", "PO", tenant);
    const { data: po, error } = await db.from("acct_ap_purchase_orders").insert({
      tenant_id: tenant, entity_id: entityId, vendor_id: b.vendor_id, po_number: poNumber,
      order_date: b.order_date || todayISO(), expected_date: b.expected_date || null,
      currency: "USD", subtotal, tax_total: 0, total: subtotal, status: "draft",
    }).select("id").single();
    if (error) throw new Error(error.message);
    const { error: lineErr } = await db.from("acct_ap_purchase_order_lines").insert(lines.map((l: any, i: number) => ({
      purchase_order_id: po.id, line_no: i + 1, description: l.description,
      quantity: Number(l.quantity), unit_cost: Number(l.unit_cost || 0),
      expense_account_id: l.expense_account_id || null, received_quantity: 0, billed_quantity: 0,
    })));
    if (lineErr) throw new Error(lineErr.message);
    return NextResponse.json({ ok: true, id: po.id, po_number: poNumber }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to save" }, { status: 400 });
  }
}
