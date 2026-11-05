"use client";

// /admin/promotions — Promotions (owner's feature tree). The views are
// Sunny's MARKETING.html designs: "Discount codes" (his table) and
// "Target picker". Machinery is the real promotions engine, unchanged:
// GET/POST /api/admin/promotions, PATCH/DELETE /api/admin/promotions/[id],
// the PromotionDealForm create form and the TargetPicker component —
// the picker Apply-loads its targets into the create form, which is
// where targets are persisted (commerce_promotion_targets).

import { useCallback, useEffect, useState } from "react";
import { Plus, Ticket } from "lucide-react";
import { PromotionDealForm, TargetPicker, type DealTarget } from "@/components/portal/PromotionDealForm";
import { MktPage, StatusChip, useToast } from "@/components/admin/marketing/frame";

type Promotion = {
  id: string;
  code: string;
  name: string;
  promotionType: string;
  value: number | null;
  usageLimit: number | null;
  usageCount: number;
  active: boolean;
  isAutomatic: boolean;
  startAt: string | null;
  endAt: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  percent_off: "Percentage",
  fixed_off: "Fixed amount",
  sale_price: "Set sale price",
};

function valueLabel(p: Promotion): string {
  if (p.value == null) return "—";
  if (p.promotionType === "percent_off") return `${p.value}% Off`;
  if (p.promotionType === "fixed_off") return `$${p.value} Off`;
  if (p.promotionType === "sale_price") return `$${p.value}`;
  return String(p.value);
}

function statusOf(p: Promotion): string {
  if (!p.active) return "inactive";
  if (p.startAt && new Date(p.startAt).getTime() > Date.now()) return "scheduled";
  if (p.endAt && new Date(p.endAt).getTime() < Date.now()) return "ended";
  return "active";
}

export default function PromotionsPage() {
  const [view, setView] = useState<"codes" | "targets">("codes");
  const [rows, setRows] = useState<Promotion[] | null>(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [picked, setPicked] = useState<DealTarget[]>([]);
  const [preset, setPreset] = useState<DealTarget[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const { toast, node } = useToast();

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/promotions", { cache: "no-store" });
      if (!r.ok) throw new Error();
      const j = await r.json();
      setRows(Array.isArray(j.promotions) ? j.promotions : []);
      setError("");
    } catch {
      setError("Promotions couldn't be loaded right now.");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggleActive(p: Promotion) {
    setBusy(p.id);
    try {
      const r = await fetch(`/api/admin/promotions/${p.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !p.active }),
      });
      if (!r.ok) throw new Error();
      toast(`${p.code}: ${p.active ? "deactivated" : "activated"}.`);
      await load();
    } catch { toast("That action didn't go through."); } finally { setBusy(null); }
  }

  async function remove(p: Promotion) {
    if (!confirm(`Delete promotion ${p.code}?`)) return;
    setBusy(p.id);
    try {
      const r = await fetch(`/api/admin/promotions/${p.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      toast(`${p.code}: deleted.`);
      await load();
    } catch { toast("Delete didn't go through."); } finally { setBusy(null); }
  }

  function applyTargets() {
    setPreset(picked);
    setShowForm(true);
    setView("codes");
    toast(picked.length ? `${picked.length} target${picked.length === 1 ? "" : "s"} loaded into the discount form.` : "No targets picked — the discount will apply to the whole cart.");
  }

  return (
    <MktPage title={view === "codes" ? "Discount codes" : "Target picker"}>
      {node}
      <div className="viewtabs">
        <button className={`viewtab ${view === "codes" ? "active" : ""}`} onClick={() => setView("codes")}>Discount codes</button>
        <button className={`viewtab ${view === "targets" ? "active" : ""}`} onClick={() => setView("targets")}>Target picker</button>
      </div>

      {view === "codes" && (
        <>
          {showForm && (
            <div className="card card-pad" style={{ marginBottom: 12 }}>
              <PromotionDealForm
                presetTargets={preset}
                heading="Create discount"
                onCreated={() => { setShowForm(false); setPreset([]); load(); toast("Discount created."); }}
              />
              <button className="btn" style={{ marginTop: 10 }} onClick={() => setShowForm(false)}>Close form</button>
            </div>
          )}
          <div className="card">
            <div className="card-pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><strong>Discount codes</strong><div className="small muted">Active and scheduled offers</div></div>
              <button className="btn primary" onClick={() => setShowForm((v) => !v)}><Plus /> Create discount</button>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Status</th><th>Redemptions</th><th>Actions</th></tr></thead>
                <tbody>
                  {rows === null ? (
                    <tr><td colSpan={6}><div className="empty">Loading…</div></td></tr>
                  ) : error ? (
                    <tr><td colSpan={6}><div className="empty">{error}</div></td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={6}><div className="empty"><Ticket />No discount codes yet. Create the first one.</div></td></tr>
                  ) : rows.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.code}</strong><div className="small muted">{p.name}{p.isAutomatic ? " · automatic" : ""}</div></td>
                      <td>{TYPE_LABEL[p.promotionType] ?? p.promotionType}</td>
                      <td>{valueLabel(p)}</td>
                      <td><StatusChip status={statusOf(p)} /></td>
                      <td>{p.usageCount} / {p.usageLimit ?? "∞"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn" disabled={busy === p.id} onClick={() => toggleActive(p)}>{p.active ? "Deactivate" : "Activate"}</button>
                          <button className="btn danger" disabled={busy === p.id} onClick={() => remove(p)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {view === "targets" && (
        <div className="card card-pad">
          <strong>Target picker</strong>
          <div className="small muted" style={{ marginBottom: 14 }}>Choose which products or categories a promotion applies to. Applied targets load into the discount form — that is where they are saved.</div>
          <TargetPicker value={picked} onChange={setPicked} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button className="btn" onClick={() => { setPicked([]); setView("codes"); }}>Cancel</button>
            <button className="btn primary" onClick={applyTargets}>Apply to promotion</button>
          </div>
        </div>
      )}
    </MktPage>
  );
}
