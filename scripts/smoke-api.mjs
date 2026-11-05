#!/usr/bin/env node
/** API smoke test: signs in as the seeded support lead and exercises the desk.
 * Creds extracted at runtime, never printed. Usage: node scripts/smoke-api.mjs [baseUrl] */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const APP = process.argv[2] || "http://localhost:3107";
const raw = readFileSync(join(homedir(), "workspace/user/files/UNSAID_CREDS.md"), "utf8").replace(/\\_/g, "_");
const section = (raw.match(/#\s*Supabase([\s\S]*?)(?:\n\*\*#|\n#\s|$)/i) || [])[1] || raw;
const jwts = [...section.matchAll(/eyJ[\w\-.]+\.[A-Za-z0-9_\-]+/g)].map((m) => m[0]);
const role = (t) => { try { const p = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(Buffer.from(p + "=".repeat((4 - (p.length % 4)) % 4), "base64").toString()).role; } catch { return null; } };
const anon = jwts.find((t) => role(t) === "anon");
const ref = (() => { const p = jwts[0].split(".")[1].replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(Buffer.from(p + "=".repeat((4 - (p.length % 4)) % 4), "base64").toString()).ref; })();
const SB = `https://${ref}.supabase.co`;

const login = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ email: "maya.chen@unsaid.support", password: "Unsaid!Desk2026" }),
}).then((r) => r.json());
if (!login.access_token) { console.error("LOGIN FAILED", JSON.stringify(login).slice(0, 200)); process.exit(1); }
console.log("login OK (maya.chen, support lead)");
const H = { Authorization: `Bearer ${login.access_token}`, "Content-Type": "application/json" };
const call = async (method, path, body) => {
  const r = await fetch(`${APP}${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
};
let pass = 0, fail = 0;
const check = (name, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`); cond ? pass++ : fail++; };

const list = await call("GET", "/api/admin/support/tickets?status=any");
check("GET tickets", list.status === 200 && list.j.count >= 18, `count=${list.j.count}`);
const ticket = list.j.tickets.find((t) => t.ticket_ref === "SUP-2001");
check("seeded SUP-2001 present", !!ticket);
const id = ticket.id;

const unauth = await fetch(`${APP}/api/admin/support/tickets`).then((r) => r.status);
check("unauthenticated API rejected", unauth === 401, `status=${unauth}`);

const note = await call("POST", `/api/admin/support/tickets/${id}/messages`, { kind: "internal_note", body: "Smoke test note — warehouse confirmed replacement stock." });
check("POST internal note", note.status === 201);
const reply = await call("POST", `/api/admin/support/tickets/${id}/messages`, { kind: "reply", body: "Your replacement mug ships today — tracking to follow.", cc: ["smoke-cc@example.com"] });
check("POST public reply with CC", reply.status === 201);

const small = await call("POST", `/api/admin/support/tickets/${id}/actions`, { action_type: "store_credit", amount: 15, target_ref: "smoke" });
check("action < $100 executes immediately", small.status === 201 && small.j.action.status === "executed", small.j.action?.status);
const big = await call("POST", `/api/admin/support/tickets/${id}/actions`, { action_type: "refund", amount: 150, target_ref: "smoke" });
check("action >= $100 waits for approval", big.status === 201 && big.j.action.status === "pending_approval", big.j.action?.status);
const appr = await call("POST", `/api/admin/support/tickets/${id}/actions/${big.j.action.id}`, { decision: "approve" });
check("approver executes big action", appr.status === 200 && appr.j.status === "executed");

const patch = await call("PATCH", `/api/admin/support/tickets/${id}`, { priority: "high" });
check("PATCH ticket priority", patch.status === 200 && patch.j.ticket.priority === "high");
const time = await call("POST", `/api/admin/support/tickets/${id}/time`, { minutes: 5 });
check("POST time log", time.status === 200);
const side = await call("POST", `/api/admin/support/tickets/${id}/side-conversations`, { subject: "Smoke side conversation" });
check("POST side conversation", side.status === 201);
const sideMsg = await call("POST", `/api/admin/support/tickets/${id}/side-conversations/${side.j.side.id}`, { body: "Ping from smoke test." });
check("POST side message", sideMsg.status === 201);
const att = await call("POST", `/api/admin/support/tickets/${id}/attachments`, { filename: "smoke.exe", size_bytes: 1024, storage_key: `support/${id}/smoke.exe`, mime_declared: "application/octet-stream" });
check("executable attachment blocked by policy", att.status === 201 && att.j.attachment.scan_status === "blocked", att.j.attachment?.scan_status);
const rel = await call("POST", `/api/admin/support/tickets/${id}/relations`, { related_ticket_id: list.j.tickets[0].id === id ? list.j.tickets[1].id : list.j.tickets[0].id, relation_type: "related" });
check("POST relation", rel.status === 201);

const rep = await call("GET", "/api/admin/support/reporting");
check("GET reporting rollups", rep.status === 200 && rep.j.volume > 0, `volume=${rep.j.volume}`);
const ops = await call("GET", "/api/admin/support/ops");
check("GET queue health", ops.status === 200 && typeof ops.j.openTotal === "number", `open=${ops.j.openTotal}`);
const notif = await call("GET", "/api/admin/support/notifications");
check("GET notifications", notif.status === 200 && Array.isArray(notif.j.items));
const cfg = await call("GET", "/api/admin/support/config");
check("GET config resources", cfg.status === 200 && (cfg.j.teams?.length ?? 0) >= 3, `teams=${cfg.j.teams?.length}`);
const queue = await call("POST", "/api/admin/support/queues", { name: "Smoke view", filter: { priority: "urgent" } });
check("POST saved view", queue.status === 201);
if (queue.j.queue?.id) {
  const del = await call("DELETE", `/api/admin/support/queues/${queue.j.queue.id}`);
  check("DELETE saved view", del.status === 200);
}
console.log(`\nSMOKE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
