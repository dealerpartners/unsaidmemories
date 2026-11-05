'use client';
import { useRouter } from 'next/navigation';
import { FinancialSettingsView } from '@/components/portal/financial/FinancialSettingsView';
import type { DawgNavSection } from '@/lib/types';
export default function FinancialSettingsPage() {
  const router = useRouter();
  const navigate = (s: DawgNavSection) => router.push(`/admin/${s === 'dashboard' ? 'dashboard' : s}`);
  return <FinancialSettingsView onNavigateSection={navigate} />;
}
