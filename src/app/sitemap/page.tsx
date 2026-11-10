import { createServerClient } from "@/lib/supabase";
import { SitemapExplorer } from "./sitemap-client";

export const metadata = {
  title: "Sitemap | UnSaid",
  description: "Every page of UnSaid — the full shop catalog, departments, collections, relationships, and more.",
};


// Collections come from the database (the same rows /collections
// serves); departments come from the static taxonomy in the client.
export default async function SitemapPage() {
  const sb = createServerClient();
  const { data } = await sb.from("collections").select("name, slug").order("name").limit(200);
  const collections = (data ?? [])
    .filter((c) => c.slug)
    .map((c) => ({ name: String(c.name), slug: String(c.slug) }));

  return <SitemapExplorer collections={collections} />;
}
