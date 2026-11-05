import Link from "next/link";
import { Suspense } from "react";
import { CustomerSupport } from "@/components/site/customer-support";
import { BrandPage } from "@/components/brand-page";
import { ArrowRight, Mail, MessageCircle } from "lucide-react";
import { helpArticles } from "@/lib/catalog";
import { brandFaq, findBrandPage } from "@/lib/brand-pages";
import { legalDocs } from "@/lib/legal-documents";

export const metadata = { title: "Help Center — UnSaid" };

// /help — the Help Center: ONE page (owner order, 2026-11-05 — the old
// split between a help index and a separate FAQ page is merged away).
// His FAQ page supplies the banner; everything else lives below it:
// the help content (support + guides), the full question list from the
// FAQ ("Still have questions? We've got answers."), and the legal
// documents under that. /help/faq redirects here.
export default function HelpPage() {
  const faqPage = findBrandPage("faq")!;
  const page = { ...faqPage, title: "Help Center — UnSaid Memories" };
  const guides = helpArticles.filter((a) => a.slug !== "faq");

  return (
    <BrandPage page={page}>
      <section className="brand-content" style={{ paddingTop: 0 }}>
        <div className="brand-section-head">
          <div>
            <div className="eyebrow">HELP CENTER</div>
            <h2>How can we help?</h2>
          </div>
          <p>
            Plain answers about ordering, shipping, returns, and designing. If you can&rsquo;t
            find yours, a real person is one message away — we reply within one business day.
          </p>
        </div>

        <Suspense fallback={null}>
          <CustomerSupport />
        </Suspense>

        <h2 className="help-section-title">Guides</h2>
        <div className="help-grid">
          {guides.map((article) => (
            <Link key={article.slug} href={`/help/${article.slug}`} className="help-card">
              <span className="help-card-kicker">{article.title}</span>
              <span className="help-card-question">{article.question}</span>
              <span className="help-card-teaser">{article.answer[0]}</span>
              <span className="help-card-more">
                Read <ArrowRight size={14} />
              </span>
            </Link>
          ))}
        </div>

        <h2 className="help-section-title">Still have questions? We&rsquo;ve got answers.</h2>
        <div className="brand-faq-list">
          {brandFaq.map((item) => (
            <details className="brand-faq" key={item.q}>
              <summary>
                <span>{item.q}</span>
                <b aria-hidden="true">+</b>
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>

        <h2 className="help-section-title" id="policies">
          Policies &amp; documents
        </h2>
        <div className="help-grid">
          {legalDocs.map((doc) => (
            <Link key={doc.slug} href={`/legal/${doc.slug}`} className="help-card">
              <span className="help-card-kicker">Policy &amp; documents</span>
              <span className="help-card-question">{doc.title}</span>
              <span className="help-card-teaser">{doc.summary}</span>
              <span className="help-card-more">
                Read <ArrowRight size={14} />
              </span>
            </Link>
          ))}
        </div>

        <div className="help-contact-band">
          <div>
            <span className="help-contact-icon">
              <Mail size={18} />
            </span>
            <p>
              <b>Email &amp; messages</b>
              <small>
                Reach us any time through the <Link href="/help/contact-us">contact page</Link> —
                order number handy, if you have one.
              </small>
            </p>
          </div>
          <div>
            <span className="help-contact-icon">
              <MessageCircle size={18} />
            </span>
            <p>
              <b>We reply fast</b>
              <small>Within one business day, usually faster.</small>
            </p>
          </div>
        </div>
      </section>
    </BrandPage>
  );
}
