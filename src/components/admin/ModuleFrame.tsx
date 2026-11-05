"use client";

/**
 * ModuleFrame — the on-page module sidebar, built to the Ad Center
 * reference pattern (owner order, 2026-10-31): a 240px white left rail
 * with the Unsaid logo block at the top, the module's name as a
 * collapsible section header (chevron), and ONLY that module's
 * children as nav leaves beneath it. The active leaf is teal-tinted.
 *
 * This is the ONE sidebar pattern every admin module uses — same logo,
 * same chevron, same active/hover states as the Ad Center (which the
 * owner ruled the reference). Content sits directly beside the rail,
 * full-bleed to the right edge.
 *
 * Routes outside any module (dashboard, ad center door, help) render
 * bare — the flyout is their navigation. The studio owns its own
 * viewport.
 */

import Link from "next/link";
import { createElement, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { ADMIN_NAV_TREE, type AdminNavSection } from "@/lib/admin/nav-tree";
import { navChildIcon } from "./nav-icons";
import type { ModuleCode } from "@/lib/admin/modules";
import "./module-frame.css";

const SKIP_SECTION_IDS = new Set(["studio"]);

interface Match {
  section: AdminNavSection;
  activeHref: string;
}

function resolve(pathname: string, _allowedModules: ModuleCode[] | null): Match | null {
  // The on-page sidebar renders for the section that OWNS the current
  // URL — longset matching child href wins. The allowedModules filter
  // is NOT applied here: if you're on a page, the gate already cleared
  // your access, so its module's sidebar must show. (Hiding the rail
  // when a grants fetch returns a non-null array that excludes the
  // current module left a blank screen — the flyout is where the
  // grants filter belongs.)
  let best: { section: AdminNavSection; activeHref: string; len: number } | null = null;
  for (const section of ADMIN_NAV_TREE) {
    if (SKIP_SECTION_IDS.has(section.id)) continue;
    if (!section.children) continue;
    for (const child of section.children) {
      const hit = pathname === child.href || pathname.startsWith(child.href + "/");
      if (hit && (!best || child.href.length > best.len)) {
        best = { section, activeHref: child.href, len: child.href.length };
      }
    }
  }
  return best ? { section: best.section, activeHref: best.activeHref } : null;
}

export function ModuleFrame({
  children,
  allowedModules = null,
}: {
  children: React.ReactNode;
  allowedModules?: ModuleCode[] | null;
}) {
  const pathname = usePathname() ?? "";
  const match = resolve(pathname, allowedModules);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (!match) {
    // No owning section (dashboard root, ad center door, help) — bare content.
    return (
      <main className="adm-main">
        <div className="mframe-content">{children}</div>
      </main>
    );
  }

  const { section } = match;
  const isCollapsed = collapsed[section.id] === true;

  return (
    <div className="adm-shell mframe-shell">
      <aside className="adm-sidebar mframe-side" aria-label={`${section.label} pages`}>
        {/* Logo block — the Ad Center reference treatment (favicon + wordmark). */}
        <div className="mframe-logo">
          <img src="/favicon-512x512.png" alt="Unsaid" className="mframe-logo-mark" />
          <span className="mframe-logo-name">Unsaid</span>
        </div>

        <nav className="adm-nav mframe-nav">
          <div className="mframe-section">
            <button
              type="button"
              className="mframe-section-btn"
              aria-expanded={!isCollapsed}
              aria-controls={`mframe-children-${section.id}`}
              onClick={() => setCollapsed((p) => ({ ...p, [section.id]: !p[section.id] }))}
            >
              <span className="mframe-section-label">{section.label}</span>
              <ChevronDown
                size={15}
                strokeWidth={2}
                className={`mframe-chev${isCollapsed ? "" : " open"}`}
                aria-hidden="true"
              />
            </button>
            {!isCollapsed && (
              <div className="mframe-children" id={`mframe-children-${section.id}`}>
                {(() => {
                  const nodes: React.ReactNode[] = [];
                  let lastGroup: string | undefined;
                  for (const child of section.children ?? []) {
                    if (child.group && child.group !== lastGroup) {
                      nodes.push(
                        <div key={`group-${child.group}`} className="mframe-group-head">
                          {child.group}
                        </div>,
                      );
                    }
                    lastGroup = child.group;
                    const active =
                      pathname === child.href || pathname.startsWith(child.href + "/");
                    nodes.push(
                      <Link
                        key={child.href + child.label}
                        href={child.href}
                        className={`adm-nav-leaf${active ? " active" : ""}`}
                        aria-current={active ? "page" : undefined}
                        data-tip={child.tip}
                      >
                        {createElement(navChildIcon(child.label), { size: 16, strokeWidth: 1.8, "aria-hidden": true })}
                        <span>{child.label}</span>
                      </Link>,
                    );
                  }
                  return nodes;
                })()}
              </div>
            )}
          </div>
        </nav>
      </aside>
      <main className="adm-main mframe-main">
        <div className="mframe-content">{children}</div>
      </main>
    </div>
  );
}
