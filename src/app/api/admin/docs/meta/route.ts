import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireDocs } from "@/lib/admin/docs-store";
import { withPg } from "@/lib/crm/enterprise";
import { isMissingTable, DOCS_SCHEMA_MSG } from "@/lib/admin/docs-store";

export const dynamic = "force-dynamic";

// GET /api/admin/docs/meta -> { domains, sections, audiences }
// Dropdown data for the article/section editors.
export async function GET(req: NextRequest) {
  const denied = await requireDocs(req, "read");
  if (denied) return denied;
  const tenant = resolveTenantId(req);
  try {
    const out = await withPg(async (c) => {
      const [d, s, a] = await Promise.all([
        c.query(`SELECT * FROM public.doc_domains WHERE tenant_id = $1 ORDER BY sort`, [tenant]),
        c.query(
          `SELECT s.*, d.slug AS domain_slug, d.title AS domain_title
             FROM public.doc_sections s
             LEFT JOIN public.doc_domains d ON d.id = s.domain_id AND d.tenant_id = s.tenant_id
            WHERE s.tenant_id = $1
            ORDER BY d.sort NULLS LAST, s.sort NULLS LAST, s.number`,
          [tenant],
        ),
        c.query(`SELECT * FROM public.doc_audiences WHERE tenant_id = $1 ORDER BY sort`, [tenant]),
      ]);
      return { domains: d.rows, sections: s.rows, audiences: a.rows };
    });
    if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    return NextResponse.json(out);
  } catch (e) {
    if (isMissingTable(e))
      return NextResponse.json({ error: DOCS_SCHEMA_MSG, missing: true }, { status: 503 });
    return NextResponse.json({ error: "Could not load metadata." }, { status: 500 });
  }
}
