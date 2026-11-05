'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Scale } from 'lucide-react';
import { useAppStore } from '@/lib/portal-store';
import { PaymentsView } from '@/components/portal/financial/PaymentsView';
import type { DawgNavSection } from '@/lib/types';
export default function PaymentsPage() {
  const router = useRouter();
  const { setActiveModal } = useAppStore();
  const navigate = (s: DawgNavSection) => router.push(`/admin/${s === 'dashboard' ? 'dashboard' : s}`);
  return (
    <div>
      <div className="px-4 pt-3">
        <Link href="/admin/payments/reconciliation" className="inline-flex items-center gap-1.5 text-[13px] font-medium underline underline-offset-2">
          <Scale className="size-4" /> Stripe Reconciliation — commerce_payments vs Stripe charges vs webhook events (C3)
        </Link>
      </div>
      <PaymentsView onNavigateSection={navigate} onOpenQuickPayment={() => setActiveModal('payment')} />
    </div>
  );
}
