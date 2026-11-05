/**
 * Help Center articles — one source of truth for /admin/help and /admin/help/[slug].
 *
 * Written for the owner: a smart, non-technical person. Short sentences.
 * No jargon without a plain-English gloss in the same breath. No condescension.
 * See docs/ux-baseline.md — this file follows those rules.
 */

export interface HelpTask {
  title: string;
  steps: string[];
}

export interface HelpArticle {
  slug: string;
  title: string;
  /** One-line summary shown on the index cards and in search results. */
  summary: string;
  /** "What this is" — the opening paragraphs. */
  what: string[];
  /** "The things you'll actually do here" — 3 to 5 bullets. */
  doHere: string[];
  /** Step-by-step guides for the top tasks. */
  tasks: HelpTask[];
  /** "If something looks wrong" — calm troubleshooting notes. */
  ifWrong: string[];
  /** Extra words the search should match (synonyms, things she might call it). */
  keywords: string;
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    summary: "What this admin is, how to move around it, and the one habit that keeps your work safe.",
    what: [
      "This is the control room for your shop. From here you design products, take orders, keep an eye on money, answer customers, and connect the services that keep everything running.",
      "You don't need to understand any of it all at once. Every button and link explains itself: rest your mouse on it (or tap it with the keyboard) and a small note pops up saying what it does. That is what this Help Center does for whole topics.",
    ],
    doHere: [
      "Look at how the shop is doing on the Dashboard.",
      "Design products in the Design Studio and publish them to the shop.",
      "Watch orders come in and send them to the printer.",
      "Answer customers in the Support Desk.",
      "Check the money in Accounting.",
    ],
    tasks: [
      {
        title: "Move around the admin",
        steps: [
          "The row of words across the top (Dashboard, CRM, Orders, Products, Accounting…) takes you to each part of the business.",
          "Underneath it, a second row shows the pages inside the part you're in. Click any of them to jump straight there.",
          "The name of where you are is always shown at the top left, next to the green dot.",
        ],
      },
      {
        title: "Sign out",
        steps: [
          "Click “Sign out” at the top right.",
          "Your work is saved as you go, so signing out never loses anything.",
        ],
      },
    ],
    ifWrong: [
      "A page looks empty? Most lists start empty until you've added something — the page will tell you what to do first.",
      "Something won't save? Look for a red message near the button — it says, in plain words, what went wrong and what to try.",
      "Lost? Click Dashboard at the top. Everything starts from there.",
    ],
    keywords: "home start first time login sign in sign out menu navigation basics orientation",
  },
  {
    slug: "dashboard",
    title: "Your dashboard",
    summary: "The shop's headline numbers and the latest orders, all on one page.",
    what: [
      "The dashboard is your shop at a glance. The four big numbers at the top tell you how many orders you've had, how much money has come in, how many products you have, and how many customers are on file.",
      "Below them is a short list of your most recent orders, and three quick buttons to the places you'll visit most.",
    ],
    doHere: [
      "Check the headline numbers — orders, revenue, products, customers.",
      "Glance at the newest orders to see what's just come in.",
      "Jump straight to the Design Studio, your Products, or building a Collection.",
    ],
    tasks: [
      {
        title: "Read the headline numbers",
        steps: [
          "Orders — every order the shop has ever received.",
          "Revenue — the total value of all orders, before refunds and costs come off. It's the size of the pie, not the profit. Profit lives in Accounting, under Profit & Loss.",
          "Products — how many products exist in your catalog, published and draft together.",
          "Customers — how many customer records you keep.",
        ],
      },
      {
        title: "Follow up a recent order",
        steps: [
          "Find the order in the Recent Orders list.",
          "Click “View all orders →” to open the full Orders list.",
          "Click the order number to open it and see exactly what to do next.",
        ],
      },
    ],
    ifWrong: [
      "Numbers look low? They count everything since the shop began — if the shop is new, small numbers are normal.",
      "Revenue and your bank balance don't match? They never will exactly — revenue is counted when an order is placed, before refunds, fees, and costs.",
    ],
    keywords: "home numbers sales overview kpi revenue orders total",
  },
  {
    slug: "tabs",
    title: "Working with tabs",
    summary: "Open several pages side by side, like tabs in a web browser — and never lose what you were typing.",
    what: [
      "Along the top of the admin you'll find tabs, just like in a web browser. Each tab is a page you have open. You can have several open at once — an order in one tab, a customer in another — and hop between them.",
      "The important part: switching tabs never loses your work. A form you were halfway through typing is still there, exactly as you left it, when you come back to its tab.",
    ],
    doHere: [
      "Open a new tab by clicking any page in the menus — it opens as a tab instead of replacing your page.",
      "Switch between tabs by clicking their names.",
      "Close a tab with its × button. Closing a tab only closes the view — anything you saved stays saved.",
      "Your set of open tabs follows your account: sign in on another computer and your tabs are there.",
    ],
    tasks: [
      {
        title: "Work on two things at once",
        steps: [
          "Open an order from the Orders list. It appears as a tab.",
          "Now open a customer from Customers. That appears as a second tab.",
          "Click between the two tabs to compare them — nothing reloads, nothing is lost.",
        ],
      },
      {
        title: "Tidy up your tabs",
        steps: [
          "Hover over a tab and click its × to close just that one.",
          "You can have up to 15 tabs open. If you reach the limit, close a few you no longer need.",
        ],
      },
    ],
    ifWrong: [
      "A tab shows an older version of a page? Tabs refresh themselves when something changes elsewhere — for example, publishing a product updates any open Products tab.",
      "Half-typed words didn't follow you to a different computer? Tabs follow you, but typing starts fresh on the new machine. On the same computer, your typing is never lost.",
    ],
    keywords: "tabs workspace windows multiple pages switch keep work browser",
  },
  {
    slug: "customers",
    title: "Customers (CRM)",
    summary: "Everyone who bought from you or asked about a product — and everything you can do for them.",
    what: [
      "CRM is just a tidy name for your customer book. “CRM” stands for customer relationship management — in plain words, it's where you keep track of people: what they bought, what they owe, and what you've said to them.",
      "Every person who orders or enquires lands here automatically. You can also add someone by hand.",
    ],
    doHere: [
      "Find any customer by name, email, or phone number.",
      "Open a customer's record to see their orders, balance, and notes.",
      "Send a message, take a payment, create an invoice, or issue a refund — all from the Actions menu on their record.",
      "Save a filtered list (like “VIPs who owe money”) as a view you can return to in one click.",
      "Group customers into Segments — like “hasn't ordered in 6 months” — so you can write to just them.",
    ],
    tasks: [
      {
        title: "Find a customer",
        steps: [
          "Go to Customers (under CRM at the top).",
          "Type any part of their name, email, or phone number in the search box.",
          "Click Filter. Click their name to open their full record.",
        ],
      },
      {
        title: "Add a customer by hand",
        steps: [
          "Go to Customers and click “New customer”.",
          "Fill in their name and contact details.",
          "Click Save customer. They now have a record, ready for orders and invoices.",
        ],
      },
      {
        title: "Send a customer a message",
        steps: [
          "Open the customer's record (or find them in the list).",
          "Click “Actions ▾” and choose “Send message”.",
          "Pick email or text, write your message, and send. The message is kept on their record.",
        ],
      },
      {
        title: "Save a list you'll use again",
        steps: [
          "Set the filters to show exactly the list you want — for example, customers with a balance due.",
          "Type a name for it in the “Name this view” box, like “Owes money”.",
          "Click “Save view”. It appears as a chip above the list, ready any time.",
        ],
      },
    ],
    ifWrong: [
      "A customer appears twice? Use Data Management (under CRM) to find duplicates and merge them into one record. Nothing is lost — orders and notes come together.",
      "A customer has no email? Some records start life with only a phone number. You can add the email from “Actions ▾ → Edit customer”.",
    ],
    keywords: "crm people buyers contacts address book segments leads notes message email text",
  },
  {
    slug: "orders",
    title: "Orders & shipping",
    summary: "From the moment someone buys, to the moment the parcel leaves — and what to do at each step.",
    what: [
      "Every purchase lands in Orders. Each order shows what was bought, who bought it, where it's going, and where it is in its journey: waiting, confirmed, being made, packed, shipped, delivered.",
      "Most of your products are printed to order by a supplier (like Printful or Gelato). When an order is ready, you send it to the supplier with one button — they print it and post it. The order's page always tells you the next step.",
    ],
    doHere: [
      "See new orders and confirm them.",
      "Send an order to its printer (the supplier) and watch for tracking.",
      "Create an order by hand for a phone sale or a fair.",
      "Print a packing slip — the paper that goes inside the parcel.",
      "Handle returns and problems from the Returns page.",
    ],
    tasks: [
      {
        title: "Handle a new order, start to finish",
        steps: [
          "Open Orders. New orders sit in the “Unfulfilled” view.",
          "Click the order number to open it.",
          "Check the items and the delivery address look right.",
          "Use the Actions box to confirm the order, then “Push to supplier” to send it to the printer. It starts as a draft at the printer — nothing is printed or charged until you press “Confirm at supplier”.",
          "When the printer sends tracking, it appears on the order. The customer is kept up to date automatically.",
        ],
      },
      {
        title: "Create an order by hand",
        steps: [
          "In Orders, click “+ Create Order”.",
          "Add the customer's details and the items they're buying.",
          "Save. The order now behaves like any other — you can send it to the printer the same way.",
        ],
      },
      {
        title: "Print a packing slip",
        steps: [
          "Open the order.",
          "Click “Packing slip” (or “Print packing slip”).",
          "Print it and put it in the parcel before you seal it.",
        ],
      },
    ],
    ifWrong: [
      "An order won't push to the supplier? The message on the order says why — most often a product isn't linked to that supplier yet. Publish the design from the Studio first, then push again.",
      "A customer says their parcel is late? Open the order and check the tracking section. If there's no tracking after a few days, the supplier may still be printing — printed-to-order items take a little longer than off-the-shelf ones.",
      "Wrong address on an order? Fix it before you push the order to the supplier. After that, contact the supplier — the parcel is in their hands.",
    ],
    keywords: "orders shipping delivery tracking packing slip printer supplier push fulfil fulfill returns refund parcel",
  },
  {
    slug: "inventory-products",
    title: "Inventory & products",
    summary: "Your product list, what's in stock, and how products get published or hidden.",
    what: [
      "Products is your shop's catalog: every item you sell, whether it's live in the shop or still a draft. Inventory tracks how many of the things you hold yourself are in stock.",
      "Most products here are printed to order by suppliers, so they never “run out” in the usual way — the supplier prints one when it's bought. Inventory matters most for anything you keep on your own shelves.",
    ],
    doHere: [
      "Publish a product so customers can buy it, or hide it so they can't.",
      "Check stock levels and record deliveries, counts, and damaged items.",
      "Move stock between places with a transfer.",
      "Raise a purchase order when you need more stock from a vendor.",
    ],
    tasks: [
      {
        title: "Publish or hide a product",
        steps: [
          "Go to Products.",
          "Find the product and use its Publish / Hide switch.",
          "Published means customers can see and buy it. Hidden means it's saved but not on sale.",
        ],
      },
      {
        title: "Record stock you've received",
        steps: [
          "Go to Inventory and open the item.",
          "Use “Receive stock” (or the + action on its row) and type how many arrived.",
          "Save — the stock count updates straight away.",
        ],
      },
      {
        title: "Do a stock count",
        steps: [
          "On the item's row in Inventory, choose “Stock count” mode.",
          "Type the number you actually counted on the shelf.",
          "Apply. The records now match reality — that's the whole point of a count.",
        ],
      },
    ],
    ifWrong: [
      "A product is missing from the shop but exists here? Check it's Published, not hidden — and that it belongs to a collection that's published too.",
      "Stock numbers look wrong? Do a stock count (above). Counts fix the record to match the shelf; adjustments add or remove a few at a time.",
    ],
    keywords: "inventory stock products catalog publish hide count warehouse purchase order vendor",
  },
  {
    slug: "design-studio",
    title: "Design Studio",
    summary: "Where your artwork becomes products — and the two simple rules that decide when Publish unlocks.",
    what: [
      "The Design Studio is where you place your artwork onto products — a mug, a shirt, a print — and see exactly how it will look. When you're happy, you publish, and the product appears in your shop ready to buy.",
      "Two things protect you here. First, the sharpness check (explained below). Second, the one-supplier rule: all the products in one collection must come from the same printer, so a collection never mixes suppliers.",
    ],
    doHere: [
      "Pick a product and place your artwork on it — drag, resize, and line it up.",
      "Generate picture ideas with the AI inspiration panel, then use them as artwork.",
      "Save your design and come back to it any time.",
      "Review, approve, and publish designs to the shop.",
      "Group designs into collections that are sold together.",
    ],
    tasks: [
      {
        title: "Publish a design, step by step",
        steps: [
          "Finish your design and click “Save design” (top bar).",
          "Click “Review & publish”.",
          "Click “Run preflight” — the final safety check. It tells you plainly if anything would block publishing.",
          "Click “Submit for review”, then “Approve — ready to publish”.",
          "Click “Publish to storefront”. The product is now live in your shop, and its print files are created at the same time.",
        ],
      },
      {
        title: "Understand DPI — the sharpness number",
        steps: [
          "DPI means “dots per inch” — in plain words, how sharp a picture is. More dots, sharper print.",
          "Printers need 300 DPI. If a small picture is stretched over a big space, its DPI drops and it would print blurry.",
          "The studio watches this for you. The bar at the bottom of the screen shows the DPI of your artwork as you work.",
          "If Publish is locked with a sharpness warning, the fix is simple: use a bigger, sharper picture, or make the artwork smaller on the product.",
        ],
      },
      {
        title: "Fix a “collection locked” warning",
        steps: [
          "A collection can only use one printer (supplier). If you add a product from a different printer, publishing locks and the warning names both suppliers.",
          "Either remove that product from the collection, or start a separate collection for it.",
          "The studio suggests products from the same supplier to help you complete the set.",
        ],
      },
    ],
    ifWrong: [
      "Publish is greyed out? Read the production gate box in the Review panel — the reason is written there in red, in plain words. It's usually sharpness (DPI) or the one-supplier rule.",
      "Your design looks different in the shop? The shop page is refreshed when you publish. If you republished and the old picture still shows, wait a minute and reload the page.",
      "You closed the studio by accident? Your design is saved as you go — reopen it from “Open project”.",
    ],
    keywords: "design studio canvas artwork publish dpi sharp print collection supplier konva mockup print file",
  },
];

HELP_ARTICLES.push(
  {
    slug: "new-design-wizard",
    title: "Start a design the guided way — the New Design wizard",
    summary: "Six short steps that take you from “I want to design something” to the canvas, with the product, supplier, and filing already chosen.",
    what: [
      "The New Design wizard is the guided way into the Design Studio. Instead of opening a blank canvas and hunting for a product, you answer one question at a time — what kind of product, which one exactly, who prints it, and where the design lives — and the canvas opens with all of it already chosen.",
      "You will find it from “✦ New design” in the Design Studio, from “+ New Design” on the Products page, and from the “Design” button on a product row. You can go back at any step; nothing is final until the canvas opens.",
    ],
    doHere: [
      "Pick a product by category, then subcategory, then the product itself — with real counts and prices at each step.",
      "See which suppliers can print that product, with their real print sizes and captured costs.",
      "Name the project and file it into a collection folder before you start, so no design is ever lost or unfiled.",
      "Open the canvas with the product, supplier, name, and folder already set.",
    ],
    tasks: [
      {
        title: "Start a new design, step by step",
        steps: [
          "Step 1 — Category: pick the kind of product (for example, clothing or mugs). The numbers are the real products on each shelf right now.",
          "Step 2 — Subcategory: narrow it down inside that category. If a group has nothing narrower inside it, use “All products in…” to see everything on that shelf.",
          "Step 3 — Product: pick the exact blank you want to design on. Each card shows its supplier, how many variants it has, and its starting price.",
          "Step 4 — Supplier: pick who prints it. Each card shows the supplier's real print size and sharpness (DPI), whether their own mockup picture has been captured, and their captured cost. Cheapest captured cost comes first.",
          "Step 5 — Organize: the project name is filled in from the product — change it if you like — then pick the collection folder the design lives in, create a new one, or choose “Decide later in the studio”.",
          "Step 6 — Canvas: check the summary, then click “Open the canvas in the Design Studio”. The studio opens with your product loaded; its “Template loaded” message confirms the print size. Press “Save design” there to keep your work.",
        ],
      },
      {
        title: "Understand “Price not captured yet”",
        steps: [
          "Supplier prices are captured ahead of time, on a schedule, from what each supplier actually charges — the wizard never guesses a price.",
          "If a supplier's price has not been captured yet, its card says exactly that. The supplier can still print your design; its price is worked out at publish time.",
          "As more prices are captured, they appear on the cards automatically, cheapest first.",
        ],
      },
      {
        title: "Pick a supplier that is not the product's own",
        steps: [
          "Most products come from one supplier's catalog, and the canvas designs on that supplier's listing — its card is marked “This product's supplier”.",
          "Sometimes another supplier has print information captured for the same blank. You can pick it in Step 4, but if there is no linked listing of this product from that supplier yet, Step 6 will say so plainly instead of pretending — pick the product's own supplier to open the canvas.",
        ],
      },
    ],
    ifWrong: [
      "Only one supplier is listed? That product is not linked to a captured print spec yet, so only its own supplier can be shown. As more suppliers are captured for that blank, they will appear in Step 4.",
      "The canvas opened but on the standard stage? That product has no captured supplier template yet — the studio says so and uses its standard stage. Your design still saves and publishes the same way.",
      "You picked the wrong product? Go back — every finished step at the top of the wizard is a button that takes you back to it.",
    ],
    keywords: "new design wizard guided start design category subcategory product supplier organize collection folder canvas six steps",
  },
);

HELP_ARTICLES.push(
  {
    slug: "accounting",
    title: "Accounting: invoices, refunds & bills",
    summary: "The money books — what you're owed, what you owe, and the reports that show whether the shop is winning.",
    what: [
      "Accounting is your shop's money book. It keeps the invoices you've sent, the bills you need to pay, and a running record of every movement of money — like the books an accountant keeps, but written in everyday language wherever it can be.",
      "Two reports matter most. Profit & Loss shows what came in and what went out over a period, and what's left. The Balance Sheet shows what the business owns and owes today.",
    ],
    doHere: [
      "Create and send invoices, and chase late ones with a reminder.",
      "Record payments when money arrives or leaves.",
      "Enter bills from suppliers so they're paid on time.",
      "Issue refunds, which are recorded properly in the books automatically.",
      "Read the Profit & Loss and Balance Sheet reports.",
    ],
    tasks: [
      {
        title: "Send an invoice",
        steps: [
          "Go to Accounting → Invoices → “New Invoice”.",
          "Pick the customer, add what you're charging for, and save. It starts as a draft — only you can see it.",
          "Open the invoice and press “Send”. The customer gets it by email.",
          "When they pay, press “Record payment” on the invoice (or mark it paid) so your books stay true.",
        ],
      },
      {
        title: "Chase a late invoice",
        steps: [
          "Go to Accounting → Invoices and click the “Sent” filter to see unpaid ones.",
          "Open the late invoice and press “Remind”.",
          "A polite reminder goes to the customer, and the invoice shows it was sent.",
        ],
      },
      {
        title: "Refund a customer",
        steps: [
          "Find the customer (Customers, at the top) and open their record.",
          "Click “Actions ▾ → Issue refund”, type the amount and the reason, and confirm.",
          "The refund appears in Accounting → Refunds, with the matching book entry written for you. Refunds can't be undone — the money really goes back.",
        ],
      },
      {
        title: "See if the shop made money",
        steps: [
          "Go to Accounting → Reports → Profit & Loss.",
          "Pick the period — this month, last month, this year.",
          "The bottom line is what's left after costs. That's the number that matters.",
        ],
      },
    ],
    ifWrong: [
      "An invoice total looks wrong? Open it and check each line — quantities and prices multiply down the page. Drafts can be edited freely; sent invoices can't be quietly changed (that's deliberate — it keeps the books honest). If a sent invoice is wrong, void it and issue a corrected one.",
      "Voided an invoice by mistake? Voiding writes a reversing entry and can't be undone. Create a fresh invoice with the same details and carry on.",
      "A payment arrived but the invoice still says unpaid? Record the payment against the invoice — the bank and the books only meet when you tell them to.",
    ],
    keywords: "accounting money invoices bills payments refunds profit loss balance sheet bookkeeping journal tax",
  },
  {
    slug: "support",
    title: "Support Desk",
    summary: "Every customer question in one queue — read, reply, and keep your promises on reply times.",
    what: [
      "The Support Desk is where customer questions arrive and get answered. Each question is a “ticket” — a conversation with a reference number, a status, and a person responsible for it.",
      "Tickets are sorted into views on the left: everything open, tickets nobody has claimed, your own tickets, and tickets waiting on the customer to reply.",
    ],
    doHere: [
      "Read and reply to customer tickets.",
      "Assign a ticket to yourself or a teammate.",
      "Mark tickets resolved when the problem is solved.",
      "Start a ticket by hand for a phone call or a walk-in question.",
      "Save your own filtered views of the queue.",
    ],
    tasks: [
      {
        title: "Answer a ticket",
        steps: [
          "Go to Support Desk and click a ticket in the list (or start with Unassigned — tickets nobody has claimed).",
          "Read the conversation from the top.",
          "Write your reply in the box at the bottom and send it. The customer receives it by email.",
          "If the problem is solved, mark the ticket Resolved.",
        ],
      },
      {
        title: "Understand the SLA labels",
        steps: [
          "“SLA” is your promised reply time — for example, “we reply within one business day”.",
          "“Due soon” means the promise deadline is close. Answer those first.",
          "“Breached” means the promise was missed. It's not a punishment — it's a flag that this person has waited longest.",
        ],
      },
      {
        title: "Create a ticket by hand",
        steps: [
          "Click “+ New ticket” at the top of the Support Desk.",
          "Fill in who's asking, what it's about, and their first message.",
          "Click “Create ticket”. It joins the queue like any other.",
        ],
      },
    ],
    ifWrong: [
      "A ticket seems to have vanished? Check the view you're in — “All open” hides resolved tickets. Switch to “All statuses” to see everything ever.",
      "The customer replied but you can't see it? Refresh the page — new replies arrive into the same ticket, under the original conversation.",
    ],
    keywords: "support help desk tickets questions reply customers sla email queue",
  },
  {
    slug: "marketing-social",
    title: "Marketing & social posting",
    summary: "Connect your social accounts once, then write posts and schedule them from one calendar.",
    what: [
      "Under Integrations you'll find your social accounts — Facebook, Instagram, TikTok, and the rest. Connect an account once, and you can write posts, share products, and schedule everything from one calendar inside this admin.",
      "Scheduled posts go out by themselves at the time you picked. You can see what's coming up, and what's already gone out, on the Calendar & queue page.",
    ],
    doHere: [
      "Connect a social account (you sign in on that network's own website — your password never touches this admin).",
      "Share a product as a post in a few clicks.",
      "Schedule posts ahead of time on the calendar.",
      "Check connection health on the Integrations overview.",
    ],
    tasks: [
      {
        title: "Connect a social account",
        steps: [
          "Go to Integrations → Social accounts.",
          "Find the network and click “Connect”.",
          "You'll be taken to that network's own sign-in page. Sign in and approve the connection.",
          "You'll land back here with the account shown as connected.",
        ],
      },
      {
        title: "Share a product to social",
        steps: [
          "Go to Integrations → Share a product.",
          "Pick the product and write your words — keep it short and warm.",
          "Choose “Post now” or pick a date and time to schedule it.",
          "Check the Calendar & queue page to see it lined up.",
        ],
      },
    ],
    ifWrong: [
      "A network says “not configured”? That network needs its app keys added first, in Connections & Keys. Those keys come from the network's developer site — it's a one-time setup.",
      "A scheduled post didn't go out? Open Calendar & queue and check its status. The usual cause is the account was disconnected (a password change can do that) — reconnect it from Social accounts and the queue will carry on.",
    ],
    keywords: "marketing social facebook instagram tiktok posts schedule calendar share promote metricool",
  },
  {
    slug: "connections-keys",
    title: "Connections & Keys",
    summary: "The locked drawer where your secret keys live — what keys are, where to find them, and how to save them.",
    what: [
      "Some services need a secret key before your shop can talk to them — like a password the shop uses, instead of a person. Stripe (card payments), your printers, and the tools that count your visitors all work this way.",
      "Connections & Keys is where those keys live. Each service has a card written in plain language: what the service does, where to find its key, and a box to paste it into. Saved keys are stored locked away (encrypted — scrambled so nobody can read them), and are never shown again. The page only ever shows the last four characters, so you can tell which key is which.",
    ],
    doHere: [
      "Connect Stripe so you can take card payments.",
      "Connect your printers (Printful, Gelato, and the others) with the keys they gave you.",
      "Connect the visitor counters — Google Analytics (GA4) and PostHog — so you can see how many people visit your shop and what they look at.",
      "Connect Metricool if you use it for social reporting.",
      "Replace a key any time by pasting the new one and pressing Save.",
    ],
    tasks: [
      {
        title: "Save a key, step by step",
        steps: [
          "Go to Integrations → Connections & Keys.",
          "Find the service's card. It tells you, in plain words, where the key lives on that service's website — and there's a button that opens that website for you.",
          "Copy the key from their website.",
          "Come back here, paste it into the box, and press Save.",
          "The card turns to “✓ Connected”. That's it — the shop starts using the key straight away.",
        ],
      },
      {
        title: "Replace a key",
        steps: [
          "Open the service's card. Where a key exists, you'll see “Saved here (ends in …)” with its last four characters.",
          "Paste the new key into the box — the label says “Paste a new value to replace it”.",
          "Press Save. The new key takes over immediately.",
        ],
      },
      {
        title: "Remove a key you saved here",
        steps: [
          "On the service's card, click “Remove” next to the saved field.",
          "That deletes the copy saved on this page. If the same key also lives on the server (set up behind the scenes), the server's copy will be used instead — the card tells you which is which.",
        ],
      },
    ],
    ifWrong: [
      "You pasted a key and nothing connected? Check for stray spaces at the start or end — copy it again carefully. Also check you pasted it into the right box: some services have two values (a public ID and a secret key), and the card labels each one.",
      "You need to see a key you saved? You can't — that's deliberate, and it protects you. If a key is lost, make a new one on the service's website and paste it here to replace the old one.",
      "A service says “On the server”? Its key was set up behind the scenes by whoever built the shop. You can leave it alone, or paste your own key here — yours will be used first.",
    ],
    keywords: "keys secrets api stripe posthog ga4 google analytics metricool printful gelato prodigi gooten teemill spreadconnect pollinations algolia resend connect password encrypted",
  },
  {
    slug: "store-api",
    title: "Your Store API (for your other app)",
    summary: "A safe, read-only way for another app or website of yours to show this shop's products.",
    what: [
      "You may have another app or website that should show this shop's products. The Store API is the bridge: you create one special key, paste it into the other app, and that app can read your published product list.",
      "“API” is just the name for how two pieces of software talk to each other. This one is read-only on purpose: the other app can look, but it cannot change anything, and it cannot see orders or customers.",
    ],
    doHere: [
      "Create your Store API key and copy it (it's shown only once).",
      "Paste the key into your other app.",
      "Turn the API off, or replace the key, whenever you like.",
    ],
    tasks: [
      {
        title: "Create your key",
        steps: [
          "Go to Integrations → Connections & Keys and scroll to “Your Store API”.",
          "Click “Create my key”.",
          "Copy the key that appears right away — for your safety it is never shown again.",
          "Paste it into your other app. The address it should read is shown on the same card.",
        ],
      },
      {
        title: "Replace or switch off the key",
        steps: [
          "To replace it: click “Create a new key”. The old key stops working the moment the new one is created.",
          "To switch it off completely: click “Turn off”. Your other app won't be able to read products until you create a new key.",
        ],
      },
    ],
    ifWrong: [
      "You lost the key before copying it? No harm done — just create a new one. The lost one stops working.",
      "The other app says “unauthorised” (or shows a 401 error)? Its key doesn't match. Create a fresh key here and paste it into the other app again.",
      "Products are missing from the feed? Only published products are shared. Drafts and hidden products stay private.",
    ],
    keywords: "api store feed other app website key developer integration read only products",
  },
  {
    slug: "users-roles",
    title: "User management & roles",
    summary: "Who can sign in to this admin, and what each person is allowed to see and do.",
    what: [
      "Under Admin Users you control who can sign in to this admin besides you — a helper, a bookkeeper, a family member. Each person gets their own sign-in and a role, which is simply the set of doors their key opens.",
      "Roles keep people in their lane: someone who helps with support doesn't need to see the books, and the books stay tidy because only the right people can touch them.",
    ],
    doHere: [
      "Invite a new admin user and choose their role.",
      "Change someone's role when their job changes.",
      "Remove access for someone who no longer helps.",
    ],
    tasks: [
      {
        title: "Add a new admin user",
        steps: [
          "Go to Admin Users (under Settings at the top).",
          "Click the button to add or invite a user, and type their email address.",
          "Choose their role — pick the smallest role that lets them do their job.",
          "Save. They'll be able to sign in with their own account.",
        ],
      },
      {
        title: "Take access away",
        steps: [
          "Go to Admin Users and find the person.",
          "Remove or deactivate their account.",
          "They can no longer sign in. Everything they did stays in the records — only their access ends.",
        ],
      },
    ],
    ifWrong: [
      "Someone can't see a page they need? Their role doesn't include that part of the admin. Edit their role under Admin Users.",
      "You invited someone and they never appeared? Ask them to check their email (including the spam folder) for the invitation, and make sure the address was typed exactly right.",
    ],
    keywords: "users roles staff team permissions admin accounts invite access sign in people",
  },
  {
    slug: "settings",
    title: "Settings",
    summary: "The shop-wide choices: your storefront's look, your website pages, and the admin's own housekeeping.",
    what: [
      "Settings is where the shop-wide choices live — the things that aren't about one order or one customer. From here you reach your website's pages and content, your shop's details, and the admin tools that keep everything running.",
      "Most settings are set once and left alone. Change them one at a time, and check the shop afterwards — the storefront link at the top of the admin opens your live shop so you can see exactly what customers see.",
    ],
    doHere: [
      "Edit your website's pages and words in the Website CMS.",
      "Adjust shop-wide details like names, emails, and addresses.",
      "Open your live storefront to check how changes look to customers.",
    ],
    tasks: [
      {
        title: "Change words on your website",
        steps: [
          "Go to Website (under Settings) and open the CMS — the content editor.",
          "Find the page and the words you want to change.",
          "Edit, save, then open your storefront from the top of the admin to see it as customers do.",
        ],
      },
      {
        title: "Check the shop like a customer",
        steps: [
          "Click “Storefront” at the top of the admin.",
          "Your live shop opens. Browse it, open a product, and check everything reads the way you want.",
          "Anything wrong? Note the page name, then fix the words in the CMS or the product in Products.",
        ],
      },
    ],
    ifWrong: [
      "A change didn't appear on the live shop? Give it a minute and reload — the shop refreshes itself shortly after changes. If it's still stale after a few minutes, re-save the page or product.",
      "Not sure what a setting does? Rest your mouse on it — the note explains it. If there's no note and you're unsure, leave it as it is and check here in the Help Center first.",
    ],
    keywords: "settings website cms storefront shop details configuration preferences",
  },
  {
    slug: "analytics",
    title: "Analytics & Reports",
    summary: "How the shop is doing — order value, orders, money collected, refunds, and returns — plus a way to ask your own questions of the records.",
    what: [
      "Analytics & Reports is the shop's scoreboard. Its figures come straight from the shop's own records: orders placed, payments that succeeded, refunds issued, and returns on file. Nothing here is guessed — if a figure can't be read, the page says so instead of showing a made-up number.",
      "The figures are grouped so you can tell two things apart that look alike: order value (what customers ordered, even before payment) and cash collected (payments that actually succeeded). Revenue is not profit — profit lives in the Accounting reports, after expenses.",
    ],
    doHere: [
      "See the shop's headline figures: order value, orders, cash collected, refunds, and returns.",
      "Break orders down by status to see what's still moving through the shop.",
      "Open Reports Explorer to ask your own question of the records and download the answer.",
    ],
    tasks: [
      {
        title: "See how the shop is doing",
        steps: [
          "Open Analytics & Reports from the menu.",
          "Read the headline figures at the top: order value, orders, cash collected, refunds issued, and returns on record.",
          "Check the orders-by-status list underneath to see where orders sit right now.",
          "For the money story in full — profit, the balance sheet, the trial balance — follow the Reports doors to the Accounting reports.",
        ],
      },
      {
        title: "Ask your own question in Reports Explorer",
        steps: [
          "From Analytics & Reports, open Reports Explorer.",
          "Pick what you want to count and over how many days, then run it to see it day by day.",
          "Download the result as a spreadsheet if you want to keep it or share it.",
          "Saved questions can run on a schedule, so a regular report lands without you asking twice.",
        ],
      },
    ],
    ifWrong: [
      "A figure shows nothing at all? That usually means there are no records of that kind yet — an empty shop shows honest zeros, not errors. If the whole page says its figures aren't reaching it, try again in a minute; the report doors below still read the same records.",
      "Order value and cash collected don't match? They shouldn't: order value counts orders when they're placed, cash collected counts payments that succeeded. Unpaid orders explain the gap.",
    ],
    keywords: "analytics reports figures revenue orders refunds returns explorer statistics scoreboard",
  },
  {
    slug: "trust-safety",
    title: "Trust & Safety",
    summary: "The desk that keeps the shop fair and safe: identity checks, risk, disputes, fraud review, policies, moderation, appeals, and the audit trail.",
    what: [
      "Trust & Safety is where the shop's safety work lives. Identity and business checks, risky orders and listings, disputes and chargebacks, fraud investigations, the shop's policies, items held for moderation, appeals against decisions — and the audit log that records every decision, so nothing happens in secret.",
      "Work here is review work: look at the evidence on each case, decide, and the decision is written to the audit log. Nothing here changes an order or a payment by itself — money actions go through their own approvals.",
    ],
    doHere: [
      "Review identity and business checks waiting for a decision.",
      "Work through open violations, disputes, and fraud investigations, one case at a time.",
      "Check the moderation queue and the audit log.",
    ],
    tasks: [
      {
        title: "Review a case waiting for a decision",
        steps: [
          "Open Trust & Safety from the menu and pick the section on the left — verification, risk, disputes, fraud, moderation, or appeals.",
          "Open the case and read what's on file: what happened, when, and what evidence is attached.",
          "Decide, and record the decision. It lands in the audit log automatically.",
        ],
      },
      {
        title: "Check the audit trail",
        steps: [
          "Open Trust & Safety and pick the Audit Log section.",
          "Find the decision you want to check — every trust decision is on the record, with who made it and when.",
        ],
      },
    ],
    ifWrong: [
      "A case looks empty? Some cases arrive with only a report and no evidence yet — check back after the next update, or look for the same person or listing in the other sections.",
      "You decided something and can't find it? Look in the Audit Log — if it's not there, the decision didn't save, and the case is still waiting.",
    ],
    keywords: "trust safety verification risk disputes fraud moderation appeals audit compliance policies identity",
  },
);

HELP_ARTICLES.push(
  {
    slug: "connect-a-service-wizard",
    title: "Connect a service, step by step — the guided way",
    summary: "Four short steps that connect one service and then prove it works, by reading something real back from your account.",
    what: [
      "“Connect a service — step by step” is the guided way to plug a service into your shop — Stripe, a printer like Printful, your email sender, and the rest. It does exactly the same saving as the Connections & Keys page (the same locked store, the same cards), just one decision at a time, with each step explained. You will find it at the top of Integrations → Connections & Keys.",
      "The important part is the last step. Saving a key only proves the key was typed in — it does not prove the key works. So Step 4 tests it: the shop connects to the service with your key and reads something real back — your account's name, how many products it can see — and shows that to you as the proof line, like “Connected — Printful, account …, 12 products readable.” Only words the service itself sent back ever appear in that line.",
    ],
    doHere: [
      "Connect one service at a time, in four steps: pick it, see what it does, paste its key, watch the test.",
      "See the proof line when the test passes — and find the same line on the service's Connections & Keys card.",
      "When a test fails, read the exact reason and what to fix, then go back to Step 3 and try again.",
      "Learn which services cannot be test-read, and what was checked for them instead (the key is saved, and its last four characters).",
    ],
    tasks: [
      {
        title: "Connect a service, step by step",
        steps: [
          "Step 1 — Pick the service: services are grouped in plain words (Suppliers, Money, Social, Store tools). One that is already connected says so — you can still pick it to replace its key.",
          "Step 2 — What it does: one short paragraph about the service, exactly what you will need (usually its API key), and a button that opens the service's own website, where the key lives.",
          "Step 3 — Paste the key: paste it into the box and press “Save & test it”. The key is stored locked (encrypted) and is never shown again — only its last four characters. A sentence on this step reminds you that the test comes next.",
          "Step 4 — We test it: the test runs by itself. If it passes, you see the proof line with your account's real name and counts. If it fails, you see the reason in plain words and what to fix, with a button straight back to Step 3.",
        ],
      },
      {
        title: "Test a service again from its card",
        steps: [
          "Go to Integrations → Connections & Keys and find the service's card.",
          "Click “Test connection” at the bottom of the card.",
          "The result shows right there on the card: the proof line when it passes, the reason and the fix when it does not.",
          "A proof line from an earlier test (here or in the guide) stays on the card in this browser, with the date and time it was tested. Press “Test connection” any time to run it fresh.",
        ],
      },
    ],
    ifWrong: [
      "The test says the key was not accepted? Copy it again, fresh, from the service's own website — keys are long, and one missing character or a stray space at either end is the usual cause. If you made a new key on their website, the old one stops working, so paste the newest.",
      "The test says a service “cannot be test-read yet”? That is the shop being honest, not your key failing. Some services give no way to read an account back (a Google Analytics Measurement ID is just a label; a PostHog project key can only send information in). For those, the step shows what WAS checked instead: that your key is saved, and its last four characters.",
      "Resend connects but no emails arrive? The test reads your sending domains. Resend can only send once a domain is added and verified over on Resend's website — that part is done with whoever looks after your domain's settings, and the test will name the verified domain once it exists.",
      "Stripe connects but says the account cannot take payments yet? Stripe still needs its own setup finished inside Stripe (identity and bank details). The key is fine — the account setup is the remaining step, and it is done on Stripe's website.",
    ],
    keywords: "connect a service wizard guided steps test proof connected printful stripe gelato prodigi resend algolia api key connections test connection",
  },
);

HELP_ARTICLES.push(
  {
    slug: "publish-wizard",
    title: "Publish a design — the Publish wizard",
    summary: "Six short steps that take a finished design to a live product page: product, print checks, collection, price, destinations, publish — ending on the real page, not a message.",
    what: [
      "The Publish wizard is the guided way to put a design on sale. Instead of one crowded review panel, you walk through one decision at a time, and every check happens inside the steps — never as a surprise at the end.",
      "You open it from the Design Studio: finish your design, press “Save design”, click “Review & publish”, then “Publish wizard — step by step”. The wizard opens with your design already loaded. Nothing goes on sale until the very last step, and you can go back at any step — every finished step at the top is a button that takes you back to it.",
    ],
    doHere: [
      "Confirm the exact product, supplier, and colour the design is bound to.",
      "See the sharpness (DPI) and print-area checks pass or fail, in plain words, against the supplier's real captured requirements.",
      "File the design into a collection — or publish a whole collection together — with the one-supplier rule checked for you.",
      "Set the price in order: the supplier's captured cost, the suggested price worked out from it, then your final price.",
      "Choose where the publish goes: your shop, your social accounts, or both.",
      "End on the live product page itself — the proof it worked.",
    ],
    tasks: [
      {
        title: "Publish a design, step by step",
        steps: [
          "Step 1 — The product: check the product, supplier, garment colour, and print areas are the ones you designed on. These are the studio's own saved values, shown back to you.",
          "Step 2 — Artwork & print checks: the sharpness gate lives here (not in a bar over the canvas). Every check runs against the supplier's captured print spec, and the page says when those specs were captured. A failed check holds the step — fix it in the studio (a bigger original picture, artwork moved inside the print area), save, and open the wizard again.",
          "Step 3 — Collection: pick the collection this design belongs to, create a new one, or choose “No collection”. If you tick “Publish the whole collection together”, every design filed in that collection goes live in one run at the last step.",
          "Step 4 — Price & details: confirm the title, the category (the shelf it sits on, shown as a path), and the description. Then the price in order: (1) the supplier's captured cost with the date it was last checked, (2) the suggested price — the cost divided by (1 − your target margin) — and (3) your final price, which you can type yourself. Press “Use suggested price” if you want the suggestion as-is.",
          "Step 5 — Destinations: shop only, shop + social, or social only. Social posting only offers accounts that are actually connected, with their names — pick the ones the post should go to and check the post's words.",
          "Step 6 — Publish: read the summary once, then press Publish. The wizard publishes through the same path as the studio's own Publish button and ends on the live product page — open it and see exactly what your customers see.",
        ],
      },
      {
        title: "Understand “Price not captured yet”",
        steps: [
          "Supplier costs are captured ahead of time, on a schedule, from what each supplier actually charges — the wizard never guesses a price.",
          "If no cost has been captured for this design's supplier, Step 4 says exactly that, and no suggested price appears. Type your final price yourself; it is saved exactly as typed.",
          "As costs are captured, the cost line and the suggested price appear in Step 4 automatically.",
        ],
      },
      {
        title: "Fix a “collection locked” warning in Step 3",
        steps: [
          "A collection can only use one printer (supplier), so customers get one parcel. If the collection already holds designs from another supplier, Step 3 names both suppliers and stops.",
          "Either pick a different collection, or create a new collection for this design's supplier right there in Step 3.",
        ],
      },
      {
        title: "Share to social media as you publish",
        steps: [
          "Connect your accounts first, under Integrations → Social accounts — you sign in on the network's own site, and your password never touches this admin.",
          "In Step 5 choose “Storefront + social media”, tick the connected accounts, and edit the post's words.",
          "Publish in Step 6. The product goes live first, then the post goes out with the product's picture and its live shop link. Step 6 tells you plainly whether the post went live.",
          "“Social media only” works when the product page is already live (or the whole collection is being published in the same run) — a post has to link somewhere.",
        ],
      },
    ],
    ifWrong: [
      "Step 2 will not let you continue? A print check failed. The failed check says what is wrong in plain words — the fix always happens in the studio, then save and reopen the wizard. Checks are never skippable, because the printer would get the same problem.",
      "Publishing stopped with a review-check message in Step 6? That is the same safety check the studio runs, reading the design as saved. It names the exact problem (usually title, price, category, or artwork) — fix it in the step it belongs to and press Publish again.",
      "You published a whole collection and it stopped partway? One design in the collection is missing its title or price. Designs already published in that run stay live; fix the one it named and publish the collection again — live designs are updated, not duplicated.",
      "The social post did not go live but the product did? The product page is still your proof — Step 6 says why the post failed (usually an account was disconnected). Reconnect it under Integrations → Social accounts and share the product afterwards from Integrations → Share a product.",
      "No print file yet? Step 6 shows whether one is on record. Print files are made from the canvas in the studio (“Export print files”) — publishing here does not create one, so export before orders come in.",
    ],
    keywords: "publish wizard steps collection price cost suggested margin destinations social storefront live product url dpi preflight publish a collection",
  },
);

HELP_ARTICLES.push(
  {
    slug: "create-a-social-post-wizard",
    title: "Create a social post, step by step — the guided way",
    summary: "Five short steps that write one post and shape it for every network: what you're sharing, your words with live previews, where it goes, when, and send.",
    what: [
      "“Create a social post — step by step” is the guided way to write a post for your social accounts. You will find it at the top of Integrations → Share a product. Instead of one crowded composer, you make one decision at a time, and you see the post exactly as each network will receive it before anything is sent.",
      "Being honest about where it stands: the first three steps work today — picking what to share, writing with the live previews, and choosing your connected accounts. The last two steps (when it goes out, and sending it) are marked “Next checkpoint” inside the wizard and are being finished; until they open, Share a product and Calendar & queue remain the working way to send and schedule posts, exactly as today.",
    ],
    doHere: [
      "Share a product that is already live in your shop — its photo, title, and shop link attach themselves.",
      "Or start a fresh announcement by uploading a photo.",
      "Write your words once and watch a live preview per network, with a friendly character count under each.",
      "Choose where the post goes, from your real connected accounts with their real names. A network that is not connected says “Connect first” and takes you to the Connect a Service wizard — never a dead end.",
    ],
    tasks: [
      {
        title: "Create a social post, step by step",
        steps: [
          "Step 1 — What are you sharing? Pick a published product (only products already live in the shop are listed, with their real photo and shop link), or choose a fresh announcement and upload a photo. Photos upload to the same media store as every photo in this admin, up to 10 MB.",
          "Step 2 — Write it: one box for your words. When you picked a product, a starter caption with its name is filled in for you to edit. Beside the box, each network shows its own preview — your words, the photo, and the shop link where that network attaches it — with a character meter under it. A meter that goes over a network's limit says so in plain words, right there: shorten the words, or leave that network unticked in Step 3.",
          "Step 3 — Where: tick the networks. Each one shows the account that will post, by its real name; if you have two accounts on one network, pick which one. A network with no connected account cannot be ticked — it says “Connect first” and links to the Connect a Service wizard.",
          "Steps 4 and 5 — When, and Review & send: these arrive in the next checkpoint. The wizard shows them in the stepper so you can see the whole journey, and Step 5 already shows your finished post back to you for checking — but there is no Send button yet, and nothing on the page can post.",
        ],
      },
      {
        title: "Send a post today, while Steps 4–5 are finished",
        steps: [
          "Go to Integrations → Share a product and press Share on the product — the same composer as always, with Post now, Schedule, and Save draft.",
          "Scheduled posts appear under Integrations → Calendar & queue, and the background publisher sends each one when its time comes.",
          "Anything you picked or wrote in the wizard is not saved anywhere — the wizard holds it only while the page is open. If you leave, start the post in Share a product instead.",
        ],
      },
    ],
    ifWrong: [
      "Step 3 lists every network as “Connect first”? That means no social accounts are connected yet — it is the honest state, not an error. Connect one through the Connect a Service wizard (Integrations → Connections & Keys), then finish the sign-in under Integrations → Social accounts, on the network's own website. Your password never touches this admin.",
      "A preview says a network needs a photo, or a video? That is the network's real rule, read from the posting engine: Instagram and Pinterest refuse a post with no photo, and YouTube only takes video files (mp4 or mov), so a photo post can never go to YouTube. Give the post a photo in Step 1, or leave those networks unticked in Step 3.",
      "A product you expected is missing from Step 1? Only published products are listed — a draft product has no live shop page for the post to link to. Publish it first (Design Studio → Publish wizard), then come back.",
      "The photo upload failed? Photos must be images up to 10 MB — the same limit as everywhere in this admin. Try a smaller file, or the product's own photo by picking the product instead.",
    ],
    keywords: "create a social post wizard guided steps share product announcement caption preview character count facebook instagram x tiktok pinterest linkedin youtube threads connect first schedule send",
  },
);

HELP_ARTICLES.push(
  {
    slug: "add-a-customer",
    title: "Adding a customer, step by step",
    summary: "The guided way to put a new person in your customer list — who they are, where they live, and a first note so nothing about them is forgotten.",
    what: [
      "Every person who buys from you lands in the customer list on their own when they check out. But people also walk in, call, or get recommended by a friend — and those people need adding by hand, or the next order has nothing to attach to.",
      "The Add step by step guide asks one thing at a time and shows you the finished customer at the end, as proof they're really in. The plain New Customer button does the same saving in one quick form, for when you already know the shape of it.",
    ],
    doHere: [
      "Add a customer with their name and a way to reach them.",
      "Save their address so checkout and shipping never ask twice.",
      "Leave a first note — what they're grieving, what they love, what they asked you to check on.",
      "Set a follow-up date so they don't slip away quietly.",
    ],
    tasks: [
      {
        title: "Add a customer with the guide",
        steps: [
          "Go to CRM → Customers and press “Add step by step”, next to New Customer.",
          "Step 1 — Who they are: their first name, and an email or a phone number (you need at least one way to reach them).",
          "Step 2 — Where they live: optional, but worth having. Press Continue either way.",
          "Step 3 — A first note: anything worth remembering, plus a follow-up date if they asked you to check back. Then press “Add this customer”.",
          "The last screen shows the customer as they now exist in your list — that's your proof. “Open their profile” takes you straight to them.",
        ],
      },
    ],
    ifWrong: [
      "The Continue button won't light up on Step 1? A first name and at least one of email or phone are required — the note under the form says which is missing.",
      "You added someone twice? Don't delete anything — open one of the profiles and keep the one with the note and address on it; duplicates from checkout merge by email on their own.",
      "The note didn't save? The customer themselves is safe — open their profile, go to Notes & Activity, and add the note there.",
    ],
    keywords: "add new customer step by step guide wizard crm directory first note follow up address",
  },
);

HELP_ARTICLES.push(
  {
    slug: "order-problem",
    title: "When something's wrong with an order",
    summary: "The guided way to record an order problem — it finds the order, asks what happened, and opens a support case with the whole story attached.",
    what: [
      "Orders go wrong sometimes: a package stalls, a mug arrives cracked, a customer writes in upset. What matters is that the problem lands in one place, with the order attached, where the whole team can see it and pick it up.",
      "The Report a problem guide does that. It opens a case in the Support Desk — recording the problem does NOT write to the customer. Replying to them is a separate, deliberate step inside the case, when you're ready.",
    ],
    doHere: [
      "Find any order by its number, the buyer's name or email, or the product name.",
      "Say what happened in one pick: never arrived, damaged, wrong item, refund, address problem, or something else.",
      "Write down what the customer said, and how urgent it is.",
      "Get the case reference as proof, and jump straight into the case.",
    ],
    tasks: [
      {
        title: "Report an order problem",
        steps: [
          "Go to Orders and press “Report a problem”.",
          "Step 1 — Find the order: type the order number, buyer email, or product name, press Search, and pick the order from the list.",
          "Step 2 — What happened: pick the closest description.",
          "Step 3 — The details: what the customer said, in their words where you can, and how urgent it is. Press “Open the case”.",
          "The last screen shows the case reference — that's your proof. “Open the case” takes you into the Support Desk, where you can reply to the customer when you're ready.",
        ],
      },
    ],
    ifWrong: [
      "Search finds nothing? Try the buyer's email exactly as it appears on the order, or the product name — and check for a typo in the order number.",
      "You opened a case twice for the same problem? Work in the first one and close the second from the Support Desk queues, so the story stays in one place.",
      "The customer needs an answer right now? Open the case and use its reply box — that's the step that actually writes to them.",
    ],
    keywords: "order problem report damaged never arrived wrong item refund address support case wizard guided",
  },
);

HELP_ARTICLES.push(
  {
    slug: "chart-of-accounts-wizard",
    title: "Build your chart of accounts",
    summary: "Start from the basic chart or add your own accounts — your names, your numbers, in the right bands.",
    what: [
      "The chart of accounts is the list of buckets every dollar gets sorted into — one for cash, one for what customers owe you, one for each kind of cost. The wizard builds it with you, step by step.",
      "Numbers follow a simple pattern: 1000s are things you own (assets), 2000s are things you owe (liabilities), 3000s are your stake (equity), 4000s are money earned (revenue), and 5000s and up are costs. Inside each thousand there are bands — current assets are 1000–1399, fixed assets 1400–1699, and so on.",
    ],
    doHere: [
      "Start from the basic chart and tick the standard accounts you want",
      "Add your own account with any name you like",
      "Pick the band an account belongs in and assign its number",
      "See exactly what was created when you finish",
    ],
    tasks: [
      {
        title: "Start from the basic chart",
        steps: [
          "Open Accounting → Books → Chart of Accounts and choose New Account Wizard.",
          "Choose “Start from the basic chart”.",
          "Tick the accounts you want. Accounts already in your chart are marked and will not be duplicated.",
          "Choose Create. The last screen lists every account created, with its number.",
        ],
      },
      {
        title: "Add your own account",
        steps: [
          "In the wizard, choose “Add my own account”.",
          "Pick what kind of account it is — the descriptions say what belongs in each band.",
          "Give it a name and a number. The wizard suggests the next free number in the band; you can change it to any free number in that band.",
          "If the account reduces another one (like Accumulated Depreciation), tick the “reduces” box.",
          "Choose Create account. It is in your chart right away.",
        ],
      },
    ],
    ifWrong: [
      "If a number is refused, it is either already used or outside the band for that kind of account — the wizard says which, and suggests a free one.",
      "Created an account in the wrong band? Accounts cannot be renumbered once entries post to them. Make a new one in the right band and leave the old one unused.",
    ],
    keywords: "chart of accounts wizard add account gl ledger numbering bands assets liabilities equity revenue expenses",
  },
);

export function getArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}
