import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { getGoogleMerchantStatus } from "@/lib/google-merchant/sync"

// ---------------------------------------------------------------------------
// GET /api/admin/settings/google-merchant — the Merchant API v1
// product sync's admin face, in the admin settings family. State
// only:
//
//   armed + the service account's email (an identifier — credential
//   material is NEVER returned; the credential itself is managed on
//   the google-indexing settings surface, the ONE gate),
//   the Merchant Center account id + API data-source id the sync
//   targets (app_settings when stored, else the seeded constants —
//   identifiers, recorded by migration record 20261200),
//   which of the sync tables are installed,
//   ledger counts (pushed / failed / deleted), the last run's
//   summary, and the most recent per-item failures with their
//   recorded errors.
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest) {
  const gate = await requireModuleApi("administration", "read")
  if (gate) return gate

  try {
    const status = await getGoogleMerchantStatus()
    return NextResponse.json({ ok: true, ...status })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to load Google merchant status" },
      { status: 500 },
    )
  }
}
