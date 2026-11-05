"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import "./gift-cards.css";

const PRESET_AMOUNTS = [25, 50, 75, 100, 150, 250];

const SWATCHES = [
  { name: "Lavender", idx: "01", bg: "#7254d6", ink: "#fff" },
  { name: "Lilac", idx: "02", bg: "#8d73ed", ink: "#fff" },
  { name: "Soft blue", idx: "03", bg: "#dce8ff", ink: "#fff" },
  { name: "Ink", idx: "04", bg: "#171420", ink: "#fff" },
  { name: "Warm white", idx: "05", bg: "#f7f5fb", ink: "#171916" },
  { name: "Periwinkle", idx: "06", bg: "#d5c8ff", ink: "#171916" },
];

export default function GiftCardsPage() {
  const [amount, setAmount] = useState(50);
  const [customAmount, setCustomAmount] = useState("");
  const [cardBg, setCardBg] = useState("#7254d6");
  const [cardInk, setCardInk] = useState("#fff");
  const [activeSwatch, setActiveSwatch] = useState(0);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const displayAmount = `$${amount}`;
  const gradientBg =
    activeSwatch === 0 || activeSwatch === 1
      ? `linear-gradient(145deg, #8d73ed, #5037b6)`
      : cardBg;

  function setPreset(v: number) {
    setAmount(v);
    setCustomAmount("");
  }

  function setCustom(v: string) {
    const n = Math.max(10, Math.min(500, Number(v) || 0));
    setAmount(n);
    setCustomAmount(v);
  }

  function pickSwatch(i: number) {
    const sw = SWATCHES[i];
    setActiveSwatch(i);
    setCardBg(sw.bg);
    setCardInk(sw.ink);
  }

  async function handlePurchase() {
    setError("");
    if (!recipientEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail)) {
      setError("A valid recipient email is required.");
      return;
    }
    if (!senderName.trim()) {
      setError("Your name is required.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/gift-cards/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          recipientName,
          recipientEmail,
          senderName,
          buyerEmail: senderEmail,
          message,
          cardColor: cardBg,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Could not start checkout. Please try again.");
        setSubmitting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="gc-page">
      {/* HERO */}
      <section className="gc-hero" id="gift">
        <div className="gc-container gc-grid">
          <div>
            <p className="gc-eyebrow">A thoughtful way to give</p>
            <h1>
              Give a little <em>meaning.</em>
            </h1>
            <p className="gc-hero-copy">
              A gift card is a small way to say something meaningful. Let someone choose a keepsake, preserve a story, or find something they&apos;ll want to hold onto.
            </p>
            <div className="gc-actions">
              <Link className="gc-btn primary" href="#choose">
                Choose Your Gift
              </Link>
              <Link className="gc-btn secondary" href="#how">
                See How It Works
              </Link>
            </div>
          </div>
          <div className="gc-card-stage">
            <div
              className="gc-card"
              id="giftPreview"
              style={{ background: gradientBg, color: cardInk }}
            >
              <div className="gc-card-top">
                <span className="gc-card-brand">Unsaid Memories</span>
                <span className="gc-card-mark">p</span>
              </div>
              <div className="gc-card-middle">
                <div className="gc-card-label">Gift Card</div>
                <div className="gc-card-value">{displayAmount}</div>
              </div>
              <div className="gc-card-bottom">
                <span>KEEP WHAT MATTERS</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BUILDER */}
      <section className="gc-builder" id="choose">
        <div className="gc-container">
          <div className="gc-section-head">
            <div>
              <p className="gc-eyebrow">A gift with meaning</p>
              <h2>
                Choose the amount.
                <br />
                Make it meaningful.
              </h2>
            </div>
            <p>Choose an amount and a gentle color for a gift that feels personal from the start.</p>
          </div>
          <div className="gc-builder-grid">
            {/* Amount + recipient panel */}
            <div className="gc-panel">
              <h3>Choose an amount</h3>
              <div className="gc-amounts">
                {PRESET_AMOUNTS.map((a) => (
                  <button
                    key={a}
                    className={`gc-amount ${amount === a && !customAmount ? "active" : ""}`}
                    onClick={() => setPreset(a)}
                    type="button"
                  >
                    ${a}
                  </button>
                ))}
              </div>
              <div className="gc-custom">
                <span>$</span>
                <input
                  type="number"
                  min={10}
                  max={500}
                  value={customAmount}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="Custom amount · $10–$500"
                  aria-label="Custom amount"
                />
              </div>
              <div className="gc-field">
                <label htmlFor="recipient">Recipient name</label>
                <input id="recipient" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Who is this for?" />
              </div>
              <div className="gc-field">
                <label htmlFor="recipientEmail">Recipient email</label>
                <input id="recipientEmail" type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="name@example.com" />
              </div>
              <div className="gc-field">
                <label htmlFor="sender">Your name</label>
                <input id="sender" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Your name" />
              </div>
              <div className="gc-field">
                <label htmlFor="senderEmail">Your email (for receipt)</label>
                <input id="senderEmail" type="email" value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <div className="gc-field">
                <label htmlFor="message">Message</label>
                <textarea id="message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="A little note for someone special…" />
              </div>
              <div className="gc-builder-note">
                Gift cards are delivered by email. Connect the payment flow to your production checkout when ready.
              </div>
            </div>

            {/* Color panel */}
            <div className="gc-panel gc-color-panel">
              <p className="gc-eyebrow" style={{ color: "#c8baff" }}>
                Card color
              </p>
              <h3>Make it feel like theirs.</h3>
              <p className="gc-sub">Choose a palette for your gift. The preview updates instantly.</p>
              <div className="gc-color-swatches">
                {SWATCHES.map((sw, i) => (
                  <button
                    key={sw.name}
                    className={`gc-swatch ${activeSwatch === i ? "active" : ""}`}
                    onClick={() => pickSwatch(i)}
                    type="button"
                    aria-label={`${sw.name} ${sw.idx}`}
                  >
                    <div className="gc-swatch-color" style={{ ["--swatch" as string]: sw.bg }} />
                    <div className="gc-swatch-label">
                      <span>{sw.name}</span>
                      <span>{sw.idx}</span>
                    </div>
                  </button>
                ))}
              </div>
              <div className="gc-preview-meta">
                <span>
                  Selected amount <strong>{displayAmount}</strong>
                </span>
                <span>Digital delivery</span>
              </div>
              {error && (
                <div className="gc-builder-note" style={{ color: "#b91c1c", background: "#fef2f2", marginTop: 12 }}>
                  {error}
                </div>
              )}
              <button className="gc-continue-btn" type="button" onClick={handlePurchase} disabled={submitting}>
                {submitting ? "Redirecting to checkout…" : <>Continue to payment · {displayAmount} <ArrowRight size={15} /></>}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="gc-how" id="how">
        <div className="gc-container">
          <div className="gc-section-head">
            <div>
              <p className="gc-eyebrow">How it works</p>
              <h2>
                Easy to give.
                <br />
                Easy to enjoy.
              </h2>
            </div>
            <p>From choosing an amount to opening the email, the gift experience stays simple and clear.</p>
          </div>
          <div className="gc-steps">
            <article className="gc-step-card">
              <span className="gc-step-num">01 / CHOOSE</span>
              <h3>Pick the value.</h3>
              <p>Select a preset amount or enter your own. Make the gift as practical or generous as you want.</p>
            </article>
            <article className="gc-step-card">
              <span className="gc-step-num">02 / SEND</span>
              <h3>We email it.</h3>
              <p>The gift card is delivered digitally to the recipient, with your personal message included.</p>
            </article>
            <article className="gc-step-card">
              <span className="gc-step-num">03 / ENJOY</span>
              <h3>They put it to use.</h3>
              <p>Use the card toward eligible Unsaid Memories experiences, services, or retail purchases.</p>
            </article>
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section className="gc-trust" id="faq">
        <div className="gc-container gc-trust-grid">
          <div>
            <p className="gc-eyebrow">Gift well</p>
            <h2>
              A thoughtful gift.
              <br />
              Room to choose.
            </h2>
            <p className="gc-trust-copy">
              Give someone the freedom to choose a keepsake that feels right for their story.
            </p>
          </div>
          <div className="gc-trust-list">
            <div className="gc-trust-row">
              <span>01</span>
              <div>
                <h3>Useful by design.</h3>
                <p>Give them flexibility instead of guessing which product, service, or care experience they want.</p>
              </div>
            </div>
            <div className="gc-trust-row">
              <span>02</span>
              <div>
                <h3>Instantly deliverable.</h3>
                <p>Digital delivery makes last-minute gifting easy without sacrificing the personal touch.</p>
              </div>
            </div>
            <div className="gc-trust-row">
              <span>03</span>
              <div>
                <h3>Personal from the start.</h3>
                <p>Choose a color, amount, recipient, and message to make the card feel intentionally given.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="gc-final-cta" id="checkout">
        <div className="gc-container gc-cta-inner">
          <div>
            <p className="gc-eyebrow">Ready to give</p>
            <h2>
              Give something that <em>stays with them.</em>
            </h2>
          </div>
          <div>
            <p>Choose an amount, add a personal note, and give someone a meaningful place to begin.</p>
            <Link className="gc-cta-btn" href="#choose">
              Create Your Gift Card ↗
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
