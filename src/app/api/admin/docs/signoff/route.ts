import { NextRequest, NextResponse } from "next/server";
import { withPg } from "@/lib/crm/enterprise";
import {
  requireDocs, resolveTenantId, isMissingTable, DOCS_SCHEMA_MSG,
  masterTenantId, docsAudit,
} from "@/lib/admin/docs-store";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";

export const dynamic = "force-dynamic";

// S4 · Master sign-off for tenant policy-class articles.
// POST /api/admin/docs/signoff { article_id, decision: 'approved'|'rejected' }
//
// The caller must be operating as the MASTER tenant (the identity-bound
// resolved tenant IS the master) and hold docs.publish. The target must
// be another tenant's content_type='policy' article. The decision lands
// on the article row (signoff_status/by/at, migration 20261112) and in
// the doc audit log. Approval does not publish the article — the tenant
// publishes it themselves afterwards; the publish route refuses until
// this approval exists. A master session deciding on its OWN articles is
// refused: master content never needed sign-off, and self-approval of a
// tenant row is exactly the cross-tenant write S4 forbids in reverse.

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const denied = await requireDocs(req, "publish");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  const b = await req.json().catch(() => ({}));
  const articleId = String(b.article_id || "");
  const decision = String(b.decision || "");
  if (!UUID_RE.test(articleId)) {
    return NextResponse.json({ error: "article_id must be a uuid." }, { status: 400 });
  }
  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json({ error: "decision must be 'approved' or 'rejected'." }, { status: 400 });
  }
  const actorId = await getActorIdFromRequest(req);

  try {
    const out = await withPg(async (c) => {
      const masterId = await masterTenantId(c);
      if (!masterId || tenant !== masterId) {
        return { error: "Only a master-tenant session can sign off tenant policy content.", status: 403 } as const;
      }
      const { rows } = await c.query(
        `SELECT id, tenant_id, content_type, signoff_status, title
           FROM public.doc_articles WHERE id = $1::uuid`,
        [articleId],
      );
      const row = rows[0];
      if (!row) return { error: "Article not found.", status: 404 } as const;
      if (String(row.tenant_id) === tenant) {
        return { error: "This article belongs to the master tenant — it needs no sign-off.", status: 400 } as const;
      }
      if (row.content_type !== "policy") {
        return { error: "Sign-off applies to policy-class articles only.", status: 400 } as const;
      }
      const { rows: upd } = await c.query(
        `UPDATE public.doc_articles
            SET signoff_status = $1, signoff_by = $2, signoff_at = now(), updated_at = now()
          WHERE id = $3::uuid
          RETURNING *`,
        [decision, actorId, articleId],
      );
      return { article: upd[0], before: { signoff_status: row.signoff_status } } as const;
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status });

    await docsAudit({
      tenant,
      action: decision === "approved" ? "article.signoff_approved" : "article.signoff_rejected",
      entityType: "article",
      entityId: articleId,
      before: out.before,
      after: { signoff_status: decision },
      req,
    });
    return NextResponse.json({ article: out.article });
  } catch (e) {
    if (isMissingTable(e))
      return NextResponse.json({ error: DOCS_SCHEMA_MSG, missing: true }, { status: 503 });
    return NextResponse.json({ error: "Could not record the sign-off." }, { status: 500 });
  }
}
