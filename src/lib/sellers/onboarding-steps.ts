// ---------------------------------------------------------------------------
// sellers/onboarding-steps.ts — the canonical SELLER 10-step onboarding
// wizard definition (portals.md §1, Sunny's 2026-10-16 ruling: ONE
// sequential wizard, not ten independent pages).
//
// The `slug` is the seller_onboarding_state step key — the store
// GET/POST /api/seller/onboarding has always written (step-1…step-10),
// so saved state from the old per-step pages carries over unchanged.
// The named section routes (overview, business-verification, …) are
// deep-links into the wizard at the matching step.
// ---------------------------------------------------------------------------

export interface SellerOnboardingStepDef {
  /** 1-based position in the wizard. */
  n: number;
  /** seller_onboarding_state step key (the API's step id). */
  slug: string;
  label: string;
  description: string;
  /** Named section route that deep-links to this step, when one exists. */
  namedRoute?: string;
}

export const SELLER_ONBOARDING_STEPS: SellerOnboardingStepDef[] = [
  { n: 1, slug: "step-1", label: "Overview", description: "What selling here costs and saves — fees, programs, and the road to your first sale (§1.1).", namedRoute: "overview" },
  { n: 2, slug: "step-2", label: "Business details", description: "Your business profile and legal entity — the record verification checks against." },
  { n: 3, slug: "step-3", label: "Bank info", description: "The payout bank account — only the last four digits are ever stored (§1.4).", namedRoute: "bank-info" },
  { n: 4, slug: "step-4", label: "Business verification", description: "The bank-grade packet: seller type, tax ID document, government ID, resale certificate, products, purchase orders, platforms, social (§1.2).", namedRoute: "business-verification" },
  { n: 5, slug: "step-5", label: "Customer favorites", description: "Featured-placement preferences and your primary categories (§1.7).", namedRoute: "customer-favorites" },
  { n: 6, slug: "step-6", label: "First listing", description: "Create your first listing — one product, or a spreadsheet import (§1.8).", namedRoute: "first-listing" },
  { n: 7, slug: "step-7", label: "Global markets", description: "The regions you sell in (§1.6).", namedRoute: "global-markets" },
  { n: 8, slug: "step-8", label: "Policy acceptance", description: "The marketplace policies and fee schedule, accepted on the record (§1.5).", namedRoute: "policy-acceptance" },
  { n: 9, slug: "step-9", label: "Tax identity", description: "Your tax identity on file — last four only — and its verification filing (§1.3).", namedRoute: "tax-identity" },
  { n: 10, slug: "step-10", label: "Review & complete", description: "Review the whole application and complete it (§1.9). Completing activates your store right away — onboarding is self-serve and there is no approval wait." },
];

export const SELLER_ONBOARDING_TOTAL = SELLER_ONBOARDING_STEPS.length;

/** Legacy/named step keys that may exist in saved state → canonical slug. */
export const LEGACY_STEP_ALIASES: Record<string, string> = {
  overview: "step-1",
  "bank-info": "step-3",
  "business-verification": "step-4",
  "customer-favorites": "step-5",
  "first-listing": "step-6",
  "global-markets": "step-7",
  "policy-acceptance": "step-8",
  "tax-identity": "step-9",
};

export function canonicalStepSlug(step: string): string {
  return LEGACY_STEP_ALIASES[step] || step;
}

/** The wizard route for a 1-based step number. */
export function wizardHref(n: number): string {
  const clamped = Math.min(Math.max(Math.trunc(n) || 1, 1), SELLER_ONBOARDING_TOTAL);
  return `/seller/onboarding/wizard?step=${clamped}`;
}

/** Completed canonical slugs from raw onboarding state rows. */
export function completedStepSlugs(
  state: { step: string; status: string }[] | null | undefined,
): Set<string> {
  const done = new Set<string>();
  for (const row of state || []) {
    if (row.status === "completed") done.add(canonicalStepSlug(row.step));
  }
  return done;
}

/** First incomplete step (1-based). Returns TOTAL+1 when all are done. */
export function firstIncompleteStep(completed: ReadonlySet<string>): number {
  for (const def of SELLER_ONBOARDING_STEPS) {
    if (!completed.has(def.slug)) return def.n;
  }
  return SELLER_ONBOARDING_TOTAL + 1;
}

/**
 * Sequential gating: a step unlocks only when every step before it is
 * completed. The first incomplete step is always reachable (it is where
 * Resume lands); completed steps stay reachable for review/editing.
 */
export function isStepUnlocked(n: number, completed: ReadonlySet<string>): boolean {
  if (n < 1 || n > SELLER_ONBOARDING_TOTAL) return false;
  return n <= firstIncompleteStep(completed);
}

/** Step def for a `?step=` param value; null when unparseable. */
export function stepDefFromParam(raw: string | null | undefined): SellerOnboardingStepDef | null {
  if (!raw) return null;
  const asNum = Number(raw);
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= SELLER_ONBOARDING_TOTAL) {
    return SELLER_ONBOARDING_STEPS[asNum - 1];
  }
  const slug = canonicalStepSlug(raw.trim());
  return SELLER_ONBOARDING_STEPS.find((s) => s.slug === slug || s.namedRoute === raw.trim()) || null;
}
