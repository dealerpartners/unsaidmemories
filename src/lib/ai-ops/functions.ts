// ---------------------------------------------------------------------------
// ai-ops/functions.ts — the AI Ops FUNCTION registry (Admin §J, defined by
// Sunny, 2026-10-14: "ai ops is support, onboarding checking dmca, checking
// brand opt outs replying to chat messages, prodct descriptions, reviews"
// — and expanded the same day: "it lives in every surface teaching
// learning, booking telemedicine referring to partners where vcpr is
// banned sending nightly reports and totals Front door motion, Formulary
// and ingestion for dogs an cats triage support … its integrated in evry
// suyrface").
//
// AI is not a module in this platform — it is a cross-cutting layer, and
// §J is that layer's operations/governance home. Each function below is a
// real presence point of the layer: a surface where AI checks, proposes,
// drafts, teaches, routes, or converses. The record of that work is a
// public.ai_tasks row (function + subject + input + output + state). The
// consequential act always belongs to a human at the function's desk —
// the gate statement on each entry is the rule the surfaces print.
//
// Kinnect's six contexts (Shop · Book · Tele-triage · Telemedicine ·
// Learn · Manage) are the surface taxonomy for the conversational
// functions; the desk functions name their desks. Where a surface's AI
// presence is genuinely absent or lives on another lineage, the entry's
// copy says so — the registry records honest state, never invention.
//
// The per-function prompt configuration rides public.ai_prompts with
// feature = the function key (v1 records seeded 2026-10-14, status
// draft: real instructions for the desk functions and the nightly-report
// definition; documented slots where the runtime carries its own prompts
// today). Task states: proposed (born) → applied | dismissed | recorded —
// the decision is stamped (decided_by / decided_at) by the human.
// ---------------------------------------------------------------------------

export interface AiFunctionDef {
  key: string;
  label: string;
  surface: string;
  subjects: string[];
  subjectRequired: boolean;
  gate: string;
  blurb: string;
}

export const AI_FUNCTIONS: AiFunctionDef[] = [
  {
    key: "front_door",
    label: "Front door",
    surface: "Kinnect · Shop",
    subjects: ["chat_session"],
    subjectRequired: false,
    gate: "The shop front door: Kinnect opens with real product picks from the live catalog. It suggests; the shopper's own actions (cart, checkout) are theirs alone.",
    blurb: "Kinnect on open at the shop's front door — greeting + real product picks (the drawer-open path in /api/kinnect/chat), then Shop-context conversation.",
  },
  {
    key: "booking_assist",
    label: "Booking",
    surface: "Kinnect · Book",
    subjects: ["chat_session"],
    subjectRequired: false,
    gate: "Booking itself is the funnel's own flow (the wizard's steps and the tenant's deposit rules). The AI assists in conversation; it never books, charges, or changes an appointment itself.",
    blurb: "Booking assistance in Kinnect's Book context. No AI call exists inside the booking funnel's own code — the presence is the conversational layer over it.",
  },
  {
    key: "tele_triage",
    label: "Tele-triage",
    surface: "Kinnect · Tele-triage",
    subjects: ["triage_session"],
    subjectRequired: true,
    gate: "Triage hands off, it does not diagnose: EMERGENCY routes to finding an emergency vet near the owner, lower urgency to Book a Dr (crisis routing Phase 1). The recorded urgency is the AI's proposal; the handoff rules govern what happens next.",
    blurb: "The triage-chat edge function + triage_sessions (the store records ai_urgency, ai_recommendation, ai_model and the knowledge documents retrieved per session).",
  },
  {
    key: "telemedicine_assist",
    label: "Telemedicine",
    surface: "Kinnect · Telemedicine",
    subjects: ["chat_session"],
    subjectRequired: false,
    gate: "Consults, prescriptions, and VCPR acts belong to licensed veterinarians in the telemedicine portal. The AI assists and records; it does not practice veterinary medicine.",
    blurb: "Telemedicine-context assistance: consult preparation and navigation toward the telemedicine portal's human surfaces.",
  },
  {
    key: "vcpr_referral",
    label: "Referring to partners (VCPR-barred)",
    surface: "Telemedicine · referrals",
    subjects: ["triage_session", "vet_lead"],
    subjectRequired: true,
    gate: "Where a state's rules bar virtual VCPR (state_vcpr_rules: 40 of 51 states), the owner is routed to directory/partner practices instead of a virtual consult. Routing is recorded; recruiting and partner decisions are human.",
    blurb: "Referral routing to the vet_referrals directory (69 practices) and the free-leads loop on vet_leads — the AI routes demand it may not serve virtually.",
  },
  {
    key: "classroom",
    label: "Teaching / learning",
    surface: "Kinnect · Learn — the shared classroom canvas",
    subjects: [],
    subjectRequired: false,
    gate: "The classroom AI teaches and assists inside the one shared canvas (customers electing courses, employees on mandated training — the same surface). Course publishing and progress decisions stay with the LMS's human flows.",
    blurb: "The lib/ai router (ZAI default, Gemini when configured) behind the professor / day / course-architect call sites, every call logged to ai_invocations. The lms schema carries its own AI observability stores (ai_usage_tracking and family).",
  },
  {
    key: "formulary",
    label: "Formulary & ingestion knowledge",
    surface: "Telemedicine · knowledge layer",
    subjects: [],
    subjectRequired: false,
    gate: "vet_knowledge_base is recorded knowledge, authored and sourced (8 active entries for dogs and cats — emergencies, toxin ingestion, triage categories). It informs triage through the deployed edge function (sessions record the documents retrieved). Clinical content changes are authored acts, never AI self-edits.",
    blurb: "The medication/clinical knowledge layer behind triage and telemedicine. The store is live and populated; no code in this repo reads it — its consumer is the deployed triage-chat edge function.",
  },
  {
    key: "nightly_report",
    label: "Nightly reports & totals",
    surface: "Platform · nightly operations",
    subjects: [],
    subjectRequired: false,
    gate: "The report DEFINITION is recorded as this function's prompt record; each produced report is recorded as a task. Unattended execution rides the platform scheduler — no cron exists for it yet, exactly the §I scheduled-exports position: recorded intent, named, never faked.",
    blurb: "An AI-generated nightly operations report (orders and totals, bookings, queues, AI usage) — definition + records are the build; the schedule is intent until the scheduler question is answered.",
  },
  {
    key: "manage_assist",
    label: "Manage",
    surface: "Kinnect · Manage",
    subjects: ["chat_session"],
    subjectRequired: false,
    gate: "Account assistance happens in conversation; changes to an account, records, or pets happen through the portal's own flows, never by the AI directly.",
    blurb: "Kinnect's Manage context — assistance over the customer's own account and records.",
  },
  {
    key: "support_reply",
    label: "Support — reply drafts",
    surface: "Support desk",
    subjects: ["support_ticket"],
    subjectRequired: true,
    gate: "Support agents review, edit, and send from the desk. A draft changes nothing until an agent sends it.",
    blurb: "AI-drafted replies riding support tickets, proposed to the agent handling the ticket.",
  },
  {
    key: "onboarding_check",
    label: "Onboarding checking",
    surface: "Admin · verification desk",
    subjects: ["seller_application", "verification_task"],
    subjectRequired: true,
    gate: "The verification desk decides applications and verification tasks. A check records findings only.",
    blurb: "Completeness and consistency checks recorded against seller applications and verification tasks.",
  },
  {
    key: "dmca_check",
    label: "DMCA checking",
    surface: "Support desk · DMCA path",
    subjects: ["support_ticket"],
    subjectRequired: true,
    gate: "The support desk decides claim outcomes. Support never suspends a seller; governance cases are separate.",
    blurb: "Required-element checks recorded against DMCA claims filed as desk tickets.",
  },
  {
    key: "brand_optout_check",
    label: "Brand opt-out checking",
    surface: "Admin · brand registry queue (B4)",
    subjects: ["brand_opt_out"],
    subjectRequired: true,
    gate: "The brand registry queue verifies and applies opt-outs. A check records element findings only.",
    blurb: "Claim-element verification results recorded on brand opt-out claims in the B4 queue.",
  },
  {
    key: "chat_reply",
    label: "Chat replies",
    surface: "Kinnect chat + support chat",
    subjects: ["chat_session"],
    subjectRequired: false,
    gate: "Kinnect replies are generated live by the gateway/router provider path; this registry is the function's record. Support-chat drafts ride the Support function.",
    blurb: "The Kinnect chat-reply function: vercel-ai-gateway (kinnect_chat, kinnect_product_pick, kinnect_grounding) and the lib/ai router for the classroom.",
  },
  {
    key: "product_description",
    label: "Product descriptions",
    surface: "Admin · catalog review (B1)",
    subjects: ["catalog_item"],
    subjectRequired: true,
    gate: "Catalog review (B1) decides what publishes. A description draft never publishes directly.",
    blurb: "AI-drafted catalog descriptions feeding the B1 catalog review gate.",
  },
  {
    key: "review_moderation",
    label: "Reviews",
    surface: "Storefront · product reviews",
    subjects: ["review"],
    subjectRequired: true,
    gate: "A human moderator decides the review's state. A check records signals and a recommendation only.",
    blurb: "Moderation and analysis checks recorded against customer product reviews.",
  },
  {
    key: "fraud_scan",
    label: "Fraud scanner (operator)",
    surface: "Admin · AI Ops operator",
    subjects: ["seller", "order", "refund", "dispute", "listing", "reviewer", "scan_run"],
    subjectRequired: false,
    gate: "Detections are proposals with their evidence and the policy they cite. A human applies each response — open case, freeze payout, notify, temporary suspension — and consequential responses refuse without a cited policy and a reason.",
    blurb: "The operator's scanner pass over recorded facts: fraud-coded refunds, open disputes, SLA/stuck orders, repeat DMCA subjects (3 strikes → governance case), listings under applied brand opt-outs, review bursts, seller risk composites. Deterministic evaluation in src/lib/ai-ops/operator.ts; the model-judgment seam rides each record.",
  },
  {
    key: "directed_action",
    label: "Directed actions (operator)",
    surface: "Admin · AI Ops operator",
    subjects: ["taxonomy_node", "seller"],
    subjectRequired: false,
    gate: "A click executes a governed act: its input, output, citation, and audit id are recorded on the task. Consequential acts refuse without a cited policy and a reason.",
    blurb: "Click-to-do from the operator surface: build a category + subcategory on the canonical taxonomy, and the acts aimed from a high-risk seller's file (open case, temporary suspension, reinstate, notify).",
  },
  {
    key: "social_watch",
    label: "Social comment watch (operator)",
    surface: "Admin · AI Ops operator — watch seat",
    subjects: [],
    subjectRequired: false,
    gate: "HONEST STATE: no social-media ingestion exists in this platform today — no connector, no store, no reader — so comments are NOT monitored. The seat is recorded and the gap named; nothing here is a feed.",
    blurb: "The watch seat for social-media comments, beside the live review watch (review bursts are scanner signals). Not connected — ingestion is a named gap.",
  },
];

export const AI_FUNCTION_KEYS = AI_FUNCTIONS.map((f) => f.key);

export const AI_TASK_STATES = ["proposed", "applied", "dismissed", "recorded"] as const;
export const AI_TASK_DECISIONS = ["applied", "dismissed", "recorded"] as const;

export function aiFunction(key: string): AiFunctionDef | null {
  return AI_FUNCTIONS.find((f) => f.key === key) ?? null;
}
