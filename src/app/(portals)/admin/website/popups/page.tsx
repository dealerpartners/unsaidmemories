import { getAdminContext } from "@/lib/admin/gate";
import { PageHead, StaffDenied } from "@/components/admin/ui";
import WebsiteItemManager from "@/components/admin/website/WebsiteItemManager";
import { getPayloadPool, listPlacements, type PopupRow } from "@/lib/website-cms";

export const dynamic = "force-dynamic";

/** Website → Pop-ups: one published pop-up per page, placed by
 *  selecting the page. The list below is real rows; the form saves
 *  through /api/admin/website/popups. */
export default async function WebsitePopupsPage() {
  const ctx = await getAdminContext();
  if (!ctx) return <StaffDenied />;
  let rows: PopupRow[] = [];
  let loadError = "";
  try {
    const res = await getPayloadPool().query(`SELECT * FROM payload.popups ORDER BY updated_at DESC LIMIT 500`);
    rows = res.rows as PopupRow[];
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load pop-ups.";
  }
  const placements = await listPlacements();
  return (
    <div>
      <PageHead title="Pop-ups" />
      {loadError && <div className="adm-card"><p className="adm-help">Pop-ups could not be loaded right now ({loadError}). The form below still saves through the API when the database is reachable.</p></div>}
      <WebsiteItemManager kind="popup" items={rows} placements={placements} />
    </div>
  );
}
