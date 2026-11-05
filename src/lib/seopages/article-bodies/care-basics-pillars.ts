// Care-basics pillar articles for Pawzsly U — grooming rhythm at home,
// chew toys, crate sizing, harness fitting, collars, beds by sleep style,
// brushes by coat type, and shampoo by skin type. Eight original blog
// bodies written to the WRITING-SPEC.md contract: on-topic, blog voice,
// at least six sections of authentic prose, marketplace-friendly without
// hard selling.
import type { ArticleBody } from './types';

export const CARE_BASICS_ARTICLES: Record<string, ArticleBody> = {
  // =========================================================================
  // GROOMING-AT-HOME — the rhythm split between home care and salon visits
  // =========================================================================
  'grooming-at-home': {
    heroTitle: 'Building a Home Grooming Rhythm Between Salon Visits',
    heroSubheadline:
      "Most of your dog's coat care can happen on your living room floor, a few minutes at a time. Knowing which jobs stay home keeps salon days calmer and cheaper.",
    metaDescription:
      'A practical split between home grooming and salon visits: brushing, wipe-downs, and nail checks you can own, and the jobs that need a trained groomer.',
    introSummary:
      "There is a version of dog grooming that involves a calendar, a car ride, and a bill. Then there is the version that happens on a Tuesday evening with a brush, a damp cloth, and five honest minutes. Dogs benefit from both, but not equally, because the tasks that keep a coat healthy between appointments are mostly small, frequent, and strangely enjoyable once they become routine. Here is how to split the work sensibly, and how to raise a dog who considers all of it unremarkable.",
    heroImageUrl: '/seopages/images/hero_grooming_dog_1791411047518.jpg',
    heroImageAlt: 'Dog receiving brushing care during a salon grooming session',
    author: { name: 'Brea Stewart', role: 'Certified Dog Groomer' },
    sections: [
      {
        id: 'the-rhythm-argument',
        title: 'Why Rhythm Beats Intensity',
        content:
          "A coat does not get messy all at once; it drifts. Dead hair accumulates a little each day, tangles tighten a little each week, and nails grow a millimeter at a time. Frequency is the whole trick: three minutes of brushing four times a week outperforms one heroic session a month, with less wrestling and less skin irritation. When the baseline maintenance happens at home, the salon visit changes character too, from rescue work to finishing work, which is faster, cheaper, and easier on a dog who arrives mostly maintained.",
        tips: [
          'Brush in short sessions several times weekly rather than one monthly marathon.',
          'Keep tools where the dog naps so sessions start without ceremony.',
          'Note which coat zones tangle first and visit them most often.',
        ],
      },
      {
        id: 'brushing-belongs-home',
        title: 'Brushing Belongs at Home',
        content:
          "Brushing is the single highest-value task you can own, because it works preventively: lifted dead hair cannot mat, and mats prevented never need shaving. The right technique depends on coat type, which is a lesson of its own, but the home principle holds everywhere: brush down to the skin, not just the surface, since a brush gliding over the top of a tangled coat is doing almost nothing. For double-coated dogs, brushing seasonally heavy sheds at home spares the salon the bulk of the work and spares your sofa the rest. As you compare brushes, the listing worth buying names the coat it is built for.",
        tips: [
          'Work the brush to skin level; surface strokes leave undercoat behind.',
          'Follow brushing with your hands to find tangles your eyes missed.',
          'Choose tools by coat type rather than by what the packaging promises.',
        ],
      },
      {
        id: 'wipe-downs',
        title: 'Wipe-Downs Beat Waiting for Baths',
        content:
          "Between baths, a warm damp cloth does quiet work. Wipe the corners of the eyes where debris collects, the folds of a wrinkled face, the lip folds that trap food, and each paw after muddy walks, paying attention to the spaces between toes. Dogs with skin folds particularly benefit, because moisture sitting in a fold invites irritation. A wipe-down also doubles as a daily body scan: your hands travel the whole dog and notice lumps, scabs, ticks, or sore spots long before they become urgent. Keep a box of pet-safe wipes by the door and the habit assembles itself.",
        callout: {
          type: 'vet-note',
          title: 'Hands find what eyes miss',
          text: 'A lump, a scab that will not close, or a sore patch found during a wipe-down deserves a professional look. Check with your veterinarian rather than waiting to see whether the next bath clears it.',
        },
        tips: [
          'Wipe facial folds and lip folds daily on wrinkled breeds.',
          'Check between toes for redness, seeds, or stuck debris after walks.',
          'Let your hands roam the whole dog, ribs to tail, during every wipe-down.',
        ],
      },
      {
        id: 'nail-checks',
        title: 'Nail Checks Belong to the Doorway',
        content:
          "Once a week, listen to your dog walk across a hard floor. A rhythmic ticking means the nails are long enough to change how the foot lands, and left alone, long nails shift weight onto the wrong parts of the paw. The check itself is simple: view the nails from the side and see whether they curve past the pad. Whether you trim them yourself or hand that job to a professional depends on your dog, your tools, and your confidence, but the checking is forever yours. Trimming technique and tool choice is its own conversation; the habit of noticing is the part that protects the feet.",
        tips: [
          'Listen for clicking nails on hard floors as a weekly reminder.',
          'Look for side-view curvature past the pad before deciding anything.',
          'Check dewclaws too, since they never touch ground to wear down.',
        ],
      },
      {
        id: 'salon-jobs',
        title: 'The Jobs a Salon Table Owns',
        content:
          "Some work earns its price. Scissor and clipper styling, anything involving blade lengths and an even finish, belongs to trained hands, because an amateur haircut grows out slowly and unevenly. Dematting is the clearest case: mats pinned close to the skin are painful to remove, and a groomer knows how far to work before recommending a short reset instead. Coat-specific clipping, sanitary trims, and the full blow-dry that lifts dead undercoat out of a double coat all sit on the salon side of the line. So does any dog whose patience runs out before the job does.",
        tips: [
          'Book style trims on a fixed schedule so coats never overwhelm.',
          'Ask the groomer to show matting early rather than shaving late.',
          'Schedule anxious dogs for quieter weekday slots when you can.',
        ],
      },
      {
        id: 'home-vs-salon-map',
        title: 'Mapping Tasks Between Home and Salon',
        content:
          "The dividing line is less about skill than about tools, patience, and risk. Anything involving sharp blades near skin, anything painful, and anything requiring a finished appearance earns a salon table. Anything repetitive, gentle, and preventive thrives at home, where frequency is free. The table below splits the common tasks, and it is the honest starting point when you compare grooming tools or salon bookings, because it says what you are actually shopping for.",
        tableData: {
          headers: ['Task', 'Best done', 'Why'],
          rows: [
            ['Brushing and deshedding', 'Home', 'Frequency wins; small sessions prevent big mats'],
            ['Bath and blow-dry', 'Either', 'Salon dryers lift undercoat home dryers cannot'],
            ['Haircuts and styling', 'Salon', 'Blade work near skin needs trained hands'],
            ['Nail trims', 'Either', 'Skill and dog temperament decide, not the task'],
            ['Ear cleaning', 'Home', 'Gentle, routine, and easy to pair with treats'],
            ['Dematting', 'Salon', 'Painful close to skin; groomers know the cutoff'],
          ],
        },
        tips: [
          'Split tasks by risk and frequency, never by ambition alone.',
          'Revisit the map as your dog ages or his coat changes.',
          'Jot your current split on the fridge and update it seasonally.',
        ],
      },
      {
        id: 'tolerance-sessions',
        title: 'Tolerance Grows in Small Sessions',
        content:
          "Dogs are not born accepting grooming; they are convinced by repetition. Keep sessions short enough to end on success, roughly three to five minutes for a beginner, and pair handling with something the dog loves, like lickable spread on a mat. Touch the ears, lift the paws, run the comb briefly, then stop before the squirming starts, because ending early leaves the dog believing the whole thing was survivable. Reward calm stillness rather than wrestling through protests, and let the session end while the dog is still comfortable. Confidence compounds: a dog who tolerated one minute this week will tolerate three next month.",
        callout: {
          type: 'pro-tip',
          title: "Quit while you're winning",
          text: 'The most common mistake is pushing a session thirty seconds past the dog\u2019s limit. Stop early, mark it a success, and bank the progress for tomorrow.',
        },
        tips: [
          'End each handling session before the wriggling, never after.',
          'Pair touch with a lick mat so paws and ears pay dividends.',
          'Add one new body part per week instead of fighting all at once.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'clock',
        title: 'Own the rhythm',
        items: [
          { highlight: 'Small beats heroic', text: 'four short weekly sessions outwork one monthly marathon.' },
          { highlight: 'Brush to skin', text: 'surface strokes leave the real tangle underneath untouched.' },
          { highlight: 'Nails tick, act', text: 'clicking on hard floors means curvature is already winning.' },
        ],
      },
      {
        icon: 'scissors',
        title: 'Respect the table',
        items: [
          { highlight: 'Blades are salon work', text: 'styling and dematting need trained hands and sharp tools.' },
          { highlight: 'Mats close to skin', text: 'hurt coming out; ask the groomer before it worsens.' },
          { highlight: 'Anxious dogs qualify', text: 'professional patience is a service you are allowed to buy.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Grow tolerance slowly',
        items: [
          { highlight: 'Minutes, not marathons', text: 'stop before the squirm so sessions stay survivable.' },
          { highlight: 'Food buys cooperation', text: 'a lick mat makes ear handling genuinely worth it.' },
          { highlight: 'Confidence compounds fast', text: 'one tolerated minute this week becomes three next month.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How often should I groom my dog at home between salon visits?',
        answer:
          'Brushing frequency tracks coat type: short coats are fine weekly, while curly, long, and double coats want attention several times a week or daily during shedding season. Add a quick paw and face wipe whenever dirt appears, and one nail check weekly. The salon schedule stays driven by haircut length and coat growth instead.',
      },
      {
        question: 'Which grooming tasks should I leave to a professional?',
        answer:
          'Anything with blades near the skin, meaning haircuts, sanitary trims, and coat clipping, plus dematting that sits tight against the skin. Blow-drying a heavy undercoat clean is also salon territory, since their dryers reach coat home dryers cannot. If your dog panics at any stage, a trained groomer is safer for both of you.',
      },
      {
        question: 'How do I get my dog used to home grooming?',
        answer:
          'Keep early sessions to a few minutes, pair every touch with food, and stop before the fidgeting begins. Handle one body part at a time until each becomes boring, then combine them. Most dogs accept home care within weeks when the sessions stay short, predictable, and generously paid; force teaches the opposite lesson.',
      },
      {
        question: 'Can I bathe my dog at home between appointments?',
        answer:
          'Yes, as long as the water is lukewarm, the shampoo is made for dogs, and every trace of it rinses out, because residue itches. Thorough drying matters more than people expect, especially in thick coats, where dampness left against the skin causes trouble. Skin trouble deserves a diagnosis before you change bath routines, so check with your veterinarian first.',
      },
      {
        question: 'What does a wipe-down actually accomplish between baths?',
        answer:
          'It clears eye debris, facial fold moisture, and paw grime before any of it irritates, and it puts your hands over the whole dog regularly, which is how lumps, ticks, and scabs get found early. Think of it as maintenance and inspection in one two-minute habit rather than a substitute for bathing.',
      },
    ],
  },

  // =========================================================================
  // CHEW-TOYS — durability versus digestibility, sizing, supervision, honesty
  // =========================================================================
  'chew-toys': {
    heroTitle: 'Chew Toys for Power Chewers and Gentle Gnawers',
    heroSubheadline:
      "Every chew toy makes the same trade: how long it lasts against how safely it comes apart. Here is how to weigh durability, size, and supervision for your dog's jaw.",
    metaDescription:
      'How to choose chew toys honestly: durability versus digestibility, sizing against the jaw, supervision by material, and straight talk for power chewers.',
    introSummary:
      "Somewhere in nearly every dog household there is a chew toy graveyard: a shredded rope, a rubber toy missing a corner, a nylon bone worn into a blade. The casualties usually share one cause, a mismatch between the toy and the jaw that bought it. Choosing well means weighing two things that pull against each other, how long an object survives and how safely it comes apart, and then matching both to your dog's actual chewing style rather than the packaging's promises. The rules below make that decision much simpler.",
    heroImageUrl: '/images/aussie_shepherd.jpg',
    heroImageAlt: 'Australian shepherd holding a chew toy outdoors',
    sections: [
      {
        id: 'durability-digestibility-trade',
        title: 'The Durability and Digestibility Trade-Off',
        content:
          "A toy that survives forever and a toy that dissolves harmlessly sit at opposite ends of one line. Hard nylon and dense natural chews outlast months of gnawing, but whatever breaks off them is swallowed intact, so the material itself carries the risk. Softer rubber and edible chews give way safely, breaking into pieces a stomach can handle, but a determined dog finishes them in an afternoon, which is a budget question rather than a safety one. Neither end is wrong; the mistake is buying one end expecting the other. Read what a toy is made of before judging what it promises.",
        tips: [
          'Decide upfront whether the toy is for lasting or for eating.',
          'Read the material line on the label before trusting durability claims.',
          'Accept that edible chews are consumables, not investments.',
        ],
      },
      {
        id: 'size-rules',
        title: 'Sizing Rules Against the Jaw',
        content:
          "Choking is a size problem before it is a supervision problem. Anything small enough to reach the back of the mouth can wedge against the windpipe, which is why tennis balls and small chews stay out of large-jawed households and tiny toys stay out of all of them. The working rule: a chew should extend visibly beyond both sides of the dog's muzzle, with no rounded object small enough for the jaws to fully close around. When you compare chew toy listings, hold the dimensions against your dog's actual muzzle rather than the breed photo on the page.",
        callout: {
          type: 'warning',
          title: 'Too small is the real hazard',
          text: 'A toy the jaws can close around completely can block the airway. If a chew has worn or gnawed down toward that size, retire it today, not eventually.',
        },
        tips: [
          "Match toy size to the dog in front of you, not her breed.",
          'Retire any chew once it shrinks toward jaw-closing size.',
          'Keep balls sized so the jaw cannot wrap fully around them.',
        ],
      },
      {
        id: 'supervision-by-material',
        title: 'Supervision Varies by Material',
        content:
          "How closely you watch depends on what is in the mouth. Dense rubber tolerates unsupervised chewing for most dogs, within size limits. Nylon and hard chews warrant a glance now and then for cracked edges and worn fragments. Natural materials, meaning antlers, hooves, wood, and rawhide-type chews, deserve full attention while in use, because they splinter, soften, and break into swallowable chunks unpredictably. Plush and fabric toys are the loosest category of all: they are fine for gentle dogs and disassembly projects for everyone else, and the stuffing and squeakers inside them belong in neither stomachs nor carpets unattended.",
        tips: [
          'Treat natural chews as watched activities, never boredom handouts.',
          'Glance at nylon toys for fresh cracks every few days.',
          'Reserve plush for gentle chewers and supervised settling time.',
        ],
      },
      {
        id: 'power-chewer-honesty',
        title: 'Power Chewers Deserve Straight Talk',
        content:
          "No toy on any shelf is truly indestructible, and the phrase on the packaging is marketing, not metallurgy. A committed power chewer will eventually beat whatever you buy, so the honest strategy is damage management rather than victory. Choose dense materials sized generously, inspect often, and expect to replace on a schedule. Watch the mouth too: fractured teeth happen on objects harder than the tooth itself, a real risk with some dense natural chews, and one expensive to repair. If a cracked tooth or a swallowed fragment is ever suspected, that is a same-day reason to check with your veterinarian.",
        tips: [
          'Budget for replacements instead of hunting a mythical unbreakable toy.',
          'If your thumbnail cannot dent a chew, neither can a tooth safely.',
          'Inspect power-chewer toys weekly for sharp worn edges.',
        ],
      },
      {
        id: 'chewing-style',
        title: 'Matching Toys to Chewing Style',
        content:
          "Dogs chew differently, and the toy should follow the style. Some dogs gnaw patiently with molars, wanting dense, lasting objects. Some shred, tearing fabric and dissecting squeakers, needing safe destructibles rather than forbidden plush. Some mouth and carry, treating toys like luggage, satisfied by anything fetchable. Puppies add teething to the list: sore gums want chilled, yielding rubber rather than anything hard enough to damage milk teeth. Watch your dog with one cheap toy of each type before investing, and the pattern will announce itself within a week.",
        tips: [
          'Offer one toy per chewing style and watch which wins.',
          'Give teething puppies chilled soft rubber, not hard chews.',
          'Let shredders destroy designated safe items, not smuggled socks.',
        ],
      },
      {
        id: 'retiring-toys',
        title: 'Retiring Toys Before They Break',
        content:
          "Every toy fails eventually, and the goal is retiring it on your schedule rather than the dog's. Inspect weekly with your hands: cracks that flex, chunks missing from edges, fabric worn thin, ropes fraying into strings, and squeakers loose enough to extract. Strings are a particular worry because they can knot inside the intestines if swallowed, so a frayed rope becomes yard waste immediately. The same inspection habit applies to anything you are browsing online: a listing worth trusting describes its materials honestly, and the same wear questions you ask at home are the ones to ask before buying.",
        callout: {
          type: 'vet-note',
          title: 'When to call',
          text: 'Gagging, refusing food, or vomiting after chew time can mean a fragment is stuck somewhere it should not be. Check with your veterinarian immediately rather than waiting it out.',
        },
        tips: [
          'Run a weekly hands-on inspection; fingers find what eyes skip.',
          'Cut frayed ropes out of rotation the day strings appear.',
          'Retire toys the moment a squeaker or stuffing shows.',
        ],
      },
      {
        id: 'keeping-interest',
        title: 'Keeping Chew Time Genuinely Interesting',
        content:
          "Rotation beats accumulation. A dog with fifteen toys available at once treats all of them as scenery, while the same dog devotes real attention to two or three that disappear and return. Stuffable rubber toys add another layer: filled, frozen, and handed over before a busy evening, they stretch minutes of interest into quiet half-hours. Freeze the filling to slow the strongest jaws down. One warning carried over from every section above: interest never outranks safety, so size and material rules apply to every new toy, no matter how clever it looks in the listing photo.",
        tips: [
          'Rotate a few toys weekly rather than leaving all out daily.',
          'Freeze stuffed toys to stretch chewing time on busy evenings.',
          'Apply the same size rules to every novelty, however clever.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'shield',
        title: 'Size against choking',
        items: [
          { highlight: 'Beyond both sides', text: 'a chew should visibly outspan the muzzle it enters.' },
          { highlight: 'No full jaw closure', text: 'rounded objects the mouth can fully close on are hazards.' },
          { highlight: 'Shrink means retire', text: 'worn-down chews keep shrinking toward airway-sized choking danger.' },
        ],
      },
      {
        icon: 'check',
        title: 'Supervise by material',
        items: [
          { highlight: 'Rubber is forgiving', text: 'dense natural chews and splintering materials need eyes.' },
          { highlight: 'Plush is conditional', text: 'fine for gentle mouths, demolition for everyone else.' },
          { highlight: 'Strings are serious', text: 'frayed rope fibers can knot internally if swallowed.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Power chewer realism',
        items: [
          { highlight: 'Nothing is indestructible', text: 'budget for a replacement cycle instead of a miracle.' },
          { highlight: 'Too hard breaks teeth', text: 'if your thumbnail cannot mark it, neither can enamel.' },
          { highlight: 'Rotation keeps interest', text: 'three rotating toys beat a floor of fifteen ignored ones.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How do I know if a chew toy is too small for my dog?',
        answer:
          "Judge by the muzzle, not the breed label. If the dog's jaws can close fully around the object, or the chew no longer extends past both sides of the muzzle, it has entered choking territory. Balls follow the same rule. Toys shrink with use, so recheck favorites monthly rather than only at purchase.",
      },
      {
        question: 'What chew toys are safest for aggressive chewers?',
        answer:
          'Dense rubber in generous sizes is the sturdiest everyday category, with honest expectations attached: even the toughest option eventually loses to a committed jaw, so inspection and replacement are part of the plan. Avoid anything your thumbnail cannot dent, since fractured teeth cost far more than any toy. Natural chews stay supervised.',
      },
      {
        question: "Are nylon bones bad for dogs' teeth?",
        answer:
          'They are durable and generally safe for patient gnawers, but hardness is the catch. A nylon bone with no give can fracture a tooth, particularly in dogs who bite down with force instead of gnawing gradually. Watch for worn, knife-like edges too, and swap the bone out once those appear.',
      },
      {
        question: 'Should I leave chew toys in the crate with my dog?',
        answer:
          'Only the formats you would trust unsupervised, which usually means a single dense, oversized rubber toy. Anything edible, splintering, or small enough to work loose from its shape stays outside the crate, since choking and blockages happen fastest when nobody is watching. Save the exciting chews for supervised hours.',
      },
      {
        question: 'How often should I replace my dog\u2019s chew toys?',
        answer:
          'Replace on condition rather than calendar: cracks, missing chunks, exposed squeakers, loose strings, or edges worn sharp all end a toy\u2019s run immediately. Power chewers may retire toys within weeks, while gentle mouths keep them for months. A quick weekly hands-on check catches every failure before it becomes swallowing.',
      },
    ],
  },

  // =========================================================================
  // CRATE-SIZING-GUIDE — measurements, divider panels, shell choice, den logic
  // =========================================================================
  'crate-sizing-guide': {
    heroTitle: 'Crate Sizing From Puppy Measurements to Adult Size',
    heroSubheadline:
      'The right crate is measured, not guessed: standing height plus body length for the adult dog, a divider panel for the puppy years, and the right shell for the job.',
    metaDescription:
      "Measure your dog's standing height and length, buy the adult size with a divider panel, and choose wire or airline crates by purpose, not by guesswork.",
    introSummary:
      "A crate gets blamed for a lot of problems it never caused. Dogs soil crates that are simply too big, refuse crates that echo, and panic in crates chosen for a puppy body they outgrew by month four. Sizing is not intuition; it is two measurements, one prediction about adult size, and a clear purpose for the crate itself. Get those right and the crate becomes what it should be: a private room the dog owns and a house-training tool that works.",
    heroImageUrl: '/images/golden_portrait.jpg',
    heroImageAlt: 'Golden retriever resting calmly in its crate at home',
    sections: [
      {
        id: 'measure-first',
        title: 'Measure Standing Height and Body Length',
        content:
          "Two numbers decide the crate. With your dog standing square, measure from the floor to the top of the head, ears included, for height; then measure from the nose to the base of the tail for length. Add two to four inches to each so the dog can stand without ducking, turn around, and lie fully stretched. Inside those margins, smaller beats bigger, because a dog curled in a corner of a cavern gets none of the den feeling crates trade on. For growing puppies, predict the adult size from breed expectations and parents, then measure again at six months to check the forecast.",
        tips: [
          'Measure to the top of the head with the ears up.',
          'Add two to four inches to height and length alike.',
          'Write the numbers down before you shop any listing.',
        ],
      },
      {
        id: 'divider-panel',
        title: 'Buy the Adult Size With a Divider',
        content:
          "A puppy in an adult-sized crate learns the wrong lesson, because every extra inch becomes a potential bathroom corner. Dogs work hard not to soil where they sleep, but only when the space is small enough that a nap spot and a relief spot cannot coexist. The industry's answer is the divider panel: a wire wall that shrinks the crate to puppy proportions today and slides back, month by month, as the dog grows into the space. So buy for the adult measurement and divide down, rather than buying twice. The same divider check is worth a moment as you compare crate listings, since panels are included with some models and sold separately for others.",
        callout: {
          type: 'pro-tip',
          title: 'Move the divider monthly',
          text: 'Slide the panel back as the puppy grows rather than waiting for accidents. The right divided size lets him stand, turn, and stretch out flat, and nothing more.',
        },
        tips: [
          'Divide the crate down so sleeping space and bathroom cannot coexist.',
          'Confirm whether a divider ships with the crate before ordering.',
          'Move panels back gradually instead of granting full size at once.',
        ],
      },
      {
        id: 'wire-crates',
        title: 'Wire Crates Make Sense at Home',
        content:
          "Wire crates are the household default for good reasons. They fold flat for storage or travel, they ventilate from every side, they let the dog watch the room, and they accept dividers, which makes them the natural puppy-training choice. Visibility is their personality: a dog who likes tracking the household settles happily behind wire, while one who needs her sleep guarded from the chaos does better with a cover or a solid-sided option. The exposed frame also means noise, so a jostled wire crate in a car is a rattling event, and wire corners can mark walls in tight rooms.",
        tips: [
          'Choose wire for visibility, folding storage, and divider compatibility.',
          'Drape a fitted cover to settle dogs who find rooms overstimulating.',
          'Pad the frame edges if the crate lives near finished walls.',
        ],
      },
      {
        id: 'airline-crates',
        title: 'Airline Crates for Travel and Quiet',
        content:
          "Rigid plastic airline-style crates are the quiet alternative. Solid walls block visual chaos, which suits anxious passengers and sound sleepers alike, and the single open face points the dog's view where you choose. In vehicles, the stiff shell contains a dog far better than wire in a sudden stop, and these crates are the only realistic format for actual flight, though every airline enforces its own rules and should be checked directly before booking. The trade-offs are honest ones: no divider panels, no folding, less airflow in hot weather, and a scrubbable floor that gets slippery unless you add bedding.",
        tips: [
          'Pick solid-sided crates for car travel and nervous flyers.',
          'Verify airline crate requirements with the carrier before booking flights.',
          'Add a mat, since plastic floors get slick under paw pads.',
        ],
      },
      {
        id: 'purpose-map',
        title: 'Wire or Airline by Crate Purpose',
        content:
          "The shell follows the job. House training lives at home with wire and a divider, travel and flights belong to rigid plastic, and the in-between cases, a dog who watches the world versus one who needs the world muted, come down to temperament. This table keeps the decision honest when you are comparing models and wondering whether you honestly need both.",
        tableData: {
          headers: ['Purpose', 'Better shell', 'Why'],
          rows: [
            ['House training a puppy', 'Wire with divider', 'Shrinks with growth; easy supervision'],
            ['Car travel', 'Rigid airline style', 'Solid walls contain better in sudden stops'],
            ['Airline flights', 'Airline-approved plastic', 'Carriers require the kennel format'],
            ['Anxious or visual-sensitive dogs', 'Solid-sided or covered wire', 'Blocks chaos; calmer rest'],
            ['Small apartments and storage', 'Folding wire', 'Collapses flat between uses'],
          ],
        },
        tips: [
          'Let the job pick the shell before the price does.',
          'Some households honestly need one of each format.',
          'Confirm divider compatibility when buying wire crates for puppies.',
        ],
      },
      {
        id: 'den-not-punishment',
        title: 'A Den, Never a Punishment',
        content:
          "The crate only works while it stays neutral territory. Send a dog there as a consequence for mischief and the crate becomes the place where bad things happen, and every training gain quietly unravels. The den instinct is the opposite instinct: meals served inside, surprise treats appearing between the bars, naps happening with the door open. Let the dog enter and exit freely when you are home, and close the door only for sleeping, travel, and genuine safety needs. Dogs who choose their crates unprompted are not trained into tolerance; they are owners of a room.",
        callout: {
          type: 'warning',
          title: 'Never as a time-out',
          text: 'One angry crate sentence can cost weeks of trust. If you need a break from a wild dog, use a pen or a gate instead, and keep the crate permanently on the payroll of good things.',
        },
        tips: [
          'Feed meals inside the crate so it pays its own rent.',
          'Leave the door open for naps whenever you are home.',
          'Confine with gates instead when you are genuinely annoyed.',
        ],
      },
      {
        id: 'sizing-mistakes',
        title: 'Sizing Mistakes That Undo the Plan',
        content:
          "The classic failure is the cavern: a crate so generous the dog relieves himself at one end and sleeps at the other, and house training stalls for reasons that look like stubbornness. The second is airflow: a crate wedged against a radiator, in direct sun, or under a blanket draped carelessly over every vent, which turns a den into an oven in warm months. The third is hardware: a collar with tags left on inside a crate can snag on the bars during a twist. Check all three monthly, and the crate keeps doing the one job it was sized for.",
        tips: [
          'Re-check divided space monthly as the puppy grows into it.',
          'Keep vents clear and crates away from radiators and sun.',
          'Remove collars and tags before closing any crate door.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Measure, then buy',
        items: [
          { highlight: 'Height with ears', text: 'floor to head top, plus two to four inches.' },
          { highlight: 'Length nose to tail', text: 'base of the tail, with the same margin added.' },
          { highlight: 'Smaller beats bigger', text: 'caverns feel unsafe and train the bladder badly.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Divide for puppies',
        items: [
          { highlight: 'Adult size, divided down', text: 'one crate purchase instead of two crate phases.' },
          { highlight: 'Bathroom corners vanish', text: 'when sleeping space and relief spots cannot coexist.' },
          { highlight: 'Slide, never jump', text: 'expand the space monthly as growth actually happens.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Keep the den honest',
        items: [
          { highlight: 'Meals go inside', text: 'the crate pays rent in food and good naps.' },
          { highlight: 'Never a time-out', text: 'punishment converts a private den into a grievance.' },
          { highlight: 'Airflow stays open', text: 'vents blocked by blankets turn dens into ovens.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'What size crate does my dog need?',
        answer:
          'Measure standing height to the top of the head and body length from nose to tail base, then add two to four inches to both. The dog should stand up straight, turn a full circle, and lie stretched out flat, with nothing more to spare. Between two sizes on a chart, the smaller usually wins for den purposes.',
      },
      {
        question: 'Should I buy a crate for my puppy\u2019s adult size?',
        answer:
          'Yes, with a divider panel. The divider walls off the rear of the crate so the puppy sleeps in a space sized to his current body, and it slides back as he grows. Without it, an adult-sized crate leaves a bathroom corner that undermines house training, which is the exact failure dividers exist to prevent.',
      },
      {
        question: 'Is it cruel to crate a dog while I work?',
        answer:
          'Not if the crate is sized right, introduced with food and patience, and matched to reasonable stretches of time, with exercise before and after. It becomes cruel when the space is wrong, the stay is endless, or the crate is used for punishment. Dogs with separation distress may need a different plan, so check with your veterinarian.',
      },
      {
        question: 'Wire or plastic crate for a puppy?',
        answer:
          'Wire, usually, because dividers come built into that world and supervision through the bars is easier during house training. Plastic wins for travel, flights, and dogs who find visual activity stressful rather than entertaining. Many households eventually own one of each, and nothing about that is excessive.',
      },
      {
        question: 'Can a crate be too big for a dog?',
        answer:
          'It can, and the symptom is soiling. A properly sized crate lets the dog stand, turn, and stretch out, and no more; the accident zone appears when extra floor lets sleeping and relieving happen at opposite ends. If accidents start in a previously clean crate, suspect size and schedule before blaming the dog.',
      },
    ],
  },

  // =========================================================================
  // HARNESS-FITTING-GUIDE — girth, contact points, chafe, growth re-fits
  // =========================================================================
  'harness-fitting-guide': {
    heroTitle: 'Harness Fitting From Girth Measurement to Chafe Checks',
    heroSubheadline:
      'One tape measurement and a two-finger test at every strap separate a harness that moves with your dog from one that rubs. Here is the full fitting routine.',
    metaDescription:
      'Fit a dog harness: measure girth behind the elbows, apply the two-finger rule at every contact point, watch the chafe zones, and re-fit growing puppies.',
    introSummary:
      "Watch a dog trot in a well-fitted harness and you see nothing: no shifting webbing, no shortened stride, no pink patches under the front legs by Friday. Harnesses fail quietly, through a centimeter of growth or a strap sitting a hand-width too low, and the dog simply adapts. Fitting is a repeatable routine rather than a knack: one measurement taken correctly, one finger test at every place the harness touches, and a schedule for re-checking both. Ten minutes of attention turns any harness from a guess into gear.",
    heroImageUrl: '/images/aussie_shepherd.jpg',
    heroImageAlt: 'Australian shepherd wearing a fitted harness outdoors',
    sections: [
      {
        id: 'girth-measurement',
        title: 'Girth Behind the Elbows Decides Everything',
        content:
          "Start with the girth and trust it more than weight categories, which is where most sizing mistakes begin. Run a soft tape around the deepest part of the ribcage, directly behind the front legs, with the dog standing squarely on all fours. Snug but not compressed is the rule, since a tape sunk into fur overstates the chest by a centimeter or two. Write the number down with the date, then check the manufacturer's chart for that specific harness, because sizing alphabets are not standardized between makers and a medium from one label is a large from another.",
        callout: {
          type: 'pro-tip',
          title: 'Photograph the tape',
          text: 'Take a phone photo of the tape in position. Numbers get remembered wrong, photos do not, and re-measuring in three months is easier with the original in hand.',
        },
        tips: [
          'Measure around the deepest ribcage point with the dog standing square.',
          'Trust the tape over weight charts; two dogs at 30 pounds differ.',
          'Snug the tape against fur without compressing it inward.',
        ],
      },
      {
        id: 'two-finger-every-strap',
        title: 'The Two-Finger Test at Every Strap',
        content:
          "Once the harness is on, the same small test governs every point where webbing meets dog: shoulders, chest, belly bands, and any cross strap. Lay two fingers flat beneath the strap and lift gently. A correct fit lets them pass with light resistance, snug enough that the webbing cannot slide around the body, loose enough that skin moves freely underneath. A fist gliding under means the harness shifts and catches legs; fingers that have to force a gap mean pressure on the chest all walk long. Test every strap separately, because harnesses go loose at one point and tight at another as dogs move.",
        tips: [
          'Two flat fingers under every strap: light resistance, never forcing.',
          'Check straps one at a time; fit varies point to point.',
          'If a whole fist slides under, expect shifting and leg-catching.',
        ],
      },
      {
        id: 'strap-placement',
        title: 'Where the Straps Should Sit',
        content:
          "Placement is fit's quieter half. The belly band rides behind the elbows, never in the armpit crease itself, where motion turns webbing into a rasp. The chest panel sits over the breastbone, flat and centered, so it cannot slide sideways onto the shoulder joint, which needs to rotate freely for a full stride. Shoulder straps avoid the neck entirely, crossing the upper chest and withers instead. When straps sit where anatomy intended, the harness barely registers on the dog, and hair lying flat after a walk is the visible proof. The same placement test applies to any harness you are considering adding to the closet.",
        tips: [
          'Keep the belly band clear of the armpit crease during motion.',
          'Center the chest panel over the breastbone before every walk.',
          'Straps cross the chest, never the throat or the shoulder joint.',
        ],
      },
      {
        id: 'chafe-zones',
        title: 'Chafe Zones Under the Front Legs',
        content:
          "The armpits and the front of the chest take the punishment when fit drifts, and they announce it in a reliable order: first hair lying the wrong way or thinning, then pink skin, then raw patches. Check both areas after every walk during a harness's first week, then weekly forever. Rub marks mean placement or tension is wrong, not that the dog needs toughening, and continuing to walk a chafing harness only deepens the sore. Persistent redness, broken skin, or hair loss that outlasts a fitting fix deserves a professional opinion, so check with your veterinarian before it becomes a wound.",
        callout: {
          type: 'warning',
          title: 'Raw armpits mean stop',
          text: 'Pink skin or broken hair under the front legs is the harness telling you the fit is wrong. Walk on a flat collar until the skin settles and the straps are re-set.',
        },
        tips: [
          'Inspect armpits and chest after each walk during any new harness week.',
          'Read hair lying flat as proof of placement, ruffled hair as friction.',
          'Rest raw skin completely before strapping the dog in again.',
        ],
      },
      {
        id: 'growing-puppies',
        title: 'Re-Fitting a Growing Puppy',
        content:
          "Puppies outgrow harnesses the way they outgrow shoes, invisibly and then suddenly. Choose a style with generous adjustment sliders rather than buying up a size, since oversized harnesses ride loose everywhere and puppies back out of them at doorways. Re-run the girth measurement and the finger tests every week during heavy growth months, and every fortnight otherwise, adjusting sliders a little at a time so the harness keeps its shape. Expect to replace rather than endlessly adjust once the sliders run out of travel, which is the honest end of a puppy harness's career.",
        tips: [
          'Buy adjustability, not headroom, for puppies still growing.',
          'Re-check fit weekly through the fastest growth months.',
          'Replace, never force, once sliders run out of adjustment travel.',
        ],
      },
      {
        id: 'coat-changes',
        title: 'Coat Changes Change the Fit',
        content:
          "The same harness fits three different ways across one year on a coated breed. Winter undercoat adds centimeters of girth; a short summer clip strips them away again; a wet dog compresses fur differently than a dry one. After any dramatic coat change, re-measure the girth before assuming the harness still agrees with the dog, and expect to move sliders a notch or two each direction seasonally. Fluffy breeds sometimes need their coat smoothed down before fitting, since webbing seated over compressed tufts relaxes loose within a block of walking.",
        tips: [
          'Re-measure girth after seasonal sheds and grooming clips.',
          'Smooth fluffy coats flat before fitting so webbing seats truly.',
          'Expect slider movement in both directions across the seasons.',
        ],
      },
      {
        id: 'monthly-ritual',
        title: 'The Two-Minute Monthly Fit Ritual',
        content:
          "Fit decays slowly, which is why it belongs on a calendar. Once a month, put the harness on and work through the checklist in order: girth re-measured, two-finger test at every strap, straps sitting behind the elbows and over the breastbone, a short walk watched for shifting or shortened strides, and a look under the front legs afterward. The whole ritual takes two minutes, and it is the difference between a harness that lasts years and one you replace because it never quite sat right. The same checklist travels with you when comparing harness listings, because it tells you exactly what adjustment range you are shopping for.",
        tips: [
          'Calendar the fit check; drift never announces itself.',
          'Watch one short walk monthly for shifting and shortened strides.',
          'Carry the checklist when shopping adjustment ranges on new harnesses.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Measure with intent',
        items: [
          { highlight: 'Girth behind elbows', text: 'at the deepest ribcage, tape snug, dog standing square.' },
          { highlight: 'Charts differ by maker', text: 'a medium here is a large somewhere else entirely.' },
          { highlight: 'Log the number', text: 'dated measurements make every seasonal re-fit genuinely honest.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Test every strap',
        items: [
          { highlight: 'Two fingers, light drag', text: 'under each strap: shoulders, chest, and belly bands.' },
          { highlight: 'Never a whole fist', text: 'a gliding fist predicts shifting and caught legs.' },
          { highlight: 'Straps clear the armpits', text: 'webbing in the crease rasps the skin every stride.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Re-fit as dogs change',
        items: [
          { highlight: 'Puppies re-fitted weekly', text: 'growth outruns every memory, so adjust sliders gradually.' },
          { highlight: 'Coats move sizes', text: 'winter undercoat and summer clips both shift girth.' },
          { highlight: 'Watch the armpits', text: 'ruffled hair and pink skin mean stop and re-set.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Where do I measure my dog for a harness?',
        answer:
          "Around the ribcage's deepest point, immediately behind the front legs, with the tape snug against the fur and the dog standing on all fours. That girth number, not body weight, drives most size charts. For deep-chested breeds, note the chest depth too, since some styles fit the girth and still pinch at the ribcage taper.",
      },
      {
        question: 'How tight should a dog harness be?',
        answer:
          'Tight enough that two flat fingers slide beneath every strap with light resistance, and no looser. A fist fitting under the webbing means the harness will shift and can catch a leg mid-stride, while fingers that must force their way under mean all-day chest pressure. Test each strap on its own, since fit varies point to point.',
      },
      {
        question: 'Why is my dog chafing under the harness?',
        answer:
          'Almost always placement or tension: a belly band riding in the armpit crease, a chest panel drifting onto the shoulder, or loose webbing sliding. Reset the straps behind the elbows and over the breastbone, re-run the finger test, and rest the skin until the pinkness fades. Sores persisting after a correct re-fit mean you should check with your veterinarian.',
      },
      {
        question: 'Should I size up for a puppy harness?',
        answer:
          'Choose adjustability over headroom. A harness sized up rides loose in every wrong place and puppies escape them at doorways, so buy the current girth with generous slider range and re-check weekly. Replace rather than over-adjusting once the sliders run out of travel, usually somewhere in adolescence.',
      },
      {
        question: 'How often should I re-check harness fit?',
        answer:
          'Weekly for puppies in heavy growth, monthly for adults, and after any big coat change like a shed or a grooming clip. The check is two minutes: re-measure the girth, finger-test every strap, and glance under the front legs. Most harness replacements trace back to skipping exactly this routine.',
      },
    ],
  },

  // =========================================================================
  // COLLAR-BUYING-GUIDE — fit, width, breakaway, ID layering, growth collars
  // =========================================================================
  'collar-buying-guide': {
    heroTitle: 'Choosing a Dog Collar by Fit, Width, and Safety',
    heroSubheadline:
      'A collar is the one thing your dog wears every day. Fitting it properly, matching width to the neck, and layering identification makes it earn that job.',
    metaDescription:
      'Choose a dog collar that truly fits: the two-finger test, width matched to neck size and strength, breakaway buckles for cats, and ID layered with a microchip.',
    introSummary:
      "The most common collar mistake is invisible: a band fitted once, in puppyhood, and never questioned again. Necks widen, webbing stretches, buckles migrate, and the collar quietly slides from correct to loose enough to escape or tight enough to rub. Choosing a collar well is less about browsing endless styles and more about three honest decisions: a fit you can verify in seconds, a width matched to the actual neck wearing it, and identification that survives even when the collar does not.",
    heroImageUrl: '/images/aussie_shepherd.jpg',
    heroImageAlt: 'Australian shepherd wearing a collar on an outdoor walk',
    sections: [
      {
        id: 'two-finger-fit',
        title: 'The Two-Finger Fit Test',
        content:
          "Buckle the collar on and slide two fingers, held flat and together, under the band at the side of the neck. Ideal fit lets the fingers pass with a slight drag, and that single sensation covers both failure modes at once. Looser, and the collar migrates toward the ears and can be worked over a narrow head, which is how dogs vanish at exactly the wrong moment. Tighter, and the band presses on the throat around the clock. Re-test monthly, since necks grow and webbing relaxes without asking.",
        tips: [
          'Slide two flat fingers under the band for a slight drag feel.',
          'Loose collars rotate and slip heads; watch for both signs.',
          'Re-test the fit monthly because webbing stretches silently.',
        ],
      },
      {
        id: 'width-matching',
        title: 'Width Follows Neck and Strength',
        content:
          "Width is a mechanical decision dressed up as a style one. Narrow necks, meaning toy breeds and cats, need slim straps, roughly three-eighths to five-eighths of an inch, because a wide band on a small throat restricts movement and looks like a yoke. Large, strong dogs benefit from wide collars, an inch and up, since the width spreads leash pressure across more throat and gives hardware somewhere solid to sit. The pulling style matters too: a dog who hits the end of the leash hard needs width and strong stitching more than a dog who trots politely at your knee. When comparing collar listings, match stated width to the neck before anything else.",
        tips: [
          'Slim straps for toy necks; wide bands spread force on large ones.',
          'Check stitching density when your dog hits the leash hard.',
          'Width that pinches motion on a small throat is the wrong kind.',
        ],
      },
      {
        id: 'breakaway-cats',
        title: 'Breakaway Buckles Belong on Cats',
        content:
          "Cats climb, and a cat collar that cannot release turns every branch, fence, and window latch into a strangulation risk. Breakaway buckles are engineered to pop open under that specific load, trading the reliability of staying on for the guarantee of coming off in an emergency, which is the correct trade for a climbing animal every single time. Elastic sections serve the same purpose in some designs. Dog collars, or any buckle that only human hands can open, are never acceptable substitutes for a cat. Expect to replace breakaway collars occasionally, because a collar lost in a hedge is the design succeeding.",
        callout: {
          type: 'warning',
          title: 'Dogs and cats differ here',
          text: 'The breakaway rule is absolute for cats and wrong for dogs, whose collars anchor leashes and must never release under pull. Never cross the two categories.',
        },
        tips: [
          'Test breakaway buckles at home with a firm, steady pull.',
          'Accept lost breakaway collars as the safety feature working.',
          "Never put a dog's buckle-only collar on a climbing cat.",
        ],
      },
      {
        id: 'id-layering',
        title: 'ID Tag and Microchip Layering',
        content:
          "Identification works as a stack, not a single choice. The tag on the collar is the fast layer: anyone who finds your dog can call you before the sun sets, no equipment required. The microchip is the durable layer, invisible, immune to weather, and readable at nearly every clinic and shelter, which makes it the backstop for the day the collar goes missing entirely. Keep the chip registration current after any move, because an unregistered chip is a very expensive library card with no borrower listed. Tags engraved with a phone number alone stay legible longer than dense address blocks.",
        tips: [
          'Engrave a phone number first; small text wears and shrinks.',
          'Update microchip registration the week you change addresses.',
          'Add a second tag with any needed medical alert wording.',
        ],
      },
      {
        id: 'growth-collars',
        title: 'Growth Collars for Puppy Necks',
        content:
          "A puppy outgrows a collar in weeks, so shop for adjustment range rather than finish. A well-made adjustable collar spans several notches, letting you loosen by degrees as the neck widens, with hardware light enough for a young dog to forget he is wearing it. Check the fit weekly during the fastest months, using the same finger test as always, and retire the collar once the buckle runs out of holes, which lands somewhere in adolescence for most breeds. A too-heavy collar on a puppy teaches head-dropping and scratching at the throat, habits that outlast the collar.",
        tips: [
          'Pick adjustable range and light hardware for growing puppies.',
          'Re-run the finger test weekly through the fastest growth.',
          'Retire collars once buckle holes run out, usually mid-adolescence.',
        ],
      },
      {
        id: 'daily-checks',
        title: 'Daily Checks Without a Tape',
        content:
          "Between formal fittings, the collar reports its own condition. Spin test: the band should rotate around the neck with a nudge but not swing freely. Ear test: on a narrow-headed dog, a loose collar can be eased up over the back of the skull with light pressure, which predicts escape. Skin test: lift the fur beneath the buckle line and look for dirt, matted hair, or pressure marks, all of which say the collar needs removing at night or a wash. Odor test: a smelly collar is a dirty collar, and dirty webbing irritates the skin it rests on.",
        callout: {
          type: 'vet-note',
          title: 'When the neck needs attention',
          text: 'Hair loss, odor that survives a wash, or a raw ring under the collar can signal skin disease rather than fit. Check with your veterinarian instead of cycling through more collars.',
        },
        tips: [
          'Nudge-rotate the band weekly; free swinging means too loose.',
          'Remove collars nightly to air the fur and skin beneath.',
          'Wash webbing collars regularly; grime irritates the skin.',
        ],
      },
      {
        id: 'narrow-heads',
        title: 'Narrow Heads Need Honest Hardware',
        content:
          "Sighthounds and other narrow-skulled breeds slip standard collars that fit correctly at rest, because their necks thicken wider than their heads. The honest answers are wide hound-style collars, which sit lower on the neck where the shape is more forgiving, and limited-slip designs that gently tighten to a stop rather than freely. Whatever the choice, the escape test stays the same: if the collar can be worked over the skull with light pressure, it can be worked over in a lunge too. For these dogs, a properly fitted harness on walks removes most of the stakes, and any hound-collar listing worth your basket will name where on the neck it is designed to sit.",
        tips: [
          'Try wide hound collars for narrow-skulled, thick-necked breeds.',
          'Test by easing over the skull with light pressure only.',
          'Move leash duties to a harness for confirmed escape artists.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Verify the fit',
        items: [
          { highlight: 'Two fingers, slight drag', text: 'held flat beneath the band beside the throat.' },
          { highlight: 'Re-tests every month', text: 'necks widen and old webbing relaxes without ever asking.' },
          { highlight: 'Spin, not swing', text: 'a nudge rotates it; free swinging predicts escapes.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Match width honestly',
        items: [
          { highlight: 'Slim on small throats', text: 'wide bands restrict motion and wear like yokes.' },
          { highlight: 'Wide for power', text: 'strong pullers need spread force and dense stitching.' },
          { highlight: 'Cats get breakaway', text: 'releasing buckles are the only acceptable cat collars.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Layer the identification',
        items: [
          { highlight: 'Tag for speed', text: 'a phone number beats an engraved address block.' },
          { highlight: 'Chip for permanence', text: 'with registration updated the week you move house.' },
          { highlight: 'Narrow heads tested', text: 'if it eases over the skull, expect it during a lunge.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How tight should a dog collar be?',
        answer:
          'Snug enough that two flat fingers pass beneath the band with a slight drag, and loose enough that the collar can be nudged around the neck without swinging freely. Verify it can not be worked up past the ears with light pressure on narrow-headed dogs, and re-check monthly, because fit drifts as necks grow and webbing relaxes.',
      },
      {
        question: 'What collar width does my dog need?',
        answer:
          "Toy breeds and cats do best on slim straps, generally no wider than five-eighths of an inch, while large or strong dogs want an inch or more to spread leash pressure across the throat. Width should never restrict a small dog's movement. Stitching quality matters as much as width for dogs who hit leash ends hard.",
      },
      {
        question: 'Do cats really need breakaway collars?',
        answer:
          'Yes, without exception. Cats climb and squeeze through gaps, and a snagged collar that cannot release becomes a strangulation hazard on the far side of a jump. Breakaway buckles are built to pop open under exactly that force, so losing the occasional collar in a hedge is the safety feature doing its job, not a defect.',
      },
      {
        question: 'Should my puppy wear his collar all day?',
        answer:
          'Fit checks weekly and collar-off nights are the sensible routine for young dogs. Puppies outgrow collars quickly, so a band that fit in spring can press by summer, and the fur beneath needs airing to stay healthy. Lightweight hardware and generous adjustment range make the whole arrangement easier on everyone.',
      },
      {
        question: 'Is a microchip enough without a collar tag?',
        answer:
          'They do different jobs. The tag lets a neighbor call you within minutes of finding your dog, while the chip, readable at clinics and shelters, carries identification that survives losing the collar entirely. Together they cover the fast recovery and the worst day, so run both rather than choosing.',
      },
    ],
  },

  // =========================================================================
  // BED-BUYING-BY-SLEEP-STYLE — sleep posture to bed shape, support, washing
  // =========================================================================
  'bed-buying-by-sleep-style': {
    heroTitle: 'Choosing a Dog Bed by the Way Your Dog Actually Sleeps',
    heroSubheadline:
      'Sprawlers, curlers, and burrowers each need a different shape of bed to sleep well. Match the style first, then check support and washability before buying.',
    metaDescription:
      'Choosing a dog bed by sleep style: sprawlers need big rectangles, curlers want bolstered nests, burrowers need cave beds, and seniors need orthopedic foam.',
    introSummary:
      "Dogs are honest sleepers. A greyhound flops flat like a rug, a shiba curls into a perfect croissant, and a dachshund disappears under three blankets by midnight, each following an instinct about what safe sleep feels like. Buying a bed against that instinct fails quietly: the expensive mattress sits empty while the dog sleeps on the floor beside it. Spend one week watching how your dog actually sleeps, sprawl, curl, or burrow, and the shape of the right bed announces itself.",
    heroImageUrl: '/images/golden_portrait.jpg',
    heroImageAlt: 'Golden retriever sleeping curled on a comfortable dog bed',
    sections: [
      {
        id: 'read-the-sleeper',
        title: 'Read the Sleeper Before the Bed',
        content:
          "Give the observation a full week, because dogs vary their posture with temperature and mood. Note the default position at night, the daytime nap position, and whether the dog migrates to tile in summer or carpets in winter. Sprawling on the side with legs extended says the dog wants space and a flat surface. Curling into a tight ball says the dog conserves heat and wants edges to lean against. Rooting under blankets, pillows, and your laundry says the dog wants cover, sometimes for warmth, sometimes for the feeling of enclosure itself. The dominant pattern is the one that appears on cold nights.",
        tips: [
          'Watch a full week; single nights lie about preferences.',
          'Note which position wins on the coldest nights specifically.',
          'Track summer versus winter napping spots before deciding shape.',
        ],
      },
      {
        id: 'sprawlers-rectangles',
        title: 'Side Sleepers and Sprawlers Want Rectangles',
        content:
          "A dog who sleeps flat on his side uses more floor than his standing size suggests. Measure the sprawl directly: with the dog asleep, note nose to tail base, add the tail itself, and add a hand-width beyond the outstretched paws, then buy a rectangle at least that long. Bolstered edges on all four sides defeat the whole style, because a sprawler wants one flat plane, so choose beds with no side rails or rails on a single end only. Big rectangles look like furniture commitments, and they are, but a sprawler on a too-small bed performs nightly gymnastics that end on your floor.",
        callout: {
          type: 'pro-tip',
          title: 'Measure the sprawl, not the dog',
          text: 'While he sleeps, lay a tape measure beside him from nose to tail and note the paw reach. Sleeping length, not standing height, sets the bed size for a sprawler.',
        },
        tips: [
          'Measure nose to tail tip while the dog is fully asleep.',
          'Skip four-sided bolsters; sprawlers need one open plane.',
          'Size up between chart sizes rather than accepting gymnastics.',
        ],
      },
      {
        id: 'curlers-nests',
        title: 'Curlers Sleep Best in Bolstered Nests',
        content:
          "The tight-ball sleeper runs warm-blooded economics: a curled posture conserves heat, and raised edges give the head something to rest on while doubling as a pillow. Donut and bolster beds serve exactly this posture, wrapping the dog in a raised rim that defines the sleeping territory. Size the nest to the curl: a bed whose internal diameter matches the curled diameter plus a little slack feels secure, while a cavernous one loses the cozy logic entirely. Curlers often prefer a slightly raised center too, which cradles the body and mimics sleeping against littermates.",
        tips: [
          'Match internal diameter to the curled ball plus slack.',
          'Prefer raised centers that cradle rather than flat filler.',
          'Resist sizing up; the cozy depends on snug fit.',
        ],
      },
      {
        id: 'burrowers-caves',
        title: 'Burrowers Need Cave Beds',
        content:
          "Some dogs will not settle until covered, pushing under blankets, comforters, and freshly folded laundry with total commitment. Cave and hooded beds answer that instinct directly: a covered front, a soft roof, and a den-like interior that suits small dogs in particular, who lose heat fastest and crave enclosure most. Watch the entry design when choosing one, since a stiff, tall opening defeats a dog who wants to disappear, while a flexible, low front invites nightly tunneling. Burrowers with big-dog ambitions get a blanket draped over a raised edge instead, which delivers the same cover at sofa scale.",
        tips: [
          'Look for low, flexible entries that invite tunneling.',
          'Check interior headroom if your burrower is long-bodied.',
          'Drape blankets over bolsters for burrowers too large for caves.',
        ],
      },
      {
        id: 'orthopedic-foam',
        title: 'Orthopedic Foam Earns Its Place',
        content:
          "Senior dogs and heavy breeds change the shopping question from shape to substance. Orthopedic beds use solid memory-type foam that supports joints instead of letting them sink to the floor, which matters for elbows, hips, and the morning stiffness that creeps in with age. Entry height matters as much as density: a low front edge lets stiff legs board without a hop, and a firm mattress gives them something to push against standing up. One honest caution: dogs who suddenly refuse a long-used bed, sleep restlessly, or shift positions all night may be managing pain rather than preference, so check with your veterinarian before blaming the furniture.",
        callout: {
          type: 'vet-note',
          title: 'Refusal can mean pain',
          text: 'A dog abandoning a bed he loved for years, pacing at night, or struggling to settle is describing discomfort, not taste. Check with your veterinarian before shopping the problem away.',
        },
        tips: [
          'Choose solid foam over pillowed filler for seniors and heavy breeds.',
          'Measure entry height against stiff hips and hesitant hocks.',
          'Note sudden restlessness; it is rarely about the bed.',
        ],
      },
      {
        id: 'style-map',
        title: 'Sleep Style to Bed Shape Map',
        content:
          "With a week of observation and a tape measurement in hand, the purchase decision becomes a lookup rather than a guess. Style picks the shape, size picks the dimensions, and the senior question picks the filling. The table below compresses the whole article into one reference worth carrying as you compare bed listings, because every style asks for a different bed entirely.",
        tableData: {
          headers: ['Sleep style', 'Bed shape', 'Size check'],
          rows: [
            ['Side sprawler', 'Flat rectangle, minimal bolsters', 'Nose-to-tail sprawl plus paw reach'],
            ['Tight curler', 'Donut or bolstered nest', 'Curled diameter plus a little slack'],
            ['Burrower', 'Cave or hooded bed', 'Entry height and interior headroom'],
            ['Senior or stiff', 'Low-entry orthopedic rectangle', 'Foam density and step-up height'],
            ['Heat-seeker, any posture', 'Cave bed or blanket-draped bolster', 'Cover without trapped warmth'],
          ],
        },
        tips: [
          'Carry the sleep-style notes when comparing any bed listing.',
          'When a dog mixes styles, serve the coldest-night posture.',
          'Measure sleeping length before comparing any bed\u2019s dimensions.',
        ],
      },
      {
        id: 'washability',
        title: 'The Washability Reality Check',
        content:
          "Whatever bed survives the style question still has to survive the laundry, and this is where many beautiful beds fail. Check the care details before buying: a cover that zips off is a baseline, a liner that also washes is better, and foam that only spot-cleans is the honest norm, which is why a waterproof liner between foam and cover is worth seeking for seniors, puppies, and muddy seasons. Dog hair, dander, and the slow accumulation of dog smell dictate a monthly wash cycle at minimum, so a bed whose cover demands hand washing will be quietly neglected by April. Any bed worth browsing earns its place in your washing machine first.",
        tips: [
          'Confirm the cover zips off and machine washes before buying.',
          'Seek waterproof liners for seniors, puppies, and muddy seasons.',
          'Wash monthly at minimum; dog smell accumulates faster than dirt.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'map-pin',
        title: 'Watch a week first',
        items: [
          { highlight: 'Cold nights reveal', text: 'the default posture matters more than the occasional one.' },
          { highlight: 'Summer tells too', text: 'tile-seeking dogs run warm and want breathable beds.' },
          { highlight: 'Write the pattern', text: 'sprawl, curl, or burrow before browsing any shape.' },
        ],
      },
      {
        icon: 'check',
        title: 'Shape serves style',
        items: [
          { highlight: 'Sprawlers get rectangles', text: 'one flat plane sized to the full sleeping sprawl.' },
          { highlight: 'Curlers get nests', text: 'a snug internal diameter with a head-resting rim.' },
          { highlight: 'Burrowers get caves', text: 'low, flexible entries plus genuinely roomy interior headroom.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Support and washing',
        items: [
          { highlight: 'Seniors need foam', text: 'solid orthopedic support with a genuinely low entry.' },
          { highlight: 'Refusal can mean pain', text: 'sudden bed abandonment warrants the vet, not shopping.' },
          { highlight: 'Washability decides it', text: 'zip-off covers and washable liners outlast hand-wash beauties.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'What size dog bed should I buy?',
        answer:
          'Size from sleeping posture rather than standing measurements. For a sprawler, measure nose to tail while he is fully asleep and add paw reach; for a curler, match the internal diameter to the curled ball with a little slack. When charts put you between sizes, sprawlers go up and curlers stay snug.',
      },
      {
        question: 'Do dogs prefer round or rectangular beds?',
        answer:
          "Posture decides it. Tight curlers gravitate to round donuts and bolstered nests with a rim to rest their heads on, while side sleepers and sprawlers need rectangular floors big enough for the full sprawl, since bolsters on all sides interfere with their style. Offering both shapes early in a dog's life answers the question permanently.",
      },
      {
        question: 'What is an orthopedic dog bed?',
        answer:
          'A bed built on solid memory-type foam rather than loose pillow filling, so joints stay supported instead of sinking to the floor. The format suits seniors, heavy breeds, and any dog with stiff mornings, and the best versions keep entry edges low. Pain-driven restlessness needs a diagnosis, so check with your veterinarian rather than the mattress.',
      },
      {
        question: 'Are cave beds good for anxious dogs?',
        answer:
          'Many anxious dogs settle visibly inside covered beds, because enclosure reduces the visual field that keeps them on alert. Small dogs benefit doubly since they lose heat fastest and the covered interior stays warm. Introduce the cave slowly with treats at the entry rather than placing a nervous dog inside.',
      },
      {
        question: 'How often should I wash my dog\u2019s bed?',
        answer:
          'Covers want a monthly wash at minimum, and more often during shedding, mud, or allergy season, with the liner washed on the same cycle when the design allows. Check care labels before buying, since foam typically spot-cleans only, which makes a washable cover and a waterproof liner the two features worth insisting on.',
      },
    ],
  },

  // =========================================================================
  // BRUSH-GUIDE-BY-COAT-TYPE — tool mapping, line brushing, frequency
  // =========================================================================
  'brush-guide-by-coat-type': {
    heroTitle: 'Choosing the Right Dog Brush for Every Coat Type',
    heroSubheadline:
      'A slicker, a rake, a pin brush, and a grooming glove each serve a different coat. Matching the tool to the fur in front of you is the whole skill.',
    metaDescription:
      'Match dog brushes to coat types: slickers for curly coats, rakes for double coats, gloves for short hair, and pin brushes for long silk, plus line brushing.',
    introSummary:
      "Stand in the brush aisle long enough and every tool starts looking plausible, which is how households end up owning four brushes and using none of them correctly. Coat type settles the question. The fur standing in front of you, short and sleek, doubled and shedding, curly and matting, wiry and crisp, or long and silky, needs one primary tool and one honest frequency, and everything else is optional. This is the mapping, plus the technique that makes long coats manageable instead of miserable.",
    heroImageUrl: '/seopages/images/hero_grooming_dog_1791411047518.jpg',
    heroImageAlt: "Groomer brushing a dog's coat with a slicker brush",
    author: { name: 'Brea Stewart', role: 'Certified Dog Groomer' },
    sections: [
      {
        id: 'coat-first',
        title: 'Coat First, Tool Second, Always',
        content:
          "Every brush is an answer to one coat question, and using an answer meant for a different question is how skin gets scraped and undercoat gets packed. Stiff slicker pins on a smooth short coat rasp the skin without reaching anything worth brushing. A soft glove on a packed double coat pets the top layer while the undercoat felts beneath. Read the coat honestly, including its current condition, before picking anything up, because a tangled coat and a healthy one of the same type want different tools on different days. The brush listings worth your attention name the coat types they serve instead of promising everything.",
        tips: [
          'Identify coat type before buying; the tool follows the fur.',
          'Match brush stiffness to coat, never to marketing labels.',
          'Re-read the coat after baths, clips, and seasonal sheds.',
        ],
      },
      {
        id: 'short-coats',
        title: 'Short Coats Want Gentle Gloves',
        content:
          "Smooth and short coats, the territory of beagles, boxers, and hound types, shed plenty and mat almost never. The right tool is the softest one in the aisle: a rubber curry or grooming glove, worked in circles to lift loose hair and distribute skin oils, followed by a wipe-down to carry the debris away. Slicker brushes are a mistake here, since their fine pins have nothing to grab and go straight to skin. Frequency is modest, a weekly session with the glove and a swifter pass during spring and fall shedding, when the coat lets go noticeably more.",
        tips: [
          'Work curry gloves in circles to lift hair and spread oils.',
          'Skip slickers entirely on smooth coats; pins hit bare skin.',
          'Add a second weekly pass during spring and fall sheds.',
        ],
      },
      {
        id: 'double-coats',
        title: 'Double Coats Need Rake Work',
        content:
          "Double coats, the uniform of huskies, shepherds, and most spitz types, carry a weatherproof guard layer over a dense insulating undercoat that sheds in seasonal torrents. The undercoat rake is the indispensable tool, its long teeth reaching through the guard hair to lift dead undercoat before it felts. Work it gently over the whole body, then smooth the surface with a slicker to finish. During coat blows, daily short rake sessions beat one exhausting weekend marathon, and bathing plus force-drying accelerates the let-go dramatically. And the standing rule: double coats are never shaved, because the undercoat is their insulation against both cold and heat.",
        callout: {
          type: 'warning',
          title: 'Never shave a double coat',
          text: 'Clipping a double coat down removes the insulation that regulates both cold and heat, and the undercoat often grows back faster than the guard hairs, changing the coat for good. Rake it out instead.',
        },
        tips: [
          'Reach through guard hair with a rake; slickers only finish.',
          'Rake daily in short bursts during seasonal coat blows.',
          'Ask a groomer about tidy trims that leave the coat working.',
        ],
      },
      {
        id: 'curly-coats',
        title: 'Curly Coats Race Against Mats',
        content:
          "Poodles, doodles, and their curly kin wear coats that grow continuously and felt at the first neglect, which makes brushing frequency the entire game. A firm slicker does the primary work, followed by a metal comb to verify the coat is truly clean down to skin, since a comb that glides everywhere is the only proof. Curly coats want brushing before baths, because water and drying tighten small tangles into solid mats. Daily is the honest target for a full curly coat, every other day at minimum, with line brushing as the technique and a groomer's shave-down as the likely consequence of falling behind.",
        tips: [
          'Slicker first, then verify with a comb down to skin.',
          'Brush curly coats fully dry before every bath.',
          'Treat daily brushing as the price of a continuous-grow coat.',
        ],
      },
      {
        id: 'wire-coats',
        title: 'Wire Coats Keep Their Texture',
        content:
          "Wiry coats, the signature of most terriers, are built to stay crisp and harsh, and brushing them is about preserving that texture rather than chasing shine. A pin brush or a firm bristle handles the surface, lifting debris and keeping the furnishings from clumping. Brush in the direction the coat grows, then fluff the beard and legs gently against the grain for fullness. The texture itself is maintained by hand-stripping, a groomer's specialty that pulls dead hair rather than cutting it, and clipping, while simpler, softens the coat over generations of trims. For home care, the brushing and the conditioner-free approach do most of the work.",
        tips: [
          'Brush wire coats along the growth direction, fluffing furnishings after.',
          'Ask a groomer whether stripping suits your terrier\u2019s coat plan.',
          'Go easy on conditioners, which soften the wiry texture.',
        ],
      },
      {
        id: 'long-coats-line-brushing',
        title: 'Long Silk Coats Take Line Brushing',
        content:
          "Silky floor-length coats, seen on Afghan-type and Maltese-type dogs, mat where movement folds the hair: behind the ears, under the legs, at the collar line, and anywhere harnesses rub. Line brushing is the technique that keeps them alive. Part the coat into a line down to the skin, hold the section below the part flat, brush the hair above the part free, then move down a centimeter and repeat, so every layer gets brushed rather than the top one repeatedly. Mist the coat lightly first, since dry silk snaps, and finish with a comb to certify the work. A line-brushed coat is the difference between glamour and quiet damage.",
        callout: {
          type: 'pro-tip',
          title: 'Part, hold, brush, repeat',
          text: 'The most common long-coat mistake is brushing from the top down, which smooths the surface while mats hide at the skin. Line brush in centimeter rows and let the comb prove each one.',
        },
        tips: [
          'Mist silk coats lightly before brushing; dry hair breaks.',
          'Brush the friction zones daily: ears, armpits, collar line.',
          'Certify each section with a comb before moving along.',
        ],
      },
      {
        id: 'frequency-table',
        title: 'Frequency Cheat Sheet by Coat',
        content:
          "The honest frequency for any coat is the one that prevents problems rather than repairs them, and it ranges from weekly to daily across the coat types. As you compare brush listings, this is the table to hold in your other hand, because the right tool and the right schedule are one decision, not two. Anything past these intervals is borrowing trouble at compound interest.",
        tableData: {
          headers: ['Coat type', 'Primary tool', 'Honest frequency'],
          rows: [
            ['Short and smooth', 'Rubber glove or curry', 'Weekly; twice in shed season'],
            ['Double', 'Undercoat rake, slicker finish', 'Weekly; daily during coat blows'],
            ['Curly', 'Slicker plus metal comb', 'Daily or every other day'],
            ['Wire', 'Pin brush or firm bristle', 'Weekly with texture trims'],
            ['Long silk', 'Slicker, line brushed, comb finish', 'Daily on friction zones'],
          ],
        },
        tips: [
          'Anchor the schedule to shedding season, not the calendar.',
          'The comb passing everywhere is the only proof of finished.',
          'Frequent short sessions beat rare marathons for every coat type.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'scissors',
        title: 'Tool follows coat',
        items: [
          { highlight: 'Short wants gentle', text: 'curry gloves and circles, never stiff slicker pins.' },
          { highlight: 'Double wants depth', text: 'an undercoat rake reaching beneath the guard hair.' },
          { highlight: 'Curly wants proof', text: 'slicker work, then a comb certified down to skin.' },
        ],
      },
      {
        icon: 'check',
        title: 'Line brush long coats',
        items: [
          { highlight: 'Part down to skin', text: 'rows a centimeter wide, brushed one layer at a time.' },
          { highlight: 'Mist before brushing', text: 'dry silk snaps; dampened hair survives the work.' },
          { highlight: 'The comb certifies', text: 'a gliding comb proves the coat is genuinely clear.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Frequency is prevention',
        items: [
          { highlight: 'Weekly to daily', text: 'the honest range between short coats and curly ones.' },
          { highlight: 'Shed season doubles', text: 'coat blows deserve short daily rake bursts instead.' },
          { highlight: 'Mats are compounding', text: 'small today means shaved later; brush on schedule.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'What brush should I use on a short-haired dog?',
        answer:
          'Reach for a rubber grooming glove or curry, moved in small circles to lift loose hair and move skin oils along. Slicker pins have nothing to grab on a smooth coat and tend to scrape skin instead, so they are better left in the drawer. A weekly glove session keeps short coats glossy, doubled during the spring and fall sheds.',
      },
      {
        question: 'How often should I brush a double-coated dog?',
        answer:
          'Weekly for maintenance and daily, in short sessions, during the spring and fall coat blows when the undercoat releases in volume. An undercoat rake does the deep work through the guard hair, and a slicker smooths the surface afterward. Skipped blow seasons turn loose undercoat into felt, which is far harder to remove.',
      },
      {
        question: 'What is line brushing?',
        answer:
          'A technique for long and curly coats where you part the hair into rows down to the skin, hold each section flat, and brush only the layer above the part before moving down a centimeter. It guarantees every layer gets brushed instead of smoothing the top repeatedly. A metal comb passing cleanly certifies each finished row.',
      },
      {
        question: 'Can I use a slicker brush on any dog?',
        answer:
          'On any coat with length or curl, yes, and it is the primary tool for curly coats. On short smooth coats it mostly rasps skin, and on packed double coats it stays at the surface while the undercoat felts. Match stiffness to the coat, and let light pressure win whenever the pins meet resistance.',
      },
      {
        question: 'Should I shave my double-coated dog in summer?',
        answer:
          'No. The undercoat insulates against heat as well as cold, and shaving removes that regulation, sometimes changing how the coat grows back permanently. Manage summer with raking, water access, and shade instead, and ask a groomer about a tidy trim that leaves the coat functional.',
      },
    ],
  },

  // =========================================================================
  // SHAMPOO-GUIDE-BY-SKIN-TYPE — skin-type mapping, ingredients, the vet line
  // =========================================================================
  'shampoo-guide-by-skin-type': {
    heroTitle: 'Choosing Dog Shampoo by Skin Type and Symptoms',
    heroSubheadline:
      'Oatmeal, chlorhexidine, degreasers, and gentle maintenance formulas each treat a different skin situation. Learning the difference saves coats and money.',
    metaDescription:
      'Choose dog shampoo by skin type: gentle formulas for normal skin, oatmeal for dry itchy skin, degreasers for oily coats, medicated options with vet guidance.',
    introSummary:
      "The shampoo aisle teaches shoppers one misleading lesson: that bottles differ by scent. The differences that matter are clinical, and the skin your dog is wearing should drive the choice. Normal skin, dry flaky skin, an oily greasy coat, and allergy-prone angry skin each call for a different formula family, and using the wrong one ranges from harmless to actively aggravating. This article maps the families, explains what oatmeal and chlorhexidine are for, and marks the line where the problem belongs to a clinic rather than a bath.",
    heroImageUrl: '/seopages/images/hero_grooming_dog_1791411047518.jpg',
    heroImageAlt: 'Dog being bathed during a professional grooming session',
    author: { name: 'Brea Stewart', role: 'Certified Dog Groomer' },
    sections: [
      {
        id: 'read-the-skin',
        title: 'Read the Skin Before the Bottle',
        content:
          "Diagnose the situation you are bathing, because the coat is the visible part and the skin underneath is the customer. Normal skin shows clean, quiet, and evenly colored with no buildup. Dry skin flakes, sheds dandruff onto dark furniture, and drives rolling and rubbing. Oily skin leaves a greasy film on hands that stroke it, sometimes with a heavy smell within days of a bath. Allergy-prone skin runs red, angry, and itchy, often concentrated at paws, ears, and belly. Each picture calls for a different shelf, and misreading it wastes bottles.",
        tips: [
          'Stroke against the coat and smell your hand for oil assessment.',
          'Look for flakes on the furniture before assuming dry skin.',
          'Photograph recurring red patches to track whether they spread.',
        ],
      },
      {
        id: 'normal-skin',
        title: 'Normal Skin and Maintenance Formulas',
        content:
          "Healthy skin wants gentle maintenance and nothing dramatic: a mild dog-formulated shampoo, lukewarm water, and a thorough rinse. The formulation point is not marketing, since dog skin sits at a different acidity than human skin, and human shampoo, even the gentle baby kind, disturbs the dog's protective barrier and leaves it itchy. Bathe on need rather than calendar, typically every month or two for a house dog, more often for swimmers and mud enthusiasts. Between baths, brushing and rinse-free foams or wipes carry most of the load, and the coat stays better for the restraint. As you compare gentle formulas, the ingredient panel tells you more than the bottle front ever will.",
        callout: {
          type: 'warning',
          title: 'Human shampoo is for humans',
          text: "Dog skin has a different pH than ours, and human formulas, including baby shampoo, strip the barrier that keeps dog skin healthy. Keep a dedicated dog shampoo on the shelf instead.",
        },
        tips: [
          'Default to mild dog-formulated shampoo and lukewarm water.',
          'Bathe by need, monthly or so, not by rigid calendar.',
          'Use wipes and waterless foams between full baths.',
        ],
      },
      {
        id: 'dry-skin-oatmeal',
        title: 'Dry Skin and the Oatmeal Story',
        content:
          "Colloidal oatmeal earns its reputation honestly: finely milled oat in suspension soothes itchy, dry skin and holds moisture against it, which is why oatmeal shampoos sit at the center of the dry-skin shelf. It suits seasonal dryness, winter indoor heating, and the ordinary flakes that come with a coat changing over. It does not cure the causes oatmeal cannot reach, meaning allergies, parasites, and hormonal conditions, all of which present as dry flaky skin too and all of which need a diagnosis rather than a richer bottle. Bathing less, rinsing longer, and humidifying the house often do more than the shampoo itself.",
        tips: [
          'Match oatmeal to seasonal dryness, not to mysterious itching.',
          'Rinse twice as long as you lather; residue dries skin.',
          'Add humidity to winter rooms before adding bottles.',
        ],
      },
      {
        id: 'oily-skin',
        title: 'Oily Coats and Degreasing Formulas',
        content:
          "A coat that re-greases within days of bathing, leaves fingerprints on your hands, or carries a heavy odor is asking for a degreasing formula, the family built to strip excess sebum rather than add anything. These shampoos work and overwork: used too often or too harshly, they strip the skin past its target into dryness, kicking off a rebound where the skin produces even more oil in response. Alternate a degreaser with a gentle maintenance shampoo, watch the interval between baths, and treat seborrhea-type greasiness, meaning persistent scales with oil, as a medical question rather than a shopping one.",
        tips: [
          'Alternate degreasers with gentle shampoo to avoid rebound oiliness.',
          'Track how many days pass before grease returns after each bath.',
          'Persistent scaling with oil is a medical picture, not a brand problem.',
        ],
      },
      {
        id: 'chlorhexidine',
        title: 'What Chlorhexidine Is Actually For',
        content:
          "Chlorhexidine is an antiseptic, and medicated shampoos carrying it, often paired with a second antifungal agent, exist for skin overrun by bacteria and yeast, the infections that show as greasy sores, crusty patches, and that distinct musty odor. These are useful bottles and medical ones: they treat conditions, not skin types, and the right strength and contact time belong in a professional's instructions rather than a guess. If a dog's skin shows sores, hot-spot-type lesions, or keeps relapsing between baths, check with your veterinarian, who can diagnose whether an infection is the engine of the problem and prescribe the wash that actually addresses it.",
        callout: {
          type: 'vet-note',
          title: 'Medicated means diagnosed',
          text: 'Antiseptic shampoos work best at specific strengths and contact times for specific infections. Reach for them on a veterinarian\u2019s instruction, not on a hunch from the pet aisle.',
        },
        tips: [
          'Save chlorhexidine for diagnosed infections, not routine baths.',
          'Follow label contact times exactly; antiseptics need minutes, not moments.',
          'Report musty odor and greasy sores rather than re-bathing them.',
        ],
      },
      {
        id: 'allergy-skin',
        title: 'Allergy-Prone Skin Needs Strategy',
        content:
          "Allergic dogs itch, and no shampoo ends an allergy, though the right one lowers the burden a sensitized skin carries. Hypoallergenic and limited-ingredient formulas minimize the residues and plant extracts a reactive coat can object to, and they earn their place as the everyday bottle in allergic households. Medicated baths sometimes join them as part of a broader plan for secondary infections. The honest framing: bathing manages symptoms, while the allergy itself gets diagnosed and steered by a veterinarian, whether the trigger rides in food, pollen, or flea saliva. Frequent rinsing of paws after walks is the quiet superstar of the routine.",
        tips: [
          'Keep hypoallergenic as the default bottle in reactive households.',
          'Rinse paws after walks to remove pollen before it is licked.',
          'Treat the allergy with your vet and the symptoms with the bottle.',
        ],
      },
      {
        id: 'shampoo-map',
        title: 'Skin Type to Shampoo Family Map',
        content:
          "The full decision fits on one card. Read the skin, pick the family, and only then compare shampoo listings on the details, since the family does the therapeutic work and the details merely refine it. When a skin picture refuses to fit any row cleanly, that is the cue for a clinic rather than another bottle.",
        tableData: {
          headers: ['Skin picture', 'Formula family', 'Notes'],
          rows: [
            ['Normal and quiet', 'Mild maintenance shampoo', 'Dog-formulated; rinse thoroughly'],
            ['Dry and flaky', 'Colloidal oatmeal', 'Soothes and moisturizes ordinary dryness'],
            ['Greasy with odor', 'Degreasing formula', 'Alternate with gentle shampoo'],
            ['Red, itchy, reactive', 'Hypoallergenic, limited ingredient', 'Symptom care under a vet plan'],
            ['Sores, crusts, musty smell', 'Chlorhexidine medicated', 'Use on veterinary diagnosis'],
          ],
        },
        tips: [
          'Pick the family first; refine details inside it afterward.',
          'Skin that fits no row belongs to a clinic, not a shelf.',
          'Photograph skin changes monthly to keep the map honest.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Read the skin',
        items: [
          { highlight: 'Normal stays simple', text: 'a mild dog-formulated shampoo and a thorough rinse.' },
          { highlight: 'Dry asks for oatmeal', text: 'colloidal oatmeal soothes ordinary dryness and holds moisture.' },
          { highlight: 'Greasy asks to strip', text: 'degreasers alternate with gentle bottles to avoid rebound.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Respect the medical line',
        items: [
          { highlight: 'Chlorhexidine treats infection', text: 'bacteria and yeast, at vet-directed strength and contact time.' },
          { highlight: 'Allergies outlast bottles', text: 'the shampoo manages symptoms while diagnosis steers the plan.' },
          { highlight: 'Sores mean clinic', text: 'crusts, musty odor, and relapses outrank any shelf swap.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Bath habits matter',
        items: [
          { highlight: 'Human shampoo stays human', text: "the pH mismatch strips a dog's protective skin barrier." },
          { highlight: 'Rinse longer than lather', text: 'leftover residue quietly causes much of the itching.' },
          { highlight: 'Paw rinses win', text: 'water after walks beats most bottles for allergic dogs.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Can I use human shampoo on my dog?',
        answer:
          'Not as a habit. Dog skin runs at a different acidity than human skin, so even gentle human formulas, including baby shampoo, strip the protective barrier and leave a dog itchy after every bath. A dedicated dog shampoo costs little and preserves the barrier the coat depends on; save the human bottle for humans.',
      },
      {
        question: 'What does oatmeal shampoo actually do for dogs?',
        answer:
          'Finely milled colloidal oatmeal suspended in the wash calms irritated, dry skin and traps moisture against the surface, easing ordinary flaking and winter dryness. It is symptom care for routine dryness, though, not a treatment for allergies, parasites, or hormonal problems, which also present as flaky skin and need a diagnosis.',
      },
      {
        question: 'When should I use chlorhexidine shampoo on my dog?',
        answer:
          'When a veterinarian has identified a bacterial or yeast skin infection, the conditions behind greasy sores, crusty patches, and musty odor. The antiseptic needs the right strength and several minutes of contact time to work, so follow the professional instructions rather than improvising frequency from the label alone.',
      },
      {
        question: 'How often should I bathe a dog with itchy skin?',
        answer:
          'It depends on why the skin itches, which is the honest answer. Ordinary dryness prefers fewer baths with a longer rinse, allergic dogs often do well on a scheduled gentle routine a vet outlines, and medicated washes run on their own instructed intervals. Diagnose first, then set the calendar.',
      },
      {
        question: 'Do hypoallergenic dog shampoos really work?',
        answer:
          'They do the specific job they are built for, reducing exposure to fragrances, detergents, and plant extracts that reactive skin objects to. That genuinely lowers daily irritation for allergic dogs. What they cannot do is end the allergy itself, so pair the bottle with a diagnostic conversation rather than expecting it to carry the whole problem.',
      },
    ],
  },
};
