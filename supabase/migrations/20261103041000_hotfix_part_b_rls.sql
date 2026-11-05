-- Unsaid hotfix  Part B: turn on RLS for four platform tables that have none.
-- RUN SEPARATELY, AFTER Part A, and only after checking how the app reaches these tables:
--   * service_role / server-side calls bypass RLS and are unaffected.
--   * calls made with a logged-in user's key will now be filtered by these policies.
--   * calls made with the anon key will return nothing.
-- Not touched: ad_events (likely public ingestion), supplier_category_memory,
-- supplier_category_visibility (confirm intent first).

BEGIN;

ALTER TABLE public.platform_create_favorites     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_saved_views          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_custom_fields        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_form_field_visibility ENABLE ROW LEVEL SECURITY;

-- Per-user tables: own rows only.
DROP POLICY IF EXISTS platform_create_favorites_own ON public.platform_create_favorites;
CREATE POLICY platform_create_favorites_own ON public.platform_create_favorites
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS platform_saved_views_own ON public.platform_saved_views;
CREATE POLICY platform_saved_views_own ON public.platform_saved_views
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- is_shared views are NOT exposed to other users: the table has no tenant_id, so sharing
-- cannot be scoped safely. Add a tenant_id column before enabling shared views.

-- Tenant tables: tenant_id NULL = global defaults (read-only to everyone signed in).
DROP POLICY IF EXISTS platform_custom_fields_select ON public.platform_custom_fields;
DROP POLICY IF EXISTS platform_custom_fields_write  ON public.platform_custom_fields;
CREATE POLICY platform_custom_fields_select ON public.platform_custom_fields
  FOR SELECT USING (tenant_id IS NULL OR platform_is_tenant_member(tenant_id));
CREATE POLICY platform_custom_fields_write ON public.platform_custom_fields
  FOR ALL USING (tenant_id IS NOT NULL AND platform_is_tenant_member(tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND platform_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS platform_form_field_visibility_select ON public.platform_form_field_visibility;
DROP POLICY IF EXISTS platform_form_field_visibility_write  ON public.platform_form_field_visibility;
CREATE POLICY platform_form_field_visibility_select ON public.platform_form_field_visibility
  FOR SELECT USING (tenant_id IS NULL OR platform_is_tenant_member(tenant_id));
CREATE POLICY platform_form_field_visibility_write ON public.platform_form_field_visibility
  FOR ALL USING (tenant_id IS NOT NULL AND platform_is_tenant_member(tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND platform_is_tenant_member(tenant_id));

COMMIT;

-- ROLLBACK:
--   ALTER TABLE public.platform_create_favorites      DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.platform_saved_views           DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.platform_custom_fields         DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.platform_form_field_visibility DISABLE ROW LEVEL SECURITY;
