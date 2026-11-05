// Render one of the hosted email designs (src/lib/email/hosted/*.html —
// Sunny's design pattern) with a send's variables.
//
// Used where the provider cannot render the design itself: the Brevo
// route (her key is send-scoped, so no Brevo template objects exist)
// and any send whose HTML fallback should BE the design rather than
// the legacy in-code render.
//
// Variables arrive in the Resend bridge shape (SCREAMING_SNAKE, built
// by toResendVariables) so a single variables object serves every
// route. Each {{token}} in the design is converted with the same
// keyOf() the bridge uses, then looked up. {{#if token}}…{{else}}…
// {{/if}} blocks evaluate on the looked-up value's truthiness.
import { HOSTED_TEMPLATES } from "./hosted-templates";
import { resendKeyOf } from "./resend-templates";

function lookup(vars: Record<string, string | number>, token: string): string {
  const key = resendKeyOf(token);
  const v = vars[key];
  return v == null ? "" : String(v);
}

export function renderHostedEmail(
  slug: string,
  vars: Record<string, string | number>,
): string | null {
  const tpl = HOSTED_TEMPLATES[slug];
  if (!tpl) return null;
  let out = tpl;
  // {{#if token}} A {{else}} B {{/if}} — non-nested (the designs use
  // exactly one level, for the temp-password block).
  out = out.replace(
    /\{\{#if ([a-zA-Z][a-zA-Z0-9]*)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g,
    (_m, token: string, yes: string, no?: string) =>
      lookup(vars, token) && lookup(vars, token) !== "false" ? yes : (no ?? ""),
  );
  out = out.replace(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g, (_m, token: string) => lookup(vars, token));
  return out;
}

/** App template key → hosted design slug, for the Brevo (marketing)
 *  route. Transactional keys resolve through the Resend template map
 *  instead (see resend-templates.ts). */
export const BREVO_HOSTED_SLUGS: Record<string, string> = {
  abandoned_cart: "abandoned_cart",
  welcome_back: "welcome_back",
  sales_coupon_mailer: "sales_coupon_mailer",
  newsletter_confirmation: "newsletter_confirmation",
  winback_offer: "winback_offer",
  unsubscribe_confirmation: "unsubscribe_confirmation",
};
