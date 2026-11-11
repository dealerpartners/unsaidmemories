// Shared catalog data for the UnSaid storefront.
// Imported by every route page + the site shell + product cards.

export type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  color: string;
  image: string;
  badge?: string;
  description: string;
  sizes: string[];
};

// 8 products (kept verbatim from the original home page).
export const products: Product[] = [
  { id: 1, name: "The Kin Keeper Tee", category: "Everyday essentials", price: 32, color: "Chalk", badge: "Bestseller", image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=85", description: "A considered everyday tee, made for the people who show up.", sizes: ["XS", "S", "M", "L", "XL", "2XL"] },
  { id: 2, name: "Chosen Family Crew", category: "Fleece & layers", price: 68, color: "Oat", image: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=85", description: "A soft, substantial layer for the ones you choose.", sizes: ["S", "M", "L", "XL", "2XL"] },
  { id: 3, name: "Day Ones Cap", category: "Accessories", price: 28, color: "Midnight", badge: "Just in", image: "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=900&q=85", description: "Low-key, everyday headwear with a little meaning built in.", sizes: ["One size"] },
  { id: 4, name: "Work Bestie Mug", category: "Objects with meaning", price: 24, color: "Cloud", image: "https://images.unsplash.com/photo-1514228742587-6b1558fdda3d?auto=format&fit=crop&w=900&q=85", description: "For the person who makes the long days lighter.", sizes: ["12 oz", "16 oz"] },
  { id: 5, name: "The Always Hoodie", category: "Fleece & layers", price: 74, color: "Heather grey", image: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=85", description: "An easy, elevated staple with room for what matters.", sizes: ["S", "M", "L", "XL", "2XL"] },
  { id: 6, name: "Little Reminder Tote", category: "Bags & carry", price: 26, color: "Natural", image: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=85", description: "A useful everyday carryall, made more personal.", sizes: ["One size"] },
  { id: 7, name: "Sister-Friend Long Sleeve", category: "Everyday essentials", price: 42, color: "Soft white", image: "https://images.unsplash.com/photo-1503341504253-dff4815485f1?auto=format&fit=crop&w=900&q=85", description: "A little sentiment, designed to live in your weekly rotation.", sizes: ["XS", "S", "M", "L", "XL"] },
  { id: 8, name: "Keep Close Print", category: "Home & keepsakes", price: 36, color: "Lilac / ink", image: "https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&w=900&q=85", description: "A quiet visual reminder of the people who make a place feel like home.", sizes: ["8 × 10", "11 × 14", "16 × 20"] },
];

// Categories derived from products — used by /shop/[category].
// The slug is the URL segment, the name matches Product.category exactly.
export const categories: { slug: string; name: string; description: string }[] = [
  { slug: "everyday-essentials", name: "Everyday essentials", description: "Considered everyday staples made to mean more." },
  { slug: "fleece-layers", name: "Fleece & layers", description: "Soft, substantial layers for the ones you choose." },
  { slug: "accessories", name: "Accessories", description: "Low-key, meaningful details." },
  { slug: "objects-with-meaning", name: "Objects with meaning", description: "Small reminders of the people who matter." },
  { slug: "bags-carry", name: "Bags & carry", description: "Everyday carryalls, made more personal." },
  { slug: "home-keepsakes", name: "Home & keepsakes", description: "Quiet visual reminders of home." },
];

// Departments — used by /departments and the department cards.
export const departments: { slug: string; number: string; title: string; em?: string; description: string; photo: string }[] = [
  { slug: "apparel", number: "01 / APPAREL", title: "Clothing, ", em: "considered.", description: "Elevated everyday layers for every version of you.", photo: "https://images.unsplash.com/photo-1516257984-b1b4d707412e?auto=format&fit=crop&w=900&q=85" },
  { slug: "home-and-living", number: "02 / HOME & LIVING", title: "Keep it ", em: "close.", description: "Objects that make the everyday feel a little more personal.", photo: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=900&q=85" },
  { slug: "keepsakes", number: "03 / GIFTS & OBJECTS", title: "Just because.", description: "No occasion required. The feeling is reason enough.", photo: "https://images.unsplash.com/photo-1513201099705-a9746e1e201f?auto=format&fit=crop&w=900&q=85" },
];

// Collections — used by /collections and /collections/[slug].
export const collections: { slug: string; label: string; title: string; photo: string; description: string }[] = [
  { slug: "day-ones", label: "01 / THE EVERYDAY ONES", title: "Day Ones", photo: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=85", description: "The ones who've been there from the start. Every day, every version." },
  { slug: "family-by-choice", label: "02 / THE FAMILY WE CHOOSE", title: "Family by Choice", photo: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=85", description: "Family isn't always given. Sometimes it's chosen, and that makes it no less real." },
  { slug: "just-because", label: "03 / NO REASON NEEDED", title: "Just Because", photo: "https://images.unsplash.com/photo-1523398002811-999ca8dec234?auto=format&fit=crop&w=900&q=85", description: "The best reasons are the ones you don't need." },
  { slug: "kin-keeper-month", label: "FEATURED", title: "Kin Keeper Month", photo: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=85", description: "A month for the heart of the family. Celebrate the kin keepers in your life." },
];

// Relationships — used by /relationships and /relationships/[slug].
export const relationships: { slug: string; number: string; name: string; tagline: string; description: string }[] = [
  { slug: "kin-keeper", number: "01 / CONNECTION", name: "Kin Keeper", tagline: "For the heart of the family", description: "For the one who holds it all together. The keeper of traditions, the maker of plans, the heart of every gathering." },
  { slug: "work-bestie", number: "02 / CONNECTION", name: "Work Bestie", tagline: "Better, together", description: "For the one who makes the long days lighter. The inside jokes, the shared coffee runs, the texts that just say 'this meeting could have been an email.'" },
  { slug: "chosen-family", number: "03 / CONNECTION", name: "Chosen Family", tagline: "Family by choice", description: "Family isn't always given. For the ones who chose you, and the ones you chose back." },
  { slug: "caregiver", number: "04 / CONNECTION", name: "Caregiver", tagline: "For the ones who care", description: "For the ones who show up, day after day, for someone who needs them. The quiet work of caring." },
  { slug: "mentor", number: "05 / CONNECTION", name: "Mentor", tagline: "For the ones who guide", description: "For the one who saw something in you before you saw it in yourself." },
  { slug: "godparent", number: "06 / CONNECTION", name: "Godparent", tagline: "A bond all your own", description: "A promise, a presence, a bond that's all its own." },
  { slug: "sister-friend", number: "07 / CONNECTION", name: "Sister-Friend", tagline: "Chosen and cherished", description: "The friend who became family. The sister you chose." },
  { slug: "ride-or-die", number: "08 / CONNECTION", name: "Ride or Die", tagline: "Always in your corner", description: "For the one who's been there through every version of you. No questions, no conditions." },
];

// Our-world articles — used by /our-world and /our-world/[slug].
export const ourWorldArticles: { slug: string; eyebrow: string; title: string; body: string[] }[] = [
  { slug: "how-it-works", eyebrow: "How it works", title: "A little more thought, by design.", body: ["Browse by relationship, by department, or by collection.", "Find something that feels like them — not just looks like them.", "Add a note. Make it yours. We'll handle the rest."] },
  { slug: "gift-finder", eyebrow: "Gift finder", title: "Find the right words.", body: ["Tell us who it's for.", "Tell us what they're like.", "We'll point you to something that feels right."] },
  { slug: "guides-stories", eyebrow: "Guides & stories", title: "Ideas, occasionally.", body: ["Considered guides for thoughtful moments.", "Stories from people who got it right.", "Inspiration without the noise."] },
  { slug: "our-story", eyebrow: "Our story", title: "We started with a feeling.", body: ["UnSaid began with a simple idea: some things are better felt than said.", "We design for the people who shape your world.", "Every piece is made to mean more."] },
  { slug: "the-memory-box", eyebrow: "Explore", title: "The Memory Box.", body: ["A way to keep the small things close.", "Photos, notes, moments — all in one place.", "Coming soon."] },
  { slug: "kinnectai", eyebrow: "Explore", title: "KinnectAI.", body: ["A little help finding the right words.", "Built for the moments that matter.", "Coming soon."] },
];

// Help articles — used by /help and /help/[slug].
export const helpArticles: { slug: string; title: string; question: string; answer: string[] }[] = [
  { slug: "contact-us", title: "Contact us", question: "How do I get in touch?", answer: ["The fastest way is the contact page — your message goes straight to our support team as a ticket, and you get a reference for it.", "We reply within one business day, usually faster."] },
  { slug: "faq", title: "FAQ", question: "Common questions, quick answers.", answer: ["Ordering, shipping, returns, designing — the questions we hear most, answered plainly.", "If you don't see yours, just reach out through the contact page."] },
  { slug: "shipping-returns", title: "Shipping & returns", question: "How long will my order take?", answer: ["Complimentary shipping on orders $75 and over; otherwise shipping is calculated at checkout from the live rates of the maker shipping your items.", "Everything is made to order first, then shipped — checkout shows a delivery estimate for your exact basket before you pay.", "Returns are accepted within 30 days with no restocking fee, and misprints or damage are always refunded in full."] },
  { slug: "track-your-order", title: "Track your order", question: "Where is my order?", answer: ["Once your order ships, you'll get a tracking link by email.", "Tracking is also available in your account — sign in, open Account, and every order shows its status, carrier, and tracking number."] },
  { slug: "size-guide", title: "Size guide", question: "How does it fit?", answer: ["Our apparel runs true to size.", "When in doubt, size up for a relaxed fit, size down for a closer fit.", "Mugs and drinkware are sized in fluid ounces."] },
  { slug: "login", title: "Login", question: "Access your account.", answer: ["Tap Account at the top of any page to sign in right where you are — your bag, your place on the page, and any checkout in progress all stay exactly as they were.", "Signed in, your account holds your orders and tracking, saved addresses, and payment methods."] },
  { slug: "accessibility", title: "Accessibility", question: "Using this shop, comfortably.", answer: ["We want everyone to be able to gather, preserve and share their stories here. The shop is built to work with keyboards and screen readers: pages have clear headings, images carry descriptions, and interactive elements can be reached and used without a mouse.", "Text is set in sizes and contrasts chosen to stay readable, and the layout adapts from large screens down to a phone without hiding content.", "If anything here is hard to use — a page you cannot read, a form you cannot complete, a step that only works one way — please tell us through the contact page. Accessibility reports go to the same support team as everything else, and we will help you complete whatever you were trying to do while we fix the barrier.", "We review accessibility as the shop changes, and we treat a barrier you report as a bug, not a suggestion."] },
];

// Mega menu config — Shop = the store's top-level departments across
// 4 columns (no nested children; each link routes straight to the
// department page). The 4-column layout + arrow icons render via the
// existing `.mega-groups` CSS. Every href below is a path in the
// store's own category tree (src/lib/taxonomy-data.ts, generated from
// the `categories` table on every deploy).
export const menus: Record<string, { eyebrow: string; groups: { title: string; links: { label: string; href: string }[] }[]; feature: string; cta: { label: string; href: string } }> = {
  Shop: {
    eyebrow: "Shop all departments",
    groups: [
      { title: "Apparel & Carry", links: [
        { label: "Apparel", href: "/shop/apparel" },
        { label: "Accessories", href: "/shop/accessories" },
        { label: "Headwear", href: "/shop/headwear" },
        { label: "Children", href: "/shop/children" },
      ] },
      { title: "Art & Decor", links: [
        { label: "Wall Art", href: "/shop/wall-art-2" },
        { label: "Home & Living", href: "/shop/home-and-living" },
        { label: "Wellness", href: "/shop/wellness" },
      ] },
      { title: "Everyday", links: [
        { label: "Drinkware", href: "/shop/drinkware" },
        { label: "Technology", href: "/shop/technology" },
        { label: "Games & Puzzles", href: "/shop/games" },
      ] },
      { title: "Paper, Gifting & Business", links: [
        { label: "Cards & stationery", href: "/shop/cards-stationery" },
        { label: "Keepsakes", href: "/shop/keepsakes" },
        { label: "Collections & Occasions", href: "/shop/collections-occasions" },
        { label: "Business & commercial", href: "/shop/business-commercial" },
      ] },
    ],
    feature: "Thoughtful things. Everyday meaning.",
    cta: { label: "See all shop", href: "/shop" },
  },
  Relationships: {
    eyebrow: "For the people who make life life",
    groups: [
      { title: "Your people", links: [
        { label: "Kin Keeper", href: "/relationships/kin-keeper" },
        { label: "Work Bestie", href: "/relationships/work-bestie" },
        { label: "Chosen family", href: "/relationships/chosen-family" },
        { label: "Caregiver", href: "/relationships/caregiver" },
      ] },
      { title: "The ones who guide us", links: [
        { label: "Mentor", href: "/relationships/mentor" },
        { label: "Godparent", href: "/relationships/godparent" },
        { label: "Sister-Friend", href: "/relationships/sister-friend" },
        { label: "Ride or Die", href: "/collections/ride-or-die" },
      ] },
      { title: "Shop by feeling", links: [
        { label: "I see you", href: "/collections/i-see-you" },
        { label: "Thank you for showing up", href: "/collections/thank-you-for-showing-up" },
        { label: "Just because", href: "/collections/just-because" },
        { label: "A little encouragement", href: "/collections/a-little-encouragement" },
      ] },
      { title: "Explore", links: [
        { label: "Shop all relationships", href: "/relationships" },
      ] },
    ],
    feature: "The right words, when they matter.",
    cta: { label: "See all relationships", href: "/relationships" },
  },
  Collections: {
    eyebrow: "Made for your kind of connection",
    groups: [
      { title: "Featured collections", links: [
        { label: "Kin Keeper Month", href: "/collections/kin-keeper-month" },
        { label: "Family by Choice", href: "/collections/family-by-choice" },
        { label: "Just Because", href: "/collections/just-because" },
        { label: "Day Ones", href: "/collections/day-ones" },
      ] },
      { title: "Seasonal edits", links: [
        { label: "UnSaid Holidays", href: "/shop/collections-occasions/unsaid-holidays" },
        { label: "Celebration moments", href: "/shop/cards-stationery/celebrations" },
        { label: "New season, new meaning", href: "/collections/new-seasons" },
        { label: "Gift-ready bundles", href: "/shop/keepsakes/bundles" },
      ] },
      { title: "Explore", links: [
        { label: "Shop all collections", href: "/collections" },
      ] },
    ],
    feature: "Every relationship deserves its own language.",
    cta: { label: "See all collections", href: "/collections" },
  },
  "Our world": {
    eyebrow: "More than a gift",
    groups: [
      { title: "Discover", links: [
        { label: "How it works", href: "/how-it-works" },
        { label: "Gift finder", href: "/gift-finder" },
        { label: "Guides & stories", href: "/guides-stories" },
        { label: "Our story", href: "/our-story" },
      ] },
      { title: "Explore", links: [
        { label: "The Memory Box", href: "/our-world/the-memory-box" },
        { label: "KinnectAI", href: "/kinnectai" },
        { label: "Community partnerships", href: "/our-world" },
        { label: "Corporate gifting", href: "/corporate-gifting" },
        { label: "Learn more about our world", href: "/our-world" },
      ] },
    ],
    feature: "A little more thought, in everything.",
    cta: { label: "See all our world", href: "/our-world" },
  },
};

// Helper lookups for dynamic routes.
export function findCategory(slug: string) {
  return categories.find((c) => c.slug === slug);
}
export function findDepartment(slug: string) {
  return departments.find((d) => d.slug === slug);
}
export function findCollection(slug: string) {
  return collections.find((c) => c.slug === slug);
}
export function findRelationship(slug: string) {
  return relationships.find((r) => r.slug === slug);
}
export function findOurWorldArticle(slug: string) {
  return ourWorldArticles.find((a) => a.slug === slug);
}
export function findHelpArticle(slug: string) {
  return helpArticles.find((a) => a.slug === slug);
}
export function productsByCategoryName(name: string) {
  return products.filter((p) => p.category === name);
}
