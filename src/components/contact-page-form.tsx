"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSupportSession } from "./support-session";

/**
 * ContactPageForm — the form on /contact. His four channels are the
 * topic choices. Submitting posts to the canonical contact endpoint
 * (POST /api/support/contact, body {name, email, subject, body}) —
 * verified live against the flows build's endpoint, which returns
 * {ok, ticket_ref} — creating a real Support Desk ticket staff work
 * from; the topic
 * and order reference ride inside the message text so nothing the
 * shopper told us is lost.
 */
const TOPIC_OPTIONS = [
  { value: "orders", label: "Orders — order and delivery questions" },
  { value: "products", label: "Products — product and personalisation help" },
  { value: "memory-links", label: "Memory Links — digital and setup questions" },
  { value: "partnerships", label: "Partnerships — work with Unsaid Memories" },
];

export function ContactPageForm({ initialTopic }: { initialTopic?: string }) {
  const session = useSupportSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const prefilled = useRef(false);
  useEffect(() => {
    if (session.state === "in" && !prefilled.current) {
      prefilled.current = true;
      setName((v) => v || session.name);
      setEmail(session.email);
    }
  }, [session]);
  const [topic, setTopic] = useState(
    TOPIC_OPTIONS.some((t) => t.value === initialTopic) ? initialTopic! : "orders",
  );
  const [subject, setSubject] = useState("");
  const [orderReference, setOrderReference] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketRef, setTicketRef] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const topicLabel = TOPIC_OPTIONS.find((t) => t.value === topic)?.label ?? topic;
      const composed =
        message.trim() +
        `\n\n— Sent from the contact page · Topic: ${topicLabel}` +
        (orderReference.trim() ? `\nOrder reference: ${orderReference.trim()}` : "");
      const res = await fetch("/api/support/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, body: composed, message: composed }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "We couldn't send that just now. Please try again in a moment.");
      } else {
        const ref = data?.ticket_ref ?? data?.ticketRef ?? data?.ref ?? null;
        setTicketRef(ref ? String(ref) : "received");
      }
    } catch {
      setError("We couldn't send that just now. Please try again in a moment.");
    }
    setBusy(false);
  }

  if (ticketRef) {
    return (
      <div className="brand-form-success" role="status">
        <strong>Thank you — your message is with us.</strong>
        {ticketRef !== "received" ? (
          <>
            Your reference is {ticketRef}. A real person will reply — usually within one
            business day — and the whole conversation lives in your account, under Help
            and care.{" "}
            <Link href={`/account/help?ticket=${ticketRef}`}>Go to your conversation</Link>
          </>
        ) : (
          <>
            A real person will reply to {email || "your email"} — usually within one
            business day.
          </>
        )}
      </div>
    );
  }

  if (session.state === "loading") {
    return <p style={{ fontSize: 14, color: "#706b77" }}>Loading…</p>;
  }

  if (session.state === "out") {
    return (
      <div style={{ border: "1px solid #ddd6e0", background: "#faf9fc", borderRadius: 12, padding: "22px 24px", maxWidth: 620 }}>
        <p style={{ fontWeight: 700, margin: "0 0 8px", color: "#202126" }}>Support is for customers.</p>
        <p style={{ fontSize: 14, lineHeight: 1.8, color: "#706b77", margin: "0 0 14px" }}>
          Sign in and write to us from Help and care in your account — your conversation stays there,
          in one thread, instead of being scattered across emails. Just looking something up? The{" "}
          <Link href="/help" style={{ color: "#202126", fontWeight: 600 }}>Help Center</Link> answers the common questions.
        </p>
        <Link
          href="/login?next=/account/help"
          style={{ display: "inline-block", background: "#171420", color: "#fff", borderRadius: 10, padding: "10px 18px", fontSize: 14, fontWeight: 600, textDecoration: "none" }}
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="brand-section-head">
        <div>
          <div className="eyebrow">WRITE TO US</div>
          <h2>Tell us what’s happening.</h2>
        </div>
        <p>
          Messages go straight to our support team. Include your order reference if you have
          one — it helps us find things quickly.
        </p>
      </div>
      <form className="brand-form" onSubmit={submit}>
        <div className="brand-form-row">
          <label>
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
          </label>
          <label>
            Email address — your account email
            <input
              type="email"
              value={email}
              autoComplete="email"
              required
              disabled
              style={{ background: "#f7f5fb" }}
            />
          </label>
        </div>
        <div className="brand-form-row">
          <label>
            What is it about?
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              {TOPIC_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Order reference (if you have one)
            <input
              value={orderReference}
              onChange={(e) => setOrderReference(e.target.value)}
              placeholder="UNS-…"
              autoComplete="off"
            />
          </label>
        </div>
        <label>
          Subject
          <input value={subject} onChange={(e) => setSubject(e.target.value)} required />
        </label>
        <label>
          Your message
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            required
          />
        </label>
        {error && <p className="brand-form-error">{error}</p>}
        <div>
          <button className="button button-dark" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send message"} <span aria-hidden="true">↗</span>
          </button>
        </div>
        <p className="brand-form-note">
          Please don’t send payment card details or private family content in this form — if we
          ever need something sensitive, we’ll ask through a secure channel.
        </p>
      </form>
    </div>
  );
}
