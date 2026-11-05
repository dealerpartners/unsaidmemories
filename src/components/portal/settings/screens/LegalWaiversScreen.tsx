'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Save, CheckCircle2, Plus, AlertCircle, ExternalLink } from 'lucide-react';
import type { SystemSettings } from '@/lib/settings-types';

interface ScreenProps {
  onNavigateScreen?: (screenId: string) => void;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
  systemSettings?: SystemSettings;
  saveSettingsToDb?: (updates: Partial<SystemSettings>) => void;
}

// ---------------------------------------------------------------------------
// Legal & Waivers — wired to the REAL policies store.
//   Read:  GET /api/admin/policies (doc store: doc_articles, policy type)
//   Write: POST /api/admin/cms/actions cms_edit_legal_waivers
//          (upserts into the doc store by title — the exact store the public
//          /policies/[slug] pages render, and the store booking waivers
//          resolve from; proven round-trip in Section A.9).
// The old screen kept 3 invented waivers in local state and wrote policy
// text into generic settings keys nothing reads. There is no delete and
// no "required" flag because the policies table has neither — the full
// policy manager at /admin/policies works on the same store.
// ---------------------------------------------------------------------------

interface Policy {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
}

async function savePolicy(title: string, body: string) {
  const r = await fetch('/api/admin/cms/actions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cms_edit_legal_waivers', payload: { title, body } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error || `Save failed (${r.status})`);
  return j as Record<string, any>;
}

export const LegalWaiversScreen: React.FC<ScreenProps> = () => {
  const [policies, setPolicies] = useState<Policy[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/policies');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const rows: Policy[] = (j.policies || []).map((p: any) => ({
        id: String(p.id), title: p.title, body: p.body || '', updatedAt: p.updatedAt,
      }));
      setPolicies(rows);
      setEdits(Object.fromEntries(rows.map((p) => [p.id, p.body])));
      setLoadError(null);
    } catch (e) {
      setPolicies([]);
      setLoadError(e instanceof Error ? e.message : 'load failed');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (p: Policy) => {
    setBusy(true);
    try {
      await savePolicy(p.title, edits[p.id] ?? p.body);
      setErr(null);
      setMsg(`"${p.title}" saved to the policies store — the public /policies page renders this text.`);
      await load();
    } catch (e) {
      setMsg(null);
      setErr(e instanceof Error ? e.message : 'save failed');
    } finally { setBusy(false); }
  };

  const add = async () => {
    if (!newTitle.trim() || !newBody.trim()) return;
    setBusy(true);
    try {
      await savePolicy(newTitle.trim(), newBody.trim());
      setErr(null);
      setMsg(`"${newTitle.trim()}" added to the policies store.`);
      setNewTitle(''); setNewBody(''); setShowAdd(false);
      await load();
    } catch (e) {
      setMsg(null);
      setErr(e instanceof Error ? e.message : 'save failed');
    } finally { setBusy(false); }
  };

  if (policies === null) return <div className="p-8 text-center text-muted-foreground text-[13px]">Loading policies…</div>;

  return (
    <div className="p-6 space-y-6 font-bar">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <FileText className="size-5 text-primary" />
            Legal & Waivers
          </h2>
          <p className="text-[13px] text-muted-foreground mt-1">
            The live policies store — the same documents the public /policies pages render and booking waivers resolve from. Edits save immediately to the database.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/admin/policies" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background hover:bg-accent h-9 px-3.5 text-[13px] font-medium">
            <ExternalLink className="size-4" /> Full Policy Manager
          </a>
          <button onClick={() => setShowAdd(!showAdd)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-3.5 text-[13px] font-medium cursor-pointer">
            <Plus className="size-4" /> Add Policy / Waiver
          </button>
        </div>
      </div>

      {loadError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
          <AlertCircle className="size-4" /> Policies failed to load ({loadError}).
        </div>
      )}
      {msg && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-[13px] text-foreground">
          <CheckCircle2 className="size-4 text-success" /> {msg}
        </div>
      )}
      {err && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive">
          <AlertCircle className="size-4" /> {err}
        </div>
      )}

      {showAdd && (
        <div className="bg-card border border-border rounded-xl shadow-card p-5 space-y-3">
          <h3 className="text-[15px] font-semibold text-foreground">New Policy / Waiver</h3>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">Title *</label>
            <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Grooming Liability Waiver" className="w-full h-9 bg-background border border-input rounded-lg px-3 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground block mb-1">Text *</label>
            <textarea value={newBody} onChange={(e) => setNewBody(e.target.value)} rows={6} className="w-full bg-background border border-input rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAdd(false)} className="h-9 px-3.5 rounded-lg border border-border bg-background hover:bg-accent text-[13px] font-medium cursor-pointer">Cancel</button>
            <button onClick={add} disabled={busy || !newTitle.trim() || !newBody.trim()} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-[13px] font-medium cursor-pointer disabled:opacity-50">
              <Save className="size-4" /> Save to Policies
            </button>
          </div>
        </div>
      )}

      {policies.length === 0 && !loadError ? (
        <div className="bg-card border border-border rounded-xl shadow-card p-6 text-center text-[13px] text-muted-foreground">
          No policies in the store yet. Add the first one above — it publishes to /policies immediately.
        </div>
      ) : (
        <div className="space-y-4">
          {policies.map((p) => (
            <div key={p.id} className="bg-card border border-border rounded-xl shadow-card p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-semibold text-foreground">{p.title}</h3>
                <span className="text-[11px] text-muted-foreground">Updated {new Date(p.updatedAt).toLocaleDateString()}</span>
              </div>
              <textarea
                value={edits[p.id] ?? p.body}
                onChange={(e) => setEdits((prev) => ({ ...prev, [p.id]: e.target.value }))}
                rows={6}
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-[13px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">Public page: /policies/{p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}</p>
                <button onClick={() => save(p)} disabled={busy} className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-[13px] font-medium cursor-pointer disabled:opacity-50">
                  <Save className="size-4" /> Save Policy
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
