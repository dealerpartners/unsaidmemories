import type { ReactNode } from "react";

/** Shared admin page furniture — the .adm-* kit from admin.css. */

export function PageHead({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  /* Clean page titles (owner's order, 2026-11-02): the title stands
     alone — no description/subtitle paragraph under the H1, and the
     breadcrumb lives in the shell header, never on the page. The old
     `sub` prop was removed here and at every call site. */
  return (
    <div className="adm-page-head">
      <div>
        <h1>{title}</h1>
      </div>
      {children && <div className="adm-page-actions">{children}</div>}
    </div>
  );
}

export function Kpi({ label, value, foot, tip }: { label: string; value: ReactNode; foot?: string; tip?: string }) {
  return (
    <div className="adm-card" data-tip={tip}>
      <div className="adm-kpi-label">{label}</div>
      <div className="adm-kpi-value">{value}</div>
      {foot && <div className="adm-kpi-foot">{foot}</div>}
    </div>
  );
}

export function StaffDenied() {
  return (
    <div className="adm-empty">
      <strong>Staff access required.</strong>
      <br />
      You are signed in, but this account has no admin role. Ask a platform
      administrator to add you under Admin Users.
    </div>
  );
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export function fmtMoney(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/** Plain-language meanings for status words, shown as tooltips so a
 *  status pill explains itself wherever it appears. */
const STATUS_TIPS: Record<string, string> = {
  active: "Active — this is live and in use.",
  published: "Published — shoppers can see this and buy it.",
  paid: "Paid — the money has been received.",
  completed: "Completed — finished. Nothing left to do.",
  approved: "Approved — checked and given the go-ahead.",
  draft: "Draft — not sent or published yet. Only staff can see it.",
  pending: "Pending — waiting for something: a payment, a reply, or a review.",
  pending_review: "Waiting for someone to check this and approve it.",
  invited: "An invitation was sent, but this person hasn't joined yet.",
  failed: "Something went wrong. Open it to see what happened.",
  cancelled: "Cancelled — this was stopped and will not go ahead.",
  rejected: "Reviewed and turned down.",
  inactive: "Turned off, but not deleted. It can be switched back on.",
};

export function StatusBadge({ value }: { value: string | null | undefined }) {
  const v = (value ?? "").toLowerCase();
  const cls =
    v === "active" || v === "published" || v === "paid" || v === "completed" || v === "approved"
      ? "adm-badge-green"
      : v === "draft" || v === "pending" || v === "pending_review" || v === "invited"
        ? "adm-badge-amber"
        : v === "failed" || v === "cancelled" || v === "rejected" || v === "inactive"
          ? "adm-badge-red"
          : "adm-badge-teal";
  return <span className={`adm-badge ${cls}`} data-tip={STATUS_TIPS[v]}>{value ?? "—"}</span>;
}
