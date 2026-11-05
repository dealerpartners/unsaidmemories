"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Cookie notice — a slim first-visit banner at the bottom of the
 * storefront. The choice is kept twice: localStorage (fast reads on
 * this device) and a cookie named unsaid_cookie_consent (so the
 * choice is a real cookie, readable anywhere). Once answered, it
 * never appears again on this device. It explains itself in plain
 * words, links to the privacy page, and never blocks shopping —
 * the banner is dismissible and the shop works the same either way.
 * The words are the admin's when Website → Settings has saved
 * cookie_consent_text (passed in by the shell); otherwise the
 * built-in copy below renders, unchanged.
 */

const LS_KEY = "unsaid_cookie_choice";
const COOKIE_NAME = "unsaid_cookie_consent";

function readChoice(): string | null {
  try {
    const local = window.localStorage.getItem(LS_KEY);
    if (local) return local;
  } catch {
    // localStorage unavailable (private mode) — fall through to cookie
  }
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeChoice(choice: "accepted" | "declined") {
  try {
    window.localStorage.setItem(LS_KEY, choice);
  } catch {
    // the cookie below still records it
  }
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${COOKIE_NAME}=${choice}; path=/; max-age=${oneYear}; SameSite=Lax`;
}

export function CookieNotice({
  text,
  privacyUrl,
}: {
  /** Website → Settings cookie_consent_text, when the admin saved
   *  their own words; null renders the built-in copy below. */
  text?: string | null;
  /** Website → Settings privacy_policy_url — the "what we collect"
   *  link follows the same destination as the footer's Privacy. */
  privacyUrl?: string | null;
} = {}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!readChoice()) {
      const t = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(t);
    }
  }, []);

  if (!visible) return null;

  function answer(choice: "accepted" | "declined") {
    writeChoice(choice);
    setVisible(false);
  }

  return (
    <div className="cookie-notice" role="region" aria-label="Cookie notice">
      {text ? (
        <p>{text}</p>
      ) : (
        <p>
          <strong>A quick word about cookies.</strong> We use a few small cookies to keep your bag
          full, keep you signed in, and — only with your OK — to understand how the shop is used.{" "}
          <Link href={privacyUrl ?? "/legal/privacy-policy"}>What we collect and why</Link>
        </p>
      )}
      <div className="cookie-notice-actions">
        <button className="cookie-notice-decline" onClick={() => answer("declined")}>
          No thanks
        </button>
        <button className="button button-dark cookie-notice-accept" onClick={() => answer("accepted")}>
          That&rsquo;s fine
        </button>
      </div>
    </div>
  );
}
