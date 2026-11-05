import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ContactForm } from "@/components/contact-form";
import { helpArticles, findHelpArticle } from "@/lib/catalog";

export function generateStaticParams() {
  return helpArticles.map((a) => ({ slug: a.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = findHelpArticle(slug);
  if (!article) return { title: "Help & care — UnSaid" };
  return { title: `${article.title} — UnSaid Help` };
}

// /help/[slug] — the same simple point-and-card language as /help:
// a small heading, the answer in plain paragraphs, a way back.
// The FAQ slug renders the full question list, grouped by topic,
// each question on its own card.
export default async function HelpArticlePage({ params }: Props) {
  const { slug } = await params;
  // Legal documents live on their dedicated /legal routes — the old
  // help slugs land on the real documents, never on an article page.
  if (slug === "terms") {
    redirect("/legal/terms-of-service");
  }
  if (slug === "privacy") {
    redirect("/legal/privacy-policy");
  }
  const article = findHelpArticle(slug);
  if (!article) notFound();

  if (slug === "faq") {
    // Merged away (owner order, 2026-11-05): there is no separate FAQ
    // page — the questions live on the Help Center at /help, under its
    // banner. This route only redirects there.
    redirect("/help");
  }

  return (
    <main className="help-main">
      <p className="help-back">
        <Link href="/help">
          <ArrowLeft size={14} /> All help
        </Link>
      </p>
      <div className="help-head">
        <span className="eyebrow">Help &amp; care / {article.title}</span>
        <h1>{article.question}</h1>
      </div>
      <div className="help-article-body">
        {article.answer.map((para, i) => (
          <p key={i}>{para}</p>
        ))}
        {slug === "contact-us" ? (
          <ContactForm />
        ) : (
          <p className="help-more-row" style={{ marginTop: 34 }}>
            <Link className="button button-dark" href="/shop">
              Continue shopping <ArrowRight size={16} />
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
