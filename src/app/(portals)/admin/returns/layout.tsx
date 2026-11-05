/**
 * Returns (module) module pages. The module's on-page navigation (its name and
 * ONLY its own children) is rendered by the (portals)/admin layout's
 * unified ModuleFrame — the ONE framer of the admin OS. The per-module
 * shell mounts are retired (owner order 2026-10-31: one chrome, one
 * framer, no second sidebar anywhere).
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
