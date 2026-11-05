import { NextResponse } from "next/server";
import { requireCrmAdmin } from "@/lib/admin/gate";
import { getDb, getTenantId, getCustomer } from "@/lib/crm/data";

export const dynamic = "force-dynamic";

/**
 * Tree 1.3 Communication action — Add to Campaign. Enrolls the customer in
 * an existing campaign/automation as a real crm_campaign_members row with
 * status "enrolled". Sends nothing by itself: the campaign/automation's
 * own run path is what delivers, and it records the real status.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireCrmAdmin(req);
  if ("response" in gate) return gate.response;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const campaignId = body?.campaign_id as string | undefined;
  if (!campaignId) return NextResponse.json({ error: "campaign_id is required." }, { status: 400 });

  const db = getDb();
  const tenantId = await getTenantId(db);
  const customer = await getCustomer(db, tenantId, id);
  if (!customer) return NextResponse.json({ error: "Customer not found." }, { status: 404 });

  const { data: campaign } = await db
    .from("crm_campaigns")
    .select("id, name, campaign_type")
    .eq("tenant_id", tenantId)
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if ((campaign as { campaign_type: string }).campaign_type === "message_template") {
    return NextResponse.json({ error: "Templates are not campaigns — pick a campaign or automation." }, { status: 422 });
  }

  const { data: existing } = await db
    .from("crm_campaign_members")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("customer_id", id)
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "Customer is already a member of this campaign." }, { status: 409 });

  const { data, error } = await db
    .from("crm_campaign_members")
    .insert({ tenant_id: tenantId, campaign_id: campaignId, customer_id: id, status: "enrolled" })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, member_id: data.id });
}
