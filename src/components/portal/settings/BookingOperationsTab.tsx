'use client';

import React, { useState } from 'react';
import { Calendar, Clock, AlertTriangle, ShieldCheck, CheckCircle2, UserCheck, PawPrint } from 'lucide-react';

export const BookingOperationsTab: React.FC = () => {
  const [allowOnlineBooking, setAllowOnlineBooking] = useState(true);
  const [depositRequired, setDepositRequired] = useState(true);
  const [depositAmount, setDepositAmount] = useState('25.00');
  const [cancelWindowHours, setCancelWindowHours] = useState('24');
  const [noShowFee, setNoShowFee] = useState('50.00');
  const [bufferTime, setBufferTime] = useState('15');
  const [leadTimeHours, setLeadTimeHours] = useState('4');
  const [maxAdvanceDays, setMaxAdvanceDays] = useState('60');
  const [autoWaitlist, setAutoWaitlist] = useState(true);
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 text-[13px]">
      <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[13px] font-semibold text-primary uppercase tracking-wider mb-1">
            <Calendar className="w-4 h-4" />
            <span>Salon Operations Control</span>
          </div>
          <h2 className="text-xl font-semibold text-foreground">Booking &amp; Operations Rules</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Configure client online scheduling parameters, booking deposits, cancellation penalties, and waitlist automation.
          </p>
        </div>

        <button
          type="submit"
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-white text-[13px] font-semibold rounded-xl flex items-center gap-2 shadow-xs transition-colors cursor-pointer self-start md:self-auto"
        >
          <span>Save Booking Rules</span>
        </button>
      </div>

      {saved && (
        <div className="p-3 bg-success/10 border border-success/20 text-success text-[13px] font-medium rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-success" />
          <span>Booking &amp; operations policies updated!</span>
        </div>
      )}

      {/* Grid of Rule Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Card 1: Online Scheduling */}
        <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <h3 className="font-semibold text-foreground text-sm">Online Self-Booking</h3>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={allowOnlineBooking}
                onChange={(e) => setAllowOnlineBooking(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
            </label>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-foreground font-semibold mb-1">Minimum Lead Time Notice</label>
              <select
                value={leadTimeHours}
                onChange={(e) => setLeadTimeHours(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-xl bg-muted/40 focus:bg-card"
              >
                <option value="2">2 Hours in Advance</option>
                <option value="4">4 Hours in Advance (Standard)</option>
                <option value="12">12 Hours in Advance</option>
                <option value="24">24 Hours in Advance</option>
              </select>
            </div>

            <div>
              <label className="block text-foreground font-semibold mb-1">Max Booking Future Horizon</label>
              <select
                value={maxAdvanceDays}
                onChange={(e) => setMaxAdvanceDays(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-xl bg-muted/40 focus:bg-card"
              >
                <option value="30">30 Days Out</option>
                <option value="60">60 Days Out (Standard)</option>
                <option value="90">90 Days Out</option>
                <option value="180">6 Months Out</option>
              </select>
            </div>

            <div>
              <label className="block text-foreground font-semibold mb-1">Grooming Station Turnaround Buffer</label>
              <select
                value={bufferTime}
                onChange={(e) => setBufferTime(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-xl bg-muted/40 focus:bg-card"
              >
                <option value="0">0 Minutes (Back-to-Back)</option>
                <option value="15">15 Minutes (Sanitization &amp; Rest)</option>
                <option value="30">30 Minutes (Deep Clean)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Card 2: Deposits & Cancellations */}
        <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <h3 className="font-semibold text-foreground text-sm">Deposits &amp; Cancellation Fee</h3>
            <span className="text-[10px] font-semibold text-primary bg-primary/5 px-2 py-0.5 rounded-full">
              Stripe Enforced
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border">
              <div>
                <p className="font-semibold text-foreground">Require Upfront Deposit</p>
                <p className="text-muted-foreground text-[11px]">Deducted from the final grooming checkout total</p>
              </div>
              <input
                type="checkbox"
                checked={depositRequired}
                onChange={(e) => setDepositRequired(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary"
              />
            </div>

            {depositRequired && (
              <div>
                <label className="block text-foreground font-semibold mb-1">Deposit Amount ($ USD)</label>
                <input
                  type="number"
                  step="5"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-xl bg-card"
                />
              </div>
            )}

            <div>
              <label className="block text-foreground font-semibold mb-1">Cancellation Cutoff Window</label>
              <select
                value={cancelWindowHours}
                onChange={(e) => setCancelWindowHours(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-xl bg-muted/40 focus:bg-card"
              >
                <option value="12">12 Hours Prior</option>
                <option value="24">24 Hours Prior (Standard)</option>
                <option value="48">48 Hours Prior</option>
              </select>
            </div>

            <div>
              <label className="block text-foreground font-semibold mb-1">No-Show Penalty Charge ($ USD)</label>
              <input
                type="number"
                step="5"
                value={noShowFee}
                onChange={(e) => setNoShowFee(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-xl bg-card"
              />
            </div>
          </div>
        </div>

        {/* Card 3: Intelligent Waitlist */}
        <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs space-y-3 md:col-span-2">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <PawPrint className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-foreground text-sm">Smart Waitlist &amp; Auto-Fill Dispatch</h3>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoWaitlist}
                onChange={(e) => setAutoWaitlist(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
            </label>
          </div>
          <p className="text-muted-foreground text-[11px]">
            When a client cancels an appointment, automatically dispatch SMS blast offers to matching dog breeds on the waitlist.
          </p>
        </div>
      </div>
    </form>
  );
};
