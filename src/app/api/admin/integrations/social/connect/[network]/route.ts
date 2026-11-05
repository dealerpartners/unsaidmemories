import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/gate";
import { createAuthClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/integrations/providers";
import { beginOAuth } from "@/lib/integrations/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/integrations/social/connect/[network] — start the OAuth
// flow: redirect the admin to the network's authorize page.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ network: string }> }
) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const { network } = await params;
  const provider = getProvider(network);
  const back = new URL("/admin/integrations/social", req.url);
  if (!provider) {
    back.searchParams.set("error", `Unknown network "${network}".`);
    return NextResponse.redirect(back);
  }
  const auth = await createAuthClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    back.searchParams.set("error", "Your session expired. Sign in again.");
    return NextResponse.redirect(back);
  }
  const result = await beginOAuth(provider, user.id, req);
  if ("error" in result) {
    back.searchParams.set("error", result.error);
    return NextResponse.redirect(back);
  }
  return NextResponse.redirect(result.url);
}
