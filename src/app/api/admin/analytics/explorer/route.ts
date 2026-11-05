import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { generateText } from "@/lib/ai";
import { runGovernedExplorerQuery } from "@/lib/analytics/explorer-run";
import {
  BUILDER_TABLES,
  EXPLORER_ROW_CAP,
  validateExplorerSql,
} from "@/lib/analytics/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// /api/admin/analytics/explorer — Admin tree I4 · NL→SQL EXPLORER (Query
// builder · Saved queries · Scheduled exports · Data governance), and the
// original tree's "/admin/analytics — NL→SQL admin explorer".
//
// WHAT IS BUILT (the governed explorer):
//   · QUERY BUILDER + SQL EDITOR — pick a governed table + columns +
//     equality filters (client-side) or write SELECT directly. The
//     natural-language half of "NL→SQL" is wired through the platform AI
//     provider (the J section's machinery — lib/ai, the router every AI
//     call on the platform runs through, logged to ai_invocations with
//     feature 'analytics_nl_sql'): the translate action drafts a SELECT
//     from the question and the governed schema, funnels it through the
//     SAME validateExplorerSql gate, and returns it to the editor. The
//     translator NEVER executes SQL — Run executes, through the same
//     read-only walls, and the translation itself is trailed here.
//   · SAVED QUERIES — ride the designed report-definitions store
//     (public.seller_report_definitions, seller_id NULLABLE by design:
//     a NULL-seller row is a platform-level definition; report_type
//     'admin_saved_query'; the SQL + an optional schedule ride the
//     definition jsonb). 0 rows before this bite; zero code references.
//   · SCHEDULED EXPORTS — the schedule is RECORDED on the saved query's
//     definition and executed unattended by /api/cron/analytics-exports
//     (vercel.json, daily; due-ness per recorded frequency) through this
//     same governed gate; runs + CSVs record in analytics_export_runs
//     (migration 20261107 — seller_report_runs.seller_id is NOT NULL, so
//     admin runs cannot ride the seller store). "Run now" executes any
//     saved query on demand.
//   · DATA GOVERNANCE — enforced, not described: (1) every run executes
//     inside a READ-ONLY transaction (SET TRANSACTION READ ONLY) with a
//     5s statement timeout, behind a conservative single-statement
//     SELECT gate (two walls); (2) results are capped at 500 rows;
//     (3) credential stores are outside the builder's governed set
//     entirely (tenant_stripe_accounts, franchise_email_settings);
//     (4) EVERY run / save / delete is written to public.activity_log
//     (entity 'analytics_explorer') with actor, SQL, row count and
//     outcome — the governance panel below reads that trail back.
//
// Gates: 'reports' — read for the saved list / builder metadata /
// governance trail, write for run / save / delete (the explorer is an
// operator tool; running a query is an audited act).
// ============================================================================

type Row = Record<string, unknown>;

async function logExplorer(
  tenant: string,
  actor: string,
  action: string,
  entityId: string | null,
  summary: Record<string, unknown>,
): Promise<void> {
  await withPg(async (client) => {
    await client.query(
      `INSERT INTO public.activity_log (id, entity, "entityId", action, summary, actor, tenant_id)
       VALUES ($1, 'analytics_explorer', $2, $3, $4, $5, $6::uuid)`,
      [randomUUID(), entityId, action, JSON.stringify(summary).slice(0, 2000), actor, tenant],
    );
  });
}

// The governed runner lives in lib/analytics/explorer-run (shared with
// the scheduled-exports cron) — one read-only gate for every execution.
const runGovernedQuery = runGovernedExplorerQuery;

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("reports", "read");
  if (gate) return gate;
  const tenant = resolveTenantId(req);

  const result = await withPg(async (client) => {
    // Saved-queries store — fail-soft until seller_report_definitions is
    // created in this database (42P01), the same pattern the export-runs
    // read below already uses: the explorer's builder/governance face
    // must load with an empty saved list rather than 503 wholesale.
    // Saving still requires the table — see
    // notes/dashboard-view-gaps-2026-11-02.md (#4).
    let savedRows: any[] = [];
    try {
      const saved = await client.query(
        `SELECT id::text AS id, name, report_type, definition, created_at, updated_at
           FROM public.seller_report_definitions
          WHERE tenant_id = $1::uuid AND seller_id IS NULL AND report_type = 'admin_saved_query'
          ORDER BY created_at DESC`,
        [tenant],
      );
      savedRows = saved.rows;
    } catch (e: any) {
      if (e?.code !== "42P01") throw e;
    }
    const cols = await client.query(
      `SELECT table_name, column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])
        ORDER BY table_name, ordinal_position`,
      [[...BUILDER_TABLES]],
    );
    const trail = await client.query(
      `SELECT id, action, summary, actor, "createdAt" AS created_at
         FROM public.activity_log
        WHERE tenant_id = $1::uuid AND entity = 'analytics_explorer'
        ORDER BY "createdAt" DESC LIMIT 50`,
      [tenant],
    );
    // I4 export runs — fail-soft until migration 20261107 lands.
    let exportRuns: any[] = [];
    try {
      const runs = await client.query(
        `SELECT id::text AS id, definition_id::text AS definition_id, definition_name,
                schedule, status, row_count, truncated, error, created_at
           FROM public.analytics_export_runs
          WHERE tenant_id = $1::uuid ORDER BY created_at DESC LIMIT 50`,
        [tenant],
      );
      exportRuns = runs.rows;
    } catch (e: any) {
      // Runs store not applied yet (42P01) reads as no runs; real failures surface.
      if (e?.code !== "42P01") throw e;
    }
    return { saved: savedRows, cols: cols.rows, trail: trail.rows, exportRuns };
  });

  if (!result) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

  const builder: Record<string, { name: string; type: string }[]> = {};
  for (const t of BUILDER_TABLES) builder[t] = [];
  for (const c of result.cols) {
    builder[String(c.table_name)]?.push({ name: String(c.column_name), type: String(c.data_type) });
  }

  return NextResponse.json({
    section: "I4",
    tenant,
    savedQueries: result.saved.map((s) => {
      const def = (s.definition ?? {}) as Row;
      return {
        id: String(s.id),
        name: s.name,
        sql: typeof def.sql === "string" ? def.sql : "",
        schedule: typeof def.schedule === "string" ? def.schedule : null,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      };
    }),
    builderTables: builder,
    governance: {
      enforcement: [
        "Read-only: every run executes inside SET TRANSACTION READ ONLY with a 5s statement timeout, behind a single-statement SELECT-only gate.",
        `Row cap: results are limited to ${EXPLORER_ROW_CAP} rows; truncation is reported, never silent.`,
        "Every run, save and delete is written to the activity_log governance trail with actor, SQL and outcome.",
        "Credential stores are excluded from the governed set entirely: tenant_stripe_accounts, franchise_email_settings.",
      ],
      trail: result.trail.map((t) => ({
        id: String(t.id), action: String(t.action), summary: t.summary, actor: t.actor, createdAt: t.created_at,
      })),
    },
    nlGate: "Natural-language → SQL is wired through the platform AI provider (the J section's machinery — lib/ai, logged as feature analytics_nl_sql). Translate drafts a SELECT from your question and places it in the editor; it is never executed by the translator. Run executes it through the same read-only gate as hand-written SQL, and the translation is written to the governance trail.",
    scheduledExports: "A saved query with a schedule (daily or weekly) is executed unattended by the analytics-exports cron (/api/cron/analytics-exports, registered in vercel.json) through this same governed read-only gate; each run and its CSV are recorded below and on the governance trail. Schedules with any other value are recorded intent only — the runner reports them as unsupported rather than pretending they run. Run-now still executes any saved query on demand.",
    exportRuns: (result.exportRuns ?? []).map((r) => ({
      id: String(r.id),
      definitionId: r.definition_id ? String(r.definition_id) : null,
      definitionName: String(r.definition_name),
      schedule: r.schedule ?? null,
      status: String(r.status),
      rowCount: r.row_count ?? null,
      truncated: Boolean(r.truncated),
      error: r.error ?? null,
      createdAt: r.created_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("reports", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const actorId = await getActorIdFromRequest(req);
  const actor = actorId ?? "admin";
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");

  if (action === "run" || action === "run_saved") {
    let sql = typeof body.sql === "string" ? body.sql : "";
    let savedId: string | null = null;
    if (action === "run_saved") {
      savedId = typeof body.id === "string" ? body.id : null;
      if (!savedId) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const found = await withPg(async (client) => {
        const r = await client.query(
          `SELECT definition FROM public.seller_report_definitions
            WHERE id = $1::uuid AND tenant_id = $2::uuid AND seller_id IS NULL AND report_type = 'admin_saved_query'`,
          [savedId, tenant],
        );
        return r.rows[0] ?? null;
      });
      if (!found) return NextResponse.json({ error: "Saved query not found" }, { status: 404 });
      const def = (found.definition ?? {}) as Row;
      sql = typeof def.sql === "string" ? def.sql : "";
    }
    const checked = validateExplorerSql(sql);
    if (checked.error) {
      await logExplorer(tenant, actor, "query_run", savedId, { sql: sql.slice(0, 500), outcome: "rejected", reason: checked.error });
      return NextResponse.json({ error: checked.error }, { status: 400 });
    }
    try {
      const out = await runGovernedQuery(checked.sql!);
      await logExplorer(tenant, actor, "query_run", savedId, {
        sql: checked.sql!.slice(0, 500), outcome: "ok", rows: out.rows.length, truncated: out.truncated, ms: out.ms,
      });
      return NextResponse.json({ ok: true, ...out });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await logExplorer(tenant, actor, "query_run", savedId, { sql: checked.sql!.slice(0, 500), outcome: "error", error: message.slice(0, 300) });
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (action === "save") {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const sql = typeof body.sql === "string" ? body.sql : "";
    const schedule = typeof body.schedule === "string" && body.schedule.trim() ? body.schedule.trim() : null;
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    const checked = validateExplorerSql(sql);
    if (checked.error) return NextResponse.json({ error: checked.error }, { status: 400 });
    const saved = await withPg(async (client) => {
      const r = await client.query(
        `INSERT INTO public.seller_report_definitions (tenant_id, seller_id, name, report_type, definition)
         VALUES ($1::uuid, NULL, $2, 'admin_saved_query', $3::jsonb)
         RETURNING id::text AS id`,
        [tenant, name, JSON.stringify({ sql: checked.sql, schedule })],
      );
      return r.rows[0] ?? null;
    });
    if (!saved) return NextResponse.json({ error: "Save failed" }, { status: 503 });
    await logExplorer(tenant, actor, "query_saved", String(saved.id), { name, sql: checked.sql!.slice(0, 500), schedule });
    return NextResponse.json({ ok: true, id: String(saved.id) });
  }

  if (action === "translate") {
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question) return NextResponse.json({ error: "question is required" }, { status: 400 });
    if (question.length > 500) return NextResponse.json({ error: "question exceeds the 500-character explorer limit" }, { status: 400 });
    // The governed schema context — the same governed set the builder
    // offers; the model may only write against what is listed here.
    const schema = await withPg(async (client) => {
      const cols = await client.query(
        `SELECT table_name, column_name, data_type FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ANY($1::text[])
          ORDER BY table_name, ordinal_position`,
        [[...BUILDER_TABLES]],
      );
      const byTable = new Map<string, string[]>();
      for (const row of cols.rows as Row[]) {
        const t = String(row.table_name);
        if (!byTable.has(t)) byTable.set(t, []);
        byTable.get(t)!.push(`${String(row.column_name)} ${String(row.data_type)}`);
      }
      return [...byTable.entries()].map(([t, cs]) => `${t}(${cs.join(", ")})`).join("\n");
    });
    if (!schema) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
    let raw = "";
    try {
      raw = await generateText(
        actor,
        [
          "You translate an admin's plain-language question into ONE PostgreSQL SELECT statement over the governed tables listed below.",
          "Reply with the SQL only — no prose, no explanation, no markdown fences.",
          "Use only the listed tables and columns. Never reference any other table.",
          "The query runs read-only inside a transaction with a 500-row cap applied outside; do not add a LIMIT clause.",
          "",
          "Governed schema:",
          schema,
        ].join("\n"),
        [{ role: "user", text: question }],
        "Admin NL→SQL translation (I4 explorer)",
        "analytics_nl_sql",
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await logExplorer(tenant, actor, "query_translated", null, { question: question.slice(0, 500), outcome: "provider_error", error: message.slice(0, 300) });
      return NextResponse.json({ error: `The AI provider did not answer: ${message.slice(0, 200)}` }, { status: 502 });
    }
    // Defensive extraction: strip code fences if the model added them.
    const candidate = raw.trim().replace(/^```(?:sql)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const checked = validateExplorerSql(candidate);
    await logExplorer(tenant, actor, "query_translated", null, {
      question: question.slice(0, 500),
      outcome: checked.error ? "invalid" : "ok",
      sql: (checked.sql ?? candidate).slice(0, 500),
      ...(checked.error ? { reason: checked.error } : {}),
    });
    return NextResponse.json({
      ok: true,
      sql: checked.sql ?? null,
      validationError: checked.error ?? null,
      note: "Translated SQL is placed in the editor. It executes only when you run it — through the same read-only gate as hand-written SQL.",
    });
  }

  if (action === "delete") {
    const id = typeof body.id === "string" ? body.id : null;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const deleted = await withPg(async (client) => {
      const r = await client.query(
        `DELETE FROM public.seller_report_definitions
          WHERE id = $1::uuid AND tenant_id = $2::uuid AND seller_id IS NULL AND report_type = 'admin_saved_query'
          RETURNING name`,
        [id, tenant],
      );
      return r.rows[0] ?? null;
    });
    if (!deleted) return NextResponse.json({ error: "Saved query not found" }, { status: 404 });
    await logExplorer(tenant, actor, "query_deleted", id, { name: deleted.name });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "action must be 'run', 'run_saved', 'save', 'delete' or 'translate'" }, { status: 400 });
}
