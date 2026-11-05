// Buying-pillar articles for Pawzsly U: six decision-guide pillars (clippers vs
// grinder, slow feeders, water fountains, puppy kit, kitten kit, rescue dog
// essentials). Original blog bodies written to the WRITING-SPEC.md contract:
// on-topic, blog voice, at least six sections of authentic prose, no hard selling.
import type { ArticleBody } from './types';

export const BUYING_PILLAR_ARTICLES: Record<string, ArticleBody> = {
  // =========================================================================
  // clippers-vs-grinder — the nail-trimming modality decision
  // =========================================================================
  'clippers-vs-grinder': {
    heroTitle: 'Choosing Between Dog Nail Clippers and a Grinder',
    heroSubheadline:
      "Two tools, one job, and a dog with opinions. Here is how speed, noise, vibration, and quick safety should drive your choice between clippers and a grinder.",
    metaDescription:
      'Dog nail clippers finish in seconds; grinders file smooth and forgive depth mistakes. Compare speed, noise, vibration, quick safety, and conditioning weeks.',
    introSummary:
      "Every groomer has watched the same scene: a dog who sits like a statue for the quiet squeeze of clippers, then turns into a contortionist the moment a grinder starts spinning. Another dog is the exact reverse. Nail care is not really a tool problem; it is a temperament problem wearing a tool costume. The honest way to choose is to weigh speed against smoothness, noise against silence, and how each tool treats the quick, then commit to the conditioning weeks that follow.",
    author: { name: 'Brea Stewart', role: 'Certified Dog Groomer' },
    heroImageUrl: '/seopages/images/hero_grooming_dog_1791411047518.jpg',
    heroImageAlt: 'A relaxed dog being groomed in a salon',
    sections: [
      {
        id: 'what-each-tool-does',
        title: 'What Each Tool Actually Does',
        content:
          "Clippers are a blade and a decision: you position, you squeeze, the nail is shorter in a single second. Grinders are a rotating file that removes material a layer at a time, rounding the edge as it works. The clipper trades control for speed, and the grinder trades speed for control. Neither one is the upgraded version of the other; they are different compromises. Most dogs end up with the tool their human can use confidently, because hesitation is the one thing every nail session punishes.",
        tips: [
          'Hold each tool in your hand before buying; the clipper needs grip strength you may not have.',
          "Count your dog's tolerance in seconds, then pick the tool that fits inside them.",
          'Remember the trade: clippers buy speed, grinders buy precision and a smoother edge.',
        ],
      },
      {
        id: 'speed-versus-smoothness',
        title: 'Speed Against Smoothness in Real Time',
        content:
          "Speed matters more than beginners expect, because a wriggly dog gives you a window, not an afternoon. A full clipper trim can finish before the dog has finished deciding to object. Grinders need several seconds of steady contact per nail, plus pauses to check progress, which stretches a session into patience territory. Smoothness is the grinder's answer: filed edges are rounded, so they stop catching on sweaters, couch fabric, and your shins. Many people who clip also finish with a quick pass of the file to lose the sharp corners.",
        tips: [
          'Time a practice session on a cooperative day to learn your dog\u2019s real window.',
          'File sharp clipper corners down, or they will snag furniture and skin for days.',
          'Expect grinding to take two or three times longer per paw than clipping.',
        ],
      },
      {
        id: 'noise-and-vibration',
        title: 'How Dogs Tolerate Noise and Vibration',
        content:
          "The grinder announces itself: a whirring motor in the ear and a buzz traveling up the leg, and either one can end the session before a nail is touched. Some dogs sleep through it; some accept the sound but not the vibration; some need the sanding drum introduced at a distance for days. Clippers make a quiet click, which noise-sensitive dogs appreciate, but the squeeze itself startles others. Watch your own dog's reaction to vacuums, blenders, and electric toothbrushes; that pattern predicts grinder acceptance better than any product description.",
        tips: [
          'Run the grinder near, then on, a tolerant paw before expecting real work.',
          'Choose clippers when household sounds already make your dog leave the room.',
          'Some grinders run quieter than others; read what reviewers say after months of use.',
        ],
      },
      {
        id: 'quick-safety',
        title: 'How Each Tool Treats the Quick',
        content:
          "The quick is the living core inside the nail, full of nerve and blood, and cutting it is the mistake everyone remembers. With clippers, the risk is geometric: you decide the depth before the cut, and a jerking paw can push the nail past your intended line. A grinder approaches the quick gradually instead, because you feel and see the material disappearing, and a small dark dot at the center warns you to stop. Dark nails hide the quick from sight either way, so trim small amounts regardless of tool.",
        callout: {
          type: 'warning',
          title: 'Keep styptic powder within reach',
          text: 'If you nick the quick, the nail bleeds generously. Press styptic powder into the tip and hold gentle pressure for a minute, then end the session calmly and let the paw rest a day.',
        },
        tips: [
          'Snip or grind thin slivers; depth decisions belong to patient hands, not confident ones.',
          'Look for the dark center dot while grinding and stop as soon as it appears.',
          'Work under good light so dark nails give up whatever hint they have.',
        ],
      },
      {
        id: 'tool-to-dog',
        title: 'Matching the Tool to the Dog',
        content:
          "There is no universal winner, only a fit between tool and temperament. A tolerant dog with clear white nails makes either tool easy, and a nervous one narrows your options fast. Use the table as a starting point, then let the first two sessions confirm or overrule it. As you compare clippers and grinders across marketplace listings, this same matching logic does more for you than any feature list. Dogs also change their answer with age, so revisit the fit once a year.",
        tableData: {
          headers: ['The dog you have', 'Tool that fits first', 'Why it works'],
          rows: [
            ['Squirms and counters every hold', 'Clippers', 'Whole paws finish in under a minute'],
            ['Sound-sensitive, calm on the table', 'Clippers', 'No motor humming in the ear'],
            ['Panics at the squeeze or pinch', 'Grinder', 'No sudden closing blade to startle the paw'],
            ['Dark, thick nails', 'Grinder', 'Gradual filing respects a hidden quick'],
            ['Senior dog with brittle nails', 'Grinder', 'Files crack-prone edges instead of crushing them'],
          ],
        },
        tips: [
          'Revisit the tool choice yearly; age and noise tolerance both drift over time.',
          'Buy the tool you will actually pick up weekly, not the impressive one.',
          'Many households end up owning both, and that is a reasonable ending.',
        ],
      },
      {
        id: 'conditioning-weeks',
        title: 'The Conditioning Weeks Either Tool Deserves',
        content:
          "No tool works on a dog who has not agreed to the process, and agreement is built in short sessions over weeks, not conquered in one heroic trim. Start with the tool resting near the food bowl, progress to touching a relaxed paw with it, then to one nail, then to one paw. Keep sessions under a few minutes and end them before your dog asks to leave. With a grinder, run it in the room before running it on the dog, because the sound alone is its own homework.",
        callout: {
          type: 'pro-tip',
          title: 'Pay the paw in snacks',
          text: 'A spoon of soft food licked slowly while you hold a paw buys more progress than any restraint. Feed the meal only during practice for a week and tolerance tends to arrive on schedule.',
        },
        tips: [
          "Move at the dog's pace: tool visible, then paw touched, then one nail filed.",
          'Cap practice at a few minutes; shorter sessions build trust faster than bravery.',
          'Skip a day after a stressful attempt and restart one step earlier.',
        ],
      },
      {
        id: 'maintenance-rhythm',
        title: 'Building a Rhythm You Can Keep',
        content:
          "Nails grow on their own schedule, and the tool you choose has to fit yours. A common signal that work is due: nails clicking on the floor when your dog walks across a quiet room, or claws catching in carpet. City dogs on pavement file their own fronts while rears lag, so check back paws often. Grinders earn their keep on maintenance trims every week or two, while clippers suit the monthly reset for a dog who tolerates longer sessions less often. Whichever rhythm you adopt, calendar it, because nobody notices long nails on time. The same rhythm question applies to whichever listing lands in your basket: the tool you will realistically reach for wins.",
        callout: {
          type: 'vet-note',
          title: 'Overgrown is a professional job',
          text: 'Nails that have curled toward the pad, or quicks stretched so far that no safe trim reaches the floor, belong with a groomer or clinic. Check with your veterinarian before attempting a rescue trim at home.',
        },
        tips: [
          'Listen for clicks on hard floors as your cue that trimming is due.',
          'Check rear paws monthly; fronts often wear down on their own.',
          'Book a standing reminder so the rhythm survives your busy months.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'scissors',
        title: 'Read the dog first',
        items: [
          { highlight: 'Silence or whirring', text: 'household noise reactions predict grinder tolerance better than packaging.' },
          { highlight: 'Windows, not afternoons', text: 'wriggly dogs need the tool that finishes each paw quickly.' },
          { highlight: 'Vibration is separate', text: 'some dogs accept the sound and still reject the buzz.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Respect the quick',
        items: [
          { highlight: 'Small slivers always', text: 'depth mistakes come from confident single cuts, not gradual filing.' },
          { highlight: 'Styptic powder nearby', text: 'nicks happen to careful people, and pressure stops them.' },
          { highlight: 'Dark dot means stop', text: 'the grinder shows its warning before the quick bleeds.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Condition before cutting',
        items: [
          { highlight: 'Weeks, not sessions', text: 'tolerance is trained with snacks, short minutes, and patience.' },
          { highlight: 'Sound gets homework too', text: 'run the grinder across the room before touching a paw.' },
          { highlight: 'End on a win', text: 'quit before your dog asks to, and tomorrow goes smoother.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Are grinders safer than clippers for dog nails?',
        answer:
          "Grinders are more forgiving, because material disappears in tiny layers and a dark dot at the nail's center warns you before the quick. Clippers are perfectly safe in experienced hands and faster per paw. The honest answer is that the safer tool is whichever one you can use without hurrying.",
      },
      {
        question: 'How do I trim my dog\u2019s black nails safely?',
        answer:
          'Take off thin slivers only, no matter which tool you hold. On light nails you can see the pink quick through the side; on black ones, the trimmed face shows a pale ring that darkens to a dot as you get close. That dot is your stop line, and a grinder reaches it more gradually.',
      },
      {
        question: 'Why does my dog hate the grinder but accept clippers?',
        answer:
          'Usually vibration, sometimes sound, occasionally both. The buzz of a rotating drum travels up the leg in a way the quiet squeeze of a blade never does, and some dogs find it unbearable. Try running the grinder near the paws for a few days without contact, or switch to clippers and finish the sharp edges by hand.',
      },
      {
        question: 'Can I use clippers and a grinder together?',
        answer:
          'Plenty of people do, and the combination is genuinely practical. Clip each nail quickly for length, then pass the grinder over the edges to round them off, so nothing catches on furniture or skin. It also splits the workload: the fast tool does the bulk while the slow tool polishes.',
      },
      {
        question: 'How long before a dog accepts nail trimming?',
        answer:
          'Plan on weeks of short conditioning sessions before a full trim, and expect the first complete session to happen in stages rather than one sitting. Dogs who were handled as puppies often settle within days; nervous adults can need a month of patient practice. Rushing the timeline is what creates the hate.',
      },
    ],
  },

  // =========================================================================
  // slow-feeder-guide — fast eaters, difficulty designs, honest switching
  // =========================================================================
  'slow-feeder-guide': {
    heroTitle: 'Slow Feeders: Turning a Ten-Second Meal Into Minutes',
    heroSubheadline:
      'A dog who inhales food swallows air, barely chews, and asks for more within the hour. The right slow feeder changes the pace without turning dinner into a fight.',
    metaDescription:
      'Maze bowls, ball designs, and snuffle mats all slow a fast eater. Here is how to match difficulty to your dog, switch honestly, and respect bloat risk.',
    introSummary:
      "Some dogs finish a bowl of kibble in the time it takes to close the food bin, then look up as though dinner never happened. Gulping is not just an unattractive habit; it brings swallowed air, barely chewed food, and the occasional meal reappearing on the rug minutes later. Slow feeders interrupt the inhale by making dogs work around obstacles, and the designs differ more than their pictures suggest. The craft is matching the maze to the dog, starting one level easier than the packaging suggests.",
    sections: [
      {
        id: 'why-pace-matters',
        title: 'Why Racing Through a Meal Matters',
        content:
          "Fast eating sends air down with the food, which shows up as belching and a round, drum-tight belly for an hour after meals. Many gulpers also vomit barely touched food, then eat it again without embarrassment. The serious concern is bloat, formally gastric dilatation-volvulus, where the stomach fills with gas and can twist; it is a life-threatening emergency that deep-chested breeds face more often. A slower bowl shrinks the swallowed-air problem and the sheer speed, though it is one layer of prevention, never a shield. Check with your veterinarian about your own dog's risk.",
        callout: {
          type: 'warning',
          title: 'Know the bloat emergency signs',
          text: 'A swollen, tight belly, unproductive retching, restlessness, and pacing right after a meal can mean a twisted stomach. Minutes count here, so call your veterinarian or the nearest emergency clinic immediately rather than watching and waiting.',
        },
        tips: [
          'Watch for drum-tight bellies and belching within the hour after meals.',
          "Ask your veterinarian how bloat risk runs in your dog's breed.",
          'Treat a slow bowl as one prevention layer, not the whole plan.',
        ],
      },
      {
        id: 'maze-designs',
        title: 'Maze Bowls and Their Dead Ends',
        content:
          "The maze bowl is the shape most people picture: raised ridges forming channels that kibble hides inside, so the tongue has to work along the paths. Difficulty scales with channel depth and how narrow the gaps run, which is why two bowls that look identical can behave nothing alike. Flat-faced breeds need shallow, wide mazes, because deep ridges press against breathing that already works uphill. Wide, shallow channels suit beginners and long-nosed dogs; deep spiral grooves slow a determined Labrador honestly. Check the listed dimensions before you order, since photos flatter every design.",
        tips: [
          'Compare channel depth in the listed dimensions, not in flattering product photos.',
          'Choose shallow, wide mazes for flat-faced breeds like pugs and bulldogs.',
          'Start beginners in wide channels before graduating to deep spiral grooves.',
        ],
      },
      {
        id: 'ball-and-peg',
        title: 'Balls, Pegs, and Moving Obstacles',
        content:
          "A step up from fixed mazes, these bowls center a free-rolling ball or a stationary peg arrangement over the food, so kibble keeps moving out of reach. The dog nudges, chases, and noses the obstacle aside, which takes more problem-solving than following a groove. That challenge is the appeal and the trap: persistent dogs stay engaged, while easily frustrated ones give up and stare at you instead. Supervise the first meals, and step the difficulty down if your dog leaves food behind rather than working for it.",
        tips: [
          'Supervise the first two meals so frustration never hardens into refusal.',
          'Step down the difficulty if kibble is still there an hour later.',
          'Save ball and peg designs for dogs who already solve maze bowls.',
        ],
      },
      {
        id: 'gentle-slope',
        title: 'The Gentle Slope Option for Beginners',
        content:
          "Before the maze era, slow feeding meant a raised center in an ordinary bowl, and that design still earns its place. Kibble slides down the smooth cone toward the rim, so gravity meters the meal while the dog eats in laps around the obstacle instead of one giant inhale. It slows dinner by a comfortable margin without any puzzle to solve, which suits seniors, shy eaters, and dogs who feel punished by complicated bowls. Think of the slope as the entry level of the ladder, and a sensible first purchase for a first-time slow feeder.",
        tips: [
          'Try a raised-center bowl before any puzzle if your dog discourages easily.',
          'The slope suits senior jaws that tire quickly on deep maze work.',
          'Lap-style eating stretches mealtime without asking anything of a tired mind.',
        ],
      },
      {
        id: 'difficulty-ladder',
        title: 'An Honest Difficulty Ladder',
        content:
          "Difficulty labels on packaging run optimistic, so calibrate against the dog instead. A bowl that is labeled intermediate can be trivial for a food-obsessed retriever and defeating for a dainty eater, which is why the ladder below describes dogs rather than designs. As you compare slow feeder listings, this same ladder reading does more for the purchase than the difficulty badge on the box. Move up one rung at a time, and treat any unfinished meal as a signal to retreat.",
        tableData: {
          headers: ['Design', 'Working level', 'Dog it suits'],
          rows: [
            ['Raised-center slope bowl', 'Gentle', 'Seniors, shy eaters, first-timers'],
            ['Shallow maze channels', 'Easy', 'Beginners and flat-faced breeds'],
            ['Deep maze or spiral', 'Moderate', 'Steady, food-driven gulpers'],
            ['Free-rolling ball or pegs', 'Hard', 'Persistent problem-solvers'],
            ['Snuffle mat', 'Moderate, different job', 'Sniffers who need mental work'],
          ],
        },
        tips: [
          'Match the rung to persistence, not to age or breed alone.',
          'Skim reviews for mentions of breeds and eating pace.',
          'Keep one easy bowl around for stressful days and travel.',
        ],
      },
      {
        id: 'snuffle-cousins',
        title: 'Snuffle Mats Are the Cousin',
        content:
          "Snuffle mats skip the bowl shape entirely: kibble hides among fleece strands, and the dog finds it with a nose instead of a strategy. The slowdown comes from searching, which is a different mental channel than obstacle navigation, and many dogs find it calmer and more satisfying. Mats tire a dog out the way a long sniffing walk does, making them cousins of slow feeders rather than members of the same family. They also travel well, spread flat in a bag, and work just as happily on a towel-covered floor at a hotel. Wash and dry them thoroughly, because strands hold moisture.",
        tips: [
          'Hide kibble deep in the strands for a longer, calmer search.',
          'Dry mats fully between uses, since damp fleece grows unpleasant things.',
          'Use the mat for a portion of dinner, not the entire ration.',
        ],
      },
      {
        id: 'switching-honestly',
        title: 'Switching Bowls Without a Standoff',
        content:
          "Some dogs accept a new bowl the first night; others stage a hunger strike that wins because the humans blink first. Switch honestly by feeding part of the meal from the old bowl while the new one sits beside it with a few treats inside, then shift the ratio over several days. Keep sessions relaxed and avoid standing over the dog, since pressure reads as threat at floor level. A dog who leaves food behind is telling you the difficulty is wrong, so come down a rung rather than pushing through. And if every meal goes untouched for a full day, the conversation belongs with your veterinarian.",
        callout: {
          type: 'pro-tip',
          title: 'Treats migrate first',
          text: 'Scatter a few high-value pieces into the new feeder a day before the first real meal. Dogs who have already won something from a bowl tend to forgive its weirdness at dinner time.',
        },
        tips: [
          'Run both bowls side by side for a week, shifting the ratio gradually.',
          'Step down a rung if meals go unfinished rather than pushing through.',
          'A full day refusing all food belongs with your veterinarian, not the bowl.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'shield',
        title: 'Respect the risk',
        items: [
          { highlight: 'Gulping brings air', text: 'belching and drum-tight bellies follow fast meals within the hour.' },
          { highlight: 'Bloat is an emergency', text: 'swollen belly with unproductive retching means immediate veterinary help.' },
          { highlight: 'Deep chests carry more', text: "ask your veterinarian where your dog's breed sits on that list." },
        ],
      },
      {
        icon: 'check',
        title: 'Climb the ladder',
        items: [
          { highlight: 'Start one rung easy', text: 'slope bowls and shallow mazes before spirals and pegs.' },
          { highlight: 'Read the dog', text: 'unfinished meals say the design is too hard, not the dog.' },
          { highlight: 'Flat faces need width', text: 'shallow channels keep breathing comfortable while they work.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Switch with patience',
        items: [
          { highlight: 'Two bowls, one week', text: 'shift the ratio gradually instead of swapping overnight.' },
          { highlight: 'Treats migrate first', text: 'a won prize forgives a strange bowl at dinner time.' },
          { highlight: 'Sniffing is a cousin', text: 'snuffle mats slow the search instead of the path.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Do slow feeder bowls actually work for fast eaters?',
        answer:
          'For most gulpers, yes, and the effect is visible at the first meal: what took thirty seconds becomes several minutes of deliberate foraging. The catch is matching difficulty, because a bowl that is too hard gets abandoned and one that is too easy changes nothing. Start one level easier than you think you need and climb from there.',
      },
      {
        question: 'Can a slow feeder be too difficult for my dog?',
        answer:
          'Absolutely, and refusal is how it shows up: kibble left behind, a dog that stares at you instead of the bowl, or a full hunger strike. Frustrated dogs are not stubborn, they are defeated, so come down a difficulty rung and try a shallower channel. Persistent problem-solvers are the only ones who need pegs and rolling balls.',
      },
      {
        question: 'Are snuffle mats better than slow feeder bowls?',
        answer:
          'They do a related job through a different channel. A bowl slows the path to the food; a mat slows the search for it, which tires the brain the way a sniffing walk does. Many homes keep both, using the bowl for everyday meals and the mat for rainy afternoons and travel. Dogs who love their noses prefer the mat.',
      },
      {
        question: 'How do I switch my dog to a slow feeder?',
        answer:
          'Run the new feeder beside the old bowl for several days, shifting the portion ratio a little each meal. Drop a few favorite treats into the new design so it pays out before it puzzles, and stay relaxed nearby rather than hovering. If dinner goes untouched, drop a difficulty level instead of insisting, and try again the next day.',
      },
      {
        question: 'Should I worry about bloat if my dog eats fast?',
        answer:
          "Eating quickly is one of several factors associated with bloat, and deep-chested breeds carry the greater structural risk, so the concern is reasonable. A slow feeder removes speed and swallowed air from the equation but does not erase the breed factor. Ask your veterinarian about your dog's specific risk and what symptoms should send you to a clinic immediately.",
      },
    ],
  },

  // =========================================================================
  // water-fountain-guide — the capacity/cost/material/noise decision guide
  // =========================================================================
  'water-fountain-guide': {
    heroTitle: 'Pet Water Fountains: Picking Capacity, Material, and Noise',
    heroSubheadline:
      'The best fountain for your home is the one you will actually maintain. Capacity, filter costs, material, pump hum, and cleaning effort decide that long before style does.',
    metaDescription:
      'Compare pet water fountains honestly: capacity per pet, yearly filter costs, plastic versus ceramic versus steel, pump noise, and cleaning effort you accept.',
    introSummary:
      "How many animals drink from the bowl you're replacing? That single question steers more of this purchase than any feature list, because a fountain that serves one picky cat and one serving a house of three dogs are different products wearing similar shapes. This is the decision side of the topic: capacity, the slow drip of filter costs, the material trade-offs, and how much noise and scrubbing you will tolerate. The health side of moving water is a story for another article; here we choose the machine.",
    sections: [
      {
        id: 'capacity-first',
        title: 'Start With the Headcount, Not Features',
        content:
          "Capacity is the first honest filter. A single indoor cat can live happily on a small fountain, while multi-pet households watch small reservoirs empty between breakfast and dinner, leaving the pump sucking air. As you compare fountains, look at the reservoir size and picture your animals' combined drinking, because topping up twice a day defeats the reason most people buy one. Bigger tanks mean fewer refills but a heavier unit to carry to the sink and longer scrubbing sessions, so capacity is a trade rather than an upgrade. Size for the pets you have, plus one visiting guest.",
        tips: [
          'Size the reservoir for every animal in the house, then add a margin.',
          'Weigh the filled unit in your mind before ordering the largest tank.',
          'Remember bigger capacity stretches cleaning day, not just refills.',
        ],
      },
      {
        id: 'filter-math',
        title: 'Filter Costs Compound Quietly',
        content:
          "The sticker is not the price; the filters are. Every cartridge has a working life measured in weeks, and multi-pet homes push through them faster as hair and saliva load the water. Before you commit, find the replacement interval in the listing, the pack sizes sold, and whether the design takes a standard charcoal pad or a proprietary cartridge you can only source one way. Multiply the pack price by a year of changes and the true cost appears. Proprietary filters are not a dealbreaker, but their availability deserves a look before checkout.",
        callout: {
          type: 'pro-tip',
          title: 'Do the yearly math first',
          text: 'Find the cartridge interval and pack size, multiply for twelve months, and compare that number across the fountains on your shortlist. The cheapest fountain up front is rarely the cheapest one to own.',
        },
        tips: [
          'Check whether replacements are standard pads or a proprietary cartridge shape.',
          'Shorten the swap interval when several pets share one fountain.',
          'Add a spare pack to the first order so a lapse never tempts you.',
        ],
      },
      {
        id: 'material-choice',
        title: 'Plastic, Ceramic, or Stainless Steel',
        content:
          "Material decides weight, scratch resistance, and how much scrubbing your Sunday self owes the fountain. Plastic is light and kind to budgets but scratches over time, and those fine grooves give slime somewhere to hold on; some cats even develop chin breakouts on plastic. Ceramic brings welcome heft that dogs cannot shove across the floor and a surface that scrubs bright, at the cost of being breakable when dropped. Stainless steel shrugs off scratches, dents instead of shattering, and suits clumsy households best. The table turns those trade-offs into a fast decision.",
        tableData: {
          headers: ['Material', 'Daily reality', 'Watch for'],
          rows: [
            ['Plastic', 'Light, budget-friendly, easy to move', 'Scratches hold biofilm; chin bumps for some cats'],
            ['Ceramic', 'Heavy and stable, scrubs gleaming', 'A drop on tile can end it'],
            ['Stainless steel', 'Tough, scratch-resistant, dishwasher-simple', 'Can dent; lighter than it looks'],
            ['Mixed designs', 'Steel or ceramic bowl on a plastic base', 'Clean the seam where materials meet'],
          ],
        },
        tips: [
          'Pick ceramic or steel when a determined dog shoves bowls around.',
          'Inspect plastic fountains for scratches at every deep clean.',
          'Scrub the seams on mixed-material designs, where slime collects first.',
        ],
      },
      {
        id: 'pump-noise',
        title: 'Pump Hum and Gurgle Reality',
        content:
          "Every fountain makes some sound; the question is which sound and when. A healthy pump produces a low, steady hum most homes stop hearing within a day. The noises worth avoiding are the splashy gargle of a low water level and the dry rattle of a pump running on air, both of which mean the reservoir needs topping or the impeller needs attention. Where the fountain lives matters too, since tile and wood amplify vibration the way a table turns a phone into a speaker. Pump upkeep is its own topic; here, just test the volume you can live beside.",
        tips: [
          'Top the reservoir before the pump starts gargling air.',
          'Set a mat beneath the fountain to quiet vibration on hard floors.',
          'Read what long-term owners say about noise in reviews after months.',
        ],
      },
      {
        id: 'cleaning-effort',
        title: 'Cleaning Effort Is the Real Price',
        content:
          "Fountains come apart into bowls, towers, filters, and a pump with small parts, and every piece wants scrubbing on a schedule. Count the components before you buy and picture the disassembly in your own sink, because a design with six fiddly parts tends to wait for motivation while a two-piece fountain gets cleaned on time. Ceramic and steel forgive a run through the dishwasher where plastic can warp, which quietly decides compliance. Smooth, simple interiors beat decorative crevices, however handsome the sculpted petals look in photographs.",
        tips: [
          'Count the parts that need scrubbing before admiring the design.',
          'Favor dishwasher-safe components; hand-washing pumps and crevices fades fast.',
          'Put deep cleans on the calendar so slime never gains a foothold.',
        ],
      },
      {
        id: 'placement-power',
        title: 'Placement and Cord Practicalities',
        content:
          "A fountain is an appliance that happens to hold water, so it needs an outlet, a cord strategy, and a floor that forgives splashes. Check the cord length against the wall you have in mind, and look for a low-voltage adapter meant for pet appliances rather than improvising. A drip loop keeps water from traveling the cord toward the socket, and a mat protects hardwood from the splash ring that forms around enthusiastic drinkers. Cats often prefer their water some distance from food and litter, so plan a spot before the box arrives rather than after.",
        tips: [
          'Measure the cord run to the nearest outlet before ordering anything.',
          'Arrange a drip loop so water never rides the cord to the socket.',
          'Give cats a drinking spot away from the food and litter stations.',
        ],
      },
      {
        id: 'listing-skeptic',
        title: 'Reading Fountain Listings Like a Skeptic',
        content:
          "Once the shortlist exists, read it like someone who has owned a fountain before. Reviews written after a few months tell you about pump longevity, filter availability, and whether the gurgle stays polite; early reviews mostly record excitement. Look for replacement parts and pump spares in the same listing family, because a fountain without them has a lifespan set by its first failure. When two models tie, let the yearly filter math and the parts count break it, not the flower-shaped spout. That comparison habit is worth more than any single feature.",
        callout: {
          type: 'vet-note',
          title: 'Drinking changes outrank any fountain',
          text: 'A pet suddenly drinking far more or less water deserves a check with your veterinarian before it deserves new hardware. Fountains encourage sipping; they do not explain shifts.',
        },
        tips: [
          'Favor reviews written months in, which speak to pumps and filters.',
          'Confirm replacement parts exist before the first purchase, not after.',
          'Let filter math and parts count break ties between similar models.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Size by headcount',
        items: [
          { highlight: 'Reservoir beats features', text: 'count every drinking animal before comparing anything else.' },
          { highlight: 'Heavy is stable', text: 'ceramic and full tanks resist the daily nose-shove.' },
          { highlight: 'Top before gargling', text: 'low water levels make pumps noisy and unhappy.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Own the upkeep',
        items: [
          { highlight: 'Filters are the price', text: 'multiply one year of cartridges before any checkout.' },
          { highlight: 'Parts count matters', text: 'fountains you can disassemble quickly get cleaned honestly.' },
          { highlight: 'Spares extend lifespans', text: 'available pump spares and pads outlive sealed designs.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Choose material honestly',
        items: [
          { highlight: 'Plastic scratches quietly', text: 'fine grooves give slime a lasting, hidden home.' },
          { highlight: 'Ceramic brings heft', text: 'stable on the floor, though a drop can finish it.' },
          { highlight: 'Steel forgives life', text: 'it dents instead of shattering in clumsy households.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'What size water fountain do I need for multiple pets?',
        answer:
          'Count every animal that will drink from it and choose a reservoir that absorbs their combined day without a midday refill. Two cats live comfortably on a modest tank, while a household of dogs can drain small fountains between meals. When in doubt, size up one step, since extra capacity only costs you a heavier cleaning day.',
      },
      {
        question: 'How often do pet fountain filters need replacing?',
        answer:
          'Follow the interval the manufacturer states for your model, because cartridge lives differ by design, and shorten it when several pets share the water or debris loads it quickly. A cartridge past its working life stops doing its job long before it looks exhausted. Keep spares on hand so the schedule never slips for want of a part.',
      },
      {
        question: 'Are ceramic fountains better than plastic ones?',
        answer:
          'Ceramic wins on stability and scrubbing: the weight stays put against a nudging dog, and the glazed surface resists the scratches where slime takes hold. Plastic wins on price and portability, and it survives being dropped. Some cats develop chin irritation on plastic, so a ceramic or steel bowl solves that simply. Better is really about your household.',
      },
      {
        question: 'Why does my pet fountain get louder over time?',
        answer:
          'Usually the water level, sometimes the pump. As the reservoir drops, the pump starts pulling air and the sound shifts from hum to gargle, which a top-up fixes in seconds. If the noise persists at a full level, the impeller likely needs cleaning, since hair and mineral buildup unbalance it. Maintenance details live in our separate pump-care article.',
      },
      {
        question: 'Do pet water fountains use much electricity?',
        answer:
          'The circulating pumps in pet fountains draw very little power, comparable to the small appliances that run quietly around a home, so the running cost rarely changes a utility bill in a way you would notice. The real recurring costs are filters and your cleaning time, not electricity. Unplug safely before disassembling for a scrub rather than leaving it live.',
      },
    ],
  },

  // =========================================================================
  // new-puppy-starter-kit — buy-before-arrival-day logic
  // =========================================================================
  'new-puppy-starter-kit': {
    heroTitle: 'New Puppy Starter Kit: What to Buy Before Arrival',
    heroSubheadline:
      'Puppies arrive with tiny needs and huge consequences. Buy the safety layer before the door opens, then let the dog reveal the rest of the list over the first month.',
    metaDescription:
      'Build a new puppy starter kit around arrival day: confinement zones, the first-night bed decision, week-one essentials, and what can honestly wait a month.',
    introSummary:
      "The classic first-time mistake is a shopping spree the weekend before pickup: three beds, a mountain of toys, matching bowls, and a wardrobe. By week two, half of it is chewed, ignored, or outgrown. A puppy needs far less than excitement suggests, and the needs arrive in an order worth respecting: safe containment first, sleep solved next, then food that does not change on day one. Everything else can wait for the animal who shows up, because preferences emerge slowly and duplicates bought early usually gather dust.",
    heroImageUrl: '/images/golden_portrait.jpg',
    heroImageAlt: 'A golden retriever resting calmly at home',
    sections: [
      {
        id: 'arrival-day-logic',
        title: 'Why Arrival Day Is Not Shopping Day',
        content:
          "The first forty-eight hours with a new puppy run on chaos and naps, not errands. Whatever is not already in the house when the puppy crosses the threshold becomes a problem you solve while exhausted, so the buying logic is simple: everything that keeps the animal safe and fed gets purchased days ahead. Shopping also steals attention those first hours are begging for, since a puppy landing in a strange house needs supervision more than equipment. Finish the list early, then spend arrival week watching the creature you actually bought.",
        tips: [
          'Complete every purchase at least several days before the pickup date.',
          'Keep arrival day clear of errands, visitors, and any shopping trips.',
          'Supervision beats gear during the first two days of adjustment.',
        ],
      },
      {
        id: 'confinement-zones',
        title: 'Confinement Zones Before Open Freedom',
        content:
          "An eight-week-old puppy given a whole house will treat it as one enormous bathroom and chewing gallery, so build the small world first. An exercise pen around a crate, or a gated puppy-proofed kitchen, gives the animal room to move without room to fail. Choose flooring you can mop, remove cords and rugs from the zone, and set the crate inside as the bedroom rather than the whole nursery. The pen is temporary architecture, which is exactly why it deserves planning: confinement is how you prevent the habits you would otherwise spend months undoing.",
        tips: [
          'Set the pen on moppable flooring, well away from cords and rugs.',
          'Put the crate inside the pen so sleep has its own room.',
          'Expand territory one room at a time as trust and bladder earn it.',
        ],
      },
      {
        id: 'first-night-bed',
        title: 'The First-Night Bed Decision',
        content:
          "Night one is a decision about sleep for the whole family, and the bed is only half of it. Most puppies settle fastest in a crate beside your bed, where breathing and smell answer the loneliness of leaving the litter; a plush bed alone in a distant kitchen usually produces hours of crying. Choose a washable, simple cushion rather than the beautiful orthopedic model, because the first bed is a chewing risk and an accident sponge. Whatever you pick, plan to wash it weekly and replace it once, so treat the first one as a rental rather than an heirloom.",
        callout: {
          type: 'warning',
          title: 'Collars off inside the crate',
          text: 'A dangling tag can catch on crate bars during a restless night. Take the collar off at crate time and hang it on the door handle, where the jingle still tells you the puppy is moving.',
        },
        tips: [
          'Start the crate beside your bed and move it outward over weeks.',
          'Choose washable cushions over beautiful ones for the first rotation.',
          "Bring home a blanket carrying the litter's scent from the breeder.",
        ],
      },
      {
        id: 'first-week-versus-month',
        title: 'First Week Versus the First Month',
        content:
          "The kit splits into two honest timelines: what arrival week demands and what a settled month reveals. Buying everything at once wastes money on guesses, because the puppy who sleeps curled in a ball may become the puppy who sprawls across a sofa-sized bed within a season. The table below draws the line so the money lands where the needs actually are. As you compare puppy gear across listings, this timeline does more for your basket than any checklist claiming otherwise.",
        tableData: {
          headers: ['Timeline', 'Worth buying', 'The reason'],
          rows: [
            ['Day one', 'Crate, pen, washable bed, bowls', 'Safety and sleep outrank everything else'],
            ['Day one', 'The same food the breeder fed', 'Stomachs dislike two changes at once'],
            ['Week one', 'Enzymatic cleaner and light collar', 'Messes and ID needs arrive immediately'],
            ['Within a month', 'Better bed, harness, training treats', 'Size and preferences start showing'],
            ['Wait past a month', 'Wardrobes, bulk toys, fancy gear', 'The real dog has not finished arriving'],
          ],
        },
        tips: [
          'Buy the safety layer now and the comfort layer after preferences surface.',
          'Keep receipts for duplicate-risk purchases like beds and harnesses.',
          'Add one item at a time so each need proves itself first.',
        ],
      },
      {
        id: 'food-continuity',
        title: 'Food Continuity for a Changing Stomach',
        content:
          "Ask what the breeder or rescue feeds and buy exactly that before pickup, because a new house, new water, and new schedule already stress a puppy's digestion. If a switch makes sense later, transition gradually across a week or more, blending rising proportions of the new food into the old. Bowls want simplicity rather than engineering: two stainless steel dishes, one for water and one for meals, dishwasher-safe and impossible to chew. Questions about how much to feed and growth formulas deserve a check with your veterinarian at the first puppy visit.",
        tips: [
          'Buy the current food brand and formula before the puppy arrives home.',
          'Blend any food change over a week or longer to spare the stomach.',
          'Choose plain stainless bowls; puppies chew everything prettier eventually.',
        ],
      },
      {
        id: 'chews-toys-preferences',
        title: 'Toys Without Buying Duplicates Early',
        content:
          "Teething arrives on schedule, and the chewing it brings is a need rather than a flaw, so plan for it without hoarding. Buy one soft plush, one rubber chew, and one freezer-friendly format, then watch which style the puppy actually honors before multiplying anything. Puppies are astonishingly specific: some ignore plush forever and live for rubber, others destuff everything with professional enthusiasm. Rotating three toys keeps each one interesting, while a dozen scattered on the floor turns them all into background noise. Anything with squeakers, ribbons, or eyes should wait for supervised months, because swallowable details are how toy baskets cause vet trips. As you compare toy listings, rotation beats abundance: three rotated choices outperform a heap.",
        callout: {
          type: 'warning',
          title: 'Details that end up inside puppies',
          text: 'Squeakers, plastic eyes, ribbons, and stuffing all travel the same road once detached, and swallowed pieces can obstruct a gut. Inspect toys weekly, retire anything fraying, and save the elaborate designs for supervised play only.',
        },
        tips: [
          'Start with three toy styles and let preference pick the fourth.',
          'Rotate the stock daily so each toy keeps its novelty.',
          'Inspect weekly for loose eyes, ribbons, and seams coming apart.',
        ],
      },
      {
        id: 'what-can-wait',
        title: 'The Patient List and the Early Vet',
        content:
          "Patience saves real money: grooming tables, wardrobes, specialty beds, agility tunnels, and bulk treat boxes all answer questions a month will answer for free. Growth ruins sizing guesses, and personality ruins style guesses, so the honest move is waiting until the dog starts telling on itself. Two things should never wait, though: identification on the collar from the first car ride home, and a first veterinary visit scheduled for the earliest sensible date. Ask your veterinarian about vaccination timing before any park, class, or sidewalk socializing, because the socialization window is wide but not risk-free.",
        tips: [
          'Register any microchip and update the tag during week one.',
          'Book the first clinic visit before the puppy finishes settling in.',
          'Hold off on size-dependent gear until growth steadies around month two.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'shield',
        title: 'Safety before style',
        items: [
          { highlight: 'Containment comes first', text: 'a pen and crate prevent habits you would otherwise undo.' },
          { highlight: 'ID from day one', text: 'tags and microchip registration outrank every comfort purchase.' },
          { highlight: 'Cords out of reach', text: 'the puppy zone starts with hazards removed, not added.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Sleep solves everything',
        items: [
          { highlight: 'Crate near your bed', text: 'breathing sounds answer the first nights of loneliness.' },
          { highlight: 'Washable beats beautiful', text: 'the first bed is an accident sponge and a chew risk.' },
          { highlight: 'Scent travels home', text: 'a litter blanket softens the strangest night of the year.' },
        ],
      },
      {
        icon: 'check',
        title: 'Buy slow, watch closely',
        items: [
          { highlight: 'Three toys first', text: 'let demonstrated preference pick the fourth and fifth.' },
          { highlight: 'Food stays familiar', text: 'change the house and the water before you change dinners.' },
          { highlight: 'A month reveals', text: 'size and personality answer questions that money cannot.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'What should I buy before bringing my puppy home?',
        answer:
          'The short version: a crate and exercise pen, a washable simple bed, stainless bowls, the food the puppy already eats, a light collar with a tag, enzymatic cleaner, and three toy styles to test. Everything beyond that list answers needs the dog has not revealed yet, and a month of watching outperforms a weekend of guessing.',
      },
      {
        question: 'Should my puppy sleep in a crate the first night?',
        answer:
          'For most households, yes, with the crate beside your bed for the first stretch of nights. Puppies leaving the litter lose the warmth and noise they were born into, and a distant lonely room turns that loss into hours of crying. Move the crate gradually toward its permanent spot once sleep settles into a pattern.',
      },
      {
        question: 'When can I switch my puppy to a different food?',
        answer:
          'Wait until the puppy has been home and eating normally for at least a solid week, then blend the new formula into the old across seven to ten days, raising the proportion gradually. Watch stool quality as you go and slow the transition if it loosens. For guidance on the timing and the target formula, check with your veterinarian.',
      },
      {
        question: 'What can wait a month after my puppy arrives?',
        answer:
          'The premium bed, the harness in a guessed size, wardrobes, grooming equipment beyond a soft brush, bulk treat boxes, and any specialized training gear. Growth and temperament answer most of those questions for free within a few weeks, and the gear you buy after watching fits better than gear bought against a guess.',
      },
      {
        question: 'How many toys does a new puppy actually need?',
        answer:
          'Three well-chosen styles beat a basket of thirty: one soft, one rubber, and one cold-friendly teething format, rotated so each stays interesting. Puppies have strong opinions that only emerge with exposure, so buy small, watch what gets honored, and multiply the winner. Reserve anything with small parts for supervised sessions.',
      },
    ],
  },

  // =========================================================================
  // new-kitten-starter-kit — safe room, litter math, scratchers, proofing
  // =========================================================================
  'new-kitten-starter-kit': {
    heroTitle: 'The New Kitten Starter Kit: Safe Room and Beyond',
    heroSubheadline:
      "A kitten's world should start small and grow with their confidence. Build the safe room first, then add territory one door at a time as the newcomer earns it.",
    metaDescription:
      'Set up a new kitten starter kit around a safe room: one litter box per cat plus one, scratchers before habits form, and honest kitten-proofing of every cord.',
    introSummary:
      "A kitten weighs a few pounds and generates chaos like something far larger, which is why experienced people begin with a single room rather than a whole house. The safe room holds everything a newcomer needs for the first weeks: a litter box, water, a bed with a hiding option, a scratcher, and safe toys. From that base you expand outward gradually, watching confidence instead of the calendar. The shopping list follows the same principle, small and specific first, with anything sized for the adult cat waiting its turn.",
    heroImageUrl: '/images/orange_cat.jpg',
    heroImageAlt: 'An orange tabby cat resting indoors',
    sections: [
      {
        id: 'safe-room-setup',
        title: 'One Room Before the Whole Home',
        content:
          "The safe room is a compression chamber for confidence: small enough to patrol, simple enough to understand, and quiet enough to decompress in. Stock it with a litter box far from the food, a water dish, a bed that offers cover, a scratcher, and a couple of toys, then let the kitten govern the pace of exploring. Hiding spots are not optional furniture; a cardboard box on its side does more for a nervous first week than most products. When the door stays open by choice, the world is ready to grow.",
        tips: [
          'Keep litter, food, and water in three separate corners of the room.',
          'Leave a cardboard box on its side as the first hide.',
          "Open the door on the kitten's schedule, not the household's curiosity.",
        ],
      },
      {
        id: 'litter-box-math',
        title: 'Litter Boxes Plus One, Always',
        content:
          "The counting rule saves relationships: one box per cat, plus one spare, so a two-cat home offers three boxes in separate spots. For a kitten, choose a box with a low entry they can climb over on clumsy legs, sized up as they grow, since a full-height adult box can defeat an eight-week-old. Very young kittens do better with a plain, unscented, non-clumping litter, because tasting litter is a phase some kittens pass through. Skip hoods for the first months, since a visible box in the open teaches reliable habits faster than privacy does.",
        callout: {
          type: 'pro-tip',
          title: 'Location is half the litter battle',
          text: 'A box beside a loud appliance gets used reluctantly, and one next to the food dish gets avoided on principle. Pick quiet, reachable corners the kitten can find at a sprint, because urgency arrives without warning in young cats.',
        },
        tips: [
          'Count one box per cat, then add a spare in a separate corner.',
          'Start kittens on low-entry boxes and size up as legs lengthen.',
          'Use unscented, non-clumping litter while the tasting phase lasts.',
        ],
      },
      {
        id: 'scratchers-first',
        title: 'Scratchers Before Furniture Habits Form',
        content:
          "Cats scratch to stretch, mark, and shed claw sheaths, and the habit finds a surface within days, so the scratcher should be in the room before the kitten is. Offer both orientations early: a tall, sturdy post for the full-body vertical stretch and a flat cardboard pad for the horizontal habit. Tall means matching an adult cat's full stretch, not a kitten's current size, so buy for the cat they become. Sturdy means it does not wobble when claws dig in, because one tipping incident can put a kitten off posts for months. Place scratchers near the bed and beside any furniture you are protecting, since cats stretch on waking.",
        tips: [
          'Install the tall post before the kitten arrives, not after.',
          'As you compare scratcher listings, check base weight before carpet color.',
          'Reward every voluntary scratch on the post within the first weeks.',
        ],
      },
      {
        id: 'kitten-proofing',
        title: 'Kitten-Proofing the Real Hazards',
        content:
          "Kittens explore with teeth and gravity, and the house hides more projectiles and swallowables than any owner expects. Cords are the headline hazard: charger and blind cords get chewed, so encase them in protectors or tack them out of reach entirely. Small swallowables come next, meaning hair ties, rubber bands, string, and the glued eyes on cheap toys, all of which can obstruct a gut. Check the plant shelf before anything else, since lilies are severely toxic to cats even from a licked leaf or pollen dust. Finally, block the gaps behind appliances, because kittens wedge into spaces no full-grown cat would consider.",
        callout: {
          type: 'warning',
          title: 'Lilies and cats do not mix',
          text: 'Every part of a lily, including pollen that brushes off on fur and gets licked away, can cause fatal kidney failure in cats. If a lily is ever in the house, call your veterinarian or an emergency clinic immediately, even before symptoms show.',
        },
        tips: [
          'Encase or tack up every charger and blind cord the kitten can reach.',
          'Sweep for hair ties, rubber bands, and string at kitten floor level.',
          'Walk every room on your knees to find hazards at kitten height.',
        ],
      },
      {
        id: 'beds-carriers-confidence',
        title: 'Beds and Carriers That Build Confidence',
        content:
          "A kitten's first bed should offer cover, because sleep happens where hiding happens: a cave-style bed, a covered cushion, or a simple tented blanket beats an exposed plush pillow for the first weeks. Add a top-opening carrier to the kit and leave it out as furniture with a towel inside, since cats who sleep near their carrier walk into it willingly for vet days. The carrier earns its cost on the first trip to the clinic, and a panicking cat in a front-loader will teach you why top access matters. The same leave-it-out trick works for harnesses later.",
        tips: [
          'Choose a covered or cave-style bed for the earliest nervous weeks.',
          'Leave the carrier open as normal furniture from the very first day.',
          'Favor top-loading carriers for the scruff-and-lift stage of cat handling.',
          'As you compare carrier listings, weigh top access against front doors.',
        ],
      },
      {
        id: 'hunting-toys',
        title: 'Toys That Practice Real Hunting',
        content:
          "Kitten play is hunting rehearsal, so the toy box should honor the whole sequence: stalk, chase, pounce, and carry. Wand toys with feathers or fabric on a string cover the first three stages under your supervision, while small balls and soft mice honor the carry. Never let hands or fingers play the prey role, because the kitten records that lesson permanently and the adult cat keeps teaching it. Keep string-based toys locked away between sessions, since the cord that made play fun is the same cord that endangers a gut left unattended.",
        tips: [
          'Run short wand sessions daily to tire the hunting brain honestly.',
          'Keep fingers out of the game so hands never become prey.',
          'Store string and wand toys away when the session ends.',
        ],
      },
      {
        id: 'expansion-vet',
        title: 'Expanding Territory and the Early Vet',
        content:
          "When the safe room stops being interesting, open one door at a time and supervise the new floor like a first visit, watching for hiding streaks that say the pace outran the kitten. Keep the litter box in its original spot through the expansion, because moved boxes are the quiet cause of disappeared habits. Schedule the first clinic visit early in week one or two for a check, vaccine planning, and a spay or neuter timeline; check with your veterinarian on timing rather than waiting for a reminder card. Growth-stage food and portions get settled at the same visit, which saves guessing.",
        tips: [
          'Let the kitten set the pace for opening new doors.',
          'Leave the litter box where it started until habits are rock solid.',
          'Book the first check-up inside the opening fortnight, not after trouble.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'shield',
        title: 'Start with one room',
        items: [
          { highlight: 'Small builds confidence', text: 'a single room lets a nervous newcomer decompress.' },
          { highlight: 'Hides are essential', text: 'a cardboard box outperforms most products in week one.' },
          { highlight: 'Expand on their schedule', text: 'doors open when curiosity, not the calendar, says so.' },
        ],
      },
      {
        icon: 'check',
        title: 'Count the boxes',
        items: [
          { highlight: 'One per cat, plus one', text: 'in separate corners, never clustered in a row.' },
          { highlight: 'Low entries first', text: 'climbing adult box walls defeats clumsy kitten legs.' },
          { highlight: 'Skip hoods early', text: 'visible open boxes teach the most reliable habits.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Protect the adventurer',
        items: [
          { highlight: 'Cords get chewed', text: 'encase chargers and blind pulls out of kitten reach.' },
          { highlight: 'Small items vanish', text: 'hair ties and string belong in drawers, not floors.' },
          { highlight: 'Lilies are lethal', text: 'one licked leaf means an immediate call to the clinic.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How many litter boxes does a new kitten need?',
        answer:
          'The standing rule is one box per cat plus one extra, so a single-kitten home sets up two, placed in separate quiet spots rather than side by side. Kittens learn fastest on low-entry, open boxes with unscented litter. The spare matters more as they grow and territories form, but the habit of providing it starts now.',
      },
      {
        question: 'Do kittens need a scratching post right away?',
        answer:
          'Yes, and ideally it waits in the room before the kitten does. Scratching is stretching, claw care, and territory marking rolled together, and the habit attaches to whatever surface it meets first. A tall, stable post plus a flat cardboard pad covers both habits, and placement near the bed and protected furniture beats any deterrent spray.',
      },
      {
        question: 'What should I kitten-proof before the kitten arrives?',
        answer:
          'Work through four categories: cords, swallowables, plants, and gaps. Encase or raise charger and blind cords; sweep floors of hair ties, rubber bands, and string; move every lily out of the house entirely; and block the spaces behind appliances. Getting on your knees room by room finds the rest, since hazards live at kitten height, not human height.',
      },
      {
        question: 'Where should my new kitten sleep at night?',
        answer:
          'Inside the safe room, in a bed that offers cover, with the door closed for the first stretch of nights. Kittens tolerate solitude better after a busy hunting session, so run a wand toy hard before bed and leave a small meal. A covered cave-style bed near, but not on, the litter corner gives them somewhere dark and defensible.',
      },
      {
        question: 'Can kittens play with string or ribbon toys?',
        answer:
          'Only under direct supervision, and never unattended. String, ribbon, and similar cords can cause dangerous intestinal blockages when swallowed, and kittens swallow what they catch. Wand toys satisfy the same chase with the cord anchored in your hand, then go into a drawer when the session ends. Treat loose string the way you treat hair ties: as a swallowed-object risk.',
      },
    ],
  },

  // =========================================================================
  // rescue-dog-essentials — decompression, 3-3-3, ID, scent, delayed shopping
  // =========================================================================
  'rescue-dog-essentials': {
    heroTitle: 'Rescue Dog Essentials for Those First Decompression Weeks',
    heroSubheadline:
      'The dog who rides home is not the dog you will live with. Buy for the shell first, then shop again once the real animal steps out of it.',
    metaDescription:
      'Rescue dog essentials for the settling-in stretch: the 3-3-3 rule, identification from day one, scent comfort, and gear to delay until the real dog appears.',
    introSummary:
      "The drive home is quiet in a particular way: a dog you barely know, riding in a car they barely know, toward a house they have never smelled. What you buy for that stretch of weeks matters less than what you refuse to buy. Decompression asks for a small world, secure identification, and smells that say safety, while the wardrobe, the toy library, and the perfect bed can all wait for the animal who appears once the shell cracks. Here is the honest list, split by timing.",
    heroImageUrl: '/images/golden_portrait.jpg',
    heroImageAlt: 'A calm golden retriever settled at home',
    sections: [
      {
        id: 'decompression-first',
        title: 'Decompression Comes Before Everything Else',
        content:
          "The first days home should be deliberately boring. No welcome party, no trip to the pet store, no neighborhood introductions, just a leash, a quiet house, and permission to watch. Many rescue dogs spend the initial stretch holding themselves together, polite and frozen, and the kindness they need most is low demand. Let them learn the sounds of your home from a bed in the corner, and let sleep come whenever it wants to. The gear that helps here is unglamorous: a gated room, a water bowl, and time.",
        tips: [
          'Keep the first three days deliberately boring, with visitors politely postponed.',
          'Let the dog observe the household from a quiet corner bed.',
          'Save outings, errands, and introductions for the weeks that follow.',
        ],
      },
      {
        id: 'three-three-three',
        title: 'What the Three-Three-Three Rule Means',
        content:
          "Rescue people lean on a rough map called the three-three-three rule: around three days to decompress from the move itself, three weeks to learn your routine and start showing personality, and three months to feel at home and trust the pattern holding. It is a shape rather than a stopwatch, and plenty of dogs run long on every stage. For your shopping, the rule translates simply: buy the safety layer immediately, the routine layer across the first month, and the personality layer only as the real dog steps forward. Expect surprises in both directions.",
        callout: {
          type: 'pro-tip',
          title: 'Journal beats memory',
          text: 'Note the firsts in a phone note: first tail wag, first play bow, first sleep through the night. Progress in settling dogs is invisible day to day, and the notes become your honest calendar.',
        },
        tips: [
          'Treat the rule as a shape, never a deadline your dog owes you.',
          'Expect some dogs to need longer at every single stage.',
          'Let small firsts, like play bows, set your shopping pace.',
        ],
      },
      {
        id: 'identification-day-one',
        title: 'Identification From the Very First Day',
        content:
          "The settling weeks are the highest-risk days for a lost dog, because fear makes doorways exciting and new homes mean nothing yet. Put a tag on a well-fitting collar before the car ride home, with your phone number and nothing clever, and confirm the microchip registration transfers to your name the same week. A harness is the calmer walking choice while trust builds, since a panicked dog backs out of a loose collar in one motion. Walk the fence line before arrival, checking for gaps, loose boards, and dig-friendly soft spots at the base.",
        callout: {
          type: 'warning',
          title: 'Door bolting is settling behavior',
          text: 'New dogs dash through open doors not from ingratitude but from adrenaline. Use a screen-door habit, crate or leash management at busy exits, and a tag from day one until the household rhythm is old news.',
        },
        tips: [
          'Attach a plain tag with your number before the pickup drive begins.',
          'Register the microchip in your name during the arrival week.',
          'Choose a harness over collar-only walking until trust is established.',
        ],
      },
      {
        id: 'scent-comfort',
        title: 'Scent Comfort and Familiar Smells',
        content:
          "Smell is the first language a stressed dog trusts, so the essentials list includes things that carry it. Ask the shelter or foster for a blanket or toy that smells like where the dog came from, and resist washing it the first week, even when it offends. A worn t-shirt of yours in the bed teaches your scent as a safe one, and the bedding itself should stay unwashed a while so the sleeping spot keeps smelling like the dog's own arrival. Calming pheromone diffusers exist as a category worth researching for the settling room, with your veterinarian as a sounding board.",
        tips: [
          "Bring home a blanket carrying the shelter's smell, and skip washing it.",
          'Tuck a worn t-shirt into the bed so your scent becomes bedtime.',
          'Leave the first bedding unwashed while the dog claims the spot.',
        ],
      },
      {
        id: 'gear-that-hides',
        title: 'Gear That Lets a Dog Hide',
        content:
          "A settling dog wants somewhere to disappear, and the gear that provides it is cheap by comparison to what it prevents. A crate with a sheet draped over three sides makes a den with a view of the room; a covered bed in a quiet corner does the same job without a door. Baby gates section the house into sizes of world, so confidence can grow one room at a time rather than confronting the whole map at once. Skip the bright, squeaky starter toy pile for now; a chew item and something soft to carry around quietly serve decompression better than excitement does.",
        tips: [
          'Drape a sheet over three crate sides for an instant den.',
          'Gate the house into sections and unlock rooms as confidence grows.',
          'Offer one quiet chew item rather than a pile of exciting toys.',
        ],
      },
      {
        id: 'delay-until-real-dog',
        title: 'Delay Buying Until the Real Dog Appears',
        content:
          "The shell hides the shopper's brief: a dog who ignores plush may become a devoted destroyer of it by month two, and the wrong-size harness bought on day one fits nothing by week six. Hold off on the premium bed until you know whether you adopted a nest-circler or a sprawler, and delay the toy library until a play style announces itself. Treats in bulk wait for a stomach you have watched for a month. As you compare listings later in the settling stretch, you will be shopping for a known animal, and every choice lands better for it.",
        callout: {
          type: 'vet-note',
          title: 'Appetite wobbles deserve a call',
          text: 'Skipping a meal or two is common decompression behavior, but meals refused for a full day or more, or diarrhea that persists, deserve a professional. Check with your veterinarian early rather than waiting it out, and bring the intake paperwork from the rescue.',
        },
        tips: [
          'Wait on the premium bed until sleeping style reveals itself.',
          'Delay bulk treats until a month of settled digestion passes.',
          'Note which toy format gets honored before multiplying anything.',
        ],
      },
      {
        id: 'second-month-shopping',
        title: 'The Second-Month Shopping Moment',
        content:
          "Somewhere in the settling stretch, the shell cracks: the dog initiates play, sleeps belly-up, or brings you a toy with sudden opinions. That is the shopping moment, because now purchases describe a known animal. A dog who retrieves wants balls and launchers; a shredder wants the durable stuff; a nose-first dog wants sniffing work. This is also the right window for training classes and gear for them, once your veterinarian confirms vaccinations and health support the plan. Buying late is not deprivation; it is accuracy, and the cart you build in month two fits the dog you actually live with.",
        tips: [
          'Shop when the dog starts initiating play and volunteering opinions.',
          'Match new toys to the play style you have actually observed.',
          "Time training classes with your veterinarian's vaccination and health green light.",
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'clock',
        title: 'Let decompression lead',
        items: [
          { highlight: 'Boring first days', text: 'quiet houses teach more than welcome parties can.' },
          { highlight: 'The rule is a shape', text: 'dogs run their own clocks through every stage.' },
          { highlight: 'Journal the firsts', text: 'invisible progress becomes visible in a phone note.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Secure the exits',
        items: [
          { highlight: 'Tags before pickup', text: 'new dogs dash through doors fear has opened.' },
          { highlight: 'Harness beats collar', text: 'a panicked dog slips a loose collar in one motion.' },
          { highlight: 'Register the chip', text: 'the paperwork transfer belongs to arrival week, not someday.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Shop the real dog',
        items: [
          { highlight: 'Scent carries safety', text: 'unwashed blankets and worn shirts settle nervous nights.' },
          { highlight: 'Delay the library', text: 'play style announces itself before toys earn their shelf.' },
          { highlight: 'Month two fits best', text: 'the cart you build then matches the real dog.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'What is the 3-3-3 rule for rescue dogs?',
        answer:
          'A rough settling map: give or take three days for the shock of the move to lift, three weeks for routine and personality to surface, and three months for the dog to feel the household is permanent. Dogs vary widely around those marks, so treat them as chapter headings rather than deadlines on a calendar.',
      },
      {
        question: 'Why is my new rescue dog hiding and not eating?',
        answer:
          'Usually decompression, which looks like long naps under furniture, polite distance, and skipped meals while adrenaline runs its course. Give a small quiet space, stay gently available, and keep the world boring for a few days. If food goes completely untouched beyond a day, or vomiting or diarrhea appear, check with your veterinarian rather than waiting.',
      },
      {
        question: 'What should I buy before my rescue dog arrives?',
        answer:
          'The safety layer only: a well-fitting collar with a tag, a harness and leash, a crate or gated room with simple washable bedding, stainless bowls, the food the rescue was feeding, and one quiet chew item. Everything else describes a dog you have not met yet, and the honest move is shopping again after the shell cracks.',
      },
      {
        question: 'When can I start training my rescue dog?',
        answer:
          'Gentle structure starts immediately, in the form of routines, calm name-pronunciation, and house rules delivered kindly. Formal classes wait until the dog has settled enough to eat, sleep, and explore normally, and until your veterinarian clears the vaccination and health side. Many rescues benefit from starting simple, short sessions at home and graduating to group classes a few weeks in.',
      },
      {
        question: 'Should I take my rescue dog everywhere with me right away?',
        answer:
          'The instinct is sweet. New dogs need the house to become familiar before the world gets interesting, so early weeks favor short sniffy walks and quiet car rides over festivals, stores, and dog parks. Social energy spent too early reads as pressure, and many dogs shut down or overreact. Expand the world gradually, one calm outing at a time.',
      },
    ],
  },
};
