"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader, Button, FormField } from "@/components/ads/ui";

/* ═══════════════════════════════════════════════════════════
   Account Setup Wizard /ads/setup [W]
   
   Spec steps:
   1. What describes your intent? (I want to work with artists / I want to grow my business)
   2. Advertiser or Agency?
   3. Business Information (Name, Industry, Country/Region, Website)
   4. Advertiser Account Information (Account Name, Time Zone, Currency)
   5. Business Verification (Start Verification, Verify Business to Engage Creators, Verify Business to Review Analytics, Verify Business to Make Creator Payments)
   6. Invite Members (Active Members, Pending Members, Removed Members, Search Members, Invite Member)
   ═══════════════════════════════════════════════════════════ */

const STEPS = [
  "What describes your intent?",
  "Advertiser or Agency?",
  "Business Information",
  "Advertiser Account Information",
  "Business Verification",
  "Invite Members",
];

export default function SetupPage() {
  const [step, setStep] = useState(0);

  // Step 1 state
  const [intent, setIntent] = useState<"artists" | "business">("business");

  // Step 2 state
  const [accountType, setAccountType] = useState<"advertiser" | "agency">("advertiser");

  // Step 3 state
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [website, setWebsite] = useState("");

  // Step 4 state
  const [accountName, setAccountName] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [currency, setCurrency] = useState("USD");

  // Step 5 state
  const [verifyCreators, setVerifyCreators] = useState(false);
  const [verifyAnalytics, setVerifyAnalytics] = useState(false);
  const [verifyPayments, setVerifyPayments] = useState(false);

  // Step 6 state
  const [members, setMembers] = useState<{ id?: string; email: string; status: "active" | "pending" | "removed" }[]>([]);
  const loadTeam = () => {
    fetch("/api/ads/team").then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d) => setMembers((d.members ?? []).map((m: any) => ({
        id: m.id,
        email: m.invited_email ?? m.user_id ?? m.id,
        status: (m.status === "removed" ? "removed" : m.status === "active" ? "active" : "pending") as "active" | "pending" | "removed",
      })))).catch(() => {});
  };
  useEffect(loadTeam, []);
  const [inviteEmail, setInviteEmail] = useState("");
  const [memberFilter, setMemberFilter] = useState<"active" | "pending" | "removed" | "all">("all");
  const [memberSearch, setMemberSearch] = useState("");

  const addMember = () => {
    if (!inviteEmail || members.find((m) => m.email === inviteEmail)) return;
    fetch("/api/ads/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: inviteEmail, role: "editor" }) })
      .then((r) => { if (r.ok) { setInviteEmail(""); loadTeam(); } })
      .catch(() => {});
  };

  const removeMember = (email: string) => {
    const m = members.find((x) => x.email === email);
    if (!m?.id) return;
    fetch(`/api/ads/team?id=${m.id}`, { method: "DELETE" }).then(() => loadTeam()).catch(() => {});
  };

  const filteredMembers = members
    .filter((m) => memberFilter === "all" || m.status === memberFilter)
    .filter((m) => !memberSearch || m.email.toLowerCase().includes(memberSearch.toLowerCase()));

  return (
    <div className="mx-auto max-w-3xl p-6">
      <PageHeader
        title="Account Setup"
        description={`Step ${step + 1} of 6 — ${STEPS[step]}`}
        breadcrumbs={[{ label: "Ad Center", href: "/ads" }, { label: "Setup" }]}
      />

      {/* Progress bar */}
      <div className="mb-8 flex items-center gap-1">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
              i === step ? "bg-[#f2eafe] text-[#6942c2]" : i < step ? "bg-emerald-500 text-white" : "bg-neutral-100 text-neutral-400"
            }`}>
              {i < step ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              ) : (
                i + 1
              )}
            </div>
            {i < STEPS.length - 1 && <div className={`h-0.5 w-8 ${i < step ? "bg-emerald-500" : "bg-neutral-100"}`} />}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-neutral-100 bg-white p-6">
        {/* ─── Step 1: What describes your intent? ─── */}
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">What describes your intent?</h2>
              <p className="mt-1 text-sm text-neutral-500">Choose the option that best describes why you are setting up this account.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <button
                onClick={() => setIntent("artists")}
                className={`rounded-xl border-2 p-6 text-left transition-all ${intent === "artists" ? "border-neutral-900 bg-neutral-50" : "border-neutral-100 hover:border-neutral-200"}`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600">
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-neutral-900">I want to work with artists</h3>
                <p className="mt-1 text-xs text-neutral-500">Collaborate with creators, manage partnerships, and build artist relationships.</p>
              </button>
              <button
                onClick={() => setIntent("business")}
                className={`rounded-xl border-2 p-6 text-left transition-all ${intent === "business" ? "border-neutral-900 bg-neutral-50" : "border-neutral-100 hover:border-neutral-200"}`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                  </svg>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-neutral-900">I want to grow my business</h3>
                <p className="mt-1 text-xs text-neutral-500">Run advertising campaigns, reach new customers, and drive sales.</p>
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 2: Advertiser or Agency? ─── */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Advertiser or Agency?</h2>
              <p className="mt-1 text-sm text-neutral-500">Select how you will use this advertising account.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <button
                onClick={() => setAccountType("advertiser")}
                className={`rounded-xl border-2 p-6 text-left transition-all ${accountType === "advertiser" ? "border-neutral-900 bg-neutral-50" : "border-neutral-100 hover:border-neutral-200"}`}
              >
                <h3 className="text-sm font-semibold text-neutral-900">Advertiser</h3>
                <p className="mt-2 text-xs text-neutral-500">Run ads for your own business. You manage campaigns, creatives, and billing directly.</p>
              </button>
              <button
                onClick={() => setAccountType("agency")}
                className={`rounded-xl border-2 p-6 text-left transition-all ${accountType === "agency" ? "border-neutral-900 bg-neutral-50" : "border-neutral-100 hover:border-neutral-200"}`}
              >
                <h3 className="text-sm font-semibold text-neutral-900">Agency</h3>
                <p className="mt-2 text-xs text-neutral-500">Manage ads for multiple clients. Access cross-client reporting and agency billing features.</p>
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 3: Business Information ─── */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-neutral-900">Business Information</h2>
            <FormField label="Business Name">
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Your company name"
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
              />
            </FormField>
            <FormField label="Industry">
              <select
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none"
              >
                <option value="">Select industry…</option>
                <option>Music & Entertainment</option>
                <option>Technology</option>
                <option>Retail & E-commerce</option>
                <option>Financial Services</option>
                <option>Healthcare</option>
                <option>Education</option>
                <option>Food & Beverage</option>
                <option>Fashion & Beauty</option>
                <option>Travel & Hospitality</option>
                <option>Other</option>
              </select>
            </FormField>
            <FormField label="Country / Region">
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none"
              >
                <option value="">Select country…</option>
                <option>United States</option>
                <option>Canada</option>
                <option>United Kingdom</option>
                <option>Australia</option>
                <option>Germany</option>
                <option>France</option>
                <option>Japan</option>
                <option>Brazil</option>
                <option>India</option>
                <option>Other</option>
              </select>
            </FormField>
            <FormField label="Website">
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://yourcompany.com"
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
              />
            </FormField>
          </div>
        )}

        {/* ─── Step 4: Advertiser Account Information ─── */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-neutral-900">Advertiser Account Information</h2>
            <p className="text-sm text-neutral-500">Set up your advertiser account defaults. These can be changed later in account settings.</p>
            <FormField label="Account Name">
              <input
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder={businessName || "My Ad Account"}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
              />
            </FormField>
            <FormField label="Time Zone">
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none"
              >
                <option value="America/New_York">Eastern Time (US & Canada)</option>
                <option value="America/Chicago">Central Time (US & Canada)</option>
                <option value="America/Denver">Mountain Time (US & Canada)</option>
                <option value="America/Los_Angeles">Pacific Time (US & Canada)</option>
                <option value="Europe/London">London (GMT)</option>
                <option value="Europe/Berlin">Central European Time</option>
                <option value="Asia/Tokyo">Japan (JST)</option>
                <option value="Australia/Sydney">Sydney (AEST)</option>
                <option value="UTC">UTC</option>
              </select>
            </FormField>
            <FormField label="Currency">
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none"
              >
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
                <option value="GBP">GBP — British Pound</option>
                <option value="CAD">CAD — Canadian Dollar</option>
                <option value="AUD">AUD — Australian Dollar</option>
                <option value="JPY">JPY — Japanese Yen</option>
                <option value="BRL">BRL — Brazilian Real</option>
                <option value="INR">INR — Indian Rupee</option>
              </select>
            </FormField>
          </div>
        )}

        {/* ─── Step 5: Business Verification ─── */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Business Verification</h2>
              <p className="mt-1 text-sm text-neutral-500">Verify your business to unlock full platform capabilities. You can complete verification now or skip and do it later from account settings.</p>
            </div>

            {/* Start Verification CTA */}
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900">Start Verification</h3>
                  <p className="mt-1 text-xs text-neutral-500">Submit your business documents for verification. Typically takes 1–3 business days.</p>
                </div>
                <Button variant="secondary">Start Verification</Button>
              </div>
            </div>

            {/* Verification capabilities */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Verification enables:</p>

              <label className="flex items-start gap-3 rounded-xl border border-neutral-100 p-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={verifyCreators}
                  onChange={(e) => setVerifyCreators(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-neutral-300"
                />
                <div>
                  <h4 className="text-sm font-medium text-neutral-900">Verify Business to Engage Creators</h4>
                  <p className="mt-0.5 text-xs text-neutral-500">Required to collaborate with creators through Creative Partnerships and manage direct creator relationships.</p>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-neutral-100 p-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={verifyAnalytics}
                  onChange={(e) => setVerifyAnalytics(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-neutral-300"
                />
                <div>
                  <h4 className="text-sm font-medium text-neutral-900">Verify Business to Review Analytics</h4>
                  <p className="mt-0.5 text-xs text-neutral-500">Required to access detailed audience insights, attribution analytics, and third-party measurement data.</p>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-xl border border-neutral-100 p-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={verifyPayments}
                  onChange={(e) => setVerifyPayments(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-neutral-300"
                />
                <div>
                  <h4 className="text-sm font-medium text-neutral-900">Verify Business to Make Creator Payments</h4>
                  <p className="mt-0.5 text-xs text-neutral-500">Required to process payments to creators for collaborations, sponsorships, and partnership agreements.</p>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* ─── Step 6: Invite Members ─── */}
        {step === 5 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Invite Members</h2>
              <p className="mt-1 text-sm text-neutral-500">Add team members to help manage your advertising account. You can assign roles and permissions later.</p>
            </div>

            {/* Search + Invite */}
            <div className="flex gap-2">
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Enter email to invite…"
                className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
              />
              <Button onClick={addMember} disabled={!inviteEmail}>Invite Member</Button>
            </div>

            {/* Member filter tabs */}
            <div className="flex gap-1 border-b border-neutral-200">
              {(["all", "active", "pending", "removed"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setMemberFilter(f)}
                  className={`px-3 py-2 text-xs font-medium capitalize transition-colors ${
                    memberFilter === f ? "border-b-2 border-neutral-900 text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
                  }`}
                >
                  {f} ({members.filter((m) => f === "all" || m.status === f).length})
                </button>
              ))}
            </div>

            {/* Search members */}
            <input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder="Search members…"
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
            />

            {/* Member list */}
            <div className="space-y-1.5">
              {filteredMembers.length === 0 && (
                <div className="rounded-lg border border-neutral-100 p-4 text-center text-sm text-neutral-400">
                  No members found
                </div>
              )}
              {filteredMembers.map((member) => (
                <div key={member.email} className="flex items-center justify-between rounded-lg border border-neutral-100 px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-600">
                      {member.email[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm text-neutral-900">{member.email}</p>
                      <p className="text-xs text-neutral-500 capitalize">{member.status}</p>
                    </div>
                  </div>
                  {member.status !== "removed" && (
                    <button
                      onClick={() => removeMember(member.email)}
                      className="text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                  {member.status === "removed" && (
                    <span className="text-xs text-neutral-400">Removed</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>Back</Button>
        <div className="flex items-center gap-3">
          {step < STEPS.length - 1 ? (
            <>
              <Link href="/ads/dashboard" className="text-sm text-neutral-500 hover:text-neutral-700">Skip for now</Link>
              <Button onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))}>Continue</Button>
            </>
          ) : (
            <Button onClick={() => {
              const finish = async () => {
                const display = accountName.trim() || businessName.trim();
                if (display) await fetch("/api/ads/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ display_name: display }) }).catch(() => {});
                const gen = await fetch("/api/ads/settings?kind=general").then((r) => (r.ok ? r.json() : null)).catch(() => null);
                await fetch("/api/ads/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "general", settings: { ...(gen?.settings ?? {}), timezone, currency } }) }).catch(() => {});
                if (businessName.trim()) await fetch("/api/ads/verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ business_name: businessName.trim(), website: website.trim(), kind: accountType, notes: [industry, country].filter(Boolean).join(" · ") }) }).catch(() => {});
                window.location.href = "/ads/dashboard";
              };
              void finish();
            }}>Complete Setup</Button>
          )}
        </div>
      </div>
    </div>
  );
}
