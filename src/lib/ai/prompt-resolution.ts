// J2 · Live prompt resolution — the fetch path A/B tests hook into.
// resolvePromptForFeature(tenant, feature, subjectKey): returns the active
// ai_prompts row for the feature; when a RUNNING ai_ab_tests row targets
// that prompt as its control, the subject's deterministic assignment may
// substitute the variant prompt. Returns the ab tagging callers stamp onto
// ai_invocations (ab_test_id / ab_variant) so results are real counts.
import { withPg } from "@/lib/crm/enterprise";
import { assignVariant, testIsLive } from "./ab-tests";

export interface ResolvedPrompt {
  prompt: Record<string, unknown>;
  abTestId: string | null;
  abVariant: "control" | "variant" | null;
}

export async function resolvePromptForFeature(tenant: string, feature: string, subjectKey: string): Promise<ResolvedPrompt | null> {
  return withPg(async (c) => {
    const { rows: prompts } = await c.query(
      `SELECT id, name, feature, prompt_text, version, status, created_at, updated_at
         FROM public.ai_prompts WHERE tenant_id = $1 AND feature = $2 AND status = 'active'
        ORDER BY updated_at DESC LIMIT 1`, [tenant, feature]);
    const control = prompts[0];
    if (!control) return null;
    const { rows: tests } = await c.query(
      `SELECT id, traffic_split, status, starts_at, ends_at, variant_prompt_id
         FROM public.ai_ab_tests WHERE tenant_id = $1 AND control_prompt_id = $2::uuid AND status = 'running'
        ORDER BY created_at DESC LIMIT 1`, [tenant, control.id]);
    const test = tests[0];
    if (!test || !testIsLive(test)) return { prompt: control, abTestId: null, abVariant: null };
    const variant = assignVariant(test, subjectKey);
    if (variant === "control") return { prompt: control, abTestId: test.id, abVariant: "control" };
    const { rows: vp } = await c.query(
      `SELECT id, name, feature, prompt_text, version, status, created_at, updated_at
         FROM public.ai_prompts WHERE tenant_id = $1 AND id = $2::uuid LIMIT 1`, [tenant, test.variant_prompt_id]);
    if (!vp[0]) return { prompt: control, abTestId: test.id, abVariant: "control" };
    return { prompt: vp[0], abTestId: test.id, abVariant: "variant" };
  });
}
