import { getAdminContext } from "@/lib/admin/gate";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import WebsiteItemManager from "@/components/admin/website/WebsiteItemManager";
import { getPayloadPool, listPlacements, type BannerRow } from "@/lib/website-cms";

export const dynamic = "force-dynamic";

/** Website → Banners: one published banner per page, placed by
 *  selecting the page — every generated page, category pages
 *  included. The list below is real rows; the form saves through
 *  /api/admin/website/banners. */
export default async function WebsiteBannersPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  let rows: BannerRow[] = [];
  let loadError = "";
  try {
    const res = await getPayloadPool().query(`SELECT * FROM payload.banners ORDER BY updated_at DESC LIMIT 500`);
    rows = res.rows as BannerRow[];
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load banners.";
  }
  const placements = await listPlacements();
  return (
    <div>
      <PageHead title="Banners" />
      {loadError && <div className="adm-card"><p className="adm-help">Banners could not be loaded right now ({loadError}). The form below still saves through the API when the database is reachable.</p></div>}
      <WebsiteItemManager kind="banner" items={rows} placements={placements} />
    </div>
  );
}
