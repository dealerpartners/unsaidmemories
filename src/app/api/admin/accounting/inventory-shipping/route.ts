import { NextRequest, NextResponse } from "next/server";
import { resolveTenantId } from "@/lib/admin-api";
import { requireModuleApi } from "@/lib/admin/gate";
import { pgQuery } from "@/lib/pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/accounting/inventory-shipping
//
// Shipping Rates & Carriers (owner's shipping_rates_carriers.html):
// the carrier integration state (Shippo — key saved in the vault or
// present in the environment), the carrier/service registry
// (erp_carriers + erp_shipping_methods), and recent real shipments
// (erp_shipments). No rate amounts are stored anywhere in the data —
// rates are quoted live by the carrier integration at label time —
// so no rate matrix is fabricated.

export async function GET(req: NextRequest) {
  const gate = await requireModuleApi("accounting", "read");
  if (gate) return gate;
  try {
    const tenant = resolveTenantId(req);
    const keys = await pgQuery<{ key_name: string }>(
      `SELECT DISTINCT key_name FROM public.integration_keys WHERE tenant_id = $1`,
      [tenant],
    );
    const keyNames = new Set(keys.map((k) => k.key_name));
    const hasKey = (name: string) => keyNames.has(name) || Boolean(process.env[name]);
    const carriers = await pgQuery<{
      id: string; code: string; name: string; api_provider: string | null; is_active: boolean; methods: number;
    }>(
      `SELECT c.id::text AS id, c.code, c.name, c.api_provider, c.is_active,
              COUNT(m.id)::int AS methods
         FROM public.erp_carriers c
         LEFT JOIN public.erp_shipping_methods m ON m.carrier_id = c.id
        WHERE c.tenant_id = $1
        GROUP BY c.id
        ORDER BY c.name ASC`,
      [tenant],
    );
    const methods = await pgQuery<{
      id: string; code: string; name: string; service_level: string | null; is_active: boolean; carrier_name: string | null;
    }>(
      `SELECT m.id::text AS id, m.code, m.name, m.service_level, m.is_active, c.name AS carrier_name
         FROM public.erp_shipping_methods m
         LEFT JOIN public.erp_carriers c ON c.id = m.carrier_id
        WHERE m.tenant_id = $1
        ORDER BY c.name ASC, m.name ASC`,
      [tenant],
    );
    const shipments = await pgQuery<{
      id: string; shipment_number: string | null; status: string | null;
      tracking_number: string | null; tracking_url: string | null;
      shipped_at: string | null; created_at: string;
    }>(
      `SELECT id::text AS id, shipment_number, status, tracking_number, tracking_url,
              shipped_at::text AS shipped_at, created_at::text AS created_at
         FROM public.erp_shipments
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 50`,
      [tenant],
    );
    return NextResponse.json({
      integrations: [
        {
          id: "shippo", name: "Shippo",
          connected: hasKey("SHIPPO_API_KEY"),
          detail: hasKey("SHIPPO_API_KEY")
            ? "API key is saved — labels and live rates run through Shippo."
            : "No Shippo API key is saved. Add it in Integrations → Shippo to buy labels and quote live rates.",
        },
      ],
      carriers: carriers.map((c) => ({ ...c, methods: Number(c.methods || 0) })),
      methods,
      shipments,
    });
  } catch (e: any) {
    console.error("[GET /api/admin/accounting/inventory-shipping]", e);
    return NextResponse.json({ error: e?.message || "Failed to load shipping" }, { status: 500 });
  }
}
