'use client'

import { useCallback, useEffect, useState } from "react"
import { Link2, TriangleAlert, Unlink } from "lucide-react"

// Accounts + connect (social module). Lists this seller's connected
// accounts from GET /api/seller/social/accounts and renders the right
// connect path per platform from GET /api/seller/social/platforms:
// OAuth link, credential form, operator-bot form, or handoff handle.
// Honest states everywhere: unconfigured platforms say so, nothing faked.
type Account = { id: string; platform: string; display_name: string | null; handle: string | null; status: string; access_status: string; last_refresh_error: string | null }
type Platform = { id: string; label: string; capability: string; connectKind: string; configured: boolean }

export function SellerSocialAccounts() {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [storeAvailable, setStoreAvailable] = useState<boolean | null>(null)
  const [notice, setNotice] = useState("")
  const [forms, setForms] = useState<Record<string, Record<string, string>>>({})
  const [banner, setBanner] = useState("")

  const load = useCallback(() => {
    fetch("/api/seller/social/accounts").then((r) => r.json()).then((j) => { setStoreAvailable(Boolean(j.storeAvailable)); setAccounts(Array.isArray(j.accounts) ? j.accounts : []) }).catch(() => { setStoreAvailable(false); setAccounts([]) })
    fetch("/api/seller/social/platforms").then((r) => r.json()).then((j) => setPlatforms(j.platforms ?? [])).catch(() => setPlatforms([]))
  }, [])
  useEffect(() => {
    load()
    const q = new URLSearchParams(window.location.search)
    if (q.get("connected")) setBanner(`Connected: ${q.get("connected")}`)
    if (q.get("error")) setBanner(q.get("error") ?? "")
  }, [load])

  const set = (pid: string, k: string, v: string) => setForms((f) => ({ ...f, [pid]: { ...(f[pid] ?? {}), [k]: v } }))
  const submitCreds = async (p: Platform) => {
    const kind = p.connectKind === "handoff" ? "handoff" : p.connectKind
    const res = await fetch("/api/seller/social/connect/credentials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, platform: p.id, ...(forms[p.id] ?? {}) }) })
    const j = await res.json().catch(() => ({}))
    setNotice(res.ok ? `${p.label}: connected` : `${p.label}: ${j.error ?? "connect failed"}`)
    if (res.ok) load()
  }
  const disconnect = async (a: Account) => {
    const res = await fetch(`/api/seller/social/accounts/${a.id}`, { method: "DELETE" })
    setNotice(res.ok ? `${a.platform}: disconnected` : `${a.platform}: disconnect failed`)
    if (res.ok) load()
  }
  const saveDefault = async (a: Account, key: string, value: string) => {
    const res = await fetch(`/api/seller/social/accounts/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) })
    setNotice(res.ok ? `${a.platform}: setting saved` : `${a.platform}: save failed`)
  }

  return (
    <section aria-label="Connected social accounts" className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Link2 className="h-5 w-5" /> Connected accounts</h2>
      {banner && <p className="rounded-lg border bg-card px-4 py-2 text-sm">{banner}</p>}
      {notice && <p className="rounded-lg border bg-card px-4 py-2 text-sm">{notice}</p>}
      {accounts === null ? <p className="text-sm text-muted-foreground">Loading your connected accounts…</p>
        : storeAvailable === false ? <p className="text-sm text-muted-foreground">The publishing module store is not available yet, so connected accounts can&apos;t be shown.</p>
        : accounts.length === 0 ? <p className="text-sm text-muted-foreground">No accounts connected yet — connect one below.</p>
        : (
          <ul className="divide-y rounded-xl border bg-card">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                <span className="font-medium capitalize">{a.platform}</span>
                <span>{a.display_name ?? a.handle ?? "—"}</span>
                {a.access_status === "refresh_failed" ? <span className="inline-flex items-center gap-1 text-red-700"><TriangleAlert className="h-3.5 w-3.5" /> Token refresh failed — reconnect</span>
                  : a.access_status === "private_only_until_approved" ? <span className="text-amber-700">Private-only until the platform approves the app</span>
                  : <span className="text-muted-foreground">{a.status}</span>}
                {a.platform === "slack" && <DefaultField label="Default channel" onSave={(v) => saveDefault(a, "defaultChannel", v)} />}
                {a.platform === "reddit" && <DefaultField label="Default subreddit" onSave={(v) => saveDefault(a, "defaultSubreddit", v)} />}
                {a.platform === "pinterest" && <DefaultField label="Default board ID" onSave={(v) => saveDefault(a, "defaultBoardId", v)} />}
                {a.platform === "google_business" && <DefaultField label="Location name" onSave={(v) => saveDefault(a, "locationName", v)} />}
                <button onClick={() => disconnect(a)} className="ml-auto inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs"><Unlink className="h-3.5 w-3.5" /> Disconnect</button>
              </li>
            ))}
          </ul>
        )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {platforms.map((p) => (
          <div key={p.id} className="space-y-2 rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between"><span className="font-medium">{p.label}</span>{!p.configured && <span className="text-xs text-muted-foreground">Admin setup needed</span>}</div>
            {p.capability === "user_handoff" && <p className="text-xs text-muted-foreground">This platform has no posting API — posts are prepared here and finished in its app.</p>}
            {p.capability === "messaging" && <p className="text-xs text-muted-foreground">Messaging only — sends to opted-in customers, not a feed.</p>}
            {p.capability === "store_content" && <p className="text-xs text-muted-foreground">Publishes store content (products, posts, pages) — not a social feed.</p>}
            {!p.configured ? <p className="text-sm text-muted-foreground">Your admin hasn&apos;t added this platform&apos;s keys yet.</p>
              : p.connectKind === "oauth" ? (
                p.id === "shopify" ? (
                  <div className="flex gap-2">
                    <input placeholder="your-shop.myshopify.com" className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" value={forms[p.id]?.shop ?? ""} onChange={(e) => set(p.id, "shop", e.target.value)} />
                    <a className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground" href={`/api/seller/social/connect/shopify?shop=${encodeURIComponent(forms[p.id]?.shop ?? "")}`}>Connect</a>
                  </div>
                ) : <a className="inline-block rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground" href={`/api/seller/social/connect/${p.id}`}>Connect</a>
              ) : p.connectKind === "whatsapp" ? <button onClick={() => submitCreds(p)} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Connect business number</button>
              : (
                <form onSubmit={(e) => { e.preventDefault(); submitCreds(p) }} className="space-y-2">
                  {p.connectKind === "bluesky" && <>
                    <input required placeholder="handle.bsky.social" className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" value={forms[p.id]?.handle ?? ""} onChange={(e) => set(p.id, "handle", e.target.value)} />
                    <input required type="password" placeholder="App password" className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" value={forms[p.id]?.appPassword ?? ""} onChange={(e) => set(p.id, "appPassword", e.target.value)} />
                  </>}
                  {p.connectKind === "wordpress_self" && <>
                    <input required placeholder="https://your-site.com" className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" value={forms[p.id]?.siteUrl ?? ""} onChange={(e) => set(p.id, "siteUrl", e.target.value)} />
                    <input required placeholder="WordPress username" className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" value={forms[p.id]?.username ?? ""} onChange={(e) => set(p.id, "username", e.target.value)} />
                    <input required type="password" placeholder="Application password" className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" value={forms[p.id]?.appPassword ?? ""} onChange={(e) => set(p.id, "appPassword", e.target.value)} />
                  </>}
                  {p.connectKind === "telegram" && <input required placeholder="Channel @username or chat ID" className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" value={forms[p.id]?.chat ?? ""} onChange={(e) => set(p.id, "chat", e.target.value)} />}
                  {p.connectKind === "discord" && <input required placeholder="Channel ID" className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" value={forms[p.id]?.channelId ?? ""} onChange={(e) => set(p.id, "channelId", e.target.value)} />}
                  {p.connectKind === "handoff" && <input required placeholder="Username / handle" className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" value={forms[p.id]?.handle ?? ""} onChange={(e) => set(p.id, "handle", e.target.value)} />}
                  <button type="submit" className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Connect</button>
                </form>
              )}
          </div>
        ))}
      </div>
    </section>
  )
}

function DefaultField({ label, onSave }: { label: string; onSave: (v: string) => void }) {
  const [v, setV] = useState("")
  return (
    <span className="inline-flex items-center gap-1">
      <input placeholder={label} className="w-36 rounded-lg border bg-background px-2 py-1 text-xs" value={v} onChange={(e) => setV(e.target.value)} />
      <button onClick={() => onSave(v)} className="rounded-lg border px-2 py-1 text-xs">Save</button>
    </span>
  )
}
