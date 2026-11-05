'use client';
import { useRouter } from 'next/navigation';
import { OrderDetailsView } from '@/components/portal/financial/OrderDetailsView';
import type { DawgNavSection } from '@/lib/types';
export default function OrderDetailsPage() {
  const router = useRouter();
  const navigate = (s: DawgNavSection) => router.push(`/admin/${s === 'dashboard' ? 'dashboard' : s}`);
  return <OrderDetailsView onNavigateSection={navigate} />;
}
