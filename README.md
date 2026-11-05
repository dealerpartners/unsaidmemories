# Unsaid Memories — storefront and admin platform

The production application for Unsaid Memories (owner: Almeta Rogers; brand line: KIN Score).
One codebase containing the public storefront, the admin platform, the self-service
Ad Center, a Payload-powered CMS admin, and the affiliate dashboard.

- Production: https://unsaid-theta.vercel.app (custom domain cutover is an owner step)
- Repository: github.com/leashed901-rgb/unsaid — `main` is the production branch
- Hosting: Vercel project `unsaid` — every push to `main` deploys to production
- Database: Supabase project `pcwwvfgxnrglmmpbfqhf` (Postgres)

## Ownership

Everything runs on the owner's accounts: her GitHub, her Vercel, her Supabase,
her Stripe, her supplier accounts. No part of the system depends on the original
builder's accounts or keys. Service keys are entered in two places only:

1. Vercel → Project → Settings → Environment Variables (infrastructure keys)
2. The app's own **Connections & Keys** page in the admin (supplier and service
   keys; stored encrypted with `INTEGRATIONS_ENCRYPTION_KEY`)

A new development team needs: GitHub access to the repo, Vercel team access,
Supabase project access, and the environment variable values from the Vercel
project settings. Nothing else.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.3 (App Router, Turbopack), React 19, TypeScript 5 |
| Styling | Tailwind CSS 4 via `@tailwindcss/postcss`; design tokens are CSS variables |
| Runtime / packages | Bun (`bun.lock` is the only lockfile; Vercel installs and builds with Bun) |
| Database | Supabase Postgres — 735 tables in `public`; access via PostgREST, database RPC functions, and the `pg` driver in a few admin routes |
| CMS | Payload 3.92 (admin at `/cms-admin`, config in `payload.config.ts`) |
| Payments | Stripe (keys are the owner's, entered at handover) |
| Email | Resend (sending requires the owner's verified domain) |
| Search | Algolia (products index) |
| Suppliers | Print-on-demand APIs — Printful and Printify are the working set |

## Run locally

```bash
bun install
bun run dev        # http://localhost:3000
bun run build      # production build (sets a 6 GB heap; the app is large)
bun run lint
```

Local development needs a `.env.local` with the variables listed below.
Values come from the Vercel project settings — never commit real values.

Typecheck (must pass with zero errors before pushing):

```bash
NODE_OPTIONS=--max-old-space-size=6144 ./node_modules/.bin/tsc --noEmit --incremental false
```

## Repository map

```
src/app/
  (portals)/     Admin platform (staff), customer, seller, vet/telemed portals
  (adportal)/    Ad Center — self-service advertiser surface at /ads
  (cms)/         Payload CMS integration (admin UI at /cms-admin, API under /api/payload)
  (affiliate)/   Affiliate dashboard
  (auth)/        Sign-in and access routes
  shop/          Catalog browsing — static taxonomy tree is the routing source
  product/       Product pages
  cart, checkout, account, help, contact, track-order …   Storefront
  api/           Every API route. The route file is the contract.
src/components/  UI components, grouped by module (admin, ads, crm, contacts, …)
src/lib/         Business logic, data access, integrations, platform primitives
supabase/
  migrations/    The schema history. Never edit or delete an applied migration.
  functions/     Supabase edge functions (ad-events)
public/          Static assets
```

## Data

- The schema lives in Postgres. `supabase/migrations/` is the incremental
  history; apply new changes as new migration files.
- Database functions (RPCs) are part of the data contract. Application code
  does not name every table it depends on — reporting and billing functions
  read tables directly inside the database (the `acct_*` accounting spine,
  the operational billing path). Check function bodies, views, triggers, and
  foreign keys before concluding any table is unused.
- The accounting module is a double-entry system on the `acct_*` tables
  (chart of accounts, journal entries/lines, AR/AP). Reports
  (trial balance, P&L, balance sheet, general ledger) are RPC functions over
  those tables.
- The supplier catalog (`supplier_*`, `product_*`) is the bulk of the rows.
  It is raw material: storefront products publish only with a design applied.

## Suppliers

Suppliers integrate through one contract (catalog sync, pricing, order
dispatch). Adding a supplier means implementing that contract and entering
its key on the Connections & Keys page — no code changes elsewhere.

- Printful — imported and priced (working set)
- Printify — imported and priced (working set)
- Cloudprinter — API mapped; import not yet run
- Gelato, Prodigi, Gooten, Teemill, SpreadConnect — credentialed, not in the
  working set

Order dispatch is a ready-to-send queue: orders release to the supplier per
order, after review.

## Conventions — read before changing anything

1. **HTML mockups are the spec.** Design work arrives as HTML files. Convert
   them flat into the codebase: the mocked components, layout, and copy land
   as-is and get wired to data underneath. Do not redesign, rearrange, or
   delete a mocked component. If a component cannot work as mocked, stop and
   raise it with the owner.
2. **Pages exist because they were specified.** Never delete, redirect, or
   fold a page for convenience. A page that is not wired yet stays and is
   reported as unwired.
3. **Real routes.** Every view is its own route with a clean URL. No
   `?view=` or hash-based view switching.
4. **Real data only.** No mocked, seeded-demo, or placeholder content on
   production surfaces.
5. **White page backgrounds.** Cards may carry borders and shadows; page
   canvases are white.
6. **Readable text.** Control labels are never faded: white text on colored
   buttons, black on white. Inactive state is shown by weight, underline, or
   background — never by light-gray text.
7. **One bar per workspace.** Navigation lives in the sidebar; a bar inside
   a page only switches views of that same page. A sidebar shows only the
   picked module's children.
8. **Ship to main.** Finished work is pushed to `main` the day it is done.
   Branches are a workbench, not storage.
9. **Commit messages: short and factual.** State what changed. Nothing else.
   Example: `Repo cleanup`, `Add README`, `Fix shop toolbar overflow`.
10. **Done means the journey works.** A feature is done when a user can
    complete the task end to end on production — not when code compiles or
    a deployment shows READY. Verify on the live site after deploying.

## Environment variables

Names only — values live in Vercel project settings and the owner's vault.

Core: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_SUPABASE_PROJECT_URL`, `SUPABASE_TENANT_ID`, `DATABASE_URL`,
`DIRECT_URL`, `PAYLOAD_SECRET`, `NEXT_PUBLIC_SITE_URL`, `SITE_URL`,
`CRON_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY`, `TOKEN_ENCRYPTION_KEY`

Payments & commerce: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
`STRIPE_WEBHOOK_SECRET`

Email & comms: `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `SUPPORT_INBOUND_DOMAIN`

Search: `ALGOLIA_APP_ID`, `ALGOLIA_ADMIN_API_KEY`, `ALGOLIA_SEARCH_API_KEY`,
`ALGOLIA_WRITE_API_KEY`, `ALGOLIA_PRODUCTS_INDEX`

Suppliers: `PRINTFUL_API_KEY`, `PRINTFUL_STORE_ID`, `PRINTFUL_BASE_URL`,
plus one `*_API_KEY` per additional supplier (Gelato, Prodigi, Teemill,
Gooten, SpreadConnect, Cloudprinter, Printify)

Carriers: `FEDEX_CLIENT_ID/SECRET`, `UPS_CLIENT_ID/SECRET`,
`USPS_CONSUMER_KEY/SECRET`, `SHIPPO_API_KEY`

## Handover checklist for the owner

1. Enter live Stripe keys (Connections & Keys / Vercel env).
2. Verify the sending domain in Resend, then set `RESEND_FROM_EMAIL`.
3. Point the custom domain at the Vercel project.
4. Confirm the Printify fulfillment-approval setting in the Printify
   dashboard (it is a dashboard toggle, not an API setting).
5. Create the Payload CMS admin account at `/cms-admin` with an owner email.
