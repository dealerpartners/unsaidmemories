import { SITE_URL } from "@/lib/site-url";
import { toResendVariables } from "@/lib/email/resend-templates";
import { renderHostedEmail } from "@/lib/email/hosted-render";
import { sendEmail } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/customer-auth";
import { createServerClient } from "@/lib/supabase";
import { resolvePartyCustomerId } from "@/lib/customers/party";
import { PLATFORM_TENANT_ID } from "@/lib/admin/gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Notification permissions — what types of messages the customer is
 * willing to receive, per channel, and the authorization behind them
 * (Sunny, 2026-11-03: a flat list is not consent — "you gonna get
 * sued"). Types, not just channels:
 *
 *   orderUpdates — order made / shipped / delivered (transactional)
 *   replies      — answers to your questions, replies to your reviews
 *   offers       — new pieces, collections, sales (marketing)
 *
 * Account & security notices (password resets etc.) are always sent
 * and are not part of this surface.
 *
 * Storage: the type × channel grid lives in auth user_metadata
 * (`notification_prefs`); the legally load-bearing axes are mirrored
 * onto the canonical party record (crm_customers marketing /
 * transactional opt-in flags). SMS requires a mobile number plus an
 * explicit authorization; the consent receipt (number + timestamp +
 * categories) is stamped into user_metadata (`notification_consent`).
 */

type ChannelPrefs = { email: boolean; sms: boolean };
type Prefs = {
  orderUpdates: ChannelPrefs;
  replies: ChannelPrefs;
  offers: ChannelPrefs;
};

const DEFAULT_PREFS: Prefs = {
  orderUpdates: { email: true, sms: false },
  replies: { email: true, sms: false },
  offers: { email: false, sms: false },
};

function mergePrefs(raw: any): Prefs {
  const out: Prefs = JSON.parse(JSON.stringify(DEFAULT_PREFS));
  for (const key of ["orderUpdates", "replies", "offers"] as const) {
    if (raw?.[key]) {
      out[key] = {
        email: Boolean(raw[key].email),
        sms: Boolean(raw[key].sms),
      };
    }
  }
  return out;
}

async function readPartyFlags(supabase: any, user: any) {
  const { data } = await supabase
    .from("crm_customers")
    .select(
      "marketing_email_opt_in, marketing_sms_opt_in, transactional_email_opt_in, transactional_sms_opt_in, mobile_phone, phone",
    )
    .eq("tenant_id", PLATFORM_TENANT_ID)
    .ilike("email", String(user.email || ""))
    .is("merged_into_customer_id", null)
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function GET() {
  try {
    const auth = await requireCustomer();
    if (auth.error) return auth.error;
    const { user } = auth;
    const supabase = createServerClient();

    const party = await readPartyFlags(supabase, user);
    const meta = (user.user_metadata || {}) as any;
    const stored: Prefs | null = meta.notification_prefs
      ? mergePrefs(meta.notification_prefs)
      : null;

    // Effective prefs: the stored grid wins; without one, derive from
    // the party record's flags (which predate the grid), else defaults.
    const prefs: Prefs = stored ?? {
      orderUpdates: {
        email: party ? Boolean(party.transactional_email_opt_in) : true,
        sms: party ? Boolean(party.transactional_sms_opt_in) : false,
      },
      replies: { email: true, sms: false },
      offers: {
        email: party ? Boolean(party.marketing_email_opt_in) : false,
        sms: party ? Boolean(party.marketing_sms_opt_in) : false,
      },
    };

    return NextResponse.json({
      email: user.email,
      mobile: party?.mobile_phone || party?.phone || meta.notification_consent?.number || "",
      prefs,
      smsConsent: meta.notification_consent ?? null,
    });
  } catch (err: any) {
    console.error("[GET notification-preferences]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load notification choices." },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireCustomer();
    if (auth.error) return auth.error;
    const { supabase: authClient, user } = auth;
    const supabase = createServerClient();
    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const party = await readPartyFlags(supabase, user);
    const meta = (user.user_metadata || {}) as any;
    let prefs: Prefs = mergePrefs(meta.notification_prefs ?? null);
    // Party flags backfill the grid when no grid was ever stored.
    if (!meta.notification_prefs && party) {
      prefs.orderUpdates.email = Boolean(party.transactional_email_opt_in);
      prefs.orderUpdates.sms = Boolean(party.transactional_sms_opt_in);
      prefs.offers.email = Boolean(party.marketing_email_opt_in);
      prefs.offers.sms = Boolean(party.marketing_sms_opt_in);
    }

    if (payload.unsubscribeAll === true) {
      prefs = {
        orderUpdates: { email: false, sms: false },
        replies: { email: false, sms: false },
        offers: { email: false, sms: false },
      };
    } else if (payload.prefs) {
      prefs = mergePrefs(payload.prefs);
    }

    const mobile =
      (typeof payload.mobile === "string" && payload.mobile.trim()) ||
      party?.mobile_phone ||
      party?.phone ||
      meta.notification_consent?.number ||
      "";
    const wantsSms = prefs.orderUpdates.sms || prefs.replies.sms || prefs.offers.sms;

    // SMS authorization gate: turning any text category on requires a
    // mobile number and — when this number has not already authorized
    // texts — the explicit consent flag from the authorization checkbox.
    if (wantsSms) {
      if (!mobile) {
        return NextResponse.json(
          { error: "Add a mobile number to receive texts." },
          { status: 400 },
        );
      }
      const prior = meta.notification_consent;
      const alreadyAuthorized = prior && prior.number === mobile;
      if (!alreadyAuthorized && payload.smsConsent !== true) {
        return NextResponse.json(
          {
            error:
              "To turn on texts, check the authorization box so we have your permission to text that number.",
          },
          { status: 400 },
        );
      }
    }

    // Party record (canonical consent axes).
    const partyId = await resolvePartyCustomerId(supabase, user);
    if (!partyId) {
      return NextResponse.json(
        { error: "We couldn't find your customer record." },
        { status: 500 },
      );
    }
    const { error: partyErr } = await supabase
      .from("crm_customers")
      .update({
        transactional_email_opt_in: prefs.orderUpdates.email,
        transactional_sms_opt_in: prefs.orderUpdates.sms,
        marketing_email_opt_in: prefs.offers.email,
        marketing_sms_opt_in: prefs.offers.sms,
        ...(mobile ? { mobile_phone: mobile } : {}),
      })
      .eq("id", partyId);
    if (partyErr) {
      return NextResponse.json({ error: partyErr.message }, { status: 500 });
    }

    // Grid + consent receipt on the auth record.
    const consent = wantsSms
      ? {
          number: mobile,
          at: meta.notification_consent?.number === mobile && meta.notification_consent?.at
            ? meta.notification_consent.at
            : new Date().toISOString(),
          categories: [
            ...(prefs.orderUpdates.sms ? ["order_updates"] : []),
            ...(prefs.replies.sms ? ["replies"] : []),
            ...(prefs.offers.sms ? ["offers"] : []),
          ],
        }
      : meta.notification_consent ?? null;
    const { error: metaErr } = await authClient.auth.updateUser({
      data: {
        notification_prefs: prefs,
        notification_consent: consent,
        notification_prefs_updated_at: new Date().toISOString(),
      },
    });
    if (metaErr) {
      return NextResponse.json({ error: metaErr.message }, { status: 500 });
    }

    // The change itself is confirmed by email (Sunny's design set) —
    // a service confirmation, skipped for the unsubscribe-all action,
    // which carries its own confirmation. Fire-and-forget.
    if (payload.unsubscribeAll !== true && user.email) {
      const vars = toResendVariables({ preferencesUrl: `${SITE_URL}/account/notifications` });
      void sendEmail({
        to: user.email,
        customerId: user.id,
        template: "preferences_updated",
        subject: "Your preferences have been updated",
        html: renderHostedEmail("preferences_updated", vars) || "",
        variables: vars,
      }).catch(() => {});
    }

    return NextResponse.json({ prefs, mobile, smsConsent: consent });
  } catch (err: any) {
    console.error("[PATCH notification-preferences]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to save notification choices." },
      { status: 500 },
    );
  }
}
