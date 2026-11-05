import type { Metadata } from "next";
import { createServerClient } from "@/lib/supabase";
import { INTEGRATION_SERVICES } from "@/lib/integrations/catalog";
import { listKeyStatuses } from "@/lib/integrations/keys";
import IntegrationsCatalog from "./integrations-catalog";

export const metadata: Metadata = { title: "Integrations — Admin" };
export const dynamic = "force-dynamic";

// Integrations hub (owner's design): every service the platform can
// connect, its live vault status, and connect/test/disconnect backed by
// the real keys + test-connection APIs.
export default async function IntegrationsOverviewPage() {
  const db = createServerClient();
  const [statuses, supplierRes] = await Promise.all([
    listKeyStatuses().catch(() => []),
    db.from("supplier_catalog_products").select("id", { count: "exact", head: true }),
  ]);
  return (
    <IntegrationsCatalog
      services={INTEGRATION_SERVICES}
      initialStatuses={statuses.map((s) => ({ keyName: s.keyName, source: s.source ?? null, lastFour: s.lastFour ?? null }))}
      supplierCount={supplierRes.count ?? 0}
    />
  );
}
