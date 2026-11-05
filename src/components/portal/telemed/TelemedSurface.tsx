"use client";

import { useCallback, useEffect, useState } from "react";
// lib/telemed/surfaces.ts is not in this build — the registry types and
// the slug resolver live here, fail-closed: an unknown slug renders null.
export interface TelemedColumnDef {
  key: string;
  label: string;
}

export interface TelemedSurfaceDef {
  table: string;
  title: string;
  description: string;
  columns: TelemedColumnDef[];
}

export interface TelemedSectionDef {
  slug: string;
  label: string;
  blurb: string;
  surfaces: TelemedSurfaceDef[];
}

const TELEMED_SECTIONS: TelemedSectionDef[] = [];

export function telemedSection(slug: string): TelemedSectionDef | null {
  return TELEMED_SECTIONS.find((s) => s.slug === slug) ?? null;
}

// ============================================================================
// TelemedSurface — one working surface of the telemedicine portal,
// shaped by the registry (lib/telemed/surfaces.ts) and READ LIVE from
// /api/telemed/workbench (role-scoped queries over the clinical
// tables — see lib/telemedicine/workbench.ts). What renders is what
// the database holds for the signed-in vet / pharmacy / admin: real
// rows, or an honest empty state that says so. Row actions ride the
// same surfaces (claim / start / SOAP / video / complete on sessions,
// respond on leads) and call the §2/§3 action APIs.
// ============================================================================

interface WorkbenchRow {
  id: string | null;
  actions: string[];
  cells: Record<string, string>;
}

const EMPTY_TEXT: Record<string, string> = {
  consultation_sessions: "No consults here yet.",
  telemed_session_assignments: "No assignments have been recorded yet.",
  triage_sessions: "No triage intakes have been received yet.",
  vet_knowledge_base: "No knowledge-base documents yet.",
  triage_rate_limits: "No triage requests have been rate-limit recorded yet.",
  prescriptions: "No prescriptions yet.",
  pharmacy_profiles: "No pharmacy profile is on file yet.",
  pharmacy_partner_applications: "No partner applications yet.",
  pharmacy_audit_log: "No audited pharmacy actions yet.",
  telemed_referrals: "No case referrals yet.",
  vet_lead_deliveries: "No referral leads have been sent to you yet. When a pet owner in one of your referral states asks for a veterinarian, their lead will arrive here.",
  vet_referrals: "The referral directory is empty.",
  virtual_vcprs: "No virtual VCPRs have been established yet.",
  vet_shifts: "No shifts have been scheduled yet.",
  veterinarians: "No veterinarian registry record yet.",
  veterinarian_licenses: "No state licenses on file yet.",
  state_vcpr_rules: "No state rules are loaded.",
  vet_partner_applications: "No partner applications yet.",
  telemed_quality_flags: "No quality flags — nothing is raised against this account.",
  vet_leads: "No leads have been routed yet.",
  telemed_insurance_claims: "No insurance claims have been filed yet.",
  telemed_incidents: "No incident reports yet.",
  consultation_payments: "No session payments yet.",
  vet_profiles: "No portal profile is on file yet.",
};

async function postJson(url: string, body?: unknown): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return res
    .json()
    .catch(() => ({ ok: false, error: "Something went wrong. Please try again." }));
}

export function TelemedSurface({
  section,
  surface,
}: {
  section: string;
  surface: TelemedSurfaceDef;
}) {
  const [rows, setRows] = useState<WorkbenchRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [soapFor, setSoapFor] = useState<string | null>(null);
  const [leadFor, setLeadFor] = useState<string | null>(null);
  const [referralFor, setReferralFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/telemed/workbench?section=${encodeURIComponent(section)}&table=${encodeURIComponent(surface.table)}`,
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setLoadError(json?.error || "This surface couldn't be loaded. Please try again.");
        setRows([]);
        return;
      }
      setRows(json.rows as WorkbenchRow[]);
      setLoadError(null);
    } catch {
      setLoadError("This surface couldn't be loaded. Please try again.");
      setRows([]);
    }
  }, [section, surface.table]);

  useEffect(() => {
    load();
  }, [load]);

  const hasActions = (rows ?? []).some((r) => r.actions.length > 0);
  const colSpan = surface.columns.length + (hasActions ? 1 : 0);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{surface.title}</h3>
          <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            {surface.description}
          </p>
        </div>
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {rows === null
            ? "Loading…"
            : rows.length === 0
              ? "No records"
              : `${rows.length} record${rows.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {notice ? (
        <div className="border-b border-border bg-amber-50 px-4 py-2 text-xs text-amber-900">
          {notice}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              {surface.columns.map((c) => (
                <th
                  key={c.key}
                  className="px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {c.label}
                </th>
              ))}
              {hasActions ? (
                <th className="px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Actions
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-6 text-center text-xs text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : loadError ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-6 text-center text-xs text-red-700">
                  {loadError}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-6 text-center text-xs text-muted-foreground">
                  {EMPTY_TEXT[surface.table] ?? "No records yet."}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={row.id ?? i} className="border-b border-border/60 last:border-0">
                  {surface.columns.map((c) => (
                    <td
                      key={c.key}
                      className="max-w-[260px] truncate px-4 py-2 text-[13px] text-foreground"
                    >
                      {row.cells[c.key] ?? "—"}
                    </td>
                  ))}
                  {hasActions ? (
                    <td className="px-4 py-2">
                      <RowActions
                        row={row}
                        onNotice={setNotice}
                        onDone={load}
                        onSoap={(id) => setSoapFor((cur) => (cur === id ? null : id))}
                        onLead={(id) => setLeadFor((cur) => (cur === id ? null : id))}
                        onReferral={(id) => setReferralFor((cur) => (cur === id ? null : id))}
                      />
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {soapFor ? (
        <SoapEditor
          sessionId={soapFor}
          onClose={() => setSoapFor(null)}
          onSaved={() => {
            setNotice("SOAP record saved.");
            load();
          }}
        />
      ) : null}
      {leadFor ? (
        <LeadRespond
          leadId={leadFor}
          onClose={() => setLeadFor(null)}
          onSent={() => {
            setLeadFor(null);
            setNotice("Your response was recorded on the lead.");
            load();
          }}
        />
      ) : null}
      {referralFor ? (
        <LeadRespond
          leadId={referralFor}
          endpoint={`/api/telemed/referral-inbox/${referralFor}/respond`}
          heading="Respond to this referral"
          onClose={() => setReferralFor(null)}
          onSent={() => {
            setReferralFor(null);
            setNotice("Your response was sent to the pet owner and recorded on the referral.");
            load();
          }}
        />
      ) : null}
    </section>
  );
}

function RowActions({
  row,
  onNotice,
  onDone,
  onSoap,
  onLead,
  onReferral,
}: {
  row: WorkbenchRow;
  onNotice: (msg: string | null) => void;
  onDone: () => void;
  onSoap: (id: string) => void;
  onLead: (id: string) => void;
  onReferral: (id: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const id = row.id;
  if (!id || row.actions.length === 0) return null;

  const run = async (action: string) => {
    setBusy(action);
    onNotice(null);
    try {
      if (action === "claim" || action === "start" || action === "complete") {
        if (
          action === "complete" &&
          !window.confirm(
            "Complete this consult? Its finalized SOAP record becomes the closing record.",
          )
        ) {
          return;
        }
        const json = await postJson(`/api/telemed/sessions/${id}/${action}`);
        if (json?.ok) {
          onNotice(
            action === "claim"
              ? "Consult claimed — it's on your schedule now."
              : action === "start"
                ? "Consult started."
                : "Consult completed.",
          );
          onDone();
        } else {
          onNotice(json?.error || "That action couldn't be completed.");
        }
      } else if (action === "confirm") {
        const json = await postJson(`/api/telemed/sessions/${id}/confirm`);
        if (json?.ok) {
          onNotice("Consult confirmed — the pet owner sees it as confirmed on their appointments.");
          onDone();
        } else {
          onNotice(json?.error || "That consult couldn't be confirmed.");
        }
      } else if (action === "cancel") {
        if (!window.confirm("Cancel this consult? Its availability window opens for rebooking.")) {
          return;
        }
        const reason = window.prompt("Cancellation reason (optional):") || undefined;
        const json = await postJson(`/api/telemed/sessions/${id}/cancel`, reason ? { reason } : {});
        if (json?.ok) {
          onNotice("Consult cancelled.");
          onDone();
        } else {
          onNotice(json?.error || "That consult couldn't be cancelled.");
        }
      } else if (action === "reschedule") {
        const input = window.prompt("New date & time (for example 2026-10-30 14:30):");
        if (!input) return;
        const when = new Date(input);
        if (Number.isNaN(when.getTime())) {
          onNotice("That date & time couldn't be read — try YYYY-MM-DD HH:MM.");
          return;
        }
        const json = await postJson(`/api/telemed/sessions/${id}/reschedule`, {
          scheduledAt: when.toISOString(),
        });
        if (json?.ok) {
          onNotice("New time saved — inside your declared availability, or it would have been refused.");
          onDone();
        } else {
          onNotice(json?.error || "That time couldn't be booked.");
        }
      } else if (action === "video") {
        const json = await postJson(`/api/telemed/sessions/${id}/video`);
        if (json?.ok && json.video) {
          // The door shape returns hostUrl (Zoom start_url), never
          // startUrl — the old startUrl read was dead code and the vet
          // always fell through to the participant link.
          const url = json.video.hostUrl || json.video.joinUrl;
          if (url) {
            window.open(url, "_blank", "noopener");
            onNotice("Video meeting is ready — it opened in a new tab.");
          } else if (json.video.state === "not_configured") {
            onNotice(
              "Video isn't configured for this practice yet — an admin plugs the provider in Telemedicine settings.",
            );
          } else {
            onNotice("Video will be available when the consult is in its live window.");
          }
          onDone();
        } else {
          onNotice(json?.message || json?.error || "Video couldn't be started.");
        }
      } else if (action === "soap") {
        onSoap(id);
      } else if (action === "lead_respond") {
        onLead(id);
      } else if (action === "referral_view") {
        const json = await postJson(`/api/telemed/referral-inbox/${id}/view`);
        if (json?.ok) {
          onNotice("Marked as viewed.");
          onDone();
        } else {
          onNotice(json?.error || "That referral couldn't be marked viewed.");
        }
      } else if (action === "referral_respond") {
        onReferral(id);
      } else if (action === "rx_verify" || action === "rx_accept" || action === "rx_ship" || action === "rx_deliver") {
        // §16.2 — the pharmacy fulfillment queue's acts, wired to the
        // real state machine (verify + advance routes; the gate is
        // enforced server-side and every act lands on
        // pharmacy_audit_log). Ship requires the tracking number —
        // recorded as data; no carrier is called.
        if (action === "rx_deliver" && !window.confirm("Mark this prescription delivered? That completes it (status fulfilled).")) {
          return;
        }
        let json: any;
        if (action === "rx_verify") {
          json = await postJson(`/api/telemed/pharmacy/prescriptions/${id}/verify`, {});
        } else if (action === "rx_accept") {
          json = await postJson(`/api/telemed/pharmacy/prescriptions/${id}/advance`, { action: "accept" });
        } else if (action === "rx_ship") {
          const tracking = window.prompt("Tracking number for this shipment (required):");
          if (!tracking || !tracking.trim()) {
            onNotice("A tracking number is required to mark a prescription shipped.");
            return;
          }
          const orderId = window.prompt("Your pharmacy order id (optional):") || "";
          json = await postJson(`/api/telemed/pharmacy/prescriptions/${id}/advance`, {
            action: "ship",
            trackingNumber: tracking.trim(),
            pharmacyOrderId: orderId.trim() || null,
          });
        } else {
          json = await postJson(`/api/telemed/pharmacy/prescriptions/${id}/advance`, { action: "deliver" });
        }
        if (json && !json.error) {
          onNotice(
            action === "rx_verify"
              ? json.alreadyVerified
                ? "Already verified — the standing verification is on record."
                : "Prescription verified for fulfillment."
              : action === "rx_accept"
                ? "Prescription accepted."
                : action === "rx_ship"
                  ? "Marked shipped — tracking recorded."
                  : "Marked delivered — prescription fulfilled.",
          );
          onDone();
        } else {
          onNotice(json?.error || "That action couldn't be completed.");
        }
      }
    } finally {
      setBusy(null);
    }
  };

  const LABELS: Record<string, string> = {
    claim: "Claim",
    start: "Start",
    soap: "SOAP notes",
    video: "Video",
    complete: "Complete",
    lead_respond: "Respond",
    referral_view: "Mark viewed",
    referral_respond: "Respond",
    rx_verify: "Verify",
    rx_accept: "Accept",
    rx_ship: "Ship…",
    rx_deliver: "Delivered",
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {row.actions.map((a) => (
        <button
          key={a}
          type="button"
          disabled={busy !== null}
          onClick={() => run(a)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
        >
          {busy === a ? "Working…" : LABELS[a] ?? a}
        </button>
      ))}
    </div>
  );
}

interface SoapState {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  finalizedAt: string | null;
}

function SoapEditor({
  sessionId,
  onClose,
  onSaved,
}: {
  sessionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [soap, setSoap] = useState<SoapState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/telemed/sessions/${sessionId}/soap`);
        const json = await res.json().catch(() => null);
        if (res.ok && json?.ok) {
          setSoap({
            subjective: json.soap.subjective ?? "",
            objective: json.soap.objective ?? "",
            assessment: json.soap.assessment ?? "",
            plan: json.soap.plan ?? "",
            finalizedAt: json.soap.finalizedAt ?? null,
          });
        } else {
          setError(json?.error || "The SOAP record couldn't be loaded.");
        }
      } catch {
        setError("The SOAP record couldn't be loaded.");
      }
    })();
  }, [sessionId]);

  const save = async (finalize: boolean) => {
    if (!soap) return;
    if (
      finalize &&
      !window.confirm(
        "Finalize this SOAP record? Finalized notes are the shared clinical record and lock against further edits.",
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const json = await postJson(`/api/telemed/sessions/${sessionId}/soap`, {
        subjective: soap.subjective,
        objective: soap.objective,
        assessment: soap.assessment,
        plan: soap.plan,
        finalize,
      });
      if (json?.ok) {
        if (finalize) onClose();
        onSaved();
      } else {
        setError(json?.error || "The notes couldn't be saved.");
      }
    } finally {
      setBusy(false);
    }
  };

  const FIELDS: { key: "subjective" | "objective" | "assessment" | "plan"; label: string }[] = [
    { key: "subjective", label: "Subjective" },
    { key: "objective", label: "Objective" },
    { key: "assessment", label: "Assessment" },
    { key: "plan", label: "Plan" },
  ];

  return (
    <div className="border-t border-border bg-muted/40 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">SOAP record</h4>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>
      {error ? <p className="mb-2 text-xs text-red-700">{error}</p> : null}
      {!soap ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : soap.finalizedAt ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-emerald-800">
            Finalized — this record is locked and shared as the consult's clinical record.
          </p>
          {FIELDS.map((f) => (
            <div key={f.key}>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {f.label}
              </p>
              <p className="whitespace-pre-wrap text-sm text-foreground">{soap[f.key] || "—"}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {f.label}
              </span>
              <textarea
                value={soap[f.key]}
                onChange={(e) =>
                  setSoap((cur) => (cur ? { ...cur, [f.key]: e.target.value } : cur))
                }
                rows={2}
                className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
          ))}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => save(false)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save notes"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => save(true)}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              Save &amp; finalize
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LeadRespond({
  leadId,
  endpoint,
  heading,
  onClose,
  onSent,
}: {
  leadId: string;
  /** Defaults to the shared-pool lead respond route; referral
   *  deliveries pass their own referral-inbox route. */
  endpoint?: string;
  heading?: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const json = await postJson(endpoint ?? `/api/telemed/leads/${leadId}/respond`, { notes });
      if (json?.ok) onSent();
      else setError(json?.error || "Your response couldn't be recorded.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-border bg-muted/40 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">{heading ?? "Respond to this lead"}</h4>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>
      {error ? <p className="mb-2 text-xs text-red-700">{error}</p> : null}
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder="Your response to the pet owner — next steps, what to watch for, when to come in."
        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
      />
      <div className="pt-2">
        <button
          type="button"
          disabled={busy || !notes.trim()}
          onClick={send}
          className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          {busy ? "Recording…" : "Record response"}
        </button>
      </div>
    </div>
  );
}

export function TelemedSectionPage({ slug }: { slug: string }) {
  const section = telemedSection(slug);
  if (!section) return null;
  return (
    <div className="p-4 sm:p-6 space-y-8 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{section.label}</h1>
        <p className="text-[13px] text-muted-foreground mt-1 max-w-3xl">{section.blurb}</p>
      </div>
      {section.surfaces.map((surface) => (
        <TelemedSurface key={surface.table + surface.title} section={slug} surface={surface} />
      ))}
    </div>
  );
}
