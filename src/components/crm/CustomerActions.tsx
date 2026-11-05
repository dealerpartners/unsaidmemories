"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || `Request failed (${res.status})`);
  return json;
}

export type CustomerLite = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile_phone?: string | null;
  customer_type?: string | null;
  lifecycle_stage?: string | null;
  lifecycle_status?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  postal_code?: string | null;
  preferred_name?: string | null;
  preferred_contact_method?: string | null;
};

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="crm-modal-backdrop" onClick={onClose}>
      <div className="crm-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function useActionRunner(onDone?: () => void) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    try {
      const msg = await fn();
      setDone(msg);
      router.refresh();
      onDone?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, done, run };
}

/** Create / edit customer form (Sunny tree 1.2 Customer Actions: New, Edit). */
export function CustomerFormModal({
  customer,
  onClose,
}: {
  customer?: CustomerLite | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = Boolean(customer?.id);
  const [form, setForm] = useState({
    first_name: customer?.first_name || "",
    last_name: customer?.last_name || "",
    preferred_name: customer?.preferred_name || "",
    company_name: customer?.company_name || "",
    email: customer?.email || "",
    phone: customer?.phone || "",
    mobile_phone: customer?.mobile_phone || "",
    customer_type: customer?.customer_type || "individual",
    lifecycle_stage: customer?.lifecycle_stage || "new_customer",
    lifecycle_status: customer?.lifecycle_status || "healthy",
    address_line1: customer?.address_line1 || "",
    address_line2: customer?.address_line2 || "",
    city: customer?.city || "",
    state: customer?.state || "",
    postal_code: customer?.postal_code || "",
    country: customer?.country || "US",
    preferred_contact_method: customer?.preferred_contact_method || "email",
  });
  const { busy, error, run } = useActionRunner(onClose);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Modal title={editing ? "Edit customer" : "New customer"} onClose={onClose}>
      {error && <div className="crm-error">{error}</div>}
      <div className="crm-formrow">
        <div className="crm-field"><label>First name</label><input className="crm-input" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} /></div>
        <div className="crm-field"><label>Last name</label><input className="crm-input" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} /></div>
      </div>
      <div className="crm-formrow">
        <div className="crm-field"><label>Preferred name</label><input className="crm-input" value={form.preferred_name} onChange={(e) => set("preferred_name", e.target.value)} /></div>
        <div className="crm-field"><label>Company</label><input className="crm-input" value={form.company_name} onChange={(e) => set("company_name", e.target.value)} /></div>
      </div>
      <div className="crm-formrow">
        <div className="crm-field"><label>Email</label><input className="crm-input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
        <div className="crm-field"><label>Phone</label><input className="crm-input" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
      </div>
      <div className="crm-formrow">
        <div className="crm-field"><label>Mobile</label><input className="crm-input" value={form.mobile_phone} onChange={(e) => set("mobile_phone", e.target.value)} /></div>
        <div className="crm-field"><label>Type</label>
          <select className="crm-select" value={form.customer_type} onChange={(e) => set("customer_type", e.target.value)}>
            <option value="individual">Individual</option>
            <option value="business">Business</option>
            <option value="wholesale">Wholesale</option>
            <option value="gift_buyer">Gift buyer</option>
          </select>
        </div>
      </div>
      <div className="crm-formrow">
        <div className="crm-field"><label>Lifecycle stage</label>
          <select className="crm-select" value={form.lifecycle_stage} onChange={(e) => set("lifecycle_stage", e.target.value)}>
            {["new_lead", "new_customer", "active", "vip", "returning", "lapsed", "at_risk", "lost"].map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
        <div className="crm-field"><label>Health</label>
          <select className="crm-select" value={form.lifecycle_status} onChange={(e) => set("lifecycle_status", e.target.value)}>
            {["healthy", "needs_attention", "at_risk"].map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="crm-field"><label>Address line 1</label><input className="crm-input" value={form.address_line1} onChange={(e) => set("address_line1", e.target.value)} /></div>
      <div className="crm-field"><label>Address line 2</label><input className="crm-input" value={form.address_line2} onChange={(e) => set("address_line2", e.target.value)} /></div>
      <div className="crm-formrow">
        <div className="crm-field"><label>City</label><input className="crm-input" value={form.city} onChange={(e) => set("city", e.target.value)} /></div>
        <div className="crm-field"><label>State</label><input className="crm-input" value={form.state} onChange={(e) => set("state", e.target.value)} /></div>
      </div>
      <div className="crm-formrow">
        <div className="crm-field"><label>Postal code</label><input className="crm-input" value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} /></div>
        <div className="crm-field"><label>Preferred contact</label>
          <select className="crm-select" value={form.preferred_contact_method} onChange={(e) => set("preferred_contact_method", e.target.value)}>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="phone">Phone</option>
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
        <button className="crm-btn crm-ghost" onClick={onClose} type="button">Cancel</button>
        <button
          className="crm-btn"
          disabled={busy}
          type="button"
          onClick={() =>
            run(async () => {
              if (editing) {
                await api(`/api/admin/crm/customers/${customer!.id}`, "PATCH", form);
                return "Saved.";
              }
              const created = await api("/api/admin/crm/customers", "POST", form);
              router.push(`/admin/crm/customers/${(created as { id: string }).id}`);
              return "Created.";
            })
          }
        >
          {busy ? "Saving…" : editing ? "Save changes" : "Create customer"}
        </button>
      </div>
    </Modal>
  );
}

type ActionKind = "message" | "note" | "payment" | "invoice" | "refund" | "call" | "magic" | null;

/** Shared CRM actions menu (Sunny tree 1.12) for one customer. */
export default function CustomerActions({ customer }: { customer: CustomerLite }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ActionKind>(null);
  const [editOpen, setEditOpen] = useState(false);
  const router = useRouter();
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.company_name || customer.email || "customer";

  const choose = (k: ActionKind | "edit" | "view" | "archive") => {
    setOpen(false);
    if (k === "edit") setEditOpen(true);
    else if (k === "view") router.push(`/admin/crm/customers/${customer.id}`);
    else if (k === "archive") {
      if (confirm(`Archive ${name}? They will be marked inactive.`)) {
        api(`/api/admin/crm/customers/${customer.id}`, "DELETE").then(() => router.refresh());
      }
    } else setKind(k);
  };

  return (
    <div className="crm-menu">
      <button className="crm-btn crm-ghost crm-sm" onClick={() => setOpen((o) => !o)} type="button" data-tip="Things you can do with this customer — message them, take a payment, add a note, and more.">
        Actions ▾
      </button>
      {open && (
        <div className="crm-menu-list">
          <button onClick={() => choose("view")} data-tip="Open this customer's full page — their orders, balance, and history.">View customer</button>
          <button onClick={() => choose("edit")} data-tip="Change this customer's details — name, email, phone, address.">Edit customer</button>
          <button onClick={() => choose("message")} data-tip="Write to this customer by email or text message.">Send message</button>
          <button onClick={() => choose("call")} data-tip="Create a reminder to call this customer, and keep a record of it.">Call customer</button>
          <button onClick={() => choose("note")} data-tip="Add a private note — only staff see it. The customer never does.">Add note</button>
          <button onClick={() => choose("payment")} data-tip="Record money this customer paid you — card, cash, or bank transfer.">Take payment</button>
          <button onClick={() => choose("invoice")} data-tip="Create a bill for this customer. It starts as a draft in Accounting.">Create invoice</button>
          <button onClick={() => choose("refund")} data-tip="Give money back to this customer. You'll be asked for a reason.">Issue refund</button>
          <button onClick={() => choose("magic")} data-tip="Email this customer a one-click sign-in link for their shop account — no password needed.">Send magic link</button>
          <button onClick={() => choose("archive")} style={{ color: "#c62f3b" }} data-tip="Archive this customer — they become inactive and leave the everyday lists. Their orders and history stay saved.">Archive customer</button>
        </div>
      )}
      {editOpen && <CustomerFormModal customer={customer} onClose={() => setEditOpen(false)} />}
      {kind && (
        <ActionModal kind={kind} customer={customer} onClose={() => setKind(null)} />
      )}
    </div>
  );
}

function ActionModal({ kind, customer, onClose }: { kind: Exclude<ActionKind, null>; customer: CustomerLite; onClose: () => void }) {
  const { busy, error, done, run } = useActionRunner();
  const [channel, setChannel] = useState("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("card");
  const [reason, setReason] = useState("");
  const [title, setTitle] = useState("");

  const titles: Record<string, string> = {
    message: "Send message", note: "Add note", payment: "Take payment",
    invoice: "Create invoice", refund: "Issue refund", call: "Call customer", magic: "Send magic link",
  };

  const submit = () => {
    if (kind === "message") {
      run(async () => {
        const r = await api(`/api/admin/crm/customers/${customer.id}/messages`, "POST", { channel, subject: subject || undefined, body });
        return `Message recorded with status: ${(r as { status: string }).status}.`;
      });
    } else if (kind === "note") {
      run(async () => {
        await api(`/api/admin/crm/customers/${customer.id}/notes`, "POST", { body, note_type: "internal" });
        return "Note added.";
      });
    } else if (kind === "call") {
      run(async () => {
        await api("/api/admin/crm/actions", "POST", { action: "call_customer", customer_id: customer.id, title: title || undefined });
        return "Call task created and logged.";
      });
    } else if (kind === "payment") {
      run(async () => {
        const r = await api("/api/admin/crm/actions", "POST", { action: "take_payment", customer_id: customer.id, amount: Number(amount), payment_method: method });
        return `Payment recorded (${(r as { receipt_number: string }).receipt_number}). Balance due: $${Number((r as { balance_due: number }).balance_due).toFixed(2)}.`;
      });
    } else if (kind === "invoice") {
      run(async () => {
        const r = await api("/api/admin/crm/actions", "POST", { action: "create_invoice", customer_id: customer.id, amount: Number(amount), description: body || undefined });
        return `Invoice ${(r as { invoice_number: string }).invoice_number} created as a draft.`;
      });
    } else if (kind === "refund") {
      run(async () => {
        const r = await api("/api/admin/crm/actions", "POST", { action: "issue_refund", customer_id: customer.id, amount: Number(amount), payment_method: method, reason });
        return `Refund recorded (${(r as { receipt_number: string }).receipt_number}).`;
      });
    } else if (kind === "magic") {
      run(async () => {
        const r = await api("/api/admin/crm/actions", "POST", { action: "send_magic_link", customer_id: customer.id });
        return `Magic link sent to ${(r as { sent_to: string }).sent_to}.`;
      });
    }
  };

  return (
    <Modal title={titles[kind]} onClose={onClose}>
      {error && <div className="crm-error">{error}</div>}
      {done && <div className="crm-ok">{done}</div>}
      {kind === "message" && (
        <>
          <div className="crm-formrow">
            <div className="crm-field"><label>Channel</label>
              <select className="crm-select" value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
              </select>
            </div>
            <div className="crm-field"><label>To</label>
              <input className="crm-input" disabled value={channel === "email" ? customer.email || "—" : customer.mobile_phone || customer.phone || "—"} />
            </div>
          </div>
          {channel === "email" && (
            <div className="crm-field"><label>Subject</label><input className="crm-input" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
          )}
          <div className="crm-field"><label>Message</label><textarea className="crm-textarea" value={body} onChange={(e) => setBody(e.target.value)} /></div>
        </>
      )}
      {kind === "note" && (
        <div className="crm-field"><label>Internal note</label><textarea className="crm-textarea" value={body} onChange={(e) => setBody(e.target.value)} /></div>
      )}
      {kind === "call" && (
        <div className="crm-field"><label>Call purpose</label>
          <input className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`Call ${customer.phone || customer.mobile_phone || ""}`} />
        </div>
      )}
      {(kind === "payment" || kind === "invoice" || kind === "refund") && (
        <>
          <div className="crm-formrow">
            <div className="crm-field"><label>Amount (USD)</label><input className="crm-input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            {kind !== "invoice" && (
              <div className="crm-field"><label>Method</label>
                <select className="crm-select" value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="card">Card</option>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="store_credit">Store credit</option>
                  <option value="gift_card">Gift card</option>
                </select>
              </div>
            )}
          </div>
          {kind === "invoice" && (
            <div className="crm-field"><label>Description</label><input className="crm-input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="What is this invoice for?" /></div>
          )}
          {kind === "refund" && (
            <div className="crm-field"><label>Reason (required)</label><input className="crm-input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          )}
        </>
      )}
      {kind === "magic" && (
        <p className="crm-muted">Emails {customer.email || "—"} a secure sign-in link for their account. The send is logged in the customer&apos;s communication history.</p>
      )}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
        <button className="crm-btn crm-ghost" onClick={onClose} type="button">Close</button>
        {!done && (
          <button className="crm-btn" disabled={busy} onClick={submit} type="button">
            {busy ? "Working…" : kind === "message" ? "Send" : kind === "note" ? "Add note" : kind === "call" ? "Schedule call" : kind === "payment" ? "Record payment" : kind === "invoice" ? "Create invoice" : kind === "refund" ? "Issue refund" : "Send link"}
          </button>
        )}
      </div>
    </Modal>
  );
}
