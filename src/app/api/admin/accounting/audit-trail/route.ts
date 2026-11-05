import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/audit-trail
//
// The forensic audit register over acct_audit_log: every recorded
// change with its before/after state and the hash-chain columns
// (entry_hash / prev_hash). Hashes are rendered exactly as stored —
// rows written before the chain was added carry nulls and the page
// shows a dash; nothing is ever fabricated.

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const search = (req.nextUrl.searchParams.get("search") || "").trim();
    const rows = await pgQuery<{
      id: string; event_time: string; action: string; table_name: string | null;
      record_id: string | null; actor_user_id: string | null;
      before_data: unknown; after_data: unknown;
      entry_hash: string | null; prev_hash: string | null; correlation_id: string | null;
    }>(
      `SELECT id::text AS id, event_time::text AS event_time, action, table_name,
              record_id, actor_user_id::text AS actor_user_id,
              before_data, after_data, entry_hash, prev_hash, correlation_id
         FROM public.acct_audit_log
        WHERE tenant_id = $1
          AND ($2 = '' OR action ILIKE '%' || $2 || '%'
               OR COALESCE(table_name, '') ILIKE '%' || $2 || '%'
               OR COALESCE(record_id, '') ILIKE '%' || $2 || '%')
        ORDER BY event_time DESC
        LIMIT 300`,
      [tenant, search],
    );
    return NextResponse.json({ events: rows, total: rows.length });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/audit-trail]", e);
    return NextResponse.json({ error: e?.message || "Failed to load audit trail" }, { status: 500 });
  }
}
