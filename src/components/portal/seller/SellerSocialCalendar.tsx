'use client'

import { useEffect, useMemo, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"

// Calendar (social module) — month view of scheduled + published posts.
// Click a day to see its posts underneath. Rescheduling lives on each
// post's card in the Posts section (drag-free, honest controls).
type Post = { id: string; body: string | null; status: string; scheduled_at: string | null; created_at: string; social_post_targets?: { platform: string }[] }

export function SellerSocialCalendar() {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [posts, setPosts] = useState<Post[]>([])
  const [day, setDay] = useState<string | null>(null)

  const { from, to } = useMemo(() => {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59)
    return { from: start.toISOString(), to: end.toISOString() }
  }, [cursor])

  useEffect(() => {
    fetch(`/api/seller/social/posts?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then((r) => r.json()).then((j) => setPosts(j.posts ?? [])).catch(() => setPosts([]))
  }, [from, to])

  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>()
    for (const p of posts) {
      const when = p.scheduled_at ?? p.created_at
      const key = new Date(when).toDateString()
      m.set(key, [...(m.get(key) ?? []), p])
    }
    return m
  }, [posts])

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const startOffset = first.getDay()
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
    const arr: (Date | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: days }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1))]
    return arr
  }, [cursor])

  const dayPosts = day ? byDay.get(day) ?? [] : []

  return (
    <section aria-label="Social calendar" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarDays className="h-5 w-5" /> Calendar</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="rounded-lg border p-1.5"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-36 text-center text-sm font-medium">{cursor.toLocaleString(undefined, { month: "long", year: "numeric" })}</span>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="rounded-lg border p-1.5"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="px-1 text-xs font-medium text-muted-foreground">{d}</div>)}
        {cells.map((d, i) => d === null ? <div key={i} /> : (
          <button key={i} onClick={() => setDay(d.toDateString())} className={`min-h-16 rounded-lg border p-1 text-left align-top ${day === d.toDateString() ? "border-primary" : "bg-card"}`}>
            <span className="text-xs font-medium">{d.getDate()}</span>
            <span className="mt-0.5 block space-y-0.5">
              {(byDay.get(d.toDateString()) ?? []).slice(0, 3).map((p) => (
                <span key={p.id} className={`block truncate rounded px-1 text-[10px] ${p.status === "published" ? "bg-green-100 text-green-900" : p.status === "failed" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900"}`}>
                  {new Date(p.scheduled_at ?? p.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} {(p.body ?? "post").slice(0, 18)}
                </span>
              ))}
              {(byDay.get(d.toDateString()) ?? []).length > 3 && <span className="block text-[10px] text-muted-foreground">+{(byDay.get(d.toDateString()) ?? []).length - 3} more</span>}
            </span>
          </button>
        ))}
      </div>
      {day && (
        <div className="space-y-1 rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold">{day}</h3>
          {dayPosts.length === 0 ? <p className="text-sm text-muted-foreground">Nothing scheduled.</p> : dayPosts.map((p) => (
            <p key={p.id} className="text-sm">{new Date(p.scheduled_at ?? p.created_at).toLocaleTimeString()} — {p.status} — {(p.body ?? "").slice(0, 100)} <span className="text-muted-foreground">({(p.social_post_targets ?? []).map((t) => t.platform).join(", ")})</span></p>
          ))}
        </div>
      )}
    </section>
  )
}
