/**
 * Storefront FAQ — real answers about how THIS shop works.
 *
 * Grounding notes (checked against the codebase and the database,
 * 2026-10-30 — keep these true when editing):
 * - Checkout requires an account and takes card payment via Stripe
 *   (src/app/checkout/page.tsx, checkout-client.tsx).
 * - Every item is print-on-demand: payment is confirmed first, then
 *   a fulfillment order is created per supplier (Stripe webhook in
 *   src/app/api/webhooks/stripe/route.ts).
 * - Shipping is quoted live per supplier at checkout, before payment
 *   (src/app/api/shipping/estimates + shipping_profiles); the site
 *   advertises complimentary shipping on orders $75+.
 * - The refund policy on file (acct_refund_policies): 30-day window,
 *   no restocking fee; misprints and damage are always refunded in
 *   full; change-of-mind returns are accepted within 30 days.
 * - Tracking: a link is emailed when an order ships, and carrier +
 *   tracking show in the account order history
 *   (/api/customers/me/orders returns shipments).
 * - Mixed-supplier orders ship in separate packages (the cart's
 *   mixed-supplier notice is real behavior, not a warning fiction).
 */

export interface FaqEntry {
  category: string;
  question: string;
  answer: string[];
}

export const faqCategories = [
  "Ordering & payment",
  "Shipping & delivery",
  "Returns & refunds",
  "Designing & custom pieces",
  "Your account",
  "Getting help",
] as const;

export const faqEntries: FaqEntry[] = [
  {
    category: "Ordering & payment",
    question: "How do I place an order?",
    answer: [
      "Find something you love, add it to your bag, and head to checkout. Checkout asks you to sign in (or create a free account) so your order, tracking, and addresses all live in one place.",
      "You'll see the shipping cost for your exact items before you pay — nothing about the price changes after that screen.",
    ],
  },
  {
    category: "Ordering & payment",
    question: "How do I pay, and when is my card charged?",
    answer: [
      "We take card payment through Stripe, the same secure processor used by millions of stores. Your card is charged when you place the order.",
      "You can save a card to your account for next time — the card itself is kept by Stripe, never in our database.",
    ],
  },
  {
    category: "Ordering & payment",
    question: "What happens right after I order?",
    answer: [
      "As soon as your payment is confirmed, your order is sent to the maker for your items. Almost everything at UnSaid is made to order — printed or crafted for you after you buy it, rather than pulled off a shelf.",
      "You'll get a confirmation by email, and your order appears in your account with its status.",
    ],
  },
  {
    category: "Ordering & payment",
    question: "Can I change or cancel my order?",
    answer: [
      "Because items go into production soon after payment, changes are easiest in the first hours. Contact us right away with your order number and we'll do everything we can.",
      "If something can't be changed, our returns policy below still has you covered once it arrives.",
    ],
  },
  {
    category: "Shipping & delivery",
    question: "How much does shipping cost?",
    answer: [
      "Orders of $75 or more ship free. Below that, shipping is calculated at checkout from the live rates of the maker shipping your items, and you'll see the exact cost — and the delivery estimate — before you pay.",
    ],
  },
  {
    category: "Shipping & delivery",
    question: "How long will my order take?",
    answer: [
      "Each piece is made to order first, then shipped, so the total time is production plus delivery. Both depend on the item and its maker, which is why checkout shows a delivery estimate for your exact basket before you pay.",
      "As a rough guide, most pieces arrive within about two weeks of ordering; your checkout estimate is the number to trust.",
    ],
  },
  {
    category: "Shipping & delivery",
    question: "Why did my order arrive in more than one package?",
    answer: [
      "Different items are made by different specialist makers. When your basket spans more than one, each maker ships its pieces separately as they're ready — your account shows a tracking link for each package.",
    ],
  },
  {
    category: "Shipping & delivery",
    question: "How do I track my order?",
    answer: [
      "When your order ships, we email you a tracking link. You can also sign in and open your account — every order there shows its fulfillment status and, once shipped, the carrier and tracking number.",
    ],
  },
  {
    category: "Returns & refunds",
    question: "What is your returns policy?",
    answer: [
      "You have 30 days to change your mind. Returns within 30 days are accepted with no restocking fee — contact us with your order number and we'll walk you through it.",
    ],
  },
  {
    category: "Returns & refunds",
    question: "What if my order arrives damaged or misprinted?",
    answer: [
      "Then it's on us, always. A misprint, a defect, or damage in transit is refunded in full or replaced — that's guaranteed for every made-to-order piece, no time limit games.",
      "Send us a photo of the problem with your order number and we'll sort it out.",
    ],
  },
  {
    category: "Returns & refunds",
    question: "How do refunds reach me?",
    answer: [
      "Approved refunds go back to the card you paid with, through Stripe. Once we've approved it, your bank decides how many days it takes to land — usually a matter of days, not weeks.",
    ],
  },
  {
    category: "Designing & custom pieces",
    question: "How does designing my own piece work?",
    answer: [
      "In the Design Studio you choose a product, then add your words and artwork — upload a photo, pick from the art library, or describe a picture and let the studio create it. You arrange everything on the product, and the studio checks the print quality of your artwork before the design can be published, so what prints is crisp, not blurry.",
      "When you're happy, the design is saved with your order, and the maker prints from the print-ready file the studio produces.",
    ],
  },
  {
    category: "Designing & custom pieces",
    question: "Will my design print the way it looks on screen?",
    answer: [
      "The preview shows exactly where your artwork sits inside the printable area of the real product. The studio flags artwork that would print soft or blurry before you can order it, so there are no unwelcome surprises.",
      "Colors can shift very slightly between screen and fabric or ceramic — that's the nature of printing — but placement and scale are what you approved.",
    ],
  },
  {
    category: "Your account",
    question: "Do I need an account to shop?",
    answer: [
      "You can browse and fill a bag without one. At checkout we ask you to sign in or create a free account, so your orders, tracking, saved addresses, and payment methods are all kept together.",
      "If you filled a bag as a guest and then sign in, your bag comes with you — signing in never empties it.",
    ],
  },
  {
    category: "Your account",
    question: "Where do I find my orders, addresses, and cards?",
    answer: [
      "Sign in and tap Account at the top of any page. Your account page holds your order history with tracking, your saved addresses, and your payment methods — and the Account flyout at the top of the page gets you there in one tap.",
    ],
  },
  {
    category: "Getting help",
    question: "How do I reach a real person?",
    answer: [
      "Through our contact page — tell us what happened and include your order number if you have one. We reply within one business day, usually faster.",
      "If your question is about an order, signing in first helps us find it immediately.",
    ],
  },
];
