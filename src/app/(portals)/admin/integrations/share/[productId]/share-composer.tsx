"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface NetworkInfo { id: string; label: string; captionLimit: number }
interface AccountInfo { id: string; network: string; handle: string | null }

export default function ShareComposer({
  product,
  networks,
  accounts,
}: {
  product: { id: string; name: string; url: string; imageUrl: string | null };
  networks: NetworkInfo[];
  accounts: AccountInfo[];
}) {
  const router = useRouter();
  const [caption, setCaption] = useState(`New in the shop: ${product.name} — made to order, made to mean something.`);
  const [media, setMedia] = useState<string[]>(product.imageUrl ? [product.imageUrl] : []);
  const [mediaInput, setMediaInput] = useState("");
  const [targets, setTargets] = useState<Record<string, string>>({}); // network -> accountId ("" = first connected)
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const accountsByNetwork = useMemo(() => {
    const map = new Map<string, AccountInfo[]>();
    for (const a of accounts) {
      const list = map.get(a.network) ?? [];
      list.push(a);
      map.set(a.network, list);
    }
    return map;
  }, [accounts]);

  function toggle(network: string) {
    setTargets((cur) => {
      const next = { ...cur };
      if (network in next) delete next[network];
      else next[network] = accountsByNetwork.get(network)?.[0]?.id ?? "";
      return next;
    });
  }

  async function submit(mode: "now" | "schedule" | "draft") {
    const chosen = Object.entries(targets).map(([network, accountId]) => ({
      network,
      accountId: accountId || null,
    }));
    if (chosen.length === 0) {
      setMessage({ kind: "err", text: "Choose at least one network." });
      return;
    }
    if (mode === "schedule" && !when) {
      setMessage({ kind: "err", text: "Pick a date and time to schedule." });
      return;
    }
    setBusy(mode);
    setMessage(null);
    const res = await fetch("/api/admin/integrations/social/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caption,
        mediaUrls: media,
        productId: product.id,
        productUrl: product.url,
        targets: chosen,
        publishNow: mode === "now",
        scheduledAt: mode === "schedule" ? new Date(when).toISOString() : null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setMessage({ kind: "err", text: json.error ?? "Creating the post failed." });
      return;
    }
    if (mode === "now") {
      const post = json.post;
      setMessage({
        kind: post?.status === "published" ? "ok" : "err",
        text:
          post?.status === "published"
            ? `Published. ${post.error ? `Note: ${post.error}` : "Live on every chosen network."}`
            : `Publishing failed. ${post?.error ?? "See the calendar for per-network errors."}`,
      });
    } else {
      setMessage({
        kind: "ok",
        text: mode === "schedule" ? "Scheduled. Find it on the calendar." : "Saved as a draft in the queue.",
      });
    }
    router.refresh();
  }

  return (
    <div className="int-card">
      <div className="int-row" style={{ alignItems: "flex-start" }}>
        {product.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt="" className="int-thumb" style={{ width: 96, height: 96 }} />
        )}
        <div className="int-grow">
          <b>{product.name}</b>
          <div className="int-muted">{product.url}</div>
        </div>
      </div>

      <label className="int-label">Caption</label>
      <textarea className="int-textarea" value={caption} onChange={(e) => setCaption(e.target.value)} />
      <div className="int-muted">{caption.length} characters</div>

      <label className="int-label">Media</label>
      {media.map((m) => (
        <div className="int-row" key={m} style={{ marginBottom: 6 }}>
          <span className="int-grow" style={{ wordBreak: "break-all", fontSize: 13 }}>{m}</span>
          <button className="adm-btn adm-btn-sm int-danger" onClick={() => setMedia(media.filter((x) => x !== m))}>
            Remove
          </button>
        </div>
      ))}
      <div className="int-row">
        <input
          className="int-input"
          placeholder="Add an image or video URL…"
          value={mediaInput}
          onChange={(e) => setMediaInput(e.target.value)}
        />
        <button
          className="adm-btn adm-btn-sm"
          onClick={() => { if (mediaInput.trim()) { setMedia([...media, mediaInput.trim()]); setMediaInput(""); } }}
        >
          Add
        </button>
      </div>

      <label className="int-label">Networks</label>
      <div style={{ display: "grid", gap: 8 }}>
        {networks.map((n) => {
          const mine = accountsByNetwork.get(n.id) ?? [];
          const checked = n.id in targets;
          const overLimit = n.captionLimit > 0 && caption.length > n.captionLimit;
          return (
            <div className="int-check" key={n.id}>
              <input type="checkbox" checked={checked} disabled={mine.length === 0} onChange={() => toggle(n.id)} />
              <div className="int-grow">
                <b>{n.label}</b>
                {mine.length === 0 ? (
                  <div className="int-muted">No connected account — connect one on the Social accounts screen.</div>
                ) : (
                  <select
                    className="int-select"
                    style={{ marginTop: 6 }}
                    disabled={!checked}
                    value={targets[n.id] ?? mine[0].id}
                    onChange={(e) => setTargets((cur) => ({ ...cur, [n.id]: e.target.value }))}
                  >
                    {mine.map((a) => (
                      <option key={a.id} value={a.id}>{a.handle ?? "Account"}</option>
                    ))}
                  </select>
                )}
                {overLimit && checked && (
                  <div className="int-muted" style={{ color: "#9c2222" }}>
                    Caption is {caption.length - n.captionLimit} characters over the {n.label} limit.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {accounts.length === 0 && (
        <div className="int-banner warn" style={{ marginTop: 14 }}>
          No social accounts are connected yet. Connect at least one network before sharing —
          drafts and schedules will fail at publish time until an account exists.
        </div>
      )}

      <label className="int-label">Schedule for (optional)</label>
      <input
        className="int-input"
        type="datetime-local"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
      />

      {message && (
        <div className={`int-banner ${message.kind === "ok" ? "ok" : "err"}`} style={{ marginTop: 14 }}>
          {message.text}
        </div>
      )}
      <div className="int-actions">
        <button className="adm-btn" disabled={busy !== null} onClick={() => submit("now")}>
          {busy === "now" ? "Publishing…" : "Share now"}
        </button>
        <button className="adm-btn adm-btn-ghost" disabled={busy !== null} onClick={() => submit("schedule")}>
          {busy === "schedule" ? "Scheduling…" : "Schedule"}
        </button>
        <button className="adm-btn adm-btn-ghost" disabled={busy !== null} onClick={() => submit("draft")}>
          {busy === "draft" ? "Saving…" : "Save draft"}
        </button>
      </div>
    </div>
  );
}
