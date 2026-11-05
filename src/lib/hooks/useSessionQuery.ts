'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/lib/portal-store';
import type { AuthUser } from '@/lib/types';

// ============================================================================
// useSessionQuery — the portal session as a stale-while-revalidate query.
//
// The persisted Zustand user (localStorage) is the INSTANT cache: returning
// visitors get it on first paint, so the shell never waits on the network.
// The server session (/api/auth/portal-session, portal_session cookie) is the
// single source of truth: it revalidates in the background on mount, on
// window focus, and on every route change this hook is mounted for — and the
// reconcile callback corrects the store (and the route) to whatever the
// server says.
//
// This replaces the old full-screen blocking spinner: the shell renders
// immediately; the gate reconciles asynchronously.
// ============================================================================

interface SessionResponse {
  user: AuthUser | null;
}

export interface UseSessionQueryResult {
  /** The best-known user right now: server answer if it has arrived,
   *  otherwise the persisted cache. null once the server has answered null. */
  user: AuthUser | null;
  /** True while the first server check for THIS mount is in flight and no
   *  server answer has arrived yet (the cached user may still be shown). */
  isLoading: boolean;
  /** True once the server has answered (user or null) for this mount. */
  isResolved: boolean;
}

export function useSessionQuery(onServerUser?: (user: AuthUser | null) => void): UseSessionQueryResult {
  const persistedUser = useAppStore((s) => s.currentUser);

  const query = useQuery<SessionResponse>({
    queryKey: ['portal-session'],
    queryFn: async () => {
      // cache: 'no-store' — a session answer is a function of the request
      // cookie; it must NEVER be served from any HTTP cache.
      const res = await fetch('/api/auth/portal-session', { cache: 'no-store' });
      if (!res.ok) throw new Error('Session check failed');
      return res.json();
    },
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: true,
    // The persisted user is the instant cache — shown until (and unless)
    // the server's answer replaces it.
    placeholderData: { user: persistedUser },
  });

  // Reconcile the store with the server's answer — once per settled fetch.
  // ONLY a REAL server answer reconciles: React Query v5 serves placeholder
  // data with status 'success' + isPlaceholderData true, and a network error
  // keeps the cached user rendering — either way the persisted user stays
  // exactly as-is until the server has actually spoken. The server saying
  // user: null IS authoritative (cookie gone → door); a placeholder or the
  // network failing to answer is not.
  const serverUser = query.data?.user ?? null;
  const arrived = query.isSuccess && !query.isPlaceholderData;
  useEffect(() => {
    if (!arrived || !onServerUser) return;
    onServerUser(serverUser);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrived, serverUser?.id, serverUser?.role]);

  return {
    user: query.data?.user ?? null,
    // While the first server check is in flight, the CALLER decides whether
    // to render from the persisted cache (returning visitor = instant shell).
    isLoading: query.isPending,
    // A REAL server answer has arrived (never the placeholder).
    isResolved: arrived,
  };
}
