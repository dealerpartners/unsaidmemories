'use client'

// Seller U — client search island for the seller help library index.
// The article catalog arrives as server-rendered props from the compiled
// document library (src/lib/library/reading); this component only filters
// and links. It never fetches document content.

import { useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import { SellerEmptyState } from "@/components/portal/seller/SellerShared"

export interface SellerDocIndexItem {
  slug: string
  title: string
  sectionTitle: string
  excerpt: string
}

export interface SellerDocIndexGroup {
  sectionTitle: string
  articles: SellerDocIndexItem[]
}

export function SellerDocsSearch({ groups }: { groups: SellerDocIndexGroup[] }) {
  const [query, setQuery] = useState("")

  const q = query.trim().toLowerCase()
  const visible = groups
    .map((g) => ({
      ...g,
      articles: g.articles.filter(
        (a) =>
          q === "" ||
          `${a.title} ${a.sectionTitle} ${a.excerpt}`.toLowerCase().includes(q),
      ),
    }))
    .filter((g) => g.articles.length > 0)

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help articles…"
          className="w-full rounded-lg border bg-card py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
        />
      </div>

      {visible.length === 0 ? (
        <SellerEmptyState
          icon={Search}
          title="No articles match your search"
          description="Try a different term — or clear the search to browse the whole library."
        />
      ) : (
        visible.map((g) => (
          <section key={g.sectionTitle} className="space-y-3">
            <h3 className="font-semibold">{g.sectionTitle}</h3>
            <div className="divide-y rounded-xl border bg-card">
              {g.articles.map((a) => (
                <article key={a.slug} className="px-5 py-4">
                  <Link
                    href={`/seller/docs/${a.slug}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {a.title}
                  </Link>
                  {a.excerpt && (
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                      {a.excerpt}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))
      )}
    </>
  )
}
