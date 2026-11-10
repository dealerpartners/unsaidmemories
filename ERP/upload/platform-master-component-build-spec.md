# Unified Platform: Master Spec

Contents: **Part A** Component Map (what and why) · **Part B** Build Spec (components, interactions, API, 14-day plan) · **Part C** Settings Spec (schema-grounded). Types live in `contracts.ts`.

---

# PART A

# Unified Platform — Component Map & System Logic

Commerce + Design + Accounting, one connected system. This doc defines, for every module: the primary entity, which surface opens for each action (drawer / modal / page / workspace / studio), table columns and sorts, right-click menus, pills, and what rides along from other modules.

---

## PART 1 — System Logic (the rules every module obeys)

### 1.1 The five shared entities

Everything in the Create Actions list collapses into five entity families. This is what makes the platform feel integrated: modules are *views* over shared entities, not separate databases.

| Entity | What it is | Roles / Types | Used by |
|---|---|---|---|
| **Party** | One person/company record | Customer, Vendor, Supplier, Contractor, Seller, Lead (a party can hold many roles) | Sales, Expenses, CRM, Orders, Support, Tax (1099), Marketplace |
| **Item** | Anything sellable/buyable | Product, Service, Blank, Bundle, Design-linked product, Gift card, Subscription | Catalog, Studio, Invoices, Bills, PO, Orders, Inventory, Channels |
| **Document** | Any multi-line transaction | Invoice, Estimate, Sales order, Sales receipt, Credit memo, Bill, Expense, Check, PO, Vendor credit, RMA, Journal entry | Sales, Expenses, Orders, Purchasing, Returns, Accounting |
| **Money movement** | Cash actually moving | Payment, Payment link, Deposit, Transfer, Settlement/Payout, Refund | Sales, Bills, Banking, Reconcile, Stripe/Shopify |
| **Account** | Ledger node | Chart of Accounts, Bank, Credit card, Loan, Line of credit | Accounting, every Document line, Reconcile, Tax, Reports |

**Rule:** "Add vendor" and "Add supplier" and "Add customer" are the **same drawer** (Party drawer) with a different default role pill. Same for "Add contractor" (role = Contractor, plus W-9 invite section). Never build four forms.

**Rule:** Every Document is rendered by **one Document Engine** (header → lines → totals → attachments/memo → status → activity). Invoice, Bill, PO, Sales order, Estimate, Credit memo, Vendor credit differ only by *config* (party role, line columns, status machine, posting rules). Build once.

### 1.2 Surface rules — which container for which job

| Surface | Use when | Examples | Escape hatch |
|---|---|---|---|
| **Pill / popover (peek)** | Read-only glance, zero commitment | Hover a customer pill → balance, last order, open tickets | Click → open drawer; ⌘-click → new tab |
| **Modal** | Single decision, ≤5 fields, result is immediate | Record payment, Void, Refund, Mark shipped, Adjust stock, Transfer, Send, Remind, Approve/Decline return, Archive | None (small by design) |
| **Drawer (right, 480px; 720px wide mode)** | Create/edit a *record* while staying on the list | Party, Product, Account, Category, Task, Note, Ticket, Banner, Popup, Discount code, Collection | **Make full page** (already in your Bills create menu) |
| **Document page (full)** | Multi-line transactions | Invoice, Bill, PO, Sales order, Estimate, Credit memo, Journal entry | Print/PDF/Email views as tabs inside the page |
| **Workspace** | Many records, one batch outcome | Pay bills, Receive payment, Reconcile, Batch slips & labels, Cycle count, Upload multiple bills | Saves as draft batch |
| **Studio** | Visual canvas | Design, Collection canvas, Product mockup | "Back to record" returns to originating drawer |
| **Command palette (⌘K)** | Jump or create anywhere | "New invoice for Acme", "Bill from Printful" | Same Create menu, searchable |

**Escalation ladder:** Peek → Modal → Drawer → Full page. A user can always promote upward without losing input (drawer → full page keeps state).

### 1.3 The Context Envelope (this is the integration engine)

Every surface carries an invisible envelope. Creating something from inside a record **prefills from that record**; creating from the global Create menu inherits only the **active tab's** envelope.

```
envelope = {
  origin_module, origin_record_id, origin_tab_id,
  party_id, order_id, item_id, design_id, account_id,
  channel_id, currency, date_range, return_to
}
```

Examples:
- On **Order #1042** → Create → Invoice: party, lines, channel, and `order_id` are prefilled and linked.
- On **Vendor: Printful** → Create → Bill: vendor, terms, default expense category prefilled; open POs from that vendor show as a "Match PO" suggestion.
- On a **Design** in Studio → Create → Product: design attached, blank picker opens, margins pre-calculated from supplier cost.
- On **Bank transaction** (Reconcile) → Create → Expense: amount, date, paid-from prefilled; "Match" and "Create" are siblings.

`return_to` means closing any drawer/modal/page returns to the exact scroll position and tab it came from.

### 1.4 Universal components (build once, use everywhere)

| Component | Behavior | Appears in |
|---|---|---|
| **Party picker** | Typeahead, role-filtered, `+ Add new` opens Party drawer inline, shows balance pill | Every Document, Task, Ticket, Campaign target |
| **Item picker** | Search by name/SKU/barcode, shows price, cost, stock pill; `+ Add product/service` opens Item drawer | Invoice/Bill/PO/Order lines, Bundles, Discounts |
| **Account picker** | Typeahead with account type grouping; `+ Add account` opens CoA drawer | Expense, Bill lines, Journal, Transfer, Rules |
| **Capture panel** | Upload / take photo / paste email → OCR → autofill | Bill, Expense, Receipts, Contractor docs |
| **Tag toggle** | Tags on header and per line (Tag Lines) | Bills, Invoices, Orders, Expenses, Reports filter |
| **Attachment strip** | Drag/drop, preview, "Download attachment" | All Documents, Parties, Tickets, Returns |
| **Activity timeline** | Every status change, email, payment, comment, with actor | Right rail on every record |
| **Related rail** | Linked records as pills (see 1.6) | Right rail on every record |
| **Status pill** | State machine badge, clickable to next legal state | Every list row and header |
| **Money field** | Currency-aware, tax-aware | Everywhere |
| **Date range picker** | Presets + compare previous period | Every list and report |

### 1.5 Table standard (every list view)

**Anatomy:** `[select] [primary identifier] [party pill] [status pill] … [amount] [date] [⋯ row actions]`

| Rule | Standard |
|---|---|
| Toolbar | Search · Filters (saved views) · Date range · Columns · **Import** (where the entity supports it) · **Export** · **primary Create button** |
| Tabs-as-filters | Status tabs with counts: e.g., Bills → *For review · Unpaid · Paid* |
| Default sort | Newest by primary date; overdue/attention items pinned top when applicable |
| Sortable | Every column except Actions |
| Column picker | Per-user, saved per view |
| Row click | Opens **drawer** for records, **page** for documents |
| Right-click | Same menu as `⋯` (see 1.7) |
| Bulk bar | Appears on select: Send, Print, Tag, Archive, Export, + module-specific |
| Totals footer | Sum of visible amounts / open balance |
| Empty state | One sentence + primary action + import option |

### 1.6 Pill vocabulary

| Pill type | Meaning | Click | Right-click |
|---|---|---|---|
| **Status** | Draft, Sent, Unpaid, Overdue, Paid, Deposited, For review, Approved, Shipped, Delivered, Returned | Peek next actions | Change status |
| **Relation** | Linked record: `Order #1042`, `Inv #88`, `PO #12`, `Design: Tee v3`, `Ticket #301` | Peek popover | Open / Open in new tab / Unlink |
| **Party** | Customer/vendor with role color + balance | Peek popover → Open profile | Email / Create → … |
| **Channel** | Etsy, TikTok, Amazon, Shopify, Website | Filter by channel | Open channel settings |
| **Alert** | Needs attention, Manual push, Stock low, SLA at risk, Unreconciled, Missing W-9 | Opens the fix surface (modal/drawer) | Dismiss / Snooze |
| **Tag** | User-defined | Filter by tag | Edit tags |

**Cross-module rule:** a pill on one module's screen should always be the *door* to the related module. Overdue invoice shows a **Customer pill** and a **Ticket pill** if a ticket is open; the order row shows an **Invoice pill** and a **Shipment pill**.

### 1.7 Right-click grammar (same order everywhere)

```
1. Open / View / Open in new tab
2. Edit · Duplicate
3. CREATE FROM THIS ▸ (cross-module — the integration menu)
4. COMMUNICATE ▸ Email · Send · Remind · Add note · Open ticket
5. MONEY ▸ Record payment · Refund · Mark paid · Pay
6. PRINT / EXPORT ▸ Print · PDF · Download attachment
7. ORGANIZE ▸ Tag · Add to… · Favorite · Pin
——————————
8. Archive · Void · Delete   (danger, always last, always confirm)
```

Only sections relevant to the record type show. The "Create from this" section is what makes your platform different from QuickBooks.

### 1.8 Visibility & permissions

| Layer | Controls |
|---|---|
| **Role** (Settings → Roles & permissions) | Module visible / hidden, view vs edit vs approve |
| **Approvals & limits** | Bill approval, payment approval thresholds → surfaces "Approve to Unpaid" and "Setup Payment approval" |
| **Field-level** | Cost, margin, bank account numbers (Bill Pay ACH routing/account) masked unless permitted |
| **Pill visibility** | Relation pills hidden if user lacks access to the target module (shows count only) |
| **Create menu** | Actions are filtered by permission; the menu never shows what the user can't finish |

---

### 1.9 Scoped Workspaces → Global Hubs (the Push pattern)

Catalog, Contacts/CRM, Support and Marketing each exist **twice on purpose**: once as a **scoped view** inside the area where the work happens, and once as the **global hub** that is the system of record. This is how a user never has to leave what they're doing to get or create what they need.

| Scoped view (where you work) | Lives in | Global hub (system of record) | Push action | Pull action |
|---|---|---|---|---|
| **My Catalog** | Design Studio / My products | **Global Catalog** | **Publish** | Add a blank/product from global into My Catalog |
| **Contacts** | Finance (Sales, Expenses, Accounting) | **Global Contacts / CRM** | **Create and push** | **Search global → Use here** |
| **Support** | Record context (Orders, Sales, Customers) | **Global Support** (Inbox & Tickets) | Create ticket here → lands in global queue | Link an existing global ticket |
| **Marketing** | Studio / Catalog / Product context | **Global Marketing** | Promote here → lands in global calendar/queue | Pull from global library/campaigns |

**Why two:** The designer cannot bounce to the global catalog mid-design. The user in Finance should not have to open CRM to bill someone. Scoped = fast, in context, only what you need. Global = governed, searchable, shared across the whole platform.

**Rules**

1. **One record identity.** A scoped view is a lens (or staging copy) linked to a single global ID. Pushing never makes a second record.
2. **Two entry flows, same destination.**
   - *Create → push:* new contact/product made in scope, then promoted to global.
   - *Search → link:* user searches the global hub from the scoped view and attaches the existing record. Search always runs **before** create ("Does this already exist?").
3. **Dedupe on push.** Match keys: Contact = email / tax ID / name + address; Product = SKU / design ID; Ticket = requester + related record. On a match the push modal offers **Link to existing · Merge · Create anyway**.
4. **State pill on every scoped row:** `Local only` → `Pushed` → `Live/Global`. Catalog adds `Draft → Published → Syncing to channels`.
5. **Provenance:** global records carry a source pill (`Created in Studio`, `Created in Finance`) so context is never lost after the push.
6. **Visibility:** a scoped item is visible to the creator/team until pushed; global visibility follows Roles & permissions. Pushing is its own permission (e.g. Publish to catalog).
7. **Edit from either view, with an "existing record" warning.** The user is never sent to the other view to make a change. Because there is only one record underneath (rule 1), an edit made in the scoped view or the global hub writes to the same record and shows up in both immediately. The safeguard is a warning on entering edit, not a redirect.

   **Warning tiers (shown when edit opens, in the drawer/page header):**

   | Tier | Applies to | What the user sees |
   |---|---|---|
   | **1 — Notice** | Local only / not yet pushed | No warning needed |
   | **2 — Existing record banner** | Pushed/Global record, edited from anywhere | Banner: *"You're editing an existing record shared with Global Catalog."* + impact line (e.g. *Used in 14 products · 3 open invoices · 2 channels*) + **View where used**. Non-blocking. |
   | **3 — Confirm on save** | Edit changes a field with downstream effect (price, SKU, email, tax ID, terms, default account) | Save opens a small modal with a before → after summary of what propagates; options **Save** · **Save and apply to open drafts** · Cancel |
   | **4 — Locked** | Posted financial documents, reconciled transactions | Fields locked; offer **Void**, **Adjust**, or **Create credit memo** instead of edit |

   **Safeguards that make edit-anywhere safe:**
   - **Source pill in the activity log:** every edit records *edited from My Catalog / Studio / Finance / Global*, who, and the before → after values.
   - **Concurrency:** soft lock banner (*"Maria is editing this"*) and a version check on save; on conflict show a field-level diff to keep mine, keep theirs, or merge.
   - **Permissions still apply:** edit rights follow Roles and permissions; fields like cost, margin and bank details stay masked and read-only without the right role.
   - **Undo:** a toast with **Undo** after save for Tier 2 edits, plus Activity → Restore previous value.
   - **Same warning component everywhere:** one Existing Record Banner component, parameterized by record type and impact counts, used by Party, Item, Ticket, Campaign and Account drawers.
8. **Create menu:** actions in a scoped context default to creating locally with **Push to global** pre-checked in the drawer footer (`Save` · `Save and push`).

---

## PART 2 — Module by Module

Format per module: **Entity → Lists → Create surfaces → Detail → Right-click → Bulk → Rides along (cross-module) → Context in/out**.

---

### MODULE: Sales (Customers)

**Primary entities:** Invoice, Estimate, Sales receipt, Credit memo, Payment link, Payment, Statement, Subscription, Gift card

**Overview page**
- Create actions bar: Get paid online · Create invoice · Payment link · Recurring · Record payment · Sales receipt
- Sales funnel (Estimate → Invoice → Not paid → Paid → Deposited)
- Income over time with Compare previous year, group by Month/Year
- Revenue transactions feed (Stripe webhook)

**Create surfaces**

| Action | Surface | Fields / notes |
|---|---|---|
| Invoice | **Document page** | Party picker, Terms, Invoice date, Due date, Invoice no, Lines (Item/Desc/Qty/Rate/Amount), Charge a deposit, Note to customer, Memo on statement, Attachments, Tags. Header tabs: **Edit · Email view · Payor view · PDF view**. Right-hand: Payment options, Design, Scheduling, More options. Footer: Save · Review and send · Print/Download |
| Estimate | Document page | Same engine; Expiry date; button **Convert to invoice** |
| Sales receipt | Document page (compact) | Instant settlement; deposit-to account |
| Credit memo | Document page | Source invoice pill; reason; RMA link; **Apply to invoice** or **Refund** |
| Payment link | **Modal** | Amount, Description → result screen with Share link + QR + Copy |
| Receive payment | **Workspace** | Party → shows open invoices → checkboxes apply amount → deposit-to account → unapplied credit handling |
| Record payment | **Modal** (from invoice row) | Amount, date, method, deposit-to, reference |
| Statement | **Workspace** (batch) | Select customers + period → preview → send/print |
| Recurring | **Drawer** | Template from existing invoice; schedule; auto-send vs. draft |
| Add customer | **Party drawer** (role=Customer) | See CRM |

**Invoice list columns:** ☐ · Invoice # · Customer (pill) · Invoice date · Due date · Status (pill) · Amount · Balance due · Source (Order/Link/Manual pill) · ⋯
**Default sort:** Due date asc for Unpaid; Date desc for All. **Status tabs:** All · Draft · Unpaid · Overdue · Paid · Deposited.

**Right-click on an invoice**
- Open · Edit · Duplicate
- **Create from this ▸** Credit memo · Return/RMA · Ticket · Task (follow up) · Payment link
- **Communicate ▸** Send · Remind · Email customer · Add note
- **Money ▸** Record payment · Refund · Mark paid
- Print · PDF · Download attachment
- Void · Delete

**Bulk:** Send · Remind · Print · Tag · Export · Record payment (batch)

**Rides along**
- **Orders:** Order pill; "Create invoice" from order; shipment status shown inline
- **Catalog:** Item picker shows stock pill; low stock warns on line
- **Accounting:** "View journal entry"; deposit pill → Bank deposit → Reconcile
- **Support:** Ticket pill if open; "Open ticket" from row
- **CRM:** Customer peek shows lifetime value, last order, segment
- **Tax:** Sales tax calculated per line (needs definition — see Part 4)
- **Marketing:** Discount code pill if applied

**Context out:** `party_id`, `invoice_id`, `order_id` → into Credit memo, RMA, Ticket, Payment.

---

### MODULE: Expenses & Bills (Vendors & Suppliers)

**Primary entities:** Bill, Expense, Check, Vendor credit, Credit card credit, Bill payment, Purchase notification

**Overview page**
- Create actions: Upload multiple bills · Create bills · Schedule online payment · Pay bills · Record an expense
- Automate bills funnel: **Upload & auto-create → For review → Approval → Paid**
- Spend over time · Spend insights

**Create surfaces**

| Action | Surface | Notes |
|---|---|---|
| **Add bill** | **Document page** (opens as drawer first, "Make full page") | Capture panel at top (Autofill · Upload · Take a photo). Vendor, Mailing address, Terms, Bill date, Due date, Bill no. **Category lines** and **Item lines** in two tabs. Line actions: Add / Clear / Copy / Tag / Delete. Memo, Attachment, **Make recurring**. Footer: Save bill · Save and schedule · Print |
| Upload multiple bills | **Workspace** | Drop zone → OCR queue → each lands in **For review** |
| Expense | **Drawer** (fast) | Payee, Date, Paid-from account, Category, Amount, Receipt, Tag |
| Check | Drawer / Document | Payee, bank account, **Print later** toggle, memo; goes to Print checks queue |
| Pay bills | **Workspace** | Payment table: Payment account · Payment date · Starting check # · Rows: Payee · Ref no · Due date · Status · Bill approval · Open balance · Credits · Payment · Total · Action |
| Schedule online payment | Modal | Date, method (ACH uses vendor's Bill Pay ACH details) |
| Vendor credit | Document page | Source bill pill; supplier refund tracking |
| Credit card credit | Drawer | Card account, vendor, amount |
| Purchase order | Document page | Blank/SKU lines; see Purchasing |

**Bills list columns:** ☐ · Vendor (pill) · Bill no · Bill date · Due date · Bill amount · Open balance · Status (pill) · Approval (pill) · Source (Upload/Email/Manual) · Action
**Tabs:** For review · Unpaid · Paid. **Search:** by vendor, by bill date. **Default sort:** Due date asc (Unpaid), Bill date desc (Paid).
**Row primary action (the "Action" column):** Pay · Approve · Review (changes by status).

**Expense Transactions list** (all types): Date · Type pill (Bill/Expense/Check/Vendor credit/Card credit) · Payee · Category · Account · Amount · Status · Attachment icon. Filters/dates/saved views. **New transaction** button → type picker.

**Right-click on a bill**
- View bill details · Edit · Duplicate
- **Create from this ▸** Vendor credit · Task · PO match · Expense (split)
- **Communicate ▸** Email vendor · Add note
- **Money ▸** Pay · Mark paid · Schedule payment
- Categorize · Match (to PO/bank transaction) · Approve to Unpaid
- Download attachment · Print
- Delete bill

**Bulk:** Approve · Pay selected (sends into Pay bills workspace) · Categorize · Tag · Print checks

**Vendors tab (inside Expenses):** Import vendors · Add vendor (Party drawer). Columns: Vendor · Open balance · Last bill · YTD spend · 1099 flag · Payment method (ACH ready pill) · ⋯

**Contractors tab:** Name · Email invite · W-9 status pill · Tax profile · YTD paid · **Pay and file 1099s**. Add contractor = Party drawer role=Contractor with W-9 invite section.

**Rides along**
- **Purchasing:** Open PO pills on vendor; matching suggestion on bill
- **Catalog:** Item lines update cost; "Reprice" prompt if cost changed beyond threshold
- **Inventory:** Item lines on bill can receive stock ("Receive items…")
- **Accounting:** Category = Account picker; bank match in Reconcile; Rules (Settings → Bank rules) auto-categorize
- **Tax:** Contractor spend → 1099; deductible expense totals → Tax summary
- **Orders:** Supplier cost on order lines links to bill (COGS)

---

### MODULE: Contacts / CRM (Parties)

**Primary entity:** Party (+ roles). Sub-areas: Parties, Seller relationships, CRM tools.

**List: Parties**
Columns: ☐ · Name · Role pills (multi) · Email · Phone · Open balance (AR/AP) · Lifetime value / YTD spend · Last activity · Segment pills · Owner · ⋯
Tabs: All · Customers · Vendors · Suppliers · Contractors · Sellers · Leads · Archived
Default sort: Last activity desc.

**Party drawer (the single most reused component)**

| Section | Fields |
|---|---|
| Identity | Name, Company, Display name, Email, Phone, Roles (pills, **Add role…**) |
| Address | Street, City, State, Zip, Country, shipping vs. billing |
| Finance | Terms, Currency, Default category/account, Tax exempt, **Bill Pay ACH** (Account no., Routing no. — masked), 1099 flag |
| Notes & Attachments | Notes, attachments |
| Role-specific | Customer: price list, credit limit, statement preference · Vendor/Supplier: lead time, MOQ, catalog feed, integration · Contractor: W-9 invite · Seller: payout, onboarding status |
| Footer | Save and new · Save and close |

**Party detail (opened from row — drawer, expandable to page)**
Tabs: **Overview · Transactions · Orders · Tickets · Files · Activity**
Header actions: Email · Create ▸ (role-aware: Invoice/Estimate/Order/Bill/PO/Ticket/Task/Note)

**Right-click on a party** (matches your spec)
- THIS PARTY ▸ Open profile · Email · Edit party
- **Create ▸** (role-aware) Invoice · Estimate · Sales order · Bill · PO · Expense · Ticket · Task · Note
- ROLES ▸ Add role… · Remove role
- Archive

**Rides along:** this is the *hub*. Every other module's Party pill resolves here. Peek popover shows: balance, last transaction, open tickets, next task, segment.

**CRM tools:** Leads (pipeline board + list; convert to Customer = adds role, no duplicate) · Appointments (calendar) · Segments (rule builder → feeds Newsletter/Promotions) · Templates (email/SMS).

**Marketplace sellers:** Sellers list → Seller detail (Overview · Catalog · Orders · Payouts · Compliance & 1099 · Support) → Seller feed → **Onboarding queue** (Approve/Decline modal). Attention pill: Missing docs.

---

### MODULE: Catalog (Products, Variants, Channels)

**Primary entity:** Item. **Prereq (from your notes):** Department / Sub-department / Service type / SKU line must exist before product entry → build these as **inline "Add new" inside the Category field**, so the prereq never blocks the user.

**List: Products & Variants**
Columns: ☐ · Image · Name · SKU · Type pill (Product/Blank/Bundle/Service) · Category · Status pill (Draft/Published/Archived) · Channels (channel pills) · Price · Cost · Margin % · Stock (pill) · Supplier pill · Design pill · Updated · ⋯
Tabs: Products · Listings · Blanks · Bundles · Published items & SKUs · Review
Sorts: Name, Price, Margin, Stock, Updated, Best selling (sales velocity).
Filters: Category, Channel, Supplier, Status, Has design, Low stock.

**Create: Product/Service drawer (wide)**

| Tab | Fields |
|---|---|
| **Basic info** | Name, Item type, SKU, Category (+ add new), Image(s), Chart of account selection (+ Add new) |
| **Sales** | Description, Price/Rate, Income account, Tax |
| **Purchasing** | "Purchase this service from a supplier" toggle → Supplier, Cost, Expense/COGS account, Lead time |
| **Accounting** | Income, COGS, Inventory asset accounts |
| **Variants** | Option grid (size/color) → SKU per variant, price override, stock |
| **Channels** | Per-channel publish toggles with sync status pills |
| **Design** | Attached design(s) → **Open in Studio** |
| Footer | Save and new · Save and close |

**Right-click on a product** (matches your spec)
- View · Edit · Duplicate
- Publish / Unpublish · Reprice
- **Open in Studio** · Add to designer
- View sales · View supplier
- **Create from this ▸** PO · Discount code · Banner · Social post · Newsletter feature · Campaign
- Archive

**Bulk:** Publish · Reprice (modal: % or fixed) · Add to collection · Assign category · Push to channels · Archive

**Rides along**
- **Studio:** design thumbnail on every product; "Open in Studio" preserves envelope
- **Inventory:** stock pill → Adjust stock / Transfer / Stock history modals
- **Purchasing:** "Create PO" with SKU line prefilled at reorder qty
- **Sales/Orders:** "View sales" → Sales report prefiltered to item
- **Marketing:** product → Banner/Popup/Post/Discount with item prefilled
- **Channels:** sync status pill (Synced / Error / Needs attention) → opens channel fix drawer

**Categories:** list + **drawer** (name, parent, slug, image, rules). **Bundles:** drawer with component item picker and bundle price calc. **Collections:** canvas builder (Studio-style).

**Channels page:** card per channel (TikTok, Amazon, Facebook Marketplace, WhatNot, Etsy, eBay, Website/CMS): Status · Last sync · Listings count · Errors pill. Click → drawer with connect, mapping, rules.

---

### MODULE: Design Studio (T-shirt / product design)

**Primary entity:** Design (→ Collection → Product)

**Entry points (all must lead to the same studio):**
Create → Design · Product drawer → Open in Studio · Product row right-click → Open in Studio · Catalog (Men/Women/Children/Home Living) → pick blank → Start design · Order issue → "Edit artwork"

**Studio layout (Konva)**

| Region | Components |
|---|---|
| Left rail | Upload · AI · Add text · Graphics · Images · My library · My templates |
| Canvas | Product mockup (front/back/sleeve views), print area guides, safe margin warning |
| Right panel | Layer list, properties (font, color, size, position), color swatches of blank |
| Top bar | New design · Preview · View product page · Undo/Redo · Save · **Publish** |
| Bottom/side | Blank selector, size chart, variant colors, **live cost/price/margin** |

**Design list (Studio home):** tabs **New design · Collection · Published · My templates**. Card grid with thumbnail, name, status pill, linked products pills, updated.
List view columns: Thumbnail · Name · Collection · Status · Linked products · Blank(s) · Updated · ⋯

**Right-click on a design:** Open · Duplicate · Rename · **Create product** · Add to collection · Create post (social) · Create banner · Archive

**Publish flow (modal → 3 steps):** 1. Choose blank + variants → 2. Price (shows margin from supplier cost) → 3. Channels + category → creates Product records. Result pill: "3 channels syncing."

**Create wizard (My products):** Best selling · Fast selling · Men · Women · Children · Home Living → picks blank → opens Studio.

**Rides along:** Supplier/blank cost → Catalog margin · Published → Catalog Item with Design pill · Order → "View design" for fulfillment proofing · Social Studio library auto-includes mockups · Marketing banners pull product mockups.

---

### MODULE: Orders & Fulfillment

**Primary entity:** Order (Sales order is its document form). Sub-entities: Shipment, Packing slip, Label, Issue.

**List: Orders**
Columns: ☐ · Order # · Channel (pill) · Customer (pill) · Date · Items (count + thumbnail stack) · Total · Payment (pill) · Fulfillment (pill) · Invoice (pill) · Issue (alert pill) · Tracking · ⋯
Tabs: All · New · Needs attention · In production · Ready to ship · Shipped · Delivered · Returned · Canceled
**Needs attention** = "Order Issues (Manual push / Needs attention)" — failures to push to supplier, address problems, payment holds, out of stock.
Default sort: Needs attention first, then date desc.

**Order detail (page with right rail)**
Sections: Items (with design thumbnails) · Shipping (address, method, carrier) · Payment · Timeline · Notes
Right rail pills: Customer · Invoice · PO · Shipment · Ticket · Return
Header buttons: **Mark shipped · Print ▾ (Packing slip, Shipping label, Slip) · Track shipment · Refund… · Cancel order · ⋯**

**Modals**

| Action | Fields |
|---|---|
| Mark shipped / Mark in transit | Carrier, tracking no., date, notify customer toggle |
| Print shipping label | Service, package size/weight, rates preview |
| Refund… | Items/amount, reason, restock toggle, notify |
| Cancel order | Reason, refund toggle, cancel supplier PO toggle |
| Report a problem… | Category, description, attachments → creates Ticket |
| Sync tracking now | Confirm; shows last sync result |

**Right-click on an order**
- View order · Edit · Duplicate
- **Create from this ▸** Invoice · Return/RMA · Ticket · PO · Task · Note
- Print slip · Print shipping label · Print packing slip
- Mark shipped · Mark in transit · Track shipment · Sync tracking now
- Refund… · Report a problem…
- Cancel order

**Bulk:** Batch slips & labels (→ workspace) · Mark shipped · Push to supplier · Tag · Export

**Fulfillment Queue (workspace):** Pick/pack list; scan or checkbox; batch print; status moves automatically.

**Shipping settings** (Orders → Order management and Settings → Fulfillment): **Carrier row actions: Test rates · Manage services · Disable carrier.**

**Rides along:** Customer peek · Invoice/payment state · Supplier PO and cost · Inventory reservation · Design proof · Support ticket pill · Return pill · Channel sync (tracking pushes back to Etsy/Amazon/etc.)

---

### MODULE: Purchasing & Inventory

**Purchase orders**
List columns: ☐ · PO # · Supplier (pill) · Date · Expected · Status (Draft/Sent/Partially received/Received/Closed) · Total · Received % · Linked orders (pill) · Bill (pill) · ⋯
**Create PO:** Document page. Blank/SKU lines. Supplier picker defaults ship-to, terms, cost from Item.
Row/Header actions: **Send to supplier · Receive items… · Print PO · View PO · Create bill**
**Receive items… (modal → workspace for many lines):** qty received per line, location, damaged qty, date → posts inventory + offers **Create bill** (3-way match: PO ↔ Receipt ↔ Bill).

**Inventory**
List columns: ☐ · Image · Item · SKU · Location · On hand · Reserved · Available · Reorder point · Incoming (PO pill) · Value · Stock status pill · ⋯
Right-click: **View in Catalog · Adjust stock · Transfer · Stock history · Start cycle count** · Create PO · Reprice
Modals: Adjust stock (qty, reason, location), Transfer (from/to location, qty). Start cycle count → workspace.
Alert pills: Low stock, Out of stock, Overstock, Negative.

**Fulfillment queue & Batch slips & labels:** see Orders.

---

### MODULE: Returns & Claims

**Entity:** Return/RMA (Document)
List columns: RMA # · Order (pill) · Customer · Reason · Items · Status (Requested/Approved/Received/Refunded/Declined) · Refund amount · Age · ⋯
**Create:** RMA drawer/page — Order picker → select lines/qty → reason → resolution (Refund/Credit/Exchange) → label.
Right-click: **Open RMA · Approve return · Decline return** (modal with reason + message) · Create credit memo · Refund · Create ticket · Print label
**Rides along:** Credit memo auto-draft on approve · Inventory restock on receive · Supplier claim (vendor credit) if defective · Ticket pill.

---

### MODULE: Finance / Accounting

**Overview:** Bank transactions · Receipts · Reconcile · Cash flow · Quick view (P&L, Balance sheet) · Account list · Retained earnings

**Bank Transactions (the most important screen for integration)**
Columns: ☐ · Date · Description · Payee/Payer (pill) · Account/Category · Amount in/out · Status (For review / Matched / Categorized / Excluded) · Match (pill to Bill/Invoice/Order/Payout) · Receipt icon · ⋯
Tabs: For review · Categorized · Excluded
Row inline: **Match** (suggested docs) | **Categorize** (Account picker) | **Create ▸** Expense · Bill payment · Transfer · Deposit
Rules (Settings → Bank rules) apply automatically; "Create rule from this" in right-click.

**Reconcile (workspace)**
Setup modal: Account type · Statement ending balance · Statement ending date · Service charge · Interest earned (with date and account).
Workspace: Two columns (Payments/Checks vs Deposits/Credits), checkbox tie-out, live **Difference** meter, Finish.

**Chart of Accounts**
Columns: Account name · Type · Detail type · Balance · Bank balance (if bank) · Active · ⋯
Sorts: Type (Assets→Equity→Income→COGS→Expense), Name, Balance.
Actions: **New account** (drawer: Type, Detail type, Name, Number, Parent, Opening balance) · Run report · Cleanup · Accounts wizard · Open and edit CoA
Right-click: View register · Edit · Run report · Merge · Make inactive
**Register view** (click an account): ledger-style list with Date · Type · Num · Payee · Memo · Debit/Credit · Balance.

**Journal entry:** Document page. Date, Journal no., Lines (Account picker, Debit, Credit, Description, Name/Party, Tag), Balance check bar, Attachments, Reverse/Auto-reverse toggle.

**Bank deposit:** Page/workspace — "Combine funds": lists undeposited payments/receipts as checkboxes + extra lines + cash back.
**Transfer:** Modal — from, to, amount, date, memo.
**Settlement (Stripe/Shopify):** Workspace — payout lands → auto-splits into: Gross sales, Fees, Refunds, Disputes, Reserve, Net deposit → one-click **Post** creates deposit + fee expense + clears invoices/orders.

**Lines of credit / Credit cards / Loans:** Account-style cards with balance, available, next payment pill; **Pay** (modal), **Reconcile**, **Import transactions**.
**Entities:** Legal entities/brands, each with own books; entity switcher pill in header.
**Funnel / Cash flow:** Funnel = money pipeline visual; each stage clickable into filtered lists.

**Rides along:** Every posted document has **View journal entry** · Reports drill from any number down to transactions · Orders/payouts reconcile to deposits · Tax summary reads this ledger.

---

### MODULE: Business Tax

Overview (Business tax at a glance) · Tax summary (Taxable profit estimate, Taxable income, Deductible expenses, What you could be taxed on, Income from transactions, Depreciable assets) · 1099-K detail · Payroll tax · Year-end filing.
**Create actions:** Create tax return (workspace wizard) · Download tax summary (modal → PDF).
Columns for deductible expenses: Category · Amount · % deductible · Source count (pill → filtered transactions).
**Alert pills:** Uncategorized transactions, Missing W-9, Unreconciled accounts — each opens the fix surface.
**Rides along:** Contractors → 1099 · Sales tax (needs definition) · Reconcile status gates "ready to file" · Fixed assets from Bills.

---

### MODULE: Marketing & Social

**Banners & Popups**
- List columns: Name · Type · Slot/Placement · Status · Schedule · Audience (segment pill) · Views · Clicks · Conversions · ⋯
- Create: **Drawer** (Banner = Storefront slot picker; Popup = trigger, creative, audience) with live preview pane. Product/Collection/Discount pickers embedded.

**Discount codes / Promotions**
- Columns: Code · Type (% / $ / BOGO / shipping) · Value · Window · Usage / limit · Applies to · Status · Revenue
- Create: **Drawer** (Type, value, window, eligibility, limit, stacking). Applies-to uses Item/Collection/Segment pickers.
- Right-click: Duplicate · Pause · View orders using code · Create banner · Create post · Create newsletter

**Social Studio / Publishing**
- Calendar (month/week) · Queue · Library · Channels · Performance · Oversight
- **Create content:** Drawer/page — Channels multi-select (pills), caption (AI assist), media (from Library / Design mockups), product tags, schedule, UTM auto.
- Right-click on a post: Edit · Duplicate · Reschedule · View performance · Boost (→ Ad Center) · Delete

**Newsletter:** Campaign builder (page): Audience (segment) → Content (blocks + product picker) → Review → Send/Schedule. List: Name · Segment · Status · Sent · Open% · Click% · Revenue.
**Automation:** Flow builder (trigger → condition → action). Triggers come from other modules: Order placed, Abandoned cart, Invoice overdue, Ticket closed, Low stock.

**Advertising (Ad Center):** Campaigns · Ad sets · Creatives · Audiences · Pixels · Ad spend & finance · Advertisers · Workspace.
Create **Campaign** (Meta/TikTok/Google) = Wizard page: Objective → Audience (segment/pixel) → Creative (Library/Design) → Budget → Review.
**Ad spend & finance** posts as expenses to Accounting automatically (Bill/Expense with Source=Ad platform).

**CMS / Website:** CMS pages · Content blocks · Banners · Popups — page editor with block drawer.

**Rides along:** Product → promote · Segment → audience · Order revenue attribution back to campaign · Ad spend → Expenses · Design → creative.

---

### MODULE: Support

**Entity:** Ticket
**Inbox & Tickets:** Omnichannel inbox (email, chat, social DMs, marketplace messages) with thread list + conversation + **context sidebar**.
Ticket list columns: ☐ · Ticket # · Subject · Requester (party pill) · Channel · Priority · Status · Assignee · SLA timer (alert pill) · Related (Order/Invoice/RMA pills) · Updated · ⋯
**Queues:** Attention · Customer · Seller (counts as badges). **SLA & Routing:** Queues · SLA rules · Automations. **Trust & Safety:** Knowledge base · Help center · Docs · Policies.

**Create ticket:** Drawer — Requester picker, Subject, Channel, Priority, Related record picker (Order/Invoice/RMA/Product), Assignee, First message/macro.
**Context sidebar in a ticket (the integration payoff):** Customer peek (LTV, balance) · Recent orders (with **Refund…**, **Track shipment**, **Resend** inline) · Open invoices (**Record payment**, **Send**) · Open RMA · Notes. The agent never leaves the ticket to fix the issue.

Right-click: Assign · Change status · Merge · Create task · Link order · Create RMA · Create credit memo · Add note · Close

**Rides along:** Order "Report a problem" → ticket · Seller queue → Seller detail · KB article suggestions in reply composer · SLA breach → Tasks/Inbox notification.

---

### MODULE: Team & Contractors

Add contractor (drawer, Party role=Contractor): Name, Email, **W-9 invite** toggle → status pills: Invited · Completed · Missing. **Pay and file 1099s** workspace.
**Time entry** (optional, later): Modal/week grid; rides to Invoice lines (billable) and Contractor payments.
Roles & permissions and Teammates live in Settings; **Invite** on Tasks and Workspace share one Invite modal.

---

### MODULE: Tasks / Calendar (Pinned)

**Entity:** Task
Views: **Board · List · Calendar** · Add task · Invite
Task drawer: Title, Due, Assignee, Priority, **Related record picker (any entity)**, Description, Checklist, Attachments.
**Every record has "Add task"** in Create-from-this; the related record shows as a pill on the task and the task shows in the record's Related rail. Quick task = inline row entry (title + due only).
Columns: ☐ · Title · Related (pill) · Assignee · Due · Priority · Status · ⋯
**Rides along:** Overdue invoice → "Follow up" task · Low stock → "Reorder" task · Ticket SLA → task · Onboarding queue → review task.

---

### MODULE: Cap Table

Overview · Stakeholders · Funding rounds · Option pool · SAFEs & convertibles · Dilution modeler · Liquidation waterfall · 409A & valuations · Equity events · Controls · Documents.
- **Stakeholder** = Party with role Stakeholder (Add via Party drawer + equity section).
- Create surfaces: **Funding round** (page/wizard), **Equity event** (modal: grant/exercise/transfer), **SAFE** (drawer), **Document** (upload + e-sign).
- Modelers (Dilution, Waterfall) = full-page workspaces with scenario tabs and live table.
- **Rides along:** Funding round → Bank deposit (Accounting) · Equity events → Journal entries · Documents → shared Files library · Permissions: restricted by role (Controls).

---

### MODULE: Reports

Overview · Analytics (Explorer) · Dashboard reports (Operations vitals, Executive GMV & margins) · Contacts · Catalog · Orders · Finance · Marketing · Support.
**Standard report page:** Toolbar (date range with compare, filters, group by, columns) → summary tiles → table → chart toggle. Row click = **drill-down** to the underlying list pre-filtered (this is the integrated-feel rule for reports). Actions: Customize · Save view · Schedule · Export · Add to dashboard.

---

### MODULE: Dashboard

Tiles: **GMV · Orders · Products · Support · Analytics**
Each tile = number + sparkline + delta + **click = filtered list**, and has 1–2 quick actions:
- GMV → Sales overview · Orders → Needs attention · Products → Low stock / Draft · Support → Attention queue · Analytics → Explorer.
Pinned: Tasks/Calendar · Favorites · Inbox/Notifications · Reports.

---

### MODULE: Settings

Left nav groups exactly as built. Component pattern: **Section page → card per setting → inline edit or drawer**.
Key integrations of Settings with workflow:
| Setting | Changes what elsewhere |
|---|---|
| Roles & permissions | Create menu, right-click menus, field masking |
| Approvals & limits | Approve to Unpaid, Payment approval prompts |
| Chart of Accounts / Bank rules | Account picker, auto-categorization in Bank transactions |
| Recurring templates | "Make recurring" in Invoice/Bill |
| Fulfillment & shipping | Carrier actions (Test rates, Manage services, Disable carrier) |
| Customer hub / Vendors & suppliers | Party drawer default fields |
| Notifications | Inbox/Notifications pinned item |

---

## PART 3 — Create Menu → Component Map (every action from your doc)

| Create action | Group | Surface | Opens with (envelope) | Also reachable from |
|---|---|---|---|---|
| Invoice | Customers | Document page | party / order | Order, Party, Estimate, Ticket |
| Payment link | Customers | Modal → result | party / invoice | Invoice, Order |
| Receive payment | Customers | Workspace | party | Invoice row, Bank transaction |
| Statement | Customers | Workspace | party / period | Party, Invoice list |
| Estimate | Customers | Document page | party | Party, Lead |
| Sales receipt | Customers | Document page | party / order | Order |
| Credit memo | Customers | Document page | invoice / RMA | Invoice, Return |
| Add customer | Customers | Party drawer (Customer) | — | Any Party picker |
| Expense | Vendors | Drawer | payee / bank txn | Bank transactions |
| Check | Vendors | Drawer/Document | payee | Vendor |
| Bill | Vendors | Document page (drawer first) | vendor / PO | Vendor, PO, Upload |
| Pay bills | Vendors | Workspace | selected bills | Bills list, Vendor |
| Purchase order | Vendors | Document page | supplier / item | Item, Inventory, Order |
| Vendor credit | Vendors | Document page | bill | Bill |
| Add vendor / supplier | Vendors | Party drawer (Vendor/Supplier) | — | Any Party picker |
| Add contractor | Team | Party drawer (Contractor) | — | Contractors tab |
| Time entry | Team | Modal | contractor / customer | Later |
| Task | Books | Drawer | any record | Every record |
| Bank deposit | Books | Workspace | undeposited funds | Sales, Bank txn |
| Journal entry | Books | Document page | account | Account register |
| Transfer | Books | Modal | account | Account, Bank txn |
| Reconcile | Books | Modal → Workspace | account | Account, Bank |
| Settlement | Books | Workspace | payout | Stripe/Shopify feed |
| Add product/service | Books | Item drawer | category / supplier | Any Item picker |
| Add account | Books | CoA drawer | type | Any Account picker |
| Design | Catalog | Studio | blank / collection | Product, Catalog |
| Product | Catalog | Item drawer → Studio | design | Design, Supplier feed |
| Collection | Catalog | Canvas builder | items | Studio |
| Category | Catalog | Drawer | parent | Product |
| Banner | Marketing | Drawer + preview | product / collection | Product, Promotion |
| Popup | Marketing | Drawer + preview | segment | Segment |
| Discount code | Marketing | Drawer | product / collection | Product, Campaign |
| Campaign | Marketing | Wizard page | product / design | Product, Post |
| Post | Marketing | Drawer/page | product / design | Product, Design |
| Newsletter | Marketing | Builder page | segment | Segment, Product |
| Sales order | Support & Orders | Document page | party / channel | Party, Lead |
| Return/RMA | Support & Orders | Drawer/page | order | Order, Ticket, Credit memo |
| Ticket | Support & Orders | Drawer | party / order | Every record |
| Add note | Support & Orders | Modal/inline | any record | Every record |
| Void | Support & Orders | Modal (confirm + reason) | the record | Document row only |

**Rule:** Create menu filters by **tab context** — in Sales tab it shows Customers group first; in Catalog it shows Catalog & Marketing first. Same menu, reordered by relevance, never a different menu.

---

## PART 3.5 — Domain Structure & the Undefined Modules

### A. The test: standalone module, sub-area, or setting?

A thing earns its own **standalone module** only if it passes at least 4 of 5:

1. Own primary entity with its own lifecycle
2. Own list view people live in
3. Own permission role (someone's job is this)
4. Used by 3+ other modules
5. Own ledger or compliance impact

Otherwise it is a **sub-area** of a domain parent, or an **engine/setting** that other screens call.

| Candidate | Entity | Own list | Own role | Used by | Ledger/compliance | Verdict |
|---|---|---|---|---|---|---|
| **Inventory** | Stock record + stock ledger | Yes | Warehouse/ops | Catalog, Orders, PO, Returns, Sales | Asset + COGS | **Standalone page** under Operations |
| **Payroll** | Employee, Pay run, Pay stub | Yes | Payroll admin (restricted) | Accounting, Tax, Time, Reports | Heavy | **Standalone page** under People |
| **Time** | Time entry | Weekly grid only | No | Payroll, Invoices, Tasks | Indirect | **Collapse** into People (feature, not a module) |
| **Sales tax** | Rate, jurisdiction, filing | Filings only | Finance | Invoices, Orders, Items, Parties, Reports | Liability account | **Engine in Settings** + sub-area of Business Tax |

### B. Catalog vs Inventory vs POD (the fix)

Catalog, Inventory and Purchasing are three layers over the same Item, not three competing modules.

| Layer | Question it answers | Owns |
|---|---|---|
| **Catalog** | *What is this and where is it sold?* | Definition, price, variants, **designs**, blanks, supplier link, channels, publish state |
| **Inventory** | *What do I physically have?* | On hand, reserved, available, locations, cost layers, counts, transfers, adjustments, stock history |
| **Purchasing** | *How does supply arrive?* | Purchase orders, receiving, supplier cost |

Every Item gets a **Fulfillment type**, set in the Item drawer. It decides which tabs, pills and PO behavior the item has:

| Fulfillment type | Example | Tracks stock? | Availability comes from | PO type | Pill |
|---|---|---|---|---|---|
| **Stock** | In-house goods, wholesale | **Yes** | Inventory on-hand | **Replenishment PO** (manual or reorder-point) | `42 in stock` |
| **POD (print on demand)** | Design on a blank | No | Supplier / blank availability | **Fulfillment PO**, auto-created per order | `Made on demand` |
| **Supplier-fulfilled (dropship)** | Supplier ships direct | No | Supplier feed | **Fulfillment PO**, auto-created per order | `Ships from supplier` |
| **Digital / Service** | Download, hourly service | No | Always available | None | none |
| **Bundle** | Tee + hat set | Derived | Lowest component availability | Per component | `Bundle` |

**Consequences**
- **Catalog owns POD completely:** Design → Product → Blank → Supplier. A POD product has no stock number, so the Inventory tab, Adjust stock and Cycle count never appear for it.
- **Inventory is only for real stock.** Its list shows only items with *Track inventory = on*.
- **Two PO types.** Replenishment PO is a manual or reorder-triggered buy for stock. Fulfillment PO is generated from an Order line and is linked to that order. Same Document Engine, different config.
- **Blanks:** if the supplier holds them, a Blank is a Catalog record with supplier availability. If *you* buy and hold blanks (in-house printing), the Blank becomes an Inventory item (raw material), which later needs a simple production/BOM step. Flag this as a future decision.
- **The stock pill on a product row** is replaced by the fulfillment pill for POD items.

### C. Recommended domain parents

Each parent is a nav group containing sub-areas. Each sub-area keeps its own list and Create actions.

| Domain parent | Contains |
|---|---|
| **Finance** | Accounting · Sales · Expenses & Bills · **Business Tax** (Income tax · **Sales tax** · **Payroll tax** · 1099s) |
| **People** | **Employees** · Contractors · **Time** · **Payroll** |
| **Operations** | Orders · Fulfillment · Purchasing · **Inventory** · Returns · Shipping |
| **Commerce** (Catalog & Design) | Studio + My Catalog → Global Catalog · Channels |
| **Growth** | CRM · Marketing · Social · Ads |
| **Support** | Inbox & Tickets · Queues · SLA · Trust & Safety |
| **Reports / Settings** | Unchanged |

Notes on the moves:
- **Contractors** are a People sub-area *and* keep a scoped view inside Expenses & Bills that pushes to People, the same pattern as section 1.9.
- **Employees** are a Party role, so they use the same Party drawer with Pay, Tax and Bank sections (masked and restricted).
- **Sales tax and Payroll tax** live under Business Tax because they are filings and liabilities, while the *engines* that feed them live elsewhere (Settings and Payroll).

### D. Definitions for the four

**Payroll** (People)
- Entities: Employee (Party role), Pay schedule, Pay run, Pay stub, Tax forms (W-2, 941).
- **Add employee:** Party drawer with Pay (salary/hourly, schedule), Tax (W-4, state), Bank (direct deposit), and an onboarding invite.
- **Run payroll:** Workspace. Period → hours/salary (hours pulled from Time) → review gross / deductions / taxes / net → approve → pay.
- Pay run list columns: Period · Pay date · Employees · Gross · Taxes · Net · Status pill (Draft / Approved / Paid) · ⋯
- Posts journal entries automatically (wages expense, tax liabilities, bank). Rides along into Business Tax → Payroll tax and Reports.
- **Decision to make:** build vs integrate. Payroll is compliance-heavy (filings, multi-state tax). Define the entity, surfaces and ledger posting now, and consider a provider integration behind the same screens.

**Time** (People)
- **Time entry:** modal or weekly grid. Fields: Person, Date, Hours, Related (Customer / Task / Order), Billable toggle, Rate, Note.
- Rides along: Invoice has **Add billable time** on its line picker; Payroll pulls approved hours; Tasks can start a timer.

**Sales tax** (Business Tax + Settings engine)
- **Engine (Settings):** Rates and jurisdictions, tax categories, nexus rules.
- **Item drawer:** Tax category field. **Party drawer:** Tax exempt toggle + certificate upload.
- **Document Engine:** per-line tax calculation and a tax summary in the totals block.
- **Business Tax → Sales tax:** liability by jurisdiction · Filing periods · **Pay sales tax** (workspace, like Pay bills) · Nexus alert pills.
- Orders from channels arrive with marketplace-collected tax flagged, so it is excluded from your liability.

**Inventory** (Operations)
- Defined in Module: Purchasing & Inventory, now restricted to *Stock* items. Add: **Locations** (warehouses/bins) and a **Stock ledger** (every movement with source pill: PO receipt, order, adjustment, transfer, return).

---

## PART 3.6 — POS, Gift Cards, Banking & Cards

### A. POS (brick-and-mortar)

**Principle:** POS is a **channel + a device surface**, not a separate system. A store sale is a normal Order/Sales receipt with a store channel pill, so Inventory, Accounting, CRM, Returns and Support all work unchanged.

**Entities:** Location (store) · Register · Shift (drawer session) · Sale · Tender (card, cash, gift card, split) · Receipt · Hardware (reader, receipt printer, cash drawer, scanner)

| Surface | Type | Contents |
|---|---|---|
| **POS app** | Full-screen, touch-first, offline-capable | Product grid + search + barcode scan → cart → attach customer (Party picker, optional, with `+ Add`) → discounts → tender → receipt (print/email/SMS) |
| Open shift | Modal | Register, starting cash |
| Close shift | Modal → count sheet | Counted cash vs expected, over/short, card totals, tips, **Z report** |
| Cash in / out | Modal | Amount, reason (paid-out, petty cash) |
| Park / resume sale | Inline | Held carts per register |
| Refund / exchange | Modal | Scan or search receipt, select lines, restock toggle, refund to original tender or store credit |
| Redeem / sell gift card | Modal | See 3.6 B |
| Manager override | PIN modal | Required for discounts above threshold, voids, refunds, price override |

**Back-office views:** Locations list (Name · Address · Registers · Open shift pill · Today's sales · Stock alerts) · Shifts list (Register · Cashier · Opened · Closed · Expected · Counted · Variance pill) · POS sales appear in Orders and Sales with a **Channel pill** `Store: Downtown`.

**Rides along**
- **Inventory:** stock is tracked per location; sales decrement the selling location; transfers between stores and warehouse; optional buy-online-pickup-in-store.
- **POD items in store:** sold as an *order for later* (ship or pickup), never as instant stock.
- **Accounting:** Z report posts a journal entry (sales by tender, tax, tips, cash over/short, gift card liability); card settlement reconciles to payouts in Bank transactions.
- **Sales tax:** location-based rates and exemptions.
- **CRM:** attached customer gets the sale on their profile; walk-up sales stay anonymous.
- **Support:** receipt lookup creates a ticket or RMA with the sale pre-linked.
- **Permissions:** Cashier, Shift lead, Manager roles; override rules live in Settings → Approvals and limits.
- **Offline mode:** queue sales and card-present fallbacks, sync on reconnect, and define oversell conflict rules before launch.

### B. Gift cards

**Treat gift cards as your own ledger entity.** A gift card sale is a **liability**, not revenue; revenue is recognized when the card is redeemed.

**Entities:** Gift card (code, initial value, balance, currency, issued to, expiry, status) · Gift card transaction (issue, redeem, reload, refund, adjust, expire)

| Action | Surface | Notes |
|---|---|---|
| Sell gift card | Item type = Gift card (digital or physical) | Sold online, in POS, or on an invoice; card is created on payment |
| Issue manually | **Drawer** | Amount, recipient, message, delivery (email / print), expiry |
| Check balance | Popover / modal | Enter or scan code |
| Redeem | Tender at checkout (online + POS) | Supports partial redemption and split tender |
| Reload / Adjust / Disable | Modal | Reason required, logged |
| Refund to gift card | Option in Refund modal | Or to store credit |

**List columns:** ☐ · Code (masked) · Recipient · Purchaser (pill) · Issued · Initial · Balance · Expires · Status pill (Active / Partially used / Redeemed / Expired / Disabled) · Source (Online / Store / Manual) · ⋯
**Right-click:** Open · Email card · Print · Reload · Adjust · **Create from this ▸** Ticket · Note · Disable
**Detail:** Ledger of every movement with source pill (Order #, Register, Manual).
**Accounting:** Gift card liability account; unredeemed-balance reports. Expiry, breakage and unclaimed-property rules vary by jurisdiction, so have a lawyer or accountant set the policy.
**Store credit** (from credit memos and returns) uses the same ledger with a different type.

### C. Banking & Cards (Stripe Connect + Treasury + Issuing)

**Model:** Merchants are Connect connected accounts. Treasury for platforms provides a financial account per merchant; Issuing provides debit cards drawn on that account. Payouts from Stripe settle into the financial account.

**Surfaces (Finance → Banking, merchant-facing)**

| Surface | Type | Contents |
|---|---|---|
| Financial account | Page | Balance, available, pending, recent movement |
| Move money | Modal | Transfer to / from linked bank, ACH out, payout sweep rules |
| Cards list | List | Card · Holder (Party/Team pill) · Virtual/Physical · Status · Limit · Spent this period · ⋯ |
| Issue card | **Drawer** | Holder, type, spend limit, allowed merchant categories, shipping, approval rules |
| Card transactions | Feed in Bank transactions | Auto-create **Expense** with receipt-capture prompt; match to Bill; categorize via Rules |
| Pay bills from financial account | Option in Pay bills workspace | Uses ACH details on the Vendor |
| Onboarding / KYC-KYB | Drawer or embedded component | Collect and verify business info before enabling Banking |

**Rides along:** Card spend limits tie to **Approvals and limits** · Settlement posts payouts into the financial account · Reconcile treats the financial account as a bank · Expenses and Business tax read card spend.

**Compliance surfaces you must design (they land in Support):** a regulated **Complaints and Disputes queue** with recordkeeping, plus disclosures and customer-service access inside the Banking UI.

---

## PART 3.7 — Support, Deepened

Support is the module most likely to feel bolted on, so it is designed here as a **cross-module resolution layer**: an agent resolves the problem *from the ticket*, without leaving it.

### A. Who Support serves (queues)

| Queue | Requester | Examples |
|---|---|---|
| **Customer** | Buyers | Order issues, returns, payment questions, product questions |
| **Seller** | Marketplace sellers | Onboarding, payouts, listing issues, compliance |
| **Attention** | Anyone | SLA at risk, escalated, manual-push failures |
| **Disputes and Complaints** | Buyers and merchants | Payment disputes/chargebacks (links to Sales → Disputes) and regulated Banking/Card complaints |
| **Internal** (optional) | Your team | Platform bugs, requests |

### B. Ticket model

**Ticket type** drives fields, sidebar cards and available actions: Question · Order issue · Return · Payment / dispute · Billing · Complaint · Seller onboarding · Bug.
**Fields:** Subject · Requester (Party pill) · Type · Channel · Priority · Status (New / Open / Pending / On hold / Solved / Closed) · Assignee · Queue · Tags · **Related records** (Order, Invoice, RMA, Product, Design, Shipment, Gift card).

### C. Ticket workspace (three panes)

| Pane | Contents |
|---|---|
| **List** | Views: My tickets · Unassigned · Attention · SLA at risk · By queue. Columns: ☐ · Ticket # · Subject · Requester · Type pill · Channel pill · Priority · Status · Assignee · **SLA timer pill** · Related pills · Updated |
| **Conversation** | Single timeline: customer messages (email, chat, DMs, marketplace), agent replies, **internal notes**, and **system events** (order shipped, refund issued, RMA approved). Composer tabs: Reply · Internal note · Macro · **AI draft** with KB article suggestions. |
| **Context sidebar** | Cards: **Customer** (LTV, balance, segment) · **Recent orders** (inline: Refund…, Track shipment, Resend, Cancel) · **Open invoices** (Record payment, Send) · **RMA** (Approve/Decline) · **Design proof** for POD items · **Shipment tracking** · **Previous tickets** · Notes |

**Right-click on a ticket:** Assign · Change status · Change priority · Merge · Link record · **Create from this ▸** RMA · Credit memo · Refund · Task · Vendor credit (supplier defect) · Add note · Close.
**Bulk:** Assign · Merge · Tag · Apply macro · Close.

### D. Inbound sources and automation

- **Sources:** email, chat, social DMs, marketplace messages (Etsy, Amazon, etc.), web forms, **Report a problem… on an order**, POS receipt lookup, Banking complaint form.
- **Automation (trigger → condition → action):** *Trigger:* ticket created, RMA created, payment failed, order delayed, SLA warning. *Action:* assign, route to queue, set priority, tag, auto-reply, create task, notify.
- **Macros** with merge fields (customer, order, tracking).
- **SLA policies:** first response and resolution targets by queue, priority and customer tier; timers pause on Pending; respects Office hours; breach raises an Alert pill and a task.

### E. Self-service and knowledge

- **Help center / customer portal:** order status, tracking, self-serve returns (creates an RMA), past tickets, gift card balance. This is the deflection layer.
- **Knowledge base:** articles, docs, policies; suggested in the composer and on the contact form; **Create article from ticket**; article feedback.
- **CSAT:** survey on solve; QA review sampling.

### F. Feedback loops into the rest of the platform

| Signal | Lands in |
|---|---|
| High issue or return rate per product | Catalog **alert pill** on the product + task |
| Supplier defect | Vendor credit / supplier claim |
| Fulfillment failures | Orders → Needs attention |
| Seller problems | Seller detail + Onboarding queue |
| Complaint volume by reason | Reports → Support (reason, first response, resolution, backlog, CSAT) |

**Permissions:** Agent, Lead, Admin. Sensitive fields (card, bank, tax IDs) masked in conversations. Regulated complaints and disputes are retained with full audit history.

---

## PART 4 — Gaps, Conflicts & Decisions to Make

1. **Scoped vs global trees are intentional, not duplicates.** My Catalog (Studio) → Global Catalog, Contacts (Finance) → Global Contacts/CRM, plus scoped Support and Marketing, follow the Push pattern in section 1.9. Decided: edits are allowed from either view, with the existing-record warning (rule 7 in section 1.9). Still open: the dedupe keys, which role can push, and whether Orders is also scoped, since it appeared in both places.
2. **"Not defined" items:** Payroll, Time, Inventory and Sales tax are now defined in Part 3.5 (domain placement, entities, surfaces). **Sales tax is still the build blocker**, since Invoices, Orders and Tax all depend on it. Payroll needs a build-vs-integrate decision. Blanks need a decision on whether you ever hold them yourself.
3. **Product catalog prerequisite** (Department / Sub-department / Service type / SKU line). Make it inline-creatable so it never blocks entry; otherwise users will bounce.
4. **Vendor vs Supplier vs Seller.** Recommended: **Vendor** = you pay them for operating costs; **Supplier** = fulfills your products (feeds PO, blanks, integrations); **Seller** = marketplace participant who sells through you. All Party roles, different drawer sections.
5. **Order vs Sales order vs Invoice.** Recommend: Order is the commerce record (from channels); Sales order is manual order entry that becomes an Order; Invoice is the billing doc generated from either. Link all three with relation pills.
6. **Statement ≠ Statement (bank).** Customer Statement (billing summary) and Reconcile "statement ending balance" use the same word. Label the latter "Bank statement."
7. **Void vs Delete vs Archive.** Posted documents: **Void** only (keeps audit trail). Drafts: Delete. Parties/Items/Accounts: Archive.
8. **Typos in source:** "Toytal Amount" → Total amount, "Announcemnets" → Announcements.
9. **Workspace appears as an item** at the end of Support reports and Settings — probably a stray; confirm.

**Enterprise-readiness gaps (cross-cutting, not yet specified):**

| # | Area | What to define |
|---|---|---|
| 10 | **Audit log and immutability** | What is logged (who, what, before/after, source view); posted ledger entries are never edited, only reversed; period close and lock dates |
| 11 | **Event layer and API** | Every state change emits an event (`invoice.paid`, `order.shipped`, `ticket.sla_breached`) that powers Automations, notifications and integrations; webhooks with **idempotency keys** for payments and Stripe events |
| 12 | **Global search and command palette** | Record-type facets, permission-aware results, recent and pinned, create-from-search |
| 13 | **Notifications and approvals** | One actionable inbox: approve a bill, review a return, or answer an SLA alert in place |
| 14 | **Multi-entity, multi-location, multi-currency** | Entity switcher, consolidated vs per-entity reports, intercompany transfers |
| 15 | **Import hub (Export is already a fixture)** | Export is on every list and report toolbar. Import appears as a contextual button on each list that supports it **and** as one central **Import hub in Settings → Data & Privacy**: source (QuickBooks, CSV, marketplace), field mapping, dry-run preview, import history with undo. Contextual buttons open the same hub pre-set to that entity |
| 16 | **Regulated-money controls** | KYC/KYB onboarding, loss liability, complaints and disputes recordkeeping, approved marketing and fee disclosures (Part 3.6 C) |
| 17 | **POS resilience** | Offline queue, sync conflicts, hardware support list, manager overrides |
| 18 | **Accessibility, keyboard, mobile** | Keyboard-first tables and drawers, responsive POS and approvals, WCAG targets |
| 19 | **Data model integrity** | Merge/dedupe tooling for Parties and Items, soft delete everywhere, referential rules for archive vs delete |

---

## PART 5 — Suggested Build Order

1. **Shared components:** Party picker, Item picker, Account picker, Pills, Table shell, Right-click menu engine, Context envelope, Activity timeline, Related rail
2. **Party drawer** (unlocks Customers, Vendors, Suppliers, Contractors, Sellers)
3. **Item drawer + Category/Account inline-create**
4. **Document Engine** (Invoice first, then Bill → everything else is config)
5. **Money movement:** Payment modal, Receive payment, Pay bills, Bank deposit
6. **Bank transactions + Reconcile + Settlement**
7. **Orders + Fulfillment modals**
8. **Studio ↔ Product ↔ Channel publish loop**
9. **Support context sidebar**
10. **Marketing drawers, Reports drill-down, Dashboard tiles**

---

## PART 6 — Integration Checklist (use per screen before shipping)

- [ ] Does every party/item/account/order mention render as a **pill** that peeks and opens?
- [ ] Does the right-click menu follow the 8-section grammar with **Create from this**?
- [ ] Does the right rail show **Related** + **Activity**?
- [ ] Does Create from this screen **prefill** from the envelope and **return to** this screen?
- [ ] Is there an **alert pill** for every state that needs a human?
- [ ] Do reports/tiles **drill** into the exact filtered list?
- [ ] Is the surface correct (peek / modal / drawer / page / workspace / studio)?
- [ ] Are permissions respected in menu, fields and pills?
- [ ] If this is a scoped view, does it search global first, dedupe on push, and show Local / Pushed / Live state?

---

# PART B

# Platform Build Spec: Components, Interaction Contract, API Map, 14-Day Plan

Companion to `platform-component-map.md` (what and why) and `contracts.ts` (types). This doc is the bridge to code: the component registry, the exact click/unclick behavior, the API surface, and a day-by-day plan.

---

## 0. Read this first

**Assumptions (confirm or correct):**
- Database is finished. Field names in `contracts.ts` are proposals; reconcile them with the schema on Day 1 and **derive DTOs from DB types** (Prisma/Drizzle/Supabase generated types + `Pick`/`Omit`) instead of maintaining two copies.
- Client is a component framework (React assumed). Everything here is framework-agnostic except the registry naming.
- A tab system already exists. This spec treats each tab as owning its own **surface stack** and **context envelope**.

**Delivery target: 14 days, full scope.** Scope is everything in the component map and the Settings spec. The plan in section 6 is organized as **parallel lanes with contract-first interfaces** (`contracts.ts`), so each lane can be owned by one person or one agent and run at the same time. It makes no assumption about team size. Feature flags (`platform_feature_flags` already exists in the schema) are for rollout control, not for cutting scope.

**Biggest speed lever: config-driven UI.** Build ~10 generic components once (TableShell, Drawer, DocumentEngine, ContextMenu, Pickers, SurfaceHost) and write ~40 small configs (`ViewDef`, `DrawerDef`, `DocumentDef`) instead of 40 hand-built screens. Types are in `contracts.ts` section 9.

---

## 1. Architecture

```
AppShell
 ├─ TabBar (each tab = { route, surfaceStack[], envelope })
 ├─ SideNav (counts, pinned)
 ├─ GlobalSearch / CommandPalette
 ├─ CreateMenu (context-filtered)
 ├─ Routed content (module page: TableShell / DocumentEngine / Workspace / Studio)
 └─ SurfaceHost (renders the active tab's surface stack: drawer, modal, popover)
```

**Three central stores** (everything else is local state):

| Store | Holds | Key methods |
|---|---|---|
| `useSurfaces` | Per-tab surface stack, dirty flags | `open(request)`, `close(instanceId)`, `replace()`, `closeAll(tabId)`, `confirmDiscard()` |
| `useEnvelope` | Active tab's context envelope | `current()`, `derive(record)` returns the envelope for "Create from this" |
| `usePermissions` | Roles, field masks, feature flags | `can(action, record?)`, `isMasked(field)`, `flag(name)` |

**Server state:** one query cache (React Query/SWR style), keyed `[entity, id]` and `[entity, 'list', normalizedQuery]`. Mutations invalidate by entity and by `relations` (so a payment refreshes the invoice, customer balance, bank feed and dashboard tile).

**Rule: the server decides actions and permissions.** Menus, create menu and field masks come from the API (`/actions`, `/create-menu`, `meta.can`, `maskedFields`). The client never re-implements permission or state-machine logic. That is what keeps right-click menus identical everywhere.

---

## 2. Component Registry

### 2.1 Shell and primitives (build first)

| Component | Contract (props → events) | Notes |
|---|---|---|
| `AppShell` | none | Mounts providers, SurfaceHost, toasts |
| `TabBar` | `tabs`, `activeId` → `onSelect`, `onClose(tabId)`, `onReorder` | Close with dirty surface triggers `DiscardChangesModal` |
| `SideNav` | `groups[]`, `counts` → `onNavigate` | Counts from `/nav-counts` (one cheap call) |
| `Breadcrumbs` | `trail[]` | From route config |
| `CommandPalette` | `open` → `onSelect(hit \| createAction)` | Uses `/search` + `/create-menu` |
| `CreateMenu` | `module`, `tab`, `record?` → `onPick(CreateAction)` | Calls `/create-menu`; renders `SurfaceRequest` |
| `Pill` | `Pill` union → `onClick`, `onContextMenu`, `onHover` | One component, 7 variants (see `contracts.ts`) |
| `PeekPopover` | `ref` → `onOpen`, `onAction` | Fetches `/peek/{type}/{id}`, 300 ms hover intent, cached |
| `MoneyField`, `DateField`, `SelectField`, `TagInput` | `value`, `onChange`, `error` | Money = minor units |
| `AttachmentStrip` | `ids`, `max` → `onAdd`, `onRemove`, `onPreview` | Upload via `/files` |
| `CapturePanel` | `mode: upload\|photo\|email` → `onExtracted(fields)` | OCR autofill for Bill/Expense |
| `EmptyState`, `Skeleton`, `ErrorState`, `Toast` (with Undo) | n/a | Undo toast 8 s |
| `ConfirmDialog` | `ConfirmSpec` → `onConfirm(reason?)` | Used by menu `confirm` |

### 2.2 Data components

| Component | Contract | Calls |
|---|---|---|
| `TableShell` | `ViewDef`, query state → `onRowOpen`, `onSelectionChange`, `onSort`, `onFilter` | `GET /{entity}` |
| `StatusTabs` | `tabs`, counts → `onChange` | counts from `meta.tabCounts` |
| `FilterBar`, `ColumnPicker`, `SavedViews` | `ViewDef.filters` | `/views` (per-user saved) |
| `BulkBar` | `selectionCount`, `actions[]` → `onRun(action)` | `POST /bulk/{entity}` |
| `ContextMenu` | `MenuAction[]` → `onSelect` | `GET /{type}/{id}/actions` (prefetch on row hover) |
| `ActivityTimeline` | `ref` | `GET /{type}/{id}/activity` |
| `RelatedRail` | `ref` | Reads `meta.relations` (no extra call) |
| `ExistingRecordBanner` | `ref` | `GET /{type}/{id}/impact` |
| `KpiTile` | `value`, `delta`, `drill: ViewDef query` → `onClick` | `GET /dashboard/tiles` |

### 2.3 Pickers (typeahead + inline create)

| Component | Contract | Behavior |
|---|---|---|
| `PartyPicker` | `role?`, `value`, `scope` → `onChange(partyId)` | Search scope first, then global. `+ Add new` opens child `PartyDrawer` (depth 1); returns created record into the field |
| `ItemPicker` | `fulfillmentTypes?`, `value` → `onChange` | Shows price, stock/fulfillment pill; `+ Add product/service` child drawer |
| `AccountPicker` | `types?`, `value` → `onChange` | Grouped by account type; `+ Add account` child drawer |
| `CategoryPicker`, `LocationPicker` | same shape | Category supports inline create (the catalog prerequisite fix) |

### 2.4 Containers

| Component | Contract | Behavior |
|---|---|---|
| `Drawer` | `width: 480\|720`, `dirty`, `title` → `onClose`, `onMakeFullPage` | Non-modal over the list; sticky footer; stack depth max 2 |
| `Modal` | `size`, `dirty` → `onClose` | Focus-trapped; ≤ 5 fields |
| `DocumentPage` | `DocumentDef`, `id \| draft` | Header, LineGrid, Totals, ViewTabs, SidePanel; right rail = Related + Activity |
| `Workspace` | `steps`, `draftId` → `onFinish` | Saves as draft batch |
| `StudioHost` | `designId`, `envelope` → `onBack` | Mounts existing Konva studio; "Back to record" restores envelope |

### 2.5 Record drawers (all `DrawerDef` configs on one `RecordDrawer`)

`PartyDrawer`, `ItemDrawer`, `AccountDrawer`, `CategoryDrawer`, `TaskDrawer`, `TicketDrawer`, `DiscountDrawer`, `BannerDrawer`, `PopupDrawer`, `CollectionDrawer`, `RecurringDrawer`, `ExpenseDrawer`. One component renders sections/fields from config; custom sections plug in by slot (e.g., Variants grid, Role-specific blocks).

### 2.6 Modals

| Modal | Request type | Endpoint |
|---|---|---|
| `RecordPaymentModal` | `RecordPaymentRequest` | `POST /payments` |
| `SendModal` / `RemindModal` | `{ to, subject, body, attach }` | `POST /documents/{id}/send` |
| `VoidModal` | `{ reason }` | `POST /documents/{id}/void` |
| `RefundModal` | `RefundRequest` | `POST /refunds` |
| `MarkShippedModal` | `ShipRequest` | `POST /orders/{id}/ship` |
| `PrintLabelModal` | `{ service, package }` | `POST /orders/{id}/labels` |
| `CancelOrderModal` | `{ reason, refund, cancelPo }` | `POST /orders/{id}/cancel` |
| `AdjustStockModal` | `{ itemId, locationId, qty, reason }` | `POST /inventory/adjustments` |
| `TransferModal` (stock and money) | `{ from, to, qty \| amount }` | `/inventory/transfers`, `/transfers` |
| `ApproveDeclineReturnModal` | `{ decision, reason, message }` | `POST /returns/{id}/decision` |
| `PushToGlobalModal` | `PushRequest` | `POST /{type}/{id}/push` (handles `DUPLICATE_FOUND`) |
| `ChangeImpactModal` (tier 3) | `ChangePreview` | `POST /{type}/{id}/preview-change` |
| `DiscardChangesModal` | none | client-only |
| `ReportProblemModal` | `{ category, description, files }` | `POST /tickets` (prefilled from order) |

### 2.7 Workspaces

`PayBillsWorkspace`, `ReceivePaymentWorkspace`, `ReconcileWorkspace`, `UploadBillsWorkspace`, `BatchSlipsLabelsWorkspace`. Later: `CycleCountWorkspace`, `SettlementWorkspace`, `RunPayrollWorkspace`.

---

## 3. Interaction Contract (click and unclick)

### 3.1 Gesture table

| Gesture | Target | Behavior |
|---|---|---|
| **Click** | Row body (record list) | Open record in **drawer** (replaces current drawer; dirty guard first) |
| **Click** | Row body (document list) | Navigate to **DocumentPage** |
| **Click** | Row checkbox | Toggle selection only; never opens |
| **Shift-click** | Checkbox | Range select |
| **Click** | Header checkbox | Select all visible; banner offers "Select all N matching" |
| **Click** | Empty table area / **Esc** | Clear selection (the "unclick") |
| **Click** | Pill | `PeekPopover` opens; click again or outside closes |
| **Hover** | Pill (desktop) | Peek after 300 ms intent delay; cancels on leave |
| **⌘/Ctrl-click** | Pill or row | Open in new tab (new envelope from source) |
| **Right-click** | Row | Context menu at cursor. If row is not selected, select **only** it. If row is within a selection, menu acts on the whole selection and shows bulk variants |
| **Click** | Menu item | Runs `surface` or `request`; `confirm` shows `ConfirmDialog` first; menu closes |
| **Click outside** | Menu / popover | Closes it |
| **Click outside** | Drawer | **Does not** close (list stays interactive; prevents data loss) |
| **Click outside** | Modal scrim | Closes only if form is clean |
| **Click** | Column header | Cycle sort: asc → desc → default (the third click is the "unsort") |
| **Click** | Status tab | Filters list; keeps other filters; updates URL |
| **Click** | Same status tab again | No change (tabs are not toggles) |
| **Click** | Filter chip `×` | Removes that filter |
| **Click** | KPI tile | Drills to the target list with filters applied |
| **Click** | Alert pill | Opens its `fix` surface |

### 3.2 Escape priority (one Esc closes one thing)

1. Open popover or context menu
2. Top modal
3. Top drawer (dirty guard)
4. Selection
5. Search input focus

### 3.3 Dirty guard

Any close, replace, tab close, route change or browser back with `dirty = true` opens `DiscardChangesModal`: **Save · Discard · Keep editing**. Dirty = form values differ from the loaded record. Autosave drafts are for DocumentPage only.

### 3.4 Surface stack rules

- Max **depth 2**: base drawer + one child drawer opened from a picker `+ Add new`.
- Child save returns the created record into the parent field and focuses the next field. Child cancel returns focus to the picker.
- Opening a record from a list while a clean drawer is open **replaces** it. While dirty, guard first.
- **Make full page** promotes drawer state into DocumentPage without losing input.
- **Browser back** closes the top surface before navigating.
- **URL sync:** pages use the route; the top drawer is `?surface=party.drawer&id=123&mode=edit`; modals are not in the URL. Reload restores the drawer.
- Each **tab keeps its own stack**. Switching tabs does not close surfaces; closing a tab with dirty surfaces guards.

### 3.5 Save, optimistic updates, undo

| Action class | Strategy |
|---|---|
| Field edits, tags, status toggles, archive | Optimistic; rollback on error; **Undo toast 8 s** |
| Create | Wait for server id, then update list and return focus |
| Money movement, posting, sending, shipping, refunds | **Never optimistic.** Disable button, show progress, send `Idempotency-Key`, handle replay |
| Tier 3 edits | Preview first (`/preview-change`), then confirm |
| Tier 4 (posted/locked) | Fields read-only; menu shows Void / Adjust / Credit memo |

### 3.6 Edit warnings (maps to section 1.9, rule 7)

On entering edit: `GET /{type}/{id}/impact` → render `ExistingRecordBanner` by tier. On save: `PATCH` with `If-Match: version`. On `VERSION_CONFLICT`: show field diff (keep mine / keep theirs / merge). If `meta.lock` is set, show "Maria is editing this" banner and allow edit with warning.

### 3.7 Keyboard (minimum)

`⌘K` palette · `C` create menu · `/` focus search · `J/K` move row focus · `Enter` open · `X` toggle select · `E` edit · `Esc` per 3.2 · `⌘S` save · `⌘Enter` save and close.

---

## 4. API Contract

### 4.1 Conventions

| Topic | Rule |
|---|---|
| Base | `/api/v1`, JSON, auth via session or bearer |
| Resources | Plural nouns: `/parties`, `/items`, `/documents`, `/orders`, `/tickets`... |
| Documents | One family: `/documents?type=invoice`; type-specific rules come from `DocumentDef`, not separate routes |
| Actions | `POST /{resource}/{id}/{verb}` (send, void, ship, cancel, push) |
| Lists | `ListQuery` params; cursor pagination; response `meta.tabCounts` and `meta.summary` so tabs and footers need no extra call |
| Writes | `POST` create, `PATCH` partial update with `If-Match` |
| Idempotency | `Idempotency-Key` required on payments, refunds, sends, ships, posts, payroll |
| Errors | `ApiError` envelope with `code`, `fields`, `requestId` (`contracts.ts` section 10) |
| Permissions | Every record returns `meta.can` and `meta.maskedFields`; server enforces regardless |
| Soft delete | `DELETE` archives; hard delete only for drafts |
| Events | Every state change emits an event (`invoice.paid`, `order.shipped`, `ticket.sla_breached`) for automations, notifications and activity |

### 4.2 Cross-cutting endpoints (build once, used by every module)

| Endpoint | Returns | Used by |
|---|---|---|
| `GET /search?q&types&scope` | `SearchResponse` | Palette, pickers, scoped-to-global search |
| `GET /create-menu?module&tab&record` | `CreateAction[]` | CreateMenu |
| `GET /{type}/{id}/actions?surface` | `MenuAction[]` | Context menu, row `⋯`, headers |
| `GET /peek/{type}/{id}` | `PeekCard` | Pill popovers |
| `GET /{type}/{id}/activity` | `ActivityEntry[]` | ActivityTimeline |
| `GET /{type}/{id}/impact` | `ImpactSummary` | ExistingRecordBanner |
| `POST /{type}/{id}/preview-change` | `ChangePreview` | ChangeImpactModal |
| `POST /{type}/{id}/push` | `PushResult` | PushToGlobalModal |
| `POST /bulk/{type}` | `BulkResult` | BulkBar |
| `GET /nav-counts` | counts by nav key | SideNav badges |
| `GET /dashboard/tiles` | tile values with drill queries | Dashboard |
| `POST /import/jobs` + `/commit` + `/undo` | `ImportJob` | Import hub |
| `POST /export` | job id, then file | Export buttons |
| `POST /files` | `{ id, url }` | AttachmentStrip |

### 4.3 Resource map by module

| Module | List / read | Create / update | Key actions |
|---|---|---|---|
| **Parties** | `GET /parties` (role, segment filters), `/parties/{id}` | `POST/PATCH /parties` | `/archive`, `/roles` (add/remove), `/push`, `/merge` |
| **Items** | `GET /items`, `/items/{id}` | `POST/PATCH /items` | `/publish`, `/reprice`, `/archive`, `/push` |
| **Categories / Collections** | `GET /categories`, `/collections` | `POST/PATCH` | n/a |
| **Documents** | `GET /documents?type=` | `POST/PATCH /documents` | `/send`, `/remind`, `/void`, `/convert`, `/duplicate`, `/pdf`, `/journal-entry` |
| **Payments** | `GET /payments` | `POST /payments` (apply to many) | `/void` |
| **Bills** | `GET /documents?type=bill` | same | `POST /bills/pay` (PayBillsRequest), `/approve`, `/match` |
| **Bank transactions** | `GET /bank-transactions` | n/a (feed) | `/match`, `/categorize`, `/create-from` (expense, transfer, deposit), `/exclude`, `POST /rules` |
| **Reconcile** | `GET /reconciliations/{id}` | `POST /reconciliations` (setup) | `/toggle-line`, `/finish` |
| **Accounts** | `GET /accounts`, `/accounts/{id}/register` | `POST/PATCH` | `/merge`, `/deactivate` |
| **Orders** | `GET /orders`, `/orders/{id}` | `POST /orders` (sales order) | `/ship`, `/labels`, `/cancel`, `/sync-tracking`, `/issues`, `POST /orders/batch-labels` |
| **Refunds / Returns** | `GET /returns` | `POST /returns`, `POST /refunds` | `/decision`, `/receive` |
| **Purchasing** | `GET /documents?type=purchase_order` | same | `/send`, `/receive` (items), `/create-bill` |
| **Inventory** | `GET /inventory`, `/inventory/{itemId}/history` | n/a | `POST /inventory/adjustments`, `/transfers` |
| **Designs / Studio** | `GET /designs`, `/collections` | `POST/PATCH` | `/publish` (creates Items), `/duplicate` |
| **Marketing** | `GET /discounts`, `/banners`, `/popups`, `/posts`, `/campaigns` | `POST/PATCH` | `/pause`, `/schedule`, `/publish` |
| **Support** | `GET /tickets`, `/tickets/{id}/messages` | `POST /tickets`, `POST /tickets/{id}/messages` | `/assign`, `/merge`, `/status`, `/macro` |
| **Tasks** | `GET /tasks` | `POST/PATCH` | `/complete` |
| **Contractors** | `GET /parties?role=contractor` | same | `/w9-invite` |
| **Reports** | `GET /reports/{key}` | n/a | `/schedule`, `/save-view`; rows include `drill` query |
| **Settings** | per page: `/settings/{section}` | `PATCH` | Roles, approvals, bank rules, recurring templates |

**Workspace endpoints** return a draft the client edits: `POST /bills/pay/draft`, `POST /payments/receive/draft`, `POST /reconciliations`. Finish calls the real action with an idempotency key.

### 4.4 Document Engine contract

- `GET /document-defs` returns every `DocumentDef` (cache forever per deploy). The client builds Invoice, Bill, PO, Estimate, Credit memo from these configs.
- Totals are **server-computed**. The client may preview locally but always replaces with `DocumentTotals` from the save response.
- Status changes go through verbs (`/send`, `/void`, `/approve`), never by patching `status`. `INVALID_TRANSITION` is returned if illegal.
- `POST /documents/{id}/convert` handles Estimate → Invoice, Order → Invoice, Bill → Vendor credit and carries relations.

---

## 5. Example Config (Bills list) to show the pattern

```ts
import type { ViewDef } from './contracts';

export const billsView: ViewDef = {
  id: 'bills',
  entity: 'document',
  documentType: 'bill',
  title: 'Bills',
  columns: [
    { id: 'vendor',      label: 'Vendor',       kind: 'party',    sortable: true,  defaultVisible: true },
    { id: 'number',      label: 'Bill no',      kind: 'text',     sortable: true,  defaultVisible: true },
    { id: 'issueDate',   label: 'Bill date',    kind: 'date',     sortable: true,  defaultVisible: true },
    { id: 'dueDate',     label: 'Due date',     kind: 'date',     sortable: true,  defaultVisible: true },
    { id: 'total',       label: 'Bill amount',  kind: 'money',    sortable: true,  defaultVisible: true, align: 'right' },
    { id: 'balanceDue',  label: 'Open balance', kind: 'money',    sortable: true,  defaultVisible: true, align: 'right' },
    { id: 'status',      label: 'Status',       kind: 'status',   sortable: true,  defaultVisible: true },
    { id: 'approval',    label: 'Approval',     kind: 'status',   sortable: false, defaultVisible: true },
    { id: 'source',      label: 'Source',       kind: 'text',     sortable: true,  defaultVisible: false },
  ],
  defaultSort: 'dueDate',
  statusTabs: [
    { id: 'review', label: 'For review', filter: { status: 'for_review' } },
    { id: 'unpaid', label: 'Unpaid',     filter: { status: 'unpaid' } },
    { id: 'paid',   label: 'Paid',       filter: { status: 'paid' } },
  ],
  filters: [
    { id: 'vendor',  label: 'Vendor',    kind: 'party' },
    { id: 'dates',   label: 'Bill date', kind: 'date_range' },
    { id: 'tags',    label: 'Tags',      kind: 'tag' },
  ],
  rowClick: 'document.page',
  bulkActions: ['approve', 'pay', 'categorize', 'tag', 'print_checks'],
  supportsImport: true,
  supportsExport: true,
  totalsFooter: ['sum:amount', 'sum:balance'],
};
```

The same `TableShell` renders Invoices, POs, Orders, Tickets by swapping the config. Row click, right-click, bulk bar, sorts, saved views and pills come with it.

---

## 6. 14-Day Plan: Full Scope, Parallel Lanes

**How it is organized.** Dependencies decide the order, not capacity. Day 1 is a short gate that produces the shared contracts; after it, every lane builds against `contracts.ts` and the config-driven components, so lanes do not wait on each other's screens. Each lane lists its deliverables and what it depends on.

### 6.1 Gate 0 (Day 1): shared foundation

Everything else reads from this. Nothing in the lanes below needs to wait for more than this.

| Item | Output |
|---|---|
| Reconcile `contracts.ts` with the live DB | Run the section 6 queries in `platform-settings-spec.md`; settle Party and Item table mapping (G-14) and decisions D-1 to D-6 |
| Typed API client | Envelope, errors, `Idempotency-Key`, `If-Match`, cursor lists |
| Server Settings/API skeleton | Service-role API (six tables have RLS with no policies), permission guard via `platform_has_permission`, audit write helper |
| Shell skeleton | `AppShell`, tabs, `useSurfaces`, `useEnvelope`, `usePermissions`, URL sync |
| Config schemas locked | `ViewDef`, `DrawerDef`, `DocumentDef`, `MenuAction`, `CreateAction` |

### 6.2 Lanes (run in parallel after Gate 0)

| Lane | Deliverables | Start | Done | Depends on |
|---|---|---|---|---|
| **L1 Shell and navigation** | Tabs with per-tab surface stacks, command palette, context-filtered Create menu (`platform_quick_action_registry`, `platform_create_favorites`), SideNav counts, notifications inbox, sync-status panel, global search | D1 | D4 | Gate 0 |
| **L2 Generic components** | `TableShell`, `Pill` + `PeekPopover`, `ContextMenu` (server `/actions`), `RecordDrawer`, pickers with child-drawer inline create, field components, `AttachmentStrip`, `CapturePanel`, `Workspace` shell, `DocumentEngine` (header, lines, totals, status verbs, view tabs) | D1 | D5 | Gate 0 |
| **L3 Finance** | Invoice, Estimate, Credit memo, Sales receipt, Bill, Expense, Check, Vendor credit; Record payment, Receive payment, Pay bills; Bank transactions + match/categorize/create; Bank rules (new table); Reconcile; Bank deposit; Transfer; Journal entry; Settlement; Chart of Accounts; Periods and period lock; Recurring; Business tax and sales tax engine; Statements | D3 | D11 | L2 (TableShell, DocumentEngine, pickers) |
| **L4 Commerce** | Catalog (items, variants, fulfillment type, categories, bundles, channels); Studio hook-in and publish loop; My Catalog to Global push with dedupe; Orders, order modals, Fulfillment queue, labels, tracking; Returns/RMA; Purchasing (Replenishment PO and Fulfillment PO); Inventory (balances, adjust, transfer, cycle count, stock history); Shipping/carrier settings | D3 | D11 | L2 |
| **L5 Retail, money and people** | POS app (shifts, tender, offline queue, Z report) over `commerce_*` tables; Gift cards over `commerce_gift_cards`; Banking/Cards (Stripe Treasury and Issuing surfaces); Employees, Contractors (W-9, 1099), Time, Payroll run | D4 | D12 | L2; L3 for postings |
| **L6 Growth and Support** | CRM (Parties, leads, segments, tasks); Marketing (banners, popups, discount codes, campaigns, posts, newsletter, automation); Social calendar; Ad Center; Support (three-pane workspace, context sidebar, queues, SLA, routing, escalation, macros, KB, customer portal) | D3 | D12 | L2; L4 for context sidebar actions |
| **L7 Settings** | Roles and permissions, Approvals and limits (with routing contract), Chart of Accounts, Bank rules, Financial settings, Numbering, Tax, Recurring, Integrations, API tokens, Notifications, Data and privacy, Support/SLA pages, Workspace pages, Custom fields, Feature flags | D2 | D10 | Gate 0 server API; L3 for CoA and rules |
| **L8 Cross-cutting** | Activity timeline, Related rail, Existing-record banner (`/impact`, `/preview-change`), undo toasts, soft locks, audit immutability fixes (G-07, G-08), event/outbox wiring, Import hub (`acct_import_jobs`), Export, saved views | D2 | D11 | Gate 0; L2 |
| **L9 Reports and Dashboard** | Report shell with drill-down, all report families, scheduled reports (new tables), dashboard tiles with drill, KPI targets (new table) | D6 | D12 | L3, L4, L6 data |

### 6.3 Integration gates

| Gate | When | Pass condition |
|---|---|---|
| **G1** | End D2 | Shell + surface stack + envelope working; one entity list renders from a `ViewDef`; typed API client talks to the server |
| **G2** | End D5 | Generic components and DocumentEngine done; Party drawer, Item drawer and Invoice work end to end |
| **G3** | End D8 | First cross-module loops live: customer inline-create from invoice, order to invoice to ship, bank match, design to product publish |
| **G4** | End D11 | Every module reachable from nav with real data; every Create action opens its mapped surface; permissions and masking verified by role |
| **Hardening** | D12 to D14 | Six core e2e flows plus per-lane e2e green; dirty guards, Esc order, a11y pass, performance (virtualized lists, hover prefetch), security review of service-role endpoints, RLS and period-lock checks, staging soak, release |

### 6.4 Lane interface rules (what keeps parallel work from colliding)

- **Contracts first.** A lane never reads another lane's code; it reads `contracts.ts` and the endpoint map. Changes to a contract go through one owner and are announced to all lanes.
- **Config over code.** New screens are `ViewDef`, `DrawerDef` and `DocumentDef` entries; a lane only writes custom components for what the generic ones cannot express.
- **One registry.** Surface IDs, action codes and permission codes live in one registry (`platform_quick_action_registry` and `platform_permission_registry` on the data side); lanes add entries, they do not invent parallel lists.
- **Server decides.** Menus, create actions, field masks and `can` flags come from the API, so lanes do not each re-implement permission logic.
- **Seed data.** One shared seed (parties, items, accounts, orders, tickets) so every lane can test against realistic connected data from Day 2.

### 6.5 External gates (dates are set by third parties, not by build capacity)

| Dependency | Why it matters | Action |
|---|---|---|
| Stripe Treasury / Issuing access | Treasury for platforms is request-based and requires Connect on Accounts v2 | Request on Day 1; build Banking/Cards surfaces against a mock until approved |
| Marketplace and carrier API credentials | Channels, labels and tracking need live credentials | Start applications Day 1 |
| Social and ad platform app review | Publishing and ads need approved apps | Start Day 1 |

### 6.6 Core flows to automate (e2e)

(1) add customer inline from invoice, send, record payment; (2) upload bill, approve, pay; (3) bank transaction match, rule apply, reconcile; (4) order, ship, refund; (5) design, publish, push to global; (6) ticket, refund from sidebar, close; (7) POS sale, gift card redeem, shift close with Z report; (8) payroll run posts to ledger.

---

## 7. Definition of Done (per component or screen)

- [ ] Typed against `contracts.ts`; no `any` at API boundaries
- [ ] Loading, empty, error and permission-denied states
- [ ] Right-click menu comes from `/actions` and follows the 8-section order
- [ ] Pills used for every party/item/order/account mention; peek works
- [ ] Create-from-this prefills from the envelope and returns to origin
- [ ] Dirty guard, Esc order and focus return verified
- [ ] Money paths send `Idempotency-Key`; no optimistic UI
- [ ] Masked fields and `can.*` respected; verified with a restricted role
- [ ] Activity entry written with `sourceView`
- [ ] Keyboard reachable; labels and focus rings present

---

# PART C

# Settings Spec: Schema-Grounded

Every statement below was checked against the SQL files you uploaded (`schema_part1`, `part2_tables`, `part3_functions_rls`, hotfix B to E, `rules_engine`, `409a-cap-table`). Where the files are silent, this doc says so instead of guessing.

**Status labels**

| Label | Meaning |
|---|---|
| **BACKED** | Table and columns exist for what the page needs |
| **PARTIAL** | Table exists, but a column, constraint, or enforcement piece is missing |
| **MISSING** | Nothing in the files backs it; needs a new table or a decision |
| **NOT REVIEWED** | Tables exist (names read) but I did not read the columns yet |
| **DECISION** | The schema allows more than one design; you choose |
| **PROPOSED** | My design for something absent; not in the schema |

**Run the queries in section 6 on the live database before trusting any "not found" below.** The uploaded files are the source; the live DB is the truth.

---

## 1. Findings that change how Settings gets built

### 1.1 Roles and permissions

1. **Two role columns, no roles table.** `tenant_memberships.role` allows exactly: `owner, admin, manager, staff, viewer, groomer, front_desk`. `user_tenants.role` allows: `platform_admin, tenant_admin, seller, staff, customer`. There is **no table of custom roles**.
2. **Permission check** is `platform_has_permission(tenant_id, permission_code)`. It returns true if `platform_is_admin()`, or if the caller's `crm_staff` row has a `platform_module_permissions` row for the permission's module (looked up in `platform_permission_registry`) with `access_level IN ('write','full')`.
3. `platform_module_permissions.access_level` is **unconstrained text**. Only `'write'` and `'full'` are read by any function in the files. No other value (for example `read`) is recognized anywhere.
4. `platform_module_permissions.staff_id` joins to **`crm_staff.id`**, not to a user id. A teammate needs a `crm_staff` row to hold module access.
5. **Field-level visibility is backed:** `platform_form_field_visibility(tenant_id, form_key, field_key, role_code, is_visible)`.
6. There is **no link** between `platform_quick_action_registry.action_code` (the Create menu registry) and `platform_permission_registry.permission_code`. The Create menu cannot be permission-filtered from data alone today.

### 1.2 Row-level security (affects every Settings API)

7. Two RLS patterns are in use: **(a)** `platform_is_tenant_member(tenant_id)` (any active member passes); **(b)** `tenant_id = current_setting('app.current_tenant_id')` on `acct_chart_of_accounts`, `acct_bank_transactions`, `acct_periods`, `platform_module_permissions`. Neither pattern checks a role or permission.
8. **RLS is enabled with zero policies** (deny-all for non-service-role clients) on: `tenant_settings`, `integration_keys`, `api_keys`, `policy_settings`, `app_settings`, `platform_feature_flags`. These tables are reachable only through a **server-side service-role API**. The Settings API must be server-side; the browser cannot query them directly.
9. `acct_workflows` and `acct_ap_approvals` have four policies each, all gated by membership only. Any active member could change approval rules at the database level; the API must enforce who can.

### 1.3 Ledger integrity and audit

10. `acct_audit_log` has `entry_hash` and `prev_hash` columns (hash-chain shape), but its policies allow **UPDATE and DELETE** to any tenant member.
11. The functions `acct_audit_row_change` and `acct_block_posted_mutation` exist, but **I found no `CREATE TRIGGER` that attaches them** in the uploaded files. They may be attached in the live DB; verify (query 6.1).
12. `acct_post_journal` checks tenant membership, book ownership and debit = credit. **I found no check that the target `acct_periods.status` is open.** `acct_periods.status` is plain text; the `acct_period_status` enum (`future, open, soft_closed, closed, locked`) exists but the column does not use it.

### 1.4 Rules that have no storage

13. **No bank rules table exists.** `acct_bank_transactions` has `match_status text NOT NULL` (no CHECK, values undefined) and **no category or account column**; the only link is `matched_journal_line_id`.
14. **No approval evaluation function exists.** `acct_workflows`, `acct_workflow_instances`, `acct_workflow_actions` and `acct_ap_approvals` are tables only. Something outside the database must route and advance approvals.
15. **No per-user or per-role spend/payment limit** is stored anywhere. `acct_workflows.threshold_amount` is the only amount field.
16. **No recurring bill/expense table.** Recurring exists for invoices (`acct_recurring_invoices`, plus a second pair `recurring_invoices` / `recurring_invoice_items`) and journals (`acct_recurring_journals`).

### 1.5 Scatter

17. **Four generic settings stores:** `tenant_settings(tenant_id, section, data jsonb)`, `policy_settings(tenant_id, scope, key, value text)`, `app_settings(key, value jsonb)` (**not tenant-scoped**), and `tenants.settings jsonb`. `tenant_settings.section` has no CHECK.
18. **Five tax structures:** `acct_tax_jurisdictions` + `acct_tax_codes` (effective dates, compound, recoverable %, payable/receivable accounts), `acct_tax_rates`, `acct_tax_rules` (**hard-coded default `state_code = 'TN'`**), `taxes` (simple), `commerce_sale_taxes`. No tax-category or tax-exempt column was found on `products`, `product_variants`, `orders`, `order_items` or `crm_customers`.
19. **Vendors live in four tables:** `acct_vendors`, `erp_vendors`, `vendors`, plus `suppliers` and `commerce_suppliers`. Customers: `crm_customers` (`customer_type`, `lifecycle_status`), `commerce_customer_accounts`, `portal_customer_accounts`. Products: `products` (canonical per hotfix E), `commerce_products`, `erp_products`, `commerce_catalog_items`. Orders: `orders`, `commerce_orders`, `erp_orders`. **The Party and Item entities in `contracts.ts` need an explicit mapping layer** (see section 4, G-14).
20. **Leftover vertical fields:** roles `groomer` and `front_desk`; feature-flag audience `vet`; `crm_settings` columns `vaccine_reminder_enabled`, `birthday_campaign_enabled`, `station_turnaround_buffer_minutes`; tables `jurisdiction_rules` (telemedicine) and `state_rules`. Do not surface these in Settings.

### 1.6 Already in the schema (use these, do not rebuild)

| Need | Existing backing |
|---|---|
| Import hub | `acct_import_jobs` (entity_type, status, total/processed/success/error rows, `error_report_uri`) |
| Export | `commerce_export_jobs`, `analytics_export_runs` |
| Idempotency | `acct_integration_idempotency`, `erp_idempotency_keys`, `crm_idempotency_keys`, `commerce_idempotency` |
| Event layer | `commerce_outbox_events`, `social_outbox_events`, outbox triggers (`outbox_emit`) |
| Create menu registry | `platform_quick_action_registry` (action_code, module, display_name, api_route) and `platform_create_favorites` (per user) |
| Saved views | `platform_saved_views`, `crm_saved_views` |
| State machines | `platform_objects.state_machine`, `platform_lenses.transitions`, `platform_workflow_transition_validation` |
| Gift cards | `commerce_gift_cards`, `commerce_gift_card_transactions`, `commerce_gift_card_designs` |
| POS-adjacent | `commerce_branches`, `commerce_cash_movements`, `commerce_receipts`, `commerce_deposits` (NOT REVIEWED) |
| Budgets | `acct_budget_versions`, `acct_budget_lines` |
| FX | `acct_exchange_rates`, `acct_fx_revaluation_runs` |
| Document numbering | `erp_document_sequences` + `erp_next_document_number()` |
| Doc concurrency | `row_version` columns on support rule/SLA/macro tables |
| Backups | `platform_backups`, `tenants.backup_addon_enabled` |

---

## 2. Which Settings drive behavior elsewhere

| Setting | Backing | Read by | Effect on the rest of the platform |
|---|---|---|---|
| Roles and permissions | `tenant_memberships`, `platform_module_permissions`, `platform_permission_registry`, `platform_form_field_visibility` | Every API call, Create menu, right-click menus, field masking | Decides `meta.can`, `maskedFields`, visible Create actions |
| Approvals and limits | `acct_workflows` (+ instances/actions), `acct_ap_approvals` | Bills, POs, payments | Puts documents into `pending_approval`; "Approve to Unpaid"; blocks Pay bills until approved |
| Chart of Accounts | `acct_chart_of_accounts` (+ `acct_account_dimension_rules`) | Account picker, Journal, Bills/Expenses lines, Reconcile, Tax, Reports | Which accounts can be posted to, reconciled, required to carry dimensions |
| Bank rules | MISSING | Bank transactions | Auto-categorize, auto-match, exclude |
| Financial settings (periods, books, entities) | `acct_periods`, `acct_fiscal_years`, `acct_books`, `acct_entities` | Posting, Reports, entity switcher | Period locks, fiscal year, multi-entity scope |
| Document numbering | `erp_document_sequences` | Every Document Engine save | Number format for new documents |
| Business tax | `acct_tax_*` | Invoices, Orders, Tax summary | Tax lines and liability |
| Recurring templates | `acct_recurring_invoices`, `acct_recurring_journals` | "Make recurring" on Invoice | Scheduled drafts or sends |
| Integrations / API tokens | `integration_keys`, `integration_secrets`, `api_keys`, `platform_integration_health_registry`, `tenant_stripe_accounts` | Payments, channels, sync pill | Sync status, connect/disconnect, payouts |
| Notifications | `user_notifications`, `support_notification_prefs`, `seller_notification_preferences` | Notification inbox | What reaches the user and how |
| Support SLA / routing | `support_sla_policies`, `support_routing_rules`, `support_escalation_rules`, `support_business_hours` | Tickets | SLA timers, routing, escalation |
| Feature flags | `platform_feature_flags` | Shell and nav | Hides modules behind flags (the 14-day cut line) |
| Custom fields / field visibility | `platform_custom_fields`, `platform_form_field_visibility` | Drawers and Document Engine | Extra fields; per-role field hiding |

---

## 3. Page-by-page spec

**Pattern for every Settings page:** left nav group → page header (title + one-line purpose + Import/Export where relevant) → **cards** (one card per setting group) → inline edit for simple fields, **drawer** for records, **modal** for destructive/confirm. Every save writes an audit entry and shows the Existing Record banner when the setting is shared (tier rules from the component map).

### 3.1 Priority pages (full spec)

#### Roles and permissions: BACKED / PARTIAL

| Tab | Surface | Fields and columns | Notes |
|---|---|---|---|
| **People** (this is also *Teammates*) | List + drawer | `tenant_memberships`: user, `invited_email`, `role`, `status`, `active`, `last_active_at`, `mfa_enabled`, `mfa_method` | Invite sets `invited_email`, `invite_token_hash`, `invite_sent_at`, `invite_expires_at`. Deactivate sets `active = false`. Reset MFA sets `mfa_reset_requested_at`, `mfa_reset_by`. |
| **Roles** | Read-only reference + role picker | Seven fixed roles from the CHECK constraint | **DECISION:** hide `groomer`, `front_desk` (finding 20) |
| **Module access** | Matrix | Rows = staff (`crm_staff`), columns = distinct `platform_permission_registry.module`, cell = `access_level` | Only `write` and `full` are enforced (finding 3). Save upserts `platform_module_permissions` with `granted_by`, `granted_at`. |
| **Field visibility** | List | `platform_form_field_visibility`: form, field, role, visible | Drives `maskedFields` |
| **Permission registry** | Read-only list | `permission_code`, `module`, `description` | Owner/admin view |

Row actions (right-click): Change role · Resend invite · Reset MFA · Deactivate · Copy invite link.
**Gaps:** custom roles (G-01), read-only level (G-02), Create-menu-to-permission link (G-03), staff without `crm_staff` row (finding 4).

#### Approvals and limits: PARTIAL

| Section | Surface | Fields | Backing |
|---|---|---|---|
| **Approval workflows** | List + drawer | Name, Applies to (`entity_type`), Threshold amount, Steps (`rules` jsonb), Active | `acct_workflows` |
| **Pending approvals** (runtime) | Queue (also the Notifications inbox action) | Entity, amount, requester, current step, status | `acct_workflow_instances` (`status`: pending / approved / rejected / cancelled; `current_step`) |
| **Approval history** | On each record's Activity | Step, approver, action, comments, time | `acct_workflow_actions` |
| **Bill and PO approvals** | Same queue, filtered | Approver, sequence, status | `acct_ap_approvals` |
| **Limits** | Card | Per-role or per-user limits | **MISSING** (finding 15) |

**What the UI cannot do yet:** `rules` has no defined JSON shape, `entity_type` is free text, and no function routes approvals (finding 14).
**DECISION D-1:** two parallel mechanisms (`acct_workflows` generic vs `acct_ap_approvals` bill/PO-specific). One must be the source of truth; the other becomes a projection.
**Enforcement contract (server):** on submit, find active workflow for `entity_type` where amount ≥ `threshold_amount` → create instance → set document status `pending_approval` → on each action write `acct_workflow_actions` and advance `current_step` → on final step mark `approved` and set status `approved` → notify next approver via `user_notifications`.
Document statuses available: `acct_document_status` includes `pending_approval, approved, rejected`. The older `bill_status` enum does **not**; which one the bills table uses must be verified (query 6.5).

**Cross-module surfaces fed by this page:** "Approve to Unpaid" and "Setup Bill Approval" in Expenses & Bills, Pay bills "Approval" column, Notification inbox approve-in-place.

#### Chart of Accounts: BACKED (one contract fix needed)

| Item | Spec |
|---|---|
| **List columns** | Code · Name · Type · Subtype · Normal balance · Parent (tree) · Currency · Flags pills (System, Control, Reconcilable, No posting) · Active · Balance (derived from journal lines, not a column) |
| **Scope** | Rows belong to an `entity_id` (multi-entity): entity switcher filters the list |
| **Drawer fields** | Entity · Code · Name · Type · Normal balance (auto from type) · Subtype · Parent account · Description · Currency · `is_posting_allowed` · `is_reconcilable` · `is_control_account` · Active |
| **Dimension rules section** | `acct_account_dimension_rules`: dimension (`acct_dimensions`), `is_required`, `allowed_values` |
| **Rules the UI enforces** | `is_system` rows: no delete, no type change. `is_posting_allowed = false`: excluded from Account picker. `is_reconcilable = true`: appears in Reconcile account list. |
| **Right-click** | View register · Edit · Add child · Run report · Make inactive · (Merge: no backing) |
| **Picked up elsewhere** | `products.income_account_id` / `cogs_account_id` (hotfix E), `acct_bank_accounts.gl_account_id`, `acct_tax_codes.payable_account_id` / `receivable_account_id`, `commerce_accounting_mappings` (NOT REVIEWED) |

**Contract fix required:** `acct_chart_of_accounts.account_type` is text; the existing `acct_account_type` enum values are `asset, liability, equity, revenue, expense, contra_asset, contra_liability, contra_equity, statistical`. The older enum `account_type` uses `income`. `contracts.ts` currently says `income` and `cogs`; there is **no `cogs` type** in either enum (COGS must be a `subtype`). **DECISION D-2:** confirm the allowed `account_type` values (query 6.4).
**DECISION D-3:** what `is_control_account` blocks (manual journal posting is the usual meaning; the schema does not say).
**Not backed:** Merge accounts, Cleanup, Accounts wizard (UI-only workflows over the same table; define behavior before building).

#### Bank rules: MISSING

**Why it matters:** the Bank transactions screen (match / categorize / create) depends on rules, and nothing stores them. `acct_bank_transactions` has no category column, so "categorize" must mean **post a journal entry and set `matched_journal_line_id`**.

**PROPOSED table (not in schema):**

```sql
create table acct_bank_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  entity_id uuid not null,
  name text not null,
  priority int not null default 100,
  bank_account_id uuid references acct_bank_accounts(id),  -- null = all accounts
  conditions jsonb not null default '{}',   -- same all/any/not shape as rules_engine.sql
  action jsonb not null,                    -- {type: categorize|match|exclude|transfer, account_id, payee, tag_ids, auto_post}
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- match_status needs a defined set, e.g.: unmatched | suggested | matched | categorized | excluded
```

**Reuse the pattern already in `rules_engine.sql`:** JSON conditions compiled by an allow-listed function (`rule_where`) plus `preview_rule` (count + sample, no writes). `rule_where` is hard-wired to `product_facts` fields, so bank rules need their own facts view (`bank_txn_facts`: description, payee, amount, direction, bank account) and a separate allow-list.

**Page spec**

| Element | Spec |
|---|---|
| List | Priority (drag to reorder) · Name · Applies to account · Condition summary · Action summary · Matches last 30 days · Active · ⋯ |
| Drawer | Name · Bank account scope · Condition builder (description contains, payee equals, amount between, money in/out) · Action (Categorize to Account picker, set payee, add tags, mark transfer, exclude) · **Auto-apply** vs **Suggest only** |
| **Preview** | Live count + sample of existing transactions it would touch (mirrors `preview_rule`) |
| **Apply to existing** | Modal: dry run → confirm → undo (mirrors `apply_bulk` / `undo_bulk` in `rules_engine.sql`) |
| Entry points | "Create rule from this" in the Bank transactions right-click; Accounting setup checklist item "Set up bank rules" |
| Cross-module | Targets the Account picker; sets tags; writes journal via `acct_post_journal` with `source = 'bank'` |

### 3.2 Workspace group

| Page | Surface | Fields → backing | Status | Drives / notes |
|---|---|---|---|---|
| **Home** | Settings landing | Setup progress, shortcuts | n/a | UI only |
| **General** | Cards | `tenants`: `name`, `legal_name`, `dba_name`, `tax_id`, `default_currency`, `support_email`, `support_phone`, `website_url`, `slug`; locations: `tenant_locations` (name, address, timezone, is_primary) | BACKED | Currency and timezone defaults for all new records |
| **Teammates** | See Roles and permissions → People | `tenant_memberships` | BACKED | Same page, one source |
| **External access** | List + drawer | `portal_users`, `portal_module_permissions` (module_key, permission_level), `portal_action_permissions` (action_key, is_allowed), `portal_permission_audit_log` | PARTIAL | Portal users (customers/sellers) have a separate permission model from staff. **DECISION D-4:** confirm this is what "External access" means |
| **Approvals and limits** | Section 3.1 | | PARTIAL | |
| **Workspace owners** | List | `tenant_memberships` where `role = 'owner'`; `platform_admins` (platform-level) | BACKED | Ownership transfer flow has no function; define |
| **Office hours** | List + drawer | `support_business_hours` (name, timezone, `schedule`, is_default), `support_holidays`, `crm_operating_hours`, `location_hours`, `location_hour_exceptions` | PARTIAL | Four overlapping hour tables. **DECISION D-5:** one canonical source; SLA policies reference `support_business_hours` |
| **Brands** | List + drawer | `brands`, `brand_profiles`, `brand_placements`, `commerce_brands`, `tenants` branding columns (`logo_url`, `logo_dark_url`, `favicon_url`, `primary_color`, `secondary_color`, `accent_color`, `brand_font`) | NOT REVIEWED (`brands`) | Two brand structures exist (tenant branding vs `brands` table) |
| **Security** | Cards | MFA state: `tenant_memberships.mfa_*`; session/device: `user_workspace_sessions`; login activity: `seller_login_activity` (seller side) | PARTIAL | Workspace-wide MFA enforcement setting: no column found |
| **Activity log** | List (read-only) | `acct_audit_log` (actor, action, table, record, before/after, ip, user agent), plus `commerce_audit_log`, `erp_audit_log`, `crm_audit_log`, `cms_audit_log`, `platform_admin_access_log` | PARTIAL | Five audit tables, no unified view. Tamper-evidence not enforced (findings 10, 11) |
| **Multilingual** | List + drawer | `cms_locales` (`locale_code`, `language`, `currency_code`, symbol/position, `status`, `is_default`, `sort_order`) | BACKED | Storefront locales only; no app-UI translation table found |

### 3.3 Accounting and Finance group

| Page | Surface | Fields → backing | Status | Drives / notes |
|---|---|---|---|---|
| **Chart of Accounts** | Section 3.1 | | BACKED | |
| **Bank rules** | Section 3.1 | | MISSING | |
| **Recurring templates** | List + drawer | Invoices: `acct_recurring_invoices` (name, `frequency`, `interval_count`, `starts_on`, `ends_on`, `next_run_on`, `occurrences_limit`, `auto_send`, `auto_charge`, `payment_method_id`, `lines`, `status`). Journals: `acct_recurring_journals` (name, `frequency`, `interval_n`, `next_run_date`, `end_date`, `active`, `template`) | PARTIAL | Bills/expenses: no table (finding 16). Invoice table has duplicate date columns (`next_run_date` and `next_run_on`, `end_date` and `ends_on`); pick one |
| **Business tax** | Tabs: Jurisdictions · Codes and rates · Filings · Exemptions | `acct_tax_jurisdictions` (code, name, country, state, locality, registration number), `acct_tax_codes` (rate, `recoverable_percent`, payable/receivable accounts, `effective_from/to`, `is_compound`), `acct_tax_filings` (period, taxable sales, collected, remitted, status, `confirmation_ref`), `seller_tax_exemptions` | PARTIAL | **DECISION D-6:** make `acct_tax_codes` + `acct_tax_jurisdictions` canonical; retire or map `acct_tax_rules` (default `'TN'`), `acct_tax_rates`, `taxes`. Missing: per-item tax category, per-customer exemption (finding 18) |
| **Reports and budgets** | List + grid | `acct_budget_versions` (name, fiscal year, version, scenario, status, approved by/at), `acct_budget_lines` (period, account, amount, dimensions) | BACKED | Report templates: see Reports group |
| **Financial settings** | Cards | Entities `acct_entities` (legal name, `functional_currency`, `reporting_currency`, `fiscal_year_start_month`), books `acct_books` (type, basis, currency, primary), fiscal years `acct_fiscal_years`, **periods** `acct_periods` (status), FX `acct_exchange_rates`, dimensions `acct_dimensions`, numbering `erp_document_sequences` (prefix, next number, padding) | PARTIAL | **Period lock is the setting that matters most**; enforcement is not in `acct_post_journal` (finding 12). Numbering default prefix is `UPPER(LEFT(type,3)) || '-'`, padding 6 |

### 3.4 CRM and Contacts group

| Page | Surface | Fields → backing | Status | Notes |
|---|---|---|---|---|
| **Customer hub** | Cards | `crm_settings` (default timezone, currency, communication defaults), `crm_customer_tags`, `crm_communication_preferences` | PARTIAL | `crm_settings` mixes in leftover vertical fields (finding 20) |
| **Vendors and suppliers** | Cards | Default terms, 1099 flag: columns exist on `erp_vendors` (`tax_identifier`) and `vendors` (`payment_terms`) | PARTIAL | Four vendor tables (finding 19); this page cannot be finalized until the Party mapping decision (G-14) |
| **Segments and lists** | List + rule drawer | `crm_segments`, `crm_segment_memberships`, `cms_audience_segments` | NOT REVIEWED | Two segment systems; marketing audience uses one of them |
| **Lead capture forms** | List + drawer | `crm_lead_sources`, `support_forms` | NOT REVIEWED | No dedicated lead-form table found; confirm |

### 3.5 Catalog and Design group

| Page | Surface | Fields → backing | Status | Notes |
|---|---|---|---|---|
| **Design Studio** | Cards | `product_canvas_templates`, `supplier_mockup_templates`, `supplier_print_specs`, `design_*` (3 tables) | NOT REVIEWED | |
| **Products and bundles** | Cards | Defaults, lifecycle/season rules: `rules_engine.sql` (`season_windows`, `categories.default_seasons`, `saved_views`, `bulk_jobs`) | BACKED | **Season windows page:** edit `season_windows` (start/end month/day, wraps year end). **Work queues:** `saved_views` (is_queue) with `queue_counts()`. Functions are locked to admin/service role: server API only |
| **Pricing and discounts** | Lists | `commerce_price_lists`, `commerce_prices`, `commerce_promotions`, `commerce_coupons`, `crm_pricing_rules`, `cms_offers`, `cms_volume_tiers`, `cms_bundle_rules` | NOT REVIEWED | Three overlapping discount systems (commerce / crm / cms); choose canonical |
| **Categories and tags** | Tree + drawer | `categories` (`default_seasons`), `taxonomy_nodes`, `commerce_categories`, `erp_product_categories`, `commerce_product_tags`, `crm_tags` | NOT REVIEWED | Multiple category structures; `taxonomy_nodes` appears to drive brand placement |

### 3.6 Marketing and Social, Website/CMS

| Page | Fields → backing | Status |
|---|---|---|
| **Social channels** | `social_accounts`, `social_oauth_tokens`, `social_platform_apps`, `social_platform_capabilities` | NOT REVIEWED |
| **Publishing queue** | `social_schedule_slots`, `social_post_series`, `social_publish_attempts` | NOT REVIEWED |
| **Newsletter and email** | `newsletter`, `newsletter_subscribers`, `crm_message_templates`, `seller_email_templates` | NOT REVIEWED |
| **Ad center** | `ad_accounts`, `ad_advertisers`, `ad_tiers`, `ad_rate_cards`, `ad_budget_tiers`, `ad_placements`, `ad_audiences` | NOT REVIEWED |
| **Google My Business** | No GMB table found. `google_*` tables are GA4, Search Console, Merchant sync, indexing | **MISSING** |
| **Website / CMS** | `cms_website_settings`, `cms_navigation_menus`, `cms_global_copy`, `cms_design_tokens`, `cms_redirects`, `cms_seo`, `cms_cdn_profiles` | NOT REVIEWED |
| **Banners / Popups / Pages / Blocks** | `cms_banners`, `cms_slots`, `cms_slot_items`, `cms_pages`, `cms_page_revisions`, `cms_content_blocks`, `cms_block_schemas`; no popup table found | PARTIAL (popups MISSING) |

### 3.7 Operations and Orders, Support

| Page | Fields → backing | Status | Notes |
|---|---|---|---|
| **Fulfillment and shipping** | `erp_carriers` (code, name, `api_provider`, active), `erp_shipping_methods` (carrier, code, `service_level`), `shipping_profiles`, `supplier_fulfillment_locations` | BACKED / PARTIAL | Carrier row actions (Test rates, Manage services, Disable carrier): `is_active` covers disable; test-rates has no storage (API call) |
| **Inventory and warehouses** | `erp_warehouses` (type, address, timezone, links to `commerce_branch_id` and `crm_location_id`), `erp_warehouse_zones`, `erp_warehouse_locations`, `erp_replenishment_rules` (method, reorder point, safety stock, max, EOQ, lead time, preferred vendor), `seller_inventory_settings`, `erp_uom_conversions` | BACKED | Replenishment rules drive reorder alerts and Replenishment POs. `fulfillment type` per item: **no column found** (G-12) |
| **Support channels** | `support_channels`, `support_channel_threads` | NOT REVIEWED | |
| **Help center / Knowledge base** | `support_kb_articles`; no help-center site-config table found | PARTIAL | |
| **Outbound** | `support_webhooks_outbound`, `support_webhook_deliveries`, `seller_webhooks`, `social_webhook_endpoints` | BACKED | |
| **Ticket channels** | `support_channels`, `support_forms` | NOT REVIEWED | |
| **SLA policies** | `support_sla_policies` (`first_response_minutes`, `next_reply_minutes`, `resolution_minutes`, `uses_business_hours`, `business_hours_id`, `is_default`, `is_active`, `row_version`) | BACKED | Uses `scope`, `inherits_from_id`, `locked_by_master`: platform-level defaults that tenants inherit but cannot override when locked. UI must show a "Locked by platform" pill |
| **Automation rules** | `support_routing_rules` (conditions, `strategy`, target team/staff, `set_priority`, `set_tags`, `sla_policy_id`, `rule_order`), `support_escalation_rules` (trigger, condition, action), `support_automations`, `support_macros` (`actions`) | BACKED | Same scope/inheritance model |
| **Templates** | `support_templates`, `support_canned_replies`, `support_signatures` | NOT REVIEWED | |

### 3.8 Dashboard, Suppliers, Reports, System

| Page | Fields → backing | Status | Notes |
|---|---|---|---|
| **Dashboards and widgets** | `platform_lenses` (lens, object, audience, `surface_default`, `transitions`), `platform_lens_fields`, `platform_saved_views` | PARTIAL | No dashboard or widget table found |
| **KPI targets** | No table found | **MISSING** | |
| **Analytics configuration** | `analytics_export_runs`; `google_ga4_*` | NOT REVIEWED | |
| **Supplier portal / Integration feeds** | `supplier_imports`, `supplier_import_items`, `supplier_catalog_*`, `supplier_category_mapping`, `supplier_category_visibility`, `supplier_product_mappings` | NOT REVIEWED | `supplier_category_memory` / `supplier_category_visibility` have no RLS and hotfix B left them alone pending your intent |
| **Contracts and pricing** | `supplier_product_costs`, `acct_revenue_contracts` (revenue side) | PARTIAL | No supplier contract table found |
| **Compliance and 1099** | `seller_1099k_generations`, `acct_payroll_tax_forms`, `payroll_tax_forms`, `erp_vendors.tax_identifier` | PARTIAL | No contractor W-9 status table found |
| **Report templates / Scheduled reports / Report dashboards** | `acct_expense_reports` (expense reports, not report templates), `support_report_daily`, `analytics_export_runs` | **MISSING** | No saved report template, schedule or dashboard table found |
| **Integrations** | `integration_keys`, `integration_secrets` (service, category, label, `last_four`, `is_set`), `platform_integration_health_registry` (status, last checked/success, last error, latency, consecutive failures), `tenant_stripe_accounts`, `tenant_wordpress_connections`, `cms_integrations` | BACKED | Health registry feeds the **Sync status** panel from the sidebar. Never return secret values; return `last_four` and `is_set` |
| **Data and privacy** | Import hub: `acct_import_jobs`; Export: `commerce_export_jobs`; Backups: `platform_backups`; privacy: `social_data_deletion_requests`, `seller_data_processing`, `seller_dpa_acceptances`, `customer_ai_disclosure_acks`, `cms_policy_acceptances` | PARTIAL | |
| **Notifications** | `user_notifications` (type, title, body, priority, `is_read`, `action_url`); preferences: `support_notification_prefs`, `seller_notification_preferences`, `crm_settings.notification_frequency` | PARTIAL | No single per-user preference table for the platform |
| **API tokens** | `api_keys` (label, `key_prefix`, `key_hash`, `tier`, `status`, `last_used_at`, `revoked_at`) | BACKED | Only prefix shown after creation; full key shown once |
| **Audit log** | See Activity log | PARTIAL | |
| **Feature flags** (platform admin) | `platform_feature_flags` (audience, `flag_key`, enabled) | BACKED | Audience values: seller, customer, employee, vet, global |
| **Custom fields** | `platform_custom_fields` (entity_type, `field_key`, label, `field_type`, options, required, sort); `tenant_id` null = global defaults | BACKED | Rendered by the drawer engine as extra fields |

---

## 4. Gap Register

| ID | Gap | Fact in schema | Needed |
|---|---|---|---|
| G-01 | No custom roles | Roles are a 7-value CHECK | **DECISION:** keep fixed roles + per-module access, or add a roles table |
| G-02 | No read-only module level | Only `write`/`full` are read | Define the `access_level` set and constraint |
| G-03 | Create menu not permission-linked | `platform_quick_action_registry` has no permission column | Add `permission_code` or a mapping |
| G-04 | Bank rules | No table | Create `acct_bank_rules` (section 3.1) and define `match_status` values |
| G-05 | Approval routing | Tables only, no function | Server-side routing contract (section 3.1) |
| G-06 | Spend/payment limits | No storage | Table or `rules` JSON shape |
| G-07 | Period lock enforcement | `acct_post_journal` has no period-status check; column is text | Guard in posting function; use the enum |
| G-08 | Audit immutability | Policies allow UPDATE/DELETE; triggers not found | Verify triggers; restrict audit policies |
| G-09 | Recurring bills/expenses | No table | Table or generalize templates |
| G-10 | Tax canonical model | Five structures, `'TN'` default | **DECISION D-6**; per-item tax category; per-customer exemption |
| G-11 | Zero-policy tables | RLS on, no policies (finding 8) | Server-only Settings API (this is intended; document it) |
| G-12 | `fulfillment_type` on items | No column found on `products` | Add column (Stock / POD / Supplier-fulfilled / Digital / Service / Bundle) |
| G-13 | Missing pages' storage | KPI targets, report templates/schedules, dashboards, GMB, popups | New tables or defer behind flags |
| G-14 | Party and Item entity mapping | Customers, vendors, suppliers and products each span several tables | **DECISION:** which tables are canonical for `Party` and `Item` in `contracts.ts`, or a view that unions them |
| G-15 | Four settings stores | `tenant_settings`, `policy_settings`, `app_settings`, `tenants.settings` | **DECISION:** which store each page uses (suggested rule: relational enforcement needs a typed table; page-level preferences go to `tenant_settings.section`) |
| G-16 | Leftover vertical fields | `groomer`, `front_desk`, `vet`, vaccine/birthday columns | Hide from UI; plan removal |
| G-17 | `contracts.ts` mismatches | Account type `income`/`cogs`, Party roles, Document types vs `acct_source_type` | Reconcile after G-14 |

---

## 5. Settings API Contract

All Settings reads and writes go through the server (finding 8). Conventions match the build spec.

| Endpoint | Purpose | Backing |
|---|---|---|
| `GET /settings` | Page index with status, permission, and completion | registry in code |
| `GET /settings/{section}` / `PATCH /settings/{section}` | Section-style pages | `tenant_settings(tenant_id, section)`; `PATCH` carries `If-Match` on `updated_at` |
| `GET/POST/PATCH /team/members` | People tab | `tenant_memberships` |
| `POST /team/members/{id}/invite` · `/reset-mfa` · `/deactivate` | Row actions | same |
| `GET/PUT /permissions/modules` | Matrix | `platform_module_permissions`, `platform_permission_registry` |
| `GET/PUT /permissions/field-visibility` | Field masking | `platform_form_field_visibility` |
| `GET/POST/PATCH /approvals/workflows` | Workflow definitions | `acct_workflows` |
| `GET /approvals/queue` · `POST /approvals/{instanceId}/act` | Runtime | `acct_workflow_instances`, `acct_workflow_actions`, `acct_ap_approvals` |
| `GET/POST/PATCH /accounts` (+ `/accounts/{id}/register`) | Chart of Accounts | `acct_chart_of_accounts`, `acct_account_dimension_rules` |
| `GET/POST/PATCH/DELETE /bank-rules` · `POST /bank-rules/preview` · `POST /bank-rules/apply` · `POST /bank-rules/apply/{jobId}/undo` | Bank rules (after G-04) | `acct_bank_rules`, journal posting |
| `GET/PATCH /finance/periods` · `POST /finance/periods/{id}/close` | Period control | `acct_periods` (after G-07) |
| `GET/PATCH /finance/numbering` | Numbering | `erp_document_sequences` |
| `GET/POST/PATCH /tax/jurisdictions` · `/tax/codes` · `/tax/filings` | Business tax | `acct_tax_*` (after D-6) |
| `GET/POST/PATCH /recurring/invoices` · `/recurring/journals` | Recurring templates | `acct_recurring_*` |
| `GET/POST /integrations` · `POST /integrations/{code}/connect` · `/disconnect` · `/test` | Integrations | `integration_keys` / `integration_secrets` / health registry (never return values) |
| `GET/POST/DELETE /api-keys` | API tokens | `api_keys` |
| `GET /audit` | Unified activity log | union of audit tables (read-only) |
| `GET/POST /import/jobs` | Import hub | `acct_import_jobs` |
| `GET /sync-status` | Sidebar sync panel | `platform_integration_health_registry` |

**Permission codes:** every endpoint is guarded by a `settings.*` code in `platform_permission_registry`, resolved by `platform_has_permission`. Money-affecting and structure-affecting settings (approvals, period close, CoA type change, API keys, roles) are `risk = 'money'` or `'irreversible'` in `platform_capabilities` terms and always write an audit entry.

---

## 6. Verification Queries (run on the live database)

```sql
-- 6.1 Are the audit and posted-entry guards actually attached?
select tgname, tgrelid::regclass as on_table, tgfoid::regproc as fn
from pg_trigger
where not tgisinternal
  and tgfoid::regproc::text in ('acct_audit_row_change','acct_block_posted_mutation');

-- 6.2 Is there any bank-rule-like table I missed?
select table_name from information_schema.tables
where table_schema='public' and (table_name ilike '%bank%rule%' or table_name ilike '%categor%rule%');

-- 6.3 Distinct access levels and registry modules in use
select access_level, count(*) from platform_module_permissions group by 1;
select module, count(*) from platform_permission_registry group by 1 order by 1;

-- 6.4 Actual account types in use (settles D-2)
select account_type, subtype, count(*) from acct_chart_of_accounts group by 1,2 order by 1,2;

-- 6.5 Which status set do bills use? (bill_status vs acct_document_status)
select column_name, udt_name from information_schema.columns
where table_schema='public' and table_name in ('acct_bills','bills','acct_vendor_bills')
  and column_name = 'status';

-- 6.6 Which tax tables actually hold rows (settles D-6)
select 'acct_tax_codes' t, count(*) from acct_tax_codes
union all select 'acct_tax_rates', count(*) from acct_tax_rates
union all select 'acct_tax_rules', count(*) from acct_tax_rules
union all select 'taxes', count(*) from taxes;

-- 6.7 Period status values in use and whether posting has ever hit a non-open period
select status, count(*) from acct_periods group by 1;

-- 6.8 Which vendor/customer/product tables actually hold rows (settles G-14)
select 'acct_vendors' t, count(*) from acct_vendors
union all select 'erp_vendors', count(*) from erp_vendors
union all select 'vendors', count(*) from vendors
union all select 'crm_customers', count(*) from crm_customers
union all select 'products', count(*) from products
union all select 'commerce_products', count(*) from commerce_products
union all select 'erp_products', count(*) from erp_products;
```

# Platform Build Spec: Components, Interaction Contract, API Map, 14-Day Plan

Companion to `platform-component-map.md` (what and why) and `contracts.ts` (types). This doc is the bridge to code: the component registry, the exact click/unclick behavior, the API surface, and a day-by-day plan.

---

## 0. Read this first

**Assumptions (confirm or correct):**
- Database is finished. Field names in `contracts.ts` are proposals; reconcile them with the schema on Day 1 and **derive DTOs from DB types** (Prisma/Drizzle/Supabase generated types + `Pick`/`Omit`) instead of maintaining two copies.
- Client is a component framework (React assumed). Everything here is framework-agnostic except the registry naming.
- A tab system already exists. This spec treats each tab as owning its own **surface stack** and **context envelope**.

**Delivery target: 14 days, full scope.** Scope is everything in the component map and the Settings spec. The plan in section 6 is organized as **parallel lanes with contract-first interfaces** (`contracts.ts`), so each lane can be owned by one person or one agent and run at the same time. It makes no assumption about team size. Feature flags (`platform_feature_flags` already exists in the schema) are for rollout control, not for cutting scope.

**Biggest speed lever: config-driven UI.** Build ~10 generic components once (TableShell, Drawer, DocumentEngine, ContextMenu, Pickers, SurfaceHost) and write ~40 small configs (`ViewDef`, `DrawerDef`, `DocumentDef`) instead of 40 hand-built screens. Types are in `contracts.ts` section 9.

---

## 1. Architecture

```
AppShell
 ├─ TabBar (each tab = { route, surfaceStack[], envelope })
 ├─ SideNav (counts, pinned)
 ├─ GlobalSearch / CommandPalette
 ├─ CreateMenu (context-filtered)
 ├─ Routed content (module page: TableShell / DocumentEngine / Workspace / Studio)
 └─ SurfaceHost (renders the active tab's surface stack: drawer, modal, popover)
```

**Three central stores** (everything else is local state):

| Store | Holds | Key methods |
|---|---|---|
| `useSurfaces` | Per-tab surface stack, dirty flags | `open(request)`, `close(instanceId)`, `replace()`, `closeAll(tabId)`, `confirmDiscard()` |
| `useEnvelope` | Active tab's context envelope | `current()`, `derive(record)` returns the envelope for "Create from this" |
| `usePermissions` | Roles, field masks, feature flags | `can(action, record?)`, `isMasked(field)`, `flag(name)` |

**Server state:** one query cache (React Query/SWR style), keyed `[entity, id]` and `[entity, 'list', normalizedQuery]`. Mutations invalidate by entity and by `relations` (so a payment refreshes the invoice, customer balance, bank feed and dashboard tile).

**Rule: the server decides actions and permissions.** Menus, create menu and field masks come from the API (`/actions`, `/create-menu`, `meta.can`, `maskedFields`). The client never re-implements permission or state-machine logic. That is what keeps right-click menus identical everywhere.

---

## 2. Component Registry

### 2.1 Shell and primitives (build first)

| Component | Contract (props → events) | Notes |
|---|---|---|
| `AppShell` | none | Mounts providers, SurfaceHost, toasts |
| `TabBar` | `tabs`, `activeId` → `onSelect`, `onClose(tabId)`, `onReorder` | Close with dirty surface triggers `DiscardChangesModal` |
| `SideNav` | `groups[]`, `counts` → `onNavigate` | Counts from `/nav-counts` (one cheap call) |
| `Breadcrumbs` | `trail[]` | From route config |
| `CommandPalette` | `open` → `onSelect(hit \| createAction)` | Uses `/search` + `/create-menu` |
| `CreateMenu` | `module`, `tab`, `record?` → `onPick(CreateAction)` | Calls `/create-menu`; renders `SurfaceRequest` |
| `Pill` | `Pill` union → `onClick`, `onContextMenu`, `onHover` | One component, 7 variants (see `contracts.ts`) |
| `PeekPopover` | `ref` → `onOpen`, `onAction` | Fetches `/peek/{type}/{id}`, 300 ms hover intent, cached |
| `MoneyField`, `DateField`, `SelectField`, `TagInput` | `value`, `onChange`, `error` | Money = minor units |
| `AttachmentStrip` | `ids`, `max` → `onAdd`, `onRemove`, `onPreview` | Upload via `/files` |
| `CapturePanel` | `mode: upload\|photo\|email` → `onExtracted(fields)` | OCR autofill for Bill/Expense |
| `EmptyState`, `Skeleton`, `ErrorState`, `Toast` (with Undo) | n/a | Undo toast 8 s |
| `ConfirmDialog` | `ConfirmSpec` → `onConfirm(reason?)` | Used by menu `confirm` |

### 2.2 Data components

| Component | Contract | Calls |
|---|---|---|
| `TableShell` | `ViewDef`, query state → `onRowOpen`, `onSelectionChange`, `onSort`, `onFilter` | `GET /{entity}` |
| `StatusTabs` | `tabs`, counts → `onChange` | counts from `meta.tabCounts` |
| `FilterBar`, `ColumnPicker`, `SavedViews` | `ViewDef.filters` | `/views` (per-user saved) |
| `BulkBar` | `selectionCount`, `actions[]` → `onRun(action)` | `POST /bulk/{entity}` |
| `ContextMenu` | `MenuAction[]` → `onSelect` | `GET /{type}/{id}/actions` (prefetch on row hover) |
| `ActivityTimeline` | `ref` | `GET /{type}/{id}/activity` |
| `RelatedRail` | `ref` | Reads `meta.relations` (no extra call) |
| `ExistingRecordBanner` | `ref` | `GET /{type}/{id}/impact` |
| `KpiTile` | `value`, `delta`, `drill: ViewDef query` → `onClick` | `GET /dashboard/tiles` |

### 2.3 Pickers (typeahead + inline create)

| Component | Contract | Behavior |
|---|---|---|
| `PartyPicker` | `role?`, `value`, `scope` → `onChange(partyId)` | Search scope first, then global. `+ Add new` opens child `PartyDrawer` (depth 1); returns created record into the field |
| `ItemPicker` | `fulfillmentTypes?`, `value` → `onChange` | Shows price, stock/fulfillment pill; `+ Add product/service` child drawer |
| `AccountPicker` | `types?`, `value` → `onChange` | Grouped by account type; `+ Add account` child drawer |
| `CategoryPicker`, `LocationPicker` | same shape | Category supports inline create (the catalog prerequisite fix) |

### 2.4 Containers

| Component | Contract | Behavior |
|---|---|---|
| `Drawer` | `width: 480\|720`, `dirty`, `title` → `onClose`, `onMakeFullPage` | Non-modal over the list; sticky footer; stack depth max 2 |
| `Modal` | `size`, `dirty` → `onClose` | Focus-trapped; ≤ 5 fields |
| `DocumentPage` | `DocumentDef`, `id \| draft` | Header, LineGrid, Totals, ViewTabs, SidePanel; right rail = Related + Activity |
| `Workspace` | `steps`, `draftId` → `onFinish` | Saves as draft batch |
| `StudioHost` | `designId`, `envelope` → `onBack` | Mounts existing Konva studio; "Back to record" restores envelope |

### 2.5 Record drawers (all `DrawerDef` configs on one `RecordDrawer`)

`PartyDrawer`, `ItemDrawer`, `AccountDrawer`, `CategoryDrawer`, `TaskDrawer`, `TicketDrawer`, `DiscountDrawer`, `BannerDrawer`, `PopupDrawer`, `CollectionDrawer`, `RecurringDrawer`, `ExpenseDrawer`. One component renders sections/fields from config; custom sections plug in by slot (e.g., Variants grid, Role-specific blocks).

### 2.6 Modals

| Modal | Request type | Endpoint |
|---|---|---|
| `RecordPaymentModal` | `RecordPaymentRequest` | `POST /payments` |
| `SendModal` / `RemindModal` | `{ to, subject, body, attach }` | `POST /documents/{id}/send` |
| `VoidModal` | `{ reason }` | `POST /documents/{id}/void` |
| `RefundModal` | `RefundRequest` | `POST /refunds` |
| `MarkShippedModal` | `ShipRequest` | `POST /orders/{id}/ship` |
| `PrintLabelModal` | `{ service, package }` | `POST /orders/{id}/labels` |
| `CancelOrderModal` | `{ reason, refund, cancelPo }` | `POST /orders/{id}/cancel` |
| `AdjustStockModal` | `{ itemId, locationId, qty, reason }` | `POST /inventory/adjustments` |
| `TransferModal` (stock and money) | `{ from, to, qty \| amount }` | `/inventory/transfers`, `/transfers` |
| `ApproveDeclineReturnModal` | `{ decision, reason, message }` | `POST /returns/{id}/decision` |
| `PushToGlobalModal` | `PushRequest` | `POST /{type}/{id}/push` (handles `DUPLICATE_FOUND`) |
| `ChangeImpactModal` (tier 3) | `ChangePreview` | `POST /{type}/{id}/preview-change` |
| `DiscardChangesModal` | none | client-only |
| `ReportProblemModal` | `{ category, description, files }` | `POST /tickets` (prefilled from order) |

### 2.7 Workspaces

`PayBillsWorkspace`, `ReceivePaymentWorkspace`, `ReconcileWorkspace`, `UploadBillsWorkspace`, `BatchSlipsLabelsWorkspace`. Later: `CycleCountWorkspace`, `SettlementWorkspace`, `RunPayrollWorkspace`.

---

## 3. Interaction Contract (click and unclick)

### 3.1 Gesture table

| Gesture | Target | Behavior |
|---|---|---|
| **Click** | Row body (record list) | Open record in **drawer** (replaces current drawer; dirty guard first) |
| **Click** | Row body (document list) | Navigate to **DocumentPage** |
| **Click** | Row checkbox | Toggle selection only; never opens |
| **Shift-click** | Checkbox | Range select |
| **Click** | Header checkbox | Select all visible; banner offers "Select all N matching" |
| **Click** | Empty table area / **Esc** | Clear selection (the "unclick") |
| **Click** | Pill | `PeekPopover` opens; click again or outside closes |
| **Hover** | Pill (desktop) | Peek after 300 ms intent delay; cancels on leave |
| **⌘/Ctrl-click** | Pill or row | Open in new tab (new envelope from source) |
| **Right-click** | Row | Context menu at cursor. If row is not selected, select **only** it. If row is within a selection, menu acts on the whole selection and shows bulk variants |
| **Click** | Menu item | Runs `surface` or `request`; `confirm` shows `ConfirmDialog` first; menu closes |
| **Click outside** | Menu / popover | Closes it |
| **Click outside** | Drawer | **Does not** close (list stays interactive; prevents data loss) |
| **Click outside** | Modal scrim | Closes only if form is clean |
| **Click** | Column header | Cycle sort: asc → desc → default (the third click is the "unsort") |
| **Click** | Status tab | Filters list; keeps other filters; updates URL |
| **Click** | Same status tab again | No change (tabs are not toggles) |
| **Click** | Filter chip `×` | Removes that filter |
| **Click** | KPI tile | Drills to the target list with filters applied |
| **Click** | Alert pill | Opens its `fix` surface |

### 3.2 Escape priority (one Esc closes one thing)

1. Open popover or context menu
2. Top modal
3. Top drawer (dirty guard)
4. Selection
5. Search input focus

### 3.3 Dirty guard

Any close, replace, tab close, route change or browser back with `dirty = true` opens `DiscardChangesModal`: **Save · Discard · Keep editing**. Dirty = form values differ from the loaded record. Autosave drafts are for DocumentPage only.

### 3.4 Surface stack rules

- Max **depth 2**: base drawer + one child drawer opened from a picker `+ Add new`.
- Child save returns the created record into the parent field and focuses the next field. Child cancel returns focus to the picker.
- Opening a record from a list while a clean drawer is open **replaces** it. While dirty, guard first.
- **Make full page** promotes drawer state into DocumentPage without losing input.
- **Browser back** closes the top surface before navigating.
- **URL sync:** pages use the route; the top drawer is `?surface=party.drawer&id=123&mode=edit`; modals are not in the URL. Reload restores the drawer.
- Each **tab keeps its own stack**. Switching tabs does not close surfaces; closing a tab with dirty surfaces guards.

### 3.5 Save, optimistic updates, undo

| Action class | Strategy |
|---|---|
| Field edits, tags, status toggles, archive | Optimistic; rollback on error; **Undo toast 8 s** |
| Create | Wait for server id, then update list and return focus |
| Money movement, posting, sending, shipping, refunds | **Never optimistic.** Disable button, show progress, send `Idempotency-Key`, handle replay |
| Tier 3 edits | Preview first (`/preview-change`), then confirm |
| Tier 4 (posted/locked) | Fields read-only; menu shows Void / Adjust / Credit memo |

### 3.6 Edit warnings (maps to section 1.9, rule 7)

On entering edit: `GET /{type}/{id}/impact` → render `ExistingRecordBanner` by tier. On save: `PATCH` with `If-Match: version`. On `VERSION_CONFLICT`: show field diff (keep mine / keep theirs / merge). If `meta.lock` is set, show "Maria is editing this" banner and allow edit with warning.

### 3.7 Keyboard (minimum)

`⌘K` palette · `C` create menu · `/` focus search · `J/K` move row focus · `Enter` open · `X` toggle select · `E` edit · `Esc` per 3.2 · `⌘S` save · `⌘Enter` save and close.

---

## 4. API Contract

### 4.1 Conventions

| Topic | Rule |
|---|---|
| Base | `/api/v1`, JSON, auth via session or bearer |
| Resources | Plural nouns: `/parties`, `/items`, `/documents`, `/orders`, `/tickets`... |
| Documents | One family: `/documents?type=invoice`; type-specific rules come from `DocumentDef`, not separate routes |
| Actions | `POST /{resource}/{id}/{verb}` (send, void, ship, cancel, push) |
| Lists | `ListQuery` params; cursor pagination; response `meta.tabCounts` and `meta.summary` so tabs and footers need no extra call |
| Writes | `POST` create, `PATCH` partial update with `If-Match` |
| Idempotency | `Idempotency-Key` required on payments, refunds, sends, ships, posts, payroll |
| Errors | `ApiError` envelope with `code`, `fields`, `requestId` (`contracts.ts` section 10) |
| Permissions | Every record returns `meta.can` and `meta.maskedFields`; server enforces regardless |
| Soft delete | `DELETE` archives; hard delete only for drafts |
| Events | Every state change emits an event (`invoice.paid`, `order.shipped`, `ticket.sla_breached`) for automations, notifications and activity |

### 4.2 Cross-cutting endpoints (build once, used by every module)

| Endpoint | Returns | Used by |
|---|---|---|
| `GET /search?q&types&scope` | `SearchResponse` | Palette, pickers, scoped-to-global search |
| `GET /create-menu?module&tab&record` | `CreateAction[]` | CreateMenu |
| `GET /{type}/{id}/actions?surface` | `MenuAction[]` | Context menu, row `⋯`, headers |
| `GET /peek/{type}/{id}` | `PeekCard` | Pill popovers |
| `GET /{type}/{id}/activity` | `ActivityEntry[]` | ActivityTimeline |
| `GET /{type}/{id}/impact` | `ImpactSummary` | ExistingRecordBanner |
| `POST /{type}/{id}/preview-change` | `ChangePreview` | ChangeImpactModal |
| `POST /{type}/{id}/push` | `PushResult` | PushToGlobalModal |
| `POST /bulk/{type}` | `BulkResult` | BulkBar |
| `GET /nav-counts` | counts by nav key | SideNav badges |
| `GET /dashboard/tiles` | tile values with drill queries | Dashboard |
| `POST /import/jobs` + `/commit` + `/undo` | `ImportJob` | Import hub |
| `POST /export` | job id, then file | Export buttons |
| `POST /files` | `{ id, url }` | AttachmentStrip |

### 4.3 Resource map by module

| Module | List / read | Create / update | Key actions |
|---|---|---|---|
| **Parties** | `GET /parties` (role, segment filters), `/parties/{id}` | `POST/PATCH /parties` | `/archive`, `/roles` (add/remove), `/push`, `/merge` |
| **Items** | `GET /items`, `/items/{id}` | `POST/PATCH /items` | `/publish`, `/reprice`, `/archive`, `/push` |
| **Categories / Collections** | `GET /categories`, `/collections` | `POST/PATCH` | n/a |
| **Documents** | `GET /documents?type=` | `POST/PATCH /documents` | `/send`, `/remind`, `/void`, `/convert`, `/duplicate`, `/pdf`, `/journal-entry` |
| **Payments** | `GET /payments` | `POST /payments` (apply to many) | `/void` |
| **Bills** | `GET /documents?type=bill` | same | `POST /bills/pay` (PayBillsRequest), `/approve`, `/match` |
| **Bank transactions** | `GET /bank-transactions` | n/a (feed) | `/match`, `/categorize`, `/create-from` (expense, transfer, deposit), `/exclude`, `POST /rules` |
| **Reconcile** | `GET /reconciliations/{id}` | `POST /reconciliations` (setup) | `/toggle-line`, `/finish` |
| **Accounts** | `GET /accounts`, `/accounts/{id}/register` | `POST/PATCH` | `/merge`, `/deactivate` |
| **Orders** | `GET /orders`, `/orders/{id}` | `POST /orders` (sales order) | `/ship`, `/labels`, `/cancel`, `/sync-tracking`, `/issues`, `POST /orders/batch-labels` |
| **Refunds / Returns** | `GET /returns` | `POST /returns`, `POST /refunds` | `/decision`, `/receive` |
| **Purchasing** | `GET /documents?type=purchase_order` | same | `/send`, `/receive` (items), `/create-bill` |
| **Inventory** | `GET /inventory`, `/inventory/{itemId}/history` | n/a | `POST /inventory/adjustments`, `/transfers` |
| **Designs / Studio** | `GET /designs`, `/collections` | `POST/PATCH` | `/publish` (creates Items), `/duplicate` |
| **Marketing** | `GET /discounts`, `/banners`, `/popups`, `/posts`, `/campaigns` | `POST/PATCH` | `/pause`, `/schedule`, `/publish` |
| **Support** | `GET /tickets`, `/tickets/{id}/messages` | `POST /tickets`, `POST /tickets/{id}/messages` | `/assign`, `/merge`, `/status`, `/macro` |
| **Tasks** | `GET /tasks` | `POST/PATCH` | `/complete` |
| **Contractors** | `GET /parties?role=contractor` | same | `/w9-invite` |
| **Reports** | `GET /reports/{key}` | n/a | `/schedule`, `/save-view`; rows include `drill` query |
| **Settings** | per page: `/settings/{section}` | `PATCH` | Roles, approvals, bank rules, recurring templates |

**Workspace endpoints** return a draft the client edits: `POST /bills/pay/draft`, `POST /payments/receive/draft`, `POST /reconciliations`. Finish calls the real action with an idempotency key.

### 4.4 Document Engine contract

- `GET /document-defs` returns every `DocumentDef` (cache forever per deploy). The client builds Invoice, Bill, PO, Estimate, Credit memo from these configs.
- Totals are **server-computed**. The client may preview locally but always replaces with `DocumentTotals` from the save response.
- Status changes go through verbs (`/send`, `/void`, `/approve`), never by patching `status`. `INVALID_TRANSITION` is returned if illegal.
- `POST /documents/{id}/convert` handles Estimate → Invoice, Order → Invoice, Bill → Vendor credit and carries relations.

---

## 5. Example Config (Bills list) to show the pattern

```ts
import type { ViewDef } from './contracts';

export const billsView: ViewDef = {
  id: 'bills',
  entity: 'document',
  documentType: 'bill',
  title: 'Bills',
  columns: [
    { id: 'vendor',      label: 'Vendor',       kind: 'party',    sortable: true,  defaultVisible: true },
    { id: 'number',      label: 'Bill no',      kind: 'text',     sortable: true,  defaultVisible: true },
    { id: 'issueDate',   label: 'Bill date',    kind: 'date',     sortable: true,  defaultVisible: true },
    { id: 'dueDate',     label: 'Due date',     kind: 'date',     sortable: true,  defaultVisible: true },
    { id: 'total',       label: 'Bill amount',  kind: 'money',    sortable: true,  defaultVisible: true, align: 'right' },
    { id: 'balanceDue',  label: 'Open balance', kind: 'money',    sortable: true,  defaultVisible: true, align: 'right' },
    { id: 'status',      label: 'Status',       kind: 'status',   sortable: true,  defaultVisible: true },
    { id: 'approval',    label: 'Approval',     kind: 'status',   sortable: false, defaultVisible: true },
    { id: 'source',      label: 'Source',       kind: 'text',     sortable: true,  defaultVisible: false },
  ],
  defaultSort: 'dueDate',
  statusTabs: [
    { id: 'review', label: 'For review', filter: { status: 'for_review' } },
    { id: 'unpaid', label: 'Unpaid',     filter: { status: 'unpaid' } },
    { id: 'paid',   label: 'Paid',       filter: { status: 'paid' } },
  ],
  filters: [
    { id: 'vendor',  label: 'Vendor',    kind: 'party' },
    { id: 'dates',   label: 'Bill date', kind: 'date_range' },
    { id: 'tags',    label: 'Tags',      kind: 'tag' },
  ],
  rowClick: 'document.page',
  bulkActions: ['approve', 'pay', 'categorize', 'tag', 'print_checks'],
  supportsImport: true,
  supportsExport: true,
  totalsFooter: ['sum:amount', 'sum:balance'],
};
```

The same `TableShell` renders Invoices, POs, Orders, Tickets by swapping the config. Row click, right-click, bulk bar, sorts, saved views and pills come with it.

---

## 6. 14-Day Plan: Full Scope, Parallel Lanes

**How it is organized.** Dependencies decide the order, not capacity. Day 1 is a short gate that produces the shared contracts; after it, every lane builds against `contracts.ts` and the config-driven components, so lanes do not wait on each other's screens. Each lane lists its deliverables and what it depends on.

### 6.1 Gate 0 (Day 1): shared foundation

Everything else reads from this. Nothing in the lanes below needs to wait for more than this.

| Item | Output |
|---|---|
| Reconcile `contracts.ts` with the live DB | Run the section 6 queries in `platform-settings-spec.md`; settle Party and Item table mapping (G-14) and decisions D-1 to D-6 |
| Typed API client | Envelope, errors, `Idempotency-Key`, `If-Match`, cursor lists |
| Server Settings/API skeleton | Service-role API (six tables have RLS with no policies), permission guard via `platform_has_permission`, audit write helper |
| Shell skeleton | `AppShell`, tabs, `useSurfaces`, `useEnvelope`, `usePermissions`, URL sync |
| Config schemas locked | `ViewDef`, `DrawerDef`, `DocumentDef`, `MenuAction`, `CreateAction` |

### 6.2 Lanes (run in parallel after Gate 0)

| Lane | Deliverables | Start | Done | Depends on |
|---|---|---|---|---|
| **L1 Shell and navigation** | Tabs with per-tab surface stacks, command palette, context-filtered Create menu (`platform_quick_action_registry`, `platform_create_favorites`), SideNav counts, notifications inbox, sync-status panel, global search | D1 | D4 | Gate 0 |
| **L2 Generic components** | `TableShell`, `Pill` + `PeekPopover`, `ContextMenu` (server `/actions`), `RecordDrawer`, pickers with child-drawer inline create, field components, `AttachmentStrip`, `CapturePanel`, `Workspace` shell, `DocumentEngine` (header, lines, totals, status verbs, view tabs) | D1 | D5 | Gate 0 |
| **L3 Finance** | Invoice, Estimate, Credit memo, Sales receipt, Bill, Expense, Check, Vendor credit; Record payment, Receive payment, Pay bills; Bank transactions + match/categorize/create; Bank rules (new table); Reconcile; Bank deposit; Transfer; Journal entry; Settlement; Chart of Accounts; Periods and period lock; Recurring; Business tax and sales tax engine; Statements | D3 | D11 | L2 (TableShell, DocumentEngine, pickers) |
| **L4 Commerce** | Catalog (items, variants, fulfillment type, categories, bundles, channels); Studio hook-in and publish loop; My Catalog to Global push with dedupe; Orders, order modals, Fulfillment queue, labels, tracking; Returns/RMA; Purchasing (Replenishment PO and Fulfillment PO); Inventory (balances, adjust, transfer, cycle count, stock history); Shipping/carrier settings | D3 | D11 | L2 |
| **L5 Retail, money and people** | POS app (shifts, tender, offline queue, Z report) over `commerce_*` tables; Gift cards over `commerce_gift_cards`; Banking/Cards (Stripe Treasury and Issuing surfaces); Employees, Contractors (W-9, 1099), Time, Payroll run | D4 | D12 | L2; L3 for postings |
| **L6 Growth and Support** | CRM (Parties, leads, segments, tasks); Marketing (banners, popups, discount codes, campaigns, posts, newsletter, automation); Social calendar; Ad Center; Support (three-pane workspace, context sidebar, queues, SLA, routing, escalation, macros, KB, customer portal) | D3 | D12 | L2; L4 for context sidebar actions |
| **L7 Settings** | Roles and permissions, Approvals and limits (with routing contract), Chart of Accounts, Bank rules, Financial settings, Numbering, Tax, Recurring, Integrations, API tokens, Notifications, Data and privacy, Support/SLA pages, Workspace pages, Custom fields, Feature flags | D2 | D10 | Gate 0 server API; L3 for CoA and rules |
| **L8 Cross-cutting** | Activity timeline, Related rail, Existing-record banner (`/impact`, `/preview-change`), undo toasts, soft locks, audit immutability fixes (G-07, G-08), event/outbox wiring, Import hub (`acct_import_jobs`), Export, saved views | D2 | D11 | Gate 0; L2 |
| **L9 Reports and Dashboard** | Report shell with drill-down, all report families, scheduled reports (new tables), dashboard tiles with drill, KPI targets (new table) | D6 | D12 | L3, L4, L6 data |

### 6.3 Integration gates

| Gate | When | Pass condition |
|---|---|---|
| **G1** | End D2 | Shell + surface stack + envelope working; one entity list renders from a `ViewDef`; typed API client talks to the server |
| **G2** | End D5 | Generic components and DocumentEngine done; Party drawer, Item drawer and Invoice work end to end |
| **G3** | End D8 | First cross-module loops live: customer inline-create from invoice, order to invoice to ship, bank match, design to product publish |
| **G4** | End D11 | Every module reachable from nav with real data; every Create action opens its mapped surface; permissions and masking verified by role |
| **Hardening** | D12 to D14 | Six core e2e flows plus per-lane e2e green; dirty guards, Esc order, a11y pass, performance (virtualized lists, hover prefetch), security review of service-role endpoints, RLS and period-lock checks, staging soak, release |

### 6.4 Lane interface rules (what keeps parallel work from colliding)

- **Contracts first.** A lane never reads another lane's code; it reads `contracts.ts` and the endpoint map. Changes to a contract go through one owner and are announced to all lanes.
- **Config over code.** New screens are `ViewDef`, `DrawerDef` and `DocumentDef` entries; a lane only writes custom components for what the generic ones cannot express.
- **One registry.** Surface IDs, action codes and permission codes live in one registry (`platform_quick_action_registry` and `platform_permission_registry` on the data side); lanes add entries, they do not invent parallel lists.
- **Server decides.** Menus, create actions, field masks and `can` flags come from the API, so lanes do not each re-implement permission logic.
- **Seed data.** One shared seed (parties, items, accounts, orders, tickets) so every lane can test against realistic connected data from Day 2.

### 6.5 External gates (dates are set by third parties, not by build capacity)

| Dependency | Why it matters | Action |
|---|---|---|
| Stripe Treasury / Issuing access | Treasury for platforms is request-based and requires Connect on Accounts v2 | Request on Day 1; build Banking/Cards surfaces against a mock until approved |
| Marketplace and carrier API credentials | Channels, labels and tracking need live credentials | Start applications Day 1 |
| Social and ad platform app review | Publishing and ads need approved apps | Start Day 1 |

### 6.6 Core flows to automate (e2e)

(1) add customer inline from invoice, send, record payment; (2) upload bill, approve, pay; (3) bank transaction match, rule apply, reconcile; (4) order, ship, refund; (5) design, publish, push to global; (6) ticket, refund from sidebar, close; (7) POS sale, gift card redeem, shift close with Z report; (8) payroll run posts to ledger.

---

## 7. Definition of Done (per component or screen)

- [ ] Typed against `contracts.ts`; no `any` at API boundaries
- [ ] Loading, empty, error and permission-denied states
- [ ] Right-click menu comes from `/actions` and follows the 8-section order
- [ ] Pills used for every party/item/order/account mention; peek works
- [ ] Create-from-this prefills from the envelope and returns to origin
- [ ] Dirty guard, Esc order and focus return verified
- [ ] Money paths send `Idempotency-Key`; no optimistic UI
- [ ] Masked fields and `can.*` respected; verified with a restricted role
- [ ] Activity entry written with `sourceView`
- [ ] Keyboard reachable; labels and focus rings present
