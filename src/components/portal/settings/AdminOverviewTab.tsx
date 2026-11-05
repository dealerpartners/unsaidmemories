'use client';

import React from 'react';
import { Building2, Users, Calendar, Tag, CreditCard, Globe, UserCheck, MessageSquare, Package, BarChart3, Sliders, PawPrint, Link as LinkIcon, ArrowRight, CheckCircle2, ExternalLink, MapPin, Phone, Mail, Store, GraduationCap } from 'lucide-react';
import { DawgNavSection } from '@/lib/types';

interface AdminOverviewTabProps {
  onSelectTab: (tabId: string) => void;
  onNavigateSection?: (section: DawgNavSection) => void;
  onOpenQuickAction?: (action: 'appointment' | 'customer' | 'pet' | 'payment' | 'invoice') => void;
}

export const AdminOverviewTab: React.FC<AdminOverviewTabProps> = ({
  onSelectTab,
  onNavigateSection,
  onOpenQuickAction,
}) => {
  return (
    <div className="space-y-6">
      {/* 1. Top Section: Business Overview Card & System Status Card */}
      <section aria-label="Business Overview and System Status" className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Business Overview Card */}
        <div className="lg:col-span-8 bg-card border border-border p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
              <h3 className="text-[13px] tabular-nums font-semibold uppercase tracking-wider text-foreground">Business Overview</h3>
              <button
                onClick={() => onSelectTab('organization')}
                className="text-[13px] font-semibold uppercase tracking-wider text-foreground hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Edit Profile</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-5 items-start">
              {/* Storefront / Location Thumbnail */}
              <div className="w-full sm:w-44 h-32 overflow-hidden shrink-0 border border-border relative bg-muted/40">
                <img
                  alt="Storefront - UnSaid Memories"
                  className="w-full h-full object-cover object-center grayscale contrast-125"
                  src="https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?auto=format&fit=crop&w=400&q=80"
                />
                <span className="absolute bottom-2 left-2 text-[10px] tabular-nums font-semibold uppercase text-white bg-black px-2 py-0.5 border border-white">
                  Main Salon
                </span>
              </div>

              {/* Business Details & Contact */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-base font-semibold uppercase tracking-tight text-foreground">UnSaid Memories</h4>
                  <span className="inline-flex items-center px-2 py-0.5 text-[10px] tabular-nums font-semibold uppercase bg-muted/40 text-foreground border border-border">
                    Active
                  </span>
                </div>
                <p className="text-[13px] text-muted-foreground mt-0.5 font-medium">Luxury pet grooming with love and precision care.</p>

                <div className="mt-3 space-y-1.5 tabular-nums text-[13px]">
                  <div className="flex items-center gap-2 text-foreground">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                    <span>(901) 722-1114</span>
                  </div>
                  <div className="flex items-center gap-2 text-foreground">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                    <span>info@unsaidmemories.com</span>
                  </div>
                  <div className="flex items-center gap-2 text-foreground">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                    <span>699 Waring Rd, Memphis, TN</span>
                  </div>
                  <div className="flex items-center gap-2 text-foreground">
                    <Globe className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                    <a
                      className="text-foreground font-semibold hover:underline"
                      href="https://www.allaboutthedawg.com"
                      target="_blank"
                      rel="noreferrer"
                    >
                      www.allaboutthedawg.com
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* KPI Metrics Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-border">
            <div>
              <span className="text-[10px] tabular-nums font-semibold uppercase tracking-wider text-muted-foreground">Today&apos;s Appointments</span>
              <p className="text-xl font-semibold text-foreground mt-0.5">12</p>
              <button
                onClick={() => onNavigateSection && onNavigateSection('appointments')}
                className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-foreground hover:underline mt-1 cursor-pointer"
              >
                <span>Calendar</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
            <div>
              <span className="text-[10px] tabular-nums font-semibold uppercase tracking-wider text-muted-foreground">Today&apos;s Revenue</span>
              <p className="text-xl font-semibold text-foreground mt-0.5">$2,450.00</p>
              <button
                onClick={() => onNavigateSection && onNavigateSection('reports')}
                className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-foreground hover:underline mt-1 cursor-pointer"
              >
                <span>Reports</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
            <div>
              <span className="text-[10px] tabular-nums font-semibold uppercase tracking-wider text-muted-foreground">New Customers (30d)</span>
              <p className="text-xl font-semibold text-foreground mt-0.5">24</p>
              <button
                onClick={() => onNavigateSection && onNavigateSection('customers')}
                className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-foreground hover:underline mt-1 cursor-pointer"
              >
                <span>Customers</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
            <div>
              <span className="text-[10px] tabular-nums font-semibold uppercase tracking-wider text-muted-foreground">Outstanding Balance</span>
              <p className="text-xl font-semibold text-foreground mt-0.5">$1,245.50</p>
              <button
                onClick={() => onNavigateSection && onNavigateSection('invoices')}
                className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-foreground hover:underline mt-1 cursor-pointer"
              >
                <span>Invoices</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>
        </div>

        {/* System Status Card */}
        <div className="lg:col-span-4 bg-card border border-border p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
              <h3 className="text-[13px] tabular-nums font-semibold uppercase tracking-wider text-foreground">System Status</h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] tabular-nums font-semibold uppercase bg-muted/40 text-foreground border border-border">
                <span className="w-1.5 h-1.5 bg-black" />
                Operational
              </span>
            </div>

            <div className="space-y-3 tabular-nums text-[13px]">
              {/* Status Item: Website */}
              <div className="flex items-center justify-between py-1 border-b border-border">
                <div className="flex items-center gap-2 text-foreground">
                  <Globe className="w-4 h-4 text-muted-foreground/70" />
                  <span>Website</span>
                </div>
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> LIVE
                </span>
              </div>
              {/* Status Item: Customer Portal */}
              <div className="flex items-center justify-between py-1 border-b border-border">
                <div className="flex items-center gap-2 text-foreground">
                  <UserCheck className="w-4 h-4 text-muted-foreground/70" />
                  <span>Customer Portal</span>
                </div>
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> ACTIVE
                </span>
              </div>
              {/* Status Item: Stripe */}
              <div className="flex items-center justify-between py-1 border-b border-border">
                <div className="flex items-center gap-2 text-foreground">
                  <CreditCard className="w-4 h-4 text-muted-foreground/70" />
                  <span>Stripe Terminal</span>
                </div>
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> READY
                </span>
              </div>
              {/* Status Item: Email Service */}
              <div className="flex items-center justify-between py-1 border-b border-border">
                <div className="flex items-center gap-2 text-foreground">
                  <Mail className="w-4 h-4 text-muted-foreground/70" />
                  <span>Email (Postmark)</span>
                </div>
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> READY
                </span>
              </div>
              {/* Status Item: SMS Service */}
              <div className="flex items-center justify-between py-1 border-b border-border">
                <div className="flex items-center gap-2 text-foreground">
                  <MessageSquare className="w-4 h-4 text-muted-foreground/70" />
                  <span>SMS (Twilio)</span>
                </div>
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> READY
                </span>
              </div>
              {/* Status Item: Backups */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2 text-foreground">
                  <Sliders className="w-4 h-4 text-muted-foreground/70" />
                  <span>PostgreSQL Backups</span>
                </div>
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> SYNCED
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-border">
            <button
              onClick={() => onSelectTab('system')}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-foreground hover:underline cursor-pointer"
            >
              <span>View System Health</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </section>

      {/* 2. Management Modules Grid */}
      <section aria-label="Management Modules" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Module 1: Organization */}
        <div className="bg-card border border-border p-4 shadow-2xs flex flex-col justify-between hover:border-border transition-all group">
          <div>
            <div className="w-8 h-8 bg-muted/40 text-foreground border border-border flex items-center justify-center mb-3">
              <Building2 className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-semibold uppercase tracking-tight text-foreground group-hover:underline">Organization</h4>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              Manage business profile, locations, hours, holidays, and brand settings.
            </p>
            <ul className="mt-4 space-y-1 text-[13px] text-foreground">
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('organization')}>• Business Profile</li>
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('organization')}>• Locations (3 Active)</li>
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('organization')}>• Brand &amp; Identity</li>
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('organization')}>• Opening Hours</li>
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('organization')}>• Holiday Hours</li>
            </ul>
          </div>
          <div className="mt-5 pt-3 border-t border-border">
            <button
              onClick={() => onSelectTab('organization')}
              className="inline-flex items-center gap-1 text-[13px] font-semibold uppercase tracking-wider text-foreground hover:underline cursor-pointer"
            >
              <span>Configure</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        {/* Module 2: Users & Access */}
        <div className="bg-card border border-border p-4 shadow-2xs flex flex-col justify-between hover:border-border transition-all group">
          <div>
            <div className="w-8 h-8 bg-muted/40 text-foreground border border-border flex items-center justify-center mb-3">
              <Users className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-semibold uppercase tracking-tight text-foreground group-hover:underline">Users &amp; Access</h4>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              Manage staff, roles, permissions, and customer portal access.
            </p>
            <ul className="mt-4 space-y-1 text-[13px] text-foreground">
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('users')}>• Admin Users</li>
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('users')}>• Staff Members</li>
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('users')}>• Roles &amp; Permissions</li>
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('users')}>• Customer Portal Users</li>
            </ul>
          </div>
          <div className="mt-5 pt-3 border-t border-border">
            <button
              onClick={() => onSelectTab('users')}
              className="inline-flex items-center gap-1 text-[13px] font-semibold uppercase tracking-wider text-foreground hover:underline cursor-pointer"
            >
              <span>Manage Users</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        {/* Module 3: Booking & Operations */}
        <div className="bg-card border border-border p-4 shadow-2xs flex flex-col justify-between hover:border-border transition-all group">
          <div>
            <div className="w-8 h-8 bg-muted/40 text-foreground border border-border flex items-center justify-center mb-3">
              <Calendar className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-semibold uppercase tracking-tight text-foreground group-hover:underline">Booking Rules</h4>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              Configure booking rules, deposits, cancellations, and availability.
            </p>
            <ul className="mt-4 space-y-1 text-[13px] text-foreground">
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('booking')}>• Booking Settings</li>
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('booking')}>• Deposits &amp; Holds</li>
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('booking')}>• Cancellation Rules</li>
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('booking')}>• Waitlist Engine</li>
            </ul>
          </div>
          <div className="mt-5 pt-3 border-t border-border">
            <button
              onClick={() => onSelectTab('booking')}
              className="inline-flex items-center gap-1 text-[13px] font-semibold uppercase tracking-wider text-foreground hover:underline cursor-pointer"
            >
              <span>Manage Booking</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        {/* Module 4: Services & Pricing */}
        <div className="bg-card border border-border p-4 shadow-2xs flex flex-col justify-between hover:border-border transition-all group">
          <div>
            <div className="w-8 h-8 bg-muted/40 text-foreground border border-border flex items-center justify-center mb-3">
              <Tag className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-semibold uppercase tracking-tight text-foreground group-hover:underline">Services &amp; Rates</h4>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              Manage grooming packages, add-ons, pricing surcharges, and credits.
            </p>
            <ul className="mt-4 space-y-1 text-[13px] text-foreground">
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('services')}>• Service Catalog</li>
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('services')}>• Surcharges &amp; Fees</li>
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('services')}>• Weekend Rules</li>
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('services')}>• Discounts &amp; Promos</li>
            </ul>
          </div>
          <div className="mt-5 pt-3 border-t border-border">
            <button
              onClick={() => onSelectTab('services')}
              className="inline-flex items-center gap-1 text-[13px] font-semibold uppercase tracking-wider text-foreground hover:underline cursor-pointer"
            >
              <span>Manage Rates</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        {/* Module 5: Payments */}
        <div className="bg-card border border-border p-4 shadow-2xs flex flex-col justify-between hover:border-border transition-all group">
          <div>
            <div className="w-8 h-8 bg-muted/40 text-foreground border border-border flex items-center justify-center mb-3">
              <CreditCard className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-semibold uppercase tracking-tight text-foreground group-hover:underline">Payments &amp; Stripe</h4>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              Configure terminals, Stripe payouts, invoices, taxes, and ledgers.
            </p>
            <ul className="mt-4 space-y-1 text-[13px] text-foreground">
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('payments')}>• Stripe Terminal</li>
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('payments')}>• Payment Methods</li>
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('payments')}>• Tax Settings</li>
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('payments')}>• Payout Schedule</li>
            </ul>
          </div>
          <div className="mt-5 pt-3 border-t border-border">
            <button
              onClick={() => onSelectTab('payments')}
              className="inline-flex items-center gap-1 text-[13px] font-semibold uppercase tracking-wider text-foreground hover:underline cursor-pointer"
            >
              <span>Manage Payments</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        {/* Module 6: LMS & Academy */}
        <div className="bg-card border border-border p-4 shadow-2xs flex flex-col justify-between hover:border-border transition-all group">
          <div>
            <div className="w-8 h-8 bg-muted/40 text-foreground border border-border flex items-center justify-center mb-3">
              <GraduationCap className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-semibold uppercase tracking-tight text-foreground group-hover:underline">LMS &amp; Academy</h4>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              Staff training, grooming certifications, CPR drills, and safety courses.
            </p>
            <ul className="mt-4 space-y-1 text-[13px] text-foreground">
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('lms')}>• Course Catalog (5 Active)</li>
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('lms')}>• Trainee Progress Tracker</li>
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('lms')}>• Safety &amp; CPR Certifications</li>
              <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('lms')}>• OSHA Compliance Audits</li>
            </ul>
          </div>
          <div className="mt-5 pt-3 border-t border-border">
            <button
              onClick={() => onSelectTab('lms')}
              className="inline-flex items-center gap-1 text-[13px] font-semibold uppercase tracking-wider text-foreground hover:underline cursor-pointer"
            >
              <span>Open Academy</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </section>

      {/* 3. Bottom Row: System, What's New, Quick Links */}
      <section aria-label="System Settings, What is New and Quick Links" className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* System Box */}
        <div className="bg-card border border-border p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="w-8 h-8 bg-primary text-primary-foreground flex items-center justify-center mb-3">
              <Sliders className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-semibold uppercase tracking-tight text-foreground">System &amp; Database</h4>
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              System preferences, integrations, audit logs, and cloud database.
            </p>
            <div className="grid grid-cols-2 gap-x-2 mt-4 text-[13px] text-foreground">
              <ul className="space-y-1">
                <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('system')}>• Audit Log</li>
                <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('system')}>• Integrations</li>
                <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('system')}>• Preferences</li>
              </ul>
              <ul className="space-y-1">
                <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('health')}>• PostgreSQL DB</li>
                <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('system')}>• API Keys</li>
                <li className="cursor-pointer hover:underline" onClick={() => onSelectTab('system')}>• Backups</li>
              </ul>
            </div>
          </div>
          <div className="mt-5 pt-3 border-t border-border">
            <button
              onClick={() => onSelectTab('system')}
              className="inline-flex items-center gap-1 text-[13px] font-semibold uppercase tracking-wider text-foreground hover:underline cursor-pointer"
            >
              <span>System Settings</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        {/* What's New Box */}
        <div className="bg-card border border-border p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-primary text-primary-foreground flex items-center justify-center">
                <PawPrint className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-semibold uppercase tracking-tight text-foreground">Release Notes</h4>
            </div>
            <div className="space-y-3 mt-4 text-[13px]">
              <div className="border-b border-border pb-2">
                <div className="flex items-center justify-between">
                  <h5 className="text-[13px] font-semibold text-foreground uppercase">Multi-Location Branching</h5>
                  <span className="text-[10px] tabular-nums font-semibold uppercase px-1 bg-muted/40 border border-border">
                    Live
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Full multi-location resource routing enabled.</p>
              </div>
              <div className="border-b border-border pb-2">
                <div className="flex items-center justify-between">
                  <h5 className="text-[13px] font-semibold text-foreground uppercase">PostgreSQL Global Search</h5>
                  <span className="text-[10px] tabular-nums font-semibold uppercase px-1 bg-muted/40 border border-border">
                    Live
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">High-speed full text multi-tenant search index.</p>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <h5 className="text-[13px] font-semibold text-foreground uppercase">WisePOS E Terminal Support</h5>
                  <span className="text-[10px] tabular-nums font-semibold uppercase px-1 bg-muted/40 border border-border">
                    Live
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Hardware pairing and in-person card payments.</p>
              </div>
            </div>
          </div>
          <div className="mt-5 pt-3 border-t border-border">
            <button
              onClick={() => onSelectTab('website')}
              className="inline-flex items-center gap-1 text-[13px] font-semibold uppercase tracking-wider text-foreground hover:underline cursor-pointer"
            >
              <span>Release Log</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        {/* Quick Links Box */}
        <div className="bg-card border border-border p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-primary text-primary-foreground flex items-center justify-center">
                <LinkIcon className="w-4 h-4" />
              </div>
              <h4 className="text-sm font-semibold uppercase tracking-tight text-foreground">Quick Links</h4>
            </div>
            <ul className="space-y-2 mt-4 text-[13px] font-semibold uppercase tracking-wider">
              <li>
                <button
                  onClick={() => onSelectTab('website')}
                  className="w-full flex items-center justify-between hover:underline group text-left cursor-pointer"
                >
                  <span>Public Website</span>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-foreground transition-colors" />
                </button>
              </li>
              <li>
                <button
                  onClick={() => onSelectTab('portal')}
                  className="w-full flex items-center justify-between hover:underline group text-left cursor-pointer"
                >
                  <span>Customer Portal</span>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-foreground transition-colors" />
                </button>
              </li>
              <li>
                <button
                  onClick={() => onSelectTab('payments')}
                  className="w-full flex items-center justify-between hover:underline group text-left cursor-pointer"
                >
                  <span>Stripe Terminals</span>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-foreground transition-colors" />
                </button>
              </li>
              <li>
                <button
                  onClick={() => onSelectTab('health')}
                  className="w-full flex items-center justify-between hover:underline group text-left cursor-pointer"
                >
                  <span>Database &amp; Supabase</span>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/70 group-hover:text-foreground transition-colors" />
                </button>
              </li>
            </ul>
          </div>
          <div className="mt-5 pt-3 border-t border-border">
            <button
              onClick={() => onSelectTab('system')}
              className="inline-flex items-center gap-1 text-[13px] font-semibold uppercase tracking-wider text-foreground hover:underline cursor-pointer"
            >
              <span>Help &amp; Docs</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
