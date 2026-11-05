// ---------------------------------------------------------------------------
// onboarding/questions.ts — the deterministic question blocks as DATA
// (spec §9–§16). Every question is a field; every answer produces a typed
// value (spec §8 answer types); every value drives a transition or a gate.
// No prose, no branching narrative — conditions are data too.
//
// Question ids are BLOCK-SCOPED because the spec reuses letters across
// blocks (the groomer block's G1..G33 would collide with gate keys
// G0..G14): universal U*, individual seller S*, business seller BS*,
// groomer GR*, pharmacy P*, vet full V*, vet referral VR*, manufacturer
// M*, franchise F*. Gate references use the separate GateKey namespace.
//
// Pharmacy P19–P31 (due-diligence survey) are a LATER PHASE (§5) and are
// deliberately ABSENT. There is NO NPI or USDA question in the vet block
// (dropped for telemed, §7). V31 is a platform determination record
// (type "determination"), NOT a checkbox/acknowledgment (§7).
//
// vendorHosted: the value is collected through a vendor's hosted fields
// (Stripe Connect / Persona pattern) and the platform stores only the
// token/result — S2/S7/S8 (SSN, bank) and the U9/U10 identity components
// per the §7 annotations (U9 = document storage, U10 = liveness vendor).
// ---------------------------------------------------------------------------

import type { ApplicantType, GateKey } from "./types";

/** Answer types (spec §8) plus the few literal types the blocks use. */
export type AnswerType =
  | "select" | "multi-select" | "text" | "number" | "currency" | "percent"
  | "date" | "email" | "phone" | "ssn_or_ein" | "ein" | "dea" | "ncpdp"
  | "routing_number" | "bank_account" | "file" | "camera" | "checkbox"
  | "toggle" | "e-sign" | "course" | "assessment" | "schedule" | "address"
  | "url" | "repeatable" | "review" | "config" | "trigger"
  | "password" | "form" | "domain" | "determination";

export type QuestionBlock =
  | "UNIVERSAL" | "SELLER_INDIVIDUAL" | "SELLER_BUSINESS" | "GROOMER"
  | "PHARMACY" | "VET_FULL" | "VET_REFERRAL" | "MANUFACTURER" | "FRANCHISE";

export interface QuestionCondition {
  questionId: string;
  equals?: string | number | boolean;
  notEquals?: string | number | boolean;
}

export interface OnboardingQuestion {
  id: string;
  block: QuestionBlock;
  /** The spec's question text, verbatim where the spec gives one. */
  label: string;
  type: AnswerType;
  allowedValues?: string[];
  /** Registry-defined value set when allowedValues is not enumerated inline. */
  valueSet?: string;
  required: boolean;
  /** The gate this question feeds. */
  gate: GateKey;
  condition?: QuestionCondition;
  conditionNote?: string;
  vendorHosted?: boolean;
  /** For UBO/rep identity entries: which U9/U10 identity scope applies. */
  identityRequirement?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  /** Date answers must be in the future (expiry dates). */
  futureDate?: boolean;
}

export const US_STATES: string[] = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
];

type Q = Omit<OnboardingQuestion, "block">;
const block = (b: QuestionBlock, qs: Q[]): OnboardingQuestion[] =>
  qs.map((q) => ({ ...q, block: b }));

// ---------------------------------------------------------------------------
// §9 Universal block (every user type, in this order)
// ---------------------------------------------------------------------------

export const UNIVERSAL: OnboardingQuestion[] = block("UNIVERSAL", [
  { id: "U1", label: "What type of account are you creating?", type: "select",
    allowedValues: ["individual_seller", "business_seller", "groomer", "pharmacy", "veterinarian", "manufacturer", "franchise"],
    required: true, gate: "G0" },
  { id: "U2", label: "What is your legal name?", type: "text",
    required: true, gate: "G3", minLength: 2, maxLength: 200 },
  { id: "U3", label: "What is your date of birth?", type: "date",
    required: true, gate: "G1" },
  { id: "U4", label: "What country do you reside in?", type: "select",
    valueSet: "ISO-3166-1 alpha-2", required: true, gate: "G0" },
  { id: "U5", label: "What is your email address?", type: "email",
    required: true, gate: "G2" },
  { id: "U6", label: "What is your mobile number?", type: "phone",
    required: true, gate: "G2" },
  { id: "U7", label: "Create a password", type: "password",
    required: true, gate: "G2", minLength: 12 },
  { id: "U8", label: "Enable two-factor authentication", type: "toggle",
    required: true, gate: "G2" },
  { id: "U9", label: "Upload a government-issued photo ID", type: "file",
    valueSet: "jpeg/png/pdf", required: true, gate: "G3", vendorHosted: true,
    identityRequirement: "applicant; for entities also authorized_rep and each_ubo (see BS9/BS10)",
    conditionNote: "Document storage via vendor; platform stores only the evidence ref + verification result (§7)." },
  { id: "U10", label: "Take a liveness selfie", type: "camera",
    required: true, gate: "G3", vendorHosted: true,
    identityRequirement: "applicant; for entities also authorized_rep and each_ubo (see BS9/BS10)",
    conditionNote: "Live capture via liveness vendor (§7)." },
  { id: "U11", label: "Do you consent to sanctions screening?", type: "checkbox",
    required: true, gate: "G5" },
]);

// ---------------------------------------------------------------------------
// §10 Seller — Individual (24)
// ---------------------------------------------------------------------------

export const SELLER_INDIVIDUAL: OnboardingQuestion[] = block("SELLER_INDIVIDUAL", [
  { id: "S1", label: "Selling as sole proprietor or registered business?", type: "select",
    allowedValues: ["sole_prop", "registered_business"], required: true, gate: "G0",
    conditionNote: "registered_business routes to the business block (BS1–BS14)." },
  { id: "S2", label: "Social Security Number or EIN", type: "ssn_or_ein",
    required: true, gate: "G9", vendorHosted: true,
    conditionNote: "Vendor hosted field only — never a platform form (§7)." },
  { id: "S3", label: "Legal tax name", type: "text",
    required: true, gate: "G9", minLength: 2, maxLength: 200 },
  { id: "S4", label: "Tax classification", type: "select",
    allowedValues: ["individual", "sole_prop", "single_member_llc", "other"],
    required: true, gate: "G9" },
  { id: "S5", label: "Complete Form W-9", type: "form",
    required: true, gate: "G9", conditionNote: "E-signature; W-9 storage." },
  { id: "S6", label: "Subject to backup withholding?", type: "select",
    allowedValues: ["yes", "no", "unknown"], required: true, gate: "G9" },
  { id: "S7", label: "Bank routing number", type: "routing_number",
    required: true, gate: "G10", vendorHosted: true,
    conditionNote: "Vendor hosted field only — never a platform form (§7)." },
  { id: "S8", label: "Bank account number", type: "bank_account",
    required: true, gate: "G10", vendorHosted: true,
    conditionNote: "Vendor hosted field only — never a platform form (§7)." },
  { id: "S9", label: "Account type", type: "select",
    allowedValues: ["checking", "savings"], required: true, gate: "G10" },
  { id: "S10", label: "Name on the bank account", type: "text",
    required: true, gate: "G10", minLength: 2, maxLength: 200 },
  { id: "S11", label: "Do you have a state seller's permit?", type: "toggle",
    required: true, gate: "G6" },
  { id: "S12", label: "State seller's permit number", type: "text",
    required: true, gate: "G6", condition: { questionId: "S11", equals: true } },
  { id: "S13", label: "States where you have economic nexus", type: "multi-select",
    allowedValues: US_STATES, required: false, gate: "G9" },
  { id: "S14", label: "Business address", type: "address",
    required: true, gate: "G9" },
  { id: "S15", label: "Business phone", type: "phone",
    required: true, gate: "G2" },
  { id: "S16", label: "Business description", type: "text",
    required: true, gate: "G13", minLength: 10, maxLength: 1000 },
  { id: "S17", label: "Accept Selling Terms of Service", type: "checkbox",
    required: true, gate: "G11" },
  { id: "S18", label: "Accept Seller Code of Conduct", type: "checkbox",
    required: true, gate: "G11" },
  { id: "S19", label: "Accept Fee Schedule", type: "checkbox",
    required: true, gate: "G11" },
  { id: "S20", label: "Accept Tax Policies", type: "checkbox",
    required: true, gate: "G11" },
  { id: "S21", label: "Accept Privacy Policy", type: "checkbox",
    required: true, gate: "G11" },
  { id: "S22", label: "Accept AI Disclosure", type: "checkbox",
    required: true, gate: "G11" },
  { id: "S23", label: "Sign Data Processing Addendum", type: "e-sign",
    required: true, gate: "G11" },
  { id: "S24", label: "Payout schedule preference", type: "select",
    allowedValues: ["weekly", "biweekly", "monthly"], required: true, gate: "G10" },
]);

// ---------------------------------------------------------------------------
// §11 Seller — Business (all of Individual, plus 14)
// ---------------------------------------------------------------------------

export const SELLER_BUSINESS: OnboardingQuestion[] = block("SELLER_BUSINESS", [
  { id: "BS1", label: "Legal business name", type: "text",
    required: true, gate: "G4", minLength: 2, maxLength: 200 },
  { id: "BS2", label: "State of incorporation", type: "select",
    allowedValues: US_STATES, required: true, gate: "G4" },
  { id: "BS3", label: "Registration number", type: "text",
    required: true, gate: "G4", conditionNote: "Format varies by state." },
  { id: "BS4", label: "Entity type", type: "select",
    allowedValues: ["LLC", "C-Corp", "S-Corp", "LP", "LLP", "Partnership", "Other"],
    required: true, gate: "G4" },
  { id: "BS5", label: "Upload Articles of Incorporation/Organization", type: "file",
    valueSet: "pdf", required: true, gate: "G4" },
  { id: "BS6", label: "Entity formation date", type: "date",
    required: true, gate: "G4" },
  { id: "BS7", label: "Upload Certificate of Good Standing", type: "file",
    valueSet: "pdf", required: false, gate: "G4",
    conditionNote: "Required if the entity formation date (BS6) is more than 180 days ago." },
  { id: "BS8", label: "Upload Operating Agreement or Bylaws", type: "file",
    valueSet: "pdf", required: true, gate: "G4" },
  { id: "BS9", label: "Beneficial owners (≥25%)", type: "repeatable",
    required: true, gate: "G4", vendorHosted: true,
    identityRequirement: "each_ubo_completes_U9_U10",
    conditionNote: "Per owner: name + DOB + address + ID. Each UBO completes U9/U10 identity via vendor hosted fields — not just the account creator (§7)." },
  { id: "BS10", label: "Controlling person", type: "repeatable",
    required: true, gate: "G4", vendorHosted: true,
    identityRequirement: "controlling_person_completes_U9_U10",
    conditionNote: "Name + DOB + address + ID; the controlling person completes U9/U10 identity via vendor hosted fields (§7)." },
  { id: "BS11", label: "Authorized representative", type: "text",
    required: true, gate: "G4",
    conditionNote: "Name. The authorized rep completes U9/U10 identity (§7)." },
  { id: "BS12", label: "Upload written authority for the representative", type: "file",
    valueSet: "pdf", required: true, gate: "G4" },
  { id: "BS13", label: "Business EIN", type: "ein",
    required: true, gate: "G9" },
  { id: "BS14", label: "Complete Form W-9 (entity)", type: "form",
    required: true, gate: "G9", conditionNote: "E-signature; W-9 storage." },
]);

// ---------------------------------------------------------------------------
// §12 Groomer (universal, plus 33 — spec ids G1..G33 namespaced GR1..GR33)
// ---------------------------------------------------------------------------

export const GROOMER: OnboardingQuestion[] = block("GROOMER", [
  { id: "GR1", label: "Do you operate as a registered business?", type: "toggle",
    required: true, gate: "G4",
    conditionNote: "true routes to the entity gate (G4 conditional: if_registered) and the business block (BS1–BS14)." },
  { id: "GR2", label: "Business license number", type: "text",
    required: true, gate: "G6", conditionNote: "Format varies." },
  { id: "GR3", label: "Upload business license", type: "file",
    valueSet: "pdf/jpeg", required: true, gate: "G6" },
  { id: "GR4", label: "Grooming certification", type: "select",
    allowedValues: ["NDGAA", "IPG", "ISCC", "none"], required: true, gate: "G6" },
  { id: "GR5", label: "Upload certification", type: "file",
    valueSet: "pdf/jpeg", required: true, gate: "G6",
    condition: { questionId: "GR4", notEquals: "none" } },
  { id: "GR6", label: "Years of grooming experience", type: "number",
    required: true, gate: "G6", min: 0, max: 60 },
  { id: "GR7", label: "One professional reference", type: "text",
    required: true, gate: "G6", conditionNote: "Name + contact." },
  { id: "GR8", label: "Upload Certificate of Insurance", type: "file",
    valueSet: "pdf", required: true, gate: "G7" },
  { id: "GR9", label: "Insurance carrier", type: "text",
    required: true, gate: "G7", minLength: 2, maxLength: 200 },
  { id: "GR10", label: "Policy number", type: "text",
    required: true, gate: "G7", conditionNote: "Format varies." },
  { id: "GR11", label: "Coverage limit per occurrence", type: "currency",
    required: true, gate: "G7", min: 1_000_000,
    conditionNote: "Floor is a POLICY value (POLICY.insuranceFloorsDollars.groomer), §7." },
  { id: "GR12", label: "Aggregate coverage limit", type: "currency",
    required: true, gate: "G7", min: 2_000_000,
    conditionNote: "Floor is a POLICY value (POLICY.insuranceFloorsDollars.groomer), §7." },
  { id: "GR13", label: "Is Portal Shop listed as additional insured?", type: "toggle",
    required: true, gate: "G7" },
  { id: "GR14", label: "Policy expiry", type: "date",
    required: true, gate: "G7", futureDate: true },
  { id: "GR15", label: "Do you operate a mobile grooming unit?", type: "toggle",
    required: true, gate: "G7",
    conditionNote: "true opens the vehicle block (GR16–GR18, GR21)." },
  { id: "GR16", label: "Vehicle registration number", type: "text",
    required: true, gate: "G7", condition: { questionId: "GR15", equals: true } },
  { id: "GR17", label: "Vehicle insurance carrier", type: "text",
    required: true, gate: "G7", condition: { questionId: "GR15", equals: true },
    minLength: 2, maxLength: 200 },
  { id: "GR18", label: "Vehicle insurance policy number", type: "text",
    required: true, gate: "G7", condition: { questionId: "GR15", equals: true } },
  { id: "GR19", label: "Consent to a background check", type: "checkbox",
    required: true, gate: "G8" },
  { id: "GR20", label: "Services offered", type: "multi-select",
    allowedValues: ["full_groom", "bath_brush", "nails", "de-shed", "flea_treatment", "medicated_bath", "other"],
    required: true, gate: "G14" },
  { id: "GR21", label: "Service radius (mobile)", type: "number",
    required: true, gate: "G14", condition: { questionId: "GR15", equals: true },
    conditionNote: "Miles." },
  { id: "GR22", label: "Service area", type: "repeatable",
    required: true, gate: "G14", conditionNote: "Address list: cities / zip codes." },
  { id: "GR23", label: "Sign Independent Contractor Agreement", type: "e-sign",
    required: true, gate: "G11" },
  { id: "GR24", label: "Sign Grooming Services Waiver & Liability", type: "e-sign",
    required: true, gate: "G11" },
  { id: "GR25", label: "Sign Service Level Agreement", type: "e-sign",
    required: true, gate: "G11" },
  { id: "GR26", label: "Sign Non-Disclosure Agreement", type: "e-sign",
    required: true, gate: "G11" },
  { id: "GR27", label: "Accept Code of Conduct", type: "checkbox",
    required: true, gate: "G11" },
  { id: "GR28", label: "Accept Incident Reporting Obligations", type: "checkbox",
    required: true, gate: "G11" },
  { id: "GR29", label: "Complete LMS: Grooming Safety", type: "course",
    required: true, gate: "G12", conditionNote: "100% completion." },
  { id: "GR30", label: "Complete LMS: Matted Coat Protocol", type: "course",
    required: true, gate: "G12", conditionNote: "100% completion." },
  { id: "GR31", label: "Complete LMS: Vaccination Requirements", type: "course",
    required: true, gate: "G12", conditionNote: "100% completion." },
  { id: "GR32", label: "Complete LMS: Incident Reporting", type: "course",
    required: true, gate: "G12", conditionNote: "100% completion." },
  { id: "GR33", label: "Pass knowledge check", type: "assessment",
    required: true, gate: "G12", min: 80, conditionNote: "Pass at ≥ 80%." },
]);

// ---------------------------------------------------------------------------
// §13 Pharmacy (universal + BS1–BS14, plus P1–P18 and P32–P45).
// P19–P31 are the LATER-PHASE due-diligence survey (§5) — NOT included.
// ---------------------------------------------------------------------------

export const PHARMACY: OnboardingQuestion[] = block("PHARMACY", [
  { id: "P1", label: "NCPDP number", type: "ncpdp",
    required: true, gate: "G6", conditionNote: "7 digits; NCPDP registry lookup." },
  { id: "P2", label: "State pharmacy license number", type: "text",
    required: true, gate: "G6", conditionNote: "Format varies; State Board lookup." },
  { id: "P3", label: "Upload state pharmacy license", type: "file",
    valueSet: "pdf", required: true, gate: "G6" },
  { id: "P4", label: "License expiry", type: "date",
    required: true, gate: "G6", futureDate: true },
  { id: "P5", label: "Do you ship across state lines?", type: "toggle",
    required: true, gate: "G6",
    conditionNote: "true opens the non-resident license block (P6)." },
  { id: "P6", label: "States where you hold non-resident licenses", type: "multi-select",
    allowedValues: US_STATES, required: true, gate: "G6",
    condition: { questionId: "P5", equals: true } },
  { id: "P7", label: "DEA registration number", type: "dea",
    required: true, gate: "G6",
    conditionNote: "9 chars; DEA registry. Phase 1: required only if controlled substances are enabled (§5)." },
  { id: "P8", label: "DEA registration type", type: "select",
    allowedValues: ["retail", "hospital", "online"], required: true, gate: "G6",
    conditionNote: "Phase 1: only if controlled substances are enabled (§5)." },
  { id: "P9", label: "DEA registration expiry", type: "date",
    required: true, gate: "G6", futureDate: true,
    conditionNote: "Phase 1: only if controlled substances are enabled (§5)." },
  { id: "P10", label: "DEA internet modification?", type: "toggle",
    required: true, gate: "G6", conditionNote: "Controlled substance gate." },
  { id: "P11", label: "Pharmacist-in-Charge name", type: "text",
    required: true, gate: "G6", minLength: 2, maxLength: 200,
    conditionNote: "PIC verification. PIC background checks (G8) arrive with multi-pharmacy opening (§5 later phase)." },
  { id: "P12", label: "PIC license number", type: "text",
    required: true, gate: "G6", conditionNote: "Format varies." },
  { id: "P13", label: "Upload PIC license", type: "file",
    valueSet: "pdf", required: true, gate: "G6" },
  { id: "P14", label: "PIC date of birth", type: "date",
    required: true, gate: "G6" },
  { id: "P15", label: "PIC contact email", type: "email",
    required: true, gate: "G6" },
  { id: "P16", label: "PIC contact phone", type: "phone",
    required: true, gate: "G6" },
  { id: "P17", label: "Years in operation", type: "number",
    required: true, gate: "G13", min: 0, max: 200 },
  { id: "P18", label: "Average prescriptions filled per day", type: "number",
    required: true, gate: "G13", min: 0, max: 10000 },
  { id: "P32", label: "Consent to periodic site visits", type: "toggle",
    required: true, gate: "G11" },
  { id: "P33", label: "Upload professional liability COI", type: "file",
    valueSet: "pdf", required: true, gate: "G7" },
  { id: "P34", label: "Upload general liability COI", type: "file",
    valueSet: "pdf", required: true, gate: "G7" },
  { id: "P35", label: "Upload workers compensation COI", type: "file",
    valueSet: "pdf", required: false, gate: "G7",
    conditionNote: "If the pharmacy has employees." },
  { id: "P36", label: "Do you have a surety bond?", type: "toggle",
    required: true, gate: "G7" },
  { id: "P37", label: "Upload surety bond", type: "file",
    valueSet: "pdf", required: true, gate: "G7",
    condition: { questionId: "P36", equals: true } },
  { id: "P38", label: "Sign Pharmacy Partner Terms", type: "e-sign",
    required: true, gate: "G11" },
  { id: "P39", label: "Sign Prescription Fulfillment Standards", type: "e-sign",
    required: true, gate: "G11" },
  { id: "P40", label: "Sign Controlled Substances Policy", type: "e-sign",
    required: true, gate: "G11" },
  { id: "P41", label: "Sign Non-Circumvention Agreement", type: "e-sign",
    required: true, gate: "G11" },
  { id: "P42", label: "Sign Liability Allocation Matrix", type: "e-sign",
    required: true, gate: "G11" },
  { id: "P43", label: "Complete LMS: Pharmacy Standards", type: "course",
    required: false, gate: "G12", conditionNote: "100% completion. G12 is optional for pharmacy (§3)." },
  { id: "P44", label: "Complete LMS: Controlled Substances", type: "course",
    required: false, gate: "G12", conditionNote: "100% completion. G12 is optional for pharmacy (§3)." },
  { id: "P45", label: "Complete LMS: Prescription Fulfillment", type: "course",
    required: false, gate: "G12", conditionNote: "100% completion. G12 is optional for pharmacy (§3)." },
]);

// ---------------------------------------------------------------------------
// §14 Veterinarian — full path (V1–V34). The state-eligibility step sits
// AFTER V1 and BEFORE V2 onward (§4): each state in V1 is looked up in
// state_rules; eligible states continue here, others route to the
// referral-only block. NO NPI / USDA questions exist in this block (§7).
// ---------------------------------------------------------------------------

export const VET_FULL: OnboardingQuestion[] = block("VET_FULL", [
  { id: "V1", label: "States licensed in", type: "multi-select",
    allowedValues: US_STATES, required: true, gate: "G6",
    conditionNote: "Branch decision: each state is looked up in state_rules (telemedicine_vcpr_allowed) BEFORE V2 onward (§4)." },
  { id: "V2", label: "Per state: license number", type: "repeatable",
    required: true, gate: "G6",
    conditionNote: "Repeatable: one entry per state listed in V1." },
  { id: "V3", label: "Per state: license expiration", type: "repeatable",
    required: true, gate: "G6",
    conditionNote: "Repeatable: one date per state listed in V1; feeds renewal tracking + the capabilities rows (§4)." },
  { id: "V4", label: "Per state: license type", type: "repeatable",
    required: true, gate: "G6",
    conditionNote: "Repeatable: one select value per state listed in V1." },
  { id: "V5", label: "Primary state of practice", type: "select",
    required: true, gate: "G6",
    conditionNote: "Value must be one of the states listed in V1 (dynamic allowed values)." },
  { id: "V6", label: "Practice type", type: "select",
    allowedValues: ["solo", "clinic", "hospital", "mobile"], required: true, gate: "G6" },
  { id: "V7", label: "Years of clinical experience", type: "number",
    required: true, gate: "G6", min: 0, max: 60 },
  { id: "V8", label: "One professional reference", type: "text",
    required: true, gate: "G8", conditionNote: "Name + contact." },
  { id: "V9", label: "Telemedicine experience?", type: "toggle",
    required: true, gate: "G6" },
  { id: "V10", label: "DEA registration?", type: "toggle",
    required: true, gate: "G6",
    conditionNote: "true opens the DEA block (V11–V12)." },
  { id: "V11", label: "DEA registration number", type: "dea",
    required: true, gate: "G6", condition: { questionId: "V10", equals: true },
    conditionNote: "9 chars; DEA registry lookup." },
  { id: "V12", label: "DEA registration expiration", type: "date",
    required: true, gate: "G6", futureDate: true,
    condition: { questionId: "V10", equals: true } },
  { id: "V13", label: "Consent to criminal background check", type: "checkbox",
    required: true, gate: "G8" },
  { id: "V14", label: "Consent to state board disciplinary lookup", type: "checkbox",
    required: true, gate: "G8" },
  { id: "V15", label: "Consent to AAVSB VIVA verification", type: "checkbox",
    required: true, gate: "G8" },
  { id: "V16", label: "Upload professional liability COI", type: "file",
    valueSet: "pdf", required: true, gate: "G7" },
  { id: "V17", label: "Insurance carrier", type: "text",
    required: true, gate: "G7", minLength: 2, maxLength: 200 },
  { id: "V18", label: "Policy number", type: "text",
    required: true, gate: "G7", conditionNote: "Format varies." },
  { id: "V19", label: "Coverage per occurrence", type: "currency",
    required: true, gate: "G7", min: 1_000_000 },
  { id: "V20", label: "Aggregate coverage", type: "currency",
    required: true, gate: "G7", min: 3_000_000,
    conditionNote: "Floor is a POLICY value (POLICY.insuranceFloorsDollars.veterinarian) — confirm intentional (§7)." },
  { id: "V21", label: "Portal Shop listed as additional insured?", type: "toggle",
    required: true, gate: "G7" },
  { id: "V22", label: "Policy expiration", type: "date",
    required: true, gate: "G7", futureDate: true },
  { id: "V23", label: "Sign VCPR Acknowledgment", type: "e-sign",
    required: true, gate: "G11" },
  { id: "V24", label: "Sign Clinical Standards Agreement", type: "e-sign",
    required: true, gate: "G11" },
  { id: "V25", label: "Sign Prescribing Limits Agreement", type: "e-sign",
    required: true, gate: "G11" },
  { id: "V26", label: "Sign Telemedicine Scope Agreement", type: "e-sign",
    required: true, gate: "G11" },
  { id: "V27", label: "Sign Controlled Substance Limits", type: "e-sign",
    required: true, gate: "G11" },
  { id: "V28", label: "Sign Medical Records Standards", type: "e-sign",
    required: true, gate: "G11" },
  { id: "V29", label: "Sign Emergency Escalation Protocol", type: "e-sign",
    required: true, gate: "G11" },
  { id: "V30", label: "Acknowledge Compensation Terms", type: "checkbox",
    required: true, gate: "G11" },
  { id: "V31", label: "Employment classification", type: "determination",
    required: false, gate: "G13",
    conditionNote: "NOT an acknowledgment (§7): the platform records its determination + basis in case metadata.determinations[] (kind 'employment_classification') via recordDetermination(). The applicant never answers this." },
  { id: "V32", label: "Complete LMS: Telemedicine Standards", type: "course",
    required: true, gate: "G12", conditionNote: "100% completion." },
  { id: "V33", label: "Complete LMS: VCPR Establishment", type: "course",
    required: true, gate: "G12", conditionNote: "100% completion." },
  { id: "V34", label: "Complete LMS: AI Tele-Triage Escalation", type: "course",
    required: true, gate: "G12", conditionNote: "100% completion." },
]);

// ---------------------------------------------------------------------------
// §14 Veterinarian — referral-only path (VR1–VR15), for states where V1
// returns only referral eligibility.
// ---------------------------------------------------------------------------

export const VET_REFERRAL: OnboardingQuestion[] = block("VET_REFERRAL", [
  { id: "VR1", label: "Practice name", type: "text",
    required: true, gate: "G14", minLength: 2, maxLength: 200 },
  { id: "VR2", label: "Practice address", type: "address",
    required: true, gate: "G14" },
  { id: "VR3", label: "Practice phone", type: "phone",
    required: true, gate: "G14" },
  { id: "VR4", label: "Practice website", type: "url",
    required: true, gate: "G14" },
  { id: "VR5", label: "Services offered", type: "multi-select",
    allowedValues: ["wellness", "surgery", "dentistry", "emergency", "specialty", "other"],
    required: true, gate: "G14" },
  { id: "VR6", label: "Hours of operation", type: "schedule",
    required: true, gate: "G14", conditionNote: "Weekly hours." },
  { id: "VR7", label: "Emergency services?", type: "toggle",
    required: true, gate: "G14" },
  { id: "VR8", label: "Accepting new patients?", type: "toggle",
    required: true, gate: "G14" },
  { id: "VR9", label: "Preferred contact method for referrals", type: "select",
    allowedValues: ["email", "phone", "portal"], required: true, gate: "G14" },
  { id: "VR10", label: "Referral notification email", type: "email",
    required: true, gate: "G14" },
  { id: "VR11", label: "Referral notification phone", type: "phone",
    required: true, gate: "G14" },
  { id: "VR12", label: "Referral acceptance SLA", type: "select",
    allowedValues: ["1h", "4h", "24h", "48h"], required: true, gate: "G14" },
  { id: "VR13", label: "Notify when my state opens for telemedicine?", type: "toggle",
    required: true, gate: "G14", conditionNote: "Waitlist (§4 state-opening job)." },
  { id: "VR14", label: "Consent to be listed in the referral directory", type: "checkbox",
    required: true, gate: "G11" },
  { id: "VR15", label: "Approve your directory listing content", type: "review",
    required: true, gate: "G13", conditionNote: "Approve/edit — manual approval step." },
]);

// ---------------------------------------------------------------------------
// §15 Manufacturer / Supplier (universal + BS1–BS14, plus 32)
// ---------------------------------------------------------------------------

export const MANUFACTURER: OnboardingQuestion[] = block("MANUFACTURER", [
  { id: "M1", label: "Primary product category", type: "select",
    allowedValues: ["pet_food", "treats", "supplements", "toys", "accessories", "grooming", "healthcare", "other"],
    required: true, gate: "G6" },
  { id: "M2", label: "Products manufactured", type: "repeatable",
    required: true, gate: "G6",
    conditionNote: "Repeatable: product name + category + GTIN per entry; GTIN check digit validated (validate.ts reuses the catalog spec's GTIN check)." },
  { id: "M3", label: "FDA registration?", type: "toggle",
    required: true, gate: "G6", conditionNote: "true opens the FDA block (M4)." },
  { id: "M4", label: "FDA registration number", type: "text",
    required: true, gate: "G6", condition: { questionId: "M3", equals: true } },
  { id: "M5", label: "CPSC certification?", type: "toggle",
    required: true, gate: "G6", conditionNote: "true opens the CPSC block (M6)." },
  { id: "M6", label: "CPSC certification number", type: "text",
    required: true, gate: "G6", condition: { questionId: "M5", equals: true } },
  { id: "M7", label: "USDA certification?", type: "toggle",
    required: true, gate: "G6", conditionNote: "true opens the USDA block (M8)." },
  { id: "M8", label: "USDA certification number", type: "text",
    required: true, gate: "G6", condition: { questionId: "M7", equals: true } },
  { id: "M9", label: "Upload product safety certifications", type: "file",
    valueSet: "pdf", required: true, gate: "G6" },
  { id: "M10", label: "Upload ingredient disclosure per product", type: "file",
    valueSet: "pdf/csv", required: true, gate: "G6" },
  { id: "M11", label: "Upload MSDS (per product, if applicable)", type: "file",
    valueSet: "pdf", required: false, gate: "G6" },
  { id: "M12", label: "Country of origin per product", type: "repeatable",
    valueSet: "ISO-3166", required: true, gate: "G6" },
  { id: "M13", label: "Any products contain restricted materials?", type: "toggle",
    required: true, gate: "G6", conditionNote: "true opens the restrictions block (M14)." },
  { id: "M14", label: "List restricted materials", type: "repeatable",
    required: true, gate: "G6", condition: { questionId: "M13", equals: true },
    conditionNote: "Per material: name + DEA/EPA/state class." },
  { id: "M15", label: "Marketing materials contain claims?", type: "toggle",
    required: true, gate: "G6", conditionNote: "true opens claims review (M16)." },
  { id: "M16", label: "Upload marketing materials for review", type: "file",
    valueSet: "pdf", required: true, gate: "G6",
    condition: { questionId: "M15", equals: true } },
  { id: "M17", label: "Quality Management System?", type: "toggle",
    required: true, gate: "G6", conditionNote: "true opens the QMS block (M18–M19)." },
  { id: "M18", label: "QMS certification", type: "select",
    allowedValues: ["ISO_9001", "cGMP", "other", "none"], required: true, gate: "G6" },
  { id: "M19", label: "Upload QMS certificate", type: "file",
    valueSet: "pdf", required: true, gate: "G6",
    condition: { questionId: "M17", equals: true } },
  { id: "M20", label: "Manufacturing facilities registered?", type: "toggle",
    required: true, gate: "G6", conditionNote: "true opens the facility block (M21)." },
  { id: "M21", label: "Facility registration number(s)", type: "repeatable",
    required: true, gate: "G6", condition: { questionId: "M20", equals: true } },
  { id: "M22", label: "Acknowledge audit rights", type: "checkbox",
    required: true, gate: "G11" },
  { id: "M23", label: "Acknowledge chain of custody documentation", type: "checkbox",
    required: true, gate: "G11" },
  { id: "M24", label: "Acknowledge recall coordination", type: "checkbox",
    required: true, gate: "G11" },
  { id: "M25", label: "Upload product liability COI", type: "file",
    valueSet: "pdf", required: true, gate: "G7" },
  { id: "M26", label: "Product liability coverage limit", type: "currency",
    required: true, gate: "G7", min: 1_000_000,
    conditionNote: "Floor is a POLICY value (POLICY.insuranceFloorsDollars.manufacturer)." },
  { id: "M27", label: "Upload general liability COI", type: "file",
    valueSet: "pdf", required: true, gate: "G7" },
  { id: "M28", label: "General liability coverage limit", type: "currency",
    required: true, gate: "G7", min: 1_000_000,
    conditionNote: "Floor is a POLICY value (POLICY.insuranceFloorsDollars.manufacturer)." },
  { id: "M29", label: "Sign Manufacturer Terms", type: "e-sign",
    required: true, gate: "G11" },
  { id: "M30", label: "Sign Product Data Standards", type: "checkbox",
    required: true, gate: "G11", conditionNote: "Recorded as a checkbox acceptance in the spec table." },
  { id: "M31", label: "Sign Warranty Obligations", type: "e-sign",
    required: true, gate: "G11" },
  { id: "M32", label: "Sign Data Processing Addendum", type: "e-sign",
    required: true, gate: "G11" },
]);

// ---------------------------------------------------------------------------
// §16 Franchise (universal + BS1–BS14, plus 25)
// ---------------------------------------------------------------------------

export const FRANCHISE: OnboardingQuestion[] = block("FRANCHISE", [
  { id: "F1", label: "How many locations are you opening?", type: "number",
    required: true, gate: "G0", min: 1, max: 1000,
    conditionNote: "Branch: 1 → seller path; >1 → franchise path." },
  { id: "F2", label: "Received the Franchise Disclosure Document?", type: "checkbox",
    required: true, gate: "G11" },
  { id: "F3", label: "FDD receipt date", type: "date",
    required: true, gate: "G11", conditionNote: "Any past date." },
  { id: "F4", label: "Upload signed Franchise Agreement", type: "file",
    valueSet: "pdf", required: true, gate: "G11" },
  { id: "F5", label: "Defined territory", type: "text",
    required: true, gate: "G11", minLength: 10, maxLength: 2000 },
  { id: "F6", label: "Upload territory schedule", type: "file",
    valueSet: "pdf", required: true, gate: "G11" },
  { id: "F7", label: "Acknowledge royalty terms", type: "checkbox",
    required: true, gate: "G11" },
  { id: "F8", label: "Acknowledge marketing fund terms", type: "checkbox",
    required: true, gate: "G11" },
  { id: "F9", label: "Acknowledge term & renewal terms", type: "checkbox",
    required: true, gate: "G11" },
  { id: "F10", label: "Acknowledge termination terms", type: "checkbox",
    required: true, gate: "G11" },
  { id: "F11", label: "List all planned locations", type: "repeatable",
    required: true, gate: "G6",
    conditionNote: "Repeatable: one address per planned location (count from F1)." },
  { id: "F12", label: "Per location: state license number", type: "repeatable",
    required: true, gate: "G6", conditionNote: "One entry per location in F11." },
  { id: "F13", label: "Per location: upload license", type: "repeatable",
    valueSet: "pdf", required: true, gate: "G6",
    conditionNote: "One entry per location in F11." },
  { id: "F14", label: "Per location: upload insurance COI", type: "repeatable",
    valueSet: "pdf", required: true, gate: "G7",
    conditionNote: "One entry per location in F11." },
  { id: "F15", label: "Per location: operating hours", type: "repeatable",
    required: true, gate: "G14", conditionNote: "Weekly hours per location in F11." },
  { id: "F16", label: "Per location: holiday blackouts", type: "repeatable",
    required: false, gate: "G14", conditionNote: "Date list per location in F11." },
  { id: "F17", label: "Per location: branding compliance acknowledgment", type: "repeatable",
    required: true, gate: "G11", conditionNote: "Checkbox per location in F11." },
  { id: "F18", label: "Opt in to shared catalog?", type: "toggle",
    required: true, gate: "G14" },
  { id: "F19", label: "Opt in to shared inventory?", type: "toggle",
    required: true, gate: "G14" },
  { id: "F20", label: "Opt in to shared pricing rules?", type: "toggle",
    required: true, gate: "G14" },
  { id: "F21", label: "Opt in to shared promotions?", type: "toggle",
    required: true, gate: "G14" },
  { id: "F22", label: "Resend API key", type: "text",
    required: true, gate: "G14", conditionNote: "Email setup: API key format (value held by the email vendor config, not stored as a secret here)." },
  { id: "F23", label: "Sender domain", type: "domain",
    required: true, gate: "G14" },
  { id: "F24", label: "Email templates configuration", type: "config",
    required: true, gate: "G14", conditionNote: "Template set." },
  { id: "F25", label: "Test email delivery", type: "trigger",
    required: true, gate: "G14", conditionNote: "System action: delivery confirm." },
]);

// ---------------------------------------------------------------------------
// Block registry + which blocks each type answers
// ---------------------------------------------------------------------------

export const QUESTIONS_BY_BLOCK: Record<QuestionBlock, OnboardingQuestion[]> = {
  UNIVERSAL,
  SELLER_INDIVIDUAL,
  SELLER_BUSINESS,
  GROOMER,
  PHARMACY,
  VET_FULL,
  VET_REFERRAL,
  MANUFACTURER,
  FRANCHISE,
};

export const ALL_QUESTIONS: OnboardingQuestion[] = [
  ...UNIVERSAL, ...SELLER_INDIVIDUAL, ...SELLER_BUSINESS, ...GROOMER,
  ...PHARMACY, ...VET_FULL, ...VET_REFERRAL, ...MANUFACTURER, ...FRANCHISE,
];

export const QUESTION_BY_ID: Record<string, OnboardingQuestion> = Object.fromEntries(
  ALL_QUESTIONS.map((q) => [q.id, q]),
);

/**
 * Which blocks each type answers. Veterinarian defaults to the full path;
 * the referral block replaces VET_FULL when state eligibility (V1 +
 * state_rules, §4) routes the vet to referral-only — see
 * questionsForType(type, { vetPath: "referral" }).
 */
export const QUESTIONS_BY_TYPE: Record<ApplicantType, QuestionBlock[]> = {
  individual_seller: ["UNIVERSAL", "SELLER_INDIVIDUAL"],
  business_seller: ["UNIVERSAL", "SELLER_INDIVIDUAL", "SELLER_BUSINESS"],
  groomer: ["UNIVERSAL", "GROOMER"],
  pharmacy: ["UNIVERSAL", "SELLER_BUSINESS", "PHARMACY"],
  veterinarian: ["UNIVERSAL", "VET_FULL"],
  manufacturer: ["UNIVERSAL", "SELLER_BUSINESS", "MANUFACTURER"],
  franchise: ["UNIVERSAL", "SELLER_BUSINESS", "FRANCHISE"],
};

/** Blocks a type answers only when a condition holds. */
export const CONDITIONAL_BLOCKS: {
  type: ApplicantType;
  block: QuestionBlock;
  condition: QuestionCondition;
  note: string;
}[] = [
  {
    type: "groomer",
    block: "SELLER_BUSINESS",
    condition: { questionId: "GR1", equals: true },
    note: "Groomers who operate as a registered business (GR1) also answer the business block and run gate G4 (§12: universal + GR, plus BS if registered).",
  },
];

export function questionsForType(
  type: ApplicantType,
  opts?: { vetPath?: "full" | "referral"; includeConditionalBlocks?: boolean },
): OnboardingQuestion[] {
  let blocks = [...QUESTIONS_BY_TYPE[type]];
  if (type === "veterinarian" && opts?.vetPath === "referral") {
    blocks = blocks.map((b) => (b === "VET_FULL" ? "VET_REFERRAL" : b));
  }
  if (opts?.includeConditionalBlocks) {
    for (const cb of CONDITIONAL_BLOCKS) {
      if (cb.type === type && !blocks.includes(cb.block)) blocks.push(cb.block);
    }
  }
  return blocks.flatMap((b) => QUESTIONS_BY_BLOCK[b]);
}
