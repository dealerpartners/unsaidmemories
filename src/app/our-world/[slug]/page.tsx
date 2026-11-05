import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { ourWorldArticles, findOurWorldArticle } from "@/lib/catalog";

export function generateStaticParams() {
  return ourWorldArticles.map((a) => ({ slug: a.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = findOurWorldArticle(slug);
  if (!article) return { title: "Our world — UnSaid" };
  return { title: `${article.title} — UnSaid Our world` };
}

export default async function OurWorldArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = findOurWorldArticle(slug);
  if (!article) notFound();

  return (
    <main>
      <PageHero
        eyebrow={article.eyebrow}
        title={article.title}
        ctaLabel="Back to our world"
        ctaHref="/our-world"
      />

      <section className="section">
        <div className="section-heading compact">
          <div>
            <span className="eyebrow">{article.eyebrow}</span>
            <h2>{article.title}</h2>
          </div>
          <Link href="/our-world" className="text-link">All our world <ArrowRight size={15} /></Link>
        </div>

        <div className="editorial-content" style={{ padding: "0", maxWidth: 620 }}>
          {article.body.map((para, i) => (
            <p
              key={i}
              style={{
                fontSize: "14px",
                lineHeight: 1.95,
                color: "#706b77",
                margin: "0 0 18px",
              }}
            >
              {para}
            </p>
          ))}
          <Link className="button button-dark" href="/shop">Shop the edit <ArrowRight size={16} /></Link>
        </div>
      </section>
    </main>
  );
}
