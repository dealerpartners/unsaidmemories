'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Customer, CustomerFullProfile } from '@/lib/types';
import { CustomerDetailsView } from './CustomerDetailsView';
import { QuickActionsModal, UnifiedQuickActionType } from './QuickActionsModal';
import { QuickActionTakePaymentView, QuickActionNewAppointmentView, QuickActionAddPetView, QuickActionSendMessageView, QuickActionUpdateDocumentsView, QuickActionAddNoteView } from './customer/CustomerQuickActionsViews';
import { DataManagementPanel } from './customer/DataManagementPanel';
import { Users, Search, Plus, Phone, Mail, MapPin, Dog, Calendar, DollarSign, ChevronDown, X, CreditCard, MessageSquare, FileText, FileCheck, CalendarPlus, Scissors, ArrowRight, Filter, Check, MoreHorizontal, Pencil, AlertTriangle, Clock, PawPrint, ChevronRight, SlidersHorizontal, Bookmark, Zap, CheckCircle2, ShieldCheck, Activity, AlertCircle, RotateCw, User, MoreVertical } from 'lucide-react';
import { PageHeader, PageTabs, PageToolbar, FilterSelect } from './_shared/PageHeader';
import { TablePagination, useTablePagination } from './_shared/TablePagination';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/lib/portal-store';
import { useSendMagicLink } from '@/hooks/admin/useActions';

interface CustomersViewProps {
  customers: Customer[];
  onAddCustomer: () => void;
  onOpenNewAppointment?: () => void;
  onOpenAddPet?: () => void;
  onOpenTakePayment?: () => void;
  onOpenIntake?: () => void;
}

export type FilterTab = 
  | 'all' 
  | 'active' 
  | 'new' 
  | 'returning' 
  | 'inactive' 
  | 'followup' 
  | 'upcoming' 
  | 'outstanding';

export interface ExtendedCustomerRecord extends Omit<Customer, 'totalSpent' | 'lastVisit'> {
  totalSpent?: number;
  lastVisit?: string;
  avatarUrl?: string;
  initials?: string;
  petPhotos?: string[];
  petDetails?: any[];
  isLiveDb?: boolean;
  petCount?: number;
  lastService?: string;
  nextAppointment?: string;
  nextApptTime?: string;
  lifetimeValue?: number;
  balance?: number;
  statusText?: 'Active' | 'Inactive' | 'Pending';
  customerType?: string;
  preferredContact?: string;
  program?: string;
  referredBy?: string;
  notes?: string;
  address?: string;
  customerSince?: string;
  totalSpentVal?: number;
  loyaltyPoints?: number;
  cardBrand?: string;
  cardLast4?: string;
  cardExpiry?: string;
  // Specific tab extra metadata
  inactiveDuration?: string;
  followupReason?: string;
  followupUrgency?: 'amber' | 'rose';
  assignedStaff?: string;
  lifecycleStage?: string;
  isActive?: boolean;
  createdAtTs?: number;
  appointmentCount?: number;
  followupDue?: boolean;
  locationId?: string;
  locationName?: string;
  staffId?: string;
  crmCustomerId?: string;
  leadSourceId?: string;
  leadSourceName?: string;
  channels?: string[];
  tags?: string[];
}

// ---- Lifecycle stages ----
const LIFECYCLE_STAGES = [
  { value: 'new_lead', label: 'New Lead', color: 'bg-neutral-100 text-neutral-700 border-neutral-300' },
  { value: 'new_customer', label: 'New Customer', color: 'bg-brand-teal/10 text-brand-teal border-brand-teal/40' },
  { value: 'active', label: 'Active', color: 'bg-green-100 text-green-700 border-green-300' },
  { value: 'vip', label: 'VIP', color: 'bg-purple-100 text-purple-700 border-purple-300' },
  { value: 'returning', label: 'Returning', color: 'bg-teal-100 text-teal-700 border-teal-300' },
  { value: 'lapsed', label: 'Lapsed', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { value: 'at_risk', label: 'At Risk', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { value: 'lost', label: 'Lost', color: 'bg-red-100 text-red-700 border-red-300' },
] as const;

function lifecycleMeta(stage?: string) {
  return LIFECYCLE_STAGES.find((s) => s.value === stage) || LIFECYCLE_STAGES[0];
}


// Build a CustomerFullProfile strictly from a real directory record.
// Sub-collections the detail view loads itself (appointments, communications)
// start empty; nothing is seeded from demo data.
const EMPTY_CUSTOMER_PROFILE: CustomerFullProfile = {
  id: '',
  name: '',
  email: '',
  phone: '',
  address: '',
  status: '',
  totalSpent: 0,
  lifetimeValue: 0,
  outstandingBalance: 0,
  loyaltyPoints: 0,
  customerSince: '\u2014',
  pets: [],
  paymentHistory: [],
  recentActivity: [],
  communication: [],
  upcomingAppointments: [],
};

const buildProfileFromRecord = (cust: ExtendedCustomerRecord): CustomerFullProfile => {
  const customerPets = (cust.petDetails && cust.petDetails.length > 0)
    ? cust.petDetails.map((d: any, i: number) => ({
        id: d.id || `pet-${i}`,
        name: d.name || 'Pet',
        breed: d.breed || d.breedName || 'Unknown breed',
        gender: (d.sex || '') as 'Male' | 'Female',
        age: d.age || '',
        birthDate: d.birthDate || undefined,
        weight: d.weight ? String(d.weight) : (d.weightLbs ? `${d.weightLbs} lbs` : ''),
        imageUrl: d.photoUrl || (cust.petPhotos && cust.petPhotos[i]) || undefined,
        isPrimary: i === 0,
        vaccinationsStatus: d.vaccinationsStatus || undefined,
        medicalAlert: d.specialHandling || undefined,
        lastGroomDate: cust.lastVisit || undefined,
        nextApptDate: cust.nextAppointment && cust.nextAppointment !== '\u2014' ? cust.nextAppointment : undefined,
        nextApptType: cust.lastService || undefined,
      }))
    : (cust.pets || []).map((p, i) => ({
        id: `pet-${i}`,
        name: p.replace(/\s*\([^)]*\)/, ''),
        breed: p.includes('(') ? p.replace(/.*\(([^)]+)\).*/, '$1') : 'Unknown breed',
        gender: '' as 'Male' | 'Female',
        age: '',
        birthDate: undefined,
        weight: '',
        imageUrl: cust.petPhotos && cust.petPhotos[i] ? cust.petPhotos[i] : undefined,
        isPrimary: i === 0,
        vaccinationsStatus: undefined,
        medicalAlert: undefined,
        lastGroomDate: cust.lastVisit || undefined,
        nextApptDate: cust.nextAppointment && cust.nextAppointment !== '\u2014' ? cust.nextAppointment : undefined,
        nextApptType: cust.lastService || undefined,
      }));

  return {
    id: cust.id,
    crmCustomerId: cust.crmCustomerId,
    name: cust.name,
    status: (cust.statusText === 'Active' ? 'Active Customer' : 'Inactive Customer'),
    phone: cust.phone,
    email: cust.email,
    address: cust.address || '',
    lifetimeValue: cust.lifetimeValue || cust.totalSpent || 0,
    totalSpent: cust.totalSpent || 0,
    outstandingBalance: cust.balance || 0.0,
    loyaltyPoints: cust.loyaltyPoints || 0,
    customerSince: cust.customerSince || '\u2014',
    defaultPaymentMethod: cust.cardLast4
      ? { cardBrand: cust.cardBrand || 'Card', last4: cust.cardLast4, expires: cust.cardExpiry || '' }
      : undefined,
    pets: customerPets,
    upcomingAppointments: [],
    paymentHistory: [],
    recentActivity: [],
    communication: [],
  };
};

// Map one row of /api/admin/crm/customers/directory (crm_customers is the
// source of truth for this module — the old wiring read the shop
// `customers` store and merged crm rows by email, then filled every gap
// with invented defaults: 'Sarah Mitchell' as every groomer/staff,
// 'VIP Member' as every type, 'Full Groom' as every service, a stock
// photo as every avatar, loyalty = totalSpent/2). No defaults are
// invented here: missing real data stays empty/'—'.
const fmtDay = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined;
const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : undefined;

const mapDirectoryCustomer = (r: any): ExtendedCustomerRecord => {
  const pets: any[] = Array.isArray(r.pets) ? r.pets : [];
  const address = [r.address_line1, r.city, r.state, r.postal_code].filter(Boolean).join(', ');
  return {
    id: r.id,
    crmCustomerId: r.id,
    name: r.name || r.email || 'Customer',
    initials: (r.name || r.email || 'CU').split(/\s+/).map((w: string) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase(),
    email: r.email || '',
    phone: r.phone || r.mobile_phone || '—',
    address: address || '',
    pets: pets.map((pt: any) => pt.name),
    petCount: pets.length,
    petPhotos: [],
    petDetails: pets,
    lastVisit: fmtDay(r.last_visit_at) || 'No visits yet',
    lastService: r.last_service || undefined,
    nextAppointment: fmtDay(r.next_appt_at),
    nextApptTime: fmtTime(r.next_appt_at),
    totalSpent: Number(r.lifetime_value || 0),
    lifetimeValue: Number(r.lifetime_value || 0),
    balance: Number(r.balance || 0),
    statusText: r.is_active === false ? 'Inactive' : 'Active',
    isActive: r.is_active !== false,
    customerType: r.customer_type || undefined,
    customerSince: fmtDay(r.customer_since || r.created_at) || '—',
    createdAtTs: r.created_at ? new Date(r.created_at).getTime() : undefined,
    loyaltyPoints: 0,
    assignedStaff: r.assigned_staff || undefined,
    staffId: r.staff_id || undefined,
    locationId: r.location_id || undefined,
    locationName: r.location_name || undefined,
    appointmentCount: Number(r.appointment_count || 0),
    followupDue: !!r.followup_due,
    lifecycleStage: r.lifecycle_stage || 'new_lead',
    leadSourceId: r.lead_source_id || undefined,
    channels: Array.isArray(r.channels) ? r.channels : [],
    tags: Array.isArray(r.tags) ? r.tags : [],
    isLiveDb: true,
  };
};

export const CustomersView: React.FC<CustomersViewProps> = ({
  customers,
  onAddCustomer,
  onOpenNewAppointment,
  onOpenAddPet,
  onOpenTakePayment,
  onOpenIntake,
}) => {
  // Navigation State: Directory landing vs. Full profile view
  const [viewMode, setViewMode] = useState<'directory' | 'detail'>('directory');
  const [selectedProfile, setSelectedProfile] = useState<CustomerFullProfile>(EMPTY_CUSTOMER_PROFILE);
  
  // Quick View Rail (Right side drawer) - Closed by default on entry
  const [selectedCustomerForRail, setSelectedCustomerForRail] = useState<ExtendedCustomerRecord | null>(null);
  const [isRailOpen, setIsRailOpen] = useState(false);
  const [railActiveTab, setRailActiveTab] = useState<'overview' | 'pets' | 'appointments' | 'history' | 'payments'>('overview');

  // Unified Global Quick Actions Modal State
  const [isQuickActionsModalOpen, setIsQuickActionsModalOpen] = useState(false);
  const [activeQuickActionSubView, setActiveQuickActionSubView] = useState<
    'new-appointment' | 'add-pet' | 'take-payment' | 'send-message' | 'add-note' | 'update-documents' | null
  >(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Live Supabase Customers State
  const [liveDbCustomers, setLiveDbCustomers] = useState<ExtendedCustomerRecord[]>([]);
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [newCustForm, setNewCustForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: 'Memphis',
    state: 'TN',
    postalCode: '38141',
  });

  const fetchLiveCustomers = () => {
    fetch('/api/admin/crm/customers/directory')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const rows = data?.data || [];
        if (!Array.isArray(rows)) return;
        setLiveDbCustomers(rows.map(mapDirectoryCustomer));
      })
      .catch((err) => {
        console.log('Customer directory unavailable:', err);
      });
  };

  // ---- Update lifecycle_stage via admin API ----
  const updateLifecycle = async (cust: ExtendedCustomerRecord, newStage: string) => {
    const prev = cust.lifecycleStage;
    // Optimistic update
    setLiveDbCustomers((prevList) =>
      prevList.map((c) => (c.id === cust.id ? { ...c, lifecycleStage: newStage } : c))
    );
    setLifecycleDropdownFor(null);
    if (!cust.crmCustomerId) {
      console.log('No crm_customer_id for', cust.email, '- cannot persist lifecycle');
      return;
    }
    try {
      const res = await fetch(`/api/admin/crm/customers/${cust.crmCustomerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lifecycle_stage: newStage }),
      });
      if (!res.ok) {
        // Revert on error
        setLiveDbCustomers((prevList) =>
          prevList.map((c) => (c.id === cust.id ? { ...c, lifecycleStage: prev } : c))
        );
      }
    } catch {
      setLiveDbCustomers((prevList) =>
        prevList.map((c) => (c.id === cust.id ? { ...c, lifecycleStage: prev } : c))
      );
    }
  };

  React.useEffect(() => {
    fetchLiveCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Directory filter states
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('active');
  const [customerViewMode, setCustomerViewMode] = useState<'table' | 'lifecycle'>('table');
  const [lifecycleDropdownFor, setLifecycleDropdownFor] = useState<string | null>(null);

  // Close lifecycle dropdown on outside click
  React.useEffect(() => {
    if (!lifecycleDropdownFor) return;
    const handler = () => setLifecycleDropdownFor(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [lifecycleDropdownFor]);
  const [locationFilter, setLocationFilter] = useState('All Locations');
  const [typeFilter, setTypeFilter] = useState('All Customer Types');
  const [staffFilter, setStaffFilter] = useState('All Staff');
  const [leadSourceFilter, setLeadSourceFilter] = useState('All Lead Sources');
  const [leadSources, setLeadSources] = useState<{ id: string; name: string }[]>([]);
  const [lifecycleFilter, setLifecycleFilter] = useState('All Lifecycle Stages');
  const [tagFilter, setTagFilter] = useState('All Tags');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [savedViews, setSavedViews] = useState<{ id: string; name: string; filters: any }[]>([]);

  React.useEffect(() => {
    fetch('/api/admin/crm/saved-views?entity=customers')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSavedViews(d?.data || []))
      .catch(() => {});
  }, []);

  // Save View persists to crm_saved_views via the API — success is only
  // reported when the insert returns a row (previously a fake toast).
  const handleSaveView = async () => {
    const name = window.prompt('Name this view:');
    if (!name?.trim()) return;
    try {
      const res = await fetch('/api/admin/crm/saved-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          entity_type: 'customers',
          filters: { activeTab, locationFilter, typeFilter, staffFilter, leadSourceFilter, lifecycleFilter, tagFilter, search },
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d?.data?.id) {
        showToast(d?.error || 'View could not be saved — nothing was stored.');
        return;
      }
      setSavedViews((prev) => [d.data, ...prev]);
      showToast(`View "${name.trim()}" saved.`);
    } catch {
      showToast('View could not be saved — nothing was stored.');
    }
  };

  const applySavedView = (v: { filters: any }) => {
    const f = v.filters || {};
    if (f.activeTab) setActiveTab(f.activeTab);
    setLocationFilter(f.locationFilter || 'All Locations');
    setTypeFilter(f.typeFilter || 'All Customer Types');
    setStaffFilter(f.staffFilter || 'All Staff');
    setLeadSourceFilter(f.leadSourceFilter || 'All Lead Sources');
    setLifecycleFilter(f.lifecycleFilter || 'All Lifecycle Stages');
    setTagFilter(f.tagFilter || 'All Tags');
    setSearch(f.search || '');
  };

  // Lead sources for filter dropdown (1.14)
  React.useEffect(() => {
    fetch('/api/admin/crm/lead-sources')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setLeadSources(d?.data || []))
      .catch(() => {});
  }, []);

  const leadSourceNameById = React.useMemo(
    () => new Map(leadSources.map((s) => [s.id, s.name])),
    [leadSources]
  );

  // ---- Operational flags (B.1.10) — per-customer indicators for the
  // table + lifecycle board, from GET /api/admin/crm/customers/[id]/flags.
  const [opFlagsByCrmId, setOpFlagsByCrmId] = useState<Record<string, string[]>>({});
  const crmIdsKey = liveDbCustomers
    .map((c) => c.crmCustomerId || '')
    .filter(Boolean)
    .sort()
    .join(',');
  React.useEffect(() => {
    if (!crmIdsKey) return;
    const ids = crmIdsKey.split(',');
    let cancelled = false;
    (async () => {
      const out: Record<string, string[]> = {};
      await Promise.all(
        ids.map(async (crmId) => {
          try {
            const r = await fetch(`/api/admin/crm/customers/${crmId}/flags`, { cache: 'no-store' });
            if (!r.ok) return;
            const d = await r.json();
            const op = d?.data?.operational || {};
            const labels: string[] = [];
            if (op.hasMissingDocuments?.value) labels.push('Missing Documents');
            if (op.hasVaccineExpiring?.value) labels.push('Vaccine Expiring');
            if (op.hasOutstandingBalance?.value) labels.push('Outstanding Balance');
            if (op.hasNoUpcomingAppointment?.value) labels.push('No Upcoming Appointment');
            if (op.hasIntakeIncomplete?.value) labels.push('Intake Incomplete');
            out[crmId] = labels;
          } catch {
            /* indicator simply absent for that row */
          }
        }),
      );
      if (!cancelled) setOpFlagsByCrmId(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [crmIdsKey]);

  // ---- Auto-calc (B.1.7/B.1.8): POST /api/admin/crm/customers/lifecycle
  // runs scoreLifecycleBatch server-side and persists suggested stages.
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [recalcMsg, setRecalcMsg] = useState<string | null>(null);
  const recalculateStages = async () => {
    if (recalcBusy) return;
    setRecalcBusy(true);
    setRecalcMsg(null);
    try {
      const res = await fetch('/api/admin/crm/customers/lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRecalcMsg(j.error || 'Recalculation failed.');
        return;
      }
      const d = j.data || {};
      const n = d.changedCount ?? 0;
      setRecalcMsg(
        `Recalculated ${d.total ?? 0} customers — ${n} stage change${n === 1 ? '' : 's'} applied.`,
      );
      fetchLiveCustomers();
    } catch {
      setRecalcMsg('Recalculation failed.');
    } finally {
      setRecalcBusy(false);
    }
  };

  const opFlagBadge = (cust: ExtendedCustomerRecord) => {
    const fl = cust.crmCustomerId ? opFlagsByCrmId[cust.crmCustomerId] : undefined;
    if (!fl || fl.length === 0) return null;
    return (
      <div
        className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-700"
        title={fl.join(', ')}
      >
        <AlertTriangle className="w-3 h-3 shrink-0" />
        <span className="truncate">
          {fl.length} flag{fl.length === 1 ? '' : 's'}: {fl[0]}
          {fl.length > 1 ? ` +${fl.length - 1}` : ''}
        </span>
      </div>
    );
  };

  // Live Supabase customers only — no demo records are merged into the directory.
  const allList: ExtendedCustomerRecord[] = liveDbCustomers;

  const locationOptions = React.useMemo(
    () => Array.from(new Set(allList.map((c) => c.locationName).filter(Boolean))) as string[],
    [allList]
  );
  const typeOptions = React.useMemo(
    () => Array.from(new Set(allList.map((c) => c.customerType).filter(Boolean))) as string[],
    [allList]
  );
  const staffOptions = React.useMemo(
    () => Array.from(new Set(allList.map((c) => c.assignedStaff).filter(Boolean))) as string[],
    [allList]
  );
  const tagOptions = React.useMemo(
    () => Array.from(new Set(allList.flatMap((c) => c.tags || []))).sort() as string[],
    [allList]
  );


  // Overview metrics (B.1.2.1) — every count is computed from the real
  // directory rows above and reconciles to crm_customers SQL:
  //   total    = all rows            active  = is_active
  //   new      = created_at in 30d   upcoming = has a future appointment
  //   outstanding = SUM(outstanding_balance)   atRisk = lifecycle 'at_risk'
  //   returning (tab) = >= 2 appointments on record
  const metrics = React.useMemo(() => {
    const cutoff30d = Date.now() - 30 * 24 * 3600 * 1000;
    const total = allList.length;
    const active = allList.filter((c) => c.isActive !== false).length;
    const newCount = allList.filter((c) => (c.createdAtTs || 0) >= cutoff30d).length;
    const returning = allList.filter((c) => (c.appointmentCount || 0) >= 2).length;
    const inactive = allList.filter((c) => c.isActive === false).length;
    const followup = allList.filter((c) => c.lifecycleStage === 'at_risk' || c.followupDue).length;
    const atRisk = allList.filter((c) => c.lifecycleStage === 'at_risk').length;
    const upcoming = allList.filter((c) => !!c.nextAppointment).length;
    const outstandingTotal = allList.reduce((sum, c) => sum + (c.balance || 0), 0);
    return { total, active, newCount, returning, inactive, followup, atRisk, upcoming, outstandingTotal };
  }, [allList]);

  // Handle saving new customer to Supabase and updating state
  const handleSaveNewCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustForm.firstName.trim() || !newCustForm.email.trim()) {
      showToast('First name and email are required');
      return;
    }
    setIsSavingCustomer(true);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: newCustForm.firstName.trim(),
          lastName: newCustForm.lastName.trim(),
          email: newCustForm.email.trim(),
          phone: newCustForm.phone.trim(),
          address: newCustForm.address.trim(),
          city: newCustForm.city.trim(),
          state: newCustForm.state.trim(),
          postalCode: newCustForm.postalCode.trim(),
        }),
      });
      const data = await res.json();
      const custId = data?.customer?.id || `cust-db-${Date.now()}`;

      const createdRecord: ExtendedCustomerRecord = {
        id: custId,
        name: `${newCustForm.firstName} ${newCustForm.lastName}`.trim(),
        initials: `${newCustForm.firstName.substring(0, 1)}${newCustForm.lastName.substring(0, 1)}`.toUpperCase(),
        email: newCustForm.email.trim(),
        phone: newCustForm.phone.trim() || '—',
        address: `${newCustForm.address.trim()}, ${newCustForm.city.trim()}, ${newCustForm.state.trim()} ${newCustForm.postalCode.trim()}`,
        pets: [],
        petCount: 0,
        petPhotos: [],
        petDetails: [],
        lastVisit: 'No visits yet',
        totalSpent: 0,
        lifetimeValue: 0,
        balance: 0,
        statusText: 'Active',
        isActive: true,
        createdAtTs: Date.now(),
        appointmentCount: 0,
        customerSince: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        isLiveDb: true,
      };

      setLiveDbCustomers((prev) => [createdRecord, ...prev]);
      setSelectedCustomerForRail(createdRecord);
      setIsRailOpen(true);
      setIsNewCustomerModalOpen(false);
      showToast(`✓ Customer ${createdRecord.name} saved to Supabase!`);
      setNewCustForm({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        address: '',
        city: 'Memphis',
        state: 'TN',
        postalCode: '38141',
      });
    } catch (err: any) {
      showToast(`Error saving customer: ${err.message}`);
    } finally {
      setIsSavingCustomer(false);
    }
  };

  // List views (B.1.2.2) + filters (B.1.2.3). Definitions are the same
  // ones the metrics use, applied to real fields — the old logic keyed
  // tabs off id prefixes ('cust-new-' etc.) that real UUIDs never have,
  // and returned from the tab check before the location/type/staff/
  // lead-source filters could ever run (they were dead controls).
  const filtered = allList.filter((c) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const match = c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
        || c.phone?.includes(q) || c.address?.toLowerCase().includes(q)
        || c.pets?.some((pt) => pt.toLowerCase().includes(q));
      if (!match) return false;
    }
    const cutoff30d = Date.now() - 30 * 24 * 3600 * 1000;
    if (activeTab === 'active' && c.isActive === false) return false;
    if (activeTab === 'new' && (c.createdAtTs || 0) < cutoff30d) return false;
    if (activeTab === 'returning' && (c.appointmentCount || 0) < 2) return false;
    if (activeTab === 'inactive' && c.isActive !== false) return false;
    if (activeTab === 'followup' && !(c.lifecycleStage === 'at_risk' || c.followupDue)) return false;
    if (activeTab === 'upcoming' && !c.nextAppointment) return false;
    if (activeTab === 'outstanding' && (c.balance || 0) <= 0) return false;
    // Secondary filters — all real fields from the directory row.
    if (locationFilter !== 'All Locations' && c.locationName !== locationFilter) return false;
    if (typeFilter !== 'All Customer Types' && c.customerType !== typeFilter) return false;
    if (staffFilter !== 'All Staff' && c.assignedStaff !== staffFilter) return false;
    if (leadSourceFilter !== 'All Lead Sources' && c.leadSourceId !== leadSourceFilter) return false;
    if (lifecycleFilter !== 'All Lifecycle Stages' && (c.lifecycleStage || 'new_lead') !== lifecycleFilter) return false;
    if (tagFilter !== 'All Tags' && !(c.tags || []).includes(tagFilter)) return false;
    return true;
  });

  // Real client-side pagination over the filtered directory (the
  // directory endpoint returns the whole tenant set; paging composes
  // AFTER the filters above — any filter change resets to page 1).
  const customersPager = useTablePagination(filtered, {
    resetDeps: [search, activeTab, locationFilter, typeFilter, staffFilter, leadSourceFilter, lifecycleFilter, tagFilter],
  });

  // Open Full Profile View
  const handleOpenFullProfile = (cust: ExtendedCustomerRecord) => {
    setSelectedProfile(buildProfileFromRecord(cust));
    setViewMode('detail');
  };

  const setActiveModal = useAppStore((s) => s.setActiveModal);
  const sendMagicLink = useSendMagicLink();

  // Deep link from appointment surfaces: /admin/customers?customer_id=<crm id>
  // opens that customer's full profile once the directory has loaded.
  const deepLinkHandledRef = React.useRef(false);
  React.useEffect(() => {
    if (deepLinkHandledRef.current || typeof window === 'undefined') return;
    const param = new URLSearchParams(window.location.search).get('customer_id');
    if (!param || liveDbCustomers.length === 0) return;
    const rec = liveDbCustomers.find((c) => c.crmCustomerId === param || c.id === param);
    if (rec) {
      deepLinkHandledRef.current = true;
      handleOpenFullProfile(rec);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveDbCustomers]);

  // Click on row selects the customer into the Quick View Rail
  const handleRowClick = (cust: ExtendedCustomerRecord) => {
    setSelectedCustomerForRail(cust);
    setIsRailOpen(true);
  };

  // Run an appointment-scoped action against the customer's NEXT upcoming
  // appointment (real POST to the appointments actions route). Appointment
  // verbs need an appointment — when the customer has none upcoming, the
  // toast says exactly that instead of pretending something happened.
  const runNextAppointmentAction = async (verb: string, successMsg: (name: string) => string) => {
    const cust = selectedCustomerForRail;
    const crmId = cust?.crmCustomerId || cust?.id;
    if (!cust || !crmId) {
      showToast('Select a customer first.');
      return;
    }
    try {
      const res = await fetch(`/api/admin/crm/appointments?customer_id=${crmId}&limit=50`);
      const data = await res.json().catch(() => ({}));
      const rows: any[] = data?.data || data?.appointments || [];
      const upcoming = rows
        .filter((a) => !['completed', 'cancelled', 'no_show'].includes(String(a.status)))
        .sort((x, y) => String(x.starts_at || '').localeCompare(String(y.starts_at || '')))[0];
      if (!upcoming) {
        showToast(`No upcoming appointment for ${cust.name} — book one first.`);
        return;
      }
      if (verb === 'add_to_waitlist') {
        const wRes = await fetch('/api/admin/crm/appointments/actions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add_to_waitlist', payload: { customer_id: crmId, notes: 'Waitlist from customer quick actions' } }),
        });
        const wData = await wRes.json().catch(() => ({}));
        if (!wRes.ok || !wData?.ok) {
          showToast(wData?.error || 'Waitlist add failed — nothing was queued.');
          return;
        }
        showToast(`${cust.name} added to the waitlist.`);
        return;
      }
      const aRes = await fetch('/api/admin/crm/appointments/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: verb, payload: { appointment_id: upcoming.id } }),
      });
      const aData = await aRes.json().catch(() => ({}));
      if (!aRes.ok || !aData?.ok) {
        showToast(aData?.error || 'That action could not be saved — nothing changed.');
        return;
      }
      if (verb === 'send_reminder') {
        showToast(aData?.reminderSent ? `Reminder email sent to ${cust.name}.` : `Reminder logged — no email on file for ${cust.name}.`);
        return;
      }
      showToast(successMsg(cust.name));
    } catch (e: any) {
      showToast(e?.message || 'That action could not be completed.');
    }
  };

  // Handler for actions from the Unified Quick Actions Modal — every
  // branch does something real or says honestly why it can't.
  const handleUnifiedQuickAction = (action: UnifiedQuickActionType) => {
    setIsQuickActionsModalOpen(false);
    if (action === 'new-appointment') {
      setActiveQuickActionSubView('new-appointment');
    } else if (action === 'add-pet') {
      setActiveQuickActionSubView('add-pet');
    } else if (action === 'take-payment') {
      setActiveQuickActionSubView('take-payment');
    } else if (action === 'send-message') {
      setActiveQuickActionSubView('send-message');
    } else if (action === 'add-note') {
      setActiveQuickActionSubView('add-note');
    } else if (action === 'update-documents') {
      setActiveQuickActionSubView('update-documents');
    } else if (action === 'view-customer' || action === 'payment-history') {
      if (selectedCustomerForRail) {
        handleOpenFullProfile(selectedCustomerForRail);
      } else {
        showToast('Select a customer first.');
      }
    } else if (action === 'call-customer') {
      const targetPhone = selectedCustomerForRail?.phone;
      if (targetPhone && targetPhone !== '—') {
        window.location.href = `tel:${targetPhone}`;
      } else {
        showToast('No phone number on file for this customer.');
      }
    } else if (action === 'create-invoice') {
      setActiveModal('invoice');
    } else if (action === 'send-magic-link') {
      // Same SA the profile fires (sys_send_magic_link): hashed token row
      // + real Resend email; the toast keys off the server's `emailed`.
      const cust = selectedCustomerForRail;
      const crmId = cust?.crmCustomerId || cust?.id;
      if (!cust || !crmId) {
        showToast('Select a customer first.');
      } else {
        sendMagicLink.mutate(
          { customer_id: crmId, email: cust.email || '' } as never,
          {
            onSuccess: (data: any) => showToast(
              data?.emailed
                ? `Magic link emailed to ${cust.email}.`
                : 'Magic link created, but the email could not be sent.',
            ),
            onError: (err: any) => showToast(err?.message || 'Failed to send magic link — nothing was sent.'),
          },
        );
      }
    } else if (action === 'issue-refund') {
      showToast('Refunds are issued from the payment record — open Payments and pick the payment to refund.');
    } else if (action === 'add-custom-action') {
      showToast('Custom quick actions aren\'t configurable yet.');
    } else if (action === 'waitlist') {
      runNextAppointmentAction('add_to_waitlist', () => '');
    } else if (action === 'confirm-appointment') {
      runNextAppointmentAction('confirm', (n) => `Next appointment confirmed for ${n}.`);
    } else if (action === 'send-reminder') {
      runNextAppointmentAction('send_reminder', () => '');
    } else if (action === 'follow-up') {
      runNextAppointmentAction('follow_up', (n) => `Follow-up note recorded for ${n}.`);
    } else if (action === 'status-check-in') {
      runNextAppointmentAction('check_in', (n) => `${n}'s next appointment checked in.`);
    } else if (action === 'status-in-service') {
      runNextAppointmentAction('in_service', (n) => `${n}'s next appointment is in service.`);
    } else if (action === 'status-complete') {
      runNextAppointmentAction('complete', (n) => `${n}'s next appointment completed.`);
    } else if (action === 'status-hold') {
      runNextAppointmentAction('hold', (n) => `${n}'s next appointment placed on hold.`);
    } else if (action === 'status-no-show') {
      runNextAppointmentAction('no_show', (n) => `${n}'s next appointment marked no-show.`);
    } else if (action === 'reschedule' || action === 'duplicate' || action === 'cancel') {
      showToast('Open the appointment from the Appointments page to reschedule, duplicate, or cancel it.');
    } else {
      showToast(`"${action}" isn't wired yet.`);
    }
  };

  // Dedicated Active Quick Action Sub-Views
  if (activeQuickActionSubView) {
    const activeCustProfile = selectedCustomerForRail
      ? buildProfileFromRecord(selectedCustomerForRail)
      : EMPTY_CUSTOMER_PROFILE;

    return (
      <div className="flex-1 flex flex-col min-h-screen bg-muted/40">
        {toastMessage && (
          <div className="fixed top-4 right-4 z-50 bg-card text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2.5 text-[13px] font-semibold animate-in fade-in slide-in-from-top-3">
            <CheckCircle2 className="w-4 h-4 text-success" />
            <span>{toastMessage}</span>
          </div>
        )}

        {activeQuickActionSubView === 'take-payment' && (
          <QuickActionTakePaymentView
            customer={activeCustProfile}
            onCancel={() => setActiveQuickActionSubView(null)}
            onSuccess={(msg) => {
              setActiveQuickActionSubView(null);
              showToast(msg);
            }}
          />
        )}

        {activeQuickActionSubView === 'new-appointment' && (
          <QuickActionNewAppointmentView
            customer={activeCustProfile}
            onCancel={() => setActiveQuickActionSubView(null)}
            onSuccess={(msg) => {
              setActiveQuickActionSubView(null);
              showToast(msg);
            }}
          />
        )}

        {activeQuickActionSubView === 'add-pet' && (
          <QuickActionAddPetView
            customer={activeCustProfile}
            onCancel={() => setActiveQuickActionSubView(null)}
            onSuccess={(msg) => {
              setActiveQuickActionSubView(null);
              showToast(msg);
            }}
          />
        )}

        {activeQuickActionSubView === 'send-message' && (
          <QuickActionSendMessageView
            customer={activeCustProfile}
            onCancel={() => setActiveQuickActionSubView(null)}
            onSuccess={(msg) => {
              setActiveQuickActionSubView(null);
              showToast(msg);
            }}
          />
        )}

        {activeQuickActionSubView === 'add-note' && (
          <QuickActionAddNoteView
            customer={activeCustProfile}
            onCancel={() => setActiveQuickActionSubView(null)}
            onSuccess={(msg) => {
              setActiveQuickActionSubView(null);
              showToast(msg);
            }}
          />
        )}

        {activeQuickActionSubView === 'update-documents' && (
          <QuickActionUpdateDocumentsView
            customer={activeCustProfile}
            onCancel={() => setActiveQuickActionSubView(null)}
            onSuccess={(msg) => {
              setActiveQuickActionSubView(null);
              showToast(msg);
            }}
          />
        )}
      </div>
    );
  }

  // If in full profile mode, render existing CustomerDetailsView
  if (viewMode === 'detail') {
    return (
      <div className="space-y-4">
        <div className="px-4 sm:px-8 pt-4 flex items-center justify-between">
          <button
            onClick={() => setViewMode('directory')}
            className="text-[13px] font-semibold text-primary hover:text-primary flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer"
          >
            <Users className="w-3.5 h-3.5" />
            <span>&larr; Back to Customer Directory</span>
          </button>

          <div className="text-[11px] text-muted-foreground/70 font-medium">
            Viewing Profile: <strong className="text-foreground">{selectedProfile.name}</strong>
          </div>
        </div>

        <CustomerDetailsView
          customerProfile={selectedProfile}
          onBackToDirectory={() => setViewMode('directory')}
          onOpenNewAppointment={() => setActiveQuickActionSubView('new-appointment')}
          onOpenAddPet={() => setActiveQuickActionSubView('add-pet')}
          onOpenTakePayment={() => setActiveQuickActionSubView('take-payment')}
          onOpenIntake={onOpenIntake}
        />
      </div>
    );
  }

  const activeCustomer = selectedCustomerForRail;

  return (
    <div className="flex h-full min-h-[calc(100vh-56px)] overflow-hidden bg-background text-foreground antialiased font-sans text-[13px]">
      {/* Toast banner */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-card text-foreground px-4 py-2.5 border border-border rounded-lg shadow-popover flex items-center gap-2.5 text-[13px] font-medium animate-in fade-in slide-in-from-top-3">
          <CheckCircle2 className="w-4 h-4 text-success" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Global Quick Actions Modal */}
      <QuickActionsModal
        isOpen={isQuickActionsModalOpen}
        onClose={() => setIsQuickActionsModalOpen(false)}
        onSelectAction={handleUnifiedQuickAction}
        customer={activeCustomer ? buildProfileFromRecord(activeCustomer) : null}
      />

      {/* ================= CENTER CUSTOMER MANAGEMENT DIRECTORY ================= */}
      <div className="flex-1 flex flex-col h-full overflow-y-auto bg-background custom-scrollbar">

        {/* Page header — polished enterprise chrome */}
        <PageHeader
          contextLabel="Customers"
          statusItems={[
            { label: "Total:", value: `${metrics.total.toLocaleString()}` },
            { label: "Active:", value: `${metrics.active.toLocaleString()}`, tone: "success" },
            { label: "At Risk:", value: `${metrics.atRisk.toLocaleString()}`, tone: "warning" },
          ]}
          title="Customers"
          badge={`${metrics.total.toLocaleString()} Total`}
          description="Manage client profiles, pet records, visit history, and outstanding balances across all locations."
          actions={
            <>
              <button
                type="button"
                onClick={() => {
                  fetchLiveCustomers();
                  showToast('Refreshed customer directory from Supabase.');
                }}
                className="size-9 rounded-lg border border-border bg-background hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors cursor-pointer flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title="Refresh Customer Directory"
                aria-label="Refresh customers"
              >
                <RotateCw className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsQuickActionsModalOpen(true)}
                data-tip="Quick ways to help a customer — send a message, add a note, write an invoice."
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 text-[12px] font-medium text-foreground transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Zap className="size-3.5 text-quick" />
                <span>Quick Actions</span>
              </button>
              <button
                onClick={() => setIsNewCustomerModalOpen(true)}
                data-tip="Add a person to your customer list — name, contact details, and anything you need to remember about them."
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3.5 text-[13px] font-medium shadow-card transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                type="button"
              >
                <Plus className="size-4" />
                <span>New Customer</span>
              </button>
              <Link
                href="/admin/crm/new-customer"
                data-tip="Prefer to be walked through it? The guide asks one thing at a time — who they are, where they live, a first note — and shows you the finished customer at the end."
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background hover:bg-accent h-9 px-3 text-[12px] font-medium text-foreground transition-colors cursor-pointer"
              >
                Add step by step
              </Link>
            </>
          }
        />

        {/* Content Container */}
        <div className="p-6 space-y-6">

          {/* Data Management (1.22): duplicate detection + merge, missing contact info */}
          <DataManagementPanel />

          {/* 1. KPI Tiles Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {/* Total Customers */}
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={cn(
                "p-4 rounded-xl border flex flex-col justify-between bg-card text-left transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activeTab === 'all'
                  ? "border-primary shadow-card-md ring-1 ring-primary/20"
                  : "border-border shadow-card hover:-translate-y-0.5 hover:shadow-card-md hover:border-primary/30",
              )}
            >
              <div className="flex items-center justify-between text-muted-foreground mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider">Total Customers</span>
              </div>
              <div className="text-2xl font-display font-semibold tracking-tight tabular-nums text-foreground mt-2">{metrics.total.toLocaleString()}</div>
            </button>

            {/* Active Customers */}
            <button
              type="button"
              onClick={() => setActiveTab('active')}
              className={cn(
                "p-4 rounded-xl border flex flex-col justify-between bg-card text-left transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activeTab === 'active'
                  ? "border-primary shadow-card-md ring-1 ring-primary/20"
                  : "border-border shadow-card hover:-translate-y-0.5 hover:shadow-card-md hover:border-primary/30",
              )}
            >
              <div className="flex items-center justify-between text-muted-foreground mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider">Active Customers</span>
              </div>
              <div className="text-2xl font-display font-semibold tracking-tight tabular-nums text-foreground mt-2">{metrics.active.toLocaleString()}</div>
            </button>

            {/* New This Month */}
            <button
              type="button"
              onClick={() => setActiveTab('new')}
              className={cn(
                "p-4 rounded-xl border flex flex-col justify-between bg-card text-left transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activeTab === 'new'
                  ? "border-primary shadow-card-md ring-1 ring-primary/20"
                  : "border-border shadow-card hover:-translate-y-0.5 hover:shadow-card-md hover:border-primary/30",
              )}
            >
              <div className="flex items-center justify-between text-muted-foreground mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider">New Customers</span>
              </div>
              <div className="text-2xl font-display font-semibold tracking-tight tabular-nums text-foreground mt-2">{metrics.newCount.toLocaleString()}</div>
            </button>

            {/* Upcoming Appointments */}
            <button
              type="button"
              onClick={() => setActiveTab('upcoming')}
              className={cn(
                "p-4 rounded-xl border flex flex-col justify-between bg-card text-left transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activeTab === 'upcoming'
                  ? "border-primary shadow-card-md ring-1 ring-primary/20"
                  : "border-border shadow-card hover:-translate-y-0.5 hover:shadow-card-md hover:border-primary/30",
              )}
            >
              <div className="flex items-center justify-between text-muted-foreground mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider">Upcoming Appts</span>
              </div>
              <div className="text-2xl font-display font-semibold tracking-tight tabular-nums text-foreground mt-2">{metrics.upcoming.toLocaleString()}</div>
            </button>

            {/* Outstanding Balance */}
            <button
              type="button"
              onClick={() => setActiveTab('outstanding')}
              className={cn(
                "p-4 rounded-xl border flex flex-col justify-between bg-card text-left transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activeTab === 'outstanding'
                  ? "border-primary shadow-card-md ring-1 ring-primary/20"
                  : "border-border shadow-card hover:-translate-y-0.5 hover:shadow-card-md hover:border-primary/30",
              )}
            >
              <div className="flex items-center justify-between text-muted-foreground mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider">Outstanding Bal.</span>
              </div>
              <div className="text-2xl font-display font-semibold tracking-tight tabular-nums text-warning mt-2">${metrics.outstandingTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </button>

            {/* At Risk */}
            <button
              type="button"
              onClick={() => setActiveTab('followup')}
              className={cn(
                "p-4 rounded-xl border flex flex-col justify-between bg-card text-left transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activeTab === 'followup'
                  ? "border-primary shadow-card-md ring-1 ring-primary/20"
                  : "border-border shadow-card hover:-translate-y-0.5 hover:shadow-card-md hover:border-primary/30",
              )}
            >
              <div className="flex items-center justify-between text-muted-foreground mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider">At Risk</span>
              </div>
              <div className="text-2xl font-display font-semibold tracking-tight tabular-nums text-destructive mt-2">{metrics.atRisk.toLocaleString()}</div>
            </button>
          </div>

          {/* 2. Filters & Navigation Tabs Container */}
          <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
            {/* Views Tab List */}
            <div className="border-b border-border flex flex-wrap items-center justify-between px-3 pt-1">
              <div className="flex flex-wrap items-center gap-1 text-[13px] whitespace-nowrap">
                {([
                  { id: 'all', label: 'All Customers' },
                  { id: 'active', label: 'Active' },
                  { id: 'new', label: 'New', count: metrics.newCount },
                  { id: 'returning', label: 'Returning' },
                  { id: 'inactive', label: 'Inactive' },
                  { id: 'followup', label: 'Needs Follow-up', count: metrics.followup },
                  { id: 'upcoming', label: 'Upcoming' },
                ] as Array<{ id: typeof activeTab; label: string; count?: number }>).map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "px-3.5 py-2.5 transition-colors cursor-pointer  -mb-px font-medium flex items-center gap-1.5",
                        isActive
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50",
                      )}
                    >
                      <span>{tab.label}</span>
                      {tab.count !== undefined && (
                        <span className="inline-flex items-center justify-center min-w-5 h-4 px-1 rounded-full bg-muted text-muted-foreground text-[10px] font-semibold border border-border">
                          {tab.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={handleSaveView}
                className="h-8 px-3 rounded-lg border border-border bg-background hover:bg-accent hover:text-accent-foreground text-foreground text-[12px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 my-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Bookmark className="size-3.5" />
                <span>Save View</span>
              </button>
              {savedViews.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => applySavedView(v)}
                  className="h-8 px-2.5 rounded-lg bg-muted text-muted-foreground text-[11px] font-medium flex items-center my-1.5 hover:bg-accent cursor-pointer"
                  title="Apply saved view"
                >
                  {v.name}
                </button>
              ))}
            </div>

            {/* Secondary Filters Row */}
            <div className="p-3 bg-background flex flex-wrap items-center justify-between gap-3 border-b border-border">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Location Filter */}
                <FilterSelect
                  aria-label="Filter by location"
                  value={locationFilter}
                  onChange={(v) => setLocationFilter(v)}
                >
                  <option>All Locations</option>
                  {locationOptions.map((l) => (<option key={l} value={l}>{l}</option>))}
                </FilterSelect>

                {/* Customer Types Filter */}
                <FilterSelect
                  aria-label="Filter by customer type"
                  value={typeFilter}
                  onChange={(v) => setTypeFilter(v)}
                >
                  <option>All Customer Types</option>
                  {typeOptions.map((t) => (<option key={t} value={t}>{t}</option>))}
                </FilterSelect>

                {/* Staff Filter */}
                <FilterSelect
                  aria-label="Filter by staff"
                  value={staffFilter}
                  onChange={(v) => setStaffFilter(v)}
                >
                  <option>All Staff</option>
                  {staffOptions.map((st) => (<option key={st} value={st}>{st}</option>))}
                </FilterSelect>

                {/* Lead Source Filter (1.14) */}
                <FilterSelect
                  aria-label="Filter by lead source"
                  value={leadSourceFilter}
                  onChange={(v) => setLeadSourceFilter(v)}
                >
                  <option>All Lead Sources</option>
                  {leadSources.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </FilterSelect>

                {/* More Filters */}
                <button
                  onClick={() => setShowMoreFilters((v) => !v)}
                  className="h-8 inline-flex items-center rounded-lg border border-border bg-background hover:bg-accent hover:text-accent-foreground text-foreground text-[12px] font-medium px-3 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <SlidersHorizontal className="size-3.5 mr-1.5" />
                  <span>More Filters</span>
                </button>

                {/* More Filters panel (audit §1.2.3d) — the additional
                    filters grouped under the one control the tree names:
                    lifecycle stage + customer tags, both over real
                    directory fields. */}
                {showMoreFilters && (
                  <div className="flex items-center gap-2 flex-wrap rounded-lg border border-border bg-muted/30 px-2 py-1.5">
                    <FilterSelect
                      aria-label="Filter by lifecycle stage"
                      value={lifecycleFilter}
                      onChange={(v) => setLifecycleFilter(v)}
                    >
                      <option>All Lifecycle Stages</option>
                      {LIFECYCLE_STAGES.map((st) => (
                        <option key={st.value} value={st.value}>{st.label}</option>
                      ))}
                    </FilterSelect>
                    <FilterSelect
                      aria-label="Filter by tag"
                      value={tagFilter}
                      onChange={(v) => setTagFilter(v)}
                    >
                      <option>All Tags</option>
                      {tagOptions.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </FilterSelect>
                    {(lifecycleFilter !== 'All Lifecycle Stages' || tagFilter !== 'All Tags') && (
                      <button
                        type="button"
                        onClick={() => { setLifecycleFilter('All Lifecycle Stages'); setTagFilter('All Tags'); }}
                        className="text-[11px] font-medium text-muted-foreground hover:text-foreground underline underline-offset-2 cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Table Header Subtitle */}
            <div className="px-4 py-2.5 bg-muted/40 flex items-center justify-between text-[12px] font-medium text-muted-foreground border-b border-border">
              <span>
                {`${filtered.length} Customers`}</span>
              <span className="text-[11px] text-muted-foreground/80">
                {activeTab === 'upcoming' ? 'Sorted by date ascending' : 'Sorted by recent activity'}
              </span>
            </div>

            {/* View toggle: Table | Lifecycle Kanban */}
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => setCustomerViewMode('table')}
                className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg border ${
                  customerViewMode === 'table'
                    ? 'bg-brand-teal/10 text-brand-teal border-brand-teal/40'
                    : 'bg-background text-foreground border-border hover:bg-accent'
                }`}
              >
                Table
              </button>
              <button
                onClick={() => setCustomerViewMode('lifecycle')}
                className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg border ${
                  customerViewMode === 'lifecycle'
                    ? 'bg-brand-teal/10 text-brand-teal border-brand-teal/40'
                    : 'bg-background text-foreground border-border hover:bg-accent'
                }`}
              >
                Lifecycle Kanban
              </button>
              {customerViewMode === 'lifecycle' && (
                <>
                  <button
                    onClick={recalculateStages}
                    disabled={recalcBusy}
                    className="px-3 py-1.5 text-[12px] font-semibold rounded-lg border border-border bg-background text-foreground hover:bg-accent disabled:opacity-40 cursor-pointer"
                    title="Run lifecycle scoring over all customers and apply suggested stages"
                  >
                    {recalcBusy ? 'Recalculating…' : 'Recalculate Stages'}
                  </button>
                  {recalcMsg && <span className="text-[11px] text-muted-foreground">{recalcMsg}</span>}
                </>
              )}
            </div>

            {customerViewMode === 'lifecycle' ? (
              /* Lifecycle Kanban - 8 columns */
              <div className="overflow-x-auto">
                <div className="flex gap-3 min-w-max pb-4">
                  {LIFECYCLE_STAGES.map((stage) => {
                    const stageCustomers = filtered.filter(
                      (c) => (c.lifecycleStage || 'new_lead') === stage.value
                    );
                    return (
                      <div key={stage.value} className="w-64 shrink-0 bg-muted/30 rounded-lg border border-border">
                        <div className={`px-3 py-2 border-b border-border rounded-t-lg ${stage.color.split(' ').slice(0, 2).join(' ')}`}>
                          <div className="font-semibold text-[12px]">{stage.label}</div>
                          <div className="text-[11px] opacity-70">{stageCustomers.length} customers</div>
                        </div>
                        <div className="p-2 space-y-2 max-h-[500px] overflow-y-auto">
                          {stageCustomers.map((cust) => (
                            <div
                              key={cust.id}
                              onClick={() => handleRowClick(cust)}
                              className="bg-background border border-border rounded-lg p-2 cursor-pointer hover:shadow-sm"
                            >
                              <div className="font-semibold text-[12px] truncate">{cust.name}</div>
                              <div className="text-[10px] text-muted-foreground truncate">{cust.email}</div>
                              <div className="text-[10px] text-muted-foreground">
                                {cust.petCount || cust.pets.length} pets
                              </div>
                              {opFlagBadge(cust)}
                              <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                                <select
                                  value={cust.lifecycleStage || 'new_lead'}
                                  onChange={(e) => updateLifecycle(cust, e.target.value)}
                                  className="w-full text-[11px] border border-border rounded px-1 py-0.5 bg-background"
                                >
                                  {LIFECYCLE_STAGES.map((s) => (
                                    <option key={s.value} value={s.value}>{s.label}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          ))}
                          {stageCustomers.length === 0 && (
                            <div className="text-[11px] text-muted-foreground text-center py-4">No customers</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
            /* 3. Customers Table with Specialized Tab Columns */
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-muted/40 text-muted-foreground font-semibold uppercase text-[11px] tracking-wider border-b border-border">
                  <tr>
                    <th className="py-3 px-4 font-semibold" scope="col">Customer</th>
                    <th className="py-3 px-3 text-center font-semibold" scope="col">Pets</th>
                    <th className="py-3 px-4 font-semibold" scope="col">Lifecycle</th>
                    <th className="py-3 px-4 font-semibold" scope="col">Lead Source</th>

                    {activeTab === 'upcoming' ? (
                      <>
                        <th className="py-3 px-4 font-semibold" scope="col">Next Appointment</th>
                        <th className="py-3 px-4 font-semibold" scope="col">Service</th>
                        <th className="py-3 px-4 font-semibold" scope="col">Staff</th>
                      </>
                    ) : activeTab === 'followup' ? (
                      <>
                        <th className="py-3 px-4 font-semibold" scope="col">Last Visit</th>
                        <th className="py-3 px-4 font-semibold" scope="col">Next Appointment</th>
                        <th className="py-3 px-4 font-semibold" scope="col">Reason</th>
                      </>
                    ) : (
                      <>
                        <th className="py-3 px-4 font-semibold" scope="col">Last Visit</th>
                        <th className="py-3 px-4 font-semibold" scope="col">Next Appointment</th>
                        <th className="py-3 px-4 font-semibold" scope="col">Lifetime Value</th>
                      </>
                    )}

                    <th className="py-3 px-4 text-right font-semibold" scope="col">Balance</th>
                    <th className="py-3 px-3 text-right font-semibold" scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-normal">
                  {customersPager.pagedRows.map((cust) => {
                    const isSelected = selectedCustomerForRail?.id === cust.id;
                    return (
                      <tr
                        key={cust.id}
                        onClick={() => handleRowClick(cust)}
                        className={`transition cursor-pointer ${
                          isSelected
                            ? 'bg-foreground/[0-9] hover:bg-foreground/[0-9]0 border-l-4 border-l-black'
                            : 'hover:bg-accent/50'
                        }`}
                      >
                        {/* Customer Info */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            {cust.avatarUrl ? (
                              <div className="relative w-8 h-8 border border-border bg-background shrink-0 overflow-hidden">
                                <Image
                                  src={cust.avatarUrl}
                                  alt={cust.name}
                                  fill
                                  className="object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                            ) : (
                              <div className="w-8 h-8 border border-border bg-primary text-primary-foreground font-semibold flex items-center justify-center text-[13px] shrink-0">
                                {cust.initials || cust.name.substring(0, 2).toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="font-semibold text-foreground hover:underline text-[13px] tracking-tight">
                                {cust.name}
                              </div>
                              <div className="text-[11px] text-muted-foreground tabular-nums">{cust.phone}</div>
                              <div className="text-[10px] text-muted-foreground truncate">{cust.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Pets */}
                        <td className="py-3 px-3 text-center font-semibold text-foreground tabular-nums">
                          {cust.petCount || cust.pets.length}
                        </td>

                        {/* Lifecycle badge + dropdown */}
                        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                          <div className="relative">
                            <button
                              onClick={() => setLifecycleDropdownFor(lifecycleDropdownFor === cust.id ? null : cust.id)}
                              className={`inline-flex items-center px-2 py-0.5 border text-[10px] font-semibold uppercase tracking-wider rounded-full cursor-pointer hover:opacity-80 ${lifecycleMeta(cust.lifecycleStage).color}`}
                            >
                              {lifecycleMeta(cust.lifecycleStage).label}
                            </button>
                            {lifecycleDropdownFor === cust.id && (
                              <div className="absolute z-50 mt-1 w-40 bg-background border border-border rounded-lg shadow-lg py-1">
                                {LIFECYCLE_STAGES.map((stage) => (
                                  <button
                                    key={stage.value}
                                    onClick={() => updateLifecycle(cust, stage.value)}
                                    className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-accent flex items-center gap-2 ${
                                      cust.lifecycleStage === stage.value ? 'font-bold' : ''
                                    }`}
                                  >
                                    <span className={`inline-block w-2 h-2 rounded-full border ${stage.color.split(' ')[0]}`} />
                                    {stage.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {opFlagBadge(cust)}
                        </td>

                        {/* Channel badges (which parts of the business this
                            customer actually transacts with — derived from
                            their appointments, shop orders, and register
                            sales) + Lead Source badge (1.14) */}
                        <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                          {cust.channels && cust.channels.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-1">
                              {cust.channels.map((ch) => (
                                <span
                                  key={ch}
                                  className="inline-flex items-center px-2 py-0.5 bg-ink text-white text-[10px] font-semibold uppercase tracking-wider rounded-full"
                                >
                                  {ch === 'shop' ? 'Shop' : ch === 'grooming' ? 'Grooming' : 'In-Store'}
                                </span>
                              ))}
                            </div>
                          )}
                          {cust.leadSourceId && leadSourceNameById.get(cust.leadSourceId) ? (
                            <span className="inline-flex items-center px-2 py-0.5 border border-border bg-muted/40 text-[10px] font-semibold uppercase tracking-wider rounded-full text-foreground">
                              {leadSourceNameById.get(cust.leadSourceId)}
                            </span>
                          ) : (
                            !(cust.channels && cust.channels.length > 0) && (
                              <span className="text-[11px] text-muted-foreground/50">—</span>
                            )
                          )}
                        </td>

                        {/* Middle Columns based on activeTab */}
                        {activeTab === 'upcoming' ? (
                          <>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-foreground">{cust.nextAppointment}</div>
                              <div className="text-[10px] text-muted-foreground tabular-nums">{cust.nextApptTime || ''}</div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-medium text-foreground">{cust.lastService || '—'}</span>
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-foreground font-medium">{cust.assignedStaff || cust.preferredGroomer || '—'}</span>
                            </td>
                          </>
                        ) : activeTab === 'followup' ? (
                          <>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-foreground">{cust.lastVisit}</div>
                              <div className="text-[10px] text-muted-foreground">{cust.lastService || ''}</div>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground/70">
                              {cust.nextAppointment && cust.nextAppointment !== '—' ? cust.nextAppointment : '—'}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <span className="text-foreground text-[11px] font-medium">{cust.followupReason || (cust.lifecycleStage === 'at_risk' ? 'At risk' : cust.followupDue ? 'Follow-up due' : '—')}</span>
                                <span className={`inline-flex items-center px-1.5 py-0.5 border border-border text-[9px] font-semibold uppercase tracking-wider ${
                                  cust.followupUrgency === 'rose'
                                    ? 'bg-destructive/5 text-destructive'
                                    : 'bg-warning/10 text-warning'
                                }`}>
                                  Follow-up
                                </span>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-3 px-4">
                              {activeTab === 'new' ? (
                                <span className="text-muted-foreground/70 italic">— First Visit Pending</span>
                              ) : (
                                <>
                                  <div className="font-semibold text-foreground">{cust.lastVisit}</div>
                                  <div className="text-[10px] text-muted-foreground">{cust.lastService || ''}</div>
                                  {cust.inactiveDuration && (
                                    <div className="text-[10px] text-destructive font-semibold">{cust.inactiveDuration}</div>
                                  )}
                                </>
                              )}
                            </td>

                            <td className="py-3 px-4">
                              {cust.nextAppointment && cust.nextAppointment !== '—' ? (
                                <>
                                  <div className="font-semibold text-foreground">{cust.nextAppointment}</div>
                                  <div className="text-[10px] text-muted-foreground tabular-nums">{cust.nextApptTime || ''}</div>
                                </>
                              ) : (
                                <div>
                                  <span className="text-muted-foreground/70">—</span>
                                  {activeTab === 'inactive' && (
                                    <div className="text-[10px] text-muted-foreground/70">No Upcoming</div>
                                  )}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-4 tabular-nums font-semibold text-foreground">
                              ${cust.lifetimeValue ? cust.lifetimeValue.toFixed(2) : (cust.totalSpent || 0).toFixed(2)}
                            </td>
                          </>
                        )}

                        {/* Balance */}
                        <td className="py-3 px-4 text-right tabular-nums font-semibold">
                          {(cust.balance || 0) > 0 ? (
                            <span className="inline-block px-1.5 py-0.5 border border-border bg-warning/10 text-warning">${cust.balance?.toFixed(2)}</span>
                          ) : (
                            <span className="inline-block px-1.5 py-0.5 border border-border bg-background text-foreground">$0.00</span>
                          )}
                        </td>

                        {/* 3-Dots Quick Actions Trigger */}
                        <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCustomerForRail(cust);
                              setIsQuickActionsModalOpen(true);
                            }}
                            className="w-7 h-7 border border-border flex items-center justify-center hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal transition-colors text-foreground cursor-pointer ml-auto"
                            title="Quick Actions"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={16} className="p-8 text-center text-muted-foreground">
                        No customers found. New customers will appear here.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            )}

            {/* Pagination / Table footer — real paging in table mode;
                the lifecycle board is a board (it renders every stage
                column), so it carries an honest total instead. */}
            {customerViewMode === 'table' ? (
              <TablePagination
                total={customersPager.total}
                rangeStart={customersPager.rangeStart}
                rangeEnd={customersPager.rangeEnd}
                pageSize={customersPager.pageSize}
                onPageSizeChange={customersPager.setPageSize}
                safePage={customersPager.safePage}
                pageCount={customersPager.pageCount}
                onPageChange={customersPager.setPage}
                unitLabel="entries"
              />
            ) : (
              <div className="p-3 border-t border-border bg-background flex items-center justify-between gap-3 text-[13px]">
                <div className="text-muted-foreground tabular-nums text-[11px]">
                  {filtered.length} customers on the board
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================= RIGHT PERSISTENT CUSTOMER QUICK VIEW DRAWER ================= */}
      {isRailOpen && activeCustomer && (
        <aside className="w-[390px] bg-card border-l border-border flex flex-col shrink-0 overflow-y-auto z-10 custom-scrollbar shadow-2xl">
          {/* Header with Name, Status, and PROMINENT TOP CTA */}
          <div className="p-5 pb-4 border-b border-border bg-background">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-foreground uppercase tracking-tight leading-tight">{activeCustomer.name}</h3>
                  <span className="inline-flex items-center px-1.5 py-0.5 border border-border text-[9px] font-semibold uppercase tracking-wider bg-card text-foreground">
                    Active
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                  Customer Since {activeCustomer.customerSince || '\u2014'}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* Prominent Top Full Profile CTA */}
                <button
                  type="button"
                  onClick={() => handleOpenFullProfile(activeCustomer)}
                  className="h-8 px-3 bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 text-[13px] font-semibold uppercase tracking-wider border border-border inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Open Full Customer Profile"
                >
                  <span>Full Profile</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setIsRailOpen(false)}
                  className="w-8 h-8 border border-border flex items-center justify-center hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal transition-colors text-foreground cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Contact & Primary Profile Information */}
          <div className="p-5 border-b border-border space-y-4 bg-card">
            <div className="flex items-start gap-3">
              {activeCustomer.avatarUrl ? (
                <div className="relative w-12 h-12 border border-border shrink-0 overflow-hidden bg-card">
                  <Image
                    src={activeCustomer.avatarUrl}
                    alt={activeCustomer.name}
                    fill
                    className="object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <div className="w-12 h-12 border border-border bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center shrink-0">
                  {activeCustomer.initials || activeCustomer.name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('')}
                </div>
              )}

              <div className="space-y-1 text-[13px]">
                <div className="flex items-center gap-1.5 text-foreground">
                  <Mail className="w-3.5 h-3.5 text-foreground shrink-0" />
                  <span className="font-semibold">{activeCustomer.email}</span>
                </div>
                <div className="flex items-center gap-1.5 text-foreground">
                  <Phone className="w-3.5 h-3.5 text-foreground shrink-0" />
                  <span className="font-semibold tabular-nums">{activeCustomer.phone}</span>
                </div>
                <div className="flex items-start gap-1.5 text-foreground">
                  <MapPin className="w-3.5 h-3.5 text-foreground shrink-0 mt-0.5" />
                  <div>
                    {activeCustomer.address || 'No address on file'}
                  </div>
                </div>
              </div>
            </div>

            {/* Registered Pets Quick Glance */}
            <div className="pt-3 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  🐾 Registered Pets ({activeCustomer.pets.length})
                </span>
                <button
                  type="button"
                  onClick={() => setActiveQuickActionSubView('add-pet')}
                  className="text-[11px] font-semibold text-foreground uppercase hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add Pet
                </button>
              </div>
              <div className="space-y-1.5">
                {activeCustomer.pets.map((pet, idx) => {
                  const petDisplay = typeof pet === 'string' ? pet : (pet as any)?.name || 'Pet';
                  return (
                    <div key={idx} className="flex items-center justify-between p-2 bg-card border border-border text-[13px]">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">🐾</span>
                        <span className="font-semibold text-foreground">{petDisplay}</span>
                      </div>
                      <span className="text-[10px] bg-card border border-border text-foreground font-semibold uppercase px-1.5 py-0.5">
                        Active
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Account Snapshot Metrics */}
          <div className="p-5 border-b border-border bg-background">
            <h4 className="text-[13px] font-semibold uppercase tracking-wider text-foreground mb-2.5">Account Snapshot</h4>

            <div className="grid grid-cols-3 gap-2 text-center bg-card p-2.5 border border-border">
              <div>
                <span className="text-[9px] uppercase font-semibold text-muted-foreground block">Total Spent</span>
                <span className="text-[13px] font-semibold text-foreground tabular-nums mt-0.5 block">
                  ${activeCustomer.totalSpent ? activeCustomer.totalSpent.toFixed(2) : (activeCustomer.lifetimeValue ? activeCustomer.lifetimeValue.toFixed(2) : '0.00')}
                </span>
              </div>
              <div>
                <span className="text-[9px] uppercase font-semibold text-muted-foreground block">Balance</span>
                <span className={`text-[13px] font-semibold tabular-nums mt-0.5 block ${
                  (activeCustomer.balance || 0) > 0 ? 'text-warning' : 'text-foreground'
                }`}>
                  ${(activeCustomer.balance || 0).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-[9px] uppercase font-semibold text-muted-foreground block">Loyalty</span>
                <span className="text-[13px] font-semibold text-foreground tabular-nums mt-0.5 block">
                  {activeCustomer.loyaltyPoints || 0} pts
                </span>
              </div>
            </div>

            {/* Next / Last visit banner */}
            <div className="mt-3 flex items-center justify-between text-[13px] p-2.5 bg-card border border-border">
              <div>
                <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Next Appointment</span>
                <span className="font-semibold text-foreground">
                  {activeCustomer.nextAppointment && activeCustomer.nextAppointment !== '—' ? activeCustomer.nextAppointment : 'None scheduled'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase block">Last Visit</span>
                <span className="font-semibold text-foreground">{activeCustomer.lastVisit || 'No visits yet'}</span>
              </div>
            </div>
          </div>

          {/* Quick Actions Shortcuts */}
          <div className="p-5 flex-1 bg-card space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[13px] font-semibold uppercase tracking-wider text-foreground">Quick Actions</h4>
              <button
                type="button"
                onClick={() => setIsQuickActionsModalOpen(true)}
                className="text-[11px] text-foreground font-semibold uppercase hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Zap className="w-3 h-3 text-foreground" />
                <span>All Actions</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* 1. New Appointment */}
              <button
                type="button"
                onClick={() => setActiveQuickActionSubView('new-appointment')}
                className="flex items-center gap-2 p-2 border border-border text-[13px] font-medium uppercase tracking-wider text-muted-foreground hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal transition-colors text-left cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>Book Appt</span>
              </button>

              {/* 2. Add Pet */}
              <button
                type="button"
                onClick={() => setActiveQuickActionSubView('add-pet')}
                className="flex items-center gap-2 p-2 border border-border text-[13px] font-medium uppercase tracking-wider text-muted-foreground hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal transition-colors text-left cursor-pointer"
              >
                <PawPrint className="w-3.5 h-3.5 shrink-0" />
                <span>Add Pet</span>
              </button>

              {/* 3. Take Payment */}
              <button
                type="button"
                onClick={() => setActiveQuickActionSubView('take-payment')}
                className="flex items-center gap-2 p-2 border border-border text-[13px] font-medium uppercase tracking-wider text-muted-foreground hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal transition-colors text-left cursor-pointer"
              >
                <DollarSign className="w-3.5 h-3.5 shrink-0" />
                <span>Take Payment</span>
              </button>

              {/* 4. Send Message */}
              <button
                type="button"
                onClick={() => setActiveQuickActionSubView('send-message')}
                className="flex items-center gap-2 p-2 border border-border text-[13px] font-medium uppercase tracking-wider text-muted-foreground hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal transition-colors text-left cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                <span>Send Message</span>
              </button>

              {/* 5. Add Note */}
              <button
                type="button"
                onClick={() => setActiveQuickActionSubView('add-note')}
                className="flex items-center gap-2 p-2 border border-border text-[13px] font-medium uppercase tracking-wider text-muted-foreground hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal transition-colors text-left cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span>Add Note</span>
              </button>

              {/* 6. Update Documents */}
              <button
                type="button"
                onClick={() => setActiveQuickActionSubView('update-documents')}
                className="flex items-center gap-2 p-2 border border-border text-[13px] font-medium uppercase tracking-wider text-muted-foreground hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal transition-colors text-left cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>Documents</span>
              </button>
            </div>
          </div>

          {/* Prominent Bottom See More CTA */}
          <div className="p-4 bg-card border-t border-border mt-auto sticky bottom-0">
            <button
              type="button"
              onClick={() => handleOpenFullProfile(activeCustomer)}
              className="w-full h-10 bg-card text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 font-semibold uppercase tracking-wider text-[13px] border border-border flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>See More in Full Customer Profile</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </aside>
      )}

      {/* ================= NEW CUSTOMER & PET CREATION MODAL ================= */}
      {isNewCustomerModalOpen && (
        <div className="fixed inset-0 bg-foreground/[0-9]0 z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-card max-w-xl w-full border-2 border-border overflow-hidden my-8 shadow-2xl">
            {/* Header */}
            <div className="px-6 py-4 bg-card border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 border border-border bg-primary text-primary-foreground flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display text-base font-semibold tracking-tight text-foreground">Add New Customer</h3>
                  <p className="text-[13px] text-muted-foreground">Saves directly to Supabase cloud database</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewCustomerModalOpen(false)}
                className="w-8 h-8 border border-border flex items-center justify-center hover:border-brand-teal/60 hover:bg-brand-teal/5 hover:text-brand-teal transition-colors text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveNewCustomer} className="p-6 space-y-4 text-[13px] bg-card">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium uppercase tracking-wider text-muted-foreground mb-1">
                    First Name <span className="text-foreground font-semibold">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newCustForm.firstName}
                    onChange={(e) => setNewCustForm({ ...newCustForm, firstName: e.target.value })}
                    placeholder="e.g. Marcus"
                    className="w-full px-3 py-2 bg-card border border-border focus:outline-none focus:ring-1 focus:ring-black text-foreground"
                  />
                </div>
                <div>
                  <label className="block font-medium uppercase tracking-wider text-muted-foreground mb-1">
                    Last Name <span className="text-foreground font-semibold">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newCustForm.lastName}
                    onChange={(e) => setNewCustForm({ ...newCustForm, lastName: e.target.value })}
                    placeholder="e.g. Vance"
                    className="w-full px-3 py-2 bg-card border border-border focus:outline-none focus:ring-1 focus:ring-black text-foreground"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium uppercase tracking-wider text-muted-foreground mb-1">
                    Email Address <span className="text-foreground font-semibold">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={newCustForm.email}
                    onChange={(e) => setNewCustForm({ ...newCustForm, email: e.target.value })}
                    placeholder="customer@example.com"
                    className="w-full px-3 py-2 bg-card border border-border focus:outline-none focus:ring-1 focus:ring-black text-foreground"
                  />
                </div>
                <div>
                  <label className="block font-medium uppercase tracking-wider text-muted-foreground mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={newCustForm.phone}
                    onChange={(e) => setNewCustForm({ ...newCustForm, phone: e.target.value })}
                    placeholder="(901) 555-0199"
                    className="w-full px-3 py-2 bg-card border border-border focus:outline-none focus:ring-1 focus:ring-black text-foreground"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block font-medium uppercase tracking-wider text-muted-foreground mb-1">Street Address</label>
                  <input
                    type="text"
                    value={newCustForm.address}
                    onChange={(e) => setNewCustForm({ ...newCustForm, address: e.target.value })}
                    placeholder="699 Waring Rd"
                    className="w-full px-3 py-2 bg-card border border-border focus:outline-none focus:ring-1 focus:ring-black text-foreground"
                  />
                </div>
                <div>
                  <label className="block font-medium uppercase tracking-wider text-muted-foreground mb-1">City / State</label>
                  <input
                    type="text"
                    value={newCustForm.city}
                    onChange={(e) => setNewCustForm({ ...newCustForm, city: e.target.value })}
                    placeholder="Memphis, TN"
                    className="w-full px-3 py-2 bg-card border border-border focus:outline-none focus:ring-1 focus:ring-black text-foreground"
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 flex items-center justify-end gap-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsNewCustomerModalOpen(false)}
                  className="px-4 py-2 text-[13px] font-medium uppercase tracking-wider text-muted-foreground border border-border bg-background hover:bg-accent/50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingCustomer}
                  className="px-5 py-2 text-[13px] font-semibold uppercase tracking-wider text-brand-teal bg-card hover:border-brand-teal/60 hover:bg-brand-teal/5 border border-border transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {isSavingCustomer ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving to Supabase...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Save Customer &amp; Pet</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
