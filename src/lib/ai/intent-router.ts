// ===========================================================================
// lib/ai/intent-router.ts — M6: the AI intent router (DOCX §7.7 / §5.3).
//
// Every AI call declares its intent BEFORE it executes: actor (with lens
// + active grant), capability, object, purpose. Invalid envelopes are
// refused with a denial reason — no execution, no silent fallback to an
// unscoped path.
//
// Gate order (each denial writes a §2.6 event row with its reason):
//   invalid_envelope → unknown_purpose → purpose_capability_mismatch →
//   purpose_object_mismatch → unknown_capability → tool_* (not
//   registered / disabled / capability / purpose drift) →
//   grant_not_active → capability_not_held → scope_denied /
//   lens_out_of_scope / scope_unverifiable → governor_declined →
//   registry_unavailable (the registry store itself unreachable: fail
//   closed, honestly named, rather than silently allowing).
//
// Authority notes:
//   · Purposes and tools are ROWS (ai_purposes, platform_tools), read
//     on every intent. Nothing here hardcodes a purpose's allowed set.
//   · Actor capability comes from M3's role map + per-grant overrides
//     (guards.ts resolveCapabilityActor), never from the prompt.
//   · PUBLIC-READ ALLOWANCE: offering.discover and insight.discover
//     are tenant-scoped reads of PUBLIC data — the shop and breed
//     knowledge any visitor browses. Any site actor holds them, guest
//     included. Private self-scoped data (pets, orders) is never in
//     this allowance, and no write capability is.
//   · Guests and self-scoped reads: a guest intent for list_my_pets /
//     lookup_orders reaches the tool, which renders guest-safe text and
//     no private data (today's behavior, preserved); the event records
//     guest_deferred. A guest write is refused — by the governor for
//     tool intents (pet_creation is a write capability guests never
//     hold) and by the risk check for direct intents.
//   · The chat loop is a CLIENT of this router: gatewayWithTools calls
//     executeToolViaRouter for every tool execution. The model never
//     touches executePawzslyTool directly.
//   · Event writes are fail-soft for the chat path (the audit store
//     never breaks a shopper's chat, the same contract as
//     logAiInvocation) and flagged auditDegraded when the insert does
//     not return an id — never silently claimed.
// ===========================================================================

import { pgQuery, pgQueryStrict } from "@/lib/pg";
import { TENANT_ID } from "@/lib/crm/enterprise";
import { capabilityAllowed as governorCapabilityAllowed } from "@/lib/pawzly/governor";
import { mintActorToken, verifyActorToken } from "@/lib/ai/actor-token";
import { TOOL_INTENTS } from "@/lib/ai/tool-intents";
import {
  executePawzslyTool,
  type ToolCard,
  type ToolExecContext,
  type ToolResult,
} from "@/lib/pawzly/tools";

export interface RouterActor {
  authUserId: string | null;
  email: string | null;
  roles: string[];
  capabilities: Set<string>;
  grantId: string | null;
  scope: string | null;
  tenantId: string | null;
  customerId: string | null;
}

export function guestActor(): RouterActor {
  return {
    authUserId: null,
    email: null,
    roles: [],
    capabilities: new Set<string>(),
    grantId: null,
    scope: null,
    tenantId: null,
    customerId: null,
  };
}

/** Build a router actor from M3's resolved capability actor. */
export function actorFromCapabilityActor(cap: {
  authUserId: string;
  email: string | null;
  roles: string[];
  capabilities: Set<string>;
  activeGrantId?: string;
  activeScope?: string | null;
  tenantId: string | null;
  customerId: string | null;
}): RouterActor {
  return {
    authUserId: cap.authUserId,
    email: cap.email,
    roles: cap.roles,
    capabilities: cap.capabilities,
    grantId: cap.activeGrantId ?? null,
    scope: cap.activeScope ?? null,
    tenantId: cap.tenantId,
    customerId: cap.customerId,
  };
}

const SCOPE_LENS: Record<string, string> = {
  admin: "salon admin",
  employee: "salon operator",
  ads: "advertiser",
};

/** The audience lens an actor renders through: the active grant's scope
 *  when present, else the first defined role, else 'guest'. Salon admin
 *  and salon operator are the same people (two lens-hats); the scope
 *  word is kept as the lens name so the event row reads as the actor
 *  was admitted, not as a renamed role. */
export function lensForActor(actor: RouterActor): string {
  if (!actor.authUserId) return "guest";
  if (actor.scope) return SCOPE_LENS[actor.scope] ?? actor.scope;
  if (actor.roles.length) return actor.roles[0];
  return "guest";
}

export interface Denial {
  code: string;
  reason: string;
}

export interface IntentInput {
  purpose: string;
  capability: string;
  objectType: string;
  objectId: string | null;
  /** Explicit lens claimed by the caller (DOCX principal.lens). When
   *  absent, the actor's derived lens is used. */
  lens?: string | null;
  /** Tool name, when this intent is a tool execution. */
  toolName?: string | null;
  agentId?: string;
  agentVersion?: string | null;
  fromState?: string | null;
  toState?: string | null;
}

interface PurposeRow {
  purpose_code: string;
  allowed_capabilities: string[];
  allowed_objects: string[];
}

interface CapabilityRow {
  capability_code: string;
  scope_mode: string;
  risk: string;
}

interface ToolRow {
  tool_name: string;
  capability_code: string;
  purpose_codes: string[];
  enabled: boolean;
}

/** Tenant-scoped reads of PUBLIC data — the shop any visitor browses
 *  and public breed knowledge. The only capabilities an actor holds
 *  without a role or grant, and only ever reads. */
const PUBLIC_READ_CAPABILITIES = new Set(["offering.discover", "insight.discover"]);
/** Self-scoped capabilities a guest intent may reach because the tool
 *  renders guest-safe text and performs no private read or write. */
const GUEST_LENS_CAPABILITIES = new Set(["pet.inspect", "order.inspect", "pet.draft"]);

const UUID_RE = /^[0-9a-f-]{36}$/i;

function siteTenant(): string | null {
  try {
    return TENANT_ID();
  } catch {
    return null;
  }
}

async function loadPurpose(purpose: string): Promise<PurposeRow | null> {
  const rows = await pgQueryStrict<PurposeRow>(
    `SELECT purpose_code, allowed_capabilities, allowed_objects FROM public.ai_purposes WHERE purpose_code = $1`,
    [purpose],
  );
  return rows[0] ?? null;
}

async function loadCapability(capability: string): Promise<CapabilityRow | null> {
  const rows = await pgQueryStrict<CapabilityRow>(
    `SELECT capability_code, scope_mode, risk FROM public.platform_capabilities WHERE capability_code = $1`,
    [capability],
  );
  return rows[0] ?? null;
}

async function loadTool(toolName: string): Promise<ToolRow | null> {
  const rows = await pgQueryStrict<ToolRow>(
    `SELECT tool_name, capability_code, purpose_codes, enabled FROM public.platform_tools WHERE tool_name = $1`,
    [toolName],
  );
  return rows[0] ?? null;
}

async function grantIsActive(grantId: string, authUserId: string): Promise<boolean> {
  const rows = await pgQueryStrict<{ id: string }>(
    `SELECT id FROM public.identity_grants WHERE id = $1::uuid AND user_id = $2::uuid AND status = 'active'`,
    [grantId, authUserId],
  );
  return rows.length > 0;
}

/** Ownership evidence for a concrete object id, via the email link the
 *  tools themselves use (commerce_orders email). A missing row, a
 *  non-uuid id, or a query failure all return null — unverifiable,
 *  never "owned" — so the caller fails closed with scope_unverifiable
 *  and the denial never confirms whether the id exists.
 *  Only orders carry evidence in this database: the AAPawZ "pet"
 *  (public.dogs) and "commitment" (public.bookings) branches queried
 *  tables that do not exist here and could only ever fail closed, so
 *  they were removed 2026-11-02 — those object types return null
 *  below like any other unverifiable type. */
async function ownsObject(
  actor: RouterActor,
  objectType: string,
  objectId: string,
): Promise<boolean | null> {
  if (!actor.email || !UUID_RE.test(objectId)) return null;
  const email = actor.email;
  try {
    if (objectType === "order") {
      const rows = await pgQueryStrict<{ one: number }>(
        `SELECT 1 AS one FROM public.commerce_orders
          WHERE id = $1::uuid AND (lower(customer_email) = lower($2) OR lower(email) = lower($2)) LIMIT 1`,
        [objectId, email],
      );
      return rows.length > 0;
    }
    return null;
  } catch {
    return null;
  }
}

/** Audience a commitment lens code speaks for, per M2's seven lenses. */
function lensAudience(lensCode: string): string | null {
  const audience = lensCode.split(".").pop() ?? "";
  return ["owner", "operator", "manager", "provider", "partner", "platform", "agent"].includes(audience)
    ? audience
    : null;
}

function audienceHolds(audience: string, actor: RouterActor): boolean {
  switch (audience) {
    case "owner":
      return actor.roles.includes("customer") || actor.roles.includes("learner");
    case "operator":
      return actor.roles.includes("salon operator");
    case "manager":
      return actor.roles.includes("salon admin");
    case "provider":
      return actor.roles.includes("groomer") || actor.roles.includes("vet");
    case "partner":
      return (
        actor.roles.includes("seller") ||
        actor.roles.includes("affiliate") ||
        actor.roles.includes("advertiser")
      );
    case "platform":
      return actor.roles.includes("platform admin");
    default:
      return false; // 'agent' is a lens, not a role — no human holds it
  }
}

export interface Validation {
  lens: string;
  purpose: PurposeRow;
  capability: CapabilityRow;
  tool: ToolRow | null;
}

export async function validateIntent(
  input: IntentInput,
  actor: RouterActor,
): Promise<{ ok: true; validation: Validation } | { ok: false; denial: Denial }> {
  const deny = (code: string, reason: string): { ok: false; denial: Denial } => ({
    ok: false,
    denial: { code, reason },
  });
  const derivedLens = lensForActor(actor);

  // 1. Envelope shape — every field the decision needs must be present.
  const missing: string[] = [];
  if (!input.purpose) missing.push("purpose");
  if (!input.capability) missing.push("capability");
  if (!input.objectType) missing.push("object");
  if (!actor) missing.push("actor");
  if (missing.length) {
    return deny(
      "invalid_envelope",
      `The intent envelope is missing ${missing.join(", ")} — an AI call must declare actor, capability, object and purpose before it executes.`,
    );
  }

  let purpose: PurposeRow | null;
  let capabilityRow: CapabilityRow | null;
  let toolRow: ToolRow | null = null;
  try {
    // 2. Purpose must be a registered row, not free text.
    purpose = await loadPurpose(input.purpose);
    if (!purpose) {
      return deny(
        "unknown_purpose",
        `Purpose "${input.purpose}" is not registered in the purpose registry — an intent without a registered purpose is refused.`,
      );
    }
    // 3–4. The purpose must allow this capability on this object.
    if (!purpose.allowed_capabilities.includes(input.capability)) {
      return deny(
        "purpose_capability_mismatch",
        `Purpose "${input.purpose}" does not allow capability "${input.capability}".`,
      );
    }
    if (!purpose.allowed_objects.includes(input.objectType)) {
      return deny(
        "purpose_object_mismatch",
        `Purpose "${input.purpose}" does not allow object "${input.objectType}".`,
      );
    }
    // 5. The capability must exist in the registry.
    capabilityRow = await loadCapability(input.capability);
    if (!capabilityRow) {
      return deny("unknown_capability", `Capability "${input.capability}" is not registered.`);
    }
    // 6. Tool intents: the tool must be a registered, enabled row, and
    //    the row must agree with the envelope (drift fails closed).
    if (input.toolName) {
      const map = TOOL_INTENTS[input.toolName];
      if (!map) {
        return deny(
          "tool_not_registered",
          `Tool "${input.toolName}" has no registry row — no new AI tool without a registry row and a purpose code.`,
        );
      }
      toolRow = await loadTool(input.toolName);
      if (!toolRow) {
        return deny("tool_not_registered", `Tool "${input.toolName}" has no registry row.`);
      }
      if (!toolRow.enabled) {
        return deny("tool_disabled", `Tool "${input.toolName}" is registered but disabled.`);
      }
      if (toolRow.capability_code !== input.capability || map.capability !== input.capability) {
        return deny(
          "tool_capability_mismatch",
          `Tool "${input.toolName}" does not exercise capability "${input.capability}".`,
        );
      }
      if (!toolRow.purpose_codes.includes(input.purpose) || map.purpose !== input.purpose) {
        return deny(
          "tool_purpose_mismatch",
          `Tool "${input.toolName}" does not serve purpose "${input.purpose}".`,
        );
      }
      if (map.objectType !== input.objectType) {
        return deny(
          "tool_object_mismatch",
          `Tool "${input.toolName}" does not touch object "${input.objectType}".`,
        );
      }
    }
    // 7. The active grant, when one is claimed, must be live.
    if (actor.authUserId && actor.grantId) {
      if (!(await grantIsActive(actor.grantId, actor.authUserId))) {
        return deny(
          "grant_not_active",
          "The session's active grant is not active for this actor — intents run under a live grant or not at all.",
        );
      }
    }
  } catch {
    return deny(
      "registry_unavailable",
      "The purpose/capability registry could not be reached — the intent is refused rather than allowed unscoped.",
    );
  }

  // 8. The actor must hold the capability: role set, per-grant override,
  //    public-read allowance, or the guest-lens allowance. Guests never
  //    hold a write capability (risk != read) on a direct intent.
  const isGuest = !actor.authUserId;
  const held =
    actor.capabilities.has(input.capability) ||
    PUBLIC_READ_CAPABILITIES.has(input.capability) ||
    (isGuest &&
      GUEST_LENS_CAPABILITIES.has(input.capability) &&
      (input.objectId === null || input.objectId === "self"));
  if (!held) {
    return deny(
      "capability_not_held",
      `The actor does not hold capability "${input.capability}".`,
    );
  }
  if (isGuest && capabilityRow.risk !== "read" && !input.toolName) {
    return deny(
      "capability_not_held",
      `A guest actor never holds write capability "${input.capability}".`,
    );
  }

  // 9. Scope: platform scope is platform-admin only; tenant/grant scope
  //    must match the site tenant when the actor evidences one; a
  //    concrete private object must be owned by the actor.
  if (capabilityRow.scope_mode === "platform" && !actor.roles.includes("platform admin")) {
    return deny(
      "scope_denied",
      `Capability "${input.capability}" is platform-scoped; this actor is not a platform admin.`,
    );
  }
  const tenant = siteTenant();
  if (
    (capabilityRow.scope_mode === "tenant" || capabilityRow.scope_mode === "grant_scope") &&
    actor.tenantId &&
    tenant &&
    actor.tenantId !== tenant
  ) {
    return deny("scope_denied", "The actor's tenant does not match this site's tenant.");
  }
  if (
    input.objectId &&
    input.objectId !== "self" &&
    ["pet", "order", "commitment"].includes(input.objectType)
  ) {
    const owned = await ownsObject(actor, input.objectType, input.objectId);
    if (owned === null) {
      return deny(
        "scope_unverifiable",
        "The object is outside the actor's lens or its ownership could not be verified — refused rather than assumed.",
      );
    }
    if (!owned) {
      return deny(
        "lens_out_of_scope",
        `Object ${input.objectType} ${input.objectId} is outside the actor's lens.`,
      );
    }
  }

  // 10. Explicit lens claims must match the actor: a commitment lens
  //     code is checked against its audience; any other claimed lens
  //     must equal the actor's derived lens.
  if (input.lens) {
    const claimed = input.lens;
    let lensOk = claimed === derivedLens;
    if (!lensOk && claimed.startsWith("commitment.")) {
      const audience = lensAudience(claimed);
      if (audience && input.objectType === "commitment" && audienceHolds(audience, actor)) {
        try {
          const rows = await pgQueryStrict<{ lens_code: string }>(
            `SELECT lens_code FROM public.platform_lenses WHERE lens_code = $1 AND object_code = $2`,
            [claimed, "commitment"],
          );
          lensOk = rows.length > 0;
        } catch {
          lensOk = false;
        }
      }
    }
    if (!lensOk) {
      return deny(
        "lens_out_of_scope",
        `Lens "${claimed}" is not a lens this actor holds for ${input.objectType}.`,
      );
    }
  }

  // 11. The user's Manage controls (governor) govern tool intents last:
  //     a capability the user turned off stays off even for a held,
  //     in-purpose intent. (The executor re-checks; this surfaces the
  //     denial as the router's, with the §2.6 reason attached.)
  if (input.toolName) {
    try {
      const allowed = await governorCapabilityAllowed({
        userId: actor.authUserId,
        tenantId: actor.tenantId ?? tenant,
        capability: TOOL_INTENTS[input.toolName].governorCapability,
      });
      if (!allowed) {
        return deny(
          "governor_declined",
          "The actor's Manage controls (Pawzsly & AI) turn this capability off for this account.",
        );
      }
    } catch {
      // Governor unreachable: the governor's own doctrine is fail-open
      // (missing store = allowed), and the executor re-checks — do not
      // invent a denial the governor itself would not make.
    }
  }

  return {
    ok: true,
    validation: { lens: input.lens ?? derivedLens, purpose, capability: capabilityRow, tool: toolRow },
  };
}

// ---------------------------------------------------------------------------
// §2.6 event log — one row per decision/execution, append-only by trigger.
// ---------------------------------------------------------------------------

export async function writeIntentEvent(input: {
  actor: RouterActor;
  lens: string;
  input: IntentInput;
  result: "allowed" | "denied" | "executed" | "failed" | "guest_deferred";
  denial?: Denial | null;
  tokenId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<{ id: string | null; auditDegraded: boolean }> {
  const tenant = siteTenant();
  const rows = await pgQuery<{ id: string }>(
    `INSERT INTO public.ai_intent_events
       (tenant_id, actor_auth_user_id, actor_lens, grant_id, agent_id, agent_version,
        capability_code, object_type, object_id, from_state, to_state,
        purpose_code, tool_name, result, denial_code, denial_reason, token_id, metadata)
     VALUES ($1, $2::uuid, $3, $4::uuid, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb)
     RETURNING id::text AS id`,
    [
      tenant,
      input.actor.authUserId,
      input.lens,
      input.actor.grantId,
      input.input.agentId ?? "pawzsly",
      input.input.agentVersion ?? null,
      input.input.capability,
      input.input.objectType,
      input.input.objectId,
      input.input.fromState ?? null,
      input.input.toState ?? null,
      input.input.purpose,
      input.input.toolName ?? null,
      input.result,
      input.denial?.code ?? null,
      input.denial?.reason ?? null,
      input.tokenId ?? null,
      JSON.stringify(input.metadata ?? {}),
    ],
  ).catch(() => [] as { id: string }[]);
  if (!rows[0]?.id) {
    console.error("[ai/intent] event write failed (fail-soft, flagged degraded)");
    return { id: null, auditDegraded: true };
  }
  return { id: rows[0].id, auditDegraded: false };
}

// ---------------------------------------------------------------------------
// HTTP path: validate an envelope, mint a scoped token on allow.
// ---------------------------------------------------------------------------

export async function validateAndMint(
  input: IntentInput,
  actor: RouterActor,
): Promise<
  | { allowed: true; token: string; expiresInSeconds: number; lens: string; eventId: string | null; auditDegraded: boolean }
  | { allowed: false; denial: Denial; eventId: string | null; auditDegraded: boolean }
> {
  const validated = await validateIntent(input, actor);
  if (!validated.ok) {
    // A denied intent records the actor's OWN lens, never the lens it
    // claimed and was refused — the claim itself goes in metadata, so
    // the log can never be read as "the actor acted through that lens".
    const ev = await writeIntentEvent({
      actor,
      lens: lensForActor(actor),
      input,
      result: "denied",
      denial: validated.denial,
      metadata: input.lens ? { claimed_lens: input.lens } : {},
    });
    return { allowed: false, denial: validated.denial, eventId: ev.id, auditDegraded: ev.auditDegraded };
  }
  const { token, payload } = mintActorToken({
    authUserId: actor.authUserId,
    grantId: actor.grantId,
    lens: validated.validation.lens,
    purpose: input.purpose,
    capabilities: [input.capability],
    objectType: input.objectType,
    objectId: input.objectId,
  });
  const ev = await writeIntentEvent({
    actor,
    lens: validated.validation.lens,
    input,
    result: "allowed",
    tokenId: payload.jti,
  });
  return {
    allowed: true,
    token,
    expiresInSeconds: payload.exp - Math.floor(Date.now() / 1000),
    lens: validated.validation.lens,
    eventId: ev.id,
    auditDegraded: ev.auditDegraded,
  };
}

// ---------------------------------------------------------------------------
// Chat path: the tool loop's client. Validates, mints, verifies, then
// executes through the real tool — one §2.6 row for the execution.
// ---------------------------------------------------------------------------

export const ROUTER_DECLINE_TEXT =
  "That action is turned off for this account in Manage controls. Answer plainly: name that the Manage controls govern this, and offer what remains allowed (browsing, care answers, the booking flow link). Do not attempt the action another way.";

export async function executeToolViaRouter(args: {
  actor: RouterActor;
  tool: string;
  toolArgs: Record<string, unknown>;
  ctx: ToolExecContext;
  seen: Map<string, ToolCard>;
}): Promise<ToolResult> {
  const map = TOOL_INTENTS[args.tool];
  if (!map) {
    return { text: `Unknown tool "${args.tool}" — it was not executed.` };
  }
  // Object identity for the envelope: the tool's own object — a catalog
  // id for add_to_bag, the breed name for breed facts, the actor's own
  // records ('self') for pets/orders, no specific object for search.
  const objectId =
    args.tool === "add_to_bag"
      ? String(args.toolArgs.productId ?? "") || null
      : args.tool === "get_breed_info"
        ? String(args.toolArgs.breedName ?? "") || null
        : args.tool === "search_products"
          ? null
          : "self";
  const intent: IntentInput = {
    purpose: map.purpose,
    capability: map.capability,
    objectType: map.objectType,
    objectId,
    toolName: args.tool,
  };
  const validated = await validateIntent(intent, args.actor);
  if (!validated.ok) {
    await writeIntentEvent({
      actor: args.actor,
      lens: lensForActor(args.actor),
      input: intent,
      result: "denied",
      denial: validated.denial,
    });
    return { text: ROUTER_DECLINE_TEXT, declined: { capability: map.capability } };
  }
  let minted: ReturnType<typeof mintActorToken>;
  try {
    minted = mintActorToken({
      authUserId: args.actor.authUserId,
      grantId: args.actor.grantId,
      lens: validated.validation.lens,
      purpose: intent.purpose,
      capabilities: [intent.capability],
      objectType: intent.objectType,
      objectId: intent.objectId,
    });
  } catch {
    await writeIntentEvent({
      actor: args.actor,
      lens: validated.validation.lens,
      input: intent,
      result: "denied",
      denial: { code: "token_mint_failed", reason: "The scoped actor token could not be minted — no unscoped execution." },
    });
    return { text: ROUTER_DECLINE_TEXT, declined: { capability: map.capability } };
  }
  // Defense in depth: the token is verified against its own scope
  // before the executor runs — a tampered token never reaches a tool.
  const verified = verifyActorToken(minted.token, {
    authUserId: args.actor.authUserId,
    grantId: args.actor.grantId,
    purpose: intent.purpose,
    capability: intent.capability,
    objectType: intent.objectType,
    objectId: intent.objectId,
  });
  if (!verified.ok) {
    await writeIntentEvent({
      actor: args.actor,
      lens: validated.validation.lens,
      input: intent,
      result: "denied",
      denial: { code: verified.code, reason: verified.reason },
      tokenId: minted.payload.jti,
    });
    return { text: ROUTER_DECLINE_TEXT, declined: { capability: map.capability } };
  }

  let result: ToolResult;
  try {
    result = await executePawzslyTool(args.tool, args.toolArgs, { ...args.ctx, actorToken: minted.token }, args.seen);
  } catch {
    await writeIntentEvent({
      actor: args.actor,
      lens: validated.validation.lens,
      input: intent,
      result: "failed",
      tokenId: minted.payload.jti,
    });
    return {
      text: `The ${args.tool} step didn't go through just now. Tell the shopper plainly it didn't work and offer to try again — never claim it succeeded.`,
    };
  }
  const isGuest = !args.actor.authUserId;
  const guestPrivate =
    isGuest && (args.tool === "list_my_pets" || args.tool === "lookup_orders" || args.tool === "create_pet");
  const execInput: IntentInput = { ...intent };
  if (!result.declined) {
    if (args.tool === "create_pet" && !isGuest) execInput.toState = "saved";
    if (args.tool === "add_to_bag" && (result.actions?.length ?? 0) > 0) execInput.toState = "bag_action";
  }
  await writeIntentEvent({
    actor: args.actor,
    lens: validated.validation.lens,
    input: execInput,
    result: result.declined ? "denied" : guestPrivate ? "guest_deferred" : "executed",
    denial: result.declined
      ? { code: "governor_declined", reason: "The executor's governor gate declined after the router allowed." }
      : null,
    tokenId: minted.payload.jti,
  });
  return result;
}
