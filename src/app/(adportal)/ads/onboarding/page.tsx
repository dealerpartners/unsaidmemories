"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, FormField } from "@/components/ads/ui";

const steps = ["Intent", "Organization", "Business Info", "Account", "Verification", "Invite Members"];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const router = useRouter();
  const [intent, setIntent] = useState("");
  const [bizName, setBizName] = useState("");
  const [website, setWebsite] = useState("");
  const [acctName, setAcctName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [inviteNote, setInviteNote] = useState("");
  const [orgType, setOrgType] = useState("");

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 text-center">
        <img src="/logo.svg" alt="Unsaid" className="mx-auto h-10 w-auto object-contain" />
        <h1 className="mt-4 text-2xl font-bold text-neutral-900">Set up your Ad Center</h1>
        <p className="mt-1 text-sm text-neutral-500">Step {step + 1} of {steps.length}</p>
      </div>

      <div className="mb-8 flex gap-1">
        {steps.map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-neutral-900" : "bg-neutral-200"}`} />
        ))}
      </div>

      {step === 0 && (
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">What do you want to do?</h2>
          <div className="space-y-3">
            {["Work with artists", "Grow my business"].map((opt) => (
              <button key={opt} onClick={() => setIntent(opt)} className={`w-full rounded-xl border p-4 text-left text-sm transition-colors ${intent === opt ? "border-neutral-900 bg-neutral-50 font-medium" : "border-neutral-200 hover:border-neutral-300"}`}>{opt}</button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">Organization type</h2>
          <div className="space-y-3">
            {["Advertiser", "Agency"].map((opt) => (
              <button key={opt} onClick={() => setOrgType(opt)} className={`w-full rounded-xl border p-4 text-left text-sm transition-colors ${orgType === opt ? "border-neutral-900 bg-neutral-50 font-medium" : "border-neutral-200 hover:border-neutral-300"}`}>{opt}</button>
            ))}
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">Business information</h2>
          <div className="space-y-4">
            <FormField label="Business name"><input value={bizName} onChange={(e) => setBizName(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm text-neutral-900" /></FormField>
            <FormField label="Industry"><select className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm text-neutral-900"><option>Music &amp; Entertainment</option><option>Technology</option><option>Retail</option></select></FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Country"><input defaultValue="United States" className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm text-neutral-900" /></FormField>
              <FormField label="Website"><input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm text-neutral-900" /></FormField>
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">Advertiser account</h2>
          <div className="space-y-4">
            <FormField label="Account name"><input value={acctName} onChange={(e) => setAcctName(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm text-neutral-900" /></FormField>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Time zone"><select className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm text-neutral-900"><option>America/Chicago</option><option>America/New_York</option><option>America/Los_Angeles</option></select></FormField>
              <FormField label="Currency"><select className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm text-neutral-900"><option>USD</option><option>EUR</option><option>GBP</option></select></FormField>
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">Business verification</h2>
          <p className="text-sm text-neutral-500 mb-4">Verification enables full ad delivery and payment features.</p>
          <div className="space-y-3">
            {["Start verification", "Creator engagement eligibility", "Analytics eligibility", "Creator payment eligibility"].map((item) => (
              <div key={item} className="rounded-xl border border-neutral-200 p-4"><h3 className="text-sm font-medium text-neutral-900">{item}</h3></div>
            ))}
          </div>
        </div>
      )}

      {step === 5 && (
        <div>
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">Invite team members</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Email"><input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="colleague@company.com" className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm text-neutral-900" /></FormField>
              <FormField label="Role"><select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm text-neutral-900"><option value="admin">Admin</option><option value="editor">Editor</option><option value="viewer">Viewer</option></select></FormField>
            </div>
            <button onClick={() => {
              if (!inviteEmail.trim()) return;
              fetch("/api/ads/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }) })
                .then((r) => { setInviteNote(r.ok ? `Invited ${inviteEmail.trim()}.` : "Couldn't send that invite."); if (r.ok) setInviteEmail(""); })
                .catch(() => setInviteNote("Couldn't send that invite."));
            }} className="text-sm font-medium text-neutral-600">+ Invite this member</button>
            {inviteNote && <p className="text-sm text-neutral-600">{inviteNote}</p>}
          </div>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <button onClick={() => step > 0 && setStep(step - 1)} className={`text-sm font-medium ${step > 0 ? "text-neutral-700" : "text-neutral-300"}`} disabled={step === 0}>Back</button>
        {step < steps.length - 1 ? (
          <Button onClick={() => setStep(step + 1)}>Continue</Button>
        ) : (
          <Button onClick={async () => {
            const display = acctName.trim() || bizName.trim();
            if (display) await fetch("/api/ads/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ display_name: display }) }).catch(() => {});
            if (bizName.trim()) await fetch("/api/ads/verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ business_name: bizName.trim(), website: website.trim(), kind: orgType || "advertiser" }) }).catch(() => {});
            router.push("/ads");
          }}>Go to Ad Center</Button>
        )}
      </div>
    </div>
  );
}
