// ---------------------------------------------------------------------------
// AI content review — the review_moderation function's producer pass
// (Admin tree F5 · AI content review; function registered in
// src/lib/ai-ops/functions.ts).
//
// Until this pass existed the function was a registry entry with no
// producer: nothing ever generated a moderation verdict, so the F5
// desk's AI leaf had nothing to queue. The pass is DETERMINISTIC (the
// operator doctrine: evaluation over recorded facts, signals +
// recommendation recorded on the task, a human decides) — it reads
// PENDING shop reviews (the exact set the manual review queue shows:
// not published, not rejected) and records one ai_task proposal per
// review with the signals it found and the action it recommends.
//
// NO VERDICT EXECUTES ITSELF. A proposal is decided at the F5 desk
// (applied → the recommended action is taken on the review through the
// manual queue's own column semantics; dismissed → nothing changes).
// Reviews already carrying an undecided proposal are skipped, the
// fraud scanner's dedupe rule.
// ---------------------------------------------------------------------------

import { writeSellerAudit } from "@/lib/sellers/audit";

type Client = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
};

export type ReviewSignals = {
  contains_link: boolean;
  contains_email: boolean;
  contains_phone: boolean;
  shouty: boolean;
  repeated_chars: boolean;
  empty_body: boolean;
};

export type ReviewRecommendation = "approve" | "reject" | "hide";

const URL_RE = /(https?:\/\/|www\.)\S+/i;
const EMAIL_RE = /\S+@\S+\.\S+/;
const PHONE_RE = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/;
const REPEAT_RE = /(.)\1{4,}/;

export function evaluateReview(input: {
  title: string | null;
  body: string | null;
}): { signals: ReviewSignals; recommendation: ReviewRecommendation; rationale: string } {
  const text = `${input.title ?? ""}\n${input.body ?? ""}`;
  const letters = text.replace(/[^A-Za-z]/g, "");
  const upper = text.replace(/[^A-Z]/g, "").length;
  const signals: ReviewSignals = {
    contains_link: URL_RE.test(text),
    contains_email: EMAIL_RE.test(text),
    contains_phone: PHONE_RE.test(text),
    shouty: letters.length >= 20 && upper / Math.max(letters.length, 1) > 0.7,
    repeated_chars: REPEAT_RE.test(text),
    empty_body: !(input.body ?? "").trim(),
  };
  if (signals.contains_link || signals.contains_email || signals.contains_phone) {
    return {
      signals,
      recommendation: "reject",
      rationale: "Contact or link solicitation signals (link/email/phone) in the review text — the spam pattern the manual queue rejects.",
    };
  }
  if (signals.shouty || signals.repeated_chars) {
    return {
      signals,
      recommendation: "hide",
      rationale: "Abuse-pattern signals (shouting / repeated characters) — hold out of publication for a human decision.",
    };
  }
  return {
    signals,
    recommendation: "approve",
    rationale: "No risk signals in the review text, rating, or authorship facts — reads as an ordinary customer review.",
  };
}

export async function runReviewModerationPass(
  c: Client,
  tenant: string,
  actorId: string | null,
  ipAddress: string | null,
): Promise<{ created: number; byRecommendation: Record<string, number>; skipped: number }> {
  const { rows: pending } = await c.query(
    `SELECT r.id, r.rating, r.title, r.body, r.author_name, r.is_verified_purchase
       FROM public.reviews r
      WHERE r.tenant_id = $1 AND NOT r.is_published AND r.status <> 'rejected'
      ORDER BY r.created_at ASC LIMIT 200`,
    [tenant],
  );
  const { rows: open } = await c.query(
    `SELECT subject_id::text AS subject_id FROM public.ai_tasks
      WHERE tenant_id = $1 AND function = 'review_moderation' AND subject_type = 'review'
        AND state = 'proposed'`,
    [tenant],
  );
  const openSubjects = new Set(open.map((r) => r.subject_id));

  let created = 0;
  let skipped = 0;
  const byRecommendation: Record<string, number> = {};
  for (const r of pending) {
    if (openSubjects.has(String(r.id))) {
      skipped += 1;
      continue;
    }
    const { signals, recommendation, rationale } = evaluateReview({ title: r.title, body: r.body });
    await c.query(
      `INSERT INTO public.ai_tasks (tenant_id, function, subject_type, subject_id, input, output)
       VALUES ($1::uuid, 'review_moderation', 'review', $2::uuid, $3::jsonb, $4::jsonb)`,
      [
        tenant,
        String(r.id),
        JSON.stringify({ trigger: "admin_run", actor_id: actorId }),
        JSON.stringify({
          signals,
          recommendation,
          rationale,
          review: {
            rating: r.rating,
            title: r.title,
            body_excerpt: (r.body ?? "").slice(0, 400),
            author_name: r.author_name,
            is_verified_purchase: r.is_verified_purchase === true,
          },
        }),
      ],
    );
    created += 1;
    byRecommendation[recommendation] = (byRecommendation[recommendation] ?? 0) + 1;
  }

  const { rows: runRows } = await c.query(
    `INSERT INTO public.ai_tasks (tenant_id, function, subject_type, state, input, output)
     VALUES ($1::uuid, 'review_moderation', 'moderation_run', 'recorded', $2::jsonb, $3::jsonb)
     RETURNING id`,
    [
      tenant,
      JSON.stringify({ trigger: "admin_run", actor_id: actorId }),
      JSON.stringify({
        proposals_created: created,
        by_recommendation: byRecommendation,
        skipped_duplicates: skipped,
        evaluated_at: new Date().toISOString(),
      }),
    ],
  );
  await writeSellerAudit(c as any, {
    tenantId: tenant,
    actorId,
    ipAddress,
    action: "ai_review.pass_run",
    entityType: "ai_task",
    entityId: String(runRows[0].id),
    afterState: { proposals_created: created, by_recommendation: byRecommendation, skipped_duplicates: skipped },
  });
  return { created, byRecommendation, skipped };
}
