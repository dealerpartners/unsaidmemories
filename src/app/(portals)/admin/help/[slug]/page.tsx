import Link from "next/link";
import { notFound } from "next/navigation";
import { HELP_ARTICLES, getArticle } from "@/lib/help/articles";
import "../help.css";

export const dynamic = "force-dynamic";

/**
 * One Help Center article. Renders from src/lib/help/articles.ts — the same
 * data the index searches. Structure per article: what this is → the things
 * you'll actually do → step-by-step tasks → if something looks wrong.
 */
export default async function HelpArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const idx = HELP_ARTICLES.findIndex((a) => a.slug === slug);
  const prev = idx > 0 ? HELP_ARTICLES[idx - 1] : null;
  const next = idx < HELP_ARTICLES.length - 1 ? HELP_ARTICLES[idx + 1] : null;

  return (
    <div className="help-page help-article">
      <Link href="/admin/help" className="help-back">← All help topics</Link>
      <h1>{article.title}</h1>
      <p className="help-summary">{article.summary}</p>

      <h2>What this is</h2>
      {article.what.map((p, i) => (
        <p key={i}>{p}</p>
      ))}

      <h2>The things you'll actually do here</h2>
      <ul>
        {article.doHere.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>

      <h2>Step by step</h2>
      {article.tasks.map((task) => (
        <div className="help-task" key={task.title}>
          <h3>{task.title}</h3>
          <ol>
            {task.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>
      ))}

      <h2>If something looks wrong</h2>
      <div className="help-wrong">
        <ul style={{ marginBottom: 4 }}>
          {article.ifWrong.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="help-navrow">
        <span>{prev && <Link href={`/admin/help/${prev.slug}`}>← {prev.title}</Link>}</span>
        <Link href="/admin/help">All help topics</Link>
        <span>{next && <Link href={`/admin/help/${next.slug}`}>{next.title} →</Link>}</span>
      </div>
    </div>
  );
}
