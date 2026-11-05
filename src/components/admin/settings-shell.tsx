"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Home, TriangleAlert, X } from "lucide-react";
import { SETTINGS_GROUPS, SETTINGS_HOME_PATH } from "@/lib/admin/settings-nav";
import { settingsIcon } from "@/components/admin/settings-icons";

/**
 * Sunny's settings_admin.html shell, converted: 280px sidebar with
 * collapsible groups (each collapses on its own), Home on top, the
 * "Get set up" card pinned in the footer, content on the right.
 */
export default function SettingsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setClosed((c) => ({ ...c, [id]: !c[id] }));
  const isHome = pathname === SETTINGS_HOME_PATH;

  return (
    <div className="flex min-h-full bg-white text-[#1a1c1e]">
      <aside className="flex w-[280px] shrink-0 flex-col border-r border-[#dad9dd] bg-white">
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-[#dad9dd] bg-white p-4">
          <h1 className="text-[20px] font-semibold">Settings</h1>
          <Link
            href="/admin"
            aria-label="Close settings"
            className="inline-flex h-8 w-8 items-center justify-center rounded text-[#5a6355] hover:bg-[#f4f3f7] hover:text-[#1a1c1e]"
          >
            <X size={20} />
          </Link>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          <Link
            href={SETTINGS_HOME_PATH}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] font-medium hover:bg-[#f4f3f7] ${isHome ? "bg-[#f4f3f7] font-semibold" : ""}`}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded bg-[#f4f3f7]">
              <Home size={16} />
            </span>
            Home
          </Link>

          {SETTINGS_GROUPS.map((group) => {
            const open = !closed[group.id];
            return (
              <div key={group.id}>
                <div className="pt-4" />
                <button
                  type="button"
                  onClick={() => toggle(group.id)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13px] font-semibold hover:bg-[#f4f3f7]"
                  aria-expanded={open}
                >
                  {group.label}
                  {open ? (
                    <ChevronDown size={16} className="text-[#5a6355]" />
                  ) : (
                    <ChevronRight size={16} className="text-[#5a6355]" />
                  )}
                </button>
                {open && (
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = settingsIcon(item.icon);
                      const href = `${SETTINGS_HOME_PATH}/${item.slug}`;
                      const active = pathname === href;
                      return (
                        <Link
                          key={item.slug}
                          href={href}
                          className={`flex w-full items-center gap-2 rounded-md py-2 pl-9 pr-3 text-left text-[13px] font-medium hover:bg-[#f4f3f7] ${active ? "bg-[#f4f3f7] font-semibold" : ""}`}
                        >
                          <Icon size={18} className="shrink-0 text-[#5a6355]" />
                          {item.label}
                          {item.warning && <TriangleAlert size={12} className="text-[#f59e0b]" />}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-[#dad9dd] bg-[#faf9fc] p-4">
          <div className="rounded-lg border border-[#d97706] bg-white p-3">
            <h4 className="mb-1 text-[12px] font-semibold">Get set up</h4>
            <p className="mb-2 text-[11px] text-[#5a6355]">
              Finish configuring your workspace to unlock all features.
            </p>
            <Link
              href={`${SETTINGS_HOME_PATH}/setup`}
              className="inline-flex h-7 items-center rounded border border-[#dad9dd] px-3 text-[11px] font-semibold hover:bg-[#f4f3f7]"
            >
              Continue setup
            </Link>
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-white">{children}</main>
    </div>
  );
}
