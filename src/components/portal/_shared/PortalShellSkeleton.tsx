'use client';

// ============================================================================
// PortalShellSkeleton — the STATIC shell in its loading state.
//
// Same structure as the real portal chrome (rail + topbar + content) built
// from pure skeleton blocks, so a first-visit session check produces ZERO
// layout shift: the frame renders instantly and the real content swaps into
// exactly the same boxes. Returning visitors never see this at all — their
// persisted user renders the real shell on first paint.
// ============================================================================

export function PortalShellSkeleton() {
  return (
    <div className="h-screen w-screen flex overflow-hidden bg-background text-foreground antialiased font-sans" aria-busy="true" aria-label="Loading portal">
      {/* Sidebar rail */}
      <div className="hidden lg:flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="h-16 flex items-center gap-2 px-4 border-b border-border">
          <div className="size-8 rounded-lg bg-muted animate-pulse" />
          <div className="h-4 w-32 rounded bg-muted animate-pulse" />
        </div>
        <div className="p-3 space-y-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 rounded-lg bg-muted/70 animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      </div>

      {/* Main column */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Topbar */}
        <div className="h-16 shrink-0 flex items-center justify-between gap-4 border-b border-border bg-sidebar px-4">
          <div className="h-8 w-40 rounded bg-muted animate-pulse" />
          <div className="flex items-center gap-3">
            <div className="h-8 w-24 rounded bg-muted animate-pulse" />
            <div className="size-8 rounded-full bg-muted animate-pulse" />
          </div>
        </div>

        {/* Content skeletons */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
          <div className="h-8 w-56 rounded bg-muted animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 rounded-xl border border-border bg-card animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
          <div className="h-64 rounded-xl border border-border bg-card animate-pulse" />
        </div>
      </div>
    </div>
  );
}
