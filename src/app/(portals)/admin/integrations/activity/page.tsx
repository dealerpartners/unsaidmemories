import type { Metadata } from "next";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import { INTEGRATION_SERVICES } from "@/lib/integrations/catalog";
import "../integrations-hub.css";

export const metadata: Metadata = { title: "Integration activity — Admin" };
export const dynamic = "force-dynamic";

// Activity log — real events from the Connections vault: every key ever
// saved or updated, newest first. (Tests run from the catalog are live
// checks; their results appear on the card at run time.)
export default async function IntegrationActivityPage() {
  const db = createServerClient();
  const { data } = await db
    .from("integration_keys")
    .select("key_name, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);
  const serviceForKey = new Map<string, string>();
  for (const svc of INTEGRATION_SERVICES) for (const f of svc.fields) serviceForKey.set(f.keyName, svc.name);
  const rows = (data ?? []).map((r: any) => ({
    event: Math.abs(new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) < 2000 ? "Key saved" : "Key updated",
    name: serviceForKey.get(r.key_name) ?? r.key_name,
    key: r.key_name,
    time: new Date(r.updated_at).toLocaleString("en-US"),
  }));
  return (
    <div className="intg">
      <main className="shell">
        <div className="heading">
          <div>
            <h1>Activity log</h1>
          </div>
        </div>
        <nav className="tabs" aria-label="Integration sections">
          <Link className="tab" href="/admin/integrations">Overview</Link>
          <Link className="tab" href="/admin/integrations/connections">Connections &amp; Keys</Link>
          <span className="tab active">Activity log</span>
        </nav>
        <section className="panel">
          <div className="panel-head"><div><h3>Vault events</h3><p>{rows.length} recorded</p></div></div>
          <table className="activity">
            <thead><tr><th>Event</th><th>Integration</th><th>Key</th><th>Time</th></tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={4} className="empty">No keys have been saved yet. Connect a service and its first event lands here.</td></tr>
              ) : rows.map((r, i) => (
                <tr key={i}><td className="event">{r.event}</td><td>{r.name}</td><td>{r.key}</td><td>{r.time}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
