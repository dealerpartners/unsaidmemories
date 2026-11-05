"use client";

// Advertising — Audiences (Sunny's MARKETING.html table). GAP: the ad
// platform has no audience/segment store — no ad_* table and no
// /api/admin/ads endpoint holds saved audiences (targeting lives on
// tiers and placements per campaign). The view renders his design with
// an honest empty state rather than demo segments.

import { Users } from "lucide-react";

export default function AdsAudiences() {
  return (
    <div className="card">
      <div className="card-pad">
        <strong>Saved audiences</strong>
        <div className="small muted">Reusable targeting segments across platforms.</div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Audience</th><th>Source</th><th>Size</th><th>Match rate</th></tr></thead>
          <tbody>
            <tr>
              <td colSpan={4}>
                <div className="empty">
                  <Users />
                  No saved audiences yet — the ad platform doesn&apos;t keep an audience store.
                  Targeting is set per campaign through its tier and placements.
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
