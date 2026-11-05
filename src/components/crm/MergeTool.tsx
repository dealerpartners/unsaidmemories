"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type GroupCustomer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  created_at: string;
  lifetime_value: number | null;
  last_activity_at: string | null;
};

export default function MergeTool({ groupKey, customers }: { groupKey: string; customers: GroupCustomer[] }) {
  const router = useRouter();
  const [survivor, setSurvivor] = useState(customers[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  return (
    <div>
      {error && <div className="crm-error">{error}</div>}
      {result && <div className="crm-ok">{result}</div>}
      <div className="crm-tablewrap" style={{ marginBottom: 10 }}>
        <table className="crm-table">
          <thead>
            <tr><th>Keep</th><th>Customer</th><th>Contact</th><th>Customer since</th><th>Lifetime value</th><th>Last activity</th></tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td>
                  <input type="radio" name={`survivor-${groupKey}`} checked={survivor === c.id} onChange={() => setSurvivor(c.id)} aria-label={`Keep ${c.name}`} />
                </td>
                <td><a href={`/admin/crm/customers/${c.id}`}>{c.name}</a></td>
                <td>{c.email || c.mobile_phone || c.phone || "—"}</td>
                <td>{new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                <td>${Number(c.lifetime_value || 0).toFixed(2)}</td>
                <td>{c.last_activity_at ? new Date(c.last_activity_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        className="crm-btn"
        type="button"
        disabled={busy || !survivor || customers.length < 2}
        onClick={async () => {
          const others = customers.filter((c) => c.id !== survivor);
          if (!confirm(`Merge ${others.length} record(s) into the selected customer? All notes, messages, documents, orders, invoices and tags move to the survivor. This cannot be undone from the UI.`)) return;
          setBusy(true); setError(null);
          try {
            const res = await fetch("/api/admin/crm/dedupe/merge", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ survivor_id: survivor, merge_ids: others.map((c) => c.id) }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error || "Merge failed");
            setResult(`Merged ${others.length} duplicate(s) into the surviving record.`);
            router.refresh();
          } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
        }}
      >
        {busy ? "Merging…" : "Merge into selected customer"}
      </button>
    </div>
  );
}
