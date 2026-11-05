import { NextRequest, NextResponse } from "next/server"
import { requireModuleApi } from "@/lib/admin/gate";
import { pgExec, pgQuery } from "@/lib/pg"
import { invalidate } from "@/lib/cache"
import { parseServiceAccount } from "@/lib/google-indexing/core"
import {
  resolveGoogleIndexingConfig,
  submissionsTableInstalled,
  submitUrlForIndexing,
} from "@/lib/google-indexing/client"

// ---------------------------------------------------------------------------
// /api/admin/settings/google-indexing — the Google Indexing API gate's
// admin face, in the admin settings family (shipping/affiliate pattern).
//
//   GET  — state only: armed or not, the service account's email (an
//          identifier, shown like PayPal's client id — the private
//          key is NEVER returned), ledger installed or not, and the
//          ledger's counts (submitted in 24h against the 200/day
//          quota, outstanding failures, latest activity).
//   PUT  — upsert google.indexing_service_account_json in app_settings.
//          The value is validated as a service account before it is
//          saved and is never echoed back. Empty string clears it.
//   POST — submit ONE URL now ({ url, type? }): an explicit operator
//          action that bypasses the freshness window but records its
//          result in the ledger like every other submission.
// ---------------------------------------------------------------------------

const SETTINGS_KEY = "google.indexing_service_account_json"

export async function GET(_req: NextRequest) {
  const gate = await requireModuleApi("administration", "read")
  if (gate) return gate

  try {
    const config = await resolveGoogleIndexingConfig()
    const installed = await submissionsTableInstalled()
    let stats: {
      submittedLast24h: number
      failedOutstanding: number
      totalTracked: number
      latestSubmittedAt: string | null
    } | null = null
    if (installed) {
      const rows = await pgQuery<{
        submitted_24h: string
        failed: string
        total: string
        latest: string | null
      }>(
        `SELECT
           count(*) FILTER (WHERE status = 'submitted' AND last_submitted_at > now() - interval '24 hours')::text AS submitted_24h,
           count(*) FILTER (WHERE status = 'failed')::text AS failed,
           count(*)::text AS total,
           max(last_submitted_at)::text AS latest
         FROM google_indexing_submissions`,
      )
      const r = rows[0]
      stats = {
        submittedLast24h: Number(r?.submitted_24h) || 0,
        failedOutstanding: Number(r?.failed) || 0,
        totalTracked: Number(r?.total) || 0,
        latestSubmittedAt: r?.latest ?? null,
      }
    }
    return NextResponse.json({
      ok: true,
      armed: config.armed,
      serviceAccountEmail: config.serviceAccount?.clientEmail ?? null,
      projectId: config.serviceAccount?.projectId ?? null,
      ledgerInstalled: installed,
      dailyQuota: 200,
      stats,
    })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to load Google indexing settings" },
      { status: 500 },
    )
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireModuleApi("administration", "write")
  if (gate) return gate

  try {
    const body = (await req.json()) as Record<string, unknown>
    if (!(SETTINGS_KEY in body)) {
      return NextResponse.json(
        { ok: false, error: `No recognized key in request body (expected ${SETTINGS_KEY})` },
        { status: 400 },
      )
    }
    const raw = body[SETTINGS_KEY]
    const value = typeof raw === "string" ? raw.trim() : raw == null ? "" : raw
    // Validate before saving: a value that does not parse as a service
    // account would arm nothing and fail opaquely at token exchange.
    if (value !== "" && !parseServiceAccount(value)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Value is not a usable service account (needs client_email + private_key, as JSON or the downloaded key file contents)",
        },
        { status: 400 },
      )
    }
    // Stored exactly like the shipping settings: a JSONB string scalar.
    const stored = typeof value === "string" ? value : JSON.stringify(value)
    const jsonVal = JSON.stringify(stored)
    const updated = await pgExec(
      `UPDATE app_settings SET value = $2::jsonb, description = $3, updated_at = now() WHERE key = $1`,
      [SETTINGS_KEY, jsonVal, "Google Indexing API service account (JSON)"],
    )
    if (updated === 0) {
      await pgExec(
        `INSERT INTO app_settings (key, value, description, updated_at) VALUES ($1, $2::jsonb, $3, now())`,
        [SETTINGS_KEY, jsonVal, "Google Indexing API service account (JSON)"],
      )
    }
    invalidate("google-indexing:config")
    return NextResponse.json({ ok: true, saved: [SETTINGS_KEY] })
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to save Google indexing settings" },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireModuleApi("administration", "write")
  if (gate) return gate

  try {
    const body = (await req.json()) as { url?: unknown; type?: unknown }
    const url = typeof body.url === "string" ? body.url.trim() : ""
    if (!url) {
      return NextResponse.json({ ok: false, error: "Body must include a url" }, { status: 400 })
    }
    const type = body.type === "URL_DELETED" ? "URL_DELETED" : "URL_UPDATED"
    const result = await submitUrlForIndexing(url, type)
    if (result.ok) {
      return NextResponse.json({ ok: true, url, type, providerStatus: result.status })
    }
    const status =
      result.reason === "invalid_url"
        ? 400
        : result.reason === "not_armed" || result.reason === "not_installed"
          ? 503
          : 502
    return NextResponse.json(
      { ok: false, url, type, reason: result.reason, error: result.error ?? null },
      { status },
    )
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "Failed to submit URL" },
      { status: 500 },
    )
  }
}
