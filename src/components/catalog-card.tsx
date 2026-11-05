"use client";

import { useRef, useState } from "react";
import { Heart, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { productSlug } from "@/lib/product-slug";
import { ImagePlaceholder } from "@/components/safe-image";

export type CatalogProduct = {
  id: string;
  name: string;
  brand: string | null;
  image: string | null;
  images: string[] | null;
  variantCount: number;
  minPrice: number | null;
  sizes: string[];
  colors: string[];
  /** Taxonomy facets (Product type / Occasion / Relationship / Collection). */
  facets?: { group: string; label: string }[];
};

// CatalogCard — renders a real supplier-catalog product (from Supabase) in the
// shop grid. Reuses the existing `.product-card` CSS classes for visual
// consistency. Links to /product/[id] (the premium product detail page).
// The card's photos are swappable in place — finger swipe or the dots —
// which is what motivates the Quick add; variants live on the PDP buy box.
export function CatalogCard({ p, index }: { p: CatalogProduct; index: number }) {
  const saved = useStore((s) => s.saved.includes(p.id));
  const toggleSaved = useStore((s) => s.toggleSaved);
  const openQuickAdd = useStore((s) => s.openQuickAdd);

  const price = p.minPrice != null ? `$${p.minPrice.toFixed(2)}` : "—";

  const gallery = Array.from(
    new Set([p.image, ...(p.images ?? [])].filter((u): u is string => !!u)),
  ).slice(0, 8);
  // Broken-image logic: a photo that fails to load leaves the gallery —
  // the card moves to the next surviving photo, and if none survive the
  // shopper sees the branded placeholder, never a broken glyph.
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const visibleGallery = gallery.filter((u) => !failed.has(u));
  const [imgIndex, setImgIndex] = useState(0);
  const touchX = useRef<number | null>(null);
  const swiped = useRef(false);
  const safeIndex = Math.min(imgIndex, Math.max(0, visibleGallery.length - 1));
  const currentImg = visibleGallery[safeIndex] ?? null;

  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null || visibleGallery.length < 2) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 40) return;
    swiped.current = true;
    setImgIndex((i) => {
      const next = dx < 0 ? i + 1 : i - 1;
      return ((next % visibleGallery.length) + visibleGallery.length) % visibleGallery.length;
    });
  };
  const onLinkClick = (e: React.MouseEvent) => {
    if (swiped.current) {
      e.preventDefault();
      swiped.current = false;
    }
  };

  return (
    <article className="product-card" style={{ animationDelay: `${index * 70}ms` }}>
      <div className="product-image-wrap" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <Link href={`/product/${productSlug(p.name, p.id)}`} className="product-image-link" aria-label={`View ${p.name}`} onClick={onLinkClick}>
          {currentImg ? (
            <Image
              unoptimized
              src={currentImg}
              alt={p.name}
              fill
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
              loading="lazy"
              onError={() => {
                const dead = currentImg;
                setFailed((prev) => new Set(prev).add(dead));
              }}
            />
          ) : (
            <ImagePlaceholder label={p.name} />
          )}
        </Link>
        <button
          className={`save-btn ${saved ? "saved" : ""}`}
          onClick={() => toggleSaved(p.id)}
          aria-label={saved ? "Remove from saved" : "Save item"}
        >
          <Heart size={17} fill={saved ? "currentColor" : "none"} />
        </button>

      </div>
        {visibleGallery.length > 1 && (
          <div className="card-dots">
            {visibleGallery.map((u, i) => (
              <button
                key={`${u}-${i}`}
                type="button"
                className={i === safeIndex ? "on" : ""}
                aria-label={`View photo ${i + 1} of ${p.name}`}
                aria-current={i === safeIndex}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setImgIndex(i);
                }}
              />
            ))}
          </div>
        )}
        <button className="quick-add-btn" onClick={() => openQuickAdd({
          ...p,
          // Map CatalogProduct → Product shape the modal expects.
          // The modal reads .price, .category, .color, .description.
          price: p.minPrice ?? 0,
          category: p.brand ?? "UnSaid",
          color: p.colors[0] ?? "Multiple options",
          description: p.variantCount > 0 ? `${p.variantCount} variants available` : "Made to order",
          image: currentImg ?? "",
          badge: undefined,
        } as any)}>
          Quick add <Plus size={15} />
        </button>
      <div className="product-details">
        <div>
          <span className="product-category">{p.brand || "UnSaid"}</span>
          <h3>{p.name}</h3>
        </div>
        <span className="product-price">{price}</span>
      </div>
    </article>
  );
}
