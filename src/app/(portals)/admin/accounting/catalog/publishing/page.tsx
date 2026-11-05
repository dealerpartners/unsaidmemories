import PublishingView from './publishing-view';

// /admin/accounting/catalog/publishing — All Projects (index stage
// route). Each pipeline stage is its own real route under
// /admin/accounting/catalog/publishing/[stage]; see publishing-view.
export default function CatalogPublishingPage() {
  return <PublishingView stage="all" />;
}
