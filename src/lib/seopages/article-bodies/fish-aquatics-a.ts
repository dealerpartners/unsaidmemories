// Fish & Aquatics family articles (part A) for Pawzsly U — the category
// root plus the aquatics department and its accessories, cleaning,
// aquariums, parts, and decor aisles. Original blog bodies written to
// the WRITING-SPEC.md contract: on-topic, blog voice, no hard selling.
import type { ArticleBody } from './types';

export const FISH_A_ARTICLES: Record<string, ArticleBody> = {
  // =========================================================================
  // FISH AND AQUATICS (category root) — the ecosystem you steer
  // =========================================================================
  'fish-and-aquatics': {
    heroTitle: 'Your Aquarium Is a Small Ecosystem You Learn to Steer',
    heroSubheadline:
      'A healthy tank runs on invisible bacteria, patient stocking, and a light weekly hand. Learn the nitrogen cycle in plain words and the first-month routine that sets the ecosystem.',
    metaDescription:
      'Your aquarium is a living ecosystem. Learn the nitrogen cycle in plain words, why stocking slowly matters, and the first-month routine that keeps it steady.',
    introSummary:
      "Cloudy water two weeks into a new tank is not failure; it is chemistry finding its feet. An aquarium is a small ecosystem you steer rather than a bowl of water you decorate, and the steering is mostly invisible work done by bacteria you will never see. This article walks through the nitrogen cycle in plain words, explains why patient stocking saves fish, and lays out a first-month routine that turns a wobbly start into a tank that hums.",
    sections: [
      {
        id: 'nitrogen-cycle-plain-words',
        title: 'The Nitrogen Cycle in Plain Words',
        content:
          "Fish breathe and excrete through their gills, and both processes leak ammonia into the water. Left alone, ammonia burns gills and kills quickly, which is why new tanks fail. The rescue crew is bacterial: one group of bacteria eats ammonia and hands off nitrite, a second group eats nitrite and hands off nitrate. Nitrate is far gentler, and you remove it with partial water changes while live plants nibble at it. Your whole job as an aquarist is keeping those two bacterial crews fed, housed, and never suddenly homeless.",
        callout: {
          type: 'pro-tip',
          title: 'Your filter is the bacteria house',
          text: 'Most of the bacteria doing this work live in your filter media, not the water. That single fact explains half the care rules in fishkeeping, from gentle rinsing to slow stocking.',
        },
        tips: [
          'Test for ammonia weekly; it should read zero in a settled tank.',
          'Nitrite spikes are normal mid-cycle and toxic even at low readings.',
          'Nitrate climbing tells you the cycle is finished and working.',
          'Feed lightly while the ecosystem is young; less input means less ammonia.',
        ],
      },
      {
        id: 'cycling-before-fish',
        title: 'Cycling the Tank Before Any Fish',
        content:
          "Cycling means growing those bacterial crews before any fish depend on them. You start the tank running, feed the empty tank a pinch of food each day or dose bottled ammonia, and wait while tests trace the story: ammonia rises, then nitrite climbs and crashes, then nitrate appears. The whole passage usually takes several weeks, and the calendar lies, so the test kit makes the call. A tank is cycled when ammonia and nitrite read zero and nitrate is present. As you compare starter kits and bottled bacteria options, treat them as accelerants rather than substitutes for the waiting.",
        tips: [
          'Run the filter and heater for the whole cycling period, no shortcuts.',
          'Dose a pinch of food daily as an ammonia source if you prefer natural.',
          'Write every test reading down; the trend matters more than any single number.',
        ],
      },
      {
        id: 'stocking-patience',
        title: 'Stocking Slowly So Bacteria Keep Up',
        content:
          "Every fish you add is a raise in ammonia production, and the bacterial crews need time to multiply to match it. Adding a whole community at once is how a cycled tank uncycles itself: the bacteria sized for three fish suddenly face twelve. The patient rhythm is a small group, a week or two of quiet testing, then the next small group. A quarantine tank for new arrivals is the professional habit, since it protects both the newcomer and the tank you already love.",
        callout: {
          type: 'warning',
          title: 'Slow down after a loss',
          text: 'When a fish dies, resist replacing it the same day. Test first, find out why, and let the readings settle before adding anyone new. Rushing replacements repeats the loss.',
        },
        tips: [
          'Add fish in small groups with quiet test weeks between arrivals.',
          'Research adult sizes before buying; juveniles mislead every beginner.',
          'Keep a quarantine tank running so new arrivals protect your established fish.',
        ],
      },
      {
        id: 'first-month-routine',
        title: 'The First Month, Week by Week',
        content:
          "Weeks one and two belong to the cycle, so your routine is testing every two or three days and doing nothing dramatic. By weeks three and four, if the readings sit at zero and zero, add your first small group of hardy fish. Feed once a day, an amount gone in about two minutes, and change a modest slice of water weekly to hold nitrate down. Keep a notebook by the tank, because memory flattens trends and paper does not.",
        tips: [
          'Feed an amount the fish finish within two minutes, once daily.',
          'Change a small percentage of water weekly, matched in temperature and treated.',
          'Log every reading and every fish added in one notebook by the tank.',
        ],
      },
      {
        id: 'testing-without-guesswork',
        title: 'Testing the Water Without Guesswork',
        content:
          "Liquid reagent kits cost more than strips and repay it in precision, especially for the ammonia and nitrite readings that decide life and death. Test at the same time of day, before feeding, so numbers stay comparable. Read pH as a stability question rather than a target: a constant 7.6 is kinder than numbers bouncing between 7.0 and 7.8. As you compare test kits for your shelf, the same rule governs anything you are browsing: buy for the readings you will actually take weekly.",
        tips: [
          'Prefer liquid reagent kits for ammonia and nitrite; strips drift with humidity.',
          'Test before feeding, at the same hour, so readings stay comparable.',
          'Chase stability in pH, not a perfect number; fish dislike swings more.',
        ],
      },
      {
        id: 'reading-tank-signals',
        title: 'Reading What the Tank Tells You',
        content:
          "Fish and water both announce trouble early, if you know the dialect. Repeated gasping at the surface usually points at water quality before anything else, and cloudy water after adding fish usually means the bacterial crews are behind. The table below pairs the signals new aquarists meet most often with their usual cause and the honest first move. Treat it as a translation card, not a diagnosis, and let your test kit confirm what behavior suggests.",
        tableData: {
          headers: ['Signal', 'Usual cause', 'Honest first move'],
          rows: [
            ['Cloudy water after new fish', 'Bacteria catching up to a bigger bioload', 'Test daily, hold feeding, wait it out'],
            ['Ammonia above zero', 'Overfeeding or stock added too fast', 'Partial change now, feed less this week'],
            ['Nitrate climbing quickly', 'Changes too small or too spaced out', 'Step up the size or frequency of changes'],
            ['Fish gasping at the surface', 'Poor gas exchange or water quality', 'Test immediately, agitate the surface, change water'],
            ['Sudden appetite loss', 'Stress, water shift, or aggression', 'Test, watch behavior, count the bullies'],
          ],
        },
        tips: [
          'Test before you react; numbers beat hunches every single time.',
          'Note the date next to every odd signal in your tank notebook.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'shield',
        title: 'Steer the cycle',
        items: [
          { highlight: 'Ammonia is the enemy', text: 'bacteria convert it through nitrite into gentle nitrate.' },
          { highlight: 'Zero and zero', text: 'ammonia and nitrite readings before any fish join the tank.' },
          { highlight: 'The filter houses crews', text: 'most bacteria live in media, so rinse it gently.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Stock with patience',
        items: [
          { highlight: 'Small groups first', text: 'then quiet test weeks before the next arrivals.' },
          { highlight: 'Adult sizes rule', text: 'research grown fish, not the juveniles in the bag.' },
          { highlight: 'Quarantine protects everyone', text: 'new arrivals rest apart from your established community.' },
        ],
      },
      {
        icon: 'check',
        title: 'Run the month',
        items: [
          { highlight: 'Test, do not guess', text: 'numbers decide when fish can safely join the tank.' },
          { highlight: 'Feed lightly at first', text: 'every uneaten pellet becomes ammonia in the water.' },
          { highlight: 'Notebooks beat memory', text: 'trends on paper reveal what your eyes miss.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How long does a new aquarium take to cycle?',
        answer:
          'Plan on several weeks rather than days, because the bacteria that finish the job grow at their own pace. The calendar is not the judge; the test kit is. When ammonia and nitrite both read zero and nitrate shows up and rises, the cycle is complete and the first careful fish can go in.',
      },
      {
        question: 'How many fish can I add to a new tank at once?',
        answer:
          'A small group of hardy fish, fewer than you want, is the honest ceiling for a first stocking. Each new fish raises the ammonia load, and the bacteria multiply to match it only with time. Wait a week or two, keep testing, then add the next small group. Patience in this one month pays off for years.',
      },
      {
        question: 'What should ammonia and nitrite read in a healthy tank?',
        answer:
          'Both should read zero, every time, in a settled aquarium. Ammonia and nitrite are the toxic middle steps of the nitrogen cycle, and detectable levels mean the bacterial crews are outnumbered. Nitrate, the end product, should stay low and rising slowly between water changes. Zero, zero, and gentle nitrate is the rhythm you want.',
      },
      {
        question: 'How often should I test the water in the first month?',
        answer:
          'Every two or three days through the cycling weeks, since readings move fast while bacteria establish. After the first fish go in, keep the cadence for another two weeks, then relax into weekly testing once the pattern settles. Any odd behavior from your fish earns an immediate test, whatever the calendar says.',
      },
      {
        question: 'Do live plants help a new aquarium cycle?',
        answer:
          'They help modestly. Growing plants take up some nitrate and give bacteria more surfaces to colonize, but they do not replace the waiting or the testing. Fast-growing stem plants contribute more than slow ones. Think of plants as a supporting cast for the cycle, and stock them for the fish you plan to keep.',
      },
    ],
  },

  // =========================================================================
  // AQUATICS (department root) — the aisle map
  // =========================================================================
  'fish-and-aquatics/aquatics': {
    heroTitle: "The Aquatics Aisle, Mapped to Your Tank's Ecosystem",
    heroSubheadline:
      "Every item in the aquatics department has one job inside your tank's ecosystem: shaping water, cleaning water, feeding mouths, or answering trouble. Here is the map.",
    metaDescription:
      "Walk the aquatics department with a plan: what heaters, filters, test kits, foods, and water treatments each do in your tank's ecosystem, and how to shop them.",
    introSummary:
      "Have you ever stood in the aquatics aisle and wondered which boxes your tank actually needs? The department sorts itself once you stop browsing products and start browsing jobs. Everything on the shelf answers one of four calls: shape the environment, clean the system, feed the mouths, or answer trouble when it arrives. This article maps each cluster to its ecosystem role, so the next cart you build serves your water rather than your impulse.",
    sections: [
      {
        id: 'environment-gear',
        title: 'Environment Gear Shapes the Water',
        content:
          "Heaters, filters, lights, and substrate are not accessories to the ecosystem; they are its skeleton. A heater holds a tropical tank steady where room temperature wanders, a filter houses most of your bacteria while polishing the water, lighting sets both plant growth and your viewing pleasure, and substrate gives roots and beneficial biology a place to live. Size each one to your actual tank volume rather than eyeballing it, because undersized heating and filtration are the two quiet failures behind most struggling setups.",
        callout: {
          type: 'pro-tip',
          title: 'Headroom beats exact match',
          text: 'A filter rated slightly above your volume handles stock growth and messy species without working at its ceiling. Sizing heaters, though, wants precision, since oversize swings the temperature.',
        },
        tips: [
          'Match heater and filter ratings to your tank volume, with a little headroom.',
          'Tropical fish generally need a heater; cool-water species may not.',
          'Pick substrate for the fish and plants you actually plan to keep.',
        ],
      },
      {
        id: 'maintenance-tools',
        title: 'Maintenance Tools Clean What You Cannot',
        content:
          "Siphons, algae scrapers, test kits, and a dedicated bucket form the workbench of the hobby, and they earn their keep every single week. Water changes are the heartbeat of the ecosystem, diluting nitrate the bacteria leave behind, and the tools simply make that rhythm quick and tidy. The accessories article in this family digs into choosing each tool; here the point is the role. As you compare maintenance gear, weigh the items you will reach for weekly above anything clever.",
        tips: [
          'Build the weekly kit first: siphon, scraper, tests, and a fish-only bucket.',
          'A test kit is maintenance gear, not a novelty; readings drive every change.',
          'Choose tools sized to your tank depth and your own reach.',
        ],
      },
      {
        id: 'feeding-supplies',
        title: 'Feeding Supplies Feed the System',
        content:
          "Food is the one input that becomes everything else: growth, color, energy, and, uneaten, straight ammonia. Choose diets for the mouths you actually keep, since surface feeders, bottom feeders, and grazers eat from different levels and prefer different formats. Frozen and freeze-dried options round out nutrition, and automatic feeders cover vacations when portioned carefully. Whatever the format, the feeding habit matters more than the brand on the front: small meals, finished fast, beat generous dumping every time.",
        tips: [
          'Match food format to feeding level: flakes up top, pellets and wafers below.',
          'Feed portions that vanish within a couple of minutes, once or twice daily.',
          'Test an automatic feeder for portion accuracy before you leave on vacation.',
        ],
      },
      {
        id: 'health-aisle',
        title: 'The Health Aisle Answers Trouble',
        content:
          "Dechlorinator is the quiet hero of this aisle, making tap water safe by neutralizing chlorine and chloramine before either touches your bacteria or your fish. Bacterial starters can seed a new cycle, aquarium salt suits some species and harms others, and medications are real medicine with real instructions. Read every label twice and dose exactly. When illness shows up as lesions, bloating, or strange swimming, check with a veterinarian comfortable with fish before reaching for a bottle and guessing.",
        callout: {
          type: 'vet-note',
          title: 'Diagnosis before dosing',
          text: 'Symptoms overlap constantly in fishkeeping: the same clamped fins can follow stress, poor water, or infection. An aquatic-savvy veterinarian can tell them apart, and a water test comes before either.',
        },
        tips: [
          'Condition every drop of tap water; chloramine harms bacteria and fish alike.',
          'Confirm any salt or medication suits your exact species before dosing.',
          'Test water first when fish act off; chemistry explains most odd behavior.',
        ],
      },
      {
        id: 'gear-to-tank-species',
        title: 'Matching Gear to Volume and Species',
        content:
          "A twenty-gallon community of tetras and a forty-gallon cichlid territory are different shopping lists wearing the same label. Filters want turnover suited to the bioload, heaters scale with volume, lighting follows plants, and decor follows behavior: caves for claimants, open water for schools, soft cover for shy fish. Shop the species first and the equipment second, and the aisle stops being a wall of boxes. The same check works for anything you are considering for a tank you already own.",
        tips: [
          'Write your intended species list before shopping any equipment aisle.',
          'Size filtration to the messiest adult fish you plan to keep.',
          'Let behavior drive decor: territories, schools, and hiding cover differ.',
        ],
      },
      {
        id: 'aisle-map-table',
        title: 'The Aisle Map at a Glance',
        content:
          "Four clusters, four jobs, one ecosystem. The table below compresses the department into the map worth keeping in your head while you shop. Each row is a buying priority ranked by how soon a new tank needs it, from day-one chemistry to the someday shelf of nice-to-haves.",
        tableData: {
          headers: ['Cluster', 'Job in the ecosystem', 'Buy it when'],
          rows: [
            ['Environment', 'Sets temperature, flow, light, and surfaces', 'Day one, sized to your tank'],
            ['Maintenance', 'Dilutes waste and keeps glass and gravel honest', 'Day one, before the first fish'],
            ['Feeding', 'Fuels growth without flooding the tank with waste', 'With your first fish, matched to species'],
            ['Health', 'Treats water and answers trouble when it comes', 'Dechlorinator day one; the rest as needed'],
          ],
        },
        tips: [
          'Buy environment and maintenance basics before any fish ride home.',
          'Expand the health shelf gradually as your experience and stock grow.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'sparkles',
        title: 'Map the aisle',
        items: [
          { highlight: 'Four jobs exist', text: 'environment, maintenance, feeding, and health cover the whole department.' },
          { highlight: 'Jobs before boxes', text: 'shop the role your ecosystem needs, not the packaging.' },
          { highlight: 'Species drive lists', text: 'write your fish plan before any equipment hits the cart.' },
        ],
      },
      {
        icon: 'check',
        title: 'Cover the basics',
        items: [
          { highlight: 'Dechlorinator day one', text: 'every drop of tap water gets treated, no exceptions.' },
          { highlight: 'Size to real volume', text: 'undersized heaters and filters fail quietly over months.' },
          { highlight: 'Match food to mouths', text: 'feeding level decides format more than any label does.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Answer trouble calmly',
        items: [
          { highlight: 'Test before treating', text: 'water chemistry explains most odd fish behavior first.' },
          { highlight: 'Labels read twice', text: 'medications and salt demand exact doses for exact species.' },
          { highlight: 'Vets see fish', text: 'an aquatic-savvy veterinarian diagnoses what symptoms alone cannot.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Do I need a heater in my aquarium?',
        answer:
          'Tropical species need one, because they depend on steady warm water that room temperature rarely delivers. Cool-water fish like goldfish often do fine without, provided the room stays temperate and steady. Check the temperature range your species actually prefers, then decide; the heater is matched to the fish, never the other way round.',
      },
      {
        question: 'What does a water dechlorinator actually do?',
        answer:
          'It neutralizes chlorine and chloramine that treatment plants add, rendering tap water safe for fish and for the bacteria running your filter. Without it, a simple water change can damage the very biology keeping your tank alive. Dose to the volume of new water you add, and let temperature match the tank before pouring.',
      },
      {
        question: 'Do bacterial starter bottles replace cycling?',
        answer:
          'They can shorten the road, but none of them replaces testing. A bottle seeds live bacteria into a young filter, which helps the ammonia-to-nitrate pipeline establish faster. You still verify with test readings before fish go in. Treat starters as accelerators on the same journey, and the same skepticism applies to any bottle claiming instant results.',
      },
      {
        question: 'Which maintenance tools should I buy first?',
        answer:
          'Start with the weekly rhythm: a siphon for water changes, a scraper for the glass, a liquid test kit for ammonia, nitrite, and nitrate, and a bucket used for nothing but the tank. Those four cover the jobs that decide water quality. Everything else on the maintenance shelf is comfort, not survival.',
      },
      {
        question: 'How do I pick food for a community tank?',
        answer:
          'Shop by feeding level. Surface feeders take flakes and floating pellets, mid-water swimmers take slow-sinking granules, and bottom dwellers need sinking wafers or tablets that reach them before others finish. A rotation through two or three formats covers most communities, and small portions twice daily keep waste low.',
      },
    ],
  },

  // =========================================================================
  // ACCESSORIES — the maintenance drawer
  // =========================================================================
  'fish-and-aquatics/aquatics/accessories': {
    heroTitle: 'Aquarium Accessories That Earn Their Shelf Space',
    heroSubheadline:
      'Nets, siphons, scrapers, and tweezers are the small tools that keep big problems from forming. Here is which ones pull their weight.',
    metaDescription:
      'Nets, siphons, algae scrapers, planting tweezers, and the other aquarium accessories that earn shelf space, with honest notes on which tools you can skip.',
    introSummary:
      "Beginners overspend on decoration and underspend on the dull drawer of tools, then wonder why maintenance feels like a wrestling match. The right small accessories disappear into the routine: a net that fits the fish, a siphon that empties without drama, a scraper that clears glass in one pass, tweezers that plant without soaked sleeves. This article walks that drawer item by item and says plainly which tools earn the shelf space and which stay in the packaging.",
    sections: [
      {
        id: 'nets-sized-to-job',
        title: 'Nets Sized to the Job',
        content:
          "A net too small turns every catch into a chase, and a chase is stress you inflicted with a bad tool choice. Soft, fine mesh treats fins gently, a deep bag cradles better than a flat paddle shape, and a handle long enough for your tank depth keeps your sleeves dry. Keep two nets for the classic two-hand technique, herding the fish with one and receiving with the other. As you compare nets, judge the mesh against the smallest fish you keep.",
        tips: [
          'Choose fine, soft mesh; coarse nets snag delicate fins and scales.',
          'A deeper bag holds fish calmer than a flat paddle shape.',
          'Keep two nets so catching becomes herding instead of chasing.',
        ],
      },
      {
        id: 'siphons-and-vacuums',
        title: 'Siphons and Gravel Vacuums',
        content:
          "The siphon is the workhorse of the drawer: start it, and gravity pulls old water out while the vacuum head lifts waste from the substrate. Hose diameter trades draining speed against control, with thicker hose moving more water faster than finesse wants. A starter bulb or valve saves the mouth-start nobody enjoys, and models that clip to a sink make disposal neat. How often to run it belongs to the water-change rhythm, which the aquarium cleaning article in this family covers in full.",
        callout: {
          type: 'pro-tip',
          title: 'Start it cleanly',
          text: 'A squeeze bulb or clip valve starts the siphon without a mouthful of tank water. Every keeper who has mouth-started a hose once becomes an immediate convert to the bulb.',
        },
        tips: [
          'Pick hose diameter for control; monster flow wrecks planted foregrounds.',
          'A starter bulb or pinch valve keeps starting sanitary and simple.',
          'Match tube width to substrate size so gravel lifts without vanishing.',
        ],
      },
      {
        id: 'algae-scrapers',
        title: 'Algae Scrapers by Surface',
        content:
          "Glass forgives blades; acrylic does not, scratching at the mere mention of one, so the surface decides the scraper. Long handles reach a deep tank without shoulder-deep immersion, magnetic scrapers clean panes hands-off and make a quick daily pass realistic, and pads rated safe for acrylic handle the softer tanks. Keep blades fresh, because a dull edge spreads algae films instead of lifting them. Check which material your tank is before anything sharp gets near it.",
        tips: [
          'Confirm glass or acrylic before any blade touches the pane.',
          'Replace scraper blades on schedule; dull edges smear rather than lift.',
          'A magnetic scraper turns glass wiping into a ten-second daily habit.',
        ],
      },
      {
        id: 'planting-tweezers',
        title: 'Planting Tweezers and Long Scissors',
        content:
          "Planted tanks reward two long tools: tweezers that grip stems at the substrate and scissors that trim without uprooting half the row. Length keeps hands out of the water, which protects both your sleeves and the tank from whatever your skin carried. Straight tips suit planting, curved tips suit trimming close to the carpet, and spring-loaded styles spare your grip during long sessions. For a heavily planted aquarium, the pair stops being a luxury somewhere around the third replanting.",
        tips: [
          'Choose tool length by tank depth; knuckle-deep water beats shoulder-deep.',
          'Curved scissors trim carpets cleanly where straight blades shade your view.',
          'Dry planting tools fully after use so they last for years.',
        ],
      },
      {
        id: 'the-honest-skip-list',
        title: 'The Honest Skip List',
        content:
          "Some tools solve problems you will never have, and a short honesty session saves both shelf space and money. The table pairs the common drawer items with the moment they earn a place, so a small tank can skip the professional bench. As you compare tool sets, buy the pieces your weekly routine will actually touch, and let the rest wait for a genuine need. Nothing here is useless; plenty of it is simply early.",
        tableData: {
          headers: ['Tool', 'Earns its place when', 'Safe to delay when'],
          rows: [
            ['Net', 'Any fish will ever need moving or catching', 'You keep only snails and shrimp'],
            ['Siphon', 'Day one, since water changes never stop', 'Never; this one is core kit'],
            ['Algae scraper', 'Glass or acrylic grows any film at all', 'The tank lives in low light'],
            ['Magnetic scraper', 'Panes stay clean with a daily ten-second pass', 'A long handle already covers it'],
            ['Planting tweezers', 'Live stem plants outnumber the rocks', 'Silk plants and bare decor only'],
          ],
        },
        tips: [
          'Buy the siphon first; every other tool waits on real need.',
          'Skip magnetic scrapers until you know your algae pattern.',
        ],
      },
      {
        id: 'tool-hygiene-storage',
        title: 'Tool Hygiene and Dry Storage',
        content:
          "Fish tools stay fish-only, full stop. The bucket that drains the tank never carries mop water, the siphon never touches a kitchen sink of dishes, and soap never touches anything that returns to the water, because residue harms the slime coat and the bacteria alike. Rinse tools in used tank water, dry them on a hook, and store the kit in one lidded bin so nothing wanders off to other household jobs. A dedicated kit is cheaper than a crashed cycle.",
        callout: {
          type: 'warning',
          title: 'Soap is the saboteur',
          text: 'Even a trace of detergent residue on a net or siphon travels straight into the tank. If anything fish-related gets washed by accident, rinse it long and let it dry fully before it returns.',
        },
        tips: [
          'Mark the fish bucket boldly so household helpers never borrow it.',
          'Hang siphons and nets to dry fully; damp tools grow odors.',
          'Keep the whole kit in one bin so pieces never migrate.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Buy the workhorses',
        items: [
          { highlight: 'Siphon comes first', text: 'water changes are the chore no tank outgrows.' },
          { highlight: 'Net sized kindly', text: 'soft deep bags catch fish without the chase.' },
          { highlight: 'Scraper fits surface', text: 'glass takes blades, while acrylic wants soft pads.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Protect the system',
        items: [
          { highlight: 'Fish tools stay fish-only', text: 'no soap, no mop buckets, no shared household duties.' },
          { highlight: 'Residue travels fast', text: 'detergent traces reach the water and harm slime coats.' },
          { highlight: 'Dry storage matters', text: 'hung tools last years and stay ready any Saturday.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Trim the drawer',
        items: [
          { highlight: 'Buy for real needs', text: 'the weekly routine names which tools deserve space.' },
          { highlight: 'Tweezers earn keep', text: 'planted tanks repay precision at every replanting session.' },
          { highlight: 'Delay clever gadgets', text: 'simple tools maintained well beat clever ones forgotten.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Do I need a net for my aquarium?',
        answer:
          'Almost always, yes. Nets move fish for tank maintenance, quarantine transfers, and the occasional rescue behind a filter intake. Choose one sized so your largest fish fits the bag without bending, with soft mesh for delicate fins. Keep a second small net for herding, and catching becomes a calm two-minute job instead of a soaked afternoon.',
      },
      {
        question: 'Can I use a magnetic algae scraper on acrylic?',
        answer:
          'Only if the scraper is specifically rated for acrylic, and never with a metal blade. Acrylic scratches far more easily than glass, and one wrong pass leaves a permanent streak across your viewing pane. Use acrylic-safe pads instead, and lift the magnet off the glass rather than dragging it over trapped grains of sand.',
      },
      {
        question: 'Are planting tweezers worth it for a planted tank?',
        answer:
          'For anything beyond a couple of stems, yes. Fingers are clumsy at substrate depth, uproot neighbors, and leave trenches where you pressed. Long tweezers set each plant precisely with almost no disturbance, which is why aquascapers treat them as basic equipment. Add long scissors for trimming, and routine maintenance stops disturbing the whole layout.',
      },
      {
        question: 'How do I keep aquarium tools clean without soap?',
        answer:
          'Rinse them in tank water you just siphoned out, since that water is already balanced and harmless. Dry everything on a hook between uses, and keep the collection in a dedicated bin away from household cleaning supplies. The one rule with no exceptions: nothing that has touched detergent or chemicals ever goes back into the tank.',
      },
      {
        question: 'What size siphon should I get for my tank?',
        answer:
          'Match the tube to your substrate and the hose to your patience. A wider tube and thicker hose drain faster but demand quicker hands, while narrower setups give you gentle control in planted or shrimp-heavy tanks. For most home aquariums, a mid-width gravel vacuum with a starter bulb hits the comfortable middle, and length should reach floor to tank rim.',
      },
    ],
  },

  // =========================================================================
  // AQUARIUM CLEANING — the water-change rhythm
  // =========================================================================
  'fish-and-aquatics/aquatics/aquarium-cleaning': {
    heroTitle: 'The Water Change Rhythm That Keeps Tanks Healthy',
    heroSubheadline:
      'Most tanks need modest, regular maintenance, not marathon cleaning days. Learn the rhythm: vacuum, scrub, rinse, and leave the ecosystem standing.',
    metaDescription:
      'Gravel vacuuming, glass scrubbing, and filter rinsing in tank water: the cleaning rhythm aquariums actually need, and why a full teardown does more harm.',
    introSummary:
      "The classic aquarium disaster story starts with admirable intentions: an owner decides the tank looks dingy, empties it completely, scrubs everything sparkling, and refills it fresh. Within weeks, fish fade and the water turns hostile, because the cleaning erased the bacterial ecosystem that held the toxicity down. Real aquarium cleaning is smaller, calmer, and endlessly repeatable. This article lays out the rhythm: partial water changes, gravel vacuuming, glass scrubbing, filter media rinsed gently in tank water, and the discipline of never starting over.",
    sections: [
      {
        id: 'partial-changes',
        title: 'Why Partial Water Changes Work',
        content:
          "A partial change is dilution, and dilution is the gentlest tool in fishkeeping. Replacing a slice of the water lowers nitrate, replaces trace elements, and resets dissolved waste, all while leaving the bacterial population and the fish's world standing. A common rhythm is somewhere between ten and twenty-five percent of the volume every week or two, tuned by your test readings rather than the calendar. Consistency beats intensity: small and steady keeps parameters calm, while rare dramatic swings stress everything living.",
        callout: {
          type: 'pro-tip',
          title: 'The notebook habit',
          text: 'Log the date, the volume changed, and the nitrate reading every session. After a month the pattern tells you your exact rhythm, and guessing ends.',
        },
        tips: [
          'Change a modest slice weekly, sized by your nitrate readings.',
          'Match new water temperature and treat every drop before pouring.',
          'Pour gently onto a hand or plate to avoid uprooting.',
        ],
      },
      {
        id: 'gravel-vacuuming',
        title: 'Gravel Vacuuming Without Destroying Biology',
        content:
          "Waste settles into substrate, and the siphon's vacuum head lifts it out with the old water. Push the tube into gravel and let the grains tumble clean in the flow; over sand, hover just above the surface instead, since sand plumes up the hose. You are not sterilizing the floor, just clearing the mulm that accumulates, so a different patch each visit is fine and planted roots stay safe. The goal is waste removal, not a spotless moonscape.",
        tips: [
          'Plunge the tube into gravel, hover it over sand.',
          'Rotate which areas get vacuumed so plant roots stay undisturbed.',
          'Watch the drain color; pale water means that patch is done.',
        ],
      },
      {
        id: 'glass-scrubbing',
        title: 'Glass Scrubbing Before Algae Settles In',
        content:
          "Clean the glass first, before drawing any water out, so the scraper's debris rides the siphon out instead of resettling. A pad or blade clears green films and early diatom dust in a few passes, and the trick is frequency: a quick wipe each week prevents the crust that demands elbow grease. Work top to bottom, mind the silicone seams with blades, and keep an acrylic-safe pad for acrylic tanks. Clear glass is how you actually see your fish.",
        tips: [
          'Scrape before siphoning so loosened debris leaves with the old water.',
          'Steer blades away from silicone seams to avoid nicking the joins.',
          'A weekly ten-second wipe prevents the monthly scrubbing siege.',
        ],
      },
      {
        id: 'filter-rinsing',
        title: 'Rinse Filter Media in Tank Water Only',
        content:
          "Your filter media is a bacterial city, and chlorinated tap water is a bulldozer through it. When flow slows, take the sponges and mechanical media out during a water change and squeeze them clean in the bucket of removed tank water, which lifts trapped sludge while the colony survives. Never run media under the tap, never boil sponges, and never replace every media stage at once; stagger anything you swap so the bacterial population always has somewhere to stand. As you compare replacement media listings, matching your filter's trays and stages matters more than any clever claim.",
        callout: {
          type: 'warning',
          title: 'Tap water kills the crew',
          text: 'Chlorine and chloramine in untreated tap water can devastate your filter bacteria in a single rinse. Only removed tank water ever touches media. If a filter sits unplugged for hours, keep it wet and feed lightly while readings settle.',
        },
        tips: [
          'Squeeze sponges in removed tank water until flow returns to normal.',
          'Stagger media replacement so bacteria always retain a foothold.',
          'If a filter stops for hours, keep media wet and restart gently.',
        ],
      },
      {
        id: 'why-teardown-backfires',
        title: 'Why a Full Teardown Backfires',
        content:
          "Stripping a tank to blank glass resets the ecosystem to day zero, and every reassembled tank pays new-tank prices again: ammonia spikes, stressed fish, weeks of careful feeding. The ecosystem you spent months growing lives in the filter, the substrate, and the biofilm on every surface, and soap or a dry afternoon ends it. Established tanks run for years on partial changes alone. Reserve anything close to a teardown for genuine emergencies like a cracked pane or a relocation, and even then carry the old media wet.",
        tips: [
          'Handle serious messes with staged partial changes, not a reset.',
          'During moves, transport filter media wet to preserve the colony.',
          'Never let media dry out; the bacterial city dies in hours.',
        ],
      },
      {
        id: 'weekly-rhythm',
        title: 'Building Your Weekly Cleaning Rhythm',
        content:
          "Order of operations turns chores into one calm session. Scrape the glass while everything is still full, so loosened algae rides the siphon out instead of resettling on plants. Siphon the substrate next and drain the slice you owe, then rinse filter media in that removed water if flow has slowed. Refill gently with treated, temperature-matched water, and top off any evaporation with fresh treated water. Log the date, the volume, and the nitrate reading afterward; after a month the notebook names your rhythm better than any rule of thumb can. As you compare siphons and water-change kits, favor whatever shortens the session, because the rhythm you keep beats the gear you admire.",
        tips: [
          'Sequence glass, gravel, filter, refill, then log the session each week.',
          'Let nitrate readings adjust the size and pace of your changes.',
          'Keep one fish-only bucket and one hose for every water change.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'clock',
        title: 'Keep the rhythm',
        items: [
          { highlight: 'Small and steady', text: 'partial changes beat rare dramatic resets every time.' },
          { highlight: 'Test sets volume', text: 'nitrate readings decide the size of each change.' },
          { highlight: 'Weekly beats heroic', text: 'ten calm minutes outweigh one exhausting Saturday per month.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Guard the biology',
        items: [
          { highlight: 'Media meets tank water', text: 'chlorinated rinses can crash a cycled filter overnight.' },
          { highlight: 'Stagger all replacements', text: 'bacteria need standing room while new media settles.' },
          { highlight: 'Never strip the tank', text: 'teardowns restart the toxic phase you already survived.' },
        ],
      },
      {
        icon: 'check',
        title: 'Order the session',
        items: [
          { highlight: 'Glass before siphon', text: 'scraped debris rides out with the old water.' },
          { highlight: 'Vacuum in rotation', text: 'alternating zones protect plant roots and resting bacteria.' },
          { highlight: 'Pour the refill gently', text: 'temperature-matched and treated, poured onto a shielding hand.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How often should I change water in my aquarium?',
        answer:
          'Most community tanks do well replacing a modest fraction weekly or every other week, but the honest answer comes from your nitrate readings. When nitrate climbs past comfortable levels between changes, increase the volume or the frequency slightly. Steady small changes keep parameters stable, which suits fish far better than occasional large resets.',
      },
      {
        question: 'Why should I never rinse filter media in tap water?',
        answer:
          'Tap water carries chlorine or chloramine meant to kill microbes, and your filter media is exactly the microbe colony you depend on. One enthusiastic rinse under the tap can crash the biological filtration and restart the toxic phase. Squeeze media clean in the tank water you just removed instead; sludge leaves, bacteria stay.',
      },
      {
        question: 'Should I take my fish out to clean the tank?',
        answer:
          'Generally no. Fish tolerate a calm partial change far better than netting and holding, and staying put keeps their territory and routine intact. Work slowly, keep the siphon away from fish, and let new water match temperature and treatment. Reserve removal for medical treatment or a tank relocation, not routine cleaning.',
      },
      {
        question: 'Can I clean my aquarium gravel with plants rooted in it?',
        answer:
          'Yes, with a lighter touch. Hover the vacuum just above the substrate or around root balls, and rotate zones so no patch gets disturbed twice in a row. Debris collects most in open flow lanes, so focus there. Established planted tanks often need less vacuuming anyway, since roots and microbes process a share of the waste.',
      },
      {
        question: 'My tank had sick fish; should I tear it down and start over?',
        answer:
          'Usually not, and often that makes things worse. Removing fish for treatment in a hospital tank protects the community while the display tank keeps its biology. Many pathogens fade without hosts over a patient fallow period, and water hygiene covers the rest. For guidance on specific illness, speak with an aquatic-savvy veterinarian before dismantling months of balance.',
      },
    ],
  },

  // =========================================================================
  // AQUARIUMS — tank size honesty and placement
  // =========================================================================
  'fish-and-aquatics/aquatics/aquariums': {
    heroTitle: 'Aquarium Size Honesty: Bigger Tanks Stay Steadier',
    heroSubheadline:
      'Small tanks are not easier; they are just less forgiving. Here is how to pick an aquarium size honestly, and where in the room it can safely live.',
    metaDescription:
      'Bigger aquariums are steadier ecosystems, the gallon-per-inch rule only goes so far, and placement decides half your battles: sunlight, floor load, and traffic.',
    introSummary:
      "The shop wall always makes the small kit look like the sensible beginner choice, and the advice from experienced keepers says the opposite. A larger volume of water forgives: temperature drifts slower, waste dilutes deeper, and one overfed morning barely registers. Small tanks punish ordinary mistakes within hours. Choosing an aquarium honestly means sizing for the fish you want, the room you have, and the weight your floor can genuinely carry, in that order.",
    sections: [
      {
        id: 'bigger-is-stabler',
        title: 'Why Bigger Tanks Are More Stable',
        content:
          "Water quality moves by dilution, and volume is the dilution. The same pinch of excess food that spikes a small tank into danger barely shifts a large one, because the waste spreads through more gallons. Temperature follows the same physics, since a big body of water warms and cools lazily while a small one tracks the room hour by hour. Stability, not convenience, is what beginners actually need, and volume buys it outright.",
        tips: [
          'Choose the largest tank your space and floor honestly allow.',
          'Expect small tanks to swing with every mistake and window draft.',
          'Count stability as a feature worth paying a little more for.',
        ],
      },
      {
        id: 'gallon-per-inch-limits',
        title: 'Where the Gallon-Per-Inch Rule Fails',
        content:
          "The old rule of one inch of fish per gallon of water survives because it is easy, not because it works. It measures length while ignoring everything that actually matters: activity level, waste output, adult size, shoaling numbers, and territory. A slender, fast schooling fish needs swimming length far beyond its inches, while a sedentary bottom-dweller with the same length barely ripples the bioload. Treat the rule as a floor for stocking conversations, never as permission, and research each species properly.",
        callout: {
          type: 'pro-tip',
          title: 'Read the whole profile',
          text: 'Length is the least interesting number on a species profile. Activity level, shoal size, and territory needs predict tank needs far better than inches ever will.',
        },
        tips: [
          'Research adult sizes; the inch rule fails hardest on juveniles.',
          'Active swimmers need tank length, not just raw gallon counts.',
          'Shoaling species need group numbers, which multiply the real bioload.',
        ],
      },
      {
        id: 'volume-to-fish',
        title: 'Matching Volume to the Fish You Want',
        content:
          "Honest sizing runs backward: pick the species, then the tank that fits their adult lives. The table maps common plans to honest volume bands, with the catch noted for each. Use it to pressure-test a plan before any water flows. When a plan strains the table, believe the strain. When you compare tanks and kits, match the quoted volume against this map before falling for the price.",
        tableData: {
          headers: ['Volume band', 'Suits honestly', 'The catch'],
          rows: [
            ['Under ten gallons', 'A single betta, shrimp, or snails', 'Least forgiving water in the hobby'],
            ['Ten to twenty gallons', 'Small communities of one or two species', 'Shoals stay small, options narrow'],
            ['Twenty to forty gallons', 'Roomy communities, most beginner sweet spots', 'Weight and footprint start to matter'],
            ['Forty and above', 'Larger species, territories, big schools', 'Check floor load before you commit'],
          ],
        },
        tips: [
          'Choose species first, then buy the volume their adults deserve.',
          'Budget swimming length for fast schools, cover for shy species.',
        ],
      },
      {
        id: 'placement-sunlight',
        title: 'Placement Away From Direct Sunlight',
        content:
          "A window sounds like free light and delivers free algae, because direct sun feeds the blooms your scrubber then fights all year. Tanks near windows also ride temperature swings the glass itself creates, brighter by afternoon, cooler at dusk, and fish read every swing as stress. Choose a spot lit mainly by your own aquarium light on its own timer, keep distance from radiators and air vents, and you delete two whole categories of maintenance grief before filling a drop.",
        tips: [
          'Site the tank out of direct sun; your scraper will thank you.',
          'Keep distance from radiators, fireplaces, and air-conditioning vents.',
          'Run the aquarium light on a timer for a steady day rhythm.',
        ],
      },
      {
        id: 'floor-load-stands',
        title: 'Floor Load and the Stand Question',
        content:
          "Water is heavy in the least dramatic way: about eight and a third pounds per gallon, before substrate and glass add their share. A mid-size community tank with everything wet can weigh as much as a large adult standing in one small spot of floor, permanently. Purpose-built stands distribute that load across their footprint and keep the tank level, and level matters more than people expect, since a tilt stresses seams and splashes rims. For large tanks in older homes, confirm the floor can take the load before the water arrives.",
        callout: {
          type: 'warning',
          title: 'Level before water, always',
          text: 'Set the stand, check level in both directions with a bubble tool, and shim now. A tank filled and discovered tilted means draining everything, with seams strained in between. Ten minutes of shimming prevents that afternoon.',
        },
        tips: [
          'Place stands on level, load-spreading floors, never on wobbly furniture.',
          'Verify floor capacity for big tanks, especially in older buildings.',
          'Set and level the stand before a single gallon goes in.',
        ],
      },
      {
        id: 'traffic-and-stress',
        title: 'Quiet Corners Beat High-Traffic Halls',
        content:
          "Fish watch the room more than the room suspects, and constant motion reads as constant threat. A tank beside a slamming door, under booming speakers, or at toddler height in a hallway collects stress the way a window collects algae. Choose a corner with calm foot traffic, where viewing stays easy but daily life passes at a distance. Vibration travels through stands too, so keep speakers and laundry equipment on the other side of the room. Calm placement shows in the fish within days. As you compare stands and tanks, picture each one in the calm corner before deciding.",
        tips: [
          'Keep tanks away from doors, speakers, and constant hallway motion.',
          'Position for viewing comfort, since calm watching is half the hobby.',
          'Choose sight lines from your seating, not just from the doorway.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'award',
        title: 'Size for stability',
        items: [
          { highlight: 'Volume dilutes mistakes', text: 'big tanks shrug off what small tanks spike on.' },
          { highlight: 'Beginners deserve room', text: 'the mid-size band beats the tiny starter kit.' },
          { highlight: 'Adults, not juveniles', text: 'size every plan around the fish they become.' },
        ],
      },
      {
        icon: 'map-pin',
        title: 'Place it once',
        items: [
          { highlight: 'Out of direct sun', text: 'windows trade free light for a year of algae.' },
          { highlight: 'Away from heat vents', text: 'radiators and vents push water into needless swings.' },
          { highlight: 'Calm corners win', text: 'constant motion reads as threat to watchful fish.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Respect the weight',
        items: [
          { highlight: 'Water weighs heavy', text: 'about eight pounds a gallon before substrate adds.' },
          { highlight: 'Stands spread load', text: 'purpose-built bases carry loads that regular furniture cannot.' },
          { highlight: 'Level before filling', text: 'shim the stand while it is still empty.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'What size aquarium is best for a beginner?',
        answer:
          'Larger than instinct suggests. A roomy mid-size tank holds steadier water than a small one, because volume dilutes mistakes, and mistakes are how everyone learns. Many keepers point newcomers at the twenty-to-forty-gallon band as the sweet spot between stability and manageability. Whatever you choose, size it for the adult fish you want, not the juveniles in the bag.',
      },
      {
        question: 'Is one inch of fish per gallon a safe rule?',
        answer:
          'Only as a rough floor, never as a green light. The rule ignores activity, waste output, territory, and shoaling needs, so it fails hardest on active schoolers and oversized juveniles. A slim dashing school outgrows its inches quickly, while a placid bottom fish barely dents the same water. Research each species on its own merits.',
      },
      {
        question: 'How much does a filled aquarium weigh?',
        answer:
          'Count roughly eight and a third pounds for every gallon of water, then add the tank, stand, and substrate, which add a surprising share. A mid-size filled community setup can pass the weight of a refrigerator, concentrated on a small footprint. That math is why purpose-built stands and level floors matter before the first drop goes in.',
      },
      {
        question: 'Can I put my aquarium near a window?',
        answer:
          'You can, but you will pay in algae and temperature swings. Direct sunlight feeds blooms that turn glass green and keeps your scraper employed, while the glass heats by day and cools at dusk. A wall lit by the aquarium\u2019s own light on a timer gives you the viewing without the extra chores.',
      },
      {
        question: 'Where is the worst place to put a fish tank?',
        answer:
          'Hallways with constant traffic, spots beside slamming doors, shelves above speakers, and anywhere direct sun lands through the day. All four read as stress to fish, which shows as dull color and constant hiding. The best placement is a calm corner near an outlet, out of sun, on a level stand sized for the filled weight.',
      },
    ],
  },

  // =========================================================================
  // AQUARIUM PARTS — lids, stands, dividers, replaceable hardware
  // =========================================================================
  'fish-and-aquatics/aquatics/aquarium-parts': {
    heroTitle: 'Lids, Stands, and the Aquarium Parts That Matter',
    heroSubheadline:
      'The right lid, stand, or replacement part keeps a good tank running for years. Learn to match hardware to your exact aquarium model before you buy.',
    metaDescription:
      'Match lids, glass canopies, stands, dividers, and replaceable hardware to your exact aquarium model, and learn why a good lid pays for itself in evaporation.',
    introSummary:
      "Half the secondhand tanks for sale are honest boxes missing their lids, and half the buyers discover why that matters within a week, when the water level drops and a jumper goes exploring. Parts look like afterthoughts until the day one fails. This article covers the hardware that keeps a tank complete: how to match lids, canopies, stands, and dividers to your exact model, and why replacing a hinge beats replacing an aquarium.",
    sections: [
      {
        id: 'matching-parts-model',
        title: 'Matching Parts to Your Tank Model',
        content:
          "Aquarium parts are sized to the tank they were built for, which makes the model the whole shopping brief. Rimmed tanks take hinged lids that clip the frame, rimless tanks take glass canopies that rest on the rim's flat edge, and manufacturers quietly change trim and hinge styles between generations. Note your tank's brand, model, and dimensions before browsing anything, and measure the opening rather than trusting the label on the box. A part that almost fits is a puddle scheduled for later.",
        tips: [
          'Record tank brand, model, and measured opening before parts shopping.',
          'Confirm whether your tank is framed or frameless before lid shopping.',
          'Measure the opening yourself; printed dimensions sometimes miss trims.',
        ],
      },
      {
        id: 'glass-canopies-evaporation',
        title: 'Glass Canopies and the Evaporation Benefit',
        content:
          "A glass canopy sits on the rim and quietly pays rent twice. First, it cuts evaporation dramatically, keeping the water level and your top-offs steady, which matters because evaporating water leaves its minerals behind and slowly hardens the tank. Second, it blocks the escape artists: hatchetfish, killifish, and half the invertebrate aisle are proven jumpers. The trade-offs are real but small, since canopy glass dims light slightly and feeding access means lifting a section. For planted high-light tanks, plan the lighting around the panes.",
        callout: {
          type: 'pro-tip',
          title: 'Top off with plain treated water',
          text: 'Evaporation leaves minerals behind, so top off with plain treated water, never doses of salts or supplements. A canopy means you perform this chore far less often, which is the quiet benefit people forget.',
        },
        tips: [
          'Top off evaporation with plain treated water, not mineral additives.',
          'Confirm any cutout panes fit your filter and heater before buying.',
          'Lift and wipe canopy glass weekly so light reaches the tank.',
        ],
      },
      {
        id: 'stands-carry-weight',
        title: 'Stands Built to Carry the Weight',
        content:
          "A stand is not furniture that happens to fit under a tank; it is the load path for several hundred pounds of water. Purpose-built aquarium stands carry their rated footprint and keep the base level, which protects seams from uneven stress. The tank placement article in this family covers the floor and level checks in depth, so here the buying point is simple: match the stand to the tank's exact footprint, not to a close guess, and check the rated capacity against your filled weight.",
        tips: [
          'Match stands to the exact footprint, with rated capacity to spare.',
          'Prefer closed-back stands; they resist racking better than open legs.',
          'Check door and drawer clearances against hoses and cords below.',
        ],
      },
      {
        id: 'dividers',
        title: 'Dividers for Peace, Fry, and Recovery',
        content:
          "A divider turns one aquarium into two territories without a second filter cycle, which is exactly what you want for a bullying chase, a breeding pair, or fry growing out safely. Water still flows through and shares the biology, while the glass or mesh panel blocks the contact. Match the divider to your tank's inner width and depth, mind the gaps at corners where clever fish squeeze, and give each side its own hiding cover so nobody stares at a wall all day.",
        tips: [
          'Measure inner width, not outer, when sizing any divider panel.',
          'Seal corner gaps; determined fish find every escape route.',
          'Give divided fish cover on both sides to lower staring stress.',
        ],
      },
      {
        id: 'replaceable-hardware',
        title: 'Replaceable Hardware Beats Rebuying Tanks',
        content:
          "Most tanks retire for want of one small replaceable part. Hinges crack after years of lifting, clips vanish into carpet, filter impellers wear noisy, and trim fades brittle in the light. Every one of those has a replacement if you know the model, which makes the parts shelf the quiet economy of the hobby. Before problems cascade into a whole new setup, source the wear items: a hinge kit, spare clips, an impeller matched to your filter's model number. As you browse parts listings, exact model matching is the whole game.",
        tips: [
          'Source worn impellers before the filter fails, not after.',
          'Keep spare hinge kits; they are cheap and endlessly useful.',
          'Order replacement impellers by exact filter model, never by eyeball.',
        ],
      },
      {
        id: 'pre-buy-checklist',
        title: 'The Pre-Buy Checklist for Parts',
        content:
          "Before any part joins a cart, run the same four checks. Model: brand, generation, and printed label, since manufacturers revise quietly. Measurements: your own tape on the actual opening, not the catalog's claim. Material: glass thickness for canopies, plastic grade for trim, since aquariums are unforgiving of near-matches. Return path: confirm the listing accepts returns, because parts are the single most returned category in fishkeeping. Ten minutes of checking saves the drip-and-return weekend. Run the same discipline on every parts listing you compare; near-fit hardware wastes weekends.",
        callout: {
          type: 'warning',
          title: 'The drip test nobody wants',
          text: 'A lid or canopy that sits just slightly wrong fails at the corner you never check. Run a paper towel along every seam after fitting any new part, and watch for damp for a full day before trusting it.',
        },
        tips: [
          "Photograph your tank's label plate; it is the model key.",
          'Confirm return terms before buying any near-match part.',
          'Test-fit new canopies empty, before water makes mistakes expensive.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Match the model',
        items: [
          { highlight: 'Model is the brief', text: 'brand, generation, and measured opening decide every part.' },
          { highlight: 'Rim type rules lids', text: 'rimmed frames and rimless edges take different systems.' },
          { highlight: 'Measure, never trust', text: 'catalog dimensions miss trims that your tape catches.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Lid does quiet work',
        items: [
          { highlight: 'Canopies cut evaporation', text: 'steady water levels mean fewer top-off chores weekly.' },
          { highlight: 'Jumpers meet glass', text: 'hatchetfish and killifish escape through open tops overnight.' },
          { highlight: 'Stands carry loads', text: 'rate them for the filled weight, never the empty.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Repair before replacing',
        items: [
          { highlight: 'Small parts age', text: 'hinges, clips, and impellers fail long before glass.' },
          { highlight: 'Keep model-matched spares', text: 'a spare hinge kit saves a leaking Saturday morning.' },
          { highlight: 'Test fit empty', text: 'dry-run every new canopy before water raises stakes.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How do I find the right lid for my aquarium?',
        answer:
          "Start with the tank's brand and model, usually printed on a label or etched near a corner, then measure the opening yourself with a tape. Rimmed and rimless tanks take different lid systems, and generations of the same model differ. Match all three, brand, generation, and measured opening, and the lid fits the day it arrives.",
      },
      {
        question: 'Do I really need a lid on my tank?',
        answer:
          'Lids block jumpers, slow evaporation, and keep dust and curious cats out of the water, which is why most keepers use one. Open-top rimless tanks look wonderful and work fine with non-jumping species, but they demand frequent top-offs and honest research into who leaps. If your species list includes any known jumper, a canopy stops being optional.',
      },
      {
        question: 'What is the point of a glass canopy?',
        answer:
          "A glass canopy is the lid style that rests on the tank's rim, usually in hinged sections with cutouts for filters and heaters. It slashes evaporation, steadies the water level, and blocks jumping fish, at the small cost of some light and the occasional fingerprint. For most community tanks it is the standard, sensible choice.",
      },
      {
        question: 'Can I use any stand for my aquarium?',
        answer:
          "No, and this is one corner of the hobby where guessing gets expensive. A filled tank concentrates hundreds of pounds on a small footprint, so the stand should be purpose-built or genuinely rated for the weight, with a footprint matching the tank's base. Ordinary furniture bows, racks, and eventually folds. Check the rating before the water, always.",
      },
      {
        question: 'When should I replace a part instead of buying a new tank?',
        answer:
          'Whenever the glass box itself is sound and only the hardware is tired. Cracked hinges, missing clips, worn impellers, and hazy canopy panes are all replaceable, and a tank with new parts serves for decades. Structural issues like a chipped corner near a seam are different; those justify retiring the whole aquarium.',
      },
    ],
  },

  // =========================================================================
  // AQUARIUM DECOR — hides, territory, and safe materials
  // =========================================================================
  'fish-and-aquatics/aquatics/aquarium-decor': {
    heroTitle: 'Aquarium Decor That Gives Fish Places to Hide',
    heroSubheadline:
      'Decoration is not cosmetic; it is territory, shade, and cover. Here is how to choose aquarium decor that lowers stress instead of crowding the tank.',
    metaDescription:
      'Hides cut stress, smooth edges protect betta fins, caves give cichlids territory, and resin decor needs a good soak. Pick aquarium decor that works for fish.',
    introSummary:
      "Watch a fish in a bare tank and you will see pacing, glass-surfing, and the flat exhaustion of an animal with nowhere to be. The same fish given caves, plants, and shade lines settles into confident patrol, visible more and hiding less, because cover paradoxically makes fish braver. Decor is not cosmetic. It is territory, security, and shade, and choosing it well is one of the kindest things you do for the animals in your care.",
    sections: [
      {
        id: 'why-hides-lower-stress',
        title: 'Why Hides Lower Stress',
        content:
          "Cover works because threat and safety are the same calculation to a fish: how far am I from somewhere to disappear. A tank with caves, plant thickets, and overhangs offers that exit everywhere, so the fish relaxes into the open water between them. Bare tanks remove the exits, and the fish reacts by pacing the glass, hiding behind a heater, or wedging into filter corners. Shaded zones matter too, since a dim corner gives respite from bright light. More cover, more visible fish; every experienced keeper notices eventually.",
        tips: [
          'Give every fish a bolt-hole within a few body lengths.',
          'Include dim zones; bright constant light exhausts shy species.',
          'Expect braver fish after adding cover, not shyer ones.',
        ],
      },
      {
        id: 'smooth-edges-bettas',
        title: 'Smooth Edges for Bettas and Fancy Fins',
        content:
          "Bettas and other long-finned fish wear fabric that snags, so texture is a safety question, not a style one. Rough ceramics, coarse resin textures, and sharp plastic plant edges all tear flowing fins, and torn fins heal slowly and leave the fish vulnerable. The classic field test costs nothing: draw a pair of stockings over the piece, and anywhere the fabric catches, a fin will too. Silk plants and smooth ceramics let elaborate fins trail safely.",
        callout: {
          type: 'warning',
          title: 'The stocking test',
          text: 'Stretch a thin stocking over any decor candidate and run it across every surface, especially seams and leaf tips. A snag means a torn fin later. This two-minute habit saves fancy fish from weeks of recovery.',
        },
        tips: [
          'Run the stocking test on every piece headed for fancy-finned fish.',
          'Prefer silk plants over stiff plastic where long fins trail.',
          'Sand or file rough seams on ceramics before they enter water.',
        ],
      },
      {
        id: 'cichlid-territory',
        title: 'Caves and Cichlid Territory Logic',
        content:
          "Territorial cichlids read decor as real estate, and the layout either spreads their aggression or concentrates it. Multiple caves spread across the footprint give rivals separate holdings and broken sight lines, so chasing cools between encounters. One hero cave, by contrast, makes a single tyrant. Stack rockwork sturdily, resting directly on the tank base where possible, since diggers undermine towers that float on substrate. The aquascape becomes the peace treaty you renegotiate with every rearrangement.",
        tips: [
          'Offer more territory marks than there are territory holders.',
          'Break sight lines with rock and wood to cool chases.',
          'Rest heavy rockwork on the tank base, not on sand.',
        ],
      },
      {
        id: 'planted-aesthetics',
        title: 'Planted Looks and Living Cover',
        content:
          "Live plants are decor that feeds the ecosystem: they sip nitrate, oxygenate by day, and grow into cover no plastic piece matches. The trade is care, since lighting, root tabs, and occasional trimming enter the deal, and some fish bulldoze the whole plan. Silk plants deliver the softness and hiding density without the horticulture, which suits low-light tanks and destructive goldfish alike. Choose by honesty about your routine, not by photography, because dead plants decorate nothing. As you compare live and silk plant listings, weigh the look against the routine you honestly keep.",
        tips: [
          'Start with forgiving stem plants before investing in carpets.',
          'Pick silk where fish dig, uproot, or shade everything.',
          'Plan growth: today\u2019s sprig is next season\u2019s jungle.',
        ],
      },
      {
        id: 'resin-safety',
        title: 'Resin Safety and the Pre-Soak',
        content:
          "Resin ornaments are aquarium-safe when made for aquariums, and the keywords are made for. Give new pieces a thorough rinse and a soak in a bucket of treated water before they meet the tank, which releases surface residues and lets strong-smelling pieces off-gas where fish are not. Inspect for seams, air bubbles, and paint that flakes at a fingernail's touch, and retire anything degrading. Decor from the craft store, with metal parts or unknown paints, stays out of water entirely.",
        callout: {
          type: 'pro-tip',
          title: 'The sniff check',
          text: 'A sharp chemical smell from new resin usually fades with a few days of soaking in clean water. An odor that survives a week deserves skepticism, and skeptical pieces stay out of the aquarium.',
        },
        tips: [
          'Soak new resin decor in clean treated water for days first.',
          'Reject pieces with flaking paint, bubbles, or sharp hidden seams.',
          'Keep craft-store ornaments out; only aquarium-made pieces go in.',
        ],
      },
      {
        id: 'layout-territory',
        title: 'Layout That Reads as Territory',
        content:
          "Arrangement decides whether decor reads as cover or as clutter. Cluster pieces into a few strong territories instead of scattering singles, leave continuous swimming lanes along the glass, and press bases deep enough that digging fish cannot topple anything. The table pairs common materials with their honest strengths. As you compare decor listings, picture each piece doing a job here rather than filling a space.",
        tableData: {
          headers: ['Material', 'Honest strength', 'Watch-out'],
          rows: [
            ['Ceramic caves', 'Permanent, smooth, easy to clean', 'Check seams for rough patches'],
            ['Resin ornaments', 'Light, detailed, cheap to replace', 'Soak first; watch paint quality'],
            ['Live plants', 'Cover that sips nitrate and grows', 'Needs light, feeding, and trimming'],
            ['Silk plants', 'Soft finsafe cover with no care', 'Fades over years in bright light'],
            ['Natural wood and stone', 'Authentic territory and tannin shade', 'Some pieces shift water chemistry'],
          ],
        },
        tips: [
          'Press decor bases into substrate so burrowers cannot undermine them.',
          'Keep one clear swim lane open along the main viewing glass.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'heart',
        title: 'Cover calms fish',
        items: [
          { highlight: 'Hides lower stress', text: 'exits everywhere make fish bolder in open water.' },
          { highlight: 'Bare tanks exhaust', text: 'pacing the glass means nowhere feels safe to rest.' },
          { highlight: 'Dim zones matter', text: 'shaded corners give shy species respite from bright light.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Choose safe pieces',
        items: [
          { highlight: 'Stockings test edges', text: 'a snag on nylon predicts a tear on fins.' },
          { highlight: 'Resin gets soaked', text: 'days in clean water before decor meets the tank.' },
          { highlight: 'Craft-store stays out', text: 'only pieces made for aquariums belong inside the tank.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Layout as territory',
        items: [
          { highlight: 'Cluster, never scatter', text: 'strong territories beat lonely single pieces spread thin.' },
          { highlight: 'Keep swim lanes open', text: 'fish need open water as much as safe cover.' },
          { highlight: 'Press bases deep', text: 'digging fish cannot topple what they cannot undermine.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Do fish really need hiding places?',
        answer:
          'Yes, and shy species need them the way they need oxygen. Hides give fish an exit from threats, which lowers the background stress that otherwise shows as hiding, fading color, and poor eating. The paradox beginners learn fast: tanks with more cover produce bolder, more visible fish, while bare tanks produce nervous pacing along the glass.',
      },
      {
        question: 'How do I know if decor is too sharp for a betta?',
        answer:
          "Run the stocking test. Draw a thin nylon stocking across every surface of the piece, including seams and any leaf or fin tips, and note every snag. Anywhere fabric catches, a betta's flowing fin will catch too. Smooth ceramics, silk plants, and well-finished resin pass easily, and a fine nail file fixes small rough spots.",
      },
      {
        question: 'Should I soak resin aquarium decor before using it?',
        answer:
          'A rinse is the minimum and a soak is the wise extra. New resin can carry mold-release residues and a faint chemical smell, and a few days in a bucket of clean, treated water lets both fade before fish share the water. Anything that still smells sharp after soaking stays out of the tank.',
      },
      {
        question: 'Can I put rocks and shells from the beach in my aquarium?',
        answer:
          'Some, after honest vetting, and some never. Shells and limestone raise hardness and pH, which suits certain cichlids and harms soft-water species. The classic vinegar test, a drop fizzing on the stone, flags carbonate pieces that will shift chemistry. Skip anything metallic, crumbly, or unidentified, scrub and dry what you keep, and buy labeled aquarium stone when in doubt.',
      },
      {
        question: 'How much decor is too much for a tank?',
        answer:
          'When swimming lanes close and maintenance becomes gymnastics, you have crossed the line. Fish need open water as much as cover, so keep lanes open along the glass and room for a siphon between territories. A tank three-quarters decorated leaves a quarter to swim; a fully packed one is a beautiful trap.',
      },
    ],
  },
};
