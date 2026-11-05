"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import taxonomyData from "@/lib/marketplace-data.json";
import { useMarketplaceStore } from "@/lib/marketplace-store";
import { useStore } from "@/lib/store";

type TaxNode = {
  name: string;
  slug: string;
  count?: number;
  children?: TaxNode[];
};

const taxonomy = (taxonomyData as { taxonomy: TaxNode[] }).taxonomy;

// ── Category icons (copied verbatim from the mockup's categoryIcons map) ──
const categoryIcons: Record<string, string> = {
  Apparel: "<path d='M7 4 4 6 2 11l4 2 2-3v10h8V10l2 3 4-2-2-5-3-2a5 5 0 0 1-10 0Z'/>",
  Accessories:
    "<path d='M6 8h12l2 12H4L6 8Z'/><path d='M9 8V6a3 3 0 0 1 6 0v2'/>",
  Drinkware:
    "<path d='M5 3h12l-1 17H6L5 3Z'/><path d='M17 6h2a2 2 0 0 1 0 4h-2'/>",
  "Home & Living":
    "<path d='m3 11 9-8 9 8'/><path d='M5 10v10h14V10M9 20v-6h6v6'/>",
  "Wall Art":
    "<rect x='3' y='4' width='18' height='16' rx='1'/><circle cx='8' cy='9' r='1.5'/><path d='m4 17 5-5 4 4 3-3 4 4'/>",
  Keepsakes:
    "<path d='M20 12.5 12 21l-8-8.5a5 5 0 0 1 7-7L12 7l1-1.5a5 5 0 0 1 7 7Z'/>",
  "Gift Sets":
    "<path d='M20 12v9H4v-9M2 7h20v5H2zM12 7v14M12 7H7.5a2.5 2.5 0 1 1 2.5-2.5C10 6 12 7 12 7Zm0 0h4.5A2.5 2.5 0 1 0 14 4.5C14 6 12 7 12 7Z'/>",
  "UnSaid Holidays":
    "<path d='M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9 4.9 19.1'/>",
  Relationships:
    "<path d='M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z'/>",
  default: "<circle cx='12' cy='12' r='8'/><path d='M12 8v8M8 12h8'/>",
};

function IconFor({ name }: { name: string }) {
  const path = categoryIcons[name] ?? categoryIcons.default;
  return (
    <span className="nav-ico" aria-hidden="true">
      <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: path }} />
    </span>
  );
}

// ── Build the departments tree + collections list ──
// Mirrors the mockup's buildTaxonomySidebar(): exclude "All products",
// "Brands", "Collections" from departments; build the relationships list from
// collection items matching kin keeper/family by choice/day ones/just because
// + the children of "Relationships".
const excluded = new Set(["All products", "Brands", "Collections"]);
const departments = taxonomy.filter((n) => !excluded.has(n.name));

const collectionsNode = taxonomy.find((n) => n.name === "Collections");
const relationshipsNode = taxonomy.find((n) => n.name === "Relationships");
const collectionItems = (collectionsNode?.children ?? []).filter((n) =>
  /kin keeper|family by choice|day ones|just because/i.test(n.name),
);
const relItems = relationshipsNode?.children ?? [];
const sideCollections = [...collectionItems, ...relItems].filter(
  (n, i, a) => a.findIndex((x) => x.name === n.name) === i,
);

// Edit links (Best sellers, New arrivals, Bundles & gifts, Personalized).
const editLinks = [
  {
    label: "Best sellers",
    href: "/marketplace",
    icon: "<path d='m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z'/>",
  },
  {
    label: "New arrivals",
    href: "/marketplace",
    icon: "<path d='m12 3 1.8 6.2L20 12l-6.2 2.8L12 21l-1.8-6.2L4 12l6.2-2.8Z'/>",
  },
  {
    label: "Bundles & gifts",
    href: "/marketplace",
    icon: "<path d='M20 12v9H4v-9M2 7h20v5H2zM12 7v14M12 7H7.5a2.5 2.5 0 1 1 2.5-2.5C10 6 12 7 12 7Zm0 0h4.5A2.5 2.5 0 1 0 14 4.5C14 6 12 7 12 7Z'/>",
  },
  {
    label: "Personalized",
    href: "/marketplace",
    icon: "<path d='M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z'/>",
  },
];

/**
 * Recursively render a taxonomy tree node. Top-level nodes with children are
 * collapsible (matching the mockup's .tree-toggle + .tree-children.open).
 * Each node links to /marketplace/[...path] using its slug path.
 */
function TreeNode({
  node,
  parentPath,
  depth,
}: {
  node: TaxNode;
  parentPath: string[];
  depth: number;
}) {
  const [open, setOpen] = useState(false);
  const path = [...parentPath, node.slug];
  const href = `/marketplace/${path.join("/")}`;
  const children = node.children ?? [];
  const hasChildren = children.length > 0;

  if (depth === 0) {
    return (
      <div className="tree-node">
        <button
          className={`tree-toggle ${open ? "active" : ""}`}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <IconFor name={node.name} />
          <span>{node.name}</span>
          {hasChildren && <span className="chev">{open ? "−" : "＋"}</span>}
        </button>
        {hasChildren && (
          <div className={`tree-children ${open ? "open" : ""}`}>
            {children.map((c, i) => (
              <TreeNode
                key={c.slug + i}
                node={c}
                parentPath={path}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Nested node — render as a link button inside .tree-children.
  if (hasChildren) {
    return (
      <>
        <button
          className={`tree-toggle ${open ? "active" : ""}`}
          style={{ paddingLeft: 0 }}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <IconFor name={node.name} />
          <span>{node.name}</span>
          <span className="chev">{open ? "−" : "＋"}</span>
        </button>
        <div className={`tree-children ${open ? "open" : ""}`}>
          {children.map((c, i) => (
            <TreeNode
              key={c.slug + i}
              node={c}
              parentPath={path}
              depth={depth + 1}
            />
          ))}
        </div>
      </>
    );
  }

  return (
    <Link href={href} className="tree-leaf">
      <span>{node.name}</span>
    </Link>
  );
}

/**
 * Marketplace sidebar — fixed 250px, copied verbatim from the mockup HTML.
 * Renders the wordmark, primary nav, collapsible taxonomy tree, edit links,
 * relationships & collections, and the help card.
 */
export function MarketplaceSidebar() {
  const pathname = usePathname();
  const isHome = pathname === "/marketplace" || pathname === "/marketplace/";
  const sidebarOpen = useMarketplaceStore((s) => s.sidebarOpen);
  const setSidebarOpen = useMarketplaceStore((s) => s.setSidebarOpen);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  return (
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} id="sidebar">
      <Link href="/marketplace" className="wordmark">
        UnSaid Memories
      </Link>
      <div className="brand-note">THE THINGS WE FEEL. THE THINGS WE KEEP.</div>

      <nav className="nav primary-nav" aria-label="Marketplace navigation">
        <Link
          href="/marketplace"
          className={isHome ? "active" : ""}
          style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 10px" }}
        >
          <span className="nav-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <rect x="4" y="4" width="6" height="6" rx="1" />
              <rect x="14" y="4" width="6" height="6" rx="1" />
              <rect x="4" y="14" width="6" height="6" rx="1" />
              <rect x="14" y="14" width="6" height="6" rx="1" />
            </svg>
          </span>
          <span>Marketplace home</span>
          <span className="nav-count">↗</span>
        </Link>
      </nav>

      <div className="workspace-label">SHOP DEPARTMENTS</div>
      <nav className="nav taxonomy-nav" id="sideDepartments" aria-label="Shop departments">
        {departments.map((node, i) => (
          <TreeNode
            key={node.slug + i}
            node={node}
            parentPath={[]}
            depth={0}
          />
        ))}
      </nav>

      <div className="workspace-label">SHOP BY EDIT</div>
      <nav className="nav">
        {editLinks.map((edit) => (
          <Link
            key={edit.label}
            href={edit.href}
            style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 10px" }}
          >
            <span className="nav-ico" aria-hidden="true">
              <svg viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: edit.icon }} />
            </span>
            <span>{edit.label}</span>
          </Link>
        ))}
      </nav>

      <div className="workspace-label">RELATIONSHIPS &amp; COLLECTIONS</div>
      <nav className="nav" id="sideCollections" aria-label="Relationships and collections">
        {sideCollections.map((node) => (
          <Link
            key={node.slug}
            href={`/marketplace/relationships/${node.slug}`}
            style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 10px" }}
          >
            <IconFor name="Relationships" />
            <span>{node.name}</span>
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="help-card">
          <div className="tiny">CONCIERGE</div>
          <p>Need help finding something meaningful?</p>
          <button type="button" className="shoppy-textbtn" onClick={() => useStore.getState().setAssistantOpen(true)}>Ask Shoppy ↗</button>
        </div>
      </div>
    </aside>
  );
}
