"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader, Button, FormField } from "@/components/ads/ui";

type Group = { id: string; name: string; status: string; campaign_name: string };

export default function Page() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [group, setGroup] = useState<Group | null>(null);
  const [missing, setMissing] = useState(false);
  const [name, setName] = useState("");
  const [status, setStatus] = useState("active");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!params?.id) return;
    fetch(`/api/ads/groups/${params.id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("nf"))))
      .then((d) => { setGroup(d.group); setName(d.group.name); setStatus(d.group.status); })
      .catch(() => setMissing(true));
  }, [params?.id]);

  if (missing) return <div><PageHeader title="Ad group not found" description="This ad group doesn't exist or isn't on your account." /></div>;
  if (!group) return <div><PageHeader title="Edit Ad Group" description="Loading…" /></div>;

  const save = () => {
    setNote("");
    if (!name.trim()) { setNote("The ad group needs a name."); return; }
    setSaving(true);
    fetch(`/api/ads/groups/${group.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), status }) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "save_failed"); router.push(`/ads/campaigns/groups/${group.id}`); })
      .catch((e) => { setNote("Couldn't save: " + String(e?.message || "unknown error")); setSaving(false); });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Edit Ad Group" description={`${group.name} · in ${group.campaign_name}`} />
      {note && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{note}</div>}
      <div className="space-y-5 rounded-xl border border-neutral-100 bg-white p-6">
        <FormField label="Ad group name">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none" />
        </FormField>
        <FormField label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
        </FormField>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={() => router.push(`/ads/campaigns/groups/${group.id}`)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>Save Changes</Button>
        </div>
      </div>
    </div>
  );
}
