-- Unsaid platform schema — part 1 of 3: extensions, types, sequences, helper functions
-- Generated 2026-11-02 from the live production catalog (Supabase project pcwwvfgxnrglmmpbfqhf)
-- after the white-label rename. Run the three parts in order on a fresh
-- Supabase project to generate the full schema. Schema only, no data.

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "supabase_vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum types
CREATE TYPE public."account_type" AS ENUM ('asset', 'liability', 'equity', 'income', 'expense');
CREATE TYPE public."acct_account_type" AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense', 'contra_asset', 'contra_liability', 'contra_equity', 'statistical');
CREATE TYPE public."acct_asset_status" AS ENUM ('draft', 'in_service', 'held_for_sale', 'disposed', 'fully_depreciated', 'retired');
CREATE TYPE public."acct_document_status" AS ENUM ('draft', 'pending_approval', 'approved', 'posted', 'partially_paid', 'paid', 'void', 'cancelled', 'rejected', 'closed');
CREATE TYPE public."acct_normal_balance" AS ENUM ('debit', 'credit');
CREATE TYPE public."acct_party_type" AS ENUM ('customer', 'vendor', 'employee', 'other');
CREATE TYPE public."acct_payment_method" AS ENUM ('cash', 'check', 'ach', 'wire', 'card', 'bank_transfer', 'direct_debit', 'virtual_card', 'payment_link', 'other');
CREATE TYPE public."acct_payment_status" AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded');
CREATE TYPE public."acct_period_status" AS ENUM ('future', 'open', 'soft_closed', 'closed', 'locked');
CREATE TYPE public."acct_posting_status" AS ENUM ('draft', 'approved', 'posted', 'reversed', 'void');
CREATE TYPE public."acct_recognition_method" AS ENUM ('point_in_time', 'straight_line', 'milestone', 'usage', 'percentage_complete', 'manual');
CREATE TYPE public."acct_reconciliation_status" AS ENUM ('open', 'in_progress', 'reconciled', 'reopened', 'closed');
CREATE TYPE public."acct_source_type" AS ENUM ('manual', 'invoice', 'credit_memo', 'customer_receipt', 'vendor_bill', 'vendor_credit', 'vendor_payment', 'bank', 'expense', 'payroll', 'inventory', 'fixed_asset', 'lease', 'revenue_recognition', 'tax', 'allocation', 'intercompany', 'consolidation', 'opening_balance', 'recurring', 'import', 'integration', 'system');
CREATE TYPE public."acct_tax_type" AS ENUM ('sales', 'vat', 'gst', 'use', 'withholding', 'excise', 'payroll', 'other');
CREATE TYPE public."acct_workflow_status" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE public."ad_campaign_objective" AS ENUM ('brand_awareness', 'traffic', 'engagement', 'lead_generation', 'app_installs', 'sales');
CREATE TYPE public."ad_campaign_status" AS ENUM ('draft', 'active', 'paused', 'completed');
CREATE TYPE public."bill_status" AS ENUM ('draft', 'received', 'partial', 'paid', 'void', 'overdue');
CREATE TYPE public."checkout_status" AS ENUM ('active', 'paid', 'expired', 'void');
CREATE TYPE public."erp_count_status" AS ENUM ('draft', 'assigned', 'counting', 'submitted', 'review', 'approved', 'posted', 'cancelled');
CREATE TYPE public."erp_fulfillment_method" AS ENUM ('ship', 'local_pickup', 'curbside', 'local_delivery', 'digital', 'third_party');
CREATE TYPE public."erp_fulfillment_status" AS ENUM ('pending', 'released', 'picking', 'picked', 'packing', 'packed', 'staged', 'ready', 'dispatched', 'shipped', 'delivered', 'picked_up', 'cancelled', 'closed');
CREATE TYPE public."erp_inventory_movement_type" AS ENUM ('opening', 'purchase_receipt', 'sale', 'return', 'transfer', 'adjustment', 'damage', 'scrap', 'count_adjustment', 'reservation', 'reservation_release', 'allocation', 'deallocation', 'pick', 'unpick', 'pack', 'unpack', 'ship', 'receive', 'putaway', 'cycle_count', 'reclassification', 'cost_adjustment');
CREATE TYPE public."erp_inventory_status" AS ENUM ('available', 'reserved', 'allocated', 'picked', 'packed', 'in_transit', 'damaged', 'quarantine', 'blocked', 'expired', 'returned');
CREATE TYPE public."erp_order_line_status" AS ENUM ('open', 'reserved', 'allocated', 'backordered', 'picked', 'packed', 'shipped', 'delivered', 'cancelled', 'returned', 'closed');
CREATE TYPE public."erp_order_status" AS ENUM ('draft', 'pending_payment', 'confirmed', 'on_hold', 'allocated', 'partially_allocated', 'released', 'picking', 'partially_picked', 'packed', 'partially_shipped', 'ready_for_pickup', 'shipped', 'delivered', 'completed', 'backordered', 'cancelled', 'returned', 'closed');
CREATE TYPE public."erp_pick_status" AS ENUM ('pending', 'assigned', 'in_progress', 'picked', 'short', 'cancelled', 'closed');
CREATE TYPE public."erp_procurement_status" AS ENUM ('draft', 'pending_approval', 'approved', 'sent', 'partially_received', 'received', 'closed', 'cancelled');
CREATE TYPE public."erp_receipt_status" AS ENUM ('draft', 'receiving', 'partially_received', 'received', 'posted', 'cancelled');
CREATE TYPE public."erp_replenishment_status" AS ENUM ('open', 'recommended', 'approved', 'ordered', 'partially_received', 'fulfilled', 'cancelled');
CREATE TYPE public."erp_return_disposition" AS ENUM ('restock', 'refurbish', 'damaged', 'scrap', 'quarantine', 'return_to_vendor', 'exchange', 'replacement');
CREATE TYPE public."erp_return_status" AS ENUM ('requested', 'approved', 'awaiting_package', 'in_transit', 'received', 'inspection', 'approved_for_refund', 'rejected', 'restocked', 'refunded', 'exchanged', 'completed', 'cancelled');
CREATE TYPE public."estimate_status" AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired', 'invoiced');
CREATE TYPE public."order_status" AS ENUM ('draft', 'sent', 'partial', 'fulfilled', 'closed', 'void', 'approved', 'submitted', 'partially_received', 'received', 'cancelled', 'pending', 'rejected');
CREATE TYPE public."payment_method" AS ENUM ('cash', 'check', 'card', 'bank_transfer', 'ach', 'stripe', 'paypal', 'other');
CREATE TYPE public."payroll_run_state" AS ENUM ('draft', 'approved', 'paid', 'posted', 'void');
CREATE TYPE public."product_view_angle" AS ENUM ('FRONT', 'BACK', 'LEFT_SIDE', 'RIGHT_SIDE', 'WRAPAROUND', 'TOP_DOWN', 'INSIDE_LABEL');
CREATE TYPE public."rec_state" AS ENUM ('in_progress', 'reconciled', 'reopened');
CREATE TYPE public."receipt_kind" AS ENUM ('sale', 'refund', 'advance', 'on_account');
CREATE TYPE public."recurring_freq" AS ENUM ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly');
CREATE TYPE public."social_platform" AS ENUM ('facebook', 'instagram', 'threads', 'whatsapp', 'tiktok', 'youtube', 'google_business', 'x', 'linkedin', 'reddit', 'pinterest', 'wordpress', 'bluesky', 'telegram', 'discord', 'slack', 'shopify', 'snapchat', 'messages');
CREATE TYPE public."social_post_status" AS ENUM ('draft', 'pending_approval', 'approved', 'scheduled', 'publishing', 'published', 'partially_published', 'failed', 'needs_attention', 'cancelled');
CREATE TYPE public."social_target_status" AS ENUM ('queued', 'uploading', 'publishing', 'published', 'failed', 'skipped', 'unknown', 'handoff_pending');
CREATE TYPE public."stock_movement_type" AS ENUM ('purchase', 'sale', 'adjustment', 'transfer', 'return', 'opening');

-- Sequences
CREATE SEQUENCE IF NOT EXISTS public."ad_advertisers_id_seq";
CREATE SEQUENCE IF NOT EXISTS public."ad_campaign_groups_id_seq";
CREATE SEQUENCE IF NOT EXISTS public."ad_campaigns_id_seq";
CREATE SEQUENCE IF NOT EXISTS public."ad_creative_assets_id_seq";
CREATE SEQUENCE IF NOT EXISTS public."ad_creatives_id_seq";
CREATE SEQUENCE IF NOT EXISTS public."ad_events_id_seq";
CREATE SEQUENCE IF NOT EXISTS public."ad_experiment_variants_id_seq";
CREATE SEQUENCE IF NOT EXISTS public."ad_experiments_id_seq";
CREATE SEQUENCE IF NOT EXISTS public."ad_placements_id_seq";
CREATE SEQUENCE IF NOT EXISTS public."ad_rate_card_items_id_seq";
CREATE SEQUENCE IF NOT EXISTS public."ad_rate_cards_id_seq";
CREATE SEQUENCE IF NOT EXISTS public."ad_tiers_id_seq";
CREATE SEQUENCE IF NOT EXISTS public."categories_id_seq";
CREATE SEQUENCE IF NOT EXISTS public."support_ticket_ref_seq";

-- Helper functions (referenced by generated columns; must exist before tables)
CREATE OR REPLACE FUNCTION public.search_text(VARIADIC parts text[])
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'lms', 'public', 'pg_catalog'
AS $function$
  SELECT array_to_string(parts, ' ', '');
$function$;

