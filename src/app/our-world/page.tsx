import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { ourWorldArticles } from "@/lib/catalog";

export const metadata = { title: "Our world — UnSaid" };

// /our-world — list every "our world" article as a card linking to its own
// /our-world/[slug] page. Reuses the home page's `.collection-grid` pattern.
const articlePhotos: Record<string, string> = {
  "how-it-works": "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=85",
  "gift-finder": "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=85",
  "guides-stories": "https://images.unsplash.com/photo-1523398002811-999ca8dec234?auto=format&fit=crop&w=900&q=85",
  "our-story": "https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&w=900&q=85",
  "the-memory-box": "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=900&q=85",
  "kinnectai": "https://images.unsplash.com/photo-1513201099705-a9746e1e201f?auto=format&fit=crop&w=900&q=85",
};

export default function OurWorldPage() {
  return (
    <main>
      <PageHero
        eyebrow="More than a gift"
        title="A little more thought,"
        titleEm="in everything."
        subtitle="How we think about gifts, connection, and the small moments. Browse our stories, our process, and what's coming next."
        ctaLabel="Shop the edit"
        ctaHref="/shop"
      />

      <section className="section collection-section">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">Our world / Stories, ideas, what's next</span>
            <h2>More than a <em>gift.</em></h2>
          </div>
          <Link href="/relationships" className="text-link">See the relationships <ArrowRight size={15} /></Link>
        </div>
        <div className="collection-grid">
          {ourWorldArticles.map((a) => (
            <Link
              key={a.slug}
              href={`/our-world/${a.slug}`}
              className="collection-card"
            >
              <div
                className="collection-photo"
                style={{ backgroundImage: `url('${articlePhotos[a.slug] ?? articlePhotos["how-it-works"]}')` }}
              />
              <span className="collection-label">{a.eyebrow}</span>
              <div className="collection-title">
                <h3>{a.title}</h3>
                <ArrowUpRight size={18} />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
