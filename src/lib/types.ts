// ---------------------------------------------------------------------------
// DawgNavSection — the union of every admin/customer/seller sidebar section
// id. Kept here (the shared types module) so every portal page + component
// imports the same union. Adding a new admin route? add its id here.
// ---------------------------------------------------------------------------
export type DawgNavSection =
  | "dashboard"
  | "customers"
  | "calendar"
  | "pets"
  | "appointments"
  | "grooming-records"
  | "pos"
  | "services"
  | "staff"
  | "schedule"
  | "pay"
  | "hr"
  | "orders"
  | "order-details"
  | "inventory"
  | "shipping"
  | "live"
  | "returns"
  | "purchase-orders"
  | "supplier-orders"
  | "products"
  | "categories"
  | "catalog"
  | "brands"
  | "filters"
  | "promotions"
  | "newsletter"
  | "books"
  | "bills"
  | "banking"
  | "invoices"
  | "payments"
  | "deposits"
  | "refunds"
  | "gift-cards"
  | "payroll"
  | "taxes"
  | "reports"
  | "analytics"
  | "financial-settings"
  | "stripe-connections"
  | "settings"
  | "messages"
  | "subscriptions"
  | "documents"
  | "check-in"
  | "phone-messages"
  | "my-learning"
  | "course-catalog"
  | "in-progress"
  | "completed"
  | "certificates"
  | "resources"
  | "sellers"
  | "sellers/review-queue"
  | "sellers/advertising"
  | "listings"
  | "catalog-review"
  | "brand-registry"
  | "fees"
  | "trust-safety"
  | "policies"
  | "docs"
  | "ai-ops"
  | "audit"
  | "identity-grants"
  | "my-website"
  | "website-templates"
  | "franchise"
  | "franchise/signup"
  | "profile"
  // Seller Center sections (B.16 shell) — ids are the /seller route segments.
  | "onboarding"
  | "catalog"
  | "pricing"
  | "governance"
  | "advertising"
  | "performance"
  | "communication"
  | "account"
  | "tax"
  | "brands"
  | "success"
  | "social";

export type Area = {
  area: string;
  statute: string;
  grades: string[] | null;
  sourceExcerpt: string;
  excerptCitation: string;
  citationMatchesExcerpt: boolean;
};

export type StateSummary = {
  state: string;
  authority: string;
  mode: "require" | "recommend";
  standardStatute: string;
  curriculumEntity: string;
  areas: Area[];
};

export type Selection = {
  state: string;
  area: string;
  statute: string;
  grade: string;
};

export type CompanionSection = {
  title: string;
  lesson: string;
  workedExample: string;
  checks: string[];
};

export type Companion = {
  title: string;
  subtitle: string;
  overview: string;
  alignment: {
    state: string;
    grade: string;
    area: string;
    statute: string;
    authority: string;
    note: string;
  };
  learningObjectives: string[];
  sections: CompanionSection[];
  independentPractice: string[];
  appliedProject: {
    title: string;
    brief: string;
    deliverables: string[];
  };
  glossary: Array<{ term: string; definition: string }>;
  familyNote: string;
  sources: string[];
};

export type CourseRecord = {
  id: number;
  state: string;
  area: string;
  statute: string;
  grade: string;
  title: string;
  companion: Companion;
  model: string;
  createdAt: string;
};

export interface KPIMetric {
  id: string;
  label: string;
  value: string;
  change: string;
  period: string;
  isPositive: boolean;
  iconName:
    | 'calendar'
    | 'currency-dollar'
    | 'user-plus'
    | 'paw-print'
    | 'arrows-clockwise'
    | 'shopping-cart'
    | 'trending-up'
    | 'package'
    | 'ticket';
  colorTheme: 'purple' | 'emerald' | 'blue' | 'amber' | 'rose';
}

export type AppointmentStatus =
  | 'Scheduled'
  | 'Confirmed'
  | 'Checked In'
  | 'In Progress'
  | 'Ready for pickup'
  | 'Completed'
  | 'Canceled'
  | 'Cancelled'
  | 'No Show'
  | 'Waitlisted';

export interface AppointmentItem {
  id: string;
  /** Raw start instant (ISO) from the enriched appointments API — the
   *  calendar/timeline surfaces sort and bucket on it. */
  startsAt?: string;
  appointmentNumber?: string;
  customerId?: string;
  customerEmail?: string;
  petId?: string;
  amountPaid?: number;
  taxTotal?: number;
  outstandingAmount?: number;
  assignedGroomerId?: string | null;
  date?: string; // e.g. '2025-05-16' or 'May 16, 2025'
  time?: string; // e.g. '8:30 AM' or '8:30 AM (2.5 hrs)'
  duration?: string; // e.g. '2.5 hrs'
  customerName?: string;
  customerInitials?: string;
  customerAvatar?: string;
  petName: string;
  breed: string;
  petEmoji: string;
  petAvatar?: string;
  serviceName: string;
  staffName?: string;
  staffInitials?: string;
  staffAvatar?: string;
  location?: string;
  status: AppointmentStatus;
  price?: number;
  paymentStatus?: 'Deposit Paid' | 'Paid in Full' | 'Unpaid' | '—';
  depositAmount?: number;
  customerPhone?: string;
  phone?: string;
  serviceCategory?: string;
  notes?: string;
  cancellationReason?: string;
  canceledAt?: string;
  bookingOutcome?: 'booked' | 'pending' | 'cancelled' | 'lost' | 'no_response' | null;
  lostReasonId?: string | null;
  preferredDate?: string;
  addedOn?: string;
}

export type SlotStatus = 'booked' | 'available' | 'break' | 'blocked';

export interface StaffScheduleItem {
  id: string;
  name: string;
  role: 'Groomer' | 'Bather' | 'Stylist' | 'Assistant';
  initials: string;
  slots: SlotStatus[];
  appointmentsCount: number;
  phone?: string;
  commissionRate?: number;
}

export interface FunnelStage {
  stage: string;
  count: number;
  subtext: string;
  conversionPercent?: string;
  bgClass: string;
  textClass: string;
}

export interface GroomingRecord {
  id: string;
  petName: string;
  breed: string;
  petEmoji: string;
  date: string;
  serviceName: string;
  groomer: string;
  amount: number;
  status: 'Paid' | 'Unpaid' | 'Pending';
  cutDetails?: string;
  coatCondition?: string;
}

export interface AlertNotification {
  id: string;
  title: string;
  description: string;
  count: number;
  type: 'vaccination' | 'document' | 'birthday' | 'inventory';
  iconName: 'first-aid' | 'file-text' | 'cake' | 'package';
  bgIconColor: string;
  badgeBg: string;
  badgeText: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  pets: string[];
  totalSpent: number;
  lastVisit: string;
  preferredGroomer?: string;
  notes?: string;
  avatarUrl?: string;
  address?: string;
  status?: string;
}

export interface PetRecord {
  id: string;
  name: string;
  breed: string;
  age: string;
  weight: string;
  ownerName: string;
  emoji: string;
  vaccinationStatus: 'Up to date' | 'Expiring Soon' | 'Expired';
  specialNotes?: string;
  lastGroomDate?: string;
  preferredGroomer?: string;
}

export interface ServiceItem {
  id: string;
  name: string;
  category: 'Full Groom' | 'Bath & Brush' | 'Deluxe Spa' | 'Add-on' | 'A La Carte' | string;
  durationMinutes: number;
  price: number;
  description: string;
  active?: boolean;
}

export interface ProductItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  stock?: number;
  minStock?: number;
  inStock?: number;
  reorderPoint?: number;
  price: number;
  supplier?: string;
  [key: string]: any;
}

export interface LocationItem {
  id: string;
  name: string;
  type: string;
  address: string;
  cityStateZip: string;
  phone: string;
  email: string;
  manager: string;
  status: 'Active' | 'Under Maintenance' | 'Opening Soon';
  stationCount: number;
  operatingHours: string;
  isDefault: boolean;
}

// UserRole is the e-commerce role vocabulary: the marketplace admin, the
// buying customer, and the third-party seller. (Legacy groomer / vet /
// pharmacy values were dropped when the platform moved off pet/grooming;
// they are kept out of this union because no e-commerce flow grants them.)
export type UserRole = 'admin' | 'customer' | 'seller';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  stationName?: string;
  membershipRole?: string;
}

export interface CustomerFullProfile {
  id: string;
  crmCustomerId?: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  status?: string;
  memberSince?: string;
  customerSince?: string;
  avatarUrl?: string;
  vipStatus?: string;
  vip?: boolean;
  totalSpent: number;
  lifetimeValue?: number;
  outstandingBalance?: number;
  totalVisits?: number;
  loyaltyPoints?: number;
  preferredContact?: string;
  notes?: string;
  communicationOptIn?: {
    sms: boolean;
    email: boolean;
    marketing: boolean;
  };
  pets: any[];
  paymentMethods?: Array<{
    id: string;
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    isDefault: boolean;
  }>;
  defaultPaymentMethod?: {
    cardBrand: string;
    last4: string;
    expires: string;
  };
  paymentHistory?: any[];
  recentActivity?: any[];
  communication?: any;
  upcomingAppointments?: any[];
}

export interface CustomerPetDetail {
  id: string;
  name: string;
  breed: string;
  age: string;
  weight: string;
  gender: string;
  birthDate?: string;
  isPrimary?: boolean;
  isSpayedNeutered?: boolean;
  color?: string;
  microchipNumber?: string;
  allergies?: string[];
  medicalAlerts?: string[];
  medicalAlert?: string;
  vaccinationsStatus?: string;
  behaviorFlags?: string[];
  preferredGroomer?: string;
  groomingFrequencyWeeks?: number;
  lastGroomDate?: string;
  nextApptDate?: string;
  nextApptType?: string;
  vaccines?: {
    rabies: { status: 'Up to date' | 'Expiring Soon' | 'Expired'; expires: string };
    dhpp: { status: 'Up to date' | 'Expiring Soon' | 'Expired'; expires: string };
    bordetella: { status: 'Up to date' | 'Expiring Soon' | 'Expired'; expires: string };
  };
  photoUrl?: string;
  imageUrl?: string;
}

export interface CustomerAppointmentItem {
  id: string;
  date: string;
  time: string;
  petName: string;
  service: string;
  groomer: string;
  amount: number;
  status: 'Completed' | 'Upcoming' | 'Canceled' | 'In Progress' | 'Checked In' | 'No Show';
  deposit?: number;
  addons?: string[];
}

export interface GroomerAppointmentItem {
  id: string;
  time: string;
  duration?: string;
  petName: string;
  breed: string;
  age?: string;
  weight?: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail?: string;
  serviceName?: string;
  serviceType?: string;
  durationMinutes?: number;
  status: 'Scheduled' | 'Checked In' | 'In Service' | 'In Bath' | 'On Table' | 'Blow Drying' | 'Styling' | 'Ready for Pickup' | 'Completed';
  price?: number;
  coatType?: string;
  temperament?: string;
  specialHandlingNotes?: string;
  bladeGuide?: string;
  photoUrl?: string;
  petImage?: string;
  allergies?: string;
  healthAlert?: string;
  stationName?: string;
  lastGroomDate?: string;
  instructions?: string;
  notes?: string;
  ownerNotes?: string;
  internalNotes?: string[];
  addons?: Array<{ name: string; price: number }>;
  [key: string]: any;
}
