import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loadTickets, isOpen } from "../data";
import "../support.css";

export const metadata: Metadata = { title: "Support Desk — Agent workspace" };
export const dynamic = "force-dynamic";

// Agent workspace entry: opens the most urgent open ticket in the
// workspace; with nothing open, says so plainly.
export default async function WorkspaceEntryPage() {
  const tickets = await loadTickets(200);
  const open = tickets.filter(isOpen);
  const rank = (p: string) => (p === "urgent" ? 0 : p === "high" ? 1 : p === "normal" ? 2 : 3);
  open.sort((a, b) => rank(a.priority) - rank(b.priority)
    || new Date(a.resolution_due_at ?? a.first_response_due_at ?? "2999").getTime() - new Date(b.resolution_due_at ?? b.first_response_due_at ?? "2999").getTime());
  if (open[0]) redirect(`/admin/support/${open[0].id}`);
  return (
    <div className="sup"><div className="content">
      <div className="pagehead"><div><h1>Agent workspace</h1></div></div>
      <div className="card"><div className="empty">No open tickets right now — the workspace opens on the most urgent ticket when one arrives. <Link href="/admin/support/queues" style={{ color: "#087b73", fontWeight: 700 }}>Open the queues →</Link></div></div>
    </div></div>
  );
}
