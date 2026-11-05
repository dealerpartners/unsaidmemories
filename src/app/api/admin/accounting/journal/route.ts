import { guard, ctx, ok, fail, body } from "../_shared";
import { postJournal } from "@/lib/accounting";

export const dynamic = "force-dynamic";

export async function GET() {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    const { db, tenant } = await ctx();
    const { data: entries } = await db.from("acct_journal_entries").select("*")
      .eq("tenant_id", tenant).order("entry_date", { ascending: false }).order("entry_no", { ascending: false }).limit(200);
    const ids = (entries || []).map((e: any) => e.id);
    const { data: lines } = ids.length
      ? await db.from("acct_journal_lines").select("*").in("journal_entry_id", ids).order("line_no")
      : { data: [] as any[] };
    const byEntry = new Map<string, any[]>();
    for (const l of lines || []) {
      const arr = byEntry.get(l.journal_entry_id) || []; arr.push(l); byEntry.set(l.journal_entry_id, arr);
    }
    return ok({ entries: (entries || []).map((e: any) => ({ ...e, lines: byEntry.get(e.id) || [] })) });
  } catch (e) { return fail(e, 500); }
}

export async function POST(req: Request) {
  const blocked = await guard(); if (blocked) return blocked;
  try {
    await ctx();
    const b = await body(req);
    const { createServerClient } = await import("@/lib/supabase");
    const id = await postJournal(createServerClient(), {
      source: b.source || "manual",
      memo: b.memo || "Manual journal entry",
      entryDate: b.entry_date || undefined,
      reference: b.reference || null,
      lines: (b.lines || []).map((l: any) => ({
        accountCode: String(l.account_code), debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0, memo: l.memo,
      })),
    });
    return ok({ id });
  } catch (e) { return fail(e); }
}
