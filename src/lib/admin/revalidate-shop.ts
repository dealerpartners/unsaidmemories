import { revalidatePath, revalidateTag } from "next/cache"

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
  // Data-cache entries (unstable_cache) purge ONLY by tag or by their
  // revalidate timer — path revalidation alone leaves them stale, which
  // is why a deleted product used to linger on the storefront. Bust the
  // tags first so a delete is visible in the same request: "catalog"
  // covers the shop fetchers and the PDP loader, "home-featured" the
  // home page rail.
  revalidateTag("catalog", { expire: 0 })
  revalidateTag("home-featured", { expire: 0 })
  // Home page may surface featured products / category tiles.
  revalidatePath("/")
  // The shop index + canonical category PLP routes (`/shop/dog`,
  // `/shop/dog/grooming`, …) live under a single catch-all segment.
  revalidatePath("/shop")
  revalidatePath("/shop/[...slug]", "page")
  // The shopping bag reads cart-only state client-side but also renders
  // product recommendations; clear it too.
  revalidatePath("/shop/bag")
  // Product detail pages (the live PDP route is /product/[id]).
  revalidatePath("/product/[id]", "page")
}
