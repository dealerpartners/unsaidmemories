import { NextRequest, NextResponse } from "next/server";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";
import { resolveTenantId } from "@/lib/admin-api";
import { getActorIdFromRequest } from "@/lib/quick-actions/audit";
import {
  getSellerRiskFile,
  reinstateSeller,
  sellerDirectedAct,
  OperatorRefusal,
} from "@/lib/ai-ops/operator";
import { UUID_RE, type PolicyCitation } from "@/lib/ai-ops/operator-core";

// ---------------------------------------------------------------------------
// /api/admin/ai-ops/operator/sellers/[id] — the high-risk seller file.
//
// GET: ONE assembled view of the seller's recorded risk facts — cases
// (with their temporary-suspension facts), violations, appeals and
// investigations, KPI facts + snapshots, returns/refunds, listings
// (including listings under applied brand opt-outs), brand
// authorizations, the payout-delay policy, and the seller's operator
// detections. Every fact from its own store; nothing blended.
//
// POST { act, citation, reason, case_id? }: the governed acts aimed from
// the file — open_case · suspend_seller_temporary · notify · reinstate.
// Same hard gate as the detection responses: reason always; a cited
// policy that resolves for the consequential acts.
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireModuleApi("ai_ops", "read");
  if (denied) return denied;
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Seller id must be a uuid." }, { status: 400 });
  }
  const file = await withPg(async (c) => {
    const tenant = await resolveTenantId(c as any);
    return getSellerRiskFile(c as any, tenant, id);
  }).catch(() => undefined);
  if (file === undefined) {
    return NextResponse.json({ error: "Risk file read failed." }, { status: 500 });
  }
  if (!file) {
    return NextResponse.json({ error: "Seller not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, risk_file: file });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireModuleApi("ai_ops", "write");
  if (denied) return denied;
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Seller id must be a uuid." }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const act = typeof body?.act === "string" ? body.act : "";
  const reason = typeof body?.reason === "string" ? body.reason : "";
  const citation: PolicyCitation | null =
    body?.citation && typeof body.citation === "object"
      ? {
          source: body.citation.source,
          id: body.citation.id ?? null,
          title: body.citation.title ?? null,
          version: typeof body.citation.version === "number" ? body.citation.version : null,
        }
      : null;
  const actorId = await getActorIdFromRequest(req);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  try {
    if (act === "reinstate") {
      const caseId = typeof body?.case_id === "string" ? body.case_id : "";
      if (!caseId) {
        return NextResponse.json(
          { error: "case_id is required to lift a suspension." },
          { status: 400 },
        );
      }
      const result = await withPg(async (c) => {
        const tenant = await resolveTenantId(c as any);
        return reinstateSeller(c as any, tenant, actorId, ip, caseId, reason);
      });
      return NextResponse.json({ ok: true, ...result });
    }
    if (act === "open_case" || act === "suspend_seller_temporary" || act === "notify") {
      const result = await withPg(async (c) => {
        const tenant = await resolveTenantId(c as any);
        return sellerDirectedAct(c as any, tenant, actorId, ip, {
          seller_id: id,
          act,
          citation: citation as PolicyCitation,
          reason,
        });
      });
      return NextResponse.json({ ok: true, ...result });
    }
    return NextResponse.json(
      { error: "act must be open_case, suspend_seller_temporary, notify, or reinstate." },
      { status: 400 },
    );
  } catch (e) {
    if (e instanceof OperatorRefusal) {
      const status = e.kind === "missing" ? 404 : e.kind === "state" ? 409 : 400;
      return NextResponse.json({ error: e.message }, { status });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Act failed." },
      { status: 500 },
    );
  }
}
