import type { Metadata } from "next";
import { resolveActingStaff } from "@/lib/support/actor";
import { db, T, initials } from "../data";
import ProfileForm from "./ProfileForm";
import "../support.css";

export const metadata: Metadata = { title: "Support Desk — My profile & status" };
export const dynamic = "force-dynamic";

// My profile & status (owner's v2 comp) — the signed-in staffer's real
// team membership, skills and availability.
export default async function SupportProfilePage() {
  const staff = await resolveActingStaff();
  const sb = db();
  let member: any = null; let skills: any[] = []; let teamName: string | null = null;
  if (staff) {
    const { data } = await sb.from("support_team_members").select("*").eq("tenant_id", T()).eq("staff_id", staff.staffId).limit(1);
    member = data?.[0] ?? null;
    const { data: sk } = await sb.from("support_staff_skills").select("skill_code, level").eq("tenant_id", T()).eq("staff_id", staff.staffId);
    skills = sk ?? [];
    if (member?.team_id) {
      const { data: team } = await sb.from("support_teams").select("name").eq("id", member.team_id).maybeSingle();
      teamName = team?.name ?? null;
    }
  }

  return (
    <div className="sup"><div className="content">
      <div className="pagehead"><div><h1>My profile &amp; status</h1></div></div>
      {!staff ? (
        <div className="card"><div className="empty">Your sign-in has no staff profile, so there is no support profile to show. An administrator can add you to a support team.</div></div>
      ) : (
        <div className="card" style={{ maxWidth: 650 }}>
          <div className="cardbody">
            <div className="customerline">
              <div className="avatar" style={{ width: 52, height: 52 }}>{initials(staff.name ?? staff.email)}</div>
              <div><b>{staff.name ?? staff.email}</b><div className="muted tiny">{member?.role ? `${member.role}` : "Support staff"}{teamName ? ` · ${teamName}` : ""}</div></div>
            </div>
            <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "18px 0" }} />
            <div className="formrow">
              <label>Skills</label>
              <input readOnly value={skills.length ? skills.map((s: any) => s.skill_code).join(", ") : "No skills recorded yet"} />
            </div>
            {member ? (
              <ProfileForm memberId={member.id} available={!!member.is_available} maxConcurrent={member.max_concurrent ?? 4} />
            ) : (
              <p className="tiny muted">You are not on a support team yet, so availability and capacity do not apply. Everything else on the desk still works.</p>
            )}
          </div>
        </div>
      )}
    </div></div>
  );
}
