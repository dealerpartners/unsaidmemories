/**
 * Rule C — Supplier Payload Factory (Sunny's translation matrix).
 *
 * Pure builders: normalized order data + a supplier_product_mappings
 * row + the Rule B transparent print-file URL in, the supplier's exact
 * API payload out. Gelato and Prodigi take standalone per-order
 * payloads; Printful works on pre-registered sync products, so its
 * builders produce the sync-product / sync-variant registration
 * payloads and orders pass through against the synced SKUs.
 */

/**
 * White-label brand profile for packing slips (Sunny's
 * BrandPackingSlipMatrix). Values come from env so no address or
 * mailbox is ever fabricated: BRAND_SUPPORT_EMAIL, BRAND_LOGO_URL,
 * BRAND_RETURN_LINE1/CITY/STATE/ZIP/COUNTRY. Fields that are not
 * configured are simply omitted from the payloads.
 */
export interface BrandProfile {
  companyName: string;
  website: string;
  supportEmail?: string;
  logoUrl?: string;
  thankYouMessage: string;
  returnAddress?: {
    line1: string;
    city: string;
    state?: string;
    zip: string;
    country: string;
  };
}

export function brandProfile(): BrandProfile {
  const env = process.env;
  const ret =
    env.BRAND_RETURN_LINE1 && env.BRAND_RETURN_CITY && env.BRAND_RETURN_ZIP && env.BRAND_RETURN_COUNTRY
      ? {
          line1: env.BRAND_RETURN_LINE1,
          city: env.BRAND_RETURN_CITY,
          state: env.BRAND_RETURN_STATE,
          zip: env.BRAND_RETURN_ZIP,
          country: env.BRAND_RETURN_COUNTRY,
        }
      : undefined;
  return {
    companyName: env.BRAND_NAME || "Unsaid",
    website: env.NEXT_PUBLIC_SITE_URL || "https://unsaidmemories.com",
    supportEmail: env.BRAND_SUPPORT_EMAIL || undefined,
    logoUrl: env.BRAND_LOGO_URL || undefined,
    thankYouMessage:
      env.BRAND_THANK_YOU_MESSAGE ||
      "Thank you for supporting independent generative art! Made just for you.",
    returnAddress: ret,
  };
}

/** Printful packing_slip block (used by the Printful adapter path). */
export function printfulPackingSlip(brand: BrandProfile = brandProfile()) {
  return {
    ...(brand.supportEmail ? { email: brand.supportEmail } : {}),
    phone: "",
    message: brand.thankYouMessage,
    ...(brand.logoUrl ? { logo_url: brand.logoUrl } : {}),
  };
}

export interface ShipTo {
  firstName: string;
  lastName: string;
  company?: string;
  line1: string;
  line2?: string;
  city: string;
  postalCode: string;
  countryCode: string; // ISO 2-letter
  stateCode?: string;
  email: string;
  phone?: string;
}

export interface PayloadLine {
  itemId: string;
  quantity: number;
  /** supplier_product_mappings.supplier_sku */
  supplierSku: string;
  /** Rule B high-res transparent PNG (public URL), when designed. */
  printFileUrl: string | null;
  /** supplier_product_mappings.print_job_config */
  printJobConfig: Record<string, unknown>;
}

export interface GelatoPayload {
  orderType: "order";
  orderReferenceId: string;
  customerReferenceId: string;
  currency: string;
  shippingAddress: Record<string, string>;
  returnAddress?: Record<string, string>;
  items: Record<string, unknown>[];
}

export function createGelatoPayload(args: {
  orderReferenceId: string;
  customerReferenceId: string;
  shipTo: ShipTo;
  lines: PayloadLine[];
  brand?: BrandProfile;
}): GelatoPayload {
  const { shipTo } = args;
  const brand = args.brand ?? brandProfile();
  return {
    orderType: "order",
    orderReferenceId: args.orderReferenceId,
    customerReferenceId: args.customerReferenceId,
    currency: "USD",
    shippingAddress: {
      firstName: shipTo.firstName,
      lastName: shipTo.lastName,
      companyName: shipTo.company || "",
      addressLine1: shipTo.line1,
      addressLine2: shipTo.line2 || "",
      city: shipTo.city,
      // Gelato v3 spells this postCode (their docs' create-order example).
      postCode: shipTo.postalCode,
      country: shipTo.countryCode,
      state: shipTo.stateCode || "",
      email: shipTo.email,
      phone: shipTo.phone || "",
    },
    ...(brand.returnAddress
      ? {
          returnAddress: {
            companyName: brand.companyName,
            addressLine1: brand.returnAddress.line1,
            addressLine2: "",
            city: brand.returnAddress.city,
            postCode: brand.returnAddress.zip,
            country: brand.returnAddress.country,
            state: brand.returnAddress.state || "",
            email: brand.supportEmail || "",
            phone: "",
          },
        }
      : {}),
    items: args.lines.map((line) => ({
      itemReferenceId: `item_${line.itemId}`,
      productUid: line.supplierSku,
      quantity: line.quantity,
      ...(line.printFileUrl ? { fileUrl: line.printFileUrl } : {}),
    })),
  };
}

export interface ProdigiPayload {
  shippingInfo: Record<string, unknown>;
  idempotencyKey: string;
  merchantReference: string;
  packingSlip?: Record<string, unknown>;
  items: Record<string, unknown>[];
}

export function createProdigiPayload(args: {
  orderReferenceId: string;
  shipTo: ShipTo;
  lines: PayloadLine[];
  brand?: BrandProfile;
}): ProdigiPayload {
  const { shipTo } = args;
  const brand = args.brand ?? brandProfile();
  return {
    packingSlip: {
      status: "Enabled",
      ...(brand.logoUrl ? { logoUrl: brand.logoUrl } : {}),
      message: brand.thankYouMessage,
      contacts: [
        ...(brand.supportEmail
          ? [{ label: "Customer Support", value: brand.supportEmail }]
          : []),
        { label: "Online Store", value: brand.website.replace(/^https?:\/\//, "") },
      ],
    },
    shippingInfo: {
      destinationCountryCode: shipTo.countryCode,
      address: {
        line1: shipTo.line1,
        line2: shipTo.line2 || "",
        locality: shipTo.city,
        postalOrZipCode: shipTo.postalCode,
        stateOrCounty: shipTo.stateCode || "",
      },
      recipientName: `${shipTo.firstName} ${shipTo.lastName}`.trim(),
    },
    // One idempotency key per order (Prodigi dedupes on it); the
    // per-item merchantReference keeps lines individually traceable.
    idempotencyKey: `prod_idemp_${args.orderReferenceId}`,
    merchantReference: args.orderReferenceId,
    items: args.lines.map((line) => ({
      merchantReference: `item_${line.itemId}`,
      sku: line.supplierSku,
      copies: line.quantity,
      ...(line.printFileUrl
        ? {
            assets: [
              {
                printArea: String(line.printJobConfig.print_area_id ?? "default"),
                url: line.printFileUrl,
              },
            ],
          }
        : {}),
    })),
  };
}

/** Printful STEP 1 — register the skeleton sync product. */
export function createPrintfulSyncProductPayload(args: {
  collectionName: string;
  designId: string;
  name?: string;
}) {
  return {
    external_id: `prod_${args.designId}`,
    name: args.name ?? `AI Collection Design - ${args.collectionName}`,
    thumbnail: "",
  };
}

/** Printful STEP 2 — bind the Rule B print file to a sync variant. */
export function createPrintfulSyncVariantPayload(args: {
  storeSku: string;
  printJobConfig: Record<string, unknown>;
  printFileUrl: string;
}) {
  return {
    external_id: args.storeSku,
    catalog_variant_id: parseInt(String(args.printJobConfig.catalog_variant_id ?? ""), 10),
    files: [
      {
        type: String(args.printJobConfig.placement ?? "front"),
        url: args.printFileUrl,
        options: [] as unknown[],
      },
    ],
  };
}
