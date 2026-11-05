/**
 * Accounting module layout — pass-through (owner order, 2026-10-31).
 * The module's on-page navigation is the unified ModuleFrame sidebar
 * (.adm-sidebar with this module's children), NOT a second self-mounted
 * rail. accounting.css stays imported for the module's page-internal
 * card/table styles; its old .acct-side sidebar rules are unused.
 */
import "./accounting.css";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
