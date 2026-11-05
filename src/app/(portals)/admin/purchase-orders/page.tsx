'use client';
import { useRouter } from 'next/navigation';
import { PurchaseOrdersView } from '@/components/portal/financial/PurchaseOrdersView';
import type { DawgNavSection } from '@/lib/types';
export default function PurchaseOrdersPage() {
  const router = useRouter();
  const navigate = (s: DawgNavSection) => router.push(`/admin/${s === 'dashboard' ? 'dashboard' : s}`);
  return <PurchaseOrdersView onNavigateSection={navigate} />;
}
