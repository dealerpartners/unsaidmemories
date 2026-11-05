/**
 * gift-finder-options — the facet option lists shared by the server
 * finder (src/lib/gift-finder.ts) and the client box. Kept separate
 * so the client bundle never imports the server Supabase client.
 */

export const RECIPIENTS: { value: string; label: string; keywords: string[] }[] = [
  { value: "mom", label: "Mom", keywords: ["mom", "mother", "mama"] },
  { value: "dad", label: "Dad", keywords: ["dad", "father", "papa"] },
  { value: "grandma", label: "Grandma", keywords: ["grandma", "grandmother", "nana"] },
  { value: "grandpa", label: "Grandpa", keywords: ["grandpa", "grandfather"] },
  { value: "sister", label: "Sister", keywords: ["sister", "sis"] },
  { value: "brother", label: "Brother", keywords: ["brother", "bro"] },
  { value: "partner", label: "Partner", keywords: ["wife", "husband", "partner", "anniversary"] },
  { value: "friend", label: "Friend", keywords: ["friend", "bestie", "bff"] },
  { value: "baby", label: "A new baby", keywords: ["baby", "newborn", "infant", "toddler"] },
  { value: "pet-lover", label: "Pet lover", keywords: ["dog", "cat", "pet", "paw"] },
];

export const OCCASIONS: { value: string; label: string; expansionKey: string }[] = [
  { value: "memorial", label: "In memory of someone", expansionKey: "sympathy" },
  { value: "wedding", label: "Wedding", expansionKey: "wedding" },
  { value: "anniversary", label: "Anniversary", expansionKey: "anniversary" },
  { value: "birthday", label: "Birthday", expansionKey: "birthday" },
  { value: "new-baby", label: "New baby", expansionKey: "baby" },
  { value: "graduation", label: "Graduation", expansionKey: "graduation" },
  { value: "thank-you", label: "Thank you", expansionKey: "thankyou" },
  { value: "holiday", label: "The holidays", expansionKey: "christmas" },
];

export const MATERIALS: { value: string; label: string }[] = [
  { value: "ceramic", label: "Ceramic" },
  { value: "cotton", label: "Cotton" },
  { value: "canvas", label: "Canvas" },
  { value: "metal", label: "Metal" },
  { value: "wood", label: "Wood" },
  { value: "glass", label: "Glass" },
];

export const PRICE_BANDS: { value: string; label: string; max: number }[] = [
  { value: "25", label: "Under $25", max: 25 },
  { value: "50", label: "Under $50", max: 50 },
  { value: "75", label: "Under $75", max: 75 },
  { value: "100", label: "Under $100", max: 100 },
];

