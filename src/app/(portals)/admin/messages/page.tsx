'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  LifeBuoy, RefreshCw, Search, Send, StickyNote, BellRing, ChevronLeft, ChevronRight,
  Inbox, UserX, User, Hourglass, Scale, CheckCheck, Filter, Paperclip, Download, Link2,
  ShieldCheck, KeyRound, Settings,
} from 'lucide-react';
import SupportNotificationsPanel from './notifications-panel';

// ============================================================================
// Support Desk — the platform-wide ticket queue (Sunny, 2026-10-13).
// One desk for every user type: customers, employees, sellers, vets,
// pharmacies, franchisees, external DMCA filers, and system/webhook
// tickets (chargebacks). Tickets are the spine; the conversation lives
// on the ticket. Queue = server-side faceted filtering/sorting/
// pagination over real support_tickets rows; filters live in the URL.
// No fake live chat, no presence, no invented SLAs — honest states only.
// ============================================================================

type Ticket = {
  id: string; ticketRef: string; tenantName: string | null;
  requesterType: string; requesterName: string | null; requesterEmail: string | null;
  requesterCustomerId: string | null; subject: string; category: string;
  status: string; priority: string; assignedStaffId: string | null;
  assigneeName: string | null; messageCount: number; lastMessagePreview: string | null;
  firstPublicReplyAt: string | null; mergedIntoId: string | null;
  metadata: Record<string, unknown>;
  lastMessageAt: string | null; createdAt: string; resolvedAt: string | null; closedAt: string | null;
  // Engine state (rewire) — the ticket's real stamped fields.
  visibilityLevel?: string;
  // §5: set when this row reached the queue through an access grant.
  accessGrantLevel?: string | null;
  assignedTeamId?: string | null; teamName?: string | null;
  slaPolicyId?: string | null;
  firstResponseDueAt?: string | null; nextReplyDueAt?: string | null;
  resolutionDueAt?: string | null;
  firstResponseBreachedAt?: string | null; resolutionBreachedAt?: string | null;
  // §14: the ticket's time-spent rollup (seconds), from the raw row.
  timeSpentSeconds?: number;
};

type SlaClock = {
  dueAt: string | null; state: string;
  elapsedMinutes: number | null; remainingMinutes: number | null; breachedAt: string | null;
};

type EngineDraft = { id: string; body: string; metadata: Record<string, unknown>; createdAt: string };

type QueueResp = {
  tickets: Ticket[]; total: number; page: number; pageSize: number;
  counts: Record<string, number>;
  assignees: { id: string; display_name: string; role: string }[];
};

type Detail = {
  ticket: Ticket;
  // §5: the viewer's access level when the ticket is shared INTO
  // their tenant by a grant; null when they own the ticket.
  accessGrantLevel?: string | null;
  messages: { id: string; from: string; channel: string; text: string; internal: boolean; status?: string; presend?: { state: string; heldUntil: string | null } | null; at: string }[];
  events: { id: string; type: string; actorLabel: string | null; detail: Record<string, unknown>; at: string }[];
  dmca: Record<string, any> | null;
  sla: { policyId: string; firstResponse: SlaClock; resolution: SlaClock; pausedNow: boolean } | null;
  escalation: {
    firstResponseBreachedAt: string | null; resolutionBreachedAt: string | null;
    warnings: number; breaches: number; escalations: number;
    lastEvent: { type: string; at: string } | null;
  } | null;
  drafts: EngineDraft[];
};

type SupportAttachmentRow = {
  id: string; filename: string | null; mimeDetected: string | null;
  sizeBytes: number | null; visibility: string; scanStatus: string;
  uploadedByStaffId: string | null; createdAt: string;
};

// §9 actions & approvals record (support_actions).
type SupportActionRow = {
  id: string; actionType: string; targetRef: string | null;
  amount: number | null; status: string;
  requestedBy: string | null; requestedByName: string | null;
  approvedBy: string | null; approvedByName: string | null;
  executedAt: string | null; createdAt: string;
};

type SupportAuthority = {
  staffId: string | null; role: string | null;
  supportLevel: string; canApprove: boolean;
};

// §8 links & relations (support_links / support_ticket_relations).
type SupportLinkRow = {
  id: string; linkType: string; targetId: string | null;
  targetLabel: string | null; targetDetail: string | null;
  createdByName: string | null; createdAt: string;
};

type SupportRelationRow = {
  id: string; relationType: string; direction: 'outgoing' | 'incoming';
  otherTicketId: string; otherRef: string | null;
  otherSubject: string | null; otherStatus: string | null; createdAt: string;
};

// §5 access grants on the open ticket (support_ticket_access_grants).
type TicketGrantRow = {
  id: string; granteeTenantId: string; granteeName: string | null;
  level: string; grantedByName: string | null; grantedAt: string;
  revokedAt: string | null; revokedByName: string | null; active: boolean;
};

// §14 time entries on the open ticket (support_time_entries). The
// block total is the ticket row's rollup; entries are the writer's
// records — own entries editable, support.admin overrides.
type TimeEntryRow = {
  id: string; staffId: string; staffName: string | null;
  seconds: number; billable: boolean; note: string | null;
  createdAt: string; updatedAt: string; rowVersion: number;
};

// §18 compliance state for the open ticket (privacy record + DSAR
// state, legal hold, redaction history).
type TicketCompliance = {
  visibilityLevel: string;
  legalHold: boolean;
  caseStatus: string | null;
  privacy: Record<string, any> | null;
  dsarState: string | null;
  redactions: { id: string; detail: Record<string, unknown>; at: string }[];
};

const LINK_TYPE_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: 'order', label: 'Order', hint: 'commerce order id' },
  { value: 'payment', label: 'Payment', hint: 'payment id' },
  { value: 'listing', label: 'Listing', hint: 'seller listing id' },
  { value: 'seller', label: 'Seller', hint: 'seller id' },
  { value: 'appointment', label: 'Appointment', hint: 'appointment id' },
  { value: 'prescription', label: 'Prescription', hint: 'prescription id' },
];

const RELATION_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'duplicate_of', label: 'Duplicate of' },
  { value: 'related', label: 'Related' },
  { value: 'child', label: 'Child' },
  { value: 'problem_incident', label: 'Problem / incident' },
];

const ACTION_BADGE: Record<string, { label: string; cls: string }> = {
  requested: { label: 'Awaiting approval', cls: 'adm-badge adm-badge-amber' },
  approved: { label: 'Approved', cls: 'bg-brand-teal/10 text-brand-teal' },
  executed: { label: 'Executed', cls: 'adm-badge adm-badge-green' },
  failed: { label: 'Failed', cls: 'adm-badge adm-badge-red' },
  rejected: { label: 'Rejected', cls: 'bg-neutral-200 text-neutral-700' },
};

// The tree's §9 types with a registered executor in the approvals lib.
// Types without one (account_change, anything else) are still recorded
// and approved through the same flow; approval lands them 'failed'
// with the reason on the record — the desk says so before requesting.
const ACTION_TYPES: { value: string; label: string; executor: boolean; needsAmount: boolean; needsTarget: boolean }[] = [
  { value: 'refund', label: 'Refund', executor: true, needsAmount: true, needsTarget: false },
  { value: 'credit', label: 'Store credit', executor: true, needsAmount: true, needsTarget: false },
  { value: 'listing_takedown', label: 'Listing takedown', executor: true, needsAmount: false, needsTarget: true },
  { value: 'account_change', label: 'Account change', executor: false, needsAmount: false, needsTarget: false },
];

const SCAN_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Awaiting scan', cls: 'adm-badge adm-badge-amber' },
  clean: { label: 'Scan clean', cls: 'adm-badge adm-badge-green' },
  infected: { label: 'Scan failed — infected', cls: 'adm-badge adm-badge-red' },
  failed: { label: 'Scan failed', cls: 'adm-badge adm-badge-red' },
};

type SavedView = {
  id: string; name: string; scope: string; ownerType: string;
  filter: Record<string, string>; isShared: boolean; canWrite?: boolean;
};

type SideConversationRow = {
  id: string; subject: string; status: string; createdAt: string;
  participants: { id: string; staffId: string | null; email: string | null }[];
  messages: { id: string; authorLabel: string | null; body: string; createdAt: string }[];
};

type SupportWebhookRow = {
  id: string; name: string; url: string; eventTypes: string[];
  hasSecret: boolean; isActive: boolean;
};

type WebhookDeliveryRow = {
  id: string; webhookId: string; eventType: string; status: string;
  attempts: number; signature: string | null; lastError: string | null; createdAt: string;
};

const fmtBytes = (n: number | null) => {
  if (n === null || n === undefined) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

type ComposerShelf = {
  macros: { id: string; name: string; description: string | null; scope: string }[];
  cannedReplies: { id: string; title: string; scope: string }[];
  templates: { code: string; name: string; channel: string; scope: string; locked: boolean }[];
};

type ReportMetrics = {
  ticketsCreated: number; ticketsResolved: number; ticketsReopened: number;
  reopenRate: number | null; avgFirstResponseMinutes: number | null;
  avgResolutionMinutes: number | null; slaDue: number; slaMet: number;
  slaBreached: number; slaAttainmentPct: number | null;
  csatResponses: number; csatAvg: number | null;
  messages: number; publicReplies: number;
  repliesPerResolvedTicket: number | null;
  backlogOpenEnd: number | null;
};

type Report = {
  from: string; to: string; totals: ReportMetrics;
  byCategory: { category: string; metrics: ReportMetrics }[];
  byTeam: { teamId: string; teamName: string | null; metrics: ReportMetrics }[];
  byChannel: { channel: string; metrics: ReportMetrics }[];
  backlogAge: {
    openCount: number; oldestAgeMinutes: number | null;
    avgAgeMinutes: number | null; oldestTicketRef: string | null;
  } | null;
  workload: {
    staffId: string | null; staffName: string | null;
    open: number; pending: number; urgentOpen: number;
    resolvedInRange: number; avgResolutionMinutes: number | null;
  }[];
  byTenant: { tenantId: string; tenantName: string | null; metrics: ReportMetrics }[];
};

type OpsJob = {
  id: string; tenantId: string | null; type: string; status: string;
  attempts: number; maxAttempts: number; nextAttemptAt: string | null;
  lastError: string | null; payload: unknown;
  createdAt: string; startedAt: string | null; finishedAt: string | null;
};

type OpsData = {
  scope: string; tenantId: string;
  health: {
    byStatus: Record<string, number>;
    byType: {
      type: string; producer: string | null; total: number;
      byStatus: Record<string, number>; lastFinishedAt: string | null;
    }[];
    staleRunning: number; queuedOldestAt: string | null;
  };
  failures: OpsJob[];
  deadLetters: OpsJob[];
  quarantine: { held: number; byStatus: Record<string, number>; rows: OpsJob[] };
};

const fmtAge = (min: number | null) => {
  if (min == null) return '—';
  if (min >= 1440) return `${Math.floor(min / 1440)}d ${Math.floor((min % 1440) / 60)}h`;
  if (min >= 60) return `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
  return `${Math.round(min)}m`;
};

// §14 time-spent rollup, stored in seconds on the ticket row.
const fmtDuration = (sec: number | null) => {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  if (m >= 1440) return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  if (m > 0) return `${m}m`;
  return sec > 0 ? '<1m' : '0m';
};

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-brand-teal/10 text-brand-teal',
  pending: 'adm-badge adm-badge-amber',
  resolved: 'adm-badge adm-badge-green',
  closed: 'bg-neutral-200 text-neutral-600',
};
const PRIORITY_STYLE: Record<string, string> = {
  urgent: 'adm-badge adm-badge-red',
  high: 'bg-orange-100 text-orange-700',
  normal: 'bg-neutral-100 text-neutral-600',
  low: 'bg-neutral-50 text-neutral-400',
};
const TYPE_LABEL: Record<string, string> = {
  customer: 'Customer', employee: 'Employee', seller: 'Seller', vet: 'Vet',
  pharmacy: 'Pharmacy', franchise: 'Franchise', external: 'External',
};
const CATEGORY_LABEL: Record<string, string> = {
  general: 'General', billing: 'Billing', technical: 'Technical',
  seller_support: 'Seller Support', payments: 'Payments', dmca: 'DMCA',
};
const DMCA_WORKFLOW = ['needs_info', 'under_review', 'actioned_takedown', 'rejected_no_action', 'uploader_notified', 'counter_notice_window', 'restored', 'closed_no_restore', 'closed'];

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
const fmtFull = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

// The queue's SLA badge — derived ONLY from the ticket's stamped due /
// breach fields (never invented): breach stamps win, then the live
// first-response clock until the first reply lands, then resolution.
function slaBadge(t: Ticket): { text: string; cls: string } | null {
  if (t.firstResponseBreachedAt && !t.firstPublicReplyAt)
    return { text: 'First response breached', cls: 'adm-badge adm-badge-red' };
  if (t.resolutionBreachedAt && t.status !== 'resolved' && t.status !== 'closed')
    return { text: 'Resolution breached', cls: 'adm-badge adm-badge-red' };
  if (t.resolutionBreachedAt)
    return { text: 'Resolved after breach', cls: 'adm-badge adm-badge-red' };
  const now = Date.now();
  if (!t.firstPublicReplyAt && t.firstResponseDueAt) {
    const due = new Date(t.firstResponseDueAt).getTime();
    if (due < now) return { text: 'First response overdue', cls: 'adm-badge adm-badge-red' };
    return { text: `First response due ${fmt(t.firstResponseDueAt)}`, cls: due - now < 3600000 ? 'adm-badge adm-badge-amber' : 'adm-badge' };
  }
  if ((t.status === 'open' || t.status === 'pending') && t.resolutionDueAt) {
    const due = new Date(t.resolutionDueAt).getTime();
    if (due < now) return { text: 'Resolution overdue', cls: 'adm-badge adm-badge-red' };
    return { text: `Resolution due ${fmt(t.resolutionDueAt)}`, cls: due - now < 3600000 ? 'adm-badge adm-badge-amber' : 'adm-badge' };
  }
  return null;
}

function visibilityBadge(level?: string) {
  if (level === 'confidential')
    return <span className="ml-1.5 rounded bg-red-600 px-1 py-0.5 font-sans text-[10px] font-semibold text-white">CONFIDENTIAL</span>;
  if (level === 'restricted')
    return <span className="ml-1.5 rounded bg-amber-500 px-1 py-0.5 font-sans text-[10px] font-semibold text-white">RESTRICTED</span>;
  return null;
}

const SLA_STATE_STYLE: Record<string, string> = {
  met: 'adm-badge adm-badge-green',
  breached: 'adm-badge adm-badge-red',
  warning: 'adm-badge adm-badge-amber',
  ok: 'bg-brand-teal/10 text-brand-teal',
  paused: 'bg-violet-100 text-violet-800',
  none: 'adm-badge',
};

export default function SupportDeskPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) || '';
  const filters = {
    status: get('status'), type: get('type'), category: get('category'),
    priority: get('priority'), assignee: get('assignee'), q: get('q'),
    sort: get('sort') || 'recent', scope: get('scope'),
    page: Math.max(1, parseInt(get('page') || '1', 10) || 1),
  };
  const setParam = useCallback((patch: Record<string, string>, resetPage = true) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v); else next.delete(k);
    }
    if (resetPage) next.delete('page');
    router.replace(`?${next.toString()}`, { scroll: false });
  }, [router, sp]);

  const [data, setData] = useState<QueueResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [composer, setComposer] = useState('');
  const [composerKind, setComposerKind] = useState<'reply' | 'note'>('reply');
  const [composerCc, setComposerCc] = useState('');
  // §10 saved views (support_queues) — the rail's second nav section.
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [newViewName, setNewViewName] = useState('');
  // §14 side conversations on the open ticket.
  const [sideConversations, setSideConversations] = useState<SideConversationRow[]>([]);
  const [sideSubject, setSideSubject] = useState('');
  const [sideBody, setSideBody] = useState('');
  const [sideEmails, setSideEmails] = useState('');
  const [sideReplyDrafts, setSideReplyDrafts] = useState<Record<string, string>>({});
  const [sideBusy, setSideBusy] = useState(false);
  // §16 outbound webhooks (shown with Operations).
  const [webhooks, setWebhooks] = useState<SupportWebhookRow[]>([]);
  const [webhookDeliveries, setWebhookDeliveries] = useState<WebhookDeliveryRow[]>([]);
  const [hookName, setHookName] = useState('');
  const [hookUrl, setHookUrl] = useState('');
  const [hookEvents, setHookEvents] = useState('');
  const [hookSecret, setHookSecret] = useState('');
  const [hookBusy, setHookBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(filters.q);
  const [shelf, setShelf] = useState<ComposerShelf | null>(null);
  const [attachments, setAttachments] = useState<SupportAttachmentRow[]>([]);
  const [attachVisibility, setAttachVisibility] = useState<'public' | 'internal'>('public');
  const [attachBusy, setAttachBusy] = useState(false);
  // §9 actions & approvals
  const [ticketActions, setTicketActions] = useState<SupportActionRow[]>([]);
  const [actionsAuthority, setActionsAuthority] = useState<SupportAuthority | null>(null);
  const [actionThresholdCents, setActionThresholdCents] = useState<number | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [newActionType, setNewActionType] = useState('refund');
  const [newActionAmount, setNewActionAmount] = useState('');
  const [newActionTarget, setNewActionTarget] = useState('');
  const [rejectingActionId, setRejectingActionId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  // §8 links & relations
  const [ticketLinks, setTicketLinks] = useState<SupportLinkRow[]>([]);
  const [ticketRelations, setTicketRelations] = useState<SupportRelationRow[]>([]);
  const [linkBusy, setLinkBusy] = useState(false);
  const [newLinkType, setNewLinkType] = useState('order');
  const [newLinkTarget, setNewLinkTarget] = useState('');
  const [newRelationType, setNewRelationType] = useState('related');
  const [newRelationTicket, setNewRelationTicket] = useState('');
  const [newRelationRef, setNewRelationRef] = useState('');
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [ops, setOps] = useState<OpsData | null>(null);
  const [showOps, setShowOps] = useState(false);
  // Desk settings group (saved views, scope, reporting/operations toggles,
  // configuration, approvals, my notifications) — housed behind the filter
  // bar's Settings toggle, default closed (owner order 2026-10-31: the
  // rail blocks were scrunched; the queue owns the width).
  const [deskSettingsOpen, setDeskSettingsOpen] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, String(v));
    p.set('pageSize', '20');
    return p.toString();
  }, [filters.status, filters.type, filters.category, filters.priority, filters.assignee, filters.q, filters.sort, filters.scope, filters.page]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadQueue = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/admin/support/tickets?${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load the queue');
      setData(json);
      setError(null);
    } catch (e: any) {
      setError(e.message || 'Failed to load the queue');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [qs]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  // §10 saved views load once — they are desk navigation, so they
  // sit in the rail beside the built-in views.
  const loadViews = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/support/queues');
      const json = await res.json();
      if (res.ok) setSavedViews(json.views || []);
    } catch { /* the built-in views still work */ }
  }, []);
  useEffect(() => { loadViews(); }, [loadViews]);

  const applySavedView = (v: SavedView) => {
    setParam({
      status: '', type: '', category: '', priority: '', assignee: '', q: '', sort: '', scope: '',
      ...v.filter,
    });
  };

  const saveCurrentView = async () => {
    const name = newViewName.trim();
    if (!name) { flash('Name the view first.'); return; }
    setBusy(true);
    try {
      await post('/api/admin/support/queues', {
        name,
        ownerType: 'personal',
        filter: {
          status: filters.status, type: filters.type, category: filters.category,
          priority: (filters as any).priority || '', assignee: filters.assignee,
          q: filters.q, sort: (filters as any).sort || '', scope: filters.scope,
        },
      });
      setNewViewName('');
      flash(`View "${name}" saved — it is in the rail now.`);
      await loadViews();
    } catch (e: any) { flash(e.message); } finally { setBusy(false); }
  };

  const deleteSavedView = async (v: SavedView) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/support/queues/${v.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      flash(`View "${v.name}" deleted.`);
      await loadViews();
    } catch (e: any) { flash(e.message); } finally { setBusy(false); }
  };
  useEffect(() => {
    // Queue freshness by poll/invalidation (no realtime firehose on the list).
    pollRef.current = setInterval(() => loadQueue(true), 30000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadQueue]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/support/tickets/${id}`);
      const json = await res.json();
      if (res.ok) setDetail(json);
    } catch { /* keep the last good detail */ }
  }, []);

  useEffect(() => {
    if (!detailId) { setDetail(null); return; }
    loadDetail(detailId);
    const t = setInterval(() => loadDetail(detailId), 15000);
    return () => clearInterval(t);
  }, [detailId, loadDetail]);

  // The composer's engine shelf (macros / canned replies / templates)
  // loads with the ticket — effective config for this tenant.
  useEffect(() => {
    if (!detailId) { setShelf(null); return; }
    let live = true;
    fetch(`/api/admin/support/tickets/${detailId}/composer`)
      .then((r) => r.json())
      .then((j) => { if (live && j && !j.error) setShelf(j); })
      .catch(() => {});
    return () => { live = false; };
  }, [detailId]);

  // §14 side conversations load with the ticket — staff-only threads
  // the requester never sees.
  const loadSides = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/support/tickets/${id}/side-conversations`);
      const j = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(j.sideConversations)) setSideConversations(j.sideConversations);
    } catch { /* keep the last good list */ }
  }, []);

  useEffect(() => {
    if (!detailId) { setSideConversations([]); return; }
    loadSides(detailId);
  }, [detailId, loadSides]);

  const openSide = async () => {
    if (!detailId || !sideSubject.trim() || !sideBody.trim()) return;
    setSideBusy(true);
    try {
      await post(`/api/admin/support/tickets/${detailId}/side-conversations`, {
        subject: sideSubject, body: sideBody,
        emails: sideEmails.split(',').map((s) => s.trim()).filter(Boolean),
      });
      setSideSubject(''); setSideBody(''); setSideEmails('');
      flash('Side conversation opened — the requester cannot see it.');
      await loadSides(detailId);
    } catch (e: any) { flash(e.message); } finally { setSideBusy(false); }
  };

  const sideAction = async (sideId: string, body: Record<string, unknown>) => {
    if (!detailId) return;
    setSideBusy(true);
    try {
      await post(`/api/admin/support/tickets/${detailId}/side-conversations/${sideId}`, body);
      if (body.action === 'reply') setSideReplyDrafts((d) => ({ ...d, [sideId]: '' }));
      await loadSides(detailId);
    } catch (e: any) { flash(e.message); } finally { setSideBusy(false); }
  };

  // §16 outbound webhooks load with Operations.
  const loadWebhooks = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/support/webhooks');
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setWebhooks(j.webhooks || []);
        setWebhookDeliveries(j.deliveries || []);
      }
    } catch { /* keep the last good list */ }
  }, []);

  const createHook = async () => {
    if (!hookName.trim() || !hookUrl.trim()) { flash('Name and URL first.'); return; }
    setHookBusy(true);
    try {
      await post('/api/admin/support/webhooks', {
        name: hookName, url: hookUrl,
        eventTypes: hookEvents.split(',').map((s) => s.trim()).filter(Boolean),
        secret: hookSecret || undefined,
      });
      setHookName(''); setHookUrl(''); setHookEvents(''); setHookSecret('');
      flash('Webhook registered — ticket events it subscribes to will queue signed deliveries.');
      await loadWebhooks();
    } catch (e: any) { flash(e.message); } finally { setHookBusy(false); }
  };

  const toggleHook = async (h: SupportWebhookRow) => {
    setHookBusy(true);
    try {
      await post(`/api/admin/support/webhooks/${h.id}`, { isActive: !h.isActive }, 'PATCH');
      await loadWebhooks();
    } catch (e: any) { flash(e.message); } finally { setHookBusy(false); }
  };

  const deleteHook = async (h: SupportWebhookRow) => {
    setHookBusy(true);
    try {
      const res = await fetch(`/api/admin/support/webhooks/${h.id}`, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Delete failed');
      flash(`Webhook "${h.name}" removed.`);
      await loadWebhooks();
    } catch (e: any) { flash(e.message); } finally { setHookBusy(false); }
  };

  // §16 pre-send undo: cancel a reply still inside its window.
  const undoSend = async (messageId: string) => {
    if (!detailId) return;
    setBusy(true);
    try {
      await post(`/api/admin/support/tickets/${detailId}/undo`, { messageId });
      flash('Send undone — the reply was never delivered.');
      await loadDetail(detailId);
    } catch (e: any) { flash(e.message); } finally { setBusy(false); }
  };

  // §7 attachments load with the ticket, internal files included. A
  // file downloads only once its scan is clean; until then its state
  // is shown as it is ("Awaiting scan" is a real state, not a delay).
  const loadAttachments = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/support/tickets/${id}/attachments`);
      const j = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(j.attachments)) setAttachments(j.attachments);
    } catch { /* keep the last good list */ }
  }, []);

  useEffect(() => {
    if (!detailId) { setAttachments([]); return; }
    loadAttachments(detailId);
  }, [detailId, loadAttachments]);

  const loadActions = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/support/tickets/${id}/actions`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Failed to load actions');
      setTicketActions(j.actions ?? []);
      setActionsAuthority(j.authority ?? null);
      setActionThresholdCents(typeof j.thresholdCents === 'number' ? j.thresholdCents : null);
    } catch { setTicketActions([]); setActionsAuthority(null); }
  }, []);

  useEffect(() => {
    if (!detailId) { setTicketActions([]); setActionsAuthority(null); setRejectingActionId(null); return; }
    loadActions(detailId);
  }, [detailId, loadActions]);

  // §8 links & relations load with the ticket, like attachments.
  const loadLinks = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/support/tickets/${id}/links`);
      const j = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(j.links)) setTicketLinks(j.links);
    } catch { /* keep the last good list */ }
  }, []);

  const loadRelations = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/support/tickets/${id}/relations`);
      const j = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(j.relations)) setTicketRelations(j.relations);
    } catch { /* keep the last good list */ }
  }, []);

  useEffect(() => {
    if (!detailId) { setTicketLinks([]); setTicketRelations([]); return; }
    loadLinks(detailId);
    loadRelations(detailId);
  }, [detailId, loadLinks, loadRelations]);

  // §18 compliance loads with the ticket, like links & relations.
  const [compliance, setCompliance] = useState<TicketCompliance | null>(null);
  const [complianceBusy, setComplianceBusy] = useState(false);
  const loadCompliance = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/support/tickets/${id}/compliance`);
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.compliance) setCompliance(j.compliance as TicketCompliance);
    } catch { /* keep the last good state */ }
  }, []);

  useEffect(() => {
    if (!detailId) { setCompliance(null); return; }
    loadCompliance(detailId);
  }, [detailId, loadCompliance]);

  // §5 access grants load with the ticket, like compliance. The
  // management fetch succeeds only for the OWNING tenant — a grantee
  // gets a 404 there and sees the shared-access note instead.
  const [ticketGrants, setTicketGrants] = useState<TicketGrantRow[] | null>(null);
  const [grantTenants, setGrantTenants] = useState<{ id: string; name: string | null }[]>([]);
  const [grantBusy, setGrantBusy] = useState(false);
  const [grantTenantId, setGrantTenantId] = useState('');
  const [grantLevel, setGrantLevel] = useState<'view' | 'collaborate'>('view');
  const loadGrants = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/support/tickets/${id}/grants`);
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setTicketGrants(j.grants as TicketGrantRow[]);
        setGrantTenants(j.tenants ?? []);
      } else setTicketGrants(null);
    } catch { /* keep the last good state */ }
  }, []);

  useEffect(() => {
    if (!detailId) { setTicketGrants(null); setGrantTenants([]); return; }
    loadGrants(detailId);
  }, [detailId, loadGrants]);

  const runGrant = async () => {
    if (!detailId || !grantTenantId) return;
    setGrantBusy(true);
    try {
      const r = await post(`/api/admin/support/tickets/${detailId}/grants`, { granteeTenantId: grantTenantId, level: grantLevel });
      if (r?.ok === false) throw new Error(r.error || 'Grant failed');
      flash(r.changed ? 'Access granted — the grantee tenant sees this ticket in its desk queue.' : 'That tenant already holds this level on the ticket.');
      await loadGrants(detailId);
      await loadDetail(detailId);
    } catch (e: any) { flash(e.message); } finally { setGrantBusy(false); }
  };

  const runRevoke = async (g: TicketGrantRow) => {
    if (!detailId) return;
    if (!window.confirm(`Revoke ${g.granteeName || 'this tenant'}'s ${g.level} access to this ticket? The revocation is stamped on the grant record and in the ticket history — the record is kept, never deleted.`)) return;
    setGrantBusy(true);
    try {
      const r = await post(`/api/admin/support/tickets/${detailId}/grants`, { grantId: g.id }, 'DELETE');
      if (r?.ok === false) throw new Error(r.error || 'Revoke failed');
      flash('Access revoked.');
      await loadGrants(detailId);
      await loadDetail(detailId);
    } catch (e: any) { flash(e.message); } finally { setGrantBusy(false); }
  };

  // §14 time entries load with the ticket. The list fetch resolves
  // through §5 grants like the detail; mutations stay owner-tenant
  // (the route explains itself when a shared ticket refuses).
  const [timeEntries, setTimeEntries] = useState<TimeEntryRow[] | null>(null);
  const [timeActor, setTimeActor] = useState<{ staffId: string | null; canAdmin: boolean }>({ staffId: null, canAdmin: false });
  const [timeBusy, setTimeBusy] = useState(false);
  const [teMin, setTeMin] = useState('');
  const [teSec, setTeSec] = useState('');
  const [teBillable, setTeBillable] = useState(false);
  const [teNote, setTeNote] = useState('');
  const [teEditId, setTeEditId] = useState<string | null>(null);
  const [teEditMin, setTeEditMin] = useState('');
  const [teEditSec, setTeEditSec] = useState('');
  const [teEditBillable, setTeEditBillable] = useState(false);
  const [teEditNote, setTeEditNote] = useState('');
  const loadTimeEntries = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/support/tickets/${id}/time-entries`);
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setTimeEntries(j.entries as TimeEntryRow[]);
        setTimeActor({ staffId: j.actorStaffId ?? null, canAdmin: !!j.canAdmin });
      } else setTimeEntries(null);
    } catch { /* keep the last good state */ }
  }, []);

  useEffect(() => {
    if (!detailId) { setTimeEntries(null); setTeEditId(null); return; }
    loadTimeEntries(detailId);
  }, [detailId, loadTimeEntries]);

  const runLogTime = async () => {
    if (!detailId) return;
    const seconds = (parseInt(teMin || '0', 10) || 0) * 60 + (parseInt(teSec || '0', 10) || 0);
    if (seconds <= 0) { flash('Enter the time worked — minutes and/or seconds.'); return; }
    setTimeBusy(true);
    try {
      const r = await post(`/api/admin/support/tickets/${detailId}/time-entries`, { seconds, billable: teBillable, note: teNote.trim() || null });
      if (r?.ok === false) throw new Error(r.error || 'Could not log time');
      setTeMin(''); setTeSec(''); setTeBillable(false); setTeNote('');
      flash('Time logged.');
      await loadTimeEntries(detailId);
      await loadDetail(detailId);
    } catch (e: any) { flash(e.message); } finally { setTimeBusy(false); }
  };

  const startEditEntry = (e: TimeEntryRow) => {
    setTeEditId(e.id);
    setTeEditMin(String(Math.floor(e.seconds / 60)));
    setTeEditSec(String(e.seconds % 60));
    setTeEditBillable(e.billable);
    setTeEditNote(e.note ?? '');
  };

  const runSaveEntry = async () => {
    if (!detailId || !teEditId) return;
    const seconds = (parseInt(teEditMin || '0', 10) || 0) * 60 + (parseInt(teEditSec || '0', 10) || 0);
    if (seconds <= 0) { flash('Time must be more than zero — delete the entry instead if it should not exist.'); return; }
    setTimeBusy(true);
    try {
      const r = await post(`/api/admin/support/tickets/${detailId}/time-entries/${teEditId}`, { seconds, billable: teEditBillable, note: teEditNote.trim() || null }, 'PATCH');
      if (r?.ok === false) throw new Error(r.error || 'Could not save the entry');
      setTeEditId(null);
      flash('Time entry updated.');
      await loadTimeEntries(detailId);
      await loadDetail(detailId);
    } catch (e: any) { flash(e.message); } finally { setTimeBusy(false); }
  };

  const runDeleteEntry = async (e: TimeEntryRow) => {
    if (!detailId) return;
    if (!window.confirm(`Delete this time entry (${fmtDuration(e.seconds)}${e.billable ? ', billable' : ''})? The deletion is recorded in the audit log.`)) return;
    setTimeBusy(true);
    try {
      const r = await post(`/api/admin/support/tickets/${detailId}/time-entries/${e.id}`, {}, 'DELETE');
      if (r?.ok === false) throw new Error(r.error || 'Could not delete the entry');
      if (teEditId === e.id) setTeEditId(null);
      flash('Time entry deleted.');
      await loadTimeEntries(detailId);
      await loadDetail(detailId);
    } catch (e: any) { flash(e.message); } finally { setTimeBusy(false); }
  };

  const runCompliance = async (body: Record<string, unknown>, okMsg: string) => {
    if (!detailId) return;
    setComplianceBusy(true);
    try {
      const r = await post(`/api/admin/support/tickets/${detailId}/compliance`, body);
      if (r?.ok === false) throw new Error(r.error || 'Compliance action failed');
      if (body.action === 'dsar_export' && r.export) {
        const blob = new Blob([JSON.stringify(r.export, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `dsar-export-${detail?.ticket.ticketRef || detailId}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
      flash(okMsg);
      await loadCompliance(detailId);
      await loadDetail(detailId);
    } catch (e: any) { flash(e.message); } finally { setComplianceBusy(false); }
  };

  const redactMessageUi = async (messageId: string) => {
    const reason = window.prompt('Reason for redacting this message (recorded in the audit trail):') ?? null;
    if (reason === null) return;
    await runCompliance(
      { action: 'redact_message', messageId, reason: reason || null },
      'Message redacted — content replaced with a marker; the redaction is in the ticket trail.',
    );
  };

  const uploadAttachment = async (file: File) => {
    if (!detailId) return;
    setAttachBusy(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('visibility', attachVisibility);
      const res = await fetch(`/api/admin/support/tickets/${detailId}/attachments`, { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Upload failed');
      flash(`Attached "${file.name}" — awaiting its security scan before it can be downloaded.`);
      await loadAttachments(detailId);
      await loadDetail(detailId);
    } catch (e: any) { flash(e.message); } finally { setAttachBusy(false); }
  };

  const downloadAttachment = async (a: SupportAttachmentRow) => {
    if (!detailId) return;
    try {
      const res = await fetch(`/api/admin/support/tickets/${detailId}/attachments/${a.id}`);
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Download failed');
      if (j.url) window.open(j.url, '_blank', 'noopener');
      await loadDetail(detailId);
    } catch (e: any) { flash(e.message); }
  };

  const rescanAttachment = async (a: SupportAttachmentRow) => {
    if (!detailId) return;
    setAttachBusy(true);
    try {
      const r = await post(`/api/admin/support/tickets/${detailId}/attachments/${a.id}`, { action: 'rescan' });
      if (r?.ok === false) throw new Error(r.error || 'Rescan failed');
      flash(`"${a.filename || 'Attachment'}" is back in the scan queue.`);
      await loadAttachments(detailId);
    } catch (e: any) { flash(e.message); } finally { setAttachBusy(false); }
  };

  const requestAction = async () => {
    if (!detailId) return;
    const spec = ACTION_TYPES.find((t) => t.value === newActionType);
    setActionBusy(true);
    try {
      const r = await post(`/api/admin/support/tickets/${detailId}/actions`, {
        actionType: newActionType,
        amount: spec?.needsAmount ? Number(newActionAmount) : null,
        targetRef: spec?.needsTarget ? newActionTarget.trim() : null,
      });
      if (r?.ok === false) throw new Error(r.error || 'Action request failed');
      if (r.outcome === 'executed') flash(`${spec?.label ?? r.action?.actionType} executed and recorded.`);
      else if (r.outcome === 'failed') flash('The action was approved and recorded, but execution failed — see the action history for the reason.');
      else flash('Action recorded — awaiting an approver before it executes.');
      setNewActionAmount(''); setNewActionTarget('');
      await loadActions(detailId);
      await loadDetail(detailId);
    } catch (e: any) { flash(e.message); } finally { setActionBusy(false); }
  };

  const decideAction = async (a: SupportActionRow, decision: 'approve' | 'reject') => {
    if (!detailId) return;
    setActionBusy(true);
    try {
      const r = await post(`/api/admin/support/tickets/${detailId}/actions/${a.id}`, {
        decision,
        reason: decision === 'reject' ? rejectReason.trim() || null : null,
      });
      if (r?.ok === false) throw new Error(r.error || 'Decision failed');
      flash(decision === 'approve'
        ? (r.action?.status === 'executed' ? 'Approved — the action executed.' : 'Approved — execution result is on the record.')
        : 'Action rejected — it will not execute.');
      setRejectingActionId(null); setRejectReason('');
      await loadActions(detailId);
      await loadDetail(detailId);
    } catch (e: any) { flash(e.message); } finally { setActionBusy(false); }
  };

  const addLink = async () => {
    if (!detailId || !newLinkTarget.trim()) return;
    setLinkBusy(true);
    try {
      const r = await post(`/api/admin/support/tickets/${detailId}/links`, {
        linkType: newLinkType, targetId: newLinkTarget.trim(),
      });
      flash(r.created ? 'Link added.' : 'That link is already on this ticket.');
      setNewLinkTarget('');
      await loadLinks(detailId);
      await loadDetail(detailId);
    } catch (e: any) { flash(e.message); } finally { setLinkBusy(false); }
  };

  const removeLink = async (l: SupportLinkRow) => {
    if (!detailId) return;
    setLinkBusy(true);
    try {
      await post(`/api/admin/support/tickets/${detailId}/links/${l.id}`, {}, 'DELETE');
      flash('Link removed.');
      await loadLinks(detailId);
      await loadDetail(detailId);
    } catch (e: any) { flash(e.message); } finally { setLinkBusy(false); }
  };

  const addRelation = async () => {
    if (!detailId) return;
    const ref = newRelationRef.trim();
    if (!ref && !newRelationTicket) { flash('Pick a ticket from the queue or enter its SUP ref.'); return; }
    setLinkBusy(true);
    try {
      const r = await post(`/api/admin/support/tickets/${detailId}/relations`, ref
        ? { relatedTicketRef: ref, relationType: newRelationType }
        : { relatedTicketId: newRelationTicket, relationType: newRelationType });
      flash(r.created ? 'Relation added.' : 'That relation already exists.');
      setNewRelationRef(''); setNewRelationTicket('');
      await loadRelations(detailId);
      await loadDetail(detailId);
    } catch (e: any) { flash(e.message); } finally { setLinkBusy(false); }
  };

  const removeRelation = async (r: SupportRelationRow) => {
    if (!detailId) return;
    setLinkBusy(true);
    try {
      await post(`/api/admin/support/tickets/${detailId}/relations/${r.id}`, {}, 'DELETE');
      flash('Relation removed.');
      await loadRelations(detailId);
      await loadDetail(detailId);
    } catch (e: any) { flash(e.message); } finally { setLinkBusy(false); }
  };

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 5000); };

  const post = async (url: string, body: unknown, method = 'POST') => {
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Request failed');
    return json;
  };

  const sendComposer = async () => {
    if (!detailId || !composer.trim()) return;
    if (detail?.accessGrantLevel === 'view') { flash('This ticket is shared with your tenant at view level — read-only.'); return; }
    setBusy(true);
    try {
      const cc = composerKind === 'reply'
        ? composerCc.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      const r = await post(`/api/admin/support/tickets/${detailId}`, { body: composer, kind: composerKind, cc });
      setComposer('');
      if (composerKind === 'reply') {
        setComposerCc('');
        if (r.held) {
          flash(`Reply held by the pre-send undo window — it sends at ${String(r.heldUntil || '').slice(0, 19).replace('T', ' ')}. Undo it from the thread until then.`);
        } else {
          flash(`Reply sent.${r.bell ? ' Customer bell notified.' : ''}${r.emailed ? ' Email copy delivered.' : ''}${r.sms?.sent ? ' Text delivered.' : r.sms?.reason === 'twilio_not_configured' ? ' (SMS leg: Twilio not configured — reply is in the thread.)' : ''}`);
        }
      } else flash(`Internal note added — staff only.${Array.isArray(r.mentioned) && r.mentioned.length ? ` ${r.mentioned.length} mention notification${r.mentioned.length === 1 ? '' : 's'} sent.` : ''}`);
      await loadDetail(detailId);
      loadQueue(true);
    } catch (e: any) { flash(e.message); } finally { setBusy(false); }
  };

  const patchTicket = async (patch: Record<string, unknown>) => {
    if (!detailId) return;
    if (detail?.accessGrantLevel === 'view') { flash('This ticket is shared with your tenant at view level — read-only.'); return; }
    setBusy(true);
    try {
      const r = await post(`/api/admin/support/tickets/${detailId}`, patch, 'PATCH');
      if (r.emailed) flash('Status updated — thank-you email sent to the requester.');
      await loadDetail(detailId);
      loadQueue(true);
    } catch (e: any) { flash(e.message); } finally { setBusy(false); }
  };

  const remind = async () => {
    if (!detailId) return;
    setBusy(true);
    try {
      const r = await post(`/api/admin/support/tickets/${detailId}/remind`, {});
      flash(r.emailed ? 'Reminder emailed to the requester.' : 'Reminder recorded on the ticket (no email address on file, or delivery failed).');
      await loadDetail(detailId);
    } catch (e: any) { flash(e.message); } finally { setBusy(false); }
  };

  // Composer engine shelf — engines draft, humans send: canned replies
  // and templates render INTO the composer; a macro applies its field
  // actions and returns its reply as a draft loaded here for review.
  const insertCanned = async (cannedReplyId: string) => {
    if (!detailId || !cannedReplyId) return;
    setBusy(true);
    try {
      const r = await post(`/api/admin/support/tickets/${detailId}/composer`, { kind: 'canned', cannedReplyId });
      setComposerKind('reply');
      setComposer(r.body || '');
      flash('Canned reply loaded as a draft — review it, then Send reply.');
    } catch (e: any) { flash(e.message); } finally { setBusy(false); }
  };

  const insertTemplate = async (code: string) => {
    if (!detailId || !code) return;
    setBusy(true);
    try {
      const r = await post(`/api/admin/support/tickets/${detailId}/composer`, { kind: 'template', code });
      setComposerKind('reply');
      setComposer(r.body || '');
      flash(r.locked
        ? 'Locked master template loaded as a draft — statutory wording, review and send as-is.'
        : 'Template loaded as a draft — review it, then Send reply.');
    } catch (e: any) { flash(e.message); } finally { setBusy(false); }
  };

  const applyMacroById = async (macroId: string) => {
    if (!detailId || !macroId) return;
    setBusy(true);
    try {
      const r = await post(`/api/admin/support/tickets/${detailId}/composer`, { kind: 'macro', macroId });
      const applied = (r.applied || []).filter((a: any) => a.type !== 'reply').map((a: any) => a.type.replace(/_/g, ' '));
      if (r.drafts && r.drafts.length > 0) {
        setComposerKind('reply');
        setComposer(r.drafts[0].body || '');
        flash(`Macro "${r.macro?.name}" applied${applied.length ? ` (${applied.join(', ')})` : ''} — ${r.drafts.length} draft${r.drafts.length === 1 ? '' : 's'} produced; the first is loaded in the composer for review. Nothing has been sent.`);
      } else {
        flash(`Macro "${r.macro?.name}" applied${applied.length ? ` (${applied.join(', ')})` : ''}.`);
      }
      await loadDetail(detailId);
      loadQueue(true);
    } catch (e: any) { flash(e.message); } finally { setBusy(false); }
  };

  const dismissDraft = async (draftId: string) => {
    if (!detailId) return;
    setBusy(true);
    try {
      await post(`/api/admin/support/tickets/${detailId}/composer`, { kind: 'delete_draft', draftId });
      await loadDetail(detailId);
    } catch (e: any) { flash(e.message); } finally { setBusy(false); }
  };

  const loadReport = async () => {
    try {
      const res = await fetch('/api/admin/support/reporting?days=30&scope=all');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load reporting');
      setReport(json);
    } catch (e: any) { flash(e.message); }
  };

  const loadOps = async () => {
    try {
      const res = await fetch('/api/admin/support/ops?scope=all');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load operations');
      setOps(json);
      loadWebhooks();
    } catch (e: any) { flash(e.message); }
  };

  const applyBulk = async (patch: Record<string, unknown>) => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const r = await post('/api/admin/support/tickets/bulk', { ids: [...selected], ...patch });
      flash(`Updated ${r.updated} ticket${r.updated === 1 ? '' : 's'}.`);
      setSelected(new Set());
      loadQueue(true);
    } catch (e: any) { flash(e.message); } finally { setBusy(false); }
  };

  const counts = data?.counts || {};
  const openCount = (counts.open || 0) + (counts.pending || 0);
  const views: { key: string; label: string; icon: any; patch: Record<string, string>; count?: number }[] = [
    { key: 'all', label: 'All tickets', icon: Inbox, patch: { status: '', type: '', category: '', assignee: '' } },
    { key: 'open', label: 'Open', icon: LifeBuoy, patch: { status: 'open' }, count: counts.open },
    { key: 'unassigned', label: 'Unassigned', icon: UserX, patch: { assignee: 'unassigned', status: '' } },
    { key: 'mine', label: 'Mine', icon: User, patch: { assignee: 'me', status: '' } },
    { key: 'pending', label: 'Awaiting requester', icon: Hourglass, patch: { status: 'pending' }, count: counts.pending },
    { key: 'customers', label: 'Customers', icon: Inbox, patch: { type: 'customer', status: '' } },
    { key: 'employees', label: 'Employees', icon: Inbox, patch: { type: 'employee', status: '' } },
    { key: 'sellers', label: 'Sellers', icon: Inbox, patch: { type: 'seller', status: '' } },
    { key: 'dmca', label: 'Legal / DMCA', icon: Scale, patch: { category: 'dmca', status: '' } },
    { key: 'resolved', label: 'Resolved', icon: CheckCheck, patch: { status: 'resolved' }, count: counts.resolved },
  ];
  const activeView = views.find((v) =>
    Object.entries(v.patch).every(([k, val]) => (filters as any)[k] === val))?.key;

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex h-full min-h-0">
      {/* Queue views rail */}
      <aside className="hidden w-52 shrink-0 border-r border-neutral-200 bg-white p-3 lg:block">
        <div className="mb-2 flex items-center gap-2 px-1">
          <LifeBuoy className="h-4 w-4 text-orange-600" />
          <h1 className="text-sm font-semibold text-neutral-800">Support Desk</h1>
        </div>
        <p className="px-1 pb-3 text-xs text-neutral-500">
          {openCount} open across every user type.
        </p>
        <nav className="space-y-0.5">
          {views.map((v) => (
            <button
              key={v.key}
              onClick={() => setParam({ ...v.patch })}
              className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[13px] ${activeView === v.key ? 'bg-orange-50 font-medium text-orange-800' : 'text-neutral-600 hover:bg-neutral-50'}`}
            >
              <span>{v.label}</span>
              {typeof v.count === 'number' && <span className="text-xs text-neutral-400">{v.count}</span>}
            </button>
          ))}
        </nav>
      </aside>

      {/* Queue + detail */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') setParam({ q: searchDraft }); }}
              onBlur={() => { if (searchDraft !== filters.q) setParam({ q: searchDraft }); }}
              placeholder="Search ref, subject, name, email…"
              className="w-64 rounded-lg border border-neutral-200 py-1.5 pl-8 pr-2 text-[13px]"
            />
          </div>
          <Filter className="h-4 w-4 text-neutral-400" />
          <select value={filters.status} onChange={(e) => setParam({ status: e.target.value })} className="rounded-lg border border-neutral-200 px-2 py-1.5 text-[13px]">
            <option value="">Any status</option>
            <option value="open">Open</option><option value="pending">Pending</option>
            <option value="resolved">Resolved</option><option value="closed">Closed</option>
          </select>
          <select value={filters.type} onChange={(e) => setParam({ type: e.target.value })} className="rounded-lg border border-neutral-200 px-2 py-1.5 text-[13px]">
            <option value="">All user types</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filters.category} onChange={(e) => setParam({ category: e.target.value })} className="rounded-lg border border-neutral-200 px-2 py-1.5 text-[13px]">
            <option value="">All departments</option>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filters.priority} onChange={(e) => setParam({ priority: e.target.value })} className="rounded-lg border border-neutral-200 px-2 py-1.5 text-[13px]">
            <option value="">Any priority</option>
            <option value="urgent">Urgent</option><option value="high">High</option>
            <option value="normal">Normal</option><option value="low">Low</option>
          </select>
          <select value={filters.assignee} onChange={(e) => setParam({ assignee: e.target.value })} className="rounded-lg border border-neutral-200 px-2 py-1.5 text-[13px]">
            <option value="">Anyone</option>
            <option value="me">Mine</option>
            <option value="unassigned">Unassigned</option>
            {(data?.assignees || []).map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}
          </select>
          <select value={filters.sort} onChange={(e) => setParam({ sort: e.target.value })} className="rounded-lg border border-neutral-200 px-2 py-1.5 text-[13px]">
            <option value="recent">Recent activity</option>
            <option value="oldest">Oldest activity</option>
            <option value="priority">Priority first</option>
            <option value="sla">SLA due first</option>
            <option value="created_desc">Newest first</option>
            <option value="created_asc">Oldest first</option>
          </select>
          <button onClick={() => loadQueue()} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1.5 text-[13px] text-neutral-600 hover:bg-neutral-50">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
          <button onClick={() => setDeskSettingsOpen((v) => !v)} aria-expanded={deskSettingsOpen} className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1.5 text-[13px] text-neutral-600 hover:bg-neutral-50">
            <Settings className="h-3.5 w-3.5" /> Settings
          </button>
        </div>

        {/* Desk settings — saved views, scope, the reporting and
            operations toggles, configuration, action approvals and my
            notifications, housed together behind the filter bar's
            Settings toggle (owner order 2026-10-31: not scrunched in
            the rail). Block contents unchanged — re-housed verbatim. */}
        {deskSettingsOpen && (
          <div className="border-b border-neutral-200 bg-white px-4 py-3">
            <div className="grid gap-x-6 md:grid-cols-2 xl:grid-cols-3">
        {/* §10 saved views — real rows from support_queues; clicking
            one applies its stored filter set to the desk. */}
        <div className="mt-4 border-t border-neutral-100 pt-3 px-1">
          <label className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Saved views</label>
          <div className="mt-1 space-y-0.5">
            {savedViews.map((v) => (
              <div key={v.id} className="group flex items-center gap-1">
                <button
                  onClick={() => applySavedView(v)}
                  className="flex-1 rounded-lg px-2 py-1.5 text-left text-[13px] text-neutral-600 hover:bg-neutral-50"
                  title={`${v.ownerType}${v.scope === 'master' ? ' · platform' : ''}${v.isShared ? ' · shared' : ''}`}
                >
                  {v.name}
                  <span className="ml-1 text-[11px] text-neutral-400">{v.ownerType === 'personal' ? 'mine' : v.ownerType}</span>
                </button>
                {v.canWrite && (
                  <button
                    onClick={() => deleteSavedView(v)}
                    className="rounded px-1 text-[11px] text-neutral-400 hover:text-red-600"
                    title="Delete this view"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {savedViews.length === 0 && (
              <p className="px-2 text-[11px] leading-snug text-neutral-400">No saved views yet — filter the queue, name it below, and it lives here.</p>
            )}
          </div>
          <div className="mt-2 flex gap-1 px-0">
            <input
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              placeholder="Name current filters…"
              className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-2 py-1 text-[12px]"
            />
            <button
              onClick={saveCurrentView}
              disabled={busy || !newViewName.trim()}
              className="rounded-lg bg-neutral-100 px-2 py-1 text-[12px] text-neutral-600 hover:bg-neutral-200 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
        <div className="mt-4 border-t border-neutral-100 pt-3 px-1">
          <label className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Scope</label>
          <select
            value={filters.scope}
            onChange={(e) => setParam({ scope: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-[13px]"
          >
            <option value="">This tenant</option>
            <option value="all">All tenants (master)</option>
          </select>
          <p className="mt-1 text-[11px] leading-snug text-neutral-400">
            Franchise tickets stay scoped to their tenant; the master desk can widen.
          </p>
        </div>
        <div className="mt-4 border-t border-neutral-100 pt-3 px-1">
          <button
            onClick={() => { const next = !showReport; setShowReport(next); if (next && !report) loadReport(); }}
            className="w-full rounded-lg bg-neutral-100 px-2 py-1.5 text-left text-[13px] text-neutral-600 hover:bg-neutral-200"
          >
            {showReport ? 'Hide reporting' : 'Reporting — last 30 days'}
          </button>
          <p className="mt-1 text-[11px] leading-snug text-neutral-400">
            Real rollups from support_report_daily — volume, response times, SLA attainment, CSAT.
          </p>
        </div>
        <div className="mt-4 border-t border-neutral-100 pt-3 px-1">
          <button
            onClick={() => { const next = !showOps; setShowOps(next); if (next && !ops) loadOps(); }}
            className="w-full rounded-lg bg-neutral-100 px-2 py-1.5 text-left text-[13px] text-neutral-600 hover:bg-neutral-200"
          >
            {showOps ? 'Hide operations' : 'Operations — queue health'}
          </button>
          <p className="mt-1 text-[11px] leading-snug text-neutral-400">
            §13 background jobs — queue health, failed jobs, dead letters, and the failed-ingest quarantine. Read-only.
          </p>
        </div>
        <div className="mt-4 border-t border-neutral-100 pt-3 px-1">
          <Link
            href="/admin/messages/settings"
            className="block w-full rounded-lg bg-neutral-100 px-2 py-1.5 text-left text-[13px] text-neutral-600 hover:bg-neutral-200"
          >
            Configuration
          </Link>
          <p className="mt-1 text-[11px] leading-snug text-neutral-400">
            Teams, SLA policies, routing, escalation, automations, templates — the §10 tables the engines read.
          </p>
        </div>
        <div className="mt-4 border-t border-neutral-100 pt-3 px-1">
          <Link
            href="/admin/messages/approvals"
            className="block w-full rounded-lg bg-neutral-100 px-2 py-1.5 text-left text-[13px] text-neutral-600 hover:bg-neutral-200"
          >
            Action approvals
          </Link>
          <p className="mt-1 text-[11px] leading-snug text-neutral-400">
            §9 approvals queue — refunds, credits, takedowns and other external actions requested from tickets, waiting on an approver.
          </p>
        </div>
        <SupportNotificationsPanel />
            </div>
          </div>
        )}

        {notice && <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-[13px] text-emerald-800">{notice}</div>}
        {error && <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-[13px] text-red-700">{error}</div>}

        {/* Reporting — §17 metrics from the real rollups */}
        {showReport && (
          <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3">
            {!report ? (
              <p className="text-[13px] text-neutral-400">Loading reporting…</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-neutral-400">{report.from} → {report.to} · rollups + live backlog/workload</p>
                  <a
                    href={`/api/admin/support/reporting/export?from=${report.from}&to=${report.to}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
                  >
                    <Download className="h-3.5 w-3.5" /> Export CSV
                  </a>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
                  {[
                    { label: 'Created', value: String(report.totals.ticketsCreated) },
                    { label: 'Resolved', value: String(report.totals.ticketsResolved) },
                    { label: 'Avg first response', value: report.totals.avgFirstResponseMinutes == null ? '—' : `${Math.round(report.totals.avgFirstResponseMinutes)} min` },
                    { label: 'Avg resolution', value: report.totals.avgResolutionMinutes == null ? '—' : `${Math.round(report.totals.avgResolutionMinutes)} min` },
                    { label: 'SLA attainment', value: report.totals.slaAttainmentPct == null ? '—' : `${report.totals.slaAttainmentPct}%`, sub: `${report.totals.slaMet}/${report.totals.slaDue} met · ${report.totals.slaBreached} breached` },
                    { label: 'CSAT', value: report.totals.csatAvg == null ? '—' : String(report.totals.csatAvg), sub: report.totals.csatResponses ? `${report.totals.csatResponses} responses` : 'no responses yet' },
                    { label: 'Backlog (open end)', value: report.totals.backlogOpenEnd == null ? '—' : String(report.totals.backlogOpenEnd), sub: `reopened ${report.totals.ticketsReopened} · reopen rate ${report.totals.reopenRate == null ? '—' : report.totals.reopenRate}` },
                  ].map((card) => (
                    <div key={card.label} className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">{card.label}</p>
                      <p className="text-lg font-semibold text-neutral-800">{card.value}</p>
                      {card.sub && <p className="text-[11px] text-neutral-400">{card.sub}</p>}
                    </div>
                  ))}
                </div>
                {report.byCategory.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                    {report.byCategory.map((row) => (
                      <span key={row.category}>
                        <span className="font-medium text-neutral-600">{CATEGORY_LABEL[row.category] || row.category}:</span>{' '}
                        {row.metrics.ticketsCreated} created · {row.metrics.ticketsResolved} resolved
                        {row.metrics.slaAttainmentPct != null ? ` · SLA ${row.metrics.slaAttainmentPct}%` : ''}
                      </span>
                    ))}
                  </div>
                )}
                {report.byTeam.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                    <span className="font-medium text-neutral-600">Teams:</span>
                    {report.byTeam.map((row) => (
                      <span key={row.teamId}>
                        <span className="font-medium text-neutral-600">{row.teamName || row.teamId}:</span>{' '}
                        {row.metrics.ticketsCreated} created · {row.metrics.ticketsResolved} resolved
                        {row.metrics.slaAttainmentPct != null ? ` · SLA ${row.metrics.slaAttainmentPct}%` : ''}
                      </span>
                    ))}
                  </div>
                )}
                {report.byChannel.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                    <span className="font-medium text-neutral-600">Channels:</span>
                    {report.byChannel.map((row) => (
                      <span key={row.channel}>
                        <span className="font-medium text-neutral-600">{row.channel}:</span>{' '}
                        {row.metrics.ticketsCreated} created · {row.metrics.ticketsResolved} resolved
                        {row.metrics.csatAvg != null ? ` · CSAT ${row.metrics.csatAvg}` : ''}
                      </span>
                    ))}
                  </div>
                )}
                {report.byTenant.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                    <span className="font-medium text-neutral-600">Tenants:</span>
                    {report.byTenant.map((row) => (
                      <span key={row.tenantId}>
                        <span className="font-medium text-neutral-600">{row.tenantName || row.tenantId}:</span>{' '}
                        {row.metrics.ticketsCreated} created · {row.metrics.ticketsResolved} resolved
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                  <span>
                    <span className="font-medium text-neutral-600">Replies per resolved ticket:</span>{' '}
                    {report.totals.repliesPerResolvedTicket == null ? '—' : report.totals.repliesPerResolvedTicket}
                    {' '}({report.totals.publicReplies} public replies · {report.totals.messages} messages)
                  </span>
                  {report.backlogAge && (
                    <span>
                      <span className="font-medium text-neutral-600">Backlog age:</span>{' '}
                      {report.backlogAge.openCount} open now · oldest {fmtAge(report.backlogAge.oldestAgeMinutes)}
                      {report.backlogAge.oldestTicketRef ? ` (${report.backlogAge.oldestTicketRef})` : ''}
                      {' '}· average {fmtAge(report.backlogAge.avgAgeMinutes)}
                    </span>
                  )}
                </div>
                {report.workload.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                    <span className="font-medium text-neutral-600">Workload:</span>
                    {report.workload.map((w) => (
                      <span key={w.staffId || 'unassigned'}>
                        <span className="font-medium text-neutral-600">{w.staffName || (w.staffId ? w.staffId : 'Unassigned')}:</span>{' '}
                        {w.open} open · {w.pending} pending
                        {w.urgentOpen ? ` · ${w.urgentOpen} urgent` : ''}
                        {' '}· {w.resolvedInRange} resolved in window
                      </span>
                    ))}
                  </div>
                )}
                {report.totals.ticketsCreated === 0 && (
                  <p className="text-xs text-neutral-400">No tickets in this window yet — the numbers above are the real rollups, and they are zero.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Operations — §13 queue health over support_jobs (read-only) */}
        {showOps && (
          <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3">
            {!ops ? (
              <p className="text-[13px] text-neutral-400">Loading operations…</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-neutral-400">
                  support_jobs ledger · scope: {ops.scope === 'all' ? 'all tenants (master)' : 'this tenant'} · read-only — queued jobs are claimed and retried automatically by the §13 consumer (in the sweep and /api/cron/support-jobs), so no manual requeue is offered here.
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                  {[
                    { label: 'Queued', value: String(ops.health.byStatus.queued || 0), sub: ops.health.queuedOldestAt ? `oldest ${ops.health.queuedOldestAt.slice(0, 16).replace('T', ' ')}` : 'nothing waiting' },
                    { label: 'Running', value: String(ops.health.byStatus.running || 0), sub: ops.health.staleRunning > 0 ? `${ops.health.staleRunning} stale (>30 min)` : 'none stale' },
                    { label: 'Succeeded', value: String(ops.health.byStatus.succeeded || 0) },
                    { label: 'Failed', value: String(ops.health.byStatus.failed || 0) },
                    { label: 'Dead letter', value: String(ops.health.byStatus.dead_letter || 0) },
                    { label: 'Ingest held', value: String(ops.quarantine.held), sub: 'failed email_ingest_retry' },
                  ].map((card) => (
                    <div key={card.label} className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">{card.label}</p>
                      <p className="text-lg font-semibold text-neutral-800">{card.value}</p>
                      {card.sub && <p className="text-[11px] text-neutral-400">{card.sub}</p>}
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  {ops.health.byType.map((t) => (
                    <div key={t.type} className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                      <span className="font-medium text-neutral-600">{t.type}:</span>
                      <span>{t.total} total</span>
                      {t.lastFinishedAt && <span>last finished {t.lastFinishedAt.slice(0, 16).replace('T', ' ')}</span>}
                      <span>{t.producer ? t.producer : 'no producer in code yet — vocabulary only'}</span>
                    </div>
                  ))}
                </div>
                {ops.failures.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-neutral-600">Recent failures</p>
                    {ops.failures.map((j) => (
                      <div key={j.id} className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                        <span className="font-medium text-neutral-600">{j.type}</span>
                        <span>{j.status}</span>
                        <span>attempts {j.attempts}/{j.maxAttempts}</span>
                        {j.lastError && <span className="text-red-600">{j.lastError}</span>}
                        <span>{(j.finishedAt || j.createdAt).slice(0, 16).replace('T', ' ')}</span>
                      </div>
                    ))}
                  </div>
                )}
                {ops.deadLetters.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-neutral-600">Dead letters — inspection</p>
                    {ops.deadLetters.map((j) => (
                      <div key={j.id} className="rounded-lg border border-neutral-200 bg-white px-3 py-2">
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                          <span className="font-medium text-neutral-600">{j.type}</span>
                          <span>attempts {j.attempts}/{j.maxAttempts}</span>
                          {j.lastError && <span className="text-red-600">{j.lastError}</span>}
                          <span>{(j.finishedAt || j.createdAt).slice(0, 16).replace('T', ' ')}</span>
                        </div>
                        <pre className="mt-1 overflow-x-auto text-[11px] text-neutral-500">{JSON.stringify(j.payload, null, 2)}</pre>
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-neutral-600">Failed-ingest quarantine</p>
                  <p className="text-xs text-neutral-500">
                    Inbound email ingest (§3) is not built yet, so no mail can be held here today — failed email_ingest_retry jobs land in this view the day ingest exists, so inbound mail is never silently dropped. Held now: {ops.quarantine.held}.
                  </p>
                  {ops.quarantine.rows.map((j) => (
                    <div key={j.id} className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                      <span className="font-medium text-neutral-600">{j.status}</span>
                      <span>attempts {j.attempts}/{j.maxAttempts}</span>
                      {j.lastError && <span className="text-red-600">{j.lastError}</span>}
                      <span>{(j.finishedAt || j.createdAt).slice(0, 16).replace('T', ' ')}</span>
                    </div>
                  ))}
                </div>
                {ops.health.byType.every((t) => t.total === 0) && (
                  <p className="text-xs text-neutral-400">No job rows yet — the ledger fills when the sweep and retention runs record themselves after the ship.</p>
                )}
                {/* §16 outbound webhooks — registrations + deliveries */}
                <div className="space-y-2 border-t border-neutral-200 pt-3">
                  <p className="text-xs font-medium text-neutral-600">Outbound webhooks — signed ticket-event deliveries</p>
                  <p className="text-xs text-neutral-500">
                    A registration receives the ticket events it names; each emission queues a delivery the job consumer signs
                    (sha256 HMAC over the canonical payload) and records. The signing secret is write-only — it is never shown back.
                  </p>
                  {webhooks.map((h) => (
                    <div key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                      <span className="font-medium text-neutral-600">{h.name}</span>
                      <span className="font-mono">{h.url}</span>
                      <span>{h.eventTypes.length ? h.eventTypes.join(', ') : 'no events subscribed'}</span>
                      <span>{h.hasSecret ? 'signed' : 'unsigned (no secret)'}</span>
                      <span>{h.isActive ? 'active' : 'inactive'}</span>
                      <button onClick={() => toggleHook(h)} disabled={hookBusy} className="font-medium text-orange-700 underline decoration-dotted underline-offset-2 disabled:opacity-50">
                        {h.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => deleteHook(h)} disabled={hookBusy} className="font-medium text-red-600 underline decoration-dotted underline-offset-2 disabled:opacity-50">
                        Delete
                      </button>
                    </div>
                  ))}
                  {webhooks.length === 0 && <p className="text-xs text-neutral-400">No webhooks registered for this tenant.</p>}
                  <div className="flex flex-wrap gap-1">
                    <input value={hookName} onChange={(e) => setHookName(e.target.value)} placeholder="Name" className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[12px]" />
                    <input value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder="https://example.com/hook" className="min-w-48 flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-1 font-mono text-[12px]" />
                    <input value={hookEvents} onChange={(e) => setHookEvents(e.target.value)} placeholder="Events: reply, status_changed, …" className="min-w-48 flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[12px]" />
                    <input value={hookSecret} onChange={(e) => setHookSecret(e.target.value)} placeholder="Signing secret (write-only)" type="password" className="rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[12px]" />
                    <button onClick={createHook} disabled={hookBusy || !hookName.trim() || !hookUrl.trim()} className="rounded-lg bg-orange-600 px-2 py-1 text-[12px] text-white hover:bg-orange-700 disabled:opacity-50">
                      Register webhook
                    </button>
                  </div>
                  {webhookDeliveries.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-neutral-600">Recent deliveries</p>
                      {webhookDeliveries.map((d) => (
                        <div key={d.id} className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                          <span className="font-medium text-neutral-600">{d.eventType}</span>
                          <span>{d.status}</span>
                          <span>attempts {d.attempts}</span>
                          {d.signature && <span className="font-mono">{d.signature.slice(0, 18)}…</span>}
                          {d.lastError && <span className="text-red-600">{d.lastError}</span>}
                          <span>{d.createdAt.slice(0, 16).replace('T', ' ')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-orange-100 bg-orange-50 px-4 py-2 text-[13px]">
            <span className="font-medium text-orange-900">{selected.size} selected</span>
            <select id="bulk-assignee" className="rounded-lg border border-neutral-200 px-2 py-1" defaultValue="">
              <option value="">Assign to…</option>
              <option value="__none">Unassigned</option>
              {(data?.assignees || []).map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}
            </select>
            <button
              disabled={busy}
              onClick={() => {
                const el = document.getElementById('bulk-assignee') as HTMLSelectElement;
                if (!el.value) return;
                applyBulk({ assignedStaffId: el.value === '__none' ? null : el.value });
              }}
              className="rounded-lg bg-orange-600 px-2.5 py-1 text-white hover:bg-orange-700 disabled:opacity-50"
            >Assign</button>
            <select id="bulk-status" className="rounded-lg border border-neutral-200 px-2 py-1" defaultValue="">
              <option value="">Set status…</option>
              <option value="open">Open</option><option value="pending">Pending</option>
              <option value="resolved">Resolved</option><option value="closed">Closed</option>
            </select>
            <button
              disabled={busy}
              onClick={() => {
                const el = document.getElementById('bulk-status') as HTMLSelectElement;
                if (!el.value) return;
                applyBulk({ status: el.value });
              }}
              className="rounded-lg bg-orange-600 px-2.5 py-1 text-white hover:bg-orange-700 disabled:opacity-50"
            >Apply</button>
            <button onClick={() => setSelected(new Set())} className="text-neutral-500 underline">Clear</button>
          </div>
        )}

        {/* Queue table */}
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="adm-table-wrap"><table className="adm-table">
            <thead className="sticky top-0 bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2"><input type="checkbox" checked={!!data && data.tickets.length > 0 && data.tickets.every((t) => selected.has(t.id))} onChange={(e) => setSelected(e.target.checked && data ? new Set(data.tickets.map((t) => t.id)) : new Set())} /></th>
                <th className="px-2 py-2">Ticket</th>
                <th className="px-2 py-2">Subject</th>
                <th className="px-2 py-2">Requester</th>
                <th className="px-2 py-2">Dept</th>
                <th className="px-2 py-2">Priority</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">SLA</th>
                <th className="px-2 py-2">Assignee</th>
                <th className="px-2 py-2">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={10} className="px-4 py-10 text-center text-neutral-400">Loading the queue…</td></tr>}
              {!loading && data && data.tickets.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-12 text-center">
                  <LifeBuoy className="mx-auto mb-2 h-6 w-6 text-neutral-300" />
                  <p className="font-medium text-neutral-600">No tickets here</p>
                  <p className="mx-auto mt-1 max-w-md text-neutral-400">
                    The queue fills as customers write in from Support, employees and sellers file from their portals,
                    the public DMCA form is used, texts arrive, or a payment webhook files a dispute.
                  </p>
                </td></tr>
              )}
              {!loading && data?.tickets.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setDetailId(t.id)}
                  className={`cursor-pointer border-t border-neutral-100 hover:bg-orange-50/40 ${detailId === t.id ? 'bg-orange-50' : 'bg-white'}`}
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(t.id)} onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(t.id); else next.delete(t.id);
                      setSelected(next);
                    }} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 font-mono text-xs text-neutral-500">
                    {t.ticketRef}
                    {t.status === 'open' && !t.firstPublicReplyAt && <span className="ml-1.5 rounded bg-brand-teal px-1 py-0.5 font-sans text-[10px] font-semibold text-white">NEW</span>}
                    {visibilityBadge(t.visibilityLevel)}
                    {t.accessGrantLevel && <span className="ml-1.5 rounded bg-brand-teal/10 px-1 py-0.5 font-sans text-[10px] font-semibold text-brand-teal">SHARED · {t.accessGrantLevel}</span>}
                  </td>
                  <td className="max-w-[300px] px-2 py-2">
                    <div className="truncate font-medium text-neutral-800">{t.subject}</div>
                    <div className="truncate text-xs text-neutral-400">{t.lastMessagePreview || '—'}</div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="text-neutral-700">{t.requesterName || t.requesterEmail || '—'}</div>
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500">{TYPE_LABEL[t.requesterType] || t.requesterType}</span>
                    {filters.scope === 'all' && t.tenantName && <span className="ml-1 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-600">{t.tenantName}</span>}
                    {typeof (t.metadata as any)?.source === 'string' && <span className="ml-1 rounded bg-neutral-50 px-1.5 py-0.5 text-[11px] text-neutral-400">via {(t.metadata as any).source}</span>}
                  </td>
                  <td className="px-2 py-2 text-neutral-600">{CATEGORY_LABEL[t.category] || t.category}</td>
                  <td className="px-2 py-2"><span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${PRIORITY_STYLE[t.priority] || ''}`}>{t.priority}</span></td>
                  <td className="px-2 py-2"><span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[t.status] || ''}`}>{t.status}</span></td>
                  <td className="px-2 py-2">
                    {(() => { const b = slaBadge(t); return b
                      ? <span className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${b.cls}`}>{b.text}</span>
                      : <span className="text-neutral-300">—</span>; })()}
                  </td>
                  <td className="px-2 py-2 text-neutral-600">{t.assigneeName || <span className="text-neutral-400">Unassigned</span>}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-neutral-500">{fmt(t.lastMessageAt || t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>

        {/* Pagination */}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-neutral-200 bg-white px-4 py-2 text-[13px] text-neutral-500">
            <span>{data.total} ticket{data.total === 1 ? '' : 's'} · page {data.page} of {pages}</span>
            <div className="flex gap-1">
              <button disabled={filters.page <= 1} onClick={() => setParam({ page: String(filters.page - 1) }, false)} className="rounded border border-neutral-200 px-2 py-1 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <button disabled={filters.page >= pages} onClick={() => setParam({ page: String(filters.page + 1) }, false)} className="rounded border border-neutral-200 px-2 py-1 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}

        {/* Detail */}
        {detailId && (
          <div className="max-h-[55%] min-h-[280px] overflow-auto border-t-2 border-neutral-200 bg-white">
            {!detail ? (
              <p className="text-[13px] text-neutral-400">Loading ticket…</p>
            ) : (
              <div className="grid gap-0 lg:grid-cols-[1fr_300px]">
                <div className="">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-neutral-400">{detail.ticket.ticketRef}</span>
                    <h2 className="text-[15px] font-semibold text-neutral-800">{detail.ticket.subject}</h2>
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[detail.ticket.status] || ''}`}>{detail.ticket.status}</span>
                    {visibilityBadge(detail.ticket.visibilityLevel)}
                    {detail.accessGrantLevel && <span className="rounded bg-brand-teal/10 px-1.5 py-0.5 text-[11px] font-medium text-brand-teal">Shared with your tenant · {detail.accessGrantLevel}</span>}
                    {detail.ticket.teamName && <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500">Team: {detail.ticket.teamName}</span>}
                    <button onClick={() => setDetailId(null)} className="ml-auto text-[13px] text-neutral-400 underline">Close</button>
                  </div>
                  <p className="mb-3 text-xs text-neutral-400">
                    Opened {fmtFull(detail.ticket.createdAt)}
                    {detail.ticket.firstPublicReplyAt ? ` · first reply ${fmtFull(detail.ticket.firstPublicReplyAt)}` : ' · no reply yet'}
                    {detail.ticket.resolvedAt ? ` · resolved ${fmtFull(detail.ticket.resolvedAt)}` : ''}
                    {detail.ticket.closedAt ? ` · closed ${fmtFull(detail.ticket.closedAt)}` : ''}
                    {detail.ticket.mergedIntoId ? ' · merged into another ticket' : ''}
                  </p>

                  <div className="space-y-3">
                    {detail.messages.map((m) => (
                      <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] ${m.internal ? 'border border-amber-200 bg-amber-50' : m.from === 'requester' ? 'bg-neutral-100' : 'ml-auto bg-orange-50'}`}>
                        <div className="mb-0.5 flex items-center gap-2 text-[11px] text-neutral-400">
                          <span>{m.internal ? 'Internal note' : m.from === 'requester' ? (detail.ticket.requesterName || 'Requester') : 'Support'}</span>
                          <span>·</span><span>{m.channel}</span><span>·</span><span>{fmtFull(m.at)}</span>
                          {m.presend?.state === 'held' && (
                            <>
                              <span className="rounded bg-brand-teal/10 px-1 py-px font-medium text-brand-teal">
                                Sending — held until {m.presend.heldUntil ? m.presend.heldUntil.slice(0, 19).replace('T', ' ') : '…'}
                              </span>
                              <button
                                onClick={() => undoSend(m.id)}
                                disabled={busy}
                                className="font-medium text-brand-teal underline decoration-dotted underline-offset-2 hover:text-brand-teal/80 disabled:opacity-50"
                              >
                                Undo send
                              </button>
                            </>
                          )}
                          {m.presend?.state === 'undone' && (
                            <span className="rounded bg-neutral-200 px-1 py-px font-medium text-neutral-600">Send undone — never delivered</span>
                          )}
                          {m.text === '[REDACTED]' ? (
                            <span className="rounded bg-red-100 px-1 py-px font-medium text-red-700">Redacted</span>
                          ) : (
                            <button
                              onClick={() => redactMessageUi(m.id)}
                              disabled={complianceBusy}
                              title="§18 redaction: replace this message's content with a marker (audited, row kept)"
                              className="ml-auto font-medium text-red-600 underline decoration-dotted underline-offset-2 hover:text-red-800 disabled:opacity-50"
                            >
                              Redact
                            </button>
                          )}
                        </div>
                        <p className="whitespace-pre-wrap text-neutral-700">{m.text}</p>
                      </div>
                    ))}
                    {detail.messages.length === 0 && <p className="text-[13px] text-neutral-400">No messages on this ticket yet.</p>}
                  </div>

                  {/* Engine drafts — produced by automations, waiting for
                      a human to review, load, and send (or dismiss). */}
                  {detail.drafts.length > 0 && (
                    <div className="mt-4 space-y-2 border-t border-neutral-100 pt-3">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                        Engine drafts — review before sending
                      </h3>
                      {detail.drafts.map((d) => (
                        <div key={d.id} className="rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2 text-[13px]">
                          <p className="whitespace-pre-wrap text-neutral-700">{d.body}</p>
                          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-neutral-400">
                            <span>
                              Drafted {fmtFull(d.createdAt)}
                              {typeof (d.metadata as any)?.automation_name === 'string' ? ` by automation "${String((d.metadata as any).automation_name)}"` : ''}
                              {' '}— not sent.
                            </span>
                            <button onClick={() => { setComposerKind('reply'); setComposer(d.body); }} className="ml-auto rounded bg-violet-600 px-2 py-0.5 text-white hover:bg-violet-700">Load into composer</button>
                            <button onClick={() => dismissDraft(d.id)} disabled={busy} className="rounded border border-neutral-200 bg-white px-2 py-0.5 text-neutral-500 disabled:opacity-50">Dismiss</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Composer */}
                  <div className="mt-4 border-t border-neutral-100 pt-3">
                    <div className="mb-2 flex gap-1">
                      <button onClick={() => setComposerKind('reply')} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] ${composerKind === 'reply' ? 'bg-orange-600 text-white' : 'bg-neutral-100 text-neutral-600'}`}><Send className="h-3.5 w-3.5" /> Reply</button>
                      <button onClick={() => setComposerKind('note')} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] ${composerKind === 'note' ? 'bg-amber-500 text-white' : 'bg-neutral-100 text-neutral-600'}`}><StickyNote className="h-3.5 w-3.5" /> Internal note</button>
                      <button onClick={remind} disabled={busy || detail.ticket.status === 'resolved' || detail.ticket.status === 'closed'} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-neutral-100 px-2 py-1 text-[13px] text-neutral-600 disabled:opacity-40"><BellRing className="h-3.5 w-3.5" /> Send reminder</button>
                    </div>
                    {composerKind === 'reply' && (
                      <div className="mb-2 flex items-center gap-2">
                        <label className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">CC</label>
                        <input
                          value={composerCc}
                          onChange={(e) => setComposerCc(e.target.value)}
                          placeholder="Optional — every address must be on the tenant's CC allow-list"
                          className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-2 py-1 text-[12px]"
                        />
                      </div>
                    )}
                    {/* Engine shelf — macros / canned replies / templates as drafts */}
                    {shelf && (shelf.macros.length > 0 || shelf.cannedReplies.length > 0 || shelf.templates.length > 0) && (
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">Drafts from</span>
                        {shelf.cannedReplies.length > 0 && (
                          <select
                            defaultValue=""
                            disabled={busy}
                            onChange={(e) => { if (e.target.value) insertCanned(e.target.value); e.target.value = ''; }}
                            className="rounded-lg border border-neutral-200 px-2 py-1"
                          >
                            <option value="">Canned reply…</option>
                            {shelf.cannedReplies.map((r) => <option key={r.id} value={r.id}>{r.title}{r.scope === 'master' ? ' (master)' : ''}</option>)}
                          </select>
                        )}
                        {shelf.templates.length > 0 && (
                          <select
                            defaultValue=""
                            disabled={busy}
                            onChange={(e) => { if (e.target.value) insertTemplate(e.target.value); e.target.value = ''; }}
                            className="rounded-lg border border-neutral-200 px-2 py-1"
                          >
                            <option value="">Template…</option>
                            {shelf.templates.map((t) => <option key={t.code} value={t.code}>{t.name}{t.locked ? ' 🔒 locked' : ''}</option>)}
                          </select>
                        )}
                        {shelf.macros.length > 0 && (
                          <select
                            defaultValue=""
                            disabled={busy}
                            onChange={(e) => { if (e.target.value) applyMacroById(e.target.value); e.target.value = ''; }}
                            className="rounded-lg border border-neutral-200 px-2 py-1"
                          >
                            <option value="">Apply macro…</option>
                            {shelf.macros.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        )}
                        <span className="text-[11px] text-neutral-400">Engines draft — you send.</span>
                      </div>
                    )}
                    <textarea
                      value={composer}
                      onChange={(e) => setComposer(e.target.value)}
                      rows={3}
                      disabled={detail.accessGrantLevel === 'view'}
                      placeholder={detail.accessGrantLevel === 'view' ? 'Shared with your tenant at view level — read-only.' : composerKind === 'reply' ? 'Reply to the requester — lands in their portal thread and by email…' : 'Internal note — staff only, never sent to the requester…'}
                      className={`w-full rounded-lg border px-3 py-2 text-[13px] ${composerKind === 'note' ? 'border-amber-200 bg-amber-50/50' : 'border-neutral-200'} disabled:bg-neutral-50 disabled:text-neutral-400`}
                    />
                    <div className="mt-2 flex justify-end">
                      <button onClick={sendComposer} disabled={busy || !composer.trim() || detail.accessGrantLevel === 'view'} className="rounded-lg bg-orange-600 px-3 py-1.5 text-[13px] text-white hover:bg-orange-700 disabled:opacity-50">
                        {composerKind === 'reply' ? 'Send reply' : 'Add note'}
                      </button>
                    </div>
                  </div>

                  {/* History */}
                  {detail.events.length > 0 && (
                    <div className="mt-4 border-t border-neutral-100 pt-3">
                      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">History</h3>
                      <ul className="space-y-1 text-xs text-neutral-500">
                        {detail.events.map((e) => (
                          <li key={e.id}>
                            <span className="text-neutral-400">{fmtFull(e.at)}</span> — <span className="font-medium text-neutral-600">{e.type.replace(/_/g, ' ')}</span>
                            {e.actorLabel ? ` by ${e.actorLabel}` : ''}
                            {e.type === 'status_changed' && e.detail ? ` (${String((e.detail as any).from)} → ${String((e.detail as any).to)})` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* §14 Side conversations — linked threads with their
                      own participants. The requester never sees these. */}
                  <div className="mt-4 border-t border-neutral-100 pt-3">
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                      Side conversations — staff &amp; external, requester-invisible
                    </h3>
                    <div className="space-y-3">
                      {sideConversations.map((s) => (
                        <div key={s.id} className="rounded-lg border border-teal-200 bg-teal-50/40 px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2 text-[12px]">
                            <span className="font-medium text-neutral-700">{s.subject}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${s.status === 'open' ? 'bg-teal-100 text-teal-800' : 'bg-neutral-200 text-neutral-600'}`}>{s.status}</span>
                            <span className="text-neutral-400">
                              {s.participants.map((p) => p.email || 'staff').join(', ') || 'no participants'}
                            </span>
                            {s.status === 'open' && detail.accessGrantLevel !== 'view' && (
                              <button
                                onClick={() => sideAction(s.id, { action: 'close' })}
                                disabled={sideBusy}
                                className="ml-auto text-[11px] font-medium text-neutral-500 underline decoration-dotted underline-offset-2 hover:text-neutral-700 disabled:opacity-50"
                              >
                                Close thread
                              </button>
                            )}
                          </div>
                          <div className="mt-2 space-y-1.5">
                            {s.messages.map((m) => (
                              <p key={m.id} className="text-[13px] text-neutral-700">
                                <span className="text-[11px] text-neutral-400">{m.authorLabel || 'Staff'} · {fmtFull(m.createdAt)} — </span>
                                <span className="whitespace-pre-wrap">{m.body}</span>
                              </p>
                            ))}
                          </div>
                          {s.status === 'open' && detail.accessGrantLevel !== 'view' && (
                            <div className="mt-2 flex gap-1">
                              <input
                                value={sideReplyDrafts[s.id] || ''}
                                onChange={(e) => setSideReplyDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                                placeholder="Reply inside this side thread…"
                                className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[12px]"
                              />
                              <button
                                onClick={() => sideAction(s.id, { action: 'reply', body: sideReplyDrafts[s.id] || '' })}
                                disabled={sideBusy || !(sideReplyDrafts[s.id] || '').trim()}
                                className="rounded-lg bg-teal-700 px-2 py-1 text-[12px] text-white hover:bg-teal-800 disabled:opacity-50"
                              >
                                Reply
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                      {sideConversations.length === 0 && (
                        <p className="text-[13px] text-neutral-400">No side conversations on this ticket.</p>
                      )}
                      {detail.accessGrantLevel !== 'view' && (
                        <div className="rounded-lg border border-neutral-200 px-3 py-2">
                          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Open a side conversation</p>
                          <div className="flex flex-col gap-1">
                            <input
                              value={sideSubject}
                              onChange={(e) => setSideSubject(e.target.value)}
                              placeholder="Subject — e.g. Ask the vendor about the refund"
                              className="rounded-lg border border-neutral-200 px-2 py-1 text-[12px]"
                            />
                            <textarea
                              value={sideBody}
                              onChange={(e) => setSideBody(e.target.value)}
                              placeholder="Opening message…"
                              rows={2}
                              className="rounded-lg border border-neutral-200 px-2 py-1 text-[12px]"
                            />
                            <input
                              value={sideEmails}
                              onChange={(e) => setSideEmails(e.target.value)}
                              placeholder="External participants by email, comma-separated (optional)"
                              className="rounded-lg border border-neutral-200 px-2 py-1 text-[12px]"
                            />
                            <button
                              onClick={openSide}
                              disabled={sideBusy || !sideSubject.trim() || !sideBody.trim()}
                              className="self-start rounded-lg bg-teal-700 px-2 py-1 text-[12px] text-white hover:bg-teal-800 disabled:opacity-50"
                            >
                              Open side conversation
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* §7 Attachments — files live on the ticket. Nothing
                      downloads until its security scan is clean; the
                      state shown is the state in the database. */}
                  <div className="mt-4 border-t border-neutral-100 pt-3">
                    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                      Attachments{attachments.length > 0 ? ` (${attachments.length})` : ''}
                    </h3>
                    {attachments.length === 0 ? (
                      <p className="text-[13px] text-neutral-400">No files attached to this ticket yet.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {attachments.map((a) => {
                          const badge = SCAN_BADGE[a.scanStatus] || SCAN_BADGE.pending;
                          const canDownload = a.scanStatus === 'clean';
                          return (
                            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-100 px-2.5 py-1.5 text-[13px]">
                              <Paperclip className="h-3.5 w-3.5 text-neutral-400" />
                              <span className="font-medium text-neutral-700">{a.filename || 'Untitled file'}</span>
                              <span className="text-neutral-400">{fmtBytes(a.sizeBytes)}</span>
                              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${a.visibility === 'public' ? 'bg-brand-teal/10 text-brand-teal' : 'adm-badge adm-badge-amber'}`}>
                                {a.visibility === 'public' ? 'Visible to requester' : 'Internal'}
                              </span>
                              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${badge.cls}`}>{badge.label}</span>
                              <span className="ml-auto inline-flex items-center gap-1.5">
                                {a.scanStatus === 'failed' && (
                                  <button onClick={() => rescanAttachment(a)} disabled={attachBusy} className="rounded border border-neutral-200 bg-white px-2 py-0.5 text-neutral-600 disabled:opacity-50">Rescan</button>
                                )}
                                <button
                                  onClick={() => downloadAttachment(a)}
                                  disabled={!canDownload}
                                  title={canDownload ? 'Download (signed link, 15 minutes)' : badge.label === 'Awaiting scan' ? 'Awaiting scan — downloads open once the scan is clean' : 'This file cannot be downloaded — it did not pass its security scan'}
                                  className="inline-flex items-center gap-1 rounded bg-neutral-800 px-2 py-0.5 text-white disabled:opacity-40"
                                >
                                  <Download className="h-3.5 w-3.5" /> Download
                                </button>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[13px]">
                      <select
                        value={attachVisibility}
                        onChange={(e) => setAttachVisibility(e.target.value as 'public' | 'internal')}
                        className="rounded-lg border border-neutral-200 px-2 py-1"
                      >
                        <option value="public">Visible to requester</option>
                        <option value="internal">Internal only</option>
                      </select>
                      <input
                        ref={attachInputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (f) uploadAttachment(f);
                        }}
                      />
                      <button
                        onClick={() => attachInputRef.current?.click()}
                        disabled={attachBusy}
                        className="inline-flex items-center gap-1 rounded-lg bg-neutral-100 px-2.5 py-1 text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
                      >
                        <Paperclip className="h-3.5 w-3.5" /> {attachBusy ? 'Attaching…' : 'Attach file'}
                      </button>
                      <span className="text-[11px] text-neutral-400">10 MB per file · 50 MB per ticket · executables and scripts are blocked · new files download after their security scan.</span>
                    </div>
                  </div>
                </div>

                {/* §9 Actions & approvals — every external action
                    (refund, credit, takedown, …) requested from this
                    ticket is recorded on support_actions, gated by the
                    tenant's approval line, and executes only on
                    approval. The record below is the full trail. */}
                <div className="border-t border-neutral-100">
                  <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    <Scale className="h-3.5 w-3.5" />
                    Actions &amp; approvals{ticketActions.length > 0 ? ` (${ticketActions.length})` : ''}
                  </h3>
                  <div className="space-y-2">
                    {ticketActions.length === 0 && (
                      <p className="text-[12px] text-neutral-400">No actions requested from this ticket yet.</p>
                    )}
                    {ticketActions.map((a) => {
                      const badge = ACTION_BADGE[a.status] ?? { label: a.status, cls: 'bg-neutral-100 text-neutral-600' };
                      const spec = ACTION_TYPES.find((t) => t.value === a.actionType);
                      return (
                        <div key={a.id} className="rounded-lg border border-neutral-200 px-2.5 py-2 text-[12px]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-neutral-800">{spec?.label ?? a.actionType}</span>
                            {a.amount != null && <span className="text-neutral-600">${a.amount.toFixed(2)}</span>}
                            {a.targetRef && <span className="break-all text-neutral-400">{a.targetRef}</span>}
                            <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}>{badge.label}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-neutral-400">
                            Requested by {a.requestedByName ?? '—'} · {new Date(a.createdAt).toLocaleString()}
                            {a.approvedByName ? ` · Approved by ${a.approvedByName}` : ''}
                            {a.executedAt ? ` · Executed ${new Date(a.executedAt).toLocaleString()}` : ''}
                          </p>
                          {a.status === 'requested' && actionsAuthority?.canApprove && (
                            rejectingActionId === a.id ? (
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <input
                                  value={rejectReason}
                                  onChange={(e) => setRejectReason(e.target.value)}
                                  placeholder="Reason for rejecting"
                                  className="min-w-40 flex-1 rounded-lg border border-neutral-200 px-2 py-1 text-[12px]"
                                />
                                <button
                                  onClick={() => decideAction(a, 'reject')}
                                  disabled={actionBusy}
                                  className="rounded-lg bg-red-600 px-2 py-1 text-[12px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                  Confirm reject
                                </button>
                                <button
                                  onClick={() => { setRejectingActionId(null); setRejectReason(''); }}
                                  className="rounded-lg bg-neutral-100 px-2 py-1 text-[12px] text-neutral-600 hover:bg-neutral-200"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="mt-2 flex gap-1.5">
                                <button
                                  onClick={() => decideAction(a, 'approve')}
                                  disabled={actionBusy}
                                  className="rounded-lg bg-emerald-600 px-2 py-1 text-[12px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  Approve &amp; execute
                                </button>
                                <button
                                  onClick={() => setRejectingActionId(a.id)}
                                  disabled={actionBusy}
                                  className="rounded-lg bg-neutral-100 px-2 py-1 text-[12px] text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </div>
                            )
                          )}
                          {a.status === 'requested' && !actionsAuthority?.canApprove && (
                            <p className="mt-1 text-[11px] text-neutral-400">Waiting on an approver (support at full level, or the owner).</p>
                          )}
                        </div>
                      );
                    })}
                    <div className="flex flex-wrap items-end gap-1.5 pt-1">
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Action</span>
                        <select
                          value={newActionType}
                          onChange={(e) => setNewActionType(e.target.value)}
                          className="rounded-lg border border-neutral-200 px-2 py-1 text-[12px]"
                        >
                          {ACTION_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </label>
                      {ACTION_TYPES.find((t) => t.value === newActionType)?.needsAmount && (
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Amount ($)</span>
                          <input
                            value={newActionAmount}
                            onChange={(e) => setNewActionAmount(e.target.value)}
                            inputMode="decimal"
                            placeholder="0.00"
                            className="w-24 rounded-lg border border-neutral-200 px-2 py-1 text-[12px]"
                          />
                        </label>
                      )}
                      {ACTION_TYPES.find((t) => t.value === newActionType)?.needsTarget && (
                        <label className="flex min-w-40 flex-1 flex-col gap-0.5">
                          <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Listing id</span>
                          <input
                            value={newActionTarget}
                            onChange={(e) => setNewActionTarget(e.target.value)}
                            placeholder="seller_listings id"
                            className="rounded-lg border border-neutral-200 px-2 py-1 text-[12px]"
                          />
                        </label>
                      )}
                      <button
                        onClick={requestAction}
                        disabled={actionBusy}
                        className="rounded-lg bg-neutral-900 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                      >
                        {actionBusy ? 'Working…' : 'Request action'}
                      </button>
                    </div>
                    <p className="text-[11px] leading-snug text-neutral-400">
                      {actionThresholdCents != null
                        ? `Money actions at or above $${(actionThresholdCents / 100).toFixed(2)} wait for an approver; below the line they execute on request. `
                        : ''}
                      {ACTION_TYPES.find((t) => t.value === newActionType)?.executor === false
                        ? 'This action type has no executor in the platform: approval is recorded, and the action itself must be carried out in its owning module — the record will show it as failed with that reason rather than executed.'
                        : 'Approved actions execute through the owning module (refunds ledger, store credits, listing review) — the full trail stays on this ticket.'}
                    </p>
                  </div>
                </div>

                {/* §8 Links & relations — the ticket's typed links to
                    platform objects (support_links) and its relations
                    to other tickets (support_ticket_relations). Every
                    add is validated server-side against the real
                    target row; every removal lands on the event
                    trail. Relations are navigational — they can also
                    point across tenants when a case spans them. */}
                <div className="border-t border-neutral-100">
                  <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                    <Link2 className="h-3.5 w-3.5" />
                    Links &amp; relations{(ticketLinks.length + ticketRelations.length) > 0 ? ` (${ticketLinks.length + ticketRelations.length})` : ''}
                  </h3>
                  <div className="space-y-2">
                    {ticketLinks.length === 0 && ticketRelations.length === 0 && (
                      <p className="text-[12px] text-neutral-400">Nothing linked yet — connect this case to the order, payment, listing or ticket it is about.</p>
                    )}
                    {ticketLinks.map((l) => (
                      <div key={l.id} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-2 text-[12px]">
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                          {LINK_TYPE_OPTIONS.find((t) => t.value === l.linkType)?.label ?? l.linkType}
                        </span>
                        <span className="font-medium text-neutral-800">{l.targetLabel ?? l.targetId ?? '—'}</span>
                        {l.targetDetail && <span className="text-neutral-500">{l.targetDetail}</span>}
                        {!l.targetLabel && <span className="text-neutral-400">(target no longer visible)</span>}
                        <span className="text-[11px] text-neutral-400">{l.createdByName ? `by ${l.createdByName} · ` : ''}{new Date(l.createdAt).toLocaleString()}</span>
                        <button
                          onClick={() => removeLink(l)}
                          disabled={linkBusy}
                          className="ml-auto rounded-lg bg-neutral-100 px-2 py-1 text-[12px] text-neutral-600 hover:bg-neutral-200 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {ticketRelations.map((r) => (
                      <div key={r.id} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-2 text-[12px]">
                        <span className="rounded bg-brand-teal/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand-teal">
                          {RELATION_TYPE_OPTIONS.find((t) => t.value === r.relationType)?.label ?? r.relationType}
                        </span>
                        <span className="font-mono text-[11px] text-neutral-500">{r.direction === 'incoming' ? '←' : '→'} {r.otherRef ?? '—'}</span>
                        <span className="font-medium text-neutral-800">{r.otherSubject ?? ''}</span>
                        {r.otherStatus && <span className="text-neutral-500">{r.otherStatus}</span>}
                        <span className="text-[11px] text-neutral-400">{new Date(r.createdAt).toLocaleString()}</span>
                        <button
                          onClick={() => removeRelation(r)}
                          disabled={linkBusy}
                          className="ml-auto rounded-lg bg-neutral-100 px-2 py-1 text-[12px] text-neutral-600 hover:bg-neutral-200 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-end gap-1.5 pt-1">
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Link type</span>
                        <select
                          value={newLinkType}
                          onChange={(e) => setNewLinkType(e.target.value)}
                          className="rounded-lg border border-neutral-200 px-2 py-1 text-[12px]"
                        >
                          {LINK_TYPE_OPTIONS.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex min-w-40 flex-1 flex-col gap-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">
                          {LINK_TYPE_OPTIONS.find((t) => t.value === newLinkType)?.hint ?? 'target id'}
                        </span>
                        <input
                          value={newLinkTarget}
                          onChange={(e) => setNewLinkTarget(e.target.value)}
                          placeholder={LINK_TYPE_OPTIONS.find((t) => t.value === newLinkType)?.hint}
                          className="rounded-lg border border-neutral-200 px-2 py-1 text-[12px]"
                        />
                      </label>
                      <button
                        onClick={addLink}
                        disabled={linkBusy || !newLinkTarget.trim()}
                        className="rounded-lg bg-neutral-900 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                      >
                        {linkBusy ? 'Working…' : 'Add link'}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-end gap-1.5">
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Relation</span>
                        <select
                          value={newRelationType}
                          onChange={(e) => setNewRelationType(e.target.value)}
                          className="rounded-lg border border-neutral-200 px-2 py-1 text-[12px]"
                        >
                          {RELATION_TYPE_OPTIONS.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex min-w-40 flex-1 flex-col gap-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">Ticket (from the queue)</span>
                        <select
                          value={newRelationTicket}
                          onChange={(e) => setNewRelationTicket(e.target.value)}
                          className="rounded-lg border border-neutral-200 px-2 py-1 text-[12px]"
                        >
                          <option value="">Choose a ticket…</option>
                          {(data?.tickets ?? []).filter((t) => t.id !== detailId).map((t) => (
                            <option key={t.id} value={t.id}>{t.ticketRef} — {t.subject}</option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-wide text-neutral-400">…or by ref</span>
                        <input
                          value={newRelationRef}
                          onChange={(e) => setNewRelationRef(e.target.value)}
                          placeholder="SUP-0000"
                          className="w-28 rounded-lg border border-neutral-200 px-2 py-1 text-[12px]"
                        />
                      </label>
                      <button
                        onClick={addRelation}
                        disabled={linkBusy || (!newRelationTicket && !newRelationRef.trim())}
                        className="rounded-lg bg-neutral-900 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
                      >
                        {linkBusy ? 'Working…' : 'Add relation'}
                      </button>
                    </div>
                    <p className="text-[11px] leading-snug text-neutral-400">
                      Links point at this tenant&apos;s own orders, payments, listings, sellers, appointments and prescriptions — the target must exist.
                      Relations are navigational and can point at another tenant&apos;s ticket when a case spans tenants (by id, from the queue); the merge workflow (mark as duplicate) stays on the ticket&apos;s own controls.
                    </p>
                  </div>
                </div>

                {/* Meta rail */}
                <div className="space-y-3 border-l border-neutral-100 text-[13px]">
                  <div>
                    <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Requester</h3>
                    <p className="font-medium text-neutral-700">{detail.ticket.requesterName || '—'}</p>
                    <p className="text-neutral-500">{detail.ticket.requesterEmail || 'No email on file'}</p>
                    <p className="mt-0.5"><span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500">{TYPE_LABEL[detail.ticket.requesterType] || detail.ticket.requesterType}</span></p>
                    {detail.ticket.requesterType === 'customer' && detail.ticket.requesterCustomerId && (
                      <a href="/admin/crm" className="mt-1 inline-block text-orange-700 underline">Open in Customers</a>
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Status</label>
                    <select value={detail.ticket.status} disabled={busy} onChange={(e) => patchTicket({ status: e.target.value })} className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5">
                      <option value="open">Open</option><option value="pending">Pending</option>
                      <option value="resolved">Resolved</option><option value="closed">Closed</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Priority</label>
                    <select value={detail.ticket.priority} disabled={busy} onChange={(e) => patchTicket({ priority: e.target.value })} className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5">
                      <option value="low">Low</option><option value="normal">Normal</option>
                      <option value="high">High</option><option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Department</label>
                    <select value={detail.ticket.category} disabled={busy} onChange={(e) => patchTicket({ category: e.target.value })} className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5">
                      {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Assignee</label>
                    <select value={detail.ticket.assignedStaffId || ''} disabled={busy} onChange={(e) => patchTicket({ assignedStaffId: e.target.value || null })} className="mt-1 w-full rounded-lg border border-neutral-200 px-2 py-1.5">
                      <option value="">Unassigned</option>
                      {(data?.assignees || []).map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}
                    </select>
                  </div>

                  {/* §14 — time spent: the ticket row's rollup, the same
                      column §17 reporting folds, maintained by the
                      support_time_entries writer (log/edit/delete
                      below; every change reconciles the rollup and
                      lands in the audit log). */}
                  <div className="rounded-lg border border-neutral-200 p-3">
                    <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Time spent</h3>
                    <p className="font-medium text-neutral-700">{fmtDuration(detail.ticket.timeSpentSeconds ?? 0)}</p>
                    <p className="text-xs text-neutral-400">Agent time logged against this ticket.</p>
                    {timeEntries === null ? (
                      <p className="mt-2 text-xs text-neutral-400">Entries unavailable.</p>
                    ) : (
                      <>
                        {timeEntries.length > 0 && (
                          <ul className="mt-2 space-y-2 border-t border-neutral-100 pt-2">
                            {timeEntries.map((e) => (
                              <li key={e.id} className="text-xs text-neutral-600">
                                {teEditId === e.id ? (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-1.5">
                                      <input value={teEditMin} onChange={(ev) => setTeEditMin(ev.target.value)} inputMode="numeric" placeholder="min" className="w-14 rounded-lg border border-neutral-200 px-1.5 py-1" />
                                      <span className="text-neutral-400">m</span>
                                      <input value={teEditSec} onChange={(ev) => setTeEditSec(ev.target.value)} inputMode="numeric" placeholder="sec" className="w-14 rounded-lg border border-neutral-200 px-1.5 py-1" />
                                      <span className="text-neutral-400">s</span>
                                      <label className="ml-1 flex items-center gap-1">
                                        <input type="checkbox" checked={teEditBillable} onChange={(ev) => setTeEditBillable(ev.target.checked)} /> Billable
                                      </label>
                                    </div>
                                    <input value={teEditNote} onChange={(ev) => setTeEditNote(ev.target.value)} placeholder="Note (optional)" className="w-full rounded-lg border border-neutral-200 px-1.5 py-1" />
                                    <div className="flex gap-1.5">
                                      <button onClick={runSaveEntry} disabled={timeBusy} className="rounded-lg bg-orange-600 px-2 py-1 text-[11px] text-white hover:bg-orange-700 disabled:opacity-50">Save</button>
                                      <button onClick={() => setTeEditId(null)} disabled={timeBusy} className="rounded-lg border border-neutral-200 px-2 py-1 text-[11px] hover:bg-neutral-50 disabled:opacity-50">Cancel</button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex items-center justify-between gap-2">
                                      <span>
                                        <span className="font-medium text-neutral-700">{fmtDuration(e.seconds)}</span>
                                        {e.billable && <span className="ml-1.5 rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-semibold text-emerald-800">BILLABLE</span>}
                                        <span className="ml-1.5 text-neutral-400">{e.staffName || 'Staff'}</span>
                                      </span>
                                      {(timeActor.canAdmin || timeActor.staffId === e.staffId) && detail.accessGrantLevel !== 'view' && (
                                        <span className="flex gap-1">
                                          <button onClick={() => startEditEntry(e)} disabled={timeBusy} className="rounded border border-neutral-200 px-1.5 py-0.5 text-[11px] hover:bg-neutral-50 disabled:opacity-50">Edit</button>
                                          <button onClick={() => runDeleteEntry(e)} disabled={timeBusy} className="rounded border border-neutral-200 px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-50 disabled:opacity-50">Delete</button>
                                        </span>
                                      )}
                                    </div>
                                    {e.note && <p className="mt-0.5 text-neutral-500">{e.note}</p>}
                                    <p className="text-[11px] text-neutral-400">{fmtFull(e.createdAt)}{e.rowVersion > 1 ? ' · edited' : ''}</p>
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {detail.accessGrantLevel !== 'view' && (timeActor.staffId ? (
                          <div className="mt-2 space-y-1.5 border-t border-neutral-100 pt-2">
                            <div className="flex items-center gap-1.5">
                              <input value={teMin} onChange={(ev) => setTeMin(ev.target.value)} inputMode="numeric" placeholder="min" className="w-14 rounded-lg border border-neutral-200 px-1.5 py-1 text-xs" />
                              <span className="text-xs text-neutral-400">m</span>
                              <input value={teSec} onChange={(ev) => setTeSec(ev.target.value)} inputMode="numeric" placeholder="sec" className="w-14 rounded-lg border border-neutral-200 px-1.5 py-1 text-xs" />
                              <span className="text-xs text-neutral-400">s</span>
                              <label className="ml-1 flex items-center gap-1 text-xs text-neutral-600">
                                <input type="checkbox" checked={teBillable} onChange={(ev) => setTeBillable(ev.target.checked)} /> Billable
                              </label>
                            </div>
                            <input value={teNote} onChange={(ev) => setTeNote(ev.target.value)} placeholder="Note (optional)" className="w-full rounded-lg border border-neutral-200 px-1.5 py-1 text-xs" />
                            <button onClick={runLogTime} disabled={timeBusy} className="rounded-lg bg-orange-600 px-2.5 py-1 text-xs text-white hover:bg-orange-700 disabled:opacity-50">Log time</button>
                          </div>
                        ) : (
                          <p className="mt-2 border-t border-neutral-100 pt-2 text-xs text-neutral-400">Time is logged under your staff record — this session has none.</p>
                        ))}
                      </>
                    )}
                  </div>

                  {/* SLA + escalation — the ticket's real clocks, evaluated live */}
                  <div className="rounded-lg border border-neutral-200 p-3">
                    <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">SLA &amp; escalation</h3>
                    {!detail.sla ? (
                      <p className="text-xs text-neutral-400">
                        No SLA policy stamped on this ticket
                        {detail.ticket.resolutionDueAt ? '' : ' — routing assigns one at intake when a rule or category default names a policy.'}
                      </p>
                    ) : (
                      <dl className="space-y-1.5 text-xs text-neutral-600">
                        <div className="flex items-center justify-between gap-2">
                          <dt>First response</dt>
                          <dd className="flex items-center gap-1.5">
                            <span className="text-neutral-400">{fmt(detail.sla.firstResponse.dueAt)}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SLA_STATE_STYLE[detail.sla.firstResponse.state] || ''}`}>{detail.sla.firstResponse.state}</span>
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <dt>Resolution</dt>
                          <dd className="flex items-center gap-1.5">
                            <span className="text-neutral-400">{fmt(detail.sla.resolution.dueAt)}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SLA_STATE_STYLE[detail.sla.resolution.state] || ''}`}>{detail.sla.resolution.state}</span>
                          </dd>
                        </div>
                        {detail.sla.pausedNow && <div className="text-violet-600">Clock paused (pending / on hold) — pause time is excluded from the resolution clock.</div>}
                        {detail.ticket.nextReplyDueAt && <div><dt className="inline font-medium">Next reply due:</dt> <dd className="inline">{fmtFull(detail.ticket.nextReplyDueAt)}</dd></div>}
                      </dl>
                    )}
                    {detail.escalation && (detail.escalation.warnings > 0 || detail.escalation.breaches > 0 || detail.escalation.escalations > 0 || detail.escalation.firstResponseBreachedAt || detail.escalation.resolutionBreachedAt) ? (
                      <div className="mt-2 border-t border-neutral-100 pt-2 text-xs text-neutral-600">
                        {detail.escalation.firstResponseBreachedAt && <p className="text-red-600">First response breached {fmtFull(detail.escalation.firstResponseBreachedAt)}.</p>}
                        {detail.escalation.resolutionBreachedAt && <p className="text-red-600">Resolution breached {fmtFull(detail.escalation.resolutionBreachedAt)}.</p>}
                        <p>
                          {detail.escalation.warnings} warning{detail.escalation.warnings === 1 ? '' : 's'} ·{' '}
                          {detail.escalation.breaches} breach event{detail.escalation.breaches === 1 ? '' : 's'} ·{' '}
                          {detail.escalation.escalations} escalation{detail.escalation.escalations === 1 ? '' : 's'}
                          {detail.escalation.lastEvent ? ` — last: ${detail.escalation.lastEvent.type.replace(/_/g, ' ')} ${fmt(detail.escalation.lastEvent.at)}` : ''}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 border-t border-neutral-100 pt-2 text-xs text-neutral-400">No warnings, breaches, or escalations on this ticket.</p>
                    )}
                  </div>

                  {detail.dmca && (
                    <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3">
                      <h3 className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-violet-700"><Scale className="h-3.5 w-3.5" /> DMCA case file</h3>
                      <dl className="space-y-1 text-xs text-neutral-600">
                        <div><dt className="inline font-medium">Elements complete:</dt> <dd className="inline">{detail.dmca.elements_complete ? 'yes' : `NO — missing: ${(Array.isArray(detail.dmca.missing_elements) ? detail.dmca.missing_elements : []).join(', ') || '—'}`}</dd></div>
                        <div><dt className="inline font-medium">Work:</dt> <dd className="inline">{detail.dmca.copyrighted_work_description || '—'}</dd></div>
                        <div><dt className="inline font-medium">Infringing:</dt> <dd className="inline">{(Array.isArray(detail.dmca.infringing_urls) ? detail.dmca.infringing_urls : []).join(', ') || '—'}</dd></div>
                        <div><dt className="inline font-medium">Signed:</dt> <dd className="inline">{detail.dmca.signature_text || '—'}{detail.dmca.signed_at ? ` (${fmtFull(detail.dmca.signed_at)})` : ''}</dd></div>
                        <div><dt className="inline font-medium">Attestations:</dt> <dd className="inline">good-faith {detail.dmca.good_faith_attested ? '✓' : '✗'} · perjury {detail.dmca.perjury_attested ? '✓' : '✗'}</dd></div>
                        {detail.dmca.counter_notice_due_at && <div><dt className="inline font-medium">Counter-notice by:</dt> <dd className="inline">{fmtFull(detail.dmca.counter_notice_due_at)}</dd></div>}
                      </dl>
                      <label className="mt-2 block text-[11px] font-semibold uppercase tracking-wide text-violet-700">Workflow</label>
                      <select
                        value={detail.dmca.workflow_status}
                        disabled={busy}
                        onChange={async (e) => {
                          setBusy(true);
                          try {
                            const r = await post(`/api/admin/support/tickets/${detailId}/dmca`, { workflowStatus: e.target.value });
                            setDetail((d) => (d ? { ...d, dmca: r.dmca } : d));
                            flash('DMCA workflow updated.');
                          } catch (err: any) { flash(err.message); } finally { setBusy(false); }
                        }}
                        className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-[13px]"
                      >
                        {DMCA_WORKFLOW.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                      </select>
                      <p className="mt-2 text-[11px] leading-snug text-neutral-500">
                        Enforcement (unpublishing a listing, seller strikes) runs through Trust &amp; Safety —
                        if this becomes a seller violation, open the governance case there; this ticket stays the case file.
                      </p>
                    </div>
                  )}

                  {/* §18 Compliance & privacy — redaction history, legal
                      hold, and the DSAR workflow over the §6 privacy
                      record. Every action is gated on support.privacy
                      and lands in the ticket trail + audit log. */}
                  {compliance && (
                    <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
                      <h3 className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-red-700"><ShieldCheck className="h-3.5 w-3.5" /> Compliance &amp; privacy</h3>
                      <dl className="space-y-1 text-xs text-neutral-600">
                        <div><dt className="inline font-medium">Visibility:</dt> <dd className="inline">{compliance.visibilityLevel}</dd></div>
                        <div><dt className="inline font-medium">Legal hold:</dt> <dd className="inline">{compliance.legalHold ? <span className="font-semibold text-red-700">ON — this record is retained under legal hold (deletion erases around it; retention purge skips it)</span> : 'off'}</dd></div>
                        <div><dt className="inline font-medium">Redactions:</dt> <dd className="inline">{compliance.redactions.length} on this ticket</dd></div>
                      </dl>
                      {compliance.privacy ? (
                        <div className="mt-2 border-t border-red-100 pt-2">
                          <p className="text-xs text-neutral-600">
                            <span className="font-medium">Privacy request:</span> {String(compliance.privacy.request_type).replace(/_/g, ' ')}
                            {' · '}<span className="rounded bg-white px-1 py-px font-medium text-red-700">{(compliance.dsarState || '').replace(/_/g, ' ')}</span>
                            {compliance.privacy.identity_verified_at ? ` · identity verified ${fmt(compliance.privacy.identity_verified_at)}` : ' · identity not verified'}
                            {compliance.privacy.statutory_due_at ? ` · due ${fmtFull(compliance.privacy.statutory_due_at)}` : ''}
                            {compliance.privacy.outcome ? ` · outcome: ${compliance.privacy.outcome}` : ''}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {compliance.dsarState === 'received' && (
                              <button
                                disabled={complianceBusy}
                                onClick={async () => {
                                  const method = window.prompt('Verification method (e.g. account sign-in, government ID):');
                                  if (!method) return;
                                  await runCompliance({ action: 'dsar_verify', method }, 'Identity verified — the request can now be fulfilled.');
                                }}
                                className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                              >Verify identity</button>
                            )}
                            {compliance.dsarState === 'identity_verified' && (
                              <>
                                <button
                                  disabled={complianceBusy}
                                  onClick={() => runCompliance({ action: 'dsar_export' }, 'Data-subject export generated and downloaded; the generation is in the fulfillment log.')}
                                  className="rounded border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                                >Generate export</button>
                                {compliance.privacy.request_type === 'deletion' && (
                                  <button
                                    disabled={complianceBusy}
                                    onClick={async () => {
                                      if (!window.confirm('Fulfill this deletion request? Erasable tickets are soft-deleted, message content is redacted, and snapshots are anonymized. Records under a legal hold are NOT erased — they are retained, and the request closes as partly fulfilled with the hold recorded as the reason.')) return;
                                      await runCompliance({ action: 'dsar_deletion' }, 'Deletion fulfilled — tickets soft-deleted and content redacted.');
                                    }}
                                    className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                  >Fulfill deletion</button>
                                )}
                                <button
                                  disabled={complianceBusy}
                                  onClick={async () => {
                                    const outcome = window.prompt('Close outcome — one of: fulfilled, denied, partially_fulfilled');
                                    if (!outcome) return;
                                    await runCompliance({ action: 'dsar_close', outcome }, 'Privacy request closed.');
                                  }}
                                  className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
                                >Close request</button>
                              </>
                            )}
                          </div>
                        </div>
                      ) : detail.ticket.category === 'privacy_request' ? (
                        <div className="mt-2 border-t border-red-100 pt-2">
                          <p className="text-xs text-neutral-500">No privacy record opened on this ticket yet.</p>
                          <button
                            disabled={complianceBusy}
                            onClick={async () => {
                              const requestType = window.prompt('Request type — one of: access, deletion, correction, opt_out');
                              if (!requestType) return;
                              setComplianceBusy(true);
                              try {
                                await post(`/api/admin/support/tickets/${detailId}/privacy`, { requestType });
                                flash('Privacy record opened.');
                                await loadCompliance(detailId!);
                              } catch (e: any) { flash(e.message); } finally { setComplianceBusy(false); }
                            }}
                            className="mt-1.5 rounded border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >Open privacy record</button>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* §5 Access grants — this one ticket shared across
                      tenants (franchise ↔ master). The owning tenant
                      manages grants here; a grantee sees the shared
                      note at their level. Revocation is a stamp —
                      the grant history is kept, never deleted. */}
                  {detail.accessGrantLevel ? (
                    <div className="rounded-lg border border-brand-teal/20 bg-brand-teal/5 p-3">
                      <h3 className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-brand-teal"><KeyRound className="h-3.5 w-3.5" /> Access grants</h3>
                      <p className="text-xs text-neutral-600">
                        This ticket is <span className="font-medium">shared with your tenant</span> at{' '}
                        <span className="rounded bg-white px-1 py-px font-medium text-brand-teal">{detail.accessGrantLevel}</span> level
                        by the owning tenant.
                        {detail.accessGrantLevel === 'view'
                          ? ' View is read-only — replies, notes and changes are disabled.'
                          : ' You can read, reply and work the ticket here; grant management and specialized actions stay with the owning tenant.'}
                      </p>
                    </div>
                  ) : ticketGrants && (
                    <div className="rounded-lg border border-brand-teal/20 bg-brand-teal/5 p-3">
                      <h3 className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-brand-teal"><KeyRound className="h-3.5 w-3.5" /> Access grants</h3>
                      <p className="text-xs text-neutral-500">Share this one ticket with another tenant&apos;s support desk — a grant never widens beyond this ticket.</p>
                      {ticketGrants.length === 0 ? (
                        <p className="mt-2 text-xs text-neutral-500">Not shared — visible only to its owning tenant.</p>
                      ) : (
                        <ul className="mt-2 space-y-1.5">
                          {ticketGrants.map((g) => (
                            <li key={g.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-600">
                              <span className="font-medium text-neutral-700">{g.granteeName || g.granteeTenantId}</span>
                              <span className={`rounded px-1 py-px font-medium ${g.active ? 'bg-brand-teal/10 text-brand-teal' : 'bg-neutral-200 text-neutral-500'}`}>{g.level}</span>
                              {g.active ? (
                                <>
                                  <span>granted {fmt(g.grantedAt)}{g.grantedByName ? ` by ${g.grantedByName}` : ''}</span>
                                  <button disabled={grantBusy} onClick={() => runRevoke(g)} className="ml-auto rounded border border-brand-teal/30 bg-white px-1.5 py-0.5 font-medium text-brand-teal hover:bg-brand-teal/5 disabled:opacity-50">Revoke</button>
                                </>
                              ) : (
                                <span className="text-neutral-400">revoked {fmt(g.revokedAt)}{g.revokedByName ? ` by ${g.revokedByName}` : ''}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-brand-teal/10 pt-2">
                        <select value={grantTenantId} onChange={(e) => setGrantTenantId(e.target.value)} className="max-w-[170px] rounded border border-neutral-200 bg-white px-1.5 py-1 text-xs">
                          <option value="">Share with tenant…</option>
                          {grantTenants.map((t) => <option key={t.id} value={t.id}>{t.name || t.id}</option>)}
                        </select>
                        <select value={grantLevel} onChange={(e) => setGrantLevel(e.target.value as 'view' | 'collaborate')} className="rounded border border-neutral-200 bg-white px-1.5 py-1 text-xs">
                          <option value="view">View — read-only</option>
                          <option value="collaborate">Collaborate — reply &amp; work</option>
                        </select>
                        <button disabled={grantBusy || !grantTenantId} onClick={runGrant} className="rounded bg-brand-teal px-2 py-1 text-xs font-medium text-white hover:bg-brand-teal/90 disabled:opacity-50">Grant access</button>
                      </div>
                      <p className="mt-1.5 text-[11px] text-neutral-400">Granting a tenant that already holds access updates its level. Every grant and revocation lands in the ticket history and the audit log.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
