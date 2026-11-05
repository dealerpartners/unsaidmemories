'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface QuickActionContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const QuickActionContext = createContext<QuickActionContextValue>({
  isOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
});

export function useQuickActionPalette() {
  return useContext(QuickActionContext);
}

export function QuickActionProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);

  // SEARCH REWIRE (owner ruling 2026-10-31 05:59 CDT): ⌘K / Ctrl+K used to
  // toggle the imported GlobalCommandPalette pop-out. That pop-out is
  // retired; the same gesture now opens the ONE surviving search — the
  // Fabric search page at /admin/crm/search. (The palette's open/close
  // state above remains only so the on-disk, unmounted palette component
  // still compiles against this context; nothing renders it.)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        router.push('/admin/crm/search');
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [router]);

  return (
    <QuickActionContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </QuickActionContext.Provider>
  );
}
