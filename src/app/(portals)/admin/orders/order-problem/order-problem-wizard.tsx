"use client";

import { useState } from "react";
import Link from "next/link";
import "./order-problem.css";

/**
 * Something's Wrong With an Order — the Orders wizard.
 *
 * An order problem today means hunting for where to write it down.
 * This wizard walks it: find the order (search by number, buyer, or
 * item — the same search the Orders page uses), say what happened,
 * write down what the customer said, and open a support case that
 * carries the order with it. It ends on proof: the case reference,
 * named, with the way into the case.
 *
 * Writes ride the support engine's own endpoints:
 *   POST /api/admin/support/tickets                (opens the case)
 *   POST /api/admin/support/tickets/<id>/messages  (the detail, as
 *        an internal note — recording the problem sends nothing to
 *        the customer; replying is a separate, deliberate step)
 */

const STEPS = ["Find the order", "What happened", "The details", "Done"] as const;

const PROBLEMS = [
  { id: "never-arrived", title: "It never arrived", blurb: "The customer is still waiting — tracking stalled, or nothing ever shipped." },
  { id: "damaged", title: "It arrived damaged", blurb: "Broken, cracked, torn, or the print itself came out wrong." },
  { id: "wrong-item", title: "Wrong item or size", blurb: "What landed isn't what they ordered." },
  { id: "refund", title: "They want a refund", blurb: "Changed their mind, or unhappy enough to ask for their money back." },
  { id: "address", title: "Address problem", blurb: "Wrong address, returned to sender, or they moved." },
  { id: "other", title: "Something else", blurb: "Anything that doesn't fit the boxes above." },
] as const;

type OrderRow = {
  id: string;
  orderNumber?: string;
  buyerName?: string;
  buyerEmail?: string;
  customerEmail?: string;
  totalAmount?: number;
  total?: number;
  status?: string;
};

export default function OrderProblemWizard() {
  const [step, setStep] = useState(0);
  const [term, setTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<OrderRow[] | null>(null);
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [problem, setProblem] = useState<(typeof PROBLEMS)[number] | null>(null);
  const [detail, setDetail] = useState("");
  const [priority, setPriority] = useState("normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ ref: string; id: string; noteSaved: boolean } | null>(null);

  async function search() {
    if (!term.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders?q=${encodeURIComponent(term.trim())}&limit=8`);
      const json: any = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Search failed (${res.status}).`);
      const rows: OrderRow[] = json?.orders ?? json?.data ?? json?.rows ?? [];
      setResults(rows);
      if (rows.length === 0) setError("No orders match that — try the buyer's email, the order number, or the product name.");
    } catch (e: any) {
      setError(e?.message || "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  async function openCase() {
    if (!order || !problem) return;
    setBusy(true);
    setError(null);
    try {
      const orderLabel = order.orderNumber || order.id.slice(0, 8);
      const res = await fetch("/api/admin/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `Order ${orderLabel}: ${problem.title}`,
          requesterName: order.buyerName || null,
          requesterEmail: order.buyerEmail || order.customerEmail || null,
          priority,
          channel: "email",
        }),
      });
      const json: any = await res.json().catch(() => null);
      if (!res.ok || json?.ok === false) throw new Error(json?.error || `The case could not be opened (${res.status}).`);
      const ticket = json?.ticket ?? json;
      const ticketId = ticket?.id as string | undefined;
      const ref = (ticket?.ticket_ref ?? ticket?.ticketRef ?? ticketId ?? "") as string;
      if (!ticketId) throw new Error("The case answered without its reference — check the Support Desk queues before opening another.");

      let noteSaved = false;
      const noteBody = [
        `Order problem reported from the Orders wizard.`,
        `Order: ${orderLabel}${order.buyerEmail || order.customerEmail ? ` — ${order.buyerEmail || order.customerEmail}` : ""}.`,
        `What happened: ${problem.title}.`,
        detail.trim() ? `What the customer said: ${detail.trim()}` : "",
      ].filter(Boolean).join("\n");
      const mres = await fetch(`/api/admin/support/tickets/${encodeURIComponent(ticketId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteBody, kind: "internal_note" }),
      });
      noteSaved = mres.ok;

      setDone({ ref, id: ticketId, noteSaved });
      setStep(3);
    } catch (e: any) {
      setError(e?.message || "Something went wrong opening the case.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep(0); setTerm(""); setResults(null); setOrder(null); setProblem(null);
    setDetail(""); setPriority("normal"); setError(null); setDone(null);
  }

  return (
    <div className="opw-wrap">
      <header className="opw-head">
        <h1>Something&apos;s wrong with an order</h1>
      </header>

      <ol className="opw-steps" aria-label="Order problem steps">
        {STEPS.map((label, i) => {
          const state = i < step ? "done" : i === step ? "current" : "todo";
          return (
            <li key={label} className={`opw-step ${state}`} aria-current={state === "current" ? "step" : undefined}>
              {state === "done" ? (
                <button type="button" onClick={() => setStep(i)} data-tip={`Go back to the ${label} step — your later answers stay until you change this one.`}>
                  <span className="opw-step-num">✓</span>
                  <span className="opw-step-label">{label}</span>
                </button>
              ) : (
                <>
                  <span className="opw-step-num">{i + 1}</span>
                  <span className="opw-step-label">{label}</span>
                </>
              )}
              {i < STEPS.length - 1 ? <span className="opw-step-next" aria-hidden="true">→</span> : null}
            </li>
          );
        })}
      </ol>

      {step === 0 ? (
        <section className="opw-panel" aria-label="Step 1: find the order">
          <h2>Find the order</h2>
          <p className="opw-lede">Search by order number, the buyer&apos;s name or email, or the product name — the same search the Orders page uses.</p>
          <div className="opw-searchrow">
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") search(); }}
              placeholder="e.g. UNS-MVX6O9O6, mary@example.com, or Golden Hour Mug"
              aria-label="Search orders"
            />
            <button type="button" className="opw-btn primary" onClick={search} disabled={searching || !term.trim()}>
              {searching ? "Searching…" : "Search"}
            </button>
          </div>
          {error && step === 0 ? <p className="opw-error" role="alert">{error}</p> : null}
          {results && results.length > 0 ? (
            <div className="opw-results">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`opw-result${order?.id === r.id ? " selected" : ""}`}
                  onClick={() => setOrder(r)}
                  data-tip="Pick this order — the case will carry its number and buyer with it."
                >
                  <span>
                    <b>{r.orderNumber || r.id.slice(0, 8)}</b>{" "}
                    <span>{r.buyerName || r.buyerEmail || r.customerEmail || ""}</span>
                  </span>
                  <span>
                    {typeof r.totalAmount === "number" ? `$${r.totalAmount.toFixed(2)}` : ""} {r.status || ""}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="opw-actions">
            <button type="button" className="opw-btn primary" disabled={!order} onClick={() => setStep(1)} data-tip="Continue — next you'll say what happened with this order.">
              Continue
            </button>
          </div>
          {!order && results ? <p className="opw-hint">Pick the order from the list to continue.</p> : null}
        </section>
      ) : null}

      {step === 1 ? (
        <section className="opw-panel" aria-label="Step 2: what happened">
          <h2>What happened?</h2>
          <p className="opw-lede">Pick the closest one — it names the case, so the right person can find it fast.</p>
          <div className="opw-cards">
            {PROBLEMS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`opw-card${problem?.id === p.id ? " selected" : ""}`}
                onClick={() => setProblem(p)}
              >
                <b>{p.title}</b>
                <span>{p.blurb}</span>
              </button>
            ))}
          </div>
          <div className="opw-actions">
            <button type="button" className="opw-btn" onClick={() => setStep(0)}>Back</button>
            <button type="button" className="opw-btn primary" disabled={!problem} onClick={() => setStep(2)} data-tip="Continue — next you'll write down what the customer actually said.">
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="opw-panel" aria-label="Step 3: the details">
          <h2>The details</h2>
          <p className="opw-lede">
            What the customer said, in their words where you can. This is saved on the case as an internal note —{" "}
            <strong>recording the problem sends nothing to the customer</strong>; writing back to them is a separate step, in the case itself.
          </p>
          <label className="opw-field wide">
            <span>What happened, and what they said</span>
            <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={5} placeholder="e.g. Ordered Oct 20, tracking hasn't moved since Oct 24. She needs it for a memorial on Nov 8 and is asking where it is." />
          </label>
          <label className="opw-field">
            <span>How urgent is it?</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low — no hurry</option>
              <option value="normal">Normal</option>
              <option value="high">High — a date is attached to it</option>
              <option value="urgent">Urgent — the customer is upset or a deadline is days away</option>
            </select>
          </label>
          {error ? <p className="opw-error" role="alert">{error}</p> : null}
          <div className="opw-actions">
            <button type="button" className="opw-btn" onClick={() => setStep(1)} disabled={busy}>Back</button>
            <button type="button" className="opw-btn primary" onClick={openCase} disabled={busy} data-tip="Open the support case now — you'll see its reference number on the next screen, as proof.">
              {busy ? "Opening…" : "Open the case"}
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 && done ? (
        <section className="opw-panel" aria-label="Done">
          <h2>The case is open — here&apos;s the proof</h2>
          <p className="opw-lede">
            Case <strong>{done.ref}</strong> is in the Support Desk, carrying order{" "}
            <strong>{order?.orderNumber || ""}</strong> and “{problem?.title}”
            {done.noteSaved ? ", with your note saved on it" : ""}. Anyone on the team can pick it up from there — the customer hasn&apos;t been written to yet.
          </p>
          <div className="opw-actions">
            <Link className="opw-btn primary" href={`/admin/support/${encodeURIComponent(done.id)}`} data-tip="Open the case in the Support Desk — reply to the customer, add notes, and track it to done from there.">
              Open the case
            </Link>
            <button type="button" className="opw-btn" onClick={reset} data-tip="Report another order problem the same way.">
              Report another
            </button>
            <Link className="opw-btn" href="/admin/orders">Back to Orders</Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
