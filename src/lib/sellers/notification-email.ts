// ---------------------------------------------------------------------------
// sellers/notification-email.ts — the address a seller's notification
// emails actually go to.
//
// Until now the sender (lib/sellers/notify) had exactly one address to
// read: the email on the seller's record — an identity address, and
// for the house seller the owner/admin inbox, which is how an order
// alert for a seller's products landed with the admin instead of the
// address the seller works from (Sunny, 2026-10-24).
//
// The seller sets their notification address in Seller Center →
// Account → Notifications. It lives in app_settings (the platform's
// key/value settings store; key seller_notification_email:<sellerId>,
// value the address as a JSON string) because
// seller_notification_preferences carries boolean toggles only — this
// needed no schema change. Unset/invalid means "the account email on
// the seller record" — the behavior every seller had before the
// setting existed.
// ---------------------------------------------------------------------------

type QueryClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>
}

const keyFor = (sellerId: string) => `seller_notification_email:${sellerId}`

export function isValidNotificationEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

function rowsOf(res: unknown): Record<string, unknown>[] {
  const r = res as { rows?: Record<string, unknown>[] }
  return r?.rows ?? []
}

/** The seller-set notification address, or null when none is set (or
 *  the stored value isn't a usable address). Never throws — a settings
 *  read must not be able to break a send. */
export async function readSellerNotificationEmail(
  client: QueryClient,
  sellerId: string,
): Promise<string | null> {
  try {
    const res = await client.query(`SELECT value FROM app_settings WHERE key = $1`, [
      keyFor(sellerId),
    ])
    const v = rowsOf(res)[0]?.value
    const raw =
      typeof v === "string"
        ? v
        : v && typeof v === "object" && typeof (v as { email?: unknown }).email === "string"
          ? (v as { email: string }).email
          : null
    const email = String(raw || "").trim().toLowerCase()
    return email && isValidNotificationEmail(email) ? email : null
  } catch {
    return null
  }
}

/** Set (or, with null, clear) the seller's notification address. */
export async function writeSellerNotificationEmail(
  client: QueryClient,
  sellerId: string,
  email: string | null,
): Promise<void> {
  if (email) {
    await client.query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [keyFor(sellerId), JSON.stringify(email)],
    )
  } else {
    await client.query(`DELETE FROM app_settings WHERE key = $1`, [keyFor(sellerId)])
  }
}
