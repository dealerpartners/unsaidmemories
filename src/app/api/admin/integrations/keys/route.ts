import { NextRequest, NextResponse } from "next/server";
import { getAdminContext, requireAdminApi } from "@/lib/admin/gate";
import { deleteIntegrationKey, listKeyStatuses, setIntegrationKey } from "@/lib/integrations/keys";
import { ALL_KEY_NAMES } from "@/lib/integrations/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — connection statuses for every known key (never the values). */
export async function GET() {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const statuses = await listKeyStatuses();
  return NextResponse.json({ statuses });
}

/** POST { keyName, value } — save (encrypt + store) one key. */
export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const body = await req.json().catch(() => ({}));
  const keyName = String(body.keyName ?? "");
  const value = String(body.value ?? "").trim();
  if (!ALL_KEY_NAMES.includes(keyName)) {
    return NextResponse.json({ error: `Unknown key: ${keyName}` }, { status: 400 });
  }
  if (!value) return NextResponse.json({ error: "Paste the key first — the box is empty." }, { status: 400 });
  const ctx = await getAdminContext();
  await setIntegrationKey(keyName, value, ctx?.userId ?? null);
  const statuses = await listKeyStatuses();
  return NextResponse.json({ ok: true, statuses });
}

/** DELETE ?keyName= — remove a saved key (server value, if any, remains). */
export async function DELETE(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const keyName = req.nextUrl.searchParams.get("keyName") ?? "";
  if (!ALL_KEY_NAMES.includes(keyName)) {
    return NextResponse.json({ error: `Unknown key: ${keyName}` }, { status: 400 });
  }
  await deleteIntegrationKey(keyName);
  const statuses = await listKeyStatuses();
  return NextResponse.json({ ok: true, statuses });
}
