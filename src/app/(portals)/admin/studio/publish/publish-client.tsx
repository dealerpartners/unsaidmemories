"use client";

/**
 * Client-only dynamic-import wrapper for the Publish wizard.
 *
 * Mirrors studio-client.tsx for the same reason: the wizard imports
 * stageSpecForSide from ../canvas-editor (the canvas's own stage
 * lookup), and that module pulls in Konva, which needs the DOM.
 * Loading the wizard through next/dynamic with ssr:false keeps Konva
 * out of server rendering — the wizard is an admin tool reached from
 * the studio, never a public page.
 */

import dynamic from "next/dynamic";

const PublishWizard = dynamic(() => import("./publish-wizard"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        minHeight: "60vh",
        display: "grid",
        placeItems: "center",
        background: "#f8f8fb",
        color: "#202126",
        fontFamily: "system-ui, sans-serif",
        fontSize: 14,
      }}
    >
      Loading the Publish wizard…
    </div>
  ),
});

export default function PublishClient() {
  return <PublishWizard />;
}
