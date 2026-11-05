'use client';
import { useRouter } from 'next/navigation';
import { TaxesView } from '@/components/portal/financial/TaxesView';
import type { DawgNavSection } from '@/lib/types';
export default function TaxesPage() {
  const router = useRouter();
  const navigate = (s: DawgNavSection) => router.push(`/admin/${s === 'dashboard' ? 'dashboard' : s}`);
  return <TaxesView onNavigateSection={navigate} />;
}
