"use client";

import { create } from "zustand";
import type { Product } from "./catalog";
import { addToCart, fetchCart, fetchCurrentCustomerId } from "./commerce/cart-client";
import { trackAddToCart } from "./analytics-events";

type State = {
  cartCount: number;
  saved: (number | string)[];
  quickProduct: Product | null;
  size: string;
  quantity: number;
  added: boolean;
  cartError: string | null;
  searchOpen: boolean;
  mobileMenu: boolean;
  assistantOpen: boolean;
  accountOpen: boolean;
  openQuickAdd: (p: Product) => void;
  closeQuickAdd: () => void;
  setSize: (s: string) => void;
  setQuantity: (n: number) => void;
  addToBag: () => Promise<void>;
  syncCartCount: () => Promise<void>;
  toggleSaved: (id: number | string) => void;
  setSearchOpen: (v: boolean) => void;
  setMobileMenu: (v: boolean) => void;
  setAssistantOpen: (v: boolean) => void;
  setAccountOpen: (v: boolean) => void;
};

export const useStore = create<State>((set, get) => ({
  cartCount: 0,
  saved: [],
  quickProduct: null,
  size: "",
  quantity: 1,
  added: false,
  cartError: null,
  searchOpen: false,
  mobileMenu: false,
  assistantOpen: false,
  accountOpen: false,
  openQuickAdd: (p) =>
    set({
      quickProduct: p,
      // A product with exactly one size needs no picking — preselect it
      // so Add is never dead-gated on a choice that doesn't exist.
      size: p.sizes?.length === 1 ? p.sizes[0] : "",
      quantity: 1,
      added: false,
      cartError: null,
    }),
  closeQuickAdd: () => set({ quickProduct: null }),
  setSize: (s) => set({ size: s }),
  setQuantity: (n) => set({ quantity: Math.max(1, Math.min(99, Math.floor(n) || 1)) }),
  addToBag: async () => {
    const { size, quantity, quickProduct } = get();
    if (!quickProduct) return;
    const sizes = quickProduct.sizes ?? [];
    // Size is required only when the product actually offers sizes —
    // one-size products (mugs, cards, most of the catalog) add directly.
    if (sizes.length > 0 && !size) {
      set({ cartError: "Choose a size first.", added: false });
      return;
    }
    set({ cartError: null });
    try {
      const customerId = await fetchCurrentCustomerId();
      await addToCart({
        customerId,
        supplier_catalog_product_id: String(quickProduct.id),
        quantity,
        size: size || null,
      });
      // The badge reads the SERVER cart, never a local guess — the
      // same recount the PDP does after its add.
      const cart = await fetchCart(customerId);
      set({
        cartCount: cart.items.reduce((sum, it) => sum + (it.quantity ?? 1), 0),
        added: true,
        cartError: null,
      });
      trackAddToCart({
        item_id: String(quickProduct.id),
        item_name: quickProduct.name,
        price: quickProduct.price,
        quantity,
        item_variant: size || undefined,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not add to bag.";
      set({ cartError: msg, added: false });
    }
  },
  syncCartCount: async () => {
    try {
      const customerId = await fetchCurrentCustomerId();
      const cart = await fetchCart(customerId);
      set({ cartCount: cart.items.reduce((sum, it) => sum + (it.quantity ?? 1), 0) });
    } catch {
      // Fail soft: the badge keeps its current value rather than lying.
    }
  },
  toggleSaved: (id: number | string) =>
    set((s) => ({
      saved: s.saved.includes(id)
        ? s.saved.filter((x) => x !== id)
        : [...s.saved, id],
    })),
  setSearchOpen: (v) => set({ searchOpen: v }),
  setMobileMenu: (v) => set({ mobileMenu: v }),
  setAssistantOpen: (v) => set({ assistantOpen: v }),
  setAccountOpen: (v) => set({ accountOpen: v }),
}));
