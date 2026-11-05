import type { Metadata } from "next";
import { DesignerClient } from "./designer-client";

export const metadata: Metadata = {
  title: "Design an ad — Ad Center — UnSaid",
  description:
    "Design an ad creative inside the Ad Center: pick a finished product, write the ad, build the campaign, choose the page and the direct cost, and publish.",
};

export default function DesignerPage() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "40px 20px 80px" }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 8px" }}>
        Design an ad
      </h1>
      <p style={{ color: "#525252", fontSize: 16, marginBottom: 24 }}>
        Design the ad here in the Ad Center — not in the product studio.
        The product you feature is a finished studio product; this page
        only designs the ad around it.
      </p>
      <DesignerClient />
    </main>
  );
}
