/**
 * Unsiad platform contracts, shared by client and API.
 *
 * IMPORTANT: field names here are proposals. Reconcile with the database schema
 * before locking. Best practice: generate row types from the DB (Prisma/Drizzle/
 * Supabase types) and derive API DTOs with Pick/Omit so nothing is hand-duplicated.
 *
 * Conventions
 * - Money is integer minor units (cents) + currency. Never floats.
 * - Dates are ISO strings. Dates without time are YYYY-MM-DD.
 * - Every mutable record carries `version` for optimistic concurrency.
 */

// ---------------------------------------------------------------------------
// 1. Primitives
// ---------------------------------------------------------------------------
export type ID = string;
export type ISODate = string;
export type ISODateTime = string;
export type Currency = string; // ISO 4217

export interface Money {
  amount: number; // minor units
  currency: Currency;
}

// ---------------------------------------------------------------------------
// 2. Vocabulary
// ---------------------------------------------------------------------------
export type ModuleKey =
  | 'dashboard' | 'sales' | 'expenses' | 'accounting' | 'tax' | 'banking'
  | 'contacts' | 'catalog' | 'studio' | 'orders' | 'purchasing' | 'inventory'
  | 'returns' | 'pos' | 'marketing' | 'support' | 'people' | 'tasks'
  | 'reports' | 'settings' | 'cap_table';

export type EntityType =
  | 'party' | 'item' | 'document' | 'payment' | 'account' | 'bank_transaction'
  | 'order' | 'shipment' | 'return' | 'ticket' | 'task' | 'design' | 'collection'
  | 'category' | 'campaign' | 'post' | 'discount' | 'banner' | 'popup'
  | 'gift_card' | 'location' | 'shift' | 'employee' | 'pay_run' | 'time_entry';

export interface RecordRef {
  type: EntityType;
  id: ID;
}

export type PartyRole =
  | 'customer' | 'vendor' | 'supplier' | 'contractor' | 'seller'
  | 'lead' | 'employee' | 'stakeholder';

export type DocumentType =
  | 'invoice' | 'estimate' | 'sales_receipt' | 'credit_memo' | 'sales_order'
  | 'bill' | 'expense' | 'check' | 'purchase_order' | 'vendor_credit'
  | 'rma' | 'journal_entry';

export type FulfillmentType =
  | 'stock' | 'pod' | 'supplier_fulfilled' | 'digital' | 'service' | 'bundle';

export type ChannelKey =
  | 'website' | 'pos' | 'etsy' | 'ebay' | 'amazon' | 'tiktok'
  | 'facebook' | 'whatnot' | 'manual';

/** Scoped-view to global-hub lifecycle (section 1.9 of the component map). */
export type PushState = 'local' | 'pushed' | 'live';

// ---------------------------------------------------------------------------
// 3. Context envelope (the integration engine)
// ---------------------------------------------------------------------------
export interface ContextEnvelope {
  originModule: ModuleKey;
  originTabId?: string;
  originRecord?: RecordRef;
  partyId?: ID;
  orderId?: ID;
  itemId?: ID;
  designId?: ID;
  accountId?: ID;
  channelId?: ChannelKey | ID;
  locationId?: ID;
  currency?: Currency;
  dateRange?: { from: ISODate; to: ISODate };
  /** Where to return when the surface closes. */
  returnTo?: { tabId: string; route: string; scrollTop?: number };
}

// ---------------------------------------------------------------------------
// 4. Surfaces
// ---------------------------------------------------------------------------
export type SurfaceKind = 'peek' | 'modal' | 'drawer' | 'page' | 'workspace' | 'studio';

/** Registry key, e.g. 'party.drawer', 'document.page', 'payment.record.modal'. */
export type SurfaceId = string;

export interface SurfaceRequest {
  kind: SurfaceKind;
  id: SurfaceId;
  mode: 'create' | 'edit' | 'view';
  record?: RecordRef;
  envelope: ContextEnvelope;
  /** Defaults merged into the form. Server-validated on save. */
  prefill?: Record<string, unknown>;
  /** Pre-selected role, type, tab, etc. */
  options?: Record<string, string | number | boolean>;
}

export interface SurfaceInstance extends SurfaceRequest {
  instanceId: string;
  tabId: string;
  depth: number; // 0 = base, 1 = child drawer opened from a picker (max 1)
  dirty: boolean;
  openedAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// 5. Pills
// ---------------------------------------------------------------------------
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export type AlertCode =
  | 'needs_attention' | 'manual_push' | 'low_stock' | 'out_of_stock'
  | 'sla_at_risk' | 'sla_breached' | 'unreconciled' | 'missing_w9'
  | 'sync_error' | 'uncategorized' | 'high_return_rate';

export type Pill =
  | { kind: 'status'; value: string; label: string; tone: Tone; next?: string[] }
  | { kind: 'relation'; ref: RecordRef; label: string; module: ModuleKey }
  | { kind: 'party'; ref: RecordRef; label: string; roles: PartyRole[]; balance?: Money }
  | { kind: 'channel'; channel: ChannelKey; label: string }
  | { kind: 'alert'; code: AlertCode; label: string; severity: 'info' | 'warn' | 'critical'; fix?: SurfaceRequest }
  | { kind: 'tag'; id: ID; label: string }
  | { kind: 'push_state'; state: PushState; label: string };

// ---------------------------------------------------------------------------
// 6. Menus (right-click, row actions, create menu). Server-driven.
// ---------------------------------------------------------------------------
export type MenuSection =
  | 'open' | 'edit' | 'create_from' | 'communicate' | 'money'
  | 'print_export' | 'organize' | 'danger';

export interface ConfirmSpec {
  title: string;
  body?: string;
  confirmLabel: string;
  requireReason?: boolean;
}

export interface MenuAction {
  id: string;
  label: string;
  section: MenuSection;
  icon?: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: { reason: string };
  /** Either open a surface... */
  surface?: SurfaceRequest;
  /** ...or call the API directly. */
  request?: { method: 'POST' | 'PATCH' | 'DELETE'; path: string; body?: unknown; idempotent?: boolean };
  confirm?: ConfirmSpec;
  children?: MenuAction[];
}

export interface CreateAction {
  id: string;
  label: string;
  group: 'customers' | 'vendors' | 'team' | 'books' | 'catalog_marketing' | 'support_orders';
  surface: SurfaceRequest;
  /** Higher sorts first for the active module/tab context. */
  relevance: number;
}

// ---------------------------------------------------------------------------
// 7. Records
// ---------------------------------------------------------------------------
export interface RecordCan {
  view: boolean;
  edit: boolean;
  delete: boolean;
  push: boolean;
  approve: boolean;
}

export interface SoftLock {
  userId: ID;
  userName: string;
  since: ISODateTime;
}

export interface RecordMeta {
  version: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  updatedBy: ID;
  can: RecordCan;
  maskedFields: string[];
  pushState?: PushState;
  source?: { module: ModuleKey; view: string; label: string };
  lock?: SoftLock;
  tags: { id: ID; label: string }[];
  /** Precomputed so lists and rails never trigger N+1 lookups. */
  relations: Pill[];
}

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface Party {
  id: ID;
  displayName: string;
  company?: string;
  email?: string;
  phone?: string;
  roles: PartyRole[];
  billingAddress?: Address;
  shippingAddress?: Address;
  terms?: string;
  currency?: Currency;
  defaultAccountId?: ID;
  taxExempt?: boolean;
  taxExemptionCertificateId?: ID;
  /** Masked unless caller has permission. */
  achAccountNumber?: string;
  achRoutingNumber?: string;
  is1099?: boolean;
  notes?: string;
  archived: boolean;
  balance?: { receivable: Money; payable: Money };
  meta: RecordMeta;
}

export interface Item {
  id: ID;
  name: string;
  sku: string;
  itemType: 'product' | 'service' | 'blank' | 'bundle' | 'gift_card' | 'subscription';
  fulfillmentType: FulfillmentType;
  trackInventory: boolean;
  categoryId?: ID;
  description?: string;
  price: Money;
  cost?: Money;
  marginPct?: number;
  incomeAccountId?: ID;
  cogsAccountId?: ID;
  inventoryAccountId?: ID;
  taxCategoryId?: ID;
  supplierId?: ID;
  blankId?: ID;
  designIds: ID[];
  variants: ItemVariant[];
  channels: { channel: ChannelKey; published: boolean; syncStatus: 'synced' | 'pending' | 'error' }[];
  status: 'draft' | 'published' | 'archived';
  stock?: { onHand: number; reserved: number; available: number; reorderPoint?: number };
  imageUrls: string[];
  meta: RecordMeta;
}

export interface ItemVariant {
  id: ID;
  sku: string;
  options: Record<string, string>;
  price?: Money;
  stock?: { onHand: number; available: number };
}

/**
 * Maps to acct_chart_of_accounts. account_type is TEXT in the table; the acct_account_type
 * enum allows the values below. There is no 'cogs' type: COGS is a subtype (confirm with
 * query 6.4 in platform-settings-spec.md, decision D-2).
 */
export type AccountType =
  | 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
  | 'contra_asset' | 'contra_liability' | 'contra_equity' | 'statistical';

export interface Account {
  id: ID;
  entityId: ID; // acct_chart_of_accounts.entity_id (multi-entity)
  code: string; // acct_chart_of_accounts.code
  name: string;
  type: AccountType;
  normalBalance: 'debit' | 'credit';
  subtype?: string;
  description?: string;
  parentId?: ID;
  currency?: Currency;
  isControlAccount: boolean;
  isReconcilable: boolean;
  isPostingAllowed: boolean;
  isSystem: boolean;
  active: boolean;
  /** Derived from journal lines; not a column. */
  balance: Money;
  meta: RecordMeta;
}

// ---------------------------------------------------------------------------
// 8. Document engine (one shape for every transaction document)
// ---------------------------------------------------------------------------
export interface DocumentLine {
  id: ID;
  itemId?: ID;
  accountId?: ID; // category lines on bills/expenses
  description?: string;
  qty: number;
  rate: Money;
  amount: Money;
  taxCategoryId?: ID;
  tagIds: ID[];
}

export interface DocumentTotals {
  subtotal: Money;
  discount?: Money;
  tax: Money;
  deposit?: Money;
  total: Money;
  paid: Money;
  balanceDue: Money;
}

export interface Document {
  id: ID;
  type: DocumentType;
  number: string;
  partyId?: ID;
  status: string; // governed by DocumentDef.statuses
  issueDate: ISODate;
  dueDate?: ISODate;
  terms?: string;
  currency: Currency;
  lines: DocumentLine[];
  totals: DocumentTotals;
  noteToCustomer?: string;
  memo?: string;
  memoOnStatement?: string;
  attachmentIds: ID[];
  recurring?: { schedule: string; autoSend: boolean };
  /** Posted documents are locked (impact tier 4). */
  posted: boolean;
  journalEntryId?: ID;
  source: 'manual' | 'order' | 'upload' | 'email' | 'payment_link' | 'pos' | 'recurring';
  meta: RecordMeta;
}

export interface DocumentDef {
  type: DocumentType;
  partyRole: PartyRole;
  lineColumns: ('item' | 'account' | 'description' | 'qty' | 'rate' | 'amount' | 'tax' | 'tags')[];
  statuses: string[];
  transitions: Record<string, string[]>;
  viewTabs: ('edit' | 'email' | 'payor' | 'pdf')[];
  postsToLedger: boolean;
  convertibleTo?: DocumentType[];
}

// ---------------------------------------------------------------------------
// 9. Config-driven UI (build the generic component once, write configs)
// ---------------------------------------------------------------------------
export type CellKind =
  | 'text' | 'number' | 'money' | 'date' | 'status' | 'party' | 'relation'
  | 'channel' | 'alert' | 'tags' | 'image' | 'count';

export interface ColumnDef {
  id: string;
  label: string;
  kind: CellKind;
  sortable: boolean;
  defaultVisible: boolean;
  align?: 'left' | 'right';
  width?: number;
}

export interface ViewDef {
  id: string;
  entity: EntityType;
  documentType?: DocumentType;
  title: string;
  columns: ColumnDef[];
  defaultSort: string; // "-dueDate"
  statusTabs?: { id: string; label: string; filter: Record<string, string> }[];
  filters: { id: string; label: string; kind: 'select' | 'multi' | 'date_range' | 'party' | 'tag' | 'boolean' }[];
  rowClick: SurfaceId;
  createAction?: CreateAction;
  bulkActions: string[];
  supportsImport: boolean;
  supportsExport: boolean;
  totalsFooter?: ('sum:amount' | 'sum:balance')[];
}

export interface FieldDef {
  id: string;
  label: string;
  kind:
    | 'text' | 'textarea' | 'email' | 'phone' | 'money' | 'date' | 'select'
    | 'multi' | 'toggle' | 'party' | 'item' | 'account' | 'category' | 'tags' | 'attachments' | 'address';
  required?: boolean;
  /** Hidden when false. e.g. role-specific sections. */
  visibleWhen?: { field: string; equals: string | boolean | string[] };
  /** Field-level permission. */
  requires?: string;
  maskedWithout?: string;
}

export interface DrawerDef {
  id: SurfaceId;
  entity: EntityType;
  sections: { id: string; label: string; fields: FieldDef[] }[];
  footer: ('save_and_new' | 'save_and_close' | 'save_and_push' | 'make_full_page')[];
  widths: { default: 480; wide: 720 };
}

// ---------------------------------------------------------------------------
// 10. API conventions
// ---------------------------------------------------------------------------
export interface ListQuery {
  q?: string;
  view?: string;
  status?: string;
  filters?: Record<string, string | string[]>;
  sort?: string; // "-dueDate,name"
  cursor?: string;
  limit?: number;
  from?: ISODate;
  to?: ISODate;
  /** Hint to return only these columns plus id and meta. */
  columns?: string[];
  includeArchived?: boolean;
}

export interface ListResponse<T> {
  data: T[];
  meta: {
    nextCursor?: string;
    total?: number;
    /** Footer totals and tab counts. */
    summary?: Record<string, number | Money>;
    tabCounts?: Record<string, number>;
  };
}

export interface ItemResponse<T> {
  data: T;
  warnings?: { code: string; message: string }[];
}

export type ApiErrorCode =
  | 'VALIDATION' | 'NOT_FOUND' | 'FORBIDDEN' | 'UNAUTHENTICATED'
  | 'VERSION_CONFLICT' | 'LOCKED' | 'DUPLICATE_FOUND' | 'INVALID_TRANSITION'
  | 'IDEMPOTENCY_REPLAY' | 'RATE_LIMITED' | 'UPSTREAM_ERROR' | 'INTERNAL';

export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
    fields?: Record<string, string[]>;
    /** Present on VERSION_CONFLICT. */
    conflict?: { current: unknown; changedFields: FieldChange[] };
    /** Present on DUPLICATE_FOUND. */
    candidates?: DedupeCandidate[];
    requestId: string;
  };
}

/** Required header on POSTs that move money or have external side effects. */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
/** PATCH/DELETE send the record version here. 409 VERSION_CONFLICT on mismatch. */
export const IF_MATCH_HEADER = 'If-Match';

// ---------------------------------------------------------------------------
// 11. Cross-cutting endpoints
// ---------------------------------------------------------------------------

/** GET /{type}/{id}/impact : drives the Existing Record banner (tiers 1 to 4). */
export interface ImpactSummary {
  tier: 1 | 2 | 3 | 4;
  sharedWith?: { hub: 'global_catalog' | 'global_contacts' | 'global_support' | 'global_marketing'; label: string };
  usedIn: { entity: EntityType; count: number; label: string }[];
  locked?: { reason: string; alternatives: ('void' | 'adjust' | 'credit_memo')[] };
}

export interface FieldChange {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
}

/** POST /{type}/{id}/preview-change : drives the Tier 3 confirm-on-save modal. */
export interface ChangePreview {
  changes: FieldChange[];
  propagation: { entity: EntityType; count: number; effect: string }[];
  options: ('save' | 'save_and_apply_open_drafts')[];
}

/** GET /{type}/{id}/actions?surface=rowmenu|contextmenu|header : permission- and state-aware. */
export interface ActionsResponse {
  data: MenuAction[];
}

/** GET /create-menu?module=&tab=&record= : same menu, reordered by context. */
export interface CreateMenuResponse {
  data: CreateAction[];
}

/** GET /peek/{type}/{id} : small, cacheable payload for pill popovers. */
export interface PeekCard {
  ref: RecordRef;
  title: string;
  subtitle?: string;
  facts: { label: string; value: string }[];
  pills: Pill[];
  actions: MenuAction[];
}

/** GET /search?q=&types=&scope= */
export interface SearchHit {
  ref: RecordRef;
  title: string;
  subtitle?: string;
  module: ModuleKey;
  pills?: Pill[];
  /** Create-from-search: true when the hit is only in the global hub (not yet in this scope). */
  globalOnly?: boolean;
}
export interface SearchResponse {
  groups: { type: EntityType; hits: SearchHit[] }[];
}

/** GET /{type}/{id}/activity */
export interface ActivityEntry {
  id: ID;
  at: ISODateTime;
  actor: { id: ID; name: string } | { system: string };
  action: string; // 'created' | 'edited' | 'sent' | 'paid' | 'status_changed' | 'commented' | ...
  sourceView?: string; // 'My Catalog' | 'Global Catalog' | 'Finance' | ...
  changes?: FieldChange[];
  ref?: RecordRef;
}

/** POST /{type}/{id}/push : scoped view to global hub. */
export interface PushRequest {
  matchStrategy: 'check' | 'force_new';
  linkToId?: ID;
  mergeIntoId?: ID;
}
export interface DedupeCandidate {
  id: ID;
  label: string;
  matchedOn: ('email' | 'tax_id' | 'name_address' | 'sku' | 'design_id')[];
  confidence: number; // 0..1
}
export type PushResult =
  | { status: 'pushed'; globalId: ID; pushState: PushState }
  | { status: 'duplicates_found'; candidates: DedupeCandidate[] };

/** POST /bulk/{type} */
export interface BulkRequest {
  ids: ID[];
  action: string;
  params?: Record<string, unknown>;
}
export interface BulkResult {
  succeeded: ID[];
  failed: { id: ID; error: ApiError['error'] }[];
}

/** POST /import/jobs, GET /import/jobs/{id}, POST /import/jobs/{id}/commit|undo */
export interface ImportJob {
  id: ID;
  entity: EntityType;
  source: 'csv' | 'quickbooks' | 'marketplace';
  status: 'uploaded' | 'mapped' | 'previewed' | 'committed' | 'failed' | 'undone';
  mapping?: Record<string, string>;
  preview?: { create: number; update: number; skip: number; errors: { row: number; message: string }[] };
  counts?: { created: number; updated: number; skipped: number };
}

/** POST /export : async for large sets. */
export interface ExportRequest {
  entity: EntityType;
  view?: string;
  query?: ListQuery;
  format: 'csv' | 'xlsx' | 'pdf';
}

// ---------------------------------------------------------------------------
// 12. Money-movement actions (all require Idempotency-Key)
// ---------------------------------------------------------------------------
export interface RecordPaymentRequest {
  documentIds: { id: ID; apply: Money }[]; // apply to one or many open documents
  partyId: ID;
  amount: Money;
  date: ISODate;
  method: 'cash' | 'check' | 'card' | 'ach' | 'wire' | 'other';
  depositToAccountId: ID;
  reference?: string;
}

export interface PayBillsRequest {
  paymentAccountId: ID;
  paymentDate: ISODate;
  startingCheckNumber?: number;
  method: 'check' | 'ach' | 'card';
  bills: { billId: ID; payment: Money; creditsApplied?: { creditId: ID; amount: Money }[] }[];
}

export interface RefundRequest {
  orderId?: ID;
  documentId?: ID;
  lines?: { lineId: ID; qty: number }[];
  amount?: Money;
  reason: string;
  restock: boolean;
  notifyCustomer: boolean;
  to: 'original_tender' | 'store_credit' | 'gift_card';
}

export interface ShipRequest {
  carrier: string;
  trackingNumber: string;
  shippedAt: ISODate;
  notifyCustomer: boolean;
  status: 'shipped' | 'in_transit';
}
