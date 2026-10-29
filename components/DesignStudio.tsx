'use client';
import { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Rect, Text, Image as KonvaImage } from 'react-konva';
// Konva (already imported - react-konva/konva, no Fabric needed for this canvas).
// Admin adds THEIR design here: upload an image, drag it inside the safe zone,
// add text, then export a print-ready PNG. That file is what goes to Printful.
// Print area: bleed (outer, red dashed), trim (black), safe zone (green dashed).
// Export at 300 DPI: target px = inches x 300, not CSS px.
export default function DesignStudio({ printWidthIn = 12, printHeightIn = 16, product, variant }: { printWidthIn?: number; printHeightIn?: number; product?: string; variant?: string }) {
  const stageRef = useRef<any>(null);
  const [text, setText] = useState('Kin Keeper');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [fileName, setFileName] = useState('');
  const bleed = 9; const scale = 30;
  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setFileName(f.name);
    const url = URL.createObjectURL(f);
    const el = new window.Image(); el.onload = () => setImg(el); el.src = url;
  };
  const downloadPng = () => {
    const stage = stageRef.current; if (!stage) return;
    const uri = stage.toDataURL({ pixelRatio: 300 / scale, mimeType: 'image/png' });
    const a = document.createElement('a'); a.href = uri; a.download = `${product || 'design'}-${variant || 'print'}-300dpi.png`; a.click();
  };
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [savedDesigns, setSavedDesigns] = useState<any[]>([]);
  const refreshSaved = async () => {
    try { const r = await fetch('/api/designs'); const j = await r.json(); if (r.ok) setSavedDesigns(j.designs ?? []); } catch { /* studio works offline; save needs the API */ }
  };
  useEffect(() => { refreshSaved(); }, []);
  const saveToDatabase = async () => {
    const stage = stageRef.current; if (!stage) return;
    setSaving(true); setSaveMsg('');
    try {
      const uri = stage.toDataURL({ pixelRatio: 300 / scale, mimeType: 'image/png' });
      const r = await fetch('/api/designs/save', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: (fileName || `${product || 'design'}-${variant || 'print'}`).slice(0, 200),
          pngDataUrl: uri, product, variant,
          widthPx: printWidthIn * 300, heightPx: printHeightIn * 300, dpi: 300,
        }),
      });
      const j = await r.json();
      if (!r.ok) { setSaveMsg(`Save failed: ${j.error || r.status}${j.detail ? ` — ${j.detail}` : ''}`); }
      else { setSaveMsg(`Saved: design ${j.designId}${j.publicationId ? `, published to variant (${j.publicationId})` : ''}. File: ${j.fileUrl}`); refreshSaved(); }
    } catch (e: any) { setSaveMsg(`Save failed: ${e?.message || e}`); }
    setSaving(false);
  };
  return (<div>
    {product ? <p>Designing for: <strong>{product}</strong>{variant ? ` / ${variant}` : ''} — this design hits admin first, then publishes to the storefront.</p> : null}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      <label>Upload your design (PNG/JPG): <input type="file" accept="image/png,image/jpeg" onChange={onUpload} /></label>
      <label>Text: <input value={text} onChange={e => setText(e.target.value)} /></label>
      <button type="button" onClick={downloadPng}>Export print PNG (300 DPI)</button>
      <button type="button" onClick={saveToDatabase} disabled={saving}>{saving ? 'Saving…' : 'Save design to database'}</button>
    </div>
    {fileName ? <p>Loaded: {fileName} — drag it inside the green safe zone.</p> : <p>No design uploaded yet — upload one above. Text alone is not a print file.</p>}
    <Stage ref={stageRef} width={printWidthIn * scale + bleed * 2} height={printHeightIn * scale + bleed * 2}>
      <Layer>
        <Rect x={0} y={0} width={printWidthIn * scale + bleed * 2} height={printHeightIn * scale + bleed * 2} stroke="red" dash={[6, 4]} />
        <Rect x={bleed} y={bleed} width={printWidthIn * scale} height={printHeightIn * scale} stroke="black" />
        <Rect x={bleed + 18} y={bleed + 18} width={printWidthIn * scale - 36} height={printHeightIn * scale - 36} stroke="green" dash={[4, 4]} />
        {img ? <KonvaImage image={img} x={bleed + 24} y={bleed + 60} width={Math.min(img.width, printWidthIn * scale - 48)} height={Math.min(img.height, printHeightIn * scale - 48)} draggable /> : null}
        <Text x={bleed + 24} y={bleed + 24} text={text} fontSize={28} draggable />
      </Layer>
    </Stage>
    <p>Red = bleed, black = trim, green = safe zone. Export: {printWidthIn * 300} x {printHeightIn * 300} px at 300 DPI. Save the exported PNG as the design file — checkout sends that file URL + variant ID to Printful, after Stripe payment succeeds.</p>
    {saveMsg ? <p><strong>{saveMsg}</strong></p> : null}
    <h3>Saved designs ({savedDesigns.length})</h3>
    {savedDesigns.length === 0 ? <p>No designs saved yet — export, then “Save design to database”.</p> : (
      <ul>{savedDesigns.map((d: any) => (<li key={d.id}>{d.name} — {d.status} — {d.publications} publication{d.publications === 1 ? '' : 's'}{d.files?.[0]?.file_url ? (<> — <a href={d.files[0].file_url} target="_blank" rel="noreferrer">print file</a></>) : null}</li>))}</ul>
    )}
  </div>);
}
