"use client";

import { useState } from "react";
import { Mail, Check, Send } from "lucide-react";

/**
 * §0.8 Party Self-Completion — create the stub, invite the party.
 * QB evidence: §R — create the stub (Name + Email), invite the party;
 * they complete their own sensitive data (W-9) in their own account.
 * The business never types another party's SSN.
 *
 * Usage:
 *   <PartyStub
 *     onCreate={(name, email) => console.log(name, email)}
 *     inviteUrl="/invite/[token]"
 *   />
 */

export function PartyStub({
  onCreate,
  inviteLabel = "Invite to complete their profile",
  noun = "vendor",
}: {
  onCreate?: (name: string, email: string) => void;
  inviteLabel?: string;
  noun?: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [created, setCreated] = useState(false);

  function handleCreate() {
    if (name.trim() && email.trim()) {
      onCreate?.(name.trim(), email.trim());
      setCreated(true);
    }
  }

  if (created) {
    return (
      <div className="adm-card" style={{ padding: 24, textAlign: "center" }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--accent, #f0fafa)", color: "var(--primary, #007c7d)", display: "grid", placeItems: "center", margin: "0 auto 12px" }}>
          <Check size={20} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground, #171717)" }}>
          {name} created
        </div>
        <p style={{ fontSize: 12, color: "var(--muted-foreground, #706d7c)", margin: "8px 0 16px" }}>
          We sent an invitation to {email}. They&rsquo;ll complete their own {noun} details (W-9, banking, address) in their own account — you never handle their sensitive data.
        </p>
        <button onClick={() => { setCreated(false); setName(""); setEmail(""); }} className="adm-btn" style={{ fontSize: 11 }}>
          Create another {noun}
        </button>
      </div>
    );
  }

  return (
    <div className="adm-card" style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <Mail size={16} style={{ color: "var(--primary, #007c7d)" }} />
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "var(--foreground, #171717)" }}>
          New {noun} — stub + invite
        </h3>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground, #706d7c)", display: "block", marginBottom: 4 }}>
            {noun} name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`e.g. Acme Supplies`}
            style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border, #e5e5e5)", borderRadius: 8, fontSize: 13, outline: "none" }}
          />
        </div>
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground, #706d7c)", display: "block", marginBottom: 4 }}>
            Email
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="contact@acmesupplies.com"
            style={{ width: "100%", padding: "10px 14px", border: "1px solid var(--border, #e5e5e5)", borderRadius: 8, fontSize: 13, outline: "none" }}
          />
        </div>
        <button onClick={handleCreate} className="adm-btn adm-btn-primary" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
          <Send size={12} /> {inviteLabel}
        </button>
      </div>
    </div>
  );
}
