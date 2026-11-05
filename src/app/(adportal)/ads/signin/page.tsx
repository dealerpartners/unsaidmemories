import { redirect } from "next/navigation";

/**
 * /ads/signin — retired as a separate door (owner ruling, 2026-11-02).
 *
 * There is no advertiser login distinct from the customer login:
 * advertisers sign in with the same account they shop with, and the
 * advertiser privilege lives on that account (see /account →
 * Advertising). This route stays so old links and bookmarks land
 * somewhere sensible — it forwards to the one login, which returns
 * the user to /ads afterwards.
 */
export default function AdsSignInPage() {
  redirect("/login?next=/ads");
}
