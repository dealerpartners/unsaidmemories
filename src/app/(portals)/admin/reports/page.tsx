'use client';
import { useRouter } from 'next/navigation';
import { ReportsView } from '@/components/portal/financial/ReportsView';
import type { DawgNavSection } from '@/lib/types';
export default function ReportsPage() {
  const router = useRouter();
  const navigate = (s: DawgNavSection) => router.push(`/admin/${s === 'dashboard' ? 'dashboard' : s}`);
  return <ReportsView onNavigateSection={navigate} />;
}
