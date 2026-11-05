export const quickActionService = {
  async executeAction<T = unknown>(domain: string, action: string, payload: Record<string, unknown>): Promise<T> {
    const routeMap: Record<string, string> = {
      'crm': '/api/admin/crm/actions',
      'appointment': '/api/admin/crm/appointments/actions',
      'commerce': '/api/admin/commerce/actions',
      'finance': '/api/admin/finance/actions',
      'system': '/api/admin/system/actions',
      'analytics': '/api/admin/analytics/actions',
      'cms': '/api/admin/cms/actions',
    };
    const route = routeMap[domain] || `/api/admin/${domain}/actions`;
    const res = await fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...payload }) });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || `Action failed: ${res.status}`); }
    return res.json();
  },
  // Global search runs against /api/admin/search (grouped by entity
  // type) — the old target /api/admin/system/global-search never
  // existed, so palette search always came back empty. Groups are
  // flattened to the palette's { type, id, label, sub } shape with
  // singular type names the palette routes on.
  async globalSearch(query: string) {
    const res = await fetch(`/api/admin/search?q=${encodeURIComponent(query)}&type=all`);
    if (!res.ok) throw new Error('Global search failed');
    const j = await res.json();
    const singular: Record<string, string> = {
      customers: 'customer', appointments: 'appointment',
      invoices: 'invoice', payments: 'payment', messages: 'message',
      documents: 'document', orders: 'order', products: 'product',
      sellers: 'seller',
    };
    const label = (type: string, h: any): string => {
      switch (type) {
        case 'customers': return `${h.first_name || ''} ${h.last_name || ''}`.trim() || h.email || 'Customer';
        case 'appointments': return h.appointment_number ? `Appointment ${h.appointment_number}` : 'Appointment';
        case 'invoices': return h.number || 'Invoice';
        case 'payments': return `${h.payment_number || 'Payment'} — $${h.amount ?? '?'}`;
        case 'messages': return h.subject || 'Message';
        case 'documents': return h.name || 'Document';
        case 'orders': return h.customer_email || h.email || 'Order';
        case 'products': return h.name || 'Product';
        case 'sellers': return h.display_name || h.email || 'Seller';
        default: return h.name || 'Result';
      }
    };
    const sub = (type: string, h: any): string => {
      switch (type) {
        case 'customers': return h.email || '';
        case 'appointments': return h.status || '';
        case 'invoices': return [h.status, h.total != null ? `$${h.total}` : ''].filter(Boolean).join(' · ');
        case 'payments': return h.status || '';
        case 'messages': return h.from_address || '';
        case 'documents': return h.status || '';
        case 'orders': return [h.status, h.total_amount != null ? `$${h.total_amount}` : ''].filter(Boolean).join(' · ');
        case 'products': return h.brand || '';
        case 'sellers': return [h.email, h.status].filter(Boolean).join(' · ');
        default: return '';
      }
    };
    const flat: Array<{ type: string; id: string; label: string; sub: string; customerId: string | null }> = [];
    for (const group of j.results || []) {
      for (const hit of group.data || []) {
        flat.push({
          type: singular[group.type] || group.type,
          id: hit.id,
          label: label(group.type, hit),
          sub: sub(group.type, hit),
          // Owning customer, when the hit row carries one (messages/documents
          // → customer_id) so a click can land on that customer's profile, not
          // just a section.
          customerId: hit.primary_customer_id || hit.customer_id || null,
        });
      }
    }
    return flat;
  },
};
