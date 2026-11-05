import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgExec, pgQuery } from "@/lib/pg";
import { auditAction, getActorIdFromRequest } from "@/lib/quick-actions/audit";
import { writeSellerAudit, requestIp } from "@/lib/sellers/audit";
import { notifySeller } from "@/lib/sellers/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// /api/admin/returns/rules — Admin Tree D3 · Return rules desk.
//
// Two rule stores, one desk (the /admin/returns D3 section):
//   leg "policy" → public.return_policy_rules (migration 20261084) —
//     platform return windows: scope 'global' (the platform window),
//     scope 'category' (a per-category window over taxonomy_nodes), and
//     is_legal_minimum rows (the legal floor the overdue derivation
//     never goes below). One ACTIVE row per slot (global / category /
//     legal minimum) — enforced here with a 409 that names the existing
//     row, and by partial unique indexes in the migration.
//   leg "seller" → public.seller_return_rules — the item/listing-scoped
//     rules sellers record for themselves (rule_type keep_it |
//     replacement | exemption | general..., listing_id marks an
//     item-level rule, conditions is the rule's own JSON incl. its
//     name). Sellers already write these from Seller Center; D3 was
//     PARTIAL because ADMIN had no writer/editor — this route is it:
//     create on a seller's behalf, edit conditions, activate/deactivate.
//
// GET also serves the editor's pickers: categories (taxonomy_nodes) and
// sellers. The returns oversight route reads return_policy_rules
// directly for its overdue derivation — this desk is the writer, that
// route is the applier; there is one store, not two.
// ============================================================================

const POLICY_COLS = `id::text AS id, scope, category_id::text AS category_id,
  category_label, window_days, is_legal_minimum, notes, is_active,
  created_by, created_at::text AS created_at, updated_at::text AS updated_at`;

const SELLER_RULE_COLS = `g.id::text AS id, g.seller_id::text AS seller_id,
  COALESCE(s.display_name, s.legal_name) AS seller_name,
  g.rule_type, g.listing_id::text AS listing_id, g.conditions, g.is_active,
  g.created_at::text AS created_at, g.updated_at::text AS updated_at`;

async function loadPolicyRules(tenant: string) {
  return pgQuery<Record<string, any>>(
    `SELECT ${POLICY_COLS} FROM public.return_policy_rules
      WHERE tenant_id = $1 ORDER BY is_active DESC, scope, window_days`,
    [tenant]
  );
}

async function loadSellerRules(tenant: string) {
  return pgQuery<Record<string, any>>(
    `SELECT ${SELLER_RULE_COLS} FROM public.seller_return_rules g
       LEFT JOIN public.sellers s ON s.id = g.seller_id
      WHERE g.tenant_id = $1 ORDER BY g.created_at DESC LIMIT 500`,
    [tenant]
  );
}

const EXEMPTION_COLS = `a.id::text AS id, a.seller_id::text AS seller_id,
  COALESCE(s.display_name, s.legal_name) AS seller_name,
  a.status, a.appeal_text, a.decision, a.decided_by::text AS decided_by,
  a.decided_at::text AS decided_at, a.created_at::text AS created_at`;

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("orders", "read");
  if (gate) return gate;
  const tenant = resolveTenantId(req);

  const [policyRules, sellerRules, categories, sellers, exemptionRequests, ruleUsage] = await Promise.all([
    loadPolicyRules(tenant),
    loadSellerRules(tenant),
    pgQuery<Record<string, any>>(
      `SELECT id::text AS id, name, slug FROM public.taxonomy_nodes
        WHERE tenant_id = $1
        ORDER BY name LIMIT 1000`,
      [tenant]
    ),
    pgQuery<Record<string, any>>(
      `SELECT id::text AS id, COALESCE(display_name, legal_name) AS name
         FROM public.sellers WHERE tenant_id = $1 ORDER BY name`,
      [tenant]
    ),
    // D3 · Exemption requests: sellers file these into seller_appeals
    // (appeal_type 'return_policy_exemption', born 'pending') — the
    // decision leg below is theirs; pending first.
    pgQuery<Record<string, any>>(
      `SELECT ${EXEMPTION_COLS} FROM public.seller_appeals a
         LEFT JOIN public.sellers s ON s.id = a.seller_id
        WHERE a.tenant_id = $1 AND a.appeal_type = 'return_policy_exemption'
        ORDER BY (a.status = 'pending') DESC, a.created_at DESC LIMIT 200`,
      [tenant]
    ),
    // D2 · Keep-it / replacement usage: no per-request rule link exists
    // in the schema, so usage is reported by the derivation the data
    // supports — the seller's return requests that reached a resolved
    // state (completed / refunded) while the rule has been on record.
    // The basis ships with the numbers; nothing is attributed to a
    // specific request the record doesn't tie to the rule.
    pgQuery<Record<string, any>>(
      `SELECT g.id::text AS rule_id, g.rule_type,
              count(rr.id)::int AS resolved_requests
         FROM public.seller_return_rules g
         LEFT JOIN public.seller_return_requests rr
           ON rr.tenant_id = g.tenant_id AND rr.seller_id = g.seller_id
          AND rr.status IN ('completed', 'refunded')
          AND rr.updated_at >= g.created_at
        WHERE g.tenant_id = $1 AND g.rule_type IN ('keep_it', 'replacement')
        GROUP BY g.id, g.rule_type`,
      [tenant]
    ),
  ]);

  return NextResponse.json({
    policyRules,
    sellerRules,
    categories,
    sellers,
    exemptionRequests,
    ruleUsage,
    rule_usage_basis:
      "Per keep_it/replacement rule: the seller's return requests resolved (completed/refunded) since the rule was recorded. The schema carries no per-request rule link, so usage is reported at seller scope under the rule's lifetime — never attributed to a specific request.",
  });
}

function validWindowDays(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= 3650 ? n : null;
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("orders", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => ({}));
  const leg = String(body.leg || "");
  const actorId = await getActorIdFromRequest(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  // ── leg "policy": a platform window / legal minimum ─────────────────
  if (leg === "policy") {
    const scope = String(body.scope || "global").trim().toLowerCase();
    if (!["global", "category"].includes(scope)) {
      return NextResponse.json({ error: "scope must be global or category" }, { status: 400 });
    }
    const windowDays = validWindowDays(body.window_days);
    if (!windowDays) return NextResponse.json({ error: "window_days must be a whole number of days (1–3650)" }, { status: 400 });
    const isLegalMinimum = body.is_legal_minimum === true;
    const categoryId = body.category_id ? String(body.category_id).trim() : null;
    let categoryLabel = body.category_label ? String(body.category_label).trim().slice(0, 200) : null;
    if (scope === "category" && !categoryId && !categoryLabel) {
      return NextResponse.json({ error: "a category window needs category_id or category_label" }, { status: 400 });
    }
    if (scope === "global" && categoryId) {
      return NextResponse.json({ error: "a global window takes no category" }, { status: 400 });
    }
    if (categoryId) {
      const cat = await pgQuery<{ name: string }>(
        `SELECT name FROM public.taxonomy_nodes WHERE id = $1::uuid`, [categoryId]
      );
      if (!cat.length) return NextResponse.json({ error: "category not found in taxonomy_nodes" }, { status: 400 });
      categoryLabel = categoryLabel || cat[0].name;
    }

    // One active row per slot — name the incumbent instead of stacking.
    const clash = await pgQuery<{ id: string }>(
      isLegalMinimum
        ? `SELECT id::text AS id FROM public.return_policy_rules WHERE tenant_id = $1 AND is_active AND is_legal_minimum LIMIT 1`
        : scope === "global"
          ? `SELECT id::text AS id FROM public.return_policy_rules WHERE tenant_id = $1 AND is_active AND NOT is_legal_minimum AND scope = 'global' LIMIT 1`
          : `SELECT id::text AS id FROM public.return_policy_rules WHERE tenant_id = $1 AND is_active AND NOT is_legal_minimum AND scope = 'category' AND category_id IS NOT DISTINCT FROM $2::uuid AND category_label IS NOT DISTINCT FROM $3 LIMIT 1`,
      isLegalMinimum || scope === "global" ? [tenant] : [tenant, categoryId, categoryId ? null : categoryLabel]
    );
    if (clash.length) {
      return NextResponse.json(
        { error: `An active ${isLegalMinimum ? "legal minimum" : scope === "category" ? "window for this category" : "global window"} already exists (${clash[0].id}) — edit or deactivate it instead of stacking a second one` },
        { status: 409 }
      );
    }

    const rows = await pgQuery<Record<string, any>>(
      `INSERT INTO public.return_policy_rules
         (tenant_id, scope, category_id, category_label, window_days, is_legal_minimum, notes, created_by)
       VALUES ($1, $2, $3::uuid, $4, $5, $6, $7, $8)
       RETURNING ${POLICY_COLS}`,
      [tenant, scope, categoryId, categoryLabel, windowDays, isLegalMinimum,
       body.notes ? String(body.notes).slice(0, 2000) : null, actorId]
    );
    if (!rows[0]) return NextResponse.json({ error: "Policy rule could not be written — the return_policy_rules store is unavailable (migration 20261080 may not have applied yet)" }, { status: 503 });
    await auditAction({ action: "return_policy_rule_created", domain: "commerce", tableName: "return_policy_rules", recordId: rows[0]?.id ?? null, actorUserId: actorId, ipAddress: ip, afterData: { scope, category_id: categoryId, category_label: categoryLabel, window_days: windowDays, is_legal_minimum: isLegalMinimum } });
    return NextResponse.json({ ok: true, rule: rows[0] }, { status: 201 });
  }

  // ── leg "seller": an item/listing-scoped seller rule ────────────────
  if (leg === "seller") {
    const sellerId = String(body.seller_id || "").trim();
    if (!sellerId) return NextResponse.json({ error: "seller_id required" }, { status: 400 });
    const ruleType = String(body.rule_type || "general").trim().slice(0, 80) || "general";
    const listingId = body.listing_id ? String(body.listing_id).trim() : null;
    const conditions: Record<string, unknown> = {
      ...(body.conditions && typeof body.conditions === "object" ? body.conditions : {}),
    };
    if (body.name) conditions.name = String(body.name).trim().slice(0, 200);
    const seller = await pgQuery<{ id: string }>(
      `SELECT id::text AS id FROM public.sellers WHERE tenant_id = $1 AND id = $2::uuid`, [tenant, sellerId]
    );
    if (!seller.length) return NextResponse.json({ error: "seller not found in this tenant" }, { status: 404 });

    const rows = await pgQuery<Record<string, any>>(
      `INSERT INTO public.seller_return_rules
         (tenant_id, seller_id, rule_type, listing_id, conditions, is_active)
       VALUES ($1, $2::uuid, $3, $4::uuid, $5::jsonb, $6)
       RETURNING id::text AS id`,
      [tenant, sellerId, ruleType, listingId, JSON.stringify(conditions), body.is_active !== false]
    );
    if (!rows[0]) return NextResponse.json({ error: "Seller rule could not be written" }, { status: 503 });
    await writeSellerAudit(null, {
      tenantId: tenant, sellerId, actorId, ipAddress: requestIp(req),
      action: "return_rule.created_by_admin", entityType: "seller_return_rule",
      entityId: rows[0]?.id ?? null, afterState: { rule_type: ruleType, listing_id: listingId },
    });
    const full = await pgQuery<Record<string, any>>(
      `SELECT ${SELLER_RULE_COLS} FROM public.seller_return_rules g
         LEFT JOIN public.sellers s ON s.id = g.seller_id WHERE g.id = $1::uuid`,
      [rows[0].id]
    );
    if (!full[0]) return NextResponse.json({ error: "Seller rule re-read did not land" }, { status: 503 });
    return NextResponse.json({ ok: true, rule: full[0] }, { status: 201 });
  }

  // ── leg "exemption": decide a seller's return-policy exemption
  // request (seller_appeals, appeal_type 'return_policy_exemption').
  // The decision stamps the appeals store's own decision columns
  // (decision / decided_by / decided_at — the F2 shape), audits, and
  // notifies the seller, who watches the outcome on their Return rules
  // page (the seller read of this same store).
  if (leg === "exemption") {
    const id = String(body.id || "").trim();
    const decision = String(body.decision || "").trim().toLowerCase();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    if (!["approved", "denied"].includes(decision)) {
      return NextResponse.json({ error: "decision must be approved or denied" }, { status: 400 });
    }
    const before = await pgQuery<{ seller_id: string; status: string }>(
      `SELECT seller_id::text AS seller_id, status FROM public.seller_appeals
        WHERE tenant_id = $1 AND id = $2::uuid AND appeal_type = 'return_policy_exemption'`,
      [tenant, id]
    );
    if (!before.length) return NextResponse.json({ error: "exemption request not found" }, { status: 404 });
    if (before[0].status !== "pending") {
      return NextResponse.json(
        { error: `This exemption request is already ${before[0].status} — a decided request is not re-decided from this desk.` },
        { status: 409 }
      );
    }
    const updated = await pgExec(
      `UPDATE public.seller_appeals
          SET status = $3, decision = $3, decided_by = $4::uuid, decided_at = now(), updated_at = now()
        WHERE tenant_id = $1 AND id = $2::uuid AND status = 'pending'`,
      [tenant, id, decision, actorId]
    );
    if (!updated) return NextResponse.json({ error: "exemption request changed under the decision" }, { status: 409 });
    await writeSellerAudit(null, {
      tenantId: tenant, sellerId: before[0].seller_id, actorId, ipAddress: requestIp(req),
      action: "return_policy_exemption.decided", entityType: "seller_appeal",
      entityId: id,
      beforeState: { status: "pending" },
      afterState: { status: decision, decision, note: body.note ? String(body.note).slice(0, 1000) : null },
    });
    await notifySeller({
      tenantId: tenant,
      sellerId: before[0].seller_id,
      event: "governance",
      type: "return_exemption_decided",
      title: decision === "approved" ? "Return-policy exemption approved" : "Return-policy exemption denied",
      body:
        decision === "approved"
          ? "The platform approved your return-policy exemption request. The exemption is in effect as recorded on your Return rules page."
          : "The platform denied your return-policy exemption request. The platform return policy continues to apply in full.",
      link: "/seller/returns",
    });
    const rows = await pgQuery<Record<string, any>>(
      `SELECT ${EXEMPTION_COLS} FROM public.seller_appeals a
         LEFT JOIN public.sellers s ON s.id = a.seller_id WHERE a.id = $1::uuid`,
      [id]
    );
    return NextResponse.json({ ok: true, request: rows[0] });
  }

  return NextResponse.json({ error: `Unknown leg "${leg}" — use "policy", "seller", or "exemption"` }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  const gate = await requireModuleApi("orders", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => ({}));
  const leg = String(body.leg || "");
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const actorId = await getActorIdFromRequest(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  if (leg === "policy") {
    const sets: string[] = ["updated_at = now()"];
    const params: any[] = [tenant, id];
    const push = (col: string, val: unknown, cast = "") => { params.push(val); sets.push(`${col} = $${params.length}${cast}`); };
    if (body.window_days !== undefined) {
      const d = validWindowDays(body.window_days);
      if (!d) return NextResponse.json({ error: "window_days must be a whole number of days (1–3650)" }, { status: 400 });
      push("window_days", d);
    }
    if (body.is_active !== undefined) push("is_active", body.is_active === true);
    if (body.is_legal_minimum !== undefined) push("is_legal_minimum", body.is_legal_minimum === true);
    if (body.notes !== undefined) push("notes", body.notes === null ? null : String(body.notes).slice(0, 2000));
    if (body.category_label !== undefined) push("category_label", body.category_label === null ? null : String(body.category_label).slice(0, 200));
    if (sets.length <= 1) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    const updated = await pgExec(
      `UPDATE public.return_policy_rules SET ${sets.join(", ")} WHERE tenant_id = $1 AND id = $2::uuid`,
      params
    );
    if (!updated) return NextResponse.json({ error: "policy rule not found" }, { status: 404 });
    await auditAction({ action: "return_policy_rule_updated", domain: "commerce", tableName: "return_policy_rules", recordId: id, actorUserId: actorId, ipAddress: ip, afterData: { fields: Object.keys(body) } });
    const rows = await pgQuery<Record<string, any>>(
      `SELECT ${POLICY_COLS} FROM public.return_policy_rules WHERE id = $1::uuid`, [id]
    );
    return NextResponse.json({ ok: true, rule: rows[0] });
  }

  if (leg === "seller") {
    const sets: string[] = ["updated_at = now()"];
    const params: any[] = [tenant, id];
    const push = (col: string, val: unknown, cast = "") => { params.push(val); sets.push(`${col} = $${params.length}${cast}`); };
    if (body.is_active !== undefined) push("is_active", body.is_active === true);
    if (body.rule_type !== undefined) push("rule_type", String(body.rule_type).trim().slice(0, 80) || "general");
    if (body.listing_id !== undefined) push("listing_id", body.listing_id ? String(body.listing_id) : null, "::uuid");
    if (body.conditions !== undefined) {
      if (typeof body.conditions !== "object" || body.conditions === null) {
        return NextResponse.json({ error: "conditions must be a JSON object" }, { status: 400 });
      }
      push("conditions", JSON.stringify(body.conditions), "::jsonb");
    }
    if (sets.length <= 1) return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    const before = await pgQuery<{ seller_id: string }>(
      `SELECT seller_id::text AS seller_id FROM public.seller_return_rules WHERE tenant_id = $1 AND id = $2::uuid`,
      [tenant, id]
    );
    if (!before.length) return NextResponse.json({ error: "seller rule not found" }, { status: 404 });
    const updated = await pgExec(
      `UPDATE public.seller_return_rules SET ${sets.join(", ")} WHERE tenant_id = $1 AND id = $2::uuid`,
      params
    );
    if (!updated) return NextResponse.json({ error: "seller rule not found" }, { status: 404 });
    await writeSellerAudit(null, {
      tenantId: tenant, sellerId: before[0].seller_id, actorId, ipAddress: requestIp(req),
      action: "return_rule.updated_by_admin", entityType: "seller_return_rule",
      entityId: id, afterState: { fields: Object.keys(body) },
    });
    const rows = await pgQuery<Record<string, any>>(
      `SELECT ${SELLER_RULE_COLS} FROM public.seller_return_rules g
         LEFT JOIN public.sellers s ON s.id = g.seller_id WHERE g.id = $1::uuid`,
      [id]
    );
    return NextResponse.json({ ok: true, rule: rows[0] });
  }

  return NextResponse.json({ error: `Unknown leg "${leg}" — use "policy" or "seller"` }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireModuleApi("orders", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => ({}));
  const leg = String(body.leg || "");
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (leg !== "policy") {
    return NextResponse.json({ error: "Only policy rules are deleted from the desk — seller rules are deactivated (PATCH is_active: false), never erased, so a seller's recorded configuration is not destroyed by oversight" }, { status: 400 });
  }
  const actorId = await getActorIdFromRequest(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const deleted = await pgExec(
    `DELETE FROM public.return_policy_rules WHERE tenant_id = $1 AND id = $2::uuid`,
    [tenant, id]
  );
  if (!deleted) return NextResponse.json({ error: "policy rule not found" }, { status: 404 });
  await auditAction({ action: "return_policy_rule_deleted", domain: "commerce", tableName: "return_policy_rules", recordId: id, actorUserId: actorId, ipAddress: ip });
  return NextResponse.json({ ok: true, id });
}
