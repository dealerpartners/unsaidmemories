import type { CSSProperties } from "react";

/**
 * Primary-CTA text color for Commerce pages.
 *
 * Why this exists: the site shell's stylesheet (globals.css) carries
 * UNLAYERED element rules `a{color:inherit}` and `button{color:inherit}`.
 * Tailwind v4 utilities live in @layer utilities, and unlayered author
 * styles beat layered ones regardless of specificity — so a shadcn primary
 * Button inside the storefront shell renders its label in inherited ink
 * (near-black on the near-black primary background = unreadable; verified
 * by computed style: color lab(2.75) on background lab(7.78)).
 *
 * An inline style is the one author-level declaration that outranks the
 * unlayered rule, so primary CTAs on Commerce pages carry this. The root
 * fix (moving the shell's element rules into @layer base) belongs with the
 * storefront design pass and is flagged in the Commerce handoff.
 */
export const primaryCtaStyle: CSSProperties = {
  color: "var(--primary-foreground)",
};
