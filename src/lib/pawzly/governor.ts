// Pawzsly Manage governor — the store read path every Pawzsly/AI call site
// consults before it acts for a user.
//
// DOCTRINE (owner's, binding): AI is involved in every event by default; the
// ONLY control is what a user prevents in their portal's Manage surface
// ("Pawzsly & AI", /customer/profile/ai-preferences). So:
//   - a missing row in public.pawzly_ai_preferences means ALLOWED;
//   - only an explicit row with allowed = false prevents a capability;
//   - guests (no user id) may use read capabilities but never write ones;
//   - if the store is unreachable, capabilities stay allowed (callers that
//     perform a write record the check as unverified in their own audit
//     metadata — the governor never blocks on its own outage).
//
// Safety floors are NOT governable: tele-triage escalation behavior is
// excluded from the capability list by design and no code path may gate it
// on this module.

import { withPg, TENANT_ID } from "@/lib/crm/enterprise";
import { logAiInvocation } from "@/lib/ai/log-invocation";

export interface PawzslyCapability {
  key: string;
  label: string;
  group: string;
  /** true when the capability changes data / takes an action for the user. */
  write: boolean;
}

export const PAWZSLY_CAPABILITIES: PawzslyCapability[] = [
  { key: "shopping_help", label: "Help me shop and find products", group: "Shopping and orders", write: false },
  { key: "order_lookup", label: "Look up my orders for me", group: "Shopping and orders", write: false },
  { key: "learning_suggestions", label: "Suggest lessons and articles for my pets", group: "Learning and care", write: false },
  { key: "care_reminders", label: "Remind me about my pets' care", group: "Learning and care", write: false },
  { key: "conversational_memory", label: "Remember what we talk about", group: "Memory", write: false },
  { key: "pet_records", label: "See and use my pets' information", group: "Memory", write: false },
  { key: "booking_on_behalf", label: "Book appointments for me", group: "Things Pawzsly can do for you", write: true },
  { key: "pet_creation", label: "Add new pets to my account", group: "Things Pawzsly can do for you", write: true },
  { key: "add_to_bag", label: "Add items to my bag", group: "Things Pawzsly can do for you", write: true },
  { key: "reminders_followups", label: "Send reminders and follow-ups", group: "Things Pawzsly can do for you", write: true },
  { key: "telemedicine_guidance", label: "Give guidance about my pet's health", group: "Health guidance", write: false },
];

const CAPABILITY_BY_KEY = new Map(PAWZSLY_CAPABILITIES.map((c) => [c.key, c]));

function defaultState(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const c of PAWZSLY_CAPABILITIES) out[c.key] = true;
  return out;
}

function guestState(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const c of PAWZSLY_CAPABILITIES) out[c.key] = !c.write;
  return out;
}

/**
 * Is `capability` allowed for this user right now?
 * Missing row = allowed. Store unreachable = allowed. Unknown capability
 * key = not allowed (it is not a governable capability at all).
 * Guests: read capabilities allowed, write capabilities never.
 */
export async function capabilityAllowed(input: {
  userId: string | null;
  tenantId?: string | null;
  capability: string;
}): Promise<boolean> {
  const def = CAPABILITY_BY_KEY.get(input.capability);
  if (!def) return false;
  if (!input.userId) return !def.write;

  const tenantId = input.tenantId || TENANT_ID();
  const rows = await withPg(async (client) => {
    const res = await client.query(
      `SELECT allowed FROM public.pawzly_ai_preferences
        WHERE tenant_id = $1::uuid AND user_id = $2::uuid AND capability = $3
        LIMIT 1`,
      [tenantId, input.userId, input.capability],
    );
    return res.rows as Array<{ allowed: boolean }>;
  });
  // Store unreachable (withPg returns null): stay allowed per doctrine.
  if (rows === null) return true;
  if (rows.length === 0) return true;
  return rows[0].allowed === true;
}

/**
 * The user's full governor state: stored rows merged over the default-on
 * state. Guests get read-on / write-off. An unreachable store yields the
 * defaults rather than an error.
 */
export async function getGovernorState(
  userId: string | null,
  tenantId?: string | null,
): Promise<Record<string, boolean>> {
  if (!userId) return guestState();
  const tenant = tenantId || TENANT_ID();
  const state = defaultState();
  const rows = await withPg(async (client) => {
    const res = await client.query(
      `SELECT capability, allowed FROM public.pawzly_ai_preferences
        WHERE tenant_id = $1::uuid AND user_id = $2::uuid`,
      [tenant, userId],
    );
    return res.rows as Array<{ capability: string; allowed: boolean }>;
  });
  if (rows === null) return state;
  for (const row of rows) {
    if (CAPABILITY_BY_KEY.has(row.capability)) state[row.capability] = row.allowed === true;
  }
  return state;
}

/**
 * Record one explicit allow/prevent choice (upsert on the unique
 * tenant/user/capability key). Throws on an unknown capability key or when
 * the store is unreachable, so the API can answer honestly instead of
 * pretending a choice was saved.
 */
export async function setCapability(
  userId: string,
  tenantId: string | null | undefined,
  capability: string,
  allowed: boolean,
): Promise<void> {
  if (!CAPABILITY_BY_KEY.has(capability)) {
    throw new Error(`Unknown Pawzsly capability: ${capability}`);
  }
  const tenant = tenantId || TENANT_ID();
  const result = await withPg(async (client) => {
    await client.query(
      `INSERT INTO public.pawzly_ai_preferences (tenant_id, user_id, capability, allowed)
       VALUES ($1::uuid, $2::uuid, $3, $4)
       ON CONFLICT (tenant_id, user_id, capability)
       DO UPDATE SET allowed = EXCLUDED.allowed, updated_at = now()`,
      [tenant, userId, capability, allowed],
    );
    return true;
  });
  if (result === null) throw new Error("Pawzsly preference store unavailable");
}

/**
 * Audit a governor decline: when a call site is about to act and
 * capabilityAllowed() said no, it records the decline here so the refusal
 * is visible in the AI invocation log with the governor metadata.
 * logAiInvocation is fail-soft by contract, so this never throws.
 */
export async function recordGovernorDecline(input: {
  userId: string | null;
  tenantId?: string | null;
  capability: string;
  feature: string;
}): Promise<void> {
  await logAiInvocation({
    feature: input.feature,
    tenantId: input.tenantId ?? null,
    status: "success",
    metadata: {
      declined_by_governor: true,
      capability: input.capability,
      user_id: input.userId ?? null,
    },
  });
}
