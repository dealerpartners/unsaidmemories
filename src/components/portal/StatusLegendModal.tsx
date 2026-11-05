'use client';

import React from 'react';
import { CheckCircle2, Clock, Calendar, XCircle, AlertCircle, PawPrint, Info } from 'lucide-react';

interface StatusLegendModalProps {
  onClose: () => void;
}

const LEGEND_ITEMS = [
  {
    status: 'Scheduled',
    desc: 'Appointment is scheduled.',
    badgeClass: 'bg-primary/5 text-primary border-primary/20',
    dotClass: 'bg-primary/50 ring-4 ring-brand-teal/20',
  },
  {
    status: 'Confirmed',
    desc: 'Appointment is confirmed.',
    badgeClass: 'bg-success/10 text-success border-success/20',
    dotClass: 'bg-success/100 ring-4 ring-emerald-100',
  },
  {
    status: 'Checked In',
    desc: 'Pet has been checked in.',
    badgeClass: 'bg-warning/10 text-warning border-warning/20',
    dotClass: 'bg-warning/100 ring-4 ring-amber-100',
  },
  {
    status: 'In Progress',
    desc: 'Grooming is in progress.',
    badgeClass: 'bg-primary/5 text-primary border-primary/20',
    dotClass: 'bg-primary/50 ring-4 ring-purple-100',
  },
  {
    status: 'Completed',
    desc: 'Appointment is completed.',
    badgeClass: 'bg-primary/5 text-primary border-primary/20',
    dotClass: 'bg-primary ring-4 ring-teal-100',
  },
  {
    status: 'Canceled',
    desc: 'Appointment was canceled.',
    badgeClass: 'bg-destructive/5 text-destructive border-destructive/20',
    dotClass: 'bg-destructive/50 ring-4 ring-rose-100',
  },
  {
    status: 'No Show',
    desc: 'Customer did not show up.',
    badgeClass: 'bg-muted/40 text-foreground border-border',
    dotClass: 'bg-muted-foreground ring-4 ring-border',
  },
  {
    status: 'Waitlisted',
    desc: 'Pet is on the waitlist.',
    badgeClass: 'bg-warning/5 text-warning border-warning/20',
    dotClass: 'bg-warning/50 ring-4 ring-orange-100',
  },
];

export const StatusLegendModal: React.FC<StatusLegendModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-card/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-card rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl border border-border space-y-6 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
        {/* Header Section */}
        <div className="flex items-center justify-between border-b border-border pb-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-primary/5 text-primary">
              <PawPrint className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-xl font-semibold text-foreground tracking-tight">
                Appointment Status Legend
              </h2>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                Lifecycle state definitions for the UnSaid Memories appointment schedule.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[13px] font-semibold bg-muted/40 text-muted-foreground border border-border">
              <span className="w-1.5 h-1.5 rounded-full bg-success/100" />
              System v2.4 Spec
            </span>
            <button
              onClick={onClose}
              className="text-muted-foreground/70 hover:text-muted-foreground p-1.5 rounded-xl hover:bg-muted/40 transition cursor-pointer"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Status Grid Matrix */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {LEGEND_ITEMS.map((item) => (
            <div
              key={item.status}
              className="flex items-center justify-between p-3.5 rounded-2xl border border-border bg-muted/40/60 hover:bg-muted/40 transition"
            >
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${item.dotClass}`} />
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[13px] font-semibold border ${item.badgeClass}`}>
                  {item.status}
                </span>
              </div>
              <p className="text-[13px] text-muted-foreground text-right">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Live Table Row Preview */}
        <div className="border-t border-border pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
              Live Table Appearance Example
            </h3>
            <span className="text-[13px] text-muted-foreground/70">Row Context: Appointments Table</span>
          </div>

          <div className="bg-card rounded-2xl border border-border p-4 shadow-2xs overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="text-[11px] font-semibold text-muted-foreground/70 border-b border-border pb-2">
                  <th className="pb-2 font-medium">Date &amp; Time</th>
                  <th className="pb-2 font-medium">Customer / Pet</th>
                  <th className="pb-2 font-medium">Service</th>
                  <th className="pb-2 font-medium">Groomer</th>
                  <th className="pb-2 font-medium text-center">Status</th>
                  <th className="pb-2 font-medium text-right">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-foreground">
                <tr>
                  <td className="py-3 text-muted-foreground">
                    <span className="font-semibold text-foreground block text-[13px]">May 16, 2025</span>
                    8:30 AM (2.5 hrs)
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="w-7 h-7 rounded-full bg-warning/10 flex items-center justify-center text-[13px] font-semibold text-warning">SJ</span>
                      <div>
                        <span className="font-semibold text-foreground block leading-tight">Sarah Johnson</span>
                        <span className="text-[11px] text-muted-foreground/70">Buddy</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-muted-foreground font-medium">Full Groom</td>
                  <td className="py-3 text-muted-foreground">Sarah M.</td>
                  <td className="py-3 text-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/5 text-primary border border-primary/20">
                      Scheduled
                    </span>
                  </td>
                  <td className="py-3 text-right font-semibold text-success">$25.00 <span className="text-[10px] text-muted-foreground/70 font-normal">Deposit</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <p className="text-[11px] text-muted-foreground/70">UnSaid Memories • Component Spec</p>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-[13px] font-semibold shadow-2xs transition cursor-pointer"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
