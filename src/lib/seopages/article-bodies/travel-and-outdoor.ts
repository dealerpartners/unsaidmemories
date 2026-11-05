// ---------------------------------------------------------------------------
// Travel & Outdoor blog-article bodies for Pawzsly U.
//
// Nine original articles covering the travel-and-outdoor family: the category
// root (matching gear to the trip), carriers, backpack carriers, slings,
// strollers, purse carriers, car travel accessories, bicycle carriers, and
// bicycle trailers. Each article owns a distinct angle and is written to the
// WRITING-SPEC.md contract: on-topic, original prose, blog voice, honest
// trade-offs, no invented brands, prices, or statistics.
// ---------------------------------------------------------------------------
import type { ArticleBody } from './types';

export const TRAVEL_ARTICLES: Record<string, ArticleBody> = {
  'travel-and-outdoor': {
    heroTitle: "Matching Pet Travel Gear to the Trip You're Taking",
    heroSubheadline:
      "The right travel setup depends on where you're going and who's coming along. Here's how to pair each kind of trip with gear your pet will actually accept.",
    metaDescription:
      "Match pet travel gear to the trip, from errand runs and road trips to flights and trail days, with early acclimation steps and species-safety basics that work.",
    introSummary:
      "A tiny dog asleep in a tote bag at the farmers market, a cat announcing herself from a motel bathroom, a shepherd monitoring the trailhead parking lot. Travel with animals never looks the same twice, and the gear that succeeds follows the trip. A ten-minute errand and a cross-country drive ask different things of both of you. This article helps you sort the four basic trip types against your animal's temperament, start acclimation early, and decide between a carrier and a harness before anything goes in the car.",
    sections: [
      {
        id: 'trip-first-not-product',
        title: 'Start With the Trip, Not the Product',
        content:
          "Shopping for travel gear before naming the trip is how closets fill with unused crates. An errand run needs restraint and speed, not luggage. A road trip asks for containment that survives hours and one roadside cleanup. A flight is ruled by an airline's published dimensions before preference matters at all. A trail day belongs to worn gear, hydration, and paw reality. Write down the three trips you actually take most often, then let that list, not a catalog, decide what deserves space in your home.",
        tips: [
          'List your three most common trips and buy only for those first.',
          "Save flight decisions for after you confirm the airline's under-seat rules.",
          'Reserve trail gear purchases for animals already comfortable on leash.',
        ],
      },
      {
        id: 'gear-by-trip-type',
        title: 'Matching Gear to Four Kinds of Trips',
        content:
          "The table below pairs each trip with its core piece and the failure that most often follows the wrong choice. Read it as a planning tool rather than a shopping list, because your animal's size and temperament will bend every row. A confident terrier may tolerate an errand sling setup that would terrify an anxious cat, and a flight row collapses entirely if the carrier misses the airline's numbers.",
        tips: [
          'Confirm airline dimensions for your specific aircraft before any flight purchase.',
          'Choose road-trip containment your pet has already practiced at home.',
          'Pack trail water for two of you, plus a folding bowl.',
        ],
        tableData: {
          headers: ['Trip', 'Core gear', 'Usual failure'],
          rows: [
            ['Quick errand', 'Light carrier or sling', 'Gear grabbed too small in a rush'],
            ['Road trip', 'Crash-tested crate or harness tether', 'Hours of loose roaming in back'],
            ['Cabin flight', 'Airline-compliant soft carrier', 'Dimensions miss the aircraft rules'],
            ['Trail day', 'Backpack carrier plus hydration', 'Paws and stamina outrun the plan'],
            ['Motel overnight', 'Familiar bedding and a locking carrier', 'Night escapes in an unfamiliar room'],
          ],
        },
      },
      {
        id: 'temperament',
        title: 'Temperament Shapes Gear as Much as Size',
        content:
          "Two animals of identical weight can need opposite equipment. A bold cat who watches the world from a shoulder strap will fight a dark, enclosed box. A shy one finds that same darkness comforting, because coverage lowers the input coming in. Dogs split the same way: some settle when they can see you, others spin and pant unless a wall blocks the motion. Spend a week watching how your animal handles new rooms, strangers, and noise, and let that record argue with any product photo before money changes hands.",
        tips: [
          'Note whether your animal seeks cover or surveillance when stressed.',
          'Choose covered interiors for hiders and window access for watchers.',
          'Test reactions to noise, since travel is loud by default.',
        ],
      },
      {
        id: 'acclimate-early',
        title: 'Acclimate at Home, Weeks Before Departure',
        content:
          "Gear introduced on travel day is gear your animal has every reason to distrust. Set the carrier open in the living room two or three weeks out, feed meals beside it, then inside it, and drop treats through the top without closing the door. Practice short car rides that end somewhere better than the vet. Buckle the empty backpack on and let your dog inspect it on the floor. The animals who travel well are rarely calm by nature; they practiced until the equipment stopped meaning anything.",
        callout: {
          type: 'pro-tip',
          title: 'Two weeks is the floor',
          text: "Start acclimation the day the gear arrives, not the week before departure. Animals decide new objects are safe through repeated uneventful exposure, and cramming that process into a few days usually backfires.",
        },
        tips: [
          'Leave new carriers open at floor level with bedding inside.',
          'Feed one meal a day beside, then inside, new gear.',
          'End every practice car ride somewhere your dog enjoys.',
          'Add short door-closed sessions once entry is voluntary.',
        ],
      },
      {
        id: 'carrier-or-harness',
        title: 'The Carrier Versus Harness Decision',
        content:
          "Species draws the brightest line here. Cats, rabbits, and small birds travel in hard-sided or fully enclosed carriers, always, because a startled cat in a moving car is a driving hazard and a bolting risk at every door. Dogs over roughly fifteen pounds generally do better in a crash-rated harness that clips to the seat-belt buckle, or a secured crate in the cargo area. Small dogs can go either way, and the tiebreaker is how they handle confinement. As you compare restraint listings in our marketplace, the same question applies to each: does this piece fit the animal you actually live with?",
        tips: [
          'Default to enclosed carriers for cats, no exceptions in moving vehicles.',
          'Match large dogs to seat-belt harnesses or secured crates instead.',
          'Let confinement tolerance pick the answer for small dogs.',
        ],
      },
      {
        id: 'pack-the-kit',
        title: 'Build the Kit Around the Chosen Gear',
        content:
          "Whatever you select, its job is containment, and the rest of the kit handles everything else. Water and a folding bowl cover any trip longer than an hour. Waste bags and a small towel handle the predictable embarrassments. A harness worn at rest stops keeps a leash attachment away from the trachea. Photograph vaccination records and store prescriptions where you can reach them without unpacking the car. Bedding that smells like home turns a motel floor or a campsite crate into familiar territory, which is often the difference between sleep and singing.",
        tips: [
          'Keep water and a folding bowl within reach, not buried.',
          'Store documents digitally so borders and boarding ask less of you.',
          'Bring bedding from home for the first night anywhere new.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Plan the Trip',
        items: [
          { highlight: 'Three real trips', text: 'tell you which single piece of gear earns its space.' },
          { highlight: 'Errand versus flight', text: 'restraint and speed on one side, airline compliance on the other.' },
          { highlight: 'Trail-day gear lists', text: 'start with hydration and paw reality, not luggage volume.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Know the Animal',
        items: [
          { highlight: 'Hiders want cover', text: 'enclosed interiors calm animals who retreat when overwhelmed.' },
          { highlight: 'Watchers want windows', text: 'clear sightlines to you settle visually oriented passengers.' },
          { highlight: 'Practice before packing', text: 'two weeks of meals beside new gear prevents travel-day fights.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Restrain by Species',
        items: [
          { highlight: 'Cats ride enclosed', text: 'a loose cat in a moving car endangers every occupant.' },
          { highlight: 'Larger dogs tether', text: 'to crash-tested harnesses or ride secured in crates.' },
          { highlight: 'Small dogs vary', text: 'let confinement tolerance decide between carrier and restraint.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'What travel gear do I need for a road trip with my dog?',
        answer:
          "A crash-tested harness or secured crate for containment, plus water, a folding bowl, waste bags, and familiar bedding for the far end. If your dog wears a harness for the drive, attach any rest-stop leash there rather than a collar, which protects the throat during sudden moves.",
      },
      {
        question: 'How far in advance should I acclimate my pet to travel gear?',
        answer:
          "Give it two weeks at minimum, and more for anxious animals. Leave the carrier open in daily life, move meals progressively closer and then inside, and close the door only once entry is voluntary. Practice rides should end at pleasant places so the container predicts good outcomes rather than examinations.",
      },
      {
        question: 'Should my small dog travel in a carrier or a harness?',
        answer:
          "It depends on how the dog handles confinement. Animals who settle in small spaces travel safely in buckled carriers, while dogs who panic when enclosed do better in a crash-tested harness clipped to the seat belt. Either way, the piece needs practice sessions at home before it is trusted on a real route.",
      },
      {
        question: 'Can I bring my cat on a hike?',
        answer:
          "Some cats take to leash walking and even backpack riding, but only after patient indoor training. Start with a fitted harness worn indoors for short sessions, then carry her in a window-style pack where she can watch. Keep the outing short, choose quiet paths, and retreat the moment her body language says the input is too much.",
      },
      {
        question: 'What should I pack for a trail day with my dog?',
        answer:
          "Water for both of you and a collapsible bowl, waste bags, a small first aid kit, and a towel for creek crossings. Check paws before and after for cuts or worn pads, and keep a light pack option ready in case the return leg gets long. Leash laws apply on most marked trails.",
      },
    ],
    heroImageUrl: '/images/aussie_shepherd.jpg',
    heroImageAlt: 'Australian shepherd ready for an outdoor trip',
  },

  'travel-and-outdoor/carriers': {
    heroTitle: 'Pet Carriers: Choosing the Right Shell for the Journey',
    heroSubheadline:
      'A carrier is the one piece of gear your pet rides inside. Here is how to size it, read airline rules, and pick between hard and soft shells without guessing.',
    metaDescription:
      'Choose a pet carrier with honest sizing steps, airline under-seat checks, hard-shell versus soft-sided trade-offs, and door and crash-safety details that count.',
    introSummary:
      "The classic carrier mistake happens in the aisle: choosing for looks while the animal is still at home. Then the cat refuses it, the zipper splits, or the airline counter sends you away over two missing inches. A carrier is a shell your animal rides inside, and its fitness is measurable. Length, height, door placement, and shell material each change how a trip goes. Work through the checks below and any carrier you consider, including the listings on our marketplace pages, will either measure up or rule itself out.",
    sections: [
      {
        id: 'what-a-carrier-does',
        title: 'What a Good Carrier Has to Do',
        content:
          "Its first job is containment during panic. A frightened animal pushes, claws, and throws weight at walls and doors, so seams, zipper tracks, and latch mechanisms carry the real load. The second job is comfort for the duration of the trip, which is where size and airflow enter. The third is convenient loading, because a carrier you can maneuver one-handed, or place on a vet table and open from the top, changes the whole experience for a reluctant passenger. Price rarely predicts any of these three.",
        tips: [
          'Load-test latches and zippers in the store before buying anything.',
          'Press the walls; flimsy flex will flex more with a panicked animal inside.',
          'Check that the floor is rigid, since pets stand on it for hours.',
        ],
      },
      {
        id: 'hard-versus-soft',
        title: 'Hard-Shell Versus Soft-Sided, Honestly',
        content:
          "Neither shell wins outright, and pretending otherwise is how the wrong carrier gets bought. Rigid shells shrug off claws and rough handling and scrub clean after accidents. Soft shells squeeze into shapes and under seats that rigid ones cannot, at the cost of a determined animal working the zipper. The table below lays out the trade-offs, and the honest reading is that many households eventually own one of each.",
        tips: [
          'Pick latch quality for claw-heavy passengers and zippers for calm ones.',
          'Confirm washability before the first accident rather than after it.',
          'Airline soft-shell flex has limits; never force a rigid under a seat.',
        ],
        tableData: {
          headers: ['Point of comparison', 'Hard-shell', 'Soft-sided'],
          rows: [
            ['Wall behavior', 'Rigid, claw-resistant', 'Padded, can be flexed'],
            ['Cleaning after accidents', 'Wipes and scrubs clean', 'Removable, washable liner'],
            ['Under-seat fit', 'Fixed dimensions only', 'Compresses slightly to fit'],
            ['Escape resistance', 'Latch-dependent, very solid', 'Zipper-dependent, needs guards'],
            ['Best passenger', 'Chewers and scratchers', 'Calm, seasoned travelers'],
          ],
        },
      },
      {
        id: 'measuring',
        title: 'Measuring the Animal, Growth Included',
        content:
          "Run a tape from the nose to where the tail meets the body, then add roughly a quarter of that length so the animal can stand, turn, and settle. Measure standing height at the crown of the head, ears included, because erect ears bruise against hard tops on every bump. Kittens and puppies deserve their adult dimensions plus a folded towel taking up the slack, since buying twice in six months helps nobody. Weigh the animal too, because stated weight ratings exist and quietly matter.",
        tips: [
          'Add a quarter of body length for standing and turning room.',
          'Include ear height, since upright ears press against hard tops.',
          'Buy growing animals the adult size and pad the excess.',
        ],
      },
      {
        id: 'airline-rules',
        title: 'Airline Under-Seat Rules Decide Flights',
        content:
          "No universal dimension exists, which is the whole difficulty. Each airline publishes its own under-seat maximums, they differ between aircraft types on the same route, and the gate agent measures the carrier rather than the brochure. Soft-sided shells get slight forgiveness because they compress, but only within reason. Before buying for a flight, find the exact aircraft on your reservation, pull that airline's current pet policy, and write the numbers down. Then check the carrier's stated dimensions against every number, including height, which trips people up most often.",
        callout: {
          type: 'warning',
          title: 'Aircraft swaps change the math',
          text: "Aircraft substitutions happen, and a smaller replacement jet can shrink the under-seat space your reservation promised. Arrive early, keep the animal used to the carrier beforehand, and call the airline the day before to confirm the equipment scheduled on your route.",
        },
        tips: [
          'Pull pet policy numbers for your exact aircraft, then recheck at check-in.',
          'Measure carrier height loaded, since bedding adds real inches.',
          'Reserve pet cabin space early; airlines cap animals per flight.',
        ],
      },
      {
        id: 'doors-and-loading',
        title: 'Top Doors, Side Doors, and Loading Cats',
        content:
          "A top-loading door turns vet-day loading from a wrestling match into a lowering. Cats in particular go in more willingly when they descend into a carrier rather than get shoved through a front hatch. Side doors earn their keep at the clinic, where a nervous patient can be examined or soothed without full extraction, and at home, where two openings mean twice the escape points to audit before each trip. Whatever the configuration, test every latch one-handed while holding the carrier at carry height.",
        tips: [
          'Lower cats through top doors instead of pushing them through fronts.',
          'Practice opening side latches one-handed before the first real trip.',
          'Re-secure every door and zipper after each stop, every time.',
        ],
      },
      {
        id: 'crash-context',
        title: 'Crash Safety and the Car Realities',
        content:
          "In a vehicle, an unbelted carrier becomes a projectile, animal and all. A seat belt threaded through the handle or dedicated belt loops keeps the shell anchored to the seat, though a manufacturer's crash-test claims deserve a close read: proper testing involves specific standards, and the phrase on a box means little without them. Place belted carriers on the floor behind a seat or on the rear seat, away from airbags. Our car-accessory article takes the vehicle side further; here the point is that the carrier itself should be part of the restraint plan.",
        tips: [
          'Thread the seat belt through the handle or loops every drive.',
          'Keep carriers off front seats and away from deploying airbags.',
          'Ask which crash standard a claimed rating actually refers to.',
        ],
      },
      {
        id: 'covered-carriers',
        title: 'Cats Who Prefer Their Carriers Covered',
        content:
          "Many cats travel better when the carrier is draped with a towel or built with solid, windowless walls. Coverage cuts visual motion, which is a large part of feline travel stress, and it creates the den darkness cats seek when overwhelmed. Leave two sides breathable, never cover every vent, and peek rather than parade. The same cat who fights an open wire carrier at home may sleep through a highway drive in a dark box, which is worth knowing before choosing the shell.",
        tips: [
          'Drape a towel over three sides for anxious feline passengers.',
          'Keep at least two ventilation faces clear of any covering.',
          'Offer a covered carrier indoors first to test the preference.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Measure Correctly',
        items: [
          { highlight: 'Nose to tail-base', text: 'then add a quarter of length for turning.' },
          { highlight: 'Ears count as height', text: 'upright ears press painfully against rigid carrier tops.' },
          { highlight: 'Weigh before shopping', text: 'stated weight ratings exist and deserve real checking.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Choose the Shell',
        items: [
          { highlight: 'Rigid shells resist', text: 'claws, chewing, rough baggage handling, and deep cleaning.' },
          { highlight: 'Soft shells compress', text: 'into under-seat spaces that rigid dimensions cannot enter.' },
          { highlight: 'Zipper guards matter', text: 'determined animals can work an unprotected track open.' },
        ],
      },
      {
        icon: 'map-pin',
        title: 'Travel Smart',
        items: [
          { highlight: 'Every airline differs', text: 'every airline publishes its own under-seat maximum dimensions.' },
          { highlight: 'Belt the carrier', text: 'an unrestrained shell becomes a projectile under braking.' },
          { highlight: 'Covered cats settle', text: 'darkness lowers the visual motion that stresses them.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How do I measure my pet for a carrier?',
        answer:
          "Measure body length from nose to tail-base and add roughly a quarter for turning room. Then check her standing height to the crown of the head with ears upright. Compare both numbers, plus current weight, against the carrier's stated dimensions and weight rating before ordering.",
      },
      {
        question: 'Do airlines accept soft-sided pet carriers?',
        answer:
          "Most do, provided the carrier fits the airline's published under-seat dimensions for your aircraft and the animal stays inside throughout the flight. Soft shells get slight leeway because they compress a little, but gate agents still measure. Pull the pet policy for the exact aircraft on your booking and match every dimension, height included, before flying.",
      },
      {
        question: 'What size carrier does a growing kitten need?',
        answer:
          "Buy for the projected adult size and pad the spare room with a folded towel so rides stay stable. A kitten with room to become a cat skips the intermediate purchase, and the towel comes out as she fills the shell. Recheck the fit monthly while she grows, since cramped carriers train cats to refuse them.",
      },
      {
        question: 'Are hard or soft carriers better for cats?',
        answer:
          "It depends on the cat. Clawers and door-rattlers do better behind rigid walls and metal latches. Calmer cats often prefer soft shells, and most cats travel best when the carrier is partially covered either way. If vet trips are the main use, a top-loading door matters more than the shell material itself.",
      },
      {
        question: 'Where should a pet carrier sit in the car?',
        answer:
          "Rear seat or the floor behind a seat, belted through the handle or dedicated loops, and never in the front where an airbag could deploy into it. Keeping the carrier level and restrained reduces sliding, keeps the animal calmer, and stops the shell from becoming a projectile if you brake hard.",
      },
    ],
  },

  'travel-and-outdoor/backpack-carriers': {
    heroTitle: 'Backpack Carriers for Hiking With Small Dogs and Cats',
    heroSubheadline:
      'Worn gear carries your animal and your supplies up the trail, which means load math, airflow, and strap fit all land on your body. Here is how to get them right.',
    metaDescription:
      'Backpack carriers put small dogs and cats on your spine for hikes and city walks. Learn load limits, airflow checks, window versus cave styles, and strap fit.',
    introSummary:
      "Watch a small dog on a long hike and the pattern repeats: eager on the first climb, lagging on the return, paws lifting on hot gravel. A backpack carrier exists for exactly that moment, and for cats who join the outdoors on your terms instead of theirs. Because the pack rides on your body, every choice you make, from interior style to strap width, lands on your shoulders and theirs. Here is how to choose one that both of you can live with past the trailhead.",
    sections: [
      {
        id: 'worn-gear-difference',
        title: 'What a Worn Carrier Does Differently',
        content:
          "Unlike a wheeled or handheld carrier, a backpack distributes the animal across your torso, which frees both hands for poles, leashes, and scramble sections. That freedom is the entire appeal, and it comes with a cost: heat between your back and the pack, balance changes on technical ground, and a load you feel by the second hour. A well-chosen pack earns its place on moderate trails and city walks. A poorly fitted one punishes you within a mile.",
        tips: [
          'Try the loaded pack on flat ground before any trail day.',
          'Keep one hand free on scrambles even with both released.',
          "Budget for your own water beside the animal's weight.",
        ],
      },
      {
        id: 'total-load',
        title: 'Total Load Limits and Your Spine',
        content:
          "The animal is only part of the weight. Add your water, their water, treats, a first aid kit, and the pack itself, then judge that total against what you can carry comfortably for hours. A common comfort ceiling for loaded daypacks sits around a fifth of your own body weight, and an animal shifting inside makes the load feel heavier than the scale says. Manufacturers state weight limits for the pack's structure, too, and exceeding those risks seam and zipper failures mid-trail. When you compare pack listings, that loaded total is the number to bring with you.",
        tips: [
          'Weigh the pack loaded, animal plus supplies, before committing.',
          'Treat a fifth of your body weight as a ceiling.',
          "Check the manufacturer's stated load rating and stay under it.",
        ],
      },
      {
        id: 'window-or-cave',
        title: 'Window Style Versus Cave Style',
        content:
          "A window-style pack surrounds a mesh opening through which a confident animal watches the world go by, head out in spirit if not in body. A cave-style interior hides behind fabric with small mesh vents, suiting the anxious passenger who relaxes when input drops. Choose by temperament, honestly assessed: the dog who scans ahead at every corner wants the window, and the cat who retreats under beds wants the cave. Some packs convert between the two, which suits still-undecided animals.",
        tips: [
          'Pick windows for bold animals and caves for overwhelmed ones.',
          'Convertible styles buy time while temperament reveals itself in new places.',
          'Test reactions to passing bikes before committing to a window.',
        ],
      },
      {
        id: 'ventilation',
        title: 'Ventilation You Can Verify',
        content:
          "Mesh panels only work when air moves through them, so check where the openings sit relative to your back and how much of the interior they actually expose. A pack pressed against your torso traps heat fast, and dogs cool poorly in enclosed spaces, so airflow failures show up as panting within the first mile. Look for mesh on multiple faces, ventilation slits in the base, and interiors that let the animal reposition off hot contact points. In warm weather, plan rests in shade and take the pack off to check on them.",
        callout: {
          type: 'warning',
          title: 'Heat builds inside packs',
          text: "Dogs pant rather than sweat, and a dark interior pressed against your back warms quickly on sunny climbs. If panting rises beyond normal or your animal goes quiet, stop in shade, take the pack off, offer water, and let body temperature come down before walking on.",
        },
        tips: [
          'Check that mesh faces more than one side of the interior.',
          'Rest in shade hourly on warm days and offer water.',
          'Unclip and inspect after the first mile of any new route.',
        ],
      },
      {
        id: 'straps-for-wearer',
        title: 'Chest Straps, Hip Belts, and Your Shoulders',
        content:
          "The animal's comfort gets the marketing copy; yours determines whether the pack survives the season. Shoulder straps should be wide and padded enough that edges never bite, a sternum strap keeps them from sliding off your shoulders, and a hip belt moves the load from shoulders to hips where bodies carry weight better. Adjust everything while wearing the pack loaded with something heavy, then have someone check that it sits level. Straps sized for one torso rarely suit another, so fit in person where possible.",
        tips: [
          'Adjust straps with full weight in the pack, never empty.',
          'Set the hip belt to ride on your hips, not waist.',
          'Clip the sternum strap last to lock shoulder position.',
        ],
      },
      {
        id: 'build-up-miles',
        title: 'Building Up to Real Trail Miles',
        content:
          "Start the way you would with any new gear: indoors, door open, treats inside, no agenda. Once the animal hops in voluntarily, wear the pack on a walk around the block without zipping anything. Then take a first short outing over flat ground, watching for pawing at the mesh or sudden stillness. Increase duration before you increase difficulty, keep early exits available, and let the animal set the pace of progression. Weeks of patience buy years of trail company.",
        tips: [
          'Begin with open-door treat sessions at home, no zipper.',
          'Add short flat walks before any elevation or distance.',
          'Watch for pawing, stillness, or lip licking as stress signs.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Do the Math',
        items: [
          { highlight: 'Weigh animal plus gear', text: 'then judge the total against what your spine carries.' },
          { highlight: 'A fifth of weight', text: 'of your own body is a sensible comfort ceiling.' },
          { highlight: 'Structural limits count', text: 'exceeding stated pack ratings risks seams failing mid-trail.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Match the Interior',
        items: [
          { highlight: 'Windows suit the bold', text: 'animals who watch the passing world want the view.' },
          { highlight: 'Caves calm the anxious', text: 'reduced input relaxes animals who hide when overwhelmed.' },
          { highlight: 'Ventilation beats padding', text: 'mesh on multiple faces keeps the interior from overheating.' },
        ],
      },
      {
        icon: 'map-pin',
        title: 'Fit and Build Up',
        items: [
          { highlight: 'Hip belts carry loads', text: 'moving weight from shoulders to the stronger hips.' },
          { highlight: 'Adjust when loaded', text: 'empty-pack fitting lies about how a trail day feels.' },
          { highlight: 'Progression earns mileage', text: 'voluntary entry today means years of trail company later.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'What weight dog fits in a backpack carrier?',
        answer:
          "Most backpack carriers suit dogs roughly in the small-to-medium range, and each model states a maximum load you should treat as structural, not advisory. Above that range, your spine and the pack's seams both object. Check the stated rating, weigh your dog loaded with gear, and remember the comfort ceiling of about a fifth of your own body weight.",
      },
      {
        question: 'Can cats ride in hiking backpacks?',
        answer:
          "Yes, provided the cat accepts the harness that keeps her secured inside and the interior style matches her temperament. Bold cats do well with window views; shy ones settle better in covered cave-style interiors. Begin indoors with the door open and treats, and expect several weeks of short sessions before any real trail appears.",
      },
      {
        question: 'How long can a dog stay in a backpack carrier?',
        answer:
          "Treat rides as intervals, not the whole hike. Most dogs tolerate an hour or so comfortably with breaks, and every animal should get out at shaded rest stops to stretch and drink. Watch for heavy panting, which signals heat building inside the pack, and give the legs regular chances to do the walking.",
      },
      {
        question: 'Are backpack carriers good for city walks?',
        answer:
          "They shine in cities, where pavement heat, crowds, and bike traffic make walking risky for tiny dogs. The pack keeps your animal at chest height and out of underfoot danger, and your hands stay free for doors and coffee. Keep the trips short in warm weather, since urban pavement radiates heat upward into the pack.",
      },
      {
        question: 'What is the difference between window and cave backpacks?',
        answer:
          "Window packs frame a mesh view the animal watches through, suiting confident passengers who relax when they can see ahead. Cave packs close most of the interior behind fabric with vented openings, which lowers stimulation for anxious animals. Convertible designs switch between the two, useful while you are still learning how your traveler handles the world.",
      },
    ],
    heroImageUrl: '/images/aussie_shepherd.jpg',
    heroImageAlt: 'Australian shepherd on a hiking trail',
  },

  'travel-and-outdoor/slings': {
    heroTitle: 'Dog Slings for Tired Legs and Tiny Passengers',
    heroSubheadline:
      'A sling is the softest, lightest way to carry a very small dog, built for the last stretch of a walk rather than the whole outing.',
    metaDescription:
      'Dog slings carry tiny and senior dogs hands-free for short stretches. Learn weight limits, hip-support design, posture checks, and honest duration rules.',
    introSummary:
      "Halfway home from the park, the fifteen-year-old chihuahua stops, sits, and looks up: legs done, heart still in it. That moment is what a sling is for. It is a pouch of fabric that holds a very small dog against your chest, hands-free, for the tired stretch of a walk or a busy stretch of sidewalk. It is not a carrier, a stroller, or an all-day plan, and pretending otherwise is where trouble starts. Here is how to use one well.",
    sections: [
      {
        id: 'what-slings-are-for',
        title: 'What a Sling Is Actually For',
        content:
          "Think of it as a rescue device for short distances: the last few blocks home, a crowded farmers market, a vet waiting room where the floor is chaos. It suits tiny dogs whose legs give out before their enthusiasm does, and seniors whose joints say no to the return leg. The moment you plan a whole outing around sling time, or your dog stops walking in order to ride, the tool has quietly become a problem worth addressing.",
        tips: [
          'Reserve the sling for the final stretch, not the plan.',
          'Keep walking muscles working on every able-bodied day.',
          'Notice if healthy legs suddenly prefer riding to walking.',
        ],
      },
      {
        id: 'weight-honesty',
        title: 'The Fifteen-Pound Line and Weight Honesty',
        content:
          "Slings live in the small-dog world, generally under about fifteen pounds, and the reason is physics rather than preference. More weight hanging from your shoulder means more torque on your neck and more sag in the pouch, and a sagging pouch stops supporting the dog's hips. If your dog runs heavier, a backpack carrier spreads that load across your torso, and a stroller removes it entirely; the sling's whole charm is being nearly nothing to carry.",
        tips: [
          'Treat fifteen pounds as the practical ceiling for sling comfort.',
          'Heavier small dogs belong in torso-distributing or wheeled gear.',
          'Weigh your dog honestly, holiday pounds included, before shopping.',
        ],
      },
      {
        id: 'hip-bottom-design',
        title: 'Hip-Bottom Design, Not a Sagging Hammock',
        content:
          "A supportive sling builds a wide, flat base rather than a deep pocket, because a dog sinking into a sag sits with her spine curved and her hips below her shoulders. Look for a rigid-ish bottom panel or firm, multi-layer construction that holds shape under weight, with sides tall enough to keep her from leaning out. The base should sit at your hip or chest height, letting her rest seated and upright, which is how small dogs naturally settle when carried. As you compare sling listings, squeeze every bottom panel, since your hand predicts what her hips will feel.",
        tips: [
          'Press the bottom panel; shape under hand predicts shape under dog.',
          'Prefer wide flat bases over deep pocketed hammocks.',
          "Check side height against your dog's habit of leaning.",
        ],
      },
      {
        id: 'posture-checks',
        title: 'Posture Checks While She Rides',
        content:
          "Once she is in, your job is watching, not scrolling. She should sit upright with her sternum above her hips, head free, and nothing pressing her airway. Front legs can rest over the pouch edge or inside it, whichever she prefers, but a dog lying flat and loose may be slipping lower than the support intends. Check her every few minutes at first, reposition her the moment she pools at the bottom, and read frequent shifting as a fit problem rather than fidgeting.",
        tips: [
          'Keep the sternum above the hips so the spine stays neutral.',
          'Reposition her whenever she sinks below the supportive base.',
          'Confirm nothing presses the throat when she turns her head.',
        ],
      },
      {
        id: 'duration-and-back',
        title: 'Short Stretches and Your Own Back',
        content:
          "Duration limits protect both of you. A sling hangs its load from one shoulder, and even a light dog gets heavy through the same strap across the same muscles, so plan minutes rather than hours and switch shoulders when you feel the ache begin. For the dog, long rides mean pressure on the same spots and no chance to shift her own weight, which is why sling time belongs at the end of walks, not instead of them.",
        callout: {
          type: 'warning',
          title: 'One shoulder, one clock',
          text: "Swap shoulders at the first ache rather than the tenth, and keep rides to short stretches. A sling is a tired-legs rescue tool; if your dog needs carrying for a whole outing, a backpack or wheeled setup fits that job better.",
        },
        tips: [
          'Alternate shoulders before the first one starts complaining.',
          'Cap rides at short stretches and end them with walking.',
          'Choose wider straps; narrow webbing digs within a few blocks.',
        ],
      },
      {
        id: 'seniors-and-vet',
        title: 'Seniors, Recovery, and Vet Guidance',
        content:
          "For arthritic seniors and dogs recovering from surgery, a sling can be genuinely kind, letting them keep their social life while their legs heal or retire. It can also mask a problem worth a diagnosis, since a dog carried everywhere never has to show anyone what hurts. If your senior suddenly refuses walks, or you are supporting a post-operative patient, ask your veterinarian what movement is encouraged, how much carrying is safe, and what the sling should and should not be substituting for.",
        callout: {
          type: 'vet-note',
          title: 'A refusal is information',
          text: "A senior dog who abruptly stops wanting to walk deserves an examination before he earns permanent sling rides. Pain, heart conditions, and joint disease all announce themselves through reluctance, and carrying through the symptom can delay the diagnosis that would help him most.",
        },
        tips: [
          'Ask your vet how much carrying a recovering dog should do.',
          'Let reluctance to walk trigger a checkup, not just rides.',
          'Keep senior legs moving within the limits your vet sets.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'heart',
        title: 'Right Tool, Right Time',
        items: [
          { highlight: 'Tired legs, short rides', text: 'the last blocks home, not the whole day plan.' },
          { highlight: 'Under fifteen pounds', text: 'keeps the load friendly to one shoulder and one strap.' },
          { highlight: 'Walking stays primary', text: 'able legs keep working on every ordinary day.' },
        ],
      },
      {
        icon: 'check',
        title: 'Support the Hips',
        items: [
          { highlight: 'Flat wide bottoms', text: 'hold the spine neutral instead of curving into a sag.' },
          { highlight: 'Structured side walls', text: 'keep a leaning dog from working her way out.' },
          { highlight: 'Sternum above hips', text: 'is the posture to check every few minutes.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Watch and Verify',
        items: [
          { highlight: 'Reposition early and often', text: 'a dog sinking low loses the support she needs.' },
          { highlight: 'Swap shoulders promptly', text: 'at the first ache, before the strap does damage.' },
          { highlight: 'Sudden refusals mean vet', text: 'reluctance to walk often announces something worth diagnosing.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'What weight dog can a sling safely carry?',
        answer:
          "Roughly fifteen pounds is the practical ceiling, and most slings state their own maximum as well. Beyond that, shoulder torque, strap digging, and pouch sag all rise together, and the dog's hips lose the support that justifies the carry. Heavier small dogs travel better in torso-distributing backpacks or wheeled strollers.",
      },
      {
        question: 'Are slings good for senior dogs?',
        answer:
          "For many seniors, yes, especially on the home stretch of walks when joints tire before enthusiasm does. A structured bottom keeps the hips supported and the spine upright. Just route any sudden reluctance through your veterinarian first, since carried dogs hide the very symptoms that deserve diagnosis, and keep daily movement within the limits she recommends.",
      },
      {
        question: 'How long can my dog ride in a sling?',
        answer:
          "Minutes, not hours. Single-shoulder loads tire the wearer quickly and give the dog no way to shift her own weight, so cap rides at short stretches and alternate shoulders at the first ache. If an outing will involve carrying the whole time, choose gear built for that duration instead of improvising with fabric.",
      },
      {
        question: 'Can a sling replace a carrier for vet visits?',
        answer:
          "It can work as a waiting-room aid for a calm tiny dog, but a secure carrier remains the safer default for transport and exam rooms, where doors open onto parking lots and other animals. Slings have no rigid protection and no latch, so treat one as a comforting supplement to the carrier rather than a substitute for it.",
      },
    ],
  },

  'travel-and-outdoor/strollers': {
    heroTitle: 'Pet Strollers for Seniors, Recovery, and City Cats',
    heroSubheadline:
      'Wheels take over when legs retire, surgeries heal, or a city cat wants the outdoors without the risks. Here is how to read wheel types, cabins, and ratings.',
    metaDescription:
      'Pet strollers give seniors, recovering patients, and indoor cats safe wheels. Compare wheel types by terrain, cabin mesh, zippered access, and weight ratings.',
    introSummary:
      "A dog comes home from knee surgery cleared for gentle movement but not for distance, and a golden afternoon goes wasted on the couch. A stroller solves exactly this, giving animals the world when their legs cannot manage it, whether for a healing joint, a retired pair of hips, or a cat who watches pigeons through glass. Not all wheels are equal, though, and the wrong rolling setup turns a park path into a workout. Here is what to check first.",
    sections: [
      {
        id: 'who-strollers-serve',
        title: 'Who a Stroller Actually Serves',
        content:
          "The honest user list is short: seniors whose joints still want the smells and greetings, dogs healing from procedures with activity limits, anxious or elderly cats experiencing supervised outdoor time, and small dogs whose humans walk faster and farther than their legs were built for. Healthy young dogs need walks, not rides, and a stroller used to skip exercise is doing nobody favors. Match the tool to the animal's actual body and the outing improves for both of you.",
        tips: [
          'Choose strollers for limits, not for skipping healthy exercise.',
          'Cats belong in fully enclosed cabins, windows zipped, no exceptions.',
          "Time post-surgery rides to your vet's activity clearance.",
        ],
      },
      {
        id: 'wheels-by-terrain',
        title: 'Wheel Types Matched to Terrain',
        content:
          "Wheels decide where the stroller can go and how much of your patience survives the trip. Small swivel wheels glide on smooth floors and pavement, locking straight for stability at speed, while larger fixed wheels handle gravel, grass, and the rutted corners of park trails. If your routes mix surfaces, look for a front wheel that both swivels and locks, which covers both worlds without compromise.",
        tips: [
          'Lock the front wheel before any fast or rough stretch.',
          'Bigger wheels trade folded size for terrain ability.',
          'Test curb height at the store; curbs are the daily obstacle.',
        ],
        tableData: {
          headers: ['Terrain', 'Wheel setup', 'Why it works'],
          rows: [
            ['Smooth pavement', 'Swivel front wheels', 'Turns tightly at curbs and doorways'],
            ['Gravel park paths', 'Larger wheels, locked front', 'Rolls over loose stone without sticking'],
            ['Grass and fields', 'Wide fixed wheels', 'Floats instead of digging into soft ground'],
            ['Dirt trails', 'Big fixed wheels, suspension', 'Absorbs roots and ruts at walking pace'],
          ],
        },
      },
      {
        id: 'cabin-mesh',
        title: 'Cabin Mesh, Ventilation, and Visibility',
        content:
          "The cabin is where the animal actually lives during the ride, so read it like a room. Mesh windows should admit airflow and a view without admitting paws or claws through, and at least two opposing faces need screening so breezes pass through rather than stall. Cats require a fully enclosed cabin with zipping mesh panels, since an open riding platform is an invitation to leave. Interior padding should unzip for washing, because strollers collect the same hair and mud everything else does.",
        tips: [
          'Screen two opposing faces so air actually passes through.',
          'Zip every mesh panel before an anxious cat rides.',
          'Confirm the pad unzips, since washing frequency decides smell.',
        ],
      },
      {
        id: 'zippered-access',
        title: 'Zippered Access and Escape-Proofing',
        content:
          "Entry points matter as much as windows. Top access helps you lift a stiff or recovering dog in without bending him through a front hole, and rear or front zippers let him walk in on his own legs when he still can. Every zipper is also an escape route, so check for dual sliders that lock, interior clips for a short leash, and panels that close behind your reach. A determined cat finds the one zipper you forgot in about a minute, so build the habit of auditing all of them.",
        callout: {
          type: 'pro-tip',
          title: 'Attach in, clip short',
          text: "Clip the interior tether to a harness, never a collar, and keep it short enough that your cat or dog cannot reach the zipper ends. The tether backs up the zippers, and the harness backs up the tether, giving you two independent systems against one determined exit.",
        },
        tips: [
          'Use top access for stiff bodies and front zips for willing ones.',
          'Clip interior tethers to harnesses rather than collars, always.',
          'Audit every zipper each ride; cats find forgotten ones fast.',
        ],
      },
      {
        id: 'weight-ratings',
        title: 'Weight Ratings Deserve Headroom',
        content:
          "The stated maximum is a structural limit, not a comfort target, and gear lasts longer below its ceiling. Weigh your animal, then add what else rides along, a blanket, a toy, the water you clip to the frame, because ratings cover all of it combined. Choosing a rating with generous headroom over today's weight also absorbs future changes, and the frame, wheels, and folding joints all age more gracefully under less than their maximum. When you compare stroller listings, treat the rating line as the first filter rather than the last.",
        tips: [
          'Weigh the animal plus everything else that rides in the cabin.',
          'Choose ratings with headroom instead of aiming at the maximum.',
          'Re-weigh seniors seasonally; weight creep is quiet and common.',
        ],
      },
      {
        id: 'recovery-rules',
        title: "Recovery Rides Follow the Vet's Rules",
        content:
          "After surgery, the stroller is a delivery mechanism for exactly the outings your veterinarian prescribes, and nothing more. Movement restrictions often specify no jumping, no stairs, and limited walking for weeks, and a stroller lets a healing dog attend the world without breaking those rules. Confirm the cabin entry height does not force a jump or deep bend, lift with your own back in mind, and schedule rides around medication times so comfort stays ahead of the trip.",
        callout: {
          type: 'vet-note',
          title: 'Clearance before wheels',
          text: "Ask your veterinarian what post-surgical movement is allowed before the first ride, and reconfirm at each follow-up. Some recoveries benefit from early gentle motion, others forbid it entirely, and only the surgeon's team knows which one you are supporting.",
        },
        tips: [
          'Write down the movement restrictions and keep them with the leash.',
          'Lift stiff dogs in through top access rather than front doors.',
          'Time rides so medication is working before you leave home.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Pick the Wheels',
        items: [
          { highlight: 'Swivel suits pavement', text: 'tight turns at curbs, doorways, and store aisles.' },
          { highlight: 'Fixed suits rough ground', text: 'locked straight wheels roll gravel and grass without sticking.' },
          { highlight: 'Convertible front wheels', text: 'swivel and lock modes cover routes that mix both.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Secure the Cabin',
        items: [
          { highlight: 'Enclosed cabins for cats', text: 'every mesh panel zips before an anxious feline rides.' },
          { highlight: 'Two screened faces', text: 'let breezes pass through instead of stalling inside.' },
          { highlight: 'Interior harness tethers', text: 'back up the zippers against a determined exit.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Respect the Limits',
        items: [
          { highlight: 'Ratings need headroom', text: 'count the animal plus everything else riding along.' },
          { highlight: 'Vet rules come first', text: 'recovery rides follow the prescribed movement plan exactly.' },
          { highlight: 'Rides never replace walks', text: 'for able legs, exercise stays part of the day.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Can cats ride in dog strollers?',
        answer:
          "Yes, if the cabin fully encloses with zipping mesh panels and the interior tether clips to a harness. Open-platform strollers suit dogs who stay put, but cats need a closed cabin, since a startled cat exits fast and from any height. Introduce the stroller indoors with treats before the first outdoor roll.",
      },
      {
        question: 'Which wheels work best on trails?',
        answer:
          "Large fixed wheels roll over roots, ruts, and loose gravel far better than small swivels, which is why trail-worthy strollers lock the front wheel straight or skip it entirely. Suspension helps smooth the chatter that would otherwise rattle a recovering or arthritic passenger. Keep speeds at a walk, since these cabins are built for strolling, not jogging.",
      },
      {
        question: 'How much weight can a pet stroller hold?',
        answer:
          "Every model states a maximum, and the honest approach is staying well under it, counting your animal plus the blanket, toys, and water you add. Ratings mark structural limits for the frame and wheels, not comfort targets, so generous margin keeps the stroller rolling for years. Weigh everything that rides, then compare against the listing.",
      },
      {
        question: 'Are strollers good after dog surgery?',
        answer:
          "Often, yes, because they let a dog attend gentle outings without breaking restrictions on walking, jumping, and stairs. Your veterinarian should set the rules first, since recoveries differ in what motion they allow. Use top access to lift him in, keep rides short and smooth, and time them so his medication is working during the trip.",
      },
      {
        question: 'How do I get my cat used to a stroller?',
        answer:
          "Open the cabin indoors, park it somewhere she already lounges, and feed treats inside over several days before any wheel turns. Once she settles voluntarily, zip the mesh and push a slow lap of the living room. Graduation to the sidewalk comes last, and the first trips should be short, quiet, and far from dogs.",
      },
    ],
  },

  'travel-and-outdoor/purses': {
    heroTitle: 'Pet Carrier Purses That Blend Into the Everyday',
    heroSubheadline:
      'A purse carrier looks like everyday style while working like a carrier, which changes where your small pet can go, as long as you respect its limits.',
    metaDescription:
      'Pet purse carriers blend carrier function into daily style for tiny dogs. Compare structure, head-out openings, closures, and where a standard carrier wins.',
    introSummary:
      "At the café, nobody clocks the quilted tote on the next chair as pet gear until a snout emerges from its rim. That is the entire premise of the purse carrier: transport that reads as style while functioning as a carrier for a very small dog. The good ones take structure, airflow, and escape prevention as seriously as any crate. The bad ones are fashion with a hole cut in it, and the difference between them is what this article teaches you to spot.",
    sections: [
      {
        id: 'where-purses-work',
        title: 'Where the Purse Idea Works',
        content:
          "Daily errands, café mornings, train cars, and quiet shops are the purse carrier's natural habitat: places that welcome a calm little dog in a bag but not a visible crate with a handle. The disguise lowers friction, and the animal gets the company she wants without the fuss. Note the pattern in that list, though. Every venue is low-stakes, brief, and mostly seated, because that is the shape of outing this design supports best.",
        tips: [
          'Match purse outings to calm, brief, seated kinds of plans.',
          'Check venue pet rules even when the bag is discreet.',
          'Skip disguise for anxious dogs who need a closed, quiet space.',
        ],
      },
      {
        id: 'structured-vs-slouchy',
        title: 'Structured Walls Versus Slouchy Ones',
        content:
          "Structure is the difference between a carrier and a handbag with a dog inside. Structured walls, usually built on firm panels or a stiffened base, hold their shape under the animal's weight, keeping her spine level and the openings where the design put them. Slouchy walls collapse inward the moment she leans, which closes airflow, folds the head-out opening shut, and can leave her lying in a sag. Softness on the outside is fine; softness as the architecture is not. The same squeeze test applies to any bag you compare, including the purse-style carriers listed in our marketplace.",
        tips: [
          'Press the walls; they should resist rather than fold.',
          'Confirm a stiffened base holds the floor flat under weight.',
          'Recheck opening positions after she leans on them a while.',
        ],
      },
      {
        id: 'head-out-openings',
        title: 'Head-Out Openings Demand Supervision',
        content:
          "The charming part of these bags, the opening that lets her chin rest on the rim while you sip, is also the liability. A head through an opening means a body that could follow, so she stays harnessed with a short interior tether, and the opening stays shut whenever your attention leaves her. Watch the neck: a wide, padded opening sits on the shoulders, not the throat, and if the rim rides up when she turns, the opening is the wrong size.",
        callout: {
          type: 'warning',
          title: 'Never tether to a collar',
          text: "Head-out bags tempt owners to clip a leash to the collar, but a dog lurching after a pigeon hangs herself at the rim. Attach any interior tether to a harness, keep it short, and treat the collar as identification only while she rides.",
        },
        tips: [
          'Harness and short tether inside, collar for tags only.',
          'Close the opening whenever your eyes leave the bag.',
          'The rim should press shoulders, never the throat, when she turns.',
        ],
      },
      {
        id: 'closures',
        title: 'Closures You Can Trust One-Handed',
        content:
          "Purse carriers live or die by their openings. Zippers hold best but ask for two hands and a patient animal, which is why many designs add quick-release clasps at the rim, letting you open the bag in a second when a curious shop requires it. Test every closure before buying: release it one-handed while holding the bag's weight, then confirm it cannot be worked open from inside by a paw. Magnetic snaps are convenient and the least secure, so pair them with the interior tether.",
        tips: [
          'Practice one-handed opening while the bag carries real weight.',
          'Pair magnetic closures with a clipped interior tether always.',
          'Run a paw-test on zippers; some tracks shed teeth early.',
        ],
      },
      {
        id: 'weight-and-time',
        title: 'Honest Weight and Time Limits',
        content:
          "This category is for the smallest passengers, generally dogs light enough that the bag's structure barely notices them, and the honest ceiling sits around the same fifteen-pound territory as slings. Beyond that weight, structured walls, your shoulder, and the closures all start compromising together. Time limits matter as much as weight: these bags ventilate through limited mesh, so plan hours of your day around them, not full days, and never leave the bag closed and unattended anywhere warm.",
        tips: [
          'Treat the small-dog ceiling honestly; bigger bodies need real carriers.',
          'Plan bag time in hours, never whole days.',
          'Never leave a closed bag unattended in warmth.',
        ],
      },
      {
        id: 'standard-carrier-wins',
        title: 'Where a Standard Carrier Still Wins',
        content:
          "Flights, vet visits, long transit days, and anywhere a rule will be enforced: these belong to the standard carrier, whose published dimensions, latches, and rigid structure answer questions a soft bag cannot. Airlines specify their own numbers, clinics want animals they can hand back intact, and a twelve-hour train ride deserves a cabin with real airflow. Keep the purse for the café run and the appointment-light afternoon; when the day gets serious, so should the equipment.",
        tips: [
          'Default to standard carriers for flights and clinic visits.',
          'Long transit days deserve rigid walls and full airflow.',
          'Keep the purse for short, calm, social kinds of outings.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'sparkles',
        title: 'Stay Honest',
        items: [
          { highlight: 'Tiny passengers only', text: 'weight and duration limits are real in this category.' },
          { highlight: 'Hours, not days', text: 'limited mesh means limited time in a closed bag.' },
          { highlight: 'Serious days escalate', text: 'flights and clinics call for the standard carrier.' },
        ],
      },
      {
        icon: 'check',
        title: 'Test the Build',
        items: [
          { highlight: 'Walls that resist', text: 'firm panels keep the spine level and openings open.' },
          { highlight: 'Closures you trust', text: 'should open fast and resist a paw from inside.' },
          { highlight: 'Magnetic snaps pair', text: 'with a clipped interior tether for real security.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Supervise the Opening',
        items: [
          { highlight: 'Harness, never collar', text: 'a lurch at the rim hangs a collar-wearing dog.' },
          { highlight: 'Open only under watch', text: 'the rim closes the moment your attention moves away.' },
          { highlight: 'Padded, wide rims', text: 'press on shoulders rather than riding up the throat.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Can I use a purse carrier on a plane?',
        answer:
          "Only if it meets that airline's published under-seat dimensions and pet rules, which many fashion-style bags do not. Measure the bag yourself rather than trusting the listing, since a design that looks compliant may run long or tall by an inch. For flights, a purpose-built soft carrier with stated dimensions is the safer bet.",
      },
      {
        question: 'What size dog fits in a purse carrier?',
        answer:
          "Comfortably, dogs in the smallest weight class, with the practical ceiling around fifteen pounds depending on the bag's structure. The animal should stand, turn, and settle without deforming the walls, and a dog who has to duck is telling you the bag is too small. Check each listing's stated dimensions against your dog measured nose to tail-base.",
      },
      {
        question: "Is it safe to let my dog's head out of the bag?",
        answer:
          "Yes, under supervision and with the right setup: a harness with a short interior tether, an opening padded and wide enough to sit on her shoulders, and your full attention while it is open. Close the rim whenever you are distracted, because the opening that delights you is also the one she can exit or catch her neck in.",
      },
      {
        question: 'Purse carrier or standard carrier for everyday errands?',
        answer:
          "For short, calm outings in pet-welcoming places, the purse carrier shines, keeping a tiny dog included without announcing pet gear. For anything regulated, lengthy, or risky, the standard carrier wins on structure, dimensions, and secure latches. Many small-dog households keep both and match the bag to the day's actual plan.",
      },
    ],
  },

  'travel-and-outdoor/car-travel-accessories': {
    heroTitle: 'Car Travel Accessories That Keep Dogs Safe and Settled',
    heroSubheadline:
      'The right gear turns a moving vehicle into a managed space: restrained, protected from hair, and gentle on senior joints getting in and out.',
    metaDescription:
      'Car travel accessories keep dogs restrained and interiors clean: crash-tested crates and tethers, hammocks, barriers, ramps, and motion-sickness routines.',
    introSummary:
      "Every driver has watched a dog launch itself into the front seat mid-brake, or spent an afternoon vacuuming a back seat that looked barbered rather than ridden in. The gear that prevents both lives in the car-travel aisle: restraints, covers, barriers, ramps, and the routines that settle a queasy stomach. None of it is decoration, because an unrestrained animal becomes a projectile in a hard stop, and every piece below earns its place in that math.",
    sections: [
      {
        id: 'restraint-basics',
        title: 'Restraining the Passenger Properly',
        content:
          "A dog loose in a car is a safety problem twice over: it hits whatever it flies into, and it lands on the driver's attention at the worst moments. The two serious answers are a crash-tested harness buckled into the seat belt or a properly rated crate in the cargo area, with a short tether as the compromise for dogs who need sightlines. Whatever you choose, the connection point should be the vehicle's real hardware, never a loop of fabric around a headrest.",
        callout: {
          type: 'warning',
          title: 'Tethers attach to harnesses',
          text: "A short tether clipped to a collar concentrates a sudden stop directly on the throat, which is exactly the wrong place. Clip vehicle tethers to a fitted harness, keep them short enough to limit flight, and route them to real anchor points rather than headrests that can sheer loose.",
        },
        tips: [
          'Clip restraints to harnesses and real anchors, never collars.',
          'Choose crash-tested harnesses or rated crates over casual tethers.',
          'Retrain the dog to the setup with short practice drives first.',
        ],
      },
      {
        id: 'crash-claims',
        title: 'Crash-Tested Claims Worth Reading Closely',
        content:
          "Marketing language around crash safety runs from meaningful to decorative. Legitimate crash testing references a specific published standard, names the size of test dummy used, and states what the test actually measures, while vague phrasing about durability tells you nothing about a collision. When you compare listings in our marketplace, look for the named standard, check which dog weights the testing covered, and treat unspecified claims as claims rather than results. Restraint is still worth having either way.",
        tips: [
          'Look for a named crash standard, not durability adjectives.',
          'Check which dog weights the testing actually covered.',
          "Buy for your dog's real weight, including holiday drift.",
        ],
      },
      {
        id: 'hammocks-covers',
        title: 'Hammocks and Covers That Contain the Mess',
        content:
          "A seat hammock spans the back seat, hanging between the headrests, and it works three jobs at once: it blocks most hair and mud from the upholstery, it catches the debris of chewed treats and dragged sticks, and it drops a floor between your dog and the footwell so a slip becomes a soft landing. Look for non-slip backing that grips the seat, side flaps protecting the doors, and anchoring that survives a determined digger rather than the first excited paw.",
        tips: [
          'Choose machine-washable fabric; hammocks collect more than hair.',
          'Non-slip backing keeps the hammock and dog from sliding together.',
          'Side flaps protect door panels from muddy tails and paws.',
        ],
      },
      {
        id: 'barriers-cargo',
        title: 'Barriers and Cargo-Area Arrangements',
        content:
          "Barriers keep a dog in the back of an SUV or wagon, out of the cargo area's open space or away from the rear seats, and they range from mesh screens to tube-style frames. A barrier is not a crash restraint, a distinction worth repeating, but it does stop the slow migration forward that ends with a nose on your shoulder at highway speed. Match the barrier to your vehicle's interior shape, and check the mounting hardware clamps to real anchor points.",
        tips: [
          'Treat barriers as containment, never as crash protection.',
          'Verify the barrier mounts to real anchor points in your vehicle.',
          'Pair cargo-area setups with a rated crate when possible.',
        ],
      },
      {
        id: 'ramps-for-seniors',
        title: 'Ramps for Getting In and Out',
        content:
          "Taller vehicles ask senior and small dogs to leap heights their shoulders never volunteered for, and repeated jumps compound the wear on hips and elbows. A ramp flattens that entry into a walk, which is the entire point. Choose a surface with real traction, since a slick ramp in damp weather is worse than no ramp, confirm the stated weight rating clears your dog with margin, and set the shallowest angle the parking space allows. A folding ramp stores flat behind the rear seats.",
        tips: [
          'Lure the first ramp walks with treats, flat ground, patience.',
          'Wet-test the tread surface before trusting it in rain.',
          'Set ramps at the shallowest angle your space allows.',
        ],
      },
      {
        id: 'motion-sickness',
        title: 'Routines for Carsick Stomachs',
        content:
          "Motion sickness in dogs often fades with maturity, but the ride matters until it does. Facing forward in the middle of the back seat reduces the visual motion that drives nausea, an empty or nearly empty stomach removes the fuel, and short trips ending happily retrain the association. Skip the full meal in the hours before driving, plan breaks on long routes, and give a carsick-prone dog time on grass at rest stops. For severe or persistent cases, ask your veterinarian, since effective options exist and none of them are guessing.",
        callout: {
          type: 'vet-note',
          title: 'Persistent sickness is treatable',
          text: "If your dog drools, gulps, or vomits on most rides despite slow conditioning, talk with your veterinarian rather than resigning the dog to the back seat. Prescription options and feeding schedules both exist for travel nausea, and the right one depends on your dog's health picture.",
        },
        tips: [
          'Center the dog in the back seat so the view faces forward.',
          'Keep pre-drive meals small and a few hours ahead.',
          'End every practice drive somewhere the dog genuinely enjoys.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'shield',
        title: 'Restrain for Real',
        items: [
          { highlight: 'Clip to the harness', text: 'collars concentrate sudden stops directly on the throat.' },
          { highlight: 'Named standards only', text: 'vague durability phrasing says nothing about real collisions.' },
          { highlight: 'Real anchor points', text: 'headrest loops sheer loose under a real load.' },
        ],
      },
      {
        icon: 'check',
        title: 'Protect the Interior',
        items: [
          { highlight: 'Hammocks work triple duty', text: 'blocking hair, catching debris, flooring the footwell gap.' },
          { highlight: 'Non-slip backing matters', text: 'fabric that slides takes the dog with it.' },
          { highlight: 'Washable beats plush', text: 'covers that clean easily get cleaned more often.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Settle and Spare Joints',
        items: [
          { highlight: 'Face forward, eat light', text: 'a middle back-seat spot and a light meal reduce nausea.' },
          { highlight: 'Ramps spare the joints', text: 'walk-in entries replace repeated leaps into tall vehicles.' },
          { highlight: 'Vets treat travel nausea', text: 'persistent sickness has real options beyond patient conditioning.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Do dog seat-belt tethers actually work?',
        answer:
          "Short tethers limit how far a dog flies in a hard stop and keep them off the driver, which makes them better than nothing. A crash-tested harness or rated crate protects far better, since a tether's weakest link is usually the attachment. Clip any tether to a harness and a real anchor point.",
      },
      {
        question: 'How do I keep dog hair off my car seats?',
        answer:
          "A hammock across the back seat catches most of it before the upholstery does, and washable seat covers handle the rest of the cabin. Brush your dog before long drives, keep a towel by the door for rainy paws, and run a lint roller over the worst spots weekly. Non-slip backing matters more than fabric softness.",
      },
      {
        question: 'What helps a dog with car motion sickness?',
        answer:
          "Position matters first: a forward-facing spot in the center of the rear seat cuts the visual motion behind most nausea. Feed lightly, hours before driving, keep trips short at first, and end them somewhere pleasant so the association rebuilds. Dogs who drool or vomit on most rides should see a veterinarian, because treatable options exist.",
      },
      {
        question: 'Are dog ramps worth it for senior dogs?',
        answer:
          "Usually, yes. Jumps into and out of an SUV compound wear on hips, elbows, and the spine, and a ramp converts those leaps into a short walk. Look for genuine tread traction and a weight rating above your dog with margin, then teach the ramp on flat ground with treats before expecting it used in a parking lot.",
      },
      {
        question: 'Should my dog ride in a crate or a harness?',
        answer:
          "A rated crate in the cargo area generally offers the most containment, and it suits dogs who already accept crating. A crash-tested harness suits dogs who need sightlines to settle and vehicles where a crate will not fit. Either beats riding loose. Let your dog's calmest setup win, then give it practice drives before a long trip.",
      },
    ],
  },

  'travel-and-outdoor/bicycle-carriers': {
    heroTitle: 'Bicycle Carriers: Riding With a Small Dog Aboard',
    heroSubheadline:
      'A basket-mounted carrier takes a very small dog along for the ride, once weight limits, tethering, and a patient introduction are handled correctly.',
    metaDescription:
      'Bicycle carriers mount small dogs front or rear for shared rides. Learn weight limits, safe harness tethering, step-by-step training, and wind protection.',
    introSummary:
      "The first ride with a dog aboard is quieter than you expect: a nose into the wind, ears back, total attention. Basket-mounted bicycle carriers make that moment possible for small dogs, strapping to the handlebars or the rear rack and turning a solo pedal into a shared one. The catch is that everything about the setup, from the weight it carries to the way it tethers, matters more with a living passenger than with groceries. Weight first, training second, wind always.",
    sections: [
      {
        id: 'front-or-rear',
        title: 'Front Mount or Rear Rack',
        content:
          "A front-mounted basket sits in your sightline, which most small dogs prefer and most riders enjoy, though it steers differently with weight in it and suits the lightest passengers only. A rear rack mount carries more, tracks steadier at speed, and puts the dog behind you, out of the wind cone off your chest. Whichever you pick, the mount should clamp to the frame or rack hardware rather than hang from straps alone, because strap-only mounts migrate with every bump.",
        tips: [
          'Front baskets suit the lightest dogs and shortest rides.',
          'Rear racks carry steadier and shelter the passenger from wind.',
          'Insist on clamps to real frame or rack hardware, not straps.',
        ],
      },
      {
        id: 'weight-limits',
        title: 'Weight Limits Are Structural',
        content:
          "The stated maximum on a bicycle carrier protects three things at once: the basket's structure, the mount's grip on your bike, and your own control at speed. Overload the front and steering slows exactly when you need it fast; overload the rear and the back wheel squirms through corners. Stay under the limit with real margin, remembering that the dog plus her harness plus the water bottle all count. When you compare basket listings, keep her actual weight written beside the limits. Heavier dogs are trailer passengers, not basket passengers, full stop.",
        tips: [
          'Weigh dog, harness, and anything else riding in the basket.',
          'Reserve front mounts for the lightest passengers on the list.',
          'Take heavier dogs in a towed trailer instead, no exceptions.',
        ],
      },
      {
        id: 'tethering',
        title: 'Tether to a Harness, Never the Neck',
        content:
          "Every basket carrier needs an interior tether, and the attachment point decides whether it is safety equipment or a hazard. A short leash clipped to a harness keeps a dog from exiting at speed while letting her sit, stand, and turn comfortably. The same leash clipped to a collar turns every sudden sway into a choking force on the throat. Set the length so she cannot reach the rim, and use a swiveling clip so the line does not twist as she moves.",
        callout: {
          type: 'warning',
          title: 'The neck is never a bike anchor',
          text: "A dog startled by a passing truck will lunge, and a collar-tethered lunge at fifteen miles an hour ends at the throat. Harnesses spread that force across the chest, which is why every reputable basket setup assumes one. No harness, no ride.",
        },
        tips: [
          'Clip interior tethers to a chest harness, always.',
          'Trim tether length so the rim stays out of reach.',
          'Use a swivel clip to keep the line twist-free.',
        ],
      },
      {
        id: 'introduction',
        title: 'Stationary First, Then Slow Circles',
        content:
          "Introduce the basket with the bike parked in the living room or driveway, door open, treats flowing, until your dog hops in on her own. Zip or clip her in with the tether and stand beside the bike, letting her feel the wobble of your movements. First rides happen in a quiet lot at walking pace, a few slow circles, ending with praise and a treat. Distance and speed grow only after she stands relaxed and turns to look around, not before.",
        tips: [
          'Begin with the bike parked and treats inside the basket.',
          'Ride slow circles in a quiet lot before any street.',
          'Add distance only after relaxed posture becomes the default.',
        ],
      },
      {
        id: 'wind-eyes-paws',
        title: 'Wind, Eyes, and Paws at Speed',
        content:
          "Moving air carries debris, and a dog riding forward of your knees catches all of it: dust, grit, and the occasional insect at face height. Eye protection made for dogs, sized and fitted properly, handles the problem for wind-loving passengers; others simply ride behind a windscreen built into the basket. Check paws too, since an excited dog will rest them on hot metal rims after a sunny stretch of road. Paw position, eye comfort, and airflow through the basket decide whether the ride stays a joy.",
        tips: [
          'Fit dog-specific eye protection for forward-riding wind lovers.',
          'Prefer baskets with built-in windscreens for face-level comfort.',
          'Check rim temperature before paws rest on sunny metal.',
        ],
      },
      {
        id: 'weather-judgment',
        title: 'Weather, Heat, and Road Judgment',
        content:
          "Some days simply are not basket days. Asphalt hot enough to fry an egg heats the air your dog breathes at road level, thunderstorm season brings gusts that tip lightly loaded bikes, and heavy traffic turns a shared ride into an endurance test of close passes. Ride early in warm months, choose quiet routes with shoulders, keep the first season's distances short, and let your dog's posture vote on whether the route continues. A dog standing braced and rigid is asking to go home.",
        callout: {
          type: 'pro-tip',
          title: 'Let posture call the ride',
          text: "A relaxed passenger sits or stands loose, turns to scan, and settles again. A braced dog plants all four feet, leans against the tether, and stares. The first can build distance; the second needs shorter rides, a windscreen, or more parked-basket training before the next attempt.",
        },
        tips: [
          'Ride in the coolest hours through warm months, always.',
          'Choose routes with shoulders and low traffic for early rides.',
          'End any ride where posture stays braced or ears stay pinned.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'shield',
        title: 'Mount It Right',
        items: [
          { highlight: 'Clamp, do not strap', text: 'frame and rack hardware hold where straps migrate.' },
          { highlight: 'Front suits the lightest', text: 'steering slows with basket weight exactly when speed needs it.' },
          { highlight: 'Rear racks ride steadier', text: 'and keep the passenger out of your wind cone.' },
        ],
      },
      {
        icon: 'check',
        title: 'Tether and Protect',
        items: [
          { highlight: 'Harness only, ever', text: 'a collar-tethered lunge lands force on the throat.' },
          { highlight: 'Short swiveling tethers', text: 'block the rim without twisting as she turns.' },
          { highlight: 'Eyes and paws shielded', text: 'debris at face height and hot rims both count.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Train Before Miles',
        items: [
          { highlight: 'Parked basket first', text: 'treats in a still bike before anything rolls.' },
          { highlight: 'Slow circles next', text: 'quiet lots at walking pace build the association.' },
          { highlight: 'Posture votes daily', text: 'braced and rigid means shorten the route home.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'What size dog can ride in a bike basket?',
        answer:
          "Basket carriers belong to genuinely small dogs, with each model's stated weight limit treated as structural rather than advisory. The limit protects the mount, the basket, and your steering together, so stay under it with margin. Dogs past that range still join rides in a towed trailer built for heavier passengers.",
      },
      {
        question: 'How do I teach my dog to ride in a bike basket?',
        answer:
          "Park the bike indoors, put treats in the basket, and wait for voluntary hopping before anything else. Add the harness and tether while the bike stands still, then try slow laps in a quiet lot. Grow distance and speed only once she stands easy and turns to watch the world, and end early sessions on a high note.",
      },
      {
        question: 'Should I tether my dog in the bike basket?',
        answer:
          "Yes, always, with a short line clipped to a harness rather than a collar. The tether is the only thing keeping a startled dog inside a moving basket, and the clip point decides whether a lunge spreads force across the chest or concentrates it on the throat. Add a swivel clip so the line stays tangle-free.",
      },
      {
        question: 'Do dogs need eye protection on bike rides?',
        answer:
          "Forward-riding dogs face moving air full of dust, grit, and insects, so fitted eye protection made for dogs or a basket windscreen genuinely helps. Dogs riding screened or behind you collect far less. Whichever setup you run, check that nothing touches the eyes when she turns her head, since poor fit defeats the purpose.",
      },
    ],
  },

  'travel-and-outdoor/bicycle-trailers': {
    heroTitle: 'Bicycle Dog Trailers for Big Passengers and Pairs',
    heroSubheadline:
      'A towed cabin takes larger dogs, pairs, and tired runners along behind your bike, with capacity, hitch, and visibility decisions doing the real safety work.',
    metaDescription:
      'Bicycle dog trailers tow larger dogs and pairs behind your bike. Compare capacity, wheel size, hitch safety, suspension, and visibility before the first mile.',
    introSummary:
      "Some dogs will run beside a bicycle forever and some will run for a mile, then spend the rest of the ride apologizing. A trailer settles that negotiation: a cabin towed behind the bike where a large dog, a pair of small ones, or a spent running partner rides in comfort. Towed gear lives or dies by its details, though, and a trailer is the one piece of pet equipment where hitch quality and wheel size are genuine safety topics. Here is how to choose one that earns its miles.",
    sections: [
      {
        id: 'towed-vs-mounted',
        title: 'What Towed Travel Adds Over Baskets',
        content:
          "Where a basket mounts the passenger onto the bike itself, a trailer tows a freestanding cabin behind it, which changes the physics in your favor. The bike keeps its normal steering, the load rides low between two wheels instead of high on the handlebars, and the passenger area can be sized for a full-size dog or two smaller ones. The trade is width and length behind you, which asks for wider turns and a habit of checking the trailer in traffic.",
        tips: [
          'Expect wider turns; the cabin trails beyond your rear wheel.',
          'Practice empty towing before any passenger ever loads in.',
          "Check the trailer's position in mirrors until it becomes habitual.",
        ],
      },
      {
        id: 'capacity-wheels',
        title: 'Capacity and Wheel Size Pair Up',
        content:
          "Capacity and wheel size decide together what the trailer can do. Bigger wheels roll farther over rough ground per rotation, holding speed and smoothing small bumps, while smaller wheels make a lighter, narrower package that stores easier. Match the stated capacity to your dog's real weight with generous margin, and if two dogs share the cabin, count both plus their harnesses before comparing numbers. As you compare trailer listings, read every capacity figure beside the wheel size that travels with it.",
        tips: [
          'Weigh every passenger plus gear before comparing capacities.',
          'Choose larger wheels once gravel or trails enter the plan.',
          'Keep trailer width in mind for gates and trail bollards.',
        ],
        tableData: {
          headers: ['Riding you do', 'Capacity to favor', 'Wheel call'],
          rows: [
            ['Pavement and bike lanes', "Your dog's weight plus margin", 'Smaller wheels, lighter tow'],
            ['Rail trails and gravel', 'Mid capacity, room to shift', 'Mid-size wheels smooth chatter'],
            ['Rough trails', 'Full-size dogs and pairs', 'Larger wheels, suspension'],
            ['Two small dogs together', 'Both weights plus gear', 'Any size, stable stance'],
          ],
        },
      },
      {
        id: 'hitch-quality',
        title: 'Hitch Quality and the Safety Release',
        content:
          "The hitch is where towing stops being casual. A good system clamps securely to the rear axle or frame, holds the trailer level behind the bike, and includes a safety release or secondary strap that keeps the tow arm controlled if the main connection ever fails. Inspect the hitch before each ride the way you check tire pressure, because a coupling that has loosened over a season of curb cuts will announce itself at the worst corner. Wobble test in the driveway, every time.",
        callout: {
          type: 'warning',
          title: 'A safety strap is not optional',
          text: "Hitches can loosen, and a trailer that disconnects at speed does not just stop, it veers into whatever is beside the road. The secondary strap or safety release turns that failure into a dragged, slowed trailer instead. Confirm yours exists, is undamaged, and is actually attached, not coiled in the garage.",
        },
        tips: [
          'Inspect the hitch and safety strap before every single ride.',
          'Wobble-test the coupling in the driveway after any curb hits.',
          'Confirm the tow arm rides level before passengers load in.',
        ],
      },
      {
        id: 'suspension',
        title: 'Suspension and Trail Chatter',
        content:
          "On smooth pavement a rigid trailer is fine, but gravel and roots pass every bump directly into the cabin floor, and a dog standing in a chattering box tires fast and can bruise pads. Suspension between the frame and cabin soaks up that chatter, and a padded floor mat covers what remains. For dogs riding out recovery or carrying extra age, the suspension question stops being comfort spending and starts being kindness. Match the trailer's intended terrain to the actual surfaces on your routes.",
        tips: [
          'Add suspension once gravel or rooty trails join your routes.',
          'Line the floor with padding regardless of suspension choices.',
          'Slow down for rough stretches; suspension is not a license.',
        ],
      },
      {
        id: 'visibility',
        title: 'Flags, Reflectives, and Being Seen',
        content:
          "A low trailer behind a bicycle sits below the sightline of most drivers, and being seen is your responsibility to engineer. A tall visibility flag marks the trailer's presence at car-window height, reflective trim catches headlights at dusk, and spoke reflectors or frame tape add motion that static panels miss. Add a rear light to the trailer itself on any ride near traffic, and plan routes that favor bike lanes and quiet streets while the habit of checking behind you develops.",
        tips: [
          'Fly a tall flag so cars see the trailer at window height.',
          'Add reflectives and a rear light for any dusk riding.',
          'Favor bike lanes until mirror checks become an automatic habit.',
        ],
      },
      {
        id: 'weather-screens',
        title: 'Weather Screens and Cabin Airflow',
        content:
          "Most towed cabins ship with a weather screen, a front panel that blocks wind and rain while mesh sides keep air moving, and learning to manage the two is a seasonal skill. Run the screen in cold rain and shoulder-season wind, drop it entirely on warm days, and never leave a dog in a closed, sun-baked trailer at a stop, which is the same error as a hot car in a smaller box. Cabin temperature deserves a check-in at every rest stop, by hand, on the floor.",
        callout: {
          type: 'warning',
          title: 'Closed cabins heat fast',
          text: "A zipped, sun-exposed trailer at a rest stop climbs in temperature the same way a parked car does, and dogs cool themselves poorly. Park in shade, open every panel, take the dog out with you, and touch the cabin floor before she climbs back in for the next leg.",
        },
        tips: [
          'Drop weather screens fully on warm days for airflow.',
          'Never leave a dog zipped into a parked, sunlit trailer.',
          'Touch the cabin floor at every rest stop, every ride.',
        ],
      },
      {
        id: 'teaching-entry',
        title: 'Teaching Entry as a Happy Place',
        content:
          "A trailer nobody forced a dog into is a trailer she will enter for years. Park it in the yard with the door open and dinner served inside, let her investigate on her own schedule, and close the door only after meals in there are boring news. First tows happen empty around a quiet block, then with her aboard at walking pace, and the whole progression might take weeks. Skip a step and you will spend a season winning back her trust; honor the steps and the trailer becomes her booth at every adventure.",
        callout: {
          type: 'pro-tip',
          title: 'Feed the trailer, not just the dog',
          text: "Serve a week of meals inside the parked trailer with the door open. The cabin stops being an object to inspect and becomes the place where dinner happens, which is the association you want running behind your bike on the first real ride.",
        },
        tips: [
          'Serve meals inside the open, parked trailer for a week.',
          'Tow the trailer empty around a quiet block before passengers.',
          'Keep first rides short, slow, and far from traffic.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Match Capacity',
        items: [
          { highlight: 'Real weights counted', text: 'both dogs plus harnesses before comparing any capacity figure.' },
          { highlight: 'Wheels follow terrain', text: 'bigger rolls rough ground, smaller stores and tows lighter.' },
          { highlight: 'Margin beats maximum', text: 'staying under the rating preserves frame and axle life.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Engineer the Tow',
        items: [
          { highlight: 'Hitches get inspected', text: 'before every ride, wobble-tested after every curb strike.' },
          { highlight: 'Safety straps attached', text: 'a disconnected trailer veers; a strapped one drags and slows.' },
          { highlight: 'Suspension for chatter', text: 'soaks the trail bumps a rigid floor passes straight through.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Make It Loved',
        items: [
          { highlight: 'Dinner inside first', text: 'meals in the parked cabin build the right association.' },
          { highlight: 'Empty tows before loaded', text: 'quiet laps with no passenger teach the trailer manners.' },
          { highlight: 'Screens lift on warmth', text: 'airflow drops heat; closed sun-baked cabins climb fast.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How much weight can a dog bike trailer hold?',
        answer:
          "Each trailer states a maximum capacity covering passengers plus anything else in the cabin, and honest owners stay comfortably under it. Count every dog, their harnesses, water, and the padding you add. Capacity protects the frame, the wheels, and the hitch together, so exceeding it degrades all three at once, especially over rough ground.",
      },
      {
        question: 'Can two dogs ride in one bike trailer?',
        answer:
          "Yes, when their combined weight plus gear sits well under the stated capacity and they are proven calm together in a small space. Introduce the cabin to each dog separately first, then supervise the first shared rides closely, since a scuffle in a towed cabin is a handling problem while towing. Some pairs never share well.",
      },
      {
        question: 'What wheel size should a dog trailer have?',
        answer:
          "Smaller wheels keep the trailer light and narrow for pavement and storage, while larger wheels roll over gravel, roots, and ruts with far less chatter reaching the cabin. If your routes stay paved, smaller works; once rail trails or rough tracks join the plan, step up in wheel size and consider suspension for the passenger's sake.",
      },
      {
        question: 'How should I introduce my dog to a bike trailer?',
        answer:
          "Start with meals served inside the parked trailer, door open, for about a week, then close the door briefly during dinner. Tow the empty trailer around a quiet block so the movement becomes ordinary, and only then add your dog at walking pace. Keep early rides short and calm, and never force an unwilling dog inside, since trust rebuilds slowly.",
      },
      {
        question: 'Are dog trailers safe in traffic?',
        answer:
          "They can be, with engineering and route honesty. Fly the visibility flag, run reflectives and a rear light, prefer bike lanes and quiet streets, and learn the trailer's extra width and length before crowded roads. Check the hitch and its safety strap each time you ride. Nervous riders and rush-hour routes are a poor match for any towed passenger.",
      },
    ],
    heroImageUrl: '/images/aussie_shepherd.jpg',
    heroImageAlt: 'Australian shepherd outdoors beside a bike trail',
  },
};
