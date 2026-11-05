import { NextResponse } from "next/server";
import { pgQueryStrict } from "@/lib/pg";
import { MASTER_TENANT_ID } from "@/lib/site-tenant";
import { getCurrentUser } from "@/lib/auth/server";
import { ensureDeveloperContext } from "@/lib/devportal-server";
import { ensureAdAccount, orgIdForUser, type AdAccount } from "@/lib/ads-server";

export const dynamic = "force-dynamic";

/**
 * /api/ads/verification — advertiser business verification
 * (public.ad_account_verifications). Before ship-ads (2026-10-23) the
 * table had ZERO code references and the three verification pages
 * rendered template filler (one even showed invented "Item 1/2/3"
 * rows); the onboarding wizard sent advertisers to those pages to
 * "complete verification from your account page" — a dead end.
 *
 * GET: the org's ad account verification state — account.verified plus
 *      the latest verification row (status pending / approved /
 *      rejected, submitted documents summary, review stamps).
 * POST { business_name, website?, kind?, notes? }: file a verification
 *      request — one row, status 'pending', the submitted business
 *      details carried in `documents` (jsonb). Idempotent while a
 *      request is pending: a second submit returns the open request
 *      instead of stacking rows. Review itself is a platform action
 *      (reviewed_by / reviewed_at are stamped by the reviewer; an
 *      approval also flips ad_accounts.verified, which GET reads).
 */

interface VerificationRow {
  id: string;
  account_id: string;
  kind: string;
  status: string;
  documents: Record<string, unknown> | null;
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

async function accountForOrg(organizationId: string): Promise<AdAccount | null> {
  const rows = await pgQueryStrict<AdAccount>(
    `SELECT id, organization_id, tenant_id, name, status, verified, tier, stripe_customer_id
       FROM public.ad_accounts WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [organizationId],
  );
  return rows[0] ?? null;
}

async function latestFor(accountId: string): Promise<VerificationRow | null> {
  const rows = await pgQueryStrict<VerificationRow>(
    `SELECT id, account_id, kind, status, documents, notes, reviewed_by, reviewed_at, created_at, updated_at
       FROM public.ad_account_verifications
      WHERE account_id = $1
      ORDER BY created_at DESC LIMIT 1`,
    [accountId],
  );
  return rows[0] ?? null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const organizationId = await orgIdForUser(user.id);
    if (!organizationId) {
      return NextResponse.json({ verified: false, account: null, latest: null });
    }
    const account = await accountForOrg(organizationId);
    if (!account) {
      return NextResponse.json({ verified: false, account: null, latest: null });
    }
    const latest = await latestFor(account.id);
    return NextResponse.json({
      verified: account.verified === true,
      account: { id: account.id, name: account.name },
      latest,
    });
  } catch {
    return NextResponse.json({ error: "verification_unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const businessName = String(body.business_name ?? "").trim();
  if (!businessName) {
    return NextResponse.json({ error: "business_name_required" }, { status: 400 });
  }
  const website = String(body.website ?? "").trim();
  const kind = String(body.kind ?? "business").trim() || "business";
  const notes = String(body.notes ?? "").trim() || null;
  try {
    const ctx = await ensureDeveloperContext(user);
    const account = await ensureAdAccount(
      ctx.organizationId,
      ctx.tenantId ?? MASTER_TENANT_ID,
      ctx.organizationName,
    );
    if (account.verified === true) {
      return NextResponse.json(
        { error: "already_verified", verified: true },
        { status: 409 },
      );
    }
    const existing = await latestFor(account.id);
    if (existing && existing.status === "pending") {
      return NextResponse.json({ verification: existing, already_pending: true });
    }
    const documents = {
      business_name: businessName,
      ...(website ? { website } : {}),
      submitted_by_email: user.email ?? null,
    };
    const rows = await pgQueryStrict<VerificationRow>(
      `INSERT INTO public.ad_account_verifications (account_id, kind, status, documents, notes)
       VALUES ($1, $2, 'pending', $3::jsonb, $4)
       RETURNING id, account_id, kind, status, documents, notes, reviewed_by, reviewed_at, created_at, updated_at`,
      [account.id, kind, JSON.stringify(documents), notes],
    );
    return NextResponse.json({ verification: rows[0] }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "verification_submit_unavailable" }, { status: 503 });
  }
}
