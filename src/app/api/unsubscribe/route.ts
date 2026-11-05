import { SITE_URL } from "@/lib/site-url";
import { toResendVariables } from "@/lib/email/resend-templates";
import { renderHostedEmail } from "@/lib/email/hosted-render";
import { sendEmail } from "@/lib/email";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { PLATFORM_TENANT_ID } from "@/lib/admin/gate";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/unsubscribe?u=<auth user id>&t=<hmac> — the one-click
 * unsubscribe carried in every marketing email. No sign-in: the HMAC
 * token is the authorization. Turns OFF marketing (new pieces &
 * offers) on the canonical party record and in the customer's stored
 * preference grid. Order updates and account security mail are not
 * marketing and are controlled from the customer's portal instead.
 */

function page(title: string, body: string): NextResponse {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — unsaid</title></head>
<body style="margin:0;background:#fff;font-family:Georgia,serif;color:#23202e;display:flex;min-height:100vh;align-items:center;justify-content:center">
<main style="max-width:440px;padding:32px;text-align:center">
<div style="font-family:'DM Sans',Arial,sans-serif;font-size:11px;letter-spacing:.18em;color:#8c6fb8;font-weight:700">UNSAID MEMORIES</div>
<h1 style="font-weight:400;font-size:30px;margin:12px 0 10px">${title}</h1>
<p style="font-family:'DM Sans',Arial,sans-serif;font-size:14px;color:#55506a;line-height:1.6;margin:0">${body}</p>
</main></body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get("u") || "";
  const t = req.nextUrl.searchParams.get("t") || "";
  if (!u || !t || !verifyUnsubscribeToken(u, t)) {
    return page(
      "That link doesn't check out",
      "This unsubscribe link is invalid or has expired. You can manage every message choice in your account under Notifications.",
    );
  }

  try {
    const supabase = createServerClient();
    const { data: userRes } = await supabase.auth.admin.getUserById(u);
    const authUser = userRes?.user ?? null;
    const email = authUser?.email;
    if (!email || !authUser) {
      return page(
        "Already done",
        "You're unsubscribed from offers and new-piece emails.",
      );
    }

    // Canonical party record: marketing off on both channels.
    await supabase
      .from("crm_customers")
      .update({ marketing_email_opt_in: false, marketing_sms_opt_in: false })
      .eq("tenant_id", PLATFORM_TENANT_ID)
      .ilike("email", email)
      .is("merged_into_customer_id", null);

    // Preference grid: offers off (order updates are untouched here).
    const meta = (authUser.user_metadata || {}) as any;
    if (meta.notification_prefs) {
      const prefs = {
        ...meta.notification_prefs,
        offers: { email: false, sms: false },
      };
      await supabase.auth.admin.updateUserById(u, {
        user_metadata: { ...meta, notification_prefs: prefs },
      });
    }

    // The confirmation email for the unsubscribe itself — a
    // one-to-one service confirmation (transactional), rendered
    // from the hosted design. Fire-and-forget.
    {
      const vars = toResendVariables({ resubscribeUrl: `${SITE_URL}/account/notifications` });
      void sendEmail({
        to: email,
        template: "unsubscribe_confirmation",
        subject: "You've been unsubscribed",
        html: renderHostedEmail("unsubscribe_confirmation", vars) || "",
        variables: vars,
      }).catch(() => {});
    }

    return page(
      "You're unsubscribed",
      "You won't receive new-piece or offer emails anymore. Order updates for anything you buy still come through — every message choice lives in your account under Notifications.",
    );
  } catch (err: any) {
    console.error("[GET /api/unsubscribe]", err);
    return page(
      "Something went wrong",
      "We couldn't complete the unsubscribe just now. You can turn messages off in your account under Notifications.",
    );
  }
}
