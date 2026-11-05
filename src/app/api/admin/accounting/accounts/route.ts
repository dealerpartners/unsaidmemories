import { NextRequest, NextResponse } from "next/server";
import { adminList, adminCreate, adminQuery, resolveTenantId} from "@/lib/admin-api";
import { pgQuery } from "@/lib/pg";

const TABLE = "acct_chart_of_accounts";
const SCHEMA = "public";
const SEARCH_COLS = ["name", "code", "account_type"];

export async function GET(req: NextRequest) {
  const q = adminQuery(req);
  return adminList(TABLE, { tenantId: resolveTenantId(req),
    schema: SCHEMA,
    search: q.search,
    searchCols: SEARCH_COLS,
    limit: q.limit,
    offset: q.offset,
    filters: q.filters,
    ...(q.order ? { order: q.order } : {}),

  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const tenantId = resolveTenantId(req);
  // acct_chart_of_accounts.entity_id is NOT NULL — every account belongs
  // to the tenant's accounting entity. The create form doesn't collect
  // it, so resolve the tenant's entity server-side (the same lookup the
  // journal helper performs); without it the insert dies 23502.
  if (!body.entity_id) {
    const entities = await pgQuery<{ id: string }>(
      `SELECT id FROM public.acct_entities WHERE tenant_id = $1 LIMIT 1`,
      [tenantId],
    ).catch(() => [] as { id: string }[]);
    if (!entities[0]?.id) {
      return NextResponse.json(
        { error: "No accounting entity exists for this tenant — an account cannot be created until the entity is set up" },
        { status: 422 },
      );
    }
    body.entity_id = entities[0].id;
  }
  // normal_balance is also NOT NULL with no default. It follows the
  // account type: assets and expenses carry debit balances, liabilities /
  // equity / revenue carry credit balances (the live chart's convention).
  if (!body.normal_balance) {
    const t = String(body.account_type || "").toLowerCase();
    body.normal_balance = t === "asset" || t === "expense" ? "debit" : "credit";
  }
  return adminCreate(TABLE, body, { tenantId, schema: SCHEMA });
}
