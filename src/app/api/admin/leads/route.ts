import { NextRequest, NextResponse } from "next/server"
import { pgQueryStrict } from "@/lib/pg"
import { requireAdminApi } from "@/lib/admin/gate"
import { resolveTenantId } from "@/lib/admin-api"

// GET /api/admin/leads — list CRM leads (partner applications feed the pipeline).
// ?status=new|contacted|qualified|booking_pending|booked|converted|lost|no_response
// ?source=partner_grooming|...

export const dynamic = "force-dynamic"

// Real crm_leads.status CHECK vocabulary. ('closed' was here before and is
// NOT a stored status — saving it could only fail.)
const STATUSES = new Set(["new", "contacted", "qualified", "booking_pending", "booked", "converted", "lost", "no_response"])
// B.1.16 booking outcomes — crm_leads.booking_outcome CHECK vocabulary.
const BOOKING_OUTCOMES = new Set(["booked", "pending", "cancelled", "lost", "no_response"])
// B.1.17 lost reasons — crm_leads.lost_reason CHECK vocabulary (snake_case
// keys of the crm_lost_reasons config rows seeded for the tenant).
const LOST_REASONS = new Set(["price", "schedule", "location", "no_availability", "found_another_groomer", "other"])

export async function GET(req: NextRequest) {
  const gate = await requireAdminApi()
  if (gate) return gate
  const tenantId = await resolveTenantId(req)
  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") || ""
  const source = searchParams.get("source") || ""
  const q = searchParams.get("q") || ""

  const conds: string[] = ["tenant_id = $1"]
  const params: unknown[] = [tenantId]
  let i = 2

  if (status && STATUSES.has(status)) {
    conds.push(`status = $${i++}`)
    params.push(status)
  }
  if (source) {
    conds.push(`lead_source = $${i++}`)
    params.push(source)
  }
  if (q) {
    conds.push(`(contact_name ilike $${i} or email ilike $${i} or coalesce(notes,'') ilike $${i})`)
    params.push(`%${q}%`)
    i++
  }

  try {
    const rows = await pgQueryStrict(
      `select id, contact_name, email, phone, lead_source, lead_type, status,
              booking_outcome, lost_reason,
              lead_source_id, lead_owner_id,
              first_contact_at, last_activity_at, conversion_date,
              notes, next_follow_up_at, created_at, updated_at
       from crm_leads
       where ${conds.join(" and ")}
       order by created_at desc
       limit 200`,
      params,
    )

    // Status counts for the filter tabs
    const counts = await pgQueryStrict<{ status: string; n: string }>(
      `select status, count(*)::text as n from crm_leads
       where tenant_id = $1 group by status`,
      [tenantId],
    )

    // Single-lead read (?id=) also returns the lead's activity feed —
    // crm_lead_activities, written by every PATCH below (audit §1.15.4).
    const singleId = searchParams.get("id") || ""
    let activities: unknown[] = []
    if (singleId) {
      activities = await pgQueryStrict(
        `select id, activity_type, occurred_at, notes, metadata
           from crm_lead_activities
          where tenant_id = $1 and lead_id = $2::uuid
          order by occurred_at desc
          limit 50`,
        [tenantId, singleId],
      ).catch(() => [])
    }

    return NextResponse.json({ ok: true, leads: rows, counts, activities })
  } catch (e) {
    const code = (e as { code?: string } | null)?.code
    const msg = e instanceof Error ? e.message : String(e)
    if (code === "42P01" || /relation .* does not exist/i.test(msg)) {
      return NextResponse.json({ ok: true, leads: [], counts: [], missing: true })
    }
    console.error("[admin/leads]", e)
    return NextResponse.json({ error: "Could not load leads." }, { status: 500 })
  }
}

// PATCH /api/admin/leads — update lead status / follow-up / outcome / owner.
// Body: { id, status?, next_follow_up_at?, notes?, booking_outcome?,
//         lost_reason?, lead_owner_id? }
// booking_outcome is the B.1.16 store on the lead; when it is 'lost' the
// B.1.17 lost_reason (CHECK vocabulary) is stored with it, and moving away
// from 'lost' clears the reason.
// Audit §1.15: lead_owner_id is assignable here (validated against the
// tenant's crm_staff); every PATCH is an activity — it stamps
// last_activity_at and appends a crm_lead_activities row; and a transition
// into converted/booked stamps conversion_date (first conversion wins).
export async function PATCH(req: NextRequest) {
  const gate = await requireAdminApi()
  if (gate) return gate
  const tenantId = await resolveTenantId(req)
  const b = await req.json().catch(() => null)
  const id = typeof b?.id === "string" ? b.id : ""
  if (!id) return NextResponse.json({ error: "Lead id required." }, { status: 400 })

  // Current state — conversion stamping and the activity record both
  // depend on what actually changed.
  let current: { status: string; conversion_date: string | null }[]
  try {
    current = await pgQueryStrict<{ status: string; conversion_date: string | null }>(
      `select status, conversion_date from crm_leads where tenant_id = $1 and id = $2::uuid`,
      [tenantId, id],
    )
  } catch (e) {
    console.error("[admin/leads PATCH] lead read failed:", e)
    return NextResponse.json({ error: "Could not update lead." }, { status: 500 })
  }
  if (!current.length) return NextResponse.json({ error: "Lead not found." }, { status: 404 })

  const sets: string[] = ["updated_at = now()", "last_activity_at = now()"]
  const params: unknown[] = [tenantId, id]
  let i = 3
  const changes: Record<string, unknown> = {}

  if (b.status && STATUSES.has(String(b.status))) {
    sets.push(`status = $${i++}`)
    params.push(String(b.status))
    changes.status = String(b.status)
  }
  if (typeof b.next_follow_up_at === "string" && b.next_follow_up_at) {
    sets.push(`next_follow_up_at = $${i++}`)
    params.push(b.next_follow_up_at)
    changes.next_follow_up_at = b.next_follow_up_at
  }
  if (typeof b.notes === "string") {
    sets.push(`notes = $${i++}`)
    params.push(b.notes.slice(0, 2000))
    changes.notes = true
  }
  if (b.booking_outcome !== undefined) {
    if (b.booking_outcome !== null && !BOOKING_OUTCOMES.has(String(b.booking_outcome))) {
      return NextResponse.json({ error: "Invalid booking outcome." }, { status: 400 })
    }
    sets.push(`booking_outcome = $${i++}`)
    params.push(b.booking_outcome === null ? null : String(b.booking_outcome))
    changes.booking_outcome = b.booking_outcome === null ? null : String(b.booking_outcome)
    if (b.booking_outcome !== "lost") {
      // Leaving 'lost' clears the reason unless one is explicitly sent.
      if (b.lost_reason === undefined) {
        sets.push(`lost_reason = $${i++}`)
        params.push(null)
      }
    }
  }
  if (b.lost_reason !== undefined) {
    if (b.lost_reason !== null && !LOST_REASONS.has(String(b.lost_reason))) {
      return NextResponse.json({ error: "Invalid lost reason." }, { status: 400 })
    }
    sets.push(`lost_reason = $${i++}`)
    params.push(b.lost_reason === null ? null : String(b.lost_reason))
    changes.lost_reason = b.lost_reason === null ? null : String(b.lost_reason)
  }
  // §1.15.1 — lead owner assignment. lead_owner_id is an FK to crm_staff;
  // validate the assignee is a staff row of THIS tenant so the write can
  // never point at a foreign or invented owner. null clears the owner.
  if (b.lead_owner_id !== undefined) {
    if (b.lead_owner_id !== null) {
      const ownerId = String(b.lead_owner_id)
      let staff: unknown[]
      try {
        staff = await pgQueryStrict(
          `select id from crm_staff where tenant_id = $1 and id = $2::uuid limit 1`,
          [tenantId, ownerId],
        )
      } catch (e) {
        console.error("[admin/leads PATCH] owner validation failed:", e)
        return NextResponse.json({ error: "Could not update lead." }, { status: 500 })
      }
      if (!staff.length) return NextResponse.json({ error: "Lead owner is not a staff member of this tenant." }, { status: 400 })
      sets.push(`lead_owner_id = $${i++}`)
      params.push(ownerId)
    } else {
      sets.push(`lead_owner_id = $${i++}`)
      params.push(null)
    }
    changes.lead_owner_id = b.lead_owner_id === null ? null : String(b.lead_owner_id)
  }
  // §1.15.7 — conversion date: stamped on the transition INTO a converted
  // state (status converted/booked, or booking_outcome booked) when not
  // already stamped. First conversion wins; later edits never rewrite it.
  const converting =
    (typeof b.status === "string" && (b.status === "converted" || b.status === "booked") && current[0].status !== b.status) ||
    (b.booking_outcome === "booked")
  if (converting && !current[0].conversion_date) {
    sets.push(`conversion_date = now()`)
    changes.conversion_date = "stamped"
  }

  try {
    const rows = await pgQueryStrict<{ id: string }>(
      `update crm_leads set ${sets.join(", ")}
       where tenant_id = $1 and id = $2
       returning id`,
      params,
    )
    if (!rows.length) return NextResponse.json({ error: "Lead not found." }, { status: 404 })

    // §1.15.4 — the activity store leg: one crm_lead_activities row per
    // PATCH, typed by the strongest signal in the change (the table's
    // CHECK vocabulary is contact-event oriented; generic updates record
    // as 'note' with the change set in metadata). Logged loudly on
    // failure — the lead update itself has already landed.
    const activityType =
      changes.status === "converted" || changes.conversion_date === "stamped" ? "converted"
      : changes.status === "lost" || changes.booking_outcome === "lost" ? "lost"
      : changes.status === "contacted" ? "contacted"
      : "note"
    await pgQueryStrict(
      `insert into crm_lead_activities
         (id, tenant_id, lead_id, activity_type, occurred_at, metadata, notes, created_at)
       values (gen_random_uuid(), $1, $2::uuid, $3, now(), $4::jsonb, $5, now())`,
      [tenantId, id, activityType, JSON.stringify({ source: "leads_patch", changes }), typeof b.notes === "string" ? b.notes.slice(0, 500) : null],
    ).catch((e) => console.error("[admin/leads PATCH] activity write failed:", e))

    return NextResponse.json({ ok: true, id: rows[0].id })
  } catch (e) {
    console.error("[admin/leads PATCH]", e)
    return NextResponse.json({ error: "Could not update lead." }, { status: 500 })
  }
}
