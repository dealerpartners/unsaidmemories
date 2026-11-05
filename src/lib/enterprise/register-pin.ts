// ============================================================================
// register-pin.ts — the register ACCESS PIN (Sunny's design, 2026-10-13:
// "the pin number is only for them to get access to the register").
//
// Scope, deliberately small: a PIN set on the staff profile gates OPENING
// a register session. It is NOT a variance/manager-approval credential —
// nothing else in the app consumes it, and it must never grow approval
// semantics.
//
// Storage: crm_staff.register_pin_hash, scrypt only —
//   scrypt$<N>$<salt hex>$<derived-key hex>
// Plaintext is never stored, never logged, and the hash is never
// returned by any API (callers get booleans / verdicts only).
// ============================================================================

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"
import { withPg, TENANT_ID } from "@/lib/crm/enterprise"

const SCRYPT_N = 16384
const KEY_LEN = 32
const PIN_PATTERN = /^[0-9]{4,8}$/

export function isValidPinFormat(pin: string): boolean {
  return PIN_PATTERN.test(pin || "")
}

export function hashRegisterPin(pin: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(pin, salt, KEY_LEN, { N: SCRYPT_N })
  return `scrypt$${SCRYPT_N}$${salt.toString("hex")}$${derived.toString("hex")}`
}

export function verifyRegisterPin(pin: string, stored: string | null | undefined): boolean {
  if (!pin || !stored) return false
  const parts = stored.split("$")
  if (parts.length !== 4 || parts[0] !== "scrypt") return false
  const n = Number(parts[1])
  if (!Number.isInteger(n) || n <= 0) return false
  let salt: Buffer
  let expected: Buffer
  try {
    salt = Buffer.from(parts[2], "hex")
    expected = Buffer.from(parts[3], "hex")
  } catch {
    return false
  }
  if (salt.length === 0 || expected.length === 0) return false
  let actual: Buffer
  try {
    actual = scryptSync(pin, salt, expected.length, { N: n })
  } catch {
    return false
  }
  return timingSafeEqual(actual, expected)
}

export type RegisterStaff = {
  id: string
  userId: string
  displayName: string | null
  hasPin: boolean
}

/** The staff profile linked to a signed-in auth user (crm_staff.user_id). */
export async function resolveRegisterStaff(userId: string): Promise<RegisterStaff | null> {
  return (await withPg(async (client) => {
    const { rows } = await client.query(
      `SELECT id, user_id, display_name, register_pin_hash
         FROM public.crm_staff
        WHERE tenant_id = $1 AND user_id = $2 AND is_active IS NOT FALSE
        LIMIT 1`,
      [TENANT_ID(), userId],
    )
    if (!rows.length) return null
    return {
      id: rows[0].id,
      userId: rows[0].user_id,
      displayName: rows[0].display_name || null,
      hasPin: !!rows[0].register_pin_hash,
    }
  })) ?? null
}

export type PinVerdict = "ok" | "no_pin" | "bad_pin"

/** Verify a PIN against a staff profile's stored hash. */
export async function verifyStaffPin(staffId: string, pin: string): Promise<PinVerdict> {
  const verdict = await withPg(async (client) => {
    const { rows } = await client.query(
      `SELECT register_pin_hash FROM public.crm_staff
        WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [TENANT_ID(), staffId],
    )
    if (!rows.length) return "bad_pin" as PinVerdict
    const stored = rows[0].register_pin_hash as string | null
    if (!stored) return "no_pin" as PinVerdict
    return verifyRegisterPin(pin, stored) ? ("ok" as PinVerdict) : ("bad_pin" as PinVerdict)
  })
  return verdict ?? "bad_pin"
}

/** Set (or reset) the staff member's own register PIN. Stores the hash only. */
export async function setStaffRegisterPin(staffId: string, pin: string): Promise<boolean> {
  if (!isValidPinFormat(pin)) return false
  const hash = hashRegisterPin(pin)
  const done = await withPg(async (client) => {
    const res = await client.query(
      `UPDATE public.crm_staff
          SET register_pin_hash = $3, updated_at = now()
        WHERE tenant_id = $1 AND id = $2`,
      [TENANT_ID(), staffId, hash],
    )
    return (res.rowCount ?? 0) > 0
  })
  return done ?? false
}
