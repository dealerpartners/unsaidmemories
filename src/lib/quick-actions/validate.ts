import { NextResponse } from "next/server";

// Shared payload guard for the admin quick-action routers.
//
// The handlers cast payload id fields straight into ::uuid SQL parameters.
// An empty string or a non-uuid value in one of those fields used to reach
// Postgres and come back as a 500 (22P02) instead of the 400 the caller
// deserves. Every *_id field in these payloads is a uuid column in this
// schema (strict-FK design) EXCEPT the denylist below, whose values are
// external systems' identifiers (Stripe ids, tracking numbers, idempotency
// keys) and are never cast to uuid.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NON_UUID_ID_FIELDS = new Set([
  "external_id",
  "stripe_id",
  "stripe_account_id",
  "stripe_customer_id",
  "stripe_payment_id",
  "session_id",
  "tracking_id",
  "transaction_id",
  "reference_id",
  "client_id",
  "correlation_id",
  "idempotency_key",
  "zoom_id",
  "mux_id",
  "shippo_id",
  "provider_id",
]);

export function invalidIdField(payload: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value !== "string") continue;
    if (key !== "id" && !key.endsWith("_id")) continue;
    if (NON_UUID_ID_FIELDS.has(key)) continue;
    if (!UUID_RE.test(value)) return key;
  }
  return null;
}

/** Returns a 400 response when a payload id field is not a valid uuid. */
export function guardPayloadIds(payload: Record<string, unknown>): NextResponse | null {
  const bad = invalidIdField(payload);
  if (!bad) return null;
  return NextResponse.json(
    { error: `A valid ${bad.replace(/_/g, " ")} is required` },
    { status: 400 },
  );
}

// Second half of the guard, driven by the registry itself: every quick
// action declares its required payload fields (the palette form is
// generated from the same declarations, so real UI calls always carry
// them). A required field that arrives missing or empty used to fall
// through to the handler, which defaulted it to '' and fed a ::uuid cast —
// the other 500 class. Enforcing the declaration at the router turns those
// into honest 400s for every action, present and future.
import { QUICK_ACTIONS } from "@/config/quickActionRegistry";

export function guardRequiredFields(
  action: string,
  payload: Record<string, unknown>,
): NextResponse | null {
  const entry = QUICK_ACTIONS.find(
    (a) => a.id === action || a.id.replace(/-/g, "_") === action,
  );
  if (!entry?.payloadFields) return null;
  for (const field of entry.payloadFields) {
    if (!field.required) continue;
    const value = payload[field.name];
    if (value === undefined || value === null || value === "") {
      return NextResponse.json(
        { error: `${field.label} is required` },
        { status: 400 },
      );
    }
  }
  return null;
}
