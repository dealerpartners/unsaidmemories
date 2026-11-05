import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/admin/gate";
import { getDb, getTenantId, customerName } from "@/lib/crm/data";

export const dynamic = "force-dynamic";

/**
 * Merge customers: the survivor keeps its identity; every child record of
 * the merged-away customers is re-pointed at the survivor (notes, messages,
 * conversations, documents, orders, leads, tasks, tags, segment membership,
 * campaign membership, invoices, receipts), lifetime value and balance are
 * combined, and each loser is closed with merged_into_customer_id set —
 * the UnSaid Memories merge pattern, minus households/pets.
 */
const REPOINT: { table: string; column: string }[] = [
  { table: "crm_notes", column: "customer_id" },
  { table: "crm_messages", column: "customer_id" },
  { table: "crm_conversations", column: "customer_id" },
  { table: "crm_documents", column: "customer_id" },
  { table: "crm_leads", column: "customer_id" },
  { table: "crm_tasks", column: "customer_id" },
  { table: "crm_segment_memberships", column: "customer_id" },
  { table: "crm_campaign_members", column: "customer_id" },
  { table: "erp_orders", column: "crm_customer_id" },
  { table: "acct_ar_receipts", column: "customer_id" },
];

export async function POST(req: Request) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const body = await req.json().catch(() => null);
  const survivorId = body?.survivor_id as string;
  const mergeIds = (body?.merge_ids || []) as string[];
  if (!survivorId || !mergeIds.length) {
    return NextResponse.json({ error: "survivor_id and merge_ids are required." }, { status: 400 });
  }
  const db = getDb();
  const tenantId = await getTenantId(db);
  const { data: survivor } = await db.from("crm_customers").select("*").eq("tenant_id", tenantId).eq("id", survivorId).maybeSingle();
  if (!survivor) return NextResponse.json({ error: "Survivor not found." }, { status: 404 });
  const S = survivor as { lifetime_value: number | null; outstanding_balance: number | null; email: string | null; phone: string | null };

  const results: { merged_id: string; moved: Record<string, number> }[] = [];
  let addedLtv = 0;
  let addedBalance = 0;

  for (const loserId of mergeIds) {
    if (loserId === survivorId) continue;
    const { data: loser } = await db.from("crm_customers").select("*").eq("tenant_id", tenantId).eq("id", loserId).maybeSingle();
    if (!loser) continue;
    const L = loser as { lifetime_value: number | null; outstanding_balance: number | null };
    addedLtv += Number(L.lifetime_value || 0);
    addedBalance += Number(L.outstanding_balance || 0);

    const moved: Record<string, number> = {};
    for (const { table, column } of REPOINT) {
      const { data: rows, error } = await db.from(table).update({ [column]: survivorId }).eq(column, loserId).select("id");
      if (!error) moved[table] = (rows || []).length;
    }
    // Tags: move assignments, skipping ones the survivor already has.
    const { data: loserTags } = await db.from("crm_customer_tag_assignments").select("tag_id").eq("customer_id", loserId);
    const { data: survTags } = await db.from("crm_customer_tag_assignments").select("tag_id").eq("customer_id", survivorId);
    const survSet = new Set(((survTags || []) as { tag_id: string }[]).map((t) => t.tag_id));
    let tagMoves = 0;
    for (const t of (loserTags || []) as { tag_id: string }[]) {
      if (!survSet.has(t.tag_id)) {
        await db.from("crm_customer_tag_assignments").insert({ tenant_id: tenantId, customer_id: survivorId, tag_id: t.tag_id });
        await db.from("crm_customer_tags").upsert({ tenant_id: tenantId, customer_id: survivorId, tag_id: t.tag_id }, { ignoreDuplicates: true });
        tagMoves++;
      }
    }
    await db.from("crm_customer_tag_assignments").delete().eq("customer_id", loserId);
    await db.from("crm_customer_tags").delete().eq("customer_id", loserId);
    moved.crm_tags = tagMoves;
    // Invoices keyed by the CRM source id.
    const { data: invRows } = await db.from("acct_ar_invoices").update({ source_customer_id: survivorId }).eq("source_customer_id", loserId).select("id");
    moved.acct_ar_invoices = (invRows || []).length;
    // Preferences: keep the survivor's; drop the loser's.
    await db.from("crm_customer_preferences").delete().eq("customer_id", loserId);

    await db.from("crm_customers").update({
      is_active: false,
      merged_into_customer_id: survivorId,
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", loserId);
    await db.from("crm_notes").insert({
      tenant_id: tenantId, customer_id: survivorId, created_by: gate.admin.userId,
      note_type: "system",
      body: `Merged duplicate customer ${customerName(loser as never)} (${loserId}) into this record. Moved: ${Object.entries(moved).map(([t, n]) => `${t}×${n}`).join(", ")}.`,
    });
    results.push({ merged_id: loserId, moved });
  }

  await db.from("crm_customers").update({
    lifetime_value: Number(S.lifetime_value || 0) + addedLtv,
    outstanding_balance: Number(S.outstanding_balance || 0) + addedBalance,
    last_activity_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", survivorId);

  return NextResponse.json({ ok: true, survivor_id: survivorId, results });
}
