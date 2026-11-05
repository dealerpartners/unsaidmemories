import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { PLATFORM_TENANT_ID, requireAdminApi } from "@/lib/admin/gate";
import {
  createGelatoPayload,
  createProdigiPayload,
  type ShipTo,
} from "@/lib/fulfillment/payload-factory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mock Checkout Simulator (Sunny's sandbox route) — verifies Rule C
 * routing for a SKU WITHOUT dispatching anything: resolves the
 * supplier_product_mappings row, finds the design's Rule B print
 * file, builds the exact production payload via the payload factory,
 * and returns the timeline + payload + target endpoint for review.
 *
 * POST { productSku: string, country?: string, quantity?: number }
 */
const ENDPOINTS: Record<string, string> = {
  gelato: "https://order.gelatoapis.com/v3/orders",
  prodigi: "https://api.prodigi.com/v4.0/Orders",
  printful: "https://api.printful.com/orders (sync-product flow; orders pass through)",
};

export async function POST(req: NextRequest) {
  const gate = await requireAdminApi();
  if (gate) return gate;
  const body = await req.json().catch(() => ({}));
  const productSku: string = String(body.productSku ?? "").trim();
  const country: string = String(body.country ?? "US").toUpperCase();
  const quantity: number = Math.max(1, Number(body.quantity ?? 1) || 1);
  const logs: string[] = [];
  const stamp = () => new Date().toISOString();
  logs.push(`[${stamp()}] 🚀 Launching sandbox test checkout sequence mapping SKU: [${productSku}]`);

  if (!productSku) {
    return NextResponse.json({ simulationSuccess: false, logs, errorDetails: "productSku is required" }, { status: 400 });
  }

  const db = createServerClient();
  const { data: mapping } = await db
    .from("supplier_product_mappings")
    .select("id, supplier_id, supplier_catalog_variant_id, product_sku, supplier_sku, print_job_config, printful_sync_product_id")
    .eq("tenant_id", PLATFORM_TENANT_ID)
    .eq("product_sku", productSku)
    .maybeSingle();
  if (!mapping) {
    logs.push(`[${stamp()}] 🔴 Fulfillment map registry missing for SKU: ${productSku}`);
    return NextResponse.json({ simulationSuccess: false, logs, errorDetails: `No supplier_product_mappings row for product_sku ${productSku}` }, { status: 404 });
  }
  const { data: supplier } = await db.from("suppliers").select("slug, name").eq("id", mapping.supplier_id).maybeSingle();
  const slug = supplier?.slug ?? "unknown";
  logs.push(`[${stamp()}] 🟢 Mapping resolved. Supplier channel matched: [${slug.toUpperCase()}]`);

  // The Rule B print file for this variant's product, when a design
  // has been published against it.
  let printFileUrl: string | null = null;
  if (mapping.supplier_catalog_variant_id) {
    const { data: variant } = await db
      .from("supplier_catalog_variants")
      .select("supplier_catalog_product_id")
      .eq("id", mapping.supplier_catalog_variant_id)
      .maybeSingle();
    if (variant?.supplier_catalog_product_id) {
      // Designs link to the SOURCE catalog product; published designs
      // also link to the storefront (mirror) product via
      // design_publications — check both paths.
      let design: { print_file_path: string | null } | null = null;
      const { data: pub } = await db
        .from("design_publications")
        .select("design_id")
        .eq("product_id", variant.supplier_catalog_product_id)
        .limit(1)
        .maybeSingle();
      if (pub?.design_id) {
        const { data: d } = await db
          .from("designs")
          .select("print_file_path")
          .eq("id", pub.design_id)
          .not("print_file_path", "is", null)
          .maybeSingle();
        design = d;
      }
      if (!design) {
        const { data: d2 } = await db
          .from("designs")
          .select("print_file_path")
          .eq("supplier_catalog_product_id", variant.supplier_catalog_product_id)
          .not("print_file_path", "is", null)
          .limit(1)
          .maybeSingle();
        design = d2;
      }
      if (design?.print_file_path) {
        // print_file_path is a `bucket/path` ref (see storage.ts) — strip
        // the stored bucket segment before prefixing, same as publish.ts.
        printFileUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}/storage/v1/object/public/design-files/${String(design.print_file_path).replace(/^design-files\//, "")}`;
        logs.push(`[${stamp()}] 🟢 Rule B print file resolved for this product.`);
      }
    }
  }
  if (!printFileUrl) {
    logs.push(`[${stamp()}] ⚠️ No published design print file for this SKU — payload built without a file (supplier will require one for print products).`);
  }

  const mockOrderId = `MOCK_TX_${Math.floor(Math.random() * 1000000)}`;
  const shipTo: ShipTo = {
    firstName: "John",
    lastName: "Sandbox-Tester",
    line1: "123 Dev Mode Highway",
    city: "Memphis",
    postalCode: "38103",
    countryCode: country,
    stateCode: "TN",
    email: "sandbox-tester@unsaid.test",
  };
  const lines = [
    {
      itemId: `mock_${Date.now()}`,
      quantity,
      supplierSku: mapping.supplier_sku,
      printFileUrl,
      printJobConfig: (mapping.print_job_config ?? {}) as Record<string, unknown>,
    },
  ];

  let payload: unknown = null;
  if (slug === "gelato") {
    payload = createGelatoPayload({
      orderReferenceId: mockOrderId,
      customerReferenceId: "usr_sandbox_testing_profile",
      shipTo,
      lines,
    });
  } else if (slug === "prodigi") {
    payload = createProdigiPayload({ orderReferenceId: mockOrderId, shipTo, lines });
  } else if (slug === "printful") {
    payload = {
      note: "Printful fulfills via pre-registered sync products; at checkout the order passes through against the synced variant.",
      syncProductId: mapping.printful_sync_product_id,
      storeSku: mapping.product_sku,
      catalogVariantId: mapping.print_job_config?.catalog_variant_id ?? null,
      placement: mapping.print_job_config?.placement ?? "front",
      printFileUrl,
      quantity,
    };
  }
  if (!payload) {
    logs.push(`[${stamp()}] 🔴 No payload factory for supplier: ${slug}`);
    return NextResponse.json({ simulationSuccess: false, logs, errorDetails: `No Rule C factory for supplier "${slug}"` }, { status: 422 });
  }
  logs.push(`[${stamp()}] 🟢 Payload translation mapping generated successfully.`);
  logs.push(`[${stamp()}] 📡 Dry run only — nothing was dispatched to ${ENDPOINTS[slug] ?? slug}.`);

  return NextResponse.json({
    simulationSuccess: true,
    logs,
    resolvedSupplier: slug.toUpperCase(),
    generatedPayloadStructure: payload,
    targetProductionEndpoint: ENDPOINTS[slug] ?? null,
  });
}
