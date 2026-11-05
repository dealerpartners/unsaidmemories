import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { resolveActingStaff } from "@/lib/support/actor"
import { getRawTicketRow } from "@/lib/support/intake"
import { loadEffectiveConfig } from "@/lib/support/engine-shared"
import { applyMacro, expandCannedReply, type CannedReplyRow, type MacroRow } from "@/lib/support/macros"
import {
  buildRenderContext, renderTemplate, resolveTemplate, type TemplateRow,
} from "@/lib/support/templates"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// ============================================================================
// /api/admin/support/tickets/[id]/composer — the desk composer's engine
// shelf (rewire). The step-5 rule governs everything here: ENGINES
// DRAFT, HUMANS SEND.
//   GET  → the tenant's effective macros, canned replies, and templates
//          (inheritance resolved; a locked master template is listed
//          with its lock — it can never be shadowed by a tenant row).
//   POST → { kind: 'macro', macroId }      — apply the macro as the
//          acting staff member: field actions land with their events;
//          reply actions come back as DRAFTS for the composer.
//          { kind: 'canned', cannedReplyId } — the canned reply rendered
//          against this ticket (+ the staffer's signature), returned
//          as composer text. Nothing is sent, nothing is written.
//          { kind: 'template', code }      — the template resolved and
//          rendered against this ticket, returned as composer text.
//          { kind: 'delete_draft', draftId } — dismiss an engine draft
//          (support_drafts row) without sending it.
// ============================================================================

async function ctxId(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return id
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "read")
  if (gate) return gate
  const id = await ctxId(ctx)

  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    const raw = await getRawTicketRow(c, tenant, id)
    if (!raw) return NextResponse.json({ error: "Ticket not found" }, { status: 404 })

    const macros = await loadEffectiveConfig<MacroRow>(c, "support_macros", tenant, "AND is_active")
    const canned = await loadEffectiveConfig<CannedReplyRow>(c, "support_canned_replies", tenant, "AND is_active")
    const templateRows = await loadEffectiveConfig<TemplateRow>(c, "support_templates", tenant, "AND is_active")
    // One picker entry per template code: the row the resolver would
    // reach for first in the default locale chain leads the entry.
    const byCode = new Map<string, TemplateRow>()
    for (const row of templateRows) if (!byCode.has(row.code)) byCode.set(row.code, row)

    return NextResponse.json({
      macros: macros.map((m) => ({
        id: m.id, name: m.name, description: m.description ?? null,
        scope: m.scope, lockedByMaster: m.locked_by_master,
      })),
      cannedReplies: canned.map((r) => ({
        id: r.id, title: r.title, categoryCode: r.category_code ?? null,
        locale: r.locale, scope: r.scope, lockedByMaster: r.locked_by_master,
      })),
      templates: [...byCode.values()].map((t) => ({
        code: t.code, name: t.name, channel: t.channel, locale: t.locale,
        scope: t.scope, locked: t.locked,
      })),
    })
  })
  return out ?? NextResponse.json({ error: "Database unavailable" }, { status: 500 })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireModuleApi("support", "write")
  if (gate) return gate
  const id = await ctxId(ctx)
  const payload = await req.json().catch(() => null)
  const kind = String(payload?.kind || "")
  const staff = await resolveActingStaff()

  const out = await withPg(async (c) => {
    const tenant = resolveTenantId(req)
    const raw = await getRawTicketRow(c, tenant, id)
    if (!raw) return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 })

    if (kind === "macro") {
      if (!staff) {
        return NextResponse.json({
          ok: false,
          error: "Macros apply as a staff member — your sign-in has no staff profile, so there is nobody to attribute the actions to.",
        }, { status: 400 })
      }
      const macroId = String(payload?.macroId || "")
      if (!macroId) return NextResponse.json({ ok: false, error: "macroId is required" }, { status: 400 })
      try {
        const result = await applyMacro(c, tenant, macroId, raw, { staffId: staff.staffId })
        return NextResponse.json({
          ok: true, kind,
          macro: result.macro,
          applied: result.applied,
          drafts: result.drafts,
          skipped: result.skipped,
        })
      } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || "Macro failed" }, { status: 400 })
      }
    }

    if (kind === "canned") {
      const cannedReplyId = String(payload?.cannedReplyId || "")
      if (!cannedReplyId) return NextResponse.json({ ok: false, error: "cannedReplyId is required" }, { status: 400 })
      const expanded = await expandCannedReply(c, tenant, cannedReplyId, raw, {
        staffId: staff?.staffId ?? null,
      })
      if (!expanded) return NextResponse.json({ ok: false, error: "Canned reply not found" }, { status: 404 })
      return NextResponse.json({ ok: true, kind, ...expanded })
    }

    if (kind === "template") {
      const code = String(payload?.code || "")
      if (!code) return NextResponse.json({ ok: false, error: "code is required" }, { status: 400 })
      const resolved = await resolveTemplate(c, tenant, code, String(payload?.locale || "en-US"))
      if (!resolved) return NextResponse.json({ ok: false, error: "Template not found" }, { status: 404 })
      const rendered = renderTemplate(resolved, buildRenderContext(raw))
      return NextResponse.json({
        ok: true, kind,
        subject: rendered.subject, body: rendered.body, missing: rendered.missing,
        locked: resolved.locked, resolvedScope: resolved.resolvedScope,
        resolvedLocale: resolved.resolvedLocale,
      })
    }

    if (kind === "delete_draft") {
      const draftId = String(payload?.draftId || "")
      if (!draftId) return NextResponse.json({ ok: false, error: "draftId is required" }, { status: 400 })
      await c.query(
        `DELETE FROM public.support_drafts
          WHERE tenant_id = $1 AND ticket_id = $2::uuid AND id = $3::uuid`,
        [tenant, id, draftId],
      )
      return NextResponse.json({ ok: true, kind })
    }

    return NextResponse.json({ ok: false, error: `Unknown composer kind "${kind}"` }, { status: 400 })
  })
  return out ?? NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 500 })
}
