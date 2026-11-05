'use client';
import { useRouter } from 'next/navigation';
import { DepositsView } from '@/components/portal/financial/DepositsView';
import type { DawgNavSection } from '@/lib/types';
export default function DepositsPage() {
  const router = useRouter();
  const navigate = (s: DawgNavSection) => router.push(`/admin/${s === 'dashboard' ? 'dashboard' : s}`);
  return <DepositsView onNavigateSection={navigate} />;
}
