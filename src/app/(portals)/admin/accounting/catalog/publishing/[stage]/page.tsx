import { notFound } from 'next/navigation';
import PublishingView, { STAGE_KEYS, type StageKey } from '../publishing-view';

// /admin/accounting/catalog/publishing/[stage] — one pipeline stage
// per real route (concept | sourcing | prototype | ready). The stage
// shown is selected by the URL, filtered on the stage the API derives
// server-side; unknown stages 404 rather than falling back silently.
export default async function CatalogPublishingStagePage({
  params,
}: {
  params: Promise<{ stage: string }>;
}) {
  const { stage } = await params;
  if (!(STAGE_KEYS as string[]).includes(stage)) notFound();
  return <PublishingView stage={stage as StageKey} />;
}
