import MarketplaceApp from "../marketplace-app";
import { taxonomy } from "@/lib/marketplace-static";
import { notFound } from "next/navigation";

export default async function MarketplaceCategoryPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;

  // Validate the slug path exists in the taxonomy
  let nodes: any[] = taxonomy;
  for (const s of slug) {
    const found = nodes.find((n: any) => n.slug === s);
    if (!found) notFound();
    nodes = found.children || [];
  }

  return <MarketplaceApp slugs={slug} />;
}

// Pre-generate all 383 category routes
export async function generateStaticParams() {
  const paths: { slug: string[] }[] = [];

  function walk(nodes: any[], path: string[] = []) {
    for (const n of nodes) {
      const slug = n.slug;
      const full = [...path, slug];
      paths.push({ slug: full });
      if (n.children?.length) walk(n.children, full);
    }
  }

  walk(taxonomy);
  return paths;
}
