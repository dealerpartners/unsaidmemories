"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowLeft, Check } from "lucide-react";
import "./onboarding.css";

const STEPS = [
  "Brand profile",
  "Objectives",
  "Audience",
  "Creative",
  "Budget",
  "Review",
];

const BUSINESS_TYPES = [
  { value: "direct", label: "Direct advertiser", desc: "You represent the brand directly." },
  { value: "agency", label: "Media agency", desc: "You manage campaigns for multiple brands." },
];

const OBJECTIVES = [
  { value: "editorial", label: "Editorial Spotlight", desc: "Long-form branded editorial features." },
  { value: "display", label: "Curated Display & In-Feed", desc: "High-elegance cards in reader flows." },
  { value: "collab", label: "Co-Branded Collaboration", desc: "Creative co-direction campaigns." },
  { value: "discovery", label: "Audience Discovery", desc: "Contextual keyword + interest clustering." },
];

const CONTEXTUAL_CATEGORIES = [
  "Mindful Living",
  "Design & Architecture",
  "Technology & Ethics",
  "Culture & Arts",
  "Family & Relationships",
  "Wellness & Self-Care",
];

const READER_MINDSETS = [
  { value: "exploratory", label: "Exploratory / Learning", desc: "Browsing, discovering, reflecting." },
  { value: "action", label: "Action-driven", desc: "Ready to shop, gift, or engage." },
];

const GEOGRAPHIES = [
  { value: "global", label: "Global", desc: "All markets where Unsaid ships." },
  { value: "regional", label: "Regional", desc: "Continent or country focus." },
  { value: "metro", label: "Top Metropolitan", desc: "Major metro markets only." },
];

const BUDGET_TIERS = [
  { value: "1k-5k", label: "$1,000 – $5,000" },
  { value: "5k-10k", label: "$5,000 – $10,000" },
  { value: "10k-25k", label: "$10,000 – $25,000" },
  { value: "25k+", label: "$25,000+" },
];

const FLIGHT_TYPES = [
  { value: "fixed", label: "Fixed date range", desc: "Run between specific start and end dates." },
  { value: "evergreen", label: "Continuous evergreen", desc: "Ongoing with no end date." },
];

const PAYMENT_METHODS = [
  { value: "card", label: "Corporate card", desc: "Pay by card at campaign launch." },
  { value: "invoice", label: "Invoice terms", desc: "ACH/Wire for qualified agency accounts." },
];

type OnboardingData = {
  brandName: string;
  website: string;
  businessType: string;
  billingCountry: string;
  objectives: string[];
  contextualCategories: string[];
  readerMindset: string;
  geography: string;
  brandSafetyExclusions: string;
  headline: string;
  storyHook: string;
  destinationUrl: string;
  brandMessage: string;
  budgetTier: string;
  flightType: string;
  paymentMethod: string;
};

const INITIAL_DATA: OnboardingData = {
  brandName: "",
  website: "",
  businessType: "direct",
  billingCountry: "US",
  objectives: [],
  contextualCategories: [],
  readerMindset: "exploratory",
  geography: "global",
  brandSafetyExclusions: "",
  headline: "",
  storyHook: "",
  destinationUrl: "",
  brandMessage: "",
  budgetTier: "1k-5k",
  flightType: "fixed",
  paymentMethod: "card",
};

function toggleArray(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function valOrEmpty(v: string): string {
  return v && v.trim() ? v : "";
}

export function OnboardingForm() {
  const [step, setStep] = useState(0); // 0-5
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) {
    setData((d) => ({ ...d, [key]: value }));
    setError("");
  }

  function validateStep(): string {
    if (step === 0) {
      if (!data.brandName.trim()) return "Brand name is required.";
      if (!data.website.trim()) return "Brand website URL is required.";
    }
    if (step === 1 && data.objectives.length === 0) return "Select at least one campaign objective.";
    if (step === 2 && data.contextualCategories.length === 0) return "Select at least one contextual category.";
    if (step === 3) {
      if (data.headline.length > 65) return "Headline must be 65 characters or fewer.";
      if (data.storyHook.length > 180) return "Story hook must be 180 characters or fewer.";
    }
    return "";
  }

  function next() {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/advertise/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (res.status === 401) {
        // No session: advertising runs on the customer account — send
        // the visitor to the one login and back to this flow.
        window.location.href = result.login || "/login?next=/advertise/get-started";
        return;
      }
      if (!res.ok) {
        setError(result.error || "Could not save your brand profile. Please try again.");
        setSubmitting(false);
        return;
      }
      // Privilege active on this account — continue into the Ad Center.
      window.location.href = result.redirect || "/ads";
    } catch {
      setError("Network error — please try again.");
      setSubmitting(false);
    }
  }


  return (
    <>
      {/* Progress indicator */}
      <div className="ob-progress">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`ob-step-dot ${i < step ? "ob-done" : i === step ? "ob-current" : ""}`}
          />
        ))}
      </div>
      <div className="ob-step-label">
        Step {step + 1} of {STEPS.length} · <strong>{STEPS[step]}</strong>
      </div>

      {/* STEP 0: Brand Profile */}
      {step === 0 && (
        <div>
          <h2 className="ob-step-title">Brand profile</h2>
          <p className="ob-step-sub">Advertising runs on the Unsaid account you&apos;re signed in with — no separate login. These details set up your brand in the Ad Center.</p>

          <div className="ob-row">
            <div className="auth-field">
              <label htmlFor="ob-brand">Brand name</label>
              <input id="ob-brand" type="text" placeholder="Your brand" required value={data.brandName} onChange={(e) => update("brandName", e.target.value)} />
            </div>
            <div className="auth-field">
              <label htmlFor="ob-website">Website URL</label>
              <input id="ob-website" type="url" placeholder="https://" required value={data.website} onChange={(e) => update("website", e.target.value)} />
            </div>
          </div>
          <div className="auth-field">
            <label>Business classification</label>
            <div className="ob-choice-grid">
              {BUSINESS_TYPES.map((bt) => (
                <button key={bt.value} type="button" className={`ob-choice ${data.businessType === bt.value ? "ob-selected" : ""}`} onClick={() => update("businessType", bt.value)}>
                  <strong>{bt.label}</strong>
                  <span>{bt.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="auth-field">
            <label htmlFor="ob-country">Billing country</label>
            <select id="ob-country" value={data.billingCountry} onChange={(e) => update("billingCountry", e.target.value)} style={{ width: "100%", padding: "14px 15px", border: "1px solid #e5e1ef", borderRadius: 12, fontSize: 14, outline: "none" }}>
              <option value="US">United States</option>
              <option value="CA">Canada</option>
              <option value="GB">United Kingdom</option>
              <option value="AU">Australia</option>
              <option value="DE">Germany</option>
              <option value="FR">France</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
      )}

      {/* STEP 1: Objectives */}
      {step === 1 && (
        <div>
          <h2 className="ob-step-title">Campaign objective &amp; format</h2>
          <p className="ob-step-sub">Choose the partnership formats that fit your brand. Select all that apply — you can refine later.</p>
          <div className="ob-choice-grid">
            {OBJECTIVES.map((obj) => (
              <button key={obj.value} type="button" className={`ob-choice ${data.objectives.includes(obj.value) ? "ob-selected" : ""}`} onClick={() => update("objectives", toggleArray(data.objectives, obj.value))}>
                <strong>{obj.label}</strong>
                <span>{obj.desc}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2: Audience */}
      {step === 2 && (
        <div>
          <h2 className="ob-step-title">Audience &amp; contextual alignment</h2>
          <p className="ob-step-sub">Privacy-first contextual matching — no invasive tracking. Tell us where your message fits.</p>
          <div className="auth-field">
            <label>Contextual categories</label>
            <div className="ob-check-grid">
              {CONTEXTUAL_CATEGORIES.map((cat) => (
                <button key={cat} type="button" className={`ob-check-item ${data.contextualCategories.includes(cat) ? "ob-selected" : ""}`} onClick={() => update("contextualCategories", toggleArray(data.contextualCategories, cat))}>
                  <span className="ob-check-box">{data.contextualCategories.includes(cat) ? <Check size={12} /> : null}</span>
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div className="auth-field">
            <label>Reader mindset</label>
            <div className="ob-choice-grid">
              {READER_MINDSETS.map((rm) => (
                <button key={rm.value} type="button" className={`ob-choice ${data.readerMindset === rm.value ? "ob-selected" : ""}`} onClick={() => update("readerMindset", rm.value)}>
                  <strong>{rm.label}</strong>
                  <span>{rm.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="auth-field">
            <label>Geographic filtering</label>
            <div className="ob-choice-grid">
              {GEOGRAPHIES.map((geo) => (
                <button key={geo.value} type="button" className={`ob-choice ${data.geography === geo.value ? "ob-selected" : ""}`} onClick={() => update("geography", geo.value)}>
                  <strong>{geo.label}</strong>
                  <span>{geo.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="auth-field">
            <label htmlFor="ob-safety">Brand safety exclusions <span style={{ fontWeight: 400, color: "#9b97a8" }}>(optional)</span></label>
            <input id="ob-safety" type="text" placeholder="Topics or keywords to avoid" value={data.brandSafetyExclusions} onChange={(e) => update("brandSafetyExclusions", e.target.value)} />
          </div>
        </div>
      )}

      {/* STEP 3: Creative */}
      {step === 3 && (
        <div>
          <h2 className="ob-step-title">Creative assets &amp; story brief</h2>
          <p className="ob-step-sub">You can skip this step and come back — your creative team can be invited later.</p>
          <div className="auth-field">
            <label htmlFor="ob-headline">Headline <span style={{ fontWeight: 400, color: "#9b97a8" }}>(max 65 chars)</span></label>
            <input id="ob-headline" type="text" maxLength={65} placeholder="Your brand headline" value={data.headline} onChange={(e) => update("headline", e.target.value)} />
            <div style={{ fontSize: 10, color: "#9b97a8", marginTop: 4 }}>{data.headline.length}/65</div>
          </div>
          <div className="auth-field">
            <label htmlFor="ob-hook">Story hook <span style={{ fontWeight: 400, color: "#9b97a8" }}>(max 180 chars)</span></label>
            <textarea id="ob-hook" maxLength={180} placeholder="A short hook that draws people in" value={data.storyHook} onChange={(e) => update("storyHook", e.target.value)} style={{ minHeight: 80, resize: "vertical" }} />
            <div style={{ fontSize: 10, color: "#9b97a8", marginTop: 4 }}>{data.storyHook.length}/180</div>
          </div>
          <div className="auth-field">
            <label htmlFor="ob-dest">Destination URL</label>
            <input id="ob-dest" type="url" placeholder="https://yourbrand.com/landing" value={data.destinationUrl} onChange={(e) => update("destinationUrl", e.target.value)} />
          </div>
          <div className="auth-field">
            <label htmlFor="ob-msg">Brand message / notes <span style={{ fontWeight: 400, color: "#9b97a8" }}>(optional)</span></label>
            <textarea id="ob-msg" placeholder="Anything else we should know about your brand voice or campaign direction" value={data.brandMessage} onChange={(e) => update("brandMessage", e.target.value)} style={{ minHeight: 80, resize: "vertical" }} />
          </div>
        </div>
      )}

      {/* STEP 4: Budget */}
      {step === 4 && (
        <div>
          <h2 className="ob-step-title">Budget, cadence &amp; billing</h2>
          <p className="ob-step-sub">Frictionless budget allocation with transparent forecasting. You can adjust anytime.</p>
          <div className="auth-field">
            <label>Budget tier</label>
            <div className="ob-check-grid">
              {BUDGET_TIERS.map((bt) => (
                <button key={bt.value} type="button" className={`ob-check-item ${data.budgetTier === bt.value ? "ob-selected" : ""}`} onClick={() => update("budgetTier", bt.value)}>
                  <span className="ob-check-box">{data.budgetTier === bt.value ? <Check size={12} /> : null}</span>
                  {bt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="auth-field">
            <label>Flight type</label>
            <div className="ob-choice-grid">
              {FLIGHT_TYPES.map((ft) => (
                <button key={ft.value} type="button" className={`ob-choice ${data.flightType === ft.value ? "ob-selected" : ""}`} onClick={() => update("flightType", ft.value)}>
                  <strong>{ft.label}</strong>
                  <span>{ft.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="auth-field">
            <label>Payment method</label>
            <div className="ob-choice-grid">
              {PAYMENT_METHODS.map((pm) => (
                <button key={pm.value} type="button" className={`ob-choice ${data.paymentMethod === pm.value ? "ob-selected" : ""}`} onClick={() => update("paymentMethod", pm.value)}>
                  <strong>{pm.label}</strong>
                  <span>{pm.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STEP 5: Review */}
      {step === 5 && (
        <div>
          <h2 className="ob-step-title">Review &amp; submit</h2>
          <p className="ob-step-sub">Here&apos;s everything we have. Submit to activate advertising on your account — your campaign enters 24h editorial review.</p>
          <dl className="ob-summary">
            <div className="ob-summary-row"><dt>Brand</dt><dd>{valOrEmpty(data.brandName) || <span className="ob-empty">—</span>}</dd></div>
            <div className="ob-summary-row"><dt>Website</dt><dd>{valOrEmpty(data.website) || <span className="ob-empty">—</span>}</dd></div>
            <div className="ob-summary-row"><dt>Business type</dt><dd>{BUSINESS_TYPES.find((b) => b.value === data.businessType)?.label}</dd></div>
            <div className="ob-summary-row"><dt>Objectives</dt><dd>{data.objectives.map((o) => OBJECTIVES.find((x) => x.value === o)?.label).filter(Boolean).join(", ") || <span className="ob-empty">—</span>}</dd></div>
            <div className="ob-summary-row"><dt>Audience</dt><dd>{data.contextualCategories.join(", ") || <span className="ob-empty">—</span>}</dd></div>
            <div className="ob-summary-row"><dt>Geography</dt><dd>{GEOGRAPHIES.find((g) => g.value === data.geography)?.label}</dd></div>
            <div className="ob-summary-row"><dt>Headline</dt><dd>{valOrEmpty(data.headline) || <span className="ob-empty">—</span>}</dd></div>
            <div className="ob-summary-row"><dt>Budget</dt><dd>{BUDGET_TIERS.find((b) => b.value === data.budgetTier)?.label}</dd></div>
            <div className="ob-summary-row"><dt>Payment</dt><dd>{PAYMENT_METHODS.find((p) => p.value === data.paymentMethod)?.label}</dd></div>
          </dl>
          <p className="ob-note">By submitting, you agree to the Unsaid editorial &amp; content policy. Campaigns are reviewed within 24 hours. You can manage drafts and invite team members from the Ad Center.</p>
        </div>
      )}

      {error && <div className="auth-error" style={{ marginTop: 16 }}>{error}</div>}

      {/* Navigation */}
      <div className="ob-nav">
        <button type="button" className="ob-back" onClick={back} disabled={step === 0 || submitting}>
          <ArrowLeft size={14} style={{ display: "inline", marginRight: 6 }} />Back
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className="auth-submit" onClick={next} style={{ width: "auto", minWidth: 140 }}>
            Continue <ArrowRight size={15} />
          </button>
        ) : (
          <button type="button" className="auth-submit" onClick={submit} disabled={submitting} style={{ width: "auto", minWidth: 160 }}>
            {submitting ? "Activating…" : <>Submit &amp; launch <ArrowRight size={15} /></>}
          </button>
        )}
      </div>

      <div className="auth-alt">
        Advertising runs on your Unsaid account.{" "}
        <Link href="/account#advertising">Manage it in your account</Link>
      </div>
    </>
  );
}
