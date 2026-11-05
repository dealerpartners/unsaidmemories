"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { taxonomy, findNodePathByName, type TaxonomyNode } from "@/lib/taxonomy";
import { helpArticles, ourWorldArticles, relationships } from "@/lib/catalog";
import "./sitemap-directory.css";

// Only relationships that exist in the taxonomy get a sitemap link.
const relationshipChain = findNodePathByName("Relationships");
const relationshipSlugs = new Set(
  (relationshipChain?.[relationshipChain.length - 1]?.children ?? []).map((c) => c.slug),
);

type SimpleLink = { label: string; href: string };
type CardGroup = {
  title: string;
  subtitle: string;
  links: SimpleLink[];
};

// Site pages grouped into themed directory cards (real routes only).
function buildSitePageGroups(collections: { name: string; slug: string }[]): CardGroup[] {
  const relationshipLinks: SimpleLink[] = [
    { label: "Relationships", href: "/relationships" },
    ...relationships
      .filter((r) => relationshipSlugs.has(r.slug))
      .map((r) => ({ label: r.name, href: `/relationships/${r.slug}` })),
  ];

  const ourWorldLinks: SimpleLink[] = [
    { label: "Our world", href: "/our-world" },
    ...ourWorldArticles.map((a) => ({ label: a.eyebrow, href: `/our-world/${a.slug}` })),
  ];

  const helpLinks: SimpleLink[] = [
    { label: "Contact us", href: "/contact" },
    { label: "Help & care", href: "/help" },
    ...helpArticles.map((a) => ({ label: `Help — ${a.title}`, href: `/help/${a.slug}` })),
    { label: "Shipping & returns", href: "/shipping-returns" },
    { label: "Size guide", href: "/size-guide" },
    { label: "Track your order", href: "/track-order" },
  ];

  const collectionLinks: SimpleLink[] = [
    { label: "All collections", href: "/collections" },
    ...collections.map((c) => ({ label: c.name, href: `/collections/${c.slug}` })),
  ];

  return [
    {
      title: "Main navigation",
      subtitle: `Store · ${8} links`,
      links: [
        { label: "Home", href: "/" },
        { label: "Shop all products", href: "/shop" },
        { label: "Departments", href: "/departments" },
        { label: "UnSaid signature", href: "/signature" },
        { label: "Gift cards", href: "/gift-cards" },
        { label: "Marketplace", href: "/marketplace" },
        { label: "Your bag", href: "/cart" },
        { label: "Your account", href: "/account" },
      ],
    },
    {
      title: "Discovery",
      subtitle: "Brand and shopping · 6 links",
      links: [
        { label: "How it works", href: "/how-it-works" },
        { label: "Gift finder", href: "/gift-finder" },
        { label: "Guides & stories", href: "/guides-stories" },
        { label: "KinnectAI", href: "/kinnectai" },
        { label: "Our story", href: "/our-story" },
        { label: "Corporate gifting", href: "/corporate-gifting" },
      ],
    },
    {
      title: "Inspirations",
      subtitle: "Gifting by occasion · 4 links",
      links: [
        { label: "Funeral homes", href: "/funeral-homes" },
        { label: "Senior living", href: "/senior-living" },
        { label: "Schools & hospitals", href: "/schools-hospitals" },
        { label: "Wedding planners", href: "/wedding-planners" },
      ],
    },
    {
      title: "Relationships",
      subtitle: `Shop by relationship · ${relationshipLinks.length} links`,
      links: relationshipLinks,
    },
    {
      title: "Our world",
      subtitle: `Stories and guides · ${ourWorldLinks.length} links`,
      links: ourWorldLinks,
    },
    {
      title: "Collections",
      subtitle: `Featured collections · ${collectionLinks.length} links`,
      links: collectionLinks,
    },
    {
      title: "Help & care",
      subtitle: `Customer information · ${helpLinks.length} links`,
      links: helpLinks,
    },
  ];
}

function countNodes(node: TaxonomyNode): number {
  let n = 1;
  for (const c of node.children) n += countNodes(c);
  return n;
}

// Recursive category tree inside a department card.
function CategoryTree({ node, pathPrefix, depth }: { node: TaxonomyNode; pathPrefix: string; depth: number }) {
  return (
    <ul className={depth === 0 ? "sd-category-list" : "sd-category-children"}>
      {node.children.map((child) => {
        const childPath = pathPrefix ? `${pathPrefix}/${child.slug}` : child.slug;
        const hasChildren = child.children.length > 0;
        if (!hasChildren) {
          return (
            <li className="sd-category" key={child.slug + child.name}>
              <Link className="sd-category-link" href={`/shop/${childPath}`}>
                <span>{child.name}</span>
                {child.count > 0 && <span className="sd-product-count">({child.count})</span>}
              </Link>
            </li>
          );
        }
        return (
          <li className="sd-category" key={child.slug + child.name}>
            <details className="sd-category-details">
              <summary style={{ listStyle: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 0 }}>
                <span className="sd-chevron" />
                <Link className="sd-category-link" href={`/shop/${childPath}`}>
                  <span>{child.name}</span>
                  {child.count > 0 && <span className="sd-product-count">({child.count})</span>}
                </Link>
              </summary>
              <CategoryTree node={child} pathPrefix={childPath} depth={depth + 1} />
            </details>
          </li>
        );
      })}
    </ul>
  );
}

// A single directory card (expandable details with links).
function DirectoryCard({
  index,
  group,
  searchMatch,
}: {
  index: number;
  group: CardGroup;
  searchMatch: boolean;
}) {
  const idx = String(index + 1).padStart(2, "0");
  return (
    <article className={`sd-card${searchMatch ? "" : " sd-hidden"}`}>
      <details className="sd-details">
        <summary className="sd-card-summary">
          <span className="sd-card-index">
            <span className="sd-index-rule" />
          </span>
          <span className="sd-card-heading">
            <span className="sd-card-title">{group.title}</span>
            <span className="sd-card-subtitle">{group.subtitle}</span>
          </span>
          <span className="sd-card-action" aria-hidden="true" />
        </summary>
        <div className="sd-card-content">
          <ul className="sd-simple-links">
            {group.links.map((l) => (
              <li key={l.href + l.label}>
                <Link href={l.href}>
                  <span>{l.label}</span>
                  <span className="sd-link-arrow" aria-hidden="true">↗</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </article>
  );
}

export function SitemapExplorer({
  collections = [],
}: {
  collections?: { name: string; slug: string }[];
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = useMemo(() => buildSitePageGroups(collections), [collections]);

  // Refs to all card detail elements — used to auto-expand on search.
  const cardRefs = useRef<(HTMLDetailsElement | null)[]>([]);

  const filteredGroups = useMemo(() => {
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        links: g.links.filter(
          (l) => l.label.toLowerCase().includes(q) || l.href.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.links.length > 0 || g.title.toLowerCase().includes(q));
  }, [q, groups]);

  const filteredDepts = useMemo(() => {
    if (!q) return taxonomy;
    const matchDept = (node: TaxonomyNode): boolean => {
      if (node.name.toLowerCase().includes(q)) return true;
      return node.children.some(matchDept);
    };
    return taxonomy.filter(matchDept);
  }, [q]);

  const totalLinks = useMemo(
    () => groups.reduce((s, g) => s + g.links.length, 0) + taxonomy.reduce((s, d) => s + countNodes(d), 0),
    [groups],
  );

  // Auto-expand all cards when searching; collapse when cleared.
  useEffect(() => {
    cardRefs.current.forEach((el) => {
      if (el) el.open = !!q;
    });
  }, [q]);

  return (
    <div className="sd-page">
      <main className="sd-main">
        {/* INTRO */}
        <section className="sd-intro">
          <div>
            <p className="sd-kicker">UnSaid Memories</p>
            <h1>Site directory</h1>
          </div>
          <span className="sd-meta">{totalLinks} pages across {groups.length} groups + {taxonomy.length} departments</span>
        </section>

        {/* SEARCH */}
        <div className="sd-tools">
          <div className="sd-search-wrap">
            <Search className="sd-search-icon" size={16} />
            <input
              className="sd-search"
              type="text"
              placeholder="Search the site directory…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search the site directory"
            />
          </div>
          <span className="sd-result-count">
            {q ? `${filteredGroups.length} + ${filteredDepts.length} sections` : "All pages"}
          </span>
        </div>

        {/* SITE PAGES GROUP */}
        <section className="sd-group-block" aria-labelledby="site-pages-heading">
          <div className="sd-group-heading">
            <h2 id="site-pages-heading">Site pages</h2>
            <span className="sd-rule" />
          </div>
          <div className="sd-grid">
            {filteredGroups.map((g, i) => (
              <DirectoryCard key={g.title} index={i} group={g} searchMatch />
            ))}
          </div>
        </section>

        {/* DEPARTMENTS GROUP */}
        <section className="sd-group-block sd-department-block" aria-labelledby="departments-heading">
          <div className="sd-group-heading">
            <h2 id="departments-heading">Departments</h2>
            <span className="sd-rule" />
          </div>
          <div className="sd-grid">
            {filteredDepts.map((dept, i) => {
              const idx = String(i + 1).padStart(2, "0");
              const childCount = countNodes(dept);
              return (
                <article className="sd-card" key={dept.slug + dept.name}>
                  <details className="sd-details">
                    <summary className="sd-card-summary">
                      <span className="sd-card-index">
                        <span className="sd-index-rule" />
                      </span>
                      <span className="sd-card-heading">
                        <Link href={`/shop/${dept.slug}`}><span className="sd-card-title">{dept.name}</span></Link>
                        <span className="sd-card-subtitle">Shop department · {childCount} categories</span>
                      </span>
                      <span className="sd-card-action" aria-hidden="true" />
                    </summary>
                    <div className="sd-card-content">
                      <CategoryTree node={dept} pathPrefix={dept.slug} depth={0} />
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        </section>

        {filteredGroups.length === 0 && filteredDepts.length === 0 && (
          <div className="sd-empty sd-show">No matching pages for &ldquo;{query}&rdquo;.</div>
        )}

        {/* FOOTER — links to the XML sitemap */}
        <footer className="sd-footer">
          <span>© 2026 <strong>UnSaid</strong> · Site directory</span>
          <span>
            <Link href="/sitemap.xml">Site directory XML map ↗</Link>
          </span>
        </footer>
      </main>
    </div>
  );
}
