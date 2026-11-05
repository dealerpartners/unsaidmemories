"use client";

import { useEffect } from "react";
import { useMarketplaceStore, type QuickAddProduct } from "@/lib/marketplace-store";

/**
 * Quick-add modal — uses the mockup's EXACT class names (.overlay, .modal,
 * .modal-image, .modal-body, .eyebrow, .modal-price, .modal-desc, .label,
 * .option-row, .option, .qtyrow, .qty, .add-btn, .modal-note, .close).
 * Driven by the marketplace zustand store.
 */
export function MarketplaceQuickAdd() {
  const product = useMarketplaceStore((s) => s.quickProduct) as QuickAddProduct | null;
  const quantity = useMarketplaceStore((s) => s.quantity);
  const style = useMarketplaceStore((s) => s.style);
  const size = useMarketplaceStore((s) => s.size);
  const closeQuick = useMarketplaceStore((s) => s.closeQuick);
  const setQuantity = useMarketplaceStore((s) => s.setQuantity);
  const setStyle = useMarketplaceStore((s) => s.setStyle);
  const setSize = useMarketplaceStore((s) => s.setSize);
  const addToBag = useMarketplaceStore((s) => s.addToBag);

  // Lock body scroll while open + ESC to close (mirrors the mockup's JS).
  useEffect(() => {
    if (!product) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeQuick();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [product, closeQuick]);

  if (!product) return null;

  const optionStyles = ["Standard", "Gift-ready", "Personalized"];
  const showSizes = product.sizes.length > 0 ? product.sizes : ["One size"];
  const total = product.price * quantity;

  return (
    <div
      className="overlay open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modalName"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeQuick();
      }}
    >
      <div className="modal">
        <button
          className="close"
          aria-label="Close"
          onClick={closeQuick}
        >
          ×
        </button>
        <img
          className="modal-image"
          alt={product.name}
          src={product.image}
        />
        <div className="modal-body">
          <div className="eyebrow">{product.category}</div>
          <h2 id="modalName" className="serif">
            {product.name}
          </h2>
          <div className="modal-price">
            ${product.price.toFixed(2)}
            {product.supplierCost != null && (
              <span style={{ color: "var(--muted)", fontWeight: 400, marginLeft: 8, fontSize: 10 }}>
                list ${product.supplierCost.toFixed(2)}
              </span>
            )}
          </div>
          <p className="modal-desc">{product.desc}</p>

          <span className="label">SELECT OPTION</span>
          <div className="option-row">
            {optionStyles.map((opt) => (
              <button
                key={opt}
                className={`option ${style === opt ? "selected" : ""}`}
                onClick={() => setStyle(opt)}
              >
                {opt}
              </button>
            ))}
          </div>

          {showSizes.length > 1 && (
            <>
              <span className="label">SIZE</span>
              <div className="option-row">
                {showSizes.map((s) => (
                  <button
                    key={s}
                    className={`option ${size === s ? "selected" : ""}`}
                    onClick={() => setSize(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="qtyrow">
            <span style={{ fontSize: 10, color: "var(--muted)" }}>Quantity</span>
            <div className="qty">
              <button onClick={() => setQuantity(quantity - 1)} aria-label="Decrease quantity">
                −
              </button>
              <span>{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)} aria-label="Increase quantity">
                +
              </button>
            </div>
          </div>

          <button className="add-btn" onClick={addToBag}>
            ADD TO BAG — ${total.toFixed(2)}
          </button>
          <div className="modal-note">
            Made to order · Secure checkout with Stripe
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Toast — the mockup's exact .toast element, driven by the store.
 * Rendered once in the marketplace layout.
 */
export function MarketplaceToast() {
  const toast = useMarketplaceStore((s) => s.toast);
  const visible = useMarketplaceStore((s) => s.toastVisible);
  return (
    <div className={`toast ${visible ? "show" : ""}`} role="status" aria-live="polite">
      {toast}
    </div>
  );
}
