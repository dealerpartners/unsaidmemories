"use client";

/**
 * Client-only dynamic-import wrapper for the Fabric Design Studio.
 *
 * `next/dynamic` with `ssr: false` is forbidden inside Server Components
 * (Next.js 16). This file is a Client Component, so it can host the
 * dynamic import. The server-rendered `page.tsx` renders this wrapper.
 *
 * The dynamic import means `konva` + `react-konva` only enter the browser
 * bundle — they are never server-rendered (Konva needs the DOM).
 */

import dynamic from "next/dynamic";
import StudioWindowShell from "./studio-window";

const DesignStudio = dynamic(() => import("./design-studio"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f8f8fb",
        color: "#7c7e89",
        fontFamily: "system-ui, sans-serif",
        fontSize: 14,
      }}
    >
      Loading Design Studio…
    </div>
  ),
});

export default function StudioClient() {
  // The window shell owns the pop-out modes (float / full / split /
  // docked). It wraps the studio in a byte-stable tree and only
  // restyles its frame, so the studio inside is never remounted.
  return (
    <StudioWindowShell>
      <DesignStudio />
    </StudioWindowShell>
  );
}
