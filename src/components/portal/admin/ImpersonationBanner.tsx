"use client";

// K1 · Impersonation banner — rendered from the root layout on every
// page. It reads the live session's impersonation state from the page's
// shared session bootstrap (lib/session-bootstrap, which carries the
// /api/impersonation/session read server-side): when the session carries
// the mark, a persistent banner names the target, the admin of record,
// and the recorded reason, with the End control that closes the governed
// record and restores the admin's own session. When the record has
// already been ended from the desk, the banner says so and the same
// control performs the exit. No mark → renders nothing. The End control
// itself still POSTs to /api/impersonation/session directly.

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { loadSessionBootstrap, refreshSessionBootstrap } from "@/lib/session-bootstrap";

interface ImpersonationState {
  session_id: string;
  by_email: string;
  target_type: string;
  target_id: string;
  target_label: string | null;
  reason: string | null;
  record_status: string;
}

export default function ImpersonationBanner() {
  const [state, setState] = useState<ImpersonationState | null>(null);
  const [ending, setEnding] = useState(false);

  // Slice 2 (pageview tax) — NO dedicated fetch anymore. The old
  // unconditional GET /api/impersonation/session on every pageview was
  // pure tax for ordinary visitors: the route itself returns
  // {impersonation: null} without a DB read when the session carries no
  // claim, so the request bought nothing. The banner now reads the
  // impersonation section of the page's ONE session bootstrap call
  // (lib/session-bootstrap), which the site chrome already makes — for
  // ordinary visitors this component adds ZERO requests, and the
  // bootstrap performs no DB read at all when no impersonation claim
  // exists. A server-side cookie gate was deliberately NOT used here:
  // the session cookie is httpOnly (invisible to this component), and
  // reading cookies() in the root layout would force every route —
  // including the CDN-cached ISR shop pages — into dynamic rendering.
  // The End control still POSTs to /api/impersonation/session directly;
  // that governed flow is untouched.
  useEffect(() => {
    let live = true;
    const apply = (j: { impersonation?: unknown }) => {
      if (live) setState((j.impersonation as ImpersonationState | null) ?? null);
    };
    loadSessionBootstrap().then(apply).catch(() => {});
    const onSessionChange = () => {
      refreshSessionBootstrap().then(apply).catch(() => {});
    };
    window.addEventListener("portal:session-changed", onSessionChange);
    return () => {
      live = false;
      window.removeEventListener("portal:session-changed", onSessionChange);
    };
  }, []);

  if (!state) return null;

  const end = async () => {
    setEnding(true);
    try {
      const r = await fetch("/api/impersonation/session", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      window.location.href = j.redirect || "/admin";
    } catch {
      setEnding(false);
    }
  };

  const endedElsewhere = state.record_status !== "active";

  return (
    <div className="sticky top-0 z-[90] flex flex-wrap items-center gap-x-3 gap-y-1 bg-red-700 px-4 py-2 text-[13px] text-white">
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <span className="font-semibold">
        {endedElsewhere ? "Impersonation record ended — " : "Impersonating "}
        {state.target_label || `${state.target_type} ${state.target_id}`}
      </span>
      <span className="opacity-90">
        Admin of record: {state.by_email}
        {state.reason ? ` · Reason: ${state.reason}` : ""}
      </span>
      <button
        onClick={end}
        disabled={ending}
        className="ml-auto rounded bg-white px-3 py-1 text-[12px] font-semibold text-red-800 disabled:opacity-60"
      >
        {ending ? "Ending…" : endedElsewhere ? "Exit impersonation" : "End impersonation"}
      </button>
    </div>
  );
}
