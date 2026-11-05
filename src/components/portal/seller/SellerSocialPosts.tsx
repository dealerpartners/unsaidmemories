'use client'

import { useCallback, useEffect, useState } from "react"
import { ListOrdered, ExternalLink, RefreshCw, HandMetal, Trash2, Send } from "lucide-react"

// Posts (social module) — this seller's posts with per-platform targets.
// Actions: publish now, retry failed, retry UNKNOWN only after an explicit
// "I checked, it never posted" confirmation (double-post guard), confirm
// handoff completion, reschedule, delete.
type Target = { id: string; platform: string; status: string; platform_url: string | null; error_message: string | null; social_account_id: string }
type Post = { id: string; body: string | null; status: string; scheduled_at: string | null; created_at: string; social_post_targets?: Target[] }

export function SellerSocialPosts() {
  const [posts, setPosts] = useState<Post[]>([])
  const [notice, setNotice] = useState("")
  const [confirmUnknown, setConfirmUnknown] = useState<Record<string, boolean>>({})
  const [reschedule, setReschedule] = useState<Record<string, string>>({})

  const load = useCallback(() => { fetch("/api/seller/social/posts").then((r) => r.json()).then((j) => setPosts(j.posts ?? [])).catch(() => setPosts([])) }, [])
  useEffect(() => {
    load()
    const h = () => load()
    window.addEventListener("social-posts-changed", h)
    return () => window.removeEventListener("social-posts-changed", h)
  }, [load])

  const act = async (post: Post, action: string, targetId?: string) => {
    const res = await fetch(`/api/seller/social/posts/${post.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, targetId, confirm: action === "retry_unknown" ? Boolean(confirmUnknown[targetId ?? ""]) : undefined }) })
    const j = await res.json().catch(() => ({}))
    setNotice(res.ok ? `${action}: done (post ${j.status ?? post.status})` : (j.error ?? "Action failed"))
    if (res.ok) load()
  }
  const del = async (post: Post) => {
    const res = await fetch(`/api/seller/social/posts/${post.id}`, { method: "DELETE" })
    setNotice(res.ok ? "Post deleted" : "Delete failed")
    if (res.ok) load()
  }
  const resched = async (post: Post) => {
    const v = reschedule[post.id]
    if (!v) return
    const res = await fetch(`/api/seller/social/posts/${post.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scheduledAt: new Date(v).toISOString() }) })
    setNotice(res.ok ? "Rescheduled" : "Reschedule failed")
    if (res.ok) load()
  }

  return (
    <section aria-label="Social posts" className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><ListOrdered className="h-5 w-5" /> Posts</h2>
      {notice && <p className="rounded-lg border bg-card px-4 py-2 text-sm">{notice}</p>}
      {posts.length === 0 ? <p className="text-sm text-muted-foreground">No posts yet — compose your first one above.</p> : (
        <ul className="space-y-3">
          {posts.map((p) => (
            <li key={p.id} className="space-y-2 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">{p.status}{p.scheduled_at ? ` · ${new Date(p.scheduled_at).toLocaleString()}` : ""}</span>
                <span className="text-muted-foreground">{new Date(p.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm">{(p.body ?? "").slice(0, 280) || <span className="text-muted-foreground">(listing post)</span>}</p>
              <ul className="space-y-1">
                {(p.social_post_targets ?? []).map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="capitalize">{t.platform}</span>
                    <span className={t.status === "published" ? "text-green-800" : t.status === "failed" || t.status === "unknown" ? "text-red-700" : "text-muted-foreground"}>{t.status}</span>
                    {t.platform_url && <a href={t.platform_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">View <ExternalLink className="h-3 w-3" /></a>}
                    {t.error_message && <span className="text-xs text-muted-foreground">{t.error_message.slice(0, 160)}</span>}
                    {t.status === "failed" && <button onClick={() => act(p, "retry", t.id)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs"><RefreshCw className="h-3 w-3" /> Retry</button>}
                    {t.status === "unknown" && <>
                      <label className="inline-flex items-center gap-1 text-xs"><input type="checkbox" checked={Boolean(confirmUnknown[t.id])} onChange={(e) => setConfirmUnknown((c) => ({ ...c, [t.id]: e.target.checked }))} /> I checked — it never posted</label>
                      <button disabled={!confirmUnknown[t.id]} onClick={() => act(p, "retry_unknown", t.id)} className="rounded-lg border px-2 py-0.5 text-xs disabled:opacity-50">Retry (confirmed)</button>
                    </>}
                    {t.status === "handoff_pending" && <button onClick={() => act(p, "confirm_handoff", t.id)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs"><HandMetal className="h-3 w-3" /> I finished it in the app</button>}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                {(p.status === "draft" || p.status === "scheduled") && <button onClick={() => act(p, "publish_now")} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"><Send className="h-3 w-3" /> Publish now</button>}
                {(p.status === "draft" || p.status === "scheduled") && <>
                  <input type="datetime-local" className="rounded-lg border bg-background px-2 py-1 text-xs" value={reschedule[p.id] ?? ""} onChange={(e) => setReschedule((r) => ({ ...r, [p.id]: e.target.value }))} />
                  <button onClick={() => resched(p)} className="rounded-lg border px-2 py-1 text-xs">Reschedule</button>
                </>}
                {p.status !== "publishing" && <button onClick={() => del(p)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs"><Trash2 className="h-3 w-3" /> Delete</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
