"use client";

import { useRef, useState } from "react";

/**
 * Image setting field — upload, never a pasted URL. Used where a tenant
 * setting holds one image (Website Settings' social share image, CMS &
 * Content's home hero image). The picked file goes to
 * /api/admin/website/image (Supabase Storage, `design-files` bucket)
 * and the returned public URL is merged into the settings section
 * under `settingKey` via the standard settings PUT — so the stored
 * value remains the same plain URL string the setting has always held.
 * Only the editing UX changes: upload + preview instead of a URL box.
 */
export default function SettingsImageUpload({
  section,
  settingKey,
  label,
  tip,
  help,
  initialUrl,
  slot,
}: {
  section: string;
  settingKey: string;
  label: string;
  /** Plain-language tooltip for the controls (data-tip). */
  tip?: string;
  /** Visible plain-language line: what this is and where it appears. */
  help?: string;
  initialUrl: string;
  /** Storage path prefix under website/ in the bucket. */
  slot: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [state, setState] = useState<"idle" | "busy" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function saveSetting(next: string) {
    const res = await fetch("/api/admin/system/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section, values: { [settingKey]: next } }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
  }

  async function onFile(file: File) {
    setState("busy");
    setError("");
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("Could not read that file."));
        r.readAsDataURL(file);
      });
      const up = await fetch("/api/admin/website/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, slot }),
      });
      const data = await up.json().catch(() => ({}));
      if (!up.ok) throw new Error(data.error || `Upload failed (${up.status})`);
      await saveSetting(String(data.url));
      setUrl(String(data.url));
      setState("saved");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function onRemove() {
    setState("busy");
    setError("");
    try {
      await saveSetting("");
      setUrl("");
      setState("saved");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Remove failed");
    }
  }

  return (
    <div className="adm-field">
      <span className="adm-label">{label}</span>
      {state === "error" && <div className="adm-alert adm-alert-error">{error}</div>}
      {state === "saved" && <div className="adm-alert adm-alert-ok">Saved.</div>}
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={label}
          style={{
            display: "block",
            maxWidth: "100%",
            maxHeight: 160,
            border: "1px solid var(--border)",
            borderRadius: 8,
            marginBottom: 8,
            objectFit: "contain",
            background: "#fff",
          }}
        />
      ) : (
        <p className="adm-help" style={{ marginTop: 0 }}>No image yet.</p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="adm-btn adm-btn-ghost adm-btn-sm"
          data-tip={tip}
          disabled={state === "busy"}
          onClick={() => fileRef.current?.click()}
        >
          {state === "busy" ? "Uploading…" : url ? "Replace image" : "Upload an image"}
        </button>
        {url && (
          <button
            type="button"
            className="adm-btn adm-btn-ghost adm-btn-sm"
            data-tip="Take this image off the setting. You can upload another one whenever you like."
            disabled={state === "busy"}
            onClick={onRemove}
          >
            Remove
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = "";
        }}
      />
      {help && <div className="adm-help">{help}</div>}
    </div>
  );
}
