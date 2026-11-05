"use client";

import { Heart, Plus } from "lucide-react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import type { Product } from "@/lib/catalog";
import { productSlug } from "@/lib/product-slug";
import { SafeImage } from "@/components/safe-image";

export function ProductCard({ p, index }: { p: Product; index: number }) {
  const saved = useStore((s) => s.saved.includes(p.id));
  const openQuickAdd = useStore((s) => s.openQuickAdd);
  const toggleSaved = useStore((s) => s.toggleSaved);

  return (
    <article className="product-card" style={{ animationDelay: `${index * 70}ms` }}>
      <div className="product-image-wrap">
        <Link href={`/product/${productSlug(p.name, String(p.id))}`} className="product-image-link" aria-label={`View ${p.name}`}>
          <SafeImage src={p.image} alt={p.name} fill sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw" loading="lazy" />
        </Link>
        {p.badge && <span className="product-badge">{p.badge}</span>}
        <button
          className={`save-btn ${saved ? "saved" : ""}`}
          onClick={() => toggleSaved(p.id)}
          aria-label={saved ? "Remove from saved" : "Save item"}
        >
          <Heart size={17} fill={saved ? "currentColor" : "none"} />
        </button>
      </div>
      <button className="quick-add-btn" onClick={() => openQuickAdd(p)}>
        Quick add <Plus size={15} />
      </button>

      <div className="product-details">
        <div>
          <span className="product-category">{p.category}</span>
          <h3>{p.name}</h3>
        </div>
        <span className="product-price">${p.price.toFixed(2)}</span>
      </div>
    </article>
  );
}
