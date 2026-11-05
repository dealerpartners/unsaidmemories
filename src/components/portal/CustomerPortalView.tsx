'use client';

import React, { useState } from 'react';
import { AuthUser } from '@/lib/types';

interface CustomerPortalViewProps {
  currentUser: AuthUser;
  onSwitchToAdmin?: () => void;
  onSwitchToGroomer?: () => void;
  onSignOut: () => void;
}

type CustomerTab =
  | 'dashboard'
  | 'my-pets'
  | 'appointments'
  | 'book-appointment'
  | 'live-groom-status'
  | 'my-invoices'
  | 'payments-cards'
  | 'packages-memberships'
  | 'rewards'
  | 'documents'
  | 'my-profile'
  | 'messages'
  | 'settings';

export const CustomerPortalView: React.FC<CustomerPortalViewProps> = ({
  currentUser,
  onSwitchToAdmin,
  onSwitchToGroomer,
  onSignOut,
}) => {
  const [activeTab, setActiveTab] = useState<CustomerTab>('dashboard');
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showAddPetModal, setShowAddPetModal] = useState(false);
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [referralModal, setReferralModal] = useState(false);
  const [referralCopied, setReferralCopied] = useState(false);

  // Live groom status state (interactive tracker)
  const [groomStep, setGroomStep] = useState<number>(2); // 1: Checked in, 2: In service, 3: Finishing Up, 4: Ready for pickup

  return (
    <div className="bg-[#F8FAFC] text-foreground min-h-screen flex antialiased font-sans selection:bg-primary/10 selection:text-primary">
      {/* ================= LEFT SIDEBAR ================= */}
      <aside
        className="w-64 bg-card border-r border-border flex-shrink-0 flex flex-col justify-between py-6 px-4 select-none min-h-screen"
        data-purpose="sidebar-navigation"
      >
        {/* Top Brand Logo */}
        <div>
          <div className="flex items-center gap-3 px-3 mb-8">
            <div className="text-brand-teal">
              <svg className="w-9 h-9" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C11.17 2 10.5 2.67 10.5 3.5C10.5 4.33 11.17 5 12 5C12.83 5 13.5 4.33 13.5 3.5C13.5 2.67 12.83 2 12 2ZM8 4.5C7.17 4.5 6.5 5.17 6.5 6C6.5 6.83 7.17 7.5 8 7.5C8.83 7.5 9.5 6.83 9.5 6C9.5 5.17 8.83 4.5 8 4.5ZM16 4.5C15.17 4.5 14.5 5.17 14.5 6C14.5 6.83 15.17 7.5 16 7.5C16.83 7.5 17.5 6.83 17.5 6C17.5 5.17 16.83 4.5 16 4.5ZM5.5 8.5C4.67 8.5 4 9.17 4 10C4 10.83 4.67 11.5 5.5 11.5C6.33 11.5 7 10.83 7 10C7 9.17 6.33 8.5 5.5 8.5ZM18.5 8.5C17.67 8.5 17 9.17 17 10C17 10.83 17.67 11.5 18.5 11.5C19.33 11.5 20 10.83 20 10C20 9.17 19.33 8.5 18.5 8.5ZM12 7C9.5 7 7 9.5 7 12.5C7 15 8.5 17.5 10 19C10.5 19.5 11.2 20 12 20C12.8 20 13.5 19.5 14 19C15.5 17.5 17 15 17 12.5C17 9.5 14.5 7 12 7Z" />
              </svg>
            </div>
            <span className="font-extrabold text-xl leading-tight tracking-tight text-brand-teal">
              UnSaid<br />
              <span className="font-semibold text-foreground text-lg tracking-normal">Portal</span>
            </span>
          </div>

          {/* Navigation Menu Items */}
          <nav aria-label="Sidebar Navigation" className="space-y-1">
            {/* Dashboard */}
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-semibold text-sm transition cursor-pointer text-left ${
                activeTab === 'dashboard'
                  ? 'bg-primary/5 text-brand-teal'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Dashboard
            </button>

            {/* My Pets */}
            <button
              onClick={() => setActiveTab('my-pets')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer text-left ${
                activeTab === 'my-pets'
                  ? 'bg-primary/5 text-brand-teal font-semibold'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              My Pets
            </button>

            {/* Appointments */}
            <button
              onClick={() => setActiveTab('appointments')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer text-left ${
                activeTab === 'appointments'
                  ? 'bg-primary/5 text-brand-teal font-semibold'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Appointments
            </button>

            {/* Book Appointment */}
            <button
              onClick={() => setActiveTab('book-appointment')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer text-left ${
                activeTab === 'book-appointment'
                  ? 'bg-primary/5 text-brand-teal font-semibold'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Book Appointment
            </button>

            {/* Live Groom Status */}
            <button
              onClick={() => setActiveTab('live-groom-status')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer text-left ${
                activeTab === 'live-groom-status'
                  ? 'bg-primary/5 text-brand-teal font-semibold'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M13 10V3L4 14h7v7l9-11h-7z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Live Groom Status
            </button>

            {/* My Invoices */}
            <button
              onClick={() => setActiveTab('my-invoices')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer text-left ${
                activeTab === 'my-invoices'
                  ? 'bg-primary/5 text-brand-teal font-semibold'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              My Invoices
            </button>

            {/* Payments & Cards */}
            <button
              onClick={() => setActiveTab('payments-cards')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer text-left ${
                activeTab === 'payments-cards'
                  ? 'bg-primary/5 text-brand-teal font-semibold'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Payments &amp; Cards
            </button>

            {/* Packages & Memberships */}
            <button
              onClick={() => setActiveTab('packages-memberships')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer text-left ${
                activeTab === 'packages-memberships'
                  ? 'bg-primary/5 text-brand-teal font-semibold'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Packages &amp; Memberships
            </button>

            {/* Rewards */}
            <button
              onClick={() => setActiveTab('rewards')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer text-left ${
                activeTab === 'rewards'
                  ? 'bg-primary/5 text-brand-teal font-semibold'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Rewards
            </button>

            {/* Documents */}
            <button
              onClick={() => setActiveTab('documents')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer text-left ${
                activeTab === 'documents'
                  ? 'bg-primary/5 text-brand-teal font-semibold'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Documents
            </button>

            {/* My Profile */}
            <button
              onClick={() => setActiveTab('my-profile')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer text-left ${
                activeTab === 'my-profile'
                  ? 'bg-primary/5 text-brand-teal font-semibold'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              My Profile
            </button>

            {/* Messages */}
            <button
              onClick={() => setActiveTab('messages')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer text-left ${
                activeTab === 'messages'
                  ? 'bg-primary/5 text-brand-teal font-semibold'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Messages
            </button>

            {/* Settings */}
            <button
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer text-left ${
                activeTab === 'settings'
                  ? 'bg-primary/5 text-brand-teal font-semibold'
                  : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Settings
            </button>

            {/* Logout */}
            <div className="pt-4 mt-2 border-t border-border">
              <button
                onClick={onSignOut}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive font-medium text-sm transition cursor-pointer text-left"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Log Out
              </button>
            </div>
          </nav>
        </div>

        {/* Support Card in Sidebar */}
        <div className="mt-8 bg-primary/5/70 border border-primary/10 rounded-xl p-4 text-center">
          <h4 className="text-[13px] font-semibold text-foreground">Need help?</h4>
          <p className="text-[13px] text-muted-foreground mt-1">We&apos;re here for you!</p>
          <p className="text-[13px] font-semibold text-brand-teal mt-1">(901) 722-1114</p>
          <button
            onClick={() => setShowMessageModal(true)}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 bg-card border border-primary/20 shadow-2xs rounded-lg px-3 py-2 text-[13px] font-semibold text-brand-teal hover:bg-primary/5 transition cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Send Message
          </button>
        </div>
      </aside>

      {/* ================= MAIN CONTENT AREA ================= */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Greeting & Header Bar */}
        <header
          className="bg-card border-b border-border px-8 py-5 flex items-center justify-between flex-shrink-0 sticky top-0 z-20"
          data-purpose="top-navigation-header"
        >
          <div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
              Good morning, Sarah! <span className="text-xl">👋</span>
            </h1>
            <p className="text-[13px] text-muted-foreground mt-0.5">Here&apos;s what&apos;s happening with your pups today.</p>
          </div>

          {/* User Profile & Notifications & Role Switcher */}
          <div className="flex items-center gap-4 relative">
            {/* Notification Bell */}
            <button
              aria-label="Notifications"
              className="relative p-2 rounded-full text-muted-foreground hover:bg-muted/40 transition cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="absolute top-1 right-1 bg-destructive/100 text-white text-[10px] font-semibold w-4 h-4 rounded-full flex items-center justify-center ring-2 ring-white">
                2
              </span>
            </button>

            {/* User Pill / Switcher */}
            <div
              onClick={() => setShowRoleMenu(!showRoleMenu)}
              className="flex items-center gap-3 pl-3 border-l border-border cursor-pointer hover:opacity-85 transition"
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 text-brand-teal font-semibold text-[13px] flex items-center justify-center border border-primary/20">
                SJ
              </div>
              <div className="text-left hidden sm:block">
                <span className="text-[13px] font-semibold text-foreground block leading-tight">Sarah Johnson</span>
                <span className="text-[10px] text-primary font-medium">Pet Parent</span>
              </div>
              <svg className="w-4 h-4 text-muted-foreground/70" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            {/* Dropdown Menu to Switch between portals */}
            {showRoleMenu && (
              <div className="absolute right-0 top-12 w-56 bg-card border border-border rounded-xl shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-[13px] font-semibold text-foreground">Sarah Johnson</p>
                  <p className="text-[11px] text-muted-foreground">client@test.com</p>
                </div>
                <div className="py-1">
                  {onSwitchToAdmin && (
                    <button
                      onClick={() => {
                        setShowRoleMenu(false);
                        onSwitchToAdmin();
                      }}
                      className="w-full px-3 py-1.5 text-[13px] text-foreground hover:bg-muted/40 flex items-center gap-2 cursor-pointer text-left"
                    >
                      <span>⚙️</span> Switch to Salon Admin
                    </button>
                  )}
                  {onSwitchToGroomer && (
                    <button
                      onClick={() => {
                        setShowRoleMenu(false);
                        onSwitchToGroomer();
                      }}
                      className="w-full px-3 py-1.5 text-[13px] text-foreground hover:bg-muted/40 flex items-center gap-2 cursor-pointer text-left"
                    >
                      <span>✂️</span> Switch to Groomer Station
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowRoleMenu(false);
                      onSignOut();
                    }}
                    className="w-full px-3 py-1.5 text-[13px] text-destructive hover:bg-destructive/10 flex items-center gap-2 cursor-pointer text-left"
                  >
                    <span>🚪</span> Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Dashboard Body Content */}
        <main className="p-6 sm:p-8 space-y-6 flex-1 max-w-[1400px]">
          {/* ================= TOP DASHBOARD ROW ================= */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6" data-purpose="primary-status-cards">
            {/* Upcoming Appointment Card (Left Column, 7 cols) */}
            <section
              className="xl:col-span-7 bg-card border border-border rounded-xl p-6 shadow-2xs flex flex-col justify-between"
              data-purpose="upcoming-appointment"
            >
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-border">
                  <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
                    <svg className="w-4 h-4 text-brand-teal" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Upcoming Appointment
                  </div>
                  <button
                    onClick={() => setActiveTab('appointments')}
                    className="text-[13px] font-semibold text-brand-teal hover:underline cursor-pointer"
                  >
                    View all
                  </button>
                </div>

                {/* Main Details */}
                <div className="flex items-center gap-5 mt-5">
                  <div className="w-20 h-20 rounded-full overflow-hidden flex-shrink-0 bg-warning/10 border border-warning/20">
                    <img
                      alt="Buddy the Golden Retriever"
                      className="w-full h-full object-cover"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuDrOxLtT6GuB7Xqy9wD2f37dVskyAbs5n4Fx_z-ANVI5WgBvumvewGhLhPUys3Loq-um62ByrDdj8r-OixTiF66BP0CJoaap_OkxMLVcPIJebXAgAAqIN-VaPhzasxJx9mhE3BSujJon0ULHA7pSPN-LutRJvy3oUDFG3zwH0CVph3B221o0nt9D2-NiSI5o-pbpN8AiYorWdFeeRxcpx_r4U_RZWgwJbW3KBHOv6oFDSEmDnl_idYS"
                    />
                  </div>
                  <div>
                    <p className="text-[13px] text-muted-foreground font-medium">Wednesday, May 21, 2025</p>
                    <p className="text-2xl font-extrabold text-foreground mt-0.5">10:30 AM</p>
                    <p className="text-sm font-semibold text-foreground mt-0.5">Full Groom + Blueberry Facial</p>
                    <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground mt-1">
                      <svg className="w-3.5 h-3.5 text-brand-teal" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>UnSaid Memories – Frisco Location</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer: Groomer & Action Button */}
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
                <div className="flex items-center gap-2.5">
                  <img
                    alt="Sarah M."
                    className="w-6 h-6 rounded-full object-cover border border-border"
                    src="https://lh3.googleusercontent.com/aida-public/AB6AXuCNIEpDScyL977tdc-rLYh4_ksq466XZ7OpRPQzY-1HWlRGcv3nDVmyz5hiik8a4BztgOlDE8mwAglsQF7nec16VqxecRAG2BROmD6CQ6akSNSwZjZXabjJAu0lTMjgw8Z5m7gcOPZDP7UlqFU_sNGVJCwd5fNw_Mye6SCB9_SIBuisfYgH-Ry8BYMEIB0B4Fh8D_upZhRp5MafgvVz1iXHsTvXy1oA1byvfOqrP_Xg3cYGC-rQ-oye"
                  />
                  <span className="text-[13px] font-medium text-muted-foreground">
                    Groomer: <span className="text-foreground font-semibold">Sarah M.</span>
                  </span>
                </div>
                <button
                  onClick={() => setActiveTab('appointments')}
                  className="bg-brand-teal hover:bg-primary text-white text-[13px] font-semibold px-5 py-2.5 rounded-lg shadow-2xs transition cursor-pointer"
                >
                  View Details
                </button>
              </div>
            </section>

            {/* Live Groom Status Card (Right Column, 5 cols) */}
            <section
              className="xl:col-span-5 bg-card border border-border rounded-xl overflow-hidden shadow-2xs flex flex-col justify-between"
              data-purpose="live-groom-status"
            >
              {/* Top Blue Banner with Pet Info */}
              <div className="bg-brand-teal p-5 text-white flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white/80 flex-shrink-0 bg-card/10">
                    <img
                      alt="Charlie"
                      className="w-full h-full object-cover"
                      src="https://lh3.googleusercontent.com/aida-public/AB6AXuB_a-c6SPE1wQ6s4wngqXqg3SBVBpLjAmlKyIcjy_rhJ74EwgoJ1QXR14cEzrOQaXM4Nz8gLDEVH662mAbI8cZK_47pyAi8LwzSoPQQ1_6H1yRnSDN-rssfsEZBrAQe5upEfX84iGogcJWTfXOUh4xhXVjSZM3k5WhauZI1Z9AqY0TZDYTbCE7uVOHtVWnkok42QZ0QKXb31WZQEVkiU14IDxaPws8I4jEo7mCkzVPOJBU9686O_PNm"
                    />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Charlie</h3>
                    <p className="text-[13px] text-primary-foreground/80">Full Groom &amp; Pawdicure</p>
                    <p className="text-[13px] text-primary-foreground/80 mt-0.5">Started today at 9:15 AM</p>
                  </div>
                </div>
                <div className="self-start">
                  <button
                    onClick={() => setActiveTab('live-groom-status')}
                    className="text-[13px] font-medium text-white/90 hover:text-white underline cursor-pointer"
                  >
                    View All
                  </button>
                </div>
              </div>

              {/* Progress Tracker (Interactive) */}
              <div className="p-5">
                <div className="relative flex items-center justify-between w-full mt-2">
                  {/* Background track line */}
                  <div className="absolute left-3 right-3 top-3.5 -translate-y-1/2 h-0.5 bg-muted z-0" />
                  {/* Active completed track line */}
                  <div
                    className="absolute left-3 top-3.5 -translate-y-1/2 h-0.5 bg-brand-teal z-0 transition-all duration-300"
                    style={{
                      width:
                        groomStep === 1
                          ? '0%'
                          : groomStep === 2
                          ? '33%'
                          : groomStep === 3
                          ? '66%'
                          : '95%',
                    }}
                  />

                  {/* Step 1: Checked In */}
                  <div
                    onClick={() => setGroomStep(1)}
                    className="relative z-10 flex flex-col items-center cursor-pointer"
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-semibold shadow-2xs ${
                        groomStep >= 1 ? 'bg-brand-teal text-white' : 'bg-muted/40 border border-border text-muted-foreground/70'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <span className="text-[11px] font-semibold text-foreground mt-1.5">Checked In</span>
                    <span className="text-[10px] text-muted-foreground/70">9:00 AM</span>
                  </div>

                  {/* Step 2: In Service */}
                  <div
                    onClick={() => setGroomStep(2)}
                    className="relative z-10 flex flex-col items-center cursor-pointer"
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-semibold shadow-2xs ${
                        groomStep >= 2
                          ? 'bg-brand-teal text-white ring-4 ring-brand-teal/20'
                          : 'bg-muted/40 border border-border text-muted-foreground/70'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <span
                      className={`text-[11px] font-semibold mt-1.5 ${
                        groomStep === 2 ? 'text-brand-teal' : 'text-foreground'
                      }`}
                    >
                      In Service
                    </span>
                    <span className="text-[10px] text-brand-teal font-medium">9:15 AM</span>
                  </div>

                  {/* Step 3: Finishing Up */}
                  <div
                    onClick={() => setGroomStep(3)}
                    className="relative z-10 flex flex-col items-center cursor-pointer"
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-medium shadow-2xs ${
                        groomStep >= 3
                          ? 'bg-brand-teal text-white ring-4 ring-brand-teal/20'
                          : 'bg-muted/40 border border-border text-muted-foreground/70'
                      }`}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <span
                      className={`text-[11px] font-medium mt-1.5 ${
                        groomStep >= 3 ? 'text-foreground font-semibold' : 'text-muted-foreground/70'
                      }`}
                    >
                      Finishing Up
                    </span>
                    <span className="text-[10px] text-muted-foreground/70">~10:15 AM</span>
                  </div>

                  {/* Step 4: Ready for Pickup */}
                  <div
                    onClick={() => setGroomStep(4)}
                    className="relative z-10 flex flex-col items-center cursor-pointer"
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-medium shadow-2xs ${
                        groomStep >= 4
                          ? 'bg-success text-white ring-4 ring-emerald-100'
                          : 'bg-muted/40 border border-border text-muted-foreground/70'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <span
                      className={`text-[11px] font-medium mt-1.5 ${
                        groomStep >= 4 ? 'text-success font-semibold' : 'text-muted-foreground/70'
                      }`}
                    >
                      Ready for Pickup
                    </span>
                    <span className="text-[10px] text-muted-foreground/70">~10:45 AM</span>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* ================= MIDDLE DASHBOARD ROW ================= */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6" data-purpose="pets-and-financials-section">
            {/* Left: My Pets Section (7 cols) */}
            <div className="xl:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm text-foreground">My Pets</h2>
                <button
                  onClick={() => setActiveTab('my-pets')}
                  className="text-[13px] font-semibold text-brand-teal hover:underline cursor-pointer"
                >
                  View all pets
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {/* Pet Card 1: Buddy */}
                <div className="bg-card border border-border rounded-xl p-4 shadow-2xs relative flex flex-col justify-between hover:shadow-md transition">
                  <div>
                    <div className="flex items-center gap-3">
                      <img
                        alt="Buddy"
                        className="w-12 h-12 rounded-full object-cover border border-warning/20"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuCe7RVDYL03WE6kJ8qQuoaa5Ze-R0GLqpxLEhbnAzawZZAU3LDzmKXg6Jgndy9gnsAWMnXirp84BzfzqYT8s5CuD85T0UdrM8KYW1l5wZlPrDNK8uNfF4H2iSkEHkwwq9MlupqlYBT0Hu21h9vkmoe3k06rjUJ2PLXE_JB9ZbcWrXABRW1qmWVoaPiD1vLymYipMyRHDWOQrNSkZaGUKYoiG3282MHHxl-yx-4JLidzcdExIIPvB87o"
                      />
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Buddy</h3>
                        <p className="text-[11px] text-muted-foreground">Golden Retriever</p>
                        <p className="text-[10px] text-muted-foreground/70">3 years old • 75 lbs</p>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-border space-y-1.5 text-[11px]">
                      <div>
                        <span className="text-muted-foreground/70 text-[10px] block">Rabies Vaccine</span>
                        <span className="font-medium text-success">Expires Apr 12, 2026</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground/70 text-[10px] block">Last Groom</span>
                        <span className="font-medium text-foreground">Apr 30, 2025</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pet Card 2: Luna */}
                <div className="bg-card border border-border rounded-xl p-4 shadow-2xs relative flex flex-col justify-between hover:shadow-md transition">
                  <div>
                    <div className="flex items-center gap-3">
                      <img
                        alt="Luna"
                        className="w-12 h-12 rounded-full object-cover border border-border"
                        src="https://lh3.googleusercontent.com/aida-public/AB6AXuBpk72KEUuNWxOVdW6BPYXrAupBoF6C9Gp4fjCY3k4Xqp9GQaolG65TkrfuCUOZjgxZ2gM01EhiiPTVvh6L662yMZXTizz1fptlSGDqP5qFWrNZVetE9kYVLf23nyyN6W7JXAwI0WLReM4VGzGRPt7ERX4EuUpEwuQj-S_h3Gef14EeeYVpC5yLSGX2bQ7vZ1qlbVBXt772irfc8BEXobZK5jztLfhb0qiCZ0wLcElrF_msDxuphMv9"
                      />
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">Luna</h3>
                        <p className="text-[11px] text-muted-foreground">Poodle</p>
                        <p className="text-[10px] text-muted-foreground/70">2 years old • 18 lbs</p>
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t border-border space-y-1.5 text-[11px]">
                      <div>
                        <span className="text-muted-foreground/70 text-[10px] block">Rabies Vaccine</span>
                        <span className="font-medium text-success">Expires Nov 8, 2025</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground/70 text-[10px] block">Last Groom</span>
                        <span className="font-medium text-foreground">May 5, 2025</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pet Card 3: Add New Pet */}
                <button
                  onClick={() => setShowAddPetModal(true)}
                  className="border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center text-muted-foreground hover:border-primary/30 hover:text-brand-teal hover:bg-primary/5/20 transition min-h-[160px] cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/5 text-brand-teal flex items-center justify-center mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="text-[13px] font-semibold">+ Add New Pet</span>
                </button>
              </div>
            </div>

            {/* Right: Financial & Payments (5 cols) */}
            <div className="xl:col-span-5 space-y-3.5">
              {/* Account Balance Card */}
              <div
                className="bg-card border border-border rounded-xl p-4 shadow-2xs flex items-center justify-between"
                data-purpose="account-balance-card"
              >
                <div>
                  <div className="flex items-center gap-4">
                    <span className="text-[13px] font-semibold text-muted-foreground">Current Balance</span>
                    <button
                      onClick={() => setActiveTab('my-invoices')}
                      className="text-[13px] font-semibold text-brand-teal hover:underline cursor-pointer"
                    >
                      View Invoices
                    </button>
                  </div>
                  <p className="text-2xl font-extrabold text-success mt-1">$0.00</p>
                  <p className="text-[13px] text-muted-foreground mt-0.5">You&apos;re all caught up! 🎉</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-primary/5 flex items-center justify-center text-brand-teal">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>

              {/* Payment Methods Card (Stripe-ready) */}
              <div
                className="bg-card border border-border rounded-xl p-4 shadow-2xs"
                data-purpose="payment-methods-card"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[13px] font-semibold text-foreground">Payment Methods</span>
                  <button
                    onClick={() => setActiveTab('payments-cards')}
                    className="text-[13px] font-semibold text-brand-teal hover:underline cursor-pointer"
                  >
                    Manage Cards
                  </button>
                </div>
                {/* Card item */}
                <div className="border border-border rounded-lg p-3 flex items-center justify-between bg-muted/40/50">
                  <div className="flex items-center gap-3">
                    <div className="bg-card px-2 py-1 rounded border border-border font-extrabold text-[11px] text-primary tracking-wider">
                      VISA
                    </div>
                    <div>
                      <span className="text-[13px] font-semibold text-foreground">•••• 4242</span>
                      <span className="text-[10px] text-muted-foreground/70 ml-2">Expires 08/27</span>
                    </div>
                  </div>
                  <span className="bg-success/10 text-success text-[10px] font-semibold px-2 py-0.5 rounded border border-success/20">
                    Default
                  </span>
                </div>
                {/* Add Payment Method Button */}
                <button
                  onClick={() => setShowAddPaymentModal(true)}
                  className="w-full mt-3 border border-dashed border-primary/20 rounded-lg py-2 text-[13px] font-semibold text-brand-teal hover:bg-primary/5/50 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Add Payment Method
                </button>
              </div>
            </div>
          </div>

          {/* ================= BOTTOM DASHBOARD ROW ================= */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6" data-purpose="appointments-and-promo">
            {/* Recent Appointments Table (8 cols) */}
            <div
              className="xl:col-span-8 bg-card border border-border rounded-xl p-5 shadow-2xs"
              data-purpose="recent-appointments-table"
            >
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <h3 className="font-semibold text-sm text-foreground">Recent Appointments</h3>
                <button
                  onClick={() => setActiveTab('appointments')}
                  className="text-[13px] font-semibold text-brand-teal hover:underline cursor-pointer"
                >
                  View all
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px] mt-3 whitespace-nowrap">
                  <thead>
                    <tr className="text-muted-foreground/70 text-[11px] border-b border-border font-medium">
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Service</th>
                      <th className="pb-2">Pet</th>
                      <th className="pb-2">Groomer</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {/* Row 1 */}
                    <tr className="hover:bg-muted/40/70">
                      <td className="py-3 font-medium text-foreground">May 5, 2025</td>
                      <td className="py-3 text-muted-foreground">Full Groom</td>
                      <td className="py-3 font-medium text-foreground">Charlie</td>
                      <td className="py-3 text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <img
                            alt="Sarah M."
                            className="w-4 h-4 rounded-full object-cover"
                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDdUCZ1Qa_o0d-lswZw---7mI8mtEsZ1JwIPcOlf04k_rqBHpCZC0oIWuBPv4Vx8P3rhi06gfele1FVqvSZ1yz1KITCGF5E5DehPRJr8OOhKC69Y1vmnWEATwBumfHoPh8yrwT9wAMVcjz8pmHrxhH-GtCfxvclbkPCsFVceKuZBxq4Gc2d8NRc1xIjiDFqqHiRowb49NH675QqmJ9Vhbijz7yHKzAO30FG9VJ5NyUDLd_XXhW2_uaz"
                          />
                          Sarah M.
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="bg-success/10 text-success text-[10px] font-semibold px-2 py-0.5 rounded border border-success/20">
                          Completed
                        </span>
                      </td>
                      <td className="py-3 text-right font-semibold text-foreground">$85.00</td>
                    </tr>
                    {/* Row 2 */}
                    <tr className="hover:bg-muted/40/70">
                      <td className="py-3 font-medium text-foreground">Apr 30, 2025</td>
                      <td className="py-3 text-muted-foreground">Deluxe Spa</td>
                      <td className="py-3 font-medium text-foreground">Buddy</td>
                      <td className="py-3 text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <img
                            alt="Mike R."
                            className="w-4 h-4 rounded-full object-cover"
                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCF6tScFiP6nbFGxFbAP6b5NSHKoboF-iQA6Jn53F580Oc8F542BrApBIVPfwm7K6-yLtdm3k_1v6Y4Abd2bMSQghaMT-HrWv2aRFbOXDWOyOxt7KS7R8PbJnGMv4HuSRPf18uA6b-8S6rzVFva2fFj4DPchq2aGxWP0n0QwoqAapyB0Hphltcwztx37mZmYUrGhmb3pipqsUOdFuVNHw4M4ev7meDAKVoySVWpeL6WfDdMOVql4x8v"
                          />
                          Mike R.
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="bg-success/10 text-success text-[10px] font-semibold px-2 py-0.5 rounded border border-success/20">
                          Completed
                        </span>
                      </td>
                      <td className="py-3 text-right font-semibold text-foreground">$95.00</td>
                    </tr>
                    {/* Row 3 */}
                    <tr className="hover:bg-muted/40/70">
                      <td className="py-3 font-medium text-foreground">Apr 15, 2025</td>
                      <td className="py-3 text-muted-foreground">Bath &amp; Brush</td>
                      <td className="py-3 font-medium text-foreground">Luna</td>
                      <td className="py-3 text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <img
                            alt="Sarah M."
                            className="w-4 h-4 rounded-full object-cover"
                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuAokygagsvjfI-ghT3hDP3jkxWJf7M8kSTT3cJ2TMhLWqQ-oKzD2k2Nn_JW0jnsyTnqFZ1a-V9mPqPL3O4bbtQvmfLy25_aS-duPFoSHuW6bvUqdkSUEUPI8_sqMGYirTGhxYuWAAPaBKJtQ5ySYhkml90aeuKlZXmBLmgxJvqqzmEHVt2USl5bxM_cc0_CkOMqnO0bAs3a8xmpvNoZ-ykRmiiUy9TcbybIknzNBa7Z7MskKEcwYNDP"
                          />
                          Sarah M.
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="bg-success/10 text-success text-[10px] font-semibold px-2 py-0.5 rounded border border-success/20">
                          Completed
                        </span>
                      </td>
                      <td className="py-3 text-right font-semibold text-foreground">$40.00</td>
                    </tr>
                    {/* Row 4 */}
                    <tr className="hover:bg-muted/40/70">
                      <td className="py-3 font-medium text-foreground">Apr 2, 2025</td>
                      <td className="py-3 text-muted-foreground">Full Groom + Add-ons</td>
                      <td className="py-3 font-medium text-foreground">Buddy</td>
                      <td className="py-3 text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <img
                            alt="Mike R."
                            className="w-4 h-4 rounded-full object-cover"
                            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDNdBuRxXQQEOe554T4Sf7q6SaucwGSaBxPYX1b5WYV51-e28_sCXs1F5TFmJ5YbTyZUZE4_8dCoN4yJ-PpDrhNr4ve5zztSASoJcpiySrLUIw1itCYcwDm4Nvhd1-wM9XGXzTiLrvNnkUTogRARglYhiqFPTxiW3UpUm0g8cJU9fK4Kb-9P3nnly2vkv6ZJoxCISliP51mhMFqPEc37SbHLUjhZ5VbmeaHzcyiEOk8UDYIWf8D6_Ze"
                          />
                          Mike R.
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="bg-success/10 text-success text-[10px] font-semibold px-2 py-0.5 rounded border border-success/20">
                          Completed
                        </span>
                      </td>
                      <td className="py-3 text-right font-semibold text-foreground">$100.00</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Refer a Friend Promo Card (4 cols) */}
            <div
              className="xl:col-span-4 bg-card border border-border rounded-xl p-6 shadow-2xs flex flex-col items-center justify-center text-center"
              data-purpose="referral-banner"
            >
              <div className="w-14 h-14 rounded-full bg-primary/5 text-brand-teal flex items-center justify-center mb-3">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path d="M12 8v13m0-13V4a2 2 0 112 2h-2zm0 0V4a2 2 0 10-2 2h2zm-7 4h14v10a1 1 0 01-1 1H6a1 1 0 01-1-1V12zm0 0H3.5A1.5 1.5 0 012 10.5v-1A1.5 1.5 0 013.5 8H5m14 4h1.5a1.5 1.5 0 001.5-1.5v-1A1.5 1.5 0 0020.5 8H19" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h3 className="font-extrabold text-base text-foreground leading-snug">Refer a Friend, Get Rewarded!</h3>
              <p className="text-[13px] text-muted-foreground mt-2 max-w-xs leading-relaxed">
                Refer a friend and you&apos;ll both get <span className="font-semibold text-foreground">$20 off</span> your next service.
              </p>
              <button
                onClick={() => setReferralModal(true)}
                className="mt-5 w-full bg-brand-teal hover:bg-primary text-white font-semibold text-[13px] py-2.5 rounded-lg shadow-2xs transition cursor-pointer"
              >
                Refer Now
              </button>
            </div>
          </div>

          {/* ================= QUICK LINKS FOOTER ROW ================= */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2" data-purpose="quick-access-cards">
            {/* Card 1: Online Booking */}
            <div
              onClick={() => setActiveTab('book-appointment')}
              className="bg-card border border-border rounded-xl p-4 flex items-start gap-3.5 shadow-2xs hover:border-primary/20 transition cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/5 text-brand-teal flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h4 className="text-[13px] font-semibold text-foreground">Easy Online Booking</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">Book appointments 24/7 at your convenience.</p>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-teal mt-2">
                  Book Now <span>→</span>
                </span>
              </div>
            </div>

            {/* Card 2: VIP Rewards */}
            <div
              onClick={() => setActiveTab('rewards')}
              className="bg-card border border-border rounded-xl p-4 flex items-start gap-3.5 shadow-2xs hover:border-primary/20 transition cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/5 text-brand-teal flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h4 className="text-[13px] font-semibold text-foreground">VIP Rewards</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">Earn points with every visit and unlock special perks.</p>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-teal mt-2">
                  View Rewards <span>→</span>
                </span>
              </div>
            </div>

            {/* Card 3: Need Help */}
            <div
              onClick={() => setShowMessageModal(true)}
              className="bg-card border border-border rounded-xl p-4 flex items-start gap-3.5 shadow-2xs hover:border-primary/20 transition cursor-pointer"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/5 text-brand-teal flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h4 className="text-[13px] font-semibold text-foreground">Need Help?</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">We&apos;re here for you and your pups!</p>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-teal mt-2">
                  Contact Us <span>→</span>
                </span>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ================= MODALS ================= */}
      {/* 1. Add Pet Modal */}
      {showAddPetModal && (
        <div className="fixed inset-0 z-50 bg-card/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-semibold text-foreground text-sm">Add New Pet</h3>
              <button
                onClick={() => setShowAddPetModal(false)}
                className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                alert('Pet profile created! Our salon concierge will review vaccination records.');
                setShowAddPetModal(false);
              }}
              className="space-y-3 text-[13px]"
            >
              <div>
                <label className="font-semibold text-foreground block mb-1">Pet Name</label>
                <input
                  required
                  placeholder="e.g. Milo"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-primary"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-foreground block mb-1">Breed</label>
                  <input
                    required
                    placeholder="e.g. Goldendoodle"
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="font-semibold text-foreground block mb-1">Weight (lbs)</label>
                  <input
                    placeholder="e.g. 25"
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-foreground block mb-1">Rabies Expiration Date</label>
                <input
                  type="date"
                  defaultValue="2026-06-30"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-primary"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddPetModal(false)}
                  className="px-4 py-2 border border-border text-muted-foreground rounded-lg font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-teal text-white rounded-lg font-semibold hover:bg-primary cursor-pointer"
                >
                  Save Pet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Add Payment Modal (Stripe Ready) */}
      {showAddPaymentModal && (
        <div className="fixed inset-0 z-50 bg-card/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground text-sm">Add Payment Method</span>
                <span className="text-[10px] bg-muted/40 text-muted-foreground px-2 py-0.5 rounded tabular-nums font-semibold">
                  Powered by Stripe
                </span>
              </div>
              <button
                onClick={() => setShowAddPaymentModal(false)}
                className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                alert('Card on file updated securely via Stripe tokenization.');
                setShowAddPaymentModal(false);
              }}
              className="space-y-3 text-[13px]"
            >
              <div>
                <label className="font-semibold text-foreground block mb-1">Cardholder Name</label>
                <input
                  required
                  defaultValue="Sarah Johnson"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="font-semibold text-foreground block mb-1">Card Number</label>
                <input
                  required
                  placeholder="4242 •••• •••• 4242"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-primary tabular-nums"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-foreground block mb-1">Expires (MM/YY)</label>
                  <input
                    placeholder="12/28"
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-primary tabular-nums"
                  />
                </div>
                <div>
                  <label className="font-semibold text-foreground block mb-1">CVC</label>
                  <input
                    placeholder="•••"
                    className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-primary tabular-nums"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground/70">
                🔒 Your card info is encrypted and tokenized directly with Stripe.
              </p>
              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddPaymentModal(false)}
                  className="px-4 py-2 border border-border text-muted-foreground rounded-lg font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-teal text-white rounded-lg font-semibold hover:bg-primary cursor-pointer"
                >
                  Save Card
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Send Message Modal */}
      {showMessageModal && (
        <div className="fixed inset-0 z-50 bg-card/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-semibold text-foreground text-sm">Send Message to UnSaid Memories</h3>
              <button
                onClick={() => setShowMessageModal(false)}
                className="text-muted-foreground/70 hover:text-muted-foreground p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-[13px]">
              <div>
                <label className="font-semibold text-foreground block mb-1">Subject / Grooming Query</label>
                <input
                  defaultValue="Special instructions for Charlie's next appointment"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="font-semibold text-foreground block mb-1">Message</label>
                <textarea
                  rows={4}
                  placeholder="Type your message here..."
                  defaultValue="Hi Sarah M., please take extra care around Charlie's right ear today. Thanks!"
                  className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:border-primary"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-border">
                <button
                  onClick={() => setShowMessageModal(false)}
                  className="px-4 py-2 border border-border text-muted-foreground rounded-lg font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    alert('Message sent to salon reception and groomer station!');
                    setShowMessageModal(false);
                  }}
                  className="px-4 py-2 bg-brand-teal text-white rounded-lg font-semibold hover:bg-primary cursor-pointer"
                >
                  Send Message
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Referral Modal */}
      {referralModal && (
        <div className="fixed inset-0 z-50 bg-card/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-center animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-primary/5 text-brand-teal flex items-center justify-center mx-auto">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M12 8v13m0-13V4a2 2 0 112 2h-2zm0 0V4a2 2 0 10-2 2h2zm-7 4h14v10a1 1 0 01-1 1H6a1 1 0 01-1-1V12zm0 0H3.5A1.5 1.5 0 012 10.5v-1A1.5 1.5 0 013.5 8H5m14 4h1.5a1.5 1.5 0 001.5-1.5v-1A1.5 1.5 0 0020.5 8H19" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-extrabold text-foreground">Your Personal Referral Link</h3>
              <p className="text-[13px] text-muted-foreground mt-1">
                Share this link with friends. When they book their first groom, you both get $20!
              </p>
            </div>
            <div className="flex items-center gap-2 bg-muted/40 p-2.5 rounded-xl border border-border">
              <input
                readOnly
                value="https://unsaidmemories.com/refer/sarah-j"
                className="bg-transparent text-[13px] text-foreground tabular-nums flex-1 focus:outline-none"
              />
              <button
                onClick={() => {
                  setReferralCopied(true);
                  setTimeout(() => setReferralCopied(false), 2000);
                }}
                className="px-3 py-1.5 bg-brand-teal text-white text-[13px] font-semibold rounded-lg hover:bg-primary transition cursor-pointer"
              >
                {referralCopied ? 'Copied! ✓' : 'Copy'}
              </button>
            </div>
            <div className="pt-2">
              <button
                onClick={() => setReferralModal(false)}
                className="w-full py-2 border border-border text-muted-foreground rounded-lg text-[13px] font-semibold hover:bg-muted/40 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
