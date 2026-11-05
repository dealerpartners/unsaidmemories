import { randomBytes } from "node:crypto"
import { pgQueryStrict } from "@/lib/pg"
import { tenantId } from "@/lib/partner-applications"

// ============================================================================
// Partner wizard drafts — server-side draft store (Crew D, ship/onb-groomer).
//
// Crew A's src/lib/partner-wizard/draft.ts (createDraft / loadDraft /
// saveStep / finalizeDraft + resume token) had not landed when this crew
// built, so this file implements the same contract for the groomer wizard;
// the parent merge with ship/onb-core dedupes to one implementation.
//
// Model: a draft IS an application row. createDraft inserts it with
// status 'draft'; each saveStep merges the step payload into
// wizard_steps (jsonb, keyed by step number) and advances current_step;
// the resume_token is the applicant's only credential — possession of the
// token is possession of the draft (the same posture as a magic link).
// finalizeDraft is implemented per-kind (the groomer finalize lives in
// the grooming draft route) because projection onto structured columns
// and the submit follow-up differ per audience; this module owns the
// shared draft lifecycle up to that point.
// ============================================================================

export type PartnerKind = "groomer" | "seller" | "vet" | "pharmacy"

/** Application table per kind. Vet applications live in clinical schema. */
export const APPLICATION_TABLE: Record<PartnerKind, string> = {
  groomer: "public.grooming_partner_applications",
  seller: "public.seller_partner_applications",
  vet: "clinical.vet_partner_applications",
  pharmacy: "clinical.pharmacy_partner_applications",
}

export interface WizardDraft {
  id: string
  status: string
  currentStep: number
  steps: Record<string, Record<string, unknown>>
  partnerType: string | null
}

export function newResumeToken(): string {
  return randomBytes(24).toString("base64url")
}

export async function createDraft(
  kind: "groomer",
  partnerType: "lead_only" | "franchise",
): Promise<{ id: string; resumeToken: string }> {
  const resumeToken = newResumeToken()
  const rows = await pgQueryStrict<{ id: string }>(
    `insert into public.grooming_partner_applications
       (tenant_id, business_name, contact_name, email, partner_type, status,
        wizard_steps, current_step, resume_token)
     values ($1, '', '', '', $2, 'draft', '{}'::jsonb, 1, $3)
     returning id`,
    [tenantId(), partnerType, resumeToken],
  )
  return { id: rows[0].id, resumeToken }
}

export async function loadDraft(
  kind: PartnerKind,
  id: string,
  resumeToken: string,
): Promise<WizardDraft | null> {
  const table = APPLICATION_TABLE[kind]
  const rows = await pgQueryStrict<{
    id: string
    status: string
    current_step: number
    wizard_steps: Record<string, Record<string, unknown>>
    partner_type: string | null
  }>(
    `select id, status, current_step, wizard_steps, partner_type
       from ${table}
      where id = $1::uuid and resume_token = $2
      limit 1`,
    [id, resumeToken],
  )
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    status: r.status,
    currentStep: r.current_step ?? 1,
    steps: r.wizard_steps ?? {},
    partnerType: r.partner_type,
  }
}

export async function saveStep(
  kind: PartnerKind,
  id: string,
  resumeToken: string,
  step: number,
  payload: Record<string, unknown>,
): Promise<WizardDraft | null> {
  const table = APPLICATION_TABLE[kind]
  const rows = await pgQueryStrict<{
    id: string
    status: string
    current_step: number
    wizard_steps: Record<string, Record<string, unknown>>
    partner_type: string | null
  }>(
    `update ${table}
        set wizard_steps = wizard_steps || $3::jsonb,
            current_step = greatest(current_step, $4),
            partner_type = coalesce($5, partner_type)
      where id = $1::uuid and resume_token = $2 and status = 'draft'
      returning id, status, current_step, wizard_steps, partner_type`,
    [
      id,
      resumeToken,
      JSON.stringify({ [String(step)]: payload }),
      step + 1,
      step === 1 && typeof payload.partnerType === "string" ? payload.partnerType : null,
    ],
  )
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    status: r.status,
    currentStep: r.current_step ?? 1,
    steps: r.wizard_steps ?? {},
    partnerType: r.partner_type,
  }
}
