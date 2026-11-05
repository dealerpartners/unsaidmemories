'use client';

import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/portal-store';
import { PaymentsView } from '@/components/portal/financial/PaymentsView';
import type { DawgNavSection } from '@/lib/types';

// /admin/payments/checkouts — §3.2 Checkouts as its own surface: the
// checkout queue (completed appointments awaiting payment) rendered by
// the Payments register, opened directly on the Checkouts Queue view
// instead of living only as a sub-view inside Payments.

export default function CheckoutsPage() {
  const router = useRouter();
  const { setActiveModal } = useAppStore();
  const navigate = (s: DawgNavSection) => router.push(`/admin/${s === 'dashboard' ? 'dashboard' : s}`);
  return <PaymentsView onNavigateSection={navigate} onOpenQuickPayment={() => setActiveModal('payment')} defaultSubView="checkouts" />;
}
