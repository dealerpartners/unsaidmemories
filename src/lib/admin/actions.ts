// ============================================================================
// Admin quick-action types — mirrors the /api/admin/*/actions endpoints.
// Every action in Sunny's feature tree (FULL_FEATURE_TREE.txt) maps to one of
// these. No mocks, no stubs — all hit real endpoints.
//
// Endpoints:
//   POST /api/admin/crm/actions               — CRM customer/pet/note/message
//   POST /api/admin/crm/appointments/actions  — appointment pipeline
//   POST /api/admin/finance/actions            — accounting/payments/refunds
//   POST /api/admin/commerce/actions           — orders/inventory/fulfillment
//   POST /api/admin/cms/actions                — services/CMS/website
//   POST /api/admin/analytics/actions          — reports/dashboards
//   POST /api/admin/system/actions             — org/staff/automation
// ============================================================================

// ---- Generic action envelope ----
export interface ActionRequest {
  action: string;
  payload?: Record<string, unknown>;
}

export interface ActionResponse<T = Record<string, unknown>> {
  ok: boolean;
  error?: string;
  data?: T;
  // passthrough fields from individual handlers
  [key: string]: unknown;
}

// ============================================================================
// CRM ACTIONS — POST /api/admin/crm/actions
// Tree: §1 CRM Quick Actions, §2 Customer, §1.2–1.23 detailed CRM
// ============================================================================

export type CrmAction =
  | "crm_add_customer"
  | "crm_edit_customer"
  | "crm_merge_customer"
  | "crm_merge"
  | "crm_merge_household"
  | "crm_add_pet"
  | "crm_add_note"
  | "crm_send_message"
  | "crm_send_rebooking_link"
  | "crm_rebooking_link"
  | "crm_intake_form"
  | "crm_update_documents"
  | "crm_view_documents"
  | "crm_add_to_campaign"
  | "crm_print_history";

export interface AddCustomerPayload {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  customer_type?: "individual" | "business" | "breeder" | "rescue" | "referral_partner" | "staff" | "other";
  lifecycle_stage?: "new_lead" | "new_customer" | "active" | "vip" | "returning" | "lapsed" | "at_risk" | "lost";
  lifecycle_status?: "healthy" | "needs_attention" | "at_risk";
}

export interface EditCustomerPayload extends Partial<AddCustomerPayload> {
  customer_id: string;
}

export interface MergeCustomerPayload {
  surviving_customer_id: string;
  duplicate_customer_id: string;
  reason?: string;
}

export interface MergeHouseholdPayload {
  household_id?: string;
  customer_ids: string[];
  primary_customer_id: string;
}

export interface AddPetPayload {
  customer_id: string;
  name: string;
  species?: string;
  breed?: string;
  sex?: string;
  color?: string;
  weight?: number;
  weight_unit?: string;
  date_of_birth?: string;
  medical_alert?: boolean;
  handling_notes?: string;
  behavioral_notes?: string;
  medical_notes?: string;
}

export interface AddNotePayload {
  customer_id?: string;
  dependent_id?: string;
  appointment_id?: string;
  note_type: "internal" | "customer_visible" | "appointment" | "pet_handling" | "system";
  body: string;
}

export interface SendMessagePayload {
  customer_id: string;
  channel: "email" | "sms";
  template_id?: string;
  subject?: string;
  body: string;
}

export interface IntakeFormPayload {
  customer_id: string;
  dependent_id?: string;
  form_data: Record<string, unknown>;
}

export interface UpdateDocumentsPayload {
  customer_id: string;
  dependent_id?: string;
  document_type: string;
  file_url?: string;
  expires_at?: string;
  notes?: string;
}

// ============================================================================
// APPOINTMENT ACTIONS — POST /api/admin/crm/appointments/actions
// Tree: §3 Appointment Quick Actions, §1.4–1.5 detailed appointments
// Status flow: precheck → deposit_paid → scheduled → assigned →
//   waiting_checkin → confirmed → checked_in → in_service → completed
//   (hold | no_show | cancelled | rescheduled are terminal branches)
// ============================================================================

export type AppointmentAction =
  | "apt_reschedule"
  | "apt_duplicate"
  | "apt_send_reminder"
  | "apt_follow_up"
  | "apt_log_call"
  | "apt_add_to_waitlist"
  | "apt_check_in"
  | "apt_in_service"
  | "apt_complete"
  | "apt_hold"
  | "apt_no_show"
  | "apt_cancel"
  | "apt_confirm"
  | "apt_take_payment"
  | "apt_create_invoice"
  | "apt_issue_refund";

export type AppointmentStatus =
  | "precheck"
  | "deposit_paid"
  | "scheduled"
  | "assigned"
  | "waiting_checkin"
  | "confirmed"
  | "checked_in"
  | "in_service"
  | "hold"
  | "completed"
  | "no_show"
  | "cancelled"
  | "rescheduled";

export interface AppointmentActionPayload {
  appointment_id: string;
  new_starts_at?: string;
  new_ends_at?: string;
  staff_id?: string;
  reason?: string;
  notes?: string;
  amount_cents?: number;
  payment_method?: string;
}

// ============================================================================
// FINANCE ACTIONS — POST /api/admin/finance/actions
// Tree: §7 Accounting Quick Actions, §3.0 detailed accounting
// ============================================================================

export type FinanceAction =
  | "fin_mark_paid"
  | "fin_void_invoice"
  | "fin_issue_refund"
  | "fin_issue_gift_card"
  | "fin_redeem_gift_card"
  | "fin_take_payment"
  | "fin_create_invoice"
  | "fin_send_reminder"
  | "fin_collect_deposit"
  | "fin_release_deposit"
  | "fin_forfeit_deposit"
  | "fin_apply_deposit_to_invoice"
  | "fin_refund_deposit"
  | "fin_run_payroll"
  | "fin_edit_timesheet"
  | "fin_reconcile"
  | "fin_remind"
  | "fin_add_value"
  | "fin_apply_to_invoice"
  | "fin_convert_gc"
  | "fin_issue_store_credit"
  | "fin_redeem"
  | "fin_register_credits"
  | "fin_register_refunds"
  | "fin_send_reminder_gc"
  | "fin_send_reminders"
  | "fin_void_cancel"
  | "fin_export_ledger"
  | "fin_run_profit_loss"
  | "fin_run_pnl"
  | "fin_run_balance_sheet"
  | "fin_run_trial_balance"
  | "fin_run_general_ledger"
  | "fin_deactivate_gift_card"
  | "fin_reactivate_gift_card"
  | "fin_expire_gift_card"
  | "fin_transfer_gift_card"
  | "fin_edit_gift_card"
  | "fin_replace_gift_card"
  | "fin_void_gift_card"
  | "fin_send_gift_card_receipt"
  | "fin_reissue_gift_card"
  | "fin_bank_connect"
  | "fin_bank_payouts"
  | "fin_print_receipt"
  | "fin_edit_invoice"
  | "fin_duplicate_invoice"
  | "fin_delete_invoice"
  | "fin_transfer_deposit"
  | "fin_edit_deposit"
  | "fin_receipt_deposit"
  | "fin_approve_refund"
  | "fin_reject_refund"
  | "fin_edit_refund"
  | "fin_void_refund"
  | "fin_dispute_refund"
  | "fin_respond_dispute"
  | "fin_accept_dispute"
  | "fin_receipt_refund"
  | "fin_refund_notes"
  | "fin_view_original_refund"
  | "fin_view_tax_forms"
  | "fin_check_card_balance";

export interface TakePaymentPayload {
  customer_id?: string;
  appointment_id?: string;
  invoice_id?: string;
  amount_cents: number;
  payment_method: string;
  notes?: string;
}

export interface CreateInvoicePayload {
  customer_id: string;
  appointment_id?: string;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price_cents: number;
  }>;
  due_date?: string;
  notes?: string;
}

export interface IssueRefundPayload {
  payment_id?: string;
  invoice_id?: string;
  amount_cents: number;
  reason: string;
  notes?: string;
}

export interface GiftCardPayload {
  card_id?: string;
  amount_cents: number;
  recipient_email?: string;
  recipient_name?: string;
  sender_name?: string;
  message?: string;
  expires_at?: string;
}

// ============================================================================
// COMMERCE ACTIONS — POST /api/admin/commerce/actions
// Tree: §4 Order & Inventory, §5 Fulfillment, §6 Purchasing, §2.0 POS
// ============================================================================

export type CommerceAction =
  | "com_add_inventory"
  | "com_advance"
  | "com_advance_fulfillment_stage"
  | "com_alert"
  | "com_batch_slips"
  | "com_checkout"
  | "com_create"
  | "com_create_order"
  | "com_create_po"
  | "com_create_po_status"
  | "com_edit_vendor"
  | "com_export_csv"
  | "com_export_ledger"
  | "com_inv_export_csv"
  | "com_inv_export_ledger"
  | "com_label"
  | "com_list_returns"
  | "com_packing_slip"
  | "com_postage"
  | "com_print_postage"
  | "com_print_postage_labels"
  | "com_receive"
  | "com_receive_po"
  | "com_register_coupons"
  | "com_register_discounts"
  | "com_resend_alert"
  | "com_restock"
  | "com_restock_inventory"
  | "com_review_return"
  | "com_shipping_label"
  | "com_shipping_rates"
  | "com_track_return"
  | "com_view_return";

export interface CreateOrderPayload {
  customer_id?: string;
  line_items: Array<{
    sku_id?: string;
    catalog_item_id?: string;
    quantity: number;
    unit_price_cents: number;
  }>;
  shipping_address?: Record<string, string>;
  notes?: string;
}

export interface FulfillmentAdvancePayload {
  order_id: string;
  to_stage: string;
  tracking_number?: string;
  carrier?: string;
  notes?: string;
}

export interface RestockPayload {
  sku_id: string;
  quantity: number;
  unit_cost_cents?: number;
  warehouse_id?: string;
  reason?: string;
}

export interface CreatePoPayload {
  vendor_id: string;
  line_items: Array<{
    sku_id?: string;
    quantity: number;
    unit_cost_cents: number;
  }>;
  expected_at?: string;
  notes?: string;
}

// ============================================================================
// CMS ACTIONS — POST /api/admin/cms/actions
// Tree: §9 CMS Quick Actions, §4.1 detailed CMS
// ============================================================================

export type CmsAction =
  | "cms_add_addon"
  | "cms_add_banner"
  | "cms_add_package"
  | "cms_catalog_view"
  | "cms_edit_gateway_settings"
  | "cms_edit_global_content"
  | "cms_edit_legal_waivers"
  | "cms_edit_navigation"
  | "cms_edit_policies_page"
  | "cms_edit_pricing_rules"
  | "cms_edit_service"
  | "cms_pricing_rules"
  | "cms_overview"
  | "cms_services_catalog_view"
  | "cms_update_gallery"
  | "cms_update_page"
  | "cms_update_seo";

// ============================================================================
// ANALYTICS ACTIONS — POST /api/admin/analytics/actions
// Tree: §13 Analytics & Reports, §4.3 detailed analytics
// ============================================================================

export type AnalyticsAction =
  | "an_acquisition_report"
  | "an_ar_aging"
  | "an_bookings_funnel"
  | "an_customer_acquisition"
  | "an_daily_revenue"
  | "an_daily_revenue_summary"
  | "an_deposit_liability"
  | "an_funnel"
  | "an_gift_card_liability"
  | "an_groomer_performance"
  | "an_groomer_report"
  | "an_location_report"
  | "an_multi_location_revenue"
  | "an_no_show"
  | "an_no_show_rate"
  | "an_product_report"
  | "an_product_sales"
  | "an_rebook"
  | "an_rebook_rate"
  | "an_service_report"
  | "an_service_revenue"
  | "an_store_credit_liability"
  | "an_view_ar_aging"
  | "an_view_bookings_funnel"
  | "an_view_customer_acquisition"
  | "an_view_daily_revenue"
  | "an_view_deposit_liability"
  | "an_view_gift_card_liability"
  | "an_view_groomer_performance"
  | "an_view_multi_location_revenue"
  | "an_view_no_show_rate"
  | "an_view_product_sales"
  | "an_view_rebook_rate"
  | "an_view_service_revenue"
  | "an_view_store_credit_liability";

export interface ReportPayload {
  from?: string;
  to?: string;
  location_id?: string;
  staff_id?: string;
  format?: "json" | "csv";
}

// ============================================================================
// SYSTEM ACTIONS — POST /api/admin/system/actions
// Tree: §8 Org/Settings, §10 Staff, §14 Global System
// ============================================================================

export type SystemAction =
  | "sys_add_blackout"
  | "sys_add_employee"
  | "sys_add_incident"
  | "sys_add_incident_report"
  | "sys_add_location"
  | "sys_add_member"
  | "sys_add_service"
  | "sys_add_surcharge"
  | "sys_add_user"
  | "sys_assign_shifts"
  | "sys_build_schedule"
  | "sys_clock_in"
  | "sys_clock_out"
  | "sys_edit_branding"
  | "sys_edit_business_profile"
  | "sys_edit_cancellation_policy"
  | "sys_edit_deposit_settings"
  | "sys_edit_hours"
  | "sys_edit_no_show_penalty"
  | "sys_edit_pricing"
  | "sys_edit_role"
  | "sys_magic_link"
  | "sys_run_appt_reminders"
  | "sys_run_backup"
  | "sys_run_birthday"
  | "sys_run_birthday_msgs"
  | "sys_run_duplicate"
  | "sys_run_duplicate_detection"
  | "sys_dismiss_duplicate_candidate"
  | "sys_run_missing_contact_info"
  | "sys_run_payment_reminders"
  | "sys_run_rebooking"
  | "sys_run_unsigned_docs"
  | "sys_run_vaccine"
  | "sys_run_vaccine_reminders"
  | "sys_run_winback"
  | "sys_send_magic_link"
  | "sys_reset_2fa"
  | "sys_suspend_user"
  | "sys_switch_location"
  | "sys_toggle_booking"
  | "sys_toggle_online_booking"
  | "sys_view_quick_links"
  | "sys_add_quick_link"
  | "sys_edit_quick_link"
  | "sys_delete_quick_link"
  | "sys_view_system_health";

// ============================================================================
// LMS AUTHORING TYPES — admin authors, students learn
// LMS lives in the `lms` schema (separate from public).
// Tree: LMS domain sections (Identity, Curriculum, Media, Delivery,
//   AI Teaching, Progress, Assessment, Skills, Support, Comms, Compliance)
// ============================================================================

export interface LmsPathway {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string | null;
  pathwayType: string;
  deliveryMode: string;
  totalEstimatedHours: number | null;
  isPublished: boolean;
  publishedAt: string | null;
  sortOrder: number;
  createdAt: string | null;
}

export interface LmsCourse {
  id: string;
  tenantId: string;
  pathwayId: string | null;
  code: string | null;
  title: string;
  slug: string;
  description: string | null;
  courseType: string;
  difficultyLevel: string;
  isPublished: boolean;
  publishedAt: string | null;
  sortOrder: number;
  createdAt: string | null;
}

export interface LmsModule {
  id: string;
  tenantId: string;
  courseId: string;
  title: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  estimatedMinutes: number | null;
  isPublished: boolean;
  isCapstone: boolean;
  createdAt: string | null;
}

export interface LmsLesson {
  id: string;
  tenantId: string;
  courseId: string;
  moduleId: string;
  title: string;
  slug: string;
  lessonType: string;
  estimatedMinutes: number | null;
  sortOrder: number;
  isPublished: boolean;
  aiGenerated: boolean;
  createdAt: string | null;
}

export interface LmsEnrollment {
  id: string;
  tenantId: string;
  learnerUserId: string;
  courseId: string;
  cohortId: string | null;
  status: string;
  progressPercentage: number;
  enrolledAt: string | null;
  completedAt: string | null;
}

export interface LmsCohort {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  courseId: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  currentEnrollment: number;
  maxEnrollment: number | null;
}

export interface CreateCourseInput {
  title: string;
  slug?: string;
  description?: string;
  pathway_id?: string;
  course_type?: string;
  difficulty_level?: string;
}

export interface CreateLessonInput {
  course_id: string;
  module_id: string;
  title: string;
  slug?: string;
  lesson_type?: string;
  estimated_minutes?: number;
}
