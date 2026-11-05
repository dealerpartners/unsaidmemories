import "server-only"
import { randomUUID } from "node:crypto"
import { pgQueryStrict } from "@/lib/pg"
import { tenantId } from "@/lib/partner-applications"

// partner-wizard/draft.ts — Crew A contract (createDraft/loadDraft/
// saveStep/finalizeDraft with resume token), implemented for the VET kind
// on clinical.vet_partner_applications because Crew A's module was not
// in this tree. wizard_steps jsonb + current_step + resume_token come
// from migration 20261123 (Crew A) / 20261124 (Crew C, idempotent twin).
// While either is unapplied the DB answers 42703/42P01 and callers map
// that to an honest 503 (WizardSchemaMissing) — never a faked draft.

export class WizardSchemaMissing extends Error { code = "WIZARD_SCHEMA_MISSING" }
export function isWizardSchemaMissing(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code
  const msg = e instanceof Error ? e.message : String(e)
  return code === "42703" || code === "42P01" || /column .* does not exist/i.test(msg) || /relation .* does not exist/i.test(msg)
}
async function q<T>(sql: string, params: unknown[]): Promise<T[]> {
  try { return await pgQueryStrict<T>(sql, params) }
  catch (e) { if (isWizardSchemaMissing(e)) throw new WizardSchemaMissing(); throw e }
}

export type WizardSteps = Record<string, Record<string, unknown>>
export interface VetDraft { id: string; resumeToken: string; currentStep: number; steps: WizardSteps; partnerType: string }

const cleanSteps = (s: unknown): WizardSteps =>
  s && typeof s === "object" && !Array.isArray(s) ? (s as WizardSteps) : {}

/** Create a draft row (status='draft' — excluded from every queue).
 *  Called at the first persisted save (vet step 2), when the row's
 *  NOT NULL identity fields (practice/contact/email) first exist. */
export async function createDraft(input: { partnerType: string; practiceName: string; contactName: string; email: string; steps: WizardSteps; currentStep: number }): Promise<VetDraft> {
  const token = randomUUID() + randomUUID().replace(/-/g, "")
  const rows = await q<{ id: string }>(
    `INSERT INTO clinical.vet_partner_applications
       (tenant_id, practice_name, contact_name, email, partner_type, status, wizard_steps, current_step, resume_token)
     VALUES ($1,$2,$3,$4,$5,'draft',$6::jsonb,$7,$8) RETURNING id`,
    [tenantId(), input.practiceName, input.contactName, input.email, input.partnerType, JSON.stringify(input.steps), input.currentStep, token])
  return { id: rows[0].id, resumeToken: token, currentStep: input.currentStep, steps: input.steps, partnerType: input.partnerType }
}

export async function loadDraft(id: string, token: string): Promise<VetDraft | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !token) return null
  const rows = await q<any>(
    `SELECT id, resume_token, current_step, wizard_steps, partner_type
       FROM clinical.vet_partner_applications
      WHERE id=$1::uuid AND resume_token=$2 AND status='draft'`, [id, token])
  const r = rows[0]; if (!r) return null
  return { id: r.id, resumeToken: r.resume_token, currentStep: Number(r.current_step ?? 1), steps: cleanSteps(r.wizard_steps), partnerType: r.partner_type }
}

/** Merge one step's payload into wizard_steps and advance current_step. */
export async function saveStep(draft: VetDraft, step: number, data: Record<string, unknown>): Promise<VetDraft> {
  const steps = { ...draft.steps, [String(step)]: data }
  const current = Math.max(draft.currentStep, Math.min(step + 1, 10))
  await q(`UPDATE clinical.vet_partner_applications SET wizard_steps=$3::jsonb, current_step=$4 WHERE id=$1::uuid AND resume_token=$2 AND status='draft'`,
    [draft.id, draft.resumeToken, JSON.stringify(steps), current])
  return { ...draft, steps, currentStep: current }
}

/** Mark the draft consumed after finalize copied its packet onto the
 *  final application row; the draft row is then deleted (it was never
 *  an application). If delete fails the status guard keeps it out of
 *  every queue and loadDraft refuses it. */
export async function finalizeDraft(draft: VetDraft, finalApplicationId: string): Promise<void> {
  await q(`UPDATE clinical.vet_partner_applications SET wizard_submitted_application_id=$3::uuid, current_step=10 WHERE id=$1::uuid AND resume_token=$2`,
    [draft.id, draft.resumeToken, finalApplicationId])
  await q(`DELETE FROM clinical.vet_partner_applications WHERE id=$1::uuid AND resume_token=$2 AND status='draft'`, [draft.id, draft.resumeToken])
}
