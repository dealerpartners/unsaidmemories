'use client';
import { useRouter } from 'next/navigation';
import { ReturnsView } from '@/components/portal/financial/ReturnsView';
import { ReturnsOversight } from '@/components/portal/financial/ReturnsOversight';
import type { DawgNavSection } from '@/lib/types';
export default function ReturnsPage() {
  const router = useRouter();
  const navigate = (s: DawgNavSection) => router.push(`/admin/${s === 'dashboard' ? 'dashboard' : s}`);
  return (
    <>
      <ReturnsView onNavigateSection={navigate} />
      <ReturnsOversight onNavigateSection={navigate} />
    </>
  );
}
