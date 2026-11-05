// ---------------------------------------------------------------------------
// UnSaid — cookie consent model (adapted from UnSaid Memories, 2026-10-30).
//
// One JSON cookie (`unsaid_cookie_consent`) is the single source of truth
// for the visitor's privacy choices. Everything else derives from it:
//   • the consent banner UI (banner + granular settings)
//   • the analytics loaders (GA4 / PostHog load only after analytics
//     consent — nothing fires before consent)
//
// Migration: the previous UnSaid notice stored a plain string
// ("accepted" / "declined"). Those map honestly onto the granular model:
// "accepted" meant OK to understand how the shop is used, so it grants
// functional + analytics, never advertising (advertising was never
// mentioned, so it is never upgraded). "declined" maps to essential only.
// ---------------------------------------------------------------------------

export const CONSENT_COOKIE = "unsaid_cookie_consent";
export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days
export const CONSENT_VERSION = 1;

export const CONSENT_CHANGED_EVENT = "unsaid:consent-changed";
export const OPEN_PREFERENCES_EVENT = "unsaid:open-cookie-preferences";

/** The categories shown in the consent banner. */
export type ConsentCategories = {
  /** Strictly Necessary — always active, cannot be disabled. */
  essential: true;
  /** Functional — preferences and enhanced features. */
  functional: boolean;
  /** Analytics — GA4, PostHog. */
  analytics: boolean;
  /** Advertising — cross-context behavioral advertising. */
  advertising: boolean;
};

export type ConsentRecord = ConsentCategories & {
  /** Schema version, so future changes can migrate old records. */
  v: number;
  /** Epoch ms when the choice was saved. */
  ts: number;
  /** Public consent id shown in the UI, e.g. "UNS-8B92-F1C3". */
  cid: string;
};

export const ESSENTIAL_ONLY: ConsentCategories = {
  essential: true,
  functional: false,
  analytics: false,
  advertising: false,
};

export const ALL_GRANTED: ConsentCategories = {
  essential: true,
  functional: true,
  analytics: true,
  advertising: true,
};

/** Defaults the banner's Customize panel opens with. */
export const CUSTOMIZE_DEFAULTS: ConsentCategories = {
  essential: true,
  functional: true,
  analytics: false,
  advertising: false,
};

export function makeConsentId(): string {
  const hex = () =>
    Math.floor(Math.random() * 0xffff)
      .toString(16)
      .toUpperCase()
      .padStart(4, "0");
  return `UNS-${hex()}-${hex()}`;
}

// ---------------------------------------------------------------------------
// Cookie codec — stored URL-encoded so it survives `document.cookie` intact.
// ---------------------------------------------------------------------------

export function encodeConsentCookie(c: ConsentRecord): string {
  return encodeURIComponent(JSON.stringify(c));
}

export function decodeConsentCookie(raw: string): ConsentRecord | null {
  // Legacy plain-string records from the previous notice.
  if (raw === "accepted") {
    return {
      essential: true,
      functional: true,
      analytics: true,
      advertising: false,
      v: CONSENT_VERSION,
      ts: Date.now(),
      cid: makeConsentId(),
    };
  }
  if (raw === "declined") {
    return { ...ESSENTIAL_ONLY, v: CONSENT_VERSION, ts: Date.now(), cid: makeConsentId() };
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<ConsentRecord>;
    if (typeof parsed.functional !== "boolean" || typeof parsed.analytics !== "boolean") return null;
    return {
      v: typeof parsed.v === "number" ? parsed.v : CONSENT_VERSION,
      essential: true,
      functional: parsed.functional,
      analytics: parsed.analytics,
      advertising: typeof parsed.advertising === "boolean" ? parsed.advertising : false,
      ts: typeof parsed.ts === "number" ? parsed.ts : Date.now(),
      cid: typeof parsed.cid === "string" ? parsed.cid : makeConsentId(),
    };
  } catch {
    return null;
  }
}

export function readConsentCookie(): ConsentRecord | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE}=([^;]*)`));
  if (m) {
    const rec = decodeConsentCookie(m[1]);
    if (rec) return rec;
  }
  // Fallback: localStorage mirror (written alongside the cookie on every
  // choice — survives cookie clears and is readable pre-paint).
  try {
    const raw = window.localStorage.getItem(CONSENT_COOKIE);
    if (raw) return decodeConsentCookie(raw);
  } catch {
    /* storage unavailable — ignore */
  }
  return null;
}

export function writeConsentLocalStorage(record: ConsentRecord): void {
  try {
    window.localStorage.setItem(CONSENT_COOKIE, encodeConsentCookie(record));
  } catch {
    /* storage unavailable — the cookie still records it */
  }
}
