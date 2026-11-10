-- ============================================================================
-- Unsaid / ManageKube — Cap Table & 409A Valuation Engine Schema (PostgreSQL)
-- Core namespaces: cap_ (Cap Table & Vault), val_ (409A Valuation Engine)
-- Architecture: Append-only hash-chained ledger; derived views; frozen snapshots
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Issuer Company
CREATE TABLE cap_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name TEXT NOT NULL,
  ein_enc TEXT NOT NULL,
  state_of_incorp TEXT NOT NULL DEFAULT 'DE',
  incorp_date DATE NOT NULL,
  predecessor_start_date DATE,
  fiscal_year_end TEXT NOT NULL DEFAULT '12-31',
  has_traded_class BOOLEAN NOT NULL DEFAULT FALSE,
  total_assets NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Stakeholders (Founders, Employees, Advisors, Investors, Entities)
CREATE TABLE cap_stakeholders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES cap_companies(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('founder', 'employee', 'advisor', 'investor', 'entity')),
  email TEXT NOT NULL,
  tax_id_enc TEXT,
  is_insider BOOLEAN NOT NULL DEFAULT FALSE,
  is_board BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Vault Documents (Immutable Retention)
CREATE TABLE cap_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES cap_companies(id),
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('charter', 'bylaw', 'report', 'consent', 'agreement', '83b', 'cv')),
  storage_path TEXT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  signed_at TIMESTAMPTZ,
  retention_hold BOOLEAN NOT NULL DEFAULT TRUE,
  content_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Board Approvals & Written Consents
CREATE TABLE cap_board_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES cap_companies(id),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('plan_adopt', 'grant_batch', 'valuation_adopt', 'financing', 'charter_amend', 'qi_determination')),
  adopted_at DATE NOT NULL,
  document_id UUID REFERENCES cap_documents(id),
  signers TEXT[] NOT NULL DEFAULT '{}',
  recitals_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Qualified Individuals (409A Safe-Harbor Attestation)
CREATE TABLE cap_qualified_individuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES cap_companies(id),
  stakeholder_id UUID NOT NULL REFERENCES cap_stakeholders(id),
  qualifications_summary TEXT NOT NULL,
  years_experience NUMERIC(4, 1) NOT NULL CHECK (years_experience >= 5),
  experience_categories TEXT[] NOT NULL DEFAULT '{}',
  cv_document_id UUID NOT NULL REFERENCES cap_documents(id),
  board_determined_at DATE NOT NULL,
  board_determination_doc_id UUID NOT NULL REFERENCES cap_documents(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Security Classes & Preference Terms
CREATE TABLE cap_security_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES cap_companies(id),
  name TEXT NOT NULL,
  class_type TEXT NOT NULL CHECK (class_type IN ('common', 'preferred')),
  authorized_shares BIGINT NOT NULL CHECK (authorized_shares > 0),
  seniority_rank INTEGER NOT NULL,
  liquidation_preference_multiple NUMERIC(8, 4) NOT NULL DEFAULT 0,
  par_value NUMERIC(10, 6) NOT NULL DEFAULT 0.0001,
  conversion_ratio NUMERIC(10, 4) NOT NULL DEFAULT 1.0,
  participating BOOLEAN NOT NULL DEFAULT FALSE,
  participation_cap_multiple NUMERIC(8, 4),
  dividend_rate NUMERIC(6, 4) NOT NULL DEFAULT 0,
  voting_rights BOOLEAN NOT NULL DEFAULT TRUE,
  price_per_share_original NUMERIC(14, 4) NOT NULL DEFAULT 0,
  has_put_call_redemption BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Equity Incentive Plans
CREATE TABLE cap_equity_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES cap_companies(id),
  name TEXT NOT NULL,
  class_id UUID NOT NULL REFERENCES cap_security_classes(id),
  board_approved_at DATE NOT NULL,
  shareholder_approved_at DATE,
  total_reserved BIGINT NOT NULL CHECK (total_reserved > 0),
  board_approval_id UUID REFERENCES cap_board_approvals(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Vesting Schedules & Computed Events
CREATE TABLE cap_vesting_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES cap_companies(id),
  name TEXT NOT NULL,
  total_months INTEGER NOT NULL CHECK (total_months >= 0),
  cliff_months INTEGER NOT NULL CHECK (cliff_months >= 0),
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'immediate')),
  start_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Securities (One row per issuance lot)
CREATE TABLE cap_securities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES cap_companies(id),
  certificate_code TEXT NOT NULL UNIQUE,
  stakeholder_id UUID NOT NULL REFERENCES cap_stakeholders(id),
  class_id UUID REFERENCES cap_security_classes(id),
  plan_id UUID REFERENCES cap_equity_plans(id),
  kind TEXT NOT NULL CHECK (kind IN ('share', 'option', 'rsa', 'rsu', 'warrant', 'safe', 'convertible_note')),
  initial_quantity NUMERIC(18, 4) NOT NULL CHECK (initial_quantity >= 0),
  price_per_share NUMERIC(14, 4) NOT NULL DEFAULT 0,
  principal_amount NUMERIC(18, 2),
  valuation_cap NUMERIC(18, 2),
  discount_pct NUMERIC(6, 4),
  interest_rate NUMERIC(6, 4),
  status TEXT NOT NULL CHECK (status IN ('active', 'exercised', 'cancelled', 'converted', 'repurchased')),
  issue_date DATE NOT NULL,
  board_approval_id UUID NOT NULL REFERENCES cap_board_approvals(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Cap Table Snapshots (Frozen JSONB State + SHA-256 Hash)
CREATE TABLE cap_table_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES cap_companies(id),
  as_of_date DATE NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('valuation', 'grant', 'financing', 'board')),
  snapshot_jsonb JSONB NOT NULL,
  total_basic_shares NUMERIC(18, 4) NOT NULL,
  total_fd_shares NUMERIC(18, 4) NOT NULL,
  denominator_method TEXT NOT NULL,
  hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Immutable Hash-Chained Ledger (cap_transactions)
CREATE TABLE cap_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq BIGSERIAL NOT NULL UNIQUE,
  company_id UUID NOT NULL REFERENCES cap_companies(id),
  security_id UUID NOT NULL REFERENCES cap_securities(id),
  txn_type TEXT NOT NULL CHECK (txn_type IN (
    'issue', 'grant', 'exercise', 'transfer', 'repurchase',
    'cancel', 'convert', 'safe_convert', 'note_convert', 'split'
  )),
  qty_delta NUMERIC(18, 4) NOT NULL,
  price NUMERIC(14, 4) NOT NULL DEFAULT 0,
  counterparty TEXT,
  effective_date DATE NOT NULL,
  board_approval_id UUID REFERENCES cap_board_approvals(id),
  document_ids UUID[] NOT NULL DEFAULT '{}',
  prev_hash CHAR(64) NOT NULL,
  row_hash CHAR(64) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce strict immutability on cap_transactions and cap_table_snapshots
CREATE OR REPLACE FUNCTION forbid_ledger_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Immutable ledger violation: % rows cannot be modified or deleted in place.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cap_transactions_immutable
  BEFORE UPDATE OR DELETE ON cap_transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();

CREATE TRIGGER trg_cap_snapshots_immutable
  BEFORE UPDATE OR DELETE ON cap_table_snapshots
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();

-- 12. 409A Material Events
CREATE TABLE val_material_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES cap_companies(id),
  type TEXT NOT NULL CHECK (type IN ('financing', 'term_sheet', 'patent', 'litigation', 'key_hire', 'customer', 'other')),
  event_date DATE NOT NULL,
  description TEXT NOT NULL,
  triggers_revaluation BOOLEAN NOT NULL DEFAULT TRUE,
  resolved_val_request_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. 409A Valuation Requests
CREATE TABLE val_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES cap_companies(id),
  valuation_date DATE NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'IRC §409A Common Stock Fair Market Value',
  qualified_individual_id UUID NOT NULL REFERENCES cap_qualified_individuals(id),
  status TEXT NOT NULL CHECK (status IN (
    'collecting', 'drafting', 'in_review', 'adopted', 'superseded', 'expired', 'ineligible_independent_required'
  )),
  material_event_id UUID REFERENCES val_material_events(id),
  gate_check_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. Structured 409A Inputs
CREATE TABLE val_inputs (
  request_id UUID PRIMARY KEY REFERENCES val_requests(id),
  cash NUMERIC(18, 2) NOT NULL DEFAULT 0,
  debt NUMERIC(18, 2) NOT NULL DEFAULT 0,
  adjusted_book_assets NUMERIC(18, 2) NOT NULL DEFAULT 0,
  total_liabilities NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ltm_revenue NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ntm_revenue NUMERIC(18, 2) NOT NULL DEFAULT 0,
  ltm_ebitda NUMERIC(18, 2) NOT NULL DEFAULT 0,
  historical_financials_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb,
  projections_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  no_cic_90d BOOLEAN NOT NULL DEFAULT TRUE,
  no_ipo_180d BOOLEAN NOT NULL DEFAULT TRUE,
  industry_notes TEXT
);

-- 15. Guideline Public Companies
CREATE TABLE val_comps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES val_requests(id),
  ticker TEXT NOT NULL,
  name TEXT NOT NULL,
  ev_rev_multiple NUMERIC(10, 4) NOT NULL,
  ev_ebitda_multiple NUMERIC(10, 4),
  volatility NUMERIC(6, 4) NOT NULL,
  beta NUMERIC(6, 4) NOT NULL,
  source TEXT NOT NULL,
  as_of DATE NOT NULL
);

-- 16. Valuation Approaches (Asset, DCF, Market Guideline, Market Txn / Backsolve)
CREATE TABLE val_approaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES val_requests(id),
  method TEXT NOT NULL CHECK (method IN ('asset', 'dcf', 'market_guideline', 'market_txn', 'backsolve')),
  enterprise_value_result NUMERIC(18, 2) NOT NULL DEFAULT 0,
  weight_pct NUMERIC(6, 2) NOT NULL CHECK (weight_pct >= 0 AND weight_pct <= 100),
  rationale TEXT NOT NULL,
  inputs_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  rejected BOOLEAN NOT NULL DEFAULT FALSE
);

-- 17. Equity Allocation Runs (OPM / PWERM / CVM / Hybrid)
CREATE TABLE val_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES val_requests(id) UNIQUE,
  method TEXT NOT NULL CHECK (method IN ('opm', 'pwerm', 'cvm', 'hybrid')),
  breakpoints_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb,
  volatility NUMERIC(6, 4) NOT NULL,
  time_to_liquidity_yrs NUMERIC(6, 2) NOT NULL,
  risk_free_rate NUMERIC(6, 4) NOT NULL,
  dividend_yield NUMERIC(6, 4) NOT NULL DEFAULT 0,
  equity_value_in NUMERIC(18, 2) NOT NULL,
  per_class_value_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb,
  common_per_share_pre_dlom NUMERIC(14, 4) NOT NULL
);

-- 18. DLOM Runs (Finnerty / Chaffe / Study)
CREATE TABLE val_dlom (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES val_requests(id) UNIQUE,
  model TEXT NOT NULL CHECK (model IN ('finnerty', 'chaffe', 'restricted_study', 'preipo_study')),
  inputs_jsonb JSONB NOT NULL DEFAULT '{}'::jsonb,
  dlom_pct NUMERIC(6, 4) NOT NULL,
  rationale TEXT NOT NULL,
  common_per_share_post_dlom NUMERIC(14, 4) NOT NULL
);

-- 19. 409A Deliverable Reports & FMV Lock
CREATE TABLE val_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES val_requests(id),
  snapshot_id UUID NOT NULL REFERENCES cap_table_snapshots(id),
  fmv_per_share_common NUMERIC(14, 4) NOT NULL,
  valuation_date DATE NOT NULL,
  report_date DATE NOT NULL,
  qualified_individual_id UUID NOT NULL REFERENCES cap_qualified_individuals(id),
  report_document_id UUID NOT NULL REFERENCES cap_documents(id),
  board_approval_id UUID REFERENCES cap_board_approvals(id),
  status TEXT NOT NULL CHECK (status IN ('in_review', 'adopted', 'superseded', 'expired')),
  valid_until DATE NOT NULL,
  superseded_by TEXT
);

-- 20. Option & Award Grants (references val_reports for FMV lock audit)
CREATE TABLE cap_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  security_id UUID NOT NULL REFERENCES cap_securities(id) UNIQUE,
  stakeholder_id UUID NOT NULL REFERENCES cap_stakeholders(id),
  plan_id UUID NOT NULL REFERENCES cap_equity_plans(id),
  grant_date DATE NOT NULL,
  quantity NUMERIC(18, 4) NOT NULL CHECK (quantity > 0),
  exercise_price NUMERIC(14, 4) NOT NULL CHECK (exercise_price >= 0),
  fmv_at_grant NUMERIC(14, 4) NOT NULL,
  val_report_id UUID NOT NULL REFERENCES val_reports(id),
  snapshot_id UUID NOT NULL REFERENCES cap_table_snapshots(id),
  vesting_schedule_id UUID NOT NULL REFERENCES cap_vesting_schedules(id),
  expiry_date DATE NOT NULL,
  iso_nso TEXT NOT NULL CHECK (iso_nso IN ('ISO', 'NSO', 'RSA', 'RSU')),
  early_exercise BOOLEAN NOT NULL DEFAULT FALSE,
  due_date_83b DATE,
  filed_at_83b DATE
);

-- ============================================================================
-- DERIVED SQL VIEWS
-- ============================================================================

CREATE VIEW cap_table_current AS
SELECT
  s.company_id,
  sh.id AS stakeholder_id,
  sh.name AS stakeholder_name,
  sh.type AS stakeholder_type,
  sc.id AS class_id,
  sc.name AS class_name,
  SUM(CASE WHEN s.kind IN ('share', 'rsa') THEN t.qty_delta ELSE 0 END) AS shares_issued,
  SUM(t.qty_delta) AS securities_outstanding
FROM cap_transactions t
JOIN cap_securities s ON s.id = t.security_id
JOIN cap_stakeholders sh ON sh.id = s.stakeholder_id
LEFT JOIN cap_security_classes sc ON sc.id = s.class_id
GROUP BY s.company_id, sh.id, sh.name, sh.type, sc.id, sc.name
HAVING SUM(t.qty_delta) > 0;

CREATE VIEW cap_plan_availability AS
SELECT
  p.id AS plan_id,
  p.company_id,
  p.name AS plan_name,
  p.total_reserved,
  COALESCE(SUM(t.qty_delta), 0) AS allocated_from_plan,
  p.total_reserved - COALESCE(SUM(t.qty_delta), 0) AS shares_available
FROM cap_equity_plans p
LEFT JOIN cap_securities s ON s.plan_id = p.id
LEFT JOIN cap_transactions t ON t.security_id = s.id
GROUP BY p.id, p.company_id, p.name, p.total_reserved;

CREATE VIEW val_active_fmv AS
SELECT
  r.id AS report_id,
  req.company_id,
  r.fmv_per_share_common,
  r.valuation_date,
  r.report_date,
  r.valid_until,
  r.snapshot_id,
  r.board_approval_id,
  (r.valid_until - CURRENT_DATE) AS days_until_expiry
FROM val_reports r
JOIN val_requests req ON req.id = r.request_id
WHERE r.status = 'adopted'
  AND r.valid_until >= CURRENT_DATE;
