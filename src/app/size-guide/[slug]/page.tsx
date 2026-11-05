import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SizeGuideTable } from "@/components/size-guide-table";
import { findSizeGuide, sizeGuideCharts } from "@/lib/size-guides";
import "@/components/size-guide.css";

/**
 * One product's size guide — a real route per guide (the owner's
 * pattern: department → category → product, each with its own URL
 * and its own intro copy). Statically generated for every chart.
 */

export function generateStaticParams() {
  return sizeGuideCharts.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const chart = findSizeGuide(slug);
  if (!chart) return { title: "Size Guide | UnSaid" };
  return {
    title: `${chart.name} Size Guide | UnSaid`,
    description: chart.intro,
  };
}

export default async function SizeGuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const chart = findSizeGuide(slug);
  if (!chart) notFound();

  return (
    <main className="brand-main">
      <div className="sg-guide">
        <Link className="sg-back" href="/size-guide">
          ← Back to all size guides
        </Link>
        <div className="sg-kicker">
          {chart.department} / {chart.category}
        </div>
        <h1>{chart.name}</h1>
        <p className="sg-guide-intro">{chart.intro}</p>
        <span className="sg-variant-label">{chart.variant}</span>
        <SizeGuideTable chart={chart} />
        <div className="sg-fit-help">
          <h3>Finding your fit</h3>
          <p>
            Compare the measurement labels carefully: garment width, body length and body
            chest measurements describe different things. If the product page displays a
            product-specific chart, use that chart as the final reference.
          </p>
        </div>
      </div>
    </main>
  );
}
