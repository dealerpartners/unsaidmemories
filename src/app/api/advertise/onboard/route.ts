import { NextRequest, NextResponse } from "next/server";
import { createAuthClient } from "@/lib/supabase/server";
import { createServerClient } from "@/lib/supabase";
import { pgQuery } from "@/lib/pg";
import { getTenantId } from "@/lib/tenant";
import { activateAdvertiser } from "@/lib/ads/advertiser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/advertise/onboard
// Saves the advertiser brand profile from the 6-step onboarding flow
// and activates the advertiser privilege ON THE SIGNED-IN CUSTOMER
// ACCOUNT. There is no separate advertiser account or login (owner
// ruling, 2026-11-02): the identity is the session's user, the
// privilege is the ad_advertisers row + ads identity grant that
// activateAdvertiser creates, and re-entry is the ordinary customer
// sign-in. This route previously created a second Supabase auth
// account from a fresh email + password — which stranded anyone who
// already had a customer account and never granted the privilege the
// Ad Center actually checks.
//
// Body: the onboarding shape (brandName, website, businessType,
// billingCountry, objectives[], contextualCategories[], readerMindset,
// geography, brandSafetyExclusions, headline, storyHook,
// destinationUrl, brandMessage, budgetTier, flightType, paymentMethod).
// Legacy email/password fields in the body are ignored.

type OnboardingPayload = {
  brandName: string;
  website: string;
  businessType: string;
  billingCountry: string;
  objectives: string[];
  contextualCategories: string[];
  readerMindset: string;
  geography: string;
  brandSafetyExclusions: string;
  headline: string;
  storyHook: string;
  destinationUrl: string;
  brandMessage: string;
  budgetTier: string;
  flightType: string;
  paymentMethod: string;
};

export async function POST(req: NextRequest) {
  // 1. Identity = the signed-in customer. No session, no onboarding —
  //    the client sends the visitor to the one login and back.
  const authClient = await createAuthClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json(
      {
        error: "Sign in with your Unsaid account first — advertising runs on the same account you shop with.",
        login: "/login?next=/advertise/get-started",
      },
      { status: 401 },
    );
  }

  let body: OnboardingPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!String(body.brandName || "").trim()) {
    return NextResponse.json({ error: "Brand name is required." }, { status: 400 });
  }
  const email = user.email || "";

  // 2. Activate the advertiser privilege on THIS account (get-or-create
  //    the ad_advertisers row + the ads identity grant).
  try {
    await activateAdvertiser(user, String(body.brandName).trim());
  } catch (err) {
    console.error("[onboard] advertiser activation failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: "Advertiser activation is unavailable right now. Please try again." },
      { status: 503 },
    );
  }

  // 3. Upsert the profiles row (display_name = brand name)
  try {
    const sb = createServerClient();
    await sb.from("profiles").upsert(
      {
        id: user.id,
        email,
        display_name: body.brandName,
      },
      { onConflict: "id" },
    );
  } catch (err) {
    console.error("[onboard] profiles upsert failed:", err instanceof Error ? err.message : String(err));
  }

  // 4. Save the full advertiser onboarding profile (best-effort)
  try {
    const tenantId = getTenantId();
    await pgQuery(
      `INSERT INTO public.advertiser_profiles
         (user_id, tenant_id, email, brand_name, website, business_type, billing_country,
          objectives, contextual_categories, reader_mindset, geography,
          brand_safety_exclusions, headline, story_hook, destination_url, brand_message,
          budget_tier, flight_type, payment_method, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'pending_review', NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         brand_name = EXCLUDED.brand_name,
         website = EXCLUDED.website,
         objectives = EXCLUDED.objectives,
         contextual_categories = EXCLUDED.contextual_categories,
         budget_tier = EXCLUDED.budget_tier,
         updated_at = NOW()`,
      [
        user.id,
        tenantId,
        email,
        body.brandName,
        body.website,
        body.businessType,
        body.billingCountry,
        JSON.stringify(body.objectives),
        JSON.stringify(body.contextualCategories),
        body.readerMindset,
        body.geography,
        body.brandSafetyExclusions,
        body.headline,
        body.storyHook,
        body.destinationUrl,
        body.brandMessage,
        body.budgetTier,
        body.flightType,
        body.paymentMethod,
      ],
    );
  } catch (err) {
    // The advertiser_profiles table may not exist yet — the privilege
    // is still activated and the user can enter the Ad Center. The
    // profile data can be backfilled later.
    console.error("[onboard] advertiser_profiles insert failed:", err instanceof Error ? err.message : String(err));
  }

  return NextResponse.json({ ok: true, redirect: "/ads" });
}
