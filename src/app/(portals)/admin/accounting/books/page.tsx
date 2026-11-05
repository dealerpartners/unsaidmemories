'use client';
import { useRouter } from 'next/navigation';
import { BooksView } from '@/components/portal/financial/BooksView';
import type { DawgNavSection } from '@/lib/types';
export default function BooksPage() {
  const router = useRouter();
  const navigate = (s: DawgNavSection) => router.push(`/admin/${s === 'dashboard' ? 'dashboard' : s}`);
  return <BooksView onNavigateSection={navigate} />;
}
