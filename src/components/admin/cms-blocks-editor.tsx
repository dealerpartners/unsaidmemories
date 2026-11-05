"use client";

import { useEffect, useState, useCallback } from "react";
import { ArrowRight, Trash2, Plus, X, Search, Save } from "lucide-react";

type Block = {
  id: string; block_id: string; component_type: string; status: string;
  props: Record<string, any>; slot_id: string | null; locale: string;
  sort_order: number; updated_at: string;
};

const COMPONENT_TYPES = [
  "Hero_Split", "Hero_FullBleed", "PromoBannerStrip", "ProductCarousel",
  "EditorialFeature", "NewsletterSignup", "TrustStrip", "RelationshipBand",
  "CollectionGrid", "StatementBlock", "CTASection", "TestimonialGrid",
  "FAQAccordion", "ContentBlock",
];

export function ContentBlocksEditor() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<Block | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/cms/blocks");
      const data = await res.json();
      setBlocks(data.blocks ?? []);
    } catch { setError("Failed to load blocks"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = blocks.filter(b =>
    !filter ||
    b.block_id.toLowerCase().includes(filter.toLowerCase()) ||
    b.component_type.toLowerCase().includes(filter.toLowerCase()) ||
    (b.props?.headline || "").toLowerCase().includes(filter.toLowerCase())
  );

  async function saveBlock(block: Partial<Block>) {
    setError("");
    try {
      if (block.id) {
        const res = await fetch("/api/admin/cms/blocks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(block),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Update failed"); }
      } else {
        const res = await fetch("/api/admin/cms/blocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(block),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Create failed"); }
      }
      setEditing(null);
      setCreating(false);
      load();
    } catch (e: any) { setError(e.message); }
  }

  async function deleteBlock(id: string) {
    if (!confirm("Delete this content block?")) return;
    await fetch(`/api/admin/cms/blocks?id=${id}`, { method: "DELETE" });
    load();
  }

  async function publishBlock(id: string) {
    await fetch("/api/admin/cms/blocks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "published" }),
    });
    load();
  }

  if (creating || editing) {
    return <BlockEditor block={editing} onSave={saveBlock} onCancel={() => { setEditing(null); setCreating(false); }} error={error} />;
  }

  return (
    <div className="adm-card" style={{ padding: 0 }}>
      <div style={{ padding: "24px 28px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "var(--foreground)" }}>Content Blocks</h2>
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "4px 0 0" }}>{blocks.length} blocks · {blocks.filter(b => b.status === "published").length} published</p>
        </div>
        <button onClick={() => setCreating(true)} style={{ background: "var(--primary)", color: "var(--primary-foreground)", border: 0, borderRadius: 8, padding: "10px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <Plus size={14} /> New Block
        </button>
      </div>

      <div style={{ padding: "16px 28px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)" }} />
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search blocks…" style={{ width: "100%", padding: "10px 12px 10px 34px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none" }} />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)", fontSize: 13 }}>
          {filter ? "No blocks match your search." : "No content blocks yet. Create your first block."}
        </div>
      ) : (
        <div style={{ overflow: "hidden" }}>
          {filtered.map((block, i) => (
            <div key={block.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 28px", borderBottom: i < filtered.length - 1 ? "1px solid var(--muted)" : "none" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: block.status === "published" ? "var(--primary)" : "var(--muted-foreground)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
                  {block.props?.headline || block.block_id}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                  {block.component_type} · {block.block_id} · {new Date(block.updated_at).toLocaleDateString()}
                </div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: block.status === "published" ? "var(--primary)" : "var(--muted-foreground)" }}>
                {block.status}
              </div>
              {block.status !== "published" && (
                <button onClick={() => publishBlock(block.id)} style={{ background: "transparent", border: "1px solid var(--primary)", color: "var(--primary)", borderRadius: 6, padding: "6px 12px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                  Publish
                </button>
              )}
              <button onClick={() => setEditing(block)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 11, cursor: "pointer", color: "var(--foreground)" }}>
                Edit
              </button>
              <button onClick={() => deleteBlock(block.id)} style={{ background: "transparent", border: 0, color: "var(--destructive)", cursor: "pointer", padding: 6 }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <div style={{ padding: "12px 28px", color: "var(--destructive)", fontSize: 12 }}>{error}</div>}
    </div>
  );
}

function BlockEditor({ block, onSave, onCancel, error }: {
  block: Block | null;
  onSave: (b: Partial<Block>) => void;
  onCancel: () => void;
  error: string;
}) {
  const [blockId, setBlockId] = useState(block?.block_id || "");
  const [componentType, setComponentType] = useState(block?.component_type || COMPONENT_TYPES[0]);
  const [status, setStatus] = useState(block?.status || "draft");
  const [slotId, setSlotId] = useState(block?.slot_id || "");
  const [propsJson, setPropsJson] = useState(JSON.stringify(block?.props || {}, null, 2));
  const [propsError, setPropsError] = useState("");

  function handleSave() {
    let parsed: Record<string, any> = {};
    try {
      parsed = JSON.parse(propsJson);
      setPropsError("");
    } catch {
      setPropsError("Invalid JSON in props");
      return;
    }
    onSave({
      id: block?.id,
      block_id: blockId,
      component_type: componentType,
      status,
      slot_id: slotId || null,
      props: parsed,
    });
  }

  return (
    <div className="adm-card" style={{ padding: 0 }}>
      <div style={{ padding: "24px 28px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
          {block ? "Edit Block" : "New Content Block"}
        </h2>
        <button onClick={onCancel} style={{ background: "transparent", border: 0, cursor: "pointer", color: "var(--muted-foreground)" }}>
          <X size={20} />
        </button>
      </div>

      <div style={{ padding: "24px 28px", display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground)", display: "block", marginBottom: 6 }}>Block ID</label>
            <input value={blockId} onChange={e => setBlockId(e.target.value)} placeholder="hero_home_v1" disabled={!!block} style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none", background: block ? "var(--muted)" : "var(--card)" }} />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground)", display: "block", marginBottom: 6 }}>Component Type</label>
            <select value={componentType} onChange={e => setComponentType(e.target.value)} style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none" }}>
              {COMPONENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground)", display: "block", marginBottom: 6 }}>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13 }}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground)", display: "block", marginBottom: 6 }}>Slot ID (optional)</label>
            <input value={slotId} onChange={e => setSlotId(e.target.value)} placeholder="slot_hero_01" style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 13, outline: "none" }} />
          </div>
        </div>

        <div>
          <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--muted-foreground)", display: "block", marginBottom: 6 }}>Props (JSON)</label>
          <textarea value={propsJson} onChange={e => setPropsJson(e.target.value)} style={{ width: "100%", minHeight: 200, padding: "12px", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, fontFamily: "monospace", outline: "none", resize: "vertical" }} />
          {propsError && <div style={{ color: "var(--destructive)", fontSize: 11, marginTop: 4 }}>{propsError}</div>}
        </div>

        {error && <div style={{ color: "var(--destructive)", fontSize: 12 }}>{error}</div>}

        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 20px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSave} style={{ background: "var(--primary)", color: "var(--primary-foreground)", border: 0, borderRadius: 8, padding: "10px 20px", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Save size={14} /> Save Block
          </button>
        </div>
      </div>
    </div>
  );
}
