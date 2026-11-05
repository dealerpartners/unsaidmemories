"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Profile save — availability + concurrent-chat capacity write to the
// member's support_team_members row.
export default function ProfileForm({ memberId, available, maxConcurrent }: {
  memberId: string; available: boolean; maxConcurrent: number;
}) {
  const router = useRouter();
  const [avail, setAvail] = useState(available ? "available" : "offline");
  const [max, setMax] = useState(String(maxConcurrent));
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setSaved(false);
    try {
      const res = await fetch(`/api/admin/support/team-members/${memberId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_available: avail === "available", max_concurrent: Number(max) || 1 }),
      });
      if (!res.ok) throw new Error();
      setSaved(true); router.refresh();
    } catch { /* surfaced by the unchanged state */ }
    setBusy(false);
  }

  return (
    <>
      <div className="formrow">
        <label htmlFor="pf-avail">Availability</label>
        <select id="pf-avail" value={avail} onChange={(e) => setAvail(e.target.value)}>
          <option value="available">Available</option>
          <option value="offline">Offline</option>
        </select>
      </div>
      <div className="formrow">
        <label htmlFor="pf-max">Maximum concurrent chats</label>
        <input id="pf-max" type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} />
      </div>
      <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save profile"}</button>
      {saved && <span className="tiny" style={{ marginLeft: 10, color: "#19845c", fontWeight: 700 }}>Saved</span>}
    </>
  );
}
