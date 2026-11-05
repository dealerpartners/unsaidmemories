'use client';

// ============================================================================
// Learning Center section pages — the pages behind the classroom canvas
// components (Customer Portal Tree §6.16). The canvas carries the
// components in one surface; each dock destination also has a real page
// here in the customer portal, on the portal design system, fed by
// GET /api/customer/learn/sections (learner-scoped, real lms rows,
// honest empty states — the LMS data is thin today, and the pages say
// so rather than dressing up samples).
// ============================================================================

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FolderOpen,
  GraduationCap,
  HelpCircle,
  History,
  House,
  Layers,
  Library,
  MessageSquare,
  Mic,
  NotebookPen,
  Search,
  Share2,
  StickyNote,
  Trophy,
  Video,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export interface LearnSectionDef {
  key: string;
  label: string;
  href: string;
  icon: typeof House;
  blurb: string;
}

// The §6.16.1.2 bottom dock, as portal pages. Home is /customer/learn.
export const LEARN_SECTIONS: LearnSectionDef[] = [
  { key: 'home', label: 'Home', href: '/customer/learn', icon: House, blurb: 'Your courses, progress, and catalog' },
  { key: 'lessons', label: 'Lessons', href: '/customer/learn/lessons', icon: BookOpen, blurb: 'Every lesson in your enrolled courses' },
  { key: 'assignments', label: 'Assignments', href: '/customer/learn/assignments', icon: ClipboardList, blurb: 'Work your courses have assigned' },
  { key: 'quizzes', label: 'Quizzes', href: '/customer/learn/quizzes', icon: HelpCircle, blurb: 'Checks and your attempts so far' },
  { key: 'grades', label: 'Grades', href: '/customer/learn/grades', icon: Trophy, blurb: 'Your grade book — scores and feedback' },
  { key: 'notes', label: 'Notes', href: '/customer/learn/notes', icon: StickyNote, blurb: 'Notes you have kept while learning' },
  { key: 'books', label: 'Books / Reads', href: '/customer/learn/books', icon: Library, blurb: 'Reading lists and reading progress' },
  { key: 'calendar', label: 'Calendar', href: '/customer/learn/calendar', icon: CalendarDays, blurb: 'Live sessions and cohort events' },
  { key: 'messages', label: 'Messages', href: '/customer/learn/messages', icon: MessageSquare, blurb: 'School messages and conversations' },
  { key: 'files', label: 'Files / Uploads', href: '/customer/learn/files', icon: FolderOpen, blurb: 'Files you have uploaded' },
  { key: 'notebook', label: 'Notebook', href: '/customer/learn/notebook', icon: NotebookPen, blurb: 'Your notebook sections and pages' },
  { key: 'media', label: 'Media', href: '/customer/learn/media', icon: Layers, blurb: 'Published course media' },
  { key: 'meet', label: 'Meet', href: '/customer/learn/meet', icon: Video, blurb: 'Live sessions for your courses' },
  { key: 'share', label: 'Share', href: '/customer/learn/share', icon: Share2, blurb: 'Your share links and study groups' },
  { key: 'more', label: 'More', href: '/customer/learn/more', icon: GraduationCap, blurb: 'Tools, settings, and help' },
];

export function LearnSectionNav({ active }: { active: string }) {
  return (
    <nav aria-label="Learning Center sections" className="flex flex-wrap gap-1.5">
      {LEARN_SECTIONS.map((s) => {
        const Icon = s.icon;
        const isActive = s.key === active;
        return (
          <Link
            key={s.key}
            href={s.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors',
              isActive
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function useLearnSection<T = any>(section: string) {
  const [data, setData] = useState<T | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/customer/learn/sections?section=${encodeURIComponent(section)}`)
      .then(async (r) => {
        if (r.status === 401) {
          setUnauthorized(true);
          return null;
        }
        if (!r.ok) {
          setPageError('Could not load this page right now.');
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (!d) return;
        setData(d as T);
        setPageError(null);
      })
      .catch(() => setPageError('Could not load this page right now.'));
  }, [section]);

  useEffect(() => {
    load();
  }, [load]);

  const loading = data === null && !unauthorized && !pageError;
  return { data, unauthorized, pageError, loading, reload: load };
}

export function LearnSectionShell({
  active,
  title,
  intro,
  children,
}: {
  active: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6 md:p-8">
      <div>
        <Link
          href="/customer/learn"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary underline-offset-2 hover:underline"
        >
          <ArrowLeft className="size-3.5" />
          My Learning
        </Link>
        <p className="mt-3 text-[10.5px] font-bold uppercase tracking-[0.22em] text-primary">
          Learning Center
        </p>
        <h1 className="mt-1.5 text-[28px] font-semibold leading-tight text-foreground">
          {title}
        </h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">{intro}</p>
      </div>
      <LearnSectionNav active={active} />
      <LearnShellBar />
      <LearnRightRail />
      {children}
    </div>
  );
}

export function LearnSectionStates({
  unauthorized,
  pageError,
  loading,
  onRetry,
}: {
  unauthorized: boolean;
  pageError: string | null;
  loading: boolean;
  onRetry: () => void;
}) {
  if (unauthorized) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted">
          <GraduationCap className="size-7 text-primary" />
        </div>
        <h2 className="mt-4 text-[20px] font-semibold text-foreground">
          Sign in to open your classroom
        </h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
          Your session has expired. Sign in again to see your learning.
        </p>
        <Button
          asChild
          className="mt-5 h-10 rounded-lg px-5 text-[12px] font-bold uppercase tracking-[0.12em]"
        >
          <Link href="/access-customer">Sign in</Link>
        </Button>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }
  if (pageError) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto size-7 text-warning" />
        <p className="mt-3 text-[14px] font-medium text-foreground">{pageError}</p>
        <Button
          variant="outline"
          onClick={onRetry}
          className="mt-4 h-10 rounded-lg text-[12px] font-semibold"
        >
          Try again
        </Button>
      </div>
    );
  }
  return null;
}

export function LearnEmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof House;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted">
        <Icon className="size-7 text-primary" />
      </div>
      <h2 className="mt-4 text-[18px] font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
        {children}
      </p>
    </div>
  );
}

export const prettyDateTime = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const prettyDate = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// ============================================================================
// Learn shell (§6.16.1) — the top bar and right rail every Learn page
// carries, fed by GET /api/customer/learn/shell + /search (real lms
// rows, learner-scoped). Top bar: learner profile chip, course/subject
// selector, live search (courses + enrolled lessons) with voice input
// where the browser offers it. Right rail: the learner's live
// lms.quick_actions and a recent-activity feed merged from their
// enrollments, lesson progress, submissions, and quiz attempts, with
// kind filter pills. Empty stores render honest empty text — the rail
// never invents actions or activity.
// ============================================================================

interface ShellCourse {
  id: string;
  title: string;
  code: string | null;
  category: string | null;
  enrolled: boolean;
}

interface ShellAction {
  id: string;
  label: string;
  actionType: string | null;
  targetUrl: string | null;
}

interface ShellActivity {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  at: string | null;
  href: string;
}

interface ShellPayload {
  learner: { name: string | null; preferredName: string | null; avatarUrl: string | null };
  courses: ShellCourse[];
  subjects: string[];
  quickActions: ShellAction[];
  activity: ShellActivity[];
}

interface SearchPayload {
  courses: { id: string; title: string; code: string | null; category: string | null; href: string }[];
  lessons: { id: string; title: string; courseTitle: string | null; href: string }[];
}

function useLearnShell() {
  const [shell, setShell] = useState<ShellPayload | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/customer/learn/shell')
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (live && d && !d.error) setShell(d as ShellPayload);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return shell;
}

export function LearnShellBar() {
  const shell = useLearnShell();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchPayload | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const debounceRef = useRef<number | null>(null);

  const runSearch = useCallback((q: string) => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    fetch(`/api/customer/learn/search?q=${encodeURIComponent(q.trim())}`)
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !d.error) {
          setResults(d as SearchPayload);
          setSearchOpen(true);
        }
      })
      .catch(() => undefined);
  }, []);

  const onQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => runSearch(value), 250);
  };

  const startVoice = () => {
    const w = window as unknown as Record<string, unknown>;
    const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as
      | (new () => {
          lang: string;
          onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
          onend: (() => void) | null;
          onerror: (() => void) | null;
          start: () => void;
        })
      | undefined;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.onresult = (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript || '';
      if (transcript) {
        setQuery(transcript);
        runSearch(transcript);
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  };

  const voiceSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const learnerName = shell?.learner?.preferredName || shell?.learner?.name || null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
      <span className="inline-flex min-w-0 items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10">
          {shell?.learner?.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shell.learner.avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            <GraduationCap className="size-4 text-primary" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold text-foreground">
            {learnerName || 'Learner'}
          </span>
          <span className="block text-[11px] text-muted-foreground">Learning Center</span>
        </span>
      </span>

      <span className="relative min-w-52 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onFocus={() => results && setSearchOpen(true)}
              onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
              placeholder="Search courses and lessons…"
              aria-label="Search Learn"
              className="h-9.5 w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-[13px] outline-none focus:border-primary"
            />
          </span>
          {voiceSupported && (
            <button
              onClick={startVoice}
              aria-pressed={listening}
              aria-label="Voice search"
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors',
                listening ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              <Mic className="size-4" />
            </button>
          )}
        </span>
        {searchOpen && results && (
          <span className="absolute inset-x-0 top-full z-30 mt-1.5 block max-h-80 overflow-y-auto rounded-xl border bg-card p-2 shadow-lg">
            {results.courses.length === 0 && results.lessons.length === 0 && (
              <span className="block px-3 py-2 text-[12.5px] text-muted-foreground">
                No courses or lessons match that search.
              </span>
            )}
            {results.courses.map((c) => (
              <Link
                key={`c-${c.id}`}
                href={c.href}
                className="block rounded-lg px-3 py-2 transition-colors hover:bg-muted"
              >
                <span className="block text-[13px] font-semibold text-foreground">{c.title}</span>
                <span className="block text-[11.5px] text-muted-foreground">
                  Course{c.category ? ` · ${c.category}` : ''}
                </span>
              </Link>
            ))}
            {results.lessons.map((l) => (
              <Link
                key={`l-${l.id}`}
                href={l.href}
                className="block rounded-lg px-3 py-2 transition-colors hover:bg-muted"
              >
                <span className="block text-[13px] font-semibold text-foreground">{l.title}</span>
                <span className="block text-[11.5px] text-muted-foreground">
                  Lesson{l.courseTitle ? ` · ${l.courseTitle}` : ''}
                </span>
              </Link>
            ))}
          </span>
        )}
      </span>

      {shell && shell.courses.length > 0 && (
        <select
          aria-label="Jump to a course"
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) window.location.assign(e.target.value);
          }}
          className="h-9.5 max-w-56 rounded-lg border bg-background px-2.5 py-2 text-[12.5px] font-medium outline-none focus:border-primary"
        >
          <option value="" disabled>
            Courses &amp; subjects…
          </option>
          {shell.courses.map((c) => (
            <option key={c.id} value="/customer/learn">
              {c.title}
              {c.enrolled ? ' — enrolled' : ''}
            </option>
          ))}
          {shell.subjects.map((s) => (
            <option key={`s-${s}`} value="/customer/learn">
              Subject: {s}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

const ACTIVITY_FILTERS: { key: string; label: string; kinds: string[] | null }[] = [
  { key: 'all', label: 'All', kinds: null },
  { key: 'lesson', label: 'Lessons', kinds: ['lesson', 'enrollment'] },
  { key: 'submission', label: 'Assignments', kinds: ['submission'] },
  { key: 'quiz', label: 'Quizzes', kinds: ['quiz'] },
];

export function LearnRightRail() {
  const shell = useLearnShell();
  const [filter, setFilter] = useState('all');
  if (!shell) return null;
  const activeFilter = ACTIVITY_FILTERS.find((f) => f.key === filter) ?? ACTIVITY_FILTERS[0];
  const activity = activeFilter.kinds
    ? shell.activity.filter((a) => activeFilter.kinds?.includes(a.kind))
    : shell.activity;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-label="Quick actions" className="rounded-xl border bg-card p-4 shadow-sm">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
          <Zap className="size-4 text-primary" /> Quick actions
        </h2>
        {shell.quickActions.length === 0 ? (
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            No quick actions are set up for your account yet. Actions your
            school adds will appear here.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {shell.quickActions.map((a) =>
              a.targetUrl ? (
                <Link
                  key={a.id}
                  href={a.targetUrl}
                  className="rounded-full border px-3 py-1.5 text-[12px] font-semibold text-foreground transition-colors hover:border-primary/60"
                >
                  {a.label}
                </Link>
              ) : (
                <span key={a.id} className="rounded-full border px-3 py-1.5 text-[12px] font-semibold text-muted-foreground">
                  {a.label}
                </span>
              ),
            )}
          </div>
        )}
      </section>

      <section aria-label="Recent activity" className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
            <History className="size-4 text-primary" /> Recent activity
          </h2>
          <span className="flex gap-1">
            {ACTIVITY_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors',
                  filter === f.key
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </span>
        </div>
        {activity.length === 0 ? (
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            No learning activity yet. Lessons you open, work you turn in,
            and quizzes you take will show up here.
          </p>
        ) : (
          <ol className="mt-3 space-y-2">
            {activity.slice(0, 8).map((a) => (
              <li key={a.id}>
                <Link href={a.href} className="flex items-baseline justify-between gap-3 rounded-lg px-1 py-0.5 transition-colors hover:bg-muted/60">
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-medium text-foreground">{a.title}</span>
                    {a.detail && <span className="block text-[11.5px] text-muted-foreground">{a.detail}</span>}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {prettyDate(a.at)}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
