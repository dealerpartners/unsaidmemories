'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Calendar,
  Coins,
  CreditCard,
  FileText,
  Gift,
  Inbox,
  LifeBuoy,
  Lock,
  MessageSquare,
  Package,
  RotateCcw,
  Tag,
  Users,
} from 'lucide-react';
import { BUILT_MODULE_SURFACES } from '@/lib/employee/module-surfaces';

// ============================================================================
// Module doors — an assigned module's entry into its scoped surface INSIDE
// the employee portal, rendered as an ordinary navigation row (icon,
// label, access level, arrow), one below the next, exactly like the
// portal's native features. Only modules with a real built surface get a
// door (BUILT_MODULE_SURFACES): a module assigned before its surface is
// built stays absent rather than rendering a door to nothing.
// ============================================================================

export interface AssignedModule {
  code: string;
  label: string;
  accessLevel: string;
}

const MODULE_ICONS: Record<string, React.ElementType> = {
  customers: Users,
  appointments: Calendar,
  payments: CreditCard,
  invoices: FileText,
  deposits: Coins,
  refunds_disputes: RotateCcw,
  gift_cards_credits: Gift,
  inventory: Package,
  products_services: Tag,
  purchasing: Inbox,
  communications: MessageSquare,
  reports: BarChart3,
  support: LifeBuoy,
};

export const ACCESS_LABEL: Record<string, string> = {
  read: 'Read',
  write: 'Write',
  full: 'Full access',
};

export function moduleDoors(modules: AssignedModule[]) {
  return modules
    .map((m) => {
      const surface = BUILT_MODULE_SURFACES.find((s) => s.code === m.code);
      return surface ? { ...m, href: surface.href } : null;
    })
    .filter((d): d is AssignedModule & { href: string } => d !== null);
}

export interface TreeModule {
  code: string;
  label: string;
  assigned: boolean;
  accessLevel: string;
}

// The FULL §7 tree (owner doctrine: nav shows the full tree always).
// Assigned modules render as doors that open; unassigned modules render
// as locked rows — visible, labelled, and NOT enterable (no link). A
// module whose surface is not built yet renders locked with a "not yet
// available" note even when assigned, rather than a door to nothing.
export function ModuleTreeRows({ allModules }: { allModules: TreeModule[] }) {
  const surfaceByCode = new Map(BUILT_MODULE_SURFACES.map((s) => [s.code, s]));
  return (
    <div className="divide-y divide-border">
      {allModules.map((m) => {
        const Icon = MODULE_ICONS[m.code] || Users;
        const surface = surfaceByCode.get(m.code);
        if (m.assigned && surface) {
          return (
            <Link
              key={m.code}
              href={surface.href}
              className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition-colors"
            >
              <div className="size-9 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
                <Icon className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground truncate">{m.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  {ACCESS_LABEL[m.accessLevel] || m.accessLevel} access
                </p>
              </div>
              <ArrowRight className="size-4 text-muted-foreground shrink-0" />
            </Link>
          );
        }
        return (
          <div
            key={m.code}
            aria-disabled="true"
            className="flex items-center gap-4 px-4 py-3 opacity-60 cursor-not-allowed select-none"
          >
            <div className="size-9 rounded-lg bg-muted text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <Icon className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-foreground truncate">{m.label}</p>
              <p className="text-[11px] text-muted-foreground">
                {m.assigned
                  ? 'Assigned — its page is not available yet'
                  : 'Locked — not assigned to your role'}
              </p>
            </div>
            <Lock className="size-4 text-muted-foreground shrink-0" />
          </div>
        );
      })}
    </div>
  );
}

export function ModuleDoorRows({ modules }: { modules: AssignedModule[] }) {
  const doors = moduleDoors(modules);
  return (
    <div className="divide-y divide-border">
      {doors.map((d) => {
        const Icon = MODULE_ICONS[d.code] || Users;
        return (
          <Link
            key={d.code}
            href={d.href}
            className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition-colors"
          >
            <div className="size-9 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0">
              <Icon className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-foreground truncate">{d.label}</p>
              <p className="text-[11px] text-muted-foreground">
                {ACCESS_LABEL[d.accessLevel] || d.accessLevel} access
              </p>
            </div>
            <ArrowRight className="size-4 text-muted-foreground shrink-0" />
          </Link>
        );
      })}
    </div>
  );
}
