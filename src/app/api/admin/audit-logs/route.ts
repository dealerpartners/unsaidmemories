import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import pg from "pg";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgConnectionString, toTransactionPooler } from "@/lib/pg";

async function getPgClient() {
  const connectionString = toTransactionPooler(process.env.SUPABASE_SESSION_POOLER || process.env.SUPABASE_DIRECT_CONNECTION || pgConnectionString);
  if (!connectionString) return null;
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

// GET /api/admin/audit-logs
// The audit trail reads the owner's platform_audit_log table. Entries are
// written by real system events (settings commits, webhook money events,
// permission changes). There are NO seeded/fake rows — an empty list means
// nothing has happened yet, which is the truth.
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("administration", "read");
  if (gate) return gate;

  try {
    const pgClient = await getPgClient();
    if (!pgClient) {
      return NextResponse.json([]);
    }

    const result = await pgClient.query(
      `SELECT id::text, created_at, action, actor_role, target_entity_type,
              target_entity_id::text, metadata
       FROM lms.platform_audit_log
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [resolveTenantId(req)],
    );

    await pgClient.end();

    const rows = result.rows.map((r: any) => {
      let meta: any = r.metadata;
      if (meta && typeof meta === "object" && Object.keys(meta).length > 0) {
        try { meta = JSON.stringify(meta); } catch { meta = String(meta); }
      } else {
        meta = "";
      }
      const target = r.target_entity_type
        ? r.target_entity_type + (r.target_entity_id ? ` ${String(r.target_entity_id).slice(0, 8)}` : "")
        : "";
      return {
        id: r.id,
        timestamp: new Date(r.created_at).toISOString(),
        action: String(r.action || "").toUpperCase(),
        details: [target, meta].filter(Boolean).join(" — ") || `performed by ${r.actor_role || "system"}`,
      };
    });

    return NextResponse.json(rows);
  } catch (err: any) {
    console.error("[GET /api/admin/audit-logs] Error:", err);
    return NextResponse.json({ error: err.message || "Failed to load audit logs" }, { status: 500 });
  }
}
