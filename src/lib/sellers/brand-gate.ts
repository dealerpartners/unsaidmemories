// ---------------------------------------------------------------------------
// sellers/brand-gate.ts — brand authorization: the platform's control over
// WHO may sell a brand (Sunny's no-Amazon principle: the catalog is
// canonical and the platform decides who may sell a brand — that decision
// is what stops multiple sellers racing on the same products).
//
// The designed store is seller_brand_authorizations (seller_id,
// brand_id → the brands registry, authorization_type, evidence_url,
// status pending/approved/rejected/expired, validity window, review
// stamps) — it carried NO writer before this module. The registry is
// public.brands (tenant-scoped; owner_seller_id marks the brand's owner).
//
// THE GATE: a brand name that resolves to a registry brand in the
// seller's tenant is GOVERNED — the seller may only list under it with
// an approved, in-window authorization. A brand name that does not
// resolve to the registry is not governed (the platform governs the
// brands it registers; registering a brand is the admin brand-registry
// module's side of the contract). Authorization state is enforced at
// the listing writers (single create, listing edit, bulk import),
// never trusted from the client.
//
// NOTE: seller_brand_authorizations carries no tenant_id — tenancy
// flows through the sellers row (seller_id → sellers.tenant_id), and
// the registry lookup is tenant-predicated here. RLS is disabled on
// both tables in the live schema; these predicates are the control.
//
// BRAND OPT-OUT (Sunny's order, 2026-10-14): a brand's own opt-out —
// recorded in public.brand_opt_outs (migration 20261060) — sits ABOVE
// seller_brand_authorizations. An APPLIED opt-out is checked BEFORE
// the authorization lookup and a seller's approved authorization never
// overrides it: strength 'ever' refuses outright; strength
// 'by_approval' refuses unless the seller holds an approved
// authorization for the brand (the brand's recorded approval rides
// this same authorization store — Sunny's ruling on the B4 proposal).
// Opt-outs in any other state (filed / verified / rejected /
// withdrawn) have no effect on the gate. The opt-out read carries the
// tenant predicate in the statement (brand_opt_outs has RLS enabled
// with zero policies; the app reads via the owner pool), and the
// refusal names the opt-out only — claimant data is never surfaced.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

export const AUTHORIZATION_TYPES = [
  "brand_owner",
  "authorized_reseller",
  "distributor",
] as const;
export type AuthorizationType = (typeof AUTHORIZATION_TYPES)[number];

/** The authorization type a declaration defaults to when the seller
 * doesn't name one: the registry brand's owner declares as brand_owner;
 * a reseller declares as authorized_reseller; every other seller type
 * declares as distributor. */
export function defaultAuthorizationType(
  sellerType: string | null | undefined,
  isOwner: boolean,
): AuthorizationType {
  if (isOwner) return "brand_owner";
  switch (String(sellerType || "").toLowerCase()) {
    case "manufacturer_brand":
      return "brand_owner";
    case "reseller":
      return "authorized_reseller";
    default:
      return "distributor";
  }
}

export interface RegistryBrand {
  id: string;
  name: string;
  slug: string | null;
  owner_seller_id: string | null;
  status: string | null;
}

/** Resolve a brand NAME to the tenant's registry record (exact,
 * case-insensitive — the same deterministic rule the catalog match
 * uses). Returns null when the brand is not in the registry. */
export async function resolveRegistryBrand(
  c: any,
  tenant: string,
  brandName: string,
): Promise<RegistryBrand | null> {
  const name = brandName.trim();
  if (!name) return null;
  const r = await c.query(
    `SELECT id, name, slug, owner_seller_id, status
       FROM public.brands
      WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)
      ORDER BY created_at ASC
      LIMIT 1`,
    [tenant, name],
  );
  return (r.rows[0] as RegistryBrand) ?? null;
}

export type BrandOptOutStrength = "by_approval" | "ever";

export interface BrandGateResult {
  governed: boolean;
  allowed: boolean;
  brand: RegistryBrand | null;
  authorizationStatus: string | null;
  /** The APPLIED brand opt-out for this brand, when one exists in the
   * seller's tenant. Non-null means the opt-out layer is engaged:
   * 'ever' always refuses; 'by_approval' refuses unless the seller's
   * authorization is approved (the outcome rides `allowed`). */
  optOut: { strength: BrandOptOutStrength } | null;
}

/** May this seller list under this brand name right now? */
export async function brandGate(
  c: any,
  tenant: string,
  sellerId: string,
  brandName: string | null | undefined,
): Promise<BrandGateResult> {
  const name = String(brandName || "").trim();
  if (!name) return { governed: false, allowed: true, brand: null, authorizationStatus: null, optOut: null };
  const brand = await resolveRegistryBrand(c, tenant, name);
  if (!brand) return { governed: false, allowed: true, brand: null, authorizationStatus: null, optOut: null };

  // Brand opt-out — ABOVE the authorization lookup (Sunny's ordering:
  // an approved authorization never overrides the brand's own opt-out).
  const oo = await c.query(
    `SELECT strength FROM public.brand_opt_outs
      WHERE tenant_id = $1 AND brand_id = $2::uuid AND status = 'applied'
      LIMIT 1`,
    [tenant, brand.id],
  );
  const optOutStrength = (oo.rows[0]?.strength as BrandOptOutStrength | undefined) ?? null;
  const optOut = optOutStrength ? { strength: optOutStrength } : null;
  if (optOutStrength === "ever") {
    return { governed: true, allowed: false, brand, authorizationStatus: null, optOut };
  }

  const r = await c.query(
    `SELECT status FROM public.seller_brand_authorizations
      WHERE seller_id = $1::uuid AND brand_id = $2::uuid
        AND status = 'approved'
        AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
        AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
      ORDER BY created_at DESC
      LIMIT 1`,
    [sellerId, brand.id],
  );
  if (r.rows[0]) {
    // Approved authorization. With a 'by_approval' opt-out applied,
    // this approval IS the brand's recorded consent — the only key
    // that opens a by-approval brand — so the gate passes.
    return { governed: true, allowed: true, brand, authorizationStatus: "approved", optOut };
  }
  const latest = await c.query(
    `SELECT status FROM public.seller_brand_authorizations
      WHERE seller_id = $1::uuid AND brand_id = $2::uuid
      ORDER BY created_at DESC
      LIMIT 1`,
    [sellerId, brand.id],
  );
  return {
    governed: true,
    allowed: false,
    brand,
    authorizationStatus: (latest.rows[0]?.status as string) ?? null,
    optOut,
  };
}

export interface DeclarationResult {
  outcome: "created" | "already_open" | "already_approved";
  authorization: Record<string, unknown>;
}

/** Declare a brand for verification: one open request per seller per
 * brand (the appeals idiom — a second pending declaration would fork
 * the admin decision). An approved authorization is returned as-is; a
 * rejected/expired one yields a fresh pending row (history preserved). */
export async function declareBrandAuthorization(
  c: any,
  args: {
    sellerId: string;
    sellerType: string | null | undefined;
    brand: RegistryBrand;
    authorizationType?: string | null;
    evidenceUrl?: string | null;
  },
): Promise<DeclarationResult> {
  const { sellerId, brand } = args;
  const existing = await c.query(
    `SELECT id, authorization_type, status, evidence_url, created_at
       FROM public.seller_brand_authorizations
      WHERE seller_id = $1::uuid AND brand_id = $2::uuid
        AND status IN ('pending', 'approved')
      ORDER BY CASE status WHEN 'approved' THEN 0 ELSE 1 END, created_at DESC
      LIMIT 1`,
    [sellerId, brand.id],
  );
  const open = existing.rows[0] as Record<string, unknown> | undefined;
  if (open) {
    return {
      outcome: open.status === "approved" ? "already_approved" : "already_open",
      authorization: open,
    };
  }
  const requested = String(args.authorizationType || "").trim();
  const type: AuthorizationType = (AUTHORIZATION_TYPES as readonly string[]).includes(requested)
    ? (requested as AuthorizationType)
    : defaultAuthorizationType(args.sellerType, brand.owner_seller_id === sellerId);
  const ins = await c.query(
    `INSERT INTO public.seller_brand_authorizations
       (seller_id, brand_id, authorization_type, evidence_url, status)
     VALUES ($1::uuid, $2::uuid, $3, $4, 'pending')
     RETURNING id, authorization_type, status, evidence_url, created_at`,
    [sellerId, brand.id, type, args.evidenceUrl?.trim() || null],
  );
  return { outcome: "created", authorization: ins.rows[0] as Record<string, unknown> };
}

/** Parse a free-text brand declaration (the onboarding Step 4 packet
 * carries brand names as one text field) into distinct names. */
export function parseBrandNames(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,\n;]+/)) {
    const name = part.trim();
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
  }
  return out.slice(0, 50);
}
