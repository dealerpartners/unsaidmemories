// Client-side nav model — the core business flow + learning as item 11.
export const NAV = [
  { n: "01", label: "HOME", to: "/" },
  { n: "02", label: "ABOUT US", to: "/about" },
  { n: "03", label: "SERVICES", to: "/services" },
  { n: "04", label: "OUR PROCESS", to: "/process" },
  { n: "05", label: "PRICING", to: "/pricing" },
  { n: "06", label: "SHOP", to: "/shop" },
  { n: "07", label: "GALLERY", to: "/gallery" },
  { n: "08", label: "BOOK", to: "/book" },
  { n: "09", label: "CONTACT", to: "/docs/help/contact/contact-us" },
  { n: "10", label: "FAQ / POLICIES", to: "/help" },
  { n: "11", label: "LEARN", to: "/learn" },
] as const

export type Route = (typeof NAV)[number]["to"]
