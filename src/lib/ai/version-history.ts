// ---------------------------------------------------------------------------
// ai/version-history.ts — J1/J2 · Model & prompt version history.
//
// ai_models carries a version string and ai_prompts a version counter,
// but until now a change destroyed the prior state: the prompts PATCH
// bumped the counter and overwrote prompt_text, and the models PATCH
// could not change the version at all. Version history is kept in the
// platform's activity_log (the store /api/admin/audit reads): before a
// model or prompt row is mutated, its PRIOR state is snapshotted here,
// and the [id] GETs read the snapshots back as the version history.
// No new table — the audit store is the designed home for this trail.
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";

type PgClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

export type AiVersionEntity = "ai_model" | "ai_prompt";

/** Snapshot a row's prior state into activity_log before it changes. */
export async function snapshotAiVersion(
  c: PgClient,
  input: {
    tenant: string;
    entity: AiVersionEntity;
    entityId: string;
    actorId: string | null;
    state: Record<string, unknown>;
  },
): Promise<void> {
  await c.query(
    `INSERT INTO public.activity_log (id, entity, "entityId", action, summary, actor, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7::uuid)`,
    [
      randomUUID(),
      input.entity,
      input.entityId,
      `${input.entity}.version_snapshot`,
      JSON.stringify(input.state).slice(0, 8000),
      input.actorId || "admin",
      input.tenant,
    ],
  );
}

/** The recorded version history for one model/prompt, newest first. */
export async function readAiVersionHistory(
  c: PgClient,
  tenant: string,
  entity: AiVersionEntity,
  entityId: string,
): Promise<Array<{ state: Record<string, unknown>; actor: string | null; at: string | null }>> {
  const { rows } = await c.query(
    `SELECT summary, actor, "createdAt" AS created_at
       FROM public.activity_log
      WHERE tenant_id = $1::uuid AND entity = $2 AND "entityId" = $3
        AND action = $4
      ORDER BY "createdAt" DESC
      LIMIT 100`,
    [tenant, entity, entityId, `${entity}.version_snapshot`],
  ).catch(() => ({ rows: [] as any[] }));
  return rows.map((r: any) => {
    let state: Record<string, unknown> = {};
    try {
      state = typeof r.summary === "string" ? JSON.parse(r.summary) : (r.summary ?? {});
    } catch {
      state = { summary: r.summary ?? null };
    }
    return { state, actor: r.actor ?? null, at: r.created_at ?? null };
  });
}
