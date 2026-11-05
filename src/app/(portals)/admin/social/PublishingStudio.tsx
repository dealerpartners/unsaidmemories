"use client";

// Publishing Studio — Sunny's design (unsaid-publishing-studio spec) wired
// to the real social engine: accounts and posts come from
// /api/admin/integrations/social/*, publishing runs through the outbox and
// the /api/cron/social-publish worker. No demo data: every number on this
// page is computed from the live posts/accounts the API returns.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import "./studio.css";

type Account = {
  id: string;
  network: string;
  handle: string | null;
  display_name: string | null;
  status: string;
};
type PostNet = { network: string; status: string; external_url: string | null; error: string | null; social_account_id: string | null };
type Post = {
  id: string;
  caption: string;
  media_urls: string[] | null;
  product_url: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  status: string;
  error: string | null;
  created_at: string;
  networks: PostNet[];
};
type View = "overview" | "calendar" | "create" | "library" | "queue" | "channels" | "performance";

const PROVIDERS: Record<string, { name: string; kind: string; letter: string }> = {
  instagram: { name: "Instagram", kind: "ig", letter: "◎" },
  facebook: { name: "Facebook", kind: "fb", letter: "f" },
  linkedin: { name: "LinkedIn", kind: "li", letter: "in" },
  tiktok: { name: "TikTok", kind: "tt", letter: "♪" },
  youtube: { name: "YouTube", kind: "yt", letter: "▶" },
  pinterest: { name: "Pinterest", kind: "pin", letter: "p" },
  x: { name: "X", kind: "tt", letter: "𝕏" },
  threads: { name: "Threads", kind: "", letter: "@" },
  google_business: { name: "Google Business", kind: "", letter: "G" },
  bluesky: { name: "Bluesky", kind: "", letter: "B" },
  discord: { name: "Discord", kind: "", letter: "D" },
};
const NETWORK_ORDER = Object.keys(PROVIDERS);
const providerName = (n: string) => PROVIDERS[n]?.name ?? n;

function zonedToISO(date: string, time: string, tz: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(new Date(guess));
  const p: Record<string, number> = {};
  for (const part of parts) if (part.type !== "literal") p[part.type] = Number(part.value);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return new Date(guess - (asUTC - guess)).toISOString();
}
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
const titleOf = (caption: string) => (caption.split("\n").find((l) => l.trim()) ?? "Untitled post").slice(0, 80);

const VIEW_PATHS: Record<View, string> = {
  overview: "/admin/social",
  create: "/admin/social/create",
  calendar: "/admin/social/calendar",
  library: "/admin/social/library",
  queue: "/admin/social/queue",
  channels: "/admin/social/channels",
  performance: "/admin/social/performance",
};

export default function PublishingStudio({ fixedView }: { fixedView?: View }) {
  const router = useRouter();
  const params = useSearchParams();
  const viewParam = (params.get("view") ?? "overview") as View;
  const [view, setViewState] = useState<View>(fixedView ?? viewParam);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2800);
  }, []);

  const load = useCallback(async () => {
    try {
      const [a, p] = await Promise.all([
        fetch("/api/admin/integrations/social/accounts").then((r) => r.json()),
        fetch("/api/admin/integrations/social/posts").then((r) => r.json()),
      ]);
      setAccounts(Array.isArray(a.accounts) ? a.accounts : []);
      setPosts(Array.isArray(p.posts) ? p.posts : []);
    } catch { /* keep last state */ }
    setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!fixedView) setViewState(viewParam); }, [viewParam, fixedView]);

  // Real app routes: every studio view is its own URL (/admin/social/create,
  // /admin/social/queue, ...). In-studio navigation pushes the route.
  const setView = useCallback((v: View) => {
    setViewState(v);
    router.push(VIEW_PATHS[v], { scroll: false });
  }, [router]);

  const connectedAccounts = useMemo(
    () => accounts.filter((a) => ["active", "connected"].includes(a.status)),
    [accounts]
  );
  const stats = useMemo(() => {
    const now = new Date();
    return {
      scheduled: posts.filter((p) => p.status === "scheduled").length,
      publishedMonth: posts.filter((p) => p.status === "published" && p.published_at && new Date(p.published_at).getMonth() === now.getMonth() && new Date(p.published_at).getFullYear() === now.getFullYear()).length,
      publishedTotal: posts.filter((p) => p.status === "published").length,
      drafts: posts.filter((p) => p.status === "draft").length,
      failed: posts.filter((p) => p.status === "failed").length,
      channels: connectedAccounts.length,
    };
  }, [posts, connectedAccounts]);
  const recent = useMemo(
    () =>
      [...posts]
        .sort((a, b) =>
          String(b.published_at ?? b.scheduled_at ?? b.created_at).localeCompare(
            String(a.published_at ?? a.scheduled_at ?? a.created_at)
          )
        )
        .slice(0, 6),
    [posts]
  );

  return (
    <div className="pubstudio">
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,400,0,0" rel="stylesheet" />
      <main className="main">
        {view === "overview" && (
          <section className="page active">
            <div className="page-head">
              <div>
                <h1>Publishing Studio</h1>
              </div>
              <div className="toolbar">
                <button className="btn" onClick={() => setView("calendar")}><span className="material-symbols-rounded">calendar_month</span>View calendar</button>
                <button className="btn primary" onClick={() => setView("create")} data-tip="Write a post once and send it to all your connected accounts — now, or scheduled for later."><span className="material-symbols-rounded">add</span>Create post</button>
              </div>
            </div>
            <div className="stat-grid">
              <div className="card stat"><div className="stat-top">Scheduled posts <span className="stat-icon"><span className="material-symbols-rounded">schedule</span></span></div><div className="stat-value">{stats.scheduled}</div><div className="stat-foot">Across all connected channels</div></div>
              <div className="card stat"><div className="stat-top">Published this month <span className="stat-icon"><span className="material-symbols-rounded">check_circle</span></span></div><div className="stat-value">{stats.publishedMonth}</div><div className="stat-foot">From the publishing engine</div></div>
              <div className="card stat"><div className="stat-top">Drafts <span className="stat-icon"><span className="material-symbols-rounded">draft</span></span></div><div className="stat-value">{stats.drafts}</div><div className="stat-foot">Ready for review or editing</div></div>
              <div className="card stat"><div className="stat-top">Connected channels <span className="stat-icon"><span className="material-symbols-rounded">hub</span></span></div><div className="stat-value">{stats.channels}</div><div className="stat-foot">{accounts.length === 0 ? "None connected yet — connect the first one" : "Live social accounts"}</div></div>
            </div>
            <div className="card">
              <div className="card-head"><div><h3 className="section-title">Recent activity</h3><div className="section-sub">Latest publishing events across channels</div></div><button className="btn" onClick={() => setView("queue")}>View queue</button></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Content</th><th>Channel</th><th>Status</th><th>When</th></tr></thead>
                  <tbody>
                    {!loaded ? (
                      <tr><td colSpan={4}><div className="empty">Loading…</div></td></tr>
                    ) : recent.length === 0 ? (
                      <tr><td colSpan={4}><div className="empty">No publishing activity yet. Create a post and it will appear here.</div></td></tr>
                    ) : recent.map((p) => (
                      <tr key={p.id}>
                        <td>{titleOf(p.caption)}</td>
                        <td>{p.networks.map((n) => providerName(n.network)).join(", ") || "—"}</td>
                        <td><span className={`status ${p.status === "published" ? "live" : p.status === "failed" ? "error" : p.status}`}>{p.status[0].toUpperCase() + p.status.slice(1)}</span></td>
                        <td>{fmtDate(p.published_at ?? p.scheduled_at ?? p.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {view === "create" && (
          <Composer
            accounts={connectedAccounts}
            anyAccounts={accounts.length > 0}
            toast={toast}
            onDone={() => { load(); setView("queue"); }}
            goChannels={() => setView("channels")}
          />
        )}
        {view === "calendar" && <CalendarView posts={posts} onCreate={() => setView("create")} toast={toast} />}
        {view === "library" && <LibraryView posts={posts} toast={toast} />}
        {view === "queue" && <QueueView posts={posts} loaded={loaded} toast={toast} onChanged={load} onCreate={() => setView("create")} />}
        {view === "channels" && <ChannelsView accounts={accounts} />}
        {view === "performance" && <PerformanceView posts={posts} stats={stats} />}
      </main>
      <div className={`toast ${toastMsg ? "show" : ""}`}>{toastMsg}</div>
    </div>
  );
}

/* ── Composer ─────────────────────────────────────────────────────────── */

function Composer({ accounts, anyAccounts, toast, onDone, goChannels }: {
  accounts: Account[];
  anyAccounts: boolean;
  toast: (m: string) => void;
  onDone: () => void;
  goChannels: () => void;
}) {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [link, setLink] = useState("");
  const [tags, setTags] = useState("");
  const [media, setMedia] = useState<{ url: string; name: string; video: boolean }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [mode, setModeState] = useState<"schedule" | "now">("schedule");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("10:00");
  const [tz, setTz] = useState("America/Chicago");
  const [approval, setApproval] = useState("none");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fullCaption = useMemo(() => {
    const t = tags.trim();
    return [title.trim(), caption.trim()].filter(Boolean).join("\n\n") + (t ? `\n\n${t.startsWith("#") ? t : t}` : "");
  }, [title, caption, tags]);

  const selectedAccounts = accounts.filter((a) => selected.includes(a.id));
  const firstSelected = selectedAccounts[0];

  async function onFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) { toast(`${f.name}: video upload arrives with provider media — images work today`); continue; }
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f);
      });
      const res = await fetch("/api/admin/website/image", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, slot: "social" }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.url) setMedia((m) => [...m, { url: data.url, name: f.name, video: false }]);
      else toast(data.error ?? `Could not upload ${f.name}`);
    }
  }

  function validate(): boolean {
    if (step === 1 && !caption.trim()) { toast("Add a caption before continuing"); return false; }
    if (step === 2 && selected.length === 0) { toast("Select at least one connected channel"); return false; }
    if (step === 3 && mode === "schedule" && !date) { toast("Choose a publishing date"); return false; }
    return true;
  }

  async function submit(asDraft: boolean) {
    if (!caption.trim()) { toast("Add a caption first"); return; }
    if (selected.length === 0) { toast("Pick a channel for this post"); setStep(2); return; }
    setBusy(true);
    try {
      const scheduledAt = !asDraft && mode === "schedule" ? zonedToISO(date, time, tz) : null;
      const publishNow = !asDraft && mode === "now";
      const groups = new Map<string, { network: string; accountId: string }[]>();
      for (const a of selectedAccounts) {
        const cap = (overrides[a.id] ?? "").trim() || fullCaption;
        const arr = groups.get(cap) ?? [];
        arr.push({ network: a.network, accountId: a.id });
        groups.set(cap, arr);
      }
      for (const [cap, targets] of groups) {
        const res = await fetch("/api/admin/integrations/social/posts", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caption: cap,
            mediaUrls: media.map((m) => m.url),
            productUrl: link.trim() || null,
            targets,
            scheduledAt: asDraft ? null : scheduledAt,
            publishNow: asDraft ? false : publishNow,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Could not create the post.");
      }
      toast(asDraft ? "Draft saved" : publishNow ? "Publishing now — watch the queue" : "Post scheduled");
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong");
    }
    setBusy(false);
  }

  const nextLabel = step === 4 ? (approval === "approval" ? "Save for approval" : mode === "now" ? "Publish now" : "Schedule post") : "Continue";

  return (
    <section className="page active">
      <div className="page-head">
        <div><h1>Create post</h1></div>
        <div className="toolbar">
          <button className="btn" disabled={busy} onClick={() => submit(true)}>Save draft</button>
          <button className="btn primary" disabled={busy} onClick={() => { if (step < 4) { if (validate()) setStep(step + 1); } else submit(approval === "approval"); }}>{nextLabel} <span className="material-symbols-rounded">{step === 4 ? "send" : "arrow_forward"}</span></button>
        </div>
      </div>
      <div className="stepper">
        {[["1", "Content"], ["2", "Channels"], ["3", "Schedule"], ["4", "Review"]].map(([n, label], i) => (
          <span key={n} style={{ display: "contents" }}>
            <div className={`step ${step === i + 1 ? "active" : ""} ${step > i + 1 ? "done" : ""}`}><span className="step-num">{n}</span> {label}</div>
            {i < 3 && <div className="step-line" />}
          </span>
        ))}
      </div>
      <div className="composer-layout">
        <div className="card card-pad">
          {step === 1 && (
            <div>
              <h3 className="section-title" style={{ marginBottom: 4 }}>Build your post</h3>
              <div className="section-sub" style={{ marginBottom: 18 }}>Start with a message and add the media you want to share.</div>
              <div className="field"><label htmlFor="postTitle">Internal post name</label><input id="postTitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. October product spotlight" /></div>
              <div className="field"><label htmlFor="postCaption">Caption / post copy</label><textarea id="postCaption" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="What would you like to share? Write your caption here..." /><div className="helper">{caption.length} characters · Platform limits may vary</div></div>
              <div className="field"><label>Media attachments</label>
                <label className="upload-zone" htmlFor="studioMediaInput"><span className="material-symbols-rounded">cloud_upload</span><strong>Drop files here or browse</strong><small>Images and video · Multiple files supported</small></label>
                <input ref={fileRef} type="file" id="studioMediaInput" accept="image/*,video/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
                <div className="media-list">{media.map((m, i) => (
                  <span className="media-chip" key={m.url + i}><span className="material-symbols-rounded" style={{ fontSize: 14 }}>{m.video ? "movie" : "image"}</span>{m.name} <button onClick={() => setMedia(media.filter((_, j) => j !== i))} style={{ border: 0, background: "none", color: "inherit", padding: 0 }}>×</button></span>
                ))}</div>
              </div>
              <div className="two-col">
                <div className="field"><label htmlFor="postLink">Destination link (optional)</label><input id="postLink" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://example.com" /></div>
                <div className="field"><label htmlFor="postTags">Hashtags</label><input id="postTags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="#brand #updates" /></div>
              </div>
            </div>
          )}
          {step === 2 && (
            <div>
              <h3 className="section-title" style={{ marginBottom: 4 }}>Choose your channels</h3>
              <div className="section-sub" style={{ marginBottom: 17 }}>Select the connected accounts where this post should publish.</div>
              {accounts.length === 0 ? (
                <div className="empty"><span className="material-symbols-rounded">hub</span><br />No channels are connected yet, so there is nowhere to publish.<br /><br /><button className="btn primary" onClick={goChannels}>Connect a channel</button></div>
              ) : (
                <>
                  <div className="channel-list">
                    {accounts.map((a) => {
                      const meta = PROVIDERS[a.network] ?? { name: a.network, kind: "", letter: a.network[0]?.toUpperCase() ?? "?" };
                      const on = selected.includes(a.id);
                      return (
                        <label key={a.id} className={`channel ${on ? "selected" : ""}`}>
                          <input type="checkbox" checked={on} onChange={(e) => setSelected(e.target.checked ? [...selected, a.id] : selected.filter((x) => x !== a.id))} />
                          <span className={`channel-logo ${meta.kind}`}>{meta.letter}</span>
                          <span><strong>{meta.name}</strong><small>{a.handle ?? a.display_name ?? "Connected account"}</small></span>
                        </label>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 17, padding: 12, background: "#f7f9f9", borderRadius: 9, fontSize: 10, color: "#6f7c82" }}><span className="material-symbols-rounded" style={{ fontSize: 15, verticalAlign: "middle", color: "var(--teal)" }}>info</span> Each selected channel becomes its own publish job. You can tailor the content for each provider before publishing.</div>
                  {selectedAccounts.length > 0 && (
                    <div style={{ marginTop: 18 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>Channel-specific caption overrides</div>
                      {selectedAccounts.map((a) => (
                        <div className="field" key={a.id}><label>{providerName(a.network)} caption (optional override)</label><textarea rows={2} style={{ minHeight: 65 }} placeholder="Leave blank to use the main caption" value={overrides[a.id] ?? ""} onChange={(e) => setOverrides({ ...overrides, [a.id]: e.target.value })} /></div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {step === 3 && (
            <div>
              <h3 className="section-title" style={{ marginBottom: 4 }}>Choose when to publish</h3>
              <div className="section-sub" style={{ marginBottom: 17 }}>Publish now or set a date and time for each selected channel.</div>
              <div className="field"><label>Publishing method</label><div className="tabs" style={{ width: "max-content" }}><button className={`tab ${mode === "schedule" ? "active" : ""}`} onClick={() => setModeState("schedule")}>Schedule</button><button className={`tab ${mode === "now" ? "active" : ""}`} onClick={() => setModeState("now")}>Publish now</button></div></div>
              {mode === "schedule" && (
                <div className="two-col">
                  <div className="field"><label htmlFor="scheduleDate">Date</label><input type="date" id="scheduleDate" value={date} onChange={(e) => setDate(e.target.value)} /></div>
                  <div className="field"><label htmlFor="scheduleTime">Time</label><input type="time" id="scheduleTime" value={time} onChange={(e) => setTime(e.target.value)} /></div>
                </div>
              )}
              <div className="field"><label htmlFor="timezone">Time zone</label><select id="timezone" value={tz} onChange={(e) => setTz(e.target.value)}><option value="America/Chicago">Central Time (US &amp; Canada)</option><option value="America/New_York">Eastern Time</option><option value="America/Denver">Mountain Time</option><option value="America/Los_Angeles">Pacific Time</option><option value="UTC">UTC</option></select></div>
              <div className="field"><label htmlFor="approval">Approval workflow</label><select id="approval" value={approval} onChange={(e) => setApproval(e.target.value)}><option value="none">No approval required</option><option value="approval">Submit for approval before publishing</option></select></div>
              {approval === "approval" && <div className="helper">Approval parks the post as a draft in the queue until it is published from there.</div>}
            </div>
          )}
          {step === 4 && (
            <div>
              <h3 className="section-title" style={{ marginBottom: 4 }}>Review and confirm</h3>
              <div className="section-sub" style={{ marginBottom: 17 }}>Check your content, destinations, and publishing details.</div>
              <div style={{ background: "#f7f9f9", border: "1px solid var(--line)", borderRadius: 10, padding: 15, fontSize: 11, lineHeight: 1.8 }}>
                <strong>{title.trim() || "Untitled post"}</strong><br />
                <span className="muted">Destinations:</span> {selectedAccounts.map((a) => providerName(a.network)).join(", ") || "None selected"}<br />
                <span className="muted">Publishing:</span> {approval === "approval" ? "Saved as draft for approval" : mode === "now" ? "Immediately" : `${date} at ${time} (${tz})`}<br />
                <span className="muted">Media:</span> {media.length} attachment(s)<br />
                <span className="muted">Approval:</span> {approval === "approval" ? "Required" : "Not required"}
                <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "11px 0" }} />
                <div style={{ whiteSpace: "pre-wrap" }}>{fullCaption}</div>
              </div>
              <div style={{ marginTop: 15, padding: 12, border: "1px solid #d9eae8", background: "#f4faf9", borderRadius: 9, fontSize: 10, color: "#54716e" }}>Publishing runs through the Unsaid social engine — scheduled posts are picked up by the publishing worker every few minutes.</div>
            </div>
          )}
          <div className="toolbar" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 15, marginTop: 16 }}>
            <button className="btn" disabled={step === 1 || busy} onClick={() => setStep(step - 1)}><span className="material-symbols-rounded">arrow_back</span> Back</button>
            <span className="small muted">Step {step} of 4</span>
            <button className="btn primary" disabled={busy} onClick={() => { if (step < 4) { if (validate()) setStep(step + 1); } else submit(approval === "approval"); }}>{nextLabel} <span className="material-symbols-rounded">{step === 4 ? "send" : "arrow_forward"}</span></button>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div><h3 className="section-title">Live preview</h3><div className="section-sub">A preview of your post content</div></div><span className="status">Preview</span></div>
          <div className="card-body">
            <div className="preview-shell"><div className="preview-card">
              <div className="preview-head"><div className="preview-avatar">U</div><div><strong>{firstSelected ? (firstSelected.handle ?? firstSelected.display_name ?? "Your brand") : "Your brand"}</strong><small>{firstSelected ? providerName(firstSelected.network) : "Social channel preview"}</small></div></div>
              <div className="preview-media">{media[0] ? (media[0].video ? <span className="material-symbols-rounded">movie</span> : <img src={media[0].url} alt="" style={{ width: "100%", height: 180, objectFit: "cover" }} />) : <span className="material-symbols-rounded">image</span>}</div>
              <div className="preview-caption">{fullCaption || "Your post caption will appear here as you write."}</div>
              <div className="preview-actions"><span>♡ Like</span><span>◯ Comment</span><span>↗ Share</span></div>
            </div></div>
            <div className="section-sub" style={{ marginTop: 13, textAlign: "center" }}>Provider previews may vary from the final published post.</div>
          </div>
        </div>
      </div>
      {!anyAccounts && step !== 2 && (
        <div style={{ marginTop: 14 }} className="helper">No social accounts are connected yet — connect a channel first: every post, drafts included, is saved against the channels it will publish to.</div>
      )}
    </section>
  );
}

/* ── Calendar ─────────────────────────────────────────────────────────── */

function CalendarView({ posts, onCreate, toast }: { posts: Post[]; onCreate: () => void; toast: (m: string) => void }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const y = cursor.getFullYear(), m = cursor.getMonth();
  const start = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const today = new Date();
  const cells: React.ReactNode[] = [];
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((d) => cells.push(<div key={"h" + d} className="day" style={{ minHeight: 34, background: "#fafbfb" }}><div className="day-head">{d}</div></div>));
  for (let i = 0; i < start; i++) cells.push(<div key={"b" + i} className="day" style={{ background: "#fafbfb" }} />);
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const events = posts.filter((p) => (p.scheduled_at ?? p.published_at ?? "").startsWith(iso));
    cells.push(
      <div key={iso} className="day">
        <div className="day-head"><span className="day-num">{d}</span>{d === today.getDate() && m === today.getMonth() && y === today.getFullYear() ? "Today" : ""}</div>
        {events.map((e, i) => (
          <div key={e.id} className={`event ${i % 2 ? "purple" : ""}`} onClick={() => toast(`${titleOf(e.caption)} · ${e.status}`)}>{titleOf(e.caption)}<br /><span style={{ opacity: 0.75 }}>{e.networks[0] ? providerName(e.networks[0].network) : ""}</span></div>
        ))}
        <button onClick={onCreate} style={{ border: 0, background: "none", color: "#9aa5aa", fontSize: 16, marginTop: 4, padding: "0 3px" }}>+</button>
      </div>
    );
  }
  return (
    <section className="page active">
      <div className="page-head">
        <div><h1>Content calendar</h1></div>
        <div className="toolbar">
          <button className="btn" onClick={() => setCursor(new Date(y, m - 1, 1))}><span className="material-symbols-rounded">chevron_left</span></button>
          <strong style={{ fontSize: 12, minWidth: 105, textAlign: "center" }}>{cursor.toLocaleString("en-US", { month: "long", year: "numeric" })}</strong>
          <button className="btn" onClick={() => setCursor(new Date(y, m + 1, 1))}><span className="material-symbols-rounded">chevron_right</span></button>
          <button className="btn primary" onClick={onCreate}>+ Create post</button>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><div className="tabs"><button className="tab active">Month</button></div><div className="toolbar"><span className="small muted">All channels</span></div></div>
        <div className="card-body calendar-wrap"><div className="calendar">{cells}</div></div>
      </div>
    </section>
  );
}

/* ── Library ──────────────────────────────────────────────────────────── */

function LibraryView({ posts, toast }: { posts: Post[]; toast: (m: string) => void }) {
  const [uploads, setUploads] = useState<{ url: string; name: string }[]>([]);
  const [q, setQ] = useState("");
  const fromPosts = useMemo(() => {
    const seen = new Map<string, { url: string; name: string }>();
    for (const p of posts) for (const u of p.media_urls ?? []) if (!seen.has(u)) seen.set(u, { url: u, name: u.split("/").pop() ?? "media" });
    return [...seen.values()];
  }, [posts]);
  const assets = [...uploads, ...fromPosts].filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));

  async function onUpload(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) { toast(`${f.name}: images only for now`); continue; }
      const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });
      const res = await fetch("/api/admin/website/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dataUrl, slot: "social" }) });
      const data = await res.json().catch(() => ({}));
      if (data.url) setUploads((u) => [{ url: data.url, name: f.name }, ...u]);
      else toast(data.error ?? "Upload failed");
    }
  }

  return (
    <section className="page active">
      <div className="page-head">
        <div><h1>Content library</h1></div>
        <div className="toolbar"><label className="btn primary" htmlFor="libraryInput"><span className="material-symbols-rounded">upload</span>Upload media</label><input type="file" id="libraryInput" accept="image/*,video/*" multiple hidden onChange={(e) => onUpload(e.target.files)} /></div>
      </div>
      <div className="card">
        <div className="card-head">
          <div><h3 className="section-title">All assets</h3><div className="section-sub">Media from your posts, plus uploads from this session</div></div>
          <div className="toolbar"><input placeholder="Search assets..." value={q} onChange={(e) => setQ(e.target.value)} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 11 }} /></div>
        </div>
        <div className="card-body">
          <div className="quick-grid">
            {assets.length === 0 ? <div className="empty">No uploaded assets yet. Add images or videos to start your library.</div> : assets.map((a) => (
              <div key={a.url} className="card" style={{ padding: 13 }}>
                <div className="post-thumb" style={{ width: "100%", height: 105, borderRadius: 8, overflow: "hidden" }}><img src={a.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>
                <strong style={{ display: "block", fontSize: 11, marginTop: 10, overflowWrap: "anywhere" }}>{a.name}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Queue ────────────────────────────────────────────────────────────── */

function QueueView({ posts, loaded, toast, onChanged, onCreate }: { posts: Post[]; loaded: boolean; toast: (m: string) => void; onChanged: () => void; onCreate: () => void }) {
  const [filter, setFilter] = useState("all");
  const rows = posts.filter((p) => filter === "all" || p.status === filter || (filter === "published" && p.status === "publishing"));
  async function del(p: Post) {
    if (!confirm("Delete this draft?")) return;
    const res = await fetch(`/api/admin/integrations/social/posts/${p.id}`, { method: "DELETE" });
    if (res.ok) { toast("Draft deleted"); onChanged(); } else toast("Could not delete that post");
  }
  return (
    <section className="page active">
      <div className="page-head">
        <div><h1>Publishing queue</h1></div>
        <button className="btn primary" onClick={onCreate}>+ Create post</button>
      </div>
      <div className="card">
        <div className="card-head">
          <div className="tabs">
            {[["all", "All"], ["scheduled", "Scheduled"], ["published", "Published"], ["draft", "Drafts"], ["failed", "Failed"]].map(([f, label]) => (
              <button key={f} className={`tab ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>{label}</button>
            ))}
          </div>
          <span className="small muted">{rows.length} items</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Content</th><th>Channel</th><th>Publish date</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {!loaded ? <tr><td colSpan={5}><div className="empty">Loading…</div></td></tr> : rows.length === 0 ? (
                <tr><td colSpan={5}><div className="empty">No posts in this view.</div></td></tr>
              ) : rows.map((p) => (
                <tr key={p.id}>
                  <td><strong>{titleOf(p.caption)}</strong><div className="small muted">{(p.caption ?? "").slice(0, 65)}</div>{p.error && <div className="small" style={{ color: "var(--red)" }}>{p.error}</div>}</td>
                  <td>{p.networks.map((n) => providerName(n.network)).join(", ") || "—"}</td>
                  <td>{fmtDate(p.published_at ?? p.scheduled_at)}</td>
                  <td><span className={`status ${p.status === "publishing" ? "scheduled" : p.status}`}>{p.status[0].toUpperCase() + p.status.slice(1)}</span></td>
                  <td>{p.status === "draft" ? <button className="btn danger" onClick={() => del(p)}>Delete</button> : p.networks[0]?.external_url ? <a className="btn" href={p.networks[0].external_url} target="_blank" rel="noreferrer">View</a> : <button className="btn" onClick={() => toast(p.error ?? `Status: ${p.status}`)}>•••</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ── Channels ─────────────────────────────────────────────────────────── */

function ChannelsView({ accounts }: { accounts: Account[] }) {
  const byNetwork = useMemo(() => {
    const map = new Map<string, Account[]>();
    for (const a of accounts) map.set(a.network, [...(map.get(a.network) ?? []), a]);
    return map;
  }, [accounts]);
  const connectedCount = accounts.filter((a) => ["active", "connected"].includes(a.status)).length;
  return (
    <section className="page active">
      <div className="page-head">
        <div><h1>Connected channels</h1></div>
        <a className="btn primary" href="/admin/integrations/social"><span className="material-symbols-rounded">add_link</span>Connect channel</a>
      </div>
      <div className="card">
        <div className="card-head">
          <div><h3 className="section-title">Connected channels</h3><div className="section-sub">{connectedCount} of {NETWORK_ORDER.length} connected</div></div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Channel</th><th>Account</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {NETWORK_ORDER.map((network) => {
                const meta = PROVIDERS[network];
                const list = byNetwork.get(network) ?? [];
                const connected = list.some((a) => ["active", "connected"].includes(a.status));
                const handle = list[0]?.handle ?? list[0]?.display_name ?? null;
                return (
                  <tr key={network}>
                    <td><strong>{meta.name}</strong></td>
                    <td>{connected ? (handle ?? "Connected account") : "—"}</td>
                    <td><span className={`status ${connected ? "live" : "draft"}`}>{connected ? "Connected" : "Not connected"}</span></td>
                    <td><a className={`btn ${connected ? "" : "primary"}`} href="/admin/integrations/social">{connected ? "Manage" : "Connect"}</a></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ── Performance ──────────────────────────────────────────────────────── */

function PerformanceView({ posts, stats }: { posts: Post[]; stats: { scheduled: number; publishedMonth: number; publishedTotal: number; drafts: number; failed: number; channels: number } }) {
  const perNetwork = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of posts) if (p.status === "published") for (const n of p.networks) counts.set(n.network, (counts.get(n.network) ?? 0) + 1);
    const max = Math.max(1, ...counts.values());
    return [...counts.entries()].map(([network, count]) => ({ network, count, pct: Math.round((count / max) * 100) }));
  }, [posts]);
  return (
    <section className="page active">
      <div className="page-head">
        <div><h1>Performance</h1></div>
      </div>
      <div className="stat-grid">
        <div className="card stat"><div className="stat-top">Published posts <span className="stat-icon"><span className="material-symbols-rounded">send</span></span></div><div className="stat-value">{stats.publishedTotal}</div><div className="stat-foot">All time, all channels</div></div>
        <div className="card stat"><div className="stat-top">Published this month <span className="stat-icon"><span className="material-symbols-rounded">check_circle</span></span></div><div className="stat-value">{stats.publishedMonth}</div><div className="stat-foot">Current calendar month</div></div>
        <div className="card stat"><div className="stat-top">Failed deliveries <span className="stat-icon"><span className="material-symbols-rounded">error</span></span></div><div className="stat-value">{stats.failed}</div><div className="stat-foot">Needing attention in the queue</div></div>
        <div className="card stat"><div className="stat-top">Scheduled ahead <span className="stat-icon"><span className="material-symbols-rounded">schedule</span></span></div><div className="stat-value">{stats.scheduled}</div><div className="stat-foot">Waiting for their time</div></div>
      </div>
      <p className="helper" style={{ marginBottom: 14 }}>Reach and engagement arrive with provider analytics — the figures here are the publishing engine&apos;s own delivery record.</p>
      <div className="dashboard-grid">
        <div className="card">
          <div className="card-head"><div><h3 className="section-title">Published by channel</h3><div className="section-sub">Delivered posts per connected channel</div></div></div>
          <div className="card-body">
            {perNetwork.length === 0 ? <div className="empty">Nothing published yet — the first delivered post starts this chart.</div> : perNetwork.map(({ network, count, pct }) => (
              <div key={network} style={{ marginBottom: 17 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 7 }}><strong>{providerName(network)}</strong><span className="muted">{count} published</span></div>
                <div className="bar"><span style={{ width: `${pct}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div><h3 className="section-title">Recent deliveries</h3><div className="section-sub">Latest published posts</div></div></div>
          <div className="card-body">
            {posts.filter((p) => p.status === "published").slice(0, 3).length === 0 ? <div className="empty">No deliveries yet.</div> : posts.filter((p) => p.status === "published").slice(0, 3).map((p, i) => (
              <div className="post-row" key={p.id}>
                <div className="post-thumb">{String(i + 1).padStart(2, "0")}</div>
                <div className="post-info"><strong>{titleOf(p.caption)}</strong><small>{p.networks.map((n) => providerName(n.network)).join(", ")} · {fmtDate(p.published_at)}</small></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
