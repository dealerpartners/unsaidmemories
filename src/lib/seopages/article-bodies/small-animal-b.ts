// Small-animal family (part B) article bodies for Pawzsly U — rabbit
// food, grooming, habitats, litter, supplements, toys, treats, and
// ferret treats. Eight original blog bodies written to the
// WRITING-SPEC.md contract: on-topic, blog voice, at least six sections
// of authentic prose, marketplace-friendly without hard selling.
import type { ArticleBody } from './types';

export const SMALL_ANIMAL_B_ARTICLES: Record<string, ArticleBody> = {
  // =========================================================================
  // small-animal/food-rabbit — the hay-first rule
  // =========================================================================
  'small-animal/food-rabbit': {
    heroTitle: 'Rabbit Food Simplified: Hay First, Pellets Measured',
    heroSubheadline:
      "Hay should run the menu, pellets stay garnish-sized, and carrots are candy. Learn the portion discipline that keeps a rabbit's gut moving and weight steady.",
    metaDescription:
      'Hay is the real rabbit food: unlimited grass hay, measured pellets, rotating greens, and carrots treated like candy. Here is the hay-first feeding logic.',
    introSummary:
      "Watch a rabbit eat and the menu explains itself: long hours grinding grass, brief enthusiasm for anything sweeter, and a body that quietly depends on the rhythm. Their digestive tract is built around fiber first, everything else second. That single fact orders the whole shopping list. Grass hay in endless supply, a measured pellet ration, rotating leafy greens, and carrots treated exactly like candy. Get those proportions right and most of the confusion around rabbit food disappears, along with a surprising number of vet bills.",
    sections: [
      {
        id: 'hay-runs-the-menu',
        title: 'Why Hay Runs the Whole Menu',
        content:
          "Grass hay is not a side dish for a rabbit; it is the meal itself. Constant chewing on coarse stems keeps the gut moving and wears down teeth that grow for the animal's entire life. A rabbit eating mostly pellets chews less, drinks differently, and produces droppings that tell you the engine is slowing. Offer timothy, orchard, or meadow hay in a pile bigger than the rabbit, refreshed daily, and let appetite set the portion. What they leave tells you more about quality than any label claim.",
        tips: [
          'Refill the hay pile daily and let leftover volume, not a scoop, set portions.',
          'Coarse, stemmy hay does more dental work than soft, leafy cuts.',
          'Judge freshness by smell and color; dusty or musty bales belong in the compost.',
        ],
      },
      {
        id: 'reading-pellet-bags',
        title: 'Reading a Pellet Bag Before Buying',
        content:
          "Pellets exist to fill small nutrient gaps, not to fill the rabbit. Look for plain, grass-based pellets with high fiber and a short ingredient list, and skip the colorful muesli-style mixes entirely, because rabbits cherry-pick the sugary pieces and leave the useful ones. Portion discipline matters more than brand loyalty: a small measured ration once or twice a day, sized to the rabbit's body condition, keeps the bowl honest. As you compare pellet listings, check the fiber percentage first and treat anything with added seeds, corn, or colored bits as a treat shelf item instead.",
        tips: [
          'Measure pellets in a small cup instead of pouring from the bag.',
          'Skip muesli mixes; rabbits sort out the sugar and waste the fiber.',
          "Weigh your rabbit monthly and adjust the ration with your vet's guidance.",
        ],
      },
      {
        id: 'greens-rotation',
        title: 'Leafy Greens in Honest Rotation',
        content:
          'Greens carry water, variety, and micronutrients, which is why a rotation beats a ritual. Offer a packed handful of mixed leaves per day for an average adult rabbit, built from several safe varieties through the week rather than one favorite repeated forever. Introduce anything new slowly, one item at a time, so a sensitive gut gets a gentle introduction rather than a surprise. Watch how each leaf lands: softer greens like romaine suit daily menus, while sharper-flavored leaves such as kale earn occasional slots rather than permanent ones.',
        tips: [
          'Rotate at least three or four safe greens through the week.',
          'Introduce one new green at a time over several days.',
          'Wash leaves thoroughly and serve them dripping for extra water intake.',
        ],
      },
      {
        id: 'carrot-honesty',
        title: 'The Carrot Conversation, Held Honestly',
        content:
          "Cartoons did rabbits no nutritional favors. A carrot is root sugar wrapped in orange, closer to a candy bar than a salad in a rabbit's metabolism, and daily carrot chunks add up fast in a small body. Offer a thin sliver now and then as a hand-fed moment, and keep the leafy green top as the more honest daily part of the vegetable. The same logic applies to fruit: apple slivers and berry halves are currency for trust and training, never diet staples. Sugar discipline is gut discipline.",
        callout: {
          type: 'warning',
          title: 'Root vegetables are candy',
          text: 'Carrot, banana, and apple pieces all land on the same sugar ledger. Keep them at sliver size and think of them as training rewards, not menu items.',
        },
        tips: [
          'Treat carrot slivers like candy: rare, tiny, and earned.',
          "Serve the carrot's leafy top as the greener, safer part.",
          'Count fruit and root vegetables on the same daily sugar budget.',
        ],
      },
      {
        id: 'hay-life-stage',
        title: 'Matching Hay to the Life Stage',
        content:
          'Not all grass hay is the same bag of stems, and one variety in particular trips up new rabbit households. The table below sorts the common options by who they serve. When you browse hay listings, the cut date and stem ratio matter more than the photography on the front, and a bale that smells sweet and green beats a prettier bag that smells like dust. Sample small quantities before committing to bulk boxes, because rabbits hold strong opinions about texture.',
        tableData: {
          headers: ['Hay', 'Best for', 'Watch for'],
          rows: [
            ['Timothy', 'Adult rabbits, everyday eating', 'Second cut is softer than first cut'],
            ['Orchard grass', 'Picky chewers, households with allergies', 'Softer stems do less dental work'],
            ['Meadow hay', 'Variety seekers, foraging piles', 'Blend changes between harvests'],
            ['Alfalfa', 'Growing kits, nursing does, thin seniors', 'Too rich as an adult staple'],
          ],
        },
        tips: [
          'Sample a small bag of each grass before buying bulk.',
          'Reserve alfalfa for growth, nursing, or weight recovery, not adult menus.',
        ],
      },
      {
        id: 'monitoring-signals',
        title: 'Droppings, Weight, and Daily Monitoring',
        content:
          'Routine observation is the cheapest health tool a rabbit owner owns. Round, uniform droppings mean the fiber engine is working; shrinking or misshapen droppings, strung together like pearls, or a day with almost no output are early warnings that the gut is slowing. Weight tells the rest of the story, so weigh weekly on a kitchen scale and write the number down. Appetite changes deserve the same respect: a rabbit who refuses breakfast is an emergency in rabbit terms, not a picky phase.',
        callout: {
          type: 'vet-note',
          title: 'Gut stasis moves fast',
          text: 'A rabbit who stops eating or passing droppings needs a veterinarian experienced with exotics the same day. Gut slowdown is urgent at any hour, so call before it becomes tomorrow.',
        },
        tips: [
          'Photograph normal droppings once so you can compare on off days.',
          'Log weekly weight on a kitchen scale; trends beat guesses.',
          'Treat any skipped meal as a same-day call to your exotics vet.',
        ],
      },
      {
        id: 'daily-rhythm',
        title: 'A Daily Rhythm That Holds',
        content:
          'Routines keep small diets honest because they remove daily negotiation. A workable pattern: refresh hay in the morning and again at night, serve the measured pellet ration at a fixed time, offer the greens in the evening when rabbits are naturally most active, and reserve hand-fed slivers for training and greeting moments. Feed the vegetables before the pellets if you have a rabbit who eats dessert first. Consistency also makes changes visible; when the routine is steady, the first sign of trouble stands out by contrast.',
        tips: [
          'Anchor pellet meals to a time you will never skip.',
          'Save sweet slivers for greetings and training, never bowl refills.',
          'Refresh hay twice daily so overnight hours never run empty.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Hay first',
        items: [
          { highlight: 'Unlimited grass hay', text: 'is the meal; appetite sets the portion, not a measuring cup.' },
          { highlight: 'Stems do the work', text: 'coarse first-cut textures wear teeth down across the day.' },
          { highlight: 'Smell before you buy', text: 'sweet and grassy beats dusty, regardless of packaging photos.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Portion discipline',
        items: [
          { highlight: 'Pellets stay measured', text: "a small fixed ration, adjusted with your vet's guidance." },
          { highlight: 'Greens rotate daily', text: 'several safe varieties across the week beat one favorite.' },
          { highlight: 'Sugar stays rare', text: 'carrot and fruit slivers are currency, not menu staples.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Watch the engine',
        items: [
          { highlight: 'Droppings tell the truth', text: 'round and uniform means the fiber engine keeps moving.' },
          { highlight: 'Weigh every week', text: 'a kitchen scale catches trends before eyes do.' },
          { highlight: 'Skipped meals are urgent', text: 'rabbits who stop eating need an exotics vet same day.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How much hay should my rabbit eat every day?',
        answer:
          'As much as they want, genuinely. A rabbit should have a pile at least the size of their own body refreshed daily, and most adults will work through it across the day and night. Unlimited is the point: the chewing itself keeps digestion moving and teeth worn.',
      },
      {
        question: 'How many pellets does an adult rabbit need?',
        answer:
          "Far less than most bags imply. A small measured ration once or twice daily is the usual pattern, with the exact amount tuned to your rabbit's weight and body condition. Think garnish rather than meal: if pellets are crowding out hay, cut the ration back and let the hay pile grow.",
      },
      {
        question: 'Can rabbits eat carrots every day?',
        answer:
          'They can, but they should not. Carrots carry concentrated root sugar, and daily chunks in a small body add up to real trouble over time. Offer a thin sliver occasionally, hand-fed, and rely on leafy greens for the daily vegetable routine. The cartoon version of rabbit food is best left as fiction.',
      },
      {
        question: 'What greens are safe for daily feeding?',
        answer:
          'Romaine, green leaf, red leaf, and cilantro anchor most daily menus, with basil, parsley, and dandelion leaves joining in rotation. Introduce new greens one at a time over a few days so the gut adjusts gently. Keep kale and spinach to occasional portions rather than daily staples, since their mineral load suits a lighter schedule.',
      },
      {
        question: 'Why has my rabbit stopped eating hay?',
        answer:
          'Common culprits are soft, over-leafy hay that requires no work, an over-generous pellet ration that removes hunger, or dental discomfort that makes chewing painful. Try coarser stems, tighten the pellet portion, and offer fresh hay in a new spot. If appetite for everything drops, call a veterinarian experienced with exotics immediately.',
      },
    ],
  },

  // =========================================================================
  // small-animal/small-animal-grooming — grooming by species
  // =========================================================================
  'small-animal/small-animal-grooming': {
    heroTitle: 'Small Animal Grooming: Each Species, Each Routine',
    heroSubheadline:
      'Brushing cadence, nail confidence, and dust-bath logistics change species by species. Here is the grooming routine each small pet genuinely needs, minus the water.',
    metaDescription:
      'Brushing by coat type, nail trims that respect the quick, and dust baths for chinchillas: species-by-species grooming routines for every small pet you keep.',
    introSummary:
      'The most common grooming mistake with small animals is treating them like tiny dogs. A rabbit dropped into a sink of water can go into shock, a chinchilla\u2019s dense coat traps moisture toward the skin, and a nervous hamster squeezed in a towel learns to fear hands forever. Grooming these species well means working with their biology: brushing on the schedule each coat actually needs, trimming nails with a plan for the quick, and letting dust do the bathing nobody should.',
    sections: [
      {
        id: 'coat-schedules',
        title: 'Each Coat Has Its Own Schedule',
        content:
          'Grooming needs track coat type more than species labels. Short-haired rabbits manage with a going-over once a week, while long-haired breeds such as Angoras collect tangles daily and need a brush session every single day. Guinea pigs sit in between: smooth coats want weekly attention, and long-haired breeds like Peruvians need daily detangling around the rear, where bedding and moisture conspire. Hamsters and gerbils largely groom themselves and want your hands mostly for health checks. Write the cadence down; memory drifts toward neglect.',
        tips: [
          'Set a phone reminder for brushing; calendars beat good intentions.',
          'Long-haired coats need daily detangling, especially around the rear.',
          'Log every grooming session briefly so slips stay visible.',
        ],
      },
      {
        id: 'brushing-long-hair',
        title: 'Brushing Long Hair Before It Mats',
        content:
          'Mats are not just ugly; they pull skin, hide problems, and can form fast on a long coat within days. Work with a wide-tooth comb first to find the edges of any tangle, then a slicker-style brush for the surface, always in the direction the fur grows. Sheds happen a few times a year, and during those weeks daily brushing matters most, because loose undercoat trapped against skin invites irritation. A mat you cannot gently tease apart is a job for careful scissors or a professional, not a stronger pull.',
        callout: {
          type: 'pro-tip',
          title: 'Comb before you brush',
          text: 'A wide-tooth comb locates the true edges of a mat so the brush works with the tangle instead of tightening it. Always finish long coats at the rump, where mats form first.',
        },
        tips: [
          'Comb through to skin level; surface brushing hides developing mats.',
          'Brush daily through shed season, weekly the rest of the year.',
          'Cut stubborn mats flat with scissors, never pull them loose.',
        ],
      },
      {
        id: 'nail-trims',
        title: 'Nail Trims and Respecting the Quick',
        content:
          "Nails that click on a hard floor are overdue. Inside each nail runs the quick, a living blood supply you can see through pale claws as a pink shadow, and invisible inside dark ones, which is why dark-nailed animals get conservative, tip-by-tip trims. Keep styptic powder within reach before you start, hold the paw firmly but gently, and take small slices at an angle that follows the nail's curve. One accidental nick is survivable and forgivable; press the powder on, offer calm, and finish the session later rather than pushing trust.",
        tips: [
          'Trim monthly, or whenever nails begin clicking on floors.',
          'Snip thin slivers on dark nails; the quick hides completely.',
          'Set styptic powder out on the table before any trim begins.',
        ],
      },
      {
        id: 'chinchilla-dust',
        title: 'Chinchilla Dust Baths, Never Water',
        content:
          "A chinchilla's fur holds dozens of hairs per follicle, dense enough that water soaks in and refuses to leave, setting up skin disease that a dust bath prevents entirely. Offer a container of chinchilla dust deep enough to roll in for ten or fifteen minutes, a few times a week, then remove it, because unlimited access to dust can dry skin out. The bath container itself is a shopping decision: sturdy walls, a size the animal can flip fully in, and a shape that dumps clean. Comparing dust-bath house listings by wall height and floor size turns this from guesswork into a quick check.",
        callout: {
          type: 'warning',
          title: 'Never bathe a chinchilla in water',
          text: 'If a chinchilla gets truly wet, dry low heat gradually and ask an exotics-savvy veterinarian to check the skin. Trapped moisture in that coat leads to fungus and worse.',
        },
        tips: [
          'Schedule dust baths a few times weekly, then remove the container.',
          'Let damp chinchillas air-dry away from drafts, never with high heat.',
          'Sift used dust for droppings and swap it out regularly.',
        ],
      },
      {
        id: 'bathing-honesty',
        title: 'Bathing? Almost Never for These Species',
        content:
          "Rabbits and guinea pigs self-groom, and a full bath strips protective oils while stressing an animal whose stress response is physical, not just emotional. Reserve real baths for medical directions from a veterinarian and use pet-safe products then. Everyday cleaning is spot cleaning: a damp cloth on a dirty rump, a gentle wipe of scent-gland buildup, cornstarch-based dry shampoo worked into a greasy patch and brushed out. Most 'dirty small pet' problems are cage-cleaning problems in disguise, which is cheaper to fix at the source.",
        tips: [
          'Spot clean dirty rear ends with a damp cloth, not a bath.',
          'Ask an exotics vet before any medicated or full-body wash.',
          'Fix recurring greasiness by changing the bedding routine first.',
        ],
      },
      {
        id: 'grooming-as-exam',
        title: 'Grooming Time as Health Inspection',
        content:
          'Every brush session doubles as a physical exam, and that is where grooming earns its keep. Part the fur and feel along the body for lumps, scabs, or patches where fur lifts too easily. Check teeth alignment through the front view, since dental trouble announces itself in drooling or selective eating long before it looks dramatic. In warm months, rabbits housed outdoors need daily bottom checks for flystrike risk, which moves fast once it starts. Anything you find belongs with a veterinarian experienced with exotics promptly, not in a watch-and-wait folder.',
        tips: [
          'Run hands fully along the body at every brushing session.',
          'Weigh monthly and note any steady drop for your vet.',
          'Do daily rear checks on outdoor rabbits through warm weather.',
        ],
      },
      {
        id: 'small-tool-kit',
        title: 'Building a Small Tool Kit',
        content:
          'You need less gear than the shelf implies. A soft bristle brush suits short coats, a wide-tooth comb and a slicker-style brush handle the long ones, and small straight or guillotine-style clippers serve most nails; pick whichever style you can control precisely on a squirming animal. Add styptic powder, and a sturdy dust-bath house if a chinchilla is in the family. As you compare grooming listings for small animals, weight and grip comfort matter more than accessory counts, because an awkward tool in a small hand causes accidents.',
        tips: [
          'Choose clippers you can control one-handed on a wriggler.',
          'Buy styptic powder before the first nail session, not after.',
          "Compare dust-bath house dimensions against your chinchilla's full roll.",
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'clock',
        title: 'Right cadence',
        items: [
          { highlight: 'Short coats weekly', text: 'long-haired coats want daily combing, and sheds demand more.' },
          { highlight: 'Shed season is daily', text: 'trapped undercoat irritates skin and mats within days.' },
          { highlight: 'Nails on a cycle', text: 'trim monthly or whenever you hear floor clicks.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Safety rails',
        items: [
          { highlight: 'Respect the quick', text: 'thin slices protect the blood supply inside every nail.' },
          { highlight: 'Styptic powder ready', text: 'open on the table before the first cut happens.' },
          { highlight: 'Water stays rare', text: 'spot cleaning covers nearly every small-animal mess safely.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Touch builds trust',
        items: [
          { highlight: 'Grooming doubles as exams', text: 'hands find lumps, mats, and tooth trouble early.' },
          { highlight: 'Dust, never water', text: 'chinchillas bathe in dust; wet fur invites disease.' },
          { highlight: 'Stop before stress', text: 'end sessions on a good note, even mid-paw.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How often should I brush my long-haired rabbit?',
        answer:
          'Daily, without exception, and twice is better during shed season. Long coats tangle where moisture and movement meet, especially at the rump and under the arms, and a mat that forms over a weekend can pull skin painfully by Tuesday. A few patient minutes each day beats an hour-long detangling battle that teaches your rabbit to run.',
      },
      {
        question: 'Can I ever bathe my chinchilla?',
        answer:
          'No, not in water. That famously dense fur traps moisture against the skin and dries far too slowly, which invites fungal growth and serious skin disease. Dust baths handle cleaning the way the species evolved to do it. If a chinchilla becomes genuinely wet through accident, dry gradually and speak with an exotics-savvy veterinarian about the skin.',
      },
      {
        question: 'How do I trim dark nails without hitting the quick?',
        answer:
          "Take very thin slices, angling the cut to follow the nail's natural curve, and check the cut face after each sliver: a dark dot or chalky center means the quick is close, so stop. Cutting little and often keeps the quick receding gradually. Pale-nailed animals are easier since the pink shadow shows you the boundary.",
      },
      {
        question: 'How often do guinea pigs need their nails trimmed?',
        answer:
          'Roughly monthly, though activity level shifts the schedule, since animals running on abrasive surfaces wear their own nails down. Check that the front view stays comfortable and that no nail curls toward the pad. Long-haired guinea pigs also need a daily comb-through at the rear, where their coats collect the most trouble.',
      },
      {
        question: 'What grooming does a hamster actually need?',
        answer:
          'Very little direct care, because hamsters groom themselves thoroughly. Offer a sand bath for coat maintenance, keep nails short naturally through wheel and surface wear, and use your handling time as a weekly once-over for lumps or scent-gland trouble. Any persistent scratching or fur loss is a reason to visit an exotics-savvy vet.',
      },
    ],
  },

  // =========================================================================
  // small-animal/small-animal-habitats — enclosure shopping honesty
  // =========================================================================
  'small-animal/small-animal-habitats': {
    heroTitle: 'Choosing Small Animal Habitats With Honest Math',
    heroSubheadline:
      'Cage minimums describe survival, not a life. Learn the honest enclosure sizing for rabbits, guinea pigs, and hamsters, plus where to place a habitat for airflow without drafts.',
    metaDescription:
      'Exercise pens over hutches, solid floors over wire, and flat footage over levels: the honest math for sizing and placing a small animal habitat in any room.',
    introSummary:
      'How much space does a small animal actually need? More than the box on the cage says, and that is the honest starting point of every enclosure decision. Minimum dimensions printed on packaging describe survival, not a life, and they quietly assume daily exercise beyond the wire. This walkthrough covers the real math for rabbits, guinea pigs, and hamsters, the case for exercise pens over classic hutches, why wire floors cause trouble, and how to place a habitat so ventilation works without turning into a draft.',
    sections: [
      {
        id: 'minimums-are-baselines',
        title: 'Minimum Sizes Are Baselines, Not Goals',
        content:
          "Published cage minimums mark the floor of acceptable, not the ceiling, and most welfare-minded keepers treat them as a place to start doubling. A rabbit needs enough unbroken floor to hop several body lengths and stand fully upright on hind legs without folding ears against a top. Guinea pigs want long, continuous floor space for their signature popcorn bursts. Hamsters need room for a deep bedding layer plus a properly sized wheel, which small commercial cages rarely deliver together. When a listing quotes inches, measure them against the animal's grown adult size.",
        tips: [
          "Budget the adult animal's size, never the baby you bring home.",
          'Prioritize unbroken floor area over vertical levels for guinea pigs.',
          'Treat any published minimum as your starting point, then exceed it.',
        ],
      },
      {
        id: 'pens-over-hutches',
        title: 'Why Exercise Pens Outsell the Hutch',
        content:
          'An indoor exercise pen beats the classic rabbit hutch for most modern households, and the reasons are practical rather than sentimental. Panels configure into any room shape, expand when you add a companion, and fold flat for transport or cleaning. They cost less per square foot than an equivalent cage, and they fail gracefully: a determined rabbit who chews a pen edge is visible instantly, while cage damage hides until it becomes an escape. Hutches still earn their keep outdoors with weatherproofing, raised legs, and predator latching, but the indoor default has moved firmly toward panels.',
        callout: {
          type: 'pro-tip',
          title: 'Count panels, not pictures',
          text: 'Listing photos make pens look roomy by photographing small animals in them. Check the panel height, count, and per-panel width, and multiply before you imagine it in your room.',
        },
        tips: [
          'Compare panel height and count first; photos flatter every enclosure.',
          'Choose pens with fold-flat panels if you rearrange rooms often.',
          'Anchor outdoor hutches against tipping and dig-proof the ground below.',
        ],
      },
      {
        id: 'style-to-species',
        title: 'Matching Enclosure Styles to Species',
        content:
          'No single enclosure style serves every small animal equally well, because climbing instincts, bedding depth, and floor habits differ sharply between species. The table pairs each common setup with the animals it suits and the trade-off you accept. Wherever you land, the same tape-measure check applies to anything you are browsing: real interior floor dimensions, door and lid access, and bar spacing small enough that an adult head cannot slip through.',
        tableData: {
          headers: ['Setup', 'Suits best', 'Trade-off'],
          rows: [
            ['Exercise pen panels', 'Rabbits with daily room access', 'Needs a bunny-proofed room around it'],
            ['C-and-C grid habitat', 'Guinea pigs, expandable herds', 'Larger footprint than any tower cage'],
            ['Deep-base wire cage', 'Hamsters, when bar spacing is narrow', 'Wire floors must be replaced or covered'],
            ['Outdoor hutch and run', 'Rabbits in mild, supervised setups', 'Weather and predator proofing is on you'],
            ['Glass tank with mesh lid', 'Hamsters and gerbils', 'Heavier and less airy than wire'],
          ],
        },
        tips: [
          'Verify bar spacing against your species before ordering any wire cage.',
          'Plan the adult footprint, including hay, hides, and wheel space.',
        ],
      },
      {
        id: 'wire-floors',
        title: 'Wire Floors and Sore Feet',
        content:
          'Rabbit hocks and guinea pig pads were not designed to stand on open mesh, and the injuries prove it. Constant pressure on wire creates sore hocks on rabbits, painful calluses and ulceration that escalate when untreated, and bumblefoot in guinea pigs for the same pressure reasons. Solid flooring, or wire floors fully covered with washable boards or deep bedding, removes the cause entirely. Hamsters add a second wire problem: uncoated mesh abraded by constant running can injure small feet, and floors of paper-based bedding several inches deep serve them far better.',
        callout: {
          type: 'warning',
          title: 'Feet first, always',
          text: 'Sore hocks begin as pink pressure patches and become open wounds quietly. Check weight-bearing surfaces on pale feet weekly, and bring redness or scabs to a veterinarian experienced with exotics early.',
        },
        tips: [
          'Cover any wire shelf with solid washable boards immediately.',
          'Check pale rabbit hocks weekly for pink pressure patches.',
          'Give hamsters deep paper bedding instead of mesh floors.',
        ],
      },
      {
        id: 'ventilation-vs-draft',
        title: 'Ventilation Without the Draft',
        content:
          'A habitat needs moving air but never moving straight at the animal. Ammonia from urine builds in still enclosures and irritates every airway in the room, which argues for open wire walls and good room circulation. Drafts argue the other way, especially for chinchillas and guinea pigs, who are quick to catch colds. Placement solves both: an interior wall away from windows, radiators, air conditioning vents, and direct sun, in a room where the family passes through. Glass tanks trade airflow for containment, which suits deep-bedding hamsters with mesh lids, and suits almost nobody else.',
        tips: [
          'Choose an interior wall away from windows, vents, and radiators.',
          'Sniff at rabbit level weekly; ammonia odor means cleaning overdue.',
          'Pair glass tanks with mesh lids so air exchanges freely.',
        ],
      },
      {
        id: 'multi-level-caution',
        title: 'The Multi-Level Trap for Cavies',
        content:
          'Multi-level cages look like more space and, for guinea pigs, usually are not. Cavies are floor animals whose short legs and heavy bodies make ramps and platforms a fall hazard rather than a playground, and each level steals headroom from the footprint below. Levels work brilliantly for climbers, rats and ferrets especially, and moderately for nimble rabbits on non-slip ramps sized for their stride. The species decides the architecture: buy vertical for a climber, buy flat and long for a pig, and let the animal\u2019s body shape make the call.',
        tips: [
          'Skip ramps and platforms for guinea pigs; buy flat footage.',
          'Add non-slip surfaces on any rabbit ramp before trusting it.',
          'Give climbers vertical rooms only with solid landing shelves.',
        ],
      },
      {
        id: 'tape-measure-shopping',
        title: 'Shopping With the Tape Measure Out',
        content:
          "Enclosure listings reward patience with numbers. Before browsing, write down the grown animal's length, the minimum floor you calculated, and the interior dimensions you can actually spare in the room, including door swing and cleaning access. Then read each listing's fine print for interior versus exterior measurements, wire spacing, and whether shelves come out for washing. Modular systems win long-term budgets because they expand with a second animal instead of facing replacement. Comparing habitats side by side on a marketplace beats guessing in a store aisle, since the numbers do the talking.",
        tips: [
          'Confirm interior dimensions; exterior numbers flatter every cage listing.',
          'Check that shelves and bases come apart for real washing.',
          'Choose modular panels when a second animal is plausible.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Size honestly',
        items: [
          { highlight: 'Minimums are baselines', text: 'floor space for hopping, popcorning, and full standing height.' },
          { highlight: 'Adult size wins', text: 'plan the enclosure around the animal they become.' },
          { highlight: 'Flat beats tall', text: 'guinea pigs need length, not ramps and platforms.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Safe surfaces',
        items: [
          { highlight: 'No bare wire floors', text: 'mesh causes sore hocks and bumblefoot under constant pressure.' },
          { highlight: 'Solid or covered', text: 'washable boards over wire remove the pressure points.' },
          { highlight: 'Bar spacing matters', text: 'narrow gaps stop escapes and stuck heads entirely.' },
        ],
      },
      {
        icon: 'map-pin',
        title: 'Place it right',
        items: [
          { highlight: 'Airflow, not drafts', text: 'interior walls beat windows, radiators, and air conditioning vents.' },
          { highlight: 'Sniff at floor level', text: 'ammonia smell means the cleaning schedule needs shortening.' },
          { highlight: 'Room for chores', text: 'leave access for sweeping, litter changes, and laundry.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How big should a rabbit enclosure be?',
        answer:
          'Big enough that an adult can hop at least three full body lengths between turns and stand completely upright without touching the top. An exercise pen of connected panels covering a generous patch of floor, attached to a bunny-proofed room for daily running, serves most house rabbits far better than any cube-style cage.',
      },
      {
        question: 'Are multi-level cages good for guinea pigs?',
        answer:
          'Generally no. Guinea pigs are ground-dwellers with short legs and solid bodies, so ramps create fall risks and platforms subtract headroom from the floor they actually use. Spend the same budget on a longer, single-level footprint with hides and tunnels. Save the vertical towers for genuine climbers like rats or ferrets, whose bodies are built for that architecture.',
      },
      {
        question: 'Can I house a hamster in a wire cage?',
        answer:
          'Yes, if the bar spacing is narrow enough that the hamster cannot squeeze between bars, commonly quite tight for dwarfs, and if the floor is solid and deep rather than bare mesh. Many keepers prefer large glass tanks with mesh lids for the deep bedding hamsters instinctively dig. Either way, floor area and bedding depth come before style points.',
      },
      {
        question: 'Where is the best place to put a small animal cage?',
        answer:
          'An interior wall in a family room, away from windows, radiators, direct sun, and air conditioning or heating vents. You want gentle air movement without a stream blowing across the habitat, stable temperatures, and enough traffic that the animal sees daily life without constant noise. Avoid kitchens with cooking fumes and garages entirely.',
      },
      {
        question: 'Are wire cage floors really that bad?',
        answer:
          'For rabbits and guinea pigs, yes: constant pressure on open mesh creates sore hocks and bumblefoot, conditions that worsen quietly and need veterinary attention once established. Cover wire with solid washable boards or choose solid flooring outright. Hamsters are better served by several inches of paper-based bedding they can burrow through.',
      },
    ],
  },

  // =========================================================================
  // small-animal/litter — litter training that works
  // =========================================================================
  'small-animal/litter': {
    heroTitle: 'Litter Training Rabbits and Guinea Pigs for Real',
    heroSubheadline:
      'Rabbits graze where they eliminate, ferrets back into corners, and guinea pigs follow favorites. Set up litter training the way each species already behaves, and it mostly trains itself.',
    metaDescription:
      'Corner boxes, safe paper litter, and the hay trick that trains rabbits by accident: litter training small animals without clumping-litter danger or punishment.',
    introSummary:
      'There is a specific moment every rabbit keeper discovers: the animal picks one corner, always the same one, and the rest of the cage stays strangely clean. That corner is your opening. Litter training works with the instinct instead of against it, and for rabbits it can reach cat-level reliability. Guinea pigs learn partially, ferrets learn quickly when the setup matches their backing-into-corners habit. What follows is the equipment, the litter choices that stay safe, the hay trick that seals the deal, and the honest limits of each species.',
    sections: [
      {
        id: 'corner-boxes',
        title: 'Corner Boxes Fit the Instinct',
        content:
          'Small animals eliminate in predictable places, and the corner box exists because of it. Rabbits prefer corners and frequently relieve themselves while eating, guinea pigs adopt favored spots when the box matches their path, and ferrets back into corners with such consistency that a high-backed pan becomes nearly self-training. Choose a box sized so the whole rear fits with margin: rabbits need a large pan because they grow and like to linger, and a too-small pan is the number one reason training fails quietly.',
        tips: [
          'Size the box for the grown animal, rear end with margin.',
          'Pick high-backed pans for ferrets and spraying male rabbits.',
          'Anchor the box so tipping becomes impossible mid-use.',
        ],
      },
      {
        id: 'safe-litter',
        title: 'Paper Litter Keeps It Safe',
        content:
          'The litter itself matters as much as the box, because small animals nibble their bathroom. Paper-based litter pellets absorb well, hold odor without perfume, and pass harmlessly if a few pieces get chewed. Wood stove pellets and aspen shavings work for many households, while pine and cedar shavings carry aromatic oils that irritate small airways and deserve a pass. As you compare litter listings, the safe choices line up on one shelf: paper pellets, aspen, and compressed wood. Skip anything clumping: bentonite swells with moisture, and a swallowed piece expands inside a gut built for fiber, which is where the danger stops being hypothetical.',
        callout: {
          type: 'warning',
          title: 'Clumping cat litter is the hazard',
          text: 'Scoopable cat litter swells on contact with moisture and can block a small animal\u2019s intestines if eaten. Keep it in the cat aisle only, never near a rabbit, cavy, or ferret box.',
        },
        tips: [
          'Choose paper-based pellets; they absorb well and chew safely.',
          'Avoid pine and cedar shavings entirely for small airways.',
          'Skip scented litters; strong perfumes bother sensitive noses.',
        ],
      },
      {
        id: 'hay-in-box',
        title: 'The Hay-in-Box Trick for Rabbits',
        content:
          'Rabbits graze and eliminate at the same time, so a toilet that serves dinner trains itself. Fill one end of the litter box with a generous heap of loose hay, or clip a hay rack directly above the pan, and the rabbit parks there for long meals, leaving droppings exactly where you want them. Refresh the hay daily even when it looks untouched, because stale hay loses the appeal that powers the habit. The bonus is behavioral: the box becomes a favorite place rather than a punishment zone, and favorite places are the ones animals keep clean.',
        tips: [
          'Heap loose hay directly in one end of the pan.',
          'Refresh box hay daily; stale stems lose their pull.',
          'Position a rack above the pan for tidy eaters.',
        ],
      },
      {
        id: 'neutering-effect',
        title: 'Neutering Rewrites the Marking Habit',
        content:
          'Hormones explain most litter-box anarchy. Intact rabbits, especially males and territorial females, spray and scatter droppings to claim space, and no amount of box placement outmaneuvers that agenda. Once spayed or neutered, the drive fades over the following weeks and trained habits usually lock in, which is why rescues often deliver already-trained rabbits. There is a health dividend too: unspayed female rabbits face a well-documented lifetime risk of uterine disease that makes the surgery worth discussing beyond tidiness. Ask an exotics-savvy vet about timing.',
        callout: {
          type: 'vet-note',
          title: 'The surgery conversation',
          text: 'Neutering settles most spraying behavior, and spaying removes the uterine disease risk that follows unspayed does. Book the timing conversation with your exotics-savvy veterinarian before habits harden.',
        },
        tips: [
          'Expect marking to fade over weeks, not overnight, after surgery.',
          'Keep training gentle during recovery; confined rest comes first.',
          'Discuss spay timing early; uterine disease risk climbs with age.',
        ],
      },
      {
        id: 'cleaning-rhythms',
        title: 'Cleaning Rhythms That Reinforce Habits',
        content:
          'Animals abandon boxes that smell like toilets long before you notice. Scoop daily, swap soiled litter fully each week, and de-scale urine from corners with white vinegar, which dissolves the crystal buildup that ordinary cleaners leave behind. During retraining, keep one or two old droppings in the fresh box so the corner keeps broadcasting its purpose. Skip harsh disinfectants and anything heavily perfumed, since chemical smells near food and hay send mixed signals to a nose doing the deciding.',
        tips: [
          "Scoop the box daily; a full change can wait for week's end.",
          'Dissolve urine scale with white vinegar before scrubbing corners.',
          'Leave a few familiar droppings in the box during retraining.',
        ],
      },
      {
        id: 'accidents-patience',
        title: 'Accidents Get Patience, Never Punishment',
        content:
          'Rubbing a nose in a mess teaches fear of hands, not bathroom etiquette, and it actively damages the trust small animals extend slowly. When accidents happen, clean the spot with vinegar so the smell stops inviting repeats, and quietly examine the cause: a box that got dirty, a new territorial phase, a moved box, or something medical. Droppings outside the box that come with straining or wetness around the rear belong with a veterinarian experienced with exotics before any training plan. Confinement to a smaller space with the box, then gradual expansion, retrains most backsliders.',
        tips: [
          'Clean accident spots with vinegar to erase the scent invitation.',
          'Suspect medical causes whenever new accidents arrive with straining.',
          'Restart training in a smaller space, then expand freedom slowly.',
        ],
      },
      {
        id: 'box-shopping',
        title: 'Shopping Boxes Against Your Cage',
        content:
          'Browsing litter boxes works best with three measurements written down: the corner\u2019s two wall lengths, and the animal\u2019s grown rear width plus margin. High backs suit ferrets and unneutered male rabbits; low-front entry helps senior guinea pigs stepping in. Fixtures matter as much as plastic: clip-on hay racks, screens that drop over the box to catch kicked litter, and pans heavy enough that a digging rabbit cannot flip the whole arrangement. Comparing corner-box listings side by side, matched to those measurements, turns a guess into a purchase you keep.',
        tips: [
          'Measure the cage corner before browsing, not after the box arrives.',
          'Choose low-entry pans for seniors and high backs for sprayers.',
          'Add a litter screen to contain enthusiastic diggers and kickers.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Box basics',
        items: [
          { highlight: 'Corner placement first', text: 'animals already chose their spot; work with it.' },
          { highlight: 'Size for the adult', text: 'rear ends need margin, and rabbits grow fast.' },
          { highlight: 'Hay seals the deal', text: 'grazing rabbits stay parked, and droppings land inside.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Safe litter only',
        items: [
          { highlight: 'Paper pellets win', text: 'absorbent, unscented, and harmless in small swallowed amounts.' },
          { highlight: 'Clumping is dangerous', text: 'swelling litter can block a fiber-built gut completely.' },
          { highlight: 'Skip pine and cedar', text: 'aromatic oils irritate small airways and deserve avoidance.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Habits and honesty',
        items: [
          { highlight: 'Neutering rewires marking', text: 'most box chaos fades in the weeks after surgery.' },
          { highlight: 'Guinea pigs partially', text: 'expect favored corners, not cat-level reliability, from cavies.' },
          { highlight: 'Accidents mean patience', text: 'vinegar the spot, hunt the cause, never punish the animal.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Can rabbits really be litter trained?',
        answer:
          'Yes, and often to an impressive degree. Most spayed or neutered rabbits adopt a corner box reliably, especially with hay offered right at the pan, since rabbits naturally graze and eliminate together. Intact rabbits spray and scatter to mark territory, so the surgery usually matters more for tidiness than any training technique you try.',
      },
      {
        question: 'Is clumping cat litter dangerous for small animals?',
        answer:
          'Genuinely dangerous, yes. Clumping litter swells when wet, so a nibbled piece can expand into an obstruction inside a rabbit or guinea pig, and the fine dust aggravates small respiratory systems. Paper-based pellets, aspen, or compressed wood stove pellets are the safe swaps. Keep cat litter entirely out of the small-animal aisle of your home.',
      },
      {
        question: 'Why put hay in the litter box?',
        answer:
          'Because rabbits eat and eliminate at the same time, a hay pile at one end turns bathroom visits into long grazing sessions, and droppings land exactly where you can sweep them. Refresh that hay daily even when it looks barely touched, because the fresh smell is what keeps the habit anchored to the box.',
      },
      {
        question: "Will neutering improve my rabbit's litter habits?",
        answer:
          'In most cases, dramatically. The urge to spray and scatter droppings is hormonal territory-marking, and it fades in the weeks after neutering, letting the box habit finally stick. Spaying also removes the significant uterine disease risk that follows unspayed does, so the conversation with your exotics-savvy veterinarian covers health as well as housekeeping.',
      },
      {
        question: 'How do I litter train a guinea pig?',
        answer:
          'Set the corner box where they already favor, keep it immaculately clean, and accept partial success as the realistic goal. Cavies tend toward favored corners rather than one fixed bathroom, so many keepers place two boxes in a large habitat. Adding a hay rack at the pan helps, since the graze-and-go habit works on them too, with less precision.',
      },
    ],
  },

  // =========================================================================
  // small-animal/small-animal-supplements — the supplement honesty
  // =========================================================================
  'small-animal/small-animal-supplements': {
    heroTitle: 'Small Animal Supplements: Honest Before Enthusiastic',
    heroSubheadline:
      'One supplement need is real, and it belongs to guinea pigs: daily vitamin C their bodies cannot make. Everything else on the shelf deserves honest skepticism first.',
    metaDescription:
      'Guinea pigs genuinely need daily vitamin C from food or tablets. Most other small animal supplements are shelf decoration on a good diet: the honest shortlist.',
    introSummary:
      'Walk the supplement shelf for small animals and the bottles make bold claims for calm coats, strong digestion, and boundless energy. Most of that promise is aimed at the wrong animal: a rabbit eating proper hay, or a hamster on a balanced ration, is already receiving the most effective supplement there is: fiber. The genuine exceptions are few and worth knowing cold. Guinea pigs cannot manufacture their own vitamin C and need it supplied every single day, and a few recovery situations justify temporary support. Here is the honest shortlist.',
    sections: [
      {
        id: 'who-needs-supplements',
        title: 'Who Actually Needs a Supplement',
        content:
          'Supplements fill gaps, and gaps come from diets, not calendars. A healthy rabbit on unlimited grass hay with measured pellets and rotating greens has no meaningful gap to fill, and neither does a hamster on a complete commercial ration with fresh bits. The animals with real needs are specific: guinea pigs missing daily vitamin C, animals recovering from illness under veterinary direction, pregnant or nursing mothers with increased demands, and seniors whose appetite has faded. Everyone else belongs on the food-improvement track instead of the bottle track.',
        tips: [
          'Fix the base diet first; bottles cannot outrank hay quality.',
          'Note real gaps honestly: recovery, pregnancy, age, or vitamin C.',
          'Ask your exotics vet before adding anything to a healthy animal.',
        ],
      },
      {
        id: 'vitamin-c-case',
        title: 'Guinea Pigs and the Vitamin They Lack',
        content:
          'Guinea pigs share one awkward trait with humans: neither can synthesize vitamin C internally, so the vitamin has to arrive in food every day. A cavy eating plenty of fresh peppers, leafy greens, and herbs often covers the requirement from vegetables alone, while a picky eater leans on stabilized vitamin C in fortified pellets. The failure mode is scurvy, and it announces itself through a rough coat, reluctance to move, swollen or tender joints, and wounds that heal badly. Suspect it, and a veterinarian experienced with exotics needs to see the animal promptly.',
        callout: {
          type: 'vet-note',
          title: 'Scurvy moves in weeks',
          text: 'Rough coat, sore joints, and slow healing in a guinea pig can mean vitamin C deficiency is already established. This is a visit-now situation, not a diet tweak for next month.',
        },
        tips: [
          'Serve vitamin-C-rich vegetables daily; peppers and leafy greens lead.',
          'Check that pellets list stabilized vitamin C with a far-off expiry.',
          'Treat rough coats and sore joints as a prompt vet visit.',
        ],
      },
      {
        id: 'vitamin-c-formats',
        title: 'Vitamin C Formats Worth Comparing',
        content:
          'Delivery format decides whether the vitamin survives to be absorbed. Water drops sound convenient and mostly fail, because vitamin C degrades quickly in light and water, so a bottle dosed in the morning is weak by evening, and you never know how much each sip delivered. Tablets and crumbles given by hand, or sprinkled over vegetables, put a countable amount into the animal on schedule. As you compare supplement listings, look for stabilized formulations with distant expiry dates, and treat anything sugary as a treat wearing a supplement costume.',
        tips: [
          'Hand-feed tablets or crumbles so dosing stays countable.',
          'Skip water drops; light and standing water ruin the vitamin.',
          'Match the formulation to an animal who actually accepts it.',
        ],
      },
      {
        id: 'digestive-support',
        title: 'Rabbits and Digestive Support Products',
        content:
          'The digestive supplement aisle loves rabbits, and rabbits mostly do not need it. A healthy gut is a hay-fed gut, and the paste tubes and probiotic pots marketed for digestion cannot substitute for the fiber that drives the whole system. Where these products earn a place is under direction: recovering from stasis, finishing a course of antibiotics that unsettled gut flora, or transitioning a rescue whose history you do not know. Used that way, they are tools with a job, not insurance policies against a mediocre diet.',
        callout: {
          type: 'pro-tip',
          title: 'Direction beats habit',
          text: 'Digestive pastes and probiotics shine during recovery, prescribed on a schedule by an exotics-savvy vet. Daily gut-health dosing of a healthy rabbit mostly produces expensive urine and false confidence.',
        },
        tips: [
          'Spend supplement money on better hay before anything else.',
          "Use digestive pastes for recovery, on your vet's schedule.",
          'Introduce any gut product slowly, watching droppings for changes.',
        ],
      },
      {
        id: 'multivitamin-honesty',
        title: 'Multivitamins and the Overdose Question',
        content:
          'Extra vitamins are not automatically harmless. Fat-soluble vitamins accumulate in body fat rather than washing out with water, so a daily multivitamin layered over a complete pelleted ration can quietly overshoot, and over-supplementation carries its own symptom list. Water-soluble extras mostly pass through, which means the label promised more than the body keeps. A well-formulated species-specific pellet already carries a vitamin and mineral profile sized to the animal, which is why the multivitamin bottle is the last stop on the shopping list, not the first.',
        tips: [
          'Read your pellet bag before adding any daily multivitamin.',
          'Watch fat-soluble vitamins especially; they accumulate rather than flush.',
          'Treat added sugars in supplements as a red flag outright.',
        ],
      },
      {
        id: 'shelf-filter',
        title: 'Shopping the Shelf With a Filter',
        content:
          "Bring skepticism to the supplement aisle and it rewards you. Check that any product names your exact species rather than 'small pets' generically, since a hamster and a rabbit differ by magnitudes in dose. Read the actives and their amounts, hunt the expiry date because vitamins fade on shelves, and put back anything whose first ingredients are sugars or syrups. Comparing supplement listings side by side makes marketing language fall away fast, since the columns you actually need are ingredients, dose, and date, and everything else is decoration.",
        tips: [
          'Match products to your exact species, not a generic label.',
          'Reject supplements whose leading ingredients are sugar or syrup.',
          'Prefer recent expiry dates; vitamins weaken while waiting on shelves.',
        ],
      },
      {
        id: 'vet-plan',
        title: 'Working a Supplement Plan With Your Vet',
        content:
          'The right person to green-light a supplement has examined your animal. An exotics-savvy veterinarian can read bloodwork, weigh appetite trends, and tell you whether the weakness you are supplementing is real or projected, which saves money and organs alike. Bring the actual bottles to the appointment, since ingredients matter more than brand names, and ask for dose, duration, and a review date. Seniors, rescues, and chronically picky eaters deserve that conversation most, and healthy adults on good diets deserve it least, which is the whole point of the honest shortlist.',
        tips: [
          'Bring supplement bottles to appointments; ingredients outrank brand names.',
          'Ask for a dose, duration, and review date in writing.',
          'Recheck seniors and picky eaters rather than dosing on guesses.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'The real list',
        items: [
          { highlight: 'Vitamin C daily', text: 'guinea pigs cannot make it; food must deliver it.' },
          { highlight: 'Fiber beats bottles', text: 'a hay-first diet closes most supplement gaps entirely.' },
          { highlight: 'Under vet direction', text: 'recovery, nursing, and seniors justify support on a schedule.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Format matters',
        items: [
          { highlight: 'Tablets over drops', text: 'water dosing degrades before the animal drinks it.' },
          { highlight: 'Stabilized and fresh', text: 'check expiry dates; vitamins weaken quietly on shelves.' },
          { highlight: 'Species on the label', text: "a hamster dose differs from a rabbit's by magnitudes." },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Avoid the overbuy',
        items: [
          { highlight: 'Multivitamins come last', text: 'complete pellets already carry a sized mineral profile.' },
          { highlight: 'Sugar is a flag', text: 'syrupy supplements are treats in a lab coat.' },
          { highlight: 'Vet reviews plans', text: 'bring the bottles and get doses in writing.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Do guinea pigs need vitamin C every day?',
        answer:
          'Yes, every single day, because their bodies cannot manufacture it. Fresh vegetables rich in the vitamin, bell peppers especially, plus a pellet listing stabilized vitamin C cover most cavies. For picky eaters or thin seniors, a measured tablet or crumble closes the gap more reliably than water drops, which weaken standing in a bottle.',
      },
      {
        question: 'Do rabbits need vitamin supplements?',
        answer:
          'Healthy rabbits on unlimited hay with measured pellets and daily greens have no meaningful vitamin gap to close. Products earn a place during recovery, after antibiotics, or under a specific veterinary plan, not as daily insurance. Spending the same money on fresher, coarser hay delivers measurably more benefit than any bottle on the shelf.',
      },
      {
        question: 'Are vitamin drops in water effective?',
        answer:
          'Weakly at best. Vitamin C breaks down in light and standing water, so a morning dose fades across the day, and you cannot confirm how much each animal actually drank. Tablets, crumbles, or vitamin-rich vegetables put a measurable amount into a known mouth. Reserve water drops for a cavy who refuses every other format.',
      },
      {
        question: 'Can you over-supplement a small animal?',
        answer:
          'Yes, particularly with fat-soluble vitamins that build up in body tissue instead of passing out in urine. Layering a daily multivitamin over a complete pellet ration is the common path toward overshoot. Symptoms vary by vitamin, so the honest rule is simple: nothing goes into the bowl daily without a reason and a plan you have discussed with your vet.',
      },
      {
        question: 'What are signs of vitamin C deficiency in guinea pigs?',
        answer:
          'Watch for a rough or unkempt coat, reluctance to move or be touched, tender swollen joints, bleeding gums, and wounds that heal slowly. These signs mean the deficiency is already established, so an exotics-savvy veterinarian should see the animal promptly, and recovery includes a diet overhaul built around daily vitamin C sources.',
      },
    ],
  },

  // =========================================================================
  // small-animal/small-animal-toys — the chew psychology
  // =========================================================================
  'small-animal/small-animal-toys': {
    heroTitle: 'Small Animal Toys Built for Teeth That Never Stop',
    heroSubheadline:
      'Chewing is dental care, wheels are spines on standby, and puzzles are mental workouts. Learn which small animal toys are safe by design and which deserve a pass.',
    metaDescription:
      'Small pet teeth grow for life, so chewing is healthcare. Pick safe woods, solid correctly sized wheels, and foraging puzzles that actually tire a busy brain.',
    introSummary:
      'Open a small animal\u2019s mouth and the engineering explains the toy aisle: incisors that grow continuously and a grinding set behind them, always working. A wild rabbit spends waking hours processing tough vegetation, and a cage-bound one inherits the same urges with nowhere to spend them. Toys are not decorations for these animals; they are dental equipment and mental exercise in one purchase. Choosing well means knowing which materials are safe by accident, which wheel fits a spine, and which puzzles tire a busy brain.',
    sections: [
      {
        id: 'teeth-grow-forever',
        title: 'Teeth That Never Stop Growing',
        content:
          'Rabbits, guinea pigs, chinchillas, hamsters, and rats all belong to a group whose teeth erupt for life, worn down at exactly the rate they grow, but only when the diet and chewing supply enough abrasion. Without that work, molars spike, incisors lengthen into tusks, and eating becomes a mechanical problem no animal can solve by wanting to chew. That is the quiet logic behind every chew toy: the toy is dentistry you hand over voluntarily. Chewing on the right surfaces is maintenance; chewing on cage bars is a symptom.',
        callout: {
          type: 'warning',
          title: 'Bar chewing is a signal',
          text: 'Constant chewing on cage bars usually means the habitat is too small or too bare, not that the animal loves the metal. Fix the space first, then supply proper chews, and ask an exotics-savvy vet if the habit persists.',
        },
        tips: [
          'Provide abrasive chews daily; teeth grow whether or not toys exist.',
          'Read cage-bar chewing as boredom or space trouble, not preference.',
          'Book a dental check if eating slows or drooling starts.',
        ],
      },
      {
        id: 'safe-materials',
        title: 'Safe Woods and Materials to Trust',
        content:
          'Safe chew materials share one trait: nothing harmful happens when swallowed in small amounts. Untreated hardwood blocks, willow balls and tunnels, apple and pear sticks, seagrass mats, plain cardboard, and loofah all qualify, while anything painted, glazed, varnished, or glued does not. Fresh pine and cedar belong on the avoid list thanks to aromatic oils; kiln-dried pine is the usual safer compromise in wooden hides. Inspect new chews for staples, wire frames hidden inside woven shapes, and sharp splinters, because the weaving hides hardware more often than any label admits.',
        tips: [
          'Stick with untreated wood, willow, seagrass, and plain cardboard.',
          'Refuse painted, glazed, or glued chews on any shelf.',
          'Check inside woven toys for hidden wire frames before offering.',
        ],
      },
      {
        id: 'chews-to-chewer',
        title: 'Matching Chews to the Chewer',
        content:
          'Chew preferences vary by species and personality, so a small rotation beats betting everything on one block. The table pairs common chew formats with their natural audiences and the check worth making. As you browse chew-toy listings, the material list outranks the photo: anything with unspecified \u2019wood\u2019 or mystery composite deserves a pass, while named, untreated woods and plant materials earn a place.',
        tableData: {
          headers: ['Chew format', 'Natural audience', 'Check before buying'],
          rows: [
            ['Willow balls and tunnels', 'Rabbits, guinea pigs', 'No wire frame hiding inside the weave'],
            ['Apple or pear sticks', 'Chinchillas, hamsters', 'Untreated, unsprayed, and snapped clean'],
            ['Plain cardboard boxes', 'Rabbits, rats', 'Tape, staples, and glossy print removed'],
            ['Seagrass and loofah mats', 'Guinea pigs, floor nibblers', 'Fibers natural, no plastic binding'],
            ['Pumice stones', 'Chinchillas, degus', 'Soft enough to crumble, not fracture teeth'],
          ],
        },
        tips: [
          'Rotate three or four chews rather than trusting one favorite.',
          'Pull any chew that splinters into sharp shards immediately.',
        ],
      },
      {
        id: 'wheels-done-right',
        title: 'Exercise Wheels, Sized and Solid',
        content:
          'A wheel is only as good as its surface and its diameter. Solid running surfaces protect feet and tails; runged or mesh wheels catch toes and tails with depressing regularity. Diameter is the spine question: on a too-small wheel, a running hamster arches backward at an unnatural angle, and the habit repeated nightly adds up. Choose the largest solid wheel the enclosure fits, with the widest running surface, and watch one full session from the side: the back should stay level, the tail should stay relaxed, and the gait should look like running, not acrobatics. Guinea pigs get no wheels at all; their bodies are wrong for them.',
        tips: [
          'Choose solid surfaces; rungs catch toes and tails overnight.',
          'Size up whenever the back arches during a running session.',
          'Give guinea pigs floor space and tunnels instead of wheels.',
        ],
      },
      {
        id: 'foraging-puzzles',
        title: 'Foraging Toys That Earn Their Keep',
        content:
          'A small animal with a full food bowl and nothing to do has no job, and foraging toys restore one. Treat balls that release a pellet per push, snuffle mats hiding herb bits, toilet rolls stuffed with hay, and puzzle boards with sliding lids all convert dinner into an activity. Start easy and make each stage slightly harder, because a puzzle that never pays out gets abandoned by Thursday. Rotate two or three foraging setups weekly so none goes stale. The behavior you want to see at the end is the animal working calmly for food, which is exactly what their wild relatives do all day.',
        callout: {
          type: 'pro-tip',
          title: 'Start stupidly easy',
          text: 'A foraging toy that pays out on the first nudge teaches the game. Difficulty can climb later; a puzzle that stumps an animal on night one just becomes cage furniture.',
        },
        tips: [
          'Stuff toilet rolls with hay for the cheapest foraging toy available.',
          'Make puzzles slightly harder only after the animal solves them.',
          'Rotate foraging setups weekly so the routine never goes stale.',
        ],
      },
      {
        id: 'toys-that-arent',
        title: "Toys That Look Fun but Aren't",
        content:
          'Some classics deserve retirement. Clear plastic exercise balls give hamsters no exit, poor ventilation, and a disorienting roll, which is why welfare voices have moved away from them; a secure playpen does the same job without the stress. Wire wheels, small-diameter wheels, and anything with gaps that could pinch toes have already been covered by better designs. Flimsy plastic toys with small detachable parts become ingestion hazards the first time a determined chewer meets them, and tightly dyed fabrics leach color when wet. The test is simple: if you cannot identify the material, do not let a gnawer identify it either.',
        tips: [
          'Swap hamster balls for a secure playpen with hides inside.',
          'Reject toys with pinching gaps or fragile detachable parts.',
          'Run damp fingers over dyed toys; color transfer means out.',
        ],
      },
      {
        id: 'rotation-alive',
        title: 'Keeping a Toy Rotation Alive',
        content:
          'Toys have working lives, and small animals end them quickly. A weekly five-minute inspection catches the splintered block, the fraying seagrass, and the chewed-through cardboard before they become hazards, and anything worn goes straight into the bin rather than the rotation basket. Keep a small queue of unopened chews and introduce one new item while removing one tired item, so the enclosure always holds novelty without clutter. Comparing chew-toy listings as a set, rather than one-off impulse buys, keeps the queue affordable and the materials varied, which is the entire game.',
        tips: [
          'Inspect the whole toy box weekly for splinters and fraying.',
          'Retire worn chews immediately; worn is one step from dangerous.',
          'Queue two unopened toys so novelty always waits on deck.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Safe by default',
        items: [
          { highlight: 'Teeth grow forever', text: 'chewing is dental maintenance the enclosure must supply.' },
          { highlight: 'Named natural materials', text: 'willow, apple sticks, seagrass, and plain cardboard earn trust.' },
          { highlight: 'No mystery composites', text: 'if you cannot name it, a gnawer should not test it.' },
        ],
      },
      {
        icon: 'award',
        title: 'Wheels done right',
        items: [
          { highlight: 'Solid surfaces only', text: 'rungs and mesh catch toes and tails overnight.' },
          { highlight: 'Size for a level spine', text: 'the back stays straight during every running session.' },
          { highlight: 'No wheels for cavies', text: 'guinea pigs get floor space, tunnels, and hides instead.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Busy by design',
        items: [
          { highlight: 'Foraging restores the job', text: 'puzzle feeders turn dinner into an hour of work.' },
          { highlight: 'Rotation keeps novelty', text: 'one new toy in, one tired toy out, weekly.' },
          { highlight: 'Inspect before trusting', text: 'five minutes each week catches splinters before mouths do.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Why does my rabbit chew on cage bars?',
        answer:
          'Usually because the enclosure is too small or too empty, not because the metal tastes good. Bar chewing reflects an unmet need for space, exercise, or chewing material, and it can wear teeth into misalignment. Expand the habitat, add proper chews and foraging toys, and give daily running time. If the habit persists, mention it to an exotics-savvy vet.',
      },
      {
        question: 'Are cardboard boxes safe as chew toys?',
        answer:
          'Yes, when they are plain and prepared. Remove tape, staples, shipping labels, and any glossy coating, because those are the parts that cause trouble. Plain corrugated cardboard is harmless in the small amounts swallowed during enthusiastic demolition, and rabbits and rats especially enjoy the combination of hiding place and chew project that a good box provides.',
      },
      {
        question: 'What size wheel does my hamster need?',
        answer:
          "The largest solid wheel the enclosure can hold, judged by one rule: while running, the hamster's back stays level rather than arching upward. Dwarfs manage on smaller diameters than Syrians, but undersized wheels bother both, so size up whenever you see the spine curving. Solid surfaces only, since rungs and mesh catch tiny toes during fast night runs.",
      },
      {
        question: 'Can guinea pigs use exercise wheels or balls?',
        answer:
          'No. Their long backs and short legs make wheel running a strain rather than exercise, and plastic balls restrict ventilation while preventing normal posture. Invest the same money in floor space, tunnels, and hideys, which is what cavies actually use. Rabbits similarly get nothing from hamster wheels and everything from space to run.',
      },
      {
        question: 'How do I know a wood chew is safe?',
        answer:
          "Look for named, untreated woods such as willow, apple, pear, or kiln-dried pine, sold without paint, varnish, glue, or stains. If a listing says just 'wood' or 'natural material' without naming the species, treat that as a pass. Hardware checks matter too: no staples, no wire frames inside woven shapes, and no splinters waiting along the grain.",
      },
    ],
  },

  // =========================================================================
  // small-animal/small-animal-treats — treat discipline
  // =========================================================================
  'small-animal/small-animal-treats': {
    heroTitle: 'Choosing Small Animal Treats Without the Sugar Spiral',
    heroSubheadline:
      'Treats are currency, not food, and small bodies run on tiny budgets. Learn the honest rankings, the true portions, and the hand-feeding habit that builds trust.',
    metaDescription:
      'Yogurt drops carry sugar, seed sticks are dessert, and portions belong at thumbnail size. Ration small animal treats and let hand-feeding build trust.',
    introSummary:
      'It starts innocently: a yogurt drop from the store counter, a seed stick clipped to the cage, a slice of apple whenever the whiskers twitch toward the kitchen. Six months later the scale tells the story. Small animals run on tiny metabolic budgets, so treat discipline is not stinginess; it keeps the currency valuable and the body functional. Happily, these animals need very little to feel celebrated. A thumbnail of cucumber from a flat palm outperforms any sugar-glued stick on both nutrition and trust.',
    sections: [
      {
        id: 'treats-as-currency',
        title: 'Treats Are Currency, Not Nutrition',
        content:
          'Think of a treat as a message, not a meal. It says hello, it seals a training moment, it bribes a guinea pig into trusting your hand, and none of those jobs require volume. The daily ration, hay and pellets and greens, is what actually builds the animal; treats only rent attention. Held that way, the shopping question stops being \u2019which treat is healthiest\u2019 and becomes \u2019which tiny thing carries the most meaning per gram\u2019, a frame that makes any treat aisle or online listing shelf easier to read.',
        tips: [
          'Define treat jobs first: greeting, training, or coaxing trust.',
          'Judge treats by meaning per gram, not bag size.',
          'Keep the main ration complete; extras stay extras.',
        ],
      },
      {
        id: 'yogurt-drop-problem',
        title: 'The Yogurt Drop Problem',
        content:
          'Yogurt drops are merchandised directly at small-animal owners, and they are the category\u2019s clearest mismatch. Rabbits and guinea pigs have digestive systems built for fiber, not milk sugar: after weaning they produce little of the enzyme that processes dairy, and the drops add concentrated sugar on top. An occasional crumb-sized piece will not cause visible disaster, but a daily habit contributes to weight gain and gut flora upsets in animals whose balance is famously fragile. The honest ranking puts yogurt drops beside candy, reserved for the rarest occasions, and herbs or vegetables in the everyday role.',
        callout: {
          type: 'warning',
          title: 'Dairy is not their food',
          text: 'Rabbits and guinea pigs lose the ability to digest milk sugars as they mature. A rare crumb survives; a daily yogurt-drop habit feeds obesity and dysbiosis, so treat the bag like a candy shelf.',
        },
        tips: [
          'Rank yogurt drops with candy: rare, tiny, and never daily.',
          'Offer herb sprigs instead when the ritual matters more than sugar.',
          'Watch for soft droppings after any sugary treat and pause accordingly.',
        ],
      },
      {
        id: 'seed-sticks',
        title: 'Seed Sticks as Occasional Centerpieces',
        content:
          'Honey-glued seed sticks look like enrichment and mostly behave like desserts. The glue is syrup, the seeds are fatty, and a determined eater strips the whole stick in a sitting, which is why the honest use is occasional and structural: hang one when you are away for the afternoon, or clip one where the animal has to work upside down for it, so the calories buy time and gymnastics. Picking the seeds off by hand into foraging toys stretches one stick across a week. As everyday fare, they are the fast-food tier of the shelf.',
        tips: [
          'Hang seed sticks where working for them costs real effort.',
          'Strip seeds into foraging toys to stretch one across days.',
          'Treat a finished stick as dessert night, not a routine.',
        ],
      },
      {
        id: 'fresh-portions',
        title: 'Fresh Treats in True Portions',
        content:
          'Fresh food treats reward patience with actual nutrition, and the portion rule is brutal simplicity: think thumbnail, not palm. A sliver of cucumber, one berry halved, a sprig of cilantro, a thumb-sized strip of bell pepper carries enormous meaning for a body that small. Introduce anything unfamiliar singly and slowly, give soft fruits even more sparingly than vegetables because sugar concentrates there, and remove uneaten fresh bits before they wilt into a soggy mess. Variety stays the point; a rotating parade of small portions beats a daily repeat of one favorite.',
        tips: [
          'Portion fresh treats to thumbnail size, never palm size.',
          'Introduce new foods one at a time across several days.',
          'Clear uneaten fresh pieces within hours to keep the cage clean.',
        ],
      },
      {
        id: 'hand-feeding-trust',
        title: 'Hand Feeding as the Trust Engine',
        content:
          'For a prey animal, taking food from a giant hand is a decision against every instinct, which makes hand feeding the strongest trust exercise available without equipment. Sit at floor level, offer a flat palm with a herb sprig, and let the animal approach and retreat as many times as it needs; the retreats are part of the lesson. Guinea pigs learn that hands predict food and start wheeking at your footsteps, and shy rabbits graduate from taking to gently nudging for more. Speed is not the goal. A treat accepted calmly builds more trust than ten taken anxiously.',
        callout: {
          type: 'pro-tip',
          title: 'Floor level, open palm',
          text: 'Crouch so your silhouette shrinks, keep the hand flat and still, and let the animal set the pace. The retreats teach as much as the approaches.',
        },
        tips: [
          'Crouch at floor level so your silhouette stops looming.',
          'Hold the palm flat and still; motion reads as threat.',
          'Let retreats happen; returning on their own builds real trust.',
        ],
      },
      {
        id: 'weekly-budget',
        title: 'A Weekly Treat Budget That Holds',
        content:
          'Discipline survives better as a schedule than as willpower. A workable budget for most small animals: tiny fresh pieces can appear daily, herb-heavy and vegetable-based, while anything sugary, seedy, or dairy-adjacent waits for occasional slots a few times a week at most. Weigh the animal monthly and let the trend arbitrate; when the line creeps up, the treat budget tightens first, before anything else changes. Households with several people need one written rule, because five family members each being generous is how budgets silently die.',
        tips: [
          'Write the household treat rule down where everyone can see it.',
          'Weigh monthly and let trends decide before habits do.',
          'Reserve sugary formats for a few occasions weekly, at most.',
        ],
      },
      {
        id: 'label-reading',
        title: 'Reading Treat Labels Like a Ration',
        content:
          'The ingredient panel tells you whether a treat belongs in the daily rotation or the rare pile, and it reads the same way as food packaging. Look for one recognizable ingredient at the top, herbs and vegetables rather than syrups and flours, and no added sugar masquerading under syrup, molasses, or juice concentrate names. Comparing small-animal treat listings side by side sorts the shelf fast, because the same category holds both a plain dried herb bundle and a grain-based candy in colorful packaging. Buy for the ingredient list, and let the animal\u2019s waistline thank you later.',
        tips: [
          'Scan ingredient panels for syrups hiding under concentrate names.',
          'Favor single-ingredient treats: dried herbs, plain hay cookies, flowers.',
          'Compare treat listings as a set before committing to one bag.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Portion honestly',
        items: [
          { highlight: 'Thumbnail, not palm', text: 'small bodies turn tiny portions into real occasions.' },
          { highlight: 'Fresh beats sweet', text: 'herbs and vegetable slivers carry nutrition with the gesture.' },
          { highlight: 'Sweets stay occasional', text: 'a few weekly slots, never a daily ritual.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Category honesty',
        items: [
          { highlight: 'Yogurt drops are candy', text: 'milk sugar and syrup sit wrong in fiber guts.' },
          { highlight: 'Seed sticks are dessert', text: 'hang them occasionally, and make the animal work.' },
          { highlight: 'Labels tell the tier', text: 'syrups and concentrates mean the rare pile, not daily.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Trust by hand',
        items: [
          { highlight: 'Flat palm, low posture', text: 'shrink your silhouette and let the animal approach.' },
          { highlight: 'Retreats teach too', text: 'returning voluntarily is where real confidence gets built.' },
          { highlight: 'Calm beats quantity', text: 'one accepted treat quietly outperforms ten anxious grabs.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Can rabbits and guinea pigs eat yogurt drops?',
        answer:
          'Technically they can swallow them; nutritionally they should not. Milk sugars sit poorly in mature rabbit and cavy digestion, and the drops carry concentrated sweeteners on top. Reserve them for the rarest treat occasions if at all, and build daily rituals around herbs and vegetable slivers instead, which carry the same gesture without the sugar load.',
      },
      {
        question: 'How many treats can a hamster have per day?',
        answer:
          'Think a single fingertip-sized piece, or a few sunflower or pumpkin seeds, and adjust downward if the bowl ration goes unfinished. Hamsters hoard, so uneaten treats surface later in stashes; check the nest during weekly cleans. Fatty seeds belong in the occasional tier, while tiny bits of fresh vegetable can appear more often.',
      },
      {
        question: 'Are seed treat sticks bad for small animals?',
        answer:
          'Not evil, just dessert. The seeds ride on syrup, the calories add up quickly, and animals strip a whole stick fast when it hangs in reach. Use them occasionally as foraging centerpieces placed where eating costs effort, strip seeds into puzzle toys to stretch them, and keep the everyday tier to herbs and fresh slivers.',
      },
      {
        question: 'What fresh treats are safe for daily offering?',
        answer:
          'Herb sprigs like cilantro, parsley, and dill, plus cucumber slices, bell pepper strips, and a leaf of romaine, all work in thumbnail portions. Introduce each new food singly over a few days, and keep fruit to rare slivers since its sugars concentrate. Whatever they leave behind, remove within hours so nothing sours in the cage.',
      },
      {
        question: 'How do I hand-feed a shy rescue animal?',
        answer:
          'Sit at floor level, keep your palm flat with a long herb sprig or cucumber stick, and stay patient through several approach-and-retreat cycles. Let the animal finish the retreat each time; choosing to return is the lesson. With guinea pigs, expect wheeking to replace hiding within weeks. Never grab or corner to deliver a treat.',
      },
    ],
  },

  // =========================================================================
  // small-animal/treats-ferret — ferret treats done right
  // =========================================================================
  'small-animal/treats-ferret': {
    heroTitle: 'Ferret Treats That Respect the Obligate Carnivore',
    heroSubheadline:
      "A ferret's gut is built for meat and almost nothing else. Choose treats that respect that biology, and learn the hand-feeding moves that keep your fingers intact.",
    metaDescription:
      'Ferrets are obligate carnivores, so treats belong to meat: freeze-dried bites, training oils, and hand-feeding technique that skips raisins and sugar entirely.',
    introSummary:
      'What does a meat-only animal get as a treat? The answer shapes ferret health more than most owners expect, because everything behind a ferret\u2019s short digestive tract is built for protein and fat, with almost no machinery left for sugar or fiber. That single biology sentence decides the whole treat shelf: meat-based pieces as the everyday currency, oils reserved for training and nail trims, and sugary human snacks, the raisin included, kept out entirely. Here is the ferret treat logic, from choosing to hand feeding.',
    sections: [
      {
        id: 'meat-biology',
        title: 'A Digestive System Built for Meat',
        content:
          'Ferrets are obligate carnivores in the strict sense: a short intestinal tract, no functional cecum, and a metabolism that runs on animal protein and fat. Sugars and starches pass through largely unusable and, worse, are implicated in the pancreatic trouble ferrets are already prone to. Treat selection follows that blueprint. Meat, organs, and animal-based fats digest cleanly and completely, while grain-heavy biscuits and sweetened drops spend their calories on nothing the body can bank. The staple diet belongs to the food discussion; treats simply echo the same rule in miniature.',
        tips: [
          'Judge every treat by its animal-protein content first.',
          'Let the staple ration echo the same meat-first blueprint.',
          'Treat anything sweetened as a non-food for ferrets.',
        ],
      },
      {
        id: 'meat-based-treats',
        title: 'Meat-Based Treats That Make Sense',
        content:
          'Freeze-dried chicken, liver, and heart pieces top the practical list: light, single-ingredient, and instantly recognized by a nose built for prey. Cooked unseasoned chicken or turkey in fingertip shreds works fresh, and whole-prey style treats suit keepers already comfortable with raw feeding under veterinary guidance. Chew-style strips deserve a closer read, since many are built more like dog jerky, with glycerin, sweeteners, or salt doing quiet work on the ingredient list. Comparing freeze-dried treat listings side by side mostly comes down to the ingredient count, and one honest ingredient beats a paragraph of fractions every time.',
        tips: [
          'Start with single-ingredient freeze-dried chicken or liver pieces.',
          'Read jerky-style strips for glycerin, sweeteners, and salt.',
          'Offer fingertip shreds of cooked, unseasoned poultry as fresh treats.',
        ],
      },
      {
        id: 'raisin-warning',
        title: 'The Raisin Warning, Stated Plainly',
        content:
          'Older ferret folklore handed out raisins as treats, and the habit deserves full retirement. Sugary food is strongly associated with insulinoma, the pancreatic tumor ferrets are notoriously prone to, and dried fruit concentrates sugar into a dense little dose an animal this size should never see. The early signs creep in quietly: hind-leg weakness, drooling, a spaced-out stare, episodes that pass for clumsiness. Any of those in a ferret means a veterinarian experienced with exotics, that day. For treat purposes, raisins and fruit simply are not food a ferret can use.',
        callout: {
          type: 'vet-note',
          title: 'Insulinoma announces itself subtly',
          text: 'Hind-leg wobbliness, drooling, or a distant stare in a ferret can signal low blood sugar from a pancreatic tumor. That is a same-day call to an exotics-savvy vet, not a wait-and-see weekend.',
        },
        tips: [
          'Keep raisins, fruit, and sweets out of ferret treat rotation entirely.',
          'Learn the early insulinoma signs: weakness, drooling, staring episodes.',
          'Treat sudden clumsiness in a ferret as a vet-day event.',
        ],
      },
      {
        id: 'oil-currency',
        title: 'Oil Treats as Training Currency',
        content:
          'A lick of salmon oil or a lickable meat paste is ferret currency at its finest, precisely because it is scarce, aromatic, and instant. Oils earn their calories as tools: a fingertip smear bribes a ferret through nail trims, a spoonful licks keeps a wriggler still for ear cleaning, and a dab on a harness turns gear inspection into something anticipated. Keep the portions tiny, since fat carries calories faster than anything else on the menu, and let oil stay an event rather than a habit. This is the one treat category where less truly is more.',
        tips: [
          'Spend oil licks on grooming, harness training, and vet visits.',
          'Keep oil portions fingertip-sized; fat calories add up fast.',
          'Pair the lick with handling so tools predict good things.',
        ],
      },
      {
        id: 'hand-feeding-safety',
        title: 'Hand Feeding Without Becoming a Snack',
        content:
          'Excited ferrets grab food with the enthusiasm of a gator, and fingers wrapped in the same moment are casualties of geometry rather than aggression. The fixes are mechanical: offer long pieces held at the far end, keep a flat palm for licks, use a spoon or syringe for the most wound-up individuals, and wash your hands of lingering meat smells before casual handling. Kits learn bite inhibition through consistent, calm redirection, and a nip that drew blood deserves attention to the pattern, not punishment. Feed at the ferret\u2019s eye level, and you will keep your fingertips for another decade.',
        tips: [
          'Offer long pieces at the far end so fingers stay clear.',
          'Use spoons for licks during excited moments or new introductions.',
          'Wash meat smells off hands before play so fingers stop resembling food.',
        ],
      },
      {
        id: 'stash-instinct',
        title: 'The Stash Instinct Changes the Rules',
        content:
          'Ferrets hoard, and treats disappear into caches you will find later behind furniture and inside couches. That instinct changes treat logistics: cached meat spoils, attracts insects, and quietly rots somewhere you cannot smell until you can. Prefer consumable-on-the-spot formats, count out pieces you can account for, and run a periodic stash audit during deep cleans, discarding anything the ferret squirreled away. Oils and lickables dodge the problem entirely, which is one more argument for currency over volume in this species. A hoard inspection also tells you what your ferret values most, which is useful intelligence.',
        callout: {
          type: 'pro-tip',
          title: 'Map the hoards',
          text: 'Keep a note of where your ferret caches treats; the list becomes your spoilage inspection route during every deep clean.',
        },
        tips: [
          'Audit known stash spots during deep cleans and discard the hoard.',
          'Hand out pieces you can count, so caches stay trackable.',
          'Choose instantly eaten formats over anything storable for everyday treats.',
        ],
      },
      {
        id: 'label-biology',
        title: 'Reading Labels Like a Biologist',
        content:
          'Ferret treat labels reward a specific reading habit: scan for a named meat in the first position, then count how many plant ingredients follow. Sugar appears under syrup, molasses, and juice names; grains pad the weight of products that photograph like meat but budget like kibble. The ingredient panel is the biology test, since a ferret\u2019s digestive hardware ignores most of what a mixed treat delivers. As you browse the ferret treat aisle with that lens, the shelf separates quickly into a short list of genuinely species-appropriate options and a long tail of cleverly photographed snacks.',
        tips: [
          'Demand a named meat first; vague terms hide the real content.',
          'Count plant ingredients after the meat; fewer means better here.',
          'Reject treats listing any syrup, molasses, or juice concentrate.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Meat is the rule',
        items: [
          { highlight: 'Animal protein first', text: "a ferret's gut runs on meat and nothing else." },
          { highlight: 'Single-ingredient treats win', text: 'freeze-dried chicken and liver beat mixed biscuit bags.' },
          { highlight: 'Labels are biology tests', text: 'count the plant fillers behind the named meat.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Known hazards',
        items: [
          { highlight: 'Raisins are out', text: 'sugar links straight to insulinoma risk in ferrets.' },
          { highlight: 'Watch for weakness', text: 'hind-leg wobbling and drooling mean an urgent vet call.' },
          { highlight: 'Stashes need audits', text: 'hoarded meat spoils quietly inside furniture and couches.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Smart currency',
        items: [
          { highlight: 'Oil licks train', text: 'nail trims and harness work go smoother with salmon oil.' },
          { highlight: 'Long treats protect fingers', text: 'hold the far end when a ferret is overexcited.' },
          { highlight: 'Spoons for the zoomies', text: 'lickable treats by spoon keep eager teeth accounted for.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Can ferrets eat raisins or fruit?',
        answer:
          'No, and the reason is specific: sugary foods are linked to insulinoma, the pancreatic tumor ferrets are prone to, and dried fruit packs sugar densely. Fruit also delivers fiber a ferret cannot process. Keep the treat shelf meat-based and save the fruit bowl for yourself. A ferret who has eaten raisins and seems off deserves a prompt vet check.',
      },
      {
        question: 'What treats are safe for ferrets?',
        answer:
          'Meat-based ones, simply: freeze-dried chicken, liver, or heart; fingertip shreds of cooked unseasoned poultry; lickable meat pastes and oils used sparingly. Check labels so a named meat leads the ingredient list, and pass on anything built from grains, syrups, or sweeteners. Ferrets treat meat as food and everything else as filler.',
      },
      {
        question: 'Is salmon oil a good treat for ferrets?',
        answer:
          'In tiny amounts, yes, and best used as a tool. A fingertip of salmon oil bribes a ferret through nail trims, ear cleaning, and harness introductions, and most ferrets will work for the smell alone. Keep portions small, since oil calories are dense, and let the bottle live in the training kit rather than the dinner routine.',
      },
      {
        question: 'Why does my ferret hide treats everywhere?',
        answer:
          'Hoard instinct, and it is completely normal. Ferrets cache food the way their ancestors cached surplus prey, so treats vanish into couch cushions and hidey holes. The practical problem is spoilage: cached meat rots and can attract insects. Offer countable, instantly eaten treats, and audit the known stash spots during your regular deep clean.',
      },
      {
        question: 'How do I stop my ferret nipping fingers during treats?',
        answer:
          'Change the geometry before blaming the animal. Hold long treats at the far end, use a spoon for lickables when the ferret is bouncing off the walls, and wash meat smells off your hands before play. Consistent calm redirection teaches kits bite inhibition over time. Nipping that escalates or draws blood repeatedly is worth raising with an exotics-savvy vet.',
      },
    ],
  },
};
