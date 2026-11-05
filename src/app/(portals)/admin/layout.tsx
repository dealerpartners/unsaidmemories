'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/portal-store';
import { QuickActionModals } from '@/components/portal/Modals/QuickActionModals';
import { PortalShellSkeleton } from '@/components/portal/_shared/PortalShellSkeleton';
import { useSessionQuery } from '@/lib/hooks/useSessionQuery';
import { useTenantLocations } from '@/lib/useTenantLocations';
import { QuickActionProvider } from '@/providers/QuickActionProvider';
import TenantSubscriptionGate from '@/components/portal/TenantSubscriptionGate';
import GlobalShell from '@/components/admin/GlobalShell';
import { ADMIN_NAV_TREE } from '@/lib/admin/nav-tree';
import type { ModuleCode } from '@/lib/admin/modules';
import './admin.css';
import './fabric-shell.css';

// ── Admin shell (owner's Global Shell design, 2026-11-02) ───────
// ONE chrome for the whole admin OS: GlobalShell, converted flat
// from the owner's Global_Shell__2.html mockup — 52px topbar + 44px
// tabstrip, 72px main rail with the bottom pin bar, 260px side rail,
// the Enterprise Navigation Hub flyout, and the Universal Create
// flyout, all driven by the manifest in lib/admin/global-manifest.
// The tab system is the point: a domain tab is never discarded, and
// returning to it restores that domain's last-visited route.
//
// The previous chrome (AdminShell + ModuleFrame + NavFlyout) is
// retired from this layout — the components stay on disk but are no
// longer mounted by any route in the admin OS. GlobalShell is the
// ONE framer, so no route can render two sidebars.
//
// Portal model (owner doctrine, dropship e-commerce): exactly TWO
// portals exist — the ADMIN OS (this layout, /admin/*) and the
// CUSTOMER storefront (/account + the public site). There is no
// employee portal, no seller portal, no groomer station — those
// were AAPAWZ vocabulary and are gone. Staff reach this admin OS
// through the admin-login door; customers never resolve an admin
// session here.

// The FabricShell filters its menu by the nav tree's section module
// codes. The portal grants use the same registry at a finer grain;
// keep only the codes the tree's sections actually carry, and fail
// open (null = show everything) when no section code survives the
// mapping, so a grants-vocabulary gap can never hide the admin from
// a staff member. Owners bypass filtering entirely (handled below).
const SECTION_MODULE_CODES = new Set(
  ADMIN_NAV_TREE.map((s) => s.module).filter((m): m is ModuleCode => !!m),
);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
// eslint-disable-next-line react-hooks/set-state-in-effect
  const [hasHydrated, setHasHydrated] = useState(false);
  const { currentUser, setActiveSection, activeModal, setActiveModal } = useAppStore();

  // Shell locations = the ACTIVE tenant's real tenant_locations. The
  // portal pages read locations from the store even though the Fabric
  // topbar does not display them.
  useTenantLocations('admin');

  // Navigate to a section — updates state AND routes to the URL.
  const navigate = (section: DawgNavSection) => {
    setActiveSection(section);
    router.push(`/admin/${section}`);
  };

  // Wait for Zustand persist to hydrate from localStorage
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    const unsub = useAppStore.persist.onFinishHydration(() => setHasHydrated(true));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (useAppStore.persist.hasHydrated()) setHasHydrated(true);
    return unsub;
  }, []);

  // Auth gate — STALE-WHILE-REVALIDATE. The persisted user (localStorage)
  // paints the shell INSTANTLY; the server session (/api/auth/portal-session,
  // portal_session cookie) is the single source of truth and reconciles in
  // the background: a stale cached user is replaced by the server's answer,
  // and no server session at all sends the visitor to the Admin door — never
  // the public site. The shell NEVER waits on the network: only a first
  // visit with no cached user shows the static skeleton frame while the one
  // check runs.
  const session = useSessionQuery((serverUser) => {
    if (serverUser) {
      useAppStore.getState().setUser(serverUser);
    } else {
      useAppStore.getState().setUser(null);
      router.replace('/admin-login');
    }
  });

  // Scope enforcement — only after the server session has spoken.
  // (Dropship e-commerce, two-portal model: ADMIN OS here + CUSTOMER
  // storefront at /account. No employee / seller / groomer portals
  // exist — those were AAPAWZ vocabulary. A signed-in customer who
  // somehow lands on /admin/* is bounced to their real storefront;
  // anyone without an admin role is bounced to the admin-login door.)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!session.isResolved) return;
    const user = session.user;
    if (!user) {
      router.replace('/admin-login');
      return;
    }
    if (user.role === 'customer') {
      router.replace('/account');
      return;
    }
  }, [session.isResolved, session.user, router]);

  // Module permissions — real grants from public.portal_module_permissions,
  // fetched in the same pattern as the rest of the shell. The roster lookup
  // finds the portal_users row for the current user (auth user id, falling
  // back to email), then the detail fetch returns their modulePermissions
  // map plus is_owner.
  //
  // FAIL OPEN: allowedModules stays null when the fetch can't complete
  // (network, table missing, no portal row) — the shell then shows
  // everything instead of locking an admin out. A successful fetch with an
  // empty grant set is real data and IS applied (deny). Owner bypasses.
  const [allowedModules, setAllowedModules] = useState<string[] | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const user = session.user || currentUser;
    if (!user?.id) return;
    (async () => {
      try {
        const listRes = await fetch('/api/admin/users/permissions?list=1', { cache: 'no-store' });
        if (!listRes.ok) return;
        const listJson = await listRes.json().catch(() => ({}));
        const roster: any[] = listJson.roster || [];
        const row =
          roster.find((r: any) => r.user_id === user.id) ||
          roster.find((r: any) => (r.email || '').toLowerCase() === (user.email || '').toLowerCase());
        if (!row) return; // no portal_users row for this user → fail open
        const dRes = await fetch(
          `/api/admin/users/permissions?portalUserId=${encodeURIComponent(row.id)}`,
          { cache: 'no-store' },
        );
        if (!dRes.ok) return;
        const dJson = await dRes.json().catch(() => ({}));
        const detail = dJson.detail;
        if (!detail || cancelled) return;
        if (detail.is_owner || detail.role_type === 'owner') {
          setIsOwner(true);
          return; // owner bypass — null grants mean "everything"
        }
        const perms: Record<string, string> = detail.modulePermissions || {};
        setAllowedModules(
          Object.entries(perms)
            .filter(([, level]) => level && level !== 'none')
            .map(([key]) => key),
        );
      } catch { /* fail open — shell shows everything */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.user?.id, currentUser?.id]);

  if (!hasHydrated || !currentUser || currentUser.role !== 'admin') {
    return <PortalShellSkeleton />;
  }

  // Appointment creation is a REAL write inside QuickActionModals
  // itself (it resolves the customer/service/groomer against the
  // live lists, then POSTs to /api/admin/crm/appointments, which inserts
  // the crm_appointments row plus its service join rows). Every
  // surface that paints appointments re-fetches that API, so there is
  // no local echo to update here; this seam only satisfies the modal's
  // callback contract.
  const handleAddAppointment = (_newAppt: Partial<AppointmentItem>) => {};

  // Customer creation is likewise a REAL write inside QuickActionModals
  // itself (action 'crm_add_customer' to /api/admin/crm/actions inserts
  // the crm_customers row). CustomersView self-fetches the directory
  // endpoint, so there is no local echo to update here; this seam only
  // satisfies the modal's callback contract.
  const handleAddCustomer = (_newCust: Partial<Customer>) => {};

  // Shell filter (computed as before; GlobalShell accepts the same
  // prop for interface parity): owner and fail-open
  // states pass null (show everything); otherwise the section-level
  // codes the user's grants carry. If none of the grants map to a
  // section code, fail open rather than render an empty menu.
  const shellAllowedModules: ModuleCode[] | null = (() => {
    if (isOwner || allowedModules === null) return null;
    const mapped = allowedModules.filter((k): k is ModuleCode =>
      SECTION_MODULE_CODES.has(k as ModuleCode),
    );
    return mapped.length > 0 ? mapped : null;
  })();

  return (
    <QuickActionProvider>
    <TenantSubscriptionGate />
    <GlobalShell
      allowedModules={shellAllowedModules}
      email={currentUser.email ?? null}
      role={isOwner ? 'Platform Admin' : currentUser.role ?? null}
    >
      {children}
    </GlobalShell>

      <QuickActionModals
        activeModal={activeModal}
        onClose={() => setActiveModal(null)}
        onSaveAppointment={handleAddAppointment}
        onSaveCustomer={handleAddCustomer}
        onNavigateSection={navigate}
      />

      {/* GlobalShell is the one chrome: the tabstrip, the main
          rail, and the side rail are the only navigation surfaces
          in the admin OS (owner's Global Shell design, 2026-11-02). */}
    </QuickActionProvider>
  );
}

// Type imports for handlers
import type { AppointmentItem, Customer, DawgNavSection } from '@/lib/types';
