"use client";

// ============================================================================
// /admin/sellers/advertising — the seller-advertising enrollment queue
// (owner's feature tree: Marketing → Advertising). Presentation is
// Sunny's MARKETING.html frame (shared .mkt components); the machinery
// is unchanged.
//
// Sellers enroll through /api/seller/advertising (a row in
// public.seller_advertising_enrollments). Until ship-ads (2026-10-23)
// nothing reviewed the queue: enrollments sat at 'pending' forever and
// the can_advertise capability was a manual checkbox elsewhere. This
// console lists the queue from GET /api/admin/seller-advertising and
// decides it — an approval flips seller_capabilities.can_advertise in
// the same transaction, which is the flag the seller's own advertising
// surface reads.
// ============================================================================

import { useCallback, useEffect, useState } from "react";
import { Megaphone, RefreshCw } from "lucide-react";
import { MktPage, StatusChip, fmtDate } from "@/components/admin/marketing/frame";

type Enrollment = {
  id: string;
  seller_id: string;
  placement_keys: string[] | null;
  status: string;
  created_at: string;
  display_name: string | null;
  legal_name: string | null;
  slug: string | null;
  seller_status: string | null;
  can_advertise: boolean | null;
};

export default function SellerAdvertisingQueuePage() {
  const [rows, setRows] = useState<Enrollment[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/seller-advertising");
      if (!res.ok) throw new Error("load_failed");
      const data = await res.json();
      setRows(Array.isArray(data.enrollments) ? data.enrollments : []);
      setError("");
    } catch {
      setError("The enrollment queue couldn't be loaded — refresh to try again.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (row: Enrollment, decision: "approved" | "declined") => {
    if (busyId) return;
    setBusyId(row.id);
    try {
      const res = await fetch("/api/admin/seller-advertising", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enrollment_id: row.id, decision }),
      });
      if (!res.ok) throw new Error("decision_failed");
      await load();
    } catch {
      setError("That decision could not be saved — refresh and try again.");
    } finally {
      setBusyId(null);
    }
  };

  const pending = rows?.filter((r) => r.status === "pending").length ?? 0;

  return (
    <MktPage
      title="Seller advertising"
      actions={
        <button className="btn" onClick={() => void load()}>
          <RefreshCw /> Refresh
        </button>
      }
    >
      {error && <div className="notice error">{error}</div>}

      <div className="card">
        <div className="card-pad">
          <strong>Enrollment queue</strong>
          <div className="small muted">
            {rows === null ? "Loading…" : `${pending} awaiting review · ${rows.length} total`}
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Seller</th><th>Enrolled</th><th>Placements</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr><td colSpan={5}><div className="empty">Loading the queue…</div></td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="empty">
                      <Megaphone />
                      No seller has enrolled for advertising yet. Enrollments appear here the moment a
                      seller submits one from their Advertising page.
                    </div>
                  </td>
                </tr>
              ) : rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.display_name ?? row.legal_name ?? row.slug ?? "Seller"}</strong>
                    {row.slug && <div className="small muted">/{row.slug}</div>}
                  </td>
                  <td>{fmtDate(row.created_at)}</td>
                  <td>
                    {row.placement_keys && row.placement_keys.length > 0 ? row.placement_keys.join(", ") : "All placements"}
                    {row.can_advertise ? <div className="small muted">Advertising access already on</div> : null}
                  </td>
                  <td><StatusChip status={row.status} /></td>
                  <td>
                    {row.status === "pending" ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn primary" disabled={busyId === row.id} onClick={() => void decide(row, "approved")}>
                          Approve
                        </button>
                        <button className="btn danger" disabled={busyId === row.id} onClick={() => void decide(row, "declined")}>
                          Decline
                        </button>
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </MktPage>
  );
}
