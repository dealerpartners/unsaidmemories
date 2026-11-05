/**
 * Integrations module layout — pass-through (owner order, 2026-10-31).
 * The old .int-wrap wrapper set its own canvas + purple tokens, doubling
 * the chrome; it is removed. The ModuleFrame sidebar carries this
 * module's navigation; integrations.css stays imported for page
 * internals, its purple literals remapped to teal.
 */
import "./integrations.css";

export default function IntegrationsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
