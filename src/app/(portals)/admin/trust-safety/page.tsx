'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  Flag,
  Scale,
  FileSearch,
  CheckCircle2,
  BookOpen,
  ArrowRight,
  Activity,
  Hourglass,
  OctagonAlert,
  Radar,
  Repeat,
  MessageSquareWarning,
  Bot,
} from 'lucide-react';
import TrustSafetyNav from '@/components/admin/TrustSafetyNav';
import { APPEAL_TYPES, APPEAL_TYPE_LABELS, INVESTIGATION_TYPES, INVESTIGATION_TYPE_LABELS } from '@/lib/trust-safety';

type Summary = {
  openViolations: number;
  resolved30d: number;
  pendingAppeals: number;
  activeInvestigations: number;
  recent: Array<{ id: string; kind: string; label: string | null; status: string; created_at: string }>;
};

// ---------------------------------------------------------------------------
// Trust & Safety parent page. The tree IS the navigation (Sunny's law):
// F1–F5 are this page's navigation (TrustSafetyNav, top), and the node
// directory below presents every node's leaves as links — a leaf with
// no nav home is a leaf that does not exist for a user. Stat cards and
// recent activity remain as CONTENT under the navigation; they are no
// longer how a person gets anywhere.
// ---------------------------------------------------------------------------

const NODE_DIRECTORY: Array<{
  node: string;
  title: string;
  blurb: string;
  leaves: Array<{ href: string; label: string }>;
}> = [
  {
    node: 'F1',
    title: 'Violations',
    blurb: 'Enforcement records against sellers, and the queues they form.',
    leaves: [
      { href: '/admin/trust-safety/violations', label: 'Open violations' },
      { href: '/admin/trust-safety/zero-tolerance', label: 'Zero tolerance queue' },
      { href: '/admin/trust-safety/repeat-offenders', label: 'Repeat offenders' },
      { href: '/admin/trust-safety/fraud-queue', label: 'Fraud queue' },
    ],
  },
  {
    node: 'F2',
    title: 'Appeals',
    blurb: 'Appeals filed from the seller and customer portals, decided here by type.',
    leaves: APPEAL_TYPES.map((t) => ({ href: `/admin/trust-safety/appeals?type=${t}`, label: APPEAL_TYPE_LABELS[t] })),
  },
  {
    node: 'F3',
    title: 'Investigations',
    blurb: 'Typed investigations, opened from this desk or from a violation row.',
    leaves: INVESTIGATION_TYPES.map((t) => ({ href: `/admin/trust-safety/investigations?type=${t}`, label: INVESTIGATION_TYPE_LABELS[t] })),
  },
  {
    node: 'F4',
    title: 'Policy Management',
    blurb: 'Marketplace policies — authored, versioned, and accepted on the record.',
    leaves: [
      { href: '/admin/policies', label: 'Policy list' },
      { href: '/admin/docs', label: 'Policy editor (Document Center)' },
      { href: '/admin/policies/versions', label: 'Version history' },
      { href: '/admin/policies/marketplace', label: 'Precedence matrix' },
      { href: '/admin/policies/marketplace', label: 'Acceptance registry' },
    ],
  },
  {
    node: 'F5',
    title: 'Content Moderation',
    blurb: 'The moderation desk — manual queues and the AI review queue.',
    leaves: [
      { href: '/admin/trust-safety/moderation', label: 'Review queue' },
      { href: '/admin/trust-safety/moderation/forum', label: 'Forum moderation' },
      { href: '/admin/trust-safety/moderation/flags', label: 'Message flag review' },
      { href: '/admin/trust-safety/moderation/photos', label: 'Photo moderation' },
      { href: '/admin/trust-safety/moderation/ai-review', label: 'AI content review' },
    ],
  },
];

const LEAF_ICONS: Record<string, typeof Flag> = {
  'Zero tolerance queue': OctagonAlert,
  'Fraud queue': Radar,
  'Repeat offenders': Repeat,
  'AI content review': Bot,
};

export default function TrustSafetyPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/trust-safety/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && !j.error) setSummary(j);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stats = [
    { label: 'Open Violations', value: summary?.openViolations ?? 0, href: '/admin/trust-safety/violations', icon: Flag, hint: 'Awaiting review' },
    { label: 'Pending Appeals', value: summary?.pendingAppeals ?? 0, href: '/admin/trust-safety/appeals', icon: Scale, hint: 'From sellers and customers' },
    { label: 'Active Investigations', value: summary?.activeInvestigations ?? 0, href: '/admin/trust-safety/investigations', icon: FileSearch, hint: 'Open or in progress' },
    { label: 'Resolved (30d)', value: summary?.resolved30d ?? 0, href: '/admin/trust-safety/violations?status=resolved', icon: CheckCircle2, hint: 'Last 30 days' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <ShieldAlert className="size-6" /> Trust & Safety
          </h1>
        </div>
      </div>

      {/* The navigation: F1–F5 as this page's child nodes */}
      <TrustSafetyNav />

      {/* Stat cards — real counts from the API (content, not navigation) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.label}
              href={s.href}
              className="bg-card border border-border rounded-xl p-5 hover:border-foreground/30 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <Icon className="size-5 text-muted-foreground" />
                <ArrowRight className="size-4 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
              </div>
              <p className="text-3xl font-semibold mt-3">{loading ? '—' : s.value}</p>
              <p className="text-[13px] font-medium text-foreground mt-1">{s.label}</p>
              <p className="text-[12px] text-muted-foreground">{s.hint}</p>
            </Link>
          );
        })}
      </div>

      {/* The node directory: every §F leaf, reachable from here */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {NODE_DIRECTORY.map((n) => (
          <div key={n.node} className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-[15px] font-semibold">
              <span className="text-muted-foreground">{n.node} · </span>
              {n.title}
            </h2>
            <p className="text-[13px] text-muted-foreground mt-1">{n.blurb}</p>
            <ul className="mt-3 space-y-1.5">
              {n.leaves.map((l) => {
                const LeafIcon = LEAF_ICONS[l.label] || (n.node === 'F5' ? MessageSquareWarning : BookOpen);
                return (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="inline-flex items-center gap-2 text-[13px] font-medium text-foreground hover:underline"
                    >
                      <LeafIcon className="size-3.5 text-muted-foreground" /> {l.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/* Payout control — the money-model pane seated in this Trust Center
            (Sunny's single-pane ruling): tier -> payout delay policy,
            per-seller tiers, and buyer-Case payout locks/interventions. */}
        <Link
          href="/admin/trust-safety/payouts"
          className="block bg-card border border-border rounded-xl p-5 hover:border-foreground/30 transition-colors group"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold flex items-center gap-2">
              <Hourglass className="size-4 text-muted-foreground" /> Payout Delay & Cases
            </h2>
            <ArrowRight className="size-4 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
          </div>
          <p className="text-[13px] text-muted-foreground mt-1">
            Tier → payout delay policy (3 / 5 / 7 days), per-seller tiers, and Scenario B case locks —
            freeze a disputed transaction&apos;s payout, then release, refund, or reverse.
          </p>
        </Link>
      </div>

      {/* Recent activity — real data, honest empty state */}
      <div className="bg-card border border-border rounded-xl">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-[15px] font-semibold flex items-center gap-2">
            <Activity className="size-4 text-muted-foreground" /> Recent activity
          </h2>
        </div>
        {loading ? (
          <div className="p-12 text-center text-[13px] text-muted-foreground">Loading…</div>
        ) : !summary?.recent?.length ? (
          <div className="p-12 text-center">
            <Activity className="size-10 mx-auto text-muted-foreground/40" />
            <p className="text-[14px] font-medium text-foreground mt-3">No recent activity</p>
            <p className="text-[13px] text-muted-foreground mt-1">
              Violation reports, appeal decisions, and investigation updates will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {summary.recent.map((r) => (
              <li key={`${r.kind}-${r.id}`} className="px-5 py-3 flex items-center justify-between text-[13px]">
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded-full bg-muted text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {r.kind}
                  </span>
                  <span className="text-foreground truncate max-w-[420px]">{r.label || r.kind}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">{r.status}</span>
                  <span className="text-muted-foreground/60 text-[12px]">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
