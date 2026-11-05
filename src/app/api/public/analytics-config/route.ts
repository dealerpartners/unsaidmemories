import { NextResponse } from "next/server";
import { getIntegrationKey } from "@/lib/integrations/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public analytics configuration for the storefront — only values
 * that are safe to show in a browser (GA4 measurement ID, PostHog
 * project key + host). Set on the Connections page.
 */
export async function GET() {
  const [ga4, gtm, clarity, posthogKey, posthogHost] = await Promise.all([
    getIntegrationKey("GA4_MEASUREMENT_ID"),
    getIntegrationKey("GTM_CONTAINER_ID"),
    getIntegrationKey("CLARITY_PROJECT_ID"),
    getIntegrationKey("POSTHOG_KEY"),
    getIntegrationKey("POSTHOG_HOST"),
  ]);
  return NextResponse.json(
    {
      ga4MeasurementId: ga4 || null,
      gtmContainerId: gtm || null,
      clarityProjectId: clarity || null,
      posthogKey: posthogKey || null,
      posthogHost: posthogHost || "https://us.i.posthog.com",
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
