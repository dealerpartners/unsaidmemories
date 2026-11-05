"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BannerRow, PopupRow, PlacementGroup } from "@/lib/website-cms";

/**
 * Banner / pop-up manager (client): the form behind Website → Banners
 * and Website → Pop-ups. Every button calls a real endpoint — list,
 * create, edit, publish/unpublish, delete, and Pollinations image
 * generation (which stores the image and returns a storage URL; the
 * banner never keeps a pollinations.ai hotlink). Placement is picked
 * from the generated placement list, never typed freehand, so every
 * generated page — category pages included — is a valid target.
 */

type Row = BannerRow | PopupRow;
const isPopup = (r: Row): r is PopupRow => "trigger_type" in r;

function toInput(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIso(v: string): string | null {
  if (!v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function WebsiteItemManager({
  kind,
  items,
  placements,
}: {
  kind: "banner" | "popup";
  items: Row[];
  placements: PlacementGroup[];
}) {
  const router = useRouter();
  const base = `/api/admin/website/${kind}s`;
  const [editing, setEditing] = useState<Row | null>(null);
  const [placement, setPlacement] = useState("/");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaHref, setCtaHref] = useState("");
  const [bg, setBg] = useState(kind === "banner" ? "var(--foreground)" : "var(--card)");
  const [fg, setFg] = useState(kind === "banner" ? "var(--card)" : "var(--foreground)");
  const [imageUrl, setImageUrl] = useState("");
  const [imageSource, setImageSource] = useState("upload");
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState("draft");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [dismissible, setDismissible] = useState(true);
  const [triggerType, setTriggerType] = useState("delay");
  const [triggerValue, setTriggerValue] = useState(5);
  const [frequency, setFrequency] = useState("once_per_session");
  const [formId, setFormId] = useState("");
  const [showOnMobile, setShowOnMobile] = useState(true);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState("");

  function load(r: Row) {
    setEditing(r);
    setPlacement(r.placement);
    setTitle(r.title);
    setBody(r.body);
    setCtaLabel(r.cta_label);
    setCtaHref(r.cta_href);
    setBg(r.bg_color);
    setFg(r.text_color);
    setImageUrl(r.image_url);
    setImageSource(r.image_source);
    setPrompt(r.image_prompt);
    setStatus(r.status);
    setStartsAt(toInput(r.starts_at));
    setEndsAt(toInput(r.ends_at));
    setDismissible(r.dismissible);
    if (isPopup(r)) {
      setTriggerType(r.trigger_type);
      setTriggerValue(r.trigger_value);
      setFrequency(r.frequency);
      setFormId(r.form_id == null ? "" : String(r.form_id));
      setShowOnMobile(r.show_on_mobile);
    }
    setMsg("");
  }

  function reset() {
    setEditing(null);
    setPlacement("/");
    setTitle("");
    setBody("");
    setCtaLabel("");
    setCtaHref("");
    setBg(kind === "banner" ? "var(--foreground)" : "var(--card)");
    setFg(kind === "banner" ? "var(--card)" : "var(--foreground)");
    setImageUrl("");
    setImageSource("upload");
    setPrompt("");
    setStatus("draft");
    setStartsAt("");
    setEndsAt("");
    setDismissible(true);
    setTriggerType("delay");
    setTriggerValue(5);
    setFrequency("once_per_session");
    setFormId("");
    setShowOnMobile(true);
    setMsg("");
  }

  const placementLabel =
    placements.flatMap((g) => g.items).find((i) => i.path === placement)?.label ?? placement;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const payload: Record<string, unknown> = {
      placement,
      placement_label: placementLabel,
      title,
      body,
      cta_label: ctaLabel,
      cta_href: ctaHref,
      bg_color: bg,
      text_color: fg,
      image_url: imageUrl,
      image_source: imageSource,
      image_prompt: prompt,
      status,
      starts_at: toIso(startsAt),
      ends_at: toIso(endsAt),
      dismissible,
    };
    if (kind === "popup") {
      payload.trigger_type = triggerType;
      payload.trigger_value = triggerValue;
      payload.frequency = frequency;
      payload.form_id = formId === "" ? null : Number(formId);
      payload.show_on_mobile = showOnMobile;
    }
    const res = await fetch(editing ? `${base}/${editing.id}` : base, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(d.error ?? (d.errors ?? ["Save failed"]).join("; "));
      return;
    }
    setMsg(status === "published" ? "Published — it replaces any other published item on that page." : "Saved as draft.");
    reset();
    router.refresh();
  }

  async function unpublish(r: Row) {
    // No-delete rule: taking an item down means unpublishing it, never
    // deleting the row. PATCH needs the full row, so resend it with
    // status draft.
    if (!window.confirm("Take this down? It stops showing on its page, but the record stays.")) return;
    setBusy(true);
    const payload: Record<string, unknown> = {
      placement: r.placement,
      placement_label: r.placement_label,
      title: r.title,
      body: r.body,
      cta_label: r.cta_label,
      cta_href: r.cta_href,
      bg_color: r.bg_color,
      text_color: r.text_color,
      image_url: r.image_url,
      image_source: r.image_source,
      image_prompt: r.image_prompt,
      status: "draft",
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      dismissible: r.dismissible,
    };
    if (isPopup(r)) {
      payload.trigger_type = r.trigger_type;
      payload.trigger_value = r.trigger_value;
      payload.frequency = r.frequency;
      payload.form_id = r.form_id;
      payload.show_on_mobile = r.show_on_mobile;
    }
    const res = await fetch(`${base}/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) setMsg("Could not take it down — please try again.");
    else {
      setMsg("Taken down — it no longer shows on its page.");
      router.refresh();
    }
  }

  async function generate() {
    if (!prompt.trim()) {
      setMsg("Write a picture prompt first — a sentence describing the image you want.");
      return;
    }
    setGenerating(true);
    setMsg("");
    const res = await fetch("/api/admin/website/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const d = await res.json().catch(() => ({}));
    setGenerating(false);
    if (!res.ok) {
      setMsg(d.error ?? "Image generation failed.");
      return;
    }
    setImageUrl(d.url);
    setImageSource("pollinations");
    setMsg(`Picture generated and stored${d.media_recorded ? " in the media library" : ""} — save this ${kind} to use it.`);
  }

  const field = (label: string, node: React.ReactNode, tip?: string) => (
    <div className="adm-field">
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{label}</label>
      {node}
      {tip && <p className="adm-help" style={{ marginTop: 4 }}>{tip}</p>}
    </div>
  );

  return (
    <div className="adm-grid adm-grid-2" style={{ alignItems: "start" }}>
      <div className="adm-card">
        <h2>{editing ? "Edit" : "New"} {kind === "banner" ? "banner" : "pop-up"}</h2>
        <form onSubmit={save}>
          {field("Show on page", (
            <select className="adm-select" value={placement} onChange={(e) => setPlacement(e.target.value)} required style={{ width: "100%" }}>
              {placements.map((g) => (
                <optgroup key={g.group} label={`${g.group} (${g.items.length})`}>
                  {g.items.map((i) => (
                    <option key={i.path} value={i.path}>{i.label} — {i.path}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          ), "Every generated page is listed, including every shop category page. One published item per page — publishing here unpublishes the previous one on that page.")}
          {field("Headline", <input className="adm-input" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%" }} />)}
          {field("Words", <textarea className="adm-textarea" value={body} onChange={(e) => setBody(e.target.value)} rows={3} style={{ width: "100%" }} />)}
          {field("Button words", <input className="adm-input" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} style={{ width: "100%" }} />)}
          {field("Button goes to", <input className="adm-input" value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} placeholder="/collections" style={{ width: "100%" }} />)}
          <div className="adm-grid adm-grid-2">
            {field("Background color", <input className="adm-input" type="color" value={bg} onChange={(e) => setBg(e.target.value)} />)}
            {field("Text color", <input className="adm-input" type="color" value={fg} onChange={(e) => setFg(e.target.value)} />)}
          </div>
          {field("Picture (storage URL)", <input className="adm-input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Upload via Website → CMS & Content, or generate below" style={{ width: "100%" }} />)}
          {field("Picture source", (
            <select className="adm-select" value={imageSource} onChange={(e) => setImageSource(e.target.value)} style={{ width: "100%" }}>
              <option value="upload">Uploaded file</option>
              <option value="pollinations">Pollinations-generated</option>
              <option value="media">Media library</option>
            </select>
          ))}
          {field("Picture prompt (for Pollinations)", (
            <div style={{ display: "flex", gap: 8 }}>
              <input className="adm-input" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A warm photo-style image of a handmade keepsake…" style={{ flex: 1 }} />
              <button type="button" className="adm-btn adm-btn-ghost" onClick={generate} disabled={generating}>{generating ? "Making…" : "Generate"}</button>
            </div>
          ), "The generated picture is stored in your media, never hotlinked.")}
          {kind === "popup" && (
            <>
              <div className="adm-grid adm-grid-2">
                {field("When it appears", (
                  <select className="adm-select" value={triggerType} onChange={(e) => setTriggerType(e.target.value)} style={{ width: "100%" }}>
                    <option value="delay">After a delay</option>
                    <option value="scroll">After scrolling</option>
                    <option value="exit_intent">When leaving the page</option>
                    <option value="immediate">Straight away</option>
                  </select>
                ))}
                {field(triggerType === "scroll" ? "Scroll percent" : "Delay (seconds)", <input className="adm-input" type="number" min={0} max={100} value={triggerValue} onChange={(e) => setTriggerValue(Number(e.target.value))} style={{ width: "100%" }} />)}
              </div>
              <div className="adm-grid adm-grid-2">
                {field("How often", (
                  <select className="adm-select" value={frequency} onChange={(e) => setFrequency(e.target.value)} style={{ width: "100%" }}>
                    <option value="once_per_session">Once per visit</option>
                    <option value="once_per_day">Once a day</option>
                    <option value="every_visit">Every page view</option>
                  </select>
                ))}
                {field("Payload form id (optional)", <input className="adm-input" type="number" value={formId} onChange={(e) => setFormId(e.target.value)} placeholder="See Website → Content" style={{ width: "100%" }} />)}
              </div>
              <label style={{ display: "flex", gap: 8, fontSize: 12, marginBottom: 14 }}>
                <input type="checkbox" checked={showOnMobile} onChange={(e) => setShowOnMobile(e.target.checked)} /> Show on phones too
              </label>
            </>
          )}
          <div className="adm-grid adm-grid-2">
            {field("Status", (
              <select className="adm-select" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: "100%" }}>
                <option value="draft">Draft — shoppers never see it</option>
                <option value="published">Published — live on that page</option>
              </select>
            ))}
            <label style={{ display: "flex", gap: 8, fontSize: 12, alignItems: "center" }}>
              <input type="checkbox" checked={dismissible} onChange={(e) => setDismissible(e.target.checked)} /> Shopper can close it
            </label>
          </div>
          <div className="adm-grid adm-grid-2">
            {field("Show from", <input className="adm-input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} style={{ width: "100%" }} />)}
            {field("Show until", <input className="adm-input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} style={{ width: "100%" }} />)}
          </div>
          {msg && <p className="adm-help">{msg}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="adm-btn" type="submit" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : `Create ${kind}`}</button>
            {editing && <button type="button" className="adm-btn adm-btn-ghost" onClick={reset}>Cancel edit</button>}
          </div>
        </form>
      </div>
      <div className="adm-card">
        <h2>Existing {kind === "banner" ? "banners" : "pop-ups"} ({items.length})</h2>
        {items.length === 0 ? (
          <div className="adm-empty">None yet — create your first one on the left.</div>
        ) : (
          <table className="adm-table">
            <thead><tr><th>Page</th><th>Headline</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td>{r.placement}</td>
                  <td>{r.title || "—"}</td>
                  <td>{r.status}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => load(r)}>Edit</button>{" "}
                    {r.status === "published" && (
                      <button type="button" className="adm-btn adm-btn-ghost adm-btn-sm" onClick={() => unpublish(r)} disabled={busy}>Take down</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="adm-help">A published {kind} shows on its page only. A banner replaces the top strip on that page — it never stacks on top of it.</p>
      </div>
    </div>
  );
}
