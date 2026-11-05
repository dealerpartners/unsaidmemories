"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BlankActions({
  blankId,
  viewsWithBox,
  renderReady,
  hasTestRender,
}: {
  blankId: string;
  viewsWithBox: string[];
  renderReady: boolean;
  hasTestRender: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  async function call(key: string, path: string, body: object, okNote: string) {
    setBusy(key);
    setNote("");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setNote(data.error ?? "That didn't go through. Try again.");
      } else {
        setNote(okNote);
        router.refresh();
      }
    } catch {
      setNote("That didn't go through. Try again.");
    } finally {
      setBusy("");
    }
  }

  const btn: React.CSSProperties = {
    border: "1px solid #171420",
    background: "#171420",
    color: "#fff",
    borderRadius: 8,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  };
  const btnLight: React.CSSProperties = { ...btn, background: "#fff", color: "#171420" };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      {viewsWithBox.map((v) => (
        <button
          key={v}
          style={btnLight}
          disabled={busy !== ""}
          onClick={() =>
            call("test-" + v, `/api/admin/catalog/blanks/${blankId}/test-render`, { view: v },
              `Test render for the ${v} view is queued — the render worker picks it up from the queue.`)
          }
        >
          {busy === "test-" + v ? "Queuing…" : `Run test render · ${v}`}
        </button>
      ))}
      {renderReady ? (
        <button
          style={btnLight}
          disabled={busy !== ""}
          onClick={() =>
            call("revoke", `/api/admin/catalog/blanks/${blankId}/approve`, { ready: false }, "Render-ready revoked.")
          }
        >
          Revoke render-ready
        </button>
      ) : (
        <button
          style={btn}
          disabled={busy !== "" || !hasTestRender}
          title={hasTestRender ? "" : "A test render must exist first"}
          onClick={() =>
            call("approve", `/api/admin/catalog/blanks/${blankId}/approve`, { ready: true }, "Blank approved — it is now render-ready.")
          }
        >
          Approve render-ready
        </button>
      )}
      {note ? <span style={{ fontSize: 13, color: "#3c3744" }}>{note}</span> : null}
    </div>
  );
}
