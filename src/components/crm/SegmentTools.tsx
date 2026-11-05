"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `Request failed (${res.status})`);
  return json;
}

export const RULE_FIELDS = [
  { value: "lifecycle_stage", label: "Lifecycle stage", ops: ["eq", "neq"], kind: "stage" },
  { value: "lifecycle_status", label: "Lifecycle health", ops: ["eq", "neq"], kind: "health" },
  { value: "customer_type", label: "Customer type", ops: ["eq"], kind: "type" },
  { value: "lifetime_value", label: "Lifetime value ≥", ops: ["gte", "gt", "lt", "lte"], kind: "number" },
  { value: "outstanding_balance", label: "Outstanding balance", ops: ["gt", "gte", "eq"], kind: "number" },
  { value: "orders_count", label: "Order count", ops: ["gte", "gt", "lt"], kind: "number" },
  { value: "days_since_activity", label: "Days since last activity", ops: ["gte", "gt", "lt"], kind: "number" },
  { value: "days_since_created", label: "Days since signup", ops: ["lt", "gte", "gt"], kind: "number" },
  { value: "has_tag", label: "Has tag (name)", ops: ["eq"], kind: "text" },
  { value: "missing_email", label: "Missing email", ops: ["eq"], kind: "bool" },
  { value: "missing_phone", label: "Missing phone", ops: ["eq"], kind: "bool" },
  { value: "birth_month", label: "Birth month (1-12)", ops: ["eq"], kind: "number" },
] as const;

type Rule = { field: string; op: string; value: string };

export function SegmentForm({
  segment,
  onClose,
}: {
  segment?: { id: string; name: string; description: string | null; segment_type: string; definition: { match?: string; rules: Rule[] } } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(segment?.name || "");
  const [description, setDescription] = useState(segment?.description || "");
  const [segmentType, setSegmentType] = useState(segment?.segment_type || "behavioral");
  const [match, setMatch] = useState(segment?.definition?.match || "all");
  const [rules, setRules] = useState<Rule[]>(
    segment?.definition?.rules?.length ? segment.definition.rules.map((r) => ({ ...r, value: String(r.value) })) : [{ field: "lifecycle_stage", op: "eq", value: "active" }]
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateRule = (i: number, patch: Partial<Rule>) =>
    setRules((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="crm-modal-backdrop" onClick={onClose}>
      <div className="crm-modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <h2>{segment ? "Edit segment" : "New segment"}</h2>
        {error && <div className="crm-error">{error}</div>}
        <div className="crm-formrow">
          <div className="crm-field"><label>Name</label><input className="crm-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="crm-field"><label>Category</label>
            <select className="crm-select" value={segmentType} onChange={(e) => setSegmentType(e.target.value)}>
              <option value="lifecycle">Lifecycle stages</option>
              <option value="health">Lifecycle health</option>
              <option value="behavioral">Behavioral</option>
              <option value="operational">Operational</option>
              <option value="marketing">Marketing</option>
              <option value="tag">Tags</option>
            </select>
          </div>
        </div>
        <div className="crm-field"><label>Description</label><input className="crm-input" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="crm-field">
          <label>Match</label>
          <select className="crm-select" value={match} onChange={(e) => setMatch(e.target.value)}>
            <option value="all">All rules (AND)</option>
            <option value="any">Any rule (OR)</option>
          </select>
        </div>
        {rules.map((r, i) => {
          const field = RULE_FIELDS.find((f) => f.value === r.field) || RULE_FIELDS[0];
          return (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <select className="crm-select" value={r.field} onChange={(e) => updateRule(i, { field: e.target.value, op: RULE_FIELDS.find((f) => f.value === e.target.value)?.ops[0] || "eq" })}>
                {RULE_FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
              <select className="crm-select" value={r.op} onChange={(e) => updateRule(i, { op: e.target.value })}>
                {field.ops.map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
              {field.kind === "stage" ? (
                <select className="crm-select" value={r.value} onChange={(e) => updateRule(i, { value: e.target.value })}>
                  {["new_lead", "new_customer", "active", "vip", "returning", "lapsed", "at_risk", "lost"].map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                  ))}
                </select>
              ) : field.kind === "health" ? (
                <select className="crm-select" value={r.value} onChange={(e) => updateRule(i, { value: e.target.value })}>
                  {["healthy", "needs_attention", "at_risk"].map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                  ))}
                </select>
              ) : field.kind === "type" ? (
                <select className="crm-select" value={r.value} onChange={(e) => updateRule(i, { value: e.target.value })}>
                  {["individual", "business", "wholesale", "gift_buyer"].map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                  ))}
                </select>
              ) : field.kind === "bool" ? (
                <select className="crm-select" value={r.value} onChange={(e) => updateRule(i, { value: e.target.value })}>
                  <option value="true">is true</option>
                  <option value="false">is false</option>
                </select>
              ) : (
                <input className="crm-input" style={{ width: 140 }} value={r.value} onChange={(e) => updateRule(i, { value: e.target.value })} />
              )}
              <button className="crm-btn crm-ghost crm-sm" type="button" onClick={() => setRules((rs) => rs.filter((_, idx) => idx !== i))}>Remove</button>
            </div>
          );
        })}
        <button className="crm-btn crm-ghost crm-sm" type="button" onClick={() => setRules((rs) => [...rs, { field: "lifetime_value", op: "gte", value: "0" }])}>
          + Add rule
        </button>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button className="crm-btn crm-ghost" type="button" onClick={onClose}>Cancel</button>
          <button
            className="crm-btn"
            type="button"
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true); setError(null);
              const definition = {
                match,
                rules: rules.map((r) => ({
                  field: r.field,
                  op: r.op,
                  value: RULE_FIELDS.find((f) => f.value === r.field)?.kind === "number" ? Number(r.value) : r.value === "true" ? true : r.value === "false" ? false : r.value,
                })),
              };
              try {
                if (segment) await api(`/api/admin/crm/segments/${segment.id}`, "PATCH", { name, description, segment_type: segmentType, definition });
                else await api("/api/admin/crm/segments", "POST", { name, description, segment_type: segmentType, definition });
                router.refresh();
                onClose();
              } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
            }}
          >
            {busy ? "Saving…" : "Save segment"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SegmentRowControls({ segmentId }: { segmentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <button
        className="crm-btn crm-ghost crm-sm"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await api(`/api/admin/crm/segments/${segmentId}/refresh`, "POST");
            setMsg(`${(r as { member_count: number }).member_count} members`);
            router.refresh();
          } finally { setBusy(false); }
        }}
      >
        {busy ? "Refreshing…" : "Refresh members"}
      </button>
      {msg && <span className="crm-muted crm-small">{msg}</span>}
    </span>
  );
}

export function NewSegmentButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="crm-btn" type="button" onClick={() => setOpen(true)}>New segment</button>
      {open && <SegmentForm onClose={() => setOpen(false)} />}
    </>
  );
}

export function EditSegmentButton({ segment }: { segment: { id: string; name: string; description: string | null; segment_type: string; definition: { match?: string; rules: { field: string; op: string; value: string }[] } } }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="crm-btn crm-ghost crm-sm" type="button" onClick={() => setOpen(true)}>Edit</button>
      {open && <SegmentForm segment={segment} onClose={() => setOpen(false)} />}
    </>
  );
}

export function DeleteSegmentButton({ segmentId }: { segmentId: string }) {
  const router = useRouter();
  return (
    <button
      className="crm-btn crm-danger crm-sm"
      type="button"
      onClick={async () => {
        if (!confirm("Delete this segment and its membership history?")) return;
        await api(`/api/admin/crm/segments/${segmentId}`, "DELETE");
        router.push("/admin/crm/segments");
        router.refresh();
      }}
    >
      Delete
    </button>
  );
}
