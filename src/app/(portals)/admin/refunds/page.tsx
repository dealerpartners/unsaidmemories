'use client';
import { useRouter } from 'next/navigation';
import { RefundsView } from '@/components/portal/financial/RefundsView';
import type { DawgNavSection } from '@/lib/types';
export default function RefundsPage() {
  const router = useRouter();
  const navigate = (s: DawgNavSection) => router.push(`/admin/${s === 'dashboard' ? 'dashboard' : s}`);
  return <RefundsView onNavigateSection={navigate} />;
}
