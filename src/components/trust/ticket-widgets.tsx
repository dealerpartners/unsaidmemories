"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

async function post(url: string, body: unknown, method = "POST") {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}
function useBusy(): [boolean, (fn: () => Promise<void>) => Promise<void>, string] {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr("");
    try { await fn(); } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  return [busy, run, err];
}

/* ---------------- Composer: public reply / internal note / reminder -------- */
export function Composer({ ticketId, canned }: { ticketId: string; canned: { id: string; title: string; body: string }[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<"reply" | "internal_note">("reply");
  const [body, setBody] = useState("");
  const [cc, setCc] = useState("");
  const [busy, run, err] = useBusy();
  return (
    <div>
      <div className="ts-row" style={{ marginBottom: 8 }}>
        <button type="button" className={`ts-btn sm ${kind === "reply" ? "" : "ghost"}`} onClick={() => setKind("reply")}>Reply</button>
        <button type="button" className={`ts-btn sm ${kind === "internal_note" ? "" : "ghost"}`} onClick={() => setKind("internal_note")}>Internal note</button>
        <button type="button" className="ts-btn sm gray" disabled={busy}
          onClick={() => run(async () => { await post(`/api/admin/support/tickets/${ticketId}/remind`, {}); router.refresh(); })}>
          Send reminder
        </button>
        {canned.length > 0 && (
          <select className="ts-select" style={{ width: 220 }} defaultValue="" onChange={(e) => { const c = canned.find((x) => x.id === e.target.value); if (c) setBody(c.body); }}>
            <option value="">Insert canned reply…</option>
            {canned.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        )}
      </div>
      {kind === "reply" && (
        <input className="ts-input" placeholder="CC (comma-separated emails)" value={cc} onChange={(e) => setCc(e.target.value)} style={{ marginBottom: 8 }} />
      )}
      <textarea className="ts-textarea" rows={4} placeholder={kind === "reply" ? "Write a reply to the requester…" : "Internal note — requester never sees this…"} value={body} onChange={(e) => setBody(e.target.value)} />
      {err && <div className="ts-err" style={{ marginTop: 8 }}>{err}</div>}
      <div style={{ marginTop: 8 }}>
        <button type="button" className="ts-btn" disabled={busy || !body.trim()}
          onClick={() => run(async () => {
            await post(`/api/admin/support/tickets/${ticketId}/messages`, { kind, body, cc: cc.split(",").map((s) => s.trim()).filter(Boolean) });
            setBody(""); setCc(""); router.refresh();
          })}>
          {kind === "reply" ? "Send reply" : "Add internal note"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- Right-rail field editors -------------------------------- */
export function FieldEditors({ ticket, staff, teams }: { ticket: any; staff: any[]; teams: any[] }) {
  const router = useRouter();
  const [busy, run, err] = useBusy();
  const [tags, setTags] = useState<string>((ticket.tags ?? []).join(", "));
  const [minutes, setMinutes] = useState("");
  const save = (patch: Record<string, unknown>) => run(async () => { await post(`/api/admin/support/tickets/${ticket.id}`, patch, "PATCH"); router.refresh(); });
  return (
    <div>
      <label className="ts-label">Status</label>
      <select className="ts-select" value={ticket.status} disabled={busy} onChange={(e) => save({ status: e.target.value })}>
        {["open", "pending", "resolved", "closed"].map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <label className="ts-label">Priority</label>
      <select className="ts-select" value={ticket.priority} disabled={busy} onChange={(e) => save({ priority: e.target.value })}>
        {["low", "normal", "high", "urgent"].map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <label className="ts-label">Department</label>
      <select className="ts-select" value={ticket.category} disabled={busy} onChange={(e) => save({ category: e.target.value })}>
        {["general", "billing", "technical", "seller_support", "payments", "dmca", "chargeback", "privacy_request", "trust_safety", "legal", "feedback", "contact"].map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <label className="ts-label">Assignee</label>
      <select className="ts-select" value={ticket.assigned_staff_id ?? ""} disabled={busy} onChange={(e) => save({ assigned_staff_id: e.target.value || null })}>
        <option value="">Unassigned</option>
        {staff.map((s) => <option key={s.id} value={s.id}>{s.display_name || s.email}</option>)}
      </select>
      <label className="ts-label">Team</label>
      <select className="ts-select" value={ticket.assigned_team_id ?? ""} disabled={busy} onChange={(e) => save({ assigned_team_id: e.target.value || null })}>
        <option value="">No team</option>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <label className="ts-label">Tags (comma-separated)</label>
      <div className="ts-row">
        <input className="ts-input" style={{ flex: 1 }} value={tags} onChange={(e) => setTags(e.target.value)} />
        <button type="button" className="ts-btn sm gray" disabled={busy} onClick={() => save({ tags: tags.split(",").map((s) => s.trim()).filter(Boolean) })}>Save</button>
      </div>
      <label className="ts-label">Log time (minutes) — total {Math.round((ticket.time_spent_seconds ?? 0) / 60)}m</label>
      <div className="ts-row">
        <input className="ts-input" style={{ flex: 1 }} type="number" min="1" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="e.g. 15" />
        <button type="button" className="ts-btn sm gray" disabled={busy || !minutes}
          onClick={() => run(async () => { await post(`/api/admin/support/tickets/${ticket.id}/time`, { minutes: Number(minutes) }); setMinutes(""); router.refresh(); })}>Log</button>
      </div>
      {err && <div className="ts-err" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  );
}

/* ---------------- Actions & approvals ------------------------------------- */
export function ActionPanel({ ticketId, actions }: { ticketId: string; actions: any[] }) {
  const router = useRouter();
  const [busy, run, err] = useBusy();
  const [type, setType] = useState("refund");
  const [amount, setAmount] = useState("");
  const [target, setTarget] = useState("");
  return (
    <div>
      {actions.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13 }}>No actions requested from this ticket yet.</p>}
      {actions.map((a) => (
        <div key={a.id} className="ts-msg">
          <div className="meta">{a.action_type.replace(/_/g, " ")}{a.amount != null ? ` — $${Number(a.amount).toFixed(2)}` : ""} · <b>{a.status}</b>{a.target_ref ? ` · ${a.target_ref}` : ""}</div>
          {a.status === "pending_approval" && (
            <div className="ts-row">
              <button type="button" className="ts-btn sm" disabled={busy} onClick={() => run(async () => { await post(`/api/admin/support/tickets/${ticketId}/actions/${a.id}`, { decision: "approve" }); router.refresh(); })}>Approve & execute</button>
              <button type="button" className="ts-btn sm red" disabled={busy} onClick={() => run(async () => { await post(`/api/admin/support/tickets/${ticketId}/actions/${a.id}`, { decision: "reject" }); router.refresh(); })}>Reject</button>
            </div>
          )}
          {a.status === "approved" && (
            <button type="button" className="ts-btn sm" disabled={busy} onClick={() => run(async () => { await post(`/api/admin/support/tickets/${ticketId}/actions/${a.id}`, { decision: "execute" }); router.refresh(); })}>Execute now</button>
          )}
        </div>
      ))}
      <label className="ts-label">Request an action</label>
      <div className="ts-row">
        <select className="ts-select" style={{ width: 170 }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="refund">Refund</option>
          <option value="store_credit">Store credit</option>
          <option value="listing_takedown">Listing takedown</option>
          <option value="account_change">Account change</option>
        </select>
        <input className="ts-input" style={{ width: 120 }} type="number" min="0" step="0.01" placeholder="Amount $" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className="ts-input" style={{ flex: 1 }} placeholder="Target ref (order / listing / account)" value={target} onChange={(e) => setTarget(e.target.value)} />
      </div>
      <p style={{ fontSize: 12, color: "var(--muted)" }}>Money actions at or above $100.00 wait for an approver; below the line they execute on request. Executed actions write through the owning module's ledger and stay on this ticket's trail.</p>
      {err && <div className="ts-err">{err}</div>}
      <button type="button" className="ts-btn sm" disabled={busy}
        onClick={() => run(async () => {
          await post(`/api/admin/support/tickets/${ticketId}/actions`, { action_type: type, amount: amount ? Number(amount) : null, target_ref: target || null });
          setAmount(""); setTarget(""); router.refresh();
        })}>Request action</button>
    </div>
  );
}

/* ---------------- Side conversations -------------------------------------- */
export function SidePanel({ ticketId, sides }: { ticketId: string; sides: any[] }) {
  const router = useRouter();
  const [busy, run, err] = useBusy();
  const [subject, setSubject] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  return (
    <div>
      {sides.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13 }}>No side conversations on this ticket.</p>}
      {sides.map((s) => (
        <div key={s.id} className="ts-msg">
          <div className="meta"><b>{s.subject}</b> · {s.status}
            {s.status === "open" && (
              <button type="button" className="ts-btn sm gray" style={{ marginLeft: 8 }} disabled={busy}
                onClick={() => run(async () => { await post(`/api/admin/support/tickets/${ticketId}/side-conversations/${s.id}`, { status: "closed" }, "PATCH"); router.refresh(); })}>Close</button>
            )}
          </div>
          {(s.messages ?? []).map((m: any) => (
            <div key={m.id} style={{ fontSize: 13, margin: "6px 0" }}><span style={{ color: "var(--muted)" }}>{m.actor_label || "Staff"}:</span> {(m.payload?.body as string) || ""}</div>
          ))}
          {s.status === "open" && (
            <div className="ts-row">
              <input className="ts-input" style={{ flex: 1 }} placeholder="Message staff / external party (requester-invisible)…" value={drafts[s.id] ?? ""} onChange={(e) => setDrafts({ ...drafts, [s.id]: e.target.value })} />
              <button type="button" className="ts-btn sm" disabled={busy || !(drafts[s.id] ?? "").trim()}
                onClick={() => run(async () => { await post(`/api/admin/support/tickets/${ticketId}/side-conversations/${s.id}`, { body: drafts[s.id] }); router.refresh(); })}>Send</button>
            </div>
          )}
        </div>
      ))}
      <div className="ts-row">
        <input className="ts-input" style={{ flex: 1 }} placeholder="New side conversation subject…" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <button type="button" className="ts-btn sm ghost" disabled={busy || !subject.trim()}
          onClick={() => run(async () => { await post(`/api/admin/support/tickets/${ticketId}/side-conversations`, { subject }); setSubject(""); router.refresh(); })}>Open side conversation</button>
      </div>
      {err && <div className="ts-err" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  );
}

/* ---------------- Attachments --------------------------------------------- */
export function AttachmentPanel({ ticketId, attachments }: { ticketId: string; attachments: any[] }) {
  const router = useRouter();
  const [busy, run, err] = useBusy();
  const onFile = (file: File) => run(async () => {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    const sha = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const blocked = /\.(exe|msi|bat|cmd|sh|ps1|scr|jar|com)$/i.test(file.name);
    await post(`/api/admin/support/tickets/${ticketId}/attachments`, {
      filename: file.name, size_bytes: file.size, mime_declared: file.type || "application/octet-stream", sha256: sha,
      storage_key: `support/${ticketId}/${Date.now()}-${file.name}`, visibility: "internal",
    });
    if (blocked) setErrNote("Executable/script files are blocked by policy — the upload was registered as blocked and will not be downloadable.");
    router.refresh();
  });
  const [note, setErrNote] = useState("");
  return (
    <div>
      {attachments.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13 }}>No files attached to this ticket yet.</p>}
      {attachments.map((a) => (
        <div key={a.id} className="ts-row" style={{ fontSize: 13, justifyContent: "space-between" }}>
          <span>{a.filename} <span style={{ color: "var(--muted)" }}>({a.size_bytes ? `${Math.ceil(a.size_bytes / 1024)} KB` : "—"} · scan: {a.scan_status} · {a.visibility})</span></span>
          <button type="button" className="ts-btn sm gray" disabled={busy}
            onClick={() => run(async () => { await post(`/api/admin/support/tickets/${ticketId}/attachments/${a.id}`, undefined, "DELETE"); router.refresh(); })}>Remove</button>
        </div>
      ))}
      <p style={{ fontSize: 12, color: "var(--muted)" }}>10 MB per file · 50 MB per ticket · executables and scripts are blocked · new files download after their security scan.</p>
      <label className="ts-btn sm ghost" style={{ cursor: "pointer" }}>
        Attach file
        <input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      </label>
      {note && <div className="ts-err" style={{ marginTop: 8 }}>{note}</div>}
      {err && <div className="ts-err" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  );
}

/* ---------------- Links & relations --------------------------------------- */
export function LinksRelations({ ticket, relations, linkable }: { ticket: any; relations: any[]; linkable: any[] }) {
  const router = useRouter();
  const [busy, run, err] = useBusy();
  const links: any[] = (ticket.metadata?.links as any[]) ?? [];
  const [ltype, setLtype] = useState("order");
  const [lref, setLref] = useState("");
  const [rtype, setRtype] = useState("related");
  const [rtarget, setRtarget] = useState("");
  return (
    <div>
      <h4>Links</h4>
      {links.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13 }}>Nothing linked yet — connect this case to the order, payment, listing or ticket it is about.</p>}
      {links.map((l, i) => (
        <div key={i} className="ts-row" style={{ fontSize: 13, justifyContent: "space-between" }}>
          <span>{l.type}: <b>{l.ref}</b>{l.label ? ` — ${l.label}` : ""}</span>
          <button type="button" className="ts-btn sm gray" disabled={busy} onClick={() => run(async () => { await post(`/api/admin/support/tickets/${ticket.id}/links`, { index: i }, "DELETE"); router.refresh(); })}>Unlink</button>
        </div>
      ))}
      <div className="ts-row">
        <select className="ts-select" style={{ width: 130 }} value={ltype} onChange={(e) => setLtype(e.target.value)}>
          {["order", "payment", "listing", "customer", "appointment", "prescription"].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className="ts-input" style={{ flex: 1 }} placeholder="commerce order id / ref" value={lref} onChange={(e) => setLref(e.target.value)} />
        <button type="button" className="ts-btn sm" disabled={busy || !lref.trim()} onClick={() => run(async () => { await post(`/api/admin/support/tickets/${ticket.id}/links`, { type: ltype, ref: lref }); setLref(""); router.refresh(); })}>Add link</button>
      </div>
      <h4>Relations</h4>
      {relations.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13 }}>No ticket relations.</p>}
      {relations.map((r) => (
        <div key={r.id} className="ts-row" style={{ fontSize: 13, justifyContent: "space-between" }}>
          <span>{r.relation_type.replace(/_/g, " ")}: <b>{r.related?.ticket_ref ?? r.related_ticket_id}</b>{r.related ? ` — ${r.related.subject} (${r.related.status})` : ""}</span>
          <button type="button" className="ts-btn sm gray" disabled={busy} onClick={() => run(async () => { await post(`/api/admin/support/tickets/${ticket.id}/relations/${r.id}`, undefined, "DELETE"); router.refresh(); })}>Remove</button>
        </div>
      ))}
      <div className="ts-row">
        <select className="ts-select" style={{ width: 140 }} value={rtype} onChange={(e) => setRtype(e.target.value)}>
          {["duplicate_of", "related", "child", "problem", "incident"].map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
        <select className="ts-select" style={{ flex: 1 }} value={rtarget} onChange={(e) => setRtarget(e.target.value)}>
          <option value="">Choose a ticket…</option>
          {linkable.map((t) => <option key={t.id} value={t.id}>{t.ticket_ref} — {t.subject}</option>)}
        </select>
        <button type="button" className="ts-btn sm" disabled={busy || !rtarget} onClick={() => run(async () => { await post(`/api/admin/support/tickets/${ticket.id}/relations`, { related_ticket_id: rtarget, relation_type: rtype }); router.refresh(); })}>Add relation</button>
      </div>
      {err && <div className="ts-err" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  );
}
