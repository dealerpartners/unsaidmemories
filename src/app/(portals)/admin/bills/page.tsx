'use client';
import { useRouter } from 'next/navigation';
import { BillsView } from '@/components/portal/financial/BillsView';
import type { DawgNavSection } from '@/lib/types';
export default function BillsPage() {
  const router = useRouter();
  const navigate = (s: DawgNavSection) => router.push(`/admin/${s === 'dashboard' ? 'dashboard' : s}`);
  return <BillsView />;
}
