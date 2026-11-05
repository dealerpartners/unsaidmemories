'use client';

import React, { useState, useEffect } from 'react';
import {
  Users, Shield, Plus, Trash2, Edit2, Lock, Check, X,
  Key, Mail, Phone, UserCircle, ChevronDown, Send, Link2Off,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminUser {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: string;
  twoFactorEnabled: boolean;
  status: string;
  lastActive: string;
  avatarInitials: string;
  scope: string;
  // Linked-record indicators (owner's join spec §5) — customer rows only
  customerId?: string | null;
  salonLinked?: boolean;
  ordersLinked?: boolean;
  ordersCount?: number;
  linkedBoth?: boolean;
}

interface PermissionModule {
  code: string;
  label: string;
  module: string;
}

interface ScreenProps {
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
}

export const UsersStaffRolesScreen: React.FC<ScreenProps> = ({
  onNavigateScreen,
  selectedLocation = 'All Locations',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'permissions' | 'invitations'>('users');
  const [permissionModules, setPermissionModules] = useState<PermissionModule[]>([]);
  const [userPermissions, setUserPermissions] = useState<Record<string, string>>({});
  const [selectedPermissionUser, setSelectedPermissionUser] = useState<AdminUser | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Create user form state
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('staff');
  const [newPhone, setNewPhone] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [enforce2FA, setEnforce2FA] = useState(false);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Fetch users from live API
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    async function fetchData() {
      try {
        const res = await fetch('/api/admin/users');
        if (res.ok) {
          const data = await res.json();
          // Dedupe by identity so a user never appears twice (the API also
          // dedupes; this is belt-and-braces for the row keys).
          const seen = new Set<string>();
          const merged = [...(data.admins || []), ...(data.staff || []), ...(data.customers || [])]
            .filter((u: AdminUser) => {
              const k = `${u.userId || ''}|${u.email}`;
              if (seen.has(k)) return false;
              seen.add(k);
              return true;
            });
          setUsers(merged);
        }
        // Also fetch permission modules
        const permRes = await fetch('/api/admin/permissions');
        if (permRes.ok) {
          const permData = await permRes.json();
          setPermissionModules(permData.modules || []);
        }
      } catch (err) {
        console.error('Failed to fetch users:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Fetch per-user permissions when a user is selected
  const fetchUserPermissions = async (user: AdminUser) => {
    setSelectedPermissionUser(user);
    try {
      const res = await fetch(`/api/admin/permissions?userId=${user.userId}`);
      if (res.ok) {
        const data = await res.json();
        setUserPermissions(data.userPermissions || {});
      }
    } catch (err) {
      console.error('Failed to fetch permissions:', err);
    }
  };

  // Toggle one module for the selected user (checkbox = feature granted)
  const togglePermission = async (moduleCode: string, granted: boolean) => {
    if (!selectedPermissionUser) return;
    setUserPermissions(prev => {
      const next = { ...prev };
      if (!granted) delete next[moduleCode];
      else next[moduleCode] = 'edit';
      return next;
    });
    try {
      await fetch('/api/admin/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedPermissionUser.userId, moduleCode, accessLevel: granted ? 'edit' : 'none' }),
      });
    } catch (err) {
      console.error('Failed to update permission:', err);
    }
  };

  // Toggle every module in a domain for the selected user (parent checkbox)
  const toggleDomain = async (group: string, granted: boolean) => {
    if (!selectedPermissionUser) return;
    const codes = permissionModules.filter(m => m.module === group).map(m => m.code);
    setUserPermissions(prev => {
      const next = { ...prev };
      for (const c of codes) {
        if (!granted) delete next[c];
        else next[c] = 'edit';
      }
      return next;
    });
    try {
      for (const c of codes) {
        await fetch('/api/admin/permissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: selectedPermissionUser.userId, moduleCode: c, accessLevel: granted ? 'edit' : 'none' }),
        });
      }
    } catch (err) {
      console.error('Failed to update permissions:', err);
    }
  };

  const handleCreateUser = async () => {
    if (!newEmail || !newRole) {
      showToast('Email and Role are required');
      return;
    }
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail,
          name: newName,
          role: newRole,
          phone: newPhone,
          password: newPassword || undefined,
          enforce2FA,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        showToast(data.message || `Invitation email sent to ${newEmail}`);
        // Refresh users
        const refreshRes = await fetch('/api/admin/users');
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          const seen = new Set<string>();
          setUsers([...(refreshData.admins || []), ...(refreshData.staff || []), ...(refreshData.customers || [])]
            .filter((u: AdminUser) => {
              const k = `${u.userId || ''}|${u.email}`;
              if (seen.has(k)) return false;
              seen.add(k);
              return true;
            }));
        }
        setShowCreateForm(false);
        setNewEmail('');
        setNewName('');
        setNewPhone('');
        setNewPassword('');
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to create user');
      }
    } catch (err) {
      showToast('Network error');
    }
  };

  // Re-send the Supabase invitation email to a user who hasn't set a password yet
  const handleResendInvite = async (email: string) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, resendInvite: true }),
      });
      if (res.ok) {
        showToast(`Invitation re-sent to ${email}`);
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to re-send invitation');
      }
    } catch (err) {
      showToast('Network error');
    }
  };

  const handleUpdateUser = async (userId: string, updates: { role?: string; status?: string }) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...updates }),
      });
      if (res.ok) {
        showToast('User updated');
        setUsers(prev => prev.map(u => u.userId === userId ? { ...u, ...updates } : u));
      }
    } catch (err) {
      showToast('Update failed');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Revoke access for this user?')) return;
    try {
      const res = await fetch(`/api/admin/users?userId=${userId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Access revoked');
        setUsers(prev => prev.filter(u => u.userId !== userId));
      }
    } catch (err) {
      showToast('Delete failed');
    }
  };

  // Manual unlink — the escape hatch for the rare wrong email join
  // (two people sharing one address). Clears the salon record's FK to the
  // login; both records survive, a future same-email transaction re-joins.
  const handleUnlink = async (user: AdminUser) => {
    if (!confirm(`Unlink the salon record from ${user.email}? Both records remain — a future transaction under the same email re-joins them.`)) return;
    try {
      const res = await fetch('/api/admin/users/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId }),
      });
      if (res.ok) {
        const data = await res.json();
        showToast(data.message || 'Unlinked.');
        const refreshRes = await fetch('/api/admin/users');
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          const seen = new Set<string>();
          setUsers([...(refreshData.admins || []), ...(refreshData.staff || []), ...(refreshData.customers || [])]
            .filter((u: AdminUser) => {
              const k = `${u.userId || ''}|${u.email}`;
              if (seen.has(k)) return false;
              seen.add(k);
              return true;
            }));
        }
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Unlink failed');
      }
    } catch (err) {
      console.error('Failed to unlink:', err);
      showToast('Unlink failed');
    }
  };

  const roleLabels: Record<string, string> = {
    owner: 'Super Admin / Owner',
    admin: 'Store Manager',
    manager: 'Store Manager',
    groomer: 'Service Partner',
    seller: 'Seller / Reception',
    staff: 'Staff',
    customer: 'Customer',
  };

  return (
    <div className="p-6 space-y-6 font-bar">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-card text-foreground border border-border rounded-lg shadow-popover px-4 py-2.5 text-[13px] font-medium">
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Users & Access</h2>
          <p className="text-[13px] text-muted-foreground mt-1">Manage team members, assign roles, and control portal access.</p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3.5 text-[13px] font-medium shadow-card transition-colors cursor-pointer"
        >
          <Plus className="size-4" />
          Add Team Member
        </button>
      </div>

      {/* Create User Form */}
      {showCreateForm && (
        <div className="bg-card border border-border rounded-xl shadow-card p-5 space-y-4">
          <h3 className="text-[15px] font-semibold text-foreground">Provision New User</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Name */}
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">Full Name</label>
              <div className="relative">
                <UserCircle className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full pl-9 pr-3 h-9 bg-background border border-input rounded-lg text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            {/* Email */}
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">Email Address *</label>
              <div className="relative">
                <Mail className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="jane@unsaidmemories.com"
                  className="w-full pl-9 pr-3 h-9 bg-background border border-input rounded-lg text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            {/* Phone */}
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">Phone</label>
              <div className="relative">
                <Phone className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="(214) 555-0000"
                  className="w-full pl-9 pr-3 h-9 bg-background border border-input rounded-lg text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            {/* Role */}
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">Assigned Role *</label>
              <div className="relative">
                <Shield className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full pl-9 pr-8 h-9 bg-background border border-input rounded-lg text-[13px] text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
                >
                  <option value="owner">Super Admin / Owner</option>
                  <option value="admin">Salon Manager</option>
                  <option value="groomer">Groomer / Stylist</option>
                  <option value="seller">Seller / Reception</option>
                  <option value="staff">Staff</option>
                  <option value="customer">Customer Portal</option>
                </select>
                <ChevronDown className="size-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            {/* Temporary password — optional. The invitation email is ALWAYS
                sent; the user sets their own password from the link either way. */}
            <div>
              <label className="text-[12px] font-medium text-muted-foreground block mb-1">
                Temporary Password <span className="font-normal text-muted-foreground/70">(optional)</span>
              </label>
              <div className="relative">
                <Key className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Leave blank — the invite email lets them set it"
                  autoComplete="new-password"
                  className="w-full pl-9 pr-3 h-9 bg-background border border-input rounded-lg text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                An invitation email is always sent — the user sets their own password from the link.
              </p>
            </div>
            {/* 2FA */}
            <div className="flex items-center gap-2 pt-6">
              <button
                type="button"
                onClick={() => setEnforce2FA(!enforce2FA)}
                className={cn(
                  'inline-flex items-center gap-2 h-9 px-3 rounded-lg border text-[13px] font-medium cursor-pointer transition-colors',
                  enforce2FA
                    ? 'bg-primary/10 text-primary border-primary/20'
                    : 'border-border text-muted-foreground hover:bg-accent'
                )}
              >
                <Lock className="size-4" />
                {enforce2FA ? '2FA Required' : '2FA Optional'}
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setShowCreateForm(false)}
              className="inline-flex items-center h-9 px-3.5 rounded-lg border border-border bg-background hover:bg-accent text-foreground text-[13px] font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateUser}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-[13px] font-medium shadow-card cursor-pointer"
            >
              <Plus className="size-4" />
              Create User
            </button>
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {([
          { id: 'users', label: 'Users' },
          { id: 'permissions', label: 'Module Access' },
          { id: 'invitations', label: 'Pending Invitations' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={cn(
              'px-4 py-2 text-[13px] font-medium transition-colors cursor-pointer border-b-2 -mb-px',
              activeSubTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Users tab */}
      {activeSubTab === 'users' && (
        <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-[13px]">Loading users from database...</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-[13px]">No users found. Click "Add Team Member" to create one.</div>
          ) : (
            <table className="w-full text-left text-[13px] text-foreground">
              <thead>
                <tr className="bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="p-3 font-semibold">User</th>
                  <th className="p-3 font-semibold">Email</th>
                  <th className="p-3 font-semibold">Assigned Role</th>
                  <th className="p-3 font-semibold">CRM Records</th>
                  <th className="p-3 font-semibold">2FA</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3 font-semibold">Last Active</th>
                  <th className="p-3 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user, index) => (
                  <tr key={`${user.userId || user.id}-${index}`} className="hover:bg-accent/50 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="size-8 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center text-[11px] font-semibold">
                          {user.avatarInitials}
                        </div>
                        <span className="font-medium text-foreground">{user.name}</span>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{user.email}</td>
                    <td className="p-3">
                      <select
                        value={user.role}
                        onChange={(e) => handleUpdateUser(user.userId, { role: e.target.value })}
                        className="bg-background border border-input rounded-lg h-7 px-2 text-[12px] text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="owner">Super Admin</option>
                        <option value="admin">Salon Manager</option>
                        <option value="groomer">Groomer</option>
                        <option value="seller">Seller</option>
                        <option value="staff">Staff</option>
                        <option value="customer">Customer</option>
                      </select>
                    </td>
                    <td className="p-3">
                      {user.scope === 'customer' ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={cn(
                            'inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase',
                            user.salonLinked
                              ? 'bg-success/10 text-success border-success/20'
                              : 'bg-muted text-muted-foreground border-border'
                          )}>
                            Salon {user.salonLinked ? '✓' : '—'}
                          </span>
                          <span className={cn(
                            'inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase',
                            user.ordersLinked
                              ? 'bg-success/10 text-success border-success/20'
                              : 'bg-muted text-muted-foreground border-border'
                          )}>
                            Orders {user.ordersLinked ? `✓${user.ordersCount ? ` ${user.ordersCount}` : ''}` : '—'}
                          </span>
                          {user.linkedBoth && (
                            <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase bg-primary/10 text-primary border-primary/20">
                              Both CRMs
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-[12px]">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      {user.twoFactorEnabled ? (
                        <span className="inline-flex items-center gap-1 text-success text-[12px] font-medium">
                          <Check className="size-3.5" /> Enabled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground text-[12px]">
                          <X className="size-3.5" /> Disabled
                        </span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className={cn(
                        'inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase',
                        user.status === 'Active' ? 'bg-success/10 text-success border-success/20' :
                        user.status === 'Invited' ? 'bg-warning/10 text-warning border-warning/20' :
                        'bg-muted text-muted-foreground border-border'
                      )}>
                        {user.status}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground text-[12px] tabular-nums">{user.lastActive}</td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {user.status === 'Invited' && (
                          <button
                            onClick={() => handleResendInvite(user.email)}
                            className="inline-flex items-center justify-center size-7 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                            title="Re-send invitation email"
                          >
                            <Send className="size-3.5" />
                          </button>
                        )}
                        {user.scope === 'customer' && user.salonLinked && (
                          <button
                            onClick={() => handleUnlink(user)}
                            className="inline-flex items-center justify-center size-7 rounded-lg hover:bg-warning/10 text-muted-foreground hover:text-warning cursor-pointer transition-colors"
                            title="Unlink salon record from this login (wrong email join)"
                          >
                            <Link2Off className="size-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteUser(user.userId)}
                          className="inline-flex items-center justify-center size-7 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer transition-colors"
                          title="Revoke Access"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Module Access (per-user permission checklist) */}
      {activeSubTab === 'permissions' && (
        <div className="space-y-4">
          {/* User selector */}
          <div className="bg-card border border-border rounded-xl shadow-card p-5">
            <h3 className="text-[15px] font-semibold text-foreground mb-3">Select User to Configure Module Access</h3>
            <div className="flex flex-wrap gap-2">
              {users.filter(u => u.scope !== 'customer').map((user) => (
                <button
                  key={user.userId}
                  onClick={() => fetchUserPermissions(user)}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg border px-3 h-8 text-[12px] font-medium cursor-pointer transition-colors',
                    selectedPermissionUser?.userId === user.userId
                      ? 'bg-primary/10 text-primary border-primary/20'
                      : 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <span className="size-5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center text-[9px] font-semibold">{user.avatarInitials}</span>
                  {user.name}
                </button>
              ))}
            </div>
          </div>

          {/* Permission checklist — parent/child checkbox tree */}
          {selectedPermissionUser && (
            <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
              <div className="bg-muted/40 border-b border-border px-4 py-2.5">
                <span className="text-[13px] font-medium text-foreground">Module Access for {selectedPermissionUser.name}</span>
                <span className="text-[11px] text-muted-foreground ml-2">({selectedPermissionUser.role})</span>
                <span className="text-[11px] text-muted-foreground ml-3">Check a feature to add it to this user's profile.</span>
              </div>
              <div className="divide-y divide-border">
                {['CRM', 'ORDERS', 'ACCOUNTING', 'SYSTEM'].map(group => {
                  const items = permissionModules.filter(m => m.module === group);
                  const onCount = items.filter(m => userPermissions[m.code]).length;
                  const allOn = items.length > 0 && onCount === items.length;
                  const someOn = onCount > 0 && !allOn;
                  return (
                    <div key={group}>
                      {/* Parent — the domain */}
                      <label className="flex items-center gap-3 px-4 py-3 bg-muted/20 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={allOn}
                          ref={(el) => { if (el) el.indeterminate = someOn; }}
                          onChange={(e) => toggleDomain(group, e.target.checked)}
                          className="size-4 cursor-pointer accent-primary"
                        />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">{group}</span>
                        <span className="text-[11px] text-muted-foreground">{onCount}/{items.length} features</span>
                      </label>
                      {/* Children — the features */}
                      <div className="divide-y divide-border border-t border-border">
                        {items.map((mod) => (
                          <label
                            key={mod.code}
                            className="flex items-center gap-3 px-4 py-2.5 pl-10 cursor-pointer select-none hover:bg-accent/40 transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={!!userPermissions[mod.code]}
                              onChange={(e) => togglePermission(mod.code, e.target.checked)}
                              className="size-4 cursor-pointer accent-primary"
                            />
                            <span className="text-[13px] text-foreground">{mod.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!selectedPermissionUser && (
            <div className="bg-card border border-border rounded-xl shadow-card p-8 text-center">
              <p className="text-[13px] text-muted-foreground">Select a user above to configure their module access.</p>
            </div>
          )}
        </div>
      )}

      {/* Invitations tab — users who haven't set a password yet */}
      {activeSubTab === 'invitations' && (
        <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
          {users.filter(u => u.status === 'Invited').length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-[13px]">No pending invitations.</div>
          ) : (
            <table className="w-full text-left text-[13px] text-foreground">
              <thead>
                <tr className="bg-muted/40 border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="p-3 font-semibold">User</th>
                  <th className="p-3 font-semibold">Email</th>
                  <th className="p-3 font-semibold">Role</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.filter(u => u.status === 'Invited').map((user, index) => (
                  <tr key={`${user.userId || user.id}-invite-${index}`} className="hover:bg-accent/50 transition-colors">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="size-8 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center justify-center text-[11px] font-semibold">
                          {user.avatarInitials}
                        </div>
                        <span className="font-medium text-foreground">{user.name}</span>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{user.email}</td>
                    <td className="p-3 text-muted-foreground">{roleLabels[user.role] || user.role}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase bg-warning/10 text-warning border-warning/20">
                        Awaiting password
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleResendInvite(user.email)}
                        className="inline-flex items-center gap-1.5 h-7 px-3 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 text-[12px] font-medium cursor-pointer transition-colors"
                      >
                        <Send className="size-3.5" />
                        Re-send invite
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
