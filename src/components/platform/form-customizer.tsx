"use client";

import { useState } from "react";
import { SlidersHorizontal, Check } from "lucide-react";

/**
 * §0.10 Form Customization — the gear on the form itself.
 * QB evidence: §O — "Choose what you use — changes apply to all bill forms":
 * field toggles per form type, platform-wide for that form.
 *
 * Usage:
 *   <FormCustomizer
 *     formName="Invoice"
 *     fields={[
 *       { key: "customer", label: "Customer", visible: true },
 *       { key: "po_number", label: "PO Number", visible: false },
 *     ]}
 *     onSave={(fields) => console.log(fields)}
 *   />
 */

export type FormField = {
  key: string;
  label: string;
  visible: boolean;
};

export function FormCustomizer({
  formName,
  fields,
  onSave,
}: {
  formName: string;
  fields: FormField[];
  onSave?: (fields: FormField[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [localFields, setLocalFields] = useState(fields);

  function toggle(key: string) {
    setLocalFields((prev) => prev.map((f) => (f.key === key ? { ...f, visible: !f.visible } : f)));
  }

  function save() {
    onSave?.(localFields);
    setOpen(false);
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(!open)}
        className="adm-btn"
        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}
        title="Choose what you use — changes apply to all {formName} forms"
      >
        <SlidersHorizontal size={12} /> Customize
      </button>

      {open && (
        <div
          className="adm-card"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            minWidth: 260, zIndex: 100, padding: 0, boxShadow: "0 16px 40px rgba(0,0,0,.12)",
          }}
        >
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border, #e5e5e5)" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground, #706d7c)" }}>
              {formName} form
            </div>
            <div style={{ fontSize: 11, color: "var(--muted-foreground, #9b97a8)", marginTop: 2 }}>
              Changes apply to all {formName.toLowerCase()} forms
            </div>
          </div>

          <div style={{ padding: "8px 0" }}>
            {localFields.map((field) => (
              <label
                key={field.key}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
                  cursor: "pointer", fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={field.visible}
                  onChange={() => toggle(field.key)}
                />
                {field.label}
              </label>
            ))}
          </div>

          <div style={{ padding: 12, borderTop: "1px solid var(--border, #e5e5e5)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setOpen(false)} className="adm-btn" style={{ fontSize: 11 }}>Cancel</button>
            <button onClick={save} className="adm-btn adm-btn-primary" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
              <Check size={12} /> Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
