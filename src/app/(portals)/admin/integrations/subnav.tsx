import Link from "next/link";

const LINKS = [
  { href: "/admin/integrations", label: "Overview", tip: "Connection health at a glance — is everything plugged in and working?" },
  { href: "/admin/integrations/connections", label: "Connections & Keys", tip: "Where your secret keys live — Stripe, your suppliers, and your trackers. Paste a key, press Save, done." },
  { href: "/admin/integrations/social", label: "Social accounts", tip: "Connect your Facebook, Instagram, TikTok and other accounts so posts can go out for you." },
  { href: "/admin/integrations/calendar", label: "Calendar & queue", tip: "Social posts you've scheduled, shown on a calendar, with what's still waiting to go out." },
  { href: "/admin/integrations/share", label: "Share a product", tip: "Pick a product and turn it into a social post in a few clicks." },
  { href: "/admin/integrations/partners", label: "Partner portals", tip: "Other websites that can receive your product shares and feeds." },
];

export default function Subnav() {
  return (
    <nav className="int-subnav">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} data-tip={l.tip}>{l.label}</Link>
      ))}
    </nav>
  );
}
