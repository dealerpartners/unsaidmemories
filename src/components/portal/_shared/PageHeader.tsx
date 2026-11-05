"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * PageHeader — standardized enterprise page header for UnSaid Memories OS.
 *
 * Renders a polished status strip + title row matching the pattern
 * established in BooksView / DashboardView. Uses ONLY the brand palette
 * tokens defined in src/app/globals.css.
 *
 * Brand palette (do NOT change):
 *   CANVAS               #FFFFFF  → background, card
 *   SIDE & TOP BAR       #4A4A4A  → sidebar / topbar
 *   SIDE & TOP BAR TEXT  #FBFCFD  → sidebar-foreground / topbar-foreground
 *   BUTTONS              #AA3F15  → primary
 *   BUTTON TEXT          #00494B  → primary-foreground
 *   QUICK ACTIONS        #007C7D  → quick / quick-foreground
 */
export interface PageHeaderProps {
  /** Optional small label shown in the status strip (e.g. "Books & General Records"). */
  contextLabel?: React.ReactNode;
  /** Optional status items shown on the right of the status strip. */
  statusItems?: Array<{
    label: React.ReactNode;
    value?: React.ReactNode;
    tone?: "default" | "success" | "warning" | "destructive" | "info";
  }>;
  /** Main page title. */
  title: React.ReactNode;
  /** Optional description shown under the title. */
  description?: React.ReactNode;
  /** Optional badge shown next to the title (e.g. count "32 Active"). */
  badge?: React.ReactNode;
  /** Optional action area on the right of the title row. */
  actions?: React.ReactNode;
  /** Optional className for the outer wrapper. */
  className?: string;
}

const TONE_TEXT_CLASS: Record<
  NonNullable<NonNullable<PageHeaderProps["statusItems"]>[number]["tone"]>,
  string
> = {
  default: "text-muted-foreground",
  success: "text-success font-semibold",
  warning: "text-warning font-semibold",
  destructive: "text-destructive font-semibold",
  info: "text-info font-semibold",
};

export function PageHeader({
  contextLabel,
  statusItems,
  title,
  description,
  badge,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col w-full text-foreground bg-background", className)}>
      {(contextLabel || (statusItems && statusItems.length > 0)) && (
        <div className="w-full bg-muted/60 border-b border-border px-4 py-2 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="size-2 rounded-full bg-success animate-pulse shrink-0" />
            {contextLabel && (
              <span className="font-medium text-[11px] text-muted-foreground truncate">
                {contextLabel}
              </span>
            )}
          </div>
          {statusItems && statusItems.length > 0 && (
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
              {statusItems.map((item, idx) => (
                <span key={idx} className="font-medium flex items-center gap-1.5">
                  {item.label && <span className="text-muted-foreground/80">{item.label}</span>}
                  {item.value && (
                    <span className={TONE_TEXT_CLASS[item.tone ?? "default"]}>
                      {item.value}
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="p-6 border-b border-border bg-background flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground leading-tight">
              {title}
            </h1>
            {badge && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground border border-border">
                {badge}
              </span>
            )}
          </div>
          {description && (
            <p className="text-[13px] text-muted-foreground mt-1 max-w-2xl leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex gap-2 items-center shrink-0 flex-wrap">{actions}</div>
        )}
      </div>
    </div>
  );
}

/**
 * PageTabs — standardized sub-navigation tabs shown beneath a PageHeader.
 * Active tab uses the brand primary accent (terracotta #AA3F15).
 */
export interface PageTabItem {
  id: string;
  label: React.ReactNode;
  count?: React.ReactNode;
}

export interface PageTabsProps {
  tabs: PageTabItem[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
}

export function PageTabs({ tabs, activeId, onSelect, className }: PageTabsProps) {
  return (
    <div
      className={cn(
        "w-full bg-background border-b border-border flex overflow-x-auto shrink-0 custom-scrollbar",
        className,
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            className={cn(
              "px-5 py-3 text-[13px] font-medium border-r border-border flex items-center gap-2 cursor-pointer transition-colors duration-150 whitespace-nowrap",
              isActive
                ? "text-primary  border-b-primary -mb-px"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * PageToolbar — standardized horizontal toolbar (filter row) shown beneath tabs.
 * Provides a subtle background + border for grouping filter controls.
 */
export function PageToolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 flex-shrink-0 bg-card border border-border rounded-xl p-3 shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * FilterSelect — a refined replacement for the brutalist native <select>
 * filters. Renders a styled select with the brand palette.
 */
export function FilterSelect({
  value,
  onChange,
  children,
  className,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div className={cn("relative inline-flex", className)}>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-background border border-input hover:border-primary/40 rounded-lg pl-3 pr-8 h-8 text-[12px] font-medium text-foreground cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  );
}

/**
 * ViewSwitcher — segmented toggle control for switching view modes
 * (Table / Kanban / Hourly / Calendar / Grid).
 */
export interface ViewModeItem {
  id: string;
  label: string;
  icon: React.ElementType;
  title?: string;
}

export function ViewSwitcher({
  modes,
  activeId,
  onSelect,
  className,
}: {
  modes: ViewModeItem[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-border bg-muted/40",
        className,
      )}
    >
      {modes.map((mode) => {
        const Icon = mode.icon;
        const isActive = mode.id === activeId;
        return (
          <button
            key={mode.id}
            type="button"
            onClick={() => onSelect(mode.id)}
            title={mode.title}
            aria-label={mode.label}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 h-7 rounded text-[12px] font-medium transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive
                ? "bg-background text-primary shadow-card"
                : "text-muted-foreground hover:bg-background hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            <span className="hidden md:inline">{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * KpiTiles — standardized 4-tile KPI summary grid.
 *
 * Renders a responsive grid of stat cards (1 col mobile, 2 col sm, 4 col lg).
 * Each tile has: label, value, optional caption, optional tone coloring,
 * and optional icon. Uses only brand palette tokens.
 *
 * Pattern established in DashboardView, BooksView, CustomersView, InventoryView.
 */
export interface KpiTile {
  label: React.ReactNode;
  value: React.ReactNode;
  caption?: React.ReactNode;
  /** Tone for the value text. Defaults to "default" (foreground). */
  tone?: "default" | "primary" | "success" | "warning" | "destructive" | "info";
  /** Optional Lucide icon component OR a ready-rendered icon element. */
  icon?: React.ElementType | React.ReactElement;
}

export interface KpiTilesProps {
  tiles: KpiTile[];
  className?: string;
}

const KPI_TONE_CLASS: Record<NonNullable<KpiTile["tone"]>, string> = {
  default: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  info: "text-info",
};

const KPI_ICON_TONE_BG: Record<NonNullable<KpiTile["tone"]>, string> = {
  default: "bg-muted text-muted-foreground",
  primary: "text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  info: "bg-info/10 text-info",
};

export function KpiTiles({ tiles, className }: KpiTilesProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4",
        className,
      )}
    >
      {tiles.map((tile, idx) => {
        const Icon = tile.icon;
        const tone = tile.tone ?? "default";
        return (
          <div
            key={idx}
            className="bg-card border border-border rounded-xl p-4 flex flex-col justify-between shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card-md hover:border-primary/30"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {tile.label}
              </span>
              {Icon && (
                <span
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded-lg shrink-0 [&>svg]:size-4",
                    KPI_ICON_TONE_BG[tone],
                  )}
                >
                  {typeof Icon === "function" ? (
                    <Icon className="size-4" />
                  ) : (
                    (Icon as React.ReactElement)
                  )}
                </span>
              )}
            </div>
            <div
              className={cn(
                "text-2xl font-display font-semibold tracking-tight tabular-nums mt-2",
                KPI_TONE_CLASS[tone],
              )}
            >
              {tile.value}
            </div>
            {tile.caption && (
              <span className="text-[11px] text-muted-foreground mt-1">
                {tile.caption}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * DataTable — standardized enterprise data table wrapper.
 *
 * Renders a polished card-wrapped table with consistent header styling,
 * row hover, and dividers. Uses only brand palette tokens.
 *
 * Pattern established in BooksView, InvoicesView, PaymentsView, CustomersView,
 * AppointmentsView, InventoryView, DepositsView.
 */
export interface DataTableColumn {
  /** Column header label. */
  header: React.ReactNode;
  /** Optional alignment for the header cell. */
  align?: "left" | "right" | "center";
  /** Optional className override for the header cell. */
  headerClassName?: string;
  /** Optional className for the body cells in this column. */
  cellClassName?: string;
}

export interface DataTableProps {
  /** Column definitions (header + alignment). */
  columns: DataTableColumn[];
  /** Optional ReactNode rendered above the table (e.g. a summary bar with title + count + total). */
  headerBar?: React.ReactNode;
  /** Optional ReactNode rendered below the table (e.g. pagination footer). */
  footerBar?: React.ReactNode;
  /** Row content — each child is a <tr> element. */
  children: React.ReactNode;
  /** Optional className for the outer card wrapper. */
  className?: string;
  /** Optional empty state content rendered when there are no rows. */
  emptyState?: React.ReactNode;
  /** Whether the table body has any rows (used to decide whether to show the empty state). */
  hasRows?: boolean;
}

const DT_ALIGN_CLASS: Record<NonNullable<DataTableColumn["align"]>, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function DataTable({
  columns,
  headerBar,
  footerBar,
  children,
  className,
  emptyState,
  hasRows = true,
}: DataTableProps) {
  return (
    <div
      className={cn(
        "bg-card border border-border rounded-xl shadow-card overflow-hidden",
        className,
      )}
    >
      {headerBar && (
        <div className="bg-muted/40 border-b border-border px-4 py-2.5 flex items-center justify-between">
          {headerBar}
        </div>
      )}
      <div className="overflow-x-auto w-full">
        <table className="w-full border-collapse text-left text-[13px] text-foreground">
          <thead>
            <tr className="border-b border-border bg-muted/30 font-semibold uppercase text-[11px] tracking-wider text-muted-foreground">
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className={cn(
                    "p-3 font-semibold",
                    idx < columns.length - 1 && "border-r border-border",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    col.headerClassName,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {hasRows ? (
              children
            ) : (
              <tr>
                <td colSpan={columns.length} className="p-8 text-center">
                  {emptyState ?? (
                    <span className="text-[13px] text-muted-foreground">
                      No records found
                    </span>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {footerBar && (
        <div className="bg-muted/40 border-t border-border px-3 py-3">
          {footerBar}
        </div>
      )}
    </div>
  );
}
