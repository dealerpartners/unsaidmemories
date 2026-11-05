import type { Metadata } from "next";
import StudioClient from "./studio-client";

/**
 * Fabric Design Studio entry route (server component).
 *
 * The studio is a client-only react-konva application (Konva needs the
 * DOM, so the Stage / Layer / Rect / Text components cannot be server-
 * rendered). We render a tiny server component that ships zero Konva
 * code to the browser, then delegate to `<StudioClient />`, a Client
 * Component that performs the `dynamic(() => import(...), { ssr:false })`
 * call (Next.js 16 forbids `ssr:false` inside Server Components).
 *
 * IMPORTANT: do NOT import `konva`, `react-konva`, or any canvas
 * component from this file or any other server component.
 */

export const metadata: Metadata = {
  title: "Design Studio — UnSaid",
  description:
    "Production-grade react-konva canvas editor for print-on-demand products.",
};

export default function StudioPage() {
  return <StudioClient />;
}
