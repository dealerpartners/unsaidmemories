// ---------------------------------------------------------------------------
// Business identity for UnSaid Memories — an e-commerce store.
// Single source of truth for the business name, contact, schema, and
// citations. This is an ONLINE store (no physical salon, no grooming,
// no point of sale).
// ---------------------------------------------------------------------------

import { SITE_URL } from "@/lib/site-url"

export const BUSINESS = {
  name: "UnSaid Memories",
  tagline: "Thoughtful things for the people who matter",
  legalName: "UnSaid Memories",
  description:
    "UnSaid Memories is an online store for thoughtful, meaningful pieces — " +
    "wearable, giftable, and everyday items designed around connection. " +
    "Print-on-demand and custom designs, shipped to your door.",
  // No physical location — this is an online store.
  address: {
    street: "",
    city: "",
    region: "",
    postalCode: "",
    country: "US",
  },
  phone: "",
  phoneDisplay: "",
  email: "hello@unsaidmemories.com",
  url: SITE_URL,
  // No published hours — the shop is always open online.
  openingHours: [],
  // Ships nationwide (US).
  serviceArea: {
    country: "US",
  },
  sameAs: [
    "https://www.instagram.com/unsaidmemories",
  ],
  geo: {
    latitude: 0,
    longitude: 0,
  },
  priceRange: "$$",
} as const

// No city landing pages — this is an online store, not a local service.
export type CityLanding = {
  slug: string
  city: string
  titleShort: string
  titleLong: string
  metaDescription: string
  intro: string
}

export const CITY_LANDINGS: CityLanding[] = []

export const SHELBY_HUB = null

// ---------------------------------------------------------------------------
// OnlineStore schema generator. Drives the JSON-LD blob on every page.
// ---------------------------------------------------------------------------

export function localBusinessSchema(_areaServedCity?: string) {
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": `${SITE_URL}/#business`,
    name: BUSINESS.name,
    legalName: BUSINESS.legalName,
    description: BUSINESS.description,
    url: BUSINESS.url,
    email: BUSINESS.email,
    image: `${SITE_URL}/assets/og-image.png`,
    logo: `${SITE_URL}/kinnect-logo.png`,
    priceRange: BUSINESS.priceRange,
    areaServed: { "@type": "Country", name: "United States" },
    sameAs: BUSINESS.sameAs,
  }
}

// FAQPage schema — used on pages with FAQ blocks.
export function faqSchema(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  }
}

// BreadcrumbList schema.
export function breadcrumbSchema(trail: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: `${SITE_URL}${t.url}`,
    })),
  }
}
