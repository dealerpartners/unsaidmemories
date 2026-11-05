"use client";

import { useState } from "react";
import { useMarketplaceStore, type QuickAddProduct } from "@/lib/marketplace-store";

/**
 * Card data — derived server-side from a SupplierProduct + its batched min
 * price. `price` is the retail price (supplier cost × 1.4 markup).
 */
export type MarketplaceCardData = {
  id: string;
  name: string;
  brandName: string;
  image: string;
  images: string[];
  price: number;
  supplierCost: number | null;
  color: string;
  colors: string[];
  sizes: string[];
  variantCount: number;
  desc: string;
};

function formatPrice(n: number | null): string {
  if (n == null || !isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

/**
 * Product card — uses the mockup's EXACT class names (.card, .media, .badge,
 * .save, .quick, .dots, .details, .product-category, .name-price,
 * .product-name, .price, .rating). See marketplace.css for the styles.
 *
 * Clicking QUICK ADD (or the product name) opens the quick-add modal with the
 * real product data.
 */
export function MarketplaceCard({ product }: { product: MarketplaceCardData }) {
  const [imgIndex, setImgIndex] = useState(0);
  const saved = useMarketplaceStore((s) => s.saved);
  const toggleSaved = useMarketplaceStore((s) => s.toggleSaved);
  const openQuick = useMarketplaceStore((s) => s.openQuick);

  const isSaved = saved.has(product.id);
  const images = product.images.length > 0 ? product.images : [product.image];
  const currentImg = images[imgIndex] ?? product.image;
  const hasGallery = images.length > 1;

  function step(delta: number) {
    setImgIndex((i) => (((i + delta) % images.length) + images.length) % images.length);
  }

  // Gallery moves by finger swipe (and the dots under the photo) —
  // no arrows on the card, per the shop-card law.
  let touchX: number | null = null;
  function onTouchStart(e: React.TouchEvent) {
    touchX = e.touches[0]?.clientX ?? null;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchX == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX;
    touchX = null;
    if (Math.abs(dx) >= 40) step(dx < 0 ? 1 : -1);
  }

  function handleImgError(e: React.SyntheticEvent<HTMLImageElement>) {
    const fallback =
      "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=900&q=85";
    if (e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
  }

  function openModal() {
    const payload: QuickAddProduct = {
      id: product.id,
      name: product.name,
      brandName: product.brandName,
      category: product.brandName || "UNSAID EDIT",
      image: currentImg,
      images,
      price: product.price,
      supplierCost: product.supplierCost,
      color: product.color || "Multiple options",
      colors: product.colors.length ? product.colors : ["#e5dfd5"],
      sizes: product.sizes,
      variantCount: product.variantCount,
      desc: product.desc,
    };
    openQuick(payload);
  }

  return (
    <article className="card">
      <div className="media" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <span className="badge">UNSAID EDIT</span>
        <button
          className={`save ${isSaved ? "saved" : ""}`}
          aria-label={isSaved ? "Remove from saved" : "Save product"}
          onClick={(e) => {
            e.stopPropagation();
            toggleSaved(product.id);
          }}
        >
          {isSaved ? "♥" : "♡"}
        </button>
        <img
          src={currentImg}
          alt={product.name}
          loading="lazy"
          onError={handleImgError}
        />
        <button className="quick" onClick={openModal}>
          ＋ &nbsp; QUICK ADD
        </button>
      </div>
      {hasGallery && (
        <div className="dots">
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`View photo ${i + 1} of ${product.name}`}
              aria-current={i === imgIndex}
              onClick={() => setImgIndex(i)}
            >
              <span className={i === imgIndex ? "on" : ""} />
            </button>
          ))}
        </div>
      )}
      <div className="details">
        <div className="product-category">
          {product.brandName?.toUpperCase() || "UNSAID EDIT"}
        </div>
        <div className="name-price">
          <h3 className="product-name" onClick={openModal}>
            {product.name}
          </h3>
          <span className="price">{formatPrice(product.price)}</span>
        </div>
        <div className="rating">
          ★★★★★ <span>· Product preview</span>
        </div>
      </div>
    </article>
  );
}
