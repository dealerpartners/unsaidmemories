// ---------------------------------------------------------------------------
// onboarding/validate.ts — typed answer validation (spec §8). Every
// question produces a typed value; this module checks a value against its
// question's declared type and constraints and returns { ok, errors } —
// it never throws on bad input. Conditional questions (question.condition)
// are only required/validated when the condition holds against the
// answers map, when one is supplied.
// ---------------------------------------------------------------------------

import { gtinCheckDigitValid, validateGtin } from "../sellers/catalog-import-spec";
import type { OnboardingQuestion } from "./questions";

export { gtinCheckDigitValid, validateGtin };

export interface AnswerValidation {
  ok: boolean;
  errors: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const E164_RE = /^\+[1-9]\d{7,14}$/;
const REF_RE = /^[A-Za-z0-9][A-Za-z0-9._\-/:]{2,}$/;
const DOMAIN_RE = /^(?=.{4,253}$)([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

const isEmpty = (v: unknown): boolean =>
  v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

function conditionHolds(
  q: OnboardingQuestion,
  answers?: Record<string, unknown>,
): boolean {
  if (!q.condition || !answers) return true;
  const dep = answers[q.condition.questionId];
  if (q.condition.equals !== undefined) return dep === q.condition.equals;
  if (q.condition.notEquals !== undefined) return dep !== q.condition.notEquals;
  return true;
}

/** ABA routing-number checksum (weights 3-7-1 repeating). */
export function abaRoutingValid(digits: string): boolean {
  if (!/^\d{9}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const d = digits.charCodeAt(i) - 48;
    sum += d * (i % 3 === 0 ? 3 : i % 3 === 1 ? 7 : 1);
  }
  return sum % 10 === 0;
}

function isRefShape(v: unknown): boolean {
  if (typeof v === "string") return REF_RE.test(v);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const ref = o.evidenceRef ?? o.ref ?? o.url ?? o.token ?? o.id;
    return typeof ref === "string" && REF_RE.test(ref);
  }
  return false;
}

function checkDate(q: OnboardingQuestion, v: unknown, errors: string[]): void {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(v)) {
    errors.push(`${q.id}: expected an ISO date (YYYY-MM-DD)`);
    return;
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    errors.push(`${q.id}: not a valid date`);
    return;
  }
  if (q.futureDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (d.getTime() <= today.getTime()) errors.push(`${q.id}: date must be in the future`);
  }
}

function checkNumber(q: OnboardingQuestion, v: unknown, errors: string[]): void {
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n)) {
    errors.push(`${q.id}: expected a number`);
    return;
  }
  if (q.min !== undefined && n < q.min) errors.push(`${q.id}: must be at least ${q.min}`);
  if (q.max !== undefined && n > q.max) errors.push(`${q.id}: must be at most ${q.max}`);
}

/**
 * Validate one answer against its question. `answers` (the full answer
 * map) is optional and only used to evaluate question.condition.
 */
export function validateAnswer(
  question: OnboardingQuestion,
  value: unknown,
  answers?: Record<string, unknown>,
): AnswerValidation {
  const errors: string[] = [];
  const q = question;

  if (!conditionHolds(q, answers)) return { ok: true, errors };

  if (isEmpty(value)) {
    if (q.required) errors.push(`${q.id}: answer is required`);
    return { ok: errors.length === 0, errors };
  }

  switch (q.type) {
    case "email":
      if (typeof value !== "string" || !EMAIL_RE.test(value)) errors.push(`${q.id}: invalid email address`);
      break;
    case "phone":
      if (typeof value !== "string" || !E164_RE.test(value)) errors.push(`${q.id}: phone must be E.164 (e.g. +15551234567)`);
      break;
    case "date":
      checkDate(q, value, errors);
      break;
    case "number":
    case "currency":
    case "percent": {
      checkNumber(q, value, errors);
      if (q.type === "percent" && typeof value === "number" && (value < 0 || value > 100)) {
        errors.push(`${q.id}: percent must be between 0 and 100`);
      }
      if (q.type === "currency" && typeof value === "number" && value < 0) {
        errors.push(`${q.id}: currency must not be negative`);
      }
      break;
    }
    case "assessment": {
      // Pass/fail threshold: a score number (vs q.min) or a result object.
      if (typeof value === "number") {
        if (q.min !== undefined && value < q.min) errors.push(`${q.id}: score ${value} is below the pass threshold ${q.min}`);
      } else if (value && typeof value === "object") {
        const o = value as Record<string, unknown>;
        if (typeof o.score === "number" && q.min !== undefined && o.score < q.min) {
          errors.push(`${q.id}: score ${o.score} is below the pass threshold ${q.min}`);
        } else if (o.passed !== true && typeof o.score !== "number") {
          errors.push(`${q.id}: assessment result must carry a score or passed=true`);
        }
      } else {
        errors.push(`${q.id}: expected an assessment score or result`);
      }
      break;
    }
    case "select":
      if (typeof value !== "string") errors.push(`${q.id}: expected a single selected value`);
      else if (q.allowedValues && !q.allowedValues.includes(value)) {
        errors.push(`${q.id}: "${value}" is not one of ${q.allowedValues.join(", ")}`);
      }
      break;
    case "multi-select": {
      if (!Array.isArray(value)) {
        errors.push(`${q.id}: expected an array of selected values`);
        break;
      }
      if (q.allowedValues) {
        for (const v of value) {
          if (typeof v !== "string" || !q.allowedValues.includes(v)) {
            errors.push(`${q.id}: "${String(v)}" is not an allowed value`);
          }
        }
      }
      break;
    }
    case "text": {
      if (typeof value !== "string") {
        errors.push(`${q.id}: expected text`);
        break;
      }
      if (q.minLength !== undefined && value.length < q.minLength) errors.push(`${q.id}: must be at least ${q.minLength} characters`);
      if (q.maxLength !== undefined && value.length > q.maxLength) errors.push(`${q.id}: must be at most ${q.maxLength} characters`);
      break;
    }
    case "password": {
      if (typeof value !== "string" || value.length < (q.minLength ?? 12)) {
        errors.push(`${q.id}: password must be at least ${q.minLength ?? 12} characters`);
      } else if (!(/[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value))) {
        errors.push(`${q.id}: password needs upper, lower and numeric characters`);
      }
      break;
    }
    case "ssn_or_ein": {
      // Vendor hosted field: the platform only ever sees a token/result,
      // but when a raw value is validated it must be 9 digits or XX-XXXXXXX.
      if (typeof value !== "string" || !(/^(\d{9}|\d{2}-\d{7})$/.test(value) || isRefShape(value))) {
        errors.push(`${q.id}: expected 9 digits or XX-XXXXXXX (or a vendor token ref)`);
      }
      break;
    }
    case "ein":
      if (typeof value !== "string" || !/^\d{2}-\d{7}$/.test(value)) errors.push(`${q.id}: EIN must be XX-XXXXXXX`);
      break;
    case "dea":
      if (typeof value !== "string" || !/^[A-Za-z0-9]{9}$/.test(value)) errors.push(`${q.id}: DEA number must be 9 characters`);
      break;
    case "ncpdp":
      if (typeof value !== "string" || !/^\d{7}$/.test(value)) errors.push(`${q.id}: NCPDP number must be 7 digits`);
      break;
    case "routing_number":
      if (typeof value !== "string" || !abaRoutingValid(value)) errors.push(`${q.id}: routing number must be 9 digits and ABA-valid`);
      break;
    case "bank_account":
      if (typeof value !== "string" || !(/^\d{4,17}$/.test(value) || isRefShape(value))) {
        errors.push(`${q.id}: bank account must be 4–17 digits (or a vendor token ref)`);
      }
      break;
    case "file":
    case "camera":
      // file = evidence ref shape (document storage / liveness vendor).
      if (!isRefShape(value)) errors.push(`${q.id}: expected an evidence reference (storage key, URL or vendor token)`);
      break;
    case "checkbox":
      if (value !== true) errors.push(`${q.id}: must be accepted (true)`);
      break;
    case "toggle":
      if (typeof value !== "boolean") errors.push(`${q.id}: expected true or false`);
      break;
    case "e-sign":
    case "form": {
      if (typeof value === "string") {
        if (!isRefShape(value)) errors.push(`${q.id}: expected a signature/document reference`);
      } else if (value && typeof value === "object") {
        const o = value as Record<string, unknown>;
        if (!isRefShape(o.signatureRef ?? o.ref ?? o.documentRef) && o.signed !== true) {
          errors.push(`${q.id}: signature record must carry a reference or signed=true`);
        }
      } else {
        errors.push(`${q.id}: expected a signature record`);
      }
      break;
    }
    case "course": {
      const done =
        value === true ||
        value === "completed" ||
        (value != null && typeof value === "object" &&
          ((value as Record<string, unknown>).completed === true ||
            (value as Record<string, unknown>).percent === 100));
      if (!done) errors.push(`${q.id}: course must be 100% complete`);
      break;
    }
    case "schedule": {
      const okShape =
        (value != null && typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length > 0) ||
        (Array.isArray(value) && value.length > 0);
      if (!okShape) errors.push(`${q.id}: expected weekly hours (object keyed by day, or a non-empty list)`);
      break;
    }
    case "address": {
      if (typeof value === "string") {
        if (value.trim().length < 8) errors.push(`${q.id}: address looks too short`);
      } else if (value && typeof value === "object") {
        const o = value as Record<string, unknown>;
        for (const f of ["street", "city", "state", "zip"]) {
          if (typeof o[f] !== "string" || (o[f] as string).length === 0) {
            errors.push(`${q.id}: address is missing ${f}`);
          }
        }
      } else {
        errors.push(`${q.id}: expected a full address`);
      }
      break;
    }
    case "url": {
      if (typeof value !== "string") {
        errors.push(`${q.id}: expected a URL`);
        break;
      }
      try {
        const u = new URL(value);
        if (u.protocol !== "http:" && u.protocol !== "https:") errors.push(`${q.id}: URL must be http(s)`);
      } catch {
        errors.push(`${q.id}: invalid URL`);
      }
      break;
    }
    case "domain":
      if (typeof value !== "string" || !DOMAIN_RE.test(value)) errors.push(`${q.id}: invalid domain`);
      break;
    case "repeatable": {
      if (!Array.isArray(value) || value.length === 0) {
        errors.push(`${q.id}: expected a non-empty list of entries`);
        break;
      }
      // M2-style product entries: any entry carrying a GTIN gets the
      // catalog check-digit validation (§15 + catalog import spec).
      for (const entry of value) {
        if (entry && typeof entry === "object" && "gtin" in entry) {
          const gtin = (entry as Record<string, unknown>).gtin;
          if (typeof gtin !== "string" || validateGtin(gtin) !== null) {
            errors.push(`${q.id}: an entry's GTIN "${String(gtin)}" is invalid (length or check digit)`);
          }
        }
      }
      break;
    }
    case "review": {
      const ok =
        value === "approved" ||
        (value != null && typeof value === "object" &&
          ["approved", "approve", "edit", "edited"].includes(
            String((value as Record<string, unknown>).decision ?? ""),
          ));
      if (!ok) errors.push(`${q.id}: expected a review decision (approve/edit)`);
      break;
    }
    case "config":
      if (!value || typeof value !== "object" || Array.isArray(value)) errors.push(`${q.id}: expected a configuration object`);
      break;
    case "trigger":
      if (!(value === true || value === "confirmed" ||
        (value != null && typeof value === "object" && (value as Record<string, unknown>).confirmed === true))) {
        errors.push(`${q.id}: expected a delivery confirmation`);
      }
      break;
    case "determination": {
      // Platform-recorded, never applicant-answered (§7): the record must
      // carry the determination, its basis, and who decided it.
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        errors.push(`${q.id}: expected a determination record`);
        break;
      }
      const o = value as Record<string, unknown>;
      if (typeof o.determination !== "string" || o.determination.length === 0) errors.push(`${q.id}: determination record is missing "determination"`);
      if (typeof o.basis !== "string" || o.basis.length === 0) errors.push(`${q.id}: determination record is missing "basis"`);
      if (typeof (o.decided_by ?? o.decidedBy) !== "string") errors.push(`${q.id}: determination record is missing "decided_by"`);
      break;
    }
    default:
      break;
  }

  return { ok: errors.length === 0, errors };
}

/** Validate a whole answer map against a question list. */
export function validateAnswers(
  questions: OnboardingQuestion[],
  answers: Record<string, unknown>,
): AnswerValidation {
  const errors: string[] = [];
  for (const q of questions) {
    const r = validateAnswer(q, answers[q.id], answers);
    errors.push(...r.errors);
  }
  return { ok: errors.length === 0, errors };
}
