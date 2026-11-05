"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StaffEditForm({
  id,
  initial,
}: {
  id: string;
  initial: { display_name: string; phone: string; role_type: string; is_owner: boolean };
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("saving");
    setError("");
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Save failed");
      setState("saved");
      router.refresh();
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <form onSubmit={submit}>
      {state === "error" && <div className="adm-alert adm-alert-error">{error}</div>}
      {state === "saved" && <div className="adm-alert adm-alert-ok">Saved.</div>}
      <div className="adm-field">
        <label className="adm-label">Display name</label>
        <input className="adm-input" value={values.display_name} onChange={(e) => setValues((v) => ({ ...v, display_name: e.target.value }))} data-tip="The name shown around the admin next to everything this person does." />
      </div>
      <div className="adm-field">
        <label className="adm-label">Phone</label>
        <input className="adm-input" value={values.phone} onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))} data-tip="Their phone number — kept on the staff record for contact only." />
      </div>
      <div className="adm-field">
        <label className="adm-label">Assigned role</label>
        <select className="adm-select" value={values.role_type} onChange={(e) => setValues((v) => ({ ...v, role_type: e.target.value }))} data-tip="Their job title. What they can open and change is set on Roles & Permissions, not by this title.">
          {["Super Admin", "Manager", "Staff", "Support Agent", "Accountant", "Fulfillment"].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <div className="adm-field">
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
          <input
            type="checkbox"
            data-tip="Owners can open and change everything in the admin, including people’s access. Tick this only for someone you trust completely."
            checked={values.is_owner}
            onChange={(e) => setValues((v) => ({ ...v, is_owner: e.target.checked }))}
          />
          Owner — full access to every module
        </label>
      </div>
      <button className="adm-btn" type="submit" disabled={state === "saving"} data-tip="Save these details on the staff record.">
        {state === "saving" ? "Saving…" : "Save staff record"}
      </button>
    </form>
  );
}
