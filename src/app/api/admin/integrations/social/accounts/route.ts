import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireAdminApi } from "@/lib/admin/gate";
import { listAccounts, disconnectAccount } from "@/lib/integrations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/integrations/social/accounts — connected social accounts
// (profile + status only; tokens are never returned).
export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const db = createServerClient();
  return NextResponse.json({ accounts: await listAccounts(db) });
}

// DELETE /api/admin/integrations/social/accounts?id=… — disconnect an
// account: status flips to disconnected and stored tokens are wiped.
export async function DELETE(req: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing account id." }, { status: 400 });
  const db = createServerClient();
  try {
    await disconnectAccount(db, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Disconnect failed." },
      { status: 500 }
    );
  }
}
