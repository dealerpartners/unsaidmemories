/**
 * The store's legal documents — the dedicated /legal routes.
 *
 * Content rule (owner order, 2026-11-03): these are adapted from the
 * STORE'S OWN published rules — the terms and privacy notes the shop
 * already showed in help, the FAQ's operational facts (free shipping
 * at $75, live maker rates at checkout, made-to-order production, the
 * 30-day returns promise), and nothing else. Not the AAPawZ corpus:
 * this is a made-to-order store, and the documents say only what this
 * store actually does.
 */

export type LegalSection = {
  heading: string;
  paras: string[];
};

export type LegalDoc = {
  slug: string;
  title: string;
  summary: string;
  sections: LegalSection[];
};

export const legalDocs: LegalDoc[] = [
  {
    slug: "terms-of-service",
    title: "Terms of Service",
    summary: "The terms every order runs on — made to order, priced in dollars, and backed end to end by Unsaid Memories.",
    sections: [
      {
        heading: "Made to order, by contract with us",
        paras: [
          "Everything here is made to order. When you place an order, our maker partners produce your pieces and ship them to the address you give at checkout; your contract is with Unsaid Memories, and we stay responsible for your order end to end.",
        ],
      },
      {
        heading: "Prices and payment",
        paras: [
          "Prices are shown in US dollars and confirmed at checkout, including the shipping quoted for your basket. Orders of $75 or more ship free.",
          "Payment is taken securely through our payment provider when you check out; your order is confirmed once payment succeeds. Your card details never touch our database.",
        ],
      },
      {
        heading: "Delivery estimates",
        paras: [
          "Because pieces are made for you, delivery estimates are exactly that — estimates. The delivery option you choose at checkout shows the window for your basket, and your confirmation email carries your order reference for tracking.",
        ],
      },
      {
        heading: "If something arrives wrong",
        paras: [
          "If something arrives wrong — a misprint, damage, or a defect — tell us within 30 days and we will refund or replace it in full, personalised pieces included. Change-of-mind returns are accepted within 30 days with no restocking fee, as our refunds and returns policy sets out.",
        ],
      },
      {
        heading: "Your designs",
        paras: [
          "Designs you create in the studio stay yours. By publishing a design to a product you give us the licence we need to make and sell that product; you are responsible for having the rights to anything you upload.",
        ],
      },
      {
        heading: "Changes to these terms",
        paras: [
          "These terms can change as the shop grows; the version in place when you order is the one that applies to that order.",
        ],
      },
    ],
  },
  {
    slug: "terms-of-use",
    title: "Terms of Use",
    summary: "The rules for using this site, the studio, and your account.",
    sections: [
      {
        heading: "Your account",
        paras: [
          "You are responsible for the activity on your account and for keeping your sign-in details to yourself. One account is yours alone — advertising and selling privileges, where they are switched on, attach to that same account.",
          "Every account verifies a mobile phone number. That check keeps fake accounts out and protects your orders; it happens once, when the account is new, and again only if the number changes.",
        ],
      },
      {
        heading: "What you upload",
        paras: [
          "You may only upload photographs, artwork, and text you have the right to use. By placing content in the studio you confirm those rights, and you give us the licence we need to make and deliver the products you order with it.",
          "Content that is unlawful, infringing, or abusive does not belong here and may be removed; orders built on it may be refused.",
        ],
      },
      {
        heading: "Fair use of the site",
        paras: [
          "Do not misuse the site: no automated scraping, no attempts to reach other customers' accounts or orders, no interference with checkout or payments. We may suspend an account that puts other customers or the store at risk.",
        ],
      },
    ],
  },
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    summary: "What we collect, and why — only what the shop needs to work.",
    sections: [
      {
        heading: "What we keep",
        paras: [
          "We keep only what the shop needs to work: your account details, your orders, and the addresses you save, so we can take payment, make your pieces, and deliver them.",
          "When you verify your phone, we keep the number and the fact that it was verified — it is part of keeping your account yours.",
        ],
      },
      {
        heading: "Cookies",
        paras: [
          "A few small cookies keep the shop running — one keeps you signed in, one remembers your bag between visits, and one remembers the cookie choice you made in our cookie notice. If you allow it, we also use analytics cookies to understand which pages people visit, so we can make the shop better.",
          "You can shop and check out the same way whether you accept cookies or not — declining simply means we skip the analytics.",
        ],
      },
      {
        heading: "Your card details",
        paras: [
          "Your card details are handled by our payment provider and never touch our database. For saved cards we only keep a note of the brand and last four digits so you can recognise them.",
        ],
      },
      {
        heading: "Your choices",
        paras: [
          "Your account page holds your details, your saved addresses, and your communication preferences. If anything we hold about you looks wrong, contact us through the contact page and we will put it right.",
        ],
      },
    ],
  },
  {
    slug: "accessibility",
    title: "Accessibility",
    summary: "How this store is built to be usable by everyone, and how to reach a person if any part of it gets in your way.",
    sections: [
      {
        heading: "Our commitment",
        paras: [
          "Unsaid Memories is built to be usable by everyone, including people who browse with assistive technology. Pages are written in plain, semantic markup with real headings and text — nothing important lives only inside a picture — and the store is designed to be read and navigated in the order it is presented.",
        ],
      },
      {
        heading: "What is in place",
        paras: [
          "Product photography carries text descriptions, controls are reachable and operable from a keyboard, and text is set at readable sizes and contrast throughout the store. Videos and moving content are kept to a minimum, and the checkout can be completed without a mouse.",
          "Help and policy documents — this page included — are published as ordinary web pages in the Help Center, not as downloads or images of text, so they can be read by any browser or screen reader.",
        ],
      },
      {
        heading: "If something gets in your way",
        paras: [
          "If any part of the store is hard for you to use, tell us through the contact page or at support@unsaidmemories.com and we will help you complete whatever you were doing — including placing an order — and fix the barrier where we can. We reply within one business day.",
        ],
      },
    ],
  },
  {
    slug: "shipping-delivery",
    title: "Shipping & Delivery",
    summary: "How shipping is priced, when pieces are made, and how delivery works.",
    sections: [
      {
        heading: "What shipping costs",
        paras: [
          "Every item's price already includes a standard shipping allowance for that item, so standard delivery is never a separate charge added on top. When you enter your ZIP code, we compare the real cost of delivering to you with that allowance: if delivery comes in under the allowance, the difference shows in your favor as a reduced shipping rate; if it comes in over, only the difference is added. Either way you will see the exact figures — and the delivery estimate — before you pay, and the item's price never changes after that screen.",
        ],
      },
      {
        heading: "Made to order first",
        paras: [
          "Almost everything at UnSaid is made to order — printed or crafted for you after you buy it, rather than pulled off a shelf. As soon as your payment is confirmed, your order is sent to the maker for your items, and production time is part of the delivery estimate you saw at checkout.",
        ],
      },
      {
        heading: "Tracking and packages",
        paras: [
          "When your order ships, a tracking link is emailed to you, and the shipment appears in your account. Items made by different makers travel in separate packages, each with its own tracking — a basket can arrive as more than one delivery.",
          "Keep your order confirmation and reference. If you need help with a delivery, share the order number and the email used at checkout through the contact page.",
        ],
      },
    ],
  },
  {
    slug: "refunds-returns",
    title: "Refunds & Returns",
    summary: "Thirty days, in plain terms: wrong, damaged, or defective is refunded or replaced in full — and change of mind is welcome too.",
    sections: [
      {
        heading: "If something arrives wrong",
        paras: [
          "If something arrives wrong — a misprint, damage in transit, or a defect — tell us within 30 days of delivery and we will refund or replace it in full. That promise covers personalised pieces exactly the same as standard ones.",
          "Contact us through the contact page with your order number, keep the packaging until the issue is resolved, and take clear photographs of the damage or the item received — they help us put it right quickly.",
        ],
      },
      {
        heading: "Change of mind",
        paras: [
          "Changed your mind? Returns are accepted within 30 days of delivery, with no restocking fee. Contact us first with your order number and we will tell you where to send the item; it should come back in the condition it arrived in.",
        ],
      },
      {
        heading: "How refunds are paid",
        paras: [
          "Refunds go back to the original payment method. Once a return or a replacement decision is confirmed, the refund is issued from our side without you needing to chase it, and your confirmation follows by email.",
        ],
      },
    ],
  },
  {
    slug: "order-cancellations",
    title: "Order Cancellations",
    summary: "Production starts soon after payment — here is how changes and cancellations work.",
    sections: [
      {
        heading: "The production clock",
        paras: [
          "Because items go into production soon after payment, changes are easiest in the first hours after you order. Contact us right away with your order number and we will do everything we can.",
        ],
      },
      {
        heading: "Once production has started",
        paras: [
          "Once a piece is in production it usually cannot be stopped — it is being made for you. If something can't be changed or cancelled, our refunds and returns policy still has you covered once it arrives: wrong, damaged, or defective is refunded or replaced in full, and change-of-mind returns run for 30 days.",
        ],
      },
    ],
  },
];

export function findLegalDoc(slug: string): LegalDoc | null {
  return legalDocs.find((d) => d.slug === slug) ?? null;
}
