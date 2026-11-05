import type { Metadata } from "next";
import Link from "next/link";
import { notificationsFor } from "@/lib/trust/support";
import { getAdminIdentity } from "@/lib/admin/gate";
import { fmtDateTime } from "@/lib/trust/constants";

export const metadata: Metadata = { title: "My Notifications — UnSaid Support Desk" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const identity = await getAdminIdentity();
  const { items } = await notificationsFor(identity?.portalUserId ?? null);
  return (
    <div>
      <div className="fabric-page-head">
        <h1>My notifications</h1>
      </div>
      <div className="ts-card">
        {!identity && <div className="ts-empty">Sign in with a staff account to see your notifications.</div>}
        {identity && items.length === 0 && <div className="ts-empty">Nothing addressed to you right now.</div>}
        {items.map((n, i) => (
          <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
            <span className={`ts-pill ${n.kind === "sla" ? "amber" : ""}`}>{n.kind}</span>{" "}
            {n.ticketId ? <Link href={`/admin/support/${n.ticketId}`}>{n.ticketRef || "ticket"}</Link> : null} {n.text}
            <span style={{ color: "var(--muted)" }}> · {fmtDateTime(n.at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
