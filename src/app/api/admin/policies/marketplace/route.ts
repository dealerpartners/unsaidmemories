import { NextRequest, NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise"
import { getActorIdFromRequest } from "@/lib/quick-actions/audit"
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit"
import { evaluatePolicyEnforcement, validateEnforcementRules, SEVERITIES } from "@/lib/policies/enforcement"

export const dynamic = "force-dynamic"

// ---------------------------------------------------------------------------
// F4 · Policy Management + H1 · Policy Authoring + H3 · Acceptance Tracking
// — the ADMIN authoring side of marketplace seller policies.
//
// "Policies" on this platform live in ONE store since BL-13
// (public.seller_policies + versions + precedence); this route authors
// the MARKETPLACE SELLER POLICIES layer of it:
//   1. Document Center articles — authored at /admin/docs (documents,
//      not policies; the doc store's policy content-type is retired).
//   2. SITE policies (the legal pages) — a layer of this same store
//      (category 'Site policy'), served via /api/admin/policies; that
//      surface's writer, never touched here.
//   3. MARKETPLACE SELLER POLICIES — the governance rules sellers read and
//      accept. Real stores (columns verified firsthand via
//      information_schema, 2026-10-14; every table carries ONLY a primary
//      key — no CHECKs, no FKs, no uniques — so vocabularies and integrity
//      are enforced by this writer):
//        seller_policies            id, tenant_id, title, slug, layer,
//                                   category, body, status, current_version
//                                   — the row carries the CURRENT text;
//                                   the seller read serves this body.
//        seller_policy_versions     id, tenant_id, policy_id, version,
//                                   body, change_notes, published_by,
//                                   published_at — publish SNAPSHOTS.
//        seller_policy_acceptances  id, tenant_id, seller_id, policy_id,
//                                   policy_version (text), accepted_at.
//        seller_policy_precedence   id, tenant_id, policy_id, precedence,
//                                   overrides_policy_id — F4's matrix as
//                                   data: policy A, at precedence N,
//                                   overrides policy B.
//
// The seller consumption contract (data graph H3; the seller portal's
// /api/seller/policies, which matches this schema exactly): a policy is
// acceptable exactly when status = 'published' under the seller's tenant;
// acceptances pin (tenant, seller, policy, policy_version =
// current_version) and dedupe on that tuple. Status values written here
// are exactly 'draft' and 'published' — the two states the seller read
// distinguishes (the column default 'active' is written by nothing and
// read by nothing; it is never stamped here).
//
// Authoring semantics on this schema, stated honestly:
//   - Create lands a draft (status 'draft', current_version 0).
//   - Editing writes the row's body. On a PUBLISHED policy that text is
//     what sellers read, so edits are live immediately; publishing again
//     records the next version snapshot and bumps current_version, which
//     is what makes prior acceptances stale (sellers re-accept).
//   - Publish snapshots the current body into seller_policy_versions at
//     the next version number and flips status to 'published'.
//   - Unpublish flips status back to 'draft'; the policy leaves the
//     seller read at once. Version snapshots are never rewritten.
//
// H1's Review queue / Legal sign-off workflow (built 2026-10-15 — the
// stores previously had no reviewer or sign-off state, and publish went
// draft -> published directly): seller_policies carries review_state
// ('draft' | 'in_review' | 'changes_requested' | 'signed_off') with
// reviewed_by/at, signoff_by/at, and review_notes. The flow is
// draft -> submit_review -> in_review -> sign_off (legal) -> publish.
// Publish REFUSES a policy that is not signed off. Editing the body
// resets the workflow to 'draft' and clears the stamps — sign-off
// covers a specific text, never a moving one. Re-publishing unchanged
// text after an unpublish keeps its sign-off (the text never moved).
//
// Gate: "policies" — the module the sibling policy routes use.
// Tenancy: tenant_id is a predicate in every statement; authored rows are
// born under the acting tenant (marketplace principle: policy config is
// per-tenant, never a global lifted from the first tenant).
// ---------------------------------------------------------------------------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const POLICY_COLS = `
  p.id, p.title, p.slug, p.layer, p.category, p.body, p.status,
  p.current_version, p.review_state, p.review_notes, p.reviewed_by,
  p.reviewed_at, p.signoff_by, p.signoff_at, p.created_at, p.updated_at,
  p.enforcement_rules, p.severity
`

const POLICY_COLS_PLAIN = `
  id, title, slug, layer, category, body, status,
  current_version, review_state, review_notes, reviewed_by,
  reviewed_at, signoff_by, signoff_at, created_at, updated_at,
  enforcement_rules, severity
`

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : ""
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
}

type Client = {
  query: (t: string, p?: unknown[]) => Promise<{ rows: any[] }>
}

export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("policies", "read")
  if (denied) return denied
  const tenant = resolveTenantId(req)
  const id = (req.nextUrl.searchParams.get("id") || "").trim()

  const out = await withPg(async (c) => {
    const policies = (
      await c.query(
        `SELECT ${POLICY_COLS},
                (SELECT count(*)::int FROM public.seller_policy_acceptances a
                  WHERE a.tenant_id = $1 AND a.policy_id = p.id
                ) AS acceptance_count,
                (SELECT v.body FROM public.seller_policy_versions v
                  WHERE v.tenant_id = $1 AND v.policy_id = p.id
                    AND v.version = p.current_version
                  ORDER BY v.created_at DESC LIMIT 1
                ) AS published_body
           FROM public.seller_policies p
          WHERE p.tenant_id = $1
          ORDER BY p.layer ASC NULLS LAST, p.category ASC NULLS LAST, p.title ASC
          LIMIT 200`,
        [tenant],
      )
    ).rows.map((p: Record<string, unknown>) => ({
      ...p,
      body_differs_from_published:
        p.published_body != null && p.published_body !== p.body,
      published_body: undefined,
    }))
    const precedence = (
      await c.query(
        `SELECT pr.id, pr.policy_id, p.title AS policy_title,
                pr.precedence, pr.overrides_policy_id,
                o.title AS overrides_title, pr.created_at
           FROM public.seller_policy_precedence pr
           JOIN public.seller_policies p
             ON p.id = pr.policy_id AND p.tenant_id = pr.tenant_id
           LEFT JOIN public.seller_policies o
             ON o.id = pr.overrides_policy_id
          WHERE pr.tenant_id = $1
          ORDER BY pr.precedence ASC, p.title ASC
          LIMIT 200`,
        [tenant],
      )
    ).rows
    const acceptances = (
      await c.query(
        `SELECT a.id, a.policy_id, p.title AS policy_title,
                a.policy_version, a.seller_id,
                s.display_name AS seller_display_name, a.accepted_at
           FROM public.seller_policy_acceptances a
           JOIN public.seller_policies p
             ON p.id = a.policy_id AND p.tenant_id = a.tenant_id
           LEFT JOIN public.sellers s ON s.id = a.seller_id
          WHERE a.tenant_id = $1
          ORDER BY a.accepted_at DESC
          LIMIT 100`,
        [tenant],
      )
    ).rows

    const enforcement = (await c.query(
      `SELECT e.*, p.title AS policy_title, s.display_name AS seller_display_name
         FROM public.seller_policy_enforcement e
         JOIN public.seller_policies p ON p.id = e.policy_id AND p.tenant_id = e.tenant_id
         LEFT JOIN public.sellers s ON s.id = e.seller_id
        WHERE e.tenant_id = $1 ORDER BY e.created_at DESC LIMIT 200`, [tenant])).rows
    const sellers = (await c.query(
      `SELECT id, display_name, status FROM public.sellers WHERE tenant_id = $1 ORDER BY display_name LIMIT 200`, [tenant])).rows
    let policy: Record<string, unknown> | null = null
    let versions: unknown[] = []
    if (id) {
      if (!UUID_RE.test(id)) return { error: "Policy not found", status: 404 }
      policy =
        policies.find((p: Record<string, unknown>) => p.id === id) ?? null
      if (!policy) return { error: "Policy not found", status: 404 }
      versions = (
        await c.query(
          `SELECT id, version, body, change_notes, published_by,
                  published_at, created_at
             FROM public.seller_policy_versions
            WHERE tenant_id = $1 AND policy_id = $2::uuid
            ORDER BY version DESC`,
          [tenant, id],
        )
      ).rows
    }
    return { policies, precedence, acceptances, policy, versions, enforcement, sellers }
  })
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  if ("error" in out) {
    return NextResponse.json(
      { error: (out as { error: string }).error },
      { status: (out as { status?: number }).status || 400 },
    )
  }
  return NextResponse.json(out)
}

export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("policies", "write")
  if (denied) return denied
  const b = await req.json().catch(() => ({}))
  const tenant = resolveTenantId(req)
  const actorId = await getActorIdFromRequest(req)
  const ipAddress = requestIp(req)
  const action = typeof b.action === "string" ? b.action : ""

  const fail = (error: string, status = 400) =>
    NextResponse.json({ error }, { status })

  // Action callbacks return either a success object or { error, status }.
  const errOf = (r: unknown): { error: string; status: number } | null =>
    r && typeof r === "object" && "error" in r
      ? {
          error: String((r as { error?: unknown }).error ?? "Action failed"),
          status: Number((r as { status?: unknown }).status) || 400,
        }
      : null

  const loadPolicy = async (c: Client, policyId: string) => {
    const { rows } = await c.query(
      `SELECT ${POLICY_COLS} FROM public.seller_policies p
        WHERE p.tenant_id = $1 AND p.id = $2::uuid LIMIT 1`,
      [tenant, policyId],
    )
    return rows[0] ?? null
  }

  const publishedBodyOf = async (c: Client, policy: Record<string, any>) => {
    const { rows } = await c.query(
      `SELECT body FROM public.seller_policy_versions
        WHERE tenant_id = $1 AND policy_id = $2::uuid AND version = $3
        ORDER BY created_at DESC LIMIT 1`,
      [tenant, policy.id, Number(policy.current_version ?? 0)],
    )
    return rows[0]?.body ?? null
  }

  // ---- Create a draft policy ----------------------------------------------
  if (action === "create_policy") {
    const title = str(b.title, 200)
    const category = str(b.category, 120)
    const layer = str(b.layer, 40)
    const body = typeof b.body === "string" ? b.body.trim() : ""
    if (!title) return fail("Title is required")
    if (!body) return fail("Body is required — a policy without text governs nothing")
    const slug = slugify(str(b.slug, 120) || title)
    if (!slug) return fail("Slug is required")
    const sev = (SEVERITIES as readonly string[]).includes(String(b.severity)) ? String(b.severity) : "medium"
    const rulesV = validateEnforcementRules(b.enforcement_rules)
    if (!rulesV.ok) return fail(rulesV.error)

    const result = await withPg(async (c) => {
      const dupe = await c.query(
        `SELECT id FROM public.seller_policies
          WHERE tenant_id = $1 AND slug = $2 LIMIT 1`,
        [tenant, slug],
      )
      if (dupe.rows[0]) {
        return {
          error: `A policy with slug "${slug}" already exists for this tenant`,
          status: 400,
        }
      }
      const { rows } = await c.query(
        `INSERT INTO public.seller_policies
           (tenant_id, title, slug, layer, category, body, status, current_version, severity, enforcement_rules)
         VALUES ($1, $2, $3, $4, $5, $6, 'draft', 0, $7, $8::jsonb)
         RETURNING ${POLICY_COLS_PLAIN}`,
        [tenant, title, slug, layer || null, category || null, body, sev, JSON.stringify(rulesV.ok ? rulesV.rules : [])],
      )
      const policy = rows[0]
      await writeSellerAudit(c, {
        tenantId: tenant,
        actorId,
        ipAddress,
        action: "policy.created",
        entityType: "seller_policy",
        entityId: policy.id,
        afterState: { slug, title, category: category || null, layer: layer || null, status: "draft" },
      })
      return { ok: true, policy }
    })
    if (!result) return fail("Database unavailable", 503)
    const err = errOf(result)
    if (err) return fail(err.error, err.status)
    return NextResponse.json(result, { status: 201 })
  }

  // ---- Edit the policy row (title / layer / category / body) --------------
  if (action === "update_policy") {
    const policyId = str(b.id, 40)
    if (!UUID_RE.test(policyId)) return fail("Missing policy id")
    const hasBody = typeof b.body === "string"
    if (hasBody && !(b.body as string).trim()) return fail("Body cannot be emptied")

    const result = await withPg(async (c) => {
      const policy = await loadPolicy(c, policyId)
      if (!policy) return { error: "Policy not found", status: 404 }

      const sets: string[] = []
      const params: unknown[] = [tenant, policyId]
      const push = (col: string, v: unknown) => {
        params.push(v)
        sets.push(`${col} = $${params.length}`)
      }
      if (typeof b.title === "string" && str(b.title, 200)) push("title", str(b.title, 200))
      if (typeof b.layer === "string") push("layer", str(b.layer, 40) || null)
      if (typeof b.category === "string") push("category", str(b.category, 120) || null)
      if (hasBody) push("body", (b.body as string).trim())
      if (b.severity !== undefined) { if (!(SEVERITIES as readonly string[]).includes(String(b.severity))) return { error: "severity must be low, medium, high, or critical", status: 400 }; push("severity", String(b.severity)) }
      if (b.enforcement_rules !== undefined) { const rv = validateEnforcementRules(b.enforcement_rules); if (!rv.ok) return { error: rv.error, status: 400 }; params.push(JSON.stringify(rv.rules)); sets.push(`enforcement_rules = $${params.length}::jsonb`) }
      if (sets.length === 0) return { error: "Nothing to update", status: 400 }
      const editedFields = sets.map((s) => s.split(" ")[0])
      if (hasBody) {
        // A body edit moves the text legal signed off (or is reviewing).
        // The workflow restarts: state back to draft, stamps cleared —
        // the seller audit below records that this reset happened.
        sets.push(
          "review_state = 'draft'",
          "reviewed_by = NULL",
          "reviewed_at = NULL",
          "signoff_by = NULL",
          "signoff_at = NULL",
          "review_notes = NULL",
        )
      }
      await c.query(
        `UPDATE public.seller_policies SET ${sets.join(", ")}, updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid`,
        params,
      )
      await writeSellerAudit(c, {
        tenantId: tenant,
        actorId,
        ipAddress,
        action: "policy.updated",
        entityType: "seller_policy",
        entityId: policyId,
        beforeState: {
          title: policy.title, layer: policy.layer, category: policy.category,
          status: policy.status, current_version: policy.current_version,
        },
        afterState: {
          fields: editedFields,
          // The row body IS the served text: an edit to a published
          // policy is live for sellers immediately (see header).
          live_edit: hasBody && policy.status === "published",
          // A body edit restarts the review/sign-off workflow.
          review_reset: hasBody,
        },
      })
      return { ok: true, policy: await loadPolicy(c, policyId) }
    })
    if (!result) return fail("Database unavailable", 503)
    const err = errOf(result)
    if (err) return fail(err.error, err.status)
    return NextResponse.json(result)
  }

  // ---- H1 review workflow: submit / sign-off / request changes -----------
  if (
    action === "submit_review" ||
    action === "sign_off" ||
    action === "request_changes"
  ) {
    const policyId = str(b.id, 40)
    if (!UUID_RE.test(policyId)) return fail("Missing policy id")
    const notes = str(b.review_notes, 2000)
    if (action === "request_changes" && !notes) {
      return fail("Requesting changes requires review notes — the author needs to know what to fix")
    }
    const result = await withPg(async (c) => {
      const policy = await loadPolicy(c, policyId)
      if (!policy) return { error: "Policy not found", status: 404 }
      const state = String(policy.review_state || "draft")

      if (action === "submit_review") {
        if (state !== "draft" && state !== "changes_requested") {
          return { error: `Policy is ${state.replace(/_/g, " ")} — it cannot be submitted for review from there`, status: 400 }
        }
        const { rows } = await c.query(
          `UPDATE public.seller_policies
              SET review_state = 'in_review', updated_at = now()
            WHERE tenant_id = $1 AND id = $2::uuid
            RETURNING ${POLICY_COLS_PLAIN}`,
          [tenant, policyId],
        )
        await writeSellerAudit(c, {
          tenantId: tenant, actorId, ipAddress,
          action: "policy.review_submitted",
          entityType: "seller_policy", entityId: policyId,
          beforeState: { review_state: state },
          afterState: { review_state: "in_review", slug: policy.slug },
        })
        return { ok: true, policy: rows[0] }
      }

      // sign_off + request_changes both decide a policy that is in review.
      if (state !== "in_review") {
        return { error: "Policy is not in the review queue", status: 400 }
      }
      if (action === "sign_off") {
        const { rows } = await c.query(
          `UPDATE public.seller_policies
              SET review_state = 'signed_off',
                  signoff_by = $3::uuid, signoff_at = now(),
                  reviewed_by = $3::uuid, reviewed_at = now(),
                  updated_at = now()
            WHERE tenant_id = $1 AND id = $2::uuid
            RETURNING ${POLICY_COLS_PLAIN}`,
          [tenant, policyId, actorId && UUID_RE.test(actorId) ? actorId : null],
        )
        await writeSellerAudit(c, {
          tenantId: tenant, actorId, ipAddress,
          action: "policy.signed_off",
          entityType: "seller_policy", entityId: policyId,
          beforeState: { review_state: state },
          afterState: { review_state: "signed_off", slug: policy.slug },
        })
        return { ok: true, policy: rows[0] }
      }

      const { rows } = await c.query(
        `UPDATE public.seller_policies
            SET review_state = 'changes_requested', review_notes = $3,
                reviewed_by = $4::uuid, reviewed_at = now(),
                updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid
          RETURNING ${POLICY_COLS_PLAIN}`,
        [tenant, policyId, notes, actorId && UUID_RE.test(actorId) ? actorId : null],
      )
      await writeSellerAudit(c, {
        tenantId: tenant, actorId, ipAddress,
        action: "policy.changes_requested",
        entityType: "seller_policy", entityId: policyId,
        beforeState: { review_state: state },
        afterState: { review_state: "changes_requested", review_notes: notes, slug: policy.slug },
      })
      return { ok: true, policy: rows[0] }
    })
    if (!result) return fail("Database unavailable", 503)
    const err = errOf(result)
    if (err) return fail(err.error, err.status)
    return NextResponse.json(result)
  }

  // ---- Publish (H1): snapshot the current body as the next version --------
  if (action === "publish_policy") {
    const policyId = str(b.id, 40)
    if (!UUID_RE.test(policyId)) return fail("Missing policy id")
    const changeNotes = str(b.change_notes, 2000)
    const result = await withPg(async (c) => {
      const policy = await loadPolicy(c, policyId)
      if (!policy) return { error: "Policy not found", status: 404 }
      if (!policy.body || !String(policy.body).trim()) {
        return { error: "Policy has no body text to publish", status: 400 }
      }
      // H1 gate: legal sign-off precedes publish. A policy whose text
      // has never been signed off — or whose body moved after sign-off
      // (a body edit resets the workflow to draft) — cannot publish.
      if (String(policy.review_state || "draft") !== "signed_off") {
        return {
          error: "Legal sign-off is required before publishing — submit the policy for review, then sign-off.",
          status: 400,
        }
      }
      const currentVersion = Number(policy.current_version ?? 0)
      const snapshot = await publishedBodyOf(c, policy)
      if (policy.status === "published" && snapshot != null && snapshot === policy.body) {
        return { error: "No changes to publish — the live text already matches the current version", status: 400 }
      }
      if (snapshot != null && snapshot === policy.body) {
        // Re-publish of an already-snapshotted version (was unpublished):
        // the version record stands; only the status flips back.
        const { rows } = await c.query(
          `UPDATE public.seller_policies
              SET status = 'published', updated_at = now()
            WHERE tenant_id = $1 AND id = $2::uuid
            RETURNING ${POLICY_COLS_PLAIN}`,
          [tenant, policyId],
        )
      // BL-13 consolidation: every policy surface reads this same
      // seller_policies store, so a publish here is the propagation.
        await writeSellerAudit(c, {
          tenantId: tenant,
          actorId,
          ipAddress,
          action: "policy.published",
          entityType: "seller_policy",
          entityId: policyId,
          beforeState: { status: policy.status, current_version: currentVersion },
          afterState: { status: "published", version: currentVersion, slug: policy.slug, republish: true },
        })
        return { ok: true, policy: rows[0] }
      }
      const version = Math.max(currentVersion, 0) + 1
      await c.query(
        `INSERT INTO public.seller_policy_versions
           (tenant_id, policy_id, version, body, change_notes, published_by, published_at)
         VALUES ($1, $2::uuid, $3, $4, $5, $6::uuid, now())`,
        [
          tenant,
          policyId,
          version,
          policy.body,
          changeNotes || null,
          actorId && UUID_RE.test(actorId) ? actorId : null,
        ],
      )
      const { rows } = await c.query(
        `UPDATE public.seller_policies
            SET status = 'published', current_version = $3, updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid
          RETURNING ${POLICY_COLS_PLAIN}`,
        [tenant, policyId, version],
      )
      // BL-13 consolidation: every policy surface reads this same
      // seller_policies store, so a publish here is the propagation.
      await writeSellerAudit(c, {
        tenantId: tenant,
        actorId,
        ipAddress,
        action: "policy.published",
        entityType: "seller_policy",
        entityId: policyId,
        beforeState: { status: policy.status, current_version: currentVersion },
        afterState: { status: "published", version, slug: policy.slug },
      })
      return { ok: true, policy: rows[0] }
    })
    if (!result) return fail("Database unavailable", 503)
    const err = errOf(result)
    if (err) return fail(err.error, err.status)
    return NextResponse.json(result)
  }

  // ---- Unpublish (back to draft; leaves the seller read immediately) ------
  if (action === "unpublish_policy") {
    const policyId = str(b.id, 40)
    if (!UUID_RE.test(policyId)) return fail("Missing policy id")
    const result = await withPg(async (c) => {
      const policy = await loadPolicy(c, policyId)
      if (!policy) return { error: "Policy not found", status: 404 }
      if (policy.status !== "published") {
        return { error: "Policy is not published", status: 400 }
      }
      const { rows } = await c.query(
        `UPDATE public.seller_policies
            SET status = 'draft', updated_at = now()
          WHERE tenant_id = $1 AND id = $2::uuid
          RETURNING ${POLICY_COLS_PLAIN}`,
        [tenant, policyId],
      )
      // BL-13 consolidation: every policy surface reads this same store.
      await writeSellerAudit(c, {
        tenantId: tenant,
        actorId,
        ipAddress,
        action: "policy.unpublished",
        entityType: "seller_policy",
        entityId: policyId,
        beforeState: { status: "published", current_version: policy.current_version },
        afterState: { status: "draft", slug: policy.slug },
      })
      return { ok: true, policy: rows[0] }
    })
    if (!result) return fail("Database unavailable", 503)
    const err = errOf(result)
    if (err) return fail(err.error, err.status)
    return NextResponse.json(result)
  }

  // ---- F4 precedence matrix: set a policy's precedence / override ---------
  if (action === "set_precedence") {
    const policyId = str(b.policy_id, 40)
    if (!UUID_RE.test(policyId)) return fail("Missing policy id")
    if (!Number.isFinite(Number(b.precedence))) return fail("Precedence must be a number")
    const precedence = Math.trunc(Number(b.precedence))
    const overridesId =
      typeof b.overrides_policy_id === "string" && b.overrides_policy_id
        ? b.overrides_policy_id
        : null
    if (overridesId !== null && !UUID_RE.test(overridesId)) {
      return fail("Invalid overrides policy id")
    }
    if (overridesId === policyId) {
      return fail("A policy cannot override itself")
    }
    const result = await withPg(async (c) => {
      const policy = await loadPolicy(c, policyId)
      if (!policy) return { error: "Policy not found", status: 404 }
      if (overridesId) {
        const target = await loadPolicy(c, overridesId)
        if (!target) return { error: "Overrides policy not found", status: 404 }
      }
      const { rows: existing } = await c.query(
        `SELECT id, precedence, overrides_policy_id
           FROM public.seller_policy_precedence
          WHERE tenant_id = $1 AND policy_id = $2::uuid LIMIT 1`,
        [tenant, policyId],
      )
      let row: Record<string, unknown>
      if (existing[0]) {
        const { rows } = await c.query(
          `UPDATE public.seller_policy_precedence
              SET precedence = $3, overrides_policy_id = $4::uuid
            WHERE tenant_id = $1 AND policy_id = $2::uuid
            RETURNING id, policy_id, precedence, overrides_policy_id, created_at`,
          [tenant, policyId, precedence, overridesId],
        )
        row = rows[0]
      } else {
        const { rows } = await c.query(
          `INSERT INTO public.seller_policy_precedence
             (tenant_id, policy_id, precedence, overrides_policy_id)
           VALUES ($1, $2::uuid, $3, $4::uuid)
           RETURNING id, policy_id, precedence, overrides_policy_id, created_at`,
          [tenant, policyId, precedence, overridesId],
        )
        row = rows[0]
      }
      await writeSellerAudit(c, {
        tenantId: tenant,
        actorId,
        ipAddress,
        action: "policy_precedence.set",
        entityType: "seller_policy_precedence",
        entityId: row.id as string,
        beforeState: existing[0]
          ? { precedence: existing[0].precedence, overrides_policy_id: existing[0].overrides_policy_id }
          : null,
        afterState: { policy_id: policyId, precedence, overrides_policy_id: overridesId },
      })
      return { ok: true, precedence: row }
    })
    if (!result) return fail("Database unavailable", 503)
    const err = errOf(result)
    if (err) return fail(err.error, err.status)
    return NextResponse.json(result)
  }

  // ---- F4 precedence matrix: remove a policy's entry -----------------------
  if (action === "delete_precedence") {
    const policyId = str(b.policy_id, 40)
    if (!UUID_RE.test(policyId)) return fail("Missing policy id")
    const result = await withPg(async (c) => {
      const { rows } = await c.query(
        `DELETE FROM public.seller_policy_precedence
          WHERE tenant_id = $1 AND policy_id = $2::uuid
          RETURNING id, precedence, overrides_policy_id`,
        [tenant, policyId],
      )
      if (!rows[0]) return { error: "Precedence entry not found", status: 404 }
      await writeSellerAudit(c, {
        tenantId: tenant,
        actorId,
        ipAddress,
        action: "policy_precedence.removed",
        entityType: "seller_policy_precedence",
        entityId: rows[0].id,
        beforeState: {
          policy_id: policyId,
          precedence: rows[0].precedence,
          overrides_policy_id: rows[0].overrides_policy_id,
        },
      })
      return { ok: true }
    })
    if (!result) return fail("Database unavailable", 503)
    const err = errOf(result)
    if (err) return fail(err.error, err.status)
    return NextResponse.json(result)
  }

  // ---- H2: evaluate a seller against every published policy's rules -----
  if (action === "evaluate_seller") {
    const sellerId = str(b.seller_id, 40)
    if (!UUID_RE.test(sellerId)) return fail("Missing seller id")
    const result = await withPg(async (c) => {
      const { rows: sellerRows } = await c.query(
        `SELECT id, display_name, status, seller_type, created_at FROM public.sellers WHERE tenant_id = $1 AND id = $2::uuid`, [tenant, sellerId])
      const seller = sellerRows[0]
      if (!seller) return { error: "Seller not found", status: 404 }
      const cnt = async (sql: string, params: unknown[] = [tenant, sellerId]) =>
        Number((await c.query(sql, params)).rows[0]?.n ?? 0)
      const facts: Record<string, unknown> = {
        status: seller.status, seller_type: seller.seller_type,
        violations_count: await cnt(`SELECT count(*)::int AS n FROM public.seller_violations WHERE tenant_id=$1 AND seller_id=$2::uuid`),
        open_violations_count: await cnt(`SELECT count(*)::int AS n FROM public.seller_violations WHERE tenant_id=$1 AND seller_id=$2::uuid AND status='open'`),
        disputes_open_count: await cnt(`SELECT count(*)::int AS n FROM public.seller_disputes WHERE tenant_id=$1 AND seller_id=$2::uuid AND status NOT IN ('released','refunded','reversed')`),
        dmca_claims_count: await cnt(`SELECT count(*)::int AS n FROM public.dmca_details WHERE tenant_id=$1 AND target_seller_id=$2::uuid`),
        listings_count: await cnt(`SELECT count(*)::int AS n FROM public.seller_listings WHERE tenant_id=$1 AND seller_id=$2::uuid`),
        active_listings_count: await cnt(`SELECT count(*)::int AS n FROM public.seller_listings WHERE tenant_id=$1 AND seller_id=$2::uuid AND status='active'`),
        acceptances_count: await cnt(`SELECT count(*)::int AS n FROM public.seller_policy_acceptances WHERE tenant_id=$1 AND seller_id=$2::uuid`),
        accepted_current_version: false,
      }
      const { rows: policies } = await c.query(
        `SELECT id, title, slug, severity, enforcement_rules, current_version FROM public.seller_policies
          WHERE tenant_id=$1 AND status='published' AND jsonb_array_length(coalesce(enforcement_rules,'[]'::jsonb)) > 0`, [tenant])
      const created: any[] = []
      for (const pol of policies) {
        const acc = await c.query(
          `SELECT count(*)::int AS n FROM public.seller_policy_acceptances WHERE tenant_id=$1 AND seller_id=$2::uuid AND policy_id=$3::uuid AND policy_version=$4`,
          [tenant, sellerId, pol.id, String(pol.current_version)])
        const polFacts = { ...facts, accepted_current_version: Number(acc.rows[0]?.n ?? 0) > 0 }
        const prior = await cnt(`SELECT count(*)::int AS n FROM public.seller_policy_enforcement WHERE tenant_id=$1 AND seller_id=$2::uuid AND policy_id=$3::uuid`, [tenant, sellerId, pol.id])
        for (const m of evaluatePolicyEnforcement(pol, polFacts, prior)) {
          let violationId: string | null = null
          if (m.createViolation) {
            const v = await c.query(
              `INSERT INTO public.seller_violations (tenant_id, seller_id, violation_type, severity, status, description, policy_id)
               VALUES ($1,$2::uuid,$3,$4,'open',$5,$6::uuid) RETURNING id`,
              [tenant, sellerId, String(pol.slug || "policy").slice(0,120), m.severity,
               `Enforcement of policy "${pol.title}": rule ${m.ruleIndex + 1} matched (${m.rule.field} ${m.rule.operator} ${JSON.stringify(m.rule.value ?? null)}). Stage: ${m.stage}.`, pol.id])
              .catch(async () => c.query(
                `INSERT INTO public.seller_violations (tenant_id, seller_id, violation_type, severity, status, description)
                 VALUES ($1,$2::uuid,$3,$4,'open',$5) RETURNING id`,
                [tenant, sellerId, String(pol.slug || "policy").slice(0,120), m.severity,
                 `Enforcement of policy "${pol.title}": rule ${m.ruleIndex + 1} matched. Stage: ${m.stage}.`]))
            violationId = v.rows[0]?.id ?? null
          }
          const { rows } = await c.query(
            `INSERT INTO public.seller_policy_enforcement
               (tenant_id, seller_id, policy_id, stage, severity, rule_index, rule_matched, action, remediation_steps, remediation_deadline, status, violation_id, evaluated_by)
             VALUES ($1,$2::uuid,$3::uuid,$4,$5,$6,$7::jsonb,$8,$9::jsonb, now() + ($10 || ' days')::interval, 'open', $11::uuid, $12::uuid)
             RETURNING *`,
            [tenant, sellerId, pol.id, m.stage, m.severity, m.ruleIndex, JSON.stringify(m.rule), m.action,
             JSON.stringify(m.remediationSteps), String(m.remediationDays), violationId,
             actorId && UUID_RE.test(actorId) ? actorId : null])
          created.push(rows[0])
        }
      }
      await writeSellerAudit(c, { tenantId: tenant, actorId, ipAddress, action: "policy_enforcement.evaluated",
        entityType: "seller", entityId: sellerId, afterState: { facts, records_created: created.length } })
      return { ok: true, facts, created, policies_evaluated: policies.length }
    })
    if (!result) return fail("Database unavailable", 503)
    const err = errOf(result); if (err) return fail(err.error, err.status)
    return NextResponse.json(result)
  }

  // ---- H2: remediation completion / close -------------------------------
  if (action === "complete_remediation" || action === "close_enforcement") {
    const enfId = str(b.enforcement_id, 40)
    if (!UUID_RE.test(enfId)) return fail("Missing enforcement id")
    const result = await withPg(async (c) => {
      const { rows } = await c.query(
        action === "complete_remediation"
          ? `UPDATE public.seller_policy_enforcement SET status='remediated', remediation_completed_at=now(), remediation_completed_by=$3::uuid, updated_at=now() WHERE tenant_id=$1 AND id=$2::uuid AND status='open' RETURNING *`
          : `UPDATE public.seller_policy_enforcement SET status='closed', updated_at=now() WHERE tenant_id=$1 AND id=$2::uuid RETURNING *`,
        [tenant, enfId, actorId && UUID_RE.test(actorId) ? actorId : null])
      if (!rows[0]) return { error: "Enforcement record not found or not open", status: 404 }
      await writeSellerAudit(c, { tenantId: tenant, actorId, ipAddress,
        action: action === "complete_remediation" ? "policy_enforcement.remediated" : "policy_enforcement.closed",
        entityType: "seller_policy_enforcement", entityId: enfId, afterState: { status: rows[0].status } })
      return { ok: true, enforcement: rows[0] }
    })
    if (!result) return fail("Database unavailable", 503)
    const err = errOf(result); if (err) return fail(err.error, err.status)
    return NextResponse.json(result)
  }

  return fail("Unknown action")
}
