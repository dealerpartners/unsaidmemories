import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export const dynamic = "force-dynamic";

// I4 · Download one recorded scheduled-export run as CSV
// (public.analytics_export_runs, migration 20261107). Gate: 'reports'
// read, matching the explorer. Failed runs carry no CSV — the recorded
// error is the answer.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireModuleApi("reports", "read");
  if (gate) return gate;
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "id must be a uuid" }, { status: 400 });
  const tenant = resolveTenantId(req);
  const run = await withPg(async (c) => {
    const { rows } = await c.query(
      `SELECT definition_name, status, csv_text, error, created_at
         FROM public.analytics_export_runs
        WHERE id = $1::uuid AND tenant_id = $2::uuid`,
      [id, tenant],
    );
    return rows[0] ?? null;
  });
  if (!run) return NextResponse.json({ error: "Export run not found" }, { status: 404 });
  if (run.status !== "succeeded" || typeof run.csv_text !== "string") {
    return NextResponse.json(
      { error: `This run failed: ${run.error || "no CSV was produced"}` },
      { status: 409 },
    );
  }
  const safeName = String(run.definition_name || "export").replace(/[^a-z0-9-_]+/gi, "-").slice(0, 60);
  return new NextResponse(run.csv_text, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${safeName}.csv"`,
    },
  });
}
