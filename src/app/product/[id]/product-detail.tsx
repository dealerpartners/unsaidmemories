"use client";

/**
 * ProductDetail — the /product/[id] page body, rendered as an EXACT port of
 * unsaidmemories `ProductRouteView.tsx` (the owner-approved standalone product
 * page spec). Same DOM, same class names, same section order, same copy
 * cadence, same breakpoints:
 *
 *   crumbs → .pdp grid (.gallery | .pdpinfo)
 *     LEFT  .gallery — .mainimage (1:1) + .thumbs + .galleryhint +
 *            .review-panel (REAL published reviews + signed-in form)
 *     RIGHT .pdpinfo — eyebrow · h1 (bold Inter clamp(32px,3.5vw,45px)) ·
 *            price · REAL description only · .social · .seller · REAL
 *            options · qty + Add to bag (real cart store) · Checkout as
 *            guest → · .trust · .delivery · 4 accordions
 *   then: UnSaid Picks (3) · "Picks for your people." band ·
 *         #community Questions & conversation (＋ circle → composer) ·
 *         #related "You may also like" (4 REAL related products).
 *
 * Server-rendered from the server page's normalized record (SEO: h1,
 * description, breadcrumbs, JSON-LD all in the first HTML paint) — this is
 * a client component only because the buy box, thumbs, composer and review
 * form are interactive.
 *
 * UnSaid palette swap (the ONLY change from the reference): unsaid teal
 * #087b72 → UnSaid lavender #7860a8 (hover dark #075f59 → #5d4a8f, pale
 * #edf7f5 → #f1ecf8, band #f3f8f6 → #f6f2fa). Ink #17191c, muted #667078,
 * line #e5e8ea, Inter — all identical to the reference page.
 */

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SafeImage } from "@/components/safe-image";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { addToCart, fetchCart, fetchCurrentCustomerId } from "@/lib/commerce/cart-client";
import dynamic from "next/dynamic";

const PdpCustomizer = dynamic(() => import("./customizer"), {
  ssr: false,
  loading: () => (
    <div className="cz-loading" aria-hidden="true">
      Loading the design studio…
    </div>
  ),
});
import { displayTitle, money } from "@/lib/pdp-display";
import { trackAddToCart, trackViewItem } from "@/lib/analytics-events";

// ── Types — the server page's normalized record ──────────────────────

export interface PdpOption {
  label: string;
  inStock: boolean;
}

export interface PdpRelated {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  image: string | null;
  price: number | null;
  kind: string;
}

export interface PdpReview {
  id: string;
  author: string;
  rating: number;
  title: string | null;
  body: string | null;
  createdAt: string | null;
  verified: boolean;
}

export interface PdpVariant {
  id: string;
  size: string | null;
  color: string | null;
  price: number | null;
}

/**
 * One supplier's version of this product: its photos, its variants,
 * its options, its price. The page product is set 0; the same
 * product carried by another supplier is another set. Switching
 * sets swaps the gallery AND the buy box — never the page, never
 * the reviews. Suppliers are never named on the storefront; a set
 * is identified by its cover photo only.
 */
export interface PdpSet {
  productId: string;
  images: { url: string; alt: string | null }[];
  variants: PdpVariant[];
  options: PdpOption[];
  optionKind: "size" | "color";
  price: number | null;
}

/** One published design a shopper can put on this product. */
export interface PdpCustomizerArtwork {
  id: string;
  name: string;
  /** Front-surface canvas nodes (studio v2 state) for the live preview. */
  frontNodes: unknown[];
  garmentColor: string | null;
  /** True when this artwork is the design this product was published from. */
  isOwn: boolean;
}

/** Present only on products that support shopper customization. */
export interface PdpCustomizerData {
  baseProductId: string;
  /** Print-zone (trim) rect in 420×500 stage coordinates. */
  trim: { x: number; y: number; width: number; height: number };
  /** Print grid the saved print file is rendered on. */
  spec: { widthPx: number; heightPx: number; dpi: number };
  kind: string;
  artworks: PdpCustomizerArtwork[];
}

/** One answer threaded under a product question. */
export interface PdpAnswer {
  id: string;
  author: string;
  /** "customer" | "staff" — staff answers are labeled as the shop. */
  role: string;
  body: string;
  createdAt: string | null;
}

/** One published product question with its answers. */
export interface PdpQuestion {
  id: string;
  author: string;
  body: string;
  createdAt: string | null;
  answers: PdpAnswer[];
}

export interface PdpRecord {
  slug: string;
  id: string;
  rawName: string;
  brand: string | null;
  categoryLabel: string | null;
  badge: string | null;
  price: number | null;
  compareAtPrice: number | null;
  description: string | null;
  specifications: string | null;
  care: string | null;
  media: { url: string; alt: string | null }[];
  breadcrumb: { name: string; path: string }[];
  ratingAvg: number | null;
  ratingCount: number;
  /** The product's published reviews (visible-only, newest first). */
  reviews: PdpReview[];
  /** The product's published questions with their answers. */
  questions: PdpQuestion[];
  inStock: boolean;
  options: PdpOption[];
  /** "size" | "color" — which real variant dimension the options show. */
  optionKind: "size" | "color";
  sellerName: string;
  sellerHref: string;
  related: PdpRelated[];
  /** UnSaid Picks — real products from other departments, deduped. */
  picks: PdpRelated[];
  /** Real variant rows (ids + dimensions + prices) for cart adds. */
  variants: PdpVariant[];
  /** Supplier sets of this product (set 0 = this page's product). */
  sets?: PdpSet[];
  /** Shopper customization data, or null when unsupported. */
  customizer: PdpCustomizerData | null;
}

type SessionUser = { name: string | null; email: string | null } | null;

export function ProductDetail({ record }: { record: PdpRecord }) {
  const router = useRouter();
  const savedHas = useStore((s) => s.saved.includes(record.id));
  const toggleSaved = useStore((s) => s.toggleSaved);

  const [qty, setQty] = useState(1);
  const [option, setOption] = useState<string | null>(null);
  const [activeThumb, setActiveThumb] = useState(0);
  const [activeSetIdx, setActiveSetIdx] = useState(0);
  // The conversation composer is a MODAL off the single + button
  // (owner order, 2026-11-04 — no flat expanding box). It opens in
  // ask mode from the + or in reply mode from a question's Reply.
  const [qaModal, setQaModal] = useState<
    { mode: "ask" } | { mode: "reply"; question: PdpQuestion } | null
  >(null);
  const [commentText, setCommentText] = useState("");
  const [commentStatus, setCommentStatus] = useState("");
  const [extraAnswers, setExtraAnswers] = useState<Record<string, PdpAnswer[]>>({});
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const communityRef = useRef<HTMLElement | null>(null);
  const shippingAccordRef = useRef<HTMLDetailsElement | null>(null);

  const [sessionUser, setSessionUser] = useState<SessionUser>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [reviewStatus, setReviewStatus] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  // Reviews/questions the shopper just posted — they are live on the
  // server immediately, and prepended here until the next page load.
  const [extraReviews, setExtraReviews] = useState<PdpReview[]>([]);
  const [extraQuestions, setExtraQuestions] = useState<PdpQuestion[]>([]);
  const [zip, setZip] = useState("");
  const [shipEst, setShipEst] = useState<{ cost: number; currency: string; min: number | null; max: number | null; promoCode: string | null } | null>(null);
  const [shipBusy, setShipBusy] = useState(false);
  const [shipNone, setShipNone] = useState(false);
  useEffect(() => {
    try {
      const z = localStorage.getItem("unsaid-zip");
      if (z) setZip(z);
    } catch { /* storage unavailable */ }
  }, []);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => setSessionUser(d?.user ?? null))
      .catch(() => setSessionUser(null))
      .finally(() => setSessionChecked(true));
  }, []);

  const toast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2500);
  };

  const handleSubmitReview = async () => {
    const body = reviewBody.trim();
    if (body.length < 10) {
      setReviewStatus("Please write a few words (at least 10 characters).");
      return;
    }
    if (!sessionUser) {
      setReviewStatus("Sign in to write a review.");
      return;
    }
    setReviewBusy(true);
    setReviewStatus("Sending…");
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: record.id,
          rating: reviewRating,
          title: reviewTitle.trim() || undefined,
          body,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Your review couldn't be saved.");
      if (data?.review) {
        setExtraReviews((prev) => [data.review as PdpReview, ...prev]);
      }
      setReviewTitle("");
      setReviewBody("");
      setReviewRating(5);
      setReviewStatus("Thanks — your review is live.");
    } catch (err: any) {
      setReviewStatus(err?.message || "Your review couldn't be saved — it's still in the box above.");
    } finally {
      setReviewBusy(false);
    }
  };

  const title = displayTitle(record.rawName);
  const allReviews = [...extraReviews, ...record.reviews];
  const allQuestions = [...extraQuestions, ...record.questions];
  // The active supplier set drives the gallery, the options, the
  // selected variant and the price. Set 0 is this page's product;
  // records cached before sets existed fall back to a set built
  // from the record's own fields.
  const set0: PdpSet = {
    productId: record.id,
    images: record.media,
    variants: record.variants,
    options: record.options,
    optionKind: record.optionKind,
    price: record.price,
  };
  const sets = record.sets && record.sets.length > 0 ? record.sets : [set0];
  const activeSet = sets[Math.min(activeSetIdx, sets.length - 1)] ?? set0;
  const images = activeSet.images;
  const crumbs = record.breadcrumb;
  const eyebrow = [record.brand, record.categoryLabel, record.badge]
    .filter(Boolean)
    .join(" · ");
  const sellerInitial = record.sellerName.trim().charAt(0).toUpperCase();
  const options = activeSet.options.filter((o) => o.label && o.label.trim().length > 0);
  const chosenOption = option ?? options[0]?.label ?? null;

  const selectedVariant =
    activeSet.variants.find((v) =>
      activeSet.optionKind === "size" ? v.size === chosenOption : v.color === chosenOption,
    ) ?? activeSet.variants[0];

  const mainImage = images[activeThumb]?.url ?? images[0]?.url ?? null;

  const viewTrackedRef = useRef(false);
  useEffect(() => {
    if (viewTrackedRef.current) return;
    viewTrackedRef.current = true;
    trackViewItem({
      item_id: String(activeSet.productId),
      item_name: title,
      price: activeSet.price ?? undefined,
    });
    // Mount-only: one view_item per PDP load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchSet = (i: number) => {
    setActiveSetIdx(i);
    setActiveThumb(0);
    setOption(null);
  };

  // Shipping estimate at selection time: the moment the shopper has a
  // variant, a quantity, and a ZIP, price the package live so the real
  // total is known here — not discovered at the cart.
  useEffect(() => {
    const z = zip.trim();
    if (z.length < 3 || !selectedVariant) {
      setShipEst(null);
      return;
    }
    let dead = false;
    setShipBusy(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/shipping/estimates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lines: [
              {
                supplier_catalog_variant_id: selectedVariant.id,
                quantity: qty,
                label: title,
              },
            ],
            country: "US",
            postal_code: z,
            subtotal: (activeSet.price ?? 0) * qty,
          }),
        });
        const q = await res.json();
        if (dead) return;
        const m = q?.packages?.[0]?.methods?.[0];
        if (m) {
          setShipEst({
            cost: m.cost,
            currency: m.currency,
            min: m.min_days,
            max: m.max_days,
            promoCode: q?.promo?.applied ? String(q.promo.code) : null,
          });
          setShipNone(false);
          try { localStorage.setItem("unsaid-zip", z); } catch { /* ignore */ }
        } else {
          setShipEst(null);
          setShipNone(true);
        }
      } catch {
        if (!dead) setShipEst(null);
      } finally {
        if (!dead) setShipBusy(false);
      }
    }, 350);
    return () => {
      dead = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zip, qty, chosenOption]);

  const arriveWindow = (min: number | null, max: number | null) => {
    if (min == null || max == null) return null;
    const f = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${f(new Date(Date.now() + min * 864e5))} – ${f(new Date(Date.now() + max * 864e5))}`;
  };

  const scrollTo = (el: HTMLElement | null) =>
    el?.scrollIntoView({ behavior: "smooth", block: "start" });

  const handleAdd = async (): Promise<boolean> => {
    const n = Math.max(1, Math.min(99, qty));
    const price = activeSet.price ?? 0;
    if (price <= 0) {
      toast("Pricing for this listing is confirmed at checkout");
      return false;
    }
    // Write THIS product to the server cart. The shared store's addToBag
    // only ever adds the quick-add modal's product — the PDP never sets
    // that slot, so the old handler toasted success and wrote nothing.
    // Add this page's own record directly, the same cart call the
    // customizer and the assistant use, and set the bag badge from the
    // server's cart afterwards.
    const variant =
      activeSet.variants.find((v) =>
        activeSet.optionKind === "size" ? v.size === chosenOption : v.color === chosenOption,
      ) ?? activeSet.variants[0];
    try {
      const customerId = await fetchCurrentCustomerId();
      await addToCart({
        customerId,
        ...(variant
          ? { supplier_catalog_variant_id: variant.id }
          : { supplier_catalog_product_id: activeSet.productId }),
        quantity: n,
      });
      const cart = await fetchCart(customerId);
      useStore.setState({
        cartCount: cart.items.reduce((sum, it) => sum + (it.quantity ?? 1), 0),
      });
      trackAddToCart({
        item_id: String(activeSet.productId),
        item_name: title,
        price,
        quantity: n,
        item_variant: chosenOption || undefined,
      });
      toast(`Added ${n > 1 ? `${n} × ` : ""}${title} to your bag ✓`);
      return true;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not add that to your bag — please try again.");
      return false;
    }
  };

  const handleGuestCheckout = async () => {
    if (await handleAdd()) {
      toast("Your bag is ready — checkout continues from the bag icon");
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/product/${record.slug}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title,
          text: `${title} · ${activeSet.price != null ? money(activeSet.price) : ""}`,
          url,
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        toast("Product link copied");
      } else {
        toast("Copy this product link from your browser address bar");
      }
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") toast("Unable to share right now");
    }
  };

  const handleSave = () => {
    toggleSaved(record.id);
    // Durable copy: the account center's Saved list reads
    // customer_wishlist_items, so a signed-in shopper's save survives
    // the session (the store's `saved` stays the in-page state).
    // Fire-and-forget — a guest or a failed write never blocks the tap.
    if (savedHas) {
      fetch(`/api/customers/me/wishlist?product_id=${encodeURIComponent(String(record.id))}`, {
        method: "DELETE",
      }).catch(() => {});
    } else {
      fetch("/api/customers/me/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: String(record.id) }),
      }).catch(() => {});
    }
    toast(savedHas ? "Removed from saved" : "Saved");
  };

  const handleViewShop = () => {
    router.push(record.sellerHref);
  };

  const openQa = (mode: { mode: "ask" } | { mode: "reply"; question: PdpQuestion }) => {
    setQaModal(mode);
    setCommentStatus("");
    setTimeout(() => document.getElementById("conversationText")?.focus(), 60);
  };

  const handleSubmitComment = async () => {
    const value = commentText.trim();
    if (!value) {
      setCommentStatus("Write a question or comment first.");
      return;
    }
    if (!sessionUser) {
      setCommentStatus("Sign in to join the conversation.");
      return;
    }
    setCommentStatus("Sending…");
    try {
      const res = await fetch("/api/product-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: record.id,
          body: value,
          parentId: qaModal?.mode === "reply" ? qaModal.question.id : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Your message couldn't be sent.");
      if (data?.question) {
        setExtraQuestions((prev) => [data.question as PdpQuestion, ...prev]);
        setCommentStatus("Your question is live — answers will appear here.");
      } else if (data?.answer && qaModal?.mode === "reply") {
        const qid = qaModal.question.id;
        setExtraAnswers((prev) => ({
          ...prev,
          [qid]: [...(prev[qid] ?? []), data.answer as PdpAnswer],
        }));
        setCommentStatus("Your answer is posted.");
      }
      setCommentText("");
      setQaModal(null);
    } catch (err: any) {
      setCommentStatus(err?.message || "Your message couldn't be sent — it's still in the box.");
    }
  };

  const openShippingAccordion = () => {
    if (shippingAccordRef.current) {
      shippingAccordRef.current.open = true;
      scrollTo(shippingAccordRef.current);
    }
  };

  return (
    <main className="pdp-route-wrap" aria-label={`${title} product details`}>
      {/* Breadcrumbs — Home / shop chain / product */}
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">Home</Link>
        {crumbs.map((c) => (
          <React.Fragment key={`${c.name}-${c.path}`}>
            <span>/</span>
            <Link href={c.path || "/shop"}>{c.name}</Link>
          </React.Fragment>
        ))}
        <span>/</span>
        {title}
      </nav>

      <section className="pdp" id="product">
        {/* LEFT — gallery, review panel */}
        <div className="gallery">
          <div className="mainimage">
            <SafeImage src={mainImage} fallbacks={images.map((m) => m.url)} alt={title} fill priority sizes="(max-width: 900px) 100vw, 50vw" />
          </div>
          {images.length > 1 && (
            <div className="thumbs">
              {images.slice(0, 8).map((m, i) => (
                <button
                  key={`${m.url}-${i}`}
                  type="button"
                  className={`thumb ${i === activeThumb ? "active" : ""}`}
                  aria-label={`View product image ${i + 1}`}
                  onClick={() => setActiveThumb(i)}
                >
                  <SafeImage src={m.url} alt="" fill sizes="120px" loading="lazy" />
                </button>
              ))}
            </div>
          )}
          {sets.length > 1 && (
            <div className="suppliersets">
              <span className="ss-label">Other versions of this product</span>
              {sets.map((s, i) => (
                <button
                  key={s.productId}
                  type="button"
                  className={`ss-chip ${i === activeSetIdx ? "active" : ""}`}
                  aria-label={`View version ${i + 1} of this product`}
                  aria-pressed={i === activeSetIdx}
                  onClick={() => switchSet(i)}
                >
                  {s.images[0] ? (
                    <SafeImage src={s.images[0].url} fallbacks={s.images.map((im) => im.url)} alt="" fill sizes="44px" loading="lazy" />
                  ) : null}
                </button>
              ))}
            </div>
          )}
          <div className="galleryhint">Product photography · Select a thumbnail to explore more</div>

          {/* Review panel — the product's REAL published reviews, plus the
              signed-in submission form. "No reviews yet" is allowed HERE as
              the honest empty state (the ban applies to card rating lines). */}
          <div className="review-panel" id="reviews">
            <div className="review-head">
              <div>
                <p className="review-title">Customer reviews</p>
                <p>
                  {allReviews.length > 0
                    ? `${(allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length).toFixed(1)} (${allReviews.length})`
                    : "No reviews yet"}
                </p>
              </div>
              <span className="tag">Customer feedback</span>
            </div>
            {allReviews.length > 0 && (
              <div className="review-list">
                {allReviews.map((r) => (
                  <article className="review" key={r.id}>
                    <p className="review-stars" aria-label={`Rated ${r.rating} out of 5`}>
                      {"★".repeat(Math.max(0, Math.min(5, Math.round(r.rating))))}
                      {"☆".repeat(5 - Math.max(0, Math.min(5, Math.round(r.rating))))}
                    </p>
                    {r.title && (
                      <p className="review-headline">
                        <strong>{r.title}</strong>
                      </p>
                    )}
                    {r.body && <p>{r.body}</p>}
                    <p className="review-meta">
                      {r.author}
                      {r.verified ? " · Verified buyer" : ""}
                      {r.createdAt
                        ? ` · ${new Date(r.createdAt).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}`
                        : ""}
                    </p>
                  </article>
                ))}
              </div>
            )}
            {sessionUser ? (
              <div className="review-form">
                <p className="review-form-title">Write a review</p>
                <div className="review-stars-input" role="radiogroup" aria-label="Your rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={reviewRating === n}
                      className={reviewRating >= n ? "star active" : "star"}
                      onClick={() => setReviewRating(n)}
                    >
                      {reviewRating >= n ? "★" : "☆"}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={reviewTitle}
                  onChange={(e) => setReviewTitle(e.target.value)}
                  maxLength={120}
                  placeholder="Headline (optional)"
                  aria-label="Review headline"
                />
                <textarea
                  value={reviewBody}
                  onChange={(e) => setReviewBody(e.target.value)}
                  maxLength={2000}
                  placeholder="How did this feel to give — or receive?"
                  aria-label="Your review"
                />
                <div className="composer-actions">
                  <p aria-live="polite">{reviewStatus}</p>
                  <button type="button" onClick={handleSubmitReview} disabled={reviewBusy}>
                    Submit review
                  </button>
                </div>
                <p className="review-note">Reviews go live right away.</p>
              </div>
            ) : (
              <p className="review-note">
                {sessionChecked ? "Sign in to write a review." : ""}
              </p>
            )}
          </div>
        </div>

        {/* RIGHT — the buy column */}
        <div className="pdpinfo">
          <div className="eyebrow">{eyebrow || "UnSaid edit"}</div>
          <h1>{title}</h1>
          <div className="price">
            {activeSet.price != null ? money(activeSet.price) : "Price at checkout"}
            {record.compareAtPrice &&
            activeSet.price &&
            record.compareAtPrice > activeSet.price ? (
              <s>{money(record.compareAtPrice)}</s>
            ) : null}
          </div>

          {/* The REAL description only — nothing when the catalog doesn't
              carry one (no placeholder copy). */}
          {record.description && <p className="desc">{record.description}</p>}

          <div className="social">
            <button type="button" onClick={handleShare}>↗ Share product</button>
            <button type="button" onClick={handleSave} aria-pressed={savedHas}>
              {savedHas ? "Saved" : "Save"}
            </button>
            <button type="button" onClick={() => scrollTo(communityRef.current)}>
              ＋ Join the conversation
            </button>
          </div>

          <div className="seller" id="seller">
            <div className="avatar" aria-hidden="true">{sellerInitial}</div>
            <div className="sellerinfo">
              <strong>{record.sellerName}</strong>
              <small>Marketplace shop · Seller profile and policies</small>
              <button type="button" className="viewshop" onClick={handleViewShop}>
                View seller shop ↗
              </button>
            </div>
          </div>

          {/* PDP CUSTOMIZER — additive panel, present only when this
              product carries published designs (see the loader leg).
              The standard buy box below is untouched. */}
          {record.customizer && (
            <PdpCustomizer
              data={record.customizer}
              productId={record.id}
              title={title}
              media={images}
              variants={record.variants}
              qty={qty}
              sizeLabel={activeSet.optionKind === "size" ? chosenOption : null}
              colorLabel={activeSet.optionKind === "color" ? chosenOption : null}
              onToast={toast}
            />
          )}

          {/* REAL variants only — the whole block is omitted when the
              listing carries none (never fake size options). */}
          {options.length > 0 && (
            <>
              <div className="optionlabel">
                <span>{activeSet.optionKind === "color" ? "Choose color" : "Choose size"}</span>
                <span aria-live="polite">{chosenOption}</span>
              </div>
              <div className="options">
                {options.map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    className={`option ${chosenOption === o.label ? "active" : ""}`}
                    aria-pressed={chosenOption === o.label}
                    onClick={() => setOption(o.label)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="optionlabel">
            <span>Quantity</span>
            <span>{record.inStock ? "In stock" : "Backorder"}</span>
          </div>
          <div className="buyrow">
            <div className="qty" aria-label="Quantity">
              <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))}>
                −
              </button>
              <span id="qtyValue">{qty}</span>
              <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(99, q + 1))}>
                +
              </button>
            </div>
            <button type="button" className="add" id="pdpAdd" onClick={handleAdd}>
              Add to bag · {activeSet.price != null ? money(activeSet.price * qty) : "—"}
            </button>
          </div>
          <button type="button" className="guest" id="pdpCheckout" onClick={handleGuestCheckout}>
            Checkout as guest →
          </button>
          <div
            style={{
              border: "1px solid #e5e0ea",
              borderRadius: 10,
              padding: "10px 12px",
              marginTop: 12,
            }}
          >
            {shipEst ? (
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
                {shipEst.promoCode ? (
                  <>
                    Shipping to <strong>{zip.trim()}</strong>: <strong>FREE</strong> —{" "}
                    {shipEst.promoCode} (orders $75+) · you save {money(shipEst.cost)}
                  </>
                ) : (
                  <>
                    Shipping to <strong>{zip.trim()}</strong>:{" "}
                    <strong>{money(shipEst.cost)}</strong>
                  </>
                )}
                {arriveWindow(shipEst.min, shipEst.max) ? (
                  <> · arrives {arriveWindow(shipEst.min, shipEst.max)}</>
                ) : null}
                <br />
                <span style={{ color: "#5b5566", fontSize: 13 }}>
                  Total with shipping:{" "}
                  {money((activeSet.price ?? 0) * qty + (shipEst.promoCode ? 0 : shipEst.cost))}
                </span>{" "}
                <button
                  type="button"
                  onClick={() => {
                    setShipEst(null);
                    setZip("");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    color: "#5b5566",
                    fontSize: 13,
                    textDecoration: "underline",
                    cursor: "pointer",
                  }}
                >
                  Change ZIP
                </button>
              </p>
            ) : (
              <form
                onSubmit={(e) => e.preventDefault()}
                style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
              >
                <label htmlFor="pdp-zip" style={{ fontSize: 14 }}>
                  Shipping:
                </label>
                <input
                  id="pdp-zip"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="ZIP code"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  style={{
                    width: 110,
                    padding: "7px 9px",
                    border: "1px solid #cfc8da",
                    borderRadius: 8,
                    fontSize: 14,
                    color: "#171420",
                    background: "#fff",
                  }}
                />
                <span style={{ fontSize: 13, color: "#5b5566" }}>
                  {shipBusy
                    ? "Calculating…"
                    : shipNone
                      ? "Not available to this ZIP yet"
                      : "Enter a ZIP to see your shipping cost"}
                </span>
              </form>
            )}
          </div>
          <div className="trust">
            <span>✓</span> No account required<br />
            <span>✓</span> Delivery terms shown before payment<br />
            <span>✓</span> Secure checkout when connected
          </div>

          <div className="delivery">
            <strong>Delivery &amp; returns</strong>
            <p>Every item is made to order and ships in its own package. Enter your ZIP above to see this item's shipping cost and delivery window before you buy.</p>
            <button type="button" onClick={openShippingAccordion}>
              View delivery details ↓
            </button>
          </div>

          <div className="accord" id="details">
            <details open>
              <summary>Product details</summary>
              {/* The description renders ONCE, in the buy column under the
                  price — it is deliberately NOT repeated here. */}
              {record.specifications?.trim() ? (
                <p>{record.specifications.trim()}</p>
              ) : (
                <p>Confirm dimensions and product specifications with the seller before purchase.</p>
              )}
            </details>
            <details>
              <summary>Materials &amp; care</summary>
              {record.care?.trim() ? (
                <p>{record.care.trim()}</p>
              ) : (
                <p>
                  Materials, cleaning instructions, and care information should be provided by the seller on the live listing.
                </p>
              )}
            </details>
            <details ref={shippingAccordRef}>
              <summary>Shipping &amp; returns</summary>
              <p>
                Shipping estimates, delivery options, and the seller&apos;s return policy should be visible before payment.
              </p>
            </details>
            <details>
              <summary>About the seller</summary>
              <p>
                {record.sellerName} is a marketplace shop. Seller verification, fulfilment details, and shop policies can
                be surfaced here.
              </p>
              <button type="button" className="visit-shop" onClick={handleViewShop}>
                Visit shop profile ↗
              </button>
            </details>
          </div>
        </div>
      </section>

      {/* UNSAID PICKS — REAL products from other departments. Renders only
          when at least 2 resolve (never editorial stock cards). */}
      {record.picks.length >= 2 && (
        <section className="section" id="pawsly">
          <div className="sectionhead">
            <div>
              <div className="eyebrow">A little help choosing</div>
              <h2>UnSaid Picks</h2>
            </div>
            <p>Thoughtful suggestions built around your words, your people, and what you never quite said out loud.</p>
          </div>
          <div className="picks">
            {record.picks.map((pick) => (
              <article className="pick" key={pick.id}>
                {pick.image && (
                  <div className="pickimg">
                    <SafeImage src={pick.image} alt={displayTitle(pick.name)} fill sizes="(max-width: 900px) 50vw, 25vw" loading="lazy" />
                  </div>
                )}
                <div className="pickbody">
                  <div className="tag">{pick.brand ?? pick.kind}</div>
                  <h3>{displayTitle(pick.name)}</h3>
                  <p>{pick.price != null ? money(pick.price) : "Price at checkout"}</p>
                  <Link className="picklink" href={`/product/${pick.slug}`}>
                    View product ↗
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* PICKS FOR YOUR PEOPLE — personalization band */}
      <section className="section">
        <div className="pawsly">
          <div>
            <div className="eyebrow">Personalized for your people</div>
            <h2>Picks for your people.</h2>
            <p>
              Tell us a little about who you&apos;re shopping for and get a more relevant edit of keepsakes, everyday
              essentials, and the words that say it right.
            </p>
          </div>
          <button type="button" onClick={() => router.push("/signature")}>
            Personalize my picks ↗
          </button>
        </div>
      </section>

      {/* QUESTIONS & CONVERSATION — the question & comment box */}
      <section className="section" id="community" ref={communityRef}>
        <div className="sectionhead">
          <div>
            <div className="eyebrow">Product conversation</div>
            <h2>Questions &amp; conversation</h2>
          </div>
          <p>Ask us a question or share a useful tip about this product.</p>
        </div>
        {allQuestions.length > 0 && (
          <div className="review-list">
            {allQuestions.map((q) => (
              <article className="review" key={q.id}>
                <p>{q.body}</p>
                <p className="review-meta">
                  {q.author}
                  {q.createdAt
                    ? ` · ${new Date(q.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}`
                    : ""}
                </p>
                {[...q.answers, ...(extraAnswers[q.id] ?? [])].map((a) => (
                  <div
                    key={a.id}
                    style={{
                      marginTop: 10,
                      marginLeft: 14,
                      paddingLeft: 12,
                      borderLeft: "2px solid #e5e0ee",
                    }}
                  >
                    <p>{a.body}</p>
                    <p className="review-meta">
                      {a.role === "staff" ? "Unsaid team" : a.author}
                      {a.createdAt
                        ? ` · ${new Date(a.createdAt).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}`
                        : ""}
                    </p>
                  </div>
                ))}
                <button
                  type="button"
                  className="qa-reply"
                  onClick={() => openQa({ mode: "reply", question: q })}
                >
                  Reply
                </button>
              </article>
            ))}
          </div>
        )}
        {allQuestions.length === 0 && (
          <p className="qa-empty">No questions yet — yours could be the first.</p>
        )}
        <div className="conversation-line">
          <span>Have a question about this product?</span>
          <button
            className="conversation-plus"
            type="button"
            aria-label="Ask a question about this product"
            onClick={() => openQa({ mode: "ask" })}
          >
            ＋
          </button>
        </div>
        {commentStatus && !qaModal && (
          <p className="qa-status" aria-live="polite">{commentStatus}</p>
        )}
        {qaModal && (
          <div
            className="qa-backdrop"
            role="presentation"
            onClick={() => setQaModal(null)}
          >
            <div
              className="qa-modal"
              role="dialog"
              aria-modal="true"
              aria-label={qaModal.mode === "ask" ? "Ask a question" : "Reply"}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="qa-close"
                aria-label="Close"
                onClick={() => setQaModal(null)}
              >
                ×
              </button>
              <h3>{qaModal.mode === "ask" ? "Ask about this product" : "Reply"}</h3>
              {qaModal.mode === "reply" && (
                <p className="qa-quote">
                  {qaModal.question.author}: “{qaModal.question.body}”
                </p>
              )}
              {!sessionChecked ? null : !sessionUser ? (
                <>
                  <p className="qa-note">
                    Sign in to join the conversation — it keeps the answers
                    honest and ties your question to your account.
                  </p>
                  <div className="composer-actions">
                    <span />
                    <a
                      className="qa-signin"
                      href={`/login?next=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/account")}`}
                    >
                      Sign in
                    </a>
                  </div>
                </>
              ) : (
                <>
                  <p className="qa-note">
                    Posting as {sessionUser.name || sessionUser.email}
                  </p>
                  <textarea
                    id="conversationText"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    maxLength={1500}
                    placeholder={
                      qaModal.mode === "ask"
                        ? "Write your question or comment…"
                        : "Write your answer…"
                    }
                    aria-label="Write your question or comment"
                  />
                  <div className="composer-actions">
                    <p id="commentStatus" aria-live="polite">
                      {commentStatus || `${commentText.length}/1500`}
                    </p>
                    <span className="qa-actions">
                      <button
                        type="button"
                        className="qa-cancel"
                        onClick={() => setQaModal(null)}
                      >
                        Cancel
                      </button>
                      <button type="button" onClick={handleSubmitComment}>
                        Submit
                      </button>
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* YOU MAY ALSO LIKE — real related products */}
      {record.related.length > 0 && (
        <section className="section" id="related">
          <div className="sectionhead">
            <div>
              <div className="eyebrow">More to discover</div>
              <h2>You may also like</h2>
            </div>
            <p>Related items from across the marketplace, without distracting from the product and its buy box.</p>
          </div>
          <div className="related">
            {record.related.map((p) => (
              <Link
                href={`/product/${p.slug}`}
                className="rel"
                key={p.id}
                aria-label={`View ${displayTitle(p.name)}`}
              >
                {p.image && (
                  <SafeImage src={p.image} alt={displayTitle(p.name)} width={600} height={600} loading="lazy" />
                )}
                <div className="relbody">
                  <small>{p.kind}</small>
                  <h3>{displayTitle(p.name)}</h3>
                  <strong>{p.price != null ? money(p.price) : "—"}</strong>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className={`pdptoast ${toastVisible ? "show" : ""}`} role="status" aria-live="polite">
        {toastMessage}
      </div>
    </main>
  );
}
