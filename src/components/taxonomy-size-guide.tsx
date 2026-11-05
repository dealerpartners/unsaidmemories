import Link from "next/link";
import { sizeGuidesForShopNames } from "@/lib/size-guides";
import { SizeGuideTable } from "./size-guide-table";
import "./size-guide.css";

/**
 * TaxonomySizeGuide — the owner's rule rendered: a department's
 * child (subcategory) page carries the size guide for its product
 * type, with copy that talks about the collection by name. Renders
 * nothing when the subcategory has no mapped guide. The charts are
 * the same ones the /size-guide directory serves.
 */
export function TaxonomySizeGuide({ names }: { names: string[] }) {
  const charts = sizeGuidesForShopNames(names);
  if (!charts.length) return null;
  const collection = names[names.length - 1] ?? "";
  const department = names.length > 1 ? names[names.length - 2] : "";

  return (
    <section className="sg-taxonomy" aria-label={`Size guide for ${collection}`}>
      <div className="sg-section-head">
        <h2>Size guide — {collection}</h2>
        <span className="sg-rule" />
      </div>
      <p className="sg-taxonomy-copy">
        Shopping the {department ? `${department} ` : ""}
        {collection} collection? Sizes are not universal — the same letter can measure
        differently from one style to the next — so check the chart for the piece you are
        buying before you order. Each chart below says whether it measures the garment
        laid flat or the body it is made to fit, and the full guide lives at{" "}
        <Link href="/size-guide">our size guide</Link>.
      </p>
      {charts.map((chart) => (
        <div key={chart.id} className="sg-taxonomy-chart">
          <h3>
            <Link href={`/size-guide/${chart.slug}`}>{chart.name}</Link>
          </h3>
          <p className="sg-chart-basis">{chart.intro}</p>
          <SizeGuideTable chart={chart} />
        </div>
      ))}
    </section>
  );
}
