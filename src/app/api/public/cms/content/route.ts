import { NextRequest, NextResponse } from "next/server";
import { getContentBlocks, getPageByRoute, getNavigationMenus, getNavigationItems } from "@/lib/cms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/public/cms/content?route=/&locale=en-US
// Returns all published content blocks for a route + page config + navigation.
// This is the storefront engine — the single endpoint the storefront calls
// to get CMS-managed content for any page.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const route = searchParams.get("route") || "/";
  const locale = searchParams.get("locale") || "en-US";

  try {
    // Fetch page config + published content blocks in parallel
    const [page, blocks, headerMenus] = await Promise.all([
      getPageByRoute(route, locale),
      getContentBlocks({ status: "published", locale }),
      getNavigationMenus("header"),
    ]);

    // For header nav, fetch items for the first active menu
    let headerNav: any[] = [];
    if (headerMenus[0]) {
      headerNav = await getNavigationItems(headerMenus[0].id);
    }

    return NextResponse.json({
      route,
      locale,
      page: page ? {
        title: page.title,
        seo_config: page.seo_config,
        layout_config: page.layout_config,
      } : null,
      blocks: blocks.map(b => ({
        block_id: b.block_id,
        component_type: b.component_type,
        props: b.props,
        slot_id: b.slot_id,
        sort_order: b.sort_order,
      })),
      navigation: {
        header: headerNav.map(item => ({
          label: item.label,
          href: item.href,
          type: item.item_type,
          columns: item.columns,
          badge: item.badge,
          icon: item.icon,
        })),
      },
    });
  } catch (err) {
    return NextResponse.json({
      route,
      locale,
      page: null,
      blocks: [],
      navigation: { header: [] },
      error: err instanceof Error ? err.message : "Failed to load CMS content",
    }, { status: 200 }); // 200 so the storefront doesn't crash — it renders defaults
  }
}
