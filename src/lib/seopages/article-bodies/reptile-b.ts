// Reptile family part B articles for Pawzsly U: habitat accessories,
// habitats, heaters and gauges, lighting, liners, supplements, and treats.
// Seven original blog bodies written to the WRITING-SPEC.md contract:
// on-topic, blog voice, at least six sections of authentic prose,
// marketplace-friendly without hard selling.
import type { ArticleBody } from './types';

export const REPTILE_B_ARTICLES: Record<string, ArticleBody> = {
  // =========================================================================
  // REPTILE / HABITAT ACCESSORY: the small-gear aisle and what each
  // tool is genuinely for
  // =========================================================================
  'reptile/habitat-accessory': {
    heroTitle: 'Reptile Habitat Accessories That Quietly Do the Work',
    heroSubheadline:
      "The big enclosure gets the glory, but the small gear runs the day: readings, timing, feeding, and handling tools that make daily reptile care nearly foolproof.",
    metaDescription:
      'A plain-English tour of the reptile habitat accessory aisle: where thermometers belong, what timer strips do, and which tongs and hooks earn their spot.',
    introSummary:
      "Nobody brags about their thermometer strip, yet that unglamorous shelf beside the big enclosures decides whether your animal actually lives in the climate you think you built. A dial thermometer stuck to the back wall reads the glass, not the gecko. A lamp on a plug you flip by hand gives your animal a schedule that shifts with your memory. Here is an honest tour of the small-gear aisle: what each tool genuinely does, where it belongs, and which pieces to buy first.",
    sections: [
      {
        id: 'small-tools-big-habitat',
        title: 'Why Small Tools Carry a Big Habitat',
        content:
          "The enclosure is the landscape; the small gear is the staff that keeps it honest. Reptiles are ectotherms, so the climate you provide effectively is their metabolism, and climate is built from readings and timing rather than good intentions. When a gecko stops thriving, the backstory usually includes a guessed temperature, a lamp switched on late, or fingers that smelled like dinner. The accessory shelf exists because husbandry fails at the details, and the details happen to be the cheapest things in the shop to get right.",
        tips: [
          'Treat climate tools as part of the habitat, not optional extras bought later.',
          'Write down what each gauge reads when you install it, then compare weekly.',
          'Spend on accuracy before decoration; a sick animal notices numbers, not scenery.',
        ],
      },
      {
        id: 'thermo-hygro-animal-level',
        title: 'Thermometers and Hygrometers at Animal Level',
        content:
          "Air temperature near the ceiling of an enclosure tells you almost nothing, because your animal does not live near the ceiling. A probe or sensor belongs where the animal actually rests: on the floor for a leopard gecko, on the branch under the lamp for a bearded dragon, in the hide for a ball python. Hygrometers follow the same rule, since humidity pools low and varies between ends. Two readings, one on each end, are what turn a box into a gradient you can actually manage.",
        callout: {
          type: 'pro-tip',
          title: 'Dial gauges read the wall',
          text: 'Stick-on analog dials measure the surface they are glued to, which is the glass, not your animal. Digital probes on a wire cost little more and tell the truth.',
        },
        tips: [
          'Place probes at resting height, not ceiling height, in both the warm and cool zones.',
          'Prefer digital probes with a cable over stick-on dials for any enclosure you care about.',
          'Check the hygrometer after misting; a slow drift means the sensor needs replacing.',
        ],
      },
      {
        id: 'timer-strips',
        title: 'Timer Strips That Remember for You',
        content:
          "A heat lamp that starts at nine on Tuesday and noon on Sunday is not a schedule; it is a coin flip wearing a schedule's clothes. Timer strips give your animal a sunrise that arrives on time every day of the year, including the mornings you sleep in or travel. Look at the wattage rating printed on the strip before you plug anything in, because basking bulbs and heat projectors draw real power and a cheap strip rated for LED strings has no business running them. Rugged, individually switched outlets turn one crowded outlet into a tidy system.",
        tips: [
          "Match the strip's wattage rating to your hottest bulb before you trust it overnight.",
          'Timer the day lamps; leave around-the-clock heat sources on their thermostat instead.',
          'Choose strips with individually switched outlets; one faulty lamp then stays contained.',
        ],
      },
      {
        id: 'feeding-tongs',
        title: 'Feeding Tongs That Keep Fingers Irrelevant',
        content:
          "Every keeper eventually learns that a reptile hunting by heat and movement cannot tell your knuckle from a cricket. Feeding tongs put distance in that equation: the insect arrives at the end of steel or carbon, and your hand stops being part of dinner theater. Longer tongs suit snappy monitors and hungry ball pythons; shorter ones handle crickets for small geckos. Grip style matters more than it looks, since a soft tip holds a waxworm without crushing it. As you compare listings, weigh tip material, length, and whether you can disinfect the whole tool.",
        callout: {
          type: 'warning',
          title: 'Fingers teach feeding responses',
          text: 'An animal that has eaten from a bare hand learns that hands mean food, and that lesson outlives the convenience. Tongs are cheap; retraining a strike response is not.',
        },
        tips: [
          "Match tong length to the animal's enthusiasm; nervous keepers need longer tools.",
          'Choose soft or coated tips that grip insects without puncturing them.',
          'Wash tongs after every session; feeders and reptile mouths both carry germs.',
        ],
      },
      {
        id: 'snake-hooks',
        title: 'Snake Hooks That Carry Real Weight',
        content:
          "A hook is not a cowboy prop; it is the polite way to tell a snake that the interaction starting now is handling, not food. Lifting the animal's midsection onto a hook takes its weight off your hands for the first few seconds, which is exactly when most defensive strikes happen. Boas and larger pythons deserve hooks sized to their heft, while a lightweight hook serves corn snakes and young animals fine. A hook also lets you move a cage defensive snake without pinning it, which builds far more trust than manhandling ever does.",
        tips: [
          'Hook-train from day one so the snake learns the pattern before it grows.',
          "Check the hook's stated weight rating for any snake over a few pounds.",
          'Store the hook inside or near the enclosure so you never improvise without it.',
        ],
      },
      {
        id: 'buying-order',
        title: 'A Sensible Order for Buying Small Stuff',
        content:
          "If the budget lands all at once, buy in this order: gauges first, because nothing else can be tuned without honest readings; timers second, because consistency is free medicine; tongs third, because fingers heal slowly; a hook fourth, because it matters more as your snake grows. Everything else on the accessory shelf is refinement. The same check applies to anything you're browsing: does this tool remove a guess, automate a chore, or protect a body part? If it does none of those three jobs, it is scenery, and scenery belongs to the decor conversation.",
        tips: [
          'Buy gauges before any other accessory; readings gate every other purchase.',
          'Add a second gauge set when you add a second enclosure, not eventually.',
          'Skip novelty tools until the boring four are already in place.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Gauge First',
        items: [
          { highlight: 'Animal level reads', text: 'belong where the animal rests, on both warm and cool sides.' },
          { highlight: 'Digital probes win', text: 'stick-on dials mostly measure the glass or wall behind them.' },
          { highlight: 'Two ends, two readings', text: 'a gradient exists only if you can see both sides of it.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Automate the Day',
        items: [
          { highlight: 'Timers keep schedules', text: 'a lamp on memory alone drifts with every busy morning.' },
          { highlight: 'Watch wattage ratings', text: 'heat bulbs deserve strips rated well above their draw.' },
          { highlight: 'Separate the circuits', text: 'day lamps on timers, constant heat on its thermostat.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Hands Off Dinner',
        items: [
          { highlight: 'Tongs break the association', text: 'so fingers stop arriving with every cricket you offer.' },
          { highlight: 'Hooks signal handling', text: 'the first seconds of a lift go smoother with support.' },
          { highlight: 'Buy in order', text: 'gauges, timers, tongs, then the hook as your snake grows.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Where should I put the thermometer in my reptile enclosure?',
        answer:
          'At animal level, on both the warm and cool sides. A sensor clipped near the top reads ceiling air your reptile never uses, while a probe resting on the floor or basking surface reads the conditions its body actually meets. Two cheap digital probes beat one expensive gauge in a useless spot.',
      },
      {
        question: 'Can I run a heat lamp on a timer strip?',
        answer:
          "Yes, day heat lamps are commonly run on timers alongside the lights, provided the strip's wattage rating comfortably exceeds the bulb's draw. Check the rating printed on the strip itself rather than the box copy. Around-the-clock heat sources, like mats and panels, belong on a thermostat rather than any timer.",
      },
      {
        question: 'What length feeding tongs should I get?',
        answer:
          'Roughly arm\'s length is unnecessary; most keepers are happy between ten and twenty inches depending on the animal. Snappy feeders and larger snakes justify the longer end, while a small gecko tolerates a short pair fine. Soft tips matter more than length for delicate insects, and a tool you can disinfect whole beats one with glued seams.',
      },
      {
        question: 'Do I need a snake hook for a corn snake?',
        answer:
          'Strictly, no; plenty of corn snakes are relaxed enough to lift by hand. A lightweight hook still earns its shelf space because it signals handling instead of feeding, and it bridges the awkward first seconds of a cage defensive young snake. Think of it as inexpensive insurance you will outgrow rather than skip.',
      },
      {
        question: 'Are stick-on thermometer dials accurate enough for reptiles?',
        answer:
          "Not really, and the reason is placement physics: an analog dial glued to the wall measures the wall's temperature, which can differ substantially from the air or the surface your animal occupies. They are better than nothing for a quick sanity check, but digital probes with cables cost only a little more and read the spot that matters.",
      },
    ],
  },

  // =========================================================================
  // REPTILE / HABITATS: enclosure shopping by species
  // =========================================================================
  'reptile/habitats': {
    heroTitle: 'How to Choose a Reptile Habitat That Lasts Years',
    heroSubheadline:
      'Door direction, body material, vent placement, and adult sizing decide whether an enclosure serves one animal well for a decade or gets outgrown within the season.',
    metaDescription:
      'Shop reptile habitats by species, not looks: front or top doors, glass versus screen versus PVC humidity bodies, vent placement, and the size-for-adult rule.',
    introSummary:
      "The most expensive enclosure is the second one you buy because the first was too small, too leaky, or shaped wrong for the animal living in it. Habitat shopping works backward from the species: how big the adult grows, whether it climbs or patrols the floor, how much humidity its body expects, and how it prefers to be approached. Get those four answers first and the shelf narrows itself. Here is how each enclosure decision actually plays out in daily keeping.",
    sections: [
      {
        id: 'size-for-adult',
        title: 'Shop for the Adult, Not the Hatchling',
        content:
          "Hatchlings look tiny next to even a modest terrarium, which tempts everyone toward a starter cage the animal will outgrow by its first birthday. The keepers' rule is to buy for the adult and make a young animal feel secure with hides, foliage, and visual breaks rather than square footage. For snakes, common guidance puts the enclosure's length plus depth at roughly the snake's adult length, so a five-foot boa is not a forty-gallon animal. Lizards trade length for floor and climbing area shaped by how the species actually moves.",
        callout: {
          type: 'pro-tip',
          title: 'Break a big cage visually',
          text: 'A hatchling in an adult enclosure settles faster when you fill the middle with branches, plants, and cork until the space reads small. Sparse and enormous feels like exposure to a young animal.',
        },
        tips: [
          'Look up the adult size of the exact species, not the pet store label.',
          'Fill oversized enclosures with structure so young animals feel covered, not exposed.',
          'Treat enclosure length plus depth as the honest footprint, not gallons alone.',
        ],
      },
      {
        id: 'front-vs-top-doors',
        title: 'Front Doors Versus Overhead Lids',
        content:
          "Reaching in from above mimics exactly how a hawk arrives, and many reptiles read a descending hand as the start of an attack. Front-opening enclosures approach the animal at eye or floor level, which reads as far less threatening, and they let you spot clean, feed, and retrieve bowls without lifting lights and screen off the top. Top-opening lids still make sense for shallow tubs, hatchling racks, and budget setups, provided you open them slowly and from the side. The honest trade is money: front-glass terrariums cost more than converted tubs, and most keepers never regret paying it.",
        tips: [
          'Open lids slowly from the side so the animal sees the motion coming.',
          'Front doors pay off daily in feeding and cleaning, not just in tameness.',
          'Stack front-openers only with proper stands; glass corners carry real weight.',
        ],
      },
      {
        id: 'body-materials',
        title: 'Glass, Screen, and PVC Body Choices',
        content:
          "The body material is really a humidity decision. Screen tops and walls exchange air freely, which suits chameleons and dry desert species but wicks moisture away from jungle animals. Glass holds humidity well and shows the animal beautifully, at the cost of weight and breakable corners. PVC panels hold humidity best of all, stay light, and insulate, which is why they dominate the keeping of humidity-loving pythons and geckos. The table below matches each body to the animals it serves.",
        tableData: {
          headers: ['Body Material', 'Humidity Behavior', 'Strong Fit', 'Trade-Off'],
          rows: [
            ['Glass terrarium', 'Holds moisture, slow to dry', 'Humid and display species', 'Heavy; breakable corners'],
            ['Full or partial screen', 'Vents fast, dries quickly', 'Chameleons, desert lizards', 'Loses heat and humidity'],
            ['PVC panel', 'Seals humidity best', 'Pythons, geckos, frogs', 'Scratches; cost up front'],
            ['Wood or melamine', 'Holds warmth if sealed well', 'Large custom builds', 'Needs sealing; heavy'],
          ],
        },
        tips: [
          'Pick the body by the humidity the species needs, not the view you want.',
          'Seal wooden enclosures with animal-safe waterproofing before the first deep clean.',
          'Compare door gaskets and latch quality as closely as the material itself.',
        ],
      },
      {
        id: 'vent-placement',
        title: 'Vents That Move Air on Purpose',
        content:
          "Airflow is the difference between fresh humidity and a swamp, and vent placement is how an enclosure gets it right. The classic arrangement pairs low vents on one side with high vents on the other, so warm air rising pulls fresh air through the whole space instead of dead-ending at the top. Enclosures with only a screen top often short-circuit: everything rises straight out and humidity leaves with it. When you compare listings, look for vent strips positioned low front or side and high on the opposite wall, and picture the slow loop they create.",
        tips: [
          'Aim for low intake on one wall and high exhaust near the opposite corner.',
          'Add vent plugs where drafts hit a favorite perch or basking ledge.',
          'Fogged glass around the clock means airflow needs help, not more misting.',
        ],
      },
      {
        id: 'dry-run',
        title: 'Dry Runs Before Anyone Moves In',
        content:
          "Run the finished habitat empty for a few days before the animal arrives, with heat, lights, and water in place and gauges where the animal will actually sit. You are hunting for the unglamorous failures: a cord exit that gaps open, a door that needs two hands, condensation pooling at one corner, temperatures that never settle. Every problem found now costs an afternoon; the same problem found with a stressed gecko inside costs a week of regression. As you compare enclosures, factor in cord grommets, pre-cut probe holes, and how the doors come apart for cleaning.",
        callout: {
          type: 'warning',
          title: 'Cord holes are escape routes',
          text: 'A probe cable through an unsealed gap becomes a highway for a determined hatchling, and snakes test every opening the first night. Seal cord exits snugly and check them by feel each cleaning day.',
        },
        tips: [
          'Run heat and lights for several empty days before the animal ever arrives.',
          'Check cord exits nightly for the first week; escape artists test them early.',
          'Photograph your gauge readings during the dry run as your baseline numbers.',
        ],
      },
      {
        id: 'lifestyle-match',
        title: "Matching the Body to the Species' Lifestyle",
        content:
          "An arboreal gecko wants height and vertical sightlines; a terrestrial skink wants floor and low cover; a fossorial sand swimmer wants depth more than either. The enclosure's proportions should follow that lifestyle before any other preference, because no amount of quality gear rescues a shape the animal cannot use. Climbers need door placement that does not dump them onto the floor during routine opens, and heavy-bodied ground dwellers need floor-rated glass or PVC that will not flex. Read the species first and the rest of the decision gets easier.",
        tips: [
          'Height suits climbers; floor area suits patrollers; depth suits burrowers and swimmers.',
          'Check door height for arboreal species so routine opens do not spill them.',
          'Verify floor strength ratings for heavy-bodied adults like large boas.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Size for Adults',
        items: [
          { highlight: 'Buy once, if possible', text: 'adult sizing beats starter cages outgrown within the year.' },
          { highlight: 'Break up big spaces', text: 'hides and foliage make hatchlings feel covered, not exposed.' },
          { highlight: 'Footprint over gallons', text: 'length plus depth serves ground patrollers better than volume.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Bodies and Humidity',
        items: [
          { highlight: 'PVC seals moisture', text: 'the go-to body for humidity-loving pythons and geckos.' },
          { highlight: 'Screen breathes constantly', text: 'right for chameleons, wrong for jungle species needing damp air.' },
          { highlight: 'Glass shows everything', text: 'beautiful display, real weight, and corners that deserve respect.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Move-In Discipline',
        items: [
          { highlight: 'Dry run first', text: 'days of empty testing catch failures before the animal pays.' },
          { highlight: 'Seal every cord exit', text: 'snakes test gaps the first night; check openings by feel.' },
          { highlight: 'Vents make loops', text: 'low intake and high exhaust keep air moving without drying it.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Is a front-opening terrarium really better than a top-opening one?',
        answer:
          'For most species, yes, because a hand arriving from above resembles a predator while a door opening at eye level reads as far less alarming. Front doors also make feeding and spot cleaning dramatically easier. Top-opening still works fine for hatchlings and shallow tubs when you open slowly from the side.',
      },
      {
        question: 'What enclosure material is best for a ball python?',
        answer:
          'PVC is the popular answer because it holds the higher humidity ball pythons need, stays light, and insulates well, though a glass terrarium with a partial screen top also works with attentive misting. Full screen cages are the wrong tool here; they surrender moisture faster than most keepers can replace it.',
      },
      {
        question: 'Can I turn an old fish tank into a reptile enclosure?',
        answer:
          'Sometimes, with honest limits. A standard aquarium with a fitted screen lid can house arid or adaptable species, but the top-opening access stresses many animals, humidity escapes through the lid, and tall tanks waste floor on ground dwellers. Weigh the conversion cost against a purpose-built front-opener before committing.',
      },
      {
        question: 'Where should vents go on a reptile enclosure?',
        answer:
          'Low on one side, high on the other, so rising warm air draws fresh air diagonally through the space. A single screen top often lets everything rise straight out, taking humidity with it. Blocking or adding vents is easy on PVC and worth planning before the animal moves in.',
      },
      {
        question: 'How big should an enclosure be for an adult bearded dragon?',
        answer:
          'Modern guidance starts around four feet of floor length for one adult, with height enough for a basking branch and a cool floor below it. Floor area matters more than volume for this species, since beardies patrol and dig more than they climb. As you compare sizes, picture the full furniture before deciding.',
      },
    ],
  },

  // =========================================================================
  // REPTILE / HEATERS AND GAUGES: building the thermal gradient
  // =========================================================================
  'reptile/reptile-heaters-and-gauges': {
    heroTitle: 'Reptile Heaters and Gauges That Build a Real Gradient',
    heroSubheadline:
      'A reptile does not warm itself; it moves between temperatures you provide. Heating gear plus honest gauges is how that gradient gets built, checked, and kept safe.',
    metaDescription:
      'Build a real thermal gradient for your reptile: basking and cool zones, under-tank versus overhead heat, why a thermostat is non-negotiable, and IR temp guns.',
    introSummary:
      "Ask a struggling keeper what temperature their basking surface runs and you often get a guess, which is the whole problem in one sentence. Reptiles do not generate their own working heat; they shop for it, moving warm to digest and cool to rest. Your job is not to make the cage warm but to build a gradient with a hot spot, a cool retreat, and honest numbers on both. The heater shelf and the gauge shelf are really one shelf, and here is how they fit together.",
    sections: [
      {
        id: 'gradient-logic',
        title: 'Why One Warm Box Fails an Ectotherm',
        content:
          "A single lamp running flat out produces one climate, and one climate is a cage, not a habitat. Ectotherms regulate by moving: they bask to fuel digestion, then retreat to cooler ground so their bodies are not cooked by the same warmth that fed them. A gradient means the warm end and the cool end differ enough to give that choice, with hides available on both sides so the animal never trades security for temperature. Heat gear is not about warmth alone; it is about creating options the animal can walk between.",
        tips: [
          'Put hides at both ends so security never depends on choosing a temperature.',
          'Think warm end and cool end first; equipment follows the plan.',
          'Watch where the animal actually sits; behavior is your gradient report.',
        ],
      },
      {
        id: 'basking-and-cool',
        title: 'The Basking Surface and the Cool Retreat',
        content:
          "The number that matters for a basking lizard is the surface temperature where its body presses the branch or rock, not the air above it. Overhead lamps warm that surface directly, which is why basking species are lit from above like the sun would. The cool end matters just as much: it is the animal's off-switch, the place it goes to slow down, sleep, and escape its own metabolism. Measure both ends at animal height, then trust the reading over the packaging's claims about what the bulb should do.",
        tips: [
          'Aim the probe of any thermostat at the basking surface, not the air nearby.',
          'Check cool-end readings in the afternoon, when the room itself is warmest.',
          'Recheck both ends whenever you change a bulb, branch, or room season.',
        ],
      },
      {
        id: 'heat-source-pairs',
        title: 'Belly Heat, Overhead Heat, and Overnight',
        content:
          "Under-tank heaters warm the floor where a snake's belly rests, and belly heat is what many snakes use for digestion. Overhead bulbs and ceramic emitters warm surfaces and air the way sun does, which suits basking lizards and taller enclosures. Overnight is the quiet question: emitters and radiant panels supply darkness-friendly heat, while bright bulbs do not belong in a night cycle. The pairing matters as much as the pick, and the table lays out which source earns which job.",
        tableData: {
          headers: ['Heat Source', 'Warms Best', 'Natural Fit', 'Watch For'],
          rows: [
            ['Under-tank mat', 'The floor surface above it', 'Terrestrial snakes, belly heat', 'Cracks glass without a spacer'],
            ['Basking bulb', 'Surfaces and air from above', 'Diurnal basking lizards', 'Needs a fitting dome and guard'],
            ['Ceramic emitter', 'Surfaces, no visible light', 'Overnight and background heat', 'Runs hot; guard it'],
            ['Radiant heat panel', 'Whole enclosure from the top', 'Tall PVC and snake racks', 'Mounting height changes everything'],
          ],
        },
        tips: [
          'Raise under-tank mats on a spacer so the glass never touches the pad directly.',
          'Guard every overhead emitter; burns happen when animals climb onto fixtures.',
          'Keep bright bulbs out of overnight cycles; darkness-friendly sources exist for that job.',
        ],
      },
      {
        id: 'thermostats',
        title: 'Thermostats Are the Part You Cannot Skip',
        content:
          "Every heater on this page becomes dangerous the moment it runs unregulated, because a mat or emitter at full power will keep climbing past anything safe. A thermostat reads its probe and cuts or dims the heater to hold a setpoint, turning an appliance into an instrument. On-off styles click heaters at the threshold; proportional styles dim or pulse for smoother holding, and bulb life benefits. Set the probe where the animal's body will be, route cords away from claws, and treat any heater sold without regulation as unfinished rather than convenient. When you compare thermostats, treat capacity ratings and probe length as the headline specs.",
        callout: {
          type: 'warning',
          title: 'Wall outlets are not control',
          text: 'A heat mat plugged straight into the wall is a burn waiting for a night you forget it. The thermostat is the least optional purchase in reptile heating; everything else is negotiable.',
        },
        tips: [
          'Budget the thermostat before the second heater; it outranks everything but gauges.',
          "Confirm the thermostat's wattage capacity covers the heaters you attach to it.",
          'Check probe security monthly; a dropped probe silently cooks a warm end.',
        ],
      },
      {
        id: 'ir-guns',
        title: 'Infrared Guns and Surface Truth',
        content:
          "An infrared thermometer reads the surface it is pointed at, which is exactly what a reptile's belly experiences on the basking stone. The gun costs about as much as a nice feeder order and removes the last guess from gradient work: point, pull, and read the spot. Air probes and surface readings are partners, not rivals; the probe tracks the room over hours while the gun catches the branch temperature at this minute. Point at the same marked spots each time so your notes compare like with like.",
        tips: [
          'Measure the basking surface from the distance the instructions recommend for accuracy.',
          'Mark measurement spots with a grease pencil so readings stay comparable.',
          'Compare gun readings against your probes monthly; drift on either side needs attention.',
        ],
      },
      {
        id: 'honest-numbers',
        title: 'Keeping the Numbers Honest Over Months',
        content:
          "Gradients drift: bulbs age and dim, rooms change with the seasons, mats loosen from glass, and a substrate refresh can bury a probe. Put a repeating reminder on your calendar to recheck both ends with the gun, and log the numbers somewhere boring and permanent. When you shop the heater aisle for replacements, the same honesty applies to what you're browsing; listings worth comparing will state wattage, thermostat compatibility, and fitting sizes plainly. And if an animal that ate well all summer goes quiet in a suddenly cold room, suspect the equipment before the animal.",
        callout: {
          type: 'vet-note',
          title: 'Quiet animals, cold rooms',
          text: 'A reptile that stops eating or barely moves as temperatures drop is telling you something, but the message needs a professional read. Fix and verify the gradient first, then check with a veterinarian experienced with reptiles if the behavior continues.',
        },
        tips: [
          "Recheck the full gradient whenever the home's heating season changes over.",
          'Retire aging basking bulbs before they visibly dim; output fades quietly.',
          'Log readings in a note on your phone next to the feeding log.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Build the Gradient',
        items: [
          { highlight: 'Read both ends', text: 'a gradient only exists if you can see its sides.' },
          { highlight: 'Surface beats air', text: 'the basking spot is the surface the belly touches.' },
          { highlight: 'Hides on both sides', text: 'security should never cost an animal its temperature choice.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Regulate Everything',
        items: [
          { highlight: 'Thermostats are non-negotiable', text: 'unregulated mats and emitters climb past safe without one.' },
          { highlight: 'Guard hot fixtures', text: 'climbing animals burn on unguarded emitters and domes.' },
          { highlight: 'Check wattage capacity', text: 'the controller has to carry every heater you attach.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Keep Checking',
        items: [
          { highlight: 'Guns read surfaces now', text: 'probes track hours; together they cover the whole gradient.' },
          { highlight: 'Bulbs fade quietly', text: 'replace aging lamps before the dimming becomes visible.' },
          { highlight: 'Seasons shift rooms', text: "recheck both ends whenever your home's heating changes." },
        ],
      },
    ],
    faqs: [
      {
        question: 'Can I use a heat mat without a thermostat?',
        answer:
          'No, and this one is not negotiable. A mat at full wall power keeps climbing well past safe floor temperatures, and burns happen overnight, out of sight. Even a basic on-off thermostat turns the same mat into a controlled instrument. If the budget forces a choice, buy the thermostat before the second heater.',
      },
      {
        question: 'Do reptiles need heat at night?',
        answer:
          'Many do want a gentle overnight drop rather than total cold, but the drop size depends entirely on the species. Desert and tropical species generally need nights kept warmer than a chilly house allows, while some temperate species handle cool nights comfortably. Use a no-light source like a ceramic emitter or panel, and verify with a probe.',
      },
      {
        question: 'Where do I point an infrared thermometer?',
        answer:
          'At the exact surface the animal uses: the basking stone, the branch top, the floor over a mat, and a cool-end spot for contrast. Hold the gun within the distance range its instructions suggest, since accuracy falls off when you shoot from across the room. Same spots, every time, keeps your notes meaningful.',
      },
      {
        question: 'What is the difference between on-off and dimming thermostats?',
        answer:
          'An on-off thermostat simply cuts power at the setpoint and restores it below, which suits mats and ceramic emitters fine. Dimming and pulse-proportional units taper the output instead, holding tighter temperatures and treating bulbs gently, which basking lamps appreciate. Both are safe; the proportional kinds are simply smoother and usually cost more.',
      },
      {
        question: 'How do I know if my basking spot is hot enough?',
        answer:
          "Read the surface with an infrared gun rather than trusting the bulb's box, and compare it against the species' published range from a care sheet you trust. A lizard that spreads its body flat under the lamp is basking normally; one that avoids the spot entirely usually means it runs too hot.",
      },
    ],
  },

  // =========================================================================
  // REPTILE / LIGHT FIXTURES AND BULBS: UVB as biology, not brightness
  // =========================================================================
  'reptile/reptile-light-fixtures-and-bulbs': {
    heroTitle: 'Reptile Light Fixtures and Bulbs Beyond Just Brightness',
    heroSubheadline:
      'Most of the light in a reptile room is doing invisible work: UVB, day length, and warmth each run on separate gear, and confusing them shortens lives.',
    metaDescription:
      'Reptile lighting is three jobs in one shelf: real UVB, honest day lengths, and gentle heat. How tubes, coils, fixtures, and cycles fit together properly.',
    introSummary:
      "The bulb over a reptile is not there so you can see the animal; it is there so the animal can run its own biology. UVB light lets skin manufacture vitamin D3, which lets the body use calcium, which keeps bones and shells built. Skip or botch that chain and the animal pays for months before anything looks wrong. Fixtures, distances, and day cycles are the machinery that keeps the chain intact, so here is how to shop the lighting shelf with the animal's chemistry in mind.",
    sections: [
      {
        id: 'what-uvb-does',
        title: 'What UVB Actually Does Under the Skin',
        content:
          "UVB is a band of ultraviolet that triggers a chemical step in the skin, converting a cholesterol-like compound into the beginnings of vitamin D3. That vitamin unlocks dietary calcium, and without the unlock, the body pulls calcium from bone regardless of how much powder you dust. Diurnal basking lizards need it strongest, many forest species need it gentler, and whole-prey snakes generally collect enough from their diets to manage without. The question for any species is intensity and hours, never simply whether light looks bright.",
        callout: {
          type: 'vet-note',
          title: 'Soft jaws and bent limbs',
          text: 'Swollen limbs, a rubbery jaw, or a lizard that trembles while walking can signal advanced bone disease from a broken UVB and calcium chain. Check with a veterinarian experienced with reptiles promptly; these cases respond best when caught early.',
        },
        tips: [
          "Research your species' UVB intensity needs before buying any bulb at all.",
          'Whole-prey snakes often need none; diurnal basking lizards need the most.',
          'Treat brightness and UVB as separate specs; one does not imply the other.',
        ],
      },
      {
        id: 'tubes-vs-coils',
        title: 'Tubes Spread, Coils Concentrate',
        content:
          "A linear UVB tube casts usable ultraviolet across most of the enclosure's length, so an animal gets exposure wherever it chooses to sit. A compact coil screws into a normal dome and lights a much smaller footprint, which suits narrow tanks or a starter setup on a tight budget. The honest weakness of coils is coverage shape: strong close in, weak at the far end, which is exactly how a gradient of a different kind gets lost. Match tube length to the cage width, and you rarely regret it.",
        tips: [
          'Size the tube to span most of the enclosure, not just one corner.',
          'Reserve coils for small tanks where their narrow reach covers the animal.',
          'Add a reflector hood; a bare tube loses output in every direction.',
        ],
      },
      {
        id: 'distance-and-mesh',
        title: 'Distance and the Mesh Tax',
        content:
          "UVB falls off fast with distance, so the gap between lamp and basking branch is a setting, not an accident. Every centimeter matters most for high-output bulbs, which is why manufacturers print distance ranges on the packaging and why measuring beats eyeballing. Then comes the mesh: a screen top blocks a real share of UVB before it ever reaches the animal, so a bulb sitting above mesh needs to be stronger or closer than the label's bare-bulb figure. Mounting under the mesh, with a guard, buys the full output back.",
        tips: [
          "Measure from the tube to the animal's highest basking point, tape measure out.",
          'Account for mesh loss by following the bulb\'s screened-figure guidance when given.',
          'Raise or lower fixtures with chain or risers rather than guessing wattage.',
        ],
      },
      {
        id: 'day-night-cycles',
        title: 'Day Length and the Honest Night',
        content:
          "Photoperiod is the schedule half of lighting, and reptiles read it keenly: steady day lengths tell seasonal time, trigger breeding condition, and frame activity. A consistent on-off rhythm matters more than minute-perfect sunrise, so put the day lamps on a timer strip and let the wall remember it. Nights belong to darkness; most reptiles have no use for a lit night, and colored bulbs sold for midnight viewing often disturb sleep more than they soothe. If night warmth is needed, the heater aisle, not the lighting aisle, owns that job.",
        tips: [
          'Timer the day lamps; a schedule kept by memory drifts within weeks.',
          'Pick one day length and hold it steady until you mean to change seasons.',
          'Keep night light out of the enclosure; darkness is part of the cycle.',
        ],
      },
      {
        id: 'mercury-vapor',
        title: 'Mercury Vapor Bulbs and Combo Honesty',
        content:
          "Mercury vapor bulbs bundle heat and UVB in one glowing package, and the convenience is real: one fixture, one cord, one basking spot that does everything. The trade-offs deserve equal billing. Most cannot be run on a dimming thermostat, so heat control falls to distance and fixture choice. Their UVB is intense, which suits sun-loving desert species but overwhelms shade dwellers if distance goes unchecked. And when one function fades, you replace the whole bulb. Separate lamps cost more sockets but let each job be tuned and replaced alone.",
        tableData: {
          headers: ['Format', 'UVB Coverage', 'Heat Included', 'Best Use'],
          rows: [
            ['Linear tube', 'Wide, even span', 'No', 'Most enclosures, all species'],
            ['Compact coil', 'Narrow cone', 'No', 'Small tanks, budget starts'],
            ['Mercury vapor', 'Strong flood', 'Yes', 'Desert baskers, big cages'],
          ],
        },
        tips: [
          "Weigh the mercury vapor's no-dimming limit against your thermostat before committing.",
          'Keep intense combo bulbs at the distance the instructions state, measured.',
          'Prefer separate fixtures when you want heat and UVB tuned independently.',
        ],
      },
      {
        id: 'fixture-fit',
        title: 'Fixtures That Fit the Cage',
        content:
          "A bulb is only half a purchase; the fixture decides whether it performs. Domes and hoods with built-in reflectors throw output downward instead of wasting it into the room, and ceramic sockets tolerate the heat of high-wattage basking lamps far better than plastic shells. Check the fixture's length against a linear tube, its mouth against a deep-domed basking bulb, and its mounting options against your lid or frame. As you compare fixtures across listings, the wattage rating printed on the socket should be your first filter, before style or price.",
        tips: [
          'Match ceramic sockets to any lamp hot enough to worry the plastic ones.',
          'Buy reflector hoods for tubes; bare bulbs waste half their output.',
          'Confirm mounting hardware fits your screen, frame, or stand before checkout.',
        ],
      },
      {
        id: 'silent-bulb-death',
        title: 'Bulbs That Die in Silence',
        content:
          "A UVB bulb keeps looking perfectly lit long after its ultraviolet output has faded into ordinary light, which makes it the only pet product that fails while appearing to work. Most manufacturers advise replacing tubes on the order of yearly, some sooner, and the schedule belongs on your calendar rather than your intuition. Write the install date on the fixture with a grease pencil the day you hang it. When you shop replacements, judge any bulb you're browsing by its stated output range and replacement interval rather than promises of lasting brightness.",
        callout: {
          type: 'pro-tip',
          title: 'Date the fixture',
          text: 'A grease-pencil install date on the hood ends the guessing. When the calendar says replace, replace, even if the tube still glows like new.',
        },
        tips: [
          'Note replacement dates next to feeding reminders so neither slips quietly.',
          'Budget a yearly tube replacement as routine, not as an emergency purchase.',
          'Swap tubes on schedule even when they still glow brightly.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'UVB With Intent',
        items: [
          { highlight: 'Species sets intensity', text: 'desert baskers, forest shade dwellers, and diet-covered snakes differ.' },
          { highlight: 'Tubes beat patches', text: 'linear coverage follows the animal wherever it chooses to sit.' },
          { highlight: 'Coils fit small tanks', text: 'their narrow cone suits cages a tube cannot span.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Distance and Mesh',
        items: [
          { highlight: 'Measure the real gap', text: 'tube to the highest basking point, with a tape measure.' },
          { highlight: 'Mesh takes a cut', text: 'screen tops block a real share before light reaches the animal.' },
          { highlight: 'Mount under when possible', text: 'guarded mounting beneath mesh buys the full rated output back.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Cycles and Replacements',
        items: [
          { highlight: 'Timers hold schedules', text: 'steady day lengths beat memory and its weekend drift.' },
          { highlight: 'Nights stay dark', text: 'colored night bulbs often cost more sleep than they return.' },
          { highlight: 'Date every bulb', text: 'glowing tubes still fade; the calendar tells the truth.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Do all reptiles need a UVB bulb?',
        answer:
          'Not all. Diurnal, sun-basking lizards need meaningful UVB; many forest and crepuscular species need gentler output; and snakes eating complete whole prey generally get enough vitamin D3 from the diet itself. Look up the species\' specifics before spending, since more UVB than needed is not automatically better for shade dwellers.',
      },
      {
        question: 'How far should the UVB bulb be from my lizard?',
        answer:
          "Follow the distance range printed on that specific bulb, measured from the lamp down to the highest perch the animal uses, because output drops quickly with every inch. If the bulb sits above a mesh lid, account for the blocked share by using the manufacturer's screened-top guidance or mounting beneath the mesh.",
      },
      {
        question: 'How often should UVB bulbs be replaced?',
        answer:
          'Most makers suggest replacing linear tubes roughly once a year, and compact coils sooner, even though both keep glowing happily. Output decays below useful long before the visible light dies, so the calendar is the only honest judge. Write the install date on the fixture and trust it over the glow.',
      },
      {
        question: 'Are mercury vapor bulbs worth the money?',
        answer:
          'They are a genuine two-in-one for desert baskers in spacious cages, combining strong UVB with basking heat in a single fixture. The costs are control and replacement: most cannot be dimmed by a thermostat, and losing either function means replacing the whole bulb. Separate fixtures suit keepers who want independent tuning.',
      },
      {
        question: 'Do red or blue night bulbs disturb reptiles?',
        answer:
          'Often, yes. Reptiles see more of the spectrum than the marketing implies, and many animals sleep worse under a colored glow than in true darkness. If overnight warmth is genuinely needed, a ceramic emitter or radiant panel adds heat with zero light and belongs on a thermostat, not on the visible-light shelf.',
      },
    ],
  },

  // =========================================================================
  // REPTILE / LINERS: the washable-floor approach
  // =========================================================================
  'reptile/liners': {
    heroTitle: 'Reptile Cage Liners for Cleanup Without the Digging',
    heroSubheadline:
      'A liner trades a naturalistic floor for a floor you can pull, rinse, and swap in five minutes, and for some animals and some seasons, that trade wins outright.',
    metaDescription:
      'The liner approach to reptile floors: easy cleaning, hatchling safety, quarantine advantages, materials, and the rinse-and-replace cadence that keeps it honest.',
    introSummary:
      "Every substrate has a philosophy, and the liner's is blunt: the floor is a surface to be cleaned, not a habitat to be interpreted. A washable sheet means you see every dropping, spot a missed cricket instantly, and reset the whole cage between breakfast and coffee. You give up digging, burrowing, and the look of a forest floor, and for many animals that is a real loss. But for hatchlings, quarantine rooms, and keepers with full schedules, liners quietly beat everything else, and the reason is worth understanding.",
    sections: [
      {
        id: 'liner-idea',
        title: 'The Liner Idea in One Sentence',
        content:
          "A cage liner is a cut-to-fit sheet laid directly on the enclosure floor, pulled out entirely for cleaning rather than scooped or sifted in place. That single mechanical difference changes the whole cleaning rhythm: instead of spot-treating a granular floor, you carry the floor itself to the sink. Feeder insects have nowhere to hide, waste sits in plain view, and a full reset takes minutes. The approach asks something of you in return, namely honesty about which animals genuinely need loose footing and which simply look nicer on it.",
        tips: [
          'Ask what the floor is for: digging, drainage, or nothing at all.',
          'Picture the weekly cleaning ritual before choosing any flooring for the cage.',
          'Remember that sightlines matter; visible waste catches problems earlier.',
        ],
      },
      {
        id: 'when-liners-win',
        title: 'Where Liners Beat Loose Floors',
        content:
          "Hatchlings are the clearest case. A young gecko hunting in loose particles can swallow substrate with its prey, and the liner floor removes the hazard entirely while also making tiny droppings impossible to miss. Quarantine is the second case: a new arrival needs a floor you can disinfect to a standard, not one with pores, and the liner plus paper-towel approach is what many veterinary hospitals use for exactly that reason. Recovery from injury or surgery is the third, where clean and simple beats natural and complicated.",
        callout: {
          type: 'pro-tip',
          title: 'Cut two, always',
          text: 'Whatever liner you buy, cut a second one immediately so a soiled floor can be swapped for a clean one while the dirty sheet soaks. The rotation is what makes the system effortless.',
        },
        tips: [
          'Default to liners for hatchlings until hunting accuracy is proven.',
          'Run new arrivals on disinfected liners for their full quarantine window.',
          'Keep a dedicated quarantine set that never enters the permanent cages.',
        ],
      },
      {
        id: 'liner-materials',
        title: 'Materials on the Liner Shelf',
        content:
          "The shelf holds a few honest options. Fleece and reptile carpet are soft, machine-washable, and gentle on feet, but their fibers can snag claws if edges fray. Rubberized shelf liner with an open mesh drains water and grips well for humid setups. Smooth non-porous sheets wipe down in seconds and suit quarantine perfectly. What you want to avoid is anything adhesive-backed: glues under heat and humidity can leave residue and fumes you would never invite into a closed habitat. As you compare liner products, check for fraying at cut edges first; tidy edges predict a long working life.",
        callout: {
          type: 'warning',
          title: 'Loops catch toes',
          text: "Frayed carpet fibers and pulled loops can wrap a gecko's toe tightly enough to cut circulation. Trim frayed edges the day you notice them, and retire any liner that keeps unraveling.",
        },
        tips: [
          'Wash new liners before first use to remove sizing and factory residue.',
          'Trim fraying edges immediately; a snagged toe is a bad week.',
          'Skip adhesive-backed shelf products entirely inside a warm, humid enclosure.',
        ],
      },
      {
        id: 'sizing-and-cutting',
        title: 'Sizing and Cutting for a Flat Fit',
        content:
          "Measure the enclosure floor inside the frame lip, then cut the liner slightly small so edges cannot buckle into hills that trap waste underneath. A single sheet beats patchwork pieces, which curl at the seams and give crickets permanent housing. Mark water bowl and hide positions mentally, because flat contact under heavy objects is what stops the edges from lifting. If the enclosure has a molded floor texture, a slightly thicker liner will conform to it after a day of settling under the warm side's heat.",
        tips: [
          'Cut inside the measured line; a slightly small sheet beats a buckled one.',
          'Use one sheet per floor; seams curl and shelter escapee crickets.',
          'Weigh down lifting corners with a hide or bowl until the sheet relaxes.',
        ],
      },
      {
        id: 'rinse-replace-cadence',
        title: 'Running the Rinse and Replace Cadence',
        content:
          "The cadence is simple and worth protecting. Spot clean daily with the liner in place, lifting soiled spots with a paper towel rather than scrubbing the whole sheet. Weekly, swap the liner out for its clean twin and rinse the soiled one in hot water with a reptile-safe disinfectant, then dry it fully before storage; a damp liner folded into a bin grows exactly what you would guess. Deep clean monthly with everything out of the cage, which is also the right moment to inspect the floor seams and cord exits you usually ignore.",
        tips: [
          'Spot clean daily without pulling the sheet; full swaps are weekly events.',
          'Dry washed liners completely before storing them, every single time.',
          'Reserve the monthly empty-out for floor seams, cord gaps, and gauge checks.',
        ],
      },
      {
        id: 'retiring-liners',
        title: 'Retiring Liners Without Guilt',
        content:
          "A liner is a consumable, not an heirloom. Edges that curl after the third wash, fibers gone thin at the warm end, a smell that survives disinfectant: all of these are retirement signals, and stretching past them trades five minutes of savings for weeks of questionable floor. Keep the rotation honest by dating each sheet with a marker when it enters service. When you restock, judge any liner you're browsing on material thickness, washability claims, and cut-to-fit instructions rather than looks.",
        tips: [
          'Retire sheets at the first curl that survives a wash cycle.',
          'Date each liner when it enters service; rotations need receipts.',
          'Keep one spare cut and shelved at all times, ready to swap.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'When Liners Win',
        items: [
          { highlight: 'Hatchlings hunt safely', text: 'a flat floor removes the swallowed-particle risk with every strike.' },
          { highlight: 'Quarantine gets strict', text: 'a sheet you disinfect beats porous floors for new arrivals.' },
          { highlight: 'Waste sits visible', text: 'droppings and missed feeders can never hide under bedding.' },
        ],
      },
      {
        icon: 'clock',
        title: 'The Rotation',
        items: [
          { highlight: 'Spot clean daily', text: 'lift soiled spots without pulling the whole sheet.' },
          { highlight: 'Swap for the twin', text: 'a clean spare goes in while the soiled one soaks.' },
          { highlight: 'Dry before storage', text: 'a damp sheet folded into a bin grows problems.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Liner Safety Checks',
        items: [
          { highlight: 'No adhesive backing', text: 'glues and warm humid cages make a poor pairing.' },
          { highlight: 'Trim frayed edges', text: 'loose loops and fibers can wrap a small toe.' },
          { highlight: 'Retire without guilt', text: 'curling, thinning, or smelly sheets have finished their work.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Are reptile carpet liners actually safe?',
        answer:
          'Yes, with two honest caveats. The fibers must stay intact, because frayed loops can wrap a toe, so trim and retire worn sheets promptly. And carpet holds moisture against the floor if it stays damp, so full drying between washes matters. Kept trimmed, washed, and rotated, carpet liners serve well for years.',
      },
      {
        question: 'How often should I wash a reptile liner?',
        answer:
          'Spot clean daily with the sheet in place, and do the full pull, rinse, disinfect, and dry rotation weekly. A humid enclosure or a messy species can push that toward twice a week without complaint. The deeper monthly empty-out covers the cage itself, including seams and cord exits the liner usually hides.',
      },
      {
        question: 'Can I use hardware store shelf liner in a reptile cage?',
        answer:
          "Many keepers do, choosing the non-adhesive rubberized mesh style, washing it well before first use, and checking that it tolerates the warm side's temperatures. Avoid anything with glue backing or strong chemical odor, and skip products treated with antimicrobials. Purpose-made reptile liners simply come pre-vetted for exactly these questions.",
      },
      {
        question: 'Are liners better than loose substrate for hatchlings?',
        answer:
          'For most hatchlings, yes. A flat liner removes the impaction risk that comes with hunting on particulate floors and lets you spot tiny droppings and track growth cleanly. Once the animal hunts accurately and grows, plenty of keepers graduate to loose footing. Species that must burrow are the real exception to weigh.',
      },
      {
        question: 'Liners or paper towels for a quarantine cage?',
        answer:
          'Both work; the difference is reusability and cost over time. Paper towels are single-use and flawless for the strictest quarantine, since everything leaves the cage with the roll. Washable liners suit longer stays and animals strong enough to grip a surface. Some keepers run towels first, then liners, as trust builds.',
      },
    ],
  },

  // =========================================================================
  // REPTILE / SUPPLEMENTS: the dusting routine and its other half
  // =========================================================================
  'reptile/reptile-supplements': {
    heroTitle: 'Reptile Supplements and the Dusting Habit Done Right',
    heroSubheadline:
      'Powder on a feeder looks like a small habit, but it is the bridge between insects, lights, and bones. Here is how to dust, dose, and gut-load sensibly.',
    metaDescription:
      'Dusting feeders the honest way: calcium with or without D3 by your UVB setup, multivitamin cadence, gut-loading insects, and reading supplement labels calmly.',
    introSummary:
      "A cricket is a decent meal with a flaw: its body runs short on calcium and long on phosphorus, and a reptile eating only crickets inherits that imbalance. Dusting exists to correct it, a few seconds of powder that quietly decides whether the calcium you feed becomes bone. The routine itself is easy; the confusion lives in the details, which jar to use, how often, and what the insects themselves ate beforehand. Those details are the whole article, so let us take them in order.",
    sections: [
      {
        id: 'why-dusting-exists',
        title: 'Why the Dusting Jar Exists',
        content:
          "Insects are convenient prey with an inconvenient mineral profile: far more phosphorus than calcium, the reverse of what a growing reptile's skeleton demands. Left alone, an insect-only diet slowly tips the balance the wrong way, and the body manages the shortfall by drawing on its own bones. Dusting flips the arithmetic in seconds. Whole-prey feeders dodge most of the problem, since mice, rats, and chicks arrive nutritionally complete, which is why snake keepers rarely own a powder jar at all.",
        tips: [
          'Match the routine to the diet; insect eaters need it, whole-prey snakes rarely do.',
          'Keep growing animals and egg-laying females on the most consistent schedule of all.',
          'Remember the goal is balance, not abundance; powder is a correction, not a topping.',
        ],
      },
      {
        id: 'd3-decision',
        title: 'Calcium With D3 or Without It',
        content:
          "Vitamin D3 is the key that unlocks dietary calcium, and your lighting decides whether the animal already carries a key of its own. Under strong, well-managed UVB, skin makes D3 naturally, so plain calcium without D3 is the standard choice and the safer one to use liberally. Little or no UVB, whether by species or setup, shifts the job to the powder, and calcium with D3 covers the gap. Since the vitamin can be oversupplied, more is not better; the jar you reach for should follow the lighting you actually run.",
        callout: {
          type: 'pro-tip',
          title: 'Let UVB pick the jar',
          text: 'Write your lighting setup on a note and tape it inside the supplement cupboard. Strong UVB, plain calcium; weak or none, calcium with D3. The note settles the debate every shopping trip.',
        },
        tips: [
          'Pair plain calcium with strong, regularly replaced UVB bulbs in the fixture.',
          'Reserve D3 formulas for setups and species with little ultraviolet exposure.',
          'Split the difference only on advice from an exotics-savvy veterinarian, not guesswork.',
        ],
      },
      {
        id: 'dusting-routine',
        title: 'A Dusting Routine You Can Keep',
        content:
          "The best schedule is the one you will actually follow, so build it around feedings rather than the calendar. A workable pattern for many insect-eaters: plain calcium at most feedings, a multivitamin swap every week or two, and heavier dusting for juveniles and breeding females. Technique is a plastic bag or cup, a pinch of powder, gentle shaking until the insects look lightly frosted, and immediately offering them before they groom the coating off. Consistency beats precision; a routine you keep outranks a perfect one you abandon.",
        tips: [
          'Anchor the routine to feeding days so the habit survives busy months.',
          'Dust in a bag, shake gently, and offer feeders before they clean themselves.',
          'Dust more heavily for hatchlings and laying females; adults need less.',
        ],
      },
      {
        id: 'multivitamin-cadence',
        title: 'Multivitamins at a Gentle Cadence',
        content:
          "Multivitamins carry fat-soluble vitamins that the body stores rather than flushes, so the cadence stays light: swapping them in for the calcium dusting every week or two suits most insect-eaters, with label directions as the tiebreaker. If you notice a jar's directions pushing daily use of everything, read closely before doubling up on anything already covered by your calcium routine. Variety in the feeder rotation does quiet work here too, since different insects bring different micronutrients to the table. As you compare jars across listings, short ingredient lists with clear D3 labeling are the workhorse choices.",
        tips: [
          "Rotate multivitamin dusting in weekly or biweekly, following the label's own guidance.",
          'Watch for overlap; calcium-plus-vitamin formulas stack up faster than plain powders.',
          'Vary feeder species when you can; rotation is quiet nutrition insurance.',
        ],
      },
      {
        id: 'gut-loading',
        title: 'Gut-Loading as the Other Half',
        content:
          "Dusting sits on top of whatever the insect last ate, which means a cricket hauled straight from a bare container carries almost nothing worth delivering. Gut-loading fixes that: feed the insects a nutritious diet for a day or two before they become dinner, so their crops arrive full of the good stuff. Commercial gut-load formulas exist, and fresh vegetables and quality greens contribute too. The sequence is the part keepers miss; loaded insects should move from the loading tub to the reptile promptly, before they burn through what you just fed them. As you compare gut-load products, formulas that list actual ingredients beat mystery blends.",
        tips: [
          'Start the loading tub a day or two ahead of every feeding day.',
          'Offer moisture as well as food; a slice of vegetable covers both.',
          'Feed loaded insects promptly, before they use up the nutrients themselves.',
        ],
      },
      {
        id: 'powder-limits',
        title: 'When Powder Cannot Rescue the Setup',
        content:
          "Supplements are a supplement, not a foundation, and no jar fixes weak UVB, a flat gradient, or a feeder rotation of one species. Bone health is built by the triangle: lighting that works, temperatures that let digestion run, and insects that arrive already fed. If a reptile on a diligent routine still shows thin tails, soft jaws, tremors, or laying hens struggling, the answer is not more powder. Check with a veterinarian experienced with reptiles, and audit the lights and heat while you wait for the appointment.",
        callout: {
          type: 'vet-note',
          title: 'Powder is not medicine',
          text: 'A reptile that stops eating, trembles, or shows swelling despite good supplementation needs hands-on help. Have an exotics-savvy veterinarian examine the animal rather than adjusting doses at home.',
        },
        tips: [
          'Audit lighting and heat before reaching for heavier doses of anything.',
          'Rotate at least two staple feeder species when availability allows it.',
          'Bring your exact supplement routine to the appointment; details help diagnosis.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Pick the Right Jar',
        items: [
          { highlight: 'UVB sets the formula', text: 'strong lighting means plain calcium; weak means D3.' },
          { highlight: 'Plain calcium runs free', text: 'the safe daily workhorse for most insect-eating reptiles.' },
          { highlight: 'D3 gets metered', text: 'the vitamin accumulates, so heavier is never safer.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Rhythms That Stick',
        items: [
          { highlight: 'Anchor to feedings', text: 'calendar-perfect routines fail first; feeding-day habits survive busy months.' },
          { highlight: 'Multivitamins stay light', text: 'weekly or biweekly swaps suit most insect eaters.' },
          { highlight: 'Dust, then serve', text: 'insects groom powder off, so offer them promptly.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Feed the Feeders',
        items: [
          { highlight: 'Gut-load for a day', text: 'a loaded crop delivers nutrition dusting cannot replace.' },
          { highlight: 'Offer them promptly', text: 'insects burn through their load if they wait.' },
          { highlight: 'Rotate feeder species', text: 'variety quietly covers micronutrients no single jar handles alone.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Should I use calcium with or without vitamin D3?',
        answer:
          'Let your UVB decide. Strong, fresh UVB over the enclosure means the animal manufactures its own D3, so plain calcium is the standard and safer choice. Setups with little or no ultraviolet, or species that avoid light, lean on calcium with D3 to close the gap. When in doubt, ask an exotics-savvy veterinarian.',
      },
      {
        question: "How often should I dust my reptile's food?",
        answer:
          'A common pattern is plain calcium at most insect feedings, with a multivitamin swap weekly or so, while hatchlings and breeding females get heavier coverage. The exact rhythm varies by species and setup, so anchor it to feeding days you will remember. Consistency matters more than decimal-level precision ever will.',
      },
      {
        question: 'Can you give a reptile too much calcium or D3?',
        answer:
          'Yes, which is why generous dusting of plain calcium is common practice while D3 and multivitamins get metered. Fat-soluble vitamins accumulate, and heavy oversupplementation carries its own risks. Follow label directions, keep the multivitamin cadence light, and treat doubling up on combined formulas with real caution.',
      },
      {
        question: 'What does gut-loading feeder insects mean?',
        answer:
          'It means filling the insects themselves with good food for a day or two before they are offered, so their crops deliver real nutrition along with the dusting. A loaded cricket is a delivery vehicle; a starved one is filler. Formulas and fresh greens both work, and prompt feeding keeps the payload intact.',
      },
      {
        question: 'Do snakes eating mice need supplements?',
        answer:
          'Usually not. Whole prey, including organs and bone, arrives close to nutritionally complete for the snakes eating it, which is why the powder jar is a lizard-and-amphibian problem more than a snake one. Exceptions exist for breeding females or recovering animals, and those decisions belong with an exotics-savvy veterinarian.',
      },
    ],
  },

  // =========================================================================
  // REPTILE / TREATS: enrichment versus junk, and hand-feeding trust
  // =========================================================================
  'reptile/reptile-treats': {
    heroTitle: 'Reptile Treats That Count as Enrichment, Not Junk',
    heroSubheadline:
      'An occasional hornworm or a waxworm given on purpose is enrichment; a steady habit of fatty favorites is junk food with a pet-store receipt. The difference is routine.',
    metaDescription:
      'Honest reptile treat habits: which occasional feeders count as enrichment, which become junk, and how hand-feeding builds trust with skittish species.',
    introSummary:
      "Treat culture exists for reptiles too, and it goes wrong the same way it goes wrong for dogs and cats: what began as a rare, deliberate extra quietly becomes an expectation, then a demand, then a health problem with scales. Reptiles earn their treats differently, through hunting work and novel prey rather than biscuits, but the discipline transfers. A treat given on purpose is enrichment and trust-building; a treat given by reflex is junk with better marketing. Telling those two apart is the whole game.",
    sections: [
      {
        id: 'what-treats-mean',
        title: 'What a Treat Even Means Here',
        content:
          "For a reptile, a treat is not a between-meal snack, because most species eat whole meals days apart and their metabolisms do not run on snacking. A treat is an occasional feeder outside the staple rotation: a hornworm, a waxworm, a different roach species, offered rarely enough to stay special. Frequency is the entire definition, since the same insect fed weekly is variety and fed daily is a diet problem. Start from that rule and the rest of the aisle sorts itself out fast.",
        tips: [
          'Define treats by frequency first; the species of feeder comes second.',
          'Keep staple feeders and treat feeders in separate, clearly labeled containers.',
          'Offer treats after normal feeding so nutrition never depends on them.',
        ],
      },
      {
        id: 'occasional-feeders',
        title: 'Hornworms and the Occasional Feeders',
        content:
          "Hornworms are the showpiece of the treat feeder world: soft-bodied, bright, and so loaded with moisture that many keepers offer them partly as hydration. Their size grows fast on you, so buy small unless your animal handles big prey. Waxworms sit at the other extreme, fatty little grubs that reptiles adore and that earn their candy-bar reputation honestly; a few at a time, rarely. Butterworms and silkworms round out the tier, each bringing something the staple rotation lacks. The pattern is occasional on purpose, never the base of the diet. As you compare feeder listings, note sizing and counts before committing to a batch.",
        tips: [
          'Count hornworms as partly water; a hydration boost on a dry day.',
          'Cap waxworms at a few per sitting; the fat content earns the limit.',
          'Size hornworm purchases to the animal, since they grow remarkably fast.',
        ],
      },
      {
        id: 'what-counts-as-junk',
        title: 'What Honestly Counts as Junk',
        content:
          "Junk, for reptiles, is less about specific foods and more about ratios: a bearded dragon whose salads vanished under strawberry slices, a monitor living on rodents because insects stopped arriving, a gecko that learned to hold out for waxworms and eats nothing else. Treats become junk the moment they displace staples or train the animal to refuse meals. Processed nibbles marketed as snacks deserve the same squint you give any pet aisle, since an ingredient list built on fillers serves the seller more than the animal. As you compare treat products, simple and species-logical beats colorful every time.",
        callout: {
          type: 'warning',
          title: 'Hunger strikes are trained',
          text: 'Holdouts happen when an animal learns that refusing the salad brings hornworms tomorrow. The fix is patience: offer staples on schedule, keep the treats rare, and most animals return to eating within a stretch of days. If a fast runs long, check with a veterinarian experienced with reptiles.',
        },
        tips: [
          'Watch displacement; treats should supplement a diet, never replace any meal.',
          'Squint at processed snack products; filler lists serve shelves, not animals.',
          'Break a holdout cycle by keeping treats unpredictable rather than earned.',
        ],
      },
      {
        id: 'treats-as-enrichment',
        title: 'Enrichment Beyond the Feeder Dish',
        content:
          "For a predator, the richest part of a treat is often the pursuit, and you can serve that deliberately. A hornworm released into planted cover gives a monitor a search, a chase, a win; a cricket in a cardboard tube turns feeding into a puzzle. Scatter feeding, hiding feeders under a low piece of cork, or simply offering prey in a new part of the cage all wake up the same wiring. The treat is the object; the hunting is the enrichment. For animals fed from a dish their whole lives, the first live hunt can be a revelation.",
        tips: [
          'Hide feeders under cover so the meal starts with a real search.',
          'Rotate hunt styles weekly; novelty is the active ingredient here.',
          'Skip scatter feeding on loose substrate for impaction-prone animals; use a feeding area.',
        ],
      },
      {
        id: 'hand-feeding-trust',
        title: 'Hand-Feeding and Slow Trust',
        content:
          "Hand-feeding is where treats earn their keep with skittish animals, because it lets a shy gecko learn that your hand brings things rather than takes them. Begin with long feeding tongs and generous distance, shortening both over weeks as the animal relaxes. Fingers come last, and only for species whose food response is calm; a nail is not a fair price for a photo. Move slowly, approach from the side rather than overhead, and accept that some animals will always prefer the tongs, which is their right.",
        tips: [
          'Start with long tongs and patience; distance shrinks on the animal\'s schedule.',
          'Approach low and from the side; overhead reads as danger.',
          'Respect a permanent preference for tongs; not every species wants fingers.',
        ],
      },
      {
        id: 'refusals-and-weight',
        title: 'Reading Refusals and Reading Weight',
        content:
          "A refused treat is information, not insult. Seasonal appetite dips, approaching sheds, breeding season restlessness, and simple fullness all suppress enthusiasm, and none of them mean the hornworm was wrong. Weight is the other ledger: fat tails on geckos, heavy jowls on monitors, a rounder midsection on a lizard that used to race for food, all quietly noting that treats have drifted from occasional to constant. Adjust the routine before the body insists. And when refusal stretches into weeks or pairs with lethargy, check with a veterinarian experienced with reptiles rather than waiting it out.",
        tips: [
          'Weigh trends matter more than any single refused treat.',
          'Cut treat frequency the moment weight starts creeping.',
          'Log refusals with dates; patterns emerge that single misses hide.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'heart',
        title: 'Treats on Purpose',
        items: [
          { highlight: 'Frequency defines treats', text: 'the same feeder is variety weekly and junk daily.' },
          { highlight: 'Hornworms carry water', text: 'a soft, moisture-heavy bonus offered rarely on purpose.' },
          { highlight: 'Waxworms are candy', text: 'beloved, fatty, and capped at a few per sitting.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Enrichment First',
        items: [
          { highlight: 'Hunts beat handouts', text: 'a searched-for feeder works the mind and the body.' },
          { highlight: 'Rotate the methods', text: 'tubes, hides, and scatter feeding keep novelty alive.' },
          { highlight: 'Species logic wins', text: 'match the treat to the animal, not the packaging.' },
        ],
      },
      {
        icon: 'check',
        title: 'Trust, Slowly Earned',
        items: [
          { highlight: 'Tongs before fingers', text: "distance shrinks on the animal's schedule, never yours." },
          { highlight: 'Approach from the side', text: 'overhead hands read as hawks to a small hunter.' },
          { highlight: 'Refusals are information', text: 'seasons, sheds, and fullness all dim appetite innocently.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Can bearded dragons eat hornworms?',
        answer:
          'Yes, most bearded dragons relish them, and the high moisture content makes hornworms a useful hydration boost alongside their salads. Treat them as an occasional feeder rather than a staple, since hornworms are soft, rich, and easy to over-offer. Size matters too; these caterpillars grow fast, so match them to your animal.',
      },
      {
        question: 'How often can I treat my reptile?',
        answer:
          'Think in terms of weekly rarity rather than daily scraps. An occasional feeder once a week or less suits most healthy adults, with hatchlings and breeding females staying closer to their staples. The real test is displacement: if treats ever replace a proper meal or train a holdout, the frequency is too high.',
      },
      {
        question: 'Are waxworms bad for reptiles?',
        answer:
          'Not bad, just dangerously likable. They are fatty grubs that work as high-value rewards and appetite sparkers, and as near-constant food they skew diets badly. A few at a time, offered rarely, is the honest pattern. Think of them as dessert and you have the right relationship.',
      },
      {
        question: 'Is hand-feeding a good way to tame a reptile?',
        answer:
          'It is one of the better ones for food-motivated species, because the animal learns your hand as the source of good things. Start with long tongs, shrink the distance over weeks, and let fingers come last, if ever. Some species never want hand contact, and respecting that earns more trust than pushing.',
      },
      {
        question: 'Why did my reptile suddenly stop taking treats?',
        answer:
          'Usually timing, not taste. An approaching shed, breeding season restlessness, or a simple stretch of fullness all dim interest, and a cooler room can do the same quietly. Keep staples on schedule and treats rare. If refusal stretches past a couple of weeks or arrives with lethargy, have a reptile-savvy veterinarian take a look.',
      },
    ],
  },
};
