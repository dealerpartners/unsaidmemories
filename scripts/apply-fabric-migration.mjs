/**
 * Apply the Fabric studio migration directly (idempotent SQL).
 * Uses DATABASE_URL from the worktree .env. Run:
 *   node scripts/apply-fabric-migration.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envText = readFileSync(path.join(root, ".env"), "utf8");
const dbUrl = envText.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!dbUrl) throw new Error("DATABASE_URL not found in .env");

const sql = readFileSync(
  path.join(root, "supabase/migrations/20261030010000_fabric_studio.sql"),
  "utf8",
);

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
try {
  await client.query(sql);
  const { rows } = await client.query(
    `select table_name from information_schema.tables
     where table_schema='public' and table_name in ('projects','design_assets','provider_jobs')
     order by table_name`,
  );
  console.log("tables present:", rows.map((r) => r.table_name).join(", "));
  const { rows: buckets } = await client.query(
    `select id from storage.buckets where id in ('design-assets','print-files','mockups') order by id`,
  );
  console.log("buckets present:", buckets.map((r) => r.id).join(", "));
  console.log("MIGRATION APPLIED");
} finally {
  await client.end();
}
