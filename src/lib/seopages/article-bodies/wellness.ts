// ---------------------------------------------------------------------------
// Wellness-family blog articles for Pawzsly U: category root plus supplements,
// hip-and-joint care, itch remedies, ear care, eye care, dental care,
// digestive remedies, and DNA tests. General preventive-care education only,
// never medical advice: no dosages, no drug names, no invented statistics.
// All content is original and written to the WRITING-SPEC.md contract.
// ---------------------------------------------------------------------------

import type { ArticleBody } from './types';

export const WELLNESS_ARTICLES: Record<string, ArticleBody> = {
  // =========================================================================
  // WELLNESS (category root)
  // =========================================================================
  wellness: {
    heroTitle: 'What Daily Pet Wellness Care Actually Looks Like',
    heroSubheadline:
      'Preventive care is not a product you buy once. It is a rhythm of watching, recording, and partnering with a vet you trust.',
    metaDescription:
      'Pet wellness at home means a steady vet relationship, weekly weight and coat checks, and support products that fit around veterinary care, never replace it.',
    introSummary:
      'The cat who greets you at six a.m., the dog who still does a lap at the word walk: that is what maintained health looks like, and it comes from nothing dramatic. Most wellness happens in small, boring routines repeated for years, and the guides in this family, from itchy skin to teeth, each take one body system deeper. Start here with the foundation: a vet who knows your animal, a weekly glance at weight and coat, honest notes, and a support shelf chosen to fit around all of it.',
    sections: [
      {
        id: 'unglamorous-work',
        title: 'The Unglamorous Work That Prevents the Worst',
        content:
          'Most serious health problems announce themselves quietly first: a skipped meal here, a pound gained there, a napping pattern that slowly shifts. Daily preventive care is the practice of catching those whispers before they become sirens. It is not supplements, gadgets, or clever apps by themselves, though some of those earn a place. It is the compound effect of a dozen small habits: watching, weighing, noting, and showing up at the clinic before something is obviously wrong. Families who practice it usually spend less, worry less, and get more good years.',
        tips: [
          'Watch for small shifts in eating, sleeping, and thirst before anything dramatic appears.',
          'Treat routine exams as maintenance, not as a response to sickness.',
          'Write observations down; memory smooths over exactly the changes that matter.',
        ],
      },
      {
        id: 'one-clinic',
        title: 'Building a Relationship With One Clinic',
        content:
          'A clinic that has seen your animal twice a year for three years can spot a change that a new clinic would call normal, because normals differ between individuals. That is the quiet argument for continuity: weight curves, past exam notes, and a relationship where your questions are answered in context. Annual wellness exams are the backbone for most adults, and many vets suggest twice-yearly visits once a pet reaches senior years, since health can move faster then. Keep vaccines, dental findings, and diet history in one place so any vet can see the whole animal quickly.',
        tips: [
          'Choose one practice for routine care so baselines build over years.',
          'Bring diet, supplements, and behavior notes to every appointment.',
          'Ask staff to explain findings in plain language until you truly understand.',
        ],
      },
      {
        id: 'weekly-once-over',
        title: 'The Weekly Once-Over That Takes Five Minutes',
        content:
          'Pick one day a week and run the same five-minute check. Run your hands along the ribs: you should feel them under a thin layer, like knuckles through a sleeve. Weigh small pets on a kitchen scale, or weigh yourself holding the dog and subtract. Note the appetite honestly, including treats and table scraps. Part the fur and look at the skin beneath, and separate the coat\'s shine from its cleanliness. Finally, rate energy against what was normal a month ago, not against a younger animal. Four numbers, one line in a notebook, and you have a baseline.',
        callout: {
          type: 'pro-tip',
          title: 'Same Day, Same Scale',
          text: 'Scales disagree with each other, so weigh on the same scale at the same time of day, and log the trend rather than trusting any single reading.',
        },
        tips: [
          'Feel for ribs weekly; visible ribs or none at all both warrant attention.',
          'Weigh yourself holding your dog, then subtract, for a cheap home trend.',
          'Compare this week\'s energy against last month\'s, not puppy-year memories.',
        ],
      },
      {
        id: 'support-products-fit',
        title: 'Where Support Products Genuinely Fit',
        content:
          'The support shelf earns its place only when it serves a habit you already keep. Flea prevention works because you apply it on schedule, a probiotic only helps if it survives the trip from cupboard to bowl each morning, and a ramp protects joints only where it actually gets used. As you compare options in the marketplace listings, the honest test is the same: does this product match a need you have verified, a form your animal accepts, and a routine you can sustain? Products chosen that way quietly do their job. Products chosen for the shelf\'s sake expire in a drawer.',
        tips: [
          'Match every purchase to a habit you already keep, or build the habit first.',
          'Choose the form your animal accepts over the formula you prefer on paper.',
          'Set a monthly reminder to check expiry dates on the wellness shelf.',
        ],
      },
      {
        id: 'records-pay-off',
        title: 'Notes and Records That Pay Off Later',
        content:
          'A plain notebook or a notes app does more for your animal\'s health than most gadgets. Record weight weekly, food changes the day they happen, and anything odd with a date attached. When a skin lump appears, photograph it beside a coin or a ruler so size can be compared honestly later. These records turn a vague concern into a specific one, and vets can act far faster on a three-month weight trend or a dated photo than on a guess. Old records also settle household debates about who changed the food and when.',
        tips: [
          'Date every entry; undated notes are nearly useless at the clinic.',
          'Photograph lumps beside a coin so future size comparisons are honest.',
          'Log food and treat changes the same day they start.',
        ],
      },
      {
        id: 'life-stage-rhythm',
        title: 'Adjusting the Rhythm by Life Stage',
        content:
          'The rhythm shifts as your animal ages, and the calendar is a better guide than intuition. Puppies and kittens need frequent weigh-ins because growth itself is the health signal, and a young animal that stops gaining deserves attention. Adults hold a steady pattern for years, which makes any drift meaningful. Seniors benefit from shorter, more frequent checks: stairs get harder, weight creeps up or falls, and small behavior changes carry more weight. Support gear changes too, from indestructible puppy toys to orthopedic beds and ramps. The habits stay the same; only their frequency and focus move.',
        tips: [
          'Weigh growing puppies and kittens weekly; growth pauses are early signals.',
          'Shift senior checks toward mobility, weight, and comfort observations.',
          'Retire gear as your pet ages, and replace it with age-appropriate support.',
        ],
      },
      {
        id: 'when-to-call',
        title: 'When a Small Change Deserves a Call',
        content:
          'The whole point of watching is knowing when to stop watching and pick up the phone. A healthy adult animal skipping one meal is usually nothing; skipping most meals for a day or two is a call. Drinking noticeably more water for several days, losing or gaining weight without a diet change, or trading an evening zoomie session for a new reluctance all deserve a conversation. Clinics would rather answer a small question on a Tuesday than a big one three weeks later. Prevention is cheaper, calmer, and kinder than waiting, in every sense.',
        callout: {
          type: 'vet-note',
          title: 'Trust the Phone More Than the Calendar',
          text: 'If something feels wrong before the next scheduled exam, call the clinic and describe it. Describing symptoms is not diagnosing, and early calls often prevent urgent ones.',
        },
        tips: [
          'Call about appetite loss lasting past a day, not the first skipped meal.',
          'Report new thirst, weight drift, or energy dips rather than waiting them out.',
          'Describe what you observed with dates; let the clinic decide urgency.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Weekly Checks',
        items: [
          { highlight: 'Ribs and weight', text: 'checked the same day each week, on the same scale.' },
          { highlight: 'Honest appetite notes', text: 'include treats, table scraps, and anything else eaten.' },
          { highlight: 'Coat and skin', text: 'parted and seen up close, not judged from across the room.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Vet Partnership',
        items: [
          { highlight: 'One steady clinic', text: 'keeps baselines and history that new practices cannot match.' },
          { highlight: 'Annual wellness exams', text: 'more often for seniors, before anything looks obviously wrong.' },
          { highlight: 'Answers in plain language', text: 'keep asking until every finding makes sense to you.' },
        ],
      },
      {
        icon: 'heart',
        title: 'The Support Shelf',
        items: [
          { highlight: 'Habits before products', text: 'a product only works inside a routine you actually keep.' },
          { highlight: 'Verified needs only', text: 'match purchases to observed problems, not to shelf appeal.' },
          { highlight: 'Monthly expiry checks', text: 'because expired support is no support at all.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How often should a healthy pet see the vet?',
        answer:
          'Most healthy adult dogs and cats do well with one wellness exam a year, and many veterinarians move seniors to twice yearly because health can change faster in later life. Puppies and kittens visit more often during their early months for growth checks and vaccine series. Your own vet can set the right interval for your animal\'s age and history.',
      },
      {
        question: 'What should a weekly pet health check include?',
        answer:
          'Weight, appetite, coat and skin, and energy, in that order. Feel the ribs, weigh on the same scale, note what was actually eaten, separate the fur and inspect the skin beneath, and compare energy against last month rather than against memory. Five minutes, one line of notes, and a baseline builds itself.',
      },
      {
        question: 'Do wellness products replace veterinary care?',
        answer:
          'No. Support products, from flea prevention to probiotics and dental chews, sit around the edges of good care: they fill routine needs between examinations. They cannot examine, test, or catch what you cannot see. Choose them to fit habits you keep, and let a veterinarian own the diagnosing and treating.',
      },
      {
        question: 'What changes in my pet mean I should call the vet?',
        answer:
          'A day or more of refused meals, thirst that jumps for several days, weight moving without a diet change, energy that visibly drops, or any new lump worth a dated photo. None of these demand panic, and all of them deserve a phone call before the next scheduled visit.',
      },
      {
        question: 'How do I track my pet\'s weight at home without a pet scale?',
        answer:
          'For small animals, a kitchen scale works. For dogs, weigh yourself, weigh yourself holding the dog, and subtract. Do it at the same time of day on the same scale, and watch the trend instead of trusting any single reading, because scales disagree with each other by surprising amounts.',
      },
    ],
    heroImageUrl: '/images/health_woman_cat.jpg',
    heroImageAlt: 'Veterinarian examining a tabby cat during a wellness check',
  },

  // =========================================================================
  // SUPPLEMENTS & VITAMINS
  // =========================================================================
  'wellness/supplements-and-vitamins': {
    heroTitle: 'How to Choose Pet Supplements Without Falling for Hype',
    heroSubheadline:
      'A supplement fills a specific gap. It cannot rescue a poor diet, and it deserves a vet conversation before the first scoop. Here is how honest choosing works.',
    metaDescription:
      'Choosing pet supplements: fill real gaps, read labels for third-party quality markers, pick a form your animal takes, and give results months, not days.',
    introSummary:
      'The supplement aisle makes a promise no bottle can keep: that a scoop of powder can stand in for a good diet. It cannot. What a well-chosen supplement can do is fill a specific, verified gap, an omega-3 source for a coat that stays dull, a probiotic through a food change, joint support for a dog whose getting-up has slowed. The honest route runs through your veterinarian first, a label read closely, a form your animal will actually swallow, and the patience to judge over months.',
    sections: [
      {
        id: 'what-they-fix',
        title: 'What Supplements Can and Cannot Fix',
        content:
          'An animal eating a complete, balanced diet already receives the vitamins the formula was built to deliver, and adding more of them is rarely the plan anyone intends. Gaps appear for real reasons: a home-prepared diet without careful balancing, a life stage with higher demands, a condition your veterinarian has identified. Those are the gaps a supplement can fill. What no supplement can do is compensate for low-quality food, inconsistent feeding, or a diet built on treats. Fix the foundation first, then look at what is genuinely still missing.',
        tips: [
          'Fix the base diet before adding anything on top of it.',
          'Name the specific gap before naming the supplement meant to fill it.',
          'Healthy animals on complete diets often need nothing extra at all.',
        ],
      },
      {
        id: 'vet-conversation',
        title: 'The Vet Conversation Before the First Scoop',
        content:
          'Before anything lands in the bowl, run it past your veterinarian, and bring the actual bottle or listing rather than a vague description. Some supplements interact with conditions or treatments your animal already has, and a quick check prevents an expensive mistake. The visit is also where a real gap gets confirmed: bloodwork or an exam can show whether the dull coat is dietary, hormonal, or something else entirely. If the answer comes back that nothing is missing, that is a good outcome, not a wasted question. The cheapest supplement is the one you never needed.',
        callout: {
          type: 'vet-note',
          title: 'Bring the Label, Not a Description',
          text: 'Snap a picture of the full ingredient panel and the feeding directions, and email it to your clinic. Interactions and suitability are exactly why they want to see it before you start.',
        },
        tips: [
          'Email the ingredient panel to your clinic before the first serving.',
          'Ask specifically about interactions with anything your animal already takes.',
          'Treat a nothing-is-missing answer as money saved, not a wasted trip.',
        ],
      },
      {
        id: 'label-reading',
        title: 'Reading a Label for Quality Signals',
        content:
          'Labels reward a slow read. Look for a seal from an independent testing body, which signals the contents were checked by someone with nothing to sell, and for a full ingredient panel that states amounts rather than hiding them inside a proprietary blend. Lot numbers and expiry dates mean the maker can trace the batch, and a real street address or phone number means you can reach them if something looks wrong. Check that the product names your species: cat and dog needs are not interchangeable, and a formula built for one is not automatically safe for the other.',
        tips: [
          'Prefer labels with an independent third-party quality seal displayed.',
          'Avoid proprietary blends that never state how much of anything you get.',
          'Skip anything without a lot number, expiry date, or maker contact information.',
        ],
      },
      {
        id: 'form-choice',
        title: 'Choosing the Form Your Animal Will Take',
        content:
          'The best formulation on paper fails when it ends up spat on the floor twice a day. Form matters as much as ingredients, because a supplement only works while it is actually being given. Chewable tablets suit dogs who treat pills like snacks, powders hide in wet food, oils pump over a meal, and gel caps can hide inside a soft treat. Match the form to the individual eating in front of you. As you compare forms in the marketplace listings, buy the smallest package first and let your animal vote.',
        tableData: {
          headers: ['Form', 'Works well for', 'Trade-offs'],
          rows: [
            ['Chewable tablet', 'Dogs who take pills like treats', 'Some animals refuse the texture or smell'],
            ['Soft chew', 'Picky eaters who sniff out powders', 'Calories and treat value add up quickly'],
            ['Powder topper', 'Wet-food meals and multi-pet homes', 'Needs thorough mixing, and some notice it'],
            ['Oil pump bottle', 'Cats and dogs eating dry food', 'Can go rancid; refrigeration may be needed'],
            ['Gel capsule', 'Animals who accept pill pockets', 'Hard to give to a suspicious cat'],
          ],
        },
        tips: [
          'Test a small package first before committing to a large container.',
          'Count soft-chew calories as part of the daily treat allowance.',
          'Keep the routine at a consistent time so missed days become obvious.',
        ],
      },
      {
        id: 'give-it-time',
        title: 'Giving It Time to Work or Not Work',
        content:
          'Slow-acting support earns or fails its reputation over months, not mornings. Joint supplements in particular are judged over a season of consistent use, and coat changes follow hair-growth cycles, so a shiny verdict can take longer than the bottle lasts. Change one thing at a time, or you will never know which product deserves credit or blame. Note the date you started, what you are watching for, and what you actually see. At the next clinic visit, review the notes together and decide whether to continue, adjust, or stop. Ending a product that does nothing is part of good supplementation.',
        tips: [
          'Judge slow supplements over months, and coat changes over hair-growth cycles.',
          'Start one product at a time so cause and effect stay clear.',
          'Write the start date where you will see it, like the container lid.',
        ],
      },
      {
        id: 'storage-routine',
        title: 'Storage, Freshness, and the Routine Around It',
        content:
          'A supplement\'s last mile is your kitchen. Oils and soft chews degrade in heat, so the cupboard beside the stove is the wrong shelf, and a bathroom\'s humidity does powders no favors. Respect the expiry date honestly, because potency fades before appearance changes. Keep containers out of reach, since some chews smell enough like treats that a determined dog will eat a month of them in an afternoon, which is a real toxicity concern rather than a joke. Build the giving into a moment that already happens every day, such as the morning meal, because a routine you can see is a routine you can keep.',
        callout: {
          type: 'warning',
          title: 'One Dog, One Month, One Sitting',
          text: 'Overdosing happens most often through treat-like chews left within reach. Store them like medication, count what remains, and call your veterinarian or an animal poison service immediately if the container turns up empty.',
        },
        tips: [
          'Store oils and chews somewhere cool, dry, and genuinely out of reach.',
          'Anchor the daily dose to an existing habit, like breakfast.',
          'Toss anything that smells off; rancid oils announce themselves.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Before You Buy',
        items: [
          { highlight: 'Name the gap', text: 'a verified need beats a hunch from an internet thread.' },
          { highlight: 'The vet conversation', text: 'run the ingredient panel past your clinic before starting.' },
          { highlight: 'The species check', text: 'formulas made for cats and dogs are not interchangeable.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Label Honesty',
        items: [
          { highlight: 'Independent quality seal', text: 'third-party testing beats any claim printed by the seller.' },
          { highlight: 'Stated ingredient amounts', text: 'prefer full ingredient panels over vague proprietary blends.' },
          { highlight: 'Traceable batch numbers', text: 'lot numbers and expiry dates make each batch traceable.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Giving It Time',
        items: [
          { highlight: 'Months, not days', text: 'judge joint and coat support over a full season.' },
          { highlight: 'One change at a time', text: 'introduce new products alone so credit lands where it belongs.' },
          { highlight: 'Notes and dates', text: 'written starts and observations make the next vet visit productive.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Does my pet need vitamins on a complete diet?',
        answer:
          'Usually not. A complete food delivers the vitamins its formula was designed around, so healthy animals eating one rarely need a general multivitamin. Gaps come from specific situations such as home-prepared meals, heavy life-stage demands, or a diagnosed condition, and those deserve a veterinarian\'s confirmation before you shop.',
      },
      {
        question: 'How long should I try a supplement before deciding it works?',
        answer:
          'Give slow-acting support a season, not a weekend. Joint products are typically judged after months of consistent use, and coat changes wait on hair-growth cycles. Track the start date, watch one or two specific signs, and review the results with your clinic before renewing anything.',
      },
      {
        question: 'Can I give my pet human vitamins or fish oil capsules?',
        answer:
          'Not without asking first. Human products are formulated for our weights and needs, and some contain strengths or extra ingredients that are wrong for animals. If your veterinarian supports fish oil, they can point you toward a pet-labeled option and tell you how much to give.',
      },
      {
        question: 'What does a third-party quality seal on a supplement mean?',
        answer:
          'It means an independent organization tested or verified the product rather than the brand grading its own homework. Seals vary in what they check, but any of them is a better signal than marketing claims alone. Look for one alongside stated ingredient amounts, a lot number, and an expiry date.',
      },
      {
        question: 'How do I get a picky cat to take a supplement?',
        answer:
          'Form decides everything. Powders that vanish into wet food, oils pumped onto a meal, or gel caps hidden in a soft treat each work for different cats. Start with the smallest available package, change nothing else in the bowl, and watch that the food still gets finished.',
      },
    ],
    heroImageUrl: '/images/golden_portrait.jpg',
    heroImageAlt: 'Golden retriever relaxing outdoors',
  },

  // =========================================================================
  // HIP & JOINT CARE
  // =========================================================================
  'wellness/hip-and-joint-care': {
    heroTitle: 'Hip and Joint Care That Carries Your Pet Into Old Age',
    heroSubheadline:
      'Comfortable movement is built, not lucky. Weight carries most of the load, and the rest is traction, ramps, and honest conversations about pain.',
    metaDescription:
      'Hip and joint care for pets: weight as the biggest lever, omega-3 and joint supplement context, early stiffness signs, and home traction fixes that help.',
    introSummary:
      'Watch an old dog stand up and you can read his whole orthopedic story: the hesitation before the back legs commit, the little shuffle that rearranges paws into position. Cats tell it differently, hesitating at a favorite high perch until one day they simply stop going up. Nothing about that slide is fixed or sudden. Comfortable movement into old age is mostly built, through weight, footing, and early attention, and the window for building it opens years before the first stiff morning.',
    sections: [
      {
        id: 'weight-lever',
        title: 'Why Weight Is the Biggest Joint Intervention',
        content:
          'Every extra pound rides directly through the hips, knees, and elbows on every single step, so lean animals keep their own joints longer. Keeping a pet lean costs nothing per month and outperforms anything you can buy for joint support, which is why vets raise weight before anything else. Run the rib check weekly: a flat hand should find them without pressing hard. Measure food with a real cup or scale instead of eyeballing, and count treats into the day\'s total. If the ribs have gone missing, that conversation belongs at the clinic.',
        tips: [
          'Keep pets lean; joints pay for every extra pound on every step.',
          'Measure meals with a cup or scale, never by eye alone.',
          'Count dental chews and treats inside the daily food total.',
        ],
      },
      {
        id: 'early-stiffness',
        title: 'Spotting Early Stiffness Before It Becomes Limping',
        content:
          'Stiffness whispers long before it limps. The stand from a nap that takes three attempts instead of one, the pause at the bottom of the stairs, the dog who sits halfway through the usual walk and stiffens up that evening, the cat who no longer lands from the counter gracefully. Log what you see with dates, because gradual change hides inside ordinary days, and a written pattern is what your veterinarian will want to see. Do not file these away as simple aging. Aging is the timing; discomfort is the mechanism, and mechanisms can be helped.',
        callout: {
          type: 'warning',
          title: 'Never Write It Off as Just Old Age',
          text: 'Slowing down that arrives with stiffness has a cause, and causes have options. Age is not a diagnosis, so bring the pattern you logged to your veterinarian and ask what can be done about comfort.',
        },
        tips: [
          'Note the date of every new hesitation, sore evening, or refused stair.',
          'Video the slow morning stand; clips show what descriptions cannot.',
          'Compare this month\'s mobility against last month\'s honestly, not hopefully.',
        ],
      },
      {
        id: 'omega-joint-context',
        title: 'Omega-3s and Joint Support in Honest Context',
        content:
          'Fish oil\'s omega-3 fatty acids are the most-discussed nutritional support for joints, and they also benefit the coat, which makes them a common starting point. Glucosamine and chondroitin appear across the joint aisle, sometimes alongside newer ingredients like green-lipped mussel, and the honest summary is that responses vary between individuals. Treat these as slow supports judged over months, chosen for label transparency, given consistently, and paired with the weight and exercise work that carries most of the load. Your veterinarian can help sort which, if any, fit your animal\'s situation and what a fair trial looks like.',
        tips: [
          'Pair any joint supplement with the weight work that matters more.',
          'Ask your vet what a fair trial period looks like for your animal.',
          'Prefer joint products listing ingredient amounts, not mystery blends.',
        ],
      },
      {
        id: 'home-changes',
        title: 'Home Changes That Protect Aging Joints',
        content:
          'Slippery floors punish wobbly legs, and the fix is cheap. Lay runners along the routes your pet actually travels, from bed to bowl to door, and add a mat under the feeding station if it sits on tile. A ramp into the car saves the leap that twists shoulders, and a low step or ramp onto furniture spares repetitive jumping impacts. For cats, cut a low entrance into one side of a high-sided litter box so arthritic hips stop rationing bathroom trips. Walk each route on your knees if you doubt it: what feels gripped to you looks like ice to them.',
        tips: [
          'Cover the daily travel routes with washable runners before the falls start.',
          'Choose a car ramp with side rails and a gentle, stable incline.',
          'Give arthritic cats a litter box they can enter without stepping high.',
        ],
      },
      {
        id: 'kind-movement',
        title: 'Movement That Helps Joints Rather Than Hurts',
        content:
          'Joints stay healthiest under steady, moderate movement, and suffer most under the weekend-warrior pattern: two restful days, then an hour of hard fetch on cold muscles. Trade one long Saturday outing for shorter daily walks that keep cartilage fed and muscles awake, and let sniffing slow the pace without shortening the benefit. Save explosive fetch sessions for after a warm-up stroll, and think twice about games built on skidding stops, which load knees hard. Swimming, where your dog enjoys it, moves joints without pounding them. The goal is motion most days, soreness none of them.',
        tips: [
          'Spread exercise across the week instead of one heroic weekend outing.',
          'Warm up with five slow minutes before any hard fetch or running.',
          'Try swimming for joint-friendly conditioning if your dog enjoys water.',
        ],
      },
      {
        id: 'pain-conversation',
        title: 'Talking With Your Vet About Pain Management',
        content:
          'Pain conversations have changed, and the change favors your pet. Veterinarians now have options across several categories, from long-acting injections to physical therapy, hydrotherapy, and other rehabilitation modalities, and the right mix is built from what you report at home. Bring specifics: how long the morning stand takes, which stairs get refused, whether sleep gets broken. Ask directly what can be done about comfort, not just about disease, and revisit the plan as things shift, because a protocol that worked in spring can need tuning by winter. Comfort is a legitimate goal in its own right.',
        callout: {
          type: 'vet-note',
          title: 'Report Comfort, Not Just Symptoms',
          text: 'Describe what your animal can no longer do comfortably, with dates and videos if you have them. That reporting is the raw material your veterinarian uses to build a pain plan.',
        },
        tips: [
          'Bring videos of the slow stands and refused stairs to the appointment.',
          'Ask about comfort goals specifically, not only about treating disease.',
          'Recheck pain plans seasonally, since cold weather often stiffens arthritic joints.',
        ],
      },
      {
        id: 'support-gear',
        title: 'Choosing Gear That Carries the Plan',
        content:
          'The shopping list for creaky joints is short and worth comparing carefully, because fit decides whether gear helps or gathers dust. An orthopedic bed needs real support foam and walls low enough for an easy step-in. A mobility harness with a rear handle lets you steady a slipping back end on stairs, and it needs adjustable straps and a washable body. Ramps want side rails and a surface that grips in rain. As you compare listings, measure your car\'s trunk height and your heaviest furniture first, and read reviews for stability under a full-grown dog, since that detail decides everything.',
        tips: [
          'Measure trunk and furniture heights before shopping for any ramp.',
          'Check weight ratings with margin, because stability is the whole point.',
          'Washable matters more than looks once medications or incontinence join the picture.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'heart',
        title: 'Lean and Moving',
        items: [
          { highlight: 'Rib check weekly', text: 'a flat palm locates them without pressing down hard.' },
          { highlight: 'Meals measured by cup', text: 'a real cup or scale, with treats counted inside the total.' },
          { highlight: 'Motion most days', text: 'shorter daily walks beat one heroic weekend outing.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Early Signals',
        items: [
          { highlight: 'Slow morning stands', text: 'count the attempts it takes to rise from a nap.' },
          { highlight: 'Hesitation at stairs', text: 'a fresh hesitation at the staircase bottom counts as data.' },
          { highlight: 'Sore post-walk evenings', text: 'stiffening after normal exercise deserves a dated note.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Comfort Is Treatable',
        items: [
          { highlight: 'Ask about comfort', text: 'pain plans are built from what you report at home.' },
          { highlight: 'Physical therapy options', text: 'rehabilitation and hydrotherapy services exist for pets too.' },
          { highlight: 'Seasonal plan reviews', text: 'revisit pain plans when cold weather stiffens joints.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'What are the first signs of joint problems in dogs?',
        answer:
          'Slow or effortful stands after naps, hesitation at stairs, a shorter walking stride, sitting partway through a usual route, and stiff evenings after normal activity. None of these are dramatic alone, which is why dating and logging them matters. A written pattern helps your veterinarian act early, when interventions work best.',
      },
      {
        question: 'Do joint supplements actually help dogs and cats?',
        answer:
          'They can, modestly and slowly, and responses vary between individuals. Omega-3 fatty acids from fish oil have the broadest support, while glucosamine and chondroitin are judged case by case. Supplements sit beneath weight management and appropriate exercise on the priority list, so build that base first.',
      },
      {
        question: 'Is my dog just slowing down because of age?',
        answer:
          'Slowing often has a treatable cause, and stiffness is not a feature of age so much as a symptom riding along with it. Many seniors move comfortably again once pain is addressed, footing improved, and weight managed. Book the exam, describe what changed, and let age stay a number.',
      },
      {
        question: 'Are ramps better than stairs for small and senior dogs?',
        answer:
          'For dogs with sore hips or wrists, a gentle ramp is usually kinder, especially into tall vehicles. Stairs still suit steady dogs who climb willingly. Whatever you choose, look for side rails, a gripping surface, and a weight rating with margin, because confidence on the climb is the point.',
      },
      {
        question: 'How can I help my arthritic cat specifically?',
        answer:
          'Cut a low entrance into her litter box, add steps or a ramp to favorite perches, and lay runners across slippery floors, because cats hide stiffness well and stop jumping rather than complain. A warm, supportive bed near a heat source helps too. Ask your vet what comfort options suit cats.',
      },
    ],
    heroImageUrl: '/images/golden_portrait.jpg',
    heroImageAlt: 'Golden retriever resting comfortably outdoors',
  },

  // =========================================================================
  // ITCH REMEDIES
  // =========================================================================
  'wellness/itch-remedies': {
    heroTitle: 'Decoding the Scratch: Itch Remedies That Actually Help',
    heroSubheadline:
      'Scratching is a message with a cause attached. Learn the big cause families, what soothes at home, and the signs that skip straight to the clinic.',
    metaDescription:
      'Itch remedies that help: tell flea, environmental, and food scratching apart, soothe safely at home, stop hot spots early, and know the vet-now signs.',
    introSummary:
      'How much scratching is normal? Every animal itches sometimes; the question is whether the pattern has changed. A dog who suddenly attacks his belly at 3 a.m., a cat whose chin has gone bald and shiny, a pair of ears that will not stay out of reach of a back paw: all of these are messages with causes attached. Reading them starts with knowing the three big families, fleas and other parasites, environmental triggers, and food, and pairing each with its own response. Here is how the decoding works.',
    sections: [
      {
        id: 'baseline-scratch',
        title: 'First, Learn Your Animal\'s Baseline',
        content:
          'Every dog scratches a few times a day and every cat grooms for hours; neither is a problem by itself. The signal is change. Count the locations your animal usually scratches and roughly how often, then notice when the pattern breaks: new spots, night waking to scratch, grooming that leaves damp patches, nails clicking the same ear all evening. Seasonal scratching that arrives with spring and leaves with the first frost tells one story, while a year-round pattern that slowly intensifies tells another. Baselines turn scratching from noise into information.',
        tips: [
          'Note your animal\'s normal scratch spots before assuming trouble.',
          'Night waking to scratch is a change worth taking seriously.',
          'Damp, thinning, or reddened fur means the baseline has broken.',
        ],
      },
      {
        id: 'cause-families',
        title: 'The Three Big Cause Families',
        content:
          'Most chronic itching belongs to one of three families, and the location of the damage is the first clue. Fleas and other parasites favor the lower back and tail base. Environmental triggers, such as pollen and dust, hit paws, ears, armpits, and belly in seasonal waves. Food-related itching runs year-round and concentrates on paws and ears. Overlap is common, which is why patience and a veterinarian\'s help matter.',
        tableData: {
          headers: ['Where it itches', 'Usual suspects', 'First move'],
          rows: [
            ['Lower back and tail base', 'Fleas and other parasites', 'Comb for flea dirt, restart prevention'],
            ['Paws, armpits, belly in warm months', 'Environmental triggers like pollen', 'Wipe paws after walks, ask your vet'],
            ['Paws and ears, all year', 'Food sensitivity', 'Vet-guided diet trial, no shortcuts'],
            ['Sudden belly rash after new products', 'Contact irritation', 'Stop the new shampoo, detergent, or spray'],
          ],
        },
        tips: [
          'Comb the lower back over white paper and look for pepper-like dirt.',
          'Photograph the exact spots weekly so patterns surface faster.',
          'Suspect food only when the pattern runs all year.',
        ],
      },
      {
        id: 'home-soothing',
        title: 'What Genuinely Soothes at Home',
        content:
          'Cool water takes the heat out of angry skin the way it does a sunburn: a lukewarm rinse, gently towel-dried, can settle a frantic evening. Grooming does quiet work too, because loose undercoat traps heat and debris against the skin, and a calm brushing session removes it while letting you map the damage. If you bathe, use a gentle shampoo formulated for pets, work it down to the skin, and rinse longer than feels necessary, since residue itself irritates. When comparing gentle shampoo options in the marketplace listings, short ingredient lists beat long herbal-sounding ones. What home care cannot do is address the underlying cause, which is why soothing and diagnosing deserve separate tracks.',
        tips: [
          'Use cool rather than cold water; extreme temperatures work against skin.',
          'Brush weekly to lift loose undercoat and find trouble early.',
          'Rinse shampoo twice as long as you think it needs.',
        ],
      },
      {
        id: 'flea-diligence',
        title: 'Flea Prevention Is the Cheapest Diagnostic',
        content:
          'Before blaming pollen or protein, rule out the cheap and common answer. Fleas are the most over-diagnosed-by-eye and under-treated-by-calendar problem in itchy pets, because you rarely see the flea itself, only the reaction to it. Use prevention on every animal in the house, on schedule, all year in most climates, and wash bedding in hot water weekly during a flare. The white-paper test settles arguments: comb the lower back, tap the debris onto damp white paper, and flea dirt smears rust-brown while ordinary grit stays dark. Prevention diligence eliminates a whole branch of the decision tree.',
        callout: {
          type: 'pro-tip',
          title: 'The Damp White-Paper Test',
          text: 'Comb along the lower back and tail base, tap what falls onto a damp white paper towel, and wait a minute. Rust-brown smears are digested blood, which means fleas are eating somewhere on your pet.',
        },
        tips: [
          'Run prevention on every pet in the house, not just the itchy one.',
          'Wash pet bedding hot and weekly while any flare is active.',
          'Date the prevention on a calendar; lapses are how comebacks happen.',
        ],
      },
      {
        id: 'hot-spot-spiral',
        title: 'Stopping the Hot-Spot Spiral Early',
        content:
          'A hot spot is a spiral, not a spot: scratching breaks skin, broken skin itches more, and within hours a dog can turn a small scrape into a raw, matted, golf-ball-sized sore. The intervention is speed. Part the fur daily during itchy seasons and feel for damp patches hiding underneath, because the surface coat can look untouched while trouble brews below. Once you find one, the lick-scratch cycle has to break, whether with an e-collar or by drying the area, and fur around the sore often needs clipping, which a groomer or vet can do gently if the skin is painful.',
        tips: [
          'Feel for damp patches under the coat daily during itchy season.',
          'Break the lick-scratch cycle the same day you find a sore.',
          'Let a professional clip painful skin; home clipping bites back.',
        ],
      },
      {
        id: 'vet-now-signs',
        title: 'The Signs That Skip Straight to a Vet',
        content:
          'Some levels of itching leave the home-remedy tier entirely. Hair loss that spreads, skin that is raw, scabbed, or bleeding, scratching that wakes your animal at night, or a sudden swollen face or hives all warrant a prompt call, and swelling around the eyes or trouble breathing warrant emergency care now. If two weeks of diligent home care changes nothing, that is also a vet conversation, because chronic itching usually needs the actual cause addressed rather than soothed. Deep, greasy, or foul-smelling skin adds infection to the suspicion list. Diagnosis is the vet\'s half of this partnership; yours is noticing and acting.',
        callout: {
          type: 'vet-note',
          title: 'Night Scratching Deserves Weight',
          text: 'Itching severe enough to wake your animal, or you, in the night is a severity signal, not a habit. Call the clinic and say exactly that; it moves you up the triage list honestly.',
        },
        tips: [
          'Photograph spreading hair loss daily so the pace stays visible.',
          'Treat facial swelling or breathing trouble as an emergency, today.',
          'Book the exam if two honest weeks of home care change nothing.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Read the Pattern',
        items: [
          { highlight: 'Where it itches', text: 'lower back, paws, or ears points to different families.' },
          { highlight: 'When it itches', text: 'seasonal waves and year-round grind are separate stories.' },
          { highlight: 'A baseline first', text: 'know your animal\'s normal before deciding what changed.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Soothe Safely',
        items: [
          { highlight: 'Cool water rinses', text: 'take heat out of angry skin without shocking it.' },
          { highlight: 'Gentle weekly grooming', text: 'lifts trapped undercoat and maps the damage honestly.' },
          { highlight: 'Thoroughly rinsed shampoo', text: 'leftover shampoo residue irritates skin all by itself.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Act Early',
        items: [
          { highlight: 'Hot spots move fast', text: 'a small damp patch becomes a large sore within hours.' },
          { highlight: 'Year-round flea diligence', text: 'every pet in the house, on schedule, all year.' },
          { highlight: 'The vet-now signs', text: 'hair loss, raw skin, night scratching, facial swelling.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'My dog is scratching but I don\'t see any fleas. What else could it be?',
        answer:
          'Environmental triggers such as pollen, dust, and mold, food sensitivity, or parasites you cannot easily see. Fleas are also skilled at hiding, so absence of sightings proves little while prevention lapsed. Track where the scratching concentrates and when it peaks, then bring that pattern to your veterinarian.',
      },
      {
        question: 'Can I give my itchy pet an antihistamine from my own cabinet?',
        answer:
          'Only with your veterinarian\'s guidance for your specific animal. Some medications that are safe for dogs are risky for cats, and dosing depends on weight and health history rather than guesswork. It is a fair question to ask the clinic by phone; it is not a decision to make alone.',
      },
      {
        question: 'What can I put on my pet\'s skin to stop the itching tonight?',
        answer:
          'A cool water rinse, gently towel-dried, takes the heat and frantic edge off, and an e-collar protects raw spots from nails overnight. Soothing is not treatment, though. If the skin is broken, balding, or waking anyone at night, the next step is a phone call, not another soak.',
      },
      {
        question: 'How do I know if my pet\'s itching is food-related?',
        answer:
          'Food-related itching usually runs all year rather than in seasons, and it concentrates on paws and ears. The reliable answer is a proper diet trial done with veterinary supervision, which means strict rules for its full length. Shortcut tests from a store shelf cannot confirm it.',
      },
      {
        question: 'What is a hot spot and how do I stop one?',
        answer:
          'A hot spot is self-inflicted skin damage created by a scratch-lick cycle that feeds itself, and it grows with alarming speed. Break the cycle the day you find it, keep the area dry, and let a groomer or vet clip painful skin. Fast action keeps it small.',
      },
    ],
    heroImageUrl: '/images/health_woman_cat.jpg',
    heroImageAlt: 'Veterinarian examining a tabby cat\'s skin and coat',
  },

  // =========================================================================
  // EAR CARE
  // =========================================================================
  'wellness/ear-care': {
    heroTitle: 'Pet Ear Care by Shape: Cleaning Without Causing Harm',
    heroSubheadline:
      'Floppy ears, swimmer ears, and upright ears each need different routines. Learn the gentle technique, the honest frequency, and the signs that head straight to the clinic.',
    metaDescription:
      'Pet ear care by shape: which ears need a cleaning routine, the gentle technique, how often is too often, and the smells and head-shaking that need a vet.',
    introSummary:
      'August, and the dog shakes his head so hard his ears flap like flags. Every swimming season, families learn that lake water plus folded ears can equal a September ear infection. Ear care is mostly a matter of shape and lifestyle: upright ears air themselves out, while floppy ears and swimmer ears hold moisture and need a routine. The routine is small and gentle, built around drying more than scrubbing. Here is how to build one that fits your animal, and how to recognize when shaking stops being routine.',
    sections: [
      {
        id: 'shape-rules',
        title: 'Why Ear Shape Sets the Rules',
        content:
          'An ear canal is a tube, and tubes behave according to what covers them. Upright ears stand open to moving air, so moisture evaporates and the canal largely manages itself. Ears that fold over the opening trap warm, humid air in a dark tube, which is exactly the environment yeast and bacteria wait for. Hair growing inside the canal complicates things further by holding debris. None of this means floppy-eared dogs are destined for infections; it means their ears need modest human help to do what upright ears do alone. Match the routine to the shape, not to guilt or to a calendar.',
        tips: [
          'Folded ears need help drying; upright ears mostly need watching.',
          'Hairy canals deserve a groomer\'s attention rather than home plucking.',
          'Dry ears after every swim, lake or bath alike.',
        ],
      },
      {
        id: 'who-needs-routine',
        title: 'Who Actually Needs a Cleaning Routine',
        content:
          'A routine earns its place by lifestyle and anatomy, not by breed fashion. Folded-ear breeds, dogs who swim or get bathed often, and pets with hairy canals sit at the top of the list. Upright-eared dogs living dry indoor lives may need almost nothing beyond inspection. When you do compare cleaners in the marketplace listings, pet-formulated options with short ingredient lists are the standard to hold.',
        tableData: {
          headers: ['Ear situation', 'Sensible routine', 'Watch closely for'],
          rows: [
            ['Upright, air-exposed ears', 'Weekly look, cleaning only when wax builds', 'Wax that turns dark or heavy'],
            ['Folded or floppy ears', 'Weekly inspection, cleaning every few weeks', 'Odor, head-shaking, rubbing on carpets'],
            ['Hairy canals', 'Groomer trims between cleanings', 'Debris caught deep near the opening'],
            ['Swimmer or bath-time ears', 'Dry thoroughly after every wet outing', 'A moisture smell that lingers a day later'],
          ],
        },
        tips: [
          'Keep a designated drying towel by the door for wet ears.',
          'Lift the ear flap and sniff weekly; smell changes arrive early.',
        ],
      },
      {
        id: 'gentle-technique',
        title: 'The Gentle Technique, Step by Step',
        content:
          'Sit your animal, warm the cleaner to room temperature if it has been stored cool, and dampen a cotton ball or gauze pad with it. Lift the ear flap, wipe the folds and the opening you can see, and let your pet shake out whatever sits deeper, because shaking is the safe extraction method and probing is not. Follow with a dry swipe, then praise and a treat, so the ritual stays survivable. A cleaner formulated for pets keeps the canal\'s own balance intact, which is why water, peroxide, and alcohol-based home substitutes cause the problems they promise to solve.',
        callout: {
          type: 'warning',
          title: 'Cotton Swabs Belong Nowhere Near a Canal',
          text: 'A swab pushes wax and debris deeper, packs it against the eardrum, and turns cleanable wax into a plugged canal. Fingers, gauze, and shaking do the safe work; anything on a stick stays out of the ear.',
        },
        tips: [
          'Wipe only what you can see; shaking handles everything deeper.',
          'Finish every cleaning with a dry swipe and a treat.',
          'Reject homemade mixes of alcohol, peroxide, or plain water.',
        ],
      },
      {
        id: 'how-often',
        title: 'How Often Is Too Often',
        content:
          'The most common cleaning mistake is not too little but too much. Ear canals defend themselves with a slow migration of wax that carries debris outward, and aggressive weekly cleaning can strip that layer and leave the skin raw and reactive. Clean when an inspection finds actual wax building, not because Saturday arrived, and let a healthy, quiet, neutral-smelling ear stay untouched. For most folded-ear dogs that means a wipe every few weeks, and for swimmers it means consistent drying with occasional cleaning. If you find yourself cleaning weekly for more than a month, the ear is telling you something is wrong inside, and that message belongs to your veterinarian.',
        tips: [
          'Clean on evidence, not on a calendar date.',
          'A quiet, neutral-smelling ear needs nothing done to it.',
          'Weekly cleaning for a month straight means the canal needs a vet.',
        ],
      },
      {
        id: 'healthy-vs-worrisome',
        title: 'Healthy Versus Worrisome, Up Close',
        content:
          'Learn the healthy baseline first: a small amount of pale, honey-colored wax, skin the color of the rest of the inner ear, and no smell worth noticing. Departures announce themselves in pairs. Discharge that turns dark, heavy, or chunky pairs with a sour or yeasty odor, and redness pairs with rubbing the ear along carpets and furniture. Head-shaking that persists past the post-swim shake-off, scratching at one ear with a back paw, or flinching when the base is touched all push the same direction. Pain indicators, including a head held tilted, mean the canal is complaining loudly.',
        tips: [
          'Sniff weekly; a sour or yeasty smell arrives before visible mess.',
          'One itchy ear is more suspicious than two mildly waxy ones.',
          'A persistent head tilt or flinch at the base means call today.',
        ],
      },
      {
        id: 'cats-and-mites',
        title: 'Cats, Mites, and Head-Shaking Flags',
        content:
          'Cat ears are quieter than dog ears, and mostly they should stay that way. A healthy indoor cat\'s ears rarely need more than a monthly glance. Kittens, outdoor cats, and new arrivals from shelters are the classic mite carriers, and mites leave a distinctive dry, coffee-ground discharge with frantic scratching. Because cats shake their heads less casually than dogs, repeated shaking in a cat carries more weight and deserves a prompt look. Cleaning a mite-infested ear does nothing for the mites themselves; that is a diagnosis and treatment that belongs to your veterinarian, and usually a straightforward one.',
        callout: {
          type: 'vet-note',
          title: 'Coffee-Ground Debris Means a Clinic Look',
          text: 'Dry, dark, crumbly debris in a young cat\'s ears is the classic mite signature, and it is confirmed with a quick in-clinic look. Cleaning alone cannot clear mites, and they spread between animals in the home.',
        },
        tips: [
          'Check new arrivals and kittens for dark, crumbly ear debris.',
          'Take repeated head-shaking in cats seriously from the first day.',
          'Wipe indoor-only cats\' ears monthly and otherwise leave them alone.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Match the Shape',
        items: [
          { highlight: 'Upright ears breathe', text: 'they mostly air themselves and need looking over weekly.' },
          { highlight: 'Folded ears trap', text: 'humidity and deserve an established drying and airing routine.' },
          { highlight: 'Ears dried post-swim', text: 'dried after every single wet outing, without exceptions.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Clean Gently',
        items: [
          { highlight: 'Wipe the visible', text: 'folds and opening only; shaking clears the deeper canal.' },
          { highlight: 'No swabs, ever', text: 'sticks push wax inward and pack it against the eardrum.' },
          { highlight: 'Pet-formulated cleaners only', text: 'water, peroxide, and alcohol disturb the canal\'s balance.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Know the Flags',
        items: [
          { highlight: 'A sour smell', text: 'usually arrives before any visible discharge shows up.' },
          { highlight: 'Shaking that persists', text: 'lingering past the post-swim shake-off deserves a prompt look.' },
          { highlight: 'One-sided ear trouble', text: 'a single painful ear is more suspicious than two.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How often should I clean my dog\'s ears?',
        answer:
          'Only when wax is actually building. For many dogs that is every few weeks, and for upright-eared, dry-lifestyle dogs it is rarer still. Overcleaning strips the protective wax layer and can create irritation that looks exactly like the problem you were preventing. Inspection can be weekly; cleaning should follow evidence.',
      },
      {
        question: 'Can I use cotton swabs to clean my pet\'s ears?',
        answer:
          'No. Swabs push wax and debris deeper into the canal and can pack material against the eardrum, turning a simple cleaning into a veterinary problem. Use a dampened cotton ball or gauze on the parts you can see, and let your pet\'s natural head-shake handle the rest.',
      },
      {
        question: 'Why do my dog\'s ears smell sour?',
        answer:
          'A sour or yeasty odor usually means yeast has taken hold in a moist canal, and it often pairs with dark discharge and head-shaking. It needs a veterinary diagnosis and treatment rather than more cleaning, because cleaner alone will not restore the canal\'s balance. Drying habits help prevent the next round.',
      },
      {
        question: 'How can I tell if my cat has ear mites?',
        answer:
          'The classic signature is dry, dark, crumbly debris that looks like coffee grounds, intense scratching, and sometimes a head tilt, usually in kittens or newly adopted cats. Mites are contagious between animals, so every pet in the house needs checking. A vet confirms them quickly with an in-clinic look.',
      },
      {
        question: 'Should I pluck the hair from my dog\'s ear canals?',
        answer:
          'That one divides even professionals. Some groomers pluck lightly for hairy canals that repeatedly collect debris, while many veterinarians prefer trimming, since plucking can inflame the skin. If your dog\'s hairy ears cause recurring problems, ask your vet which approach suits him before doing either at home.',
      },
    ],
    heroImageUrl: '/images/golden_portrait.jpg',
    heroImageAlt: 'Golden retriever with floppy drop ears outdoors',
  },

  // =========================================================================
  // EYE CARE
  // =========================================================================
  'wellness/eye-care': {
    heroTitle: 'Everyday Pet Eye Care and the Signs Not to Wait On',
    heroSubheadline:
      'Eyes forgive almost nothing. Gentle wiping habits, awareness of flat-faced risk, and a same-day list for the urgent signs keep small problems small.',
    metaDescription:
      'Pet eye care: wipe discharge correctly, know flat-faced breed risks, manage tear staining gently, and spot urgent signs like squinting and cloudiness early.',
    introSummary:
      'Eyes are the one system where waiting costs the most. A sore leg can be rested, an upset stomach settles, but a scratched cornea measured in hours decides between a minor heal and permanent damage. The good news is that everyday eye care is small: wiping discharge the correct way, knowing your breed\'s risks, and holding a short list of urgent signs in your head. That list is short for a reason, and by the end of this article it will be yours.',
    sections: [
      {
        id: 'wiping-right',
        title: 'Wiping Discharge the Right Way',
        content:
          'Morning eye boogers are normal housekeeping, and the technique is everything. Use a clean, soft, disposable material such as a cotton pad or lint-free cloth, dampened with warm water, and wipe from the inner corner outward in one direction, lifting crust away rather than dragging it across the eye. Use a fresh pad for the second eye so you never ferry anything from one side to the other, and soften overnight crust with a held damp pad for a minute before wiping. For animals who accumulate daily, a standing morning wipe keeps the fur below the eye from scalding. If you compare eye-wipe products in the marketplace, fragrance-free with plain ingredients is the standard to hold.',
        tips: [
          'Wipe inner corner outward, one direction, never back and forth.',
          'Use a fresh pad per eye to avoid carrying anything across.',
          'Soften dried crust with a damp pad before lifting it away.',
        ],
      },
      {
        id: 'flat-faced-eyes',
        title: 'Flat-Faced Breeds and Their Exposed Eyes',
        content:
          'Flat-faced dogs and cats live with eyes that sit forward in shallow sockets, which gives them their expressive look and a set of hidden risks. The blink may not fully cover the cornea, so the surface dries and collects dust that other animals brush away automatically. On walks, keep their face out of blowing grit and car-window wind, and check the eyes after rambunctious play in sand or gravel. Fur that curls toward the eyeball needs trimming, which a groomer can do safely. A quiet evening inspection, looking for redness or dullness, catches the small injuries these breeds collect.',
        tips: [
          'Shield flat faces from blowing grit and open car windows.',
          'Trim fur curling toward the eye; groomers do this safely.',
          'Inspect flat-faced eyes nightly for redness or dullness.',
        ],
      },
      {
        id: 'tear-staining',
        title: 'Tear Staining Without Harsh Chemistry',
        content:
          'The rusty brown streaks under some eyes are tears that overflowed and oxidized on the fur, and they are cosmetic, not a health verdict. The staining itself responds to boring consistency: wipe the area daily with a damp cotton pad, then dry it thoroughly, because damp fur stains faster. Cutting through the causes helps more, whether that is shallow face shape, puppy teething, or seasonal irritation. Products promising to bleach stains away deserve real caution anywhere near eyes, and any sudden change in wetness or staining deserves a veterinary look to check the drainage is working.',
        callout: {
          type: 'warning',
          title: 'Nothing Caustic Near an Eye',
          text: 'Hydrogen peroxide, makeup removers, and human whitening products have no place on the fur around the eyes. If a stain product\'s ingredient list reads like a chemistry exam, leave it on the shelf and ask your vet instead.',
        },
        tips: [
          'Wipe the stained fur daily, then dry it completely.',
          'Treat sudden new wetness as a drainage question for the vet.',
          'Pass on bleaching products anywhere near the eyes.',
        ],
      },
      {
        id: 'environment-irritation',
        title: 'Environments That Irritate and Small Shields',
        content:
          'Most eye irritation arrives through the environment, and most of it is fixable with furniture moves and habit changes. Position beds and crates away from fans and heating vents that blow air across a sleeping face, and note that dusty homes, renovation work, and dry winter air all show up in red-rimmed eyes. After beach days or dusty hikes, a gentle rinse of the face and a look beneath both lids settles what grit rode home. Cats and short-faced dogs benefit most from these checks. None of this replaces the urgent list; it simply keeps the everyday irritations from sounding like alarms.',
        tips: [
          'Move beds away from fans, vents, and forced-air streams.',
          'Rinse dusty faces after beach days and renovation weekends.',
          'Consider a humidifier when winter air leaves eyes red-rimmed.',
        ],
      },
      {
        id: 'products-shelf',
        title: 'Eye Products on the Shelf, Judged Gently',
        content:
          'The eye shelf is narrow on purpose. Sterile saline labeled for ocular use has one job at home, flushing loose dust and grit in an eye that is otherwise comfortable, always following the label\'s directions. Fragrance-free maintenance wipes earn their place for daily discharge duty, especially on wrinkled, flat-faced faces. Everything else, drops promising to remove redness, ointments, anything medicinal, belongs behind a veterinary conversation rather than an impulse add to the cart. Check expiry dates honestly; eye products carry them for reasons that matter.',
        tips: [
          'Keep sterile eye saline for flushing loose grit, label directions first.',
          'Choose fragrance-free, simple wipes for daily discharge maintenance.',
          'Leave redness-relief drops and ointments to veterinary guidance.',
        ],
      },
      {
        id: 'urgent-list',
        title: 'The Same-Day List: Urgent Eye Signs',
        content:
          'Eyes move on their own clock, and the urgent list is worth memorizing. Squinting that persists for hours, a cloudy or blue haze on the surface, sudden frantic pawing, an eye held shut, visible cuts or foreign material, and a pupil that looks wrong beside its partner all mean the same thing: same-day veterinary care, not a weekend of watching. Scratches to the cornea can deepen quickly, and some eye injuries deteriorate between tonight and tomorrow morning. When one of these signs appears, do not rinse, do not apply anything, and do not wait for morning to see how it looks.',
        callout: {
          type: 'vet-note',
          title: 'Eyes Get Same-Day Appointments',
          text: 'Most clinics reserve real room in the schedule for eye complaints, because the window for successful treatment is measured in hours. Squinting, cloudiness, or sudden pain after dust or play means call now, tonight if needed.',
        },
        tips: [
          'Call the same day for squinting, cloudiness, or a held-shut eye.',
          'Never rinse or apply home remedies to an injured eye.',
          'Find the nearest emergency clinic before you need one.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Wipe Correctly',
        items: [
          { highlight: 'Inner to outer', text: 'wipe in one direction, from the inner corner outward.' },
          { highlight: 'One pad per eye', text: 'never carry anything from one side to the other.' },
          { highlight: 'Soften the crust first', text: 'hold a damp pad on crust before lifting.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Breed Risks',
        items: [
          { highlight: 'Flat faces blink less', text: 'shallow sockets leave the corneas exposed and dry-prone.' },
          { highlight: 'Fur trimmed away', text: 'hairs curling toward the eye get groomer trims.' },
          { highlight: 'Shields from grit', text: 'keep flat faces out of wind and blowing dust.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Same-Day Signs',
        items: [
          { highlight: 'Hours of squinting', text: 'that persists for hours means pain, not tiredness.' },
          { highlight: 'A cloudy surface', text: 'a blue or white haze on the surface is urgent.' },
          { highlight: 'Sudden frantic pawing', text: 'rubbing after dust or play needs care now.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How do I get rid of my dog\'s eye discharge?',
        answer:
          'Wipe it away correctly and daily: a clean, damp, soft pad, wiping from the inner corner outward, with a fresh pad for each eye. Morning crust is normal housekeeping. A change in amount, color, or thickness, especially green or yellow discharge, means the wiping phase is over and a vet visit is due.',
      },
      {
        question: 'Why are tear stains brown under my dog\'s eyes?',
        answer:
          'Tears contain iron-bearing compounds that oxidize to rusty brown when they sit on fur. Shallow facial grooves and teething puppies overflow more, so light-colored coats show it first. The stains are cosmetic; daily wiping and thorough drying manage them, and sudden changes in wetness deserve a check of the drainage itself.',
      },
      {
        question: 'Are tear stains bad for my dog\'s health?',
        answer:
          'No, the staining itself is cosmetic. The damp fur beneath it can scald or smell if left unwiped, which is the practical reason for a daily swipe. The health question lives underneath: constantly overflowing tears can point to irritation or drainage issues, so mention persistent new wetness at your next vet visit.',
      },
      {
        question: 'When is an eye problem an emergency for a pet?',
        answer:
          'Squinting that lasts hours, cloudiness or a blue haze, an eye held shut, sudden frantic pawing, visible damage, or unequal pupils. Eye injuries can worsen overnight, so these earn same-day care rather than a wait-and-see weekend. Do not rinse, apply drops, or improvise; just call the clinic.',
      },
      {
        question: 'Do flat-faced dogs need special eye care?',
        answer:
          'Yes. Their forward-set eyes blink less completely, so the surface collects dust and dries faster. Keep their face out of wind and grit, check eyes nightly for redness or dullness, and keep curling fur trimmed away. They are also more prone to corneal scratches, so take any sudden squint seriously.',
      },
    ],
    heroImageUrl: '/images/health_woman_cat.jpg',
    heroImageAlt: 'Veterinarian examining a tabby cat\'s eyes',
  },

  // =========================================================================
  // DENTAL CARE
  // =========================================================================
  'wellness/dental-care': {
    heroTitle: 'Pet Dental Care: Toothbrushing Your Dog or Cat Accepts',
    heroSubheadline:
      'The most skipped daily habit is also the highest-leverage one. Small steps, pet-safe paste, and honest backup from chews and the clinic keep teeth in the game for years.',
    metaDescription:
      'Pet dental care that genuinely happens: toothbrushing in tiny positive steps, pet-safe paste only, chews as helpers, and the dental-pain signals people miss.',
    introSummary:
      'Here is the uncomfortable, number-free truth: most pets go their whole lives without a single brushing, and most of their people feel vaguely guilty about it. The gap is not laziness. Nobody shows you how, the animal argues, and the payoff sits years away. But daily toothbrushing is the one habit that repeatedly earns its keep, and it is teachable to nearly any dog or cat in small, positive steps: the method, the paste rules, chews\' honest role, and the pain signals hiding in plain sight.',
    sections: [
      {
        id: 'what-brushing-does',
        title: 'What Brushing Actually Does, and When',
        content:
          'Within a day of cleaning, a soft bacterial film builds on tooth surfaces, and brushing is simply the act of disrupting that film before it mineralizes. Once it hardens into tartar, no brush on the market touches it; that scale is professional-removal territory. So the whole game is frequency: daily brushing is the ideal, most-days brushing still earns results, and a twice-monthly attempt is mostly theater. The encouraging part is duration. A thorough-enough pass takes under a minute per animal once both of you know the drill, which is less time than the guilt weighs.',
        tips: [
          'Aim for daily, settle happily for most days of the week.',
          'Under a minute of good contact beats five minutes of wrestling.',
          'Brushing prevents tartar; it never removes what already hardened.',
        ],
      },
      {
        id: 'small-positive-steps',
        title: 'Introducing the Brush in Small Positive Steps',
        content:
          'Teach it like a trick, in treats and seconds. Day one, let your pet lick pet toothpaste off your finger and call it a win. Next, rub a fingertip along a canine tooth for a second, praise, done. Then graduate to a finger brush, then a soft pet brush, adding teeth a few at a time over a week or two, always ending on a success. Lift the lip gently instead of prying the jaw, work the outer surfaces where plaque gathers, and quit before your pet asks you to. Forced sessions teach avoidance that takes months to undo.',
        callout: {
          type: 'pro-tip',
          title: 'Quit Before They Ask You To',
          text: 'End every session one rep before your pet loses patience. Attitude outlasts technique by miles here, because an animal who tolerates brushing keeps the habit for life, and one who dreads it never will.',
        },
        tips: [
          'Start with paste licked from a finger, no brush, day one.',
          'Add teeth gradually across weeks, praising each small rep.',
          'Lift the lip gently; never pry the jaw open for access.',
        ],
      },
      {
        id: 'pet-safe-paste',
        title: 'Pet-Safe Toothpaste Is Non-Negotiable',
        content:
          'Human toothpaste is the one hard never in this whole habit, for two reasons. Pets swallow rather than spit, and human formulas are built expecting the opposite: fluoride is dosed for spitting, and xylitol, a common sweetener, is genuinely dangerous for dogs even in small amounts. Pet toothpaste is made to be swallowed, comes in flavors animals file under food, such as poultry, malt, and beef, and many are enzymatic, meaning they keep working with mild contact rather than demanding hard scrubbing. When you compare dental products in the marketplace listings, paste and brush sold as a kit are the easiest honest start.',
        tips: [
          'Buy paste labeled for pets; swallowing is the whole plan.',
          'Check human pastes for xylitol and keep them out of reach.',
          'Enzymatic formulas reward gentle contact over scrubbing power.',
        ],
      },
      {
        id: 'chews-as-helpers',
        title: 'Dental Chews as Helpers, Never Replacements',
        content:
          'A good chew does real, partial work: the texture scrapes some plaque from the teeth your animal actually chews with. The operative word is partial. A dog who gnaws patiently for ten minutes gets more from a chew than a gulper who swallows it in three bites, and the back molars where tartar loves to gather often miss the action entirely. Chews also carry calories that belong in the daily budget, and aggressive chewers need textures matched to their jaw honesty, because fractured teeth are their own veterinary bill. Look for claims backed by veterinary dental evaluation, and treat chews as the backup singer to brushing.',
        tips: [
          'Match chew size and texture to how your animal actually chews.',
          'Count chew calories inside the daily food budget honestly.',
          'Prefer chews with claims from veterinary dental evaluation programs.',
        ],
      },
      {
        id: 'pain-signals',
        title: 'Bad Breath and Eating Changes as Pain Signals',
        content:
          'Pet breath is never minty, but there is a difference between dog-breath and the sour, thick smell that infection produces. That persistent odor, along with red or receding gum edges, earns a professional look. Watch the bowl for subtler evidence: kibble dropped and re-picked up, chewing suddenly shifted to one side, hard treats refused that used to disappear, or new drooling and face-rubbing. Animals instinctively hide oral pain and keep eating through remarkable discomfort, so appetite is a blunt instrument. The annual exam, where a vet lifts the lip and checks every tooth, catches what stoicism conceals.',
        callout: {
          type: 'vet-note',
          title: 'Eating Differently Is a Dental Clue',
          text: 'Dropped kibble, one-sided chewing, and suddenly refused hard treats are often the only visible signs of a painful tooth. Mention them at your clinic by phone if they appear and persist; mouths are examined properly under sedation.',
        },
        tips: [
          'Report dropped kibble or one-sided chewing rather than watching it fade.',
          'Treat thick, sour breath as a bacterial signal, not a personality trait.',
          'Book the annual mouth check even when everything seems fine.',
        ],
      },
      {
        id: 'anesthesia-free-question',
        title: 'The Anesthesia-Free Cleaning Question',
        content:
          'Shops and pop-ups sometimes offer anesthesia-free scaling, and the pitch is understandable: no sedation, lower cost, visible results on the front teeth. Approach with clear eyes. Awake animals will not tolerate work below the gumline, where periodontal disease actually lives, so what gets scraped is the cosmetic crown you can see. X-rays cannot happen awake, so roots stay invisible, and skipped polishing leaves roughened enamel that gathers plaque faster than before. There is also the welfare side: restrained, awake scraping frightens many animals. Ask a clinic to walk you through a full anesthetic dental, including monitoring and pricing, before deciding anything.',
        tips: [
          'Ask any awake-cleaning provider exactly what happens below the gumline.',
          'Request the full picture of anesthetic dentals, monitoring included, before choosing.',
          'Weigh the hidden roots: X-rays only happen under anesthesia.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Build the Habit',
        items: [
          { highlight: 'Tiny positive steps', text: 'paste off a finger, then a tooth, then a brush.' },
          { highlight: 'Short, most-day sessions', text: 'brief and frequent beats heroic and rare sessions.' },
          { highlight: 'The outer surfaces', text: 'lift the lip and work where plaque gathers.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Safe Products',
        items: [
          { highlight: 'Pet paste only', text: 'human formulas carry both fluoride and xylitol risks.' },
          { highlight: 'Enzymatic paste help', text: 'mild contact keeps working without any hard scrubbing.' },
          { highlight: 'Chews with vetted claims', text: 'dental evaluation backing, with calories counted daily too.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Pain in Disguise',
        items: [
          { highlight: 'Thick, sour breath', text: 'that odor signals bacteria, not just dog breath.' },
          { highlight: 'Changes at the bowl', text: 'dropped kibble and one-sided chewing are dental clues.' },
          { highlight: 'Annual mouth check', text: 'stoic animals hide dental pain remarkably, stubbornly well.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How often should I brush my dog\'s teeth?',
        answer:
          'Daily is the goal, and most days still earns real results, because the bacterial film rebuilds within a day and brushing works by disrupting it before it hardens. Under a minute of good contact counts. Twice a month, honestly, is mostly theater; if that is your ceiling, lean harder on chews and the annual clinic exam.',
      },
      {
        question: 'Can I use human toothpaste on my dog or cat?',
        answer:
          'No. Pets swallow toothpaste instead of spitting, and human formulas assume the opposite. Fluoride levels are dosed for spitting, and xylitol, a sweetener in many human pastes, is dangerous for dogs. Pet toothpaste is designed to be swallowed and comes in flavors your animal will actually accept.',
      },
      {
        question: 'Do dental chews actually clean teeth?',
        answer:
          'Partially, on the teeth your animal actually chews with, and texture plus chewing style decides how much. Patient gnawers get more than gulpers, and back molars often miss the action. Chews are a legitimate helper within a calorie budget, never a replacement for brushing or professional cleanings.',
      },
      {
        question: 'Why does my dog\'s breath smell so bad all of a sudden?',
        answer:
          'A sudden sour, thick odor often signals bacterial buildup along the gumline or an infected tooth, especially when it arrives with red gums, drooling, or changed chewing. Persistent bad breath deserves a professional look rather than a mint-flavored cover-up. Dental pain hides well behind normal appetite.',
      },
      {
        question: 'Is anesthesia-free teeth cleaning safe for pets?',
        answer:
          'Approach it with real caution. Awake cleaning scrapes the visible crown only, cannot reach below the gumline where disease progresses, skips X-rays and polishing, and frightens many restrained animals. It can look clean without being healthy. Discuss a full anesthetic dental with monitoring before deciding.',
      },
    ],
    heroImageUrl: '/images/golden_portrait.jpg',
    heroImageAlt: 'Golden retriever outdoors with a relaxed expression',
  },

  // =========================================================================
  // DIGESTIVE REMEDIES
  // =========================================================================
  'wellness/digestive-remedies': {
    heroTitle: 'Gentle Digestive Remedies for a Pet\'s Upset Stomach',
    heroSubheadline:
      'Most mild stomach trouble resolves at home with boring care and watching. Learn the bland-diet approach, pumpkin\'s real role, transition rules, and the red flags that end home treatment.',
    metaDescription:
      'Digestive remedies for mild upset: bland-diet basics, canned pumpkin\'s role, probiotics through changes, slow transitions, and red flags that end home care.',
    introSummary:
      'There is a specific 3 a.m. sound every pet person knows, the urgent retch from the hallway, followed by the sleep-deprived search session. Most of the time the story is boring and good news: something disagreed with your animal once, and a day of gentle care settles it. The skill is in telling that story apart from the one that needs a veterinarian this morning. Bland meals, a little plain pumpkin, water watched closely, and a hard list of red flags are the whole toolkit.',
    sections: [
      {
        id: 'read-the-situation',
        title: 'Read the Situation Before Reaching for Anything',
        content:
          'Start with detective work, not remedies. A single vomit from an animal who then trots to the breakfast bowl is one story; four vomits from a quiet animal hiding under the bed is another. Walk the house for evidence, a knocked-over bin, a chewed toy missing parts, a houseplant with fresh bite marks, yesterday\'s new bag of treats, and note what the mess actually contained. Factor in the animal: puppies, kittens, tiny breeds, and seniors carry less reserve for dehydration. Demeanor is your most honest gauge, and it stays honest through everything that follows.',
        tips: [
          'Check demeanor before symptoms; bright and hungry is reassuring.',
          'Search the house for what got raided before assuming illness.',
          'Give puppies, small breeds, and seniors a lower worry threshold.',
        ],
      },
      {
        id: 'bland-diet',
        title: 'The Bland-Diet Approach, Done Gently',
        content:
          'For a healthy adult dog with a mild upset, skipping one meal and then serving small, plain portions is the classic pattern. The standard bland plate is boiled, skinless, unseasoned chicken with plain white rice, fed in small amounts a few times through the day rather than one big bowl. Cats lean carnivore: plain boiled chicken in small servings works, with rice optional and minor. Whatever the species, the return to normal food happens gradually across a couple of settled days, not at the first good stool. Bland food is a rest, not a diet plan.',
        tips: [
          'Serve small portions through the day, never one big reunion bowl.',
          'Keep it truly plain: no butter, salt, broth cubes, or seasoning.',
          'Return to normal food gradually after a couple of settled days.',
        ],
      },
      {
        id: 'pumpkin-role',
        title: 'Plain Canned Pumpkin\'s Honest Role',
        content:
          'The pumpkin everyone mentions deserves its reputation, with footnotes. Plain canned pumpkin, nothing but pumpkin, is a mild fiber source that absorbs extra water in loose stool and gently supports normal gut movement. The spoonful you mix into a bland meal is a helper, not a cure, and it does nothing for vomiting. Read labels hard, because pie filling looks identical on the shelf and carries sugar and spices no upset stomach wants. Cats can have a small taste too. If stool does not improve over a day or two of bland care, the problem has outgrown pantry remedies.',
        callout: {
          type: 'warning',
          title: 'Pumpkin, Not Pumpkin Pie Filling',
          text: 'The cans look nearly identical. One ingredient list says pumpkin alone and the other adds sugar and pie spices, which work against the whole point. Read the label before the spoonful.',
        },
        tips: [
          'Buy pure pumpkin, one ingredient, no sugar or pie spices.',
          'Mix a spoonful into the bland meal rather than serving it alone.',
          'Expect help with loose stool, never with vomiting.',
        ],
      },
      {
        id: 'probiotics-support',
        title: 'Probiotics Through Changes and Stress',
        content:
          'The digestive tract runs on a community of microbes, and that community wobbles during food changes, travel, new household members, and courses of medication. A pet-formulated probiotic, given before and through a known disruption, is a reasonable attempt to keep the population steady. Start a day or two before the new bag of food opens, keep it going through the transition week, and continue if a stressful event lands mid-switch. Paste, powder, and chew forms each suit different animals, exactly like the supplement shelf generally. When you compare probiotic options in the marketplace listings, stable live cultures and species-appropriate formulas are what to hold out for. None of this is rescue medicine; probiotics are steadying hands, not emergency care.',
        tips: [
          'Begin probiotics a couple of days before a planned food change.',
          'Continue through the full transition, especially with travel stacked on top.',
          'Choose pet-formulated products; species and strains matter here.',
        ],
      },
      {
        id: 'slow-transitions',
        title: 'The Slow Transition Rule for New Food',
        content:
          'New food introduced overnight is one of the most self-inflicted stomach upsets in pet keeping. The patient pattern takes seven to ten days: begin with a mix that is mostly the current food with a small share of the new, step the ratio up every few days, and let the final bowl be entirely new only after a week of settled stool. Sensitive animals simply get a slower curve, stretching the same schedule rather than abandoning it. This applies to treats and chews too, since a sudden new bag behaves like sudden new food. A calendar note on the pantry door beats memory every time.',
        tips: [
          'Spread new-food transitions across seven to ten days, minimum.',
          'Raise the new food\'s portion every few days, and watch stool quality closely.',
          'Transition treats too; sudden new chews upset stomachs as well.',
        ],
      },
      {
        id: 'red-flags',
        title: 'Red Flags That End Home Treatment Immediately',
        content:
          'Home care has a fence, and these signs are it. Repeated vomiting over a day, blood in vomit or stool, a swollen or tight belly, unproductive retching, visible pain, or an animal who will not rise all mean the same thing: stop everything and call. Deep-chested breeds retching without product is the emergency of emergencies.',
        tableData: {
          headers: ['What you see', 'What it suggests', 'Where to go'],
          rows: [
            ['Single vomit, then normal behavior', 'Simple dietary disagreement', 'Bland care and watching at home'],
            ['Loose stool, drinking, bright demeanor', 'Mild intestinal upset', 'Bland diet, pumpkin, probiotics'],
            ['Repeated vomiting across hours', 'Something beyond diet', 'Vet call today'],
            ['Blood in vomit or stool', 'Needs direct diagnosis', 'Vet, promptly'],
            ['Swollen belly, retching, no product', 'Surgical emergency in large breeds', 'Emergency clinic now'],
            ['Vomiting plus lethargy or refusing water', 'Systemic trouble', 'Same-day veterinary care'],
          ],
        },
        tips: [
          'Treat a tight belly with dry retching as an immediate emergency.',
          'Blood in vomit or stool always moves home care to the clinic.',
          'Stop all food and call when vomiting repeats across hours.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Settle Mildly',
        items: [
          { highlight: 'Bland and small', text: 'plain chicken and rice in little, frequent portions.' },
          { highlight: 'Pure plain pumpkin', text: 'a spoonful of the real thing, never spiced pie filling.' },
          { highlight: 'Water watched closely', text: 'drinking steadily matters even more than eating today.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Go Slowly',
        items: [
          { highlight: 'Seven to ten days', text: 'is the patient, honest window for new food.' },
          { highlight: 'Probiotic head start', text: 'begin before the change and continue through it.' },
          { highlight: 'Treats count too', text: 'a sudden new chew bag behaves like new food.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Know the Fence',
        items: [
          { highlight: 'Vomiting that repeats', text: 'vomiting that repeats across hours ends home treatment entirely.' },
          { highlight: 'Blood, or bloat', text: 'both mean the clinic today, without any negotiation.' },
          { highlight: 'Demeanor reads first', text: 'a quiet, hiding animal outweighs any single symptom.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'What can I give my dog for an upset stomach?',
        answer:
          'For a mild, one-off upset in a bright adult dog: a skipped meal or two of small, plain portions, such as boiled skinless chicken with white rice, a spoonful of pure canned pumpkin for loose stool, and water always available. Anything beyond mild, or lasting past a day, moves the answer to your veterinarian.',
      },
      {
        question: 'Is canned pumpkin good for dog diarrhea?',
        answer:
          'It can help mild cases, not fix serious ones. Its gentle fiber absorbs extra water and supports normal gut movement, which is why a spoonful mixed into bland food is such standard advice. Use pure pumpkin only, never spiced pie filling, and bring persistent or worsening diarrhea to your vet.',
      },
      {
        question: 'How long should I transition my pet to a new food?',
        answer:
          'A week to ten days is the right window. Begin with mostly the current food plus a little of the new, then raise the new food\'s share every few days, watching stool as you go. Sensitive animals need the same schedule stretched longer, and sudden switches, including new treats, are how most tummy troubles start.',
      },
      {
        question: 'When is my pet\'s vomiting an emergency?',
        answer:
          'Repeated vomiting across hours, blood in the vomit, a swollen or tight belly, dry retching that produces nothing, or vomiting alongside real lethargy are emergency territory. Deep-chested breeds retching without product need an emergency clinic immediately. Single vomits followed by normal behavior are usually far more boring.',
      },
      {
        question: 'Can cats eat plain pumpkin and bland chicken too?',
        answer:
          'Yes, in small amounts. A little pure pumpkin can help with mild loose stool, and plain boiled chicken suits their carnivore needs, with rice optional and minor. Cats should not go long without eating, though, so a cat refusing food beyond a day needs a vet rather than patience.',
      },
    ],
    heroImageUrl: '/images/health_woman_cat.jpg',
    heroImageAlt: 'Veterinarian examining a tabby cat during a checkup',
  },

  // =========================================================================
  // DNA TESTS
  // =========================================================================
  'wellness/dna-tests': {
    heroTitle: 'What a Pet DNA Test Can Realistically Tell You',
    heroSubheadline:
      'A cheek swab can map ancestry and flag genetic markers. It cannot diagnose your animal, and knowing which is which makes all the difference.',
    metaDescription:
      'Pet DNA tests explained: the difference between breed mix and health screening, how to collect a clean swab, and using results as vet conversation-starters.',
    introSummary:
      'The results arrive as a colorful pie chart, and suddenly everyone in the household is arguing about whether the dog is a third Husky. That argument is the fun half of pet DNA testing. Ancestry mapping has genuine entertainment and some practical value, while the other half, health-marker screening, is quieter and more consequential. A swab can flag variants worth knowing about, but it cannot examine, weigh, or diagnose the animal standing in front of you. Keeping those two halves straight is the skill this article teaches.',
    sections: [
      {
        id: 'two-questions',
        title: 'Two Different Questions, One Swab',
        content:
          'Companies bundle two very different products under one envelope. Ancestry mapping compares your animal\'s genetic material against a reference panel of typed breeds to estimate a mix. Health-marker screening checks for specific known variants associated with disease risk. Both can be useful; neither is a diagnosis. As you compare test options in the marketplace listings, look hard at what each panel actually screens, since that varies more than any packaging suggests.',
        tableData: {
          headers: ['Question', 'What the swab offers', 'What it cannot do'],
          rows: [
            ['What breeds is my mixed-breed dog?', 'Estimated ancestry pie chart', 'Prove exact percentages or bloodlines'],
            ['What coat and color genes does she carry?', 'Carrier status for coat traits', 'Guarantee how future puppies will look'],
            ['Are there known disease markers to know?', 'Flags for tested variants only', 'Say your animal will develop the disease'],
            ['Is my pet sick right now?', 'Nothing; this is genetics, not an exam', 'Replace exams, bloodwork, or your vet'],
            ['How big will my puppy get?', 'A rough size estimate from variants', 'Beat a hands-on growth assessment'],
          ],
        },
        tips: [
          'Treat ancestry numbers as estimates, pleasantly imprecise by nature.',
          'Read marker results as risk conversations, never as diagnoses.',
        ],
      },
      {
        id: 'ancestry-limits',
        title: 'Breed-Mix Curiosity Has Real Limits',
        content:
          'Ancestry results are estimates wearing a confident costume. Each company compares against its own reference panel, and panels differ in size and coverage, so the same dog can produce two different pie charts that are both doing their honest best. Breeds poorly represented in a panel come out as whatever they most resemble. None of this ruins the fun, and the practical guesses, adult size, coat type, general energy, are usually close enough for planning. It simply means the percentages deserve a smile, not a frame on the wall, especially when a rare breed appears in a shelter mutt.',
        tips: [
          'Expect different panels to return different, still-honest estimates.',
          'Use breed hints for size and coat planning, not personality promises.',
          'Take the pie chart with a smile, not a spreadsheet.',
        ],
      },
      {
        id: 'clean-sample',
        title: 'Collecting a Sample That Actually Works',
        content:
          'A swab fails most often at the kitchen counter, not the lab. Follow the kit\'s timing on food and treats before sampling, because a mouth full of dinner competes with cheek cells. Roll the swab firmly between the cheek and the gum for the full count in the instructions, then let it dry completely before sealing, since sealed moisture degrades the sample in transit. Never touch the bristles, swab only your target animal, and label immediately in a multi-pet household, because enthusiastic help from the cat is a real and documented outcome. Mail promptly.',
        callout: {
          type: 'pro-tip',
          title: 'The Cat Wants to Help',
          text: 'In multi-pet homes, unlabeled swabs are the classic failure. Label everything the moment it leaves the envelope, dry each swab away from curious tongues, and seal only when fully dry.',
        },
        tips: [
          'Respect the kit\'s pre-sampling window for food and treats.',
          'Dry the swab completely before sealing it for the mail.',
          'Label every sample immediately in a multi-pet household.',
        ],
      },
      {
        id: 'reading-markers',
        title: 'Reading Health Markers Without Overreading',
        content:
          'A health-marker result is a sentence about risk, not a verdict about fate. Many conditions involve multiple genes plus environment, so a flagged variant means a conversation about monitoring, not a countdown. The reverse overreads too: a clear result on the tested variants is not a clean bill of health, since no panel tests for everything and most illness is not genetic. The productive response sits in the middle. Note the markers worth knowing, adjust nothing drastic, and let the report join the diet chart and vaccination records in your animal\'s file, where it can inform decisions slowly instead of driving them overnight.',
        tips: [
          'Treat flagged markers as monitoring conversations, not countdowns.',
          'Remember a clear panel is not a clean bill of health.',
          'File results alongside diet and vaccine records for slow usefulness.',
        ],
      },
      {
        id: 'vet-conversation',
        title: 'Taking the Report to Your Veterinarian',
        content:
          'The report\'s best destination is your next annual exam, handed over rather than summarized. Ask plainly which flagged markers matter for your animal\'s age and mix, which deserve scheduled monitoring, and which can be noted and left alone. A veterinarian can turn a scary-sounding variant into a concrete plan, an occasional screening test, a weight target, or a genuine nothing-to-do, and each of those outcomes beats a private spiral through search results. Clinics are increasingly used to owners arriving with reports in hand and generally appreciate being part of the interpretation from the start.',
        callout: {
          type: 'vet-note',
          title: 'Reports Make Excellent Conversation-Starters',
          text: 'Bring the actual document, not your memory of it. Your veterinarian can tell you which markers deserve real monitoring for your animal\'s age, size, and history, and which were written to sound more urgent than they are.',
        },
        tips: [
          'Hand over the full report at your next annual exam.',
          'Ask which markers warrant monitoring and which can wait.',
          'Ask which findings are common noise for your pet\'s breed mix.',
        ],
      },
      {
        id: 'ancestry-surprises',
        title: 'Ancestry Surprises Worth Knowing About',
        content:
          'Sometimes the pie chart carries practical weight. A surprise of mostly-sighthound in a forty-pound frame explains the fence-jumping; a double-coated mix reframes the grooming calendar and the vacuum budget. Rescue puppies bring the biggest reveal, since an adult-size estimate shapes feeding choices for a fast-growing animal. A few panels include medication-sensitivity markers, which can genuinely matter when anesthesia is ever planned, so those belong in your vet\'s notes. And the rest, the third-Husky arguments and the redbone rumor from the shelter, stays what it always was: a story that makes your one-of-a-kind animal a little easier to describe.',
        tips: [
          'Feed growing rescue puppies for their estimate, adjusted at checkups.',
          'Note medication-sensitivity markers in your vet\'s file, not a drawer.',
          'Rebudget grooming when a double coat surfaces in the mix.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'sparkles',
        title: 'The Fun Half',
        items: [
          { highlight: 'The ancestry estimates', text: 'pleasantly imprecise and entirely panel-dependent, but still fun.' },
          { highlight: 'Puppy size hints', text: 'genuinely useful for planning a rescue puppy\'s future.' },
          { highlight: 'A double coat surfaces', text: 'one appearing in the mix rewrites the grooming calendar.' },
        ],
      },
      {
        icon: 'shield',
        title: 'The Serious Half',
        items: [
          { highlight: 'Markers, not fate', text: 'flagged variants mean monitoring conversations, never doom countdowns.' },
          { highlight: 'Clear is not clean', text: 'no panel tests for everything under the sun.' },
          { highlight: 'Sensitivity markers flagged', text: 'medication-sensitivity markers belong in your veterinarian\'s clinic notes.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Use It Well',
        items: [
          { highlight: 'Cleanly collected samples', text: 'follow kit timing, dry fully, label every swab.' },
          { highlight: 'Bring the report', text: 'hand it over at the annual exam, unprompted.' },
          { highlight: 'Decisions made slowly', text: 'let results inform plans instead of driving them overnight.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How accurate are pet DNA tests?',
        answer:
          'Depends on the question. Ancestry estimates are only as good as each company\'s reference panel, so the same animal can chart differently across brands, especially for rare breeds. Health-marker detection of specific variants is far more precise than the percentage pie chart, though interpreting risk is still a job for conversation with your vet.',
      },
      {
        question: 'Can a dog DNA test tell me about health risks?',
        answer:
          'It can flag specific known genetic variants associated with certain conditions, which is genuinely useful information. It cannot tell you your dog will develop those conditions, because most diseases involve environment and many genes, and it cannot diagnose anything currently happening. Results work best as monitoring plans built with your veterinarian.',
      },
      {
        question: 'Do cat DNA tests work the same way as dog tests?',
        answer:
          'Broadly, yes: cheek swab, reference panel, ancestry estimate, and a shorter list of known feline health markers. Cat panels are generally smaller, partly because less feline genetic research has been commercialized. The same rules hold, though; estimates are estimates, and flagged markers belong in a conversation with your vet.',
      },
      {
        question: 'Can a DNA test tell me how big my mixed-breed puppy will get?',
        answer:
          'It offers an estimate, and for young rescues with no known parents that estimate is genuinely useful for planning food and gear. A hands-on assessment at a checkup, based on age, weight curve, and frame, tends to be at least as reliable. Use both together rather than betting the crate size on either alone.',
      },
      {
        question: 'Should I show my vet my dog\'s DNA results?',
        answer:
          'Yes, ideally the full report at the next annual exam. Some markers, including medication-sensitivity flags, can shape future treatment and anesthesia planning, and others turn into simple monitoring schedules. Your veterinarian can also tell you which findings sound scarier than they are, which is half the value.',
      },
    ],
    heroImageUrl: '/images/health_woman_cat.jpg',
    heroImageAlt: 'Veterinarian discussing a tabby cat\'s health with its owner',
  },
};
