// Small animal family articles (part A) for Pawzsly U — the category root
// plus accessories, bedding, dishes, feeders, and the species food lanes
// (food map, ferret, hamster, hamster-and-gerbil). Nine original blog
// bodies written to the WRITING-SPEC.md contract: on-topic, blog voice, at
// least six sections of authentic prose, marketplace-friendly without hard
// selling.
import type { ArticleBody } from './types';

export const SMALL_ANIMAL_A_ARTICLES: Record<string, ArticleBody> = {
  // =========================================================================
  // SMALL ANIMAL (category root) — the small-animal difference: prey-species
  // trust building, habitat-first setup, species research before the cage
  // =========================================================================
  'small-animal': {
    heroTitle: 'Small Animals, Big Preparation: Start Before the Cage',
    heroSubheadline:
      'A rabbit, a hamster, and a ferret walk past the same checkout, and none of them needs what the others do. Learn the habits that make a small animal settle in.',
    metaDescription:
      'Small animals are not starter pets. Rabbits, hamsters, gerbils, and ferrets differ wildly, so build trust and set the habitat up before the animal arrives.',
    introSummary:
      'Every small animal on our shelves shares one trait dogs and cats do not: nearly all of them are prey species. That single fact reshapes everything, from how you say hello to where the habitat sits. A rabbit reads your shadow as a hawk. A hamster hears your joy as an earthquake. This article walks through the mindset shift, the setup that earns calm, and the species homework that saves you from buying the wrong everything. Get these right and the rest of small animal care falls into place.',
    sections: [
      {
        id: 'prey-animal-mindset',
        title: 'The Prey Animal Mindset',
        content:
          'Dogs and cats descend from hunters. Most small animals descend from the hunted, and it shows in every reflex. A rabbit thumps to warn the warren. A hamster freezes, then vanishes. A guinea pig wheeks from inside cover rather than beside it. None of this is rejection; it is ancient engineering. Meeting them where they are, rather than where a dog would be, is the first skill. Move slowly, speak low, and let the animal decide when contact happens. Trust built this way holds for years, while trust rushed in week one tends to stay broken.',
        tips: [
          'Move slowly and speak quietly; quick reaches read as strikes to prey animals.',
          'Let the animal initiate contact instead of forcing a first holding session.',
          'Watch for frozen postures and retreat; both signal you moved too fast.',
        ],
      },
      {
        id: 'trust-from-floor',
        title: 'Earning Trust From Floor Level',
        content:
          "Get down where they live. Sitting on the floor with a book and a loose handful of food does more for taming than any schedule of forced holds. Prey animals measure the world vertically: things above them are threats, things at their level are neutral, and things below are curious. Offer food from an open palm and let refusal be an acceptable answer, because a hamster that skips a treat today usually takes it next week. Consistency matters more than enthusiasm here. The same person, the same hour, the same quiet patience, and one day you notice the animal waiting for you.",
        callout: {
          type: 'pro-tip',
          title: 'Quiet hours win',
          text: 'Most small animals are busiest at dawn and dusk. Ten minutes of floor time in that window outperforms an hour of afternoon effort, when the animal only wants to sleep.',
        },
        tips: [
          'Schedule taming sessions at dawn or dusk when small animals are naturally alert.',
          'Keep a loose handful of food ready during floor time and let them forage.',
          'Accept skipped interactions today; patience compounds across weeks, not days.',
        ],
      },
      {
        id: 'habitat-before-animal',
        title: 'Habitat Ready Before the Animal Arrives',
        content:
          'The habitat should be finished, placed, and running before the animal ever crosses the doorstep. A half-set enclosure with a temporary wheel and a borrowed bottle teaches the animal that home is a place of change, exactly the opposite of what a prey species wants. Decide the room in advance too: quiet, away from speaker rumble, out of direct sun, and not beside the washer. Then hold everything still for the first week. New arrivals need stillness more than they need attention. Feed, water, spot clean, and otherwise let the settling happen on its own timeline. The gear and layout details live in their own articles; your job here is sequencing.',
        tips: [
          'Finish and place the full habitat before the animal arrives home.',
          'Choose a quiet room away from speakers, sunlight, and appliance vibration.',
          'Limit the first week to feeding, watering, and gentle spot cleaning.',
        ],
      },
      {
        id: 'species-before-cage',
        title: 'Research the Species Before the Cage',
        content:
          'People fall for a face in a photograph, then buy a cage, then learn what they adopted. Reverse that order and nearly every common mistake disappears. A Syrian hamster must live alone or fight, while gerbils wilt without same-species company. A ferret sleeps through most of the day and wants a playmate. A rabbit needs exercise space far beyond any enclosure. Learn those facts first, and the shelf of habitats, foods, and accessories sorts itself into obvious answers. The table below is the starting version of that homework.',
        tableData: {
          headers: ['Species', 'Social wiring', 'Space appetite', 'Peak hours'],
          rows: [
            ['Rabbit', 'Often bonds with a companion', 'Room to run outside the enclosure', 'Dawn and dusk'],
            ['Guinea pig', 'Herd animal, wants company', 'Long floor space over tall shelves', 'Daytime'],
            ['Syrian hamster', 'Strictly solitary', 'Deep bedding and a big wheel', 'Night'],
            ['Ferret', 'Playful in groups', 'Multi-level play and daily outings', 'Naps through the day'],
          ],
        },
        tips: [
          'Confirm adult size and social needs before choosing any enclosure.',
          'Match the habitat footprint to the species, not the shelf price.',
        ],
      },
      {
        id: 'lifespan-commitment',
        title: 'Lifespans Worth Planning Around',
        content:
          "Short-lived is a myth for half this aisle. Hamsters and gerbils run a couple of years, which makes them honest first pets. Guinea pigs commonly reach five to seven. Ferrets and rabbits both stretch toward a decade, longer than many dog breeds people bring home on impulse. The purchase you are considering is a multi-year supply relationship of bedding, food, and hay, plus a friend whose vet care belongs to someone comfortable with exotics. Plan for the adult animal, not the baby in the photo, and budget your attention the same way. The cute phase passes; the care obligation does not.",
        callout: {
          type: 'vet-note',
          title: 'Find the exotics vet first',
          text: 'Locate a veterinarian experienced with exotics before you need one, since not every clinic sees rabbits, ferrets, or rodents. An emergency is the wrong time to start phoning.',
        },
        tips: [
          'Ask local clinics which small species they actually treat before adopting.',
          'Plan supplies and care for the adult animal, not the juvenile stage.',
          'Remember rabbits and ferrets often live close to a decade.',
        ],
      },
      {
        id: 'whole-family-check',
        title: 'The Whole Family Readiness Check',
        content:
          "Small animals fail in households more often than they fail in habitats. Before the adoption, ask honestly who refreshes water every single day, who cleans on schedule when the novelty fades, and who notices a smaller dropping or a skipped meal, because those early signals are how tiny patients tell you something is wrong. Children need rules that protect the animal: sitting on the floor to hold, never chasing, never waking a sleeping hamster for a show-and-tell. Check the house itself too. Cables behind the rabbit's reach, houseplants that a curious nibble should never meet, and the noise level of the room the habitat calls home.",
        tips: [
          'Name the person responsible for daily water and food before adopting.',
          'Teach children floor-level holding and a strict no-chasing rule.',
          'Move cables and toxic houseplants out of every roaming route.',
        ],
      },
      {
        id: 'first-shopping-list',
        title: 'Your First Small Animal Checklist',
        content:
          'Once the species research is done, shopping becomes genuinely pleasant, because you finally know what you are comparing. The same marketplace listing reads differently when you know your gerbil needs depth and your neighbor\u2019s rabbit needs width. Read habitat dimensions against the adult animal, read food labels against the species, and read accessory materials against a set of healthy teeth. Reviews from keepers of your exact species are worth more than five-star averages from everyone else. A little homework up front turns an overwhelming aisle into a short, confident basket, and it saves you from the expensive habit of buying twice.',
        tips: [
          'Compare dimensions and labels against your species, not against other shoppers.',
          'Value reviews from keepers of your exact species over generic praise.',
          'Let the species research settle the basket before any checkout does.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'heart',
        title: 'Earn prey trust',
        items: [
          { highlight: 'Move like foliage', text: 'slow reaches, a low voice, and no looming from above.' },
          { highlight: 'Let them approach', text: 'trust an animal offers itself lasts far longer than trust taken.' },
          { highlight: 'Visit at dusk', text: 'most species are naturally alert and curious at dawn and dusk.' },
        ],
      },
      {
        icon: 'check',
        title: 'Sequence the setup',
        items: [
          { highlight: 'Habitat finished and placed', text: 'a new arrival should settle in, not cope with construction.' },
          { highlight: 'Stillness the first week', text: 'feed, water, spot clean, and otherwise leave the animal alone.' },
          { highlight: 'Room chosen with care', text: 'quiet, vibration-free, and out of harsh direct sunlight.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Research before cage',
        items: [
          { highlight: 'Syrian hamsters live alone', text: 'pairs fight, so plan one habitat per adult hamster.' },
          { highlight: 'Gerbils want company', text: 'same-species pairs prevent the loneliness of a solo gerbil.' },
          { highlight: 'Rabbits need running room', text: 'no enclosure replaces daily exercise space outside it.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Which small animal is easiest for beginners?',
        answer:
          'Honest answer: the one you researched. Hamsters and gerbils suit tight budgets and late schedules, guinea pigs reward gentle households with daytime company, and rabbits and ferrets demand more space and attention than most first-timers expect. Match the animal to your hours and room, and the beginner label stops mattering.',
      },
      {
        question: 'How do I help a new small animal trust me?',
        answer:
          'Start at floor level with slow movements and a low voice, offering food from an open palm and letting the animal come to you. Short sessions at dawn or dusk beat long afternoon efforts. Skip the grabbing entirely; trust a prey animal gives freely is the kind that survives handling.',
      },
      {
        question: 'How long do small animals usually live?',
        answer:
          'Hamsters and gerbils typically run about two to three years. Guinea pigs commonly live five to seven, and rabbits and ferrets often approach a decade with good care. Those longer lives deserve real planning: yearly exotics checkups, steady supply costs, and someone willing to keep the routine going.',
      },
      {
        question: 'Why does my new hamster hide all day?',
        answer:
          'Because hamsters are nocturnal and new arrivals prioritize safety over socializing. Give a full week of quiet feeding and watering with minimal intrusion, keep sessions to their active dusk hours, and resist digging into hideouts to say hello. A hamster that emerges on its own schedule is adjusting, not avoiding you.',
      },
      {
        question: 'Should I set everything up before bringing my pet home?',
        answer:
          'Yes, and that includes placement. A finished habitat in its final quiet location lets the animal start learning its territory from day one instead of surviving constant rearrangement. Have the water source tested for flow, the bedding laid at proper depth, and food of the same kind the animal already eats.',
      },
    ],
  },

  // =========================================================================
  // SMALL ANIMAL / ACCESSORIES — the play-and-habitat gear aisle: wheels,
  // hideouts, tunnels, chew-approved furnishings
  // =========================================================================
  'small-animal/small-animal-accessories': {
    heroTitle: 'Small Animal Accessories That Turn a Cage Into a Home',
    heroSubheadline:
      'Wheels, hideouts, tunnels, and chew-safe furnishings do the psychological work of a habitat. Match each piece to the species and the teeth, and the whole enclosure calms down.',
    metaDescription:
      'Exercise wheels, hideouts, tunnels, and chew-approved furnishings, matched by species and size. Here is how to pick small animal accessories that get used.',
    introSummary:
      'Strip a small animal enclosure down to bare walls and you will see the problem within a week: a wheel-less hamster climbs the corners, a hideout-less gerbil digs the glass, and a rabbit with nothing to do starts reorganizing the baseboards. Accessories are not decoration. They are the walls of a territory, the exercise equipment, and the job description of an animal built to forage, burrow, and chew. Choosing them well means matching a few honest pieces to the species in your care.',
    sections: [
      {
        id: 'why-gear-matters',
        title: 'Gear That Answers an Instinct',
        content:
          'Every accessory earns its floor space by answering a real instinct or it becomes clutter. A wheel answers the nightly mileage a hamster would cover in the wild. A hideout answers the prey animal\u2019s need to break line of sight, and a tunnel answers the pipeline logic of a creature evolved to move under cover. Watch what your animal does without gear, then shop for the behavior, not the photograph on the box. An enclosure full of unused plastic is the usual result of shopping the other way around.',
        tips: [
          'Shop for observed behaviors like climbing, digging, or corner-pacing, not packaging.',
          'Any accessory the animal ignores for weeks is floor space wasted.',
          'An unused accessory is a signal; watch behavior, then adjust.',
        ],
      },
      {
        id: 'solid-wheels',
        title: 'Exercise Wheels With Solid Floors',
        content:
          'The wheel is the most used accessory in most rodent homes, and the most commonly bought wrong. Runged and mesh wheels let feet slip through the gaps, and that is how broken toes and injured tails happen. A solid running drum costs a little more and carries none of that risk. Sizing matters just as much: the back stays level while running, with no arched spine and no head tipped upward. A Syrian hamster often needs a wheel around ten inches or larger, while dwarf species run smaller. As you compare listings, check the running surface, the axle noise, and the mount that keeps it stable.',
        callout: {
          type: 'warning',
          title: 'Rungs hurt real feet',
          text: 'Skip anything with rungs or wire mesh on the running surface. Solid drums protect feet and tails, and the price difference is smaller than one vet visit.',
        },
        tableData: {
          headers: ['Animal', 'Wheel habit', 'What to verify'],
          rows: [
            ['Syrian hamster', 'Runs nightly, far and fast', 'Solid drum sized for a level back'],
            ['Dwarf hamster', 'Runs nightly, smaller frame', 'Same level-back rule, smaller diameter'],
            ['Gerbil', 'Runs and chews the wheel', 'Sturdy stand plus chew-proof materials'],
            ['Rat', 'Mostly ignores wheels', 'Climbing ledges and foraging gear instead'],
          ],
        },
        tips: [
          'Press the running surface; your fingers should feel solid, not rungs.',
          'Test the axle noise before night one; squeaks wake light sleepers.',
        ],
      },
      {
        id: 'hideouts',
        title: 'Hideouts and the One-Per-Animal Rule',
        content:
          'A hideout is the accessory a prey animal leans on hardest, because being visible is the stressful part of its day. The working rule is one enclosed hideout per animal at minimum, ideally with a second entrance so nobody gets cornered. Two gerbils sharing a single hut take turns feeling exposed, and a cornered cage-mate with no exit can turn a small squabble serious. Material is an honesty question: untreated wood, woven hay, and plain cardboard all feed the chew instinct and wear out on schedule, which is fine. Plastic versions wipe clean easily but reward determined gnawing, and swallowed fragments help no one.',
        tips: [
          'Count one enclosed hideout per animal, then add a spare.',
          'Choose hideouts with two entrances so animals never trap each other.',
          'Replace chewed-through wooden hides on schedule instead of patching them.',
        ],
      },
      {
        id: 'tunnels',
        title: 'Tunnels and Chew-Safe Materials',
        content:
          'Tunnels do double duty as transportation and security, letting an animal cross open ground without ever being exposed. Cardboard tubes from finished paper rolls are the quiet champions of this aisle, free and endlessly replaceable, and small animals shred them into bedding with visible satisfaction. Woven hay and grass tunnels feed the same instinct while doubling as a snack. Untreated wood tunnels last longer and suit determined chewers like gerbils. Check the interior diameter against the species, remembering that a stuffed cheek pouch makes a hamster wider, and replace anything cracked with sharp edges or glue visible at the seams.',
        tips: [
          'Save finished paper rolls; they are free tunnel upgrades animals love.',
          'Size tunnel diameter for full cheek pouches, not just the head.',
          'Retire any tunnel with cracks, sharp edges, or exposed glue.',
        ],
      },
      {
        id: 'furnishings-chew-test',
        title: 'Furnishings That Pass the Chew Test',
        content:
          'Every furnishing in a small animal enclosure is also a chew project waiting to happen, so the material list matters more than the styling. Untreated wood, plain cardboard, woven grass, and hay are the materials you can trust a rodent or rabbit to ingest in small amounts. Painted wood, glued particleboard, and fabric with loose threads belong nowhere near teeth. Give the piece a knuckle test before it goes in: if you cannot identify the material or the finish, leave it. As you browse listings, the honest product descriptions name their materials outright, and the vague ones are answering the question for you.',
        callout: {
          type: 'pro-tip',
          title: 'The knuckle test',
          text: 'Press the surface with a knuckle before buying. Anything painted, glued, aromatic, or unidentifiable stays on the shelf; plain natural materials go home with you.',
        },
        tips: [
          'Trust plain cardboard, untreated wood, hay, and woven grass near teeth.',
          'Keep painted or glued items out of the enclosure entirely.',
          'Retire anything with loose threads or fraying edges immediately.',
        ],
      },
      {
        id: 'rotation',
        title: 'Rotating Gear Without the Overload',
        content:
          'Small territories overwhelm quickly, so a floor crowded with accessories can leave less running room than the animal requires. The better habit is rotation: keep a core of wheel, hideouts, and one tunnel in place, then swap the enrichment pieces every week or two. Rotation also refreshes scent maps in a way animals read as news rather than disaster, provided you keep the core familiar. Store retired pieces somewhere dry, inspect them for damage before each return, and wash only what the maker says can be washed. Comparing a couple of inexpensive swap-in pieces beats filling the floor with everything at once.',
        tips: [
          'Keep wheel and hideouts stationary; rotate the enrichment layer instead.',
          'Inspect stored accessories for cracks and chewing damage before reuse.',
          'Introduce one new piece at a time so changes never alarm.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'clock',
        title: 'Wheel wisdom',
        items: [
          { highlight: 'Solid drums only', text: 'rungs and mesh catch feet, tails, and toes mid-run.' },
          { highlight: 'Back stays level', text: 'an arched spine while running means the wheel is small.' },
          { highlight: 'Quiet axle matters', text: 'nighttime miles should not wake the whole household.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Safe to chew',
        items: [
          { highlight: 'Plain natural materials', text: 'untreated wood, cardboard, hay, and woven grass pass.' },
          { highlight: 'Nothing painted or glued', text: 'finishes and adhesives have no business near teeth.' },
          { highlight: 'Inspect the seams', text: 'cracks and exposed glue mean the piece retires.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Security first',
        items: [
          { highlight: 'One hideout each', text: 'every animal needs cover that is truly its own.' },
          { highlight: 'Two entrances beat one', text: 'no cage-mate ever gets cornered inside a shared shelter.' },
          { highlight: 'Tunnels are escape routes', text: 'open ground stops feeling exposed when cover connects it.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'What size wheel does a Syrian hamster need?',
        answer:
          'Big enough that his back runs level, which usually lands around ten inches or more for a full-grown Syrian. A wheel that is too small forces a bent spine and eventually puts him off running entirely. Watch for the head tipped upward; that arch is the classic sign of upgrading season.',
      },
      {
        question: 'Do gerbils and rats use exercise wheels?',
        answer:
          'Gerbils often run when the wheel is sturdy and quiet, though they chew on it as much as they exercise. Rats mostly ignore wheels in favor of climbing shelves, hammocks, and puzzle feeders, so spend the floor space on levels instead. Either way, the solid-surface rule applies to every species.',
      },
      {
        question: 'Are plastic hideouts safe for small animals?',
        answer:
          'Many keepers use them without incident, but the honest risk is chewing. Rodents gnaw edges relentlessly, and swallowed plastic fragments help nobody, especially determined chewers like gerbils. Untreated wood, woven hay, and cardboard satisfy the same instinct safely and cost less to replace, which is why they fill most experienced enclosures.',
      },
      {
        question: 'How many hideouts should a small animal cage have?',
        answer:
          'One enclosed hideout per animal is the floor, and a second for choice is better. Multiple entrances prevent cornering, which matters most in shared enclosures. If your gerbils or rats pile into one house together, that is companionship, not evidence you can remove the spares.',
      },
      {
        question: 'Can rabbits and guinea pigs use exercise wheels?',
        answer:
          'No, and they should never try. Wheels are built for rodents sized like hamsters and gerbils, and a rabbit\u2019s spine and weight make running on a drum a recipe for injury. Rabbits get their exercise from floor time and gear built for digging and tossing instead.',
      },
    ],
  },

  // =========================================================================
  // SMALL ANIMAL / BEDDING — substrate by species: paper vs aspen vs fleece,
  // the cedar/pine oil danger, burrow depth, the ammonia test
  // =========================================================================
  'small-animal/bedding': {
    heroTitle: 'Choosing Small Animal Bedding Your Pet Can Breathe In',
    heroSubheadline:
      'Substrate is the air your small animal breathes and the ground it digs. Get the material, the depth, and the change schedule right, and half of small animal husbandry is done.',
    metaDescription:
      'Paper, aspen, or fleece liners: match bedding to the species, avoid cedar and pine oils, dig deep for burrowers, and learn the ammonia test for change day.',
    introSummary:
      'Your small animal lives with its nose in the bedding, sleeps on it, and digs through it. That makes substrate a health decision disguised as a shopping decision. The wrong material dusts up lungs, and the wrong depth frustrates an animal built to tunnel, while the right choice disappears into the background of a calm, dry, sweet-smelling enclosure. Here is how paper, aspen, and fleece liners earn their places, which wood shavings to refuse, and how to know it is change day before anyone\u2019s nose tells you.',
    sections: [
      {
        id: 'nose-in-the-bedding',
        title: 'Bedding Is the Air They Breathe',
        content:
          'A small animal spends its whole life a few inches above, below, and inside its substrate, which is why respiratory trouble follows bad bedding choices so reliably. Dust irritates airways sized like soda straws, ammonia from urine concentrates at nose level, and moisture against skin invites trouble where an animal cannot tell you about it. When you compare substrates, you are really comparing air quality, absorbency, and the ground an animal was designed to dig. Price per bag matters far less than what that bag does between changes. The cheapest option is rarely the cheapest outcome.',
        tips: [
          'Judge bedding by dust, absorbency, and diggability before judging the price.',
          'Remember your pet breathes at substrate level, not human nose height.',
          'Change routines matter as much as the substrate you choose.',
        ],
      },
      {
        id: 'paper-bedding',
        title: 'Paper Bedding for Soft Ground',
        content:
          'Processed paper bedding is the default recommendation for a reason: it is soft on feet, low in dust, absorbent enough to pull urine away from the surface, and pliable enough to hold a tunnel shape for burrowers. It earns its keep at change day too, since soiled paper goes out with the compost or bin rather than through a wash. Texture varies between makers, and the small shredded pieces usually make better digging ground than flat sheets for animals that rearrange their world nightly. As you compare options, squeeze the bag; a denser compressed bale generally stretches further than a fluffy one that is half air.',
        tips: [
          'Squeeze packages before buying; dense compressed bales usually stretch further.',
          'Pick shredded paper textures over flat sheets for digging species.',
          'Spot-test new bedding in one corner before a full switch.',
        ],
      },
      {
        id: 'aspen-and-wood',
        title: 'Aspen Versus the Aromatic Woods',
        content:
          'Among wood shavings, aspen is the safe standard, a hardwood free of the aromatic oils that make other woods smell like a lumberyard. Cedar is the one to refuse outright: the oils that give it that sharp smell are linked to respiratory and liver problems in small animals kept on it. Plain pine carries the same oils in smaller amounts, and while kiln drying reduces them, many keepers simply choose aspen or paper and stop thinking about it. Wood shavings also vary in dust between batches, so pour a handful and watch what clouds up. That cloud is what your gerbil will be breathing all week.',
        callout: {
          type: 'warning',
          title: 'Cedar stays on the shelf',
          text: 'No deal makes cedar safe for small animals. The aromatic oils that smell pleasant to us are linked to breathing and liver trouble in rodents and rabbits; choose aspen, paper, or fleece instead.',
        },
        tips: [
          'Refuse cedar outright, and treat plain pine with suspicion unless processed.',
          'Pour a handful of any shavings and watch the dust before committing.',
          'Aspen is the wood to trust; paper and fleece cover everything else.',
        ],
      },
      {
        id: 'fleece-liners',
        title: 'Fleece Liners for the Litter-Trained',
        content:
          'Fleece liners suit rabbits and guinea pigs, animals that use litter boxes and would recycle loose substrate straight out the door anyway. A proper liner system wicks urine through the fleece into an absorbent pad underneath, which means the surface your pet sits on stays dry. That wicking only works on correctly prepared fleece, and it fails when hay, litter, or fur builds up on top, so daily sweeping is part of the deal. The payoff is washable, reusable flooring that costs more up front and less over the years. Hamsters and gerbils get no vote here: liners deny them the digging their bodies were built around.',
        tips: [
          'Sweep liners daily; hay and fur on top defeat the wicking.',
          'Wash fleece with unscented detergent and skip the fabric softener.',
          'Keep spare liners ready so swaps never wait on laundry day.',
        ],
      },
      {
        id: 'depth-for-burrowers',
        title: 'Depth for the Dedicated Burrowers',
        content:
          'Hamsters and gerbils are not resting on bedding so much as living inside it, building chambers, caching food, and sleeping under meters of imaginary desert. Give them enough depth to express that, which in practice means at least six inches of a holdable substrate, and more if the enclosure allows. A deeper tank-style setup also localizes the mess and gives digging energy a legal outlet, which saves the plastic corners some punishment. Packed, damp, or shallow substrate fails as a digging medium no matter the material. Fill generously, then watch the architecture appear, because a gerbil with real depth will build you something to look at.',
        callout: {
          type: 'pro-tip',
          title: 'Deeper than feels sensible',
          text: 'Six inches reads as extravagant until you watch a gerbil dig. Burrow species treat depth as floor space, so fill to the level the enclosure safely allows and consider a deeper base for the next setup.',
        },
        tips: [
          'Aim for six inches or more of packed substrate for burrowers.',
          'Build a digging box if the main enclosure cannot go deep.',
          'Pack substrate lightly so tunnels hold their shape overnight.',
        ],
      },
      {
        id: 'ammonia-test',
        title: 'The Ammonia Test for Change Day',
        content:
          'Every enclosure tells you when it needs changing; the trick is getting close enough to listen. Once or twice a week, put your nose where the animal lives, down at substrate level near the corner it favors for relief. A faint earthy smell is fine, but the sharp sting of ammonia means yesterday was the day, because urine breaks down into that gas wherever it sits too long. Spot clean the bathroom corner far more often than you deep clean the whole enclosure, since full cleans erase the scent map a prey animal depends on for security. Keep a handful of used bedding back and mix it into the fresh, and the animal settles instead of re-territorializing.',
        callout: {
          type: 'vet-note',
          title: 'Listen for the wrong sounds',
          text: 'Wheezing, sneezing, a wet nose, or breathing that clicks deserves a veterinarian experienced with exotics promptly, because small airways fail fast once irritated.',
        },
        tips: [
          'Smell at substrate level near the bathroom corner once or twice weekly.',
          'Spot clean wet corners often; save deep cleans for real need.',
          'Blend a little used bedding into fresh substrate after full changes.',
        ],
      },
      {
        id: 'matching-substrate',
        title: 'Matching Substrate to the Species',
        content:
          'The same bag does not serve every cage, and the honest differences come down to how each species treats its floor. Rabbits and guinea pigs mostly need absorbency under litter boxes and hay, hamsters and gerbils need depth they can excavate, and rats need a balance that handles odor without dusting their airways. The table matches the common substrate families to the animals that do best on them, with the honest failure mode of each. Use it as a starting grid, then adjust to what your individual animal does to its floor overnight.',
        tableData: {
          headers: ['Substrate', 'Best for', 'Honest failure mode'],
          rows: [
            ['Paper bedding', 'Burrowers and dust-sensitive species', 'Thin varieties flatten when soaked'],
            ['Aspen shavings', 'Gerbils and budget-friendly depth', 'Dust varies between batches'],
            ['Fleece liners', 'Litter-trained rabbits and guinea pigs', 'Needs daily sweeping to keep wicking'],
            ['Cedar or pine', 'Nothing on this aisle', 'Aromatic oils irritate airways and livers'],
          ],
        },
        tips: [
          'Start from the table, then adjust to your animal\u2019s actual habits.',
          'Mixing substrate types is fine; blending cedar in never is.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'shield',
        title: 'Breathe easy',
        items: [
          { highlight: 'Cedar never comes home', text: 'aromatic oils and small lungs are a bad pairing.' },
          { highlight: 'Dust gets noticed early', text: 'pour a handful and watch the cloud before buying.' },
          { highlight: 'Aspen is the wood', text: 'the safe pick among wood shavings for small animals.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Change-day signals',
        items: [
          { highlight: 'Ammonia sting at nose level', text: 'means you are at least a day late already.' },
          { highlight: 'Spot clean the corner', text: 'the bathroom zone needs attention far more often.' },
          { highlight: 'Keep some old bedding', text: 'familiar scent helps a prey animal resettle calmly.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Depth is habitat',
        items: [
          { highlight: 'Six inches minimum', text: 'hamsters and gerbils treat depth as living space.' },
          { highlight: 'Fleece needs sweeping', text: 'daily sweeping keeps liners wicking and floors dry.' },
          { highlight: 'Rabbits want litter boxes', text: 'absorbency under the bathroom corners beats substrate depth.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Is cedar bedding dangerous for small animals?',
        answer:
          'Yes, which is why longtime keepers refuse it entirely. The aromatic oils that make cedar smell pleasant are linked to respiratory irritation and liver changes in rodents and rabbits housed on it. Pine shares the same oils in smaller amounts. Aspen, paper bedding, and fleece liners cover every need cedar pretends to.',
      },
      {
        question: 'How deep should bedding be for gerbils and hamsters?',
        answer:
          'Deeper than most kits suggest. Six inches is the practical floor, and taller setups that allow more are worth it, because burrow species treat depth as living space rather than floor covering. Pack the substrate lightly so tunnels hold, and offer a mix that clumps enough to excavate without collapsing.',
      },
      {
        question: 'How often should I change small animal bedding?',
        answer:
          'Full changes usually land somewhere between weekly and monthly depending on species, enclosure size, and spot cleaning discipline, but your nose should make the final call at substrate level. Ammonia sting means you are late. Between full cleans, remove the wet bathroom corner far more often, and mix a little used bedding into fresh substrate to keep the scent familiar.',
      },
      {
        question: 'Can I use fleece liners for a hamster?',
        answer:
          'You can, but you are shortchanging the animal. Hamsters are burrowers that build chambers and tunnels, and flat fleece denies the whole behavior. Liners make more sense for litter-trained rabbits and guinea pigs. Give a hamster deep paper or aspen instead, and save the fleece budget for a digging box.',
      },
      {
        question: 'What bedding is best for a rabbit?',
        answer:
          'Rabbits do best with absorbent paper or aspen under a litter box strategy, since most litter-train readily and concentrate their output. Loose substrate everywhere matters less than a generous litter pan filled with paper-based litter and hay to nibble. Fleece liners over an absorbent layer also work well for tidy rabbits in indoor setups.',
      },
    ],
  },

  // =========================================================================
  // SMALL ANIMAL / DISHES AND WATERERS — heavy tip-proof dishes, bottle vs
  // bowl, the daily sipper ball check, placement away from the litter corner
  // =========================================================================
  'small-animal/dishes-and-waterers': {
    heroTitle: 'Dishes and Waterers Small Animals Cannot Tip Over',
    heroSubheadline:
      'A flipped bowl means a thirsty animal and soggy bedding by lunchtime. Heavy dishes, well-checked bottles, and smart placement keep food and water boring in the best way possible.',
    metaDescription:
      'Heavy tip-proof dishes, bottle or bowl decisions by species, the daily sipper ball check, and placement away from the litter corner. Boring water done right.',
    introSummary:
      'Water is the quiet crisis in small animal keeping. A dog empties a bowl in front of you; a hamster with a stuck sipper ball says nothing while its bottle stays full and its body runs dry. Dishes fail their own way, usually with bedding shoveled over a food bowl by morning. Between them sit the small decisions that keep a tiny body fed and hydrated: bowl weight, bottle placement, sipper checks, and the geography that keeps food away from the bathroom corner. None of it is complicated.',
    sections: [
      {
        id: 'tip-proof-dishes',
        title: 'A Dish That Refuses to Flip',
        content:
          'Rodents and rabbits treat lightweight dishes as tools: flipped for fun, buried by instinct, and dragged across the floor by morning. The fix is mass. A heavy ceramic bowl with a wide base and low center of gravity survives a gerbil\u2019s landscaping and a rabbit\u2019s chin toss without spilling. Plastic dishes with rubberized rings work for lighter keepers, though determined chewers will eventually texture the rim. Size the dish to the animal\u2019s face and the portion, since a cavernous bowl invites sitting in the food, which is adorable and unhygienic in equal measure. Glazed ceramic also wipes clean in seconds, which matters at the daily refill.',
        tips: [
          'Choose heavy ceramic dishes; pick each one up before buying.',
          'Match dish diameter to the portion, not to optimism about appetite.',
          'Wipe dishes at every refill; a quick rinse keeps flavors fresh.',
        ],
      },
      {
        id: 'bottle-or-bowl',
        title: 'Bottle or Bowl, Decided by Species',
        content:
          'Both water formats work, and each species tips the balance. Hamsters and gerbils usually meet bottles, because deep bedding buries any bowl by breakfast and a bowl of water in a dig zone becomes mud. Rabbits and guinea pigs drink comfortably from heavy bowls and seem to enjoy them, though a bottle works fine as a backup or a cage-mate alternative. Ferrets want bowls, preferably heavy ones, and often prefer water they can see and splash in. Rats take either happily, and many keepers offer both so a picky drinker always has a second option. Whatever you choose, make water available in one reliable spot.',
        callout: {
          type: 'pro-tip',
          title: 'Two sources, zero arguments',
          text: 'Offering a bottle and a bowl in different corners covers a stuck sipper, a picky drinker, and a flipped dish at once. The redundancy costs minutes per week and prevents the failures nobody notices.',
        },
        tips: [
          'Pair bottles with deep bedding, bowls with litter-trained species.',
          'Offer a backup source during hot weather or before any travel.',
          'Whatever the format, keep the water location consistent daily.',
        ],
      },
      {
        id: 'sipper-ball-check',
        title: 'The Daily Sipper Ball Check',
        content:
          'A water bottle fails silently, which makes the daily check a habit worth owning. Tap the sipper ball with a finger every morning and confirm water beads out freely, because a ball that sticks in place can leave a bottle looking full while nothing flows. Air locks form after refills, debris seals the tube, and some animals learn to rattle the ball without drinking effectively. Watch the water line drop across a normal day, and note anything suspicious in how the tube sits. If your bottle runs quiet for two days straight, assume the problem is flow, not thirst.',
        callout: {
          type: 'warning',
          title: 'Silent dehydration is real',
          text: 'A full bottle proves nothing about flow. Sipper balls stick, air locks form, and tubes clog quietly. Check with a finger tap daily, and if an animal seems dull or stops eating, contact a veterinarian experienced with exotics right away.',
        },
        tips: [
          'Tap the sipper ball each morning and watch water bead out.',
          'Track the water line; two unchanged days mean investigate immediately.',
          'Check water flow after every refill, since airlocks follow refills.',
        ],
      },
      {
        id: 'placement-away-from-litter',
        title: 'Placement Away From the Litter Corner',
        content:
          'Small animals pick a bathroom corner, and nearly all of them pick it far from where they eat, given the choice. Honor that geometry. Food and water placed too near the latrine corner get contaminated, and dishes placed directly under a bottle catch every drip into a soggy pile of pellets or seed. Keep the water station and the feeding spot on the opposite side from the litter zone, on stable ground where bedding stays shallow. Raise a rabbit or guinea pig bowl slightly if the floor floods during play, and check that hay cannot fall into the water, since wet hay ferments faster than you would think.',
        tips: [
          'Place food and water opposite the corner your pet toilets in.',
          'Keep dishes out from under bottle drips to avoid soggy food.',
          'Anchor stations on stable ground away from digging zones.',
        ],
      },
      {
        id: 'cleaning-cadence',
        title: 'Cleaning That Keeps Water Sweet',
        content:
          'Water that sits develops a slick film on the walls, the same biofilm you have felt on a dog bowl left too long, and small animals drink far less when the flavor turns. Rinse and refill bottles daily, and scrub the tube and cap weekly with a bottle brush, because the sipper mechanism traps the film first. Bowls get the same discipline with easier tools: a daily rinse and a weekly wash in hot water with mild soap, rinsed until no scent remains. Skip harsh detergents and anything scented, since a ferret\u2019s nose or a rabbit\u2019s nose will notice what you cannot.',
        tips: [
          'Refill bottles daily and brush the tube weekly to fight biofilm.',
          'Use mild unscented soap and rinse until nothing smells of it.',
          'Replace any bottle that grows slime despite weekly scrubbing.',
        ],
      },
      {
        id: 'comparing-stations',
        title: 'Comparing Stations on the Shelf',
        content:
          'Once the basics are second nature, the differences between products start earning their price. Some bottles mount outside the wire with a shield that stops chewing at the nozzle, some bowls stack ceramic weight into a rim designed for easy whisker access, and some dish designs bolt down for the determined flippers. Read the mounting hardware against your own enclosure first, since a perfect bottle for wire walls suits a glass tank poorly. Reviews written by keepers of your species mention the failures that matter, from slow drips to fragile spouts. A station that fits your cage and survives your chewer beats a prettier one that does neither.',
        tips: [
          'Match mounting hardware to your enclosure type before ordering anything.',
          'Read species-specific reviews for drip complaints and fragile spouts.',
          'One bottle plus one bowl covers most single-animal setups well.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Dish discipline',
        items: [
          { highlight: 'Weight beats cuteness', text: 'heavy ceramic survives flipping, burying, and chin tossing.' },
          { highlight: 'Size to the portion', text: 'an oversized bowl invites sitting in the food.' },
          { highlight: 'Watch the chewers', text: 'plastic rims get textured by determined rodent teeth.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Daily checks',
        items: [
          { highlight: 'Tap the sipper ball', text: 'confirm water beads out freely every single morning.' },
          { highlight: 'Watch the water line', text: 'two quiet days suggest a flow problem, not low thirst.' },
          { highlight: 'Rinse before refilling', text: 'a slick film on the walls turns flavors off.' },
        ],
      },
      {
        icon: 'map-pin',
        title: 'Smart placement',
        items: [
          { highlight: 'Opposite the litter corner', text: 'small animals prefer eating far from their bathroom.' },
          { highlight: 'Out from under drips', text: 'a dish beneath a bottle turns pellets into mush.' },
          { highlight: 'One reliable station', text: 'water lives in a spot your pet can bank on.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Is a water bottle or bowl better for a hamster?',
        answer:
          'For hamsters, bottles usually win, because deep bedding buries a bowl within a night of digging and turns standing water into mud. Mount the bottle over a shallow zone, tap the ball daily to confirm flow, and offer a backup bowl during hot weather if you want extra insurance.',
      },
      {
        question: 'How do I know if my water bottle is working?',
        answer:
          'Tap the sipper ball with a finger and watch for water beading out freely, then track the water line across a normal day. A bottle that stays full for two days is suspicious, since stuck balls and air locks keep the level static. A few animals rattle the ball for fun, so also watch for actual drinking.',
      },
      {
        question: 'Why does my guinea pig flip her food bowl?',
        answer:
          'Usually because the bowl is light enough to move, and guinea pigs nudge and chin-toss things that annoy them. A heavy ceramic dish with a wide base ends the game, or a bowl that bolts to the enclosure wall for real athletes. Some pigs also flip bowls announcing dinner is late, which is a personality feature, not a fault.',
      },
      {
        question: 'Where should food and water go in the cage?',
        answer:
          'Away from the corner your animal uses as a bathroom, and away from deep bedding that buries dishes by morning. Most small pets already eat far from their latrine when given the room, so follow their geography. Keep bowls out from under bottle nozzles too, unless you enjoy soggy pellets.',
      },
      {
        question: 'How often should I wash small animal water bottles?',
        answer:
          'Rinse and refill daily, and scrub the full assembly weekly with a bottle brush, paying attention to the sipper mechanism where biofilm builds first. Hot water and mild unscented soap do the job; harsh detergents leave residues animals taste better than we do. A bottle that stays slimy despite washing is overdue for replacement.',
      },
    ],
  },

  // =========================================================================
  // SMALL ANIMAL / FEEDERS AND WATERERS — gravity feeders and hay racks:
  // hay off the floor, managed pellets vs free-feed, the wet-food station
  // =========================================================================
  'small-animal/feeders-and-waterers': {
    heroTitle: 'Feeders and Waterers That Keep Hay Off the Floor',
    heroSubheadline:
      'Racks, gravity dispensers, and feeding stations turn meals into furniture with a job: clean hay at standing height, measured pellets, and a tidy wet-food spot for the meat eaters.',
    metaDescription:
      'Hay racks, gravity feeders, and feeding stations for rabbits, guinea pigs, and ferrets. Keep grass hay off the floor, ration the pellets, and stage wet food.',
    introSummary:
      'The way food arrives shapes how it gets eaten. A rabbit pulling hay from a rack at shoulder height grazes the way its spine was designed to, while the same hay scattered on the floor becomes bedding, litter, and a soaking mess within the hour. Gravity feeders and racks are the furniture that solves this, holding the ration at a sensible height. This article covers hay stations for the grazers, pellet dispensers for the over-eaters, and the wet-food corner that a ferret\u2019s dinner actually requires.',
    sections: [
      {
        id: 'furniture-with-a-job',
        title: 'Feeders as Furniture With a Job',
        content:
          'A feeder earns its place by solving a real problem, and the problems differ by species. Rabbits and guinea pigs need their grass hay presented clean, dry, and off the floor, because soiled hay stops being food the moment it touches substrate. Hamsters need nothing more elaborate than a heavy dish and a foraging habit. Ferrets need a station that handles a meat-heavy menu without spoiling overnight. Buy the feeder for the problem, not the photograph, and the enclosure stays tidier for free. Most of what fails in this aisle was purchased for looks instead of function.',
        tips: [
          'Name the feeding problem first, then shop the format that solves it.',
          'Keep clean hay and used substrate physically separated by design.',
          'Match the feeder\u2019s height to how your species actually eats.',
        ],
      },
      {
        id: 'hay-racks',
        title: 'Hay Racks That Do Not Frustrate',
        content:
          'A hay rack works when an animal can pull strands out easily and fails when hay is packed so tight that grazing becomes a wrestling match. Load it loose, refill it often, and position it roughly at head height for a standing rabbit or guinea pig, which keeps the neck and spine comfortable through hours of nibbling. The gaps should admit a muzzle without admitting the whole head, because head-sized openings catch curious animals. Skip anything with a solid floor that traps moisture, and mount the rack over the litter box if your rabbit already grazes there, since the arrangement matches how rabbits naturally restroom-and-munch.',
        tips: [
          'Load hay loosely so strands pull out without a struggle.',
          'Hang racks at standing head height to keep necks level.',
          'Consider the litter box location; rabbits graze where they restroom.',
        ],
      },
      {
        id: 'gravity-feeders',
        title: 'Gravity Feeders and Pellet Discipline',
        content:
          'A gravity feeder keeps a dish full around the clock, which is exactly its gift and exactly its trap. Hamsters and gerbils self-regulate reasonably well, stashing the surplus for later, and a hopper suits their midnight browsing. Rabbits and guinea pigs do not: offered unlimited pellets, many will eat the concentrated food first and graze less hay, which flips the diet in the wrong direction. If you keep grazers, measure pellets as a small daily ration and let the hay rack carry the rest. Reserve gravity feeders for species that handle them, or for the honestly scarce days when nobody is home to ration.',
        callout: {
          type: 'warning',
          title: 'Unlimited pellets backfire',
          text: 'For rabbits and guinea pigs, free-fed pellets quietly crowd out the hay that should carry the diet. Measure the pellet ration and keep the rack full instead; the species diet article covers the proportions.',
        },
        tips: [
          'Measure pellets for grazers; save hoppers for true self-regulators.',
          'Watch hoards under gravity-fed dishes and clear anything spoiling.',
          'As you compare hoppers, prefer ones that open fully for cleaning.',
        ],
      },
      {
        id: 'wet-food-station',
        title: 'The Wet Food Station for Ferrets',
        content:
          'Ferrets are the aisle\u2019s meat eaters, and some keepers offer wet food alongside the kibble bowl for variety, appetite, or aging teeth. Wet food changes the station\u2019s rules: a heavy ceramic dish that cannot be pushed around, a mat underneath to catch the enthusiastic splash, and a removal schedule measured in hours, since meat spoils fast at room temperature. Wash between servings with hot water and mild soap rather than topping up over the old layer. Keep the station away from heat sources and direct sun, and offer kibble alongside, because most ferret diets anchor on dry food that keeps. Comparing mats and dishes for this station, favor materials that survive daily washing, since that schedule is the job.',
        tips: [
          'Serve wet food in a heavy dish on a washable mat.',
          'Remove uneaten wet food within hours; meat spoils at room temperature.',
          'Keep the wet-food spot out of sunlight and away from warm appliances.',
        ],
      },
      {
        id: 'multiple-stations',
        title: 'Sizing Stations to the Crew',
        content:
          'Group enclosures need enough stations that nobody stands between a shy animal and its dinner. The practical rule for guinea pig herds and rat groups is more feeding points than animals, spread so a dominant individual cannot guard them all at once. Same for water: a pair should have two reliable sources, and a herd needs corners covered. Height matters for mixed setups, since ground-level dishes suit short legs while raised racks suit adults who graze standing. Count the mouths, count the access points, and add one. It is cheaper than the feeding-drama alternative, and calmer for everyone living together.',
        tips: [
          'Provide more feeding points than animals in any group enclosure.',
          'Spread stations so one bossy animal cannot guard them all.',
          'Count mouths, count stations, then add one more access point.',
        ],
      },
      {
        id: 'keeping-it-clean',
        title: 'Racks, Dust, and Weekly Washing',
        content:
          'Hay stations shed, gravity hoppers crumb, and every feeding point slowly builds a layer the enclosure does not need. Build a weekly habit of washing racks and dishes in hot water with mild soap, checking crevices where pellets soften into paste, and shaking out the rack\u2019s tray if it has one. Hay dust falls and collects under racks, so sweep that zone daily rather than letting it mix with moisture. A dedicated scoop for pellets keeps hands and food separate, and any bin that stores bulk hay should seal against moisture and pantry pests. The feeding corner should be the cleanest corner in the enclosure, not the opposite.',
        callout: {
          type: 'pro-tip',
          title: 'The dedicated scoop',
          text: 'A scoop that lives in the bin and touches nothing else speeds every refill and keeps stored food cleaner than fingers ever will.',
        },
        tips: [
          'Wash racks and dishes weekly; check crevices for softened pellet paste.',
          'Sweep fallen hay dust daily before it mixes with any moisture.',
          'Store bulk hay sealed against moisture and pantry pests.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Hay stays clean',
        items: [
          { highlight: 'Loose, not packed', text: 'strands should pull from the rack without a fight.' },
          { highlight: 'Standing head height', text: 'hours of grazing stay comfortable for neck and spine.' },
          { highlight: 'Over the litter box', text: 'rabbits graze where they restroom, so work with it.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Ration the pellets',
        items: [
          { highlight: 'Hoppers suit hoarders', text: 'hamsters and gerbils manage a gravity feeder fine.' },
          { highlight: 'Grazers get measured', text: 'unlimited pellets crowd out the hay that matters.' },
          { highlight: 'One more station', text: 'group enclosures need more feeding points than mouths.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Wet food rules',
        items: [
          { highlight: 'Heavy dish on mat', text: 'ferret dinner stations should not slide or splash far.' },
          { highlight: 'Hours, not days', text: 'meat spoils fast at room temperature, so clear it.' },
          { highlight: 'Kibble stays available', text: 'dry food anchors most ferret diets between wet servings.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Do rabbits really need a hay rack?',
        answer:
          'They need clean hay always available, and a rack is the simplest way to keep it off the floor and out of the substrate. Some rabbits prefer a large basket or a cardboard box stuffed daily. Whatever the holder, position it at standing head height and keep it stocked, since hay is meant to be most of the diet.',
      },
      {
        question: 'Are gravity feeders good for guinea pigs?',
        answer:
          'Usually not, because guinea pigs tend to overeat concentrated pellets when they are always available, and that quietly crowds out the hay carrying their diet. Measure pellets as a daily ration and put the effort into the hay rack instead. A gravity feeder makes more sense for hamsters, gerbils, or a rat colony that regulates itself better.',
      },
      {
        question: 'How long can wet ferret food sit out?',
        answer:
          'Think hours, not days. Meat-based wet food spoils quickly at room temperature, so remove whatever is left within a few hours and wash the dish before the next serving. Most ferret routines anchor on kibble kept available around the clock, with wet food as a supervised course rather than the standing buffet.',
      },
      {
        question: 'How many feeding stations does a group need?',
        answer:
          'More than the number of animals. Two guinea pigs should find at least three feeding points, and rat groups appreciate the same cushion, because a confident animal can guard one station but not three. Spread them across the enclosure and keep water similarly redundant so nobody waits on a bossy cage-mate\u2019s schedule.',
      },
      {
        question: "Can I put my rabbit's hay rack over the litter box?",
        answer:
          'It sounds odd and works beautifully, because rabbits naturally graze while they restroom. A rack mounted safely above the litter pan keeps hay clean, captures the mess, and matches the animal\u2019s own habits. Just make sure the pan is deep enough that hay stays dry and the rack is firmly attached.',
      },
    ],
  },

  // =========================================================================
  // SMALL ANIMAL / FOOD — the species diet map: hay-first grazers, seed-plus-
  // pellet mixes, rat blocks, the ferret exception, and why one bag fails all
  // =========================================================================
  'small-animal/small-animal-food': {
    heroTitle: 'Small Animal Food: One Aisle, Very Different Diets',
    heroSubheadline:
      'A rabbit, a hamster, a rat, and a ferret share one shelf and four unrelated digestions. Learn the map before you shop, because the wrong bag looks exactly like the right one.',
    metaDescription:
      'Hay-first rabbits, seed-sorting hamsters, block-fed rats, and meat-eating ferrets: the small animal food map that stops one bag feeding everyone wrong.',
    introSummary:
      'The small animal food aisle is really four aisles wearing one sign. A rabbit\u2019s gut is a hay-processing machine that can founder on rich pellets, a hamster\u2019s is a seed-sorting pantry, a rat does best on uniform blocks, and a ferret cannot digest a plant-first diet at all. Hand any of them the wrong bag and the trouble arrives quietly, through weight, teeth, or energy. This map walks the aisle species by species, so the bag you carry home matches the animal waiting in the enclosure.',
    sections: [
      {
        id: 'four-digestions',
        title: 'One Aisle, Four Kinds of Digestion',
        content:
          "Herbivore, granivore, omnivore, carnivore: the small animal shelf hosts all of them, and their digestive equipment differs more than a dog's differs from a cat's. A rabbit processes fiber through a gut that needs constant grazing to keep moving. A hamster hoards and sorts a pantry of seeds and grains. A rat digests nearly anything and thrives on consistency. A ferret runs a short, fast, meat-only system with no use for fillers. The bags sit side by side in the shop, but the biology behind them never met. Shopping this aisle by price or packaging instead of species is how most diet trouble starts.",
        tips: [
          'Shop by species first; the shared shelf is a merchandising fiction.',
          'Keep a dedicated bag per species if you keep mixed animals.',
          'One bag per species prevents most quiet cross-feeding mistakes.',
        ],
      },
      {
        id: 'hay-first-grazers',
        title: 'Hay First for the Grazing Herbivores',
        content:
          'For rabbits and guinea pigs, grass hay is not a side dish; it is the diet, with pellets playing a supporting role and fresh vegetables a garnish. Unlimited hay keeps those guts moving and those continuously growing teeth worn to a healthy length. The crucial split between the two species is vitamin C: guinea pigs, unlike rabbits, cannot manufacture their own, so their food and daily vegetables need to supply it. That single difference makes rabbit food a poor long-term stand-in for a guinea pig. When you compare labels in this lane, the hay section of the ingredients and the vitamin line tell the real story.',
        callout: {
          type: 'warning',
          title: 'Rabbit food starves a guinea pig slowly',
          text: 'A guinea pig fed rabbit pellets long-term misses the vitamin C it cannot make itself. Choose bags labeled for guinea pigs, and if appetite drops or gums look sore, see a veterinarian experienced with exotics.',
        },
        tips: [
          'Offer unlimited grass hay; it carries the diet and wears teeth down.',
          'Check guinea pig labels for added vitamin C that rabbits do not need.',
          'Keep hay stocked constantly; grazers eat through the day and night.',
        ],
      },
      {
        id: 'seed-and-block',
        title: 'Seeds, Blocks, and the Sorting Problem',
        content:
          'Hamster and gerbil foods come as loose mixes, uniform blocks, or blends of the two, and the format changes the nutrition more than the marketing admits. A hamster eating from a mix sorts it, feasting on fatty sunflower seeds and peanuts while leaving the boring pellets behind, which skews the diet toward fat. Blocks deliver the same nutrition in every bite, which is why experienced keepers build rations around them and use the colorful mixes as a smaller topping for interest. The deeper strategy for sorting behavior lives in the hamster feeding article; on this map, the point is simpler: mixes are entertainment, blocks are the meal.',
        tips: [
          'Treat loose mixes as a topping rather than the base ration.',
          'Watch the sunflower and peanut load; sorting skews toward fat.',
          'Use measured tablespoons for toppings so enrichment stays a garnish.',
        ],
      },
      {
        id: 'rat-blocks',
        title: 'Block-Based Diets for Rats',
        content:
          'Rats are omnivores that will eat almost anything, which is exactly why their diets work best when the anything is limited. A uniform block formulated as a complete ration keeps every bite nutritionally balanced, and fresh additions from the safe-foods list add variety and enrichment on top of it rather than replacing it. Rats kept on cafeteria diets pick their favorites and drift, the same sorting story as the hamster aisle wearing different whiskers. Blocks also help you notice appetite changes fast, since a rat that leaves uniform food behind is announcing something worth watching. The block is the floor; the fresh stuff is the decoration.',
        tips: [
          'Anchor rat menus on a uniform complete block for balance.',
          'Notice skipped blocks quickly; appetite changes are early signals.',
          'Weigh rats weekly; uniform blocks make trends easy to spot.',
        ],
      },
      {
        id: 'carnivore-corner',
        title: 'The Meat-Only Corner for Ferrets',
        content:
          'Ferrets sit on this aisle as the exception that proves the map, because an obligate carnivore has no business on hay, seeds, or blocks. Their food is built from named meats and animal fats, in a kibble format that keeps well and suits their small, frequent meals, or in moist formulations that need stricter handling. The ingredient list should read like a butcher\u2019s inventory rather than a bakery\u2019s, and fillers exist mostly to hold the shape. Kit, adult, and senior stages shift the richness of the recipe, so the bag you graduate to matters as much as the first one. The full ferret feeding article takes that journey in detail.',
        tips: [
          'Look for named meats leading the ferret food ingredient list.',
          'Match the life-stage bag; kits and adults need different richness.',
          'Introduce any new ferret recipe gradually over a week or more.',
        ],
      },
      {
        id: 'reading-the-species-line',
        title: 'Reading the Species Line on Every Bag',
        content:
          'Every honest bag on this aisle states its species on the front, and that line is doing more work than it appears to. Substituting across species is the quiet diet disaster of small animal keeping: guinea pigs drift into vitamin C trouble on rabbit food, hamsters get too rich a mix from a gerbil blend tuned differently, and nothing plant-based sustains a ferret for long. The table below is the map in one glance. Use it as you compare options, use it when a well-meaning friend offers leftover food, and use it before you consolidate two nearly empty bags into one shortcut.',
        tableData: {
          headers: ['Species', 'Diet center', 'Common cross-feeding mistake'],
          rows: [
            ['Rabbit', 'Unlimited grass hay plus measured pellets', 'Feeding seed mixes made for rodents'],
            ['Guinea pig', 'Hay plus pellets with vitamin C', 'Long runs of rabbit food without the vitamin'],
            ['Hamster or gerbil', 'Complete blocks with seed topping', 'Letting sorted sunflower seeds become the meal'],
            ['Rat', 'Complete block base with fresh additions', 'Cafeteria diets that drift with favorites'],
            ['Ferret', 'Meat-first kibble for obligate carnivores', 'Any grain-heavy or plant-first food'],
          ],
        },
        tips: [
          'Match the species line on the bag to the animal, every time.',
          'Refuse well-meant hand-me-down food meant for a different species.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'The diet map',
        items: [
          { highlight: 'Rabbits and guinea pigs', text: 'hay carries the diet; pellets stay a measured role.' },
          { highlight: 'Hamsters and gerbils', text: 'complete blocks first, with seed mixes as topping.' },
          { highlight: 'Rats want blocks', text: 'uniform complete rations beat cafeteria picking for balance.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Cross-feeding traps',
        items: [
          { highlight: 'Guinea pigs need vitamin C', text: 'rabbit food cannot stand in over any long stretch.' },
          { highlight: 'Ferrets need meat', text: 'plant-first recipes sustain no obligate carnivore at all.' },
          { highlight: 'Sorting skews toward fat', text: 'the leftover sunflower seeds are dessert, never dinner.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Read like a keeper',
        items: [
          { highlight: 'Front of bag, species line', text: 'the honest label names its animal before anything else.' },
          { highlight: 'Ingredients over marketing', text: 'named hay or named meat beats vague filler words.' },
          { highlight: 'Life stage matters', text: 'kits, adults, and seniors need different richness levels.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Can guinea pigs eat rabbit food?',
        answer:
          'Not as a long-term plan. Both species eat hay-first diets, but guinea pigs cannot make their own vitamin C, while rabbits can, so rabbit pellets leave them slowly short. A few days in a pinch is survivable; a steady ration should come from guinea pig food plus daily vegetables that carry the vitamin.',
      },
      {
        question: 'Can hamsters and gerbils share one food?',
        answer:
          'Often yes, since both eat a block-and-seed style diet, and many bags are labeled for the pair. The honest caveats live in the details: fat tolerance differs slightly between them, and dwarf hamsters need extra care around sugary or rich bits. Watch each animal\u2019s condition and adjust toppings accordingly.',
      },
      {
        question: 'Do rats need lab blocks or can they eat table scraps?',
        answer:
          'Blocks, with scraps as a small garnish. A uniform complete block keeps a rat\u2019s baseline balanced no matter what else happens, while cafeteria-style feeding drifts as the rat picks favorites. Fresh safe foods add enrichment on top of the block ration, but the block stays the anchor of the diet.',
      },
      {
        question: 'What happens if a ferret eats hamster food?',
        answer:
          'Nothing good, and the damage is quiet. Ferrets are obligate carnivores that cannot thrive on plant-heavy recipes, so a rodent food based on grains and seeds fails them nutritionally even while filling the bowl. Keep ferret-specific or comparable meat-first food on hand, and ask an exotics-savvy veterinarian before making any swap.',
      },
      {
        question: 'Is a seed mix enough on its own for hamsters?',
        answer:
          'Rarely, because hamsters sort. They eat the fatty seeds first and leave the balanced pellets, so the diet drifts toward fat within weeks. Build the ration around complete blocks and use the mix as a measured topping for interest and foraging. The hamster feeding article covers the portions in detail.',
      },
    ],
  },

  // =========================================================================
  // SMALL ANIMAL / FOOD FERRET — the obligate carnivore exception: meat-first
  // kibble, treat discipline, kit-to-adult transitions
  // =========================================================================
  'small-animal/food-ferret': {
    heroTitle: 'Ferret Food Rules: Feeding a True Carnivore Right',
    heroSubheadline:
      'Your ferret is a hunter in a sweatsuit: a short gut built for meat and nothing else. Feed the animal that exists, and the food aisle finally makes sense.',
    metaDescription:
      'Ferret food needs to be meat-first and rich in animal fat. Here is how to read labels, handle treats strictly, and graduate kits onto adult food smoothly.',
    introSummary:
      'A ferret is the only animal on the small pet shelf whose ancestors ate nothing but prey, and the body still shows it. The gut is short and fast, the teeth are built for shearing, and there is no long fermentation for plants to wait through. That makes ferret feeding refreshingly simple and strangely strict: meat-first food, small frequent meals, and very little room for creative substitution. Get the label right, keep treats honest, and change life stages slowly, and the carnivore in your care stays glossy and busy.',
    sections: [
      {
        id: 'obligate-carnivore',
        title: 'The Obligate Carnivore in Your Home',
        content:
          'Obligate carnivore is biology\u2019s way of saying the animal has no vegetarian setting. A ferret\u2019s digestive tract is short and quick, built to extract dense nutrition from animal protein and fat and to pass everything else more or less untouched. Plant proteins and grain fillers travel through that system poorly used, which is why the ingredient list matters more than any claim on the front of the bag. Their wild relatives eat whole prey, and while your carpet shark gets kibble, the recipe\u2019s job is the same: deliver meat nutrition in a shelf-stable format. The rest of ferret feeding follows from that single fact.',
        tips: [
          'Judge every ferret food by its meat content, not its marketing.',
          'Remember plant fillers pass through a ferret largely unused.',
          'Think prey nutrition: dense, meaty, and served in small portions.',
        ],
      },
      {
        id: 'reading-labels',
        title: 'Reading a Meat-First Label Honestly',
        content:
          'Turn the bag over and read the first several ingredients, because that is where a ferret food declares itself. You want named meats and meat meals leading the list, chicken or turkey or lamb, with animal fats close behind and as little grain and sweetener as the formulation allows. Protein and fat numbers belong high on this diet, and fiber belongs low, which is the opposite of nearly every other bag on the small pet shelf. Vague words like poultry by-products tell you less than you need to know. Comparing listings side by side, the ranking of those first ingredients separates the serious foods from the decorative ones faster than any slogan.',
        callout: {
          type: 'pro-tip',
          title: 'Read the first five aloud',
          text: "The top of the ingredient list sets a food's character. If meats do not dominate those first entries, the bag is decorative rather than carnivore-appropriate, no matter what the front panel says.",
        },
        tips: [
          'Look for named meats leading the list, with animal fats following.',
          'Expect high protein and fat, low fiber, on a ferret-appropriate bag.',
          'Skip bags where grains or sweeteners crowd the first ingredients.',
        ],
      },
      {
        id: 'kibble-vs-wet',
        title: 'Kibble and Wet Food Trade-Offs',
        content:
          'Most ferret households anchor on kibble, and the reasons are practical: it keeps safely at room temperature, suits the small frequent meals a fast metabolism demands, and the crunchy texture gives the teeth something to work on. Wet food brings stronger aroma and easier eating for seniors or picky kits, but it spoils within hours and turns every serving into a small dishwashing event. Many keepers run kibble as the standing base and offer wet food as a scheduled course. Whatever the mix, keep water adjacent and plentiful, because a dry-meat diet puts real demands on the water bowl.',
        tips: [
          'Anchor on kibble for safety and around-the-clock availability.',
          'Offer wet food as scheduled courses, cleared within a few hours.',
          'Wash wet-food dishes between servings, never top over the old.',
        ],
      },
      {
        id: 'treat-discipline',
        title: 'Treat Discipline for a Small Engine',
        content:
          'A ferret weighs a fraction of a cat, which makes every treat a measurable event in the daily diet. The strict approach: meat-based treats in tiny portions, offered as training currency or bribes for nail trims, and counted against the day rather than added on top of it. Sugary treats have no role here at all; a ferret\u2019s system has no use for them, and questions about diet-linked conditions belong with an exotics-savvy veterinarian. Reward the good behavior, keep the pieces small, and watch the waistline as treats creep upward. The treat shelf rewards discipline more than generosity.',
        tips: [
          'Count treats against the daily ration instead of adding on top.',
          'Choose meat-based treats and keep portions genuinely tiny.',
          'Keep sugary options out of the ferret pantry entirely.',
        ],
      },
      {
        id: 'kit-to-adult',
        title: 'Kit to Adult Without the Stomach Drama',
        content:
          'Kits grow fast and eat richer food to fuel it, so the kit bag runs higher in protein and fat than the adult formula waiting in its future. Around the transition window, mix rather than swap: serve increasing proportions of the adult food across a week or two, watching stool quality and appetite as you go. Ferrets imprint on food textures and flavors surprisingly hard, which is why variety early in life pays off later when a recipe change or a prescription diet becomes necessary. Change flavors gradually even between adult foods. A sudden swap that clears the bowl often unsettles the gut that has to process it.',
        callout: {
          type: 'vet-note',
          title: 'Loose stool during transitions',
          text: 'A day of soft stool during a food change can be normal, but persistent diarrhea, refusal to eat, or dullness needs a veterinarian experienced with exotics promptly. Ferrets are small; they have limited reserves.',
        },
        tips: [
          'Blend kit and adult food across a week or two of gradual change.',
          'Offer flavor variety young so adults accept changes more easily.',
          'Watch stool quality daily during any food transition period.',
        ],
      },
      {
        id: 'feeding-rhythm',
        title: 'Meals, Stashes, and the Hunting Day',
        content:
          'A ferret\u2019s day is a series of naps punctuated by bursts of activity, and the feeding rhythm follows. Most keepers leave kibble available around the clock and refresh it twice daily, because a fast little metabolism grazes rather than banquets. Water belongs beside the food, heavy enough not to tip, since dry diets demand steady drinking. Expect stashing: ferrets cache bites in favorite corners the way their ancestors cached surplus, so a missing pile of kibble under the couch is business as usual rather than loss. Rotate those finds during cleaning if the food stays dry. Comparing bowl and bottle setups matters less than reliability, since a hydrated ferret is a playful one.',
        tips: [
          'Leave dry food out all day and top it up morning and night.',
          'Expect food stashes in corners; rotate dry finds during cleaning.',
          'Secure the food station; ferrets relocate anything light enough.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Label literacy',
        items: [
          { highlight: 'Named meats lead', text: 'chicken, turkey, or lamb should own the top spots.' },
          { highlight: 'Fat belongs high', text: 'a carnivore diet runs on animal fat, not fillers.' },
          { highlight: 'Vague words lose', text: 'unnamed by-products tell you nothing worth feeding on.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Transition slowly',
        items: [
          { highlight: 'Mix across weeks', text: 'blend kit and adult foods gradually, watching stools and appetite.' },
          { highlight: 'Variety pays later', text: 'young palates that flex accept adult changes more easily.' },
          { highlight: 'Loose stool gets watched', text: 'brief softness is normal; persistence needs an exotics-savvy veterinarian.' },
        ],
      },
      {
        icon: 'clock',
        title: 'The daily rhythm',
        items: [
          { highlight: 'Kibble around the clock', text: 'small frequent meals suit a fast, small metabolism.' },
          { highlight: 'Water stays adjacent', text: 'dry meat diets put real demands on the bowl.' },
          { highlight: 'Stashes are normal', text: 'cached kibble under furniture is instinct, not loss.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Can ferrets eat cat food?',
        answer:
          "A high-quality, meat-first cat food can serve in a pinch, and some keepers use premium cat kibble long-term, but ferret-specific formulas aim squarely at a ferret's protein and fat needs. Whatever the bag, apply the same test: named meats first, generous fat, minimal plant filler. Kitten food is often closer than adult cat food.",
      },
      {
        question: 'How often should ferrets eat?',
        answer:
          'Think grazing, not mealtimes. Most ferret households keep kibble available around the clock, refreshed at least twice daily, because ferrets sleep in short bursts and eat in small ones. Wet food, where you offer it, works as a scheduled course cleared within hours. Watch the water bowl too, since dry food raises the drinking demand.',
      },
      {
        question: 'How do I switch my ferret from kit to adult food?',
        answer:
          'Gradually, over a week or two of blending. Start with a minority of adult food in the kit bowl and shift the proportions as stools and appetite stay steady. Ferrets imprint hard on familiar flavors, so patience beats abrupt change. If soft stool persists beyond the transition, bring in a veterinarian experienced with exotics.',
      },
      {
        question: 'Are fruits and sugary treats okay for ferrets?',
        answer:
          "No, and this one is not a judgment call. Ferrets are obligate carnivores with no biological use for sugar, and sweets also stick to teeth that cannot brush. Keep treats meat-based and tiny, counted against the day's food, and bring diet questions to an exotics-savvy veterinarian early.",
      },
      {
        question: 'Why does my ferret hide food everywhere?',
        answer:
          'Because caching is ancestral behavior. Wild mustelids banked surplus kills, and your living room inherits the instinct, kibble and all. Dry stashes in favorite corners are harmless and can be rotated during cleaning, though wet food hiding should be discouraged since it spoils. Consider it a compliment: you provide enough that saving feels sensible.',
      },
    ],
  },

  // =========================================================================
  // SMALL ANIMAL / FOOD HAMSTER — hamster nutrition: seed-mix waste, lab-
  // block base plus seed topping, thumbnail-sized fresh treats
  // =========================================================================
  'small-animal/food-hamster': {
    heroTitle: 'Hamster Food That Beats the Pickiest Seed Sorter',
    heroSubheadline:
      'Your hamster is a professional food sorter with cheeks built for smuggling. Feed the strategy, not the instinct: a block base, a measured seed topping, and thumbnail-sized fresh bites.',
    metaDescription:
      'Hamsters sort seed mixes and eat the fatty favorites first. Build the ration on complete blocks, top with measured seeds, and keep treats thumbnail-sized.',
    introSummary:
      'Watch a hamster eat a seed mix and you will witness agriculture. The sunflower seeds vanish first, the peanuts follow, and the balanced pellets sit untouched until hunger or boredom wins. That sorting instinct served wild hamsters beautifully and quietly unbalances captive diets toward fat. The fix is not fighting the animal but re-arranging the menu: a complete block as the base, the seed mix as a measured topping for enrichment, and fresh foods in portions smaller than your thumbnail. The sorting becomes a game instead of a problem.',
    sections: [
      {
        id: 'sorting-instinct',
        title: 'The Sorting Instinct Wins Every Time',
        content:
          'A hamster approaches a mixed bowl like a warehouse picker: favorites out first, everything else stockpiled or ignored. Sunflower seeds and peanuts carry the most fat and the most appeal, so a freely fed mix drifts rich within days, while the uniform pellets carrying the balanced nutrition wait at the bottom. No amount of brand switching fixes this, because every colorful mix is sorted by the same brilliant animal. Once you accept that the hamster, not the bag, decides the actual diet, the strategy writes itself: make every bite balanced, and let the fun parts ride on top.',
        tips: [
          'Accept the sorting behavior and design the ration around it.',
          'Remember the favorites carry the fat; the leftovers carry the balance.',
          'Track body condition monthly; sorting shows up as roundness.',
        ],
      },
      {
        id: 'blocks-as-base',
        title: 'Complete Blocks as the Honest Base',
        content:
          'A uniform block delivers identical nutrition in every bite, which is the only food format a professional sorter cannot defeat. Build the daily ration around blocks first, then measure the seed mix on top as a smaller course for interest and foraging. The transition can be gradual for a hamster raised on mixes, mixing blocks in increasing proportion over a week or two. Expect suspicion at first, because blocks lack the aroma theater of a fatty seed, and hunger moves a healthy hamster to them within a day or two. A block-fed hamster still gets the mix, just as seasoning rather than the main course.',
        callout: {
          type: 'pro-tip',
          title: 'Blocks first, mix second',
          text: 'Serve the blocks as the standing ration and sprinkle the seed mix on top as the day\u2019s bonus. The hamster still sorts, but now the game is layered over complete nutrition instead of replacing it.',
        },
        tips: [
          'Transition seed-raised hamsters to blocks gradually over a week or two.',
          'Trust a healthy appetite; suspicion of blocks fades within days.',
          'Mix new blocks into old food slowly to win over suspicion.',
        ],
      },
      {
        id: 'seed-topping',
        title: 'The Seed Topping as Portion Control',
        content:
          'The seed mix keeps its job, demoted from the meal to the garnish. A measured pinch scattered through the bedding or offered from your hand preserves the joy of sorting while capping the fat load, and scatter-feeding the topping doubles as exercise for a species built to forage miles at night. Watch the sunflower and peanut content of whatever blend you keep, since those two carry most of the calorie trouble. Comparing mixes on the shelf, favor blends heavy in varied grains and light in the fatty showpieces. The topping earns its place through enrichment, and enrichment works best in small doses.',
        tips: [
          'Scatter the seed topping through bedding to combine food with exercise.',
          'Prefer mixes heavy in varied grains, light in sunflower and peanut.',
          'Keep topping portions measured; a pinch means a pinch.',
        ],
      },
      {
        id: 'fresh-treats',
        title: 'Fresh Treats in Thumbnail Portions',
        content:
          'Fresh vegetables and the occasional fruit bring moisture and variety, but a hamster\u2019s portion scale is smaller than instinct suggests. Think thumbnail: a piece the size of your own thumbnail, a few times weekly, is a full fresh serving for a Syrian and less for a dwarf. Hamsters cache food with enthusiasm, and a cached cucumber becomes a science experiment within a day, so remove fresh leftovers the same evening. Introduce any new fresh food slowly, one at a time, and skip the sugary fruits entirely for dwarf hamsters, whose systems handle sugar poorly. Wash everything, and cut pieces into gripping sizes those tiny hands can manage.',
        callout: {
          type: 'warning',
          title: 'Cached fresh food rots fast',
          text: 'A piece of cucumber hidden behind the wheel turns slimy within a day and can upset a small gut. Do a stash patrol whenever fresh food has been served, and remove anything moist on sight.',
        },
        tips: [
          'Serve fresh pieces the size of your thumbnail, a few times weekly.',
          'Remove uneaten fresh food the same evening to protect the hoard.',
          'Introduce new vegetables one at a time over several days.',
        ],
      },
      {
        id: 'hoard-patrol',
        title: 'Hoard Patrol During Cage Cleans',
        content:
          'Every hamster keeps a pantry, usually behind the wheel or under the hideout, and it tells you the real eating story. A hoard of blocks means the ration lands right; a hoard of rotting fresh food means the portions need trimming. During full cleans, leave a recognizable part of the hoard in place, because erasing the pantry stresses a hamster more than almost anything else you could do to its home. Remove only the spoiled material, and consider the hoard\u2019s size when judging appetite at the bowl. A hamster that eats everything at once may simply be restocking the shelves.',
        tips: [
          'Leave most of the hoard standing during deep cleans to reduce stress.',
          "Read the hoard's contents as a diary of the actual diet.",
          'Judge appetite by the hoard as much as by the bowl.',
        ],
      },
      {
        id: 'bag-shopping',
        title: 'Reading Bags Without Falling for Color',
        content:
          'The most decorated bag on the shelf is rarely the best ration, because color in a hamster mix is set decoration for humans. What you are actually shopping for is the boring half: a serious complete block, ideally the majority of what you serve, plus a varied topping. As you compare products, look past the rainbow toward the base, since the blocks carry the nutrition and the colors carry the price. Reviews from hamster keepers mention sorting waste honestly, and the bags worth repeat buying tend to be the ones keepers buy for the block content rather than the window dressing.',
        tips: [
          'Shop for the block base first and judge decorations second.',
          'Read hamster-keeper reviews for honest notes on sorting waste.',
          'Ignore the rainbow; the block content is the actual product.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Ration architecture',
        items: [
          { highlight: 'Blocks are the base', text: 'every bite balanced, immune to the cleverest sorting.' },
          { highlight: 'Seeds are seasoning', text: 'a measured pinch brings foraging joy, not a meal.' },
          { highlight: 'Fatty bits get counted', text: 'sunflower seeds and peanuts carry most calorie trouble.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Fresh food rules',
        items: [
          { highlight: 'A thumbnail of vegetables', text: 'a few times each week is a full Syrian serving.' },
          { highlight: 'Clear fresh food by evening', text: 'moist leftovers spoil wherever a hamster caches them.' },
          { highlight: 'Dwarfs skip sugary fruit', text: 'their small systems handle sugar poorly, so stay plain.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Respect the hoard',
        items: [
          { highlight: 'Pantry stays standing', text: 'erasing a hoard during cleaning stresses the animal badly.' },
          { highlight: 'Read hoard contents', text: 'it is the honest diary of the real diet.' },
          { highlight: 'Restocking looks like eating', text: 'a full cheek run means pantry work, not hunger.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Why does my hamster only eat the seeds and leave the pellets?',
        answer:
          'Because hamsters are professional sorters, and the fatty seeds taste best while carrying the worst nutrition ratio. Left alone on a mix, a hamster drifts toward a high-fat diet within weeks. Build the ration on complete blocks and offer the mix as a measured sprinkle, so the sorting becomes enrichment rather than the whole diet.',
      },
      {
        question: 'Are lab blocks too boring for hamsters?',
        answer:
          'The bowl might look dull, and the animal experiences none of the dullness once you scatter and top it. Blocks bring uniform nutrition, and interest comes from delivery: hide them, bury them, and sprinkle the seed mix through the bedding. Boredom is a presentation problem, and presentation is free to fix.',
      },
      {
        question: 'How big should fresh treats be for a hamster?',
        answer:
          'Thumbnail-sized for a Syrian, smaller for a dwarf, a few times weekly at most. Hamsters cache fresh food enthusiastically, and a hidden piece of cucumber turns slimy within a day, so remove leftovers the same evening. Wash everything first, introduce new foods one at a time, and skip sugary fruit for dwarfs.',
      },
      {
        question: "Should I throw away my hamster's food hoard when cleaning?",
        answer:
          'No, and the stress math says otherwise. A hamster\u2019s hoard is its pantry and its sense of security, and wiping it out during a clean reads as disaster to the animal. Remove anything moist or spoiling, leave the dry stock standing, and save full hoard resets for genuine hygiene emergencies only.',
      },
      {
        question: 'Can hamsters eat vegetables every day?',
        answer:
          'They can handle small daily pieces of suitable vegetables, though many keepers prefer a few times weekly to keep the menu tidy. Keep each serving thumbnail-sized for a Syrian, introduce one new food at a time, and always clear the leftovers by evening. Daily greens matter more for guinea pigs than for hamsters.',
      },
    ],
  },

  // =========================================================================
  // SMALL ANIMAL / FOOD HAMSTER AND GERBIL — the shared-aisle honesty: what
  // the two species genuinely share vs where they differ
  // =========================================================================
  'small-animal/food-hamster-and-gerbil': {
    heroTitle: 'Hamster and Gerbil Food: What Honestly Can Be Shared',
    heroSubheadline:
      'Half the shelf says hamster and gerbil on the same bag. Here is the honest split: what those two species genuinely share, where they quietly differ, and how to shop for both.',
    metaDescription:
      'Hamster and gerbil food overlaps, but not fully. Learn what both species can share, where fat tolerance and scatter-feeding differ, and how to shop for both.',
    introSummary:
      'The hamster and gerbil aisle is a merged shelf with a split reality. Both animals eat seeds, blocks, and the occasional safe fresh food, and plenty of households run one bag for both without visible trouble. Look closer, though, and the differences are real: the species lean on different fat levels in practice, they use scatter-feeding differently, and a rich blend tuned for one can slowly round out the other. This article separates the genuine overlap from the quiet divergence.',
    sections: [
      {
        id: 'merged-shelf',
        title: 'Why the Shelf Merges Two Species',
        content:
          'Retail shelves merge hamsters and gerbils because their menus overlap enough to share a bag, and because two labels sell less than one. Biologically, both are seed-eating rodents that hoard, forage, and thrive on a block-plus-topping structure, so the merge is not dishonest at the surface. It fails quietly at the edges, where fat content, sugar tolerance, and lifestyle differences start to matter. A Syrian hamster, a dwarf hamster, and a gerbil can all eat from the same block base, but the toppings, portions, and delivery styles deserve their own thinking. That is the line this article draws.',
        tips: [
          'Treat the merged label as a starting point, not a guarantee.',
          'Expect the honest differences to live in toppings and portions.',
          "Read any shared bag's fat sources before trusting the label.",
        ],
      },
      {
        id: 'genuine-overlap',
        title: 'What Both Species Genuinely Share',
        content:
          'Start with the overlap, because it is wider than the arguments suggest. Both species do well on a complete block as the nutritional anchor of the ration, with a measured seed mix riding on top for interest. Both hoard enthusiastically, both appreciate varied grains over fatty showpieces, and both enjoy the same safe fresh foods in small portions, from cucumber ends to plain broccoli. Hay and grass nibbles work as bedding enrichment for both, more snack than staple. If you run one block bag and one topping blend for a mixed small-rodent household, you are not cutting a dangerous corner. You are simplifying the shared layer, and the differences arrive on top of it.',
        tips: [
          'Anchor both species on the same complete block ration.',
          'Share safe fresh foods, always in small, brief portions.',
          'Share the hay rack too; nibbles suit both species as extras.',
        ],
      },
      {
        id: 'fat-tolerance',
        title: 'Where Fat Tolerance Parts Ways',
        content:
          'The quiet divergence starts with richness. A blend tuned generously for a robust Syrian can run richer than a dwarf hamster or a lean gerbil does well on over months, and the visible result is usually a rounder animal moving less. Sunflower seeds and peanuts are the usual culprits, because every species finds them delicious and only some metabolize them casually. Dwarf hamsters add a sugar dimension, since their systems handle sugary bits poorly and the sweeter mixes deserve real caution. The practical move is simple: keep the shared base lean, and hand-tune the fatty and sugary topping per animal rather than per shelf.',
        callout: {
          type: 'warning',
          title: 'Roundness is a diet signal',
          text: 'A gently rounded hamster or gerbil is usually carrying a topping problem, not a block problem. Trim the fatty seeds first, and if weight stays stubborn or anything feels off, check with a veterinarian experienced with exotics.',
        },
        tips: [
          'Keep the shared base lean and adjust toppings animal by animal.',
          'Hand out sunflower seeds and peanuts as treats, not staples.',
          "Watch each animal's silhouette monthly for early drift signals.",
        ],
      },
      {
        id: 'scatter-feeding',
        title: 'Scatter-Feeding Styles That Differ',
        content:
          'Both species forage, and yet the practice serves them differently. Hamsters are solo commuters on night routes, and scattering their ration through the bedding gives a lone animal a working night shift of searching and hauling. Gerbils are a digging crew with a shared territory, and scatter-feeding their food becomes a group project that also buries itself, which suits animals that naturally larder underground. The shared rule is that scattered food must stay dry and findable, so skip scattering anything fresh. Portion discipline matters more when food disappears into the substrate, since a buried surplus reads as hunger to a worried keeper.',
        tips: [
          'Scatter dry rations through bedding; never scatter fresh foods.',
          'Measure the ration before scattering it through deep bedding.',
          'Count what you scatter; substrate hides consumption from you.',
        ],
      },
      {
        id: 'foraging-toys',
        title: 'Foraging Toys That Feed Both',
        content:
          'The enrichment aisle earns its place for both species when it delivers food, because a foraging toy turns ration into work and work into a night well spent. Cardboard tubes with sealed paper ends, treat balls that roll a few seeds loose, and simple digging boxes filled with substrate and buried blocks all serve hamsters and gerbils equally. The species divergence is scale and style: a gerbil pair will remodel a cardboard project together, while a hamster prefers solo puzzles with one entrance and no queue. Watch that the difficulty level stays solvable, because a toy that never pays out gets abandoned, and food left inside a forgotten puzzle is just a hoard with extra steps.',
        tips: [
          'Start with simple puzzles and raise difficulty as skill grows.',
          'Check abandoned toys for food hiding inside them.',
          'Empty uneaten puzzle food during weekly spot checks.',
        ],
      },
      {
        id: 'two-bin-shopping',
        title: 'Shopping for Two Without Shorting Either',
        content:
          'The cleanest answer to a mixed household is two toppings and one base. A single complete block bag serves hamster and gerbil cages alike, while separate topping blends let you keep the gerbil mix leaner and the hamster mix richer or plainer as each animal\u2019s condition asks. When you compare products for this arrangement, read the fat-bearing contents first, since that is where the shared shelf diverges, and listings that name those contents plainly are doing you a favor. Check that block formulations match species labels. The table below condenses the split. Keep both bins labeled, portion with one scoop each, and the merged aisle stops being a compromise and becomes a convenience.',
        tableData: {
          headers: ['Feeding topic', 'Safe to share', 'Where they differ'],
          rows: [
            ['Complete blocks', 'Same bag as the ration base', 'Portion sizes shift with body size'],
            ['Seed toppings', 'Same ingredients, measured separately', 'Fat and sugar tolerances run differently'],
            ['Fresh foods', 'The same safe-vegetable shortlist', 'Portions skew smaller for gerbils'],
            ['Scatter feeding', 'Dry rations through the bedding', 'Gerbils bury deeper and cache communally'],
            ['Foraging toys', 'Puzzles and digging boxes both work', 'Gerbils solve them as a crew'],
          ],
        },
        tips: [
          'Buy one block base and two tuned toppings for mixed households.',
          'Label the bins and keep a dedicated scoop inside each.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'The shared layer',
        items: [
          { highlight: 'One block bag', text: 'a complete block base serves both species without compromise.' },
          { highlight: 'Same safe fresh foods', text: 'thumbnail portions with same-evening cleanup rules apply to both.' },
          { highlight: 'Grains over showpieces', text: 'both species do better on varied grains than fatty seeds.' },
        ],
      },
      {
        icon: 'shield',
        title: 'The honest splits',
        items: [
          { highlight: 'Tolerance differs by species', text: 'a rich topping can quietly round out a leaner gerbil.' },
          { highlight: 'Dwarfs fear sugar', text: 'sweeter blends deserve real caution around dwarf hamsters.' },
          { highlight: 'Tune toppings individually', text: 'hand out sunflower seeds per animal, not per shelf.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Feed the instinct',
        items: [
          { highlight: 'Scatter the dry ration', text: 'searching through bedding is the whole point of dinner.' },
          { highlight: 'Puzzles pay in food', text: 'foraging toys must stay solvable or get abandoned.' },
          { highlight: 'Burying is normal', text: 'gerbils larder underground, so buried food is not hunger.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Can gerbils eat hamster food?',
        answer:
          'Mostly yes, and plenty of keepers run one bag for both. The base blocks are interchangeable, and the same safe fresh foods apply. The honest caution is richness: a blend tuned generously for hamsters can run richer than a gerbil does well on over months, so watch body condition and keep the fatty toppings lean for the gerbil side.',
      },
      {
        question: 'What is the main food difference between hamsters and gerbils?',
        answer:
          'Richness tolerance more than ingredients. Both eat blocks and seed toppings, but a generous hamster blend can slowly fatten a leaner gerbil, and dwarf hamsters add a sugar caution the gerbil side rarely shares. Keep the shared base plain and adjust the fatty, sugary topping animal by animal rather than shelf-wide.',
      },
      {
        question: 'Should I scatter-feed both hamsters and gerbils?',
        answer:
          'Yes, with dry food only. Scattering turns dinner into the foraging shift both species are built for, and gerbils add a communal digging dimension that hamsters do not share. Never scatter fresh food, since buried moisture spoils, and count the portion before it vanishes, because a buried surplus looks like hunger to a worried keeper.',
      },
      {
        question: 'Do foraging toys work for gerbils and hamsters equally?',
        answer:
          'They work for both, with different flavors. Gerbils solve puzzles socially and will remodel cardboard projects as a crew, while hamsters prefer solo challenges with a single entrance and no queue. Start simple, raise the difficulty as skill shows, and check abandoned toys for food hidden inside, which is just a hoard with extra steps.',
      },
      {
        question: 'Can a dwarf hamster and a gerbil share one food bag?',
        answer:
          'They can share the block base safely, but keep separate toppings. Dwarf hamsters handle sugar poorly, so the sweeter mix meant for a gerbil side deserves caution, and a rich gerbil blend can round out a dwarf over months. Two topping jars and one block bag is the clean, inexpensive answer for both cages.',
      },
    ],
  },
};
