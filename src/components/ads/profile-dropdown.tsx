"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";

/**
 * ProfileDropdown — modern avatar dropdown with:
 *   - User name, email, role
 *   - Account switcher
 *   - Settings (with sub-links)
 *   - Billing & Subscription (with sub-links)
 *   - Sign Out action
 *
 * This is the ONLY place Settings, Billing, and Sign Out appear in the UI.
 * Triggered by clicking the avatar circle in the top bar.
 */
export function ProfileDropdown() {
  const [open, setOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [policiesOpen, setPoliciesOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { user, signOut, signingOut } = useAuth();

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "…";

  const close = () => setOpen(false);

  return (
    <div className="relative" ref={ref}>
      {/* Avatar trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-600 transition-colors hover:bg-neutral-300 focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-1"
        aria-haspopup="true"
        aria-expanded={open}
      >
        {initials}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg z-50 max-h-[85vh] overflow-y-auto">
          {/* User info header */}
          <div className="px-4 py-3 border-b border-neutral-100">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-200 text-sm font-semibold text-neutral-600">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-neutral-900">
                  {user?.name || "Loading…"}
                </p>
                <p className="truncate text-xs text-neutral-500">
                  {user?.email || ""}
                </p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium capitalize text-neutral-600">
                {user?.role || "user"}
              </span>
              {user?.plan && (
                <Link
                  href="/ads/billing/plans"
                  onClick={close}
                  className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600 transition-colors hover:bg-neutral-200"
                >
                  {user.plan.label}
                </Link>
              )}
            </div>
          </div>

          {/* Account section */}
          <div className="px-2 py-2 border-b border-neutral-100">
            <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span className="flex-1 text-left">{user?.accountName || "Account"}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>

          {/* ─── Account Management (expandable) ─── */}
          <div className="border-b border-neutral-100">
            <button
              onClick={() => setAccountOpen(!accountOpen)}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="2" width="16" height="20" rx="2" />
                <path d="M9 22v-4h6v4" />
                <path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" />
              </svg>
              <span className="flex-1 text-left">Account Management</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-neutral-400 transition-transform duration-200 ${accountOpen ? "rotate-90" : ""}`}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
            {accountOpen && (
              <div className="px-2 pb-2 space-y-0.5">
                <DropdownLink href="/ads/account" label="My Account" onClick={close} />
                <DropdownLink href="/ads/account/settings" label="Account Settings" onClick={close} />
                <DropdownLink href="/ads/account/profile" label="Profile Information" onClick={close} />
                <DropdownLink href="/ads/account/documents" label="Documents & Legal" onClick={close} />
                <DropdownLink href="/ads/account/health" label="Account Health" onClick={close} />
                <DropdownLink href="/ads/account/customer-review" label="Customer Review" onClick={close} />
                <DropdownLink href="/ads/account/brand-safety" label="Brand Safety Hub" onClick={close} />
                <DropdownLink href="/ads/account/audience-controls" label="Audience Controls" onClick={close} />
                <DropdownLink href="/ads/account/verification" label="Business Verification" onClick={close} />
                <DropdownLink href="/ads/account/team" label="Team & Members" onClick={close} />
                <DropdownLink href="/ads/account/tiers" label="Account Tier System" onClick={close} />
                <DropdownLink href="/ads/account/notifications" label="Notification Preferences" onClick={close} />
              </div>
            )}
          </div>

          {/* ─── Settings (expandable) ─── */}
          <div className="border-b border-neutral-100">
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span className="flex-1 text-left">Settings</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-neutral-400 transition-transform duration-200 ${settingsOpen ? "rotate-90" : ""}`}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
            {settingsOpen && (
              <div className="px-2 pb-2 space-y-0.5">
                <DropdownLink href="/ads/settings" label="Ad Settings" onClick={close} />
                <DropdownLink href="/ads/settings/api" label="API Access" onClick={close} />
                <DropdownLink href="/ads/settings/brand-safety" label="Brand Safety" onClick={close} />
                <DropdownLink href="/ads/settings/notifications" label="Notification Settings" onClick={close} />
                <DropdownLink href="/ads/settings/targeting-defaults" label="Targeting Defaults" onClick={close} />
              </div>
            )}
          </div>

          {/* ─── Policies & Security (expandable) ─── */}
          <div className="border-b border-neutral-100">
            <button
              onClick={() => setPoliciesOpen(!policiesOpen)}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span className="flex-1 text-left">Policies & Security</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-neutral-400 transition-transform duration-200 ${policiesOpen ? "rotate-90" : ""}`}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
            {policiesOpen && (
              <div className="px-2 pb-2 space-y-0.5">
                <DropdownLink href="/ads/policies-security" label="Advertising Policies" onClick={close} />
                <DropdownLink href="/ads/policies-security/privacy" label="Privacy Practices" onClick={close} />
                <DropdownLink href="/ads/policies-security/security" label="Account Security" onClick={close} />
                <DropdownLink href="/ads/policies-security/brand-safety" label="Brand Safety" onClick={close} />
              </div>
            )}
          </div>

          {/* ─── Billing & Subscription section (expandable) ─── */}
          <div className="border-b border-neutral-100">
            <button
              onClick={() => setBillingOpen(!billingOpen)}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" />
                <path d="M1 10h22" />
              </svg>
              <span className="flex-1 text-left">Billing & Subscription</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-neutral-400 transition-transform duration-200 ${billingOpen ? "rotate-90" : ""}`}>
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
            {billingOpen && (
              <div className="px-2 pb-2 space-y-0.5">
                <DropdownLink href="/ads/billing" label="Billing Overview" onClick={close} />
                <DropdownLink href="/ads/billing/plans" label="Plans & Subscriptions" onClick={close} />
                <DropdownLink href="/ads/billing/payment-preferences" label="Payment Preferences" onClick={close} />
                <DropdownLink href="/ads/billing/payment-methods" label="Payment Methods" onClick={close} />
                <DropdownLink href="/ads/billing/profile" label="Billing Profile" onClick={close} />
                <DropdownLink href="/ads/billing/invoices" label="Invoices" onClick={close} />
                <DropdownLink href="/ads/billing/transactions" label="Transactions" onClick={close} />
                <DropdownLink href="/ads/billing/taxes" label="Taxes" onClick={close} />
                <DropdownLink href="/ads/billing/credits" label="Credits & Promotions" onClick={close} />
                <DropdownLink href="/ads/billing/support" label="Billing Support" onClick={close} />
              </div>
            )}
          </div>

          {/* Sign Out */}
          <div className="px-2 py-1.5">
            <button
              onClick={() => {
                close();
                signOut();
              }}
              disabled={signingOut}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-neutral-700 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Small helper for dropdown links ─── */
function DropdownLink({ href, label, onClick }: { href: string; label: string; onClick: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 pl-6 text-[13px] text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900"
    >
      {label}
    </Link>
  );
}

/**
 * SidebarProfile — compact user display at bottom of sidebar.
 * Shows the user info; the actual dropdown with Settings/Billing/SignOut
 * is in the top bar ProfileDropdown.
 */
export function SidebarProfile() {
  const { user } = useAuth();

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "…";

  return (
    <div className="border-t border-neutral-200 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-600">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-neutral-900">
            {user?.name || "Loading…"}
          </p>
          <p className="truncate text-xs text-neutral-400">
            {user?.accountName || "Personal account"}
          </p>
        </div>
      </div>
    </div>
  );
}
