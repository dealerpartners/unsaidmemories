import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import {
  coercePrinterSettings,
  getPrinterSettings,
  savePrinterSettings,
} from "@/lib/printing/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================================
// /api/admin/settings/printing — per-tenant station printer preferences.
//
// Printing itself happens on the device running the app (OS print
// dialog); these settings only control what the app legitimately owns:
// the paper format each document type is rendered for, and whether the
// print dialog fires automatically when a print document opens.
//   GET → { ok, settings }  (defaults when the tenant has no row)
//   PUT { receipt: { paper, autoPrint }, label: {...}, document: {...} }
// ============================================================================

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("administration", "read");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const settings = await getPrinterSettings(tenant);
  return NextResponse.json({ ok: true, settings });
}

export async function PUT(req: NextRequest) {
  const gate = await requireModuleApi("administration", "write");
  if (gate) return gate;
  const tenant = resolveTenantId(req);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "JSON body required" }, { status: 400 });
  }
  const settings = coercePrinterSettings(body);
  const saved = await savePrinterSettings(tenant, settings);
  if (!saved) {
    return NextResponse.json({ ok: false, error: "Printer settings could not be saved" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, settings });
}
