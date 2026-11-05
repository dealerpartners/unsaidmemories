import type { Metadata } from "next";
import { Suspense } from "react";
import { PostsSection } from "../account-sections";

export const metadata: Metadata = { title: "My posts — UnSaid" };

export default function AccountPostsPage() {
  return (
    <Suspense fallback={<p className="ua-mut">Loading your posts…</p>}>
      <PostsSection />
    </Suspense>
  );
}
