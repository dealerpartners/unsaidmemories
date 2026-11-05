"use client";

import { useState, useRef, useEffect } from "react";

/* ─── MetricCard ─── */
interface MetricCardProps {
  label: string;
  value: string | number;
  delta?: string;
  deltaType?: "positive" | "negative" | "neutral";
  prefix?: string;
}
export function MetricCard({ label, value, delta, deltaType = "neutral", prefix }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-neutral-100 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">{label}</p>
      <p className="mt-2 text-3xl font-bold text-neutral-900">{prefix}{value}</p>
      {delta && (
        <p className={`mt-1 text-xs font-medium ${deltaType === "positive" ? "text-emerald-600" : deltaType === "negative" ? "text-red-500" : "text-neutral-500"}`}>
          {delta}
        </p>
      )}
    </div>
  );
}

/* ─── StatusBadge ─── */
type Status = "active" | "paused" | "draft" | "completed" | "pending_review" | "rejected" | "in_review";
const statusStyles: Record<Status, string> = {
  active: "bg-emerald-50 text-emerald-700",
  paused: "bg-neutral-100 text-neutral-500",
  draft: "bg-blue-50 text-blue-700",
  completed: "bg-neutral-100 text-neutral-600",
  pending_review: "bg-amber-50 text-amber-700",
  rejected: "bg-red-50 text-red-600",
  in_review: "bg-amber-50 text-amber-700",
};
const statusLabels: Record<Status, string> = {
  active: "Active", paused: "Paused", draft: "Draft", completed: "Completed",
  pending_review: "Pending Review", rejected: "Rejected", in_review: "In Review",
};

interface StatusBadgeProps { status: Status; label?: string; }
export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[status] ?? "bg-neutral-100 text-neutral-500"}`}>
      {label ?? statusLabels[status] ?? status}
    </span>
  );
}

/* ─── StatusToggle ─── */
interface StatusToggleProps { active: boolean; onToggle: () => void; }
export function StatusToggle({ active, onToggle }: StatusToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${active ? "bg-emerald-500" : "bg-neutral-200"}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${active ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

/* ─── PageHeader ─── */
interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
}
export function PageHeader({ title, description, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <div className="mb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="mb-2 flex items-center gap-1.5 text-sm text-neutral-500">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-neutral-300">/</span>}
              {crumb.href ? (
                <a href={crumb.href} className="transition-colors hover:text-neutral-900">{crumb.label}</a>
              ) : (
                <span className={i === breadcrumbs.length - 1 ? "text-neutral-900" : ""}>{crumb.label}</span>
              )}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/* ─── TabBar ─── */
interface TabBarProps { tabs: string[]; active: number; onChange: (index: number) => void; }
export function TabBar({ tabs, active, onChange }: TabBarProps) {
  return (
    <div className="mb-6 flex gap-1 border-b border-neutral-200">
      {tabs.map((tab, i) => (
        <button
          key={tab}
          onClick={() => onChange(i)}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${
            i === active ? "border-b-2 border-neutral-900 text-neutral-900" : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

/* ─── FilterBar ─── */
interface FilterBarProps {
  searchPlaceholder?: string;
  filters?: { label: string; options: string[] }[];
  onSearch?: (value: string) => void;
}
export function FilterBar({ searchPlaceholder = "Search…", filters = [], onSearch }: FilterBarProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px]">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          placeholder={searchPlaceholder}
          onChange={(e) => onSearch?.(e.target.value)}
          className="w-full rounded-lg border border-neutral-200 py-2 pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
        />
      </div>
      {filters.map((filter) => (
        <select key={filter.label} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm text-neutral-700 focus:border-neutral-400 focus:outline-none">
          <option>{filter.label}</option>
          {filter.options.map((opt) => <option key={opt}>{opt}</option>)}
        </select>
      ))}
    </div>
  );
}

/* ─── BulkActionToolbar ─── */
interface BulkActionToolbarProps { selectedCount: number; actions: { label: string; href?: string; onClick?: () => void; variant?: "danger" }[]; }
export function BulkActionToolbar({ selectedCount, actions }: BulkActionToolbarProps) {
  if (selectedCount === 0) return null;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg bg-neutral-100 px-4 py-2.5">
      <span className="text-sm font-medium text-neutral-700">{selectedCount} selected</span>
      <div className="flex items-center gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              action.variant === "danger" ? "text-red-600 hover:bg-red-50" : "text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── EmptyState ─── */
interface EmptyStateProps { title: string; description: string; action?: { label: string; href: string }; }
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" />
        </svg>
      </div>
      <h3 className="mt-4 text-sm font-semibold text-neutral-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-neutral-500">{description}</p>
      {action && (
        <a href={action.href} className="mt-4 rounded-lg bg-[#f2eafe] px-4 py-2 text-sm font-medium text-[#6942c2] transition-colors hover:bg-[#e7dbfc]">
          {action.label}
        </a>
      )}
    </div>
  );
}

/* ─── DataTable ─── */
interface Column { key: string; label: string; className?: string; render?: (value: any, row: any) => React.ReactNode; }
interface DataTableProps {
  columns: Column[];
  data: any[];
  selectable?: boolean;
  selected?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleAll?: () => void;
  rowHref?: (row: any) => string;
}
export function DataTable({ columns, data, selectable, selected, onToggleSelect, onToggleAll, rowHref }: DataTableProps) {
  const allSelected = data.length > 0 && selected && data.every((row) => selected.has(row.id));
  return (
    <div className="rounded-xl border border-neutral-100 bg-white overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-neutral-100 text-left text-xs font-medium uppercase tracking-wider text-neutral-400">
            {selectable && (
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  className="h-4 w-4 rounded border-neutral-300"
                />
              </th>
            )}
            {columns.map((col) => (
              <th key={col.key} className={`px-4 py-3 ${col.className ?? ""}`}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan={columns.length + (selectable ? 1 : 0)} className="py-12 text-center text-sm text-neutral-400">No data</td></tr>
          ) : (
            data.map((row) => {
              const Wrapper = rowHref ? "a" : "div";
              const wrapperProps = rowHref ? { href: rowHref(row) } : {};
              return (
                <tr key={row.id} className="border-b border-neutral-50 text-sm last:border-0 hover:bg-neutral-50/50">
                  {selectable && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected?.has(row.id) ?? false}
                        onChange={() => onToggleSelect?.(row.id)}
                        className="h-4 w-4 rounded border-neutral-300"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 ${col.className ?? ""}`}>
                      {col.render ? col.render(row[col.key], row) : (
                        <span className="text-neutral-700">{row[col.key]}</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ─── ActivityTimeline ─── */
interface ActivityItem { id: string; action: string; user: string; time: string; detail?: string; }
interface ActivityTimelineProps { items: ActivityItem[]; }
export function ActivityTimeline({ items }: ActivityTimelineProps) {
  return (
    <div className="space-y-4">
      {items.map((item, i) => (
        <div key={item.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-neutral-600">
              {item.user[0]}
            </div>
            {i < items.length - 1 && <div className="flex-1 w-px bg-neutral-200" />}
          </div>
          <div className="flex-1 pb-4">
            <p className="text-sm text-neutral-900"><span className="font-medium">{item.user}</span> {item.action}</p>
            {item.detail && <p className="mt-0.5 text-xs text-neutral-500">{item.detail}</p>}
            <p className="mt-0.5 text-xs text-neutral-400">{item.time}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── EstimatePanel ─── */
interface EstimatePanelProps { estimates: { label: string; value: string }[]; deliveryLikelihood?: number; }
export function EstimatePanel({ estimates, deliveryLikelihood }: EstimatePanelProps) {
  return (
    <div className="rounded-xl border border-neutral-100 bg-white p-5">
      <h3 className="text-sm font-semibold text-neutral-900 mb-3">Estimated results</h3>
      <div className="space-y-2.5 text-sm">
        {estimates.map((e) => (
          <div key={e.label} className="flex justify-between">
            <span className="text-neutral-500">{e.label}</span>
            <span className="font-medium text-neutral-900">{e.value}</span>
          </div>
        ))}
      </div>
      {deliveryLikelihood !== undefined && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-neutral-500 mb-1">
            <span>Delivery likelihood</span>
            <span className="font-medium text-neutral-700">{deliveryLikelihood}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-neutral-100">
            <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${deliveryLikelihood}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── PolicyPanel ─── */
interface PolicyIssue { severity: "error" | "warning" | "info"; message: string; }
interface PolicyPanelProps { issues: PolicyIssue[]; }
export function PolicyPanel({ issues }: PolicyPanelProps) {
  if (issues.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-100 bg-white p-5">
        <h3 className="text-sm font-semibold text-neutral-900 mb-2">Policy check</h3>
        <p className="text-sm text-emerald-600">No issues found.</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-neutral-100 bg-white p-5">
      <h3 className="text-sm font-semibold text-neutral-900 mb-3">Policy check</h3>
      <div className="space-y-2">
        {issues.map((issue, i) => (
          <div key={i} className={`flex items-start gap-2 rounded-lg p-2.5 text-sm ${
            issue.severity === "error" ? "bg-red-50 text-red-700" : issue.severity === "warning" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
          }`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
              {issue.severity === "error" ? <><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></> : <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>}
            </svg>
            {issue.message}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── CardGrid ─── */
interface CardGridProps { cards: { label: string; description?: string; href: string; icon?: string }[]; }
export function CardGrid({ cards }: CardGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <a
          key={card.label}
          href={card.href}
          className="rounded-xl border border-neutral-100 bg-white p-5 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
        >
          <h3 className="text-sm font-semibold text-neutral-900">{card.label}</h3>
          {card.description && <p className="mt-1 text-xs text-neutral-500">{card.description}</p>}
        </a>
      ))}
    </div>
  );
}

/* ─── FormField ─── */
interface FormFieldProps { label: string; children: React.ReactNode; description?: string; }
export function FormField({ label, children, description }: FormFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-700 mb-1">{label}</label>
      {children}
      {description && <p className="mt-1 text-xs text-neutral-400">{description}</p>}
    </div>
  );
}

/* ─── Button ─── */
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: "primary" | "secondary" | "danger" | "ghost"; }
export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const base = "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50";
  const styles: Record<string, string> = {
    primary: "bg-[#f2eafe] text-[#6942c2] hover:bg-[#e7dbfc]",
    secondary: "border border-neutral-200 text-neutral-700 hover:bg-neutral-50",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-neutral-600 hover:bg-neutral-100",
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />;
}

/* ═══════════════════════════════════════════════════════════
   Global Components — reusable across all list pages
   ═══════════════════════════════════════════════════════════ */

/* ─── Custom Columns ─── */
interface CustomColumnsProps {
  allColumns: { key: string; label: string }[];
  visibleKeys: string[];
  onChange: (keys: string[]) => void;
}
export function CustomColumns({ allColumns, visibleKeys, onChange }: CustomColumnsProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (key: string) => {
    onChange(visibleKeys.includes(key) ? visibleKeys.filter((k) => k !== key) : [...visibleKeys, key]);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="10" y1="3" x2="10" y2="21" />
        </svg>
        Columns
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 max-h-72 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-2 shadow-lg z-50">
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">Visible columns</p>
          {allColumns.map((col) => (
            <label key={col.key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50 cursor-pointer">
              <input
                type="checkbox"
                checked={visibleKeys.includes(col.key)}
                onChange={() => toggle(col.key)}
                className="h-3.5 w-3.5 rounded border-neutral-300"
              />
              {col.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Breakdown Selector ─── */
interface BreakdownSelectorProps {
  options: { key: string; label: string }[];
  selected?: string;
  onChange: (key: string) => void;
}
export function BreakdownSelector({ options, selected, onChange }: BreakdownSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const activeLabel = options.find((o) => o.key === selected)?.label || "None";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" /><path d="M7 16l4-4 4 4 5-5" />
        </svg>
        Breakdown: {activeLabel}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg z-50">
          <button
            onClick={() => { onChange(""); setOpen(false); }}
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${!selected ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-600 hover:bg-neutral-50"}`}
          >
            None
          </button>
          {options.map((opt) => (
            <button
              key={opt.key}
              onClick={() => { onChange(opt.key); setOpen(false); }}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${selected === opt.key ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-600 hover:bg-neutral-50"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Export CSV/PDF ─── */
interface ExportButtonProps {
  onExportCSV?: () => void;
  onExportPDF?: () => void;
}
export function ExportButton({ onExportCSV, onExportPDF }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Export
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-40 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg z-50">
          <button
            onClick={() => { onExportCSV?.(); setOpen(false); }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            Export CSV
          </button>
          <button
            onClick={() => { onExportPDF?.(); setOpen(false); }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            Export PDF
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Actions Dropdown ─── */
interface ActionsDropdownProps {
  actions: { label: string; onClick?: () => void; variant?: "danger"; icon?: string }[];
}
export function ActionsDropdown({ actions }: ActionsDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50"
      >
        Actions
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lg z-50">
          {actions.map((action, i) => (
            <button
              key={i}
              onClick={() => { action.onClick?.(); setOpen(false); }}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                action.variant === "danger" ? "text-red-600 hover:bg-red-50" : "text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Confirmation Dialog ─── */
interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: "danger" | "primary";
}
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = "Confirm", variant = "primary" }: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-xl">
        <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
        <p className="mt-2 text-sm text-neutral-600">{message}</p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button onClick={onClose} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">Cancel</button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${variant === "danger" ? "bg-red-600 text-white hover:bg-red-700" : "bg-[#f2eafe] text-[#6942c2] hover:bg-[#e7dbfc]"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Permissions / Access Gate ─── */
interface PermissionsGateProps {
  hasAccess: boolean;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}
export function PermissionsGate({ hasAccess, fallback, children }: PermissionsGateProps) {
  if (!hasAccess) {
    return fallback ? <>{fallback}</> : (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
            <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h3 className="mt-4 text-sm font-semibold text-neutral-900">Access Denied</h3>
        <p className="mt-1 max-w-sm text-sm text-neutral-500">You do not have permission to view this content. Contact your account admin to request access.</p>
      </div>
    );
  }
  return <>{children}</>;
}

/* ─── Date Range Filter (standalone component) ─── */
interface DateRangeFilterProps {
  value?: string;
  onChange?: (value: string) => void;
}
export function DateRangeFilter({ value = "last-30", onChange }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const presets = [
    { id: "today", label: "Today" }, { id: "yesterday", label: "Yesterday" },
    { id: "last-7", label: "Last 7 days" }, { id: "last-14", label: "Last 14 days" },
    { id: "last-30", label: "Last 30 days" }, { id: "last-90", label: "Last 90 days" },
    { id: "this-month", label: "This month" }, { id: "last-month", label: "Last month" },
  ];
  const activeLabel = presets.find((p) => p.id === value)?.label || "Last 30 days";

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        {activeLabel}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 w-44 rounded-xl border border-neutral-200 bg-white p-2 shadow-lg z-50">
          {presets.map((p) => (
            <button key={p.id} onClick={() => { onChange?.(p.id); setOpen(false); }}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${value === p.id ? "bg-neutral-100 font-medium text-neutral-900" : "text-neutral-600 hover:bg-neutral-50"}`}>
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Global Search (standalone component) ─── */
interface GlobalSearchProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}
export function GlobalSearch({ value = "", onChange, placeholder = "Search…" }: GlobalSearchProps) {
  return (
    <div className="relative min-w-[200px]">
      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-neutral-200 py-1.5 pl-8 pr-3 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:outline-none"
      />
    </div>
  );
}
