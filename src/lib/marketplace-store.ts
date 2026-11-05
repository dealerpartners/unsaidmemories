"use client";

import { create } from "zustand";
import { addToCart, fetchCart, fetchCurrentCustomerId } from "./commerce/cart-client";

/**
 * Quick-add product payload. Built from a SupplierProduct + its min price +
 * the first image. Mirrors the fields the mockup's modal needs to render.
 */
export type QuickAddProduct = {
  id: string;
  name: string;
  brandName: string;
  category: string;
  image: string;
  images: string[];
  price: number; // retail price (supplier cost × markup)
  supplierCost: number | null;
  color: string;
  colors: string[];
  sizes: string[];
  variantCount: number;
  desc: string;
};

type MarketplaceState = {
  cartCount: number;
  saved: Set<string>;
  quickProduct: QuickAddProduct | null;
  quantity: number;
  style: string;
  size: string;
  toast: string;
  toastVisible: boolean;
  sidebarOpen: boolean;

  openQuick: (p: QuickAddProduct) => void;
  closeQuick: () => void;
  setQuantity: (n: number) => void;
  setStyle: (s: string) => void;
  setSize: (s: string) => void;
  toggleSaved: (id: string) => void;
  addToBag: () => Promise<void>;
  syncCartCount: () => Promise<void>;
  showToast: (msg: string) => void;
  setSidebarOpen: (v: boolean) => void;
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useMarketplaceStore = create<MarketplaceState>((set, get) => ({
  cartCount: 0,
  saved: new Set<string>(),
  quickProduct: null,
  quantity: 1,
  style: "Standard",
  size: "",
  toast: "",
  toastVisible: false,
  sidebarOpen: false,

  openQuick: (p) =>
    set({
      quickProduct: p,
      quantity: 1,
      style: "Standard",
      size: p.sizes.length === 1 ? p.sizes[0] : "",
    }),
  closeQuick: () => set({ quickProduct: null }),
  setQuantity: (n) => set({ quantity: Math.max(1, Math.min(99, n)) }),
  setStyle: (s) => set({ style: s }),
  setSize: (s) => set({ size: s }),
  toggleSaved: (id) => {
    const saved = new Set(get().saved);
    if (saved.has(id)) {
      saved.delete(id);
      get().showToast("Removed from your list");
    } else {
      saved.add(id);
      get().showToast("Saved to your list");
    }
    set({ saved });
  },
  addToBag: async () => {
    const { quickProduct, quantity, size } = get();
    if (!quickProduct) return;
    if (quickProduct.sizes.length > 1 && !size) {
      get().showToast("Choose a size first.");
      return;
    }
    try {
      const customerId = await fetchCurrentCustomerId();
      await addToCart({
        customerId,
        supplier_catalog_product_id: quickProduct.id,
        quantity,
        size: size || null,
      });
      // Badge reads the server cart, never a local guess.
      const cart = await fetchCart(customerId);
      set({ cartCount: cart.items.reduce((sum, it) => sum + (it.quantity ?? 1), 0) });
      get().showToast(`${quantity} × ${quickProduct.name} added to bag`);
      set({ quickProduct: null });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not add to bag.";
      get().showToast(msg);
    }
  },
  syncCartCount: async () => {
    try {
      const customerId = await fetchCurrentCustomerId();
      const cart = await fetchCart(customerId);
      set({ cartCount: cart.items.reduce((sum, it) => sum + (it.quantity ?? 1), 0) });
    } catch {
      // Fail soft: keep the current badge value.
    }
  },
  showToast: (msg) => {
    if (toastTimer) clearTimeout(toastTimer);
    set({ toast: msg, toastVisible: true });
    toastTimer = setTimeout(() => set({ toastVisible: false }), 2300);
  },
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
}));
