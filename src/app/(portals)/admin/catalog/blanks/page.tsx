import type { Metadata } from "next";
import Link from "next/link";
import { listBlanks, type BlankReadiness } from "@/lib/fabric/blanks";

export const metadata: Metadata = { title: "Blanks — Admin" };
export const dynamic = "force-dynamic";

// Catalog → Blanks: the Loop A queue from the POD play. Every blank in
// the spine, with the readiness the database actually supports — a
// blank becomes designable only after its assets are in, a Test Render
// has rendered, and a person approves it.

const CHIP: Record<BlankReadiness, { label: string; bg: string; fg: string }> = {
  "missing-assets": { label: "Missing assets", bg: "#fdecec", fg: "#7a1f1f" },
  "ready-for-test": { label: "Ready for test", bg: "#fff4d6", fg: "#6b4e00" },
  "test-rendered": { label: "Test rendered", bg: "#e3ecfd", fg: "#1c3f7c" },
  "render-ready": { label: "Render-ready", bg: "#0a6400", fg: "#ffffff" },
};

export default async function BlanksPage() {
  const blanks = await listBlanks();
  const ready = blanks.filter((b) => b.readiness === "render-ready").length;
  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>Blanks</h1>
      <p style={{ margin: "0 0 20px", color: "#3c3744", fontSize: 14 }}>
        {blanks.length} blanks in the spine · {ready} render-ready. A blank can be
        designed on only when it is render-ready: assets in, print-area box
        confirmed, Test Render approved.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #171420" }}>
            <th style={{ padding: "8px 10px" }}>Blank</th>
            <th style={{ padding: "8px 10px" }}>Views with a box</th>
            <th style={{ padding: "8px 10px" }}>Assets</th>
            <th style={{ padding: "8px 10px" }}>Test renders</th>
            <th style={{ padding: "8px 10px" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {blanks.map((b) => {
            const chip = CHIP[b.readiness];
            return (
              <tr key={b.id} style={{ borderBottom: "1px solid #e4e0ea" }}>
                <td style={{ padding: "10px" }}>
                  <Link href={`/admin/catalog/blanks/${b.id}`} style={{ fontWeight: 600, color: "#171420" }}>
                    {b.name}
                  </Link>
                  <div style={{ color: "#3c3744", fontSize: 12 }}>{b.sku_slug} · {b.lifecycle}</div>
                </td>
                <td style={{ padding: "10px" }}>{b.viewsWithBox.length ? b.viewsWithBox.join(", ") : "—"}</td>
                <td style={{ padding: "10px" }}>{b.assetCount}</td>
                <td style={{ padding: "10px" }}>{b.testRenders}</td>
                <td style={{ padding: "10px" }}>
                  <span style={{ background: chip.bg, color: chip.fg, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>
                    {chip.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
