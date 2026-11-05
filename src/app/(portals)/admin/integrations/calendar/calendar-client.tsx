"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface PostNet { network: string; status: string; external_url: string | null; error: string | null }
interface Post {
  id: string;
  caption: string;
  media_urls: string[] | null;
  product_url: string | null;
  scheduled_at: string | null;
  status: string;
  error: string | null;
  approved_by: string | null;
  created_at: string;
  networks: PostNet[];
}

const DAY = 86_400_000;

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function CalendarClient() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [view, setView] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState<Post | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/integrations/social/posts");
    const json = await res.json().catch(() => ({}));
    if (res.ok) setPosts(json.posts ?? []);
    else setError(json.error ?? "Could not load posts.");
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/admin/integrations/social/posts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(json.error ?? "Action failed.");
    await load();
    setSelected((cur) => (cur ? ((json.post as Post) ?? posts.find((p) => p.id === id) ?? cur) : cur));
  }

  async function remove(id: string) {
    setBusy(true);
    await fetch(`/api/admin/integrations/social/posts/${id}`, { method: "DELETE" });
    setBusy(false);
    setSelected(null);
    await load();
  }

  const days = useMemo(() => {
    if (view === "week") {
      const start = new Date(cursor);
      start.setDate(start.getDate() - start.getDay());
      return Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * DAY));
    }
    const first = startOfMonth(cursor);
    const start = new Date(first);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 42 }, (_, i) => new Date(start.getTime() + i * DAY));
  }, [cursor, view]);

  const queue = useMemo(
    () =>
      posts
        .filter((p) => ["scheduled", "draft", "failed", "publishing"].includes(p.status))
        .sort((a, b) => (a.scheduled_at ?? a.created_at).localeCompare(b.scheduled_at ?? b.created_at)),
    [posts]
  );
  const history = useMemo(
    () => posts.filter((p) => ["published", "cancelled"].includes(p.status)).slice(0, 12),
    [posts]
  );

  function onDrop(day: Date) {
    return async (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(null);
      const id = e.dataTransfer.getData("text/post-id");
      const post = posts.find((p) => p.id === id);
      if (!post || !["scheduled", "draft", "failed"].includes(post.status)) return;
      const when = new Date(day);
      if (post.scheduled_at) {
        const old = new Date(post.scheduled_at);
        when.setHours(old.getHours(), old.getMinutes(), 0, 0);
      } else {
        when.setHours(10, 0, 0, 0);
      }
      if (when.getTime() < Date.now()) when.setTime(Date.now() + 30 * 60_000);
      await act(id, { action: "reschedule", scheduledAt: when.toISOString() });
    };
  }

  const monthLabel = cursor.toLocaleDateString([], { month: "long", year: "numeric" });

  return (
    <div>
      {error && <div className="int-banner err">{error}</div>}
      <div className="fabric-toolbar">
        <div style={{ display: "flex", gap: 8 }}>
          <button className="adm-btn adm-btn-sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - (view === "month" ? 1 : 0), cursor.getDate() - (view === "week" ? 7 : 0)))}>
            ← Prev
          </button>
          <button className="adm-btn adm-btn-sm" onClick={() => setCursor(new Date())}>Today</button>
          <button className="adm-btn adm-btn-sm" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + (view === "month" ? 1 : 0), cursor.getDate() + (view === "week" ? 7 : 0)))}>
            Next →
          </button>
        </div>
        <b style={{ fontSize: 16 }}>{monthLabel}</b>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={`adm-btn adm-btn-sm ${view === "month" ? "adm-btn" : ""}`} onClick={() => setView("month")}>Month</button>
          <button className={`adm-btn adm-btn-sm ${view === "week" ? "adm-btn" : ""}`} onClick={() => setView("week")}>Week</button>
        </div>
      </div>

      <div className="int-split">
        <div>
          <div className="int-cal" style={{ marginBottom: 8 }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div className="int-cal-head" key={d}>{d}</div>
            ))}
          </div>
          <div className={view === "month" ? "int-cal" : "int-week"}>
            {days.map((day) => {
              const key = day.toDateString();
              const dayPosts = posts.filter(
                (p) => p.scheduled_at && sameDay(new Date(p.scheduled_at), day) && p.status !== "cancelled"
              );
              return (
                <div
                  key={key}
                  className={`int-day ${day.getMonth() !== cursor.getMonth() && view === "month" ? "dim" : ""} ${sameDay(day, new Date()) ? "today" : ""} ${dragOver === key ? "dragover" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(key); }}
                  onDragLeave={() => setDragOver((d) => (d === key ? null : d))}
                  onDrop={onDrop(day)}
                >
                  <div className="int-daynum">{day.getDate()}</div>
                  {dayPosts.map((p) => (
                    <button
                      key={p.id}
                      className="int-post"
                      draggable={["scheduled", "draft", "failed"].includes(p.status)}
                      onDragStart={(e) => e.dataTransfer.setData("text/post-id", p.id)}
                      onClick={() => setSelected(p)}
                    >
                      <b>{p.caption}</b>
                      <span className="int-nets">
                        {p.scheduled_at ? fmtTime(p.scheduled_at) : ""} · {p.networks.map((n) => n.network).join(", ")} · {p.status.replace("_", " ")}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>

          {selected && (
            <div className="int-card" style={{ marginTop: 16 }}>
              <div className="int-row">
                <div className="int-grow">
                  <b>{selected.caption}</b>
                  <div className="int-muted">
                    {selected.scheduled_at
                      ? `${new Date(selected.scheduled_at).toLocaleString()}`
                      : "Not scheduled"} · status <span className={`int-status ${selected.status}`}>{selected.status.replace("_", " ")}</span>
                    {selected.approved_by ? " · approved" : " · not approved"}
                  </div>
                </div>
                <button className="adm-btn adm-btn-sm" onClick={() => setSelected(null)}>Close</button>
              </div>
              {selected.product_url && (
                <p className="int-muted" style={{ margin: "8px 0 0" }}>
                  Product: <a href={selected.product_url}>{selected.product_url}</a>
                </p>
              )}
              {selected.error && <div className="int-banner err" style={{ marginTop: 10 }}>{selected.error}</div>}
              <div style={{ marginTop: 10 }}>
                {selected.networks.map((n) => (
                  <div className="int-row" key={n.network} style={{ marginBottom: 4 }}>
                    <span className="int-grow">{n.network}</span>
                    <span className={`int-status ${n.status === "published" ? "published" : n.status === "failed" ? "failed" : n.status === "scheduled" ? "scheduled" : "draft"}`}>
                      {n.status}
                    </span>
                    {n.external_url && <a href={n.external_url} target="_blank" rel="noreferrer">view post</a>}
                    {n.error && <span className="int-muted">{n.error}</span>}
                  </div>
                ))}
              </div>
              <div className="int-actions">
                {!selected.approved_by && ["scheduled", "draft"].includes(selected.status) && (
                  <button className="adm-btn adm-btn-sm" disabled={busy} onClick={() => act(selected.id, { action: "approve" })}>
                    Approve
                  </button>
                )}
                {["scheduled", "draft", "failed"].includes(selected.status) && (
                  <button className="adm-btn adm-btn-sm" disabled={busy} onClick={() => act(selected.id, { action: "publish-now" })}>
                    Publish now
                  </button>
                )}
                {["scheduled", "draft", "failed"].includes(selected.status) && (
                  <button className="adm-btn adm-btn-sm int-danger" disabled={busy} onClick={() => act(selected.id, { action: "cancel" })}>
                    Cancel post
                  </button>
                )}
                {["draft", "cancelled", "failed"].includes(selected.status) && (
                  <button className="adm-btn adm-btn-sm int-danger" disabled={busy} onClick={() => remove(selected.id)}>
                    Delete
                  </button>
                )}
                <span className="int-muted" style={{ alignSelf: "center" }}>
                  Tip: drag the post to another day to reschedule.
                </span>
              </div>
            </div>
          )}
        </div>

        <div>
          <h3 style={{ margin: "0 0 10px" }}>Queue — upcoming</h3>
          <div className="int-queue">
            {queue.length === 0 && <div className="adm-empty">Nothing scheduled. Share a product to fill the queue.</div>}
            {queue.map((p) => (
              <div className="int-queue-item" key={p.id}>
                <b style={{ display: "block" }}>{p.caption}</b>
                <div className="int-muted">
                  {p.scheduled_at ? new Date(p.scheduled_at).toLocaleString() : "Draft"} · {p.networks.map((n) => n.network).join(", ")}
                </div>
                <div className="int-actions">
                  <span className={`int-status ${p.status}`}>{p.status.replace("_", " ")}</span>
                  <button className="adm-btn adm-btn-sm" onClick={() => setSelected(p)}>Details</button>
                  {["scheduled", "draft", "failed"].includes(p.status) && (
                    <button className="adm-btn adm-btn-sm" disabled={busy} onClick={() => act(p.id, { action: "publish-now" })}>
                      Publish now
                    </button>
                  )}
                </div>
                {p.error && <div className="int-muted" style={{ color: "#9c2222", marginTop: 6 }}>{p.error}</div>}
              </div>
            ))}
          </div>
          <h3 style={{ margin: "22px 0 10px" }}>Recent activity</h3>
          <div className="int-queue">
            {history.length === 0 && <div className="adm-empty">No published or canceled posts yet.</div>}
            {history.map((p) => (
              <div className="int-queue-item" key={p.id}>
                <b style={{ display: "block" }}>{p.caption}</b>
                <div className="int-muted">
                  {p.scheduled_at ? new Date(p.scheduled_at).toLocaleString() : ""} · {p.networks.map((n) => n.network).join(", ")}
                </div>
                <div className="int-actions">
                  <span className={`int-status ${p.status}`}>{p.status.replace("_", " ")}</span>
                  {p.networks.filter((n) => n.external_url).map((n) => (
                    <a key={n.network} href={n.external_url!} target="_blank" rel="noreferrer" className="adm-btn adm-btn-sm">
                      {n.network} ↗
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
