import { getDesignTokens } from "@/lib/cms";
import { unstable_cache } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/public/cms/tokens.css — generates CSS custom properties
// from the CMS design tokens. The storefront loads this as a stylesheet
// so CMS-managed colors/typography/spacing are available as CSS variables.
// Usage: <link rel="stylesheet" href="/api/public/cms/tokens.css" />
export async function GET() {
  const tokens = await getDesignTokens();
  const lines: string[] = [":root {"];
  for (const t of tokens) {
    const varName = `--cms-${t.category}-${t.token_key}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    lines.push(`  ${varName}: ${t.token_value};`);
  }
  lines.push("}");
  const css = lines.join("\n");
  return new Response(css, {
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
