import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { getGooglePropertiesStatus } from "@/lib/google-properties/client"

// ---------------------------------------------------------------------------
// GET /api/admin/settings/google-properties — the Google property
// consumers' admin face, in the admin settings family (the
// google-indexing pattern). State only:
//
//   armed + the service account's email / project id (identifiers —
//   credential material is NEVER returned; the credential itself is
//   managed on the google-indexing settings surface, the ONE gate),
//   which of the 20261200 tables are installed,
//   the resolved property ids (app_settings when stored, else the
//   owner's known ids seeded in lib/google-properties — Search
//   Console property, GA4 property + account; discovery refreshes
//   the stored values when its API is enabled),
//   per-API reachability from the latest recorded sync run:
//   enabled (pulling) / disabled (the API is not enabled in the
//   Cloud project yet — 403 SERVICE_DISABLED) / error (with the
//   classified detail) / never_run,
//   last-pull stats: Search Console rows + sitemap errors, GA4 rows.
//
// Merchant Center sync has its own admin surface:
// GET /api/admin/settings/google-merchant (lib/google-merchant).
// ---------------------------------------------------------------------------

export async function GET(_req: NextRequest) {
  const gate = await requireModuleApi("administration", "read")
  if (gate) return gate

  try {
    const status = await getGooglePropertiesStatus()
    return NextResponse.json({ ok: true, ...status })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to load Google properties status" },
      { status: 500 },
    )
  }
}
