// Fish and Aquatics part B articles for Pawzsly U: the equipment and
// water-chemistry family: filter cartridges, filters and pumps, food,
// heaters and gauges, lighting, supplements, and water care. Seven
// original blog bodies written to the WRITING-SPEC.md contract.
import type { ArticleBody } from './types';

export const FISH_B_ARTICLES: Record<string, ArticleBody> = {
  // =========================================================================
  // FILTER CARTRIDGES: the proprietary-cartridge cost trap
  // =========================================================================
  'fish-and-aquatics/aquatics/filter-cartridges': {
    heroTitle: "Filter Cartridges, Decoded Before They Drain Your Wallet",
    heroSubheadline:
      "Every cartridge is three layers doing different jobs, and only one of them needs replacing on schedule. Learn what each layer does before you keep buying boxes.",
    metaDescription:
      "What each filter cartridge layer actually does, the tank-water rinse rule that protects your bacteria, and how to escape the proprietary refill cost trap.",
    introSummary:
      "The cartridge business model works on a quiet assumption: that you will keep buying the same shaped box forever. Open one up, though, and you find three separate materials doing three separate jobs, only one of which wears out on a calendar. Understanding those layers changes what you replace, how you rinse, and how much of your filter's biology survives each month. Before the next box lands in your basket, here is what is actually inside, and how to spend on the layers that matter.",
    sections: [
      {
        id: 'cartridge-layers',
        title: "What Each Cartridge Layer Actually Does",
        content:
          "Pull a cartridge apart and the stack reveals itself: a fuzzy outer sleeve that catches floating gunk, a bag of granulated carbon inside, and sometimes a thin foam or ceramic core the box calls biological. The sleeve is mechanical filtration, trapping debris where you can throw it away. The carbon is chemical filtration, absorbing discoloration and odors for a few weeks before it exhausts. The biological claim is where honesty matters, because the bacteria doing that work live on every surface of the cartridge, not in a special layer. Carbon is the only part that truly expires.",
        tips: [
          "Separate the floss sleeve, carbon core, and any biological layer before judging replacements.",
          "Carbon exhausts in weeks; the sleeve merely clogs and rinses clean.",
          "Bacteria colonize the whole cartridge surface, never one dedicated layer.",
        ],
      },
      {
        id: 'rinse-rule',
        title: "The Rinse Rule That Protects Your Bacteria",
        content:
          "The single most useful habit in cartridge care: rinse the media in water taken from the tank, never straight from the tap. Municipal tap carries chlorine or chloramine precisely to kill microorganisms, and the colony living in your cartridge is exactly the microorganism you spent weeks cultivating. Swirl the cartridge in a bucket of removed tank water during a water change until the worst sludge lifts, then return it. Tap water looks cleaner when the rinse finishes, but it quietly resets your nitrogen cycle, and the tank pays for it in ammonia.",
        tips: [
          "Draw rinse water from the tank itself during your regular water change.",
          "Swirl, squeeze gently, and stop; spotless media resets biology.",
          "Cold or hot tap water shocks the colony; room-temperature tank water is safe.",
        ],
      },
      {
        id: 'biomedia-honesty',
        title: "Biomedia Is Not Mechanical Media",
        content:
          "Filter marketing blends the words mechanical, biological, and chemical until they mean nothing. The honest version: mechanical media is meant to be replaced or rinsed, biomedia is meant to be left alone for years. Rigid ceramic rings, coarse sponge, and plastic bio-balls have enormous surface area and no expiration date, which is why serious keepers keep a permanent biomedia basket beside their disposable cartridges. When your housing allows both, the cartridge becomes what it should be, a consumable for polish, while the stable colony handles the ammonia. That split saves money and stabilizes water. Comparing filter listings, favor housings with a spare basket for exactly that split.",
        tips: [
          "Keep permanent ceramic rings or coarse sponge beside any disposable cartridge.",
          "Replace the polish layer on schedule; leave biomedia untouched for years.",
          "If one chamber fits both, biomedia earns the protected spot.",
        ],
      },
      {
        id: 'cost-trap',
        title: "The Proprietary Cartridge Cost Trap",
        content:
          "Here is the trap in its plain form: many cartridge systems accept exactly one shaped refill, sold by the same maker, at whatever the market bears. The filter costs little upfront; the refills arrive forever. Before committing to any cartridge-based unit, look up the refill, its price, and whether an off-pattern cut-to-fit pad exists for the same housing. Standard cuttable floss and foam sheets cost a fraction per square inch and trim to size with scissors in under a minute. As you compare listings, calculate a year of refills, not the sticker on the unit.",
        tips: [
          "Price a full year of refills before judging any filter's sticker.",
          "Check whether cut-to-fit pads suit the same housing before rebuying.",
          "Odd proprietary shapes lock you to one maker's pricing forever.",
        ],
      },
      {
        id: 'replacement-schedules',
        title: "Reading Replacement Schedules Honestly",
        content:
          "The monthly replace-everything instruction on the box deserves a skeptical read. Swap the whole cartridge and you throw out the bacterial colony with the trapped gunk, which is why some new cartridges arrive with a strip of seeded media or instructions to sandwich old over new. A gentler rotation works better: replace half the mechanical media at a time, or slide the used cartridge behind the fresh one for two weeks so bacteria migrate across. Only the carbon needs calendar-driven swaps if you run it at all, and tanks without discoloration problems can often skip it entirely.",
        tips: [
          "Stagger replacements so half the colony survives every swap.",
          "Sandwich old behind new for two weeks while bacteria migrate.",
          "Skip carbon unless you are removing medication or tannin tint.",
        ],
      },
      {
        id: 'when-swaps-go-wrong',
        title: "When a Cartridge Change Goes Wrong",
        content:
          "A tank that spikes after a cartridge swap shows the same signature: cloudy water within days, then ammonia or nitrite readings where zeros lived before. Fish may hover at the surface or breathe faster, and the fix is patience plus light feeding, not more bottles. Test daily, change small amounts of water to dilute, and let the colony rebuild. If fish look genuinely unwell rather than merely off, consult a veterinarian comfortable with fish before you reach for treatments. The episode usually passes within a couple of weeks.",
        callout: {
          type: 'warning',
          title: "One swap, one spike",
          text:
            "Replacing all media at once can restart the cycle from zero. Rotate halves instead, and test for ammonia within a few days of any change.",
        },
        tips: [
          "Test for ammonia a few days after any cartridge change.",
          "Feed lightly while a disrupted colony rebuilds its numbers.",
          "Dilute spikes with small water changes rather than chemical rescues.",
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'clock',
        title: "Rinse first",
        items: [
          { highlight: "Tank water only", text: "tap chlorine kills the colony you spent weeks growing." },
          { highlight: "Swirl, never scrub", text: "lifted sludge is enough; spotless media resets biology." },
          { highlight: "Reuse a few cycles", text: "rinse the same sleeve until flow or shape gives out." },
        ],
      },
      {
        icon: 'check',
        title: "Buy the layers",
        items: [
          { highlight: "Carbon genuinely expires", text: "a few weeks of absorption, then it is gravel." },
          { highlight: "Biomedia is permanent", text: "ceramic rings and coarse sponge never join the calendar." },
          { highlight: "Floss is consumable", text: "the cheapest layer to replace, and the safest." },
        ],
      },
      {
        icon: 'shield',
        title: "Escape the trap",
        items: [
          { highlight: "Year of refills", text: "price twelve months, not the filter's upfront number." },
          { highlight: "Trim-to-fit foam pads", text: "standard sheets seat into most housings after trimming." },
          { highlight: "Stagger the swaps", text: "half the colony survives every replacement you make." },
        ],
      },
    ],
    faqs: [
      {
        question: "How often should filter cartridges be replaced?",
        answer:
          "The mechanical sleeve can go four weeks or longer if flow stays strong; rinse it in tank water between swaps instead of discarding. Carbon exhausts within roughly a month, but only matters when you run it. Biomedia never joins the replacement schedule at all, and treating it as permanent protects your cycle.",
      },
      {
        question: "Can I rinse a filter cartridge instead of replacing it?",
        answer:
          "Yes, and you should, though not forever. Rinsing in water drawn from the tank keeps most bacteria alive while clearing trapped debris. After several rinses the frame sags and the pad thins, and flow drops no matter how clean it looks, which is the signal to stagger in a fresh one.",
      },
      {
        question: "Why did my aquarium get cloudy after changing the cartridge?",
        answer:
          "Swapping out all the media removed much of the bacterial colony that consumes ammonia, and bacteria suspended in the water multiply to compensate, creating the haze. Feed lightly, test for ammonia and nitrite daily, and change modest amounts of water. The cloud usually clears as the colony re-establishes itself.",
      },
      {
        question: "Do I need the carbon in my filter cartridge?",
        answer:
          "Only for specific jobs: pulling medication residue after treatment, clearing yellow tannin tint from driftwood, or polishing water before photos. Day to day it does little, and it exhausts within weeks regardless. Running the slot with plain floss or biomedia instead is a perfectly sound long-term choice.",
      },
      {
        question: "Are universal cut-to-fit filter pads as good as branded cartridges?",
        answer:
          "For mechanical and biological duty, yes. Cuttable floss and foam sheets seat into most hang-on-back housings with a minute of trimming and perform the same jobs at a lower running cost. The one thing they cannot copy is an exact proprietary shape with integrated frames or carbon chambers.",
      },
    ],
  },

  // =========================================================================
  // FILTERS AND PUMPS: filter types by tank and stock
  // =========================================================================
  'fish-and-aquatics/aquatics/filters-and-pumps': {
    heroTitle: "Choosing Fish Tank Filters and Pumps That Fit Your Stock",
    heroSubheadline:
      "A filter is hired for one number and one temperament: how many times it turns the tank over each hour, and how much current your fish can live with.",
    metaDescription:
      "Fish tank filters succeed on turnover and temperament. Match hang-on-back, canister, sponge, or internal units to your tank size, stock, and flow needs.",
    introSummary:
      "Ask a room of fishkeepers which filter is best and you will get four confident answers that disagree, and all of them are right for their own tanks. A filter is really two decisions stacked together: how many gallons per hour it moves, and how gently it moves them. A powerful canister on a betta sorority is as wrong as a gentle sponge in an African cichlid tank. Matching hardware to water volume and temperament first saves you from buying twice.",
    sections: [
      {
        id: 'turnover-rule',
        title: "Turnover: The Four-to-Five Rule",
        content:
          "Turnover is the plain arithmetic of filtration: how many times the whole volume passes through the media each hour. For most freshwater community tanks, a rating near four to five turns per hour is the working baseline, so a twenty gallon tank shops around the eighty to one hundred gallon per hour mark. Heavier stocking pushes the number upward; sparse, planted, or delicate-stock tanks can sit lower. Manufacturers rate flow with empty media baskets and clean impellers, so read real-world output as somewhat below the box number, and buy with a little headroom for the day the media fills.",
        callout: {
          type: 'pro-tip',
          title: "Headroom beats exactness",
          text:
            "A rating slightly above your target ages well as media clogs and stocking grows. Undersized flow forces a second purchase the moment the bioload climbs.",
        },
        tips: [
          "Multiply tank volume by four or five for your target flow.",
          "Heavily stocked tanks earn the upper end; planted shrimp tanks sit lower.",
          "Treat boxed flow ratings as optimistic; plan on modest real output.",
        ],
      },
      {
        id: 'hang-on-back',
        title: "Hang-On-Back Filters for Most Tanks",
        content:
          "The hang-on-back is the default for a reason. It clamps to the tank rim, lifts out in one piece for servicing, and exposes its media trays to the room so you can see when the chamber needs attention. Adjustable flow valves let you tame the current for slower fish, and a prefilter sponge slipped over the intake protects fry and shrimp while adding surface area for bacteria. Their weaknesses are equally plain: evaporation hums through the spillway if the water level drops, and the media space is modest compared with a canister.",
        tips: [
          "Top off the tank regularly; low water makes the spillway gurgle.",
          "Fit an intake prefilter sponge to shield shrimp and fry.",
          "Dial the flow valve down before adding slow swimmers.",
        ],
      },
      {
        id: 'canister',
        title: "Canister Filters for Heavy Bioloads",
        content:
          "Once a tank passes the roughly forty gallon mark, or the stocking gets ambitious, canisters start earning their price. Everything sits in sealed, stacked baskets: mechanical pads up top where you can reach them, biomedia below where it stays undisturbed for years. The hoses let you place the motor inside the cabinet, so the room stays quiet, and overall media capacity dwarfs any hang-on-back. The trade is service weight: a full canister holds a lot of water, so close the valves, release the latches, and carry it to a sink rather than wrestling it in place.",
        tips: [
          "Shut the intake and output valves before breaking any hose seal.",
          "Stack mechanical pads above biomedia so gunk never buries the colony.",
          "Prime with the vent valve rather than sucking on a hose.",
        ],
      },
      {
        id: 'sponge-internal',
        title: "Sponge and Internal Filters for Gentle Setups",
        content:
          "Sponge filters are nothing but foam around an airlift, which sounds primitive until you see what they do: enormous biological surface, current gentle enough for bettas and shrimp, and a price that leaves room in the budget. An air pump drives them, so the only sound is a soft bubble hum. Internal power filters suit nano tanks and quarantine or hospital tanks where a filter you can sterilize between uses beats sheer capacity. Neither polishes water the way packed carbon can, but for growing colonies and keeping delicate stock calm, both are quiet workhorses.",
        tips: [
          "Run two sponges so you can rotate cleaning without losing bacteria.",
          "Squeeze sponge media in removed tank water, never under the tap.",
          "Choose an internal with a flow dial for quarantine setups.",
        ],
      },
      {
        id: 'flow-temperament',
        title: "Matching Flow to Fish Temperament",
        content:
          "Fish sort themselves into two broad camps. Danios, barbs, rainbowfish, and goldfish come from moving or open water and enjoy a pushy return current to swim against. Bettas, gouramis, many slow-water tetras, and long-finned varieties tire against that same push, spending their day hiding behind decor to escape it. Watch the tank after lights out: fish listing sideways in the outflow, or pinned to one calm corner, are telling you the current is wrong. A spray bar aimed along the back glass spreads the stream; an airline or baffle tames it further.",
        tips: [
          "Watch resting fish after lights out; listing flags too much flow.",
          "Aim spray bars along the glass, not into open swimming space.",
          "Prefilter sponges and outlet baffles soften current cheaply.",
        ],
      },
      {
        id: 'type-by-tank',
        title: "Filter Types by Tank and Stock",
        content:
          "Set the four families side by side and the choice stops being abstract. The table matches each filter style to the tanks and stock it serves best, plus the honest cost of choosing it. Read those rows against your own numbers: tank volume, intended stocking, and how much weekly fuss you will genuinely tolerate. Browsing marketplace listings makes side-by-side flow ratings easy, which is exactly the comparison worth finishing before checkout.",
        tableData: {
          headers: ['Filter type', 'Best fit', 'Watch for'],
          rows: [
            ['Hang-on-back', 'Ten to forty gallon communities', 'Modest media space, spillway hum'],
            ['Canister', 'Large tanks and heavy stocking', 'Heavy servicing, hose plumbing'],
            ['Sponge', 'Bettas, shrimp, fry, hospital tanks', 'Little mechanical polish'],
            ['Internal power', 'Nanos and quarantine setups', 'Occupies swimming room'],
          ],
        },
        tips: [
          "Cross-check gallons-per-hour ratings against your turnover target before deciding.",
          "Weigh servicing effort alongside capacity; lazy maintenance undoes good filtration.",
          "Keep future stocking in view; today's gentle community may grow ambition.",
        ],
      },
      {
        id: 'pumps',
        title: "Air Pumps and Their Quiet Jobs",
        content:
          "Pumps are the quieter half of this aisle and the part people forget to plan. An air pump drives sponge filters and airstones, adds surface agitation during summer heat, and backs up circulation during an outage if you own a battery version. Water pumps move flow between a sump and the display, or add current in big tanks. One small fitting matters more than any of them: the check valve in the airline stops water siphoning back during a power cut, protecting the pump and the floor. Comparing pump models, noise ratings and spare part availability tell you more than peak output.",
        tips: [
          "Fit a check valve in every airline to stop back-siphoning.",
          "Match air pump output to your tank's depth, not just price.",
          "Keep a battery air pump ready for outage nights.",
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: "Do the math",
        items: [
          { highlight: "Four to five turns", text: "multiply tank volume by this for a gallons-per-hour target." },
          { highlight: "Ratings read optimistic", text: "real output drops as media loads with trapped debris." },
          { highlight: "Buy slight headroom", text: "growth in stocking should not force a second purchase." },
        ],
      },
      {
        icon: 'heart',
        title: "Match temperament",
        items: [
          { highlight: "Strong flow swimmers", text: "danios, barbs, and goldfish enjoy a steady current." },
          { highlight: "Calm water species", text: "bettas and gouramis tire against a pushing outflow." },
          { highlight: "Watch night behavior", text: "a listing fish at rest flags too much flow." },
        ],
      },
      {
        icon: 'clock',
        title: "Service honestly",
        items: [
          { highlight: "HOB lifts out", text: "one piece, minutes, no valves or hoses to manage." },
          { highlight: "Canisters carry weight", text: "close valves and carry the full unit to a sink." },
          { highlight: "Sponges squeeze clean", text: "rinse in removed tank water to protect the colony." },
        ],
      },
    ],
    faqs: [
      {
        question: "How many times per hour should a filter turn over a tank?",
        answer:
          "Four to five turns per hour suits most freshwater community tanks, so multiply your volume by that range when shopping ratings. Dense stocking or large messy fish push you toward the top or beyond, while lightly stocked planted tanks and shrimp colonies sit comfortably below it.",
      },
      {
        question: "Which filter is best for a betta tank?",
        answer:
          "A sponge filter or a hang-on-back dialed down to its lowest setting keeps current tolerable. Bettas come from slow, vegetated water and struggle to feed or rest in strong flow, so an intake prefilter and a baffle on the outlet help too. Aim for gentle turnover rather than maximum gallons per hour.",
      },
      {
        question: "Can a filter be too strong for fish?",
        answer:
          "Yes, and the signs are behavioral before they are physical: fish pinned to one calm corner, listing at rest, or refusing to cross the outflow zone. Reduce the dial, add a baffle or spray bar, or switch to gentler hardware. Persistent exhaustion weakens fish over weeks.",
      },
      {
        question: "Do I need an air pump if I have a filter?",
        answer:
          "Not necessarily. Any filter that agitates the surface already exchanges the oxygen most tanks need. Air pumps earn their place driving sponge filters, adding backup aeration in warm months, or running hospital tanks, and a battery version is cheap peace of mind during power cuts.",
      },
      {
        question: "Is a canister filter worth it for a small tank?",
        answer:
          "Usually not. Below about forty gallons, a quality hang-on-back or internal unit covers the bioload with far easier servicing. Canisters pay off on big or heavily stocked tanks where media capacity and quiet operation matter, and their weight and hose plumbing feel like overhead on anything small.",
      },
    ],
  },

  // =========================================================================
  // AQUATIC FOOD: flake vs pellet vs frozen vs live
  // =========================================================================
  'fish-and-aquatics/aquatics/aquatic-food': {
    heroTitle: "Aquarium Fish Food Without the Overfeeding Trap",
    heroSubheadline:
      "Flake, pellet, frozen, and live each suit a different mouth and a different keeper. Matching the format to the species beats buying whatever is nearest at the store.",
    metaDescription:
      "Aquarium fish food works when format matches species: carnivore bettas, omnivore goldfish, surface or bottom mouths. Portions, rings, and thawing, plainly.",
    introSummary:
      "Watch any new fishkeeper feed a tank and you will see the same quiet error: a generous pinch of flakes, a flurry of chasing, then a drift of leftovers settling into the gravel. Fish beg as though starving because begging works on humans, not because they are hungry. What follows is a plan for feeding deliberately: choosing flake, pellet, frozen, or live for the animal in your tank, sizing the portion to what vanishes, and using a simple ring to keep the meal where you can watch it disappear.",
    sections: [
      {
        id: 'format-comparison',
        title: "Flake, Pellet, Frozen, and Live Compared",
        content:
          "Every food format trades convenience against nutrition and mess. Flakes are cheap and easy but float, crumble, and lose vitamins fastest once the tub opens. Pellets sink or float on purpose and come sized to specific mouths. Frozen foods keep protein intact for months and switch picky eaters back on. Live food triggers hunting behavior nothing else matches, with hygiene responsibilities attached. The table below sets the four formats against the fish and keepers they suit. Comparing food listings, read format before price, since the wrong format wastes whatever it costs.",
        tableData: {
          headers: ['Format', 'Shines for', 'Watch out for'],
          rows: [
            ['Flake', 'Surface feeders, community tanks', 'Crumbles fast, vitamins fade after opening'],
            ['Pellet', 'Sized feeding, mid and bottom mouths', 'Wrong size gets ignored or gulped'],
            ['Frozen', 'Protein variety, picky eaters', 'Thawing discipline, never refreeze'],
            ['Live', 'Hunting behavior, conditioning breeders', 'Source hygiene and parasite risk'],
          ],
        },
        tips: [
          "Match pellet diameter to mouth size before anything else.",
          "Buy small flake containers; opened tubs fade faster than you finish.",
          "Rotate formats weekly so nutrition gaps never accumulate.",
        ],
      },
      {
        id: 'species-honesty',
        title: "Bettas Are Carnivores, Goldfish Are Not",
        content:
          "The label on a generic food tub hides a spectrum of diets. Bettas are true carnivores built for insects and small prey, and they do best on protein-forward pellets small enough for their upturned mouths, with frozen bloodworms or brine shrimp as regular variety. Goldfish lean the other way, omnivores that relish vegetable matter and sinking foods; surface-gulped flakes push air into their systems, which is why sinking pellets and blanched greens suit them better. When you compare food listings, the species profile comes before the brand on the front: match protein level and piece size to the mouth and the metabolism, then vary inside that lane.",
        tips: [
          "Feed bettas protein-first pellets sized for small upturned mouths.",
          "Choose sinking foods for goldfish to limit gulped air.",
          "Vary inside the species' lane rather than switching diets wholesale.",
        ],
      },
      {
        id: 'overfeeding-trap',
        title: "The Overfeeding Trap in Plain Terms",
        content:
          "Uneaten food does not disappear; it rots into ammonia and feeds the algae you fight later. The honest portion is what disappears completely in about thirty seconds to two minutes, once or twice a day for most adult community fish, with juveniles needing smaller, more frequent meals. Fish tolerate surprisingly long fasts, so a light hand costs nothing, while a heavy one taxes the filter for weeks. Skipping a feeding day weekly is a habit many keepers use to let digestive systems settle, not neglect.",
        callout: {
          type: 'warning',
          title: "Leftovers are the invoice",
          text:
            "Cloudy water, climbing nitrates, and recurring algae trace back to uneaten food more often than any other single cause. Portion down before buying anything.",
        },
        tips: [
          "Portion what vanishes inside two minutes, then stop, however loudly they beg.",
          "Fast the tank one day a week if your species tolerate it.",
          "Remove stray flakes before they sink and rot into ammonia.",
        ],
      },
      {
        id: 'feeding-rings',
        title: "Feeding Rings and Other Watching Tools",
        content:
          "A feeding ring is a floating hoop that corrals floating food into one spot instead of letting the outflow paint the whole surface. For surface-oriented fish like bettas and hatchetfish it concentrates the meal where they naturally hunt; for you it concentrates the evidence, since anything drifting outside the ring after a few minutes is leftover worth removing rather than letting rot. Rings also slow the filter's theft of floating pellets. One on each end of a long tank keeps territorial fish from monopolizing a single feeding station.",
        tips: [
          "Place the ring away from the filter outflow so floating food stays.",
          "Clear whatever escapes the ring after a few minutes, every time.",
          "Two rings on long tanks stop one boss fish controlling meals.",
        ],
      },
      {
        id: 'frozen-handling',
        title: "Thawing Frozen Food Without Mistakes",
        content:
          "Frozen cubes and blister packs carry real protein with real handling rules. Thaw each cube in a cup of tank water for a few minutes before pouring; dropping a frozen block in directly shocks tropical digestion and wastes nutrients where the filter grabs them. Portion the slurry with a pipette or baster so shy fish at the back get their share instead of the boldest mouth taking the cube. Never refreeze a thawed cube, and keep the pack sealed in the freezer between uses.",
        tips: [
          "Thaw cubes in a cup of tank water, never straight from the freezer.",
          "Target the slurry with a pipette so shy feeders get a turn.",
          "Discard thawed leftovers; refreezing invites spoilage and texture loss.",
        ],
      },
      {
        id: 'live-food-risk',
        title: "Live Food Hygiene and Honest Risk",
        content:
          "Live food brings out hunting behavior nothing in a jar can imitate, and conditioning breeders often depends on it. The cost is trust: parasites and pathogens ride in on poorly cultured live foods, which is why accountable sources matter more than wild-caught collections. Grindal worms, vinegar eels, brine shrimp, and blackworms can be raised at home in small cultures, keeping the supply chain under your own eye. Rinse worms until the water runs clear, and quarantine unusual batches. If fish fall ill after new live food, check with a veterinarian comfortable with fish rather than blaming the filter.",
        tips: [
          "Prefer responsibly cultured live foods over wild-caught collections.",
          "Rinse live worms until the rinse water runs clear.",
          "Start home cultures small; one jar of grindals feeds a fishroom.",
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: "Portion tightly",
        items: [
          { highlight: "The two-minute rule", text: "what vanishes fully in that window is the portion." },
          { highlight: "Begging is theater", text: "fish ask constantly because asking works on people." },
          { highlight: "Leftovers are data", text: "stray food means the next feeding gets smaller." },
        ],
      },
      {
        icon: 'heart',
        title: "Match the species",
        items: [
          { highlight: "Bettas eat protein", text: "small pellets and frozen prey fit carnivore mouths." },
          { highlight: "Goldfish graze green", text: "sinking omnivore pellets with greens limit swallowed air." },
          { highlight: "Mouth size decides", text: "pellet diameter matters before any brand or price." },
        ],
      },
      {
        icon: 'sparkles',
        title: "Feed with tools",
        items: [
          { highlight: "Rings contain floats", text: "keep one patch of surface away from the outflow." },
          { highlight: "Thaw before serving", text: "a cup of tank water softens cubes safely." },
          { highlight: "Pipettes feed shy fish", text: "target the slurry so bold fish do not monopolize." },
        ],
      },
    ],
    faqs: [
      {
        question: "How much should I feed my fish each day?",
        answer:
          "Feed only what disappears fully within about two minutes, once or twice daily for adult fish. A hungry-looking fish at the glass is normal begging, not an emergency, and fish tolerate occasional skipped days well. If nitrates climb or leftovers appear, cut the portion before changing anything else about the tank.",
      },
      {
        question: "Can bettas eat regular tropical flakes?",
        answer:
          "Some will, but they are a poor staple. Bettas are carnivores that need higher protein and a pellet sized for their small upturned mouth; flakes also sit on the surface where their hunting style suits them least. Use betta-targeted micro pellets with frozen bloodworms for variety.",
      },
      {
        question: "Do goldfish need special food?",
        answer:
          "They do better with it. Goldfish are omnivores that gulp at the surface, so floating flakes push swallowed air through them; sinking pellets deliver the meal without the gas. A formula with vegetable matter matches their digestion better than heavy protein, and blanched peas or greens make a fine occasional supplement.",
      },
      {
        question: "What does a feeding ring actually do?",
        answer:
          "It corrals floating food into one patch of surface, away from the filter outflow, so slow surface feeders can eat it before it scatters or sinks. It also shows leftovers plainly: anything drifting free after a few minutes was too much, and you can remove it instead of letting it rot.",
      },
      {
        question: "Is frozen fish food better than flakes?",
        answer:
          "Different job, not simply better. Frozen bloodworms, brine shrimp, and mysis keep protein mostly intact and are excellent variety for picky or carnivorous fish. Flakes serve convenient daily feeding of community tanks. A rotation of both, portioned tightly, beats relying on either alone for very long.",
      },
    ],
  },

  // =========================================================================
  // HEATERS AND GAUGES: watts, thermometer placement, stability
  // =========================================================================
  'fish-and-aquatics/aquatics/heaters-and-gauges': {
    heroTitle: "Heaters and Thermometers That Hold an Aquarium Steady",
    heroSubheadline:
      "Fish read temperature with their whole bodies, and small tanks swing fast. Sizing the heater, placing the thermometer, and watching seasonal drift keeps the reading boring.",
    metaDescription:
      "Aquarium heaters and thermometers keep temperature steady, which is the goal. Watts per gallon, gauge placement, species bands, and seasonal drift, plainly.",
    introSummary:
      "Fish are what water makes them: their body temperature follows the tank, which makes your heater the closest thing they have to metabolism. A stable reading matters more than a perfect one, because swings stress immune systems faster than a degree or two of imperfection ever will. This piece covers the practical arithmetic of watts per gallon, why the thermometer belongs at the far end of the tank, the bands different species settle into, and what changes when the season turns.",
    sections: [
      {
        id: 'watts-per-gallon',
        title: "Watts per Gallon Without Guesswork",
        content:
          "Sizing a heater starts with a rule of thumb and ends with your room. A common starting point sits near three to five watts per gallon for typical homes, leaning higher in cold rooms and lower in warm ones, because the heater only fights the gap between room and target. A ten gallon tank in a chilly basement wants more watts than the same volume beside a sunny couch. Long tanks often run better on two smaller heaters split between the ends than one big unit, spreading warmth and giving you a fallback if one fails.",
        callout: {
          type: 'pro-tip',
          title: "Two heaters, half each",
          text:
            "Splitting wattage across both ends evens warmth and leaves a fallback if one unit fails quietly. Match each thermostat so neither fights the other.",
        },
        tips: [
          "Start near three to five watts per gallon, then adjust for the room.",
          "Cold basements lean high; warm rooms lean low on wattage.",
          "Split long tanks across two smaller heaters for backup.",
        ],
      },
      {
        id: 'thermometer-placement',
        title: "Where the Thermometer Belongs",
        content:
          "A thermometer stuck on the glass beside the heater reads the heater, not the tank. Place it at the opposite end, ideally mid-water height on the back glass where it stays readable but discreet, because that far corner is where heat arrives last. If it matches the set point there, the whole tank is close to stable; if the far end runs cool, circulation needs help before wattage does. Liquid crystal stick-ons work but read a degree or so wide; a probe or glass thermometer gives the tighter number species with narrow needs deserve.",
        tips: [
          "Mount the thermometer opposite the heater, mid-height on the glass.",
          "A cool far end signals circulation trouble, not a bigger heater.",
          "Verify stick-on readings against a probe thermometer once.",
        ],
      },
      {
        id: 'thermometer-authority',
        title: "Trusting the Thermometer Over the Indicator Light",
        content:
          "The little light on a heater means current is flowing, nothing more. It says nothing about calibration, and every thermostat drifts over years, which is why the separate thermometer is the gauge that actually governs. Check them against each other weekly: if the tank runs warm or cool against the dial setting, adjust to the thermometer and stop there. Cheap heaters fail in both directions, stuck on being the dangerous one, so a warm tank with the light off deserves an immediate unplug and inspection. Any fish behaving oddly during a temperature episode is worth a conversation with a veterinarian comfortable with fish.",
        tips: [
          "Treat the heater's dial as a suggestion; the thermometer governs.",
          "Check dial-versus-reading weekly to catch calibration drift early.",
          "A tank warming with the light off means unplug and inspect now.",
        ],
      },
      {
        id: 'species-bands',
        title: "Temperature Bands Fish Settle Into",
        content:
          "Species arrive from different climates, and the bands they settle into differ accordingly. Cold-tolerant fish like goldfish can skip heating in most homes, general tropical communities sit near the middle, and the warm-water specialists push equipment harder. Whatever you keep, hold the band steady rather than perfect: consistency within a range beats darting across it chasing an ideal. The figures below are commonly published starting ranges, so confirm the exact needs of your particular species before setting the dial. Comparing heater listings for a warm-water species, budget toward the upper wattage and a backup gauge.",
        tableData: {
          headers: ['Stock', 'Comfortable band', 'Notes'],
          rows: [
            ['Goldfish and white clouds', 'About 65 to 72 F', 'Cool rooms may need no heater'],
            ['General tropical community', 'About 74 to 80 F', 'The default most gear assumes'],
            ['Bettas', 'About 76 to 81 F', 'Warm end, gentle flow matters'],
            ['Discus and rams', 'About 80 to 86 F', 'Warm water holds less oxygen'],
          ],
        },
        tips: [
          "Hold a steady band; a constant 77 beats swinging 74 to 80.",
          "Confirm species specifics before trusting any general band.",
          "Warm tanks need extra surface agitation to hold oxygen.",
        ],
      },
      {
        id: 'seasonal-drift',
        title: "Seasonal Drift and Room Swings",
        content:
          "Tanks follow rooms with a lag, and seasons move rooms more than most keepers expect. Winter drops a cool house several degrees, working the heater harder at exactly the time its calibration matters; summer can push a tank past its set point with the light off entirely, since heaters only add heat. Watch the thermometer through both turnings, and in warm spells crack the lid, point a fan across the surface, or shorten the light period, because fighting heat means shedding it. Small tanks swing fastest of all, another quiet argument for the largest tank your space allows.",
        tips: [
          "Walk past the thermometer daily during seasonal turnings.",
          "Cool tanks with surface airflow in summer; heaters cannot remove heat.",
          "Expect small tanks to swing harder and faster than large ones.",
        ],
      },
      {
        id: 'gauges-redundancy',
        title: "Gauges, Alarms, and Redundancy Worth Having",
        content:
          "The gauge shelf is small but earns its keep. A second thermometer validates the first; an inexpensive temperature alarm or a smart plug watching the heater catches the stuck-on failure before the tank cooks; and a battery stick-on travels with hospital tanks. Comparing listings of gauges and heaters, look for adjustable thermostats in small increments, protective cages over the element if you keep curious fish or invertebrates, and a warranty that outlives the season. Redundancy costs less than restocking, and boring gauges are the whole point.",
        tips: [
          "Keep a second thermometer to audit the first one occasionally.",
          "Smart plugs or alarms catch stuck-on heaters before damage spreads.",
          "Caged elements protect curious fish and long-finned occupants.",
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: "Size for the room",
        items: [
          { highlight: "Three to five watts", text: "per gallon, adjusted for how cold the room runs." },
          { highlight: "Fight the gap", text: "the heater only closes distance between room and target." },
          { highlight: "Split the wattage", text: "two small heaters cover a long tank with backup." },
        ],
      },
      {
        icon: 'map-pin',
        title: "Place gauges right",
        items: [
          { highlight: "Far end from heater", text: "mid-height on the back glass reads the true tank." },
          { highlight: "The light lies", text: "it shows current flow, never calibration or accuracy." },
          { highlight: "Audit with two", text: "a second thermometer catches drift in the first." },
        ],
      },
      {
        icon: 'shield',
        title: "Keep the band steady",
        items: [
          { highlight: "Stable beats perfect", text: "holding one range outperforms chasing an ideal number." },
          { highlight: "Seasons move rooms", text: "check the gauge through both winter and summer turnings." },
          { highlight: "Heaters only add heat", text: "cooling means airflow, lids, and shorter light hours." },
        ],
      },
    ],
    faqs: [
      {
        question: "How many watts of heater does my aquarium need?",
        answer:
          "Begin around three to five watts per gallon and let the room move you within that band: cold basements push toward the top, warm rooms toward the bottom. Heaters only work against the difference between your room's temperature and the target, so the house decides the honest number.",
      },
      {
        question: "Where should I put the thermometer in a fish tank?",
        answer:
          "Opposite the heater, at mid-water height, where heat arrives last. A gauge beside the element reads the heater's own output instead of the water the fish live in, and a cool far end tells you circulation needs help long before wattage does.",
      },
      {
        question: "Can an aquarium heater overheat a tank?",
        answer:
          "Yes, usually through a stuck thermostat, which is the failure mode worth guarding against. The indicator light only reports current flow, so pair the heater with a separate thermometer and consider a smart plug or alarm that cuts power at a ceiling reading. Unplug and inspect any tank running warm with the light off.",
      },
      {
        question: "Do goldfish need a heater?",
        answer:
          "In most heated homes, no; goldfish settle comfortably in the upper sixties Fahrenheit and tolerate cool rooms well. A heater still earns a place where indoor winters dip sharply, or for fancy varieties kept at the warmer end. Stability through the seasons matters more than the exact number.",
      },
      {
        question: "Why does my tank temperature drop at night?",
        answer:
          "Rooms cool after dark and the tank follows, especially small volumes near windows or exterior walls. If the dip stays within a degree or two, the band is simply breathing; larger swings call for more wattage, a lid to slow evaporation, or moving the tank away from drafts.",
      },
    ],
  },

  // =========================================================================
  // LIGHT FIXTURES AND BULBS: photoperiod, intensity, timers
  // =========================================================================
  'fish-and-aquatics/aquatics/light-fixtures-and-bulbs': {
    heroTitle: "Aquarium Lighting That Grows Plants and Starves Algae",
    heroSubheadline:
      "Light schedules feed plants and algae alike. A timer, a sensible photoperiod, and intensity matched to your plants keep the tank bright without the green film.",
    metaDescription:
      "Aquarium lighting comes down to photoperiod, intensity, and a cheap timer. Set honest hours, match light to your plants, and algae loses its head start.",
    introSummary:
      "There is a rhythm to every healthy tank: lights on in the morning, plants bubbling by noon, lights off at a predictable hour, and glass you can see through. Break the rhythm, leaving lights on all evening for viewing or stretching the photoperiod because the plants look happy, and algae files its claim. Light is a budget, not a decoration. What follows is how to spend it: hours that respect the biology, intensity sized to what you grow, and the cheapest upgrade in the hobby, a timer.",
    sections: [
      {
        id: 'photoperiod',
        title: "Photoperiod: The Eight-Hour Question",
        content:
          "Plants and algae both run on photosynthesis, and both do fine on a working day. A photoperiod in the neighborhood of eight hours, kept consistent, grows the vast majority of common aquarium plants; extending it does not hurry the plants so much as feed the film on your glass. Start around six to eight hours and watch the tank for a fortnight: fresh algae means trimming the schedule, not the intensity. The number is a starting range rather than a law, and consistency beats duration, since a tank that guesses its schedule never settles.",
        tips: [
          "Start near six to eight light hours and adjust by what grows.",
          "Cut the photoperiod first when algae appears, before touching intensity.",
          "Keep on and off times identical daily, weekends included.",
        ],
      },
      {
        id: 'algae-light',
        title: "Algae Reads the Same Light You Give Plants",
        content:
          "Algae is not a lighting defect so much as a competitor with lower standards. It photosynthesizes on the same photons your plants use, and it thrives when light outstrips the planting's ability to consume the available nutrients. That mismatch, long hours plus sparse planting plus a maturing tank, is the classic green-glass recipe. Dense planting, honest feeding, and a tight schedule starve it slowly. Bulbs also shift spectrum as they age, drifting toward the wavelengths algae favors, which is why replacing aging emitters on a regular calendar keeps the balance honest.",
        tips: [
          "Plant densely early; empty space is algae's reservation.",
          "Replace aging bulbs on schedule, since spectra drift with time.",
          "Address nutrients and light together; fixing one side rarely works.",
        ],
      },
      {
        id: 'planted-intensity',
        title: "Intensity Basics for Planted Tanks",
        content:
          "Match intensity to the plants, not the photograph. Easy species such as anubias, java fern, most crypts, and vallisneria thrive under modest output; carpeting plants and red stem species want stronger light and usually answer by demanding more nutrients and carbon dioxide in return. A dimmable fixture lets you start low and raise output as the planting matures, which is far kinder to a new tank than full power on day one. Depth matters too: light fades quickly through water, so a deep tank needs more output to reach the substrate than a shallow one of equal footprint.",
        tips: [
          "Begin at low intensity and raise it as planting fills in.",
          "Deep tanks lose light fast; budget output for the substrate level.",
          "Red and carpeting plants bring nutrient and CO2 demands attached.",
        ],
      },
      {
        id: 'timers',
        title: "Timers: The Cheapest Upgrade in Aquatics",
        content:
          "For a few dollars, a plug-in timer solves the problem aquatics equipment spends real money on: consistency. Fish and plants both settle into a dependable day and night, algae loses the long unpredictable stretches it exploits, and you stop being the daily mechanism that forgets on busy evenings. Mechanical dial timers work; digital ones keep time through outages better. Place the timer where you can see its indicator, and set the window for when you are home to enjoy the tank, because lights exist for plants and for viewing alike.",
        callout: {
          type: 'pro-tip',
          title: "Set it for your evenings",
          text:
            "A photoperiod ending at three in the afternoon pleases the plants and empties your evenings. Shift the window later so the tank glows while you are present.",
        },
        tips: [
          "Put lights on a timer today; consistency costs almost nothing.",
          "Choose digital timers for outage memory over mechanical dial models.",
          "Schedule the lit window for hours you genuinely sit nearby.",
        ],
      },
      {
        id: 'fixture-choice',
        title: "Choosing Fixtures by What You Grow",
        content:
          "Fixtures sort into a rough ladder. Entry-level units light the tank pleasantly and grow easy plants; planted-tank fixtures add output, often with dimming and ramp controls; and high-output rigs serve dedicated scapers pushing carpets and color. Before comparing listings, write down what you keep or intend to keep, then buy the rung that matches it, because over-buying intensity creates algae problems rather than solving them. Check that replacement emitters stay available, that the unit suits your tank's length, and that mounting fits the rim or armature as it exists.",
        tips: [
          "Buy the intensity rung your plant list actually requires.",
          "Confirm the fixture length matches your tank before checkout.",
          "Prefer units with dimming; future planting rarely stays the same.",
        ],
      },
      {
        id: 'spectrum-skepticism',
        title: "Reading Spectrum Claims With Skepticism",
        content:
          "Spectrum marketing promises specific colors, pop, and growth from curves printed on a box. The honest version: plants mostly use red and blue wavelengths, and pleasant full-spectrum white light grows them well; tweaks matter at the margins, not the core. What matters more is output, schedule, and how the unit sits over the water. If a display tank's blues make your fish glow, that is aesthetics, not biology. Comparing products across marketplace listings, filter by output and adjustability first and treat the color story as tie-breaking polish.",
        tips: [
          "Judge fixtures on output and control; spectrum is a finishing touch.",
          "Full-spectrum white grows the common plants perfectly well.",
          "Deep blues flatter fish, which is fine, and also cosmetic.",
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'clock',
        title: "Set the clock",
        items: [
          { highlight: "Six to ten hours", text: "eight is the default that suits most planted tanks." },
          { highlight: "Consistency over length", text: "a predictable short day beats a generous erratic one." },
          { highlight: "Trim hours first", text: "cut the schedule before swapping bulbs or buying treatments." },
        ],
      },
      {
        icon: 'sparkles',
        title: "Match intensity",
        items: [
          { highlight: "Easy plants, low light", text: "anubias and crypts thrive under modest standard fixtures." },
          { highlight: "Demanding species want more", text: "strong light brings nutrient and CO2 obligations with it." },
          { highlight: "Start low, ramp later", text: "dimming fixtures forgive a maturing tank's rough patches." },
        ],
      },
      {
        icon: 'check',
        title: "Buy sensibly",
        items: [
          { highlight: "A timer first", text: "the least money buys the most stability in lighting." },
          { highlight: "Fit the length", text: "fixtures sized to your tank avoid dark end corners." },
          { highlight: "Spectrum is polish", text: "output and adjustability decide; color stories merely decorate." },
        ],
      },
    ],
    faqs: [
      {
        question: "How many hours of light does an aquarium need each day?",
        answer:
          "Roughly six to ten hours suits most tanks, with eight as a sensible default that grows common plants without feeding algae. Trim toward the short end if green film appears, and hold the schedule constant daily. Plants and fish both prefer a predictable day over a generous one.",
      },
      {
        question: "Will leaving the aquarium light on cause algae?",
        answer:
          "Usually, if the hours outpace what plants and maintenance consume. Algae photosynthesizes on the same light, and long or erratic schedules give it the edge. Cutting the photoperiod is the first, cheapest lever to pull, well before changing bulbs or buying algae remedies.",
      },
      {
        question: "Do I need a special light to grow aquarium plants?",
        answer:
          "For easy species like anubias, java fern, and most crypts, a decent standard fixture is genuinely enough. Demanding carpeting and red plants need stronger output, along with matching nutrient and carbon support. Start with the plants that suit your current light and upgrade when the ambition grows.",
      },
      {
        question: "Are aquarium light timers really necessary?",
        answer:
          "Not necessary, just disproportionately effective for the price. A timer guarantees the same day length regardless of your schedule, which stabilizes plants, fish, and the algae balance in one move. Any consistency you can keep by hand works equally well; most people simply cannot keep it by hand.",
      },
      {
        question: "Can aquarium lights heat the water?",
        answer:
          "Modestly, and mostly in small or shallow tanks. LED fixtures run cooler than older fluorescent or metal halide gear, but long lit hours still add some warmth near the surface. If summer readings climb, shortening the photoperiod is one of the gentler levers, alongside lids and fans.",
      },
    ],
  },

  // =========================================================================
  // AQUATIC SUPPLEMENTS: the bottle aisle honesty
  // =========================================================================
  'fish-and-aquatics/aquatics/aquatic-supplements': {
    heroTitle: "Aquatic Supplements Worth Buying and Bottles to Skip",
    heroSubheadline:
      "Half the aquarium bottle aisle is water chemistry you genuinely need. The other half is potions for problems better fixed with testing, patience, and a water change.",
    metaDescription:
      "Aquatic supplements range from essential dechlorinators and test kits to marginal miracle potions. Learn which bottles earn shelf space and what tests read.",
    introSummary:
      "Every aquarist eventually stands in the bottle aisle holding two products that promise the same clear water and costing very different money. The difference between them is usually whether they treat a cause or a symptom. Dechlorinator, bacteria starter, and a liquid test kit form the honest core of the shelf, and almost everything else is situational or decorative. Here is how to sort the aisle: what each essential bottle does, what a test actually measures, and which potions deserve polite skepticism before any of them reach your basket.",
    sections: [
      {
        id: 'dechlorinator',
        title: "Dechlorinator: The One Bottle That Matters",
        content:
          "If you buy a single bottle for your aquarium, make it water conditioner. Tap water is disinfected with chlorine or chloramine precisely so microorganisms cannot live in it, and your filter's bacteria and your fish's gills are on that casualty list. A dechlorinator neutralizes both on contact, making every water change safe minutes later. Dosing is cheap insurance: follow the volume on the label, treat the new water only, and keep the bottle beside the bucket so it never gets forgotten. Everything else on the supplement shelf is optional next to this one.",
        tips: [
          "Dose conditioner for the replacement water, sized to the label.",
          "Confirm your product handles chloramine, not chlorine alone.",
          "Store the bottle beside your bucket so changes never skip it.",
        ],
      },
      {
        id: 'bacteria-starters',
        title: "Bacteria Starters Speed, Not Replace",
        content:
          "Bottled bacteria short-circuit weeks of waiting by seeding the colony that consumes ammonia, and reputable live formulations genuinely help a new tank mature. What they cannot do is substitute for the process: bacteria still multiply only as fast as ammonia arrives to feed them, and no bottle makes an uncycled tank instantly safe for full stocking. Use starters at setup and after major media disruption, feed lightly while numbers build, and let tests, not the calendar, tell you when the system is ready. Bottles stored hot on a shelf for long periods may have already lost viability, so buy from shops with turnover.",
        tips: [
          "Seed at setup and after filter disruptions, not as a weekly ritual.",
          "Let ammonia and nitrite readings, never the calendar, signal readiness.",
          "Buy live bacteria from stock that moves; heat ages it.",
        ],
      },
      {
        id: 'liquid-tests',
        title: "What a Liquid Test Actually Reads",
        content:
          "A liquid reagent kit is small-scale chemistry: measured tank water, drops of reagent, a developed color matched against a printed chart. That chart is honest about its limits, and so should you be: read vials in daylight against a white card, shake for the stated count, and accept that color matching carries a margin of a shade or two. Test strips trade precision for speed, fine for spot checks on stable tanks, while liquid kits carry the accuracy stocking decisions deserve. Either way, the kit only reports; what you do with the numbers is separate judgment.",
        callout: {
          type: 'pro-tip',
          title: "Daylight decides shades",
          text:
            "Indoor bulbs skew color matching badly. Carry the vial to a window or a white card in indirect daylight before calling the number.",
        },
        tips: [
          "Compare vial colors in daylight against the supplied white card.",
          "Shake reagent bottles and vials for the full stated count.",
          "Keep strips for spot checks and liquid kits for decisions.",
        ],
      },
      {
        id: 'potion-skepticism',
        title: "Miracle Potion Labels Worth Doubting",
        content:
          "Some bottles sell clarity itself, bottled. The skeptical read: cloudy water is usually a bacterial bloom or overfeeding, green water is algae feeding on light and nutrients, and ammonia comes from the bioload. Bottled clarifiers clump particles so the filter can catch them, treating the visible symptom while the cause sits untouched; algae potions knock back the film while the light schedule keeps regrowing it. Fix the cause, run carbon for polish if you like, and save the bottle money for reagent refills, the shelf that actually keeps fish alive.",
        callout: {
          type: 'warning',
          title: "Read the cause first",
          text:
            "Most water problems announce their cause in your test numbers. Treat the reading, not the appearance, and check with a veterinarian comfortable with fish about combining remedies on sick stock.",
        },
        tips: [
          "Match each potion to a cause; if none is named, skip it.",
          "Clarifiers need the filter to finish the job they start.",
          "Spend on reagent refills before potions promising appearances.",
        ],
      },
      {
        id: 'plant-invert-supplements',
        title: "Fertilizers and Supplements Plants Use",
        content:
          "Planted tanks genuinely consume supplements: root tabs feed heavy root feeders through the substrate, liquid fertilizers dose the water column for stem plants, and iron or trace blends keep greens deep. The honest ceiling is light: nutrients beyond what your lighting can drive into growth simply feed algae, so dose to a schedule and to observed plant response rather than enthusiasm. Shrimp and snails add their own line, calcium for shells and molts, usually handled with cuttlebone or a mineral supplement. Comparing fertilizer listings, match the bottle to the plants you actually keep and the routine you will honestly maintain.",
        tips: [
          "Root tabs under swords and crypts; liquid ferts for stems.",
          "Dose to the light you run; extras feed algae instead.",
          "Offer cuttlebone or mineral supplements for shrimp and snails.",
        ],
      },
      {
        id: 'shelf-discipline',
        title: "Assembling a Shelf That Earns Its Space",
        content:
          "The finished shelf is small: conditioner, a liquid test kit with refills, bacteria starter for new setups, and whatever the plants or invertebrates specifically require. That inventory covers the causes; the symptoms wait in the cabinet until tests say otherwise. Before any bottle joins, ask which reading it changes, how you will verify the change, and what happens if you never buy it at all. Products that survive those three questions earn a comparison across listings; the rest is packaging. Restraint also protects the tank, since overdosing trace elements causes as much trouble as deficiency.",
        tips: [
          "Ask which test reading a product changes before it earns space.",
          "Verify effects with the kit you already own.",
          "Write dosing schedules down; memory drifts toward generosity.",
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: "Buy the core",
        items: [
          { highlight: "Dechlorinator comes first", text: "every water change depends on neutralized tap disinfectant." },
          { highlight: "Bacteria bottles seed", text: "startups speed up; mature colonies run on ammonia, not doses." },
          { highlight: "Refills over potions", text: "reagent refills keep answering questions bottles only promise." },
        ],
      },
      {
        icon: 'sparkles',
        title: "Test to decide",
        items: [
          { highlight: "Liquid kits decide", text: "strip tests watch; reagent colors justify stocking decisions." },
          { highlight: "Read in daylight", text: "white card, stated shake counts, honest shade matching." },
          { highlight: "Numbers then action", text: "each bottle should trace to a reading it changes." },
        ],
      },
      {
        icon: 'shield',
        title: "Skip the theater",
        items: [
          { highlight: "Symptom bottles wait", text: "clarifiers polish appearance without touching any actual cause." },
          { highlight: "Cause work wins", text: "feeding, schedule, and changes outlast every quick fix." },
          { highlight: "Ask three questions", text: "which reading, how verified, what if never bought." },
        ],
      },
    ],
    faqs: [
      {
        question: "Do I really need water conditioner for my aquarium?",
        answer:
          "If your tap contains chlorine or chloramine, yes, and nearly all municipal supplies do. Conditioner neutralizes the disinfectant so it stops attacking gills and filter bacteria during water changes. Well-water keepers can sometimes skip it, but they trade the problem for testing their own source instead.",
      },
      {
        question: "Do bacteria starter bottles actually work?",
        answer:
          "The reputable live formulations measurably speed the early weeks by seeding ammonia-consuming bacteria, and they help again after media disruption. They do not make an uncycled tank instantly safe, because colonies still grow only as fast as food arrives. Follow dosing with light feeding and testing.",
      },
      {
        question: "Are test strips or liquid kits more accurate?",
        answer:
          "Liquid kits, clearly. Strips estimate several parameters in seconds and suit stable tanks for spot checks, but reagent kits develop precise colors you match against charts, which is what you want before adding fish or diagnosing a problem. Many keepers run strips weekly and liquids for anything suspicious.",
      },
      {
        question: "Do aquarium clarifiers fix cloudy water?",
        answer:
          "They clump suspended particles so the filter can trap them, which clears the look without touching the reason. Bacterial blooms and overfeeding haze need time, lighter feeding, and patience. If cloudiness follows new fish or a disrupted filter, test for ammonia first rather than reaching for the bottle.",
      },
      {
        question: "Should I add vitamins to my fish's food?",
        answer:
          "A varied diet usually covers what fish need, so vitamins are marginal rather than essential. Frozen and live foods, plus a quality staple matched to the species, deliver the same nutrition more reliably. Vitamin soaks earn their place mostly with fish recovering condition, on advice worth confirming with a veterinarian comfortable with fish.",
      },
    ],
  },

  // =========================================================================
  // WATER CARE: the testing rhythm and source water
  // =========================================================================
  'fish-and-aquatics/aquatics/water-care': {
    heroTitle: "Aquarium Water Care: Reading the Numbers Before Acting",
    heroSubheadline:
      "Good fishkeeping is a quiet loop: test, interpret, change a little water, repeat. Here are the numbers to expect, the stability rules, and how your source water behaves.",
    metaDescription:
      "Aquarium water care runs on a simple loop: test ammonia, nitrite, and nitrate, keep pH steady, respect your source water. Plain targets in plain numbers.",
    introSummary:
      "Water chemistry intimidates newcomers the way a cockpit intimidates a passenger: too many gauges, no idea which matter. The working truth is friendlier. Three numbers track the biological health of the tank, a fourth pair tracks its stability, and everything else is detail you look up when something specific goes wrong. This piece walks the loop worth internalizing: what to test, how often, which targets matter in plain figures, why a stable pH beats a perfect one, and how well water and city water behave differently at the source.",
    sections: [
      {
        id: 'plain-numbers',
        title: "Ammonia, Nitrite, and Nitrate in Plain Numbers",
        content:
          "These three readings tell one continuous story. Ammonia, produced by fish and rotting food, belongs at zero in any settled tank; nitrite, the first conversion step, sits at zero too; nitrate, the end product, accumulates slowly and tells you how urgently a water change is due. In a cycled system the first two sit at zero because bacteria consume them faster than they accumulate, and only nitrate climbs, which makes it the gauge rather than the alarm. Test the pair of zeros whenever something feels off, and track nitrate on a rhythm that sets your change interval.",
        tableData: {
          headers: ['Parameter', 'Target', 'Meaning when off'],
          rows: [
            ['Ammonia', 'Zero, always', 'Bioload or feeding beyond the colony'],
            ['Nitrite', 'Zero, always', 'Conversion still mid-process'],
            ['Nitrate', 'Under about 40 ppm', 'Your water change interval signal'],
          ],
        },
        tips: [
          "Ammonia and nitrite belong at zero; anything else needs action.",
          "Read rising nitrate as scheduling data for the next change.",
          "Test more often in new tanks, warm months, and after stocking.",
        ],
      },
      {
        id: 'testing-rhythm',
        title: "A Testing Rhythm That Fits Real Weeks",
        content:
          "Consistency beats intensity here. A settled, lightly stocked tank does fine with nitrate checked weekly or fortnightly and the zero pair spot-checked monthly or whenever behavior changes; new tanks, recent additions, or a disrupted filter deserve the full panel every few days until readings settle. Anchor testing to something you already do, the morning coffee, the water change itself, so the habit survives busy seasons. Write results down, because a scribbled column of numbers reveals trends a memory cannot, and trends are what water care actually runs on. When comparing test kit listings, price the refills before the kit itself.",
        tips: [
          "Pair testing with an existing habit so it survives busy weeks.",
          "Log every reading; trends matter more than single snapshots.",
          "Escalate to full panels after new fish or filter upsets.",
        ],
      },
      {
        id: 'ph-stability',
        title: "pH Stability Beats Chasing a Number",
        content:
          "Almost every fish in the trade tolerates a wider pH band than forums imply, provided it moves slowly. The stressor is swing, not setting: a tank drifting from 7.2 to 6.4 across a week bothers fish more than a constant 7.6 ever would, which is why adjusting with bottles usually creates the very problem it promised to fix. Learn your tap's natural reading, keep the tank near it, and reserve adjustment for species with genuine, documented needs. Comparing pH adjuster listings, notice none of them promises stability, only numbers.",
        tips: [
          "Keep the tank near your source water's natural reading.",
          "Suspect swings, not settings, when fish act off without symptoms.",
          "Shift pH only for documented species needs, and only gradually.",
        ],
      },
      {
        id: 'kh-buffer',
        title: "KH Is the Buffer Behind pH",
        content:
          "Carbonate hardness is the quiet variable that decides whether your pH stays put. KH acts as a buffer, absorbing acids before they move the reading; a tank with moderate KH holds its pH through weeks of normal life, while a low-KH tank can slide acidic after a single heavy feeding or a skipped change. Test KH alongside pH when numbers misbehave, since a falling KH predicts a future pH slide rather than explaining a past one. The remedy is usually plain: regular partial changes with your source's buffering.",
        callout: {
          type: 'pro-tip',
          title: "Low KH warns early",
          text:
            "A slipping carbonate hardness predicts the pH slide before it happens. If KH reads low against your source, shorten the interval between changes instead of chasing bottles.",
        },
        tips: [
          "Check KH with pH whenever numbers start wandering.",
          "Falling KH predicts the crash; treat it as an early warning.",
          "Plain water changes restore most buffering without additives.",
        ],
      },
      {
        id: 'source-water',
        title: "Well Water and City Water Differ",
        content:
          "Your source sets the chemistry baseline, and the two common sources behave differently. City water arrives disinfected, so conditioner handles the chlorine or chloramine, and parameters stay fairly constant year round, worth confirming against the utility's annual quality report. Well water skips the disinfectant but brings whatever local geology holds: harder or softer water, possible nitrates from surrounding land, and no utility watching it for you, so an outside lab test pays for itself before first stocking. RO systems strip nearly everything, giving blank-canvas water that needs remineralizing before it suits fish or buffers at all.",
        tips: [
          "Read your utility's yearly water quality report before trusting parameters.",
          "Lab-test well water for nitrates and hardness before the first fish.",
          "Remineralize RO water; stripped water lacks buffers and minerals.",
        ],
      },
      {
        id: 'acting-on-results',
        title: "Acting on Results With Water Changes",
        content:
          "The response to almost every poor reading is the same unglamorous tool: a partial water change, temperature-matched and conditioned. Rising nitrate earns a scheduled change; ammonia or nitrite above zero earns smaller, more frequent changes while you hunt the cause, usually overfeeding, overstocking, or a disturbed filter; a slipping KH earns a return to your source's rhythm. Match the new water's warmth to the tank, dose conditioner for the replacement volume, and siphon a little detritus while you are in there. Health questions that outlast the numbers belong with a veterinarian comfortable with fish, not another bottle.",
        tips: [
          "Match replacement water temperature before it enters the tank.",
          "Dilute ammonia with smaller frequent changes, not one giant swap.",
          "Siphon light detritus during changes; leave deep substrate alone.",
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: "Know the targets",
        items: [
          { highlight: "Two zeros always", text: "ammonia and nitrite should never register at all." },
          { highlight: "Nitrate is a clock", text: "its climb schedules your next partial water change." },
          { highlight: "Steady pH wins", text: "a constant reading beats any chased perfect figure." },
        ],
      },
      {
        icon: 'clock',
        title: "Keep the rhythm",
        items: [
          { highlight: "Anchor to habits", text: "coffee mornings or change days make testing automatic." },
          { highlight: "Write every number", text: "logged columns reveal trends that memory smooths over." },
          { highlight: "Escalate on events", text: "new fish and filter upsets call for the full panel." },
        ],
      },
      {
        icon: 'shield',
        title: "Respect the source",
        items: [
          { highlight: "City needs conditioner", text: "chlorine and chloramine must be neutralized every change." },
          { highlight: "Wells need audits", text: "lab testing stands in for the utility's oversight." },
          { highlight: "RO needs rebuilding", text: "stripped water needs its minerals and buffering restored." },
        ],
      },
    ],
    faqs: [
      {
        question: "What should my aquarium water test readings be?",
        answer:
          "Ammonia and nitrite at zero in any settled tank, nitrate under roughly 40 ppm and ideally half that, with pH steady wherever your source naturally sits. Those four answers cover daily fishkeeping. Other parameters matter for specific species or planted tanks, and you can look them up when the situation actually calls.",
      },
      {
        question: "How often should I test my fish tank water?",
        answer:
          "A mature, lightly stocked tank manages with nitrate every week or two and the zeros checked monthly. New setups, recent additions, or filter disruptions want the full panel every few days until the numbers settle. Test also whenever fish behave differently, before assuming anything else.",
      },
      {
        question: "Is it bad if my aquarium pH is high?",
        answer:
          "Only extremes or swings are genuinely bad. Most traded fish live comfortably anywhere in the high sixties to high sevens on the pH scale, and stability outranks the exact figure. Chasing a lower reading with adjusters often swings the tank, which stresses fish more than the original number did.",
      },
      {
        question: "Do I need to treat well water for my aquarium?",
        answer:
          "You can skip dechlorinator, since wells carry no chlorine, but you inherit full responsibility for what else is in it. Test for nitrates and hardness, ideally through a lab, and watch for agricultural runoff near your property. Stability also differs, as recharge events can shift well parameters across seasons.",
      },
      {
        question: "Why are my nitrates always high?",
        answer:
          "Usually a math story: stock, feeding, or interval. Nitrates accumulate between changes, so climbing readings mean the interval is too long or the bioload grew, and heavier planting or slower feeding only trim the slope. Increase change frequency or volume modestly and re-test before adding anything bottled.",
      },
    ],
  },
};
