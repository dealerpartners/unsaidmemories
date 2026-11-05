import { Suspense } from "react";
import { redirect } from "next/navigation";
import PublishingStudio from "./PublishingStudio";

// Social — the Publishing Studio (owner's design). Every view is a real
// app route (create/calendar/library/queue/channels/performance are
// their own pages); legacy ?view= URLs redirect to the matching route.
const VIEWS = ["create", "calendar", "library", "queue", "channels", "performance"];

export default async function SocialPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  if (sp?.view && VIEWS.includes(sp.view)) redirect(`/admin/social/${sp.view}`);
  return (
    <Suspense fallback={null}>
      <PublishingStudio fixedView="overview" />
    </Suspense>
  );
}
