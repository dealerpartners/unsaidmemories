'use client';

/* Admin → Settings → Users: franchise-model permissions.
 * Role FIRST, then the matching editor:
 *   owner              → toggle only (bypasses everything)
 *   internal_employee  → module tree None/Read/Write/All (master tenant)
 *   franchise_owner    → tenant selector / new franchise (full admin on their tenant)
 *   franchise_employee → module tree, franchise-scoped modules
 *   seller             → category checkboxes + Pro + capabilities
 *   vet                → action toggles + license profile
 *   pharmacy           → action toggles + HIPAA notice + license profile
 *   groomer_partner    → lead modules only + lead actions
 * Customers get no rows — uniform experience. */

import { useEffect, useMemo, useState } from 'react';

type RoleDef = { value: string; label: string; desc: string; portal: string };
type ModuleDef = { code: string; label: string; group: string; scopes: string[] };
type ActionDef = { key: string; label: string; desc: string };
type RosterRow = {
  id: string; user_id: string | null; role_type: string; portal: string;
  display_name: string | null; email: string | null; is_owner: boolean;
  is_active: boolean; tenant_id: string | null; tenant_name: string | null;
  tenant_type: string | null; grant_count: number;
  last_active_at: string | null; mfa_enabled: boolean;
};

const LEVELS = [
  { value: 'none', label: 'None' },
  { value: 'read', label: 'Read' },
  { value: 'write', label: 'Write' },
  { value: 'all', label: 'All' },
] as const;

const LEVEL_STYLES: Record<string, string> = {
  none: 'border-border text-muted-foreground hover:bg-muted',
  read: 'bg-brand-teal/10 text-brand-teal border-transparent font-semibold dark:bg-brand-teal/20 dark:text-brand-teal',
  write: 'adm-badge adm-badge-amber border-transparent font-semibold dark:bg-amber-900 dark:text-amber-200',
  all: 'bg-green-100 text-green-800 border-transparent font-semibold dark:bg-green-900 dark:text-green-200',
};

const ROLE_BADGES: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  internal_employee: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200',
  franchise_owner: 'bg-brand-teal/10 text-brand-teal dark:bg-brand-teal/20 dark:text-brand-teal',
  franchise_employee: 'bg-brand-teal/10 text-brand-teal dark:bg-brand-teal/20 dark:text-brand-teal',
  seller: 'adm-badge adm-badge-green dark:bg-emerald-900 dark:text-emerald-200',
  vet: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  pharmacy: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  groomer_partner: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

function roleScope(role: string): string {
  if (role === 'franchise_owner' || role === 'franchise_employee') return 'franchise';
  if (role === 'groomer_partner') return 'groomer';
  return 'internal';
}

export default function UsersPermissionsPage() {
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [roles, setRoles] = useState<RoleDef[]>([]);
  const [modules, setModules] = useState<ModuleDef[]>([]);
  const [actions, setActions] = useState<Record<string, ActionDef[]>>({});
  const [sellerCategories, setSellerCategories] = useState<{ key: string; label: string }[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [authUsers, setAuthUsers] = useState<any[]>([]);
  const [masterTenantId, setMasterTenantId] = useState('');

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  // Selection / editor state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editorLoading, setEditorLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [fUserId, setFUserId] = useState('');
  const [fDisplayName, setFDisplayName] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fPhone, setFPhone] = useState('');
  const [fRole, setFRole] = useState('internal_employee');
  const [fTenantId, setFTenantId] = useState('');
  const [fParentId, setFParentId] = useState('');
  const [fIsOwner, setFIsOwner] = useState(false);
  const [fIsActive, setFIsActive] = useState(true);
  const [fModulePerms, setFModulePerms] = useState<Record<string, string>>({});
  const [fActionPerms, setFActionPerms] = useState<Record<string, boolean>>({});
  const [fSellerId, setFSellerId] = useState('');
  const [fSellerCats, setFSellerCats] = useState<Record<string, { is_allowed: boolean; requires_pro: boolean }>>({});
  const [fCaps, setFCaps] = useState({ is_pro: false, can_advertise: false, can_bulk_import: false, status: 'active' });
  const [fVet, setFVet] = useState({ license_number: '', license_state: '', specialty: '', clinic_name: '', status: 'active' });
  const [fPharm, setFPharm] = useState({ license_number: '', license_state: '', pharmacy_name: '', status: 'active' });
  // Franchise creation
  const [fNewFranchise, setFNewFranchise] = useState(false);
  const [fBizName, setFBizName] = useState('');
  const [fBizSlug, setFBizSlug] = useState('');

  const loadRoster = async () => {
    try {
      const r = await fetch('/api/admin/users/permissions?list=1');
      const j = await r.json();
      if (j.missing) { setMsg('The portal_users table is missing — run the franchise permissions schema in Supabase first.'); return; }
      if (j.roster) setRoster(j.roster);
      if (j.roles) setRoles(j.roles);
      if (j.modules) setModules(j.modules);
      if (j.actions) setActions(j.actions);
      if (j.sellerCategories) setSellerCategories(j.sellerCategories);
      if (j.tenants) setTenants(j.tenants);
      if (j.sellers) setSellers(j.sellers);
      if (j.authUsers) setAuthUsers(j.authUsers);
      if (j.masterTenantId) { setMasterTenantId(j.masterTenantId); setFTenantId((t) => t || j.masterTenantId); }
    } catch { setMsg('Failed to load users.'); }
  };

  useEffect(() => { (async () => { setLoading(true); await loadRoster(); setLoading(false); })(); }, []);

  const resetForm = () => {
    setFUserId(''); setFDisplayName(''); setFEmail(''); setFPhone('');
    setFRole('internal_employee'); setFTenantId(masterTenantId); setFParentId('');
    setFIsOwner(false); setFIsActive(true);
    setFModulePerms({}); setFActionPerms({});
    setFSellerId(''); setFSellerCats({});
    setFCaps({ is_pro: false, can_advertise: false, can_bulk_import: false, status: 'active' });
    setFVet({ license_number: '', license_state: '', specialty: '', clinic_name: '', status: 'active' });
    setFPharm({ license_number: '', license_state: '', pharmacy_name: '', status: 'active' });
    setFNewFranchise(false); setFBizName(''); setFBizSlug('');
  };

  const startCreate = () => { resetForm(); setCreating(true); setSelectedId(null); setMsg(''); };
  const cancelEdit = () => { setCreating(false); setSelectedId(null); resetForm(); };

  // Load a portal user into the editor
  useEffect(() => {
    if (!selectedId || creating) return;
    (async () => {
      setEditorLoading(true);
      try {
        const r = await fetch(`/api/admin/users/permissions?portalUserId=${encodeURIComponent(selectedId)}`);
        const j = await r.json();
        const d = j.detail;
        if (!d) { setMsg('User not found.'); return; }
        setFUserId(d.user_id || ''); setFDisplayName(d.display_name || '');
        setFEmail(d.email || ''); setFPhone(d.phone || '');
        setFRole(d.role_type); setFTenantId(d.tenant_id || masterTenantId);
        setFParentId(d.parent_id || ''); setFIsOwner(!!d.is_owner); setFIsActive(!!d.is_active);
        setFModulePerms(d.modulePermissions || {});
        setFActionPerms(d.actionPermissions || {});
        setFSellerId(d.sellerId || '');
        setFSellerCats(d.sellerCategories || {});
        if (d.capabilities) setFCaps({
          is_pro: !!d.capabilities.is_pro,
          can_advertise: !!d.capabilities.can_advertise,
          can_bulk_import: !!d.capabilities.can_bulk_import,
          status: d.capabilities.status || 'active',
        });
        if (d.vetProfile) setFVet({ ...{ license_number: '', license_state: '', specialty: '', clinic_name: '', status: 'active' }, ...d.vetProfile });
        if (d.pharmacyProfile) setFPharm({ ...{ license_number: '', license_state: '', pharmacy_name: '', status: 'active' }, ...d.pharmacyProfile });
      } catch { setMsg('Failed to load user.'); }
      setEditorLoading(false);
    })();
  }, [selectedId, creating, masterTenantId]);

  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase();
    return roster.filter((r) => {
      if (roleFilter !== 'all' && r.role_type !== roleFilter) return false;
      if (!q) return true;
      return (r.display_name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q);
    });
  }, [roster, search, roleFilter]);

  const scopedModules = useMemo(() => {
    const scope = roleScope(fRole);
    const g: Record<string, ModuleDef[]> = {};
    for (const m of modules) {
      if (!m.scopes.includes(scope)) continue;
      if (!g[m.group]) g[m.group] = [];
      g[m.group].push(m);
    }
    return g;
  }, [modules, fRole]);

  const roleActions = actions[fRole] || [];
  const roleDef = roles.find((r) => r.value === fRole);
  const editing = creating || !!selectedId;

  const setLevel = (code: string, level: string) => setFModulePerms((p) => ({ ...p, [code]: level }));
  const setAllLevels = (level: string) => {
    const next: Record<string, string> = {};
    for (const g of Object.values(scopedModules)) for (const m of g) next[m.code] = level;
    setFModulePerms(next);
  };

  // Named role presets (§4.0 Role Presets — previously only generic
  // bulk buttons existed, so "Store Manager" etc. had to be composed by
  // hand every time). A preset fills the module matrix with the job's
  // levels; the admin can still adjust individual modules before Save,
  // and Save persists through the same portal_module_permissions write.
  const ROLE_PRESETS: { name: string; levels: Record<string, string> }[] = [
    {
      name: 'Store Manager',
      levels: {
        crm: 'read', customers: 'all', leads: 'write', appointments: 'all', communications: 'write',
        accounting: 'read', payments: 'write', invoices: 'write', deposits: 'write',
        refunds_disputes: 'write', gift_cards_credits: 'write',
        orders: 'write', inventory: 'write', products_services: 'write', purchasing: 'read', shipping: 'read',
        marketing: 'read', analytics: 'read', reports: 'read', staff_groomer_management: 'write',
      },
    },
    {
      name: 'Service Staff',
      levels: {
        appointments: 'write', customers: 'read', communications: 'write',
        payments: 'read', products_services: 'read', orders: 'read',
      },
    },
    {
      name: 'Front Desk / Reception',
      levels: {
        crm: 'read', customers: 'write', leads: 'write', appointments: 'all', communications: 'write',
        payments: 'write', deposits: 'write', gift_cards_credits: 'write', invoices: 'read', orders: 'write',
      },
    },
  ];
  const applyPreset = (levels: Record<string, string>) => {
    const next: Record<string, string> = {};
    for (const g of Object.values(scopedModules)) {
      for (const m of g) next[m.code] = levels[m.code] || 'none';
    }
    setFModulePerms(next);
  };

  const save = async () => {
    if (creating && !fUserId) { setMsg('Pick a login (auth user) first.'); return; }
    if (fRole === 'franchise_owner' && fNewFranchise && (!fBizName.trim() || !fBizSlug.trim())) {
      setMsg('Business name and slug are required for a new franchise.'); return;
    }
    setSaving(true); setMsg('');
    try {
      const r = await fetch('/api/admin/users/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalUserId: creating ? null : selectedId,
          userId: fUserId || null,
          displayName: fDisplayName || null, email: fEmail || null, phone: fPhone || null,
          roleType: fRole, tenantId: fTenantId || null, parentId: fParentId || null,
          isOwner: fIsOwner, isActive: fIsActive,
          modulePermissions: fModulePerms,
          actionPermissions: fActionPerms,
          sellerId: fSellerId || null,
          sellerCategories: fSellerCats,
          capabilities: fCaps,
          vetProfile: fRole === 'vet' ? fVet : null,
          pharmacyProfile: fRole === 'pharmacy' ? fPharm : null,
          franchise: fRole === 'franchise_owner' && fNewFranchise
            ? { createNew: true, businessName: fBizName.trim(), slug: fBizSlug.trim() } : null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Save failed');
      setMsg('Saved.');
      await loadRoster();
      if (creating && j.portalUserId) { setCreating(false); setSelectedId(j.portalUserId); }
    } catch (e: any) { setMsg(`Save failed: ${e.message}`); }
    setSaving(false);
  };

  const inputCls = 'w-full border border-border rounded px-3 py-1.5 text-sm bg-background';
  const labelCls = 'text-xs font-medium text-muted-foreground mb-1 block';

  const renderModuleTree = () => (
    <>
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setAllLevels('all')} className="text-xs px-3 py-1.5 border border-border rounded hover:bg-muted">Grant all</button>
        <button onClick={() => setAllLevels('read')} className="text-xs px-3 py-1.5 border border-border rounded hover:bg-muted">Read all</button>
        <button onClick={() => setAllLevels('none')} className="text-xs px-3 py-1.5 border border-border rounded hover:bg-muted">Clear all</button>
      </div>
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <span className="text-xs text-muted-foreground font-medium">Role presets:</span>
        {ROLE_PRESETS.map((p) => (
          <button key={p.name} onClick={() => applyPreset(p.levels)}
            title={`Fill the matrix with the ${p.name} preset — adjust anything before saving`}
            className="text-xs px-3 py-1.5 border border-primary/40 text-primary rounded hover:bg-muted font-medium">
            {p.name}
          </button>
        ))}
      </div>
      {Object.entries(scopedModules).map(([group, mods]) => (
        <div key={group} className="mb-5">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{group}</div>
          <div className="border border-border rounded divide-y divide-border">
            {mods.map((m) => {
              const level = fModulePerms[m.code] || 'none';
              return (
                <div key={m.code} className="flex items-center justify-between px-4 py-2.5 gap-3">
                  <div className="text-sm font-medium">{m.label}</div>
                  <div className="flex gap-1 shrink-0">
                    {LEVELS.map((l) => (
                      <button key={l.value} onClick={() => setLevel(m.code, l.value)}
                        className={`text-xs px-2.5 py-1 rounded-full border ${level === l.value ? LEVEL_STYLES[l.value] : 'border-border text-muted-foreground hover:bg-muted'}`}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );

  const renderActionToggles = () => (
    <div className="border border-border rounded divide-y divide-border mb-5">
      {roleActions.map((a) => {
        const on = !!fActionPerms[a.key];
        return (
          <label key={a.key} className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50">
            <input type="checkbox" checked={on}
              onChange={(e) => setFActionPerms((p) => ({ ...p, [a.key]: e.target.checked }))}
              className="h-4 w-4 mt-0.5" />
            <div>
              <div className="text-sm font-medium">{a.label}</div>
              <div className="text-xs text-muted-foreground font-mono">{a.key}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{a.desc}</div>
            </div>
          </label>
        );
      })}
      {roleActions.length === 0 && (
        <div className="px-4 py-3 text-sm text-muted-foreground">No action gates defined for this role.</div>
      )}
    </div>
  );

  const renderSellerEditor = () => (
    <>
      <div className="mb-4">
        <label className={labelCls}>Linked seller account</label>
        <select value={fSellerId} onChange={(e) => setFSellerId(e.target.value)} className={inputCls}>
          <option value="">— select seller —</option>
          {sellers.map((s: any) => (
            <option key={s.id} value={s.id}>{s.display_name || s.email} ({s.email})</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground mt-1">Category permissions and Pro status attach to the seller account.</p>
      </div>
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Categories they may sell</div>
      <div className="border border-border rounded divide-y divide-border mb-5">
        {sellerCategories.map((c) => {
          const v = fSellerCats[c.key] || { is_allowed: false, requires_pro: false };
          return (
            <div key={c.key} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm font-medium">{c.label}</span>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={v.is_allowed}
                    onChange={(e) => setFSellerCats((p) => ({ ...p, [c.key]: { ...v, is_allowed: e.target.checked } }))}
                    className="h-4 w-4" /> Allowed
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="checkbox" checked={v.requires_pro}
                    onChange={(e) => setFSellerCats((p) => ({ ...p, [c.key]: { ...v, requires_pro: e.target.checked } }))}
                    className="h-4 w-4" /> Requires Pro
                </label>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Capabilities</div>
      <div className="border border-border rounded px-4 py-3 space-y-2.5 mb-5">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={fCaps.is_pro} onChange={(e) => setFCaps((p) => ({ ...p, is_pro: e.target.checked }))} className="h-4 w-4" />
          <span className="font-medium">Pro seller</span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={fCaps.can_advertise} onChange={(e) => setFCaps((p) => ({ ...p, can_advertise: e.target.checked }))} className="h-4 w-4" />
          Can run marketplace ads
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={fCaps.can_bulk_import} onChange={(e) => setFCaps((p) => ({ ...p, can_bulk_import: e.target.checked }))} className="h-4 w-4" />
          Can bulk-import catalog
        </label>
        <div>
          <label className={labelCls}>Status</label>
          <select value={fCaps.status} onChange={(e) => setFCaps((p) => ({ ...p, status: e.target.value }))} className={inputCls}>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="terminated">Terminated</option>
          </select>
        </div>
      </div>
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Action gates</div>
      {renderActionToggles()}
    </>
  );

  const renderVetEditor = () => (
    <>
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">License profile</div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div><label className={labelCls}>License #</label><input value={fVet.license_number} onChange={(e) => setFVet((p) => ({ ...p, license_number: e.target.value }))} className={inputCls} /></div>
        <div><label className={labelCls}>State</label><input value={fVet.license_state} onChange={(e) => setFVet((p) => ({ ...p, license_state: e.target.value }))} className={inputCls} /></div>
        <div><label className={labelCls}>Specialty</label><input value={fVet.specialty} onChange={(e) => setFVet((p) => ({ ...p, specialty: e.target.value }))} className={inputCls} /></div>
        <div><label className={labelCls}>Clinic</label><input value={fVet.clinic_name} onChange={(e) => setFVet((p) => ({ ...p, clinic_name: e.target.value }))} className={inputCls} /></div>
      </div>
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Allowed actions</div>
      {renderActionToggles()}
    </>
  );

  const renderPharmacyEditor = () => (
    <>
      <div className="mb-4 text-xs px-3 py-2 rounded border border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800">
        HIPAA: every prescription view, dispense, and forward by this user is written to the pharmacy audit log with who, what, when, and why.
      </div>
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">License profile</div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div><label className={labelCls}>License #</label><input value={fPharm.license_number} onChange={(e) => setFPharm((p) => ({ ...p, license_number: e.target.value }))} className={inputCls} /></div>
        <div><label className={labelCls}>State</label><input value={fPharm.license_state} onChange={(e) => setFPharm((p) => ({ ...p, license_state: e.target.value }))} className={inputCls} /></div>
        <div className="col-span-2"><label className={labelCls}>Pharmacy name</label><input value={fPharm.pharmacy_name} onChange={(e) => setFPharm((p) => ({ ...p, pharmacy_name: e.target.value }))} className={inputCls} /></div>
      </div>
      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Allowed actions</div>
      {renderActionToggles()}
    </>
  );

  const renderFranchiseOwnerEditor = () => (
    <>
      <div className="mb-4">
        <label className="flex items-center gap-2 text-sm mb-3">
          <input type="checkbox" checked={fNewFranchise} onChange={(e) => setFNewFranchise(e.target.checked)} className="h-4 w-4" />
          <span className="font-medium">Create a new franchise tenant for this owner</span>
        </label>
        {fNewFranchise ? (
          <div className="grid grid-cols-2 gap-3 border border-border rounded p-3 bg-muted/30">
            <div><label className={labelCls}>Business name</label><input value={fBizName} onChange={(e) => setFBizName(e.target.value)} placeholder="Unsaid Memories" className={inputCls} /></div>
            <div><label className={labelCls}>Slug</label><input value={fBizSlug} onChange={(e) => setFBizSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-'))} placeholder="unsaid-memories" className={inputCls} /></div>
          </div>
        ) : (
          <div>
            <label className={labelCls}>Franchise tenant</label>
            <select value={fTenantId} onChange={(e) => setFTenantId(e.target.value)} className={inputCls}>
              {tenants.filter((t: any) => t.tenant_type === 'franchise' || t.tenant_type === 'master').map((t: any) => (
                <option key={t.id} value={t.id}>{t.name} ({t.tenant_type})</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="text-xs px-3 py-2 rounded border border-border bg-muted mb-4">
        Franchise owners get full admin on their shop tenant — CRM, accounting, appointments, inventory, orders.
        They do <strong>not</strong> get the marketplace, Trust Center, or policy management. Those stay with the parent.
      </div>
    </>
  );

  const renderRoleEditor = () => {
    switch (fRole) {
      case 'owner':
        return (
          <div className="text-xs px-3 py-2 rounded border border-purple-300 bg-purple-50 text-purple-900 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-800">
            Owners bypass every permission check on every tenant. No module or action configuration needed.
          </div>
        );
      case 'internal_employee':
      case 'franchise_employee':
        return renderModuleTree();
      case 'franchise_owner':
        return renderFranchiseOwnerEditor();
      case 'seller':
        return renderSellerEditor();
      case 'vet':
        return renderVetEditor();
      case 'pharmacy':
        return renderPharmacyEditor();
      case 'groomer_partner':
        return (<><div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Lead modules</div>{renderModuleTree()}<div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 mt-4">Lead actions</div>{renderActionToggles()}</>);
      default:
        return null;
    }
  };

  const selected = roster.find((r) => r.id === selectedId);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Users & Permissions</h1>
        </div>
        <button onClick={startCreate} className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium">
          + New user
        </button>
      </div>

      {msg && <div className="mb-4 text-sm px-3 py-2 rounded border border-border bg-muted">{msg}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Roster */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="p-3 border-b border-border space-y-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users…"
              className="w-full border border-border rounded px-3 py-1.5 text-sm bg-background" />
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full border border-border rounded px-3 py-1.5 text-sm bg-background">
              <option value="all">All roles</option>
              {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {loading && <div className="text-sm text-muted-foreground">Loading…</div>}
            {!loading && filteredRoster.length === 0 && (
              <div className="text-sm text-muted-foreground">No users found.</div>
            )}
            {filteredRoster.map((r) => (
              <button key={r.id}
                onClick={() => { setSelectedId(r.id); setCreating(false); setMsg(''); }}
                className={`w-full text-left px-4 py-3 border-b border-border hover:bg-muted/50 ${selectedId === r.id ? 'bg-muted' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium text-sm truncate">{r.display_name || r.email || 'Unnamed'}</div>
                  <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${ROLE_BADGES[r.role_type] || ROLE_BADGES.internal_employee}`}>
                    {roles.find((x) => x.value === r.role_type)?.label || r.role_type}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">{r.email || '—'}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {r.tenant_name || '—'} · {r.grant_count} grant{r.grant_count === 1 ? '' : 's'} · {r.is_active ? 'Active' : 'Inactive'}
                  {r.is_owner && ' · Owner'}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Last active: {r.last_active_at ? new Date(r.last_active_at).toLocaleString() : 'never recorded'} · 2FA: {r.mfa_enabled ? 'On' : 'Off'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="lg:col-span-2 border border-border rounded-lg">
          {!editing && (
            <div className="text-sm text-muted-foreground py-12 text-center">
              Select a user, or create a new one.
            </div>
          )}
          {editing && (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="font-semibold text-lg">{creating ? 'New user' : (selected?.display_name || selected?.email)}</div>
                <button onClick={cancelEdit} className="text-xs px-3 py-1.5 border border-border rounded hover:bg-muted">Cancel</button>
              </div>

              {editorLoading && <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>}

              {!editorLoading && (
                <>
                  {/* Identity */}
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    {creating && (
                      <div className="col-span-2">
                        <label className={labelCls}>Login (auth user)</label>
                        <select value={fUserId} onChange={(e) => {
                          const u = authUsers.find((a: any) => a.id === e.target.value);
                          setFUserId(e.target.value);
                          if (u) { setFEmail(u.email || ''); setFDisplayName((d) => d || (u.email ? u.email.split('@')[0] : '')); }
                        }} className={inputCls}>
                          <option value="">— select login —</option>
                          {authUsers.map((u: any) => <option key={u.id} value={u.id}>{u.email}</option>)}
                        </select>
                      </div>
                    )}
                    <div><label className={labelCls}>Display name</label><input value={fDisplayName} onChange={(e) => setFDisplayName(e.target.value)} className={inputCls} /></div>
                    <div><label className={labelCls}>Email</label><input value={fEmail} onChange={(e) => setFEmail(e.target.value)} className={inputCls} /></div>
                    <div><label className={labelCls}>Phone</label><input value={fPhone} onChange={(e) => setFPhone(e.target.value)} className={inputCls} /></div>
                    <div>
                      <label className={labelCls}>Tenant</label>
                      <select value={fTenantId} onChange={(e) => setFTenantId(e.target.value)} className={inputCls}
                        disabled={fRole === 'franchise_owner' && fNewFranchise}>
                        {tenants.map((t: any) => <option key={t.id} value={t.id}>{t.name} ({t.tenant_type})</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Step 1: Role */}
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">1 · Role</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
                    {roles.map((r) => (
                      <button key={r.value} onClick={() => setFRole(r.value)}
                        className={`text-left border rounded p-3 hover:bg-muted/50 ${fRole === r.value ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">{r.label}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${ROLE_BADGES[r.value] || ''}`}>{r.portal}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">{r.desc}</div>
                      </button>
                    ))}
                  </div>

                  {/* Step 2: matching editor */}
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    2 · {roleDef?.label || 'Permissions'}
                  </div>
                  {renderRoleEditor()}

                  {/* Flags */}
                  <div className="flex items-center gap-6 mt-4 mb-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={fIsOwner} onChange={(e) => setFIsOwner(e.target.checked)} className="h-4 w-4" />
                      <span className="font-medium">Owner <span className="text-muted-foreground">(bypasses all checks)</span></span>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={fIsActive} onChange={(e) => setFIsActive(e.target.checked)} className="h-4 w-4" />
                      Active
                    </label>
                  </div>

                  <div className="flex justify-end">
                    <button onClick={save} disabled={saving}
                      className="px-5 py-2 bg-primary text-primary-foreground rounded text-sm font-medium disabled:opacity-50">
                      {saving ? 'Saving…' : 'Save user & permissions'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
