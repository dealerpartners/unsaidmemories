// ============================================================================
// Admin customer flags — 1.9 Behavioral, 1.10 Operational, 1.11 Marketing.
// Pure computation over existing tables. Failed reads throw — flags are
// never computed over a fabricated empty result.
// Tables read: crm_customers, crm_appointments, crm_party_dependents,
//   crm_pet_vaccinations, crm_documents, crm_unsigned_documents.
// Money figures delegate to customer-metrics.ts (commerce_payments +
// shop invoices over the stored-key identity set) — acct_ar_receipts has
// 0 rows and acct_ar_invoices has no balance_due column, so the old
// direct queries here silently zeroed every money flag.
// ============================================================================
import { withPgStrict, TENANT_ID } from "@/lib/crm/enterprise";
import { getLifetimeValue, getOutstandingBalance } from "./customer-metrics";

async function q<T = any>(sql: string, params: unknown[]): Promise<T[]> {
  // No fail-soft: a failed read throws (withPgStrict) so callers surface an
  // error instead of computing flags/metrics over a fabricated empty set.
  const rows = await withPgStrict<T[]>((client) =>
    client.query(sql, params).then((r: any) => (r?.rows ?? []) as T[]),
  );
  return rows;
}

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// ---------------------------------------------------------------------------
// 1.9 Behavioral flags — each returns boolean
// ---------------------------------------------------------------------------

/** 1.9.1 Frequent Visitor: completed visits in last 90 days > 6 */
export async function isFrequentVisitor(customerId: string): Promise<boolean> {
  if (!isUuid(customerId)) return false;
  const t = TENANT_ID();
  const [r] = await q<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM public.crm_appointments
      WHERE tenant_id=$1 AND customer_id=$2::uuid AND status='completed'
        AND starts_at >= NOW() - INTERVAL '90 days'`,
    [t, customerId],
  );
  return num(r?.n) > 6;
}

/** 1.9.2 High Lifetime Value: real LTV (customer-metrics) > $1000 */
export async function isHighLifetimeValue(customerId: string): Promise<boolean> {
  if (!isUuid(customerId)) return false;
  return (await getLifetimeValue(customerId)) > 1000;
}

async function appointmentRates(customerId: string) {
  const t = TENANT_ID();
  const [r] = await q<{ total: string; no_show: string; cancelled: string; completed: string }>(
    `SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE status='no_show')::text AS no_show,
            COUNT(*) FILTER (WHERE status='cancelled')::text AS cancelled,
            COUNT(*) FILTER (WHERE status='completed')::text AS completed
       FROM public.crm_appointments a
      WHERE tenant_id=$1 AND customer_id=$2::uuid`,
    [t, customerId],
  );
  const total = num(r?.total);
  return {
    total,
    noShowRate: total > 0 ? num(r?.no_show) / total : 0,
    cancelRate: total > 0 ? num(r?.cancelled) / total : 0,
    completed: num(r?.completed),
    lifetimeValue: await getLifetimeValue(customerId),
  };
}

/** 1.9.3 Frequent No-Show: no-show rate > 20% AND total appointments >= 3 */
export async function isFrequentNoShow(customerId: string): Promise<boolean> {
  if (!isUuid(customerId)) return false;
  const r = await appointmentRates(customerId);
  return r.total >= 3 && r.noShowRate > 0.2;
}

/** 1.9.4 Cancellation Risk: cancellation rate > 30% */
export async function isCancellationRisk(customerId: string): Promise<boolean> {
  if (!isUuid(customerId)) return false;
  const r = await appointmentRates(customerId);
  return r.total >= 2 && r.cancelRate > 0.3;
}

/** 1.9.5 Price Sensitive: average ticket < $50 (completed visits, receipts basis) */
export async function isPriceSensitive(customerId: string): Promise<boolean> {
  if (!isUuid(customerId)) return false;
  const r = await appointmentRates(customerId);
  const avgTicket = r.completed > 0 ? r.lifetimeValue / r.completed : 0;
  return r.completed > 0 && avgTicket < 50;
}

/** 1.9.6 Online Booking Only: every appointment was booked online */
export async function isOnlineBookingOnly(customerId: string): Promise<boolean> {
  if (!isUuid(customerId)) return false;
  const t = TENANT_ID();
  // Booking source lives in source_channel — crm_appointments has no
  // metadata / booked_online columns (verified live).
  const [r] = await q<{ total: string; online: string }>(
    `SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE source_channel LIKE 'website%'
                                OR source_channel IN ('online','self_booking','web'))::text AS online
       FROM public.crm_appointments
      WHERE tenant_id=$1 AND customer_id=$2::uuid`,
    [t, customerId],
  );
  const total = num(r?.total);
  return total > 0 && num(r?.online) === total;
}

export interface BehavioralFlags {
  isFrequentVisitor: boolean;
  isHighLifetimeValue: boolean;
  isFrequentNoShow: boolean;
  isCancellationRisk: boolean;
  isPriceSensitive: boolean;
  isOnlineBookingOnly: boolean;
}

export async function getBehavioralFlags(customerId: string): Promise<BehavioralFlags> {
  const [a, b, c, d, e, f] = await Promise.all([
    isFrequentVisitor(customerId),
    isHighLifetimeValue(customerId),
    isFrequentNoShow(customerId),
    isCancellationRisk(customerId),
    isPriceSensitive(customerId),
    isOnlineBookingOnly(customerId),
  ]);
  return {
    isFrequentVisitor: a,
    isHighLifetimeValue: b,
    isFrequentNoShow: c,
    isCancellationRisk: d,
    isPriceSensitive: e,
    isOnlineBookingOnly: f,
  };
}

// ---------------------------------------------------------------------------
// 1.10 Operational flags — boolean + details
// ---------------------------------------------------------------------------

export interface OperationalFlagDetail {
  value: boolean;
  detail: string;
}

/** 1.10.1 Missing Documents: required doc types missing or expired */
export async function hasMissingDocuments(customerId: string): Promise<OperationalFlagDetail> {
  if (!isUuid(customerId)) return { value: false, detail: "invalid customer id" };
  const t = TENANT_ID();
  // crm_documents has `name` (no document_name/document_type columns) and
  // no 'missing'/'expired' statuses live. Missing = still unsigned per the
  // platform's crm_unsigned_documents view, or expired on file.
  const rows = await q<{ name: string }>(
    `SELECT name FROM public.crm_unsigned_documents
      WHERE tenant_id=$1 AND customer_id=$2::uuid
     UNION ALL
     SELECT name FROM public.crm_documents
      WHERE tenant_id=$1 AND customer_id=$2::uuid
        AND expires_at IS NOT NULL AND expires_at < CURRENT_DATE`,
    [t, customerId],
  );
  const names = rows.map((r) => r.name).filter(Boolean);
  return {
    value: names.length > 0,
    detail: names.length > 0 ? `${names.length} missing/expired: ${names.slice(0, 5).join(", ")}` : "all documents current",
  };
}

/** 1.10.2 Vaccine Expiring: any pet vaccine expires within 30 days */
export async function hasVaccineExpiring(customerId: string): Promise<OperationalFlagDetail> {
  if (!isUuid(customerId)) return { value: false, detail: "invalid customer id" };
  const t = TENANT_ID();
  const rows = await q<{ pet: string; vaccine: string; exp: string }>(
    `SELECT COALESCE(p.name,'Pet') AS pet, 'Vaccine' AS vaccine,
            v.expires_on::text AS exp
       FROM public.crm_pet_vaccinations v
       JOIN public.crm_party_dependents cp ON cp.dependent_id = v.dependent_id AND cp.tenant_id = v.tenant_id
       LEFT JOIN public.crm_pets p ON p.id = v.dependent_id
      WHERE v.tenant_id=$1 AND cp.customer_id=$2::uuid
        AND v.expires_on IS NOT NULL AND v.expires_on <= CURRENT_DATE + INTERVAL '30 days'
      ORDER BY v.expires_on`,
    [t, customerId],
  );
  return {
    value: rows.length > 0,
    detail:
      rows.length > 0
        ? `${rows.length} expiring: ${rows.slice(0, 3).map((r) => `${r.pet} ${r.vaccine} (${r.exp})`).join("; ")}`
        : "no vaccines expiring in 30 days",
  };
}

/** 1.10.3 Outstanding Balance: unpaid invoice balance > 0 */
export async function hasOutstandingBalance(customerId: string): Promise<OperationalFlagDetail> {
  if (!isUuid(customerId)) return { value: false, detail: "invalid customer id" };
  const bal = await getOutstandingBalance(customerId);
  return {
    value: bal > 0,
    detail: bal > 0 ? `$${bal.toFixed(2)} outstanding` : "no outstanding balance",
  };
}

/** 1.10.4 No Upcoming Appointment: no future non-cancelled appointments */
export async function hasNoUpcomingAppointment(customerId: string): Promise<OperationalFlagDetail> {
  if (!isUuid(customerId)) return { value: false, detail: "invalid customer id" };
  const t = TENANT_ID();
  const [r] = await q<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM public.crm_appointments
      WHERE tenant_id=$1 AND customer_id=$2::uuid AND starts_at > NOW()
        AND status NOT IN ('cancelled','no_show','completed')`,
    [t, customerId],
  );
  const n = num(r?.n);
  return {
    value: n === 0,
    detail: n === 0 ? "no upcoming appointment booked" : `${n} upcoming appointment(s)`,
  };
}

/** 1.10.5 Intake Incomplete: core contact/identity fields missing */
export async function hasIntakeIncomplete(customerId: string): Promise<OperationalFlagDetail> {
  if (!isUuid(customerId)) return { value: false, detail: "invalid customer id" };
  const t = TENANT_ID();
  const [r] = await q<{ email: string | null; phone: string | null; first_name: string | null }>(
    `SELECT email, phone, first_name FROM public.crm_customers
      WHERE tenant_id=$1 AND id=$2::uuid`,
    [t, customerId],
  );
  const missing: string[] = [];
  if (!r?.email) missing.push("email");
  if (!r?.phone) missing.push("phone");
  if (!r?.first_name) missing.push("name");
  return {
    value: missing.length > 0,
    detail: missing.length > 0 ? `missing: ${missing.join(", ")}` : "intake complete",
  };
}

export interface OperationalFlags {
  hasMissingDocuments: OperationalFlagDetail;
  hasVaccineExpiring: OperationalFlagDetail;
  hasOutstandingBalance: OperationalFlagDetail;
  hasNoUpcomingAppointment: OperationalFlagDetail;
  hasIntakeIncomplete: OperationalFlagDetail;
}

export async function getOperationalFlags(customerId: string): Promise<OperationalFlags> {
  const [a, b, c, d, e] = await Promise.all([
    hasMissingDocuments(customerId),
    hasVaccineExpiring(customerId),
    hasOutstandingBalance(customerId),
    hasNoUpcomingAppointment(customerId),
    hasIntakeIncomplete(customerId),
  ]);
  return {
    hasMissingDocuments: a,
    hasVaccineExpiring: b,
    hasOutstandingBalance: c,
    hasNoUpcomingAppointment: d,
    hasIntakeIncomplete: e,
  };
}

// ---------------------------------------------------------------------------
// 1.11 Marketing segments — each returns boolean
// ---------------------------------------------------------------------------

interface CustomerRow {
  dob: string | null;
  stage: string | null;
  created: string | null;
}

/** 1.11.1 Birthday This Month: EXTRACT(MONTH FROM date_of_birth) = current month */
export async function isBirthdayThisMonth(customerId: string): Promise<boolean> {
  if (!isUuid(customerId)) return false;
  const t = TENANT_ID();
  const [r] = await q<{ match: string }>(
    `SELECT COUNT(*)::text AS match FROM public.crm_customers
      WHERE tenant_id=$1 AND id=$2::uuid AND date_of_birth IS NOT NULL
        AND EXTRACT(MONTH FROM date_of_birth) = EXTRACT(MONTH FROM CURRENT_DATE)`,
    [t, customerId],
  );
  return num(r?.match) > 0;
}

async function lastVisitAndUpcoming(customerId: string, t: string) {
  const [lv, up] = await Promise.all([
    q<{ last_visit: string | null }>(
      `SELECT MAX(starts_at)::text AS last_visit FROM public.crm_appointments
        WHERE tenant_id=$1 AND customer_id=$2::uuid AND status='completed'`,
      [t, customerId],
    ),
    q<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM public.crm_appointments
        WHERE tenant_id=$1 AND customer_id=$2::uuid AND starts_at > NOW()
          AND status NOT IN ('cancelled','no_show','completed')`,
      [t, customerId],
    ),
  ]);
  const lastVisitAt = lv[0]?.last_visit ?? null;
  const daysSince = lastVisitAt
    ? (Date.now() - new Date(lastVisitAt).getTime()) / 86400000
    : Infinity;
  return { lastVisitAt, daysSince, upcomingCount: num(up[0]?.n) };
}

/** 1.11.2 Eligible for Rebooking: last visit 30-60 days ago, no future appointment */
export async function isEligibleForRebooking(customerId: string): Promise<boolean> {
  if (!isUuid(customerId)) return false;
  const t = TENANT_ID();
  const { daysSince, upcomingCount } = await lastVisitAndUpcoming(customerId, t);
  return daysSince >= 30 && daysSince <= 60 && upcomingCount === 0;
}

/**
 * 1.11.3 Win-Back Candidate: lifecycle_stage='lapsed' and was active before.
 * "Was active before" is measured by completed-visit history (>=3 completed
 * visits proves prior active behavior).
 */
export async function isWinBackCandidate(customerId: string): Promise<boolean> {
  if (!isUuid(customerId)) return false;
  const t = TENANT_ID();
  const [r] = await q<{ stage: string | null; completed: string }>(
    `SELECT c.lifecycle_stage AS stage,
            (SELECT COUNT(*)::text FROM public.crm_appointments a
              WHERE a.tenant_id=c.tenant_id AND a.customer_id=c.id AND a.status='completed') AS completed
       FROM public.crm_customers c WHERE c.tenant_id=$1 AND c.id=$2::uuid`,
    [t, customerId],
  );
  return r?.stage === "lapsed" && num(r?.completed) >= 3;
}

/** 1.11.4 New Customer Nurture: created < 30 days ago AND < 2 completed visits */
export async function isNewCustomerNurture(customerId: string): Promise<boolean> {
  if (!isUuid(customerId)) return false;
  const t = TENANT_ID();
  const [r] = await q<{ fresh: string; completed: string }>(
    `SELECT (CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN '1' ELSE '0' END) AS fresh,
            (SELECT COUNT(*)::text FROM public.crm_appointments a
              WHERE a.tenant_id=c.tenant_id AND a.customer_id=c.id AND a.status='completed') AS completed
       FROM public.crm_customers c WHERE c.tenant_id=$1 AND c.id=$2::uuid`,
    [t, customerId],
  );
  return num(r?.fresh) === 1 && num(r?.completed) < 2;
}

/** 1.11.5 Inactive 90+ Days: no completed visit in 90 days */
export async function isInactive90Days(customerId: string): Promise<boolean> {
  if (!isUuid(customerId)) return false;
  const t = TENANT_ID();
  const { daysSince } = await lastVisitAndUpcoming(customerId, t);
  return daysSince > 90;
}

export interface MarketingSegments {
  isBirthdayThisMonth: boolean;
  isEligibleForRebooking: boolean;
  isWinBackCandidate: boolean;
  isNewCustomerNurture: boolean;
  isInactive90Days: boolean;
}

export async function getMarketingSegments(customerId: string): Promise<MarketingSegments> {
  const [a, b, c, d, e] = await Promise.all([
    isBirthdayThisMonth(customerId),
    isEligibleForRebooking(customerId),
    isWinBackCandidate(customerId),
    isNewCustomerNurture(customerId),
    isInactive90Days(customerId),
  ]);
  return {
    isBirthdayThisMonth: a,
    isEligibleForRebooking: b,
    isWinBackCandidate: c,
    isNewCustomerNurture: d,
    isInactive90Days: e,
  };
}

// ---------------------------------------------------------------------------
// Aggregate
// ---------------------------------------------------------------------------

export interface CustomerFlags {
  behavioral: BehavioralFlags;
  operational: OperationalFlags;
  marketing: MarketingSegments;
}

export async function getCustomerFlags(customerId: string): Promise<CustomerFlags> {
  const [behavioral, operational, marketing] = await Promise.all([
    getBehavioralFlags(customerId),
    getOperationalFlags(customerId),
    getMarketingSegments(customerId),
  ]);
  return { behavioral, operational, marketing };
}
