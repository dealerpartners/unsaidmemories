// Feeding-and-watering family articles for Pawzsly U — the category root
// plus water bottles, nursing supplies, lick mats, fountains, food
// storage, feeding mats, bowls and dishes, and automatic feeders.
// Nine original blog bodies written to the WRITING-SPEC.md contract:
// on-topic, blog voice, at least six sections of authentic prose,
// marketplace-friendly without hard selling.
import type { ArticleBody } from './types';

export const FEEDING_ARTICLES: Record<string, ArticleBody> = {
  // =========================================================================
  // FEEDING-AND-WATERING (category root) — the feeding station as one system
  // =========================================================================
  'feeding-and-watering': {
    heroTitle: 'Setting Up a Feeding Station That Works Every Day',
    heroSubheadline:
      'Bowls, water, and placement work together. Get the height, the spot, and the schedule right, and mealtimes stop being a negotiation and start being a rhythm.',
    metaDescription:
      'Build a feeding station that fits your pet: bowl height and placement, a daily water freshness routine, and peaceful mealtimes in multi-pet households.',
    introSummary:
      "Walk through most homes and you'll find the dog bowl by the dishwasher, the cat dish on a counter somewhere, and a water bowl nobody remembers washing in a hallway corner. Each one got placed on the day it arrived, and nobody has questioned the arrangement since. Feeding works better when you treat the whole thing as one station: a bowl at a sensible height, water that gets renewed on purpose, and locations chosen for the animals doing the eating. Here is how to put that system together.",
    sections: [
      {
        id: 'one-station-not-random-bowls',
        title: 'One Station, Not Random Bowls',
        content:
          'The station idea is simple: food, water, and the floor under them form a single unit you design once and then maintain. A dog who eats in a busy doorway is working while the household streams past. A water bowl beside the litter room is asking a cat to drink where the smell is worst. When the pieces sit together in a spot chosen on purpose, cleanup gets easier too, because crumbs and splash land in one predictable zone instead of three. Station thinking also settles the gear question: whatever bowls and mats you compare in listings, they need to work as neighbors, not as strangers.',
        tips: [
          'Choose one spot for food and water, then keep it there permanently.',
          'Picture cleanup before you commit: crumbs and splash need one zone.',
          'Match bowls, mats, and water vessel as a set that fits the spot.',
        ],
      },
      {
        id: 'bowl-height-and-posture',
        title: 'Bowl Height and Comfortable Posture',
        content:
          "Height is a comfort question before it is a health question. Most dogs and cats eat happily from floor level, and a sensible default is a dish that sits roughly level with the animal's elbows, so the neck stays in a neutral, relaxed line while chewing. Tall, deep-chested dogs and stiff seniors bend a long way for every bite, and many eat more comfortably from a stand that lifts the dish a few inches. Growing puppies and kittens should keep floor-level dishes they can reach without a stretch. Watch the posture, not the packaging: hunching, stretching, or eating sideways is information.",
        tips: [
          'Aim the dish rim near elbow height so the neck stays neutral.',
          'Consider a modest stand for tall dogs and arthritic seniors.',
          'Keep growing pets on floor dishes they can reach easily.',
        ],
      },
      {
        id: 'placing-the-station-with-sense',
        title: 'Placing the Station With Sense',
        content:
          'Placement decides whether the station gets used calmly or defended nervously. Pick a quiet corner away from doorways, appliance noise, and foot traffic, because animals eat best when nothing can surprise them from behind. Cats prefer their water somewhere apart from the food dish, and well away from the litter box; their noses shape their appetites. Leave a clear line of sight and an easy exit from the eating spot, since a corner that traps a nervous cat becomes an avoided corner. In multi-animal rooms, plan stations so nobody has to pass anybody else\'s dish to reach their own.',
        tips: [
          'Skip doorways and loud appliances; meals deserve a quiet corner.',
          'Give cats water away from food and far from litter boxes.',
          'Keep an open escape route from every eating spot you set.',
        ],
      },
      {
        id: 'keeping-water-worth-drinking',
        title: 'Keeping Water Worth Drinking',
        content:
          'Water is the part of the station that fails quietly. A bowl that looks fine can carry a slick film you only notice by touching the inside wall, and animals with sensitive noses drink less from a bowl that has begun to taste like itself. The routine that works: dump, quick rinse, and refill with cool water every day, and give the bowl a proper hot scrub once a week, including the outside and the ring underneath. As you compare water bowls and fountains for your station, pick the freshness routine you will honestly keep, since a fountain trades bowl simplicity for pump maintenance.',
        callout: {
          type: 'pro-tip',
          title: 'Run a finger along the wall',
          text: "If your fingertip comes away slick, the bowl is past due. That film builds fast, and rinsing alone will not lift it once it has taken hold.",
        },
        tips: [
          'Rinse and refill water bowls daily; scrub them properly weekly.',
          'Scrub the underside too, where rings and grime settle unnoticed.',
          'Let a fountain carry the freshness job if bowls keep sliding.',
        ],
      },
      {
        id: 'feeding-several-pets-without-warfare',
        title: 'Feeding Several Pets Without Warfare',
        content:
          'Multiple animals turn one station into a map. Feed the fastest eater and the slowest eater far enough apart that nobody can hover over a neighbor\'s dish, and give the resource-conscious dog a station he can eat from without watching his back. Cats often do best fed up on a counter or shelf where the dog cannot cruise by, and that vertical station doubles as feline-only territory. If one animal finishes early and starts making house calls, pick up the empty dish instead of letting tension build. Guarding that escalates to snapping or blocking deserves a conversation with your veterinarian or a qualified trainer early.',
        callout: {
          type: 'warning',
          title: 'Take guarding seriously',
          text: 'Growling, body blocking, and snapping around dishes tend to grow without help, not fade. Get guidance early rather than punishing the growl, which is the warning you want kept intact.',
        },
        tips: [
          'Space stations so a fast finisher cannot hover over a slow eater.',
          'Feed cats up high to keep dog noses out of their dishes.',
          'Pick up empty bowls promptly when one pet clears them first.',
        ],
      },
      {
        id: 'the-rhythm-that-ties-it-together',
        title: 'The Rhythm That Ties It Together',
        content:
          'A station runs on a schedule, and animals settle quickly around predictability. Serve meals at roughly the same times daily, decide whether your household is doing set meals or measured free-feeding, and stay consistent about which one it is, because the two habits do not mix well. Pick up wet food after twenty minutes or so at room temperature, since it spoils and it teaches begging. Assign the maintenance to a rhythm you will honestly keep: bowls washed on a set day, water refreshed each morning, mat wiped after dinner. The station stays pleasant precisely because somebody owns it.',
        tips: [
          'Serve at consistent times; predictability settles anxious eaters quickly.',
          'Remove uneaten wet food after about twenty minutes.',
          'Assign dish-washing and mat-wiping days so the system survives busyness.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'map-pin',
        title: 'Map the station',
        items: [
          { highlight: 'One spot, one system', text: 'food, water, and mat designed as neighbors, not strangers.' },
          { highlight: 'Aim for elbow height', text: 'so necks stay neutral through every single bite.' },
          { highlight: 'Quiet corner placement', text: 'with open sightlines and a clear, untrapped exit.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Keep water fresh',
        items: [
          { highlight: 'Rinse every day', text: 'and give the bowl walls a real scrub weekly.' },
          { highlight: 'Trust your fingertip', text: 'slick walls mean the bowl is overdue for washing.' },
          { highlight: 'Fountains trade chores', text: 'moving water stays interesting but asks for pump upkeep.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Share the space',
        items: [
          { highlight: 'Distance prevents hovering', text: 'between a fast finisher and a careful slow eater.' },
          { highlight: 'Cats eat up high', text: 'where dogs cannot cruise past their food dishes.' },
          { highlight: 'Guarding grows quietly', text: 'body blocking and snapping deserve early help from professionals.' },
        ],
      },
    ],
    faqs: [
      {
        question: "How high should a dog's food bowl be?",
        answer:
          "For most dogs, floor level works fine, with the dish sitting at about elbow height so the neck stays relaxed. Tall dogs and stiff seniors often eat more comfortably from a stand lifting the dish a few inches. If you are considering a raised setup, the honest claims around elevated feeding are covered in our bowls article.",
      },
      {
        question: "Where should I put my cat's water bowl?",
        answer:
          'Somewhere quiet, set apart from the meals and well away from the litter box, because smell shapes a cat\'s willingness to drink. Give her an open view and a clear exit rather than a cramped corner. If she seems indifferent to still water, a fountain is worth considering, since many cats drink more when water moves.',
      },
      {
        question: "How often should I wash my pet's water bowl?",
        answer:
          'Rinse and refill daily, and give it a thorough hot scrub weekly, inside and out. The slick film that builds on bowl walls is bacterial growth, and sensitive noses notice it before you do. Dishwasher-safe bowls make the weekly job nearly effortless, which is one reason simple materials stay popular.',
      },
      {
        question: 'How do I feed a fast eater and a slow eater together?',
        answer:
          'Separate their stations across the room, or feed the slow one behind a gate or up on a surface the fast finisher cannot reach. Pick up the quick eater\'s empty dish immediately so hovering never pays off. Puzzle bowls and mats can occupy the fast one while the careful eater works in peace.',
      },
      {
        question: 'Is free-feeding okay, or should pets eat set meals?',
        answer:
          "Dogs generally do well on set meals, twice daily for most adults, and it makes monitoring appetite and weight far easier. Many cats prefer several small meals, which an automatic feeder can spread through the day. Whichever rhythm you choose, keep it steady, and ask your veterinarian how your pet's age, weight, and health should shape the plan.",
      },
    ],
    heroImageUrl: '/images/golden_portrait.jpg',
    heroImageAlt: 'A calm golden retriever at home beside its feeding station',
  },

  // =========================================================================
  // WATER BOTTLES — sipper bottles for caged and small animals
  // =========================================================================
  'feeding-and-watering/water-bottles': {
    heroTitle: 'Water Bottles for Small Pets That Actually Deliver',
    heroSubheadline:
      'A sipper bottle is the quiet appliance of cage life. Learn how the ball bearing works, where to hang it, and how to keep it flowing in January.',
    metaDescription:
      'Sipper water bottles for rabbits, guinea pigs, and hamsters: ball-bearing flow checks, mounting height, winter freeze plans, and the bottle-versus-bowl trade.',
    introSummary:
      'Ever filled a bottle, hung it back on the wire, and wondered whether the animal on the other side is actually getting a drink? Cage life runs on this one small device, and it fails in ways a bowl never can: quietly, invisibly, and on the hottest or coldest day of the year. Between the ball bearing, the mounting height, and the way winter treats plastic, there is real craft here. A bottle you check daily, though, is among the most reliable pieces of husbandry gear you will ever hang.',
    sections: [
      {
        id: 'why-caged-animals-drink-from-bottles',
        title: 'Why Caged Animals Drink From Bottles',
        content:
          'A bottle keeps water off the floor of the enclosure, which matters more than it sounds. Rabbits and guinea pigs flip dishes, hamsters shovel bedding into everything, and a soaked floor invites chill and foot trouble along with a sour smell. The tube also keeps the water itself clean: no shavings floating in it, no hay dust, no paw washing. You can read the level at a glance through the wall of a clear bottle, which turns hydration from a guess into a daily observation. None of this makes bowls wrong; it makes bottles the practical default for animals who live on litter.',
        tips: [
          'Expect tipped dishes and soaked litter with bowls, especially from rabbits.',
          'Read the fill line daily; it is your hydration gauge.',
          'Choose clear-walled bottles so levels are visible at a glance.',
        ],
      },
      {
        id: 'how-the-ball-bearing-earns-its-job',
        title: 'How the Ball Bearing Earns Its Job',
        content:
          'The mechanism is beautifully simple: a stainless ball sits in the nozzle, held by gravity against a seat, and the vacuum inside the sealed bottle keeps the water column from running out on its own. When the animal licks, the ball shifts, air sneaks past it, and a little water follows the tongue. That is also the whole list of ways it can jam. A ball stuck to its seat with debris seals the tube. A poor seal after a refill lets air in and the bottle gurgle-drains onto the floor overnight. Understanding the mechanism makes every later troubleshooting step obvious.',
        tips: [
          'Refill with the tube upright and sealed, or air locks follow.',
          'A slow drip after refilling usually means the seal needs reseating.',
          'Rinse debris from the nozzle whenever you refill.',
        ],
      },
      {
        id: 'checking-flow-before-you-trust-it',
        title: 'Checking Flow Before You Trust It',
        content:
          'Give every newly mounted bottle a fingertip test before the animal depends on it. Press the ball inward and release: a working nozzle lets a few drops escape, then stops. Then run a marker line at the day\'s starting level and check back in the evening; a bottle nobody is drinking from stays suspiciously full. Do the same test after every refill for the first week with a new animal, because some individuals lick so gently the movement is easy to miss. A bottle that passes both checks, flow and falling level, has earned the trust of a weekend away.',
        callout: {
          type: 'warning',
          title: 'Full bottle, dry animal',
          text: 'The dangerous failure is not the leak, which you will see, but the silent jam, which you will not. An animal that stops drinking often eats less within a day or two, so a full bottle beside an untouched dish of food is a same-day reason to call an exotics-savvy veterinarian.',
        },
        tips: [
          'Press the ball and release; a few drops should escape, then stop.',
          'Mark the starting level and confirm it falls by evening.',
          'Treat a full bottle beside untouched food as an urgent sign.',
        ],
      },
      {
        id: 'mounting-height-that-fits-the-animal',
        title: 'Mounting Height That Fits the Animal',
        content:
          "Hang the nozzle where the animal's posture stays natural: standing comfortably, head level, taking water with a slight downward tilt of the nose. Too low and a large rabbit crouches awkwardly; too high and a young hamster strains on hind legs, and animals that must stretch stop bothering. A practical rule is spout tip at about the animal's shoulder line, then adjusted for the smallest individual sharing the enclosure. Juveniles grow fast, so recheck the hang every couple of weeks through the growing months. When you compare bottle listings, favor hangers that adjust without tools, because the right height keeps moving.",
        tips: [
          'Set the spout tip near shoulder height for a natural stance.',
          'Rehang bottles every couple of weeks while young animals grow.',
          'Add a second bottle on upper levels of tall enclosures.',
        ],
      },
      {
        id: 'winter-and-the-frozen-bottle-problem',
        title: 'Winter and the Frozen Bottle Problem',
        content:
          'Freezing splits plastic bottles and locks the ball solid in its seat, which turns a water source into a decoration. In hard frost, plan on checking twice a day and swapping in a bottle of tepid water from indoors; carrying two bottles and rotating them is easier than it sounds. Insulating sleeves help between checks, and hanging the bottle on an interior wall of the hutch, away from wind, buys hours. Warm the plastic gradually, never with boiling water, because a frozen bottle cracked by sudden heat fails exactly when you need it. Outdoor rabbits depend on this diligence all winter.',
        tips: [
          'Rotate two bottles daily through hard frost, warming one indoors.',
          'Hang bottles on interior hutch walls shielded from wind.',
          'Warm frozen plastic slowly; sudden heat cracks the seams.',
        ],
      },
      {
        id: 'bottle-versus-bowl-trade-offs',
        title: 'Bottle Versus Bowl Trade-Offs',
        content:
          'Neither option wins outright, which is why experienced keepers often run both and let the animal choose. A bottle suits deep litter and busy days; a crock suits species that drink with relish and handlers who wash dishes daily. The table lays the trade-offs side by side so you can match the equipment to your setup rather than to habit.',
        tableData: {
          headers: ['Consideration', 'Sipper bottle', 'Heavy bowl'],
          rows: [
            ['Bedding stays dry', 'Yes, drips stay near the nozzle', 'No, tipped dishes soak the litter'],
            ['Drinking posture', 'Slightly unnatural, head tilted up', 'Natural, head down like a stream'],
            ['Failure you notice', 'Silent: a jammed ball looks fine', 'Obvious: spills and empty dishes'],
            ['Cleaning effort', 'Weekly brush down the tube', 'Quick daily rinse and wash'],
          ],
        },
        tips: [
          'Run bottle plus crock for animals with a dehydration scare in their history.',
          'Match the choice to your litter depth and your daily routine.',
          'Prefer bowls for animals strong enough to shove tubes around.',
        ],
      },
      {
        id: 'washing-bottles-without-missing-the-tube',
        title: 'Washing Bottles Without Missing the Tube',
        content:
          'Milk film, algae, and mineral scale all collect where brushes struggle, which means the tube and the cap gasket deserve most of your attention. Once a week, take the whole assembly apart and scrub the reservoir with a long bottle brush and the nozzle with a narrow tube brush; a cotton ball poked through the tube polishes the ball seat. Sunlight turns clear plastic green with algae over a season, so store bottles out of direct sun between uses. Rinse detergent until nothing foams, because animals taste soap at concentrations you cannot. Listing comparisons are fair game here: designs that come fully apart are easier to keep honest.',
        callout: {
          type: 'pro-tip',
          title: 'Buy the brush with the bottle',
          text: 'A tube brush costs almost nothing and is the difference between a clean nozzle and a rinsed one. Add it to the same order; future-you will be grateful every Sunday.',
        },
        tips: [
          'Scrub reservoirs weekly with a long brush, tubes with a narrow one.',
          'Store clear bottles out of sunlight to slow algae growth.',
          'Rinse until no foam remains; animals taste soap you cannot.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Trust the flow',
        items: [
          { highlight: 'Press and release', text: 'a working ball lets a few drops escape.' },
          { highlight: 'Watch the level', text: 'mark a morning line and confirm it falls.' },
          { highlight: 'Silent jams deceive', text: 'a full bottle can still mean a dry animal.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Winter rotation',
        items: [
          { highlight: 'Two bottles alternate', text: 'one warms indoors while the other serves the pen.' },
          { highlight: 'Sheltered interior walls', text: 'buy crucial hours of protection from overnight frost.' },
          { highlight: 'Warm plastic slowly', text: 'sudden heat cracks frozen seams at the worst moment.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Clean the hidden parts',
        items: [
          { highlight: 'Weekly full disassembly', text: 'reservoir, cap, gasket, and nozzle all get brushed.' },
          { highlight: 'Sunlight grows algae', text: 'store clear bottles in the shade between uses.' },
          { highlight: 'Foam means keep rinsing', text: 'animals taste detergent residue long before people can.' },
        ],
      },
    ],
    faqs: [
      {
        question: "How do I know if my small pet's water bottle is working?",
        answer:
          'Press the ball in with a fingertip and let it spring back; a working nozzle releases a few beads of water. Then mark the level and confirm it drops through the day. A bottle holding the same level for two days while food disappears points to a jam, not low thirst.',
      },
      {
        question: 'How high should a water bottle be hung?',
        answer:
          'Roughly at shoulder height of the smallest animal using it, so the stance stays natural and the nose tips only slightly downward. Rats, ferrets, and young rabbits each sit differently, so watch the posture rather than trusting a number. Recheck the height every few weeks while babies are growing.',
      },
      {
        question: 'Can rabbits and guinea pigs use water bowls instead?',
        answer:
          'Many do, and some drink more from a crock because the posture is natural. The costs are practical: tipped dishes, soaked bedding, and daily washing. A heavy ceramic crock bolted or weighted against flipping, refilled morning and evening, works well; many keepers simply offer both and let the animal decide.',
      },
      {
        question: 'How do I keep water bottles from freezing in winter?',
        answer:
          'Rotate two bottles, swapping a tepid one from indoors morning and night, and hang them on sheltered interior walls. Insulating covers add hours between checks. Avoid boiling water, which cracks frozen plastic, and check twice daily in a real cold snap, since a frozen ball seals the tube silently.',
      },
      {
        question: 'How often should water bottles be cleaned?',
        answer:
          'Rinse at every refill, and do a full disassembly and scrub weekly with a bottle brush and a tube brush, gasket included. Algae and slime collect in the nozzle first, where the brush struggles most. If the reservoir stays slimy after a proper scrub, the plastic is scratched past its prime and deserves replacing.',
      },
    ],
  },

  // =========================================================================
  // NURSING SUPPLIES — bottle-feeding orphaned kittens and puppies
  // =========================================================================
  'feeding-and-watering/nursing-supplies': {
    heroTitle: 'Bottle-Feeding Orphaned Kittens and Puppies Well',
    heroSubheadline:
      'A nursing kit turns you into the mother. Nipple flow, sterilization, formula temperature, and the slow road from bottle to dish, handled with steady hands.',
    metaDescription:
      'Bottle-feeding orphaned kittens and puppies: getting nipple flow right, sterilizing between feeds, warming formula safely, and weaning onto shallow dishes.',
    introSummary:
      'The call comes at a bad hour: a litter with no mother, a rescue with a box of newborns, and suddenly you are the warmest thing in the room. Nursing these babies is equal parts tenderness and logistics. The gear is simple, a few small bottles, soft nipples, species-correct formula, and a scale, but each piece carries rules that matter. Flow rate decides whether a baby feeds or aspirates; temperature decides whether they accept the bottle at all. Here is the sequence, feed by feed.',
    sections: [
      {
        id: 'when-a-bottle-becomes-the-kitchen',
        title: 'When a Bottle Becomes the Kitchen',
        content:
          'Motherless babies arrive through shelters, barn accidents, and the occasional heartbreaking handoff, and the first move is the same every time: get experienced eyes on them. A veterinarian visit in the first day, plus a call to a local rescue or wildlife-licensed rehabilitator where appropriate, sets the feeding plan, checks for dehydration and chill, and tells you whether the animal is old enough for your help to be enough. Newborns need round-the-clock feeds; a four-week-old mostly needs a bottle a few times a day and a road to solid food. Age changes everything.',
        tips: [
          'Have a veterinarian assess any orphan within the first day.',
          'Call rescues or licensed rehabilitators for wild-born babies.',
          'Age sets the schedule; newborns mean feeds around the clock.',
        ],
      },
      {
        id: 'assembling-the-nursing-kit-honestly',
        title: 'Assembling the Nursing Kit Honestly',
        content:
          "A workable kit is small: nursing bottles sized for kittens or puppies, a few spare nipples because they tear and get lost, a canister of milk-replacement formula in the right species version, a kitchen scale that reads in grams, and brushes narrow enough to clean the bottle interiors. Two details separate a good kit from a frustrating one. Check that the formula matches the species, since kitten and puppy replacements differ, and never substitute cow's milk from the fridge, which scours young stomachs. As you compare nursing kits in listings, favor the ones that include cleaning brushes.",
        tips: [
          'Weigh babies daily on a gram scale; grams reveal problems early.',
          'Stock spare nipples; they tear, clog, and vanish without warning.',
          'Use species-correct milk replacement, never milk from the fridge.',
        ],
      },
      {
        id: 'nipple-flow-rate-makes-or-breaks-feeds',
        title: 'Nipple Flow Rate Makes or Breaks Feeds',
        content:
          'Turn a filled bottle upside down before any feed and watch the nipple. A well-opened one releases a slow, steady drip, one drop following another. A stream means the hole is too generous, and a baby forced to gulp can inhale milk into the lungs. Nothing at all means the hole is too tight, and frustrated nursers swallow air and give up before they have taken enough. Nipples often arrive with closed tips that you open yourself, so follow the kit instructions for piercing, then retest by inversion after each adjustment. A few minutes of checking prevents the scariest complication of nursery work.',
        tips: [
          'Invert the filled bottle; a slow steady drip is correct.',
          'A stream means the opening is too large; start over fresh.',
          'Retest the drip after every piercing adjustment you make.',
        ],
      },
      {
        id: 'sterilizing-between-every-single-feed',
        title: 'Sterilizing Between Every Single Feed',
        content:
          'Milk is a culture medium, and a bottle that sits unwashed between feeds becomes a bacterial delivery system. After each feeding, rinse the bottle and nipple in warm water, wash them in hot soapy water with a dedicated brush, and let them air dry on a clean towel rather than in a damp sink. Once a day, go further and boil the nipple and bottle for a few minutes, or run them through the sterilizing routine the kit instructions describe. Wash your hands before every feed without exception. In a nursery working correctly, the cleanup takes longer than the feeding, and that is normal.',
        callout: {
          type: 'warning',
          title: 'Milk from the nose is an emergency',
          text: "If formula bubbles from a baby's nose during or after a feed, stop feeding, keep the little one warm and still, and call your veterinarian immediately. Milk in the airways can turn serious fast.",
        },
        tips: [
          'Wash bottle and nipple in hot soapy water after every feed.',
          'Boil or sterilize the parts once a day, per kit instructions.',
          'Air dry parts on a clean towel, never in a damp sink.',
        ],
      },
      {
        id: 'formula-temperature-and-warming-sense',
        title: 'Formula Temperature and Warming Sense',
        content:
          'Formula goes down best at body warmth, and the wrist test borrowed from human babies works perfectly: shake a drop onto the inside of your wrist, and it should feel like nothing at all, neither warm nor cool. Warm the mixed formula in a cup of hot water, never in a microwave, which creates scalding pockets that no shaking fully evens out. Mix only what the litter will take at a sitting, since reheated leftovers invite bacterial growth. A baby that turns away from a bottle is often refusing a temperature, not the formula, so check warmth before concluding anything about appetite.',
        tips: [
          'Test formula on your inner wrist; it should feel neutral.',
          'Warm bottles in a water bath, never a microwave.',
          'Mix per sitting and discard leftovers rather than reheating.',
        ],
      },
      {
        id: 'holding-them-while-they-feed',
        title: 'Holding Them While They Feed',
        content:
          'Posture is safety. Babies nurse belly-down, the way they would against their mother, never cradled on their backs like human infants, because milk runs the wrong way and enters the airway. Support the chest and head with a folded towel, hold the bottle at a shallow angle so the nipple stays full, and let the baby set the pace, suckling in bursts with pauses for breathing. If the nipple collapses, ease the bottle away briefly to let air back in. Afterward, kittens in particular need gentle stimulation to eliminate, a warm damp cotton ball doing the job their mother\'s tongue would have done.',
        tips: [
          'Feed belly-down on a towel, never cradled on the back.',
          'Keep the nipple full by holding the bottle at a shallow angle.',
          'Stimulate kittens with a warm damp cotton ball afterward.',
        ],
      },
      {
        id: 'the-weaning-path-from-nipple-to-dish',
        title: 'The Weaning Path From Nipple to Dish',
        content:
          'Around the fourth week, teeth and wobbly curiosity announce the transition. Begin with a gruel, formula stirred into wet food until it laps like thick cream, offered in a shallow saucer. Dip a fingertip, let the baby lick it, then lead the finger down to the saucer; most catch on within days, wearing as much as they swallow. Thicken the mixture across the following weeks while tapering bottle feeds, and offer the saucer at every session so the skill becomes a habit. Keep weighing throughout, because the scale, not enthusiasm, confirms the transition is working. When you browse weaning saucers in our marketplace, low sides and honest weight matter more than decoration.',
        tips: [
          'Start gruel near four weeks with teeth and curiosity as cues.',
          'Lead with a dipped fingertip down to the saucer.',
          'Keep daily weigh-ins through weaning to confirm real intake.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'heart',
        title: 'Nurse with care',
        items: [
          { highlight: 'Babies feed belly-down', text: 'never on the back; milk must travel the safe way.' },
          { highlight: 'Wrist-test the warmth', text: 'a neutral drop means the formula is ready.' },
          { highlight: 'Slow steady drip', text: 'from an inverted nipple is exactly the goal.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Keep the kit sterile',
        items: [
          { highlight: 'Wash after feeds', text: 'hot soapy water and a brush, every single time.' },
          { highlight: 'Daily boiling cycle', text: 'for nipples and bottles, following the kit instructions.' },
          { highlight: "No cow's milk", text: 'species-correct formula only, mixed up fresh per sitting.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Wean on schedule',
        items: [
          { highlight: 'Teeth signal readiness', text: 'around four weeks, offer thin gruel in a saucer.' },
          { highlight: 'Thicken and taper', text: 'across the following weeks, cutting bottle feeds gradually.' },
          { highlight: 'Weigh every day', text: 'the scale confirms the messy transition is working.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'What temperature should kitten or puppy formula be?',
        answer:
          'Warm it to body temperature and confirm with the inside of your wrist, where a correct drop feels neutral, neither warm nor cool. Use a hot-water bath rather than a microwave, which creates scalding pockets. Babies refuse bottles that are even slightly cool, so temperature is usually the reason for a sudden strike.',
      },
      {
        question: 'How do I know if the nipple hole is the right size?',
        answer:
          'Invert the full bottle and watch: a proper nipple drips slowly and steadily, while a stream is too fast and silence is too slow. Fast flow risks milk entering the lungs; slow flow frustrates the baby into gulping air. Adjust, or start over with a fresh nipple, then retest by inversion before feeding.',
      },
      {
        question: "Can I feed orphaned kittens cow's milk?",
        answer:
          "No. Cow's milk has the wrong fat and protein balance for kittens and puppies, and it commonly causes diarrhea and bloating at an age when dehydration turns dangerous fast. Use a commercial milk-replacement formula made for the species, mixed per label directions. If no kit is available tonight, ask a veterinarian or rescue for a stopgap until proper formula arrives.",
      },
      {
        question: 'When can kittens start weaning off the bottle?',
        answer:
          'Most begin around four weeks, when teeth arrive and interest in your food becomes hard to ignore. Start with a thin gruel of formula and wet food in a shallow saucer, thickening it over two or three weeks as bottle feeds taper. Daily weights tell you whether the changeover is actually feeding them.',
      },
      {
        question: 'How do I sterilize nursing bottles between feeds?',
        answer:
          'Rinse and wash in hot soapy water after every feed, air dry on a clean towel, and boil the parts once daily or follow the sterilizing steps in the kit instructions. Never let used formula sit in the bottle between feeds, because it curdles and grows bacteria. Keep a rotating pair so one dries while one serves.',
      },
    ],
  },

  // =========================================================================
  // LICK MATS — enrichment, distraction, and slow soft-food feeding
  // =========================================================================
  'feeding-and-watering/lick-mats': {
    heroTitle: 'Lick Mats for Calmer Baths, Nail Trims, and Suppertime',
    heroSubheadline:
      'A textured square of silicone, a smear of something delicious, and a dog who suddenly has somewhere better to put his attention. Simple tool, real uses, few honest limits.',
    metaDescription:
      'Lick mats for enrichment and calm: suction that holds, safe spreads, the freezer trick, bath-time and nail-trim duty, and cleaning that keeps them worth it.',
    introSummary:
      'The mistake most people make with lick mats is treating them as a novelty gift that gets one amazed social-media moment and then lives in the drawer. In practice they are tools with specific jobs: occupying a tongue so a bath can happen, stretching a soft snack into a long quiet project, giving a teething puppy something cold to work on. The details that decide whether it works are simple ones, how well it grips, what you spread, and how easily it washes.',
    heroImageUrl: '/images/golden_portrait.jpg',
    heroImageAlt: 'A calm golden retriever resting at home between activities',
    sections: [
      {
        id: 'what-a-lick-mat-is-actually-for',
        title: 'What a Lick Mat Is Actually For',
        content:
          'Licking is a settling behavior for dogs; the repetitive motion gives a busy mind one job to do, which is why a smear of food can drop a restless animal from pacing to lying down mid-activity. That makes the mat a distraction tool first and an enrichment toy second. It suits the moments when stillness is required from a creature built for motion: the bath, the nail trim, the ear cleaning, the thunderstorm. It is not exercise, and it does not replace walks or training. But as a way to buy focused minutes of cooperation, it pulls weight far beyond its price.',
        tips: [
          'Reach for the mat whenever stillness is required from a busy animal.',
          'Pair it with handling moments like ears, nails, and baths.',
          'Treat it as a distraction tool, not a walk substitute.',
        ],
      },
      {
        id: 'getting-the-suction-to-hold',
        title: 'Getting the Suction to Hold',
        content:
          'Suction is the difference between a mat that stays through a whole nail trim and one that skates away in the first seconds. Clean, smooth, non-porous surfaces grip best: the tub wall, glazed tile, the refrigerator door. Press firmly from the center outward to chase the air out, and give it a testing tug before you spread anything, because a marginal grip only gets worse as the surface dampens. Textured tile and wood defeat suction cups entirely; on those floors, use the mat flat with a nonskid backing and accept a sliding compromise.',
        tips: [
          'Press from the center outward to chase trapped air out.',
          'Give every mounted mat a firm testing tug before spreading food.',
          'Accept flat placement on textured tile, where suction fails.',
        ],
      },
      {
        id: 'choosing-spreads-that-deserve-trust',
        title: 'Choosing Spreads That Deserve Trust',
        content:
          'The safe list is longer than most people expect: wet pet food, plain canned pumpkin, mashed banana, a thin smear of peanut butter, and a little plain cooked sweet potato. Two cautions keep it safe. First, lactose: many dogs handle a small spoonful of plain yogurt, and many do not, so introduce it in tiny amounts and skip it entirely for sensitive stomachs. Second, sweeteners: some peanut butter brands include xylitol, which is acutely toxic to dogs, so read the ingredient panel every single time you buy a jar. The same rule extends to anything spreadable you are considering in the pet aisle.',
        callout: {
          type: 'warning',
          title: 'Xylitol is not a small risk',
          text: 'Check the label on every jar of peanut butter and every spreadable snack before it touches the mat. Xylitol, also called birch sugar, can send a dog into crisis within hours. If you suspect your dog ate some, get your veterinarian or an emergency clinic on the phone right away.',
        },
        tips: [
          'Spread wet food, plain pumpkin, banana, or sweet potato.',
          'Introduce yogurt in tiny amounts; many dogs lack lactose tolerance.',
          'Read peanut butter labels every time for xylitol, every jar.',
        ],
      },
      {
        id: 'the-freezer-trick-and-teething-pups',
        title: 'The Freezer Trick and Teething Pups',
        content:
          'Freeze whatever you spread and the job triples in length: what vanished in a minute of enthusiastic licking now takes a slow, patient scrape that keeps a tongue busy through a whole grooming session. Teething puppies get relief from the cold against sore gums, and on hot afternoons a frozen mat is a small kindness. Spread, freeze flat on a sheet pan or a plate, and hand it over. Frozen foods thaw unevenly, so offer frozen mats only under supervision, and remember the freezer is a duration tool, not a storage plan; what goes in frozen should come out within the week.',
        tips: [
          'Freeze spread mats flat on a plate before serving.',
          'Offer frozen mats under supervision as they thaw unevenly.',
          'Give teething puppies the cold version for gum relief.',
        ],
      },
      {
        id: 'baths-nail-trims-and-other-ordeals',
        title: 'Baths, Nail Trims, and Other Ordeals',
        content:
          'The technique is straightforward: stick the loaded mat to the tub wall or the tile at nose height, before the stressful event starts, and let the licking buy you the window. Introduce the mat on a calm day first, with nothing scary happening, so it becomes a familiar pleasure rather than part of the ordeal. Keep sessions short while you build trust, and stay honest about limits: a dog too frightened to eat is not going to be bribed through his fear, and that level of anxiety deserves a slower training plan and your veterinarian\'s input on handling stress.',
        tips: [
          'Introduce the mat on a calm day before the first bath.',
          'Mount it at nose height before the stressful event begins.',
          'A dog refusing food is too stressed; slow down and reassess.',
        ],
      },
      {
        id: 'washing-them-without-losing-patience',
        title: 'Washing Them Without Losing Patience',
        content:
          'Food lodges in every texture ridge by design, and a mat that waits a day becomes a scrubbing chore nobody wants. Rinse immediately after use while the smear is still soft, then either run it through the dishwasher\'s top rack if the listing promises that, or scrub the grooves with a stiff brush in hot water. Dry it completely before it goes back in the drawer, because a damp mat rolled into storage grows exactly what you imagine. Mats with simpler, shallower textures clean faster but hold less food, a trade you will feel every single time you wash one.',
        tips: [
          'Rinse while the spread is soft; dried smears become chores.',
          'Top-rack the mat if its listing allows dishwasher use.',
          'Dry fully before storing to keep mold out of the grooves.',
        ],
      },
      {
        id: 'sizing-materials-and-honest-limits',
        title: 'Sizing, Materials, and Honest Limits',
        content:
          'Most mats are food-grade silicone in a few sizes, and sizing follows the dog more than the texture: a large breed needs real estate for a wide tongue, while a small dog or cat works a compact square happily. Check that the material is described as safe for food, since it holds meals, and treat edge curling or permanent staining as a sign the mat is retiring. Limits worth naming: power chewers eventually destroy any mat, so supervise use and take it up once the food is gone. A flat mat also slows a soft-food meal for gulpers, which makes it a gentle cousin of slow-feeder bowls, without replacing them.',
        tips: [
          'Size the mat to the tongue; big dogs need big real estate.',
          'Look for food-safe material since the mat holds meals.',
          'Supervise enthusiastic chewers and remove the emptied mat promptly.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'sparkles',
        title: 'Put it to work',
        items: [
          { highlight: 'Grip before you smear', text: 'press outward, then tug-test every mounted mat properly.' },
          { highlight: 'Introduce on calm days', text: 'make the mat a familiar pleasure before the first bath.' },
          { highlight: 'Mount at nose height', text: 'in the tub keeps heads still during rinsing.' },
        ],
      },
      {
        icon: 'check',
        title: 'Spread safely',
        items: [
          { highlight: 'Plain pumpkin and banana', text: 'plus wet food, anchor the safe spreading list.' },
          { highlight: 'Yogurt needs testing', text: 'lactose disagrees with many dogs in actual practice.' },
          { highlight: 'Xylitol ends the party', text: 'read every peanut butter label, every single time.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Clean immediately',
        items: [
          { highlight: 'Rinse while soft', text: 'dried smears turn into scrubbing chores very fast.' },
          { highlight: 'Dry before storing', text: 'a damp rolled mat invites mold into the grooves.' },
          { highlight: 'Freezer buys minutes', text: 'frozen spreads stretch quick snacks into long projects.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Are lick mats good for anxious dogs?',
        answer:
          'They help with busy, restless energy, because repetitive licking gives a wound-up dog a single calming job. They will not carry a dog through genuine panic; an animal too frightened to eat is past what food can fix. For storm nerves and mild fussiness they are a lovely support, and your veterinarian can help with anything deeper.',
      },
      {
        question: 'What can I safely spread on a lick mat?',
        answer:
          'Plain canned pumpkin, mashed banana, wet dog or cat food, and a thin smear of xylitol-free peanut butter are the classics. Plain yogurt suits some dogs in small amounts, but lactose disagrees with others, so test gently. Cats do well with their own wet food spread thin. Skip anything spiced, salted, or sweetened for people.',
      },
      {
        question: 'Can lick mats go in the dishwasher and freezer?',
        answer:
          'Most food-grade silicone mats handle both, but the listing is the authority, since construction varies. Freeze the loaded mat flat on a plate, and wash it on the top rack away from the heating element. If hand washing, scrub the texture grooves with a stiff brush and let the mat dry completely before storage.',
      },
      {
        question: 'How do I get a lick mat to stick in the tub?',
        answer:
          'Clean the spot first, press the mat from its center outward to push the air out, and run a testing tug before loading it with food. Smooth tile and tub walls grip best; textured finishes defeat suction. If the wall refuses, offer the mat flat on the tub floor with a nonskid mat underneath.',
      },
      {
        question: 'Do lick mats actually slow down eating?',
        answer:
          'For soft foods, yes, and that is half their charm. A flat surface with texture ridges makes a tongue work for every gram, stretching a spoonful of wet food into a patient project. For kibble gulpers, they do little; the right tool there is a maze-style slow feeder bowl, a different piece of equipment entirely.',
      },
    ],
  },

  // =========================================================================
  // FOUNTAINS — why moving water matters and how to keep one running
  // =========================================================================
  'feeding-and-watering/fountains': {
    heroTitle: 'Pet Water Fountains and Why Cats Prefer Moving Water',
    heroSubheadline:
      'Cats come from desert hunters with a famously weak urge to drink. Moving water works with that instinct, and a well-kept fountain earns its counter space.',
    metaDescription:
      'Why moving water tempts cats, what fountain filters really do, how often the pump needs cleaning, and where to place it so everyone drinks more water.',
    introSummary:
      'Cats descend from desert hunters that got most of their moisture from prey, and a strong thirst drive never developed along the way. A house cat eating dry food carries that inheritance into a home full of standing bowls, and many drink just barely enough. Moving water tips the balance because it reads as fresher and safer to a cautious feline. The fountain works with that instinct, provided the pump gets cleaned, the filter gets changed, and the whole thing sits somewhere a cat wants to stand.',
    heroImageUrl: '/images/orange_cat.jpg',
    heroImageAlt: 'An orange tabby cat resting calmly indoors near its water',
    sections: [
      {
        id: 'a-low-thirst-drive-inherited-from-deserts',
        title: 'A Low Thirst Drive Inherited From Deserts',
        content:
          'The inheritance shapes behavior you can watch. Many cats will not drink from a bowl beside their food, prefer to find water in another room entirely, and show obvious interest in a dripping tap while ignoring their dish. Wild felines historically met most fluid needs through prey, so seeking water was optional, and standing water, which stagnates in nature, earned sensible suspicion. Movement signals freshness to that ancient checklist. Aging cats and those with kidney concerns have the most riding on hydration, so if drinking has picked up or dropped off noticeably, check with your veterinarian, since thirst changes carry real information.',
        tips: [
          'Expect cats to snub water bowls sitting beside food dishes.',
          'Notice drips and taps; movement genuinely attracts feline attention.',
          'Report clear changes in drinking habits to your veterinarian.',
        ],
      },
      {
        id: 'what-the-filter-is-really-doing',
        title: 'What the Filter Is Really Doing',
        content:
          'Most fountain filters do two jobs, and neither is purification. A mesh or foam prefilter strains out hair and food crumbs before they reach the pump, which is protection for the machine. A carbon pad behind it absorbs some of the tastes and odors that accumulate in recirculated water, keeping the flavor bland in the way cats prefer. Neither component removes minerals, bacteria, or anything a household pitcher filter would catch, so the fountain is only as fresh as your refill routine. Carbon saturates on a schedule, and a spent pad quietly stops working, which is why the replacement interval in the listing matters more than the pad\'s thickness.',
        tips: [
          'Rinse the mesh prefilter weekly under running water.',
          'Change carbon pads on the interval the listing states.',
          'Expect flavor trimming, not purification, from fountain filtration.',
        ],
      },
      {
        id: 'pump-cleaning-cadence-without-drama',
        title: 'Pump Cleaning Cadence Without Drama',
        content:
          'The pump is the part that decides whether a fountain lasts years or months. Every week or two, depending on how many animals share it, unplug the unit, lift the pump out, and open it: the impeller, a small spinning rotor, pulls off its shaft, and you will usually find a wrapping of hair that explains any recent noise. Brush the housing and the rotor with an old toothbrush, soak mineral-crusted parts in diluted white vinegar, rinse everything thoroughly, and reassemble. The first teardown takes ten minutes of squinting; the third takes two minutes of habit.',
        callout: {
          type: 'pro-tip',
          title: 'Vinegar for scale, patience for hair',
          text: 'A short soak in diluted white vinegar dissolves the mineral crust that slows impellers. Hair, though, needs fingers or fine tweezers, since it winds tightly around the shaft and laughs at brushes.',
        },
        tips: [
          'Unplug before every teardown, without exception, every time.',
          'Pull the impeller off its shaft and unwind trapped hair.',
          'Soak crusted parts in diluted vinegar, then rinse completely.',
        ],
      },
      {
        id: 'reading-the-sounds-a-fountain-makes',
        title: 'Reading the Sounds a Fountain Makes',
        content:
          'Fountains talk, and the vocabulary is small. A low steady hum is a healthy pump doing its job, and most households stop hearing it within days. A gargling or slurping sound means the reservoir has dropped low enough for the pump to swallow air, and a top-up silences it in seconds. A rattling or grinding noise means the impeller is fighting hair or scale, and the cleaning routine is due. Placement changes the volume: a unit sitting bare on tile or inside a hard corner acts like an amplifier, while a silicone mat or a folded towel underneath absorbs the vibration.',
        tips: [
          'Answer gargling with a top-up before the pump runs dry.',
          'Treat rattle as a cleaning reminder for the impeller.',
          'Muffle vibration with silicone or a towel under the base.',
        ],
      },
      {
        id: 'placement-that-invites-drinking',
        title: 'Placement That Invites Drinking',
        content:
          'The best spot is quiet, visible, and smells like nothing in particular. Cats drink more when the fountain stands apart from the food dish and far from the litter box, with a wall behind for security and a clear view of the room ahead, so nothing can ambush them mid-sip. Dogs bring different rules: give the splash zone a washable mat, and keep the cord routed where paws and tails cannot trip it, with a drip loop so water never travels toward the outlet. In busy kitchens, a low corner away from the dishwasher\'s racket serves everyone better than prime counter space.',
        tips: [
          'Stand fountains apart from food and far from litter areas.',
          'Give cats a wall behind them and a view ahead.',
          'Route cords safely and let the drip loop hang low.',
        ],
      },
      {
        id: 'the-weekly-upkeep-rhythm',
        title: 'The Weekly Upkeep Rhythm',
        content:
          'Once a week, the whole fountain comes to the sink: dump the reservoir, scrub the walls and any nooks with hot water and a soft brush, wash every piece the water touches, and refill with fresh, cool water before reassembling. Between scrubs, top the reservoir daily, since a full tank keeps the pump submerged and the water tasting new. Once a month, give the pump the full teardown described above even if it sounds fine. When you compare models in listings, count the parts you will be washing every single week; enthusiasm at purchase becomes Tuesday-evening math fast enough.',
        callout: {
          type: 'vet-note',
          title: 'Thirst changes are worth reporting',
          text: 'A cat suddenly drinking far more, or a dog leaving the fountain untouched, can be signaling kidney, endocrine, or dental trouble. Note the change, then bring it to your veterinarian instead of waiting it out.',
        },
        tips: [
          'Dump and scrub the full reservoir weekly in the sink.',
          'Top the water daily so the pump never runs shallow.',
          'Schedule a monthly pump teardown even when all sounds fine.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'heart',
        title: 'Appeal to instinct',
        items: [
          { highlight: 'Motion reads fresh', text: 'to a cat descended from cautious desert drinkers.' },
          { highlight: 'Separation from food', text: 'makes water stations more inviting, not less convenient.' },
          { highlight: 'Watch the level', text: 'daily drops confirm the fountain is doing its job.' },
        ],
      },
      {
        icon: 'check',
        title: 'Decode the noise',
        items: [
          { highlight: 'Steady hum is healthy', text: 'and most homes stop noticing it within days.' },
          { highlight: 'Gargle means top up', text: 'the pump is swallowing air from a low tank.' },
          { highlight: 'Rattle means teardown', text: 'hair is likely wound around the spinning impeller.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Keep the rhythm',
        items: [
          { highlight: 'Weekly sink session', text: 'scrub every single piece the water actually touches.' },
          { highlight: 'Monthly pump opening', text: 'even when the motor sounds perfectly happy and content.' },
          { highlight: 'Change carbon on schedule', text: 'a saturated pad quietly quits absorbing anything at all.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Do cats really drink more from fountains?',
        answer:
          'Many do, and the reason is inherited: desert ancestry left cats with a weak urge to seek water and a suspicion of still, stale-looking sources. Movement makes a dish read fresh. Fountains also keep water tasting better than a bowl that sits all day. Individual cats vary, so watch the level before and after switching.',
      },
      {
        question: "How often should I clean my pet fountain's pump?",
        answer:
          'Open the pump every week or two and more often in multi-pet homes, pulling the impeller off its shaft to unwind hair and brushing the housing. A monthly deeper soak in diluted white vinegar clears mineral scale. A clean pump runs quietly; noise is usually the first sign of skipped maintenance.',
      },
      {
        question: 'What do fountain filters actually remove?',
        answer:
          'A prefilter strains hair and debris away from the pump, and a carbon pad trims tastes and odors from the water. Neither removes minerals, bacteria, or dissolved contaminants the way a household pitcher filter does, so fresh refills still matter. Replace carbon on schedule, because a saturated pad stops absorbing anything at all.',
      },
      {
        question: 'Why did my fountain suddenly get louder?',
        answer:
          'Start with the water level: a low reservoir makes pumps slurp air, and a top-up fixes that in seconds. If the racket continues with the tank full, hair is probably wound around the impeller, and the pump is due for its teardown. Hard floors and hard corners amplify the hum that remains; a mat under the base softens it.',
      },
      {
        question: 'What is the best spot for a cat fountain?',
        answer:
          'Somewhere quiet with a wall behind it, a view of the room, and distance from the food dish and the litter box. Cats drink longest when they feel unwatched and un-ambushed. Avoid cramped corners and noisy appliances, and give the splash zone a washable mat if dogs share the fountain.',
      },
    ],
  },

  // =========================================================================
  // FOOD STORAGE — kibble freshness between the bag and the bowl
  // =========================================================================
  'feeding-and-watering/food-storage': {
    heroTitle: 'Keeping Kibble Fresh Between the Bag and Bowl',
    heroSubheadline:
      'Fats oxidize, aromas fade, and pantry moths commute home in the bag. A storage habit that respects all three keeps every scoop tasting like the first.',
    metaDescription:
      'Keep kibble fresh: the original-bag-inside-the-bin debate, airtight seals that earn the name, plastic versus steel, pest proofing, and honest portion habits.',
    introSummary:
      "The ritual goes like this: new bag arrives, and its contents get dumped into the big plastic bin, the empty sack tossed out with Tuesday's recycling. It is also how good food quietly goes bad, because the bag was doing more work than it looked like, the bin has been holding onto old oils since the last bag, and oxygen now has months of access instead of weeks. Storing kibble well is less about containers you buy and more about habits you keep. Here are the habits that matter.",
    sections: [
      {
        id: 'how-kibble-actually-goes-stale',
        title: 'How Kibble Actually Goes Stale',
        content:
          'Kibble does not rot like meat; it fades. The fats sprayed onto each piece oxidize on contact with air, slowly turning flavor from toasty to cardboard and eventually to something sour, and with them go fat-soluble nutrients. Aroma fades alongside, which matters more than it sounds, because smell is most of what appetite runs on. Humidity softens the pieces and invites mold at the surface; light accelerates all of it. A dog turning up his nose at the second half of a bag is often reporting chemistry, not brattiness, and a pet whose appetite stays low even on a fresh bag deserves a check with your veterinarian.',
        tips: [
          'Treat fading aroma and picky eating as a freshness clue.',
          'Keep bags away from sunlight, damp basements, and warm laundry rooms.',
          'Buy bag sizes your pets finish while the food is young.',
        ],
      },
      {
        id: 'the-original-bag-inside-the-bin',
        title: 'The Original Bag Inside the Bin',
        content:
          'Here is the debate worth having. Kibble bags are engineered: the interior lining is a fat barrier that slows oxidation, and the printed panel carries the date and lot code you will want if a recall ever lands. Pour the food out and you trade both for a bin of unknown history. Leave the bag loose and mice and moisture make their own arrangements. The compromise most keepers land on keeps everyone honest: roll the bag\'s top down tight, clip it, and set the whole thing inside the bin, so the container fights pests while the bag fights the clock.',
        callout: {
          type: 'pro-tip',
          title: 'The date lives on the bag',
          text: 'Photograph the best-by date and lot code before the sack goes wherever sacks go. If a recall is announced months later, you will know within seconds whether your bag is part of it.',
        },
        tips: [
          'Roll and clip the bag top before it goes in the bin.',
          'Keep the date and lot code accessible for recall checks.',
          'Let the bin fight pests while the bag fights oxygen.',
        ],
      },
      {
        id: 'airtight-seals-that-earn-the-word',
        title: 'Airtight Seals That Earn the Word',
        content:
          'Snap lids are not gasket lids. A true airtight container closes on a rubber or silicone gasket that resists when you pull it open, and that resistance is the whole point: no airflow, no oxidation clock, no humidity creeping in. Test a candidate by pressing the lid and feeling for suction, or open it slowly and listen for the soft sigh of air. Size the container to the food, because a half-empty bin is a reservoir of air sitting on your kibble. Then place it somewhere cool and dark, since a perfect seal beside a sunny window is still a slow oven.',
        tips: [
          'Favor gasket seals over snap lids; feel for resistance.',
          'Match container size to bag size to limit trapped air.',
          'Store in cool, dark spots, away from appliances and windows.',
        ],
      },
      {
        id: 'plastic-bins-versus-steel-containers',
        title: 'Plastic Bins Versus Steel Containers',
        content:
          'Plastic is affordable, light, and see-through, and over the years it also becomes a flavor of its own. Fats soak into the walls, scratches from scoops hold residue, and both turn each new bag slightly toward the old one; a dog with a sensitive nose notices first. Steel and glass wipe clean without memory, shrug off sunlight, and cannot be chewed through by a determined mouse, at the cost of weight and price. Neither needs to be perfect. If you keep plastic, wash it thoroughly between bags and retire it when the surface goes hazy. As you compare storage containers in listings, check that gaskets are replaceable.',
        tips: [
          'Wash plastic bins between bags to flush old oils out.',
          'Consider steel or glass where rodents or sunlight threaten.',
          'Check listings for replaceable gaskets before committing to one.',
        ],
      },
      {
        id: 'pests-and-the-pantry-war',
        title: 'Pests and the Pantry War',
        content:
          'Pantry moths ride home inside bags of grain and seed, and pet food is grain-adjacent enough to host them. The tell is webbing in the corners of the bag or kibble clumped like small spider homes. Mice take the simpler route and chew through bags and thin plastic outright. Two habits win the war: freeze a newly purchased bag for a few days to catch hitchhiking moth eggs before they hatch, and keep the storage area swept, so spills never announce the buffet. First-in, first-out rotation keeps old bags from becoming moth nurseries in the back of the closet.',
        tips: [
          'Freeze new kibble bags for a few days against moth eggs.',
          'Sweep the storage area weekly so spills never advertise food.',
          'Rotate bags oldest-first so nothing lingers long enough to hatch.',
        ],
      },
      {
        id: 'portioning-habits-that-protect-freshness',
        title: 'Portioning Habits That Protect Freshness',
        content:
          'Every time the lid opens, the clock ticks a little faster, so portioning is a freshness tool, not just a diet tool. Scoop from the bag with a dedicated cup that gets washed like any other dish, and close the lid immediately rather than leaving the bin breathing through dinner. Resist topping off: finish the old bag before opening the new, and if you must blend foods during a transition, blend them in the bowl, not the bin. Wash the container between bags, and write the opening date on tape on the lid. When you compare scoops and portioning cups in listings, choose ones that wash easily, since a scoop is kitchenware.',
        tips: [
          'Use a dedicated scoop, washed like any other kitchen tool.',
          'Close the lid immediately; open bins breathe all through dinner.',
          'Blend transition foods in the bowl, never inside the bin.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'shield',
        title: 'Store it right',
        items: [
          { highlight: 'Bag inside the bin', text: 'the liner fights oxygen while the bin fights pests.' },
          { highlight: 'Gaskets beat snap lids', text: 'airtight means resistance when the lid comes off.' },
          { highlight: 'Cool and dark wins', text: 'sealed containers still cook beside a sunny window.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Mind the clock',
        items: [
          { highlight: 'The six-week pace', text: 'finish opened bags promptly, since air never pauses.' },
          { highlight: 'Photograph the date', text: 'recalls need the lot code from the sack.' },
          { highlight: 'Smell before pouring', text: 'sour or paint-like aromas mean the fats turned.' },
        ],
      },
      {
        icon: 'check',
        title: 'Guard the pantry',
        items: [
          { highlight: 'Freeze new bags', text: 'a few cold days stop hitchhiking moth eggs.' },
          { highlight: 'Wash between bags', text: 'old oils otherwise seed every single fresh refill.' },
          { highlight: 'Rotate oldest first', text: 'so nothing sits in the back long enough to hatch.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Should I keep kibble in the original bag?',
        answer:
          'Usually, yes. The bag\'s inner lining is a fat barrier designed to slow oxidation, and the printed date and lot code matter if a recall is announced. Roll the top down tightly, clip it, and nest the whole bag inside a bin for pest protection. That combination protects food from more threats than either container alone.',
      },
      {
        question: 'Are plastic storage containers bad for dog food?',
        answer:
          'They are not bad, but they age. Fats soak into plastic walls and scratch marks hold residue, so a long-serving bin can taint each new bag subtly. Washing between bags, retiring hazy or deeply scratched bins, and keeping the food in its liner bag inside all keep plastic honest. Steel and glass simply have fewer memories.',
      },
      {
        question: 'How long does an opened bag of kibble stay fresh?',
        answer:
          'Most makers suggest finishing an opened bag within about six weeks, since oxidation starts the moment air replaces the sealed world inside. Storage stretches or shrinks that window: a gasket-sealed, cool, dark spot honors it, while a loosely rolled bag in a warm kitchen does not. A sour or paint-like smell means the fats have turned, whatever the calendar says.',
      },
      {
        question: 'How do I keep pests out of pet food?',
        answer:
          'Freeze new bags for a few days to stop moth eggs, store kibble in chew-resistant containers with real gaskets, and sweep the storage area weekly so crumbs never advertise the supply. Check bags for webbing or clumped pieces before you pour. Steel defeats mice outright; thin plastic mostly just slows them down politely.',
      },
      {
        question: 'Do I need to wash the container between bags?',
        answer:
          'Yes, and it takes five minutes. Residual oils and crumbs from the old bag seed the new one with rancid flavors and give pests a head start. Wash with hot soapy water, rinse thoroughly, and dry completely before refilling, because a damp interior invites mold. If a bin smells sour even after washing, retire it.',
      },
    ],
  },

  // =========================================================================
  // FEEDING MATS — floor protection and cleanup under messy eaters
  // =========================================================================
  'feeding-and-watering/feeding-mats': {
    heroTitle: 'Feeding Mats That Save Your Floors From the Mess',
    heroSubheadline:
      'Under every sloppy drinker and enthusiastic kibble chaser, a mat is quietly defining the mess zone. Silicone, fabric, or boot-and-tray, matched to the animal you actually have.',
    metaDescription:
      'Feeding mats for messy eaters: silicone versus fabric versus boot-and-tray, the dishwasher advantage, correct sizing, and placement under elevated bowl stands.',
    introSummary:
      'Look under the water bowl of any enthusiastic drinker and you will find the evidence: a halo of splashed water, gray rings on the hardwood, and a kibble piece or two that rolled to a distant landing. The floor takes the daily punishment of a well-fed pet, and a mat is the inexpensive layer of armor that catches it. The choice comes down to materials and mess volume, how much your particular animal relocates in a normal meal, and which cleaning routine you will honestly perform.',
    sections: [
      {
        id: 'the-quiet-job-of-a-good-mat',
        title: 'The Quiet Job of a Good Mat',
        content:
          'A feeding mat does three jobs at once: it declares where eating happens, catches what misses the bowl, and keeps the dish from skating across the floor on a collision course with the wall. That last job matters more than people expect, because a bowl that slides annoys cautious eaters and delights destructive ones. Underneath it all, the mat protects the actual floor, hardwood finishes and laminate seams that water wrecks quietly over months. The station gains from the definition too: a visible zone helps puppies learn where food lives and helps you notice instantly when a meal went unfinished.',
        tips: [
          'Pick mats wide enough to catch sideways splashes and dropped kibble.',
          'Use the defined zone to spot skipped meals instantly.',
          'Let the mat stop the bowl-sliding that annoys careful eaters.',
        ],
      },
      {
        id: 'silicone-mats-for-the-everyday-spill',
        title: 'Silicone Mats for the Everyday Spill',
        content:
          'Food-grade silicone is the default for good reason. It grips tile and hardwood, wipes clean in seconds, shrugs off the top rack of the dishwasher, and the best designs carry a raised lip around the edge that corrals liquid so a knocked-over water bowl becomes a contained lake instead of a kitchen flood. The surface tolerates grease and wet food without staining, and nothing about it appeals to a chewer between meals. Its limits are physical: a lip a few millimeters high stops splashes, not a truly committed dunk, and very large dogs can still shove a light mat around.',
        callout: {
          type: 'pro-tip',
          title: 'Lip height is capacity',
          text: 'A centimeter of raised edge sounds trivial until a full water bowl goes over. If your animal has ever emptied a dish onto the floor, buy the deepest lip you can find.',
        },
        tips: [
          'Choose lipped silicone designs to contain tipped water bowls.',
          'Top-rack silicone mats whenever the listing allows it.',
          'Skip thin floppy mats; they wander under enthusiastic eaters.',
        ],
      },
      {
        id: 'fabric-mats-for-the-enthusiastic-slurper',
        title: 'Fabric Mats for the Enthusiastic Slurper',
        content:
          'Some animals do not spill water so much as launch it, and microfiber fabric absorbs rather than corrals. A thick absorbent mat under the water station soaks up the splash a dog leaves after every long drink, keeps paws drier on the way past, and runs through the washing machine when it has had enough. The trade is drying: fabric that stays damp grows a smell, so hang it where air moves between meals, and keep a second on rotation for wash days. Fabric also stains under wet food, so most households assign it to the water side and leave meals to silicone.',
        tips: [
          'Assign fabric mats to water stations and silicone to meals.',
          'Hang fabric to dry between meals to keep odors down.',
          'Rotate two fabric mats so wash days never leave floors bare.',
        ],
      },
      {
        id: 'boot-and-tray-sets-for-heavy-mess',
        title: 'Tray Sets for the Heaviest Messes',
        content:
          "For the heaviest offenders, a boot-and-tray system goes further than a mat can. The raised-edge tray holds a removable mat, or receives the bowl directly, and its deep walls contain the full volume of a flipped dish along with the everyday spray. These are the sets that fit under elevated feeder stands, where the tray accepts the stand's footprint and finally ends the ring of crumbs that forms around its legs. They cost more and they are heavier to carry to the sink, but for big sloppy dogs, fosters eating in temporary quarters, and anyone with a finished floor they care about, the tray pays for itself in scrubbing avoided.",
        tips: [
          'Measure your elevated stand footprint before choosing a tray.',
          'Choose deep-wall trays for dogs that flip dishes outright.',
          'Use trays in foster rooms where cleanup speed matters most.',
        ],
      },
      {
        id: 'matching-mat-type-to-mess',
        title: 'Matching Mat Type to Mess',
        content:
          'The honest way to choose is to watch one full meal and one long drink, then match the hardware to the crime. The table below pairs each style with the mess it handles best and the care it will ask of you.',
        tableData: {
          headers: ['Mat style', 'Handles best', 'Care routine'],
          rows: [
            ['Lipped silicone mat', 'Everyday spills, wet food, sliding bowls', 'Rinse daily, dishwasher weekly'],
            ['Microfiber fabric mat', 'Splashy drinkers, drool, water rings', 'Machine wash weekly, hang to dry'],
            ['Boot-and-tray set', 'Flipped dishes, elevated stands, big dogs', 'Dump, wipe, scrub occasionally'],
            ['Flat placemat style', 'Light kibble scatter for tidy eaters', 'Wipe after meals'],
          ],
        },
        tips: [
          'Watch one full meal before deciding which style you need.',
          'Split duties when needed: fabric for water, silicone for meals.',
          'Let the mess volume, not the price, drive the final choice.',
        ],
      },
      {
        id: 'the-cleaning-routine-youll-actually-keep',
        title: "The Cleaning Routine You'll Actually Keep",
        content:
          "Dishwasher-safe gear gets cleaned; everything else negotiates with your energy. That is the practical argument for silicone, which rides the top rack twice a week while you do something better with the evening. Fabric mats want a regular machine cycle, and trays want a dump and a wipe, with a proper scrub whenever the corners grow suspicious. Whatever you choose, feed the routine into your existing rhythm: wipe the mat after dinner the night you wipe counters, run the weekly wash on the day towels go in. When you compare mats in listings, match the stated care to the routine you actually keep.",
        tips: [
          'Wipe mats the same evening you wipe the kitchen counters.',
          'Match listed care instructions to your real weekly routine.',
          'Scrub tray corners whenever anything suspicious grows there.',
        ],
      },
      {
        id: 'sizing-and-placement-details',
        title: 'Sizing and Placement Details',
        content:
          'Size a mat by the splash, not the bowl: for a dog who drinks like a bilge pump, the mat should extend well beyond the dish on the sides where water actually lands, which for cats often means the whole length of a stretching paw swipe. Under elevated stands, measure the full footprint including the feet, and add a margin for kibble bounce. Placement follows the same station logic as the bowls themselves: a quiet corner, away from doorways, on a level patch of floor so nothing pools at one end. As you browse feeding mats in our marketplace, keep those measurements written down; they outrank every other feature on the page.',
        tips: [
          'Measure the splash zone, not just the bowl footprint.',
          'Add kibble-bounce margin when sizing mats under elevated stands.',
          'Keep the mat on level floor so liquids pool predictably.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'shield',
        title: 'Protect the floor',
        items: [
          { highlight: 'Mats catch the daily', text: 'water rings and crumbs that wreck finishes slowly.' },
          { highlight: 'Size to the splash', text: 'not to the bowl, especially around sloppy drinkers.' },
          { highlight: 'Level floors matter', text: 'so pooled liquids stay where the mat can hold them.' },
        ],
      },
      {
        icon: 'check',
        title: 'Match the material',
        items: [
          { highlight: 'Silicone edges corral', text: 'lipped edges contain even tipped water bowls completely.' },
          { highlight: 'Microfiber fabric absorbs', text: 'microfiber soaks the splash a slurper leaves behind.' },
          { highlight: 'Trays contain everything', text: 'deep walls handle flipped dishes and tall elevated stands.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Clean without dread',
        items: [
          { highlight: 'Top-rack the silicone', text: 'a weekly dishwasher cycle keeps mats genuinely fresh.' },
          { highlight: 'Dry fabric fully', text: 'damp microfiber is exactly where feeding-area odors begin.' },
          { highlight: 'Wipe after dinner', text: 'attach mat care to a habit you already keep.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'What is the best feeding mat for a messy dog?',
        answer:
          'For splashy drinkers, a lipped silicone mat or a boot-and-tray set, since both contain liquid rather than just covering the floor. For kibble scatter, any mat sized generously beyond the bowl works. Truly committed mess-makers need the tray with high walls. Fabric suits the water station of a moderate slurper best.',
      },
      {
        question: 'Can silicone feeding mats go in the dishwasher?',
        answer:
          'Most can, on the top rack, though the listing is the final authority because bonded layers and printed designs vary. The dishwasher is the quiet advantage of silicone: a mat that rides a weekly cycle genuinely gets cleaned, while hand-wash-only gear drifts toward a quick rinse and a shrug.',
      },
      {
        question: 'How big should a feeding mat be?',
        answer:
          'Big enough to catch the mess your animal actually makes, which usually means several inches beyond the bowl on the drinking side and extra room wherever kibble lands. Under elevated stands, cover the full footprint of the feet with margin. When in doubt, size up; extra mat just gets wiped.',
      },
      {
        question: 'Do fabric feeding mats get smelly?',
        answer:
          'They can, because microfiber holds moisture, and damp fabric plus organic residue is how odors start. The cure is airflow: hang the mat to dry between meals, wash it weekly in the machine, and rotate a second mat so the floor is never bare. A fabric mat that smells right after washing has earned retirement.',
      },
      {
        question: 'Do I need a mat under an elevated feeder?',
        answer:
          "Yes, and trays are built for exactly that job. Crumbs and splashes gather around the legs of a stand, and a boot-and-tray set sized to the stand's footprint finally catches them. Measure the feet, add a margin for bounce, and choose a tray deep enough to hold a spilled bowl's worth.",
      },
    ],
  },

  // =========================================================================
  // BOWLS AND DISHES — material science, whisker comfort, and elevated honesty
  // =========================================================================
  'feeding-and-watering/bowls-and-dishes': {
    heroTitle: 'Pet Bowls and Dishes Built to Outlast Enthusiasm',
    heroSubheadline:
      'Material is the whole game in pet dishes. Steel, ceramic, and plastic behave differently under claws, dishwashers, and feline chins, and the differences are learnable in five minutes.',
    metaDescription:
      'Stainless, ceramic, or plastic pet bowls? Material trade-offs, cat chin acne, whisker-friendly dish shapes, non-tip bases, and the elevated-bowl honesty.',
    introSummary:
      'Almost everyone starts with the same bowl: plastic, decorated with paw prints, chosen because it matched the kitchen. Within a few months it is scratched gray, sliding across the floor, and quietly hosting more bacteria than its owner would believe. Dishes are the most-handled piece of pet equipment in the house, twice daily every day, and the material they are made from decides how they age, how they clean, and sometimes how the skin at a cat\'s chin behaves. Choosing better takes one honest look at three materials.',
    heroImageUrl: '/images/orange_cat.jpg',
    heroImageAlt: 'An orange tabby cat resting calmly indoors by its dish',
    sections: [
      {
        id: 'why-the-material-deserves-attention',
        title: 'Why the Material Deserves Attention',
        content:
          'A food dish is kitchenware. It holds meals twice a day, sits wet or greasy for hours, gets carried to the sink, and takes the impact of a face arriving at speed. Material determines whether that life leaves the dish hygienic and whole, or scratched, chipped, and quietly growing a biofilm in the grooves. It also determines what care the dish asks: some materials ride the dishwasher happily for years, while others demand hand washing or crack under heat. Start with the material and the rest of the decision, size, shape, and base, falls into place quickly.',
        tips: [
          'Treat pet dishes as daily kitchenware, not disposable accessories.',
          'Let your dishwasher habits narrow the material field first.',
          'Inspect dishes monthly for scratches, chips, and crazing.',
        ],
      },
      {
        id: 'stainless-steel-the-quiet-champion',
        title: 'Stainless Steel: The Quiet Champion',
        content:
          'Stainless steel is what most veterinary clinics use, and for reasons that translate directly to a home kitchen: it does not scratch deeply, it does not hold odors or fats, it survives the dishwasher indefinitely, and it costs less than people assume. It drops hints of its weaknesses honestly. Lightweight bowls skate across floors, which a silicone ring or a mat solves, and a polished exterior can startle a dog who catches his own reflection lunging at him from the water. If those are the worst complaints a material earns, it has won the argument, and the finish stays neutral to every food you serve.',
        tips: [
          'Pick stainless with a silicone ring or heavy base to stop sliding.',
          'Run steel bowls through the dishwasher without hesitation.',
          'Choose matte finishes for dogs startled by reflections.',
        ],
      },
      {
        id: 'ceramic-heavy-handsome-breakable',
        title: 'Ceramic: Heavy, Handsome, Breakable',
        content:
          'Ceramic wins the stability contest outright: a glazed stoneware dish holds its ground against the most determined nose-shoving, and the weight that annoys you at the sink is exactly what keeps meals calm on the floor. The glaze is nonporous and scrubs bright, and most designs are dishwasher safe. The vulnerability is structural: chips and hairline cracks, including the fine craze pattern that spreads inside older glazes, shelter bacteria that no scrubbing reaches, so a damaged ceramic dish is a replaced ceramic dish. Buy glazed pieces from listings that describe food-safe finishes, and keep them away from counter edges.',
        tips: [
          'Retire any ceramic dish the moment it chips or crazes.',
          'Confirm food-safe glaze language in the listing before buying.',
          'Use ceramic weight to anchor bowls for pushy eaters.',
        ],
      },
      {
        id: 'plastic-cheap-light-compromised',
        title: 'Plastic: Cheap, Light, Compromised',
        content:
          'Plastic is where most households begin and where many should quietly move on from. It scratches easily, and those scratches hold moisture, food residue, and bacteria in a way smooth surfaces never do; the surface goes hazy long before the dish looks dirty. The feline-specific issue is chin acne: many cats drinking and eating from plastic develop black specks and bumps on the chin, and veterinarians commonly suggest switching to ceramic or stainless as a first step when it appears. If plastic stays in your house for travel or puppies, replace it when the surface clouds, and check with your veterinarian about any chin bumps that persist after the switch.',
        callout: {
          type: 'vet-note',
          title: 'Chin bumps deserve a look',
          text: "Black specks, scabs, or swelling on a cat's chin can be acne, but similar-looking trouble includes fungal and mite causes. Swapping dish materials helps many cats, yet persistent bumps need a diagnosis, so let your veterinarian take a look instead of waiting them out.",
        },
        tips: [
          'Swap plastic for ceramic or stainless when feline chins get bumpy.',
          'Replace plastic dishes as soon as their surfaces turn hazy.',
          'Reserve plastic bowls for travel, not daily meals.',
        ],
      },
      {
        id: 'shallow-dishes-and-whisker-comfort',
        title: 'Shallow Dishes and Whisker Comfort',
        content:
          'Cats can find deep, narrow bowls genuinely unpleasant, a sensitivity often described as whisker fatigue: the whiskers brush the sides with every bite, and some cats respond by pulling food out onto the floor, eating fussily, or abandoning half a meal. The widely reported fix is a wide, shallow dish or a flat plate, where whiskers stay clear and the whole meal is visible at once. Flat-faced dogs share the benefit from a different cause, since shallow dishes suit the short jaws of pugs and bulldogs that deep bowls crowd. It is a low-cost experiment with an obvious readout: if the plate cleans up what the bowl never did, the bowl was the problem.',
        tips: [
          'Offer cats wide shallow dishes or flat plates for meals.',
          'Watch food-flinging behavior as a sign of dish discomfort.',
          'Serve flat-faced breeds from shallow dishes that fit short jaws.',
        ],
      },
      {
        id: 'non-tip-bases-and-steady-footing',
        title: 'Non-Tip Bases and Steady Footing',
        content:
          "A dish that travels is a dish that frustrates. Wide, weighted bases resist tipping by physics, silicone feet and rings grip the floor, and a mat beneath everything adds a second line of defense against the slow creep of an enthusiastic eater walking her bowl across the kitchen. Marketing descriptions promise non-tip designs, and the honest reading is that nothing out-engineers a dog who truly wants a dish upside down; the goal is making the effort unrewarding enough that nobody bothers. Cats need less architecture and more width, since a dish narrow enough to wobble is usually narrow enough to annoy whiskers too.",
        tips: [
          'Look for wide weighted bases and silicone grip feet.',
          'Add a feeding mat to stop the slow creep across floors.',
          'Give cats wide stable dishes rather than tall tippy ones.',
        ],
      },
      {
        id: 'weighing-steel-ceramic-and-plastic',
        title: 'Weighing Steel, Ceramic, and Plastic',
        content:
          'Three materials, three sets of consequences, and one comparison that settles most of the debate. The table compresses the trade-offs so you can carry them into the aisle instead of juggling a dozen open tabs, and it pairs each material with the household where it does its best work.',
        tableData: {
          headers: ['Material', 'Best household fit', 'Watch for'],
          rows: [
            ['Stainless steel', 'Busy kitchens, dishwasher households, chew-risk puppies', 'Sliding on smooth floors'],
            ['Ceramic', 'Stability seekers, pushy eaters, decor-minded homes', 'Chips and crazing lines'],
            ['Plastic', 'Travel kits, temporary and foster setups', 'Scratches, hazing, feline chin acne'],
            ['Collapsible silicone', 'Cars, hikes, and visits away from home', 'Too floppy for daily meals'],
          ],
        },
        tips: [
          'Match the material to the household, not the photo.',
          'Keep one steel set for daily use and one travel set.',
          'Treat any chip or craze line as a retirement notice.',
        ],
      },
      {
        id: 'elevated-bowls-and-the-honest-claims',
        title: 'Elevated Bowls and the Honest Claims',
        content:
          'Elevated feeders are sold with confident health claims, particularly the promise of preventing bloat in deep-chested dogs, and the honest position is quieter than the marketing: research support for that claim is weak, and some studies lean the other way. Where raised stands genuinely help is comfort, for tall dogs that bend far, seniors with stiff necks or arthritic shoulders, and animals whose veterinarians have specifically recommended an elevated position for a medical reason. For everyone else, floor-level works fine, and a simple dish on a mat does the same job. If your breed carries serious bloat risk, check with your veterinarian about feeding posture rather than trusting the box copy.',
        tips: [
          'Treat bloat-prevention claims on elevated feeders with skepticism.',
          'Consider raised stands for tall dogs and stiff seniors.',
          'Follow veterinary guidance on posture for bloat-risk breeds.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'award',
        title: 'Choose the material',
        items: [
          { highlight: 'Steel earns its stripes', text: 'dishwasher-proof, scratch-resistant, and inexpensive to replace whenever needed.' },
          { highlight: 'Ceramic holds ground', text: 'weight defeats pushy noses, but any chip retires it.' },
          { highlight: 'Plastic serves briefly', text: 'travel and fosters only, replaced when it hazes.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Shape for the face',
        items: [
          { highlight: 'Wide shallow dishes', text: 'keep whiskers clear and meals visible for cats.' },
          { highlight: 'Flat jaws want shallow', text: 'deep bowls crowd pugs and bulldogs most uncomfortably.' },
          { highlight: 'Stability through width', text: 'weighted bases and silicone feet stop the traveling.' },
        ],
      },
      {
        icon: 'check',
        title: 'Serve the truth',
        items: [
          { highlight: 'Bloat claims stay unproven', text: 'comfort, not prevention, is what raised stands actually deliver.' },
          { highlight: 'Chin bumps mean switching', text: 'and lingering ones warrant a proper veterinary diagnosis.' },
          { highlight: 'Wash like kitchenware', text: 'daily at minimum, and ideally after every meal.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Are plastic bowls really bad for cats?',
        answer:
          'They are the weakest choice rather than a forbidden one. Scratches in plastic harbor bacteria, and many cats eating from plastic dishes develop chin acne that clears after a switch to ceramic or stainless. Plastic is fine for travel and short-term foster duty. Chin bumps that persist after switching deserve a veterinary look.',
      },
      {
        question: 'What is whisker fatigue in cats?',
        answer:
          "A widely described sensitivity where a cat's whiskers, packed with nerve endings, brush the sides of a deep bowl until eating becomes irritating. Affected cats pull food onto the floor, eat fussily, or leave meals unfinished. A wide, shallow dish or flat plate usually resolves it, and the change is cheap enough to test before assuming pickiness.",
      },
      {
        question: 'Do elevated dog bowls prevent bloat?',
        answer:
          'The claim is marketed far more confidently than the evidence supports. Serious bloat, gastric dilatation-volvulus, has risk factors that include breed and build, and feeding posture has not been shown to reliably prevent it. Raised stands do help tall dogs and arthritic seniors eat comfortably. For a deep-chested breed, ask your veterinarian about mealtime management instead of trusting box copy.',
      },
      {
        question: 'Stainless steel or ceramic, which should I choose?',
        answer:
          'Steel if your life runs through the dishwasher and includes a chewing puppy: durable, cheap, odor-free, easily replaced. Ceramic if your dog shoves dishes across the room: heavy, stable, handsome, but breakable, and any chip retires it. Many homes keep both, ceramic for water, steel for meals.',
      },
      {
        question: 'How often should pet food bowls be washed?',
        answer:
          'Ideally after every meal, or at minimum daily, with water bowls getting the same discipline, since saliva and food film build a bacterial layer within a day. Dishwasher-safe materials make this nearly effortless. Bowls that still feel slick after washing are telling you the surface is past its serviceable life.',
      },
    ],
  },

  // =========================================================================
  // AUTOMATIC FEEDERS — schedule reliability, portion honesty, and failure modes
  // =========================================================================
  'feeding-and-watering/automatic-feeders': {
    heroTitle: 'Automatic Pet Feeders Worth Trusting With Dinner',
    heroSubheadline:
      'A feeder can make a schedule hold or ruin a diet, depending on the model and your habits. Portion checks, break-in resistance, and honest failure modes, explained plainly.',
    metaDescription:
      'Automatic pet feeders compared honestly: schedule reliability, portion accuracy you can test, wet-food trays, break-in resistance, and power-outage planning.',
    introSummary:
      'Around the fourth dawn in a row of a cat tapping your face at five, the automatic feeder starts looking less like a gadget and more like a marriage counselor. The machine\'s real job is narrower than the peace it promises: deliver measured food at chosen times without you. Done well, it smooths commutes, holds small meals steady for grazing cats, and keeps breakfast honest on the overslept morning. Done carelessly, it dispenses inaccurate portions, jams silently, and loses its schedule the moment the wifi blinks.',
    heroImageUrl: '/images/golden_portrait.jpg',
    heroImageAlt: 'A calm golden retriever waiting patiently at home near its feeder',
    sections: [
      {
        id: 'what-a-feeder-is-and-isnt',
        title: "What a Feeder Is and Isn't",
        content:
          'An automatic feeder is a scheduler, not a caretaker. It suits the cat who genuinely grazes, the dog whose dinner lands mid-commute, and the household that wants breakfast served before the alarm rather than after it. It is not a stand-in for presence: no machine notices appetite loss, a water bowl gone dry, or an animal acting strangely, which is the difference between convenience and neglect when plans run long. Set that boundary early and the feeder becomes a genuinely useful member of the household rather than a slowly failing promise you stopped checking.',
        tips: [
          'Treat feeders as schedulers; observation stays your job.',
          'Match the machine to pets who graze or eat on delayed schedules.',
          'Check food and water levels yourself whenever you are home.',
        ],
      },
      {
        id: 'schedules-that-hold-without-you',
        title: 'Schedules That Hold Without You',
        content:
          'Reliability lives in the clock, and the honest hierarchy is unglamorous: simple programmable units with physical controls fail least, app-driven models add convenience and add failure surface, and battery backup quietly outranks every smart feature when the power flickers. Before trusting any machine, run it empty for several days and confirm every dispensing fires on time, including across a weekend. Reset clocks after daylight-saving changes, since drift accumulates in cheaper units, and keep the schedule identical every day of the week, because pets read inconsistency as a problem to solve.',
        tips: [
          'Run a new feeder empty for days before trusting its schedule.',
          'Prefer models with battery backup over cleverer wifi-only features.',
          'Reset feeder clocks after every daylight-saving time change.',
        ],
      },
      {
        id: 'checking-portion-accuracy-yourself',
        title: 'Checking Portion Accuracy Yourself',
        content:
          'Portion claims deserve a test, because kibble pieces are not uniform and dispensers estimate. Set the feeder to a typical meal, dispense into a container on a kitchen scale, and run the cycle five times: if the weights scatter far from the setting, your pet\'s diet is riding on a guess. Repeat the check whenever you change food, since shape and density change the flow. A feeder that runs consistently a little heavy or light can be compensated by adjusting the setting; one that scatters wildly should be returned. For medical diets where grams matter, check with your veterinarian before automating meals at all.',
        tips: [
          'Weigh five dispensed meals and compare against the set portion.',
          'Recalibrate after switching foods; shapes and densities differ.',
          'Adjust settings to compensate for consistent over- or under-dispensing.',
        ],
      },
      {
        id: 'wet-food-models-and-the-ice-pack',
        title: 'Wet-Food Models and the Ice Pack',
        content:
          'The rotating-tray designs answer the wet-food question with covered compartments that open one at a time, each meal sealed until its hour arrives. An ice pack fitted beneath the tray stretches freshness from a couple of hours toward most of a workday, which is enough for the schedule it belongs in and nothing more. Wet food left overnight is a bacterial experiment, so these models shine for lunches, not weekends. Rinse spent compartments promptly, because dried pate becomes sculpture, and when you compare listings, count the trays and the ice packs included, since spares extend the rhythm.',
        tips: [
          'Treat ice-pack models as lunch machines, not weekend sitters.',
          'Rinse spent compartments before pate dries into sculpture.',
          'Count included trays and ice packs when comparing listings.',
        ],
      },
      {
        id: 'clever-pets-and-break-in-artistry',
        title: 'Clever Pets and Their Break-In Plots',
        content:
          'Some animals treat feeders like puzzle boxes with dinner inside. Cats fish the chute from above, small paws rake the dispenser opening, and determined dogs body-check the whole tower until the lid pops or the hopper cracks. Defense is layered: a feeder heavy enough or wall-anchored enough not to tip, a lockable lid, and a placement that leaves no furniture runway for a running start. Pet-proof claims on listings are marketing\'s optimism, and your particular genius is the real test, so assume break-in attempts and buy for the animal you have, not the average one.',
        tips: [
          'Anchor or weight the feeder against body-check takedowns.',
          'Prefer lockable lids for dogs that open latches.',
          'Place feeders away from furniture that offers a runway.',
        ],
      },
      {
        id: 'power-outages-and-honest-failures',
        title: 'Power Outages and Honest Failures',
        content:
          'Every feeder fails somehow, and the useful question is what failure looks like. Mains-powered units stop entirely in an outage; battery-backup models keep the clock alive but may not dispense; app-driven models lose their schedule the moment the router reboots, and a jam can silence any design mid-week. Two habits absorb nearly all of it: keep a manual backup plan that does not depend on the machine, and never leave an animal alone for days with a feeder as the only food source. Water matters even more than food, and no feeder pours it. For real trips, arrange a person.',
        callout: {
          type: 'warning',
          title: 'Machines do not notice trouble',
          text: 'A feeder will keep dispensing into a house where something has gone wrong. Appetite loss, vomiting, or a pet that seems off are exactly what automation cannot report, so a daily check-in, a neighbor, or a sitter remains part of pet care while you travel.',
        },
        tips: [
          'Keep a manual feeding backup that needs no electricity.',
          'Never depend on a feeder for multi-day solo absences.',
          'Arrange a human check-in for trips, however smart the gear.',
        ],
      },
      {
        id: 'feeder-types-and-their-trade-offs',
        title: 'Feeder Types and Their Trade-Offs',
        content:
          'Four architectures cover the shelf, and they behave very differently in a real kitchen. The table matches each type to the household it serves, the failure mode you accept with it, and the honesty each one demands from the person who buys it.',
        tableData: {
          headers: ['Feeder type', 'Best fit', 'Accepted weakness'],
          rows: [
            ['Gravity hopper', 'Grazers with iron self-control', 'Food never runs out; diets drift'],
            ['Programmable dry dispenser', 'Set meals, commutes, diet precision', 'Portion scatter by kibble shape'],
            ['Rotating tray with ice pack', 'Wet-food lunches on workdays', 'Hours of freshness, not days'],
            ['App-connected smart feeder', 'Away-from-home schedule tweaks', 'Wifi and outage dependence'],
          ],
        },
        tips: [
          "Match feeder architecture to your pet's actual eating style.",
          'Accept each listed weakness deliberately, never by accident.',
          'Test whatever you buy before the schedule really matters.',
        ],
      },
      {
        id: 'switching-over-without-the-standoff',
        title: 'Switching Over Without the Standoff',
        content:
          'New machines are suspicious, and cats hold hearings. Introduce the feeder unplugged and unloaded, letting inspection happen on their terms, then feed a few normal meals beside it so the object becomes part of the landscape. Run dispensing cycles empty so the noise is old news before it ever delivers food, and stay home for the first scheduled feeds in case the whole idea needs rescuing. Suspicious animals often refuse to eat from a machine for a day or two; patience usually wins. A healthy animal holding out far longer than that is worth a call to your veterinarian.',
        tips: [
          'Introduce the machine while unplugged and empty first.',
          'Run empty cycles so the dispensing noise becomes familiar.',
          'Stay home for the first fully scheduled automated feeds.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'clock',
        title: 'Test before trust',
        items: [
          { highlight: 'Weigh five dispenses', text: 'portion claims deserve proof from your kitchen scale.' },
          { highlight: 'Run it empty days', text: 'schedule reliability shows up long before food does.' },
          { highlight: 'Recalibrate per food', text: 'new shapes and densities change the delivered portion.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Plan for failure',
        items: [
          { highlight: 'Battery backup first', text: 'power flickers happen more than wifi outages admit.' },
          { highlight: 'Humans still matter', text: 'no feeder notices appetite loss or odd behavior.' },
          { highlight: 'Backup feeding plan', text: 'a bag and a bowl that need no electricity.' },
        ],
      },
      {
        icon: 'check',
        title: 'Introduce gradually',
        items: [
          { highlight: 'Unplugged inspection first', text: 'let suspicious animals audit the machine on their terms.' },
          { highlight: 'Meals beside it', text: 'teach that the object belongs to the food landscape.' },
          { highlight: 'Empty noise rehearsals', text: 'so the first real dispensing startles nobody at all.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Are automatic feeders good for cats?',
        answer:
          "For grazers and cats who prefer several small meals, they work well, since the machine can split daily portions through the day the way a mouse-hunting schedule would. They also protect sleep schedules. The caveats are real: test portion accuracy, never lean on one for absences, and confirm your cat's total daily amount with your veterinarian.",
      },
      {
        question: 'Can I leave my cat alone for a weekend with an automatic feeder?',
        answer:
          'Better than leaving a full bowl, but still not the recommended plan. Feeders jam, lose power, and knock over, and water fails even faster than food. For a weekend, have a neighbor or sitter check in daily. Reserve the feeder for smoothing normal days, and let a human being cover the exceptions.',
      },
      {
        question: 'How accurate are automatic feeder portions?',
        answer:
          "Accurate enough for healthy adults, once tested, and never worth trusting blind. Kibble shape and hopper level both affect delivery, so weigh several dispensed meals on a kitchen scale and adjust the setting to match reality. Change foods, rerun the test. For gram-critical medical diets, automation needs your veterinarian's blessing.",
      },
      {
        question: 'Can automatic feeders handle wet food?',
        answer:
          'The rotating-tray designs can, using sealed compartments that open on schedule with an ice pack beneath them to slow spoilage. That buys most of a workday, not a weekend, so plan them for lunches. Dried food in spent trays cleans far harder than it looks, so rinse compartments promptly after every rotation.',
      },
      {
        question: 'How do I introduce an automatic feeder to a suspicious cat?',
        answer:
          'Slowly, and in stages: unplugged and empty for inspection, normal meals served beside it, then empty dispensing runs until the noise is boring. Stay home for the first real scheduled feeds. Most cats accept the machine within days once it proves predictable, and food appears from it often enough to sway the holdouts.',
      },
    ],
  },
};
