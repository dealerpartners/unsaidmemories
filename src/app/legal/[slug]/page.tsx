import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findLegalDoc, legalDocs } from "@/lib/legal-documents";

/**
 * The dedicated legal routes (owner order, 2026-11-03): every legal
 * document is its own real page under /legal — the URLs the signup
 * checkbox, the footer, and outside services (merchant listings)
 * point at. Content lives in lib/legal-documents.ts, adapted from
 * the store's own published rules.
 */

export function generateStaticParams() {
  return legalDocs.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = findLegalDoc(slug);
  if (!doc) return { title: "Legal — UnSaid" };
  return { title: `${doc.title} — UnSaid`, description: doc.summary };
}

export default async function LegalDocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = findLegalDoc(slug);
  if (!doc) notFound();

  return (
    <main style={{ background: "#fff" }}>
      <div
        style={{
          maxWidth: 1060,
          margin: "0 auto",
          padding: "56px 24px 88px",
          display: "grid",
          gridTemplateColumns: "220px minmax(0, 1fr)",
          gap: 48,
        }}
        className="legal-grid"
      >
        <aside>
          <span className="eyebrow">Legal</span>
          <nav style={{ display: "grid", gap: 6, marginTop: 18 }} aria-label="Legal documents">
            {legalDocs.map((d) => (
              <Link
                key={d.slug}
                href={`/legal/${d.slug}`}
                aria-current={d.slug === doc.slug ? "page" : undefined}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  fontWeight: d.slug === doc.slug ? 600 : 400,
                  background: d.slug === doc.slug ? "#f2eafe" : "transparent",
                  color: d.slug === doc.slug ? "#6942c2" : "#171420",
                  textDecoration: "none",
                }}
              >
                {d.title}
              </Link>
            ))}
          </nav>
        </aside>

        <article style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 40, lineHeight: 1.1, margin: "6px 0 14px" }}>{doc.title}</h1>
          <p style={{ fontSize: 17, opacity: 0.8, maxWidth: 640, margin: "0 0 36px" }}>
            {doc.summary}
          </p>
          {doc.sections.map((s) => (
            <section key={s.heading} style={{ marginBottom: 30 }}>
              <h2 style={{ fontSize: 20, margin: "0 0 10px" }}>{s.heading}</h2>
              {s.paras.map((p, i) => (
                <p key={i} style={{ fontSize: 16, lineHeight: 1.65, maxWidth: 680, margin: "0 0 12px" }}>
                  {p}
                </p>
              ))}
            </section>
          ))}
          <p style={{ fontSize: 14, opacity: 0.65, marginTop: 44 }}>
            Questions about this document? Reach us through the{" "}
            <Link href="/contact" style={{ textDecoration: "underline" }}>
              contact page
            </Link>
            .
          </p>
        </article>
      </div>
      <style>{`@media (max-width: 760px) { .legal-grid { grid-template-columns: 1fr !important; gap: 28px !important; } }`}</style>
    </main>
  );
}
