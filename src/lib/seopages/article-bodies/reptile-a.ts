// Reptile family articles (part A) for Pawzsly U — the category root plus
// substrates, cleaning, decor, water dishes, filters and pumps, and food.
// Seven original blog bodies written to the WRITING-SPEC.md contract:
// on-topic, blog voice, at least six sections of authentic prose,
// marketplace-friendly without hard selling.
import type { ArticleBody } from './types';

export const REPTILE_A_ARTICLES: Record<string, ArticleBody> = {
  // =========================================================================
  // REPTILE (category root) — the habitat-first hobby
  // =========================================================================
  reptile: {
    heroTitle: 'Reptile Keeping Starts With the Landscape, Not the Decor',
    heroSubheadline:
      'A reptile lives inside the climate you build, not on top of it. Get the research, the heat, the light, and the water right before you spend a dollar on looks.',
    metaDescription:
      'Reptiles are landscape animals: research the species first, budget heat, light, and water before decor, and prove the enclosure before the animal arrives.',
    introSummary:
      "A dog rearranges your living room to suit itself. A reptile cannot. Whatever climate the room provides is the whole of its world, from the warmth under its belly to the moisture in the air, and it has no way to move somewhere better. That is the quiet premise of this hobby: you are not picking out accessories for an animal, you are building a landscape it lives inside. The order of operations matters, and it starts with research rather than shopping.",
    sections: [
      {
        id: 'landscape-animals',
        title: 'Reptiles Are Landscape Animals',
        content:
          "A cat pushes a pillow off the couch and finds a new one. A lizard has no such leverage. Its enclosure is the landscape itself: the temperature range, the light, the moisture in the air, and the surfaces it can climb or burrow into. Improve the view and the animal is unmoved; improve the climate and its whole life changes. Keepers who internalize this stop asking which decoration looks best and start asking what the animal can feel. Every choice, from bedding to a water bowl, is part of the weather system you run.",
        tips: [
          'Ask what the animal can feel, not what guests can see.',
          'Treat every addition as weather: it changes heat, humidity, or behavior.',
          'A better view does nothing; a better gradient changes everything.',
        ],
      },
      {
        id: 'species-research',
        title: 'Species Research Before Any Shopping',
        content:
          'Every solid setup begins with a care sheet for the exact species, not for reptiles in general. Note the adult length, the temperature gradient it needs, whether it basks in open light or hides from it, the humidity band, and the diet. A juvenile bearded dragon and an adult iguana share an aisle at the shop and almost nothing else. Write the numbers on one page and let that page govern the shopping list, because an enclosure bought by guesswork gets rebuilt within the year. Research is the cheapest part of the hobby and the part that saves the most.',
        callout: {
          type: 'pro-tip',
          title: 'One page governs the list',
          text: "Write adult size, temperatures, humidity, diet, and lifespan on a single sheet before you shop. If a product answers none of those needs, it belongs to a later trip.",
        },
        tips: [
          'Find a care sheet for the exact species, never reptiles in general.',
          'Plan around the adult size, since juveniles grow faster than enclosures.',
          'Compare lifespan expectations honestly; some species outlive the commitment.',
        ],
      },
      {
        id: 'three-systems-budget',
        title: 'The Heat, Light, and Water Budget',
        content:
          'Heat, light, and water are the three recurring bills of reptile keeping, and they come before anything decorative. Heating runs on electricity around the clock, lamps expire on a schedule rather than on your watch, and misting or soaking consumes water week after week. Price those lines first, then see what remains for backgrounds and themes. The animal reads these three systems every single hour; the resin waterfall is scenery. Budgeting this way also protects the animal from the classic failure, where the fun purchases arrive first and the boring essentials get postponed to a paycheck that keeps moving.',
        tips: [
          'Budget electricity, replacement lamps, and water before any decor purchase.',
          'Treat heating and lighting as running costs, not one-time buys.',
          'The essentials list gets funded first; scenery waits for surplus.',
        ],
      },
      {
        id: 'decor-comes-last',
        title: 'Decor Comes Last in the Plan',
        content:
          'This ordering feels backward in the shop and saves money everywhere else. Once the gradient, the light, and the moisture behave, the furniture has a clear job: give the animal places to hide, climb, and drink, in materials you can clean. Hides and branches chosen at this stage fit the plan instead of fighting it, and the enclosure ends up looking intentional rather than crowded. As you compare decor listings later, filter them through one question: does this serve a behavior the species actually has? Anything that fails the question is scenery for you, not furniture for them.',
        tips: [
          'Shop decor after the climate works, never before.',
          'Ask whether each piece serves hiding, climbing, or drinking.',
          'Favor materials you can scrub or soak without ruining them.',
        ],
      },
      {
        id: 'empty-enclosure-week',
        title: 'Run the Enclosure Empty First',
        content:
          'The week before the animal arrives belongs to the enclosure alone. Set everything up, then watch the numbers through full days and nights: the warm area at midday, the cool area during the hottest afternoon, the humidity after each misting. As you compare thermometer and hygrometer listings, favor instruments that report readings you can write down over ones that merely look handsome. Weak spots that look fine on paper show up quickly, a screen top that dumps moisture, a corner that never warms. Fixing them costs nothing but time while the tank is empty, and everything after the animal moves in is troubleshooting under pressure.',
        tips: [
          'Track temperatures and humidity for several days before the animal arrives.',
          'Fix weak spots while the enclosure is empty and stress-free.',
          'Verify day and night cycles separately; both need to hold.',
        ],
      },
      {
        id: 'long-commitment',
        title: 'The Long Commitment Reality',
        content:
          "Lifespans in this family run long. Leopard geckos commonly pass fifteen years, ball pythons can cross twenty or thirty, and a tortoise may simply outlive you, which is a sentence worth reading twice before checkout. Ten years of stable electricity, space for an adult enclosure, and a plan for vacations all belong in the decision. Locate an exotics-savvy veterinarian before you need one, since ordinary clinics sometimes lack reptile experience. A keeper with a contact already saved handles the first shedding problem or hunger strike with a phone call instead of a panicked search.",
        callout: {
          type: 'vet-note',
          title: 'Line up the vet early',
          text: 'Find a veterinarian experienced with reptiles before trouble starts. Annual checks catch husbandry drift early, and a saved contact turns the first odd symptom into a question rather than a crisis.',
        },
        tips: [
          'Research the species lifespan in years, then commit to all of them.',
          'Save an exotics vet contact before the first sign of trouble.',
          'Plan vacations around who feeds and checks temperatures in your absence.',
        ],
      },
      {
        id: 'first-species',
        title: 'Finding an Honest First Species',
        content:
          'The hobby has classic entry points for good reasons. Corn snakes and leopard geckos forgive small mistakes, eat simply, and stay a manageable size. Bearded dragons are more demanding on space and greens but famously calm. What they share is deep, well-documented care history, which means your questions already have tested answers. Resist the impulse to start with the animal that impressed you at an expo; rare species often carry thin documentation and unforgiving margins for error. Boring and documented beats rare and hopeful for a first enclosure.',
        tips: [
          'Begin with a species that has decades of documented husbandry behind it.',
          'Manageable adult size matters more than a striking juvenile appearance.',
          'Skip rare, thin-documented species until your second or third setup.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Research first',
        items: [
          { highlight: 'One care sheet', text: 'with adult size, gradient, humidity, and diet governs every purchase.' },
          { highlight: 'Adult length rules', text: 'juvenile size disappears faster than beginner keepers expect.' },
          { highlight: 'Documented species win', text: 'thin care history makes your first mistakes expensive.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Budget in order',
        items: [
          { highlight: 'Heat, light, water', text: 'are recurring bills that outrank every decorative purchase.' },
          { highlight: 'Lamps are consumables', text: 'they expire on a schedule you should plan for.' },
          { highlight: 'The empty-tank week', text: 'verify the climate holds before the animal arrives.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Commit honestly',
        items: [
          { highlight: 'Lifespans run long', text: 'some species outlive a decade or two comfortably.' },
          { highlight: 'Vet before trouble', text: 'save an exotics-savvy clinic contact during week one.' },
          { highlight: 'Vacation plan early', text: 'someone must feed and check temperatures while away.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Is a reptile a good beginner pet?',
        answer:
          'For patient keepers, yes. A corn snake or leopard gecko tolerates beginner mistakes, eats simply, and asks for routine rather than constant attention. What the hobby demands up front is research and stable temperatures. If you can commit to the climate control and a multi-year lifespan, a reptile fits.',
      },
      {
        question: 'How much does it cost to set up a reptile enclosure?',
        answer:
          'The animal itself is usually the smallest line on the receipt. The enclosure, heating, lighting, thermometers, and controllers form the real cost, and they recur through electricity and replacement lamps. Budget those systems first, then substrate and decor. Whatever the final number, spending it in that order prevents paying twice for a habitat rebuilt.',
      },
      {
        question: 'How long do pet reptiles live?',
        answer:
          'Ranges vary by species, but plan on a serious commitment. Leopard geckos often pass fifteen years, ball pythons twenty or more, bearded dragons around a decade, and tortoises potentially several human generations. Check the expected lifespan for your exact species before bringing it home, because the surprise works far better before checkout than after.',
      },
      {
        question: 'What should I set up before bringing a reptile home?',
        answer:
          'Everything except the animal. Enclosure, heating, lighting, thermostat, thermometers, hygrometer, substrate, hides, and a water dish should run for several days while you verify the temperatures and humidity hold day and night. Only when the numbers stay steady through a full cycle should the animal move in. An empty tank reveals problems cheaply.',
      },
      {
        question: 'Do reptiles recognize their owners?',
        answer:
          'Not the way a dog does, no. Reptiles learn routines and associations: a door opening at feeding time, a hand that means food, a familiar presence that predicts nothing threatening. That earned calm is genuine, even if it is not affection in the mammal sense. Consistent, gentle handling builds it; sudden movements and grabbing undo it.',
      },
    ],
  },

  // =========================================================================
  // REPTILE / BEDDING AND SUBSTRATES — substrate by species
  // =========================================================================
  'reptile/bedding-and-substrates': {
    heroTitle: 'Choosing Reptile Bedding That Matches the Species',
    heroSubheadline:
      'Substrate is not bedding in the mammal sense. It holds humidity, shapes burrowing behavior, and sets your cleaning workload, so the species picks the bag, not the other way around.',
    metaDescription:
      'Reptile substrate by species: the loose-substrate impaction debate, paper-towel startups, bioactive endgames, and the spot-cleaning that sets a bag\u2019s lifespan.',
    introSummary:
      "The first bag most beginners grab is whatever the shop shelf puts at eye level, usually something labeled for reptiles in general. Then the gecko stays bone dry, or the ball python's humidity never climbs, or the bag molds inside a month. Substrate is climate equipment that happens to look like dirt. Picking it by species fixes all three failures at once, and this article walks the pairing, the impaction debate, the paper-towel phase, and the bioactive endgame.",
    sections: [
      {
        id: 'substrate-is-climate',
        title: 'The Substrate Is Part of the Climate',
        content:
          "Substrate does three jobs at once underfoot. It releases moisture into the air, it gives burrowers and diggers something honest to work, and it either traps waste where you can lift it out or hides it where it ferments. An arid species on damp bark develops respiratory trouble; a tropical species on dry sand never reaches the humidity band no matter how often you mist. Match the bag to the animal's native ground first, then argue about appearance. Every listing worth comparing states its moisture behavior plainly, so read for that, not the photograph.",
        tips: [
          'Read a bag for moisture behavior before appearance or price.',
          'Arid species on damp bedding risk respiratory stress.',
          'Tropical species need ground that holds and releases water.',
        ],
      },
      {
        id: 'species-matching',
        title: 'Matching Bedding to the Species',
        content:
          'The pairing below reads like a shortcut because it is one. Habit drives everything: ground-dwelling arid lizards want a firm, dry mix, tropical snakes want bark that holds moisture, forest geckos want soil that stays damp without pooling, and tortoises split between grassland and humid forest species with entirely different needs. Run any bag you shop against this habit column before the rest of the description matters.',
        tableData: {
          headers: ['Animal habit', 'Substrate that fits', 'Watch-out'],
          rows: [
            ['Arid ground lizard', 'Sand-soil mix, packed firm', 'Loose grains scattered near food dishes'],
            ['Tropical snake', 'Cypress bark or coco fiber', 'Damp but never soaked, or scale problems'],
            ['Forest gecko', 'Soil-coco blend, kept moist', 'Standing water in the bottom layer'],
            ['Grassland tortoise', 'Soil-sand mix with hay offered', 'Damp ground invites shell trouble'],
            ['Aquatic turtle bank', 'Large, smooth river stones', 'Swallow-sized gravel causes trouble'],
          ],
        },
        tips: [
          'Check the animal\u2019s native ground before choosing any bag.',
          'Read the watch-out column; every substrate carries one.',
        ],
      },
      {
        id: 'impaction-debate',
        title: 'The Loose Substrate Impaction Debate',
        content:
          "The hobby's loudest argument deserves a fair hearing. Impaction, where swallowed substrate clumps in the gut, is real but rarely random: it clusters around inadequate heat, chronic dehydration, and animals hunting loose particles for minerals they lack. Critics of loose substrate overstate the risk; cheerleaders ignore it. The practical middle path runs like this: start hatchlings and juveniles on solid footing, keep heat and hydration dialed in, feed on a plate or a clear patch rather than over deep loose bedding, and graduate settled adults onto naturalistic mixes. Watch the droppings, because changes there speak first.",
        callout: {
          type: 'warning',
          title: 'Droppings tell the truth first',
          text: 'No passage for days, a swollen belly, or straining without results means stop feeding and call a veterinarian experienced with reptiles immediately. Impaction responds best when caught early.',
        },
        tips: [
          'Feed on a dish or cleared patch, away from loose bedding.',
          'Confirm temperatures and hydration before blaming the substrate alone.',
          'Track droppings; frequency and shape change before appetite does.',
        ],
      },
      {
        id: 'paper-towel-startup',
        title: 'Paper Towels for the First Weeks',
        content:
          'Unromantic, cheap, and genuinely useful for a first month. Paper towels show droppings, urates, and mites in plain sight, swap out in seconds, and carry nothing from a previous animal. Hatchlings and fresh arrivals live on them while you learn the feeding rhythm and verify the animal is established. The trade is honest: no humidity contribution, no burrowing, nothing to root plants in. Plan the move to the permanent substrate once eating is steady and the quarantine stretch ends, and change the sheets before they smell rather than after.',
        tips: [
          'Start hatchlings and new arrivals on paper towels without apology.',
          'Read droppings and appetite daily while the setup stays simple.',
          'Move to permanent substrate once the animal is feeding steadily.',
        ],
      },
      {
        id: 'bioactive-endgame',
        title: 'Bioactive Substrate as the Endgame',
        content:
          'The endgame for many keepers is a living floor. A bioactive substrate layers drainage, mesh, and several inches of soil-based mix, then adds a cleanup crew of springtails and isopods that processes waste into plant food. Done well, it stabilizes humidity for years and turns spot cleaning into a five-minute patrol rather than a monthly overhaul. Done hastily, it becomes a swamp that smells like a forgotten cellar. Start one only after a conventional setup has taught you the animal\u2019s rhythms, and build it with clean, tested materials rather than garden soil and optimism.',
        callout: {
          type: 'pro-tip',
          title: 'Cure it before the animal',
          text: 'A fresh bioactive mix wants weeks to settle, sprout, and grow its cleanup crew. Let the layers prove they drain and hold moisture correctly before anyone moves in.',
        },
        tips: [
          'Layer drainage, mesh, and soil in that order, always.',
          'Add springtails and isopods before the animal, never after.',
          'Test one on a species you already keep well, not your first.',
        ],
      },
      {
        id: 'depth-and-layering',
        title: 'Depth and Layering by Behavior',
        content:
          'Depth is behavior, not styling. Deep-bodied burrowers like sand boas need enough depth to disappear, which for an adult means several inches of packable substrate, while canopy climbers barely touch the floor and a thin layer does the job. Tropical and bioactive builds add a drainage layer beneath the soil so excess water has somewhere honest to go instead of turning the base anaerobic. Ask what the species does at ground level in the wild, then give the floor enough height to let it.',
        tips: [
          'Give confirmed burrowers enough depth to fully submerge themselves.',
          'Use a drainage layer wherever water accumulates at the base.',
          'Canopy species manage fine with a thin, clean floor.',
        ],
      },
      {
        id: 'substrate-lifespan',
        title: 'Substrate Life and Replacement Cadence',
        content:
          'How long a bag lasts is mostly a function of your spot cleaning. Pull droppings, urates, and food remains the day they appear, and a quality substrate holds its structure for weeks or months; let waste sit and it saturates, smells, and forces a full change early. Arid substrates on a diligent schedule stretch far longer than tropical ones, which compact and sour sooner. When a full change does come, do it during a deep clean of the empty enclosure so both jobs share one disruption. Bioactive floors skip full changes by design.',
        tips: [
          'Spot clean the day waste appears; bags reward the discipline.',
          'Fold full substrate changes into your enclosure deep-clean days.',
          'Expect tropical floors to retire sooner than arid ones.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Match by habit',
        items: [
          { highlight: 'Arid needs dry', text: 'firm, packable mixes; damp bark invites respiratory trouble.' },
          { highlight: 'Tropical holds moisture', text: 'bark and coco fiber keep humidity bands reachable.' },
          { highlight: 'Forest stays damp', text: 'soil-coco blends that never pool at the bottom.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Impaction, handled',
        items: [
          { highlight: 'Start juveniles solid', text: 'paper towels carry hatchlings through clumsy early hunting.' },
          { highlight: 'Feed on a dish', text: 'kept away from deep loose bedding at every meal.' },
          { highlight: 'Watch the droppings', text: 'passing changes speak up before the appetite ever does.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'The long game',
        items: [
          { highlight: 'Build bioactive later', text: 'a living floor rewards keepers who already read their animal.' },
          { highlight: 'Drainage layer first', text: 'water needs somewhere honest to go beneath tropical soil.' },
          { highlight: 'Spot cleaning decides', text: 'daily pulls stretch a bag from weeks into months.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Is loose substrate dangerous for juvenile reptiles?',
        answer:
          'Juveniles are at higher risk because they hunt clumsily and swallow more misses. Plenty of experienced keepers raise hatchlings on paper towels or solid matting, then graduate settled adults onto loose mixes with heat and hydration verified. Feed away from deep bedding and the risk drops sharply. A vet who sees reptiles should check any hatchling that stops passing droppings.',
      },
      {
        question: 'What substrate is best for a bearded dragon?',
        answer:
          'A packed, sandy-loam mix suits healthy adults of this arid species, packed firm so footsteps leave only shallow marks. Hatchlings do better on paper towels or solid matting first. Avoid products marketed as digestible calcium sand; they earn their poor reputation honestly, and impaction reports behind them are consistent enough to take seriously.',
      },
      {
        question: 'How often should I replace reptile bedding?',
        answer:
          'Depends on the type and your spot cleaning. With waste pulled out the day it appears, arid substrates often run one to two months, tropical floors a few weeks less, and bioactive soil runs indefinitely with topping up. Smell, saturation, or visible soiling is the honest signal. On a strict routine, replace during a full enclosure clean.',
      },
      {
        question: 'What is a bioactive substrate?',
        answer:
          'A living floor built in layers: drainage underneath, mesh separator, then several inches of soil planted and stocked with springtails and isopods. The cleanup crew eats waste and mold, plants drink the excess moisture, and the whole system can run for years without a full change. It suits established keepers more than beginners, since reading the balance takes practice.',
      },
      {
        question: 'Can I use sand or soil from outside?',
        answer:
          'Treat outdoor soil as contaminated until shown otherwise: parasites, pest insects, and pesticide drift travel in it invisibly. Sterilizing sand at home is possible but tedious, and most keepers decide the effort outweighs the savings. Bagged substrate made for reptiles arrives screened and consistent, which matters most for hatchlings and newly imported animals.',
      },
    ],
  },

  // =========================================================================
  // REPTILE / CLEANING — the routine and disinfectant safety
  // =========================================================================
  'reptile/reptile-cleaning': {
    heroTitle: 'A Reptile Cleaning Routine That Actually Protects Them',
    heroSubheadline:
      'Reptiles drink from their dishes, their decor, and the glass itself. Cleaning has to hit a daily rhythm, a seasonal deep clean, and disinfectants rinsed away completely.',
    metaDescription:
      'The reptile cleaning routine that holds: daily spot cleaning, deep cleans by enclosure type, and disinfectant safety for animals that drink from every surface.',
    introSummary:
      "Every reptile room eventually finds its rhythm: the morning glance for droppings, the water swap, the Saturday glass wipe. What separates a healthy collection from a struggling one is usually not the animals but the consistency of that rhythm. Cleaning for reptiles carries a second weight, because they drink from surfaces mammals would never touch and because their waste, tools, and runoff carry organisms you do not want in your kitchen sink. The routine below is boring on purpose: small daily moves, scheduled deep cleans, and disinfection done safely.",
    sections: [
      {
        id: 'why-a-schedule',
        title: 'Why Reptile Hygiene Runs on a Schedule',
        content:
          'Standing water, leftover feeders, and missed droppings are not cosmetic problems in a warm enclosure; they are fuel. Bacteria multiply faster at basking temperatures than in your kitchen, and urates left to sit etch glass and substrate alike. A schedule wins over willpower because it removes the daily decision. The five-minute morning pass becomes automatic, the water change happens whether or not the dish looks dirty, and the deep clean lands on the calendar rather than on a smell threshold. Small, boring, and relentless is the formula that keeps animals breathing easy.',
        tips: [
          'Anchor the spot clean to feeding time so it never slips.',
          'Change water on schedule, not on appearance; film builds invisibly.',
          'Put the deep clean on the calendar with everything else.',
        ],
      },
      {
        id: 'daily-spot-clean',
        title: 'The Daily Spot Clean',
        content:
          'The daily pass takes minutes once it becomes muscle memory. Lift droppings and urates with a spoon or tongs dedicated to waste, remove uneaten insects the same day so they do not nibble a sleeping animal, and skim shed skin before it molds. Check the water dish twice over: soiled water gets dumped immediately, and a quick finger swipe tells you whether film is building on the inner wall. Feeders left overnight are the classic miss; crickets especially chew on anything soft, including your animal.',
        tips: [
          'Keep waste-only tongs separate from feeding tongs, always.',
          'Pull uneaten crickets the same evening; they bite sleeping animals.',
          "Swipe the dish's inner wall daily to feel for film early.",
        ],
      },
      {
        id: 'deep-clean-cadence',
        title: 'Deep Clean Cadence by Enclosure Type',
        content:
          'Cadence depends on what the enclosure is made of and how it breathes. Glass shows its grime and scrubs easily, plastic tubs resist disinfectant contact time on textured floors, screen cages dry fast but trap debris in mesh, and outdoor tortoise pens work on seasonal logic instead. The table below translates enclosure type into a realistic calendar you can actually keep.',
        tableData: {
          headers: ['Enclosure type', 'Deep clean cadence', 'Notes'],
          rows: [
            ['Glass terrarium', 'Every one to two months', 'Scrape corners; check silicone seams'],
            ['Plastic tub or rack', 'Every two to three months', 'Watch scratched floors for hidden film'],
            ['Screen cage', 'About monthly', 'Mesh holds debris; rinse it outdoors'],
            ['Outdoor tortoise pen', 'Seasonally, spring and fall', 'Rake waste and sun-dry the ground'],
            ['Bioactive vivarium', 'Spot clean only', 'The cleanup crew is the system'],
          ],
        },
        tips: [
          'Write the next deep clean date on the enclosure label.',
          'Deep clean sooner after any illness or parasite scare.',
        ],
      },
      {
        id: 'disinfectant-safety',
        title: 'Disinfectants and the Drinking Surface Problem',
        content:
          'This is the part of reptile cleaning with no shortcuts. A lizard laps dew off the same glass you just sprayed, and a snake drinks from a water dish freshly wiped with a rag that still smells of chemicals. Whatever disinfectant you use, diluted household bleach or a dedicated reptile-safe product, the animal leaves the room first, the product stays on the surface for its full contact time, and the rinse runs until no odor remains at all. As you compare disinfectant listings, read for stated contact times and reptile safety rather than fragrance. Chemical residue that would barely bother a dog ends up inside a drinking reptile.',
        callout: {
          type: 'warning',
          title: 'Rinse past the point of patience',
          text: 'If your nose can still detect the disinfectant, the surface is not ready. Rinse, dry, and rinse again before the animal returns; drinking surfaces hold residue that spraying alone leaves behind.',
        },
        tips: [
          'Remove the animal from the room before any disinfectant comes out.',
          'Respect the product\u2019s full contact time; a spray-and-wipe defeats it.',
          'Rinse until no scent remains, then let surfaces air dry.',
        ],
      },
      {
        id: 'quarantine-discipline',
        title: 'Quarantine Discipline for New Arrivals',
        content:
          'A new animal should meet a simple, easy-to-sterilize setup before it meets your collection. The quarantine stretch, commonly two to three months, exists because parasites and infections often announce themselves slowly, and one shared tool or one skipped handwash can carry them to every animal you keep. Give the newcomer its own tongs, dishes, and sponges, handle it last on any cleaning circuit, and log its weight and droppings from day one. Discipline here is cheaper than treating a whole room.',
        tips: [
          'Quarantine new arrivals in a separate room, not just a separate cage.',
          'Give each new animal dedicated tools during its quarantine stretch.',
          'Handle and clean the newcomer last, then wash up thoroughly.',
        ],
      },
      {
        id: 'zoonotic-hygiene',
        title: 'Zoonotic Hygiene Without Panic',
        content:
          'Reptiles can carry Salmonella asymptomatically, which is a fact of the hobby rather than a reason to quit it. The defenses are unglamorous and total: wash hands with soap after any handling or cleaning, keep children from kissing animals or touching their faces mid-visit, and never bathe a turtle or dump enclosure water in the kitchen sink. Clean in a utility tub or outside, and keep cleaning sponges out of the kitchen entirely. Run the routine this way and the risk stays managed instead of mysterious.',
        callout: {
          type: 'warning',
          title: 'Hands last, always',
          text: 'Soap and running water after every touch, clean, or tank-draining session. Hand sanitizer helps in a pinch but does not replace a proper wash with Salmonella in the picture.',
        },
        tips: [
          'Wash with soap after every handling or cleaning session, no exceptions.',
          'Dump enclosure water outside or in a utility drain, never the kitchen.',
          'Keep reptile sponges and brushes dedicated, stored away from food areas.',
        ],
      },
      {
        id: 'routine-sticks',
        title: 'Making the Routine Stick',
        content:
          'Consistency beats intensity, and the mechanism matters more than motivation. A cleaning caddy that lives outside the reptile room removes four small excuses per week; waste tongs hung by the door get used daily because they are there; a whiteboard note tracking the last deep clean survives every memory failure. Attach the spot clean to an existing habit like the morning coffee or the evening feeding round, and the routine runs on autopilot inside a month. Buy supplies for the routine you will honestly keep as you compare options, not the one you imagine. Anything you have to remember will eventually slip; anything built into the day will not.',
        tips: [
          'Keep the cleaning caddy stocked and outside the room.',
          'Pair the spot clean with coffee or the evening feeding round.',
          'Track the last deep clean where the calendar can shame you.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'clock',
        title: 'The daily pass',
        items: [
          { highlight: 'Waste leaves daily', text: 'droppings, urates, and stray feeders never sit overnight.' },
          { highlight: 'Water on rotation', text: "fresh water whether or not yesterday's looks clear." },
          { highlight: 'Tools stay dedicated', text: 'waste tongs and feeding gear never share a bin.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Disinfect safely',
        items: [
          { highlight: 'Animal out first', text: 'fumes hit small breathing systems harder than ours.' },
          { highlight: 'Contact time matters', text: 'spraying and wiping instantly defeats the disinfectant\u2019s purpose.' },
          { highlight: 'Rinse past patience', text: 'no detectable scent before anyone moves back in.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Protect the house',
        items: [
          { highlight: 'Wash after touching', text: 'soap and running water after every session, no exceptions.' },
          { highlight: 'Keep tools separate', text: 'reptile sponges live far from the kitchen sink.' },
          { highlight: 'Quarantine every arrival', text: 'separate room, dedicated tools, and a long patience.' },
        ],
      },
    ],
    faqs: [
      {
        question: "How often should I clean my reptile's enclosure?",
        answer:
          'Spot clean every day, swapping water and lifting waste within minutes of noticing it. Deep cleans run monthly to quarterly depending on enclosure type and how honestly you spot clean. Glass terrariums usually want one every month or two. Whenever the animal is ill or newly arrived, tighten every interval and disinfect more thoroughly.',
      },
      {
        question: 'Is it safe to use bleach around reptiles?',
        answer:
          'Yes, with discipline. Remove the animal, dilute properly, let the solution sit for its full contact time, then rinse repeatedly until no odor remains and let everything dry. Bleach breaks down to plain salt water as it dries, which is why it remains the classic option. Dedicated reptile disinfectants trade some strength for convenience and milder fumes.',
      },
      {
        question: 'Should I remove my reptile when cleaning the enclosure?',
        answer:
          'For daily spot cleaning, usually not; work around a calm animal gently. For any disinfectant work, absolutely yes, out of the room entirely. Fumes that seem minor to you hit a small breathing body far harder, and a startled animal in a confined space with your hands and tools is where tail drops and bite injuries happen.',
      },
      {
        question: 'Can you get sick from cleaning a reptile tank?',
        answer:
          'You can, mostly through Salmonella, and almost always through the hands-to-mouth route. Gloves during deep cleans, washing with soap afterward, and keeping cleaning tools out of the kitchen close the loop. Never dump tank water where food is prepared. The risk is real but behaves predictably, which makes it manageable rather than frightening.',
      },
      {
        question: 'How do you clean a bioactive enclosure?',
        answer:
          'Mostly, you do not, and that is the point. Spot clean solid waste the cleanup crew has not finished, trim dead plant material, and top up water. Full teardowns destroy the organisms and microfauna you spent months establishing. Refresh only the top layer if something goes badly wrong, and rebuild the crew afterward.',
      },
    ],
  },

  // =========================================================================
  // REPTILE / DECOR — hides and climbing structure
  // =========================================================================
  'reptile/reptile-decor': {
    heroTitle: 'Reptile Decor That Serves Hiding and Climbing Instincts',
    heroSubheadline:
      'Hides, branches, and rocks are not scenery; they are the furniture your reptile\u2019s instincts expect. Counting, anchoring, and cleaning them well is the whole difference between stress and security.',
    metaDescription:
      'Reptile decor that works for the animal: the hide count rule, anchoring rocks and branches, snake versus lizard geometry, and the care porous wood demands.',
    introSummary:
      "Watch a lizard in a half-empty enclosure and you will see an animal with nowhere to put itself. It sprints corner to corner, glass-surfs, or wedges behind a water bowl because the open middle offers no cover. Reptile decor solves a behavior problem before it solves an aesthetic one: hides answer the instinct to disappear, branches answer the instinct to climb, and rocks answer the need for traction and platforms. Here is how to count, place, anchor, and maintain the furniture so it keeps doing those jobs.",
    sections: [
      {
        id: 'behavior-equipment',
        title: 'Decor Is Behavior Equipment',
        content:
          'A hide is not decoration; it is the difference between an animal that rests and an animal that braces. Climbing structure is not visual interest; it is the vertical territory an arboreal species treats as its actual home. When you shop the decor shelf with that lens, the silly pieces fall away fast. A fluorescent skull with one entrance serves nobody; a cork tube serves a snake, a cleanup crew, and your cleaning schedule at once. Buy for the behavior, and the looks take care of themselves.',
        tips: [
          'Shop by behavior first: hiding, climbing, basking, or burrowing.',
          'Skip one-entrance novelty pieces; animals cannot use theater props.',
          'One good cork tube outworks several decorative resin pieces.',
        ],
      },
      {
        id: 'hide-count-rule',
        title: 'The Hide Count Rule',
        content:
          'The working rule is simple: at least one hide per animal, and better, one on the warm end, one on the cool end, and one humid hide in between for species that use them. The logic is thermoregulation with security: an animal should never have to choose between its ideal temperature and feeling safe. Snakes add a fit requirement, wanting hides tight enough to touch their coils on all sides, so a snake hide often gets replaced as the animal grows. As you compare hide listings, check interior dimensions against the species\u2019 adult body, not its current size. Geckos prefer clutter, low cover, and multiple small options over one grand cave.',
        tips: [
          'Provide one hide minimum, ideally one per temperature zone.',
          'Size snake hides snug; coils should touch the walls.',
          'Give geckos clutter and cover instead of one large cave.',
        ],
      },
      {
        id: 'snake-vs-lizard-geometry',
        title: 'Snake Geometry Versus Lizard Geometry',
        content:
          'A snake and a lizard read the same room differently. Snakes are horizontal animals that travel floor contours, slip through tight gaps, and want structures they can brace against while moving; open space reads as exposure. Lizards, especially agamids and geckos, exploit the third dimension and treat a branch network as square footage, so their enclosures get judged on usable climbing routes, not floor area. For the snake, think tunnels, ledges, and anchor points. For the lizard, think ramps, diagonals, and a canopy that reaches the upper zone without crowding it.',
        tips: [
          'Build floor highways for snakes: tunnels, ledges, and bracing points.',
          'Build vertical routes for lizards: diagonals beat sheer walls.',
          'Judge lizard space by climbable surface, not floor dimensions.',
        ],
      },
      {
        id: 'anchoring',
        title: 'Anchoring Rocks and Branches Securely',
        content:
          'Everything heavy in a reptile enclosure eventually gets climbed on, pushed, and used as a brace during shedding, so anchoring is a safety system rather than a finishing touch. Wedge branches between fixed points instead of resting them loose, silicone rock stacks to each other and the floor with aquarium-safe adhesive, and keep the center of gravity low on anything an animal can reach. Then pull-test by hand: push, lever, and lean every piece the way a panicked animal would. A branch that shifts under your grip will shift under sixty seconds of determined climbing, and whatever is underneath takes the hit.',
        callout: {
          type: 'warning',
          title: 'Pull-test like a startled animal',
          text: 'Grab, shove, and lever every heavy piece before the animal moves in. If anything wobbles under your full hand strength, fix it now; falls crush feet, spines, and shells, and reptiles hide those injuries well.',
        },
        tips: [
          'Wedge branches between fixed surfaces rather than balancing them loose.',
          'Use aquarium-safe silicone to bond rock stacks at the base.',
          "Keep heavy decor's center of gravity low and over solid floor.",
        ],
      },
      {
        id: 'porous-decor-care',
        title: 'Porous Decor and Its Cleaning Burden',
        content:
          "Wood, cork, and unglazed clay share one trait: they absorb. That makes them excellent humidity reservoirs and excellent hideouts for mites and mold if they are ever neglected. Bake wood pieces at a low oven temperature until warmed through, or soak and sun them, when introducing new material and after any infestation; scrub cork bark's crevices during deep cleans rather than soaking it repeatedly, which eventually crumbles the bark. Resin and sealed ceramics are the low-maintenance opposite, surviving full disinfectant soaks. As you compare listings, decide deliberately whether each piece can take the cleaning routine you actually run.",
        tips: [
          'Heat-treat new wood decor in a low oven before it enters.',
          'Scrub cork crevices during deep cleans instead of repeated soaks.',
          'Choose resin or sealed ceramics where your routine runs harsh.',
        ],
      },
      {
        id: 'layout-security',
        title: 'Arranging Security Without Dead Space',
        content:
          'Layout is about sightlines. An animal that can see across the entire enclosure from its perch never fully relaxes, so run visual barriers along the back and sides and let the middle carry the activity. Climbing routes should connect floor to canopy without crossing open air for long stretches, and every dead corner either gets furniture or gets used for the food dish and water station. Rotate a piece or two occasionally; novelty triggers exploration, and exploration is exercise. The enclosure that looks busiest is rarely the one that functions best.',
        tips: [
          'Break long sightlines with barriers along the back and sides.',
          'Connect climbing routes so nothing dangles over open stretches.',
          'Rotate one or two pieces monthly to spark fresh exploration.',
        ],
      },
      {
        id: 'decor-retirement',
        title: 'Knowing When Decor Retires',
        content:
          'Furniture earns retirement honestly. Wood that stays damp develops soft spots that crumble under climbing weight, cork that has been through several mite treatments gets porous enough to harbor them permanently, and anything cracked along a load line is a pinching hazard during a shed. Chewed edges, permanent odor, and urate scale that defeats scrubbing all mark the end. Replace safety-critical pieces immediately and cosmetic ones deliberately. Retirement is also the honest moment to ask whether the animal has outgrown the geometry rather than the piece simply aging.',
        callout: {
          type: 'pro-tip',
          title: 'The outgrow question',
          text: 'Each season, check whether the animal still fits the geometry: a snake thicker than its favorite tube and a gecko heavier than its thinnest branch both need an upgrade before an accident teaches you.',
        },
        tips: [
          'Retire any wood with soft spots or crumbling load paths.',
          'Replace cracked pieces immediately; sheds make pinning injuries likely.',
          'Ask if the animal outgrew the geometry, not just the furniture.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'shield',
        title: 'Count and place',
        items: [
          { highlight: 'One per zone', text: 'warm end, cool end, plus a humid hide where needed.' },
          { highlight: 'Snug fits for snakes', text: 'coils should touch the walls on every side.' },
          { highlight: 'Clutter suits geckos', text: 'several small covers beat one single grand cavern.' },
        ],
      },
      {
        icon: 'check',
        title: 'Anchor everything',
        items: [
          { highlight: 'Wedge, do not balance', text: 'branches belong between fixed points, not resting loose.' },
          { highlight: 'Silicone the stacks', text: 'aquarium-safe adhesive bonds rockwork down at the base.' },
          { highlight: 'Pull-test by hand', text: 'wobbling under your grip means falling under theirs.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Keep it serviceable',
        items: [
          { highlight: 'Porous means work', text: 'wood and cork demand baking, scrubbing, and full drying.' },
          { highlight: 'Resin forgives routine', text: 'sealed pieces survive disinfectant soaks without any complaint.' },
          { highlight: 'Retire pieces honestly', text: 'soft wood, cracks, and permanent odor end a career.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How many hides does my reptile need?',
        answer:
          'At least one per animal as a floor, two to three as the real target: a warm-end hide, a cool-end hide, and a humid one for species that benefit. The rule exists so thermoregulation never trades against security. Snakes especially will use a too-cool hide over an exposed perfect one every single time.',
      },
      {
        question: 'Can I use wood and rocks from outside?',
        answer:
          'Yes, with treatment and selection. Skip cedar and pine outright; their oils irritate reptile lungs. Choose hardwood branches without rot or insect holes, then bake them at a low oven temperature until heated through. Rocks need a scrub, a bleach dip, and endless rinsing. The effort is real, and so is the payoff in natural texture and climbing variety.',
      },
      {
        question: 'How do I clean wood decor from my vivarium?',
        answer:
          'Bake small pieces at a low oven setting until warmed through, which handles mites and mold spores; boiling works for pieces that fit a pot. Between treatments, dry brushing and spot scrubbing carry the load, since repeated soaking eventually breaks cork and bark down. If wood stays damp, softens, or smells earthy after drying, retire it rather than fighting it.',
      },
      {
        question: 'Why is my reptile hiding all the time?',
        answer:
          'Check security before health. With too few hides or too much open sightline, hiding is the only rational move, and adding cover often changes the behavior within days. If the furniture is genuinely adequate and the animal still vanished, with meals refused or weight lost, that combination belongs with an exotics-savvy veterinarian quickly rather than another decor rebuild.',
      },
      {
        question: 'Do lizards really need climbing branches?',
        answer:
          'Arboreal species absolutely do; for crested geckos and anoles, vertical structure is the habitat, and floor space is an afterthought. Terrestrial species like leopard geckos prefer low climbs and ledges over canopies. Match structure to how the species lives; a bearded dragon wants sturdy low branches and platforms rather than a tall canopy it never trusts.',
      },
    ],
  },

  // =========================================================================
  // REPTILE / DISHES — water dishes as humidity gear
  // =========================================================================
  'reptile/reptile-dishes': {
    heroTitle: 'Reptile Water Dishes That Do Humidity Duty Too',
    heroSubheadline:
      'A water dish waters the air as much as the animal. Size it for soaking, place it by climate strategy, weight it against tipping, and change it daily.',
    metaDescription:
      'Reptile water dishes as humidity gear: soak-safe sizing, warm-side or cool-side placement, tipping-proof bases, and daily changes that keep water drinkable.',
    introSummary:
      "The water dish is the most underestimated piece of equipment in the hobby. It looks like a bowl and does four jobs: drinking station, soaking tub, humidity engine, and behavioral indicator, since a sudden change in soaking habits says plenty. Choosing one well means sizing it to the species, placing it on purpose rather than wherever it fits, and weighting it against an animal that treats dishes as furniture to rearrange. Get those three right and the daily water change becomes a five-minute ritual instead of a chore with consequences.",
    sections: [
      {
        id: 'humidity-instrument',
        title: 'The Dish Is a Humidity Instrument',
        content:
          'Every square inch of open water evaporates on a schedule set by temperature and airflow, which makes the dish a humidity device you refill daily. A wide, shallow dish in the warm zone can lift the ambient reading noticeably in a modest enclosure; the same dish on the cool end contributes far less and lasts longer between refills. Tropical keepers exploit this on purpose, arid keepers work against it, and both groups watch the hygrometer rather than trusting instinct. Surface area is the control knob; depth barely matters to the air.',
        tips: [
          'Treat dish surface area as a humidity control, not an accident.',
          'Wide and shallow evaporates more; narrow and deep holds longer.',
          'Verify any placement change with the hygrometer for a few days.',
        ],
      },
      {
        id: 'soaking-size',
        title: 'Sizing for Soaking and Getting Out',
        content:
          'Soaking species like ball pythons want a dish large enough to fit the whole animal with water reaching somewhere near mid-body, because a proper soak is how they handle stuck shed and hydration at once. Everything else in the enclosure wants an escape route: a gentle interior slope or a textured rim so a clumsy climber that falls in can walk back out. Small geckos and hatchlings are the drowning cases in this hobby, not the giants. For tiny geckos and hatchlings, keep the water shallow enough to stand in and give the rim enough texture to climb.',
        callout: {
          type: 'warning',
          title: 'Deep bowls drown small geckos',
          text: 'A dish that barely troubles an adult python is open water to a hatchling. Anything too deep to walk out of gets a ramp of stones or stays out of the enclosure until the animal grows.',
        },
        tips: [
          'Size soaking dishes to the species at full adult length.',
          'Give every dish a textured rim or slope for escape.',
          'Keep hatchling water shallow; they are the real drowning risk.',
        ],
      },
      {
        id: 'warm-or-cool-placement',
        title: 'Warm Side or Cool Side Placement',
        content:
          'Placement is a trade rather than a rule. The warm-side dish evaporates aggressively, buys you free humidity, warms the drinking water to a temperature many tropical species prefer, and goes stale faster because bacteria enjoy warmth too; expect more refills and more film scrubbing. The cool-side dish stretches a day longer, feeds the ambient humidity far less, and suits arid species whose water should stay modest and clean. Decide with the hygrometer and the species\u2019 humidity band side by side, then stop second-guessing.',
        tips: [
          'Use the warm side for humidity; the cool side for longevity.',
          'Arid species generally drink cooler, cleaner, longer-lasting water.',
          'Log readings after moving a dish; drift takes days to show.',
          'Compare any dish you browse by where it will live, not how it photographs.',
        ],
      },
      {
        id: 'tipping-proof-bases',
        title: 'Tipping-Proof Bases and Materials',
        content:
          'Somebody in this hobby is always remodeling, and it is not you. Heavy ceramic dishes shrug off a determined digger, stay put under a climbing juvenile, and double as soak tubs for medium species; the cost is weight in your hand every single day. Lightweight resin bowls are easy to lift and cheap to replace, but an adult digging underneath will walk them across the enclosure and spill on schedule. Look for wide footprints, low centers of gravity, and rim lips that sit flush to the floor so no burrow fits underneath. As you compare dish listings, base weight and floor profile beat every color option on the page.',
        tips: [
          'Choose wide, heavy bases wherever a digger shares the enclosure.',
          'Rims that sit flush leave no gap worth burrowing under.',
          'Ceramic tolerates daily scrubbing; resin tolerates daily dropping.',
        ],
      },
      {
        id: 'what-goes-in',
        title: 'What Goes Into the Bowl',
        content:
          'Plain tap water works for most species once the chlorine has been handled, either by aging it a day in an open container or by treating it with a dechlorinator sold for reptiles and amphibians. Distilled water has its place in misting systems, where minerals would otherwise crust the nozzles and glass, but as the only drinking source it is a poor long-term choice, arriving stripped of minerals the animal expects. Whatever you pour, pour it fresh daily, because a reptile judges its water by smell and chemistry far more than by clarity.',
        tips: [
          'Age tap water a day or dechlorinate it before filling the dish.',
          'Save distilled water for misters, not for daily drinking.',
          'Refresh daily regardless of how clear yesterday\u2019s water looks.',
        ],
      },
      {
        id: 'daily-change',
        title: 'The Daily Change Habit',
        content:
          'Water changes are daily because reptiles do not sip politely. They soak, defecate, drag bedding in on their feet, and drink from whatever remains. Dump the bowl, give it a quick scrub with a dedicated brush, refill, and the whole operation runs under two minutes; skip the scrub and a slick film coats the inside within days, felt by fingertip long before it is visible. A python that soaks nightly may need the change twice a day. Water that smells like a pond was a pond yesterday.',
        tips: [
          'Dump, scrub, and refill daily with a dedicated dish brush.',
          'Double the change for nightly soakers and after any defecation.',
          'Trust your fingertip on the bowl wall over your eyes.',
        ],
      },
      {
        id: 'big-enclosures',
        title: 'Covering Ground in Big Enclosures',
        content:
          'Large and naturalistic enclosures deserve more than one station. A drinking dish at each end saves a shy animal the exposed crossing, and the humid microclimate around one bowl can differ usefully from the drier end. Monitor each dish separately for a week, because evaporation, soiling, and even preference vary by location, and retire whichever one the animal ignores. Multiple dishes multiply the daily routine, so the honest rule is simple: only run as many stations as you will actually refresh every single day.',
        tips: [
          'Offer one station per end in enclosures past four feet.',
          'Watch which dish the animal actually prefers, then simplify.',
          'Never add a station you will not refresh daily.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Place with intent',
        items: [
          { highlight: 'Warm side humidifies', text: 'more evaporation, more refills, and faster film growth.' },
          { highlight: 'Cool side preserves', text: "fresher water longer, suits arid species' modest needs." },
          { highlight: 'Verify with readings', text: 'give any placement move several days to settle.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Size for safety',
        items: [
          { highlight: 'Soak-sized for pythons', text: 'full body in, water near the middle of the coils.' },
          { highlight: 'Escape ramps save lives', text: 'textured rims and gentle slopes prevent hatchling drownings.' },
          { highlight: 'Weight beats walking', text: 'heavy, wide bases survive determined diggers and climbers.' },
        ],
      },
      {
        icon: 'clock',
        title: 'The daily ritual',
        items: [
          { highlight: 'Fresh water daily', text: 'clarity means little; smell and film mean everything.' },
          { highlight: 'Dedicated brush only', text: 'dish tools should never meet your kitchen sponges.' },
          { highlight: 'Stations you maintain', text: 'run only as many dishes as you refresh daily.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Where should I put the water dish in my terrarium?',
        answer:
          'Start from intent. The warm side evaporates faster, so it raises humidity and suits tropical species, at the cost of more refills and faster bacterial growth. The cool side keeps water fresher longer and suits arid species that only need modest humidity. Verify with a hygrometer after a few days rather than guessing, and adjust once.',
      },
      {
        question: "How often should I change my reptile's water?",
        answer:
          'Daily, without fail, and more often for enthusiastic soakers or any animal that defecates in the bowl. Reptiles drink from and soak in the same water they soil, and the film that builds inside a bowl is invisible for its first days. The change takes two minutes with practice and prevents most water-borne trouble before it starts.',
      },
      {
        question: 'What size water dish does a ball python need?',
        answer:
          'Big enough for the whole animal to coil into with water reaching mid-body, so a stuck shed can be soaked off on the snake\u2019s own schedule. Weight matters as much as width, since pythons lean, push, and remodel. If the animal soaks constantly, first check your humidity and temperatures, then mention the habit at a reptile-savvy vet visit.',
      },
      {
        question: 'Why does my snake poop in its water bowl?',
        answer:
          "It is common and convenient from the snake's side: soaking softens the passage and water carries scent away. Some individuals make it a signature habit. The cost is entirely yours, since the bowl needs an immediate dump, scrub, and refill rather than a spot check later. Constant soaking plus refusal of dry hides points more toward husbandry stress than personality.",
      },
      {
        question: 'Can a reptile drown in its water dish?',
        answer:
          'Yes, and the victims are almost always the smallest: hatchlings, small geckos, and weakened animals that fall in and cannot climb the smooth wall back out. Depth limits, textured rims, and stone ramps remove nearly all of that risk while keeping the dish functional. A healthy adult snake or lizard in an appropriately shallow dish is in very little danger.',
      },
    ],
  },

  // =========================================================================
  // REPTILE / FILTERS AND PUMPS — semi-aquatic filtration
  // =========================================================================
  'reptile/reptile-filters-and-pumps': {
    heroTitle: 'Filtration for Aquatic Turtles and Paludariums That Keeps Up',
    heroSubheadline:
      'Aquatic turtles and paludariums make dirty water fast. Matching mechanical, biological, and chemical media to the load, and accepting some drain-and-refill labor, keeps the whole system honest.',
    metaDescription:
      'Filtration for aquatic turtles and paludariums: oversizing past the rated volume, mechanical versus biological media care, and drain-and-refill honesty.',
    introSummary:
      "Green water a week after setup is practically a rite of passage for new turtle keepers. The lesson underneath the murk is that turtles are not messy fish; they are heavy waste loads with appetites attached, and paludariums add land, pumps, and waterfalls to the same chemistry. Filtration in this corner of the hobby is less about a single heroic device and more about media doing separate jobs, ratings read skeptically, and a water-change routine kept honest. Here is how the pieces fit and where the shortcuts fail.",
    sections: [
      {
        id: 'turtle-filtration-math',
        title: 'Turtles Rewrite the Filtration Math',
        content:
          'A filter rated for your water volume was rated with fish in mind. Turtles eat heavily, digest quickly, and produce ammonia-rich waste straight into water they also live in, which is why experienced keepers deliberately oversize: a unit rated for two or three times the actual water volume is the honest starting point, not overkill. Water depth matters too, since many turtles keep the level drawn down, shrinking the volume your filter actually cleans. Read ratings as the floor, never the target; as you compare filter listings, treat the stated volume as a starting bid and shop upward from it.',
        tips: [
          'Oversize the rating well past your measured water volume.',
          'Remember basking setups often run with drawn-down water levels.',
          'Treat box ratings as minimums for turtles, never targets.',
        ],
      },
      {
        id: 'mechanical-media',
        title: 'Mechanical Media Catches the Visible Mess',
        content:
          'Mechanical media is the net that catches what you can see: food scraps, shed skin slough, and the grit turtles grind off everything. It clogs first and works hardest, which makes its care a rhythm rather than an event. Rinse sponges in water you have already pulled from the tank, since tap water\u2019s chlorine kills off the bacteria sheltering in the foam, the same bacteria your biological layer depends on. Replace floss when it collapses rather than when it looks tired, and never replace every mechanical stage at once.',
        tips: [
          'Rinse mechanical foam in removed tank water, never in tap.',
          'Swap collapsed filter floss promptly; it cannot be rinsed back.',
          'Stagger replacements so something always keeps catching debris.',
        ],
      },
      {
        id: 'biological-media',
        title: 'Biological Media Does the Invisible Work',
        content:
          'The real purification happens invisibly. Nitrifying bacteria colonize bio-balls, ceramic rings, and matrix gravel, converting lethal ammonia into nitrite and then into comparatively harmless nitrate that your partial water changes export. That colony takes weeks to establish and minutes to poison: rinsing bio media under fresh tap, replacing all of it during a filter service, or letting it run dry in a power cut can undo months of stability. Feed the colony gently, change media in rotations at most, and keep a bottled bacteria starter on the shelf for restarts after disasters rather than relying on luck.',
        callout: {
          type: 'warning',
          title: 'Tap water kills the colony',
          text: 'Chlorinated rinse water can wipe out the bacteria that keep ammonia at zero. Always wring and rinse biological media in tank water you have removed for a change, and never let it dry out.',
        },
        tips: [
          'Swirl bio media gently in a bucket of old tank water.',
          'Rotate media replacement so most of the colony survives.',
          'Keep bottled bacteria on hand for post-disaster restarts.',
        ],
      },
      {
        id: 'chemical-media',
        title: 'Chemical Media as Occasional Polish',
        content:
          'Activated carbon sits in the third chamber and adsorbs dissolved compounds: tannins that stain the water, odors, and medication residues after a treatment course. It is polish rather than backbone, and it exhausts itself on a schedule of weeks, after which it quietly does nothing. Run it when the water needs clearing, pull it when the job is done, and never count it toward the biological capacity of the filter. Some keepers skip carbon entirely between occasions, which is a defensible simplicity.',
        tips: [
          'Replace carbon on a schedule; exhausted bags do nothing.',
          'Add carbon after medicating to pull residual compounds out.',
          'Do not lean on carbon to excuse missed water changes.',
        ],
      },
      {
        id: 'media-stack-table',
        title: 'The Media Stack at a Glance',
        content:
          'Every canister and internal filter runs some version of the same three-stage stack, and the care rules differ by stage. Mechanical rinses often and lives with clogs; biological rinses rarely and dies by chlorine; chemical expires on schedule whether or not it looks busy. The table below keeps the three straight, because confusing their care is the fastest way to crash a cycled system.',
        tableData: {
          headers: ['Media stage', 'Job', 'Care rule'],
          rows: [
            ['Mechanical foam and floss', 'Traps food, slough, grit', 'Rinse in old tank water when flow slows'],
            ['Biological rings and matrix', 'Converts ammonia to nitrate', 'Swirl gently; never chlorinated water, never all at once'],
            ['Chemical carbon', 'Adsorbs tannins and medications', 'Replace every few weeks or pull it out'],
          ],
        },
        tips: [
          'Match the care rule to the stage before touching anything.',
          'Always have spare floss; biological media waits until truly spent.',
        ],
      },
      {
        id: 'paludarium-land-layer',
        title: 'Paludariums Add a Land Layer',
        content:
          'A paludarium splits one enclosure into a water section and a land section, and the split changes the filtration arithmetic. Size the filter to the water volume alone, not the tank\u2019s total footprint, because only the wet half gets cleaned. The pump that feeds a drip wall or waterfall becomes the heart of the system, lifting water through the land section and back, so head height, the vertical distance it must push, matters more than raw flow figures. Screen the pump intake so curious frogs and shed skin do not jam it, and design the return so it cannot drain the water section during a power cut.',
        tips: [
          'Size paludarium filters to the water section alone.',
          "Check pump head height against your waterfall's climb.",
          'Screen intakes against frogs, leaves, and floating debris.',
        ],
      },
      {
        id: 'drain-and-refill',
        title: 'The Drain and Refill Reality for Big Turtles',
        content:
          'Here is the honesty no filter listing will volunteer: no filtration replaces water changes. Nitrate accumulates because nothing in a home setup exports it except the bucket you carry out, and large adult turtles, sliders at full size being the classic case, outgrow what any reasonable home filter can silently handle. The sustainable answer is partial changes on a fixed rhythm, a third to a half of the water weekly for heavy loads, run with a siphon and a nearby drain. What saves the routine from drudgery is a small utility pump: drop it in, run a hose to a drain or the garden, and the half-hour bucket procession becomes five minutes.',
        callout: {
          type: 'pro-tip',
          title: 'A pump beats the bucket',
          text: 'A small utility submersible pump and a length of hose turn an hour of hauling into minutes. Drain to the garden when the water is clean of disinfectant, refill with dechlorinated water at a matching temperature.',
        },
        tips: [
          'Anchor partial water changes to a fixed weekly rhythm.',
          'Match refill temperature to the tank before it goes in.',
          'A utility pump and hose retire the bucket procession entirely.',
        ],
      },
      {
        id: 'reading-water',
        title: 'Reading the Water Without Guessing',
        content:
          'Filters fail slowly and then suddenly, and your nose and eyes catch only the suddenly part. A liquid test kit covering ammonia, nitrite, and nitrate turns water quality into numbers you can trend: reading zero, zero, and something modest means the system works; any ammonia at all in an established tank means something broke and the animals are already paying for it. Test weekly on a steady schedule, always after filter services, and log the numbers, because a slow nitrate creep explains green water that no new gadget will fix.',
        tips: [
          'Test ammonia, nitrite, and nitrate weekly with a liquid kit.',
          'Any ammonia reading in a cycled tank needs action today.',
          'Log results; trends explain what single readings never will.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Size beyond the box',
        items: [
          { highlight: 'Ratings assume fish', text: 'turtles need two or three times the stated volume.' },
          { highlight: 'Measure real water', text: 'drawn-down levels shrink the job your filter faces.' },
          { highlight: 'Oversizing is standard', text: 'not overkill; it is the standard turtle-keeping practice.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Protect the biology',
        items: [
          { highlight: 'Old tank water only', text: 'a chlorinated rinse can erase the whole nitrifying colony.' },
          { highlight: 'Stagger every replacement', text: 'never swap all the media in one service.' },
          { highlight: 'Restart with bottled bacteria', text: 'after power cuts or medicating, rebuild the colony deliberately.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Keep the rhythm',
        items: [
          { highlight: 'Partial changes weekly', text: 'heavy turtle loads want the fuller share drained.' },
          { highlight: 'Utility pump salvation', text: 'draining with a hose beats a bucket procession.' },
          { highlight: 'Test, do not guess', text: 'ammonia, nitrite, and nitrate numbers catch failures early.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'What size filter does a turtle tank need?',
        answer:
          "Bigger than the box implies. Turtles produce far more waste than the fish those ratings assume, so keepers routinely run filters rated for double or triple the actual water volume, and heavy loads push higher still. Match the rating to your measured water, not the tank's sticker capacity, since drawn-down water levels shrink the real job.",
      },
      {
        question: 'How often should I change the water in a turtle tank?',
        answer:
          'Partial changes belong on a weekly rhythm, draining a third up to half the volume for most adult turtles, with heavy feeders or large sliders pushing toward the fuller share. Filtration stretches the interval; it never removes the chore, because nitrate only leaves in the bucket. Watch your test numbers and let them argue with the calendar when needed.',
      },
      {
        question: 'Can I use a fish tank filter for my turtle?',
        answer:
          'Often yes, with sizing discipline. Canister filters designed for aquariums do excellent turtle duty when oversized well past the stated volume, and internal foam filters work for hatchling tubs. What changes is pace: turtle waste clogs mechanical stages faster, so expect to rinse sponges more often. Read the flow rating, then assume the real workload is heavier.',
      },
      {
        question: 'Do paludariums need a filter?',
        answer:
          'Almost always, because their water sections are small for the waste they receive. The land side sheds debris downward into a limited volume, and a modest internal filter or a hidden pump loop keeps that chemistry stable. Size to the water portion alone, guard the intake against debris, and still run partial changes.',
      },
      {
        question: 'How often should I rinse my filter media?',
        answer:
          'Mechanical foam wants a rinse whenever flow slows, often every few weeks with turtles, always in removed tank water. Biological media barely ever needs touching; a gentle swish in old tank water during a major service is plenty, and never all at once. Carbon follows its own expiry of a few weeks, whether it looks busy or not.',
      },
    ],
  },

  // =========================================================================
  // REPTILE / FOOD — species honesty in feeding
  // =========================================================================
  'reptile/reptile-food': {
    heroTitle: 'Feeding Reptiles Honestly by Species and Food Type',
    heroSubheadline:
      'Insects need gut loading, snakes do best on frozen thawed rodents, herbivores want real variety, and dusting has a cadence. The species decides the menu, not habit.',
    metaDescription:
      'Reptile feeding by species: gut loading insects, switching snakes to frozen thawed rodents, variety for herbivore salads, and calcium and D3 dusting cadence.',
    introSummary:
      "Most reptile health problems trace back to the menu. The chubby bearded dragon eating only mealworms, the iguana raised on lettuce alone, the snake that will only accept live prey: each failure starts as a convenience and hardens into a habit. Feeding these animals well means taking the species seriously, loading feeder insects with food before they become food, moving snakes onto frozen thawed rodents, and building genuine variety into a herbivore's bowl. The cadence of dusting ties it together, and none of it is difficult once it is scheduled.",
    sections: [
      {
        id: 'species-lane',
        title: 'Start With What the Species Eats',
        content:
          'The first honest question is what the animal eats in the wild, and the answer sorts every species into a lane. Insectivores like leopard geckos need living prey worth chasing. Obligate carnivores like most snakes take whole prey and nothing else. Herbivores like green iguanas and most tortoises run on greens and flowers, full stop. Omnivores like bearded dragons shift the balance themselves, insects when young and mostly plants as adults. Misread the lane and no amount of product quality rescues the diet, because the chubby dragon in the opening paragraph is an omnivore being fed like an insectivore.',
        tips: [
          'Classify the species first: insectivore, carnivore, herbivore, or omnivore.',
          'Remember bearded dragons shift from insects toward plants with age.',
          'Whole prey for snakes; nothing processed belongs in the plan.',
        ],
      },
      {
        id: 'gut-loading',
        title: 'Gut Loading Makes the Insect the Meal',
        content:
          'A cricket fresh from the shop is an empty truck. Its body is mostly chitin and water until it eats, so the keeper\u2019s job is loading the cargo: offer the insects leafy greens, sliced vegetables, and a dry gut-load grain for the day or two before they enter the enclosure. Hydrate with a slice of orange or a gel rather than a water dish, which drowns crickets and fouls the container. The nutrition your gecko receives was decided in your deli cup, hours before feeding time. Dust lightly right at feeding time, because a dusted insect sheds its coating within hours.',
        callout: {
          type: 'pro-tip',
          title: 'Load for a full day minimum',
          text: 'Feed the feeders for at least twenty-four hours before offering them, and keep a small colony of loaded insects rotating so something is always ready. The last meal before the predator is the one that counts.',
        },
        tips: [
          'Load insects on greens and quality dry gut load for a day.',
          'Hydrate feeders with fruit slices or gel, never an open dish.',
          'Dust immediately before feeding; coatings wear off within hours.',
        ],
      },
      {
        id: 'frozen-thawed',
        title: 'Frozen Thawed Rodents for Snakes',
        content:
          'The responsible standard for rodent-eating snakes is prey that was frozen and is thawed for the meal, and the welfare logic runs both directions: a live rodent left unattended with a disinterested snake bites back. Thaw in the refrigerator overnight, then warm the prey in a sealed bag in warm water until it reads roughly at natural body temperature, never in a microwave, which cooks unevenly and leaves scalding pockets. Offer on long tongs with patience, and resist handling the snake for a day afterward while digestion runs. When comparing frozen rodent listings, sealed packaging beats bargain bags. A snake refusing thawed prey usually wants more scent, more warmth, or darker, quieter conditions, not a live alternative.',
        tips: [
          'Thaw rodents in the fridge, then warm in sealed bags.',
          'Never microwave prey; hidden scalding spots burn mouths.',
          'Skip handling for a day after meals while digestion works.',
        ],
      },
      {
        id: 'herbivore-variety',
        title: 'Vegetable Variety for Herbivores',
        content:
          "An herbivore's bowl is its entire diet, and monotonous bowls quietly fail. Build iguana and tortoise salads from a rotation of dark leafy greens, collard, mustard, dandelion, and endive, with grated squash, chopped vegetables, and occasional flowers. Rotate the components weekly rather than by daily whim, because variety over time smooths out nutritional gaps. Strong-flavored items like spinach and kale fit in moderation rather than as daily staples, since their oxalates and goitrogens argue against a monopoly. A tortoise's native range decides details, grassland grazers and forest browsers wanting genuinely different salads.",
        tips: [
          'Anchor salads in a weekly rotation of dark leafy greens.',
          'Treat iceberg lettuce as water; it contributes almost nothing.',
          'Feed spinach and kale in moderation, never as the base.',
        ],
      },
      {
        id: 'dusting-cadence',
        title: 'Calcium and D3 Dusting Cadence',
        content:
          'Dusting is where feeding becomes preventive care, and the cadence matters as much as the powder. Growing insectivores want lightly dusted insects at nearly every meal; healthy adults taper to a few meals a week, with the exact rhythm set by the species, the lighting it lives under, and advice from an exotics-savvy veterinarian. Use a plain calcium powder with vitamin D3 for most indoor setups, dust lightly in a swirling bag or cup, and never double-dust on the theory that more is safer, because fat-soluble vitamins accumulate rather than flush. The powder belongs on the prey minutes before feeding; shaken onto the enclosure floor it just decorates the bedding.',
        callout: {
          type: 'vet-note',
          title: 'Weak bones send early signals',
          text: 'Tremors, a soft or rubbery jaw, or a lizard that stops climbing warrant a same-week call to a reptile veterinarian. Calcium problems respond best when caught while appetite is still normal.',
        },
        tips: [
          'Dust at nearly every meal for your fast-growing juveniles.',
          'Taper adult dusting to a few meals weekly.',
          'More is not safer; fat-soluble vitamins accumulate silently.',
        ],
      },
      {
        id: 'feeding-frequency',
        title: 'Feeding Frequency by Age and Species',
        content:
          'Frequency is species arithmetic, not a fixed rule. Young insectivores eat daily or near it; their adults taper to every second or third day. A bearded dragon moves from daily insects as a juvenile toward plant-dominant meals every other day. Snakes run the slowest clock, adult pythons and corn snakes often thriving on one prey item every one to two weeks. Appetite is also a health signal worth logging: a missed meal means little, a month of refusal means the husbandry log and possibly a reptile veterinarian get involved. Record dates and portions, because memory smooths over exactly the trend a vet wants to see.',
        tips: [
          'Feed young insectivores near-daily; adults every two or three days.',
          'Adult snakes commonly eat well on a one-to-two-week clock.',
          'Log every meal; refusal trends matter more than single misses.',
        ],
      },
      {
        id: 'four-philosophies',
        title: 'One Menu, Four Feeder Philosophies',
        content:
          'The feeding plan for any species resolves into one of four philosophies, and each carries its own preparation before the bowl or tongs. The table matches the philosophy to its prep work and its honest trap, so a quick read before shopping feeders or frozen prey answers the two questions that matter: what does this animal eat, and what must happen to the food first?',
        tableData: {
          headers: ['Feeder philosophy', 'Prep before offering', 'Honest trap'],
          rows: [
            ['Live insects', 'Gut load a day, dust at feeding', 'Escaped crickets chew sleeping animals'],
            ['Frozen thawed rodents', 'Fridge thaw, warm in bag, tongs', 'Impatience pulls keepers back to live prey'],
            ['Fresh greens and vegetables', 'Rotate bases, chop to bite size', 'Monotonous salads starve quietly'],
            ['Commercial pellets', 'Use as a supplement layer', 'Convenience quietly replaces fresh food'],
          ],
        },
        tips: [
          'Name the philosophy before shopping anything for the menu.',
          'Prep work decides the nutrition; the purchase is half.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Feed by species',
        items: [
          { highlight: 'Insectivores hunt live', text: 'gut-loaded, dusted prey is the whole nutrition story.' },
          { highlight: 'Snakes take thawed', text: 'frozen rodents are the safe and storable standard.' },
          { highlight: 'Herbivores rotate greens', text: 'a varied salad base beats any single staple.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Prep the food',
        items: [
          { highlight: 'Load the truck', text: 'feeders eat greens for a day before feeding day.' },
          { highlight: 'Warm thawed prey', text: 'bagged in warm water; the microwave stays off.' },
          { highlight: 'Dust minutes before', text: 'coatings fade in hours, so dust at the moment.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Watch the signals',
        items: [
          { highlight: 'Appetite is data', text: 'log every meal; refusal trends outrank any single miss.' },
          { highlight: 'Body condition over calendar', text: 'adjust portions by shape, not by schedule loyalty.' },
          { highlight: 'Ask for help early', text: 'a month of refusal warrants a professional\u2019s eyes.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How often should I feed my bearded dragon?',
        answer:
          'Juveniles eat insects daily, sometimes twice daily through fast growth, with greens offered alongside. Adults shift the ratio: insects two or three times a week with a fresh salad available most days. The transition happens naturally as growth slows. Watch body condition rather than the calendar; a dragon filling out around the belly needs fewer feeders, not stricter timing.',
      },
      {
        question: 'Do snakes need to eat live prey?',
        answer:
          'No, and captive-bred snakes generally thrive without it. Frozen thawed rodents are the responsible standard: safer for the snake, humane for the prey, storable in bulk. Switching a live-only snake takes patience with scent and warmth cues rather than a quick fix. A refuser past a month or two deserves a conversation with a veterinarian experienced in reptile husbandry.',
      },
      {
        question: 'How do I gut load feeder insects?',
        answer:
          'Keep feeders in a clean container for a day or two with dark greens, sliced squash, and a dry gut-load grain or pellet, plus a moisture source like orange slices or hydration gel. What the insects ate is what your reptile eats, so load properly before every feeding rather than tossing in prey straight from the shop bag.',
      },
      {
        question: 'What should iguanas and tortoises eat daily?',
        answer:
          'A rotation built on dark leafy greens: collard, dandelion, mustard, and chicory as the base, with grated squash, other chopped vegetables, and occasional flowers or cactus pads for variety. Species details matter, since a grassland tortoise grazes differently from a forest species, but the base rule holds: rotate greens weekly and treat pale lettuce as water rather than food.',
      },
      {
        question: 'How often should I dust insects with calcium?',
        answer:
          'Lightly at nearly every meal for juveniles and gravid females, tapering to a few meals a week for settled adults, with the species and its lighting refining the rhythm. Dust right before feeding, since the coating wears off in hours, and never double up on the theory that more is safer; fat-soluble vitamins build up quietly.',
      },
    ],
  },
};
