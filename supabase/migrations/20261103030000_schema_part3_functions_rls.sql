-- Unsaid platform schema — part 3 of 3: functions, triggers, row-level security
-- Generated 2026-11-02 from the live production catalog (Supabase project pcwwvfgxnrglmmpbfqhf)
-- after the white-label rename. Run the three parts in order on a fresh
-- Supabase project to generate the full schema. Schema only, no data.

-- Functions
CREATE OR REPLACE FUNCTION public.acct_audit_row_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
BEGIN
    IF TG_OP='INSERT' THEN INSERT INTO acct_audit_log(tenant_id,actor_user_id,action,table_name,record_id,after_data) VALUES(NEW.tenant_id,auth.uid(),TG_OP,TG_TABLE_NAME,TO_JSONB(NEW)->>'id',TO_JSONB(NEW)); RETURN NEW;
    ELSIF TG_OP='UPDATE' THEN INSERT INTO acct_audit_log(tenant_id,actor_user_id,action,table_name,record_id,before_data,after_data) VALUES(COALESCE(NEW.tenant_id,OLD.tenant_id),auth.uid(),TG_OP,TG_TABLE_NAME,TO_JSONB(NEW)->>'id',TO_JSONB(OLD),TO_JSONB(NEW)); RETURN NEW;
    ELSE INSERT INTO acct_audit_log(tenant_id,actor_user_id,action,table_name,record_id,before_data) VALUES(OLD.tenant_id,auth.uid(),TG_OP,TG_TABLE_NAME,TO_JSONB(OLD)->>'id',TO_JSONB(OLD)); RETURN OLD; END IF;
END; $function$;
CREATE OR REPLACE FUNCTION public.acct_block_posted_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
BEGIN
    IF TG_TABLE_NAME='acct_journal_entries' AND OLD.status IN ('posted','reversed') THEN
        IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Posted journal entries cannot be deleted'; END IF;
        IF TG_OP='UPDATE' AND (NEW.tenant_id <> OLD.tenant_id OR NEW.book_id <> OLD.book_id OR NEW.period_id <> OLD.period_id OR NEW.entry_date <> OLD.entry_date OR NEW.currency <> OLD.currency OR NEW.status <> OLD.status) THEN RAISE EXCEPTION 'Posted journal structure is immutable; use a reversal'; END IF;
    END IF;
    IF TG_TABLE_NAME='acct_journal_lines' THEN
        IF EXISTS(SELECT 1 FROM acct_journal_entries e WHERE e.id=OLD.journal_entry_id AND e.status IN ('posted','reversed')) THEN RAISE EXCEPTION 'Posted journal lines are immutable; use a reversal'; END IF;
    END IF;
    RETURN COALESCE(NEW,OLD);
END; $function$;
CREATE OR REPLACE FUNCTION public.acct_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;
CREATE OR REPLACE FUNCTION public.acct_validate_journal_entry(p_journal_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
DECLARE v_debit numeric(24,6); v_credit numeric(24,6); v_count integer; v_status acct_posting_status;
BEGIN
    SELECT status INTO v_status FROM acct_journal_entries WHERE id=p_journal_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Journal entry % not found', p_journal_id; END IF;
    IF v_status <> 'draft' AND v_status <> 'approved' THEN RAISE EXCEPTION 'Journal entry % cannot be posted from status %', p_journal_id, v_status; END IF;
    SELECT COUNT(*), COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO v_count,v_debit,v_credit FROM acct_journal_lines WHERE journal_entry_id=p_journal_id;
    IF v_count < 2 THEN RAISE EXCEPTION 'A journal entry requires at least two lines'; END IF;
    IF v_debit <= 0 OR v_credit <= 0 OR v_debit <> v_credit THEN RAISE EXCEPTION 'Journal % is not balanced: debit %, credit %', p_journal_id,v_debit,v_credit; END IF;
    UPDATE acct_journal_entries SET total_debit=v_debit,total_credit=v_credit,status='posted',posted_by=auth.uid(),posted_at=now() WHERE id=p_journal_id;
END; $function$;
CREATE OR REPLACE FUNCTION public.ai_intent_events_no_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'ai_intent_events is append-only: % is not permitted', TG_OP;
END;
$function$;
CREATE OR REPLACE FUNCTION public.apply_stock_movement(p_tenant_id uuid, p_inventory_item_id text, p_date date, p_type text, p_quantity numeric, p_unit_cost numeric DEFAULT 0, p_source text DEFAULT 'manual'::text, p_source_id text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
declare
  v_id           text;
  v_item         inventory_items%rowtype;
  v_new_qty      numeric(18,4);
  v_new_cost     numeric(18,4);
  v_total_cost   numeric(18,4);
begin
  select * into v_item from inventory_items
   where id = p_inventory_item_id and tenant_id = p_tenant_id;
  if not found then raise exception 'Inventory item not found'; end if;
  v_new_qty := v_item.quantity_on_hand + p_quantity;
  if v_new_qty < 0 then
    raise exception 'Insufficient stock for item % (current: %, requested: %)',
      v_item.sku, v_item.quantity_on_hand, abs(p_quantity);
  end if;
  if p_quantity > 0 and p_unit_cost > 0 then
    v_total_cost := (v_item.quantity_on_hand * coalesce(v_item.unit_cost, 0)) + (p_quantity * p_unit_cost);
    v_new_cost := case when v_new_qty > 0 then v_total_cost / v_new_qty else 0 end;
  else
    v_new_cost := coalesce(v_item.unit_cost, 0);
  end if;
  insert into inventory_transactions (
    tenant_id, inventory_item_id, transaction_type, quantity, unit_cost,
    reason, reference_number, notes, performed_by
  ) values (
    p_tenant_id, p_inventory_item_id, p_type, p_quantity, p_unit_cost,
    p_source, p_reference, p_notes, auth.uid()::text
  )
  returning id into v_id;
  update inventory_items
     set quantity_on_hand = v_new_qty,
         unit_cost = v_new_cost,
         updated_at = now()
   where id = p_inventory_item_id;
  return v_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.assign_lms_role(p_tenant_id uuid, p_user_id uuid, p_role text, p_assigned_by uuid DEFAULT NULL::uuid, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(assignment_id uuid, role_id uuid, role text, status text, is_active boolean, assigned_at timestamp with time zone, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_role_id        uuid;
  v_assignment_id  uuid;
  v_now            timestamptz := now();
BEGIN
  IF p_role NOT IN (
        'learner', 'instructor', 'support_navigator',
        'org_admin', 'platform_admin'
      ) THEN
    RAISE EXCEPTION 'invalid_lms_role: %', p_role
      USING ERRCODE = 'check_violation',
            DETAIL = 'allowed: learner, instructor, support_navigator, org_admin, platform_admin';
  END IF;

  INSERT INTO lms.lms_roles AS lr
        (tenant_id, user_id, role, status, assigned_by, assigned_at, expires_at, metadata)
  VALUES (p_tenant_id, p_user_id, p_role, 'active', p_assigned_by, v_now, p_expires_at, p_metadata)
  ON CONFLICT ON CONSTRAINT ux_lms_roles_tenant_user_role DO UPDATE
     SET status        = 'active',
         assigned_by   = EXCLUDED.assigned_by,
         assigned_at   = v_now,
         expires_at    = EXCLUDED.expires_at,
         revoked_at    = NULL,
         revoke_reason = NULL,
         metadata      = lr.metadata || EXCLUDED.metadata,
         updated_at    = v_now
  RETURNING lr.id INTO v_role_id;

  UPDATE lms.lms_role_assignments AS lra
     SET is_active     = false,
         revoked_at    = v_now,
         revoked_by    = p_assigned_by,
         revoke_reason = 'superseded by new assignment',
         updated_at    = v_now
   WHERE lra.user_id   = p_user_id
     AND lra.tenant_id = p_tenant_id
     AND lra.role_id   = v_role_id
     AND lra.is_active = true;

  INSERT INTO lms.lms_role_assignments
        (tenant_id, user_id, role_id, scope_type, assigned_by, assigned_at, expires_at, is_active, metadata)
  VALUES (p_tenant_id, p_user_id, v_role_id, 'tenant', p_assigned_by, v_now, p_expires_at, true, p_metadata)
  RETURNING id INTO v_assignment_id;

  RETURN QUERY
    SELECT a.id        AS assignment_id,
           v_role_id   AS role_id,
           p_role      AS role,
           r.status    AS status,
           a.is_active AS is_active,
           a.assigned_at,
           a.expires_at
      FROM lms.lms_role_assignments a
      JOIN lms.lms_roles r ON r.id = v_role_id
     WHERE a.id = v_assignment_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.audit_portal_account_links()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
    INSERT INTO public.crm_audit_log (
        tenant_id, actor_user_id, entity_type, entity_id, action, after_data, occurred_at
    ) VALUES (
        COALESCE(NEW.tenant_id, '00000000-0000-0000-0000-000000000001'::uuid),
        NULL,
        'portal_account_link',
        NEW.id,
        TG_OP,
        jsonb_build_object(
            'provider',            NEW.provider,
            'provider_sub',        NEW.provider_sub,
            'email',               NEW.email,
            'linked_entity_type',  NEW.entity_type,
            'linked_entity_id',    NEW.entity_id,
            'tenant_id',           NEW.tenant_id,
            'display_name',        NEW.display_name
        ),
        NOW()
    );
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW; -- best-effort: never block sign-in on audit failure
END;
$function$;
CREATE OR REPLACE FUNCTION public.cms_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;
CREATE OR REPLACE FUNCTION public.convert_sales_order_to_invoice(p_tenant_id uuid, p_so_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
declare
  v_so        sales_orders%rowtype;
  v_inv_id    uuid;
  v_inv_number text;
  v_item      sales_order_items%rowtype;
  v_entity    uuid;
  v_acct_cust uuid;
  v_ar_acct   uuid;
  v_rev_acct  uuid;
  v_line_no   int := 0;
begin
  select * into v_so from sales_orders where id = p_so_id and tenant_id = p_tenant_id;
  if not found then raise exception 'Sales order not found'; end if;
  if v_so.converted_invoice_id is not null then
    return v_so.converted_invoice_id;
  end if;

  select id into v_entity from acct_entities where tenant_id = p_tenant_id limit 1;
  if v_entity is null then
    raise exception 'No accounting entity found for tenant. Seed acct_entities first.';
  end if;

  select id into v_ar_acct from acct_chart_of_accounts
   where tenant_id = p_tenant_id and code = '1200' limit 1;
  if v_ar_acct is null then
    raise exception 'No Accounts Receivable account found. Seed enterprise chart of accounts.';
  end if;

  select id into v_acct_cust from acct_customers
   where tenant_id = p_tenant_id and external_customer_id = v_so.customer_id::text limit 1;
  if v_acct_cust is null then
    insert into acct_customers (tenant_id, customer_number, external_customer_id,
                                legal_name, currency, ar_account_id)
    values (p_tenant_id,
            'CUST-' || upper(substr(v_so.customer_id::text, 1, 8)),
            v_so.customer_id::text, 'Customer', coalesce(v_so.currency, 'USD'), v_ar_acct)
    returning id into v_acct_cust;
  end if;

  select coalesce(
           (select default_revenue_account_id from acct_customers where id = v_acct_cust),
           (select id from acct_chart_of_accounts where tenant_id = p_tenant_id and code = '4000' limit 1))
    into v_rev_acct;

  select 'INV-' || to_char(now(), 'YYYY') || '-' || lpad((count(*) + 1)::text, 4, '0')
    into v_inv_number
    from acct_ar_invoices where tenant_id = p_tenant_id;

  insert into acct_ar_invoices (
    tenant_id, entity_id, customer_id, source_customer_id,
    invoice_number, invoice_date, due_date, currency,
    subtotal, tax_total, discount_total, total, amount_paid, status
  ) values (
    p_tenant_id, v_entity, v_acct_cust, v_so.customer_id::text,
    v_inv_number, current_date, current_date + 30, coalesce(v_so.currency, 'USD'),
    v_so.subtotal::numeric, (v_so.total::numeric - v_so.subtotal::numeric), 0,
    v_so.total::numeric, 0, 'posted'
  )
  returning id into v_inv_id;

  for v_item in select * from sales_order_items where sales_order_id = p_so_id loop
    v_line_no := v_line_no + 1;
    insert into acct_ar_invoice_lines (invoice_id, line_no, description, quantity, unit_price, discount_amount, line_subtotal, tax_amount, revenue_account_id)
    values (v_inv_id, v_line_no, v_item.description, v_item.quantity::numeric, v_item.unit_price,
            0, (v_item.quantity * v_item.unit_price), 0, v_rev_acct);
  end loop;

  update sales_orders
     set converted_invoice_id = v_inv_id::text, status = 'closed', updated_at = now()
   where id = p_so_id;

  return v_inv_id::text;
end;
$function$;
CREATE OR REPLACE FUNCTION public.create_purchase_order(p_tenant_id uuid, p_number text, p_vendor_id text, p_issue_date date, p_expected_date date DEFAULT NULL::date, p_currency text DEFAULT 'USD'::text, p_items jsonb DEFAULT NULL::jsonb, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
declare
  v_po_id      uuid;
  v_item       jsonb;
  v_subtotal   numeric(18,4) := 0;
  v_tax_total  numeric(18,4) := 0;
  v_total      numeric(18,4) := 0;
  v_line_amt   numeric(18,4);
  v_tax_rate   numeric(6,4);
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No purchase order items provided';
  end if;

  insert into purchase_orders (tenant_id, number, vendor_id, issue_date, expected_date, currency, status, notes)
  values (p_tenant_id, p_number, p_vendor_id, p_issue_date, p_expected_date, p_currency, 'draft', p_notes)
  returning id into v_po_id;

  for v_item in select jsonb_array_elements(p_items) loop
    v_line_amt := coalesce((v_item->>'quantity')::numeric, 1) * coalesce((v_item->>'unit_price')::numeric, 0)
                  - coalesce((v_item->>'discount')::numeric, 0);
    v_subtotal := v_subtotal + v_line_amt;

    v_tax_rate := 0;
    if v_item ? 'tax_id' and (v_item->>'tax_id') is not null then
      select rate into v_tax_rate from taxes where id = (v_item->>'tax_id')::uuid;
    end if;
    v_tax_total := v_tax_total + (v_line_amt * v_tax_rate);

    insert into purchase_order_items (purchase_order_id, product_id, inventory_item_id, account_id, tax_id,
                                       description, quantity, unit_price, discount, position)
    values (v_po_id,
            nullif(v_item->>'product_id','')::text,
            nullif(v_item->>'inventory_item_id','')::text,
            (v_item->>'account_id')::uuid,
            nullif(v_item->>'tax_id','')::uuid,
            v_item->>'description',
            coalesce((v_item->>'quantity')::numeric, 1),
            coalesce((v_item->>'unit_price')::numeric, 0),
            coalesce((v_item->>'discount')::numeric, 0),
            coalesce((v_item->>'position')::int, 0));
  end loop;

  v_total := v_subtotal + v_tax_total;
  update purchase_orders set subtotal = v_subtotal, tax_total = v_tax_total, total = v_total
   where id = v_po_id;

  return v_po_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.create_sales_order(p_tenant_id uuid, p_number text, p_customer_id text, p_issue_date date, p_expected_date date DEFAULT NULL::date, p_currency text DEFAULT 'USD'::text, p_items jsonb DEFAULT NULL::jsonb, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
declare
  v_so_id      uuid;
  v_item       jsonb;
  v_subtotal   numeric(18,4) := 0;
  v_tax_total  numeric(18,4) := 0;
  v_total      numeric(18,4) := 0;
  v_line_amt   numeric(18,4);
  v_tax_rate   numeric(6,4);
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No sales order items provided';
  end if;

  insert into sales_orders (tenant_id, number, customer_id, issue_date, expected_date, currency, status, notes)
  values (p_tenant_id, p_number, p_customer_id, p_issue_date, p_expected_date, p_currency, 'draft', p_notes)
  returning id into v_so_id;

  for v_item in select jsonb_array_elements(p_items) loop
    v_line_amt := coalesce((v_item->>'quantity')::numeric, 1) * coalesce((v_item->>'unit_price')::numeric, 0)
                  - coalesce((v_item->>'discount')::numeric, 0);
    v_subtotal := v_subtotal + v_line_amt;

    v_tax_rate := 0;
    if v_item ? 'tax_id' and (v_item->>'tax_id') is not null then
      select rate into v_tax_rate from taxes where id = (v_item->>'tax_id')::uuid;
    end if;
    v_tax_total := v_tax_total + (v_line_amt * v_tax_rate);

    insert into sales_order_items (sales_order_id, product_id, inventory_item_id, account_id, tax_id,
                                   description, quantity, unit_price, discount, position)
    values (v_so_id,
            nullif(v_item->>'product_id','')::text,
            nullif(v_item->>'inventory_item_id','')::text,
            (v_item->>'account_id')::uuid,
            nullif(v_item->>'tax_id','')::uuid,
            v_item->>'description',
            coalesce((v_item->>'quantity')::numeric, 1),
            coalesce((v_item->>'unit_price')::numeric, 0),
            coalesce((v_item->>'discount')::numeric, 0),
            coalesce((v_item->>'position')::int, 0));
  end loop;

  v_total := v_subtotal + v_tax_total;
  update sales_orders set subtotal = v_subtotal, tax_total = v_tax_total, total = v_total
   where id = v_so_id;

  return v_so_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.current_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select active_tenant_id from public.profiles where id = auth.uid()
$function$;
CREATE OR REPLACE FUNCTION public.current_tenant_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
  select tenant_id
  from public.tenant_memberships
  where user_id = auth.uid()
    and active = true;
$function$;
CREATE OR REPLACE FUNCTION public.dmca_takedown_log_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_setting('app.allow_takedown_log_mutation', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'dmca_takedown_log is append-only; mutation requires the retention path';
END
$function$;
CREATE OR REPLACE FUNCTION public.effective_filter_node(p_node uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT a.id
    FROM taxonomy_nodes n
    JOIN taxonomy_nodes a ON a.tenant_id = n.tenant_id AND (n.path = a.path OR n.path LIKE a.path || '/%')
   WHERE n.id = p_node
     AND EXISTS (SELECT 1 FROM node_filters f WHERE f.node_id = a.id)
   ORDER BY a.depth DESC
   LIMIT 1;
$function$;
CREATE OR REPLACE FUNCTION public.enqueue_sync_job(p_tenant_id uuid, p_catalog_item_id uuid, p_target text DEFAULT 'both'::text, p_operation text DEFAULT 'upsert'::text)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_job_id UUID;
BEGIN
  INSERT INTO sync_jobs (tenant_id, catalog_item_id, target, operation)
  VALUES (p_tenant_id, p_catalog_item_id, p_target, p_operation)
  RETURNING id INTO v_job_id;
  RETURN v_job_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.ensure_ad_events_partition(p_month date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start date := date_trunc('month', p_month)::date;
  v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name  text := 'ad_events_' || to_char(v_start, 'YYYY_MM');
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.ad_events FOR VALUES FROM (%L) TO (%L)',
    v_name, v_start, v_end
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.erp_next_document_number(p_tenant_id uuid, p_document_type text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
DECLARE v_prefix text; v_next bigint; v_padding integer;
BEGIN
    INSERT INTO erp_document_sequences(tenant_id, document_type, prefix) VALUES (p_tenant_id, p_document_type, UPPER(LEFT(p_document_type, 3)) || '-') ON CONFLICT (tenant_id, document_type) DO NOTHING;
    SELECT prefix, next_number, padding INTO v_prefix, v_next, v_padding FROM erp_document_sequences WHERE tenant_id = p_tenant_id AND document_type = p_document_type FOR UPDATE;
    UPDATE erp_document_sequences SET next_number = next_number + 1, updated_at = now() WHERE tenant_id = p_tenant_id AND document_type = p_document_type;
    RETURN v_prefix || LPAD(v_next::text, v_padding, '0');
END; $function$;
CREATE OR REPLACE FUNCTION public.erp_rebuild_stock_balances(p_tenant uuid, p_sku uuid DEFAULT NULL::uuid, p_warehouse_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.erp_inventory_balances b
   WHERE b.tenant_id = p_tenant
     AND (p_sku IS NULL OR b.sku_id = p_sku)
     AND (p_warehouse_id IS NULL OR b.warehouse_id = p_warehouse_id);

  INSERT INTO public.erp_inventory_balances
    (id, tenant_id, sku_id, warehouse_id, location_id, inventory_status,
     on_hand, reserved, allocated, picked, packed, in_transit,
     unit_cost, bin_location, created_at, updated_at)
  SELECT gen_random_uuid(), sl.tenant_id, sl.sku_id, sl.warehouse_id,
         sl.location_id, 'available'::public.erp_inventory_status,
         sl.on_hand, sl.reserved, sl.allocated, 0, 0, 0,
         COALESCE(s.standard_cost, 0), loc.code, now(), now()
    FROM public.erp_stock_levels sl
    JOIN public.erp_product_skus s
      ON s.id = sl.sku_id AND s.tenant_id = sl.tenant_id
    LEFT JOIN public.erp_warehouse_locations loc
      ON loc.id = sl.location_id AND loc.tenant_id = sl.tenant_id
   WHERE sl.tenant_id = p_tenant
     AND sl.location_id IS NOT NULL
     AND (p_sku IS NULL OR sl.sku_id = p_sku)
     AND (p_warehouse_id IS NULL OR sl.warehouse_id = p_warehouse_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
CREATE OR REPLACE FUNCTION public.erp_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$;
CREATE OR REPLACE FUNCTION public.erp_validate_order_line_quantities()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
BEGIN
    IF NEW.quantity_reserved < NEW.quantity_allocated THEN RAISE EXCEPTION 'Allocated quantity cannot exceed reserved quantity'; END IF;
    IF NEW.quantity_allocated < NEW.quantity_picked THEN RAISE EXCEPTION 'Picked quantity cannot exceed allocated quantity'; END IF;
    IF NEW.quantity_picked < NEW.quantity_packed THEN RAISE EXCEPTION 'Packed quantity cannot exceed picked quantity'; END IF;
    IF NEW.quantity_packed < NEW.quantity_shipped THEN RAISE EXCEPTION 'Shipped quantity cannot exceed packed quantity'; END IF;
    RETURN NEW;
END; $function$;
CREATE OR REPLACE FUNCTION public.first_party_seller(p_tenant uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT id FROM sellers WHERE tenant_id = p_tenant AND seller_type = 'first_party';
$function$;
CREATE OR REPLACE FUNCTION public.fulfillment_package_lines_quantity_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  ordered_qty integer;
  packaged_qty integer;
BEGIN
  SELECT quantity INTO ordered_qty
    FROM public.commerce_order_items
   WHERE id = NEW.order_item_id
   FOR UPDATE;
  IF ordered_qty IS NULL THEN
    RAISE EXCEPTION 'fulfillment package line references unknown order item %', NEW.order_item_id;
  END IF;
  SELECT COALESCE(SUM(quantity), 0) INTO packaged_qty
    FROM public.fulfillment_package_lines
   WHERE order_item_id = NEW.order_item_id
     AND id IS DISTINCT FROM NEW.id;
  IF packaged_qty + NEW.quantity > ordered_qty THEN
    RAISE EXCEPTION 'packaged quantity % exceeds ordered quantity % for order item %',
      packaged_qty + NEW.quantity, ordered_qty, NEW.order_item_id;
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.generate_customer_statement(p_tenant_id uuid, p_customer_id text, p_period_start date, p_period_end date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
declare
  v_id           uuid;
  v_opening      numeric(18,4) := 0;
  v_closing      numeric(18,4) := 0;
  v_payload      jsonb;
  v_ar_acct      uuid;
begin
  select id into v_ar_acct from chart_of_accounts
   where tenant_id = p_tenant_id and code = '1100' limit 1;

  select coalesce(sum(l.debit - l.credit), 0)
    into v_opening
    from journal_lines l
   where l.tenant_id = p_tenant_id
     and l.customer_id = p_customer_id
     and l.account_id = v_ar_acct
     and exists (select 1 from journal_entries e where e.id = l.journal_id and e.entry_date < p_period_start);

  select coalesce(sum(l.debit - l.credit), 0)
    into v_closing
    from journal_lines l
   where l.tenant_id = p_tenant_id
     and l.customer_id = p_customer_id
     and l.account_id = v_ar_acct
     and exists (select 1 from journal_entries e where e.id = l.journal_id and e.entry_date <= p_period_end);

  select jsonb_build_object(
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id::text, 'number', i.invoice_number, 'status', i.status::text,
        'total', i.total, 'amount_paid', coalesce(i.amount_paid,0),
        'issue_date', i.invoice_date
      ))
      from acct_ar_invoices i
      where i.tenant_id = p_tenant_id
        and (i.source_customer_id = p_customer_id
             or i.customer_id in (select ac.id from acct_customers ac
                                   where ac.tenant_id = p_tenant_id
                                     and ac.external_customer_id = p_customer_id))
        and i.invoice_date between p_period_start and p_period_end
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'amount', p.amount, 'date', (p.created_at)::date,
        'method', p.metadata->>'method'
      ))
      from payment_transactions p
      where p.tenant_id = p_tenant_id
        and p.customer_id = p_customer_id
        and p.created_at::date between p_period_start and p_period_end
    ), '[]'::jsonb)
  ) into v_payload;

  insert into customer_statements (tenant_id, customer_id, statement_type, period_start, period_end,
                                    opening_balance, closing_balance, payload)
  values (p_tenant_id, p_customer_id, 'ar_aging', p_period_start, p_period_end,
          v_opening, v_closing, v_payload)
  returning id into v_id;

  return v_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.get_auth_user_by_email(p_email text)
 RETURNS TABLE(id uuid, email text, raw_user_meta_data jsonb, created_at timestamp with time zone, last_sign_in_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select
    u.id,
    u.email,
    u.raw_user_meta_data,
    u.created_at,
    u.last_sign_in_at
  from auth.users u
  where lower(coalesce(u.email, '')) = lower(coalesce(p_email, ''))
  limit 1;
$function$;
CREATE OR REPLACE FUNCTION public.get_pending_sync_jobs(p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, tenant_id uuid, catalog_item_id uuid, target text, operation text, attempts integer)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT sj.id, sj.tenant_id, sj.catalog_item_id, sj.target, sj.operation, sj.attempts
  FROM sync_jobs sj
  WHERE sj.status = 'pending'
  ORDER BY sj.created_at ASC
  LIMIT p_limit
  FOR UPDATE SKIP LOCKED;
END;
$function$;
CREATE OR REPLACE FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_query_trgm$function$;
CREATE OR REPLACE FUNCTION public.gin_extract_value_trgm(text, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_value_trgm$function$;
CREATE OR REPLACE FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_consistent$function$;
CREATE OR REPLACE FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal)
 RETURNS "char"
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_triconsistent$function$;
CREATE OR REPLACE FUNCTION public.global_search(search_query text, result_limit integer DEFAULT 50, requested_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(entity_type text, entity_id text, title text, snippet text, rank real, data jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
DECLARE
  q tsquery;
  effective_tenant_id uuid;
BEGIN
  IF search_query IS NULL OR trim(search_query) = '' THEN
    RETURN;
  END IF;

  q := websearch_to_tsquery('english'::regconfig, search_query);

  IF requested_tenant_id IS NOT NULL THEN
    effective_tenant_id := requested_tenant_id;
  ELSIF (SELECT auth.uid()) IS NOT NULL THEN
    SELECT tm.tenant_id INTO effective_tenant_id
    FROM public.tenant_memberships tm
    WHERE tm.user_id = (SELECT auth.uid()) AND tm.active = true
    LIMIT 1;
  END IF;

  RETURN QUERY
  WITH results(entity_type, entity_id, title, snippet, rank, data) AS (
    SELECT 'customers'::text, c.id, concat_ws(' ', c."firstName", c."lastName"),
           ts_headline('english'::regconfig, concat_ws(' ', c."firstName", c."lastName", c.email), q),
           ts_rank(c.search_vector, q),
           jsonb_build_object('id', c.id, 'email', c.email, 'firstName', c."firstName", 'lastName', c."lastName")
    FROM public.customers c
    WHERE c.search_vector @@ q
      AND (effective_tenant_id IS NULL OR c.tenant_id IS NULL OR c.tenant_id = effective_tenant_id)

    UNION ALL
    SELECT 'dogs'::text, d.id, d.name,
           ts_headline('english'::regconfig, concat_ws(' ', d.name, d.breed, d."breedName", d.notes), q),
           ts_rank(d.search_vector, q),
           jsonb_build_object('id', d.id, 'name', d.name, 'breed', d.breed, 'customerId', d."customerId")
    FROM public.dogs d
    WHERE d.search_vector @@ q
      AND (effective_tenant_id IS NULL OR d.tenant_id IS NULL OR d.tenant_id = effective_tenant_id)

    UNION ALL
    SELECT 'staff'::text, s.id, s.name,
           ts_headline('english'::regconfig, concat_ws(' ', s.name, s.role, s.bio), q),
           ts_rank(s.search_vector, q),
           jsonb_build_object('id', s.id, 'name', s.name, 'role', s.role, 'email', s.email)
    FROM public.staff s
    WHERE s.search_vector @@ q
      AND (effective_tenant_id IS NULL OR s.tenant_id IS NULL OR s.tenant_id = effective_tenant_id)

    UNION ALL
    SELECT 'services'::text, s.id, s.title,
           ts_headline('english'::regconfig, concat_ws(' ', s.title, s.description, s.icon), q),
           ts_rank(s.search_vector, q),
           jsonb_build_object('id', s.id, 'title', s.title, 'description', s.description)
    FROM public.services s
    WHERE s.search_vector @@ q
      AND (effective_tenant_id IS NULL OR s.tenant_id IS NULL OR s.tenant_id = effective_tenant_id)

    UNION ALL
    SELECT 'bookings'::text, b.id, concat_ws(' - ', b."ownerName", b."dogName", b.service),
           ts_headline('english'::regconfig, concat_ws(' ', b."ownerName", b."dogName", b.breed, b.service, b.notes, b.email, b.phone), q),
           ts_rank(b.search_vector, q),
           jsonb_build_object('id', b.id, 'ownerName', b."ownerName", 'dogName', b."dogName", 'status', b.status)
    FROM public.bookings b
    WHERE b.search_vector @@ q
      AND (effective_tenant_id IS NULL OR b.tenant_id IS NULL OR b.tenant_id = effective_tenant_id)

    UNION ALL
    SELECT 'orders'::text, o.id, concat_ws(' - ', o.id, o.status),
           ts_headline('english'::regconfig, concat_ws(' ', o.id, o.status, o.email, o.notes, o."shippingAddress", o.tracking_number), q),
           ts_rank(o.search_vector, q),
           jsonb_build_object('id', o.id, 'customerId', o."customerId", 'status', o.status)
    FROM public.orders o
    WHERE o.search_vector @@ q
      AND (effective_tenant_id IS NULL OR o.tenant_id IS NULL OR o.tenant_id = effective_tenant_id)

    UNION ALL
    SELECT 'order_items'::text, oi.id, oi.name,
           ts_headline('english'::regconfig, concat_ws(' ', oi.name, oi."unitPrice"), q),
           ts_rank(oi.search_vector, q),
           jsonb_build_object('id', oi.id, 'orderId', oi."orderId", 'productId', oi."productId", 'name', oi.name)
    FROM public.order_items oi
    WHERE oi.search_vector @@ q
      AND (effective_tenant_id IS NULL OR oi.tenant_id IS NULL OR oi.tenant_id = effective_tenant_id)

    UNION ALL
    SELECT 'inventory_items'::text, i.id, concat_ws(' - ', i.sku, i.name),
           ts_headline('english'::regconfig, concat_ws(' ', i.sku, i.name, i.description, i.category, i.brand, i.supplier, i.location), q),
           ts_rank(i.search_vector, q),
           jsonb_build_object('id', i.id, 'sku', i.sku, 'name', i.name, 'category', i.category)
    FROM public.inventory_items i
    WHERE i.search_vector @@ q
      AND (effective_tenant_id IS NULL OR i.tenant_id IS NULL OR i.tenant_id = effective_tenant_id)

    UNION ALL
    SELECT 'payments'::text, p.id, concat_ws(' - ', p.type, p.status, p.amount),
           ts_headline('english'::regconfig, concat_ws(' ', p.type, p.status, p.amount, p."stripePaymentIntentId"), q),
           ts_rank(p.search_vector, q),
           jsonb_build_object('id', p.id, 'bookingId', p."bookingId", 'customerId', p."customerId", 'status', p.status, 'amount', p.amount)
    FROM public.payments p
    WHERE p.search_vector @@ q
      AND (effective_tenant_id IS NULL OR p.tenant_id IS NULL OR p.tenant_id = effective_tenant_id)

    UNION ALL
    SELECT 'invoices'::text, i.id::text, concat_ws(' - ', i.invoice_number, i.status::text, i.total::text),
           ts_headline('english'::regconfig, concat_ws(' ', i.invoice_number, i.status::text, i.total::text, i.external_id), q),
           ts_rank(to_tsvector('english'::regconfig, concat_ws(' ', i.invoice_number, i.status::text, i.total::text, i.external_id)), q),
           jsonb_build_object('id', i.id::text, 'customerId', coalesce(i.source_customer_id, (select ac.external_customer_id from public.acct_customers ac where ac.id = i.customer_id)), 'number', i.invoice_number, 'status', i.status::text, 'total', i.total::text)
    FROM public.acct_ar_invoices i
    WHERE to_tsvector('english'::regconfig, concat_ws(' ', i.invoice_number, i.status::text, i.total::text, i.external_id)) @@ q
      AND (effective_tenant_id IS NULL OR i.tenant_id = effective_tenant_id)
  )
  SELECT r.entity_type, r.entity_id, r.title, r.snippet, r.rank, r.data
  FROM results r
  ORDER BY r.rank DESC
  LIMIT result_limit;
END;
$function$;
CREATE OR REPLACE FUNCTION public.gtrgm_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_compress$function$;
CREATE OR REPLACE FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_consistent$function$;
CREATE OR REPLACE FUNCTION public.gtrgm_decompress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_decompress$function$;
CREATE OR REPLACE FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_distance$function$;
CREATE OR REPLACE FUNCTION public.gtrgm_in(cstring)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_in$function$;
CREATE OR REPLACE FUNCTION public.gtrgm_options(internal)
 RETURNS void
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE
AS '$libdir/pg_trgm', $function$gtrgm_options$function$;
CREATE OR REPLACE FUNCTION public.gtrgm_out(gtrgm)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_out$function$;
CREATE OR REPLACE FUNCTION public.gtrgm_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_penalty$function$;
CREATE OR REPLACE FUNCTION public.gtrgm_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_picksplit$function$;
CREATE OR REPLACE FUNCTION public.gtrgm_same(gtrgm, gtrgm, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_same$function$;
CREATE OR REPLACE FUNCTION public.gtrgm_union(internal, internal)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_union$function$;
CREATE OR REPLACE FUNCTION public.increment_ad_event(p_type text, p_campaign_id bigint, p_creative_id bigint DEFAULT NULL::bigint, p_placement_key text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_placement_id smallint;
BEGIN
  IF p_type NOT IN ('impression', 'click', 'conversion') THEN
    RAISE EXCEPTION 'invalid ad event type: %', p_type;
  END IF;

  SELECT id INTO v_placement_id
    FROM public.ad_placements
   WHERE code = p_placement_key;

  INSERT INTO public.ad_events (
    event_type, request_id, tracking_id, campaign_id, creative_id,
    placement_id, device_type
  ) VALUES (
    p_type, gen_random_uuid(), gen_random_uuid(), p_campaign_id, p_creative_id,
    v_placement_id, NULL
  );

  INSERT INTO public.ad_event_counters (day, campaign_id, creative_id, placement_key, impressions, clicks, conversions)
  VALUES (
    CURRENT_DATE, p_campaign_id, COALESCE(p_creative_id, 0), COALESCE(p_placement_key, ''),
    CASE WHEN p_type = 'impression' THEN 1 ELSE 0 END,
    CASE WHEN p_type = 'click' THEN 1 ELSE 0 END,
    CASE WHEN p_type = 'conversion' THEN 1 ELSE 0 END
  )
  ON CONFLICT (day, campaign_id, creative_id, placement_key)
  DO UPDATE SET
    impressions = public.ad_event_counters.impressions + EXCLUDED.impressions,
    clicks      = public.ad_event_counters.clicks + EXCLUDED.clicks,
    conversions = public.ad_event_counters.conversions + EXCLUDED.conversions;

  -- spend_cents is a GENERATED column (from spend_millicents) — never inserted.
  INSERT INTO public.ad_campaign_daily (campaign_id, delivery_date, impressions, clicks, spend_millicents)
  VALUES (
    p_campaign_id, CURRENT_DATE,
    CASE WHEN p_type = 'impression' THEN 1 ELSE 0 END,
    CASE WHEN p_type = 'click' THEN 1 ELSE 0 END,
    0
  )
  ON CONFLICT (campaign_id, delivery_date)
  DO UPDATE SET
    impressions = public.ad_campaign_daily.impressions + EXCLUDED.impressions,
    clicks      = public.ad_campaign_daily.clicks + EXCLUDED.clicks;
END;
$function$;
CREATE OR REPLACE FUNCTION public.is_consumable_type(t text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT t IS NOT NULL
    AND t !~* '\m(toys?|beds?|bowls?|dishes|apparel|collars?|leads?|harness|decor|filters?|pumps?|tools|travel|crates?|cratemats|bedding|substrates?|light|poop)\M'
    AND t ~* '\m(food|treats?|supplements?|flea|tick|litter|topper|water care|vitamins?)\M'
$function$;
CREATE OR REPLACE FUNCTION public.is_tenant_member(requested_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = requested_tenant_id
      AND tm.user_id = (SELECT auth.uid())
      AND tm.active = true
  );
$function$;
CREATE OR REPLACE FUNCTION public.normalize_product_type(pt text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT regexp_replace(lower(replace(trim(pt), '&', 'and')), '[^a-z0-9]+', ' ', 'g')
$function$;
CREATE OR REPLACE FUNCTION public.outbox_emit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_type         text;
  v_produced_by  text;
  v_subject_type text;
  v_subject_id   text;
  v_tenant       uuid;
  v_actor        uuid;
  v_data         jsonb;
  v_event_id     uuid := gen_random_uuid();
  v_aggregate    uuid;
BEGIN
  IF TG_TABLE_NAME = 'commerce_orders' AND TG_OP = 'INSERT' THEN
    v_type := 'm2.order.placed'; v_produced_by := 'M2'; v_subject_type := 'order';
    v_subject_id := NEW.id;
    v_tenant := NEW.tenant_id;
    v_data := jsonb_build_object(
      'customer_id', NEW.customer_id,
      'status', NEW.status,
      'payment_status', NEW.payment_status,
      'total_amount', NEW.total_amount
    );

  ELSIF TG_TABLE_NAME = 'commerce_payments' THEN
    IF NEW.status IS DISTINCT FROM 'succeeded' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'succeeded' THEN RETURN NEW; END IF;
    v_type := 'm3.payment.captured'; v_produced_by := 'M3'; v_subject_type := 'payment';
    v_subject_id := NEW.id::text;
    v_tenant := NEW.tenant_id;
    v_data := jsonb_build_object(
      'customer_id', NEW.customer_id,
      'amount', NEW.amount,
      'currency', NEW.currency,
      'processor_transaction_id', NEW.processor_transaction_id,
      'external_reference', NEW.external_reference
    );

  ELSIF TG_TABLE_NAME = 'crm_appointments' AND TG_OP = 'INSERT' THEN
    v_type := 'm1.appointment.created'; v_produced_by := 'M1'; v_subject_type := 'appointment';
    v_subject_id := NEW.id::text;
    v_tenant := NEW.tenant_id;
    v_actor := NEW.created_by;
    v_data := jsonb_build_object(
      'customer_id', NEW.customer_id,
      'status', NEW.status,
      'starts_at', NEW.starts_at,
      'source_channel', NEW.source_channel
    );

  ELSIF TG_TABLE_NAME = 'crm_appointments' AND TG_OP = 'UPDATE' THEN
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
      v_type := 'm1.appointment.completed';
    ELSIF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
      v_type := 'm1.appointment.cancelled';
    ELSE
      RETURN NEW;
    END IF;
    v_produced_by := 'M1'; v_subject_type := 'appointment';
    v_subject_id := NEW.id::text;
    v_tenant := NEW.tenant_id;
    v_data := jsonb_build_object(
      'customer_id', NEW.customer_id,
      'status', NEW.status,
      'from_status', OLD.status,
      'starts_at', NEW.starts_at,
      'cancellation_reason', NEW.cancellation_reason
    );

  ELSE
    RETURN NEW;
  END IF;

  v_tenant := COALESCE(v_tenant, 'b2a3b20c-9816-5518-92db-f9395c063acd'::uuid);

  BEGIN
    v_aggregate := v_subject_id::uuid;
  EXCEPTION WHEN others THEN
    v_aggregate := (
      substr(md5(v_subject_type || ':' || v_subject_id), 1, 8) || '-' ||
      substr(md5(v_subject_type || ':' || v_subject_id), 9, 4) || '-' ||
      substr(md5(v_subject_type || ':' || v_subject_id), 13, 4) || '-' ||
      substr(md5(v_subject_type || ':' || v_subject_id), 17, 4) || '-' ||
      substr(md5(v_subject_type || ':' || v_subject_id), 21, 12)
    )::uuid;
  END;

  BEGIN
    INSERT INTO public.commerce_outbox_events
      (id, tenant_id, aggregate_type, aggregate_id, event_type, payload)
    VALUES (
      v_event_id, v_tenant, v_subject_type, v_aggregate, v_type,
      jsonb_build_object(
        'id', v_event_id,
        'type', v_type,
        'version', 1,
        'produced_by', v_produced_by,
        'produced_at', now(),
        'tenant_id', v_tenant,
        'actor_id', v_actor,
        'actor_role', 'system',
        'subject_type', v_subject_type,
        'subject_id', v_subject_id,
        'correlation_id', v_event_id,
        'causation_id', NULL,
        'schema_url', '/events/' || v_type || '.v1.json',
        'data', v_data
      )
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'outbox_emit: % on % failed: %', v_type, TG_TABLE_NAME, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.outbox_emit_lifecycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_type         text;
  v_produced_by  text;
  v_subject_type text;
  v_subject_id   text;
  v_tenant       uuid;
  v_data         jsonb;
  v_event_id     uuid := gen_random_uuid();
  v_aggregate    uuid;
BEGIN
  IF TG_TABLE_NAME = 'crm_appointments' AND TG_OP = 'UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
      v_type := 'm1.appointment.confirmed';
    ELSIF NEW.status IN ('completed', 'cancelled') THEN
      RETURN NEW;
    ELSE
      v_type := 'm8.status.updated';
    END IF;
    v_produced_by := CASE WHEN v_type = 'm8.status.updated' THEN 'M8' ELSE 'M1' END;
    v_subject_type := 'appointment';
    v_subject_id := NEW.id::text;
    v_tenant := NEW.tenant_id;
    v_data := jsonb_build_object(
      'customer_id', NEW.customer_id,
      'status', NEW.status,
      'from_status', OLD.status,
      'starts_at', NEW.starts_at
    );

  ELSIF TG_TABLE_NAME = 'commerce_orders' AND TG_OP = 'UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    IF NEW.status = 'acknowledged' THEN
      v_type := 'm2.order.acknowledged';
    ELSIF NEW.status = 'shipped' THEN
      v_type := 'm2.order.shipped';
    ELSIF NEW.status = 'delivered' THEN
      v_type := 'm2.order.delivered';
    ELSIF NEW.status IN ('cancelled', 'canceled') THEN
      v_type := 'm2.order.cancelled';
    ELSE
      RETURN NEW;
    END IF;
    v_produced_by := 'M2'; v_subject_type := 'order';
    v_subject_id := NEW.id;
    v_tenant := NEW.tenant_id;
    v_data := jsonb_build_object(
      'customer_id', NEW.customer_id,
      'status', NEW.status,
      'from_status', OLD.status,
      'payment_status', NEW.payment_status,
      'total_amount', NEW.total_amount
    );

  ELSIF TG_TABLE_NAME = 'seller_listings' AND TG_OP = 'INSERT' THEN
    v_type := 'm2.listing.created'; v_produced_by := 'M2';
    v_subject_type := 'seller_listing';
    v_subject_id := NEW.id::text;
    v_tenant := NEW.tenant_id;
    v_data := jsonb_build_object(
      'seller_id', NEW.seller_id,
      'catalog_item_id', NEW.product_id,
      'status', NEW.status,
      'title', NEW.title
    );

  ELSIF TG_TABLE_NAME = 'sellers' AND TG_OP = 'UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
    IF NEW.status = 'approved' THEN
      v_type := 'm10.onboarding.completed';
    ELSIF NEW.status = 'rejected' THEN
      v_type := 'm10.onboarding.rejected';
    ELSIF NEW.status = 'suspended' THEN
      v_type := 'm10.seller.suspended';
    ELSE
      RETURN NEW;
    END IF;
    v_produced_by := 'M10'; v_subject_type := 'seller';
    v_subject_id := NEW.id::text;
    v_tenant := NEW.tenant_id;
    v_data := jsonb_build_object(
      'status', NEW.status,
      'from_status', OLD.status
    );

  ELSE
    RETURN NEW;
  END IF;

  v_tenant := COALESCE(v_tenant, 'b2a3b20c-9816-5518-92db-f9395c063acd'::uuid);

  BEGIN
    v_aggregate := v_subject_id::uuid;
  EXCEPTION WHEN others THEN
    v_aggregate := (
      substr(md5(v_subject_type || ':' || v_subject_id), 1, 8) || '-' ||
      substr(md5(v_subject_type || ':' || v_subject_id), 9, 4) || '-' ||
      substr(md5(v_subject_type || ':' || v_subject_id), 13, 4) || '-' ||
      substr(md5(v_subject_type || ':' || v_subject_id), 17, 4) || '-' ||
      substr(md5(v_subject_type || ':' || v_subject_id), 21, 12)
    )::uuid;
  END;

  BEGIN
    INSERT INTO public.commerce_outbox_events
      (id, tenant_id, aggregate_type, aggregate_id, event_type, payload)
    VALUES (
      v_event_id, v_tenant, v_subject_type, v_aggregate, v_type,
      jsonb_build_object(
        'id', v_event_id,
        'type', v_type,
        'version', 1,
        'produced_by', v_produced_by,
        'produced_at', now(),
        'tenant_id', v_tenant,
        'actor_id', NULL,
        'actor_role', 'system',
        'subject_type', v_subject_type,
        'subject_id', v_subject_id,
        'correlation_id', v_event_id,
        'causation_id', NULL,
        'schema_url', '/events/' || v_type || '.v1.json',
        'data', v_data
      )
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'outbox_emit_lifecycle: % on % failed: %', v_type, TG_TABLE_NAME, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.paths_related(a text, b text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT a = b OR a LIKE b || '/%' OR b LIKE a || '/%';
$function$;
CREATE OR REPLACE FUNCTION public.pawzly_bump_session()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE pawzly_chat_sessions
     SET updated_at = now(),
         last_urgency = COALESCE(NEW.urgency, last_urgency)
   WHERE id = NEW.session_id;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.platform_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM platform_admins
        WHERE user_id = auth.uid()
          AND (expires_at IS NULL OR expires_at > now())
    );
$function$;
CREATE OR REPLACE FUNCTION public.platform_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;
CREATE OR REPLACE FUNCTION public.platform_user_tenant_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
    SELECT tm.tenant_id
    FROM tenant_memberships AS tm
    WHERE tm.user_id = auth.uid()
      AND tm.active = true
      AND tm.status = 'active';
$function$;
CREATE OR REPLACE FUNCTION public.post_journal(p_tenant_id uuid, p_entry_date date, p_lines jsonb, p_memo text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_source text DEFAULT 'manual'::text, p_source_id text DEFAULT NULL::text, p_currency text DEFAULT 'USD'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
declare
  v_journal_id  uuid;
  v_total_debit numeric(18,4) := 0;
  v_total_credit numeric(18,4) := 0;
  v_line jsonb;
  v_account_id uuid;
  v_debit numeric(18,4);
  v_credit numeric(18,4);
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'No journal lines provided';
  end if;
  for v_line in select jsonb_array_elements(p_lines) loop
    v_total_debit  := v_total_debit  + coalesce((v_line->>'debit')::numeric, 0);
    v_total_credit := v_total_credit + coalesce((v_line->>'credit')::numeric, 0);
  end loop;
  if v_total_debit <> v_total_credit then
    raise exception 'Journal not balanced: debits %, credits %', v_total_debit, v_total_credit;
  end if;
  insert into journal_entries (tenant_id, entry_date, memo, reference, source, source_id, currency, posted, created_by)
  values (p_tenant_id, p_entry_date, p_memo, p_reference, p_source, p_source_id, p_currency, true, auth.uid())
  returning id into v_journal_id;
  for v_line in select jsonb_array_elements(p_lines) loop
    v_account_id := (v_line->>'account_id')::uuid;
    v_debit  := coalesce((v_line->>'debit')::numeric, 0);
    v_credit := coalesce((v_line->>'credit')::numeric, 0);
    insert into journal_lines (
      journal_id, tenant_id, account_id,
      customer_id, invoice_id, payment_id, order_id, product_id, inventory_item_id,
      tax_id, description, debit, credit, fc_currency
    ) values (
      v_journal_id, p_tenant_id, v_account_id,
      nullif(v_line->>'customer_id','')::text,
      nullif(v_line->>'invoice_id','')::text,
      nullif(v_line->>'payment_id','')::text,
      nullif(v_line->>'order_id','')::text,
      nullif(v_line->>'product_id','')::text,
      nullif(v_line->>'inventory_item_id','')::text,
      nullif(v_line->>'tax_id','')::uuid,
      v_line->>'description',
      v_debit, v_credit,
      p_currency
    );
  end loop;
  return v_journal_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.recompute_category_counts()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE taxonomy_nodes n
     SET product_count = COALESCE((
       SELECT count(*) FROM products p
       WHERE p.category_id = n.id AND p.status = 'live'
     ), 0);
END $function$;
CREATE OR REPLACE FUNCTION public.retention_prune(p_max_per_table integer DEFAULT 100000)
 RETURNS TABLE(table_name text, deleted_rows bigint)
 LANGUAGE plpgsql
AS $function$
DECLARE
  batch integer;
  n integer;
  total bigint;
BEGIN
  total := 0;
  LOOP
    DELETE FROM public.analytics_events WHERE ctid IN (
      SELECT ctid FROM public.analytics_events
       WHERE created_at < now() - interval '540 days' LIMIT 10000);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
    EXIT WHEN n = 0 OR total >= p_max_per_table;
  END LOOP;
  RETURN QUERY SELECT 'public.analytics_events', total;

  total := 0;
  LOOP
    DELETE FROM public.email_messages WHERE ctid IN (
      SELECT ctid FROM public.email_messages
       WHERE (status = 'SENT' AND "createdAt" < now() - interval '730 days')
          OR (status = 'FAILED' AND "createdAt" < now() - interval '90 days')
       LIMIT 10000);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
    EXIT WHEN n = 0 OR total >= p_max_per_table;
  END LOOP;
  RETURN QUERY SELECT 'public.email_messages', total;

  total := 0;
  LOOP
    DELETE FROM public.commerce_outbox_events WHERE ctid IN (
      SELECT ctid FROM public.commerce_outbox_events
       WHERE (status = 'published' AND created_at < now() - interval '90 days')
          OR (status = 'dead_letter' AND created_at < now() - interval '180 days')
       LIMIT 10000);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
    EXIT WHEN n = 0 OR total >= p_max_per_table;
  END LOOP;
  RETURN QUERY SELECT 'public.commerce_outbox_events', total;

  total := 0;
  LOOP
    DELETE FROM public.social_outbox_events WHERE ctid IN (
      SELECT ctid FROM public.social_outbox_events
       WHERE (status = 'done' AND created_at < now() - interval '90 days')
          OR (status = 'dead' AND created_at < now() - interval '180 days')
       LIMIT 10000);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
    EXIT WHEN n = 0 OR total >= p_max_per_table;
  END LOOP;
  RETURN QUERY SELECT 'public.social_outbox_events', total;

  total := 0;
  LOOP
    DELETE FROM public.social_publish_attempts WHERE ctid IN (
      SELECT ctid FROM public.social_publish_attempts
       WHERE finished_at IS NOT NULL AND finished_at < now() - interval '365 days'
       LIMIT 10000);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
    EXIT WHEN n = 0 OR total >= p_max_per_table;
  END LOOP;
  RETURN QUERY SELECT 'public.social_publish_attempts', total;

  total := 0;
  LOOP
    DELETE FROM public.crm_activity WHERE ctid IN (
      SELECT ctid FROM public.crm_activity
       WHERE occurred_at < now() - interval '365 days' LIMIT 10000);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
    EXIT WHEN n = 0 OR total >= p_max_per_table;
  END LOOP;
  RETURN QUERY SELECT 'public.crm_activity', total;

  total := 0;
  LOOP
    DELETE FROM public.onboarding_events WHERE ctid IN (
      SELECT e.ctid FROM public.onboarding_events e
       JOIN public.onboarding_cases c ON c.id = e.case_id
      WHERE c.state IN ('REJECTED', 'OFFBOARDED') AND e.created_at < now() - interval '365 days'
      LIMIT 10000);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
    EXIT WHEN n = 0 OR total >= p_max_per_table;
  END LOOP;
  RETURN QUERY SELECT 'public.onboarding_events', total;

  total := 0;
  LOOP
    DELETE FROM lms.notification_delivery_log WHERE ctid IN (
      SELECT ctid FROM lms.notification_delivery_log
       WHERE status IN ('sent', 'delivered', 'read', 'failed', 'bounced')
         AND created_at < now() - interval '180 days'
       LIMIT 10000);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
    EXIT WHEN n = 0 OR total >= p_max_per_table;
  END LOOP;
  RETURN QUERY SELECT 'lms.notification_delivery_log', total;

  total := 0;
  LOOP
    DELETE FROM lms.notification_queue WHERE ctid IN (
      SELECT ctid FROM lms.notification_queue
       WHERE (status = 'sent' AND sent_at < now() - interval '90 days')
          OR (status IN ('failed', 'cancelled') AND updated_at < now() - interval '90 days')
       LIMIT 10000);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
    EXIT WHEN n = 0 OR total >= p_max_per_table;
  END LOOP;
  RETURN QUERY SELECT 'lms.notification_queue', total;

  total := 0;
  LOOP
    DELETE FROM public.sync_jobs WHERE ctid IN (
      SELECT ctid FROM public.sync_jobs
       WHERE status IN ('succeeded', 'failed', 'dead') AND created_at < now() - interval '180 days'
       LIMIT 10000);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
    EXIT WHEN n = 0 OR total >= p_max_per_table;
  END LOOP;
  RETURN QUERY SELECT 'public.sync_jobs', total;
END;
$function$;
CREATE OR REPLACE FUNCTION public.revoke_lms_role(p_tenant_id uuid, p_user_id uuid, p_role text, p_revoked_by uuid DEFAULT NULL::uuid, p_revoke_reason text DEFAULT 'revoked by admin'::text)
 RETURNS TABLE(assignment_id uuid, role_id uuid, role text, revoked_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
DECLARE
  v_role_id   uuid;
  v_revoked_at timestamptz := now();
BEGIN
  IF p_role NOT IN (
        'learner', 'instructor', 'support_navigator',
        'org_admin', 'platform_admin'
      ) THEN
    RAISE EXCEPTION 'invalid_lms_role: %', p_role
      USING ERRCODE = 'check_violation',
            DETAIL = 'allowed: learner, instructor, support_navigator, org_admin, platform_admin';
  END IF;

  SELECT lr.id INTO v_role_id
    FROM lms.lms_roles AS lr
   WHERE lr.tenant_id = p_tenant_id
     AND lr.user_id   = p_user_id
     AND lr.role      = p_role
     AND lr.status    = 'active'
   FOR UPDATE;

  IF v_role_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE lms.lms_role_assignments AS lra
     SET is_active     = false,
         revoked_at    = v_revoked_at,
         revoked_by    = p_revoked_by,
         revoke_reason = p_revoke_reason,
         updated_at    = v_revoked_at
   WHERE lra.user_id   = p_user_id
     AND lra.tenant_id = p_tenant_id
     AND lra.role_id   = v_role_id
     AND lra.is_active = true;

  UPDATE lms.lms_roles AS lr
     SET status = 'revoked', revoked_at = v_revoked_at,
         revoke_reason = p_revoke_reason, updated_at = v_revoked_at
   WHERE lr.id = v_role_id;

  RETURN QUERY
    SELECT a.id          AS assignment_id,
           v_role_id    AS role_id,
           p_role        AS role,
           v_revoked_at AS revoked_at
      FROM lms.lms_role_assignments a
     WHERE a.user_id   = p_user_id
       AND a.tenant_id = p_tenant_id
       AND a.role_id  = v_role_id
       AND a.revoked_at = v_revoked_at
     LIMIT 1;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_get_balance_sheet(p_tenant_id uuid, p_as_of_date date)
 RETURNS TABLE(section text, account_code text, account_name text, account_type text, debit numeric, credit numeric, balance numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    CASE coa.account_type
      WHEN 'asset' THEN 'Assets'
      WHEN 'liability' THEN 'Liabilities'
      WHEN 'equity' THEN 'Equity'
      WHEN 'contra_asset' THEN 'Assets'
      WHEN 'contra_liability' THEN 'Liabilities'
      WHEN 'contra_equity' THEN 'Equity'
      ELSE 'Other'
    END AS section,
    coa.code AS account_code,
    coa.name AS account_name,
    coa.account_type::text AS account_type,
    COALESCE(SUM(jl.debit), 0)::numeric AS debit,
    COALESCE(SUM(jl.credit), 0)::numeric AS credit,
    CASE
      WHEN coa.account_type IN ('asset','contra_liability','contra_equity') THEN
        COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)::numeric
      WHEN coa.account_type IN ('liability','equity','contra_asset') THEN
        COALESCE(SUM(jl.credit) - SUM(jl.debit), 0)::numeric
      ELSE
        COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)::numeric
    END AS balance
  FROM public.acct_journal_lines jl
  JOIN public.acct_journal_entries je ON je.id = jl.journal_entry_id
  JOIN public.acct_chart_of_accounts coa ON coa.id = jl.account_id
  WHERE jl.tenant_id = p_tenant_id
    AND je.tenant_id = p_tenant_id
    AND je.status = 'posted'
    AND je.entry_date <= p_as_of_date
    AND coa.account_type IN ('asset','liability','equity','contra_asset','contra_liability','contra_equity')
  GROUP BY coa.code, coa.name, coa.account_type
  ORDER BY
    CASE coa.account_type WHEN 'asset' THEN 1 WHEN 'liability' THEN 2 WHEN 'equity' THEN 3 ELSE 9 END,
    coa.code;

  RETURN QUERY
  SELECT
    'TOTAL'::text AS section,
    ''::text AS account_code,
    CASE
      WHEN coa.account_type = 'asset' THEN 'Total Assets'
      WHEN coa.account_type = 'liability' THEN 'Total Liabilities'
      WHEN coa.account_type = 'equity' THEN 'Total Equity'
      ELSE 'Other'
    END AS account_name,
    coa.account_type::text AS account_type,
    0::numeric AS debit,
    0::numeric AS credit,
    CASE
      WHEN coa.account_type IN ('asset','contra_liability','contra_equity') THEN
        COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)::numeric
      WHEN coa.account_type IN ('liability','equity','contra_asset') THEN
        COALESCE(SUM(jl.credit) - SUM(jl.debit), 0)::numeric
      ELSE 0::numeric
    END AS balance
  FROM public.acct_journal_lines jl
  JOIN public.acct_journal_entries je ON je.id = jl.journal_entry_id
  JOIN public.acct_chart_of_accounts coa ON coa.id = jl.account_id
  WHERE jl.tenant_id = p_tenant_id
    AND je.tenant_id = p_tenant_id
    AND je.status = 'posted'
    AND je.entry_date <= p_as_of_date
    AND coa.account_type IN ('asset','liability','equity','contra_asset','contra_liability','contra_equity')
  GROUP BY coa.account_type
  ORDER BY
    CASE coa.account_type WHEN 'asset' THEN 1 WHEN 'liability' THEN 2 WHEN 'equity' THEN 3 ELSE 9 END;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_get_general_ledger(p_tenant_id uuid, p_start_date date, p_end_date date)
 RETURNS TABLE(entry_no bigint, entry_date date, posting_date date, source text, memo text, reference text, line_no integer, account_code text, account_name text, account_type text, line_description text, debit numeric, credit numeric, running_balance numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH ordered_lines AS (
    SELECT
      je.entry_no,
      je.entry_date,
      je.posting_date,
      je.source::text AS source,
      je.memo,
      je.reference,
      jl.line_no,
      coa.code AS account_code,
      coa.name AS account_name,
      coa.account_type::text AS account_type,
      jl.description AS line_description,
      jl.debit,
      jl.credit,
      SUM(CASE
             WHEN coa.account_type IN ('asset','expense') THEN jl.debit - jl.credit
             WHEN coa.account_type IN ('liability','equity','revenue') THEN jl.credit - jl.debit
             ELSE jl.debit - jl.credit
           END)
        OVER (PARTITION BY coa.id ORDER BY je.entry_date, je.entry_no, jl.line_no) AS running_balance
    FROM public.acct_journal_lines jl
    JOIN public.acct_journal_entries je ON je.id = jl.journal_entry_id
    JOIN public.acct_chart_of_accounts coa ON coa.id = jl.account_id
    WHERE jl.tenant_id = p_tenant_id
      AND je.tenant_id = p_tenant_id
      AND je.status = 'posted'
      AND je.entry_date BETWEEN p_start_date AND p_end_date
  )
  SELECT
    ol.entry_no,
    ol.entry_date,
    ol.posting_date,
    ol.source,
    ol.memo,
    ol.reference,
    ol.line_no,
    ol.account_code,
    ol.account_name,
    ol.account_type,
    ol.line_description,
    ol.debit,
    ol.credit,
    ol.running_balance
  FROM ordered_lines ol
  ORDER BY ol.account_code, ol.entry_date, ol.entry_no, ol.line_no;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_get_profit_and_loss(p_tenant_id uuid, p_start_date date, p_end_date date)
 RETURNS TABLE(account_code text, account_name text, account_type text, debit numeric, credit numeric, net_amount numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    coa.code AS account_code,
    coa.name AS account_name,
    coa.account_type::text AS account_type,
    COALESCE(SUM(jl.debit), 0)::numeric AS debit,
    COALESCE(SUM(jl.credit), 0)::numeric AS credit,
    CASE
      WHEN coa.account_type = 'revenue' THEN
        COALESCE(SUM(jl.credit) - SUM(jl.debit), 0)::numeric
      WHEN coa.account_type = 'expense' THEN
        COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)::numeric
      ELSE
        0::numeric
    END AS net_amount
  FROM public.acct_journal_lines jl
  JOIN public.acct_journal_entries je ON je.id = jl.journal_entry_id
  JOIN public.acct_chart_of_accounts coa ON coa.id = jl.account_id
  WHERE jl.tenant_id = p_tenant_id
    AND je.tenant_id = p_tenant_id
    AND je.status = 'posted'
    AND je.entry_date BETWEEN p_start_date AND p_end_date
    AND coa.account_type IN ('revenue', 'expense')
  GROUP BY coa.code, coa.name, coa.account_type
  ORDER BY coa.account_type, coa.code;

  RETURN QUERY
  SELECT
    'TOTAL'::text AS account_code,
    'Net Income'::text AS account_name,
    'total'::text AS account_type,
    0::numeric AS debit,
    0::numeric AS credit,
    (
      COALESCE((SELECT SUM(jl.credit) - SUM(jl.debit) FROM public.acct_journal_lines jl
                 JOIN public.acct_journal_entries je ON je.id = jl.journal_entry_id
                 JOIN public.acct_chart_of_accounts coa ON coa.id = jl.account_id
                 WHERE jl.tenant_id = p_tenant_id AND je.status = 'posted'
                   AND je.entry_date BETWEEN p_start_date AND p_end_date
                   AND coa.account_type = 'revenue'), 0)
      -
      COALESCE((SELECT SUM(jl.debit) - SUM(jl.credit) FROM public.acct_journal_lines jl
                 JOIN public.acct_journal_entries je ON je.id = jl.journal_entry_id
                 JOIN public.acct_chart_of_accounts coa ON coa.id = jl.account_id
                 WHERE jl.tenant_id = p_tenant_id AND je.status = 'posted'
                   AND je.entry_date BETWEEN p_start_date AND p_end_date
                   AND coa.account_type = 'expense'), 0)
    )::numeric AS net_amount;
END;
$function$;
CREATE OR REPLACE FUNCTION public.rpc_get_trial_balance(p_tenant_id uuid, p_end_date date)
 RETURNS TABLE(account_code text, account_name text, account_type text, total_debit numeric, total_credit numeric, balance numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    coa.code AS account_code,
    coa.name AS account_name,
    coa.account_type::text AS account_type,
    COALESCE(SUM(jl.debit), 0)::numeric AS total_debit,
    COALESCE(SUM(jl.credit), 0)::numeric AS total_credit,
    CASE
      WHEN coa.account_type IN ('asset','expense') THEN
        COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)::numeric
      WHEN coa.account_type IN ('liability','equity','revenue') THEN
        COALESCE(SUM(jl.credit) - SUM(jl.debit), 0)::numeric
      ELSE
        COALESCE(SUM(jl.debit) - SUM(jl.credit), 0)::numeric
    END AS balance
  FROM public.acct_journal_lines jl
  JOIN public.acct_journal_entries je ON je.id = jl.journal_entry_id
  JOIN public.acct_chart_of_accounts coa ON coa.id = jl.account_id
  WHERE jl.tenant_id = p_tenant_id
    AND je.tenant_id = p_tenant_id
    AND je.status = 'posted'
    AND je.entry_date <= p_end_date
  GROUP BY coa.code, coa.name, coa.account_type
  ORDER BY coa.code;

  RETURN QUERY
  SELECT
    'TOTAL'::text AS account_code,
    'Totals (debits must equal credits)'::text AS account_name,
    'total'::text AS account_type,
    COALESCE(SUM(jl.debit), 0)::numeric AS total_debit,
    COALESCE(SUM(jl.credit), 0)::numeric AS total_credit,
    0::numeric AS balance
  FROM public.acct_journal_lines jl
  JOIN public.acct_journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.tenant_id = p_tenant_id
    AND je.tenant_id = p_tenant_id
    AND je.status = 'posted'
    AND je.entry_date <= p_end_date;
END;
$function$;
CREATE OR REPLACE FUNCTION public.set_limit(real)
 RETURNS real
 LANGUAGE c
 STRICT
AS '$libdir/pg_trgm', $function$set_limit$function$;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
begin new.updated_at = now(); return new; end; $function$;
CREATE OR REPLACE FUNCTION public.show_limit()
 RETURNS real
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_limit$function$;
CREATE OR REPLACE FUNCTION public.show_trgm(text)
 RETURNS text[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_trgm$function$;
CREATE OR REPLACE FUNCTION public.similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity$function$;
CREATE OR REPLACE FUNCTION public.similarity_dist(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_dist$function$;
CREATE OR REPLACE FUNCTION public.similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_op$function$;
CREATE OR REPLACE FUNCTION public.sku_weight_lb(w numeric, uom text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN w IS NULL OR w <= 0 THEN 0
    WHEN lower(coalesce(uom, '')) IN ('lb', 'lbs') THEN w
    WHEN lower(coalesce(uom, '')) = 'oz' THEN w / 16.0
    WHEN lower(coalesce(uom, '')) = 'kg' THEN w * 2.20462
    ELSE w / 453.592
  END
$function$;
CREATE OR REPLACE FUNCTION public.slugify(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT trim(both '-' from regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '-', 'g'));
$function$;
CREATE OR REPLACE FUNCTION public.social_claim_outbox_events(p_limit integer DEFAULT 25)
 RETURNS TABLE(id uuid, tenant_id uuid, seller_id uuid, aggregate_type text, aggregate_id uuid, event_type text, payload jsonb, attempts integer)
 LANGUAGE sql
AS $function$
  UPDATE public.social_outbox_events e
     SET status = 'processing', attempts = e.attempts + 1, claimed_at = now()
   WHERE e.id IN (
     SELECT so.id FROM public.social_outbox_events so
      WHERE so.status IN ('pending', 'processing')
        AND so.next_attempt_at <= now()
        AND (so.status = 'pending'
             OR so.claimed_at IS NULL
             OR so.claimed_at < now() - interval '15 minutes')
      ORDER BY so.next_attempt_at ASC, so.id ASC
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
   )
   RETURNING e.id, e.tenant_id, e.seller_id, e.aggregate_type,
             e.aggregate_id, e.event_type, e.payload, e.attempts;
$function$;
CREATE OR REPLACE FUNCTION public.strict_word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity$function$;
CREATE OR REPLACE FUNCTION public.strict_word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_commutator_op$function$;
CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_commutator_op$function$;
CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_op$function$;
CREATE OR REPLACE FUNCTION public.strict_word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_op$function$;
CREATE OR REPLACE FUNCTION public.support_contacts_merge_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_target_merged uuid;
BEGIN
  IF NEW.merged_into_id IS NOT NULL THEN
    SELECT merged_into_id INTO v_target_merged
      FROM public.support_contacts WHERE id = NEW.merged_into_id;
    IF v_target_merged IS NOT NULL THEN
      RAISE EXCEPTION 'support_contacts: merge target % is itself merged (chains are not allowed)', NEW.merged_into_id;
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION public.support_next_ticket_ref(p_tenant_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_next bigint;
BEGIN
  INSERT INTO public.support_ticket_counters (tenant_id, last_ref)
  VALUES (p_tenant_id, 0)
  ON CONFLICT (tenant_id) DO NOTHING;
  UPDATE public.support_ticket_counters
     SET last_ref = last_ref + 1, updated_at = now()
   WHERE tenant_id = p_tenant_id
  RETURNING last_ref INTO v_next;
  RETURN 'SUP-' || lpad(v_next::text, 4, '0');
END
$function$;
CREATE OR REPLACE FUNCTION public.support_recount_ticket_messages(p_conversation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF p_conversation_id IS NULL THEN RETURN; END IF;
  PERFORM set_config('app.support_rollup', 'on', true);
  UPDATE public.support_tickets t
     SET message_count = (SELECT count(*) FROM public.crm_messages m WHERE m.conversation_id = p_conversation_id),
         public_reply_count = (SELECT count(*) FROM public.crm_messages m
                                WHERE m.conversation_id = p_conversation_id
                                  AND NOT (m.metadata @> '{"internal_note":true}'::jsonb))
   WHERE t.conversation_id = p_conversation_id;
END
$function$;
CREATE OR REPLACE FUNCTION public.support_ticket_events_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.actor_type IS NULL THEN
    NEW.actor_type := CASE WHEN NEW.actor_staff_id IS NOT NULL THEN 'staff' ELSE 'system' END;
  END IF;
  IF NEW.actor_id IS NULL THEN
    NEW.actor_id := NEW.actor_staff_id;
  END IF;
  IF NEW.payload IS NULL THEN
    NEW.payload := NEW.detail;
  ELSIF NEW.detail = '{}'::jsonb THEN
    NEW.detail := NEW.payload;
  END IF;
  RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION public.support_ticket_events_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_setting('app.allow_event_mutation', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'support_ticket_events is append-only (audit trail); mutation requires the retention path';
END
$function$;
CREATE OR REPLACE FUNCTION public.support_ticket_tenant_id(p_ticket_id uuid)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT tenant_id FROM public.support_tickets WHERE id = p_ticket_id $function$;
CREATE OR REPLACE FUNCTION public.support_tickets_merge_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_target_merged uuid;
BEGIN
  IF NEW.merged_into_id IS NOT NULL THEN
    SELECT merged_into_id INTO v_target_merged
      FROM public.support_tickets WHERE id = NEW.merged_into_id;
    IF v_target_merged IS NOT NULL THEN
      RAISE EXCEPTION 'support_tickets: merge target % is itself merged (chains are not allowed)', NEW.merged_into_id;
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION public.support_tickets_touch()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF current_setting('app.support_rollup', true) IS DISTINCT FROM 'on' THEN
      NEW.row_version := OLD.row_version + 1;
    END IF;
    NEW.updated_at := now();
  END IF;
  NEW.search_vector :=
       setweight(to_tsvector('english', coalesce(NEW.ticket_ref, '')), 'A')
    || setweight(to_tsvector('english', coalesce(NEW.subject, '')), 'A')
    || setweight(to_tsvector('english', coalesce(NEW.requester_name, '') || ' ' || coalesce(NEW.requester_email, '')), 'B')
    || setweight(to_tsvector('english', coalesce(NEW.category, '')), 'C');
  RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION public.sync_catalog_item_taxonomy()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.commerce_catalog_item_taxonomy WHERE item_id = OLD.id;
    RETURN OLD;
  END IF;
  DELETE FROM public.commerce_catalog_item_taxonomy WHERE item_id = NEW.id;
  IF NEW.active AND NEW.sellable AND NEW.ecommerce_enabled AND COALESCE(NEW.metadata->>'slug','') <> '' THEN
    INSERT INTO public.commerce_catalog_item_taxonomy (tenant_id, item_id, node_id)
    SELECT NEW.tenant_id, NEW.id, jsonb_array_elements_text(COALESCE(NEW.metadata->'taxonomy_node_ids','[]'::jsonb))
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION public.taxonomy_link_count(p_path text)
 RETURNS bigint
 LANGUAGE sql
 STABLE
AS $function$
  select count(*)
  from public.product_taxonomy_links
  where path = p_path
$function$;
CREATE OR REPLACE FUNCTION public.taxonomy_link_products(p_path text, p_limit integer, p_offset integer)
 RETURNS SETOF supplier_catalog_products
 LANGUAGE sql
 STABLE
AS $function$
  select p.*
  from public.product_taxonomy_links l
  join public.supplier_catalog_products p on p.id = l.product_id
  where l.path = p_path
    and p.is_hidden = false
  order by p.created_at desc
  limit p_limit
  offset p_offset
$function$;
CREATE OR REPLACE FUNCTION public.telemed_audit_log_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_setting('app.allow_event_mutation', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'telemed_audit_log is append-only (HIPAA-standard audit trail); mutation requires the retention path';
END
$function$;
CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.trg_brand_after()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    INSERT INTO route_redirects (tenant_id, from_path, to_path, reason)
    SELECT NEW.tenant_id, n.path || '/' || OLD.slug, n.path || '/' || NEW.slug, 'brand renamed'
      FROM brand_placements bp JOIN taxonomy_nodes n ON n.id = bp.node_id
     WHERE bp.brand_id = NEW.id AND bp.status = 'published'
    ON CONFLICT (tenant_id, from_path) DO UPDATE SET to_path = EXCLUDED.to_path, created_at = now();
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.trg_brand_placement_after()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status = 'published' AND NEW.status = 'published' AND NEW.node_id <> OLD.node_id THEN
    INSERT INTO route_redirects (tenant_id, from_path, to_path, reason)
    SELECT NEW.tenant_id, o.path || '/' || b.slug, nn.path || '/' || b.slug, 'brand moved'
      FROM brands b, taxonomy_nodes o, taxonomy_nodes nn
     WHERE b.id = NEW.brand_id AND o.id = OLD.node_id AND nn.id = NEW.node_id
    ON CONFLICT (tenant_id, from_path) DO UPDATE SET to_path = EXCLUDED.to_path, created_at = now();
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.trg_fill_tenant()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    IF TG_TABLE_NAME = 'product_variants' THEN
      SELECT tenant_id INTO NEW.tenant_id FROM products WHERE id = NEW.product_id;
    ELSIF TG_TABLE_NAME = 'brand_placements' THEN
      SELECT tenant_id INTO NEW.tenant_id FROM brands WHERE id = NEW.brand_id;
    ELSIF TG_TABLE_NAME = 'offers' THEN
      SELECT tenant_id INTO NEW.tenant_id FROM sellers WHERE id = NEW.seller_id;
    END IF;
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.trg_offer_before()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE s sellers%ROWTYPE; v_brand UUID; v_product UUID; v_gate TEXT;
BEGIN
  SELECT * INTO s FROM sellers WHERE id = NEW.seller_id;
  IF s.tenant_id <> NEW.tenant_id THEN RAISE EXCEPTION 'Offer tenant does not match seller tenant'; END IF;

  IF NEW.status = 'active' THEN
    IF s.status <> 'approved' THEN
      RAISE EXCEPTION 'Seller "%" is not approved (status %)', s.display_name, s.status;
    END IF;
    IF s.seller_type = 'marketplace' THEN
      SELECT p.brand_id, p.id INTO v_brand, v_product
        FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = NEW.variant_id;
      IF NOT EXISTS (SELECT 1 FROM seller_brand_authorizations a
                      WHERE a.seller_id = s.id AND a.brand_id = v_brand AND a.status = 'approved'
                        AND (a.valid_until IS NULL OR a.valid_until >= current_date)) THEN
        RAISE EXCEPTION 'Seller "%" is not authorized to sell this brand', s.display_name;
      END IF;
      SELECT g.name INTO v_gate
        FROM product_nodes pn
        JOIN taxonomy_nodes pnode ON pnode.id = pn.node_id
        JOIN taxonomy_nodes g ON g.tenant_id = pnode.tenant_id AND g.is_gated
                             AND (pnode.path = g.path OR pnode.path LIKE g.path || '/%')
       WHERE pn.product_id = v_product
         AND NOT EXISTS (SELECT 1 FROM seller_category_approvals ca
                          WHERE ca.seller_id = s.id AND ca.node_id = g.id AND ca.status = 'approved')
       LIMIT 1;
      IF v_gate IS NOT NULL THEN
        RAISE EXCEPTION 'Seller "%" needs category approval to sell in gated category "%"', s.display_name, v_gate;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.trg_po_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status <> 'approved' AND NEW.approved_at IS NULL THEN
    NEW.approved_at := now();
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.trg_product_after()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug AND OLD.status = 'published' THEN
    INSERT INTO route_redirects (tenant_id, from_path, to_path, reason)
    VALUES (NEW.tenant_id, '/shop/product/' || OLD.slug, '/shop/product/' || NEW.slug, 'product renamed')
    ON CONFLICT (tenant_id, from_path) DO UPDATE SET to_path = EXCLUDED.to_path, created_at = now();
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.trg_taxonomy_node_after()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.path IS DISTINCT FROM OLD.path THEN
    DELETE FROM route_redirects WHERE tenant_id = NEW.tenant_id AND from_path = NEW.path;
    IF pg_trigger_depth() = 1 THEN
      INSERT INTO route_redirects (tenant_id, from_path, to_path, match_type, reason)
      VALUES (NEW.tenant_id, OLD.path, NEW.path, 'prefix', 'category renamed or moved')
      ON CONFLICT (tenant_id, from_path) DO UPDATE
        SET to_path = EXCLUDED.to_path, match_type = 'prefix', created_at = now();
      UPDATE route_redirects
         SET to_path = NEW.path || substr(to_path, length(OLD.path) + 1)
       WHERE tenant_id = NEW.tenant_id AND from_path <> OLD.path
         AND (to_path = OLD.path OR to_path LIKE OLD.path || '/%');
    END IF;
    UPDATE taxonomy_nodes SET updated_at = now() WHERE parent_id = NEW.id;
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.upsert_portal_account_link(p_provider text, p_sub text, p_email text, p_type text, p_entity uuid, p_tenant uuid DEFAULT NULL::uuid, p_picture text DEFAULT NULL::text, p_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
    v_link_id UUID;
BEGIN
    IF p_provider IS NULL OR p_sub IS NULL OR p_email IS NULL OR p_type IS NULL OR p_entity IS NULL THEN
        RAISE EXCEPTION 'upsert_portal_account_link: provider, sub, email, type, entity_id are all required';
    END IF;
    IF p_type NOT IN ('staff', 'customer', 'tenant_membership') THEN
        RAISE EXCEPTION 'upsert_portal_account_link: invalid entity_type %', p_type;
    END IF;

    INSERT INTO public.portal_account_links (
        provider, provider_sub, email, entity_type, entity_id, tenant_id, picture_url, display_name
    ) VALUES (
        p_provider, p_sub, LOWER(p_email), p_type, p_entity, p_tenant, p_picture, p_name
    )
    ON CONFLICT (provider, provider_sub)
    DO UPDATE SET
        email        = EXCLUDED.email,
        entity_type  = EXCLUDED.entity_type,
        entity_id    = EXCLUDED.entity_id,
        tenant_id    = COALESCE(EXCLUDED.tenant_id, portal_account_links.tenant_id),
        picture_url  = COALESCE(EXCLUDED.picture_url, portal_account_links.picture_url),
        display_name = COALESCE(EXCLUDED.display_name, portal_account_links.display_name),
        last_used_at = NOW()
    RETURNING id INTO v_link_id;

    RETURN v_link_id;
END;
$function$;
CREATE OR REPLACE FUNCTION public.user_tenant_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
  select tenant_id from tenant_memberships where user_id = auth.uid() and active = true
$function$;
CREATE OR REPLACE FUNCTION public.word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity$function$;
CREATE OR REPLACE FUNCTION public.word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_commutator_op$function$;
CREATE OR REPLACE FUNCTION public.word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_commutator_op$function$;
CREATE OR REPLACE FUNCTION public.word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_op$function$;
CREATE OR REPLACE FUNCTION public.word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_op$function$;
CREATE OR REPLACE FUNCTION public.brand_supply_source(p_brand uuid, p_node uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE v_path TEXT;
BEGIN
  IF p_node IS NOT NULL THEN
    SELECT path INTO v_path FROM taxonomy_nodes WHERE id = p_node;
  END IF;

  IF EXISTS (SELECT 1
               FROM purchase_orders po
               JOIN purchase_order_lines l ON l.purchase_order_id = po.id
               JOIN taxonomy_nodes ln ON ln.id = l.node_id
              WHERE po.brand_id = p_brand
                AND po.status IN ('approved','partially_received','received','closed')
                AND (v_path IS NULL OR paths_related(ln.path, v_path))) THEN
    RETURN 'purchase_order';
  END IF;

  IF EXISTS (SELECT 1
               FROM seller_brand_authorizations a
               JOIN sellers s ON s.id = a.seller_id
              WHERE a.brand_id = p_brand AND a.status = 'approved'
                AND s.status = 'approved' AND s.seller_type = 'marketplace'
                AND (a.valid_until IS NULL OR a.valid_until >= current_date)
                AND (v_path IS NULL OR NOT EXISTS (
                      SELECT 1 FROM taxonomy_nodes g
                       WHERE g.tenant_id = s.tenant_id AND g.is_gated
                         AND (v_path = g.path OR v_path LIKE g.path || '/%')
                         AND NOT EXISTS (SELECT 1 FROM seller_category_approvals ca
                                          WHERE ca.seller_id = s.id AND ca.node_id = g.id
                                            AND ca.status = 'approved')))) THEN
    RETURN 'seller_authorization';
  END IF;

  RETURN NULL;
END $function$;
CREATE OR REPLACE FUNCTION public.create_bill(p_tenant_id uuid, p_number text, p_vendor_id text, p_issue_date date, p_due_date date DEFAULT NULL::date, p_currency text DEFAULT 'USD'::text, p_items jsonb DEFAULT NULL::jsonb, p_notes text DEFAULT NULL::text, p_ap_account_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
declare
  v_bill_id     uuid;
  v_ap_acct     uuid := p_ap_account_id;
  v_subtotal    numeric(18,4) := 0;
  v_tax_total   numeric(18,4) := 0;
  v_total       numeric(18,4) := 0;
  v_item        jsonb;
  v_line_amt    numeric(18,4);
  v_tax_rate    numeric(6,4);
  v_lines       jsonb := '[]'::jsonb;
  v_journal_id  uuid;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'No bill items provided';
  end if;

  if v_ap_acct is null then
    select id into v_ap_acct from chart_of_accounts
     where tenant_id = p_tenant_id and code = '2000' limit 1;
  end if;
  if v_ap_acct is null then
    raise exception 'No Accounts Payable account found. Seed standard chart of accounts.';
  end if;

  insert into bills (tenant_id, number, vendor_id, issue_date, due_date, currency, status,
                     subtotal, tax_total, total, ap_account_id, notes)
  values (p_tenant_id, p_number, p_vendor_id, p_issue_date, p_due_date, p_currency, 'received',
          0, 0, 0, v_ap_acct, p_notes)
  returning id into v_bill_id;

  for v_item in select jsonb_array_elements(p_items) loop
    v_line_amt := coalesce((v_item->>'quantity')::numeric, 1) * coalesce((v_item->>'unit_price')::numeric, 0)
                  - coalesce((v_item->>'discount')::numeric, 0);
    v_subtotal := v_subtotal + v_line_amt;

    v_tax_rate := 0;
    if v_item ? 'tax_id' and (v_item->>'tax_id') is not null then
      select rate into v_tax_rate from taxes where id = (v_item->>'tax_id')::uuid;
    end if;
    v_tax_total := v_tax_total + (v_line_amt * v_tax_rate);

    insert into bill_items (bill_id, product_id, inventory_item_id, account_id, tax_id,
                            description, quantity, unit_price, discount, position)
    values (v_bill_id,
            nullif(v_item->>'product_id','')::text,
            nullif(v_item->>'inventory_item_id','')::text,
            (v_item->>'account_id')::uuid,
            nullif(v_item->>'tax_id','')::uuid,
            v_item->>'description',
            coalesce((v_item->>'quantity')::numeric, 1),
            coalesce((v_item->>'unit_price')::numeric, 0),
            coalesce((v_item->>'discount')::numeric, 0),
            coalesce((v_item->>'position')::int, 0));

    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', (v_item->>'account_id')::uuid,
      'debit', v_line_amt, 'credit', 0,
      'description', coalesce(v_item->>'description', 'Bill ' || p_number)
    ));

    if v_item ? 'inventory_item_id' and (v_item->>'inventory_item_id') is not null then
      perform apply_stock_movement(
        p_tenant_id := p_tenant_id,
        p_inventory_item_id := (v_item->>'inventory_item_id')::text,
        p_date := p_issue_date,
        p_type := 'purchase',
        p_quantity := coalesce((v_item->>'quantity')::numeric, 1),
        p_unit_cost := coalesce((v_item->>'unit_price')::numeric, 0),
        p_source := 'bill',
        p_source_id := v_bill_id::text,
        p_reference := p_number
      );
    end if;
  end loop;

  v_total := v_subtotal + v_tax_total;

  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_id', v_ap_acct,
    'debit', 0, 'credit', v_total,
    'description', 'AP — ' || p_number
  ));

  if v_tax_total > 0 then
    declare
      v_tax_acct uuid;
    begin
      select id into v_tax_acct from chart_of_accounts
       where tenant_id = p_tenant_id and code = '2100' limit 1;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'account_id', v_tax_acct,
        'debit', v_tax_total, 'credit', 0,
        'description', 'Sales tax recoverable — ' || p_number
      ));
    end;
  end if;

  v_journal_id := post_journal(
    p_tenant_id := p_tenant_id,
    p_entry_date := p_issue_date,
    p_lines := v_lines,
    p_memo := 'Bill ' || p_number || ' received',
    p_reference := p_number,
    p_source := 'bill',
    p_source_id := v_bill_id::text,
    p_currency := p_currency
  );

  update bills
     set subtotal = v_subtotal,
         tax_total = v_tax_total,
         total = v_total,
         journal_id = v_journal_id
   where id = v_bill_id;

  return v_bill_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.create_receipt(p_tenant_id uuid, p_number text, p_receipt_date date, p_amount numeric, p_deposit_account_id uuid, p_customer_id text DEFAULT NULL::text, p_method text DEFAULT 'cash'::text, p_revenue_account_id uuid DEFAULT NULL::uuid, p_currency text DEFAULT 'USD'::text, p_items jsonb DEFAULT NULL::jsonb, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
declare
  v_receipt_id    uuid;
  v_rev_acct      uuid := p_revenue_account_id;
  v_tax_acct      uuid;
  v_tax_total     numeric(18,4) := 0;
  v_total         numeric(18,4) := 0;
  v_item          jsonb;
  v_lines         jsonb := '[]'::jsonb;
  v_journal_id    uuid;
begin
  if p_amount <= 0 then raise exception 'Receipt amount must be positive'; end if;

  if v_rev_acct is null then
    select id into v_rev_acct from chart_of_accounts
     where tenant_id = p_tenant_id and code = '4000' limit 1;
  end if;
  if v_rev_acct is null then
    raise exception 'No Sales Revenue account found. Seed standard chart of accounts.';
  end if;

  insert into receipts (tenant_id, number, customer_id, receipt_date, kind, amount, currency, method,
                        deposit_account_id, revenue_account_id, notes)
  values (p_tenant_id, p_number, p_customer_id, p_receipt_date, 'sale', p_amount, p_currency,
          p_method::payment_method, p_deposit_account_id, v_rev_acct, p_notes)
  returning id into v_receipt_id;

  if p_items is not null and jsonb_array_length(p_items) > 0 then
    for v_item in select jsonb_array_elements(p_items) loop
      declare
        v_qty    numeric(18,4) := coalesce((v_item->>'quantity')::numeric, 1);
        v_price  numeric(18,4) := coalesce((v_item->>'unit_price')::numeric, 0);
        v_amt    numeric(18,4) := v_qty * v_price;
        v_tax_id uuid := nullif(v_item->>'tax_id','')::uuid;
        v_tax_rate numeric(6,4) := 0;
        v_item_acct uuid := (v_item->>'account_id')::uuid;
      begin
        if v_item_acct is null then v_item_acct := v_rev_acct; end if;
        if v_tax_id is not null then
          select rate into v_tax_rate from taxes where id = v_tax_id;
        end if;
        v_tax_total := v_tax_total + (v_amt * v_tax_rate);
        v_total := v_total + v_amt;

        insert into receipt_items (receipt_id, product_id, inventory_item_id, account_id, description, quantity, unit_price, tax_id)
        values (v_receipt_id,
                nullif(v_item->>'product_id','')::text,
                nullif(v_item->>'inventory_item_id','')::text,
                v_item_acct,
                v_item->>'description',
                v_qty, v_price, v_tax_id);

        if v_item ? 'inventory_item_id' and (v_item->>'inventory_item_id') is not null then
          perform apply_stock_movement(
            p_tenant_id := p_tenant_id,
            p_inventory_item_id := (v_item->>'inventory_item_id')::text,
            p_date := p_receipt_date,
            p_type := 'sale',
            p_quantity := -v_qty,
            p_unit_cost := 0,
            p_source := 'receipt',
            p_source_id := v_receipt_id::text,
            p_reference := p_number
          );
        end if;
      end;
    end loop;
  else
    v_total := p_amount;
  end if;

  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_id', p_deposit_account_id, 'debit', p_amount, 'credit', 0,
    'description', 'Receipt ' || p_number
  ));
  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_id', v_rev_acct, 'debit', 0, 'credit', v_total,
    'description', 'Sales — ' || p_number
  ));
  if v_tax_total > 0 then
    select id into v_tax_acct from chart_of_accounts
     where tenant_id = p_tenant_id and code = '2100' limit 1;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', v_tax_acct, 'debit', 0, 'credit', v_tax_total,
      'description', 'Sales tax — ' || p_number
    ));
  end if;

  v_journal_id := post_journal(
    p_tenant_id := p_tenant_id,
    p_entry_date := p_receipt_date,
    p_lines := v_lines,
    p_memo := 'Receipt ' || p_number,
    p_reference := p_number,
    p_source := 'receipt',
    p_source_id := v_receipt_id::text,
    p_currency := p_currency
  );

  update receipts set journal_id = v_journal_id where id = v_receipt_id;
  return v_receipt_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.platform_has_permission(p_tenant_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
BEGIN
    RETURN platform_is_admin() OR EXISTS (
        SELECT 1 FROM platform_module_permissions pmp
        JOIN crm_staff cs ON cs.id = pmp.staff_id
        WHERE cs.user_id = auth.uid()
          AND pmp.tenant_id = p_tenant_id
          AND pmp.module_code = (SELECT module FROM platform_permission_registry WHERE permission_code = p_permission LIMIT 1)
          AND pmp.access_level IN ('write', 'full')
    );
END;
$function$;
CREATE OR REPLACE FUNCTION public.platform_is_tenant_member(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
    SELECT platform_is_admin() OR EXISTS (
        SELECT 1 FROM tenant_memberships AS tm
        WHERE tm.tenant_id = p_tenant_id
          AND tm.user_id = auth.uid()
          AND tm.active = true
          AND tm.status = 'active'
    );
$function$;
CREATE OR REPLACE FUNCTION public.product_has_live_brand(p_product uuid, p_brand uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM product_nodes pn
      JOIN taxonomy_nodes pnode ON pnode.id = pn.node_id
      JOIN brand_placements bp  ON bp.brand_id = p_brand AND bp.status = 'published'
      JOIN taxonomy_nodes bn    ON bn.id = bp.node_id
      JOIN brands b             ON b.id = bp.brand_id AND b.status = 'published'
     WHERE pn.product_id = p_product AND paths_related(pnode.path, bn.path));
$function$;
CREATE OR REPLACE FUNCTION public.register_product_attributes(p_product uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE r RECORD; v_nf UUID; v_allow BOOLEAN;
BEGIN
  FOR r IN
    SELECT DISTINCT coalesce(effective_filter_node(pn.node_id), pn.node_id) AS filter_node,
                    pav.attribute_id, pav.attribute_value_id
      FROM product_nodes pn
      JOIN product_attribute_values pav ON pav.product_id = pn.product_id
     WHERE pn.product_id = p_product AND pav.attribute_value_id IS NOT NULL
  LOOP
    SELECT id, allow_new_values INTO v_nf, v_allow
      FROM node_filters WHERE node_id = r.filter_node AND attribute_id = r.attribute_id;

    IF v_nf IS NULL THEN
      INSERT INTO node_filters (node_id, attribute_id, sort_order, value_source, added_by)
      SELECT r.filter_node, r.attribute_id,
             coalesce((SELECT max(sort_order) FROM node_filters WHERE node_id = r.filter_node), 0) + 1,
             'predefined', 'cms'
      RETURNING id, allow_new_values INTO v_nf, v_allow;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM node_filter_values WHERE node_filter_id = v_nf AND attribute_value_id = r.attribute_value_id) THEN
      IF NOT v_allow THEN
        RAISE EXCEPTION 'Filter value not allowed: % is locked for this category', (SELECT name FROM attributes WHERE id = r.attribute_id);
      END IF;
      INSERT INTO node_filter_values (node_filter_id, attribute_value_id, sort_order, added_by, needs_review)
      SELECT v_nf, r.attribute_value_id,
             coalesce((SELECT max(sort_order) FROM node_filter_values WHERE node_filter_id = v_nf), 0) + 1,
             'cms', TRUE;
    END IF;
  END LOOP;
END $function$;
CREATE OR REPLACE FUNCTION public.run_payroll(p_tenant_id uuid, p_number text, p_pay_period_start date, p_pay_period_end date, p_pay_date date, p_run_items jsonb, p_cash_account_id uuid, p_wage_account_id uuid DEFAULT NULL::uuid, p_tax_payable_account_id uuid DEFAULT NULL::uuid, p_employer_tax_account_id uuid DEFAULT NULL::uuid, p_employer_taxes numeric DEFAULT 0)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
declare
  v_run_id      uuid;
  v_item        jsonb;
  v_gross       numeric(18,4) := 0;
  v_tax         numeric(18,4) := 0;
  v_net         numeric(18,4) := 0;
  v_emp_taxes  numeric(18,4) := p_employer_taxes;
  v_lines       jsonb := '[]'::jsonb;
  v_journal_id  uuid;
  v_wage_acct   uuid := p_wage_account_id;
  v_tax_acct    uuid := p_tax_payable_account_id;
  v_emp_tax_acct uuid := p_employer_tax_account_id;
begin
  if p_run_items is null or jsonb_array_length(p_run_items) = 0 then
    raise exception 'No payroll run items provided';
  end if;

  if v_wage_acct is null then
    select id into v_wage_acct from chart_of_accounts
     where tenant_id = p_tenant_id and code = '5400' limit 1;
  end if;
  if v_tax_acct is null then
    select id into v_tax_acct from chart_of_accounts
     where tenant_id = p_tenant_id and code = '2200' limit 1;
  end if;
  if v_emp_tax_acct is null then
    select id into v_emp_tax_acct from chart_of_accounts
     where tenant_id = p_tenant_id and code = '5400' limit 1;  -- same wage expense for simplicity
  end if;
  if v_wage_acct is null or v_tax_acct is null then
    raise exception 'Missing wage or tax payable account. Seed standard chart of accounts.';
  end if;

  insert into payroll_runs (tenant_id, number, pay_period_start, pay_period_end, pay_date, status,
                             gross_wages, tax_withheld, net_paid, employer_taxes)
  values (p_tenant_id, p_number, p_pay_period_start, p_pay_period_end, p_pay_date, 'approved',
          0, 0, 0, p_employer_taxes)
  returning id into v_run_id;

  for v_item in select jsonb_array_elements(p_run_items) loop
    declare
      v_emp_id      uuid := (v_item->>'employee_id')::uuid;
      v_ts_id       uuid := nullif(v_item->>'timesheet_id','')::uuid;
      v_hrs_reg     numeric(18,4) := coalesce((v_item->>'hours_regular')::numeric, 0);
      v_hrs_ot      numeric(18,4) := coalesce((v_item->>'hours_overtime')::numeric, 0);
      v_gross_wages numeric(18,4) := coalesce((v_item->>'gross_wages')::numeric, 0);
      v_tax_withheld numeric(18,4) := coalesce((v_item->>'tax_withheld')::numeric, 0);
      v_net_paid    numeric(18,4) := coalesce((v_item->>'net_paid')::numeric, 0);
    begin
      v_gross := v_gross + v_gross_wages;
      v_tax := v_tax + v_tax_withheld;
      v_net := v_net + v_net_paid;

      insert into payroll_run_items (payroll_run_id, employee_id, timesheet_id,
                                       hours_regular, hours_overtime, gross_wages, tax_withheld, net_paid)
      values (v_run_id, v_emp_id, v_ts_id, v_hrs_reg, v_hrs_ot, v_gross_wages, v_tax_withheld, v_net_paid);

      if v_ts_id is not null then
        update payroll_timesheets set status = 'processed' where id = v_ts_id;
      end if;
    end;
  end loop;

  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_id', v_wage_acct, 'debit', v_gross, 'credit', 0,
    'description', 'Gross wages — ' || p_number
  ));
  if v_tax > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', v_tax_acct, 'debit', 0, 'credit', v_tax,
      'description', 'Tax withheld — ' || p_number
    ));
  end if;
  v_lines := v_lines || jsonb_build_array(jsonb_build_object(
    'account_id', p_cash_account_id, 'debit', 0, 'credit', v_net,
    'description', 'Net pay — ' || p_number
  ));
  if v_emp_taxes > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', v_emp_tax_acct, 'debit', v_emp_taxes, 'credit', 0,
      'description', 'Employer taxes — ' || p_number
    ));
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', v_tax_acct, 'debit', 0, 'credit', v_emp_taxes,
      'description', 'Employer tax payable — ' || p_number
    ));
  end if;

  v_journal_id := post_journal(
    p_tenant_id := p_tenant_id,
    p_entry_date := p_pay_date,
    p_lines := v_lines,
    p_memo := 'Payroll run ' || p_number,
    p_reference := p_number,
    p_source := 'payroll',
    p_source_id := v_run_id::text
  );

  update payroll_runs
     set gross_wages = v_gross,
         tax_withheld = v_tax,
         net_paid = v_net,
         employer_taxes = v_emp_taxes,
         journal_id = v_journal_id,
         status = 'posted'
   where id = v_run_id;

  return v_run_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.set_product_attribute(p_product uuid, p_attribute text, p_value text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE v_tenant UUID; v_attr UUID; v_val UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM products WHERE id = p_product;
  INSERT INTO attributes (tenant_id, name, slug) VALUES (v_tenant, p_attribute, slugify(p_attribute))
    ON CONFLICT (tenant_id, slug) DO NOTHING;
  SELECT id INTO v_attr FROM attributes WHERE tenant_id = v_tenant AND slug = slugify(p_attribute);
  INSERT INTO attribute_values (attribute_id, value, slug, sort_order)
    VALUES (v_attr, p_value, slugify(p_value),
            coalesce((SELECT max(sort_order) FROM attribute_values WHERE attribute_id = v_attr), 0) + 1)
    ON CONFLICT (attribute_id, slug) DO NOTHING;
  SELECT id INTO v_val FROM attribute_values WHERE attribute_id = v_attr AND slug = slugify(p_value);
  INSERT INTO product_attribute_values (product_id, attribute_id, attribute_value_id)
    VALUES (p_product, v_attr, v_val)
    ON CONFLICT (product_id, attribute_id, attribute_value_id) WHERE attribute_value_id IS NOT NULL DO NOTHING;
END $function$;
CREATE OR REPLACE FUNCTION public.shipping_apply_tiers()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  mult numeric := coalesce((SELECT value::text::numeric FROM app_settings WHERE key = 'pricing.markup_multiplier'), 1.55);
  n integer;
BEGIN
  WITH calc AS (
    SELECT cp.id,
           shipping_cost_for_lb(sku_weight_lb(es.weight, es.weight_uom)) AS ship,
           ROUND(cp.cost_price * mult, 2) AS base
      FROM commerce_prices cp
      JOIN commerce_catalog_items ci ON ci.id = cp.catalog_item_id
      JOIN erp_product_skus es ON es.id = ci.sku_id
     WHERE cp.cost_price > 0
  )
  UPDATE commerce_prices cp
     SET shipping_cost = calc.ship,
         price = calc.base + calc.ship,
         compare_at_price = CASE WHEN cp.compare_at_price > calc.base + calc.ship THEN cp.compare_at_price ELSE NULL END
    FROM calc WHERE calc.id = cp.id;
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE erp_product_skus es
     SET unit_price = cp.price
    FROM commerce_catalog_items ci
    JOIN commerce_prices cp ON cp.catalog_item_id = ci.id AND cp.cost_price > 0
   WHERE ci.sku_id = es.id;
  RETURN n;
END $function$;
CREATE OR REPLACE FUNCTION public.support_messages_rollup()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.support_recount_ticket_messages(OLD.conversation_id);
    RETURN OLD;
  END IF;
  PERFORM public.support_recount_ticket_messages(NEW.conversation_id);
  RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION public.support_tickets_assign_ref()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.ticket_ref IS NULL THEN
    NEW.ticket_ref := public.support_next_ticket_ref(NEW.tenant_id);
  END IF;
  RETURN NEW;
END
$function$;
CREATE OR REPLACE FUNCTION public.take_payment(p_tenant_id uuid, p_payment_date date, p_customer_id text, p_amount numeric, p_method text, p_deposit_account_id uuid, p_invoice_ids text[] DEFAULT NULL::text[], p_currency text DEFAULT 'USD'::text, p_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_ar_account_id uuid DEFAULT NULL::uuid, p_stripe_txn_id text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
declare
  v_pt_id        text;
  v_pt_linked    text;
  v_ar_acct      uuid := p_ar_account_id;
  v_remaining    numeric(18,4) := p_amount;
  v_inv          record;
  v_apply_amount numeric(18,4);
  v_je_id        uuid;
  v_new_paid     numeric(18,4);
  v_inv_id       text;
begin
  if p_amount <= 0 then
    raise exception 'Payment amount must be positive';
  end if;
  if v_ar_acct is null then
    select id into v_ar_acct from chart_of_accounts
    where tenant_id = p_tenant_id and code = '1100' limit 1;
  end if;
  if v_ar_acct is null then
    raise exception 'No Accounts Receivable account found. Provide p_ar_account_id or seed standard chart of accounts.';
  end if;
  insert into payment_transactions (
    tenant_id, customer_id, invoice_id,
    provider, provider_transaction_id, transaction_type, status,
    amount, currency, processed_at, metadata
  ) values (
    p_tenant_id, p_customer_id, null,
    case when p_method = 'stripe' then 'stripe' else 'manual' end,
    coalesce(p_stripe_txn_id, p_reference), 'payment', 'SUCCESS',
    p_amount, p_currency, now(),
    jsonb_build_object('method', p_method, 'reference', p_reference, 'notes', p_notes, 'deposit_account_id', p_deposit_account_id, 'ar_account_id', v_ar_acct)
  )
  returning id into v_pt_id;
  update payment_transactions
     set deposit_account_id = p_deposit_account_id,
         ar_account_id = v_ar_acct
   where id = v_pt_id;
  if p_invoice_ids is not null then
    foreach v_inv_id in array p_invoice_ids loop
      select id::text as id, total, amount_paid, amount_credited, deposit_paid into v_inv
        from acct_ar_invoices
       where v_inv_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         and id = v_inv_id::uuid and tenant_id = p_tenant_id;
      if not found then continue; end if;
      v_apply_amount := least(v_remaining, (v_inv.total - coalesce(v_inv.amount_paid, 0) - coalesce(v_inv.amount_credited, 0) - coalesce(v_inv.deposit_paid, 0)));
      if v_apply_amount <= 0 then continue; end if;
      v_new_paid := coalesce(v_inv.amount_paid, 0) + v_apply_amount;
      update acct_ar_invoices
         set amount_paid = v_new_paid,
             status = case when v_new_paid + coalesce(amount_credited, 0) + coalesce(deposit_paid, 0) >= total then 'paid'::acct_document_status else 'partially_paid'::acct_document_status end,
             paid_at = case when v_new_paid + coalesce(amount_credited, 0) + coalesce(deposit_paid, 0) >= total then now() else paid_at end,
             updated_at = now()
       where id = v_inv_id::uuid;
      insert into payment_transactions (tenant_id, customer_id, invoice_id, provider, transaction_type, status, amount, currency, processed_at, metadata)
      values (p_tenant_id, p_customer_id, v_inv_id,
              case when p_method = 'stripe' then 'stripe' else 'manual' end,
              'invoice_payment', 'SUCCESS',
              v_apply_amount, p_currency, now(),
              jsonb_build_object('method', p_method, 'reference', p_reference, 'parent_payment_id', v_pt_id))
      returning id into v_pt_linked;
      v_remaining := v_remaining - v_apply_amount;
      exit when v_remaining <= 0;
    end loop;
  end if;
  perform post_journal(
    p_tenant_id  := p_tenant_id,
    p_entry_date := p_payment_date,
    p_memo       := 'Payment received ' || coalesce(p_reference, '(no ref)'),
    p_reference  := p_reference,
    p_source     := 'payment',
    p_source_id  := v_pt_id,
    p_currency   := p_currency,
    p_lines      := jsonb_build_array(
      jsonb_build_object('account_id', p_deposit_account_id, 'debit', p_amount, 'credit', 0,
                         'description', 'Deposit', 'customer_id', p_customer_id),
      jsonb_build_object('account_id', v_ar_acct, 'debit', 0, 'credit', (p_amount - v_remaining),
                         'description', 'Applied to AR', 'customer_id', p_customer_id),
      case when v_remaining > 0 then
        jsonb_build_object('account_id', v_ar_acct, 'debit', 0, 'credit', v_remaining,
                           'description', 'Customer credit / on-account', 'customer_id', p_customer_id)
      else null end
    )
  );
  return v_pt_id::uuid;
end;
$function$;
CREATE OR REPLACE FUNCTION public.trg_goods_receipt_line()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE l purchase_order_lines%ROWTYPE; r goods_receipts%ROWTYPE; po purchase_orders%ROWTYPE;
BEGIN
  SELECT * INTO r FROM goods_receipts WHERE id = NEW.goods_receipt_id;
  SELECT * INTO l FROM purchase_order_lines WHERE id = NEW.po_line_id FOR UPDATE;
  IF l.purchase_order_id <> r.purchase_order_id THEN
    RAISE EXCEPTION 'Receipt line belongs to a different purchase order';
  END IF;
  SELECT * INTO po FROM purchase_orders WHERE id = l.purchase_order_id;
  IF po.status NOT IN ('approved','partially_received') THEN
    RAISE EXCEPTION 'PO % must be approved before receiving (status %)', po.po_number, po.status;
  END IF;
  IF l.qty_received + NEW.qty_received > l.qty_ordered THEN
    RAISE EXCEPTION 'Over-receipt on PO % line %: ordered %, already received %, receiving %',
      po.po_number, l.line_no, l.qty_ordered, l.qty_received, NEW.qty_received;
  END IF;

  UPDATE purchase_order_lines SET qty_received = qty_received + NEW.qty_received WHERE id = l.id;

  IF l.variant_id IS NOT NULL THEN
    INSERT INTO inventory_levels (location_id, variant_id, seller_id, on_hand)
    VALUES (r.location_id, l.variant_id, first_party_seller(po.tenant_id), NEW.qty_received)
    ON CONFLICT (location_id, variant_id, seller_id)
      DO UPDATE SET on_hand = inventory_levels.on_hand + EXCLUDED.on_hand;
  END IF;

  UPDATE purchase_orders
     SET status = CASE WHEN NOT EXISTS (SELECT 1 FROM purchase_order_lines
                                         WHERE purchase_order_id = po.id AND qty_received < qty_ordered)
                       THEN 'received' ELSE 'partially_received' END
   WHERE id = po.id;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.acct_is_tenant_member(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$ SELECT platform_is_tenant_member(p_tenant_id); $function$;
CREATE OR REPLACE FUNCTION public.brand_supply_ok(p_brand uuid, p_node uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$ SELECT brand_supply_source(p_brand, p_node) IS NOT NULL; $function$;
CREATE OR REPLACE FUNCTION public.commerce_has_tenant_access(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$ SELECT platform_is_tenant_member(p_tenant_id); $function$;
CREATE OR REPLACE FUNCTION public.convert_purchase_order_to_bill(p_tenant_id uuid, p_po_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
declare
  v_po        purchase_orders%rowtype;
  v_bill_id   uuid;
  v_bill_num  text;
  v_items     jsonb := '[]'::jsonb;
  v_item      purchase_order_items%rowtype;
begin
  select * into v_po from purchase_orders where id = p_po_id and tenant_id = p_tenant_id;
  if not found then raise exception 'Purchase order not found'; end if;
  if v_po.converted_bill_id is not null then
    return v_po.converted_bill_id;
  end if;

  v_bill_num := replace(v_po.number, 'PO-', 'BILL-');

  for v_item in select * from purchase_order_items where purchase_order_id = p_po_id loop
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_item.product_id,
      'inventory_item_id', v_item.inventory_item_id,
      'account_id', v_item.account_id,
      'tax_id', v_item.tax_id,
      'description', v_item.description,
      'quantity', v_item.quantity,
      'unit_price', v_item.unit_price,
      'discount', v_item.discount,
      'position', v_item.position
    ));
  end loop;

  v_bill_id := create_bill(
    p_tenant_id := p_tenant_id,
    p_number := v_bill_num,
    p_vendor_id := v_po.vendor_id,
    p_issue_date := v_po.issue_date,
    p_due_date := coalesce(v_po.expected_date, v_po.issue_date + 30),
    p_currency := v_po.currency,
    p_items := v_items,
    p_notes := v_po.notes,
    p_ap_account_id := null
  );

  update purchase_orders
     set converted_bill_id = v_bill_id, status = 'closed', updated_at = now()
   where id = p_po_id;

  return v_bill_id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.crm_has_tenant_access(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$ SELECT platform_is_tenant_member(p_tenant_id); $function$;
CREATE OR REPLACE FUNCTION public.erp_current_tenant_member(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$ SELECT platform_is_tenant_member(p_tenant_id); $function$;
CREATE OR REPLACE FUNCTION public.support_grant_access(p_ticket_id uuid, p_min_level text DEFAULT 'view'::text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.support_ticket_access_grants g
     WHERE g.ticket_id = p_ticket_id
       AND g.revoked_at IS NULL
       AND (p_min_level = 'view' OR g.level = 'collaborate')
       AND public.platform_is_tenant_member(g.grantee_tenant_id))
$function$;
CREATE OR REPLACE FUNCTION public.support_ticket_visibility_ok(p_ticket_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.support_tickets AS t
    WHERE t.id = p_ticket_id
      AND (
        t.visibility_level = 'standard'
        OR public.platform_is_admin()
        OR public.platform_has_permission(t.tenant_id, 'support.confidential')
        OR (
          t.visibility_level = 'restricted'
          AND t.restricted_team_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.support_team_members AS tm
            JOIN public.crm_staff AS cs ON cs.id = tm.staff_id
            WHERE tm.team_id = t.restricted_team_id
              AND tm.tenant_id = t.tenant_id
              AND cs.user_id = auth.uid()
          )
        )
      )
  )
$function$;
CREATE OR REPLACE FUNCTION public.trg_product_before()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE base TEXT; n INT := 1;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN NEW.slug := slugify(NEW.name); END IF;
  IF TG_OP = 'INSERT' OR NEW.slug IS DISTINCT FROM OLD.slug THEN
    base := NEW.slug;
    WHILE EXISTS (SELECT 1 FROM products WHERE tenant_id = NEW.tenant_id AND slug = NEW.slug AND id <> NEW.id) LOOP
      n := n + 1; NEW.slug := base || '-' || n;
    END LOOP;
  END IF;

  IF NEW.status = 'published' THEN
    IF NEW.brand_id IS NULL THEN
      RAISE EXCEPTION 'Product "%" needs a brand before it can be published', NEW.name;
    END IF;
    IF NEW.fulfillment_type IS DISTINCT FROM 'supplier_dropship' THEN
      IF NOT product_has_live_brand(NEW.id, NEW.brand_id) THEN
        RAISE EXCEPTION 'Product "%" cannot be published: its brand is not live in any of the product''s categories', NEW.name;
      END IF;
    END IF;
    IF TG_OP = 'INSERT' OR OLD.status <> 'published' THEN NEW.published_at := now(); END IF;
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.trg_register_attributes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM register_product_attributes(NEW.product_id);
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.acct_post_journal(p_tenant_id uuid, p_book_id uuid, p_period_id uuid, p_entry_date date, p_currency character, p_lines jsonb, p_source acct_source_type DEFAULT 'manual'::acct_source_type, p_source_id text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_memo text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
DECLARE v_batch uuid; v_entry uuid; v_entity uuid; v_line jsonb; v_line_no int := 0; v_debit numeric(24,6) := 0; v_credit numeric(24,6) := 0; v_existing uuid;
BEGIN
    IF NOT acct_is_tenant_member(p_tenant_id) THEN RAISE EXCEPTION 'Tenant access denied'; END IF;
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_existing FROM acct_journal_batches WHERE tenant_id=p_tenant_id AND idempotency_key=p_idempotency_key;
        IF v_existing IS NOT NULL THEN SELECT id INTO v_entry FROM acct_journal_entries WHERE batch_id=v_existing ORDER BY created_at LIMIT 1; RETURN v_entry; END IF;
    END IF;
    SELECT entity_id INTO v_entity FROM acct_books WHERE id=p_book_id AND tenant_id=p_tenant_id;
    IF v_entity IS NULL THEN RAISE EXCEPTION 'Book not found or not owned by tenant'; END IF;
    INSERT INTO acct_journal_batches(tenant_id,entity_id,book_id,batch_no,source,status,description,idempotency_key,created_by) VALUES(p_tenant_id,v_entity,p_book_id,'B-'||TO_CHAR(CLOCK_TIMESTAMP(),'YYYYMMDDHH24MISSMS'),p_source,'approved',p_memo,p_idempotency_key,auth.uid()) RETURNING id INTO v_batch;
    INSERT INTO acct_journal_entries(tenant_id,entity_id,book_id,batch_id,period_id,entry_date,posting_date,source,source_id,reference,memo,currency,status,created_by) VALUES(p_tenant_id,v_entity,p_book_id,v_batch,p_period_id,p_entry_date,p_entry_date,p_source,p_source_id,p_reference,p_memo,p_currency,'approved',auth.uid()) RETURNING id INTO v_entry;
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
        v_line_no := v_line_no + 1;
        INSERT INTO acct_journal_lines(tenant_id,entity_id,journal_entry_id,line_no,account_id,description,debit,credit,transaction_currency,transaction_debit,transaction_credit,exchange_rate,customer_id,vendor_id,employee_id,project_id,department_id,location_id,tax_code_id,source_line_id,dimensions) VALUES(p_tenant_id,v_entity,v_entry,v_line_no,(v_line->>'account_id')::uuid,v_line->>'description',COALESCE((v_line->>'debit')::numeric,0),COALESCE((v_line->>'credit')::numeric,0),COALESCE(v_line->>'transaction_currency',p_currency),COALESCE((v_line->>'transaction_debit')::numeric,(v_line->>'debit')::numeric,0),COALESCE((v_line->>'transaction_credit')::numeric,(v_line->>'credit')::numeric,0),COALESCE((v_line->>'exchange_rate')::numeric,1),v_line->>'customer_id',v_line->>'vendor_id',v_line->>'employee_id',v_line->>'project_id',v_line->>'department_id',v_line->>'location_id',NULLIF(v_line->>'tax_code_id','')::uuid,v_line->>'source_line_id',COALESCE(v_line->'dimensions','{}'));
        v_debit := v_debit + COALESCE((v_line->>'debit')::numeric,0);
        v_credit := v_credit + COALESCE((v_line->>'credit')::numeric,0);
    END LOOP;
    IF v_debit <> v_credit OR v_debit <= 0 THEN RAISE EXCEPTION 'Journal not balanced: debit %, credit %',v_debit,v_credit; END IF;
    PERFORM acct_validate_journal_entry(v_entry);
    UPDATE acct_journal_batches SET status='posted',posted_by=auth.uid(),posted_at=now() WHERE id=v_batch;
    RETURN v_entry;
END; $function$;
CREATE OR REPLACE FUNCTION public.revalidate_brand(p_brand uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE brand_placements SET status = 'unpublished'
   WHERE brand_id = p_brand AND status = 'published' AND NOT brand_supply_ok(brand_id, node_id);
  UPDATE brands SET status = 'draft'
   WHERE id = p_brand AND status = 'published' AND NOT brand_supply_ok(id, NULL);
  UPDATE products p SET status = 'draft'
   WHERE p.brand_id = p_brand AND p.status = 'published' AND NOT product_has_live_brand(p.id, p.brand_id);
END $function$;
CREATE OR REPLACE FUNCTION public.trg_brand_before()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE base TEXT; n INT := 1;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN NEW.slug := slugify(NEW.name); END IF;
  IF TG_OP = 'INSERT' OR NEW.slug IS DISTINCT FROM OLD.slug THEN
    base := NEW.slug;
    WHILE EXISTS (SELECT 1 FROM brands WHERE tenant_id = NEW.tenant_id AND slug = NEW.slug AND id <> NEW.id) LOOP
      n := n + 1; NEW.slug := base || '-' || n;
    END LOOP;
  END IF;

  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status <> 'published') THEN
    IF coalesce(trim(NEW.description), '') = '' THEN
      RAISE EXCEPTION 'Brand "%" needs a description before it can be published', NEW.name;
    END IF;
    IF NOT brand_supply_ok(NEW.id, NULL) THEN
      RAISE EXCEPTION 'Brand "%" cannot be published: no approved purchase order and no authorized marketplace seller', NEW.name;
    END IF;
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.trg_brand_placement_before()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE b brands%ROWTYPE; n taxonomy_nodes%ROWTYPE;
BEGIN
  SELECT * INTO b FROM brands WHERE id = NEW.brand_id;
  SELECT * INTO n FROM taxonomy_nodes WHERE id = NEW.node_id;
  IF b.tenant_id <> NEW.tenant_id OR n.tenant_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Brand, category and placement must belong to the same tenant';
  END IF;

  IF NEW.status = 'published'
     AND (TG_OP = 'INSERT' OR OLD.status <> 'published' OR NEW.node_id <> OLD.node_id) THEN
    IF n.status <> 'published' THEN
      RAISE EXCEPTION 'Category "%" is not published', n.name;
    END IF;
    IF NOT brand_supply_ok(NEW.brand_id, NEW.node_id) THEN
      RAISE EXCEPTION 'Brand "%" cannot be published in "%" (%): no approved purchase order covers this category and no authorized marketplace seller is approved for it',
        b.name, n.name, n.path;
    END IF;
    NEW.published_at := now();
    NEW.unpublished_at := NULL;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'published' AND NEW.status <> 'published' THEN
    NEW.unpublished_at := now();
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.acct_reverse_journal(p_journal_id uuid, p_reversal_date date, p_memo text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
DECLARE v_old acct_journal_entries%rowtype; v_period uuid; v_lines jsonb := '[]'::jsonb; r record; v_new uuid;
BEGIN
    SELECT * INTO v_old FROM acct_journal_entries WHERE id=p_journal_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Journal not found'; END IF;
    IF v_old.status <> 'posted' THEN RAISE EXCEPTION 'Only posted journals can be reversed'; END IF;
    SELECT id INTO v_period FROM acct_periods WHERE book_id=v_old.book_id AND p_reversal_date BETWEEN start_date AND end_date AND status IN ('open','soft_closed') LIMIT 1;
    IF v_period IS NULL THEN RAISE EXCEPTION 'No open accounting period for reversal date'; END IF;
    FOR r IN SELECT * FROM acct_journal_lines WHERE journal_entry_id=p_journal_id ORDER BY line_no LOOP
        v_lines := v_lines || jsonb_build_array(jsonb_build_object('account_id',r.account_id,'description',COALESCE(p_memo,'Reversal')||': '||COALESCE(r.description,''),'debit',r.credit,'credit',r.debit,'transaction_currency',r.transaction_currency,'transaction_debit',r.transaction_credit,'transaction_credit',r.transaction_debit,'exchange_rate',r.exchange_rate,'customer_id',r.customer_id,'vendor_id',r.vendor_id,'dimensions',r.dimensions));
    END LOOP;
    SELECT jsonb_agg(x) INTO v_lines FROM jsonb_array_elements(v_lines) a, LATERAL jsonb_array_elements(a.value) x;
    v_new := acct_post_journal(v_old.tenant_id,v_old.book_id,v_period,p_reversal_date,v_old.currency,v_lines,'manual',v_old.id::text,'REV-'||v_old.entry_no,COALESCE(p_memo,'Reversal of '||v_old.entry_no));
    UPDATE acct_journal_entries SET reversal_of_id=p_journal_id WHERE id=v_new;
    UPDATE acct_journal_entries SET status='reversed' WHERE id=p_journal_id;
    RETURN v_new;
END; $function$;
CREATE OR REPLACE FUNCTION public.trg_authorization_revoke()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM revalidate_brand(OLD.brand_id);
    RETURN OLD;
  END IF;
  IF OLD.status = 'approved' AND NEW.status <> 'approved' THEN
    PERFORM revalidate_brand(NEW.brand_id);
    UPDATE offers o SET status = 'suppressed'
      FROM product_variants v JOIN products p ON p.id = v.product_id
     WHERE o.variant_id = v.id AND o.seller_id = NEW.seller_id AND p.brand_id = NEW.brand_id AND o.status = 'active';
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.trg_po_revoke()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status IN ('approved','partially_received','received','closed')
     AND NEW.status NOT IN ('approved','partially_received','received','closed') THEN
    PERFORM revalidate_brand(NEW.brand_id);
  END IF;
  RETURN NEW;
END $function$;
CREATE OR REPLACE FUNCTION public.trg_seller_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE r RECORD;
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' AND NEW.approved_at IS NULL THEN
    UPDATE sellers SET approved_at = now() WHERE id = NEW.id;
  END IF;
  IF OLD.status = 'approved' AND NEW.status <> 'approved' THEN
    UPDATE offers SET status = 'suppressed' WHERE seller_id = NEW.id AND status = 'active';
    FOR r IN SELECT brand_id FROM seller_brand_authorizations WHERE seller_id = NEW.id LOOP
      PERFORM revalidate_brand(r.brand_id);
    END LOOP;
  END IF;
  RETURN NEW;
END $function$;

-- Triggers
CREATE TRIGGER ai_intent_events_append_only BEFORE DELETE OR UPDATE ON public.ai_intent_events FOR EACH ROW EXECUTE FUNCTION ai_intent_events_no_mutation();
CREATE TRIGGER cms_audience_segments_updated_at BEFORE UPDATE ON public.cms_audience_segments FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER cms_block_schemas_updated_at BEFORE UPDATE ON public.cms_block_schemas FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER cms_bundle_rules_updated_at BEFORE UPDATE ON public.cms_bundle_rules FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER cms_campaigns_updated_at BEFORE UPDATE ON public.cms_campaigns FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER cms_cart_thresholds_updated_at BEFORE UPDATE ON public.cms_cart_thresholds FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER cms_cdn_profiles_updated_at BEFORE UPDATE ON public.cms_cdn_profiles FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER cms_content_blocks_updated_at BEFORE UPDATE ON public.cms_content_blocks FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER cms_design_tokens_updated_at BEFORE UPDATE ON public.cms_design_tokens FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER cms_fallback_pages_updated_at BEFORE UPDATE ON public.cms_fallback_pages FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER cms_global_copy_updated_at BEFORE UPDATE ON public.cms_global_copy FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER cms_integrations_updated_at BEFORE UPDATE ON public.cms_integrations FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER cms_locales_updated_at BEFORE UPDATE ON public.cms_locales FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER cms_media_assets_updated_at BEFORE UPDATE ON public.cms_media_assets FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER cms_navigation_items_updated_at BEFORE UPDATE ON public.cms_navigation_items FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER cms_navigation_menus_updated_at BEFORE UPDATE ON public.cms_navigation_menus FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER cms_offers_updated_at BEFORE UPDATE ON public.cms_offers FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER cms_pages_updated_at BEFORE UPDATE ON public.cms_pages FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER cms_redirects_updated_at BEFORE UPDATE ON public.cms_redirects FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER cms_slots_updated_at BEFORE UPDATE ON public.cms_slots FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER cms_versions_updated_at BEFORE UPDATE ON public.cms_versions FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER cms_volume_tiers_updated_at BEFORE UPDATE ON public.cms_volume_tiers FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER cms_website_settings_updated_at BEFORE UPDATE ON public.cms_website_settings FOR EACH ROW EXECUTE FUNCTION cms_set_updated_at();
CREATE TRIGGER trg_cci_taxonomy_sync AFTER INSERT OR DELETE OR UPDATE OF metadata, active, sellable, ecommerce_enabled ON public.commerce_catalog_items FOR EACH ROW EXECUTE FUNCTION sync_catalog_item_taxonomy();
CREATE TRIGGER trg_fulfillment_package_lines_quantity_guard BEFORE INSERT OR UPDATE ON public.fulfillment_package_lines FOR EACH ROW EXECUTE FUNCTION fulfillment_package_lines_quantity_guard();
CREATE TRIGGER trg_outbox_order_lifecycle AFTER UPDATE OF status ON public.commerce_orders FOR EACH ROW EXECUTE FUNCTION outbox_emit_lifecycle();
CREATE TRIGGER trg_outbox_order_placed AFTER INSERT ON public.commerce_orders FOR EACH ROW EXECUTE FUNCTION outbox_emit();
CREATE TRIGGER trg_outbox_payment_captured AFTER INSERT OR UPDATE OF status ON public.commerce_payments FOR EACH ROW EXECUTE FUNCTION outbox_emit();
CREATE TRIGGER trg_outbox_seller_lifecycle AFTER UPDATE OF status ON public.sellers FOR EACH ROW EXECUTE FUNCTION outbox_emit_lifecycle();

-- Row Level Security
ALTER TABLE public."acct_account_dimension_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_allocation_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_ap_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_ap_bill_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_ap_bills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_ap_payment_applications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_ap_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_ap_purchase_order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_ap_purchase_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_ar_collections_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_ar_credit_memos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_ar_invoice_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_ar_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_ar_receipt_applications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_ar_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_asset_books" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_asset_classes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_asset_depreciation_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_asset_depreciation_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_bank_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_bank_statements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_bank_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_book_account_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_books" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_budget_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_budget_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_chart_of_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_close_checklists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_consolidation_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_consolidation_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_consolidation_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_controls" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_currencies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_customer_statements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_dimension_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_dimensions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_disputes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_entities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_estimate_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_estimates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_exchange_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_expense_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_expense_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_fiscal_years" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_fixed_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_fx_revaluation_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_gateway_clearing_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_gift_card_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_gift_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_import_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_integration_idempotency" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_intercompany_partners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_intercompany_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_journal_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_journal_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_journal_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_lease_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_leases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_pay_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_payment_terms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_payouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_payroll_deductions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_payroll_employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_payroll_run_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_payroll_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_payroll_tax_forms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_price_book_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_price_books" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_receipt_extractions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_reconciliation_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_reconciliations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_recurring_invoice_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_recurring_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_recurring_journals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_refund_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_revenue_contracts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_revenue_performance_obligations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_revenue_recognition_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_tax_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_tax_filings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_tax_jurisdictions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_tax_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_tax_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_timesheets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_vendors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_workflow_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_workflow_instances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."acct_workflows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."activity_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_account_tiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_advertisers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_analytics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_audiences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_budget_tiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_campaign_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_campaign_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_campaign_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_campaign_placements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_campaign_rates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_campaign_targeting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_creative_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_creatives" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_event_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_events_2026_10" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_events_2026_11" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_events_2026_12" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_events_2027_01" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_exchange_partners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_experiment_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_experiments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_frequency" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_markers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_placements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_rate_card" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_rate_card_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_rate_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ad_tiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."add_ons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."admin_impersonation_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."admin_manual_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ai_ab_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ai_ab_tests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ai_agents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ai_budget_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ai_disclosures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ai_intent_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ai_mcp_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ai_purposes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ai_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."analytics_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."analytics_export_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."app_password_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."app_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."attribute_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."attributes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."availability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."bank_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."bank_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."bill_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."bills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."blocked_times" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."brand_opt_outs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."brand_placements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."brand_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."brands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."canonical_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."capabilities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cart_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."carts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."catalog_bundle_components" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."catalog_bundles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."catalog_gtins" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."catalog_listing_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chargeback_details" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chart_of_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."checkouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_audience_segments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_banners" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_block_schemas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_bundle_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_cart_thresholds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_cdn_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_component_analytics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_content_blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_design_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_fallback_pages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_funnel_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_galleries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_gallery_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_global_content" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_global_copy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_locales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_media_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_media_taxonomy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_navigation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_navigation_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_navigation_menus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_offers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_page_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_pages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_policy_acceptances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_redirects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_seo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_slot_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_slots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_volume_tiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cms_website_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."collections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_accounting_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_barcodes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_batch_slips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_brands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_cart_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_carts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_cash_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_catalog_category_map" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_catalog_item_taxonomy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_catalog_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_channel_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_channel_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_checkout_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_coupon_redemptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_coupons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_customer_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_customer_addresses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_customer_payment_methods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_departments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_deposits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_disputes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_event_consumptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_export_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_fulfillment_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_gift_card_designs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_gift_card_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_gift_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_idempotency" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_inventory_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_inventory_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_loyalty_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_loyalty_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_modules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_order_channel_refs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_order_channels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_order_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_payment_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_payment_methods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_posting_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_price_lists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_prices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_procurement_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_product_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_product_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_promotion_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_promotion_targets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_promotions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_refund_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_return_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_return_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_sale_discounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_sale_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_sale_taxes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_sales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_shipping_labels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_store_credit_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_store_credits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_subscription_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_subscription_invoice_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_subscription_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_subscription_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_subscription_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_subscription_plan_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_subscription_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_supplier_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."commerce_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."communications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."contact_message" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."contact_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_appointment_services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_automation_enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_automation_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_automation_workflows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_campaign_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_commission_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_commission_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_commission_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_commission_tiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_communication_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_customer_behavior" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_customer_contact_methods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_customer_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_customer_tag_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_customer_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_document_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_document_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_duplicate_candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_external_identities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_funnel_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_holiday_blackouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_households" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_idempotency_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_lead_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_lead_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_merge_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_message_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_needs_attention" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_operating_hours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_party_dependents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_permanent_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_pricing_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_product_recommendations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_saved_views" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_search_index" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_segment_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_segments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_service_location_availability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_service_package_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_service_packages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_shift_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_staff_availability" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_staff_commission_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_staff_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_staff_incident_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_staff_performance_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_staff_shifts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_staff_time_clock_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_staff_training_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_surcharges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_time_off_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."crm_waitlist" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."currencies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_addresses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_ai_disclosure_acks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_return_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_statements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customer_wishlist_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."design_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."design_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."design_publications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."designs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."dmca_counter_notices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."dmca_designated_agent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."dmca_details" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."dmca_strikes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."dmca_takedown_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."dropship_pipe_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."dropship_pipe_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ecommerce_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."email_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."employee_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_carriers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_document_sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_fulfillment_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_fulfillment_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_goods_receipt_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_goods_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_idempotency_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_inventory_balances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_inventory_cost_layers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_inventory_count_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_inventory_count_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_inventory_lots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_inventory_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_inventory_reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_inventory_serial_numbers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_inventory_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_inventory_transfer_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_inventory_transfers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_order_addresses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_order_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_order_status_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_package_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_packages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_pick_task_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_pick_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_pick_waves" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_product_barcodes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_product_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_product_skus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_product_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_purchase_order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_purchase_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_replenishment_recommendations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_replenishment_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_return_authorizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_return_inspections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_return_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_return_refunds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_shipment_packages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_shipments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_shipping_methods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_stock_levels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_tracking_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_uom_conversions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_vendor_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_vendors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_warehouse_locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_warehouse_zones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."erp_warehouses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."estimate_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."estimates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."faqs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."feedback_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."fsm_child_instances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."fsm_transitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."fulfillment_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."fulfillment_label_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."fulfillment_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."fulfillment_package_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."fulfillment_packages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."gallery_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."gated_brands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."geo_zip_cache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."goods_receipt_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."goods_receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."google_ga4_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."google_ga4_landing_pages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."google_indexing_submissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."google_merchant_sync_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."google_merchant_sync_state" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."google_property_sync_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."google_search_console_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."google_search_console_sitemaps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."identity_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."integration_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."integration_secrets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inventory_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inventory_levels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."inventory_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."invoice_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."journal_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."journal_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."jurisdiction_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."licensee_advertisers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."licensee_api_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."licensee_creative_designs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."location_hour_exceptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."location_hours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."marketing_suppressions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."membership_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."merchandising_modules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."message_flags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."newsletter" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."newsletter_subscribers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."node_associations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."node_filter_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."node_filters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."oauth_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."offers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."onboarding_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."onboarding_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."onboarding_gates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_fulfillment_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_shipping_estimates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."page_components" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."partner_application_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."partner_portals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."partner_pushes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payment_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."paypal_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payroll_employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payroll_run_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payroll_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payroll_tax_forms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."payroll_timesheets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pdp_behavior_scores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."perk_ledger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."perk_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_account_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_admin_access_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_admins" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_backups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_capabilities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_customer_identity_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_db_contract_metadata" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_feature_flags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_feature_tree_coverage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_integration_health_registry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_lens_fields" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_lens_labels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_lenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_module_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_objects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_permission_registry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_quick_action_registry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_quick_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_reserved_slugs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_role_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_subscription_offers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_tools" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_vendor_identity_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."platform_workflow_transition_validation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."policy_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."portal_account_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."portal_action_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."portal_customer_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."portal_magic_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."portal_module_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."portal_permission_audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."portal_user_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."portal_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."pricing_packages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."privacy_request_details" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_attribute_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_canvas_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_collections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_nodes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_questions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_relations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_taxonomy_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_taxonomy_nodes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."product_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."projects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."promo_redemptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."promos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."provider_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."purchase_order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."purchase_order_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."purchase_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."quarantine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."receipt_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."receipts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reconciliations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."recurring_invoice_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."recurring_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."related_search_page_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."related_search_pages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."return_policy_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."route_redirects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sales_order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sales_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."search_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_1099k_generations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_ad_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_advertising_enrollments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_appeals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_brand_authorizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_category_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_customer_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_customer_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_data_processing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_dpa_acceptances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_email_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_inventory_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_investigations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_live_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_live_streams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_login_activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_performance_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_policy_enforcement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_remediation_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_sales_rewards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_self_serve_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_settlement_reversals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_settlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_social_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_solution_providers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_stripe_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_tax_exemptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_tax_remittance_filings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_violations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seller_webhooks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sellers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seo_overrides" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."seo_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."service_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."service_pricing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."services" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ship_from_addresses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shipping_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shipping_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_category_images" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_grid_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."shop_image_dims" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."site_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."social_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."social_data_deletion_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."social_media_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."social_oauth_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."social_oauth_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."social_outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."social_platform_apps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."social_platform_capabilities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."social_post_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."social_post_networks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."social_post_series" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."social_post_targets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."social_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."social_publish_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."social_schedule_slots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."social_webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."social_webhook_endpoints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ssp_endpoints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."state_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stg_feed" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stripe_pending_charges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."stripe_webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."subscription_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."supplier_catalog_products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."supplier_catalog_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."supplier_category_mapping" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."supplier_fulfillment_locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."supplier_import_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."supplier_imports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."supplier_mockup_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."supplier_print_specs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."supplier_product_costs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."supplier_product_mappings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."suppliers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."supply_service_map" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_automations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_business_hours" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_canned_replies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_case_details" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_channel_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_channels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_contact_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_contact_orgs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_drafts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_escalation_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_forms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_holidays" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_kb_articles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_macros" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_notification_prefs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_queues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_report_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_routing_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_side_conversation_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_side_conversation_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_side_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_signatures" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_sla_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_staff_skills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_team_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_teams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_ticket_access_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_ticket_counters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_ticket_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_ticket_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_ticket_relations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_time_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."support_webhooks_outbound" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sync_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."taxes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."taxonomy_category_bridge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."taxonomy_nodes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tenant_locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tenant_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tenant_printer_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tenant_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tenant_stripe_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tenant_wordpress_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."testimonials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."theme_prompts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."transaction_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."trust_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_session_tabs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."user_workspace_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."variant_axis_values" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."variant_fulfillment_routes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."vendor_invoice_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."vendor_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."vendors" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."verification_tasks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acct_account_dimension_rules_delete" ON public."acct_account_dimension_rules" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_account_dimension_rules_insert" ON public."acct_account_dimension_rules" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_account_dimension_rules_select" ON public."acct_account_dimension_rules" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_account_dimension_rules_update" ON public."acct_account_dimension_rules" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_alr_mutate" ON public."acct_allocation_rules" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM acct_allocations a
  WHERE ((a.id = acct_allocation_rules.allocation_id) AND platform_is_tenant_member(a.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM acct_allocations a
  WHERE ((a.id = acct_allocation_rules.allocation_id) AND platform_is_tenant_member(a.tenant_id)))));
CREATE POLICY "acct_alr_select" ON public."acct_allocation_rules" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM acct_allocations a
  WHERE ((a.id = acct_allocation_rules.allocation_id) AND platform_is_tenant_member(a.tenant_id)))));
CREATE POLICY "acct_allocations_delete" ON public."acct_allocations" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_allocations_insert" ON public."acct_allocations" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_allocations_select" ON public."acct_allocations" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_allocations_update" ON public."acct_allocations" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_ap_approvals_delete" ON public."acct_ap_approvals" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_ap_approvals_insert" ON public."acct_ap_approvals" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_ap_approvals_select" ON public."acct_ap_approvals" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_ap_approvals_update" ON public."acct_ap_approvals" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_ap_bill_lines_tenant_isolation" ON public."acct_ap_bill_lines" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_ap_bills_tenant_isolation" ON public."acct_ap_bills" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_appa_mutate" ON public."acct_ap_payment_applications" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM acct_ap_payments p
  WHERE ((p.id = acct_ap_payment_applications.payment_id) AND platform_is_tenant_member(p.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM acct_ap_payments p
  WHERE ((p.id = acct_ap_payment_applications.payment_id) AND platform_is_tenant_member(p.tenant_id)))));
CREATE POLICY "acct_appa_select" ON public."acct_ap_payment_applications" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM acct_ap_payments p
  WHERE ((p.id = acct_ap_payment_applications.payment_id) AND platform_is_tenant_member(p.tenant_id)))));
CREATE POLICY "acct_ap_payments_tenant_isolation" ON public."acct_ap_payments" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_apol_mutate" ON public."acct_ap_purchase_order_lines" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM acct_ap_purchase_orders po
  WHERE ((po.id = acct_ap_purchase_order_lines.purchase_order_id) AND platform_is_tenant_member(po.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM acct_ap_purchase_orders po
  WHERE ((po.id = acct_ap_purchase_order_lines.purchase_order_id) AND platform_is_tenant_member(po.tenant_id)))));
CREATE POLICY "acct_apol_select" ON public."acct_ap_purchase_order_lines" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM acct_ap_purchase_orders po
  WHERE ((po.id = acct_ap_purchase_order_lines.purchase_order_id) AND platform_is_tenant_member(po.tenant_id)))));
CREATE POLICY "acct_ap_purchase_orders_delete" ON public."acct_ap_purchase_orders" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_ap_purchase_orders_insert" ON public."acct_ap_purchase_orders" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_ap_purchase_orders_select" ON public."acct_ap_purchase_orders" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_ap_purchase_orders_update" ON public."acct_ap_purchase_orders" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_ar_collections_cases_delete" ON public."acct_ar_collections_cases" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_ar_collections_cases_insert" ON public."acct_ar_collections_cases" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_ar_collections_cases_select" ON public."acct_ar_collections_cases" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_ar_collections_cases_update" ON public."acct_ar_collections_cases" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_ar_credit_memos_delete" ON public."acct_ar_credit_memos" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_ar_credit_memos_insert" ON public."acct_ar_credit_memos" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_ar_credit_memos_select" ON public."acct_ar_credit_memos" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_ar_credit_memos_update" ON public."acct_ar_credit_memos" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_ar_invoice_lines_tenant_isolation" ON public."acct_ar_invoice_lines" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_ar_invoices_tenant_isolation" ON public."acct_ar_invoices" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_arra_mutate" ON public."acct_ar_receipt_applications" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM acct_ar_receipts r
  WHERE ((r.id = acct_ar_receipt_applications.receipt_id) AND platform_is_tenant_member(r.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM acct_ar_receipts r
  WHERE ((r.id = acct_ar_receipt_applications.receipt_id) AND platform_is_tenant_member(r.tenant_id)))));
CREATE POLICY "acct_arra_select" ON public."acct_ar_receipt_applications" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM acct_ar_receipts r
  WHERE ((r.id = acct_ar_receipt_applications.receipt_id) AND platform_is_tenant_member(r.tenant_id)))));
CREATE POLICY "acct_ar_receipts_tenant_isolation" ON public."acct_ar_receipts" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_ab_mutate" ON public."acct_asset_books" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM acct_fixed_assets fa
  WHERE ((fa.id = acct_asset_books.asset_id) AND platform_is_tenant_member(fa.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM acct_fixed_assets fa
  WHERE ((fa.id = acct_asset_books.asset_id) AND platform_is_tenant_member(fa.tenant_id)))));
CREATE POLICY "acct_ab_select" ON public."acct_asset_books" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM acct_fixed_assets fa
  WHERE ((fa.id = acct_asset_books.asset_id) AND platform_is_tenant_member(fa.tenant_id)))));
CREATE POLICY "acct_asset_classes_delete" ON public."acct_asset_classes" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_asset_classes_insert" ON public."acct_asset_classes" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_asset_classes_select" ON public."acct_asset_classes" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_asset_classes_update" ON public."acct_asset_classes" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_adl_mutate" ON public."acct_asset_depreciation_lines" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM acct_asset_depreciation_runs r
  WHERE ((r.id = acct_asset_depreciation_lines.run_id) AND platform_is_tenant_member(r.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM acct_asset_depreciation_runs r
  WHERE ((r.id = acct_asset_depreciation_lines.run_id) AND platform_is_tenant_member(r.tenant_id)))));
CREATE POLICY "acct_adl_select" ON public."acct_asset_depreciation_lines" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM acct_asset_depreciation_runs r
  WHERE ((r.id = acct_asset_depreciation_lines.run_id) AND platform_is_tenant_member(r.tenant_id)))));
CREATE POLICY "acct_asset_depreciation_runs_delete" ON public."acct_asset_depreciation_runs" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_asset_depreciation_runs_insert" ON public."acct_asset_depreciation_runs" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_asset_depreciation_runs_select" ON public."acct_asset_depreciation_runs" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_asset_depreciation_runs_update" ON public."acct_asset_depreciation_runs" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_attachments_delete" ON public."acct_attachments" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_attachments_insert" ON public."acct_attachments" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_attachments_select" ON public."acct_attachments" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_attachments_update" ON public."acct_attachments" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_audit_log_delete" ON public."acct_audit_log" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_audit_log_insert" ON public."acct_audit_log" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_audit_log_select" ON public."acct_audit_log" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_audit_log_update" ON public."acct_audit_log" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_bank_accounts_tenant_isolation" ON public."acct_bank_accounts" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_bank_statements_delete" ON public."acct_bank_statements" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_bank_statements_insert" ON public."acct_bank_statements" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_bank_statements_select" ON public."acct_bank_statements" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_bank_statements_update" ON public."acct_bank_statements" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_bank_transactions_tenant_isolation" ON public."acct_bank_transactions" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_book_account_mappings_delete" ON public."acct_book_account_mappings" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_book_account_mappings_insert" ON public."acct_book_account_mappings" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_book_account_mappings_select" ON public."acct_book_account_mappings" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_book_account_mappings_update" ON public."acct_book_account_mappings" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_books_delete" ON public."acct_books" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_books_insert" ON public."acct_books" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_books_select" ON public."acct_books" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_books_update" ON public."acct_books" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_bl_mutate" ON public."acct_budget_lines" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM acct_budget_versions bv
  WHERE ((bv.id = acct_budget_lines.budget_id) AND platform_is_tenant_member(bv.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM acct_budget_versions bv
  WHERE ((bv.id = acct_budget_lines.budget_id) AND platform_is_tenant_member(bv.tenant_id)))));
CREATE POLICY "acct_bl_select" ON public."acct_budget_lines" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM acct_budget_versions bv
  WHERE ((bv.id = acct_budget_lines.budget_id) AND platform_is_tenant_member(bv.tenant_id)))));
CREATE POLICY "acct_budget_versions_delete" ON public."acct_budget_versions" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_budget_versions_insert" ON public."acct_budget_versions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_budget_versions_select" ON public."acct_budget_versions" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_budget_versions_update" ON public."acct_budget_versions" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_chart_of_accounts_tenant_isolation" ON public."acct_chart_of_accounts" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_close_checklists_delete" ON public."acct_close_checklists" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_close_checklists_insert" ON public."acct_close_checklists" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_close_checklists_select" ON public."acct_close_checklists" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_close_checklists_update" ON public."acct_close_checklists" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_consolidation_groups_delete" ON public."acct_consolidation_groups" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_consolidation_groups_insert" ON public."acct_consolidation_groups" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_consolidation_groups_select" ON public."acct_consolidation_groups" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_consolidation_groups_update" ON public."acct_consolidation_groups" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_cm_mutate" ON public."acct_consolidation_members" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM acct_consolidation_groups g
  WHERE ((g.id = acct_consolidation_members.consolidation_group_id) AND platform_is_tenant_member(g.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM acct_consolidation_groups g
  WHERE ((g.id = acct_consolidation_members.consolidation_group_id) AND platform_is_tenant_member(g.tenant_id)))));
CREATE POLICY "acct_cm_select" ON public."acct_consolidation_members" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM acct_consolidation_groups g
  WHERE ((g.id = acct_consolidation_members.consolidation_group_id) AND platform_is_tenant_member(g.tenant_id)))));
CREATE POLICY "acct_consolidation_runs_delete" ON public."acct_consolidation_runs" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_consolidation_runs_insert" ON public."acct_consolidation_runs" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_consolidation_runs_select" ON public."acct_consolidation_runs" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_consolidation_runs_update" ON public."acct_consolidation_runs" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_controls_tenant_isolation" ON public."acct_controls" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_currencies_tenant_isolation" ON public."acct_currencies" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_customer_statements_delete" ON public."acct_customer_statements" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_customer_statements_insert" ON public."acct_customer_statements" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_customer_statements_select" ON public."acct_customer_statements" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_customer_statements_update" ON public."acct_customer_statements" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_customers_tenant_isolation" ON public."acct_customers" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_dimension_values_delete" ON public."acct_dimension_values" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_dimension_values_insert" ON public."acct_dimension_values" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_dimension_values_select" ON public."acct_dimension_values" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_dimension_values_update" ON public."acct_dimension_values" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_dimensions_delete" ON public."acct_dimensions" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_dimensions_insert" ON public."acct_dimensions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_dimensions_select" ON public."acct_dimensions" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_dimensions_update" ON public."acct_dimensions" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_service_all" ON public."acct_disputes" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "acct_employees_delete" ON public."acct_employees" AS PERMISSIVE FOR DELETE TO public USING ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text)));
CREATE POLICY "acct_employees_insert" ON public."acct_employees" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text)));
CREATE POLICY "acct_employees_select" ON public."acct_employees" AS PERMISSIVE FOR SELECT TO public USING ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.read'::text) OR (user_id = auth.uid())));
CREATE POLICY "acct_employees_update" ON public."acct_employees" AS PERMISSIVE FOR UPDATE TO public USING ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text))) WITH CHECK ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text)));
CREATE POLICY "acct_entities_delete" ON public."acct_entities" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_entities_insert" ON public."acct_entities" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_entities_select" ON public."acct_entities" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_entities_update" ON public."acct_entities" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_estl_mutate" ON public."acct_estimate_lines" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM acct_estimates e
  WHERE ((e.id = acct_estimate_lines.estimate_id) AND platform_is_tenant_member(e.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM acct_estimates e
  WHERE ((e.id = acct_estimate_lines.estimate_id) AND platform_is_tenant_member(e.tenant_id)))));
CREATE POLICY "acct_estl_select" ON public."acct_estimate_lines" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM acct_estimates e
  WHERE ((e.id = acct_estimate_lines.estimate_id) AND platform_is_tenant_member(e.tenant_id)))));
CREATE POLICY "acct_service_all" ON public."acct_estimates" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "acct_exchange_rates_delete" ON public."acct_exchange_rates" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_exchange_rates_insert" ON public."acct_exchange_rates" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_exchange_rates_select" ON public."acct_exchange_rates" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_exchange_rates_update" ON public."acct_exchange_rates" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_el_mutate" ON public."acct_expense_lines" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM acct_expense_reports er
  WHERE ((er.id = acct_expense_lines.expense_report_id) AND platform_is_tenant_member(er.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM acct_expense_reports er
  WHERE ((er.id = acct_expense_lines.expense_report_id) AND platform_is_tenant_member(er.tenant_id)))));
CREATE POLICY "acct_el_select" ON public."acct_expense_lines" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM acct_expense_reports er
  WHERE ((er.id = acct_expense_lines.expense_report_id) AND platform_is_tenant_member(er.tenant_id)))));
CREATE POLICY "acct_expense_reports_delete" ON public."acct_expense_reports" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_expense_reports_insert" ON public."acct_expense_reports" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_expense_reports_select" ON public."acct_expense_reports" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_expense_reports_update" ON public."acct_expense_reports" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_fiscal_years_tenant_isolation" ON public."acct_fiscal_years" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_fixed_assets_delete" ON public."acct_fixed_assets" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_fixed_assets_insert" ON public."acct_fixed_assets" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_fixed_assets_select" ON public."acct_fixed_assets" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_fixed_assets_update" ON public."acct_fixed_assets" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_fx_revaluation_runs_delete" ON public."acct_fx_revaluation_runs" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_fx_revaluation_runs_insert" ON public."acct_fx_revaluation_runs" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_fx_revaluation_runs_select" ON public."acct_fx_revaluation_runs" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_fx_revaluation_runs_update" ON public."acct_fx_revaluation_runs" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_gateway_clearing_entries_tenant_isolation" ON public."acct_gateway_clearing_entries" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_service_all" ON public."acct_gift_card_transactions" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "acct_service_all" ON public."acct_gift_cards" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "acct_import_jobs_delete" ON public."acct_import_jobs" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_import_jobs_insert" ON public."acct_import_jobs" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_import_jobs_select" ON public."acct_import_jobs" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_import_jobs_update" ON public."acct_import_jobs" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_integration_idempotency_delete" ON public."acct_integration_idempotency" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_integration_idempotency_insert" ON public."acct_integration_idempotency" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_integration_idempotency_select" ON public."acct_integration_idempotency" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_integration_idempotency_update" ON public."acct_integration_idempotency" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_intercompany_partners_delete" ON public."acct_intercompany_partners" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_intercompany_partners_insert" ON public."acct_intercompany_partners" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_intercompany_partners_select" ON public."acct_intercompany_partners" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_intercompany_partners_update" ON public."acct_intercompany_partners" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_intercompany_transactions_delete" ON public."acct_intercompany_transactions" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_intercompany_transactions_insert" ON public."acct_intercompany_transactions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_intercompany_transactions_select" ON public."acct_intercompany_transactions" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_intercompany_transactions_update" ON public."acct_intercompany_transactions" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_journal_batches_tenant_isolation" ON public."acct_journal_batches" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_journal_entries_tenant_isolation" ON public."acct_journal_entries" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_journal_lines_tenant_isolation" ON public."acct_journal_lines" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_lp_mutate" ON public."acct_lease_payments" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM acct_leases l
  WHERE ((l.id = acct_lease_payments.lease_id) AND platform_is_tenant_member(l.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM acct_leases l
  WHERE ((l.id = acct_lease_payments.lease_id) AND platform_is_tenant_member(l.tenant_id)))));
CREATE POLICY "acct_lp_select" ON public."acct_lease_payments" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM acct_leases l
  WHERE ((l.id = acct_lease_payments.lease_id) AND platform_is_tenant_member(l.tenant_id)))));
CREATE POLICY "acct_leases_delete" ON public."acct_leases" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_leases_insert" ON public."acct_leases" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_leases_select" ON public."acct_leases" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_leases_update" ON public."acct_leases" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_pay_periods_delete" ON public."acct_pay_periods" AS PERMISSIVE FOR DELETE TO public USING ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text)));
CREATE POLICY "acct_pay_periods_insert" ON public."acct_pay_periods" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text)));
CREATE POLICY "acct_pay_periods_select" ON public."acct_pay_periods" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_pay_periods_update" ON public."acct_pay_periods" AS PERMISSIVE FOR UPDATE TO public USING ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text))) WITH CHECK ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text)));
CREATE POLICY "acct_payment_terms_delete" ON public."acct_payment_terms" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_payment_terms_insert" ON public."acct_payment_terms" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_payment_terms_select" ON public."acct_payment_terms" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_payment_terms_update" ON public."acct_payment_terms" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_payouts_delete" ON public."acct_payouts" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_payouts_insert" ON public."acct_payouts" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_payouts_select" ON public."acct_payouts" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_payouts_update" ON public."acct_payouts" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_payroll_deductions_delete" ON public."acct_payroll_deductions" AS PERMISSIVE FOR DELETE TO public USING ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text)));
CREATE POLICY "acct_payroll_deductions_insert" ON public."acct_payroll_deductions" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text)));
CREATE POLICY "acct_payroll_deductions_select" ON public."acct_payroll_deductions" AS PERMISSIVE FOR SELECT TO public USING ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.read'::text) OR (EXISTS ( SELECT 1
   FROM acct_employees e
  WHERE ((e.id = acct_payroll_deductions.employee_id) AND (e.user_id = auth.uid()))))));
CREATE POLICY "acct_payroll_deductions_update" ON public."acct_payroll_deductions" AS PERMISSIVE FOR UPDATE TO public USING ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text))) WITH CHECK ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text)));
CREATE POLICY "acct_pri_mutate" ON public."acct_payroll_run_items" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM acct_payroll_runs r
  WHERE ((r.id = acct_payroll_run_items.payroll_run_id) AND platform_is_tenant_member(r.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM acct_payroll_runs r
  WHERE ((r.id = acct_payroll_run_items.payroll_run_id) AND platform_is_tenant_member(r.tenant_id)))));
CREATE POLICY "acct_pri_select" ON public."acct_payroll_run_items" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM acct_payroll_runs r
  WHERE ((r.id = acct_payroll_run_items.payroll_run_id) AND platform_is_tenant_member(r.tenant_id)))));
CREATE POLICY "acct_payroll_runs_delete" ON public."acct_payroll_runs" AS PERMISSIVE FOR DELETE TO public USING ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text)));
CREATE POLICY "acct_payroll_runs_insert" ON public."acct_payroll_runs" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text)));
CREATE POLICY "acct_payroll_runs_select" ON public."acct_payroll_runs" AS PERMISSIVE FOR SELECT TO public USING ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.read'::text)));
CREATE POLICY "acct_payroll_runs_update" ON public."acct_payroll_runs" AS PERMISSIVE FOR UPDATE TO public USING ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text))) WITH CHECK ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text)));
CREATE POLICY "acct_payroll_tax_forms_delete" ON public."acct_payroll_tax_forms" AS PERMISSIVE FOR DELETE TO public USING ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text)));
CREATE POLICY "acct_payroll_tax_forms_insert" ON public."acct_payroll_tax_forms" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text)));
CREATE POLICY "acct_payroll_tax_forms_select" ON public."acct_payroll_tax_forms" AS PERMISSIVE FOR SELECT TO public USING ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.read'::text) OR (EXISTS ( SELECT 1
   FROM acct_employees e
  WHERE ((e.id = acct_payroll_tax_forms.employee_id) AND (e.user_id = auth.uid()))))));
CREATE POLICY "acct_payroll_tax_forms_update" ON public."acct_payroll_tax_forms" AS PERMISSIVE FOR UPDATE TO public USING ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text))) WITH CHECK ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text)));
CREATE POLICY "acct_periods_tenant_isolation" ON public."acct_periods" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_price_book_lines_tenant_isolation" ON public."acct_price_book_lines" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_price_books_tenant_isolation" ON public."acct_price_books" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_receipt_extractions_tenant_isolation" ON public."acct_receipt_extractions" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_reconciliation_items_delete" ON public."acct_reconciliation_items" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_reconciliation_items_insert" ON public."acct_reconciliation_items" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_reconciliation_items_select" ON public."acct_reconciliation_items" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_reconciliation_items_update" ON public."acct_reconciliation_items" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_reconciliations_delete" ON public."acct_reconciliations" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_reconciliations_insert" ON public."acct_reconciliations" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_reconciliations_select" ON public."acct_reconciliations" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_reconciliations_update" ON public."acct_reconciliations" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_ril_mutate" ON public."acct_recurring_invoice_lines" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM acct_recurring_invoices ri
  WHERE ((ri.id = acct_recurring_invoice_lines.recurring_invoice_id) AND platform_is_tenant_member(ri.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM acct_recurring_invoices ri
  WHERE ((ri.id = acct_recurring_invoice_lines.recurring_invoice_id) AND platform_is_tenant_member(ri.tenant_id)))));
CREATE POLICY "acct_ril_select" ON public."acct_recurring_invoice_lines" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM acct_recurring_invoices ri
  WHERE ((ri.id = acct_recurring_invoice_lines.recurring_invoice_id) AND platform_is_tenant_member(ri.tenant_id)))));
CREATE POLICY "acct_service_all" ON public."acct_recurring_invoices" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "acct_recurring_journals_delete" ON public."acct_recurring_journals" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_recurring_journals_insert" ON public."acct_recurring_journals" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_recurring_journals_select" ON public."acct_recurring_journals" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_recurring_journals_update" ON public."acct_recurring_journals" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_service_all" ON public."acct_refund_policies" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "acct_service_all" ON public."acct_refunds" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "acct_revenue_contracts_delete" ON public."acct_revenue_contracts" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_revenue_contracts_insert" ON public."acct_revenue_contracts" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_revenue_contracts_select" ON public."acct_revenue_contracts" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_revenue_contracts_update" ON public."acct_revenue_contracts" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_rpo_mutate" ON public."acct_revenue_performance_obligations" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM acct_revenue_contracts c
  WHERE ((c.id = acct_revenue_performance_obligations.contract_id) AND platform_is_tenant_member(c.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM acct_revenue_contracts c
  WHERE ((c.id = acct_revenue_performance_obligations.contract_id) AND platform_is_tenant_member(c.tenant_id)))));
CREATE POLICY "acct_rpo_select" ON public."acct_revenue_performance_obligations" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM acct_revenue_contracts c
  WHERE ((c.id = acct_revenue_performance_obligations.contract_id) AND platform_is_tenant_member(c.tenant_id)))));
CREATE POLICY "acct_rrs_mutate" ON public."acct_revenue_recognition_schedules" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM (acct_revenue_performance_obligations o
     JOIN acct_revenue_contracts c ON ((c.id = o.contract_id)))
  WHERE ((o.id = acct_revenue_recognition_schedules.obligation_id) AND platform_is_tenant_member(c.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (acct_revenue_performance_obligations o
     JOIN acct_revenue_contracts c ON ((c.id = o.contract_id)))
  WHERE ((o.id = acct_revenue_recognition_schedules.obligation_id) AND platform_is_tenant_member(c.tenant_id)))));
CREATE POLICY "acct_rrs_select" ON public."acct_revenue_recognition_schedules" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (acct_revenue_performance_obligations o
     JOIN acct_revenue_contracts c ON ((c.id = o.contract_id)))
  WHERE ((o.id = acct_revenue_recognition_schedules.obligation_id) AND platform_is_tenant_member(c.tenant_id)))));
CREATE POLICY "acct_tax_codes_delete" ON public."acct_tax_codes" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_tax_codes_insert" ON public."acct_tax_codes" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_tax_codes_select" ON public."acct_tax_codes" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_tax_codes_update" ON public."acct_tax_codes" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_service_all" ON public."acct_tax_filings" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "acct_tax_jurisdictions_delete" ON public."acct_tax_jurisdictions" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_tax_jurisdictions_insert" ON public."acct_tax_jurisdictions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_tax_jurisdictions_select" ON public."acct_tax_jurisdictions" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_tax_jurisdictions_update" ON public."acct_tax_jurisdictions" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_service_all" ON public."acct_tax_rates" AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "acct_timesheets_delete" ON public."acct_timesheets" AS PERMISSIVE FOR DELETE TO public USING ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text)));
CREATE POLICY "acct_timesheets_insert" ON public."acct_timesheets" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text)));
CREATE POLICY "acct_timesheets_select" ON public."acct_timesheets" AS PERMISSIVE FOR SELECT TO public USING ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.read'::text) OR (EXISTS ( SELECT 1
   FROM acct_employees e
  WHERE ((e.id = acct_timesheets.employee_id) AND (e.user_id = auth.uid()))))));
CREATE POLICY "acct_timesheets_update" ON public."acct_timesheets" AS PERMISSIVE FOR UPDATE TO public USING ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text))) WITH CHECK ((platform_is_admin() OR platform_has_permission(tenant_id, 'payroll.write'::text)));
CREATE POLICY "acct_vendors_tenant_isolation" ON public."acct_vendors" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "acct_wfa_mutate" ON public."acct_workflow_actions" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM acct_workflow_instances wi
  WHERE ((wi.id = acct_workflow_actions.workflow_instance_id) AND platform_is_tenant_member(wi.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM acct_workflow_instances wi
  WHERE ((wi.id = acct_workflow_actions.workflow_instance_id) AND platform_is_tenant_member(wi.tenant_id)))));
CREATE POLICY "acct_wfa_select" ON public."acct_workflow_actions" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM acct_workflow_instances wi
  WHERE ((wi.id = acct_workflow_actions.workflow_instance_id) AND platform_is_tenant_member(wi.tenant_id)))));
CREATE POLICY "acct_workflow_instances_delete" ON public."acct_workflow_instances" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_workflow_instances_insert" ON public."acct_workflow_instances" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_workflow_instances_select" ON public."acct_workflow_instances" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_workflow_instances_update" ON public."acct_workflow_instances" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_workflows_delete" ON public."acct_workflows" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_workflows_insert" ON public."acct_workflows" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_workflows_select" ON public."acct_workflows" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "acct_workflows_update" ON public."acct_workflows" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "tenant_isolation" ON public."activity_log" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "tenant_isolation" ON public."add_ons" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "admin_impersonation_sessions_tenant_isolation" ON public."admin_impersonation_sessions" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "ai_ab_assignments_delete" ON public."ai_ab_assignments" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "ai_ab_assignments_insert" ON public."ai_ab_assignments" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "ai_ab_assignments_select" ON public."ai_ab_assignments" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "ai_ab_assignments_update" ON public."ai_ab_assignments" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "ai_ab_tests_delete" ON public."ai_ab_tests" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "ai_ab_tests_insert" ON public."ai_ab_tests" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "ai_ab_tests_select" ON public."ai_ab_tests" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "ai_ab_tests_update" ON public."ai_ab_tests" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "ai_agents_delete" ON public."ai_agents" AS PERMISSIVE FOR DELETE TO public USING (((tenant_id IS NULL) OR platform_is_tenant_member(tenant_id)));
CREATE POLICY "ai_agents_insert" ON public."ai_agents" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((tenant_id IS NULL) OR platform_is_tenant_member(tenant_id)));
CREATE POLICY "ai_agents_select" ON public."ai_agents" AS PERMISSIVE FOR SELECT TO public USING (((tenant_id IS NULL) OR platform_is_tenant_member(tenant_id)));
CREATE POLICY "ai_agents_update" ON public."ai_agents" AS PERMISSIVE FOR UPDATE TO public USING (((tenant_id IS NULL) OR platform_is_tenant_member(tenant_id))) WITH CHECK (((tenant_id IS NULL) OR platform_is_tenant_member(tenant_id)));
CREATE POLICY "ai_budget_alerts_delete" ON public."ai_budget_alerts" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "ai_budget_alerts_insert" ON public."ai_budget_alerts" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "ai_budget_alerts_select" ON public."ai_budget_alerts" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "ai_budget_alerts_update" ON public."ai_budget_alerts" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "ai_mcp_connections_delete" ON public."ai_mcp_connections" AS PERMISSIVE FOR DELETE TO public USING (((tenant_id IS NULL) OR platform_is_tenant_member(tenant_id)));
CREATE POLICY "ai_mcp_connections_insert" ON public."ai_mcp_connections" AS PERMISSIVE FOR INSERT TO public WITH CHECK (((tenant_id IS NULL) OR platform_is_tenant_member(tenant_id)));
CREATE POLICY "ai_mcp_connections_select" ON public."ai_mcp_connections" AS PERMISSIVE FOR SELECT TO public USING (((tenant_id IS NULL) OR platform_is_tenant_member(tenant_id)));
CREATE POLICY "ai_mcp_connections_update" ON public."ai_mcp_connections" AS PERMISSIVE FOR UPDATE TO public USING (((tenant_id IS NULL) OR platform_is_tenant_member(tenant_id))) WITH CHECK (((tenant_id IS NULL) OR platform_is_tenant_member(tenant_id)));
CREATE POLICY "analytics_export_runs_delete" ON public."analytics_export_runs" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "analytics_export_runs_insert" ON public."analytics_export_runs" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "analytics_export_runs_select" ON public."analytics_export_runs" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "analytics_export_runs_update" ON public."analytics_export_runs" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "tenant_isolation" ON public."availability" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "tenant_isolation" ON public."bank_accounts" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "tenant_isolation" ON public."bank_transactions" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "tenant_isolation" ON public."bill_items" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = bill_items.bill_id) AND (b.tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM bills b
  WHERE ((b.id = bill_items.bill_id) AND (b.tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))))));
CREATE POLICY "tenant_isolation" ON public."bills" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "tenant_isolation" ON public."blocked_times" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "Public can view brands" ON public."brands" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "catalog_bundle_components_delete" ON public."catalog_bundle_components" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "catalog_bundle_components_insert" ON public."catalog_bundle_components" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "catalog_bundle_components_select" ON public."catalog_bundle_components" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "catalog_bundle_components_update" ON public."catalog_bundle_components" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "catalog_bundles_delete" ON public."catalog_bundles" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "catalog_bundles_insert" ON public."catalog_bundles" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "catalog_bundles_select" ON public."catalog_bundles" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "catalog_bundles_update" ON public."catalog_bundles" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "catalog_gtins_delete" ON public."catalog_gtins" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "catalog_gtins_insert" ON public."catalog_gtins" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "catalog_gtins_select" ON public."catalog_gtins" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "catalog_gtins_update" ON public."catalog_gtins" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "Public can view shared taxonomy" ON public."categories" AS PERMISSIVE FOR SELECT TO public USING (((tenant_id IS NULL) OR (tenant_id = current_tenant_id())));
CREATE POLICY "chargeback_details_delete" ON public."chargeback_details" AS PERMISSIVE FOR DELETE TO public USING ((platform_is_tenant_member(tenant_id) AND platform_has_permission(tenant_id, 'support.privacy'::text)));
CREATE POLICY "chargeback_details_insert" ON public."chargeback_details" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "chargeback_details_select" ON public."chargeback_details" AS PERMISSIVE FOR SELECT TO public USING ((platform_is_tenant_member(tenant_id) OR support_grant_access(ticket_id, 'view'::text) OR platform_has_permission(tenant_id, 'support.privacy'::text)));
CREATE POLICY "chargeback_details_update" ON public."chargeback_details" AS PERMISSIVE FOR UPDATE TO public USING ((platform_is_tenant_member(tenant_id) AND platform_has_permission(tenant_id, 'support.privacy'::text))) WITH CHECK ((platform_is_tenant_member(tenant_id) AND platform_has_permission(tenant_id, 'support.privacy'::text)));
CREATE POLICY "tenant_isolation" ON public."chart_of_accounts" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "tenant_isolation" ON public."checkouts" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "cms_banners_delete" ON public."cms_banners" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_banners_insert" ON public."cms_banners" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_banners_public_read" ON public."cms_banners" AS PERMISSIVE FOR SELECT TO public USING ((is_active AND ((starts_at IS NULL) OR (starts_at <= now())) AND ((ends_at IS NULL) OR (ends_at > now()))));
CREATE POLICY "cms_banners_select" ON public."cms_banners" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_banners_update" ON public."cms_banners" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_galleries_delete" ON public."cms_galleries" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_galleries_insert" ON public."cms_galleries" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_galleries_public_read" ON public."cms_galleries" AS PERMISSIVE FOR SELECT TO public USING (is_published);
CREATE POLICY "cms_galleries_select" ON public."cms_galleries" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_galleries_update" ON public."cms_galleries" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_gallery_items_delete" ON public."cms_gallery_items" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_gallery_items_insert" ON public."cms_gallery_items" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_gallery_items_public_read" ON public."cms_gallery_items" AS PERMISSIVE FOR SELECT TO public USING ((is_published AND consent_on_file));
CREATE POLICY "cms_gallery_items_select" ON public."cms_gallery_items" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_gallery_items_update" ON public."cms_gallery_items" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_global_content_delete" ON public."cms_global_content" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_global_content_insert" ON public."cms_global_content" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_global_content_public_read" ON public."cms_global_content" AS PERMISSIVE FOR SELECT TO public USING (((content_group <> 'legal'::text) OR true));
CREATE POLICY "cms_global_content_select" ON public."cms_global_content" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_global_content_update" ON public."cms_global_content" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_navigation_delete" ON public."cms_navigation" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_navigation_insert" ON public."cms_navigation" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_navigation_public_read" ON public."cms_navigation" AS PERMISSIVE FOR SELECT TO public USING ((is_active AND (visibility = 'public'::text)));
CREATE POLICY "cms_navigation_select" ON public."cms_navigation" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_navigation_update" ON public."cms_navigation" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_page_revisions_delete" ON public."cms_page_revisions" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_page_revisions_insert" ON public."cms_page_revisions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_page_revisions_select" ON public."cms_page_revisions" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_page_revisions_update" ON public."cms_page_revisions" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_pages_delete" ON public."cms_pages" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_pages_insert" ON public."cms_pages" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_pages_public_read" ON public."cms_pages" AS PERMISSIVE FOR SELECT TO public USING ((status = 'published'::text));
CREATE POLICY "cms_pages_select" ON public."cms_pages" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_pages_update" ON public."cms_pages" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_policy_acceptances_delete" ON public."cms_policy_acceptances" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_policy_acceptances_insert" ON public."cms_policy_acceptances" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_policy_acceptances_select" ON public."cms_policy_acceptances" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_policy_acceptances_update" ON public."cms_policy_acceptances" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_seo_delete" ON public."cms_seo" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_seo_insert" ON public."cms_seo" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_seo_select" ON public."cms_seo" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "cms_seo_update" ON public."cms_seo" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "Public can view collections" ON public."collections" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "commerce_accounting_mappings_delete" ON public."commerce_accounting_mappings" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_accounting_mappings_insert" ON public."commerce_accounting_mappings" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_accounting_mappings_select" ON public."commerce_accounting_mappings" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_accounting_mappings_update" ON public."commerce_accounting_mappings" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_audit_log_delete" ON public."commerce_audit_log" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_audit_log_insert" ON public."commerce_audit_log" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_audit_log_select" ON public."commerce_audit_log" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_audit_log_update" ON public."commerce_audit_log" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_barcodes_delete" ON public."commerce_barcodes" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_barcodes_insert" ON public."commerce_barcodes" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_barcodes_select" ON public."commerce_barcodes" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_barcodes_update" ON public."commerce_barcodes" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_batch_slips_delete" ON public."commerce_batch_slips" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_batch_slips_insert" ON public."commerce_batch_slips" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_batch_slips_select" ON public."commerce_batch_slips" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_batch_slips_update" ON public."commerce_batch_slips" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_branches_delete" ON public."commerce_branches" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_branches_insert" ON public."commerce_branches" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_branches_select" ON public."commerce_branches" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_branches_update" ON public."commerce_branches" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_cl_mutate" ON public."commerce_cart_lines" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM commerce_carts c
  WHERE ((c.id = commerce_cart_lines.cart_id) AND platform_is_tenant_member(c.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM commerce_carts c
  WHERE ((c.id = commerce_cart_lines.cart_id) AND platform_is_tenant_member(c.tenant_id)))));
CREATE POLICY "commerce_cl_select" ON public."commerce_cart_lines" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM commerce_carts c
  WHERE ((c.id = commerce_cart_lines.cart_id) AND platform_is_tenant_member(c.tenant_id)))));
CREATE POLICY "commerce_carts_delete" ON public."commerce_carts" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_carts_insert" ON public."commerce_carts" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_carts_select" ON public."commerce_carts" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_carts_update" ON public."commerce_carts" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_cash_movements_delete" ON public."commerce_cash_movements" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_cash_movements_insert" ON public."commerce_cash_movements" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_cash_movements_select" ON public."commerce_cash_movements" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_cash_movements_update" ON public."commerce_cash_movements" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_ccm_mutate" ON public."commerce_catalog_category_map" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM commerce_catalog_items ci
  WHERE ((ci.id = commerce_catalog_category_map.catalog_item_id) AND platform_is_tenant_member(ci.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM commerce_catalog_items ci
  WHERE ((ci.id = commerce_catalog_category_map.catalog_item_id) AND platform_is_tenant_member(ci.tenant_id)))));
CREATE POLICY "commerce_ccm_select" ON public."commerce_catalog_category_map" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM commerce_catalog_items ci
  WHERE ((ci.id = commerce_catalog_category_map.catalog_item_id) AND platform_is_tenant_member(ci.tenant_id)))));
CREATE POLICY "commerce_catalog_items_delete" ON public."commerce_catalog_items" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_catalog_items_insert" ON public."commerce_catalog_items" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_catalog_items_select" ON public."commerce_catalog_items" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_catalog_items_update" ON public."commerce_catalog_items" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_categories_delete" ON public."commerce_categories" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_categories_insert" ON public."commerce_categories" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_categories_select" ON public."commerce_categories" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_categories_update" ON public."commerce_categories" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_channel_events_delete" ON public."commerce_channel_events" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_channel_events_insert" ON public."commerce_channel_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_channel_events_select" ON public."commerce_channel_events" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_channel_events_update" ON public."commerce_channel_events" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_channel_products_delete" ON public."commerce_channel_products" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_channel_products_insert" ON public."commerce_channel_products" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_channel_products_select" ON public."commerce_channel_products" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_channel_products_update" ON public."commerce_channel_products" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_checkout_sessions_delete" ON public."commerce_checkout_sessions" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_checkout_sessions_insert" ON public."commerce_checkout_sessions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_checkout_sessions_select" ON public."commerce_checkout_sessions" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_checkout_sessions_update" ON public."commerce_checkout_sessions" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_cr_mutate" ON public."commerce_coupon_redemptions" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM commerce_coupons c
  WHERE ((c.id = commerce_coupon_redemptions.coupon_id) AND platform_is_tenant_member(c.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM commerce_coupons c
  WHERE ((c.id = commerce_coupon_redemptions.coupon_id) AND platform_is_tenant_member(c.tenant_id)))));
CREATE POLICY "commerce_cr_select" ON public."commerce_coupon_redemptions" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM commerce_coupons c
  WHERE ((c.id = commerce_coupon_redemptions.coupon_id) AND platform_is_tenant_member(c.tenant_id)))));
CREATE POLICY "commerce_coupons_delete" ON public."commerce_coupons" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_coupons_insert" ON public."commerce_coupons" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_coupons_select" ON public."commerce_coupons" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_coupons_update" ON public."commerce_coupons" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_customer_accounts_delete" ON public."commerce_customer_accounts" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_customer_accounts_insert" ON public."commerce_customer_accounts" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_customer_accounts_select" ON public."commerce_customer_accounts" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_customer_accounts_update" ON public."commerce_customer_accounts" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_customer_addresses_delete" ON public."commerce_customer_addresses" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_customer_addresses_insert" ON public."commerce_customer_addresses" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_customer_addresses_select" ON public."commerce_customer_addresses" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_customer_addresses_update" ON public."commerce_customer_addresses" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_customer_payment_methods_delete" ON public."commerce_customer_payment_methods" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_customer_payment_methods_insert" ON public."commerce_customer_payment_methods" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_customer_payment_methods_select" ON public."commerce_customer_payment_methods" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_customer_payment_methods_update" ON public."commerce_customer_payment_methods" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_departments_delete" ON public."commerce_departments" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_departments_insert" ON public."commerce_departments" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_departments_select" ON public."commerce_departments" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_departments_update" ON public."commerce_departments" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_deposits_delete" ON public."commerce_deposits" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_deposits_insert" ON public."commerce_deposits" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_deposits_select" ON public."commerce_deposits" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_deposits_update" ON public."commerce_deposits" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_disputes_delete" ON public."commerce_disputes" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_disputes_insert" ON public."commerce_disputes" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_disputes_select" ON public."commerce_disputes" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_disputes_update" ON public."commerce_disputes" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_event_consumptions_delete" ON public."commerce_event_consumptions" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_event_consumptions_insert" ON public."commerce_event_consumptions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_event_consumptions_select" ON public."commerce_event_consumptions" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_event_consumptions_update" ON public."commerce_event_consumptions" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_export_jobs_delete" ON public."commerce_export_jobs" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_export_jobs_insert" ON public."commerce_export_jobs" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_export_jobs_select" ON public."commerce_export_jobs" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_export_jobs_update" ON public."commerce_export_jobs" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_fulfillment_events_delete" ON public."commerce_fulfillment_events" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_fulfillment_events_insert" ON public."commerce_fulfillment_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_fulfillment_events_select" ON public."commerce_fulfillment_events" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_fulfillment_events_update" ON public."commerce_fulfillment_events" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_gct_mutate" ON public."commerce_gift_card_transactions" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM commerce_gift_cards gc
  WHERE ((gc.id = commerce_gift_card_transactions.gift_card_id) AND platform_is_tenant_member(gc.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM commerce_gift_cards gc
  WHERE ((gc.id = commerce_gift_card_transactions.gift_card_id) AND platform_is_tenant_member(gc.tenant_id)))));
CREATE POLICY "commerce_gct_select" ON public."commerce_gift_card_transactions" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM commerce_gift_cards gc
  WHERE ((gc.id = commerce_gift_card_transactions.gift_card_id) AND platform_is_tenant_member(gc.tenant_id)))));
CREATE POLICY "commerce_gift_cards_delete" ON public."commerce_gift_cards" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_gift_cards_insert" ON public."commerce_gift_cards" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_gift_cards_select" ON public."commerce_gift_cards" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_gift_cards_update" ON public."commerce_gift_cards" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_idempotency_delete" ON public."commerce_idempotency" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_idempotency_insert" ON public."commerce_idempotency" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_idempotency_select" ON public."commerce_idempotency" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_idempotency_update" ON public."commerce_idempotency" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_inventory_alerts_delete" ON public."commerce_inventory_alerts" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_inventory_alerts_insert" ON public."commerce_inventory_alerts" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_inventory_alerts_select" ON public."commerce_inventory_alerts" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_inventory_alerts_update" ON public."commerce_inventory_alerts" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_inventory_events_delete" ON public."commerce_inventory_events" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_inventory_events_insert" ON public."commerce_inventory_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_inventory_events_select" ON public."commerce_inventory_events" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_inventory_events_update" ON public."commerce_inventory_events" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_loyalty_accounts_delete" ON public."commerce_loyalty_accounts" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_loyalty_accounts_insert" ON public."commerce_loyalty_accounts" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_loyalty_accounts_select" ON public."commerce_loyalty_accounts" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_loyalty_accounts_update" ON public."commerce_loyalty_accounts" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_lt_mutate" ON public."commerce_loyalty_transactions" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM commerce_loyalty_accounts la
  WHERE ((la.id = commerce_loyalty_transactions.loyalty_account_id) AND platform_is_tenant_member(la.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM commerce_loyalty_accounts la
  WHERE ((la.id = commerce_loyalty_transactions.loyalty_account_id) AND platform_is_tenant_member(la.tenant_id)))));
CREATE POLICY "commerce_lt_select" ON public."commerce_loyalty_transactions" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM commerce_loyalty_accounts la
  WHERE ((la.id = commerce_loyalty_transactions.loyalty_account_id) AND platform_is_tenant_member(la.tenant_id)))));
CREATE POLICY "commerce_modules_delete" ON public."commerce_modules" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_modules_insert" ON public."commerce_modules" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_modules_select" ON public."commerce_modules" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_modules_update" ON public."commerce_modules" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_order_channel_refs_delete" ON public."commerce_order_channel_refs" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_order_channel_refs_insert" ON public."commerce_order_channel_refs" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_order_channel_refs_select" ON public."commerce_order_channel_refs" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_order_channel_refs_update" ON public."commerce_order_channel_refs" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_order_channels_delete" ON public."commerce_order_channels" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_order_channels_insert" ON public."commerce_order_channels" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_order_channels_select" ON public."commerce_order_channels" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_order_channels_update" ON public."commerce_order_channels" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_order_events_delete" ON public."commerce_order_events" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_order_events_insert" ON public."commerce_order_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_order_events_select" ON public."commerce_order_events" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_order_events_update" ON public."commerce_order_events" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_outbox_events_delete" ON public."commerce_outbox_events" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_outbox_events_insert" ON public."commerce_outbox_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_outbox_events_select" ON public."commerce_outbox_events" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_outbox_events_update" ON public."commerce_outbox_events" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_pa_mutate" ON public."commerce_payment_allocations" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM commerce_payments p
  WHERE ((p.id = commerce_payment_allocations.payment_id) AND platform_is_tenant_member(p.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM commerce_payments p
  WHERE ((p.id = commerce_payment_allocations.payment_id) AND platform_is_tenant_member(p.tenant_id)))));
CREATE POLICY "commerce_pa_select" ON public."commerce_payment_allocations" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM commerce_payments p
  WHERE ((p.id = commerce_payment_allocations.payment_id) AND platform_is_tenant_member(p.tenant_id)))));
CREATE POLICY "commerce_payment_methods_delete" ON public."commerce_payment_methods" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_payment_methods_insert" ON public."commerce_payment_methods" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_payment_methods_select" ON public."commerce_payment_methods" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_payment_methods_update" ON public."commerce_payment_methods" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_payments_delete" ON public."commerce_payments" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_payments_insert" ON public."commerce_payments" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_payments_select" ON public."commerce_payments" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_payments_update" ON public."commerce_payments" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_posting_events_delete" ON public."commerce_posting_events" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_posting_events_insert" ON public."commerce_posting_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_posting_events_select" ON public."commerce_posting_events" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_posting_events_update" ON public."commerce_posting_events" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_price_lists_delete" ON public."commerce_price_lists" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_price_lists_insert" ON public."commerce_price_lists" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_price_lists_select" ON public."commerce_price_lists" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_price_lists_update" ON public."commerce_price_lists" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_prices_delete" ON public."commerce_prices" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_prices_insert" ON public."commerce_prices" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_prices_select" ON public."commerce_prices" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_prices_update" ON public."commerce_prices" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_procurement_events_delete" ON public."commerce_procurement_events" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_procurement_events_insert" ON public."commerce_procurement_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_procurement_events_select" ON public."commerce_procurement_events" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_procurement_events_update" ON public."commerce_procurement_events" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_product_media_delete" ON public."commerce_product_media" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_product_media_insert" ON public."commerce_product_media" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_product_media_select" ON public."commerce_product_media" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_product_media_update" ON public."commerce_product_media" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_product_tags_delete" ON public."commerce_product_tags" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_product_tags_insert" ON public."commerce_product_tags" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_product_tags_select" ON public."commerce_product_tags" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_product_tags_update" ON public."commerce_product_tags" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_promotion_items_delete" ON public."commerce_promotion_items" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_promotion_items_insert" ON public."commerce_promotion_items" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_promotion_items_select" ON public."commerce_promotion_items" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_promotion_items_update" ON public."commerce_promotion_items" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_promotions_delete" ON public."commerce_promotions" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_promotions_insert" ON public."commerce_promotions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_promotions_select" ON public."commerce_promotions" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_promotions_update" ON public."commerce_promotions" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_receipts_delete" ON public."commerce_receipts" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_receipts_insert" ON public."commerce_receipts" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_receipts_select" ON public."commerce_receipts" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_receipts_update" ON public."commerce_receipts" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_rl_mutate" ON public."commerce_refund_lines" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM commerce_refunds r
  WHERE ((r.id = commerce_refund_lines.refund_id) AND platform_is_tenant_member(r.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM commerce_refunds r
  WHERE ((r.id = commerce_refund_lines.refund_id) AND platform_is_tenant_member(r.tenant_id)))));
CREATE POLICY "commerce_rl_select" ON public."commerce_refund_lines" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM commerce_refunds r
  WHERE ((r.id = commerce_refund_lines.refund_id) AND platform_is_tenant_member(r.tenant_id)))));
CREATE POLICY "commerce_refunds_delete" ON public."commerce_refunds" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_refunds_insert" ON public."commerce_refunds" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_refunds_select" ON public."commerce_refunds" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_refunds_update" ON public."commerce_refunds" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_return_actions_delete" ON public."commerce_return_actions" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_return_actions_insert" ON public."commerce_return_actions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_return_actions_select" ON public."commerce_return_actions" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_return_actions_update" ON public."commerce_return_actions" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_return_events_delete" ON public."commerce_return_events" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_return_events_insert" ON public."commerce_return_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_return_events_select" ON public."commerce_return_events" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_return_events_update" ON public."commerce_return_events" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_sd_mutate" ON public."commerce_sale_discounts" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM commerce_sales s
  WHERE ((s.id = commerce_sale_discounts.sale_id) AND platform_is_tenant_member(s.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM commerce_sales s
  WHERE ((s.id = commerce_sale_discounts.sale_id) AND platform_is_tenant_member(s.tenant_id)))));
CREATE POLICY "commerce_sd_select" ON public."commerce_sale_discounts" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM commerce_sales s
  WHERE ((s.id = commerce_sale_discounts.sale_id) AND platform_is_tenant_member(s.tenant_id)))));
CREATE POLICY "commerce_sl_mutate" ON public."commerce_sale_lines" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM commerce_sales s
  WHERE ((s.id = commerce_sale_lines.sale_id) AND platform_is_tenant_member(s.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM commerce_sales s
  WHERE ((s.id = commerce_sale_lines.sale_id) AND platform_is_tenant_member(s.tenant_id)))));
CREATE POLICY "commerce_sl_select" ON public."commerce_sale_lines" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM commerce_sales s
  WHERE ((s.id = commerce_sale_lines.sale_id) AND platform_is_tenant_member(s.tenant_id)))));
CREATE POLICY "commerce_st_mutate" ON public."commerce_sale_taxes" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM commerce_sales s
  WHERE ((s.id = commerce_sale_taxes.sale_id) AND platform_is_tenant_member(s.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM commerce_sales s
  WHERE ((s.id = commerce_sale_taxes.sale_id) AND platform_is_tenant_member(s.tenant_id)))));
CREATE POLICY "commerce_st_select" ON public."commerce_sale_taxes" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM commerce_sales s
  WHERE ((s.id = commerce_sale_taxes.sale_id) AND platform_is_tenant_member(s.tenant_id)))));
CREATE POLICY "commerce_sales_delete" ON public."commerce_sales" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_sales_insert" ON public."commerce_sales" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_sales_select" ON public."commerce_sales" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_sales_update" ON public."commerce_sales" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_shipping_labels_delete" ON public."commerce_shipping_labels" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_shipping_labels_insert" ON public."commerce_shipping_labels" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_shipping_labels_select" ON public."commerce_shipping_labels" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_shipping_labels_update" ON public."commerce_shipping_labels" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_sct_mutate" ON public."commerce_store_credit_transactions" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM commerce_store_credits sc
  WHERE ((sc.id = commerce_store_credit_transactions.store_credit_id) AND platform_is_tenant_member(sc.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM commerce_store_credits sc
  WHERE ((sc.id = commerce_store_credit_transactions.store_credit_id) AND platform_is_tenant_member(sc.tenant_id)))));
CREATE POLICY "commerce_sct_select" ON public."commerce_store_credit_transactions" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM commerce_store_credits sc
  WHERE ((sc.id = commerce_store_credit_transactions.store_credit_id) AND platform_is_tenant_member(sc.tenant_id)))));
CREATE POLICY "commerce_store_credits_delete" ON public."commerce_store_credits" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_store_credits_insert" ON public."commerce_store_credits" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_store_credits_select" ON public."commerce_store_credits" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_store_credits_update" ON public."commerce_store_credits" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_se_mutate" ON public."commerce_subscription_events" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM commerce_subscriptions s
  WHERE ((s.id = commerce_subscription_events.subscription_id) AND platform_is_tenant_member(s.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM commerce_subscriptions s
  WHERE ((s.id = commerce_subscription_events.subscription_id) AND platform_is_tenant_member(s.tenant_id)))));
CREATE POLICY "commerce_se_select" ON public."commerce_subscription_events" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM commerce_subscriptions s
  WHERE ((s.id = commerce_subscription_events.subscription_id) AND platform_is_tenant_member(s.tenant_id)))));
CREATE POLICY "commerce_sil_mutate" ON public."commerce_subscription_invoice_lines" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM commerce_subscription_invoices si
  WHERE ((si.id = commerce_subscription_invoice_lines.subscription_invoice_id) AND platform_is_tenant_member(si.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM commerce_subscription_invoices si
  WHERE ((si.id = commerce_subscription_invoice_lines.subscription_invoice_id) AND platform_is_tenant_member(si.tenant_id)))));
CREATE POLICY "commerce_sil_select" ON public."commerce_subscription_invoice_lines" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM commerce_subscription_invoices si
  WHERE ((si.id = commerce_subscription_invoice_lines.subscription_invoice_id) AND platform_is_tenant_member(si.tenant_id)))));
CREATE POLICY "commerce_subscription_invoices_delete" ON public."commerce_subscription_invoices" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_subscription_invoices_insert" ON public."commerce_subscription_invoices" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_subscription_invoices_select" ON public."commerce_subscription_invoices" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_subscription_invoices_update" ON public."commerce_subscription_invoices" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_sui_mutate" ON public."commerce_subscription_items" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM commerce_subscriptions s
  WHERE ((s.id = commerce_subscription_items.subscription_id) AND platform_is_tenant_member(s.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM commerce_subscriptions s
  WHERE ((s.id = commerce_subscription_items.subscription_id) AND platform_is_tenant_member(s.tenant_id)))));
CREATE POLICY "commerce_sui_select" ON public."commerce_subscription_items" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM commerce_subscriptions s
  WHERE ((s.id = commerce_subscription_items.subscription_id) AND platform_is_tenant_member(s.tenant_id)))));
CREATE POLICY "commerce_sp_mutate" ON public."commerce_subscription_payments" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM commerce_subscription_invoices si
  WHERE ((si.id = commerce_subscription_payments.subscription_invoice_id) AND platform_is_tenant_member(si.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM commerce_subscription_invoices si
  WHERE ((si.id = commerce_subscription_payments.subscription_invoice_id) AND platform_is_tenant_member(si.tenant_id)))));
CREATE POLICY "commerce_sp_select" ON public."commerce_subscription_payments" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM commerce_subscription_invoices si
  WHERE ((si.id = commerce_subscription_payments.subscription_invoice_id) AND platform_is_tenant_member(si.tenant_id)))));
CREATE POLICY "commerce_spi_mutate" ON public."commerce_subscription_plan_items" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM commerce_subscription_plans p
  WHERE ((p.id = commerce_subscription_plan_items.plan_id) AND platform_is_tenant_member(p.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM commerce_subscription_plans p
  WHERE ((p.id = commerce_subscription_plan_items.plan_id) AND platform_is_tenant_member(p.tenant_id)))));
CREATE POLICY "commerce_spi_select" ON public."commerce_subscription_plan_items" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM commerce_subscription_plans p
  WHERE ((p.id = commerce_subscription_plan_items.plan_id) AND platform_is_tenant_member(p.tenant_id)))));
CREATE POLICY "commerce_subscription_plans_delete" ON public."commerce_subscription_plans" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_subscription_plans_insert" ON public."commerce_subscription_plans" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_subscription_plans_select" ON public."commerce_subscription_plans" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_subscription_plans_update" ON public."commerce_subscription_plans" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_subscriptions_delete" ON public."commerce_subscriptions" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_subscriptions_insert" ON public."commerce_subscriptions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_subscriptions_select" ON public."commerce_subscriptions" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_subscriptions_update" ON public."commerce_subscriptions" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_webhook_events_delete" ON public."commerce_webhook_events" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_webhook_events_insert" ON public."commerce_webhook_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_webhook_events_select" ON public."commerce_webhook_events" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "commerce_webhook_events_update" ON public."commerce_webhook_events" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "tenant_isolation" ON public."communications" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "tenant_isolation" ON public."contact_messages" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "crm_activity_delete" ON public."crm_activity" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_activity_insert" ON public."crm_activity" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_activity_select" ON public."crm_activity" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_activity_update" ON public."crm_activity" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_audit_log_delete" ON public."crm_audit_log" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_audit_log_insert" ON public."crm_audit_log" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_audit_log_select" ON public."crm_audit_log" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_audit_log_update" ON public."crm_audit_log" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_automation_enrollments_delete" ON public."crm_automation_enrollments" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_automation_enrollments_insert" ON public."crm_automation_enrollments" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_automation_enrollments_select" ON public."crm_automation_enrollments" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_automation_enrollments_update" ON public."crm_automation_enrollments" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_automation_runs_delete" ON public."crm_automation_runs" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_automation_runs_insert" ON public."crm_automation_runs" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_automation_runs_select" ON public."crm_automation_runs" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_automation_runs_update" ON public."crm_automation_runs" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_automation_workflows_delete" ON public."crm_automation_workflows" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_automation_workflows_insert" ON public."crm_automation_workflows" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_automation_workflows_select" ON public."crm_automation_workflows" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_automation_workflows_update" ON public."crm_automation_workflows" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_campaign_members_tenant_isolation" ON public."crm_campaign_members" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "crm_campaigns_tenant_isolation" ON public."crm_campaigns" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "crm_commission_entries_delete" ON public."crm_commission_entries" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_commission_entries_insert" ON public."crm_commission_entries" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_commission_entries_select" ON public."crm_commission_entries" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_commission_entries_update" ON public."crm_commission_entries" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_commission_plans_delete" ON public."crm_commission_plans" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_commission_plans_insert" ON public."crm_commission_plans" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_commission_plans_select" ON public."crm_commission_plans" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_commission_plans_update" ON public."crm_commission_plans" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_commission_rules_delete" ON public."crm_commission_rules" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_commission_rules_insert" ON public."crm_commission_rules" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_commission_rules_select" ON public."crm_commission_rules" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_commission_rules_update" ON public."crm_commission_rules" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_commission_tiers_delete" ON public."crm_commission_tiers" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_commission_tiers_insert" ON public."crm_commission_tiers" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_commission_tiers_select" ON public."crm_commission_tiers" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_commission_tiers_update" ON public."crm_commission_tiers" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_communication_preferences_delete" ON public."crm_communication_preferences" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_communication_preferences_insert" ON public."crm_communication_preferences" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_communication_preferences_select" ON public."crm_communication_preferences" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_communication_preferences_update" ON public."crm_communication_preferences" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_conversations_tenant_isolation" ON public."crm_conversations" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "crm_customer_behavior_delete" ON public."crm_customer_behavior" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_customer_behavior_insert" ON public."crm_customer_behavior" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_customer_behavior_select" ON public."crm_customer_behavior" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_customer_behavior_update" ON public."crm_customer_behavior" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_customer_contact_methods_delete" ON public."crm_customer_contact_methods" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_customer_contact_methods_insert" ON public."crm_customer_contact_methods" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_customer_contact_methods_select" ON public."crm_customer_contact_methods" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_customer_contact_methods_update" ON public."crm_customer_contact_methods" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_customer_preferences_tenant_isolation" ON public."crm_customer_preferences" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "crm_customer_tag_assignments_tenant_isolation" ON public."crm_customer_tag_assignments" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "crm_customer_tags_tenant_isolation" ON public."crm_customer_tags" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "crm_customers_tenant_isolation" ON public."crm_customers" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "crm_document_types_delete" ON public."crm_document_types" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_document_types_insert" ON public."crm_document_types" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_document_types_select" ON public."crm_document_types" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_document_types_update" ON public."crm_document_types" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_document_versions_delete" ON public."crm_document_versions" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_document_versions_insert" ON public."crm_document_versions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_document_versions_select" ON public."crm_document_versions" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_document_versions_update" ON public."crm_document_versions" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_documents_tenant_isolation" ON public."crm_documents" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "crm_duplicate_candidates_delete" ON public."crm_duplicate_candidates" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_duplicate_candidates_insert" ON public."crm_duplicate_candidates" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_duplicate_candidates_select" ON public."crm_duplicate_candidates" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_duplicate_candidates_update" ON public."crm_duplicate_candidates" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_external_identities_delete" ON public."crm_external_identities" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_external_identities_insert" ON public."crm_external_identities" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_external_identities_select" ON public."crm_external_identities" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_external_identities_update" ON public."crm_external_identities" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_funnel_events_delete" ON public."crm_funnel_events" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_funnel_events_insert" ON public."crm_funnel_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_funnel_events_select" ON public."crm_funnel_events" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_funnel_events_update" ON public."crm_funnel_events" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_holiday_blackouts_delete" ON public."crm_holiday_blackouts" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_holiday_blackouts_insert" ON public."crm_holiday_blackouts" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_holiday_blackouts_select" ON public."crm_holiday_blackouts" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_holiday_blackouts_update" ON public."crm_holiday_blackouts" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_households_delete" ON public."crm_households" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_households_insert" ON public."crm_households" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_households_select" ON public."crm_households" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_households_update" ON public."crm_households" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_idempotency_keys_delete" ON public."crm_idempotency_keys" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_idempotency_keys_insert" ON public."crm_idempotency_keys" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_idempotency_keys_select" ON public."crm_idempotency_keys" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_idempotency_keys_update" ON public."crm_idempotency_keys" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_lead_activities_delete" ON public."crm_lead_activities" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_lead_activities_insert" ON public."crm_lead_activities" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_lead_activities_select" ON public."crm_lead_activities" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_lead_activities_update" ON public."crm_lead_activities" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_lead_sources_delete" ON public."crm_lead_sources" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_lead_sources_insert" ON public."crm_lead_sources" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_lead_sources_select" ON public."crm_lead_sources" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_lead_sources_update" ON public."crm_lead_sources" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_leads_tenant_isolation" ON public."crm_leads" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "crm_locations_delete" ON public."crm_locations" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_locations_insert" ON public."crm_locations" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_locations_select" ON public."crm_locations" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_locations_update" ON public."crm_locations" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_merge_log_delete" ON public."crm_merge_log" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_merge_log_insert" ON public."crm_merge_log" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_merge_log_select" ON public."crm_merge_log" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_merge_log_update" ON public."crm_merge_log" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_message_templates_delete" ON public."crm_message_templates" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_message_templates_insert" ON public."crm_message_templates" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_message_templates_select" ON public."crm_message_templates" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_message_templates_update" ON public."crm_message_templates" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_messages_tenant_isolation" ON public."crm_messages" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "crm_needs_attention_delete" ON public."crm_needs_attention" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_needs_attention_insert" ON public."crm_needs_attention" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_needs_attention_select" ON public."crm_needs_attention" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_needs_attention_update" ON public."crm_needs_attention" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_notes_tenant_isolation" ON public."crm_notes" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "crm_operating_hours_delete" ON public."crm_operating_hours" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_operating_hours_insert" ON public."crm_operating_hours" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_operating_hours_select" ON public."crm_operating_hours" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_operating_hours_update" ON public."crm_operating_hours" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_permanent_alerts_delete" ON public."crm_permanent_alerts" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_permanent_alerts_insert" ON public."crm_permanent_alerts" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_permanent_alerts_select" ON public."crm_permanent_alerts" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_permanent_alerts_update" ON public."crm_permanent_alerts" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_pricing_rules_delete" ON public."crm_pricing_rules" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_pricing_rules_insert" ON public."crm_pricing_rules" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_pricing_rules_select" ON public."crm_pricing_rules" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_pricing_rules_update" ON public."crm_pricing_rules" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_product_recommendations_delete" ON public."crm_product_recommendations" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_product_recommendations_insert" ON public."crm_product_recommendations" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_product_recommendations_select" ON public."crm_product_recommendations" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_product_recommendations_update" ON public."crm_product_recommendations" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_search_index_delete" ON public."crm_search_index" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_search_index_insert" ON public."crm_search_index" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_search_index_select" ON public."crm_search_index" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_search_index_update" ON public."crm_search_index" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_segment_memberships_tenant_isolation" ON public."crm_segment_memberships" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "crm_segments_tenant_isolation" ON public."crm_segments" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "crm_service_location_availability_delete" ON public."crm_service_location_availability" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_service_location_availability_insert" ON public."crm_service_location_availability" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_service_location_availability_select" ON public."crm_service_location_availability" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_service_location_availability_update" ON public."crm_service_location_availability" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_service_package_items_delete" ON public."crm_service_package_items" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_service_package_items_insert" ON public."crm_service_package_items" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_service_package_items_select" ON public."crm_service_package_items" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_service_package_items_update" ON public."crm_service_package_items" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_service_packages_delete" ON public."crm_service_packages" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_service_packages_insert" ON public."crm_service_packages" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_service_packages_select" ON public."crm_service_packages" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_service_packages_update" ON public."crm_service_packages" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_services_delete" ON public."crm_services" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_services_insert" ON public."crm_services" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_services_select" ON public."crm_services" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_services_update" ON public."crm_services" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_settings_delete" ON public."crm_settings" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_settings_insert" ON public."crm_settings" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_settings_select" ON public."crm_settings" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_settings_update" ON public."crm_settings" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_shift_templates_delete" ON public."crm_shift_templates" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_shift_templates_insert" ON public."crm_shift_templates" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_shift_templates_select" ON public."crm_shift_templates" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_shift_templates_update" ON public."crm_shift_templates" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_delete" ON public."crm_staff" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_insert" ON public."crm_staff" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_select" ON public."crm_staff" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_update" ON public."crm_staff" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_availability_delete" ON public."crm_staff_availability" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_availability_insert" ON public."crm_staff_availability" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_availability_select" ON public."crm_staff_availability" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_availability_update" ON public."crm_staff_availability" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_commission_assignments_delete" ON public."crm_staff_commission_assignments" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_commission_assignments_insert" ON public."crm_staff_commission_assignments" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_commission_assignments_select" ON public."crm_staff_commission_assignments" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_commission_assignments_update" ON public."crm_staff_commission_assignments" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_documents_delete" ON public."crm_staff_documents" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_documents_insert" ON public."crm_staff_documents" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_documents_select" ON public."crm_staff_documents" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_documents_update" ON public."crm_staff_documents" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_incident_reports_delete" ON public."crm_staff_incident_reports" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_incident_reports_insert" ON public."crm_staff_incident_reports" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_incident_reports_select" ON public."crm_staff_incident_reports" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_incident_reports_update" ON public."crm_staff_incident_reports" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_performance_notes_delete" ON public."crm_staff_performance_notes" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_performance_notes_insert" ON public."crm_staff_performance_notes" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_performance_notes_select" ON public."crm_staff_performance_notes" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_performance_notes_update" ON public."crm_staff_performance_notes" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_shifts_delete" ON public."crm_staff_shifts" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_shifts_insert" ON public."crm_staff_shifts" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_shifts_select" ON public."crm_staff_shifts" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_shifts_update" ON public."crm_staff_shifts" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_time_clock_entries_delete" ON public."crm_staff_time_clock_entries" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_time_clock_entries_insert" ON public."crm_staff_time_clock_entries" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_time_clock_entries_select" ON public."crm_staff_time_clock_entries" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_time_clock_entries_update" ON public."crm_staff_time_clock_entries" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_training_records_delete" ON public."crm_staff_training_records" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_training_records_insert" ON public."crm_staff_training_records" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_training_records_select" ON public."crm_staff_training_records" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_staff_training_records_update" ON public."crm_staff_training_records" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_surcharges_delete" ON public."crm_surcharges" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_surcharges_insert" ON public."crm_surcharges" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_surcharges_select" ON public."crm_surcharges" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_surcharges_update" ON public."crm_surcharges" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_tags_tenant_isolation" ON public."crm_tags" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "crm_tasks_tenant_isolation" ON public."crm_tasks" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "crm_time_off_requests_delete" ON public."crm_time_off_requests" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_time_off_requests_insert" ON public."crm_time_off_requests" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_time_off_requests_select" ON public."crm_time_off_requests" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_time_off_requests_update" ON public."crm_time_off_requests" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_waitlist_delete" ON public."crm_waitlist" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_waitlist_insert" ON public."crm_waitlist" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_waitlist_select" ON public."crm_waitlist" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "crm_waitlist_update" ON public."crm_waitlist" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "currencies_admin_all" ON public."currencies" AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM tenant_memberships tm
  WHERE ((tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'superadmin'::text, 'platform_admin'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM tenant_memberships tm
  WHERE ((tm.user_id = auth.uid()) AND (tm.role = ANY (ARRAY['owner'::text, 'admin'::text, 'superadmin'::text, 'platform_admin'::text]))))));
CREATE POLICY "currencies_read_all" ON public."currencies" AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users manage own addresses" ON public."customer_addresses" AS PERMISSIVE FOR ALL TO public USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "customer_ai_disclosure_acks_delete" ON public."customer_ai_disclosure_acks" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "customer_ai_disclosure_acks_insert" ON public."customer_ai_disclosure_acks" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "customer_ai_disclosure_acks_select" ON public."customer_ai_disclosure_acks" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "customer_ai_disclosure_acks_update" ON public."customer_ai_disclosure_acks" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "customers read own notifications" ON public."customer_notifications" AS PERMISSIVE FOR SELECT TO public USING (("customerId" IN ( SELECT c.id
   FROM customers c
  WHERE ((lower(c.email) = lower((auth.jwt() ->> 'email'::text))) OR (c."userId" = (auth.jwt() ->> 'sub'::text))))));
CREATE POLICY "tenant_isolation" ON public."customer_statements" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "tenant_customers_policy" ON public."customers" AS PERMISSIVE FOR ALL TO public USING (((tenant_id IS NULL) OR (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid) OR is_tenant_member(tenant_id))) WITH CHECK (((tenant_id IS NULL) OR (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid) OR is_tenant_member(tenant_id)));
CREATE POLICY "dmca_counter_notices_tenant_isolation" ON public."dmca_counter_notices" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "dmca_designated_agent_delete" ON public."dmca_designated_agent" AS PERMISSIVE FOR DELETE TO public USING ((platform_is_tenant_member(tenant_id) AND platform_has_permission(tenant_id, 'support.dmca'::text)));
CREATE POLICY "dmca_designated_agent_insert" ON public."dmca_designated_agent" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((platform_is_tenant_member(tenant_id) AND platform_has_permission(tenant_id, 'support.dmca'::text)));
CREATE POLICY "dmca_designated_agent_select" ON public."dmca_designated_agent" AS PERMISSIVE FOR SELECT TO public USING ((platform_is_tenant_member(tenant_id) AND platform_has_permission(tenant_id, 'support.dmca'::text)));
CREATE POLICY "dmca_designated_agent_update" ON public."dmca_designated_agent" AS PERMISSIVE FOR UPDATE TO public USING ((platform_is_tenant_member(tenant_id) AND platform_has_permission(tenant_id, 'support.dmca'::text))) WITH CHECK ((platform_is_tenant_member(tenant_id) AND platform_has_permission(tenant_id, 'support.dmca'::text)));
CREATE POLICY "dmca_details_tenant_isolation" ON public."dmca_details" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "dmca_strikes_tenant_isolation" ON public."dmca_strikes" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "dmca_takedown_log_tenant_isolation" ON public."dmca_takedown_log" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "ecommerce_orders_tenant_isolation" ON public."ecommerce_orders" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "tenant_isolation" ON public."email_messages" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "employee_notifications_delete" ON public."employee_notifications" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "employee_notifications_insert" ON public."employee_notifications" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "employee_notifications_select" ON public."employee_notifications" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "employee_notifications_update" ON public."employee_notifications" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_audit_log_delete" ON public."erp_audit_log" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_audit_log_insert" ON public."erp_audit_log" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_audit_log_select" ON public."erp_audit_log" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_audit_log_update" ON public."erp_audit_log" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_carriers_delete" ON public."erp_carriers" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_carriers_insert" ON public."erp_carriers" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_carriers_select" ON public."erp_carriers" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_carriers_update" ON public."erp_carriers" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_document_sequences_delete" ON public."erp_document_sequences" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_document_sequences_insert" ON public."erp_document_sequences" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_document_sequences_select" ON public."erp_document_sequences" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_document_sequences_update" ON public."erp_document_sequences" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_fulfillment_lines_tenant_isolation" ON public."erp_fulfillment_lines" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "erp_fulfillment_orders_tenant_isolation" ON public."erp_fulfillment_orders" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "erp_goods_receipt_lines_delete" ON public."erp_goods_receipt_lines" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_goods_receipt_lines_insert" ON public."erp_goods_receipt_lines" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_goods_receipt_lines_select" ON public."erp_goods_receipt_lines" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_goods_receipt_lines_update" ON public."erp_goods_receipt_lines" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_goods_receipts_delete" ON public."erp_goods_receipts" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_goods_receipts_insert" ON public."erp_goods_receipts" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_goods_receipts_select" ON public."erp_goods_receipts" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_goods_receipts_update" ON public."erp_goods_receipts" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_idempotency_keys_delete" ON public."erp_idempotency_keys" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_idempotency_keys_insert" ON public."erp_idempotency_keys" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_idempotency_keys_select" ON public."erp_idempotency_keys" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_idempotency_keys_update" ON public."erp_idempotency_keys" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_balances_tenant_isolation" ON public."erp_inventory_balances" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "erp_inventory_cost_layers_delete" ON public."erp_inventory_cost_layers" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_cost_layers_insert" ON public."erp_inventory_cost_layers" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_cost_layers_select" ON public."erp_inventory_cost_layers" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_cost_layers_update" ON public."erp_inventory_cost_layers" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_count_lines_delete" ON public."erp_inventory_count_lines" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_count_lines_insert" ON public."erp_inventory_count_lines" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_count_lines_select" ON public."erp_inventory_count_lines" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_count_lines_update" ON public."erp_inventory_count_lines" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_count_sessions_delete" ON public."erp_inventory_count_sessions" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_count_sessions_insert" ON public."erp_inventory_count_sessions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_count_sessions_select" ON public."erp_inventory_count_sessions" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_count_sessions_update" ON public."erp_inventory_count_sessions" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_lots_tenant_isolation" ON public."erp_inventory_lots" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "erp_inventory_movements_tenant_isolation" ON public."erp_inventory_movements" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "erp_inventory_reservations_delete" ON public."erp_inventory_reservations" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_reservations_insert" ON public."erp_inventory_reservations" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_reservations_select" ON public."erp_inventory_reservations" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_reservations_update" ON public."erp_inventory_reservations" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_serial_numbers_delete" ON public."erp_inventory_serial_numbers" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_serial_numbers_insert" ON public."erp_inventory_serial_numbers" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_serial_numbers_select" ON public."erp_inventory_serial_numbers" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_serial_numbers_update" ON public."erp_inventory_serial_numbers" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_transactions_tenant_isolation" ON public."erp_inventory_transactions" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "erp_inventory_transfer_lines_delete" ON public."erp_inventory_transfer_lines" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_transfer_lines_insert" ON public."erp_inventory_transfer_lines" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_transfer_lines_select" ON public."erp_inventory_transfer_lines" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_transfer_lines_update" ON public."erp_inventory_transfer_lines" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_transfers_delete" ON public."erp_inventory_transfers" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_transfers_insert" ON public."erp_inventory_transfers" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_transfers_select" ON public."erp_inventory_transfers" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_inventory_transfers_update" ON public."erp_inventory_transfers" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_order_addresses_tenant_isolation" ON public."erp_order_addresses" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "erp_order_lines_tenant_isolation" ON public."erp_order_lines" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "erp_order_notes_tenant_isolation" ON public."erp_order_notes" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "erp_order_status_history_tenant_isolation" ON public."erp_order_status_history" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "erp_orders_tenant_isolation" ON public."erp_orders" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "erp_package_items_delete" ON public."erp_package_items" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_package_items_insert" ON public."erp_package_items" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_package_items_select" ON public."erp_package_items" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_package_items_update" ON public."erp_package_items" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_packages_delete" ON public."erp_packages" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_packages_insert" ON public."erp_packages" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_packages_select" ON public."erp_packages" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_packages_update" ON public."erp_packages" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_pick_task_lines_delete" ON public."erp_pick_task_lines" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_pick_task_lines_insert" ON public."erp_pick_task_lines" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_pick_task_lines_select" ON public."erp_pick_task_lines" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_pick_task_lines_update" ON public."erp_pick_task_lines" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_pick_tasks_delete" ON public."erp_pick_tasks" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_pick_tasks_insert" ON public."erp_pick_tasks" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_pick_tasks_select" ON public."erp_pick_tasks" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_pick_tasks_update" ON public."erp_pick_tasks" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_pick_waves_delete" ON public."erp_pick_waves" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_pick_waves_insert" ON public."erp_pick_waves" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_pick_waves_select" ON public."erp_pick_waves" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_pick_waves_update" ON public."erp_pick_waves" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_product_barcodes_delete" ON public."erp_product_barcodes" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_product_barcodes_insert" ON public."erp_product_barcodes" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_product_barcodes_select" ON public."erp_product_barcodes" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_product_barcodes_update" ON public."erp_product_barcodes" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_product_categories_delete" ON public."erp_product_categories" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_product_categories_insert" ON public."erp_product_categories" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_product_categories_select" ON public."erp_product_categories" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_product_categories_update" ON public."erp_product_categories" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_product_skus_delete" ON public."erp_product_skus" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_product_skus_insert" ON public."erp_product_skus" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_product_skus_select" ON public."erp_product_skus" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_product_skus_update" ON public."erp_product_skus" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_product_variants_delete" ON public."erp_product_variants" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_product_variants_insert" ON public."erp_product_variants" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_product_variants_select" ON public."erp_product_variants" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_product_variants_update" ON public."erp_product_variants" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_products_delete" ON public."erp_products" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_products_insert" ON public."erp_products" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_products_select" ON public."erp_products" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_products_update" ON public."erp_products" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_replenishment_recommendations_delete" ON public."erp_replenishment_recommendations" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_replenishment_recommendations_insert" ON public."erp_replenishment_recommendations" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_replenishment_recommendations_select" ON public."erp_replenishment_recommendations" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_replenishment_recommendations_update" ON public."erp_replenishment_recommendations" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_replenishment_rules_tenant_isolation" ON public."erp_replenishment_rules" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "erp_return_authorizations_tenant_isolation" ON public."erp_return_authorizations" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "erp_return_inspections_delete" ON public."erp_return_inspections" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_return_inspections_insert" ON public."erp_return_inspections" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_return_inspections_select" ON public."erp_return_inspections" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_return_inspections_update" ON public."erp_return_inspections" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_return_lines_tenant_isolation" ON public."erp_return_lines" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "erp_return_refunds_delete" ON public."erp_return_refunds" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_return_refunds_insert" ON public."erp_return_refunds" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_return_refunds_select" ON public."erp_return_refunds" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_return_refunds_update" ON public."erp_return_refunds" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_shipment_packages_tenant_isolation" ON public."erp_shipment_packages" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "erp_shipments_tenant_isolation" ON public."erp_shipments" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "erp_shipping_methods_delete" ON public."erp_shipping_methods" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_shipping_methods_insert" ON public."erp_shipping_methods" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_shipping_methods_select" ON public."erp_shipping_methods" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_shipping_methods_update" ON public."erp_shipping_methods" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_stock_levels_tenant_isolation" ON public."erp_stock_levels" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "erp_tracking_events_delete" ON public."erp_tracking_events" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_tracking_events_insert" ON public."erp_tracking_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_tracking_events_select" ON public."erp_tracking_events" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_tracking_events_update" ON public."erp_tracking_events" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_uom_conversions_delete" ON public."erp_uom_conversions" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_uom_conversions_insert" ON public."erp_uom_conversions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_uom_conversions_select" ON public."erp_uom_conversions" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_uom_conversions_update" ON public."erp_uom_conversions" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_vendor_items_delete" ON public."erp_vendor_items" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_vendor_items_insert" ON public."erp_vendor_items" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_vendor_items_select" ON public."erp_vendor_items" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_vendor_items_update" ON public."erp_vendor_items" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_vendors_delete" ON public."erp_vendors" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_vendors_insert" ON public."erp_vendors" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_vendors_select" ON public."erp_vendors" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_vendors_update" ON public."erp_vendors" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "erp_warehouse_locations_tenant_isolation" ON public."erp_warehouse_locations" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "erp_warehouse_zones_tenant_isolation" ON public."erp_warehouse_zones" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "erp_warehouses_tenant_isolation" ON public."erp_warehouses" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "tenant_isolation" ON public."estimate_items" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM estimates e
  WHERE ((e.id = estimate_items.estimate_id) AND (e.tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM estimates e
  WHERE ((e.id = estimate_items.estimate_id) AND (e.tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))))));
CREATE POLICY "tenant_isolation" ON public."estimates" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "tenant_isolation" ON public."faqs" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "feedback_submissions_delete" ON public."feedback_submissions" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "feedback_submissions_insert" ON public."feedback_submissions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "feedback_submissions_select" ON public."feedback_submissions" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "feedback_submissions_update" ON public."feedback_submissions" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "tenant_isolation" ON public."gallery_photos" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "service_role_all" ON public."integration_secrets" AS PERMISSIVE FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "inventory_items_tenant_isolation" ON public."inventory_items" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "inventory_levels_tenant_isolation" ON public."inventory_levels" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "inventory_transactions_tenant_isolation" ON public."inventory_transactions" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "tenant_isolation" ON public."invoice_items" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "invoices_delete" ON public."invoices" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "invoices_insert" ON public."invoices" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "invoices_select" ON public."invoices" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "invoices_update" ON public."invoices" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "tenant_isolation" ON public."journal_entries" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "tenant_isolation" ON public."journal_lines" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "locations_delete" ON public."locations" AS PERMISSIVE FOR DELETE TO public USING (is_tenant_member(tenant_id));
CREATE POLICY "locations_insert" ON public."locations" AS PERMISSIVE FOR INSERT TO public WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY "locations_select" ON public."locations" AS PERMISSIVE FOR SELECT TO public USING (is_tenant_member(tenant_id));
CREATE POLICY "locations_update" ON public."locations" AS PERMISSIVE FOR UPDATE TO public USING (is_tenant_member(tenant_id)) WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY "message_flags_delete" ON public."message_flags" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "message_flags_insert" ON public."message_flags" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "message_flags_select" ON public."message_flags" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "message_flags_update" ON public."message_flags" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "tenant_isolation" ON public."newsletter" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "svc_ins" ON public."newsletter_subscribers" AS PERMISSIVE FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "oauth_states_admin_only" ON public."oauth_states" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM platform_admins
  WHERE ((platform_admins.user_id = auth.uid()) AND ((platform_admins.expires_at IS NULL) OR (platform_admins.expires_at > now()))))));
CREATE POLICY "order_shipping_estimates_tenant" ON public."order_shipping_estimates" AS PERMISSIVE FOR ALL TO public USING (((tenant_id IS NULL) OR (tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid)));
CREATE POLICY "payment_transactions_delete" ON public."payment_transactions" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "payment_transactions_insert" ON public."payment_transactions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "payment_transactions_select" ON public."payment_transactions" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "payment_transactions_update" ON public."payment_transactions" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "tenant_isolation" ON public."payroll_employees" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "tenant_isolation" ON public."payroll_run_items" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM payroll_runs pr
  WHERE ((pr.id = payroll_run_items.payroll_run_id) AND (pr.tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM payroll_runs pr
  WHERE ((pr.id = payroll_run_items.payroll_run_id) AND (pr.tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))))));
CREATE POLICY "tenant_isolation" ON public."payroll_runs" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "tenant_isolation" ON public."payroll_tax_forms" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "tenant_isolation" ON public."payroll_timesheets" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "platform_admin_access_log_delete" ON public."platform_admin_access_log" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "platform_admin_access_log_insert" ON public."platform_admin_access_log" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "platform_admin_access_log_select" ON public."platform_admin_access_log" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "platform_admin_access_log_update" ON public."platform_admin_access_log" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "platform_admins_tenant_isolation" ON public."platform_admins" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "platform_backups_delete" ON public."platform_backups" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "platform_backups_insert" ON public."platform_backups" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "platform_backups_select" ON public."platform_backups" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "platform_backups_update" ON public."platform_backups" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "platform_customer_identity_links_delete" ON public."platform_customer_identity_links" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "platform_customer_identity_links_insert" ON public."platform_customer_identity_links" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "platform_customer_identity_links_select" ON public."platform_customer_identity_links" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "platform_customer_identity_links_update" ON public."platform_customer_identity_links" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "global_read" ON public."platform_db_contract_metadata" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "global_write" ON public."platform_db_contract_metadata" AS PERMISSIVE FOR ALL TO public USING (platform_is_admin()) WITH CHECK (platform_is_admin());
CREATE POLICY "global_read" ON public."platform_feature_tree_coverage" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "global_write" ON public."platform_feature_tree_coverage" AS PERMISSIVE FOR ALL TO public USING (platform_is_admin()) WITH CHECK (platform_is_admin());
CREATE POLICY "global_read" ON public."platform_integration_health_registry" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "global_write" ON public."platform_integration_health_registry" AS PERMISSIVE FOR ALL TO public USING (platform_is_admin()) WITH CHECK (platform_is_admin());
CREATE POLICY "platform_module_permissions_tenant_isolation" ON public."platform_module_permissions" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "platform_permission_registry_tenant_isolation" ON public."platform_permission_registry" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "global_read" ON public."platform_quick_action_registry" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "global_write" ON public."platform_quick_action_registry" AS PERMISSIVE FOR ALL TO public USING (platform_is_admin()) WITH CHECK (platform_is_admin());
CREATE POLICY "platform_quick_links_delete" ON public."platform_quick_links" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "platform_quick_links_insert" ON public."platform_quick_links" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "platform_quick_links_select" ON public."platform_quick_links" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "platform_quick_links_update" ON public."platform_quick_links" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "global_read" ON public."platform_reserved_slugs" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "global_write" ON public."platform_reserved_slugs" AS PERMISSIVE FOR ALL TO public USING (platform_is_admin()) WITH CHECK (platform_is_admin());
CREATE POLICY "platform_role_values_tenant_isolation" ON public."platform_role_values" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "platform_vendor_identity_links_delete" ON public."platform_vendor_identity_links" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "platform_vendor_identity_links_insert" ON public."platform_vendor_identity_links" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "platform_vendor_identity_links_select" ON public."platform_vendor_identity_links" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "platform_vendor_identity_links_update" ON public."platform_vendor_identity_links" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "global_read" ON public."platform_workflow_transition_validation" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "global_write" ON public."platform_workflow_transition_validation" AS PERMISSIVE FOR ALL TO public USING (platform_is_admin()) WITH CHECK (platform_is_admin());
CREATE POLICY "tenant_isolation" ON public."policies" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "portal_customer_accounts_delete" ON public."portal_customer_accounts" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "portal_customer_accounts_insert" ON public."portal_customer_accounts" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "portal_customer_accounts_select" ON public."portal_customer_accounts" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "portal_customer_accounts_update" ON public."portal_customer_accounts" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "portal_magic_links_delete" ON public."portal_magic_links" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "portal_magic_links_insert" ON public."portal_magic_links" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "portal_magic_links_select" ON public."portal_magic_links" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "portal_magic_links_update" ON public."portal_magic_links" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "portal_module_permissions_tenant_isolation" ON public."portal_module_permissions" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "portal_permission_audit_log_tenant_isolation" ON public."portal_permission_audit_log" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "portal_user_preferences_self_delete" ON public."portal_user_preferences" AS PERMISSIVE FOR DELETE TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "portal_user_preferences_self_insert" ON public."portal_user_preferences" AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "portal_user_preferences_self_select" ON public."portal_user_preferences" AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "portal_user_preferences_self_update" ON public."portal_user_preferences" AS PERMISSIVE FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "portal_users_tenant_isolation" ON public."portal_users" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "tenant_isolation" ON public."pricing_packages" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "privacy_request_details_delete" ON public."privacy_request_details" AS PERMISSIVE FOR DELETE TO public USING ((platform_is_tenant_member(tenant_id) AND platform_has_permission(tenant_id, 'support.privacy'::text)));
CREATE POLICY "privacy_request_details_insert" ON public."privacy_request_details" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((platform_is_tenant_member(tenant_id) AND platform_has_permission(tenant_id, 'support.privacy'::text)));
CREATE POLICY "privacy_request_details_select" ON public."privacy_request_details" AS PERMISSIVE FOR SELECT TO public USING ((platform_is_tenant_member(tenant_id) OR support_grant_access(ticket_id, 'view'::text) OR platform_has_permission(tenant_id, 'support.privacy'::text)));
CREATE POLICY "privacy_request_details_update" ON public."privacy_request_details" AS PERMISSIVE FOR UPDATE TO public USING ((platform_is_tenant_member(tenant_id) AND platform_has_permission(tenant_id, 'support.privacy'::text))) WITH CHECK ((platform_is_tenant_member(tenant_id) AND platform_has_permission(tenant_id, 'support.privacy'::text)));
CREATE POLICY "Public can view variants of published products" ON public."product_variants" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM products p
  WHERE ((p.id = product_variants.product_id) AND (p.status = 'published'::text)))));
CREATE POLICY "Public can view published products" ON public."products" AS PERMISSIVE FOR SELECT TO public USING ((status = 'published'::text));
CREATE POLICY "Tenant members can manage their products" ON public."products" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_tenant_id()));
CREATE POLICY "tenant_isolation" ON public."purchase_order_items" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM purchase_orders p
  WHERE ((p.id = purchase_order_items.purchase_order_id) AND (p.tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM purchase_orders p
  WHERE ((p.id = purchase_order_items.purchase_order_id) AND (p.tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))))));
CREATE POLICY "tenant_isolation" ON public."purchase_orders" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "quarantine_tenant_isolation" ON public."quarantine" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "tenant_isolation" ON public."receipt_items" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM receipts r
  WHERE ((r.id = receipt_items.receipt_id) AND (r.tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM receipts r
  WHERE ((r.id = receipt_items.receipt_id) AND (r.tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))))));
CREATE POLICY "tenant_isolation" ON public."receipts" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "tenant_isolation" ON public."reconciliations" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "tenant_isolation" ON public."recurring_invoice_items" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM recurring_invoices r
  WHERE ((r.id = recurring_invoice_items.recurring_id) AND (r.tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM recurring_invoices r
  WHERE ((r.id = recurring_invoice_items.recurring_id) AND (r.tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))))));
CREATE POLICY "tenant_isolation" ON public."recurring_invoices" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "return_policy_rules_delete" ON public."return_policy_rules" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "return_policy_rules_insert" ON public."return_policy_rules" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "return_policy_rules_select" ON public."return_policy_rules" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "return_policy_rules_update" ON public."return_policy_rules" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "tenant_isolation" ON public."sales_order_items" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM sales_orders s
  WHERE ((s.id = sales_order_items.sales_order_id) AND (s.tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM sales_orders s
  WHERE ((s.id = sales_order_items.sales_order_id) AND (s.tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))))));
CREATE POLICY "tenant_isolation" ON public."sales_orders" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "search_events_delete" ON public."search_events" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "search_events_insert" ON public."search_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "search_events_select" ON public."search_events" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "search_events_update" ON public."search_events" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "seller_1099k_generations_delete" ON public."seller_1099k_generations" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "seller_1099k_generations_insert" ON public."seller_1099k_generations" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "seller_1099k_generations_select" ON public."seller_1099k_generations" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "seller_1099k_generations_update" ON public."seller_1099k_generations" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "seller_appeals_tenant_isolation" ON public."seller_appeals" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "seller_investigations_tenant_isolation" ON public."seller_investigations" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "seller_notification_preferences_delete" ON public."seller_notification_preferences" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "seller_notification_preferences_insert" ON public."seller_notification_preferences" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "seller_notification_preferences_select" ON public."seller_notification_preferences" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "seller_notification_preferences_update" ON public."seller_notification_preferences" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "seller_tax_exemptions_delete" ON public."seller_tax_exemptions" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "seller_tax_exemptions_insert" ON public."seller_tax_exemptions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "seller_tax_exemptions_select" ON public."seller_tax_exemptions" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "seller_tax_exemptions_update" ON public."seller_tax_exemptions" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "seller_tax_remittance_delete" ON public."seller_tax_remittance_filings" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "seller_tax_remittance_insert" ON public."seller_tax_remittance_filings" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "seller_tax_remittance_select" ON public."seller_tax_remittance_filings" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "seller_tax_remittance_update" ON public."seller_tax_remittance_filings" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "seller_violations_tenant_isolation" ON public."seller_violations" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "tenant_isolation" ON public."service_items" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "tenant_isolation" ON public."service_pricing" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "services_delete" ON public."services" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "services_insert" ON public."services" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "services_select" ON public."services" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "services_update" ON public."services" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "shipping_profiles_tenant" ON public."shipping_profiles" AS PERMISSIVE FOR ALL TO public USING (((tenant_id IS NULL) OR (tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid)));
CREATE POLICY "Tenant members can manage their social posts" ON public."social_posts" AS PERMISSIVE FOR ALL TO public USING ((tenant_id = current_tenant_id()));
CREATE POLICY "staff_delete" ON public."staff" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "staff_insert" ON public."staff" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "staff_select" ON public."staff" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "staff_update" ON public."staff" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "supplier_fulfillment_locations_tenant" ON public."supplier_fulfillment_locations" AS PERMISSIVE FOR ALL TO public USING (true);
CREATE POLICY "support_actions_tenant_isolation" ON public."support_actions" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "support_attachments_tenant_isolation" ON public."support_attachments" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "support_canned_replies_tenant_isolation" ON public."support_canned_replies" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "support_case_details_delete" ON public."support_case_details" AS PERMISSIVE FOR DELETE TO public USING ((platform_is_tenant_member(tenant_id) AND platform_has_permission(tenant_id, 'support.privacy'::text)));
CREATE POLICY "support_case_details_insert" ON public."support_case_details" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((platform_is_tenant_member(tenant_id) AND platform_has_permission(tenant_id, 'support.privacy'::text)));
CREATE POLICY "support_case_details_select" ON public."support_case_details" AS PERMISSIVE FOR SELECT TO public USING ((platform_has_permission(tenant_id, 'support.privacy'::text) OR support_grant_access(ticket_id, 'view'::text)));
CREATE POLICY "support_case_details_update" ON public."support_case_details" AS PERMISSIVE FOR UPDATE TO public USING ((platform_is_tenant_member(tenant_id) AND platform_has_permission(tenant_id, 'support.privacy'::text))) WITH CHECK ((platform_is_tenant_member(tenant_id) AND platform_has_permission(tenant_id, 'support.privacy'::text)));
CREATE POLICY "support_categories_tenant_isolation" ON public."support_categories" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "support_channel_threads_tenant_isolation" ON public."support_channel_threads" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "support_channels_tenant_isolation" ON public."support_channels" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "support_contact_notes_delete" ON public."support_contact_notes" AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM support_contacts c
  WHERE ((c.id = support_contact_notes.contact_id) AND platform_is_tenant_member(c.tenant_id)))));
CREATE POLICY "support_contact_notes_insert" ON public."support_contact_notes" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM support_contacts c
  WHERE ((c.id = support_contact_notes.contact_id) AND platform_is_tenant_member(c.tenant_id)))));
CREATE POLICY "support_contact_notes_select" ON public."support_contact_notes" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM support_contacts c
  WHERE ((c.id = support_contact_notes.contact_id) AND platform_is_tenant_member(c.tenant_id)))));
CREATE POLICY "support_contact_notes_update" ON public."support_contact_notes" AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM support_contacts c
  WHERE ((c.id = support_contact_notes.contact_id) AND platform_is_tenant_member(c.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM support_contacts c
  WHERE ((c.id = support_contact_notes.contact_id) AND platform_is_tenant_member(c.tenant_id)))));
CREATE POLICY "support_contact_orgs_delete" ON public."support_contact_orgs" AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM support_contacts c
  WHERE ((c.id = support_contact_orgs.contact_id) AND platform_is_tenant_member(c.tenant_id)))));
CREATE POLICY "support_contact_orgs_insert" ON public."support_contact_orgs" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM support_contacts c
  WHERE ((c.id = support_contact_orgs.contact_id) AND platform_is_tenant_member(c.tenant_id)))));
CREATE POLICY "support_contact_orgs_select" ON public."support_contact_orgs" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM support_contacts c
  WHERE ((c.id = support_contact_orgs.contact_id) AND platform_is_tenant_member(c.tenant_id)))));
CREATE POLICY "support_contact_orgs_update" ON public."support_contact_orgs" AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM support_contacts c
  WHERE ((c.id = support_contact_orgs.contact_id) AND platform_is_tenant_member(c.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM support_contacts c
  WHERE ((c.id = support_contact_orgs.contact_id) AND platform_is_tenant_member(c.tenant_id)))));
CREATE POLICY "support_contacts_tenant_isolation" ON public."support_contacts" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "support_escalation_rules_tenant_isolation" ON public."support_escalation_rules" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "support_jobs_delete" ON public."support_jobs" AS PERMISSIVE FOR DELETE TO public USING ((platform_is_tenant_member(tenant_id) OR ((tenant_id IS NULL) AND platform_is_admin())));
CREATE POLICY "support_jobs_insert" ON public."support_jobs" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((platform_is_tenant_member(tenant_id) OR ((tenant_id IS NULL) AND platform_is_admin())));
CREATE POLICY "support_jobs_select" ON public."support_jobs" AS PERMISSIVE FOR SELECT TO public USING ((platform_is_tenant_member(tenant_id) OR ((tenant_id IS NULL) AND platform_is_admin())));
CREATE POLICY "support_jobs_update" ON public."support_jobs" AS PERMISSIVE FOR UPDATE TO public USING ((platform_is_tenant_member(tenant_id) OR ((tenant_id IS NULL) AND platform_is_admin()))) WITH CHECK ((platform_is_tenant_member(tenant_id) OR ((tenant_id IS NULL) AND platform_is_admin())));
CREATE POLICY "support_macros_tenant_isolation" ON public."support_macros" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "support_notifications_select" ON public."support_notifications" AS PERMISSIVE FOR SELECT TO public USING (((support_grant_access(ticket_id, 'view'::text) OR platform_is_tenant_member(tenant_id)) AND ((ticket_id IS NULL) OR support_ticket_visibility_ok(ticket_id))));
CREATE POLICY "support_organizations_tenant_isolation" ON public."support_organizations" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "support_permissions_delete" ON public."support_permissions" AS PERMISSIVE FOR DELETE TO public USING (platform_is_admin());
CREATE POLICY "support_permissions_insert" ON public."support_permissions" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_admin());
CREATE POLICY "support_permissions_select" ON public."support_permissions" AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "support_permissions_update" ON public."support_permissions" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_admin()) WITH CHECK (platform_is_admin());
CREATE POLICY "support_queues_tenant_isolation" ON public."support_queues" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "support_report_daily_delete" ON public."support_report_daily" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "support_report_daily_insert" ON public."support_report_daily" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "support_report_daily_select" ON public."support_report_daily" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "support_report_daily_update" ON public."support_report_daily" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "side_messages_delete" ON public."support_side_conversation_messages" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "side_messages_insert" ON public."support_side_conversation_messages" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "side_messages_select" ON public."support_side_conversation_messages" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "side_messages_update" ON public."support_side_conversation_messages" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "side_participants_delete" ON public."support_side_conversation_participants" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "side_participants_insert" ON public."support_side_conversation_participants" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "side_participants_select" ON public."support_side_conversation_participants" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "side_participants_update" ON public."support_side_conversation_participants" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "support_side_conversations_tenant_isolation" ON public."support_side_conversations" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "support_sla_policies_tenant_isolation" ON public."support_sla_policies" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "support_team_members_tenant_isolation" ON public."support_team_members" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "support_teams_tenant_isolation" ON public."support_teams" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "support_ticket_access_grants_delete" ON public."support_ticket_access_grants" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(support_ticket_tenant_id(ticket_id)));
CREATE POLICY "support_ticket_access_grants_insert" ON public."support_ticket_access_grants" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(support_ticket_tenant_id(ticket_id)));
CREATE POLICY "support_ticket_access_grants_select" ON public."support_ticket_access_grants" AS PERMISSIVE FOR SELECT TO public USING ((platform_is_tenant_member(grantee_tenant_id) OR platform_is_tenant_member(support_ticket_tenant_id(ticket_id))));
CREATE POLICY "support_ticket_access_grants_update" ON public."support_ticket_access_grants" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(support_ticket_tenant_id(ticket_id))) WITH CHECK (platform_is_tenant_member(support_ticket_tenant_id(ticket_id)));
CREATE POLICY "support_ticket_events_tenant_isolation" ON public."support_ticket_events" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "support_ticket_participants_tenant_isolation" ON public."support_ticket_participants" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "support_ticket_relations_tenant_isolation" ON public."support_ticket_relations" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "support_tickets_tenant_isolation" ON public."support_tickets" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
CREATE POLICY "support_time_entries_delete" ON public."support_time_entries" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "support_time_entries_insert" ON public."support_time_entries" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "support_time_entries_select" ON public."support_time_entries" AS PERMISSIVE FOR SELECT TO public USING (((support_grant_access(ticket_id, 'view'::text) OR platform_is_tenant_member(tenant_id)) AND support_ticket_visibility_ok(ticket_id)));
CREATE POLICY "support_time_entries_update" ON public."support_time_entries" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "support_webhook_deliveries_delete" ON public."support_webhook_deliveries" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "support_webhook_deliveries_insert" ON public."support_webhook_deliveries" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "support_webhook_deliveries_select" ON public."support_webhook_deliveries" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "support_webhook_deliveries_update" ON public."support_webhook_deliveries" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "support_webhooks_outbound_delete" ON public."support_webhooks_outbound" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "support_webhooks_outbound_insert" ON public."support_webhooks_outbound" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "support_webhooks_outbound_select" ON public."support_webhooks_outbound" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "support_webhooks_outbound_update" ON public."support_webhooks_outbound" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "tenant_isolation" ON public."tags" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "tenant_isolation" ON public."taxes" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "tenant_locations_delete" ON public."tenant_locations" AS PERMISSIVE FOR DELETE TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "tenant_locations_insert" ON public."tenant_locations" AS PERMISSIVE FOR INSERT TO public WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "tenant_locations_select" ON public."tenant_locations" AS PERMISSIVE FOR SELECT TO public USING (platform_is_tenant_member(tenant_id));
CREATE POLICY "tenant_locations_update" ON public."tenant_locations" AS PERMISSIVE FOR UPDATE TO public USING (platform_is_tenant_member(tenant_id)) WITH CHECK (platform_is_tenant_member(tenant_id));
CREATE POLICY "tenant_memberships_delete" ON public."tenant_memberships" AS PERMISSIVE FOR DELETE TO public USING ((platform_is_admin() OR (EXISTS ( SELECT 1
   FROM tenant_memberships tm
  WHERE ((tm.user_id = auth.uid()) AND (tm.tenant_id = tenant_memberships.tenant_id) AND (tm.role = ANY (ARRAY['super_admin'::text, 'owner'::text, 'admin'::text])) AND (tm.active = true) AND (tm.status = 'active'::text))))));
CREATE POLICY "tenant_memberships_insert" ON public."tenant_memberships" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((platform_is_admin() OR (EXISTS ( SELECT 1
   FROM tenant_memberships tm
  WHERE ((tm.user_id = auth.uid()) AND (tm.tenant_id = tenant_memberships.tenant_id) AND (tm.role = ANY (ARRAY['super_admin'::text, 'owner'::text, 'admin'::text])) AND (tm.active = true) AND (tm.status = 'active'::text))))));
CREATE POLICY "tenant_memberships_select" ON public."tenant_memberships" AS PERMISSIVE FOR SELECT TO public USING ((platform_is_tenant_member(tenant_id) OR platform_is_admin()));
CREATE POLICY "tenant_memberships_update" ON public."tenant_memberships" AS PERMISSIVE FOR UPDATE TO public USING ((platform_is_admin() OR (EXISTS ( SELECT 1
   FROM tenant_memberships tm
  WHERE ((tm.user_id = auth.uid()) AND (tm.tenant_id = tenant_memberships.tenant_id) AND (tm.role = ANY (ARRAY['super_admin'::text, 'owner'::text, 'admin'::text])) AND (tm.active = true) AND (tm.status = 'active'::text)))))) WITH CHECK ((platform_is_admin() OR (EXISTS ( SELECT 1
   FROM tenant_memberships tm
  WHERE ((tm.user_id = auth.uid()) AND (tm.tenant_id = tenant_memberships.tenant_id) AND (tm.role = ANY (ARRAY['super_admin'::text, 'owner'::text, 'admin'::text])) AND (tm.active = true) AND (tm.status = 'active'::text))))));
CREATE POLICY "tenant_isolation" ON public."testimonials" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "tenant_isolation" ON public."transaction_tags" AS PERMISSIVE FOR ALL TO public USING ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids))) WITH CHECK ((tenant_id IN ( SELECT current_tenant_ids() AS current_tenant_ids)));
CREATE POLICY "verification_tasks_tenant_isolation" ON public."verification_tasks" AS PERMISSIVE FOR ALL TO public USING (((tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid) OR (current_setting('app.current_tenant_id'::text, true) IS NULL)));
