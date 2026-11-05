"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { HelpArticle } from "@/lib/help/articles";

/**
 * Help Center search — filters the article cards as you type.
 * Plain words only; if nothing matches, the empty state says what to try.
 */
export default function HelpSearch({ articles }: { articles: HelpArticle[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();

  const shown = useMemo(() => {
    if (!needle) return articles;
    return articles.filter((a) =>
      [a.title, a.summary, a.keywords, ...a.what, ...a.doHere]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [articles, needle]);

  return (
    <>
      <div className="help-search">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the Help Center — try “refund”, “tabs”, or “key”…"
          aria-label="Search help articles"
          data-tip="Type what you're trying to do, in your own words. The list below narrows itself as you type."
        />
      </div>

      {shown.length === 0 ? (
        <div className="help-empty">
          Nothing in the Help Center matches “{q}” yet. Try a shorter word — the name of
          the thing itself, like “order”, “invoice”, or “key”. If you're stuck on a
          screen, remember every button explains itself: rest your mouse on it and a
          note pops up saying what it does.
        </div>
      ) : (
        <div className="help-grid">
          {shown.map((a) => (
            <Link key={a.slug} href={`/admin/help/${a.slug}`} className="help-card">
              <h2>{a.title}</h2>
              <p>{a.summary}</p>
              <span className="help-go">Read →</span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
