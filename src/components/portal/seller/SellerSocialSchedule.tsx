'use client'

import { useCallback, useEffect, useState } from "react"
import { CalendarClock, Repeat, Trash2 } from "lucide-react"

// Schedule (social module) — weekly posting slots (the composer's
// "Next slot") and evergreen series the worker materializes into
// scheduled posts.
type Slot = { id: string; weekday: number; time_local: string; label: string | null }
type Series = { id: string; name: string; frequency: string; interval: number; time_local: string; status: string }
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export function SellerSocialSchedule() {
  const [slots, setSlots] = useState<Slot[]>([])
  const [series, setSeries] = useState<Series[]>([])
  const [accounts, setAccounts] = useState<{ id: string; platform: string; display_name: string | null }[]>([])
  const [slotForm, setSlotForm] = useState({ weekday: 1, timeLocal: "09:00", label: "" })
  const [seriesForm, setSeriesForm] = useState({ name: "", body: "", accountId: "", frequency: "weekly", timeLocal: "09:00", weekday: 1 })
  const [notice, setNotice] = useState("")

  const load = useCallback(() => {
    fetch("/api/seller/social/slots").then((r) => r.json()).then((j) => setSlots(j.slots ?? [])).catch(() => setSlots([]))
    fetch("/api/seller/social/series").then((r) => r.json()).then((j) => setSeries(j.series ?? [])).catch(() => setSeries([]))
    fetch("/api/seller/social/accounts").then((r) => r.json()).then((j) => setAccounts(j.accounts ?? [])).catch(() => setAccounts([]))
  }, [])
  useEffect(() => { load() }, [load])

  const addSlot = async () => {
    const res = await fetch("/api/seller/social/slots", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(slotForm) })
    setNotice(res.ok ? "Slot added" : "Could not add the slot")
    if (res.ok) load()
  }
  const delSlot = async (id: string) => { await fetch(`/api/seller/social/slots?id=${id}`, { method: "DELETE" }); load() }
  const addSeries = async () => {
    const res = await fetch("/api/seller/social/series", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: seriesForm.name, body: seriesForm.body, accountIds: seriesForm.accountId ? [seriesForm.accountId] : [], frequency: seriesForm.frequency, timeLocal: seriesForm.timeLocal, weekday: seriesForm.frequency === "weekly" ? seriesForm.weekday : undefined }) })
    const j = await res.json().catch(() => ({}))
    setNotice(res.ok ? "Series created — the scheduler will queue its posts automatically" : (j.error ?? "Could not create the series"))
    if (res.ok) load()
  }
  const setSeriesStatus = async (id: string, status: string) => { await fetch("/api/seller/social/series", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }); load() }
  const delSeries = async (id: string) => { await fetch(`/api/seller/social/series?id=${id}`, { method: "DELETE" }); load() }

  return (
    <section aria-label="Social schedule" className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><CalendarClock className="h-5 w-5" /> Schedule</h2>
      {notice && <p className="rounded-lg border bg-card px-4 py-2 text-sm">{notice}</p>}
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <h3 className="font-medium">Posting slots</h3>
        {slots.length === 0 ? <p className="text-sm text-muted-foreground">No slots yet. Slots are your regular posting times — the composer can drop a post into the next one.</p> : (
          <ul className="divide-y">
            {slots.map((s) => <li key={s.id} className="flex items-center justify-between py-2 text-sm"><span>{DAYS[s.weekday]} · {s.time_local.slice(0, 5)}{s.label ? ` · ${s.label}` : ""}</span><button onClick={() => delSlot(s.id)} className="rounded-lg border px-2 py-0.5 text-xs"><Trash2 className="h-3 w-3" /></button></li>)}
          </ul>)}
        <div className="flex flex-wrap gap-2">
          <select className="rounded-lg border bg-background px-2 py-1.5 text-sm" value={slotForm.weekday} onChange={(e) => setSlotForm((f) => ({ ...f, weekday: Number(e.target.value) }))}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
          <input type="time" className="rounded-lg border bg-background px-2 py-1.5 text-sm" value={slotForm.timeLocal} onChange={(e) => setSlotForm((f) => ({ ...f, timeLocal: e.target.value }))} />
          <input placeholder="Label (optional)" className="rounded-lg border bg-background px-2 py-1.5 text-sm" value={slotForm.label} onChange={(e) => setSlotForm((f) => ({ ...f, label: e.target.value }))} />
          <button onClick={addSlot} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Add slot</button>
        </div>
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <h3 className="flex items-center gap-2 font-medium"><Repeat className="h-4 w-4" /> Evergreen series</h3>
        {series.length === 0 ? <p className="text-sm text-muted-foreground">No series yet. A series re-posts evergreen content on a rhythm — new arrivals, care tips, weekly features.</p> : (
          <ul className="divide-y">
            {series.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>{s.name} — {s.frequency} · {String(s.time_local).slice(0, 5)} · {s.status}</span>
                <span className="flex gap-1">
                  {s.status === "active" ? <button onClick={() => setSeriesStatus(s.id, "paused")} className="rounded-lg border px-2 py-0.5 text-xs">Pause</button> : <button onClick={() => setSeriesStatus(s.id, "active")} className="rounded-lg border px-2 py-0.5 text-xs">Resume</button>}
                  <button onClick={() => delSeries(s.id)} className="rounded-lg border px-2 py-0.5 text-xs"><Trash2 className="h-3 w-3" /></button>
                </span>
              </li>
            ))}
          </ul>)}
        <div className="grid gap-2 sm:grid-cols-2">
          <input placeholder="Series name" className="rounded-lg border bg-background px-2 py-1.5 text-sm" value={seriesForm.name} onChange={(e) => setSeriesForm((f) => ({ ...f, name: e.target.value }))} />
          <select className="rounded-lg border bg-background px-2 py-1.5 text-sm" value={seriesForm.accountId} onChange={(e) => setSeriesForm((f) => ({ ...f, accountId: e.target.value }))}>
            <option value="">Pick an account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.platform} — {a.display_name ?? ""}</option>)}
          </select>
          <textarea placeholder="Post text for every occurrence" rows={2} className="rounded-lg border bg-background px-2 py-1.5 text-sm sm:col-span-2" value={seriesForm.body} onChange={(e) => setSeriesForm((f) => ({ ...f, body: e.target.value }))} />
          <select className="rounded-lg border bg-background px-2 py-1.5 text-sm" value={seriesForm.frequency} onChange={(e) => setSeriesForm((f) => ({ ...f, frequency: e.target.value }))}>
            <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
          </select>
          <span className="flex gap-2">
            {seriesForm.frequency === "weekly" && <select className="rounded-lg border bg-background px-2 py-1.5 text-sm" value={seriesForm.weekday} onChange={(e) => setSeriesForm((f) => ({ ...f, weekday: Number(e.target.value) }))}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>}
            <input type="time" className="rounded-lg border bg-background px-2 py-1.5 text-sm" value={seriesForm.timeLocal} onChange={(e) => setSeriesForm((f) => ({ ...f, timeLocal: e.target.value }))} />
          </span>
        </div>
        <button onClick={addSeries} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Create series</button>
      </div>
    </section>
  )
}
