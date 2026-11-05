/** Shared CRM vocabularies — plain module so both server pages and client
 *  components can import the values (client-component exports can't be read
 *  as values from server components). */

export const LEAD_SOURCES = ["website", "google", "referral", "social_media", "phone", "walk_in", "campaign", "other"];

export const LOST_REASONS = [
  { value: "price", label: "Price" },
  { value: "schedule", label: "Schedule" },
  { value: "location", label: "Location" },
  { value: "no_availability", label: "No availability" },
  { value: "found_another_maker", label: "Found another maker" },
  { value: "other", label: "Other" },
];

export const TRIGGERS = [
  { value: "repurchase_reminder", label: "Repurchase reminder (rebooking equivalent)" },
  { value: "cart_abandoned", label: "Cart reminder" },
  { value: "birthday", label: "Birthday message" },
  { value: "winback", label: "Win-back customers" },
  { value: "payment_reminder", label: "Payment reminder" },
  { value: "review_request", label: "Review request after delivery" },
  { value: "welcome_series", label: "New customer welcome" },
];
