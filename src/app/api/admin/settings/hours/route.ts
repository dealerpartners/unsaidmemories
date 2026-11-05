import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/settings/hours — the Booking Rules & Policies screen's read
// model: operating hours + holiday blackouts + the online-booking gate for
// the resolved tenant.
//
// Hours live in crm_operating_hours (written by the org_edit_hours quick
// action — the same rows src/lib/booking/availability.ts enforces). The
// screen edits the tenant's default CRM location: the first crm_locations
// row by created_at, matching edit_business_profile's targeting. Blackouts
// live in crm_holiday_blackouts (org_add_blackout mirrors them into
// blocked_times, which availability also enforces). The self-booking gate
// is the canonical settings-store key online_booking_enabled, the exact key
// the org_toggle_booking action writes and the public booking endpoint
// (/api/cms/[...slug]) checks.
export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("administration", "read");
  if (gate) return gate;

  try {
    const tenant = resolveTenantId(req);

    const locRows = await pgQuery<{ id: string; name: string }>(
      `SELECT id::text AS id, name FROM public.crm_locations
        WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [tenant],
    );
    const location = locRows[0] ?? null;

    const hours = location
      ? await pgQuery<{
          day_of_week: number;
          opens_at: string | null;
          closes_at: string | null;
          is_closed: boolean;
        }>(
          `SELECT day_of_week, opens_at::text AS opens_at, closes_at::text AS closes_at, is_closed
             FROM public.crm_operating_hours
            WHERE tenant_id = $1 AND location_id = $2::uuid
            ORDER BY day_of_week`,
          [tenant, location.id],
        )
      : [];

    const blackouts = await pgQuery<{
      id: string;
      name: string;
      blackout_date: string;
      end_date: string;
      location_id: string | null;
    }>(
      `SELECT id::text AS id, name, blackout_date::text AS blackout_date,
              end_date::text AS end_date, location_id::text AS location_id
         FROM public.crm_holiday_blackouts
        WHERE tenant_id = $1
        ORDER BY blackout_date`,
      [tenant],
    );

    const gateRows = await pgQuery<{ value_text: string | null }>(
      `SELECT value_text FROM public.cms_global_content
        WHERE tenant_id = $1 AND content_key = 'online_booking_enabled' AND locale = 'en-US'
        LIMIT 1`,
      [tenant],
    );
    // No row = the gate was never toggled = booking is on (the public
    // endpoint only blocks when the stored value is exactly "false").
    const onlineBookingEnabled = gateRows.length ? gateRows[0].value_text !== "false" : true;

    return NextResponse.json({ location, hours, blackouts, onlineBookingEnabled });
  } catch (err: any) {
    console.error("[GET /api/admin/settings/hours]", err);
    return NextResponse.json({ error: err?.message || "Failed to load booking rules" }, { status: 500 });
  }
}
