"use client";

/**
 * Connect a Service wizard — all four steps working.
 *
 * Wizard #3 in notes/wizard-catalog.md, built under its 7 standing
 * rules: ONE job (connect one service), ONE decision per step,
 * defaults/status from REAL data, Back always allowed. The full step
 * list is Pick the service → What it does + what you'll need → Paste
 * the key → We test it. Step 4 runs the live test through POST
 * /api/admin/integrations/test (the service's saved key, one cheap
 * read against the provider's own API) and ends on the proof line
 * "Connected — <service>, account <name>, <N> products readable"
 * when the provider answers — or on a plain failure, or on an honest
 * "saved, not testable" line for services with no verified account
 * read. No test result is ever claimed before the provider answers.
 *
 * Data contracts — the SAME ones the Connections & Keys page uses, no
 * parallel reads and no parallel key store:
 *   INTEGRATION_SERVICES from "@/lib/integrations/catalog"
 *     → the service list itself: names, plain-word blurbs, the exact
 *       key fields (label / secret / placeholder / help), and each
 *       service's own dashboard link. The wizard imports the catalog
 *       directly, exactly as connections-client.tsx does, so the two
 *       can never drift apart.
 *   GET /api/admin/integrations/keys
 *     → { statuses } — connection status per key (source + lastFour,
 *       never the values). The same read connections-client.tsx's
 *       load() makes; "connected" below uses its exact rule (any of
 *       the service's fields has a status source).
 *   POST /api/admin/integrations/keys  { keyName, value }
 *     → the EXISTING save path: the same route (and the same
 *       setIntegrationKey() in lib/integrations/keys behind it) that
 *       connections-client.tsx's save() calls, once per pasted field.
 *       The route returns the refreshed { statuses }, which is what
 *       Step 4's saved line is read back from.
 *
 * Step 1 grouping: the wizard-catalog's four groups (Suppliers /
 * Money / Social / Store tools) are DERIVED from each service's
 * catalog category — Suppliers (printing & shipping) → Suppliers,
 * Payments → Money, Marketing → Social, everything else the catalog
 * carries (Analytics, Design tools, Email) → Store tools. Only the
 * category→group mapping lives here; the services, their order, and
 * their text all come from the catalog. A future catalog category
 * with no mapping keeps its own catalog name as its group heading,
 * so a new service can never be silently hidden.
 *
 * Entry points:
 *   - the Connections & Keys page's additive "Connect a service —
 *     step by step" button (the page's cards are untouched),
 *   - ?service=<catalog id> — when present and valid, the wizard
 *     opens on Step 2 for that service (the shape the Social Post
 *     wizard's inline "Connect first" will use). An unknown id is
 *     ignored and the wizard starts on Step 1.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  INTEGRATION_SERVICES,
  type IntegrationService,
} from "@/lib/integrations/catalog";
import "./connect-wizard.css";

/** One key's status from GET /api/admin/integrations/keys — mirrors
 *  KeyStatus in connections-client.tsx (and listKeyStatuses() in
 *  lib/integrations/keys, which the route returns verbatim). */
interface KeyStatus {
  keyName: string;
  source: "saved" | "server" | null;
  lastFour: string | null;
}

const STEP_LABELS = [
  "Pick the service",
  "What it does",
  "Paste the key",
  "We test it",
] as const;

type Step = 1 | 2 | 3 | 4;

/** The four wizard-catalog groups, in display order. */
const GROUP_ORDER = ["Suppliers", "Money", "Social", "Store tools"] as const;

/** Catalog category → wizard group (see the header comment). */
function wizardGroup(category: string): string {
  if (category === "Suppliers (printing & shipping)") return "Suppliers";
  if (category === "Payments") return "Money";
  if (category === "Marketing") return "Social";
  if (category === "Analytics" || category === "Design tools" || category === "Email")
    return "Store tools";
  return category;
}

export default function ConnectWizard() {
  const [step, setStep] = useState<Step>(1);
  const [service, setService] = useState<IntegrationService | null>(null);
  const [statuses, setStatuses] = useState<Record<string, KeyStatus>>({});
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** What Step 3's save actually stored, read back from the save
   *  route's returned statuses — shown on Step 4 beside the test. */
  const [savedLines, setSavedLines] = useState<string[]>([]);
  /** Step 4's live test result (POST /api/admin/integrations/test).
   *  `forService` records which service the result belongs to, so
   *  picking a different service never shows a stale proof line. */
  const [testResult, setTestResult] = useState<{
    serviceName: string;
    ok: boolean;
    testable: boolean;
    account: string | null;
    count: number | null;
    countLabel: string | null;
    note: string | null;
    error: string | null;
  } | null>(null);
  const [testForService, setTestForService] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const startedRef = useRef(false);

  /* ---- Step 4 test — one cheap provider read, via the test route ---- */
  const runTest = useCallback(async (svc: IntegrationService) => {
    setTestBusy(true);
    setTestError(null);
    try {
      const res = await fetch("/api/admin/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId: svc.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The test could not run.");
      setTestResult({
        serviceName: data.serviceName ?? svc.name,
        ok: Boolean(data.ok),
        testable: Boolean(data.testable),
        account: data.account ?? null,
        count: typeof data.count === "number" ? data.count : null,
        countLabel: data.countLabel ?? null,
        note: data.note ?? null,
        error: data.error ?? null,
      });
      setTestForService(svc.id);
    } catch (e) {
      setTestError(e instanceof Error ? e.message : "The test could not run.");
    } finally {
      setTestBusy(false);
    }
  }, []);

  /* Entering Step 4 runs the test once per service (a fresh save in
   * Step 3 clears the result first, so re-saving re-tests). */
  useEffect(() => {
    if (step === 4 && service && testForService !== service.id && !testBusy) {
      void runTest(service);
    }
  }, [step, service, testForService, testBusy, runTest]);

  /* ---- Status read (the Connections page's own read) ---- */
  const loadStatuses = useCallback(async () => {
    setStatusError(null);
    try {
      const res = await fetch("/api/admin/integrations/keys");
      if (!res.ok) throw new Error("status request failed");
      const d = await res.json();
      const map: Record<string, KeyStatus> = {};
      for (const s of d.statuses as KeyStatus[]) map[s.keyName] = s;
      setStatuses(map);
      setStatusLoaded(true);
    } catch {
      // The service list still renders (it comes from the catalog);
      // only the Connected badges are unknown, and the panels say so.
      setStatusLoaded(true);
      setStatusError(
        "The saved-key list could not be loaded, so the Connected marks may be out of date. The services below are still the real list — you can pick one and continue.",
      );
    }
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void loadStatuses();
    const wanted = new URLSearchParams(window.location.search).get("service");
    if (wanted) {
      const found = INTEGRATION_SERVICES.find((s) => s.id === wanted);
      if (found) {
        setService(found);
        setStep(2);
      }
    }
  }, [loadStatuses]);

  /* ---- Grouping (derived from the catalog, in catalog order) ---- */
  const groups = useMemo(() => {
    const byGroup = new Map<string, IntegrationService[]>();
    for (const svc of INTEGRATION_SERVICES) {
      const g = wizardGroup(svc.category);
      const list = byGroup.get(g) ?? [];
      list.push(svc);
      byGroup.set(g, list);
    }
    const ordered: { name: string; services: IntegrationService[] }[] = [];
    for (const name of GROUP_ORDER) {
      const list = byGroup.get(name);
      if (list?.length) {
        ordered.push({ name, services: list });
        byGroup.delete(name);
      }
    }
    for (const [name, services] of byGroup) ordered.push({ name, services });
    return ordered;
  }, []);

  /** The Connections page's exact connected rule. */
  const serviceConnected = (svc: IntegrationService) =>
    svc.fields.some((f) => statuses[f.keyName]?.source);

  /* ---- Step transitions (Back is always allowed — rule 6) ---- */
  const chooseService = (svc: IntegrationService) => {
    setService(svc);
    setSaveError(null);
    setSavedLines([]);
    setTestResult(null);
    setTestForService(null);
    setStep(2);
  };

  const back = () => {
    setSaveError(null);
    if (step > 1) setStep((step - 1) as Step);
  };

  const stepState = (n: number): "done" | "current" | "todo" =>
    n < step ? "done" : n === step ? "current" : "todo";
  /** Clicking a finished step's label goes back to it (rule 6). */
  const jumpBack = (n: number) => {
    if (n < step) {
      setSaveError(null);
      setStep(n as Step);
    }
  };

  const startAgain = () => {
    setService(null);
    setDrafts({});
    setSaveError(null);
    setSavedLines([]);
    setTestResult(null);
    setTestForService(null);
    setStep(1);
  };

  /* ---- Step 3 save — the EXISTING connections save path ----
   * One POST per pasted field to /api/admin/integrations/keys with
   * { keyName, value }, exactly what connections-client.tsx's save()
   * sends for one card field. Empty fields are left alone (a service
   * can be updated one key at a time, same as on the cards). */
  const saveKeys = async () => {
    if (!service) return;
    const filled = service.fields.filter((f) => (drafts[f.keyName] ?? "").trim());
    if (filled.length === 0) {
      setSaveError(
        `Paste the ${service.name} ${service.fields.length === 1 ? "key" : "key(s)"} into the box first, then press Save.`,
      );
      return;
    }
    setBusy(true);
    setSaveError(null);
    const savedLabels: string[] = [];
    let latest: Record<string, KeyStatus> | null = null;
    for (const f of filled) {
      const res = await fetch("/api/admin/integrations/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyName: f.keyName,
          value: (drafts[f.keyName] ?? "").trim(),
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBusy(false);
        setSaveError(
          savedLabels.length
            ? `${f.label} did not save (${d.error ?? "please try again"}). ${savedLabels.join(", ")} saved fine before it — you only need to retry this one.`
            : (d.error ?? "That did not save — please try again."),
        );
        if (latest) setStatuses(latest);
        return;
      }
      const map: Record<string, KeyStatus> = {};
      for (const s of d.statuses as KeyStatus[]) map[s.keyName] = s;
      latest = map;
      const st = map[f.keyName];
      savedLabels.push(
        st?.lastFour ? `${f.label} (ends in ${st.lastFour})` : f.label,
      );
    }
    setBusy(false);
    if (latest) setStatuses(latest);
    setDrafts({});
    setSavedLines(savedLabels);
    // A fresh save re-tests: clear the old result so Step 4's effect
    // runs the test again for this service.
    setTestResult(null);
    setTestForService(null);
    setStep(4);
  };

  return (
    <div className="csw-wrap">
      <div className="csw-head">
        <h1>Connect a service</h1>
      </div>

      <ol className="csw-steps" aria-label="Connect a service steps">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const state = stepState(n);
          const labelEl = (
            <>
              <span className="csw-step-num" aria-hidden="true">
                {state === "done" ? "✓" : n}
              </span>
              <span className="csw-step-label">{label}</span>
            </>
          );
          return (
            <li
              key={label}
              className={`csw-step ${state}`}
              aria-current={state === "current" ? "step" : undefined}
            >
              {state === "done" ? (
                <button
                  type="button"
                  onClick={() => jumpBack(n)}
                  data-tip={`Go back to the ${label} step — nothing is final until the test passes.`}
                >
                  {labelEl}
                </button>
              ) : (
                labelEl
              )}
            </li>
          );
        })}
      </ol>

      {statusError && (
        <div className="csw-error" role="alert">
          {statusError}{" "}
          <button type="button" className="csw-btn" onClick={() => void loadStatuses()}>
            Try again
          </button>
        </div>
      )}

      {/* ================= STEP 1 — Pick the service ================= */}
      {step === 1 && (
        <section className="csw-panel" aria-label="Step 1: pick the service">
          <h2>Step 1 of 4 — Which service?</h2>
          <p className="csw-lede">
            Pick the one you want to connect. A service that is already
            connected says so — you can still pick it to paste a fresh key and
            replace the saved one.
          </p>
          {!statusLoaded ? (
            <p className="csw-loading">Loading the services…</p>
          ) : (
            groups.map((group) => (
              <div key={group.name}>
                <h3 className="csw-group">{group.name}</h3>
                <div className="csw-cards">
                  {group.services.map((svc) => {
                    const connected = serviceConnected(svc);
                    return (
                      <button
                        key={svc.id}
                        type="button"
                        className="csw-card"
                        onClick={() => chooseService(svc)}
                        data-tip={
                          connected
                            ? `${svc.name} is already connected. Pick it to paste a new key and replace the saved one.`
                            : `Connect ${svc.name} — the next step says what it does and what to have ready.`
                        }
                      >
                        <span
                          className={`csw-badge ${connected ? "csw-badge-on" : "csw-badge-off"}`}
                        >
                          {connected ? "✓ Connected" : "Not connected yet"}
                        </span>
                        <p className="csw-card-name">{svc.name}</p>
                        <p className="csw-card-meta">{svc.blurb}</p>
                        <p className="csw-card-meta">
                          {svc.fields.length === 1
                            ? "1 value to paste"
                            : `${svc.fields.length} values to paste`}
                          {connected ? " · pick to update the key" : ""}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
          <div className="csw-actions">
            <a
              className="csw-btn"
              href="/admin/integrations/connections"
              data-tip="Skip the guide and use the Connections & Keys page directly — every service and key on one page."
            >
              Skip the guide — open Connections &amp; Keys
            </a>
          </div>
        </section>
      )}

      {/* ================= STEP 2 — What it does + what you'll need ================= */}
      {step === 2 && service && (
        <section className="csw-panel" aria-label="Step 2: what it does and what you'll need">
          <h2>Step 2 of 4 — {service.name}: what it does</h2>
          <p className="csw-lede">{service.blurb}</p>

          {serviceConnected(service) && (
            <div className="csw-note">
              {service.name} is already connected — at least one of its keys is
              saved, so the shop can use it. Continuing lets you paste a new key
              to replace the saved one; nothing is removed by going forward.
            </div>
          )}

          <h3 className="csw-group">What you&apos;ll need</h3>
          <p className="csw-lede">
            Have {service.fields.length === 1 ? "this ready" : "these ready"} before
            the next step — {service.fields.length === 1 ? "it is" : "each one is"} copied
            from your {service.name} account, exactly where it says:
          </p>
          <ul className="csw-need">
            {service.fields.map((f) => {
              const st = statuses[f.keyName];
              return (
                <li key={f.keyName}>
                  <p className="csw-need-label">
                    {f.label}
                    {st?.source && (
                      <span style={{ fontWeight: 400, color: "#22754a", marginLeft: 8 }}>
                        {st.source === "saved"
                          ? `Saved here (ends in ${st.lastFour ?? "••••"})`
                          : `Set on the server (ends in ${st.lastFour ?? "••••"})`}
                      </span>
                    )}
                  </p>
                  <p className="csw-need-help">{f.help}</p>
                </li>
              );
            })}
          </ul>

          <div className="csw-actions">
            <button
              type="button"
              className="csw-btn"
              onClick={back}
              data-tip="Go back and pick a different service."
            >
              ← Back
            </button>
            {service.dashboardUrl && (
              <a
                className="csw-btn"
                href={service.dashboardUrl}
                target="_blank"
                rel="noreferrer"
                data-tip={`Open ${service.name} in a new tab. That's their own website — it's where you find your key, and where you manage your account with them.`}
              >
                {service.dashboardLabel} ↗
              </a>
            )}
            <button
              type="button"
              className="csw-btn csw-btn-primary"
              onClick={() => setStep(3)}
              data-tip="Continue to Step 3: paste the key. Nothing is saved until you press Save there."
            >
              I have it ready — continue →
            </button>
          </div>
        </section>
      )}

      {/* ================= STEP 3 — Paste the key ================= */}
      {step === 3 && service && (
        <section className="csw-panel" aria-label="Step 3: paste the key">
          <h2>Step 3 of 4 — Paste the {service.name} key</h2>
          <p className="csw-lede">
            Paste {service.fields.length === 1 ? "the key" : "each value"} below and
            press Save. Keys are stored locked (encrypted) and are never shown
            again after saving — the page will only ever show the last four
            characters.{" "}
            {service.fields.length > 1
              ? "You can fill in just the one you are replacing and leave the rest blank — blank boxes are left as they are."
              : ""}
          </p>

          {saveError && (
            <div className="csw-error" role="alert">
              {saveError}
            </div>
          )}

          {service.fields.map((f) => {
            const st = statuses[f.keyName];
            return (
              <div key={f.keyName} className="csw-field">
                <label htmlFor={`csw-${f.keyName}`}>
                  {f.label}
                  {st?.source && (
                    <span className="csw-saved-note">
                      {st.source === "saved"
                        ? `Saved here (ends in ${st.lastFour ?? "••••"})`
                        : `Set on the server (ends in ${st.lastFour ?? "••••"})`}
                    </span>
                  )}
                </label>
                <input
                  id={`csw-${f.keyName}`}
                  type={f.secret ? "password" : "text"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={st?.source ? "Paste a new value to replace it" : f.placeholder}
                  value={drafts[f.keyName] ?? ""}
                  onChange={(e) =>
                    setDrafts((p) => ({ ...p, [f.keyName]: e.target.value }))
                  }
                  data-tip={
                    f.secret
                      ? "Paste your key here. For your safety it is never shown again after you save — the page will only ever show its last four characters."
                      : "Type or paste the value here, then press Save."
                  }
                />
                <p className="csw-field-hint">{f.help}</p>
              </div>
            );
          })}

          <div className="csw-actions">
            <button
              type="button"
              className="csw-btn"
              onClick={back}
              data-tip="Go back to what this service does and what you need. Anything you pasted stays in its box."
            >
              ← Back
            </button>
            <button
              type="button"
              className="csw-btn csw-btn-primary"
              disabled={busy}
              onClick={() => void saveKeys()}
              data-tip="Save in the same locked store the Connections & Keys page uses. The shop starts using the key right away."
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </section>
      )}

      {/* ================= STEP 4 — We test it (live provider read) ================= */}
      {step === 4 && service && (
        <section className="csw-panel" aria-label="Step 4: we test it">
          <h2>Step 4 of 4 — We test it</h2>
          <p className="csw-lede">
            The wizard connects to {service.name} for real, reads something
            back from your account, and shows it to you as the proof. No
            result is claimed before the provider answers.
          </p>

          {savedLines.length > 0 && (
            <div className="csw-saved" role="status">
              Saved just now, in the same locked store as Connections &amp;
              Keys: {savedLines.join(", ")}. {service.name}&apos;s card on the
              Connections &amp; Keys page now shows it as saved too. Saving is
              not the same as the test passing — the test below is the proof.
            </div>
          )}
          {savedLines.length === 0 && testForService !== service.id && !testBusy && (
            <p className="csw-empty">
              Nothing was saved in this visit — you reached this step by going
              back and forward. Use Back to return to Step 3 and paste the key
              when you are ready, or run the test against the key already saved.
            </p>
          )}

          {testBusy && <p className="csw-loading">Testing {service.name} — reading something back from your account…</p>}
          {testError && (
            <div className="csw-error" role="alert">
              {testError}{" "}
              <button type="button" className="csw-btn" onClick={() => void runTest(service)}>
                Try the test again
              </button>
            </div>
          )}
          {testResult && testForService === service.id && testResult.ok && (
            <div className="csw-saved" role="status">
              Connected — {testResult.serviceName}
              {testResult.account ? `, account ${testResult.account}` : ""}
              {testResult.count != null && testResult.countLabel ? `, ${testResult.count.toLocaleString()} ${testResult.countLabel}` : ""}.
              {testResult.note ? ` ${testResult.note}` : ""}
            </div>
          )}
          {testResult && testForService === service.id && !testResult.ok && testResult.testable && (
            <div className="csw-error" role="alert">
              The test did not pass: {testResult.error} The key is still saved
              from Step 3 — paste a fresh one there and the test runs again.
            </div>
          )}
          {testResult && testForService === service.id && !testResult.ok && !testResult.testable && (
            <div className="csw-note" role="status">
              Saved, but not testable automatically: {testResult.note} The key
              is stored in the same locked store as Connections &amp; Keys,
              and that page shows it as saved — but this wizard cannot show
              the “Connected — account …” proof for {service.name} yet.
            </div>
          )}

          <div className="csw-actions">
            <button
              type="button"
              className="csw-btn"
              onClick={back}
              data-tip="Go back to Step 3 — paste or replace the key."
            >
              ← Back
            </button>
            <button
              type="button"
              className="csw-btn"
              disabled={testBusy}
              onClick={() => void runTest(service)}
              data-tip="Run the provider test again against the saved key."
            >
              {testBusy ? "Testing…" : "Test again"}
            </button>
            <button
              type="button"
              className="csw-btn"
              onClick={startAgain}
              data-tip="Start the guide again and connect a different service."
            >
              Connect another service
            </button>
            <a
              className="csw-btn csw-btn-primary"
              href="/admin/integrations/connections"
              data-tip="Return to Connections & Keys — every service and its saved state on one page."
            >
              Back to Connections &amp; Keys
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
