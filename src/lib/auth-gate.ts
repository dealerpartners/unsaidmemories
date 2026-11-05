import { createServerClient } from "@/lib/supabase";
import {
  appEmailGateApplies,
  emailGatePath,
  isPhoneVerified,
  phoneGatePath,
} from "@/lib/twilio-verify";

type GateUser = {
  id?: string;
  user_metadata?: Record<string, unknown> | null;
} | null;

/**
 * Staff identity for the sign-in gate: an active portal_users row — the
 * same store the admin gate reads. A staff role was granted to this
 * person by an admin; that grant is the trust decision, so staff never
 * owe the customer phone-verification step (and the store never pays
 * Twilio to re-prove a granted role).
 */
export async function isStaffAccount(userId: string): Promise<boolean> {
  try {
    const db = createServerClient();
    const { data } = await db
      .from("portal_users")
      .select("id, is_active")
      .eq("user_id", userId)
      .limit(5);
    return (data ?? []).some(
      (r: { is_active?: boolean | null }) => r.is_active !== false,
    );
  } catch {
    return false;
  }
}

/**
 * The diversion decision every door uses, staff-aware: app email
 * confirmation first (unchanged), then the phone step — which staff
 * accounts skip entirely. Customers follow gatePathFor exactly.
 */
export async function gatePathForAccount(
  user: GateUser,
  next: string,
): Promise<string> {
  if (!user) return next;
  if (appEmailGateApplies(user)) return emailGatePath(next);
  if (isPhoneVerified(user)) return next;
  if (user.id && (await isStaffAccount(user.id))) return next;
  return phoneGatePath(next);
}
