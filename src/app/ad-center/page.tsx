import type { Metadata } from "next";
import { AdCenterClient } from "./ad-center-client";

export const metadata: Metadata = {
  title: "Ad Center — UnSaid",
  description:
    "Run ads across the UnSaid store: design creatives, build campaigns, pick a placement and a direct cost, publish, and watch them serve and count.",
};

// Fresh licensee Ad Center (W5). This is NOT the old UnSaid Memories
// advertising portal (which stays cut): it runs entirely on the
// licensee API at /api/v1/licensee/* — the same API the Developer
// portal at /developers documents for integrators.
export default function AdCenterPage() {
  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "40px 20px 80px" }}>
      <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 8px" }}>
        Ad Center
      </h1>
      <p style={{ color: "#525252", fontSize: 16, marginBottom: 24 }}>
        Your ads across the UnSaid store. Design a creative, build a
        campaign, choose the page it publishes to and its direct cost —
        then it serves deterministically and every view counts.
      </p>
      <AdCenterClient />
    </main>
  );
}
