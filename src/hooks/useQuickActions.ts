import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { quickActionService } from '@/services/quickActionService';
import type { QuickActionDomain } from '@/config/quickActionRegistry';

// ---------------------------------------------------------------------------
// useQuickActions — the single mutation hook that drives the
// GlobalCommandPalette. On every successful action execution, it must
// invalidate the TanStack Query caches that hold data the action may
// have mutated. Previously this invalidated `["finance"]` / `["admin"]`,
// but no query in useQueries.ts uses those keys — so caches were never
// actually refreshed after an action. This map resolves each domain
// to the list of query-root keys that ARE in use so invalidateQueries
// actually fires the refetch.
// ---------------------------------------------------------------------------

// Root query keys per useQueries.ts:
//   ["dashboard","kpis"] | ["staff", limit] | ["customers", limit, search]
//   ["customer-orders", limit] | ["customer-account"]
// Plus the page-level keys used inside View components:
//   ["admin", "*"] (various) — invalidating ["admin"] catches all of them.
const DOMAIN_TO_QUERY_ROOTS: Record<QuickActionDomain, string[]> = {
  crm:              ['customers', 'admin'],
  customer:         ['customers', 'customer-orders', 'customer-account', 'admin'],
  appointment:      ['dashboard', 'admin'],
  orders:           ['customer-orders', 'dashboard', 'admin'],
  fulfillment:      ['customer-orders', 'admin'],
  purchasing:       ['admin'],
  accounting:       ['dashboard', 'customer-orders', 'admin'],
  settings:         ['staff', 'admin'],
  cms:              ['admin', 'cms'],
  staff:            ['staff', 'admin'],
  employee_portal:  ['staff', 'admin'],
  customer_portal:  ['customer-account', 'customer-orders'],
  analytics:        ['dashboard', 'analytics', 'admin'],
  system:           ['staff', 'customers', 'dashboard', 'admin'],
};

export function useQuickActions() {
  const queryClient = useQueryClient();
  const dispatchAction = useMutation({
    mutationFn: ({ domain, action, payload }: { domain: string; action: string; payload: Record<string, unknown> }) =>
      quickActionService.executeAction(domain, action, payload),
    onSuccess: (data, variables) => {
      // Friendly toast: "Issue gift card" instead of "accts_issue_gift_card"
      const label = variables.action.replace(/^[a-z]+_/, '').replace(/_/g, ' ');
      toast.success(`Action executed: ${label}`);
      // SA-84 (bank_connect): the handler returns a Stripe Connect
      // onboarding URL — opening it IS the action. Scoped to this one
      // action so no other result shape is affected.
      if (variables.action === 'accts_bank_connect' && data && typeof (data as any).url === 'string') {
        window.location.href = (data as any).url;
      }
      // Invalidate the root keys mapped to this domain. invalidateQueries
      // with a partial key prefix matches any query whose key starts with
      // the given root — so ["customers"] invalidates ["customers", 200, ""].
      const roots = DOMAIN_TO_QUERY_ROOTS[variables.domain as QuickActionDomain] || ['admin'];
      for (const root of roots) {
        queryClient.invalidateQueries({ queryKey: [root] });
      }
      // Always also invalidate the global 'admin' bucket as a safety net.
      queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Action execution failed');
    },
  });
  return { execute: dispatchAction.mutateAsync, isLoading: dispatchAction.isPending };
}
