import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getTenantId } from "@/lib/tenant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORM_TENANT_ID = getTenantId();

// GET /api/orders — admin order list.
// Adapted from petstore GET /api/admin/orders: status filter, search, pagination.
// Query params: ?status=pending|paid|fulfilled|cancelled|refunded  ?q=email_or_id  ?page=1  ?perPage=25
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const q = req.nextUrl.searchParams.get("q");
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1", 10) || 1);
  const perPage = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("perPage") || "25", 10) || 25));

  const sb = createServerClient();
  let query = sb.from("orders")
    .select("id, customer_id, status, total, shipping_method, created_at, stripe_payment_intent_id", { count: "exact" })
    .eq("tenant_id", PLATFORM_TENANT_ID)
    .order("created_at", { ascending: false })
    .range((page - 1) * perPage, page * perPage - 1);

  if (status) query = query.eq("status", status);
  if (q) query = query.or(`id.ilike.%${q}%,customer_id.ilike.%${q}%`);

  const { data: orders, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    orders: orders ?? [],
    total: count ?? 0,
    page,
    perPage,
  });
}
