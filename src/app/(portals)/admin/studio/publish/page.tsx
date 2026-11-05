import type { Metadata } from "next";
import PublishClient from "./publish-client";

export const metadata: Metadata = {
  title: "Publish — UnSaid",
  description:
    "Publish a design step by step: confirm the product, pass the artwork and print checks against the supplier's captured spec, file it in a collection, set price and details, choose destinations, and publish to the storefront.",
};

/**
 * Publish wizard (Wizard #2 in notes/wizard-catalog.md) — the guided
 * exit from the Design Studio, launched from the studio Review tab's
 * "Publish wizard — step by step" button with ?designId= and
 * ?catalogProduct= for the design being published.
 *
 * CHECKPOINT 2: all six steps real — Product, Artwork & print
 * checks, Collection (folders + one-supplier Rule A gate), Price &
 * details (persisted to the design), Destinations (social
 * announcement draft opt-in), and Publish (the submit → approve →
 * publish lifecycle ending on the live product URL). No step renders
 * a placeholder and no button pretends to work. The server page
 * renders the client wrapper (PublishClient) because the wizard
 * reuses canvas-editor's stage lookup, which pulls in Konva.
 */
export default function PublishPage() {
  return <PublishClient />;
}
