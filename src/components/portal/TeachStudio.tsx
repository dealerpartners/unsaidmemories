'use client';

import { useCallback, useEffect, useState } from 'react';

// Teach studio — the vet/contributor authoring door (courses →
// modules → lessons → blocks → quizzes, plus contributor invites).
// It rides ONLY the vet Teach APIs (/api/vet/teach/*), gated by
// instructor / vet-roster / accepted-contributor status — never by
// admin scope — and it can never publish: drafts stay unpublished
// until an admin runs the publish bridge. The admin authoring tool
// remains the publishing surface.
interface TeachCourse {
  id: string;
  title: string;
  code: string | null;
  slug: string | null;
  description: string | null;
  category: string | null;
  isPublished: boolean;
  stateBoardApproved: boolean | null;
  modulesCount: number;
}

interface ModuleRow { id: string; title: string; sortOrder: number; lessonsCount: number }
interface LessonRow {
  id: string; moduleId: string; title: string; lessonType: string | null;
  contentBody: string | null; estimatedMinutes: number | null; sortOrder: number;
}
interface BlockRow { id: string; blockType: string | null; title: string | null; body: string | null }
interface QuizRow { id: string; title: string; isPublished: boolean }
interface InviteRow { id: string; courseId: string; courseTitle: string; role: string | null; status: string }

async function postJson(url: string, body: Record<string, unknown>) {
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'That action could not be completed.');
  return data;
}

export function TeachStudio() {
  const [gateError, setGateError] = useState<string | null>(null);
  const [courses, setCourses] = useState<TeachCourse[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; status: string; starts_at: string | null; ends_at: string | null; meeting_url: string | null }>>([]);
  const [newSession, setNewSession] = useState({ title: '', startsAt: '', endsAt: '', meetingUrl: '' });
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newCourse, setNewCourse] = useState({ title: '', code: '', category: '', description: '' });
  const [newModule, setNewModule] = useState('');
  const [newLesson, setNewLesson] = useState({ moduleId: '', title: '', lessonType: 'reading', minutes: '', body: '' });
  const [editingLesson, setEditingLesson] = useState<LessonRow | null>(null);
  const [lessonBody, setLessonBody] = useState('');
  const [newBlock, setNewBlock] = useState({ lessonId: '', title: '', body: '' });
  const [newQuiz, setNewQuiz] = useState({ title: '', instructions: '' });
  const [inviteEmail, setInviteEmail] = useState('');

  const loadAccess = useCallback(async () => {
    const res = await fetch('/api/vet/teach/access', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setGateError(data.error || 'Teach access required.'); return; }
    setCourses(Array.isArray(data.courses) ? data.courses : []);
  }, []);

  const loadCourse = useCallback(async (id: string) => {
    const [detail, quizData, sessionData] = await Promise.all([
      fetch(`/api/vet/teach/courses/${id}`, { cache: 'no-store' }).then((r) => (r.ok ? (r.json() as any) : {})),
      fetch(`/api/vet/teach/courses/${id}/quizzes`, { cache: 'no-store' }).then((r) => (r.ok ? (r.json() as any) : {})),
      fetch(`/api/vet/teach/courses/${id}/sessions`, { cache: 'no-store' }).then((r) => (r.ok ? (r.json() as any) : {})),
    ]);
    setModules(Array.isArray(detail.modules) ? detail.modules : []);
    setLessons(Array.isArray(detail.lessons) ? detail.lessons : []);
    setQuizzes(Array.isArray(quizData.quizzes) ? quizData.quizzes : []);
    setSessions(Array.isArray(sessionData.sessions) ? sessionData.sessions : []);
  }, []);

  const loadInvites = useCallback(async () => {
    const res = await fetch('/api/vet/teach/invites', { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setInvites(Array.isArray(data.invites) ? data.invites : []);
  }, []);

  useEffect(() => { void loadAccess(); void loadInvites(); }, [loadAccess, loadInvites]);
  useEffect(() => { if (selectedId) void loadCourse(selectedId); }, [selectedId, loadCourse]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true); setNotice(null);
    try { await fn(); setNotice(done); } catch (e: any) { setNotice(e?.message || 'That action could not be completed.'); }
    finally { setBusy(false); }
  };

  if (gateError) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-[20px] font-bold">Teach</h1>
        <div className="bg-card border border-border rounded-xl p-6 text-[13px] text-muted-foreground">
          {gateError}
          <p className="mt-2">
            Contributors: if you were invited to author a course, your invitation appears below once you sign in — accept it and Teach opens for that course.
          </p>
        </div>
        {invites.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h2 className="text-[14px] font-semibold">Your contributor invitations</h2>
            {invites.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px]">{inv.courseTitle} · {inv.role || 'contributor'}</p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run(async () => {
                    await postJson(`/api/vet/teach/invites/${inv.id}/accept`, {});
                    await loadInvites(); await loadAccess();
                  }, 'Invitation accepted — the course is now in your Teach list.')}
                  className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-[12px] font-semibold text-primary-foreground disabled:opacity-50"
                >
                  Accept invitation
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const selected = courses.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-[20px] font-bold">Teach</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Author courses for the Learning Center. Drafts stay unpublished until an admin publishes them — Teach never publishes a course, module, lesson, or quiz.
        </p>
        {notice && <p className="text-[12px] text-muted-foreground mt-2">{notice}</p>}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-[14px] font-semibold">Your courses</h2>
          {courses.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No courses yet — create a draft below, or accept a contributor invitation.</p>
          ) : (
            <ul className="space-y-2">
              {courses.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left rounded-lg border px-3 py-2 ${selectedId === c.id ? 'border-primary bg-primary/5' : 'border-border'}`}
                  >
                    <span className="block text-[13px] font-medium">{c.title}</span>
                    <span className="block text-[12px] text-muted-foreground">
                      {c.isPublished ? 'Published' : 'Draft'} · {c.modulesCount} modules
                      {c.code ? ` · ${c.code}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form
            className="space-y-2 border-t border-border pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const data = await postJson('/api/vet/teach/courses', newCourse);
                setNewCourse({ title: '', code: '', category: '', description: '' });
                await loadAccess();
                if (data.course?.id) setSelectedId(String(data.course.id));
              }, 'Course draft created.');
            }}
          >
            <p className="text-[13px] font-semibold">New course draft</p>
            <input value={newCourse.title} onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })} placeholder="Course title *" className="w-full h-9 rounded-md border border-border bg-background px-3 text-[13px]" />
            <input value={newCourse.code} onChange={(e) => setNewCourse({ ...newCourse, code: e.target.value })} placeholder="Code (e.g. VET-201)" className="w-full h-9 rounded-md border border-border bg-background px-3 text-[13px]" />
            <input value={newCourse.category} onChange={(e) => setNewCourse({ ...newCourse, category: e.target.value })} placeholder="Category" className="w-full h-9 rounded-md border border-border bg-background px-3 text-[13px]" />
            <textarea value={newCourse.description} onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })} placeholder="Description" rows={3} className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px]" />
            <button type="submit" disabled={busy || !newCourse.title.trim()} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-[12px] font-semibold text-primary-foreground disabled:opacity-50">
              Create draft
            </button>
          </form>

          {invites.length > 0 && (
            <div className="border-t border-border pt-4 space-y-2">
              <p className="text-[13px] font-semibold">Your contributor invitations</p>
              {invites.map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[12px] text-muted-foreground">{inv.courseTitle}</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(async () => {
                      await postJson(`/api/vet/teach/invites/${inv.id}/accept`, {});
                      await loadInvites(); await loadAccess();
                    }, 'Invitation accepted.')}
                    className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    Accept
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-5">
          {!selected ? (
            <div className="bg-card border border-border rounded-xl p-6 text-[13px] text-muted-foreground">
              Pick a course to author its modules, lessons, blocks, and quizzes.
            </div>
          ) : (
            <>
              <div className="bg-card border border-border rounded-xl p-5 space-y-2">
                <h2 className="text-[15px] font-semibold">{selected.title}</h2>
                <p className="text-[13px] text-muted-foreground">
                  {selected.isPublished ? 'Published — edits here land as draft content until admin republishes.' : 'Draft — unpublished, not enrollable until admin publishes it.'}
                  {selected.stateBoardApproved ? ' · State board approved.' : ''}
                </p>
                <form
                  className="flex flex-wrap gap-2 pt-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await postJson(`/api/vet/teach/invites`, { courseId: selected.id, inviteeEmail: inviteEmail, role: 'contributor' });
                      setInviteEmail('');
                    }, 'Contributor invited — they accept from their invitations to start drafting.');
                  }}
                >
                  <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Contributor's account email" type="email" className="h-9 flex-1 min-w-[220px] rounded-md border border-border bg-background px-3 text-[13px]" />
                  <button type="submit" disabled={busy || !inviteEmail.trim()} className="inline-flex h-9 items-center rounded-md border border-border px-4 text-[12px] font-medium disabled:opacity-50">
                    Invite contributor
                  </button>
                </form>
              </div>

              <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                <h3 className="text-[14px] font-semibold">Modules &amp; lessons</h3>
                {modules.length === 0 && <p className="text-[13px] text-muted-foreground">No modules yet.</p>}
                {modules.map((m) => (
                  <div key={m.id} className="border border-border rounded-lg p-3">
                    <p className="text-[13px] font-medium">{m.title}</p>
                    <ul className="mt-1 space-y-1">
                      {lessons.filter((l) => l.moduleId === m.id).map((l) => (
                        <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[12px] text-muted-foreground">{l.title}{l.lessonType ? ` · ${l.lessonType}` : ''}</span>
                          <button type="button" onClick={() => { setEditingLesson(l); setLessonBody(l.contentBody || ''); }} className="text-[12px] font-medium text-primary hover:underline">
                            Edit body
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await postJson(`/api/vet/teach/courses/${selected.id}/modules`, { title: newModule });
                      setNewModule(''); await loadCourse(selected.id);
                    }, 'Module created.');
                  }}
                >
                  <input value={newModule} onChange={(e) => setNewModule(e.target.value)} placeholder="New module title" className="h-9 flex-1 min-w-[200px] rounded-md border border-border bg-background px-3 text-[13px]" />
                  <button type="submit" disabled={busy || !newModule.trim()} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-[12px] font-semibold text-primary-foreground disabled:opacity-50">Add module</button>
                </form>
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await postJson(`/api/vet/teach/modules/${newLesson.moduleId}/lessons`, {
                        title: newLesson.title, lessonType: newLesson.lessonType,
                        estimatedMinutes: newLesson.minutes ? Number(newLesson.minutes) : undefined,
                        contentBody: newLesson.body || undefined,
                      });
                      setNewLesson({ moduleId: '', title: '', lessonType: 'reading', minutes: '', body: '' });
                      await loadCourse(selected.id);
                    }, 'Lesson created.');
                  }}
                >
                  <div className="flex flex-wrap gap-2">
                    <select value={newLesson.moduleId} onChange={(e) => setNewLesson({ ...newLesson, moduleId: e.target.value })} className="h-9 rounded-md border border-border bg-background px-3 text-[13px]">
                      <option value="">Choose module…</option>
                      {modules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                    </select>
                    <input value={newLesson.title} onChange={(e) => setNewLesson({ ...newLesson, title: e.target.value })} placeholder="Lesson title" className="h-9 flex-1 min-w-[180px] rounded-md border border-border bg-background px-3 text-[13px]" />
                    <input value={newLesson.minutes} onChange={(e) => setNewLesson({ ...newLesson, minutes: e.target.value })} placeholder="Minutes" inputMode="numeric" className="h-9 w-24 rounded-md border border-border bg-background px-3 text-[13px]" />
                  </div>
                  <textarea value={newLesson.body} onChange={(e) => setNewLesson({ ...newLesson, body: e.target.value })} placeholder="Lesson body" rows={4} className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px]" />
                  <button type="submit" disabled={busy || !newLesson.moduleId || !newLesson.title.trim()} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-[12px] font-semibold text-primary-foreground disabled:opacity-50">Add lesson</button>
                </form>
                {editingLesson && (
                  <form
                    className="space-y-2 border-t border-border pt-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        const res = await fetch(`/api/vet/teach/lessons/${editingLesson.id}`, {
                          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ contentBody: lessonBody }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(data.error || 'That edit could not be saved.');
                        setEditingLesson(null); await loadCourse(selected.id);
                      }, 'Lesson body saved.');
                    }}
                  >
                    <p className="text-[13px] font-semibold">Edit lesson body — {editingLesson.title}</p>
                    <textarea value={lessonBody} onChange={(e) => setLessonBody(e.target.value)} rows={6} className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px]" />
                    <div className="flex gap-2">
                      <button type="submit" disabled={busy} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-[12px] font-semibold text-primary-foreground disabled:opacity-50">Save body</button>
                      <button type="button" onClick={() => setEditingLesson(null)} className="inline-flex h-9 items-center rounded-md border border-border px-4 text-[12px] font-medium">Cancel</button>
                    </div>
                  </form>
                )}
                <form
                  className="flex flex-wrap gap-2 border-t border-border pt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await postJson(`/api/vet/teach/lessons/${newBlock.lessonId}/blocks`, { title: newBlock.title, body: newBlock.body, blockType: 'text' });
                      setNewBlock({ lessonId: '', title: '', body: '' });
                    }, 'Content block added.');
                  }}
                >
                  <select value={newBlock.lessonId} onChange={(e) => setNewBlock({ ...newBlock, lessonId: e.target.value })} className="h-9 rounded-md border border-border bg-background px-3 text-[13px]">
                    <option value="">Choose lesson…</option>
                    {lessons.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
                  </select>
                  <input value={newBlock.title} onChange={(e) => setNewBlock({ ...newBlock, title: e.target.value })} placeholder="Block title" className="h-9 flex-1 min-w-[160px] rounded-md border border-border bg-background px-3 text-[13px]" />
                  <input value={newBlock.body} onChange={(e) => setNewBlock({ ...newBlock, body: e.target.value })} placeholder="Block text" className="h-9 flex-1 min-w-[160px] rounded-md border border-border bg-background px-3 text-[13px]" />
                  <button type="submit" disabled={busy || !newBlock.lessonId} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-[12px] font-semibold text-primary-foreground disabled:opacity-50">Add block</button>
                </form>
              </div>

              <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                <h3 className="text-[14px] font-semibold">Live sessions — Zoom</h3>
                <p className="text-[13px] text-muted-foreground">Schedule a live class for this course. Paste your own Zoom meeting link — learners join it from the video box inside the Learning Canvas. A session without a link lists honestly as having no video room yet; Teach never invents a meeting URL.</p>
                {sessions.length === 0 && <p className="text-[13px] text-muted-foreground">No live sessions yet.</p>}
                {sessions.map((s) => (
                  <p key={s.id} className="text-[13px]">{s.title} · {s.starts_at ? new Date(s.starts_at).toLocaleString() : 'Unscheduled'} · {s.meeting_url ? 'Zoom link attached' : 'No video link yet'}</p>
                ))}
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await postJson(`/api/vet/teach/courses/${selected.id}/sessions`, newSession);
                      setNewSession({ title: '', startsAt: '', endsAt: '', meetingUrl: '' }); await loadCourse(selected.id);
                    }, 'Live session scheduled.');
                  }}
                >
                  <input value={newSession.title} onChange={(e) => setNewSession({ ...newSession, title: e.target.value })} placeholder="Session title" className="h-9 flex-1 min-w-[180px] rounded-md border border-border bg-background px-3 text-[13px]" />
                  <input type="datetime-local" value={newSession.startsAt} onChange={(e) => setNewSession({ ...newSession, startsAt: e.target.value })} aria-label="Starts at" className="h-9 rounded-md border border-border bg-background px-3 text-[13px]" />
                  <input type="datetime-local" value={newSession.endsAt} onChange={(e) => setNewSession({ ...newSession, endsAt: e.target.value })} aria-label="Ends at" className="h-9 rounded-md border border-border bg-background px-3 text-[13px]" />
                  <input value={newSession.meetingUrl} onChange={(e) => setNewSession({ ...newSession, meetingUrl: e.target.value })} placeholder="Zoom link (https://…)" className="h-9 flex-1 min-w-[220px] rounded-md border border-border bg-background px-3 text-[13px]" />
                  <button type="submit" disabled={busy || !newSession.title.trim() || !newSession.startsAt} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-[12px] font-semibold text-primary-foreground disabled:opacity-50">Schedule session</button>
                </form>
              </div>

              <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                <h3 className="text-[14px] font-semibold">Quizzes</h3>
                {quizzes.length === 0 && <p className="text-[13px] text-muted-foreground">No quizzes yet.</p>}
                {quizzes.map((q) => (
                  <p key={q.id} className="text-[13px]">{q.title} · {q.isPublished ? 'Published' : 'Draft'}</p>
                ))}
                <form
                  className="flex flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await postJson(`/api/vet/teach/courses/${selected.id}/quizzes`, newQuiz);
                      setNewQuiz({ title: '', instructions: '' }); await loadCourse(selected.id);
                    }, 'Quiz draft created.');
                  }}
                >
                  <input value={newQuiz.title} onChange={(e) => setNewQuiz({ ...newQuiz, title: e.target.value })} placeholder="Quiz title" className="h-9 flex-1 min-w-[180px] rounded-md border border-border bg-background px-3 text-[13px]" />
                  <input value={newQuiz.instructions} onChange={(e) => setNewQuiz({ ...newQuiz, instructions: e.target.value })} placeholder="Instructions" className="h-9 flex-1 min-w-[180px] rounded-md border border-border bg-background px-3 text-[13px]" />
                  <button type="submit" disabled={busy || !newQuiz.title.trim()} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-[12px] font-semibold text-primary-foreground disabled:opacity-50">Add quiz</button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
