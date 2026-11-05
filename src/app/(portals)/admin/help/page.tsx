import type { Metadata } from "next";
import HelpHome from "./help-home";

export const metadata: Metadata = { title: "Help Center — Admin" };
export const dynamic = "force-dynamic";

// Help Center home (owner's design): guided tours, popular tutorials and
// every topic, all linking to the real /admin/help/[slug] articles.
export default function HelpPage() {
  return <HelpHome />;
}
