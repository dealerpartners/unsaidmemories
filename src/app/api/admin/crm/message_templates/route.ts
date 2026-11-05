import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { withPg } from "@/lib/crm/enterprise";

export async function GET(req: NextRequest) {
  const g = await requireModuleApi("communications", "read"); if (g) return g;
  const { searchParams } = new URL(req.url);
  const channel = searchParams.get("channel") || "";
  return withPg(async (c) => {
    const where = ["tenant_id = $1"]; const params: any[] = [resolveTenantId(req)]; let pi = 2;
    if (channel) { where.push(`channel = $${pi}`); params.push(channel); pi++; }
    const r = await c.query(`SELECT id::text, name, channel, subject, body, is_active FROM public.crm_message_templates WHERE ${where.join(" AND ")} ORDER BY name`, params);
    // If no DB templates, return built-in defaults
    if (r.rows.length === 0) {
      return NextResponse.json({ templates: [
        { id: "ready-pickup", name: "Ready for Pickup", channel: "sms", body: "Hi {customerName}! {petName} is finished and looking fabulous! Ready for pickup at UnSaid Memories salon." },
        { id: "reminder", name: "Appointment Reminder", channel: "sms", body: "Reminder: {petName}'s grooming appointment is scheduled for {date} at {time}. Reply C to confirm." },
        { id: "progress", name: "Progress Update", channel: "sms", body: "Quick update: {petName} is in the bath and doing great! We'll text again when drying and scissor work is complete." },
        { id: "followup", name: "Post-Groom Follow-up", channel: "email", body: "Hi {customerName}! How is {petName} feeling after today's groom? Let us know if you need anything!" },
      ], total: 4, source: "defaults" });
    }
    return NextResponse.json({ templates: r.rows, total: r.rows.length, source: "database" });
  }).then((r) => r ?? NextResponse.json({ error: "DB unavailable" }, { status: 503 })).catch((e) => NextResponse.json({ error: e?.message }, { status: 500 }));
}
