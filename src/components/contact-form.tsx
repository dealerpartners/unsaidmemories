"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSupportSession } from "./support-session";
import { ArrowRight, CheckCircle2 } from "lucide-react";

/**
 * The write-to-us form (portal Help and care, /help/contact-us,
 * /contact). Submits to /api/support/contact, which creates a real
 * Support Desk ticket for the SIGNED-IN customer; guests are shown
 * a sign-in prompt instead — support is a customer surface, and the
 * conversation lives in the customer's account (owner ruling,
 * 2026-11-03). The success state shows the ticket reference and
 * links straight to the conversation in the portal.
 */
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  border: "1px solid #ddd6e0",
  borderRadius: 10,
  fontSize: 14,
  background: "#fff",
  color: "#202126",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.04em",
  marginBottom: 6,
  color: "#4c4653",
};

export function ContactForm() {
  const session = useSupportSession();
  const [values, setValues] = useState({ name: "", email: "", subject: "", category: "general", body: "" });
  const prefilled = useRef(false);
  useEffect(() => {
    if (session.state === "in" && !prefilled.current) {
      prefilled.current = true;
      setValues((v) => ({ ...v, name: v.name || session.name, email: session.email }));
    }
  }, [session]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sentRef, setSentRef] = useState<string | null>(null);

  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setValues((v) => ({ ...v, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/support/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      setSentRef(data.ticket_ref);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (sentRef) {
    return (
      <div style={{ border: "1px solid #d9e8d9", background: "#f3faf3", borderRadius: 12, padding: "22px 24px", maxWidth: 620 }}>
        <p style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, margin: "0 0 8px", color: "#202126" }}>
          <CheckCircle2 size={18} /> Message sent — thank you.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.8, color: "#706b77", margin: 0 }}>
          Your reference is <strong style={{ color: "#202126" }}>{sentRef}</strong>. We reply within one business day,
          usually faster — and the whole conversation lives in your account, under Help and care.{" "}
          <Link href={`/account/help?ticket=${sentRef}`} style={{ color: "#202126", fontWeight: 600 }}>
            Go to your conversation
          </Link>
        </p>
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
    <form onSubmit={submit} style={{ maxWidth: 620, display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <label style={labelStyle} htmlFor="cf-name">Your name</label>
          <input id="cf-name" style={inputStyle} value={values.name} onChange={set("name")} autoComplete="name" required />
        </div>
        <div>
          <label style={labelStyle} htmlFor="cf-email">Email — your account email</label>
          <input id="cf-email" style={{ ...inputStyle, background: "#f7f5fb" }} type="email" value={values.email} autoComplete="email" required disabled />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 16 }}>
        <div>
          <label style={labelStyle} htmlFor="cf-subject">Subject</label>
          <input id="cf-subject" style={inputStyle} value={values.subject} onChange={set("subject")} required />
        </div>
        <div>
          <label style={labelStyle} htmlFor="cf-category">What is it about?</label>
          <select id="cf-category" style={inputStyle} value={values.category} onChange={set("category")}>
            <option value="general">Just a question</option>
            <option value="orders">An order</option>
            <option value="shipping">Shipping</option>
            <option value="returns">Returns</option>
            <option value="billing">Billing</option>
            <option value="technical">Something's broken</option>
          </select>
        </div>
      </div>
      <div>
        <label style={labelStyle} htmlFor="cf-body">Your message</label>
        <textarea id="cf-body" style={{ ...inputStyle, minHeight: 130, resize: "vertical" }} value={values.body} onChange={set("body")} required />
      </div>
      {error && (
        <p style={{ background: "#fdf0f0", border: "1px solid #f0d5d5", color: "#8a3030", borderRadius: 10, padding: "10px 14px", fontSize: 13, margin: 0 }}>
          {error}
        </p>
      )}
      <div>
        <button className="button button-dark" type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send message"} <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
