import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import {
  listSitePolicies,
  getSitePolicy,
  createSitePolicy,
  updateSitePolicy,
} from "@/lib/policies/site-policies";

export const dynamic = "force-dynamic";

// BL-13 (twin-store consolidation): site policies live in the ONE policy
// store — public.seller_policies, the store the marketplace console,
// versions, precedence, and enforcement also run on. This route is the
// admin CRUD surface for the site-policy set inside that store — same
// contract the admin policies pages and the Legal & Waivers screen have
// always used. The doc store's policy content-type is retired as a
// policy store (never touched here).

// GET /api/admin/policies          -> { policies: [...] } ordered by sort
// GET /api/admin/policies?id=<id>  -> { policy: {...} | null }
export async function GET(req: NextRequest) {
  const denied = await requireModuleApi("policies", "read");
  if (denied) return denied;
  const id = (req.nextUrl.searchParams.get("id") || "").trim();
  const tenant = resolveTenantId(req);

  const out = await withPg(async (c) => {
    if (id) {
      const policy = await getSitePolicy(c, tenant, id);
      return { policy };
    }
    const policies = await listSitePolicies(c, tenant);
    return { policies };
  });
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  return NextResponse.json(out);
}

// POST /api/admin/policies  { title, body } -> creates a published policy article
export async function POST(req: NextRequest) {
  const denied = await requireModuleApi("policies", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const title = String(b.title || "").trim();
  const body = String(b.body || "").trim();
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!body) return NextResponse.json({ error: "Body is required" }, { status: 400 });
  const tenant = resolveTenantId(req);

  const out = await withPg(async (c) => {
    const policy = await createSitePolicy(c, tenant, title, body);
    return { policy };
  });
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  return NextResponse.json(out, { status: 201 });
}

// PATCH /api/admin/policies  { id, title, body } -> updates one policy article
export async function PATCH(req: NextRequest) {
  const denied = await requireModuleApi("policies", "write");
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const id = String(b.id || "").trim();
  const title = String(b.title || "").trim();
  const body = String(b.body || "").trim();
  if (!id) return NextResponse.json({ error: "Policy id is required" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  if (!body) return NextResponse.json({ error: "Body is required" }, { status: 400 });
  const tenant = resolveTenantId(req);

  const out = await withPg(async (c) => {
    const policy = await updateSitePolicy(c, tenant, id, title, body);
    return policy ? { policy } : { error: "Policy not found" };
  });
  if (!out) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  if ("error" in out) return NextResponse.json(out, { status: 404 });
  return NextResponse.json(out);
}
