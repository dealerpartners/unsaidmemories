// Extracted from sellers/page.tsx — Next.js 16.3.3's type validator
// doesn't allow named exports from page files. This component is
// imported by both sellers/page.tsx and sellers/[id]/page.tsx.

const STATUS_BADGE: Record<string, string> = {
  active: "adm-badge-green",
  pending: "adm-badge-amber",
  rejected: "adm-badge-red",
  suspended: "adm-badge-red",
};

export function SellerStatusBadge({ status }: { status: string }) {
  return <span className={`adm-badge ${STATUS_BADGE[status] ?? ""}`}>{status}</span>;
}
