# Unsaid: intended functionality of every component

Based on your outline. Finance is specified in full; the other domains are specified at the component level so nothing is left undefined.

**Container key:** `[L]` list page · `[D]` full-screen document · `[R]` right drawer · `[M]` modal · `[W]` workspace or wizard · `[O]` overview page · `[P]` panel inside a page

**Data column:** table names are from your schema files. "check" means I could not confirm the table or column and you should confirm before building.

---

## 0. Fixes to your outline (do these first)

| Issue | Fix |
|---|---|
| Under **Contractors** you list 1099s, Receipts, Purchase orders, Payroll as if they were children. | They are siblings. Contractors has two children (invite, and 1099s). Receipts, Purchase orders, and Payroll become their own items in Expenses & Bills. |
| Under **Payment Links** you list Sales Channels, Payouts, Products & Services, Gift cards, Subscriptions, Estimates, Statements, Refunds, Disputes. | Same: these are siblings of Payment Links under Sales, not children. |
| **Receipts** appears under Accounting and again under Expenses & Bills. | One page (Receipts inbox) with two entry points. Accounting shows it as the bank-feed companion; Expenses & Bills shows it as the capture queue. |
| **Appointments** under CRM Tools. | This is a grooming-era leftover (`crm_appointment_services`, `crm_waitlist`). Remove it. |
| **Entities** under Accounting. | Keep, but this is the same thing as your Brands setting (`acct_entities`). One concept, two views. Do not build twice. |
| **Lines of Credit, Credit Cards, Loans.** | No dedicated tables exist. Define them as one "Liabilities and credit" page (see 2.9). |
| **Cap Table.** | No tables exist at all. It is a new domain (see section 6). |
| **Products & Services** has the rule "must load department / sub-department / service type / SKU line first." | This is a gate: product creation is blocked until the taxonomy is seeded. Specified in 4.8. |

---

## 1. Dashboard

| Component | Intended functionality | Data and rules | Container |
|---|---|---|---|
| **GMV** | Gross merchandise value for a period, split by channel, with change versus last period. Drill-down opens the orders behind the number. | Orders (the `orders` table, 22 real rows today). Excludes cancelled and fully refunded orders. | `[P]` |
| **Orders** | Counts by state: unfulfilled, in production, shipped, late. Late lines link straight to Dispatch exceptions. | Orders and fulfillment state. SLA breach is computed, not typed. | `[P]` |
| **Products** | Live products, products with no renders, products with no supplier offer, top sellers. | Products plus render and offer state (see POD builder). | `[P]` |
| **Support** | Open tickets, oldest waiting, SLA at risk, community posts waiting for approval. | Support tables plus the moderation queue. | `[P]` |
| **Analytics** | Revenue trend, conversion by channel, average order value. Links to the full analytics pages. | Read-only. | `[P]` |

---

## 2. Finance: Accounting

### 2.1 Overview `[O]`
Business-at-a-glance for the books: cash on hand, money owed to you, money you owe, profit this month, items waiting for review (bank transactions, receipts, bills), and a setup checklist until the books are connected. Everything on it is a link to the queue that clears it.

### 2.2 Bank transactions `[L]`
- **Purpose:** the feed of money in and out of connected accounts, waiting to be matched.
- **Tabs:** For review · Categorized · Excluded.
- **Per row:** date, description, amount, suggested match (invoice, bill, expense, transfer), suggested category, and a one-click Accept.
- **Automation:** rules (2.7) categorize first. Then matching: amount and date proximity to open invoices and bills. Anything left goes to For review.
- **Actions:** Accept, Edit match, Add as expense, Split, Mark as transfer, Exclude. Bulk accept shows a count first ("This will categorize 38 transactions").
- **Data:** `acct_bank_accounts`, `acct_bank_transactions`, `acct_bank_statements`.
- **Rule:** a reconciled transaction is locked. Editing it requires reopening the reconciliation.

### 2.3 Receipts `[L]`
- **Purpose:** the capture inbox for receipts and bill images.
- **Tabs:** For review · Reviewed.
- **Entry:** drag and drop, upload, take a photo, or email to the workspace's forwarding address (shown on the page).
- **Automation:** extraction reads vendor, date, total, tax. A match is proposed against a bank transaction. Accepting creates a draft expense or bill with the file attached.
- **Data:** `acct_receipt_extractions`, `acct_attachments` (Part A adds the source and the created-bill link).
- **Rule:** the same file uploaded twice is flagged as a duplicate, not created twice.

### 2.4 Reconcile `[W]`
- **Setup step:** choose account, statement ending balance, statement ending date. Optional: service charge (date, amount, expense account) and interest earned (date, amount, income account). Both post as journal entries when you finish.
- **Workspace:** two columns (money out, money in) with checkboxes. A running "difference" must reach zero before Finish is enabled.
- **After finishing:** a report is saved; the reconciled transactions are locked.
- **Links:** Register, Summary, History by account.
- **Data:** `acct_reconciliations`, `acct_reconciliation_items`.

### 2.5 Chart of accounts / accounts wizard `[L]` + `[R]` + `[W]`
- **List:** Number, Name, Type, Detail type, Description, Balance. Grouped by type, sorted by number. Row click opens the account register.
- **New account `[R]`:** type, detail type (depends on type), name, number, sub-account of, description, opening balance and date, tax line, active.
- **Cleanup:** a session mode that flags unused, duplicate, and misclassified accounts, and lets you merge or archive them. Every change is logged and reversible.
- **Edit mode:** spreadsheet-style editing of many rows. Changes apply together on Save.
- **Run report:** opens the Account List report filtered to what you see.
- **Accounts wizard `[W]`:** first-time seeding only. Asks business type, then creates the starter set, including the commerce accounts (sales by category, COGS by supplier, shipping, processor fees, refunds, discounts, gift card liability, sales tax payable, processor clearing, marketplace payable).
- **Rules:** an account with posted activity cannot be deleted, only archived. Changing type on an account with activity requires a reclassification entry.
- **Data:** `acct_chart_of_accounts`, `acct_book_account_mappings`.

### 2.6 Cash flow `[O]`
Money in, money out, and projected balance for the next 30, 60, and 90 days, built from open invoices, open bills, recurring templates, and scheduled payments. Lets you toggle "what if this invoice pays late". Read-only.

### 2.7 Rules `[L]` + `[R]`
- **Purpose:** automate bank transaction categorization.
- **Rule drawer:** name, applies to (money in, money out, or both), which bank accounts, conditions (description contains, amount over, from or to), actions (category, payee, tags, auto-add or suggest only), priority.
- **Behavior:** first matching rule wins. Each rule shows how many transactions it handled. A rule can be tested against recent transactions before it is saved.
- **Data:** a bank rules table (Part A adds `acct_bank_rules`; check it was applied).

### 2.8 Entities `[L]`
Each legal business under the workspace. Per entity: books, base currency, fiscal year, members. Supports intercompany transfers and a consolidated view. This is the accounting side of Brands in Settings.
**Data:** `acct_entities`, `acct_intercompany_partners`, `acct_consolidation_groups`.
**Rule:** moving money between entities needs two approvers (set in Approvals and limits).

### 2.9 Liabilities and credit (Lines of credit, Credit cards, Loans) `[L]` + `[R]`
- **Credit cards:** connected like bank accounts; transactions appear in Bank transactions; payments are transfers.
- **Lines of credit:** limit, balance, available, interest rate; draws and repayments are transfers.
- **Loans:** principal, rate, term, payment day; an amortization schedule splits each payment into principal and interest and posts both.
- **Data:** check whether `acct_bank_accounts` has a type that covers credit card and loan. The amortization schedule has no table today.

### 2.10 Quick view `[P]`
Shortcuts to five reports: Profit and loss, Balance sheet, Account list, Funnel, Retained earnings. Each opens the full report with the customize panel (filters, columns, number format) and Save view.
**Rule:** reports read only posted entries unless "include drafts" is on.

---

## 3. Finance: Expenses and bills

### 3.1 Overview `[O]`
- **Create actions row:** Upload multiple bills, Create bill, Schedule online payment, Pay bills, Record an expense. Customizable (pick up to 10).
- **Automate bills funnel:** Upload and auto-create → For review → Approval set up → Payment approval set up → Paid. Each stage shows count and total, and is a link.
- **Spend over time** and **Spend insights:** spend by category and vendor, with period compare.

### 3.2 Expense transactions `[L]`
One list of every money-out record: bills, expenses, checks, vendor credits, credit card credits. Filters by type, date, vendor, category, status.
**Header buttons:** Purchase notifications (settings for purchase alerts), Print checks, and **New transaction ▾** (Bill, Expense, Check, Vendor credit, Credit card credit).
**Bulk:** categorize, attach, delete (drafts only).

### 3.3 Vendors `[L]` + `[R]`
- **Empty state:** Import vendors and Add vendor.
- **Vendor drawer sections:** Names and contact · Address (street, city, state, ZIP) · Notes and attachments · Bill Pay ACH (account number, routing number, masked after save) · Additional information (tax ID, 1099 toggle, terms, default expense account).
- **Vendor record:** open bills, paid year to date, 1099 status, documents (W-9), activity.
- **Rules:** duplicate check on name and tax ID at save. ACH details are write-only after entry and every view of them is logged.
- **Data:** `acct_vendors` (has 1099 and W-9 fields).

### 3.4 Bills `[L]`
- **Tabs:** For review · Unpaid · Paid.
- **Search:** by vendor, by bill date.
- **Columns:** Vendor, Bill number, Due date, Bill amount, Open balance, Status, Action.
- **Header:** Pay bills, Customize, Make full page.
- **Status values** (from `acct_document_status`): draft, pending approval, approved, posted, partially paid, paid, void.

### 3.5 Add bill `[D]`
- **Left panel:** Autofill bills. Upload or Take a photo; multiple files create multiple drafts.
- **Header fields:** vendor, mailing address, terms, bill date, due date, bill number. Balance due shows top right.
- **Lines:** category or item (toggle), product description, amount. Row actions: Add lines, Clear lines, Copy line, Tag lines, Delete line.
- **Footer:** memo, attachments, Make recurring, Print, Save bill, Save and schedule payment (menu: Save and new, Save and close).
- **Automation:** vendor selected → terms, due date, and default category fill in. A file dropped in the panel fills everything it can read.
- **Rules:** duplicate bill number for the same vendor warns. Bills over the approval limit go to approval instead of posting.
- **Posting:** debit expense, inventory, or COGS per line; credit accounts payable.
- **Data:** `acct_ap_bills`, `acct_ap_bill_lines`, `acct_ap_approvals`, `acct_workflows`.

### 3.6 Pay bills (Bill payment table) `[W]`
- **Top:** payment account, payment date, starting check number, total payment (always visible).
- **Table:** Payee, Reference number, Due date, Status, Bill approval, Open balance, Credits, Payment, Total amount, Action.
- **Behavior:** tick bills, set the payment amount per bill (partial allowed), apply available vendor credits, pay by ACH, check, or card. Bills not yet approved cannot be ticked.
- **Posting:** debit accounts payable, credit the payment account. A payment can cover many bills.
- **Data:** `acct_ap_payments`, `acct_ap_payment_applications`.

### 3.7 Bill and payment approval setup `[M]`
Rules for who approves bills and payments, by amount and by vendor. Supports one or two approvers, delegation while away, and "the person who entered it cannot approve it." Links to Approvals and limits in Settings.

### 3.8 Contractors `[L]` + `[M]`
- **Invite modal:** name, email, checkbox "email this contractor to complete their profile and tax information." The contractor receives a link, completes the form and W-9, and is added as a vendor marked 1099.
- **List:** name, invite status, W-9 received, paid this year, 1099 threshold met.
- **Pay and file 1099s:** see 3.9.
- **Data:** `acct_vendors`, `acct_tax_filings`. An invite table is added by Part A (`acct_contractor_invites`).

### 3.9 1099s `[L]`
Contractors above the threshold for the tax year, with W-9 status. Generate forms, review, e-file or download. Blocks generation if the tax ID is missing.

### 3.10 Receipts (upload) `[L]`
Same page as 2.3.

### 3.11 Purchase orders `[L]` + `[D]`
Orders to blank and supplier vendors. Lines: blank or SKU, supplier SKU, size and color, quantity, unit cost. Statuses: draft, pending approval, approved, sent, partly received, received, closed. Receiving a PO updates inventory and can convert to a bill.
**Data:** `acct_ap_purchase_orders` and its lines. (`purchase_orders` and `erp_purchase_orders` are twins; pick one before building.)

### 3.12 Payroll `[L]`
Pay periods, runs, employees, deductions, tax forms. Run states: draft → approved → paid → posted. Posting creates the wage, tax, and liability entries.
**Data:** `acct_payroll_*` (plus `payroll_*` twins; pick one).

---

## 4. Finance: Sales

### 4.1 Overview `[O]`
- **Create actions:** Get paid online, Create invoice, Create payment link, Create recurring payment, Record payment, Create sales receipt.
- **Sales funnel:** Create new payment request · Not paid · Paid · Deposited, with a Date / Month / Year selector.
- **Income over time:** duration selector, group by month, compare to previous year.

### 4.2 Revenue transactions `[L]`
Every sale and payment received, fed by the Stripe webhook and storefront orders. Columns: Date, Source, Customer, Gross, Fees, Net, Status, Deposit.
**Rule:** webhook events are idempotent; the same event never creates two rows.

### 4.3 Invoices `[L]` + `[D]`
- **List:** Invoice number, Customer, Date, Due, Amount, Balance due, Status. Bulk: send, remind, print, mark paid.
- **Editor tabs:** Edit · Email view · Payor view · PDF view.
- **Edit fields:** customer, invoice number, terms, invoice date, due date; lines (product or service, description, quantity, rate, amount; Copy); customer payment options; note to customer; memo on statement (hidden from the customer); attachments; totals with Charge a deposit and Edit totals.
- **Payor view right rail:** Payment options (accepted methods, payment details) · More options (invoice total, deposit, discount, shipping fee, late fees) · Design · Scheduling.
- **Footer:** Print or download, Save, Review and send.
- **Posting:** debit accounts receivable; credit revenue per line's income account; credit sales tax payable.
- **Rule:** a sent invoice cannot be edited, only corrected with a credit memo or voided.
- **Data:** `acct_ar_invoices`, `acct_ar_invoice_lines`, `acct_ar_receipts`.

### 4.4 Payment links `[L]` + `[M]`
Amount, description, optional customer, expiry, single or multi use. Produces a link and QR code. Each payment creates a receipt and matches an invoice if one is named. (`checkouts` table has statuses active, paid, expired, void.)

### 4.5 Sales channels `[L]`
Storefront, TikTok, Etsy, Amazon, and other connected channels. Per channel: sync status, fees mapping, payout account, orders imported. Orders from any channel land in the same orders table.

### 4.6 Payouts `[L]`
Processor payouts (Stripe and others). Each shows gross, fees, refunds, net, and the sales it covers. Matching a payout to a bank deposit closes the clearing balance. **Data:** `acct_payouts`, `acct_gateway_clearing_entries`.

### 4.7 Gift cards `[L]`
Issue, balance, redemption history. Sale posts to gift card liability; redemption moves liability to revenue. Unredeemed balances feed the liability report. **Data:** `acct_gift_cards`, `acct_gift_card_transactions` (and `commerce_gift_*` twins).

### 4.8 Products and services `[L]` + `[R]`
- **Gate:** before the first product, the taxonomy must exist: department, sub-department, service type, SKU line. If it does not, the page shows a setup step instead of the form.
- **Drawer sections:** Basic info (name, item type, SKU, category with the chart-of-accounts picker and "add new account", image) · Sales (description, price, income account) · Purchasing (purchase from a supplier: description, cost, preferred supplier, expense or COGS account).
- **Footer:** Save and new · Save and close.
- **Rule:** a product cannot be published without an income account and, for physical products, a COGS account.
- **Data:** `products` (the canonical table), plus the account columns added by Part E.

### 4.9 Subscriptions `[L]`
Plans, subscribers, billing cycle, next charge, failed payments. Each cycle creates an invoice and a payment. **Data:** `commerce_subscription_*` or `subscriptions` (pick one).

### 4.10 Estimates `[L]` + `[D]`
Quote with lines like an invoice; statuses draft, sent, accepted, rejected, expired, invoiced. Accepting converts to an invoice in one click. **Data:** `acct_estimates`, `acct_estimate_lines`.

### 4.11 Statements `[L]` + `[W]`
Customer statement of open items for a date range; batch generate and email. **Data:** `acct_customer_statements`.

### 4.12 Refunds `[L]` + `[M]`
Refund against an order or invoice, full or partial, with a reason and restock choice. Over the limit → needs approval. Posts to refunds and returns, and reverses tax. **Data:** `acct_refunds`, `acct_refund_policies`.

### 4.13 Disputes `[L]`
Chargebacks from the processor: amount, reason, evidence due date, status. Evidence packet is built from the order, tracking, and messages. **Data:** `acct_disputes` (and `commerce_disputes`).

---

## 5. Business tax

| Component | Intended functionality | Data and rules | Container |
|---|---|---|---|
| **Business tax at a glance** | Estimated taxable profit, upcoming filing deadlines, and a task list ("map your accounts to tax categories"). | `acct_tax_filings`, deadlines per entity type chosen in setup. | `[O]` |
| **Create tax return** | Starts a return from the year's books; blocks if accounts are unmapped or periods are open. | Checks close status first. | `[W]` |
| **Download tax summary** | PDF of income, deductions, and assets for the accountant. | Read-only. | `[M]` |
| **Tax summary** | Taxable profit estimate, taxable income, deductible expenses, and "what you could be taxed on". | Built from tax line mappings on accounts. | `[P]` |
| **Income from your transactions** | Income grouped by tax category, with an empty state that explains how adding transactions automates it. | Same. | `[P]` |
| **Depreciable business assets** | Assets with cost, class, depreciation to date. | `acct_fixed_assets`, `acct_asset_*`. | `[L]` |
| **1099-K detail** | Seller payment totals that cross the reporting threshold. | `seller_1099k_generations`. | `[L]` |
| **Payroll tax** | Quarterly liabilities and forms. | `acct_payroll_tax_forms`. | `[L]` |
| **Year-end tax filing** | Checklist and e-file. Shows "not available" until the entity type supports it. | Feature flag. | `[W]` |

---

## 6. Cap table (new domain; no tables exist today)

| Component | Intended functionality |
|---|---|
| **Overview** | Fully diluted ownership by holder and class, latest valuation, option pool available, upcoming vesting and expirations. |
| **Stakeholders** | Founders, employees, investors, advisors. Each holds shares, options, or convertibles, with contact and tax details. |
| **Funding rounds** | Round name, date, pre-money, amount raised, price per share, investors, new shares issued. |
| **Option pool** | Authorized, granted, exercised, cancelled, available. Grants have vesting schedules (cliff and monthly). |
| **SAFEs and convertibles** | Amount, cap, discount, most-favored-nation. Shows what each converts into at a given round. |
| **Dilution modeler** | Enter a hypothetical round; see ownership before and after, per holder. Scenarios can be saved. |
| **Liquidation waterfall** | Enter an exit value; see who gets what given preferences and participation. |
| **409A and valuations** | History of valuations; the current one sets option strike prices. Warns when it expires. |
| **Equity events** | Grants, exercises, transfers, repurchases. Each event updates the table and can post to equity accounts. |
| **Controls** | Who can view or edit. Board Member role: read-only summary. Accountant: totals only. Changes need a second admin. |
| **Documents** | Grant agreements and SAFEs with signing status. |

**Wave 0 note:** this has no canonical home, so new tables are justified (use one prefix, for example `cap_`). Do it after Finance, not alongside it.

---

## 7. The other domains

### Contacts
| Component | Intended functionality |
|---|---|
| **CRM overview** | Customers by lifecycle, new this month, at-risk, follow-ups due. |
| **Parties: Customers / Vendors / Suppliers** | One list with role tabs and role-filtered entry points. One Party drawer with role chips. Duplicates flagged on email and name. |
| **Seller relationships** | Seller list, seller detail (performance, payouts, policy status), seller feed (activity), onboarding queue (steps waiting on you). |
| **Leads** | Capture, route, and convert to customer. |
| **Segments** | Saved rules (for example "bought twice, no order in 90 days"). Used by marketing and promotions. |
| **Templates** | Reusable messages. |

### Catalog
| Component | Intended functionality |
|---|---|
| **Overview** | Counts by state: needs assets, render-ready, designed not published, live. |
| **Konva studio / New design / Collection / Published** | See the POD builder: design on the blank's measured stage, collections as rules over the catalog, published shows renders and where each design is used. |
| **Published items and SKUs, Bundles, Review, Categories, Products, Listings, Catalog items** | Products is the canonical table. Listings are per-channel versions. Review is the moderation and quality queue. Remove the duplicate "Catalog review" and "Catalog items" entries or define how each differs. |
| **Blanks** | The canonical physical blank with print areas, views, colors, supplier offers. |
| **Suppliers / vendors / sellers** | Role views of Parties. |
| **Channels: Ecommerce, TikTok, Amazon, Facebook Marketplace, WhatNot, Etsy, eBay, Website / CMS** | Per channel: connection, which products are listed, price and inventory sync, errors. Failed syncs go to the Exceptions inbox. |

### Orders
| Component | Intended functionality |
|---|---|
| **Overview** | Orders by state and SLA, today's dispatch count. |
| **Orders / Order detail / Packing slip** | List, full record with timeline, printable slip. Per-line actions: dispatch, refund, return, reroute. |
| **Order issues** | The exceptions inbox for orders: manual push, needs attention. |
| **Purchase orders / Fulfillment / Inventory / Fulfillment queue / Batch slips and labels** | Dispatch queue and supplier routing as in the POD builder. Inventory by location with reorder points. |
| **Returns and claims** | Return requests, inspection, disposition (restock, scrap, return to vendor), refund link. |

### Marketing
| Component | Intended functionality |
|---|---|
| **Overview** | Channel performance, campaigns running, posts scheduled, UGC awaiting approval. |
| **Banners and popups** | Storefront slots with window, audience, and CTA. |
| **CMS pages and editorial / Content blocks** | Page and block editing with preview and publish. |
| **Social studio** | Calendar, channels, create, library (including approved customer posts with reuse rights), performance, queue. |
| **Promotions** | Discount codes and rules with limits, stacking, and a target picker. |
| **Newsletter / Automation** | Campaigns and trigger-based journeys. Automation is currently a dead view; wire it or cut it. |

### Support
| Component | Intended functionality |
|---|---|
| **Overview** | Queue health, SLA at risk, oldest waiting. |
| **Tickets / Omnichannel inbox** | Every channel in one thread per customer; assign, reply, escalate. |
| **Queues / SLA rules / Automations** | Routing by topic and priority, response targets, auto-actions. |
| **Trust and safety: Knowledge base, Help center, Docs, Policies** | Content customers and staff rely on. Moderation of community posts and reports sits here, using the Exceptions inbox pattern. |

### Pinned
| Component | Intended functionality |
|---|---|
| **Tasks / calendar** | Personal and assigned tasks with due dates; items can attach to any record. |
| **Favorites / bookmarks** | Pages and records the user pins. |
| **Inbox / notifications** | Approvals waiting, mentions, system alerts. Approvals can be actioned from here. |
| **Reports** | Saved and scheduled reports. |

---

## 8. Rules that apply to every component

1. **Every money document posts to the ledger** through one rule: draft documents do not post; approved or sent documents do; voiding posts a reversal. No component writes balances directly.
2. **Status words are shared:** draft, pending approval, approved, posted, partly paid, paid, void. The same labels and colors everywhere.
3. **Closed periods are locked.** Editing anything dated in a closed period is blocked, with a link to reopen (needs permission).
4. **Entity scoping:** every record belongs to an entity (brand). Lists filter by the brand switcher.
5. **Attachments** use one shared table and one drop zone.
6. **Audit:** create, edit, void, approve, export, and view-of-sensitive-field are all logged.
7. **Permissions:** each action maps to one permission in the Roles screens. If an action has no permission, it cannot ship.
8. **Duplicates:** one canonical table per noun. Before building a component, name its table; if two exist, choose first.
9. **Empty states** offer Import and Add, with a short explanation.
10. **Bulk actions** always show the count before running.
11. **Numbering:** invoices, bills, POs, and checks use gap-free sequences per entity.

---

## 9. Decisions needed from you

1. Canonical tables: invoices, bills, purchase orders, journals, reconciliations, receipts (the `acct_` family is my recommendation).
2. Liabilities and credit: confirm whether `acct_bank_accounts` can represent cards and loans.
3. Cap table: build now or after Finance.
4. Which of the twin product, subscription, gift card, and payroll tables stays.
