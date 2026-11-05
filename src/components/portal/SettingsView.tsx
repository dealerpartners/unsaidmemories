'use client';

import React, { useState, useEffect } from 'react';
import { LocationItem, DawgNavSection } from '@/lib/types';
import { SystemSettings, DEFAULT_SETTINGS } from '@/lib/settings-types';
import {
  Search,
  Bell,
  HelpCircle,
  ExternalLink,
  BarChart3,
  CreditCard,
  FileText,
  LayoutGrid,
  Building2,
  Users,
  Calendar,
  Tag,
  Globe,
  UserCheck,
  MessageSquare,
  Package,
  Sliders,
  ChevronRight,
  ArrowLeft,
  X,
  GraduationCap,
  Activity,
  Mail,
  Shield,
} from 'lucide-react';

// Import All 16 Dedicated Design Screens
import { SettingsOverviewDashboardScreen } from './settings/screens/SettingsOverviewDashboardScreen';
import { OrgMultiLocationScreen } from './settings/screens/OrgMultiLocationScreen';
import { BusinessProfileScreen } from './settings/screens/BusinessProfileScreen';
import { OrgBrandIdentityScreen } from './settings/screens/OrgBrandIdentityScreen';
import { UsersStaffRolesScreen } from './settings/screens/UsersStaffRolesScreen';
import { BookingOperationsRulesScreen } from './settings/screens/BookingOperationsRulesScreen';
import { BookingRulesPoliciesScreen } from './settings/screens/BookingRulesPoliciesScreen';
import { ServicesPricingMatrixScreen } from './settings/screens/ServicesPricingMatrixScreen';
import { ServicesAddonCatalogScreen } from './settings/screens/ServicesAddonCatalogScreen';
import { PromoBuilderScreen } from './settings/screens/PromoBuilderScreen';
import PromotionsPage from '@/app/(portals)/admin/promotions/page';
import { StripeIntegrationScreen } from './settings/screens/StripeIntegrationScreen';
import { PaymentsTaxLegalScreen } from './settings/screens/PaymentsTaxLegalScreen';
import { InvoicesAgingLedgerScreen } from './settings/screens/InvoicesAgingLedgerScreen';
import { CmsBookingWizardScreen } from './settings/screens/CmsBookingWizardScreen';
import { LegalWaiversScreen } from './settings/screens/LegalWaiversScreen';
import { CustomerPortalScreen } from './settings/screens/CustomerPortalScreen';
import { OrgSocialDirectoriesScreen } from './settings/screens/OrgSocialDirectoriesScreen';
import { OmsAddProductScreen } from './settings/screens/OmsAddProductScreen';
import { SystemHealthTelemetryScreen } from './settings/screens/SystemHealthTelemetryScreen';
import { SecurityPostureScreen } from './settings/screens/SecurityPostureScreen';
import { AnalyticsReportingScreen } from './settings/screens/AnalyticsReportingScreen';
import { EscrowDepositsForfeituresScreen } from './settings/screens/EscrowDepositsForfeituresScreen';
import { EmailTemplatesScreen } from './settings/screens/EmailTemplatesScreen';

// Secondary LMS Tab
import { LMSTab } from './settings/LMSTab';

interface SettingsViewProps {
  locations: LocationItem[];
  selectedLocation: string;
  onSelectLocation: (locName: string) => void;
  onAddLocation: (newLoc: Partial<LocationItem>) => void;
  onDeleteLocation?: (id: string) => void;
  onNavigateSection?: (section: DawgNavSection) => void;
  onOpenQuickAction?: (action: 'customer' | 'payment' | 'invoice') => void;
  initialTab?: string;
}

export type SettingsTabId =
  | 'overview'
  | 'organization'
  | 'org-multiloc'
  | 'org-brand'
  | 'users'
  | 'users-staff'
  | 'lms'
  | 'booking'
  | 'booking-ops'
  | 'booking-rules'
  | 'services'
  | 'services-pricing'
  | 'services-catalog'
  | 'promos'
  | 'coupons'
  | 'payments'
  | 'revenue-stripe'
  | 'payments-tax'
  | 'website'
  | 'cms-wizard'
  | 'portal'
  | 'business-profile'
  | 'legal-waivers'
  | 'customer-portal'
  | 'communications'
  | 'email-templates'
  | 'org-social'
  | 'inventory'
  | 'oms-add-product'
  | 'reports'
  | 'invoices-aging'
  | 'health'
  | 'system'
  | 'system-telemetry'
  | 'security-posture'
  | 'analytics-reporting'
  | 'escrow-deposits';

interface TabConfig {
  id: SettingsTabId;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

interface TabCategory {
  title: string;
  tabs: TabConfig[];
}

const TAB_CATEGORIES: TabCategory[] = [
  {
    title: '4.0 ORG / SETTINGS',
    tabs: [
      { id: 'overview', label: 'Overview', icon: LayoutGrid },
      { id: 'business-profile', label: 'Business Profile', icon: Building2 },
      { id: 'org-multiloc', label: 'Locations & Branches', icon: Building2 },
      { id: 'org-brand', label: 'Brand & Identity', icon: Tag },
      { id: 'org-social', label: 'Social & Directories', icon: Globe },
    ],
  },
  {
    title: 'ADMIN USERS',
    tabs: [
      { id: 'users-staff', label: 'Users & Access', icon: Users, badge: 'Active' },
    ],
  },
  {
    title: 'BOOKING & OPERATIONS',
    tabs: [
      { id: 'booking-ops', label: 'Booking Rules', icon: Calendar },
      { id: 'booking-rules', label: 'Operating Hours & Holidays', icon: Calendar },
    ],
  },
  {
    title: 'HEALTH & SYSTEM STATUS',
    tabs: [
      { id: 'system-telemetry', label: 'System Health', icon: Activity, badge: 'Live' },
      { id: 'security-posture', label: 'Security Posture', icon: Shield },
    ],
  },
  {
    title: '4.1 CMS',
    tabs: [
      { id: 'services-pricing', label: 'Services & Pricing Menu', icon: Tag },
      { id: 'services-catalog', label: 'Services Catalog', icon: Tag },
      { id: 'promos', label: 'Promo Codes & Offers', icon: Tag, badge: 'New' },
      { id: 'coupons', label: 'Coupons & Deals', icon: Tag },
      { id: 'cms-wizard', label: 'CMS Management / AI Web Builder', icon: Globe },
      { id: 'legal-waivers', label: 'Legal & Waivers', icon: FileText },
      { id: 'customer-portal', label: 'Customer Portal Settings', icon: UserCheck },
      { id: 'revenue-stripe', label: 'Payments & Gateway Settings', icon: CreditCard },
    ],
  },
  {
    title: '4.2 COMMUNICATIONS & EMAIL',
    tabs: [
      { id: 'email-templates', label: 'Email Templates', icon: Mail, badge: '35' },
    ],
  },
  {
    title: '4.3 ANALYTICS & REPORTS',
    tabs: [
      { id: 'analytics-reporting', label: 'Dashboard & Reports', icon: BarChart3 },
    ],
  },
];

const ALL_TABS: TabConfig[] = TAB_CATEGORIES.flatMap((c) => c.tabs);

export const SettingsView: React.FC<SettingsViewProps> = ({
  locations,
  selectedLocation,
  onSelectLocation,
  onAddLocation,
  onDeleteLocation,
  onNavigateSection,
  onOpenQuickAction,
  initialTab = 'overview',
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(
    (initialTab as SettingsTabId) || 'overview'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  // Database settings state
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch("/api/admin/settings");
        if (res.ok) {
          const data = await res.json();
          setSystemSettings(data);
        }
      } catch (err) {
        console.error("Failed to load settings from Supabase API:", err);
      } finally {
        setIsSettingsLoading(false);
      }
    }
    fetchSettings();
  }, []);

  // Returns true only when the API confirmed the write — screens gate
  // their "Saved" indicators on this so a failed POST never paints as a
  // successful save. (The local state merge stays optimistic for typing
  // responsiveness; the return value is the persistence truth.)
  const saveSettingsToDb = async (updates: Partial<SystemSettings>): Promise<boolean> => {
    setSystemSettings((prev) => ({ ...prev, ...updates }));
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        console.error("Failed to save settings to database:", res.status);
        return false;
      }
      return true;
    } catch (err) {
      console.error("Failed to save settings to database:", err);
      return false;
    }
  };

  const navigateToScreen = (screenId: string) => {
    setActiveTab(screenId as SettingsTabId);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  // Quick search filter
  const filteredTabs = searchQuery.trim()
    ? ALL_TABS.filter(
        (t) =>
          t.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const activeTabConfig =
    ALL_TABS.find((t) => t.id === activeTab) ||
    ALL_TABS.find((t) => {
      if (activeTab === 'users') return t.id === 'users-staff';
      if (activeTab === 'organization') return t.id === 'org-multiloc';
      if (activeTab === 'booking') return t.id === 'booking-ops';
      if (activeTab === 'services') return t.id === 'services-pricing';
      if (activeTab === 'payments') return t.id === 'revenue-stripe';
      if (activeTab === 'website') return t.id === 'cms-wizard';
      if (activeTab === 'portal') return t.id === 'customer-portal';
      if (activeTab === 'communications') return t.id === 'customer-portal';
      if (activeTab === 'inventory') return t.id === 'services-catalog';
      if (activeTab === 'reports') return t.id === 'analytics-reporting';
      if (activeTab === 'system' || activeTab === 'health') return t.id === 'system-telemetry';
      return false;
    }) ||
    ALL_TABS[0];

  const ActiveIcon = activeTabConfig.icon;

  return (
    <div className="min-h-full bg-card text-foreground font-bar antialiased text-[13px]">
      {/* Top Header Bar */}
      <header className="px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border bg-card sticky top-0 z-40">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-foreground font-bar">
            Organization Settings
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Manage branches, team permissions, booking parameters, service matrices, and salon operations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-64 md:w-72">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search settings..."
              className="w-full pl-9 pr-8 h-8 bg-muted/30 border border-border rounded-lg text-[13px] focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            onClick={() => navigateToScreen('cms-wizard')}
            className="inline-flex items-center gap-1.5 px-3 h-8 bg-primary hover:bg-primary/90 text-primary-foreground text-[12px] font-medium rounded-lg border border-border cursor-pointer transition-colors duration-150"
          >
            <span>Public Wizard</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* 2-Column Workspace */}
      <div className="flex flex-col lg:flex-row min-h-[calc(100vh-65px)] lg:h-[calc(100vh-65px)] lg:overflow-hidden">
        {/* Left Navigation Sidebar */}
        <aside className="w-full lg:w-64 xl:w-72 bg-card border-r border-border shrink-0 flex flex-col justify-between text-[13px] select-none lg:overflow-y-auto lg:h-full font-bar">
          <div className="p-3 space-y-5">
            {TAB_CATEGORIES.map((cat, catIdx) => (
              <div key={catIdx} className="space-y-1">
                <div className="px-2 pb-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                  {cat.title}
                </div>
                <div className="space-y-0.5">
                  {cat.tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isTabActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => navigateToScreen(tab.id)}
                        className={`w-full text-left px-3 py-2 text-[13px] font-medium flex items-center justify-between cursor-pointer transition-colors duration-150 rounded-lg border ${
                          isTabActive
                            ? 'bg-primary/10 text-primary border-primary/20'
                            : 'border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${isTabActive ? 'text-primary' : 'text-muted-foreground'}`} />
                          <span className="truncate">{tab.label}</span>
                        </div>
                        {tab.badge && (
                          <span className={`text-[9px] uppercase font-semibold px-1.5 py-0.5 rounded-full ${isTabActive ? 'bg-muted text-white border border-border' : 'bg-muted/40 text-foreground border border-border'}`}>
                            {tab.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {/* Bottom: Active Branch */}
          <div className="p-3 border-t border-border">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground font-medium">Active Branch:</span>
              <span className="font-semibold text-foreground truncate max-w-[140px]">{selectedLocation}</span>
            </div>
          </div>
        </aside>

        {/* Right Settings Screen Canvas */}
        <main className="flex-1 min-w-0 bg-card lg:overflow-y-auto lg:h-full">
          {activeTab === 'overview' && (
            <SettingsOverviewDashboardScreen
              onNavigateScreen={navigateToScreen}
              selectedLocation={selectedLocation}
              onSelectLocation={onSelectLocation}
            />
          )}
          {activeTab === 'business-profile' && (
            <BusinessProfileScreen
              onNavigateScreen={navigateToScreen}
              selectedLocation={selectedLocation}
              onSelectLocation={onSelectLocation}
              systemSettings={systemSettings}
              saveSettingsToDb={saveSettingsToDb}
            />
          )}
          {(activeTab === 'org-multiloc' || activeTab === 'organization') && (
            <OrgMultiLocationScreen
              onNavigateScreen={navigateToScreen}
              selectedLocation={selectedLocation}
              onSelectLocation={onSelectLocation}
            />
          )}
          {activeTab === 'org-social' && (
            <OrgSocialDirectoriesScreen
              onNavigateScreen={navigateToScreen}
              selectedLocation={selectedLocation}
              onSelectLocation={onSelectLocation}
              systemSettings={systemSettings}
              saveSettingsToDb={saveSettingsToDb}
            />
          )}
          {activeTab === 'org-brand' && (
            <OrgBrandIdentityScreen
              onNavigateScreen={navigateToScreen}
              selectedLocation={selectedLocation}
              onSelectLocation={onSelectLocation}
              systemSettings={systemSettings}
              saveSettingsToDb={saveSettingsToDb}
            />
          )}
          {(activeTab === 'users-staff' || activeTab === 'users') && (
            <UsersStaffRolesScreen
              onNavigateScreen={navigateToScreen}
              selectedLocation={selectedLocation}
              onSelectLocation={onSelectLocation}
            />
          )}
          {(activeTab === 'booking-ops' || activeTab === 'booking') && (
            <BookingOperationsRulesScreen
              onNavigateScreen={navigateToScreen}
              selectedLocation={selectedLocation}
              onSelectLocation={onSelectLocation}
              systemSettings={systemSettings}
              saveSettingsToDb={saveSettingsToDb}
            />
          )}
          {activeTab === 'booking-rules' && (
            <BookingRulesPoliciesScreen
              onNavigateScreen={navigateToScreen}
              selectedLocation={selectedLocation}
              onSelectLocation={onSelectLocation}
              systemSettings={systemSettings}
              saveSettingsToDb={saveSettingsToDb}
            />
          )}
          {(activeTab === 'services-pricing' || activeTab === 'services') && (
            <ServicesPricingMatrixScreen
              onNavigateScreen={navigateToScreen}
              selectedLocation={selectedLocation}
              onSelectLocation={onSelectLocation}
              systemSettings={systemSettings}
              saveSettingsToDb={saveSettingsToDb}
            />
          )}
          {activeTab === 'services-catalog' && (
            <ServicesAddonCatalogScreen
              onNavigateScreen={navigateToScreen}
              selectedLocation={selectedLocation}
              onSelectLocation={onSelectLocation}
              systemSettings={systemSettings}
              saveSettingsToDb={saveSettingsToDb}
            />
          )}
          {activeTab === 'promos' && <PromoBuilderScreen />}
          {/* Coupons & Deals — the SAME promotions manager as
              /admin/promotions (second door, same store): commerce
              promotions + coupons, not the booking-promo system above. */}
          {activeTab === 'coupons' && <PromotionsPage />}
          {(activeTab === 'revenue-stripe' || activeTab === 'payments') && (
            <StripeIntegrationScreen
              onNavigateScreen={navigateToScreen}
              selectedLocation={selectedLocation}
              onSelectLocation={onSelectLocation}
              systemSettings={systemSettings}
              saveSettingsToDb={saveSettingsToDb}
            />
          )}
          {(activeTab === 'cms-wizard' || activeTab === 'website') && (
            <CmsBookingWizardScreen
              onNavigateScreen={navigateToScreen}
              selectedLocation={selectedLocation}
              onSelectLocation={onSelectLocation}
              systemSettings={systemSettings}
              saveSettingsToDb={saveSettingsToDb}
            />
          )}
          {(activeTab === 'customer-portal' || activeTab === 'portal') && (
            <CustomerPortalScreen
              onNavigateScreen={navigateToScreen}
              selectedLocation={selectedLocation}
              onSelectLocation={onSelectLocation}
              systemSettings={systemSettings}
              saveSettingsToDb={saveSettingsToDb}
            />
          )}
          {activeTab === 'legal-waivers' && (
            <LegalWaiversScreen
              onNavigateScreen={navigateToScreen}
              selectedLocation={selectedLocation}
              onSelectLocation={onSelectLocation}
              systemSettings={systemSettings}
              saveSettingsToDb={saveSettingsToDb}
            />
          )}
          {(activeTab === 'email-templates' || activeTab === 'communications') && (
            <EmailTemplatesScreen
              onNavigateScreen={navigateToScreen}
              selectedLocation={selectedLocation}
              onSelectLocation={onSelectLocation}
            />
          )}
          {activeTab === 'security-posture' && (
            <SecurityPostureScreen
              onNavigateScreen={navigateToScreen}
              selectedLocation={selectedLocation}
              onSelectLocation={onSelectLocation}
              systemSettings={systemSettings}
              saveSettingsToDb={saveSettingsToDb}
            />
          )}
          {(activeTab === 'system-telemetry' || activeTab === 'system' || activeTab === 'health') && (
            <SystemHealthTelemetryScreen
              onNavigateScreen={navigateToScreen}
              selectedLocation={selectedLocation}
              onSelectLocation={onSelectLocation}
              systemSettings={systemSettings}
              saveSettingsToDb={saveSettingsToDb}
            />
          )}
          {activeTab === 'analytics-reporting' && (
            <AnalyticsReportingScreen
              onNavigateScreen={navigateToScreen}
              selectedLocation={selectedLocation}
              onSelectLocation={onSelectLocation}
              systemSettings={systemSettings}
              saveSettingsToDb={saveSettingsToDb}
            />
          )}
        </main>
      </div>
    </div>
  );
};
