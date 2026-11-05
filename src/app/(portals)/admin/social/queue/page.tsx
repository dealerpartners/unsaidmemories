import { Suspense } from "react";
import type { Metadata } from "next";
import PublishingStudio from "../PublishingStudio";

export const metadata: Metadata = { title: "Publishing queue — Social" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PublishingStudio fixedView="queue" />
    </Suspense>
  );
}
