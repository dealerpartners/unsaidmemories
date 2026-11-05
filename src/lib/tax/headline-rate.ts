// ---------------------------------------------------------------------------
// The tenant's headline sales-tax rate — ONE source, two views.
//
// acct_tax_rules is the single source the storefront prices from: the
// sum of a tenant's active, auto-calc rules is the goods rate; rules
// NOT classified goods-only make up the rest. The Business Profile
// "Tax Rate" field is the tenant's headline view of that same
// configuration: it reads the goods total, and saving it rebalances the
// tenant's OWN rules to reach the new total — the state + county
// structure underneath is preserved, the delta lands on the largest
// rule. No tenant ever reads or writes another tenant's rules, and
// there is no global constant: a tenant with no tax rules has no
// headline rate (null), and saving one creates their first standard
// rule.
// ---------------------------------------------------------------------------

export interface TaxQueryClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;
}

interface TaxRuleRow {
  id: string;
  rate: number;
  classification: string | null;
  state_code: string | null;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

async function activeRules(client: TaxQueryClient, tenantId: string): Promise<TaxRuleRow[]> {
  const { rows } = await client.query(
    `SELECT id::text AS id, rate::float8 AS rate, classification, state_code
       FROM public.acct_tax_rules
      WHERE tenant_id = $1 AND is_active AND auto_calc AND rate > 0
      ORDER BY rate DESC`,
    [tenantId],
  );
  return rows as TaxRuleRow[];
}

/**
 * The tenant's headline rate in PERCENT (the goods total — the sum of
 * every active auto-calc rule, exactly what the checkout charges on
 * goods), or null when the tenant has no tax rules at all.
 */
export async function getHeadlineRatePct(
  client: TaxQueryClient,
  tenantId: string,
): Promise<number | null> {
  const rules = await activeRules(client, tenantId);
  if (rules.length === 0) return null;
  return round3(rules.reduce((sum, r) => sum + Number(r.rate || 0), 0));
}

const GOODS_ONLY_RE = /GOODS|RETAIL|PRODUCT/i;

/**
 * The tenant's services rate in PERCENT — the sum of active auto-calc
 * rules NOT classified goods-only. This is the same split the checkout
 * applies (goods get every rule; services get only the non-goods-only
 * ones), so online booking pricing and the storefront agree. Null when
 * the tenant has no tax rules at all.
 */
export async function getServicesRatePct(
  client: TaxQueryClient,
  tenantId: string,
): Promise<number | null> {
  const rules = await activeRules(client, tenantId);
  if (rules.length === 0) return null;
  return round3(
    rules
      .filter((r) => !GOODS_ONLY_RE.test(r.classification || ""))
      .reduce((sum, r) => sum + Number(r.rate || 0), 0),
  );
}

/**
 * Set the tenant's headline rate: rebalance their active auto-calc
 * rules so they sum to targetPct, largest rule absorbing the delta
 * first (each rule floors at 0; any remainder spills to the next).
 * With no rules and a positive target, create the tenant's first
 * standard ALL_SALES rule. A target of 0 zeroes every rule (the
 * checkout then charges no tax — its existing honest behavior).
 * Returns the resulting rule set.
 */
export async function setHeadlineRatePct(
  client: TaxQueryClient,
  tenantId: string,
  targetPct: number,
): Promise<TaxRuleRow[]> {
  const target = round3(Math.max(0, Number(targetPct) || 0));
  const rules = await activeRules(client, tenantId);

  if (rules.length === 0) {
    if (target > 0) {
      // State for the new rule: the tenant's own location state when
      // they have one on file (tenant_locations address jsonb carries
      // it as an object or a "…, ST ZIP" string), else blank — the
      // Taxes screen lets them refine jurisdiction detail.
      let stateCode = "";
      try {
        const loc = await client.query(
          `SELECT address FROM public.tenant_locations
            WHERE tenant_id = $1 AND is_active ORDER BY is_primary DESC, created_at LIMIT 1`,
          [tenantId],
        );
        const addr = loc.rows[0]?.address;
        if (addr && typeof addr === "object" && typeof addr.state === "string") {
          stateCode = addr.state.toUpperCase().slice(0, 2);
        } else if (typeof addr === "string") {
          const m = addr.match(/,\s*([A-Za-z]{2})\s+\d{5}/);
          if (m) stateCode = m[1].toUpperCase();
        }
      } catch { /* state stays blank */ }
      await client.query(
        `INSERT INTO public.acct_tax_rules
           (id, tenant_id, jurisdiction, tax_type, state_code, tax_code, rate,
            classification, auto_calc, is_active, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'State Sales Tax', 'STATE_SALES_TAX', $2, NULL, $3,
                 'ALL_SALES', true, true, now(), now())`,
        [tenantId, stateCode, target],
      );
    }
    return activeRules(client, tenantId);
  }

  const current = round3(rules.reduce((sum, r) => sum + Number(r.rate || 0), 0));
  let delta = round3(target - current);
  if (delta !== 0) {
    for (const rule of rules) {
      if (delta === 0) break;
      const next = round3(Math.max(0, Number(rule.rate || 0) + delta));
      const absorbed = round3(next - Number(rule.rate || 0));
      if (absorbed !== 0) {
        await client.query(
          `UPDATE public.acct_tax_rules SET rate = $2, updated_at = now() WHERE id = $1::uuid AND tenant_id = $3`,
          [rule.id, next, tenantId],
        );
        rule.rate = next;
        delta = round3(delta - absorbed);
      }
    }
  }
  return activeRules(client, tenantId);
}
