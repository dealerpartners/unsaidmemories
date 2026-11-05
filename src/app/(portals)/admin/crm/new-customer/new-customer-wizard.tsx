"use client";

import { useState } from "react";
import Link from "next/link";
import "./new-customer.css";

/**
 * Add a Customer — the CRM wizard.
 *
 * The owner's wizard doctrine: every module's main job gets a guided
 * flow that ends on PROOF, never a toast. The quick modal adds a
 * customer in one shot for people who already know the shape; this
 * wizard walks a new customer in step by step — who they are, where
 * they live, a first note so nothing about them is forgotten — and
 * finishes by showing the customer as they now exist in the CRM,
 * with the way to their profile.
 *
 * Writes ride the same proven endpoints the rest of CRM uses:
 *   POST /api/admin/crm/customers            (creates the customer)
 *   POST /api/admin/crm/customers/<id>/notes (the optional first note)
 * The proof step reads back what the create returned and names the
 * customer, their contact, and where they live in the directory.
 */

const STEPS = ["Who they are", "Where they live", "A first note", "Done"] as const;

export default function NewCustomerWizard() {
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postal, setPostal] = useState("");
  const [country, setCountry] = useState("US");
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; name: string; contact: string; noteSaved: boolean } | null>(null);

  const canStep1 = firstName.trim().length > 0 && (email.trim().length > 3 || phone.trim().length > 6);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, string> = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
      };
      if (line1.trim()) payload.address_line1 = line1.trim();
      if (city.trim()) payload.city = city.trim();
      if (state.trim()) payload.state = state.trim();
      if (postal.trim()) payload.postal_code = postal.trim();
      if (line1.trim() || city.trim()) payload.country = country.trim() || "US";
      const res = await fetch("/api/admin/crm/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json: any = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `The customer could not be saved (${res.status}).`);
      const row = json?.data ?? json;
      const id = row?.id as string | undefined;
      if (!id) throw new Error("The save answered without the new customer — check the directory before adding them again.");

      let noteSaved = false;
      const noteText = note.trim();
      if (noteText || followUp) {
        const body = [noteText, followUp ? `Follow up by ${followUp}.` : ""].filter(Boolean).join(" ");
        const nres = await fetch(`/api/admin/crm/customers/${encodeURIComponent(id)}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
        noteSaved = nres.ok;
      }
      setCreated({
        id,
        name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        contact: email.trim() || phone.trim(),
        noteSaved,
      });
      setStep(3);
    } catch (e: any) {
      setError(e?.message || "Something went wrong saving this customer.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStep(0);
    setFirstName(""); setLastName(""); setEmail(""); setPhone("");
    setLine1(""); setCity(""); setState(""); setPostal(""); setCountry("US");
    setNote(""); setFollowUp(""); setError(null); setCreated(null);
  }

  return (
    <div className="ncw-wrap">
      <header className="ncw-head">
        <h1>Add a customer</h1>
      </header>

      <ol className="ncw-steps" aria-label="Add a customer steps">
        {STEPS.map((label, i) => {
          const state = i < step ? "done" : i === step ? "current" : "todo";
          return (
            <li key={label} className={`ncw-step ${state}`} aria-current={state === "current" ? "step" : undefined}>
              {state === "done" ? (
                <button type="button" onClick={() => setStep(i)} data-tip={`Go back to the ${label} step — your later answers stay until you change this one.`}>
                  <span className="ncw-step-num">✓</span>
                  <span className="ncw-step-label">{label}</span>
                </button>
              ) : (
                <>
                  <span className="ncw-step-num">{i + 1}</span>
                  <span className="ncw-step-label">{label}</span>
                </>
              )}
              {i < STEPS.length - 1 ? <span className="ncw-step-next" aria-hidden="true">→</span> : null}
            </li>
          );
        })}
      </ol>

      {step === 0 ? (
        <section className="ncw-panel" aria-label="Step 1: who they are">
          <h2>Who they are</h2>
          <p className="ncw-lede">Their name, and at least one way to reach them — an email or a phone number.</p>
          <div className="ncw-grid">
            <label className="ncw-field">
              <span>First name</span>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="e.g. Mary" autoComplete="given-name" />
            </label>
            <label className="ncw-field">
              <span>Last name</span>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="e.g. Johnson" autoComplete="family-name" />
            </label>
            <label className="ncw-field">
              <span>Email</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="them@example.com" inputMode="email" autoComplete="email" />
            </label>
            <label className="ncw-field">
              <span>Phone</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(901) 555-0100" inputMode="tel" autoComplete="tel" />
            </label>
          </div>
          {!canStep1 ? <p className="ncw-hint">Add a first name and an email or phone number to continue.</p> : null}
          <div className="ncw-actions">
            <button type="button" className="ncw-btn primary" disabled={!canStep1} onClick={() => setStep(1)} data-tip="Continue to their address — you can skip it and come back later from their profile.">
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="ncw-panel" aria-label="Step 2: where they live">
          <h2>Where they live</h2>
          <p className="ncw-lede">Optional — but having it now means checkout and shipping never have to ask twice.</p>
          <div className="ncw-grid">
            <label className="ncw-field wide">
              <span>Street address</span>
              <input value={line1} onChange={(e) => setLine1(e.target.value)} placeholder="123 Main Street" autoComplete="street-address" />
            </label>
            <label className="ncw-field">
              <span>City</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Memphis" autoComplete="address-level2" />
            </label>
            <label className="ncw-field">
              <span>State</span>
              <input value={state} onChange={(e) => setState(e.target.value)} placeholder="TN" autoComplete="address-level1" />
            </label>
            <label className="ncw-field">
              <span>ZIP / postal code</span>
              <input value={postal} onChange={(e) => setPostal(e.target.value)} placeholder="38103" autoComplete="postal-code" />
            </label>
            <label className="ncw-field">
              <span>Country</span>
              <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="US" autoComplete="country-name" />
            </label>
          </div>
          <div className="ncw-actions">
            <button type="button" className="ncw-btn" onClick={() => setStep(0)}>Back</button>
            <button type="button" className="ncw-btn primary" onClick={() => setStep(2)} data-tip="Continue to the first note — a line about what they care about, so the next conversation starts warm.">
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="ncw-panel" aria-label="Step 3: a first note">
          <h2>A first note</h2>
          <p className="ncw-lede">Optional — anything worth remembering: what they&apos;re grieving, what they ordered before, what they asked you to check on. It lands on their profile where the whole team can see it.</p>
          <label className="ncw-field wide">
            <span>Note</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="e.g. Lost her husband in March. Loves the gold-frame prints. Asked about a matching set for her sister." />
          </label>
          <label className="ncw-field">
            <span>Follow up by (optional)</span>
            <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
          </label>
          {error ? <p className="ncw-error" role="alert">{error}</p> : null}
          <div className="ncw-actions">
            <button type="button" className="ncw-btn" onClick={() => setStep(1)} disabled={busy}>Back</button>
            <button type="button" className="ncw-btn primary" onClick={create} disabled={busy} data-tip="Save this customer now — you'll see them in the list on the next screen, as proof.">
              {busy ? "Saving…" : "Add this customer"}
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 && created ? (
        <section className="ncw-panel" aria-label="Done">
          <h2>They&apos;re in — here&apos;s the proof</h2>
          <p className="ncw-lede">
            <strong>{created.name}</strong> ({created.contact}) is now in your customer list
            {created.noteSaved ? ", with your first note on their profile" : ""}. Anyone on the team can find them in the directory from here on.
          </p>
          <div className="ncw-actions">
            <Link className="ncw-btn primary" href={`/admin/customers?customer_id=${encodeURIComponent(created.id)}`} data-tip="Open their profile — orders, notes, and history all live there.">
              Open their profile
            </Link>
            <button type="button" className="ncw-btn" onClick={reset} data-tip="Start over and add the next customer the same way.">
              Add another customer
            </button>
            <Link className="ncw-btn" href="/admin/customers">Back to the directory</Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
