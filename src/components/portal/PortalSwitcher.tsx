'use client';

import React, { useEffect, useState } from 'react';
import {
  BadgePercent,
  Check,
  GraduationCap,
  LayoutGrid,
  Megaphone,
  Pill,
  Scissors,
  ShieldCheck,
  Stethoscope,
  Users,
} from 'lucide-react';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { loadSessionBootstrap } from '@/lib/session-bootstrap';

// ============================================================================
// PortalSwitcher (X1) — the account menu's portal switcher.
//
// M5 (DOCX §7.6): the door list IS the grant list. This component
// renders the `doors` the session endpoint renders from the identity's
// LIVE identity_grants rows — it no longer derives doors from a local
// scope table. ONLY held grants appear as switch targets — an unheld
// portal never renders as a door, and a revoked grant's door is gone
// on the next bootstrap because the server re-reads live grants.
// Clicking a target POSTs /api/auth/switch, which re-primaries the
// signed session server-side and returns the portal's destination;
// this component never decides access, it only offers what the
// identity already holds.
//
// M5 doors: affiliate renders from its live grant like every other
// scope. Teach is NOT a grant scope — it rides the vet grant (see
// lib/portal-auth's door header): for a vet-grant holder, this
// component additionally asks /api/vet/teach/access, and ONLY when
// that gate says the identity may author does it offer "Teach
// Studio", which switches through the vet grant to /vet/teach. The
// teach authorization itself stays server-side in that gate.
//
// Rendered inside the shared Header's user dropdown, so every portal shell
// (admin / customer / employee / seller / telemed) carries the same
// switcher. Renders nothing when the identity holds a single portal, when
// signed out, or when the session read fails — no mock doors, ever.
// ============================================================================

type HeldGrant = { scope: string; role: string };
type Door = { scope: string; label: string; destination: string };

const SCOPE_META: Record<string, { label: string; icon: React.ElementType }> = {
  admin: { label: 'Admin', icon: ShieldCheck },
  employee: { label: 'Employee Portal', icon: Scissors },
  customer: { label: 'Customer Portal', icon: Users },
  seller: { label: 'Seller Center', icon: LayoutGrid },
  vet: { label: 'Vet Portal', icon: Stethoscope },
  pharmacy: { label: 'Pharmacy Portal', icon: Pill },
  ads: { label: 'Ad Center', icon: Megaphone },
  affiliate: { label: 'Affiliate Portal', icon: BadgePercent },
  teach: { label: 'Teach Studio', icon: GraduationCap },
};

// Mirrors autoDestination in lib/portal-auth — used ONLY if a switch response
// ever arrives without its redirectTo (the route returns one today).
const FALLBACK_DESTINATION: Record<string, string> = {
  admin: '/admin/dashboard',
  employee: '/employee/dashboard',
  customer: '/customer/dashboard',
  seller: '/seller/dashboard',
  vet: '/vet/dashboard',
  pharmacy: '/vet/pharmacy',
  ads: '/ads',
  affiliate: '/affiliate/dashboard',
  teach: '/vet/teach',
};

export function PortalSwitcher() {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [activeScope, setActiveScope] = useState<string | null>(null);
  const [grants, setGrants] = useState<HeldGrant[]>([]);
  const [teachOffered, setTeachOffered] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Slice 2: doors come from the page's shared bootstrap call
        // (one per pageview); bootstrap's user IS the portal-session
        // user, and its `doors` are rendered server-side from live
        // grants. Fall back to the grant list when doors are absent
        // (older response shape) — never to a hardcoded door table.
        const data = await loadSessionBootstrap();
        if (!alive) return;
        const user = (data as { user?: { scope?: string; grants?: HeldGrant[]; doors?: Door[] } | null })?.user;
        if (!user) {
          setFailed(true);
          return;
        }
        // A scope can repeat across tenants — the switch acts on
        // scope, so dedupe.
        const seen = new Set<string>();
        const held: HeldGrant[] = [];
        for (const g of (user.grants ?? []) as HeldGrant[]) {
          if (g?.scope && !seen.has(g.scope)) {
            seen.add(g.scope);
            held.push({ scope: g.scope, role: g.role || '' });
          }
        }
        // Doors are authoritative when present (they ARE the live
        // grant list, rendered server-side); otherwise the grant list
        // itself is the door list. Either way the switcher never
        // invents a door.
        const serverDoors = (user.doors ?? []).filter((d) => Boolean(d?.scope));
        const entries: HeldGrant[] =
          serverDoors.length > 0
            ? serverDoors.map((d) => ({
                scope: d.scope,
                role: held.find((g) => g.scope === d.scope)?.role || '',
              }))
            : held;
        setActiveScope(user.scope || null);
        setGrants(entries);
        // Teach door (M5): offered only to a vet-grant holder whom
        // the teach gate itself authorizes. The gate call is cheap
        // and fail-closed — any failure simply hides the Teach entry.
        if (held.some((g) => g.scope === 'vet')) {
          try {
            const res = await fetch('/api/vet/teach/access', { cache: 'no-store' });
            if (alive && res.ok) {
              const body = await res.json().catch(() => null);
              if (body?.ok) setTeachOffered(true);
            }
          } catch {
            // fail-closed: no Teach entry
          }
        }
      } catch {
        if (alive) setFailed(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const doSwitch = async (scope: string) => {
    setError(null);
    setSwitching(scope);
    try {
      const res = await fetch('/api/auth/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || 'That switch was refused.');
      }
      window.location.href = data.redirectTo || FALLBACK_DESTINATION[scope] || '/';
    } catch (e: any) {
      setError(e?.message || 'That switch was refused.');
      setSwitching(null);
    }
  };

  if (loading) {
    return (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1.5">
          Switch Portal
        </DropdownMenuLabel>
        <DropdownMenuItem disabled className="text-[13px] text-muted-foreground">
          Loading portals…
        </DropdownMenuItem>
      </>
    );
  }

  // The Teach entry is not a grant — it is the vet grant's lens —
  // so it joins the list only when the teach gate authorized it, and
  // it is what makes a vet-only identity with teach eligibility see
  // a switcher at all.
  const entries: HeldGrant[] = teachOffered
    ? [...grants, { scope: 'teach', role: '' }]
    : grants;

  // Signed out, unreadable session, or a single-portal identity: no
  // switcher. The one held portal is where the user already is.
  if (failed || entries.length < 2) return null;

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-1.5">
        Switch Portal
      </DropdownMenuLabel>
      {entries.map((g) => {
        const meta = SCOPE_META[g.scope] ?? { label: g.scope, icon: Users };
        const Icon = meta.icon;
        const isActive = g.scope === activeScope;
        if (isActive) {
          return (
            <DropdownMenuItem
              key={g.scope}
              disabled
              className="text-[13px] text-muted-foreground"
            >
              <Icon className="size-4" />
              <span className="flex-1">{meta.label}</span>
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider">
                <Check className="size-3" /> Current
              </span>
            </DropdownMenuItem>
          );
        }
        return (
          <DropdownMenuItem
            key={g.scope}
            onSelect={(e) => {
              // Keep the menu open while the switch is in flight (and if it
              // is refused, so the refusal can be read).
              e.preventDefault();
              if (!switching) void doSwitch(g.scope);
            }}
            className="cursor-pointer text-[13px]"
          >
            <Icon className="size-4" />
            <span className="flex-1">
              {switching === g.scope ? `Switching to ${meta.label}…` : meta.label}
            </span>
            {g.role && (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                {g.role}
              </span>
            )}
          </DropdownMenuItem>
        );
      })}
      {error && (
        <DropdownMenuItem
          disabled
          className="text-[12px] text-destructive whitespace-normal"
        >
          {error}
        </DropdownMenuItem>
      )}
    </>
  );
}
