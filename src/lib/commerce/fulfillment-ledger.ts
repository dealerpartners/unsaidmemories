import { createServerClient } from "@/lib/supabase";
import { postJournal, round2 } from "@/lib/accounting";

type DB = ReturnType<typeof createServerClient>;

/**
 * Fulfillment → books. When an order's lines are actually submitted
 * to a supplier (push group status "ordered"), the cost of those
 * goods belongs in the ledger: Dr 5000 COGS / Cr 2050 Accounts
 * Payable, one entry per supplier group.
 *
 * The cost basis is the supplier catalog variant's price_snapshot —
 * what the supplier charges for that variant. Routes'
 * cost_snapshot is null across the board, so it is never used.
 * A line whose variant carries no price is SKIPPED and reported in
 * the returned warnings — a cost is never invented.
 *
 * Idempotent per (erp order, supplier group): re-pushing an order
 * never double-posts its COGS.
 */
export async function postFulfillmentCogs(
  sb: DB,
  tenantId: string,
  erpOrderId: string,
  groups: { supplierSlug: string; status: string; items: string[] }[],
): Promise<{ posted: { supplier: string; journalId: string; amount: number }[]; warnings: string[] }> {
  const posted: { supplier: string; journalId: string; amount: number }[] = [];
  const warnings: string[] = [];
  const ordered = groups.filter((g) => g.status === "ordered" && g.items.length);
  if (!ordered.length) return { posted, warnings };

  const { data: erp } = await sb
    .from("erp_orders")
    .select("order_number, source_order_id")
    .eq("id", erpOrderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!erp?.source_order_id) return { posted, warnings: ["no linked storefront order — COGS skipped"] };

  for (const group of ordered) {
    const sourceId = `${erpOrderId}:${group.supplierSlug}`;
    const { data: prior } = await sb
      .from("acct_journal_entries")
      .select("id")
      .eq("source", "fulfillment")
      .eq("source_id", sourceId)
      .limit(1)
      .maybeSingle();
    if (prior) continue;

    const { data: items } = await sb
      .from("order_items")
      .select("id, supplier_catalog_variant_id, quantity")
      .in("id", group.items);
    let total = 0;
    for (const item of items ?? []) {
      if (!item.supplier_catalog_variant_id) {
        warnings.push(`item ${item.id}: no supplier variant — cost skipped`);
        continue;
      }
      const { data: variant } = await sb
        .from("supplier_catalog_variants")
        .select("price_snapshot")
        .eq("id", item.supplier_catalog_variant_id)
        .maybeSingle();
      const price = Number(variant?.price_snapshot);
      if (!Number.isFinite(price) || price <= 0) {
        warnings.push(`item ${item.id}: variant has no price — cost skipped`);
        continue;
      }
      total = round2(total + price * Number(item.quantity || 1));
    }
    if (total <= 0) continue;
    const journalId = await postJournal(sb, {
      source: "fulfillment",
      sourceId,
      reference: (erp.order_number as string) ?? null,
      memo: `Supplier COGS — order ${erp.order_number} (${group.supplierSlug})`,
      lines: [
        { accountCode: "5000", debit: total, credit: 0, memo: `COGS — ${group.supplierSlug} dispatch` },
        { accountCode: "2050", debit: 0, credit: total, memo: `Payable — ${group.supplierSlug}` },
      ],
    });
    posted.push({ supplier: group.supplierSlug, journalId, amount: total });
  }
  return { posted, warnings };
}
