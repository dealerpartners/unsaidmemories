'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ============================================================================
// QueryProvider — the client-side data layer for the portals.
//
// The app-shell architecture: every portal page is a STATIC shell (sidebar,
// topbar, chrome) that renders instantly from the compiled HTML + the
// persisted Zustand cache. All data — session AND domain data — is fetched
// on the client through TanStack Query (stale-while-revalidate): the cache
// renders immediately, fresh data arrives in the background. Nothing in the
// render path waits on the database.
//
// The QueryClient is created ONCE per browser session (never recreated on
// re-render), so the in-memory cache survives route changes — instant
// back-button navigation, no refetch storms.
// ============================================================================

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // SWR semantics: cached data is served instantly and considered
            // fresh for 30 seconds; older cache still renders instantly and
            // refetches in the background.
            staleTime: 30_000,
            // Portal data is session-scoped — a failed fetch should show the
            // error state, not silently retry into a wall.
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
