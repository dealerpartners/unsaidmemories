// ============================================================================
// Admin customer metrics — pure computation over existing tables.
// Tables: crm_customers, crm_appointments, commerce_payments, commerce_sales,
//   acct_ar_invoices, crm_unsigned_documents,
//   crm_documents, crm_pet_vaccinations, crm_party_dependents,
//   crm_appointment_services, crm_services, crm_staff.
// No new tables. Failed reads throw — metrics are never computed over a
// fabricated empty result.
//
// MONEY SOURCE (rebuilt 2026-10-13, verified against live data):
// acct_ar_receipts has 0 rows, so the old LTV was $0 for every customer
// forever. Real money lives in:
//   - commerce_payments (status='succeeded'), keyed by crm_customers.id
//     directly on customer_id, or via the payment's commerce_sales row.
//   - public.acct_ar_invoices (the single invoice record since the
//     2026-10-13 consolidation), keyed by source_customer_id, which the
//     write paths fill with either the CRM id or the shop customer id
//     (= crm_customers.source_customer_id), or through the AR customer
//     whose external_customer_id is one of those ids.
// Identity resolution mirrors /api/admin/crm/customers/[id]/payments: the
// identity set for a CRM customer is { crm_customers.id,
// crm_customers.source_customer_id }. Figures reconcile to direct SQL sums
// over exactly those stored keys — no name/email stitching.
// Outstanding balance = (total − amount_paid − amount_credited −
// deposit_paid) summed over open acct_ar_invoices for the identity set.
// ============================================================================
import { withPgStrict, TENANT_ID } from "@/lib/crm/enterprise";

export interface CustomerMetrics {
  lifetimeValue: number;
  totalVisits: number;
  averageTicket: number;
  lastVisitAt: string | null;
  firstVisitAt: string | null;
  averageVisitFrequencyDays: number | null;
  noShowRate: number;
  cancellationRate: number;
  rebookRate: number;
  outstandingBalance: number;
  customerSince: string | null;
  lifecycleStage: string | null;
  totalAppointments: number;
  completedAppointments: number;
  noShowCount: number;
  cancelledCount: number;
}

export interface BehavioralFlags {
  isFrequentVisitor: boolean;
  isHighLifetimeValue: boolean;
  isFrequentNoShow: boolean;
  isCancellationRisk: boolean;
  isPriceSensitive: boolean;
  isOnlineBookingOnly: boolean;
}

export interface OperationalFlags {
  hasMissingDocuments: boolean;
  hasVaccineExpiring: boolean;
  hasOutstandingBalance: boolean;
  hasNoUpcomingAppointment: boolean;
  hasIntakeIncomplete: boolean;
}

export interface MarketingSegments {
  isBirthdayThisMonth: boolean;
  isEligibleForRebookingCampaign: boolean;
  isWinBackCandidate: boolean;
  isNewCustomerNurture: boolean;
  isInactive90Days: boolean;
}

export interface ServiceProfile {
  mostCommonService: string | null;
  mostCommonServiceCount: number;
  averageFrequencyDays: number | null;
  preferredGroomer: string | null;
  preferredGroomerId: string | null;
  averageSpend: number;
  lastService: string | null;
  lastServiceAt: string | null;
  recommendedNextService: string | null;
  recommendedNextVisitAt: string | null;
}

async function q<T = any>(sql: string, params: unknown[]): Promise<T[]> {
  // No fail-soft: a failed read throws (withPgStrict) so callers surface an
  // error instead of computing flags/metrics over a fabricated empty set.
  const rows = await withPgStrict<T[]>((client) =>
    client.query(sql, params).then((r: any) => (r?.rows ?? []) as T[]),
  );
  return rows;
}

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || "");

// ---------------------------------------------------------------------------
// Identity + money helpers (shared by metrics / behavioral / operational)
// ---------------------------------------------------------------------------

interface CustomerIdentity {
  ids: string[];
  createdAt: string | null;
  customerSince: string | null;
  lifecycleStage: string | null;
  dateOfBirth: string | null;
}

/** Resolve a CRM customer's stored-key identity set (see header note). */
async function resolveIdentity(customerId: string): Promise<CustomerIdentity> {
  const t = TENANT_ID();
  const fallback: CustomerIdentity = {
    ids: [customerId],
    createdAt: null,
    customerSince: null,
    lifecycleStage: null,
    dateOfBirth: null,
  };
  if (!isUuid(customerId)) return fallback;
  const [row] = await q<{
    source_customer_id: string | null;
    created_at: string | null;
    customer_since: string | null;
    lifecycle_stage: string | null;
    dob: string | null;
  }>(
    `SELECT source_customer_id,
            created_at::text AS created_at,
            customer_since::text AS customer_since,
            lifecycle_stage,
            date_of_birth::text AS dob
       FROM public.crm_customers WHERE tenant_id=$1 AND id=$2::uuid`,
    [t, customerId],
  );
  if (!row) return fallback;
  const ids = [customerId];
  if (row.source_customer_id && !ids.includes(row.source_customer_id)) {
    ids.push(row.source_customer_id);
  }
  return {
    ids,
    createdAt: row.created_at ?? null,
    customerSince: row.customer_since ?? row.created_at ?? null,
    lifecycleStage: row.lifecycle_stage ?? null,
    dateOfBirth: row.dob ?? null,
  };
}

/**
 * Identity match for the single invoice record (acct_ar_invoices): an
 * invoice belongs to this customer when its source_customer_id is one
 * of the identity ids, or when its AR customer carries one of those ids
 * as external_customer_id.
 */
const INVOICE_IDENTITY_MATCH = `(
  source_customer_id = ANY($2::text[])
  OR customer_id IN (SELECT id FROM public.acct_customers
                      WHERE tenant_id = $1 AND external_customer_id = ANY($2::text[]))
)`;

/**
 * Lifetime value over the identity set: succeeded commerce_payments
 * (direct customer_id or via the sale's customer_id) + the collected
 * portion of invoices (amount_paid + deposit_paid on acct_ar_invoices).
 * Refunded/pending/failed payments are not value received and never count.
 */
async function computeLifetimeValue(ids: string[]): Promise<number> {
  const t = TENANT_ID();
  const [pay, inv] = await Promise.all([
    q<{ rev: string }>(
      `SELECT COALESCE(SUM(p.amount),0)::text AS rev
         FROM public.commerce_payments p
         LEFT JOIN public.commerce_sales s ON s.id = p.sale_id
        WHERE p.tenant_id=$1 AND p.status='succeeded'
          AND (p.customer_id::text = ANY($2::text[]) OR s.customer_id::text = ANY($2::text[]))`,
      [t, ids],
    ),
    q<{ paid: string }>(
      `SELECT COALESCE(SUM(amount_paid + deposit_paid),0)::text AS paid
         FROM public.acct_ar_invoices
        WHERE tenant_id=$1 AND ${INVOICE_IDENTITY_MATCH}`,
      [t, ids],
    ),
  ]);
  return num(pay[0]?.rev) + num(inv[0]?.paid);
}

/**
 * Outstanding balance over the identity set: open invoices' derived
 * balance (total − paid − credited − deposit) on acct_ar_invoices.
 */
async function computeOutstandingBalance(ids: string[]): Promise<number> {
  const t = TENANT_ID();
  const ar = await q<{ bal: string }>(
    `SELECT COALESCE(SUM(total - amount_paid - amount_credited - deposit_paid),0)::text AS bal
       FROM public.acct_ar_invoices
      WHERE tenant_id=$1 AND ${INVOICE_IDENTITY_MATCH}
        AND status NOT IN ('paid','void','cancelled','closed','rejected')`,
    [t, ids],
  );
  return num(ar[0]?.bal);
}

// ---------------------------------------------------------------------------
// 1.6 Customer Metrics
// ---------------------------------------------------------------------------

export async function getCustomerMetrics(customerId: string): Promise<CustomerMetrics> {
  const t = TENANT_ID();
  const identity = await resolveIdentity(customerId);

  const [lifetimeValue, outstandingBalance, apptRows] = await Promise.all([
    computeLifetimeValue(identity.ids),
    computeOutstandingBalance(identity.ids),
    q<{ total: string; completed: string; no_show: string; cancelled: string; first_visit: string | null; last_visit: string | null }>(
      `SELECT COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE status='completed')::text AS completed,
              COUNT(*) FILTER (WHERE status='no_show')::text AS no_show,
              COUNT(*) FILTER (WHERE status='cancelled')::text AS cancelled,
              MIN(starts_at)::text AS first_visit,
              MAX(starts_at) FILTER (WHERE status='completed')::text AS last_visit
         FROM public.crm_appointments WHERE tenant_id=$1 AND customer_id=$2::uuid`,
      [t, customerId],
    ),
  ]);
  const a = apptRows[0];
  const total = num(a?.total);
  const completed = num(a?.completed);
  const noShows = num(a?.no_show);
  const cancelled = num(a?.cancelled);

  let averageVisitFrequencyDays: number | null = null;
  if (a?.first_visit && a?.last_visit && completed > 1) {
    const days = (new Date(a.last_visit).getTime() - new Date(a.first_visit).getTime()) / 86400000;
    if (days >= 0) averageVisitFrequencyDays = Math.round(days / (completed - 1));
  }

  // Rebook rate: completed appointments that were followed by another completed
  // appointment within 2x the average frequency (approx via self-join).
  let rebookRate = 0;
  if (completed > 1) {
    const rb = await q<{ rebooked: string }>(
      `WITH c AS (
         SELECT starts_at FROM public.crm_appointments
          WHERE tenant_id=$1 AND customer_id=$2::uuid AND status='completed'
          ORDER BY starts_at
       ), lead AS (
         SELECT starts_at, LEAD(starts_at) OVER (ORDER BY starts_at) AS next_at FROM c
       )
       SELECT COUNT(*) FILTER (WHERE next_at IS NOT NULL)::text AS rebooked FROM lead`,
      [t, customerId],
    );
    rebookRate = completed > 0 ? num(rb[0]?.rebooked) / completed : 0;
  }

  const denom = num(a?.total) || 0;
  return {
    lifetimeValue,
    totalVisits: completed,
    averageTicket: completed > 0 ? lifetimeValue / completed : 0,
    lastVisitAt: a?.last_visit ?? null,
    firstVisitAt: a?.first_visit ?? null,
    averageVisitFrequencyDays,
    noShowRate: denom > 0 ? noShows / denom : 0,
    cancellationRate: denom > 0 ? cancelled / denom : 0,
    rebookRate,
    outstandingBalance,
    customerSince: identity.customerSince,
    lifecycleStage: identity.lifecycleStage,
    totalAppointments: total,
    completedAppointments: completed,
    noShowCount: noShows,
    cancelledCount: cancelled,
  };
}

// ---------------------------------------------------------------------------
// 1.9 Behavioral flags
// ---------------------------------------------------------------------------

export async function getBehavioralFlags(customerId: string, metrics?: CustomerMetrics): Promise<BehavioralFlags> {
  const m = metrics ?? (await getCustomerMetrics(customerId));
  const t = TENANT_ID();

  // Shop-wide baselines from the REAL stores (commerce_payments for money,
  // crm_appointments for visits). Fall back to fixed thresholds only when
  // the live baseline is empty/degenerate.
  const [payBase] = await q<{ avg_ticket: string }>(
    `SELECT COALESCE(AVG(amount),0)::text AS avg_ticket
       FROM public.commerce_payments
      WHERE tenant_id=$1 AND status='succeeded' AND customer_id IS NOT NULL`,
    [t],
  );
  const [visitBase] = await q<{ avg_visits: string }>(
    `SELECT COALESCE(AVG(sub.visits),0)::text AS avg_visits
       FROM (SELECT customer_id, COUNT(*) AS visits
               FROM public.crm_appointments
              WHERE tenant_id=$1 AND status='completed'
              GROUP BY customer_id) sub`,
    [t],
  );
  const shopAvgTicket = num(payBase?.avg_ticket) || 75;
  const shopAvgVisits = num(visitBase?.avg_visits) || 3;

  // Online booking: crm_appointments has NO metadata column and NO
  // booked_online column (both verified absent live — the old query
  // errored and the flag could never be true). Booking source lives in
  // source_channel ('website_booking_wizard', 'website_consultation', …).
  const [online] = await q<{ n: string; total: string }>(
    `SELECT COUNT(*) FILTER (
              WHERE source_channel LIKE 'website%'
                 OR source_channel IN ('online','self_booking','web')
            )::text AS n,
            COUNT(*)::text AS total
       FROM public.crm_appointments
      WHERE tenant_id=$1 AND customer_id=$2::uuid`,
    [t, customerId],
  );
  const totalN = num(online?.total);

  return {
    isFrequentVisitor: m.totalVisits > shopAvgVisits * 1.5 && m.totalVisits >= 4,
    isHighLifetimeValue: m.lifetimeValue > shopAvgTicket * shopAvgVisits * 1.5 && m.lifetimeValue >= 300,
    isFrequentNoShow: m.noShowRate > 0.2 && m.noShowCount >= 2,
    isCancellationRisk: m.cancellationRate > 0.25 && m.cancelledCount >= 2,
    isPriceSensitive: m.averageTicket > 0 && m.averageTicket < shopAvgTicket * 0.6,
    isOnlineBookingOnly: totalN > 0 && num(online?.n) === totalN,
  };
}

// ---------------------------------------------------------------------------
// 1.10 Operational flags
// ---------------------------------------------------------------------------

export async function getOperationalFlags(customerId: string): Promise<OperationalFlags> {
  const t = TENANT_ID();
  const identity = await resolveIdentity(customerId);

  const [docs, vac, upcoming, intake] = await Promise.all([
    // Missing documents: the platform's own unsigned-documents view
    // (crm_unsigned_documents — documents still awaiting the customer,
    // the same source the unsigned-doc reminder automation uses) plus
    // any expired document on file. crm_documents.status has no
    // 'missing'/'expired' values live (only 'pending', which the view
    // already surfaces), so the old status filter could never fire.
    q<{ missing: string }>(
      `SELECT (
         (SELECT COUNT(*) FROM public.crm_unsigned_documents
           WHERE tenant_id=$1 AND customer_id=$2::uuid)
         +
         (SELECT COUNT(*) FROM public.crm_documents
           WHERE tenant_id=$1 AND customer_id=$2::uuid
             AND expires_at IS NOT NULL AND expires_at < CURRENT_DATE)
       )::text AS missing`,
      [t, customerId],
    ),
    q<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM public.crm_pet_vaccinations v
         JOIN public.crm_party_dependents cp ON cp.dependent_id = v.dependent_id AND cp.tenant_id = v.tenant_id
        WHERE v.tenant_id=$1 AND cp.customer_id=$2::uuid
          AND v.expires_on IS NOT NULL AND v.expires_on <= CURRENT_DATE + INTERVAL '30 days'`,
      [t, customerId],
    ),
    q<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM public.crm_appointments
        WHERE tenant_id=$1 AND customer_id=$2::uuid AND starts_at > NOW()
          AND status NOT IN ('cancelled','no_show','completed')`,
      [t, customerId],
    ),
    q<{ incomplete: string }>(
      `SELECT COUNT(*)::text AS incomplete FROM public.crm_customers
        WHERE tenant_id=$1 AND id=$2::uuid
          AND (email IS NULL OR email='' OR phone IS NULL OR phone='' OR first_name IS NULL OR first_name='')`,
      [t, customerId],
    ),
  ]);
  const outstandingBalance = await computeOutstandingBalance(identity.ids);

  return {
    hasMissingDocuments: num(docs[0]?.missing) > 0,
    hasVaccineExpiring: num(vac[0]?.n) > 0,
    hasOutstandingBalance: outstandingBalance > 0,
    hasNoUpcomingAppointment: num(upcoming[0]?.n) === 0,
    hasIntakeIncomplete: num(intake[0]?.incomplete) > 0,
  };
}

// ---------------------------------------------------------------------------
// 1.11 Marketing segments
// ---------------------------------------------------------------------------

export async function getMarketingSegments(customerId: string, metrics?: CustomerMetrics): Promise<MarketingSegments> {
  const m = metrics ?? (await getCustomerMetrics(customerId));
  const t = TENANT_ID();

  const [cust] = await q<{ dob: string | null; stage: string | null }>(
    `SELECT date_of_birth::text AS dob, lifecycle_stage AS stage
       FROM public.crm_customers WHERE tenant_id=$1 AND id=$2::uuid`,
    [t, customerId],
  );

  const now = new Date();
  let isBirthdayThisMonth = false;
  if (cust?.dob) {
    const d = new Date(cust.dob);
    isBirthdayThisMonth = d.getMonth() === now.getMonth();
  }

  const daysSinceLastVisit = m.lastVisitAt
    ? (now.getTime() - new Date(m.lastVisitAt).getTime()) / 86400000
    : Infinity;
  const isInactive90Days = daysSinceLastVisit > 90;
  const wasActive = m.totalVisits >= 3 && m.lifetimeValue >= 150;
  const isWinBackCandidate = isInactive90Days && wasActive && cust?.stage !== "lost";
  const isNewCustomerNurture = m.totalVisits <= 2 && daysSinceLastVisit <= 60;

  // Eligible for rebooking: has an expected cycle and is due (past 1x cycle, not yet 2x).
  const freq = m.averageVisitFrequencyDays ?? 42;
  const isEligibleForRebookingCampaign =
    daysSinceLastVisit > freq * 0.9 && daysSinceLastVisit < freq * 2 && m.totalVisits >= 1;

  return {
    isBirthdayThisMonth,
    isEligibleForRebookingCampaign,
    isWinBackCandidate,
    isNewCustomerNurture,
    isInactive90Days,
  };
}

// ---------------------------------------------------------------------------
// 1.20 Service Profile
// ---------------------------------------------------------------------------

export async function getServiceProfile(customerId: string): Promise<ServiceProfile> {
  const t = TENANT_ID();
  const empty: ServiceProfile = {
    mostCommonService: null, mostCommonServiceCount: 0, averageFrequencyDays: null,
    preferredGroomer: null, preferredGroomerId: null, averageSpend: 0,
    lastService: null, lastServiceAt: null,
    recommendedNextService: null, recommendedNextVisitAt: null,
  };

  const [svc, groomer, last, spendAgg] = await Promise.all([
    q<{ name: string | null; n: string }>(
      `SELECT sv.name AS name, COUNT(*)::text AS n
         FROM public.crm_appointment_services aps
         JOIN public.crm_appointments a ON a.id = aps.appointment_id AND a.tenant_id = aps.tenant_id
         LEFT JOIN public.crm_services sv ON sv.id = aps.service_id
        WHERE aps.tenant_id=$1 AND a.customer_id=$2::uuid AND a.status='completed'
        GROUP BY sv.name ORDER BY COUNT(*) DESC LIMIT 1`,
      [t, customerId],
    ),
    q<{ name: string | null; gid: string | null; n: string }>(
      `SELECT s.display_name AS name, a.assigned_groomer_id AS gid, COUNT(*)::text AS n
         FROM public.crm_appointments a
         LEFT JOIN public.crm_staff s ON s.id = a.assigned_groomer_id
        WHERE a.tenant_id=$1 AND a.customer_id=$2::uuid AND a.status='completed'
          AND a.assigned_groomer_id IS NOT NULL
        GROUP BY s.display_name, a.assigned_groomer_id ORDER BY COUNT(*) DESC LIMIT 1`,
      [t, customerId],
    ),
    q<{ name: string | null; at: string | null; total: string }>(
      `SELECT (SELECT sv.name FROM public.crm_appointment_services aps
                 LEFT JOIN public.crm_services sv ON sv.id = aps.service_id
                WHERE aps.appointment_id = a.id LIMIT 1) AS name,
              a.starts_at::text AS at, COALESCE(a.total,0)::text AS total
         FROM public.crm_appointments a
        WHERE a.tenant_id=$1 AND a.customer_id=$2::uuid AND a.status='completed'
        ORDER BY a.starts_at DESC LIMIT 5`,
      [t, customerId],
    ),
    // Average spend is over ALL completed appointments — the previous
    // version averaged only the 5 rows fetched for "last service" above,
    // which silently misstates the average for anyone with 6+ visits.
    q<{ avg_total: string | null }>(
      `SELECT AVG(total)::text AS avg_total
         FROM public.crm_appointments
        WHERE tenant_id=$1 AND customer_id=$2::uuid AND status='completed'`,
      [t, customerId],
    ),
  ]);

  const freqDays = await (async () => {
    const m = await getCustomerMetrics(customerId);
    return m.averageVisitFrequencyDays;
  })();

  const avgSpend = spendAgg[0]?.avg_total != null ? num(spendAgg[0].avg_total) : 0;

  let recommendedNextVisitAt: string | null = null;
  if (last[0]?.at && freqDays) {
    const d = new Date(last[0].at);
    d.setDate(d.getDate() + freqDays);
    recommendedNextVisitAt = d.toISOString();
  }

  return {
    mostCommonService: svc[0]?.name ?? null,
    mostCommonServiceCount: num(svc[0]?.n),
    averageFrequencyDays: freqDays,
    preferredGroomer: groomer[0]?.name ?? null,
    preferredGroomerId: groomer[0]?.gid ?? null,
    averageSpend: Math.round(avgSpend * 100) / 100,
    lastService: last[0]?.name ?? null,
    lastServiceAt: last[0]?.at ?? null,
    recommendedNextService: svc[0]?.name ?? null,
    recommendedNextVisitAt,
  };
}

// ---------------------------------------------------------------------------
// Bundle: everything for one customer in parallel
// ---------------------------------------------------------------------------

export interface CustomerIntelligence {
  metrics: CustomerMetrics;
  behavioral: BehavioralFlags;
  operational: OperationalFlags;
  marketing: MarketingSegments;
  serviceProfile: ServiceProfile;
}

export async function getCustomerIntelligence(customerId: string): Promise<CustomerIntelligence> {
  const metrics = await getCustomerMetrics(customerId);
  const [behavioral, operational, marketing, serviceProfile] = await Promise.all([
    getBehavioralFlags(customerId, metrics),
    getOperationalFlags(customerId),
    getMarketingSegments(customerId, metrics),
    getServiceProfile(customerId),
  ]);
  return { metrics, behavioral, operational, marketing, serviceProfile };
}

// ---------------------------------------------------------------------------
// 1.6 Individual metric functions (thin wrappers over getCustomerMetrics)
// ---------------------------------------------------------------------------

/** Succeeded commerce_payments (identity set) + paid shop-invoice amounts */
export async function getLifetimeValue(customerId: string): Promise<number> {
  return (await getCustomerMetrics(customerId)).lifetimeValue;
}

/** COUNT from crm_appointments WHERE customer_id AND status='completed' */
export async function getTotalVisits(customerId: string): Promise<number> {
  return (await getCustomerMetrics(customerId)).totalVisits;
}

/** LTV / visits */
export async function getAverageTicket(customerId: string): Promise<number> {
  return (await getCustomerMetrics(customerId)).averageTicket;
}

/** COUNT status='no_show' / COUNT all */
export async function getNoShowRate(customerId: string): Promise<number> {
  return (await getCustomerMetrics(customerId)).noShowRate;
}

/** COUNT status='cancelled' / COUNT all */
export async function getCancellationRate(customerId: string): Promise<number> {
  return (await getCustomerMetrics(customerId)).cancellationRate;
}

/** completed appointments followed by another completed appointment / total completed */
export async function getRebookRate(customerId: string): Promise<number> {
  return (await getCustomerMetrics(customerId)).rebookRate;
}

/** Open acct_ar_invoices' derived balance (total − paid − credited − deposit), identity set */
export async function getOutstandingBalance(customerId: string): Promise<number> {
  return (await getCustomerMetrics(customerId)).outstandingBalance;
}
