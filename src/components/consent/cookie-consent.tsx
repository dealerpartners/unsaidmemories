"use client";

// ---------------------------------------------------------------------------
// UnSaid: Cookie Notice (adapted from UnSaid Memories CookieConsent,
// 2026-10-30; copy rewritten in plain words for UnSaid).
//
// Bottom-bar panel: Customize (granular toggles inline) / Essential Only /
// Accept All, presented with BLOCKING behavior intact: while no choice is
// stored, the page behind is grayed out and body scroll is LOCKED (the
// page freezes) until the visitor chooses. There is no
// dismiss-without-choosing: no close button, no backdrop-click, no Escape.
// Until a choice exists, only essential cookies run: the analytics
// loaders check this consent record before loading GA4 / PostHog, so
// nothing fires before consent (see analytics-loader).
//
// The copy model:
//   • Essential cookies keep the site working. Always on; no toggle.
//   • Optional cookies (Functional, Analytics, Advertising) run only
//     if the visitor says yes, and can be changed anytime.
// The banner is re-openable anytime via the `unsaid:open-cookie-preferences`
// window event (the footer "Cookie preferences" control dispatches it).
// There is no Do Not Sell link here: UnSaid has no dedicated opt-out
// page yet, and a Do Not Sell link must go to a real opt-out flow,
// never to a generic page. Adding that page is a separate legal item.
// ---------------------------------------------------------------------------

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ALL_GRANTED,
  CONSENT_CHANGED_EVENT,
  CONSENT_COOKIE,
  CONSENT_COOKIE_MAX_AGE,
  CONSENT_VERSION,
  CUSTOMIZE_DEFAULTS,
  ESSENTIAL_ONLY,
  OPEN_PREFERENCES_EVENT,
  encodeConsentCookie,
  makeConsentId,
  readConsentCookie,
  writeConsentLocalStorage,
  type ConsentCategories,
  type ConsentRecord,
} from "@/lib/consent";
import "./cookie-consent.css";

/** Persist a choice, notify listeners, return the stored record. */
function persistConsent(cats: ConsentCategories): ConsentRecord {
  const prior = readConsentCookie();
  const record: ConsentRecord = {
    ...cats,
    v: CONSENT_VERSION,
    ts: Date.now(),
    cid: prior?.cid ?? makeConsentId(),
  };
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    [
      `${CONSENT_COOKIE}=${encodeConsentCookie(record)}`,
      `max-age=${CONSENT_COOKIE_MAX_AGE}`,
      "path=/",
      "SameSite=Lax",
    ].join("; ") + secure;
  writeConsentLocalStorage(record);
  (window as unknown as { __unsaidConsent?: ConsentCategories }).__unsaidConsent = {
    essential: true,
    functional: cats.functional,
    analytics: cats.analytics,
    advertising: cats.advertising,
  };
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: cats }));
  return record;
}

export function CookieConsent() {
  const emptySubscribe = () => () => {};
  const hydrated = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const [, setTick] = useState(0);
  const [reopened, setReopened] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analytics, setAnalytics] = useState(CUSTOMIZE_DEFAULTS.analytics);
  const [personalization, setPersonalization] = useState(CUSTOMIZE_DEFAULTS.functional);
  const [advertising, setAdvertising] = useState(CUSTOMIZE_DEFAULTS.advertising);

  // Footer / any external controls.
  useEffect(() => {
    const open = () => {
      const p = readConsentCookie();
      setAnalytics(p ? p.analytics : CUSTOMIZE_DEFAULTS.analytics);
      setPersonalization(p ? p.functional : CUSTOMIZE_DEFAULTS.functional);
      setAdvertising(p ? p.advertising : CUSTOMIZE_DEFAULTS.advertising);
      setSettingsOpen(true);
      setReopened(true);
    };
    window.addEventListener(OPEN_PREFERENCES_EVENT, open);
    return () => {
      window.removeEventListener(OPEN_PREFERENCES_EVENT, open);
    };
  }, []);

  const hasChoice = hydrated ? !!readConsentCookie() : false;
  // BLOCKING gate: while no choice is stored, freeze the page: lock
  // scroll on both the document element and body; restored the moment a
  // choice is saved (or on unmount).
  const blocking = hydrated && !hasChoice;
  useEffect(() => {
    if (!blocking) return;
    const doc = document.documentElement;
    const body = document.body;
    const prevDoc = doc.style.overflow;
    const prevBody = body.style.overflow;
    doc.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      doc.style.overflow = prevDoc;
      body.style.overflow = prevBody;
    };
  }, [blocking]);

  if (!hydrated) return null;
  if (hasChoice && !reopened) return null;

  const save = (cats: ConsentCategories) => {
    persistConsent(cats);
    setReopened(false);
    setSettingsOpen(false);
    setTick((t) => t + 1);
  };

  return (
    <>
      {blocking && <div className="unsaid-cookie-backdrop" aria-hidden="true" />}
      <div className="unsaid-cookie show" role="dialog" aria-labelledby="unsaidCookieTitle" aria-describedby="unsaidCookieText">
        <div className="unsaid-cookie-panel">
          <div>
            <p className="unsaid-cookie-eyebrow">Your privacy matters</p>
            <h2 className="unsaid-cookie-title" id="unsaidCookieTitle">A little help from cookies.</h2>
            <p className="unsaid-cookie-text" id="unsaidCookieText">
              Some cookies keep UnSaid working. Those are always on. The rest
              only run if you say yes. You can change your mind anytime.
            </p>
            <p className="unsaid-cookie-links">
              <Link href="/legal/privacy-policy">Cookie &amp; Tracking Policy</Link>
            </p>
          </div>

          <div className="unsaid-cookie-actions">
            <button type="button" className="unsaid-cookie-btn" onClick={() => setSettingsOpen((v) => !v)}>Customize</button>
            <button type="button" className="unsaid-cookie-btn" onClick={() => save({ ...ESSENTIAL_ONLY })}>Essential Only</button>
            <button type="button" className="unsaid-cookie-btn primary" onClick={() => save({ ...ALL_GRANTED })}>Accept All</button>
          </div>

          <div className={`unsaid-cookie-settings${settingsOpen ? " open" : ""}`}>
            {/* ESSENTIAL: no toggle, by law and by design. */}
            <div className="unsaid-cookie-grouplabel">Essential cookies. Always on.</div>
            <div className="unsaid-cookie-choice essential">
              <span className="unsaid-cookie-toggle on" aria-hidden="true" />
              <strong>Essential</strong>
              <small>
                These keep you signed in, keep the site secure, and keep it running.
                The site does not work without them.
              </small>
            </div>

            {/* NON-ESSENTIAL: each category consented to separately. */}
            <div className="unsaid-cookie-grouplabel">Optional cookies. Your choice.</div>
            <div className="unsaid-cookie-choices">
              <div className="unsaid-cookie-choice">
                <button type="button" role="switch" aria-checked={personalization} aria-label="Toggle functional cookies" className={`unsaid-cookie-toggle${personalization ? " on" : ""}`} onClick={() => setPersonalization((v) => !v)} />
                <strong>Functional</strong>
                <small>Remembers your settings, like language and currency, and what you recently looked at. Only used on this site, never for ads.</small>
              </div>
              <div className="unsaid-cookie-choice">
                <button type="button" role="switch" aria-checked={analytics} aria-label="Toggle analytics cookies" className={`unsaid-cookie-toggle${analytics ? " on" : ""}`} onClick={() => setAnalytics((v) => !v)} />
                <strong>Analytics</strong>
                <small>Tells us how the site is doing, overall, so we can fix problems and make it better. Only used for our own measurement.</small>
              </div>
              <div className="unsaid-cookie-choice">
                <button type="button" role="switch" aria-checked={advertising} aria-label="Toggle advertising cookies" className={`unsaid-cookie-toggle${advertising ? " on" : ""}`} onClick={() => setAdvertising((v) => !v)} />
                <strong>Advertising</strong>
                <small>Used to show you ads on other sites based on what you do here. Leave it off and your data stays out of ad profiles.</small>
              </div>
            </div>
            <div className="unsaid-cookie-save">
              <button
                type="button"
                className="unsaid-cookie-btn primary"
                onClick={() => save({ essential: true, functional: personalization, analytics, advertising })}
              >
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
