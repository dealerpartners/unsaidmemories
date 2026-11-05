"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

async function call(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/** Plain-language explanations for the accounting actions, by action
 *  name. An explicit `tip` prop on ApiButton always wins; this map
 *  means every accounting page that uses ApiButton explains its
 *  buttons without each page repeating itself. */
const ACTION_TIPS: Record<string, string> = {
  send: "Send this to the customer by email.",
  resend: "Email this to the customer again — handy if they lost the first copy.",
  mark_paid: "Record that this has been paid in full. Use it when the money has actually arrived.",
  remind: "Send a polite “just a reminder” email about money that's still owed.",
  duplicate: "Make an exact copy as a new draft, so you don't have to type it all again.",
  void: "Cancel this for good. The books keep a reversing entry so the record stays honest — a void cannot be undone.",
  delete: "Delete this draft. It was never sent, so deleting it is safe.",
  approve: "Approve this — it moves on to the next step.",
  reject: "Turn this down. Nothing is paid out.",
  pay: "Record a payment against this.",
  refund: "Give this money back to the customer.",
  file: "Mark this as filed with the tax authority.",
  match: "Mark this as matched against the bank's record.",
  reconcile: "Mark this as checked against the bank statement and agreed.",
  post: "Post this into the books, where it becomes part of the official record.",
  issue: "Issue this — it becomes official and gets its number.",
  cancel: "Cancel this. It will not go ahead.",
};

/** Button that POSTs an action to an admin accounting API then refreshes the page. */
export function ApiButton({
  url, body, children, confirm, className, promptField, promptLabel, tip,
}: {
  url: string; body: Record<string, unknown>; children: React.ReactNode;
  confirm?: string; className?: string;
  promptField?: string; promptLabel?: string; tip?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const actionTip = tip ?? ACTION_TIPS[String(body.action ?? "")];
  return (
    <span className="acct-btnwrap">
      <button
        type="button"
        className={className || "fabric-btn fabric-btn-sm"}
        disabled={busy}
        data-tip={actionTip}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          const payload = { ...body };
          if (promptField) {
            const v = window.prompt(promptLabel || promptField, "");
            if (v === null) return;
            payload[promptField] = v;
          }
          setBusy(true); setErr("");
          try { await call(url, payload); router.refresh(); }
          catch (e: any) { setErr(e.message); setBusy(false); }
        }}
      >
        {busy ? "Working…" : children}
      </button>
      {err ? <span className="acct-err">{err}</span> : null}
    </span>
  );
}

export interface Field {
  name: string; label: string; type?: string; required?: boolean;
  options?: { value: string; label: string }[]; placeholder?: string; step?: string;
}

/** Small create/edit form that POSTs JSON to an API route then refreshes.
 *  Body shaping is declarative (actionValue / omitEmpty) — server components
 *  cannot pass function props across the client boundary. */
export function MiniForm({
  url, fields, submitLabel, initial, actionValue, omitEmpty,
}: {
  url: string; fields: Field[]; submitLabel: string;
  initial?: Record<string, unknown>;
  actionValue?: string;
  omitEmpty?: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  return (
    <form
      className="acct-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const values: Record<string, string> = {};
        fields.forEach((f) => { values[f.name] = String(fd.get(f.name) ?? ""); });
        setBusy(true); setErr(""); setOk("");
        try {
          const body: Record<string, unknown> = { ...values };
          if (actionValue) body.action = actionValue;
          for (const k of omitEmpty || []) if (body[k] === "") delete body[k];
          await call(url, body);
          setOk("Saved."); (e.target as HTMLFormElement).reset(); router.refresh();
        } catch (ex: any) { setErr(ex.message); }
        setBusy(false);
      }}
    >
      {fields.map((f) => (
        <label key={f.name} className="acct-field">
          <span>{f.label}</span>
          {f.options ? (
            <select name={f.name} required={f.required} defaultValue={String(initial?.[f.name] ?? f.options[0]?.value ?? "")}>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input
              name={f.name} type={f.type || "text"} required={f.required}
              placeholder={f.placeholder} step={f.step}
              defaultValue={initial?.[f.name] != null ? String(initial[f.name]) : undefined}
            />
          )}
        </label>
      ))}
      <div className="acct-form-foot">
        <button type="submit" className="fabric-btn fabric-btn-primary" disabled={busy} data-tip="Save these details. The page refreshes so you can see them in the list.">{busy ? "Saving…" : submitLabel}</button>
        {err ? <span className="acct-err">{err}</span> : null}
        {ok ? <span className="acct-ok">{ok}</span> : null}
      </div>
    </form>
  );
}

/** Manual two-line journal entry form: builds the balanced lines payload client-side. */
export function JournalPairForm({ url, accounts }: { url: string; accounts: { value: string; label: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  return (
    <form
      className="acct-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const memo = String(fd.get("memo") ?? "");
        const entryDate = String(fd.get("entry_date") ?? "");
        const debitCode = String(fd.get("debit_code") ?? "");
        const creditCode = String(fd.get("credit_code") ?? "");
        const amount = Number(fd.get("amount") ?? 0);
        setBusy(true); setErr(""); setOk("");
        try {
          await call(url, {
            memo, entry_date: entryDate || undefined, source: "manual",
            lines: [
              { account_code: debitCode, debit: amount, credit: 0 },
              { account_code: creditCode, debit: 0, credit: amount },
            ],
          });
          setOk("Posted."); (e.target as HTMLFormElement).reset(); router.refresh();
        } catch (ex: any) { setErr(ex.message); }
        setBusy(false);
      }}
    >
      <label className="acct-field">
        <span>Memo</span>
        <input name="memo" type="text" required placeholder="e.g. October rent" />
      </label>
      <label className="acct-field">
        <span>Date</span>
        <input name="entry_date" type="date" />
      </label>
      <label className="acct-field">
        <span>Debit account</span>
        <select name="debit_code" defaultValue={accounts[0]?.value}>
          {accounts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="acct-field">
        <span>Credit account</span>
        <select name="credit_code" defaultValue={accounts[0]?.value}>
          {accounts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="acct-field">
        <span>Amount</span>
        <input name="amount" type="number" step="0.01" required />
      </label>
      <div className="acct-form-foot">
        <button type="submit" className="fabric-btn fabric-btn-primary" disabled={busy} data-tip="Write this into the books. “Debit” is where the money goes to; “credit” is where it comes from. This form always balances the two sides.">{busy ? "Posting…" : "Post Entry"}</button>
        {err ? <span className="acct-err">{err}</span> : null}
        {ok ? <span className="acct-ok">{ok}</span> : null}
      </div>
    </form>
  );
}

/** Line-items editor for invoices / estimates / bills: rows of description, qty, price. */
export function LinesForm({
  url, extraFields, submitLabel, fixed, redirectTo,
}: {
  url: string; extraFields: Field[]; submitLabel: string; fixed?: Record<string, unknown>;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState([{ description: "", quantity: "1", unit_price: "" }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <form
      className="acct-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const values: Record<string, string> = {};
        extraFields.forEach((f) => { values[f.name] = String(fd.get(f.name) ?? ""); });
        const lines = rows.filter((r) => r.description.trim()).map((r) => ({
          description: r.description, quantity: Number(r.quantity) || 1, unit_price: Number(r.unit_price) || 0,
        }));
        if (!lines.length) { setErr("Add at least one line."); return; }
        setBusy(true); setErr("");
        try { await call(url, { ...fixed, ...values, lines }); router.refresh(); if (redirectTo) router.push(redirectTo); }
        catch (ex: any) { setErr(ex.message); setBusy(false); }
      }}
    >
      {extraFields.map((f) => (
        <label key={f.name} className="acct-field">
          <span>{f.label}</span>
          {f.options ? (
            <select name={f.name} required={f.required} defaultValue={f.options[0]?.value}>
              {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <input name={f.name} type={f.type || "text"} required={f.required} placeholder={f.placeholder} step={f.step} />
          )}
        </label>
      ))}
      <div className="acct-lines">
        {rows.map((r, i) => (
          <div className="acct-line-row" key={i}>
            <input placeholder="Description" value={r.description} onChange={(e) => { const n = [...rows]; n[i].description = e.target.value; setRows(n); }} />
            <input placeholder="Qty" type="number" step="0.01" value={r.quantity} onChange={(e) => { const n = [...rows]; n[i].quantity = e.target.value; setRows(n); }} />
            <input placeholder="Unit price" type="number" step="0.01" value={r.unit_price} onChange={(e) => { const n = [...rows]; n[i].unit_price = e.target.value; setRows(n); }} />
          </div>
        ))}
        <button type="button" className="fabric-btn fabric-btn-sm" data-tip="Add another row, for another item on this document." onClick={() => setRows([...rows, { description: "", quantity: "1", unit_price: "" }])}>+ Add line</button>
      </div>
      <div className="acct-form-foot">
        <button type="submit" className="fabric-btn fabric-btn-primary" disabled={busy} data-tip="Save this document with the lines above.">{busy ? "Saving…" : submitLabel}</button>
        {err ? <span className="acct-err">{err}</span> : null}
      </div>
    </form>
  );
}

/** Download rows as CSV (export actions). */
export function CsvButton({ filename, rows, children }: { filename: string; rows: Record<string, unknown>[]; children: React.ReactNode }) {
  return (
    <button
      type="button" className="fabric-btn fabric-btn-sm"
      data-tip="Download this list as a CSV file — a simple spreadsheet you can open in Excel or Google Sheets."
      onClick={() => {
        if (!rows.length) return;
        const keys = Object.keys(rows[0]);
        const csv = [keys.join(","), ...rows.map((r) => keys.map((k) => `"${String(r[k] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        a.download = filename; a.click(); URL.revokeObjectURL(a.href);
      }}
    >{children}</button>
  );
}
