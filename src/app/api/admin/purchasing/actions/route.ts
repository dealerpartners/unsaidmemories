// ---------------------------------------------------------------------------
// /api/admin/purchasing/actions/route.ts
//
// Purchasing quick actions — FULL_FEATURE_TREE.txt Section 6.
//
// Actions:
//   PO: create_po, receive_order, cancel_po
//   VENDOR: create_vendor, update_vendor, view_vendor
//
// Tables: erp_purchase_orders + erp_purchase_order_lines, erp_vendors.
// These are the LIVE purchasing tables — the Purchases module, the
// commerce actions, and inventory receiving all run on them. This route
// used to probe between legacy `purchase_orders` / `vendors` tables and
// the erp ones, but the probe (adminGet on a fake id) never returns the
// "missing" shape, so it always picked the legacy tables — which are
// empty and whose columns (`expected_at`, `subtotal_cents`, `received_at`,
// `address`, …) this route then failed to write anyway. Repointed at the
// erp tables with their real columns; the legacy tables stay untouched.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { guardPayloadIds, guardRequiredFields } from "@/lib/quick-actions/validate";
import { requireAdminApi } from "@/lib/admin/gate";
import { adminGet, adminCreate, adminUpdate, resolveTenantId} from "@/lib/admin-api";
import { pgExec, pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PO = "erp_purchase_orders";
const VENDOR = "erp_vendors";

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = String(body.action || "");
  const p = body.payload ?? body;
  const idGuard = guardPayloadIds(p);
  if (idGuard) return idGuard;
  const reqGuard = guardRequiredFields(action, p);
  if (reqGuard) return reqGuard;
  const tenantId = resolveTenantId(req);

  try {
    switch (action) {
      case "create_po": {
        const vendorId = String(p.vendor_id || "");
        if (!vendorId) return NextResponse.json({ error: "vendor_id required" }, { status: 400 });
        const v = await adminGet(VENDOR, vendorId, { tenantId });
        const vj = await v.json().catch(() => null);
        if (!vj?.data) {
          return NextResponse.json({ error: "Vendor not found — pick a vendor from the vendor list" }, { status: 400 });
        }
        const subtotal = Number(p.subtotal ?? p.total ?? 0);
        const po = await adminCreate(PO, {
          vendor_id: vendorId,
          // New POs start pending_approval (Purchases module rule).
          status: "pending_approval",
          po_number: p.po_number || `PO-${Date.now().toString(36).toUpperCase()}`,
          expected_date: p.expected_date || null,
          currency: p.currency || "USD",
          subtotal,
          tax_total: Number(p.tax_total ?? 0),
          shipping_total: Number(p.shipping_total ?? 0),
          total: Number(p.total ?? subtotal),
          notes: p.notes || null,
        }, { tenantId });
        const pj = await po.json().catch(() => null);
        if (pj?.error || pj?._empty) return po;
        return NextResponse.json({ data: pj?.data }, { status: 201 });
      }
      case "receive_order": {
        // SA-45 — real receiving: per-line quantities capped at what is
        // still owed, inventory movements into erp_inventory_movements,
        // PO status derived from the lines. The old body stamped
        // received_at / received_note columns that do not exist and
        // force-marked the PO "received" without receiving anything.
        const id = String(p.po_id || "");
        if (!id) return NextResponse.json({ error: "po_id required" }, { status: 400 });
        const receivedItems = (Array.isArray(p.received_items) ? p.received_items : []) as Array<{ line_id?: string; sku_id?: string; quantity?: number; unit_cost?: number }>;
        const usable = receivedItems.filter(ri => ri.sku_id && Number(ri.quantity || 0) > 0);
        if (!usable.length) {
          return NextResponse.json({ error: "Receiving needs per-line quantities (received_items) — receive from the purchase order so stock and line quantities stay in step" }, { status: 400 });
        }
        const poRows = await pgQuery<{ status: string }>(
          `SELECT status::text AS status FROM public.erp_purchase_orders WHERE id = $1::uuid AND tenant_id = $2`,
          [id, tenantId],
        );
        if (!poRows.length) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
        const currentStatus = poRows[0].status;
        const lineRows = await pgQuery<{ id: string; sku_id: string; quantity_ordered: string; quantity_received: string; unit_cost: string }>(
          `SELECT id, sku_id, quantity_ordered::text, quantity_received::text, unit_cost::text
             FROM public.erp_purchase_order_lines
            WHERE purchase_order_id = $1::uuid AND tenant_id = $2`,
          [id, tenantId],
        );
        const lineById = new Map(lineRows.map(l => [l.id, l]));
        const lineBySku = new Map(lineRows.map(l => [l.sku_id, l]));
        let movementCount = 0;
        const failedLines: Array<{ sku_id: string; reason: string }> = [];
        for (const ri of usable) {
          const skuId = String(ri.sku_id);
          const line = (ri.line_id ? lineById.get(String(ri.line_id)) : undefined) || lineBySku.get(skuId);
          let appliedQty = Number(ri.quantity || 0);
          if (line) {
            const remaining = Number(line.quantity_ordered) - Number(line.quantity_received);
            appliedQty = Math.min(appliedQty, Math.max(remaining, 0));
            if (appliedQty <= 0) continue;
            const upd = await pgExec(
              `UPDATE public.erp_purchase_order_lines
                  SET quantity_received = quantity_received + $1
                WHERE id = $2::uuid AND tenant_id = $3 AND purchase_order_id = $4::uuid`,
              [appliedQty, line.id, tenantId, id],
            );
            if (!upd) { failedLines.push({ sku_id: skuId, reason: "line quantity update did not land" }); continue; }
            line.quantity_received = String(Number(line.quantity_received) + appliedQty);
          }
          const moved = await pgExec(
            `INSERT INTO public.erp_inventory_movements
               (id, tenant_id, movement_type, sku_id, quantity, unit_cost, source_type,
                reference, reason, metadata, occurred_at, created_at)
             VALUES (gen_random_uuid(), $1, 'purchase_receipt', $2::uuid, $3, $4,
                     'purchase_order', $5, 'PO receipt', '{}'::jsonb, now(), now())`,
            [tenantId, skuId, appliedQty, Number(ri.unit_cost ?? (line ? Number(line.unit_cost) : 0) ?? 0), id],
          );
          if (moved) movementCount++;
          else failedLines.push({ sku_id: skuId, reason: "inventory movement insert did not land" });
        }
        if (movementCount === 0) {
          return NextResponse.json({ error: "Nothing was received — every requested line is already fully received on this PO" }, { status: 400 });
        }
        let newStatus = currentStatus;
        if (lineRows.length > 0) {
          const ordered = lineRows.reduce((s, l) => s + Number(l.quantity_ordered), 0);
          const received = lineRows.reduce((s, l) => s + Number(l.quantity_received), 0);
          if (ordered > 0 && received >= ordered) newStatus = "received";
          else if (received > 0) newStatus = "partially_received";
        } else {
          newStatus = "received";
        }
        if (newStatus !== currentStatus) {
          await pgExec(
            `UPDATE public.erp_purchase_orders SET status = $1, updated_at = now() WHERE id = $2::uuid AND tenant_id = $3`,
            [newStatus, id, tenantId],
          );
        }
        if (failedLines.length > 0) {
          return NextResponse.json({ ok: false, poId: id, status: newStatus, movementCount, failedLines, error: `${failedLines.length} requested line(s) could not be received` }, { status: 500 });
        }
        return NextResponse.json({ ok: true, poId: id, status: newStatus, movementCount });
      }
      case "cancel_po": {
        const id = String(p.po_id || "");
        if (!id) return NextResponse.json({ error: "po_id required" }, { status: 400 });
        // erp_purchase_orders has no cancelled_at / cancel_reason columns —
        // the cancel is the status itself (reason is kept in notes when given).
        const patch: Record<string, any> = { status: "cancelled" };
        if (p.reason) patch.notes = `Cancelled: ${p.reason}`;
        return adminUpdate(PO, id, patch, { tenantId });
      }
      case "create_vendor": {
        return adminCreate(VENDOR, {
          name: p.name || null,
          // vendor_number is NOT NULL with no default on erp_vendors.
          vendor_number: p.vendor_number || `V-${Date.now().toString(36).toUpperCase()}`,
          email: p.email || null,
          phone: p.phone || null,
          tax_identifier: p.tax_identifier || null,
          payment_terms: p.payment_terms || null,
          currency: p.currency || "USD",
          is_active: true,
        }, { tenantId });
      }
      case "update_vendor":
      case "edit_vendor": {
        const id = String(p.vendor_id || "");
        if (!id) return NextResponse.json({ error: "vendor_id required" }, { status: 400 });
        // Whitelist the real erp_vendors columns — the old body passed the
        // whole payload through, so any stray key broke the update.
        const patch: Record<string, any> = {};
        for (const k of ["name", "email", "phone", "tax_identifier", "payment_terms", "currency", "is_active"] as const) {
          if (p[k] !== undefined) patch[k] = p[k];
        }
        if (!Object.keys(patch).length) {
          return NextResponse.json({ error: "Nothing to update — pass name, email, phone, tax_identifier, payment_terms, currency, or is_active" }, { status: 400 });
        }
        return adminUpdate(VENDOR, id, patch, { tenantId });
      }
      case "view_vendor": {
        const id = String(p.vendor_id || "");
        if (!id) return NextResponse.json({ error: "vendor_id required" }, { status: 400 });
        return adminGet(VENDOR, id, { tenantId });
      }
      default:
        return NextResponse.json({ error: `Unknown purchasing action: ${action}` }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "purchasing action failed", action }, { status: 500 });
  }
}
