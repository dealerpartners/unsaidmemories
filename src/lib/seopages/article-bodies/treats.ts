// Treats family articles for Pawzsly U — the category root plus snacks,
// biscuits, and cookies. Four original blog bodies written to the
// WRITING-SPEC.md contract: on-topic, blog voice, at least six sections of
// authentic prose, marketplace-friendly without hard selling.
import type { ArticleBody } from './types';

export const TREATS_ARTICLES: Record<string, ArticleBody> = {
  // =========================================================================
  // TREATS (category root) — the role treats play in a complete diet
  // =========================================================================
  treats: {
    heroTitle: "How Treats Fit Into Your Pet's Day Without Taking Over",
    heroSubheadline:
      'A treat is a small agreement between you and your pet: something extra, given on purpose. Here is how to keep that agreement inside a healthy diet.',
    metaDescription:
      'Treats should stay a deliberate tenth of daily calories. Here is how to budget them, read ingredient lists honestly, and match each treat type to its job.',
    introSummary:
      "Most of us hand out treats with love and very little math. A biscuit here, a chew there, a handful during training, and suddenly the extras are quietly competing with real meals. The fix is not giving less joy; it is giving with a plan. This article lays out the working rules: the tenth-of-calories ceiling that keeps a complete diet complete, how to read an ingredient list straight, which treat shapes suit which jobs, and how to store the whole shelf so nothing goes to waste.",
    sections: [
      {
        id: 'tenth-of-calories',
        title: 'Why Treats Cap at a Tenth',
        content:
          "Complete nutrition comes from the bowl; treats are the top-up. The ceiling most veterinarians suggest is about ten percent of a pet's daily calories from everything extra: biscuits, chews, table scraps, and training rewards all count toward the same line. That number surprises people with small dogs, because a small body runs on a small budget and a single large biscuit can eat most of it. Find the calorie statement on your pet's food and on the treat bag, do the arithmetic once, and you will know exactly how many pieces the day allows.",
        tips: [
          'Count every extra, including table scraps and pill-hiding treats, against the same line.',
          'Do the calorie arithmetic once and write the daily count on the bag.',
          'Small pets run on small budgets; one oversized biscuit can spend it all.',
        ],
      },
      {
        id: 'ingredient-lists',
        title: 'Reading an Ingredient List Straight',
        content:
          "Flip the bag over before you fall for the front. Ingredients appear by weight before cooking, so a named protein such as chicken or beef listed first tells you what the product really is, while vague words like 'meat' tell you nothing worth trusting. Long lists full of fractions you cannot picture deserve skepticism, and watch for split ingredients, where one grain appears several times under different names, each below the protein. As you compare options on a shelf, the honest signal is a short list built around something you could identify in a kitchen.",
        callout: {
          type: 'pro-tip',
          title: 'The first five tell the story',
          text: "By the time you reach the sixth ingredient, the recipe's character is set. Read the first five aloud; if you would not say them to a friend, keep browsing.",
        },
        tips: [
          'Judge the back of the package, never the marketing on the front.',
          'A named protein in the first position beats every slogan on the label.',
          'Multiple grain entries under different names can quietly outrank the protein.',
        ],
      },
      {
        id: 'training-rewards',
        title: 'Fast Rewards for Training Moments',
        content:
          'A training reward has one job: disappear fast enough that the next repetition can start. Soft, small pieces work best, roughly pea-sized for a medium dog, because chewing slows the lesson and big pieces fill the dog before the session ends. Save the aromatic, high-value options for hard distractions, a busy park, a recall you cannot afford to lose. As you compare training treats, check that the pieces are small or can be broken small, and that the bag lists calories per piece, since a long session multiplies whatever you hand out.',
        tips: [
          'Keep rewards pea-sized or smaller so the lesson never waits on chewing.',
          'Reserve smelly, high-value pieces for distractions and unreliable recalls.',
          'Choose bags that state calories per piece; long sessions multiply quickly.',
        ],
      },
      {
        id: 'long-lasting-chews',
        title: 'Long-Lasting Chews for Quiet Hours',
        content:
          'Occupying chews are a different tool: they buy you twenty quiet minutes and give a strong jaw honest work. Because they are meant to be gnawed, not swallowed, size them generously and supervise the session, taking the chew away once it is small enough to gulp. Density matters as much as size, since a piece too hard for your own thumbnail can fracture a tooth rather than clean one. Match the chew to the chewer: a determined large dog needs something substantial, while a gentle senior may prefer something she can slowly soften instead.',
        callout: {
          type: 'warning',
          title: 'Hard chews break teeth',
          text: 'Press your thumbnail into any hard chew before offering it. If it leaves no dent at all, it is harder than teeth are built to meet; pick something with more give.',
        },
        tips: [
          'Supervise long chews and remove pieces small enough to swallow whole.',
          'Test hardness with your thumbnail before offering anything dense.',
          'Time chew sessions rather than leaving them down all day.',
        ],
      },
      {
        id: 'dental-helpers',
        title: 'Dental Helpers and the Honest Crunch',
        content:
          'Some treats are formulated to scrub as well as reward, and the credible ones carry an acceptance seal from the Veterinary Oral Health Council, an independent body that checks plaque and tartar claims. Crunch does provide a genuine but modest mechanical cleaning as the pet chews, which is worth having and worth nothing without the rest of the plan. A biscuit with demonstrated effect is a fine bonus layer on top of brushing, not a substitute for it. Ask your veterinarian where dental treats fit your pet\'s specific mouth.',
        tips: [
          'Look for the VOHC acceptance seal when a dental claim matters to you.',
          'Treat the crunch as a bonus on top of brushing, never the plan.',
          "Ask your veterinarian which dental format suits your pet's mouth.",
        ],
      },
      {
        id: 'type-to-purpose',
        title: 'One Shelf, Different Jobs',
        content:
          'Treats fail most often by mismatch, not by quality: a rock-hard bone handed out mid-training, or a moist morsel expected to occupy a bored afternoon. Before adding anything to your basket, name the job you are hiring it for, then check the format against that job. Almost every treat-shelf disappointment traces back to the wrong shape doing the wrong job. The table below matches the four common purposes with the shapes that serve them and the trap each one carries.',
        tableData: {
          headers: ['Job', 'Best format', 'Trap to watch'],
          rows: [
            ['Fast training reward', 'Tiny, soft, swallowable pieces', 'Calories multiply across repetitions'],
            ['Long-lasting chew', 'Dense, generously sized pieces', 'Over-hard pieces can fracture teeth'],
            ['Dental helper', 'Crunchy, VOHC-accepted shapes', 'No crunch replaces brushing'],
            ['Everyday snack', 'Small biscuits or single-ingredient pieces', 'Piece counts creep upward quietly'],
          ],
        },
        tips: [
          'Name the job first, then shop the format that does it.',
          'Keep a separate stash for training so rewards stay special.',
        ],
      },
      {
        id: 'storage',
        title: 'Storing the Shelf So Nothing Spoils',
        content:
          'Treats are food, and they age like food. Dry formats stay crisp for months in a sealed bin, but humidity softens them and invites pantry pests, so decant them into something airtight rather than rolling the bag shut. Moist formats are the opposite: once opened they stale within weeks, many want refrigeration, and any off smell or visible mold ends the discussion. Label decanted bins with the use-by date from the original bag, keep them out of direct sun, and wash jars between refills so old oils do not taint new stock.',
        tips: [
          'Decant dry treats into airtight bins; rolled bags let humidity in.',
          'Refrigerate moist formats once opened and respect their use-by windows.',
          'Wash treat jars between refills so residue never taints fresh stock.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'clock',
        title: 'Budget the tenth',
        items: [
          { highlight: 'Every extra counts', text: 'scraps, chews, and rewards share one daily calorie line.' },
          { highlight: 'Do the math once', text: "then note the day's piece allowance on the bin." },
          { highlight: 'Small pets, small budgets', text: 'one large biscuit can spend most of it.' },
        ],
      },
      {
        icon: 'check',
        title: 'Read labels straight',
        items: [
          { highlight: 'Named protein first', text: 'means more than any slogan printed on the front.' },
          { highlight: 'Short lists win', text: 'you should recognize what the ingredients actually are.' },
          { highlight: 'Split grains stack', text: 'several entries under other names can quietly outrank the protein.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Match type to job',
        items: [
          { highlight: 'Training wants tiny', text: 'soft pieces that vanish so repetitions keep moving.' },
          { highlight: 'Chews want supervision', text: 'and a density your thumbnail can actually dent.' },
          { highlight: 'Dental claims want proof', text: 'the VOHC seal separates demonstrated effects from decorated packaging.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How many treats can my pet have each day?',
        answer:
          'The widely used veterinary ceiling is about ten percent of daily calories from all extras combined, with the complete diet providing the rest. Find the calorie figures on your food and treat packaging, run the numbers once, and you will have a concrete piece count. If your pet is putting on weight, treats are the first line to audit.',
      },
      {
        question: 'What should I look for in treat ingredients?',
        answer:
          'Start at the top of the list, where ingredients are listed by weight before cooking, and look for a named protein such as chicken, beef, or salmon. Short, recognizable lists beat long ones full of unpronounceable fractions, and vague terms like meat by-products tell you little worth trusting. For pets with allergies, single-ingredient treats make exclusions easy to verify.',
      },
      {
        question: "Are hard chews bad for dogs' teeth?",
        answer:
          'They can be, once hardness passes a simple test. Press your thumbnail into the chew; if you cannot dent it, the piece is harder than teeth safely manage, and fractured teeth are expensive repairs. Dense chews are still honest jaw work when they carry some give, so pick density you can dent and supervise the tail end.',
      },
      {
        question: 'Do dental treats actually work?',
        answer:
          'The honest answer is partly. Chewing crunchy treats does mechanically remove some plaque, and products carrying the VOHC acceptance seal have demonstrated that effect under testing. But the benefit is modest next to daily brushing and professional cleanings, so treat dental formats as a bonus layer. Your veterinarian can tell you where they fit your pet\'s mouth.',
      },
      {
        question: 'How should I store treats once a bag is opened?',
        answer:
          'Treats are food, so treat them like it. Dry treats belong in an airtight bin, safe from humidity and pantry pests, and stay crisp for months. Moist treats stale within weeks of opening, often need refrigeration, and should be tossed at the first off smell or any visible mold. Copy the bag\'s use-by date onto the bin before decanting.',
      },
    ],
    heroImageUrl: '/images/golden_portrait.jpg',
    heroImageAlt: 'Golden retriever portrait waiting patiently for a treat',
  },

  // =========================================================================
  // TREATS / SNACKS — the everyday between-meal bite
  // =========================================================================
  'treats/snacks': {
    heroTitle: 'Everyday Pet Snacks: The Between-Meal Bite Done Well',
    heroSubheadline:
      'The daily snack is where good intentions quietly go sideways. Build a routine instead: measured portions, simple ingredients, and pieces sized to the pet actually doing the begging.',
    metaDescription:
      'Everyday snacks deserve a system: budget the calories, lean on single-ingredient options for sensitive stomachs, size the pieces, and keep the jar honest.',
    introSummary:
      'There is a jar on your counter, and everyone in the house dips into it. A snack after the walk, a snack for sitting nicely, a snack because she looked hungry at four o\'clock. None of these moments is a problem; the trouble is the sum. This article is about the everyday layer of treating, the between-meal bites that hold a routine together. We will set a calorie budget, find snacks that agree with sensitive stomachs, size pieces from Chihuahua to Great Dane, and get that jar under control.',
    sections: [
      {
        id: 'what-a-snack-is',
        title: 'What a Snack Actually Is',
        content:
          'A snack is a small, expected bite between meals, something your pet looks forward to without it moving the nutritional needle. It is not a second dinner, not a boredom pacifier handed out every hour, and not a substitute for the complete food doing the real work. The daily snack earns its place through rhythm: given at roughly predictable times, in roughly predictable amounts, it becomes a language you and your pet share. The biscuit and cookie shelves nearby have their own jobs; the snack drawer is the everyday workhorse.',
        tips: [
          'Give snacks at predictable times so they build routine instead of begging.',
          'Let complete food carry nutrition; snacks are flavor, ritual, and bonding.',
          'Reach for a snack to mark a moment, not to quiet a whine.',
        ],
      },
      {
        id: 'portion-discipline',
        title: 'Portion Discipline Before Flavor Shopping',
        content:
          "Choose the daily piece count before you choose the flavor. The number most veterinarians use for all extras is around a tenth of the day's calories, so a twenty-pound dog's snack allowance is genuinely small, often fewer pieces than people expect. Work it out from the calorie statement printed on the bag, then fix a number and hold it. Buying the tastiest snack on the shelf before setting the budget is how jars empty faster than plans survive.",
        tips: [
          'Set the daily piece count from the calorie statement before shopping flavors.',
          'One jar, one owner, one count; everyone honors the same number.',
          'Cut pieces smaller rather than cutting the ritual out of the day.',
        ],
      },
      {
        id: 'sensitive-stomachs',
        title: 'Single-Ingredient Snacks for Sensitive Stomachs',
        content:
          'When a stomach is easily offended, the shorter the label, the better the odds. A snack that is nothing but chicken breast, or nothing but sweet potato, gives you one variable to work with, which makes both troubleshooting and eliminations straightforward. Introduce anything new gradually over several days, offering a piece or two at a time rather than a handful on day one. Persistent loose stools, itching, or gas that follows treats deserves a conversation with your veterinarian rather than another brand guess.',
        callout: {
          type: 'vet-note',
          title: 'When symptoms persist',
          text: 'Ongoing vomiting, diarrhea, or itching is a job for your veterinarian, not for another bag swap. Rule out the medical cause before you keep redesigning the snack shelf.',
        },
        tips: [
          'One-ingredient snacks leave only one variable to investigate.',
          'Introduce new snacks slowly, a piece or two per day at first.',
          'Track which snacks preceded an upset so patterns surface quickly.',
        ],
      },
      {
        id: 'sizing',
        title: 'Sizing the Bite From Chihuahua to Great Dane',
        content:
          "The same bag cannot serve every body. A piece that suits a Great Dane disappears untracked down a Chihuahua's throat, and a choking-sized gulp is the worst possible snack outcome; at the other extreme, a treat scaled for a toy dog gives a giant breed nothing to chew and no satisfaction at all. When you compare options, picture the jaw that will receive them. The table below matches piece size to the animal, with the failure mode each size guards against.",
        tableData: {
          headers: ['Animal', 'Snack size', 'Main risk to watch'],
          rows: [
            ['Toy breeds and small dogs', 'Pea-sized to fingernail-sized', 'Whole-piece gulping and choking'],
            ['Medium dogs', 'Two-bite pieces', 'Piece count creeping upward'],
            ['Large and giant breeds', 'Palm-sized, substantial', 'Calories per piece add up fast'],
            ['Cats', 'Bite-sized, aromatic', 'Losing interest in bland pieces'],
            ['Seniors with worn teeth', 'Soft, easy to manage', 'Hard snacks go uneaten'],
          ],
        },
        tips: [
          'Break oversized snacks down instead of buying oversized counts.',
          'Choose a second, smaller snack line for tiny-house companions.',
        ],
      },
      {
        id: 'treat-jar-reality',
        title: 'The Treat Jar Reality Check',
        content:
          'Every household has one: the jar that never says no. It gets dipped at breakfast, after walks, when the baby drops food, when someone feels guilty for working late. Multiple givers with no shared tally is the classic way an everyday allowance quietly doubles. The fix is mechanical, not moral: measure the day\'s pieces into a small container each morning, let everyone give from it, and when it is empty, the day\'s snack story is finished. A jar that refills invisibly will always outrun the best intentions.',
        callout: {
          type: 'pro-tip',
          title: 'The daily ration container',
          text: "Decant each morning's allowance into a small cup by the food bin. Kids, partners, and houseguests can give freely from it, and the budget protects itself.",
        },
        tips: [
          'Ration the day\'s snacks into one morning container everyone gives from.',
          'Keep the bulk stash out of sight so refills stay deliberate.',
          'Log new snacks with dates to link them to any stomach upsets.',
        ],
      },
      {
        id: 'snack-timing',
        title: 'Snack Times That Do Not Feed Begging',
        content:
          'Timing is what separates a ritual from a habit your pet trains you into. Offer the afternoon snack after calm behavior, not in response to staring, pawing, or the vocal campaign that works so well at your dinner table, and the habit you reinforce is patience. Anchoring snacks to events also helps: a piece after the walk, a piece before you leave for work, one at bedtime. Predictability keeps the snack meaningful, and it keeps your dinner plate off the negotiation table.',
        tips: [
          'Reward calm behavior with the snack, never the campaign that precedes it.',
          'Anchor snacks to daily events so timing stays predictable.',
          'Never feed a snack from your own dinner plate.',
        ],
      },
      {
        id: 'everyday-freshness',
        title: 'Keeping the Everyday Stash Fresh',
        content:
          'Because snacks are opened daily, they age faster than occasional formats. Choose packaging that reseals properly, or decant into a container with a real gasket, since a snapped clip on a rolled bag is not a seal. Fatty snacks oxidize and pick up stale flavors pets notice before you do, and moist styles mold once humidity gets in. Buy bag sizes your household finishes within a few weeks, keep the container out of sunlight, and wash it whenever you change products.',
        tips: [
          'Use a gasket-sealed container, not a clip on a rolled bag.',
          'Match bag size to how fast your household actually finishes.',
          'Wash the container whenever you switch snack types or brands.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'clock',
        title: 'Hold the count',
        items: [
          { highlight: 'A tenth of calories', text: 'is the everyday ceiling for all extras combined.' },
          { highlight: 'Count before flavor', text: 'pick the daily number first, then shop for tastes.' },
          { highlight: 'One jar, one tally', text: 'every giver draws from the same daily ration.' },
        ],
      },
      {
        icon: 'check',
        title: 'Simple ingredients',
        items: [
          { highlight: 'Single-ingredient snack labels', text: 'leave exactly one variable when a stomach acts up.' },
          { highlight: 'Introduce new snacks slowly', text: 'over the first week, one or two pieces at a time.' },
          { highlight: 'Watch for patterns', text: 'log which snack came right before any upset stomach.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Size and timing',
        items: [
          { highlight: 'Pieces scaled to jaws', text: 'a Dane-sized snack is a choking risk for a Chihuahua.' },
          { highlight: 'Reward calm moments', text: 'never the staring, pawing, or begging that precedes it.' },
          { highlight: 'Sealed daily storage', text: 'gasket lids beat bag clips for everyday freshness.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'How many snacks can my dog have in a day?',
        answer:
          'Most veterinarians suggest a ceiling of roughly a tenth of daily calories for everything beyond the food bowl; convert that into pieces using the calorie statement on the snack bag. For small dogs the honest answer is usually a handful of small pieces, not a bowlful. Whatever the number, make it the household number, and hold it.',
      },
      {
        question: 'What does single-ingredient actually mean on a snack label?',
        answer:
          'It means the snack contains one ingredient, full stop: chicken breast, sweet potato, or freeze-dried salmon with nothing else listed. That simplicity makes single-ingredient snacks the easiest to troubleshoot, because a reaction points to exactly one food. Read the whole label anyway, since flavorings or preservatives sometimes appear alongside the headline ingredient.',
      },
      {
        question: 'Are dog snacks okay for cats too?',
        answer:
          'Some are, but cats are not small dogs, and many dog snacks run too large, too caloric, or too bland for a cat to bother with. Look for snacks formulated for cats, sized to their jaws, and aromatic enough to interest a famously picky species. Anything outside your cat\'s normal diet is worth a quick check with your veterinarian.',
      },
      {
        question: 'How do I stop my family from over-treating our dog?',
        answer:
          'Make the budget physical. Each morning, measure the day\'s snack pieces into a small cup near the food bin and declare it the only source; anyone may give from it, and no one refills it until tomorrow. The visible supply does the policing for you, and kids learn portioning by watching it empty.',
      },
      {
        question: 'Can snacks replace a meal if my pet refuses dinner?',
        answer:
          'No. Complete food carries the full nutrition your pet needs, and snacks are top-ups by design. A pet who skips meals regularly is expressing something worth investigating, from picky habits to dental pain to illness, so the right move is a veterinary conversation rather than a snack-shaped workaround that quietly reinforces the strike.',
      },
    ],
    heroImageUrl: '/images/golden_portrait.jpg',
    heroImageAlt: 'Golden retriever portrait, everyday treat time at home',
  },

  // =========================================================================
  // TREATS / BISCUITS — baked, crunchy, the daily-driver treat
  // =========================================================================
  'treats/biscuits': {
    heroTitle: 'Baked Biscuits and the Honest Case for Crunch',
    heroSubheadline:
      'Baked hard, shelf stable, and endlessly countable, biscuits are the daily-driver treat. The skill is matching crunch to teeth and keeping the bin sealed.',
    metaDescription:
      'Baked pet biscuits earn their daily spot when crunch matches the teeth, pieces break small for training, labels read calmly, and the bin stays airtight.',
    introSummary:
      'What is the sound of a satisfied dog? The long snap of something baked, worked through tooth by tooth, occupies a mouth and a mind the way only crunch can. Biscuits are the daily-driver layer of the treat shelf: cheap enough to be generous, stable enough to buy by the bin, and countable enough to keep a diet honest. This article covers what crunch genuinely does, how to break biscuits into training rewards, how to read grain claims without alarm, and how to keep every piece crisp.',
    sections: [
      {
        id: 'what-crunch-does',
        title: 'What Crunch Actually Does for Teeth',
        content:
          'Chewing something hard produces real mechanical abrasion, scraping some plaque from the teeth as the biscuit shatters and grinds. It is a genuine benefit with a modest ceiling: nothing baked comes close to the cleaning power of a toothbrush, so treat crunch as a supplement, never a program. The satisfaction side matters just as much. A biscuit that takes a full minute to eat leaves a dog feeling fed in a way a two-second swallow cannot, which is exactly the point of a between-activity reward.',
        tips: [
          'Let crunch supplement brushing, never replace it, whatever the label implies.',
          'Favor biscuits that take real chewing time over instant-swallow pieces.',
          "Ask your veterinarian how your pet's teeth are holding up to biscuits.",
        ],
      },
      {
        id: 'hardness',
        title: 'Hardness Matched to the Mouth',
        content:
          'Not every jaw should meet every biscuit. Small dogs, puppies, and seniors with worn or missing teeth do best at the crisp end of the shelf, where a piece snaps under light pressure rather than fighting back. Run your own test before offering anything baked: press a thumbnail into it, and if there is no give at all, it is denser than teeth should meet. Gulpers need attention in the other direction, since a biscuit small enough to swallow whole invites choking. Match the bake to the mouth.',
        callout: {
          type: 'warning',
          title: 'The thumbnail test',
          text: 'One press tells you most of what you need: if your thumbnail cannot dent a biscuit, that biscuit can crack a tooth. Choose the bake your dog\u2019s dentist would approve.',
        },
        tips: [
          'Press your thumbnail into new biscuits; no dent means no purchase.',
          'Give small and senior mouths crisp, low-effort bakes.',
          'Known gulpers get biscuits too big to swallow whole.',
        ],
      },
      {
        id: 'breaking-biscuits',
        title: 'One Biscuit, Many Training Rewards',
        content:
          'A full biscuit is a poor training reward, but a well-placed fracture turns it into a dozen. Scored or snap-apart styles exist precisely for this, and a sturdy biscuit can be broken into fragments small enough to pay for a whole recall session. The honesty part is arithmetic: if the bag states calories per biscuit, a broken biscuit still carries those calories, so count fragments, not giveaways. Breaking treats yourself also keeps the reward economy sane, where one biscuit funds a morning of practice.',
        tips: [
          'Buy scored or snap-apart biscuits when training is the main use.',
          "Count fragments as fractions of the whole biscuit's calories, honestly.",
          'One biscuit broken well can fund a full practice session.',
        ],
      },
      {
        id: 'grain-claims',
        title: 'Grain and Grain-Free Without the Panic',
        content:
          'The grain-free shelf carries a halo it has not entirely earned. Removing grains is a formulation choice, not a quality upgrade, and grain allergies are genuinely uncommon in dogs compared with reactions to animal proteins. A biscuit built on a named protein plus a wholesome grain base is often the better buy. If your pet has a diagnosed allergy, follow the exclusion your veterinarian set out and read every biscuit label against it. Otherwise, judge each option on its ingredient list and calorie statement rather than the word printed largest.',
        callout: {
          type: 'vet-note',
          title: 'Diagnosed allergies change the math',
          text: 'A suspected food allergy deserves proper testing with your veterinarian before you rebuild the whole treat shelf. Guesswork eliminations often remove the wrong ingredient entirely.',
        },
        tips: [
          'Treat grain-free as a formulation detail, not a quality grade.',
          'Compare protein sources and calorie counts before comparing grain claims.',
          'With a diagnosed allergy, follow the exclusion list exactly as written.',
        ],
      },
      {
        id: 'biscuit-shapes',
        title: 'Biscuit Shapes and Their Real Jobs',
        content:
          'Shape is function on the biscuit shelf. Snap-apart rectangles are built for breaking, small bones suit small mouths, and the giant bones are occupying chews wearing treat labels. When you compare options, read the shape the way you would read a tool on a wall: what job is this geometry actually for? The short guide below pairs the common formats with their honest use and the caution each deserves.',
        tableData: {
          headers: ['Format', 'Best use', 'Caution'],
          rows: [
            ['Snap-apart rectangles', 'Training rewards by the piece', 'Fragment calories still count'],
            ['Small bones and hearts', 'Small mouths and daily rituals', 'Easy to over-count through the day'],
            ['Large baked bones', 'Occupying chew time', 'Hardness can challenge teeth'],
            ['Thin crisps and wafers', 'Light, low-effort snacks', 'Shatter into crumbs quickly'],
            ['Dental-formula biscuits', 'Plaque-scraping bonus', 'Modest effect without brushing'],
          ],
        },
        tips: [
          "Pick the shape for tomorrow's actual job, not the photo on the box.",
          'Match bone sizes to the mouth that will work them.',
        ],
      },
      {
        id: 'keeping-crisp',
        title: 'Keeping Biscuits Crisp to the Last Piece',
        content:
          'Biscuits go stale by absorbing the air around them, so the enemy is humidity and the defense is a seal. A rolled bag shut with a clip still breathes; a bin with a gasket lid does not. Stale biscuits soften, lose their snap, and lose the chew time that makes them worth feeding, while damp corners can go moldy in warm kitchens. Decant into an airtight bin, keep it out of sunlight and off warm appliances, and finish one bin before refilling it so old stock never hides beneath new.',
        tips: [
          'Store biscuits in a gasket-sealed bin, not a clipped bag.',
          'Keep the bin away from dishwashers, ovens, and sunny windowsills.',
          'Empty and dry the bin between bags to prevent stale carryover.',
        ],
      },
      {
        id: 'daily-driver',
        title: 'Why the Daily Driver Earns Its Bin',
        content:
          'There is a reason biscuits anchor so many treat routines. They keep for months, survive being carried in pockets and training pouches, and cost little per reward, which makes them the honest default for ordinary good behavior. The soft, fragrant formats have their moments, and the decorated shelf has its occasions, but the biscuit is the one you reach for on a Tuesday. As you compare options for your own bin, favor uniform pieces and a stated calorie count, because a daily habit is exactly where small counts matter most.',
        tips: [
          'Favor uniform pieces so the daily count stays simple to track.',
          'Keep pocket treats in a separate pouch so the bin stays sealed.',
          'Choose stated calorie counts when a biscuit becomes a daily habit.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Crunch on purpose',
        items: [
          { highlight: 'Modest dental benefit', text: 'abrasion helps some, brushing does the real work.' },
          { highlight: 'Chew time satisfies', text: 'a minute-long biscuit beats a treat swallowed in two seconds.' },
          { highlight: 'Hardness needs testing', text: 'your thumbnail should dent anything you hand over.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Broken, not lavished',
        items: [
          { highlight: 'Scored snap-apart styles', text: 'turn one biscuit into a session of rewards.' },
          { highlight: 'Fragments carry calories', text: 'count every piece honestly, even the smallest fragments.' },
          { highlight: 'The Tuesday treat', text: 'the honest daily driver earns its own sealed bin.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Read labels calmly',
        items: [
          { highlight: 'Grain-free is not better', text: 'it is a formulation choice, not a grade.' },
          { highlight: 'Protein and calories first', text: 'matter far more than the largest word on the box.' },
          { highlight: 'Diagnosed allergies only', text: 'change the shopping list, and only with veterinary guidance.' },
        ],
      },
    ],
    faqs: [
      {
        question: "Do biscuits really clean dogs' teeth?",
        answer:
          "A little, honestly. The abrasive crunch scrapes some plaque away as your dog chews, and dental-formula biscuits carrying the Veterinary Oral Health Council's acceptance seal have demonstrated that effect. But nothing baked replaces daily brushing or professional cleanings, so think of biscuit crunch as a supplement that makes a good day better, not the dental plan itself.",
      },
      {
        question: 'Can I break one biscuit into smaller training treats?',
        answer:
          'Yes, and it is often the smartest way to buy them. Scored rectangles snap cleanly into fragments, and even unscored biscuits break along natural lines with a firm press. The arithmetic stays honest if you remember that fragments share the whole biscuit\u2019s calories: two halves equal one whole, so count what you feed rather than what you hand out.',
      },
      {
        question: 'Should I choose grain-free biscuits for my dog?',
        answer:
          'Only for a reason, not by reflex. Grain-free swaps one set of ingredients for another, and grain allergies are uncommon in dogs compared with sensitivities to animal proteins, so the claim itself signals little about quality. Judge biscuits by their named protein, ingredient list, and calorie statement, and if an allergy is actually diagnosed, follow your veterinarian\u2019s exclusion list precisely.',
      },
      {
        question: 'How do I keep biscuits from going stale?',
        answer:
          'Seal them away from air and humidity. A gasket-lidded bin protects the snap far better than a rolled bag with a clip, and keeping the bin off warm appliances and sunny sills prevents condensation. Finish one batch before filling the next, and dry the empty bin first; stale flavors and crumbs carry over into fresh stock otherwise.',
      },
      {
        question: 'How many biscuits per day is reasonable?',
        answer:
          "Work from the ceiling veterinarians commonly use, around ten percent of the day's calories beyond the food bowl, then read the calorie count printed on the box. For small dogs that may mean only a couple of standard biscuits, which is precisely why breaking them into fragments feels so generous to the dog.",
      },
    ],
    heroImageUrl: '/images/aussie_shepherd.jpg',
    heroImageAlt: 'Australian shepherd outdoors ready for a biscuit reward',
  },

  // =========================================================================
  // TREATS / COOKIES — the soft indulgence for special occasions
  // =========================================================================
  'treats/cookies': {
    heroTitle: 'Soft Cookies for the Moments That Deserve Them',
    heroSubheadline:
      'Celebration treats are the indulgent end of the family: soft-baked, occasionally given, and portioned like dessert. Here is how to keep the party pet-safe.',
    metaDescription:
      'Pet cookies are the celebration end of the treat shelf. Learn how soft textures serve seniors, what sugar and fat to watch, and why occasions stay occasions.',
    introSummary:
      'The cake has a candle, and the guest of honor is circling the kitchen. A birthday cookie is a small piece of theater, and pets deserve their place in it. What they do not deserve is a daily dessert habit, because the soft, decorated end of the treat shelf carries more sugar and fat than any everyday routine can absorb. This article covers choosing genuinely pet-safe cookies, why soft textures matter for senior teeth and small jaws, and how to celebrate without letting festivity leak into an ordinary Tuesday.',
    sections: [
      {
        id: 'rarity-rule',
        title: 'The Dessert Rule Starts With Rarity',
        content:
          'A cookie means more because it does not come every day. That is not sentimentality; it is portion control wearing a party hat. Pets learn patterns quickly, and a cookie handed out daily stops being a celebration and becomes an expectation, complete with the demanding behavior expectations create. Decide in advance which occasions earn one: birthdays, gotcha days, the end of a first week in a new home. The everyday snacking belongs to plainer formats; the cookie shelf stays special precisely because you visit it rarely.',
        tips: [
          'Name the occasions that earn cookies, and keep the list short.',
          'A daily cookie stops being a celebration and starts being a demand.',
          'Let plainer everyday treats carry the routine, saving cookies for milestones.',
        ],
      },
      {
        id: 'soft-texture',
        title: 'Soft Texture for Senior Teeth and Small Jaws',
        content:
          'There is a practical reason cookies skew soft. A senior dog with worn or missing teeth cannot manage a brick-hard biscuit, but a soft-baked cookie gives him the whole experience back, flavor and ritual included, with chewing he can actually finish. Small jaws benefit for the same reason: a Chihuahua works a soft cookie the way a Lab works a large bone, jaw by patient jaw. If you are choosing for an older pet, look for gentle textures, and mention any chewing trouble to your veterinarian, since dental pain hides well.',
        tips: [
          'Choose soft-baked formats for seniors and small-jawed companions.',
          'Report new chewing difficulty to your veterinarian; dental pain hides.',
          'Break soft cookies into pieces so small mouths pace themselves.',
        ],
      },
      {
        id: 'sugar-and-fat',
        title: 'Sugar and Fat on the Label',
        content:
          'Read a pet cookie label the same way you read a dessert label, because that is the honest category. Sweetness comes from sugars, syrups, and fruit concentrates, and richness comes from fats and oils, and both belong in small, occasional doses. Check the calorie statement before the decoration wins you over: a large frosted cookie can carry a startling share of a small dog\u2019s daily energy. Compare options by calories per cookie rather than per bag, since occasions involve exactly one, and let plain formats carry the everyday load.',
        tips: [
          'Compare cookies by calories per cookie, not per bag or per box.',
          'Treat frosted and filled formats as the richest of the rich.',
          'Save decorated cookies for occasions; plain formats carry ordinary days.',
        ],
      },
      {
        id: 'safety-line',
        title: 'The Human Cookie Line That Never Crosses',
        content:
          'Human desserts stay on the human plate, full stop. Chocolate is toxic to dogs, xylitol and other sugar alcohols are dangerous in tiny amounts, and raisins, grapes, and macadamia nuts are classics of the dangerous-baking list. None of them belongs in a celebration for a pet. Pet cookies are built from scratch with pet-safe foundations like flours, oats, pumpkin, and peanut butter verified free of xylitol, with yogurt or carob-style coatings instead of chocolate. If your pet eats a human cookie anyway, call your veterinarian promptly rather than watching and hoping.',
        callout: {
          type: 'warning',
          title: 'The pantry is not a bakery',
          text: 'Chocolate, xylitol sweeteners, raisins, grapes, and macadamia nuts make human cookies genuinely dangerous for pets. If a human treat disappears, call your veterinarian right away with the wrapper in hand.',
        },
        tips: [
          'Screen every label for chocolate, xylitol, raisins, and macadamia nuts.',
          'Verify peanut butter is xylitol-free before it goes near a recipe.',
          'Call your veterinarian promptly if a human dessert goes missing.',
        ],
      },
      {
        id: 'celebration-vs-everyday',
        title: 'Celebration Versus Everyday, Kept Apart',
        content:
          'The difference between a cookie and an everyday snack is intention, and intention needs protecting. Everyday formats are portioned, counted, and woven into the day\u2019s calorie budget; a celebration cookie is an event, planned, photographed, and remembered. The failure mode is drift: a cookie after the boring Monday becomes a cookie every Monday, and the budget quietly dissolves. Guard the line the way you guard dessert in your own home, with the occasional exception that proves the rule rather than the exception that becomes it.',
        tips: [
          'Plan cookies around events, and let the calendar be the judge.',
          'Watch for drift; one Monday cookie becomes every Monday quickly.',
          'Break celebration cookies into pieces so the moment outlasts the portion.',
        ],
      },
      {
        id: 'keeping-soft',
        title: 'Keeping Soft Cookies Soft',
        content:
          'Soft formats dry out fastest of all, so storage discipline earns its keep here. An airtight container with a gasket preserves the texture that makes these treats worth their calories, and many fresh-baked styles ask for refrigeration once opened, which the label will say plainly. Humidity swings cause its own trouble, making coatings sticky or saggy, so keep the container away from sunlight and the stove. Check soft cookies before each occasion for off smells, stickiness, or anything fuzzy; small batches beat warehouse-sized tubs for celebration items.',
        tips: [
          'Seal soft cookies in a gasket container right after opening.',
          'Refrigerate fresh-baked styles if the label asks you to.',
          'Inspect before every occasion; anything fuzzy or off-smelling goes out.',
        ],
      },
      {
        id: 'guest-of-honor',
        title: 'One Cookie, Every Guest of Honor',
        content:
          'Match the cookie to the animal at the center of the party. A frosted jumbo cookie is sized for a Labrador\u2019s birthday, not a Chihuahua\u2019s; for the smallest guests, one small cookie or a broken piece of a larger one keeps the occasion honest. Multiple pets in one house each deserve their moment, and that is easiest with small formats handed out in rounds. Cats can join too, when the cookie is formulated for them rather than borrowed from the dog shelf, since cats read richness and size differently.',
        tips: [
          'Size the cookie to the guest of honor, not the photo.',
          'Break jumbo cookies so small guests get an honest portion.',
          'Choose cat-formulated cookies for feline guests rather than dog shelf extras.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'heart',
        title: 'Celebrate deliberately',
        items: [
          { highlight: 'Name the occasions', text: 'birthdays and gotcha days earn the cookie shelf.' },
          { highlight: 'Watch for drift', text: 'one special Monday cookie quietly becomes every single Monday.' },
          { highlight: 'Pieces over volume', text: 'let the moment carry the value, not the size.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Safe by design',
        items: [
          { highlight: 'Never human cookies', text: 'chocolate and xylitol make desserts dangerous for pets.' },
          { highlight: 'Check the coating', text: 'yogurt and carob-style frostings replace chocolate by design.' },
          { highlight: 'Call the vet fast', text: 'if a human treat goes missing, with the wrapper.' },
        ],
      },
      {
        icon: 'check',
        title: 'Soft has a purpose',
        items: [
          { highlight: 'Senior teeth manage', text: 'soft-baked textures where brick-hard biscuits would defeat them.' },
          { highlight: 'Small jaws work', text: 'a soft cookie at their own patient pace.' },
          { highlight: 'Sealed and inspected', text: 'gasket-sealed containers keep the indulgence from drying out.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Can dogs eat human cookies?',
        answer:
          'No, and the reasons are specific: chocolate is toxic to dogs, xylitol sweeteners are dangerous in very small amounts, and raisins or macadamia nuts appear throughout human baking. If your dog eats one anyway, call your veterinarian promptly with the wrapper in hand, since speed matters with these ingredients.',
      },
      {
        question: 'How often can my pet have a cookie?',
        answer:
          'Think dessert frequency, not snack frequency: birthdays, adoptions, and genuinely big days. Cookies sit at the rich end of the treat shelf, denser in sugar and fat than everyday formats, so they belong inside your pet\u2019s overall treat budget and outside the daily routine. When in doubt, a smaller piece of a bigger cookie celebrates just as well.',
      },
      {
        question: 'Are dog cookies safe for cats?',
        answer:
          'Sometimes, but check rather than assume. Dog-formulated cookies often run oversized, calorie-heavy, and bland for a cat, and richness disagrees with many feline stomachs. Cookies formulated for cats exist and fit feline jaws and needs better. Any regular treat outside your cat\u2019s normal diet is worth mentioning to your veterinarian, especially for cats with sensitive digestion.',
      },
      {
        question: 'What is carob, and is it safe for dogs?',
        answer:
          'Carob is a pod-derived, naturally sweet ingredient used as a chocolate stand-in for pets, without the caffeine-related compounds that make chocolate dangerous to dogs. Coatings made from carob-style formulations let a cookie look festive without the toxicity, though they still carry sugar and calories, so the same occasional portions apply.',
      },
      {
        question: 'My dog is on a diet; can we still celebrate?',
        answer:
          'Yes, with adjustments. Break one cookie into tiny pieces so the ritual lasts longer than the calories, subtract the treat from the day\u2019s overall budget, and lean on non-food celebration like a new toy, an extra-long walk, or a photo session. For diabetic pets or strict weight plans, ask your veterinarian which celebratory options are actually safe.',
      },
    ],
    heroImageUrl: '/images/golden_portrait.jpg',
    heroImageAlt: 'Golden retriever portrait on a special occasion',
  },
};
