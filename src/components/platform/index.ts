/**
 * §0 Platform Primitives — the 11 "built once, inherited everywhere" services.
 *
 * Each primitive is a self-contained component that any module can use.
 * They share the admin's teal design system (.portal-theme / .adm-*)
 * and inherit CSS variables from the admin.css tokens.
 *
 * Usage:
 *   import { ListSystem, RecordPage, OverviewFunnel, ... } from "@/components/platform";
 *
 * QB evidence → Unsied build mapping:
 *   §0.1 Create         → CreateMenu, CreateActionsRow, InlinePicker
 *   §0.2 Record Page    → RecordShell, ViewTabs, RightRail
 *   §0.3 List System    → ListSystem (status tabs, filter chips, customize rail, sort, bulk, pagination)
 *   §0.4 Overview       → OverviewFunnel, TaskList, InsightCards
 *   §0.5 Intake         → IntakeQueue, EmailIntake, DropZone
 *   §0.6 Vocabularies   → ManagedVocab, TagPicker, CustomFieldEditor
 *   §0.7 Payments       → PaymentOptionsRail, DepositConfig, PayoutTracker, BillPay
 *   §0.8 Self-Complete  → PartyStub, InvitePanel
 *   §0.9 Attachments    → AttachmentDropZone, NotesSection
 *   §0.10 Form Custom   → FormCustomizer, FieldToggle
 *   §0.11 Recurring     → RecurringTemplate, IntervalBuilder
 */

export { CreateMenu } from "./create-menu";
export { CreateActionsRow } from "./create-actions-row";
export { InlinePicker } from "./inline-picker";
export { RecordShell } from "./record-shell";
export { ViewTabs } from "./view-tabs";
export { ListSystem } from "./list-system";
export { OverviewFunnel } from "./overview-funnel";
export { TaskList } from "./task-list";
export { InsightCards } from "./insight-cards";
export { IntakeQueue } from "./intake-queue";
export { DropZone } from "./drop-zone";
export { ManagedVocab } from "./managed-vocab";
export { PaymentOptionsRail } from "./payment-options-rail";
export { PartyStub } from "./party-stub";
export { AttachmentDropZone } from "./attachment-drop-zone";
export { NotesSection } from "./notes-section";
export { FormCustomizer } from "./form-customizer";
export { RecurringTemplate } from "./recurring-template";
