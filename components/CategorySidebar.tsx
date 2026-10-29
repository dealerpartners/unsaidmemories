'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { DbCategory } from '@/lib/catalog-db';

type Props = {
  categories: DbCategory[];
  brands: string[];
  activeSlug?: string;
};

function TreeNode({ cat, children, activeSlug, depth }: { cat: DbCategory; children: DbCategory[]; activeSlug?: string; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const hasKids = children.length > 0;
  const isActive = cat.slug === activeSlug;
  return (
    <div style={{ marginLeft: depth > 0 ? 12 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0' }}>
        {hasKids ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--muted)', width: 20 }}
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            {open ? '▼' : '▶'}
          </button>
        ) : (
          <span style={{ width: 20 }} />
        )}
        <Link
          href={`/shop/${cat.slug}`}
          style={{
            fontWeight: isActive ? 700 : depth === 0 ? 600 : 400,
            color: isActive ? 'var(--purple)' : 'var(--ink)',
            textDecoration: 'none',
            fontSize: depth === 0 ? 15 : 14,
          }}
        >
          {cat.name}
        </Link>
      </div>
      {open && hasKids && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.slug}
              cat={child}
              children={[]}
              activeSlug={activeSlug}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CategorySidebar({ categories, brands, activeSlug }: Props) {
  const byParent = new Map<string | undefined, DbCategory[]>();
  for (const c of categories) {
    const key = c.parent ?? undefined;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(c);
  }
  const l1 = (byParent.get(undefined) ?? []).filter((c) => c.level === 1);

  const buildTree = (cats: DbCategory[], depth: number): React.ReactNode => {
    return cats.map((cat) => {
      const kids = (byParent.get(cat.slug) ?? []).filter((k) => k.level === cat.level + 1);
      return (
        <div key={cat.slug} style={{ marginLeft: depth > 0 ? 12 : 0 }}>
          <TreeNode cat={cat} children={kids} activeSlug={activeSlug} depth={depth} />
          {kids.length > 0 && <div>{buildTree(kids, depth + 1)}</div>}
        </div>
      );
    });
  };

  return (
    <aside style={{ minWidth: 240, paddingRight: 24 }}>
      <h3 style={{ fontSize: 16, margin: '0 0 12px' }}>Categories</h3>
      <nav aria-label="Category tree">{buildTree(l1, 0)}</nav>
      {brands.length > 0 && (
        <>
          <h3 style={{ fontSize: 16, margin: '24px 0 12px' }}>Brands</h3>
          <nav aria-label="Brands">
            {brands.map((b) => (
              <div key={b} style={{ padding: '4px 0' }}>
                <Link href={`/shop?brand=${encodeURIComponent(b)}`} style={{ color: 'var(--ink)', textDecoration: 'none', fontSize: 14 }}>
                  {b}
                </Link>
              </div>
            ))}
          </nav>
        </>
      )}
    </aside>
  );
}
