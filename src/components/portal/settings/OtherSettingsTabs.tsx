'use client';

import React, { useState } from 'react';
import { Tag, UserCheck, MessageSquare, Package, BarChart3, Sliders, CheckCircle2, Download, Mail, ShieldCheck, Key, Database, Clock, PawPrint, ArrowRight } from 'lucide-react';
import { DawgNavSection } from '@/lib/types';

interface TabProps {
  onNavigateSection?: (section: DawgNavSection) => void;
}

// 1. Services & Pricing Settings
export const ServicesPricingTab: React.FC<TabProps> = ({ onNavigateSection }) => {
  const [weekendSurcharge, setWeekendSurcharge] = useState('10.00');
  const [mattingFee, setMattingFee] = useState('25.00');
  const [specialHandlingFee, setSpecialHandlingFee] = useState('15.00');
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-5 text-[13px]">
      <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-semibold text-warning uppercase tracking-wider mb-1">
            <Tag className="w-4 h-4" />
            <span>Pricing Rules &amp; Add-ons</span>
          </div>
          <h2 className="text-xl font-semibold text-foreground">Services &amp; Pricing Policies</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Configure global grooming add-on surcharges, weekend rush multipliers, and gift card redemption.
          </p>
        </div>

        <button
          onClick={() => {
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
          }}
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl cursor-pointer"
        >
          Save Pricing Rules
        </button>
      </div>

      {saved && (
        <div className="p-3 bg-success/10 border border-success/20 text-success text-[13px] font-medium rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-success" />
          <span>Pricing rules updated successfully!</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs space-y-3">
          <h3 className="font-semibold text-foreground text-sm">Weekend Surcharge</h3>
          <p className="text-muted-foreground text-[11px]">Applied to Saturday and Sunday appointments</p>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-muted-foreground">$</span>
            <input
              type="number"
              value={weekendSurcharge}
              onChange={(e) => setWeekendSurcharge(e.target.value)}
              className="w-full px-3 py-1.5 border border-border rounded-lg"
            />
          </div>
        </div>

        <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs space-y-3">
          <h3 className="font-semibold text-foreground text-sm">Severe Matting Fee</h3>
          <p className="text-muted-foreground text-[11px]">Base price for deep de-matting &amp; coat conditioning</p>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-muted-foreground">$</span>
            <input
              type="number"
              value={mattingFee}
              onChange={(e) => setMattingFee(e.target.value)}
              className="w-full px-3 py-1.5 border border-border rounded-lg"
            />
          </div>
        </div>

        <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs space-y-3">
          <h3 className="font-semibold text-foreground text-sm">Special Handling / Senior Pet</h3>
          <p className="text-muted-foreground text-[11px]">Extra time allowance for elderly or reactive dogs</p>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-muted-foreground">$</span>
            <input
              type="number"
              value={specialHandlingFee}
              onChange={(e) => setSpecialHandlingFee(e.target.value)}
              className="w-full px-3 py-1.5 border border-border rounded-lg"
            />
          </div>
        </div>
      </div>

      <div className="p-4 bg-primary/5 border border-primary/20 rounded-2xl flex items-center justify-between">
        <div>
          <p className="font-semibold text-primary">Manage Full Service &amp; Grooming Package Catalog</p>
          <p className="text-primary text-[11px]">Add haircuts, bath packages, pricing tiers by weight, and duration.</p>
        </div>
        <button
          onClick={() => onNavigateSection && onNavigateSection('services')}
          className="px-3.5 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold flex items-center gap-1 cursor-pointer"
        >
          <span>Open Services Catalog</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

// 2. Customer Portal Settings
export const CustomerPortalTab: React.FC = () => {
  const [allowReschedule, setAllowReschedule] = useState(true);
  const [requireVaccines, setRequireVaccines] = useState(true);
  const [showLoyalty, setShowLoyalty] = useState(true);
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-5 text-[13px]">
      <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-semibold text-primary uppercase tracking-wider mb-1">
            <UserCheck className="w-4 h-4" />
            <span>Customer Portal Experience</span>
          </div>
          <h2 className="text-xl font-semibold text-foreground">Customer Portal Configuration</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Configure client login capabilities, document uploads, and self-service appointment changes.
          </p>
        </div>

        <button
          onClick={() => {
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
          }}
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl cursor-pointer"
        >
          Save Portal Settings
        </button>
      </div>

      {saved && (
        <div className="p-3 bg-success/10 border border-success/20 text-success text-[13px] font-medium rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-success" />
          <span>Customer portal rules updated!</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs space-y-3 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-foreground text-sm">Self-Service Rescheduling</h3>
            <p className="text-muted-foreground text-[11px] mt-1">Allow customers to modify scheduled times up to 24h before.</p>
          </div>
          <input
            type="checkbox"
            checked={allowReschedule}
            onChange={(e) => setAllowReschedule(e.target.checked)}
            className="h-4 w-4 rounded text-primary"
          />
        </div>

        <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs space-y-3 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-foreground text-sm">Mandatory Vaccine Proof</h3>
            <p className="text-muted-foreground text-[11px] mt-1">Block booking if Rabies or DHPP certificate is expired or missing.</p>
          </div>
          <input
            type="checkbox"
            checked={requireVaccines}
            onChange={(e) => setRequireVaccines(e.target.checked)}
            className="h-4 w-4 rounded text-primary"
          />
        </div>

        <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs space-y-3 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-foreground text-sm">Loyalty Points Balance Display</h3>
            <p className="text-muted-foreground text-[11px] mt-1">Show earned VIP reward points and perks in customer header.</p>
          </div>
          <input
            type="checkbox"
            checked={showLoyalty}
            onChange={(e) => setShowLoyalty(e.target.checked)}
            className="h-4 w-4 rounded text-primary"
          />
        </div>
      </div>
    </div>
  );
};

// 3. Communications Settings
export const CommunicationsTab: React.FC = () => {
  const [sms48h, setSms48h] = useState(true);
  const [smsPickup, setSmsPickup] = useState(true);
  const [reviewRequest, setReviewRequest] = useState(true);
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-5 text-[13px]">
      <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-semibold text-destructive uppercase tracking-wider mb-1">
            <MessageSquare className="w-4 h-4" />
            <span>Automated Notifications</span>
          </div>
          <h2 className="text-xl font-semibold text-foreground">Communications &amp; Messaging</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Configure automated SMS and email reminders, ready for pickup alerts, and Google review requests.
          </p>
        </div>

        <button
          onClick={() => {
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
          }}
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl cursor-pointer"
        >
          Save Messaging Rules
        </button>
      </div>

      {saved && (
        <div className="p-3 bg-success/10 border border-success/20 text-success text-[13px] font-medium rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-success" />
          <span>Automated messaging automations saved!</span>
        </div>
      )}

      <div className="space-y-3">
        <label className="flex items-center justify-between p-4 rounded-xl bg-card border border-border shadow-2xs cursor-pointer">
          <div>
            <p className="font-semibold text-foreground">48-Hour Appointment Reminder (SMS + Email)</p>
            <p className="text-muted-foreground text-[11px]">Sends client a confirmation request with option to reply &apos;C&apos; to confirm.</p>
          </div>
          <input
            type="checkbox"
            checked={sms48h}
            onChange={(e) => setSms48h(e.target.checked)}
            className="h-4 w-4 rounded text-primary"
          />
        </label>

        <label className="flex items-center justify-between p-4 rounded-xl bg-card border border-border shadow-2xs cursor-pointer">
          <div>
            <p className="font-semibold text-foreground">Dog Ready for Pickup SMS Notification</p>
            <p className="text-muted-foreground text-[11px]">Instant text alert dispatched to owner the moment groom is marked Complete.</p>
          </div>
          <input
            type="checkbox"
            checked={smsPickup}
            onChange={(e) => setSmsPickup(e.target.checked)}
            className="h-4 w-4 rounded text-primary"
          />
        </label>

        <label className="flex items-center justify-between p-4 rounded-xl bg-card border border-border shadow-2xs cursor-pointer">
          <div>
            <p className="font-semibold text-foreground">Automated Google Review Request (24h After Groom)</p>
            <p className="text-muted-foreground text-[11px]">Invites happy clients to leave a 5-star review on Google Maps.</p>
          </div>
          <input
            type="checkbox"
            checked={reviewRequest}
            onChange={(e) => setReviewRequest(e.target.checked)}
            className="h-4 w-4 rounded text-primary"
          />
        </label>
      </div>
    </div>
  );
};

// 4. Inventory Settings
export const InventoryTab: React.FC<TabProps> = ({ onNavigateSection }) => {
  return (
    <div className="space-y-5 text-[13px]">
      <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-semibold text-warning uppercase tracking-wider mb-1">
            <Package className="w-4 h-4" />
            <span>Retail &amp; Supplies Management</span>
          </div>
          <h2 className="text-xl font-semibold text-foreground">Inventory &amp; Supplies Settings</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Configure stock reorder thresholds, vendor accounts, and retail checkout rules.
          </p>
        </div>

        <button
          onClick={() => onNavigateSection && onNavigateSection('inventory')}
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
        >
          <span>Open Full Products &amp; Inventory</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs space-y-4">
        <h3 className="font-semibold text-foreground text-sm">Low Stock Alert Thresholds</h3>
        <p className="text-muted-foreground text-[11px]">Automatically trigger alerts on the dashboard when product bottles drop below minimum quantity.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-foreground font-semibold mb-1">Backroom Shampoos &amp; Sprays Threshold</label>
            <input type="number" defaultValue="5" className="w-full px-3 py-2 border border-border rounded-xl bg-muted/40" />
          </div>
          <div>
            <label className="block text-foreground font-semibold mb-1">Retail Shelf Products Threshold</label>
            <input type="number" defaultValue="3" className="w-full px-3 py-2 border border-border rounded-xl bg-muted/40" />
          </div>
        </div>
      </div>
    </div>
  );
};

// 5. Reports Settings
export const ReportsTab: React.FC<TabProps> = ({ onNavigateSection }) => {
  return (
    <div className="space-y-5 text-[13px]">
      <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-semibold text-primary uppercase tracking-wider mb-1">
            <BarChart3 className="w-4 h-4" />
            <span>Business Intelligence &amp; Exports</span>
          </div>
          <h2 className="text-xl font-semibold text-foreground">Reports &amp; Financial Analytics</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Export accounting spreadsheets, staff commission summaries, and customer retention metrics.
          </p>
        </div>

        <button
          onClick={() => onNavigateSection && onNavigateSection('reports')}
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
        >
          <span>Open Reports Dashboard</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs space-y-3">
          <h3 className="font-semibold text-foreground text-sm">Daily Revenue Summary</h3>
          <p className="text-muted-foreground text-[11px]">End of day breakdown of all card, cash, tips, and tax receipts.</p>
          <button
            onClick={() => alert('Exporting Daily Revenue CSV...')}
            className="w-full py-2 bg-muted/40 hover:bg-muted/40 border border-border rounded-xl font-semibold text-primary flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>

        <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs space-y-3">
          <h3 className="font-semibold text-foreground text-sm">Groomer Commission Report</h3>
          <p className="text-muted-foreground text-[11px]">Bi-weekly payout ledger with tip distribution for staff payroll.</p>
          <button
            onClick={() => alert('Exporting Payroll Report...')}
            className="w-full py-2 bg-muted/40 hover:bg-muted/40 border border-border rounded-xl font-semibold text-primary flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Payroll</span>
          </button>
        </div>

        <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs space-y-3">
          <h3 className="font-semibold text-foreground text-sm">Full Client Database</h3>
          <p className="text-muted-foreground text-[11px]">Complete backup of pet demographics, contact information, and spending history.</p>
          <button
            onClick={() => alert('Exporting Customers Database...')}
            className="w-full py-2 bg-muted/40 hover:bg-muted/40 border border-border rounded-xl font-semibold text-primary flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Clients</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// 6. System Settings
export const SystemTab: React.FC = () => {
  return (
    <div className="space-y-5 text-[13px] text-foreground">
      <div className="bg-card p-5 border border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold uppercase text-foreground">System Preferences &amp; Audit Logs</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            System audit trails, API integrations, and system preferences.
          </p>
        </div>

        <button
          onClick={() => alert('Database snapshot exported!')}
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[13px] uppercase tracking-wider border border-border cursor-pointer"
        >
          <span>Export System Backup</span>
        </button>
      </div>

      <div className="bg-card p-5 border border-border space-y-4">
        <h3 className="font-semibold text-foreground text-sm uppercase">System Audit Log Trail</h3>
        <p className="text-muted-foreground text-[11px]">Immutable record of high-privilege administrator actions.</p>

        <div className="divide-y divide-border border border-border overflow-hidden">
          {[
            { actor: 'Admin User', action: 'Updated Holiday Blackout Hours', time: '10 mins ago', ip: '192.168.1.45' },
            { actor: 'Sarah Mitchell', action: 'Modified Groomer Commission for Westside Spa', time: '1 hour ago', ip: '192.168.1.12' },
            { actor: 'Marcus Vance', action: 'Invited Jordan Hayes to Admin Users', time: 'Yesterday at 5:20 PM', ip: '192.168.1.88' },
            { actor: 'Admin User', action: 'Executed Stripe Terminal Payout Reconciliation', time: '2 days ago', ip: '192.168.1.45' },
          ].map((log, idx) => (
            <div key={idx} className="p-3 flex items-center justify-between text-[13px] hover:bg-accent/50">
              <div>
                <span className="font-semibold text-foreground uppercase">{log.actor}</span> · <span className="text-foreground">{log.action}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] tabular-nums text-muted-foreground">
                <span>{log.ip}</span>
                <span>{log.time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
