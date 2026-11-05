'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FlaskConical } from 'lucide-react';

type ABTest = {
  id: string; name: string; prompt_id: string | null;
  control_prompt: string; variant_prompt: string;
  traffic_split: number; status: string;
  starts_at: string | null; ends_at: string | null; created_at: string;
  assignment_counts: { control: number; variant: number };
};

const inputCls = 'rounded-lg border px-2 py-1.5 text-[13px] w-full';

// J2 · A/B tests — prompt experiments over public.ai_ab_tests. Assignment
// is deterministic (lib/ai/ab-tests.ts); the counts shown are counted
// from recorded assignments only.
export default function ABTestsPage() {
  const [tests, setTests] = useState<ABTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', control_prompt: '', variant_prompt: '', traffic_split: '50' });
  const [saving, setSaving] = useState(false);
  const [probe, setProbe] = useState<Record<string, { subject: string; result: string }>>({});

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/ai-ops/ab-tests', { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setTests(j.tests || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.name.trim()) { setError('A test name is required.'); return; }
    setSaving(true); setError(null);
    try {
      const r = await fetch('/api/admin/ai-ops/ab-tests', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: form.name, control_prompt: form.control_prompt, variant_prompt: form.variant_prompt, traffic_split: Number(form.traffic_split) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setForm({ name: '', control_prompt: '', variant_prompt: '', traffic_split: '50' });
      await load();
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const setStatus = async (t: ABTest, status: string) => {
    setError(null);
    try {
      const r = await fetch('/api/admin/ai-ops/ab-tests', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: t.id, status }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const runProbe = async (t: ABTest) => {
    const subject = (probe[t.id]?.subject || '').trim();
    if (!subject) return;
    try {
      const r = await fetch('/api/admin/ai-ops/ab-tests/assign', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ test_id: t.id, subject_key: subject }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setProbe((p) => ({ ...p, [t.id]: { subject, result: `${j.variant}${j.live ? (j.recorded ? ' · recorded' : ' · already assigned') : ' · test not live (control served, nothing recorded)'}` } }));
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const btn = 'rounded-lg border px-2 py-1 text-[12px] font-medium hover:bg-muted';

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/ai-ops" className="inline-flex items-center gap-1.5 text-[13px] font-medium underline underline-offset-2">
          <ArrowLeft className="size-4" /> AI Ops
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2 mt-3">
          <FlaskConical className="size-6" /> A/B Tests
        </h1>
      </div>

      {error && <div className="text-[13px] text-red-600">{error}</div>}

      <section className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-[14px] font-semibold mb-3">New test</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-[12px] text-muted-foreground">Name
            <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Greeting tone — concise vs warm" />
          </label>
          <label className="text-[12px] text-muted-foreground">Traffic to variant (%)
            <input className={inputCls} type="number" min="0" max="100" value={form.traffic_split} onChange={(e) => setForm({ ...form, traffic_split: e.target.value })} />
          </label>
          <label className="text-[12px] text-muted-foreground">Control prompt
            <textarea className={inputCls} rows={4} value={form.control_prompt} onChange={(e) => setForm({ ...form, control_prompt: e.target.value })} />
          </label>
          <label className="text-[12px] text-muted-foreground">Variant prompt
            <textarea className={inputCls} rows={4} value={form.variant_prompt} onChange={(e) => setForm({ ...form, variant_prompt: e.target.value })} />
          </label>
        </div>
        <button onClick={create} disabled={saving} className="mt-3 rounded-lg border border-border bg-card px-4 py-2 text-[13px] font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50">
          {saving ? 'Creating…' : 'Create test (draft)'}
        </button>
      </section>

      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-[14px] font-semibold">Tests</h2>
        </div>
        {loading ? (
          <p className="px-5 py-6 text-[13px] text-muted-foreground">Loading…</p>
        ) : tests.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-muted-foreground">No A/B tests yet. Create one above; it starts as a draft and records assignments only while running.</p>
        ) : (
          <div className="adm-table-wrap"><table className="adm-table">
            <thead className="border-b border-border bg-muted/40"><tr>
              <th className="px-5 py-3 font-medium text-muted-foreground">Test</th>
              <th className="px-5 py-3 font-medium text-muted-foreground">Status</th>
              <th className="px-5 py-3 font-medium text-muted-foreground">Split</th>
              <th className="px-5 py-3 font-medium text-muted-foreground">Assignments (control / variant)</th>
              <th className="px-5 py-3 font-medium text-muted-foreground">Actions</th>
              <th className="px-5 py-3 font-medium text-muted-foreground">Probe a subject</th>
            </tr></thead>
            <tbody className="divide-y divide-border">
              {tests.map((t) => (
                <tr key={t.id}>
                  <td className="px-5 py-3 font-medium">{t.name}</td>
                  <td className="px-5 py-3 capitalize">{t.status}</td>
                  <td className="px-5 py-3">{t.traffic_split}% variant</td>
                  <td className="px-5 py-3">{t.assignment_counts.control} / {t.assignment_counts.variant}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {t.status !== 'running' && t.status !== 'completed' && <button className={btn} onClick={() => setStatus(t, 'running')}>Run</button>}
                      {t.status === 'running' && <button className={btn} onClick={() => setStatus(t, 'paused')}>Pause</button>}
                      {t.status !== 'completed' && <button className={btn} onClick={() => setStatus(t, 'completed')}>Complete</button>}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <input
                        className="rounded-lg border px-2 py-1 text-[12px] w-36"
                        placeholder="subject key"
                        value={probe[t.id]?.subject || ''}
                        onChange={(e) => setProbe((p) => ({ ...p, [t.id]: { subject: e.target.value, result: '' } }))}
                      />
                      <button className={btn} onClick={() => runProbe(t)}>Assign</button>
                    </div>
                    {probe[t.id]?.result && <p className="mt-1 text-[11px] text-muted-foreground">{probe[t.id].result}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
