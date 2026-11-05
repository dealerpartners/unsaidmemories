'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { useQuickActionPalette } from '@/providers/QuickActionProvider';
import { useQuickActions } from '@/hooks/useQuickActions';
import { QUICK_ACTIONS, DOMAIN_LABELS, type QuickActionDomain, type QuickActionItem, type PayloadField } from '@/config/quickActionRegistry';
import { quickActionService } from '@/services/quickActionService';
import { Search, ArrowRight, X, Loader2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// GlobalCommandPalette — Cmd+K palette that lists every quick action.
//
// BEHAVIOR:
//   • Route actions  → router.push(targetPath)
//   • Mutation actions w/o requiresPayload → execute immediately (good for
//     run_* automations like sys-run-rebooking)
//   • Mutation actions w/ requiresPayload + payloadFields → open a
//     structured form modal pre-populated with default values
//   • Mutation actions w/ requiresPayload but no payloadFields → open a
//     raw JSON textarea modal (power-user escape hatch)
//   • Modal / Export / Print actions → close (separate UI surfaces)
// ---------------------------------------------------------------------------

export function GlobalCommandPalette() {
  const { isOpen, close } = useQuickActionPalette();
  const router = useRouter();
  const { execute, isLoading } = useQuickActions();
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [pendingAction, setPendingAction] = useState<QuickActionItem | null>(null);

  // Debounced global search
  useEffect(() => {
    if (!search.trim() || search.trim().length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const data = await quickActionService.globalSearch(search);
        setSearchResults(Array.isArray(data) ? data : []);
      } catch { setSearchResults([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filteredActions = useMemo(() => {
    if (!search.trim()) return QUICK_ACTIONS;
    const q = search.toLowerCase();
    return QUICK_ACTIONS.filter(a => a.label.toLowerCase().includes(q) || a.domain.includes(q) || a.subCategory?.toLowerCase().includes(q));
  }, [search]);

  // Group by domain
  const grouped = useMemo(() => {
    const groups: Record<string, typeof QUICK_ACTIONS> = {};
    for (const action of filteredActions) {
      (groups[action.domain] ||= []).push(action);
    }
    return groups;
  }, [filteredActions]);

  const handleAction = (action: QuickActionItem) => {
    // 'modal' actions (e.g. sys-global-search "Search Customers") ARE this
    // palette — its search box already runs the global search. Keep the
    // palette open instead of closing it with no effect.
    if (action.actionType === 'modal') return;
    close();
    if (action.actionType === 'route' && action.targetPath) {
      router.push(action.targetPath);
    } else if (action.actionType === 'mutation' && action.mutationKey) {
      const [domain] = (action.mutationKey || '').split(':');
      const actionCode = action.id.replace(/-/g, '_');
      // If the action declares it needs a payload (or has payloadFields),
      // open the form modal. Otherwise execute immediately.
      if (action.requiresPayload || (action.payloadFields && action.payloadFields.length > 0)) {
        setPendingAction(action);
      } else {
        execute({ domain, action: actionCode, payload: {} });
      }
    }
  };

  const handleSearchResult = (result: any) => {
    close();
    // Land on the RECORD, not just the section, wherever the target
    // view supports a deep link: customers open via ?customer_id=
    // (CustomersView deep link), appointments via ?appointment_id=
    // (AppointmentsView deep link), orders via /admin/order-details?id=
    // (OrderDetailsView reads ?id=). Pets, documents and messages live
    // on their owner's profile, so they deep-link there when the hit
    // carries the owning customer.
    if (result.type === 'customer') router.push(`/admin/crm/customers/${result.id}`);
    else if (result.type === 'appointment') router.push(`/admin/appointments?appointment_id=${result.id}`);
    else if (result.type === 'order') router.push(`/admin/order-details?id=${result.id}`);
    else if (result.type === 'pet') {
      if (result.customerId) router.push(`/admin/crm/customers/${result.customerId}`);
      else router.push(`/admin/pets`);
    }
    else if (result.type === 'invoice') router.push(`/admin/invoices`);
    else if (result.type === 'payment') router.push(`/admin/payments`);
    else if (result.type === 'product') router.push(`/admin/products`);
    else if (result.type === 'seller') router.push(`/admin/sellers/${result.id}`);
    else if (result.type === 'document' || result.type === 'message') {
      if (result.customerId) router.push(`/admin/crm/customers/${result.customerId}`);
      else router.push(`/admin/crm`);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/50" onClick={close}>
        <div className="w-full max-w-xl bg-background border border-border rounded-xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
          <Command shouldFilter={false} className="rounded-xl">
            <div className="flex items-center gap-2 px-3 border-b border-border">
              <Search className="size-4 text-muted-foreground shrink-0" />
              <CommandInput placeholder="Search actions, customers, pets, orders…" value={search} onValueChange={setSearch} className="flex-1 h-11" />
              <kbd className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">ESC</kbd>
            </div>
            <CommandList className="max-h-[50vh] overflow-y-auto">
              <CommandEmpty>No results found.</CommandEmpty>
              {searchResults.length > 0 && (
                <CommandGroup heading="Search Results">
                  {searchResults.map((r: any) => (
                    <CommandItem key={`${r.type}-${r.id}`} value={`${r.type}-${r.id}`} onSelect={() => handleSearchResult(r)} className="gap-2">
                      <span className="text-[10px] font-bold uppercase text-muted-foreground w-16">{r.type}</span>
                      <span className="font-medium text-[13px]">{r.label}</span>
                      {r.sub && <span className="text-[11px] text-muted-foreground">{r.sub}</span>}
                    </CommandItem>
                  ))}
                  <CommandSeparator />
                </CommandGroup>
              )}
              {Object.entries(grouped).map(([domain, actions]) => actions.length > 0 && (
                <CommandGroup key={domain} heading={DOMAIN_LABELS[domain as QuickActionDomain] || domain}>
                  {actions.map(action => (
                    <CommandItem key={action.id} value={action.id} onSelect={() => handleAction(action)} className="gap-2">
                      <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
                      <span className="text-[13px]">{action.label}</span>
                      {action.subCategory && <span className="text-[10px] text-muted-foreground">{action.subCategory}</span>}
                      {action.requiresPayload && <span className="ml-auto text-[9px] text-amber-500 font-medium">needs input</span>}
                      {action.shortcut && <kbd className="ml-auto text-[9px] text-muted-foreground">{action.shortcut.join(' ')}</kbd>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </div>
      </div>
      {pendingAction && (
        <PayloadFormModal
          action={pendingAction}
          isLoading={isLoading}
          onClose={() => setPendingAction(null)}
          onExecute={(payload) => {
            const [domain] = (pendingAction.mutationKey || '').split(':');
            const actionCode = pendingAction.id.replace(/-/g, '_');
            execute({ domain, action: actionCode, payload });
            setPendingAction(null);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// PayloadFormModal — structured form when payloadFields are declared on the
// action, falling back to a raw JSON textarea when they are not.
// ---------------------------------------------------------------------------

interface PayloadFormModalProps {
  action: QuickActionItem;
  isLoading: boolean;
  onClose: () => void;
  onExecute: (payload: Record<string, unknown>) => void;
}

function PayloadFormModal({ action, isLoading, onClose, onExecute }: PayloadFormModalProps) {
  const hasFields = action.payloadFields && action.payloadFields.length > 0;
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (action.payloadFields) {
      for (const f of action.payloadFields) {
        init[f.name] = f.defaultValue !== undefined ? String(f.defaultValue) : '';
      }
    }
    return init;
  });
  const [jsonText, setJsonText] = useState('{}');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    if (hasFields) {
      const payload: Record<string, unknown> = {};
      const missing: string[] = [];
      for (const f of action.payloadFields!) {
        const raw = fieldValues[f.name]?.trim();
        if (f.required && !raw) {
          missing.push(f.label);
          continue;
        }
        if (!raw) continue;  // skip empty optional fields
        if (f.type === 'number') {
          const n = Number(raw);
          if (Number.isNaN(n)) {
            setValidationError(`${f.label} must be a number`);
            return;
          }
          payload[f.name] = n;
        } else if (f.type === 'uuid') {
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
            setValidationError(`${f.label} must be a valid UUID`);
            return;
          }
          payload[f.name] = raw;
        } else if (f.type === 'date') {
          payload[f.name] = raw;
        } else {
          payload[f.name] = raw;
        }
      }
      if (missing.length > 0) {
        setValidationError(`Required: ${missing.join(', ')}`);
        return;
      }
      onExecute(payload);
    } else {
      // Raw JSON path
      try {
        const parsed = JSON.parse(jsonText);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          setValidationError('Payload must be a JSON object');
          return;
        }
        onExecute(parsed);
      } catch (e) {
        setValidationError(`Invalid JSON: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg bg-background border border-border rounded-xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold">{action.label}</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          <p className="text-xs text-muted-foreground">
            {hasFields
              ? 'Fill in the required fields and click Execute.'
              : 'Enter the payload as a JSON object.'}
          </p>
          {hasFields ? (
            <div className="space-y-3">
              {action.payloadFields!.map((f: PayloadField) => (
                <div key={f.name} className="space-y-1">
                  <label htmlFor={`pf-${f.name}`} className="text-xs font-medium text-foreground flex items-center gap-1">
                    {f.label}
                    {f.required && <span className="text-red-500">*</span>}
                    {f.helpText && <span className="text-muted-foreground font-normal">— {f.helpText}</span>}
                  </label>
                  {f.type === 'select' && f.options ? (
                    <select
                      id={`pf-${f.name}`}
                      value={fieldValues[f.name] || ''}
                      onChange={(e) => setFieldValues(prev => ({ ...prev, [f.name]: e.target.value }))}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea
                      id={`pf-${f.name}`}
                      value={fieldValues[f.name] || ''}
                      onChange={(e) => setFieldValues(prev => ({ ...prev, [f.name]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  ) : (
                    <input
                      id={`pf-${f.name}`}
                      type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'}
                      value={fieldValues[f.name] || ''}
                      onChange={(e) => setFieldValues(prev => ({ ...prev, [f.name]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              className="w-full min-h-[180px] rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              placeholder={'{\n  "customer_id": "b2a3b20c-9816-5518-92db-f9395c063acd",\n  "amount": 25.00\n}'}
            />
          )}
          {validationError && (
            <p className="text-xs text-red-500 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">{validationError}</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <button
            type="button"
            onClick={onClose}
            className="px-3 h-9 rounded-md border border-input bg-background text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="px-3 h-9 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {isLoading && <Loader2 className="size-3.5 animate-spin" />}
            {isLoading ? 'Executing…' : 'Execute'}
          </button>
        </div>
      </form>
    </div>
  );
}
