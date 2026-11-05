'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { APPEAL_TYPES, APPEAL_TYPE_LABELS, INVESTIGATION_TYPES, INVESTIGATION_TYPE_LABELS } from '@/lib/trust-safety';

// ---------------------------------------------------------------------------
// §F Trust & Safety navigation — the tree IS the navigation (Sunny,
// 2026-10-14): a node describes a feature/view/function, so the parent
// page carries its child nodes (F1–F5) as its navigation, and each node
// page presents its leaves under it. Before this component, the parent
// page rendered stat cards + quick links and the leaves had no nav home.
//
// Node row: F1 Violations · F2 Appeals · F3 Investigations · F4 Policy
// Management · F5 Content Moderation — plus the Trust Center pane
// (Payout Delay & Cases), which Sunny seated in this Trust Center as a
// single pane of glass; it stays reachable here, outside the tree rows.
// Leaf row: the active node's leaves (queues / types), each linking to
// its own view. F2/F3 leaves are the typed queues (?type=…); F4's
// leaves live on the policy surfaces M3 built; F5's on the desk pages.
// ---------------------------------------------------------------------------

type Leaf = { href: string; label: string; match: (path: string, type: string | null) => boolean };
type Node = { href: string; label: string; active: (path: string) => boolean; leaves: Leaf[] };

const exact =
  (href: string) =>
  (path: string, type: string | null) =>
    path === href && (href.includes('?') ? type === new URLSearchParams(href.split('?')[1]).get('type') : true);

const NODES: Node[] = [
  {
    href: '/admin/trust-safety/violations',
    label: 'F1 · Violations',
    active: (p) =>
      p.startsWith('/admin/trust-safety/violations') ||
      p.startsWith('/admin/trust-safety/zero-tolerance') ||
      p.startsWith('/admin/trust-safety/repeat-offenders') ||
      p.startsWith('/admin/trust-safety/fraud-queue'),
    leaves: [
      { href: '/admin/trust-safety/violations', label: 'Open violations', match: exact('/admin/trust-safety/violations') },
      { href: '/admin/trust-safety/zero-tolerance', label: 'Zero tolerance queue', match: exact('/admin/trust-safety/zero-tolerance') },
      { href: '/admin/trust-safety/repeat-offenders', label: 'Repeat offenders', match: exact('/admin/trust-safety/repeat-offenders') },
      { href: '/admin/trust-safety/fraud-queue', label: 'Fraud queue', match: exact('/admin/trust-safety/fraud-queue') },
    ],
  },
  {
    href: '/admin/trust-safety/appeals',
    label: 'F2 · Appeals',
    active: (p) => p.startsWith('/admin/trust-safety/appeals'),
    leaves: APPEAL_TYPES.map((t) => ({
      href: `/admin/trust-safety/appeals?type=${t}`,
      label: APPEAL_TYPE_LABELS[t],
      match: (_p: string, type: string | null) => type === t,
    })),
  },
  {
    href: '/admin/trust-safety/investigations',
    label: 'F3 · Investigations',
    active: (p) => p.startsWith('/admin/trust-safety/investigations'),
    leaves: INVESTIGATION_TYPES.map((t) => ({
      href: `/admin/trust-safety/investigations?type=${t}`,
      label: INVESTIGATION_TYPE_LABELS[t],
      match: (_p: string, type: string | null) => type === t,
    })),
  },
  {
    href: '/admin/policies',
    label: 'F4 · Policy Management',
    active: (p) => p.startsWith('/admin/policies'),
    leaves: [
      { href: '/admin/policies', label: 'Policy list', match: exact('/admin/policies') },
      { href: '/admin/docs', label: 'Policy editor (Document Center)', match: exact('/admin/docs') },
      { href: '/admin/policies/versions', label: 'Version history', match: exact('/admin/policies/versions') },
      { href: '/admin/policies/marketplace', label: 'Precedence matrix', match: exact('/admin/policies/marketplace') },
      { href: '/admin/policies/marketplace', label: 'Acceptance registry', match: exact('/admin/policies/marketplace') },
    ],
  },
  {
    href: '/admin/trust-safety/moderation',
    label: 'F5 · Content Moderation',
    active: (p) => p.startsWith('/admin/trust-safety/moderation'),
    leaves: [
      { href: '/admin/trust-safety/moderation', label: 'Review queue', match: exact('/admin/trust-safety/moderation') },
      { href: '/admin/trust-safety/moderation/forum', label: 'Forum moderation', match: exact('/admin/trust-safety/moderation/forum') },
      { href: '/admin/trust-safety/moderation/flags', label: 'Message flag review', match: exact('/admin/trust-safety/moderation/flags') },
      { href: '/admin/trust-safety/moderation/photos', label: 'Photo moderation', match: exact('/admin/trust-safety/moderation/photos') },
      { href: '/admin/trust-safety/moderation/ai-review', label: 'AI content review', match: exact('/admin/trust-safety/moderation/ai-review') },
    ],
  },
];

export default function TrustSafetyNav() {
  const pathname = usePathname() || '';
  // Read ?type= from the live URL on navigation (avoids a Suspense
  // boundary requirement these client portal pages don't carry).
  const [type, setType] = useState<string | null>(null);
  useEffect(() => {
    setType(new URLSearchParams(window.location.search).get('type'));
  }, [pathname]);
  const activeNode = NODES.find((n) => n.active(pathname));

  const pill = (isActive: boolean) =>
    `px-3 py-1.5 rounded-lg text-[13px] font-semibold border transition-colors ${
      isActive
        ? 'bg-brand-teal/10 text-brand-teal border-brand-teal/40'
        : 'border-border text-muted-foreground hover:text-foreground bg-card'
    }`;

  return (
    <nav aria-label="Trust & Safety" className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {NODES.map((n) => (
          <Link key={n.label} href={n.href} className={pill(n === activeNode)}>
            {n.label}
          </Link>
        ))}
        <Link
          href="/admin/trust-safety/payouts"
          className={pill(pathname.startsWith('/admin/trust-safety/payouts'))}
        >
          Payout Delay &amp; Cases
        </Link>
      </div>
      {activeNode && (
        <div className="flex flex-wrap gap-2">
          {activeNode.leaves.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className={`px-2.5 py-1 rounded-lg text-[12px] font-medium border transition-colors ${
                l.match(pathname, type)
                  ? 'bg-muted border-foreground/40 text-foreground'
                  : 'border-border/60 text-muted-foreground hover:text-foreground'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
