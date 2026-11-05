import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  AuthUser,
  AppointmentItem,
  Customer,
  LocationItem,
  DawgNavSection,
} from '@/lib/types';

interface AppState {
  // Auth
  currentUser: AuthUser | null;
  setUser: (user: AuthUser | null) => void;

  // Navigation
  activeSection: DawgNavSection;
  setActiveSection: (section: DawgNavSection) => void;

  // UI state
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Location
  selectedLocation: string;
  setSelectedLocation: (loc: string) => void;
  locations: LocationItem[];
  setLocations: (locs: LocationItem[]) => void;
  addLocation: (loc: Partial<LocationItem>) => void;
  deleteLocation: (id: string) => void;

  // Data
  appointments: AppointmentItem[];
  setAppointments: (fn: (prev: AppointmentItem[]) => AppointmentItem[]) => void;
  customers: Customer[];
  setCustomers: (fn: (prev: Customer[]) => Customer[]) => void;

  // Modal state
  activeModal: 'customer' | 'payment' | 'invoice' | 'search' | null;
  setActiveModal: (modal: AppState['activeModal']) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Auth
      currentUser: null,
      setUser: (user) => set({ currentUser: user }),

      // Navigation
      activeSection: 'dashboard',
      setActiveSection: (section) => set({ activeSection: section }),

      // UI state
      mobileOpen: false,
      setMobileOpen: (open) => set({ mobileOpen: open }),
      isSidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed })),

      // Location — REAL per-tenant locations only. The shell hydrates
      // this list from the active tenant's tenant_locations via
      // useTenantLocations (see src/lib/useTenantLocations.ts); there
      // is deliberately NO seed data here — a tenant with one location
      // shows one, a tenant with none shows none.
      selectedLocation: '',
      setSelectedLocation: (loc) => set({ selectedLocation: loc }),
      locations: [],
      setLocations: (locs) => set({ locations: locs }),
      addLocation: (loc) => set((s) => ({ locations: [...s.locations, loc as LocationItem] })),
      deleteLocation: (id) => set((s) => ({ locations: s.locations.filter((l) => l.id !== id) })),

      // Data
      // Appointments — NO seed data. Every surface that paints
      // appointments fetches the real rows itself (AppointmentsView and
      // the admin Calendar both use fetchEnrichedAppointments from
      // lib/appointments-map); the legacy RICH_APPOINTMENTS_DATA demo
      // dataset is deliberately NOT loaded here anymore. This slice
      // remains only as the appointments page's status-update target;
      // the quick-action modal writes through the real API (see the
      // seam handlers in the admin layout).
      // Pets / groomingRecords slices are GONE entirely: /admin/pets
      // fetches /api/admin/crm/pets/profiles and /admin/grooming-records
      // fetches /api/admin/crm/grooming-records — real data only, no
      // INITIAL_PETS / GROOMING_RECORDS mock seeds anywhere.
      appointments: [],
      setAppointments: (fn) => set((s) => ({ appointments: fn(s.appointments) })),
      // Customers — NO seed data. CustomersView self-fetches the real
      // directory (GET /api/admin/crm/customers/directory) and never
      // paints this slice; it remains only because the customers page
      // still passes it through as a prop. The INITIAL_CUSTOMERS mock
      // seed is deliberately NOT loaded here anymore.
      customers: [],
      setCustomers: (fn) => set((s) => ({ customers: fn(s.customers) })),

      // Modal state
      activeModal: null,
      setActiveModal: (modal) => set({ activeModal: modal }),

      // Staff schedules / KPI metrics / booking funnel / alerts slices
      // are GONE entirely: they were seeded from dawg-mock-data and had
      // no consumers left. The dashboard builds its metrics, funnel,
      // alerts, and staff schedules from the real /api/admin/dashboard*
      // endpoints into local state; the staff page reads
      // /api/admin/staff (crm_staff + crm_staff_shifts). Nothing reads
      // them from this store anymore.
    }),
    {
      name: 'portal-portal-store',
      // Only persist auth + UI state, not data arrays
      partialize: (s) => ({
        currentUser: s.currentUser,
        isSidebarCollapsed: s.isSidebarCollapsed,
        selectedLocation: s.selectedLocation,
      }),
    },
  ),
);
