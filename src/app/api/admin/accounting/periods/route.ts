import { NextRequest, NextResponse } from "next/server";
import { adminAuthorIdFromSession, resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/admin/accounting/periods
//
// Period Close & Locks data: the fiscal period cadence
// (acct_periods joined to acct_fiscal_years) and the month-end
// close checklist workbench (acct_close_checklists).
//
// GET: periods + checklist tasks.
// POST actions:
//   add_task      { periodId, taskName, taskCode?, required? }
//   complete_task { taskId }            — mark a checklist task done
//   reopen_task   { taskId }            — send a task back to open
//   close_period  { periodId }          — HARD CLOSE, gated: every
//                 required checklist task must be completed first;
//                 sets acct_periods.status='closed', closed_at,
//                 closed_by.
//   reopen_period { periodId }          — unlock a closed period.

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const periods = await pgQuery<{
      id: string; name: string; period_no: number; start_date: string; end_date: string;
      status: string; closed_at: string | null; fiscal_year: number | null; book_id: string;
    }>(
      `SELECT p.id::text AS id, p.name, p.period_no, p.start_date::text AS start_date,
              p.end_date::text AS end_date, p.status, p.closed_at::text AS closed_at,
              fy.fiscal_year, p.book_id::text AS book_id
         FROM public.acct_periods p
         LEFT JOIN public.acct_fiscal_years fy ON fy.id = p.fiscal_year_id
        WHERE p.tenant_id = $1
        ORDER BY p.start_date DESC`,
      [tenant],
    );
    const tasks = await pgQuery<{
      id: string; period_id: string; task_code: string; task_name: string;
      sequence_no: number; required: boolean; status: string; completed_at: string | null; notes: string | null;
    }>(
      `SELECT id::text AS id, period_id::text AS period_id, task_code, task_name,
              sequence_no, required, status, completed_at::text AS completed_at, notes
         FROM public.acct_close_checklists
        WHERE tenant_id = $1
        ORDER BY sequence_no ASC, task_name ASC`,
      [tenant],
    );
    return NextResponse.json({ periods, tasks, total: periods.length });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/periods]", e);
    return NextResponse.json({ error: e?.message || "Failed to load periods" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = String(body.action || "");
  try {
    if (action === "add_task") {
      const periodId = String(body.periodId || "");
      const taskName = String(body.taskName || "").trim();
      if (!periodId || !taskName) {
        return NextResponse.json({ error: "A period and a task name are required." }, { status: 400 });
      }
      const taskCode = String(body.taskCode || "").trim()
        || taskName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48);
      const rows = await pgQuery<{ id: string }>(
        `INSERT INTO public.acct_close_checklists (tenant_id, period_id, task_code, task_name, sequence_no, required, status)
         VALUES ($1, $2, $3, $4,
                 COALESCE((SELECT MAX(sequence_no) + 1 FROM public.acct_close_checklists WHERE tenant_id = $1 AND period_id = $2), 1),
                 $5, 'open')
         RETURNING id::text AS id`,
        [tenant, periodId, taskCode, taskName, body.required !== false],
      );
      return NextResponse.json({ data: { id: rows[0]?.id } }, { status: 201 });
    }

    if (action === "complete_task" || action === "reopen_task") {
      const taskId = String(body.taskId || "");
      if (!taskId) return NextResponse.json({ error: "taskId is required" }, { status: 400 });
      const author = await adminAuthorIdFromSession(req.headers.get("cookie")).catch(() => null);
      if (action === "complete_task") {
        await pgQuery(
          `UPDATE public.acct_close_checklists
              SET status = 'completed', completed_at = now(), completed_by = $3
            WHERE tenant_id = $1 AND id = $2`,
          [tenant, taskId, author],
        );
      } else {
        await pgQuery(
          `UPDATE public.acct_close_checklists
              SET status = 'open', completed_at = NULL, completed_by = NULL
            WHERE tenant_id = $1 AND id = $2`,
          [tenant, taskId],
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "close_period") {
      const periodId = String(body.periodId || "");
      if (!periodId) return NextResponse.json({ error: "periodId is required" }, { status: 400 });
      const open = await pgQuery<{ task_name: string }>(
        `SELECT task_name FROM public.acct_close_checklists
          WHERE tenant_id = $1 AND period_id = $2 AND required = true AND status <> 'completed'
          ORDER BY sequence_no`,
        [tenant, periodId],
      );
      if (open.length > 0) {
        return NextResponse.json(
          {
            error: `This period cannot close yet — ${open.length} required checklist task(s) are still open: ${open.map((t) => t.task_name).join("; ")}.`,
            openTasks: open.map((t) => t.task_name),
          },
          { status: 422 },
        );
      }
      const author = await adminAuthorIdFromSession(req.headers.get("cookie")).catch(() => null);
      await pgQuery(
        `UPDATE public.acct_periods
            SET status = 'closed', closed_at = now(), closed_by = $3
          WHERE tenant_id = $1 AND id = $2`,
        [tenant, periodId, author],
      );
      return NextResponse.json({ ok: true });
    }

    if (action === "reopen_period") {
      const periodId = String(body.periodId || "");
      if (!periodId) return NextResponse.json({ error: "periodId is required" }, { status: 400 });
      await pgQuery(
        `UPDATE public.acct_periods
            SET status = 'open', closed_at = NULL, closed_by = NULL
          WHERE tenant_id = $1 AND id = $2`,
        [tenant, periodId],
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e: any) {
    console.error("[POST /api/admin/accounting/periods]", e);
    return NextResponse.json({ error: e?.message || "Period action failed" }, { status: 500 });
  }
}
