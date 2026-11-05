"use client";

import { useRef, useState, useCallback } from "react";
import { Upload, X, FileText, ImageIcon } from "lucide-react";

/**
 * §0.5 Intake — drag-drop upload zone.
 * QB evidence: §F, §O — drag-drop upload, 20 MB limit, "Show existing".
 * Also serves as §0.9 Attachments drop zone.
 *
 * Usage:
 *   <DropZone onUpload={(files) => console.log(files)} maxSize={20} />
 */

export function DropZone({
  onUpload,
  maxSize = 20,
  accept = "*",
  label = "Drag files here or click to upload",
}: {
  onUpload?: (files: File[]) => void;
  maxSize?: number; // MB
  accept?: string;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
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
    setFiles((prev) => [...prev, ...valid]);
    onUpload?.(valid);
  }, [maxSize, onUpload]);

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        style={{
          border: `2px dashed ${dragging ? "var(--primary, #007c7d)" : "var(--border, #e5e5e5)"}`,
          borderRadius: 12, padding: "24px 16px", textAlign: "center",
          cursor: "pointer", transition: "border-color .15s, background .15s",
          background: dragging ? "var(--accent, #f0fafa)" : "var(--card, #fff)",
        }}
      >
        <Upload size={20} style={{ color: "var(--muted-foreground, #9b97a8)", marginBottom: 8 }} />
        <div style={{ fontSize: 13, color: "var(--foreground, #171717)", fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 10, color: "var(--muted-foreground, #9b97a8)", marginTop: 4 }}>
          Max {maxSize} MB per file
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Uploaded files */}
      {files.map((file, i) => (
        <div
          key={i}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
            marginTop: 8, border: "1px solid var(--border, #e5e5e5)", borderRadius: 8,
          }}
        >
          {file.type.startsWith("image/") ? <ImageIcon size={14} /> : <FileText size={14} />}
          <span style={{ flex: 1, fontSize: 12, color: "var(--foreground, #171717)" }}>{file.name}</span>
          <span style={{ fontSize: 10, color: "var(--muted-foreground, #9b97a8)" }}>
            {(file.size / 1024).toFixed(0)} KB
          </span>
          <button
            onClick={() => setFiles(files.filter((_, idx) => idx !== i))}
            style={{ background: "none", border: 0, cursor: "pointer", padding: 0, color: "var(--muted-foreground, #9b97a8)" }}
          >
            <X size={12} />
          </button>
        </div>
      ))}

      {error && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#c0392b" }}>{error}</div>
      )}
    </div>
  );
}
