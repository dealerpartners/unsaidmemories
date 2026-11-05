'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ImageIcon, Copy, Trash2, Upload } from 'lucide-react';

type MediaItem = {
  path: string; name: string; size: number | null;
  mimetype: string | null; updated_at: string | null; url: string;
};

type LibraryRow = {
  id: string; store: 'commerce' | 'governed';
  listing_title: string | null; seller_name: string | null;
  media_type: string; url: string; alt_text: string | null;
  is_primary: boolean; moderation_status: string | null;
};

// G1 · Media library — two faces over ONE library (BL-13): the bucket
// browser (blob storage every upload lands in) and, below it, the shared
// library chain (lib/media/library.ts) — the governed listing-media and
// storefront catalog-media records the seller portal reads too, with
// their moderation state. Preview, copy the public URL, upload into the
// current folder, delete. Everything shown is real; an empty face says so.
export default function MediaLibraryPage() {
  const [prefix, setPrefix] = useState('');
  const [folders, setFolders] = useState<string[]>([]);
  const [subfolders, setSubfolders] = useState<string[]>([]);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [library, setLibrary] = useState<LibraryRow[]>([]);
  const [libraryQ, setLibraryQ] = useState('');
  const [libraryLoading, setLibraryLoading] = useState(true);

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const r = await fetch(`/api/admin/media?view=library${libraryQ ? `&q=${encodeURIComponent(libraryQ)}` : ''}`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setLibrary(j.library || []);
    } catch { setLibrary([]); } finally { setLibraryLoading(false); }
  }, [libraryQ]);

  useEffect(() => { loadLibrary(); }, [loadLibrary]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/admin/media${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''}`, { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      if (!prefix) setFolders(j.folders || []);
      setSubfolders(j.subfolders || []);
      setItems(j.items || []);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [prefix]);

  useEffect(() => { load(); }, [load]);

  const upload = async (file: File) => {
    setUploading(true); setError(null); setNotice(null);
    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('path', prefix || 'products');
      const r = await fetch('/api/admin/media', { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setNotice(`Uploaded ${j.path}`);
      await load();
    } catch (e: any) { setError(e.message); } finally { setUploading(false); }
  };

  const del = async (item: MediaItem) => {
    if (!window.confirm(`Delete ${item.path}? Anything referencing this URL will lose the image.`)) return;
    setError(null); setNotice(null);
    try {
      const r = await fetch('/api/admin/media', {
        method: 'DELETE', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: item.path }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setNotice(`Deleted ${item.path}`);
      await load();
    } catch (e: any) { setError(e.message); }
  };

  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setNotice('URL copied'); }
    catch { setNotice(url); }
  };

  const crumbs = prefix ? prefix.split('/') : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
            <ImageIcon className="size-6" /> Media Library
          </h1>
        </div>
        <div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-[13px] font-medium text-brand-teal hover:border-brand-teal/60 hover:bg-brand-teal/5 disabled:opacity-50">
            <Upload className="size-4" /> {uploading ? 'Uploading…' : `Upload${prefix ? ` to ${prefix}` : ''}`}
          </button>
        </div>
      </div>

      {error && <div className="text-[13px] text-red-600">{error}</div>}
      {notice && <div className="text-[13px] text-muted-foreground">{notice}</div>}

      <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
        <button onClick={() => setPrefix('')} className={`rounded-lg border px-2.5 py-1 font-medium ${prefix === '' ? 'bg-brand-teal/10 text-brand-teal' : 'hover:bg-muted'}`}>All folders</button>
        {folders.map((f) => (
          <button key={f} onClick={() => setPrefix(f)}
            className={`rounded-lg border px-2.5 py-1 font-medium ${prefix === f || prefix.startsWith(f + '/') ? 'bg-brand-teal/10 text-brand-teal' : 'hover:bg-muted'}`}>{f}</button>
        ))}
        {crumbs.length > 1 && (
          <button onClick={() => setPrefix(crumbs.slice(0, -1).join('/'))} className="rounded-lg border px-2.5 py-1 font-medium hover:bg-muted">↑ {crumbs.slice(0, -1).join('/')}</button>
        )}
        {subfolders.map((sf) => (
          <button key={sf} onClick={() => setPrefix(prefix ? `${prefix}/${sf}` : sf)}
            className="rounded-lg border border-dashed px-2.5 py-1 font-medium hover:bg-muted">{sf}/</button>
        ))}
      </div>

      {loading ? <p className="text-[13px] text-muted-foreground">Loading…</p>
        : items.length === 0 ? (
          <div className="bg-card border border-border rounded-xl px-5 py-10 text-center">
            <p className="text-[13px] text-muted-foreground">
              No images {prefix ? <>in <span className="font-mono text-[12px]">{prefix}</span></> : 'in the library'} yet. Uploads from the product, brand, and category editors land here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-5">
            {items.map((it) => (
              <div key={it.path} className="bg-card border border-border rounded-xl overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.url} alt={it.name} className="h-36 w-full object-cover bg-muted" loading="lazy" />
                <div className="p-3">
                  <p className="text-[12px] font-medium truncate" title={it.path}>{it.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {it.size !== null ? `${(it.size / 1024).toFixed(1)} KB` : 'size unknown'}
                    {it.updated_at ? ` · ${new Date(it.updated_at).toLocaleDateString()}` : ''}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => copy(it.url)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium hover:bg-muted">
                      <Copy className="size-3" /> Copy URL
                    </button>
                    <button onClick={() => del(it)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-muted">
                      <Trash2 className="size-3" /> Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      <div className="border-t border-border pt-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Listing &amp; catalog media</h2>
            <p className="text-[13px] text-muted-foreground mt-1">
              The shared library chain: the same media records the seller portal works with — governed listing
              media (with moderation state) and storefront catalog media — read through one accessor.
            </p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void loadLibrary(); }} className="flex gap-2">
            <input value={libraryQ} onChange={(e) => setLibraryQ(e.target.value)} placeholder="Search title, seller, URL…"
              className="rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-[13px] w-56" />
            <button type="submit" className="rounded-lg border px-3 py-1.5 text-[13px] font-medium hover:bg-muted">Search</button>
          </form>
        </div>
        {libraryLoading ? <p className="text-[13px] text-muted-foreground">Loading…</p>
          : library.length === 0 ? (
            <div className="bg-card border border-border rounded-xl px-5 py-8 text-center">
              <p className="text-[13px] text-muted-foreground">No listing or catalog media records yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-5">
              {library.map((m) => (
                <div key={`${m.store}-${m.id}`} className="bg-card border border-border rounded-xl overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.alt_text || m.listing_title || 'media'} className="h-36 w-full object-cover bg-muted" loading="lazy" />
                  <div className="p-3">
                    <p className="text-[12px] font-medium truncate" title={m.listing_title || ''}>{m.listing_title || 'Untitled'}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {m.store === 'governed' ? 'Governed listing media' : 'Storefront catalog media'}
                      {m.seller_name ? ` · ${m.seller_name}` : ''}
                      {m.is_primary ? ' · primary' : ''}
                    </p>
                    {m.moderation_status && (
                      <p className="text-[11px] mt-0.5">
                        <span className={`inline-flex rounded-full px-1.5 py-0.5 font-medium ${m.moderation_status === 'approved' ? 'adm-badge adm-badge-green' : m.moderation_status === 'rejected' ? 'adm-badge adm-badge-red' : 'adm-badge adm-badge-amber'}`}>
                          moderation: {m.moderation_status}
                        </span>
                      </p>
                    )}
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => copy(m.url)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium hover:bg-muted">
                        <Copy className="size-3" /> Copy URL
                      </button>
                      {m.store === 'governed' && (
                        <a href="/admin/trust-safety/moderation/photos" className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium hover:bg-muted">
                          Moderate
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}
