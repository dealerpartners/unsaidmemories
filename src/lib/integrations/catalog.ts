/**
 * Connections & Keys catalog — every service the platform is wired
 * for, in plain language, with the exact fields she can paste a key
 * into and a button that opens the service's own website. Shared by
 * the admin page and the keys API so they can never drift apart.
 */

export interface IntegrationField {
  keyName: string;
  label: string;
  secret: boolean;
  placeholder: string;
  help: string;
}

export interface IntegrationService {
  id: string;
  name: string;
  category: string;
  blurb: string;
  dashboardUrl: string | null;
  dashboardLabel: string;
  fields: IntegrationField[];
}

export const INTEGRATION_SERVICES: IntegrationService[] = [
  {
    id: "stripe",
    name: "Stripe",
    category: "Payments",
    blurb: "Takes credit-card payments at checkout. Money from sales lands in the bank account connected to Stripe.",
    dashboardUrl: "https://dashboard.stripe.com",
    dashboardLabel: "Open Stripe",
    fields: [
      { keyName: "STRIPE_SECRET_KEY", label: "Secret key", secret: true, placeholder: "sk_live_… or sk_test_…", help: "In Stripe: Developers → API keys → Secret key." },
      { keyName: "STRIPE_PUBLISHABLE_KEY", label: "Publishable key", secret: false, placeholder: "pk_live_… or pk_test_…", help: "In Stripe: Developers → API keys → Publishable key." },
      { keyName: "STRIPE_WEBHOOK_SECRET", label: "Webhook signing secret", secret: true, placeholder: "whsec_…", help: "In Stripe: Developers → Webhooks → your endpoint → Signing secret. Needed so orders are confirmed automatically." },
    ],
  },
  {
    id: "twilio",
    name: "Twilio Verify",
    category: "Security",
    blurb: "Texts a one-time code to a customer's phone to prove the account belongs to a real person with a real mobile. Every new account verifies once, and a first checkout requires it too. Numbers that are not real mobiles (VOIP, landlines, virtual numbers) are blocked before a code is ever sent.",
    dashboardUrl: "https://console.twilio.com",
    dashboardLabel: "Open Twilio",
    fields: [
      { keyName: "TWILIO_ACCOUNT_SID", label: "Account SID", secret: false, placeholder: "AC…", help: "In Twilio: Console home → Account info → Account SID." },
      { keyName: "TWILIO_AUTH_TOKEN", label: "Auth Token", secret: true, placeholder: "Your Auth Token", help: "In Twilio: Console home → Account info → Auth Token. Treat it like a password — anyone with it can send texts as this account." },
      { keyName: "TWILIO_VERIFY_SERVICE_SID", label: "Verify Service SID", secret: false, placeholder: "VA…", help: "In Twilio: Verify → Services → your service → Service SID. The service sets the code length and the name customers see on the text." },
      { keyName: "TWILIO_ORG_CLIENT_ID", label: "Organization Client ID", secret: false, placeholder: "OQ…", help: "In Twilio: Settings → Organization settings → Organization API access → your OAuth app → Client ID. This is the organization-level login the admin panel uses to manage Twilio users (for example, adding support staff as the team grows). It is separate from the account keys above." },
      { keyName: "TWILIO_ORG_CLIENT_SECRET", label: "Organization Client Secret", secret: true, placeholder: "Your Organization Client Secret", help: "Shown once when the OAuth app is created. Treat it like a master password — with it, someone can mint organization access tokens and manage users across the Twilio organization." },
    ],
  },
  {
    id: "authorize-net",
    name: "Authorize.net",
    category: "Payments",
    blurb: "Takes credit-card payments at checkout through your own merchant account (Electronic Merchant Systems / Kurv). When these keys are saved, checkout uses Authorize.net; Stripe stays connected for banking data.",
    dashboardUrl: "https://login.authorize.net",
    dashboardLabel: "Open Authorize.net",
    fields: [
      { keyName: "AUTHORIZENET_API_LOGIN_ID", label: "API Login ID", secret: false, placeholder: "Your API Login ID", help: "In Authorize.net: Account → Settings → API Credentials & Keys → API Login ID." },
      { keyName: "AUTHORIZENET_PUBLIC_CLIENT_KEY", label: "Public Client Key", secret: false, placeholder: "Your Public Client Key", help: "In Authorize.net: Account → Settings → API Credentials & Keys → Public Client Key. The checkout page uses it to send card details straight to Authorize.net — the card never touches this store's servers." },
      { keyName: "AUTHORIZENET_TRANSACTION_KEY", label: "Transaction Key", secret: true, placeholder: "Your current Transaction Key", help: "In Authorize.net: Account → Settings → API Credentials & Keys → New Transaction Key. Generating a new one replaces the old — update it here the same day." },
      { keyName: "AUTHORIZENET_SIGNATURE_KEY", label: "Signature Key", secret: true, placeholder: "Your Signature Key", help: "In Authorize.net: Account → Settings → API Credentials & Keys → New Signature Key. The store uses it to confirm payment notices really came from Authorize.net. After saving it, add a Webhook in Authorize.net (Account → Settings → Webhooks) pointing at https://unsaidmemories.com/api/webhooks/authorize-net with all payment events on." },
      { keyName: "AUTHORIZENET_ENVIRONMENT", label: "Account type", secret: false, placeholder: "live", help: "Type sandbox if these keys are from a sandbox (test) account; otherwise leave as live." },
    ],
  },
  {
    id: "posthog",
    name: "PostHog",
    category: "Analytics",
    blurb: "Shows what visitors do on the store — which products they view, where they stop, and what they buy.",
    dashboardUrl: "https://us.posthog.com",
    dashboardLabel: "Open PostHog",
    fields: [
      { keyName: "POSTHOG_KEY", label: "Project key", secret: false, placeholder: "phc_…", help: "In PostHog: Project settings → Project API Key." },
      { keyName: "POSTHOG_HOST", label: "PostHog address", secret: false, placeholder: "https://us.i.posthog.com", help: "Leave as https://us.i.posthog.com unless your PostHog account is in Europe (then https://eu.i.posthog.com)." },
    ],
  },
  {
    id: "google-signin",
    name: "Google Sign-In",
    category: "Accounts",
    blurb: "Lets customers sign in with their Google account — one tap instead of a password. The sign-in runs on this store's own pages and lands the customer in their account.",
    dashboardUrl: "https://console.cloud.google.com/apis/credentials",
    dashboardLabel: "Open Google Cloud Console",
    fields: [
      { keyName: "GOOGLE_CLIENT_ID", label: "Client ID", secret: false, placeholder: "…apps.googleusercontent.com", help: "In Google Cloud Console: APIs & Services → Credentials → your OAuth 2.0 Client ID (Web application). On that same client, add the Authorized redirect URI https://unsaidmemories.com/api/auth/google/callback and the Authorized JavaScript origin https://unsaidmemories.com." },
      { keyName: "GOOGLE_CLIENT_SECRET", label: "Client secret", secret: true, placeholder: "GOCSPX-…", help: "Shown next to the Client ID in Google Cloud Console. The store uses it only on the server, to complete a sign-in Google has already approved." },
    ],
  },
  {
    id: "ga4",
    name: "Google Analytics (GA4)",
    category: "Analytics",
    blurb: "Google's free visitor statistics — how many people visit, where they come from, and what they look at.",
    dashboardUrl: "https://analytics.google.com",
    dashboardLabel: "Open Google Analytics",
    fields: [
      { keyName: "GA4_MEASUREMENT_ID", label: "Measurement ID", secret: false, placeholder: "G-XXXXXXXXXX", help: "In Google Analytics: Admin → Data streams → your website → Measurement ID." },
    ],
  },
  {
    id: "gtm",
    name: "Google Tag Manager",
    category: "Analytics",
    blurb: "One container that runs the store's Google tags — Analytics and any marketing tags — on every page, and receives every page's headings.",
    dashboardUrl: "https://tagmanager.google.com",
    dashboardLabel: "Open Tag Manager",
    fields: [
      { keyName: "GTM_CONTAINER_ID", label: "Container ID", secret: false, placeholder: "GTM-XXXXXXX", help: "In Google Tag Manager: the container ID at the top of your workspace (GTM-…). The store loads the container on every page once this is saved." },
    ],
  },
  {
    id: "clarity",
    name: "Microsoft Clarity",
    category: "Analytics",
    blurb: "Free heatmaps and session recordings — see where visitors click, scroll and hesitate on every page.",
    dashboardUrl: "https://clarity.microsoft.com",
    dashboardLabel: "Open Clarity",
    fields: [
      { keyName: "CLARITY_PROJECT_ID", label: "Project ID", secret: false, placeholder: "xxxxxxxxxx", help: "In Microsoft Clarity: Settings → Setup → your project ID (the code at the end of the install script, after clarity.ms/tag/). The store loads Clarity on every page once this is saved." },
    ],
  },
  {
    id: "metricool",
    name: "Metricool",
    category: "Marketing",
    blurb: "Schedules and tracks social-media posts across your networks from one calendar. Your token is kept here for safekeeping — the store itself does not post through Metricool yet.",
    dashboardUrl: "https://app.metricool.com",
    dashboardLabel: "Open Metricool",
    fields: [
      { keyName: "METRICOOL_API_TOKEN", label: "API token", secret: true, placeholder: "Your Metricool API token", help: "In Metricool: Settings → API access → API token." },
      { keyName: "METRICOOL_USER_ID", label: "User ID", secret: false, placeholder: "Your Metricool user ID", help: "Shown next to the API token in Metricool's API access settings." },
    ],
  },
  {
    id: "shippo",
    name: "Shippo",
    category: "Suppliers (printing & shipping)",
    blurb: "Buys and prints shipping labels and compares carrier rates for your orders. Connect it so labels come from here instead of the carrier's website.",
    dashboardUrl: "https://apps.goshippo.com",
    dashboardLabel: "Open Shippo",
    fields: [
      { keyName: "SHIPPO_API_KEY", label: "API key", secret: true, placeholder: "shippo_live_… or shippo_test_…", help: "In Shippo: Settings → API → generate a token. Use the live token when you're ready to buy real labels." },
    ],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    category: "Marketing",
    blurb: "Sends customers WhatsApp messages — order updates and answers — from your business number. Uses Meta's WhatsApp Business platform.",
    dashboardUrl: "https://business.facebook.com",
    dashboardLabel: "Open Meta Business",
    fields: [
      { keyName: "WHATSAPP_ACCESS_TOKEN", label: "Access token", secret: true, placeholder: "Your WhatsApp access token", help: "In Meta for Developers: your app → WhatsApp → API setup. A temporary token lasts 24 hours; a permanent one comes from a system user." },
      { keyName: "WHATSAPP_PHONE_NUMBER_ID", label: "Phone number ID", secret: false, placeholder: "e.g. 123456789012345", help: "In the same API setup screen — the ID of the business phone number (not the number itself)." },
      { keyName: "WHATSAPP_BUSINESS_ACCOUNT_ID", label: "Business account ID", secret: false, placeholder: "e.g. 123456789012345", help: "Shown in the same API setup screen as the WhatsApp Business account ID." },
    ],
  },
  {
    id: "line",
    name: "LINE",
    category: "Marketing",
    blurb: "Sends customers LINE messages — order updates and answers — from your LINE official account. Popular with customers in Japan, Thailand, and Taiwan.",
    dashboardUrl: "https://manager.line.biz",
    dashboardLabel: "Open LINE Official Account Manager",
    fields: [
      { keyName: "LINE_CHANNEL_ACCESS_TOKEN", label: "Channel access token", secret: true, placeholder: "Your long-lived channel access token", help: "In the LINE Developers console: your Messaging API channel → Messaging API tab → Channel access token (issue a long-lived one)." },
      { keyName: "LINE_CHANNEL_ID", label: "Channel ID", secret: false, placeholder: "e.g. 1234567890", help: "In the LINE Developers console: the channel's Basic settings tab." },
      { keyName: "LINE_CHANNEL_SECRET", label: "Channel secret", secret: true, placeholder: "Your channel secret", help: "In the same Basic settings tab — used to verify messages really came from LINE." },
    ],
  },
  {
    id: "printful",
    name: "Printful",
    category: "Suppliers (printing & shipping)",
    blurb: "Prints and ships apparel and gifts. One of the factories that makes your products when an order comes in.",
    dashboardUrl: "https://www.printful.com/dashboard",
    dashboardLabel: "Open Printful",
    fields: [
      { keyName: "PRINTFUL_API_KEY", label: "API key", secret: true, placeholder: "Your Printful private token", help: "In Printful: Settings → API → Private tokens." },
      { keyName: "PRINTFUL_STORE_ID", label: "Store ID", secret: false, placeholder: "1234567", help: "Shown in Printful next to your store's name." },
    ],
  },
  {
    id: "gelato",
    name: "Gelato",
    category: "Suppliers (printing & shipping)",
    blurb: "Prints and ships products from factories close to each customer, so delivery is fast worldwide.",
    dashboardUrl: "https://dashboard.gelato.com",
    dashboardLabel: "Open Gelato",
    fields: [
      { keyName: "GELATO_API_KEY", label: "API key", secret: true, placeholder: "Your Gelato API key", help: "In Gelato: Developer → API Keys → create a key for orders." },
    ],
  },
  {
    id: "prodigi",
    name: "Prodigi",
    category: "Suppliers (printing & shipping)",
    blurb: "Prints and ships wall art, mugs, and gifts through its global factory network.",
    dashboardUrl: "https://www.prodigi.com",
    dashboardLabel: "Open Prodigi",
    fields: [
      { keyName: "PRODIGI_API_KEY", label: "API key", secret: true, placeholder: "Your Prodigi API key", help: "In Prodigi: Dashboard → Settings → API keys." },
    ],
  },
  {
    id: "gooten",
    name: "Gooten",
    category: "Suppliers (printing & shipping)",
    blurb: "Another print-and-ship factory network connected to the store.",
    dashboardUrl: "https://www.gooten.com",
    dashboardLabel: "Open Gooten",
    fields: [
      { keyName: "GOOTEN_PARTNER_BILLING_KEY", label: "Partner billing key", secret: true, placeholder: "Your Gooten key", help: "Provided by Gooten when your partner account was set up." },
      { keyName: "GOOTEN_RECIPE_ID", label: "Recipe ID (for catalog sync)", secret: false, placeholder: "Your Gooten recipe ID", help: "Gooten gives each store setup a recipe ID — the catalog sync uses it to pull your Gooten products in." },
    ],
  },
  {
    id: "teemill",
    name: "Teemill",
    category: "Suppliers (printing & shipping)",
    blurb: "Prints organic apparel and ships it plastic-free.",
    dashboardUrl: "https://teemill.com",
    dashboardLabel: "Open Teemill",
    fields: [
      { keyName: "TEEMILL_API_KEY", label: "API key", secret: true, placeholder: "Your Teemill API key", help: "In Teemill: your store's API settings page." },
    ],
  },
  {
    id: "spreadconnect",
    name: "SpreadConnect",
    category: "Suppliers (printing & shipping)",
    blurb: "Spreadshirt's print-and-ship service for apparel and accessories.",
    dashboardUrl: "https://www.spreadconnect.app",
    dashboardLabel: "Open SpreadConnect",
    fields: [
      { keyName: "SPREADCONNECT_API_KEY", label: "API key", secret: true, placeholder: "Your SpreadConnect key", help: "In SpreadConnect: Settings → API access." },
    ],
  },
  {
    id: "pollinations",
    name: "Pollinations (AI pictures)",
    category: "Design tools",
    blurb: "Creates the AI artwork in the Design Studio when you describe a picture and press Generate.",
    dashboardUrl: "https://pollinations.ai",
    dashboardLabel: "Open Pollinations",
    fields: [
      { keyName: "POLLINATIONS_API_KEY", label: "API key", secret: true, placeholder: "Your Pollinations key", help: "From your Pollinations account page." },
    ],
  },
  {
    id: "algolia",
    name: "Algolia (store search)",
    category: "Design tools",
    blurb: "Powers the fast product search shoppers use on the store.",
    dashboardUrl: "https://www.algolia.com/dashboard",
    dashboardLabel: "Open Algolia",
    fields: [
      { keyName: "ALGOLIA_APP_ID", label: "Application ID", secret: false, placeholder: "Your Algolia app ID", help: "In Algolia: Settings → API Keys." },
      { keyName: "ALGOLIA_WRITE_API_KEY", label: "Admin / write key", secret: true, placeholder: "Your Algolia admin key", help: "In Algolia: Settings → API Keys → Admin API Key." },
      { keyName: "ALGOLIA_SEARCH_API_KEY", label: "Search key", secret: false, placeholder: "Your Algolia search key", help: "In Algolia: Settings → API Keys → Search-Only API Key." },
    ],
  },
  {
    id: "vercel-ai-gateway",
    name: "Vercel AI Gateway (shopping assistant)",
    category: "Design tools",
    blurb: "Powers the store's shopping assistant — the helper that listens to what a gift is for and suggests real products from the shop. Without a key, the assistant still works: it shows the closest matching products, just without the conversational touch.",
    dashboardUrl: "https://vercel.com/dashboard",
    dashboardLabel: "Open Vercel",
    fields: [
      { keyName: "AI_GATEWAY_API_KEY", label: "AI Gateway API key", secret: true, placeholder: "vck_…", help: "In Vercel: your team → AI Gateway → API Keys. One key reaches the models the assistant can use." },
    ],
  },
  {
    id: "resend",
    name: "Resend (email)",
    category: "Email",
    blurb: "Sends the store's emails — order confirmations, receipts, and password resets.",
    dashboardUrl: "https://resend.com/api-keys",
    dashboardLabel: "Open Resend",
    fields: [
      { keyName: "RESEND_API_KEY", label: "API key", secret: true, placeholder: "re_…", help: "In Resend: API Keys → Create API Key." },
    ],
  },
  {
    id: "brevo",
    name: "Brevo (email)",
    category: "Email",
    blurb: "Your existing email service. Connect it and the store can send through Brevo — your domain is already verified with Brevo, so no domain setup is needed. The SMTP key is the one the sign-in system uses for password resets and confirmations.",
    dashboardUrl: "https://app.brevo.com/settings/keys/api",
    dashboardLabel: "Open Brevo",
    fields: [
      { keyName: "BREVO_API_KEY", label: "API key", secret: true, placeholder: "xkeysib-…", help: "In Brevo: Settings → SMTP & API → API Keys → Generate a new API key." },
      { keyName: "BREVO_SMTP_KEY", label: "SMTP key (for sign-in emails)", secret: true, placeholder: "xsmtpsib-…", help: "In Brevo: Settings → SMTP & API → SMTP tab. This is the password the sign-in system sends through — password resets and email confirmations." },
    ],
  },
  {
    id: "vercel",
    name: "Vercel",
    category: "Infrastructure",
    blurb: "Hosts the store itself — every update to the site is published through Vercel. A token here lets the admin check deployment health.",
    dashboardUrl: "https://vercel.com/dashboard",
    dashboardLabel: "Open Vercel",
    fields: [
      { keyName: "VERCEL_ACCESS_TOKEN", label: "Project access token", secret: true, placeholder: "Your Vercel access token", help: "In Vercel: Settings → Tokens → Create. The site runs on Vercel either way — this token only powers the health check on this page." },
    ],
  },
  {
    id: "supabase",
    name: "Supabase",
    category: "Infrastructure",
    blurb: "The store's database, sign-ins, and file storage. These are set on the server itself — the shop is already running on them; this card shows their status.",
    dashboardUrl: "https://supabase.com/dashboard",
    dashboardLabel: "Open Supabase",
    fields: [
      { keyName: "SUPABASE_URL", label: "Project URL", secret: false, placeholder: "https://your-project.supabase.co", help: "Set on the server. Shown for status only — changing it is a developer task, not a paste-a-key step." },
      { keyName: "SUPABASE_SERVICE_ROLE_KEY", label: "Service role key", secret: true, placeholder: "Your service role key", help: "Set on the server. Never share this key — it can read and change everything in the database." },
    ],
  },
  {
    id: "printify",
    name: "Printify",
    category: "Suppliers (printing & shipping)",
    blurb: "Print-on-demand network — connect it and its shops can supply products alongside the other printers.",
    dashboardUrl: "https://printify.com/app/dashboard",
    dashboardLabel: "Open Printify",
    fields: [
      { keyName: "PRINTIFY_API_KEY", label: "API token", secret: true, placeholder: "Your Printify personal access token", help: "In Printify: Profile → API tokens → Generate. The test button reads your shop list back to prove the token works." },
      { keyName: "PRINTIFY_WEBHOOK_SECRET", label: "Webhook secret", secret: true, placeholder: "Set automatically when shipment webhooks are registered", help: "Signs Printify's shipment notifications (order shipped / delivered) so tracking flows into the customer's account automatically. Registered by the webhook setup — replace it and re-register if it is ever rotated." },
    ],
  },
  {
    id: "cloudprinter",
    name: "Cloudprinter",
    category: "Suppliers (printing & shipping)",
    blurb: "Print-on-demand network for paper goods, books, and apparel — routes each order to the closest factory in 104 countries.",
    dashboardUrl: "https://apps.cloudprinter.com",
    dashboardLabel: "Open Cloudprinter",
    fields: [
      { keyName: "CLOUDPRINTER_API_KEY", label: "API key", secret: true, placeholder: "Your Cloudprinter API key", help: "In Cloudprinter: CloudCore API Interface → create an API key. This is the account key for catalog and orders — the webhook key is separate." },
    ],
  },
  {
    id: "cj-dropshipping",
    name: "CJ Dropshipping",
    category: "Suppliers (printing & shipping)",
    blurb: "Product sourcing and fulfillment — the supplier catalog the store already browses. Connecting the account key lets orders flow to CJ.",
    dashboardUrl: "https://cjdropshipping.com",
    dashboardLabel: "Open CJ Dropshipping",
    fields: [
      { keyName: "CJ_EMAIL", label: "Account email", secret: false, placeholder: "The email on the CJ account", help: "The email address the CJ Dropshipping account signs in with." },
      { keyName: "CJ_API_KEY", label: "API key", secret: true, placeholder: "Your CJ API key", help: "In CJ: My CJ → API → generate an API key. The test exchanges it for an access token to prove it works." },
    ],
  },
  {
    id: "apliiq",
    name: "Apliiq",
    category: "Suppliers (printing & shipping)",
    blurb: "Custom apparel and private-label fulfillment. Save the key here now; catalog and order wiring follow the same supplier pattern as the other printers.",
    dashboardUrl: "https://www.apliiq.com",
    dashboardLabel: "Open Apliiq",
    fields: [
      { keyName: "APLIIQ_API_KEY", label: "API key", secret: true, placeholder: "Your Apliiq API key", help: "From your Apliiq partner account. Stored locked here until the supplier sync is switched on." },
    ],
  },
  {
    id: "dropcommerce",
    name: "DropCommerce",
    category: "Suppliers (printing & shipping)",
    blurb: "North American dropshipping suppliers. Save the key here now; catalog and order wiring follow the same supplier pattern.",
    dashboardUrl: "https://dropcommerce.com",
    dashboardLabel: "Open DropCommerce",
    fields: [
      { keyName: "DROPCOMMERCE_API_KEY", label: "API key", secret: true, placeholder: "Your DropCommerce API key", help: "From your DropCommerce account. Stored locked here until the supplier sync is switched on." },
    ],
  },
  {
    id: "spocket",
    name: "Spocket",
    category: "Suppliers (printing & shipping)",
    blurb: "Dropshipping marketplace and supplier catalog. Save the key here now; catalog and order wiring follow the same supplier pattern.",
    dashboardUrl: "https://www.spocket.co",
    dashboardLabel: "Open Spocket",
    fields: [
      { keyName: "SPOCKET_API_KEY", label: "API key", secret: true, placeholder: "Your Spocket API key", help: "From your Spocket account. Stored locked here until the supplier sync is switched on." },
    ],
  },
  {
    id: "syncee",
    name: "Syncee",
    category: "Suppliers (printing & shipping)",
    blurb: "Supplier marketplace and product data. Save the key here now; catalog and order wiring follow the same supplier pattern.",
    dashboardUrl: "https://syncee.com",
    dashboardLabel: "Open Syncee",
    fields: [
      { keyName: "SYNCEE_API_KEY", label: "API key", secret: true, placeholder: "Your Syncee API key", help: "From your Syncee account. Stored locked here until the supplier sync is switched on." },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    category: "AI & model providers",
    blurb: "GPT models — available for AI features that choose OpenAI. The test reads your model list back.",
    dashboardUrl: "https://platform.openai.com",
    dashboardLabel: "Open OpenAI",
    fields: [
      { keyName: "OPENAI_API_KEY", label: "API key", secret: true, placeholder: "sk-…", help: "In OpenAI: API keys → Create new secret key." },
    ],
  },
  {
    id: "anthropic",
    name: "Claude (Anthropic)",
    category: "AI & model providers",
    blurb: "Claude models — available for AI features that choose Anthropic. The test reads your model list back.",
    dashboardUrl: "https://console.anthropic.com",
    dashboardLabel: "Open Anthropic",
    fields: [
      { keyName: "ANTHROPIC_API_KEY", label: "API key", secret: true, placeholder: "sk-ant-…", help: "In the Anthropic console: Settings → API Keys → Create Key." },
    ],
  },
  {
    id: "google-ai",
    name: "Gemini (Google AI)",
    category: "AI & model providers",
    blurb: "Gemini models and Google AI services. The test reads your model list back.",
    dashboardUrl: "https://aistudio.google.com",
    dashboardLabel: "Open Google AI Studio",
    fields: [
      { keyName: "GOOGLE_AI_API_KEY", label: "API key", secret: true, placeholder: "Your Google AI API key", help: "In Google AI Studio: Get API key → Create API key." },
    ],
  },
  {
    id: "codex",
    name: "Codex",
    category: "AI & model providers",
    blurb: "Coding-agent access for developer workflows. Codex signs in with OAuth rather than a pasted key, so this card is a placeholder for the connection record.",
    dashboardUrl: "https://chatgpt.com/codex",
    dashboardLabel: "Open Codex",
    fields: [
      { keyName: "CODEX_API_KEY", label: "API key / OAuth", secret: true, placeholder: "Your Codex credential", help: "Stored locked for the developer workflow. There is no account read to test a Codex credential against." },
    ],
  },
];

export const ALL_KEY_NAMES: string[] = INTEGRATION_SERVICES.flatMap((s) => s.fields.map((f) => f.keyName));
