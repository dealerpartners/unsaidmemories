'use client';

import React, { useState } from 'react';
import { CreditCard, CheckCircle2, ShieldCheck, DollarSign, Receipt, AlertCircle, ExternalLink } from 'lucide-react';

export const PaymentsTab: React.FC = () => {
  const [stripeLive, setStripeLive] = useState(true);
  const [taxRate, setTaxRate] = useState('8.25');
  const [enableApplePay, setEnableApplePay] = useState(true);
  const [enableGooglePay, setEnableGooglePay] = useState(true);
  const [enableCash, setEnableCash] = useState(true);
  const [defaultTip, setDefaultTip] = useState('20');
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
          <div className="flex items-center gap-2 text-[13px] font-semibold text-success uppercase tracking-wider mb-1">
            <CreditCard className="w-4 h-4" />
            <span>Financial &amp; Gateway Settings</span>
          </div>
          <h2 className="text-xl font-semibold text-foreground">Payments &amp; Gateway Settings</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Configure Stripe terminal integrations, online checkout methods, sales taxes, and digital receipt rules.
          </p>
        </div>

        <button
          type="submit"
          className="px-4 py-2 bg-primary hover:bg-primary/90 text-white text-[13px] font-semibold rounded-xl flex items-center gap-2 shadow-xs transition-colors cursor-pointer self-start md:self-auto"
        >
          <span>Save Payment Settings</span>
        </button>
      </div>

      {saved && (
        <div className="p-3 bg-success/10 border border-success/20 text-success text-[13px] font-medium rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-success" />
          <span>Payment gateways and tax configurations saved!</span>
        </div>
      )}

      {/* Stripe Connect Banner */}
      <div className="bg-gradient-to-r from-neutral-900 via-teal-950 to-neutral-900 text-white p-6 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-success" />
            <h3 className="font-semibold text-sm text-white">Stripe Payments Terminal</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-success/10 text-success border border-success/20">
              Connected &amp; Verified
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Account ID: <span className="tabular-nums text-primary/70">acct_1Portal901Live</span> · Next payout: Tomorrow ($1,840.00)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="https://dashboard.stripe.com"
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-1.5 bg-card/10 hover:bg-card/20 border border-white/20 rounded-xl text-[13px] font-semibold text-white flex items-center gap-1.5 transition-colors"
          >
            <span>Stripe Dashboard</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Grid of 2 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Card 1: Accepted Payment Methods */}
        <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs space-y-4">
          <h3 className="font-semibold text-foreground text-sm pb-2 border-b border-border">
            Accepted Checkout Methods
          </h3>

          <div className="space-y-2.5">
            <label className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border cursor-pointer">
              <span className="font-semibold text-foreground">Credit &amp; Debit Cards (Visa, MC, Amex, Discover)</span>
              <input type="checkbox" defaultChecked disabled className="h-4 w-4 rounded text-primary" />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border cursor-pointer">
              <span className="font-semibold text-foreground">Apple Pay &amp; Google Pay</span>
              <input
                type="checkbox"
                checked={enableApplePay}
                onChange={(e) => setEnableApplePay(e.target.checked)}
                className="h-4 w-4 rounded text-primary"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border cursor-pointer">
              <span className="font-semibold text-foreground">In-Person Cash / Salon Register</span>
              <input
                type="checkbox"
                checked={enableCash}
                onChange={(e) => setEnableCash(e.target.checked)}
                className="h-4 w-4 rounded text-primary"
              />
            </label>
          </div>
        </div>

        {/* Card 2: Taxes & Receipts */}
        <div className="bg-card p-5 rounded-2xl border border-border/90 shadow-2xs space-y-4">
          <h3 className="font-semibold text-foreground text-sm pb-2 border-b border-border">
            Sales Tax &amp; Tip Presets
          </h3>

          <div className="space-y-3">
            <div>
              <label className="block text-foreground font-semibold mb-1">State / Local Sales Tax Rate (%)</label>
              <input
                type="number"
                step="0.01"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-xl bg-muted/40 focus:bg-card"
              />
              <p className="text-[10px] text-muted-foreground/70 mt-1">Applied to retail items and taxable add-on services.</p>
            </div>

            <div>
              <label className="block text-foreground font-semibold mb-1">Default Suggested Tip %</label>
              <div className="grid grid-cols-4 gap-2">
                {['15', '20', '25', 'Custom'].map((tip) => (
                  <button
                    type="button"
                    key={tip}
                    onClick={() => setDefaultTip(tip)}
                    className={`py-2 rounded-xl border text-center font-semibold transition-all cursor-pointer ${
                      defaultTip === tip
                        ? 'bg-primary text-white border-primary'
                        : 'bg-muted/40 text-foreground border-border hover:bg-muted/40'
                    }`}
                  >
                    {tip === 'Custom' ? 'Custom' : `${tip}%`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
};
