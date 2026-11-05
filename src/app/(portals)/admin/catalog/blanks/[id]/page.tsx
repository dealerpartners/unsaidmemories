import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBlankWorkspace } from "@/lib/fabric/blanks";
import { BlankActions } from "./blank-actions";
import { PublishPanel } from "./publish-panel";

export const metadata: Metadata = { title: "Blank workspace — Admin" };
export const dynamic = "force-dynamic";

// Catalog → Blanks → one blank. Loop A of the POD play on one screen:
// the photos with the print-area box drawn where the data puts it, the
// numbers behind the box, who can print it, and the Test Render gate.

export default async function BlankWorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ws = await getBlankWorkspace(id);
  if (!ws) notFound();
  const { blank, assets, suppliers, renders, designs } = ws;
  const shading = assets.filter((a) => a.kind === "shading");
  const viewsWithBox = [...new Set(shading.filter((a) => a.box).map((a) => a.view))];
  const hasTestRender = renders.some((r) => r.purpose === "test" && r.status === "rendered");

  return (
    <div style={{ padding: 24, maxWidth: 1150 }}>
      <Link href="/admin/catalog/blanks" style={{ fontSize: 13, color: "#3c3744" }}>
        ← All blanks
      </Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 0 4px" }}>{blank.name}</h1>
      <p style={{ margin: "0 0 16px", color: "#3c3744", fontSize: 14 }}>
        {blank.sku_slug} · lifecycle {blank.lifecycle} ·{" "}
        {blank.render_ready ? "render-ready" : "not render-ready"}
      </p>

      <BlankActions
        blankId={blank.id}
        viewsWithBox={viewsWithBox}
        renderReady={blank.render_ready}
        hasTestRender={hasTestRender}
      />

      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "28px 0 10px" }}>Views &amp; print areas</h2>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {shading.map((a) => {
          const boxPct =
            a.box && a.px_per_inch && a.width && a.height
              ? {
                  left: `${((a.box.xIn * a.px_per_inch) / a.width) * 100}%`,
                  top: `${((a.box.yIn * a.px_per_inch) / a.height) * 100}%`,
                  width: `${((a.box.wIn * a.px_per_inch) / a.width) * 100}%`,
                  height: `${((a.box.hIn * a.px_per_inch) / a.height) * 100}%`,
                }
              : null;
          return (
            <div key={a.id} style={{ width: 300 }}>
              <div style={{ position: "relative", border: "1px solid #e4e0ea", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                {a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={`${blank.name} ${a.view}`} style={{ width: "100%", display: "block" }} />
                ) : null}
                {boxPct ? (
                  <div
                    style={{
                      position: "absolute",
                      ...boxPct,
                      border: "2px solid #0a6400",
                      background: "rgba(10,100,0,0.08)",
                    }}
                  />
                ) : null}
              </div>
              <div style={{ fontSize: 13, marginTop: 6, color: "#171420" }}>
                <strong>{a.view}</strong>
                {a.box ? (
                  <> · box {a.box.wIn}″ × {a.box.hIn}″ at {a.box.xIn}″, {a.box.yIn}″ · {a.px_per_inch} px/in</>
                ) : (
                  <> · no box recorded</>
                )}
                <div style={{ color: "#3c3744", fontSize: 12 }}>
                  source {a.source} · {a.verified ? "supplier-measured geometry" : "default geometry — unconfirmed"}
                </div>
              </div>
            </div>
          );
        })}
        {shading.length === 0 ? (
          <p style={{ color: "#3c3744", fontSize: 14 }}>
            No assets persisted for this blank yet — harvesting them is the first job.
          </p>
        ) : null}
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "28px 0 10px" }}>Who can print it</h2>
      {suppliers.length ? (
        <table style={{ borderCollapse: "collapse", fontSize: 14 }}>
          <tbody>
            {suppliers.map((s, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #e4e0ea" }}>
                <td style={{ padding: "6px 12px 6px 0", fontWeight: 600 }}>{s.supplier}</td>
                <td style={{ padding: "6px 12px 6px 0" }}>{s.name}</td>
                <td style={{ padding: "6px 0" }}>{s.variants} variants</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: "#3c3744", fontSize: 14 }}>No supplier products linked to this blank yet.</p>
      )}

      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "28px 0 10px" }}>Publish a design on this blank</h2>
      <PublishPanel blankId={blank.id} designs={designs} renderReady={blank.render_ready} />

      <h2 style={{ fontSize: 16, fontWeight: 700, margin: "28px 0 10px" }}>Renders</h2>
      {renders.length ? (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {renders.map((r) => (
            <div key={r.id} style={{ width: 170 }}>
              <div style={{ border: "1px solid #e4e0ea", borderRadius: 10, overflow: "hidden", background: "#fff", minHeight: 120 }}>
                {r.url && r.status === "rendered" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.url} alt={`${r.view} render`} style={{ width: "100%", display: "block" }} />
                ) : (
                  <div style={{ padding: 14, fontSize: 13, color: "#3c3744" }}>{r.status}</div>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#3c3744", marginTop: 4 }}>
                {r.purpose} · {r.view} · {r.color ?? ""} · {r.status}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: "#3c3744", fontSize: 14 }}>No renders yet — run a test render above.</p>
      )}
    </div>
  );
}
