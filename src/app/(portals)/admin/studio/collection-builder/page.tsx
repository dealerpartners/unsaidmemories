import type { Metadata } from "next";
import CollectionBuilderClient from "./collection-builder-client";

export const metadata: Metadata = {
  title: "Collection Builder — UnSaid",
  description:
    "Build shippable collections from studio designs with supplier conflict detection.",
};

export default function CollectionBuilderPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Collection Builder</h1>
      </div>
      <CollectionBuilderClient />
    </div>
  );
}
