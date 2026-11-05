import type { Metadata } from "next";
import Subnav from "../subnav";
import ConnectWizard from "./connect-wizard";

export const metadata: Metadata = { title: "Connect a Service — Admin" };
export const dynamic = "force-dynamic";

/**
 * Connect a Service wizard (Wizard #3 in notes/wizard-catalog.md) —
 * the guided way to plug in one service, launched from the
 * Connections & Keys page's "Connect a service — step by step"
 * button. All four steps working: pick the service from the shared
 * integrations catalog, what it does + what you'll need, paste the
 * key through the existing connections save path, and the live test
 * ending on the proof line (or an honest saved-not-testable line).
 */
export default function ConnectServicePage() {
  return (
    <div>
      <Subnav />
      <ConnectWizard />
    </div>
  );
}
