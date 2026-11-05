// ============================================================================
// Admin quick-action hooks — TanStack Query mutation wrappers for the
// /api/admin/*/actions endpoints. Every action in Sunny's feature tree
// (FULL_FEATURE_TREE.txt) has a typed hook here.
//
// Pattern: each module has a generic `useXxxAction()` dispatcher plus typed
// convenience hooks (e.g. useMergeCustomer) that wrap it. All mutations
// invalidate the relevant list queries on success.
//
// Types: @/lib/admin/actions
// NO MOCKS. Every hook hits a real endpoint.
// ============================================================================

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ActionRequest,
  ActionResponse,
  CrmAction,
  AddCustomerPayload,
  EditCustomerPayload,
  MergeCustomerPayload,
  MergeHouseholdPayload,
  AddPetPayload,
  AddNotePayload,
  SendMessagePayload,
  IntakeFormPayload,
  UpdateDocumentsPayload,
  AppointmentAction,
  AppointmentActionPayload,
  FinanceAction,
  TakePaymentPayload,
  CreateInvoicePayload,
  IssueRefundPayload,
  GiftCardPayload,
  CommerceAction,
  CreateOrderPayload,
  FulfillmentAdvancePayload,
  RestockPayload,
  CreatePoPayload,
  CmsAction,
  AnalyticsAction,
  ReportPayload,
  SystemAction,
} from "@/lib/admin/actions";

async function postAction<T = Record<string, unknown>>(
  endpoint: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<ActionResponse<T>> {
  const body: ActionRequest = { action, payload };
  const r = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error || `Action failed (${r.status})`,
    );
  }
  return r.json() as Promise<ActionResponse<T>>;
}

function useActionMutation(
  endpoint: string,
  invalidateKeys: string[][] = [],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      action,
      payload,
    }: {
      action: string;
      payload?: Record<string, unknown>;
    }) => postAction(endpoint, action, payload),
    onSuccess: () => {
      for (const key of invalidateKeys) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

// ============================================================================
// CRM — POST /api/admin/crm/actions
// ============================================================================

const CRM_ENDPOINT = "/api/admin/crm/actions";
const CRM_INVALIDATE = [["admin", "crm", "customers"], ["admin", "crm", "pets"]];

/** Generic CRM action dispatcher. Prefer the typed hooks below. */
export function useCrmAction() {
  return useActionMutation(CRM_ENDPOINT, CRM_INVALIDATE);
}

function crmHook<P>(action: CrmAction, extraInvalidate: string[][] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: P) =>
      postAction(CRM_ENDPOINT, action, payload as Record<string, unknown>),
    onSuccess: () => {
      for (const key of [...CRM_INVALIDATE, ...extraInvalidate]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

// ---- Customer actions (tree §1 CRM Quick Actions, §2 Customer) ----
export const useAddCustomer = () => crmHook<AddCustomerPayload>("crm_add_customer");
export const useEditCustomer = () => crmHook<EditCustomerPayload>("crm_edit_customer");
export const useMergeCustomer = () => crmHook<MergeCustomerPayload>("crm_merge_customer");
export const useMergeHousehold = () => crmHook<MergeHouseholdPayload>("crm_merge_household");
export const useSendRebookingLink = () =>
  crmHook<{ customer_id: string; dependent_id?: string }>("crm_send_rebooking_link");
export const useAddToCampaign = () =>
  crmHook<{ customer_id: string; campaign_id: string }>("crm_add_to_campaign");
export const usePrintCustomerHistory = () =>
  crmHook<{ customer_id: string }>("crm_print_history");

// ---- Pet actions ----
export const useAddPetAction = () => crmHook<AddPetPayload>("crm_add_pet");

// ---- Note / message / intake ----
export const useAddCrmNote = () => crmHook<AddNotePayload>("crm_add_note");
export const useSendCrmMessage = () => crmHook<SendMessagePayload>("crm_send_message");
export const useSubmitIntakeForm = () => crmHook<IntakeFormPayload>("crm_intake_form");
export const useUpdateCustomerDocuments = () =>
  crmHook<UpdateDocumentsPayload>("crm_update_documents");

// ============================================================================
// APPOINTMENTS — POST /api/admin/crm/appointments/actions
// Tree: §3 Appointment Quick Actions
// ============================================================================

const APT_ENDPOINT = "/api/admin/crm/appointments/actions";
const APT_INVALIDATE = [["admin", "crm", "appointments"]];

/** Generic appointment action dispatcher. Prefer the typed hooks below. */
export function useAppointmentAction() {
  return useActionMutation(APT_ENDPOINT, APT_INVALIDATE);
}

function aptHook(action: AppointmentAction) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: AppointmentActionPayload) =>
      postAction(APT_ENDPOINT, action, payload as unknown as Record<string, unknown>),
    onSuccess: () => {
      for (const key of APT_INVALIDATE) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

// ---- Status pipeline (tree §3) ----
export const useRescheduleAppointment = () => aptHook("apt_reschedule");
export const useDuplicateAppointment = () => aptHook("apt_duplicate");
export const useSendAppointmentReminder = () => aptHook("apt_send_reminder");
export const useFollowUpAppointment = () => aptHook("apt_follow_up");
export const useLogCall = () => aptHook("apt_log_call");
export const useAddToWaitlist = () => aptHook("apt_add_to_waitlist");
export const useCheckInAppointment = () => aptHook("apt_check_in");
export const useStartAppointmentService = () => aptHook("apt_in_service");
export const useCompleteAppointment = () => aptHook("apt_complete");
export const useHoldAppointment = () => aptHook("apt_hold");
export const useMarkNoShow = () => aptHook("apt_no_show");
export const useCancelAppointment = () => aptHook("apt_cancel");
export const useConfirmAppointment = () => aptHook("apt_confirm");

// ---- Money actions on appointments ----
export const useTakeAppointmentPayment = () => aptHook("apt_take_payment");
export const useCreateAppointmentInvoice = () => aptHook("apt_create_invoice");
export const useIssueAppointmentRefund = () => aptHook("apt_issue_refund");

// ============================================================================
// FINANCE — POST /api/admin/finance/actions
// Tree: §7 Accounting Quick Actions, §3.0 detailed accounting
// ============================================================================

const FIN_ENDPOINT = "/api/admin/finance/actions";
const FIN_INVALIDATE = [
  ["admin", "accounting", "invoices"],
  ["admin", "accounting", "payments"],
];

/** Generic finance action dispatcher. Prefer the typed hooks below. */
export function useFinanceAction() {
  return useActionMutation(FIN_ENDPOINT, FIN_INVALIDATE);
}

function finHook<P>(action: FinanceAction, extraInvalidate: string[][] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: P) =>
      postAction(FIN_ENDPOINT, action, payload as Record<string, unknown>),
    onSuccess: () => {
      for (const key of [...FIN_INVALIDATE, ...extraInvalidate]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

// ---- Payments (tree §7 → Payments) ----
export const useTakePayment = () => finHook<TakePaymentPayload>("fin_take_payment");
export const usePrintReceipt = () =>
  finHook<{ payment_id: string }>("fin_print_receipt");
export const useSendPaymentReminders = () => finHook<Record<string, unknown>>("fin_send_reminders");

// ---- Invoices (tree §7 → Invoices) ----
export const useCreateInvoiceAction = () =>
  finHook<CreateInvoicePayload>("fin_create_invoice");
export const useMarkInvoicePaidAction = () =>
  finHook<{ invoice_id: string; payment_id?: string }>("fin_mark_paid");
export const useVoidInvoice = () =>
  finHook<{ invoice_id: string; reason?: string }>("fin_void_cancel");
export const useDuplicateInvoice = () =>
  finHook<{ invoice_id: string }>("fin_duplicate_invoice");
export const useDeleteInvoice = () =>
  finHook<{ invoice_id: string }>("fin_delete_invoice");
export const useEditInvoice = () =>
  finHook<{ invoice_id: string } & Record<string, unknown>>("fin_edit_invoice");
export const useSendInvoiceReminder = () =>
  finHook<{ invoice_id: string }>("fin_remind");

// ---- Invoice email send (via Resend, real templates) ----
function emailSendHook(endpoint: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { invoice_id: string; is_reminder?: boolean }) => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        throw new Error(j.error || j.detail || "Send failed");
      }
      return j;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}
export const useSendInvoiceEmail = () => emailSendHook("/api/admin/invoices/send");

// ---- Deposits (tree §7 → Deposits) ----
export const useCollectDeposit = () =>
  finHook<{ customer_id: string; amount_cents: number; appointment_id?: string }>(
    "fin_collect_deposit",
  );
export const useApplyDepositToInvoice = () =>
  finHook<{ deposit_id: string; invoice_id: string; amount_cents?: number }>(
    "fin_apply_deposit_to_invoice",
  );
export const useReleaseDeposit = () =>
  finHook<{ deposit_id: string }>("fin_release_deposit");
export const useRefundDeposit = () =>
  finHook<{ deposit_id: string; reason?: string }>("fin_refund_deposit");
export const useForfeitDeposit = () =>
  finHook<{ deposit_id: string; reason: string }>("fin_forfeit_deposit");
export const useTransferDeposit = () =>
  finHook<{ deposit_id: string; new_customer_id: string }>("fin_transfer_deposit");
export const useEditDeposit = () =>
  finHook<{ deposit_id: string } & Record<string, unknown>>("fin_edit_deposit");

// ---- Refunds (tree §7 → Refunds) ----
export const useIssueRefund = () => finHook<IssueRefundPayload>("fin_issue_refund");
export const useApproveRefund = () =>
  finHook<{ refund_id: string }>("fin_approve_refund");
export const useRejectRefund = () =>
  finHook<{ refund_id: string; reason: string }>("fin_reject_refund");
export const useEditRefund = () =>
  finHook<{ refund_id: string } & Record<string, unknown>>("fin_edit_refund");
export const useVoidRefund = () =>
  finHook<{ refund_id: string; reason?: string }>("fin_void_refund");
export const useDisputeRefund = () =>
  finHook<{ refund_id: string; notes: string }>("fin_dispute_refund");
export const useRespondDispute = () =>
  finHook<{ dispute_id: string; notes?: string }>("fin_respond_dispute");
export const useAcceptDispute = () =>
  finHook<{ dispute_id: string }>("fin_accept_dispute");
export const useReceiptDeposit = () =>
  finHook<{ deposit_id: string }>("fin_receipt_deposit");

// ---- Gift cards & store credit (tree §7 → Gift Cards & Credits) ----
export const useIssueGiftCard = () => finHook<GiftCardPayload>("fin_issue_gift_card");
export const useRedeemGiftCard = () =>
  finHook<{ card_number: string; amount: number }>(
    "fin_redeem_gift_card",
  );
export const useCheckGiftCardBalance = () =>
  finHook<{ card_code: string }>("fin_check_card_balance");
export const useAddGiftCardValue = () =>
  finHook<{ card_id: string; amount_cents: number }>("fin_add_value");
export const useTransferGiftCard = () =>
  finHook<{ card_id: string; new_customer_id: string }>("fin_transfer_gift_card");
export const useDeactivateGiftCard = () =>
  finHook<{ card_id: string; reason?: string }>("fin_deactivate_gift_card");
export const useVoidGiftCard = () =>
  finHook<{ card_id: string; reason?: string }>("fin_void_gift_card");
export const useEditGiftCard = () =>
  finHook<{ card_id: string; recipient_name?: string; recipient_email?: string; recipient_phone?: string; sender_name?: string; gift_message?: string; expires_at?: string }>("fin_edit_gift_card");
export const useSendGiftCardReceipt = () =>
  finHook<{ card_id: string; to_email?: string }>("fin_send_gift_card_receipt");
export const useReissueGiftCard = () =>
  finHook<{ card_id: string; to_email?: string }>("fin_reissue_gift_card");
export const useReactivateGiftCard = () =>
  finHook<{ card_id: string }>("fin_reactivate_gift_card");
export const useExpireGiftCard = () =>
  finHook<{ card_id: string }>("fin_expire_gift_card");
export const useReplaceGiftCard = () =>
  finHook<{ card_id: string; reason: string }>("fin_replace_gift_card");
export const useConvertGiftCardToCredit = () =>
  finHook<{ card_id: string }>("fin_convert_gc");
export const useIssueStoreCredit = () =>
  finHook<{ customer_id: string; amount: number; expires_at?: string }>(
    "fin_issue_store_credit",
  );
export const useSendGiftCardReminder = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { card_id: string }) => {
      const res = await fetch("/api/admin/gift-cards/remind", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        throw new Error(j.error || j.detail || "Send failed");
      }
      return j;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gift-cards"] });
    },
  });
};

// ---- Banking (tree §7 → Banking) ----
export const useConnectBankAccount = () =>
  finHook<Record<string, unknown>>("fin_bank_connect");
export const useReconcileBank = () =>
  finHook<{ account_id: string; from?: string; to?: string }>("fin_reconcile");
export const useViewPayouts = () => finHook<Record<string, unknown>>("fin_bank_payouts");

// ---- Reports (tree §7 → via finance actions) ----
export const useRunProfitLoss = () => finHook<ReportPayload>("fin_run_profit_loss");
export const useRunBalanceSheet = () => finHook<ReportPayload>("fin_run_balance_sheet");
export const useRunTrialBalance = () => finHook<ReportPayload>("fin_run_trial_balance");
export const useRunGeneralLedger = () => finHook<ReportPayload>("fin_run_general_ledger");
export const useExportLedger = () => finHook<ReportPayload>("fin_export_ledger");

// ---- Payroll (tree §7 → Payroll; employee-facing payroll_* vs owner acct_payroll_*) ----
export const useRunPayroll = () =>
  finHook<{ period_start: string; period_end: string }>("fin_run_payroll");
export const useEditTimesheet = () =>
  finHook<{ timesheet_id: string } & Record<string, unknown>>("fin_edit_timesheet");
export const useViewTaxForms = () =>
  finHook<{ employee_id?: string; year?: number }>("fin_view_tax_forms");

// ============================================================================
// COMMERCE — POST /api/admin/commerce/actions
// Tree: §4 Order & Inventory, §5 Fulfillment, §6 Purchasing, §2.0 POS
// ============================================================================

const COM_ENDPOINT = "/api/admin/commerce/actions";
const COM_INVALIDATE = [
  ["admin", "orders"],
  ["admin", "inventory"],
];

/** Generic commerce action dispatcher. Prefer the typed hooks below. */
export function useCommerceAction() {
  return useActionMutation(COM_ENDPOINT, COM_INVALIDATE);
}

function comHook<P>(action: CommerceAction) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: P) =>
      postAction(COM_ENDPOINT, action, payload as Record<string, unknown>),
    onSuccess: () => {
      for (const key of COM_INVALIDATE) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

// ---- Orders (tree §4) ----
export const useCreateOrder = () => comHook<CreateOrderPayload>("com_create_order");
export const useViewOrderDetails = () =>
  comHook<{ order_id: string }>("com_create"); // detail fetch lives in useOrders
export const useExportOrdersCsv = () => comHook<ReportPayload>("com_export_csv");

// ---- Fulfillment (tree §5) ----
export const useAdvanceFulfillment = () =>
  comHook<FulfillmentAdvancePayload>("com_advance_fulfillment_stage");
export const usePrintPackingSlip = () =>
  comHook<{ order_id: string }>("com_packing_slip");
export const usePrintShippingLabel = () =>
  comHook<{ order_id: string; carrier?: string; label_provider?: "shippo" | "usps"; weight_lb?: number }>("com_shipping_label");
export const usePrintBatchSlips = () =>
  comHook<{ order_ids: string[] }>("com_batch_slips");
// Postage is strictly PER-ORDER: the com_print_postage_labels action
// serves one order_id (it returns the existing label or buys that one
// order's label after staff confirmation). There is NO batch postage
// call — the old { order_ids } contract could only ever 400 against
// that single-order action. Multi-order postage is the Fulfillment
// page's queue walk through ShippingLabelModal, one confirmed order
// at a time.
export const usePrintPostageLabels = () =>
  comHook<{ order_id: string; replace?: boolean }>("com_print_postage_labels");
export const useShippingRates = () =>
  comHook<{ order_id?: string; to_zip?: string; weight_lb?: number }>("com_shipping_rates");
export const useResendFulfillmentAlert = () =>
  comHook<{ order_id: string; message?: string }>("com_resend_alert");

// ---- Inventory (tree §4 → Inventory) ----
export const useAddInventory = () => comHook<RestockPayload>("com_add_inventory");
export const useRestockInventory = () => comHook<RestockPayload>("com_restock_inventory");
export const useExportInventoryCsv = () => comHook<ReportPayload>("com_inv_export_csv");
export const useExportInventoryLedger = () =>
  comHook<ReportPayload>("com_inv_export_ledger");

// ---- Purchasing (tree §6) ----
export const useCreatePurchaseOrder = () => comHook<CreatePoPayload>("com_create_po");
export const useReceivePurchaseOrder = () =>
  comHook<{ po_id: string; received_items: Array<{ sku_id: string; quantity: number }> }>(
    "com_receive_po",
  );
export const useEditVendor = () =>
  comHook<{ vendor_id: string } & Record<string, unknown>>("com_edit_vendor");
export const useViewVendor = () =>
  useActionMutation("/api/admin/purchasing/actions", [["admin", "purchasing"]]);

// ---- Returns (tree §2.2) ----
export const useListReturns = () =>
  comHook<{ status?: string; limit?: number }>("com_list_returns");
export const useReviewReturn = () =>
  comHook<{ return_id: string; decision: "approve" | "reject"; notes?: string }>(
    "com_review_return",
  );
export const useTrackReturn = () => comHook<{ return_id: string }>("com_track_return");
export const useViewReturn = () => comHook<{ return_id: string }>("com_view_return");

// ---- Register promos (tree §7 → Register) ----
export const useRegisterCoupon = () =>
  comHook<{ code: string } & Record<string, unknown>>("com_register_coupons");
export const useRegisterDiscount = () =>
  comHook<{ code: string } & Record<string, unknown>>("com_register_discounts");

// ============================================================================
// CMS — POST /api/admin/cms/actions
// Tree: §9 CMS Quick Actions
// ============================================================================

const CMS_ENDPOINT = "/api/admin/cms/actions";

/** Generic CMS action dispatcher. */
export function useCmsAction() {
  return useActionMutation(CMS_ENDPOINT, [["admin", "cms"]]);
}

function cmsHook(action: CmsAction) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      postAction(CMS_ENDPOINT, action, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "cms"] });
    },
  });
}

// ---- Services & pricing ----
export const useEditService = () =>
  cmsHook("cms_edit_service");
export const useAddServicePackage = () => cmsHook("cms_add_package");
export const useAddServiceAddon = () => cmsHook("cms_add_addon");
export const useEditPricingRules = () => cmsHook("cms_edit_pricing_rules");

// ---- Website ----
export const useUpdateCmsPage = () => cmsHook("cms_update_page");
export const useAddBanner = () => cmsHook("cms_add_banner");
export const useUpdateGallery = () => cmsHook("cms_update_gallery");
export const useEditNavigation = () => cmsHook("cms_edit_navigation");
export const useEditGlobalContent = () => cmsHook("cms_edit_global_content");
export const useUpdateSeo = () => cmsHook("cms_update_seo");

// ---- Policies ----
export const useEditLegalWaivers = () => cmsHook("cms_edit_legal_waivers");
export const useEditPoliciesPage = () => cmsHook("cms_edit_policies_page");

// ---- Payments ----
export const useEditGatewaySettings = () =>
  cmsHook("cms_edit_gateway_settings");

// ============================================================================
// ANALYTICS — POST /api/admin/analytics/actions
// Tree: §13 Analytics & Reports
// ============================================================================

const AN_ENDPOINT = "/api/admin/analytics/actions";

/** Generic analytics action dispatcher. */
export function useAnalyticsAction() {
  return useActionMutation(AN_ENDPOINT, []);
}

function anHook(action: AnalyticsAction) {
  return useMutation({
    mutationFn: (payload: ReportPayload) =>
      postAction(AN_ENDPOINT, action, payload as Record<string, unknown>),
  });
}

// ---- Dashboard (tree §13 → Dashboard) ----
export const useBookingsFunnel = () => anHook("an_bookings_funnel");
export const useDailyRevenueSummary = () => anHook("an_daily_revenue_summary");
export const useNoShowRate = () => anHook("an_no_show_rate");
export const useRebookRate = () => anHook("an_rebook_rate");

// ---- Financial reports ----
export const useArAgingReport = () => anHook("an_ar_aging");
export const useDepositLiability = () => anHook("an_deposit_liability");
export const useGiftCardLiability = () => anHook("an_gift_card_liability");
export const useStoreCreditLiability = () => anHook("an_store_credit_liability");

// ---- Operational reports ----
export const useGroomerPerformance = () => anHook("an_groomer_performance");
export const useServiceRevenue = () => anHook("an_service_revenue");
export const useProductSales = () => anHook("an_product_sales");
export const useMultiLocationRevenue = () => anHook("an_multi_location_revenue");
export const useCustomerAcquisition = () => anHook("an_customer_acquisition");

// ============================================================================
// SYSTEM — POST /api/admin/system/actions
// Tree: §8 Org/Settings, §10 Staff, §14 Global System
// ============================================================================

const SYS_ENDPOINT = "/api/admin/system/actions";

/** Generic system action dispatcher. */
export function useSystemAction() {
  return useActionMutation(SYS_ENDPOINT, [["admin", "settings"]]);
}

function sysHook(action: SystemAction, extraInvalidate: string[][] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      postAction(SYS_ENDPOINT, action, payload),
    onSuccess: () => {
      for (const key of [["admin", "settings"], ...extraInvalidate]) {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

// ---- Organization (tree §8) ----
export const useEditBusinessProfile = () => sysHook("sys_edit_business_profile");
export const useAddLocation = () => sysHook("sys_add_location");
export const useSwitchLocation = () => sysHook("sys_switch_location");
export const useEditBranding = () => sysHook("sys_edit_branding");
export const useEditOperatingHours = () => sysHook("sys_edit_hours");

// ---- Admin users ----
export const useAddAdminUser = () => sysHook("sys_add_user");
export const useEditUserRole = () => sysHook("sys_edit_role");
export const useSuspendUser = () => sysHook("sys_suspend_user");
export const useReset2FA = () => sysHook("sys_reset_2fa");
export const useSendMagicLink = () =>
  sysHook("sys_send_magic_link");

// ---- Book Next Visit ----
// Navigates to the appointments page with the customer pre-selected.
// This is a navigation action (no API call) — the booking flow handles creation.
export function useBookNextVisit() {
  return {
    bookNextVisit: (customerId: string, customerName?: string) => {
      const params = new URLSearchParams();
      params.set("customer_id", customerId);
      if (customerName) params.set("customer_name", customerName);
      params.set("action", "new");
      window.location.href = `/admin/appointments?${params.toString()}`;
    },
  };
}



// ---- Booking & operations ----
export const useAddHolidayBlackout = () => sysHook("sys_add_blackout");
export const useToggleOnlineBooking = () => sysHook("sys_toggle_online_booking");
export const useEditDepositSettings = () => sysHook("sys_edit_deposit_settings");
export const useEditCancellationPolicy = () =>
  sysHook("sys_edit_cancellation_policy");
export const useEditNoShowPenalty = () => sysHook("sys_edit_no_show_penalty");

// ---- Staff (tree §10) ----
export const useAddTeamMember = () => sysHook("sys_add_member");
export const useAddEmployee = () => sysHook("sys_add_employee");
export const useBuildSchedule = () => sysHook("sys_build_schedule");
export const useAssignShifts = () => sysHook("sys_assign_shifts");
export const useAddService = () => sysHook("sys_add_service");
export const useAddSurcharge = () => sysHook("sys_add_surcharge");

// ---- Automation center (tree §14) ----
export const useRunRebookingAutomation = () => sysHook("sys_run_rebooking");
export const useRunAppointmentReminders = () => sysHook("sys_run_appt_reminders");
export const useRunVaccineReminders = () => sysHook("sys_run_vaccine_reminders");
export const useRunUnsignedDocReminders = () => sysHook("sys_run_unsigned_docs");
export const useRunBirthdayMessages = () => sysHook("sys_run_birthday_msgs");
export const useRunWinBackCampaign = () => sysHook("sys_run_winback");
export const useRunPaymentReminders = () => sysHook("sys_run_payment_reminders");
export const useRunDuplicateDetection = () => sysHook("sys_run_duplicate_detection");
export const useDismissDuplicateCandidate = () => sysHook("sys_dismiss_duplicate_candidate");
export const useRunMissingContactInfo = () => sysHook("sys_run_missing_contact_info");

// ---- System ----
export const useViewSystemHealth = () => sysHook("sys_view_system_health");
export const useRunBackup = () => sysHook("sys_run_backup");
