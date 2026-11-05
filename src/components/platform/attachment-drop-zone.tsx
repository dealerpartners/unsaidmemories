"use client";

import { useRef, useState, useCallback } from "react";
import { Upload, X, FileText, ImageIcon, Paperclip } from "lucide-react";

/**
 * §0.9 Attachments — the per-record attachment drop zone.
 * QB evidence: §O, §T2, §L2 — one pattern everywhere: drop zone,
 * 20 MB limit, "Show existing". Notes-and-attachments is a section
 * of every party and transaction record.
 *
 * This is the per-record version (sits inside a record page),
 * distinct from the global DropZone (§0.5 Intake).
 *
 * Usage:
 *   <AttachmentDropZone
 *     existing={[{ id: "1", name: "contract.pdf", size: 240000 }]}
 *     onUpload={(files) => console.log(files)}
 *   />
 */

export type Attachment = {
  id: string;
  name: string;
  size: number;
  type?: string;
  url?: string;
  uploadedAt?: string;
};

export function AttachmentDropZone({
  existing = [],
  onUpload,
  onRemove,
  maxSize = 20,
}: {
  existing?: Attachment[];
  onUpload?: (files: File[]) => void;
  onRemove?: (id: string) => void;
  maxSize?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [showExisting, setShowExisting] = useState(false);
  const [pending, setPending] = useState<File[]>([]);
  const [error, setError] = useState("");

  const handleFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const valid: File[] = [];
    for (const file of Array.from(fileList)) {
      if (file.size > maxSize * 1024 * 1024) {
        setError(`${file.name} exceeds ${maxSize} MB limit`);
        continue;
      }
      valid.push(file);
    }
    setPending((prev) => [...prev, ...valid]);
    onUpload?.(valid);
  }, [maxSize, onUpload]);

  return (
    <div>
      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        style={{
          border: `2px dashed ${dragging ? "var(--primary, #007c7d)" : "var(--border, #e5e5e5)"}`,
          borderRadius: 10, padding: "16px", textAlign: "center",
          cursor: "pointer", transition: "border-color .15s",
          background: dragging ? "var(--accent, #f0fafa)" : "transparent",
        }}
      >
        <Upload size={16} style={{ color: "var(--muted-foreground, #9b97a8)", marginBottom: 4 }} />
        <div style={{ fontSize: 12, color: "var(--foreground, #171717)" }}>Drop files here or click to upload</div>
        <div style={{ fontSize: 10, color: "var(--muted-foreground, #9b97a8)", marginTop: 2 }}>Max {maxSize} MB</div>
        <input ref={inputRef} type="file" multiple style={{ display: "none" }} onChange={(e) => handleFiles(e.target.files)} />
      </div>

      {error && <div style={{ marginTop: 6, fontSize: 11, color: "#c0392b" }}>{error}</div>}

      {/* Show existing toggle (§O — "Show existing") */}
      {existing.length > 0 && (
        <button
          onClick={() => setShowExisting(!showExisting)}
          style={{ background: "none", border: 0, cursor: "pointer", padding: "8px 0", fontSize: 11, color: "var(--primary, #007c7d)", fontWeight: 600 }}
        >
          {showExisting ? "Hide" : "Show"} existing ({existing.length})
        </button>
      )}

      {/* Pending uploads */}
      {pending.map((file, i) => (
        <div key={`p-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", marginTop: 6, border: "1px solid var(--border, #e5e5e5)", borderRadius: 6 }}>
          {file.type.startsWith("image/") ? <ImageIcon size={12} /> : <FileText size={12} />}
          <span style={{ flex: 1, fontSize: 11, color: "var(--foreground, #171717)" }}>{file.name}</span>
          <span style={{ fontSize: 10, color: "var(--muted-foreground, #9b97a8)" }}>{(file.size / 1024).toFixed(0)} KB</span>
          <button onClick={() => setPending(pending.filter((_, idx) => idx !== i))} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--muted-foreground, #9b97a8)" }}>
            <X size={10} />
          </button>
        </div>
      ))}

      {/* Existing attachments */}
      {showExisting && existing.map((att) => (
        <div key={att.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", marginTop: 6, border: "1px solid var(--border, #e5e5e5)", borderRadius: 6 }}>
          <Paperclip size={12} style={{ color: "var(--muted-foreground, #9b97a8)" }} />
          <a href={att.url} style={{ flex: 1, fontSize: 11, color: "var(--foreground, #171717)", textDecoration: "none" }}>{att.name}</a>
          <span style={{ fontSize: 10, color: "var(--muted-foreground, #9b97a8)" }}>{(att.size / 1024).toFixed(0)} KB</span>
          {onRemove && (
            <button onClick={() => onRemove(att.id)} style={{ background: "none", border: 0, cursor: "pointer", color: "#c0392b", opacity: 0.6 }}>
              <X size={10} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
