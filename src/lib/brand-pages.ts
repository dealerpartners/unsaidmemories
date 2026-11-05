/**
 * Brand pages — the owner's fifteen finished footer pages, ported
 * faithfully (design + copy authority: his HTML in
 * notes/footer-source/). Each entry carries his hero, intro, numbered /
 * tagged "ways in" tiles and point-of-view statement verbatim; only
 * link targets are mapped to real routes, and the two places where his
 * copy stated a pre-launch fact that the build itself changed (the
 * track-order "not connected yet" line) are corrected and reported.
 */

export interface BrandTile {
  /** Numbered tiles use "01".."05"; tagged tiles use e.g. "EMPLOYEE MOMENTS". */
  tag: string;
  title: string;
  body: string;
  foot?: string;
}

export interface BrandPageData {
  slug: string;
  /** <title> text from his page. */
  title: string;
  eyebrow: string;
  h1: string;
  h1Em: string;
  heroCopy: string;
  cta: { label: string; href: string };
  art: { icon: string; title: string };
  introTitle: string;
  introParas: string[];
  sectionTitle: string;
  tiles: BrandTile[];
  statement: { title: string; body: string; ctaLabel: string; ctaHref: string };
}

const KEEP = "Keep the object. Keep the story.";
const KEEP_PARA = `${KEEP} That is the idea at the heart of Unsaid Memories.`;
const ASIDE_NOTE =
  "Thoughtful by design. Clear about what is available today, what depends on the product and where a personal conversation can help.";

export const BRAND_ASIDE = ASIDE_NOTE;

export const brandPages: BrandPageData[] = [
  {
    slug: "how-it-works",
    title: "How it works — Unsaid Memories",
    eyebrow: "A PLACE FOR THE THINGS THAT MATTER",
    h1: "A memory is more than something you remember.",
    h1Em: "It’s something you can keep.",
    heroCopy:
      "Unsaid Memories brings the physical and digital sides of remembering together: a place to gather the meaningful things, ways to make them part of everyday life, and thoughtful tools to help a story travel further.",
    cta: { label: "Find your memory box", href: "/gift-finder" },
    art: { icon: "✳", title: "Gather · Preserve · Share" },
    introTitle: "Start with what you want to hold onto.",
    introParas: [
      "A photograph tucked into a drawer. A voice note you can’t bear to lose. A handwritten recipe with the old measurements. A story everyone remembers differently. The things that carry a life are rarely just one thing—and they deserve more than a folder you hope you’ll find again.",
      KEEP_PARA,
    ],
    sectionTitle: "A clearer path, step by step.",
    tiles: [
      { tag: "01", title: "Give it a place", body: "The Memory Box is the anchor: a physical home for photographs, letters, keepsakes and the small objects that make a person unmistakably themselves. Start with what you have. There is no perfect order and no right amount to collect.", foot: "A home for the tangible" },
      { tag: "02", title: "Bring the story with it", body: "Memory Links connect an object to the story behind it. A QR or NFC touchpoint can lead to a voice, a video, a note, a photograph or a longer family story—so the meaning doesn’t have to fit on the back of the frame.", foot: "The object opens the story" },
      { tag: "03", title: "Preserve what time changes", body: "Photographs fade, formats become outdated and details get harder to recall. Restoration and thoughtful digital preservation help keep originals and their context together, with the original remaining part of the story.", foot: "Care for the original" },
      { tag: "04", title: "Share it across generations", body: "Invite family and friends to contribute their own memories and perspectives. A shared story becomes richer when it holds more than one voice—and when the next generation can add to it.", foot: "Many voices, one story" },
      { tag: "05", title: "Make it part of life", body: "Not every memory belongs behind glass. Wear it, use it, display it, gift it. The marketplace turns personal meaning into objects and rituals that can live alongside the everyday.", foot: "Meaning in the everyday" },
    ],
    statement: {
      title: "Start with one thing you never want to lose.",
      body: "A box, a photograph, a recipe, a voice. Begin wherever the meaning already is.",
      ctaLabel: "Take the next step",
      ctaHref: "/gift-finder",
    },
  },
  {
    slug: "gift-finder",
    title: "Gift finder — Unsaid Memories",
    eyebrow: "A MORE PERSONAL WAY TO GIVE",
    h1: "Find a gift that says",
    h1Em: "I know your story.",
    heroCopy:
      "The best gift is rarely the most expensive or the most elaborate. It is the one that feels unmistakably chosen. Start with the person, the moment or the memory—and find a meaningful way to make it tangible.",
    cta: { label: "Explore the collection", href: "/shop" },
    art: { icon: "✦", title: "A gift with a story" },
    introTitle: "Choose the feeling before the thing.",
    introParas: [
      "A gift can mark a beginning, honour a bond, bring a family together or keep someone close. Use these starting points to find the right direction. Each collection is a prompt, not a rule: the most meaningful choice is the one that fits the person receiving it.",
      KEEP_PARA,
    ],
    sectionTitle: "A few useful ways in.",
    tiles: [
      { tag: "01", title: "For a new beginning", body: "Welcome a new baby, celebrate a new home or mark the start of a new chapter. Choose keepsakes that can gather firsts, messages and little details as the story unfolds.", foot: "New baby · New home · New chapter" },
      { tag: "02", title: "For the people who raised you", body: "Give a parent, grandparent or chosen-family elder something that honours the everyday things they passed on: a phrase, a recipe, a tradition, a way of seeing the world.", foot: "Parents · Grandparents · Mentors" },
      { tag: "03", title: "For a shared life", body: "Celebrate a wedding, anniversary, friendship or family milestone with something that holds the story of how two lives became one shared one.", foot: "Weddings · Anniversaries · Friendship" },
      { tag: "04", title: "For remembrance", body: "When words feel small, a considered keepsake can offer a place for photographs, stories and the details people want to carry forward. Let the person and the family set the pace.", foot: "Remembrance · Tribute · Legacy" },
      { tag: "05", title: "For the whole group", body: "Bring a team, class, family or community into the gift. Shared contributions make a collective memory—one that no single person could have made alone.", foot: "Teams · Schools · Family gatherings" },
    ],
    statement: {
      title: "The meaning comes first. The gift follows.",
      body: "Explore keepsakes, Memory Links and ways to preserve the story behind the object.",
      ctaLabel: "Take the next step",
      ctaHref: "/shop",
    },
  },
  {
    slug: "guides-stories",
    title: "Guides & stories — Unsaid Memories",
    eyebrow: "IDEAS FOR KEEPING WHAT MATTERS",
    h1: "Every keepsake has",
    h1Em: "a story behind it.",
    heroCopy:
      "A practical, thoughtful library for capturing family stories, caring for photographs, creating memory rituals and giving gifts with meaning. Start with a question. Follow the story where it leads.",
    cta: { label: "Explore the shop", href: "/shop" },
    art: { icon: "✎", title: "Keep the details" },
    introTitle: "Useful guidance. Human stories. No perfect way to remember.",
    introParas: [
      "Memory keeping is personal. Some people begin with a carefully labelled archive; others start with a shoebox, a voice memo or a question asked over dinner. These guides are here to make the first step easier—not to turn remembering into another job.",
      KEEP_PARA,
    ],
    sectionTitle: "A few useful ways in.",
    tiles: [
      { tag: "GUIDE 01", title: "Build a family memory box", body: "A simple approach to choosing an anchor box, sorting photographs and letters, adding context, and deciding what should stay private. Start with a single person, place or chapter rather than trying to document everything at once.", foot: "A practical starting point" },
      { tag: "GUIDE 02", title: "Questions that open a story", body: "Go beyond dates and names. Ask about the first home, the song in the kitchen, the person who taught them to cook, the thing they wish they had kept. Leave room for pauses and unexpected answers.", foot: "Conversation prompts" },
      { tag: "GUIDE 03", title: "Care for old photographs", body: "Handle prints by their edges, keep them away from direct sunlight and damp, and record names, dates and places while someone can still identify them. Preserve the original alongside any digital copy or restoration.", foot: "Preservation basics" },
      { tag: "GUIDE 04", title: "Make a Memory Link", body: "Choose the object, decide what story belongs with it, and add a link that makes the context easy to reach. Keep the linked content intentional, accessible to the right people and reviewed over time.", foot: "Object-to-story guide" },
      { tag: "STORY", title: "The ordinary things become extraordinary", body: "A chipped mug, a familiar handwriting style, a voice saying your name. Explore why everyday details often become the memories people reach for first.", foot: "A reflection on meaning" },
    ],
    statement: {
      title: "You don’t have to capture it all.",
      body: "One good question, one saved photograph, one story shared today is a meaningful beginning.",
      ctaLabel: "Take the next step",
      ctaHref: "/shop",
    },
  },
  {
    slug: "kinnectai",
    title: "KinnectAI — Unsaid Memories",
    eyebrow: "THE LARGER VISION",
    h1: "The story doesn’t end at the keepsake.",
    h1Em: "It connects us.",
    heroCopy:
      "Unsaid Memories is the tangible, giftable expression of a larger idea: helping people preserve the stories, voices and relationships that make a family a family. KinnectAI is the wider platform vision behind that idea.",
    cta: { label: "Discover the marketplace", href: "/" },
    art: { icon: "∞", title: "Connection across generations" },
    introTitle: "One human need. More than one way to meet it.",
    introParas: [
      "People want to remember—and they want to belong. A keepsake gives a memory a physical home. A connected family story can give it context, invite more voices and help it reach the people who may never have heard it. The marketplace and the platform serve different parts of that same human need.",
      KEEP_PARA,
    ],
    sectionTitle: "A few useful ways in.",
    tiles: [
      { tag: "01", title: "Unsaid Memories: the tangible layer", body: "The marketplace focuses on physical keepsakes, Memory Boxes, Memory Links, restoration and meaningful gifts. It helps people begin with objects and stories they can hold, display, share and pass along.", foot: "Keepsakes and memory rituals" },
      { tag: "02", title: "KinnectAI: the connected layer", body: "The broader KinnectAI vision is a video-first, family-centred platform where identity, relationships and shared history shape how people discover and experience family stories. It is designed around connection—not follower counts or manufactured virality.", foot: "A family-centred platform vision" },
      { tag: "03", title: "The Memory Box: the bridge", body: "The Memory Box concept connects present-day recording and preservation with intentional future delivery. It is a way to create a message with a defined purpose and recipient, rather than leaving important words to chance.", foot: "Intentional memory delivery" },
      { tag: "04", title: "AI as an enabling tool", body: "In the broader product vision, AI supports restoration, creative storytelling and discovery. It is a means to help people work with their own material—not a substitute for consent, authentic memories or human relationships.", foot: "Technology in service of people" },
      { tag: "05", title: "Trust is foundational", body: "Family stories can be deeply personal. The strategy places consent, privacy, clear permissions and user control at the centre. Specific features, safeguards and availability must be communicated accurately as products are built and released.", foot: "Privacy, consent and control" },
    ],
    statement: {
      title: "A keepsake can hold a story. A connected family can carry it forward.",
      body: "Explore the Unsaid Memories marketplace and the ways to make personal meaning part of everyday life.",
      ctaLabel: "Take the next step",
      ctaHref: "/",
    },
  },
  {
    slug: "our-story",
    title: "Our story — Unsaid Memories",
    eyebrow: "WHY UNSAID MEMORIES EXISTS",
    h1: "Some things are too meaningful",
    h1Em: "to leave behind.",
    heroCopy:
      "A life is made of more than its milestones. It lives in the photographs, phrases, recipes, rituals and ordinary objects that carry a person’s presence. Unsaid Memories exists to give those things a place—and the stories behind them a way to be shared.",
    cta: { label: "Explore the keepsakes", href: "/shop" },
    art: { icon: "♡", title: "Keep what matters" },
    introTitle: "Because a life is more than the big moments.",
    introParas: [
      "The details are often what bring someone close: the note in the margin, the familiar voice, the recipe that was never written down, the photograph everyone has a different story about. These things can be easy to overlook while life is happening. Later, they can mean everything. We believe they deserve care before they become difficult to gather.",
      KEEP_PARA,
    ],
    sectionTitle: "A few useful ways in.",
    tiles: [
      { tag: "OUR WHY", title: "Meaning deserves a place", body: "We make room for the small things that tell a bigger story. Not every memory needs to become a grand tribute. Sometimes it is enough to keep a familiar object, preserve the story attached to it and make it easier for someone else to understand why it matters." },
      { tag: "OUR WHAT", title: "Objects, stories and connection", body: "Unsaid Memories brings together keepsakes, Memory Boxes, Memory Links, photo and display products, restoration services and thoughtful gifting. The object is the beginning; the story gives it meaning." },
      { tag: "OUR HOW", title: "Make remembering easier to begin", body: "We create accessible ways to gather, preserve, connect and share memories—one object, one story and one contribution at a time. The experience should feel personal and inviting, never like a test of how much of a life someone can document." },
      { tag: "OUR BELIEF", title: "Keep the object. Keep the story.", body: "A photograph can be beautiful on its own. Knowing who is in it, where it was taken and what happened just before the shutter clicked makes it richer. We care about both: the thing itself and the meaning that travels with it." },
    ],
    statement: {
      title: "Start with the thing that already means something.",
      body: "Give it a place. Add the story. Let it be part of everyday life.",
      ctaLabel: "Take the next step",
      ctaHref: "/shop",
    },
  },
];

export function findBrandPage(slug: string): BrandPageData | undefined {
  return brandPages.find((p) => p.slug === slug);
}

brandPages.push(
  {
    slug: "corporate-gifting",
    title: "Corporate gifting — Unsaid Memories",
    eyebrow: "FOR TEAMS, CLIENTS & ORGANISATIONS",
    h1: "Make appreciation",
    h1Em: "feel personal.",
    heroCopy:
      "Move beyond interchangeable merchandise. Create thoughtful gifts for milestones, recognition, client relationships and shared moments—grounded in the people and stories behind your organisation.",
    cta: { label: "Plan a gifting programme", href: "/contact?topic=partnerships" },
    art: { icon: "▧", title: "Meaningful by design" },
    introTitle: "A gift should say more than your logo can.",
    introParas: [
      "The most effective corporate gifts recognise a real relationship. A team milestone, a client partnership, a founder’s story, a retirement or a shared achievement can become the starting point for something useful, personal and worth keeping.",
      KEEP_PARA,
    ],
    sectionTitle: "A few useful ways in.",
    tiles: [
      { tag: "EMPLOYEE MOMENTS", title: "Recognise the person, not just the role", body: "Mark onboarding, service anniversaries, team achievements, retirements and life milestones with gifts that feel considered. Choose products and messages that reflect the culture you want people to experience.", foot: "Recognition and belonging" },
      { tag: "CLIENT RELATIONSHIPS", title: "Make the relationship tangible", body: "A thoughtful keepsake can mark a partnership, thank a client or celebrate a shared accomplishment. Personalisation should feel relevant and respectful—not like a data-driven attempt to manufacture intimacy.", foot: "Client appreciation" },
      { tag: "EVENTS & GATHERINGS", title: "Carry the moment beyond the room", body: "Create event keepsakes, contributor collections or shared memory links that let participants revisit the ideas and people behind the occasion.", foot: "Events and conferences" },
      { tag: "PROGRAMME DESIGN", title: "Plan for scale and consistency", body: "Discuss quantities, product selection, personalisation, packaging, delivery windows and fulfilment. For multi-location or recurring programmes, agree on approval workflows and a clear point of contact before launch.", foot: "Bulk and recurring programmes" },
    ],
    statement: {
      title: "A better gift starts with a better question.",
      body: "Who is it for, what are you recognising and what should they feel when they receive it?",
      ctaLabel: "Take the next step",
      ctaHref: "/contact?topic=partnerships",
    },
  },
  {
    slug: "funeral-homes",
    title: "Funeral homes — Unsaid Memories",
    eyebrow: "FOR FUNERAL & MEMORIAL PROFESSIONALS",
    h1: "Care that continues",
    h1Em: "after the service.",
    heroCopy:
      "Give families a thoughtful way to gather stories, preserve personal details and create keepsakes that can remain part of life long after the day itself. Unsaid Memories can complement your care—not replace it.",
    cta: { label: "Start a partnership conversation", href: "/contact?topic=partnerships" },
    art: { icon: "✧", title: "Care that continues" },
    introTitle: "A meaningful next step for families.",
    introParas: [
      "The days around a loss can be full of decisions, logistics and emotion. Families may want to preserve photographs, letters, voice recordings and stories, but not know where to begin. A guided memory experience can offer a gentle, optional way to gather those pieces when—and if—the family is ready.",
      KEEP_PARA,
    ],
    sectionTitle: "A few useful ways in.",
    tiles: [
      { tag: "FAMILY EXPERIENCE", title: "A tangible place to begin", body: "A Memory Box gives families a physical anchor for photographs, notes and keepsakes. It can be introduced as an optional resource, without implying that every family wants or needs the same kind of memorial.", foot: "Memory Boxes and keepsakes" },
      { tag: "CONTINUING THE STORY", title: "Connect objects to context", body: "Memory Links can connect a physical item to a recorded story, photograph, voice or video. Families can choose what to share and with whom, helping the meaning travel with the object.", foot: "Memory Links" },
      { tag: "SERVICE DESIGN", title: "A gentle, opt-in addition", body: "A funeral home may offer the experience as a resource, a curated package or a follow-up option. The tone should be sensitive, never urgent or sales-led, and the family should remain in control of timing and participation.", foot: "Optional, family-led" },
      { tag: "PARTNERSHIP", title: "Build around your care model", body: "Explore co-branded keepsake collections, staff-guided introductions, remembrance resources or a referral relationship. Scope depends on your service model, fulfilment needs and the family experience you want to support.", foot: "Partnership pathways" },
    ],
    statement: {
      title: "Make room for what families want to carry forward.",
      body: "Tell us about your care model, the families you serve and the kind of support that would feel appropriate.",
      ctaLabel: "Take the next step",
      ctaHref: "/contact?topic=partnerships",
    },
  },
  {
    slug: "schools-hospitals",
    title: "Schools & hospitals — Unsaid Memories",
    eyebrow: "FOR SCHOOLS, HOSPITALS & CARE TEAMS",
    h1: "Help stories travel",
    h1Em: "between generations.",
    heroCopy:
      "Create thoughtful ways for students, patients, families and care teams to preserve voices, celebrate milestones and pass on knowledge. The right programme is sensitive to setting, safeguarding and consent.",
    cta: { label: "Discuss an institutional programme", href: "/contact?topic=partnerships" },
    art: { icon: "✳", title: "Stories across generations" },
    introTitle: "Small projects can create lasting connection.",
    introParas: [
      "A classroom oral-history project, a family message for a new arrival, a patient-led life story or a staff appreciation keepsake can help people feel seen. The format should fit the institution: age-appropriate, accessible, privacy-aware and easy for staff to facilitate.",
      KEEP_PARA,
    ],
    sectionTitle: "A few useful ways in.",
    tiles: [
      { tag: "SCHOOLS", title: "Intergenerational learning", body: "Invite students to interview family or community elders, document local histories and preserve traditions. Provide prompts and simple formats that support respectful listening and accurate attribution.", foot: "Oral history and learning" },
      { tag: "HOSPITALS", title: "Patient and family stories", body: "Offer optional ways for patients and families to record messages, capture milestones or preserve a personal history. Participation must never interfere with care or create pressure during vulnerable moments.", foot: "Patient-led and optional" },
      { tag: "CARE TEAMS", title: "Recognition and shared purpose", body: "Create team memory projects that celebrate the people behind the work: stories of service, mentorship, milestones and the values a team wants to pass on.", foot: "Staff and team appreciation" },
      { tag: "SAFEGUARDING", title: "Permission before preservation", body: "Define who can record, access, contribute, display and retain content. Follow institutional safeguarding, privacy, accessibility and records-management requirements before any programme launches.", foot: "Governance first" },
    ],
    statement: {
      title: "Designed around the people in your care.",
      body: "Tell us about your setting, the people involved and the permissions your programme must respect.",
      ctaLabel: "Take the next step",
      ctaHref: "/contact?topic=partnerships",
    },
  },
  {
    slug: "senior-living",
    title: "Senior living — Unsaid Memories",
    eyebrow: "FOR SENIOR LIVING COMMUNITIES",
    h1: "Make room for every",
    h1Em: "story in the room.",
    heroCopy:
      "Support residents and families in capturing the details that make a life distinct. From conversation prompts to shared memory projects, Unsaid Memories helps turn everyday moments into stories that can be kept and revisited.",
    cta: { label: "Explore a community partnership", href: "/contact?topic=partnerships" },
    art: { icon: "⌂", title: "Stories worth sharing" },
    introTitle: "A memory practice that invites participation.",
    introParas: [
      "A community is made of individual histories: places lived, work done, people loved, skills learned, songs remembered and traditions carried forward. A thoughtful programme creates ways for residents to contribute on their own terms, with staff and family support where welcomed.",
      KEEP_PARA,
    ],
    sectionTitle: "A few useful ways in.",
    tiles: [
      { tag: "RESIDENT STORIES", title: "Start with conversation", body: "Use simple prompts around childhood, work, favourite places, family traditions and everyday routines. Keep sessions short, accessible and resident-led; a story can be recorded, written or simply shared in the moment.", foot: "Prompt-led storytelling" },
      { tag: "FAMILY CONNECTION", title: "Invite more than one perspective", body: "Family members can contribute photographs, captions and their own recollections. The result is not a single official version of a life, but a richer collection of voices that residents can shape and review.", foot: "Shared contributions" },
      { tag: "COMMUNITY LIFE", title: "Create collective memory projects", body: "Build a community story wall, seasonal memory collection or intergenerational activity. Make participation optional and ensure residents can choose whether their stories are private, shared with family or displayed publicly.", foot: "Group projects" },
      { tag: "ACCESSIBILITY & DIGNITY", title: "Make the experience comfortable", body: "Use clear language, large readable formats, simple steps and staff support when requested. Always obtain informed permission for recording, display and sharing, and respect a resident’s decision not to participate.", foot: "Choice and consent" },
    ],
    statement: {
      title: "Every resident has a story worth hearing.",
      body: "Let’s shape a programme that fits your community, staff capacity and residents’ preferences.",
      ctaLabel: "Take the next step",
      ctaHref: "/contact?topic=partnerships",
    },
  },
  {
    slug: "wedding-planners",
    title: "Wedding planners — Unsaid Memories",
    eyebrow: "FOR WEDDING & EVENT PLANNERS",
    h1: "Give the day a life",
    h1Em: "beyond the photographs.",
    heroCopy:
      "Help couples and families preserve the voices, stories and small details around a celebration—not only how it looked, but what it meant to the people who were there.",
    cta: { label: "Create a celebration keepsake", href: "/contact?topic=partnerships" },
    art: { icon: "◇", title: "A day worth keeping" },
    introTitle: "The best details happen between the big moments.",
    introParas: [
      "A wedding is full of things that can disappear into the pace of the day: a grandparent’s advice, a friend’s toast, the handwritten note, the family recipe, the story behind a piece of jewellery. A considered memory experience gives those details somewhere to land.",
      KEEP_PARA,
    ],
    sectionTitle: "A few useful ways in.",
    tiles: [
      { tag: "BEFORE THE DAY", title: "Gather the stories", body: "Invite the couple and families to collect photographs, notes, family traditions and short voice messages in the weeks before the event. Prompts can help guests contribute without turning the process into another task.", foot: "Pre-event story gathering" },
      { tag: "DURING THE DAY", title: "Make participation effortless", body: "A clearly signposted Memory Link or contribution point can invite guests to leave a note, photograph or short message. Keep it optional and make sure guests understand how contributions will be used.", foot: "Guest contributions" },
      { tag: "AFTER THE DAY", title: "Create a keepsake that lasts", body: "Bring selected stories and images together in a Memory Box or connected keepsake. The couple can decide what stays private, what is shared with family and what becomes part of the home.", foot: "Post-event keepsake" },
      { tag: "PLANNER PARTNERSHIP", title: "An add-on with emotional value", body: "Offer a curated keepsake experience as an optional enhancement. Co-create packages around the couple’s style, event format and guest experience rather than forcing a one-size-fits-all activation.", foot: "Curated partner offering" },
    ],
    statement: {
      title: "Let the story outlast the schedule.",
      body: "Tell us what kind of celebrations you plan and where a memory experience could fit naturally.",
      ctaLabel: "Take the next step",
      ctaHref: "/contact?topic=partnerships",
    },
  },
  {
    slug: "shipping-returns",
    title: "Shipping & returns — Unsaid Memories",
    eyebrow: "ORDER WITH CONFIDENCE",
    h1: "The practical details,",
    h1Em: "made a little clearer.",
    heroCopy:
      "Here’s what to check before you order, what to do if something arrives damaged and how to understand returns for standard and personalised products.",
    cta: { label: "Contact support", href: "/contact" },
    art: { icon: "↗", title: "The details matter" },
    introTitle: "A clear note about the details.",
    introParas: [
      "Shipping rates, processing times, destinations, return windows and exceptions are operational policy—not marketing copy. This page is structured to make those terms easy to find. The live store policy and checkout must contain the confirmed current terms before publication; no delivery promise should be inferred from this overview.",
      KEEP_PARA,
    ],
    sectionTitle: "A few useful ways in.",
    tiles: [
      { tag: "BEFORE YOU ORDER", title: "Check the product and checkout details", body: "Review the product description, personalisation choices, estimated processing time, shipping destination and final delivery estimate shown at checkout. Some products may be made to order or handled by different fulfilment partners.", foot: "Current estimates appear at checkout" },
      { tag: "AFTER YOU ORDER", title: "Keep your confirmation", body: "Save the order confirmation and reference. If you need help, share the order number and the email used at checkout through the official support channel. Do not post order details publicly.", foot: "Have your order reference ready" },
      { tag: "IF SOMETHING IS WRONG", title: "Damaged, missing or incorrect items", body: "Contact support as soon as reasonably possible and keep the packaging until the issue is resolved. Take clear photographs of damage and the item received. The support team can advise on the next steps under the applicable policy.", foot: "Document the issue" },
      { tag: "RETURNS", title: "Standard and personalised items", body: "Return eligibility may differ for made-to-order, personalised, digital or otherwise customised items. Read the product-specific terms and the current returns policy before purchasing. Statutory consumer rights may also apply depending on your location.", foot: "Check terms before purchase" },
    ],
    statement: {
      title: "Need help with a specific order?",
      body: "Use the Contact page and include your order reference. We won’t invent a delivery status or policy exception.",
      ctaLabel: "Take the next step",
      ctaHref: "/contact",
    },
  },
);

brandPages.push(
  {
    slug: "size-guide",
    title: "Size guide — Unsaid Memories",
    eyebrow: "A BETTER FIT STARTS HERE",
    h1: "Check the details before",
    h1Em: "you make it yours.",
    heroCopy:
      "Sizing can vary across apparel, textiles and product formats. Use the measurements and fit notes on the individual product page as the source of truth, and compare them with an item you already own.",
    cta: { label: "Browse products", href: "/shop" },
    art: { icon: "↔", title: "Find the right fit" },
    introTitle: "One size chart cannot fit every product.",
    introParas: [
      "A hoodie, a baby bodysuit, a blanket and a tote are measured in different ways. This guide explains how to read product measurements and what to check before ordering. Where a product has its own chart, that chart takes precedence over general guidance.",
      KEEP_PARA,
    ],
    sectionTitle: "A few useful ways in.",
    tiles: [
      { tag: "APPAREL", title: "Measure a garment you already like", body: "Lay a similar garment flat and measure the points shown on the product’s size chart—often chest width, body length and sleeve length. Compare the garment measurements rather than relying only on a familiar letter size.", foot: "Use the item’s chart" },
      { tag: "BABYWEAR", title: "Consider growth and layering", body: "Check the garment’s stated age or size range and the actual measurements. Fit can vary by brand and style; allow for the intended layer underneath and the child’s growth.", foot: "Check measurements, not age alone" },
      { tag: "TEXTILES", title: "Look at finished dimensions", body: "For blankets, towels, pillows and bedding, compare the listed finished dimensions with the space or existing item. Check whether measurements refer to the product itself or the package.", foot: "Compare finished dimensions" },
      { tag: "ACCESSORIES", title: "Check capacity and proportions", body: "For bags, drinkware and keepsake products, look for dimensions, volume and care notes. Consider what needs to fit inside or how the item will be displayed or used.", foot: "Product-specific dimensions" },
    ],
    statement: {
      title: "Between sizes or unsure about a product?",
      body: "Check the individual product notes and contact us before ordering if a measurement is unclear.",
      ctaLabel: "Take the next step",
      ctaHref: "/shop",
    },
  },
  {
    slug: "track-order",
    title: "Track your order — Unsaid Memories",
    eyebrow: "YOUR ORDER, AT A GLANCE",
    h1: "Know where things stand.",
    h1Em: "Then know what to do next.",
    heroCopy:
      "Your order confirmation and carrier tracking link are the best sources for a live delivery update. If a link is missing or something doesn’t look right, we’ll help you work out the next step.",
    cta: { label: "Get order help", href: "/contact" },
    art: { icon: "⌁", title: "Your order journey" },
    introTitle: "A quick guide to tracking.",
    introParas: [
      // CORRECTED LINE (reported): his HTML said this page "does not
      // connect to a live order database yet" — true when he wrote it;
      // this build wires the lookup below to orders + fulfilment, so
      // the sentence now describes the real lookup.
      "Tracking information is supplied by the fulfilment and carrier systems. Enter your order reference and the email you used at checkout in the lookup below, and this page will show the current status and tracking recorded for your order. You can also use the link in your shipping confirmation, or contact support for assistance.",
      KEEP_PARA,
    ],
    sectionTitle: "A few useful ways in.",
    tiles: [
      { tag: "01", title: "Find your confirmation", body: "Search the inbox used at checkout for your order confirmation. Keep the order number handy; it helps support locate the purchase.", foot: "Order reference" },
      { tag: "02", title: "Open the shipping update", body: "When the order ships, use the carrier link in the dispatch email. Carrier scans can take time to appear after a label is created or a parcel is handed over.", foot: "Carrier tracking" },
      { tag: "03", title: "Check the delivery address", body: "If tracking shows an exception or delivery attempt, confirm the address and follow the carrier’s instructions where available.", foot: "Delivery details" },
      { tag: "04", title: "Ask for help if needed", body: "If the tracking link is missing, inactive beyond the carrier’s normal update window or shows an unexpected result, contact support with your order number.", foot: "Human support" },
    ],
    statement: {
      title: "Can’t find the tracking email?",
      body: "Contact support with your order number and checkout email. Never share payment card details.",
      ctaLabel: "Take the next step",
      ctaHref: "/contact",
    },
  },
  {
    slug: "contact",
    title: "Contact us — Unsaid Memories",
    eyebrow: "WE’RE HERE TO HELP",
    h1: "A real person. A thoughtful",
    h1Em: "way forward.",
    heroCopy:
      "Questions about a product, an order, a Memory Link or a meaningful gift? Tell us what you’re trying to do and we’ll help you find the next step.",
    cta: { label: "Browse the Help Center", href: "/help" },
    art: { icon: "✉", title: "Here to help" },
    introTitle: "Tell us what you need help with.",
    introParas: [
      "We want support to feel as considered as the things we make. Include the product name or order reference if you have one, explain what you’re trying to do, and avoid sending private or sensitive information unless it is specifically required through a secure channel.",
      KEEP_PARA,
    ],
    sectionTitle: "A few useful ways in.",
    tiles: [
      { tag: "ORDERS", title: "Order and delivery questions", body: "For a delivery update, include your order number and the email address used at checkout. For a damaged or incorrect item, describe the issue and include clear photographs if the support channel allows attachments.", foot: "Order support" },
      { tag: "PRODUCTS", title: "Product and personalisation help", body: "Tell us which item you’re considering, what you want it to hold or communicate, and any deadline that matters. We can help clarify product options and what is or is not customisable.", foot: "Product guidance" },
      { tag: "MEMORY LINKS", title: "Digital and setup questions", body: "Let us know whether you are creating a new link, opening one you received or updating linked content. Do not share access codes or private family content in an unsecured message.", foot: "Memory Link support" },
      { tag: "PARTNERSHIPS", title: "Work with Unsaid Memories", body: "Funeral homes, senior living communities, schools, hospitals, wedding planners and corporate teams can tell us about their audience, use case and scale. We’ll help shape a conversation around fit.", foot: "Partnership enquiries" },
    ],
    statement: {
      title: "Not sure where to start? That’s okay.",
      body: "Browse the help topics or describe the question in your own words.",
      ctaLabel: "Take the next step",
      ctaHref: "/help",
    },
  },
  {
    slug: "faq",
    title: "FAQ — Unsaid Memories",
    eyebrow: "THE THINGS PEOPLE ASK",
    h1: "A little more clarity. A little",
    h1Em: "less guesswork.",
    heroCopy:
      "Answers to common questions about keepsakes, Memory Boxes, Memory Links, digital content, orders and gifting. If your question isn’t here, get in touch and tell us what you need.",
    cta: { label: "Contact us", href: "/contact" },
    art: { icon: "?", title: "Clear answers" },
    introTitle: "Start with the topic closest to your question.",
    introParas: [
      "We’ll keep this page practical and plain-spoken. Product availability, personalisation options, shipping estimates and service terms can change, so the details shown on the relevant product page and at checkout should always be treated as the current source of truth.",
      KEEP_PARA,
    ],
    sectionTitle: "A few useful ways in.",
    tiles: [],
    statement: {
      title: "Still have a question? We’ll help you find the answer.",
      body: "Tell us what you’re trying to do and include the product or order details that will help us understand.",
      ctaLabel: "Take the next step",
      ctaHref: "/contact",
    },
  },
);

/**
 * His FAQ — his questions, his voice. Where an answer states an
 * operational fact, the wording below keeps the version that matches
 * how the app works today (verified 2026-10-30); every such merge is
 * listed in the build report:
 * - Delivery estimates: checkout shows the estimate for the exact
 *   basket; orders $75+ ship free (site policy, lib/faq.ts grounding).
 * - Returns: the policy on file (acct_refund_policies) is 30 days,
 *   0% restocking fee, misprints/damage always refunded in full,
 *   change-of-mind returns accepted — stated plainly in his answer's
 *   place because his text deferred to "the current policy"; the
 *   current policy is now named.
 */
export const brandFaq: { q: string; a: string }[] = [
  {
    q: "What is a Memory Box?",
    a: "A Memory Box is a place to gather the physical pieces of a story—photographs, letters, keepsakes and meaningful objects. It gives those things a home and creates a natural starting point for recording the context around them.",
  },
  {
    q: "What does a Memory Link do?",
    a: "A Memory Link connects an object or keepsake to digital content such as a story, photograph, voice recording or video. The exact setup and supported content depend on the product and service available.",
  },
  {
    q: "Who can see the content connected to a Memory Link?",
    a: "Access depends on the link type, settings and sharing choices. Before adding private material, review the product’s current privacy and access information. Share only with people you intend to include.",
  },
  {
    q: "Will restoration change my original photograph?",
    a: "A preservation-minded workflow should retain the original and make any restored version distinguishable. Check the specific service description for how files are handled, returned and stored before submitting irreplaceable material.",
  },
  {
    q: "Where can I find delivery estimates?",
    a: "The product page and checkout show the current delivery information for the item and destination — checkout shows the estimate for your exact basket before you pay. Processing and transit can vary by product, personalisation and carrier; do not rely on a general estimate where a current checkout estimate is available. Orders of $75 or more ship free; below that, shipping is calculated at checkout from the live rates of the maker shipping your items.",
  },
  {
    q: "Can I return a personalised item?",
    a: "Our current policy: you have 30 days to change your mind, with no restocking fee, and a misprint, a defect or damage in transit is always refunded in full or replaced — that includes personalised and made-to-order pieces. Return eligibility can still differ for some standard and personalised products and may be affected by damage or an error, so review the current Shipping & Returns policy before ordering or contact support if you are unsure.",
  },
  {
    q: "Can I send an item directly to someone else?",
    a: "Use the recipient’s delivery details at checkout if the current checkout supports a separate shipping address. Review gift options and any included pricing or messaging details before placing the order.",
  },
  {
    q: "Can organisations work with Unsaid Memories?",
    a: "Yes. We welcome enquiries from funeral homes, senior living communities, schools and hospitals, wedding planners and corporate gifting teams. The right approach depends on the audience, workflow and intended experience.",
  },
];

brandPages.push({
  slug: "community",
  title: "Community — Unsaid Memories",
  eyebrow: "THE PEOPLE AROUND THE MOMENTS",
  h1: "Connection grows",
  h1Em: "when it is shared.",
  heroCopy:
    "Unsaid Memories was made for the people who show up for each other — and for the places that hold a community together: the funeral home that knows every family by name, the senior living residence where stories live, the school, the hospital, the workplace. This is where those connections gather.",
  cta: { label: "Explore partnerships", href: "/partnerships" },
  art: { icon: "✳", title: "Gather · Support · Remember" },
  introTitle: "Built with the places people trust.",
  introParas: [
    "A community is not an audience. It is the nurse who remembers, the teacher who keeps the card, the colleague who shows up on the hard day. Unsaid Memories gives those relationships somewhere to land: a keepsake that carries the story, a Memory Box that holds what a family cannot bear to scatter, a small object that says the thing nobody quite said out loud.",
    KEEP_PARA,
  ],
  sectionTitle: "Ways in, for every kind of community.",
  tiles: [
    { tag: "FUNERAL HOMES", title: "For the families you serve", body: "Remembrance that goes home with the family: keepsakes, Memory Boxes and story-linked objects that give grief somewhere gentle to go. A considered extension of the care your home already provides.", foot: "See funeral homes" },
    { tag: "SENIOR LIVING", title: "For the stories in residence", body: "Residents carry whole libraries. Memory work — gathering photographs, voices and keepsakes — gives those stories a form families can hold onto, and a way for staff to honor the person, not just the care plan.", foot: "See senior living" },
    { tag: "SCHOOLS & HOSPITALS", title: "For milestones and hard days", body: "Graduations, recoveries, retirements, the teacher who changed everything. Thoughtful objects for the moments an institution witnesses every day and rarely gets to mark properly.", foot: "See schools & hospitals" },
    { tag: "WEDDING PLANNERS", title: "For the people behind the day", body: "The couples are covered. This is for everyone around them — parents, attendants, the chosen family — and for the keepsakes that let the day keep meaning something long after it ends.", foot: "See wedding planners" },
    { tag: "CORPORATE GIFTING", title: "For the people who do the work", body: "Employee moments, client thanks, retirements and milestones — gifting that carries an actual story instead of a logo. Considered pieces a team can give without it feeling like a formality.", foot: "See corporate gifting" },
  ],
  statement: {
    title: "Bring Unsaid to your community.",
    body: "Five partnership pathways, each with its own page and its own way in. Start with the one that sounds like your people.",
    ctaLabel: "See partnership pathways",
    ctaHref: "/partnerships",
  },
});
