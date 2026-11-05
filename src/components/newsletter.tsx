"use client";

import { useState } from "react";
import { ArrowRight, Check, Mail } from "lucide-react";

// Newsletter section with its own local email/subscribed state.
// Rendered on the home page only — kept as a separate client component so the
// site shell (which holds the global cart/modal state) does not need to know
// about newsletter subscriptions.
export function Newsletter() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  return (
    <section className="newsletter">
      <div className="newsletter-mark"><Mail size={22} /></div>
      <div className="newsletter-copy">
        <span className="eyebrow">A note from us</span>
        <h2>Good things, <em>in your inbox.</em></h2>
        <p>New drops, meaningful stories, and a little inspiration for showing up.</p>
      </div>
      <form
        className="newsletter-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.includes("@")) setSubscribed(true);
        }}
      >
        {subscribed ? (
          <div className="success-message"><Check size={17} /> You're on the list. Talk soon.</div>
        ) : (
          <>
            <label htmlFor="email">Your email address</label>
            <div className="email-field">
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <button aria-label="Subscribe"><ArrowRight size={18} /></button>
            </div>
            <small>By subscribing, you agree to our Privacy Policy.</small>
          </>
        )}
      </form>
    </section>
  );
}
