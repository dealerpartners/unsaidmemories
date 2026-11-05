import { Suspense } from "react";
import type { Metadata } from "next";
import PublishingStudio from "../PublishingStudio";

export const metadata: Metadata = { title: "Create post — Social" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PublishingStudio fixedView="create" />
    </Suspense>
  );
}
