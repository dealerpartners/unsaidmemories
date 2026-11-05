'use client';
import { useRouter } from 'next/navigation';
import { PayrollView } from '@/components/portal/financial/PayrollView';
import type { DawgNavSection } from '@/lib/types';
export default function PayrollPage() {
  const router = useRouter();
  const navigate = (s: DawgNavSection) => router.push(`/admin/${s === 'dashboard' ? 'dashboard' : s}`);
  return <PayrollView onNavigateSection={navigate} />;
}
