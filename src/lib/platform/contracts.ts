/**
 * Platform contracts — the shared type surface of the §0 primitives.
 *
 * The 11 primitives live in `src/components/platform/` (built once,
 * inherited everywhere). This file is the contract layer adopters code
 * against: it re-exports each primitive's own types from one place and
 * defines the cross-cutting contracts no single component owns — the
 * record reference every verb addresses, the saved-view shape the list
 * system persists, the activity thread, the approval queue, and the
 * notification item (the platform tables named in the platform
 * definition, notes/platform-definition-2026-11-01.md §3).
 *
 * Rule: a workflow codes against these contracts, never against a
 * sibling workflow's local types. A new verb or field lands here
 * first, then in the primitive, then in the adopting workflow.
 */

// ── The primitives' own types, re-exported ─────────────────────────

export type { CreateMenuItem } from "@/components/platform/create-menu";
export type { CreateAction } from "@/components/platform/create-actions-row";
export type { RecordTab } from "@/components/platform/record-shell";
export type { ViewTab } from "@/components/platform/view-tabs";
export type {
  ListColumn,
  ListTab,
  FilterCondition,
} from "@/components/platform/list-system";
export type { FunnelStage } from "@/components/platform/overview-funnel";
export type { Task } from "@/components/platform/task-list";
export type { InsightCard } from "@/components/platform/insight-cards";
export type { IntakeItem } from "@/components/platform/intake-queue";
export type { VocabItem } from "@/components/platform/managed-vocab";
export type { PaymentOption } from "@/components/platform/payment-options-rail";
export type { Attachment } from "@/components/platform/attachment-drop-zone";
export type { Note } from "@/components/platform/notes-section";
export type { FormField } from "@/components/platform/form-customizer";
export type {
  IntervalType,
  RecurringConfig,
} from "@/components/platform/recurring-template";

import type { FilterCondition } from "@/components/platform/list-system";

// ── The verb layer ─────────────────────────────────────────────────
// Sunny's ACTIONS doctrine (2026-11-01): workflows differ by noun,
// never by verb. Every platform service is addressed by one of these.

export const PLATFORM_VERBS = [
  "create",
  "search",
  "open",
  "comment",
  "assign",
  "attach",
  "tag",
  "approve",
  "pay",
  "print_export",
  "filter_sort_save_view",
  "message",
] as const;

export type PlatformVerb = (typeof PLATFORM_VERBS)[number];

// ── Record reference ───────────────────────────────────────────────
// The one address every verb, thread, attachment, and approval uses.
// `kind` is the platform noun; `number` is the canonical display
// number where the noun carries one (party number, invoice no.).

export type RecordKind =
  | "party"
  | "product"
  | "design"
  | "order"
  | "invoice"
  | "bill"
  | "ticket"
  | "campaign"
  | "content_page"
  | "shipment"
  | "journal_entry"
  | "api_key"
  | "webhook";

export type RecordRef = {
  kind: RecordKind;
  id: string;
  number?: string;
  href: string;
};

// ── Saved views (P3) ───────────────────────────────────────────────
// What "Save view" persists: the tab, the filter conditions in the
// list system's own shape, the sort, and the visible columns.

export type SavedView = {
  id: string;
  name: string;
  recordKind: RecordKind;
  tab?: string;
  filters: FilterCondition[];
  sort?: { column: string; direction: "asc" | "desc" };
  columns?: string[];
};

// ── Activity (the one Comment thread) ──────────────────────────────
// Comments, notes, calls, and system events on ANY record, rendered
// by the same thread everywhere (P2 records, Contacts timeline).

export type ActivityEntry = {
  id: string;
  record: RecordRef;
  kind: "comment" | "note" | "call" | "email" | "event";
  author?: string;
  body: string;
  at: string; // ISO timestamp
};

// ── Approvals (the one submit → review → approve queue) ───────────

export type ApprovalRequest = {
  id: string;
  record: RecordRef;
  step: string;
  status: "pending" | "approved" | "rejected";
  requestedBy?: string;
  requestedAt: string; // ISO timestamp
  decidedBy?: string;
  decidedAt?: string; // ISO timestamp
  note?: string;
};

// ── Notifications (the one inbox; bell in the topbar) ─────────────

export type NotificationItem = {
  id: string;
  record?: RecordRef;
  label: string;
  at: string; // ISO timestamp
  read: boolean;
  href?: string;
};

// ── Primitive registry ─────────────────────────────────────────────
// The 11 primitives and the components that implement each — the
// conformance checklist's index (platform definition §7).

export const PRIMITIVE_REGISTRY = {
  create: ["CreateMenu", "CreateActionsRow", "InlinePicker"],
  record_page: ["RecordShell", "ViewTabs"],
  list_system: ["ListSystem"],
  overview: ["OverviewFunnel", "TaskList", "InsightCards"],
  intake: ["IntakeQueue", "DropZone"],
  vocabularies: ["ManagedVocab"],
  payments: ["PaymentOptionsRail"],
  self_completion: ["PartyStub"],
  attachments: ["AttachmentDropZone", "NotesSection"],
  form_customization: ["FormCustomizer"],
  recurring: ["RecurringTemplate"],
} as const;

export type PrimitiveKey = keyof typeof PRIMITIVE_REGISTRY;
