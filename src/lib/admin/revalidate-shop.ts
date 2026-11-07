import { revalidatePath } from "next/cache"

// ---------------------------------------------------------------------------
// Centralized storefront revalidation.
//
// Every admin mutation (products / categories / brands / filters) eventually
// touches the storefront's category landing pages, PLPs, PDPs, or the home
// page's featured carousel. Calling revalidateShop() from inside the route
// handler — after the Supabase write succeeds — keeps the public site fresh
// without exposing the REVALIDATE_SECRET bearer token to the browser.
// ---------------------------------------------------------------------------

export function revalidateShop(): void {
  // Cached data stays cached. The shared "catalog" data tag is NOT
  // expired here: expiring it marked every page that renders catalog
  // data stale, so any admin write (a brand, a coupon, a filter)
  // re-rendered the whole catalog on the next crawl — the ISR write
  // bleed measured 2026-11-06. Shared data refreshes on its own TTLs;
  // a changed product is busted by its exact path in its own writer.
  // Home page may surface featured products / category tiles.
  revalidatePath("/")
  // The shop index + canonical category PLP routes (`/shop/dog`,
  // `/shop/dog/grooming`, …) live under a single catch-all segment.
  revalidatePath("/shop")
  revalidatePath("/shop/[...slug]", "page")
  // The shopping bag reads cart-only state client-side but also renders
  // product recommendations; clear it too.
  revalidatePath("/shop/bag")
  // Product detail pages are NOT busted here. A template-wide bust of
  // /product/[id] rewrote every product page on the next crawl after any
  // admin edit (brands, coupons, categories included). Product writers
  // bust the exact product path instead (erp/catalog, designs review).
}
