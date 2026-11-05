'use client';
import { useRouter } from 'next/navigation';
import { BankingView } from '@/components/portal/financial/BankingView';
import type { DawgNavSection } from '@/lib/types';
export default function BankingPage() {
  const router = useRouter();
  const navigate = (s: DawgNavSection) => router.push(`/admin/${s === 'dashboard' ? 'dashboard' : s}`);
  return <BankingView />;
}
