// Shared helpers for /api/admin/docs/* routes (Document Center management).
//
// Permission model (Sunny's locked spec):
//   docs.read    — view tree / articles / versions
//   docs.write   — create + edit drafts, create sections
//   docs.publish — publish / retire / restore
//   docs.manage  — reorder, section metadata, delete drafts
// read/write ride the established requireModuleApi("docs", …) gate;
// publish/manage are action keys (portal_action_permissions), following the
// vet/pharmacy action-toggle precedent. Owners and full admins bypass.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { resolveTenantId, ACTIVE_TENANT_COOKIE } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { requireAdminApi } from "@/lib/admin/gate";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/portal-auth";
import { getCurrentUser } from "@/lib/auth/server";
import { withPg } from "@/lib/crm/enterprise";

export const DOCS_SCHEMA_MSG =
  "The Document Center tables are missing — run the Document Center schema in Supabase first.";

export const DOCS_STATUSES = ["draft", "published", "retired"] as const;
export const DOCS_CONTENT_TYPES = ["article", "tooltip", "policy", "faq", "reference"] as const;

export type DocsCapability = "read" | "write" | "publish" | "manage";

export function isMissingTable(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  const msg = e instanceof Error ? e.message : String(e);
  return code === "42P01" || (/doc_\w+/i.test(msg) && /does not exist/i.test(msg));
}

/** The master tenant ('UnSaid Memories'), by its canonical slug — the
 *  same identification lib/admin/tenant-resolution uses. Null only when
 *  no such row exists; a failed read throws to the caller's error path. */
export async function masterTenantId(
  client: { query: (t: string, p?: unknown[]) => Promise<{ rows: any[] }> },
): Promise<string | null> {
  // A failed read throws: callers make tenant-policy decisions from this
  // value, so a failure must surface as an error, never as "not the master
  // tenant" (null here means only that the row genuinely does not exist).
  const { rows } = await client.query(
    `SELECT id::text AS id FROM public.tenants WHERE slug = 'all-about-portal' LIMIT 1`,
  );
  return rows[0]?.id ?? null;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function callerEmail(req: NextRequest): Promise<string | null> {
  try {
    const payload = verifySessionToken((await cookies()).get(SESSION_COOKIE_NAME)?.value);
    if (payload?.email) return payload.email.toLowerCase();
  } catch { /* fall through */ }
  try {
    const u = await getCurrentUser();
    if (u?.email) return u.email.toLowerCase();
  } catch { /* fall through */ }
  return null;
}

/**
 * Action-key check for docs.publish / docs.manage.
 * Full admins (requireAdminApi pass) and owners bypass; everyone else needs
 * an explicit portal_action_permissions grant. Fail closed: when the check
 * itself can't run, deny.
 */
async function docsActionAllowed(req: NextRequest, actionKey: "docs.publish" | "docs.manage"): Promise<boolean> {
  const adminGate = await requireAdminApi();
  if (!adminGate) return true;
  try {
    const email = await callerEmail(req);
    if (!email) return false;
    const row = await withPg(async (c) => {
      const { rows } = await c.query(
        `SELECT pu.is_owner,
                EXISTS (SELECT 1 FROM public.portal_action_permissions ap
                         WHERE ap.portal_user_id = pu.id
                           AND ap.action_key = $2
                           AND ap.is_allowed) AS allowed
           FROM public.portal_users pu
          WHERE lower(pu.email) = $1
          ORDER BY pu.is_owner DESC
          LIMIT 1`,
        [email, actionKey],
      );
      return rows[0] || null;
    });
    if (!row) return false;
    return !!row.is_owner || !!row.allowed;
  } catch {
    return false;
  }
}

/** Capability gate for Document Center admin APIs. Returns a denial response or null. */
export async function requireDocs(req: NextRequest, cap: DocsCapability): Promise<NextResponse | null> {
  const denied = await requireModuleApi("docs", cap === "read" ? "read" : "write");
  if (denied) return denied;
  if (cap === "publish" || cap === "manage") {
    const ok = await docsActionAllowed(req, `docs.${cap}` as "docs.publish" | "docs.manage");
    if (!ok)
      return NextResponse.json(
        { error: `docs.${cap} permission is required for this action.` },
        { status: 403 },
      );
  }
  return null;
}

/** Best-effort audit write to public.doc_audit_log. Never throws, never breaks the main write. */
export async function docsAudit(opts: {
  tenant: string;
  action: string;
  entityType: "article" | "section";
  entityId: string;
  before?: unknown;
  after?: unknown;
  req?: NextRequest;
}): Promise<void> {
  try {
    let actorEmail: string | null = null;
    let actorUserId: string | null = null;
    try {
      const u = await getCurrentUser();
      actorEmail = u?.email?.toLowerCase() || null;
      actorUserId = (u as { id?: string } | null)?.id || null;
    } catch { /* best effort */ }
    let ip: string | null = null;
    try {
      ip = opts.req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    } catch { /* best effort */ }
    await withPg(async (c) => {
      await c.query(
        `INSERT INTO public.doc_audit_log
           (tenant_id, actor_user_id, actor_email, action, entity_type, entity_id,
            before_data, after_data, ip_address)
         VALUES ($1, $2::uuid, $3, $4, $5, $6::uuid, $7::jsonb, $8::jsonb, $9::inet)`,
        [
          opts.tenant,
          actorUserId,
          actorEmail,
          opts.action,
          opts.entityType,
          opts.entityId,
          opts.before === undefined ? null : JSON.stringify(opts.before),
          opts.after === undefined ? null : JSON.stringify(opts.after),
          ip,
        ],
      );
    });
  } catch {
    // doc_audit_log missing or unreachable — audit is best-effort by spec.
  }
}

/** Revalidate the public /docs paths affected by a content change. Non-fatal. */
export function revalidateDocPaths(
  domainSlug?: string | null,
  sectionSlug?: string | null,
  articleSlug?: string | null,
): void {
  try {
    revalidatePath("/docs");
    if (domainSlug && sectionSlug && articleSlug)
      revalidatePath(`/docs/${domainSlug}/${sectionSlug}/${articleSlug}`);
  } catch {
    /* non-fatal */
  }
}

export { resolveTenantId, ACTIVE_TENANT_COOKIE };
