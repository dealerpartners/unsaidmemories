-- Unsaid platform schema — part 2 of 3: tables, foreign keys, indexes
-- Generated 2026-11-02 from the live production catalog (Supabase project pcwwvfgxnrglmmpbfqhf)
-- after the white-label rename. Run the three parts in order on a fresh
-- Supabase project to generate the full schema. Schema only, no data.

-- Tables
CREATE TABLE IF NOT EXISTS public."acct_account_dimension_rules" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "dimension_id" uuid NOT NULL,
  "is_required" boolean NOT NULL DEFAULT false,
  "allowed_values" jsonb,
  CONSTRAINT "acct_account_dimension_rules_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_account_dimension_rules_account_id_dimension_id_key" UNIQUE (account_id, dimension_id)
);
CREATE TABLE IF NOT EXISTS public."acct_allocation_rules" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "allocation_id" uuid NOT NULL,
  "destination_account_id" uuid NOT NULL,
  "percentage" numeric(12,8),
  "fixed_amount" numeric(24,6),
  "dimensions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "acct_allocation_rules_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_allocations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "allocation_type" text NOT NULL DEFAULT 'percentage'::text,
  "source_account_id" uuid NOT NULL,
  "driver_dimension_id" uuid,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "acct_allocations_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_allocations_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_ap_approvals" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "bill_id" uuid,
  "purchase_order_id" uuid,
  "approver_id" uuid,
  "sequence_no" integer NOT NULL DEFAULT 1,
  "status" acct_workflow_status NOT NULL DEFAULT 'pending'::acct_workflow_status,
  "acted_at" timestamp with time zone,
  "comments" text,
  CONSTRAINT "acct_ap_approvals_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_ap_approvals_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_ap_bill_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "bill_id" uuid NOT NULL,
  "line_no" integer NOT NULL,
  "description" text NOT NULL,
  "quantity" numeric(24,6) NOT NULL DEFAULT 1,
  "unit_cost" numeric(24,6) NOT NULL DEFAULT 0,
  "line_subtotal" numeric(24,6) NOT NULL DEFAULT 0,
  "tax_code_id" uuid,
  "tax_amount" numeric(24,6) NOT NULL DEFAULT 0,
  "expense_account_id" uuid NOT NULL,
  "purchase_order_ref" text,
  "item_ref" text,
  "dimensions" jsonb NOT NULL,
  "tenant_id" uuid NOT NULL DEFAULT '652fd2be-d19a-4778-835d-db38094d7718'::uuid,
  CONSTRAINT "acct_ap_bill_lines_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_ap_bills" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL,
  "vendor_id" uuid NOT NULL,
  "bill_number" text NOT NULL,
  "bill_date" date NOT NULL,
  "due_date" date NOT NULL,
  "currency" character(3) NOT NULL,
  "exchange_rate" numeric(24,12) NOT NULL DEFAULT 1,
  "subtotal" numeric(24,6) NOT NULL DEFAULT 0,
  "tax_total" numeric(24,6) NOT NULL DEFAULT 0,
  "discount_total" numeric(24,6) NOT NULL DEFAULT 0,
  "total" numeric(24,6) NOT NULL DEFAULT 0,
  "amount_paid" numeric(24,6) NOT NULL DEFAULT 0,
  "amount_credited" numeric(24,6) NOT NULL DEFAULT 0,
  "status" text NOT NULL,
  "external_id" text,
  "source_system" text,
  "posted_journal_id" uuid,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_ap_bills_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_ap_payment_applications" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "payment_id" uuid NOT NULL,
  "bill_id" uuid NOT NULL,
  "applied_amount" numeric(24,6) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_ap_payment_applications_applied_amount_check" CHECK ((applied_amount > (0)::numeric)),
  CONSTRAINT "acct_ap_payment_applications_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_ap_payment_applications_payment_id_bill_id_key" UNIQUE (payment_id, bill_id)
);
CREATE TABLE IF NOT EXISTS public."acct_ap_payments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL,
  "vendor_id" uuid,
  "payment_number" text NOT NULL,
  "payment_date" date NOT NULL,
  "currency" character(3) NOT NULL,
  "amount" numeric(24,6) NOT NULL,
  "payment_method" text NOT NULL,
  "status" text NOT NULL,
  "cash_account_id" uuid NOT NULL,
  "reference" text,
  "processor" text,
  "processor_transaction_id" text,
  "posted_journal_id" uuid,
  CONSTRAINT "acct_ap_payments_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_ap_purchase_order_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "purchase_order_id" uuid NOT NULL,
  "line_no" integer NOT NULL,
  "description" text NOT NULL,
  "quantity" numeric(24,6) NOT NULL DEFAULT 1,
  "unit_cost" numeric(24,6) NOT NULL DEFAULT 0,
  "expense_account_id" uuid,
  "received_quantity" numeric(24,6) NOT NULL DEFAULT 0,
  "billed_quantity" numeric(24,6) NOT NULL DEFAULT 0,
  CONSTRAINT "acct_ap_purchase_order_lines_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_ap_purchase_order_lines_purchase_order_id_line_no_key" UNIQUE (purchase_order_id, line_no)
);
CREATE TABLE IF NOT EXISTS public."acct_ap_purchase_orders" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL,
  "vendor_id" uuid NOT NULL,
  "po_number" text NOT NULL,
  "order_date" date NOT NULL,
  "expected_date" date,
  "currency" character(3) NOT NULL,
  "subtotal" numeric(24,6) NOT NULL DEFAULT 0,
  "tax_total" numeric(24,6) NOT NULL DEFAULT 0,
  "total" numeric(24,6) NOT NULL DEFAULT 0,
  "status" acct_document_status NOT NULL DEFAULT 'draft'::acct_document_status,
  "approved_by" uuid,
  CONSTRAINT "acct_ap_purchase_orders_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_ap_purchase_orders_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "acct_ap_purchase_orders_entity_id_po_number_key" UNIQUE (entity_id, po_number)
);
CREATE TABLE IF NOT EXISTS public."acct_ar_collections_cases" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "invoice_id" uuid,
  "priority" text NOT NULL DEFAULT 'normal'::text,
  "status" text NOT NULL DEFAULT 'open'::text,
  "assigned_to" uuid,
  "next_action_at" timestamp with time zone,
  "dispute_amount" numeric(24,6) NOT NULL DEFAULT 0,
  "reason" text,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_ar_collections_cases_status_allowed" CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'promised'::text, 'escalated'::text, 'written_off'::text, 'settled'::text, 'closed'::text]))),
  CONSTRAINT "acct_ar_collections_cases_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_ar_collections_cases_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_ar_credit_memos" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "memo_number" text NOT NULL,
  "memo_date" date NOT NULL,
  "currency" character(3) NOT NULL,
  "subtotal" numeric(24,6) NOT NULL DEFAULT 0,
  "tax_total" numeric(24,6) NOT NULL DEFAULT 0,
  "total" numeric(24,6) NOT NULL DEFAULT 0,
  "status" acct_document_status NOT NULL DEFAULT 'draft'::acct_document_status,
  "applied_amount" numeric(24,6) NOT NULL DEFAULT 0,
  "reason" text,
  "posted_journal_id" uuid,
  CONSTRAINT "acct_ar_credit_memos_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_ar_credit_memos_tenant_id_memo_number_key" UNIQUE (tenant_id, memo_number),
  CONSTRAINT "acct_ar_credit_memos_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_ar_invoice_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "invoice_id" uuid NOT NULL,
  "line_no" integer NOT NULL,
  "description" text NOT NULL,
  "quantity" numeric(24,6) NOT NULL DEFAULT 1,
  "unit_price" numeric(24,6) NOT NULL DEFAULT 0,
  "discount_amount" numeric(24,6) NOT NULL DEFAULT 0,
  "line_subtotal" numeric(24,6) NOT NULL DEFAULT 0,
  "tax_code_id" uuid,
  "tax_amount" numeric(24,6) NOT NULL DEFAULT 0,
  "revenue_account_id" uuid NOT NULL,
  "item_ref" text,
  "service_date" date,
  "dimensions" jsonb NOT NULL,
  "tenant_id" uuid NOT NULL DEFAULT '652fd2be-d19a-4778-835d-db38094d7718'::uuid,
  CONSTRAINT "acct_ar_invoice_lines_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_ar_invoices" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "invoice_number" text NOT NULL,
  "invoice_date" date NOT NULL,
  "due_date" date NOT NULL,
  "currency" character(3) NOT NULL,
  "exchange_rate" numeric(24,12) NOT NULL DEFAULT 1,
  "subtotal" numeric(24,6) NOT NULL DEFAULT 0,
  "tax_total" numeric(24,6) NOT NULL DEFAULT 0,
  "discount_total" numeric(24,6) NOT NULL DEFAULT 0,
  "total" numeric(24,6) NOT NULL DEFAULT 0,
  "amount_paid" numeric(24,6) NOT NULL DEFAULT 0,
  "amount_credited" numeric(24,6) NOT NULL DEFAULT 0,
  "status" text NOT NULL,
  "terms" text,
  "notes" text,
  "external_id" text,
  "source_system" text,
  "posted_journal_id" uuid,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "appointment_id" uuid,
  "sent_at" timestamp with time zone,
  "resent_count" integer NOT NULL DEFAULT 0,
  "last_reminder_at" timestamp with time zone,
  "reminder_count" integer NOT NULL DEFAULT 0,
  "viewed_at" timestamp with time zone,
  "voided_at" timestamp with time zone,
  "voided_by" uuid,
  "void_reason" text,
  "paid_at" timestamp with time zone,
  "deposit_paid" numeric NOT NULL DEFAULT 0,
  "source_customer_id" text,
  "booking_id" text,
  "dependent_id" uuid,
  CONSTRAINT "acct_ar_invoices_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_ar_receipt_applications" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "receipt_id" uuid NOT NULL,
  "invoice_id" uuid NOT NULL,
  "applied_amount" numeric(24,6) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_ar_receipt_applications_applied_amount_check" CHECK ((applied_amount > (0)::numeric)),
  CONSTRAINT "acct_ar_receipt_applications_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_ar_receipt_applications_receipt_id_invoice_id_key" UNIQUE (receipt_id, invoice_id)
);
CREATE TABLE IF NOT EXISTS public."acct_ar_receipts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL,
  "customer_id" uuid,
  "receipt_number" text NOT NULL,
  "receipt_date" date NOT NULL,
  "currency" character(3) NOT NULL,
  "amount" numeric(24,6) NOT NULL,
  "payment_method" text NOT NULL,
  "status" text NOT NULL,
  "deposit_account_id" uuid NOT NULL,
  "reference" text,
  "processor" text,
  "processor_transaction_id" text,
  "posted_journal_id" uuid,
  CONSTRAINT "acct_ar_receipts_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_asset_books" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "asset_id" uuid NOT NULL,
  "book_id" uuid NOT NULL,
  "depreciation_method" text NOT NULL DEFAULT 'straight_line'::text,
  "convention" text NOT NULL DEFAULT 'full_month'::text,
  "useful_life_months" integer NOT NULL,
  "depreciation_start_date" date,
  "in_service_cost" numeric(24,6) NOT NULL DEFAULT 0,
  "accumulated_depreciation" numeric(24,6) NOT NULL DEFAULT 0,
  "net_book_value" numeric(24,6) NOT NULL DEFAULT 0,
  "last_depreciation_date" date,
  CONSTRAINT "acct_asset_books_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_asset_books_asset_id_book_id_key" UNIQUE (asset_id, book_id)
);
CREATE TABLE IF NOT EXISTS public."acct_asset_classes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "asset_account_id" uuid NOT NULL,
  "accumulated_depreciation_account_id" uuid NOT NULL,
  "depreciation_expense_account_id" uuid NOT NULL,
  "default_useful_life_months" integer NOT NULL DEFAULT 60,
  "default_method" text NOT NULL DEFAULT 'straight_line'::text,
  "residual_percent" numeric(9,6) NOT NULL DEFAULT 0,
  CONSTRAINT "acct_asset_classes_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_asset_classes_tenant_id_code_key" UNIQUE (tenant_id, code),
  CONSTRAINT "acct_asset_classes_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_asset_depreciation_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "run_id" uuid NOT NULL,
  "asset_book_id" uuid NOT NULL,
  "depreciation_amount" numeric(24,6) NOT NULL,
  "accumulated_after" numeric(24,6) NOT NULL,
  "nbv_after" numeric(24,6) NOT NULL,
  CONSTRAINT "acct_asset_depreciation_lines_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_asset_depreciation_runs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "book_id" uuid NOT NULL,
  "period_id" uuid NOT NULL,
  "run_date" date NOT NULL,
  "status" acct_posting_status NOT NULL DEFAULT 'draft'::acct_posting_status,
  "journal_id" uuid,
  "created_by" uuid,
  "posted_at" timestamp with time zone,
  CONSTRAINT "acct_asset_depreciation_runs_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_asset_depreciation_runs_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "acct_asset_depreciation_runs_book_id_period_id_key" UNIQUE (book_id, period_id)
);
CREATE TABLE IF NOT EXISTS public."acct_attachments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "file_name" text NOT NULL,
  "storage_path" text NOT NULL,
  "mime_type" text,
  "size_bytes" bigint,
  "sha256" text,
  "uploaded_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_attachments_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_attachments_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_audit_log" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "event_time" timestamp with time zone NOT NULL DEFAULT now(),
  "action" text NOT NULL,
  "table_name" text,
  "record_id" text,
  "before_data" jsonb,
  "after_data" jsonb,
  "ip_address" inet,
  "user_agent" text,
  "request_id" text,
  "correlation_id" text,
  "entry_hash" text,
  "prev_hash" text,
  CONSTRAINT "acct_audit_log_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_audit_log_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_bank_accounts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL,
  "name" text NOT NULL,
  "institution_name" text,
  "account_type" text NOT NULL,
  "masked_account_number" text,
  "currency" character(3) NOT NULL,
  "gl_account_id" uuid NOT NULL,
  "provider" text,
  "provider_connection_id" text,
  "provider_account_id" text,
  "last_sync_at" timestamp with time zone,
  "is_active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_bank_accounts_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_bank_statements" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "bank_account_id" uuid NOT NULL,
  "statement_start" date NOT NULL,
  "statement_end" date NOT NULL,
  "opening_balance" numeric(24,6) NOT NULL,
  "closing_balance" numeric(24,6) NOT NULL,
  "imported_at" timestamp with time zone NOT NULL DEFAULT now(),
  "provider_statement_id" text,
  CONSTRAINT "acct_bank_statements_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_bank_statements_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "acct_bank_statements_bank_account_id_statement_start_statem_key" UNIQUE (bank_account_id, statement_start, statement_end)
);
CREATE TABLE IF NOT EXISTS public."acct_bank_transactions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "bank_account_id" uuid NOT NULL,
  "statement_id" uuid,
  "transaction_date" date NOT NULL,
  "posted_date" date,
  "amount" numeric(24,6) NOT NULL,
  "currency" character(3) NOT NULL,
  "description" text,
  "payee" text,
  "reference" text,
  "provider_transaction_id" text,
  "transaction_hash" text,
  "match_status" text NOT NULL,
  "matched_journal_line_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_bank_transactions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_book_account_mappings" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "source_account_id" uuid NOT NULL,
  "target_book_id" uuid NOT NULL,
  "target_account_id" uuid NOT NULL,
  CONSTRAINT "acct_book_account_mappings_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_book_account_mappings_source_account_id_target_book_id_key" UNIQUE (source_account_id, target_book_id),
  CONSTRAINT "acct_book_account_mappings_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_books" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "book_type" text NOT NULL DEFAULT 'primary'::text,
  "accounting_basis" text NOT NULL DEFAULT 'accrual'::text,
  "currency" character(3) NOT NULL,
  "is_primary" boolean NOT NULL DEFAULT false,
  "is_adjustment_book" boolean NOT NULL DEFAULT false,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_books_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_books_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "acct_books_tenant_id_entity_id_code_key" UNIQUE (tenant_id, entity_id, code)
);
CREATE TABLE IF NOT EXISTS public."acct_budget_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "budget_id" uuid NOT NULL,
  "period_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "amount" numeric(24,6) NOT NULL DEFAULT 0,
  "dimensions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "notes" text,
  CONSTRAINT "acct_budget_lines_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_budget_lines_budget_id_period_id_account_id_dimensions_key" UNIQUE (budget_id, period_id, account_id, dimensions)
);
CREATE TABLE IF NOT EXISTS public."acct_budget_versions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL,
  "name" text NOT NULL,
  "fiscal_year" integer NOT NULL,
  "version_no" integer NOT NULL DEFAULT 1,
  "scenario" text NOT NULL DEFAULT 'budget'::text,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "currency" character(3) NOT NULL,
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  CONSTRAINT "acct_budget_versions_status_allowed" CHECK ((status = ANY (ARRAY['draft'::text, 'under_review'::text, 'approved'::text, 'active'::text, 'locked'::text, 'archived'::text, 'rejected'::text]))),
  CONSTRAINT "acct_budget_versions_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_budget_versions_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "acct_budget_versions_entity_id_fiscal_year_scenario_version_key" UNIQUE (entity_id, fiscal_year, scenario, version_no)
);
CREATE TABLE IF NOT EXISTS public."acct_chart_of_accounts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL,
  "parent_account_id" uuid,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "account_type" text NOT NULL,
  "normal_balance" text NOT NULL,
  "subtype" text,
  "description" text,
  "currency" character(3),
  "is_control_account" boolean NOT NULL DEFAULT false,
  "is_reconcilable" boolean NOT NULL DEFAULT false,
  "is_posting_allowed" boolean NOT NULL DEFAULT true,
  "is_system" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_chart_of_accounts_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_close_checklists" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "period_id" uuid NOT NULL,
  "task_code" text NOT NULL,
  "task_name" text NOT NULL,
  "sequence_no" integer NOT NULL DEFAULT 0,
  "required" boolean NOT NULL DEFAULT true,
  "status" text NOT NULL DEFAULT 'open'::text,
  "assigned_to" uuid,
  "completed_by" uuid,
  "completed_at" timestamp with time zone,
  "notes" text,
  CONSTRAINT "acct_close_checklists_status_allowed" CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'blocked'::text, 'completed'::text, 'skipped'::text, 'reopened'::text]))),
  CONSTRAINT "acct_close_checklists_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_close_checklists_period_id_task_code_key" UNIQUE (period_id, task_code)
);
CREATE TABLE IF NOT EXISTS public."acct_consolidation_groups" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "reporting_currency" character(3) NOT NULL,
  "consolidation_method" text NOT NULL DEFAULT 'full'::text,
  CONSTRAINT "acct_consolidation_groups_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_consolidation_groups_tenant_id_code_key" UNIQUE (tenant_id, code),
  CONSTRAINT "acct_consolidation_groups_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_consolidation_members" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "consolidation_group_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL,
  "ownership_percent" numeric(9,6) NOT NULL DEFAULT 100,
  "consolidation_percent" numeric(9,6) NOT NULL DEFAULT 100,
  "effective_from" date NOT NULL,
  "effective_to" date,
  CONSTRAINT "acct_consolidation_members_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_consolidation_members_consolidation_group_id_entity_id_key" UNIQUE (consolidation_group_id, entity_id, effective_from)
);
CREATE TABLE IF NOT EXISTS public."acct_consolidation_runs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "consolidation_group_id" uuid NOT NULL,
  "period_id" uuid NOT NULL,
  "status" acct_posting_status NOT NULL DEFAULT 'draft'::acct_posting_status,
  "reporting_currency" character(3) NOT NULL,
  "fx_adjustment" numeric(24,6) NOT NULL DEFAULT 0,
  "elimination_amount" numeric(24,6) NOT NULL DEFAULT 0,
  "journal_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_consolidation_runs_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_consolidation_runs_consolidation_group_id_period_id_key" UNIQUE (consolidation_group_id, period_id),
  CONSTRAINT "acct_consolidation_runs_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_controls" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "control_code" text NOT NULL,
  "domain" text,
  "process" text,
  "policy_rule" text,
  "threshold" jsonb,
  "owner_role" text,
  "enforcement" text,
  "frequency" text,
  "status" text NOT NULL DEFAULT 'active'::text,
  "evidence_attachment_id" uuid,
  "last_evaluated_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_controls_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_currencies" (
  "code" character(3) NOT NULL,
  "name" text NOT NULL,
  "symbol" text,
  "minor_units" smallint NOT NULL DEFAULT 2,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "tenant_id" uuid NOT NULL DEFAULT '652fd2be-d19a-4778-835d-db38094d7718'::uuid,
  CONSTRAINT "acct_currencies_pkey" PRIMARY KEY (code)
);
CREATE TABLE IF NOT EXISTS public."acct_customer_statements" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "statement_number" text NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "opening_balance" numeric(14,2) NOT NULL DEFAULT 0,
  "charges_total" numeric(14,2) NOT NULL DEFAULT 0,
  "payments_total" numeric(14,2) NOT NULL DEFAULT 0,
  "credits_total" numeric(14,2) NOT NULL DEFAULT 0,
  "closing_balance" numeric(14,2) NOT NULL DEFAULT 0,
  "aging_current" numeric(14,2) NOT NULL DEFAULT 0,
  "aging_1_30" numeric(14,2) NOT NULL DEFAULT 0,
  "aging_31_60" numeric(14,2) NOT NULL DEFAULT 0,
  "aging_61_90" numeric(14,2) NOT NULL DEFAULT 0,
  "aging_over_90" numeric(14,2) NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "document_url" text,
  "sent_at" timestamp with time zone,
  "generated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_customer_statements_check" CHECK ((period_end >= period_start)),
  CONSTRAINT "acct_customer_statements_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'generated'::text, 'sent'::text, 'viewed'::text, 'void'::text]))),
  CONSTRAINT "acct_customer_statements_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_customer_statements_tenant_id_statement_number_key" UNIQUE (tenant_id, statement_number)
);
CREATE TABLE IF NOT EXISTS public."acct_customers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "external_customer_id" text,
  "customer_number" text NOT NULL,
  "legal_name" text NOT NULL,
  "email" text,
  "phone" text,
  "currency" character(3) NOT NULL,
  "payment_terms_days" integer NOT NULL DEFAULT 30,
  "credit_limit" numeric(24,6),
  "ar_account_id" uuid NOT NULL,
  "default_revenue_account_id" uuid,
  "tax_number" text,
  "tax_exempt" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_customers_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_dimension_values" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "dimension_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "parent_value_id" uuid,
  "is_active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "acct_dimension_values_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_dimension_values_dimension_id_code_key" UNIQUE (dimension_id, code)
);
CREATE TABLE IF NOT EXISTS public."acct_dimensions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "data_type" text NOT NULL DEFAULT 'text'::text,
  "is_required" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "acct_dimensions_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_dimensions_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "acct_dimensions_tenant_id_code_key" UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS public."acct_disputes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid,
  "dispute_number" text NOT NULL,
  "customer_id" uuid,
  "invoice_id" uuid,
  "order_ref" text,
  "processor" text NOT NULL DEFAULT 'stripe'::text,
  "processor_dispute_id" text,
  "kind" text NOT NULL DEFAULT 'chargeback'::text,
  "reason" text,
  "amount" numeric NOT NULL DEFAULT 0,
  "currency" character(3) NOT NULL DEFAULT 'USD'::bpchar,
  "status" text NOT NULL DEFAULT 'open'::text,
  "evidence_due_at" date,
  "evidence_notes" text,
  "posted_journal_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_disputes_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_employees" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "staff_id" uuid,
  "user_id" uuid,
  "employee_number" text NOT NULL,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "legal_name" text,
  "email" text,
  "phone" text,
  "date_of_birth" date,
  "hire_date" date NOT NULL,
  "termination_date" date,
  "employment_type" text NOT NULL DEFAULT 'w2_full_time'::text,
  "pay_type" text NOT NULL DEFAULT 'hourly'::text,
  "pay_rate" numeric(12,4) NOT NULL DEFAULT 0,
  "salary_annual" numeric(14,2),
  "overtime_multiplier" numeric(4,2) NOT NULL DEFAULT 1.5,
  "standard_hours_week" numeric(5,2) NOT NULL DEFAULT 40,
  "default_location_id" uuid,
  "tax_filing_status" text,
  "federal_allowances" integer NOT NULL DEFAULT 0,
  "state_code" text,
  "ssn_last4" text,
  "ssn_token" text,
  "bank_account_token" text,
  "payment_method" text NOT NULL DEFAULT 'direct_deposit'::text,
  "status" text NOT NULL DEFAULT 'active'::text,
  "is_exempt" boolean NOT NULL DEFAULT false,
  "notes" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_employees_standard_hours_week_check" CHECK ((standard_hours_week >= (0)::numeric)),
  CONSTRAINT "acct_employees_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'on_leave'::text, 'terminated'::text, 'suspended'::text]))),
  CONSTRAINT "acct_employees_tax_filing_status_check" CHECK (((tax_filing_status IS NULL) OR (tax_filing_status = ANY (ARRAY['single'::text, 'married_filing_jointly'::text, 'married_filing_separately'::text, 'head_of_household'::text])))),
  CONSTRAINT "acct_employees_check" CHECK (((termination_date IS NULL) OR (termination_date >= hire_date))),
  CONSTRAINT "acct_employees_employment_type_check" CHECK ((employment_type = ANY (ARRAY['w2_full_time'::text, 'w2_part_time'::text, 'w2_seasonal'::text, '1099_contractor'::text]))),
  CONSTRAINT "acct_employees_federal_allowances_check" CHECK ((federal_allowances >= 0)),
  CONSTRAINT "acct_employees_overtime_multiplier_check" CHECK ((overtime_multiplier >= (1)::numeric)),
  CONSTRAINT "acct_employees_pay_rate_check" CHECK ((pay_rate >= (0)::numeric)),
  CONSTRAINT "acct_employees_pay_type_check" CHECK ((pay_type = ANY (ARRAY['hourly'::text, 'salary'::text, 'commission_only'::text, 'hourly_plus_commission'::text]))),
  CONSTRAINT "acct_employees_payment_method_check" CHECK ((payment_method = ANY (ARRAY['direct_deposit'::text, 'check'::text, 'cash'::text]))),
  CONSTRAINT "acct_employees_salary_annual_check" CHECK (((salary_annual IS NULL) OR (salary_annual >= (0)::numeric))),
  CONSTRAINT "acct_employees_ssn_last4_check" CHECK (((ssn_last4 IS NULL) OR (ssn_last4 ~ '^[0-9]{4}$'::text))),
  CONSTRAINT "acct_employees_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_employees_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "acct_employees_tenant_id_employee_number_key" UNIQUE (tenant_id, employee_number)
);
CREATE TABLE IF NOT EXISTS public."acct_entities" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "parent_entity_id" uuid,
  "code" text NOT NULL,
  "legal_name" text NOT NULL,
  "display_name" text,
  "entity_type" text NOT NULL DEFAULT 'legal_entity'::text,
  "country_code" character(2),
  "tax_identifier" text,
  "functional_currency" character(3) NOT NULL,
  "reporting_currency" character(3),
  "fiscal_year_start_month" smallint NOT NULL DEFAULT 1,
  "is_active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_entities_fiscal_year_start_month_check" CHECK (((fiscal_year_start_month >= 1) AND (fiscal_year_start_month <= 12))),
  CONSTRAINT "acct_entities_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_entities_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "acct_entities_tenant_id_code_key" UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS public."acct_estimate_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "estimate_id" uuid NOT NULL,
  "line_number" integer NOT NULL DEFAULT 1,
  "service_id" uuid,
  "description" text NOT NULL,
  "quantity" numeric(12,3) NOT NULL DEFAULT 1,
  "unit_price" numeric(14,4) NOT NULL DEFAULT 0,
  "discount_amount" numeric(14,2) NOT NULL DEFAULT 0,
  "tax_amount" numeric(14,2) NOT NULL DEFAULT 0,
  "line_total" numeric(14,2) NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_estimate_lines_line_number_check" CHECK ((line_number >= 1)),
  CONSTRAINT "acct_estimate_lines_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_estimate_lines_estimate_id_line_number_key" UNIQUE (estimate_id, line_number)
);
CREATE TABLE IF NOT EXISTS public."acct_estimates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid,
  "customer_id" uuid,
  "estimate_number" text NOT NULL,
  "estimate_date" date NOT NULL DEFAULT CURRENT_DATE,
  "expiry_date" date,
  "currency" character(3) NOT NULL DEFAULT 'USD'::bpchar,
  "subtotal" numeric NOT NULL DEFAULT 0,
  "tax_total" numeric NOT NULL DEFAULT 0,
  "discount_total" numeric NOT NULL DEFAULT 0,
  "total" numeric NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "terms" text,
  "notes" text,
  "converted_invoice_id" uuid,
  "lines" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "dependent_id" uuid,
  "appointment_id" uuid,
  "issue_date" date NOT NULL DEFAULT CURRENT_DATE,
  "sent_at" timestamp with time zone,
  "viewed_at" timestamp with time zone,
  "accepted_at" timestamp with time zone,
  "declined_at" timestamp with time zone,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid,
  CONSTRAINT "acct_estimates_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_exchange_rates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "rate_date" date NOT NULL,
  "from_currency" character(3) NOT NULL,
  "to_currency" character(3) NOT NULL,
  "rate" numeric(24,12) NOT NULL,
  "rate_type" text NOT NULL DEFAULT 'spot'::text,
  "source" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_exchange_rates_rate_check" CHECK ((rate > (0)::numeric)),
  CONSTRAINT "acct_exchange_rates_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_exchange_rates_tenant_id_rate_date_from_currency_to_cu_key" UNIQUE (tenant_id, rate_date, from_currency, to_currency, rate_type),
  CONSTRAINT "acct_exchange_rates_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_expense_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "expense_report_id" uuid NOT NULL,
  "expense_date" date NOT NULL,
  "merchant" text,
  "description" text NOT NULL,
  "amount" numeric(24,6) NOT NULL,
  "tax_amount" numeric(24,6) NOT NULL DEFAULT 0,
  "expense_account_id" uuid NOT NULL,
  "receipt_uri" text,
  "receipt_hash" text,
  "dimensions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "acct_expense_lines_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_expense_reports" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL,
  "employee_id" text,
  "report_number" text NOT NULL,
  "report_date" date NOT NULL,
  "currency" character(3) NOT NULL,
  "total_amount" numeric(24,6) NOT NULL DEFAULT 0,
  "status" acct_document_status NOT NULL DEFAULT 'draft'::acct_document_status,
  "submitted_at" timestamp with time zone,
  "approved_at" timestamp with time zone,
  "posted_journal_id" uuid,
  CONSTRAINT "acct_expense_reports_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_expense_reports_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "acct_expense_reports_entity_id_report_number_key" UNIQUE (entity_id, report_number)
);
CREATE TABLE IF NOT EXISTS public."acct_fiscal_years" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL,
  "fiscal_year" integer NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "is_adjustment_year" boolean NOT NULL DEFAULT false,
  CONSTRAINT "acct_fiscal_years_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_fixed_assets" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL,
  "asset_class_id" uuid NOT NULL,
  "asset_number" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "acquisition_date" date NOT NULL,
  "placed_in_service_date" date,
  "original_cost" numeric(24,6) NOT NULL DEFAULT 0,
  "residual_value" numeric(24,6) NOT NULL DEFAULT 0,
  "accumulated_depreciation" numeric(24,6) NOT NULL DEFAULT 0,
  "useful_life_months" integer,
  "status" acct_asset_status NOT NULL DEFAULT 'draft'::acct_asset_status,
  "location" text,
  "serial_number" text,
  "disposal_date" date,
  "disposal_proceeds" numeric(24,6),
  "disposal_gain_loss" numeric(24,6),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_fixed_assets_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_fixed_assets_entity_id_asset_number_key" UNIQUE (entity_id, asset_number),
  CONSTRAINT "acct_fixed_assets_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_fx_revaluation_runs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "book_id" uuid NOT NULL,
  "period_id" uuid NOT NULL,
  "revaluation_date" date NOT NULL,
  "status" acct_posting_status NOT NULL DEFAULT 'draft'::acct_posting_status,
  "journal_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_fx_revaluation_runs_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_fx_revaluation_runs_book_id_period_id_key" UNIQUE (book_id, period_id),
  CONSTRAINT "acct_fx_revaluation_runs_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_gateway_clearing_entries" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "payout_id" uuid,
  "gateway" text NOT NULL DEFAULT 'stripe'::text,
  "external_charge_id" text,
  "external_payment_intent_id" text,
  "order_ref" text,
  "gross_amount" numeric NOT NULL DEFAULT 0,
  "fee_amount" numeric NOT NULL DEFAULT 0,
  "reserve_amount" numeric NOT NULL DEFAULT 0,
  "net_amount" numeric NOT NULL DEFAULT 0,
  "currency" text NOT NULL DEFAULT 'USD'::text,
  "state" text NOT NULL DEFAULT 'in_clearing'::text,
  "deposit_window_start" timestamp with time zone,
  "deposit_window_end" timestamp with time zone,
  "released_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_gateway_clearing_entries_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_gift_card_transactions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "gift_card_id" uuid NOT NULL,
  "txn_type" text NOT NULL,
  "amount" numeric NOT NULL DEFAULT 0,
  "balance_after" numeric NOT NULL DEFAULT 0,
  "reference" text,
  "notes" text,
  "posted_journal_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_gift_card_transactions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_gift_cards" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid,
  "code" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'gift_card'::text,
  "status" text NOT NULL DEFAULT 'active'::text,
  "initial_amount" numeric NOT NULL DEFAULT 0,
  "balance" numeric NOT NULL DEFAULT 0,
  "currency" character(3) NOT NULL DEFAULT 'USD'::bpchar,
  "customer_id" uuid,
  "issued_to_email" text,
  "issued_reason" text,
  "expires_at" date,
  "posted_journal_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_gift_cards_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_gift_cards_tenant_id_code_key" UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS public."acct_import_jobs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "source_file_name" text,
  "source_uri" text,
  "status" text NOT NULL DEFAULT 'queued'::text,
  "total_rows" integer NOT NULL DEFAULT 0,
  "processed_rows" integer NOT NULL DEFAULT 0,
  "success_rows" integer NOT NULL DEFAULT 0,
  "error_rows" integer NOT NULL DEFAULT 0,
  "error_report_uri" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_import_jobs_status_allowed" CHECK ((status = ANY (ARRAY['queued'::text, 'validating'::text, 'running'::text, 'completed'::text, 'completed_with_errors'::text, 'failed'::text, 'cancelled'::text]))),
  CONSTRAINT "acct_import_jobs_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_import_jobs_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_integration_idempotency" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_hash" text,
  "response_payload" jsonb,
  "status_code" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_integration_idempotency_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_integration_idempotency_tenant_id_provider_idempotency_key" UNIQUE (tenant_id, provider, idempotency_key),
  CONSTRAINT "acct_integration_idempotency_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_intercompany_partners" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "from_entity_id" uuid NOT NULL,
  "to_entity_id" uuid NOT NULL,
  "due_from_account_id" uuid NOT NULL,
  "due_to_account_id" uuid NOT NULL,
  "markup_percent" numeric(12,8) NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "acct_intercompany_partners_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_intercompany_partners_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "acct_intercompany_partners_from_entity_id_to_entity_id_key" UNIQUE (from_entity_id, to_entity_id)
);
CREATE TABLE IF NOT EXISTS public."acct_intercompany_transactions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "from_entity_id" uuid NOT NULL,
  "to_entity_id" uuid NOT NULL,
  "transaction_date" date NOT NULL,
  "currency" character(3) NOT NULL,
  "amount" numeric(24,6) NOT NULL,
  "description" text,
  "source_type" text,
  "source_id" text,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "from_journal_id" uuid,
  "to_journal_id" uuid,
  "elimination_required" boolean NOT NULL DEFAULT true,
  CONSTRAINT "acct_intercompany_transactions_status_allowed" CHECK ((status = ANY (ARRAY['draft'::text, 'pending'::text, 'matched'::text, 'posted'::text, 'eliminated'::text, 'disputed'::text, 'cancelled'::text]))),
  CONSTRAINT "acct_intercompany_transactions_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_intercompany_transactions_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_journal_batches" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL,
  "book_id" uuid NOT NULL,
  "batch_no" text NOT NULL,
  "source" text NOT NULL,
  "status" text NOT NULL,
  "description" text,
  "source_system" text,
  "external_id" text,
  "idempotency_key" text,
  "created_by" uuid,
  "approved_by" uuid,
  "posted_by" uuid,
  "approved_at" timestamp with time zone,
  "posted_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_journal_batches_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_journal_entries" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL,
  "book_id" uuid NOT NULL,
  "batch_id" uuid NOT NULL,
  "period_id" uuid NOT NULL,
  "entry_no" bigint NOT NULL,
  "entry_date" date NOT NULL,
  "document_date" date,
  "posting_date" date NOT NULL,
  "source" text NOT NULL,
  "source_id" text,
  "reference" text,
  "memo" text,
  "currency" character(3) NOT NULL,
  "exchange_rate" numeric(24,12) NOT NULL DEFAULT 1,
  "total_debit" numeric(24,6) NOT NULL DEFAULT 0,
  "total_credit" numeric(24,6) NOT NULL DEFAULT 0,
  "status" text NOT NULL,
  "reversal_of_id" uuid,
  "created_by" uuid,
  "posted_by" uuid,
  "posted_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_journal_entries_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_journal_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL,
  "journal_entry_id" uuid NOT NULL,
  "line_no" integer NOT NULL,
  "account_id" uuid NOT NULL,
  "description" text,
  "debit" numeric(24,6) NOT NULL DEFAULT 0,
  "credit" numeric(24,6) NOT NULL DEFAULT 0,
  "transaction_currency" character(3),
  "transaction_debit" numeric(24,6) NOT NULL DEFAULT 0,
  "transaction_credit" numeric(24,6) NOT NULL DEFAULT 0,
  "exchange_rate" numeric(24,12) NOT NULL DEFAULT 1,
  "customer_id" text,
  "vendor_id" text,
  "employee_id" text,
  "project_id" text,
  "department_id" text,
  "location_id" text,
  "tax_code_id" uuid,
  "source_line_id" text,
  "dimensions" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_journal_lines_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_lease_payments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "lease_id" uuid NOT NULL,
  "payment_date" date NOT NULL,
  "amount" numeric(24,6) NOT NULL,
  "principal" numeric(24,6) NOT NULL DEFAULT 0,
  "interest" numeric(24,6) NOT NULL DEFAULT 0,
  "journal_id" uuid,
  "status" text NOT NULL DEFAULT 'scheduled'::text,
  CONSTRAINT "acct_lease_payments_status_allowed" CHECK ((status = ANY (ARRAY['scheduled'::text, 'due'::text, 'paid'::text, 'late'::text, 'waived'::text, 'cancelled'::text]))),
  CONSTRAINT "acct_lease_payments_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_leases" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL,
  "lease_number" text NOT NULL,
  "counterparty_name" text NOT NULL,
  "commencement_date" date NOT NULL,
  "end_date" date NOT NULL,
  "currency" character(3) NOT NULL,
  "payment_frequency" text NOT NULL DEFAULT 'monthly'::text,
  "initial_direct_cost" numeric(24,6) NOT NULL DEFAULT 0,
  "lease_incentive" numeric(24,6) NOT NULL DEFAULT 0,
  "discount_rate" numeric(18,12) NOT NULL DEFAULT 0,
  "right_of_use_asset" numeric(24,6) NOT NULL DEFAULT 0,
  "lease_liability" numeric(24,6) NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'draft'::text,
  CONSTRAINT "acct_leases_status_allowed" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'expired'::text, 'terminated'::text, 'renewed'::text, 'cancelled'::text]))),
  CONSTRAINT "acct_leases_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_leases_entity_id_lease_number_key" UNIQUE (entity_id, lease_number),
  CONSTRAINT "acct_leases_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_pay_periods" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "pay_date" date NOT NULL,
  "frequency" text NOT NULL DEFAULT 'biweekly'::text,
  "status" text NOT NULL DEFAULT 'open'::text,
  "locked_at" timestamp with time zone,
  "locked_by" uuid,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_pay_periods_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'locked'::text, 'processing'::text, 'paid'::text, 'cancelled'::text]))),
  CONSTRAINT "acct_pay_periods_frequency_check" CHECK ((frequency = ANY (ARRAY['weekly'::text, 'biweekly'::text, 'semimonthly'::text, 'monthly'::text]))),
  CONSTRAINT "acct_pay_periods_check1" CHECK ((pay_date >= period_end)),
  CONSTRAINT "acct_pay_periods_check" CHECK ((period_end >= period_start)),
  CONSTRAINT "acct_pay_periods_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_pay_periods_tenant_id_period_start_period_end_key" UNIQUE (tenant_id, period_start, period_end),
  CONSTRAINT "acct_pay_periods_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_payment_terms" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "due_days" integer NOT NULL DEFAULT 0,
  "discount_days" integer,
  "discount_percent" numeric(9,6),
  CONSTRAINT "acct_payment_terms_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_payment_terms_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "acct_payment_terms_tenant_id_code_key" UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS public."acct_payouts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "payout_number" text NOT NULL,
  "provider" text NOT NULL DEFAULT 'stripe'::text,
  "provider_payout_id" text,
  "destination_type" text NOT NULL DEFAULT 'bank_account'::text,
  "destination_last4" text,
  "gross_amount" numeric(14,2) NOT NULL DEFAULT 0,
  "fee_amount" numeric(14,2) NOT NULL DEFAULT 0,
  "refund_amount" numeric(14,2) NOT NULL DEFAULT 0,
  "chargeback_amount" numeric(14,2) NOT NULL DEFAULT 0,
  "net_amount" numeric(14,2) NOT NULL DEFAULT 0,
  "currency" text NOT NULL DEFAULT 'USD'::text,
  "period_start" date,
  "period_end" date,
  "scheduled_for" date,
  "status" text NOT NULL DEFAULT 'scheduled'::text,
  "arrived_at" timestamp with time zone,
  "failure_reason" text,
  "gl_journal_entry_id" uuid,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_payouts_provider_check" CHECK ((provider = ANY (ARRAY['stripe'::text, 'square'::text, 'adyen'::text, 'manual'::text, 'ach'::text, 'other'::text]))),
  CONSTRAINT "acct_payouts_status_check" CHECK ((status = ANY (ARRAY['scheduled'::text, 'in_transit'::text, 'paid'::text, 'failed'::text, 'cancelled'::text, 'reversed'::text]))),
  CONSTRAINT "acct_payouts_destination_type_check" CHECK ((destination_type = ANY (ARRAY['bank_account'::text, 'debit_card'::text, 'check'::text, 'wallet'::text]))),
  CONSTRAINT "acct_payouts_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_payouts_tenant_id_payout_number_key" UNIQUE (tenant_id, payout_number),
  CONSTRAINT "acct_payouts_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_payroll_deductions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "deduction_code" text NOT NULL,
  "label" text NOT NULL,
  "deduction_type" text NOT NULL,
  "is_pretax" boolean NOT NULL DEFAULT true,
  "calc_method" text NOT NULL DEFAULT 'fixed_amount'::text,
  "amount" numeric(12,2) NOT NULL DEFAULT 0,
  "percent" numeric(6,3),
  "employer_match_percent" numeric(6,3),
  "annual_cap" numeric(14,2),
  "effective_from" date NOT NULL DEFAULT CURRENT_DATE,
  "effective_to" date,
  "is_active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_payroll_deductions_amount_check" CHECK ((amount >= (0)::numeric)),
  CONSTRAINT "acct_payroll_deductions_calc_method_check" CHECK ((calc_method = ANY (ARRAY['fixed_amount'::text, 'percent_of_gross'::text]))),
  CONSTRAINT "acct_payroll_deductions_check" CHECK (((effective_to IS NULL) OR (effective_to >= effective_from))),
  CONSTRAINT "acct_payroll_deductions_deduction_type_check" CHECK ((deduction_type = ANY (ARRAY['health_insurance'::text, 'dental'::text, 'vision'::text, 'retirement_401k'::text, 'retirement_roth'::text, 'hsa'::text, 'fsa'::text, 'garnishment'::text, 'child_support'::text, 'union_dues'::text, 'loan_repayment'::text, 'uniform'::text, 'other'::text]))),
  CONSTRAINT "acct_payroll_deductions_employer_match_percent_check" CHECK (((employer_match_percent IS NULL) OR (employer_match_percent >= (0)::numeric))),
  CONSTRAINT "acct_payroll_deductions_percent_check" CHECK (((percent IS NULL) OR ((percent >= (0)::numeric) AND (percent <= (100)::numeric)))),
  CONSTRAINT "acct_payroll_deductions_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_payroll_deductions_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_payroll_employees" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "staff_id" uuid,
  "user_id" uuid,
  "employee_name" text NOT NULL,
  "pay_type" text NOT NULL DEFAULT 'hourly'::text,
  "pay_rate" numeric NOT NULL DEFAULT 0,
  "tax_info" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "hire_date" date,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_payroll_employees_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_payroll_run_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "payroll_run_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "regular_hours" numeric(8,2) NOT NULL DEFAULT 0,
  "overtime_hours" numeric(8,2) NOT NULL DEFAULT 0,
  "holiday_hours" numeric(8,2) NOT NULL DEFAULT 0,
  "pto_hours" numeric(8,2) NOT NULL DEFAULT 0,
  "regular_pay" numeric(14,2) NOT NULL DEFAULT 0,
  "overtime_pay" numeric(14,2) NOT NULL DEFAULT 0,
  "commission_pay" numeric(14,2) NOT NULL DEFAULT 0,
  "bonus_pay" numeric(14,2) NOT NULL DEFAULT 0,
  "tips_pay" numeric(14,2) NOT NULL DEFAULT 0,
  "gross_pay" numeric(14,2) NOT NULL DEFAULT 0,
  "federal_income_tax" numeric(14,2) NOT NULL DEFAULT 0,
  "state_income_tax" numeric(14,2) NOT NULL DEFAULT 0,
  "local_income_tax" numeric(14,2) NOT NULL DEFAULT 0,
  "social_security_ee" numeric(14,2) NOT NULL DEFAULT 0,
  "medicare_ee" numeric(14,2) NOT NULL DEFAULT 0,
  "social_security_er" numeric(14,2) NOT NULL DEFAULT 0,
  "medicare_er" numeric(14,2) NOT NULL DEFAULT 0,
  "futa_er" numeric(14,2) NOT NULL DEFAULT 0,
  "suta_er" numeric(14,2) NOT NULL DEFAULT 0,
  "pretax_deductions" numeric(14,2) NOT NULL DEFAULT 0,
  "posttax_deductions" numeric(14,2) NOT NULL DEFAULT 0,
  "net_pay" numeric(14,2) NOT NULL DEFAULT 0,
  "payment_status" text NOT NULL DEFAULT 'pending'::text,
  "payment_reference" text,
  "paystub_url" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_payroll_run_items_payment_status_check" CHECK ((payment_status = ANY (ARRAY['pending'::text, 'issued'::text, 'paid'::text, 'failed'::text, 'voided'::text]))),
  CONSTRAINT "acct_payroll_run_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_payroll_run_items_payroll_run_id_employee_id_key" UNIQUE (payroll_run_id, employee_id)
);
CREATE TABLE IF NOT EXISTS public."acct_payroll_runs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "pay_period_id" uuid NOT NULL,
  "run_number" text NOT NULL,
  "run_type" text NOT NULL DEFAULT 'regular'::text,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "gross_total" numeric(14,2) NOT NULL DEFAULT 0,
  "net_total" numeric(14,2) NOT NULL DEFAULT 0,
  "employee_tax_total" numeric(14,2) NOT NULL DEFAULT 0,
  "employer_tax_total" numeric(14,2) NOT NULL DEFAULT 0,
  "deduction_total" numeric(14,2) NOT NULL DEFAULT 0,
  "commission_total" numeric(14,2) NOT NULL DEFAULT 0,
  "employee_count" integer NOT NULL DEFAULT 0,
  "provider" text,
  "provider_reference" text,
  "gl_journal_entry_id" uuid,
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "processed_at" timestamp with time zone,
  "error_message" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_payroll_runs_run_type_check" CHECK ((run_type = ANY (ARRAY['regular'::text, 'off_cycle'::text, 'bonus'::text, 'correction'::text, 'final'::text]))),
  CONSTRAINT "acct_payroll_runs_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'calculating'::text, 'review'::text, 'approved'::text, 'submitted'::text, 'paid'::text, 'failed'::text, 'cancelled'::text]))),
  CONSTRAINT "acct_payroll_runs_employee_count_check" CHECK ((employee_count >= 0)),
  CONSTRAINT "acct_payroll_runs_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_payroll_runs_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "acct_payroll_runs_tenant_id_run_number_key" UNIQUE (tenant_id, run_number)
);
CREATE TABLE IF NOT EXISTS public."acct_payroll_tax_forms" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "employee_id" uuid,
  "vendor_id" uuid,
  "form_type" text NOT NULL,
  "tax_year" integer NOT NULL,
  "period_label" text,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "document_url" text,
  "filed_at" timestamp with time zone,
  "filed_by" uuid,
  "confirmation_number" text,
  "box_values" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_payroll_tax_forms_tax_year_check" CHECK (((tax_year >= 2000) AND (tax_year <= 2200))),
  CONSTRAINT "acct_payroll_tax_forms_form_type_check" CHECK ((form_type = ANY (ARRAY['W-2'::text, 'W-4'::text, 'W-9'::text, '1099-NEC'::text, '1099-MISC'::text, '940'::text, '941'::text, 'I-9'::text, 'state_withholding'::text]))),
  CONSTRAINT "acct_payroll_tax_forms_check" CHECK (((employee_id IS NOT NULL) OR (vendor_id IS NOT NULL) OR (form_type = ANY (ARRAY['940'::text, '941'::text])))),
  CONSTRAINT "acct_payroll_tax_forms_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'generated'::text, 'filed'::text, 'accepted'::text, 'rejected'::text, 'amended'::text, 'void'::text]))),
  CONSTRAINT "acct_payroll_tax_forms_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_payroll_tax_forms_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_periods" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "book_id" uuid NOT NULL,
  "fiscal_year_id" uuid NOT NULL,
  "period_no" smallint NOT NULL,
  "name" text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "status" text NOT NULL,
  "closed_at" timestamp with time zone,
  "closed_by" uuid,
  CONSTRAINT "acct_periods_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_price_book_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "price_book_id" uuid NOT NULL,
  "catalog_product_id" uuid,
  "sku" text,
  "channel" text,
  "base_price" numeric,
  "override_price" numeric,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_price_book_lines_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_price_books" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "title" text,
  "method" text NOT NULL DEFAULT 'fixed'::text,
  "qualifying_terms" text,
  "catalog_scope" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_price_books_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_receipt_extractions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "attachment_id" uuid,
  "vendor_name" text,
  "extracted_total" numeric,
  "tax_amount" numeric,
  "receipt_date" date,
  "ocr_score" numeric,
  "matched_bank_transaction_id" uuid,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "raw_extraction" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_receipt_extractions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_reconciliation_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "reconciliation_id" uuid NOT NULL,
  "bank_transaction_id" uuid,
  "journal_line_id" uuid,
  "item_type" text NOT NULL,
  "amount" numeric(24,6) NOT NULL,
  "status" text NOT NULL DEFAULT 'unresolved'::text,
  "notes" text,
  CONSTRAINT "acct_reconciliation_items_status_allowed" CHECK ((status = ANY (ARRAY['unmatched'::text, 'matched'::text, 'partially_matched'::text, 'ignored'::text, 'disputed'::text, 'resolved'::text]))),
  CONSTRAINT "acct_reconciliation_items_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_reconciliations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "bank_account_id" uuid NOT NULL,
  "period_id" uuid,
  "as_of_date" date NOT NULL,
  "statement_balance" numeric(24,6) NOT NULL,
  "gl_balance" numeric(24,6) NOT NULL,
  "outstanding_deposits" numeric(24,6) NOT NULL DEFAULT 0,
  "outstanding_payments" numeric(24,6) NOT NULL DEFAULT 0,
  "adjustments" numeric(24,6) NOT NULL DEFAULT 0,
  "difference" numeric(24,6) GENERATED ALWAYS AS (((((statement_balance - gl_balance) + outstanding_deposits) - outstanding_payments) + adjustments)) STORED,
  "status" acct_reconciliation_status NOT NULL DEFAULT 'open'::acct_reconciliation_status,
  "prepared_by" uuid,
  "reviewed_by" uuid,
  "completed_at" timestamp with time zone,
  CONSTRAINT "acct_reconciliations_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_reconciliations_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_recurring_invoice_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "recurring_invoice_id" uuid NOT NULL,
  "line_number" integer NOT NULL DEFAULT 1,
  "service_id" uuid,
  "description" text NOT NULL,
  "quantity" numeric(12,3) NOT NULL DEFAULT 1,
  "unit_price" numeric(14,4) NOT NULL DEFAULT 0,
  "tax_amount" numeric(14,2) NOT NULL DEFAULT 0,
  "line_total" numeric(14,2) NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_recurring_invoice_lines_line_number_check" CHECK ((line_number >= 1)),
  CONSTRAINT "acct_recurring_invoice_lines_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_recurring_invoice_lines_recurring_invoice_id_line_numb_key" UNIQUE (recurring_invoice_id, line_number)
);
CREATE TABLE IF NOT EXISTS public."acct_recurring_invoices" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid,
  "customer_id" uuid,
  "template_number" text NOT NULL,
  "name" text NOT NULL,
  "frequency" text NOT NULL DEFAULT 'monthly'::text,
  "next_run_date" date NOT NULL,
  "end_date" date,
  "currency" character(3) NOT NULL DEFAULT 'USD'::bpchar,
  "subtotal" numeric NOT NULL DEFAULT 0,
  "tax_total" numeric NOT NULL DEFAULT 0,
  "total" numeric NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'active'::text,
  "last_invoice_id" uuid,
  "last_run_at" timestamp with time zone,
  "run_count" integer NOT NULL DEFAULT 0,
  "lines" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "interval_count" integer NOT NULL DEFAULT 1,
  "starts_on" date NOT NULL DEFAULT CURRENT_DATE,
  "ends_on" date,
  "next_run_on" date,
  "last_run_on" date,
  "occurrences_limit" integer,
  "occurrences_done" integer NOT NULL DEFAULT 0,
  "auto_send" boolean NOT NULL DEFAULT false,
  "auto_charge" boolean NOT NULL DEFAULT false,
  "payment_method_id" uuid,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "acct_recurring_invoices_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_recurring_journals" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "book_id" uuid NOT NULL,
  "name" text NOT NULL,
  "frequency" text NOT NULL,
  "interval_n" integer NOT NULL DEFAULT 1,
  "next_run_date" date NOT NULL,
  "end_date" date,
  "active" boolean NOT NULL DEFAULT true,
  "template" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "last_run_at" timestamp with time zone,
  CONSTRAINT "acct_recurring_journals_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_recurring_journals_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_refund_policies" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "window_days" integer NOT NULL DEFAULT 30,
  "restocking_fee_percent" numeric NOT NULL DEFAULT 0,
  "require_approval_above" numeric NOT NULL DEFAULT 100,
  "auto_approve_below" numeric NOT NULL DEFAULT 25,
  "notes" text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_refund_policies_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_refund_policies_tenant_id_key" UNIQUE (tenant_id)
);
CREATE TABLE IF NOT EXISTS public."acct_refunds" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid,
  "refund_number" text NOT NULL,
  "customer_id" uuid,
  "invoice_id" uuid,
  "receipt_id" uuid,
  "order_ref" text,
  "refund_type" text NOT NULL DEFAULT 'refund'::text,
  "reason" text,
  "amount" numeric NOT NULL DEFAULT 0,
  "currency" character(3) NOT NULL DEFAULT 'USD'::bpchar,
  "status" text NOT NULL DEFAULT 'requested'::text,
  "payment_method" text,
  "processor" text,
  "processor_refund_id" text,
  "requested_by" uuid,
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "issued_at" timestamp with time zone,
  "posted_journal_id" uuid,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_refunds_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_revenue_contracts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "contract_number" text NOT NULL,
  "contract_date" date NOT NULL,
  "start_date" date,
  "end_date" date,
  "currency" character(3) NOT NULL,
  "total_transaction_price" numeric(24,6) NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_revenue_contracts_status_allowed" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'fulfilled'::text, 'modified'::text, 'cancelled'::text, 'expired'::text]))),
  CONSTRAINT "acct_revenue_contracts_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_revenue_contracts_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "acct_revenue_contracts_entity_id_contract_number_key" UNIQUE (entity_id, contract_number)
);
CREATE TABLE IF NOT EXISTS public."acct_revenue_performance_obligations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "contract_id" uuid NOT NULL,
  "obligation_code" text NOT NULL,
  "description" text NOT NULL,
  "standalone_price" numeric(24,6) NOT NULL DEFAULT 0,
  "allocated_price" numeric(24,6) NOT NULL DEFAULT 0,
  "recognition_method" acct_recognition_method NOT NULL,
  "recognition_start" date,
  "recognition_end" date,
  "deferred_revenue_account_id" uuid NOT NULL,
  "revenue_account_id" uuid NOT NULL,
  CONSTRAINT "acct_revenue_performance_obligations_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_revenue_performance_obliga_contract_id_obligation_code_key" UNIQUE (contract_id, obligation_code)
);
CREATE TABLE IF NOT EXISTS public."acct_revenue_recognition_schedules" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "obligation_id" uuid NOT NULL,
  "period_id" uuid NOT NULL,
  "scheduled_amount" numeric(24,6) NOT NULL DEFAULT 0,
  "recognized_amount" numeric(24,6) NOT NULL DEFAULT 0,
  "journal_id" uuid,
  "status" text NOT NULL DEFAULT 'scheduled'::text,
  CONSTRAINT "acct_revenue_recognition_schedules_status_allowed" CHECK ((status = ANY (ARRAY['scheduled'::text, 'recognized'::text, 'deferred'::text, 'adjusted'::text, 'reversed'::text, 'cancelled'::text]))),
  CONSTRAINT "acct_revenue_recognition_schedules_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_revenue_recognition_schedules_obligation_id_period_id_key" UNIQUE (obligation_id, period_id)
);
CREATE TABLE IF NOT EXISTS public."acct_tax_codes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "jurisdiction_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "tax_type" acct_tax_type NOT NULL,
  "rate" numeric(12,8) NOT NULL DEFAULT 0,
  "recoverable_percent" numeric(9,6) NOT NULL DEFAULT 0,
  "payable_account_id" uuid,
  "receivable_account_id" uuid,
  "effective_from" date NOT NULL,
  "effective_to" date,
  "is_compound" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "acct_tax_codes_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_tax_codes_tenant_id_code_key" UNIQUE (tenant_id, code),
  CONSTRAINT "acct_tax_codes_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_tax_filings" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "tax_rate_id" uuid,
  "period_label" text NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "taxable_sales" numeric NOT NULL DEFAULT 0,
  "tax_collected" numeric NOT NULL DEFAULT 0,
  "tax_remitted" numeric NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "filed_at" timestamp with time zone,
  "confirmation_ref" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_tax_filings_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_tax_jurisdictions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "country_code" character(2),
  "state_code" text,
  "locality" text,
  "registration_number" text,
  CONSTRAINT "acct_tax_jurisdictions_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_tax_jurisdictions_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "acct_tax_jurisdictions_tenant_id_code_key" UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS public."acct_tax_rates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "jurisdiction" text,
  "rate_percent" numeric NOT NULL DEFAULT 0,
  "gl_account_id" uuid,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_tax_rates_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_tax_rules" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "jurisdiction" text NOT NULL,
  "tax_type" text NOT NULL DEFAULT 'STATE_SALES_TAX'::text,
  "state_code" text NOT NULL DEFAULT 'TN'::text,
  "rate" numeric(6,3) NOT NULL DEFAULT 0,
  "tax_code" text,
  "classification" text NOT NULL DEFAULT 'ALL_SALES'::text,
  "auto_calc" boolean NOT NULL DEFAULT true,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_tax_rules_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_timesheets" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "pay_period_id" uuid,
  "work_date" date NOT NULL,
  "clock_in" timestamp with time zone,
  "clock_out" timestamp with time zone,
  "break_minutes" integer NOT NULL DEFAULT 0,
  "regular_hours" numeric(6,2) NOT NULL DEFAULT 0,
  "overtime_hours" numeric(6,2) NOT NULL DEFAULT 0,
  "holiday_hours" numeric(6,2) NOT NULL DEFAULT 0,
  "pto_hours" numeric(6,2) NOT NULL DEFAULT 0,
  "unpaid_hours" numeric(6,2) NOT NULL DEFAULT 0,
  "location_id" uuid,
  "source" text NOT NULL DEFAULT 'manual'::text,
  "time_clock_entry_id" uuid,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "edit_reason" text,
  "notes" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_timesheets_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text, 'rejected'::text, 'locked'::text]))),
  CONSTRAINT "acct_timesheets_unpaid_hours_check" CHECK ((unpaid_hours >= (0)::numeric)),
  CONSTRAINT "acct_timesheets_break_minutes_check" CHECK ((break_minutes >= 0)),
  CONSTRAINT "acct_timesheets_check" CHECK (((clock_out IS NULL) OR (clock_in IS NULL) OR (clock_out >= clock_in))),
  CONSTRAINT "acct_timesheets_holiday_hours_check" CHECK ((holiday_hours >= (0)::numeric)),
  CONSTRAINT "acct_timesheets_overtime_hours_check" CHECK ((overtime_hours >= (0)::numeric)),
  CONSTRAINT "acct_timesheets_pto_hours_check" CHECK ((pto_hours >= (0)::numeric)),
  CONSTRAINT "acct_timesheets_regular_hours_check" CHECK ((regular_hours >= (0)::numeric)),
  CONSTRAINT "acct_timesheets_source_check" CHECK ((source = ANY (ARRAY['manual'::text, 'time_clock'::text, 'imported'::text, 'scheduled_auto'::text]))),
  CONSTRAINT "acct_timesheets_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_timesheets_tenant_id_employee_id_work_date_key" UNIQUE (tenant_id, employee_id, work_date),
  CONSTRAINT "acct_timesheets_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_vendors" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "external_vendor_id" text,
  "vendor_number" text NOT NULL,
  "legal_name" text NOT NULL,
  "email" text,
  "phone" text,
  "currency" character(3) NOT NULL,
  "payment_terms_days" integer NOT NULL DEFAULT 30,
  "ap_account_id" uuid NOT NULL,
  "default_expense_account_id" uuid,
  "tax_number" text,
  "tax_form_type" text,
  "is_1099_vendor" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "w9_received_at" timestamp with time zone,
  "ach_bank_name" text,
  "ach_routing_number" text,
  "ach_account_last4" text,
  CONSTRAINT "acct_vendors_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_workflow_actions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "workflow_instance_id" uuid NOT NULL,
  "step_no" integer NOT NULL,
  "approver_id" uuid,
  "action" text NOT NULL,
  "comments" text,
  "acted_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "acct_workflow_actions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."acct_workflow_instances" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "workflow_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "status" acct_workflow_status NOT NULL DEFAULT 'pending'::acct_workflow_status,
  "current_step" integer NOT NULL DEFAULT 1,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone,
  CONSTRAINT "acct_workflow_instances_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_workflow_instances_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."acct_workflows" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "entity_type" text NOT NULL,
  "threshold_amount" numeric(24,6),
  "rules" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "acct_workflows_pkey" PRIMARY KEY (id),
  CONSTRAINT "acct_workflows_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."activity_log" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "entity" text,
  "entityId" text,
  "action" text,
  "summary" text,
  "actor" text DEFAULT 'system'::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "tenant_id" uuid NOT NULL,
  CONSTRAINT "activity_log_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ad_account_tiers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "spend_threshold" double precision DEFAULT 0,
  "benefits" jsonb DEFAULT '{}'::jsonb,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "ad_account_tiers_pkey" PRIMARY KEY (id),
  CONSTRAINT "ad_account_tiers_name_key" UNIQUE (name)
);
CREATE TABLE IF NOT EXISTS public."ad_accounts" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "organization_id" uuid NOT NULL,
  "name" text NOT NULL,
  "status" text DEFAULT 'active'::text,
  "verified" boolean DEFAULT false,
  "tier" text DEFAULT 'standard'::text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "ad_accounts_pkey" PRIMARY KEY (id),
  CONSTRAINT "ad_accounts_organization_id_key" UNIQUE (organization_id)
);
CREATE TABLE IF NOT EXISTS public."ad_advertisers" (
  "id" bigint NOT NULL DEFAULT nextval('ad_advertisers_id_seq'::regclass),
  "user_id" uuid,
  "display_name" text,
  "is_system" boolean NOT NULL DEFAULT false,
  "status" character varying(20) NOT NULL DEFAULT 'active'::character varying,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ad_advertisers_identity_chk" CHECK ((is_system OR (user_id IS NOT NULL))),
  CONSTRAINT "ad_advertisers_status_chk" CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'suspended'::character varying, 'closed'::character varying])::text[]))),
  CONSTRAINT "ad_advertisers_pkey" PRIMARY KEY (id),
  CONSTRAINT "ad_advertisers_user_id_key" UNIQUE (user_id)
);
CREATE TABLE IF NOT EXISTS public."ad_analytics" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "campaign_id" uuid NOT NULL,
  "date" timestamp with time zone DEFAULT now(),
  "impressions" integer DEFAULT 0,
  "reach" integer DEFAULT 0,
  "clicks" integer DEFAULT 0,
  "spend" double precision DEFAULT 0,
  "conversions" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "ad_analytics_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ad_audiences" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "organization_id" uuid NOT NULL,
  "name" text NOT NULL,
  "criteria" jsonb NOT NULL,
  "size" integer DEFAULT 0,
  "reach" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "ad_audiences_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ad_budget_tiers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "min_daily_budget" double precision,
  "max_daily_budget" double precision,
  "recommendation" text,
  "features" jsonb DEFAULT '{}'::jsonb,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "ad_budget_tiers_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ad_campaign_categories" (
  "campaign_id" bigint NOT NULL,
  "category_id" uuid NOT NULL,
  CONSTRAINT "ad_campaign_categories_pkey" PRIMARY KEY (campaign_id, category_id)
);
CREATE TABLE IF NOT EXISTS public."ad_campaign_daily" (
  "campaign_id" bigint NOT NULL,
  "delivery_date" date NOT NULL,
  "impressions" bigint NOT NULL DEFAULT 0,
  "clicks" bigint NOT NULL DEFAULT 0,
  "spend_millicents" bigint NOT NULL DEFAULT 0,
  "spend_cents" bigint GENERATED ALWAYS AS ((spend_millicents / 1000)) STORED,
  CONSTRAINT "ad_campaign_daily_spend_millicents_check" CHECK ((spend_millicents >= 0)),
  CONSTRAINT "ad_campaign_daily_clicks_check" CHECK ((clicks >= 0)),
  CONSTRAINT "ad_campaign_daily_impressions_check" CHECK ((impressions >= 0)),
  CONSTRAINT "ad_campaign_daily_pkey" PRIMARY KEY (campaign_id, delivery_date)
);
CREATE TABLE IF NOT EXISTS public."ad_campaign_groups" (
  "id" bigint NOT NULL DEFAULT nextval('ad_campaign_groups_id_seq'::regclass),
  "campaign_id" bigint NOT NULL,
  "name" character varying(200) NOT NULL,
  "status" character varying(20) NOT NULL DEFAULT 'active'::character varying,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ad_campaign_groups_status_chk" CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'paused'::character varying, 'archived'::character varying])::text[]))),
  CONSTRAINT "ad_campaign_groups_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ad_campaign_placements" (
  "campaign_id" bigint NOT NULL,
  "placement_id" smallint NOT NULL,
  CONSTRAINT "ad_campaign_placements_pkey" PRIMARY KEY (campaign_id, placement_id)
);
CREATE TABLE IF NOT EXISTS public."ad_campaign_rates" (
  "campaign_id" bigint NOT NULL,
  "placement_id" smallint NOT NULL,
  "cpm_cents" integer NOT NULL,
  "rate_card_item_id" bigint,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ad_campaign_rates_cpm_cents_check" CHECK ((cpm_cents >= 0)),
  CONSTRAINT "ad_campaign_rates_pkey" PRIMARY KEY (campaign_id, placement_id)
);
CREATE TABLE IF NOT EXISTS public."ad_campaign_targeting" (
  "campaign_id" bigint NOT NULL,
  "device_mask" integer NOT NULL DEFAULT 7,
  "language_codes" text[],
  "state_codes" character(2)[],
  "include_logged_in" boolean NOT NULL DEFAULT true,
  "include_anonymous" boolean NOT NULL DEFAULT true,
  CONSTRAINT "ad_campaign_targeting_device_mask_check" CHECK (((device_mask >= 0) AND (device_mask <= 7))),
  CONSTRAINT "ad_campaign_targeting_pkey" PRIMARY KEY (campaign_id)
);
CREATE TABLE IF NOT EXISTS public."ad_campaigns" (
  "id" bigint NOT NULL DEFAULT nextval('ad_campaigns_id_seq'::regclass),
  "advertiser_id" bigint NOT NULL,
  "tier_id" smallint NOT NULL,
  "name" character varying(200) NOT NULL,
  "status" character varying(20) NOT NULL DEFAULT 'draft'::character varying,
  "special_category" text,
  "category_match_mode" character varying(20) NOT NULL DEFAULT 'exact'::character varying,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "daily_budget_cents" bigint NOT NULL DEFAULT 0,
  "lifetime_budget_cents" bigint NOT NULL DEFAULT 0,
  "lifetime_spend_millicents" bigint NOT NULL DEFAULT 0,
  "lifetime_spend_cents" bigint GENERATED ALWAYS AS ((lifetime_spend_millicents / 1000)) STORED,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "tenant_id" uuid,
  "special_category_declaration" text,
  "special_category_declared_at" timestamp with time zone,
  "special_category_declared_by" uuid,
  "delivery_type" text DEFAULT 'standard'::text,
  "delivery_schedule" jsonb,
  "budget_tier_id" uuid,
  "brand_suitability" text,
  CONSTRAINT "ad_campaigns_lifetime_spend_millicents_check" CHECK ((lifetime_spend_millicents >= 0)),
  CONSTRAINT "ad_campaigns_status_chk" CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'scheduled'::character varying, 'preflight'::character varying, 'approved'::character varying, 'active'::character varying, 'paused'::character varying, 'ended'::character varying])::text[]))),
  CONSTRAINT "ad_campaigns_check" CHECK ((ends_at > starts_at)),
  CONSTRAINT "ad_campaigns_match_mode_chk" CHECK (((category_match_mode)::text = ANY ((ARRAY['exact'::character varying, 'descendants'::character varying])::text[]))),
  CONSTRAINT "ad_campaigns_daily_budget_cents_check" CHECK ((daily_budget_cents >= 0)),
  CONSTRAINT "ad_campaigns_lifetime_budget_cents_check" CHECK ((lifetime_budget_cents >= 0)),
  CONSTRAINT "ad_campaigns_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ad_creative_assets" (
  "id" bigint NOT NULL DEFAULT nextval('ad_creative_assets_id_seq'::regclass),
  "creative_id" bigint NOT NULL,
  "kind" character varying(30) NOT NULL,
  "asset_url" text NOT NULL,
  "meta" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ad_creative_assets_kind_chk" CHECK (((kind)::text = ANY ((ARRAY['audio'::character varying, 'video'::character varying, 'companion_image'::character varying, 'captions'::character varying, 'logo'::character varying])::text[]))),
  CONSTRAINT "ad_creative_assets_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ad_creatives" (
  "id" bigint NOT NULL DEFAULT nextval('ad_creatives_id_seq'::regclass),
  "campaign_id" bigint NOT NULL,
  "group_id" bigint NOT NULL,
  "name" character varying(200) NOT NULL,
  "status" character varying(20) NOT NULL DEFAULT 'active'::character varying,
  "asset_url" text NOT NULL,
  "click_url" text NOT NULL,
  "headline" text,
  "body" text,
  "cta" text,
  "width" integer NOT NULL,
  "height" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "image_url" text,
  "link_url" text,
  "av_sync" jsonb,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ad_creatives_status_chk" CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'paused'::character varying, 'archived'::character varying])::text[]))),
  CONSTRAINT "ad_creatives_width_check" CHECK ((width > 0)),
  CONSTRAINT "ad_creatives_height_check" CHECK ((height > 0)),
  CONSTRAINT "ad_creatives_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ad_event_counters" (
  "day" date NOT NULL DEFAULT CURRENT_DATE,
  "campaign_id" bigint NOT NULL,
  "creative_id" bigint NOT NULL DEFAULT 0,
  "placement_key" text NOT NULL,
  "impressions" bigint NOT NULL DEFAULT 0,
  "clicks" bigint NOT NULL DEFAULT 0,
  "conversions" bigint NOT NULL DEFAULT 0,
  CONSTRAINT "ad_event_counters_pkey" PRIMARY KEY (day, campaign_id, creative_id, placement_key)
);
CREATE TABLE IF NOT EXISTS public."ad_events" (
  "id" bigint NOT NULL DEFAULT nextval('ad_events_id_seq'::regclass),
  "event_time" timestamp with time zone NOT NULL DEFAULT now(),
  "event_type" character varying(20) NOT NULL,
  "request_id" uuid NOT NULL,
  "tracking_id" uuid,
  "campaign_id" bigint,
  "creative_id" bigint,
  "placement_id" smallint,
  "page_id" bigint,
  "category_id" uuid,
  "ad_uid" uuid,
  "device_type" character varying(20),
  "language_code" character varying(20),
  "state_code" character(2),
  "cpm_cents" integer,
  CONSTRAINT "ad_events_type_chk" CHECK (((event_type)::text = ANY ((ARRAY['request'::character varying, 'eligible'::character varying, 'served'::character varying, 'impression'::character varying, 'click'::character varying])::text[]))),
  CONSTRAINT "ad_events_pkey" PRIMARY KEY (id, event_time)
) PARTITION BY RANGE (event_time);
CREATE TABLE IF NOT EXISTS public."ad_events_2026_10" (
  "id" bigint NOT NULL DEFAULT nextval('ad_events_id_seq'::regclass),
  "event_time" timestamp with time zone NOT NULL DEFAULT now(),
  "event_type" character varying(20) NOT NULL,
  "request_id" uuid NOT NULL,
  "tracking_id" uuid,
  "campaign_id" bigint,
  "creative_id" bigint,
  "placement_id" smallint,
  "page_id" bigint,
  "category_id" uuid,
  "ad_uid" uuid,
  "device_type" character varying(20),
  "language_code" character varying(20),
  "state_code" character(2),
  "cpm_cents" integer,
  CONSTRAINT "ad_events_type_chk" CHECK (((event_type)::text = ANY ((ARRAY['request'::character varying, 'eligible'::character varying, 'served'::character varying, 'impression'::character varying, 'click'::character varying])::text[]))),
  CONSTRAINT "ad_events_2026_10_pkey" PRIMARY KEY (id, event_time)
);
CREATE TABLE IF NOT EXISTS public."ad_events_2026_11" (
  "id" bigint NOT NULL DEFAULT nextval('ad_events_id_seq'::regclass),
  "event_time" timestamp with time zone NOT NULL DEFAULT now(),
  "event_type" character varying(20) NOT NULL,
  "request_id" uuid NOT NULL,
  "tracking_id" uuid,
  "campaign_id" bigint,
  "creative_id" bigint,
  "placement_id" smallint,
  "page_id" bigint,
  "category_id" uuid,
  "ad_uid" uuid,
  "device_type" character varying(20),
  "language_code" character varying(20),
  "state_code" character(2),
  "cpm_cents" integer,
  CONSTRAINT "ad_events_type_chk" CHECK (((event_type)::text = ANY ((ARRAY['request'::character varying, 'eligible'::character varying, 'served'::character varying, 'impression'::character varying, 'click'::character varying])::text[]))),
  CONSTRAINT "ad_events_2026_11_pkey" PRIMARY KEY (id, event_time)
);
CREATE TABLE IF NOT EXISTS public."ad_events_2026_12" (
  "id" bigint NOT NULL DEFAULT nextval('ad_events_id_seq'::regclass),
  "event_time" timestamp with time zone NOT NULL DEFAULT now(),
  "event_type" character varying(20) NOT NULL,
  "request_id" uuid NOT NULL,
  "tracking_id" uuid,
  "campaign_id" bigint,
  "creative_id" bigint,
  "placement_id" smallint,
  "page_id" bigint,
  "category_id" uuid,
  "ad_uid" uuid,
  "device_type" character varying(20),
  "language_code" character varying(20),
  "state_code" character(2),
  "cpm_cents" integer,
  CONSTRAINT "ad_events_type_chk" CHECK (((event_type)::text = ANY ((ARRAY['request'::character varying, 'eligible'::character varying, 'served'::character varying, 'impression'::character varying, 'click'::character varying])::text[]))),
  CONSTRAINT "ad_events_2026_12_pkey" PRIMARY KEY (id, event_time)
);
CREATE TABLE IF NOT EXISTS public."ad_events_2027_01" (
  "id" bigint NOT NULL DEFAULT nextval('ad_events_id_seq'::regclass),
  "event_time" timestamp with time zone NOT NULL DEFAULT now(),
  "event_type" character varying(20) NOT NULL,
  "request_id" uuid NOT NULL,
  "tracking_id" uuid,
  "campaign_id" bigint,
  "creative_id" bigint,
  "placement_id" smallint,
  "page_id" bigint,
  "category_id" uuid,
  "ad_uid" uuid,
  "device_type" character varying(20),
  "language_code" character varying(20),
  "state_code" character(2),
  "cpm_cents" integer,
  CONSTRAINT "ad_events_type_chk" CHECK (((event_type)::text = ANY ((ARRAY['request'::character varying, 'eligible'::character varying, 'served'::character varying, 'impression'::character varying, 'click'::character varying])::text[]))),
  CONSTRAINT "ad_events_2027_01_pkey" PRIMARY KEY (id, event_time)
);
CREATE TABLE IF NOT EXISTS public."ad_exchange_partners" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "protocol" text NOT NULL DEFAULT 'openrtb'::text,
  "endpoint" text,
  "status" text DEFAULT 'active'::text,
  "revenue_share" double precision,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "ad_exchange_partners_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ad_experiment_variants" (
  "id" bigint NOT NULL DEFAULT nextval('ad_experiment_variants_id_seq'::regclass),
  "experiment_id" bigint NOT NULL,
  "creative_id" bigint NOT NULL,
  "weight" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ad_experiment_variants_weight_check" CHECK ((weight > 0)),
  CONSTRAINT "ad_experiment_variants_pkey" PRIMARY KEY (id),
  CONSTRAINT "ad_experiment_variants_experiment_id_creative_id_key" UNIQUE (experiment_id, creative_id)
);
CREATE TABLE IF NOT EXISTS public."ad_experiments" (
  "id" bigint NOT NULL DEFAULT nextval('ad_experiments_id_seq'::regclass),
  "campaign_id" bigint NOT NULL,
  "name" character varying(200) NOT NULL,
  "status" character varying(20) NOT NULL DEFAULT 'active'::character varying,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ad_experiments_status_chk" CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'paused'::character varying, 'completed'::character varying])::text[]))),
  CONSTRAINT "ad_experiments_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ad_frequency" (
  "ad_uid" uuid NOT NULL,
  "campaign_id" bigint NOT NULL,
  "frequency_date" date NOT NULL,
  "impressions" integer NOT NULL DEFAULT 0,
  CONSTRAINT "ad_frequency_impressions_check" CHECK ((impressions >= 0)),
  CONSTRAINT "ad_frequency_pkey" PRIMARY KEY (ad_uid, campaign_id, frequency_date)
);
CREATE TABLE IF NOT EXISTS public."ad_groups" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "campaign_id" uuid NOT NULL,
  "name" text NOT NULL,
  "budget" double precision,
  "placements" text[],
  "targeting" jsonb NOT NULL,
  "delivery_type" text DEFAULT 'standard'::text,
  "frequency_capping" jsonb,
  "status" text DEFAULT 'draft'::text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "ad_groups_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ad_leads" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "campaign_id" uuid NOT NULL,
  "first_name" text,
  "last_name" text,
  "email" text,
  "phone" text,
  "source" text NOT NULL,
  "status" text DEFAULT 'new'::text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "ad_leads_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ad_markers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "content_ref" uuid,
  "position" double precision NOT NULL DEFAULT 0,
  "type" text NOT NULL DEFAULT 'ad'::text,
  "duration" integer NOT NULL DEFAULT 0,
  "enabled" boolean DEFAULT true,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "creative_v2_id" bigint,
  CONSTRAINT "ad_markers_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ad_placements" (
  "id" smallint NOT NULL DEFAULT nextval('ad_placements_id_seq'::regclass),
  "code" character varying(50) NOT NULL,
  "name" character varying(100) NOT NULL,
  "max_per_page" smallint NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "description" text,
  CONSTRAINT "ad_placements_pkey" PRIMARY KEY (id),
  CONSTRAINT "ad_placements_code_key" UNIQUE (code)
);
CREATE TABLE IF NOT EXISTS public."ad_rate_card" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "placement_key" text NOT NULL,
  "model" text NOT NULL DEFAULT 'cpm'::text,
  "cpm_cents" integer NOT NULL DEFAULT 1000,
  "currency" text NOT NULL DEFAULT 'USD'::text,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ad_rate_card_pkey" PRIMARY KEY (id),
  CONSTRAINT "ad_rate_card_placement_key_key" UNIQUE (placement_key)
);
CREATE TABLE IF NOT EXISTS public."ad_rate_card_items" (
  "id" bigint NOT NULL DEFAULT nextval('ad_rate_card_items_id_seq'::regclass),
  "rate_card_id" smallint NOT NULL,
  "tier_id" smallint NOT NULL,
  "placement_id" smallint NOT NULL,
  "cpm_cents" integer NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "ad_rate_card_items_cpm_cents_check" CHECK ((cpm_cents >= 0)),
  CONSTRAINT "ad_rate_card_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "ad_rate_card_items_rate_card_id_tier_id_placement_id_key" UNIQUE (rate_card_id, tier_id, placement_id)
);
CREATE TABLE IF NOT EXISTS public."ad_rate_cards" (
  "id" smallint NOT NULL DEFAULT nextval('ad_rate_cards_id_seq'::regclass),
  "name" character varying(100) NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ad_rate_cards_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ad_tiers" (
  "id" smallint NOT NULL DEFAULT nextval('ad_tiers_id_seq'::regclass),
  "code" character varying(20) NOT NULL,
  "name" character varying(50) NOT NULL,
  "priority" smallint NOT NULL,
  "max_ads_per_page" smallint NOT NULL,
  "frequency_cap_daily" smallint NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "ad_tiers_pkey" PRIMARY KEY (id),
  CONSTRAINT "ad_tiers_code_key" UNIQUE (code)
);
CREATE TABLE IF NOT EXISTS public."add_ons" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "title" text NOT NULL,
  "price" text,
  "icon" text DEFAULT 'Sparkles'::text,
  "order" integer DEFAULT 0,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  "tenant_id" uuid NOT NULL,
  CONSTRAINT "add_ons_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."admin_impersonation_sessions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "admin_actor_id" uuid,
  "admin_email" text NOT NULL,
  "admin_staff_id" uuid,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "target_label" text,
  "target_auth_user_id" text,
  "reason" text NOT NULL,
  "status" text NOT NULL,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "ended_at" timestamp with time zone,
  "ended_by" text,
  "ip_address" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "admin_impersonation_sessions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."admin_manual_overrides" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "override_type" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" text NOT NULL,
  "target_label" text,
  "field" text NOT NULL,
  "before_value" jsonb,
  "after_value" jsonb,
  "reason" text NOT NULL,
  "actor_id" uuid,
  "actor_email" text,
  "reverts_override_id" uuid,
  "ip_address" text,
  "applied_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "admin_manual_overrides_reason_check" CHECK ((btrim(reason) <> ''::text)),
  CONSTRAINT "admin_manual_overrides_override_type_check" CHECK ((override_type = ANY (ARRAY['price'::text, 'commission'::text, 'kpi'::text, 'status'::text, 'hold'::text]))),
  CONSTRAINT "admin_manual_overrides_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ai_ab_assignments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "test_id" uuid NOT NULL,
  "subject_key" text NOT NULL,
  "variant" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ai_ab_assignments_variant_check" CHECK ((variant = ANY (ARRAY['control'::text, 'variant'::text]))),
  CONSTRAINT "ai_ab_assignments_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ai_ab_tests" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "prompt_id" uuid,
  "control_prompt" text NOT NULL DEFAULT ''::text,
  "variant_prompt" text NOT NULL DEFAULT ''::text,
  "traffic_split" integer NOT NULL DEFAULT 50,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ai_ab_tests_traffic_split_check" CHECK (((traffic_split >= 0) AND (traffic_split <= 100))),
  CONSTRAINT "ai_ab_tests_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'running'::text, 'paused'::text, 'completed'::text]))),
  CONSTRAINT "ai_ab_tests_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ai_agents" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "capabilities" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'active'::text,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ai_agents_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'disabled'::text]))),
  CONSTRAINT "ai_agents_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ai_budget_alerts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "period" text NOT NULL,
  "limit_usd" numeric(14,2) NOT NULL,
  "observed_spend" numeric(14,2) NOT NULL,
  "notified_count" integer NOT NULL DEFAULT 0,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ai_budget_alerts_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ai_disclosures" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "tag" text NOT NULL,
  "audience" text NOT NULL,
  "title" text,
  "body" text,
  "version" integer NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'active'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ai_disclosures_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ai_intent_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "actor_auth_user_id" uuid,
  "actor_lens" text NOT NULL,
  "grant_id" uuid,
  "agent_id" text NOT NULL DEFAULT 'pawzsly'::text,
  "agent_version" text,
  "capability_code" text NOT NULL,
  "object_type" text NOT NULL,
  "object_id" text,
  "from_state" text,
  "to_state" text,
  "purpose_code" text NOT NULL,
  "tool_name" text,
  "result" text NOT NULL,
  "denial_code" text,
  "denial_reason" text,
  "token_id" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ai_intent_events_result_check" CHECK ((result = ANY (ARRAY['allowed'::text, 'denied'::text, 'executed'::text, 'failed'::text, 'guest_deferred'::text]))),
  CONSTRAINT "ai_intent_events_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ai_mcp_connections" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "name" text NOT NULL,
  "endpoint_url" text NOT NULL,
  "transport" text NOT NULL DEFAULT 'http'::text,
  "status" text NOT NULL DEFAULT 'registered'::text,
  "last_checked_at" timestamp with time zone,
  "last_check_ok" boolean,
  "last_latency_ms" integer,
  "last_error" text,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ai_mcp_connections_status_check" CHECK ((status = ANY (ARRAY['registered'::text, 'connected'::text, 'unreachable'::text, 'disabled'::text]))),
  CONSTRAINT "ai_mcp_connections_transport_check" CHECK ((transport = ANY (ARRAY['http'::text, 'sse'::text, 'stdio'::text]))),
  CONSTRAINT "ai_mcp_connections_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ai_purposes" (
  "tenant_id" uuid,
  "purpose_code" text NOT NULL,
  "display_name" text NOT NULL,
  "allowed_capabilities" text[] NOT NULL DEFAULT '{}'::text[],
  "allowed_objects" text[] NOT NULL DEFAULT '{}'::text[],
  "audit_posture" text NOT NULL DEFAULT 'always'::text,
  "description" text NOT NULL DEFAULT ''::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ai_purposes_audit_posture_check" CHECK ((audit_posture = ANY (ARRAY['always'::text, 'sampled'::text]))),
  CONSTRAINT "ai_purposes_pkey" PRIMARY KEY (purpose_code)
);
CREATE TABLE IF NOT EXISTS public."ai_tasks" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "function" text NOT NULL,
  "subject_type" text,
  "subject_id" uuid,
  "model_id" uuid,
  "prompt_id" uuid,
  "input" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "output" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "output_text" text,
  "state" text NOT NULL DEFAULT 'proposed'::text,
  "decided_by" uuid,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ai_tasks_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."analytics_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "event_name" text NOT NULL,
  "event_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "page_path" text NOT NULL DEFAULT ''::text,
  "session_id" text NOT NULL DEFAULT ''::text,
  "value" numeric(12,2),
  "currency" text NOT NULL DEFAULT 'USD'::text,
  CONSTRAINT "analytics_events_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."analytics_export_runs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "definition_id" uuid,
  "definition_name" text NOT NULL,
  "schedule" text,
  "status" text NOT NULL,
  "row_count" integer,
  "truncated" boolean NOT NULL DEFAULT false,
  "csv_text" text,
  "error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "analytics_export_runs_status_check" CHECK ((status = ANY (ARRAY['succeeded'::text, 'failed'::text]))),
  CONSTRAINT "analytics_export_runs_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."api_keys" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid,
  "label" text NOT NULL DEFAULT ''::text,
  "key_prefix" text NOT NULL,
  "key_hash" text NOT NULL,
  "tier" text NOT NULL DEFAULT 'partner'::text,
  "status" text NOT NULL DEFAULT 'active'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "api_keys_pkey" PRIMARY KEY (id),
  CONSTRAINT "api_keys_key_hash_key" UNIQUE (key_hash)
);
CREATE TABLE IF NOT EXISTS public."app_password_credentials" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "display_name" text,
  "active" boolean NOT NULL DEFAULT true,
  "last_login_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "app_password_credentials_pkey" PRIMARY KEY (id),
  CONSTRAINT "app_password_credentials_email_key" UNIQUE (email)
);
CREATE TABLE IF NOT EXISTS public."app_settings" (
  "key" text NOT NULL,
  "value" jsonb NOT NULL,
  "description" text,
  "updated_at" timestamp with time zone DEFAULT now(),
  "updated_by" text,
  CONSTRAINT "app_settings_pkey" PRIMARY KEY (key)
);
CREATE TABLE IF NOT EXISTS public."attribute_values" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "attribute_id" uuid NOT NULL,
  "value" text NOT NULL,
  "slug" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "attribute_values_pkey" PRIMARY KEY (id),
  CONSTRAINT "attribute_values_attribute_id_slug_key" UNIQUE (attribute_id, slug)
);
CREATE TABLE IF NOT EXISTS public."attributes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "data_type" text NOT NULL DEFAULT 'enum'::text,
  "unit" text,
  "is_variant_axis" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "attributes_data_type_check" CHECK ((data_type = ANY (ARRAY['enum'::text, 'text'::text, 'number'::text, 'boolean'::text]))),
  CONSTRAINT "attributes_pkey" PRIMARY KEY (id),
  CONSTRAINT "attributes_tenant_id_slug_key" UNIQUE (tenant_id, slug)
);
CREATE TABLE IF NOT EXISTS public."availability" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "staffId" text,
  "date" text,
  "startTime" text,
  "endTime" text,
  "status" text DEFAULT 'open'::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "tenant_id" uuid NOT NULL,
  CONSTRAINT "availability_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."bank_accounts" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "account_id" uuid NOT NULL,
  "account_number" text,
  "bank_name" text,
  "bank_branch" text,
  "currency" text NOT NULL DEFAULT 'USD'::text,
  "opening_balance" numeric(18,4) NOT NULL DEFAULT 0,
  "stripe_financial_connection_id" text,
  "stripe_account_id" text,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "bank_accounts_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."bank_transactions" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "bank_account_id" uuid NOT NULL,
  "date" date NOT NULL,
  "type" text NOT NULL,
  "amount" numeric(18,4) NOT NULL,
  "description" text,
  "reference" text,
  "payee" text,
  "is_reconciled" boolean NOT NULL DEFAULT false,
  "reconciled_at" timestamp with time zone,
  "reconciliation_id" uuid,
  "matched_journal_id" uuid,
  "matched_account_id" uuid,
  "is_matched" boolean NOT NULL DEFAULT false,
  "stripe_transaction_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "bank_transactions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."bill_items" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "bill_id" uuid NOT NULL,
  "product_id" text,
  "inventory_item_id" text,
  "account_id" uuid NOT NULL,
  "tax_id" uuid,
  "description" text,
  "quantity" numeric(18,4) NOT NULL DEFAULT 1,
  "unit_price" numeric(18,4) NOT NULL DEFAULT 0,
  "discount" numeric(18,4) NOT NULL DEFAULT 0,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "bill_items_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."bills" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "number" text NOT NULL,
  "vendor_id" text NOT NULL,
  "issue_date" date NOT NULL,
  "due_date" date,
  "status" bill_status NOT NULL DEFAULT 'draft'::bill_status,
  "currency" text NOT NULL DEFAULT 'USD'::text,
  "exchange_rate" numeric(18,8) NOT NULL DEFAULT 1.0,
  "subtotal" numeric(18,4) NOT NULL DEFAULT 0,
  "tax_total" numeric(18,4) NOT NULL DEFAULT 0,
  "total" numeric(18,4) NOT NULL DEFAULT 0,
  "amount_paid" numeric(18,4) NOT NULL DEFAULT 0,
  "ap_account_id" uuid,
  "notes" text,
  "journal_id" uuid,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "bills_pkey" PRIMARY KEY (id),
  CONSTRAINT "bills_tenant_id_number_key" UNIQUE (tenant_id, number)
);
CREATE TABLE IF NOT EXISTS public."blocked_times" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "date" text,
  "startTime" text,
  "endTime" text,
  "reason" text,
  "staffId" text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "tenant_id" uuid NOT NULL,
  CONSTRAINT "blocked_times_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."brand_opt_outs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "brand_id" uuid NOT NULL,
  "strength" text NOT NULL,
  "status" text NOT NULL DEFAULT 'filed'::text,
  "claimant_name" text NOT NULL,
  "claimant_email" text NOT NULL,
  "claimant_phone" text,
  "claimant_company" text,
  "is_agent" boolean NOT NULL DEFAULT false,
  "represented_owner" text,
  "trademark_registration" text,
  "attestation_authority" boolean NOT NULL DEFAULT false,
  "attestation_accuracy" boolean NOT NULL DEFAULT false,
  "signature_text" text,
  "signed_at" timestamp with time zone,
  "claim_ticket_ref" text,
  "details" text,
  "verified_by" text,
  "verified_at" timestamp with time zone,
  "applied_at" timestamp with time zone,
  "decision_reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "trademark_verification_status" text DEFAULT 'pending_review'::text,
  "trademark_verified_by" text,
  "trademark_verified_at" timestamp with time zone,
  "trademark_verification_notes" text,
  CONSTRAINT "brand_opt_outs_status_check" CHECK ((status = ANY (ARRAY['filed'::text, 'verified'::text, 'applied'::text, 'rejected'::text, 'withdrawn'::text]))),
  CONSTRAINT "brand_opt_outs_strength_check" CHECK ((strength = ANY (ARRAY['by_approval'::text, 'ever'::text]))),
  CONSTRAINT "brand_opt_outs_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."brand_placements" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "brand_id" uuid NOT NULL,
  "node_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "published_at" timestamp with time zone,
  "unpublished_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "brand_placements_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'unpublished'::text]))),
  CONSTRAINT "brand_placements_pkey" PRIMARY KEY (id),
  CONSTRAINT "brand_placements_brand_id_node_id_key" UNIQUE (brand_id, node_id)
);
CREATE TABLE IF NOT EXISTS public."brand_profiles" (
  "tenant_id" uuid NOT NULL,
  "brand_summary" text,
  "brand_colors" text,
  "brand_voice" text,
  "prompt_guidance" text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" uuid,
  CONSTRAINT "brand_profiles_pkey" PRIMARY KEY (tenant_id)
);
CREATE TABLE IF NOT EXISTS public."brands" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "logo_url" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "description" text,
  "website" text,
  "pricing_tier" text,
  "owner_seller_id" uuid,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "published_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "product_count" integer DEFAULT 0,
  "wholesale_confirmed" boolean DEFAULT false,
  "trademark_registration" text,
  "trademark_verification_status" text DEFAULT 'not_submitted'::text,
  "trademark_verified_by" text,
  "trademark_verified_at" timestamp with time zone,
  "trademark_verification_notes" text,
  CONSTRAINT "brands_pkey" PRIMARY KEY (id),
  CONSTRAINT "brands_slug_tenant_id_key" UNIQUE (slug, tenant_id)
);
CREATE TABLE IF NOT EXISTS public."canonical_products" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "sku_slug" character varying(255) NOT NULL,
  "name" character varying(255) NOT NULL,
  "category" character varying(100) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT "canonical_products_pkey" PRIMARY KEY (id),
  CONSTRAINT "canonical_products_sku_slug_key" UNIQUE (sku_slug)
);
CREATE TABLE IF NOT EXISTS public."capabilities" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "case_id" uuid NOT NULL,
  "capability" text NOT NULL,
  "jurisdiction" text NOT NULL,
  "status" text NOT NULL DEFAULT 'UNVERIFIED'::text,
  "license_no" text,
  "expires_at" timestamp with time zone,
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "capabilities_pkey" PRIMARY KEY (id),
  CONSTRAINT "capabilities_case_id_capability_jurisdiction_key" UNIQUE (case_id, capability, jurisdiction)
);
CREATE TABLE IF NOT EXISTS public."cart_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "cart_id" uuid NOT NULL,
  "tenant_id" uuid,
  "product_variant_id" uuid,
  "supplier_catalog_variant_id" uuid,
  "design_publication_id" uuid,
  "quantity" integer NOT NULL DEFAULT 1,
  "unit_price" numeric(10,2),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cart_items_quantity_check" CHECK ((quantity > 0)),
  CONSTRAINT "cart_items_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."carts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "customer_id" uuid,
  "session_id" text,
  "status" text NOT NULL DEFAULT 'active'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "carts_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'converted'::text, 'abandoned'::text]))),
  CONSTRAINT "carts_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."catalog_bundle_components" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "bundle_id" uuid NOT NULL,
  "catalog_item_id" uuid NOT NULL,
  "sku_id" uuid,
  "quantity" integer NOT NULL DEFAULT 1,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "catalog_bundle_components_quantity_check" CHECK ((quantity > 0)),
  CONSTRAINT "catalog_bundle_components_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."catalog_bundles" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "catalog_bundles_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text]))),
  CONSTRAINT "catalog_bundles_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."catalog_gtins" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "catalog_item_id" uuid NOT NULL,
  "gtin" text NOT NULL,
  "gtin_type" text NOT NULL,
  "is_primary" boolean NOT NULL DEFAULT true,
  "source" text NOT NULL DEFAULT 'admin'::text,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "catalog_gtins_source_check" CHECK ((source = ANY (ARRAY['admin'::text, 'seller'::text, 'import'::text, 'supplier_feed'::text]))),
  CONSTRAINT "catalog_gtins_gtin_check" CHECK ((gtin ~ '^[0-9]{8}$|^[0-9]{12}$|^[0-9]{13}$|^[0-9]{14}$'::text)),
  CONSTRAINT "catalog_gtins_gtin_type_check" CHECK ((gtin_type = ANY (ARRAY['GTIN-8'::text, 'UPC-A'::text, 'GTIN-13'::text, 'GTIN-14'::text]))),
  CONSTRAINT "catalog_gtins_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."catalog_listing_overrides" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "supplier_catalog_product_id" uuid NOT NULL,
  "name" text,
  "description" text,
  "price" numeric(10,2),
  "category_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "catalog_listing_overrides_pkey" PRIMARY KEY (id),
  CONSTRAINT "catalog_listing_overrides_tenant_id_supplier_catalog_produc_key" UNIQUE (tenant_id, supplier_catalog_product_id)
);
CREATE TABLE IF NOT EXISTS public."categories" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "parent_id" uuid,
  "level" smallint NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "landing" text,
  CONSTRAINT "categories_level_check" CHECK (((level >= 1) AND (level <= 5))),
  CONSTRAINT "categories_pkey" PRIMARY KEY (id),
  CONSTRAINT "categories_slug_tenant_id_key" UNIQUE (slug, tenant_id)
);
CREATE TABLE IF NOT EXISTS public."chargeback_details" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "ticket_id" uuid NOT NULL,
  "dispute_id" text,
  "processor" text,
  "amount" numeric(12,2),
  "processor_deadline_at" timestamp with time zone,
  "evidence_package_ref" text,
  "outcome" text,
  "outcome_at" timestamp with time zone,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "chargeback_details_pkey" PRIMARY KEY (id),
  CONSTRAINT "chargeback_details_ticket_key" UNIQUE (ticket_id)
);
CREATE TABLE IF NOT EXISTS public."chart_of_accounts" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "type" account_type NOT NULL,
  "subtype" text,
  "currency" text NOT NULL DEFAULT 'USD'::text,
  "description" text,
  "is_system" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "opening_balance" numeric(18,4) NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY (id),
  CONSTRAINT "chart_of_accounts_tenant_id_code_key" UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS public."checkouts" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "slug" text NOT NULL,
  "customer_id" text,
  "invoice_id" text,
  "amount" numeric(18,4) NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD'::text,
  "description" text,
  "status" checkout_status NOT NULL DEFAULT 'active'::checkout_status,
  "expires_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "payment_id" text,
  "provider" text,
  "provider_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "checkouts_pkey" PRIMARY KEY (id),
  CONSTRAINT "checkouts_slug_key" UNIQUE (slug)
);
CREATE TABLE IF NOT EXISTS public."cms_audience_segments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "rules" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "trigger_logic" text NOT NULL DEFAULT 'all'::text,
  "match_count" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'active'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_audience_segments_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."cms_audit_log" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "event_id" text NOT NULL,
  "action" text NOT NULL,
  "entity" text NOT NULL,
  "entity_id" text,
  "user_id" text,
  "user_role" text,
  "ip_address" text,
  "mfa_method" text,
  "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_audit_log_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."cms_banners" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "banner_type" text NOT NULL DEFAULT 'hero'::text,
  "headline" text,
  "subheadline" text,
  "body" text,
  "image_url" text,
  "mobile_image_url" text,
  "cta_label" text,
  "cta_url" text,
  "background_color" text,
  "text_color" text,
  "placement" text NOT NULL DEFAULT 'home'::text,
  "target_page_id" uuid,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "dismissible" boolean NOT NULL DEFAULT false,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_banners_check" CHECK (((ends_at IS NULL) OR (starts_at IS NULL) OR (ends_at > starts_at))),
  CONSTRAINT "cms_banners_placement_check" CHECK ((placement = ANY (ARRAY['home'::text, 'all_pages'::text, 'services'::text, 'booking'::text, 'portal'::text, 'custom'::text]))),
  CONSTRAINT "cms_banners_banner_type_check" CHECK ((banner_type = ANY (ARRAY['hero'::text, 'promo_bar'::text, 'popup'::text, 'inline'::text, 'footer'::text, 'alert'::text]))),
  CONSTRAINT "cms_banners_pkey" PRIMARY KEY (id),
  CONSTRAINT "cms_banners_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."cms_block_schemas" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "component_type" text NOT NULL,
  "version" text NOT NULL DEFAULT '1.0.0'::text,
  "label" text NOT NULL,
  "description" text,
  "fields" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "zod_schema" text,
  "allowed_slots" text[] NOT NULL DEFAULT '{}'::text[],
  "icon" text,
  "status" text NOT NULL DEFAULT 'active'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_block_schemas_pkey" PRIMARY KEY (id),
  CONSTRAINT "cms_block_schemas_tenant_id_component_type_version_key" UNIQUE (tenant_id, component_type, version)
);
CREATE TABLE IF NOT EXISTS public."cms_bundle_rules" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "product_ids" text[] NOT NULL DEFAULT '{}'::text[],
  "required_qty" integer NOT NULL DEFAULT 1,
  "discount_type" text NOT NULL,
  "discount_value" numeric(10,2) NOT NULL DEFAULT 0,
  "label" text,
  "active" boolean NOT NULL DEFAULT true,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_bundle_rules_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."cms_campaigns" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "campaign_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "content_block_ids" text[] NOT NULL DEFAULT '{}'::text[],
  "target_segment_ids" text[] NOT NULL DEFAULT '{}'::text[],
  "start_date" timestamp with time zone,
  "end_date" timestamp with time zone,
  "schedule_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "metrics" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_campaigns_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."cms_cart_thresholds" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "threshold_type" text NOT NULL,
  "amount" numeric(10,2) NOT NULL,
  "reward_type" text NOT NULL,
  "reward_value" numeric(10,2) NOT NULL DEFAULT 0,
  "label" text NOT NULL,
  "progress_message" text,
  "achieved_message" text,
  "tiers" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "active" boolean NOT NULL DEFAULT true,
  "locale" text NOT NULL DEFAULT 'en-US'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_cart_thresholds_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."cms_cdn_profiles" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "breakpoints" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "default_format" text NOT NULL DEFAULT 'webp'::text,
  "lazy_load" boolean NOT NULL DEFAULT true,
  "placeholder" text NOT NULL DEFAULT 'blur'::text,
  "status" text NOT NULL DEFAULT 'active'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_cdn_profiles_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."cms_component_analytics" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "component_id" text NOT NULL,
  "page_route" text NOT NULL,
  "date" date NOT NULL DEFAULT CURRENT_DATE,
  "impressions" integer NOT NULL DEFAULT 0,
  "clicks" integer NOT NULL DEFAULT 0,
  "hover_count" integer NOT NULL DEFAULT 0,
  "conversion_count" integer NOT NULL DEFAULT 0,
  "conversion_rate" real NOT NULL DEFAULT 0,
  "avg_time_in_component" real,
  CONSTRAINT "cms_component_analytics_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."cms_content_blocks" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "block_id" text NOT NULL,
  "schema_id" uuid,
  "component_type" text NOT NULL,
  "props" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "slot_id" text,
  "page_id" uuid,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "locale" text NOT NULL DEFAULT 'en-US'::text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "scheduled_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_content_blocks_pkey" PRIMARY KEY (id),
  CONSTRAINT "cms_content_blocks_tenant_id_block_id_key" UNIQUE (tenant_id, block_id)
);
CREATE TABLE IF NOT EXISTS public."cms_design_tokens" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "category" text NOT NULL,
  "token_key" text NOT NULL,
  "token_value" text NOT NULL,
  "label" text,
  "scope" text NOT NULL DEFAULT 'global'::text,
  "locale" text NOT NULL DEFAULT 'en-US'::text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'active'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_design_tokens_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."cms_fallback_pages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "error_code" integer NOT NULL,
  "title" text NOT NULL,
  "content" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "template" text NOT NULL DEFAULT 'default'::text,
  "locale" text NOT NULL DEFAULT 'en-US'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_fallback_pages_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."cms_funnel_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "session_id" text NOT NULL,
  "customer_id" text,
  "stage" text NOT NULL,
  "page_route" text,
  "component_id" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_funnel_events_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."cms_galleries" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "gallery_type" text NOT NULL DEFAULT 'before_after'::text,
  "page_id" uuid,
  "is_published" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_galleries_gallery_type_check" CHECK ((gallery_type = ANY (ARRAY['before_after'::text, 'portfolio'::text, 'facility'::text, 'team'::text, 'general'::text]))),
  CONSTRAINT "cms_galleries_pkey" PRIMARY KEY (id),
  CONSTRAINT "cms_galleries_tenant_id_slug_key" UNIQUE (tenant_id, slug),
  CONSTRAINT "cms_galleries_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."cms_gallery_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "gallery_id" uuid NOT NULL,
  "image_url" text NOT NULL,
  "before_image_url" text,
  "caption" text,
  "alt_text" text,
  "dependent_id" uuid,
  "staff_id" uuid,
  "service_id" uuid,
  "consent_on_file" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_published" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_gallery_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "cms_gallery_items_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."cms_global_content" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "content_key" text NOT NULL,
  "label" text NOT NULL,
  "value_text" text,
  "value_json" jsonb,
  "content_group" text NOT NULL DEFAULT 'general'::text,
  "locale" text NOT NULL DEFAULT 'en-US'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_global_content_content_group_check" CHECK ((content_group = ANY (ARRAY['general'::text, 'contact'::text, 'social'::text, 'hours'::text, 'footer'::text, 'email_template'::text, 'sms_template'::text, 'legal'::text]))),
  CONSTRAINT "cms_global_content_pkey" PRIMARY KEY (id),
  CONSTRAINT "cms_global_content_tenant_id_content_key_locale_key" UNIQUE (tenant_id, content_key, locale)
);
CREATE TABLE IF NOT EXISTS public."cms_global_copy" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "copy_key" text NOT NULL,
  "copy_value" text NOT NULL,
  "locale" text NOT NULL DEFAULT 'en-US'::text,
  "context" text,
  "status" text NOT NULL DEFAULT 'active'::text,
  "translation_confidence" real,
  "last_synced_at" timestamp with time zone,
  "created_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_global_copy_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."cms_integrations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "integration_type" text NOT NULL,
  "provider" text,
  "api_key_encrypted" text,
  "webhook_url" text,
  "webhook_secret" text,
  "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'inactive'::text,
  "last_used_at" timestamp with time zone,
  "last_sync_at" timestamp with time zone,
  "created_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_integrations_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."cms_locales" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "locale_code" text NOT NULL,
  "language" text NOT NULL,
  "currency_code" text NOT NULL DEFAULT 'USD'::text,
  "currency_symbol" text NOT NULL DEFAULT '$'::text,
  "currency_position" text NOT NULL DEFAULT 'before'::text,
  "status" text NOT NULL DEFAULT 'active'::text,
  "is_default" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_locales_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."cms_media_assets" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "media_id" text NOT NULL,
  "url" text NOT NULL,
  "cdn_url" text,
  "mime_type" text NOT NULL,
  "file_size" bigint,
  "width" integer,
  "height" integer,
  "alt_text" text,
  "title" text,
  "caption" text,
  "source" text NOT NULL DEFAULT 'upload'::text,
  "source_prompt" text,
  "tags" text[] NOT NULL DEFAULT '{}'::text[],
  "category_id" uuid,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'active'::text,
  "created_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_media_assets_pkey" PRIMARY KEY (id),
  CONSTRAINT "cms_media_assets_tenant_id_media_id_key" UNIQUE (tenant_id, media_id)
);
CREATE TABLE IF NOT EXISTS public."cms_media_taxonomy" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "taxonomy_type" text NOT NULL DEFAULT 'category'::text,
  "parent_id" uuid,
  "color" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_media_taxonomy_taxonomy_type_check" CHECK ((taxonomy_type = ANY (ARRAY['category'::text, 'tag'::text, 'collection'::text]))),
  CONSTRAINT "cms_media_taxonomy_pkey" PRIMARY KEY (id),
  CONSTRAINT "cms_media_taxonomy_tenant_id_slug_taxonomy_type_key" UNIQUE (tenant_id, slug, taxonomy_type)
);
CREATE TABLE IF NOT EXISTS public."cms_navigation" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "menu_key" text NOT NULL DEFAULT 'primary'::text,
  "label" text NOT NULL,
  "url" text,
  "page_id" uuid,
  "parent_id" uuid,
  "sort_order" integer NOT NULL DEFAULT 0,
  "opens_new_tab" boolean NOT NULL DEFAULT false,
  "icon" text,
  "visibility" text NOT NULL DEFAULT 'public'::text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_navigation_menu_key_check" CHECK ((menu_key = ANY (ARRAY['primary'::text, 'footer'::text, 'mobile'::text, 'utility'::text, 'portal'::text]))),
  CONSTRAINT "cms_navigation_check" CHECK (((url IS NOT NULL) OR (page_id IS NOT NULL))),
  CONSTRAINT "cms_navigation_visibility_check" CHECK ((visibility = ANY (ARRAY['public'::text, 'authenticated'::text, 'staff_only'::text, 'hidden'::text]))),
  CONSTRAINT "cms_navigation_pkey" PRIMARY KEY (id),
  CONSTRAINT "cms_navigation_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."cms_navigation_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "menu_id" uuid NOT NULL,
  "parent_id" uuid,
  "label" text NOT NULL,
  "href" text NOT NULL,
  "item_type" text NOT NULL DEFAULT 'direct_link'::text,
  "columns" integer NOT NULL DEFAULT 1,
  "slots" text[] NOT NULL DEFAULT '{}'::text[],
  "icon" text,
  "badge" text,
  "badge_color" text,
  "target" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'active'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_navigation_items_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."cms_navigation_menus" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "location" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active'::text,
  "locale" text NOT NULL DEFAULT 'en-US'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_navigation_menus_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."cms_offers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "offer_type" text NOT NULL,
  "value" numeric(10,2) NOT NULL DEFAULT 0,
  "conditions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "usage_limit" integer,
  "usage_count" integer NOT NULL DEFAULT 0,
  "per_customer_limit" integer NOT NULL DEFAULT 1,
  "stackable" boolean NOT NULL DEFAULT false,
  "created_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_offers_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."cms_page_revisions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "page_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "blocks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "change_note" text,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_page_revisions_version_check" CHECK ((version >= 1)),
  CONSTRAINT "cms_page_revisions_pkey" PRIMARY KEY (id),
  CONSTRAINT "cms_page_revisions_tenant_id_page_id_version_key" UNIQUE (tenant_id, page_id, version)
);
CREATE TABLE IF NOT EXISTS public."cms_pages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "page_type" text NOT NULL DEFAULT 'standard'::text,
  "body" text,
  "body_format" text NOT NULL DEFAULT 'richtext'::text,
  "blocks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "excerpt" text,
  "featured_image_url" text,
  "parent_page_id" uuid,
  "sort_order" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "published_at" timestamp with time zone,
  "scheduled_for" timestamp with time zone,
  "version" integer NOT NULL DEFAULT 1,
  "requires_acceptance" boolean NOT NULL DEFAULT false,
  "policy_effective_date" date,
  "locale" text NOT NULL DEFAULT 'en-US'::text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_pages_version_check" CHECK ((version >= 1)),
  CONSTRAINT "cms_pages_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'in_review'::text, 'scheduled'::text, 'published'::text, 'archived'::text]))),
  CONSTRAINT "cms_pages_page_type_check" CHECK ((page_type = ANY (ARRAY['standard'::text, 'home'::text, 'services'::text, 'about'::text, 'contact'::text, 'policy'::text, 'landing'::text, 'blog_post'::text, 'faq'::text, 'gallery'::text, 'custom'::text]))),
  CONSTRAINT "cms_pages_body_format_check" CHECK ((body_format = ANY (ARRAY['richtext'::text, 'markdown'::text, 'html'::text, 'blocks'::text]))),
  CONSTRAINT "cms_pages_pkey" PRIMARY KEY (id),
  CONSTRAINT "cms_pages_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "cms_pages_tenant_id_slug_locale_key" UNIQUE (tenant_id, slug, locale)
);
CREATE TABLE IF NOT EXISTS public."cms_policy_acceptances" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "page_id" uuid NOT NULL,
  "page_version" integer NOT NULL,
  "customer_id" uuid,
  "user_id" uuid,
  "accepted_at" timestamp with time zone NOT NULL DEFAULT now(),
  "ip_address" inet,
  "user_agent" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_policy_acceptances_page_version_check" CHECK ((page_version >= 1)),
  CONSTRAINT "cms_policy_acceptances_check" CHECK (((customer_id IS NOT NULL) OR (user_id IS NOT NULL))),
  CONSTRAINT "cms_policy_acceptances_pkey" PRIMARY KEY (id),
  CONSTRAINT "cms_policy_acceptances_tenant_id_page_id_page_version_custo_key" UNIQUE (tenant_id, page_id, page_version, customer_id)
);
CREATE TABLE IF NOT EXISTS public."cms_redirects" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "from_url" text NOT NULL,
  "to_url" text NOT NULL,
  "status_code" integer NOT NULL DEFAULT 301,
  "active" boolean NOT NULL DEFAULT true,
  "created_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_redirects_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."cms_seo" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "page_id" uuid,
  "scope" text NOT NULL DEFAULT 'page'::text,
  "meta_title" text,
  "meta_description" text,
  "meta_keywords" text[],
  "canonical_url" text,
  "og_title" text,
  "og_description" text,
  "og_image_url" text,
  "twitter_card" text,
  "robots_index" boolean NOT NULL DEFAULT true,
  "robots_follow" boolean NOT NULL DEFAULT true,
  "structured_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "sitemap_priority" numeric(2,1),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_seo_scope_check" CHECK ((scope = ANY (ARRAY['page'::text, 'site_default'::text]))),
  CONSTRAINT "cms_seo_twitter_card_check" CHECK (((twitter_card IS NULL) OR (twitter_card = ANY (ARRAY['summary'::text, 'summary_large_image'::text])))),
  CONSTRAINT "cms_seo_sitemap_priority_check" CHECK (((sitemap_priority IS NULL) OR ((sitemap_priority >= (0)::numeric) AND (sitemap_priority <= (1)::numeric)))),
  CONSTRAINT "cms_seo_check" CHECK ((((scope = 'page'::text) AND (page_id IS NOT NULL)) OR ((scope = 'site_default'::text) AND (page_id IS NULL)))),
  CONSTRAINT "cms_seo_pkey" PRIMARY KEY (id),
  CONSTRAINT "cms_seo_tenant_id_page_id_key" UNIQUE (tenant_id, page_id)
);
CREATE TABLE IF NOT EXISTS public."cms_slot_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "slot_id" uuid NOT NULL,
  "item_type" text NOT NULL,
  "headline" text,
  "body" text,
  "image_url" text,
  "cta_label" text,
  "cta_url" text,
  "promo_code" text,
  "location_id" uuid,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "sort_order" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_slot_items_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text]))),
  CONSTRAINT "cms_slot_items_item_type_check" CHECK ((item_type = ANY (ARRAY['promo'::text, 'seasonal'::text, 'seo_copy'::text, 'banner'::text]))),
  CONSTRAINT "cms_slot_items_check" CHECK (((ends_at IS NULL) OR (starts_at IS NULL) OR (ends_at > starts_at))),
  CONSTRAINT "cms_slot_items_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."cms_slots" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "slot_key" text NOT NULL,
  "page_type" text NOT NULL,
  "node_id" uuid,
  "max_items" integer NOT NULL DEFAULT 1,
  "description" text,
  CONSTRAINT "cms_slots_pkey" PRIMARY KEY (id),
  CONSTRAINT "cms_slots_tenant_id_slot_key_key" UNIQUE (tenant_id, slot_key)
);
CREATE TABLE IF NOT EXISTS public."cms_versions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "version_number" integer NOT NULL DEFAULT 1,
  "snapshot" jsonb NOT NULL,
  "label" text,
  "change_description" text,
  "environment" text NOT NULL DEFAULT 'staging'::text,
  "created_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_versions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."cms_volume_tiers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "offer_id" uuid,
  "tier_name" text NOT NULL,
  "min_qty" integer NOT NULL DEFAULT 1,
  "max_qty" integer,
  "discount_type" text NOT NULL,
  "discount_value" numeric(10,2) NOT NULL DEFAULT 0,
  "label" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_volume_tiers_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."cms_website_settings" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "brand_name" text NOT NULL DEFAULT 'UnSaid Memories'::text,
  "logo_url" text,
  "logo_dark_url" text,
  "favicon_url" text,
  "canonical_origin" text NOT NULL DEFAULT 'https://unsaid-theta.vercel.app'::text,
  "default_locale" text NOT NULL DEFAULT 'en-US'::text,
  "default_currency" text NOT NULL DEFAULT 'USD'::text,
  "gtm_container" text,
  "csp_mode" text NOT NULL DEFAULT 'report-only'::text,
  "seo_defaults" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "social_links" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "cookie_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "maintenance_mode" boolean NOT NULL DEFAULT false,
  "maintenance_message" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "cms_website_settings_pkey" PRIMARY KEY (id),
  CONSTRAINT "cms_website_settings_tenant_id_key" UNIQUE (tenant_id)
);
CREATE TABLE IF NOT EXISTS public."collections" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "type" text NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "framing_copy" text,
  "starts_on" date,
  "ends_on" date,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "parent_id" uuid,
  "owner_id" uuid,
  CONSTRAINT "collections_type_check" CHECK ((type = ANY (ARRAY['holiday'::text, 'relationship'::text, 'theme'::text, 'evergreen'::text]))),
  CONSTRAINT "collections_pkey" PRIMARY KEY (id),
  CONSTRAINT "collections_slug_tenant_id_key" UNIQUE (slug, tenant_id)
);
CREATE TABLE IF NOT EXISTS public."commerce_accounting_mappings" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "mapping_type" text NOT NULL,
  "catalog_item_id" uuid,
  "payment_method_id" uuid,
  "tax_code_id" uuid,
  "revenue_account_id" uuid,
  "inventory_account_id" uuid,
  "cogs_account_id" uuid,
  "cash_account_id" uuid,
  "active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "commerce_accounting_mappings_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_accounting_mappings_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_audit_log" (
  "id" bigint NOT NULL,
  "tenant_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid,
  "before_data" jsonb,
  "after_data" jsonb,
  "request_id" text,
  "correlation_id" text,
  "ip_address" inet,
  "user_agent" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_audit_log_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."commerce_barcodes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "catalog_item_id" uuid NOT NULL,
  "barcode" text NOT NULL,
  "barcode_type" text NOT NULL DEFAULT 'UPC'::text,
  "is_primary" boolean NOT NULL DEFAULT false,
  "active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "commerce_barcodes_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_barcodes_tenant_id_barcode_key" UNIQUE (tenant_id, barcode),
  CONSTRAINT "commerce_barcodes_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_batch_slips" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "warehouse_id" uuid,
  "batch_number" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open'::text,
  "document_uri" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "printed_at" timestamp with time zone,
  CONSTRAINT "commerce_batch_slips_status_allowed" CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'submitted'::text, 'settled'::text, 'reconciled'::text, 'void'::text]))),
  CONSTRAINT "commerce_batch_slips_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_batch_slips_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "commerce_batch_slips_tenant_id_batch_number_key" UNIQUE (tenant_id, batch_number)
);
CREATE TABLE IF NOT EXISTS public."commerce_branches" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid,
  "crm_location_id" uuid,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "branch_type" text NOT NULL DEFAULT 'retail'::text,
  "timezone" text NOT NULL DEFAULT 'America/Chicago'::text,
  "currency" character(3) NOT NULL DEFAULT 'USD'::bpchar,
  "address" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "phone" text,
  "email" text,
  "active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_branches_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_branches_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "commerce_branches_tenant_id_code_key" UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS public."commerce_brands" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "logo_url" text,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_brands_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_brands_slug_key" UNIQUE (slug)
);
CREATE TABLE IF NOT EXISTS public."commerce_cart_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "cart_id" uuid NOT NULL,
  "line_no" integer NOT NULL,
  "catalog_item_id" uuid,
  "sku_id" uuid,
  "description" text NOT NULL,
  "quantity" numeric(24,6) NOT NULL,
  "unit_price" numeric(24,6) NOT NULL DEFAULT 0,
  "discount_amount" numeric(24,6) NOT NULL DEFAULT 0,
  "tax_amount" numeric(24,6) NOT NULL DEFAULT 0,
  "line_total" numeric(24,6) NOT NULL DEFAULT 0,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "commerce_cart_lines_quantity_check" CHECK ((quantity > (0)::numeric)),
  CONSTRAINT "commerce_cart_lines_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_cart_lines_cart_id_line_no_key" UNIQUE (cart_id, line_no)
);
CREATE TABLE IF NOT EXISTS public."commerce_carts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid,
  "dependent_id" uuid,
  "register_session_id" uuid,
  "channel_id" uuid,
  "status" text NOT NULL DEFAULT 'open'::text,
  "currency" character(3) NOT NULL DEFAULT 'USD'::bpchar,
  "subtotal" numeric(24,6) NOT NULL DEFAULT 0,
  "discount_total" numeric(24,6) NOT NULL DEFAULT 0,
  "tax_total" numeric(24,6) NOT NULL DEFAULT 0,
  "shipping_total" numeric(24,6) NOT NULL DEFAULT 0,
  "total" numeric(24,6) NOT NULL DEFAULT 0,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "abandon_email_sent_at" timestamp with time zone,
  CONSTRAINT "commerce_carts_status_allowed" CHECK ((status = ANY (ARRAY['active'::text, 'abandoned'::text, 'converted'::text, 'expired'::text, 'merged'::text]))),
  CONSTRAINT "commerce_carts_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_carts_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_cash_movements" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "register_session_id" uuid NOT NULL,
  "movement_type" text NOT NULL,
  "amount" numeric(24,6) NOT NULL,
  "reason" text,
  "reference_type" text,
  "reference_id" uuid,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_cash_movements_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_cash_movements_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_catalog_category_map" (
  "catalog_item_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "is_primary" boolean NOT NULL DEFAULT false,
  CONSTRAINT "commerce_catalog_category_map_pkey" PRIMARY KEY (catalog_item_id, category_id)
);
CREATE TABLE IF NOT EXISTS public."commerce_catalog_item_taxonomy" (
  "tenant_id" uuid NOT NULL,
  "item_id" uuid NOT NULL,
  "node_id" text NOT NULL,
  CONSTRAINT "commerce_catalog_item_taxonomy_pkey" PRIMARY KEY (item_id, node_id)
);
CREATE TABLE IF NOT EXISTS public."commerce_catalog_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "sku_id" uuid,
  "service_id" uuid,
  "item_type" text NOT NULL DEFAULT 'product'::text,
  "sku" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "short_description" text,
  "brand" text,
  "unit_of_measure" text NOT NULL DEFAULT 'ea'::text,
  "taxable" boolean NOT NULL DEFAULT true,
  "tax_code_id" uuid,
  "active" boolean NOT NULL DEFAULT true,
  "pos_enabled" boolean NOT NULL DEFAULT true,
  "ecommerce_enabled" boolean NOT NULL DEFAULT false,
  "purchasable" boolean NOT NULL DEFAULT true,
  "sellable" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_catalog_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_catalog_items_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "commerce_catalog_items_tenant_id_sku_key" UNIQUE (tenant_id, sku)
);
CREATE TABLE IF NOT EXISTS public."commerce_categories" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "parent_id" uuid,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "image_url" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  "ecommerce_published" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_categories_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_categories_tenant_id_code_key" UNIQUE (tenant_id, code),
  CONSTRAINT "commerce_categories_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_channel_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "channel_id" uuid,
  "event_type" text NOT NULL,
  "external_event_id" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "processed" boolean NOT NULL DEFAULT false,
  "processed_at" timestamp with time zone,
  "error_message" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_channel_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_channel_events_channel_id_external_event_id_key" UNIQUE (channel_id, external_event_id),
  CONSTRAINT "commerce_channel_events_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_channel_products" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "channel_id" uuid NOT NULL,
  "catalog_item_id" uuid NOT NULL,
  "external_product_id" text,
  "external_variant_id" text,
  "external_url" text,
  "published" boolean NOT NULL DEFAULT false,
  "sync_status" text NOT NULL DEFAULT 'pending'::text,
  "sync_error" text,
  "last_synced_at" timestamp with time zone,
  CONSTRAINT "commerce_channel_products_sync_status_allowed" CHECK ((sync_status = ANY (ARRAY['pending'::text, 'syncing'::text, 'synced'::text, 'failed'::text, 'out_of_sync'::text, 'disabled'::text]))),
  CONSTRAINT "commerce_channel_products_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_channel_products_channel_id_catalog_item_id_key" UNIQUE (channel_id, catalog_item_id),
  CONSTRAINT "commerce_channel_products_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_checkout_sessions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "cart_id" uuid,
  "sale_id" uuid,
  "customer_id" uuid,
  "status" text NOT NULL DEFAULT 'open'::text,
  "amount_due" numeric(24,6) NOT NULL DEFAULT 0,
  "amount_received" numeric(24,6) NOT NULL DEFAULT 0,
  "change_due" numeric(24,6) NOT NULL DEFAULT 0,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone,
  CONSTRAINT "commerce_checkout_sessions_status_allowed" CHECK ((status = ANY (ARRAY['open'::text, 'pending'::text, 'completed'::text, 'expired'::text, 'cancelled'::text, 'failed'::text]))),
  CONSTRAINT "commerce_checkout_sessions_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_checkout_sessions_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_coupon_redemptions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "coupon_id" uuid NOT NULL,
  "sale_id" uuid,
  "customer_id" uuid,
  "discount_amount" numeric(24,6) NOT NULL DEFAULT 0,
  "redeemed_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_coupon_redemptions_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_coupon_redemptions_coupon_id_sale_id_key" UNIQUE (coupon_id, sale_id)
);
CREATE TABLE IF NOT EXISTS public."commerce_coupons" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "promotion_id" uuid,
  "code" text NOT NULL,
  "customer_id" uuid,
  "usage_limit" integer,
  "usage_count" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'active'::text,
  "valid_from" timestamp with time zone,
  "valid_to" timestamp with time zone,
  CONSTRAINT "commerce_coupons_status_allowed" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'expired'::text, 'exhausted'::text, 'cancelled'::text]))),
  CONSTRAINT "commerce_coupons_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_coupons_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "commerce_coupons_tenant_id_code_key" UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS public."commerce_customer_accounts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "price_list_id" uuid,
  "default_payment_method_id" uuid,
  "tax_exempt" boolean NOT NULL DEFAULT false,
  "tax_exemption_number" text,
  "credit_limit" numeric(24,6) NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_customer_accounts_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_customer_accounts_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "commerce_customer_accounts_tenant_id_customer_id_key" UNIQUE (tenant_id, customer_id)
);
CREATE TABLE IF NOT EXISTS public."commerce_customer_addresses" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "address_type" text NOT NULL DEFAULT 'shipping'::text,
  "first_name" text,
  "last_name" text,
  "company" text,
  "line1" text NOT NULL,
  "line2" text,
  "city" text NOT NULL,
  "state" text,
  "postal_code" text,
  "country_code" text NOT NULL DEFAULT 'US'::text,
  "phone" text,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_customer_addresses_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_customer_addresses_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_customer_payment_methods" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "provider" text NOT NULL DEFAULT 'stripe'::text,
  "provider_customer_id" text,
  "provider_token" text NOT NULL,
  "method_type" text NOT NULL DEFAULT 'card'::text,
  "brand" text,
  "last4" text,
  "exp_month" smallint,
  "exp_year" smallint,
  "billing_zip" text,
  "is_default" boolean NOT NULL DEFAULT false,
  "is_verified" boolean NOT NULL DEFAULT false,
  "verified_at" timestamp with time zone,
  "status" text NOT NULL DEFAULT 'active'::text,
  "last_used_at" timestamp with time zone,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_customer_payment_methods_exp_year_check" CHECK (((exp_year IS NULL) OR ((exp_year >= 2000) AND (exp_year <= 2200)))),
  CONSTRAINT "commerce_customer_payment_methods_provider_check" CHECK ((provider = ANY (ARRAY['stripe'::text, 'square'::text, 'adyen'::text, 'authorize_net'::text, 'other'::text]))),
  CONSTRAINT "commerce_customer_payment_methods_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'expired'::text, 'removed'::text, 'failed'::text, 'requires_action'::text]))),
  CONSTRAINT "commerce_customer_payment_methods_exp_month_check" CHECK (((exp_month IS NULL) OR ((exp_month >= 1) AND (exp_month <= 12)))),
  CONSTRAINT "commerce_customer_payment_methods_method_type_check" CHECK ((method_type = ANY (ARRAY['card'::text, 'bank_account'::text, 'wallet'::text, 'link'::text]))),
  CONSTRAINT "commerce_customer_payment_methods_last4_check" CHECK (((last4 IS NULL) OR (last4 ~ '^[0-9]{4}$'::text))),
  CONSTRAINT "commerce_customer_payment_methods_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_customer_payment_met_tenant_id_provider_provider_t_key" UNIQUE (tenant_id, provider, provider_token)
);
CREATE TABLE IF NOT EXISTS public."commerce_departments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "branch_id" uuid,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_departments_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_departments_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "commerce_departments_tenant_id_branch_id_code_key" UNIQUE (tenant_id, branch_id, code)
);
CREATE TABLE IF NOT EXISTS public."commerce_deposits" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "deposit_number" text NOT NULL,
  "customer_id" uuid NOT NULL,
  "dependent_id" uuid,
  "service_id" uuid,
  "appointment_id" uuid,
  "amount" numeric(24,6) NOT NULL,
  "currency" character(3) NOT NULL DEFAULT 'USD'::bpchar,
  "collected_at" timestamp with time zone,
  "method" text,
  "status" text NOT NULL DEFAULT 'held'::text,
  "applied_invoice_id" uuid,
  "payment_id" uuid,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deposit_type" text NOT NULL DEFAULT 'booking'::text,
  "transferred_from_id" uuid,
  "transferred_to_id" uuid,
  "transferred_at" timestamp with time zone,
  "transfer_reason" text,
  CONSTRAINT "commerce_deposits_status_check" CHECK ((status = ANY (ARRAY['held'::text, 'applied'::text, 'released'::text, 'forfeited'::text, 'refunded'::text]))),
  CONSTRAINT "commerce_deposits_amount_check" CHECK ((amount > (0)::numeric)),
  CONSTRAINT "commerce_deposits_deposit_type_check" CHECK ((deposit_type = ANY (ARRAY['booking'::text, 'security'::text, 'package_prepay'::text, 'no_show_hold'::text, 'other'::text]))),
  CONSTRAINT "commerce_deposits_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_deposits_tenant_id_deposit_number_key" UNIQUE (tenant_id, deposit_number),
  CONSTRAINT "commerce_deposits_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_disputes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "dispute_number" text NOT NULL,
  "refund_id" uuid,
  "payment_id" uuid,
  "sale_id" uuid,
  "reason" text,
  "status" text NOT NULL DEFAULT 'open'::text,
  "amount" numeric(24,6) NOT NULL DEFAULT 0,
  "processor_dispute_id" text,
  "opened_at" timestamp with time zone NOT NULL DEFAULT now(),
  "responded_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "evidence_submitted_at" timestamp with time zone,
  "evidence_submitted_by" text,
  "evidence_payload" jsonb,
  "evidence_stripe_status" text,
  CONSTRAINT "commerce_disputes_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'under_review'::text, 'won'::text, 'lost'::text, 'accepted'::text]))),
  CONSTRAINT "commerce_disputes_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_disputes_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "commerce_disputes_tenant_id_dispute_number_key" UNIQUE (tenant_id, dispute_number)
);
CREATE TABLE IF NOT EXISTS public."commerce_event_consumptions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "event_id" uuid NOT NULL,
  "consumer" text NOT NULL,
  "status" text NOT NULL DEFAULT 'consumed'::text,
  "attempts" integer NOT NULL DEFAULT 1,
  "last_error" text,
  "detail" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "consumed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_event_consumptions_status_check" CHECK ((status = ANY (ARRAY['consumed'::text, 'failed'::text]))),
  CONSTRAINT "commerce_event_consumptions_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_event_consumptions_event_id_consumer_key" UNIQUE (event_id, consumer)
);
CREATE TABLE IF NOT EXISTS public."commerce_export_jobs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "export_type" text NOT NULL,
  "period_start" date,
  "period_end" date,
  "status" text NOT NULL DEFAULT 'queued'::text,
  "file_uri" text,
  "row_count" integer NOT NULL DEFAULT 0,
  "error_message" text,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone,
  CONSTRAINT "commerce_export_jobs_status_allowed" CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text, 'expired'::text]))),
  CONSTRAINT "commerce_export_jobs_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_export_jobs_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_fulfillment_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "fulfillment_id" uuid,
  "order_id" uuid,
  "event_type" text NOT NULL,
  "old_status" text,
  "new_status" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_fulfillment_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_fulfillment_events_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_gift_card_designs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "image_url" text NOT NULL,
  "published" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_gift_card_designs_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."commerce_gift_card_transactions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "gift_card_id" uuid NOT NULL,
  "sale_id" uuid,
  "payment_id" uuid,
  "transaction_type" text NOT NULL,
  "amount" numeric(24,6) NOT NULL,
  "balance_before" numeric(24,6) NOT NULL,
  "balance_after" numeric(24,6) NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_gift_card_transactions_amount_check" CHECK ((amount > (0)::numeric)),
  CONSTRAINT "commerce_gift_card_transactions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."commerce_gift_cards" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "card_number" text NOT NULL,
  "customer_id" uuid,
  "purchaser_customer_id" uuid,
  "initial_value" numeric(24,6) NOT NULL DEFAULT 0,
  "balance" numeric(24,6) NOT NULL DEFAULT 0,
  "currency" character(3) NOT NULL DEFAULT 'USD'::bpchar,
  "status" text NOT NULL DEFAULT 'active'::text,
  "issued_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone,
  "card_format" text NOT NULL DEFAULT 'digital'::text,
  "recipient_name" text,
  "recipient_email" text,
  "recipient_phone" text,
  "sender_name" text,
  "gift_message" text,
  "holder_customer_id" uuid,
  "last_used_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "reminder_sent_at" timestamp with time zone,
  "converted_store_credit_id" uuid,
  "replaced_by_id" uuid,
  "replaced_reason" text,
  "design_id" uuid,
  "purchaser_email" text,
  CONSTRAINT "commerce_gift_cards_card_format_check" CHECK ((card_format = ANY (ARRAY['digital'::text, 'physical'::text]))),
  CONSTRAINT "commerce_gift_cards_status_allowed" CHECK ((status = ANY (ARRAY['active'::text, 'redeemed'::text, 'partially_redeemed'::text, 'expired'::text, 'cancelled'::text, 'replaced'::text, 'converted'::text]))),
  CONSTRAINT "commerce_gift_cards_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_gift_cards_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "commerce_gift_cards_tenant_id_card_number_key" UNIQUE (tenant_id, card_number)
);
CREATE TABLE IF NOT EXISTS public."commerce_idempotency" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "operation" text NOT NULL,
  "request_hash" text,
  "response_status" integer,
  "response_body" jsonb,
  "resource_type" text,
  "resource_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone,
  CONSTRAINT "commerce_idempotency_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_idempotency_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "commerce_idempotency_tenant_id_idempotency_key_key" UNIQUE (tenant_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS public."commerce_inventory_alerts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "sku_id" uuid,
  "warehouse_id" uuid,
  "alert_type" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'warning'::text,
  "current_quantity" numeric(24,6),
  "threshold_quantity" numeric(24,6),
  "status" text NOT NULL DEFAULT 'open'::text,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_inventory_alerts_status_allowed" CHECK ((status = ANY (ARRAY['open'::text, 'acknowledged'::text, 'resolved'::text, 'dismissed'::text, 'expired'::text]))),
  CONSTRAINT "commerce_inventory_alerts_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_inventory_alerts_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_inventory_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "sku_id" uuid,
  "warehouse_id" uuid,
  "location_id" uuid,
  "movement_id" uuid,
  "event_type" text NOT NULL,
  "quantity" numeric(24,6),
  "source_type" text,
  "source_id" uuid,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_inventory_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_inventory_events_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_loyalty_accounts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "program_code" text NOT NULL DEFAULT 'default'::text,
  "points_balance" bigint NOT NULL DEFAULT 0,
  "lifetime_points" bigint NOT NULL DEFAULT 0,
  "tier" text NOT NULL DEFAULT 'standard'::text,
  "status" text NOT NULL DEFAULT 'active'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_loyalty_accounts_status_allowed" CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'closed'::text]))),
  CONSTRAINT "commerce_loyalty_accounts_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_loyalty_accounts_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "commerce_loyalty_accounts_tenant_id_customer_id_program_cod_key" UNIQUE (tenant_id, customer_id, program_code)
);
CREATE TABLE IF NOT EXISTS public."commerce_loyalty_transactions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "loyalty_account_id" uuid NOT NULL,
  "sale_id" uuid,
  "transaction_type" text NOT NULL,
  "points" bigint NOT NULL,
  "balance_before" bigint NOT NULL,
  "balance_after" bigint NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_loyalty_transactions_points_check" CHECK ((points <> 0)),
  CONSTRAINT "commerce_loyalty_transactions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."commerce_modules" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL DEFAULT 'commerce'::text,
  "name" text NOT NULL DEFAULT 'Commerce / POS'::text,
  "version" text NOT NULL DEFAULT '1.0.0'::text,
  "enabled" boolean NOT NULL DEFAULT true,
  "configuration" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_modules_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_modules_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "commerce_modules_tenant_id_code_key" UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS public."commerce_order_channel_refs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "channel_id" uuid NOT NULL,
  "erp_order_id" uuid NOT NULL,
  "external_order_id" text NOT NULL,
  "external_status" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "imported_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_synced_at" timestamp with time zone,
  CONSTRAINT "commerce_order_channel_refs_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_order_channel_refs_channel_id_external_order_id_key" UNIQUE (channel_id, external_order_id),
  CONSTRAINT "commerce_order_channel_refs_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_order_channels" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "channel_type" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "configuration" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "commerce_order_channels_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_order_channels_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "commerce_order_channels_tenant_id_code_key" UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS public."commerce_order_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "erp_order_id" uuid,
  "sale_id" uuid,
  "event_type" text NOT NULL,
  "old_status" text,
  "new_status" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_order_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_order_events_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_order_items" (
  "id" text NOT NULL,
  "tenant_id" uuid,
  "order_id" text NOT NULL,
  "product_id" text,
  "name" text,
  "quantity" integer,
  "unit_price" text,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "commerce_order_items_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."commerce_orders" (
  "id" text NOT NULL,
  "tenant_id" uuid,
  "stripe_checkout_id" text,
  "stripe_payment_intent_id" text,
  "customer_email" text,
  "customer_id" text,
  "total_amount" text,
  "status" text DEFAULT 'confirmed'::text,
  "fulfillment_status" text DEFAULT 'pending'::text,
  "fulfillment_method" text,
  "tracking_number" text,
  "carrier" text,
  "shipping_address" text,
  "notes" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "tracking_status" text DEFAULT 'PRE_TRANSIT'::text,
  "coupon_id" uuid,
  "payment_status" text NOT NULL DEFAULT 'unpaid'::text,
  "email" text,
  "subtotal" text,
  CONSTRAINT "commerce_orders_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."commerce_outbox_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "aggregate_type" text NOT NULL,
  "aggregate_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "attempts" integer NOT NULL DEFAULT 0,
  "available_at" timestamp with time zone NOT NULL DEFAULT now(),
  "processed_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_outbox_events_status_allowed" CHECK ((status = ANY (ARRAY['pending'::text, 'publishing'::text, 'published'::text, 'failed'::text, 'dead_letter'::text]))),
  CONSTRAINT "commerce_outbox_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_outbox_events_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_payment_allocations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "payment_id" uuid NOT NULL,
  "sale_id" uuid NOT NULL,
  "amount" numeric(24,6) NOT NULL,
  CONSTRAINT "commerce_payment_allocations_amount_check" CHECK ((amount > (0)::numeric)),
  CONSTRAINT "commerce_payment_allocations_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_payment_allocations_payment_id_sale_id_key" UNIQUE (payment_id, sale_id)
);
CREATE TABLE IF NOT EXISTS public."commerce_payment_methods" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "method_type" text NOT NULL,
  "processor" text,
  "gl_account_id" uuid,
  "active" boolean NOT NULL DEFAULT true,
  "configuration" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "commerce_payment_methods_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_payment_methods_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "commerce_payment_methods_tenant_id_code_key" UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS public."commerce_payments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "payment_number" text NOT NULL,
  "sale_id" uuid,
  "customer_id" uuid,
  "payment_method_id" uuid NOT NULL,
  "amount" numeric(24,6) NOT NULL,
  "tip_amount" numeric(24,6) NOT NULL DEFAULT 0,
  "currency" character(3) NOT NULL DEFAULT 'USD'::bpchar,
  "status" text NOT NULL DEFAULT 'succeeded'::text,
  "processor_transaction_id" text,
  "authorization_code" text,
  "external_reference" text,
  "acct_receipt_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "staff_id" uuid,
  "branch_id" uuid,
  "location_id" uuid,
  CONSTRAINT "commerce_payments_status_allowed" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'authorized'::text, 'captured'::text, 'succeeded'::text, 'failed'::text, 'refunded'::text, 'partially_refunded'::text, 'cancelled'::text, 'disputed'::text]))),
  CONSTRAINT "commerce_payments_amount_check" CHECK ((amount > (0)::numeric)),
  CONSTRAINT "commerce_payments_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_payments_tenant_id_payment_number_key" UNIQUE (tenant_id, payment_number),
  CONSTRAINT "commerce_payments_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_posting_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "source_type" text NOT NULL,
  "source_id" uuid NOT NULL,
  "journal_batch_id" uuid,
  "journal_entry_id" uuid,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "idempotency_key" text NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "posted_at" timestamp with time zone,
  CONSTRAINT "commerce_posting_events_status_allowed" CHECK ((status = ANY (ARRAY['pending'::text, 'posted'::text, 'failed'::text, 'reversed'::text, 'skipped'::text]))),
  CONSTRAINT "commerce_posting_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_posting_events_tenant_id_idempotency_key_key" UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT "commerce_posting_events_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_price_lists" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "currency" character(3) NOT NULL DEFAULT 'USD'::bpchar,
  "list_type" text NOT NULL DEFAULT 'retail'::text,
  "active" boolean NOT NULL DEFAULT true,
  "valid_from" timestamp with time zone,
  "valid_to" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_price_lists_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_price_lists_tenant_id_code_key" UNIQUE (tenant_id, code),
  CONSTRAINT "commerce_price_lists_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_prices" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "price_list_id" uuid NOT NULL,
  "catalog_item_id" uuid NOT NULL,
  "price" numeric(24,6) NOT NULL,
  "compare_at_price" numeric(24,6),
  "minimum_price" numeric(24,6),
  "cost_price" numeric(24,6),
  "valid_from" timestamp with time zone NOT NULL DEFAULT now(),
  "valid_to" timestamp with time zone,
  "shipping_cost" numeric(10,2) NOT NULL DEFAULT 0,
  CONSTRAINT "commerce_prices_price_check" CHECK ((price >= (0)::numeric)),
  CONSTRAINT "commerce_prices_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_prices_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "commerce_prices_price_list_id_catalog_item_id_valid_from_key" UNIQUE (price_list_id, catalog_item_id, valid_from)
);
CREATE TABLE IF NOT EXISTS public."commerce_procurement_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "purchase_order_id" uuid,
  "event_type" text NOT NULL,
  "old_status" text,
  "new_status" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_procurement_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_procurement_events_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_product_media" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "catalog_item_id" uuid NOT NULL,
  "media_type" text NOT NULL DEFAULT 'image'::text,
  "url" text NOT NULL,
  "alt_text" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_primary" boolean NOT NULL DEFAULT false,
  CONSTRAINT "commerce_product_media_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_product_media_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_product_tags" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "catalog_item_id" uuid NOT NULL,
  "tag" text NOT NULL,
  CONSTRAINT "commerce_product_tags_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_product_tags_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "commerce_product_tags_catalog_item_id_tag_key" UNIQUE (catalog_item_id, tag)
);
CREATE TABLE IF NOT EXISTS public."commerce_products" (
  "id" text NOT NULL,
  "tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "short_description" text,
  "base_price" text NOT NULL,
  "sale_price" text,
  "compare_at_price" text,
  "image" text,
  "alt" text,
  "badge" text,
  "category" text,
  "category_id" bigint,
  "featured" boolean DEFAULT false,
  "is_hidden" boolean DEFAULT false,
  "inventory_count" integer DEFAULT 0,
  "specs" text,
  "materials" text,
  "ingredients" text,
  "directions" text,
  "warranty" text,
  "stripe_price_id" text,
  "stripe_product_id" text,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "brand_id" uuid,
  "visible" boolean NOT NULL DEFAULT true,
  "stock" integer,
  CONSTRAINT "commerce_products_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_products_slug_key" UNIQUE (slug)
);
CREATE TABLE IF NOT EXISTS public."commerce_promotion_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "promotion_id" uuid NOT NULL,
  "catalog_item_id" uuid,
  "category_id" uuid,
  "minimum_quantity" numeric(24,6),
  "discount_value" numeric(24,6),
  CONSTRAINT "commerce_promotion_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_promotion_items_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_promotion_targets" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "promotion_id" uuid NOT NULL,
  "target_kind" text NOT NULL,
  "target_id" text NOT NULL,
  "target_label" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_promotion_targets_target_kind_check" CHECK ((target_kind = ANY (ARRAY['product'::text, 'taxonomy'::text]))),
  CONSTRAINT "commerce_promotion_targets_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_promotion_targets_unique" UNIQUE (promotion_id, target_kind, target_id)
);
CREATE TABLE IF NOT EXISTS public."commerce_promotions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "promotion_type" text NOT NULL,
  "value" numeric(24,6),
  "minimum_subtotal" numeric(24,6),
  "maximum_discount" numeric(24,6),
  "start_at" timestamp with time zone,
  "end_at" timestamp with time zone,
  "usage_limit" integer,
  "usage_count" integer NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  "rules" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "actions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_automatic" boolean NOT NULL DEFAULT false,
  "seller_id" uuid,
  CONSTRAINT "commerce_promotions_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_promotions_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "commerce_promotions_tenant_id_code_key" UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS public."commerce_receipts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "sale_id" uuid,
  "receipt_number" text NOT NULL,
  "receipt_type" text NOT NULL DEFAULT 'sale'::text,
  "delivery_method" text NOT NULL DEFAULT 'print'::text,
  "destination" text,
  "document_uri" text,
  "issued_at" timestamp with time zone NOT NULL DEFAULT now(),
  "receipt_for" text NOT NULL DEFAULT 'sale'::text,
  "refund_id" uuid,
  "deposit_id" uuid,
  "gift_card_id" uuid,
  CONSTRAINT "commerce_receipts_receipt_for_check" CHECK ((receipt_for = ANY (ARRAY['sale'::text, 'deposit'::text, 'refund'::text, 'gift_card'::text, 'store_credit'::text, 'payment'::text]))),
  CONSTRAINT "commerce_receipts_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_receipts_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "commerce_receipts_tenant_id_receipt_number_key" UNIQUE (tenant_id, receipt_number)
);
CREATE TABLE IF NOT EXISTS public."commerce_refund_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "refund_id" uuid NOT NULL,
  "sale_line_id" uuid NOT NULL,
  "quantity" numeric(24,6) NOT NULL,
  "amount" numeric(24,6) NOT NULL DEFAULT 0,
  "restock" boolean NOT NULL DEFAULT true,
  "disposition" text,
  CONSTRAINT "commerce_refund_lines_quantity_check" CHECK ((quantity > (0)::numeric)),
  CONSTRAINT "commerce_refund_lines_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."commerce_refunds" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "refund_number" text NOT NULL,
  "sale_id" uuid,
  "payment_id" uuid,
  "rma_id" uuid,
  "amount" numeric(24,6) NOT NULL,
  "reason" text,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "processor_reference" text,
  "acct_credit_memo_id" uuid,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "processed_at" timestamp with time zone,
  "refund_method" text,
  "reason_code" text,
  "requires_approval" boolean NOT NULL DEFAULT false,
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "rejected_by" uuid,
  "rejected_at" timestamp with time zone,
  "rejection_reason" text,
  "store_credit_id" uuid,
  CONSTRAINT "commerce_refunds_reason_code_check" CHECK (((reason_code IS NULL) OR (reason_code = ANY (ARRAY['service_issue'::text, 'cancellation'::text, 'no_show_waived'::text, 'duplicate_charge'::text, 'pricing_error'::text, 'customer_dissatisfaction'::text, 'pet_health'::text, 'fraud'::text, 'other'::text])))),
  CONSTRAINT "commerce_refunds_refund_method_check" CHECK (((refund_method IS NULL) OR (refund_method = ANY (ARRAY['original_payment'::text, 'store_credit'::text, 'gift_card'::text, 'cash'::text, 'check'::text, 'manual'::text])))),
  CONSTRAINT "commerce_refunds_status_allowed" CHECK ((status = ANY (ARRAY['pending'::text, 'requires_approval'::text, 'approved'::text, 'rejected'::text, 'processing'::text, 'completed'::text, 'failed'::text, 'cancelled'::text, 'void'::text]))),
  CONSTRAINT "commerce_refunds_amount_check" CHECK ((amount > (0)::numeric)),
  CONSTRAINT "commerce_refunds_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_refunds_tenant_id_refund_number_key" UNIQUE (tenant_id, refund_number),
  CONSTRAINT "commerce_refunds_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_return_actions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "rma_id" uuid NOT NULL,
  "action_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "assigned_to" uuid,
  "notes" text,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_return_actions_status_allowed" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'completed'::text, 'cancelled'::text]))),
  CONSTRAINT "commerce_return_actions_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_return_actions_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_return_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "rma_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "old_status" text,
  "new_status" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_return_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_return_events_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_sale_discounts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "sale_id" uuid NOT NULL,
  "sale_line_id" uuid,
  "promotion_id" uuid,
  "coupon_id" uuid,
  "description" text,
  "amount" numeric(24,6) NOT NULL DEFAULT 0,
  CONSTRAINT "commerce_sale_discounts_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."commerce_sale_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "sale_id" uuid NOT NULL,
  "line_no" integer NOT NULL,
  "catalog_item_id" uuid,
  "sku_id" uuid,
  "erp_order_line_id" uuid,
  "service_id" uuid,
  "dependent_id" uuid,
  "description" text NOT NULL,
  "quantity" numeric(24,6) NOT NULL,
  "unit_price" numeric(24,6) NOT NULL DEFAULT 0,
  "gross_amount" numeric(24,6) NOT NULL DEFAULT 0,
  "discount_amount" numeric(24,6) NOT NULL DEFAULT 0,
  "taxable_amount" numeric(24,6) NOT NULL DEFAULT 0,
  "tax_amount" numeric(24,6) NOT NULL DEFAULT 0,
  "line_total" numeric(24,6) NOT NULL DEFAULT 0,
  "cost_amount" numeric(24,6) NOT NULL DEFAULT 0,
  CONSTRAINT "commerce_sale_lines_quantity_check" CHECK ((quantity > (0)::numeric)),
  CONSTRAINT "commerce_sale_lines_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_sale_lines_sale_id_line_no_key" UNIQUE (sale_id, line_no)
);
CREATE TABLE IF NOT EXISTS public."commerce_sale_taxes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "sale_id" uuid NOT NULL,
  "sale_line_id" uuid,
  "tax_code_id" uuid,
  "jurisdiction" text,
  "rate" numeric(14,8) NOT NULL DEFAULT 0,
  "taxable_amount" numeric(24,6) NOT NULL DEFAULT 0,
  "tax_amount" numeric(24,6) NOT NULL DEFAULT 0,
  CONSTRAINT "commerce_sale_taxes_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."commerce_sales" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "sale_number" text NOT NULL,
  "cart_id" uuid,
  "register_session_id" uuid,
  "branch_id" uuid,
  "customer_id" uuid,
  "dependent_id" uuid,
  "appointment_id" uuid,
  "erp_order_id" uuid,
  "acct_invoice_id" uuid,
  "source" text NOT NULL DEFAULT 'pos'::text,
  "status" text NOT NULL DEFAULT 'completed'::text,
  "currency" character(3) NOT NULL DEFAULT 'USD'::bpchar,
  "subtotal" numeric(24,6) NOT NULL DEFAULT 0,
  "discount_total" numeric(24,6) NOT NULL DEFAULT 0,
  "tax_total" numeric(24,6) NOT NULL DEFAULT 0,
  "shipping_total" numeric(24,6) NOT NULL DEFAULT 0,
  "total" numeric(24,6) NOT NULL DEFAULT 0,
  "paid_total" numeric(24,6) NOT NULL DEFAULT 0,
  "refunded_total" numeric(24,6) NOT NULL DEFAULT 0,
  "change_due" numeric(24,6) NOT NULL DEFAULT 0,
  "sale_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone,
  "voided_at" timestamp with time zone,
  "void_reason" text,
  "created_by" uuid,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_sales_status_allowed" CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'pending'::text, 'completed'::text, 'partially_refunded'::text, 'refunded'::text, 'cancelled'::text, 'void'::text]))),
  CONSTRAINT "commerce_sales_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_sales_tenant_id_sale_number_key" UNIQUE (tenant_id, sale_number),
  CONSTRAINT "commerce_sales_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_shipping_labels" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "shipment_id" uuid,
  "label_type" text NOT NULL DEFAULT 'shipping'::text,
  "label_uri" text,
  "carrier" text,
  "tracking_number" text,
  "postage_amount" numeric(24,6),
  "printed_by" uuid,
  "printed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_shipping_labels_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_shipping_labels_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_store_credit_transactions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "store_credit_id" uuid NOT NULL,
  "sale_id" uuid,
  "refund_id" uuid,
  "transaction_type" text NOT NULL,
  "amount" numeric(24,6) NOT NULL,
  "balance_before" numeric(24,6) NOT NULL,
  "balance_after" numeric(24,6) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_store_credit_transactions_amount_check" CHECK ((amount > (0)::numeric)),
  CONSTRAINT "commerce_store_credit_transactions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."commerce_store_credits" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "credit_number" text NOT NULL,
  "customer_id" uuid NOT NULL,
  "original_amount" numeric(24,6) NOT NULL DEFAULT 0,
  "balance" numeric(24,6) NOT NULL DEFAULT 0,
  "currency" character(3) NOT NULL DEFAULT 'USD'::bpchar,
  "status" text NOT NULL DEFAULT 'active'::text,
  "issued_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone,
  CONSTRAINT "commerce_store_credits_status_allowed" CHECK ((status = ANY (ARRAY['active'::text, 'partially_used'::text, 'used'::text, 'expired'::text, 'revoked'::text]))),
  CONSTRAINT "commerce_store_credits_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_store_credits_tenant_id_credit_number_key" UNIQUE (tenant_id, credit_number),
  CONSTRAINT "commerce_store_credits_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_subscription_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "subscription_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "old_status" text,
  "new_status" text,
  "effective_at" timestamp with time zone NOT NULL DEFAULT now(),
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_subscription_events_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."commerce_subscription_invoice_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "subscription_invoice_id" uuid NOT NULL,
  "line_no" integer NOT NULL,
  "subscription_item_id" uuid,
  "description" text NOT NULL,
  "quantity" numeric(24,6) NOT NULL DEFAULT 1,
  "unit_price" numeric(24,6) NOT NULL DEFAULT 0,
  "line_total" numeric(24,6) NOT NULL DEFAULT 0,
  CONSTRAINT "commerce_subscription_invoice_lines_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_subscription_invoice_subscription_invoice_id_line__key" UNIQUE (subscription_invoice_id, line_no)
);
CREATE TABLE IF NOT EXISTS public."commerce_subscription_invoices" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "subscription_id" uuid NOT NULL,
  "invoice_number" text NOT NULL,
  "acct_invoice_id" uuid,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "subtotal" numeric(24,6) NOT NULL DEFAULT 0,
  "discount_total" numeric(24,6) NOT NULL DEFAULT 0,
  "tax_total" numeric(24,6) NOT NULL DEFAULT 0,
  "total" numeric(24,6) NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "due_date" date,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_subscription_invoices_status_allowed" CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'paid'::text, 'past_due'::text, 'void'::text, 'uncollectible'::text]))),
  CONSTRAINT "commerce_subscription_invoices_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_subscription_invoices_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "commerce_subscription_invoices_tenant_id_invoice_number_key" UNIQUE (tenant_id, invoice_number)
);
CREATE TABLE IF NOT EXISTS public."commerce_subscription_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "subscription_id" uuid NOT NULL,
  "catalog_item_id" uuid,
  "service_id" uuid,
  "description" text NOT NULL,
  "quantity" numeric(24,6) NOT NULL DEFAULT 1,
  "unit_price" numeric(24,6) NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "commerce_subscription_items_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."commerce_subscription_payments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "subscription_invoice_id" uuid NOT NULL,
  "payment_id" uuid NOT NULL,
  "amount" numeric(24,6) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_subscription_payments_amount_check" CHECK ((amount > (0)::numeric)),
  CONSTRAINT "commerce_subscription_payments_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_subscription_payment_subscription_invoice_id_payme_key" UNIQUE (subscription_invoice_id, payment_id)
);
CREATE TABLE IF NOT EXISTS public."commerce_subscription_plan_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "plan_id" uuid NOT NULL,
  "catalog_item_id" uuid,
  "service_id" uuid,
  "description" text NOT NULL,
  "quantity" numeric(24,6) NOT NULL DEFAULT 1,
  "recurring_price" numeric(24,6) NOT NULL DEFAULT 0,
  CONSTRAINT "commerce_subscription_plan_items_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."commerce_subscription_plans" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "billing_interval" text NOT NULL,
  "interval_count" integer NOT NULL DEFAULT 1,
  "price" numeric(24,6) NOT NULL DEFAULT 0,
  "setup_fee" numeric(24,6) NOT NULL DEFAULT 0,
  "currency" character(3) NOT NULL DEFAULT 'USD'::bpchar,
  "trial_days" integer NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "commerce_subscription_plans_interval_count_check" CHECK ((interval_count > 0)),
  CONSTRAINT "commerce_subscription_plans_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_subscription_plans_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "commerce_subscription_plans_tenant_id_code_key" UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS public."commerce_subscriptions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "subscription_number" text NOT NULL,
  "plan_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "dependent_id" uuid,
  "status" text NOT NULL DEFAULT 'active'::text,
  "billing_interval" text NOT NULL,
  "interval_count" integer NOT NULL DEFAULT 1,
  "price" numeric(24,6) NOT NULL DEFAULT 0,
  "currency" character(3) NOT NULL DEFAULT 'USD'::bpchar,
  "start_date" date NOT NULL DEFAULT CURRENT_DATE,
  "trial_end_date" date,
  "current_period_start" date,
  "current_period_end" date,
  "next_billing_date" date,
  "default_payment_method_id" uuid,
  "acct_contract_id" uuid,
  "cancelled_at" timestamp with time zone,
  "cancellation_reason" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_subscriptions_status_allowed" CHECK ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'paused'::text, 'cancelled'::text, 'expired'::text, 'unpaid'::text]))),
  CONSTRAINT "commerce_subscriptions_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_subscriptions_tenant_id_subscription_number_key" UNIQUE (tenant_id, subscription_number),
  CONSTRAINT "commerce_subscriptions_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."commerce_supplier_orders" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "order_id" text NOT NULL,
  "supplier_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'to_order'::text,
  "items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "ship_to" text,
  "customer_email" text,
  "supplier_order_ref" text,
  "carrier" text,
  "tracking_number" text,
  "placed_by" text,
  "placed_at" timestamp with time zone,
  "shipped_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_supplier_orders_status_check" CHECK ((status = ANY (ARRAY['to_order'::text, 'ordered'::text, 'shipped'::text, 'cancelled'::text]))),
  CONSTRAINT "commerce_supplier_orders_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_supplier_orders_order_id_supplier_id_key" UNIQUE (order_id, supplier_id)
);
CREATE TABLE IF NOT EXISTS public."commerce_suppliers" (
  "id" text NOT NULL,
  "name" text NOT NULL,
  "site_url" text,
  "order_url" text,
  "method" text NOT NULL DEFAULT 'manual'::text,
  "active" boolean NOT NULL DEFAULT true,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_suppliers_method_check" CHECK ((method = ANY (ARRAY['manual'::text, 'csv'::text, 'api'::text]))),
  CONSTRAINT "commerce_suppliers_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."commerce_webhook_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "external_event_id" text NOT NULL,
  "event_type" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "signature_valid" boolean,
  "status" text NOT NULL DEFAULT 'received'::text,
  "processed_at" timestamp with time zone,
  "error_message" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "commerce_webhook_events_status_allowed" CHECK ((status = ANY (ARRAY['pending'::text, 'delivering'::text, 'delivered'::text, 'failed'::text, 'dead_letter'::text, 'ignored'::text]))),
  CONSTRAINT "commerce_webhook_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "commerce_webhook_events_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "commerce_webhook_events_provider_external_event_id_key" UNIQUE (provider, external_event_id)
);
CREATE TABLE IF NOT EXISTS public."communications" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "customerId" text NOT NULL,
  "channel" text DEFAULT 'EMAIL'::text,
  "direction" text DEFAULT 'OUTBOUND'::text,
  "subject" text,
  "body" text,
  "status" text DEFAULT 'SENT'::text,
  "relatedBookingId" text,
  "sentAt" timestamp with time zone DEFAULT now(),
  "createdAt" timestamp with time zone DEFAULT now(),
  "tenant_id" uuid NOT NULL,
  CONSTRAINT "communications_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."contact_message" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "kind" text NOT NULL DEFAULT 'contact'::text,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "topic" text,
  "message" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "contact_message_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."contact_messages" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "name" text NOT NULL,
  "email" text,
  "subject" text,
  "message" text,
  "status" text DEFAULT 'UNREAD'::text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  "tenant_id" uuid NOT NULL,
  "support_ticket_id" uuid,
  CONSTRAINT "contact_messages_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_activity" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid,
  "dependent_id" uuid,
  "appointment_id" uuid,
  "lead_id" uuid,
  "activity_type" text NOT NULL,
  "channel" text,
  "direction" text,
  "subject" text,
  "body" text,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now(),
  "staff_id" uuid,
  "external_id" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_activity_direction_check" CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text, 'internal'::text]))),
  CONSTRAINT "crm_activity_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_appointment_services" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "appointment_id" uuid NOT NULL,
  "dependent_id" uuid,
  "service_id" uuid NOT NULL,
  "staff_id" uuid,
  "quantity" numeric(12,3) NOT NULL DEFAULT 1,
  "duration_minutes" integer,
  "unit_price" numeric(18,4) NOT NULL DEFAULT 0,
  "discount_amount" numeric(18,4) NOT NULL DEFAULT 0,
  "tax_amount" numeric(18,4) NOT NULL DEFAULT 0,
  "total" numeric(18,4) NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'scheduled'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_appointment_services_quantity_check" CHECK ((quantity > (0)::numeric)),
  CONSTRAINT "crm_appointment_services_status_allowed" CHECK ((status = ANY (ARRAY['scheduled'::text, 'in_progress'::text, 'completed'::text, 'skipped'::text, 'cancelled'::text])))
);
CREATE TABLE IF NOT EXISTS public."crm_audit_log" (
  "id" bigint NOT NULL,
  "tenant_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "actor_staff_id" uuid,
  "entity_type" text NOT NULL,
  "entity_id" uuid,
  "action" text NOT NULL,
  "before_data" jsonb,
  "after_data" jsonb,
  "ip_address" inet,
  "user_agent" text,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_audit_log_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_automation_enrollments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "workflow_id" uuid NOT NULL,
  "customer_id" uuid,
  "dependent_id" uuid,
  "appointment_id" uuid,
  "status" text NOT NULL DEFAULT 'running'::text,
  "current_step" integer NOT NULL DEFAULT 0,
  "scheduled_for" timestamp with time zone,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "last_error" text,
  "context" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_automation_enrollments_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'waiting'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]))),
  CONSTRAINT "crm_automation_enrollments_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_automation_enrollments_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."crm_automation_runs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "workflow_id" uuid NOT NULL,
  "enrollment_id" uuid,
  "action_type" text NOT NULL,
  "status" text NOT NULL,
  "scheduled_for" timestamp with time zone,
  "executed_at" timestamp with time zone,
  "result" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error_message" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_automation_runs_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'skipped'::text]))),
  CONSTRAINT "crm_automation_runs_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_automation_workflows" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "workflow_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "trigger_definition" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "condition_definition" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "action_definition" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "allow_reentry" boolean NOT NULL DEFAULT false,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_automation_workflows_workflow_type_check" CHECK ((workflow_type = ANY (ARRAY['rebooking'::text, 'appointment_reminder'::text, 'vaccine_reminder'::text, 'unsigned_document'::text, 'birthday'::text, 'win_back'::text, 'payment_reminder'::text, 'custom'::text]))),
  CONSTRAINT "crm_automation_workflows_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'archived'::text]))),
  CONSTRAINT "crm_automation_workflows_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_automation_workflows_tenant_id_name_key" UNIQUE (tenant_id, name),
  CONSTRAINT "crm_automation_workflows_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."crm_campaign_members" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "campaign_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "status" text NOT NULL,
  "enrolled_at" timestamp with time zone NOT NULL DEFAULT now(),
  "sent_at" timestamp with time zone,
  "converted_at" timestamp with time zone,
  "failure_reason" text,
  CONSTRAINT "crm_campaign_members_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_campaigns" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "campaign_type" text NOT NULL,
  "status" text NOT NULL,
  "channel" text NOT NULL,
  "template_id" uuid,
  "segment_definition" jsonb NOT NULL,
  "scheduled_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_campaigns_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_commission_entries" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "staff_id" uuid NOT NULL,
  "plan_id" uuid,
  "appointment_id" uuid,
  "sale_id" uuid,
  "service_id" uuid,
  "earned_on" date NOT NULL DEFAULT CURRENT_DATE,
  "basis_amount" numeric(14,2) NOT NULL DEFAULT 0,
  "rate_percent" numeric(6,3),
  "flat_amount" numeric(12,2),
  "tips_amount" numeric(12,2) NOT NULL DEFAULT 0,
  "retail_amount" numeric(12,2) NOT NULL DEFAULT 0,
  "commission_amount" numeric(14,2) NOT NULL DEFAULT 0,
  "entry_type" text NOT NULL DEFAULT 'earned'::text,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "payroll_run_id" uuid,
  "reversal_of_id" uuid,
  "calculation_detail" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_commission_entries_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'paid'::text, 'reversed'::text, 'disputed'::text, 'void'::text]))),
  CONSTRAINT "crm_commission_entries_entry_type_check" CHECK ((entry_type = ANY (ARRAY['earned'::text, 'adjustment'::text, 'reversal'::text, 'bonus'::text, 'guarantee_topup'::text]))),
  CONSTRAINT "crm_commission_entries_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_commission_entries_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."crm_commission_plans" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "calc_basis" text NOT NULL DEFAULT 'service_revenue'::text,
  "default_rate_percent" numeric(6,3) NOT NULL DEFAULT 0,
  "flat_amount" numeric(12,2) NOT NULL DEFAULT 0,
  "includes_tips" boolean NOT NULL DEFAULT false,
  "includes_addons" boolean NOT NULL DEFAULT true,
  "includes_retail" boolean NOT NULL DEFAULT false,
  "retail_rate_percent" numeric(6,3) NOT NULL DEFAULT 0,
  "deduct_refunds" boolean NOT NULL DEFAULT true,
  "deduct_product_cost" boolean NOT NULL DEFAULT false,
  "minimum_guarantee" numeric(12,2),
  "payout_frequency" text NOT NULL DEFAULT 'biweekly'::text,
  "is_active" boolean NOT NULL DEFAULT true,
  "effective_from" date NOT NULL DEFAULT CURRENT_DATE,
  "effective_to" date,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_commission_plans_default_rate_percent_check" CHECK (((default_rate_percent >= (0)::numeric) AND (default_rate_percent <= (100)::numeric))),
  CONSTRAINT "crm_commission_plans_calc_basis_check" CHECK ((calc_basis = ANY (ARRAY['service_revenue'::text, 'gross_sale'::text, 'net_after_products'::text, 'net_after_discounts'::text, 'flat_per_appointment'::text, 'tiered_revenue'::text]))),
  CONSTRAINT "crm_commission_plans_payout_frequency_check" CHECK ((payout_frequency = ANY (ARRAY['weekly'::text, 'biweekly'::text, 'semimonthly'::text, 'monthly'::text]))),
  CONSTRAINT "crm_commission_plans_minimum_guarantee_check" CHECK (((minimum_guarantee IS NULL) OR (minimum_guarantee >= (0)::numeric))),
  CONSTRAINT "crm_commission_plans_check" CHECK (((effective_to IS NULL) OR (effective_to >= effective_from))),
  CONSTRAINT "crm_commission_plans_flat_amount_check" CHECK ((flat_amount >= (0)::numeric)),
  CONSTRAINT "crm_commission_plans_retail_rate_percent_check" CHECK (((retail_rate_percent >= (0)::numeric) AND (retail_rate_percent <= (100)::numeric))),
  CONSTRAINT "crm_commission_plans_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_commission_plans_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "crm_commission_plans_tenant_id_name_key" UNIQUE (tenant_id, name)
);
CREATE TABLE IF NOT EXISTS public."crm_commission_rules" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "plan_id" uuid NOT NULL,
  "service_id" uuid,
  "service_category" text,
  "rate_percent" numeric(6,3),
  "flat_amount" numeric(12,2),
  "is_excluded" boolean NOT NULL DEFAULT false,
  "priority" integer NOT NULL DEFAULT 100,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_commission_rules_check" CHECK (((service_id IS NOT NULL) OR (service_category IS NOT NULL))),
  CONSTRAINT "crm_commission_rules_rate_percent_check" CHECK (((rate_percent IS NULL) OR ((rate_percent >= (0)::numeric) AND (rate_percent <= (100)::numeric)))),
  CONSTRAINT "crm_commission_rules_check1" CHECK ((is_excluded OR (rate_percent IS NOT NULL) OR (flat_amount IS NOT NULL))),
  CONSTRAINT "crm_commission_rules_flat_amount_check" CHECK (((flat_amount IS NULL) OR (flat_amount >= (0)::numeric))),
  CONSTRAINT "crm_commission_rules_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_commission_rules_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."crm_commission_tiers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "plan_id" uuid NOT NULL,
  "tier_order" integer NOT NULL,
  "min_revenue" numeric(14,2) NOT NULL DEFAULT 0,
  "max_revenue" numeric(14,2),
  "rate_percent" numeric(6,3) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_commission_tiers_rate_percent_check" CHECK (((rate_percent >= (0)::numeric) AND (rate_percent <= (100)::numeric))),
  CONSTRAINT "crm_commission_tiers_tier_order_check" CHECK ((tier_order >= 1)),
  CONSTRAINT "crm_commission_tiers_check" CHECK (((max_revenue IS NULL) OR (max_revenue > min_revenue))),
  CONSTRAINT "crm_commission_tiers_min_revenue_check" CHECK ((min_revenue >= (0)::numeric)),
  CONSTRAINT "crm_commission_tiers_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_commission_tiers_tenant_id_plan_id_tier_order_key" UNIQUE (tenant_id, plan_id, tier_order)
);
CREATE TABLE IF NOT EXISTS public."crm_communication_preferences" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "channel" text NOT NULL,
  "opted_in" boolean NOT NULL DEFAULT false,
  "source" text,
  "consented_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  CONSTRAINT "crm_communication_preferences_channel_check" CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text, 'phone'::text, 'push'::text, 'marketing'::text, 'transactional'::text]))),
  CONSTRAINT "crm_communication_preferences_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_communication_preferences_customer_id_channel_key" UNIQUE (customer_id, channel)
);
CREATE TABLE IF NOT EXISTS public."crm_conversations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid,
  "channel" text NOT NULL,
  "status" text NOT NULL,
  "assigned_staff_id" uuid,
  "subject" text,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_message_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "dependent_id" uuid,
  CONSTRAINT "crm_conversations_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_customer_behavior" (
  "customer_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "frequent_visitor" boolean NOT NULL DEFAULT false,
  "high_lifetime_value" boolean NOT NULL DEFAULT false,
  "frequent_no_show" boolean NOT NULL DEFAULT false,
  "cancellation_risk" boolean NOT NULL DEFAULT false,
  "price_sensitive" boolean NOT NULL DEFAULT false,
  "online_booking_only" boolean NOT NULL DEFAULT false,
  "due_for_rebooking" boolean NOT NULL DEFAULT false,
  "frequency_declining" boolean NOT NULL DEFAULT false,
  "missing_documents" boolean NOT NULL DEFAULT false,
  "vaccine_expiring" boolean NOT NULL DEFAULT false,
  "outstanding_balance_flag" boolean NOT NULL DEFAULT false,
  "no_upcoming_appointment" boolean NOT NULL DEFAULT false,
  "intake_incomplete" boolean NOT NULL DEFAULT false,
  "birthday_this_month" boolean NOT NULL DEFAULT false,
  "rebooking_campaign_eligible" boolean NOT NULL DEFAULT false,
  "win_back_candidate" boolean NOT NULL DEFAULT false,
  "new_customer_nurture_eligible" boolean NOT NULL DEFAULT false,
  "inactive_90_plus" boolean NOT NULL DEFAULT false,
  "last_calculated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_customer_behavior_pkey" PRIMARY KEY (customer_id)
);
CREATE TABLE IF NOT EXISTS public."crm_customer_contact_methods" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "type" text NOT NULL,
  "value" text NOT NULL,
  "normalized_value" text NOT NULL,
  "label" text,
  "is_primary" boolean NOT NULL DEFAULT false,
  "is_verified" boolean NOT NULL DEFAULT false,
  "verified_at" timestamp with time zone,
  "opt_in" boolean,
  "opted_in_at" timestamp with time zone,
  "opted_out_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_customer_contact_methods_type_check" CHECK ((type = ANY (ARRAY['email'::text, 'phone'::text, 'mobile'::text, 'other'::text]))),
  CONSTRAINT "crm_customer_contact_methods_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_customer_preferences" (
  "customer_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "preferred_days" text[] NOT NULL,
  "preferred_time_start" time without time zone,
  "preferred_time_end" time without time zone,
  "preferred_services" text[] NOT NULL,
  "preferred_payment_method" text,
  "communication_notes" text,
  "accessibility_notes" text,
  "parking_notes" text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "notification_frequency" text,
  "special_handling_notes" text,
  "preferred_style_notes" text,
  "preferred_staff_id" uuid,
  "preferred_shampoo" text,
  "preferred_cut_style" text,
  CONSTRAINT "crm_customer_preferences_pkey" PRIMARY KEY (customer_id)
);
CREATE TABLE IF NOT EXISTS public."crm_customer_tag_assignments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "tag_id" uuid NOT NULL,
  "assigned_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_customer_tag_assignments_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_customer_tags" (
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "tag_id" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_customer_tags_pkey" PRIMARY KEY (customer_id, tag_id)
);
CREATE TABLE IF NOT EXISTS public."crm_customers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "household_id" uuid,
  "source_customer_id" text,
  "external_customer_number" text,
  "customer_type" text NOT NULL,
  "lifecycle_stage" text NOT NULL,
  "lifecycle_status" text NOT NULL,
  "first_name" text,
  "middle_name" text,
  "last_name" text,
  "preferred_name" text,
  "company_name" text,
  "email" text,
  "phone" text,
  "mobile_phone" text,
  "date_of_birth" date,
  "pronouns" text,
  "preferred_contact_method" text,
  "preferred_language" text,
  "address_line1" text,
  "address_line2" text,
  "city" text,
  "state" text,
  "postal_code" text,
  "country" text NOT NULL,
  "lead_source_id" uuid,
  "lead_owner_id" uuid,
  "assigned_staff_id" uuid,
  "preferred_location_id" uuid,
  "customer_since" date,
  "first_contact_at" timestamp with time zone,
  "last_activity_at" timestamp with time zone,
  "next_follow_up_at" timestamp with time zone,
  "last_visit_at" timestamp with time zone,
  "next_appointment_at" timestamp with time zone,
  "total_visits" integer NOT NULL DEFAULT 0,
  "lifetime_value" numeric(18,4) NOT NULL DEFAULT 0,
  "average_ticket" numeric(18,4) NOT NULL DEFAULT 0,
  "average_visit_frequency_days" numeric(12,2),
  "no_show_rate" numeric(8,5) NOT NULL DEFAULT 0,
  "cancellation_rate" numeric(8,5) NOT NULL DEFAULT 0,
  "rebook_rate" numeric(8,5) NOT NULL DEFAULT 0,
  "outstanding_balance" numeric(18,4) NOT NULL DEFAULT 0,
  "total_spend_30d" numeric(18,4) NOT NULL DEFAULT 0,
  "total_spend_365d" numeric(18,4) NOT NULL DEFAULT 0,
  "marketing_email_opt_in" boolean NOT NULL DEFAULT false,
  "marketing_sms_opt_in" boolean NOT NULL DEFAULT false,
  "transactional_email_opt_in" boolean NOT NULL DEFAULT true,
  "transactional_sms_opt_in" boolean NOT NULL DEFAULT true,
  "do_not_call" boolean NOT NULL DEFAULT false,
  "do_not_contact" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "archived_at" timestamp with time zone,
  "merged_into_customer_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "lead_status" text,
  "conversion_date" date,
  "preferred_staff_id" uuid,
  CONSTRAINT "crm_customers_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_document_types" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "required_for_booking" boolean NOT NULL DEFAULT false,
  "requires_signature" boolean NOT NULL DEFAULT false,
  "expiration_days" integer,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "body_template" text,
  "body_format" text NOT NULL DEFAULT 'richtext'::text,
  "version" integer NOT NULL DEFAULT 1,
  "effective_date" date,
  "cms_page_id" uuid,
  CONSTRAINT "crm_document_types_body_format_check" CHECK ((body_format = ANY (ARRAY['richtext'::text, 'markdown'::text, 'html'::text, 'pdf_url'::text]))),
  CONSTRAINT "crm_document_types_version_check" CHECK ((version >= 1)),
  CONSTRAINT "crm_document_types_category_check" CHECK ((category = ANY (ARRAY['waiver'::text, 'intake'::text, 'vaccination'::text, 'agreement'::text, 'authorization'::text, 'other'::text]))),
  CONSTRAINT "crm_document_types_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_document_types_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "crm_document_types_tenant_id_name_key" UNIQUE (tenant_id, name)
);
CREATE TABLE IF NOT EXISTS public."crm_document_versions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "version_no" integer NOT NULL,
  "storage_path" text NOT NULL,
  "checksum" text,
  "uploaded_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_document_versions_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_document_versions_document_id_version_no_key" UNIQUE (document_id, version_no)
);
CREATE TABLE IF NOT EXISTS public."crm_documents" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "document_type_id" uuid,
  "name" text NOT NULL,
  "status" text NOT NULL,
  "storage_path" text,
  "mime_type" text,
  "file_size_bytes" bigint,
  "uploaded_by" uuid,
  "uploaded_at" timestamp with time zone,
  "issued_at" date,
  "expires_at" date,
  "signed_at" timestamp with time zone,
  "signed_by_name" text,
  "signature_provider" text,
  "external_signature_id" text,
  "rejection_reason" text,
  "metadata" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "order_id" uuid,
  "dependent_id" uuid,
  CONSTRAINT "crm_documents_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_duplicate_candidates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "record_a" uuid NOT NULL,
  "record_b" uuid NOT NULL,
  "match_score" numeric(8,5) NOT NULL,
  "match_reasons" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'open'::text,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_duplicate_candidates_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'confirmed'::text, 'dismissed'::text, 'merged'::text]))),
  CONSTRAINT "crm_duplicate_candidates_match_score_check" CHECK (((match_score >= (0)::numeric) AND (match_score <= (1)::numeric))),
  CONSTRAINT "crm_duplicate_candidates_entity_type_check" CHECK ((entity_type = ANY (ARRAY['customer'::text, 'household'::text, 'pet'::text]))),
  CONSTRAINT "crm_duplicate_candidates_check" CHECK ((record_a <> record_b)),
  CONSTRAINT "crm_duplicate_candidates_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_duplicate_candidates_tenant_id_entity_type_record_a_rec_key" UNIQUE (tenant_id, entity_type, record_a, record_b)
);
CREATE TABLE IF NOT EXISTS public."crm_external_identities" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "external_id" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_external_identities_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_external_identities_tenant_id_provider_entity_type_exte_key" UNIQUE (tenant_id, provider, entity_type, external_id)
);
CREATE TABLE IF NOT EXISTS public."crm_funnel_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "anonymous_session_id" text,
  "customer_id" uuid,
  "lead_id" uuid,
  "event_type" text NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now(),
  "source" text,
  "landing_page" text,
  "campaign" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "crm_funnel_events_event_type_check" CHECK ((event_type = ANY (ARRAY['website_visit'::text, 'account_created'::text, 'intake_started'::text, 'intake_completed'::text, 'booking_started'::text, 'booking_completed'::text]))),
  CONSTRAINT "crm_funnel_events_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_holiday_blackouts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "location_id" uuid,
  "name" text NOT NULL,
  "blackout_date" date NOT NULL,
  "end_date" date,
  "blackout_type" text NOT NULL DEFAULT 'holiday'::text,
  "is_closed_all_day" boolean NOT NULL DEFAULT true,
  "opens_at" time without time zone,
  "closes_at" time without time zone,
  "blocks_online_booking" boolean NOT NULL DEFAULT true,
  "recurs_annually" boolean NOT NULL DEFAULT false,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_holiday_blackouts_check" CHECK (((end_date IS NULL) OR (end_date >= blackout_date))),
  CONSTRAINT "crm_holiday_blackouts_blackout_type_check" CHECK ((blackout_type = ANY (ARRAY['holiday'::text, 'maintenance'::text, 'training'::text, 'weather'::text, 'private_event'::text, 'other'::text]))),
  CONSTRAINT "crm_holiday_blackouts_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_holiday_blackouts_tenant_id_location_id_blackout_date_n_key" UNIQUE (tenant_id, location_id, blackout_date, name)
);
CREATE TABLE IF NOT EXISTS public."crm_households" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active'::text,
  "primary_customer_id" uuid,
  "source_household_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_households_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'merged'::text, 'archived'::text]))),
  CONSTRAINT "crm_households_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_households_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."crm_idempotency_keys" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "operation" text NOT NULL,
  "request_hash" text,
  "response_status" integer,
  "response_body" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone,
  CONSTRAINT "crm_idempotency_keys_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_idempotency_keys_tenant_id_idempotency_key_key" UNIQUE (tenant_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS public."crm_lead_activities" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "lead_id" uuid NOT NULL,
  "activity_type" text NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now(),
  "staff_id" uuid,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_lead_activities_activity_type_check" CHECK ((activity_type = ANY (ARRAY['created'::text, 'contacted'::text, 'call'::text, 'email'::text, 'sms'::text, 'website_visit'::text, 'form_submit'::text, 'intake_completed'::text, 'appointment_created'::text, 'appointment_cancelled'::text, 'converted'::text, 'lost'::text, 'note'::text]))),
  CONSTRAINT "crm_lead_activities_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_lead_sources" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL DEFAULT 'other'::text,
  "utm_source" text,
  "utm_medium" text,
  "utm_campaign" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_lead_sources_category_check" CHECK ((category = ANY (ARRAY['website'::text, 'google'::text, 'referral'::text, 'social_media'::text, 'phone'::text, 'walk_in'::text, 'campaign'::text, 'other'::text]))),
  CONSTRAINT "crm_lead_sources_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_lead_sources_tenant_id_name_key" UNIQUE (tenant_id, name),
  CONSTRAINT "crm_lead_sources_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."crm_leads" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid,
  "lead_owner_id" uuid,
  "lead_source_id" uuid,
  "status" text NOT NULL,
  "booking_outcome" text,
  "lost_reason" text,
  "first_contact_at" timestamp with time zone,
  "last_activity_at" timestamp with time zone,
  "next_follow_up_at" timestamp with time zone,
  "conversion_date" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "contact_name" text,
  "email" text,
  "phone" text,
  "lead_source" text,
  "lead_type" text,
  CONSTRAINT "crm_leads_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_locations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "code" text,
  "address_line1" text,
  "address_line2" text,
  "city" text,
  "state" text,
  "postal_code" text,
  "country" text NOT NULL DEFAULT 'US'::text,
  "phone" text,
  "email" text,
  "timezone" text NOT NULL DEFAULT 'America/Chicago'::text,
  "latitude" numeric(10,7),
  "longitude" numeric(10,7),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_locations_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_locations_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "crm_locations_tenant_id_code_key" UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS public."crm_merge_log" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "source_record_id" uuid NOT NULL,
  "surviving_record_id" uuid NOT NULL,
  "merged_by" uuid,
  "snapshot" jsonb NOT NULL,
  "merged_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_merge_log_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_message_templates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "channel" text NOT NULL,
  "subject" text,
  "body" text NOT NULL,
  "variables" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "category" text,
  "is_system" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_message_templates_channel_check" CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text, 'phone'::text, 'push'::text, 'in_app'::text]))),
  CONSTRAINT "crm_message_templates_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_message_templates_tenant_id_name_key" UNIQUE (tenant_id, name),
  CONSTRAINT "crm_message_templates_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."crm_messages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "conversation_id" uuid,
  "customer_id" uuid,
  "channel" text NOT NULL,
  "direction" text NOT NULL,
  "status" text NOT NULL,
  "from_address" text,
  "to_address" text,
  "subject" text,
  "body" text,
  "template_id" uuid,
  "provider" text,
  "provider_message_id" text,
  "sent_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "read_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "failure_reason" text,
  "metadata" jsonb NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "external_message_id" text,
  "rfc822_message_id" text,
  "in_reply_to" text,
  "email_references" text[] NOT NULL,
  "raw_source_ref" text,
  "cc_addresses" text[] NOT NULL,
  "bcc_addresses" text[] NOT NULL,
  "body_text" text,
  "body_html" text,
  "quoted_content_stripped" boolean NOT NULL DEFAULT false,
  "authored_by_staff_id" uuid,
  "is_auto_reply" boolean NOT NULL DEFAULT false,
  "is_system_generated" boolean NOT NULL DEFAULT false,
  "delivery_status" text,
  "bounce_reason" text,
  CONSTRAINT "crm_messages_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_needs_attention" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid,
  "dependent_id" uuid,
  "appointment_id" uuid,
  "priority" text NOT NULL DEFAULT 'normal'::text,
  "issue_code" text NOT NULL,
  "issue" text NOT NULL,
  "recommendation" text,
  "due_by" timestamp with time zone,
  "status" text NOT NULL DEFAULT 'open'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "resolved_at" timestamp with time zone,
  "resolved_by" uuid,
  CONSTRAINT "crm_needs_attention_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'snoozed'::text, 'resolved'::text, 'dismissed'::text]))),
  CONSTRAINT "crm_needs_attention_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
  CONSTRAINT "crm_needs_attention_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_notes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid,
  "appointment_id" uuid,
  "created_by" uuid,
  "note_type" text NOT NULL,
  "body" text NOT NULL,
  "is_pinned" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "order_id" uuid,
  "dependent_id" uuid,
  "service_record_id" uuid,
  CONSTRAINT "crm_notes_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_operating_hours" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "location_id" uuid,
  "day_of_week" smallint NOT NULL,
  "opens_at" time without time zone,
  "closes_at" time without time zone,
  "is_closed" boolean NOT NULL DEFAULT false,
  "accepts_online_booking" boolean NOT NULL DEFAULT true,
  "last_booking_at" time without time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_operating_hours_check" CHECK ((is_closed OR ((opens_at IS NOT NULL) AND (closes_at IS NOT NULL) AND (closes_at > opens_at)))),
  CONSTRAINT "crm_operating_hours_day_of_week_check" CHECK (((day_of_week >= 0) AND (day_of_week <= 6))),
  CONSTRAINT "crm_operating_hours_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_operating_hours_tenant_id_location_id_day_of_week_key" UNIQUE (tenant_id, location_id, day_of_week)
);
CREATE TABLE IF NOT EXISTS public."crm_party_dependents" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "dependent_id" uuid NOT NULL,
  "relationship" text NOT NULL DEFAULT 'owner'::text,
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_party_dependents_relationship_check" CHECK ((relationship = ANY (ARRAY['owner'::text, 'co_owner'::text, 'guardian'::text, 'emergency_contact'::text, 'other'::text])))
);
CREATE TABLE IF NOT EXISTS public."crm_permanent_alerts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid,
  "dependent_id" uuid,
  "severity" text NOT NULL DEFAULT 'warning'::text,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "resolved_at" timestamp with time zone,
  CONSTRAINT "crm_permanent_alerts_severity_check" CHECK ((severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text]))),
  CONSTRAINT "crm_permanent_alerts_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_pricing_rules" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "rule_type" text NOT NULL,
  "service_id" uuid,
  "service_category" text,
  "match_key" text,
  "min_value" numeric(12,3),
  "max_value" numeric(12,3),
  "adjustment_type" text NOT NULL DEFAULT 'fixed_price'::text,
  "adjustment_value" numeric(12,3) NOT NULL DEFAULT 0,
  "priority" integer NOT NULL DEFAULT 100,
  "is_active" boolean NOT NULL DEFAULT true,
  "effective_from" date,
  "effective_to" date,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_pricing_rules_adjustment_type_check" CHECK ((adjustment_type = ANY (ARRAY['fixed_price'::text, 'add_amount'::text, 'multiply_percent'::text, 'add_minutes'::text]))),
  CONSTRAINT "crm_pricing_rules_rule_type_check" CHECK ((rule_type = ANY (ARRAY['breed_size'::text, 'weight_band'::text, 'coat_type'::text, 'behavior'::text, 'duration'::text, 'location'::text, 'day_of_week'::text, 'time_of_day'::text, 'tier'::text, 'custom'::text]))),
  CONSTRAINT "crm_pricing_rules_check1" CHECK (((effective_to IS NULL) OR (effective_from IS NULL) OR (effective_to >= effective_from))),
  CONSTRAINT "crm_pricing_rules_check" CHECK (((max_value IS NULL) OR (min_value IS NULL) OR (max_value >= min_value))),
  CONSTRAINT "crm_pricing_rules_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_pricing_rules_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."crm_product_recommendations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid,
  "dependent_id" uuid,
  "appointment_id" uuid,
  "catalog_item_id" uuid,
  "product_name" text NOT NULL,
  "recommended_by" uuid,
  "reason" text,
  "priority" text NOT NULL DEFAULT 'suggested'::text,
  "status" text NOT NULL DEFAULT 'open'::text,
  "presented_at" timestamp with time zone,
  "responded_at" timestamp with time zone,
  "resulting_sale_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_product_recommendations_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'presented'::text, 'accepted'::text, 'declined'::text, 'purchased'::text, 'expired'::text]))),
  CONSTRAINT "crm_product_recommendations_priority_check" CHECK ((priority = ANY (ARRAY['suggested'::text, 'recommended'::text, 'required'::text]))),
  CONSTRAINT "crm_product_recommendations_check" CHECK (((customer_id IS NOT NULL) OR (dependent_id IS NOT NULL))),
  CONSTRAINT "crm_product_recommendations_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_product_recommendations_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."crm_saved_views" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "name" text NOT NULL,
  "query" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "owner_user_id" uuid,
  "entity_type" text NOT NULL,
  "filters" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "columns" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "sort_definition" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_shared" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_saved_views_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_saved_views_user_name_key" UNIQUE (user_id, name)
);
CREATE TABLE IF NOT EXISTS public."crm_search_index" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "search_text" text NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_search_index_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_search_index_tenant_id_entity_type_entity_id_key" UNIQUE (tenant_id, entity_type, entity_id)
);
CREATE TABLE IF NOT EXISTS public."crm_segment_memberships" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "segment_id" uuid NOT NULL,
  "customer_id" uuid,
  "entered_at" timestamp with time zone NOT NULL DEFAULT now(),
  "exited_at" timestamp with time zone,
  "dependent_id" uuid,
  CONSTRAINT "crm_segment_memberships_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_segments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "entity_type" text NOT NULL,
  "definition" jsonb NOT NULL,
  "segment_type" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_segments_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_service_location_availability" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "service_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "duration_minutes" integer,
  "price" numeric(18,4),
  "is_active" boolean NOT NULL DEFAULT true,
  CONSTRAINT "crm_service_location_availability_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_service_location_availability_service_id_location_id_key" UNIQUE (service_id, location_id)
);
CREATE TABLE IF NOT EXISTS public."crm_service_package_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "package_id" uuid NOT NULL,
  "service_id" uuid NOT NULL,
  "quantity" integer NOT NULL DEFAULT 1,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_service_package_items_quantity_check" CHECK ((quantity > 0)),
  CONSTRAINT "crm_service_package_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_service_package_items_tenant_id_package_id_service_id_key" UNIQUE (tenant_id, package_id, service_id)
);
CREATE TABLE IF NOT EXISTS public."crm_service_packages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "package_type" text NOT NULL DEFAULT 'bundle'::text,
  "price" numeric(12,2) NOT NULL DEFAULT 0,
  "visit_count" integer,
  "valid_days" integer,
  "discount_percent" numeric(6,3),
  "is_active" boolean NOT NULL DEFAULT true,
  "bookable_online" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_service_packages_valid_days_check" CHECK (((valid_days IS NULL) OR (valid_days > 0))),
  CONSTRAINT "crm_service_packages_discount_percent_check" CHECK (((discount_percent IS NULL) OR ((discount_percent >= (0)::numeric) AND (discount_percent <= (100)::numeric)))),
  CONSTRAINT "crm_service_packages_visit_count_check" CHECK (((visit_count IS NULL) OR (visit_count > 0))),
  CONSTRAINT "crm_service_packages_price_check" CHECK ((price >= (0)::numeric)),
  CONSTRAINT "crm_service_packages_package_type_check" CHECK ((package_type = ANY (ARRAY['bundle'::text, 'prepaid_visits'::text, 'membership'::text, 'seasonal'::text]))),
  CONSTRAINT "crm_service_packages_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_service_packages_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "crm_service_packages_tenant_id_slug_key" UNIQUE (tenant_id, slug)
);
CREATE TABLE IF NOT EXISTS public."crm_services" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "code" text,
  "description" text,
  "category" text,
  "default_duration_minutes" integer NOT NULL DEFAULT 60,
  "default_price" numeric(18,4) NOT NULL DEFAULT 0,
  "deposit_required" boolean NOT NULL DEFAULT false,
  "default_deposit_amount" numeric(18,4) NOT NULL DEFAULT 0,
  "rebooking_interval_days" integer,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "service_category" text NOT NULL DEFAULT 'full_groom'::text,
  "is_add_on" boolean NOT NULL DEFAULT false,
  "parent_service_id" uuid,
  "bookable_online" boolean NOT NULL DEFAULT true,
  "image_url" text,
  CONSTRAINT "crm_services_default_duration_minutes_check" CHECK (((default_duration_minutes >= 5) AND (default_duration_minutes <= 1440))),
  CONSTRAINT "crm_services_service_category_check" CHECK ((service_category = ANY (ARRAY['full_groom'::text, 'bath_and_brush'::text, 'a_la_carte'::text, 'add_on'::text, 'package'::text, 'other'::text]))),
  CONSTRAINT "crm_services_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_services_tenant_id_code_key" UNIQUE (tenant_id, code),
  CONSTRAINT "crm_services_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."crm_settings" (
  "tenant_id" uuid NOT NULL,
  "default_timezone" text NOT NULL DEFAULT 'America/Chicago'::text,
  "default_currency" text NOT NULL DEFAULT 'USD'::text,
  "default_appointment_duration_minutes" integer NOT NULL DEFAULT 120,
  "default_rebooking_days" integer NOT NULL DEFAULT 42,
  "inactive_after_days" integer NOT NULL DEFAULT 90,
  "at_risk_after_days" integer NOT NULL DEFAULT 90,
  "birthday_campaign_enabled" boolean NOT NULL DEFAULT true,
  "vaccine_reminder_enabled" boolean NOT NULL DEFAULT true,
  "rebooking_automation_enabled" boolean NOT NULL DEFAULT true,
  "require_upfront_deposit" boolean NOT NULL DEFAULT false,
  "deposit_percent" numeric(5,2),
  "deposit_flat_amount" numeric(12,2),
  "cancellation_cutoff_minutes" integer NOT NULL DEFAULT 1440,
  "no_show_penalty_amount" numeric(12,2) NOT NULL DEFAULT 0,
  "max_booking_horizon_days" integer NOT NULL DEFAULT 90,
  "station_turnaround_buffer_minutes" integer NOT NULL DEFAULT 15,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "online_booking_enabled" boolean NOT NULL DEFAULT false,
  "online_booking_requires_approval" boolean NOT NULL DEFAULT true,
  "online_booking_lead_time_hours" integer NOT NULL DEFAULT 24,
  "new_client_booking_enabled" boolean NOT NULL DEFAULT false,
  "waitlist_enabled" boolean NOT NULL DEFAULT false,
  "notification_frequency" text NOT NULL DEFAULT 'immediate'::text,
  CONSTRAINT "crm_settings_default_appointment_duration_minutes_check" CHECK (((default_appointment_duration_minutes >= 5) AND (default_appointment_duration_minutes <= 1440))),
  CONSTRAINT "crm_settings_online_booking_lead_time_hours_check" CHECK ((online_booking_lead_time_hours >= 0)),
  CONSTRAINT "crm_settings_notification_frequency_check" CHECK ((notification_frequency = ANY (ARRAY['immediate'::text, 'hourly_digest'::text, 'daily_digest'::text, 'off'::text]))),
  CONSTRAINT "crm_settings_pkey" PRIMARY KEY (tenant_id)
);
CREATE TABLE IF NOT EXISTS public."crm_shift_templates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "location_id" uuid,
  "day_of_week" smallint NOT NULL,
  "starts_at" time without time zone NOT NULL,
  "ends_at" time without time zone NOT NULL,
  "break_minutes" integer NOT NULL DEFAULT 0,
  "role" text,
  "required_headcount" integer NOT NULL DEFAULT 1,
  "color_label" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "effective_from" date NOT NULL DEFAULT CURRENT_DATE,
  "effective_to" date,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_shift_templates_day_of_week_check" CHECK (((day_of_week >= 0) AND (day_of_week <= 6))),
  CONSTRAINT "crm_shift_templates_check" CHECK ((ends_at > starts_at)),
  CONSTRAINT "crm_shift_templates_break_minutes_check" CHECK ((break_minutes >= 0)),
  CONSTRAINT "crm_shift_templates_required_headcount_check" CHECK ((required_headcount >= 0)),
  CONSTRAINT "crm_shift_templates_check1" CHECK (((effective_to IS NULL) OR (effective_to >= effective_from))),
  CONSTRAINT "crm_shift_templates_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_shift_templates_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."crm_staff" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "user_id" uuid,
  "display_name" text NOT NULL,
  "first_name" text,
  "last_name" text,
  "email" text,
  "phone" text,
  "role" text NOT NULL DEFAULT 'staff'::text,
  "is_service_staff" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "default_location_id" uuid,
  "color_label" text,
  "hire_date" date,
  "termination_date" date,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "image_url" text,
  "bio" text,
  "service_specialties" text[] NOT NULL DEFAULT '{}'::text[],
  "certifications" text[] NOT NULL DEFAULT '{}'::text[],
  "show_on_website" boolean NOT NULL DEFAULT false,
  "max_daily_appointments" integer,
  "commission_rate" numeric,
  "salary_period" text,
  "register_pin_hash" text,
  CONSTRAINT "crm_staff_max_daily_appointments_check" CHECK (((max_daily_appointments IS NULL) OR (max_daily_appointments > 0))),
  CONSTRAINT "crm_staff_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_staff_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "crm_staff_tenant_id_user_id_key" UNIQUE (tenant_id, user_id)
);
CREATE TABLE IF NOT EXISTS public."crm_staff_availability" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "staff_id" uuid NOT NULL,
  "location_id" uuid,
  "day_of_week" smallint NOT NULL,
  "available_from" time without time zone NOT NULL,
  "available_to" time without time zone NOT NULL,
  "availability_type" text NOT NULL DEFAULT 'preferred'::text,
  "effective_from" date NOT NULL DEFAULT CURRENT_DATE,
  "effective_to" date,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_staff_availability_check" CHECK ((available_to > available_from)),
  CONSTRAINT "crm_staff_availability_check1" CHECK (((effective_to IS NULL) OR (effective_to >= effective_from))),
  CONSTRAINT "crm_staff_availability_day_of_week_check" CHECK (((day_of_week >= 0) AND (day_of_week <= 6))),
  CONSTRAINT "crm_staff_availability_availability_type_check" CHECK ((availability_type = ANY (ARRAY['preferred'::text, 'available'::text, 'unavailable'::text]))),
  CONSTRAINT "crm_staff_availability_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_staff_availability_tenant_id_staff_id_day_of_week_avail_key" UNIQUE (tenant_id, staff_id, day_of_week, available_from, effective_from)
);
CREATE TABLE IF NOT EXISTS public."crm_staff_commission_assignments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "staff_id" uuid NOT NULL,
  "plan_id" uuid NOT NULL,
  "override_rate_percent" numeric(6,3),
  "effective_from" date NOT NULL DEFAULT CURRENT_DATE,
  "effective_to" date,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_staff_commission_assignments_override_rate_percent_check" CHECK (((override_rate_percent IS NULL) OR ((override_rate_percent >= (0)::numeric) AND (override_rate_percent <= (100)::numeric)))),
  CONSTRAINT "crm_staff_commission_assignments_check" CHECK (((effective_to IS NULL) OR (effective_to >= effective_from))),
  CONSTRAINT "crm_staff_commission_assignments_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_staff_commission_assignme_tenant_id_staff_id_plan_id_ef_key" UNIQUE (tenant_id, staff_id, plan_id, effective_from)
);
CREATE TABLE IF NOT EXISTS public."crm_staff_documents" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "staff_id" uuid NOT NULL,
  "document_type" text NOT NULL,
  "name" text NOT NULL,
  "storage_path" text,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "uploaded_at" timestamp with time zone,
  "expires_at" date,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_staff_documents_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'submitted'::text, 'approved'::text, 'expired'::text, 'rejected'::text]))),
  CONSTRAINT "crm_staff_documents_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_staff_documents_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."crm_staff_incident_reports" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "staff_id" uuid NOT NULL,
  "appointment_id" uuid,
  "dependent_id" uuid,
  "severity" text NOT NULL DEFAULT 'low'::text,
  "description" text NOT NULL,
  "action_taken" text,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_staff_incident_reports_severity_check" CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
  CONSTRAINT "crm_staff_incident_reports_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_staff_incident_reports_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."crm_staff_performance_notes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "staff_id" uuid NOT NULL,
  "note_type" text NOT NULL DEFAULT 'review'::text,
  "body" text NOT NULL,
  "rating" numeric(3,1),
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_staff_performance_notes_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_staff_performance_notes_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."crm_staff_shifts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "staff_id" uuid NOT NULL,
  "location_id" uuid,
  "shift_template_id" uuid,
  "shift_date" date NOT NULL,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "break_minutes" integer NOT NULL DEFAULT 0,
  "role" text,
  "status" text NOT NULL DEFAULT 'scheduled'::text,
  "published_at" timestamp with time zone,
  "confirmed_at" timestamp with time zone,
  "checked_in_at" timestamp with time zone,
  "checked_out_at" timestamp with time zone,
  "is_overtime" boolean NOT NULL DEFAULT false,
  "swap_requested_by" uuid,
  "swap_approved_by" uuid,
  "notes" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_staff_shifts_break_minutes_check" CHECK ((break_minutes >= 0)),
  CONSTRAINT "crm_staff_shifts_check" CHECK ((ends_at > starts_at)),
  CONSTRAINT "crm_staff_shifts_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'published'::text, 'confirmed'::text, 'in_progress'::text, 'completed'::text, 'no_show'::text, 'cancelled'::text, 'swapped'::text]))),
  CONSTRAINT "crm_staff_shifts_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_staff_shifts_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."crm_staff_time_clock_entries" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "staff_id" uuid NOT NULL,
  "clock_in" timestamp with time zone NOT NULL,
  "clock_out" timestamp with time zone,
  "source" text NOT NULL DEFAULT 'portal'::text,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_staff_time_clock_entries_check" CHECK (((clock_out IS NULL) OR (clock_out > clock_in))),
  CONSTRAINT "crm_staff_time_clock_entries_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_staff_time_clock_entries_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."crm_staff_training_records" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "staff_id" uuid NOT NULL,
  "training_name" text NOT NULL,
  "completed_at" date,
  "expires_at" date,
  "certificate_uri" text,
  "status" text NOT NULL DEFAULT 'in_progress'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_staff_training_records_status_check" CHECK ((status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'expired'::text]))),
  CONSTRAINT "crm_staff_training_records_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_staff_training_records_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."crm_surcharges" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "surcharge_type" text NOT NULL,
  "calc_method" text NOT NULL DEFAULT 'flat_amount'::text,
  "amount" numeric(12,2) NOT NULL DEFAULT 0,
  "percent" numeric(6,3),
  "auto_apply" boolean NOT NULL DEFAULT false,
  "requires_approval" boolean NOT NULL DEFAULT false,
  "taxable" boolean NOT NULL DEFAULT true,
  "commissionable" boolean NOT NULL DEFAULT true,
  "applies_to_service_id" uuid,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_surcharges_amount_check" CHECK ((amount >= (0)::numeric)),
  CONSTRAINT "crm_surcharges_calc_method_check" CHECK ((calc_method = ANY (ARRAY['flat_amount'::text, 'percent_of_service'::text, 'per_minute'::text]))),
  CONSTRAINT "crm_surcharges_percent_check" CHECK (((percent IS NULL) OR ((percent >= (0)::numeric) AND (percent <= (100)::numeric)))),
  CONSTRAINT "crm_surcharges_surcharge_type_check" CHECK ((surcharge_type = ANY (ARRAY['weekend'::text, 'holiday'::text, 'severe_matting'::text, 'senior_pet'::text, 'aggressive_pet'::text, 'late_pickup'::text, 'no_show'::text, 'express'::text, 'de_shedding'::text, 'flea_treatment'::text, 'special_handling'::text, 'travel'::text, 'other'::text]))),
  CONSTRAINT "crm_surcharges_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_surcharges_tenant_id_code_key" UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS public."crm_tags" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "is_system" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "color" text,
  CONSTRAINT "crm_tags_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_tasks" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid,
  "lead_id" uuid,
  "appointment_id" uuid,
  "assigned_to" uuid,
  "created_by" uuid,
  "task_type" text NOT NULL,
  "priority" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "due_at" timestamp with time zone,
  "status" text NOT NULL,
  "completed_at" timestamp with time zone,
  "snoozed_until" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_tasks_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."crm_time_off_requests" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "staff_id" uuid NOT NULL,
  "request_type" text NOT NULL DEFAULT 'pto'::text,
  "starts_on" date NOT NULL,
  "ends_on" date NOT NULL,
  "is_partial_day" boolean NOT NULL DEFAULT false,
  "starts_at_time" time without time zone,
  "ends_at_time" time without time zone,
  "hours_requested" numeric(6,2),
  "reason" text,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  "blocks_booking" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_time_off_requests_check" CHECK ((ends_on >= starts_on)),
  CONSTRAINT "crm_time_off_requests_request_type_check" CHECK ((request_type = ANY (ARRAY['pto'::text, 'unpaid'::text, 'sick'::text, 'bereavement'::text, 'jury_duty'::text, 'parental'::text, 'other'::text]))),
  CONSTRAINT "crm_time_off_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'cancelled'::text, 'withdrawn'::text]))),
  CONSTRAINT "crm_time_off_requests_hours_requested_check" CHECK (((hours_requested IS NULL) OR (hours_requested >= (0)::numeric))),
  CONSTRAINT "crm_time_off_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "crm_time_off_requests_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."crm_waitlist" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "dependent_id" uuid,
  "service_id" uuid,
  "location_id" uuid,
  "preferred_staff_id" uuid,
  "requested_start_at" timestamp with time zone,
  "requested_end_at" timestamp with time zone,
  "priority" integer NOT NULL DEFAULT 100,
  "status" text NOT NULL DEFAULT 'waiting'::text,
  "expires_at" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "crm_waitlist_status_check" CHECK ((status = ANY (ARRAY['waiting'::text, 'offered'::text, 'booked'::text, 'expired'::text, 'cancelled'::text]))),
  CONSTRAINT "crm_waitlist_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."currencies" (
  "code" text NOT NULL,
  "name" text NOT NULL,
  "symbol" text NOT NULL,
  "precision" integer NOT NULL DEFAULT 2,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "currencies_pkey" PRIMARY KEY (code)
);
CREATE TABLE IF NOT EXISTS public."customer_addresses" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "label" text,
  "first_name" text,
  "last_name" text,
  "company" text,
  "line1" text NOT NULL,
  "line2" text,
  "city" text NOT NULL,
  "state" text,
  "postal_code" text NOT NULL,
  "country_code" text NOT NULL DEFAULT 'US'::text,
  "phone" text,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "customer_addresses_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."customer_ai_disclosure_acks" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid,
  "user_id" uuid,
  "feature" text NOT NULL,
  "acknowledged_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "customer_ai_disclosure_acks_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."customer_memberships" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" text NOT NULL,
  "plan_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'active'::text,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "ends_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "customer_memberships_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."customer_notifications" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "tenant_id" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  "customerId" text NOT NULL,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "link" text,
  "relatedId" text,
  "readAt" timestamp with time zone,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "customer_notifications_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."customer_return_requests" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "tenant_id" uuid,
  "order_id" uuid,
  "order_number" text NOT NULL,
  "order_email" text NOT NULL,
  "customer_id" uuid,
  "auth_user_id" uuid,
  "seller_id" uuid,
  "request_type" text NOT NULL,
  "reason_code" text NOT NULL,
  "item_name" text,
  "item_sku" text,
  "quantity" integer NOT NULL DEFAULT 1,
  "details" text,
  "status" text NOT NULL DEFAULT 'requested'::text,
  "admin_notes" text,
  "seller_response" text,
  "seller_read_at" timestamp with time zone,
  "handled_by" text,
  CONSTRAINT "customer_return_requests_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."customer_statements" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "customer_id" text NOT NULL,
  "statement_type" text NOT NULL DEFAULT 'ar_aging'::text,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "opening_balance" numeric(18,4) NOT NULL DEFAULT 0,
  "closing_balance" numeric(18,4) NOT NULL DEFAULT 0,
  "payload" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "customer_statements_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."customer_wishlist_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "product_id" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "customer_wishlist_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "customer_wishlist_items_tenant_id_customer_id_product_id_key" UNIQUE (tenant_id, customer_id, product_id)
);
CREATE TABLE IF NOT EXISTS public."customers" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "firstName" text,
  "lastName" text,
  "email" text,
  "phone" text,
  "stripeCustomerId" text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "address" text,
  "addressLine2" text,
  "city" text,
  "state" text,
  "postalCode" text,
  "customerStatus" text DEFAULT 'ACTIVE'::text,
  "emailMarketingOptIn" boolean DEFAULT false,
  "smsMarketingOptIn" boolean DEFAULT false,
  "emailTransactionalOptIn" boolean DEFAULT true,
  "smsTransactionalOptIn" boolean DEFAULT true,
  "userId" text,
  "search_vector" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english'::regconfig, search_text(VARIADIC ARRAY["firstName", "lastName", email, phone, address, "addressLine2", city, state, "postalCode", "customerStatus"])), 'A'::"char")) STORED,
  "tenant_id" uuid,
  "ar_account_id" uuid,
  "ap_account_id" uuid,
  "currency" text NOT NULL DEFAULT 'USD'::text,
  CONSTRAINT "customers_pkey" PRIMARY KEY (id),
  CONSTRAINT "customers_email_key" UNIQUE (email)
);
CREATE TABLE IF NOT EXISTS public."design_assets" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "project_id" uuid,
  "design_id" uuid,
  "kind" text NOT NULL,
  "surface" text,
  "storage_path" text NOT NULL,
  "bucket" text NOT NULL DEFAULT 'design-assets'::text,
  "mime_type" text,
  "width" integer,
  "height" integer,
  "print_dpi" integer,
  "provider" text,
  "prompt" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "design_assets_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."design_files" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "design_id" uuid NOT NULL,
  "placement" text NOT NULL DEFAULT 'front'::text,
  "file_url" text NOT NULL,
  "width_px" integer NOT NULL,
  "height_px" integer NOT NULL,
  "dpi" integer NOT NULL DEFAULT 300,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "design_files_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."design_publications" (
  "id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "design_id" uuid NOT NULL,
  "product_variant_id" uuid NOT NULL,
  "collection_id" uuid,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "mockup_url" text,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "design_publications_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))),
  CONSTRAINT "design_publications_pkey" PRIMARY KEY (id, tenant_id),
  CONSTRAINT "design_publications_id_key" UNIQUE (id)
);
CREATE TABLE IF NOT EXISTS public."designs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "owner_id" uuid,
  "name" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "source" text NOT NULL DEFAULT 'konva'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "canvas_state" jsonb,
  "supplier_catalog_product_id" uuid,
  "print_area" jsonb,
  "updated_at" timestamp with time zone DEFAULT now(),
  "project_id" uuid,
  "product_title" text,
  "description" text,
  "retail_price" numeric,
  "category_id" uuid,
  "collection_id" uuid,
  "garment_color" text,
  "product_type" text,
  "print_file_path" text,
  "mockup_path" text,
  "published_product_id" uuid,
  CONSTRAINT "designs_source_check" CHECK ((source = ANY (ARRAY['konva'::text, 'upload'::text, 'ai_draft'::text]))),
  CONSTRAINT "designs_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'needs_review'::text, 'ready_to_publish'::text, 'publishing'::text, 'published'::text, 'publish_failed'::text, 'approved'::text, 'archived'::text]))),
  CONSTRAINT "designs_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."dmca_counter_notices" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "ticket_id" uuid NOT NULL,
  "dmca_details_id" uuid NOT NULL,
  "received_at" timestamp with time zone NOT NULL DEFAULT now(),
  "submitter_name" text,
  "submitter_email" text,
  "submitter_address" text,
  "submitter_phone" text,
  "submitter_signature_text" text,
  "signed_at" timestamp with time zone,
  "prior_location" text,
  "jurisdiction_consent" boolean NOT NULL DEFAULT false,
  "perjury_attested" boolean NOT NULL DEFAULT false,
  "elements_complete" boolean NOT NULL DEFAULT false,
  "missing_elements" jsonb NOT NULL,
  "forwarded_to_complainant_at" timestamp with time zone,
  "complainant_suit_notice_at" timestamp with time zone,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dmca_counter_notices_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."dmca_designated_agent" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "agent_name" text,
  "agent_email" text,
  "agent_address" text,
  "agent_phone" text,
  "registered_at" timestamp with time zone,
  "renewal_due_at" timestamp with time zone,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dmca_designated_agent_pkey" PRIMARY KEY (id),
  CONSTRAINT "dmca_designated_agent_tenant_uniq" UNIQUE (tenant_id)
);
CREATE TABLE IF NOT EXISTS public."dmca_details" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "ticket_id" uuid NOT NULL,
  "notice_kind" text NOT NULL,
  "received_via" text NOT NULL,
  "complainant_name" text,
  "complainant_email" text,
  "complainant_address" text,
  "complainant_phone" text,
  "complainant_is_agent" boolean NOT NULL DEFAULT false,
  "represented_owner" text,
  "signature_text" text,
  "signed_at" timestamp with time zone,
  "copyrighted_work_description" text,
  "copyrighted_work_url" text,
  "infringing_urls" jsonb NOT NULL,
  "good_faith_attested" boolean NOT NULL DEFAULT false,
  "perjury_attested" boolean NOT NULL DEFAULT false,
  "elements_complete" boolean NOT NULL DEFAULT false,
  "missing_elements" jsonb NOT NULL,
  "target_seller_id" uuid,
  "target_listing_ref" text,
  "workflow_status" text NOT NULL,
  "acknowledged_at" timestamp with time zone,
  "reviewed_at" timestamp with time zone,
  "actioned_at" timestamp with time zone,
  "uploader_notified_at" timestamp with time zone,
  "counter_notice_due_at" timestamp with time zone,
  "restored_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "row_version" integer NOT NULL DEFAULT 1,
  "authorized_agent_for_owner" boolean NOT NULL DEFAULT false,
  "rights_owner_name" text,
  "work_type" text,
  "registration_number" text,
  "signature_kind" text,
  "signature_attachment_id" uuid,
  "notice_received_at" timestamp with time zone,
  "target_listing_snapshot" jsonb NOT NULL,
  "takedown_at" timestamp with time zone,
  "takedown_by" uuid,
  "restore_not_before_at" timestamp with time zone,
  "restore_not_after_at" timestamp with time zone,
  "restored_by" uuid,
  CONSTRAINT "dmca_details_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."dmca_strikes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "ticket_id" uuid NOT NULL,
  "seller_id" uuid,
  "strike_at" timestamp with time zone NOT NULL DEFAULT now(),
  "status" text NOT NULL,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dmca_strikes_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."dmca_takedown_log" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "ticket_id" uuid NOT NULL,
  "dmca_details_id" uuid,
  "action" text NOT NULL,
  "listing_ref" text,
  "seller_id" uuid,
  "actor_staff_id" uuid,
  "detail" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dmca_takedown_log_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."dropship_pipe_attempts" (
  "attempt_key" text NOT NULL,
  "supplier_order_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "order_id" text NOT NULL,
  "supplier_id" text NOT NULL,
  "state" text NOT NULL DEFAULT 'pending'::text,
  "mapped_payload" jsonb,
  "supplier_order_ref" text,
  "last_error" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "claimed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dropship_pipe_attempts_state_check" CHECK ((state = ANY (ARRAY['pending'::text, 'placing'::text, 'placed'::text, 'dry_run'::text, 'unknown_outcome'::text, 'reconciled'::text, 'failed'::text, 'blocked'::text]))),
  CONSTRAINT "dropship_pipe_attempts_pkey" PRIMARY KEY (attempt_key)
);
CREATE TABLE IF NOT EXISTS public."dropship_pipe_mappings" (
  "supplier_id" text NOT NULL,
  "product_id" text NOT NULL,
  "sku" text NOT NULL DEFAULT ''::text,
  "cache_key" text NOT NULL,
  "supplier_sku" text NOT NULL,
  "options" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source" text NOT NULL DEFAULT 'model'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "dropship_pipe_mappings_pkey" PRIMARY KEY (supplier_id, product_id, sku)
);
CREATE TABLE IF NOT EXISTS public."ecommerce_orders" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "order_number" text,
  "storefront_order_id" uuid NOT NULL,
  "erp_order_id" uuid,
  "crm_customer_id" uuid,
  "customer_email" text,
  "customer_name" text,
  "customer_phone" text,
  "shipping_address" jsonb,
  "status" text NOT NULL,
  "payment_status" text,
  "fulfillment_status" text NOT NULL DEFAULT 'not_started'::text,
  "subtotal" numeric,
  "shipping_total" numeric,
  "tax_total" numeric,
  "total" numeric,
  "currency" text NOT NULL DEFAULT 'USD'::text,
  "stripe_payment_intent_id" text,
  "placed_at" timestamp with time zone NOT NULL,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ecommerce_orders_pkey" PRIMARY KEY (id),
  CONSTRAINT "ecommerce_orders_storefront_order_id_key" UNIQUE (storefront_order_id)
);
CREATE TABLE IF NOT EXISTS public."email_messages" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "customerId" text,
  "toEmail" text NOT NULL,
  "template" text,
  "subject" text,
  "body" text,
  "status" text DEFAULT 'QUEUED'::text,
  "relatedBookingId" text,
  "relatedInvoiceId" text,
  "relatedOrderId" text,
  "providerMessageId" text,
  "sentAt" timestamp with time zone,
  "failedAt" timestamp with time zone,
  "errorMessage" text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "tenant_id" uuid NOT NULL,
  CONSTRAINT "email_messages_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."employee_notifications" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "staff_id" uuid NOT NULL,
  "notification_type" text NOT NULL,
  "title" text,
  "body" text,
  "is_read" boolean DEFAULT false,
  "link" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "employee_notifications_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_audit_log" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid,
  "action" text NOT NULL,
  "before_data" jsonb,
  "after_data" jsonb,
  "actor_id" uuid,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now(),
  "request_id" text,
  "ip_address" inet,
  CONSTRAINT "erp_audit_log_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_carriers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "api_provider" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_carriers_pkey" PRIMARY KEY (id),
  CONSTRAINT "erp_carriers_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "erp_carriers_tenant_id_code_key" UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS public."erp_document_sequences" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "document_type" text NOT NULL,
  "prefix" text NOT NULL,
  "next_number" bigint NOT NULL DEFAULT 1,
  "padding" integer NOT NULL DEFAULT 6,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_document_sequences_padding_check" CHECK (((padding >= 1) AND (padding <= 18))),
  CONSTRAINT "erp_document_sequences_next_number_check" CHECK ((next_number > 0)),
  CONSTRAINT "erp_document_sequences_pkey" PRIMARY KEY (id),
  CONSTRAINT "erp_document_sequences_tenant_id_document_type_key" UNIQUE (tenant_id, document_type)
);
CREATE TABLE IF NOT EXISTS public."erp_fulfillment_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "fulfillment_id" uuid NOT NULL,
  "order_line_id" uuid NOT NULL,
  "sku_id" uuid NOT NULL,
  "quantity" numeric(18,4) NOT NULL,
  "quantity_picked" numeric(18,4) NOT NULL DEFAULT 0,
  "quantity_packed" numeric(18,4) NOT NULL DEFAULT 0,
  "quantity_shipped" numeric(18,4) NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_fulfillment_lines_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_fulfillment_orders" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "fulfillment_number" text NOT NULL,
  "order_id" uuid NOT NULL,
  "warehouse_id" uuid,
  "method" text NOT NULL,
  "status" text NOT NULL,
  "priority" integer NOT NULL DEFAULT 0,
  "rush" boolean NOT NULL DEFAULT false,
  "released_at" timestamp with time zone,
  "packed_at" timestamp with time zone,
  "staged_at" timestamp with time zone,
  "dispatched_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_fulfillment_orders_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_goods_receipt_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "receipt_id" uuid NOT NULL,
  "purchase_order_line_id" uuid,
  "sku_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "lot_id" uuid,
  "quantity_received" numeric(18,4) NOT NULL,
  "unit_cost" numeric(18,6) NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_goods_receipt_lines_quantity_received_check" CHECK ((quantity_received > (0)::numeric)),
  CONSTRAINT "erp_goods_receipt_lines_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_goods_receipts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "receipt_number" text NOT NULL,
  "purchase_order_id" uuid,
  "warehouse_id" uuid NOT NULL,
  "status" erp_receipt_status NOT NULL DEFAULT 'draft'::erp_receipt_status,
  "received_at" timestamp with time zone,
  "received_by" uuid,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_goods_receipts_pkey" PRIMARY KEY (id),
  CONSTRAINT "erp_goods_receipts_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "erp_goods_receipts_tenant_id_receipt_number_key" UNIQUE (tenant_id, receipt_number)
);
CREATE TABLE IF NOT EXISTS public."erp_idempotency_keys" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "idempotency_key" text NOT NULL,
  "operation" text NOT NULL,
  "response_status" integer,
  "response_body" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone,
  CONSTRAINT "erp_idempotency_keys_pkey" PRIMARY KEY (id),
  CONSTRAINT "erp_idempotency_keys_tenant_id_idempotency_key_operation_key" UNIQUE (tenant_id, idempotency_key, operation)
);
CREATE TABLE IF NOT EXISTS public."erp_inventory_balances" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "sku_id" uuid NOT NULL,
  "warehouse_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "inventory_status" text NOT NULL,
  "on_hand" numeric(18,4) NOT NULL DEFAULT 0,
  "reserved" numeric(18,4) NOT NULL DEFAULT 0,
  "allocated" numeric(18,4) NOT NULL DEFAULT 0,
  "picked" numeric(18,4) NOT NULL DEFAULT 0,
  "packed" numeric(18,4) NOT NULL DEFAULT 0,
  "in_transit" numeric(18,4) NOT NULL DEFAULT 0,
  "unit_cost" numeric(18,6) NOT NULL DEFAULT 0,
  "last_counted_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "bin_location" text,
  CONSTRAINT "erp_inventory_balances_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_inventory_cost_layers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "sku_id" uuid NOT NULL,
  "warehouse_id" uuid NOT NULL,
  "lot_id" uuid,
  "costing_method" text NOT NULL DEFAULT 'average'::text,
  "quantity_remaining" numeric(18,4) NOT NULL DEFAULT 0,
  "unit_cost" numeric(18,6) NOT NULL DEFAULT 0,
  "source_movement_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_inventory_cost_layers_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_inventory_count_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "count_session_id" uuid NOT NULL,
  "sku_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "expected_quantity" numeric(18,4) NOT NULL DEFAULT 0,
  "counted_quantity" numeric(18,4),
  "variance_quantity" numeric(18,4),
  "unit_cost" numeric(18,6) NOT NULL DEFAULT 0,
  "variance_value" numeric(20,6),
  "counted_by" uuid,
  "counted_at" timestamp with time zone,
  CONSTRAINT "erp_inventory_count_lines_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_inventory_count_sessions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "count_number" text NOT NULL,
  "warehouse_id" uuid NOT NULL,
  "location_id" uuid,
  "count_type" text NOT NULL DEFAULT 'cycle'::text,
  "status" erp_count_status NOT NULL DEFAULT 'draft'::erp_count_status,
  "scheduled_for" date,
  "started_at" timestamp with time zone,
  "submitted_at" timestamp with time zone,
  "approved_at" timestamp with time zone,
  "posted_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_inventory_count_sessions_pkey" PRIMARY KEY (id),
  CONSTRAINT "erp_inventory_count_sessions_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "erp_inventory_count_sessions_tenant_id_count_number_key" UNIQUE (tenant_id, count_number)
);
CREATE TABLE IF NOT EXISTS public."erp_inventory_lots" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "sku_id" uuid NOT NULL,
  "lot_number" text NOT NULL,
  "manufacture_date" date,
  "expiration_date" date,
  "received_at" timestamp with time zone,
  "status" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_inventory_lots_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_inventory_movements" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "movement_type" text NOT NULL,
  "sku_id" uuid NOT NULL,
  "warehouse_id" uuid,
  "from_location_id" uuid,
  "to_location_id" uuid,
  "lot_id" uuid,
  "serial_number_id" uuid,
  "quantity" numeric(18,4) NOT NULL,
  "unit_cost" numeric(18,6) NOT NULL DEFAULT 0,
  "total_cost" numeric(20,6),
  "source_type" text,
  "source_id" text,
  "reference" text,
  "reason" text,
  "metadata" jsonb NOT NULL,
  "performed_by" uuid,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_inventory_movements_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_inventory_reservations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "sku_id" uuid NOT NULL,
  "warehouse_id" uuid NOT NULL,
  "location_id" uuid,
  "source_order_id" uuid,
  "source_order_line_id" uuid,
  "quantity" numeric(18,4) NOT NULL,
  "status" text NOT NULL DEFAULT 'reserved'::text,
  "priority" integer NOT NULL DEFAULT 0,
  "expires_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "released_at" timestamp with time zone,
  CONSTRAINT "erp_inventory_reservations_status_allowed" CHECK ((status = ANY (ARRAY['pending'::text, 'reserved'::text, 'released'::text, 'fulfilled'::text, 'expired'::text, 'cancelled'::text]))),
  CONSTRAINT "erp_inventory_reservations_quantity_check" CHECK ((quantity > (0)::numeric)),
  CONSTRAINT "erp_inventory_reservations_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_inventory_serial_numbers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "sku_id" uuid NOT NULL,
  "serial_number" text NOT NULL,
  "lot_id" uuid,
  "status" erp_inventory_status NOT NULL DEFAULT 'available'::erp_inventory_status,
  "location_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_inventory_serial_numbers_pkey" PRIMARY KEY (id),
  CONSTRAINT "erp_inventory_serial_numbers_tenant_id_serial_number_key" UNIQUE (tenant_id, serial_number),
  CONSTRAINT "erp_inventory_serial_numbers_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."erp_inventory_transactions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "product_id" uuid,
  "variant_id" uuid,
  "warehouse_id" uuid,
  "transaction_type" text NOT NULL,
  "quantity" integer NOT NULL DEFAULT 0,
  "balance_after" integer,
  "reference_type" text,
  "reference_id" uuid,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_inventory_transactions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_inventory_transfer_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "transfer_id" uuid NOT NULL,
  "sku_id" uuid NOT NULL,
  "quantity" numeric(18,4) NOT NULL,
  "shipped_quantity" numeric(18,4) NOT NULL DEFAULT 0,
  "received_quantity" numeric(18,4) NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_inventory_transfer_lines_check" CHECK ((shipped_quantity <= quantity)),
  CONSTRAINT "erp_inventory_transfer_lines_quantity_check" CHECK ((quantity > (0)::numeric)),
  CONSTRAINT "erp_inventory_transfer_lines_check1" CHECK ((received_quantity <= shipped_quantity)),
  CONSTRAINT "erp_inventory_transfer_lines_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_inventory_transfers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "transfer_number" text NOT NULL,
  "from_warehouse_id" uuid NOT NULL,
  "to_warehouse_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "requested_at" timestamp with time zone,
  "shipped_at" timestamp with time zone,
  "received_at" timestamp with time zone,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_inventory_transfers_check" CHECK ((from_warehouse_id <> to_warehouse_id)),
  CONSTRAINT "erp_inventory_transfers_status_allowed" CHECK ((status = ANY (ARRAY['draft'::text, 'requested'::text, 'approved'::text, 'in_transit'::text, 'received'::text, 'partially_received'::text, 'cancelled'::text]))),
  CONSTRAINT "erp_inventory_transfers_pkey" PRIMARY KEY (id),
  CONSTRAINT "erp_inventory_transfers_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "erp_inventory_transfers_tenant_id_transfer_number_key" UNIQUE (tenant_id, transfer_number)
);
CREATE TABLE IF NOT EXISTS public."erp_order_addresses" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "address_type" text NOT NULL,
  "first_name" text,
  "last_name" text,
  "company" text,
  "line1" text NOT NULL,
  "line2" text,
  "city" text NOT NULL,
  "state" text,
  "postal_code" text,
  "country_code" text NOT NULL,
  "phone" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_order_addresses_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_order_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "sku_id" uuid,
  "description" text,
  "quantity" numeric(18,4) NOT NULL,
  "unit_price" numeric(18,4) NOT NULL DEFAULT 0,
  "discount_amount" numeric(18,4) NOT NULL DEFAULT 0,
  "tax_amount" numeric(18,4) NOT NULL DEFAULT 0,
  "line_total" numeric(18,4) NOT NULL DEFAULT 0,
  "quantity_reserved" numeric(18,4) NOT NULL DEFAULT 0,
  "quantity_allocated" numeric(18,4) NOT NULL DEFAULT 0,
  "quantity_picked" numeric(18,4) NOT NULL DEFAULT 0,
  "quantity_packed" numeric(18,4) NOT NULL DEFAULT 0,
  "quantity_shipped" numeric(18,4) NOT NULL DEFAULT 0,
  "quantity_returned" numeric(18,4) NOT NULL DEFAULT 0,
  "status" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "dependent_id" uuid,
  "design_publication_id" uuid,
  "design_file_snapshot_url" text,
  "storefront_order_item_id" uuid,
  "supplier_catalog_variant_id" uuid,
  "design_snapshot" jsonb,
  CONSTRAINT "erp_order_lines_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_order_notes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "note_type" text NOT NULL,
  "body" text NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_order_notes_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_order_status_history" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "from_status" text,
  "to_status" text NOT NULL,
  "reason" text,
  "changed_by" uuid,
  "changed_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_order_status_history_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_orders" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "order_number" text NOT NULL,
  "source_order_id" text,
  "crm_customer_id" uuid,
  "status" text NOT NULL,
  "fulfillment_method" text NOT NULL,
  "order_date" timestamp with time zone NOT NULL DEFAULT now(),
  "promised_at" timestamp with time zone,
  "sla_due_at" timestamp with time zone,
  "currency" text NOT NULL,
  "subtotal" numeric(18,4) NOT NULL DEFAULT 0,
  "discount_total" numeric(18,4) NOT NULL DEFAULT 0,
  "tax_total" numeric(18,4) NOT NULL DEFAULT 0,
  "shipping_total" numeric(18,4) NOT NULL DEFAULT 0,
  "total" numeric(18,4) NOT NULL DEFAULT 0,
  "amount_paid" numeric(18,4) NOT NULL DEFAULT 0,
  "amount_refunded" numeric(18,4) NOT NULL DEFAULT 0,
  "balance_due" numeric(18,4),
  "priority" integer NOT NULL DEFAULT 0,
  "is_rush" boolean NOT NULL DEFAULT false,
  "customer_email" text,
  "customer_phone" text,
  "notes" text,
  "metadata" jsonb NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "dependent_id" uuid,
  CONSTRAINT "erp_orders_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_package_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "package_id" uuid NOT NULL,
  "fulfillment_line_id" uuid NOT NULL,
  "sku_id" uuid NOT NULL,
  "quantity" numeric(18,4) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_package_items_quantity_check" CHECK ((quantity > (0)::numeric)),
  CONSTRAINT "erp_package_items_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_packages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "fulfillment_id" uuid NOT NULL,
  "package_number" text NOT NULL,
  "package_type" text,
  "weight" numeric(18,6),
  "weight_uom" text DEFAULT 'LB'::text,
  "length" numeric(18,6),
  "width" numeric(18,6),
  "height" numeric(18,6),
  "dimension_uom" text DEFAULT 'IN'::text,
  "packed_by" uuid,
  "packed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_packages_pkey" PRIMARY KEY (id),
  CONSTRAINT "erp_packages_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "erp_packages_tenant_id_package_number_key" UNIQUE (tenant_id, package_number)
);
CREATE TABLE IF NOT EXISTS public."erp_pick_task_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "pick_task_id" uuid NOT NULL,
  "fulfillment_line_id" uuid NOT NULL,
  "sku_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "quantity_requested" numeric(18,4) NOT NULL,
  "quantity_picked" numeric(18,4) NOT NULL DEFAULT 0,
  "quantity_short" numeric(18,4) NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_pick_task_lines_quantity_short_check" CHECK ((quantity_short >= (0)::numeric)),
  CONSTRAINT "erp_pick_task_lines_check" CHECK (((quantity_picked + quantity_short) <= quantity_requested)),
  CONSTRAINT "erp_pick_task_lines_quantity_picked_check" CHECK ((quantity_picked >= (0)::numeric)),
  CONSTRAINT "erp_pick_task_lines_quantity_requested_check" CHECK ((quantity_requested > (0)::numeric)),
  CONSTRAINT "erp_pick_task_lines_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_pick_tasks" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "wave_id" uuid,
  "fulfillment_id" uuid NOT NULL,
  "warehouse_id" uuid NOT NULL,
  "assigned_to" uuid,
  "status" erp_pick_status NOT NULL DEFAULT 'pending'::erp_pick_status,
  "priority" integer NOT NULL DEFAULT 0,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_pick_tasks_pkey" PRIMARY KEY (id),
  CONSTRAINT "erp_pick_tasks_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."erp_pick_waves" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "wave_number" text NOT NULL,
  "warehouse_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'open'::text,
  "priority" integer NOT NULL DEFAULT 0,
  "released_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_pick_waves_status_allowed" CHECK ((status = ANY (ARRAY['draft'::text, 'released'::text, 'picking'::text, 'picked'::text, 'packed'::text, 'shipped'::text, 'cancelled'::text]))),
  CONSTRAINT "erp_pick_waves_pkey" PRIMARY KEY (id),
  CONSTRAINT "erp_pick_waves_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "erp_pick_waves_tenant_id_wave_number_key" UNIQUE (tenant_id, wave_number)
);
CREATE TABLE IF NOT EXISTS public."erp_product_barcodes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "sku_id" uuid NOT NULL,
  "barcode" text NOT NULL,
  "barcode_type" text NOT NULL DEFAULT 'UPC'::text,
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_product_barcodes_pkey" PRIMARY KEY (id),
  CONSTRAINT "erp_product_barcodes_tenant_id_barcode_key" UNIQUE (tenant_id, barcode)
);
CREATE TABLE IF NOT EXISTS public."erp_product_categories" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "parent_id" uuid,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_product_categories_pkey" PRIMARY KEY (id),
  CONSTRAINT "erp_product_categories_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "erp_product_categories_tenant_id_code_key" UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS public."erp_product_skus" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "variant_id" uuid,
  "sku" text NOT NULL,
  "barcode" text,
  "uom" text NOT NULL DEFAULT 'EA'::text,
  "unit_price" numeric(18,4) NOT NULL DEFAULT 0,
  "standard_cost" numeric(18,6) NOT NULL DEFAULT 0,
  "weight" numeric(18,6),
  "weight_uom" text,
  "length" numeric(18,6),
  "width" numeric(18,6),
  "height" numeric(18,6),
  "dimension_uom" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_product_skus_pkey" PRIMARY KEY (id),
  CONSTRAINT "erp_product_skus_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "erp_product_skus_tenant_id_sku_key" UNIQUE (tenant_id, sku)
);
CREATE TABLE IF NOT EXISTS public."erp_product_variants" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "name" text NOT NULL,
  "attributes" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_product_variants_pkey" PRIMARY KEY (id),
  CONSTRAINT "erp_product_variants_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."erp_products" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "category_id" uuid,
  "source_product_id" text,
  "product_type" text NOT NULL DEFAULT 'physical'::text,
  "name" text NOT NULL,
  "description" text,
  "brand" text,
  "is_inventory_item" boolean NOT NULL DEFAULT true,
  "is_sellable" boolean NOT NULL DEFAULT true,
  "is_purchasable" boolean NOT NULL DEFAULT true,
  "track_lots" boolean NOT NULL DEFAULT false,
  "track_serial_numbers" boolean NOT NULL DEFAULT false,
  "track_expiration" boolean NOT NULL DEFAULT false,
  "base_uom" text NOT NULL DEFAULT 'EA'::text,
  "standard_cost" numeric(18,6) NOT NULL DEFAULT 0,
  "default_unit_price" numeric(18,4) NOT NULL DEFAULT 0,
  "reorder_point" numeric(18,4) NOT NULL DEFAULT 0,
  "safety_stock" numeric(18,4) NOT NULL DEFAULT 0,
  "maximum_stock" numeric(18,4),
  "lead_time_days" integer NOT NULL DEFAULT 0,
  "minimum_order_quantity" numeric(18,4) NOT NULL DEFAULT 1,
  "order_multiple" numeric(18,4) NOT NULL DEFAULT 1,
  "is_active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_products_pkey" PRIMARY KEY (id),
  CONSTRAINT "erp_products_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "erp_products_tenant_id_source_product_id_key" UNIQUE (tenant_id, source_product_id)
);
CREATE TABLE IF NOT EXISTS public."erp_purchase_order_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "purchase_order_id" uuid NOT NULL,
  "sku_id" uuid,
  "description" text NOT NULL,
  "quantity" numeric NOT NULL DEFAULT 0,
  "quantity_received" numeric NOT NULL DEFAULT 0,
  "unit_cost" numeric NOT NULL DEFAULT 0,
  "line_total" numeric NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "quantity_ordered" numeric(18,4) NOT NULL,
  "tax_amount" numeric(18,4) NOT NULL DEFAULT 0,
  CONSTRAINT "erp_purchase_order_lines_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_purchase_orders" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "po_number" text NOT NULL,
  "vendor_id" uuid,
  "status" text NOT NULL DEFAULT 'ordered'::text,
  "order_date" timestamp with time zone NOT NULL DEFAULT now(),
  "expected_at" timestamp with time zone,
  "received_at" timestamp with time zone,
  "currency" text NOT NULL DEFAULT 'USD'::text,
  "subtotal" numeric NOT NULL DEFAULT 0,
  "tax_total" numeric NOT NULL DEFAULT 0,
  "total" numeric NOT NULL DEFAULT 0,
  "ap_bill_id" uuid,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "warehouse_id" uuid,
  "expected_date" date,
  "shipping_total" numeric(18,4) NOT NULL DEFAULT 0,
  CONSTRAINT "erp_purchase_orders_pkey" PRIMARY KEY (id),
  CONSTRAINT "erp_purchase_orders_tenant_id_po_number_key" UNIQUE (tenant_id, po_number)
);
CREATE TABLE IF NOT EXISTS public."erp_replenishment_recommendations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "sku_id" uuid NOT NULL,
  "warehouse_id" uuid NOT NULL,
  "vendor_id" uuid,
  "status" erp_replenishment_status NOT NULL DEFAULT 'recommended'::erp_replenishment_status,
  "current_on_hand" numeric(18,4) NOT NULL DEFAULT 0,
  "reserved_quantity" numeric(18,4) NOT NULL DEFAULT 0,
  "available_quantity" numeric(18,4) NOT NULL DEFAULT 0,
  "recommended_quantity" numeric(18,4) NOT NULL,
  "reason" text,
  "recommended_at" timestamp with time zone NOT NULL DEFAULT now(),
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_replenishment_recommendations_recommended_quantity_check" CHECK ((recommended_quantity > (0)::numeric)),
  CONSTRAINT "erp_replenishment_recommendations_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_replenishment_rules" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "sku_id" uuid NOT NULL,
  "warehouse_id" uuid NOT NULL,
  "method" text NOT NULL,
  "reorder_point" numeric(18,4) NOT NULL DEFAULT 0,
  "safety_stock" numeric(18,4) NOT NULL DEFAULT 0,
  "maximum_stock" numeric(18,4),
  "economic_order_quantity" numeric(18,4),
  "lead_time_days" integer NOT NULL DEFAULT 0,
  "review_period_days" integer NOT NULL DEFAULT 7,
  "preferred_vendor_id" uuid,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_replenishment_rules_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_return_authorizations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "rma_number" text NOT NULL,
  "order_id" uuid NOT NULL,
  "crm_customer_id" uuid,
  "status" text NOT NULL,
  "reason_code" text,
  "requested_at" timestamp with time zone NOT NULL DEFAULT now(),
  "approved_at" timestamp with time zone,
  "received_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_return_authorizations_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_return_inspections" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "rma_id" uuid NOT NULL,
  "return_line_id" uuid NOT NULL,
  "condition_code" text,
  "disposition" erp_return_disposition,
  "notes" text,
  "inspected_by" uuid,
  "inspected_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_return_inspections_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_return_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "rma_id" uuid NOT NULL,
  "order_line_id" uuid NOT NULL,
  "sku_id" uuid NOT NULL,
  "quantity_requested" numeric(18,4) NOT NULL,
  "quantity_received" numeric(18,4) NOT NULL DEFAULT 0,
  "quantity_approved" numeric(18,4) NOT NULL DEFAULT 0,
  "disposition" text,
  "refund_amount" numeric(18,4) NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_return_lines_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_return_refunds" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "rma_id" uuid NOT NULL,
  "amount" numeric(18,4) NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD'::text,
  "payment_reference" text,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "processed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_return_refunds_status_allowed" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'processing'::text, 'completed'::text, 'failed'::text]))),
  CONSTRAINT "erp_return_refunds_amount_check" CHECK ((amount > (0)::numeric)),
  CONSTRAINT "erp_return_refunds_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_shipment_packages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "shipment_id" uuid NOT NULL,
  "package_id" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_shipment_packages_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_shipments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "shipment_number" text NOT NULL,
  "fulfillment_id" uuid NOT NULL,
  "carrier_id" uuid,
  "shipping_method_id" uuid,
  "status" text NOT NULL,
  "tracking_number" text,
  "tracking_url" text,
  "label_url" text,
  "shipped_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_shipments_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_shipping_methods" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "carrier_id" uuid,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "service_level" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_shipping_methods_pkey" PRIMARY KEY (id),
  CONSTRAINT "erp_shipping_methods_tenant_id_code_key" UNIQUE (tenant_id, code),
  CONSTRAINT "erp_shipping_methods_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."erp_stock_levels" (
  "tenant_id" uuid,
  "sku_id" uuid,
  "warehouse_id" uuid,
  "location_id" uuid,
  "on_hand" numeric,
  "reserved" numeric,
  "allocated" numeric
);
CREATE TABLE IF NOT EXISTS public."erp_tracking_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "shipment_id" uuid NOT NULL,
  "event_code" text NOT NULL,
  "event_status" text,
  "location_text" text,
  "event_at" timestamp with time zone NOT NULL,
  "raw_payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_tracking_events_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_uom_conversions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "sku_id" uuid,
  "from_uom" text NOT NULL,
  "to_uom" text NOT NULL,
  "conversion_factor" numeric(18,8) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_uom_conversions_conversion_factor_check" CHECK ((conversion_factor > (0)::numeric)),
  CONSTRAINT "erp_uom_conversions_pkey" PRIMARY KEY (id),
  CONSTRAINT "erp_uom_conversions_tenant_id_sku_id_from_uom_to_uom_key" UNIQUE (tenant_id, sku_id, from_uom, to_uom)
);
CREATE TABLE IF NOT EXISTS public."erp_vendor_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "vendor_id" uuid NOT NULL,
  "sku_id" uuid NOT NULL,
  "vendor_sku" text,
  "unit_cost" numeric(18,6) NOT NULL DEFAULT 0,
  "minimum_order_quantity" numeric(18,4) NOT NULL DEFAULT 1,
  "order_multiple" numeric(18,4) NOT NULL DEFAULT 1,
  "lead_time_days" integer NOT NULL DEFAULT 0,
  "is_preferred" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_vendor_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "erp_vendor_items_vendor_id_sku_id_key" UNIQUE (vendor_id, sku_id)
);
CREATE TABLE IF NOT EXISTS public."erp_vendors" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "vendor_number" text NOT NULL,
  "name" text NOT NULL,
  "email" text,
  "phone" text,
  "tax_identifier" text,
  "payment_terms" text,
  "currency" text DEFAULT 'USD'::text,
  "is_active" boolean NOT NULL DEFAULT true,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_vendors_pkey" PRIMARY KEY (id),
  CONSTRAINT "erp_vendors_tenant_id_vendor_number_key" UNIQUE (tenant_id, vendor_number),
  CONSTRAINT "erp_vendors_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."erp_warehouse_locations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "warehouse_id" uuid NOT NULL,
  "zone_id" uuid,
  "parent_location_id" uuid,
  "code" text NOT NULL,
  "name" text,
  "location_type" text NOT NULL,
  "aisle" text,
  "rack" text,
  "shelf" text,
  "bin" text,
  "pick_sequence" integer,
  "capacity_quantity" numeric(18,4),
  "is_pickable" boolean NOT NULL DEFAULT true,
  "is_receiving" boolean NOT NULL DEFAULT false,
  "is_shipping" boolean NOT NULL DEFAULT false,
  "is_returns" boolean NOT NULL DEFAULT false,
  "is_quarantine" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_warehouse_locations_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_warehouse_zones" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "warehouse_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "zone_type" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "erp_warehouse_zones_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."erp_warehouses" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "warehouse_type" text NOT NULL,
  "address_line1" text,
  "address_line2" text,
  "city" text,
  "state" text,
  "postal_code" text,
  "country_code" text,
  "timezone" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "commerce_branch_id" uuid,
  "crm_location_id" uuid,
  CONSTRAINT "erp_warehouses_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."estimate_items" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "estimate_id" uuid NOT NULL,
  "product_id" text,
  "account_id" uuid NOT NULL,
  "tax_id" uuid,
  "description" text,
  "quantity" numeric(18,4) NOT NULL DEFAULT 1,
  "unit_price" numeric(18,4) NOT NULL DEFAULT 0,
  "discount" numeric(18,4) NOT NULL DEFAULT 0,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "estimate_items_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."estimates" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "number" text NOT NULL,
  "customer_id" text NOT NULL,
  "issue_date" date NOT NULL,
  "expiry_date" date,
  "status" estimate_status NOT NULL DEFAULT 'draft'::estimate_status,
  "currency" text NOT NULL DEFAULT 'USD'::text,
  "exchange_rate" numeric(18,8) NOT NULL DEFAULT 1.0,
  "subtotal" numeric(18,4) NOT NULL DEFAULT 0,
  "tax_total" numeric(18,4) NOT NULL DEFAULT 0,
  "total" numeric(18,4) NOT NULL DEFAULT 0,
  "notes" text,
  "terms" text,
  "converted_invoice_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "estimates_pkey" PRIMARY KEY (id),
  CONSTRAINT "estimates_tenant_id_number_key" UNIQUE (tenant_id, number)
);
CREATE TABLE IF NOT EXISTS public."faqs" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "question" text NOT NULL,
  "answer" text NOT NULL,
  "order" integer DEFAULT 0,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  "tenant_id" uuid NOT NULL,
  "node_id" uuid,
  "slug" text,
  "is_published" boolean DEFAULT true,
  "display_order" integer DEFAULT 0,
  CONSTRAINT "faqs_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."feedback_submissions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text,
  "email" text NOT NULL,
  "topic" text NOT NULL DEFAULT 'general'::text,
  "rating" integer,
  "message" text NOT NULL,
  "source" text NOT NULL DEFAULT 'site'::text,
  "page_path" text,
  "support_ticket_id" uuid,
  "status" text NOT NULL DEFAULT 'new'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "feedback_submissions_status_check" CHECK ((status = ANY (ARRAY['new'::text, 'reviewed'::text, 'closed'::text]))),
  CONSTRAINT "feedback_submissions_rating_check" CHECK (((rating IS NULL) OR ((rating >= 1) AND (rating <= 5)))),
  CONSTRAINT "feedback_submissions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."fsm_child_instances" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "case_id" uuid NOT NULL,
  "child_key" text NOT NULL,
  "machine" text NOT NULL,
  "current_state" text NOT NULL,
  "return_state" text,
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "fsm_child_instances_pkey" PRIMARY KEY (id),
  CONSTRAINT "fsm_child_instances_case_id_child_key_key" UNIQUE (case_id, child_key)
);
CREATE TABLE IF NOT EXISTS public."fsm_transitions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "type" text NOT NULL,
  "from_state" text NOT NULL,
  "event" text NOT NULL,
  "guard" text,
  "to_state" text NOT NULL,
  "note" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "fsm_transitions_pkey" PRIMARY KEY (id),
  CONSTRAINT "fsm_transitions_type_from_state_event_guard_key" UNIQUE (type, from_state, event, guard)
);
CREATE TABLE IF NOT EXISTS public."fulfillment_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "fulfillment_order_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "order_item_id" uuid NOT NULL,
  "supplier_catalog_variant_external_id" text NOT NULL,
  "placement_file_urls" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "design_snapshot" jsonb,
  CONSTRAINT "fulfillment_items_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."fulfillment_label_attempts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "package_id" uuid NOT NULL,
  "order_id" text NOT NULL,
  "attempt_key" text NOT NULL,
  "provider" text NOT NULL DEFAULT 'shippo'::text,
  "status" text NOT NULL DEFAULT 'started'::text,
  "shipment_id" text,
  "rate_id" text,
  "transaction_id" text,
  "error" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "fulfillment_label_attempts_status_check" CHECK ((status = ANY (ARRAY['started'::text, 'shipment_recorded'::text, 'unknown'::text, 'confirmed'::text, 'failed'::text]))),
  CONSTRAINT "fulfillment_label_attempts_pkey" PRIMARY KEY (id),
  CONSTRAINT "fulfillment_label_attempts_attempt_key_key" UNIQUE (attempt_key),
  CONSTRAINT "fulfillment_label_attempts_tenant_id_package_id_key" UNIQUE (tenant_id, package_id)
);
CREATE TABLE IF NOT EXISTS public."fulfillment_orders" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL,
  "route_id" uuid,
  "supplier_order_external_id" text,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "tracking_number" text,
  "tracking_url" text,
  "cost" numeric(10,2),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "fulfillment_orders_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'in_production'::text, 'shipped'::text, 'delivered'::text, 'failed'::text, 'cancelled'::text]))),
  CONSTRAINT "fulfillment_orders_pkey" PRIMARY KEY (id, tenant_id),
  CONSTRAINT "fulfillment_orders_id_key" UNIQUE (id)
);
CREATE TABLE IF NOT EXISTS public."fulfillment_package_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "package_id" uuid NOT NULL,
  "order_item_id" text NOT NULL,
  "quantity" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "fulfillment_package_lines_quantity_check" CHECK ((quantity > 0)),
  CONSTRAINT "fulfillment_package_lines_pkey" PRIMARY KEY (id),
  CONSTRAINT "fulfillment_package_lines_package_id_order_item_id_key" UNIQUE (package_id, order_item_id)
);
CREATE TABLE IF NOT EXISTS public."fulfillment_packages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "order_id" text NOT NULL,
  "seller_order_id" text,
  "seller_id" uuid,
  "group_key" text NOT NULL,
  "source" text NOT NULL DEFAULT 'quote'::text,
  "fulfillment_method" text NOT NULL DEFAULT 'ship'::text,
  "origin_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "parcel_snapshot" jsonb,
  "packaging_plan" text,
  "service_level" text,
  "service_snapshot" jsonb,
  "state" text NOT NULL DEFAULT 'awaiting_eligibility'::text,
  "tracking_number" text,
  "carrier" text,
  "tracking_status" text,
  "label_id" text,
  "label_url" text,
  "label_provider" text,
  "label_cost_cents" integer,
  "label_test_mode" boolean,
  "label_purchased_at" timestamp with time zone,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "fulfillment_packages_source_check" CHECK ((source = ANY (ARRAY['quote'::text, 'legacy'::text]))),
  CONSTRAINT "fulfillment_packages_state_check" CHECK ((state = ANY (ARRAY['awaiting_eligibility'::text, 'ready_for_label'::text, 'label_requested'::text, 'label_available'::text, 'in_transit'::text, 'out_for_delivery'::text, 'delivered'::text, 'exception'::text, 'cancelled'::text]))),
  CONSTRAINT "fulfillment_packages_pkey" PRIMARY KEY (id),
  CONSTRAINT "fulfillment_packages_tenant_id_order_id_group_key_key" UNIQUE (tenant_id, order_id, group_key)
);
CREATE TABLE IF NOT EXISTS public."gallery_photos" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "alt" text NOT NULL,
  "category" text DEFAULT 'GROOMING'::text,
  "image" text NOT NULL,
  "order" integer DEFAULT 0,
  "visible" boolean DEFAULT true,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  "tenant_id" uuid NOT NULL,
  CONSTRAINT "gallery_photos_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."gated_brands" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "brand" text NOT NULL,
  "match_key" text NOT NULL,
  "tier" text NOT NULL,
  "evidence_note" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "gated_brands_tier_check" CHECK ((tier = ANY (ARRAY['hard_ban'::text, 'authorized_only'::text]))),
  CONSTRAINT "gated_brands_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."geo_zip_cache" (
  "cell_key" text NOT NULL,
  "zip" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  CONSTRAINT "geo_zip_cache_pkey" PRIMARY KEY (cell_key)
);
CREATE TABLE IF NOT EXISTS public."goods_receipt_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "goods_receipt_id" uuid NOT NULL,
  "po_line_id" uuid NOT NULL,
  "qty_received" integer NOT NULL,
  "lot_number" text,
  "expiry_date" date,
  CONSTRAINT "goods_receipt_lines_qty_received_check" CHECK ((qty_received > 0)),
  CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."goods_receipts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "purchase_order_id" uuid NOT NULL,
  "location_id" uuid NOT NULL,
  "receipt_number" text NOT NULL,
  "received_at" timestamp with time zone NOT NULL DEFAULT now(),
  "received_by" text,
  "notes" text,
  CONSTRAINT "goods_receipts_pkey" PRIMARY KEY (id),
  CONSTRAINT "goods_receipts_tenant_id_receipt_number_key" UNIQUE (tenant_id, receipt_number)
);
CREATE TABLE IF NOT EXISTS public."google_ga4_daily" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "property_id" text NOT NULL,
  "report_date" date NOT NULL,
  "sessions" integer NOT NULL DEFAULT 0,
  "users" integer NOT NULL DEFAULT 0,
  "conversions" numeric NOT NULL DEFAULT 0,
  "revenue" numeric NOT NULL DEFAULT 0,
  "pulled_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "google_ga4_daily_pkey" PRIMARY KEY (id),
  CONSTRAINT "google_ga4_daily_property_id_report_date_key" UNIQUE (property_id, report_date)
);
CREATE TABLE IF NOT EXISTS public."google_ga4_landing_pages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "property_id" text NOT NULL,
  "report_date" date NOT NULL,
  "landing_page" text NOT NULL,
  "sessions" integer NOT NULL DEFAULT 0,
  "pulled_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "google_ga4_landing_pages_pkey" PRIMARY KEY (id),
  CONSTRAINT "google_ga4_landing_pages_property_id_report_date_landing_pa_key" UNIQUE (property_id, report_date, landing_page)
);
CREATE TABLE IF NOT EXISTS public."google_indexing_submissions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "url" text NOT NULL,
  "page_type" text,
  "notify_type" text NOT NULL DEFAULT 'URL_UPDATED'::text,
  "source" text NOT NULL DEFAULT 'sweep'::text,
  "status" text NOT NULL DEFAULT 'submitted'::text,
  "last_error" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "last_submitted_at" timestamp with time zone,
  "content_modified_at" timestamp with time zone,
  "last_attempt_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "google_indexing_submissions_source_check" CHECK ((source = ANY (ARRAY['sweep'::text, 'admin'::text]))),
  CONSTRAINT "google_indexing_submissions_status_check" CHECK ((status = ANY (ARRAY['submitted'::text, 'failed'::text]))),
  CONSTRAINT "google_indexing_submissions_notify_type_check" CHECK ((notify_type = ANY (ARRAY['URL_UPDATED'::text, 'URL_DELETED'::text]))),
  CONSTRAINT "google_indexing_submissions_pkey" PRIMARY KEY (id),
  CONSTRAINT "google_indexing_submissions_url_key" UNIQUE (url)
);
CREATE TABLE IF NOT EXISTS public."google_merchant_sync_runs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "mode" text NOT NULL,
  "inserted" integer NOT NULL DEFAULT 0,
  "updated" integer NOT NULL DEFAULT 0,
  "deleted" integer NOT NULL DEFAULT 0,
  "failed" integer NOT NULL DEFAULT 0,
  "skipped" integer NOT NULL DEFAULT 0,
  "detail" text,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "finished_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "google_merchant_sync_runs_mode_check" CHECK ((mode = ANY (ARRAY['full'::text, 'incremental'::text]))),
  CONSTRAINT "google_merchant_sync_runs_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."google_merchant_sync_state" (
  "offer_id" text NOT NULL,
  "catalog_item_id" text NOT NULL,
  "content_hash" text NOT NULL,
  "state" text NOT NULL DEFAULT 'pushed'::text,
  "google_product_name" text,
  "last_error" text,
  "pushed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "google_merchant_sync_state_state_check" CHECK ((state = ANY (ARRAY['pushed'::text, 'failed'::text, 'deleted'::text]))),
  CONSTRAINT "google_merchant_sync_state_pkey" PRIMARY KEY (offer_id)
);
CREATE TABLE IF NOT EXISTS public."google_property_sync_runs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "leg" text NOT NULL,
  "status" text NOT NULL,
  "detail" text,
  "rows_upserted" integer NOT NULL DEFAULT 0,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "finished_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "google_property_sync_runs_leg_check" CHECK ((leg = ANY (ARRAY['search_console'::text, 'ga4'::text]))),
  CONSTRAINT "google_property_sync_runs_status_check" CHECK ((status = ANY (ARRAY['ok'::text, 'disabled'::text, 'error'::text, 'skipped'::text]))),
  CONSTRAINT "google_property_sync_runs_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."google_search_console_daily" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "property_url" text NOT NULL,
  "page_url" text NOT NULL,
  "report_date" date NOT NULL,
  "clicks" integer NOT NULL DEFAULT 0,
  "impressions" integer NOT NULL DEFAULT 0,
  "ctr" double precision NOT NULL DEFAULT 0,
  "position" double precision NOT NULL DEFAULT 0,
  "pulled_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "google_search_console_daily_pkey" PRIMARY KEY (id),
  CONSTRAINT "google_search_console_daily_property_url_page_url_report_da_key" UNIQUE (property_url, page_url, report_date)
);
CREATE TABLE IF NOT EXISTS public."google_search_console_sitemaps" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "property_url" text NOT NULL,
  "sitemap_path" text NOT NULL,
  "last_submitted" timestamp with time zone,
  "last_downloaded" timestamp with time zone,
  "is_pending" boolean NOT NULL DEFAULT false,
  "warnings" integer NOT NULL DEFAULT 0,
  "errors" integer NOT NULL DEFAULT 0,
  "pulled_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "google_search_console_sitemaps_pkey" PRIMARY KEY (id),
  CONSTRAINT "google_search_console_sitemaps_property_url_sitemap_path_key" UNIQUE (property_url, sitemap_path)
);
CREATE TABLE IF NOT EXISTS public."identity_grants" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "scope" text NOT NULL,
  "role" text,
  "membership_role" text,
  "tenant_id" uuid,
  "display_name" text,
  "station_name" text,
  "status" text NOT NULL DEFAULT 'active'::text,
  "source" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "location_ids" uuid[] DEFAULT '{}'::uuid[],
  "capabilities" text[] DEFAULT '{}'::text[],
  CONSTRAINT "identity_grants_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."integration_keys" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "key_name" character varying(120) NOT NULL,
  "encrypted_value" text NOT NULL,
  "updated_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "integration_keys_pkey" PRIMARY KEY (id),
  CONSTRAINT "integration_keys_tenant_id_key_name_key" UNIQUE (tenant_id, key_name)
);
CREATE TABLE IF NOT EXISTS public."integration_secrets" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "service_key" text NOT NULL,
  "field_key" text NOT NULL,
  "service_name" text NOT NULL,
  "category" text NOT NULL,
  "label" text NOT NULL,
  "value_encrypted" text NOT NULL,
  "last_four" text,
  "is_set" boolean NOT NULL DEFAULT true,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" text,
  CONSTRAINT "integration_secrets_pkey" PRIMARY KEY (id),
  CONSTRAINT "integration_secrets_service_key_field_key_key" UNIQUE (service_key, field_key)
);
CREATE TABLE IF NOT EXISTS public."inventory_items" (
  "id" text NOT NULL DEFAULT gen_random_uuid(),
  "sku" text,
  "name" text NOT NULL,
  "description" text,
  "category" text,
  "brand" text,
  "unit" text NOT NULL,
  "quantity_on_hand" numeric(12,2) NOT NULL DEFAULT 0,
  "reorder_level" numeric(12,2) NOT NULL DEFAULT 0,
  "reorder_quantity" numeric(12,2),
  "unit_cost" numeric(12,2),
  "supplier" text,
  "supplier_sku" text,
  "location" text,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "tenant_id" uuid,
  "search_vector" tsvector,
  "account_id" uuid,
  "supplier_id" uuid,
  "variety" text,
  "product_variant_id" uuid,
  "supplier_catalog_product_id" uuid,
  "supplier_catalog_variant_id" uuid,
  CONSTRAINT "inventory_items_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."inventory_levels" (
  "location_id" uuid NOT NULL,
  "variant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "on_hand" integer NOT NULL DEFAULT 0,
  "reserved" integer NOT NULL DEFAULT 0,
  "reorder_point" integer,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "tenant_id" uuid NOT NULL DEFAULT '652fd2be-d19a-4778-835d-db38094d7718'::uuid,
  CONSTRAINT "inventory_levels_pkey" PRIMARY KEY (location_id, variant_id, seller_id)
);
CREATE TABLE IF NOT EXISTS public."inventory_transactions" (
  "id" text NOT NULL DEFAULT gen_random_uuid(),
  "inventory_item_id" text NOT NULL,
  "transaction_type" text NOT NULL,
  "quantity" numeric(12,2) NOT NULL,
  "unit_cost" numeric(12,2),
  "reason" text,
  "reference_number" text,
  "supplier" text,
  "order_id" text,
  "booking_id" text,
  "performed_by" text,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "tenant_id" uuid,
  "search_vector" tsvector,
  "journal_id" uuid,
  CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."invoice_items" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "invoiceId" text NOT NULL,
  "description" text,
  "quantity" integer DEFAULT 1,
  "unitPrice" text,
  "totalPrice" text,
  "createdAt" timestamp with time zone DEFAULT now(),
  "tenant_id" uuid NOT NULL,
  CONSTRAINT "invoice_items_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."invoices" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "customerId" text NOT NULL,
  "bookingId" text,
  "number" text,
  "status" text DEFAULT 'OPEN'::text,
  "subtotal" text,
  "depositPaid" text,
  "balanceDue" text,
  "total" text,
  "stripeInvoiceId" text,
  "sentAt" timestamp with time zone,
  "paidAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  "search_vector" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english'::regconfig, search_text(VARIADIC ARRAY[id, "customerId", "bookingId", number, status, subtotal, "depositPaid", "balanceDue", total, "stripeInvoiceId"])), 'A'::"char")) STORED,
  "tenant_id" uuid,
  "ar_account_id" uuid,
  "tax_id" uuid,
  "currency" text NOT NULL DEFAULT 'USD'::text,
  "amount_paid" numeric(18,4) NOT NULL DEFAULT 0,
  "dueDate" date,
  "notes" text,
  CONSTRAINT "invoices_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."journal_entries" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "entry_date" date NOT NULL,
  "reference" text,
  "memo" text,
  "source" text NOT NULL DEFAULT 'manual'::text,
  "source_id" text,
  "currency" text NOT NULL DEFAULT 'USD'::text,
  "exchange_rate" numeric(18,8) NOT NULL DEFAULT 1.0,
  "posted" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_by" uuid,
  CONSTRAINT "journal_entries_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."journal_lines" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "journal_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "account_id" uuid NOT NULL,
  "customer_id" text,
  "invoice_id" text,
  "payment_id" text,
  "order_id" text,
  "product_id" text,
  "inventory_item_id" text,
  "tax_id" uuid,
  "description" text,
  "debit" numeric(18,4) NOT NULL DEFAULT 0,
  "credit" numeric(18,4) NOT NULL DEFAULT 0,
  "fc_debit" numeric(18,4) NOT NULL DEFAULT 0,
  "fc_credit" numeric(18,4) NOT NULL DEFAULT 0,
  "fc_currency" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "journal_lines_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."jurisdiction_rules" (
  "type" text NOT NULL,
  "jurisdiction" text NOT NULL,
  "age_of_majority" integer NOT NULL DEFAULT 18,
  "telemedicine_eligible" boolean,
  "required_documents" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "eligibility" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "majority_source_url" text,
  "source_url" text,
  "effective_date" date,
  "checked_at" timestamp with time zone,
  CONSTRAINT "jurisdiction_rules_pkey" PRIMARY KEY (type, jurisdiction)
);
CREATE TABLE IF NOT EXISTS public."licensee_advertisers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "ad_advertiser_id" bigint NOT NULL,
  "display_name" text NOT NULL,
  "contact_email" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "licensee_advertisers_pkey" PRIMARY KEY (id),
  CONSTRAINT "licensee_advertisers_ad_advertiser_id_key" UNIQUE (ad_advertiser_id)
);
CREATE TABLE IF NOT EXISTS public."licensee_api_keys" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "advertiser_id" uuid NOT NULL,
  "key_prefix" text NOT NULL,
  "key_hash" text NOT NULL,
  "name" text NOT NULL DEFAULT 'Default key'::text,
  "scopes" text[] NOT NULL DEFAULT ARRAY['ads:read'::text, 'ads:write'::text, 'store:read'::text],
  "last_used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "licensee_api_keys_pkey" PRIMARY KEY (id),
  CONSTRAINT "licensee_api_keys_key_hash_key" UNIQUE (key_hash)
);
CREATE TABLE IF NOT EXISTS public."licensee_creative_designs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "advertiser_id" uuid NOT NULL,
  "campaign_id" bigint,
  "creative_id" bigint,
  "product_id" uuid,
  "headline" text,
  "body" text,
  "cta" text,
  "image_url" text,
  "click_url" text,
  "background" text NOT NULL DEFAULT '#ffffff'::text,
  "layout" text NOT NULL DEFAULT 'card'::text,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "licensee_creative_designs_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."location_hour_exceptions" (
  "location_id" uuid NOT NULL,
  "on_date" date NOT NULL,
  "opens" time without time zone,
  "closes" time without time zone,
  "is_closed" boolean NOT NULL DEFAULT true,
  "note" text,
  CONSTRAINT "location_hour_exceptions_pkey" PRIMARY KEY (location_id, on_date)
);
CREATE TABLE IF NOT EXISTS public."location_hours" (
  "location_id" uuid NOT NULL,
  "day_of_week" smallint NOT NULL,
  "opens" time without time zone,
  "closes" time without time zone,
  "is_closed" boolean NOT NULL DEFAULT false,
  CONSTRAINT "location_hours_day_of_week_check" CHECK (((day_of_week >= 0) AND (day_of_week <= 6))),
  CONSTRAINT "location_hours_pkey" PRIMARY KEY (location_id, day_of_week)
);
CREATE TABLE IF NOT EXISTS public."locations" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  "name" text NOT NULL,
  "type" text DEFAULT 'Main Location'::text,
  "address" text,
  "city" text,
  "state" text,
  "zip" text,
  "phone" text,
  "email" text,
  "manager" text,
  "status" text DEFAULT 'Active'::text,
  "station_count" integer DEFAULT 4,
  "operating_hours" text DEFAULT 'Mon-Sat: 8:00 AM – 6:00 PM'::text,
  "is_default" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "seller_id" uuid,
  "location_type" text,
  "slug" text,
  "address_line1" text,
  "address_line2" text,
  "region" text,
  "postal_code" text,
  "country" character(2) DEFAULT 'US'::bpchar,
  "latitude" numeric(9,6),
  "longitude" numeric(9,6),
  "timezone" text DEFAULT 'America/Chicago'::text,
  "is_pickup_enabled" boolean DEFAULT false,
  "is_services_enabled" boolean DEFAULT false,
  "is_ship_from" boolean DEFAULT false,
  CONSTRAINT "locations_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."marketing_suppressions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "contact" text NOT NULL,
  "channel" text NOT NULL,
  "source" text NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "marketing_suppressions_channel_check" CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text]))),
  CONSTRAINT "marketing_suppressions_pkey" PRIMARY KEY (id),
  CONSTRAINT "marketing_suppressions_tenant_id_contact_channel_key" UNIQUE (tenant_id, contact, channel)
);
CREATE TABLE IF NOT EXISTS public."membership_plans" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "price" numeric(10,2),
  "billing_interval" text NOT NULL DEFAULT 'month'::text,
  "benefits" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'active'::text,
  CONSTRAINT "membership_plans_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text]))),
  CONSTRAINT "membership_plans_billing_interval_check" CHECK ((billing_interval = ANY (ARRAY['month'::text, 'year'::text]))),
  CONSTRAINT "membership_plans_pkey" PRIMARY KEY (id),
  CONSTRAINT "membership_plans_tenant_id_slug_key" UNIQUE (tenant_id, slug)
);
CREATE TABLE IF NOT EXISTS public."merchandising_modules" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "logic" text NOT NULL,
  CONSTRAINT "merchandising_modules_logic_check" CHECK ((logic = ANY (ARRAY['rule'::text, 'behavioral'::text, 'curated'::text]))),
  CONSTRAINT "merchandising_modules_pkey" PRIMARY KEY (id),
  CONSTRAINT "merchandising_modules_tenant_id_slug_key" UNIQUE (tenant_id, slug)
);
CREATE TABLE IF NOT EXISTS public."message_flags" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "message_id" uuid NOT NULL,
  "reporter_type" text NOT NULL,
  "reporter_id" uuid,
  "reason" text,
  "status" text NOT NULL DEFAULT 'open'::text,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "message_flags_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'dismissed'::text, 'actioned'::text]))),
  CONSTRAINT "message_flags_reporter_type_check" CHECK ((reporter_type = ANY (ARRAY['customer'::text, 'seller'::text, 'staff'::text]))),
  CONSTRAINT "message_flags_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."newsletter" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "email" text NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now(),
  "tenant_id" uuid NOT NULL,
  CONSTRAINT "newsletter_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."newsletter_subscribers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "email" text NOT NULL,
  "source" text NOT NULL DEFAULT 'storefront'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "confirm_token" text,
  "confirmed_at" timestamp with time zone,
  CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY (id),
  CONSTRAINT "newsletter_subscribers_email_key" UNIQUE (email)
);
CREATE TABLE IF NOT EXISTS public."node_associations" (
  "source_node_id" uuid NOT NULL,
  "target_node_id" uuid NOT NULL,
  "reason" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  CONSTRAINT "node_associations_check" CHECK ((source_node_id <> target_node_id)),
  CONSTRAINT "node_associations_pkey" PRIMARY KEY (source_node_id, target_node_id)
);
CREATE TABLE IF NOT EXISTS public."node_filter_values" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "node_filter_id" uuid NOT NULL,
  "attribute_value_id" uuid NOT NULL,
  "sort_order" integer NOT NULL,
  "is_visible" boolean NOT NULL DEFAULT true,
  "added_by" text NOT NULL DEFAULT 'document'::text,
  "needs_review" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "node_filter_values_added_by_check" CHECK ((added_by = ANY (ARRAY['document'::text, 'cms'::text, 'admin'::text]))),
  CONSTRAINT "node_filter_values_pkey" PRIMARY KEY (id),
  CONSTRAINT "node_filter_values_node_filter_id_attribute_value_id_key" UNIQUE (node_filter_id, attribute_value_id)
);
CREATE TABLE IF NOT EXISTS public."node_filters" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "node_id" uuid NOT NULL,
  "attribute_id" uuid NOT NULL,
  "sort_order" integer NOT NULL,
  "value_source" text NOT NULL,
  "display_type" text NOT NULL DEFAULT 'checkbox'::text,
  "ui_toggle" text,
  "is_searchable" boolean NOT NULL DEFAULT false,
  "is_expanded_default" boolean NOT NULL DEFAULT false,
  "is_required" boolean NOT NULL DEFAULT false,
  "allow_new_values" boolean NOT NULL DEFAULT true,
  "added_by" text NOT NULL DEFAULT 'document'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "node_filters_added_by_check" CHECK ((added_by = ANY (ARRAY['document'::text, 'cms'::text, 'admin'::text]))),
  CONSTRAINT "node_filters_value_source_check" CHECK ((value_source = ANY (ARRAY['predefined'::text, 'cms'::text, 'computed'::text, 'brand'::text]))),
  CONSTRAINT "node_filters_ui_toggle_check" CHECK ((ui_toggle = ANY (ARRAY['show_all'::text, 'collapse'::text]))),
  CONSTRAINT "node_filters_display_type_check" CHECK ((display_type = ANY (ARRAY['checkbox'::text, 'range'::text, 'rating'::text, 'link'::text]))),
  CONSTRAINT "node_filters_pkey" PRIMARY KEY (id),
  CONSTRAINT "node_filters_node_id_attribute_id_key" UNIQUE (node_id, attribute_id)
);
CREATE TABLE IF NOT EXISTS public."oauth_states" (
  "nonce" text NOT NULL,
  "portal" text NOT NULL,
  "redirect_to" text NOT NULL DEFAULT '/customer/dashboard'::text,
  "expires_at" timestamp with time zone NOT NULL,
  "used" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "redirect_uri" text,
  "return_origin" text,
  "browser_hash" text,
  CONSTRAINT "oauth_states_pkey" PRIMARY KEY (nonce)
);
CREATE TABLE IF NOT EXISTS public."offers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "variant_id" uuid NOT NULL,
  "price" numeric(10,2) NOT NULL,
  "compare_at_price" numeric(10,2),
  "member_price" numeric(10,2),
  "currency" character(3) NOT NULL DEFAULT 'USD'::bpchar,
  "item_condition" text NOT NULL DEFAULT 'new'::text,
  "fulfillment_method" text NOT NULL DEFAULT 'retailer'::text,
  "handling_days" smallint NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "offers_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'suppressed'::text]))),
  CONSTRAINT "offers_compare_at_price_check" CHECK ((compare_at_price >= (0)::numeric)),
  CONSTRAINT "offers_fulfillment_method_check" CHECK ((fulfillment_method = ANY (ARRAY['retailer'::text, 'seller'::text]))),
  CONSTRAINT "offers_item_condition_check" CHECK ((item_condition = ANY (ARRAY['new'::text, 'refurbished'::text]))),
  CONSTRAINT "offers_member_price_check" CHECK ((member_price >= (0)::numeric)),
  CONSTRAINT "offers_price_check" CHECK ((price >= (0)::numeric)),
  CONSTRAINT "offers_pkey" PRIMARY KEY (id),
  CONSTRAINT "offers_seller_id_variant_id_key" UNIQUE (seller_id, variant_id)
);
CREATE TABLE IF NOT EXISTS public."onboarding_cases" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "user_id" uuid,
  "applicant_email" text NOT NULL,
  "type" text NOT NULL,
  "state" text NOT NULL DEFAULT 'DRAFT'::text,
  "config_version" integer NOT NULL DEFAULT 1,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "applicant_token_hash" text,
  "applicant_token_expires_at" timestamp with time zone,
  "email_otp_hash" text,
  "email_otp_expires_at" timestamp with time zone,
  "email_otp_attempts" integer NOT NULL DEFAULT 0,
  "email_verified_at" timestamp with time zone,
  "phone_otp_hash" text,
  "phone_otp_expires_at" timestamp with time zone,
  "phone_otp_attempts" integer NOT NULL DEFAULT 0,
  "phone_verified_at" timestamp with time zone,
  "phone_otp_pending_vendor" boolean NOT NULL DEFAULT false,
  "current_fsm_state" text,
  "fsm_return_state" text,
  "fsm_jurisdiction" text,
  CONSTRAINT "onboarding_cases_type_check" CHECK ((type = ANY (ARRAY['individual_seller'::text, 'business_seller'::text, 'groomer'::text, 'pharmacy'::text, 'veterinarian'::text, 'manufacturer'::text, 'franchise'::text]))),
  CONSTRAINT "onboarding_cases_state_check" CHECK ((state = ANY (ARRAY['DRAFT'::text, 'CLASSIFIED'::text, 'AGE_CLEARED'::text, 'ACCOUNT_VERIFIED'::text, 'IN_GATES'::text, 'READY_FOR_REVIEW'::text, 'UNDER_REVIEW'::text, 'NEEDS_INFO'::text, 'BLOCKED_PENDING'::text, 'APPROVED'::text, 'ACTIVE'::text, 'RESTRICTED'::text, 'SUSPENDED'::text, 'OFFBOARDED'::text, 'REJECTED'::text]))),
  CONSTRAINT "onboarding_cases_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."onboarding_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "case_id" uuid NOT NULL,
  "from_state" text,
  "to_state" text NOT NULL,
  "actor" text NOT NULL,
  "reason" text,
  "evidence_ref" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "onboarding_events_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."onboarding_gates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "case_id" uuid NOT NULL,
  "gate_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "attempts" integer NOT NULL DEFAULT 0,
  "evidence_ref" text,
  "decided_by" text,
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "onboarding_gates_gate_key_check" CHECK ((gate_key = ANY (ARRAY['G0'::text, 'G1'::text, 'G2'::text, 'G3'::text, 'G4'::text, 'G5'::text, 'G6'::text, 'G7'::text, 'G8'::text, 'G9'::text, 'G10'::text, 'G11'::text, 'G12'::text, 'G13'::text, 'G14'::text]))),
  CONSTRAINT "onboarding_gates_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'passed'::text, 'failed'::text, 'blocked'::text, 'needs_info'::text, 'waived'::text, 'not_applicable'::text, 'pending_vendor'::text]))),
  CONSTRAINT "onboarding_gates_pkey" PRIMARY KEY (id),
  CONSTRAINT "onboarding_gates_case_id_gate_key_key" UNIQUE (case_id, gate_key)
);
CREATE TABLE IF NOT EXISTS public."order_cases" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "order_id" text NOT NULL,
  "customer_id" text,
  "customer_email" text,
  "subject" text NOT NULL,
  "reason" text,
  "note" text,
  "status" text NOT NULL DEFAULT 'open'::text,
  "resolution_note" text,
  "created_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "closed_at" timestamp with time zone,
  "closed_by" text,
  "investigation_id" uuid,
  "escalated_at" timestamp with time zone,
  "escalated_by" text,
  CONSTRAINT "order_cases_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text]))),
  CONSTRAINT "order_cases_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."order_customers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "auth_user_id" uuid,
  "email" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "order_customers_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."order_fulfillment_logs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "order_id" uuid,
  "order_item_id" uuid,
  "sku" text,
  "supplier" text NOT NULL,
  "status" text NOT NULL,
  "payload" jsonb,
  "response" jsonb,
  "error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "order_fulfillment_logs_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."order_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "product_variant_id" uuid,
  "design_publication_id" uuid,
  "design_file_snapshot_url" text,
  "quantity" integer NOT NULL DEFAULT 1,
  "unit_price" numeric(10,2) NOT NULL,
  "supplier_catalog_variant_id" uuid,
  "design_snapshot" jsonb,
  CONSTRAINT "order_items_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."order_shipping_estimates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "order_id" uuid,
  "supplier_id" uuid,
  "shipping_profile_id" uuid,
  "method_name" text NOT NULL,
  "destination_country" text NOT NULL,
  "destination_zip" text,
  "estimated_cost" numeric(10,2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD'::text,
  "min_days" integer,
  "max_days" integer,
  "item_count" integer NOT NULL DEFAULT 1,
  "selected" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "order_shipping_estimates_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."orders" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid,
  "stripe_payment_intent_id" text,
  "status" text NOT NULL DEFAULT 'pending_payment'::text,
  "total" numeric(10,2) NOT NULL DEFAULT 0,
  "shipping_address" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "shipping_method" text,
  "shipping_cost" numeric(10,2),
  "shipping_estimate_id" uuid,
  CONSTRAINT "orders_status_check" CHECK ((status = ANY (ARRAY['pending_payment'::text, 'paid'::text, 'fulfilling'::text, 'shipped'::text, 'delivered'::text, 'refunded'::text, 'cancelled'::text]))),
  CONSTRAINT "orders_pkey" PRIMARY KEY (id, tenant_id),
  CONSTRAINT "orders_id_key" UNIQUE (id)
);
CREATE TABLE IF NOT EXISTS public."organizations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "logo" text,
  "website" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "organizations_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."page_components" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "page_type" text NOT NULL,
  "region" text NOT NULL,
  "component" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_enabled" boolean NOT NULL DEFAULT true,
  "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "page_components_pkey" PRIMARY KEY (id),
  CONSTRAINT "page_components_tenant_id_page_type_region_component_key" UNIQUE (tenant_id, page_type, region, component)
);
CREATE TABLE IF NOT EXISTS public."partner_application_documents" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "application_kind" text NOT NULL,
  "application_id" uuid,
  "seller_id" uuid,
  "doc_type" text,
  "document_kind" text,
  "document_type" text,
  "wizard_step" integer,
  "step" integer,
  "file_name" text,
  "filename" text,
  "storage_path" text,
  "storage_key" text,
  "bucket" text,
  "storage_bucket" text DEFAULT 'partner-documents'::text,
  "mime_type" text,
  "mime_declared" text,
  "mime_detected" text,
  "size_bytes" bigint,
  "sha256" text,
  "status" text DEFAULT 'uploaded'::text,
  "verification_task_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "partner_application_documents_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."partner_portals" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'storefront'::text,
  "ingest_url" text,
  "site_url" text,
  "status" text NOT NULL DEFAULT 'active'::text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "partner_portals_pkey" PRIMARY KEY (id),
  CONSTRAINT "partner_portals_tenant_id_slug_key" UNIQUE (tenant_id, slug)
);
CREATE TABLE IF NOT EXISTS public."partner_pushes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "portal_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'queued'::text,
  "external_id" text,
  "external_url" text,
  "error" text,
  "payload" jsonb,
  "pushed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "partner_pushes_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."payment_transactions" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "customer_id" text,
  "booking_id" text,
  "order_id" text,
  "invoice_id" text,
  "provider" text NOT NULL DEFAULT 'stripe'::text,
  "provider_transaction_id" text,
  "transaction_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING'::text,
  "amount" numeric(12,2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD'::text,
  "failure_code" text,
  "failure_message" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "processed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "tenant_id" uuid,
  "search_vector" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english'::regconfig, search_text(VARIADIC ARRAY[id, customer_id, booking_id, order_id, invoice_id, provider, provider_transaction_id, transaction_type, status, (amount)::text, currency, failure_code, failure_message, (metadata)::text])), 'A'::"char")) STORED,
  "deposit_account_id" uuid,
  "ar_account_id" uuid,
  "connected_account_id" text,
  "application_fee_amount" numeric NOT NULL DEFAULT 0,
  CONSTRAINT "payment_transactions_type_check" CHECK ((transaction_type = ANY (ARRAY['AUTHORIZATION'::text, 'CAPTURE'::text, 'PAYMENT'::text, 'REFUND'::text, 'VOID'::text, 'CHARGEBACK'::text, 'ADJUSTMENT'::text]))),
  CONSTRAINT "payment_transactions_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'PROCESSING'::text, 'SUCCEEDED'::text, 'FAILED'::text, 'CANCELLED'::text]))),
  CONSTRAINT "payment_transactions_amount_nonnegative" CHECK ((amount >= (0)::numeric)),
  CONSTRAINT "payment_transactions_application_fee_amount_check" CHECK ((application_fee_amount >= (0)::numeric)),
  CONSTRAINT "payment_transactions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."paypal_webhook_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "provider" text NOT NULL DEFAULT 'paypal'::text,
  "provider_event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "attempts" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "received_at" timestamp with time zone NOT NULL DEFAULT now(),
  "processed_at" timestamp with time zone,
  CONSTRAINT "paypal_webhook_events_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processed'::text, 'failed'::text]))),
  CONSTRAINT "paypal_webhook_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "paypal_webhook_events_provider_event_id_key" UNIQUE (provider_event_id)
);
CREATE TABLE IF NOT EXISTS public."payroll_employees" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "staff_id" text,
  "user_id" text,
  "name" text NOT NULL,
  "email" text,
  "pay_type" text NOT NULL DEFAULT 'hourly'::text,
  "pay_rate" numeric(18,4) NOT NULL DEFAULT 0,
  "pay_schedule" text NOT NULL DEFAULT 'biweekly'::text,
  "hire_date" date,
  "termination_date" date,
  "is_active" boolean NOT NULL DEFAULT true,
  "wage_account_id" uuid,
  "tax_payable_account_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "payroll_employees_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."payroll_run_items" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "payroll_run_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "timesheet_id" uuid,
  "hours_regular" numeric(18,4) NOT NULL DEFAULT 0,
  "hours_overtime" numeric(18,4) NOT NULL DEFAULT 0,
  "gross_wages" numeric(18,4) NOT NULL DEFAULT 0,
  "tax_withheld" numeric(18,4) NOT NULL DEFAULT 0,
  "net_paid" numeric(18,4) NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "commission_amount" numeric NOT NULL DEFAULT 0,
  CONSTRAINT "payroll_run_items_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."payroll_runs" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "number" text NOT NULL,
  "pay_period_start" date NOT NULL,
  "pay_period_end" date NOT NULL,
  "pay_date" date NOT NULL,
  "status" payroll_run_state NOT NULL DEFAULT 'draft'::payroll_run_state,
  "gross_wages" numeric(18,4) NOT NULL DEFAULT 0,
  "tax_withheld" numeric(18,4) NOT NULL DEFAULT 0,
  "net_paid" numeric(18,4) NOT NULL DEFAULT 0,
  "employer_taxes" numeric(18,4) NOT NULL DEFAULT 0,
  "journal_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "payroll_runs_pkey" PRIMARY KEY (id),
  CONSTRAINT "payroll_runs_tenant_id_number_key" UNIQUE (tenant_id, number)
);
CREATE TABLE IF NOT EXISTS public."payroll_tax_forms" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "form_type" text NOT NULL,
  "year" integer NOT NULL,
  "quarter" integer,
  "payload" jsonb,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "filed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "payroll_tax_forms_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."payroll_timesheets" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "week_start" date NOT NULL,
  "week_end" date NOT NULL,
  "hours_regular" numeric(18,4) NOT NULL DEFAULT 0,
  "hours_overtime" numeric(18,4) NOT NULL DEFAULT 0,
  "hours_pto" numeric(18,4) NOT NULL DEFAULT 0,
  "hours_sick" numeric(18,4) NOT NULL DEFAULT 0,
  "notes" text,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "approved_by" text,
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "payroll_timesheets_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."pdp_behavior_scores" (
  "kind" text NOT NULL,
  "item" text NOT NULL,
  "peer" text NOT NULL DEFAULT ''::text,
  "score" numeric NOT NULL,
  "computed_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "pdp_behavior_scores_pkey" PRIMARY KEY (kind, item, peer)
);
CREATE TABLE IF NOT EXISTS public."perk_ledger" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "points" integer NOT NULL,
  "source" text NOT NULL,
  "source_id" text,
  "note" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "perk_ledger_source_check" CHECK ((source = ANY (ARRAY['order'::text, 'booking'::text, 'subscription'::text, 'redemption'::text, 'manual'::text]))),
  CONSTRAINT "perk_ledger_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."perk_rules" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "event" text NOT NULL,
  "points_per_dollar" numeric NOT NULL DEFAULT 1,
  "multiplier" numeric NOT NULL DEFAULT 1,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "perk_rules_event_check" CHECK ((event = ANY (ARRAY['order_completed'::text, 'booking_completed'::text, 'subscription_purchased'::text, 'subscription_renewed'::text]))),
  CONSTRAINT "perk_rules_pkey" PRIMARY KEY (id),
  CONSTRAINT "perk_rules_tenant_id_event_key" UNIQUE (tenant_id, event)
);
CREATE TABLE IF NOT EXISTS public."platform_account_subscriptions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "offer_id" uuid NOT NULL,
  "account_user_id" uuid NOT NULL,
  "account_email" text NOT NULL,
  "user_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "stripe_checkout_session_id" text,
  "checkout_payload" jsonb,
  "cancel_payload" jsonb,
  "cancel_at_period_end" boolean NOT NULL DEFAULT false,
  "started_at" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "canceled_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_account_subscriptions_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text, 'ended'::text]))),
  CONSTRAINT "platform_account_subscriptions_user_type_check" CHECK ((user_type = ANY (ARRAY['customer'::text, 'seller'::text, 'healthcare'::text, 'employee'::text]))),
  CONSTRAINT "platform_account_subscriptions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."platform_admin_access_log" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "actor_user_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "reason" text NOT NULL,
  "accessed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "revoked_at" timestamp with time zone,
  "ip_address" inet,
  CONSTRAINT "platform_admin_access_log_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."platform_admins" (
  "user_id" uuid NOT NULL,
  "granted_by" uuid,
  "granted_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone,
  "reason" text NOT NULL,
  "tenant_id" uuid NOT NULL DEFAULT '652fd2be-d19a-4778-835d-db38094d7718'::uuid,
  CONSTRAINT "platform_admins_pkey" PRIMARY KEY (user_id)
);
CREATE TABLE IF NOT EXISTS public."platform_backups" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "backup_type" text NOT NULL DEFAULT 'full'::text,
  "scope" text NOT NULL DEFAULT 'tenant'::text,
  "status" text NOT NULL DEFAULT 'queued'::text,
  "storage_url" text,
  "size_bytes" bigint,
  "checksum_sha256" text,
  "row_counts" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "error_message" text,
  "requested_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_backups_backup_type_check" CHECK ((backup_type = ANY (ARRAY['full'::text, 'incremental'::text, 'export'::text, 'pre_migration'::text]))),
  CONSTRAINT "platform_backups_size_bytes_check" CHECK (((size_bytes IS NULL) OR (size_bytes >= 0))),
  CONSTRAINT "platform_backups_scope_check" CHECK ((scope = ANY (ARRAY['tenant'::text, 'module'::text, 'table_subset'::text]))),
  CONSTRAINT "platform_backups_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'completed'::text, 'failed'::text, 'expired'::text, 'deleted'::text]))),
  CONSTRAINT "platform_backups_pkey" PRIMARY KEY (id),
  CONSTRAINT "platform_backups_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."platform_capabilities" (
  "tenant_id" uuid,
  "capability_code" text NOT NULL,
  "object_code" text NOT NULL,
  "verb" text NOT NULL,
  "scope_mode" text NOT NULL,
  "risk" text NOT NULL,
  "requires" text[] NOT NULL DEFAULT '{}'::text[],
  "reversible" boolean NOT NULL DEFAULT true,
  "audit" text NOT NULL DEFAULT 'always'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "conditions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "platform_capabilities_risk_check" CHECK ((risk = ANY (ARRAY['read'::text, 'write'::text, 'money'::text, 'irreversible'::text]))),
  CONSTRAINT "platform_capabilities_scope_mode_check" CHECK ((scope_mode = ANY (ARRAY['self'::text, 'grant_scope'::text, 'tenant'::text, 'platform'::text]))),
  CONSTRAINT "platform_capabilities_verb_check" CHECK ((verb = ANY (ARRAY['discover'::text, 'inspect'::text, 'draft'::text, 'amend'::text, 'transition'::text, 'settle'::text, 'converse'::text, 'publish'::text, 'verify'::text, 'enforce'::text, 'measure'::text, 'automate'::text]))),
  CONSTRAINT "platform_capabilities_pkey" PRIMARY KEY (capability_code)
);
CREATE TABLE IF NOT EXISTS public."platform_create_favorites" (
  "user_id" uuid NOT NULL,
  "action_code" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_create_favorites_pkey" PRIMARY KEY (user_id, action_code)
);
CREATE TABLE IF NOT EXISTS public."platform_custom_fields" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "entity_type" text NOT NULL,
  "field_key" text NOT NULL,
  "label" text NOT NULL,
  "field_type" text NOT NULL DEFAULT 'text'::text,
  "options" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_required" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_custom_fields_pkey" PRIMARY KEY (id),
  CONSTRAINT "platform_custom_fields_tenant_id_entity_type_field_key_key" UNIQUE (tenant_id, entity_type, field_key)
);
CREATE TABLE IF NOT EXISTS public."platform_customer_identity_links" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "crm_customer_id" uuid NOT NULL,
  "acct_customer_id" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_customer_identity_links_pkey" PRIMARY KEY (id),
  CONSTRAINT "platform_customer_identity_links_acct_customer_id_key" UNIQUE (acct_customer_id),
  CONSTRAINT "platform_customer_identity_links_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "platform_customer_identity_links_crm_customer_id_key" UNIQUE (crm_customer_id)
);
CREATE TABLE IF NOT EXISTS public."platform_db_contract_metadata" (
  "table_name" text NOT NULL,
  "typescript_type_name" text NOT NULL,
  "description" text,
  "is_tenant_scoped" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_db_contract_metadata_pkey" PRIMARY KEY (table_name)
);
CREATE TABLE IF NOT EXISTS public."platform_feature_flags" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "audience" text NOT NULL,
  "flag_key" text NOT NULL,
  "description" text,
  "enabled" boolean NOT NULL DEFAULT false,
  "created_by" text,
  "updated_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_feature_flags_audience_check" CHECK ((audience = ANY (ARRAY['seller'::text, 'customer'::text, 'employee'::text, 'vet'::text, 'global'::text]))),
  CONSTRAINT "platform_feature_flags_flag_key_check" CHECK ((btrim(flag_key) <> ''::text)),
  CONSTRAINT "platform_feature_flags_pkey" PRIMARY KEY (id),
  CONSTRAINT "platform_feature_flags_tenant_id_audience_flag_key_key" UNIQUE (tenant_id, audience, flag_key)
);
CREATE TABLE IF NOT EXISTS public."platform_feature_tree_coverage" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "feature_path" text NOT NULL,
  "module" text NOT NULL,
  "backing_table" text,
  "is_implemented" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_feature_tree_coverage_pkey" PRIMARY KEY (id),
  CONSTRAINT "platform_feature_tree_coverage_feature_path_key" UNIQUE (feature_path)
);
CREATE TABLE IF NOT EXISTS public."platform_form_field_visibility" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "form_key" text NOT NULL,
  "field_key" text NOT NULL,
  "role_code" text,
  "is_visible" boolean NOT NULL DEFAULT true,
  "updated_by" uuid,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_form_field_visibility_pkey" PRIMARY KEY (id),
  CONSTRAINT "platform_form_field_visibilit_tenant_id_form_key_field_key__key" UNIQUE (tenant_id, form_key, field_key, role_code)
);
CREATE TABLE IF NOT EXISTS public."platform_integration_health_registry" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "integration_code" text NOT NULL,
  "display_name" text NOT NULL,
  "category" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "tenant_id" uuid,
  "status" text NOT NULL DEFAULT 'unknown'::text,
  "last_checked_at" timestamp with time zone,
  "last_success_at" timestamp with time zone,
  "last_error" text,
  "latency_ms" integer,
  "consecutive_failures" integer NOT NULL DEFAULT 0,
  CONSTRAINT "platform_integration_health_registry_status_check" CHECK ((status = ANY (ARRAY['healthy'::text, 'degraded'::text, 'down'::text, 'unknown'::text, 'disabled'::text]))),
  CONSTRAINT "platform_integration_health_registry_pkey" PRIMARY KEY (id),
  CONSTRAINT "platform_integration_health_registry_integration_code_key" UNIQUE (integration_code)
);
CREATE TABLE IF NOT EXISTS public."platform_lens_fields" (
  "tenant_id" uuid,
  "lens_code" text NOT NULL,
  "field_path" text NOT NULL,
  "visibility" text NOT NULL,
  "label" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_lens_fields_visibility_check" CHECK ((visibility = ANY (ARRAY['shown'::text, 'hidden'::text, 'masked'::text]))),
  CONSTRAINT "platform_lens_fields_pkey" PRIMARY KEY (lens_code, field_path)
);
CREATE TABLE IF NOT EXISTS public."platform_lens_labels" (
  "tenant_id" uuid,
  "lens_code" text NOT NULL,
  "state" text NOT NULL,
  "label" text NOT NULL,
  "tone" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_lens_labels_pkey" PRIMARY KEY (lens_code, state)
);
CREATE TABLE IF NOT EXISTS public."platform_lenses" (
  "tenant_id" uuid,
  "lens_code" text NOT NULL,
  "object_code" text NOT NULL,
  "audience" text NOT NULL,
  "surface_default" text,
  "transitions" text[] NOT NULL DEFAULT '{}'::text[],
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_lenses_audience_check" CHECK ((audience = ANY (ARRAY['owner'::text, 'provider'::text, 'operator'::text, 'manager'::text, 'platform'::text, 'partner'::text, 'agent'::text]))),
  CONSTRAINT "platform_lenses_pkey" PRIMARY KEY (lens_code)
);
CREATE TABLE IF NOT EXISTS public."platform_module_permissions" (
  "id" uuid,
  "tenant_id" uuid,
  "staff_id" uuid,
  "module_code" text,
  "access_level" text,
  "granted_by" uuid,
  "granted_at" timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public."platform_objects" (
  "tenant_id" uuid,
  "object_code" text NOT NULL,
  "display_name" text NOT NULL,
  "canonical_table" text NOT NULL,
  "state_machine" jsonb NOT NULL,
  "owner_module" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_objects_pkey" PRIMARY KEY (object_code)
);
CREATE TABLE IF NOT EXISTS public."platform_permission_registry" (
  "permission_code" text,
  "module" text,
  "description" text,
  "created_at" timestamp with time zone,
  "tenant_id" uuid NOT NULL DEFAULT '652fd2be-d19a-4778-835d-db38094d7718'::uuid
);
CREATE TABLE IF NOT EXISTS public."platform_quick_action_registry" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "action_code" text NOT NULL,
  "module" text NOT NULL,
  "display_name" text NOT NULL,
  "api_route" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_quick_action_registry_pkey" PRIMARY KEY (id),
  CONSTRAINT "platform_quick_action_registry_action_code_key" UNIQUE (action_code),
  CONSTRAINT "platform_qar_action_code_uniq" UNIQUE (action_code)
);
CREATE TABLE IF NOT EXISTS public."platform_quick_links" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "label" text NOT NULL,
  "url" text NOT NULL,
  "icon" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "opens_new_tab" boolean NOT NULL DEFAULT true,
  "visible_to_roles" text[] NOT NULL DEFAULT '{}'::text[],
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_quick_links_pkey" PRIMARY KEY (id),
  CONSTRAINT "platform_quick_links_tenant_id_label_key" UNIQUE (tenant_id, label)
);
CREATE TABLE IF NOT EXISTS public."platform_reserved_slugs" (
  "slug" text NOT NULL,
  "reason" text NOT NULL DEFAULT 'reserved'::text,
  CONSTRAINT "platform_reserved_slugs_pkey" PRIMARY KEY (slug)
);
CREATE TABLE IF NOT EXISTS public."platform_role_values" (
  "tenant_id" uuid,
  "value" text NOT NULL,
  "source" text NOT NULL,
  "status" text NOT NULL,
  "canonical" text,
  "reason" text NOT NULL,
  "retire_after" text,
  "changed_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_role_values_pkey" PRIMARY KEY (value, source)
);
CREATE TABLE IF NOT EXISTS public."platform_saved_views" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "name" text NOT NULL,
  "filters" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "columns" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "sort" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_shared" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_saved_views_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."platform_subscription_offers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "description" text,
  "price_cents" integer NOT NULL,
  "cadence" text NOT NULL,
  "applicable_user_types" text[] NOT NULL,
  "is_active" boolean NOT NULL DEFAULT false,
  "stripe_product_id" text,
  "stripe_price_id" text,
  "created_by" text,
  "updated_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_subscription_offers_price_cents_check" CHECK ((price_cents >= 0)),
  CONSTRAINT "platform_subscription_offers_applicable_user_types_check" CHECK (((cardinality(applicable_user_types) > 0) AND (applicable_user_types <@ ARRAY['customer'::text, 'seller'::text, 'healthcare'::text, 'employee'::text]))),
  CONSTRAINT "platform_subscription_offers_cadence_check" CHECK ((cadence = ANY (ARRAY['day'::text, 'week'::text, 'month'::text, 'year'::text]))),
  CONSTRAINT "platform_subscription_offers_category_check" CHECK ((category = ANY (ARRAY['shipping'::text, 'ai_services'::text, 'gift_cards'::text, 'platform'::text, 'other'::text]))),
  CONSTRAINT "platform_subscription_offers_name_check" CHECK ((btrim(name) <> ''::text)),
  CONSTRAINT "platform_subscription_offers_pkey" PRIMARY KEY (id),
  CONSTRAINT "platform_subscription_offers_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."platform_tools" (
  "tenant_id" uuid,
  "tool_name" text NOT NULL,
  "display_name" text NOT NULL,
  "capability_code" text NOT NULL,
  "object_codes" text[] NOT NULL DEFAULT '{}'::text[],
  "purpose_codes" text[] NOT NULL DEFAULT '{}'::text[],
  "lens_mode" text NOT NULL DEFAULT 'actor'::text,
  "enabled" boolean NOT NULL DEFAULT true,
  "description" text NOT NULL DEFAULT ''::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_tools_lens_mode_check" CHECK ((lens_mode = 'actor'::text)),
  CONSTRAINT "platform_tools_pkey" PRIMARY KEY (tool_name)
);
CREATE TABLE IF NOT EXISTS public."platform_vendor_identity_links" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "acct_vendor_id" uuid NOT NULL,
  "erp_vendor_id" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "platform_vendor_identity_links_pkey" PRIMARY KEY (id),
  CONSTRAINT "platform_vendor_identity_links_acct_vendor_id_key" UNIQUE (acct_vendor_id),
  CONSTRAINT "platform_vendor_identity_links_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "platform_vendor_identity_links_erp_vendor_id_key" UNIQUE (erp_vendor_id)
);
CREATE TABLE IF NOT EXISTS public."platform_workflow_transition_validation" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "entity_type" text NOT NULL,
  "from_status" text,
  "to_status" text NOT NULL,
  "is_allowed" boolean NOT NULL DEFAULT true,
  CONSTRAINT "platform_workflow_transition_validation_pkey" PRIMARY KEY (id),
  CONSTRAINT "platform_workflow_transition__entity_type_from_status_to_st_key" UNIQUE (entity_type, from_status, to_status)
);
CREATE TABLE IF NOT EXISTS public."policies" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "order" integer DEFAULT 0,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  "tenant_id" uuid NOT NULL,
  CONSTRAINT "policies_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."policy_settings" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "scope" text NOT NULL,
  "key" text NOT NULL,
  "value" text NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" uuid,
  CONSTRAINT "policy_settings_pkey" PRIMARY KEY (id),
  CONSTRAINT "policy_settings_tenant_id_scope_key_key" UNIQUE (tenant_id, scope, key)
);
CREATE TABLE IF NOT EXISTS public."portal_account_links" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "provider" text NOT NULL,
  "provider_sub" text NOT NULL,
  "email" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "tenant_id" uuid,
  "picture_url" text,
  "display_name" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_used_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "portal_account_links_pkey" PRIMARY KEY (id),
  CONSTRAINT "portal_account_links_provider_sub_key" UNIQUE (provider, provider_sub)
);
CREATE TABLE IF NOT EXISTS public."portal_action_permissions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "portal_user_id" uuid NOT NULL,
  "action_key" text NOT NULL,
  "is_allowed" boolean NOT NULL DEFAULT false,
  "granted_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "portal_action_permissions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."portal_customer_accounts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "auth_user_id" uuid,
  "status" text NOT NULL DEFAULT 'invited'::text,
  "invited_by" uuid,
  "invited_at" timestamp with time zone NOT NULL DEFAULT now(),
  "activated_at" timestamp with time zone,
  "last_login_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "portal_customer_accounts_status_check" CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'suspended'::text, 'revoked'::text]))),
  CONSTRAINT "portal_customer_accounts_pkey" PRIMARY KEY (id),
  CONSTRAINT "portal_customer_accounts_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "portal_customer_accounts_customer_id_key" UNIQUE (customer_id),
  CONSTRAINT "portal_customer_accounts_auth_user_id_key" UNIQUE (auth_user_id)
);
CREATE TABLE IF NOT EXISTS public."portal_magic_links" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "appointment_id" uuid,
  "purpose" text NOT NULL DEFAULT 'login'::text,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "requested_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "portal_magic_links_pkey" PRIMARY KEY (id),
  CONSTRAINT "portal_magic_links_tenant_id_id_key" UNIQUE (tenant_id, id),
  CONSTRAINT "portal_magic_links_token_hash_key" UNIQUE (token_hash)
);
CREATE TABLE IF NOT EXISTS public."portal_module_permissions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "portal_user_id" uuid NOT NULL,
  "module_key" text NOT NULL,
  "permission_level" text NOT NULL,
  "granted_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "portal_module_permissions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."portal_permission_audit_log" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "portal_user_id" uuid NOT NULL,
  "changed_by" uuid,
  "change_type" text NOT NULL,
  "key" text NOT NULL,
  "old_value" text,
  "new_value" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "portal_permission_audit_log_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."portal_user_preferences" (
  "user_id" uuid NOT NULL,
  "tenant_id" uuid,
  "portal_theme" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "portal_user_preferences_portal_theme_check" CHECK ((portal_theme = ANY (ARRAY['white'::text, 'black'::text, 'blue'::text, 'orange'::text, 'turquoise'::text]))),
  CONSTRAINT "portal_user_preferences_pkey" PRIMARY KEY (user_id)
);
CREATE TABLE IF NOT EXISTS public."portal_users" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role_type" text NOT NULL,
  "portal" text NOT NULL,
  "parent_id" uuid,
  "display_name" text,
  "email" text,
  "phone" text,
  "is_owner" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "invited_by" uuid,
  "invited_at" timestamp with time zone,
  "accepted_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "portal_users_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."pricing_packages" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "name" text NOT NULL,
  "smallPrice" text,
  "mediumPrice" text,
  "largePrice" text,
  "xlargePrice" text,
  "description" text,
  "featured" boolean DEFAULT false,
  "order" integer DEFAULT 0,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  "durationMinutes" integer DEFAULT 120,
  "depositAmount" text DEFAULT '$25.00'::text,
  "tenant_id" uuid NOT NULL,
  CONSTRAINT "pricing_packages_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."privacy_request_details" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "ticket_id" uuid NOT NULL,
  "request_type" text NOT NULL,
  "identity_verified_at" timestamp with time zone,
  "verification_method" text,
  "statutory_due_at" timestamp with time zone,
  "extension_granted_at" timestamp with time zone,
  "fulfillment_log" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "outcome" text,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "privacy_request_details_request_type_check" CHECK ((request_type = ANY (ARRAY['access'::text, 'deletion'::text, 'correction'::text, 'opt_out'::text]))),
  CONSTRAINT "privacy_request_details_pkey" PRIMARY KEY (id),
  CONSTRAINT "privacy_request_details_ticket_key" UNIQUE (ticket_id)
);
CREATE TABLE IF NOT EXISTS public."product_attribute_values" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL,
  "attribute_id" uuid NOT NULL,
  "attribute_value_id" uuid,
  "value_text" text,
  "value_numeric" numeric(14,4),
  CONSTRAINT "product_attribute_values_check" CHECK (((attribute_value_id IS NOT NULL) OR (value_text IS NOT NULL) OR (value_numeric IS NOT NULL))),
  CONSTRAINT "product_attribute_values_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."product_canvas_templates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "product_mapping_id" uuid,
  "category_path" character varying(512) NOT NULL,
  "view_angle" product_view_angle NOT NULL DEFAULT 'FRONT'::product_view_angle,
  "mockup_image_url" text,
  "displacement_map_url" text,
  "print_zone_x" integer NOT NULL,
  "print_zone_y" integer NOT NULL,
  "print_zone_width" integer NOT NULL,
  "print_zone_height" integer NOT NULL,
  "physical_width_inches" numeric(6,2) NOT NULL,
  "physical_height_inches" numeric(6,2) NOT NULL,
  "archetype_class" character varying(64) NOT NULL DEFAULT 'APPAREL'::character varying,
  "normalized_x" numeric(5,4) NOT NULL DEFAULT 0.150,
  "normalized_y" numeric(5,4) NOT NULL DEFAULT 0.150,
  "normalized_width" numeric(5,4) NOT NULL DEFAULT 0.700,
  "normalized_height" numeric(5,4) NOT NULL DEFAULT 0.700,
  "hardware_modifiers" jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "product_canvas_templates_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."product_collections" (
  "product_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "collection_id" uuid NOT NULL,
  CONSTRAINT "product_collections_pkey" PRIMARY KEY (product_id, collection_id)
);
CREATE TABLE IF NOT EXISTS public."product_media" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL,
  "variant_id" uuid,
  "media_type" text NOT NULL DEFAULT 'image'::text,
  "url" text NOT NULL,
  "alt_text" text,
  "width" integer,
  "height" integer,
  "sort_order" integer NOT NULL DEFAULT 0,
  CONSTRAINT "product_media_media_type_check" CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text]))),
  CONSTRAINT "product_media_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."product_nodes" (
  "product_id" uuid NOT NULL,
  "node_id" uuid NOT NULL,
  "is_primary" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  CONSTRAINT "product_nodes_pkey" PRIMARY KEY (product_id, node_id)
);
CREATE TABLE IF NOT EXISTS public."product_questions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL,
  "product_name" text,
  "author_name" text NOT NULL DEFAULT 'Guest'::text,
  "body" text NOT NULL,
  "answer" text,
  "answered_at" timestamp with time zone,
  "visible" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "product_questions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."product_relations" (
  "module_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "related_product_id" uuid NOT NULL,
  "score" numeric(10,4) NOT NULL DEFAULT 0,
  "source" text NOT NULL DEFAULT 'computed'::text,
  CONSTRAINT "product_relations_check" CHECK ((product_id <> related_product_id)),
  CONSTRAINT "product_relations_source_check" CHECK ((source = ANY (ARRAY['curated'::text, 'computed'::text]))),
  CONSTRAINT "product_relations_pkey" PRIMARY KEY (module_id, product_id, related_product_id)
);
CREATE TABLE IF NOT EXISTS public."product_reviews" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "product_id" uuid NOT NULL,
  "author_name" text NOT NULL,
  "rating" integer NOT NULL,
  "title" text,
  "body" text NOT NULL,
  "visible" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "productId" text NOT NULL,
  "author" text NOT NULL,
  "verified" boolean DEFAULT true,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  "status" text,
  "tenant_id" uuid NOT NULL,
  CONSTRAINT "product_reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5))),
  CONSTRAINT "product_reviews_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."product_taxonomy_links" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "path" text NOT NULL,
  "product_id" uuid NOT NULL,
  "is_primary" boolean NOT NULL DEFAULT false,
  "rule" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "product_taxonomy_links_pkey" PRIMARY KEY (id),
  CONSTRAINT "product_taxonomy_links_path_product_id_key" UNIQUE (path, product_id)
);
CREATE TABLE IF NOT EXISTS public."product_taxonomy_nodes" (
  "tenant_id" uuid,
  "product_id" uuid NOT NULL,
  "taxonomy_node_id" uuid NOT NULL,
  "is_primary" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "product_taxonomy_nodes_pkey" PRIMARY KEY (product_id, taxonomy_node_id)
);
CREATE TABLE IF NOT EXISTS public."product_variants" (
  "id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "sku" text NOT NULL,
  "size" text,
  "color" text,
  "price" numeric(10,2) NOT NULL,
  "compare_at_price" numeric(10,2),
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "gtin" text,
  "mpn" text,
  "name_suffix" text,
  "weight_lb" numeric(10,3),
  "length_in" numeric(10,2),
  "width_in" numeric(10,2),
  "height_in" numeric(10,2),
  "status" text NOT NULL DEFAULT 'active'::text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "variant_title" text,
  "in_stock" boolean,
  "stock_quantity" integer,
  "reorder_level" integer,
  "weight_grams" integer,
  "option_size" text,
  "option_color" text,
  CONSTRAINT "product_variants_pkey" PRIMARY KEY (id, tenant_id),
  CONSTRAINT "product_variants_tenant_id_sku_key" UNIQUE (tenant_id, sku),
  CONSTRAINT "product_variants_id_key" UNIQUE (id)
);
CREATE TABLE IF NOT EXISTS public."products" (
  "id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "category_id" uuid,
  "brand_id" uuid,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "short_description" text,
  "details" text,
  "specifications" text,
  "directions" text,
  "warnings" text,
  "is_featured" boolean NOT NULL DEFAULT false,
  "created_by_seller_id" uuid,
  "published_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "title" text,
  "handle" text,
  "description_html" text,
  "brand" text,
  "dependent_type" text,
  "fulfillment_type" text NOT NULL DEFAULT 'stocked'::text,
  "owner_type" text NOT NULL DEFAULT 'platform'::text,
  "owner_id" uuid,
  "supplier_id" uuid,
  "source_product_id" text,
  "tags" text[],
  "is_new" boolean DEFAULT false,
  "is_sale" boolean DEFAULT false,
  "is_best_seller" boolean DEFAULT false,
  "is_house_favorite" boolean DEFAULT false,
  CONSTRAINT "products_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))),
  CONSTRAINT "products_pkey" PRIMARY KEY (id, tenant_id),
  CONSTRAINT "products_tenant_id_slug_key" UNIQUE (tenant_id, slug),
  CONSTRAINT "products_id_key" UNIQUE (id)
);
CREATE TABLE IF NOT EXISTS public."profiles" (
  "id" uuid NOT NULL,
  "active_tenant_id" uuid,
  "display_name" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "stripe_customer_id" text,
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."projects" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "owner_id" uuid,
  "name" text NOT NULL,
  "collection_id" uuid,
  "canvas_state" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "active_supplier_catalog_product_id" uuid,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "projects_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."promo_redemptions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "promo_id" uuid NOT NULL,
  "user_id" uuid,
  "email" text,
  "dependent_id" text,
  "booking_id" text,
  "order_id" text,
  "subscription_id" text,
  "discount_cents" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "promo_redemptions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."promos" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "code" text NOT NULL,
  "kind" text NOT NULL DEFAULT 'standard'::text,
  "promo_type" text NOT NULL,
  "value" text NOT NULL DEFAULT 0,
  "applies_to" jsonb NOT NULL DEFAULT '["services"]'::jsonb,
  "eligibility" text NOT NULL DEFAULT 'all'::text,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "max_total_uses" integer,
  "max_uses_per_user" integer NOT NULL DEFAULT 1,
  "one_per_dependent" boolean NOT NULL DEFAULT false,
  "stackable" boolean NOT NULL DEFAULT false,
  "placements" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "description" text,
  "fine_print" text,
  "cta_label" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "qualifying_names" jsonb,
  "min_subtotal_cents" integer,
  "requires_recent_booking" boolean NOT NULL DEFAULT false,
  "requires_birthday_month" boolean NOT NULL DEFAULT false,
  CONSTRAINT "promos_kind_check" CHECK ((kind = ANY (ARRAY['standard'::text, 'cause'::text]))),
  CONSTRAINT "promos_promo_type_check" CHECK ((promo_type = ANY (ARRAY['percent_off'::text, 'dollars_off'::text, 'free_addon'::text]))),
  CONSTRAINT "promos_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text]))),
  CONSTRAINT "promos_eligibility_check" CHECK ((eligibility = ANY (ARRAY['new'::text, 'existing'::text, 'all'::text]))),
  CONSTRAINT "promos_pkey" PRIMARY KEY (id),
  CONSTRAINT "promos_tenant_id_code_key" UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS public."provider_jobs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "product_id" uuid,
  "design_id" uuid,
  "provider" text,
  "job_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'queued'::text,
  "request_payload" jsonb,
  "response_payload" jsonb,
  "error_message" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "finished_at" timestamp with time zone,
  CONSTRAINT "provider_jobs_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."purchase_order_items" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "purchase_order_id" uuid NOT NULL,
  "product_id" text,
  "inventory_item_id" text,
  "account_id" uuid NOT NULL,
  "tax_id" uuid,
  "description" text,
  "quantity" numeric(18,4) NOT NULL DEFAULT 1,
  "unit_price" numeric(18,4) NOT NULL DEFAULT 0,
  "discount" numeric(18,4) NOT NULL DEFAULT 0,
  "received_qty" numeric(18,4) NOT NULL DEFAULT 0,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."purchase_order_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "purchase_order_id" uuid NOT NULL,
  "line_no" integer NOT NULL,
  "node_id" uuid NOT NULL,
  "variant_id" uuid,
  "vendor_sku" text,
  "description" text,
  "qty_ordered" integer NOT NULL,
  "qty_received" integer NOT NULL DEFAULT 0,
  "unit_cost" numeric(12,4),
  CONSTRAINT "purchase_order_lines_qty_ordered_check" CHECK ((qty_ordered > 0)),
  CONSTRAINT "purchase_order_lines_qty_received_check" CHECK ((qty_received >= 0)),
  CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY (id),
  CONSTRAINT "purchase_order_lines_purchase_order_id_line_no_key" UNIQUE (purchase_order_id, line_no)
);
CREATE TABLE IF NOT EXISTS public."purchase_orders" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "number" text NOT NULL,
  "vendor_id" text NOT NULL,
  "issue_date" date NOT NULL,
  "expected_date" date,
  "status" order_status NOT NULL DEFAULT 'draft'::order_status,
  "currency" text NOT NULL DEFAULT 'USD'::text,
  "subtotal" numeric(18,4) NOT NULL DEFAULT 0,
  "tax_total" numeric(18,4) NOT NULL DEFAULT 0,
  "total" numeric(18,4) NOT NULL DEFAULT 0,
  "notes" text,
  "converted_bill_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "brand_id" uuid,
  "po_number" text,
  CONSTRAINT "purchase_orders_pkey" PRIMARY KEY (id),
  CONSTRAINT "purchase_orders_tenant_id_number_key" UNIQUE (tenant_id, number)
);
CREATE TABLE IF NOT EXISTS public."quarantine" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "source_product_id" text NOT NULL,
  "title" text,
  "brand" text,
  "supplier" text,
  "supplier_product_type" text,
  "reason" text,
  "resolved" boolean DEFAULT false,
  "resolved_by" text,
  "resolved_category" text,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "quarantine_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."receipt_items" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "receipt_id" uuid NOT NULL,
  "product_id" text,
  "inventory_item_id" text,
  "account_id" uuid NOT NULL,
  "description" text,
  "quantity" numeric(18,4) NOT NULL DEFAULT 1,
  "unit_price" numeric(18,4) NOT NULL DEFAULT 0,
  "tax_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "receipt_items_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."receipts" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "number" text NOT NULL,
  "customer_id" text,
  "receipt_date" date NOT NULL,
  "kind" receipt_kind NOT NULL DEFAULT 'sale'::receipt_kind,
  "amount" numeric(18,4) NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD'::text,
  "method" payment_method NOT NULL DEFAULT 'cash'::payment_method,
  "deposit_account_id" uuid NOT NULL,
  "revenue_account_id" uuid,
  "notes" text,
  "journal_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "receipts_pkey" PRIMARY KEY (id),
  CONSTRAINT "receipts_tenant_id_number_key" UNIQUE (tenant_id, number)
);
CREATE TABLE IF NOT EXISTS public."reconciliations" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "bank_account_id" uuid NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "opening_balance" numeric(18,4) NOT NULL,
  "closing_balance" numeric(18,4) NOT NULL,
  "state" rec_state NOT NULL DEFAULT 'in_progress'::rec_state,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone,
  CONSTRAINT "reconciliations_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."recurring_invoice_items" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "recurring_id" uuid NOT NULL,
  "product_id" text,
  "account_id" uuid NOT NULL,
  "tax_id" uuid,
  "description" text,
  "quantity" numeric(18,4) NOT NULL DEFAULT 1,
  "unit_price" numeric(18,4) NOT NULL DEFAULT 0,
  "discount" numeric(18,4) NOT NULL DEFAULT 0,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "recurring_invoice_items_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."recurring_invoices" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "customer_id" text NOT NULL,
  "name" text NOT NULL,
  "frequency" recurring_freq NOT NULL DEFAULT 'monthly'::recurring_freq,
  "interval_n" integer NOT NULL DEFAULT 1,
  "start_date" date NOT NULL,
  "end_date" date,
  "next_date" date NOT NULL,
  "last_run_date" date,
  "is_active" boolean NOT NULL DEFAULT true,
  "currency" text NOT NULL DEFAULT 'USD'::text,
  "notes" text,
  "terms" text,
  "subtotal" numeric(18,4) NOT NULL DEFAULT 0,
  "tax_total" numeric(18,4) NOT NULL DEFAULT 0,
  "total" numeric(18,4) NOT NULL DEFAULT 0,
  "auto_send" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "recurring_invoices_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."related_search_page_products" (
  "page_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  CONSTRAINT "related_search_page_products_pkey" PRIMARY KEY (page_id, product_id)
);
CREATE TABLE IF NOT EXISTS public."related_search_pages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "slug" text NOT NULL,
  "query_text" text NOT NULL,
  "legacy_path" text,
  "target_node_id" uuid,
  "filter_rule" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "legacy_traffic" integer NOT NULL DEFAULT 0,
  "source" text NOT NULL,
  "lifecycle" text NOT NULL DEFAULT 'active'::text,
  "status" text NOT NULL DEFAULT 'published'::text,
  "group_name" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "related_search_pages_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text]))),
  CONSTRAINT "related_search_pages_source_check" CHECK ((source = ANY (ARRAY['legacy_route'::text, 'landing_related'::text, 'manual'::text]))),
  CONSTRAINT "related_search_pages_lifecycle_check" CHECK ((lifecycle = ANY (ARRAY['active'::text, 'retire_pending'::text, 'retired'::text]))),
  CONSTRAINT "related_search_pages_pkey" PRIMARY KEY (id),
  CONSTRAINT "related_search_pages_tenant_id_slug_key" UNIQUE (tenant_id, slug)
);
CREATE TABLE IF NOT EXISTS public."return_policy_rules" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "scope" text NOT NULL DEFAULT 'global'::text,
  "category_id" uuid,
  "category_label" text,
  "window_days" integer NOT NULL,
  "is_legal_minimum" boolean NOT NULL DEFAULT false,
  "notes" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "return_policy_rules_scope_check" CHECK ((scope = ANY (ARRAY['global'::text, 'category'::text]))),
  CONSTRAINT "return_policy_rules_window_days_check" CHECK (((window_days > 0) AND (window_days <= 3650))),
  CONSTRAINT "return_policy_rules_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."reviews" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "customer_id" text,
  "author_name" text,
  "rating" smallint NOT NULL,
  "title" text,
  "body" text,
  "is_verified_purchase" boolean DEFAULT false,
  "is_published" boolean DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "status" text NOT NULL DEFAULT 'published'::text,
  CONSTRAINT "reviews_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'published'::text, 'rejected'::text]))),
  CONSTRAINT "reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5))),
  CONSTRAINT "reviews_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."route_redirects" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "from_path" text NOT NULL,
  "to_path" text NOT NULL,
  "match_type" text NOT NULL DEFAULT 'exact'::text,
  "status_code" smallint NOT NULL DEFAULT 301,
  "reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "route_redirects_match_type_check" CHECK ((match_type = ANY (ARRAY['exact'::text, 'prefix'::text]))),
  CONSTRAINT "route_redirects_status_code_check" CHECK ((status_code = ANY (ARRAY[301, 302, 410]))),
  CONSTRAINT "route_redirects_pkey" PRIMARY KEY (id),
  CONSTRAINT "route_redirects_tenant_id_from_path_key" UNIQUE (tenant_id, from_path)
);
CREATE TABLE IF NOT EXISTS public."sales_order_items" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "sales_order_id" uuid NOT NULL,
  "product_id" text,
  "inventory_item_id" text,
  "account_id" uuid NOT NULL,
  "tax_id" uuid,
  "description" text,
  "quantity" numeric(18,4) NOT NULL DEFAULT 1,
  "unit_price" numeric(18,4) NOT NULL DEFAULT 0,
  "discount" numeric(18,4) NOT NULL DEFAULT 0,
  "fulfilled_qty" numeric(18,4) NOT NULL DEFAULT 0,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "sales_order_items_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."sales_orders" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "number" text NOT NULL,
  "customer_id" text NOT NULL,
  "issue_date" date NOT NULL,
  "expected_date" date,
  "status" order_status NOT NULL DEFAULT 'draft'::order_status,
  "currency" text NOT NULL DEFAULT 'USD'::text,
  "subtotal" numeric(18,4) NOT NULL DEFAULT 0,
  "tax_total" numeric(18,4) NOT NULL DEFAULT 0,
  "total" numeric(18,4) NOT NULL DEFAULT 0,
  "notes" text,
  "converted_invoice_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "sales_orders_pkey" PRIMARY KEY (id),
  CONSTRAINT "sales_orders_tenant_id_number_key" UNIQUE (tenant_id, number)
);
CREATE TABLE IF NOT EXISTS public."search_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "query" text NOT NULL,
  "surface" text NOT NULL DEFAULT 'header'::text,
  "result_count" integer,
  "clicked_ref" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "search_events_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."seller_1099k_generations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "tax_year" integer NOT NULL,
  "gross_amount" numeric(14,2) NOT NULL DEFAULT 0,
  "transaction_count" integer NOT NULL DEFAULT 0,
  "basis" text NOT NULL DEFAULT 'seller_orders gross (non-cancelled, non-refunded)'::text,
  "filing_status" text NOT NULL DEFAULT 'not_filed'::text,
  "tax_document_id" uuid,
  "generated_by" uuid,
  "generated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_1099k_generations_filing_status_check" CHECK ((filing_status = ANY (ARRAY['not_filed'::text, 'filed'::text, 'accepted'::text, 'rejected'::text]))),
  CONSTRAINT "seller_1099k_generations_tax_year_check" CHECK (((tax_year >= 2000) AND (tax_year <= 2100))),
  CONSTRAINT "seller_1099k_generations_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."seller_ad_campaigns" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "name" text NOT NULL,
  "campaign_type" text NOT NULL DEFAULT 'sponsored'::text,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "budget_cents" integer NOT NULL DEFAULT 0,
  "spent_cents" integer NOT NULL DEFAULT 0,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "listing_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_ad_campaigns_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'paused'::text, 'ended'::text]))),
  CONSTRAINT "seller_ad_campaigns_campaign_type_check" CHECK ((campaign_type = ANY (ARRAY['sponsored'::text, 'sem'::text, 'flash'::text]))),
  CONSTRAINT "seller_ad_campaigns_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."seller_advertising_enrollments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "note" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_advertising_enrollments_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text]))),
  CONSTRAINT "seller_advertising_enrollments_pkey" PRIMARY KEY (id),
  CONSTRAINT "seller_advertising_enrollments_tenant_id_seller_id_key" UNIQUE (tenant_id, seller_id)
);
CREATE TABLE IF NOT EXISTS public."seller_appeals" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "violation_id" uuid,
  "seller_id" uuid,
  "status" text,
  "appeal_text" text,
  "evidence_urls" jsonb,
  "decision" text,
  "decided_by" uuid,
  "decided_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "appeal_type" text,
  CONSTRAINT "seller_appeals_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."seller_brand_authorizations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "seller_id" uuid NOT NULL,
  "brand_id" uuid NOT NULL,
  "authorization_type" text NOT NULL,
  "evidence_url" text,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "valid_from" date,
  "valid_until" date,
  "reviewed_by" text,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "proof_type" text,
  "ticket_ref" text,
  CONSTRAINT "seller_brand_authorizations_authorization_type_check" CHECK ((authorization_type = ANY (ARRAY['brand_owner'::text, 'authorized_reseller'::text, 'distributor'::text]))),
  CONSTRAINT "seller_brand_authorizations_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text]))),
  CONSTRAINT "seller_brand_authorizations_proof_type_check" CHECK (((proof_type IS NULL) OR (proof_type = ANY (ARRAY['invoice'::text, 'loa'::text])))),
  CONSTRAINT "seller_brand_authorizations_pkey" PRIMARY KEY (id),
  CONSTRAINT "seller_brand_authorizations_seller_id_brand_id_key" UNIQUE (seller_id, brand_id)
);
CREATE TABLE IF NOT EXISTS public."seller_category_approvals" (
  "seller_id" uuid NOT NULL,
  "node_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "reviewed_at" timestamp with time zone,
  CONSTRAINT "seller_category_approvals_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
  CONSTRAINT "seller_category_approvals_pkey" PRIMARY KEY (seller_id, node_id)
);
CREATE TABLE IF NOT EXISTS public."seller_customer_messages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "customer_key" text NOT NULL,
  "thread_id" uuid,
  "channel" text NOT NULL DEFAULT 'email'::text,
  "subject" text,
  "body" text NOT NULL,
  "status" text NOT NULL DEFAULT 'sent'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_customer_messages_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."seller_customer_notes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "customer_key" text NOT NULL,
  "notes" text NOT NULL DEFAULT ''::text,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_customer_notes_pkey" PRIMARY KEY (id),
  CONSTRAINT "seller_customer_notes_tenant_id_seller_id_customer_key_key" UNIQUE (tenant_id, seller_id, customer_key)
);
CREATE TABLE IF NOT EXISTS public."seller_data_processing" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "data_categories" text[] NOT NULL DEFAULT '{}'::text[],
  "purposes" text,
  "subprocessors" text,
  "retention" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_data_processing_pkey" PRIMARY KEY (id),
  CONSTRAINT "seller_data_processing_tenant_id_seller_id_key" UNIQUE (tenant_id, seller_id)
);
CREATE TABLE IF NOT EXISTS public."seller_dpa_acceptances" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "policy_id" uuid,
  "version" text,
  "signer_name" text NOT NULL,
  "signed_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_dpa_acceptances_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."seller_email_templates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid,
  "name" text NOT NULL,
  "subject" text,
  "body" text,
  "template_type" text,
  "is_active" boolean DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_email_templates_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."seller_inventory_settings" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "low_stock_threshold" integer NOT NULL DEFAULT 5,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_inventory_settings_low_stock_threshold_check" CHECK ((low_stock_threshold >= 0)),
  CONSTRAINT "seller_inventory_settings_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."seller_investigations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid,
  "violation_id" uuid,
  "investigator_id" uuid,
  "status" text,
  "priority" text,
  "findings" text,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "investigation_type" text,
  "order_id" text,
  CONSTRAINT "seller_investigations_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."seller_live_settings" (
  "seller_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "video_provider" text NOT NULL DEFAULT 'livekit'::text,
  "stream_url" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_live_settings_video_provider_check" CHECK ((video_provider = ANY (ARRAY['livekit'::text, 'webrtc'::text, 'bitmovin'::text]))),
  CONSTRAINT "seller_live_settings_pkey" PRIMARY KEY (seller_id)
);
CREATE TABLE IF NOT EXISTS public."seller_live_streams" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "title" text NOT NULL,
  "status" text NOT NULL DEFAULT 'provisioning'::text,
  "mux_live_stream_id" text,
  "mux_playback_id" text,
  "stream_key" text,
  "recording_asset_id" text,
  "recording_playback_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "provisioned_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "replay_ready_at" timestamp with time zone,
  "last_event_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_live_streams_title_check" CHECK ((btrim(title) <> ''::text)),
  CONSTRAINT "seller_live_streams_status_check" CHECK ((status = ANY (ARRAY['provisioning'::text, 'idle'::text, 'active'::text, 'ended'::text]))),
  CONSTRAINT "seller_live_streams_pkey" PRIMARY KEY (id),
  CONSTRAINT "seller_live_streams_mux_live_stream_id_key" UNIQUE (mux_live_stream_id)
);
CREATE TABLE IF NOT EXISTS public."seller_login_activity" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_login_activity_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."seller_notification_preferences" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "channel_in_portal" boolean NOT NULL DEFAULT true,
  "channel_email" boolean NOT NULL DEFAULT true,
  "channel_sms" boolean NOT NULL DEFAULT false,
  "event_orders" boolean NOT NULL DEFAULT true,
  "event_payments" boolean NOT NULL DEFAULT true,
  "event_governance" boolean NOT NULL DEFAULT true,
  "event_policies" boolean NOT NULL DEFAULT true,
  "event_listings" boolean NOT NULL DEFAULT true,
  "event_account" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_notification_preferences_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."seller_performance_alerts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "kpi_key" text NOT NULL,
  "metric_value" numeric,
  "threshold" numeric,
  "status" text NOT NULL DEFAULT 'open'::text,
  "detail" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "acknowledged_by" text,
  "acknowledged_at" timestamp with time zone,
  CONSTRAINT "seller_performance_alerts_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."seller_policy_enforcement" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "policy_id" uuid NOT NULL,
  "stage" text NOT NULL DEFAULT 'notice'::text,
  "severity" text NOT NULL DEFAULT 'medium'::text,
  "rule_index" integer,
  "rule_matched" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "action" text NOT NULL DEFAULT 'notice'::text,
  "remediation_steps" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "remediation_deadline" timestamp with time zone,
  "remediation_completed_at" timestamp with time zone,
  "remediation_completed_by" uuid,
  "status" text NOT NULL DEFAULT 'open'::text,
  "violation_id" uuid,
  "evaluated_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_policy_enforcement_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."seller_remediation_plans" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'active'::text,
  "trigger_type" text,
  "trigger_ref" text,
  "kpi_key" text,
  "violation_id" uuid,
  "title" text,
  "requirements" text,
  "deadline" timestamp with time zone,
  "notes" text,
  "created_by" text,
  "completed_at" timestamp with time zone,
  "completed_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_remediation_plans_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."seller_sales_rewards" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "reward_type" text NOT NULL,
  "amount_cents" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'issued'::text,
  "reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_sales_rewards_status_check" CHECK ((status = ANY (ARRAY['issued'::text, 'applied'::text, 'expired'::text]))),
  CONSTRAINT "seller_sales_rewards_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."seller_self_serve_profiles" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "case_id" uuid,
  "applicant_type" text NOT NULL,
  "legal_name" text NOT NULL,
  "display_name" text,
  "gov_id_type" text,
  "gov_id_last4" text,
  "tax_id_type" text,
  "tax_id_last4" text,
  "owners" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "categories" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "warehouse" jsonb,
  "return_address" jsonb,
  "shipping_template" jsonb,
  "stripe_account_id" text,
  "payout_name_match" text NOT NULL DEFAULT 'unverified'::text,
  "tax_form_status" text NOT NULL DEFAULT 'not_required'::text,
  "tax_form_prompted_at" timestamp with time zone,
  "tax_form_received_at" timestamp with time zone,
  "tax_form_ticket_ref" text,
  "recorded_earnings" numeric NOT NULL DEFAULT 0,
  "completion_ticket_ref" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_self_serve_profiles_tax_form_status_check" CHECK ((tax_form_status = ANY (ARRAY['not_required'::text, 'required_prompted'::text, 'received'::text]))),
  CONSTRAINT "seller_self_serve_profiles_applicant_type_check" CHECK ((applicant_type = ANY (ARRAY['individual_seller'::text, 'business_seller'::text]))),
  CONSTRAINT "seller_self_serve_profiles_payout_name_match_check" CHECK ((payout_name_match = ANY (ARRAY['unverified'::text, 'matched'::text, 'mismatch'::text]))),
  CONSTRAINT "seller_self_serve_profiles_tax_id_type_check" CHECK (((tax_id_type IS NULL) OR (tax_id_type = ANY (ARRAY['ssn'::text, 'itin'::text, 'ein'::text])))),
  CONSTRAINT "seller_self_serve_profiles_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."seller_settlement_reversals" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "settlement_id" uuid NOT NULL,
  "order_id" text NOT NULL,
  "seller_id" uuid NOT NULL,
  "stripe_refund_id" text NOT NULL,
  "stripe_reversal_id" text,
  "amount_cents" bigint NOT NULL DEFAULT 0,
  "commission_reversed_cents" bigint NOT NULL DEFAULT 0,
  "net_reversed_cents" bigint NOT NULL DEFAULT 0,
  "state" text NOT NULL DEFAULT 'recorded'::text,
  "idempotency_key" text NOT NULL,
  "error" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_settlement_reversals_state_check" CHECK ((state = ANY (ARRAY['recorded'::text, 'transfer_reversed'::text, 'no_transfer'::text]))),
  CONSTRAINT "seller_settlement_reversals_pkey" PRIMARY KEY (id),
  CONSTRAINT "seller_settlement_reversals_tenant_id_stripe_refund_id_sett_key" UNIQUE (tenant_id, stripe_refund_id, settlement_id),
  CONSTRAINT "seller_settlement_reversals_idempotency_key_key" UNIQUE (idempotency_key)
);
CREATE TABLE IF NOT EXISTS public."seller_settlements" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "order_id" text NOT NULL,
  "seller_order_id" text,
  "via" text NOT NULL DEFAULT 'collect'::text,
  "state" text NOT NULL DEFAULT 'pending'::text,
  "pending_reason" text,
  "items_cents" bigint NOT NULL DEFAULT 0,
  "shipping_cents" bigint NOT NULL DEFAULT 0,
  "discount_cents" bigint NOT NULL DEFAULT 0,
  "gross_cents" bigint NOT NULL DEFAULT 0,
  "commission_cents" bigint NOT NULL DEFAULT 0,
  "fees_cents" bigint NOT NULL DEFAULT 0,
  "fee_breakdown" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "net_cents" bigint NOT NULL DEFAULT 0,
  "currency" text NOT NULL DEFAULT 'usd'::text,
  "stripe_account_id" text,
  "stripe_transfer_id" text,
  "stripe_charge_id" text,
  "transfer_group" text,
  "idempotency_key" text NOT NULL,
  "execute_after" timestamp with time zone,
  "executed_at" timestamp with time zone,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_settlements_via_check" CHECK ((via = ANY (ARRAY['collect'::text, 'destination_charge'::text]))),
  CONSTRAINT "seller_settlements_state_check" CHECK ((state = ANY (ARRAY['pending'::text, 'settled'::text, 'partially_reversed'::text, 'reversed'::text]))),
  CONSTRAINT "seller_settlements_pkey" PRIMARY KEY (id),
  CONSTRAINT "seller_settlements_tenant_id_order_id_seller_id_key" UNIQUE (tenant_id, order_id, seller_id),
  CONSTRAINT "seller_settlements_idempotency_key_key" UNIQUE (idempotency_key)
);
CREATE TABLE IF NOT EXISTS public."seller_social_posts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "network" text NOT NULL,
  "listing_id" uuid,
  "external_id" text,
  "external_url" text,
  "status" text NOT NULL DEFAULT 'published'::text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_social_posts_status_check" CHECK ((status = ANY (ARRAY['published'::text, 'failed'::text]))),
  CONSTRAINT "seller_social_posts_network_check" CHECK ((network = ANY (ARRAY['pinterest'::text, 'facebook'::text, 'x'::text, 'whatsapp'::text, 'threads'::text, 'instagram'::text, 'tiktok'::text, 'email'::text, 'link'::text]))),
  CONSTRAINT "seller_social_posts_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."seller_solution_providers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "provider_name" text NOT NULL,
  "provider_type" text NOT NULL DEFAULT 'other'::text,
  "account_ref" text,
  "status" text NOT NULL DEFAULT 'connected'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_solution_providers_status_check" CHECK ((status = ANY (ARRAY['connected'::text, 'disconnected'::text]))),
  CONSTRAINT "seller_solution_providers_provider_type_check" CHECK ((provider_type = ANY (ARRAY['shipping'::text, 'accounting'::text, 'erp'::text, 'marketing'::text, 'other'::text]))),
  CONSTRAINT "seller_solution_providers_pkey" PRIMARY KEY (id),
  CONSTRAINT "seller_solution_providers_tenant_id_seller_id_provider_name_key" UNIQUE (tenant_id, seller_id, provider_name)
);
CREATE TABLE IF NOT EXISTS public."seller_stripe_accounts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "stripe_account_id" text NOT NULL,
  "charges_enabled" boolean NOT NULL DEFAULT false,
  "payouts_enabled" boolean NOT NULL DEFAULT false,
  "onboarding_complete" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_stripe_accounts_pkey" PRIMARY KEY (id),
  CONSTRAINT "seller_stripe_accounts_stripe_account_id_key" UNIQUE (stripe_account_id),
  CONSTRAINT "seller_stripe_accounts_tenant_id_seller_id_key" UNIQUE (tenant_id, seller_id)
);
CREATE TABLE IF NOT EXISTS public."seller_tax_exemptions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "exemption_type" text NOT NULL,
  "certificate_ref" text,
  "jurisdiction" text,
  "valid_from" date,
  "valid_to" date,
  "status" text NOT NULL DEFAULT 'pending_review'::text,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_tax_exemptions_status_check" CHECK ((status = ANY (ARRAY['pending_review'::text, 'active'::text, 'expired'::text, 'revoked'::text]))),
  CONSTRAINT "seller_tax_exemptions_check" CHECK (((valid_to IS NULL) OR (valid_from IS NULL) OR (valid_to >= valid_from))),
  CONSTRAINT "seller_tax_exemptions_exemption_type_check" CHECK ((exemption_type = ANY (ARRAY['resale'::text, 'nonprofit'::text, 'government'::text, 'tribal'::text, 'other'::text]))),
  CONSTRAINT "seller_tax_exemptions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."seller_tax_remittance_filings" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "jurisdiction" text NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "tax_collected" numeric(14,2),
  "amount_remitted" numeric(14,2) NOT NULL,
  "filed_at" date,
  "confirmation_number" text,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "notes" text,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_tax_remittance_filings_check" CHECK ((period_end >= period_start)),
  CONSTRAINT "seller_tax_remittance_filings_amount_remitted_check" CHECK ((amount_remitted >= (0)::numeric)),
  CONSTRAINT "seller_tax_remittance_filings_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'filed'::text, 'accepted'::text, 'amended'::text]))),
  CONSTRAINT "seller_tax_remittance_filings_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."seller_violations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "violation_type" text NOT NULL,
  "severity" text,
  "status" text,
  "description" text,
  "policy_id" uuid,
  "listing_id" uuid,
  "order_id" uuid,
  "evidence" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_violations_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."seller_webhook_deliveries" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "webhook_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'failed'::text,
  "response_status" integer,
  "error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_webhook_deliveries_status_check" CHECK ((status = ANY (ARRAY['delivered'::text, 'failed'::text]))),
  CONSTRAINT "seller_webhook_deliveries_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."seller_webhooks" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "url" text NOT NULL,
  "events" text[] NOT NULL DEFAULT '{}'::text[],
  "secret" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seller_webhooks_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."sellers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_type" text NOT NULL,
  "legal_name" text NOT NULL,
  "display_name" text NOT NULL,
  "slug" text NOT NULL,
  "email" text,
  "phone" text,
  "website" text,
  "tax_id_last4" text,
  "commission_rate" numeric(5,4),
  "status" text NOT NULL DEFAULT 'applied'::text,
  "approved_at" timestamp with time zone,
  "approved_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "operations_paused" boolean NOT NULL DEFAULT false,
  "operations_pause_from" date,
  "operations_pause_to" date,
  "operations_pause_note" text,
  "operations_paused_at" timestamp with time zone,
  CONSTRAINT "sellers_commission_rate_check" CHECK (((commission_rate >= (0)::numeric) AND (commission_rate <= (1)::numeric))),
  CONSTRAINT "sellers_seller_type_check" CHECK ((seller_type = ANY (ARRAY['first_party'::text, 'marketplace'::text]))),
  CONSTRAINT "sellers_status_check" CHECK ((status = ANY (ARRAY['applied'::text, 'approved'::text, 'suspended'::text, 'closed'::text]))),
  CONSTRAINT "sellers_pkey" PRIMARY KEY (id),
  CONSTRAINT "sellers_tenant_id_slug_key" UNIQUE (tenant_id, slug)
);
CREATE TABLE IF NOT EXISTS public."seo_overrides" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid,
  "static_path" text,
  "title" text,
  "h1" text,
  "meta_description" text,
  "og_image_url" text,
  "robots" text,
  "seo_copy" text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seo_overrides_entity_type_check" CHECK ((entity_type = ANY (ARRAY['node'::text, 'brand_placement'::text, 'product'::text, 'related_search_page'::text, 'static'::text]))),
  CONSTRAINT "seo_overrides_pkey" PRIMARY KEY (id),
  CONSTRAINT "seo_overrides_tenant_id_entity_type_entity_id_key" UNIQUE (tenant_id, entity_type, entity_id)
);
CREATE TABLE IF NOT EXISTS public."seo_templates" (
  "tenant_id" uuid NOT NULL,
  "page_type" text NOT NULL,
  "title_template" text NOT NULL,
  "h1_template" text NOT NULL,
  "meta_template" text NOT NULL,
  "og_type" text NOT NULL DEFAULT 'website'::text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "seo_templates_page_type_check" CHECK ((page_type = ANY (ARRAY['shop_landing'::text, 'animal'::text, 'department'::text, 'subcategory'::text, 'category'::text, 'brand'::text, 'product'::text, 'related_search'::text]))),
  CONSTRAINT "seo_templates_pkey" PRIMARY KEY (tenant_id, page_type)
);
CREATE TABLE IF NOT EXISTS public."service_items" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "category" text NOT NULL,
  "name" text NOT NULL,
  "price" text,
  "isPackage" boolean DEFAULT false,
  "smallPrice" text,
  "mediumPrice" text,
  "largePrice" text,
  "xlargePrice" text,
  "order" integer DEFAULT 0,
  "visible" boolean DEFAULT true,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  "tenant_id" uuid NOT NULL,
  "memberPrice" text,
  "memberSmallPrice" text,
  "memberMediumPrice" text,
  "memberLargePrice" text,
  "memberXlargePrice" text,
  "isTreatment" boolean DEFAULT false,
  "treatmentNote" text,
  CONSTRAINT "service_items_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."service_pricing" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "serviceName" text,
  "size" text,
  "price" text,
  "depositAmount" text,
  "durationMinutes" integer DEFAULT 120,
  "active" boolean DEFAULT true,
  "createdAt" timestamp with time zone DEFAULT now(),
  "tenant_id" uuid NOT NULL,
  CONSTRAINT "service_pricing_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."services" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "icon" text DEFAULT 'Scissors'::text,
  "image" text,
  "alt" text,
  "order" integer DEFAULT 0,
  "visible" boolean DEFAULT true,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  "tenant_id" uuid,
  "search_vector" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english'::regconfig, search_text(VARIADIC ARRAY[title, description, icon])), 'A'::"char")) STORED,
  CONSTRAINT "services_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."ship_from_addresses" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid,
  "name" text NOT NULL DEFAULT ''::text,
  "street" text NOT NULL DEFAULT ''::text,
  "city" text NOT NULL DEFAULT ''::text,
  "state" text NOT NULL DEFAULT ''::text,
  "zip" text NOT NULL DEFAULT ''::text,
  "phone" text NOT NULL DEFAULT ''::text,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "ship_from_addresses_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."shipping_memberships" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "email" text NOT NULL,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "stripe_checkout_session_id" text,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "billing_interval" text NOT NULL DEFAULT 'monthly'::text,
  "current_period_end" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "shipping_memberships_pkey" PRIMARY KEY (id),
  CONSTRAINT "shipping_memberships_stripe_subscription_id_key" UNIQUE (stripe_subscription_id)
);
CREATE TABLE IF NOT EXISTS public."shipping_profiles" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "supplier_id" uuid NOT NULL,
  "profile_name" text NOT NULL,
  "method_name" text NOT NULL DEFAULT 'Standard'::text,
  "origin_country" text,
  "destination_countries" text[] NOT NULL DEFAULT '{}'::text[],
  "first_item_cost" numeric(10,2),
  "additional_item_cost" numeric(10,2),
  "currency" text NOT NULL DEFAULT 'USD'::text,
  "min_days" integer,
  "max_days" integer,
  "is_default" boolean NOT NULL DEFAULT false,
  "raw_payload" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "shipping_profiles_pkey" PRIMARY KEY (id),
  CONSTRAINT "shipping_profiles_supplier_id_profile_name_method_name_key" UNIQUE (supplier_id, profile_name, method_name)
);
CREATE TABLE IF NOT EXISTS public."shop_category_images" (
  "node_id" uuid NOT NULL,
  "image_url" text NOT NULL,
  "width" integer,
  "height" integer,
  "source" text NOT NULL DEFAULT 'auto'::text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "shop_category_images_pkey" PRIMARY KEY (node_id)
);
CREATE TABLE IF NOT EXISTS public."shop_grid_cards" (
  "item_id" uuid NOT NULL,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "brand" text,
  "short_description" text,
  "image" text,
  "price" numeric NOT NULL,
  "compare_at" numeric,
  "in_stock" boolean NOT NULL DEFAULT true,
  "is_new" boolean NOT NULL DEFAULT false,
  "is_best_seller" boolean NOT NULL DEFAULT false,
  "is_house_favorite" boolean NOT NULL DEFAULT false,
  "option_size" text,
  "option_color" text,
  "rating_avg" numeric,
  "rating_count" integer NOT NULL DEFAULT 0,
  "taxonomy_node_ids" text[] NOT NULL DEFAULT '{}'::text[],
  "seller_id" text,
  "created_at" timestamp with time zone,
  "refreshed_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "shop_grid_cards_slug_key" UNIQUE (slug)
);
CREATE TABLE IF NOT EXISTS public."shop_image_dims" (
  "url" text NOT NULL,
  "width" integer,
  "height" integer,
  "checked_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "shop_image_dims_pkey" PRIMARY KEY (url)
);
CREATE TABLE IF NOT EXISTS public."site_templates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "key" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "blocks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "created_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "pages" jsonb,
  CONSTRAINT "site_templates_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text]))),
  CONSTRAINT "site_templates_pkey" PRIMARY KEY (id),
  CONSTRAINT "site_templates_key_key" UNIQUE (key)
);
CREATE TABLE IF NOT EXISTS public."social_accounts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "metricool_brand_id" text NOT NULL,
  "network" text NOT NULL,
  "handle" text,
  "status" text NOT NULL DEFAULT 'connected'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "external_account_id" text,
  "display_name" text,
  "avatar_url" text,
  "access_token_encrypted" text,
  "refresh_token_encrypted" text,
  "token_expires_at" timestamp with time zone,
  "scopes" text[],
  "connected_by" uuid,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "platform" social_platform NOT NULL,
  "platform_account_id" text NOT NULL,
  "access_status" text NOT NULL DEFAULT 'approved'::text,
  "review_state" text NOT NULL DEFAULT 'not_required'::text,
  "auth_type" text NOT NULL DEFAULT 'oauth2_user'::text,
  "capability" text NOT NULL DEFAULT 'server_publish'::text,
  "expires_at" timestamp with time zone,
  "last_health_check_at" timestamp with time zone,
  "last_refresh_error" text,
  "deleted_at" timestamp with time zone,
  "seller_id" uuid NOT NULL,
  CONSTRAINT "social_accounts_status_check" CHECK ((status = ANY (ARRAY['connected'::text, 'disconnected'::text, 'needs_reconnect'::text]))),
  CONSTRAINT "social_accounts_review_state_check" CHECK ((review_state = ANY (ARRAY['not_required'::text, 'dev_mode'::text, 'pending_review'::text, 'approved'::text, 'private_only_until_approved'::text]))),
  CONSTRAINT "social_accounts_network_check" CHECK ((network = ANY (ARRAY['facebook'::text, 'instagram'::text, 'tiktok'::text, 'pinterest'::text, 'threads'::text, 'x'::text, 'linkedin'::text, 'youtube'::text]))),
  CONSTRAINT "social_accounts_capability_check" CHECK ((capability = ANY (ARRAY['server_publish'::text, 'messaging'::text, 'user_handoff'::text, 'store_content'::text]))),
  CONSTRAINT "social_accounts_auth_type_check" CHECK ((auth_type = ANY (ARRAY['oauth2_user'::text, 'oauth2_system_user'::text, 'bot_token'::text, 'app_password'::text, 'atproto_oauth'::text]))),
  CONSTRAINT "social_accounts_pkey" PRIMARY KEY (id),
  CONSTRAINT "social_accounts_tenant_id_metricool_brand_id_network_key" UNIQUE (tenant_id, metricool_brand_id, network)
);
CREATE TABLE IF NOT EXISTS public."social_data_deletion_requests" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "seller_id" uuid,
  "source" text NOT NULL DEFAULT 'meta_callback'::text,
  "platform" social_platform,
  "platform_user_ref_hash" text,
  "confirmation_code" text NOT NULL,
  "status" text NOT NULL DEFAULT 'received'::text,
  "requested_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone,
  CONSTRAINT "social_data_deletion_requests_status_check" CHECK ((status = ANY (ARRAY['received'::text, 'in_progress'::text, 'completed'::text, 'rejected'::text]))),
  CONSTRAINT "social_data_deletion_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "social_data_deletion_requests_confirmation_code_key" UNIQUE (confirmation_code)
);
CREATE TABLE IF NOT EXISTS public."social_media_assets" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "storage_bucket" text NOT NULL DEFAULT 'media'::text,
  "storage_path" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" bigint,
  "sha256" text,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone,
  CONSTRAINT "social_media_assets_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."social_oauth_states" (
  "state" text NOT NULL,
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "platform" social_platform NOT NULL,
  "pkce_verifier" text,
  "shop" text,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "social_oauth_states_pkey" PRIMARY KEY (state)
);
CREATE TABLE IF NOT EXISTS public."social_oauth_tokens" (
  "social_account_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "access_token_ciphertext" bytea NOT NULL,
  "refresh_token_ciphertext" bytea,
  "key_id" text NOT NULL DEFAULT 'prod-1'::text,
  "expires_at" timestamp with time zone,
  "scopes" text[] NOT NULL DEFAULT '{}'::text[],
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "social_oauth_tokens_pkey" PRIMARY KEY (social_account_id)
);
CREATE TABLE IF NOT EXISTS public."social_outbox_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid,
  "aggregate_type" text NOT NULL,
  "aggregate_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "attempts" integer NOT NULL DEFAULT 0,
  "next_attempt_at" timestamp with time zone NOT NULL DEFAULT now(),
  "processed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "claimed_at" timestamp with time zone,
  CONSTRAINT "social_outbox_events_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'dead'::text]))),
  CONSTRAINT "social_outbox_events_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."social_platform_apps" (
  "platform" social_platform NOT NULL,
  "client_id" text,
  "client_secret_ciphertext" text,
  "access_token_ciphertext" text,
  "extra_ciphertext" text,
  "enabled" boolean NOT NULL DEFAULT true,
  "updated_by" uuid,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "social_platform_apps_pkey" PRIMARY KEY (platform)
);
CREATE TABLE IF NOT EXISTS public."social_platform_capabilities" (
  "platform" social_platform NOT NULL,
  "can_publish_text" boolean NOT NULL DEFAULT false,
  "can_publish_image" boolean NOT NULL DEFAULT false,
  "can_publish_video" boolean NOT NULL DEFAULT false,
  "can_publish_carousel" boolean NOT NULL DEFAULT false,
  "max_chars" integer,
  "max_video_seconds" integer,
  "requires_public_media_url" boolean NOT NULL DEFAULT false,
  "requires_app_review" boolean NOT NULL DEFAULT false,
  "notes" text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "social_platform_capabilities_max_video_seconds_check" CHECK ((max_video_seconds > 0)),
  CONSTRAINT "social_platform_capabilities_max_chars_check" CHECK ((max_chars > 0)),
  CONSTRAINT "social_platform_capabilities_pkey" PRIMARY KEY (platform)
);
CREATE TABLE IF NOT EXISTS public."social_post_media" (
  "post_id" uuid NOT NULL,
  "media_asset_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "position" integer NOT NULL DEFAULT 0,
  CONSTRAINT "social_post_media_pkey" PRIMARY KEY (post_id, media_asset_id)
);
CREATE TABLE IF NOT EXISTS public."social_post_networks" (
  "social_post_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "network" text NOT NULL,
  "metricool_post_id" text,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "social_account_id" uuid,
  "external_post_id" text,
  "external_url" text,
  "error" text,
  "published_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "social_post_networks_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'published'::text, 'failed'::text]))),
  CONSTRAINT "social_post_networks_pkey" PRIMARY KEY (social_post_id, network)
);
CREATE TABLE IF NOT EXISTS public."social_post_series" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "author_id" uuid,
  "name" text NOT NULL,
  "body" text,
  "title" text,
  "link_url" text,
  "listing_id" uuid,
  "target_account_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[],
  "media_asset_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[],
  "platform_specific" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "frequency" text NOT NULL,
  "interval" integer NOT NULL DEFAULT 1,
  "time_local" time without time zone NOT NULL DEFAULT '09:00:00'::time without time zone,
  "timezone" text NOT NULL DEFAULT 'America/Chicago'::text,
  "weekday" integer,
  "monthday" integer,
  "status" text NOT NULL DEFAULT 'active'::text,
  "next_run_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "deleted_at" timestamp with time zone,
  CONSTRAINT "social_post_series_frequency_check" CHECK ((frequency = ANY (ARRAY['daily'::text, 'weekly'::text, 'monthly'::text]))),
  CONSTRAINT "social_post_series_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'ended'::text]))),
  CONSTRAINT "social_post_series_interval_check" CHECK (("interval" >= 1)),
  CONSTRAINT "social_post_series_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."social_post_targets" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "post_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "social_account_id" uuid NOT NULL,
  "platform" social_platform NOT NULL,
  "platform_post_id" text,
  "platform_url" text,
  "body_override" text,
  "status" social_target_status NOT NULL DEFAULT 'queued'::social_target_status,
  "idempotency_key" text,
  "handoff_completed_at" timestamp with time zone,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "error_code" text,
  "error_message" text,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "social_post_targets_body_override_check" CHECK ((char_length(body_override) <= 25000)),
  CONSTRAINT "social_post_targets_check" CHECK ((NOT ((platform = 'snapchat'::social_platform) AND (status = 'published'::social_target_status)))),
  CONSTRAINT "social_post_targets_pkey" PRIMARY KEY (id),
  CONSTRAINT "social_post_targets_post_id_social_account_id_key" UNIQUE (post_id, social_account_id)
);
CREATE TABLE IF NOT EXISTS public."social_posts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "source_type" text NOT NULL,
  "source_id" uuid,
  "caption" text NOT NULL,
  "media_urls" text[] NOT NULL DEFAULT '{}'::text[],
  "product_url" text,
  "scheduled_at" timestamp with time zone,
  "metricool_post_id" text,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "approved_by" uuid,
  "error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "published_at" timestamp with time zone,
  "author_id" uuid,
  "body" text,
  "title" text,
  "link_url" text,
  "listing_id" uuid,
  "queued_slot_id" uuid,
  "series_id" uuid,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "social_posts_source_type_check" CHECK ((source_type = ANY (ARRAY['product'::text, 'design'::text, 'design_publication'::text, 'collection'::text, 'custom'::text]))),
  CONSTRAINT "social_posts_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'publishing'::text, 'published'::text, 'failed'::text, 'cancelled'::text]))),
  CONSTRAINT "social_posts_pkey" PRIMARY KEY (id, tenant_id),
  CONSTRAINT "social_posts_id_key" UNIQUE (id)
);
CREATE TABLE IF NOT EXISTS public."social_publish_attempts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "post_target_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "attempt_no" integer NOT NULL,
  "idempotency_key" text NOT NULL,
  "result" text,
  "error_code" text,
  "error_message" text,
  "http_status" integer,
  "provider_request_id" text,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "finished_at" timestamp with time zone,
  CONSTRAINT "social_publish_attempts_pkey" PRIMARY KEY (id),
  CONSTRAINT "social_publish_attempts_idempotency_key_key" UNIQUE (idempotency_key)
);
CREATE TABLE IF NOT EXISTS public."social_schedule_slots" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "weekday" integer NOT NULL,
  "time_local" time without time zone NOT NULL,
  "timezone" text NOT NULL DEFAULT 'America/Chicago'::text,
  "label" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "social_schedule_slots_weekday_check" CHECK (((weekday >= 0) AND (weekday <= 6))),
  CONSTRAINT "social_schedule_slots_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."social_webhook_deliveries" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "endpoint_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "response_status" integer,
  "delivered_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "social_webhook_deliveries_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'delivered'::text, 'failed'::text]))),
  CONSTRAINT "social_webhook_deliveries_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."social_webhook_endpoints" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid,
  "url" text NOT NULL,
  "secret_ciphertext" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "social_webhook_endpoints_url_check" CHECK ((char_length(url) <= 2048)),
  CONSTRAINT "social_webhook_endpoints_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'revoked'::text]))),
  CONSTRAINT "social_webhook_endpoints_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."sources" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "name" text NOT NULL,
  "type" text NOT NULL DEFAULT 'feed'::text,
  "feed_url" text,
  "last_sync" timestamp with time zone,
  "product_count" integer DEFAULT 0,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "sources_pkey" PRIMARY KEY (id),
  CONSTRAINT "sources_name_key" UNIQUE (name)
);
CREATE TABLE IF NOT EXISTS public."ssp_endpoints" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "organization_id" uuid NOT NULL,
  "protocol" text NOT NULL,
  "endpoint" text NOT NULL,
  "api_key" text,
  "status" text DEFAULT 'active'::text,
  "revenue" double precision DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "ssp_endpoints_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."staff" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "name" text NOT NULL,
  "role" text DEFAULT 'Groomer'::text,
  "bio" text,
  "active" boolean DEFAULT true,
  "sortOrder" integer DEFAULT 0,
  "createdAt" timestamp with time zone DEFAULT now(),
  "userId" text,
  "avatar" text,
  "email" text,
  "phone" text,
  "rating" text,
  "tenant_id" uuid,
  "search_vector" tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english'::regconfig, search_text(VARIADIC ARRAY[name, role, bio, email, phone, rating])), 'A'::"char")) STORED,
  CONSTRAINT "staff_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."state_rules" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "jurisdiction" text NOT NULL,
  "telemedicine_vcpr_allowed" boolean NOT NULL,
  "effective_date" date,
  "source_url" text,
  "checked_at" timestamp with time zone,
  CONSTRAINT "state_rules_pkey" PRIMARY KEY (id),
  CONSTRAINT "state_rules_jurisdiction_key" UNIQUE (jurisdiction)
);
CREATE TABLE IF NOT EXISTS public."stg_feed" (
  "supplier" text NOT NULL,
  "source_product_id" text NOT NULL,
  "source_variant_id" text,
  "title" text,
  "handle" text,
  "description_html" text,
  "vendor" text,
  "product_type" text,
  "tags" text[],
  "variant_title" text,
  "sku" text,
  "price" numeric,
  "compare_at_price" numeric,
  "available" boolean,
  "weight_grams" integer,
  "image_urls" text[],
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "stg_feed_supplier_source_product_id_source_variant_id_key" UNIQUE (supplier, source_product_id, source_variant_id)
);
CREATE TABLE IF NOT EXISTS public."stripe_pending_charges" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "status" text NOT NULL DEFAULT 'awaiting_payment'::text,
  "amount" numeric NOT NULL,
  "currency" text NOT NULL DEFAULT 'USD'::text,
  "customer_id" uuid,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "stripe_checkout_session_id" text,
  "stripe_payment_intent_id" text,
  "sale_id" uuid,
  "payment_id" uuid,
  "error" text,
  "created_by" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL DEFAULT (now() + '24:00:00'::interval),
  CONSTRAINT "stripe_pending_charges_kind_check" CHECK ((kind = ANY (ARRAY['pos_sale'::text, 'manual_payment'::text]))),
  CONSTRAINT "stripe_pending_charges_status_check" CHECK ((status = ANY (ARRAY['awaiting_payment'::text, 'completing'::text, 'completed'::text, 'failed'::text, 'expired'::text, 'cancelled'::text]))),
  CONSTRAINT "stripe_pending_charges_amount_check" CHECK ((amount > (0)::numeric)),
  CONSTRAINT "stripe_pending_charges_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."stripe_webhook_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "provider" text NOT NULL DEFAULT 'stripe'::text,
  "provider_event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "api_version" text,
  "livemode" boolean,
  "payload" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "attempts" integer NOT NULL DEFAULT 0,
  "available_at" timestamp with time zone NOT NULL DEFAULT now(),
  "claimed_at" timestamp with time zone,
  "claimed_by" text,
  "progress" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "last_error" text,
  "received_at" timestamp with time zone NOT NULL DEFAULT now(),
  "processed_at" timestamp with time zone,
  CONSTRAINT "stripe_webhook_events_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'processed'::text, 'failed'::text, 'dead'::text]))),
  CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "stripe_webhook_events_provider_event_id_key" UNIQUE (provider_event_id)
);
CREATE TABLE IF NOT EXISTS public."subscription_plans" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "name" text NOT NULL,
  "size_tier" text NOT NULL,
  "weight_range" text NOT NULL,
  "monthly_price_cents" integer,
  "visits_per_month" integer NOT NULL DEFAULT 4,
  "annual_prepay_months" integer NOT NULL DEFAULT 12,
  "annual_prepay_charge_months" integer NOT NULL DEFAULT 10,
  "multi_dependent_discount_percent" numeric NOT NULL DEFAULT 10,
  "includes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "excludes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "terms" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  CONSTRAINT "subscription_plans_size_tier_check" CHECK ((size_tier = ANY (ARRAY['SMALL'::text, 'MEDIUM'::text, 'LARGE'::text, 'XLARGE'::text]))),
  CONSTRAINT "subscription_plans_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."subscriptions" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "plan_id" text NOT NULL,
  "email" text NOT NULL,
  "user_id" uuid,
  "customer_id" text,
  "dependent_id" text,
  "dependent_name" text,
  "status" text NOT NULL DEFAULT 'PENDING'::text,
  "billing_interval" text NOT NULL DEFAULT 'monthly'::text,
  "price_cents" integer NOT NULL DEFAULT 0,
  "visits_included" integer NOT NULL DEFAULT 4,
  "visits_used" integer NOT NULL DEFAULT 0,
  "stripe_subscription_id" text,
  "stripe_checkout_session_id" text,
  "current_period_start" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "cancel_at_period_end" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "reminder_sent_period" timestamp with time zone,
  "reminder_sent_at" timestamp with time zone,
  CONSTRAINT "subscriptions_billing_interval_check" CHECK ((billing_interval = ANY (ARRAY['monthly'::text, 'annual'::text]))),
  CONSTRAINT "subscriptions_status_check" CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACTIVE'::text, 'PAUSED'::text, 'CANCELLED'::text, 'PAST_DUE'::text]))),
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."supplier_catalog_products" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "supplier_id" uuid NOT NULL,
  "external_id" text NOT NULL,
  "external_id_type" text NOT NULL,
  "name" text NOT NULL,
  "brand_name" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "category_id" uuid,
  "variant_count" integer,
  "image_url" text,
  "images" jsonb,
  "slug" text,
  "is_hidden" boolean NOT NULL DEFAULT false,
  CONSTRAINT "supplier_catalog_products_pkey" PRIMARY KEY (id),
  CONSTRAINT "supplier_catalog_products_supplier_id_external_id_key" UNIQUE (supplier_id, external_id),
  CONSTRAINT "scp_supplier_external" UNIQUE (supplier_id, external_id)
);
CREATE TABLE IF NOT EXISTS public."supplier_catalog_variants" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "supplier_id" uuid NOT NULL,
  "supplier_catalog_product_id" uuid NOT NULL,
  "external_id" text NOT NULL,
  "name" text NOT NULL,
  "size" text,
  "color" text,
  "print_specs" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "price_snapshot" numeric(10,2),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "supplier_catalog_variants_pkey" PRIMARY KEY (id),
  CONSTRAINT "scv_supplier_external" UNIQUE (supplier_id, external_id),
  CONSTRAINT "supplier_catalog_variants_supplier_id_external_id_key" UNIQUE (supplier_id, external_id)
);
CREATE TABLE IF NOT EXISTS public."supplier_category_mapping" (
  "supplier" text NOT NULL DEFAULT 'manual'::text,
  "supplier_product_type" text NOT NULL,
  "lookup_key" text NOT NULL,
  "landing" text,
  "primary_category" text NOT NULL,
  "categories" text[] NOT NULL,
  "product_count" integer,
  "in_taxonomy" boolean NOT NULL DEFAULT true,
  "notes" text,
  "subject_scope" text,
  CONSTRAINT "supplier_category_mapping_pkey" PRIMARY KEY (supplier, lookup_key)
);
CREATE TABLE IF NOT EXISTS public."supplier_category_memory" (
  "category_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" uuid,
  CONSTRAINT "supplier_category_memory_pkey" PRIMARY KEY (category_id)
);
CREATE TABLE IF NOT EXISTS public."supplier_category_visibility" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "supplier_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "is_hidden" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" uuid,
  CONSTRAINT "supplier_category_visibility_pkey" PRIMARY KEY (id),
  CONSTRAINT "supplier_category_visibility_unique" UNIQUE (supplier_id, category_id)
);
CREATE TABLE IF NOT EXISTS public."supplier_fulfillment_locations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "supplier_id" uuid NOT NULL,
  "location_code" text,
  "country" text NOT NULL,
  "region" text,
  "city" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "raw_payload" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "supplier_fulfillment_locations_pkey" PRIMARY KEY (id),
  CONSTRAINT "supplier_fulfillment_locations_supplier_id_location_code_key" UNIQUE (supplier_id, location_code)
);
CREATE TABLE IF NOT EXISTS public."supplier_import_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "import_id" uuid NOT NULL,
  "external_id" text NOT NULL,
  "raw" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'pending'::text,
  "error" text,
  CONSTRAINT "supplier_import_items_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'mapped'::text, 'duplicate'::text, 'failed'::text]))),
  CONSTRAINT "supplier_import_items_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."supplier_imports" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL,
  "source_type" text NOT NULL,
  "source_url" text,
  "status" text NOT NULL DEFAULT 'queued'::text,
  "total_rows" integer NOT NULL DEFAULT 0,
  "imported_rows" integer NOT NULL DEFAULT 0,
  "error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "supplier_imports_source_type_check" CHECK ((source_type = ANY (ARRAY['shopify_public_json'::text, 'feed_xml'::text, 'feed_csv'::text, 'feed_json'::text, 'browser_catalog'::text]))),
  CONSTRAINT "supplier_imports_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'fetching'::text, 'mapping'::text, 'awaiting_approval'::text, 'approved'::text, 'failed'::text]))),
  CONSTRAINT "supplier_imports_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."supplier_mockup_templates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "canonical_product_id" uuid,
  "supplier_name" character varying(100) NOT NULL,
  "supplier_blueprint_id" character varying(255),
  "placement_tag" character varying(100) NOT NULL,
  "technique" character varying(100),
  "catalog_variant_ids" jsonb,
  "template_width" integer NOT NULL,
  "template_height" integer NOT NULL,
  "print_area_width" integer NOT NULL,
  "print_area_height" integer NOT NULL,
  "print_area_top" integer NOT NULL,
  "print_area_left" integer NOT NULL,
  "image_url" text,
  "stored_image_path" text,
  "background_url" text,
  "background_color" character varying(20),
  "printfile_id" character varying(255),
  "raw_payload" jsonb,
  "captured_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  "model_glb_url" text,
  "mesh_target_name" character varying(100),
  "default_camera_angle" jsonb,
  CONSTRAINT "supplier_mockup_templates_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."supplier_print_specs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "canonical_product_id" uuid,
  "supplier_name" character varying(100) NOT NULL,
  "supplier_blueprint_id" character varying(255),
  "placement_tag" character varying(100) NOT NULL,
  "print_width_px" integer NOT NULL,
  "print_height_px" integer NOT NULL,
  "target_dpi" integer NOT NULL DEFAULT 300,
  "offset_top_percent" numeric(5,2) DEFAULT 0.00,
  "offset_left_percent" numeric(5,2) DEFAULT 0.00,
  "raw_payload" jsonb,
  "captured_at" timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  "size_tag" character varying(100) NOT NULL DEFAULT 'unsized'::character varying,
  CONSTRAINT "supplier_print_specs_pkey" PRIMARY KEY (id),
  CONSTRAINT "supplier_print_specs_canonical_supplier_placement_size_key" UNIQUE (canonical_product_id, supplier_name, placement_tag, size_tag)
);
CREATE TABLE IF NOT EXISTS public."supplier_product_costs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "canonical_product_id" uuid NOT NULL,
  "supplier_name" character varying(100) NOT NULL,
  "supplier_variant_id" character varying(255) NOT NULL,
  "base_cost_usd" numeric(10,2) NOT NULL,
  "shipping_estimate_usd" numeric(10,2) NOT NULL DEFAULT 0,
  "is_in_stock" boolean NOT NULL DEFAULT true,
  "last_checked_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "supplier_product_costs_pkey" PRIMARY KEY (id),
  CONSTRAINT "supplier_product_costs_canonical_product_id_supplier_name_s_key" UNIQUE (canonical_product_id, supplier_name, supplier_variant_id)
);
CREATE TABLE IF NOT EXISTS public."supplier_product_mappings" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL,
  "supplier_catalog_variant_id" uuid,
  "product_sku" text NOT NULL,
  "supplier_sku" text NOT NULL,
  "print_job_config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "printful_sync_product_id" bigint,
  "printful_external_id" character varying(255),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "supplier_product_mappings_pkey" PRIMARY KEY (id),
  CONSTRAINT "supplier_product_mappings_tenant_id_product_sku_key" UNIQUE (tenant_id, product_sku)
);
CREATE TABLE IF NOT EXISTS public."suppliers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "kind" text NOT NULL,
  "catalog_source" text NOT NULL,
  "api_base_url" text,
  "ordering_status" text NOT NULL DEFAULT 'catalog_only'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "suppliers_ordering_status_check" CHECK ((ordering_status = ANY (ARRAY['catalog_only'::text, 'live'::text, 'manual_order'::text]))),
  CONSTRAINT "suppliers_catalog_source_check" CHECK ((catalog_source = ANY (ARRAY['api'::text, 'browser_catalog'::text, 'feed_xml'::text, 'feed_csv'::text, 'feed_json'::text, 'shopify_public_json'::text, 'manual'::text]))),
  CONSTRAINT "suppliers_kind_check" CHECK ((kind = ANY (ARRAY['pod'::text, 'dropship'::text, 'marketplace'::text, 'seller'::text]))),
  CONSTRAINT "suppliers_pkey" PRIMARY KEY (id),
  CONSTRAINT "suppliers_slug_key" UNIQUE (slug)
);
CREATE TABLE IF NOT EXISTS public."supply_service_map" (
  "node_id" uuid NOT NULL,
  "service_id" uuid NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  CONSTRAINT "supply_service_map_pkey" PRIMARY KEY (node_id, service_id)
);
CREATE TABLE IF NOT EXISTS public."support_actions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "ticket_id" uuid NOT NULL,
  "action_type" text NOT NULL,
  "target_ref" text,
  "amount" numeric(12,2),
  "status" text NOT NULL,
  "requested_by" uuid,
  "approved_by" uuid,
  "executed_at" timestamp with time zone,
  "idempotency_key" text,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_actions_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_attachments" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "ticket_id" uuid NOT NULL,
  "message_id" uuid,
  "event_id" uuid,
  "storage_key" text NOT NULL,
  "filename" text,
  "mime_declared" text,
  "mime_detected" text,
  "size_bytes" bigint,
  "sha256" text,
  "visibility" text NOT NULL,
  "scan_status" text NOT NULL,
  "uploaded_by_staff_id" uuid,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_attachments_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_automations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "scope" text NOT NULL DEFAULT 'tenant'::text,
  "tenant_id" uuid,
  "inherits_from_id" uuid,
  "locked_by_master" boolean NOT NULL DEFAULT false,
  "name" text NOT NULL,
  "trigger_event" text NOT NULL,
  "conditions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "actions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "dry_run" boolean NOT NULL DEFAULT false,
  "kill_switch" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_automations_trigger_event_check" CHECK ((trigger_event = ANY (ARRAY['ticket_created'::text, 'ticket_updated'::text, 'message_received'::text, 'time_based'::text]))),
  CONSTRAINT "support_automations_check" CHECK ((((scope = 'master'::text) AND (tenant_id IS NULL)) OR ((scope = 'tenant'::text) AND (tenant_id IS NOT NULL)))),
  CONSTRAINT "support_automations_scope_check" CHECK ((scope = ANY (ARRAY['master'::text, 'tenant'::text]))),
  CONSTRAINT "support_automations_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_business_hours" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "scope" text NOT NULL DEFAULT 'tenant'::text,
  "tenant_id" uuid,
  "inherits_from_id" uuid,
  "locked_by_master" boolean NOT NULL DEFAULT false,
  "name" text NOT NULL,
  "timezone" text NOT NULL DEFAULT 'UTC'::text,
  "schedule" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_default" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_business_hours_check" CHECK ((((scope = 'master'::text) AND (tenant_id IS NULL)) OR ((scope = 'tenant'::text) AND (tenant_id IS NOT NULL)))),
  CONSTRAINT "support_business_hours_scope_check" CHECK ((scope = ANY (ARRAY['master'::text, 'tenant'::text]))),
  CONSTRAINT "support_business_hours_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_canned_replies" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "scope" text NOT NULL,
  "tenant_id" uuid,
  "inherits_from_id" uuid,
  "locked_by_master" boolean NOT NULL DEFAULT false,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "category_code" text,
  "locale" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_canned_replies_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_case_details" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "ticket_id" uuid NOT NULL,
  "case_type" text NOT NULL,
  "deadline_at" timestamp with time zone,
  "status" text NOT NULL DEFAULT 'open'::text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "legal_hold" boolean NOT NULL DEFAULT false,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_case_details_case_type_check" CHECK ((case_type = ANY (ARRAY['legal'::text, 'law_enforcement'::text, 'trust_safety'::text]))),
  CONSTRAINT "support_case_details_pkey" PRIMARY KEY (id),
  CONSTRAINT "support_case_details_ticket_key" UNIQUE (ticket_id)
);
CREATE TABLE IF NOT EXISTS public."support_categories" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "code" text NOT NULL,
  "scope" text NOT NULL,
  "tenant_id" uuid,
  "inherits_from_code" text,
  "locked_by_master" boolean NOT NULL DEFAULT false,
  "name" text NOT NULL,
  "parent_code" text,
  "default_team_id" uuid,
  "default_sla_policy_id" uuid,
  "regulated" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_categories_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_channel_threads" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "channel" text NOT NULL,
  "thread_key" text NOT NULL,
  "conversation_id" uuid NOT NULL,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_channel_threads_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_channels" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "scope" text NOT NULL,
  "tenant_id" uuid,
  "inherits_from_id" uuid,
  "locked_by_master" boolean NOT NULL DEFAULT false,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "sending_domain" text,
  "allow_list" jsonb NOT NULL,
  "block_list" jsonb NOT NULL,
  "spam_quarantine" boolean NOT NULL DEFAULT true,
  "reopen_window_days" integer NOT NULL DEFAULT 14,
  "max_attachment_bytes" bigint,
  "max_ticket_attachment_bytes" bigint,
  "blocked_extensions" text[] NOT NULL,
  "config" jsonb NOT NULL,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_channels_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_contact_notes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "contact_id" uuid NOT NULL,
  "author_staff_id" uuid,
  "body" text NOT NULL,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_contact_notes_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_contact_orgs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "contact_id" uuid NOT NULL,
  "organization_id" uuid NOT NULL,
  "role" text,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_contact_orgs_pkey" PRIMARY KEY (id),
  CONSTRAINT "support_contact_orgs_contact_id_organization_id_key" UNIQUE (contact_id, organization_id)
);
CREATE TABLE IF NOT EXISTS public."support_contacts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "display_name" text,
  "email_normalized" text,
  "phone_normalized" text,
  "locale" text,
  "timezone" text,
  "is_blocked" boolean NOT NULL DEFAULT false,
  "abuse_score" numeric NOT NULL DEFAULT 0,
  "is_vip" boolean NOT NULL DEFAULT false,
  "customer_id" uuid,
  "staff_id" uuid,
  "seller_id" uuid,
  "merged_into_id" uuid,
  "metadata" jsonb NOT NULL,
  "row_version" integer NOT NULL DEFAULT 1,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_contacts_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_drafts" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "ticket_id" uuid,
  "staff_id" uuid NOT NULL,
  "body" text NOT NULL DEFAULT ''::text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_drafts_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_escalation_rules" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "scope" text NOT NULL,
  "tenant_id" uuid,
  "inherits_from_id" uuid,
  "locked_by_master" boolean NOT NULL DEFAULT false,
  "name" text NOT NULL,
  "trigger_type" text NOT NULL,
  "condition" jsonb NOT NULL,
  "action" text NOT NULL,
  "action_config" jsonb NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_escalation_rules_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_forms" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "audience" text NOT NULL DEFAULT 'customer'::text,
  "kind" text NOT NULL DEFAULT 'intake'::text,
  "fields" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_forms_status_check" CHECK ((status = ANY (ARRAY['published'::text, 'draft'::text]))),
  CONSTRAINT "support_forms_audience_check" CHECK ((audience = ANY (ARRAY['customer'::text, 'agent'::text]))),
  CONSTRAINT "support_forms_kind_check" CHECK ((kind = ANY (ARRAY['intake'::text, 'guided'::text]))),
  CONSTRAINT "support_forms_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_holidays" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "scope" text NOT NULL DEFAULT 'tenant'::text,
  "tenant_id" uuid,
  "inherits_from_id" uuid,
  "locked_by_master" boolean NOT NULL DEFAULT false,
  "business_hours_id" uuid,
  "holiday_date" date NOT NULL,
  "name" text NOT NULL,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_holidays_check" CHECK ((((scope = 'master'::text) AND (tenant_id IS NULL)) OR ((scope = 'tenant'::text) AND (tenant_id IS NOT NULL)))),
  CONSTRAINT "support_holidays_scope_check" CHECK ((scope = ANY (ARRAY['master'::text, 'tenant'::text]))),
  CONSTRAINT "support_holidays_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_jobs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid,
  "type" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'queued'::text,
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 5,
  "next_attempt_at" timestamp with time zone,
  "last_error" text,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_jobs_type_check" CHECK ((type = ANY (ARRAY['sla_sweep'::text, 'auto_close'::text, 'email_ingest_retry'::text, 'csat_dispatch'::text, 'retention'::text, 'virus_scan'::text, 'webhook_delivery'::text]))),
  CONSTRAINT "support_jobs_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'dead_letter'::text]))),
  CONSTRAINT "support_jobs_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_kb_articles" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "title" text NOT NULL,
  "summary" text,
  "body" text,
  "collection" text NOT NULL DEFAULT 'Customer support'::text,
  "audience" text NOT NULL DEFAULT 'public'::text,
  "owner_name" text,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "usage_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_kb_articles_status_check" CHECK ((status = ANY (ARRAY['published'::text, 'in_review'::text, 'draft'::text]))),
  CONSTRAINT "support_kb_articles_audience_check" CHECK ((audience = ANY (ARRAY['public'::text, 'agents'::text, 'internal'::text]))),
  CONSTRAINT "support_kb_articles_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_macros" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "scope" text NOT NULL,
  "tenant_id" uuid,
  "inherits_from_id" uuid,
  "locked_by_master" boolean NOT NULL DEFAULT false,
  "name" text NOT NULL,
  "description" text,
  "actions" jsonb NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_macros_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_notification_prefs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "staff_id" uuid NOT NULL,
  "event_kind" text NOT NULL,
  "channel" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "digest" boolean NOT NULL DEFAULT false,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_notification_prefs_channel_check" CHECK ((channel = ANY (ARRAY['in_app'::text, 'email'::text, 'push'::text]))),
  CONSTRAINT "support_notification_prefs_pkey" PRIMARY KEY (id),
  CONSTRAINT "support_notification_prefs_tenant_id_staff_id_event_kind_ch_key" UNIQUE (tenant_id, staff_id, event_kind, channel)
);
CREATE TABLE IF NOT EXISTS public."support_notifications" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "recipient_staff_id" uuid,
  "kind" text NOT NULL,
  "channel" text NOT NULL DEFAULT 'in_app'::text,
  "ticket_id" uuid,
  "ref" text,
  "read_at" timestamp with time zone,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_notifications_channel_check" CHECK ((channel = ANY (ARRAY['in_app'::text, 'email'::text, 'push'::text]))),
  CONSTRAINT "support_notifications_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_organizations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "org_type" text NOT NULL,
  "name" text NOT NULL,
  "email" text,
  "phone" text,
  "metadata" jsonb NOT NULL,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_organizations_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_permissions" (
  "code" text NOT NULL,
  "description" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_permissions_pkey" PRIMARY KEY (code)
);
CREATE TABLE IF NOT EXISTS public."support_queues" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "scope" text NOT NULL,
  "tenant_id" uuid,
  "inherits_from_id" uuid,
  "locked_by_master" boolean NOT NULL DEFAULT false,
  "name" text NOT NULL,
  "owner_type" text NOT NULL,
  "owner_staff_id" uuid,
  "owner_team_id" uuid,
  "filter" jsonb NOT NULL,
  "is_shared" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_queues_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_report_daily" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "rollup_date" date NOT NULL,
  "grain" text NOT NULL DEFAULT 'total'::text,
  "team_id" uuid,
  "category" text,
  "tickets_created" integer NOT NULL DEFAULT 0,
  "tickets_resolved" integer NOT NULL DEFAULT 0,
  "tickets_closed" integer NOT NULL DEFAULT 0,
  "tickets_reopened" integer NOT NULL DEFAULT 0,
  "first_response_count" integer NOT NULL DEFAULT 0,
  "first_response_minutes_sum" numeric NOT NULL DEFAULT 0,
  "resolution_count" integer NOT NULL DEFAULT 0,
  "resolution_minutes_sum" numeric NOT NULL DEFAULT 0,
  "sla_due_count" integer NOT NULL DEFAULT 0,
  "sla_met_count" integer NOT NULL DEFAULT 0,
  "sla_breached_count" integer NOT NULL DEFAULT 0,
  "messages_count" integer NOT NULL DEFAULT 0,
  "public_reply_count" integer NOT NULL DEFAULT 0,
  "csat_count" integer NOT NULL DEFAULT 0,
  "csat_score_sum" integer NOT NULL DEFAULT 0,
  "time_spent_seconds" bigint NOT NULL DEFAULT 0,
  "backlog_open_end" integer NOT NULL DEFAULT 0,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "channel" text,
  CONSTRAINT "support_report_daily_check" CHECK ((((grain = 'total'::text) AND (team_id IS NULL) AND (category IS NULL)) OR ((grain = 'team'::text) AND (team_id IS NOT NULL) AND (category IS NULL)) OR ((grain = 'category'::text) AND (team_id IS NULL) AND (category IS NOT NULL)) OR ((grain = 'team_category'::text) AND (team_id IS NOT NULL) AND (category IS NOT NULL)))),
  CONSTRAINT "support_report_daily_grain_check" CHECK ((grain = ANY (ARRAY['total'::text, 'team'::text, 'category'::text, 'team_category'::text]))),
  CONSTRAINT "support_report_daily_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_routing_rules" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "scope" text NOT NULL DEFAULT 'tenant'::text,
  "tenant_id" uuid,
  "inherits_from_id" uuid,
  "locked_by_master" boolean NOT NULL DEFAULT false,
  "name" text NOT NULL,
  "rule_order" integer NOT NULL DEFAULT 0,
  "conditions" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "strategy" text NOT NULL DEFAULT 'manual'::text,
  "target_team_id" uuid,
  "target_staff_id" uuid,
  "set_priority" text,
  "set_tags" text[] NOT NULL DEFAULT '{}'::text[],
  "sla_policy_id" uuid,
  "is_active" boolean NOT NULL DEFAULT true,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_routing_rules_check" CHECK ((((scope = 'master'::text) AND (tenant_id IS NULL)) OR ((scope = 'tenant'::text) AND (tenant_id IS NOT NULL)))),
  CONSTRAINT "support_routing_rules_scope_check" CHECK ((scope = ANY (ARRAY['master'::text, 'tenant'::text]))),
  CONSTRAINT "support_routing_rules_set_priority_check" CHECK (((set_priority IS NULL) OR (set_priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text])))),
  CONSTRAINT "support_routing_rules_strategy_check" CHECK ((strategy = ANY (ARRAY['round_robin'::text, 'least_loaded'::text, 'skills_based'::text, 'manual'::text]))),
  CONSTRAINT "support_routing_rules_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_side_conversation_messages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "side_conversation_id" uuid NOT NULL,
  "author_staff_id" uuid,
  "author_label" text,
  "body" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_side_conversation_messages_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_side_conversation_participants" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "side_conversation_id" uuid NOT NULL,
  "staff_id" uuid,
  "email" text,
  "added_by_staff_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "side_participants_identity_ck" CHECK (((staff_id IS NOT NULL) OR (email IS NOT NULL))),
  CONSTRAINT "support_side_conversation_participants_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_side_conversations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "ticket_id" uuid NOT NULL,
  "subject" text NOT NULL,
  "status" text NOT NULL,
  "created_by_staff_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "closed_at" timestamp with time zone,
  "row_version" integer NOT NULL DEFAULT 1,
  CONSTRAINT "support_side_conversations_pkey" PRIMARY KEY (id),
  CONSTRAINT "support_side_conversations_tenant_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."support_signatures" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "staff_id" uuid NOT NULL,
  "team_id" uuid,
  "body" text NOT NULL,
  "is_default" boolean NOT NULL DEFAULT false,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_signatures_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_sla_policies" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "scope" text NOT NULL,
  "tenant_id" uuid,
  "inherits_from_id" uuid,
  "locked_by_master" boolean NOT NULL DEFAULT false,
  "name" text NOT NULL,
  "first_response_minutes" integer,
  "next_reply_minutes" integer,
  "resolution_minutes" integer,
  "uses_business_hours" boolean NOT NULL DEFAULT true,
  "business_hours_id" uuid,
  "is_default" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_sla_policies_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_staff_skills" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "staff_id" uuid NOT NULL,
  "skill_code" text NOT NULL,
  "level" integer NOT NULL DEFAULT 1,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_staff_skills_level_check" CHECK (((level >= 1) AND (level <= 5))),
  CONSTRAINT "support_staff_skills_pkey" PRIMARY KEY (id),
  CONSTRAINT "support_staff_skills_staff_id_skill_code_key" UNIQUE (staff_id, skill_code)
);
CREATE TABLE IF NOT EXISTS public."support_team_members" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "team_id" uuid NOT NULL,
  "staff_id" uuid NOT NULL,
  "role" text,
  "max_concurrent" integer,
  "is_available" boolean NOT NULL DEFAULT true,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_team_members_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_teams" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "scope" text NOT NULL,
  "tenant_id" uuid,
  "inherits_from_id" uuid,
  "locked_by_master" boolean NOT NULL DEFAULT false,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_teams_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_templates" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "scope" text NOT NULL DEFAULT 'tenant'::text,
  "tenant_id" uuid,
  "inherits_from_id" uuid,
  "locked_by_master" boolean NOT NULL DEFAULT false,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "channel" text NOT NULL DEFAULT 'email'::text,
  "subject" text,
  "body" text NOT NULL,
  "locale" text NOT NULL DEFAULT 'en-US'::text,
  "locked" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_templates_scope_check" CHECK ((scope = ANY (ARRAY['master'::text, 'tenant'::text]))),
  CONSTRAINT "support_templates_check" CHECK ((((scope = 'master'::text) AND (tenant_id IS NULL)) OR ((scope = 'tenant'::text) AND (tenant_id IS NOT NULL)))),
  CONSTRAINT "support_templates_channel_check" CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text, 'in_app'::text]))),
  CONSTRAINT "support_templates_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_ticket_access_grants" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "ticket_id" uuid NOT NULL,
  "grantee_tenant_id" uuid NOT NULL,
  "level" text NOT NULL,
  "granted_by_staff_id" uuid,
  "granted_at" timestamp with time zone NOT NULL DEFAULT now(),
  "revoked_at" timestamp with time zone,
  "revoked_by_staff_id" uuid,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_ticket_access_grants_level_check" CHECK ((level = ANY (ARRAY['view'::text, 'collaborate'::text]))),
  CONSTRAINT "support_ticket_access_grants_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_ticket_counters" (
  "tenant_id" uuid NOT NULL,
  "last_ref" bigint NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_ticket_counters_last_ref_check" CHECK ((last_ref >= 0)),
  CONSTRAINT "support_ticket_counters_pkey" PRIMARY KEY (tenant_id)
);
CREATE TABLE IF NOT EXISTS public."support_ticket_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "ticket_id" uuid NOT NULL,
  "actor_staff_id" uuid,
  "actor_label" text,
  "event_type" text NOT NULL,
  "detail" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "actor_type" text,
  "actor_id" uuid,
  "visibility" text NOT NULL,
  "payload" jsonb,
  "idempotency_key" text,
  "request_id" text,
  "ip" text,
  "user_agent" text,
  CONSTRAINT "support_ticket_events_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_ticket_participants" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "ticket_id" uuid NOT NULL,
  "participant_kind" text NOT NULL,
  "contact_id" uuid,
  "staff_id" uuid,
  "email" text,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_ticket_participants_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_ticket_relations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "ticket_id" uuid NOT NULL,
  "related_ticket_id" uuid NOT NULL,
  "relation_type" text NOT NULL,
  "row_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "support_ticket_relations_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_tickets" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "ticket_ref" text NOT NULL,
  "requester_type" text NOT NULL,
  "requester_customer_id" uuid,
  "requester_staff_id" uuid,
  "requester_seller_id" uuid,
  "requester_user_id" uuid,
  "requester_name" text,
  "requester_email" text,
  "subject" text NOT NULL,
  "status" text NOT NULL,
  "priority" text NOT NULL,
  "assigned_staff_id" uuid,
  "conversation_id" uuid NOT NULL,
  "last_message_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "metadata" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "category" text NOT NULL,
  "first_public_reply_at" timestamp with time zone,
  "last_requester_reply_at" timestamp with time zone,
  "merged_into_id" uuid,
  "contact_id" uuid,
  "organization_id" uuid,
  "requester_phone" text,
  "requester_locale" text,
  "requester_timezone" text,
  "subcategory_id" uuid,
  "ticket_type" text,
  "severity_impact" text,
  "source_channel" text,
  "tags" text[] NOT NULL,
  "visibility_level" text NOT NULL,
  "restricted_team_id" uuid,
  "assigned_team_id" uuid,
  "pending_reason" text,
  "on_hold" boolean NOT NULL DEFAULT false,
  "follow_up_of_id" uuid,
  "parent_ticket_id" uuid,
  "problem_ticket_id" uuid,
  "incident_id" uuid,
  "spam_flag" boolean NOT NULL DEFAULT false,
  "locked_by_staff_id" uuid,
  "locked_until" timestamp with time zone,
  "first_response_due_at" timestamp with time zone,
  "next_reply_due_at" timestamp with time zone,
  "resolution_due_at" timestamp with time zone,
  "first_response_breached_at" timestamp with time zone,
  "resolution_breached_at" timestamp with time zone,
  "reopened_count" integer NOT NULL DEFAULT 0,
  "reopened_at" timestamp with time zone,
  "auto_close_at" timestamp with time zone,
  "sla_policy_id" uuid,
  "business_hours_id" uuid,
  "csat_score" integer,
  "csat_comment" text,
  "csat_requested_at" timestamp with time zone,
  "csat_answered_at" timestamp with time zone,
  "time_spent_seconds" bigint NOT NULL DEFAULT 0,
  "message_count" integer NOT NULL DEFAULT 0,
  "public_reply_count" integer NOT NULL DEFAULT 0,
  "search_vector" tsvector,
  "row_version" integer NOT NULL DEFAULT 1,
  "deleted_at" timestamp with time zone,
  "order_id" uuid,
  "product_id" uuid,
  CONSTRAINT "support_tickets_pkey" PRIMARY KEY (id),
  CONSTRAINT "support_tickets_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."support_time_entries" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "ticket_id" uuid NOT NULL,
  "staff_id" uuid NOT NULL,
  "seconds" integer NOT NULL,
  "billable" boolean NOT NULL DEFAULT false,
  "note" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "row_version" integer NOT NULL DEFAULT 1,
  CONSTRAINT "support_time_entries_seconds_check" CHECK ((seconds > 0)),
  CONSTRAINT "support_time_entries_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_webhook_deliveries" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "webhook_id" uuid NOT NULL,
  "ticket_id" uuid,
  "event_type" text NOT NULL,
  "event_id" uuid,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'queued'::text,
  "attempts" integer NOT NULL DEFAULT 0,
  "signature" text,
  "response_status" integer,
  "last_error" text,
  "job_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "delivered_at" timestamp with time zone,
  CONSTRAINT "support_webhook_deliveries_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'recorded'::text, 'delivered'::text, 'failed'::text]))),
  CONSTRAINT "support_webhook_deliveries_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."support_webhooks_outbound" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "url" text NOT NULL,
  "event_types" text[] NOT NULL DEFAULT '{}'::text[],
  "secret" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by_staff_id" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "row_version" integer NOT NULL DEFAULT 1,
  CONSTRAINT "support_webhooks_outbound_pkey" PRIMARY KEY (id),
  CONSTRAINT "support_webhooks_outbound_tenant_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."sync_jobs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "job_type" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "result" jsonb,
  "status" text NOT NULL DEFAULT 'queued'::text,
  "attempts" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "idempotency_key" text NOT NULL,
  "scheduled_for" timestamp with time zone NOT NULL DEFAULT now(),
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "sync_jobs_job_type_check" CHECK ((job_type = ANY (ARRAY['stripe_product_sync'::text, 'algolia_reindex'::text, 'feed_followthrough'::text]))),
  CONSTRAINT "sync_jobs_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'dead'::text]))),
  CONSTRAINT "sync_jobs_pkey" PRIMARY KEY (id),
  CONSTRAINT "sync_jobs_idempotency_key_key" UNIQUE (idempotency_key)
);
CREATE TABLE IF NOT EXISTS public."tags" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "color" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tags_pkey" PRIMARY KEY (id),
  CONSTRAINT "tags_tenant_id_name_key" UNIQUE (tenant_id, name)
);
CREATE TABLE IF NOT EXISTS public."taxes" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "rate" numeric(6,4) NOT NULL,
  "type" text NOT NULL DEFAULT 'sales'::text,
  "is_compound" boolean NOT NULL DEFAULT false,
  "is_enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "taxes_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."taxonomy_category_bridge" (
  "old_category_id" bigint NOT NULL,
  "taxonomy_node_id" uuid NOT NULL,
  "method" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "taxonomy_category_bridge_pkey" PRIMARY KEY (old_category_id)
);
CREATE TABLE IF NOT EXISTS public."taxonomy_nodes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "parent_id" uuid,
  "subject_id" uuid,
  "node_type" text NOT NULL,
  "name" text NOT NULL,
  "display_name" text,
  "slug" text NOT NULL,
  "path" text NOT NULL,
  "depth" smallint NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_associated" boolean NOT NULL DEFAULT false,
  "is_featured" boolean NOT NULL DEFAULT false,
  "is_gated" boolean NOT NULL DEFAULT false,
  "source_text" text,
  "status" text NOT NULL DEFAULT 'published'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "dependent_types" text[],
  "product_count" integer DEFAULT 0,
  CONSTRAINT "taxonomy_nodes_node_type_check" CHECK ((node_type = ANY (ARRAY['animal'::text, 'department'::text, 'subcategory'::text, 'category'::text]))),
  CONSTRAINT "taxonomy_nodes_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))),
  CONSTRAINT "taxonomy_nodes_pkey" PRIMARY KEY (id),
  CONSTRAINT "taxonomy_nodes_tenant_id_path_key" UNIQUE (tenant_id, path)
);
CREATE TABLE IF NOT EXISTS public."tenant_locations" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "address" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "timezone" text NOT NULL DEFAULT 'America/Chicago'::text,
  "is_primary" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tenant_locations_pkey" PRIMARY KEY (id),
  CONSTRAINT "tenant_locations_tenant_id_id_key" UNIQUE (tenant_id, id)
);
CREATE TABLE IF NOT EXISTS public."tenant_memberships" (
  "tenant_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "role" text NOT NULL DEFAULT 'staff'::text,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "id" uuid DEFAULT gen_random_uuid(),
  "status" text NOT NULL DEFAULT 'active'::text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_active_at" timestamp with time zone,
  "mfa_enabled" boolean NOT NULL DEFAULT false,
  "mfa_method" text,
  "mfa_enrolled_at" timestamp with time zone,
  "mfa_reset_requested_at" timestamp with time zone,
  "mfa_reset_by" uuid,
  "invited_by" uuid,
  "invited_email" text,
  "invite_token_hash" text,
  "invite_sent_at" timestamp with time zone,
  "invite_expires_at" timestamp with time zone,
  "invite_accepted_at" timestamp with time zone,
  CONSTRAINT "tenant_memberships_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'staff'::text, 'viewer'::text, 'groomer'::text, 'front_desk'::text]))),
  CONSTRAINT "tenant_memberships_mfa_method_check" CHECK (((mfa_method IS NULL) OR (mfa_method = ANY (ARRAY['totp'::text, 'sms'::text, 'email'::text, 'webauthn'::text])))),
  CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY (tenant_id, user_id)
);
CREATE TABLE IF NOT EXISTS public."tenant_printer_settings" (
  "tenant_id" uuid NOT NULL,
  "receipt_paper" text NOT NULL DEFAULT '80mm'::text,
  "receipt_auto_print" boolean NOT NULL DEFAULT true,
  "label_paper" text NOT NULL DEFAULT '4x6'::text,
  "label_auto_print" boolean NOT NULL DEFAULT true,
  "document_paper" text NOT NULL DEFAULT 'letter'::text,
  "document_auto_print" boolean NOT NULL DEFAULT true,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tenant_printer_settings_pkey" PRIMARY KEY (tenant_id)
);
CREATE TABLE IF NOT EXISTS public."tenant_settings" (
  "tenant_id" uuid NOT NULL,
  "section" text NOT NULL,
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" text,
  CONSTRAINT "tenant_settings_pkey" PRIMARY KEY (tenant_id, section)
);
CREATE TABLE IF NOT EXISTS public."tenant_stripe_accounts" (
  "tenant_id" uuid NOT NULL,
  "stripe_account_id" text NOT NULL,
  "charges_enabled" boolean NOT NULL DEFAULT false,
  "payouts_enabled" boolean NOT NULL DEFAULT false,
  "onboarding_complete" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tenant_stripe_accounts_pkey" PRIMARY KEY (tenant_id)
);
CREATE TABLE IF NOT EXISTS public."tenant_wordpress_connections" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "site_url" text NOT NULL,
  "username" text NOT NULL,
  "password_ciphertext" text NOT NULL,
  "status" text NOT NULL DEFAULT 'connected'::text,
  "site_name" text,
  "wp_user_name" text,
  "wp_user_slug" text,
  "wp_roles" jsonb,
  "last_verified_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tenant_wordpress_connections_status_check" CHECK ((status = ANY (ARRAY['connected'::text, 'error'::text, 'disconnected'::text]))),
  CONSTRAINT "tenant_wordpress_connections_pkey" PRIMARY KEY (id),
  CONSTRAINT "tenant_wordpress_connections_tenant_id_key" UNIQUE (tenant_id)
);
CREATE TABLE IF NOT EXISTS public."tenants" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "type" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "active" boolean NOT NULL DEFAULT true,
  "stripe_connect_account_id" text,
  "stripe_connect_status" text NOT NULL DEFAULT 'not_started'::text,
  "stripe_customer_id" text,
  "stripe_subscription_id" text,
  "subscription_status" text NOT NULL DEFAULT 'trialing'::text,
  "plan_tier" text NOT NULL DEFAULT 'starter'::text,
  "tenant_kind" text NOT NULL DEFAULT 'organization'::text,
  "status" text NOT NULL DEFAULT 'active'::text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "legal_name" text,
  "dba_name" text,
  "tax_id" text,
  "logo_url" text,
  "logo_dark_url" text,
  "favicon_url" text,
  "primary_color" text,
  "secondary_color" text,
  "accent_color" text,
  "brand_font" text,
  "support_email" text,
  "support_phone" text,
  "website_url" text,
  "custom_domain" text,
  "social_links" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "primary_domain" text,
  "seo_identity" text,
  "default_currency" character(3) DEFAULT 'USD'::bpchar,
  "settings" jsonb DEFAULT '{}'::jsonb,
  "backup_addon_enabled" boolean NOT NULL DEFAULT false,
  "template_key" text,
  "website_mode" text NOT NULL DEFAULT 'template'::text,
  CONSTRAINT "tenants_type_check" CHECK ((type = ANY (ARRAY['platform'::text, 'seller'::text, 'partner'::text]))),
  CONSTRAINT "tenants_pkey" PRIMARY KEY (id),
  CONSTRAINT "tenants_slug_key" UNIQUE (slug)
);
CREATE TABLE IF NOT EXISTS public."testimonials" (
  "id" text NOT NULL DEFAULT (gen_random_uuid())::text,
  "quote" text NOT NULL,
  "author" text,
  "rating" integer DEFAULT 5,
  "visible" boolean DEFAULT true,
  "order" integer DEFAULT 0,
  "createdAt" timestamp with time zone DEFAULT now(),
  "updatedAt" timestamp with time zone DEFAULT now(),
  "tenant_id" uuid NOT NULL,
  CONSTRAINT "testimonials_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."theme_prompts" (
  "tenant_id" uuid NOT NULL,
  "theme_name" text NOT NULL,
  "prompt" text NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_by" uuid,
  CONSTRAINT "theme_prompts_pkey" PRIMARY KEY (tenant_id, theme_name)
);
CREATE TABLE IF NOT EXISTS public."transaction_tags" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "tenant_id" uuid NOT NULL,
  "tag_id" uuid NOT NULL,
  "source" text NOT NULL,
  "source_id" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "transaction_tags_pkey" PRIMARY KEY (id),
  CONSTRAINT "transaction_tags_tag_id_source_source_id_key" UNIQUE (tag_id, source, source_id)
);
CREATE TABLE IF NOT EXISTS public."trust_policies" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active'::text,
  "version" integer NOT NULL DEFAULT 1,
  "updated_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "trust_policies_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'draft'::text, 'archived'::text]))),
  CONSTRAINT "trust_policies_pkey" PRIMARY KEY (id),
  CONSTRAINT "trust_policies_tenant_id_code_key" UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS public."user_notifications" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "notification_type" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "priority" text NOT NULL DEFAULT 'normal'::text,
  "is_read" boolean NOT NULL DEFAULT false,
  "action_url" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_notifications_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."user_session_tabs" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "session_id" uuid,
  "tab_id" character varying(255) NOT NULL,
  "title" character varying(255) NOT NULL,
  "module_path" character varying(512) NOT NULL,
  "params" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "form_data_cache" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "scroll_position" integer NOT NULL DEFAULT 0,
  "tab_order" integer NOT NULL,
  "group_id" character varying(255),
  "group_title" character varying(255),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_session_tabs_pkey" PRIMARY KEY (id),
  CONSTRAINT "unique_tab_per_session" UNIQUE (session_id, tab_id)
);
CREATE TABLE IF NOT EXISTS public."user_tenants" (
  "user_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "role" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_tenants_role_check" CHECK ((role = ANY (ARRAY['platform_admin'::text, 'tenant_admin'::text, 'seller'::text, 'staff'::text, 'customer'::text]))),
  CONSTRAINT "user_tenants_pkey" PRIMARY KEY (user_id, tenant_id)
);
CREATE TABLE IF NOT EXISTS public."user_workspace_sessions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "active_tab_id" character varying(255),
  "max_tabs" integer NOT NULL DEFAULT 15,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_workspace_sessions_pkey" PRIMARY KEY (id),
  CONSTRAINT "unique_user_session" UNIQUE (user_id)
);
CREATE TABLE IF NOT EXISTS public."variant_axis_values" (
  "variant_id" uuid NOT NULL,
  "attribute_value_id" uuid NOT NULL,
  CONSTRAINT "variant_axis_values_pkey" PRIMARY KEY (variant_id, attribute_value_id)
);
CREATE TABLE IF NOT EXISTS public."variant_fulfillment_routes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "product_variant_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL,
  "supplier_catalog_variant_id" uuid NOT NULL,
  "priority" smallint NOT NULL DEFAULT 1,
  "region" text NOT NULL DEFAULT 'US'::text,
  "technique" text,
  "cost_snapshot" numeric(10,2),
  "lead_time_days" integer,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "variant_fulfillment_routes_pkey" PRIMARY KEY (id),
  CONSTRAINT "variant_fulfillment_routes_tenant_id_product_variant_id_sup_key" UNIQUE (tenant_id, product_variant_id, supplier_id, region)
);
CREATE TABLE IF NOT EXISTS public."vendor_invoice_lines" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "vendor_invoice_id" uuid NOT NULL,
  "po_line_id" uuid NOT NULL,
  "qty_invoiced" integer NOT NULL,
  "unit_cost" numeric(12,4) NOT NULL,
  CONSTRAINT "vendor_invoice_lines_qty_invoiced_check" CHECK ((qty_invoiced > 0)),
  CONSTRAINT "vendor_invoice_lines_pkey" PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public."vendor_invoices" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "vendor_id" uuid NOT NULL,
  "purchase_order_id" uuid,
  "invoice_number" text NOT NULL,
  "invoice_date" date NOT NULL,
  "due_date" date,
  "subtotal" numeric(12,2),
  "tax" numeric(12,2),
  "total" numeric(12,2),
  "status" text NOT NULL DEFAULT 'received'::text,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "vendor_invoices_status_check" CHECK ((status = ANY (ARRAY['received'::text, 'matched'::text, 'approved'::text, 'paid'::text, 'disputed'::text, 'void'::text]))),
  CONSTRAINT "vendor_invoices_pkey" PRIMARY KEY (id),
  CONSTRAINT "vendor_invoices_vendor_id_invoice_number_key" UNIQUE (vendor_id, invoice_number)
);
CREATE TABLE IF NOT EXISTS public."vendors" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "code" text NOT NULL,
  "contact_name" text,
  "email" text,
  "phone" text,
  "payment_terms" text NOT NULL DEFAULT 'NET30'::text,
  "status" text NOT NULL DEFAULT 'active'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "vendors_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text]))),
  CONSTRAINT "vendors_pkey" PRIMARY KEY (id),
  CONSTRAINT "vendors_tenant_id_code_key" UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS public."verification_tasks" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL,
  "seller_id" uuid NOT NULL,
  "task_type" text NOT NULL,
  "status" text,
  "evidence_url" text,
  "notes" text,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public."ad_events" ATTACH PARTITION public."ad_events_2026_10" FOR VALUES FROM ('2026-10-01 00:00:00+00'::timestamp with time zone) TO ('2026-11-01 00:00:00+00'::timestamp with time zone);
ALTER TABLE public."ad_events" ATTACH PARTITION public."ad_events_2026_11" FOR VALUES FROM ('2026-11-01 00:00:00+00'::timestamp with time zone) TO ('2026-12-01 00:00:00+00'::timestamp with time zone);
ALTER TABLE public."ad_events" ATTACH PARTITION public."ad_events_2026_12" FOR VALUES FROM ('2026-12-01 00:00:00+00'::timestamp with time zone) TO ('2027-01-01 00:00:00+00'::timestamp with time zone);
ALTER TABLE public."ad_events" ATTACH PARTITION public."ad_events_2027_01" FOR VALUES FROM ('2027-01-01 00:00:00+00'::timestamp with time zone) TO ('2027-02-01 00:00:00+00'::timestamp with time zone);

-- Foreign keys
ALTER TABLE public."acct_account_dimension_rules" ADD CONSTRAINT "acct_account_dimension_rules_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_account_dimension_rules" ADD CONSTRAINT "acct_account_dimension_rules_tenant_id_dimension_id_fkey" FOREIGN KEY (tenant_id, dimension_id) REFERENCES acct_dimensions(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."acct_allocation_rules" ADD CONSTRAINT "acct_allocation_rules_destination_account_id_fkey" FOREIGN KEY (destination_account_id) REFERENCES acct_chart_of_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public."acct_allocation_rules" ADD CONSTRAINT "acct_allocation_rules_allocation_id_fkey" FOREIGN KEY (allocation_id) REFERENCES acct_allocations(id) ON DELETE CASCADE;
ALTER TABLE public."acct_allocations" ADD CONSTRAINT "acct_allocations_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_allocations" ADD CONSTRAINT "acct_allocations_tenant_id_driver_dimension_id_fkey" FOREIGN KEY (tenant_id, driver_dimension_id) REFERENCES acct_dimensions(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."acct_ap_approvals" ADD CONSTRAINT "acct_ap_approvals_tenant_id_purchase_order_id_fkey" FOREIGN KEY (tenant_id, purchase_order_id) REFERENCES acct_ap_purchase_orders(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."acct_ap_approvals" ADD CONSTRAINT "acct_ap_approvals_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_ap_bill_lines" ADD CONSTRAINT "fk_acct_ap_bill_lines_bill_id" FOREIGN KEY (bill_id) REFERENCES acct_ap_bills(id) ON DELETE SET NULL;
ALTER TABLE public."acct_ap_bill_lines" ADD CONSTRAINT "fk_acct_ap_bill_lines_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_ap_bill_lines" ADD CONSTRAINT "fk_acct_ap_bill_lines_expense_account_id" FOREIGN KEY (expense_account_id) REFERENCES acct_chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE public."acct_ap_bills" ADD CONSTRAINT "fk_acct_ap_bills_posted_journal_id" FOREIGN KEY (posted_journal_id) REFERENCES acct_journal_entries(id) ON DELETE SET NULL;
ALTER TABLE public."acct_ap_bills" ADD CONSTRAINT "fk_acct_ap_bills_vendor_id" FOREIGN KEY (vendor_id) REFERENCES acct_vendors(id) ON DELETE SET NULL;
ALTER TABLE public."acct_ap_bills" ADD CONSTRAINT "fk_acct_ap_bills_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_ap_payment_applications" ADD CONSTRAINT "acct_ap_payment_applications_bill_id_fkey" FOREIGN KEY (bill_id) REFERENCES acct_ap_bills(id) ON DELETE RESTRICT;
ALTER TABLE public."acct_ap_payment_applications" ADD CONSTRAINT "acct_ap_payment_applications_payment_id_fkey" FOREIGN KEY (payment_id) REFERENCES acct_ap_payments(id) ON DELETE CASCADE;
ALTER TABLE public."acct_ap_payments" ADD CONSTRAINT "fk_acct_ap_payments_vendor_id" FOREIGN KEY (vendor_id) REFERENCES acct_vendors(id) ON DELETE SET NULL;
ALTER TABLE public."acct_ap_payments" ADD CONSTRAINT "fk_acct_ap_payments_posted_journal_id" FOREIGN KEY (posted_journal_id) REFERENCES acct_journal_entries(id) ON DELETE SET NULL;
ALTER TABLE public."acct_ap_payments" ADD CONSTRAINT "fk_acct_ap_payments_cash_account_id" FOREIGN KEY (cash_account_id) REFERENCES acct_bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE public."acct_ap_payments" ADD CONSTRAINT "fk_acct_ap_payments_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_ap_purchase_order_lines" ADD CONSTRAINT "acct_ap_purchase_order_lines_expense_account_id_fkey" FOREIGN KEY (expense_account_id) REFERENCES acct_chart_of_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public."acct_ap_purchase_order_lines" ADD CONSTRAINT "acct_ap_purchase_order_lines_purchase_order_id_fkey" FOREIGN KEY (purchase_order_id) REFERENCES acct_ap_purchase_orders(id) ON DELETE CASCADE;
ALTER TABLE public."acct_ap_purchase_orders" ADD CONSTRAINT "acct_ap_purchase_orders_currency_fkey" FOREIGN KEY (currency) REFERENCES acct_currencies(code);
ALTER TABLE public."acct_ap_purchase_orders" ADD CONSTRAINT "acct_ap_purchase_orders_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_ap_purchase_orders" ADD CONSTRAINT "acct_ap_purchase_orders_tenant_id_entity_id_fkey" FOREIGN KEY (tenant_id, entity_id) REFERENCES acct_entities(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."acct_ar_collections_cases" ADD CONSTRAINT "acct_ar_collections_cases_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_ar_credit_memos" ADD CONSTRAINT "acct_ar_credit_memos_currency_fkey" FOREIGN KEY (currency) REFERENCES acct_currencies(code);
ALTER TABLE public."acct_ar_credit_memos" ADD CONSTRAINT "acct_ar_credit_memos_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_ar_invoice_lines" ADD CONSTRAINT "fk_acct_ar_invoice_lines_revenue_account_id" FOREIGN KEY (revenue_account_id) REFERENCES acct_chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE public."acct_ar_invoice_lines" ADD CONSTRAINT "fk_acct_ar_invoice_lines_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_ar_invoice_lines" ADD CONSTRAINT "fk_acct_ar_invoice_lines_invoice_id" FOREIGN KEY (invoice_id) REFERENCES acct_ar_invoices(id) ON DELETE SET NULL;
ALTER TABLE public."acct_ar_invoices" ADD CONSTRAINT "fk_acct_ar_invoices_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_ar_invoices" ADD CONSTRAINT "fk_acct_ar_invoices_posted_journal_id" FOREIGN KEY (posted_journal_id) REFERENCES acct_journal_entries(id) ON DELETE SET NULL;
ALTER TABLE public."acct_ar_invoices" ADD CONSTRAINT "fk_acct_ar_invoices_customer_id" FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL;
ALTER TABLE public."acct_ar_receipt_applications" ADD CONSTRAINT "acct_ar_receipt_applications_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES acct_ar_invoices(id) ON DELETE RESTRICT;
ALTER TABLE public."acct_ar_receipt_applications" ADD CONSTRAINT "acct_ar_receipt_applications_receipt_id_fkey" FOREIGN KEY (receipt_id) REFERENCES acct_ar_receipts(id) ON DELETE CASCADE;
ALTER TABLE public."acct_ar_receipts" ADD CONSTRAINT "fk_acct_ar_receipts_posted_journal_id" FOREIGN KEY (posted_journal_id) REFERENCES acct_journal_entries(id) ON DELETE SET NULL;
ALTER TABLE public."acct_ar_receipts" ADD CONSTRAINT "fk_acct_ar_receipts_customer_id" FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL;
ALTER TABLE public."acct_ar_receipts" ADD CONSTRAINT "fk_acct_ar_receipts_deposit_account_id" FOREIGN KEY (deposit_account_id) REFERENCES acct_bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE public."acct_ar_receipts" ADD CONSTRAINT "fk_acct_ar_receipts_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_asset_books" ADD CONSTRAINT "acct_asset_books_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES acct_fixed_assets(id) ON DELETE CASCADE;
ALTER TABLE public."acct_asset_books" ADD CONSTRAINT "acct_asset_books_book_id_fkey" FOREIGN KEY (book_id) REFERENCES acct_books(id) ON DELETE CASCADE;
ALTER TABLE public."acct_asset_classes" ADD CONSTRAINT "acct_asset_classes_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_asset_depreciation_lines" ADD CONSTRAINT "acct_asset_depreciation_lines_run_id_fkey" FOREIGN KEY (run_id) REFERENCES acct_asset_depreciation_runs(id) ON DELETE CASCADE;
ALTER TABLE public."acct_asset_depreciation_lines" ADD CONSTRAINT "acct_asset_depreciation_lines_asset_book_id_fkey" FOREIGN KEY (asset_book_id) REFERENCES acct_asset_books(id) ON DELETE RESTRICT;
ALTER TABLE public."acct_asset_depreciation_runs" ADD CONSTRAINT "acct_asset_depreciation_runs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_asset_depreciation_runs" ADD CONSTRAINT "acct_asset_depreciation_runs_tenant_id_book_id_fkey" FOREIGN KEY (tenant_id, book_id) REFERENCES acct_books(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."acct_attachments" ADD CONSTRAINT "acct_attachments_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_audit_log" ADD CONSTRAINT "acct_audit_log_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_audit_log" ADD CONSTRAINT "acct_audit_log_actor_user_id_fk" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);
ALTER TABLE public."acct_bank_accounts" ADD CONSTRAINT "fk_acct_bank_accounts_gl_account_id" FOREIGN KEY (gl_account_id) REFERENCES acct_chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE public."acct_bank_accounts" ADD CONSTRAINT "fk_acct_bank_accounts_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_bank_statements" ADD CONSTRAINT "acct_bank_statements_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_bank_transactions" ADD CONSTRAINT "fk_acct_bank_transactions_bank_account_id" FOREIGN KEY (bank_account_id) REFERENCES acct_bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE public."acct_bank_transactions" ADD CONSTRAINT "fk_acct_bank_transactions_matched_journal_line_id" FOREIGN KEY (matched_journal_line_id) REFERENCES acct_journal_lines(id) ON DELETE SET NULL;
ALTER TABLE public."acct_bank_transactions" ADD CONSTRAINT "fk_acct_bank_transactions_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_book_account_mappings" ADD CONSTRAINT "acct_book_account_mappings_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_book_account_mappings" ADD CONSTRAINT "acct_book_account_mappings_tenant_id_target_book_id_fkey" FOREIGN KEY (tenant_id, target_book_id) REFERENCES acct_books(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."acct_books" ADD CONSTRAINT "acct_books_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_books" ADD CONSTRAINT "acct_books_currency_fkey" FOREIGN KEY (currency) REFERENCES acct_currencies(code);
ALTER TABLE public."acct_books" ADD CONSTRAINT "acct_books_tenant_id_entity_id_fkey" FOREIGN KEY (tenant_id, entity_id) REFERENCES acct_entities(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."acct_budget_lines" ADD CONSTRAINT "acct_budget_lines_period_id_fkey" FOREIGN KEY (period_id) REFERENCES acct_periods(id) ON DELETE RESTRICT;
ALTER TABLE public."acct_budget_lines" ADD CONSTRAINT "acct_budget_lines_budget_id_fkey" FOREIGN KEY (budget_id) REFERENCES acct_budget_versions(id) ON DELETE CASCADE;
ALTER TABLE public."acct_budget_lines" ADD CONSTRAINT "acct_budget_lines_account_id_fkey" FOREIGN KEY (account_id) REFERENCES acct_chart_of_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public."acct_budget_versions" ADD CONSTRAINT "acct_budget_versions_currency_fkey" FOREIGN KEY (currency) REFERENCES acct_currencies(code);
ALTER TABLE public."acct_budget_versions" ADD CONSTRAINT "acct_budget_versions_tenant_id_entity_id_fkey" FOREIGN KEY (tenant_id, entity_id) REFERENCES acct_entities(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."acct_budget_versions" ADD CONSTRAINT "acct_budget_versions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_chart_of_accounts" ADD CONSTRAINT "fk_acct_chart_of_accounts_parent_account_id" FOREIGN KEY (parent_account_id) REFERENCES acct_chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE public."acct_chart_of_accounts" ADD CONSTRAINT "fk_acct_chart_of_accounts_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_close_checklists" ADD CONSTRAINT "acct_close_checklists_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_consolidation_groups" ADD CONSTRAINT "acct_consolidation_groups_reporting_currency_fkey" FOREIGN KEY (reporting_currency) REFERENCES acct_currencies(code);
ALTER TABLE public."acct_consolidation_groups" ADD CONSTRAINT "acct_consolidation_groups_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_consolidation_members" ADD CONSTRAINT "acct_consolidation_members_consolidation_group_id_fkey" FOREIGN KEY (consolidation_group_id) REFERENCES acct_consolidation_groups(id) ON DELETE CASCADE;
ALTER TABLE public."acct_consolidation_members" ADD CONSTRAINT "acct_consolidation_members_entity_id_fkey" FOREIGN KEY (entity_id) REFERENCES acct_entities(id) ON DELETE CASCADE;
ALTER TABLE public."acct_consolidation_runs" ADD CONSTRAINT "acct_consolidation_runs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_consolidation_runs" ADD CONSTRAINT "acct_consolidation_runs_reporting_currency_fkey" FOREIGN KEY (reporting_currency) REFERENCES acct_currencies(code);
ALTER TABLE public."acct_consolidation_runs" ADD CONSTRAINT "acct_consolidation_runs_tenant_id_consolidation_group_id_fkey" FOREIGN KEY (tenant_id, consolidation_group_id) REFERENCES acct_consolidation_groups(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."acct_currencies" ADD CONSTRAINT "fk_acct_currencies_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_customer_statements" ADD CONSTRAINT "acct_customer_statements_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE CASCADE;
ALTER TABLE public."acct_customer_statements" ADD CONSTRAINT "acct_customer_statements_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_customers" ADD CONSTRAINT "fk_acct_customers_default_revenue_account_id" FOREIGN KEY (default_revenue_account_id) REFERENCES acct_chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE public."acct_customers" ADD CONSTRAINT "fk_acct_customers_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_customers" ADD CONSTRAINT "fk_acct_customers_ar_account_id" FOREIGN KEY (ar_account_id) REFERENCES acct_chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE public."acct_dimension_values" ADD CONSTRAINT "acct_dimension_values_tenant_id_dimension_id_fkey" FOREIGN KEY (tenant_id, dimension_id) REFERENCES acct_dimensions(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."acct_dimension_values" ADD CONSTRAINT "acct_dimension_values_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_dimension_values" ADD CONSTRAINT "acct_dimension_values_parent_value_id_fkey" FOREIGN KEY (parent_value_id) REFERENCES acct_dimension_values(id) ON DELETE RESTRICT;
ALTER TABLE public."acct_dimensions" ADD CONSTRAINT "acct_dimensions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_employees" ADD CONSTRAINT "acct_employees_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES crm_staff(id) ON DELETE SET NULL;
ALTER TABLE public."acct_employees" ADD CONSTRAINT "acct_employees_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_employees" ADD CONSTRAINT "acct_employees_default_location_id_fkey" FOREIGN KEY (default_location_id) REFERENCES crm_locations(id) ON DELETE SET NULL;
ALTER TABLE public."acct_employees" ADD CONSTRAINT "acct_employees_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."acct_employees" ADD CONSTRAINT "acct_employees_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."acct_entities" ADD CONSTRAINT "acct_entities_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_entities" ADD CONSTRAINT "acct_entities_parent_entity_id_fkey" FOREIGN KEY (parent_entity_id) REFERENCES acct_entities(id) ON DELETE RESTRICT;
ALTER TABLE public."acct_entities" ADD CONSTRAINT "acct_entities_functional_currency_fkey" FOREIGN KEY (functional_currency) REFERENCES acct_currencies(code);
ALTER TABLE public."acct_entities" ADD CONSTRAINT "acct_entities_reporting_currency_fkey" FOREIGN KEY (reporting_currency) REFERENCES acct_currencies(code);
ALTER TABLE public."acct_estimate_lines" ADD CONSTRAINT "acct_estimate_lines_service_id_fkey" FOREIGN KEY (service_id) REFERENCES crm_services(id) ON DELETE SET NULL;
ALTER TABLE public."acct_estimate_lines" ADD CONSTRAINT "acct_estimate_lines_estimate_id_fkey" FOREIGN KEY (estimate_id) REFERENCES acct_estimates(id) ON DELETE CASCADE;
ALTER TABLE public."acct_exchange_rates" ADD CONSTRAINT "acct_exchange_rates_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_exchange_rates" ADD CONSTRAINT "acct_exchange_rates_from_currency_fkey" FOREIGN KEY (from_currency) REFERENCES acct_currencies(code);
ALTER TABLE public."acct_exchange_rates" ADD CONSTRAINT "acct_exchange_rates_to_currency_fkey" FOREIGN KEY (to_currency) REFERENCES acct_currencies(code);
ALTER TABLE public."acct_expense_lines" ADD CONSTRAINT "acct_expense_lines_expense_account_id_fkey" FOREIGN KEY (expense_account_id) REFERENCES acct_chart_of_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public."acct_expense_lines" ADD CONSTRAINT "acct_expense_lines_expense_report_id_fkey" FOREIGN KEY (expense_report_id) REFERENCES acct_expense_reports(id) ON DELETE CASCADE;
ALTER TABLE public."acct_expense_reports" ADD CONSTRAINT "acct_expense_reports_tenant_id_entity_id_fkey" FOREIGN KEY (tenant_id, entity_id) REFERENCES acct_entities(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."acct_expense_reports" ADD CONSTRAINT "acct_expense_reports_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_expense_reports" ADD CONSTRAINT "acct_expense_reports_currency_fkey" FOREIGN KEY (currency) REFERENCES acct_currencies(code);
ALTER TABLE public."acct_fiscal_years" ADD CONSTRAINT "fk_acct_fiscal_years_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_fixed_assets" ADD CONSTRAINT "acct_fixed_assets_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_fixed_assets" ADD CONSTRAINT "acct_fixed_assets_tenant_id_entity_id_fkey" FOREIGN KEY (tenant_id, entity_id) REFERENCES acct_entities(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."acct_fixed_assets" ADD CONSTRAINT "acct_fixed_assets_tenant_id_asset_class_id_fkey" FOREIGN KEY (tenant_id, asset_class_id) REFERENCES acct_asset_classes(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."acct_fx_revaluation_runs" ADD CONSTRAINT "acct_fx_revaluation_runs_tenant_id_book_id_fkey" FOREIGN KEY (tenant_id, book_id) REFERENCES acct_books(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."acct_fx_revaluation_runs" ADD CONSTRAINT "acct_fx_revaluation_runs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_gift_card_transactions" ADD CONSTRAINT "acct_gift_card_transactions_gift_card_id_fkey" FOREIGN KEY (gift_card_id) REFERENCES acct_gift_cards(id);
ALTER TABLE public."acct_import_jobs" ADD CONSTRAINT "acct_import_jobs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_integration_idempotency" ADD CONSTRAINT "acct_integration_idempotency_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_intercompany_partners" ADD CONSTRAINT "acct_intercompany_partners_tenant_id_from_entity_id_fkey" FOREIGN KEY (tenant_id, from_entity_id) REFERENCES acct_entities(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."acct_intercompany_partners" ADD CONSTRAINT "acct_intercompany_partners_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_intercompany_partners" ADD CONSTRAINT "acct_intercompany_partners_tenant_id_to_entity_id_fkey" FOREIGN KEY (tenant_id, to_entity_id) REFERENCES acct_entities(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."acct_intercompany_transactions" ADD CONSTRAINT "acct_intercompany_transactions_tenant_id_to_entity_id_fkey" FOREIGN KEY (tenant_id, to_entity_id) REFERENCES acct_entities(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."acct_intercompany_transactions" ADD CONSTRAINT "acct_intercompany_transactions_currency_fkey" FOREIGN KEY (currency) REFERENCES acct_currencies(code);
ALTER TABLE public."acct_intercompany_transactions" ADD CONSTRAINT "acct_intercompany_transactions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_intercompany_transactions" ADD CONSTRAINT "acct_intercompany_transactions_tenant_id_from_entity_id_fkey" FOREIGN KEY (tenant_id, from_entity_id) REFERENCES acct_entities(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."acct_journal_batches" ADD CONSTRAINT "fk_acct_journal_batches_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_journal_entries" ADD CONSTRAINT "fk_acct_journal_entries_period_id" FOREIGN KEY (period_id) REFERENCES acct_periods(id) ON DELETE SET NULL;
ALTER TABLE public."acct_journal_entries" ADD CONSTRAINT "fk_acct_journal_entries_batch_id" FOREIGN KEY (batch_id) REFERENCES acct_journal_batches(id) ON DELETE SET NULL;
ALTER TABLE public."acct_journal_entries" ADD CONSTRAINT "fk_acct_journal_entries_reversal_of_id" FOREIGN KEY (reversal_of_id) REFERENCES acct_journal_entries(id) ON DELETE SET NULL;
ALTER TABLE public."acct_journal_entries" ADD CONSTRAINT "fk_acct_journal_entries_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_journal_lines" ADD CONSTRAINT "fk_acct_journal_lines_journal_entry_id" FOREIGN KEY (journal_entry_id) REFERENCES acct_journal_entries(id) ON DELETE SET NULL;
ALTER TABLE public."acct_journal_lines" ADD CONSTRAINT "fk_acct_journal_lines_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_journal_lines" ADD CONSTRAINT "fk_acct_journal_lines_account_id" FOREIGN KEY (account_id) REFERENCES acct_chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE public."acct_lease_payments" ADD CONSTRAINT "acct_lease_payments_journal_id_fkey" FOREIGN KEY (journal_id) REFERENCES acct_journal_entries(id) ON DELETE RESTRICT;
ALTER TABLE public."acct_lease_payments" ADD CONSTRAINT "acct_lease_payments_lease_id_fkey" FOREIGN KEY (lease_id) REFERENCES acct_leases(id) ON DELETE CASCADE;
ALTER TABLE public."acct_leases" ADD CONSTRAINT "acct_leases_tenant_id_entity_id_fkey" FOREIGN KEY (tenant_id, entity_id) REFERENCES acct_entities(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."acct_leases" ADD CONSTRAINT "acct_leases_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_leases" ADD CONSTRAINT "acct_leases_currency_fkey" FOREIGN KEY (currency) REFERENCES acct_currencies(code);
ALTER TABLE public."acct_pay_periods" ADD CONSTRAINT "acct_pay_periods_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_pay_periods" ADD CONSTRAINT "acct_pay_periods_locked_by_fkey" FOREIGN KEY (locked_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."acct_payment_terms" ADD CONSTRAINT "acct_payment_terms_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_payouts" ADD CONSTRAINT "acct_payouts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_payroll_deductions" ADD CONSTRAINT "acct_payroll_deductions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_payroll_deductions" ADD CONSTRAINT "acct_payroll_deductions_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES acct_employees(id) ON DELETE CASCADE;
ALTER TABLE public."acct_payroll_employees" ADD CONSTRAINT "acct_payroll_employees_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES crm_staff(id);
ALTER TABLE public."acct_payroll_employees" ADD CONSTRAINT "acct_payroll_employees_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."acct_payroll_run_items" ADD CONSTRAINT "acct_payroll_run_items_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES acct_employees(id) ON DELETE RESTRICT;
ALTER TABLE public."acct_payroll_run_items" ADD CONSTRAINT "acct_payroll_run_items_payroll_run_id_fkey" FOREIGN KEY (payroll_run_id) REFERENCES acct_payroll_runs(id) ON DELETE CASCADE;
ALTER TABLE public."acct_payroll_runs" ADD CONSTRAINT "acct_payroll_runs_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."acct_payroll_runs" ADD CONSTRAINT "acct_payroll_runs_pay_period_id_fkey" FOREIGN KEY (pay_period_id) REFERENCES acct_pay_periods(id) ON DELETE RESTRICT;
ALTER TABLE public."acct_payroll_runs" ADD CONSTRAINT "acct_payroll_runs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_payroll_runs" ADD CONSTRAINT "acct_payroll_runs_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."acct_payroll_tax_forms" ADD CONSTRAINT "acct_payroll_tax_forms_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES acct_employees(id) ON DELETE SET NULL;
ALTER TABLE public."acct_payroll_tax_forms" ADD CONSTRAINT "acct_payroll_tax_forms_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_payroll_tax_forms" ADD CONSTRAINT "acct_payroll_tax_forms_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES acct_vendors(id) ON DELETE SET NULL;
ALTER TABLE public."acct_payroll_tax_forms" ADD CONSTRAINT "acct_payroll_tax_forms_filed_by_fkey" FOREIGN KEY (filed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."acct_periods" ADD CONSTRAINT "fk_acct_periods_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_periods" ADD CONSTRAINT "fk_acct_periods_fiscal_year_id" FOREIGN KEY (fiscal_year_id) REFERENCES acct_fiscal_years(id) ON DELETE SET NULL;
ALTER TABLE public."acct_price_book_lines" ADD CONSTRAINT "acct_price_book_lines_price_book_id_fkey" FOREIGN KEY (price_book_id) REFERENCES acct_price_books(id) ON DELETE CASCADE;
ALTER TABLE public."acct_reconciliation_items" ADD CONSTRAINT "acct_reconciliation_items_tenant_id_reconciliation_id_fkey" FOREIGN KEY (tenant_id, reconciliation_id) REFERENCES acct_reconciliations(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."acct_reconciliation_items" ADD CONSTRAINT "acct_reconciliation_items_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_reconciliations" ADD CONSTRAINT "acct_reconciliations_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_recurring_invoice_lines" ADD CONSTRAINT "acct_recurring_invoice_lines_service_id_fkey" FOREIGN KEY (service_id) REFERENCES crm_services(id) ON DELETE SET NULL;
ALTER TABLE public."acct_recurring_invoice_lines" ADD CONSTRAINT "acct_recurring_invoice_lines_recurring_invoice_id_fkey" FOREIGN KEY (recurring_invoice_id) REFERENCES acct_recurring_invoices(id) ON DELETE CASCADE;
ALTER TABLE public."acct_recurring_journals" ADD CONSTRAINT "acct_recurring_journals_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_recurring_journals" ADD CONSTRAINT "acct_recurring_journals_tenant_id_book_id_fkey" FOREIGN KEY (tenant_id, book_id) REFERENCES acct_books(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."acct_revenue_contracts" ADD CONSTRAINT "acct_revenue_contracts_tenant_id_entity_id_fkey" FOREIGN KEY (tenant_id, entity_id) REFERENCES acct_entities(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."acct_revenue_contracts" ADD CONSTRAINT "acct_revenue_contracts_currency_fkey" FOREIGN KEY (currency) REFERENCES acct_currencies(code);
ALTER TABLE public."acct_revenue_contracts" ADD CONSTRAINT "acct_revenue_contracts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_revenue_performance_obligations" ADD CONSTRAINT "acct_revenue_performance_oblig_deferred_revenue_account_id_fkey" FOREIGN KEY (deferred_revenue_account_id) REFERENCES acct_chart_of_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public."acct_revenue_performance_obligations" ADD CONSTRAINT "acct_revenue_performance_obligations_revenue_account_id_fkey" FOREIGN KEY (revenue_account_id) REFERENCES acct_chart_of_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public."acct_revenue_performance_obligations" ADD CONSTRAINT "acct_revenue_performance_obligations_contract_id_fkey" FOREIGN KEY (contract_id) REFERENCES acct_revenue_contracts(id) ON DELETE CASCADE;
ALTER TABLE public."acct_revenue_recognition_schedules" ADD CONSTRAINT "acct_revenue_recognition_schedules_obligation_id_fkey" FOREIGN KEY (obligation_id) REFERENCES acct_revenue_performance_obligations(id) ON DELETE CASCADE;
ALTER TABLE public."acct_revenue_recognition_schedules" ADD CONSTRAINT "acct_revenue_recognition_schedules_journal_id_fkey" FOREIGN KEY (journal_id) REFERENCES acct_journal_entries(id) ON DELETE RESTRICT;
ALTER TABLE public."acct_revenue_recognition_schedules" ADD CONSTRAINT "acct_revenue_recognition_schedules_period_id_fkey" FOREIGN KEY (period_id) REFERENCES acct_periods(id) ON DELETE RESTRICT;
ALTER TABLE public."acct_tax_codes" ADD CONSTRAINT "acct_tax_codes_tenant_id_jurisdiction_id_fkey" FOREIGN KEY (tenant_id, jurisdiction_id) REFERENCES acct_tax_jurisdictions(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."acct_tax_codes" ADD CONSTRAINT "acct_tax_codes_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_tax_filings" ADD CONSTRAINT "acct_tax_filings_tax_rate_id_fkey" FOREIGN KEY (tax_rate_id) REFERENCES acct_tax_rates(id);
ALTER TABLE public."acct_tax_jurisdictions" ADD CONSTRAINT "acct_tax_jurisdictions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_tax_rules" ADD CONSTRAINT "acct_tax_rules_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."acct_timesheets" ADD CONSTRAINT "acct_timesheets_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_timesheets" ADD CONSTRAINT "acct_timesheets_location_id_fkey" FOREIGN KEY (location_id) REFERENCES crm_locations(id) ON DELETE SET NULL;
ALTER TABLE public."acct_timesheets" ADD CONSTRAINT "acct_timesheets_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."acct_timesheets" ADD CONSTRAINT "acct_timesheets_pay_period_id_fkey" FOREIGN KEY (pay_period_id) REFERENCES acct_pay_periods(id) ON DELETE SET NULL;
ALTER TABLE public."acct_timesheets" ADD CONSTRAINT "acct_timesheets_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES acct_employees(id) ON DELETE CASCADE;
ALTER TABLE public."acct_vendors" ADD CONSTRAINT "fk_acct_vendors_ap_account_id" FOREIGN KEY (ap_account_id) REFERENCES acct_chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE public."acct_vendors" ADD CONSTRAINT "fk_acct_vendors_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_vendors" ADD CONSTRAINT "fk_acct_vendors_default_expense_account_id" FOREIGN KEY (default_expense_account_id) REFERENCES acct_chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE public."acct_workflow_actions" ADD CONSTRAINT "acct_workflow_actions_workflow_instance_id_fkey" FOREIGN KEY (workflow_instance_id) REFERENCES acct_workflow_instances(id) ON DELETE CASCADE;
ALTER TABLE public."acct_workflow_instances" ADD CONSTRAINT "acct_workflow_instances_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."acct_workflow_instances" ADD CONSTRAINT "acct_workflow_instances_tenant_id_workflow_id_fkey" FOREIGN KEY (tenant_id, workflow_id) REFERENCES acct_workflows(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."acct_workflows" ADD CONSTRAINT "acct_workflows_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."activity_log" ADD CONSTRAINT "activity_log_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."ad_accounts" ADD CONSTRAINT "ad_accounts_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public."ad_audiences" ADD CONSTRAINT "ad_audiences_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public."ad_campaign_categories" ADD CONSTRAINT "ad_campaign_categories_category_id_fkey" FOREIGN KEY (category_id) REFERENCES taxonomy_nodes(id) ON DELETE CASCADE;
ALTER TABLE public."ad_campaign_categories" ADD CONSTRAINT "ad_campaign_categories_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE CASCADE;
ALTER TABLE public."ad_campaign_daily" ADD CONSTRAINT "ad_campaign_daily_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE CASCADE;
ALTER TABLE public."ad_campaign_groups" ADD CONSTRAINT "ad_campaign_groups_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE CASCADE;
ALTER TABLE public."ad_campaign_placements" ADD CONSTRAINT "ad_campaign_placements_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE CASCADE;
ALTER TABLE public."ad_campaign_placements" ADD CONSTRAINT "ad_campaign_placements_placement_id_fkey" FOREIGN KEY (placement_id) REFERENCES ad_placements(id);
ALTER TABLE public."ad_campaign_rates" ADD CONSTRAINT "ad_campaign_rates_rate_card_item_id_fkey" FOREIGN KEY (rate_card_item_id) REFERENCES ad_rate_card_items(id);
ALTER TABLE public."ad_campaign_rates" ADD CONSTRAINT "ad_campaign_rates_placement_id_fkey" FOREIGN KEY (placement_id) REFERENCES ad_placements(id);
ALTER TABLE public."ad_campaign_rates" ADD CONSTRAINT "ad_campaign_rates_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE CASCADE;
ALTER TABLE public."ad_campaign_targeting" ADD CONSTRAINT "ad_campaign_targeting_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE CASCADE;
ALTER TABLE public."ad_campaigns" ADD CONSTRAINT "ad_campaigns_tier_id_fkey" FOREIGN KEY (tier_id) REFERENCES ad_tiers(id);
ALTER TABLE public."ad_campaigns" ADD CONSTRAINT "ad_campaigns_budget_tier_id_fkey" FOREIGN KEY (budget_tier_id) REFERENCES ad_budget_tiers(id) ON DELETE SET NULL;
ALTER TABLE public."ad_campaigns" ADD CONSTRAINT "ad_campaigns_advertiser_id_fkey" FOREIGN KEY (advertiser_id) REFERENCES ad_advertisers(id);
ALTER TABLE public."ad_creative_assets" ADD CONSTRAINT "ad_creative_assets_creative_id_fkey" FOREIGN KEY (creative_id) REFERENCES ad_creatives(id) ON DELETE CASCADE;
ALTER TABLE public."ad_creatives" ADD CONSTRAINT "ad_creatives_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE CASCADE;
ALTER TABLE public."ad_creatives" ADD CONSTRAINT "ad_creatives_group_id_fkey" FOREIGN KEY (group_id) REFERENCES ad_campaign_groups(id) ON DELETE CASCADE;
ALTER TABLE public."ad_experiment_variants" ADD CONSTRAINT "ad_experiment_variants_creative_id_fkey" FOREIGN KEY (creative_id) REFERENCES ad_creatives(id) ON DELETE CASCADE;
ALTER TABLE public."ad_experiment_variants" ADD CONSTRAINT "ad_experiment_variants_experiment_id_fkey" FOREIGN KEY (experiment_id) REFERENCES ad_experiments(id) ON DELETE CASCADE;
ALTER TABLE public."ad_experiments" ADD CONSTRAINT "ad_experiments_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE CASCADE;
ALTER TABLE public."ad_frequency" ADD CONSTRAINT "ad_frequency_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE CASCADE;
ALTER TABLE public."ad_markers" ADD CONSTRAINT "ad_markers_creative_v2_id_fkey" FOREIGN KEY (creative_v2_id) REFERENCES ad_creatives(id) ON DELETE CASCADE;
ALTER TABLE public."ad_rate_card_items" ADD CONSTRAINT "ad_rate_card_items_tier_id_fkey" FOREIGN KEY (tier_id) REFERENCES ad_tiers(id);
ALTER TABLE public."ad_rate_card_items" ADD CONSTRAINT "ad_rate_card_items_rate_card_id_fkey" FOREIGN KEY (rate_card_id) REFERENCES ad_rate_cards(id);
ALTER TABLE public."ad_rate_card_items" ADD CONSTRAINT "ad_rate_card_items_placement_id_fkey" FOREIGN KEY (placement_id) REFERENCES ad_placements(id);
ALTER TABLE public."add_ons" ADD CONSTRAINT "add_ons_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."admin_impersonation_sessions" ADD CONSTRAINT "fk_admin_impersonation_sessions_admin_actor_id" FOREIGN KEY (admin_actor_id) REFERENCES platform_admins(user_id) ON DELETE SET NULL;
ALTER TABLE public."admin_impersonation_sessions" ADD CONSTRAINT "fk_admin_impersonation_sessions_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."admin_manual_overrides" ADD CONSTRAINT "admin_manual_overrides_reverts_override_id_fkey" FOREIGN KEY (reverts_override_id) REFERENCES admin_manual_overrides(id);
ALTER TABLE public."admin_manual_overrides" ADD CONSTRAINT "admin_manual_overrides_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."admin_manual_overrides" ADD CONSTRAINT "admin_manual_overrides_actor_id_fk" FOREIGN KEY (actor_id) REFERENCES auth.users(id);
ALTER TABLE public."ai_ab_assignments" ADD CONSTRAINT "ai_ab_assignments_test_id_fkey" FOREIGN KEY (test_id) REFERENCES ai_ab_tests(id) ON DELETE CASCADE;
ALTER TABLE public."ai_ab_assignments" ADD CONSTRAINT "ai_ab_assignments_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."ai_ab_tests" ADD CONSTRAINT "ai_ab_tests_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."ai_ab_tests" ADD CONSTRAINT "ai_ab_tests_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."ai_agents" ADD CONSTRAINT "ai_agents_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."ai_agents" ADD CONSTRAINT "ai_agents_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."ai_budget_alerts" ADD CONSTRAINT "ai_budget_alerts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."ai_mcp_connections" ADD CONSTRAINT "ai_mcp_connections_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."ai_mcp_connections" ADD CONSTRAINT "ai_mcp_connections_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."analytics_export_runs" ADD CONSTRAINT "analytics_export_runs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."attribute_values" ADD CONSTRAINT "attribute_values_attribute_id_fkey" FOREIGN KEY (attribute_id) REFERENCES attributes(id) ON DELETE CASCADE;
ALTER TABLE public."attributes" ADD CONSTRAINT "attributes_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."availability" ADD CONSTRAINT "availability_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."bank_accounts" ADD CONSTRAINT "bank_accounts_currency_fkey" FOREIGN KEY (currency) REFERENCES currencies(code);
ALTER TABLE public."bank_accounts" ADD CONSTRAINT "bank_accounts_account_id_fkey" FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public."bank_accounts" ADD CONSTRAINT "bank_accounts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."bank_transactions" ADD CONSTRAINT "bank_transactions_matched_account_id_fkey" FOREIGN KEY (matched_account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE public."bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_fkey" FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE;
ALTER TABLE public."bank_transactions" ADD CONSTRAINT "bank_transactions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."bank_transactions" ADD CONSTRAINT "bank_transactions_matched_journal_id_fkey" FOREIGN KEY (matched_journal_id) REFERENCES journal_entries(id);
ALTER TABLE public."bill_items" ADD CONSTRAINT "bill_items_tax_id_fkey" FOREIGN KEY (tax_id) REFERENCES taxes(id);
ALTER TABLE public."bill_items" ADD CONSTRAINT "bill_items_bill_id_fkey" FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE;
ALTER TABLE public."bill_items" ADD CONSTRAINT "bill_items_inventory_item_id_fkey" FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id);
ALTER TABLE public."bill_items" ADD CONSTRAINT "bill_items_account_id_fkey" FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE public."bills" ADD CONSTRAINT "bills_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES customers(id) ON DELETE RESTRICT;
ALTER TABLE public."bills" ADD CONSTRAINT "bills_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."bills" ADD CONSTRAINT "bills_journal_id_fkey" FOREIGN KEY (journal_id) REFERENCES journal_entries(id);
ALTER TABLE public."bills" ADD CONSTRAINT "bills_currency_fkey" FOREIGN KEY (currency) REFERENCES currencies(code);
ALTER TABLE public."bills" ADD CONSTRAINT "bills_ap_account_id_fkey" FOREIGN KEY (ap_account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE public."blocked_times" ADD CONSTRAINT "blocked_times_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."brand_opt_outs" ADD CONSTRAINT "brand_opt_outs_brand_id_fkey" FOREIGN KEY (brand_id) REFERENCES brands(id);
ALTER TABLE public."brand_opt_outs" ADD CONSTRAINT "brand_opt_outs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."brand_placements" ADD CONSTRAINT "brand_placements_node_id_fkey" FOREIGN KEY (node_id) REFERENCES taxonomy_nodes(id) ON DELETE CASCADE;
ALTER TABLE public."brand_placements" ADD CONSTRAINT "brand_placements_brand_id_fkey" FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE public."brand_placements" ADD CONSTRAINT "brand_placements_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."brands" ADD CONSTRAINT "brands_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."capabilities" ADD CONSTRAINT "capabilities_case_id_fkey" FOREIGN KEY (case_id) REFERENCES onboarding_cases(id) ON DELETE CASCADE;
ALTER TABLE public."cart_items" ADD CONSTRAINT "cart_items_product_variant_id_fkey" FOREIGN KEY (product_variant_id) REFERENCES product_variants(id);
ALTER TABLE public."cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE;
ALTER TABLE public."cart_items" ADD CONSTRAINT "cart_items_supplier_catalog_variant_id_fkey" FOREIGN KEY (supplier_catalog_variant_id) REFERENCES supplier_catalog_variants(id);
ALTER TABLE public."catalog_bundle_components" ADD CONSTRAINT "catalog_bundle_components_catalog_item_id_fkey" FOREIGN KEY (catalog_item_id) REFERENCES commerce_catalog_items(id);
ALTER TABLE public."catalog_bundle_components" ADD CONSTRAINT "catalog_bundle_components_bundle_id_fkey" FOREIGN KEY (bundle_id) REFERENCES catalog_bundles(id) ON DELETE CASCADE;
ALTER TABLE public."catalog_bundle_components" ADD CONSTRAINT "catalog_bundle_components_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."catalog_bundle_components" ADD CONSTRAINT "catalog_bundle_components_sku_id_fkey" FOREIGN KEY (sku_id) REFERENCES erp_product_skus(id);
ALTER TABLE public."catalog_bundles" ADD CONSTRAINT "catalog_bundles_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."catalog_gtins" ADD CONSTRAINT "catalog_gtins_catalog_item_id_fkey" FOREIGN KEY (catalog_item_id) REFERENCES commerce_catalog_items(id) ON DELETE CASCADE;
ALTER TABLE public."catalog_gtins" ADD CONSTRAINT "catalog_gtins_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."catalog_listing_overrides" ADD CONSTRAINT "catalog_listing_overrides_category_id_fkey" FOREIGN KEY (category_id) REFERENCES categories(id);
ALTER TABLE public."catalog_listing_overrides" ADD CONSTRAINT "catalog_listing_overrides_supplier_catalog_product_id_fkey" FOREIGN KEY (supplier_catalog_product_id) REFERENCES supplier_catalog_products(id) ON DELETE CASCADE;
ALTER TABLE public."categories" ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE;
ALTER TABLE public."chargeback_details" ADD CONSTRAINT "chargeback_details_ticket_fkey" FOREIGN KEY (tenant_id, ticket_id) REFERENCES support_tickets(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_currency_fkey" FOREIGN KEY (currency) REFERENCES currencies(code);
ALTER TABLE public."chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."checkouts" ADD CONSTRAINT "checkouts_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES invoices(id);
ALTER TABLE public."checkouts" ADD CONSTRAINT "checkouts_currency_fkey" FOREIGN KEY (currency) REFERENCES currencies(code);
ALTER TABLE public."checkouts" ADD CONSTRAINT "checkouts_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE public."checkouts" ADD CONSTRAINT "checkouts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."cms_banners" ADD CONSTRAINT "cms_banners_target_page_id_fkey" FOREIGN KEY (target_page_id) REFERENCES cms_pages(id) ON DELETE SET NULL;
ALTER TABLE public."cms_banners" ADD CONSTRAINT "cms_banners_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."cms_galleries" ADD CONSTRAINT "cms_galleries_page_id_fkey" FOREIGN KEY (page_id) REFERENCES cms_pages(id) ON DELETE SET NULL;
ALTER TABLE public."cms_galleries" ADD CONSTRAINT "cms_galleries_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."cms_gallery_items" ADD CONSTRAINT "cms_gallery_items_service_id_fkey" FOREIGN KEY (service_id) REFERENCES crm_services(id) ON DELETE SET NULL;
ALTER TABLE public."cms_gallery_items" ADD CONSTRAINT "cms_gallery_items_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."cms_gallery_items" ADD CONSTRAINT "cms_gallery_items_gallery_id_fkey" FOREIGN KEY (gallery_id) REFERENCES cms_galleries(id) ON DELETE CASCADE;
ALTER TABLE public."cms_gallery_items" ADD CONSTRAINT "cms_gallery_items_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES crm_staff(id) ON DELETE SET NULL;
ALTER TABLE public."cms_global_content" ADD CONSTRAINT "cms_global_content_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."cms_media_taxonomy" ADD CONSTRAINT "cms_media_taxonomy_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES cms_media_taxonomy(id);
ALTER TABLE public."cms_navigation" ADD CONSTRAINT "cms_navigation_page_id_fkey" FOREIGN KEY (page_id) REFERENCES cms_pages(id) ON DELETE CASCADE;
ALTER TABLE public."cms_navigation" ADD CONSTRAINT "cms_navigation_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."cms_navigation" ADD CONSTRAINT "cms_navigation_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES cms_navigation(id) ON DELETE CASCADE;
ALTER TABLE public."cms_page_revisions" ADD CONSTRAINT "cms_page_revisions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."cms_page_revisions" ADD CONSTRAINT "cms_page_revisions_page_id_fkey" FOREIGN KEY (page_id) REFERENCES cms_pages(id) ON DELETE CASCADE;
ALTER TABLE public."cms_page_revisions" ADD CONSTRAINT "cms_page_revisions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."cms_pages" ADD CONSTRAINT "cms_pages_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."cms_pages" ADD CONSTRAINT "cms_pages_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."cms_pages" ADD CONSTRAINT "cms_pages_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."cms_pages" ADD CONSTRAINT "cms_pages_parent_page_id_fkey" FOREIGN KEY (parent_page_id) REFERENCES cms_pages(id) ON DELETE SET NULL;
ALTER TABLE public."cms_policy_acceptances" ADD CONSTRAINT "cms_policy_acceptances_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE CASCADE;
ALTER TABLE public."cms_policy_acceptances" ADD CONSTRAINT "cms_policy_acceptances_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."cms_policy_acceptances" ADD CONSTRAINT "cms_policy_acceptances_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."cms_policy_acceptances" ADD CONSTRAINT "cms_policy_acceptances_page_id_fkey" FOREIGN KEY (page_id) REFERENCES cms_pages(id) ON DELETE CASCADE;
ALTER TABLE public."cms_seo" ADD CONSTRAINT "cms_seo_page_id_fkey" FOREIGN KEY (page_id) REFERENCES cms_pages(id) ON DELETE CASCADE;
ALTER TABLE public."cms_seo" ADD CONSTRAINT "cms_seo_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."cms_slot_items" ADD CONSTRAINT "cms_slot_items_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id);
ALTER TABLE public."cms_slot_items" ADD CONSTRAINT "cms_slot_items_slot_id_fkey" FOREIGN KEY (slot_id) REFERENCES cms_slots(id) ON DELETE CASCADE;
ALTER TABLE public."cms_slots" ADD CONSTRAINT "cms_slots_node_id_fkey" FOREIGN KEY (node_id) REFERENCES taxonomy_nodes(id) ON DELETE CASCADE;
ALTER TABLE public."cms_slots" ADD CONSTRAINT "cms_slots_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."collections" ADD CONSTRAINT "collections_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES collections(id) ON DELETE SET NULL;
ALTER TABLE public."collections" ADD CONSTRAINT "collections_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."commerce_accounting_mappings" ADD CONSTRAINT "commerce_accounting_mappings_tenant_id_payment_method_id_fkey" FOREIGN KEY (tenant_id, payment_method_id) REFERENCES commerce_payment_methods(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."commerce_accounting_mappings" ADD CONSTRAINT "commerce_accounting_mappings_tenant_id_catalog_item_id_fkey" FOREIGN KEY (tenant_id, catalog_item_id) REFERENCES commerce_catalog_items(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."commerce_accounting_mappings" ADD CONSTRAINT "commerce_accounting_mappings_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_accounting_mappings" ADD CONSTRAINT "commerce_accounting_mappings_tenant_id_tax_code_id_fkey" FOREIGN KEY (tenant_id, tax_code_id) REFERENCES acct_tax_codes(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_audit_log" ADD CONSTRAINT "commerce_audit_log_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_barcodes" ADD CONSTRAINT "commerce_barcodes_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_barcodes" ADD CONSTRAINT "commerce_barcodes_tenant_id_catalog_item_id_fkey" FOREIGN KEY (tenant_id, catalog_item_id) REFERENCES commerce_catalog_items(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."commerce_batch_slips" ADD CONSTRAINT "commerce_batch_slips_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_branches" ADD CONSTRAINT "commerce_branches_tenant_id_crm_location_id_fkey" FOREIGN KEY (tenant_id, crm_location_id) REFERENCES crm_locations(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_branches" ADD CONSTRAINT "commerce_branches_tenant_id_entity_id_fkey" FOREIGN KEY (tenant_id, entity_id) REFERENCES acct_entities(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_branches" ADD CONSTRAINT "commerce_branches_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_cart_lines" ADD CONSTRAINT "commerce_cart_lines_sku_id_fkey" FOREIGN KEY (sku_id) REFERENCES erp_product_skus(id) ON DELETE RESTRICT;
ALTER TABLE public."commerce_cart_lines" ADD CONSTRAINT "commerce_cart_lines_catalog_item_id_fkey" FOREIGN KEY (catalog_item_id) REFERENCES commerce_catalog_items(id) ON DELETE RESTRICT;
ALTER TABLE public."commerce_cart_lines" ADD CONSTRAINT "commerce_cart_lines_cart_id_fkey" FOREIGN KEY (cart_id) REFERENCES commerce_carts(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_carts" ADD CONSTRAINT "commerce_carts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_carts" ADD CONSTRAINT "commerce_carts_channel_id_fk" FOREIGN KEY (channel_id) REFERENCES commerce_order_channels(id);
ALTER TABLE public."commerce_carts" ADD CONSTRAINT "commerce_carts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_cash_movements" ADD CONSTRAINT "commerce_cash_movements_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_cash_movements" ADD CONSTRAINT "commerce_cash_movements_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_catalog_category_map" ADD CONSTRAINT "commerce_catalog_category_map_catalog_item_id_fkey" FOREIGN KEY (catalog_item_id) REFERENCES commerce_catalog_items(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_catalog_category_map" ADD CONSTRAINT "commerce_catalog_category_map_category_id_fkey" FOREIGN KEY (category_id) REFERENCES commerce_categories(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_catalog_items" ADD CONSTRAINT "commerce_catalog_items_tenant_id_tax_code_id_fkey" FOREIGN KEY (tenant_id, tax_code_id) REFERENCES acct_tax_codes(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_catalog_items" ADD CONSTRAINT "commerce_catalog_items_tenant_id_sku_id_fkey" FOREIGN KEY (tenant_id, sku_id) REFERENCES erp_product_skus(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."commerce_catalog_items" ADD CONSTRAINT "commerce_catalog_items_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_catalog_items" ADD CONSTRAINT "commerce_catalog_items_tenant_id_service_id_fkey" FOREIGN KEY (tenant_id, service_id) REFERENCES crm_services(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_categories" ADD CONSTRAINT "commerce_categories_tenant_id_parent_id_fkey" FOREIGN KEY (tenant_id, parent_id) REFERENCES commerce_categories(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."commerce_categories" ADD CONSTRAINT "commerce_categories_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_channel_events" ADD CONSTRAINT "commerce_channel_events_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_channel_events" ADD CONSTRAINT "commerce_channel_events_tenant_id_channel_id_fkey" FOREIGN KEY (tenant_id, channel_id) REFERENCES commerce_order_channels(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_channel_products" ADD CONSTRAINT "commerce_channel_products_tenant_id_channel_id_fkey" FOREIGN KEY (tenant_id, channel_id) REFERENCES commerce_order_channels(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."commerce_channel_products" ADD CONSTRAINT "commerce_channel_products_tenant_id_catalog_item_id_fkey" FOREIGN KEY (tenant_id, catalog_item_id) REFERENCES commerce_catalog_items(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."commerce_channel_products" ADD CONSTRAINT "commerce_channel_products_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_checkout_sessions" ADD CONSTRAINT "commerce_checkout_sessions_tenant_id_cart_id_fkey" FOREIGN KEY (tenant_id, cart_id) REFERENCES commerce_carts(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_checkout_sessions" ADD CONSTRAINT "commerce_checkout_sessions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_checkout_sessions" ADD CONSTRAINT "commerce_checkout_sessions_tenant_id_sale_id_fkey" FOREIGN KEY (tenant_id, sale_id) REFERENCES commerce_sales(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_coupon_redemptions" ADD CONSTRAINT "commerce_coupon_redemptions_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES commerce_sales(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_coupon_redemptions" ADD CONSTRAINT "commerce_coupon_redemptions_coupon_id_fkey" FOREIGN KEY (coupon_id) REFERENCES commerce_coupons(id) ON DELETE RESTRICT;
ALTER TABLE public."commerce_coupon_redemptions" ADD CONSTRAINT "commerce_coupon_redemptions_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_coupons" ADD CONSTRAINT "commerce_coupons_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_coupons" ADD CONSTRAINT "commerce_coupons_tenant_id_promotion_id_fkey" FOREIGN KEY (tenant_id, promotion_id) REFERENCES commerce_promotions(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_customer_accounts" ADD CONSTRAINT "commerce_customer_accounts_tenant_id_price_list_id_fkey" FOREIGN KEY (tenant_id, price_list_id) REFERENCES commerce_price_lists(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_customer_accounts" ADD CONSTRAINT "commerce_customer_accounts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_customer_accounts" ADD CONSTRAINT "commerce_customer_accounts_default_payment_method_id_fk" FOREIGN KEY (default_payment_method_id) REFERENCES commerce_payment_methods(id);
ALTER TABLE public."commerce_customer_addresses" ADD CONSTRAINT "commerce_customer_addresses_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_customer_payment_methods" ADD CONSTRAINT "commerce_customer_payment_methods_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_customer_payment_methods" ADD CONSTRAINT "commerce_customer_payment_methods_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_departments" ADD CONSTRAINT "commerce_departments_tenant_id_branch_id_fkey" FOREIGN KEY (tenant_id, branch_id) REFERENCES commerce_branches(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."commerce_departments" ADD CONSTRAINT "commerce_departments_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_deposits" ADD CONSTRAINT "commerce_deposits_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_deposits" ADD CONSTRAINT "commerce_deposits_transferred_from_id_fkey" FOREIGN KEY (transferred_from_id) REFERENCES commerce_deposits(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_deposits" ADD CONSTRAINT "commerce_deposits_transferred_to_id_fkey" FOREIGN KEY (transferred_to_id) REFERENCES commerce_deposits(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_deposits" ADD CONSTRAINT "commerce_deposits_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_deposits" ADD CONSTRAINT "commerce_deposits_tenant_id_service_id_fkey" FOREIGN KEY (tenant_id, service_id) REFERENCES crm_services(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_deposits" ADD CONSTRAINT "commerce_deposits_tenant_id_payment_id_fkey" FOREIGN KEY (tenant_id, payment_id) REFERENCES commerce_payments(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_disputes" ADD CONSTRAINT "commerce_disputes_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_disputes" ADD CONSTRAINT "commerce_disputes_tenant_id_payment_id_fkey" FOREIGN KEY (tenant_id, payment_id) REFERENCES commerce_payments(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_disputes" ADD CONSTRAINT "commerce_disputes_tenant_id_refund_id_fkey" FOREIGN KEY (tenant_id, refund_id) REFERENCES commerce_refunds(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_disputes" ADD CONSTRAINT "commerce_disputes_tenant_id_sale_id_fkey" FOREIGN KEY (tenant_id, sale_id) REFERENCES commerce_sales(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_event_consumptions" ADD CONSTRAINT "commerce_event_consumptions_event_id_fkey" FOREIGN KEY (event_id) REFERENCES commerce_outbox_events(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_event_consumptions" ADD CONSTRAINT "commerce_event_consumptions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_export_jobs" ADD CONSTRAINT "commerce_export_jobs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_export_jobs" ADD CONSTRAINT "commerce_export_jobs_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_fulfillment_events" ADD CONSTRAINT "commerce_fulfillment_events_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_gift_card_designs" ADD CONSTRAINT "commerce_gift_card_designs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_gift_card_transactions" ADD CONSTRAINT "commerce_gift_card_transactions_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES commerce_sales(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_gift_card_transactions" ADD CONSTRAINT "commerce_gift_card_transactions_payment_id_fkey" FOREIGN KEY (payment_id) REFERENCES commerce_payments(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_gift_card_transactions" ADD CONSTRAINT "commerce_gift_card_transactions_gift_card_id_fkey" FOREIGN KEY (gift_card_id) REFERENCES commerce_gift_cards(id) ON DELETE RESTRICT;
ALTER TABLE public."commerce_gift_card_transactions" ADD CONSTRAINT "commerce_gift_card_transactions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_gift_cards" ADD CONSTRAINT "commerce_gift_cards_design_id_fkey" FOREIGN KEY (design_id) REFERENCES commerce_gift_card_designs(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_gift_cards" ADD CONSTRAINT "commerce_gift_cards_replaced_by_id_fkey" FOREIGN KEY (replaced_by_id) REFERENCES commerce_gift_cards(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_gift_cards" ADD CONSTRAINT "commerce_gift_cards_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_gift_cards" ADD CONSTRAINT "commerce_gift_cards_holder_customer_id_fkey" FOREIGN KEY (holder_customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_gift_cards" ADD CONSTRAINT "commerce_gift_cards_converted_store_credit_id_fkey" FOREIGN KEY (converted_store_credit_id) REFERENCES commerce_store_credits(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_idempotency" ADD CONSTRAINT "commerce_idempotency_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_inventory_alerts" ADD CONSTRAINT "commerce_inventory_alerts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_inventory_alerts" ADD CONSTRAINT "commerce_inventory_alerts_tenant_id_sku_id_fkey" FOREIGN KEY (tenant_id, sku_id) REFERENCES erp_product_skus(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_inventory_events" ADD CONSTRAINT "commerce_inventory_events_tenant_id_sku_id_fkey" FOREIGN KEY (tenant_id, sku_id) REFERENCES erp_product_skus(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_inventory_events" ADD CONSTRAINT "commerce_inventory_events_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_loyalty_accounts" ADD CONSTRAINT "commerce_loyalty_accounts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_loyalty_transactions" ADD CONSTRAINT "commerce_loyalty_transactions_loyalty_account_id_fkey" FOREIGN KEY (loyalty_account_id) REFERENCES commerce_loyalty_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public."commerce_loyalty_transactions" ADD CONSTRAINT "commerce_loyalty_transactions_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES commerce_sales(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_modules" ADD CONSTRAINT "commerce_modules_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_order_channel_refs" ADD CONSTRAINT "commerce_order_channel_refs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_order_channel_refs" ADD CONSTRAINT "commerce_order_channel_refs_tenant_id_channel_id_fkey" FOREIGN KEY (tenant_id, channel_id) REFERENCES commerce_order_channels(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."commerce_order_channels" ADD CONSTRAINT "commerce_order_channels_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_order_events" ADD CONSTRAINT "commerce_order_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_order_events" ADD CONSTRAINT "commerce_order_events_tenant_id_sale_id_fkey" FOREIGN KEY (tenant_id, sale_id) REFERENCES commerce_sales(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_order_events" ADD CONSTRAINT "commerce_order_events_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_orders" ADD CONSTRAINT "commerce_orders_coupon_id_fk" FOREIGN KEY (coupon_id) REFERENCES commerce_coupons(id);
ALTER TABLE public."commerce_outbox_events" ADD CONSTRAINT "commerce_outbox_events_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_payment_allocations" ADD CONSTRAINT "commerce_payment_allocations_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES commerce_sales(id) ON DELETE RESTRICT;
ALTER TABLE public."commerce_payment_allocations" ADD CONSTRAINT "commerce_payment_allocations_payment_id_fkey" FOREIGN KEY (payment_id) REFERENCES commerce_payments(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_payment_methods" ADD CONSTRAINT "commerce_payment_methods_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_payments" ADD CONSTRAINT "commerce_payments_tenant_id_sale_id_fkey" FOREIGN KEY (tenant_id, sale_id) REFERENCES commerce_sales(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_payments" ADD CONSTRAINT "commerce_payments_branch_id_fkey" FOREIGN KEY (branch_id) REFERENCES commerce_branches(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_payments" ADD CONSTRAINT "commerce_payments_location_id_fkey" FOREIGN KEY (location_id) REFERENCES crm_locations(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_payments" ADD CONSTRAINT "commerce_payments_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES crm_staff(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_payments" ADD CONSTRAINT "commerce_payments_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_payments" ADD CONSTRAINT "commerce_payments_tenant_id_payment_method_id_fkey" FOREIGN KEY (tenant_id, payment_method_id) REFERENCES commerce_payment_methods(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."commerce_posting_events" ADD CONSTRAINT "commerce_posting_events_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_price_lists" ADD CONSTRAINT "commerce_price_lists_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_prices" ADD CONSTRAINT "commerce_prices_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_prices" ADD CONSTRAINT "commerce_prices_tenant_id_catalog_item_id_fkey" FOREIGN KEY (tenant_id, catalog_item_id) REFERENCES commerce_catalog_items(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."commerce_prices" ADD CONSTRAINT "commerce_prices_tenant_id_price_list_id_fkey" FOREIGN KEY (tenant_id, price_list_id) REFERENCES commerce_price_lists(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."commerce_procurement_events" ADD CONSTRAINT "commerce_procurement_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_procurement_events" ADD CONSTRAINT "commerce_procurement_events_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_product_media" ADD CONSTRAINT "commerce_product_media_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_product_media" ADD CONSTRAINT "commerce_product_media_tenant_id_catalog_item_id_fkey" FOREIGN KEY (tenant_id, catalog_item_id) REFERENCES commerce_catalog_items(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."commerce_product_tags" ADD CONSTRAINT "commerce_product_tags_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_product_tags" ADD CONSTRAINT "commerce_product_tags_tenant_id_catalog_item_id_fkey" FOREIGN KEY (tenant_id, catalog_item_id) REFERENCES commerce_catalog_items(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."commerce_promotion_items" ADD CONSTRAINT "commerce_promotion_items_tenant_id_catalog_item_id_fkey" FOREIGN KEY (tenant_id, catalog_item_id) REFERENCES commerce_catalog_items(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."commerce_promotion_items" ADD CONSTRAINT "commerce_promotion_items_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_promotion_items" ADD CONSTRAINT "commerce_promotion_items_tenant_id_category_id_fkey" FOREIGN KEY (tenant_id, category_id) REFERENCES commerce_categories(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."commerce_promotion_items" ADD CONSTRAINT "commerce_promotion_items_tenant_id_promotion_id_fkey" FOREIGN KEY (tenant_id, promotion_id) REFERENCES commerce_promotions(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."commerce_promotion_targets" ADD CONSTRAINT "commerce_promotion_targets_promotion_fk" FOREIGN KEY (tenant_id, promotion_id) REFERENCES commerce_promotions(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."commerce_promotion_targets" ADD CONSTRAINT "commerce_promotion_targets_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_promotions" ADD CONSTRAINT "commerce_promotions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_promotions" ADD CONSTRAINT "commerce_promotions_seller_id_fk" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."commerce_receipts" ADD CONSTRAINT "commerce_receipts_tenant_id_sale_id_fkey" FOREIGN KEY (tenant_id, sale_id) REFERENCES commerce_sales(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."commerce_receipts" ADD CONSTRAINT "commerce_receipts_gift_card_id_fkey" FOREIGN KEY (gift_card_id) REFERENCES commerce_gift_cards(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_receipts" ADD CONSTRAINT "commerce_receipts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_receipts" ADD CONSTRAINT "commerce_receipts_deposit_id_fkey" FOREIGN KEY (deposit_id) REFERENCES commerce_deposits(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_receipts" ADD CONSTRAINT "commerce_receipts_refund_id_fkey" FOREIGN KEY (refund_id) REFERENCES commerce_refunds(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_refund_lines" ADD CONSTRAINT "commerce_refund_lines_sale_line_id_fkey" FOREIGN KEY (sale_line_id) REFERENCES commerce_sale_lines(id) ON DELETE RESTRICT;
ALTER TABLE public."commerce_refund_lines" ADD CONSTRAINT "commerce_refund_lines_refund_id_fkey" FOREIGN KEY (refund_id) REFERENCES commerce_refunds(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_refunds" ADD CONSTRAINT "commerce_refunds_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_refunds" ADD CONSTRAINT "commerce_refunds_tenant_id_sale_id_fkey" FOREIGN KEY (tenant_id, sale_id) REFERENCES commerce_sales(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."commerce_refunds" ADD CONSTRAINT "commerce_refunds_rejected_by_fkey" FOREIGN KEY (rejected_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_refunds" ADD CONSTRAINT "commerce_refunds_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_refunds" ADD CONSTRAINT "commerce_refunds_tenant_id_payment_id_fkey" FOREIGN KEY (tenant_id, payment_id) REFERENCES commerce_payments(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_refunds" ADD CONSTRAINT "commerce_refunds_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_refunds" ADD CONSTRAINT "commerce_refunds_tenant_id_acct_credit_memo_id_fkey" FOREIGN KEY (tenant_id, acct_credit_memo_id) REFERENCES acct_ar_credit_memos(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_refunds" ADD CONSTRAINT "commerce_refunds_store_credit_id_fkey" FOREIGN KEY (store_credit_id) REFERENCES commerce_store_credits(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_return_actions" ADD CONSTRAINT "commerce_return_actions_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_return_actions" ADD CONSTRAINT "commerce_return_actions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_return_events" ADD CONSTRAINT "commerce_return_events_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_return_events" ADD CONSTRAINT "commerce_return_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_sale_discounts" ADD CONSTRAINT "commerce_sale_discounts_sale_line_id_fkey" FOREIGN KEY (sale_line_id) REFERENCES commerce_sale_lines(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_sale_discounts" ADD CONSTRAINT "commerce_sale_discounts_promotion_id_fkey" FOREIGN KEY (promotion_id) REFERENCES commerce_promotions(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_sale_discounts" ADD CONSTRAINT "commerce_sale_discounts_coupon_id_fkey" FOREIGN KEY (coupon_id) REFERENCES commerce_coupons(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_sale_discounts" ADD CONSTRAINT "commerce_sale_discounts_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES commerce_sales(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_sale_lines" ADD CONSTRAINT "commerce_sale_lines_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES commerce_sales(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_sale_lines" ADD CONSTRAINT "commerce_sale_lines_sku_id_fkey" FOREIGN KEY (sku_id) REFERENCES erp_product_skus(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_sale_lines" ADD CONSTRAINT "commerce_sale_lines_service_id_fkey" FOREIGN KEY (service_id) REFERENCES crm_services(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_sale_lines" ADD CONSTRAINT "commerce_sale_lines_erp_order_line_id_fkey" FOREIGN KEY (erp_order_line_id) REFERENCES erp_order_lines(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_sale_lines" ADD CONSTRAINT "commerce_sale_lines_catalog_item_id_fkey" FOREIGN KEY (catalog_item_id) REFERENCES commerce_catalog_items(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_sale_taxes" ADD CONSTRAINT "commerce_sale_taxes_tax_code_id_fkey" FOREIGN KEY (tax_code_id) REFERENCES acct_tax_codes(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_sale_taxes" ADD CONSTRAINT "commerce_sale_taxes_sale_line_id_fkey" FOREIGN KEY (sale_line_id) REFERENCES commerce_sale_lines(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_sale_taxes" ADD CONSTRAINT "commerce_sale_taxes_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES commerce_sales(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_sales" ADD CONSTRAINT "commerce_sales_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_sales" ADD CONSTRAINT "commerce_sales_tenant_id_branch_id_fkey" FOREIGN KEY (tenant_id, branch_id) REFERENCES commerce_branches(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_sales" ADD CONSTRAINT "commerce_sales_tenant_id_cart_id_fkey" FOREIGN KEY (tenant_id, cart_id) REFERENCES commerce_carts(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_sales" ADD CONSTRAINT "commerce_sales_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_shipping_labels" ADD CONSTRAINT "commerce_shipping_labels_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_shipping_labels" ADD CONSTRAINT "commerce_shipping_labels_printed_by_fkey" FOREIGN KEY (printed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_store_credit_transactions" ADD CONSTRAINT "commerce_store_credit_transactions_store_credit_id_fkey" FOREIGN KEY (store_credit_id) REFERENCES commerce_store_credits(id) ON DELETE RESTRICT;
ALTER TABLE public."commerce_store_credit_transactions" ADD CONSTRAINT "commerce_store_credit_transactions_sale_id_fkey" FOREIGN KEY (sale_id) REFERENCES commerce_sales(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_store_credit_transactions" ADD CONSTRAINT "commerce_store_credit_transactions_refund_id_fkey" FOREIGN KEY (refund_id) REFERENCES commerce_refunds(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_store_credits" ADD CONSTRAINT "commerce_store_credits_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_subscription_events" ADD CONSTRAINT "commerce_subscription_events_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_subscription_events" ADD CONSTRAINT "commerce_subscription_events_subscription_id_fkey" FOREIGN KEY (subscription_id) REFERENCES commerce_subscriptions(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_subscription_invoice_lines" ADD CONSTRAINT "commerce_subscription_invoice_lines_subscription_item_id_fkey" FOREIGN KEY (subscription_item_id) REFERENCES commerce_subscription_items(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_subscription_invoice_lines" ADD CONSTRAINT "commerce_subscription_invoice_line_subscription_invoice_id_fkey" FOREIGN KEY (subscription_invoice_id) REFERENCES commerce_subscription_invoices(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_subscription_invoices" ADD CONSTRAINT "commerce_subscription_invoices_tenant_id_subscription_id_fkey" FOREIGN KEY (tenant_id, subscription_id) REFERENCES commerce_subscriptions(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."commerce_subscription_invoices" ADD CONSTRAINT "commerce_subscription_invoices_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_subscription_items" ADD CONSTRAINT "commerce_subscription_items_service_id_fkey" FOREIGN KEY (service_id) REFERENCES crm_services(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_subscription_items" ADD CONSTRAINT "commerce_subscription_items_subscription_id_fkey" FOREIGN KEY (subscription_id) REFERENCES commerce_subscriptions(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_subscription_items" ADD CONSTRAINT "commerce_subscription_items_catalog_item_id_fkey" FOREIGN KEY (catalog_item_id) REFERENCES commerce_catalog_items(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_subscription_payments" ADD CONSTRAINT "commerce_subscription_payments_payment_id_fkey" FOREIGN KEY (payment_id) REFERENCES commerce_payments(id) ON DELETE RESTRICT;
ALTER TABLE public."commerce_subscription_payments" ADD CONSTRAINT "commerce_subscription_payments_subscription_invoice_id_fkey" FOREIGN KEY (subscription_invoice_id) REFERENCES commerce_subscription_invoices(id) ON DELETE RESTRICT;
ALTER TABLE public."commerce_subscription_plan_items" ADD CONSTRAINT "commerce_subscription_plan_items_catalog_item_id_fkey" FOREIGN KEY (catalog_item_id) REFERENCES commerce_catalog_items(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_subscription_plan_items" ADD CONSTRAINT "commerce_subscription_plan_items_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES commerce_subscription_plans(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_subscription_plan_items" ADD CONSTRAINT "commerce_subscription_plan_items_service_id_fkey" FOREIGN KEY (service_id) REFERENCES crm_services(id) ON DELETE SET NULL;
ALTER TABLE public."commerce_subscription_plans" ADD CONSTRAINT "commerce_subscription_plans_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_subscriptions" ADD CONSTRAINT "commerce_subscriptions_tenant_id_plan_id_fkey" FOREIGN KEY (tenant_id, plan_id) REFERENCES commerce_subscription_plans(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."commerce_subscriptions" ADD CONSTRAINT "commerce_subscriptions_tenant_id_acct_contract_id_fkey" FOREIGN KEY (tenant_id, acct_contract_id) REFERENCES acct_revenue_contracts(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_subscriptions" ADD CONSTRAINT "commerce_subscriptions_tenant_id_default_payment_method_id_fkey" FOREIGN KEY (tenant_id, default_payment_method_id) REFERENCES commerce_payment_methods(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."commerce_subscriptions" ADD CONSTRAINT "commerce_subscriptions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."commerce_webhook_events" ADD CONSTRAINT "commerce_webhook_events_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."communications" ADD CONSTRAINT "communications_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."contact_messages" ADD CONSTRAINT "contact_messages_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."crm_activity" ADD CONSTRAINT "crm_activity_tenant_id_staff_id_fkey" FOREIGN KEY (tenant_id, staff_id) REFERENCES crm_staff(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."crm_activity" ADD CONSTRAINT "crm_activity_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_audit_log" ADD CONSTRAINT "crm_audit_log_tenant_id_actor_staff_id_fkey" FOREIGN KEY (tenant_id, actor_staff_id) REFERENCES crm_staff(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."crm_audit_log" ADD CONSTRAINT "crm_audit_log_actor_user_id_fk" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);
ALTER TABLE public."crm_audit_log" ADD CONSTRAINT "crm_audit_log_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_automation_enrollments" ADD CONSTRAINT "crm_automation_enrollments_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_automation_enrollments" ADD CONSTRAINT "crm_automation_enrollments_tenant_id_workflow_id_fkey" FOREIGN KEY (tenant_id, workflow_id) REFERENCES crm_automation_workflows(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."crm_automation_runs" ADD CONSTRAINT "crm_automation_runs_tenant_id_workflow_id_fkey" FOREIGN KEY (tenant_id, workflow_id) REFERENCES crm_automation_workflows(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."crm_automation_runs" ADD CONSTRAINT "crm_automation_runs_tenant_id_enrollment_id_fkey" FOREIGN KEY (tenant_id, enrollment_id) REFERENCES crm_automation_enrollments(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."crm_automation_runs" ADD CONSTRAINT "crm_automation_runs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_automation_workflows" ADD CONSTRAINT "crm_automation_workflows_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_automation_workflows" ADD CONSTRAINT "crm_automation_workflows_tenant_id_created_by_fkey" FOREIGN KEY (tenant_id, created_by) REFERENCES crm_staff(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."crm_campaign_members" ADD CONSTRAINT "fk_crm_campaign_members_customer_id" FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL;
ALTER TABLE public."crm_campaign_members" ADD CONSTRAINT "fk_crm_campaign_members_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_campaign_members" ADD CONSTRAINT "fk_crm_campaign_members_campaign_id" FOREIGN KEY (campaign_id) REFERENCES crm_campaigns(id) ON DELETE SET NULL;
ALTER TABLE public."crm_campaigns" ADD CONSTRAINT "fk_crm_campaigns_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_commission_entries" ADD CONSTRAINT "crm_commission_entries_payroll_run_id_fkey" FOREIGN KEY (payroll_run_id) REFERENCES acct_payroll_runs(id) ON DELETE SET NULL;
ALTER TABLE public."crm_commission_entries" ADD CONSTRAINT "crm_commission_entries_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES crm_staff(id) ON DELETE RESTRICT;
ALTER TABLE public."crm_commission_entries" ADD CONSTRAINT "crm_commission_entries_service_id_fkey" FOREIGN KEY (service_id) REFERENCES crm_services(id) ON DELETE SET NULL;
ALTER TABLE public."crm_commission_entries" ADD CONSTRAINT "crm_commission_entries_sale_id_fk" FOREIGN KEY (sale_id) REFERENCES commerce_sales(id);
ALTER TABLE public."crm_commission_entries" ADD CONSTRAINT "crm_commission_entries_reversal_of_id_fkey" FOREIGN KEY (reversal_of_id) REFERENCES crm_commission_entries(id) ON DELETE SET NULL;
ALTER TABLE public."crm_commission_entries" ADD CONSTRAINT "crm_commission_entries_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_commission_entries" ADD CONSTRAINT "crm_commission_entries_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES crm_commission_plans(id) ON DELETE SET NULL;
ALTER TABLE public."crm_commission_plans" ADD CONSTRAINT "crm_commission_plans_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_commission_rules" ADD CONSTRAINT "crm_commission_rules_service_id_fkey" FOREIGN KEY (service_id) REFERENCES crm_services(id) ON DELETE CASCADE;
ALTER TABLE public."crm_commission_rules" ADD CONSTRAINT "crm_commission_rules_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES crm_commission_plans(id) ON DELETE CASCADE;
ALTER TABLE public."crm_commission_rules" ADD CONSTRAINT "crm_commission_rules_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_commission_tiers" ADD CONSTRAINT "crm_commission_tiers_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_commission_tiers" ADD CONSTRAINT "crm_commission_tiers_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES crm_commission_plans(id) ON DELETE CASCADE;
ALTER TABLE public."crm_communication_preferences" ADD CONSTRAINT "crm_communication_preferences_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_conversations" ADD CONSTRAINT "fk_crm_conversations_customer_id" FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL;
ALTER TABLE public."crm_conversations" ADD CONSTRAINT "fk_crm_conversations_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_customer_behavior" ADD CONSTRAINT "crm_customer_behavior_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_customer_behavior" ADD CONSTRAINT "crm_customer_behavior_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE CASCADE;
ALTER TABLE public."crm_customer_contact_methods" ADD CONSTRAINT "crm_customer_contact_methods_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_customer_preferences" ADD CONSTRAINT "fk_crm_customer_preferences_customer_id" FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL;
ALTER TABLE public."crm_customer_preferences" ADD CONSTRAINT "fk_crm_customer_preferences_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_customer_tag_assignments" ADD CONSTRAINT "fk_crm_customer_tag_assignments_tag_id" FOREIGN KEY (tag_id) REFERENCES crm_tags(id) ON DELETE SET NULL;
ALTER TABLE public."crm_customer_tag_assignments" ADD CONSTRAINT "fk_crm_customer_tag_assignments_customer_id" FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL;
ALTER TABLE public."crm_customer_tag_assignments" ADD CONSTRAINT "fk_crm_customer_tag_assignments_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_customer_tags" ADD CONSTRAINT "fk_crm_customer_tags_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_customer_tags" ADD CONSTRAINT "fk_crm_customer_tags_tag_id" FOREIGN KEY (tag_id) REFERENCES crm_tags(id) ON DELETE SET NULL;
ALTER TABLE public."crm_customer_tags" ADD CONSTRAINT "fk_crm_customer_tags_customer_id" FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL;
ALTER TABLE public."crm_customers" ADD CONSTRAINT "fk_crm_customers_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_document_types" ADD CONSTRAINT "crm_document_types_cms_page_id_fkey" FOREIGN KEY (cms_page_id) REFERENCES cms_pages(id) ON DELETE SET NULL;
ALTER TABLE public."crm_document_types" ADD CONSTRAINT "crm_document_types_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_document_versions" ADD CONSTRAINT "crm_document_versions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_document_versions" ADD CONSTRAINT "crm_document_versions_tenant_id_uploaded_by_fkey" FOREIGN KEY (tenant_id, uploaded_by) REFERENCES crm_staff(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."crm_documents" ADD CONSTRAINT "fk_crm_documents_customer_id" FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL;
ALTER TABLE public."crm_documents" ADD CONSTRAINT "fk_crm_documents_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_documents" ADD CONSTRAINT "fk_crm_documents_order_id" FOREIGN KEY (order_id) REFERENCES erp_orders(id) ON DELETE SET NULL;
ALTER TABLE public."crm_duplicate_candidates" ADD CONSTRAINT "crm_duplicate_candidates_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_duplicate_candidates" ADD CONSTRAINT "crm_duplicate_candidates_tenant_id_reviewed_by_fkey" FOREIGN KEY (tenant_id, reviewed_by) REFERENCES crm_staff(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."crm_external_identities" ADD CONSTRAINT "crm_external_identities_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_funnel_events" ADD CONSTRAINT "crm_funnel_events_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_holiday_blackouts" ADD CONSTRAINT "crm_holiday_blackouts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_holiday_blackouts" ADD CONSTRAINT "crm_holiday_blackouts_location_id_fkey" FOREIGN KEY (location_id) REFERENCES crm_locations(id) ON DELETE CASCADE;
ALTER TABLE public."crm_households" ADD CONSTRAINT "crm_households_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_idempotency_keys" ADD CONSTRAINT "crm_idempotency_keys_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_lead_activities" ADD CONSTRAINT "crm_lead_activities_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_lead_activities" ADD CONSTRAINT "crm_lead_activities_tenant_id_staff_id_fkey" FOREIGN KEY (tenant_id, staff_id) REFERENCES crm_staff(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."crm_lead_sources" ADD CONSTRAINT "crm_lead_sources_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_leads" ADD CONSTRAINT "fk_crm_leads_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_leads" ADD CONSTRAINT "fk_crm_leads_customer_id" FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL;
ALTER TABLE public."crm_locations" ADD CONSTRAINT "crm_locations_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_merge_log" ADD CONSTRAINT "crm_merge_log_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_merge_log" ADD CONSTRAINT "crm_merge_log_tenant_id_merged_by_fkey" FOREIGN KEY (tenant_id, merged_by) REFERENCES crm_staff(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."crm_message_templates" ADD CONSTRAINT "crm_message_templates_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_message_templates" ADD CONSTRAINT "crm_message_templates_tenant_id_created_by_fkey" FOREIGN KEY (tenant_id, created_by) REFERENCES crm_staff(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."crm_messages" ADD CONSTRAINT "fk_crm_messages_conversation_id" FOREIGN KEY (conversation_id) REFERENCES crm_conversations(id) ON DELETE SET NULL;
ALTER TABLE public."crm_messages" ADD CONSTRAINT "fk_crm_messages_customer_id" FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL;
ALTER TABLE public."crm_messages" ADD CONSTRAINT "fk_crm_messages_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_needs_attention" ADD CONSTRAINT "crm_needs_attention_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_needs_attention" ADD CONSTRAINT "crm_needs_attention_tenant_id_resolved_by_fkey" FOREIGN KEY (tenant_id, resolved_by) REFERENCES crm_staff(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."crm_notes" ADD CONSTRAINT "fk_crm_notes_order_id" FOREIGN KEY (order_id) REFERENCES erp_orders(id) ON DELETE SET NULL;
ALTER TABLE public."crm_notes" ADD CONSTRAINT "fk_crm_notes_customer_id" FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL;
ALTER TABLE public."crm_notes" ADD CONSTRAINT "fk_crm_notes_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_operating_hours" ADD CONSTRAINT "crm_operating_hours_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_operating_hours" ADD CONSTRAINT "crm_operating_hours_location_id_fkey" FOREIGN KEY (location_id) REFERENCES crm_locations(id) ON DELETE CASCADE;
ALTER TABLE public."crm_permanent_alerts" ADD CONSTRAINT "crm_permanent_alerts_tenant_id_created_by_fkey" FOREIGN KEY (tenant_id, created_by) REFERENCES crm_staff(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."crm_permanent_alerts" ADD CONSTRAINT "crm_permanent_alerts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_pricing_rules" ADD CONSTRAINT "crm_pricing_rules_service_id_fkey" FOREIGN KEY (service_id) REFERENCES crm_services(id) ON DELETE CASCADE;
ALTER TABLE public."crm_pricing_rules" ADD CONSTRAINT "crm_pricing_rules_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_product_recommendations" ADD CONSTRAINT "crm_product_recommendations_catalog_item_id_fk" FOREIGN KEY (catalog_item_id) REFERENCES commerce_catalog_items(id);
ALTER TABLE public."crm_product_recommendations" ADD CONSTRAINT "crm_product_recommendations_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE CASCADE;
ALTER TABLE public."crm_product_recommendations" ADD CONSTRAINT "crm_product_recommendations_recommended_by_fkey" FOREIGN KEY (recommended_by) REFERENCES crm_staff(id) ON DELETE SET NULL;
ALTER TABLE public."crm_product_recommendations" ADD CONSTRAINT "crm_product_recommendations_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_search_index" ADD CONSTRAINT "crm_search_index_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_segment_memberships" ADD CONSTRAINT "fk_crm_segment_memberships_customer_id" FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL;
ALTER TABLE public."crm_segment_memberships" ADD CONSTRAINT "fk_crm_segment_memberships_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_segment_memberships" ADD CONSTRAINT "fk_crm_segment_memberships_segment_id" FOREIGN KEY (segment_id) REFERENCES crm_segments(id) ON DELETE SET NULL;
ALTER TABLE public."crm_segments" ADD CONSTRAINT "fk_crm_segments_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_service_location_availability" ADD CONSTRAINT "crm_service_location_availability_tenant_id_service_id_fkey" FOREIGN KEY (tenant_id, service_id) REFERENCES crm_services(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."crm_service_location_availability" ADD CONSTRAINT "crm_service_location_availability_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_service_location_availability" ADD CONSTRAINT "crm_service_location_availability_tenant_id_location_id_fkey" FOREIGN KEY (tenant_id, location_id) REFERENCES crm_locations(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."crm_service_package_items" ADD CONSTRAINT "crm_service_package_items_package_id_fkey" FOREIGN KEY (package_id) REFERENCES crm_service_packages(id) ON DELETE CASCADE;
ALTER TABLE public."crm_service_package_items" ADD CONSTRAINT "crm_service_package_items_service_id_fkey" FOREIGN KEY (service_id) REFERENCES crm_services(id) ON DELETE CASCADE;
ALTER TABLE public."crm_service_package_items" ADD CONSTRAINT "crm_service_package_items_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_service_packages" ADD CONSTRAINT "crm_service_packages_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_services" ADD CONSTRAINT "crm_services_parent_service_id_fkey" FOREIGN KEY (parent_service_id) REFERENCES crm_services(id) ON DELETE SET NULL;
ALTER TABLE public."crm_services" ADD CONSTRAINT "crm_services_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_settings" ADD CONSTRAINT "crm_settings_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_shift_templates" ADD CONSTRAINT "crm_shift_templates_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_shift_templates" ADD CONSTRAINT "crm_shift_templates_location_id_fkey" FOREIGN KEY (location_id) REFERENCES crm_locations(id) ON DELETE CASCADE;
ALTER TABLE public."crm_staff" ADD CONSTRAINT "crm_staff_tenant_id_default_location_id_fkey" FOREIGN KEY (tenant_id, default_location_id) REFERENCES crm_locations(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."crm_staff" ADD CONSTRAINT "crm_staff_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_staff_availability" ADD CONSTRAINT "crm_staff_availability_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_staff_availability" ADD CONSTRAINT "crm_staff_availability_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES crm_staff(id) ON DELETE CASCADE;
ALTER TABLE public."crm_staff_availability" ADD CONSTRAINT "crm_staff_availability_location_id_fkey" FOREIGN KEY (location_id) REFERENCES crm_locations(id) ON DELETE SET NULL;
ALTER TABLE public."crm_staff_commission_assignments" ADD CONSTRAINT "crm_staff_commission_assignments_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES crm_staff(id) ON DELETE CASCADE;
ALTER TABLE public."crm_staff_commission_assignments" ADD CONSTRAINT "crm_staff_commission_assignments_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES crm_commission_plans(id) ON DELETE RESTRICT;
ALTER TABLE public."crm_staff_commission_assignments" ADD CONSTRAINT "crm_staff_commission_assignments_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_staff_documents" ADD CONSTRAINT "crm_staff_documents_tenant_id_staff_id_fkey" FOREIGN KEY (tenant_id, staff_id) REFERENCES crm_staff(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."crm_staff_documents" ADD CONSTRAINT "crm_staff_documents_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_staff_incident_reports" ADD CONSTRAINT "crm_staff_incident_reports_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_staff_incident_reports" ADD CONSTRAINT "crm_staff_incident_reports_tenant_id_staff_id_fkey" FOREIGN KEY (tenant_id, staff_id) REFERENCES crm_staff(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."crm_staff_incident_reports" ADD CONSTRAINT "crm_staff_incident_reports_tenant_id_created_by_fkey" FOREIGN KEY (tenant_id, created_by) REFERENCES crm_staff(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."crm_staff_performance_notes" ADD CONSTRAINT "crm_staff_performance_notes_tenant_id_staff_id_fkey" FOREIGN KEY (tenant_id, staff_id) REFERENCES crm_staff(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."crm_staff_performance_notes" ADD CONSTRAINT "crm_staff_performance_notes_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_staff_performance_notes" ADD CONSTRAINT "crm_staff_performance_notes_tenant_id_created_by_fkey" FOREIGN KEY (tenant_id, created_by) REFERENCES crm_staff(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."crm_staff_shifts" ADD CONSTRAINT "crm_staff_shifts_location_id_fkey" FOREIGN KEY (location_id) REFERENCES crm_locations(id) ON DELETE SET NULL;
ALTER TABLE public."crm_staff_shifts" ADD CONSTRAINT "crm_staff_shifts_swap_approved_by_fkey" FOREIGN KEY (swap_approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."crm_staff_shifts" ADD CONSTRAINT "crm_staff_shifts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_staff_shifts" ADD CONSTRAINT "crm_staff_shifts_swap_requested_by_fkey" FOREIGN KEY (swap_requested_by) REFERENCES crm_staff(id) ON DELETE SET NULL;
ALTER TABLE public."crm_staff_shifts" ADD CONSTRAINT "crm_staff_shifts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."crm_staff_shifts" ADD CONSTRAINT "crm_staff_shifts_shift_template_id_fkey" FOREIGN KEY (shift_template_id) REFERENCES crm_shift_templates(id) ON DELETE SET NULL;
ALTER TABLE public."crm_staff_shifts" ADD CONSTRAINT "crm_staff_shifts_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES crm_staff(id) ON DELETE CASCADE;
ALTER TABLE public."crm_staff_time_clock_entries" ADD CONSTRAINT "crm_staff_time_clock_entries_tenant_id_staff_id_fkey" FOREIGN KEY (tenant_id, staff_id) REFERENCES crm_staff(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."crm_staff_time_clock_entries" ADD CONSTRAINT "crm_staff_time_clock_entries_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_staff_training_records" ADD CONSTRAINT "crm_staff_training_records_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_staff_training_records" ADD CONSTRAINT "crm_staff_training_records_tenant_id_staff_id_fkey" FOREIGN KEY (tenant_id, staff_id) REFERENCES crm_staff(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."crm_surcharges" ADD CONSTRAINT "crm_surcharges_applies_to_service_id_fkey" FOREIGN KEY (applies_to_service_id) REFERENCES crm_services(id) ON DELETE CASCADE;
ALTER TABLE public."crm_surcharges" ADD CONSTRAINT "crm_surcharges_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_tags" ADD CONSTRAINT "fk_crm_tags_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_tasks" ADD CONSTRAINT "fk_crm_tasks_customer_id" FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL;
ALTER TABLE public."crm_tasks" ADD CONSTRAINT "fk_crm_tasks_lead_id" FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL;
ALTER TABLE public."crm_tasks" ADD CONSTRAINT "fk_crm_tasks_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_time_off_requests" ADD CONSTRAINT "crm_time_off_requests_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES crm_staff(id) ON DELETE CASCADE;
ALTER TABLE public."crm_time_off_requests" ADD CONSTRAINT "crm_time_off_requests_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."crm_time_off_requests" ADD CONSTRAINT "crm_time_off_requests_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."crm_waitlist" ADD CONSTRAINT "crm_waitlist_tenant_id_service_id_fkey" FOREIGN KEY (tenant_id, service_id) REFERENCES crm_services(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."crm_waitlist" ADD CONSTRAINT "crm_waitlist_tenant_id_preferred_staff_id_fkey" FOREIGN KEY (tenant_id, preferred_staff_id) REFERENCES crm_staff(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."crm_waitlist" ADD CONSTRAINT "crm_waitlist_tenant_id_location_id_fkey" FOREIGN KEY (tenant_id, location_id) REFERENCES crm_locations(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."crm_waitlist" ADD CONSTRAINT "crm_waitlist_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."customer_addresses" ADD CONSTRAINT "customer_addresses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."customer_ai_disclosure_acks" ADD CONSTRAINT "customer_ai_disclosure_acks_user_id_fk" FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public."customer_ai_disclosure_acks" ADD CONSTRAINT "customer_ai_disclosure_acks_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."customer_memberships" ADD CONSTRAINT "customer_memberships_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public."customer_memberships" ADD CONSTRAINT "customer_memberships_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."customer_memberships" ADD CONSTRAINT "customer_memberships_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES membership_plans(id) ON DELETE RESTRICT;
ALTER TABLE public."customer_return_requests" ADD CONSTRAINT "customer_return_requests_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."customer_return_requests" ADD CONSTRAINT "customer_return_requests_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."customer_statements" ADD CONSTRAINT "customer_statements_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE public."customer_statements" ADD CONSTRAINT "customer_statements_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."customer_wishlist_items" ADD CONSTRAINT "customer_wishlist_items_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE CASCADE;
ALTER TABLE public."customers" ADD CONSTRAINT "customers_ap_account_id_fkey" FOREIGN KEY (ap_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE public."customers" ADD CONSTRAINT "customers_ar_account_id_fkey" FOREIGN KEY (ar_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE public."customers" ADD CONSTRAINT "customers_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."customers" ADD CONSTRAINT "customers_currency_fkey" FOREIGN KEY (currency) REFERENCES currencies(code);
ALTER TABLE public."design_files" ADD CONSTRAINT "fk_design_files_design_id" FOREIGN KEY (design_id) REFERENCES designs(id) ON DELETE CASCADE;
ALTER TABLE public."design_files" ADD CONSTRAINT "design_files_design_id_fkey" FOREIGN KEY (design_id) REFERENCES designs(id) ON DELETE CASCADE;
ALTER TABLE public."design_publications" ADD CONSTRAINT "design_publications_design_id_fkey" FOREIGN KEY (design_id) REFERENCES designs(id) ON DELETE CASCADE;
ALTER TABLE public."design_publications" ADD CONSTRAINT "design_publications_collection_id_fkey" FOREIGN KEY (collection_id) REFERENCES collections(id);
ALTER TABLE public."design_publications" ADD CONSTRAINT "design_publications_product_variant_id_tenant_id_fkey" FOREIGN KEY (product_variant_id, tenant_id) REFERENCES product_variants(id, tenant_id) ON DELETE CASCADE;
ALTER TABLE public."design_publications" ADD CONSTRAINT "fk_design_publications_design_id" FOREIGN KEY (design_id) REFERENCES designs(id) ON DELETE CASCADE;
ALTER TABLE public."design_publications" ADD CONSTRAINT "fk_design_publications_product_variant_id" FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE CASCADE;
ALTER TABLE public."designs" ADD CONSTRAINT "designs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."dmca_counter_notices" ADD CONSTRAINT "fk_dmca_counter_notices_dmca_details_id" FOREIGN KEY (dmca_details_id) REFERENCES dmca_details(id) ON DELETE SET NULL;
ALTER TABLE public."dmca_counter_notices" ADD CONSTRAINT "fk_dmca_counter_notices_ticket_id" FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE SET NULL;
ALTER TABLE public."dmca_counter_notices" ADD CONSTRAINT "fk_dmca_counter_notices_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."dmca_details" ADD CONSTRAINT "fk_dmca_details_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."dmca_details" ADD CONSTRAINT "fk_dmca_details_ticket_id" FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE SET NULL;
ALTER TABLE public."dmca_strikes" ADD CONSTRAINT "fk_dmca_strikes_ticket_id" FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE SET NULL;
ALTER TABLE public."dmca_strikes" ADD CONSTRAINT "fk_dmca_strikes_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."dmca_takedown_log" ADD CONSTRAINT "fk_dmca_takedown_log_dmca_details_id" FOREIGN KEY (dmca_details_id) REFERENCES dmca_details(id) ON DELETE SET NULL;
ALTER TABLE public."dmca_takedown_log" ADD CONSTRAINT "fk_dmca_takedown_log_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."dmca_takedown_log" ADD CONSTRAINT "fk_dmca_takedown_log_ticket_id" FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE SET NULL;
ALTER TABLE public."dropship_pipe_attempts" ADD CONSTRAINT "dropship_pipe_attempts_supplier_order_id_fkey" FOREIGN KEY (supplier_order_id) REFERENCES commerce_supplier_orders(id);
ALTER TABLE public."email_messages" ADD CONSTRAINT "email_messages_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."employee_notifications" ADD CONSTRAINT "employee_notifications_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."employee_notifications" ADD CONSTRAINT "employee_notifications_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES crm_staff(id);
ALTER TABLE public."erp_audit_log" ADD CONSTRAINT "erp_audit_log_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."erp_audit_log" ADD CONSTRAINT "erp_audit_log_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_carriers" ADD CONSTRAINT "erp_carriers_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_document_sequences" ADD CONSTRAINT "erp_document_sequences_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_fulfillment_lines" ADD CONSTRAINT "fk_erp_fulfillment_lines_order_line_id" FOREIGN KEY (order_line_id) REFERENCES erp_order_lines(id) ON DELETE SET NULL;
ALTER TABLE public."erp_fulfillment_lines" ADD CONSTRAINT "fk_erp_fulfillment_lines_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_fulfillment_orders" ADD CONSTRAINT "fk_erp_fulfillment_orders_order_id" FOREIGN KEY (order_id) REFERENCES erp_orders(id) ON DELETE SET NULL;
ALTER TABLE public."erp_fulfillment_orders" ADD CONSTRAINT "fk_erp_fulfillment_orders_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_fulfillment_orders" ADD CONSTRAINT "fk_erp_fulfillment_orders_warehouse_id" FOREIGN KEY (warehouse_id) REFERENCES erp_warehouses(id) ON DELETE SET NULL;
ALTER TABLE public."erp_goods_receipt_lines" ADD CONSTRAINT "erp_goods_receipt_lines_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_goods_receipt_lines" ADD CONSTRAINT "erp_goods_receipt_lines_tenant_id_sku_id_fkey" FOREIGN KEY (tenant_id, sku_id) REFERENCES erp_product_skus(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."erp_goods_receipt_lines" ADD CONSTRAINT "erp_goods_receipt_lines_tenant_id_receipt_id_fkey" FOREIGN KEY (tenant_id, receipt_id) REFERENCES erp_goods_receipts(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."erp_goods_receipts" ADD CONSTRAINT "erp_goods_receipts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_goods_receipts" ADD CONSTRAINT "erp_goods_receipts_received_by_fkey" FOREIGN KEY (received_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."erp_idempotency_keys" ADD CONSTRAINT "erp_idempotency_keys_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_inventory_balances" ADD CONSTRAINT "fk_erp_inventory_balances_warehouse_id" FOREIGN KEY (warehouse_id) REFERENCES erp_warehouses(id) ON DELETE SET NULL;
ALTER TABLE public."erp_inventory_balances" ADD CONSTRAINT "fk_erp_inventory_balances_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_inventory_balances" ADD CONSTRAINT "fk_erp_inventory_balances_location_id" FOREIGN KEY (location_id) REFERENCES erp_warehouse_locations(id) ON DELETE SET NULL;
ALTER TABLE public."erp_inventory_cost_layers" ADD CONSTRAINT "erp_inventory_cost_layers_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_inventory_cost_layers" ADD CONSTRAINT "erp_inventory_cost_layers_tenant_id_sku_id_fkey" FOREIGN KEY (tenant_id, sku_id) REFERENCES erp_product_skus(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."erp_inventory_count_lines" ADD CONSTRAINT "erp_inventory_count_lines_counted_by_fkey" FOREIGN KEY (counted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."erp_inventory_count_lines" ADD CONSTRAINT "erp_inventory_count_lines_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_inventory_count_lines" ADD CONSTRAINT "erp_inventory_count_lines_tenant_id_count_session_id_fkey" FOREIGN KEY (tenant_id, count_session_id) REFERENCES erp_inventory_count_sessions(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."erp_inventory_count_lines" ADD CONSTRAINT "erp_inventory_count_lines_tenant_id_sku_id_fkey" FOREIGN KEY (tenant_id, sku_id) REFERENCES erp_product_skus(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."erp_inventory_count_sessions" ADD CONSTRAINT "erp_inventory_count_sessions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_inventory_count_sessions" ADD CONSTRAINT "erp_inventory_count_sessions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."erp_inventory_lots" ADD CONSTRAINT "fk_erp_inventory_lots_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_inventory_movements" ADD CONSTRAINT "fk_erp_inventory_movements_to_location_id" FOREIGN KEY (to_location_id) REFERENCES erp_warehouse_locations(id) ON DELETE SET NULL;
ALTER TABLE public."erp_inventory_movements" ADD CONSTRAINT "fk_erp_inventory_movements_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_inventory_movements" ADD CONSTRAINT "fk_erp_inventory_movements_lot_id" FOREIGN KEY (lot_id) REFERENCES erp_inventory_lots(id) ON DELETE SET NULL;
ALTER TABLE public."erp_inventory_movements" ADD CONSTRAINT "fk_erp_inventory_movements_warehouse_id" FOREIGN KEY (warehouse_id) REFERENCES erp_warehouses(id) ON DELETE SET NULL;
ALTER TABLE public."erp_inventory_movements" ADD CONSTRAINT "fk_erp_inventory_movements_from_location_id" FOREIGN KEY (from_location_id) REFERENCES erp_warehouse_locations(id) ON DELETE SET NULL;
ALTER TABLE public."erp_inventory_reservations" ADD CONSTRAINT "erp_inventory_reservations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."erp_inventory_reservations" ADD CONSTRAINT "erp_inventory_reservations_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_inventory_reservations" ADD CONSTRAINT "erp_inventory_reservations_tenant_id_sku_id_fkey" FOREIGN KEY (tenant_id, sku_id) REFERENCES erp_product_skus(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."erp_inventory_serial_numbers" ADD CONSTRAINT "erp_inventory_serial_numbers_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_inventory_serial_numbers" ADD CONSTRAINT "erp_inventory_serial_numbers_tenant_id_sku_id_fkey" FOREIGN KEY (tenant_id, sku_id) REFERENCES erp_product_skus(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."erp_inventory_transactions" ADD CONSTRAINT "fk_erp_inventory_transactions_warehouse_id" FOREIGN KEY (warehouse_id) REFERENCES erp_warehouses(id) ON DELETE SET NULL;
ALTER TABLE public."erp_inventory_transactions" ADD CONSTRAINT "fk_erp_inventory_transactions_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_inventory_transfer_lines" ADD CONSTRAINT "erp_inventory_transfer_lines_tenant_id_transfer_id_fkey" FOREIGN KEY (tenant_id, transfer_id) REFERENCES erp_inventory_transfers(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."erp_inventory_transfer_lines" ADD CONSTRAINT "erp_inventory_transfer_lines_tenant_id_sku_id_fkey" FOREIGN KEY (tenant_id, sku_id) REFERENCES erp_product_skus(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."erp_inventory_transfer_lines" ADD CONSTRAINT "erp_inventory_transfer_lines_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_inventory_transfers" ADD CONSTRAINT "erp_inventory_transfers_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."erp_inventory_transfers" ADD CONSTRAINT "erp_inventory_transfers_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_order_addresses" ADD CONSTRAINT "fk_erp_order_addresses_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_order_addresses" ADD CONSTRAINT "fk_erp_order_addresses_order_id" FOREIGN KEY (order_id) REFERENCES erp_orders(id) ON DELETE SET NULL;
ALTER TABLE public."erp_order_lines" ADD CONSTRAINT "erp_order_lines_supplier_catalog_variant_id_fkey" FOREIGN KEY (supplier_catalog_variant_id) REFERENCES supplier_catalog_variants(id) ON DELETE SET NULL;
ALTER TABLE public."erp_order_lines" ADD CONSTRAINT "fk_erp_order_lines_order_id" FOREIGN KEY (order_id) REFERENCES erp_orders(id) ON DELETE SET NULL;
ALTER TABLE public."erp_order_lines" ADD CONSTRAINT "fk_erp_order_lines_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_order_lines" ADD CONSTRAINT "fk_erp_order_lines_sku_id" FOREIGN KEY (sku_id) REFERENCES product_variants(id) ON DELETE RESTRICT;
ALTER TABLE public."erp_order_notes" ADD CONSTRAINT "fk_erp_order_notes_order_id" FOREIGN KEY (order_id) REFERENCES erp_orders(id) ON DELETE SET NULL;
ALTER TABLE public."erp_order_notes" ADD CONSTRAINT "fk_erp_order_notes_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_order_status_history" ADD CONSTRAINT "fk_erp_order_status_history_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_order_status_history" ADD CONSTRAINT "fk_erp_order_status_history_order_id" FOREIGN KEY (order_id) REFERENCES erp_orders(id) ON DELETE SET NULL;
ALTER TABLE public."erp_orders" ADD CONSTRAINT "fk_erp_orders_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_package_items" ADD CONSTRAINT "erp_package_items_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_package_items" ADD CONSTRAINT "erp_package_items_tenant_id_sku_id_fkey" FOREIGN KEY (tenant_id, sku_id) REFERENCES erp_product_skus(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."erp_package_items" ADD CONSTRAINT "erp_package_items_tenant_id_package_id_fkey" FOREIGN KEY (tenant_id, package_id) REFERENCES erp_packages(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."erp_packages" ADD CONSTRAINT "erp_packages_packed_by_fkey" FOREIGN KEY (packed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."erp_packages" ADD CONSTRAINT "erp_packages_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_pick_task_lines" ADD CONSTRAINT "erp_pick_task_lines_tenant_id_sku_id_fkey" FOREIGN KEY (tenant_id, sku_id) REFERENCES erp_product_skus(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."erp_pick_task_lines" ADD CONSTRAINT "erp_pick_task_lines_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_pick_task_lines" ADD CONSTRAINT "erp_pick_task_lines_tenant_id_pick_task_id_fkey" FOREIGN KEY (tenant_id, pick_task_id) REFERENCES erp_pick_tasks(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."erp_pick_tasks" ADD CONSTRAINT "erp_pick_tasks_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_pick_tasks" ADD CONSTRAINT "erp_pick_tasks_tenant_id_wave_id_fkey" FOREIGN KEY (tenant_id, wave_id) REFERENCES erp_pick_waves(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."erp_pick_tasks" ADD CONSTRAINT "erp_pick_tasks_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."erp_pick_waves" ADD CONSTRAINT "erp_pick_waves_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_pick_waves" ADD CONSTRAINT "erp_pick_waves_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."erp_product_barcodes" ADD CONSTRAINT "erp_product_barcodes_tenant_id_sku_id_fkey" FOREIGN KEY (tenant_id, sku_id) REFERENCES erp_product_skus(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."erp_product_barcodes" ADD CONSTRAINT "erp_product_barcodes_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_product_categories" ADD CONSTRAINT "erp_product_categories_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES erp_product_categories(id) ON DELETE SET NULL;
ALTER TABLE public."erp_product_categories" ADD CONSTRAINT "erp_product_categories_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_product_skus" ADD CONSTRAINT "erp_product_skus_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_product_skus" ADD CONSTRAINT "erp_product_skus_tenant_id_variant_id_fkey" FOREIGN KEY (tenant_id, variant_id) REFERENCES erp_product_variants(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."erp_product_skus" ADD CONSTRAINT "erp_product_skus_tenant_id_product_id_fkey" FOREIGN KEY (tenant_id, product_id) REFERENCES erp_products(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."erp_product_variants" ADD CONSTRAINT "erp_product_variants_tenant_id_product_id_fkey" FOREIGN KEY (tenant_id, product_id) REFERENCES erp_products(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."erp_product_variants" ADD CONSTRAINT "erp_product_variants_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_products" ADD CONSTRAINT "erp_products_category_id_fkey" FOREIGN KEY (category_id) REFERENCES erp_product_categories(id) ON DELETE SET NULL;
ALTER TABLE public."erp_products" ADD CONSTRAINT "erp_products_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_purchase_order_lines" ADD CONSTRAINT "erp_purchase_order_lines_purchase_order_id_fkey" FOREIGN KEY (purchase_order_id) REFERENCES erp_purchase_orders(id) ON DELETE CASCADE;
ALTER TABLE public."erp_purchase_orders" ADD CONSTRAINT "erp_purchase_orders_ap_bill_id_fkey" FOREIGN KEY (ap_bill_id) REFERENCES acct_ap_bills(id);
ALTER TABLE public."erp_purchase_orders" ADD CONSTRAINT "erp_purchase_orders_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES acct_vendors(id);
ALTER TABLE public."erp_replenishment_recommendations" ADD CONSTRAINT "erp_replenishment_recommendations_tenant_id_sku_id_fkey" FOREIGN KEY (tenant_id, sku_id) REFERENCES erp_product_skus(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."erp_replenishment_recommendations" ADD CONSTRAINT "erp_replenishment_recommendations_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_replenishment_recommendations" ADD CONSTRAINT "erp_replenishment_recommendations_tenant_id_vendor_id_fkey" FOREIGN KEY (tenant_id, vendor_id) REFERENCES erp_vendors(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."erp_replenishment_rules" ADD CONSTRAINT "fk_erp_replenishment_rules_warehouse_id" FOREIGN KEY (warehouse_id) REFERENCES erp_warehouses(id) ON DELETE SET NULL;
ALTER TABLE public."erp_replenishment_rules" ADD CONSTRAINT "fk_erp_replenishment_rules_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_return_authorizations" ADD CONSTRAINT "fk_erp_return_authorizations_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_return_authorizations" ADD CONSTRAINT "fk_erp_return_authorizations_order_id" FOREIGN KEY (order_id) REFERENCES erp_orders(id) ON DELETE SET NULL;
ALTER TABLE public."erp_return_inspections" ADD CONSTRAINT "erp_return_inspections_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_return_inspections" ADD CONSTRAINT "erp_return_inspections_inspected_by_fkey" FOREIGN KEY (inspected_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."erp_return_lines" ADD CONSTRAINT "fk_erp_return_lines_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_return_lines" ADD CONSTRAINT "fk_erp_return_lines_order_line_id" FOREIGN KEY (order_line_id) REFERENCES erp_order_lines(id) ON DELETE SET NULL;
ALTER TABLE public."erp_return_lines" ADD CONSTRAINT "fk_erp_return_lines_rma_id" FOREIGN KEY (rma_id) REFERENCES erp_return_authorizations(id) ON DELETE SET NULL;
ALTER TABLE public."erp_return_refunds" ADD CONSTRAINT "erp_return_refunds_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_shipment_packages" ADD CONSTRAINT "fk_erp_shipment_packages_shipment_id" FOREIGN KEY (shipment_id) REFERENCES erp_shipments(id) ON DELETE SET NULL;
ALTER TABLE public."erp_shipment_packages" ADD CONSTRAINT "fk_erp_shipment_packages_package_id" FOREIGN KEY (package_id) REFERENCES erp_shipment_packages(id) ON DELETE SET NULL;
ALTER TABLE public."erp_shipment_packages" ADD CONSTRAINT "fk_erp_shipment_packages_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_shipments" ADD CONSTRAINT "fk_erp_shipments_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_shipping_methods" ADD CONSTRAINT "erp_shipping_methods_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_shipping_methods" ADD CONSTRAINT "erp_shipping_methods_tenant_id_carrier_id_fkey" FOREIGN KEY (tenant_id, carrier_id) REFERENCES erp_carriers(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."erp_stock_levels" ADD CONSTRAINT "fk_erp_stock_levels_location_id" FOREIGN KEY (location_id) REFERENCES erp_warehouse_locations(id) ON DELETE SET NULL;
ALTER TABLE public."erp_stock_levels" ADD CONSTRAINT "fk_erp_stock_levels_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_stock_levels" ADD CONSTRAINT "fk_erp_stock_levels_warehouse_id" FOREIGN KEY (warehouse_id) REFERENCES erp_warehouses(id) ON DELETE SET NULL;
ALTER TABLE public."erp_tracking_events" ADD CONSTRAINT "erp_tracking_events_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_uom_conversions" ADD CONSTRAINT "erp_uom_conversions_tenant_id_sku_id_fkey" FOREIGN KEY (tenant_id, sku_id) REFERENCES erp_product_skus(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."erp_uom_conversions" ADD CONSTRAINT "erp_uom_conversions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_vendor_items" ADD CONSTRAINT "erp_vendor_items_tenant_id_sku_id_fkey" FOREIGN KEY (tenant_id, sku_id) REFERENCES erp_product_skus(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."erp_vendor_items" ADD CONSTRAINT "erp_vendor_items_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_vendor_items" ADD CONSTRAINT "erp_vendor_items_tenant_id_vendor_id_fkey" FOREIGN KEY (tenant_id, vendor_id) REFERENCES erp_vendors(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."erp_vendors" ADD CONSTRAINT "erp_vendors_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_warehouse_locations" ADD CONSTRAINT "fk_erp_warehouse_locations_warehouse_id" FOREIGN KEY (warehouse_id) REFERENCES erp_warehouses(id) ON DELETE SET NULL;
ALTER TABLE public."erp_warehouse_locations" ADD CONSTRAINT "fk_erp_warehouse_locations_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_warehouse_locations" ADD CONSTRAINT "fk_erp_warehouse_locations_zone_id" FOREIGN KEY (zone_id) REFERENCES erp_warehouse_zones(id) ON DELETE SET NULL;
ALTER TABLE public."erp_warehouse_locations" ADD CONSTRAINT "fk_erp_warehouse_locations_parent_location_id" FOREIGN KEY (parent_location_id) REFERENCES erp_warehouse_locations(id) ON DELETE SET NULL;
ALTER TABLE public."erp_warehouse_zones" ADD CONSTRAINT "fk_erp_warehouse_zones_warehouse_id" FOREIGN KEY (warehouse_id) REFERENCES erp_warehouses(id) ON DELETE SET NULL;
ALTER TABLE public."erp_warehouse_zones" ADD CONSTRAINT "fk_erp_warehouse_zones_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."erp_warehouses" ADD CONSTRAINT "fk_erp_warehouses_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."estimate_items" ADD CONSTRAINT "estimate_items_tax_id_fkey" FOREIGN KEY (tax_id) REFERENCES taxes(id);
ALTER TABLE public."estimate_items" ADD CONSTRAINT "estimate_items_account_id_fkey" FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE public."estimate_items" ADD CONSTRAINT "estimate_items_estimate_id_fkey" FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE;
ALTER TABLE public."estimates" ADD CONSTRAINT "estimates_currency_fkey" FOREIGN KEY (currency) REFERENCES currencies(code);
ALTER TABLE public."estimates" ADD CONSTRAINT "estimates_converted_invoice_id_fkey" FOREIGN KEY (converted_invoice_id) REFERENCES invoices(id);
ALTER TABLE public."estimates" ADD CONSTRAINT "estimates_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
ALTER TABLE public."estimates" ADD CONSTRAINT "estimates_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."faqs" ADD CONSTRAINT "faqs_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."faqs" ADD CONSTRAINT "faqs_node_id_fk" FOREIGN KEY (node_id) REFERENCES taxonomy_nodes(id);
ALTER TABLE public."feedback_submissions" ADD CONSTRAINT "feedback_submissions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."feedback_submissions" ADD CONSTRAINT "feedback_submissions_support_ticket_id_fkey" FOREIGN KEY (support_ticket_id) REFERENCES support_tickets(id);
ALTER TABLE public."fsm_child_instances" ADD CONSTRAINT "fsm_child_instances_case_id_fkey" FOREIGN KEY (case_id) REFERENCES onboarding_cases(id) ON DELETE CASCADE;
ALTER TABLE public."fulfillment_items" ADD CONSTRAINT "fulfillment_items_fulfillment_order_id_tenant_id_fkey" FOREIGN KEY (fulfillment_order_id, tenant_id) REFERENCES fulfillment_orders(id, tenant_id) ON DELETE CASCADE;
ALTER TABLE public."fulfillment_items" ADD CONSTRAINT "fulfillment_items_order_item_id_fkey" FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE;
ALTER TABLE public."fulfillment_label_attempts" ADD CONSTRAINT "fulfillment_label_attempts_package_id_fkey" FOREIGN KEY (package_id) REFERENCES fulfillment_packages(id) ON DELETE CASCADE;
ALTER TABLE public."fulfillment_label_attempts" ADD CONSTRAINT "fulfillment_label_attempts_order_id_fkey" FOREIGN KEY (order_id) REFERENCES commerce_orders(id) ON DELETE CASCADE;
ALTER TABLE public."fulfillment_orders" ADD CONSTRAINT "fulfillment_orders_order_id_tenant_id_fkey" FOREIGN KEY (order_id, tenant_id) REFERENCES orders(id, tenant_id) ON DELETE CASCADE;
ALTER TABLE public."fulfillment_orders" ADD CONSTRAINT "fulfillment_orders_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."fulfillment_orders" ADD CONSTRAINT "fulfillment_orders_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE;
ALTER TABLE public."fulfillment_orders" ADD CONSTRAINT "fulfillment_orders_route_id_fkey" FOREIGN KEY (route_id) REFERENCES variant_fulfillment_routes(id);
ALTER TABLE public."fulfillment_package_lines" ADD CONSTRAINT "fulfillment_package_lines_package_id_fkey" FOREIGN KEY (package_id) REFERENCES fulfillment_packages(id) ON DELETE CASCADE;
ALTER TABLE public."fulfillment_package_lines" ADD CONSTRAINT "fulfillment_package_lines_order_item_id_fkey" FOREIGN KEY (order_item_id) REFERENCES commerce_order_items(id) ON DELETE CASCADE;
ALTER TABLE public."fulfillment_packages" ADD CONSTRAINT "fulfillment_packages_order_id_fkey" FOREIGN KEY (order_id) REFERENCES commerce_orders(id) ON DELETE CASCADE;
ALTER TABLE public."fulfillment_packages" ADD CONSTRAINT "fulfillment_packages_seller_order_id_fkey" FOREIGN KEY (seller_order_id) REFERENCES commerce_orders(id) ON DELETE SET NULL;
ALTER TABLE public."gallery_photos" ADD CONSTRAINT "gallery_photos_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_po_line_id_fkey" FOREIGN KEY (po_line_id) REFERENCES purchase_order_lines(id);
ALTER TABLE public."goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_goods_receipt_id_fkey" FOREIGN KEY (goods_receipt_id) REFERENCES goods_receipts(id) ON DELETE CASCADE;
ALTER TABLE public."goods_receipts" ADD CONSTRAINT "goods_receipts_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id);
ALTER TABLE public."goods_receipts" ADD CONSTRAINT "goods_receipts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_fkey" FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id);
ALTER TABLE public."inventory_items" ADD CONSTRAINT "fk_inventory_items_supplier_id" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE public."inventory_items" ADD CONSTRAINT "fk_inventory_items_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."inventory_items" ADD CONSTRAINT "fk_inventory_items_product_variant_id" FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE public."inventory_items" ADD CONSTRAINT "fk_inventory_items_supplier_catalog_variant_id" FOREIGN KEY (supplier_catalog_variant_id) REFERENCES supplier_catalog_variants(id) ON DELETE SET NULL;
ALTER TABLE public."inventory_items" ADD CONSTRAINT "fk_inventory_items_supplier_catalog_product_id" FOREIGN KEY (supplier_catalog_product_id) REFERENCES supplier_catalog_products(id) ON DELETE SET NULL;
ALTER TABLE public."inventory_items" ADD CONSTRAINT "fk_inventory_items_account_id" FOREIGN KEY (account_id) REFERENCES acct_chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE public."inventory_levels" ADD CONSTRAINT "fk_inventory_levels_location_id" FOREIGN KEY (location_id) REFERENCES erp_warehouse_locations(id) ON DELETE SET NULL;
ALTER TABLE public."inventory_levels" ADD CONSTRAINT "fk_inventory_levels_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."inventory_transactions" ADD CONSTRAINT "fk_inventory_transactions_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."inventory_transactions" ADD CONSTRAINT "fk_inventory_transactions_journal_id" FOREIGN KEY (journal_id) REFERENCES acct_journal_entries(id) ON DELETE SET NULL;
ALTER TABLE public."invoice_items" ADD CONSTRAINT "invoice_items_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."invoices" ADD CONSTRAINT "invoices_currency_fkey" FOREIGN KEY (currency) REFERENCES currencies(code);
ALTER TABLE public."invoices" ADD CONSTRAINT "invoices_tax_id_fkey" FOREIGN KEY (tax_id) REFERENCES taxes(id) ON DELETE SET NULL;
ALTER TABLE public."invoices" ADD CONSTRAINT "invoices_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."invoices" ADD CONSTRAINT "invoices_ar_account_id_fkey" FOREIGN KEY (ar_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE public."journal_entries" ADD CONSTRAINT "journal_entries_currency_fkey" FOREIGN KEY (currency) REFERENCES currencies(code);
ALTER TABLE public."journal_entries" ADD CONSTRAINT "journal_entries_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey" FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public."journal_lines" ADD CONSTRAINT "journal_lines_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."journal_lines" ADD CONSTRAINT "journal_lines_tax_id_fkey" FOREIGN KEY (tax_id) REFERENCES taxes(id) ON DELETE SET NULL;
ALTER TABLE public."journal_lines" ADD CONSTRAINT "journal_lines_journal_id_fkey" FOREIGN KEY (journal_id) REFERENCES journal_entries(id) ON DELETE CASCADE;
ALTER TABLE public."journal_lines" ADD CONSTRAINT "journal_lines_fc_currency_fkey" FOREIGN KEY (fc_currency) REFERENCES currencies(code);
ALTER TABLE public."jurisdiction_rules" ADD CONSTRAINT "jurisdiction_rules_jurisdiction_fk" FOREIGN KEY (jurisdiction) REFERENCES state_rules(jurisdiction);
ALTER TABLE public."licensee_advertisers" ADD CONSTRAINT "licensee_advertisers_ad_advertiser_id_fkey" FOREIGN KEY (ad_advertiser_id) REFERENCES ad_advertisers(id);
ALTER TABLE public."licensee_api_keys" ADD CONSTRAINT "licensee_api_keys_advertiser_id_fkey" FOREIGN KEY (advertiser_id) REFERENCES licensee_advertisers(id) ON DELETE CASCADE;
ALTER TABLE public."licensee_creative_designs" ADD CONSTRAINT "licensee_creative_designs_creative_id_fkey" FOREIGN KEY (creative_id) REFERENCES ad_creatives(id) ON DELETE SET NULL;
ALTER TABLE public."licensee_creative_designs" ADD CONSTRAINT "licensee_creative_designs_advertiser_id_fkey" FOREIGN KEY (advertiser_id) REFERENCES licensee_advertisers(id) ON DELETE CASCADE;
ALTER TABLE public."licensee_creative_designs" ADD CONSTRAINT "licensee_creative_designs_product_id_fkey" FOREIGN KEY (product_id) REFERENCES supplier_catalog_products(id) ON DELETE SET NULL;
ALTER TABLE public."licensee_creative_designs" ADD CONSTRAINT "licensee_creative_designs_campaign_id_fkey" FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE SET NULL;
ALTER TABLE public."location_hour_exceptions" ADD CONSTRAINT "location_hour_exceptions_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE;
ALTER TABLE public."location_hours" ADD CONSTRAINT "location_hours_location_id_fkey" FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE;
ALTER TABLE public."locations" ADD CONSTRAINT "locations_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."locations" ADD CONSTRAINT "fk_locations_seller" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."membership_plans" ADD CONSTRAINT "membership_plans_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."merchandising_modules" ADD CONSTRAINT "merchandising_modules_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."message_flags" ADD CONSTRAINT "message_flags_message_id_fkey" FOREIGN KEY (message_id) REFERENCES crm_messages(id);
ALTER TABLE public."message_flags" ADD CONSTRAINT "message_flags_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."newsletter" ADD CONSTRAINT "newsletter_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."node_associations" ADD CONSTRAINT "node_associations_source_node_id_fkey" FOREIGN KEY (source_node_id) REFERENCES taxonomy_nodes(id) ON DELETE CASCADE;
ALTER TABLE public."node_associations" ADD CONSTRAINT "node_associations_target_node_id_fkey" FOREIGN KEY (target_node_id) REFERENCES taxonomy_nodes(id) ON DELETE CASCADE;
ALTER TABLE public."node_filter_values" ADD CONSTRAINT "node_filter_values_node_filter_id_fkey" FOREIGN KEY (node_filter_id) REFERENCES node_filters(id) ON DELETE CASCADE;
ALTER TABLE public."node_filter_values" ADD CONSTRAINT "node_filter_values_attribute_value_id_fkey" FOREIGN KEY (attribute_value_id) REFERENCES attribute_values(id);
ALTER TABLE public."node_filters" ADD CONSTRAINT "node_filters_node_id_fkey" FOREIGN KEY (node_id) REFERENCES taxonomy_nodes(id) ON DELETE CASCADE;
ALTER TABLE public."node_filters" ADD CONSTRAINT "node_filters_attribute_id_fkey" FOREIGN KEY (attribute_id) REFERENCES attributes(id);
ALTER TABLE public."offers" ADD CONSTRAINT "offers_variant_id_fkey" FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE;
ALTER TABLE public."offers" ADD CONSTRAINT "offers_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."offers" ADD CONSTRAINT "offers_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."offers" ADD CONSTRAINT "offers_variant_id_fk" FOREIGN KEY (variant_id) REFERENCES erp_product_variants(id);
ALTER TABLE public."onboarding_cases" ADD CONSTRAINT "onboarding_cases_user_id_fk" FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public."onboarding_cases" ADD CONSTRAINT "onboarding_cases_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."onboarding_events" ADD CONSTRAINT "onboarding_events_case_id_fkey" FOREIGN KEY (case_id) REFERENCES onboarding_cases(id) ON DELETE CASCADE;
ALTER TABLE public."onboarding_gates" ADD CONSTRAINT "onboarding_gates_case_id_fkey" FOREIGN KEY (case_id) REFERENCES onboarding_cases(id) ON DELETE CASCADE;
ALTER TABLE public."order_customers" ADD CONSTRAINT "order_customers_auth_user_fk" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."order_customers" ADD CONSTRAINT "order_customers_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."order_items" ADD CONSTRAINT "order_items_supplier_catalog_variant_id_fkey" FOREIGN KEY (supplier_catalog_variant_id) REFERENCES supplier_catalog_variants(id) ON DELETE SET NULL;
ALTER TABLE public."order_items" ADD CONSTRAINT "order_items_order_id_tenant_id_fkey" FOREIGN KEY (order_id, tenant_id) REFERENCES orders(id, tenant_id) ON DELETE CASCADE;
ALTER TABLE public."order_items" ADD CONSTRAINT "order_items_product_variant_id_tenant_id_fkey" FOREIGN KEY (product_variant_id, tenant_id) REFERENCES product_variants(id, tenant_id);
ALTER TABLE public."order_shipping_estimates" ADD CONSTRAINT "order_shipping_estimates_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE public."order_shipping_estimates" ADD CONSTRAINT "order_shipping_estimates_shipping_profile_id_fkey" FOREIGN KEY (shipping_profile_id) REFERENCES shipping_profiles(id) ON DELETE SET NULL;
ALTER TABLE public."order_shipping_estimates" ADD CONSTRAINT "order_shipping_estimates_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."orders" ADD CONSTRAINT "orders_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."orders" ADD CONSTRAINT "orders_shipping_estimate_id_fkey" FOREIGN KEY (shipping_estimate_id) REFERENCES order_shipping_estimates(id) ON DELETE SET NULL;
ALTER TABLE public."page_components" ADD CONSTRAINT "page_components_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."partner_application_documents" ADD CONSTRAINT "partner_application_documents_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."partner_application_documents" ADD CONSTRAINT "partner_application_documents_seller_id_fk" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."partner_pushes" ADD CONSTRAINT "partner_pushes_portal_id_fkey" FOREIGN KEY (portal_id) REFERENCES partner_portals(id) ON DELETE CASCADE;
ALTER TABLE public."partner_pushes" ADD CONSTRAINT "partner_pushes_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public."payment_transactions" ADD CONSTRAINT "payment_transactions_ar_account_id_fkey" FOREIGN KEY (ar_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE public."payment_transactions" ADD CONSTRAINT "payment_transactions_deposit_account_id_fkey" FOREIGN KEY (deposit_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL;
ALTER TABLE public."payment_transactions" ADD CONSTRAINT "payment_transactions_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."payroll_employees" ADD CONSTRAINT "payroll_employees_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES staff(id);
ALTER TABLE public."payroll_employees" ADD CONSTRAINT "payroll_employees_wage_account_id_fkey" FOREIGN KEY (wage_account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE public."payroll_employees" ADD CONSTRAINT "payroll_employees_tax_payable_account_id_fkey" FOREIGN KEY (tax_payable_account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE public."payroll_employees" ADD CONSTRAINT "payroll_employees_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."payroll_run_items" ADD CONSTRAINT "payroll_run_items_timesheet_id_fkey" FOREIGN KEY (timesheet_id) REFERENCES payroll_timesheets(id);
ALTER TABLE public."payroll_run_items" ADD CONSTRAINT "payroll_run_items_payroll_run_id_fkey" FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE;
ALTER TABLE public."payroll_run_items" ADD CONSTRAINT "payroll_run_items_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES payroll_employees(id) ON DELETE CASCADE;
ALTER TABLE public."payroll_runs" ADD CONSTRAINT "payroll_runs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."payroll_runs" ADD CONSTRAINT "payroll_runs_journal_id_fkey" FOREIGN KEY (journal_id) REFERENCES journal_entries(id);
ALTER TABLE public."payroll_tax_forms" ADD CONSTRAINT "payroll_tax_forms_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."payroll_timesheets" ADD CONSTRAINT "payroll_timesheets_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES payroll_employees(id) ON DELETE CASCADE;
ALTER TABLE public."payroll_timesheets" ADD CONSTRAINT "payroll_timesheets_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."perk_ledger" ADD CONSTRAINT "perk_ledger_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."perk_ledger" ADD CONSTRAINT "perk_ledger_user_id_fk" FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public."perk_rules" ADD CONSTRAINT "perk_rules_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."platform_account_subscriptions" ADD CONSTRAINT "platform_account_subscriptions_offer_fk" FOREIGN KEY (tenant_id, offer_id) REFERENCES platform_subscription_offers(tenant_id, id);
ALTER TABLE public."platform_admin_access_log" ADD CONSTRAINT "platform_admin_access_log_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."platform_admin_access_log" ADD CONSTRAINT "platform_admin_access_log_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."platform_admins" ADD CONSTRAINT "fk_platform_admins_user_id" FOREIGN KEY (user_id) REFERENCES portal_users(id) ON DELETE SET NULL;
ALTER TABLE public."platform_admins" ADD CONSTRAINT "fk_platform_admins_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."platform_backups" ADD CONSTRAINT "platform_backups_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."platform_backups" ADD CONSTRAINT "platform_backups_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."platform_capabilities" ADD CONSTRAINT "platform_capabilities_object_code_fkey" FOREIGN KEY (object_code) REFERENCES platform_objects(object_code);
ALTER TABLE public."platform_customer_identity_links" ADD CONSTRAINT "platform_customer_identity_links_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."platform_integration_health_registry" ADD CONSTRAINT "platform_integration_health_registry_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."platform_lens_fields" ADD CONSTRAINT "platform_lens_fields_lens_code_fkey" FOREIGN KEY (lens_code) REFERENCES platform_lenses(lens_code) ON DELETE CASCADE;
ALTER TABLE public."platform_lens_labels" ADD CONSTRAINT "platform_lens_labels_lens_code_fkey" FOREIGN KEY (lens_code) REFERENCES platform_lenses(lens_code) ON DELETE CASCADE;
ALTER TABLE public."platform_lenses" ADD CONSTRAINT "platform_lenses_object_code_fkey" FOREIGN KEY (object_code) REFERENCES platform_objects(object_code);
ALTER TABLE public."platform_module_permissions" ADD CONSTRAINT "fk_platform_module_permissions_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."platform_permission_registry" ADD CONSTRAINT "fk_platform_permission_registry_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."platform_quick_links" ADD CONSTRAINT "platform_quick_links_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."platform_quick_links" ADD CONSTRAINT "platform_quick_links_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."platform_role_values" ADD CONSTRAINT "fk_platform_role_values_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."platform_tools" ADD CONSTRAINT "platform_tools_capability_code_fkey" FOREIGN KEY (capability_code) REFERENCES platform_capabilities(capability_code);
ALTER TABLE public."platform_vendor_identity_links" ADD CONSTRAINT "platform_vendor_identity_links_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."platform_vendor_identity_links" ADD CONSTRAINT "platform_vendor_identity_links_tenant_id_erp_vendor_id_fkey" FOREIGN KEY (tenant_id, erp_vendor_id) REFERENCES erp_vendors(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."policies" ADD CONSTRAINT "policies_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."portal_action_permissions" ADD CONSTRAINT "portal_action_permissions_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES portal_users(id);
ALTER TABLE public."portal_action_permissions" ADD CONSTRAINT "portal_action_permissions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."portal_customer_accounts" ADD CONSTRAINT "portal_customer_accounts_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."portal_customer_accounts" ADD CONSTRAINT "portal_customer_accounts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."portal_customer_accounts" ADD CONSTRAINT "portal_customer_accounts_tenant_id_invited_by_fkey" FOREIGN KEY (tenant_id, invited_by) REFERENCES crm_staff(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."portal_magic_links" ADD CONSTRAINT "portal_magic_links_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."portal_magic_links" ADD CONSTRAINT "portal_magic_links_tenant_id_requested_by_fkey" FOREIGN KEY (tenant_id, requested_by) REFERENCES crm_staff(tenant_id, id) ON DELETE SET NULL;
ALTER TABLE public."portal_module_permissions" ADD CONSTRAINT "fk_portal_module_permissions_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."portal_module_permissions" ADD CONSTRAINT "fk_portal_module_permissions_portal_user_id" FOREIGN KEY (portal_user_id) REFERENCES portal_users(id) ON DELETE SET NULL;
ALTER TABLE public."portal_permission_audit_log" ADD CONSTRAINT "fk_portal_permission_audit_log_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."portal_permission_audit_log" ADD CONSTRAINT "fk_portal_permission_audit_log_portal_user_id" FOREIGN KEY (portal_user_id) REFERENCES portal_users(id) ON DELETE SET NULL;
ALTER TABLE public."portal_users" ADD CONSTRAINT "fk_portal_users_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."portal_users" ADD CONSTRAINT "fk_portal_users_user_id" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."pricing_packages" ADD CONSTRAINT "pricing_packages_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."privacy_request_details" ADD CONSTRAINT "privacy_request_details_ticket_fkey" FOREIGN KEY (tenant_id, ticket_id) REFERENCES support_tickets(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."product_attribute_values" ADD CONSTRAINT "product_attribute_values_attribute_value_id_fkey" FOREIGN KEY (attribute_value_id) REFERENCES attribute_values(id);
ALTER TABLE public."product_attribute_values" ADD CONSTRAINT "product_attribute_values_product_id_fk" FOREIGN KEY (product_id) REFERENCES erp_products(id);
ALTER TABLE public."product_attribute_values" ADD CONSTRAINT "product_attribute_values_attribute_id_fkey" FOREIGN KEY (attribute_id) REFERENCES attributes(id);
ALTER TABLE public."product_attribute_values" ADD CONSTRAINT "product_attribute_values_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public."product_canvas_templates" ADD CONSTRAINT "product_canvas_templates_product_mapping_id_fkey" FOREIGN KEY (product_mapping_id) REFERENCES supplier_product_mappings(id) ON DELETE CASCADE;
ALTER TABLE public."product_collections" ADD CONSTRAINT "product_collections_collection_id_fkey" FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE;
ALTER TABLE public."product_collections" ADD CONSTRAINT "product_collections_product_id_tenant_id_fkey" FOREIGN KEY (product_id, tenant_id) REFERENCES products(id, tenant_id) ON DELETE CASCADE;
ALTER TABLE public."product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public."product_media" ADD CONSTRAINT "product_media_variant_id_fkey" FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE;
ALTER TABLE public."product_nodes" ADD CONSTRAINT "product_nodes_node_id_fkey" FOREIGN KEY (node_id) REFERENCES taxonomy_nodes(id) ON DELETE CASCADE;
ALTER TABLE public."product_nodes" ADD CONSTRAINT "product_nodes_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public."product_relations" ADD CONSTRAINT "product_relations_module_id_fkey" FOREIGN KEY (module_id) REFERENCES merchandising_modules(id) ON DELETE CASCADE;
ALTER TABLE public."product_relations" ADD CONSTRAINT "product_relations_related_product_id_fkey" FOREIGN KEY (related_product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public."product_relations" ADD CONSTRAINT "product_relations_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public."product_relations" ADD CONSTRAINT "product_relations_product_id_fk" FOREIGN KEY (product_id) REFERENCES erp_products(id);
ALTER TABLE public."product_taxonomy_links" ADD CONSTRAINT "product_taxonomy_links_product_id_fkey" FOREIGN KEY (product_id) REFERENCES supplier_catalog_products(id) ON DELETE CASCADE;
ALTER TABLE public."product_taxonomy_nodes" ADD CONSTRAINT "product_taxonomy_nodes_taxonomy_node_id_fkey" FOREIGN KEY (taxonomy_node_id) REFERENCES taxonomy_nodes(id);
ALTER TABLE public."product_taxonomy_nodes" ADD CONSTRAINT "product_taxonomy_nodes_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."product_taxonomy_nodes" ADD CONSTRAINT "product_taxonomy_nodes_product_id_fkey" FOREIGN KEY (product_id) REFERENCES erp_products(id);
ALTER TABLE public."product_variants" ADD CONSTRAINT "product_variants_product_id_tenant_id_fkey" FOREIGN KEY (product_id, tenant_id) REFERENCES products(id, tenant_id) ON DELETE CASCADE;
ALTER TABLE public."products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY (brand_id) REFERENCES brands(id);
ALTER TABLE public."products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY (category_id) REFERENCES categories(id);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_active_tenant_id_fkey" FOREIGN KEY (active_tenant_id) REFERENCES tenants(id);
ALTER TABLE public."promo_redemptions" ADD CONSTRAINT "promo_redemptions_user_id_fk" FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public."promo_redemptions" ADD CONSTRAINT "promo_redemptions_promo_id_fkey" FOREIGN KEY (promo_id) REFERENCES promos(id);
ALTER TABLE public."promo_redemptions" ADD CONSTRAINT "promo_redemptions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."promos" ADD CONSTRAINT "promos_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."purchase_order_items" ADD CONSTRAINT "purchase_order_items_tax_id_fkey" FOREIGN KEY (tax_id) REFERENCES taxes(id);
ALTER TABLE public."purchase_order_items" ADD CONSTRAINT "purchase_order_items_inventory_item_id_fkey" FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id);
ALTER TABLE public."purchase_order_items" ADD CONSTRAINT "purchase_order_items_account_id_fkey" FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE public."purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE;
ALTER TABLE public."purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_fkey" FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE;
ALTER TABLE public."purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_node_id_fkey" FOREIGN KEY (node_id) REFERENCES taxonomy_nodes(id);
ALTER TABLE public."purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_variant_id_fk" FOREIGN KEY (variant_id) REFERENCES erp_product_variants(id);
ALTER TABLE public."purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_variant_id_fkey" FOREIGN KEY (variant_id) REFERENCES product_variants(id);
ALTER TABLE public."purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."purchase_orders" ADD CONSTRAINT "purchase_orders_currency_fkey" FOREIGN KEY (currency) REFERENCES currencies(code);
ALTER TABLE public."purchase_orders" ADD CONSTRAINT "purchase_orders_converted_bill_id_fkey" FOREIGN KEY (converted_bill_id) REFERENCES bills(id);
ALTER TABLE public."purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES customers(id) ON DELETE RESTRICT;
ALTER TABLE public."quarantine" ADD CONSTRAINT "fk_quarantine_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."receipt_items" ADD CONSTRAINT "receipt_items_receipt_id_fkey" FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE;
ALTER TABLE public."receipt_items" ADD CONSTRAINT "receipt_items_inventory_item_id_fkey" FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id);
ALTER TABLE public."receipt_items" ADD CONSTRAINT "receipt_items_account_id_fkey" FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE public."receipt_items" ADD CONSTRAINT "receipt_items_tax_id_fkey" FOREIGN KEY (tax_id) REFERENCES taxes(id);
ALTER TABLE public."receipts" ADD CONSTRAINT "receipts_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id);
ALTER TABLE public."receipts" ADD CONSTRAINT "receipts_deposit_account_id_fkey" FOREIGN KEY (deposit_account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE public."receipts" ADD CONSTRAINT "receipts_revenue_account_id_fkey" FOREIGN KEY (revenue_account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE public."receipts" ADD CONSTRAINT "receipts_journal_id_fkey" FOREIGN KEY (journal_id) REFERENCES journal_entries(id);
ALTER TABLE public."receipts" ADD CONSTRAINT "receipts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."receipts" ADD CONSTRAINT "receipts_currency_fkey" FOREIGN KEY (currency) REFERENCES currencies(code);
ALTER TABLE public."reconciliations" ADD CONSTRAINT "reconciliations_bank_account_id_fkey" FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE;
ALTER TABLE public."reconciliations" ADD CONSTRAINT "reconciliations_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."recurring_invoice_items" ADD CONSTRAINT "recurring_invoice_items_tax_id_fkey" FOREIGN KEY (tax_id) REFERENCES taxes(id);
ALTER TABLE public."recurring_invoice_items" ADD CONSTRAINT "recurring_invoice_items_recurring_id_fkey" FOREIGN KEY (recurring_id) REFERENCES recurring_invoices(id) ON DELETE CASCADE;
ALTER TABLE public."recurring_invoice_items" ADD CONSTRAINT "recurring_invoice_items_account_id_fkey" FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE public."recurring_invoices" ADD CONSTRAINT "recurring_invoices_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."recurring_invoices" ADD CONSTRAINT "recurring_invoices_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
ALTER TABLE public."recurring_invoices" ADD CONSTRAINT "recurring_invoices_currency_fkey" FOREIGN KEY (currency) REFERENCES currencies(code);
ALTER TABLE public."related_search_page_products" ADD CONSTRAINT "related_search_page_products_product_id_fk" FOREIGN KEY (product_id) REFERENCES erp_products(id);
ALTER TABLE public."related_search_page_products" ADD CONSTRAINT "related_search_page_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public."related_search_page_products" ADD CONSTRAINT "related_search_page_products_page_id_fkey" FOREIGN KEY (page_id) REFERENCES related_search_pages(id) ON DELETE CASCADE;
ALTER TABLE public."related_search_pages" ADD CONSTRAINT "related_search_pages_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."related_search_pages" ADD CONSTRAINT "related_search_pages_target_node_id_fkey" FOREIGN KEY (target_node_id) REFERENCES taxonomy_nodes(id);
ALTER TABLE public."return_policy_rules" ADD CONSTRAINT "return_policy_rules_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."reviews" ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE public."reviews" ADD CONSTRAINT "reviews_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE public."reviews" ADD CONSTRAINT "reviews_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."route_redirects" ADD CONSTRAINT "route_redirects_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."sales_order_items" ADD CONSTRAINT "sales_order_items_sales_order_id_fkey" FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE CASCADE;
ALTER TABLE public."sales_order_items" ADD CONSTRAINT "sales_order_items_account_id_fkey" FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id);
ALTER TABLE public."sales_order_items" ADD CONSTRAINT "sales_order_items_inventory_item_id_fkey" FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id);
ALTER TABLE public."sales_order_items" ADD CONSTRAINT "sales_order_items_tax_id_fkey" FOREIGN KEY (tax_id) REFERENCES taxes(id);
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT;
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_converted_invoice_id_fkey" FOREIGN KEY (converted_invoice_id) REFERENCES invoices(id);
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_currency_fkey" FOREIGN KEY (currency) REFERENCES currencies(code);
ALTER TABLE public."sales_orders" ADD CONSTRAINT "sales_orders_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."search_events" ADD CONSTRAINT "search_events_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_1099k_generations" ADD CONSTRAINT "seller_1099k_generations_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_1099k_generations" ADD CONSTRAINT "seller_1099k_generations_seller_id_fk" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."seller_ad_campaigns" ADD CONSTRAINT "seller_ad_campaigns_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."seller_ad_campaigns" ADD CONSTRAINT "seller_ad_campaigns_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_advertising_enrollments" ADD CONSTRAINT "seller_advertising_enrollments_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."seller_advertising_enrollments" ADD CONSTRAINT "seller_advertising_enrollments_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_appeals" ADD CONSTRAINT "fk_seller_appeals_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."seller_appeals" ADD CONSTRAINT "fk_seller_appeals_violation_id" FOREIGN KEY (violation_id) REFERENCES seller_violations(id) ON DELETE SET NULL;
ALTER TABLE public."seller_brand_authorizations" ADD CONSTRAINT "seller_brand_authorizations_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
ALTER TABLE public."seller_brand_authorizations" ADD CONSTRAINT "seller_brand_authorizations_brand_id_fkey" FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE;
ALTER TABLE public."seller_category_approvals" ADD CONSTRAINT "seller_category_approvals_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
ALTER TABLE public."seller_category_approvals" ADD CONSTRAINT "seller_category_approvals_node_id_fkey" FOREIGN KEY (node_id) REFERENCES taxonomy_nodes(id) ON DELETE CASCADE;
ALTER TABLE public."seller_customer_messages" ADD CONSTRAINT "seller_customer_messages_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_customer_messages" ADD CONSTRAINT "seller_customer_messages_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."seller_customer_notes" ADD CONSTRAINT "seller_customer_notes_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."seller_customer_notes" ADD CONSTRAINT "seller_customer_notes_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_data_processing" ADD CONSTRAINT "seller_data_processing_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."seller_data_processing" ADD CONSTRAINT "seller_data_processing_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_dpa_acceptances" ADD CONSTRAINT "seller_dpa_acceptances_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_dpa_acceptances" ADD CONSTRAINT "seller_dpa_acceptances_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."seller_inventory_settings" ADD CONSTRAINT "seller_inventory_settings_seller_id_fk" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."seller_inventory_settings" ADD CONSTRAINT "seller_inventory_settings_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_investigations" ADD CONSTRAINT "fk_seller_investigations_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."seller_investigations" ADD CONSTRAINT "fk_seller_investigations_violation_id" FOREIGN KEY (violation_id) REFERENCES seller_violations(id) ON DELETE SET NULL;
ALTER TABLE public."seller_live_settings" ADD CONSTRAINT "seller_live_settings_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE;
ALTER TABLE public."seller_live_streams" ADD CONSTRAINT "seller_live_streams_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."seller_live_streams" ADD CONSTRAINT "seller_live_streams_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_login_activity" ADD CONSTRAINT "seller_login_activity_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_login_activity" ADD CONSTRAINT "seller_login_activity_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."seller_notification_preferences" ADD CONSTRAINT "seller_notification_preferences_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_notification_preferences" ADD CONSTRAINT "seller_notification_preferences_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."seller_performance_alerts" ADD CONSTRAINT "seller_performance_alerts_seller_id_fk" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."seller_performance_alerts" ADD CONSTRAINT "seller_performance_alerts_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_policy_enforcement" ADD CONSTRAINT "seller_policy_enforcement_violation_id_fk" FOREIGN KEY (violation_id) REFERENCES seller_violations(id);
ALTER TABLE public."seller_policy_enforcement" ADD CONSTRAINT "seller_policy_enforcement_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_policy_enforcement" ADD CONSTRAINT "seller_policy_enforcement_seller_id_fk" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."seller_remediation_plans" ADD CONSTRAINT "srp_seller_fk" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."seller_remediation_plans" ADD CONSTRAINT "srp_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_remediation_plans" ADD CONSTRAINT "srp_violation_fk" FOREIGN KEY (violation_id) REFERENCES seller_violations(id);
ALTER TABLE public."seller_sales_rewards" ADD CONSTRAINT "seller_sales_rewards_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_sales_rewards" ADD CONSTRAINT "seller_sales_rewards_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."seller_self_serve_profiles" ADD CONSTRAINT "seller_self_serve_profiles_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."seller_settlement_reversals" ADD CONSTRAINT "seller_settlement_reversals_settlement_id_fkey" FOREIGN KEY (settlement_id) REFERENCES seller_settlements(id);
ALTER TABLE public."seller_settlements" ADD CONSTRAINT "seller_settlements_order_id_fkey" FOREIGN KEY (order_id) REFERENCES commerce_orders(id);
ALTER TABLE public."seller_social_posts" ADD CONSTRAINT "seller_social_posts_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_social_posts" ADD CONSTRAINT "seller_social_posts_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."seller_solution_providers" ADD CONSTRAINT "seller_solution_providers_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."seller_solution_providers" ADD CONSTRAINT "seller_solution_providers_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_stripe_accounts" ADD CONSTRAINT "seller_stripe_accounts_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_stripe_accounts" ADD CONSTRAINT "seller_stripe_accounts_seller_id_fk" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."seller_tax_exemptions" ADD CONSTRAINT "seller_tax_exemptions_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."seller_tax_exemptions" ADD CONSTRAINT "seller_tax_exemptions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_tax_remittance_filings" ADD CONSTRAINT "seller_tax_remittance_filings_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_violations" ADD CONSTRAINT "fk_seller_violations_order_id" FOREIGN KEY (order_id) REFERENCES erp_orders(id) ON DELETE SET NULL;
ALTER TABLE public."seller_violations" ADD CONSTRAINT "fk_seller_violations_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."seller_webhook_deliveries" ADD CONSTRAINT "seller_webhook_deliveries_webhook_id_fkey" FOREIGN KEY (webhook_id) REFERENCES seller_webhooks(id) ON DELETE CASCADE;
ALTER TABLE public."seller_webhook_deliveries" ADD CONSTRAINT "seller_webhook_deliveries_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."seller_webhook_deliveries" ADD CONSTRAINT "seller_webhook_deliveries_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_webhooks" ADD CONSTRAINT "seller_webhooks_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."seller_webhooks" ADD CONSTRAINT "seller_webhooks_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."sellers" ADD CONSTRAINT "sellers_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."seo_overrides" ADD CONSTRAINT "seo_overrides_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."seo_templates" ADD CONSTRAINT "seo_templates_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."service_items" ADD CONSTRAINT "service_items_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."service_pricing" ADD CONSTRAINT "service_pricing_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."services" ADD CONSTRAINT "services_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."shipping_profiles" ADD CONSTRAINT "shipping_profiles_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE;
ALTER TABLE public."shipping_profiles" ADD CONSTRAINT "shipping_profiles_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."shop_grid_cards" ADD CONSTRAINT "shop_grid_cards_item_id_fkey" FOREIGN KEY (item_id) REFERENCES commerce_catalog_items(id);
ALTER TABLE public."social_accounts" ADD CONSTRAINT "social_accounts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."social_accounts" ADD CONSTRAINT "social_accounts_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."social_data_deletion_requests" ADD CONSTRAINT "social_data_deletion_requests_seller_id_fk" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."social_data_deletion_requests" ADD CONSTRAINT "social_data_deletion_requests_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."social_media_assets" ADD CONSTRAINT "social_media_assets_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."social_media_assets" ADD CONSTRAINT "social_media_assets_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."social_oauth_states" ADD CONSTRAINT "social_oauth_states_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."social_oauth_states" ADD CONSTRAINT "social_oauth_states_user_id_fk" FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public."social_oauth_states" ADD CONSTRAINT "social_oauth_states_seller_id_fk" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."social_oauth_tokens" ADD CONSTRAINT "social_oauth_tokens_social_account_id_fkey" FOREIGN KEY (social_account_id) REFERENCES social_accounts(id) ON DELETE CASCADE;
ALTER TABLE public."social_oauth_tokens" ADD CONSTRAINT "social_oauth_tokens_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."social_outbox_events" ADD CONSTRAINT "social_outbox_events_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."social_outbox_events" ADD CONSTRAINT "social_outbox_events_seller_id_fk" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."social_post_media" ADD CONSTRAINT "social_post_media_media_asset_id_fkey" FOREIGN KEY (media_asset_id) REFERENCES social_media_assets(id) ON DELETE RESTRICT;
ALTER TABLE public."social_post_media" ADD CONSTRAINT "social_post_media_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."social_post_media" ADD CONSTRAINT "social_post_media_post_id_fkey" FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE CASCADE;
ALTER TABLE public."social_post_networks" ADD CONSTRAINT "social_post_networks_social_account_id_fkey" FOREIGN KEY (social_account_id) REFERENCES social_accounts(id) ON DELETE SET NULL;
ALTER TABLE public."social_post_networks" ADD CONSTRAINT "social_post_networks_social_post_id_tenant_id_fkey" FOREIGN KEY (social_post_id, tenant_id) REFERENCES social_posts(id, tenant_id) ON DELETE CASCADE;
ALTER TABLE public."social_post_series" ADD CONSTRAINT "social_post_series_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."social_post_series" ADD CONSTRAINT "social_post_series_author_id_fk" FOREIGN KEY (author_id) REFERENCES auth.users(id);
ALTER TABLE public."social_post_series" ADD CONSTRAINT "social_post_series_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."social_post_targets" ADD CONSTRAINT "social_post_targets_post_id_fkey" FOREIGN KEY (post_id) REFERENCES social_posts(id) ON DELETE RESTRICT;
ALTER TABLE public."social_post_targets" ADD CONSTRAINT "social_post_targets_social_account_id_fkey" FOREIGN KEY (social_account_id) REFERENCES social_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public."social_post_targets" ADD CONSTRAINT "social_post_targets_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."social_post_targets" ADD CONSTRAINT "social_post_targets_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."social_posts" ADD CONSTRAINT "social_posts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."social_publish_attempts" ADD CONSTRAINT "social_publish_attempts_post_target_id_fkey" FOREIGN KEY (post_target_id) REFERENCES social_post_targets(id) ON DELETE RESTRICT;
ALTER TABLE public."social_publish_attempts" ADD CONSTRAINT "social_publish_attempts_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."social_publish_attempts" ADD CONSTRAINT "social_publish_attempts_seller_id_fk" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."social_schedule_slots" ADD CONSTRAINT "social_schedule_slots_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id);
ALTER TABLE public."social_schedule_slots" ADD CONSTRAINT "social_schedule_slots_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."social_webhook_deliveries" ADD CONSTRAINT "social_webhook_deliveries_endpoint_id_fkey" FOREIGN KEY (endpoint_id) REFERENCES social_webhook_endpoints(id) ON DELETE RESTRICT;
ALTER TABLE public."social_webhook_endpoints" ADD CONSTRAINT "social_webhook_endpoints_seller_id_fkey" FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE RESTRICT;
ALTER TABLE public."ssp_endpoints" ADD CONSTRAINT "ssp_endpoints_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public."staff" ADD CONSTRAINT "staff_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."stripe_pending_charges" ADD CONSTRAINT "stripe_pending_charges_sale_id_fk" FOREIGN KEY (sale_id) REFERENCES commerce_sales(id);
ALTER TABLE public."subscriptions" ADD CONSTRAINT "subscriptions_user_id_fk" FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public."subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES subscription_plans(id);
ALTER TABLE public."supplier_catalog_products" ADD CONSTRAINT "fk_supplier_catalog_products_supplier_id" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE public."supplier_catalog_products" ADD CONSTRAINT "supplier_catalog_products_category_id_fkey" FOREIGN KEY (category_id) REFERENCES categories(id);
ALTER TABLE public."supplier_catalog_products" ADD CONSTRAINT "supplier_catalog_products_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE;
ALTER TABLE public."supplier_catalog_variants" ADD CONSTRAINT "fk_supplier_catalog_variants_catalog_product_id" FOREIGN KEY (supplier_catalog_product_id) REFERENCES supplier_catalog_products(id) ON DELETE CASCADE;
ALTER TABLE public."supplier_catalog_variants" ADD CONSTRAINT "supplier_catalog_variants_supplier_catalog_product_id_fkey" FOREIGN KEY (supplier_catalog_product_id) REFERENCES supplier_catalog_products(id) ON DELETE CASCADE;
ALTER TABLE public."supplier_catalog_variants" ADD CONSTRAINT "supplier_catalog_variants_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE;
ALTER TABLE public."supplier_category_memory" ADD CONSTRAINT "supplier_category_memory_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE;
ALTER TABLE public."supplier_category_memory" ADD CONSTRAINT "supplier_category_memory_category_id_fkey" FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE;
ALTER TABLE public."supplier_category_visibility" ADD CONSTRAINT "supplier_category_visibility_category_id_fkey" FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE;
ALTER TABLE public."supplier_category_visibility" ADD CONSTRAINT "supplier_category_visibility_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE;
ALTER TABLE public."supplier_fulfillment_locations" ADD CONSTRAINT "supplier_fulfillment_locations_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE;
ALTER TABLE public."supplier_import_items" ADD CONSTRAINT "supplier_import_items_import_id_fkey" FOREIGN KEY (import_id) REFERENCES supplier_imports(id) ON DELETE CASCADE;
ALTER TABLE public."supplier_imports" ADD CONSTRAINT "supplier_imports_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."supplier_imports" ADD CONSTRAINT "supplier_imports_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE;
ALTER TABLE public."supplier_mockup_templates" ADD CONSTRAINT "supplier_mockup_templates_canonical_product_id_fkey" FOREIGN KEY (canonical_product_id) REFERENCES canonical_products(id) ON DELETE CASCADE;
ALTER TABLE public."supplier_print_specs" ADD CONSTRAINT "supplier_print_specs_canonical_product_id_fkey" FOREIGN KEY (canonical_product_id) REFERENCES canonical_products(id) ON DELETE CASCADE;
ALTER TABLE public."supplier_product_costs" ADD CONSTRAINT "supplier_product_costs_canonical_product_id_fkey" FOREIGN KEY (canonical_product_id) REFERENCES canonical_products(id) ON DELETE CASCADE;
ALTER TABLE public."supplier_product_mappings" ADD CONSTRAINT "supplier_product_mappings_supplier_catalog_variant_id_fkey" FOREIGN KEY (supplier_catalog_variant_id) REFERENCES supplier_catalog_variants(id);
ALTER TABLE public."supplier_product_mappings" ADD CONSTRAINT "supplier_product_mappings_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
ALTER TABLE public."supply_service_map" ADD CONSTRAINT "supply_service_map_node_id_fkey" FOREIGN KEY (node_id) REFERENCES taxonomy_nodes(id) ON DELETE CASCADE;
ALTER TABLE public."support_actions" ADD CONSTRAINT "fk_support_actions_ticket_id" FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE SET NULL;
ALTER TABLE public."support_actions" ADD CONSTRAINT "fk_support_actions_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_attachments" ADD CONSTRAINT "fk_support_attachments_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_attachments" ADD CONSTRAINT "fk_support_attachments_message_id" FOREIGN KEY (message_id) REFERENCES crm_messages(id) ON DELETE SET NULL;
ALTER TABLE public."support_attachments" ADD CONSTRAINT "fk_support_attachments_ticket_id" FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE SET NULL;
ALTER TABLE public."support_automations" ADD CONSTRAINT "support_automations_inherits_from_id_fkey" FOREIGN KEY (inherits_from_id) REFERENCES support_automations(id) ON DELETE SET NULL;
ALTER TABLE public."support_automations" ADD CONSTRAINT "support_automations_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."support_business_hours" ADD CONSTRAINT "support_business_hours_inherits_from_id_fkey" FOREIGN KEY (inherits_from_id) REFERENCES support_business_hours(id) ON DELETE SET NULL;
ALTER TABLE public."support_business_hours" ADD CONSTRAINT "support_business_hours_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."support_canned_replies" ADD CONSTRAINT "fk_support_canned_replies_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_case_details" ADD CONSTRAINT "support_case_details_ticket_fkey" FOREIGN KEY (tenant_id, ticket_id) REFERENCES support_tickets(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."support_categories" ADD CONSTRAINT "fk_support_categories_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_channel_threads" ADD CONSTRAINT "fk_support_channel_threads_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_channel_threads" ADD CONSTRAINT "fk_support_channel_threads_conversation_id" FOREIGN KEY (conversation_id) REFERENCES crm_conversations(id) ON DELETE SET NULL;
ALTER TABLE public."support_channels" ADD CONSTRAINT "fk_support_channels_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_contact_notes" ADD CONSTRAINT "support_contact_notes_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES support_contacts(id) ON DELETE CASCADE;
ALTER TABLE public."support_contact_notes" ADD CONSTRAINT "support_contact_notes_author_staff_id_fkey" FOREIGN KEY (author_staff_id) REFERENCES crm_staff(id) ON DELETE SET NULL;
ALTER TABLE public."support_contact_notes" ADD CONSTRAINT "support_contact_notes_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."support_contact_orgs" ADD CONSTRAINT "support_contact_orgs_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES support_contacts(id) ON DELETE CASCADE;
ALTER TABLE public."support_contact_orgs" ADD CONSTRAINT "support_contact_orgs_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES support_organizations(id) ON DELETE CASCADE;
ALTER TABLE public."support_contact_orgs" ADD CONSTRAINT "support_contact_orgs_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."support_contacts" ADD CONSTRAINT "fk_support_contacts_merged_into_id" FOREIGN KEY (merged_into_id) REFERENCES support_tickets(id) ON DELETE SET NULL;
ALTER TABLE public."support_contacts" ADD CONSTRAINT "fk_support_contacts_customer_id" FOREIGN KEY (customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL;
ALTER TABLE public."support_contacts" ADD CONSTRAINT "fk_support_contacts_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_drafts" ADD CONSTRAINT "support_drafts_ticket_id_fkey" FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE;
ALTER TABLE public."support_drafts" ADD CONSTRAINT "support_drafts_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."support_drafts" ADD CONSTRAINT "support_drafts_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES crm_staff(id) ON DELETE CASCADE;
ALTER TABLE public."support_escalation_rules" ADD CONSTRAINT "fk_support_escalation_rules_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_holidays" ADD CONSTRAINT "support_holidays_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."support_holidays" ADD CONSTRAINT "support_holidays_inherits_from_id_fkey" FOREIGN KEY (inherits_from_id) REFERENCES support_holidays(id) ON DELETE SET NULL;
ALTER TABLE public."support_holidays" ADD CONSTRAINT "support_holidays_business_hours_id_fkey" FOREIGN KEY (business_hours_id) REFERENCES support_business_hours(id) ON DELETE CASCADE;
ALTER TABLE public."support_macros" ADD CONSTRAINT "fk_support_macros_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_notification_prefs" ADD CONSTRAINT "support_notification_prefs_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES crm_staff(id) ON DELETE CASCADE;
ALTER TABLE public."support_notification_prefs" ADD CONSTRAINT "support_notification_prefs_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."support_notifications" ADD CONSTRAINT "support_notifications_ticket_fkey" FOREIGN KEY (tenant_id, ticket_id) REFERENCES support_tickets(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."support_notifications" ADD CONSTRAINT "support_notifications_recipient_fkey" FOREIGN KEY (recipient_staff_id) REFERENCES crm_staff(id) ON DELETE SET NULL;
ALTER TABLE public."support_organizations" ADD CONSTRAINT "fk_support_organizations_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_queues" ADD CONSTRAINT "fk_support_queues_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_report_daily" ADD CONSTRAINT "support_report_daily_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."support_report_daily" ADD CONSTRAINT "support_report_daily_team_id_fkey" FOREIGN KEY (team_id) REFERENCES support_teams(id) ON DELETE SET NULL;
ALTER TABLE public."support_routing_rules" ADD CONSTRAINT "support_routing_rules_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."support_routing_rules" ADD CONSTRAINT "support_routing_rules_target_staff_id_fkey" FOREIGN KEY (target_staff_id) REFERENCES crm_staff(id) ON DELETE SET NULL;
ALTER TABLE public."support_routing_rules" ADD CONSTRAINT "support_routing_rules_target_team_id_fkey" FOREIGN KEY (target_team_id) REFERENCES support_teams(id) ON DELETE SET NULL;
ALTER TABLE public."support_routing_rules" ADD CONSTRAINT "support_routing_rules_sla_policy_id_fkey" FOREIGN KEY (sla_policy_id) REFERENCES support_sla_policies(id) ON DELETE SET NULL;
ALTER TABLE public."support_routing_rules" ADD CONSTRAINT "support_routing_rules_inherits_from_id_fkey" FOREIGN KEY (inherits_from_id) REFERENCES support_routing_rules(id) ON DELETE SET NULL;
ALTER TABLE public."support_side_conversation_messages" ADD CONSTRAINT "support_side_conversation_messages_author_staff_id_fkey" FOREIGN KEY (author_staff_id) REFERENCES crm_staff(id) ON DELETE SET NULL;
ALTER TABLE public."support_side_conversation_messages" ADD CONSTRAINT "side_messages_conversation_fk" FOREIGN KEY (tenant_id, side_conversation_id) REFERENCES support_side_conversations(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."support_side_conversation_messages" ADD CONSTRAINT "support_side_conversation_messages_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_side_conversation_participants" ADD CONSTRAINT "support_side_conversation_participants_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_side_conversation_participants" ADD CONSTRAINT "support_side_conversation_participants_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES crm_staff(id) ON DELETE CASCADE;
ALTER TABLE public."support_side_conversation_participants" ADD CONSTRAINT "support_side_conversation_participants_added_by_staff_id_fkey" FOREIGN KEY (added_by_staff_id) REFERENCES crm_staff(id) ON DELETE SET NULL;
ALTER TABLE public."support_side_conversation_participants" ADD CONSTRAINT "side_participants_conversation_fk" FOREIGN KEY (tenant_id, side_conversation_id) REFERENCES support_side_conversations(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."support_side_conversations" ADD CONSTRAINT "fk_support_side_conversations_ticket_id" FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE SET NULL;
ALTER TABLE public."support_side_conversations" ADD CONSTRAINT "fk_support_side_conversations_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_signatures" ADD CONSTRAINT "support_signatures_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES crm_staff(id) ON DELETE CASCADE;
ALTER TABLE public."support_signatures" ADD CONSTRAINT "support_signatures_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."support_signatures" ADD CONSTRAINT "support_signatures_team_id_fkey" FOREIGN KEY (team_id) REFERENCES support_teams(id) ON DELETE SET NULL;
ALTER TABLE public."support_sla_policies" ADD CONSTRAINT "fk_support_sla_policies_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_staff_skills" ADD CONSTRAINT "support_staff_skills_staff_id_fkey" FOREIGN KEY (staff_id) REFERENCES crm_staff(id) ON DELETE CASCADE;
ALTER TABLE public."support_staff_skills" ADD CONSTRAINT "support_staff_skills_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."support_team_members" ADD CONSTRAINT "fk_support_team_members_team_id" FOREIGN KEY (team_id) REFERENCES support_teams(id) ON DELETE SET NULL;
ALTER TABLE public."support_team_members" ADD CONSTRAINT "fk_support_team_members_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_teams" ADD CONSTRAINT "fk_support_teams_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_templates" ADD CONSTRAINT "support_templates_inherits_from_id_fkey" FOREIGN KEY (inherits_from_id) REFERENCES support_templates(id) ON DELETE SET NULL;
ALTER TABLE public."support_templates" ADD CONSTRAINT "support_templates_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."support_ticket_access_grants" ADD CONSTRAINT "support_ticket_access_grants_revoked_by_staff_id_fkey" FOREIGN KEY (revoked_by_staff_id) REFERENCES crm_staff(id) ON DELETE SET NULL;
ALTER TABLE public."support_ticket_access_grants" ADD CONSTRAINT "support_ticket_access_grants_ticket_id_fkey" FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE;
ALTER TABLE public."support_ticket_access_grants" ADD CONSTRAINT "support_ticket_access_grants_grantee_tenant_id_fkey" FOREIGN KEY (grantee_tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_ticket_access_grants" ADD CONSTRAINT "support_ticket_access_grants_granted_by_staff_id_fkey" FOREIGN KEY (granted_by_staff_id) REFERENCES crm_staff(id) ON DELETE SET NULL;
ALTER TABLE public."support_ticket_events" ADD CONSTRAINT "fk_support_ticket_events_ticket_id" FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE SET NULL;
ALTER TABLE public."support_ticket_events" ADD CONSTRAINT "fk_support_ticket_events_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_ticket_participants" ADD CONSTRAINT "fk_support_ticket_participants_ticket_id" FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE SET NULL;
ALTER TABLE public."support_ticket_participants" ADD CONSTRAINT "fk_support_ticket_participants_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_ticket_participants" ADD CONSTRAINT "fk_support_ticket_participants_contact_id" FOREIGN KEY (contact_id) REFERENCES support_contacts(id) ON DELETE SET NULL;
ALTER TABLE public."support_ticket_relations" ADD CONSTRAINT "fk_support_ticket_relations_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_ticket_relations" ADD CONSTRAINT "fk_support_ticket_relations_ticket_id" FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE SET NULL;
ALTER TABLE public."support_tickets" ADD CONSTRAINT "fk_support_tickets_assigned_team_id" FOREIGN KEY (assigned_team_id) REFERENCES support_teams(id) ON DELETE SET NULL;
ALTER TABLE public."support_tickets" ADD CONSTRAINT "fk_support_tickets_contact_id" FOREIGN KEY (contact_id) REFERENCES support_contacts(id) ON DELETE SET NULL;
ALTER TABLE public."support_tickets" ADD CONSTRAINT "fk_support_tickets_conversation_id" FOREIGN KEY (conversation_id) REFERENCES crm_conversations(id) ON DELETE SET NULL;
ALTER TABLE public."support_tickets" ADD CONSTRAINT "fk_support_tickets_follow_up_of_id" FOREIGN KEY (follow_up_of_id) REFERENCES support_tickets(id) ON DELETE SET NULL;
ALTER TABLE public."support_tickets" ADD CONSTRAINT "fk_support_tickets_merged_into_id" FOREIGN KEY (merged_into_id) REFERENCES support_tickets(id) ON DELETE SET NULL;
ALTER TABLE public."support_tickets" ADD CONSTRAINT "fk_support_tickets_order_id" FOREIGN KEY (order_id) REFERENCES erp_orders(id) ON DELETE SET NULL;
ALTER TABLE public."support_tickets" ADD CONSTRAINT "fk_support_tickets_organization_id" FOREIGN KEY (organization_id) REFERENCES support_organizations(id) ON DELETE SET NULL;
ALTER TABLE public."support_tickets" ADD CONSTRAINT "fk_support_tickets_parent_ticket_id" FOREIGN KEY (parent_ticket_id) REFERENCES support_tickets(id) ON DELETE SET NULL;
ALTER TABLE public."support_tickets" ADD CONSTRAINT "fk_support_tickets_problem_ticket_id" FOREIGN KEY (problem_ticket_id) REFERENCES support_tickets(id) ON DELETE SET NULL;
ALTER TABLE public."support_tickets" ADD CONSTRAINT "fk_support_tickets_product_id" FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE public."support_tickets" ADD CONSTRAINT "fk_support_tickets_requester_customer_id" FOREIGN KEY (requester_customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL;
ALTER TABLE public."support_tickets" ADD CONSTRAINT "fk_support_tickets_restricted_team_id" FOREIGN KEY (restricted_team_id) REFERENCES support_teams(id) ON DELETE SET NULL;
ALTER TABLE public."support_tickets" ADD CONSTRAINT "fk_support_tickets_sla_policy_id" FOREIGN KEY (sla_policy_id) REFERENCES support_sla_policies(id) ON DELETE SET NULL;
ALTER TABLE public."support_tickets" ADD CONSTRAINT "fk_support_tickets_subcategory_id" FOREIGN KEY (subcategory_id) REFERENCES support_categories(id) ON DELETE SET NULL;
ALTER TABLE public."support_tickets" ADD CONSTRAINT "fk_support_tickets_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_time_entries" ADD CONSTRAINT "support_time_entries_staff_fk" FOREIGN KEY (tenant_id, staff_id) REFERENCES crm_staff(tenant_id, id) ON DELETE RESTRICT;
ALTER TABLE public."support_time_entries" ADD CONSTRAINT "support_time_entries_ticket_fk" FOREIGN KEY (tenant_id, ticket_id) REFERENCES support_tickets(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."support_time_entries" ADD CONSTRAINT "support_time_entries_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_webhook_deliveries" ADD CONSTRAINT "support_webhook_deliveries_job_id_fkey" FOREIGN KEY (job_id) REFERENCES support_jobs(id) ON DELETE SET NULL;
ALTER TABLE public."support_webhook_deliveries" ADD CONSTRAINT "support_webhook_deliveries_webhook_fk" FOREIGN KEY (tenant_id, webhook_id) REFERENCES support_webhooks_outbound(tenant_id, id) ON DELETE CASCADE;
ALTER TABLE public."support_webhook_deliveries" ADD CONSTRAINT "support_webhook_deliveries_ticket_id_fk" FOREIGN KEY (ticket_id) REFERENCES support_tickets(id);
ALTER TABLE public."support_webhook_deliveries" ADD CONSTRAINT "support_webhook_deliveries_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_webhooks_outbound" ADD CONSTRAINT "support_webhooks_outbound_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."support_webhooks_outbound" ADD CONSTRAINT "support_webhooks_outbound_created_by_staff_id_fkey" FOREIGN KEY (created_by_staff_id) REFERENCES crm_staff(id) ON DELETE SET NULL;
ALTER TABLE public."sync_jobs" ADD CONSTRAINT "sync_jobs_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."tags" ADD CONSTRAINT "tags_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."taxes" ADD CONSTRAINT "taxes_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."taxonomy_nodes" ADD CONSTRAINT "taxonomy_nodes_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."taxonomy_nodes" ADD CONSTRAINT "taxonomy_nodes_subject_id_fkey" FOREIGN KEY (subject_id) REFERENCES taxonomy_nodes(id);
ALTER TABLE public."taxonomy_nodes" ADD CONSTRAINT "taxonomy_nodes_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES taxonomy_nodes(id) ON DELETE RESTRICT;
ALTER TABLE public."tenant_locations" ADD CONSTRAINT "tenant_locations_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."tenant_memberships" ADD CONSTRAINT "tenant_memberships_invited_by_fkey" FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."tenant_memberships" ADD CONSTRAINT "tenant_memberships_mfa_reset_by_fkey" FOREIGN KEY (mfa_reset_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public."tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."tenant_stripe_accounts" ADD CONSTRAINT "tenant_stripe_accounts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."tenant_wordpress_connections" ADD CONSTRAINT "tenant_wordpress_connections_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."testimonials" ADD CONSTRAINT "testimonials_tenant_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."transaction_tags" ADD CONSTRAINT "transaction_tags_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."transaction_tags" ADD CONSTRAINT "transaction_tags_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;
ALTER TABLE public."user_notifications" ADD CONSTRAINT "user_notifications_tenant_id_fk" FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public."user_notifications" ADD CONSTRAINT "user_notifications_user_id_fk" FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public."user_session_tabs" ADD CONSTRAINT "user_session_tabs_session_id_fkey" FOREIGN KEY (session_id) REFERENCES user_workspace_sessions(id) ON DELETE CASCADE;
ALTER TABLE public."user_tenants" ADD CONSTRAINT "user_tenants_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."variant_axis_values" ADD CONSTRAINT "variant_axis_values_variant_id_fkey" FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE;
ALTER TABLE public."variant_axis_values" ADD CONSTRAINT "variant_axis_values_attribute_value_id_fkey" FOREIGN KEY (attribute_value_id) REFERENCES attribute_values(id);
ALTER TABLE public."variant_axis_values" ADD CONSTRAINT "variant_axis_values_variant_id_fk" FOREIGN KEY (variant_id) REFERENCES erp_product_variants(id);
ALTER TABLE public."variant_fulfillment_routes" ADD CONSTRAINT "variant_fulfillment_routes_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."variant_fulfillment_routes" ADD CONSTRAINT "variant_fulfillment_routes_product_variant_id_tenant_id_fkey" FOREIGN KEY (product_variant_id, tenant_id) REFERENCES product_variants(id, tenant_id) ON DELETE CASCADE;
ALTER TABLE public."variant_fulfillment_routes" ADD CONSTRAINT "variant_fulfillment_routes_supplier_catalog_variant_id_fkey" FOREIGN KEY (supplier_catalog_variant_id) REFERENCES supplier_catalog_variants(id) ON DELETE CASCADE;
ALTER TABLE public."variant_fulfillment_routes" ADD CONSTRAINT "variant_fulfillment_routes_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE;
ALTER TABLE public."vendor_invoice_lines" ADD CONSTRAINT "vendor_invoice_lines_vendor_invoice_id_fkey" FOREIGN KEY (vendor_invoice_id) REFERENCES vendor_invoices(id) ON DELETE CASCADE;
ALTER TABLE public."vendor_invoice_lines" ADD CONSTRAINT "vendor_invoice_lines_po_line_id_fkey" FOREIGN KEY (po_line_id) REFERENCES purchase_order_lines(id);
ALTER TABLE public."vendor_invoices" ADD CONSTRAINT "vendor_invoices_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES vendors(id);
ALTER TABLE public."vendor_invoices" ADD CONSTRAINT "vendor_invoices_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."vendor_invoices" ADD CONSTRAINT "vendor_invoices_purchase_order_id_fkey" FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id);
ALTER TABLE public."vendors" ADD CONSTRAINT "vendors_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public."verification_tasks" ADD CONSTRAINT "fk_verification_tasks_tenant_id" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS acct_audit_record_idx ON public.acct_audit_log USING btree (tenant_id, table_name, record_id, event_time DESC);
CREATE UNIQUE INDEX IF NOT EXISTS acct_chart_of_accounts_tenant_code ON public.acct_chart_of_accounts USING btree (tenant_id, code);
CREATE INDEX IF NOT EXISTS acct_controls_tenant_code_idx ON public.acct_controls USING btree (tenant_id, control_code);
CREATE INDEX IF NOT EXISTS acct_gateway_clearing_tenant_payout_idx ON public.acct_gateway_clearing_entries USING btree (tenant_id, payout_id);
CREATE INDEX IF NOT EXISTS acct_gateway_clearing_tenant_state_idx ON public.acct_gateway_clearing_entries USING btree (tenant_id, state);
CREATE UNIQUE INDEX IF NOT EXISTS acct_one_primary_book_per_entity ON public.acct_books USING btree (entity_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS acct_price_book_lines_tenant_book_idx ON public.acct_price_book_lines USING btree (tenant_id, price_book_id);
CREATE INDEX IF NOT EXISTS acct_price_books_tenant_code_idx ON public.acct_price_books USING btree (tenant_id, code);
CREATE INDEX IF NOT EXISTS acct_receipt_extractions_tenant_status_idx ON public.acct_receipt_extractions USING btree (tenant_id, status);
CREATE INDEX IF NOT EXISTS activity_log_tenant_id_idx ON public.activity_log USING btree (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS ad_advertisers_one_system ON public.ad_advertisers USING btree (is_system) WHERE is_system;
CREATE INDEX IF NOT EXISTS ad_events_2026_10_campaign_id_event_time_idx ON public.ad_events_2026_10 USING btree (campaign_id, event_time);
CREATE INDEX IF NOT EXISTS ad_events_2026_10_event_time_idx ON public.ad_events_2026_10 USING btree (event_time);
CREATE INDEX IF NOT EXISTS ad_events_2026_10_tracking_id_idx ON public.ad_events_2026_10 USING btree (tracking_id) WHERE (tracking_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS ad_events_2026_11_campaign_id_event_time_idx ON public.ad_events_2026_11 USING btree (campaign_id, event_time);
CREATE INDEX IF NOT EXISTS ad_events_2026_11_event_time_idx ON public.ad_events_2026_11 USING btree (event_time);
CREATE INDEX IF NOT EXISTS ad_events_2026_11_tracking_id_idx ON public.ad_events_2026_11 USING btree (tracking_id) WHERE (tracking_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS ad_events_2026_12_campaign_id_event_time_idx ON public.ad_events_2026_12 USING btree (campaign_id, event_time);
CREATE INDEX IF NOT EXISTS ad_events_2026_12_event_time_idx ON public.ad_events_2026_12 USING btree (event_time);
CREATE INDEX IF NOT EXISTS ad_events_2026_12_tracking_id_idx ON public.ad_events_2026_12 USING btree (tracking_id) WHERE (tracking_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS ad_events_2027_01_campaign_id_event_time_idx ON public.ad_events_2027_01 USING btree (campaign_id, event_time);
CREATE INDEX IF NOT EXISTS ad_events_2027_01_event_time_idx ON public.ad_events_2027_01 USING btree (event_time);
CREATE INDEX IF NOT EXISTS ad_events_2027_01_tracking_id_idx ON public.ad_events_2027_01 USING btree (tracking_id) WHERE (tracking_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS ad_markers_creative_v2_idx ON public.ad_markers USING btree (creative_v2_id) WHERE (creative_v2_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS add_ons_tenant_id_idx ON public.add_ons USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS admin_manual_overrides_tenant_applied_idx ON public.admin_manual_overrides USING btree (tenant_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS admin_manual_overrides_tenant_type_idx ON public.admin_manual_overrides USING btree (tenant_id, override_type);
CREATE UNIQUE INDEX IF NOT EXISTS ai_ab_assignments_key ON public.ai_ab_assignments USING btree (test_id, subject_key);
CREATE INDEX IF NOT EXISTS ai_ab_assignments_test_idx ON public.ai_ab_assignments USING btree (tenant_id, test_id);
CREATE INDEX IF NOT EXISTS ai_ab_tests_tenant_idx ON public.ai_ab_tests USING btree (tenant_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS ai_agents_key ON public.ai_agents USING btree (key) WHERE (tenant_id IS NULL);
CREATE INDEX IF NOT EXISTS ai_agents_tenant_idx ON public.ai_agents USING btree (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS ai_budget_alerts_tenant_period_key ON public.ai_budget_alerts USING btree (tenant_id, period);
CREATE INDEX IF NOT EXISTS ai_intent_events_actor_idx ON public.ai_intent_events USING btree (actor_auth_user_id);
CREATE INDEX IF NOT EXISTS ai_intent_events_created_idx ON public.ai_intent_events USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_intent_events_purpose_idx ON public.ai_intent_events USING btree (purpose_code);
CREATE INDEX IF NOT EXISTS ai_intent_events_tenant_id_idx ON public.ai_intent_events USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS ai_mcp_connections_tenant_idx ON public.ai_mcp_connections USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS ai_purposes_tenant_id_idx ON public.ai_purposes USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS analytics_events_created_idx ON public.analytics_events USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_name_idx ON public.analytics_events USING btree (event_name);
CREATE INDEX IF NOT EXISTS analytics_events_session_idx ON public.analytics_events USING btree (session_id);
CREATE INDEX IF NOT EXISTS analytics_export_runs_definition_idx ON public.analytics_export_runs USING btree (definition_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_export_runs_tenant_idx ON public.analytics_export_runs USING btree (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_keys_tenant_idx ON public.api_keys USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS app_password_credentials_email_lower_idx ON public.app_password_credentials USING btree (lower(email));
CREATE INDEX IF NOT EXISTS availability_tenant_id_idx ON public.availability USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS bank_accounts_tenant_idx ON public.bank_accounts USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS bill_items_bill_idx ON public.bill_items USING btree (bill_id);
CREATE INDEX IF NOT EXISTS bills_tenant_idx ON public.bills USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS bills_vendor_idx ON public.bills USING btree (vendor_id);
CREATE INDEX IF NOT EXISTS blocked_times_tenant_id_idx ON public.blocked_times USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS brand_opt_outs_brand_idx ON public.brand_opt_outs USING btree (brand_id);
CREATE UNIQUE INDEX IF NOT EXISTS brand_opt_outs_one_applied_per_brand ON public.brand_opt_outs USING btree (tenant_id, brand_id) WHERE (status = 'applied'::text);
CREATE INDEX IF NOT EXISTS bt_bank_idx ON public.bank_transactions USING btree (bank_account_id);
CREATE INDEX IF NOT EXISTS bt_tenant_date_idx ON public.bank_transactions USING btree (tenant_id, date);
CREATE INDEX IF NOT EXISTS capabilities_case_idx ON public.capabilities USING btree (case_id);
CREATE INDEX IF NOT EXISTS capabilities_expires_idx ON public.capabilities USING btree (expires_at) WHERE (expires_at IS NOT NULL);
CREATE INDEX IF NOT EXISTS capabilities_lookup_idx ON public.capabilities USING btree (capability, jurisdiction, status);
CREATE INDEX IF NOT EXISTS catalog_bundle_components_item_idx ON public.catalog_bundle_components USING btree (tenant_id, catalog_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_bundle_components_unique_idx ON public.catalog_bundle_components USING btree (bundle_id, catalog_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_bundles_tenant_slug_key ON public.catalog_bundles USING btree (tenant_id, slug);
CREATE INDEX IF NOT EXISTS catalog_gtins_item_idx ON public.catalog_gtins USING btree (tenant_id, catalog_item_id);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_gtins_primary_per_item ON public.catalog_gtins USING btree (tenant_id, catalog_item_id) WHERE is_primary;
CREATE UNIQUE INDEX IF NOT EXISTS catalog_gtins_tenant_gtin_key ON public.catalog_gtins USING btree (tenant_id, gtin);
CREATE INDEX IF NOT EXISTS categories_parent_idx ON public.categories USING btree (parent_id, sort_order);
CREATE INDEX IF NOT EXISTS checkouts_slug_idx ON public.checkouts USING btree (slug);
CREATE INDEX IF NOT EXISTS checkouts_tenant_idx ON public.checkouts USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS coa_tenant_idx ON public.chart_of_accounts USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS commerce_brands_active_idx ON public.commerce_brands USING btree (is_active, sort_order);
CREATE INDEX IF NOT EXISTS commerce_brands_slug_idx ON public.commerce_brands USING btree (slug);
CREATE INDEX IF NOT EXISTS commerce_event_consumptions_event_idx ON public.commerce_event_consumptions USING btree (event_id);
CREATE INDEX IF NOT EXISTS commerce_event_consumptions_tenant_type_idx ON public.commerce_event_consumptions USING btree (tenant_id, consumer, created_at);
CREATE INDEX IF NOT EXISTS commerce_gift_card_designs_tenant_idx ON public.commerce_gift_card_designs USING btree (tenant_id, published, sort_order);
CREATE INDEX IF NOT EXISTS commerce_gift_cards_purchaser_email_idx ON public.commerce_gift_cards USING btree (tenant_id, lower(purchaser_email));
CREATE INDEX IF NOT EXISTS commerce_gift_cards_recipient_email_idx ON public.commerce_gift_cards USING btree (tenant_id, lower(recipient_email));
CREATE INDEX IF NOT EXISTS commerce_order_items_order_id_idx ON public.commerce_order_items USING btree (order_id);
CREATE INDEX IF NOT EXISTS commerce_orders_created_at_idx ON public.commerce_orders USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS commerce_orders_customer_email_idx ON public.commerce_orders USING btree (customer_email);
CREATE INDEX IF NOT EXISTS commerce_orders_fulfillment_status_idx ON public.commerce_orders USING btree (fulfillment_status);
CREATE INDEX IF NOT EXISTS commerce_orders_status_idx ON public.commerce_orders USING btree (status);
CREATE INDEX IF NOT EXISTS commerce_outbox_events_drain_idx ON public.commerce_outbox_events USING btree (status, available_at, created_at);
CREATE INDEX IF NOT EXISTS commerce_products_brand_idx ON public.commerce_products USING btree (brand_id);
CREATE INDEX IF NOT EXISTS commerce_products_featured_idx ON public.commerce_products USING btree (featured);
CREATE INDEX IF NOT EXISTS commerce_products_is_hidden_idx ON public.commerce_products USING btree (is_hidden);
CREATE INDEX IF NOT EXISTS commerce_products_visible_idx ON public.commerce_products USING btree (visible);
CREATE INDEX IF NOT EXISTS commerce_promotion_targets_promotion_idx ON public.commerce_promotion_targets USING btree (promotion_id);
CREATE INDEX IF NOT EXISTS commerce_promotions_tenant_seller_idx ON public.commerce_promotions USING btree (tenant_id, seller_id);
CREATE INDEX IF NOT EXISTS commerce_supplier_orders_status_idx ON public.commerce_supplier_orders USING btree (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS communications_tenant_id_idx ON public.communications USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS contact_messages_tenant_id_idx ON public.contact_messages USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS crm_activity_prune_idx ON public.crm_activity USING btree (occurred_at);
CREATE UNIQUE INDEX IF NOT EXISTS crm_commission_entries_accrual_uniq ON public.crm_commission_entries USING btree (tenant_id, appointment_id, service_id, staff_id) WHERE ((entry_type = 'earned'::text) AND (status <> 'void'::text) AND (appointment_id IS NOT NULL) AND (service_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS crm_customer_contact_lookup_idx ON public.crm_customer_contact_methods USING btree (tenant_id, normalized_value);
CREATE INDEX IF NOT EXISTS crm_search_index_fts_idx ON public.crm_search_index USING gin (to_tsvector('simple'::regconfig, search_text));
CREATE INDEX IF NOT EXISTS crm_staff_time_clock_open_idx ON public.crm_staff_time_clock_entries USING btree (staff_id) WHERE (clock_out IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS customer_ai_disclosure_acks_key ON public.customer_ai_disclosure_acks USING btree (tenant_id, customer_id, feature) WHERE (customer_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS customer_ai_disclosure_acks_tenant_idx ON public.customer_ai_disclosure_acks USING btree (tenant_id, acknowledged_at DESC);
CREATE INDEX IF NOT EXISTS customer_notifications_owner_idx ON public.customer_notifications USING btree (tenant_id, "customerId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS customer_notifications_unread_idx ON public.customer_notifications USING btree ("customerId", "readAt") WHERE ("readAt" IS NULL);
CREATE INDEX IF NOT EXISTS customer_wishlist_items_customer_idx ON public.customer_wishlist_items USING btree (tenant_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customers_search_vector_gin_idx ON public.customers USING gin (search_vector);
CREATE INDEX IF NOT EXISTS customers_tenant_idx ON public.customers USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS design_assets_design_idx ON public.design_assets USING btree (design_id);
CREATE INDEX IF NOT EXISTS design_assets_kind_idx ON public.design_assets USING btree (kind);
CREATE INDEX IF NOT EXISTS design_assets_project_idx ON public.design_assets USING btree (project_id);
CREATE INDEX IF NOT EXISTS designs_collection_idx ON public.designs USING btree (collection_id);
CREATE INDEX IF NOT EXISTS designs_project_idx ON public.designs USING btree (project_id);
CREATE INDEX IF NOT EXISTS designs_status_idx ON public.designs USING btree (status);
CREATE INDEX IF NOT EXISTS dropship_pipe_attempts_state_idx ON public.dropship_pipe_attempts USING btree (state, updated_at);
CREATE INDEX IF NOT EXISTS dropship_pipe_attempts_supplier_order_idx ON public.dropship_pipe_attempts USING btree (supplier_order_id);
CREATE INDEX IF NOT EXISTS dropship_pipe_mappings_cache_key_idx ON public.dropship_pipe_mappings USING btree (cache_key);
CREATE INDEX IF NOT EXISTS ecommerce_orders_tenant_customer_idx ON public.ecommerce_orders USING btree (tenant_id, crm_customer_id);
CREATE INDEX IF NOT EXISTS ecommerce_orders_tenant_email_idx ON public.ecommerce_orders USING btree (tenant_id, customer_email);
CREATE INDEX IF NOT EXISTS email_messages_prune_idx ON public.email_messages USING btree (status, "createdAt");
CREATE INDEX IF NOT EXISTS email_messages_tenant_id_idx ON public.email_messages USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS employee_notifications_staff_idx ON public.employee_notifications USING btree (tenant_id, staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS erp_order_lines_design_idx ON public.erp_order_lines USING btree (design_publication_id) WHERE (design_publication_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS erp_order_lines_storefront_item_uidx ON public.erp_order_lines USING btree (storefront_order_item_id) WHERE (storefront_order_item_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS estimates_tenant_idx ON public.estimates USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS faqs_tenant_id_idx ON public.faqs USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS feedback_submissions_tenant_created_idx ON public.feedback_submissions USING btree (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fsm_child_instances_case_idx ON public.fsm_child_instances USING btree (case_id);
CREATE INDEX IF NOT EXISTS fsm_transitions_lookup_idx ON public.fsm_transitions USING btree (type, from_state, event);
CREATE INDEX IF NOT EXISTS gallery_photos_tenant_id_idx ON public.gallery_photos USING btree (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS gated_brands_match_key_uidx ON public.gated_brands USING btree (match_key);
CREATE INDEX IF NOT EXISTS identity_grants_user_active ON public.identity_grants USING btree (user_id) WHERE (status = 'active'::text);
CREATE INDEX IF NOT EXISTS idx_acct_audit_log_actor_user_id ON public.acct_audit_log USING btree (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_acct_disputes_tenant_status ON public.acct_disputes USING btree (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_acct_employees_staff ON public.acct_employees USING btree (staff_id) WHERE (staff_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_acct_employees_tenant_status ON public.acct_employees USING btree (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_acct_payroll_deductions_employee ON public.acct_payroll_deductions USING btree (tenant_id, employee_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_acct_payroll_run_items_employee ON public.acct_payroll_run_items USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_acct_payroll_run_items_run ON public.acct_payroll_run_items USING btree (payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_acct_payroll_runs_period ON public.acct_payroll_runs USING btree (tenant_id, pay_period_id, status);
CREATE INDEX IF NOT EXISTS idx_acct_payroll_tax_forms_year ON public.acct_payroll_tax_forms USING btree (tenant_id, tax_year, form_type);
CREATE INDEX IF NOT EXISTS idx_acct_refunds_tenant_status ON public.acct_refunds USING btree (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_acct_timesheets_period ON public.acct_timesheets USING btree (pay_period_id) WHERE (pay_period_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ad_campaign_placements_campaign ON public.ad_campaign_placements USING btree (campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaign_placements_placement ON public.ad_campaign_placements USING btree (placement_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON public.ad_campaigns USING btree (status);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_tenant_id ON public.ad_campaigns USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign_id ON public.ad_creatives USING btree (campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_groups_campaign_id ON public.ad_groups USING btree (campaign_id);
CREATE INDEX IF NOT EXISTS idx_admin_manual_overrides_actor_id ON public.admin_manual_overrides USING btree (actor_id);
CREATE INDEX IF NOT EXISTS idx_admin_manual_overrides_reverts_override_id ON public.admin_manual_overrides USING btree (reverts_override_id);
CREATE INDEX IF NOT EXISTS idx_ads2_assets_creative ON public.ad_creative_assets USING btree (creative_id, kind);
CREATE INDEX IF NOT EXISTS idx_ads2_campaign_active ON public.ad_campaigns USING btree (status, starts_at, ends_at, tier_id);
CREATE INDEX IF NOT EXISTS idx_ads2_campaign_advertiser ON public.ad_campaigns USING btree (advertiser_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ads2_campaign_categories ON public.ad_campaign_categories USING btree (category_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_ads2_campaign_placements ON public.ad_campaign_placements USING btree (placement_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_ads2_creatives_campaign ON public.ad_creatives USING btree (campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_ads2_events_campaign_time ON ONLY public.ad_events USING btree (campaign_id, event_time);
CREATE INDEX IF NOT EXISTS idx_ads2_events_time ON ONLY public.ad_events USING btree (event_time);
CREATE INDEX IF NOT EXISTS idx_ads2_events_tracking ON ONLY public.ad_events USING btree (tracking_id) WHERE (tracking_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ads2_experiments_campaign ON public.ad_experiments USING btree (campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_ads2_frequency_lookup ON public.ad_frequency USING btree (ad_uid, frequency_date, campaign_id);
CREATE INDEX IF NOT EXISTS idx_ads2_groups_campaign ON public.ad_campaign_groups USING btree (campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_ads2_taxonomy_parent ON public.taxonomy_nodes USING btree (parent_id);
CREATE INDEX IF NOT EXISTS idx_ads2_variants_experiment ON public.ad_experiment_variants USING btree (experiment_id);
CREATE INDEX IF NOT EXISTS idx_ai_disclosures_tenant_id ON public.ai_disclosures USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_tenant_id_model_id ON public.ai_tasks USING btree (tenant_id, model_id);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_tenant_id_prompt_id ON public.ai_tasks USING btree (tenant_id, prompt_id);
CREATE INDEX IF NOT EXISTS idx_brand_placements_tenant_id ON public.brand_placements USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_canvas_templates_category ON public.product_canvas_templates USING btree (category_path);
CREATE INDEX IF NOT EXISTS idx_canvas_templates_lookup ON public.product_canvas_templates USING btree (product_mapping_id, view_angle);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON public.cart_items USING btree (cart_id);
CREATE INDEX IF NOT EXISTS idx_carts_customer ON public.carts USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_carts_session ON public.carts USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_catalog_bundle_components_catalog_item_id ON public.catalog_bundle_components USING btree (catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_catalog_bundle_components_sku_id ON public.catalog_bundle_components USING btree (sku_id);
CREATE INDEX IF NOT EXISTS idx_catalog_gtins_catalog_item_id ON public.catalog_gtins USING btree (catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_cci_metadata_gin_pathops ON public.commerce_catalog_items USING gin (metadata jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_cci_name_lookup ON public.commerce_catalog_items USING btree (tenant_id, lower(TRIM(BOTH FROM name)));
CREATE INDEX IF NOT EXISTS idx_cci_seller_id_expr ON public.commerce_catalog_items USING btree (((metadata ->> 'seller_id'::text)));
CREATE INDEX IF NOT EXISTS idx_cci_sku_id ON public.commerce_catalog_items USING btree (sku_id);
CREATE INDEX IF NOT EXISTS idx_cci_slug_lookup ON public.commerce_catalog_items USING btree (tenant_id, lower(TRIM(BOTH FROM (metadata ->> 'slug'::text))));
CREATE INDEX IF NOT EXISTS idx_ccit_tenant_node ON public.commerce_catalog_item_taxonomy USING btree (tenant_id, node_id, item_id);
CREATE INDEX IF NOT EXISTS idx_chargeback_details_tenant_id_ticket_id ON public.chargeback_details USING btree (tenant_id, ticket_id);
CREATE INDEX IF NOT EXISTS idx_cms_audit_tenant ON public.cms_audit_log USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cms_banners_active ON public.cms_banners USING btree (tenant_id, placement) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_cms_block_schemas_tenant ON public.cms_block_schemas USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cms_campaigns_tenant ON public.cms_campaigns USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cms_content_blocks_page ON public.cms_content_blocks USING btree (page_id);
CREATE INDEX IF NOT EXISTS idx_cms_content_blocks_status ON public.cms_content_blocks USING btree (status);
CREATE INDEX IF NOT EXISTS idx_cms_content_blocks_tenant ON public.cms_content_blocks USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cms_funnel_session ON public.cms_funnel_events USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_cms_gallery_items_gallery ON public.cms_gallery_items USING btree (gallery_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_cms_media_taxonomy_tenant ON public.cms_media_taxonomy USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cms_media_tenant ON public.cms_media_assets USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cms_nav_items_menu ON public.cms_navigation_items USING btree (menu_id);
CREATE INDEX IF NOT EXISTS idx_cms_navigation_menu ON public.cms_navigation USING btree (tenant_id, menu_key, sort_order) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_cms_offers_tenant ON public.cms_offers USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cms_pages_published ON public.cms_pages USING btree (tenant_id, published_at DESC) WHERE (status = 'published'::text);
CREATE INDEX IF NOT EXISTS idx_cms_pages_status ON public.cms_pages USING btree (status);
CREATE INDEX IF NOT EXISTS idx_cms_pages_tenant ON public.cms_pages USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cms_pages_tenant_status ON public.cms_pages USING btree (tenant_id, status, page_type);
CREATE INDEX IF NOT EXISTS idx_cms_policy_acc_customer ON public.cms_policy_acceptances USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_cms_redirects_tenant ON public.cms_redirects USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cms_slot_items_location_id ON public.cms_slot_items USING btree (location_id);
CREATE INDEX IF NOT EXISTS idx_cms_slot_items_slot_id ON public.cms_slot_items USING btree (slot_id);
CREATE INDEX IF NOT EXISTS idx_cms_slots_node_id ON public.cms_slots USING btree (node_id);
CREATE INDEX IF NOT EXISTS idx_cms_slots_tenant ON public.cms_slots USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_cms_versions_entity ON public.cms_versions USING btree (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_collections_parent ON public.collections USING btree (parent_id);
CREATE INDEX IF NOT EXISTS idx_commerce_carts_channel_id ON public.commerce_carts USING btree (channel_id);
CREATE INDEX IF NOT EXISTS idx_commerce_customer_accounts_default_payment_method_id ON public.commerce_customer_accounts USING btree (default_payment_method_id);
CREATE INDEX IF NOT EXISTS idx_commerce_gift_cards_design_id ON public.commerce_gift_cards USING btree (design_id);
CREATE INDEX IF NOT EXISTS idx_commerce_order_items_tenant_id_order_id ON public.commerce_order_items USING btree (tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_commerce_orders_coupon_id ON public.commerce_orders USING btree (coupon_id);
CREATE INDEX IF NOT EXISTS idx_commerce_payments_staff ON public.commerce_payments USING btree (tenant_id, staff_id) WHERE (staff_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_commerce_prices_item_list ON public.commerce_prices USING btree (catalog_item_id, price_list_id);
CREATE INDEX IF NOT EXISTS idx_commerce_products_category_id ON public.commerce_products USING btree (category_id);
CREATE INDEX IF NOT EXISTS idx_commerce_products_tenant_id_brand_id ON public.commerce_products USING btree (tenant_id, brand_id);
CREATE INDEX IF NOT EXISTS idx_commerce_promotion_targets_tenant_id_promotion_id ON public.commerce_promotion_targets USING btree (tenant_id, promotion_id);
CREATE INDEX IF NOT EXISTS idx_commerce_promotions_seller_id ON public.commerce_promotions USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_commerce_supplier_orders_supplier_id ON public.commerce_supplier_orders USING btree (supplier_id);
CREATE INDEX IF NOT EXISTS idx_commerce_supplier_orders_tenant_id_order_id ON public.commerce_supplier_orders USING btree (tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_cost_ranking ON public.supplier_product_costs USING btree (canonical_product_id, base_cost_usd);
CREATE INDEX IF NOT EXISTS idx_crm_audit_log_actor_user_id ON public.crm_audit_log USING btree (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_crm_commission_entries_run ON public.crm_commission_entries USING btree (payroll_run_id) WHERE (payroll_run_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_crm_commission_entries_sale_id ON public.crm_commission_entries USING btree (sale_id);
CREATE INDEX IF NOT EXISTS idx_crm_commission_entries_staff_date ON public.crm_commission_entries USING btree (tenant_id, staff_id, earned_on DESC);
CREATE INDEX IF NOT EXISTS idx_crm_commission_entries_status ON public.crm_commission_entries USING btree (tenant_id, status, earned_on DESC);
CREATE INDEX IF NOT EXISTS idx_crm_commission_rules_plan ON public.crm_commission_rules USING btree (tenant_id, plan_id, priority);
CREATE INDEX IF NOT EXISTS idx_crm_holiday_blackouts_date ON public.crm_holiday_blackouts USING btree (tenant_id, blackout_date);
CREATE INDEX IF NOT EXISTS idx_crm_product_recommendations_catalog_item_id ON public.crm_product_recommendations USING btree (catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_crm_staff_availability_staff ON public.crm_staff_availability USING btree (tenant_id, staff_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_crm_staff_commission_active ON public.crm_staff_commission_assignments USING btree (tenant_id, staff_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_crm_staff_shifts_date ON public.crm_staff_shifts USING btree (tenant_id, shift_date, staff_id);
CREATE INDEX IF NOT EXISTS idx_crm_staff_shifts_location ON public.crm_staff_shifts USING btree (tenant_id, location_id, shift_date) WHERE (status = ANY (ARRAY['scheduled'::text, 'published'::text, 'confirmed'::text]));
CREATE INDEX IF NOT EXISTS idx_crm_staff_shifts_staff_range ON public.crm_staff_shifts USING btree (tenant_id, staff_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_time_off_range ON public.crm_time_off_requests USING btree (tenant_id, staff_id, starts_on, ends_on) WHERE (status = 'approved'::text);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_user ON public.customer_addresses USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_customer_ai_disclosure_acks_user_id ON public.customer_ai_disclosure_acks USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_customer_memberships_customer_id ON public.customer_memberships USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_memberships_plan_id ON public.customer_memberships USING btree (plan_id);
CREATE INDEX IF NOT EXISTS idx_customer_memberships_tenant_id ON public.customer_memberships USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_employee_notifications_staff_id ON public.employee_notifications USING btree (staff_id);
CREATE INDEX IF NOT EXISTS idx_erp_po_lines_po ON public.erp_purchase_order_lines USING btree (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_erp_po_tenant_status ON public.erp_purchase_orders USING btree (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_erp_products_brand_trgm ON public.erp_products USING gin (brand gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_erp_products_description_trgm ON public.erp_products USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_erp_products_name_trgm ON public.erp_products USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_faqs_node_id ON public.faqs USING btree (node_id);
CREATE INDEX IF NOT EXISTS idx_feedback_submissions_support_ticket_id ON public.feedback_submissions USING btree (support_ticket_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_0032ef9031fc809a ON public.crm_duplicate_candidates USING btree (tenant_id, reviewed_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_006ad95fffc6dbb7 ON public.acct_entities USING btree (reporting_currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_00d07f6f4c11ef00 ON public.commerce_prices USING btree (tenant_id, price_list_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_00ed85db6f774777 ON public.commerce_subscription_items USING btree (service_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_018b49bbb41a0d4c ON public.crm_product_recommendations USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_01bfcf007755437c ON public.erp_product_skus USING btree (tenant_id, variant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_0202d040ad661c89 ON public.commerce_sale_lines USING btree (erp_order_line_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_02b7bd8d353c574b ON public.commerce_barcodes USING btree (tenant_id, catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_02e92c963c327ce8 ON public.commerce_sale_discounts USING btree (sale_line_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_039ff15e1ce0cf67 ON public.commerce_subscription_invoice_lines USING btree (subscription_item_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_04ce3fa57251ea7f ON public.commerce_refund_lines USING btree (sale_line_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_04f7edd07e487c31 ON public.commerce_checkout_sessions USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_0583ee008308aa95 ON public.commerce_subscriptions USING btree (tenant_id, default_payment_method_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_05dcacfa4cb97f56 ON public.commerce_receipts USING btree (deposit_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_06c3b1b3efd0d9c4 ON public.acct_ar_collections_cases USING btree (tenant_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_06f7e64d5e371487 ON public.commerce_receipts USING btree (refund_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_0708084aeeba457b ON public.erp_goods_receipt_lines USING btree (tenant_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_0758b92f8ced55b9 ON public.platform_backups USING btree (requested_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_07d8f32c885bd8d6 ON public.cms_galleries USING btree (page_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_07de033c379f0fd5 ON public.erp_package_items USING btree (tenant_id, package_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_07deb3182b39e0b0 ON public.receipt_items USING btree (receipt_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_091250417502da0c ON public.commerce_sales USING btree (tenant_id, register_session_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_093355c9af8a1974 ON public.crm_product_recommendations USING btree (appointment_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_09aaddda1f2c0460 ON public.commerce_order_channel_refs USING btree (tenant_id, channel_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_09e9b9b7156f9759 ON public.commerce_gift_card_transactions USING btree (payment_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_0a0b0e9f39965bad ON public.crm_staff_performance_notes USING btree (tenant_id, created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_0a1e0cf23695114b ON public.payment_transactions USING btree (ar_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_0b28cce8e36bf31d ON public.acct_ar_receipt_applications USING btree (invoice_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_0b8faa72249f6ca5 ON public.erp_inventory_count_sessions USING btree (tenant_id, location_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_0da40c6a02a2105a ON public.crm_document_versions USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_0dd96bc68cefbd32 ON public.commerce_procurement_events USING btree (tenant_id, purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_0e7c6eb5e5b93cc7 ON public.erp_inventory_count_lines USING btree (tenant_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_0ef364bcb7b34210 ON public.acct_asset_depreciation_runs USING btree (tenant_id, book_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_0f887bf509fb6d97 ON public.acct_timesheets USING btree (location_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_101c4814c642c88a ON public.acct_expense_reports USING btree (tenant_id, posted_journal_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_1068de33c5cf56ca ON public.commerce_subscription_invoices USING btree (tenant_id, acct_invoice_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_10b4bd44b134ed04 ON public.commerce_refunds USING btree (tenant_id, rma_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_11ebc0f106994dd3 ON public.acct_revenue_contracts USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_11f437d579b29135 ON public.commerce_coupon_redemptions USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_122b6bdc79053da4 ON public.commerce_deposits USING btree (transferred_from_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_1280113497a54224 ON public.erp_return_refunds USING btree (tenant_id, rma_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_12e183b565166ed5 ON public.acct_intercompany_transactions USING btree (tenant_id, from_journal_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_12ee4bf5d7bc3d0a ON public.commerce_gift_cards USING btree (converted_store_credit_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_130628df42b34e66 ON public.crm_waitlist USING btree (tenant_id, dependent_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_1317477fb272fd4e ON public.crm_document_versions USING btree (tenant_id, uploaded_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_13266b8fb02aeec5 ON public.commerce_deposits USING btree (tenant_id, appointment_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_133e4031cb874a85 ON public.commerce_deposits USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_135185fc7bf21fc2 ON public.portal_customer_accounts USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_139caf965eaa578c ON public.commerce_subscription_plan_items USING btree (catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_13b9245766d13fa6 ON public.commerce_gift_card_transactions USING btree (gift_card_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_14527b8f268dc4a3 ON public.erp_inventory_transfer_lines USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_146013e79a298fa4 ON public.commerce_store_credit_transactions USING btree (refund_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_14646dab9763384e ON public.acct_dimension_values USING btree (tenant_id, dimension_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_14c220f35a5e2a53 ON public.crm_staff_commission_assignments USING btree (staff_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_14c9a0e1947f822d ON public.commerce_refund_lines USING btree (refund_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_150e49511aa8a68d ON public.commerce_catalog_category_map USING btree (category_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_1556216c5553c2a5 ON public.crm_permanent_alerts USING btree (tenant_id, created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_156594817e83103d ON public.commerce_receipts USING btree (gift_card_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_15a6ef06158e7140 ON public.crm_needs_attention USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_16519fc7cf57eaf1 ON public.erp_inventory_serial_numbers USING btree (tenant_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_1656a96ce69a7bed ON public.payroll_run_items USING btree (timesheet_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_1718ada42a4576f4 ON public.journal_lines USING btree (fc_currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_175c1d8ac04726a8 ON public.crm_staff_shifts USING btree (shift_template_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_1799cdef81a09116 ON public.erp_package_items USING btree (tenant_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_18b07d351b8c4c2e ON public.commerce_payments USING btree (staff_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_18fb8b5ffb8c6571 ON public.acct_consolidation_runs USING btree (tenant_id, consolidation_group_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_1994919070f43929 ON public.acct_estimate_lines USING btree (service_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_19b34d949f7322ec ON public.acct_asset_depreciation_runs USING btree (tenant_id, journal_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_19cbf43ca4241a08 ON public.commerce_subscription_events USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_1c58a0cb20c296e9 ON public.commerce_coupons USING btree (tenant_id, promotion_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_1d734c85b446a430 ON public.crm_households USING btree (tenant_id, primary_customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_1ddf045e62509a43 ON public.commerce_shipping_labels USING btree (printed_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_1e3e051553f73622 ON public.erp_product_barcodes USING btree (tenant_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_1e49fcf0a3086c07 ON public.estimate_items USING btree (tax_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_1e6f14234c8ccfce ON public.acct_budget_lines USING btree (period_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_1f9b4be215f4f1ff ON public.acct_intercompany_partners USING btree (tenant_id, due_from_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_1faa9e5f22724c72 ON public.acct_entities USING btree (functional_currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_20d3f86d48cea811 ON public.acct_payroll_runs USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_2184ca970f625842 ON public.erp_inventory_reservations USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_2240f275c398ac01 ON public.crm_communication_preferences USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_226df13445cf2d60 ON public.acct_dimension_values USING btree (parent_value_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_23789db5a9e32506 ON public.commerce_sale_taxes USING btree (sale_line_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_23b10060a10e30d6 ON public.erp_goods_receipts USING btree (tenant_id, purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_24479181e7f5db48 ON public.commerce_subscriptions USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_2484fad18408ddee ON public.erp_inventory_cost_layers USING btree (tenant_id, lot_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_24a63e28929b9691 ON public.crm_holiday_blackouts USING btree (location_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_25318b72ae1d25a2 ON public.acct_dimension_values USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_25713f8e1f3d24b8 ON public.erp_return_inspections USING btree (inspected_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_25bfda01f71430c4 ON public.erp_inventory_reservations USING btree (tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_25c7fdf845303734 ON public.erp_pick_tasks USING btree (tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_2891a4545451609d ON public.erp_inventory_transfer_lines USING btree (tenant_id, transfer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_289ce04e752f8d75 ON public.erp_audit_log USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_28b12c3f843a54ff ON public.erp_pick_tasks USING btree (tenant_id, fulfillment_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_290689818ae6b4ff ON public.acct_lease_payments USING btree (journal_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_296a612a9e73420e ON public.cms_seo USING btree (page_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_29f44abfd164e208 ON public.purchase_order_items USING btree (inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_2a3d02a32700d003 ON public.erp_goods_receipt_lines USING btree (tenant_id, location_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_2a637ee45be808c4 ON public.commerce_promotion_items USING btree (tenant_id, category_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_2b5a4f0c4ca40969 ON public.crm_staff_incident_reports USING btree (tenant_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_2b76929eb986162b ON public.acct_exchange_rates USING btree (from_currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_2bd8528e67d2b0b5 ON public.portal_magic_links USING btree (tenant_id, requested_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_2c019666dedd37d3 ON public.bank_accounts USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_2c82a64b7498df07 ON public.journal_entries USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_2d54daad86a1cbbf ON public.acct_payroll_runs USING btree (approved_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_2d58077aed63e79c ON public.recurring_invoices USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_2dac590aa3b3660c ON public.erp_goods_receipt_lines USING btree (tenant_id, purchase_order_line_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_2dff9d2ba5385454 ON public.portal_magic_links USING btree (tenant_id, appointment_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_2e4fe2edd2f8f421 ON public.sales_orders USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_2f188317bc48056c ON public.commerce_sales USING btree (tenant_id, dependent_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_2f2888b896eb76bd ON public.crm_service_location_availability USING btree (tenant_id, service_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_300c3ff33571df3f ON public.erp_inventory_count_sessions USING btree (tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_30b8089cc3c40076 ON public.crm_needs_attention USING btree (tenant_id, resolved_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_3148c3a508ceaa49 ON public.acct_fixed_assets USING btree (tenant_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_31a648f919210495 ON public.erp_tracking_events USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_31dd77d2151ef6cf ON public.erp_inventory_cost_layers USING btree (tenant_id, source_movement_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_323928707ed2285f ON public.payroll_run_items USING btree (payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_325cd43f5d0bc4be ON public.crm_automation_runs USING btree (tenant_id, workflow_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_3277d48252eb489a ON public.commerce_order_events USING btree (tenant_id, erp_order_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_3333159f75aad2e6 ON public.receipt_items USING btree (inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_335daf4f48eb4b27 ON public.estimates USING btree (converted_invoice_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_33dde1ff2e467676 ON public.commerce_posting_events USING btree (tenant_id, journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_344d1fb8fb656ce4 ON public.commerce_coupons USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_346a078d6dfa35a1 ON public.crm_needs_attention USING btree (tenant_id, dependent_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_34ded676695ae009 ON public.commerce_customer_accounts USING btree (tenant_id, price_list_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_35658f7b61c97f51 ON public.crm_permanent_alerts USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_35bfb2ade95068f5 ON public.crm_shift_templates USING btree (location_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_35d803d5c6539b80 ON public.acct_ar_credit_memos USING btree (tenant_id, posted_journal_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_36265a1f05492c45 ON public.commerce_disputes USING btree (tenant_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_367b81573be8563a ON public.payroll_runs USING btree (journal_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_36c9f2358c6b3f5a ON public.sales_order_items USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_36e717f2d245e66c ON public.acct_employees USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_3776a5b701888447 ON public.bills USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_38293a0e4022d36f ON public.commerce_accounting_mappings USING btree (tenant_id, tax_code_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_395a5c88a7fe7443 ON public.acct_tax_codes USING btree (tenant_id, payable_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_3961e948d1b9f044 ON public.commerce_product_media USING btree (tenant_id, catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_399b18a62989b3b2 ON public.commerce_product_tags USING btree (tenant_id, catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_39a489fe1eec0387 ON public.crm_staff_incident_reports USING btree (tenant_id, created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_3a0c660081ccdecb ON public.bill_items USING btree (tax_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_3a42323eef66c415 ON public.commerce_cash_movements USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_3b0d87ef5b8b5301 ON public.commerce_checkout_sessions USING btree (tenant_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_3b7feda4b92bb8cd ON public.erp_inventory_count_lines USING btree (counted_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_3c110eb884b5e3f1 ON public.acct_revenue_performance_obligations USING btree (deferred_revenue_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_3c294955b2220b64 ON public.acct_ar_credit_memos USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_3c3a486450a9f064 ON public.crm_activity USING btree (tenant_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_3da1f3152985f578 ON public.estimate_items USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_3ec3139e3f8e3480 ON public.commerce_refunds USING btree (tenant_id, acct_credit_memo_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_403e8e0fba537194 ON public.crm_staff_shifts USING btree (swap_requested_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4040215cce3b0c9a ON public.checkouts USING btree (invoice_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4076129e9ae6cce9 ON public.acct_account_dimension_rules USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_40cc4bb930064462 ON public.commerce_inventory_alerts USING btree (tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4135f070085666da ON public.acct_budget_versions USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4146a2f20dcf5463 ON public.erp_products USING btree (category_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_415d63890599677c ON public.commerce_subscription_plan_items USING btree (plan_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4205a102126443e6 ON public.payroll_employees USING btree (wage_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_420c6d358ded3131 ON public.commerce_payments USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_42ca21dd6fdc7a0f ON public.erp_inventory_serial_numbers USING btree (tenant_id, location_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_42ce19b3ff2ab611 ON public.erp_shipping_methods USING btree (tenant_id, carrier_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_42fc63d5e72c3e89 ON public.payment_transactions USING btree (deposit_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_430f7d0bb321bbdf ON public.acct_payroll_deductions USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_43419c040b1e4184 ON public.crm_staff_documents USING btree (tenant_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4383d065bf33dca0 ON public.crm_services USING btree (parent_service_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_440c7cdd48420979 ON public.commerce_return_actions USING btree (tenant_id, rma_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4460f987efb66f54 ON public.acct_consolidation_runs USING btree (reporting_currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_447cdc08dd669ed0 ON public.acct_exchange_rates USING btree (to_currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_44ec93863849e1df ON public.bill_items USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4604241517efbd25 ON public.crm_staff USING btree (tenant_id, default_location_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_461f91e3a6327542 ON public.commerce_loyalty_transactions USING btree (loyalty_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_462c070e176ce7da ON public.bank_accounts USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4758c10dbab4786c ON public.commerce_deposits USING btree (tenant_id, service_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_47d1fba146ce3b65 ON public.portal_magic_links USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_490679e07e1c3c29 ON public.erp_packages USING btree (tenant_id, fulfillment_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4919f404a4b115af ON public.commerce_inventory_alerts USING btree (tenant_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4933f7a0405d9a71 ON public.commerce_sale_discounts USING btree (sale_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4942c90b03ae89c8 ON public.erp_goods_receipts USING btree (received_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4975efe8a3cfcae2 ON public.crm_staff_shifts USING btree (swap_approved_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_49d56ac17ba3ddb8 ON public.customers USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4a2799c6c3b7e6f6 ON public.commerce_subscriptions USING btree (tenant_id, acct_contract_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4adcf569ed04021e ON public.erp_packages USING btree (packed_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4aecdf7eb3f8164f ON public.checkouts USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4b0f6a6e8fdd1f1b ON public.customers USING btree (ar_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4b1c03b6860ebaeb ON public.commerce_payment_methods USING btree (tenant_id, gl_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4c959ef49321ea1e ON public.receipt_items USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4d0491f7a0d2cf0d ON public.commerce_coupon_redemptions USING btree (sale_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4d9a0643762850ef ON public.crm_funnel_events USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4f0e3abe15ef9b5d ON public.commerce_cart_lines USING btree (sku_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4f188d5261a6828a ON public.bank_transactions USING btree (matched_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4fb1a5aadbd6772a ON public.crm_commission_entries USING btree (service_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4fc23746223428bf ON public.purchase_orders USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_4fe013979f091b04 ON public.commerce_sale_lines USING btree (dependent_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_504fb70df66245b0 ON public.sales_order_items USING btree (inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_50e43403e16b550a ON public.cms_gallery_items USING btree (staff_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_50eee81a1e582b8f ON public.platform_quick_links USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_512c8306dd9cd66a ON public.acct_asset_classes USING btree (tenant_id, accumulated_depreciation_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_52c9d8db1dcb28af ON public.acct_expense_lines USING btree (expense_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_52e66e1e3b299898 ON public.commerce_cash_movements USING btree (tenant_id, register_session_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_531f0a272553007f ON public.commerce_subscription_items USING btree (subscription_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_533062098e568b98 ON public.commerce_sale_discounts USING btree (promotion_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_53a41278b82131da ON public.crm_automation_runs USING btree (tenant_id, enrollment_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_53a9e5a7e833b053 ON public.invoices USING btree (tax_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_53dab89a5bfc6f53 ON public.commerce_sale_lines USING btree (catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_545797dbd269c314 ON public.acct_payroll_runs USING btree (pay_period_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_54838b9a5069dff0 ON public.customer_statements USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_54a73b0cdbc0341c ON public.erp_package_items USING btree (tenant_id, fulfillment_line_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_54ab8835efa1ea82 ON public.commerce_sale_taxes USING btree (tax_code_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_558bbdad6f820a2b ON public.crm_staff_incident_reports USING btree (tenant_id, dependent_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_55ac10879fceb2f2 ON public.commerce_checkout_sessions USING btree (tenant_id, cart_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_56ab643aa1217ff7 ON public.erp_tracking_events USING btree (tenant_id, shipment_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_575394c07a91269b ON public.bill_items USING btree (inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_57e8feeb38ff634c ON public.invoices USING btree (ar_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_58849b77626c7607 ON public.receipts USING btree (deposit_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_58c69a81489cdaff ON public.crm_funnel_events USING btree (tenant_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_59bf1e5c73f3dc84 ON public.commerce_store_credit_transactions USING btree (store_credit_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_59d0664444d484d0 ON public.commerce_gift_card_transactions USING btree (sale_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_59d482d62c967887 ON public.sales_order_items USING btree (tax_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_5acd63ef3d07fe3b ON public.commerce_deposits USING btree (tenant_id, applied_invoice_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_5ae0bf6f653ee587 ON public.acct_leases USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_5b02079e56a0ea00 ON public.crm_staff_time_clock_entries USING btree (tenant_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_5b47f25d46152f3f ON public.acct_expense_reports USING btree (tenant_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_5c104f3090592660 ON public.platform_vendor_identity_links USING btree (tenant_id, acct_vendor_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_5d36021a591523a2 ON public.acct_asset_depreciation_lines USING btree (run_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_5dd70d29f2df9262 ON public.acct_ar_credit_memos USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_5e9622664613c814 ON public.erp_inventory_reservations USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_5f7b51201a139914 ON public.erp_goods_receipt_lines USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_5f829ba30aba58f1 ON public.commerce_accounting_mappings USING btree (tenant_id, catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_5fab235628bf86dd ON public.commerce_subscription_events USING btree (subscription_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_6033815072de94b4 ON public.acct_payroll_tax_forms USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_6060a75282eaaa5d ON public.erp_vendor_items USING btree (tenant_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_60c224cd67919b9f ON public.sales_order_items USING btree (sales_order_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_618fa85ed25e3a02 ON public.commerce_return_actions USING btree (assigned_to);
CREATE INDEX IF NOT EXISTS idx_fk_pub_624d616dd4123705 ON public.crm_automation_enrollments USING btree (tenant_id, workflow_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_62644e286284c7b3 ON public.commerce_order_channel_refs USING btree (tenant_id, erp_order_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_6287c0291aba8a02 ON public.cms_pages USING btree (updated_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_62a630c8c517e1b3 ON public.platform_integration_health_registry USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_639e302c579bf633 ON public.commerce_catalog_items USING btree (tenant_id, service_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_64132682092a6fb2 ON public.acct_expense_reports USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_6502daa7539a8b8e ON public.commerce_return_events USING btree (tenant_id, rma_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_658ca0bcaf4e0231 ON public.crm_service_location_availability USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_65d7385b4bd3feb5 ON public.commerce_inventory_events USING btree (tenant_id, location_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_668adea6a0abc73f ON public.receipt_items USING btree (tax_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_671a758fe9343091 ON public.commerce_deposits USING btree (tenant_id, payment_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_6828a0bbb383a223 ON public.erp_replenishment_recommendations USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_6a90ab8f7b86f3f7 ON public.crm_operating_hours USING btree (location_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_6b58a1798ba6e6da ON public.cms_pages USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_6c52a3463a2a4664 ON public.crm_audit_log USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_6c56f2f77118e1f2 ON public.erp_pick_task_lines USING btree (tenant_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_6ca69e922e3aee37 ON public.acct_workflow_instances USING btree (tenant_id, workflow_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_6d4203d93609d4a5 ON public.commerce_branches USING btree (tenant_id, crm_location_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_6dbe03cd0d46e225 ON public.acct_pay_periods USING btree (locked_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_6e1c7e855b99608a ON public.commerce_accounting_mappings USING btree (tenant_id, cogs_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_6e342e673948c726 ON public.acct_reconciliation_items USING btree (tenant_id, journal_line_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_6e431a300d9b0c73 ON public.platform_admin_access_log USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_6e8cf299547f30c2 ON public.commerce_inventory_events USING btree (tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_6eb2128cfc19bdce ON public.commerce_sale_lines USING btree (service_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_6f1a7686051b1802 ON public.crm_staff_incident_reports USING btree (tenant_id, appointment_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_6f8a58ffa3775512 ON public.commerce_refunds USING btree (tenant_id, payment_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_70f6804165079d22 ON public.platform_customer_identity_links USING btree (tenant_id, acct_customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_712649c2cb5c42c8 ON public.estimate_items USING btree (estimate_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_714f66d630ba951d ON public.recurring_invoice_items USING btree (tax_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_71752078d628169b ON public.acct_leases USING btree (tenant_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_7193d52573cee67f ON public.commerce_catalog_items USING btree (tenant_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_71b84318e9c6ad0f ON public.sales_orders USING btree (converted_invoice_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_74870db2ac8e12d1 ON public.commerce_gift_cards USING btree (holder_customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_750f195295ecca05 ON public.acct_books USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_751152bd48d1d084 ON public.acct_reconciliations USING btree (tenant_id, period_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_759a80c2e15048e1 ON public.commerce_gift_card_transactions USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_75b3d74546ed063b ON public.purchase_order_items USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_76d4845f5c7fdc8f ON public.erp_pick_task_lines USING btree (tenant_id, location_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_77055abc8846c04b ON public.estimate_items USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_7760d990df8d620c ON public.erp_pick_task_lines USING btree (tenant_id, pick_task_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_7865155723c36ade ON public.crm_automation_enrollments USING btree (tenant_id, appointment_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_79ec22d19824bbfb ON public.journal_lines USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_7a66a1fffbdb32e1 ON public.commerce_return_events USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_7a79d0fa2ab22f8f ON public.commerce_accounting_mappings USING btree (tenant_id, cash_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_7aca42c530e8eed2 ON public.crm_staff_availability USING btree (location_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_7af47c31e800dcc9 ON public.erp_replenishment_recommendations USING btree (tenant_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_7b50f201d339b131 ON public.commerce_disputes USING btree (tenant_id, payment_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_7c2b794db95b1a03 ON public.commerce_sales USING btree (tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_7c88405308cd8a95 ON public.acct_ap_purchase_order_lines USING btree (expense_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_7c8fe05086dc192c ON public.erp_inventory_transfers USING btree (tenant_id, to_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_7ea4c5a6f049d513 ON public.estimates USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_7ece7da5a5e2ee16 ON public.erp_audit_log USING btree (actor_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_7f04301d5a7ebc43 ON public.acct_ap_approvals USING btree (tenant_id, bill_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_7f1625b1e9d41bdf ON public.acct_asset_depreciation_runs USING btree (tenant_id, period_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_7f42bdaea8dc9f77 ON public.erp_pick_task_lines USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_7f944734c5c54d7a ON public.acct_close_checklists USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_80ca63fe2b3ffbca ON public.payroll_employees USING btree (staff_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_80cae8885c05360a ON public.bills USING btree (ap_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_80dbd9de3eff62d5 ON public.commerce_procurement_events USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_80e7a2a2e9cb8d66 ON public.acct_intercompany_transactions USING btree (tenant_id, to_journal_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_81477bcf406de014 ON public.commerce_subscriptions USING btree (tenant_id, plan_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_81665ecb7475e768 ON public.crm_automation_workflows USING btree (tenant_id, created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_84c848fdc49cd123 ON public.acct_account_dimension_rules USING btree (tenant_id, dimension_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_853cb646aee1be20 ON public.crm_service_location_availability USING btree (tenant_id, location_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_8548dc18ad37a06f ON public.crm_product_recommendations USING btree (dependent_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_861e90e92745ba72 ON public.crm_waitlist USING btree (tenant_id, preferred_staff_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_8678c9493b094467 ON public.commerce_payments USING btree (tenant_id, payment_method_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_86838fa13dc3fb5c ON public.receipts USING btree (revenue_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_86a147dfaaf87733 ON public.erp_goods_receipt_lines USING btree (tenant_id, lot_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_874079f4735b5eb2 ON public.commerce_catalog_items USING btree (tenant_id, tax_code_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_87652e3c9e289d96 ON public.acct_close_checklists USING btree (tenant_id, period_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_883a0815d1cf8953 ON public.commerce_categories USING btree (tenant_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_889469ed6717d2d1 ON public.commerce_gift_cards USING btree (replaced_by_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_896238049ea15b77 ON public.commerce_accounting_mappings USING btree (tenant_id, inventory_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_8a6326bee7795bd0 ON public.erp_inventory_reservations USING btree (tenant_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_8ab049734fc3e4e3 ON public.crm_staff_availability USING btree (staff_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_8b4814aba20ee950 ON public.erp_pick_waves USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_8c2b1aafa41fc3b1 ON public.journal_lines USING btree (tax_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_8c44a1390fa5c80d ON public.crm_message_templates USING btree (tenant_id, created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_8c4be8f845580134 ON public.crm_permanent_alerts USING btree (tenant_id, dependent_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_8d546a3a38d820a3 ON public.crm_activity USING btree (tenant_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_8dfb95ea764b2c2b ON public.erp_inventory_count_lines USING btree (tenant_id, location_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_8e305bb6ca80f9d2 ON public.commerce_customer_addresses USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_8f9b74879f23ed01 ON public.acct_reconciliation_items USING btree (tenant_id, reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_914833e1ca16f6da ON public.cms_policy_acceptances USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_91ab5461a3735900 ON public.acct_employees USING btree (default_location_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_920e443f19ecf5f8 ON public.crm_surcharges USING btree (applies_to_service_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_926205ec9f338b64 ON public.commerce_batch_slips USING btree (tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_92717acccdd3374f ON public.commerce_audit_log USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_92f315e93610bc1b ON public.commerce_sales USING btree (tenant_id, cart_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_934b38a5126902d8 ON public.locations USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_93584d6c4f5fbd98 ON public.commerce_subscriptions USING btree (tenant_id, dependent_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_93bf89f8c7469180 ON public.crm_customer_behavior USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_953c2dc5cf5d6a28 ON public.acct_ap_purchase_orders USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_95a88e0abeabc347 ON public.erp_inventory_cost_layers USING btree (tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_95fad7f1a1c618ae ON public.crm_activity USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_9600c567a7f279a7 ON public.commerce_refunds USING btree (approved_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_96bf7bb99743bf48 ON public.purchase_orders USING btree (converted_bill_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_970d8b7e3a822c7b ON public.erp_vendor_items USING btree (tenant_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_9748ef63e579485c ON public.bill_items USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_9760ac4983ee8c9f ON public.commerce_order_events USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_97c3ea1962105144 ON public.cms_navigation USING btree (page_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_97fecd3211d9247c ON public.acct_account_dimension_rules USING btree (tenant_id, account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_9822cb6936afcf42 ON public.crm_commission_rules USING btree (plan_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_9852f1337c4ccb2c ON public.acct_revenue_recognition_schedules USING btree (journal_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_98a19664530b7ca8 ON public.crm_commission_entries USING btree (staff_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_9a4a1226b78af2ef ON public.commerce_disputes USING btree (tenant_id, refund_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_9beb73fc1b91f76c ON public.erp_inventory_serial_numbers USING btree (tenant_id, lot_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_9bef4c952672e619 ON public.commerce_customer_payment_methods USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_9e06d934cb239b57 ON public.commerce_payment_allocations USING btree (sale_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_9ea898831ea6c708 ON public.bank_transactions USING btree (matched_journal_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_9eeb86018e3d9dce ON public.acct_recurring_journals USING btree (tenant_id, book_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_9f2b04387cc84e2a ON public.commerce_carts USING btree (tenant_id, dependent_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_9fa86579cd5439f4 ON public.acct_fx_revaluation_runs USING btree (tenant_id, journal_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_9fb4451d582dc91b ON public.erp_vendor_items USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_9fc4bfea1b681b74 ON public.commerce_payments USING btree (branch_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_9ffdc7b0f1b185a3 ON public.crm_needs_attention USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_a1b103ecdc183303 ON public.payroll_employees USING btree (tax_payable_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_a2bff1b0363a6092 ON public.commerce_sales USING btree (tenant_id, acct_invoice_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_a2d98161b46a418b ON public.crm_staff_shifts USING btree (staff_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_a2e078928249573d ON public.crm_staff_shifts USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_a31e37d78429b71a ON public.crm_time_off_requests USING btree (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_a393e8b7461039e1 ON public.commerce_subscription_payments USING btree (payment_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_a3d04c548e421c24 ON public.crm_service_package_items USING btree (service_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_a4aac9bf367d2383 ON public.erp_inventory_count_sessions USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_a50c3803c8c3ba11 ON public.crm_commission_rules USING btree (service_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_a5ee1b474a26e81a ON public.cms_page_revisions USING btree (page_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_a65e7a14c621dfbb ON public.acct_asset_classes USING btree (tenant_id, depreciation_expense_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_a6efa2f56cf1fe44 ON public.acct_consolidation_runs USING btree (tenant_id, journal_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_a7046b694bbee175 ON public.commerce_payments USING btree (tenant_id, acct_receipt_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_a72524be55ae6ee6 ON public.acct_timesheets USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_a73aae8959adb669 ON public.crm_funnel_events USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_a756877b2d5035d9 ON public.estimates USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_a79c502898e7a822 ON public.commerce_sales USING btree (tenant_id, appointment_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_a877efadf09ae36d ON public.chart_of_accounts USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_a9184f613a7ebaf2 ON public.recurring_invoices USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_a96db645e9bf3d13 ON public.commerce_branches USING btree (tenant_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_a96f379f78ea6280 ON public.commerce_shipping_labels USING btree (tenant_id, shipment_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_aa267bb005b7804a ON public.portal_customer_accounts USING btree (tenant_id, invited_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_abcf660b1c14078d ON public.acct_lease_payments USING btree (lease_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_abe5f0aa3d6d1967 ON public.commerce_deposits USING btree (tenant_id, dependent_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_acc67f2aa7439a1b ON public.erp_inventory_transfers USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_adb69883a60a4154 ON public.checkouts USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_ae042d2f07dab9f3 ON public.erp_pick_waves USING btree (tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_ae51cc46caa90199 ON public.acct_fx_revaluation_runs USING btree (tenant_id, book_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_aee7c6c8caaf2a84 ON public.crm_lead_activities USING btree (tenant_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_af167181eb5616c2 ON public.crm_pricing_rules USING btree (service_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_af8b47796de3aef1 ON public.cms_gallery_items USING btree (dependent_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b0f60c742c772914 ON public.erp_return_inspections USING btree (tenant_id, rma_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b0fa137122811c15 ON public.crm_staff_training_records USING btree (tenant_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b15d0954732ef4e8 ON public.crm_activity USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b2194845caffdf29 ON public.commerce_deposits USING btree (transferred_to_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b262db7e6c42ba33 ON public.commerce_refunds USING btree (tenant_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b29214889c1cef46 ON public.commerce_receipts USING btree (tenant_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b376138a8e4e7b7e ON public.acct_fx_revaluation_runs USING btree (tenant_id, period_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b4c9bdb2916e5ad8 ON public.commerce_subscription_plan_items USING btree (service_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b4deb43d9b83c0e4 ON public.acct_intercompany_partners USING btree (tenant_id, from_entity_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b50c5c41ee5b8a8e ON public.acct_intercompany_partners USING btree (tenant_id, to_entity_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b5479ab72b7d8c50 ON public.cms_banners USING btree (target_page_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b5c97afcce63722b ON public.acct_reconciliation_items USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b5de11dbbddf7ea7 ON public.acct_allocations USING btree (tenant_id, driver_dimension_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b673c6031329fc61 ON public.acct_ap_purchase_orders USING btree (tenant_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b688c951072da23b ON public.cms_policy_acceptances USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b6e9be2de9e58fd0 ON public.purchase_order_items USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b71c669dadbac1fa ON public.acct_intercompany_transactions USING btree (tenant_id, from_entity_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b7846788640f2dc4 ON public.crm_activity USING btree (tenant_id, appointment_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b792c16347fcd9f7 ON public.acct_ap_purchase_orders USING btree (tenant_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b7a26a7fd4494ebc ON public.crm_staff_commission_assignments USING btree (plan_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b81930145ee9d0dc ON public.purchase_orders USING btree (vendor_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_b89fa6873c6ffe5a ON public.commerce_inventory_events USING btree (tenant_id, movement_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_ba37a76cc14ba9ce ON public.acct_budget_versions USING btree (tenant_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_ba8c3c28b2f353a8 ON public.erp_inventory_reservations USING btree (tenant_id, location_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_bab21bf91a73f59c ON public.acct_ap_payment_applications USING btree (bill_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_bab8658cc2fca617 ON public.erp_inventory_cost_layers USING btree (tenant_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_bb0bd8fdc9a2b94c ON public.erp_pick_tasks USING btree (tenant_id, wave_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_bccf9f45121affa0 ON public.commerce_inventory_events USING btree (tenant_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_bd79304f54129fa1 ON public.acct_asset_depreciation_lines USING btree (asset_book_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_bd81c16afb6c886f ON public.acct_intercompany_partners USING btree (tenant_id, due_to_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_be2d05d84193d664 ON public.crm_waitlist USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_be3048abc8f17cc2 ON public.erp_replenishment_recommendations USING btree (tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_be3131e728c0e159 ON public.commerce_payments USING btree (tenant_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_bed2a0decdb8c32c ON public.erp_return_inspections USING btree (tenant_id, return_line_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_bf73573f51cdd84d ON public.platform_customer_identity_links USING btree (tenant_id, crm_customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_bfebc2c2e7dd89cf ON public.acct_workflow_actions USING btree (workflow_instance_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_c0cfbfd42c04c99b ON public.commerce_export_jobs USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_c115a56317794f55 ON public.crm_time_off_requests USING btree (staff_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_c143844ba40237b5 ON public.crm_lead_activities USING btree (tenant_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_c1940613a49b51b7 ON public.bills USING btree (journal_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_c1f9dbb2c633a83c ON public.crm_document_types USING btree (cms_page_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_c2d167e7ec28d72d ON public.erp_inventory_transfer_lines USING btree (tenant_id, sku_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_c3328e86f43a5738 ON public.commerce_loyalty_transactions USING btree (sale_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_c384df4e3d9db54d ON public.crm_merge_log USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_c416c72d5887202f ON public.customers USING btree (ap_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_c4f17a8c9f0574c1 ON public.erp_product_skus USING btree (tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_c5b4224e7704aef2 ON public.acct_fixed_assets USING btree (tenant_id, asset_class_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_c5e0ec61d4e79c74 ON public.acct_employees USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_c602586687205295 ON public.recurring_invoice_items USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_c60dd5b98203995b ON public.crm_commission_entries USING btree (reversal_of_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_c6bd4072a4070743 ON public.tenant_memberships USING btree (mfa_reset_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_c75e547d79542586 ON public.commerce_gift_cards USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_c7909ddfef64e04b ON public.acct_entities USING btree (parent_entity_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_c7cdc86aa25a8a63 ON public.crm_communication_preferences USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_c81023eccb8c38ba ON public.acct_consolidation_groups USING btree (reporting_currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_c8cd996a320ecfaf ON public.erp_pick_tasks USING btree (assigned_to);
CREATE INDEX IF NOT EXISTS idx_fk_pub_ca195995e2f89bc3 ON public.commerce_promotion_items USING btree (tenant_id, catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_cbc1614f390c0907 ON public.acct_allocation_rules USING btree (allocation_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_cc4e8b5b52e42835 ON public.commerce_subscription_items USING btree (catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_ccc4c91c4a209eff ON public.crm_needs_attention USING btree (tenant_id, appointment_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_ccce4c0aae73e790 ON public.acct_budget_lines USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_cd5e7833ac1e9945 ON public.acct_revenue_contracts USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_ce5842740f1a0795 ON public.commerce_refunds USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_ce59a18684e38298 ON public.crm_commission_entries USING btree (appointment_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_ce860261b729ba7e ON public.commerce_sales USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_cf6f0b8f030b9a26 ON public.acct_revenue_contracts USING btree (tenant_id, entity_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_cf9ed3826c92cbf8 ON public.acct_intercompany_transactions USING btree (tenant_id, to_entity_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_cfa4a32ac3e345ff ON public.commerce_cart_lines USING btree (catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_cfaed1e2d9772333 ON public.commerce_promotion_items USING btree (tenant_id, promotion_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_d0280e02553ef6ed ON public.crm_audit_log USING btree (tenant_id, actor_staff_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_d0d5d5fdaaa8373e ON public.erp_inventory_count_lines USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_d14c0bc1648653e8 ON public.crm_waitlist USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_d1d194e07cd77755 ON public.reconciliations USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_d33252ecbb6a03f5 ON public.purchase_order_items USING btree (tax_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_d36171fb8304b2a0 ON public.crm_commission_entries USING btree (plan_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_d3aef0f45194afb9 ON public.commerce_sales USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_d3e24db29f29d64e ON public.acct_consolidation_runs USING btree (tenant_id, period_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_d453c9190c33d8fd ON public.crm_waitlist USING btree (tenant_id, service_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_d53f7acd7bf5699d ON public.acct_intercompany_transactions USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_d5e39edd4a1648c3 ON public.acct_allocations USING btree (tenant_id, source_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_d5ed5fee151e3fb4 ON public.commerce_sale_discounts USING btree (coupon_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_d710e698cdbfb220 ON public.cms_pages USING btree (parent_page_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_d877768fca8a70dc ON public.acct_ar_collections_cases USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_d908a9a61178ac2e ON public.payroll_run_items USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_d97f79850b4c13d2 ON public.crm_automation_enrollments USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_d9b42f659c052a9f ON public.acct_book_account_mappings USING btree (tenant_id, target_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_da02328bc1ef70bd ON public.commerce_prices USING btree (tenant_id, catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_dab9ce1a2cf26949 ON public.recurring_invoice_items USING btree (recurring_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_dad57025dd8a15e8 ON public.acct_book_account_mappings USING btree (tenant_id, target_book_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_dadb9baab84f0df9 ON public.erp_return_refunds USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_dc9ed4e97c741f0c ON public.acct_expense_lines USING btree (expense_report_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_dcd07c02ccd97b91 ON public.commerce_channel_events USING btree (tenant_id, channel_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_dcd56d75d1af2ddf ON public.erp_return_inspections USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_dce75ae17945281c ON public.crm_product_recommendations USING btree (recommended_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_dceaaae3efc2bcf1 ON public.acct_ap_approvals USING btree (tenant_id, purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_dcfa32567842492c ON public.sales_order_items USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_ddd6cc966ccad208 ON public.sales_orders USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_dee1c4a74f4d0c58 ON public.acct_timesheets USING btree (approved_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_df1a3b86834ff77d ON public.cms_navigation USING btree (parent_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_df6127c26550f708 ON public.crm_merge_log USING btree (tenant_id, merged_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e08e17c324494586 ON public.commerce_posting_events USING btree (tenant_id, journal_batch_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e0e213bc8ecd05b1 ON public.tenant_memberships USING btree (invited_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e0ed0473fe0c0f12 ON public.commerce_channel_products USING btree (tenant_id, channel_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e0f79367d31f3d84 ON public.crm_activity USING btree (tenant_id, dependent_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e126b688070670a7 ON public.erp_pick_task_lines USING btree (tenant_id, fulfillment_line_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e190ae1942898798 ON public.platform_vendor_identity_links USING btree (tenant_id, erp_vendor_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e1ce1d0e2d69174f ON public.receipts USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e1f913b204c7eabc ON public.acct_consolidation_members USING btree (entity_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e26e177bc278b783 ON public.acct_recurring_invoice_lines USING btree (service_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e31b2e847638e66b ON public.commerce_sales USING btree (tenant_id, erp_order_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e41587a749260827 ON public.commerce_channel_products USING btree (tenant_id, catalog_item_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e43612e00c150ebb ON public.erp_inventory_cost_layers USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e460a83ac6852774 ON public.commerce_store_credits USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e4911ffd00545fd1 ON public.commerce_gift_cards USING btree (tenant_id, purchaser_customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e4cfa22554d32fab ON public.erp_goods_receipts USING btree (tenant_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e5cde182e6acde35 ON public.erp_package_items USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e64bbe266e158dac ON public.crm_customer_contact_methods USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e66680ac0ce625be ON public.acct_reconciliation_items USING btree (tenant_id, bank_transaction_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e77b48b858b392a5 ON public.commerce_sale_lines USING btree (sku_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e7ada80dded3bc2e ON public.crm_service_package_items USING btree (package_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e830a07ca4120633 ON public.commerce_fulfillment_events USING btree (tenant_id, fulfillment_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e920bd25284c6182 ON public.crm_automation_enrollments USING btree (tenant_id, dependent_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e951c92ea24e6fb6 ON public.acct_payroll_tax_forms USING btree (filed_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_e9ca5adc6b5fabde ON public.receipt_items USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_ea406d9c96497b3c ON public.acct_bank_statements USING btree (tenant_id, bank_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_ea6f8f17b62186c1 ON public.commerce_subscription_invoices USING btree (tenant_id, subscription_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_eaaf4b46f5b2f881 ON public.erp_product_categories USING btree (parent_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_eb87f00562cff46b ON public.acct_asset_classes USING btree (tenant_id, asset_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_ec0b76c836bf7945 ON public.commerce_deposits USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_ec4fc5bb0e28c9d3 ON public.commerce_fulfillment_events USING btree (tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_ec878c13a9368b18 ON public.commerce_accounting_mappings USING btree (tenant_id, payment_method_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_eccb48e4fc54e977 ON public.commerce_refunds USING btree (rejected_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_ecdeece89eeaccf5 ON public.acct_payroll_tax_forms USING btree (vendor_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_eceee62d11701e75 ON public.cms_gallery_items USING btree (service_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_ed7c97d715ec1626 ON public.platform_admin_access_log USING btree (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_ee595206f39e0336 ON public.purchase_order_items USING btree (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_ef63d75266a70698 ON public.erp_inventory_count_lines USING btree (tenant_id, count_session_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_efbdcf028974cd48 ON public.crm_waitlist USING btree (tenant_id, location_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f01a3567b409721c ON public.commerce_carts USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f04ea0e88961b1e0 ON public.acct_book_account_mappings USING btree (tenant_id, source_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f0e54f2e9f7483c7 ON public.acct_asset_books USING btree (book_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f1098345d7e6a572 ON public.acct_reconciliations USING btree (tenant_id, bank_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f15183af8616d6df ON public.receipts USING btree (journal_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f1729777d9b78fc4 ON public.reconciliations USING btree (bank_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f1b1f2c8b10dd610 ON public.commerce_sale_taxes USING btree (sale_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f1f9d1e41530904a ON public.erp_product_variants USING btree (tenant_id, product_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f24c3d8c8c62cdf8 ON public.erp_replenishment_recommendations USING btree (tenant_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f258cb4a451b7b5f ON public.acct_allocation_rules USING btree (destination_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f3088bb1c345124a ON public.commerce_order_events USING btree (tenant_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f53646bd021bd7e9 ON public.acct_revenue_recognition_schedules USING btree (period_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f565ee191b3060c7 ON public.commerce_payments USING btree (location_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f5a3c6f9c1b89739 ON public.crm_commission_tiers USING btree (plan_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f5d6b15f2bd6db8f ON public.cms_policy_acceptances USING btree (page_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f5db954363cd0b55 ON public.acct_revenue_performance_obligations USING btree (revenue_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f617c43f7a460567 ON public.crm_automation_runs USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f624e203277b9a55 ON public.crm_staff_shifts USING btree (location_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f6b23505c331eb91 ON public.crm_staff_performance_notes USING btree (tenant_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f77271edfa4a3f76 ON public.acct_tax_codes USING btree (tenant_id, receivable_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f7ffe673b82a17f1 ON public.invoices USING btree (currency);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f85d56625464df87 ON public.erp_inventory_transfers USING btree (tenant_id, from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f94987f823cb9623 ON public.commerce_carts USING btree (tenant_id, register_session_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f94ff7df47adb1ce ON public.acct_customer_statements USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f95c88f1e87fbada ON public.erp_goods_receipt_lines USING btree (tenant_id, receipt_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_f9bb723504f8b18c ON public.commerce_refunds USING btree (store_credit_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_fa146d5d4cb9e5d0 ON public.commerce_accounting_mappings USING btree (tenant_id, revenue_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_fa266ab7285951db ON public.crm_lead_activities USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_fa9c133b77ef8d3a ON public.receipts USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_fabbf2e699694519 ON public.commerce_carts USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_fb9fbb2822bf8af4 ON public.cms_page_revisions USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_fk_pub_fbc4e1d69f745dac ON public.recurring_invoice_items USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_fcde49a267f8d2b5 ON public.acct_tax_codes USING btree (tenant_id, jurisdiction_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_fd8f0fc5c38389d7 ON public.crm_document_versions USING btree (tenant_id, document_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_ff834057ed5a9e2a ON public.commerce_store_credit_transactions USING btree (sale_id);
CREATE INDEX IF NOT EXISTS idx_fk_pub_fff1a7de36a2e670 ON public.crm_permanent_alerts USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_label_attempts_order ON public.fulfillment_label_attempts USING btree (tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_label_attempts_status ON public.fulfillment_label_attempts USING btree (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_fulfillment_package_lines_item ON public.fulfillment_package_lines USING btree (order_item_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_package_lines_package ON public.fulfillment_package_lines USING btree (package_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_packages_order ON public.fulfillment_packages USING btree (tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_fulfillment_packages_seller ON public.fulfillment_packages USING btree (tenant_id, seller_id, state);
CREATE INDEX IF NOT EXISTS idx_fulfillment_packages_seller_order ON public.fulfillment_packages USING btree (seller_order_id);
CREATE INDEX IF NOT EXISTS idx_gct_card ON public.acct_gift_card_transactions USING btree (gift_card_id, created_at);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_goods_receipt_id ON public.goods_receipt_lines USING btree (goods_receipt_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_po_line_id ON public.goods_receipt_lines USING btree (po_line_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_location_id ON public.goods_receipts USING btree (location_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_purchase_order_id ON public.goods_receipts USING btree (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_google_ga4_landing_date ON public.google_ga4_landing_pages USING btree (property_id, report_date);
CREATE INDEX IF NOT EXISTS idx_google_indexing_submissions_recent ON public.google_indexing_submissions USING btree (status, last_submitted_at);
CREATE INDEX IF NOT EXISTS idx_google_indexing_submissions_status ON public.google_indexing_submissions USING btree (status, last_attempt_at);
CREATE INDEX IF NOT EXISTS idx_google_merchant_runs_recent ON public.google_merchant_sync_runs USING btree (finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_google_merchant_sync_state ON public.google_merchant_sync_state USING btree (state);
CREATE INDEX IF NOT EXISTS idx_google_property_runs_leg_recent ON public.google_property_sync_runs USING btree (leg, finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_google_sc_daily_date ON public.google_search_console_daily USING btree (property_url, report_date);
CREATE INDEX IF NOT EXISTS idx_integration_secrets_category ON public.integration_secrets USING btree (category);
CREATE INDEX IF NOT EXISTS idx_integration_secrets_service ON public.integration_secrets USING btree (service_key);
CREATE INDEX IF NOT EXISTS idx_locations_seller_id ON public.locations USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_node_associations_target_node_id ON public.node_associations USING btree (target_node_id);
CREATE INDEX IF NOT EXISTS idx_node_filter_values_attribute_value_id ON public.node_filter_values USING btree (attribute_value_id);
CREATE INDEX IF NOT EXISTS idx_node_filters_attribute_id ON public.node_filters USING btree (attribute_id);
CREATE INDEX IF NOT EXISTS idx_offers_tenant_id ON public.offers USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_cases_tenant_customer ON public.order_cases USING btree (tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_order_cases_tenant_order ON public.order_cases USING btree (tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_order_shipping_estimates_order ON public.order_shipping_estimates USING btree (order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_effect_dedupe_key ON public.commerce_outbox_events USING btree ((((payload -> 'data'::text) ->> 'dedupe_key'::text))) WHERE (((payload -> 'data'::text) ->> 'dedupe_key'::text) IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_partner_application_documents_seller_id ON public.partner_application_documents USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_partner_application_documents_verification_task_id ON public.partner_application_documents USING btree (verification_task_id);
CREATE INDEX IF NOT EXISTS idx_paypal_webhook_events_type_received ON public.paypal_webhook_events USING btree (event_type, received_at);
CREATE INDEX IF NOT EXISTS idx_perk_ledger_user_id ON public.perk_ledger USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_platform_account_subscriptions_tenant_id_offer_id ON public.platform_account_subscriptions USING btree (tenant_id, offer_id);
CREATE INDEX IF NOT EXISTS idx_portal_user_preferences_tenant_id ON public.portal_user_preferences USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_privacy_request_details_tenant_id_ticket_id ON public.privacy_request_details USING btree (tenant_id, ticket_id);
CREATE INDEX IF NOT EXISTS idx_product_attribute_values_attribute_value_id ON public.product_attribute_values USING btree (attribute_value_id);
CREATE INDEX IF NOT EXISTS idx_product_relations_product_id ON public.product_relations USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_promo_id ON public.promo_redemptions USING btree (promo_id);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user_id ON public.promo_redemptions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_variant_id ON public.purchase_order_lines USING btree (variant_id);
CREATE INDEX IF NOT EXISTS idx_related_search_page_products_product_id ON public.related_search_page_products USING btree (product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_customer_id ON public.reviews USING btree (customer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_tenant_id ON public.reviews USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sc_products_category_id ON public.supplier_catalog_products USING btree (category_id);
CREATE INDEX IF NOT EXISTS idx_sc_products_image_url ON public.supplier_catalog_products USING btree (image_url DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_sc_variants_product_id ON public.supplier_catalog_variants USING btree (supplier_catalog_product_id);
CREATE INDEX IF NOT EXISTS idx_seller_1099k_generations_seller_id ON public.seller_1099k_generations USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_ad_campaigns_listing_id ON public.seller_ad_campaigns USING btree (listing_id);
CREATE INDEX IF NOT EXISTS idx_seller_ad_campaigns_seller_id ON public.seller_ad_campaigns USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_advertising_enrollments_seller_id ON public.seller_advertising_enrollments USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_brand_authorizations_brand_id ON public.seller_brand_authorizations USING btree (brand_id);
CREATE INDEX IF NOT EXISTS idx_seller_category_approvals_node_id ON public.seller_category_approvals USING btree (node_id);
CREATE INDEX IF NOT EXISTS idx_seller_customer_messages_seller_id ON public.seller_customer_messages USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_customer_notes_seller_id ON public.seller_customer_notes USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_data_processing_seller_id ON public.seller_data_processing USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_dpa_acceptances_policy_id ON public.seller_dpa_acceptances USING btree (policy_id);
CREATE INDEX IF NOT EXISTS idx_seller_dpa_acceptances_seller_id ON public.seller_dpa_acceptances USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_inventory_settings_seller_id ON public.seller_inventory_settings USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_live_streams_seller_id ON public.seller_live_streams USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_login_activity_seller_id ON public.seller_login_activity USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_notification_preferences_seller_id ON public.seller_notification_preferences USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_performance_alerts_seller_id ON public.seller_performance_alerts USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_policy_enforcement_policy_id ON public.seller_policy_enforcement USING btree (policy_id);
CREATE INDEX IF NOT EXISTS idx_seller_policy_enforcement_seller_id ON public.seller_policy_enforcement USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_policy_enforcement_violation_id ON public.seller_policy_enforcement USING btree (violation_id);
CREATE INDEX IF NOT EXISTS idx_seller_sales_rewards_seller_id ON public.seller_sales_rewards USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_settlement_reversals_order ON public.seller_settlement_reversals USING btree (tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_seller_settlement_reversals_settlement ON public.seller_settlement_reversals USING btree (tenant_id, settlement_id);
CREATE INDEX IF NOT EXISTS idx_seller_settlements_due ON public.seller_settlements USING btree (tenant_id, execute_after) WHERE (state = 'pending'::text);
CREATE INDEX IF NOT EXISTS idx_seller_settlements_order ON public.seller_settlements USING btree (tenant_id, order_id);
CREATE INDEX IF NOT EXISTS idx_seller_settlements_seller ON public.seller_settlements USING btree (tenant_id, seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_seller_social_posts_seller_id ON public.seller_social_posts USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_solution_providers_seller_id ON public.seller_solution_providers USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_stripe_accounts_seller_id ON public.seller_stripe_accounts USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_tax_exemptions_seller_id ON public.seller_tax_exemptions USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_webhook_deliveries_seller_id ON public.seller_webhook_deliveries USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_seller_webhooks_seller_id ON public.seller_webhooks USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_shipping_profiles_supplier ON public.shipping_profiles USING btree (supplier_id);
CREATE INDEX IF NOT EXISTS idx_social_data_deletion_requests_seller_id ON public.social_data_deletion_requests USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_social_data_deletion_requests_tenant_id ON public.social_data_deletion_requests USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_social_media_assets_seller_id ON public.social_media_assets USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_social_media_assets_tenant_id ON public.social_media_assets USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_social_oauth_states_seller_id ON public.social_oauth_states USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_social_oauth_states_tenant_id ON public.social_oauth_states USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_social_oauth_states_user_id ON public.social_oauth_states USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_social_oauth_tokens_tenant_id ON public.social_oauth_tokens USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_social_outbox_events_seller_id ON public.social_outbox_events USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_social_outbox_events_tenant_id ON public.social_outbox_events USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_social_post_media_media_asset_id ON public.social_post_media USING btree (media_asset_id);
CREATE INDEX IF NOT EXISTS idx_social_post_media_tenant_id ON public.social_post_media USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_social_post_series_author_id ON public.social_post_series USING btree (author_id);
CREATE INDEX IF NOT EXISTS idx_social_post_series_listing_id ON public.social_post_series USING btree (listing_id);
CREATE INDEX IF NOT EXISTS idx_social_post_series_seller_id ON public.social_post_series USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_social_post_series_tenant_id ON public.social_post_series USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_social_post_targets_seller_id ON public.social_post_targets USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_social_post_targets_social_account_id ON public.social_post_targets USING btree (social_account_id);
CREATE INDEX IF NOT EXISTS idx_social_post_targets_tenant_id ON public.social_post_targets USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_social_publish_attempts_post_target_id ON public.social_publish_attempts USING btree (post_target_id);
CREATE INDEX IF NOT EXISTS idx_social_publish_attempts_seller_id ON public.social_publish_attempts USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_social_publish_attempts_tenant_id ON public.social_publish_attempts USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_social_schedule_slots_seller_id ON public.social_schedule_slots USING btree (seller_id);
CREATE INDEX IF NOT EXISTS idx_social_schedule_slots_tenant_id ON public.social_schedule_slots USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sources_tenant_id ON public.sources USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_specs_lookup ON public.supplier_print_specs USING btree (canonical_product_id, supplier_name);
CREATE INDEX IF NOT EXISTS idx_stripe_pending_charges_sale_id ON public.stripe_pending_charges USING btree (sale_id);
CREATE INDEX IF NOT EXISTS idx_stripe_pending_charges_tenant_status ON public.stripe_pending_charges USING btree (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_claim ON public.stripe_webhook_events USING btree (status, available_at, received_at);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_type_received ON public.stripe_webhook_events USING btree (event_type, received_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id ON public.subscriptions USING btree (plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_supply_service_map_service_id ON public.supply_service_map USING btree (service_id);
CREATE INDEX IF NOT EXISTS idx_support_automations_inherits_from_id ON public.support_automations USING btree (inherits_from_id);
CREATE INDEX IF NOT EXISTS idx_support_business_hours_inherits_from_id ON public.support_business_hours USING btree (inherits_from_id);
CREATE INDEX IF NOT EXISTS idx_support_case_details_tenant_id_ticket_id ON public.support_case_details USING btree (tenant_id, ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_contact_notes_author_staff_id ON public.support_contact_notes USING btree (author_staff_id);
CREATE INDEX IF NOT EXISTS idx_support_drafts_staff_id ON public.support_drafts USING btree (staff_id);
CREATE INDEX IF NOT EXISTS idx_support_holidays_inherits_from_id ON public.support_holidays USING btree (inherits_from_id);
CREATE INDEX IF NOT EXISTS idx_support_notification_prefs_staff_id ON public.support_notification_prefs USING btree (staff_id);
CREATE INDEX IF NOT EXISTS idx_support_notifications_recipient_staff_id ON public.support_notifications USING btree (recipient_staff_id);
CREATE INDEX IF NOT EXISTS idx_support_report_daily_team_id ON public.support_report_daily USING btree (team_id);
CREATE INDEX IF NOT EXISTS idx_support_routing_rules_inherits_from_id ON public.support_routing_rules USING btree (inherits_from_id);
CREATE INDEX IF NOT EXISTS idx_support_routing_rules_sla_policy_id ON public.support_routing_rules USING btree (sla_policy_id);
CREATE INDEX IF NOT EXISTS idx_support_routing_rules_target_staff_id ON public.support_routing_rules USING btree (target_staff_id);
CREATE INDEX IF NOT EXISTS idx_support_routing_rules_target_team_id ON public.support_routing_rules USING btree (target_team_id);
CREATE INDEX IF NOT EXISTS idx_support_side_conversation_messages_author_staff_id ON public.support_side_conversation_messages USING btree (author_staff_id);
CREATE INDEX IF NOT EXISTS idx_support_side_conversation_participants_added_by_staff_id ON public.support_side_conversation_participants USING btree (added_by_staff_id);
CREATE INDEX IF NOT EXISTS idx_support_side_conversation_participants_staff_id ON public.support_side_conversation_participants USING btree (staff_id);
CREATE INDEX IF NOT EXISTS idx_support_signatures_team_id ON public.support_signatures USING btree (team_id);
CREATE INDEX IF NOT EXISTS idx_support_templates_inherits_from_id ON public.support_templates USING btree (inherits_from_id);
CREATE INDEX IF NOT EXISTS idx_support_ticket_access_grants_granted_by_staff_id ON public.support_ticket_access_grants USING btree (granted_by_staff_id);
CREATE INDEX IF NOT EXISTS idx_support_ticket_access_grants_revoked_by_staff_id ON public.support_ticket_access_grants USING btree (revoked_by_staff_id);
CREATE INDEX IF NOT EXISTS idx_support_webhook_deliveries_job_id ON public.support_webhook_deliveries USING btree (job_id);
CREATE INDEX IF NOT EXISTS idx_support_webhook_deliveries_tenant_id_webhook_id ON public.support_webhook_deliveries USING btree (tenant_id, webhook_id);
CREATE INDEX IF NOT EXISTS idx_support_webhook_deliveries_ticket_id ON public.support_webhook_deliveries USING btree (ticket_id);
CREATE INDEX IF NOT EXISTS idx_support_webhooks_outbound_created_by_staff_id ON public.support_webhooks_outbound USING btree (created_by_staff_id);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON public.sync_jobs USING btree (status, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_tenant ON public.sync_jobs USING btree (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_templates_lookup ON public.supplier_mockup_templates USING btree (canonical_product_id, supplier_name, placement_tag);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_pending_invites ON public.tenant_memberships USING btree (tenant_id, invite_expires_at) WHERE ((invite_accepted_at IS NULL) AND (invited_email IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_memberships_tenant_user ON public.tenant_memberships USING btree (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_session_tabs_groups ON public.user_session_tabs USING btree (session_id, group_id);
CREATE INDEX IF NOT EXISTS idx_user_session_tabs_lookup ON public.user_session_tabs USING btree (session_id, tab_order);
CREATE INDEX IF NOT EXISTS idx_variant_axis_values_attribute_value_id ON public.variant_axis_values USING btree (attribute_value_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invoice_lines_po_line_id ON public.vendor_invoice_lines USING btree (po_line_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invoice_lines_vendor_invoice_id ON public.vendor_invoice_lines USING btree (vendor_invoice_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invoices_purchase_order_id ON public.vendor_invoices USING btree (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_vendor_invoices_tenant_id ON public.vendor_invoices USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS invoice_items_tenant_id_idx ON public.invoice_items USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS invoices_search_vector_gin_idx ON public.invoices USING gin (search_vector);
CREATE INDEX IF NOT EXISTS invoices_tenant_idx ON public.invoices USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS ix_brand_placements_node ON public.brand_placements USING btree (node_id, status);
CREATE INDEX IF NOT EXISTS ix_node_filters_node ON public.node_filters USING btree (node_id, sort_order);
CREATE INDEX IF NOT EXISTS ix_offers_variant ON public.offers USING btree (variant_id, status);
CREATE INDEX IF NOT EXISTS ix_pav_facet ON public.product_attribute_values USING btree (attribute_id, attribute_value_id);
CREATE INDEX IF NOT EXISTS ix_po_brand_status ON public.purchase_orders USING btree (brand_id, status);
CREATE INDEX IF NOT EXISTS ix_pol_node ON public.purchase_order_lines USING btree (node_id);
CREATE INDEX IF NOT EXISTS ix_product_nodes_node ON public.product_nodes USING btree (node_id);
CREATE INDEX IF NOT EXISTS ix_related_target ON public.related_search_pages USING btree (target_node_id);
CREATE INDEX IF NOT EXISTS ix_taxonomy_animal ON public.taxonomy_nodes USING btree (subject_id);
CREATE INDEX IF NOT EXISTS ix_taxonomy_parent ON public.taxonomy_nodes USING btree (parent_id, sort_order);
CREATE INDEX IF NOT EXISTS ix_taxonomy_path ON public.taxonomy_nodes USING btree (tenant_id, path text_pattern_ops);
CREATE INDEX IF NOT EXISTS je_source_idx ON public.journal_entries USING btree (source, source_id);
CREATE INDEX IF NOT EXISTS je_tenant_date_idx ON public.journal_entries USING btree (tenant_id, entry_date);
CREATE INDEX IF NOT EXISTS jl_customer_idx ON public.journal_lines USING btree (customer_id);
CREATE INDEX IF NOT EXISTS jl_invoice_idx ON public.journal_lines USING btree (invoice_id);
CREATE INDEX IF NOT EXISTS jl_journal_idx ON public.journal_lines USING btree (journal_id);
CREATE INDEX IF NOT EXISTS jl_order_idx ON public.journal_lines USING btree (order_id);
CREATE INDEX IF NOT EXISTS jl_payment_idx ON public.journal_lines USING btree (payment_id);
CREATE INDEX IF NOT EXISTS jl_tenant_account_idx ON public.journal_lines USING btree (tenant_id, account_id);
CREATE INDEX IF NOT EXISTS jurisdiction_rules_jurisdiction_idx ON public.jurisdiction_rules USING btree (jurisdiction);
CREATE INDEX IF NOT EXISTS licensee_advertisers_email_idx ON public.licensee_advertisers USING btree (contact_email);
CREATE INDEX IF NOT EXISTS licensee_api_keys_advertiser_idx ON public.licensee_api_keys USING btree (advertiser_id);
CREATE INDEX IF NOT EXISTS licensee_creative_designs_advertiser_idx ON public.licensee_creative_designs USING btree (advertiser_id);
CREATE INDEX IF NOT EXISTS licensee_creative_designs_campaign_idx ON public.licensee_creative_designs USING btree (campaign_id);
CREATE INDEX IF NOT EXISTS marketing_suppressions_lookup_idx ON public.marketing_suppressions USING btree (tenant_id, channel, contact);
CREATE UNIQUE INDEX IF NOT EXISTS message_flags_one_open_per_message ON public.message_flags USING btree (message_id) WHERE (status = 'open'::text);
CREATE INDEX IF NOT EXISTS message_flags_tenant_status_idx ON public.message_flags USING btree (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS newsletter_tenant_id_idx ON public.newsletter USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS oauth_states_expires_idx ON public.oauth_states USING btree (expires_at);
CREATE INDEX IF NOT EXISTS onboarding_cases_applicant_token_hash_idx ON public.onboarding_cases USING btree (applicant_token_hash) WHERE (applicant_token_hash IS NOT NULL);
CREATE INDEX IF NOT EXISTS onboarding_cases_email_idx ON public.onboarding_cases USING btree (tenant_id, applicant_email);
CREATE INDEX IF NOT EXISTS onboarding_cases_tenant_state_idx ON public.onboarding_cases USING btree (tenant_id, state);
CREATE INDEX IF NOT EXISTS onboarding_cases_tenant_type_idx ON public.onboarding_cases USING btree (tenant_id, type);
CREATE INDEX IF NOT EXISTS onboarding_cases_user_idx ON public.onboarding_cases USING btree (user_id) WHERE (user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS onboarding_events_case_idx ON public.onboarding_events USING btree (case_id, created_at);
CREATE INDEX IF NOT EXISTS onboarding_gates_case_idx ON public.onboarding_gates USING btree (case_id);
CREATE INDEX IF NOT EXISTS onboarding_gates_expires_idx ON public.onboarding_gates USING btree (expires_at) WHERE (expires_at IS NOT NULL);
CREATE INDEX IF NOT EXISTS onboarding_gates_status_idx ON public.onboarding_gates USING btree (status) WHERE (status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'pending_vendor'::text, 'blocked'::text, 'needs_info'::text]));
CREATE INDEX IF NOT EXISTS order_customers_auth_user_idx ON public.order_customers USING btree (auth_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS order_customers_tenant_email_unique ON public.order_customers USING btree (tenant_id, lower(email));
CREATE INDEX IF NOT EXISTS order_customers_tenant_idx ON public.order_customers USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS order_fulfillment_logs_order_idx ON public.order_fulfillment_logs USING btree (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_application_documents_app_idx ON public.partner_application_documents USING btree (application_kind, application_id, created_at);
CREATE INDEX IF NOT EXISTS partner_application_documents_seller_idx ON public.partner_application_documents USING btree (tenant_id, seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS partner_application_documents_tenant_idx ON public.partner_application_documents USING btree (tenant_id, application_kind, created_at);
CREATE INDEX IF NOT EXISTS partner_pushes_tenant_product_idx ON public.partner_pushes USING btree (tenant_id, product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_transactions_booking_idx ON public.payment_transactions USING btree (booking_id);
CREATE INDEX IF NOT EXISTS payment_transactions_connected_account_id_idx ON public.payment_transactions USING btree (connected_account_id);
CREATE INDEX IF NOT EXISTS payment_transactions_created_idx ON public.payment_transactions USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS payment_transactions_customer_idx ON public.payment_transactions USING btree (customer_id);
CREATE INDEX IF NOT EXISTS payment_transactions_invoice_idx ON public.payment_transactions USING btree (invoice_id);
CREATE INDEX IF NOT EXISTS payment_transactions_order_idx ON public.payment_transactions USING btree (order_id);
CREATE INDEX IF NOT EXISTS payment_transactions_provider_idx ON public.payment_transactions USING btree (provider_transaction_id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_provider_tx_id_uniq ON public.payment_transactions USING btree (provider_transaction_id);
CREATE INDEX IF NOT EXISTS payment_transactions_search_vector_gin_idx ON public.payment_transactions USING gin (search_vector);
CREATE INDEX IF NOT EXISTS payment_transactions_tenant_idx ON public.payment_transactions USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS pdp_behavior_scores_item_idx ON public.pdp_behavior_scores USING btree (item, kind);
CREATE INDEX IF NOT EXISTS pe_tenant_idx ON public.payroll_employees USING btree (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS perk_ledger_idem ON public.perk_ledger USING btree (tenant_id, source, source_id) WHERE ((source_id IS NOT NULL) AND (source <> 'manual'::text));
CREATE INDEX IF NOT EXISTS perk_ledger_user ON public.perk_ledger USING btree (tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_account_subscriptions_account_idx ON public.platform_account_subscriptions USING btree (tenant_id, account_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS platform_account_subscriptions_live_uq ON public.platform_account_subscriptions USING btree (tenant_id, account_user_id, offer_id) WHERE (status = ANY (ARRAY['pending'::text, 'trialing'::text, 'active'::text, 'past_due'::text]));
CREATE INDEX IF NOT EXISTS platform_capabilities_object_code_idx ON public.platform_capabilities USING btree (object_code);
CREATE INDEX IF NOT EXISTS platform_capabilities_tenant_id_idx ON public.platform_capabilities USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS platform_feature_flags_tenant_audience_idx ON public.platform_feature_flags USING btree (tenant_id, audience);
CREATE INDEX IF NOT EXISTS platform_lens_fields_tenant_id_idx ON public.platform_lens_fields USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS platform_lens_labels_tenant_id_idx ON public.platform_lens_labels USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS platform_lenses_object_code_idx ON public.platform_lenses USING btree (object_code);
CREATE INDEX IF NOT EXISTS platform_lenses_tenant_id_idx ON public.platform_lenses USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS platform_objects_tenant_id_idx ON public.platform_objects USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS platform_saved_views_user_entity_idx ON public.platform_saved_views USING btree (user_id, entity_type);
CREATE INDEX IF NOT EXISTS platform_subscription_offers_tenant_active_idx ON public.platform_subscription_offers USING btree (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS platform_tools_tenant_id_idx ON public.platform_tools USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS policies_tenant_id_idx ON public.policies USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS portal_account_links_email_lower_idx ON public.portal_account_links USING btree (lower(email));
CREATE INDEX IF NOT EXISTS portal_account_links_entity_idx ON public.portal_account_links USING btree (entity_type, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS portal_account_links_provider_email_uniq ON public.portal_account_links USING btree (provider, lower(email));
CREATE INDEX IF NOT EXISTS portal_account_links_tenant_idx ON public.portal_account_links USING btree (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS portal_magic_links_open_idx ON public.portal_magic_links USING btree (customer_id, purpose) WHERE (used_at IS NULL);
CREATE INDEX IF NOT EXISTS pr_tenant_idx ON public.payroll_runs USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS pricing_packages_tenant_id_idx ON public.pricing_packages USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS product_questions_product_idx ON public.product_questions USING btree (product_id, visible, created_at DESC);
CREATE INDEX IF NOT EXISTS product_reviews_product_idx ON public.product_reviews USING btree (product_id, visible, created_at DESC);
CREATE INDEX IF NOT EXISTS product_taxonomy_links_path_idx ON public.product_taxonomy_links USING btree (path);
CREATE INDEX IF NOT EXISTS product_taxonomy_links_product_idx ON public.product_taxonomy_links USING btree (product_id);
CREATE INDEX IF NOT EXISTS projects_collection_idx ON public.projects USING btree (collection_id);
CREATE INDEX IF NOT EXISTS projects_owner_idx ON public.projects USING btree (owner_id);
CREATE INDEX IF NOT EXISTS projects_updated_idx ON public.projects USING btree (updated_at DESC);
CREATE INDEX IF NOT EXISTS promo_redemptions_lookup ON public.promo_redemptions USING btree (tenant_id, promo_id, email);
CREATE INDEX IF NOT EXISTS promos_tenant_status ON public.promos USING btree (tenant_id, status);
CREATE INDEX IF NOT EXISTS provider_jobs_design_idx ON public.provider_jobs USING btree (design_id);
CREATE INDEX IF NOT EXISTS provider_jobs_product_idx ON public.provider_jobs USING btree (product_id);
CREATE INDEX IF NOT EXISTS provider_jobs_status_idx ON public.provider_jobs USING btree (status);
CREATE INDEX IF NOT EXISTS pt_employee_idx ON public.payroll_timesheets USING btree (employee_id);
CREATE INDEX IF NOT EXISTS pt_tenant_idx ON public.payroll_timesheets USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS ptf_tenant_idx ON public.payroll_tax_forms USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS purchase_orders_tenant_idx ON public.purchase_orders USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS receipts_tenant_idx ON public.receipts USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS recurring_tenant_idx ON public.recurring_invoices USING btree (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS return_policy_rules_one_category_idx ON public.return_policy_rules USING btree (tenant_id, category_id) WHERE ((scope = 'category'::text) AND (category_id IS NOT NULL) AND is_active AND (NOT is_legal_minimum));
CREATE UNIQUE INDEX IF NOT EXISTS return_policy_rules_one_global_idx ON public.return_policy_rules USING btree (tenant_id) WHERE ((scope = 'global'::text) AND is_active AND (NOT is_legal_minimum));
CREATE UNIQUE INDEX IF NOT EXISTS return_policy_rules_one_legal_minimum_idx ON public.return_policy_rules USING btree (tenant_id) WHERE (is_legal_minimum AND is_active);
CREATE INDEX IF NOT EXISTS return_policy_rules_tenant_idx ON public.return_policy_rules USING btree (tenant_id, scope, is_active);
CREATE INDEX IF NOT EXISTS routes_variant_priority_idx ON public.variant_fulfillment_routes USING btree (product_variant_id, region, priority) WHERE is_active;
CREATE INDEX IF NOT EXISTS sales_orders_tenant_idx ON public.sales_orders USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS search_events_query_idx ON public.search_events USING btree (tenant_id, lower(query));
CREATE INDEX IF NOT EXISTS search_events_tenant_time_idx ON public.search_events USING btree (tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS seller_1099k_generations_key ON public.seller_1099k_generations USING btree (tenant_id, seller_id, tax_year);
CREATE INDEX IF NOT EXISTS seller_1099k_generations_year_idx ON public.seller_1099k_generations USING btree (tenant_id, tax_year);
CREATE INDEX IF NOT EXISTS seller_ad_campaigns_tenant_seller_idx ON public.seller_ad_campaigns USING btree (tenant_id, seller_id);
CREATE INDEX IF NOT EXISTS seller_advertising_enrollments_tenant_seller_idx ON public.seller_advertising_enrollments USING btree (tenant_id, seller_id);
CREATE INDEX IF NOT EXISTS seller_customer_messages_tenant_seller_customer_idx ON public.seller_customer_messages USING btree (tenant_id, seller_id, customer_key, created_at DESC);
CREATE INDEX IF NOT EXISTS seller_customer_notes_tenant_seller_idx ON public.seller_customer_notes USING btree (tenant_id, seller_id);
CREATE INDEX IF NOT EXISTS seller_data_processing_tenant_seller_idx ON public.seller_data_processing USING btree (tenant_id, seller_id);
CREATE INDEX IF NOT EXISTS seller_dpa_acceptances_tenant_seller_idx ON public.seller_dpa_acceptances USING btree (tenant_id, seller_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS seller_email_templates_seller_idx ON public.seller_email_templates USING btree (tenant_id, seller_id);
CREATE UNIQUE INDEX IF NOT EXISTS seller_inventory_settings_seller_uq ON public.seller_inventory_settings USING btree (tenant_id, seller_id);
CREATE INDEX IF NOT EXISTS seller_live_settings_tenant_idx ON public.seller_live_settings USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS seller_live_streams_tenant_seller_idx ON public.seller_live_streams USING btree (tenant_id, seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS seller_live_streams_tenant_status_idx ON public.seller_live_streams USING btree (tenant_id, status);
CREATE INDEX IF NOT EXISTS seller_login_activity_tenant_seller_created_idx ON public.seller_login_activity USING btree (tenant_id, seller_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS seller_notification_preferences_seller_key ON public.seller_notification_preferences USING btree (tenant_id, seller_id);
CREATE INDEX IF NOT EXISTS seller_performance_alerts_tenant_seller_idx ON public.seller_performance_alerts USING btree (tenant_id, seller_id, kpi_key, status);
CREATE INDEX IF NOT EXISTS seller_remediation_plans_tenant_seller_idx ON public.seller_remediation_plans USING btree (tenant_id, seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS seller_remediation_plans_tenant_status_idx ON public.seller_remediation_plans USING btree (tenant_id, status, deadline);
CREATE INDEX IF NOT EXISTS seller_sales_rewards_tenant_seller_idx ON public.seller_sales_rewards USING btree (tenant_id, seller_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS seller_self_serve_profiles_seller_uidx ON public.seller_self_serve_profiles USING btree (seller_id);
CREATE INDEX IF NOT EXISTS seller_self_serve_profiles_user_idx ON public.seller_self_serve_profiles USING btree (user_id);
CREATE INDEX IF NOT EXISTS seller_social_posts_listing_idx ON public.seller_social_posts USING btree (listing_id, created_at DESC) WHERE (listing_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS seller_social_posts_tenant_seller_idx ON public.seller_social_posts USING btree (tenant_id, seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS seller_solution_providers_tenant_seller_idx ON public.seller_solution_providers USING btree (tenant_id, seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS seller_stripe_accounts_tenant_seller_idx ON public.seller_stripe_accounts USING btree (tenant_id, seller_id);
CREATE INDEX IF NOT EXISTS seller_tax_exemptions_tenant_seller_idx ON public.seller_tax_exemptions USING btree (tenant_id, seller_id, status);
CREATE INDEX IF NOT EXISTS seller_tax_remittance_tenant_period_idx ON public.seller_tax_remittance_filings USING btree (tenant_id, period_end DESC);
CREATE INDEX IF NOT EXISTS seller_webhook_deliveries_tenant_seller_idx ON public.seller_webhook_deliveries USING btree (tenant_id, seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS seller_webhook_deliveries_webhook_idx ON public.seller_webhook_deliveries USING btree (webhook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS seller_webhooks_tenant_seller_idx ON public.seller_webhooks USING btree (tenant_id, seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS service_items_tenant_id_idx ON public.service_items USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS service_pricing_tenant_id_idx ON public.service_pricing USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS services_search_vector_gin_idx ON public.services USING gin (search_vector);
CREATE INDEX IF NOT EXISTS services_tenant_idx ON public.services USING btree (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS ship_from_addresses_one_house_default ON public.ship_from_addresses USING btree (tenant_id) WHERE (is_default AND (seller_id IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS ship_from_addresses_one_seller_default ON public.ship_from_addresses USING btree (tenant_id, seller_id) WHERE (is_default AND (seller_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS ship_from_addresses_scope_idx ON public.ship_from_addresses USING btree (tenant_id, seller_id);
CREATE INDEX IF NOT EXISTS shipping_memberships_email_idx ON public.shipping_memberships USING btree (lower(email));
CREATE INDEX IF NOT EXISTS shop_grid_cards_price_idx ON public.shop_grid_cards USING btree (price);
CREATE INDEX IF NOT EXISTS shop_grid_cards_seller_idx ON public.shop_grid_cards USING btree (seller_id);
CREATE INDEX IF NOT EXISTS shop_grid_cards_taxonomy_idx ON public.shop_grid_cards USING gin (taxonomy_node_ids);
CREATE INDEX IF NOT EXISTS side_messages_conversation_idx ON public.support_side_conversation_messages USING btree (tenant_id, side_conversation_id, created_at);
CREATE INDEX IF NOT EXISTS side_participants_conversation_idx ON public.support_side_conversation_participants USING btree (tenant_id, side_conversation_id);
CREATE UNIQUE INDEX IF NOT EXISTS side_participants_email_uq ON public.support_side_conversation_participants USING btree (tenant_id, side_conversation_id, lower(email)) WHERE (email IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS side_participants_staff_uq ON public.support_side_conversation_participants USING btree (tenant_id, side_conversation_id, staff_id) WHERE (staff_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS site_templates_status_idx ON public.site_templates USING btree (status);
CREATE UNIQUE INDEX IF NOT EXISTS social_accounts_tenant_network_external_key ON public.social_accounts USING btree (tenant_id, network, external_account_id) WHERE (external_account_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS social_attempts_prune_idx ON public.social_publish_attempts USING btree (finished_at);
CREATE INDEX IF NOT EXISTS social_outbox_pending_idx ON public.social_outbox_events USING btree (status, next_attempt_at) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));
CREATE INDEX IF NOT EXISTS social_outbox_prune_idx ON public.social_outbox_events USING btree (status, created_at);
CREATE INDEX IF NOT EXISTS social_post_networks_post_idx ON public.social_post_networks USING btree (social_post_id);
CREATE UNIQUE INDEX IF NOT EXISTS social_post_networks_post_network_account_key ON public.social_post_networks USING btree (social_post_id, network, social_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS social_post_targets_idem_idx ON public.social_post_targets USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX IF NOT EXISTS social_posts_due_idx ON public.social_posts USING btree (status, scheduled_at DESC) WHERE (status = 'scheduled'::text);
CREATE INDEX IF NOT EXISTS social_posts_tenant_schedule_idx ON public.social_posts USING btree (tenant_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS social_posts_tenant_scheduled_idx ON public.social_posts USING btree (tenant_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS social_webhook_deliveries_endpoint_idx ON public.social_webhook_deliveries USING btree (endpoint_id, created_at DESC);
CREATE INDEX IF NOT EXISTS social_webhook_endpoints_tenant_idx ON public.social_webhook_endpoints USING btree (tenant_id, status);
CREATE INDEX IF NOT EXISTS spe_tenant_policy_idx ON public.seller_policy_enforcement USING btree (tenant_id, policy_id);
CREATE INDEX IF NOT EXISTS spe_tenant_seller_idx ON public.seller_policy_enforcement USING btree (tenant_id, seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS srp_seller_idx ON public.seller_remediation_plans USING btree (seller_id);
CREATE INDEX IF NOT EXISTS srp_tenant_idx ON public.seller_remediation_plans USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS srp_violation_idx ON public.seller_remediation_plans USING btree (violation_id);
CREATE INDEX IF NOT EXISTS staff_search_vector_gin_idx ON public.staff USING gin (search_vector);
CREATE INDEX IF NOT EXISTS staff_tenant_idx ON public.staff USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS statements_tenant_idx ON public.customer_statements USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS subscriptions_email ON public.subscriptions USING btree (email, status);
CREATE UNIQUE INDEX IF NOT EXISTS supplier_catalog_products_slug_uidx ON public.supplier_catalog_products USING btree (slug);
CREATE INDEX IF NOT EXISTS supplier_category_memory_supplier_idx ON public.supplier_category_memory USING btree (supplier_id);
CREATE INDEX IF NOT EXISTS supplier_category_visibility_supplier_idx ON public.supplier_category_visibility USING btree (supplier_id);
CREATE INDEX IF NOT EXISTS supplier_import_items_import_idx ON public.supplier_import_items USING btree (import_id, external_id);
CREATE INDEX IF NOT EXISTS supplier_product_mappings_variant_idx ON public.supplier_product_mappings USING btree (supplier_catalog_variant_id);
CREATE INDEX IF NOT EXISTS support_automations_tenant_idx ON public.support_automations USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS support_business_hours_tenant_idx ON public.support_business_hours USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS support_contact_notes_contact_idx ON public.support_contact_notes USING btree (contact_id, created_at);
CREATE INDEX IF NOT EXISTS support_contact_notes_tenant_idx ON public.support_contact_notes USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS support_contact_orgs_contact_idx ON public.support_contact_orgs USING btree (contact_id);
CREATE INDEX IF NOT EXISTS support_contact_orgs_org_idx ON public.support_contact_orgs USING btree (organization_id);
CREATE INDEX IF NOT EXISTS support_contact_orgs_tenant_idx ON public.support_contact_orgs USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS support_drafts_tenant_idx ON public.support_drafts USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS support_drafts_ticket_idx ON public.support_drafts USING btree (ticket_id);
CREATE INDEX IF NOT EXISTS support_forms_tenant_idx ON public.support_forms USING btree (tenant_id, status);
CREATE INDEX IF NOT EXISTS support_holidays_hours_idx ON public.support_holidays USING btree (business_hours_id, holiday_date);
CREATE INDEX IF NOT EXISTS support_holidays_tenant_idx ON public.support_holidays USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS support_jobs_sweep_idx ON public.support_jobs USING btree (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS support_jobs_tenant_type_idx ON public.support_jobs USING btree (tenant_id, type);
CREATE INDEX IF NOT EXISTS support_kb_articles_tenant_idx ON public.support_kb_articles USING btree (tenant_id, status);
CREATE INDEX IF NOT EXISTS support_notification_prefs_tenant_idx ON public.support_notification_prefs USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS support_notifications_recipient_idx ON public.support_notifications USING btree (tenant_id, recipient_staff_id, read_at);
CREATE INDEX IF NOT EXISTS support_notifications_ticket_idx ON public.support_notifications USING btree (tenant_id, ticket_id);
CREATE INDEX IF NOT EXISTS support_report_daily_channel_idx ON public.support_report_daily USING btree (tenant_id, grain, channel, rollup_date);
CREATE UNIQUE INDEX IF NOT EXISTS support_report_daily_grain_uidx ON public.support_report_daily USING btree (tenant_id, rollup_date, grain, COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(category, ''::text));
CREATE INDEX IF NOT EXISTS support_report_daily_tenant_date_idx ON public.support_report_daily USING btree (tenant_id, rollup_date);
CREATE INDEX IF NOT EXISTS support_routing_rules_tenant_idx ON public.support_routing_rules USING btree (tenant_id, rule_order);
CREATE INDEX IF NOT EXISTS support_signatures_staff_idx ON public.support_signatures USING btree (staff_id);
CREATE INDEX IF NOT EXISTS support_signatures_tenant_idx ON public.support_signatures USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS support_staff_skills_tenant_idx ON public.support_staff_skills USING btree (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS support_templates_scope_code_locale_uidx ON public.support_templates USING btree (COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), code, locale);
CREATE INDEX IF NOT EXISTS support_templates_tenant_idx ON public.support_templates USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS support_ticket_access_grants_grantee_idx ON public.support_ticket_access_grants USING btree (grantee_tenant_id, revoked_at);
CREATE INDEX IF NOT EXISTS support_ticket_access_grants_ticket_idx ON public.support_ticket_access_grants USING btree (ticket_id);
CREATE INDEX IF NOT EXISTS support_time_entries_staff_idx ON public.support_time_entries USING btree (tenant_id, staff_id);
CREATE INDEX IF NOT EXISTS support_time_entries_ticket_idx ON public.support_time_entries USING btree (tenant_id, ticket_id);
CREATE INDEX IF NOT EXISTS support_webhook_deliveries_queue_idx ON public.support_webhook_deliveries USING btree (tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS support_webhook_deliveries_ticket_idx ON public.support_webhook_deliveries USING btree (tenant_id, ticket_id) WHERE (ticket_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS support_webhooks_outbound_tenant_idx ON public.support_webhooks_outbound USING btree (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS sync_jobs_due_idx ON public.sync_jobs USING btree (scheduled_for, created_at) WHERE (status = 'queued'::text);
CREATE INDEX IF NOT EXISTS sync_jobs_prune_idx ON public.sync_jobs USING btree (status, created_at);
CREATE INDEX IF NOT EXISTS sync_jobs_tenant_recent_idx ON public.sync_jobs USING btree (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tags_tenant_idx ON public.tags USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS taxes_tenant_idx ON public.taxes USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS tenant_memberships_tenant_idx ON public.tenant_memberships USING btree (tenant_id, active);
CREATE INDEX IF NOT EXISTS tenant_memberships_user_idx ON public.tenant_memberships USING btree (user_id, active);
CREATE INDEX IF NOT EXISTS testimonials_tenant_id_idx ON public.testimonials USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS trust_policies_tenant_idx ON public.trust_policies USING btree (tenant_id, status);
CREATE INDEX IF NOT EXISTS tt_tenant_source_idx ON public.transaction_tags USING btree (tenant_id, source, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_default_payment_method ON public.commerce_customer_payment_methods USING btree (tenant_id, customer_id) WHERE (is_default AND (status = 'active'::text));
CREATE UNIQUE INDEX IF NOT EXISTS uq_stripe_pending_charges_pi ON public.stripe_pending_charges USING btree (stripe_payment_intent_id) WHERE (stripe_payment_intent_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS user_notifications_tenant_user_created_idx ON public.user_notifications USING btree (tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_notifications_user_idx ON public.user_notifications USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_customers_email ON public.customers USING btree (tenant_id, lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS ux_one_first_party_seller ON public.sellers USING btree (tenant_id) WHERE (seller_type = 'first_party'::text);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pav_enum ON public.product_attribute_values USING btree (product_id, attribute_id, attribute_value_id) WHERE (attribute_value_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ux_product_primary_node ON public.product_nodes USING btree (product_id) WHERE is_primary;
CREATE UNIQUE INDEX IF NOT EXISTS ux_related_legacy_path ON public.related_search_pages USING btree (tenant_id, legacy_path) WHERE (legacy_path IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ux_taxonomy_root_slug ON public.taxonomy_nodes USING btree (tenant_id, slug) WHERE (parent_id IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ux_taxonomy_sibling_slug ON public.taxonomy_nodes USING btree (tenant_id, parent_id, slug) WHERE (parent_id IS NOT NULL);

-- Views

