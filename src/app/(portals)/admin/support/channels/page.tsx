import type { Metadata } from "next";
import { db, T } from "../data";
import { CreateModalButton, ConfigToggle } from "../SupportControls";
import "../support.css";

export const metadata: Metadata = { title: "Support Desk — Channels & voice" };
export const dynamic = "force-dynamic";

// Channels & voice (owner's v2 comp) — real channel rows from
// support_channels; the voice capability toggles persist into the
// voice channel's config.
const VOICE_TOGGLES: { key: string; label: string; desc: string }[] = [
  { key: "call_recording", label: "Call recording", desc: "Record inbound and outbound calls." },
  { key: "voicemail_transcription", label: "Voicemail transcription", desc: "Transcribe and attach to customer record." },
  { key: "ivr_skills_routing", label: "IVR & skills routing", desc: "Route callers by intent and agent skills." },
  { key: "supervisor_monitoring", label: "Supervisor monitoring / barge", desc: "Monitor, whisper and join active calls." },
  { key: "callback_failover", label: "Callback & failover", desc: "Offer callbacks and fallback routing." },
];

export default async function SupportChannelsPage() {
  const { data } = await db().from("support_channels").select("*").eq("tenant_id", T()).order("created_at");
  const rows = data ?? [];
  const voice = rows.find((r: any) => ["voice", "phone"].includes(r.code)) ?? rows[0];
  const voiceConfig: Record<string, unknown> = (voice?.config ?? {}) as Record<string, unknown>;

  return (
    <div className="sup"><div className="content">
      <div className="pagehead">
        <div><h1>Channels &amp; voice</h1></div>
        <div className="actions">
          <CreateModalButton label="＋ Connect channel" title="Connect a channel" endpoint="/api/admin/support/channels" fields={[
            { name: "code", label: "Channel type", type: "select", options: ["email", "chat", "whatsapp", "voice", "sms", "social"] },
            { name: "name", label: "Display name", placeholder: "Channel name", required: true },
          ]} />
        </div>
      </div>
      <div className="split">
        <div className="card">
          <div className="cardhead"><strong>Connected channels</strong></div>
          <div className="cardbody settings-list">
            {rows.length === 0 ? <div className="empty">No channels configured yet.</div> : rows.map((ch: any) => (
              <div className="setting" key={ch.id}>
                <div><b style={{ textTransform: "capitalize" }}>{ch.name ?? ch.code}</b><div className="tiny muted">{ch.sending_domain ? `Sending domain ${ch.sending_domain} · ` : ""}{ch.is_active ? "Active" : "Inactive"}</div></div>
                <span className={`pill ${ch.is_active ? "green" : "amber"}`}>{ch.is_active ? "Connected" : "Setup"}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="cardhead"><strong>Voice operations</strong></div>
          <div className="cardbody settings-list">
            {!voice ? <div className="empty">Connect the voice channel to configure call capabilities.</div> : VOICE_TOGGLES.map((v) => (
              <div className="setting" key={v.key}>
                <div><b>{v.label}</b><div className="tiny muted">{v.desc}</div></div>
                <ConfigToggle endpoint={`/api/admin/support/channels/${voice.id}`} config={voiceConfig} configKey={v.key} label={v.label} />
              </div>
            ))}
            <p className="tiny muted" style={{ marginTop: 10 }}>Voice toggles save into the voice channel&apos;s configuration. Telephony itself runs through the connected voice provider (plug-in ready).</p>
          </div>
        </div>
      </div>
    </div></div>
  );
}
