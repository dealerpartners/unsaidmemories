/** Author record rendered by this card (lib/lms/authors is not in this build). */
export interface CourseAuthor {
  name: string;
  title?: string;
  credentials?: string;
  bio?: string;
  expertise?: string[];
}

// Learner-facing author card: who wrote/taught this course, with
// their credentials, and whether the course is state-board approved.
// Renders only what the records actually carry — no author row, no
// card (the caller hides the section when authors is empty).
export function AuthorCard({ authors, stateBoardApproved }: {
  authors: CourseAuthor[];
  stateBoardApproved: boolean | null;
}) {
  if (!authors.length) return null;
  return (
    <section aria-label="Course authors" className="space-y-3">
      <h2 className="text-[14px] font-semibold">Taught by</h2>
      {stateBoardApproved && (
        <p className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[12px] font-semibold text-emerald-700">
          State board approved
        </p>
      )}
      {authors.map((a, i) => (
        <article key={`${a.name || 'author'}-${i}`} className="rounded-xl border border-border bg-card p-4">
          <p className="text-[14px] font-semibold">{a.name || 'Instructor'}</p>
          {a.title && <p className="text-[12px] text-muted-foreground">{a.title}</p>}
          {a.credentials && <p className="text-[12px] mt-1">Credentials: {a.credentials}</p>}
          {a.bio && <p className="text-[13px] mt-2 text-muted-foreground">{a.bio}</p>}
          {!!a.expertise?.length && (
            <p className="text-[12px] text-muted-foreground mt-2">
              Expertise: {a.expertise!.join(', ')}
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
