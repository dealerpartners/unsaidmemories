"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Loop B on one blank: pick a design, generate its renders (dry run
// first, so the counts are seen before anything queues), then publish
// once the renders exist. Only colors whose garment hex is actually
// known can be rendered — White always (the ghost asset is a white
// garment) and Athletic Heather (the hex the supplier recorded).
const COLORS = [
  { color: "White", hex: "#ffffff" },
  { color: "Athletic Heather", hex: "#cececc" },
];

export function PublishPanel({
  blankId,
  designs,
  renderReady,
}: {
  blankId: string;
  designs: Array<{ id: string; name: string; status: string }>;
  renderReady: boolean;
}) {
  const router = useRouter();
  const [designId, setDesignId] = useState(designs[0]?.id ?? "");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  async function call(key: string, path: string, body: object, ok: (d: Record<string, unknown>) => string) {
    setBusy(key);
    setNote("");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
      setNote(res.ok ? ok(data) : data.error ?? "That didn't go through. Try again.");
      if (res.ok) router.refresh();
    } catch {
      setNote("That didn't go through. Try again.");
    } finally {
      setBusy("");
    }
  }

  const btn: React.CSSProperties = {
    border: "1px solid #171420", background: "#171420", color: "#fff",
    borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
  };
  const btnLight: React.CSSProperties = { ...btn, background: "#fff", color: "#171420" };

  if (!renderReady) {
    return (
      <p style={{ fontSize: 14, color: "#3c3744" }}>
        Publishing opens when this blank is render-ready — approve a test render above first.
      </p>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={designId}
          onChange={(e) => setDesignId(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #171420", fontSize: 13, background: "#fff", color: "#171420" }}
        >
          {designs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.status})
            </option>
          ))}
        </select>
        <button
          style={btnLight}
          disabled={busy !== "" || !designId}
          onClick={() =>
            call("dry", `/api/admin/catalog/blanks/${blankId}/generate`,
              { designId, colors: COLORS, dryRun: true },
              (d) => `Dry run: ${d.would_render} renders on ${d.blanks} blank. Nothing queued.`)
          }
        >
          {busy === "dry" ? "Counting…" : "Generate · dry run"}
        </button>
        <button
          style={btnLight}
          disabled={busy !== "" || !designId}
          onClick={() =>
            call("gen", `/api/admin/catalog/blanks/${blankId}/generate`,
              { designId, colors: COLORS, dryRun: false },
              (d) => `${d.queued} renders queued — the render worker picks them up from the queue.`)
          }
        >
          {busy === "gen" ? "Queuing…" : "Generate renders"}
        </button>
        <button
          style={btn}
          disabled={busy !== "" || !designId}
          onClick={() =>
            call("pub", `/api/admin/catalog/blanks/${blankId}/publish`,
              { designId },
              (d) => `Published — ${d.publications} product galleries now point at our own renders.`)
          }
        >
          {busy === "pub" ? "Publishing…" : "Publish"}
        </button>
      </div>
      {note ? <p style={{ fontSize: 13, color: "#3c3744", marginTop: 8 }}>{note}</p> : null}
    </div>
  );
}
