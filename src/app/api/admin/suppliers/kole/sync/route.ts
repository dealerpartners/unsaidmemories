import { NextResponse } from "next/server"
import { resolveTenantId } from "@/lib/admin-api"
import { requireModuleApi } from "@/lib/admin/gate";
import { koleConfig } from "@/lib/suppliers/kole"
import { runKoleFeedSync } from "@/lib/suppliers/kole-sync"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST /api/admin/suppliers/kole/sync
// Pulls the Kole Imports product feed (KOLE_FEED_URL — the URL carries its
// own access key) and syncs Pet Supplies items into the enterprise catalog.
// Needs the "purchasing" module, same as the Supplier Orders desk.
// Until the feed URL is set in Vercel env, this returns an honest 503 —
// never a fake "synced" result.
export async function POST(req: Request) {
  const denied = await requireModuleApi("purchasing", "write")
  if (denied) return denied

  if (!koleConfig().feedUrl) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: "Kole Imports is not configured — set KOLE_FEED_URL in Vercel env and this sync will run.",
        missing: ["KOLE_FEED_URL"],
      },
      { status: 503 },
    )
  }

  try {
    const tallies = await runKoleFeedSync(resolveTenantId(req))
    return NextResponse.json({ ok: true, configured: true, ...tallies })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const status = message === "Database unavailable" ? 503 : 502
    return NextResponse.json({ ok: false, error: message }, { status })
  }
}
