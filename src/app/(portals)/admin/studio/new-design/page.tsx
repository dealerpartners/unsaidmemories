import type { Metadata } from "next";
import NewDesignWizard from "./new-design-wizard";

export const metadata: Metadata = {
  title: "New Design — UnSaid",
  description:
    "Start a new design the guided way: pick a category, then a subcategory, then the product — one decision at a time.",
};

/**
 * New Design wizard (Wizard #1 in notes/wizard-catalog.md) — the guided
 * entry into the Design Studio. CHECKPOINT 1: the stepper shell plus
 * steps 1–3 (Category → Subcategory → Product) against the same catalog
 * contract the studio picker reads. CHECKPOINT 2: steps 4–6 — Supplier
 * (captured specs/costs via the product-stage path), Organize (project
 * name + the studio's collection folders), and the Canvas handoff,
 * which lands in /admin/studio with the chosen product bound through
 * the studio's own chooseCatalogProduct path.
 */
export default function NewDesignPage() {
  return <NewDesignWizard />;
}
