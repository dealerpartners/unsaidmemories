'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { LifeBuoy, Plus, RefreshCw, X } from 'lucide-react';

// ============================================================================
// Support Configuration — the §10 management surfaces (Sunny's tree §10,
// writers for the tables the step-5 engines read). One page next to the
// desk, one tab per config family:
//   Teams (teams · members · skills) · Hours & SLA (business hours ·
//   holidays · SLA policies) · Routing · Escalation · Categories ·
//   Channels · Automations · Content (macros · canned replies ·
//   templates · signatures) · Notifications (per-staff prefs).
//
// Every value here is a real row in the designed store, written through
// /api/admin/support/config (support-module gated, tenant-scoped,
// audited). Master-scope rows are platform defaults; a tenant desk
// refines them with an override row instead of editing them. Locked
// master templates (statutory wording) refuse tenant rows entirely —
// the server enforces all of it; this page only renders the same rules.
// ============================================================================

type Row = Record<string, any>;
type Staff = { id: string; display_name: string | null; role: string | null };
type ConfigData = {
  ok: boolean; tenant: string; masterActor: boolean;
  staff: Staff[]; resources: Record<string, Row[]>;
};

type FieldKind = 'text' | 'number' | 'checkbox' | 'select' | 'textarea' | 'json' | 'tags' | 'date';
type UiField = {
  key: string; label: string; kind: FieldKind; required?: boolean; createOnly?: boolean;
  placeholder?: string; options?: { value: string; label: string }[];
  optionsFrom?: 'staff' | 'teams' | 'slaPolicies' | 'businessHours' | 'categoryCodes';
  emptyLabel?: string; wide?: boolean;
};
type UiResource = {
  key: string; title: string; blurb: string; kind: 'config' | 'ops' | 'registry';
  deleteMode: 'deactivate' | 'delete'; fields: UiField[]; summary: (r: Row) => string;
};

const PRIORITIES = ['low', 'normal', 'high', 'urgent'].map((v) => ({ value: v, label: v }));
const EVENT_KIND_SUGGESTIONS = ['sla_warning', 'sla_breached', 'escalated', 'automation', 'mention'];

const RESOURCES: UiResource[] = [
  {
    key: 'teams', title: 'Teams', kind: 'config', deleteMode: 'deactivate',
    blurb: 'Support teams. Routing assigns tickets to a team, then picks an available member by strategy.',
    summary: (r) => `${r.code} — ${r.name}`,
    fields: [
      { key: 'code', label: 'Code', kind: 'text', required: true, placeholder: 'front_line' },
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'description', label: 'Description', kind: 'text' },
    ],
  },
  {
    key: 'teamMembers', title: 'Team members', kind: 'ops', deleteMode: 'delete',
    blurb: 'Who sits on each team. Only available members under their max-concurrent cap are picked by routing.',
    summary: (r) => `${r.staff_id?.slice(0, 8)}… on ${r.team_id?.slice(0, 8)}…`,
    fields: [
      { key: 'team_id', label: 'Team', kind: 'select', required: true, optionsFrom: 'teams' },
      { key: 'staff_id', label: 'Staff member', kind: 'select', required: true, optionsFrom: 'staff' },
      { key: 'role', label: 'Role on team', kind: 'text', placeholder: 'lead · agent · …' },
      { key: 'max_concurrent', label: 'Max concurrent open tickets', kind: 'number', emptyLabel: 'No cap' },
      { key: 'is_available', label: 'Available for assignment', kind: 'checkbox' },
    ],
  },
  {
    key: 'staffSkills', title: 'Staff skills', kind: 'ops', deleteMode: 'delete',
    blurb: 'Skills the skills-based routing strategy matches on. A rule’s required skills default to the ticket’s category code.',
    summary: (r) => `${r.skill_code} · level ${r.level}`,
    fields: [
      { key: 'staff_id', label: 'Staff member', kind: 'select', required: true, optionsFrom: 'staff' },
      { key: 'skill_code', label: 'Skill code', kind: 'text', required: true, placeholder: 'billing' },
      { key: 'level', label: 'Level (1–5)', kind: 'number' },
    ],
  },
  {
    key: 'businessHours', title: 'Business hours', kind: 'config', deleteMode: 'deactivate',
    blurb: 'Calendars the SLA clock runs on. Schedule is JSON: day keys sun–sat, each a list of [startHour, endHour) local intervals — e.g. {"mon":[[9,17]],"tue":[[9,17]]}. Hours may be fractional (9.5 = 09:30).',
    summary: (r) => `${r.name} (${r.timezone})`,
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'timezone', label: 'Timezone (IANA)', kind: 'text', required: true, placeholder: 'America/Chicago' },
      { key: 'schedule', label: 'Schedule (JSON)', kind: 'json', required: true, wide: true },
      { key: 'is_default', label: 'Default calendar', kind: 'checkbox' },
    ],
  },
  {
    key: 'holidays', title: 'Holidays', kind: 'config', deleteMode: 'delete',
    blurb: 'A holiday date is fully non-business for its calendar, whatever the weekday schedule says.',
    summary: (r) => `${String(r.holiday_date).slice(0, 10)} — ${r.name}`,
    fields: [
      { key: 'business_hours_id', label: 'Calendar', kind: 'select', required: true, optionsFrom: 'businessHours' },
      { key: 'holiday_date', label: 'Date', kind: 'date', required: true },
      { key: 'name', label: 'Name', kind: 'text', required: true },
    ],
  },
  {
    key: 'slaPolicies', title: 'SLA policies', kind: 'config', deleteMode: 'deactivate',
    blurb: 'First-response / next-reply / resolution targets in minutes. A blank target means that clock is not promised. Routing rules and category defaults point tickets at a policy; the stamps land on the ticket at intake.',
    summary: (r) => r.name,
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'first_response_minutes', label: 'First response (minutes)', kind: 'number' },
      { key: 'next_reply_minutes', label: 'Next reply (minutes)', kind: 'number' },
      { key: 'resolution_minutes', label: 'Resolution (minutes)', kind: 'number' },
      { key: 'uses_business_hours', label: 'Clock runs on business hours', kind: 'checkbox' },
      { key: 'business_hours_id', label: 'Calendar', kind: 'select', optionsFrom: 'businessHours', emptyLabel: '—' },
      { key: 'is_default', label: 'Default policy', kind: 'checkbox' },
    ],
  },
  {
    key: 'routingRules', title: 'Routing rules', kind: 'config', deleteMode: 'deactivate',
    blurb: 'Evaluated in rule-order; the first fully-matching rule wins. Conditions speak the shared grammar — {"field":"category","op":"eq","value":"billing"}, groups with all/any/none, plus a "skills" list for the skills strategy. When no rule matches, the category’s default team + SLA apply.',
    summary: (r) => `#${r.rule_order} ${r.name}`,
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'rule_order', label: 'Rule order', kind: 'number' },
      { key: 'conditions', label: 'Conditions (JSON)', kind: 'json', wide: true, placeholder: '{}' },
      { key: 'strategy', label: 'Assignment strategy', kind: 'select', options: ['round_robin', 'least_loaded', 'skills_based', 'manual'].map((v) => ({ value: v, label: v })) },
      { key: 'target_team_id', label: 'Target team', kind: 'select', optionsFrom: 'teams', emptyLabel: '—' },
      { key: 'target_staff_id', label: 'Target staff (wins over strategy)', kind: 'select', optionsFrom: 'staff', emptyLabel: '—' },
      { key: 'set_priority', label: 'Set priority', kind: 'select', options: PRIORITIES, emptyLabel: '—' },
      { key: 'set_tags', label: 'Add tags (comma-separated)', kind: 'tags' },
      { key: 'sla_policy_id', label: 'SLA policy', kind: 'select', optionsFrom: 'slaPolicies', emptyLabel: '—' },
    ],
  },
  {
    key: 'escalationRules', title: 'Escalation rules', kind: 'config', deleteMode: 'deactivate',
    blurb: 'The sweep evaluates these against open tickets. Condition JSON per trigger: sla_warning {"threshold_minutes":30} · unassigned_age {"age_minutes":120} · reopened_n {"count":2} · breached {}. Action config: notify {"staff_id":…,"team_id":…,"assignee":true} · reassign {"team_id":…,"staff_id":…} · raise_priority {"steps":1} · add_watcher {"staff_id":…}.',
    summary: (r) => `${r.name} (${r.trigger_type} → ${r.action})`,
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'trigger_type', label: 'Trigger', kind: 'select', required: true, options: ['sla_warning', 'breached', 'unassigned_age', 'reopened_n'].map((v) => ({ value: v, label: v })) },
      { key: 'condition', label: 'Condition (JSON)', kind: 'json', wide: true, placeholder: '{}' },
      { key: 'action', label: 'Action', kind: 'select', required: true, options: ['notify', 'reassign', 'raise_priority', 'add_watcher'].map((v) => ({ value: v, label: v })) },
      { key: 'action_config', label: 'Action config (JSON)', kind: 'json', wide: true, placeholder: '{}' },
    ],
  },
  {
    key: 'categories', title: 'Categories', kind: 'registry', deleteMode: 'deactivate',
    blurb: 'The department registry — category codes are global (ticket.category is a foreign key to this table), so only the master desk edits it. Defaults apply when no routing rule matches. Deactivate instead of deleting: tickets reference the code.',
    summary: (r) => `${r.code} — ${r.name}`,
    fields: [
      { key: 'code', label: 'Code', kind: 'text', required: true, createOnly: true, placeholder: 'billing' },
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'parent_code', label: 'Parent category', kind: 'select', optionsFrom: 'categoryCodes', emptyLabel: '—' },
      { key: 'default_team_id', label: 'Default team', kind: 'select', optionsFrom: 'teams', emptyLabel: '—' },
      { key: 'default_sla_policy_id', label: 'Default SLA policy', kind: 'select', optionsFrom: 'slaPolicies', emptyLabel: '—' },
      { key: 'regulated', label: 'Regulated (§6 gates apply)', kind: 'checkbox' },
      { key: 'sort_order', label: 'Sort order', kind: 'number' },
    ],
  },
  {
    key: 'channels', title: 'Channels', kind: 'config', deleteMode: 'deactivate',
    blurb: 'Per-channel intake configuration: sending domain, allow/block lists, spam quarantine, the reopen window (days a requester can reopen a resolved ticket by writing again), and attachment caps from §7.',
    summary: (r) => `${r.code} — ${r.name}`,
    fields: [
      { key: 'code', label: 'Channel', kind: 'select', required: true, createOnly: true, options: ['email', 'web_form', 'in_app', 'api', 'chat', 'phone', 'sms'].map((v) => ({ value: v, label: v })) },
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'sending_domain', label: 'Sending domain', kind: 'text', placeholder: 'support.example.com' },
      { key: 'allow_list', label: 'Allow list (JSON array)', kind: 'json', wide: true, placeholder: '[]' },
      { key: 'block_list', label: 'Block list (JSON array)', kind: 'json', wide: true, placeholder: '[]' },
      { key: 'spam_quarantine', label: 'Quarantine suspected spam', kind: 'checkbox' },
      { key: 'reopen_window_days', label: 'Reopen window (days)', kind: 'number' },
      { key: 'max_attachment_bytes', label: 'Max attachment bytes', kind: 'number' },
      { key: 'max_ticket_attachment_bytes', label: 'Max bytes per ticket', kind: 'number' },
      { key: 'blocked_extensions', label: 'Blocked extensions (comma-separated)', kind: 'tags' },
      { key: 'config', label: 'Extra config (JSON)', kind: 'json', wide: true, placeholder: '{}' },
    ],
  },
  {
    key: 'automations', title: 'Automations', kind: 'config', deleteMode: 'deactivate',
    blurb: 'Trigger + conditions + actions, in the engines’ grammar. Actions are validated against the shared action grammar at save time. Dry-run automations log their run but write nothing; the kill switch on ANY active automation halts the tenant’s automations entirely.',
    summary: (r) => `${r.name} (${r.trigger_event})`,
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'trigger_event', label: 'Trigger', kind: 'select', required: true, options: ['ticket_created', 'ticket_updated', 'message_received', 'time_based'].map((v) => ({ value: v, label: v })) },
      { key: 'conditions', label: 'Conditions (JSON)', kind: 'json', wide: true, placeholder: '{}' },
      { key: 'actions', label: 'Actions (JSON array)', kind: 'json', required: true, wide: true, placeholder: '[{"type":"add_tags","tags":["vip"]}]' },
      { key: 'dry_run', label: 'Dry run (log only)', kind: 'checkbox' },
      { key: 'kill_switch', label: 'Kill switch (halts all automations)', kind: 'checkbox' },
    ],
  },
  {
    key: 'macros', title: 'Macros', kind: 'config', deleteMode: 'deactivate',
    blurb: 'Named action lists agents apply from the composer. Reply actions become drafts — engines draft, humans send.',
    summary: (r) => r.name,
    fields: [
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'description', label: 'Description', kind: 'text' },
      { key: 'actions', label: 'Actions (JSON array)', kind: 'json', required: true, wide: true, placeholder: '[{"type":"set_priority","value":"high"}]' },
    ],
  },
  {
    key: 'cannedReplies', title: 'Canned replies', kind: 'config', deleteMode: 'deactivate',
    blurb: 'Reusable reply text for the composer, rendered against the ticket ({{ticket.ref}}, {{requester.name}}) with the agent’s signature appended.',
    summary: (r) => r.title,
    fields: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'body', label: 'Body', kind: 'textarea', required: true, wide: true },
      { key: 'category_code', label: 'Category', kind: 'select', optionsFrom: 'categoryCodes', emptyLabel: '—' },
      { key: 'locale', label: 'Locale', kind: 'text', placeholder: 'en-US' },
    ],
  },
  {
    key: 'templates', title: 'Templates', kind: 'config', deleteMode: 'deactivate',
    blurb: 'Message templates with locale fallback (exact → language → en-US). A master template marked Locked is statutory wording (DMCA / legal): tenant rows for its code can never take effect, and the writer refuses them.',
    summary: (r) => `${r.code} (${r.locale})`,
    fields: [
      { key: 'code', label: 'Code', kind: 'text', required: true, placeholder: 'ticket_received' },
      { key: 'name', label: 'Name', kind: 'text', required: true },
      { key: 'channel', label: 'Channel', kind: 'select', options: ['email', 'sms', 'in_app'].map((v) => ({ value: v, label: v })) },
      { key: 'subject', label: 'Subject', kind: 'text' },
      { key: 'body', label: 'Body', kind: 'textarea', required: true, wide: true },
      { key: 'locale', label: 'Locale', kind: 'text', placeholder: 'en-US' },
      { key: 'locked', label: 'Locked (master statutory wording)', kind: 'checkbox' },
    ],
  },
  {
    key: 'signatures', title: 'Signatures', kind: 'ops', deleteMode: 'delete',
    blurb: 'Staff signatures. Resolution: the team default for the ticket’s team, else the staff default, else the latest signature.',
    summary: (r) => `${r.staff_id?.slice(0, 8)}…`,
    fields: [
      { key: 'staff_id', label: 'Staff member', kind: 'select', required: true, optionsFrom: 'staff' },
      { key: 'team_id', label: 'Team (blank = all teams)', kind: 'select', optionsFrom: 'teams', emptyLabel: '—' },
      { key: 'body', label: 'Signature', kind: 'textarea', required: true, wide: true },
      { key: 'is_default', label: 'Default', kind: 'checkbox' },
    ],
  },
  {
    key: 'notificationPrefs', title: 'Notification preferences', kind: 'ops', deleteMode: 'delete',
    blurb: 'Per staff member and event kind: which channel, on or off, digest or immediate. Event kinds the desk actually writes: sla_warning, sla_breached, escalated, automation, mention.',
    summary: (r) => `${r.event_kind} · ${r.channel}`,
    fields: [
      { key: 'staff_id', label: 'Staff member', kind: 'select', required: true, optionsFrom: 'staff' },
      { key: 'event_kind', label: 'Event kind', kind: 'text', required: true, placeholder: 'sla_warning' },
      { key: 'channel', label: 'Channel', kind: 'select', required: true, options: ['in_app', 'email', 'push'].map((v) => ({ value: v, label: v })) },
      { key: 'enabled', label: 'Enabled', kind: 'checkbox' },
      { key: 'digest', label: 'Digest (batched)', kind: 'checkbox' },
    ],
  },
];

const RES = Object.fromEntries(RESOURCES.map((r) => [r.key, r]));

const TABS: { key: string; label: string; resources: string[] }[] = [
  { key: 'teams', label: 'Teams', resources: ['teams', 'teamMembers', 'staffSkills'] },
  { key: 'hours', label: 'Hours & SLA', resources: ['businessHours', 'holidays', 'slaPolicies'] },
  { key: 'routing', label: 'Routing', resources: ['routingRules'] },
  { key: 'escalation', label: 'Escalation', resources: ['escalationRules'] },
  { key: 'categories', label: 'Categories', resources: ['categories'] },
  { key: 'channels', label: 'Channels', resources: ['channels'] },
  { key: 'automations', label: 'Automations', resources: ['automations'] },
  { key: 'content', label: 'Content', resources: ['macros', 'cannedReplies', 'templates', 'signatures'] },
  { key: 'notifications', label: 'Notifications', resources: ['notificationPrefs'] },
];

// ── form plumbing ───────────────────────────────────────────────────

type FormValues = Record<string, string | boolean>;

function initialValues(res: UiResource, row: Row | null): FormValues {
  const out: FormValues = {};
  for (const f of res.fields) {
    const v = row ? row[f.key] : undefined;
    if (f.kind === 'checkbox') out[f.key] = !!v;
    else if (f.kind === 'json') out[f.key] = v == null ? (f.placeholder ?? '') : JSON.stringify(v, null, 2);
    else if (f.kind === 'tags') out[f.key] = Array.isArray(v) ? v.join(', ') : '';
    else if (f.kind === 'date') out[f.key] = v ? String(v).slice(0, 10) : '';
    else out[f.key] = v == null ? '' : String(v);
  }
  return out;
}

function buildPayload(
  res: UiResource, values: FormValues, editing: Row | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of res.fields) {
    if (editing && f.createOnly) continue;
    const v = values[f.key];
    if (f.kind === 'checkbox') { out[f.key] = !!v; continue; }
    const s = String(v ?? '').trim();
    if (s === '') {
      // Empty optional field: skip it so the column default applies on
      // create and the stored value is kept on update (never NULL into a
      // NOT NULL column). Selects for nullable references opt out below.
      if (f.kind === 'number' || f.kind === 'json' || f.kind === 'tags') continue;
      if (!f.required) { out[f.key] = f.kind === 'select' ? null : undefined; continue; }
      throw new Error(`${f.label} is required`);
    }
    if (f.kind === 'number') {
      const n = Number(s);
      if (Number.isNaN(n)) throw new Error(`${f.label} must be a number`);
      out[f.key] = n;
    } else if (f.kind === 'json') {
      try { out[f.key] = JSON.parse(s); } catch { throw new Error(`${f.label} is not valid JSON`); }
    } else if (f.kind === 'tags') {
      out[f.key] = s.split(',').map((x) => x.trim()).filter(Boolean);
    } else {
      out[f.key] = s;
    }
  }
  return out;
}

async function api(method: string, body: Record<string, unknown>) {
  const res = await fetch('/api/admin/support/config', {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

function optionsFor(f: UiField, data: ConfigData): { value: string; label: string }[] {
  if (f.options) return f.options;
  const rows = data.resources;
  switch (f.optionsFrom) {
    case 'staff': return data.staff.map((s) => ({ value: s.id, label: s.display_name || s.id.slice(0, 8) }));
    case 'teams': return (rows.teams ?? []).map((r) => ({ value: r.id, label: `${r.name} (${r.scope})` }));
    case 'slaPolicies': return (rows.slaPolicies ?? []).map((r) => ({ value: r.id, label: `${r.name} (${r.scope})` }));
    case 'businessHours': return (rows.businessHours ?? []).map((r) => ({ value: r.id, label: `${r.name} (${r.scope})` }));
    case 'categoryCodes': return (rows.categories ?? []).map((r) => ({ value: r.code, label: r.code }));
    default: return [];
  }
}

const inputCls = 'w-full rounded-lg border border-neutral-200 px-2 py-1.5 text-[13px] text-neutral-700';
const labelCls = 'block text-[11px] font-medium uppercase tracking-wide text-neutral-400';

function ResourceSection({ resKey, data, reload }: { resKey: string; data: ConfigData; reload: () => void }) {
  const res = RES[resKey];
  const rows = data.resources[resKey] ?? [];
  const [editing, setEditing] = useState<Row | null | undefined>(undefined); // undefined = closed, null = new
  const [values, setValues] = useState<FormValues>({});
  const [scope, setScope] = useState<'tenant' | 'master'>('tenant');
  const [inheritsFromId, setInheritsFromId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const masterRows = useMemo(
    () => rows.filter((r) => r.scope === 'master' && !r.locked_by_master),
    [rows],
  );
  const readOnly = res.kind === 'registry' && !data.masterActor;

  const openForm = (row: Row | null) => {
    setEditing(row);
    setValues(initialValues(res, row));
    setScope(row?.scope === 'master' ? 'master' : 'tenant');
    setInheritsFromId('');
    setError(null);
  };

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const payload = buildPayload(res, values, editing ?? null);
      if (editing) {
        await api('PATCH', { resource: resKey, id: editing.id, ...payload });
      } else {
        const body: Record<string, unknown> = { resource: resKey, ...payload };
        if (res.kind === 'config') {
          body.scope = scope;
          if (scope === 'tenant' && inheritsFromId) body.inheritsFromId = inheritsFromId;
        }
        await api('POST', body);
      }
      setEditing(undefined);
      reload();
    } catch (e: any) {
      setError(e?.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const act = async (row: Row, action: 'remove' | 'toggle') => {
    setBusy(true); setError(null);
    try {
      if (action === 'remove') {
        const label = res.deleteMode === 'delete' ? 'Delete' : 'Deactivate';
        if (!window.confirm(`${label} “${res.summary(row)}”?`)) return;
        await api('DELETE', { resource: resKey, id: row.id });
      } else {
        await api('PATCH', { resource: resKey, id: row.id, isActive: !row.is_active });
      }
      reload();
    } catch (e: any) {
      setError(e?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const rowReadOnly = (r: Row) =>
    readOnly || (res.kind === 'config' && r.scope === 'master' && !data.masterActor) ||
    (res.kind === 'config' && !!r.locked_by_master && !data.masterActor);

  return (
    <section className="rounded-lg border border-neutral-200 bg-white">
      <div className="flex items-start justify-between gap-4 border-b border-neutral-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-800">{res.title}</h2>
          <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-neutral-500">{res.blurb}</p>
          {readOnly && (
            <p className="mt-1 text-xs font-medium text-amber-700">
              Read-only here — the registry is platform-global and only the master tenant’s desk can change it.
            </p>
          )}
        </div>
        {!readOnly && editing === undefined && (
          <button
            onClick={() => openForm(null)}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-orange-600 px-2.5 py-1.5 text-[13px] font-medium text-white hover:bg-orange-700"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </div>

      {error && (
        <div className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</div>
      )}

      {editing !== undefined && (
        <div className="border-b border-neutral-100 px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-neutral-700">
              {editing ? `Edit — ${res.summary(editing)}` : `New ${res.title.replace(/s$/, '')}`}
            </h3>
            <button onClick={() => setEditing(undefined)} className="text-neutral-400 hover:text-neutral-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {res.fields.map((f) => {
              if (editing && f.createOnly) return null;
              const opts = f.kind === 'select' ? optionsFor(f, data) : [];
              return (
                <div key={f.key} className={f.wide ? 'md:col-span-2' : ''}>
                  <label className={labelCls}>{f.label}{f.required ? ' *' : ''}</label>
                  {f.kind === 'checkbox' ? (
                    <input
                      type="checkbox" className="mt-2 h-4 w-4 accent-orange-600"
                      checked={!!values[f.key]}
                      onChange={(e) => setValues({ ...values, [f.key]: e.target.checked })}
                    />
                  ) : f.kind === 'select' ? (
                    <select
                      className={inputCls} value={String(values[f.key] ?? '')}
                      onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    >
                      <option value="">{f.emptyLabel ?? (f.required ? 'Choose…' : '—')}</option>
                      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : f.kind === 'textarea' || f.kind === 'json' ? (
                    <textarea
                      className={`${inputCls} font-mono`} rows={f.kind === 'json' ? 5 : 4}
                      value={String(values[f.key] ?? '')} placeholder={f.placeholder}
                      onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    />
                  ) : (
                    <input
                      type={f.kind === 'number' ? 'number' : f.kind === 'date' ? 'date' : 'text'}
                      className={inputCls} value={String(values[f.key] ?? '')} placeholder={f.placeholder}
                      onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                    />
                  )}
                  {f.key === 'event_kind' && (
                    <p className="mt-1 text-[11px] text-neutral-400">Known kinds: {EVENT_KIND_SUGGESTIONS.join(' · ')}</p>
                  )}
                </div>
              );
            })}
            {!editing && res.kind === 'config' && (
              <>
                <div>
                  <label className={labelCls}>Scope</label>
                  <select className={inputCls} value={scope} onChange={(e) => setScope(e.target.value as 'tenant' | 'master')}>
                    <option value="tenant">Tenant (this desk’s tenant)</option>
                    {data.masterActor && <option value="master">Master (platform default)</option>}
                  </select>
                  <p className="mt-1 text-[11px] leading-snug text-neutral-400">
                    Master rows are the defaults every tenant inherits; tenant rows refine them for one tenant.
                  </p>
                </div>
                {scope === 'tenant' && masterRows.length > 0 && (
                  <div>
                    <label className={labelCls}>Refines master row (optional)</label>
                    <select className={inputCls} value={inheritsFromId} onChange={(e) => setInheritsFromId(e.target.value)}>
                      <option value="">— none —</option>
                      {masterRows.map((r) => <option key={r.id} value={r.id}>{res.summary(r)}</option>)}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={submit} disabled={busy}
              className="rounded-lg bg-orange-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Create'}
            </button>
            <button
              onClick={() => setEditing(undefined)}
              className="rounded-lg bg-neutral-100 px-3 py-1.5 text-[13px] text-neutral-600 hover:bg-neutral-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-neutral-400">
          Nothing configured yet — the engines read an empty table here, so nothing fires from this family until a row exists.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-neutral-700">{res.summary(r)}</p>
                <p className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-neutral-400">
                  {res.kind === 'config' && (
                    <span className={`rounded px-1.5 py-0.5 ${r.scope === 'master' ? 'bg-violet-100 text-violet-700' : 'adm-badge'}`}>
                      {r.scope === 'master' ? 'Master default' : 'Tenant'}
                    </span>
                  )}
                  {r.is_active === false && <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-neutral-500">Inactive</span>}
                  {!!r.locked_by_master && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">Locked by master</span>}
                  {r.locked === true && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">Locked</span>}
                  {!!r.is_default && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">Default</span>}
                  {r.inherits_from_id && <span className="rounded bg-brand-teal/10 px-1.5 py-0.5 text-brand-teal">Refines a master row</span>}
                </p>
              </div>
              {!rowReadOnly(r) && (
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => openForm(r)}
                    className="rounded-lg bg-neutral-100 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-200"
                  >
                    Edit
                  </button>
                  {res.deleteMode === 'deactivate' && r.is_active !== false && (
                    <button
                      onClick={() => act(r, 'toggle')}
                      className="rounded-lg bg-neutral-100 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-200"
                    >
                      Deactivate
                    </button>
                  )}
                  {res.deleteMode === 'deactivate' && r.is_active === false && (
                    <button
                      onClick={() => act(r, 'toggle')}
                      className="rounded-lg bg-neutral-100 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-200"
                    >
                      Reactivate
                    </button>
                  )}
                  {res.deleteMode === 'delete' && (
                    <button
                      onClick={() => act(r, 'remove')}
                      className="rounded-lg bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── page ────────────────────────────────────────────────────────────

export default function SupportConfigPage() {
  const [data, setData] = useState<ConfigData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState('teams');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/support/config');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Failed to load configuration (${res.status})`);
      setData(json);
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load configuration');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const active = TABS.find((t) => t.key === tab) ?? TABS[0];

  return (
    <div className="mx-auto max-w-6xl lg:">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
          <LifeBuoy className="h-4 w-4 text-orange-600" /> Support Configuration
        </h1>
        <button onClick={load} className="ml-auto flex items-center gap-1 rounded-lg bg-neutral-100 px-2 py-1.5 text-xs text-neutral-600 hover:bg-neutral-200">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-neutral-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-t-md px-3 py-2 text-[13px] ${tab === t.key ? 'bg-white font-medium text-orange-800 shadow-[inset_0_0_0_1px_#e7e5e4] ' : 'text-neutral-500 hover:bg-neutral-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{loadError}</div>
      )}
      {!data && !loadError && <p className="text-[13px] text-neutral-400">Loading configuration…</p>}
      {data && (
        <div className="space-y-4">
          {active.resources.map((key) => (
            <ResourceSection key={key} resKey={key} data={data} reload={load} />
          ))}
        </div>
      )}
    </div>
  );
}
