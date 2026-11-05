import { NextRequest, NextResponse } from "next/server";
import { getNavigationMenus, getNavigationItems } from "@/lib/cms";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const location = searchParams.get("location") ?? undefined;
  const menus = await getNavigationMenus(location);
  if (searchParams.get("withItems") === "true") {
    const withItems = await Promise.all(menus.map(async m => ({
      ...m,
      items: await getNavigationItems(m.id),
    })));
    return NextResponse.json({ menus: withItems });
  }
  return NextResponse.json({ menus });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { createNavigationItem } = await import("@/lib/cms");
  if (!body.menu_id || !body.label || !body.href) {
    return NextResponse.json({ error: "menu_id, label, and href required" }, { status: 400 });
  }
  const item = await createNavigationItem({
    menu_id: body.menu_id, label: body.label, href: body.href,
    item_type: body.item_type, sort_order: body.sort_order, badge: body.badge, icon: body.icon,
  });
  if (!item) return NextResponse.json({ error: "Failed to create item" }, { status: 500 });
  return NextResponse.json({ item }, { status: 201 });
}
