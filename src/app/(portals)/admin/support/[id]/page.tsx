import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTicketDetail } from "@/lib/trust/support";
import { Composer, FieldEditors } from "@/components/trust/ticket-widgets";
import { db, T, loadTickets, dueLabel, priorityPill, statusPill, initials, timeAgo } from "../data";
import "../support.css";

export const metadata: Metadata = { title: "Support Desk — Agent workspace" };
export const dynamic = "force-dynamic";

// Agent workspace (owner's v2 comp): one ticket, three columns —
// customer + SLA + properties | thread + composer | customer 360 +
// suggested solutions. The composer and field editors are the desk's
// existing wired widgets (real send path, real PATCH path).
export default async function SupportWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getTicketDetail(id);
  if (!detail) notFound();
  const t: any = detail.ticket;
  const sb = db();

  // Customer record (the one CRM home) + this customer's ticket history.
  let customer: any = null;
  if (t.requester_customer_id) {
    const { data } = await sb.from("crm_customers")
      .select("id, first_name, last_name, company_name, email, phone, customer_since, lifetime_value")
      .eq("id", t.requester_customer_id).maybeSingle();
    customer = data;
  }
  const all = await loadTickets(300);
  const custTickets = all.filter((x) => (t.requester_customer_id && x.requester_customer_id === t.requester_customer_id)
    || (t.requester_email && x.requester_email === t.requester_email));
  const custOpen = custTickets.filter((x) => !["resolved", "closed"].includes(x.status));
  const custCsat = custTickets.filter((x) => x.csat_score !== null);
  const custCsatAvg = custCsat.length ? (custCsat.reduce((a, x) => a + (x.csat_score ?? 0), 0) / custCsat.length).toFixed(1) : null;

  // Suggested solutions: published KB articles matching subject words.
  const words = String(t.subject ?? "").toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const { data: kbAll } = await sb.from("support_kb_articles").select("id, title, summary, body")
    .eq("tenant_id", T()).eq("status", "published").limit(50);
  const solutions = (kbAll ?? []).filter((a: any) => words.some((w) => `${a.title} ${a.summary ?? ""}`.toLowerCase().includes(w))).slice(0, 2);

  const messages: any[] = detail.messages ?? [];
  const byChannel = new Map<string, number>();
  for (const m of messages) byChannel.set(m.channel ?? "email", (byChannel.get(m.channel ?? "email") ?? 0) + 1);

  const pr = priorityPill(t.priority); const st = statusPill(t.status); const due = dueLabel(t as any);
  const custName = t.requester_name || (customer ? `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim() : "") || t.requester_email || "Customer";
  const firstResp = t.first_public_reply_at
    ? { label: "MET", cls: "green" }
    : { label: "WAITING", cls: "amber" };

  return (
    <div className="sup"><div className="content">
      <div className="pagehead">
        <div><h1>Agent workspace</h1></div>
        <div className="actions"><Link className="btn" href="/admin/support/queues">← All queues</Link></div>
      </div>
      <div className="workspace">
        <div className="leftcol">
          <div className="card ticket-summary">
            <div className="customerline">
              <div className="avatar">{initials(custName)}</div>
              <div><strong>{custName}</strong><div className="tiny muted">{customer?.company_name ?? t.requester_email ?? ""}</div></div>
              {t.assigned_team_id && <span className="pill blue" style={{ marginLeft: "auto" }}>Team</span>}
            </div>
            <div style={{ display: "flex", gap: 6, margin: "13px 0" }}>
              <span className={`pill ${pr.cls}`}>{pr.label} priority</span>
              <span className={`pill ${st.cls}`}>{st.label}</span>
            </div>
            <div className="data-pair"><span>Open tickets</span><b>{custOpen.length}</b></div>
            <div className="data-pair"><span>All conversations</span><b>{custTickets.length}</b></div>
            {customer?.lifetime_value !== null && customer?.lifetime_value !== undefined && (
              <div className="data-pair"><span>Lifetime value</span><b>${Number(customer.lifetime_value).toLocaleString()}</b></div>
            )}
            <div className="data-pair"><span>Opened</span><b>{timeAgo(t.created_at)}</b></div>
          </div>
          <div className="card">
            <div className="cardhead"><strong>SLA target timers</strong><span className={`pill ${due.cls}`} style={{ marginLeft: "auto" }}>{due.text}</span></div>
            <div className="cardbody">
              <div className="sla"><strong>First response</strong><div className="time">{t.first_public_reply_at ? `Answered ${timeAgo(t.first_public_reply_at)}` : `Due ${t.first_response_due_at ? timeAgo(t.first_response_due_at) : "—"}`}</div><span className={`pill ${firstResp.cls}`}>{firstResp.label}</span></div>
              <div className="sla"><strong>Resolution</strong><div className="time">{t.resolved_at ? `Resolved ${timeAgo(t.resolved_at)}` : t.resolution_due_at ? `Due ${new Date(t.resolution_due_at).toLocaleString()}` : "No target set"}</div><span className={`pill ${due.cls}`}>{due.text.toUpperCase()}</span></div>
            </div>
          </div>
          <div className="card">
            <div className="cardhead"><strong>Ticket properties</strong></div>
            <div className="cardbody">
              <FieldEditors ticket={t} staff={detail.staff ?? []} teams={detail.teams ?? []} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="threadhead">
            <div className="tiny muted">{t.ticket_ref ?? ""} · {t.category ?? "Support"} <span style={{ marginLeft: 8 }} className={`pill ${pr.cls}`}>{pr.label} priority</span></div>
            <h2>{t.subject}</h2>
            <div className="tiny muted">Created via {t.source_channel ?? "web form"} · {timeAgo(t.created_at)} · {messages.length} messages</div>
          </div>
          <div className="thread">
            {messages.length === 0 ? <div className="empty">No messages yet. The conversation starts with the composer below.</div> : messages.map((m: any) => {
              const internal = m.channel === "internal" || m.metadata?.kind === "internal_note";
              const outbound = m.direction === "outbound";
              const author = internal || outbound
                ? (detail.staff ?? []).find((s: any) => s.id === m.authored_by_staff_id)?.display_name ?? "Support team"
                : custName;
              return (
                <div key={m.id} className={`message ${outbound || internal ? "agentmsg" : ""} ${internal ? "internal" : ""}`}>
                  <div className="msgmeta"><b>{author}</b>{internal && <span className="pill amber">Staff internal note</span>}{!internal && outbound && <span className="pill teal">Reply</span>}<span>{new Date(m.created_at).toLocaleString()}</span></div>
                  <div className="bubble" style={{ whiteSpace: "pre-wrap" }}>{m.body_text ?? m.body ?? ""}</div>
                </div>
              );
            })}
          </div>
          <Composer ticketId={t.id} canned={detail.cannedReplies ?? []} />
        </div>

        <div className="rightcol">
          <div className="card rightstat">
            <h4>Customer 360 data</h4>
            <div className="data-pair"><span>Historical CSAT</span><b>{custCsatAvg ? `${custCsatAvg} / 5.0` : "—"}</b></div>
            <div className="data-pair"><span>Primary contact</span><b>{customer?.phone ?? t.requester_phone ?? "—"}</b></div>
            <div className="data-pair"><span>Email</span><b>{t.requester_email ?? customer?.email ?? "—"}</b></div>
            <div className="data-pair"><span>Customer since</span><b>{customer?.customer_since ? new Date(customer.customer_since).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "—"}</b></div>
          </div>
          <div className="card rightstat">
            <h4>Omnichannel history</h4>
            <div className="mini-grid">
              {["email", "whatsapp", "voice", "sms", "chat"].map((ch) => (
                <div className="mini" key={ch}><b>{byChannel.get(ch) ?? byChannel.get(ch === "voice" ? "phone" : ch) ?? 0}</b><span>{ch.toUpperCase()}</span></div>
              ))}
            </div>
          </div>
          <div className="card rightstat">
            <h4>Suggested solutions · {solutions.length} match{solutions.length === 1 ? "" : "es"}</h4>
            {solutions.length === 0 ? (
              <p className="tiny muted">No published knowledge articles match this ticket yet. Articles you publish in the Knowledge base appear here when their title or summary matches the subject.</p>
            ) : solutions.map((a: any) => (
              <div key={a.id} style={{ marginBottom: 12 }}>
                <b>{a.title}</b>
                <p className="tiny muted">{a.summary ?? ""}</p>
                <Link className="btn soft" href="/admin/support/knowledge">Open article ↗</Link>
              </div>
            ))}
          </div>
          {(detail.attachments ?? []).length > 0 && (
            <div className="card rightstat">
              <h4>Attachments</h4>
              {(detail.attachments ?? []).map((a: any) => (
                <div className="data-pair" key={a.id}><span>{a.file_name ?? a.name ?? "File"}</span><b>{a.size_bytes ? `${Math.round(a.size_bytes / 1024)} KB` : ""}</b></div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div></div>
  );
}
