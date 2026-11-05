'use client'

import { useEffect, useMemo, useState } from "react"
import { PenSquare, Send, Clock, Save } from "lucide-react"

// Composer (social module). Pick accounts, write once, optionally promote
// one of your listings (its public link is attached with your UTM
// attribution), add media by URL, then publish now, save a draft, schedule
// a time, or drop it in your next posting slot. Per-platform extras appear
// when a platform needs them (Slack channel, YouTube/Reddit title, ...).
type Account = { id: string; platform: string; display_name: string | null; handle: string | null }
type Product = { id: string; name: string; image?: string }
type Slot = { weekday: number; time_local: string; timezone: string; label: string | null }

function nextSlot(slots: Slot[]): string | null {
  if (!slots.length) return null
  const now = new Date()
  for (let add = 0; add < 8; add++) {
    const d = new Date(now); d.setDate(d.getDate() + add)
    for (const s of slots.filter((x) => x.weekday === d.getDay()).sort((a, b) => a.time_local.localeCompare(b.time_local))) {
      const [h, m] = s.time_local.split(":").map(Number)
      const cand = new Date(d); cand.setHours(h, m, 0, 0)
      if (cand > now) return cand.toISOString()
    }
  }
  return null
}

export function SellerSocialComposer() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [opts, setOpts] = useState<Record<string, { channel?: string; title?: string; subreddit?: string; boardId?: string }>>({})
  const [body, setBody] = useState("")
  const [listingId, setListingId] = useState("")
  const [linkUrl, setLinkUrl] = useState("")
  const [media, setMedia] = useState<string[]>([""])
  const [when, setWhen] = useState<"now" | "draft" | "schedule">("now")
  const [scheduledAt, setScheduledAt] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch("/api/seller/social/accounts").then((r) => r.json()).then((j) => setAccounts(j.accounts ?? [])).catch(() => setAccounts([]))
    fetch("/api/seller/products").then((r) => r.json()).then((j) => setProducts(j.products ?? [])).catch(() => setProducts([]))
    fetch("/api/seller/social/slots").then((r) => r.json()).then((j) => setSlots(j.slots ?? [])).catch(() => setSlots([]))
  }, [])

  const chosen = useMemo(() => accounts.filter((a) => selected[a.id]), [accounts, selected])
  const needsTitle = chosen.some((a) => ["youtube", "reddit", "pinterest", "wordpress", "wordpress_self"].includes(a.platform))
  const slotIso = useMemo(() => nextSlot(slots), [slots])

  const submit = async () => {
    const accountIds = chosen.map((a) => a.id)
    if (!accountIds.length) { setNotice("Pick at least one connected account."); return }
    if (when === "schedule" && !scheduledAt) { setNotice("Pick a date and time, or use your next posting slot."); return }
    setBusy(true)
    const res = await fetch("/api/seller/social/posts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body, listingId: listingId || undefined, linkUrl: linkUrl || undefined,
        accountIds, mediaUrls: media.filter((m) => m.trim()),
        targetOptions: opts, when, scheduledAt: when === "schedule" ? new Date(scheduledAt).toISOString() : undefined,
      }),
    })
    const j = await res.json().catch(() => ({}))
    setBusy(false)
    setNotice(res.ok ? (when === "now" ? `Published — post status: ${j.status}` : when === "schedule" ? "Scheduled." : "Draft saved.") : (j.error ?? "Could not create the post."))
    if (res.ok) window.dispatchEvent(new Event("social-posts-changed"))
  }

  return (
    <section aria-label="Social composer" className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><PenSquare className="h-5 w-5" /> Compose</h2>
      {notice && <p className="rounded-lg border bg-card px-4 py-2 text-sm">{notice}</p>}
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          {accounts.length === 0 && <p className="text-sm text-muted-foreground">Connect an account above first.</p>}
          {accounts.map((a) => (
            <label key={a.id} className="inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm">
              <input type="checkbox" checked={Boolean(selected[a.id])} onChange={(e) => setSelected((s) => ({ ...s, [a.id]: e.target.checked }))} />
              <span className="capitalize">{a.platform}</span><span className="text-muted-foreground">{a.display_name ?? a.handle ?? ""}</span>
            </label>
          ))}
        </div>
        {chosen.map((a) => (
          <div key={a.id} className="flex flex-wrap gap-2 text-sm">
            <span className="w-28 capitalize">{a.platform}</span>
            {a.platform === "slack" && <input placeholder="#channel" className="rounded-lg border bg-background px-2 py-1.5" value={opts[a.id]?.channel ?? ""} onChange={(e) => setOpts((o) => ({ ...o, [a.id]: { ...o[a.id], channel: e.target.value } }))} />}
            {a.platform === "reddit" && <input placeholder="r/subreddit" className="rounded-lg border bg-background px-2 py-1.5" value={opts[a.id]?.subreddit ?? ""} onChange={(e) => setOpts((o) => ({ ...o, [a.id]: { ...o[a.id], subreddit: e.target.value } }))} />}
            {a.platform === "pinterest" && <input placeholder="Board ID" className="rounded-lg border bg-background px-2 py-1.5" value={opts[a.id]?.boardId ?? ""} onChange={(e) => setOpts((o) => ({ ...o, [a.id]: { ...o[a.id], boardId: e.target.value } }))} />}
            {needsTitle && ["youtube", "reddit", "pinterest", "wordpress", "wordpress_self"].includes(a.platform) && <input placeholder="Title for this platform" className="min-w-52 flex-1 rounded-lg border bg-background px-2 py-1.5" value={opts[a.id]?.title ?? ""} onChange={(e) => setOpts((o) => ({ ...o, [a.id]: { ...o[a.id], title: e.target.value } }))} />}
          </div>
        ))}
        <textarea rows={4} placeholder="Write your post…" className="w-full rounded-lg border bg-background px-3 py-2 text-sm" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Promote a listing (optional)</span>
            <select className="w-full rounded-lg border bg-background px-2 py-2" value={listingId} onChange={(e) => setListingId(e.target.value)}>
              <option value="">None</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
          <label className="space-y-1 text-sm"><span className="text-muted-foreground">Or a link URL</span>
            <input placeholder="https://…" className="w-full rounded-lg border bg-background px-2 py-2" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} /></label>
        </div>
        <div className="space-y-1">
          {media.map((m, i) => (
            <input key={i} placeholder="Media URL (image or video, publicly reachable)" className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" value={m}
              onChange={(e) => setMedia((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
          <button onClick={() => setMedia((arr) => [...arr, ""])} className="text-xs underline">Add another media URL</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border">
            {(["now", "draft", "schedule"] as const).map((w) => (
              <button key={w} onClick={() => setWhen(w)} className={`px-3 py-1.5 text-sm ${when === w ? "bg-primary text-primary-foreground" : ""}`}>{w === "now" ? "Publish now" : w === "draft" ? "Draft" : "Schedule"}</button>
            ))}
          </div>
          {when === "schedule" && <>
            <input type="datetime-local" className="rounded-lg border bg-background px-2 py-1.5 text-sm" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            {slotIso && <button onClick={() => setScheduledAt(slotIso.slice(0, 16))} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-sm"><Clock className="h-4 w-4" /> Next slot: {new Date(slotIso).toLocaleString()}</button>}
          </>}
          <button disabled={busy} onClick={submit} className="ml-auto inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {when === "now" ? <Send className="h-4 w-4" /> : <Save className="h-4 w-4" />} {busy ? "Working…" : when === "now" ? "Publish" : when === "schedule" ? "Schedule post" : "Save draft"}
          </button>
        </div>
      </div>
    </section>
  )
}
