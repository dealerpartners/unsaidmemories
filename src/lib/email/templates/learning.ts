// ---------------------------------------------------------------------------
// The Leashed Learning Center emails (sent via Resend, academy-branded).
// ---------------------------------------------------------------------------

import { BRAND, button, detailsCard, eyebrow, h1, noteBox, p, steps, frame, esc } from "../design"

const CLASSROOM_URL = `${BRAND.learnUrl}/classroom`

// ---- Enrollment welcome ---------------------------------------------------------

export interface EnrollmentData {
  firstName: string
  programName?: string
  instructor?: string
}

export function enrollmentWelcomeHtml(d: EnrollmentData): string {
  const program = d.programName || "the Learning Center"
  return frame({
    academy: true,
    preheader: `You're enrolled in ${esc(program)} — your classroom is open.`,
    body: [
      eyebrow("You're enrolled"),
      h1(`Welcome to class, ${esc(d.firstName)}`),
      p(`Your seat in <strong style="color:#1a1a1a">${esc(program)}</strong> is confirmed, and your classroom is already open. Everything you need — lessons, videos, quizzes, and your certificate at the finish line — lives in one place from here on out.`),
      detailsCard("Your enrollment", [
        { label: "Program", value: esc(program) },
        ...(d.instructor ? [{ label: "Instructor", value: esc(d.instructor) }] : []),
        { label: "Classroom", value: "unsaidmemories.com/learn/classroom" },
      ]),
      steps([
        { title: "Sign in to the classroom", body: "Same email address this welcome arrived at — or the Forgot password link if you've never set one." },
        { title: "Start Module 1", body: "Short lessons, real practice. About 20 minutes gets you moving." },
        { title: "Go at your pace", body: "Your progress saves automatically — come and go as life allows." },
      ]),
      button(CLASSROOM_URL, "Enter my classroom"),
      noteBox(`Enrollment questions? Reply to this email — it reaches the academy team directly.`),
    ].join(""),
    reason: `You're receiving this because you enrolled in a Leashed Learning Center program.`,
  })
}

// ---- Class reminder (finish your class) --------------------------------------------

export interface ClassReminderData {
  firstName: string
  moduleName: string
  percentComplete: number
  programName?: string
  minutesLeft?: number
}

export function classReminderHtml(d: ClassReminderData): string {
  const barInner = Math.max(0, Math.min(100, d.percentComplete))
  return frame({
    academy: true,
    preheader: `${esc(d.moduleName)} is ${d.percentComplete}% done — pick up where you left off.`,
    body: [
      eyebrow("Pick up where you left off"),
      h1(`${esc(d.firstName)}, your class is waiting`),
      p(`You're closer to the finish line than you think — <strong style="color:#1a1a1a">${esc(d.moduleName)}</strong>${d.programName ? ` in ${esc(d.programName)}` : ""} is nearly done.`),
      `<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff;border:1px solid #e7e5e4;">
        <tr><td style="padding:18px 22px 8px;font-family:Helvetica,Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;color:#ea580c;">Your progress</td></tr>
        <tr><td style="padding:0 22px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f5f4;border-radius:3px;">
            <tr><td width="${barInner}%" bgcolor="#ea580c" height="8" style="font-size:0;line-height:0;border-radius:3px;">&nbsp;</td>${barInner < 100 ? `<td width="${100 - barInner}%}" style="font-size:0;line-height:0;">&nbsp;</td>` : ""}</tr>
          </table>
        </td></tr>
        <tr><td style="padding:8px 22px 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:26px;font-weight:800;color:#0c0a09;">${d.percentComplete}% complete${d.minutesLeft ? `<span style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#78716c;"> · about ${d.minutesLeft} minutes left</span>` : ""}</td></tr>
      </table>`,
      button(CLASSROOM_URL, "Finish my lesson"),
      p(`Your spot in the module is saved exactly where you stopped — no scrolling, no hunting.`, { muted: true, small: true }),
    ].join(""),
    reason: `You're receiving this because you're enrolled in a Leashed Learning Center program.`,
  })
}

// ---- Completion congratulations --------------------------------------------------------

export interface CompletionData {
  firstName: string
  completedWhat: string
  completedOn: string
  nextStep?: string
}

export function completionCongratulationsHtml(d: CompletionData): string {
  return frame({
    academy: true,
    preheader: `Congratulations — ${esc(d.completedWhat)} complete! 🎉`,
    body: [
      eyebrow("Congratulations"),
      h1(`You did it, ${esc(d.firstName)}!`),
      p(`<strong style="color:#1a1a1a">${esc(d.completedWhat)}</strong> is officially complete. That takes real commitment — soak it in, and then keep the momentum going.`),
      detailsCard("Your achievement", [
        { label: "Completed", value: esc(d.completedWhat) },
        { label: "Date", value: esc(d.completedOn) },
        { label: "Certificate", value: "Available in your classroom" },
      ], { tone: "sage" }),
      ...(d.nextStep ? [noteBox(`<strong style="color:#1a1a1a">What's next:</strong> ${esc(d.nextStep)}`, "sage")] : []),
      button(CLASSROOM_URL, "View my certificate"),
      p(`Feel free to forward this to someone who'll be proud of you. We are.`, { muted: true, small: true }),
    ].join(""),
    reason: `You're receiving this because you completed a Leashed Learning Center program.`,
  })
}

// ---- Waitlist confirmation ------------------------------------------------
// The receipt for /api/learn/waitlist ("Enrolling soon" capture) — wired
// through the alerts pattern (src/lib/notify.ts). The waitlist capture
// originally sent NO confirmation by design; the pattern supersedes
// that: every capture owes the user a receipt.

export function learnWaitlistConfirmationHtml(): string {
  return frame({
    academy: true,
    preheader: "You're on the Learning Center waitlist.",
    body: [
      eyebrow("Waitlist"),
      h1("You're on the list"),
      p("Thanks for joining the Leashed Learning Center waitlist. Enrollment isn't open just yet — the moment it opens, you'll be one of the first to know, at this email address."),
      p("No spam, no noise — one email when the doors open.", { muted: true, small: true }),
      button(BRAND.learnUrl, "Peek at the Learning Center"),
    ].join(""),
    reason: "You're receiving this because you joined the Leashed Learning Center waitlist.",
  })
}
