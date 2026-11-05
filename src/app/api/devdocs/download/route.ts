import { NextResponse } from "next/server";
import { devdocsAll } from "@/lib/devdocs/data";

export const dynamic = "force-dynamic";

/**
 * GET /api/devdocs/download?path=/developers/<group>/<slug>
 * Every developer document is downloadable as JSON: the full document
 * (title, group, section, canonical href, markdown body) as a file.
 */
export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!path.startsWith("/developers/")) {
    return NextResponse.json({ error: "path_required" }, { status: 400 });
  }
  const all = await devdocsAll();
  const doc = all.find((d) => d.href === path);
  if (!doc) {
    return NextResponse.json({ error: "document_not_found" }, { status: 404 });
  }
  const payload = {
    format: "unsaid-devdoc/v1",
    title: doc.title,
    slug: doc.slug,
    group: doc.group,
    section: doc.sectionLabel,
    audience: doc.audience,
    href: doc.href,
    body_markdown: doc.body,
  };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${doc.slug}.json"`,
    },
  });
}
