'use client';

// ============================================================================
// ViewHeader — the page header for the dashboard-domain views: the
// title ALONE with the view's action buttons on the right. Per the
// owner's design rule (2026-11-02 13:05 CST): breadcrumbs live in the
// shell header, never on the page, and page titles are CLEAN — no
// breadcrumb eyebrow above the H1 and no description/subtitle
// paragraph under it. (This component previously rendered the
// "ManageKube LLC — Unsaid / Dashboard / …" eyebrow and a subtitle;
// both are removed, and the call sites no longer pass them.)
// Shared by the seven dashboard views so the chrome is identical
// across them; content below the header is each view's own.
// ============================================================================

import type { ReactNode } from "react";

export function ViewHeader({
  title,
  children,
}: {
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <h1 className="text-[28px] leading-8 font-semibold tracking-tight text-foreground">{title}</h1>
      {children ? <div className="flex items-center gap-2 flex-wrap">{children}</div> : null}
    </div>
  );
}

export const money = (v: unknown) =>
  `$${Number(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export function initialsOf(text: string): string {
  const words = text.replace(/[^a-zA-Z ]/g, " ").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "?") + (words[1]?.[0] ?? "")).toUpperCase();
}
