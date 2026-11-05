import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit"
import { resolveAdminActor, requestIp } from "@/lib/admin/actor"
import { FLAG_AUDIENCES, listFeatureFlags, type FlagAudience } from "@/lib/admin/feature-flags"

// ---------------------------------------------------------------------------
// /api/admin/feature-flags — K5 · Feature Flags, the admin writer + read.
//
// STORE: public.platform_feature_flags (migration 20261064). Before this
// route the platform had NO flags store and the only flags surface was a
// local-useState matrix in CustomerPortalScreen that persisted nothing;
// that matrix now reads/writes THIS store (audience 'customer').
//
// Tree leaves (K5): Seller features · Customer features · Employee
// features · Vet features · Global features — the audiences. Flags are
// PER-TENANT rows: a flag exists for a tenant only when recorded for that
// tenant; the reader (src/lib/admin/feature-flags.ts) is default-off on
// absence with a same-tenant 'global' fallback per key.
//
// GATE: requireModuleApi("administration", …) — the K tools' module (K3
// broadcast writer, K4 audit viewer, K6 system health). Read lists; every
// mutation requires write and appends a crm_audit_log row.
// ---------------------------------------------------------------------------

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const KEY_RE = /^[a-z0-9][a-z0-9_.-]{0,79}$/

function audienceOf(v: unknown): FlagAudience | null {
  return typeof v === "string" && (FLAG_AUDIENCES as readonly string[]).includes(v)
    ? (v as FlagAudience)
    : null
}

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("administration", "read")
  if (gate) return gate
  const tenant = resolveTenantId(req)
  const audienceParam = req.nextUrl.searchParams.get("audience") || undefined
  const audience: FlagAudience | undefined = audienceParam ? audienceOf(audienceParam) ?? undefined : undefined
  if (audienceParam && !audience) {
    return NextResponse.json({ error: `audience must be one of ${FLAG_AUDIENCES.join(", ")}` }, { status: 400 })
  }
  try {
    const payload = await withPg(async (client) => {
      const flags = await listFeatureFlags(client, tenant, audience)
      return { tenantId: tenant, flags }
    })
    if (!payload) {
      return NextResponse.json({ error: "Database unavailable — flags could not be read." }, { status: 503 })
    }
    return NextResponse.json({
      ...payload,
      semantics:
        "Per-tenant rows. A read for an audience falls back to the same tenant's 'global' row for the key; absence everywhere reads OFF.",
    })
  } catch (e: any) {
    console.error("[GET /api/admin/feature-flags]", e)
    return NextResponse.json({ error: `Load failed: ${e.message}` }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("administration", "write")
  if (gate) return gate
  const tenant = resolveTenantId(req)

  let body: Record<string, any>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const action = String(body.action || "")
  const audience = audienceOf(body.audience)
  const key = String(body.key || "").trim()
  if (!audience) {
    return NextResponse.json({ error: `audience must be one of ${FLAG_AUDIENCES.join(", ")}` }, { status: 400 })
  }
  if (!KEY_RE.test(key)) {
    return NextResponse.json(
      { error: "key must be a flag key: lowercase letters, digits, and _ . - (max 80 characters)" },
      { status: 400 },
    )
  }

  try {
    const out = await withPg(async (client) => {
      const actor = await resolveAdminActor(client, tenant)
      if (action === "upsert") {
        const description =
          body.description === null || body.description === undefined ? null : String(body.description).slice(0, 500)
        const enabled = Boolean(body.enabled)
        const { rows } = await client.query(
          `INSERT INTO public.platform_feature_flags
             (tenant_id, audience, flag_key, description, enabled, created_by, updated_by)
           VALUES ($1::uuid, $2, $3, $4, $5, $6, $6)
           ON CONFLICT (tenant_id, audience, flag_key)
           DO UPDATE SET description = EXCLUDED.description,
                         enabled = EXCLUDED.enabled,
                         updated_by = EXCLUDED.updated_by,
                         updated_at = now()
           RETURNING id::text AS id, enabled`,
          [tenant, audience, key, description, enabled, actor.email],
        )
        return { kind: "upsert" as const, id: String(rows[0].id), enabled: Boolean(rows[0].enabled), actor }
      }
      if (action === "set_enabled") {
        if (typeof body.enabled !== "boolean") {
          return { kind: "error" as const, status: 400, error: "enabled must be a boolean", actor }
        }
        const { rows } = await client.query(
          `UPDATE public.platform_feature_flags
              SET enabled = $1, updated_by = $2, updated_at = now()
            WHERE tenant_id = $3::uuid AND audience = $4 AND flag_key = $5
            RETURNING id::text AS id`,
          [body.enabled, actor.email, tenant, audience, key],
        )
        if (rows.length === 0) {
          return { kind: "error" as const, status: 404, error: "no such flag is recorded for this tenant — create it first", actor }
        }
        return { kind: "set_enabled" as const, id: String(rows[0].id), enabled: body.enabled, actor }
      }
      if (action === "delete") {
        const res = await client.query(
          `DELETE FROM public.platform_feature_flags
            WHERE tenant_id = $1::uuid AND audience = $2 AND flag_key = $3`,
          [tenant, audience, key],
        )
        if ((res.rowCount ?? 0) === 0) {
          return { kind: "error" as const, status: 404, error: "no such flag is recorded for this tenant", actor }
        }
        return { kind: "delete" as const, id: null, enabled: null, actor }
      }
      return { kind: "error" as const, status: 400, error: "action must be upsert, set_enabled, or delete", actor }
    })
    if (!out) {
      return NextResponse.json({ error: "Database unavailable — nothing was written." }, { status: 503 })
    }
    if (out.kind === "error") {
      return NextResponse.json({ error: out.error }, { status: out.status })
    }
    const actorId = await getActorIdFromRequest(req)
    await auditAction({
      action: `k5_feature_flag_${out.kind}`,
      domain: "crm",
      tableName: "platform_feature_flags",
      recordId: out.id,
      afterData: { tenant_id: tenant, audience, key, enabled: out.enabled },
      actorUserId: actorId,
      ipAddress: requestIp(req),
    })
    return NextResponse.json({ ok: true, tenantId: tenant, audience, key, enabled: out.enabled })
  } catch (e: any) {
    console.error("[POST /api/admin/feature-flags]", e)
    return NextResponse.json({ error: `Write failed: ${e.message}` }, { status: 500 })
  }
}
