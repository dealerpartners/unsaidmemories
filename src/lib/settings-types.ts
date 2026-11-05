export interface SystemSettings {
  // 1. Organization & Brand (OrgMultiLocationScreen, OrgBrandIdentityScreen)
  org_business_name: string;
  org_tagline: string;
  org_phone: string;
  org_email: string;
  org_website: string;
  org_address: string;
  org_tax_ein: string;
  org_timezone: string;
  org_logo_url: string;
  org_sms_header: string;
  org_receipt_footer: string;
  org_primary_color: string;
  org_secondary_color: string;
  org_corners: "SQUARE" | "ROUNDED" | "PILL";
  org_accent_dim: string;

  // 2. Booking Operations & Rules (BookingOperationsRulesScreen, BookingRulesPoliciesScreen)

  // 3. Financial, Payments & Stripe (StripeIntegrationScreen, PaymentsTaxLegalScreen, EscrowDepositsForfeituresScreen)
  stripe_account_id: string;
  stripe_connection_status: "CONNECTED" | "NOT_CONNECTED" | "PENDING";
  stripe_mode: "LIVE" | "TEST";
  payment_tax_rate_percent: number;
  payment_enable_tips: boolean;
  payment_allow_split_payments: boolean;
  payment_escrow_hold_days: number;
  payment_commission_default_rate: number;

  // 4. Invoices & Aging Ledger (InvoicesAgingLedgerScreen)
  invoice_due_days: number;
  invoice_late_fee_percent: number;
  invoice_late_fee_days: number;
  invoice_auto_remind_days: string; // comma-separated e.g. "3,7,14"

  // 5. Portals & Website (CmsBookingWizardScreen, CustomerPortalScreen)
  portal_allow_self_cancel: boolean;
  portal_allow_self_reschedule: boolean;
  portal_show_pricing_upfront: boolean;
  portal_custom_domain: string;
  portal_enable_chat: boolean;
  portal_theme: "light" | "dark" | "system";

  // 6. Social Integrations & Directories (OrgSocialDirectoriesScreen)
  social_instagram_handle: string;
  social_facebook_page: string;
  social_tiktok_handle: string;
  social_yelp_url: string;
  social_google_business_id: string;

  // 7. System Health, Telemetry & Security (SystemHealthTelemetryScreen)
  system_enforce_mfa: boolean;
  system_session_timeout_minutes: number;
  system_log_retention_days: number;
  system_webhook_retry_limit: number;
  system_api_threshold_ms: number;
}

export const DEFAULT_SETTINGS: SystemSettings = {
  org_business_name: "UnSaid Memories",
  org_tagline: "Thoughtful things for the people who matter",
  org_phone: "",
  org_email: "hello@unsaidmemories.com",
  org_website: "https://unsaidmemories.com",
  org_address: "",
  org_tax_ein: "",
  org_timezone: "America/Chicago",
  org_logo_url: "",
  org_sms_header: "",
  org_receipt_footer: "",
  org_primary_color: "#000000",
  org_secondary_color: "#FFFFFF",
  org_corners: "SQUARE",
  org_accent_dim: "#F3F3F4",

  // booking_* defaults removed — e-commerce has no booking/appointment
  // surface. The keys stay declared on SystemSettings above for
  // backward compatibility with stored settings rows that may still
  // carry them, but DEFAULT_SETTINGS no longer ships values for them.

  stripe_account_id: "",
  stripe_connection_status: "NOT_CONNECTED",
  stripe_mode: "TEST",
  payment_tax_rate_percent: 0,
  payment_enable_tips: false,
  payment_allow_split_payments: false,
  payment_escrow_hold_days: 0,
  payment_commission_default_rate: 0,

  invoice_due_days: 14,
  invoice_late_fee_percent: 1.5,
  invoice_late_fee_days: 5,
  invoice_auto_remind_days: "3,7,14",

  portal_allow_self_cancel: true,
  portal_allow_self_reschedule: true,
  portal_show_pricing_upfront: true,
  portal_custom_domain: "",
  portal_enable_chat: true,
  portal_theme: "light",

  social_instagram_handle: "",
  social_facebook_page: "",
  social_tiktok_handle: "",
  social_yelp_url: "",
  social_google_business_id: "",

  system_enforce_mfa: false,
  system_session_timeout_minutes: 60,
  system_log_retention_days: 365,
  system_webhook_retry_limit: 5,
  system_api_threshold_ms: 1000,
};
