import { NextResponse } from "next/server";
import { getProvider } from "@/lib/integrations/providers";
import { completeOAuth } from "@/lib/integrations/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/integrations/social/callback/[network] — the network
// redirects here with ?code&state. We exchange the code server-side,
// fetch the profile, store the connection, and land back on the
// Integrations screen. (No requireAdmin: the OAuth state cookie set at
// connect time is the proof this browser started the flow.)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ network: string }> }
) {
  const { network } = await params;
  const provider = getProvider(network);
  const back = new URL("/admin/integrations/social", req.url);
  if (!provider) {
    back.searchParams.set("error", `Unknown network "${network}".`);
    return NextResponse.redirect(back);
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (oauthError) {
    back.searchParams.set("error", `${provider.label} declined the connection: ${oauthError}`);
    return NextResponse.redirect(back);
  }
  if (!code || !state) {
    back.searchParams.set("error", `${provider.label} did not return an authorization code.`);
    return NextResponse.redirect(back);
  }
  try {
    const { accounts } = await completeOAuth(provider, code, state, req);
    back.searchParams.set(
      "connected",
      `${provider.label} — ${accounts} account${accounts === 1 ? "" : "s"} connected.`
    );
  } catch (err) {
    back.searchParams.set(
      "error",
      err instanceof Error ? err.message : `Connecting ${provider.label} failed.`
    );
  }
  return NextResponse.redirect(back);
}
