import { redirect } from "next/navigation";

/**
 * /admin/inventory/stock → /admin/inventory (owner order, 2026-10-31).
 * The native ERP inventory surface that lived here (because the
 * (portals) tabbed placeholder occupied /admin/inventory) has been
 * lifted to /admin/inventory itself — that placeholder is retired.
 * This route keeps the old URL working by forwarding to the real page.
 */
export default async function StockRedirect({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cq?: string; cpage?: string }>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(sp).filter(([, v]) => v)),
  ).toString();
  redirect(qs ? `/admin/inventory?${qs}` : "/admin/inventory");
}
