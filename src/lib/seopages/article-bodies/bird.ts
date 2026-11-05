// Bird family articles for Pawzsly U — the category root plus cages,
// accessories, food, mineral blocks, perches, supplements, toys, treats,
// and backyard wild-bird feeding. Ten original blog bodies written to
// the WRITING-SPEC.md contract: on-topic, blog voice, at least six
// sections of authentic prose, marketplace-friendly without hard selling.
import type { ArticleBody } from './types';

export const BIRD_ARTICLES: Record<string, ArticleBody> = {
  // =========================================================================
  // BIRD (category root) — living with a flock animal, habitat first
  // =========================================================================
  bird: {
    heroTitle: 'Living With a Companion Bird: The Honest Daily Reality',
    heroSubheadline:
      'A companion bird is a flock animal that moved into your home. Meet the flock needs, budget the hours, and the supplies almost pick themselves.',
    metaDescription:
      'Companion birds are flock animals who expect company all day. Learn to budget interaction hours, build the habitat first, and choose supplies with purpose.',
    introSummary:
      "Nobody tells you the loudest thing about bird ownership is the quiet. A parakeet left alone in a back bedroom calls all afternoon for a flock that never answers, while the same bird beside the dinner table whistles for attention and gets it. That contrast is the whole subject. Your companion bird belongs to a species that traded a horizon of companions for you, and every choice you make, from the room to the routine to the shopping list, either honors that or works against it.",
    sections: [
      {
        id: 'flock-animal-living-room',
        title: 'A Flock Animal in Your Living Room',
        content:
          "Almost every companion species, from finch to macaw, spent its wild generations inside a flock. Safety, warmth, conversation, and every meal arrived as a group activity, so a bird's nervous system still runs on company. A single pet bird settles quickly into whichever household it can see and hear, and that becomes the flock. Contact calls, the little chirps your bird makes when you leave the room, are not noise. They are roll calls, and answering them, even with a whistle back, tells your bird the flock is accounted for.",
        tips: [
          'Answer contact calls with a word or whistle so your bird knows the flock responds.',
          'Keep the cage in a room the family actually uses, not a hallway nobody visits.',
          'Watch for frantic pacing or screaming, which signals distress rather than chatter.',
        ],
      },
      {
        id: 'daily-interaction-budget',
        title: 'Budgeting Your Daily Interaction Hours',
        content:
          'Be honest about the hours before you fall for a species. A finch pair or canary mostly wants a calm room and each other, while a budgie or cockatiel wants a daily piece of your attention, and larger parrots want the largest slice of your day you can defend. Out-of-cage time, shared meals, training minutes, and simple shoulder-sitting all count. The budget matters more than the intensity: twenty minutes of focus twice a day beats a chaotic hour once a weekend. Build the routine first, because birds notice broken promises faster than dogs do.',
        tips: [
          'Match species to your real schedule, not the one you wish you had.',
          'Schedule short focused sessions daily instead of marathon attention on weekends.',
          'Count out-of-cage time, training, and shared meals toward one attention budget.',
        ],
      },
      {
        id: 'habitat-first-mindset',
        title: 'The Habitat-First Mindset Before Supplies',
        content:
          'New bird people tend to shop in reverse: an adorable toy here, a bargain perch there, and a cage chosen last to fit whatever money remains. Flip the order. The cage is the territory, and its size and placement decide everything else, including which perches fit, where dishes land, and how many toys the space can hold without crowding. Once the habitat is set, supplies become a series of small, deliberate upgrades rather than impulse piles. That mindset also sharpens shopping: compare cages on floor space before comparing anything else you see listed.',
        tips: [
          'Set the cage and its room before buying toys, treats, or extras.',
          'Let available floor space set the cage budget, not the leftover money.',
          'Add supplies as deliberate upgrades once the habitat itself is settled.',
        ],
      },
      {
        id: 'sleep-and-rhythm',
        title: 'Evenings Come Early in Bird World',
        content:
          'Most companion species wake with the sun and settle at dusk, and they carry an unusually strict sleep requirement: roughly ten to twelve hours of dark, quiet rest every night. A cage in a room where the television runs past midnight slowly wears a bird down, and the wear shows up as nippiness, screaming, or feather fussing. A fitted cage cover, a consistent bedtime, and a quiet corner solve most of it. If late nights are permanent in your house, plan the bird\'s sleeping cage in a different room from the start.',
        tips: [
          'Give your bird ten to twelve hours of dark, quiet sleep nightly.',
          'Cover the cage at a consistent time so bedtime becomes predictable.',
          'Consider a separate sleeping cage if your evenings run loud and late.',
        ],
      },
      {
        id: 'reading-before-buying',
        title: 'Reading Your Bird Before Buying Anything',
        content:
          'The bird you already have is a better shopping advisor than any checklist. A bird that screams each evening is usually spending unused energy, which points toward foraging toys and more out-of-cage time, not another mirror. A bird that sits fluffed on the lowest perch has a health question, not a product question. Watch perching habits, dropping consistency, appetite, and noise patterns for a week, and write down what you actually see. The notes tell you which aisle of a marketplace deserves your attention next, and they beat guesswork every time.',
        callout: {
          type: 'vet-note',
          title: 'Fluffed is a flag',
          text: 'A bird that stays fluffed, quiet, or bottom-perched for a day needs a veterinarian experienced with birds promptly. Birds mask illness until they cannot, so same-week attention matters.',
        },
        tips: [
          'Keep a simple weekly log of appetite, droppings, and behavior before shopping.',
          'Let observed problems point you to the right product family.',
          'Rule out illness first when behavior changes suddenly or dramatically.',
        ],
      },
      {
        id: 'commitment-math',
        title: 'The Commitment Math Nobody Mentions',
        content:
          'Breeders and shops rarely lead with lifespans, so do the arithmetic yourself. A budgie typically shares a decade or less with you, a cockatiel often reaches its late teens and twenties, and a well-kept conure can outlive several cars. The larger parrots measure their lives in decades, sometimes against a human retirement plan. Longer lives also mean longer vet relationships, more years of food and toy budgets, and a will-worthy planning conversation. Choosing a species you can honestly fund and companion for its whole run is the kindest first decision.',
        tips: [
          'Compare species lifespans honestly before choosing, from budgie years to parrot generations.',
          'Budget for years of food, toys, and avian veterinary care, not one setup.',
          'Plan who cares for a long-lived parrot if your circumstances change.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'heart',
        title: 'Flock needs',
        items: [
          { highlight: 'Company is oxygen', text: 'a bird calms down when it can see and hear its people.' },
          { highlight: 'Answer the roll call', text: 'whistle back when your bird contact-calls across the house.' },
          { highlight: 'Room choice matters', text: 'the family room beats a quiet hallway nobody uses.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Daily budget',
        items: [
          { highlight: 'Species set the price', text: 'finches want calm, parrots want hours of your day.' },
          { highlight: 'Short and daily wins', text: 'twenty focused minutes twice daily beats weekend marathons.' },
          { highlight: 'Out-of-cage time counts', text: 'shared meals and shoulder rides build the bond.' },
        ],
      },
      {
        icon: 'check',
        title: 'Habitat first',
        items: [
          { highlight: 'Cage before toys', text: 'the territory decides which supplies even make sense.' },
          { highlight: 'Upgrades, not impulses', text: 'add perches and dishes deliberately once the space is set.' },
          { highlight: 'Observe before spending', text: 'a week of notes beats any generic shopping checklist.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How many hours of attention does a pet bird need?',
        answer:
          'Small birds like finches and canaries mostly want ambient company and each other, while budgies and cockatiels want an engaged piece of each day. Larger parrots want the largest defensible slice of your schedule. Think in consistent daily minutes rather than occasional marathons, because routine is what a flock animal reads as safety.',
      },
      {
        question: 'Do companion birds get lonely if kept alone?',
        answer:
          'Yes, most species are wired for flock life, and a bird isolated in a quiet room often screams, plucks, or goes dull. Some, like finches, genuinely prefer company of their own kind, while a single budgie or cockatiel can bond to people if you provide daily interaction. The honest question is whether you can be a reliable flock.',
      },
      {
        question: 'How much sleep does a pet bird need?',
        answer:
          'Plan for ten to twelve hours of dark and quiet rest each night, which is more than most households realize. A cover and a consistent bedtime handle it when the cage lives in a busy room. Persistent late noise tends to surface later as screaming, nipping, or ragged feather care, so protect the schedule early.',
      },
      {
        question: 'What should I buy first for a new bird?',
        answer:
          'Buy the habitat before the extras: the roomiest cage your space allows, then perches of varied widths, dishes positioned away from droppings, and a couple of toys. Treats, supplements, and clever accessories can wait until you know the bird. A roomy, well-placed territory with basics done right outperforms any pile of impulse buys.',
      },
      {
        question: 'How long do pet birds actually live?',
        answer:
          'Ranges run wide by species: budgies often live five to ten years, cockatiels commonly into their twenties, conures for a couple of decades, and large parrots for fifty years or more. Longer lives mean longer commitments to food, enrichment, and avian veterinary care, so match the species to the decades you can honestly give.',
      },
    ],
  },

  // =========================================================================
  // BIRD/CAGE — the cage as living space, width, bar spacing, placement
  // =========================================================================
  'bird/cage': {
    heroTitle: 'Bird Cage Size and Setup: Room to Live and Flap',
    heroSubheadline:
      "A cage is your bird's whole territory, not a holding pen. Buy width before height, match bar spacing to the body, and place it where the air stays safe.",
    metaDescription:
      'Bird cage size explained: why width beats height for flying birds, which bar spacing fits each species, and where to place a cage away from kitchen fumes.',
    introSummary:
      'The classic first-cage mistake is tall and narrow, chosen because it looks like a birdcage in a cartoon. Real birds fly from side to side, not up and down like elevators, so a vertical tower gives them headroom they cannot use and floorspace they desperately need. The second mistake is placement: the kitchen counter seemed convenient until someone remembered what non-stick pans do to bird lungs. Get these two decisions right, width and placement, and nearly everything else about cage shopping becomes simple arithmetic.',
    sections: [
      {
        id: 'width-beats-height',
        title: 'Width Beats Height Every Single Time',
        content:
          'Watch any parrot exercise inside a cage and the movement is horizontal: short flights between perches, flapping bursts, hops across the width. Height mostly serves climbing, which matters less than flight room. So read cage measurements in a specific order, width first, then depth, then height, and distrust photos that hide the footprint. A wide low cage beats a narrow tall one at the same price. When you compare listings, check whether the stated height includes the legs and the seed skirt, because marketing inches are not living inches.',
        tips: [
          'Read dimensions width first, then depth, then height, every single time.',
          'Check whether listed height includes legs, domes, or skirts before comparing.',
          'Prefer a wider, shorter cage over a taller, narrower one at any price.',
        ],
      },
      {
        id: 'bar-spacing-species',
        title: 'Bar Spacing by Species',
        content:
          'Bar spacing is a safety measurement, not a style choice. Gaps too wide let a head through, and a bird that wedges its head between bars can strangle in a minute of panic. Gaps too narrow snag toes, tongues, and beaks on the wrong side of the wire. The ranges below are the widely used starting points for common companion species; when your bird sits between sizes, choose the smaller spacing.',
        tableData: {
          headers: ['Species', 'Approximate bar spacing', 'Watch for'],
          rows: [
            ['Finches, canaries', 'about 1/2 inch', 'They value flight space over height'],
            ['Budgies, parrotlets', '1/2 inch', 'Horizontal bars invite climbing'],
            ['Cockatiels, lovebirds', '1/2 to 5/8 inch', 'Crests poke through wider gaps'],
            ['Conures, caiques', '5/8 to 3/4 inch', 'Tight gaps snag curious toes'],
            ['Amazons, African greys', '3/4 to 1 inch', 'Latch quality matters as much'],
            ['Macaws, large cockatoos', '1 to 1 1/4 inch', 'Bar strength outranks spacing'],
          ],
        },
        tips: [
          'Size bar spacing from the bird head width, not its body length.',
          'Choose the smaller spacing when your species sits between two ranges.',
          'Test latch security on large parrot cages before trusting any simple clip.',
        ],
      },
      {
        id: 'placement-kitchens-drafts',
        title: 'Placement Away From Kitchens and Drafts',
        content:
          'The air around a cage decides more than any accessory you can clip inside it. Overheated non-stick cookware, including pans, air fryers, and self-cleaning ovens, can release fumes that kill birds at exposures people cannot even smell, which rules out the kitchen and the room beside it. Drafts are the quieter problem: a cage caught between a door gap and an air-conditioning vent chills a bird steadily. Aim instead for a wall-adjacent spot in a social room, at roughly your chest height, out of direct sun.',
        callout: {
          type: 'warning',
          title: 'Non-stick fumes kill quickly',
          text: 'PTFE coatings, found on many non-stick pans and some self-cleaning ovens, release fumes lethal to birds when overheated. Keep cages far from cooking areas and ventilate before anything gets hot, not after.',
        },
        tips: [
          'Keep the cage out of the kitchen and any room sharing its air.',
          'Walk the room at different hours to find drafts before choosing the spot.',
          'Position perching height near your chest so the bird watches family life.',
        ],
      },
      {
        id: 'doors-latches-escapes',
        title: 'Doors, Latches, and Escape Artists',
        content:
          'A cage door earns its keep twice a day for years, so work the mechanism before you buy. Small birds slip through gaps around hinged doors, while larger parrots learn to lift simple latches, sometimes within weeks of arrival. Look for doors wide enough for both hands and a dish, guarded feeder access so you can swap food without opening the main door, and locking mechanisms a determined beak cannot undo. If a cage offers only a friction-fit door, budget for a clip or two from day one.',
        tips: [
          'Test the door action in person whenever a showroom allows it.',
          'Choose cages with external feeder doors for quicker, calmer food swaps.',
          'Add locking clips to any cage with a simple lift latch.',
        ],
      },
      {
        id: 'materials-survive-beak',
        title: 'Materials That Survive a Beak',
        content:
          'Cages are chewed, climbed, hosed, and re-chewed for a decade or more, and the finish has to survive all of it. Powder-coated steel is the common standard, and a good coating stays smooth and chip-free for years, while a cheap one flakes at the welds, and swallowed flakes are a heavy-metal risk. Stainless steel costs more and essentially lasts the bird\'s lifetime, which large parrot keepers often decide is cheaper per year. Whatever the listing says, inspect weld points and corners: smooth, rounded welds are the sign of a cage built to be lived in.',
        tips: [
          'Reject any cage with flaking paint, rough welds, or exposed sharp seams.',
          'Weigh stainless steel against powder-coat for birds with decade-long lifespans.',
          'Avoid galvanized or mystery-metal cages, since zinc exposure harms birds.',
        ],
      },
      {
        id: 'buying-once-big',
        title: 'Buying Once and Buying Big',
        content:
          'The cage is the one purchase where upgrading later costs you twice, because an outgrown cage is hard to resell and a bird settles into territory slowly. Buy the biggest honest footprint your room allows on day one, even for a young bird. A modest rule from keepers: get the cage first, then spend leftover budget on perches and dishes, never the reverse. If money is tight, a bigger simple cage beats a smaller fancy one every time, and a plain dome beats a decorative tower.',
        callout: {
          type: 'pro-tip',
          title: 'Measure the room before the aisle',
          text: "Tape out the cage footprint on your floor with painter's tape and live beside it for a weekend. If the taped rectangle already crowds the room, no cage listing will fix that later.",
        },
        tips: [
          'Buy the largest footprint your room genuinely allows the first time.',
          'Budget per decade: a bigger plain cage outlasts a smaller fancy one.',
          'Put upgrade plans into perches and dishes, never the cage itself.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Width wins',
        items: [
          { highlight: 'Read width first', text: 'horizontal flight room defines how livable a cage is.' },
          { highlight: 'Question tall towers', text: 'height mostly serves climbing, which birds need less.' },
          { highlight: 'Check listed inches', text: 'heights that include legs and skirts flatter the footprint.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Safe placement',
        items: [
          { highlight: 'No kitchen air', text: 'overheated non-stick coatings release fumes lethal to birds.' },
          { highlight: 'Drafts wear slowly', text: 'a spot between a vent and a door chills steadily.' },
          { highlight: 'Chest height, social wall', text: 'the bird joins family life without feeling cornered.' },
        ],
      },
      {
        icon: 'award',
        title: 'Built to last',
        items: [
          { highlight: 'Smooth welds signal quality', text: 'rough seams and flaking coats become chewing hazards.' },
          { highlight: 'Latches earn trust', text: 'clever parrots open simple clips within a few weeks.' },
          { highlight: 'Stainless pays off', text: 'for decade-living birds, per-year cost favors the premium metal.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How big should a bird cage be?',
        answer:
          'Big enough for full wing extension in at least one direction, ideally with flying room across the width for a few wingbeats. For small birds like budgies, think in terms of a flight cage rather than a tall dome. Whatever the species, the best cage is usually the largest footprint your room and budget honestly allow.',
      },
      {
        question: 'What bar spacing does my bird need?',
        answer:
          'Roughly half an inch for budgies, parrotlets, finches, and canaries; up to five-eighths for cockatiels and lovebirds; three-quarters for most conures; and an inch or more for macaws and large cockatoos. The safety logic is head width: if the head could wedge between bars, the spacing is too wide, so size down when in doubt.',
      },
      {
        question: "Why can't I keep my bird's cage in the kitchen?",
        answer:
          'Cooking air is bird poison in a way most homes underestimate. Overheated non-stick coatings and self-cleaning oven cycles can release fumes that sicken or kill small birds rapidly, and people usually notice nothing until it is too late. Kitchens also carry steam, smoke, and temperature swings. Give the cage a wall in a social room instead.',
      },
      {
        question: 'Can a cage ever be too big?',
        answer:
          'Rarely, and usually only in practical ways. A timid recently fledged bird can feel exposed in a vast open cage, which more coverage and extra perches fix, and some rooms simply cannot hold the footprint. Space itself, though, is not harmful: given room, most birds fly more, climb more, and stay in better shape than cramped ones.',
      },
      {
        question: 'Do vertical bars or horizontal bars matter more?',
        answer:
          'For climbers like budgies and cockatiels, horizontal bars give real gripping and climbing surface, which is why flight cages for small birds favor them. Vertical bars suit larger parrots, whose beaks do the climbing, and they resist beak damage better over the years. Either way, bar strength and spacing still matter more than orientation.',
      },
    ],
  },

  // =========================================================================
  // BIRD/CAGE-ACCESSORY — what earns space inside the cage
  // =========================================================================
  'bird/cage-accessory': {
    heroTitle: 'Bird Cage Accessories That Earn Every Inch of Space',
    heroSubheadline:
      'Inside a cage, floor and airway space are precious. Choose accessories that serve the bird directly, place them with droppings in mind, and keep clutter out.',
    metaDescription:
      'Bird cage accessories that earn their space: perch variety without crowding, dishes placed clear of droppings, skirts that catch hulls, and smart toy rotation.',
    introSummary:
      'Open an overdone cage and you will find three toys, four perches at the same height, a mirror, a swing nobody uses, and a bird flapping into all of it. Cage accessories are competing for a finite room. Every piece either earns its floorspace and airway or works against the bird\'s movement. The discipline is simple: a few well-placed items, dishes that stay clean, a skirt that contains the mess, and a rotation habit that makes a handful of toys feel like an endless library.',
    sections: [
      {
        id: 'everything-competes-for-space',
        title: 'Everything Inside Competes for Space',
        content:
          'A cage that photographs full usually functions poorly. Birds need open airways for flapping, clear descent paths to dishes, and uncluttered floors for dropped food and ground foragers like budgies and cockatiels. The working test: your bird should flap hard anywhere on the main perch without striking a toy, a mirror, or a swing. If it cannot, something leaves. That is the whole standard, and it outranks every aesthetic instinct, because a sparse cage with airways beats a stocked cage the bird cannot move in.',
        tips: [
          'Run the flap test: hard wingbeats should hit nothing from the main perch.',
          'Keep floors clear if your species forages below, as budgies and cockatiels do.',
          'Remove one accessory whenever you add one, so totals never creep.',
        ],
      },
      {
        id: 'perch-planning-no-clutter',
        title: 'Perch Planning Without the Clutter',
        content:
          'Perches set the traffic pattern of the whole cage, so place them before anything else goes in. Three or four at differing heights is plenty for a mid-size cage: a comfortable main perch up high for sleeping, one by the dishes for long standing sessions, and one lower for the descent. Vary the materials as you go, natural wood, rope, one rough grooming perch, since uniform identical dowels are how foot trouble starts. The full diameter-by-species breakdown lives in our perches article; the layout job is done here, with flight paths kept open between levels.',
        tips: [
          'Install the highest sleeping perch first, then work downward from it.',
          'Leave clear flight paths between perch levels instead of stacking them.',
          'Vary materials and heights so identical dowels never dominate the cage.',
        ],
      },
      {
        id: 'dishes-away-from-droppings',
        title: 'Dishes Placed Away From Droppings',
        content:
          "Gravity is not your friend in cage layout. Anything directly beneath a favorite perch receives whatever falls from it, so a dish parked below a roosting spot turns into a hygiene problem within a day. Place food and water where the roofline and perches shield them, or use hooded dish holders that block strikes from above. Rotate dish position mentally whenever you change perch arrangements, because yesterday's clean corner becomes today's target zone. As you compare dish options, favor ones you can remove one-handed without opening the main door.",
        tips: [
          'Never station a dish directly under a perch the bird favors overnight.',
          'Consider hooded crock holders that intercept droppings before they land.',
          'Choose dishes reachable through feeder doors for calm, quick swaps.',
        ],
      },
      {
        id: 'skirts-and-hulls',
        title: 'Skirts and the Hull Problem',
        content:
          'Seed hulls travel. A determined cockatiel can redecorate a two-foot radius around any open dish, which is the problem cage skirts and seed guards exist to soften. A fabric or vinyl skirt fitted around the lower cage catches a fair share of falling hulls, and a washable mat under the stand catches the rest while protecting the floor itself. Neither stops every husk, so set expectations honestly. As you browse skirt options, check the height of the guard against your bird\'s favorite flinging perch, not just the cage\'s listed dimensions.',
        tips: [
          'Match skirt height to where your bird actually flicks hulls, not the tray.',
          'Add a washable mat under the cage to rescue the floor beneath it.',
          'Wipe vinyl skirts weekly; fabric ones want a regular machine wash.',
        ],
      },
      {
        id: 'rotation-space-management',
        title: 'Rotation as Space Management',
        content:
          'Toy rotation is usually pitched as entertainment, but its first job here is square footage. Two or three toys at a time keep the airways open, while the rest of the collection waits in a drawer, and swapping them every week or two keeps the cage from ever feeling full. The same discipline applies to swings and ladders: they visit, they serve, they step out for a rest. When new accessories tempt you, run the flap test again before anything moves in, because crowding is easier to prevent than to walk back.',
        callout: {
          type: 'pro-tip',
          title: 'Keep a toy drawer, not a toy pile',
          text: 'Store out-of-rotation toys in a dedicated bin with the date of their last turn written on masking tape. Nothing re-enters the cage without passing the flap test, and nothing sentimental stays in past its welcome.',
        },
        tips: [
          'Cap toys at two or three at once, whatever the collection size.',
          'Swap accessories weekly so the cage never accumulates unnoticed clutter.',
          "Date each toy's last rotation on tape so nothing hides for months.",
        ],
      },
      {
        id: 'swings-ladders-movement',
        title: 'Swings, Ladders, and Honest Movement',
        content:
          'Movement accessories succeed when they match how the species actually plays. Budgies and cockatiels take to small swings naturally, and a bouncy rope spiral turns a climb into a workout. Ladders earn space for grounded climbers and older birds that hop rather than fly. What rarely earns space: mirrors for single parrots that already treat you as a mate, and plastic jungle gyms that look busy but offer nothing to chew or solve. Watch which pieces your bird returns to, and let the ignored ones go.',
        tips: [
          'Try a swing sized for your species before assuming ladders are needed.',
          'Retire accessories your bird ignores for a full month straight.',
          'Inspect rope spirals weekly for fraying that can trap a toe.',
        ],
      },
      {
        id: 'weekly-wear-check',
        title: 'The Weekly Wear Check',
        content:
          'Cage accessories fail quietly, a frayed rope one fiber at a time, a plastic clip one chew mark at a time. Set a standing weekly appointment to inspect everything: run a finger along ropes for snagged loops, check that dish holders still lock, look for chewed corners sharp enough to scrape, and confirm nothing hangs by a thread of its old hardware. Frayed rope and split plastic deserve immediate retirement, because toes and tongues find those flaws before you do. The check takes five minutes and quietly pays for itself.',
        callout: {
          type: 'warning',
          title: 'Frayed rope traps toes',
          text: 'A rope perch or spiral with snagged loops can wrap around a toenail or toe and hold on while the bird panics. Trim or retire anything frayed the week you notice it, not eventually.',
        },
        tips: [
          'Run fingers along all rope items weekly, hunting for snagged loops.',
          'Retire chewed plastic the moment edges turn sharp or split.',
          'Test that dish holders and clips still lock securely after cleaning.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Space discipline',
        items: [
          { highlight: 'Run the flap test', text: 'hard wingbeats from the main perch should strike nothing.' },
          { highlight: 'One in, one out', text: 'accessory counts stay flat instead of creeping upward.' },
          { highlight: 'Sparse beats stuffed', text: 'open airways matter more than a full-looking cage.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Clean by design',
        items: [
          { highlight: "Watch what's overhead", text: 'no dish sits beneath a perch the bird roosts on.' },
          { highlight: 'Hooded holders help', text: 'they intercept falling droppings before they reach meals.' },
          { highlight: 'Skirts soften the radius', text: 'hulls land in the guard instead of across the floor.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Rotation habit',
        items: [
          { highlight: 'Two or three toys', text: 'stay in rotation while the rest wait in a drawer.' },
          { highlight: 'Weekly wear checks', text: 'five minutes catches frayed rope before toes do.' },
          { highlight: 'Retire the ignored', text: 'pieces your bird skips for a month can go.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How many toys should be in a bird cage at once?',
        answer:
          'Two or three is the working number for most mid-size cages, enough variety without blocking airways. Keep the rest in a drawer and swap them weekly or biweekly, which keeps the cage uncluttered and makes old toys feel new again. If the flap test fails, a toy leaves, whatever its price or its reviews.',
      },
      {
        question: 'Do cage skirts actually reduce the mess?',
        answer:
          'They soften it rather than end it. A fitted skirt or seed guard catches a useful share of hulls flicked at cage height, and a washable floor mat beneath the stand catches what slips past. Expect a radius shrinkage, not a spotless floor, and match the skirt height to the perch your bird actually flings from.',
      },
      {
        question: 'Where should food and water dishes go in the cage?',
        answer:
          'Anywhere a favorite perch cannot rain on them. Check what sits directly above each dish, including nighttime roosting spots, and either move the dish or shield it with a hooded holder. Dishes near feeder-access doors are easiest to swap without startling the bird, and daily washing beats any placement perfectly.',
      },
      {
        question: 'Are swings good accessories for budgies and cockatiels?',
        answer:
          'Usually yes, and they are among the best space-earning accessories for small birds, combining perch, motion, and play in one footprint. Introduce the swing near a familiar perch height, expect a few suspicious days, and skip oversized swings that crowd the cage. Birds that fear the swing at first often claim it within the week.',
      },
      {
        question: "Should I put a mirror in my bird's cage?",
        answer:
          'For finches and canaries, small mirrors rarely cause trouble. For a single parrot that has bonded to you, a mirror can feed an already-intense relationship and sometimes encourage regurgitating or territorial behavior. If your bird seems over-attached or hormonal, remove the mirror and ask a veterinarian experienced with birds about the behavior before shopping it away.',
      },
    ],
  },

  // =========================================================================
  // BIRD/BIRD-FOOD — species honesty, pellets, conversion patience
  // =========================================================================
  'bird/bird-food': {
    heroTitle: 'Bird Food Honesty: Why Seed-Only Diets Fall Short',
    heroSubheadline:
      'Seed mixes are the junk food of the bird world. Build a pelleted base, layer in fresh foods, and convert your bird with patience instead of ultimatums.',
    metaDescription:
      'Honest bird food advice: why seed-only diets fall short, how pellets plus fresh foods build a real base, and converting stubborn birds without starving them.',
    introSummary:
      'What would you call a human diet of nothing but buttered popcorn? Tasty, fatty, and quietly catastrophic is how avian keepers describe the seed-only bowl. Sunflower and millet are the treats of the bird world, energy-dense and nutritionally narrow, yet they anchor most starter food mixes because birds adore them. The honest path is less dramatic: a formulated pellet base, a rotating cast of fresh vegetables and fruits, and the patience to migrate a seed junkie across gradually. Here is how each layer works and where species complicate it.',
    sections: [
      {
        id: 'seed-only-truth',
        title: 'Why Seed-Only Diets Fall Short',
        content:
          'A bowl of mixed seed fails not because seed is poison but because it is incomplete and easy to overeat. Seed delivers fat and energy in concentrated form while running short on calcium, vitamin A, and several amino acids, so a seed-fed bird slowly drifts toward obesity with deficiencies hiding underneath. Birds also cherry-pick, hunting the fattest seeds and husking the rest to the floor, so the balanced blend you bought is not the blend being eaten. The wild relatives of these species graze dozens of foods daily, and no single seed mix copies that range.',
        tips: [
          'Treat seed mixes like treat jars, not meal foundations, from day one.',
          'Watch which seeds get husked first; those are the fattest ones.',
          'Judge the diet by what gets swallowed, not what gets poured.',
        ],
      },
      {
        id: 'pellets-honest-base',
        title: 'Pellets as the Honest Base',
        content:
          'Formulated pellets are the boring, reliable layer of the diet, engineered to be complete in every bite so cherry-picking stops working. Sized to the species, small crumbles for budgies, chunky morsels for macaws, they carry vitamins and minerals in stable form, and they spoil far slower than fresh foods. Two cautions keep it honest: pellets are a base, not a total diet, because fresh foods carry value pellets cannot fully copy, and a bird raised on seed will not simply switch because the bowl changed. Both problems have answers below.',
        tips: [
          'Match pellet size to beak size; oversized pellets get tossed unused.',
          'Compare pellet options by ingredient list, not by bag artwork or slogans.',
          'Store pellets in airtight containers, since oils turn rancid in warm rooms.',
        ],
      },
      {
        id: 'fresh-foods-weight',
        title: 'Fresh Foods That Pull Weight',
        content:
          'Fresh produce is where a diet becomes a life. Dark leafy greens, shredded carrot, bell pepper, broccoli florets, squash, and the occasional berry deliver vitamin A, moisture, and texture variety no pellet copies. Serve them chopped raw, clipped to the cage bars, or woven into a chop mix the bird picks through all day. Fruit earns its place but in modest portions, since sugar is sugar. Introduce new foods repeatedly and without pressure; a food ignored six times is often the seventh time\'s favorite, and the mess is the price of a real diet.',
        callout: {
          type: 'warning',
          title: 'Foods that never enter the cage',
          text: 'Avocado, chocolate, caffeine, alcohol, and the onion family are established hazards for birds, and salty human snacks do no favors either. When in doubt about a food, check with a veterinarian experienced with birds before offering it, not after.',
        },
        tips: [
          'Anchor the fresh portion in leafy greens and orange vegetables daily.',
          'Offer any new food many times before deciding your bird hates it.',
          'Keep fruit portions small and treat dried fruit like candy.',
        ],
      },
      {
        id: 'species-at-the-bowl',
        title: 'Species Differences at the Bowl',
        content:
          'One feeding plan does not travel across species, because parrots evolved across wildly different menus. The table below is the starting map, not the law: individuals vary, and a bird with a health condition needs a plan shaped with professional help. Use it to sanity-check the next bag you compare in a listing, and to catch the species, like lorikeets, whose needs break the standard template entirely.',
        tableData: {
          headers: ['Species group', 'Sensible base', 'Fresh-food notes'],
          rows: [
            ['Budgies, cockatiels', 'Small pellets plus measured seed', 'Leafy greens, grated carrot, millet as treats only'],
            ['Conures, caiques, pionus', 'Small-to-medium pellets', 'Chopped vegetables daily; fruit sparingly'],
            ['Amazons, greys, cockatoos', 'Medium pellets, strict seed limits', 'Vegetable-heavy and low fat; watch the scale'],
            ['Macaws, large parrots', 'Large pellets plus in-shell nuts as treats', 'Mixed nuts sparingly; harder vegetables welcome'],
            ['Lorikeets, lories', 'Specialized nectar and powder formulas', 'Soft foods daily; pellets and seed unsuitable'],
            ['Canaries, finches', 'Fortified seed-and-pellet finch blends', 'Greens and egg food, especially while molting'],
          ],
        },
        tips: [
          'Treat the table as a starting map, then adjust to your individual bird.',
          'Never convert a lorikeet to pellets; their nectar formulas are the diet.',
          'Ask an avian vet before reshaping any diet around a health condition.',
        ],
      },
      {
        id: 'pellet-conversion-marathon',
        title: 'The Pellet Conversion Marathon',
        content:
          'Converting a settled seed eater to pellets is a weeks-long negotiation, occasionally months, and the method is patience rather than force. Mix a rising ratio of pellets into the seed over weeks, crush pellets over familiar food to transfer scent, or hand-feed pellets as treats so they read as currency. Never simply swap bowls and wait: a bird can starve beside food it does not recognize as food. Weigh your bird in grams on a kitchen scale every few days throughout, because steady weight is your only honest progress meter.',
        callout: {
          type: 'vet-note',
          title: 'Weigh before and during',
          text: 'Run the whole conversion under a veterinarian experienced with birds for very stubborn birds, young birds, or any bird losing weight. A gram scale catches trouble days before your eyes do.',
        },
        tips: [
          'Shift seed-to-pellet ratios gradually across weeks, never overnight.',
          'Log gram weights every few days so drift cannot hide.',
          'Celebrate pellet tastings like wins; the first crunched pellet is real progress.',
        ],
      },
      {
        id: 'reading-bags',
        title: 'Reading Bags Without Falling for Them',
        content:
          'Bird food packaging works hard, with jungle art, honey glazes, and fortified seed blends promising balance that the contents do not deliver. Fortification helps but does not fix the underlying fat profile of a seed-heavy mix. Turn the bag around and read like a skeptic: ingredient order, whether seed dominates the first five entries, and what the formulated analysis says about fat. The same scrutiny travels with you as you compare food listings anywhere: the front of the bag is advertising, the side panel is the product.',
        tips: [
          'Read the ingredient order before trusting any balanced-blend claim.',
          'Compare fat percentages between mixes; lower is usually safer ground.',
          'Distrust honey-coated treat sticks posing as everyday staple food.',
        ],
      },
      {
        id: 'storage-stale',
        title: 'Keeping Food From Going Stale',
        content:
          'Bird food is food, and it spoils on a schedule. Seed and pellets both carry oils that turn rancid in warmth, and a rancid base is quietly rejected by birds or, worse, eaten anyway. Buy in bag sizes your bird finishes within weeks rather than bulk bargains, decant into an airtight bin away from sunlight, and date the bin when you open it. Fresh foods follow stricter rules: remove wet leftovers after a few hours, especially in summer, before fermentation or mold begins, and wash dishes daily without exception.',
        tips: [
          'Buy bag sizes your bird finishes within a few weeks, not months.',
          'Decant into a dated airtight bin kept out of warm sunlight.',
          'Pull wet fresh foods after a few hours, sooner in summer heat.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'heart',
        title: 'Seed honesty',
        items: [
          { highlight: 'Seed is junk food', text: 'energy-dense, nutritionally narrow, and beloved for the wrong reasons.' },
          { highlight: 'Cherry-picking defeats blends', text: 'the fattest seeds get eaten while the rest piles up.' },
          { highlight: 'Deficiencies hide quietly', text: 'a chunky seed-fed bird can still be malnourished.' },
        ],
      },
      {
        icon: 'check',
        title: 'Build the base',
        items: [
          { highlight: 'Pellets form the base', text: "formulated to be complete, sized to the species' beak." },
          { highlight: 'Fresh foods daily', text: 'greens, carrot, and pepper carry what pellets cannot.' },
          { highlight: 'Fruit stays modest', text: 'sugar is sugar, whatever the pretty bowl suggests.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Convert with patience',
        items: [
          { highlight: 'Ratios shift slowly', text: 'weeks of gradual mixing, never an overnight bowl swap.' },
          { highlight: 'Grams tell the truth', text: 'weigh every few days during the whole conversion.' },
          { highlight: 'Stubborn cases need help', text: 'a bird losing weight needs its veterinarian involved.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Can a bird live on seeds alone?',
        answer:
          'It can survive on them for a while, which is exactly the trap, but seed-only diets fall short on calcium, vitamin A, and key amino acids while overserving fat. Long-term, the pattern drifts toward obesity with hidden deficiencies. Most avian veterinarians now describe a pelleted base plus fresh foods as the sturdier daily plan.',
      },
      {
        question: 'How do I switch my bird from seed to pellets?',
        answer:
          'Move gradually across weeks: mix a rising proportion of pellets into the familiar seed, crush pellets over favorite foods to transfer scent, and offer pellets from your fingers so they read as rewards. Track weight on a gram scale throughout, because a bird can decline food it does not recognize. Expect weeks, celebrate small wins.',
      },
      {
        question: 'What fresh foods are safe for parrots?',
        answer:
          'Most parrots thrive on dark leafy greens, carrot, bell pepper, broccoli, squash, peas, and occasional berries or apple. Introduce variety over weeks rather than all at once, and serve new foods repeatedly, since acceptance often arrives on the seventh attempt. Avocado, chocolate, and onion-family foods stay out of the cage entirely.',
      },
      {
        question: 'How long does pellet conversion usually take?',
        answer:
          "Weeks is normal and months is not scandalous, depending on the bird's age, stubbornness, and history with seed. Small birds sometimes convert in a fortnight, while an older Amazon may negotiate for a season. The pace matters less than the direction, so keep ratios moving gently and let a gram scale confirm the bird stays healthy meanwhile.",
      },
      {
        question: 'Do lorikeets really need special food?',
        answer:
          'Yes, and this is the species that breaks the template. Lorikeets and lories evolved brush tongues for nectar and pollen, so they need specialized nectar formulas and soft foods, while dry pellets and seed simply do not fit their digestion. Feeding them like a typical parrot causes real harm, so follow the specialized lane for these birds.',
      },
      {
        question: 'How do I store bird food properly?',
        answer:
          'Keep pellets and seed in airtight containers away from warmth and sunlight, and buy bag sizes your bird empties within weeks. Rancid oils make food unappealing at best and unhealthy at worst. Fresh offerings come out of the cage after a few hours, and the water dish gets washed daily regardless of how clean it looks.',
      },
    ],
  },

  // =========================================================================
  // BIRD/MINERAL-BLOCK — beak maintenance and calcium
  // =========================================================================
  'bird/mineral-block': {
    heroTitle: 'Mineral Blocks and Cuttlebones: Beak Care and Calcium',
    heroSubheadline:
      'A mineral block is a beak gym and a mineral delivery in one cheap package. Here is what blocks, cuttlebones, and calcium choices honestly do for your bird.',
    metaDescription:
      'What mineral blocks and cuttlebones do: iodine and calcium for birds, real beak maintenance, and when laying hens need extra calcium beyond the basics.',
    introSummary:
      'Give a budgie a cuttlebone and watch a specialist at work: nibbles for calcium, gnaws for the beak, and a satisfying mess for the floor. The instinct is ancient. Beaks grow continuously like fingernails, and wild parrots keep them worn and mineral-fed through constant chewing on varied material. A cage offers little natural wear, which is why mineral blocks, cuttlebones, and calcium options earn a permanent spot in the setup. Choosing among them well, especially for a laying hen, is a small decision with real consequences.',
    sections: [
      {
        id: 'what-blocks-really-do',
        title: 'What a Mineral Block Really Does',
        content:
          'A mineral block is a compressed brick of minerals, usually calcium with added iodine and trace elements, sometimes flavored or colored to invite nibbling. The block does two jobs at once: it supplies minerals in the exact way birds prefer to take them, by chewing, and it gives the beak a mildly abrasive surface to work against. Beak maintenance through chewing is the honest framing, because a block trims and polishes rather than performs dentistry. Position it where the beak already travels, beside a favorite perch, and replace it when it looks stale or heavily gouged. As you compare block options, the mineral list on the back says more than the colors on the front.',
        tips: [
          'Hang the block beside a perch your bird already favors for daily use.',
          'Swap out blocks that look dusty, stale, or deeply gouged.',
          'Offer flavored varieties to reluctant nibblers, then taper the flavors away.',
        ],
      },
      {
        id: 'know-the-cuttlebone',
        title: 'Getting to Know the Cuttlebone',
        content:
          "The cuttlebone is the mineral block's softer cousin, a buoyancy structure from cuttlefish that happens to be almost pure calcium carbonate, light, and pleasingly chalky. Small birds, budgies and cockatiels especially, rasp at it for hours, taking in calcium while keeping their beaks busy. A large parrot may demolish one in an afternoon, which is fine and expensive, so owners of macaws and cockatoos often graduate to tougher blocks or calcium perches. The soft texture also makes cuttlebone a gentle first chew for young or timid birds.",
        tips: [
          'Clip a cuttlebone at a slight angle so the soft edge faces the perch.',
          'Replace a cuttlebone once it thins, cracks, or gets fouled near the dish.',
          'Skip brittle, yellowed stock; fresh cuttlebone is white and firm.',
        ],
      },
      {
        id: 'iodine-thyroid',
        title: 'Iodine and the Tiny Thyroid',
        content:
          'Iodine rarely gets shelf space in conversation, but for seed-heavy budgerigars it carries real weight, because long seed-only diets have historically been linked to thyroid trouble in the species. An iodine-fortified mineral block quietly covers the gap while the diet itself is upgraded toward pellets. That is the honest order of operations: the block is a bridge and a backup, not a fix for a broken menu. If your budgie shows swelling at the throat base, voice changes, or breathing oddities, skip the shelf and go straight to a veterinarian experienced with birds.',
        callout: {
          type: 'vet-note',
          title: 'A lump is not a shopping problem',
          text: 'Any swelling, voice change, or labored breathing in a budgie deserves a veterinarian experienced with birds right away. Mineral blocks support healthy birds; they do not treat conditions, so let diagnostics lead.',
        },
        tips: [
          'Choose iodine-fortified blocks for seed-heavy budgies during any diet transition.',
          'Treat throat swelling or voice changes as a vet visit, not a restock.',
          'Remember blocks back up the diet; they never repair a seed-only menu.',
        ],
      },
      {
        id: 'hens-extra-calcium',
        title: 'When Hens Need Extra Calcium',
        content:
          'Egg production is a calcium expense a hen pays from her own skeleton when the bowl does not cover it, and shells are nearly pure calcium carbonate. A hen in laying condition deserves generous access: a cuttlebone always available, a mineral block as backup, and calcium-rich extras like dark greens and crushed eggshell or egg food where her species accepts them. Watch for chronic laying, though, one clutch after another without a mate, because that drains reserves no treat can refill. Persistent egg laying is a veterinary conversation, not a shopping list.',
        callout: {
          type: 'pro-tip',
          title: 'Hens chew hard before laying',
          text: 'Many hens noticeably increase gnawing on calcium sources in the days before an egg arrives. Keep a fresh cuttlebone mounted year-round so the pantry is never empty exactly when demand spikes.',
        },
        tips: [
          'Keep a fresh cuttlebone mounted permanently, not just when eggs appear.',
          'Offer dark leafy greens alongside blocks to widen the calcium intake.',
          'Flag endless egg-laying to a vet experienced with birds rather than restocking.',
        ],
      },
      {
        id: 'formats-and-mounts',
        title: 'Choosing Formats and Mounts',
        content:
          'Blocks, cuttlebones, calcium perches, and powdered supplements all deliver minerals through different doors, and the mount matters as much as the mineral. Flimsy plastic clips crack under a determined beak, so favor sturdy holders or hardware that survives chewing, and place the item where droppings cannot reach it. As you compare options in listings, check three things: the actual mineral list, the mount style, and the size relative to your bird, because a block built for a budgie is a snack for a macaw and a wall for a canary. Rotate positions occasionally to keep interest alive.',
        tips: [
          'Prefer sturdy metal or heavy-duty holders over cracking plastic clips.',
          'Match block size to species, from canary-thin slabs to macaw bricks.',
          'Relocate blocks between perches occasionally to refresh chewing interest.',
        ],
      },
      {
        id: 'beak-needs-more',
        title: 'When the Beak Needs More',
        content:
          'Normal beak wear happens through chewing, and a healthy beak on a good diet with wood and mineral surfaces rarely needs intervention. An overgrown, flaking, or crossgrown beak usually signals something upstream: mites, injury, liver strain, or a diet problem, and none of those resolve from the accessory aisle. Bring the bird, not a shopping bag, to a veterinarian experienced with birds, who can identify the cause and trim safely if a trim is warranted. Afterward, stack the prevention side: varied chewing surfaces, mineral access, and a diet worth growing a beak on.',
        tips: [
          'Treat overgrown or flaking beaks as symptoms, not grooming errands.',
          'Offer wood, cuttlebone, and blocks so wear comes from many textures.',
          'Never trim a beak at home; let an experienced avian hand do it.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Chew for minerals',
        items: [
          { highlight: 'Blocks give iodine', text: 'a quiet backup for birds still moving off seed.' },
          { highlight: 'Cuttlebone gives calcium', text: 'soft, chalky, and beloved by budgies and cockatiels.' },
          { highlight: 'Chewing wears beaks', text: 'steady daily gnawing polishes better than any single trim.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Hen support',
        items: [
          { highlight: 'Shells cost calcium', text: 'a laying hen draws on her own skeleton otherwise.' },
          { highlight: 'Keep cuttlebone stocked', text: 'many hens gnaw hardest just before an egg arrives.' },
          { highlight: 'Chronic laying needs help', text: 'endless clutches are a veterinary matter, not restocking.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Safe shopping',
        items: [
          { highlight: 'Read the mineral list', text: 'the back label beats flavor colors and shapes.' },
          { highlight: 'Mount hardware matters', text: 'flimsy plastic clips crack under any determined beak.' },
          { highlight: 'Overgrowth means vet', text: 'flaking beaks point upstream, not to the shelf.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Does my bird need a cuttlebone or a mineral block?',
        answer:
          'Most companion birds benefit from having both: a cuttlebone for soft, generous calcium and a mineral block for tougher chewing plus iodine and trace minerals. Small species often favor the cuttlebone, while hookbills with strong jaws get more from a firm block. Neither replaces a balanced diet, but both cover chewing and mineral instincts cheaply.',
      },
      {
        question: 'How often should a mineral block be replaced?',
        answer:
          'Replace blocks when they look stale, dusty, heavily gouged, or fouled by droppings, which for a dedicated chewer can mean monthly and for an indifferent bird can mean rarely. A block that sits untouched for months is doing nothing, so relocate it beside a busier perch. Stock that crumbles or yellows with age is past its best.',
      },
      {
        question: 'Can a bird get too much calcium?',
        answer:
          'Healthy birds on a varied diet generally self-regulate chewable calcium sources, nibbling when needed and ignoring the rest. Trouble is more plausible with concentrated powdered or liquid supplementation layered onto an already complete diet, especially for birds with kidney concerns. If you feel the need to supplement heavily, let a veterinarian experienced with birds make that call first.',
      },
      {
        question: 'My bird ignores the cuttlebone. Should I worry?',
        answer:
          'Often it simply means the diet already covers the need, particularly for pellet-fed birds. Try relocating it beside the favorite perch, angling the soft edge toward the bird, or rubbing a little millet dust on the edge as invitation. Continued total disinterest alongside a seed-heavy diet is worth mentioning at the next avian checkup.',
      },
      {
        question: 'When does a laying hen need calcium beyond a cuttlebone?',
        answer:
          'When laying is frequent, when shells turn thin, or when a hen eats her own eggs, demand has outrun the standard offering. Add dark greens and egg food, and keep chewable calcium mounted permanently. For hens laying clutch after clutch, the priority is a vet conversation about stopping the cycle, not a shelf conversation about feeding it.',
      },
    ],
  },

  // =========================================================================
  // BIRD/PERCHES — foot health, diameters, materials, placement
  // =========================================================================
  'bird/perches': {
    heroTitle: 'Bird Perches: Diameter Variety for Healthy Feet',
    heroSubheadline:
      "A bird's feet are the most-used equipment it owns. Varied perch diameters, safe materials, and deliberate placement keep them strong for a lifetime of gripping.",
    metaDescription:
      'Bird perch guide: why uniform dowels cause foot trouble, diameter ranges by species, how concrete perches wear nails, and where perches belong in the cage.',
    introSummary:
      'Every starter cage ships with a set of identical wooden dowels, and those dowels quietly do more foot damage than any single wrong purchase. A foot gripping one unchanging diameter rests the same joints in the same positions, day after day, while wild birds meet twigs, branches, and rough bark, so the work always changes and the foot stays strong. Rebuilding that variety inside a cage is the entire job of perch shopping, and it costs less than almost anything else you will buy the bird.',
    sections: [
      {
        id: 'feet-built-for-variety',
        title: 'Feet Built for Branch Variety',
        content:
          'A parrot foot is a precision gripping instrument with opposing toes built to lock around branches, and it stays healthy only when the work varies. Constant identical gripping concentrates pressure on the same pads, which is how pressure sores and bumblefoot-type irritation get started in cage birds. Variety is the treatment and the prevention: rotating diameters flexes different tendon groups, varying textures changes blood flow under the skin, and different widths let foot muscles fully open and close through the day. Think of each perch as a different repetition in a workout, not a different decoration.',
        tips: [
          'Replace at least one stock dowel with a natural-branch perch this week.',
          'Aim for three distinct diameters across the cage, never one uniform size.',
          'Check foot pads monthly for red pressure spots or early sores.',
        ],
      },
      {
        id: 'diameter-changes-grip',
        title: 'Diameter Variety That Changes Grip',
        content:
          'Diameter is the variable most cages get wrong, so start shopping with measurements rather than photos. The comfortable range differs sharply by species: a macaw on a budgie perch is balancing on a tightrope, while a budgie on a macaw perch cannot wrap its toes at all. The ranges below are the widely kept starting points; keep a couple of sizes in play at once, and watch how your bird sleeps to find its favorite.',
        tableData: {
          headers: ['Species', 'Comfortable diameter', 'Why it fits'],
          rows: [
            ['Finches, canaries', '3/8 to 1/2 inch', 'Tiny toes need slender perches to grip securely'],
            ['Budgies, lovebirds, parrotlets', '1/2 to 3/4 inch', 'The classic small-hookbill gripping range'],
            ['Cockatiels, rosellas', '5/8 to 1 inch', 'Medium feet handle mixed widths happily'],
            ['Conures, caiques, pionus', '3/4 to 1 inch', 'Grip strength likes a slightly fuller branch'],
            ['African greys, amazons', '1 to 1 1/4 inch', 'Heavier bodies want steady, fuller footing'],
            ['Macaws, large cockatoos', '1 1/4 to 2 inches', 'Big feet need real branches, not twigs'],
          ],
        },
        tips: [
          'Keep two or three diameters installed at once for genuine grip variety.',
          'Watch the sleeping perch; the favorite diameter usually wins that spot.',
          'Check perch listings for stated diameters, since photos hide scale.',
        ],
      },
      {
        id: 'concrete-nail-stations',
        title: 'Concrete Perches as Nail Stations',
        content:
          'A rough concrete or pumice perch does genuine grooming work: as the bird lands and shifts, the abrasive surface files nails and conditions pad skin. The trick is treating it as a station, not a home base. Position one where the bird stands longest, commonly beside the food dishes, and keep the rest of the perches gentle. A bird parked on abrasive footing around the clock develops sore feet, which defeats the whole purchase. Also skip old-style sandpaper sleeve covers, which are harsher than fixed concrete and shred pads rather than polish them.',
        callout: {
          type: 'warning',
          title: 'One rough perch, placed well',
          text: "A concrete perch beside the dishes files nails during the day's longest standing sessions. Two or three of them, or a sandpaper sleeve on every dowel, grinds pads raw; keep abrasive surfaces a minority of the perching real estate.",
        },
        tips: [
          'Station one rough perch by the dishes where standing time is longest.',
          'Keep every other perch gentle so abrasive time stays a small fraction.',
          'Retire sandpaper sleeve covers entirely; fixed concrete is kinder and safer.',
        ],
      },
      {
        id: 'wood-rope-materials',
        title: 'Wood, Rope, and Everything Else',
        content:
          'Materials each carry a personality. Natural wood branches, manzanita, java, apple, and similar hardwoods, offer irregular surfaces, edible chewing value, and honest durability, which is why experienced keepers buy them first. Rope perches and rope spirals flex and cushion aging or arthritic feet, but they fray, and a frayed loop can snare a toenail. Plastic is easy to sanitize but too smooth to exercise a foot and too brittle for serious chewers. Edible calcium perches double as mineral sources, a nice two-for-one for hens. Blend three materials at a time, and inspect all of them weekly.',
        tips: [
          'Anchor the setup with one hardwood branch perch for chewing and durability.',
          'Trim or retire rope perches the week snagged loops appear.',
          'Rotate a calcium perch in for hens and heavy chewers as a mineral bonus.',
        ],
      },
      {
        id: 'placement-logic',
        title: 'Placement Logic Inside the Cage',
        content:
          'Placement decides which perch wins the sleeping spot, the eating marathon, and the daytime watching post, because birds always claim the highest safe point for sleep. Install the most comfortable perch high and toward a wall side, put a grooming station by the dishes, and leave the mid-levels for hopping and play. Keep clear horizontal runs between perch tips so flight inside the cage stays possible, and offset each perch so droppings fall past the one below, not onto it. Nothing belongs directly above a dish, a mirror, or another perch\'s favorite end.',
        tips: [
          'Reserve the highest comfortable perch for sleeping and keep it wall-side.',
          'Stagger perches so droppings miss whatever sits below them.',
          'Leave open flight lanes between perch tips before adding anything else.',
        ],
      },
      {
        id: 'rotation-and-wear',
        title: 'Rotation and Wear Over Years',
        content:
          'Perches are consumables, and pretending otherwise is how cages end up with slippery, gouged, decade-old dowels. Wood slowly polishes smooth under daily feet, rope collects dust and frays, and concrete wears unevenly into a saddle. Every few months, rearrange positions and swap in something different, which refreshes both the feet and the bird\'s interest in its territory. Scrub wooden perches with hot water and a stiff brush at cleaning time, dry them fully, and retire anything chewed to a splinter or polished to glass. When you compare replacement options, the same variety rules apply all over again.',
        tips: [
          'Rearrange perch positions every few months to refresh footwork and interest.',
          'Scrub wood with hot water and a stiff brush, then dry fully.',
          'Retire anything splintered, slick-polished, or frayed beyond trimming.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Vary the grip',
        items: [
          { highlight: 'Three diameters minimum', text: 'rotating widths exercises different tendon groups all day.' },
          { highlight: 'Dowels are the trap', text: 'identical smooth bars concentrate pressure on the same pads.' },
          { highlight: 'Sleeping spot reveals favorites', text: 'the perch your bird claims overnight is its preferred size.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Materials and safety',
        items: [
          { highlight: 'Hardwood leads the setup', text: 'irregular, chewable, and durable for years of use.' },
          { highlight: 'Rope needs fraying checks', text: 'a single snagged loop can trap a panicking toenail.' },
          { highlight: 'Rough perches as stations', text: 'one abrasive station by the dishes, gentle footing everywhere else.' },
        ],
      },
      {
        icon: 'map-pin',
        title: 'Placement logic',
        items: [
          { highlight: 'Highest perch sleeps best', text: 'birds claim the top safe point for the night.' },
          { highlight: 'Offset beats stacking', text: 'droppings fall past lower perches, not onto them.' },
          { highlight: 'Keep flight lanes open', text: 'clear horizontal runs between tips let wings work.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How many perches should a bird cage have?',
        answer:
          'Three or four suits most mid-size cages: a comfortable sleeping perch high up, a grooming station by the dishes, and one or two varied mid-level hops. More perches usually means blocked flight lanes and crowded airways, which costs more than the extra variety pays. Spacing and staggering matter more than the count itself.',
      },
      {
        question: "Are concrete perches bad for birds' feet?",
        answer:
          'Used wrong, yes; used sparingly, they excel. A single concrete or pumice perch stationed where the bird stands longest files nails naturally and conditions the pads. Problems arrive when abrasive perches dominate the cage or sandpaper sleeves cover every dowel, grinding pads raw. Keep rough surfaces a minority.',
      },
      {
        question: 'What size perch does a cockatiel need?',
        answer:
          'Cockatiels grip happily across roughly five-eighths of an inch to a full inch, so keep several sizes in that band installed at once. Watch where the bird settles overnight; that perch marks the favorite. A too-thick perch forces toes flat, and a too-thin one overworks the grip.',
      },
      {
        question: 'How do I clean wooden bird perches?',
        answer:
          'A stiff brush and hot water at cage-cleaning time does the job; scrub, rinse, and dry fully before anything goes back in, since damp wood invites mold. Skip harsh chemical soaks, because residue survives rinsing better than you would guess. Deeply gouged or chewed perches that trap grime are retirement candidates rather than endless scrubbing projects.',
      },
      {
        question: 'Can I use branches from outside as perches?',
        answer:
          'Some keepers do, with care: use only unsprayed, unpolluted wood from safe species like apple or willow, scrub it, and bake it at a low oven temperature to reduce hitchhikers. The risks are pesticide drift, roadside pollution, and misidentified species, which is why store-bought hardwoods are the safer default. If you love the foraged look, source carefully.',
      },
    ],
  },

  // =========================================================================
  // BIRD/BIRD-SUPPLEMENTS — the honest supplement aisle
  // =========================================================================
  'bird/bird-supplements': {
    heroTitle: "The Honest Bird Supplements Aisle: What Helps, What Doesn't",
    heroSubheadline:
      'Most supplements sell answers to problems a good diet already solved. Learn what a balanced feeder genuinely needs, what molting and laying birds do need, and how to read labels without panic.',
    metaDescription:
      'Bird supplement honesty: what balanced diets cover, why vitamin water drops disappoint, molting conditioning foods, and when a vet should decide instead.',
    introSummary:
      'There is a drawer in many bird homes that opens with a rattle: half a vitamin jar, calcium drops, a molt conditioner, something for feathers bought in optimism. Almost all of it dates from a seed-only era, when supplements genuinely papered over a deficient diet. A bird eating formulated pellets plus fresh foods already receives a vitamin and mineral baseline, and layering more on top can drift from harmless to genuinely unwise. The honest supplement shelf is short, situation-specific, and usually follows a conversation rather than replaces one.',
    sections: [
      {
        id: 'balanced-diets-cover',
        title: 'What Balanced Diets Already Cover',
        content:
          'A formulated pellet does the heavy lifting that supplements are sold for, carrying vitamins and minerals in measured amounts with every bite. Once pellets anchor the bowl and fresh vegetables rotate through it, the standard baseline, vitamin A, D3, calcium in sensible balance, is largely covered by design. Adding a general multivitamin on top mostly manufactures expensive urine-equivalent and can push fat-soluble vitamins toward accumulation, since A, D, E, and K store in the body rather than flush away. The supplement bottle makes sense for the gap you can name, not as insurance against a gap you imagine.',
        tips: [
          'Name the specific gap before any supplement enters the cage.',
          'Remember fat-soluble vitamins accumulate rather than flush away daily.',
          'Treat a pellet-plus-fresh diet as the baseline already working.',
        ],
      },
      {
        id: 'trouble-water-drops',
        title: 'The Trouble With Water Drops',
        content:
          'Vitamin drops dosed into drinking water are the format most likely to disappoint. Vitamins begin degrading in water within hours, light and warmth accelerate the loss, and the odd taste can push a bird toward drinking less, which is its own quiet hazard. A water dish with sweetened vitamins sitting in warm evening air is also a bacterial incubator by morning. Powders or liquids applied to moist fresh food stick around longer, get consumed promptly, and let you see exactly how much was eaten. If a supplement is genuinely needed, deliver it on food, not in the bottle.',
        tips: [
          'Dose needed supplements onto moist food instead of drinking water.',
          'Change vitamin-treated water within hours if you must use it.',
          'Watch drinking volumes for dips after adding anything to water.',
        ],
      },
      {
        id: 'conditioning-molting',
        title: 'Conditioning Foods for Molting',
        content:
          'Molting is honest work, hundreds of new feathers built mostly from protein, and it raises a bird\'s nutritional demand for the weeks it lasts. Conditioning and egg-food products answer that demand with concentrated protein, and small softbills like canaries and finches benefit visibly during molt and breeding season. For a parrot already eating pellets plus varied fresh food, a modest scoop of conditioning food or extra egg food during the molt is sensible, not heroic. The rest of the year it mostly adds calories. Time these products to the molt window you can see, ragged pin feathers and constant preening, rather than feeding them on faith.',
        callout: {
          type: 'pro-tip',
          title: 'Follow the pin feathers',
          text: "Start conditioning food when pin feathers appear across the head and neck, and taper it off when preening slows and plumage settles. The bird's own molt calendar is a better scheduler than any printed feeding chart.",
        },
        tips: [
          'Offer egg food or conditioners while pin feathers are actively emerging.',
          'Taper conditioning foods once plumage settles and preening slows.',
          'Give canaries and finches conditioning support through molt and breeding.',
        ],
      },
      {
        id: 'supplement-honestly-earned',
        title: 'When a Supplement Is Honestly Earned',
        content:
          'A short list of situations genuinely earns the supplement shelf. A diagnosed deficiency, often vitamin A in long-term seed eaters, calls for treatment-level dosing a veterinarian directs. A bird still mid-conversion from seed to pellets has a real coverage gap worth bridging. Laying hens may need calcium beyond chewables, which deserves professional input since chronic laying is its own problem. And a bird recovering from illness or surgery sometimes needs targeted support. Notice the pattern: every legitimate entry on this list starts with a diagnosis or a defined transition, not a hunch.',
        tips: [
          'Let a diagnosis, not a hunch, start any supplementation program.',
          'Bridge the gap for birds still converting between seed and pellets.',
          'Route laying-hen calcium decisions through a vet who knows birds.',
        ],
      },
      {
        id: 'reading-labels',
        title: 'Reading Labels Without the Panic',
        content:
          'Supplement labels speak in promises, feather glory, vibrant health, immunity shields, so read past the front for the substance. Look for species-specific formulation, since a parrot and a canary run on different scales; stated concentrations rather than proprietary blend vagueness; and expiry dating, because vitamins genuinely expire. Powders generally hold potency longer than liquids. As you compare supplement listings, favor the plainly stated over the dramatically promised, and apply the same skepticism you would bring to any health claim on a shelf, ours included.',
        tips: [
          'Prefer labels stating real concentrations over proprietary-blend vagueness.',
          'Match the supplement to the species; a canary is not a macaw.',
          'Check expiry dates, since vitamins fade long before jars look empty.',
        ],
      },
      {
        id: 'vet-before-shelf',
        title: 'The Vet Before the Shelf',
        content:
          'The uncomfortable truth about the supplement aisle is that it mostly sells to worry, and worry is a poor diagnostician. Dull feathers, lethargy, appetite shifts, and odd droppings are symptoms with long differential lists, and a bottle chosen by guesswork can mask the signal while the cause keeps working. A veterinarian experienced with birds can run the basic workup, bloods and a gram stain are routine in avian practice, and turn a hunch into a plan. Buy the supplement after the conversation, never instead of it, and the drawer stops rattling.',
        callout: {
          type: 'vet-note',
          title: 'Symptoms are not ingredient lists',
          text: 'Dull plumage, low energy, or changed droppings deserve a diagnosis from a veterinarian experienced with birds before anything is dosed. Supplements support plans; they do not write them.',
        },
        tips: [
          'Book the exam before the bottle when symptoms, not gaps, appear.',
          'Ask which avian diagnostics are routine before assuming none exist.',
          'Recheck any long-term supplement plan with the vet each year.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Diet does the work',
        items: [
          { highlight: 'Pellets carry the baseline', text: 'measured vitamins and minerals arrive with every single bite.' },
          { highlight: 'More is not insurance', text: 'fat-soluble vitamins accumulate in the body instead of flushing.' },
          { highlight: 'Name the gap first', text: 'supplements exist for defined needs, never imagined ones.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Timing matters',
        items: [
          { highlight: 'Molt raises the demand', text: 'offer conditioning and egg foods while pin feathers grow.' },
          { highlight: 'Taper when plumage settles', text: 'fed year-round, conditioning foods mostly add spare calories.' },
          { highlight: 'On food, not in water', text: 'vitamins degrade in water and can dull drinking.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Vet before shelf',
        items: [
          { highlight: 'Symptoms want diagnoses', text: 'a guesswork bottle can quietly mask the real cause.' },
          { highlight: 'Avian workups are routine', text: 'bloodwork and gram stains turn hunches into plans.' },
          { highlight: 'Buy after the conversation', text: 'the drawer stops rattling when dosing has reasons.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Do birds eating pellets need vitamin supplements?',
        answer:
          'Usually not, and that is the point of pellets: they carry a formulated vitamin and mineral baseline in every bite. Adding a general multivitamin on top risks oversupplying fat-soluble vitamins, which store in body tissues rather than flushing out. Save supplements for named gaps, like a diagnosed deficiency or a diet still mid-conversion.',
      },
      {
        question: 'Are vitamin drops in water a good idea?',
        answer:
          'Rarely. Vitamins start breaking down in water within hours, warmth and light speed the loss, and the taste can discourage drinking, which is its own risk. A sweetened vitamin dish also grows bacteria quickly. If a vet has prescribed something liquid, dose it on moist fresh food, where it survives longer and intake is visible.',
      },
      {
        question: 'What supplements help a molting bird?',
        answer:
          'Protein-led conditioning foods and egg food genuinely help during an active molt, because feathers are built largely from protein and the demand rises visibly. Offer them while pin feathers are emerging and taper when plumage settles. A bird already eating pellets and varied fresh food needs modest amounts; heavy year-round dosing mostly adds calories.',
      },
      {
        question: 'Can you give a bird too many vitamins?',
        answer:
          'Yes, particularly the fat-soluble group, vitamins A, D, E, and K, which the body stores instead of excreting freely. Chronic oversupplementation can cause real organ stress, which is why treatment-level dosing belongs with a veterinarian experienced with birds. Water-soluble vitamins flush more readily, but overdosing them is still wasted money rather than a bonus.',
      },
      {
        question: 'When does a laying hen need a calcium supplement?',
        answer:
          'When chewable calcium cannot keep pace, typically with frequent laying, thin or easily cracked shells, or a hen eating her own eggs. Add dark greens and egg food alongside the cuttlebone, and have a veterinarian experienced with birds assess the laying pattern itself, because stopping chronic laying matters more than feeding it.',
      },
    ],
  },

  // =========================================================================
  // BIRD/BIRD-TOYS — the psychology of play
  // =========================================================================
  'bird/bird-toys': {
    heroTitle: 'Bird Toys That Work the Mind, Not Just the Beak',
    heroSubheadline:
      'A busy bird is a happy bird, and busy means foraging, shredding, and solving. Learn what toys genuinely entertain, how to rotate them, and which parts to distrust.',
    metaDescription:
      'Bird toy psychology: foraging as real entertainment, shredders and preening materials, rotation against boredom, and safety checks for zinc and strings.',
    introSummary:
      'Wild parrots spend most of every day doing one unglamorous thing: finding food. The searching, extracting, and husking occupies hours, and a pet bird handed a full dish twice daily inherits that working energy with nowhere to spend it. The result is usually noise, feather fussing, or a doorframe carved into confetti. Toys are not decorations; they are the job description you write for an animal built to work. The best ones make the bird solve, shred, or preen for a living, and choosing them well is mostly psychology.',
    sections: [
      {
        id: 'foraging-real-show',
        title: 'Foraging Is the Real Show',
        content:
          'Foraging toys answer the time-budget problem directly: they make food cost effort again. A treat buried in a cup of shredded paper, a pellet hidden inside a woven palm basket, or seeds tucked into a cardboard tube turn a thirty-second meal into an hour of honest work. That hour is the healthiest thing a captive bird can spend, mentally and physically. Start simple, a paper wrap around a favorite snack, and build toward puzzles that require sliding, pulling, or unscrewing. Every foraging minute is a minute not spent screaming, plucking, or remodeling your furniture.',
        tips: [
          'Wrap a favorite treat in paper as the easiest first foraging step.',
          'Hide pellets inside woven baskets or cardboard tubes for daily work.',
          'Graduate to sliding and unscrewing puzzles once basics are solved.',
        ],
      },
      {
        id: 'shredders-preening',
        title: 'Shredders and Preening Materials',
        content:
          'Destruction is a legitimate need, not misbehavior. Shreddable toys, palm leaf, yucca, vine balls, paper streamers, soft pine blocks, give the beak the demolition work it craves at a safe price. Preening materials serve a subtler purpose: cotton or sisal strips that the bird can pick and pull through its fingers redirect grooming urges, which keepers find especially valuable for birds that overpreen their own feathers. Match material hardness to species, soft woods and papery weaves for budgies, hardwood chunks and thick leather for macaws, and the toy survives exactly as long as it should.',
        tips: [
          'Stock shreddables sized to species, from paper weaves to hardwood blocks.',
          'Offer preening materials to birds that fuss too much over feathers.',
          'Replace shredders when demolished; destruction is success, not waste.',
        ],
      },
      {
        id: 'novelty-psychological-need',
        title: 'Novelty as a Psychological Need',
        content:
          'Boredom in birds looks like a toy untouched for months while the owner keeps buying. The fix is rotation with intent: keep a few toys in the cage and the rest in a box, swapping every week or two so familiar objects keep returning as surprises. Relocation is free novelty, since a toy moved to a new corner reads as half-new. Watch the difference between a toy being ignored and a bird being bored: the bored bird ignores everything at once. When interest dies across the whole cage, rotate everything, not just one item.',
        callout: {
          type: 'pro-tip',
          title: 'The toy library',
          text: 'Keep a lidded box as the toy library and check items out a few at a time. Toys resting for weeks return with fresh appeal, and a rotating cast of six or eight items feels like a collection three times its size.',
        },
        tips: [
          'Rotate the few cage toys weekly rather than accumulating all at once.',
          'Relocate an ignored toy to a new corner before buying its replacement.',
          'Refresh every toy at once when boredom blankets the whole selection.',
        ],
      },
      {
        id: 'fear-of-new-toys',
        title: 'Fear of New Toys',
        content:
          'Birds are prey animals, and a strange object hanging where food used to be can read as a predator. The classic failure is a wonderful toy installed with ceremony and then hated forever. Introduce new toys outside the cage first, at a distance, laid on a table during playtime. Play with the toy yourself, since parrots learn by watching the flock investigate things safely. Move it closer over days, then attach it low and unobtrusive, and finally relocate it to the good spot once curiosity wins. Patience converts fear into a favorite.',
        tips: [
          'Stage new toys outside the cage before they ever hang inside it.',
          'Let your bird watch you handle the toy; parrots copy safe flock behavior.',
          'Hang newcomers low and neutral, then promote them once accepted.',
        ],
      },
      {
        id: 'matching-toys-beak',
        title: 'Matching Toys to the Beak',
        content:
          'A toy built for the wrong beak is either dangerous or boring. Budgies and cockatiels want light materials, small bells, shreddable weaves, and millet-holders they can boss around, while anything with big gaps or heavy hardware just gets ignored. Conures want foot toys and destructibles they can wreck in an afternoon. Large parrots want problems: hardwood, knots, nuts to unscrew, chain they cannot snap, because a macaw that finishes its toy in ten minutes was sold a budgie\'s project. As you compare toy listings, weight and material tell you more than the photo does.',
        tips: [
          'Match toy scale to beak power; heavy hardware bores small birds.',
          'Keep foot toys in stock for conure-sized parrots that play handheld.',
          'Give large parrots solvable problems, not instant-wreck soft toys.',
        ],
      },
      {
        id: 'safety-check-parts',
        title: 'The Safety Check on Every Part',
        content:
          'Every toy is hardware, rope, and chewable material, and each category fails differently. Zinc-plated chains and cheap quick links are the quiet classic, since zinc is toxic to parrots who chew it slowly; nickel-plated or stainless hardware is the safer standard. Strings and ropes become strangulation and toe-snag hazards once frayed, so trim fibers and retire looped cord before loops form. Bells with clappers small enough to remove, split key rings, and brittle plastic that shatters into sharp shards all belong on the reject pile. Run this check in the store and again at every rotation.',
        callout: {
          type: 'warning',
          title: 'Zinc and string are the two killers',
          text: 'Galvanized or zinc-plated hardware poisons chewing parrots over months, and a frayed rope loop can snare a toe or neck in seconds. When a listing does not state nickel or stainless hardware, assume it is not, and swap the hardware yourself.',
        },
        tips: [
          'Swap unknown quick links for nickel-plated or stainless ones immediately.',
          'Trim frayed rope ends and retire any cord that forms loops.',
          'Reject bells with removable clappers and shatter-prone brittle plastic.',
        ],
      },
      {
        id: 'toys-as-consumables',
        title: 'Toys as Consumables, Not Keepsakes',
        content:
          'A destroyed toy is a toy that did its job, and budgeting for that reality changes how you shop. The elegant hardwood carousel that survives a year is the exception; the vine ball that dies in a weekend is the norm, and both are successes. Think in terms of a monthly toy spend and destroyed volume rather than one perfect purchase. Multipacks of shreddables, refillable foraging holders, and replaceable inserts keep the running cost sane. As you compare options, price per hour of occupation beats price per object, and your bird\'s floor tells you which items earn reorders.',
        tips: [
          'Budget for toys as consumables with a monthly allowance, not heirlooms.',
          'Compare shreddables in multipacks; per-piece cost usually drops sharply.',
          'Track which destroyed toys earned a reorder and which did not.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'sparkles',
        title: 'Foraging first',
        items: [
          { highlight: 'Make food cost effort', text: 'hidden treats turn a meal into an hour.' },
          { highlight: 'Start with paper wraps', text: 'graduated puzzles can come later, once basics click.' },
          { highlight: 'Busy beats decorated', text: 'an occupied beak leaves doorframes and feathers alone.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Part safety',
        items: [
          { highlight: 'Nickel or stainless hardware', text: 'zinc-plated chain and cheap links poison patient chewers.' },
          { highlight: 'Trim frayed fibers', text: 'loops snare toes and necks faster than you notice.' },
          { highlight: 'Reject small clappers', text: 'removable bell parts and split rings invite swallowing.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Rotation rhythm',
        items: [
          { highlight: 'A library, not a pile', text: 'six rotating toys can feel like dozens over time.' },
          { highlight: 'Fear fades with staging', text: 'new toys enter slowly, outside the cage first.' },
          { highlight: 'Destruction is success', text: 'budget monthly and let the shreddables die proud.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'What toys do budgies and cockatiels actually like?',
        answer:
          'Light and destructible wins with small hookbills: shreddable vine and palm weaves, paper streamers, small bells they can ring loudly, and simple foraging wraps around millet. Mirrors entertain some individuals but can feed over-attachment in a single bonded bird. Rotate a few at a time and let the floor tell you which formats get demolished versus ignored.',
      },
      {
        question: 'Why is my parrot scared of new toys?',
        answer:
          'Because it is a prey animal meeting an unfamiliar object, often in the exact spot where safety and food live. Introduce toys outside the cage at a distance, handle them yourself so the bird watches a flock member investigate safely, and move them closer over days. Most fearful birds accept a patient introduction within a week or two.',
      },
      {
        question: "How often should I rotate my bird's toys?",
        answer:
          'Every week or two keeps most birds engaged, with a full-cage shuffle when interest dies everywhere at once. Rotation means a few out and a few in, not everything replaced, so favorites can stay while the background changes. Watch for the bored-bird signature: ignoring the entire toy selection simultaneously rather than one tired item.',
      },
      {
        question: 'Are toys with bells and mirrors safe for birds?',
        answer:
          'Bells are fine when the clapper cannot be removed and swallowed, which rules out the cheapest jingle styles. Mirrors suit finches and canaries more than parrots; for a single bonded parrot, a mirror can intensify an already-fixated relationship and sometimes escalate to hormonal behavior. Neither belongs in a cage without a weekly fraying-and-loose-parts check.',
      },
      {
        question: 'How much should I spend on bird toys?',
        answer:
          'Think monthly allowance rather than single splurges, because shreddables are consumables and destruction is the goal. Budget across formats: cheap vine balls that die weekly, mid-range foraging holders with refills, and the occasional durable hardwood piece for determined chewers. Per hour of occupied bird, inexpensive destructibles usually beat expensive survivors.',
      },
    ],
  },

  // =========================================================================
  // BIRD/BIRD-TREATS — treats as training currency
  // =========================================================================
  'bird/bird-treats': {
    heroTitle: 'Millet, Nuts, and the Ten Percent Rule for Bird Treats',
    heroSubheadline:
      'Treats are how you pay a bird for learning, not how you feed it. Get the currency, the sizing, and the portion math right and training becomes easy.',
    metaDescription:
      'Bird treats as wages: millet as training currency for small birds, nuts and fruit sized by species, and the ten percent rule that keeps trainees healthy.',
    introSummary:
      'Anyone who has taught a budgie to step up knows the moment the treat appears and the bird suddenly finds cooperation interesting. That is the entire theory of bird treats: they are wages, and wages only work when they are rare, small, and worth working for. A parrot with unlimited millet has nothing left to earn, and a hen fed fruit all afternoon is filling up on unbilled sugar. Handled with intent, a modest treat budget buys you recall, step-ups, and a bird that thinks you are worth listening to.',
    sections: [
      {
        id: 'currency-not-snacks',
        title: 'Currency, Not Just Snacks',
        content:
          'A treat and a food are different instruments. Food arrives free in the bowl; a treat is earned, and that distinction is what gives it power. Reserve two or three items exclusively as currency, never in the everyday bowl, so they stay valuable by scarcity. The moment a treat becomes freely available, your bird has been given a raise it did not work for, and motivation quietly evaporates. Keep the currency jar separate from the food bin, and the sight of you reaching for it becomes news the bird wants to hear.',
        tips: [
          'Reserve favorite items as currency and never bowl-feed them again.',
          'Store treats apart from staple food so scarcity stays believable.',
          'Reach for the treat jar visibly; anticipation sharpens the lesson.',
        ],
      },
      {
        id: 'millet-rightful-job',
        title: 'Millet Doing Its Rightful Job',
        content:
          'A spray of millet is nearly perfect currency for budgies, cockatiels, and other small hookbills: instantly recognizable, easy to meter, and adored with an intensity that never fades. Meter it by the sprig, a few inches for a session, and hold the spray so the bird steps toward you to earn each bite. That intensity is also the trap, because millet is essentially candy with seed attached, and a bird with standing access stops working entirely. For species that shrug at millet, the same logic transfers to whatever they adore, from sunflower hearts to tiny nut pieces.',
        tips: [
          'Ration millet by the inch; a session needs less than you think.',
          'Hold the spray so stepping toward you earns each bite.',
          'Swap in sunflower hearts for small birds that ignore millet.',
        ],
      },
      {
        id: 'sizing-treats-species',
        title: 'Sizing Treats to the Bird',
        content:
          'Treat size is where budgets die quietly. A single almond is a sensible wage for a macaw and a full day\'s extravagance for a conure, while a sunflower heart is invisible currency to a large parrot and a fair paycheck for a budgie. Nuts carry real fat and calories, so the bigger the bird, the more seriously the arithmetic applies. Dried fruit concentrates sugar and sticks to beaks, and fresh fruit pieces mostly water still count. Break treats into the smallest piece a bird will still work for, and wages stop competing with dinner.',
        callout: {
          type: 'warning',
          title: 'Never from the human table',
          text: 'Chocolate, avocado, caffeine, alcohol, and salty snacks are hazardous for birds, and sugary baked goods do no favors either. If a housemate wants to share, route the generosity through bird-safe treats you chose, not table scraps.',
        },
        tips: [
          'Break nuts into quarters before a session so wages stay small.',
          'Treat dried fruit like concentrated candy, not like fresh produce.',
          'Size every reward to the smallest piece still worth working for.',
        ],
      },
      {
        id: 'training-paychecks-fast',
        title: 'Training Paychecks, Delivered Fast',
        content:
          'Wages only teach when they arrive within a second or two of the behavior, so keep treats within reach and delivery rehearsed. Pair each payment with a consistent word or click so the marker itself starts to mean money is coming, which lets you reward from across the room. End sessions while the bird is still eager, five or ten minutes, because a bored student learns nothing and an overfed one forgets why it bothered. Rank your treats in advance, everyday, high-value, legendary, and reserve the top tier for the hardest recalls.',
        tips: [
          'Pay within a second of the behavior or the lesson dissolves.',
          'Charge one marker word so rewards can be promised from afar.',
          'Stop sessions early, while enthusiasm is still visibly high.',
        ],
      },
      {
        id: 'tenth-calories-honesty',
        title: 'The Ten Percent Honesty',
        content:
          'The veterinary rule of thumb travels across species: extras should stay near ten percent of daily calories, with the complete diet providing the rest. For a bird, that ceiling is brutally small, a budgie\'s entire daily treat allowance fits in a pinch of fingers, so counting matters more than for a Lab with biscuits. Vegetables barely dent the budget and make generous training rewards for birds that accept them; fruit counts fully. Watch the body condition monthly, because seed-eating species gain weight cheerfully and silently, and adjust the wage scale before the scale adjusts the bird.',
        tips: [
          'Cap all extras near a tenth of daily calories, treats included.',
          'Use vegetable pieces as low-cost rewards whenever the bird accepts them.',
          'Check body condition monthly; bird weight gain is quiet work.',
        ],
      },
      {
        id: 'reading-treat-aisle',
        title: 'Reading the Treat Aisle Honestly',
        content:
          'The treat shelf sells a lot of decoration. Honey-seed sticks and millet ornaments glued with syrup are candy in party dress, fine as occasional currency and terrible as everyday fare. Compare options by what is actually inside: single-ingredient items like millet, plain nuts, or freeze-dried fruit are easy to price and meter, while blends hide sugar and fat behind cheerful packaging. Training-specific treats, sized small and swallowable, earn their shelf space by fitting the paycheck model. As you browse bird treat listings, the ingredient list and piece size tell you the true cost of a reward.',
        tips: [
          'Read treat ingredient lists before trusting cheerful package art.',
          'Treat honey-seed sticks as candy for rare occasions, not staples.',
          'Favor single-ingredient treats you can meter precisely by piece.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'award',
        title: 'Treats as wages',
        items: [
          { highlight: 'Scarcity keeps value', text: 'currency items never appear free in the bowl.' },
          { highlight: 'Pay fast and small', text: 'rewards land within a second of the behavior.' },
          { highlight: 'Rank the tiers', text: 'legendary treats are saved for the hardest recalls.' },
        ],
      },
      {
        icon: 'check',
        title: 'Size and species',
        items: [
          { highlight: 'Millet fits small hookbills', text: 'budgies and cockatiels will happily work for sprigs.' },
          { highlight: 'Nuts are big money', text: 'a whole almond is a macaw wage, not a conure\'s.' },
          { highlight: 'Break pieces smaller', text: 'the least reward the bird still works for wins.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Portion honesty',
        items: [
          { highlight: 'Near a tenth', text: 'of daily calories, which for birds is tiny.' },
          { highlight: 'Vegetables are cheap wages', text: 'low-calorie rewards that barely dent the daily budget.' },
          { highlight: 'No table scraps', text: 'chocolate, avocado, and salty human food stay away.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How much millet can a budgie have per day?',
        answer:
          'Think a few inches of sprig per day at most, and less for a budgie carrying extra weight, because millet is energy-dense and adored. Use it as wages for training steps rather than a bowl filler, and break sprigs into short sections so one purchase meters out for weeks. An all-you-can-peck spray is a candy buffet.',
      },
      {
        question: 'What treats work best for training a parrot?',
        answer:
          'Small, fast, and ranked. Everyday rewards like a piece of pellet or vegetable suit easy skills; higher-value nuts, sunflower hearts, or millet are reserved for distractions and tough recalls. Keep pieces swallowable in one bite so the session keeps moving, and pay within a second of the behavior you want repeated.',
      },
      {
        question: 'Can birds eat fruit every day?',
        answer:
          'A small daily portion is fine for most parrots, sized to species, a grape wedge for a budgie, a slice for a conure. Fruit carries natural sugars that count against the treat budget, so vegetables deserve the larger share of fresh offerings. Dried fruit is concentrated candy and belongs in the wages jar, not the bowl.',
      },
      {
        question: 'Are honey seed sticks healthy for birds?',
        answer:
          'As treats, occasionally yes; as food, no. The sticks are seeds glued with sweet syrup, energy-dense and nutritionally narrow, closer to a candy bar than a meal. Hang one as a weekend foraging challenge, meter the rest of the day\'s treats accordingly, and keep the everyday bowl centered on pellets and fresh foods.',
      },
      {
        question: 'What treats are safe for cockatiels?',
        answer:
          'Millet spray is the classic wage, along with small sunflower hearts, tiny nut fragments, and vegetable bits; a few pellets from the staple bag even work as everyday rewards. Keep each piece smaller than a fingernail so payments stay fast, and hold the syrup-glued sticks for occasional variety. Skip anything salty, sugary, or off your own plate.',
      },
    ],
  },

  // =========================================================================
  // BIRD/WILD-BIRD-FOOD — the backyard shift
  // =========================================================================
  'bird/wild-bird-food': {
    heroTitle: 'Backyard Bird Food: Choosing Seed and Suet by Season',
    heroSubheadline:
      'Feeding backyard birds works when you choose the birds first. Match seed blends to the species you want, place feeders where birds stay safe, and shift with the seasons.',
    metaDescription:
      'Backyard bird feeding: seed blends by the species you want to attract, feeder placement against window strikes and squirrels, and seasonal suet versus seed.',
    introSummary:
      'The first hard frost changes the backyard conversation. Birds that spent summer ignoring your fence suddenly treat the neighborhood as serious hunting ground, and the feeder you hang this week becomes a public utility by December. Feeding wild birds is rewarding and strategic: the food chooses the visitors, the placement decides their safety, and the seasons rewrite both rules. A shelf of seed and suet, planned around the species you actually want, outperforms a random mix bag every winter. Start with the birds, then work backward to the bag.',
    sections: [
      {
        id: 'birds-first-food-second',
        title: 'Choosing Birds First, Food Second',
        content:
          'The quickest route to disappointment is buying whatever blend the store fronts first and hoping the right birds find it. Backyard feeding works in the opposite direction: pick the species you want at the window, then buy the food and feeder that species actually prefers. Cardinals want platform feeding with wide footing, goldfinches want tiny ports and thistle-style seed, woodpeckers want suet against a tree trunk. Every listing you compare becomes easier to judge once the target species sets the requirements. A yard planned this way fills up by intention rather than accident.',
        tips: [
          'Name the three species you most want before browsing any blend.',
          'Match the feeder style to those species, not to the packaging photo.',
          'Let target species requirements judge every listing you compare.',
        ],
      },
      {
        id: 'blends-by-birds',
        title: 'Blends by the Birds You Want',
        content:
          'Each seed type has its devotees, and blends simply combine them, which is why reading the ingredient list matters more than the artwork on the bag. Cheap general mixes lean on filler milo and wheat that most songbirds toss to the ground, so you pay for waste. The table pairs the bird with the food and feeder that reliably brings it. When a blend\'s first ingredient is the seed your target species loves, the price is working for you.',
        tableData: {
          headers: ['Bird you want', 'Food that brings it', 'Feeder that suits it'],
          rows: [
            ['Goldfinches, redpolls', 'Nyjer (thistle) seed', 'Fine-port finch sock or tube'],
            ['Cardinals, grosbeaks', 'Black oil sunflower, safflower', 'Platform or hopper with wide ledges'],
            ['Chickadees, titmice, nuthatches', 'Black oil sunflower, peanuts', 'Hanging tube or peanut mesh'],
            ['Woodpeckers, flickers', 'Suet cakes, peanut butter blends', 'Tail-prop suet feeder on a trunk'],
            ['Doves, juncos, sparrows', 'White millet, cracked corn', 'Ground tray or low platform'],
            ['Orioles, tanagers', 'Orange halves, jelly, nectar', 'Specialty oriole dish feeder'],
          ],
        },
        tips: [
          'Read blend ingredient lists; filler milo and wheat become ground waste.',
          'Stock black oil sunflower first; it carries the broadest appeal.',
          'Add nyjer in a fine-port feeder when goldfinches are the goal.',
        ],
      },
      {
        id: 'placement-windows-cats',
        title: 'Placement Against Windows and Cats',
        content:
          'A feeder in the wrong spot feeds hawks and windows instead of songbirds. Window strikes kill startling numbers of birds, and the standard defenses are distance or closeness: either hang the feeder within about three feet of the glass, too close for a startled bird to reach flying speed, or well beyond thirty feet, outside the danger zone. Situate feeders roughly ten to twelve feet from dense shrubs so birds have escape cover without giving cats a blind ambush. Visibility matters too, because you set this all up to watch.',
        callout: {
          type: 'warning',
          title: 'Feathers on the glass mean relocation',
          text: 'If a bird strikes your window near a feeder, move the feeder immediately, closer to the glass or far away, and add decals or screens to that pane. One strike predicts the next one; placement is the fix that works.',
        },
        tips: [
          'Hang feeders within three feet of windows or well beyond thirty.',
          'Keep dense shrubs close enough for cover, far enough to foil cats.',
          'Position the station where you can actually see and enjoy it.',
        ],
      },
      {
        id: 'squirrel-arms-race',
        title: 'The Squirrel Arms Race',
        content:
          'Squirrels are dedicated, clever, and unemployed, which makes them worthy opponents for any feeder. Placement is the first line: a pole-mounted feeder stands at least ten feet from any tree limb, roofline, or fence a squirrel can jump from, with a baffle below the feeder. Weight-sensitive feeders that close under squirrel heft work well and amuse everyone. Food choice offers quieter victories, since safflower deters most squirrels while cardinals still love it, and hot-pepper-coated seed bothers mammals and not birds. Accept that some loss is rent, not defeat.',
        tips: [
          'Baffle every pole and keep feeders ten feet from launch surfaces.',
          'Try safflower where squirrels bully; cardinals still happily attend.',
          'Consider weight-closing feeders when baffle geometry cannot be solved.',
        ],
      },
      {
        id: 'suet-versus-seed',
        title: 'Suet Versus Seed by Season',
        content:
          'Suet is cold-weather currency, dense fat that helps small bodies hold temperature through winter nights, and woodpeckers, chickadees, nuthatches, and wrens find it irresistible when the ground freezes. Warm weather changes the math: standard suet softens and spoils, so switch to no-melt formulations or pull it entirely until autumn. Seed runs honestly year-round, though summer feeding brings different duties, more cleaning and shade. Spring and fall migration windows reward keeping the station stocked, since traveling birds discover and remember reliable stops.',
        callout: {
          type: 'pro-tip',
          title: 'Suet in the freezer',
          text: 'Buy suet cakes in late autumn when selection is wide, keep the extras sealed in the freezer, and thaw one at a time as the feeder empties. Frozen storage keeps them firm and fresh deep into spring.',
        },
        tips: [
          'Offer suet generously from first frost through early spring.',
          'Switch to no-melt suet or pull it as warm weather arrives.',
          'Keep seed steady through migration windows for passing visitors.',
        ],
      },
      {
        id: 'keeping-station-clean',
        title: 'Keeping the Station Clean',
        content:
          'Crowded feeders are the same as crowded airports: they work until disease travels. Wet, moldy seed at the tray bottom, hulls composting underneath, and a hummingbird-style nectar station left too long all grow problems. Rake or sweep hulls weekly, scrub feeders with hot soapy water and rinse or disinfect with a dilute bleach solution and dry fully every few weeks, and relocate a feeder the moment seed stays wet and clumping. Sick-looking birds at the station mean closing it down entirely for a cleaning spell.',
        tips: [
          'Dump wet or clumping seed the day you notice it, without sentiment.',
          'Scrub feeders every few weeks and dry them fully before refilling.',
          'Sweep spent hulls weekly so the ground under stays healthy.',
        ],
      },
      {
        id: 'reading-ground-waste',
        title: 'Reading the Waste on the Ground',
        content:
          'The ground under a feeder is the most honest review system in backyard birding. Hulls your target species leave mean the good seed is being eaten; intact filler seed piling up means the blend is mostly packaging. Watch which seeds get taken first on a busy morning, and let that order decide the next bag you compare, since local birds have strong regional preferences. Track visitors loosely across seasons and the whole station tunes itself: more sunflower where cardinals dominate, nyjer ports when the goldfinch flock arrives, suet going up the week the first junco appears.',
        tips: [
          'Read the ground weekly; filler left intact means the blend failed.',
          'Note which seeds vanish first and reorder the next bag around them.',
          'Adjust the station by season, not by the calendar of the store aisle.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'map-pin',
        title: 'Choose your visitors',
        items: [
          { highlight: 'Birds pick the blend', text: 'sunflower, nyjer, millet, and suet each recruit differently.' },
          { highlight: 'Feeder style matters', text: 'platforms, tubes, and suet cages serve different bodies.' },
          { highlight: 'Filler is waste', text: 'milo and wheat mostly end up shoveled off the lawn.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Safe placement',
        items: [
          { highlight: 'Three feet or thirty', text: 'windows kill fewer birds at those two distances.' },
          { highlight: 'Cover with a gap', text: 'ten feet or so from shrubs foils most cat ambushes.' },
          { highlight: 'Baffles beat acrobats', text: 'pole distance and guards outlast even clever squirrels.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Seasonal shifts',
        items: [
          { highlight: 'Suet owns winter', text: 'dense fat holds small bodies through frozen nights.' },
          { highlight: 'No-melt for summer', text: 'or pull the suet until autumn returns the chill.' },
          { highlight: 'Clean through the year', text: 'weekly hull sweeps and regular scrubbing keep stations safe.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'What bird seed attracts the most species?',
        answer:
          'Black oil sunflower carries the widest appeal in backyard feeding, thin-shelled, oily, and manageable for beaks from chickadees to cardinals. A tube of it plus a ground tray with millet covers most of a neighborhood\'s list. Specialized eaters still want their own stations, nyjer for finches, suet for woodpeckers, but sunflower is the dependable backbone.',
      },
      {
        question: 'Where should I hang a bird feeder to keep birds safe?',
        answer:
          'Either within about three feet of a window, so startled birds cannot build lethal speed, or beyond thirty feet, outside the strike zone entirely. Keep the station around ten feet from dense shrubs, close enough for escape cover and far enough to deny cats an ambush. Somewhere you can see it from your chair, ideally.',
      },
      {
        question: 'Should I feed wild birds in summer?',
        answer:
          'You can, with adjusted duties. Summer shifts toward seed in shade, no-melt suet, and stricter cleaning, since heat spoils food faster. A steady station earns resident birds that stay nearby, and migration brings its own traffic. If upkeep gets away from you, pause guilt-free; birds forage widely in warm months.',
      },
      {
        question: 'How do I keep squirrels from emptying my feeder?',
        answer:
          'Combine geometry and hardware: pole-mount the feeder ten feet from any jump-off point, fit a baffle below it, and consider a weight-closing feeder for the gymnasts. Safflower deters many squirrels while cardinals keep visiting, and pepper-coated seed bothers mammals without bothering birds. A little spilled corn at a decoy station can also buy peace.',
      },
      {
        question: 'Is suet bad for birds in warm weather?',
        answer:
          'Standard suet softens and can spoil or coat feathers badly in heat, so switch to no-melt blends or remove the cakes until autumn. Rendered no-melt formulations hold their shape through summer and still serve woodpeckers and chickadees. In shoulder seasons, offer suet freely; the fat is most valuable during cold nights and molting.',
      },
      {
        question: 'How often should bird feeders be cleaned?',
        answer:
          'A thorough scrub every few weeks suits most seed feeders, with hot soapy water followed by a full dry, and more often in humid summer weather. Sweep spent hulls from beneath weekly so the ground does not harbor mold. Any feeder where seed stays wet or clumps should be emptied, washed, and dried that same day.',
      },
    ],
  },
};
