import type { Metadata } from "next";
import { db, T } from "../data";
import { CreateModalButton } from "../SupportControls";
import "../support.css";

export const metadata: Metadata = { title: "Support Desk — Ticket forms" };
export const dynamic = "force-dynamic";

// Ticket forms (owner's v2 comp) — templates in the generated
// support_forms table.
export default async function SupportFormsPage() {
  const { data } = await db().from("support_forms").select("*").eq("tenant_id", T()).order("created_at", { ascending: false });
  const rows = data ?? [];
  const first = rows[0];

  return (
    <div className="sup"><div className="content">
      <div className="pagehead">
        <div><h1>Ticket forms</h1></div>
        <div className="actions">
          <CreateModalButton label="＋ Create form" title="Create ticket form" endpoint="/api/admin/support/forms" fields={[
            { name: "name", label: "Form name", placeholder: "Form name", required: true },
            { name: "description", label: "Description", placeholder: "What this form is for" },
            { name: "audience", label: "Audience", type: "select", options: ["customer", "agent"] },
            { name: "kind", label: "Kind", type: "select", options: ["intake", "guided"] },
            { name: "status", label: "Status", type: "select", options: ["draft", "published"] },
          ]} />
        </div>
      </div>
      <div className="split">
        <div className="card">
          <div className="cardhead"><strong>Form templates</strong></div>
          <div className="cardbody">
            {rows.length === 0 ? (
              <div className="empty">No forms yet. The public contact form uses the built-in intake until the first template is published here.</div>
            ) : rows.map((f: any) => (
              <div className="data-pair" key={f.id}>
                <span><b>{f.name}</b><div className="tiny muted">{f.description ?? ""} · {Array.isArray(f.fields) ? f.fields.length : 0} fields · {f.kind}</div></span>
                <span className={`pill ${f.status === "published" ? "green" : "amber"}`}>{f.status === "published" ? "Published" : "Draft"}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="cardhead"><strong>Guided mode preview</strong></div>
          <div className="cardbody">
            {first ? (<>
              <span className="pill teal">{first.kind === "guided" ? "Guided flow" : "Intake form"}</span>
              <h3 style={{ fontSize: 16 }}>{first.name}</h3>
              <p className="muted">{first.description ?? "This form collects the customer's request and routes it to the right team."}</p>
              {(Array.isArray(first.fields) ? first.fields : []).slice(0, 4).map((field: any, i: number) => (
                <div className="formrow" key={i}><label>{field.label ?? field.name ?? `Field ${i + 1}`}</label>
                  <input readOnly placeholder={field.placeholder ?? ""} /></div>
              ))}
              {(!first.fields || first.fields.length === 0) && <p className="tiny muted">No fields defined yet — fields are added as JSON definitions on the form.</p>}
            </>) : (
              <p className="muted">Create a form and its preview renders here.</p>
            )}
          </div>
        </div>
      </div>
    </div></div>
  );
}
