import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { hcAdminDocs } from "@/lib/help-center/data";
import { HCDocumentBody } from "@/components/help-center/body";

type Params = { article: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { article } = await params;
  const doc = hcAdminDocs().find((d) => d.slug === article);
  return {
    title: doc ? `${doc.title} | Admin Guides | UnSaid Memories` : "Admin Guides | UnSaid Memories",
    description: doc ? `${doc.title}: an admin operating guide.` : "Admin operating guides.",
  };
}

export default async function AdminGuidePage({ params }: { params: Promise<Params> }) {
  const { article } = await params;
  const docs = hcAdminDocs();
  const i = docs.findIndex((d) => d.slug === article);
  if (i === -1) notFound();
  const doc = docs[i];
  const prev = docs[i - 1];
  const next = docs[i + 1];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <article className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">{doc.title}</h1>

        <div className="mt-6">
          <HCDocumentBody body={doc.body.replace(/^\s*#[^\n]*\n+/, "")} tone="portal" />
        </div>

        <div className="mt-12 grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
          {prev ? (
            <Link
              href={`/admin/docs/guides/${prev.slug}`}
              className="border border-border p-3 transition-colors hover:bg-muted/60"
            >
              <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground">
                Previous
              </p>
              <p className="mt-1 text-sm font-medium">{prev.title}</p>
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
          {next ? (
            <Link
              href={`/admin/docs/guides/${next.slug}`}
              className="border border-border p-3 text-right transition-colors hover:bg-muted/60"
            >
              <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-muted-foreground">
                Next
              </p>
              <p className="mt-1 text-sm font-medium">{next.title}</p>
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>
      </article>
    </div>
  );
}
