"use client";

import { useState } from "react";
import { StickyNote, Plus } from "lucide-react";

/**
 * §0.9 Notes — the notes-and-attachments section.
 * QB evidence: §O, §T2, §L2 — notes-and-attachments is a section
 * of every party and transaction record.
 *
 * Usage:
 *   <NotesSection
 *     notes={[{ id: "1", text: "Called customer, left voicemail", author: "Almeta", createdAt: "2026-11-01" }]}
 *     onAdd={(text) => console.log(text)}
 *   />
 */

export type Note = {
  id: string;
  text: string;
  author?: string;
  createdAt?: string;
};

export function NotesSection({
  notes = [],
  onAdd,
}: {
  notes?: Note[];
  onAdd?: (text: string) => void;
}) {
  const [text, setText] = useState("");

  function handleAdd() {
    if (text.trim()) {
      onAdd?.(text.trim());
      setText("");
    }
  }

  return (
    <div className="adm-card" style={{ padding: 0 }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border, #e5e5e5)", display: "flex", alignItems: "center", gap: 8 }}>
        <StickyNote size={14} style={{ color: "var(--primary, #007c7d)" }} />
        <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "var(--foreground, #171717)" }}>
          Notes ({notes.length})
        </h3>
      </div>

      <div style={{ maxHeight: 300, overflowY: "auto" }}>
        {notes.map((note) => (
          <div key={note.id} style={{ padding: "12px 20px", borderBottom: "1px solid var(--border, #f5f5f5)" }}>
            <p style={{ fontSize: 13, color: "var(--foreground, #171717)", margin: 0 }}>{note.text}</p>
            <div style={{ fontSize: 10, color: "var(--muted-foreground, #9b97a8)", marginTop: 4 }}>
              {note.author && `${note.author} · `}
              {note.createdAt && new Date(note.createdAt).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: 16, display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note…"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          style={{
            flex: 1, padding: "8px 12px", border: "1px solid var(--border, #e5e5e5)",
            borderRadius: 6, fontSize: 13, outline: "none",
          }}
        />
        <button onClick={handleAdd} className="adm-btn adm-btn-primary" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
          <Plus size={12} /> Add
        </button>
      </div>
    </div>
  );
}
