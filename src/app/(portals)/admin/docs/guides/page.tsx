import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, ChevronRight } from "lucide-react";
import { hcAdminDocs } from "@/lib/help-center/data";

export const metadata: Metadata = {
  title: "Admin Guides | Document Center | UnSaid Memories",
  description:
    "Operating guides for the admin team: the admin portal, marketplace operations and regulatory compliance duties.",
};

// Admin guides live INSIDE the admin portal (the owner's separation): the
// public Help Center and the Staff Operations center never surface them.
export default function AdminGuidesPage() {
  const docs = hcAdminDocs();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Admin Guides</h1>
      </div>

      <div className="mt-8 divide-y divide-border border-y border-border">
        {docs.map((d) => (
          <Link
            key={d.slug}
            href={`/admin/docs/guides/${d.slug}`}
            className="group flex w-full items-center justify-between gap-4 py-4 text-left"
          >
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold text-foreground transition-colors group-hover:text-primary">
                {d.title}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {d.sectionTitle}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
        {!docs.length && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground/40" strokeWidth={1.6} />
            <p className="text-sm text-muted-foreground">No guides published yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
