// I4 · The governed explorer runner, shared by the interactive explorer
// route (run / run_saved on demand) and the scheduled-exports cron
// (/api/cron/analytics-exports). One gate for both: the SQL must already
// have passed validateExplorerSql (lib/analytics/platform); execution
// happens inside a READ-ONLY transaction with the explorer statement
// timeout, wrapped so the row cap applies outside the query.

import { withPg } from "@/lib/crm/enterprise";
import { EXPLORER_ROW_CAP, EXPLORER_TIMEOUT_MS } from "@/lib/analytics/platform";

type Row = Record<string, unknown>;

export async function runGovernedExplorerQuery(
  sql: string,
): Promise<{ columns: string[]; rows: Row[]; truncated: boolean; ms: number }> {
  const started = Date.now();
  const out = await withPg(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("SET TRANSACTION READ ONLY");
      await client.query(`SET LOCAL statement_timeout = '${EXPLORER_TIMEOUT_MS}'`);
      const res = await client.query(
        `SELECT * FROM (${sql}) AS _explorer LIMIT ${EXPLORER_ROW_CAP + 1}`,
      );
      await client.query("ROLLBACK");
      const rows = (res.rows as Row[]).slice(0, EXPLORER_ROW_CAP);
      return {
        columns: res.fields.map((f) => f.name),
        rows,
        truncated: res.rows.length > EXPLORER_ROW_CAP,
        ms: Date.now() - started,
      };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => null);
      throw e;
    }
  });
  if (!out) throw new Error("DB unavailable");
  return out;
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(columns: string[], rows: Row[]): string {
  const lines = [columns.map(csvCell).join(",")];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}
