'use client';

import React from 'react';
import {
  Zap,
  X,
  CalendarPlus,
  DollarSign,
  MessageSquare,
  FileText,
  ShieldCheck,
  ClipboardList,
  Edit3,
  Copy,
  XCircle,
  CheckCheck,
  Bell,
  RotateCw,
  CheckCircle2,
  Activity,
  CheckCircle,
  PauseCircle,
  Phone,
  User,
  Mail,
  Receipt,
  RotateCcw,
  History,
  Plus,
  ArrowRight,
  Sliders
} from 'lucide-react';
import { CustomerFullProfile, AppointmentItem, AppointmentStatus } from '@/lib/types';

export type UnifiedQuickActionType =
  // Customer 5 Actions
  | 'new-appointment'
  | 'take-payment'
  | 'send-message'
  | 'add-note'
  | 'update-documents'
  // Appointment Lifecycle Actions
  | 'waitlist'
  | 'reschedule'
  | 'duplicate'
  | 'cancel'
  | 'confirm-appointment'
  | 'send-reminder'
  | 'follow-up'
  // Live Status Transitions
  | 'status-check-in'
  | 'status-in-service'
  | 'status-complete'
  | 'status-hold'
  | 'status-no-show'
  // Shared Actions
  | 'call-customer'
  | 'view-customer'
  | 'create-invoice'
  | 'issue-refund'
  | 'payment-history'
  | 'send-magic-link'
  | 'add-custom-action'
  | 'add-pet';

interface QuickActionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (action: UnifiedQuickActionType) => void;
  customer?: CustomerFullProfile | null;
  appointment?: AppointmentItem | null;
  onUpdateStatus?: (status: AppointmentStatus) => void;
}

export const QuickActionsModal: React.FC<QuickActionsModalProps> = ({
  isOpen,
  onClose,
  onSelectAction,
  customer,
  appointment,
  onUpdateStatus,
}) => {
  if (!isOpen) return null;

  const handleActionClick = (action: UnifiedQuickActionType) => {
    if (action.startsWith('status-') && onUpdateStatus) {
      if (action === 'status-check-in') onUpdateStatus('Checked In');
      if (action === 'status-in-service') onUpdateStatus('In Progress');
      if (action === 'status-complete') onUpdateStatus('Completed');
      if (action === 'status-hold') onUpdateStatus('Scheduled');
      if (action === 'status-no-show') onUpdateStatus('No Show');
      onClose();
      return;
    }
    onSelectAction(action);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-card/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <section 
        aria-labelledby="modal-title" 
        aria-describedby="modal-description" 
        aria-modal="true" 
        role="dialog"
        className="bg-card w-full max-w-[780px] rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <header className="px-6 py-4 border-b border-border flex items-start justify-between bg-card sticky top-0 z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-primary/5 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0 shadow-xs">
              <Zap className="w-5 h-5 text-primary fill-brand-teal/20" />
            </div>
            <div>
              <h2 id="modal-title" className="text-lg font-semibold text-foreground leading-tight flex items-center gap-2">
                <span>Quick Actions</span>
                {customer && (
                  <span className="text-[13px] font-medium text-muted-foreground bg-muted/40 px-2 py-0.5 rounded-full">
                    {customer.name}
                  </span>
                )}
              </h2>
              <p id="modal-description" className="text-[13px] text-muted-foreground mt-0.5">
                Choose an action to perform or customize your quick action workflows.
              </p>
            </div>
          </div>

          {/* Close Button */}
          <button 
            type="button" 
            aria-label="Close modal" 
            onClick={onClose}
            className="text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/40 p-2 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Modal Body Content */}
        <div className="px-6 py-5 space-y-6 overflow-y-auto bg-muted/40/40 max-h-[calc(88vh-130px)]">
          {/* Section 1: Customer Actions (Preserved 5 Actions) */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-3.5 bg-primary rounded-full inline-block"></span>
                <h3 className="text-[13px] font-semibold text-foreground uppercase tracking-wider">Customer</h3>
              </div>
              <span className="text-[11px] text-muted-foreground/70 font-medium">Client Management</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {/* 3. Send Message */}
              <button 
                type="button"
                onClick={() => handleActionClick('send-message')}
                className="group p-3 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-xs transition-all duration-150 text-left flex items-start gap-3 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/5 text-primary flex items-center justify-center text-[13px] shrink-0 group-hover:scale-105 transition-transform">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-semibold text-foreground leading-tight block truncate">Send Message</span>
                  <span className="text-[10px] text-muted-foreground leading-tight mt-0.5 block truncate">SMS or email message</span>
                </div>
                <ArrowRight className="w-3 h-3 text-primary/70 group-hover:text-primary group-hover:translate-x-0.5 transition-all mt-1 shrink-0" />
              </button>

              {/* 4. Add Note */}
              <button 
                type="button"
                onClick={() => handleActionClick('add-note')}
                className="group p-3 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-xs transition-all duration-150 text-left flex items-start gap-3 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/5 text-primary flex items-center justify-center text-[13px] shrink-0 group-hover:scale-105 transition-transform">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-semibold text-foreground leading-tight block truncate">Add Note</span>
                  <span className="text-[10px] text-muted-foreground leading-tight mt-0.5 block truncate">Internal or customer note</span>
                </div>
                <ArrowRight className="w-3 h-3 text-primary/70 group-hover:text-primary group-hover:translate-x-0.5 transition-all mt-1 shrink-0" />
              </button>

              {/* 5. Update Documents */}
              <button 
                type="button"
                onClick={() => handleActionClick('update-documents')}
                className="group p-3 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-xs transition-all duration-150 text-left flex items-start gap-3 cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-primary/5 text-primary flex items-center justify-center text-[13px] shrink-0 group-hover:scale-105 transition-transform">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-semibold text-foreground leading-tight block truncate">Update Documents</span>
                  <span className="text-[10px] text-muted-foreground leading-tight mt-0.5 block truncate">Waivers & forms</span>
                </div>
                <ArrowRight className="w-3 h-3 text-primary/70 group-hover:text-primary group-hover:translate-x-0.5 transition-all mt-1 shrink-0" />
              </button>
            </div>
          </div>

          {/* Section 3: Shared Actions */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-3.5 bg-primary rounded-full inline-block"></span>
                <h3 className="text-[13px] font-semibold text-foreground uppercase tracking-wider">Shared</h3>
              </div>
              <span className="text-[11px] text-muted-foreground/70 font-medium">Operations, Comms & Billing</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {/* Send Message */}
              <button 
                type="button"
                onClick={() => handleActionClick('send-message')}
                className="p-2.5 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-xs transition-all text-left flex flex-col justify-between h-[88px] group cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="w-7 h-7 rounded-lg bg-primary/5 text-primary flex items-center justify-center text-[13px]">
                    <MessageSquare className="w-3.5 h-3.5" />
                  </div>
                  <ArrowRight className="w-3 h-3 text-primary/70 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <span className="text-[13px] font-semibold text-foreground block leading-snug truncate">Send Message</span>
                  <span className="text-[9.5px] text-muted-foreground/70 block leading-tight mt-0.5 truncate">Chat, SMS, or email</span>
                </div>
              </button>

              {/* Call Customer */}
              <button 
                type="button"
                onClick={() => handleActionClick('call-customer')}
                className="p-2.5 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-xs transition-all text-left flex flex-col justify-between h-[88px] group cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="w-7 h-7 rounded-lg bg-primary/5 text-primary flex items-center justify-center text-[13px]">
                    <Phone className="w-3.5 h-3.5" />
                  </div>
                  <ArrowRight className="w-3 h-3 text-primary/70 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <span className="text-[13px] font-semibold text-foreground block leading-snug truncate">Call Customer</span>
                  <span className="text-[9.5px] text-muted-foreground/70 block leading-tight mt-0.5 truncate">Direct voice call link</span>
                </div>
              </button>

              {/* Add Note */}
              <button 
                type="button"
                onClick={() => handleActionClick('add-note')}
                className="p-2.5 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-xs transition-all text-left flex flex-col justify-between h-[88px] group cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="w-7 h-7 rounded-lg bg-primary/5 text-primary flex items-center justify-center text-[13px]">
                    <FileText className="w-3.5 h-3.5" />
                  </div>
                  <ArrowRight className="w-3 h-3 text-primary/70 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <span className="text-[13px] font-semibold text-foreground block leading-snug truncate">Add Note</span>
                  <span className="text-[9.5px] text-muted-foreground/70 block leading-tight mt-0.5 truncate">Activity & record note</span>
                </div>
              </button>

              {/* View Customer */}
              <button 
                type="button"
                onClick={() => handleActionClick('view-customer')}
                className="p-2.5 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-xs transition-all text-left flex flex-col justify-between h-[88px] group cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="w-7 h-7 rounded-lg bg-primary/5 text-primary flex items-center justify-center text-[13px]">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <ArrowRight className="w-3 h-3 text-primary/70 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <span className="text-[13px] font-semibold text-foreground block leading-snug truncate">View Customer</span>
                  <span className="text-[9.5px] text-muted-foreground/70 block leading-tight mt-0.5 truncate">Open full client profile</span>
                </div>
              </button>

              {/* Take Payment */}
              <button 
                type="button"
                onClick={() => handleActionClick('take-payment')}
                className="p-2.5 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-xs transition-all text-left flex flex-col justify-between h-[88px] group cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="w-7 h-7 rounded-lg bg-success/10 text-success flex items-center justify-center text-[13px]">
                    <DollarSign className="w-3.5 h-3.5" />
                  </div>
                  <ArrowRight className="w-3 h-3 text-primary/70 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <span className="text-[13px] font-semibold text-foreground block leading-snug truncate">Take Payment</span>
                  <span className="text-[9.5px] text-muted-foreground/70 block leading-tight mt-0.5 truncate">Record cash, check, or card</span>
                </div>
              </button>

              {/* Create Invoice */}
              <button 
                type="button"
                onClick={() => handleActionClick('create-invoice')}
                className="p-2.5 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-xs transition-all text-left flex flex-col justify-between h-[88px] group cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="w-7 h-7 rounded-lg bg-primary/5 text-primary flex items-center justify-center text-[13px]">
                    <Receipt className="w-3.5 h-3.5" />
                  </div>
                  <ArrowRight className="w-3 h-3 text-primary/70 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <span className="text-[13px] font-semibold text-foreground block leading-snug truncate">Create Invoice</span>
                  <span className="text-[9.5px] text-muted-foreground/70 block leading-tight mt-0.5 truncate">Generate billing invoice</span>
                </div>
              </button>

              {/* Issue Refund */}
              <button 
                type="button"
                onClick={() => handleActionClick('issue-refund')}
                className="p-2.5 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-xs transition-all text-left flex flex-col justify-between h-[88px] group cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="w-7 h-7 rounded-lg bg-primary/5 text-primary flex items-center justify-center text-[13px]">
                    <RotateCcw className="w-3.5 h-3.5" />
                  </div>
                  <ArrowRight className="w-3 h-3 text-primary/70 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <span className="text-[13px] font-semibold text-foreground block leading-snug truncate">Issue Refund</span>
                  <span className="text-[9.5px] text-muted-foreground/70 block leading-tight mt-0.5 truncate">Process customer refund</span>
                </div>
              </button>

              {/* Payment History */}
              <button 
                type="button"
                onClick={() => handleActionClick('payment-history')}
                className="p-2.5 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-xs transition-all text-left flex flex-col justify-between h-[88px] group cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="w-7 h-7 rounded-lg bg-primary/5 text-primary flex items-center justify-center text-[13px]">
                    <History className="w-3.5 h-3.5" />
                  </div>
                  <ArrowRight className="w-3 h-3 text-primary/70 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <span className="text-[13px] font-semibold text-foreground block leading-snug truncate">Payment History</span>
                  <span className="text-[9.5px] text-muted-foreground/70 block leading-tight mt-0.5 truncate">View ledger & receipts</span>
                </div>
              </button>

              {/* Send Magic Link */}
              <button
                type="button"
                onClick={() => handleActionClick('send-magic-link')}
                className="p-2.5 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-xs transition-all text-left flex flex-col justify-between h-[88px] group cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="w-7 h-7 rounded-lg bg-primary/5 text-primary flex items-center justify-center text-[13px]">
                    <Mail className="w-3.5 h-3.5" />
                  </div>
                  <ArrowRight className="w-3 h-3 text-primary/70 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <span className="text-[13px] font-semibold text-foreground block leading-snug truncate">Send Magic Link</span>
                  <span className="text-[9.5px] text-muted-foreground/70 block leading-tight mt-0.5 truncate">Email a one-time sign-in link</span>
                </div>
              </button>
            </div>
          </div>

          {/* Section 4: Add Quick Action Customizer */}
          <div className="pt-1">
            <button 
              type="button"
              onClick={() => handleActionClick('add-custom-action')}
              className="w-full py-3 px-4 border-2 border-dashed border-primary/20 hover:border-primary/30 bg-primary/5/40 hover:bg-primary/5/80 rounded-xl transition-all flex items-center justify-center gap-2.5 text-center group cursor-pointer"
            >
              <div className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-[13px] font-semibold group-hover:scale-110 transition-transform">
                <Plus className="w-3.5 h-3.5" />
              </div>
              <div className="text-left">
                <span className="text-[13px] font-semibold text-primary block leading-tight">Add Quick Action</span>
                <span className="text-[10px] text-primary leading-tight block">Customize or add a new shortcut to your workflow</span>
              </div>
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <footer className="p-4 border-t border-border flex justify-end bg-card">
          <button 
            type="button" 
            onClick={onClose}
            className="px-6 py-2 bg-card border border-border hover:bg-muted/40 text-foreground text-[13px] font-semibold rounded-lg shadow-xs hover:border-border transition-all focus:outline-none cursor-pointer"
          >
            Close
          </button>
        </footer>
      </section>
    </div>
  );
};
