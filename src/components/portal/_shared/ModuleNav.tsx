'use client';

import {
  LayoutGrid, Users, Calendar, FileText, CalendarRange,
  Tag, CalendarClock, Receipt, FileSearch, Package, Truck,
  ArrowDownLeft, Inbox, BookOpen, CreditCard, Repeat, Coins, RotateCcw,
  Gift, Scale, BarChart3, Terminal, LineChart,
  Tags, Filter, Boxes, Percent, Award, Send, Layers,
  Store, LayoutList, FileCheck, DollarSign, ShieldCheck, Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DawgNavSection } from '@/lib/types';

const moduleGroups: Record<string, { id: DawgNavSection; label: string; icon: React.ElementType }[]> = {
  CRM: [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'appointments', label: 'Appointments', icon: Calendar },
    { id: 'grooming-records', label: 'Grooming', icon: FileText },
    { id: 'calendar', label: 'Calendar', icon: CalendarRange },
    { id: 'services', label: 'Services', icon: Tag },
    { id: 'staff', label: 'Staff', icon: Users },
    { id: 'schedule', label: 'Schedule', icon: CalendarClock },
  ],
  ORDERS: [
    { id: 'orders', label: 'Orders', icon: Receipt },
    { id: 'order-details', label: 'Details', icon: FileSearch },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'categories', label: 'Categories', icon: Tags },
    { id: 'catalog', label: 'Catalog', icon: Layers },
    { id: 'brands', label: 'Brands', icon: Award },
    { id: 'filters', label: 'Filters', icon: Filter },
    { id: 'inventory', label: 'Products & Inv', icon: Boxes },
    { id: 'shipping', label: 'Shipping', icon: Truck },
    { id: 'returns', label: 'Returns', icon: ArrowDownLeft },
    { id: 'purchase-orders', label: 'POs', icon: Inbox },
    { id: 'supplier-orders', label: 'Supplier Orders', icon: Send },
    { id: 'promotions', label: 'Promotions', icon: Percent },
    { id: 'newsletter', label: 'Newsletter', icon: Mail },
  ],
  ACCOUNTING: [
    { id: 'books', label: 'Books', icon: BookOpen },
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'deposits', label: 'Deposits', icon: Coins },
    { id: 'refunds', label: 'Refunds', icon: RotateCcw },
    { id: 'gift-cards', label: 'Gift Cards', icon: Gift },
    { id: 'payroll', label: 'Payroll', icon: Users },
    { id: 'taxes', label: 'Taxes', icon: Scale },
    { id: 'analytics', label: 'Analytics', icon: LineChart },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'stripe-connections', label: 'Stripe', icon: Terminal },
  ],
  MARKETPLACE: [
    { id: 'sellers', label: 'Sellers', icon: Store },
    { id: 'listings', label: 'Listings', icon: LayoutList },
    { id: 'catalog-review', label: 'Catalog Review', icon: FileCheck },
    { id: 'brand-registry', label: 'Brand Registry', icon: Tag },
    { id: 'fees', label: 'Fees', icon: DollarSign },
    { id: 'trust-safety', label: 'Trust & Safety', icon: ShieldCheck },
  ],
  POS: [
    { id: 'pos', label: 'Register', icon: CreditCard },
    { id: 'subscriptions', label: 'Subs', icon: Repeat },
  ],
};

export function ModuleNav({
  activeSection,
  onNavigate,
  /** Section ids the current user may see (from portal_module_permissions).
   *  null/undefined = fail open, everything renders. The admin layout
   *  computes this via allowedSectionIds(). */
  allowedSections,
}: {
  activeSection: DawgNavSection;
  onNavigate: (section: DawgNavSection) => void;
  allowedSections?: string[] | null;
}) {
  const activeModule = Object.entries(moduleGroups).find(([, items]) =>
    items.some((item) => item.id === activeSection)
  );
  if (!activeModule) return null;
  const items = allowedSections
    ? activeModule[1].filter((item) => allowedSections.includes(item.id))
    : activeModule[1];
  // A group with nothing allowed hides entirely — no dead nav row.
  if (items.length === 0) return null;

  return (
    <nav className="flex items-center gap-1 px-4 py-1.5 border-b border-border bg-card overflow-x-auto custom-scrollbar">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeSection === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            title={item.label}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-2.5 h-7 text-[12px] font-medium transition-colors cursor-pointer whitespace-nowrap',
              isActive
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="size-3.5 shrink-0" />
            <span className="hidden sm:inline">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
