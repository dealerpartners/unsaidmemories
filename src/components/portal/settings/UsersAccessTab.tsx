'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, 
  ShieldCheck, 
  UserPlus, 
  Mail, 
  Lock, 
  Trash2, 
  Check, 
  X, 
  Shield, 
  UserCheck, 
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  User,
  Key,
  Smartphone
} from 'lucide-react';

interface ManagedUser {
  id: string;
  userId?: string;
  customerId?: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  scope: 'admin' | 'employee' | 'customer';
  avatarInitials: string;
  twoFactorEnabled: boolean;
  status: 'Active' | 'Invited' | 'Suspended';
  lastActive: string;
  isSuperAdmin?: boolean;
}

interface RoleDefinition {
  id: string;
  role_key: string;
  label: string;
  description: string;
  permissions: string[];
}

export const UsersAccessTab: React.FC = () => {
  const [activePortalScope, setActivePortalScope] = useState<'admin' | 'employee' | 'customer' | 'matrix'>('admin');
  const [admins, setAdmins] = useState<ManagedUser[]>([]);
  const [employees, setEmployees] = useState<ManagedUser[]>([]);
  const [customers, setCustomers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('admin');
  const [formScope, setFormScope] = useState<'admin' | 'employee' | 'customer'>('admin');
  const [form2FA, setForm2FA] = useState(true);
  
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    let ignore = false;
    const loadUsers = async () => {
      try {
        const res = await fetch('/api/admin/users');
        const data = await res.json();
        if (!ignore) {
          if (res.ok) {
            setAdmins(data.admins || []);
            setEmployees(data.staff || []);
            setCustomers(data.customers || []);
            setRoles(data.roles || []);
          } else {
            showNotification('error', data.error || 'Failed to load users from Supabase');
          }
        }
      } catch (err: any) {
        if (!ignore) {
          showNotification('error', err.message || 'Connection error');
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    void loadUsers();
    return () => {
      ignore = true;
    };
  }, [showNotification]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (res.ok) {
        setAdmins(data.admins || []);
        setEmployees(data.staff || []);
        setCustomers(data.customers || []);
        setRoles(data.roles || []);
      } else {
        showNotification('error', data.error || 'Failed to load users from Supabase');
      }
    } catch (err: any) {
      showNotification('error', err.message || 'Connection error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmail.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          email: formEmail,
          phone: formPhone,
          password: formPassword,
          role: formRole,
          scope: formScope,
          enforce2FA: form2FA,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');

      showNotification('success', data.message || `User ${formEmail} created and pushed to Supabase!`);
      setIsModalOpen(false);
      setFormName('');
      setFormEmail('');
      setFormPhone('');
      setFormPassword('');
      await fetchUsers();
    } catch (err: any) {
      showNotification('error', err.message || 'Failed to push user to Supabase');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: ManagedUser) => {
    const nextStatus = user.status === 'Active' ? 'Suspended' : 'Active';
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: user.id,
          userId: user.userId,
          status: nextStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showNotification('success', `User status updated to ${nextStatus}`);
      await fetchUsers();
    } catch (err: any) {
      showNotification('error', err.message || 'Update failed');
    }
  };

  const handleDeleteUser = async (user: ManagedUser) => {
    if (!confirm(`Are you sure you want to revoke access for ${user.email}? This removes permissions in Supabase.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/users?id=${user.id}&userId=${user.userId || ''}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      showNotification('success', `Access revoked for ${user.email}`);
      await fetchUsers();
    } catch (err: any) {
      showNotification('error', err.message || 'Revocation failed');
    }
  };

  const openCreateModal = (scope: 'admin' | 'employee' | 'customer') => {
    setFormScope(scope);
    if (scope === 'admin') setFormRole('admin');
    else if (scope === 'employee') setFormRole('staff');
    else setFormRole('customer');
    setIsModalOpen(true);
  };

  const currentList = activePortalScope === 'admin' 
    ? admins 
    : activePortalScope === 'employee' 
    ? employees 
    : customers;

  const filteredUsers = currentList.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Tab Header */}
      <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-semibold text-primary uppercase tracking-wider mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>Supabase Auth &amp; Enterprise RBAC Control</span>
          </div>
          <h2 className="text-xl font-semibold text-foreground">Unified Portal Access &amp; Permissions</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Provision and control access across Admin Portal, Employee/Staff Portal, and Customer Portal directly in Supabase.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="px-3 py-2 bg-muted/40 hover:bg-muted text-foreground text-[13px] font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Refresh live from Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync Supabase</span>
          </button>

          <button
            onClick={() => openCreateModal(activePortalScope === 'matrix' ? 'admin' : activePortalScope)}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-white text-[13px] font-semibold rounded-xl flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Create User in Supabase</span>
          </button>
        </div>
      </div>

      {notification && (
        <div
          className={`p-3.5 border text-[13px] font-medium rounded-xl flex items-center gap-2.5 transition-all ${
            notification.type === 'success'
              ? 'bg-success/10 border-success/20 text-success'
              : 'bg-destructive/5 border-destructive/20 text-destructive'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Portal Scope Switcher */}
      <div className="flex flex-wrap border-b border-border gap-6 text-[13px] font-medium">
        <button
          onClick={() => setActivePortalScope('admin')}
          className={`pb-3 flex items-center gap-2 transition-colors  cursor-pointer ${
            activePortalScope === 'admin'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>1. Admin Portal Seats ({admins.length})</span>
        </button>

        <button
          onClick={() => setActivePortalScope('employee')}
          className={`pb-3 flex items-center gap-2 transition-colors  cursor-pointer ${
            activePortalScope === 'employee'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          <span>2. Employee / Staff Portal ({employees.length})</span>
        </button>

        <button
          onClick={() => setActivePortalScope('customer')}
          className={`pb-3 flex items-center gap-2 transition-colors  cursor-pointer ${
            activePortalScope === 'customer'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>3. Customer Portal Accounts ({customers.length})</span>
        </button>

        <button
          onClick={() => setActivePortalScope('matrix')}
          className={`pb-3 flex items-center gap-2 transition-colors  cursor-pointer ${
            activePortalScope === 'matrix'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>4. Roles &amp; Permissions Matrix ({roles.length})</span>
        </button>
      </div>

      {/* VIEW 1: Portal Users Table (Admin / Employee / Customer) */}
      {activePortalScope !== 'matrix' && (
        <div className="bg-card rounded-2xl border border-border/90 shadow-2xs overflow-hidden">
          {/* Table Header Filter */}
          <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-muted-foreground/70 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${activePortalScope} users by name, email, or role...`}
                className="w-full pl-9 pr-4 py-1.5 bg-muted/40 border border-border rounded-xl text-[13px] placeholder:text-muted-foreground/70 focus:bg-card focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <span className="font-medium">Live Supabase Sync:</span>
              <span className="font-semibold text-foreground">{filteredUsers.length} Users</span>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-[13px]">
              <thead>
                <tr className="bg-muted/40/75 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="py-3 px-4">User &amp; Auth ID</th>
                  <th className="py-3 px-4">Assigned Role</th>
                  <th className="py-3 px-4">Portal Scope</th>
                  <th className="py-3 px-4">2FA Security</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Last Active</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground/70">
                      No users found in this portal scope. Click &quot;+ Create User in Supabase&quot; above to provision one.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/40/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-full ${
                              u.role === 'owner' || u.isSuperAdmin
                                ? 'bg-primary text-white'
                                : u.scope === 'admin'
                                ? 'bg-primary text-white'
                                : u.scope === 'employee'
                                ? 'bg-success text-white'
                                : 'bg-primary text-white'
                            } font-semibold text-[13px] flex items-center justify-center shrink-0`}
                          >
                            {u.avatarInitials}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-semibold text-foreground leading-tight">{u.name}</p>
                              {(u.isSuperAdmin || u.role === 'owner') && (
                                <span className="text-primary text-[9px] font-semibold px-1.5 py-0.2 rounded">
                                  OWNER
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-muted-foreground">{u.email}</p>
                            {u.phone && <p className="text-[10px] text-muted-foreground/70">{u.phone}</p>}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                            u.role === 'owner'
                              ? 'bg-primary/5 text-primary border border-primary/20'
                              : u.role === 'admin'
                              ? 'bg-primary/5 text-primary border border-primary/20'
                              : u.role === 'manager'
                              ? 'bg-warning/10 text-warning border border-warning/20'
                              : u.role === 'staff' || u.role === 'groomer'
                              ? 'bg-success/10 text-success border border-success/20'
                              : 'bg-primary/5 text-primary border border-primary/20'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="capitalize font-medium text-foreground text-[11px]">
                          {u.scope} Portal
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {u.twoFactorEnabled ? (
                          <span className="inline-flex items-center gap-1 text-success font-medium text-[11px]">
                            <Lock className="w-3.5 h-3.5" />
                            <span>Enforced</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground/70 text-[11px]">
                            <Lock className="w-3.5 h-3.5" />
                            <span>Optional</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            u.status === 'Active'
                              ? 'bg-success/10 text-success border border-success/20'
                              : u.status === 'Invited'
                              ? 'bg-primary/5 text-primary border border-primary/20'
                              : 'bg-destructive/5 text-destructive border border-destructive/20'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-muted-foreground text-[11px]">
                        {u.lastActive}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {u.email !== 'unsaidmemories901@gmail.com' && (
                            <>
                              <button
                                onClick={() => handleToggleStatus(u)}
                                className={`px-2 py-1 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer ${
                                  u.status === 'Active'
                                    ? 'text-muted-foreground hover:bg-muted/40'
                                    : 'text-success bg-success/10 hover:bg-success/10'
                                }`}
                              >
                                {u.status === 'Active' ? 'Suspend' : 'Activate'}
                              </button>

                              <button
                                onClick={() => handleDeleteUser(u)}
                                className="p-1 text-muted-foreground/70 hover:text-destructive hover:bg-destructive/5 rounded-lg transition-colors cursor-pointer"
                                title="Revoke User Access in Supabase"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: Roles & Permissions Matrix */}
      {activePortalScope === 'matrix' && (
        <div className="bg-card p-6 rounded-2xl border border-border/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Supabase Role Definitions &amp; Portal Privileges</h3>
              <p className="text-[13px] text-muted-foreground">Global role definitions stored in public.role_definitions.</p>
            </div>
            <span className="px-2.5 py-1 bg-primary/5 text-primary text-[13px] font-semibold rounded-lg border border-primary/20">
              5 System Roles Active
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((r) => (
              <div key={r.id} className="p-4 rounded-xl bg-muted/40 border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground text-[13px]">{r.label}</span>
                  <span className="px-2 py-0.5 text-primary tabular-nums text-[10px] rounded uppercase font-semibold">
                    {r.role_key}
                  </span>
                </div>
                <p className="text-muted-foreground text-[11px]">{r.description}</p>
                <div className="pt-2 border-t border-border/60">
                  <p className="text-[10px] font-semibold text-foreground uppercase tracking-wider mb-1.5">
                    Granted Permissions ({r.permissions?.length || 0}):
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {r.permissions?.map((p, idx) => (
                      <span key={idx} className="px-1.5 py-0.5 bg-card border border-border text-muted-foreground rounded text-[9px] tabular-nums">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Create / Provision User in Supabase */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-card/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary/5 text-primary flex items-center justify-center font-semibold">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">Provision User to Supabase</h3>
                  <p className="text-[11px] text-muted-foreground">Directly syncs to Supabase Auth, CRM, and Portal tables</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-muted-foreground/70 hover:text-muted-foreground p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3.5 text-[13px]">
              <div>
                <label className="block text-foreground font-semibold mb-1">Target Portal Scope</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormScope('admin');
                      setFormRole('admin');
                    }}
                    className={`py-1.5 px-2 rounded-lg border font-semibold text-center cursor-pointer transition-colors ${
                      formScope === 'admin'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    Admin Portal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormScope('employee');
                      setFormRole('staff');
                    }}
                    className={`py-1.5 px-2 rounded-lg border font-semibold text-center cursor-pointer transition-colors ${
                      formScope === 'employee'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    Employee Portal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormScope('customer');
                      setFormRole('customer');
                    }}
                    className={`py-1.5 px-2 rounded-lg border font-semibold text-center cursor-pointer transition-colors ${
                      formScope === 'customer'
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    Customer Portal
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-foreground font-semibold mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Jordan Hayes"
                  className="w-full px-3 py-2 border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-foreground font-semibold mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="e.g. jordan@unsaidmemories.com"
                  className="w-full px-3 py-2 border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-foreground font-semibold mb-1">Phone (Optional)</label>
                <input
                  type="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="e.g. (901) 555-0199"
                  className="w-full px-3 py-2 border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-foreground font-semibold mb-1">Temporary Password</label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  placeholder="Leave blank to auto-generate password"
                  className="w-full px-3 py-2 border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-foreground font-semibold mb-1">Assigned Role</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-xl bg-card focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {formScope === 'admin' && (
                    <>
                      <option value="owner">Super Admin / Owner (Unconstrained)</option>
                      <option value="admin">Store Administrator (Management &amp; Staff Lead)</option>
                      <option value="manager">Store Manager (Operations &amp; POS)</option>
                    </>
                  )}
                  {formScope === 'employee' && (
                    <>
                      <option value="staff">Employee / Groomer Staff</option>
                      <option value="groomer">Lead Groomer / Stylist</option>
                      <option value="seller">Seller / Reception</option>
                    </>
                  )}
                  {formScope === 'customer' && (
                    <option value="customer">Customer / Pet Parent</option>
                  )}
                </select>
              </div>

              <div className="pt-2 border-t border-border flex items-center justify-between">
                <div>
                  <p className="font-semibold text-foreground text-[13px]">Enforce Two-Factor Authentication</p>
                  <p className="text-muted-foreground/70 text-[10px]">Require 2FA verification for portal access</p>
                </div>
                <input
                  type="checkbox"
                  checked={form2FA}
                  onChange={(e) => setForm2FA(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 border border-border rounded-xl text-muted-foreground font-semibold hover:bg-muted/40 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-semibold rounded-xl cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  <span>{submitting ? 'Pushing to Supabase...' : 'Create & Push to Supabase'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
