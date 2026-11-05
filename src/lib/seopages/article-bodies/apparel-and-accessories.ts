// Apparel & Accessories article bodies for Pawzsly U — the category root
// plus ten child topics (sweaters, hoodies, shirts, raincoats, lifejackets,
// hats, sunglasses, dresses, hair accessories, necklaces and pendants).
// Every article is original blog prose written to the WRITING-SPEC.md
// contract in this folder: on-topic angles, honest specifics, no hard sell.
import type { ArticleBody } from './types';

export const APPAREL_ARTICLES: Record<string, ArticleBody> = {
  'apparel-and-accessories': {
    heroTitle: 'Pet Apparel and Accessories Your Dog Will Actually Wear',
    heroSubheadline:
      "Some dogs need a sweater the way you need a coat, and some would rather be naked forever. Knowing which one lives in your house changes everything you shop for.",
    metaDescription:
      'Pet apparel explained honestly: which dogs benefit from clothing, how to measure neck, chest, and back, and how to introduce a first sweater without stress.',
    introSummary:
      "Not every dog wants a wardrobe, and that is fine. A Whippet with a single coat of almost nothing shivers through January, while a Siberian Husky would cook in the same sweater. Pet apparel works only when you start from the animal: their coat, their age, their tolerance for anything on their back. This article covers which dogs and cats genuinely benefit from clothing, the three measurements that make sizing honest, and a patient way to introduce a first garment so it becomes a comfort instead of a fight.",
    sections: [
      {
        id: 'who-benefits',
        title: 'Which Dogs Genuinely Benefit From Clothing',
        content:
          "Lean, single-coated sighthounds like Whippets and Greyhounds have almost no insulation of their own, so they feel real cold once the mercury drops toward freezing. Tiny breeds such as Chihuahuas lose body heat fast because their surface area is large for their weight. Seniors slow metabolically and tolerate chill poorly. And any dog fresh from a close clip, whether for surgery or summer comfort, has temporarily lost the coat they were built with. Double-coated northern breeds are the opposite case: they carry their own furnace, and layering them risks overheating.",
        tableData: {
          headers: ['Dog or coat situation', 'Does clothing help?', 'Sensible first layer'],
          rows: [
            ['Short single coat (Whippet, Frenchie)', 'Yes, in cold and rain', 'Fitted knit sweater'],
            ['Thick double coat (Husky, Newfoundland)', 'Rarely; overheats easily', 'Nothing, or a rain shell only'],
            ['Tiny breed (Chihuahua, Toy Poodle)', 'Yes, even indoors in winter', 'Light sweater or hoodie'],
            ['Senior dog', 'Often yes; chill tolerance drops', 'Easy-on fleece layer'],
            ['Freshly clipped coat', 'Yes, for weeks after the clip', 'Breathable shirt plus sweater'],
          ],
        },
        tips: [
          'Judge by coat and age first; garment labels come last.',
          'A dog that pants indoors in a sweater is overdressed, not cozy.',
        ],
      },
      {
        id: 'stress-signs',
        title: 'Reading the Signs of a Stressed Dog',
        content:
          "Most cats and plenty of dogs want nothing to do with clothing, and their reasons are sound. A garment presses on the shoulders, restricts the signals a tail and ears send, and blocks the sensory feedback fur provides. Watch for the freeze: the dog that walks to the middle of the room and stops dead, tail tucked, ears pinned, refusing to move until the sweater comes off. Lip licking and whale eye belong to the same conversation. No photo is worth teaching your dog that you ignore that language.",
        tips: [
          'Stop and remove the garment at the first freeze or tucked tail.',
          'Cats generally manage bandanas at most; full outfits rarely end well.',
          'Never force legs through sleeves; every struggle hardens the next attempt.',
        ],
        callout: {
          type: 'warning',
          title: 'Overheating is the quiet risk',
          text: "Double-coated and heavy dogs can overheat indoors in a warm layer. Panting, drooling, or hunting for cool floors means the garment comes off now, and insulating layers should be skipped entirely for these coats unless your veterinarian suggests otherwise.",
        },
      },
      {
        id: 'three-measurements',
        title: 'The Three Measurements That Size a Garment',
        content:
          "Grab a soft tape and your dog standing square on the floor. Measure the neck where a collar naturally sits, not higher, not lower. Measure chest girth at the deepest point of the ribcage, usually just behind the front legs, and record it snugly but without compressing fur. Then run the tape from the base of the neck, where the shoulder blades meet, to the base of the tail for back length. Write the numbers down. Between two listed sizes, the chest girth is the one that decides, because a tight chest restricts breathing and movement before anything else.",
        tips: [
          'Record all three numbers in centimeters and inches; listings vary.',
          'Keep the tape level all the way around the ribcage.',
          'Recheck measurements after any weight change or seasonal coat blow.',
          "Trust the maker's size chart over generic small, medium, large labels.",
        ],
      },
      {
        id: 'first-garment-intro',
        title: 'Introducing a First Garment Patiently',
        content:
          "Leave the new piece on the floor for a day so it smells like home, and reward any curiosity. Next, drape it over your dog's back for a count of three, treat, and remove it before they decide to shake it off. Build to brief fastenings indoors, always ending the session while things are going well. Feed meals with the garment on, then take it off. Within a week or two of short daily sessions, most dogs shrug into a sweater the way you shrug into a jacket. If your dog hides at the sight of it, slow down rather than push harder.",
        tips: [
          'Pair every dressing moment with food, never with rushing.',
          'Ten happy seconds beat five miserable minutes, every single time.',
          'Let a nervous dog push their own head through the neck opening.',
        ],
      },
      {
        id: 'comfort-test',
        title: 'Running the Comfort-Over-Cuteness Test',
        content:
          "Once the garment is on, ask for a lap around the room. A comfortable dog moves the same way dressed as undressed: shoulders rolling, front legs reaching, tail carrying normally. Watch the walk from behind for a hacked-up gait or hind legs kicking at fabric. Squat down and check the armpits and groin for fabric pinching skin, since that is where rubs begin. The outfit passes only if your dog can eat, drink, lie down, and toilet without drama. Cuteness is the consolation prize; comfort is the entry fee, and any listing you compare should be judged in that order.",
        tips: [
          'Compare the dressed walk to the naked walk; they should match.',
          'Red skin or matted fur at a seam means refit or retire.',
          'If toileting takes longer in the outfit, the cut is wrong.',
        ],
      },
      {
        id: 'family-map',
        title: 'Where the Rest of the Family Fits',
        content:
          "Once the basics make sense, the accessories branch into jobs that barely overlap. Sweaters exist to insulate; hoodies are their lighter cousins for lounging. Raincoats manage weather, lifejackets manage water, and neither substitutes for the other. Shirts work as sun protection and base layers, while decorative pieces like dresses, hair accessories, and collar pendants have one shared rule: the animal barely notices they are there. If a piece makes your dog harder to look at, walk, or hear, it has failed no matter how well it photographs. Every branch of this category keeps that standard.",
        tips: [
          'Pick one job at a time; a garment doing two does neither well.',
          'Decorative anything earns its place only on an unbothered animal.',
          'Water safety gear is the one branch with no room for style-first picks.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Measure first',
        items: [
          { highlight: 'Neck, chest, back', text: 'are the only three numbers a sizing chart cares about.' },
          { highlight: 'Chest girth wins', text: 'any tie between sizes, because binding there restricts breathing.' },
          { highlight: 'Write them down', text: 'and recheck after weight changes and spring coat blows.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Go slowly',
        items: [
          { highlight: 'Drape before dressing', text: 'so the garment becomes a familiar object, not an ambush.' },
          { highlight: 'Food at every step', text: 'turns a sweater into something worth walking toward.' },
          { highlight: 'Stop at stress', text: 'the moment a tail tucks or the feet freeze.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Comfort decides',
        items: [
          { highlight: 'Match the dressed walk', text: 'to the undressed walk; a changed gait means refit or retire.' },
          { highlight: 'Panting means remove', text: 'the layer immediately and check the room temperature.' },
          { highlight: 'Cuteness is secondary', text: 'every single time, on every single garment you consider.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Do dogs really need clothes?',
        answer:
          "Some do and most do not. Dogs with short single coats, tiny bodies, senior metabolisms, or freshly clipped fur feel real cold and benefit from a warm layer. Double-coated breeds carry their own insulation and usually need nothing. Watch for shivering, a tucked tail on cold walks, and reluctance to go outside; those are your honest signals.",
      },
      {
        question: 'How do I measure my dog for clothes?',
        answer:
          "Take three numbers with a soft tape: the neck where a collar sits, the chest girth at the deepest ribcage point just behind the front legs, and the back length from shoulder blades to tail base. Chest girth decides between sizes, because a garment that binds the chest restricts breathing and stride long before it looks wrong.",
      },
      {
        question: 'How long does it take for a dog to get used to wearing clothes?',
        answer:
          "With short daily sessions and food, many dogs accept a garment within one to two weeks. Start with the piece draped for seconds, build to brief fastenings, and always stop before the shaking and stress begin. Some dogs, and most cats, never accept clothing, and forcing the issue only builds a lasting aversion.",
      },
      {
        question: 'Can cats wear clothes?',
        answer:
          "Occasionally, with heavy caveats. Most cats tolerate nothing more than a light bandana, and anything that restricts the shoulders or covers the tail gets removed with prejudice. If clothing is unavoidable, for medical recovery for example, choose the lightest possible piece and follow your veterinarian's guidance on duration. A stressed cat can injure themselves escaping a garment.",
      },
      {
        question: 'How tight should dog clothing be?',
        answer:
          "Snug enough that fabric does not swing or catch a paw, loose enough that you can slide two flat fingers under every strap and seam. Watch the armpits and the neck trim especially, because those are the first places to rub. If your dog's walk changes once dressed, or hair mats where fabric sits, the fit is too tight.",
      },
    ],
  },

  'apparel-and-accessories/sweaters': {
    heroTitle: 'Choosing Dog Sweaters That Deliver Real Winter Warmth',
    heroSubheadline:
      "A sweater only earns its place if it truly insulates. Density, chest coverage, and an honest fit decide whether your dog gets warmer or just gets dressed.",
    metaDescription:
      'How to choose a dog sweater that truly insulates: knit density, chest coverage where heat escapes, easy dressing, and the indoor-outdoor call for shivery dogs.',
    introSummary:
      "The shiver shows up on the doorstep before the walk starts: tucked tail, lifted paws, a backward lean toward the warm house. Some dogs run cold, and for them a sweater is not decoration but insulation with a job to do. The catch is that not every knit earns the title. A loose weave lets wind straight through, a poor chest cut leaves the coldest real estate bare, and a struggle to dress the dog undoes the whole point. Here is how to sort the useful from the merely adorable.",
    heroImageUrl: '/images/golden_portrait.jpg',
    heroImageAlt: 'Golden retriever portrait',
    sections: [
      {
        id: 'cold-running-dogs',
        title: 'The Dogs That Run Cold All Winter',
        content:
          "Lean sighthounds like Whippets and Italian Greyhounds have barely any body fat and a single close coat, which is why they shiver on days other dogs find brisk. Chihuahuas and other toy breeds lose heat through skin area they cannot spare. Senior dogs burn less energy keeping warm than they did in their prime, and a thin, older Whippet crosses into genuinely cold territory on ordinary winter walks. Post-clip dogs of any breed lose their built-in layer for weeks. If your dog trembles, lifts paws, or hurries back to the door, that is the body asking for insulation, not accessories.",
        tips: [
          'Read shivering, lifted paws, and retreats to the door as cold, not drama.',
          'Double-coated breeds like Huskies usually skip sweaters entirely.',
          'A thin senior may need a warm layer indoors, not just outside.',
        ],
      },
      {
        id: 'knit-density',
        title: 'Knit Density Blocks the Wind or Does Not',
        content:
          "Pick a sweater up and stretch the knit between your fingers. A tight, dense weave blocks wind and holds a warm layer of still air against your dog's body; a loose cable knit looks cozy and does almost nothing in a breeze, because moving air passes straight through the stitches. Wool and wool blends insulate beautifully, even when slightly damp, but most need hand washing. Acrylic knits survive the washer and dryer cheerfully at the cost of a little warmth per ounce. Fleece-lined knits sit somewhere in the middle, adding a wind-blocking layer without the itch some dogs protest at the collar.",
        tips: [
          'Stretch the knit in the aisle; if daylight passes, wind will too.',
          'Hand-wash wools and dry them flat, or watch a favorite shrink sideways.',
          'Compare the fabric description on listings before you compare anything else.',
        ],
      },
      {
        id: 'chest-coverage',
        title: 'Covering the Chest Where Heat Escapes',
        content:
          "Dogs lose most of their heat through the underside, where the coat is thinnest and the lungs sit close to the surface. A sweater worth buying covers the chest and wraps under the belly rather than draping only along the spine. Check the front: a high neck shields the throat, and a snug chest panel does more for warmth than any decorative hood. Length should reach the base of the tail, never past it, so toileting stays clean and simple. Deep-chested breeds like Greyhounds and Dobermans need a cut proportioned for their silhouette, or the front panel rides up and quits working mid-walk.",
        tips: [
          'Flip the sweater over and check how much chest and belly it actually covers.',
          'Front panels that ride up on deep-chested breeds leave the coldest area bare.',
          'Length stops at the tail base; longer fabric fouls on toileting.',
        ],
      },
      {
        id: 'dressing-tactics',
        title: 'Dressing a Dog Without a Wrestling Match',
        content:
          "The world's best sweater fails if putting it on becomes a fight. Gather the body of the knit in your hands so the head opening rolls wide, then guide it over the eyes and ears in one smooth motion rather than dragging it along the face. Pause at the ears; some dogs guard them fiercely. For leg holes, reach inside the sleeve, take the paw gently, and draw the leg through rather than pushing fabric toward the dog. A treat between legs keeps the mood light. If your dog ducks away before you even start, return to the patient introduction routine and slow the pace instead of holding them still.",
        tips: [
          'Roll the neck opening wide in your hands before it nears the face.',
          'Reach into sleeves and draw legs through instead of stuffing paws in.',
          'Step-in styles spare the head entirely for dogs that guard their ears.',
        ],
      },
      {
        id: 'indoor-outdoor-call',
        title: 'The Indoor and Outdoor Judgment Call',
        content:
          "A sweater built for the walk may be too much for the living room. Indoors, dress for the house: a thin knit for a chilly, older dog whose thermostat runs low, nothing for a young double-coated dog sprawled on cool tiles. Watch the thermostat rather than the season, because some homes stay cold all summer with air conditioning while others overheat in October sun. Outdoors, layer for the walk length; a fifteen-minute loop in damp cold demands more than a quick garden dash. Whenever your dog starts panting indoors in knit, the sweater has overstayed, and the same honesty applies to anything you browse for the shoulder seasons.",
        tips: [
          'Dress for the thermostat, not the month on the calendar.',
          'Panting indoors means the knit comes off immediately, no exceptions.',
          'Keep a thin house sweater and a thicker walk sweater as separate jobs.',
        ],
        callout: {
          type: 'warning',
          title: 'Panting ends the outfit',
          text: "Panting indoors while dressed is the earliest sign of overheating, well before drooling or hunting for cool floors. Remove the sweater the moment it appears, and choose thinner knits for house wear so a cold-sensitive dog stays comfortable without swinging the other way.",
        },
      },
      {
        id: 'knit-care',
        title: 'Washing Knits So They Last',
        content:
          "Sweaters work hard and wash often, because knits collect the same coat oil and street grime as collars. Turn the sweater inside out, zip any zips closed, and use a mesh laundry bag for machine-safe acrylics on a gentle, cool cycle. Wool and wool blends do better with a hand wash in cool water and a flat drying session on a towel, since hanging a wet knit stretches the shoulders into a shape no dog has. Reshape the cuffs while damp. Check the armpit seams and neck trim for loose threads after every few washes, because a popped stitch at the neck turns into a run that ruins the whole garment.",
        tips: [
          'Dry knits flat on a towel so gravity does not stretch the shoulders.',
          'Bag and cool-wash acrylics; hot water and heat fuzz them up.',
          'Rotate two sweaters so a clean one is always on hand.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'sparkles',
        title: 'Knit density',
        items: [
          { highlight: 'Stretch test first', text: 'because a weave you can read a page through blocks nothing.' },
          { highlight: 'Wool warms damp', text: 'but demands hand washing and flat drying to survive.' },
          { highlight: 'Fleece linings help', text: 'windy walks while sparing sensitive skin at the collar.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Cover the chest',
        items: [
          { highlight: 'Heat exits underneath', text: 'so chest and belly coverage outweigh any spine decoration.' },
          { highlight: 'High neck helps', text: 'shield the throat on the coldest morning commutes.' },
          { highlight: 'Stop at tail base', text: 'so nothing fouls when your dog squats mid-walk.' },
        ],
      },
      {
        icon: 'check',
        title: 'Wear it well',
        items: [
          { highlight: 'Roll wide, move slow', text: 'when guiding the neck over eyes and ears.' },
          { highlight: 'Panting means off', text: 'immediately, indoors or out, no matter how cute.' },
          { highlight: 'Dry flat always', text: 'so a wet knit keeps its shoulders season after season.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'What temperature does my dog need a sweater?',
        answer:
          "There is no single number, because coat and body fat matter more than the thermometer. Many small, thin-coated dogs appreciate a sweater once temperatures fall toward freezing, and some need one sooner. Read your dog instead of the dial: shivering, lifted paws, and reluctance to leave the doorstep all say cold, while comfortable trotting says no layer needed yet.",
      },
      {
        question: 'Should my dog wear a sweater indoors?',
        answer:
          "If the house runs cold and your dog is small, thin-coated, senior, or freshly clipped, a thin indoor knit makes real sense, and plenty of shivery dogs settle visibly once dressed. For young, thick-coated dogs, indoor sweaters usually cause overheating instead. Judge by the thermostat and by whether your dog pants, sprawls on cold floors, or curls tightly for warmth.",
      },
      {
        question: 'Can my dog wear a sweater all day?',
        answer:
          "A comfortable, correctly fitted sweater can stay on for a full day of supervision, but take it off overnight and whenever the house warms up. Unsupervised hours in knit invite chewing, snagging on crate wires, and unnoticed rubbing at the armpits. A dog who sleeps in a sweater can also overheat without anyone noticing.",
      },
      {
        question: 'Wool or acrylic for a dog sweater?',
        answer:
          "Wool insulates better and keeps warming even when damp, which matters in rain-prone winters, but it usually asks for hand washing and patient drying. Acrylic throws caution to the laundry machine and costs less, at the price of a bit less warmth. Many owners land on a wool-blend walk sweater plus a cheap acrylic backup, covering both moods.",
      },
      {
        question: 'How do I know a sweater fits my dog?',
        answer:
          "Slide two fingers under the neck trim and under the belly closure; they should fit without forcing. The knit should reach the tail base without covering it, and the chest panel should sit smooth with no dragging on the underside. Then watch movement: a dog that trots normally, lies down, and toilets without hesitation is wearing the right size.",
      },
    ],
  },

  'apparel-and-accessories/hoodies': {
    heroTitle: 'Dog Hoodies for Chilly Houses and Casual Days',
    heroSubheadline:
      "The hoodie is the lighter layer your dog lives in around the house: fleece warmth without sweater weight, with a hood that warms the neck and leaves the head alone.",
    metaDescription:
      'Dog hoodies are the casual layer for chilly houses: fleece warmth, neck-warming hoods, pullover versus zippered choices for nervous dogs, and honest fit.',
    introSummary:
      "Why do dogs look so at home in hoodies? Because the garment is essentially a blanket with sleeves, and most dogs want both. A hoodie is the casual member of the apparel shelf: lighter than a sweater, built for cool houses and slow days. The good ones use soft fleece, a roomy chest, and a hood that works as a neck warmer instead of a hat. The details that separate a favorite from a chewed-up disappointment are small, and they start with knowing what the layer is for.",
    heroImageUrl: '/images/golden_portrait.jpg',
    heroImageAlt: 'Golden retriever portrait',
    sections: [
      {
        id: 'portable-blanket',
        title: 'The Blanket Your Dog Can Walk Around In',
        content:
          "Think of a hoodie as portable bedding. Where a sweater exists to insulate against serious cold, the hoodie covers the gap between a warm dog and a cool room: drafty evenings, early mornings before the heating kicks in, the couch nap that follows a wet walk. Fleece is the standard fabric because it holds warmth without weight and survives constant laundering. Most dogs can wear one for hours without complaint, which is exactly the point. If your house runs cool and your dog curls tight on cold afternoons, this is the layer that fixes it.",
        tips: [
          'Reach for hoodies on cool-house days; save sweaters for real cold.',
          'Fleece suits long wear; heavy insulation belongs on actual winter walks.',
          'A dog curled tight on cold floors is asking for this layer.',
        ],
      },
      {
        id: 'warmth-without-overheat',
        title: 'Warmth Without the Overheat',
        content:
          "The classic mistake is treating a hoodie like outerwear. Pulled out for a January blizzard, it under-delivers; left on a dog in a house warmed to summer levels, it over-delivers. Use the layer for the in-between: the hour after a wet walk when damp fur chills, the office-cold afternoon, the autumn morning that starts frosty and warms by noon. Because fleece breathes better than coated rain gear, a hoodie also works as the outer layer for dry, chilly strolls around the block. Watch for the same honest signals as any garment: panting, seeking cool tile, or trying to back out of the sleeves.",
        tips: [
          'Save the hoodie for in-between cold, not blizzards or heated rooms.',
          'Damp fur after wet walks chills fast; a dry hoodie warms it.',
          'Panting and tile-seeking are removal requests, in every layer your dog owns.',
        ],
      },
      {
        id: 'hood-logic',
        title: 'The Hood Warms the Neck, Not the Head',
        content:
          "A human hood covers the head because humans lose heat there; a dog does not, and most dogs resent anything over their ears. Worn down, a hood piles a double layer of fleece at the neck and shoulders, which is real warmth where thin-coated dogs feel drafts. Worn up, it should shield only the neck and maybe the ear bases, never the ear flaps themselves, because muffled hearing reads as danger to a dog and blindfolds read worse. Look for hoods that sit behind the ears or attach with a single snap, so you can reposition or remove them entirely on dogs who object.",
        tips: [
          'Hoods down pile warmth at the neck; that is their best job.',
          'Nothing should cover ear flaps; muffled hearing stresses most dogs.',
          'Snap-off hoods let you delete the feature on objectors.',
        ],
      },
      {
        id: 'pullover-or-zipper',
        title: 'Pullover or Zipper for the Nervous Dresser',
        content:
          "Pullovers have fewer parts to fail: no zipper to catch belly fur, no sliders to chew, and stretchy fabric forgives a slightly imperfect fit. Zippers trade that simplicity for speed and dignity. A nervous dog that hates fabric sliding over the eyes gets dressed in seconds when you lay a zippered hoodie along the back and close it underneath, nothing ever approaching the face. Check for a fabric flap or binding behind the teeth, because unprotected zippers pinch skin and slice fur at the belly. Whichever style you lean toward, compare the chest dimensions on listings closely, since hoodie sizing runs generous in some shops and snug in others.",
        tips: [
          'Choose zippers for dogs that panic when fabric nears the face.',
          'Demand a fabric flap behind the teeth; bare zippers pinch and cut fur.',
          'Pullovers forgive sizing drift; check chest numbers anyway before ordering.',
        ],
      },
      {
        id: 'fleece-build',
        title: 'Fleece, Seams, and Days-Long Wear',
        content:
          "A hoodie worn like clothing deserves to be built like clothing. Check the seam placement: rough or raised seams under the front legs are the first place friction wears hair thin and skin red, so look for flat or covered seams in the armpits. Printed care labels beat sewn-in tags, which itch at the neck. Cuffs that gently gather at the wrists keep sleeves from dragging in water bowls, and a cut that clears the belly keeps male dogs dry on walks. Fleece quality shows after ten washes: the cheap versions pill into little felt balls that hold grime, while denser fleece keeps its loft and softness.",
        tips: [
          'Flat armpit seams prevent the hair-thinning rub of all-day fleece wear.',
          'Printed labels spare itchy necks; trim any tags that remain.',
          'Gathered cuffs keep sleeves out of water bowls and food dishes.',
        ],
        callout: {
          type: 'warning',
          title: 'Cut the drawstrings',
          text: "Remove any human-style drawcord at the hood or hem before the first wear. Dogs chew cords free and swallow them, and a looped drawstring can catch on crate bars, fence gaps, and doorknobs. If a design needs adjusting, choose elastic or a snap instead.",
        },
      },
      {
        id: 'smell-like-home',
        title: 'Making the Hoodie Smell Like Home',
        content:
          "The reason some dogs nap inside their hoodies is scent. A garment that smells like the house reads as furniture, not equipment, so leave the new one in your dog's bed for a few days before the first wearing. Feed a meal with it draped nearby. When you do dress your dog, keep the first sessions short and calm, pairing the moment with dinner or a chew rather than a departure, so the hoodie never becomes the uniform of being left. Wash it eventually, but less obsessively than walk gear; a house layer mainly collects hair and dander, and a familiar smell is the whole appeal.",
        tips: [
          'Let a new hoodie sleep in your dog\'s bed before its first wear.',
          'Pair early wearings with meals and chews, never with departures.',
          'Launder house layers gently; a familiar scent is the point.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'heart',
        title: 'Right layer',
        items: [
          { highlight: 'Lighter than sweaters', text: 'hoodies own the cool-house hours, not the deep-freeze walk.' },
          { highlight: 'Fleece breathes well', text: 'so hours of lounging rarely overheat a thin coat.' },
          { highlight: 'Watch panting anyway', text: 'because rooms warm up and layers forget to notice.' },
        ],
      },
      {
        icon: 'check',
        title: 'Hood logic',
        items: [
          { highlight: 'Neck warmth only', text: 'is a hood\'s real job on any dog.' },
          { highlight: 'Ears stay clear', text: 'since muffled hearing reads as danger, not cozy.' },
          { highlight: 'Snap-off designs win', text: 'for head-shakers and for dogs that object on principle.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Safer by default',
        items: [
          { highlight: 'Cut drawstrings out', text: 'before the first wear; cords invite chewing and snags.' },
          { highlight: 'Flaps behind zippers', text: 'protect belly skin and fur from pinched teeth.' },
          { highlight: 'Flat armpit seams', text: 'keep all-day fleece from rubbing hair thin at the legs.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Are dog hoodies just for looks?',
        answer:
          "The good ones are not. A fleece hoodie adds a real layer of warmth for thin-coated, small, senior, or post-clip dogs in cool houses, and the coverage around the neck holds heat meaningfully. For double-coated breeds in warm rooms, though, a hoodie is indeed decorative, and those dogs are better off skipping it entirely.",
      },
      {
        question: 'Hoodie or sweater for my dog?',
        answer:
          "Match the layer to the cold. Sweaters use denser knits for genuine outdoor chill, while hoodies carry lighter fleece for cool houses and casual strolls. If your dog shivers outside in winter, reach for the sweater; if they curl up tight on drafty afternoons indoors, the hoodie is the honest answer.",
      },
      {
        question: 'Can my dog sleep in a hoodie?',
        answer:
          "Some dogs doze happily in a light fleece, and for a cold room and a thin coat it can help them settle. Supervised naps are fine; overnight is a different question, because a garment that shifts or snags goes unnoticed for hours. Take the hoodie off at bedtime and offer a warm blanket instead.",
      },
      {
        question: "Do hooded jackets bother dogs' ears?",
        answer:
          "They can, and the hood is the part to watch. Down around the neck, most dogs ignore it; pulled over the ear flaps, many object strongly, since muffled hearing and reduced vision both read as threat. Keep the hood behind the ears or remove it, and choose snap-off designs for dogs that shake their heads the moment fabric touches them.",
      },
      {
        question: 'How should a dog hoodie fit?',
        answer:
          "Roomier than a sweater, but still honest. You should gather a little slack at the chest without the fabric swinging loose, and sleeves should end at the wrists, not trail past the paws. The neckline clears the ears when the head lifts, and the belly stays clear for toileting.",
      },
    ],
  },

  'apparel-and-accessories/shirts': {
    heroTitle: 'Dog Shirts for Sun, Skin, and Everyday Layering',
    heroSubheadline:
      "A simple dog shirt quietly solves three problems: sun on pale skin, a coat missing after a summer clip, and the cold gap under a sweater. Fitting one well is mostly about seams.",
    metaDescription:
      'Dog shirts do real work: sun protection for pale skin, coverage after a summer clip, and a smooth base layer under sweaters, with fit that prevents rubbing.',
    introSummary:
      "June arrives, the groomer has just taken your dog's coat down for summer, and suddenly pet shirts make perfect sense. A close clip removes both insulation and sun shielding in one pass, and a soft shirt hands both back. The same simple garment shades pale skin at the beach, smooths out the friction under a winter sweater, and gives a shorn dog something to hide behind. The trick is treating it like the tool it is, which starts with an honest look at your dog's skin, coat, and seams.",
    sections: [
      {
        id: 'three-jobs',
        title: 'A Base Layer With Three Jobs',
        content:
          "Pet shirts sit at the bottom of the apparel stack, and that position is their identity. First, they shield skin from sun where fur is thin or absent. Second, they restore coverage after a close clip, when a dog's own coat has temporarily left the building. Third, they act as a smooth base under heavier layers, reducing the rub of a sweater against short fur and adding warmth without bulk. A plain shirt also happens to be the garment most dogs accept fastest, since it barely changes how their body feels. That acceptance makes it a good first piece for a dog new to clothing.",
        tips: [
          'Start a clothing-shy dog with a shirt; it changes body feel least.',
          'One shirt covers sun days, post-clip weeks, and sweater season.',
          'Neutral colors hide the daily grime shirts inevitably collect.',
        ],
      },
      {
        id: 'sun-protection',
        title: 'Sun Protection for Pale Skin and Thin Coats',
        content:
          "Sun damage is not a human-only problem. Dogs burn where fur is sparse and pigment is light: the belly and inner thighs that face upward on a beach nap, the bridge of the nose, the ear tips of thin-coated breeds. A shirt covers the largest of those zones, and light-colored, tightly woven fabric does the most good. The nose and ears stay exposed, so pair the shirt with shaded rest breaks during midday hours and pet-safe sunscreen on the barest spots. Brachycephalic breeds with prominent eyes and short muzzles appreciate the coverage on their thinly furred chests. Check with your veterinarian about any new redness or scaly patches that persist.",
        tips: [
          'Prioritize the belly and chest; they face the sun when dogs sprawl.',
          'Tightly woven, light-colored fabrics shield better than loose knits.',
          'Noses and ear tips stay bare; schedule midday shade and sunscreen.',
        ],
        callout: {
          type: 'vet-note',
          title: 'Persistent spots need eyes',
          text: "A patch of redness, flaking, or changed pigment that survives two weeks in the shade deserves your veterinarian's attention. Sun exposure adds to the risk on pale skin, but only a hands-on exam can separate sunburn from allergies and infections that mimic it.",
        },
      },
      {
        id: 'post-clip-coverage',
        title: 'Coverage After the Summer Clip',
        content:
          "A close clip for hot weather is mercy until the dog meets sunshine, brush, and mosquito territory with no coat in the way. For the weeks while fur grows back, a shirt is honest armor: it blocks ultraviolet light from newly exposed skin, keeps twigs and burrs from scraping bare flanks on trail walks, and stops a dog from worrying at itchy regrowth with teeth. Choose breathable weaves for the job, because a shirt that traps heat defeats the purpose of the clip it follows. Loose cotton or moisture-wicking athletic styles suit the post-clip weeks better than heavy interlock knits.",
        tips: [
          'Dress clipped dogs for sunny trails and burry fields, not just beaches.',
          'Breathable weaves only; a heat-trapping shirt undoes the whole clip.',
          'Use the shirt to interrupt licking at itchy, growing-back fuzz.',
        ],
      },
      {
        id: 'no-rub-fit',
        title: 'A Body Suit That Never Rubs',
        content:
          "Shirt fit walks a narrow line, because the garment must stay put without pressing anywhere. A fit that is too loose rides up and twists; too tight, it digs at the armpits and behind the front legs, the two places where dog shirts fail first. Look for flat or offset seams exactly there, plus a little lycra-style stretch through the body so movement never fights fabric. The hem should sit smooth on the back without pressing the base of the tail, and the neckline should clear the throat when the head lifts to bark at the mail slot. Longer styles must stay well clear of male anatomy.",
        tips: [
          'Run a finger under the armpit seams after the first long wear.',
          'Stretch through the body keeps a shirt in place without cinching.',
          'Any redness where edges sat means the cut, not the dog, failed.',
        ],
      },
      {
        id: 'base-layer',
        title: 'The Quiet Layer Under Sweaters',
        content:
          "In cold months a thin shirt becomes the base layer of a two-piece system, and it earns its spot quietly. The smooth fabric lets a sweater slide on without dragging fur, which spares both the dressing struggle and the static that follows. It adds a surprisingly effective layer of trapped air, and it keeps knit cuffs from rubbing wrist hair thin over a long winter. If your dog wears a harness, a base shirt also sits between straps and skin on long walks, cutting the strap rub that some short-coated breeds develop. Choose smooth, close-weave styles here rather than thermal waffle knits, which can pill under friction.",
        tips: [
          'Slide sweaters over a base shirt; fur and static both settle.',
          'Shirts under harness straps prevent rub on short-coated chests.',
          'Skip waffle weaves as base layers; friction pills them quickly.',
        ],
      },
      {
        id: 'shirt-laundry',
        title: 'Washing a Shirt Worn Like Skin',
        content:
          "A shirt worn most days is laundry, not equipment, and it should be built for that reality. Washable cotton blends and stretch synthetics survive warm cycles weekly, which matters because shirts collect skin oils, drool, and whatever your dog rolled in at the park. Check the neckline and cuff elasticity every few washes, because trim that relaxes lets the shirt sag and swing. Keep at least two in rotation for a daily-wear dog; a single shirt spends its life damp or musty. The same honesty about construction applies to any shirt you are browsing, so check seam and trim quality before anything else.",
        tips: [
          'Warm-wash weekly; worn-like-skin garments earn their keep in the laundry.',
          'Relaxed neckline trim means the shirt now swings instead of staying.',
          'Two in rotation beats one perpetually damp shirt on a daily wearer.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'shield',
        title: 'Sun smart',
        items: [
          { highlight: 'Pale skin burns', text: 'on bellies and ear tips, not just at the beach.' },
          { highlight: 'Tight weaves block', text: 'more ultraviolet light than loose knits and mesh.' },
          { highlight: 'Shade bare spots', text: 'with sunscreen and breaks, since shirts cover only clothed zones.' },
        ],
      },
      {
        icon: 'check',
        title: 'Post-clip cover',
        items: [
          { highlight: 'Clips remove armor', text: 'against sun, branches, and itchy-teeth attention for weeks.' },
          { highlight: 'Breathable weaves only', text: 'because a heat-trapping shirt defeats its own purpose.' },
          { highlight: 'Interrupt regrowth licking', text: 'with gentle coverage while the coat grows back.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Zero-rub fit',
        items: [
          { highlight: 'Armpits fail first', text: 'so flat seams there decide the shirt\'s whole life.' },
          { highlight: 'Two fingers, flat', text: 'under the neckline and body, without any prying.' },
          { highlight: 'Roomy beats tight', text: 'for this garment; binding defeats every job it has.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Can dogs wear shirts in the summer?',
        answer:
          "Yes, if the shirt is light and breathable, and the purpose is sun protection rather than warmth. A loose, light-colored, tightly woven shirt keeps ultraviolet light off pale skin while letting air move. Skip heavy cotton knits in heat, and watch for panting, which says the shirt is trapping more than it blocks.",
      },
      {
        question: 'Do dog shirts stop sunburn?',
        answer:
          "On the skin they cover, a tightly woven shirt does exactly that, which makes them genuinely useful for pale-bellied breeds that sunbathe upside down. They cannot shade the nose, ear tips, or the thin skin around the eyes, so those areas still need shade breaks and pet-safe sunscreen. Think of a shirt as broad coverage, not complete armor.",
      },
      {
        question: 'How tight should a dog shirt be?',
        answer:
          "Close enough to stay put, never close enough to mark the skin. You should slip two fingers flat under the neckline and under the body without prying, and the armpits should never pull. After a wear, look for pink lines or flattened fur at the seams; both say the shirt is too small. Loose is better than tight.",
      },
      {
        question: 'Will a shirt under a sweater make my dog too hot?',
        answer:
          "Usually the opposite concern is more common, but warmth is real. A thin base layer adds modest insulation, so reserve the combination for genuinely cold walks and cold houses. If your dog pants while wearing both layers, drop to the sweater alone and reevaluate. Layering works best when each piece is thin enough to adjust by feel.",
      },
      {
        question: 'Why does my dog seem calmer in a shirt?',
        answer:
          "Some owners report a settling effect from gentle, even pressure around the body. The evidence is anecdotal, so treat it as a bonus rather than a promise, and let your dog vote with their behavior. A dog that freezes, hides, or works at the seams with their teeth is not soothed, regardless of the theory.",
      },
    ],
  },

  'apparel-and-accessories/raincoats': {
    heroTitle: 'Dog Raincoats That Keep Walks Dry and Visible',
    heroSubheadline:
      "A good raincoat keeps the walk happening in weather you would rather skip: honestly rated fabric, a shape that sheds water instead of funneling it, and trim that glows in headlights.",
    metaDescription:
      'Dog raincoats explained: waterproof versus water-resistant, cape and hood design that sheds water, reflective trim for dark walks, and drying between outings.',
    introSummary:
      "The classic raincoat mistake happens in October: the first storm of the season rolls in, the walk is due, and the new coat comes out of its packaging with a dog who has never worn it. Cue the wrestling match by the front door, in the rain. Wet-weather gear works only when the fabric rating is honest, the shape actually sheds water, and the dog has already practiced wearing the thing. Get those three right and rainy walks stop being cancellations. This is how the pieces fit together.",
    heroImageUrl: '/images/aussie_shepherd.jpg',
    heroImageAlt: 'Australian shepherd outdoors on a walk',
    sections: [
      {
        id: 'wet-walks-happen',
        title: 'Wet Walks Still Need to Happen',
        content:
          "Exercise does not pause for the forecast, and a soaked dog is a smell, a shake, and a towel mountain waiting in your hallway. The dogs who need rain gear most are the ones whose coats hold water: single-coated breeds whose fur soaks to the skin, seniors whose stiff joints dislike damp chill, and small dogs whose bellies collect splash from every puddle. A double-coated retriever shrugs off a drizzle, so rain gear for them is more about your floors than their comfort. Honest motivation matters, because a coat bought for the dog's sake gets used and one bought for the photo does not.",
        tips: [
          'Single coats soak to skin; they are the real raincoat customers.',
          'Seniors often slow in damp chill; keep their walks warm and dry.',
          'Double-coated dogs mostly need gear for your floors, not themselves.',
        ],
      },
      {
        id: 'rating-honesty',
        title: 'Waterproof or Water-Resistant, Honestly',
        content:
          "The two labels sound like a sliding scale and behave more like different products. A water-resistant coat sheds light drizzle and brief dashes, then soaks through and grows heavy in sustained rain. A waterproof coat uses coated fabric and, critically, sealed seams, because water wicks through stitched seams no matter what the fabric claims. That construction costs more and breathes less, so a dog that runs hot may steam inside a fully sealed shell on a mild, wet day. Match the rating to the rain you actually walk in, not the rain you imagine.",
        tableData: {
          headers: ['Rating', 'Made for', 'Watch for'],
          rows: [
            ['Water-resistant', 'Drizzle and short dashes', 'Soaks and sags in steady rain'],
            ['Waterproof, taped seams', 'Long soaks and downpours', 'Traps heat on mild wet days'],
            ['Coated shell with mesh lining', 'All-day wet walks', 'Bulk and slower drying'],
          ],
        },
        tips: [
          'Sealed seams matter as much as the fabric rating on any shell.',
          'Hot-running dogs steam in sealed shells; give them air vents.',
          'Match the rating to your real weather, not your worst-case fantasy.',
        ],
      },
      {
        id: 'shape-that-sheds',
        title: 'Capes and Hoods That Do Not Funnel',
        content:
          "Shape decides whether rain lands on the sidewalk or down your dog's back. A cape-style coat drapes over the spine and fastens at the chest and belly, no sleeves to tangle a galloping gait, and water sheets straight off the sides. Check the details that channel water: a storm flap must cover the zipper so rain does not track inside along the teeth, the collar should stand high enough that runoff misses the neck, and any hood needs a brim that shields the eyes without dropping over the ears. Rear coverage should end clear of the tail so toileting stays functional and clean.",
        tips: [
          'Sleeveless capes keep a full gallop natural on excited dogs.',
          'Storm flaps over zippers stop rain tracking in along the teeth.',
          'High collars route runoff past the neck instead of under it.',
        ],
      },
      {
        id: 'reflective-commute',
        title: 'Reflective Trim for the Dark Commute',
        content:
          "From late autumn to early spring, many walks happen in the dark in both directions, and a wet road doubles the glare and glare's confusion. Reflective piping works by bouncing headlight beams straight back at their source, so a driver sees a moving glow instead of a gray blur at the curb. Placement matters as much as presence: trim only along the spine lights up for drivers behind your dog, so look for reflective panels on the sides, where approaching traffic actually is. Bright base colors help in the gaps between headlights. Compare night visibility on listings the way you compare waterproofing.",
        tips: [
          'Side panels beat spine-only trim; cars approach from the sides.',
          'Bright base color helps between headlight flashes on unlit lanes.',
          'Photograph trim in your own headlights before trusting any listing claim.',
        ],
      },
      {
        id: 'doorway-speed',
        title: 'Fast On and Off in the Doorway',
        content:
          "The best raincoat in the world fails if dressing takes five minutes in a downpour. Hook-and-loop belly straps are the standard closure for exactly this reason: three seconds per side, adjustable over sweaters or bare fur, and forgiving when your numbers fall between sizes. Practice the whole routine indoors before the season starts, on a dry dog, with treats, so the first wet wearing is not also the first wearing. Establish a doorway order: coat on, leash on, out; back in, leash off, towel, coat off. Dogs learn sequences quickly, and a predictable order turns stormy exits into routine instead of chaos.",
        tips: [
          'Rehearse the raincoat routine dry, long before the season\'s first storm.',
          'Same doorway order every time; dogs relax around predictable sequences.',
          'Hook-and-loop straps adjust over sweaters and between sizes gracefully.',
        ],
        callout: {
          type: 'warning',
          title: 'Wet coats come off indoors',
          text: "A raincoat left on after the walk traps damp against your dog's skin and invites chills and skin trouble, especially where straps press. Peel it off at the door, towel the dog, and let the coat dry separately. Check the strap contact points if damp redness appears, and ask your veterinarian about anything that lingers.",
        },
      },
      {
        id: 'drying-storage',
        title: 'Drying and Storing Between Walks',
        content:
          "Rain gear lifespan is decided in the hour after the walk. Hang the coat open on a hanger or door hook in airflow, never balled in a bucket or draped over a radiator, because concentrated heat can crack waterproof coatings and mildew sets into fabric left crumpled and damp. Clear the hair from the strap fasteners weekly, since a strap loaded with fur loses half its grip and the coat starts slipping sideways mid-walk. When a shell starts wetting out, absorbing water instead of shedding it, wash it with a technical cleaner rather than fabric softener, which permanently ruins water repellency.",
        tips: [
          'Hang coats open in airflow; radiators and crumpled buckets destroy coatings.',
          'Pick hair out of fasteners weekly before grip quietly disappears.',
          'Never use fabric softener on a shell; it kills the repellency.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Rating honesty',
        items: [
          { highlight: 'Resistant sheds drizzle', text: 'then soaks and sags when rain settles in.' },
          { highlight: 'Sealed seams decide', text: 'whether any waterproof claim survives an actual downpour.' },
          { highlight: 'Vents for hot runners', text: 'since sealed shells can steam a hot-running dog.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Shed, not funnel',
        items: [
          { highlight: 'Capes keep gaits free', text: 'with water sheeting off the sides as they move.' },
          { highlight: 'Storm flaps protect zippers', text: 'from tracking rain inside along the zipper teeth.' },
          { highlight: 'Collars stand high', text: 'so runoff misses the neck instead of entering it.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Doorway routine',
        items: [
          { highlight: 'Practice while dry', text: 'well before the season\'s first storm ever arrives.' },
          { highlight: 'Three-second strap closures', text: 'keep downpour dressing from becoming a wrestling match.' },
          { highlight: 'Off and hung indoors', text: 'immediately after the walk, so damp never lingers.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Do dogs really need raincoats?',
        answer:
          "Plenty do. Single-coated dogs soak through to the skin in steady rain, small dogs collect puddle splash on their undersides, and many seniors move stiffly in damp chill. A raincoat keeps the walk comfortable and the shake in the hallway manageable. Double-coated breeds handle drizzle well enough that a coat there is mostly about your floors.",
      },
      {
        question: 'What is the difference between waterproof and water-resistant?',
        answer:
          "Water-resistant fabric repels light rain for a while, then soaks through and grows heavy, which suits drizzle and quick dashes. Waterproof means coated fabric with sealed seams that keeps water out in sustained downpours, at the cost of breathability and usually price. If your walks last past the first squall, sealed seams are the part that actually matters.",
      },
      {
        question: 'Will a hood bother my dog?',
        answer:
          "It depends entirely on the cut. A hood with a soft brim that shields the eyes and sits behind the ears bothers almost nobody, and it keeps runoff off the face in sideways rain. Hoods that flop onto the ear flaps or muffle sound get shaken off within a block. Introduce the hood at home first.",
      },
      {
        question: 'How do I dry a raincoat between walks?',
        answer:
          "Hang it fully open where air moves, off the floor and away from direct heat, which can crack the waterproof coating over time. Most coats dry within a few hours this way and are ready for the next outing. Never ball a wet shell in a bin or leave it crumpled, because damp fabric quickly picks up mildew smell.",
      },
      {
        question: 'How do I keep my dog visible on dark winter walks?',
        answer:
          "Combine reflective trim on the coat with side panels, not just a spine stripe, because traffic approaches from the side. Add a bright base color for the gaps between headlights and a clip light or glowing collar tag for unlit lanes. Test everything once in your own headlights; reflective materials vary widely in how strongly they return light.",
      },
    ],
  },

  'apparel-and-accessories/lifejackets': {
    heroTitle: 'Dog Lifejackets That Buy You Time on the Water',
    heroSubheadline:
      "Around pools, lakes, and boats, flotation is the gear you hope never gets tested. Weight-matched buoyancy, a lifting handle, and a bright color are what separate a real lifejacket from a novelty.",
    metaDescription:
      'Dog lifejackets save lives at pools, lakes, and on boats. Learn weight-matched buoyancy, back handles, bright colors, and fit testing before the first swim day.',
    introSummary:
      "The retrieve starts strong, then the paddles slow, the head dips lower on every stroke, and the swim home turns ragged. Dogs tire in water faster than their enthusiasm admits, and exhaustion is only one of the ways a good swimmer becomes a drowning risk. Cold shocks muscles, currents pull sideways, and pool edges defeat even practiced swimmers. A lifejacket buys back time in every one of those moments. Choosing one is less about style than matching a weight range, trusting a handle, and testing the fit before water day.",
    heroImageUrl: '/images/aussie_shepherd.jpg',
    heroImageAlt: 'Australian shepherd outdoors',
    sections: [
      {
        id: 'never-tested-gear',
        title: 'The Gear You Hope Never Gets Tested',
        content:
          "Water hides its dangers in plain sight. A dog that swims beautifully in July still faces cold water that saps strength minutes into a retrieve, lake currents that run along invisible drop-offs, and the sudden shock of falling from a boat or dock. Some bodies are built for the problem: top-heavy, short-muzzled breeds like bulldogs float like bricks, and deep-chested dogs swim nose-down. Others simply run out of steam. A flotation device does not replace supervision, but it keeps a dog's head above water during the seconds when you are swimming, steering, or climbing to reach them.",
        tips: [
          'Bulldogs and other top-heavy breeds sink; they need flotation always.',
          'Cold water tires swimmers long before enthusiasm admits it.',
          'Supervision stays mandatory; a jacket buys seconds, not absolution.',
        ],
      },
      {
        id: 'buoyancy-matching',
        title: 'Matching Buoyancy to Your Dog\'s Weight',
        content:
          "Every credible dog lifejacket is built around a stated weight range, and that range is the single most important line on the listing. Buoyancy foam only lifts the weight it was sized for, so a dog at the top of one range often belongs in the next size up. Check where the flotation sits, too: panels along the belly and sides roll a swimming dog upright, and extra foam under the chin supports the head when back legs stop kicking. A jacket with adjustable straps lets you fine-tune after a winter of treat-driven weight gain, and the same weight-range check applies to anything you are browsing.",
        tips: [
          'Weigh your dog before shopping, not since their last vet visit.',
          'Dogs at a range\'s ceiling usually size up for the lift.',
          'Chin foam and belly panels keep tired swimmers upright.',
        ],
      },
      {
        id: 'back-handle',
        title: 'The Handle on the Back Is the Point',
        content:
          "The grab handle stitched between the shoulder blades is the most safety-critical feature on the whole jacket, because it is how a soaked dog leaves the water. A dog in a pool cannot climb a vertical edge; you lift, and the handle carries the whole dripping weight. Test it in the shop by pulling hard with your hand flat behind it: the handle should be stitched through the flotation layers, not merely sewn to the shell fabric, and it should stay rigid rather than folding into a thin strap. Two handles, one forward and one rear, make boat lifts and steering far easier.",
        tips: [
          'Pull hard on the handle in the aisle before you buy.',
          'Handles stitched through flotation layers carry a soaked dog safely.',
          'Two handles make boat lifts and mid-swim steering much easier.',
        ],
      },
      {
        id: 'bright-at-distance',
        title: 'Bright Colors That Read at Distance',
        content:
          "A dog's head in chop is astonishingly small from a boat, and from a distance waves all read the same gray. That is why working flotation gear leans hard on color: orange and yellow read against most water and most skies, and reflective panels add a flash for low-light evenings at the lake. Match the color to the setting, since a dark navy jacket that photographs beautifully nearly vanishes against dark water. Check the straps for contrast accents, too. When you compare jackets, look at the whole silhouette from across a room and ask whether you could point to it fast.",
        tips: [
          'Orange and yellow read best against most water and sky conditions.',
          'Reflective panels matter for evening swims and gray-weather boating.',
          'View the whole jacket from across a room before deciding.',
        ],
      },
      {
        id: 'dry-land-fitting',
        title: 'Fit Testing on Dry Land First',
        content:
          "Fit problems announce themselves in the water as emergencies, so find them at home. Fasten every strap and check the usual suspects: two fingers should slide under each strap, the belly closure must clear male anatomy generously, and nothing should press the base of the tail. Then ask for movement. The dog should sit, lie down, and run a lap without the jacket shifting toward the ears or rubbing the armpits raw. Finally, wade in: a first session in shallow water shows how the jacket floats them, and a riding jacket that pushes their rear up and nose down needs its straps rebalanced before any real swim.",
        tips: [
          'Dry-land strap checks first; water reveals fit flaws as emergencies.',
          'Belly closures clear male anatomy generously or walks get miserable.',
          'A first shallow wade shows flotation posture before the real swim.',
        ],
      },
      {
        id: 'strong-swimmers',
        title: 'Why Strong Swimmers Still Wear One',
        content:
          "The dogs who drown are often the ones everyone trusted in the water. Fetch obsession outruns sense, and a dog mid-game ignores gathering fatigue; lake and river currents run along shores that look calm from the dock; a surprise fall from a boat or a pool cover happens without any swimming at all. Flotation keeps the head up through all of it, and the handle gives you a grip the moment they drift past reach. Seniors and heavy-coated breeds deserve special suspicion, since soaked coats drag and older muscles quit without warning.",
        tableData: {
          headers: ['Water setting', 'What the jacket adds', 'Prioritize'],
          rows: [
            ['Backyard pool', 'Flotation after surprise falls', 'Sturdy handle, bright color'],
            ['Lake fetch sessions', 'Head-up support as they tire', 'Comfortable, full-range straps'],
            ['Boat or paddleboard', 'Floats a dog you cannot reach', 'High buoyancy, reflective panels'],
            ['River or current', 'Keeps the nose above moving water', 'Snug straps, dual handles'],
          ],
        },
        callout: {
          type: 'warning',
          title: 'Supervision stays mandatory',
          text: "A lifejacket keeps a dog floating; it does not watch them. Never leave any dog unattended near water, including strong swimmers wearing gear, and treat a soaked, coughing, or lethargic dog after swimming as a reason to call your veterinarian promptly.",
        },
        tips: [
          'Fetch fanatics ignore fatigue; flotation backs up their judgment.',
          'Seniors and soaked heavy coats need jackets most of all.',
          'Fit the handle grip into your rescue plan before water day.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'shield',
        title: 'Match the weight',
        items: [
          { highlight: 'Weigh before shopping', text: 'since stated ranges are the one line that matters.' },
          { highlight: 'Top of range sizes up', text: 'because foam only lifts what it was built for.' },
          { highlight: 'Chin foam supports heads', text: 'when tired legs stop kicking on the way home.' },
        ],
      },
      {
        icon: 'check',
        title: 'Trust the handle',
        items: [
          { highlight: 'Pull-test in the aisle', text: 'stitched through the flotation, not just the shell.' },
          { highlight: 'Pool edges need lifting', text: 'and a solid handle lifts the whole soaked weight.' },
          { highlight: 'Two handles help most', text: 'for boat lifts and mid-water steering alike.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Test before splash',
        items: [
          { highlight: 'Straps on dry land', text: 'where fit problems stay inconveniences, not emergencies.' },
          { highlight: 'Shallow wade first', text: 'to see flotation posture before the real swim.' },
          { highlight: 'Supervise every minute', text: 'in water, jacket or not; flotation is not a babysitter.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Do dogs need lifejackets if they swim well?',
        answer:
          "Yes, in most open-water settings. Strong swimming does not cover exhaustion mid-fetch, cold water, currents, or a sudden fall from a boat, and each of those sinks confident swimmers every year. Around a supervised backyard pool with easy exits, a jacket is optional for able-bodied adults. Anywhere else, the handle alone justifies wearing one.",
      },
      {
        question: 'How do I size a dog lifejacket?',
        answer:
          "Weigh your dog on a bathroom scale, subtracting your own weight, then choose the size whose stated range contains that number with room to spare. Dogs at the top of a range usually size up, because the foam lifts only what it was designed for. Adjust every strap for a snug fit.",
      },
      {
        question: 'Can puppies wear lifejackets?',
        answer:
          "Yes, and early exposure is how you raise a dog who treats the jacket as normal swim gear. Choose a size for their current weight, not the adult they will become, since buoyancy depends on the match, and expect to replace it as they grow. Keep first sessions shallow, brief, and happy so both water and gear stay positive.",
      },
      {
        question: 'How can I get my dog comfortable in a lifejacket?',
        answer:
          "Treat it like any new garment: brief indoor wearings paired with food, then fastenings, then short sessions in shallow water before the first real swim. Let them walk, sit, and run while wearing it so the straps stop feeling strange. Most dogs accept a flotation jacket quickly because the foam is light and the fit is open through the shoulders.",
      },
      {
        question: 'What color lifejacket is easiest to see in water?',
        answer:
          "Orange and yellow dominate for good reason: both read against the widest range of water and sky conditions, which is why rescue gear leans on them. Add reflective panels for evening and gray weather, and avoid dark colors that vanish against dark water. Test visibility yourself from a distance before trusting any choice.",
      },
    ],
  },

  'apparel-and-accessories/hats': {
    heroTitle: 'Dog Hats That Actually Work for Sun Protection',
    heroSubheadline:
      "A hat is the hardest sell in dog apparel and occasionally the most useful one. Honest sizing, a chin strap that releases, and short training sessions decide whether it stays on.",
    metaDescription:
      'Dog hats genuinely work when they shade pale noses and cut glare: which dogs tolerate headgear, chin strap safety, sun exposure, and function versus costume.',
    introSummary:
      "Let us begin with the honest part: many dogs never accept a hat, and no training protocol changes their mind. Ears are a dog's radar, and headgear sits directly on it, so reluctance is sensible rather than stubborn. Still, there are dogs and situations where a hat genuinely earns its spot: pale noses under strong sun, eyes that squint against snow glare, long hikes at altitude. For those dogs, a patient introduction and a safe chin strap turn a costume aisle novelty into real gear.",
    heroImageUrl: '/images/aussie_shepherd.jpg',
    heroImageAlt: 'Australian shepherd outdoors in sunshine',
    sections: [
      {
        id: 'sensitive-real-estate',
        title: 'Headgear Sits on Sensitive Real Estate',
        content:
          "A dog's head carries the equipment they trust most: mobile ears that triangulate sound, whiskers that read air movement, and eyes that watch for the thrown ball. Anything perched there interferes with all three, which is why the honest success rate for hats is modest. Upright-eared breeds like German Shepherds have almost no real estate between the ears for a crown, while folded-eared breeds like Labradors wear soft caps more easily. Some individual dogs simply decide a hat is beneath their dignity, and that verdict deserves respect. Start any hat journey expecting a coin flip, not a transformation.",
        tips: [
          'Folded-eared dogs accept soft caps far more often than upright-eared ones.',
          'Respect a flat refusal; forcing headgear burns trust broadly.',
          'Short sessions and food keep the first exposures from souring.',
        ],
      },
      {
        id: 'tolerant-dogs',
        title: 'Which Dogs Tolerate a Hat at All',
        content:
          "The dogs who end up in sun hats share a few traits. They already wear other gear cheerfully, so a sweater has taught them that things on the body mean nothing dire. They are food-motivated enough that a hat predicts treats. And they have steady temperaments rather than startle-prone nerves, because one blown-off hat can end the whole enterprise. Dogs who squint hard in bright sun sometimes self-select: the relief of shade on their eyes is worth the oddity on their head. Lightly coated, pale-skinned dogs benefit most from actual coverage, which gives your training effort a real job to reward.",
        tips: [
          'Dogs already wearing sweaters accept hats faster than garment newbies.',
          'Let a squinting dog discover the relief shade provides on eyes.',
          'One bad startle can end hat training; pace the exposures gently.',
        ],
      },
      {
        id: 'hat-training',
        title: 'Teaching a Hat in Small Steps',
        content:
          "Put the hat on the floor with a treat beside it, and let curiosity do the first work. Progress to balancing it briefly on the bridge of the nose, unfastened, with a reward the instant it touches. Then fasten the chin strap for a count of five, remove it before any head-shaking begins, and build duration across days the same way. Keep each session shorter than your dog's patience, and end while things are calm rather than after a struggle. If your dog shakes their head repeatedly or drops their ears back, you have moved too fast, so return a step and stay there a while.",
        tips: [
          'Balance the unfastened hat on the nose before any strap closes.',
          'Remove it before head-shaking starts; end every session calm.',
          'Head-shaking and dropped ears mean you advanced a step too soon.',
        ],
      },
      {
        id: 'chin-strap-safety',
        title: 'Chin Straps and Release Safety',
        content:
          "The strap under the jaw is where hat safety lives or dies. It should fasten with a quick-release buckle or a breakaway clasp, never a fixed loop, because a snagged strap on a crate door, fence gap, or branch can hang a struggling dog. Snugness matters in both directions: tight enough that the hat stays put through a head shake, loose enough to slide two fingers under comfortably. Check that nothing covers the ear canals, since muffled hearing reads as vulnerability to most dogs. Inspect the strap's stitching monthly, because sun and chewing weaken it faster than the hat itself ages.",
        tips: [
          'Insist on quick-release or breakaway clasps for every chin strap.',
          'Two fingers should slide under the fastened strap without forcing.',
          'Snag-test the release yourself before the hat\'s first real wear.',
        ],
        callout: {
          type: 'warning',
          title: 'Quick-release only',
          text: "Any chin strap that cannot open under load is a hanging hazard around crates, fences, and bushes. Test the release yourself before the first wear, with the strap snagged on your hand, and re-test it monthly. A hat that comes off easily is a joke; a hat that cannot come off is a hazard.",
        },
      },
      {
        id: 'uv-exposure',
        title: 'Light Noses and Real UV Exposure',
        content:
          "Sun damage concentrates exactly where hats sit. The nose bridge and the ear tips carry thin fur and often pale pigment, and both accumulate ultraviolet exposure across years of sunny walks. A brim shades the nose bridge directly and cuts the sideways glare that makes some dogs squint on bright days, which is why hats show up most often on pale-nosed dogs at altitude, on beaches, and on snow, where reflections throw glare upward. A hat is coverage, not sunscreen: it does nothing for the nose tip below the brim's shadow line or for the belly. For light-skinned dogs in serious sun, combine the brim with pet-safe sunscreen on exposed skin.",
        tips: [
          'Brim coverage targets the nose bridge, the sunniest thin-furred spot.',
          'Snow and altitude multiply glare; squinting dogs notice the relief.',
          'Sunscreen the nose tip and ears; a brim only shades its shadow line.',
        ],
        callout: {
          type: 'vet-note',
          title: 'Watch pigment changes',
          text: "Nose leather and ear tips that develop new roughness, scabbing, or changed color deserve your veterinarian's attention sooner rather than later. Long-term sun exposure contributes to those changes on lightly pigmented dogs, and a hands-on exam is the only way to tell harmless aging from something that needs treatment.",
        },
      },
      {
        id: 'function-versus-costume',
        title: 'Knowing Function From Costume',
        content:
          "A hat earns its place the day it solves a problem: shade for a squinting pale-nosed hiker, glare relief on a snow trip, visibility for a small dog in tall brush. A costume hat earns photographs, which is a legitimate pleasure and a different thing entirely. The test is duration and honesty. A working hat stays on through a long walk while your dog behaves normally; a costume hat comes off after the picture, before the head-shaking starts. Both are fine, as long as you know which one you bought. The same candid sorting applies across the apparel shelf: gear that works quietly, and outfits that pose politely, and a good pet wardrobe keeps the two labeled honestly.",
        tips: [
          'Working hats stay on through real walks; costume hats come off after photos.',
          'Small dogs in brush benefit from bright, visible crowns on hikes.',
          'Know which category you bought; both are fine when labeled honestly.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'heart',
        title: 'Readiness first',
        items: [
          { highlight: 'Dogs who wear gear', text: 'accept hats faster than garment newbies ever do.' },
          { highlight: 'Squinting dogs self-select', text: 'because shade on the eyes is worth the oddity.' },
          { highlight: 'Respect flat refusal', text: 'since forcing headgear burns trust far beyond hats.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Strap safety',
        items: [
          { highlight: 'Quick-release closures only', text: 'because a snagged fixed strap can hang a dog.' },
          { highlight: 'Two fingers under', text: 'the fastened strap, sliding easily along the jaw.' },
          { highlight: 'Ears stay uncovered', text: 'since muffled hearing makes most dogs feel unsafe.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Function or costume',
        items: [
          { highlight: 'Working hats outlast walks', text: 'on dogs that behave normally with them on.' },
          { highlight: 'Costume hats end early', text: 'right after the photo, before the shaking starts.' },
          { highlight: 'Pale noses gain most', text: 'from brim shade on beaches, snow, and high altitude.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Can dogs wear hats safely?',
        answer:
          "Safely, yes, with two conditions: a chin strap that releases under load, and a dog who accepted the hat through gradual training rather than tolerance of force. The risks are strangulation from a snagged fixed strap and stress from covering a dog's radar. Skip hats for dogs that panic, and supervise any hatted dog around crates and fences.",
      },
      {
        question: 'How should I teach my dog to wear a hat?',
        answer:
          "Move through steps the size of crumbs: hat on the floor with treats, hat balanced unfastened on the nose, strap closed for seconds, then brief wears. Reward calm, remove the hat before any head-shaking, and keep sessions shorter than your dog's patience. Most dogs decide within a few weeks whether hats are part of their life, and some answer no.",
      },
      {
        question: 'Do dogs need sun hats?',
        answer:
          "A few genuinely benefit. Pale-skinned, thin-coated dogs accumulate sun damage where fur is sparse, on the nose bridge and the ear edges, and dogs that squint hard against beach, snow, or altitude glare get real relief from a brim. For most dogs, though, shade breaks and sunscreen on bare spots cover the same need with none of the training overhead.",
      },
      {
        question: 'What hat styles suit upright-eared dogs?',
        answer:
          "Visors and bucket-style crowns that sit below the ear bases, leaving the ears free, since anything pressing upright ears flat is uncomfortable and short-lived. Soft crown caps with an ear gap work reasonably well. Avoid helmet shapes and anything with a top that needs ear clearance, which is the design detail that ends most hat careers early.",
      },
      {
        question: "How tight should a dog hat's chin strap be?",
        answer:
          "Tight enough to survive one honest head shake, loose enough that two fingers slide under the jaw without prying. The non-negotiable part is the closure: quick-release or breakaway, tested by snagging it on your own hand before your dog wears it. A strap that cannot open under load has no place on any dog's head.",
      },
    ],
  },

  'apparel-and-accessories/sunglasses': {
    heroTitle: 'Dog Goggles and Sunglasses for Real Eye Protection',
    heroSubheadline:
      "Wind, dust, sand, and glare are genuine hazards for dogs that ride, hike, and beach-comb. The right goggles, trained patiently and fitted without pressure, protect eyes that cannot blink fast enough.",
    metaDescription:
      'Dog goggles and sunglasses give real eye protection from wind and dust. Learn gradual training, strap fit without pressure, and irritation signs that mean stop.',
    introSummary:
      "The first sign usually arrives at speed: a dog leaning into the wind at a car window, eyes tearing and half-shut, blinking hard against dust the breeze carries like sandpaper. Dogs meet flying grit on bike rides, beach afternoons, dusty trails, and snowy glare, and their eyes take the hits silently. Protective goggles, the kind built for working dogs rather than holiday photos, genuinely block that barrage. The challenge is not the lens; it is convincing a dog that something on their face is tolerable.",
    heroImageUrl: '/images/aussie_shepherd.jpg',
    heroImageAlt: 'Australian shepherd outdoors on a trail',
    sections: [
      {
        id: 'where-eyes-take-hits',
        title: 'Where Dog Eyes Actually Take Hits',
        content:
          "The classic exposure is the open car window, where grit arrives faster than a blink can clear it, and even a dog that loves the airflow pays in tearing, red eyes. Bike baskets and trailers add road dust at close range. Beaches blow dry sand that scours at eye level exactly where dogs sniff and dig. Mountain trails throw up dust and hold snow glare that throws light back up into tired eyes, and branch tips at muzzle height surprise a snuffling dog on a narrow path. Brachycephalic breeds, with eyes that sit forward of the brow ridge, catch more of every one of these.",
        tips: [
          'Crack the window rather than fully opening it on dusty roads.',
          'Prominent-eyed breeds like Pugs collect debris the rest of us deflect.',
          'Snow glare bothers dogs too; tinted lenses earn their keep at altitude.',
        ],
      },
      {
        id: 'lenses-and-frames',
        title: 'Lenses and Frames Worth Taking Seriously',
        content:
          "Protective dog eyewear is not human fashion scaled down. The lenses should be shatter-resistant polycarbonate, because the whole point is impact from grit and gravel, and they should filter ultraviolet light for glare settings like snow and open water. Frames come in two broad fits: a wraparound gasket style that seals out dust for wind-heavy contexts, and a lighter sunglasses style with open edges for glare alone. The gasket matters more than it looks, since foam that seats gently against the orbital bone blocks drafts without touching the eyeball. Check the strap routing before anything else, because a frame that rides wrong is a frame that never gets worn.",
        tips: [
          'Insist on shatter-resistant lenses; ordinary plastic invites worse injuries.',
          'Gasket styles seal out dust; open-edge styles suit pure glare.',
          'Foam should seat on the orbital bone, never press the eyeball itself.',
        ],
      },
      {
        id: 'goggle-training',
        title: 'Training Goggles One Minute at a Time',
        content:
          "Expect a training arc measured in weeks, not minutes. Begin with the straps alone, no lenses attached if the design allows, worn for seconds at a time with food. Attach the lenses next and let your dog blink at the world from a seated position before any walking happens. Then add movement indoors, then the yard, then a short stationary car ride, and only then the window-down scenario that started all of this. Keep sessions short and stop before the pawing starts, because every successful removal teaches patience and every forced minute teaches resistance. Some dogs decline the whole project, and honest lenses accept that answer.",
        tips: [
          'Train straps first, lenses second, movement a distant third.',
          'Stop before pawing begins; end each session on a calm success.',
          'Some dogs opt out; shelter them from wind instead of forcing gear.',
        ],
      },
      {
        id: 'strap-fit',
        title: 'Straps That Stay Without Pressing',
        content:
          "Fit decides whether goggles survive ten seconds or ten miles. Two-strap designs hold best, one behind the ears and one over the crown, distributing the tension so nothing digs in. Adjust until the frame sits stable through a head shake, then check the contact points: the foam gasket should touch the orbital bone lightly, and the straps should not fold the ears forward or sit inside them. Light-skinned dogs show strap rub as thin pink lines after a long wear, so inspect under the ears and on the bridge after early sessions. If your dog's ears flick constantly, the strap is sitting in the ear base and needs rerouting.",
        tips: [
          'Two straps hold better than one; crown and ear share the tension.',
          'Pink lines under the ears after wearing mean straps need loosening.',
          'Constant ear flicking marks a strap routed through the ear base.',
        ],
      },
      {
        id: 'irritation-signs',
        title: 'Recognizing Eye Irritation Early',
        content:
          "Goggles concentrate attention on eyes, so use that attention. After rides or dusty hikes, look for squinting that outlasts the outing, pawing at the face, redness in the whites, or discharge that returns within a day. Grit under a lid can scratch the cornea, and scratches are urgent rather than watchful, because eyes heal fast or go bad fast with little middle ground. Remove the goggles, keep your dog from rubbing, and resist rinsing with anything not prescribed. Any squinting dog that holds an eye shut, or a cloudiness you can see, belongs with your veterinarian the same day.",
        tips: [
          'Squinting that outlasts the outing is a signal, not a mood.',
          'Do not rinse an injured eye with anything your veterinarian has not approved.',
          'Cloudiness or a held-shut eye means same-day attention, no exceptions.',
        ],
        callout: {
          type: 'vet-note',
          title: 'Squinting is a stop signal',
          text: "An eye held shut, visible cloudiness, or squinting that persists after the goggles come off warrants a same-day call to your veterinarian. Corneal scratches from dust and debris are painful and can worsen quickly, so let a professional stain and examine rather than waiting to see how it settles.",
        },
      },
      {
        id: 'when-overkill',
        title: 'Knowing When Goggles Are Overkill',
        content:
          "Honesty cuts both ways. A dog that walks on leash through a quiet park needs no eyewear, and a brachycephalic companion who mostly naps indoors needs even less. The contexts that justify goggles share speed, wind, or airborne grit: highway windows, bike trailers, beach days with blowing sand, dusty trail running, and bright snow or open-water glare. Match the setting to the gear and leave the goggles home otherwise, because every unnecessary wearing spends training goodwill. The comparison habit serves you well across the whole accessories shelf here: use the lens only for the job it actually does.",
        tips: [
          'Save goggles for speed, wind, and grit; quiet walks need none.',
          'Unnecessary wearings spend training goodwill you will want later.',
          'Bright snow and open water justify tinted lenses more than sidewalks do.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'shield',
        title: 'Real protection',
        items: [
          { highlight: 'Speed and grit', text: 'are the honest cases: windows, bikes, wind, blowing sand.' },
          { highlight: 'Shatter-resistant lenses', text: 'because impact protection is the point of the lens.' },
          { highlight: 'UV filtering helps', text: 'against snow and open-water glare that tires eyes.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Train patiently',
        items: [
          { highlight: 'Straps before lenses', text: 'then stillness, then movement, then the real ride.' },
          { highlight: 'Stop before pawing', text: 'because forced minutes teach resistance, not tolerance.' },
          { highlight: 'Some dogs decline', text: 'honestly, and sheltering them from wind replaces gear.' },
        ],
      },
      {
        icon: 'check',
        title: 'Watch the eyes',
        items: [
          { highlight: 'Squinting outlasts walks', text: 'means irritation, not stubbornness or a passing mood.' },
          { highlight: 'Held-shut eyes count', text: 'as a same-day reason to call your veterinarian.' },
          { highlight: 'Wipe lenses pre-wear', text: 'so trapped grit never reaches the cornea at all.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Do dogs really need sunglasses or goggles?',
        answer:
          "A minority do, for specific contexts: dogs that ride with windows down, run beside bikes, dig on windy beaches, or squint at snow and water glare. In those settings, goggles block real grit and cut glare that dogs cannot otherwise escape. For ordinary leashed walks, they are decoration, and honest gear should admit it.",
      },
      {
        question: 'How do I get my dog to wear goggles?',
        answer:
          "Train in small steps over a few weeks: straps alone with treats, then lenses attached while sitting still, then walking indoors, then short stationary car time. Always stop before pawing starts, and end every session on success. Some dogs accept goggles fully, some tolerate short wears, and some decline, and the honest answer is respecting which one you have.",
      },
      {
        question: 'Are dog goggles safe for car rides?',
        answer:
          "Yes, and the open window is exactly the job they were designed for, holding dust and grit away from eyes that blink too slowly at highway speed. Fit them with the two-strap adjustment stable through a head shake, and build up to moving rides through stationary practice first, since a loose pair only adds stress.",
      },
      {
        question: 'How tight should dog goggles be?',
        answer:
          "Stable through a head shake, without any pressure points: the foam gasket rests lightly on the orbital bone, straps clear the ears rather than folding through them, and nothing leaves a pink line after a long wear. Dogs communicate poor fit by pawing and ear flicking, so treat both as fit feedback instead of disobedience.",
      },
      {
        question: 'Can goggles hurt my dog\'s eyes?',
        answer:
          "Not when fitted correctly, but two failure modes exist: a gasket pressed hard against the eye itself, and debris trapped inside a dusty lens at the moment of dressing. Check that foam seats on bone, wipe lenses before every wear, and watch the first sessions closely. Persistent squinting after removal means stop and call your veterinarian.",
      },
    ],
  },

  'apparel-and-accessories/dresses': {
    heroTitle: 'Dog Dresses That Put Movement Before the Frills',
    heroSubheadline:
      "A dress on a dog should be a small joy, not a small struggle. The right cut lets her run, sit, and toilet like usual; the wrong one proves pretty and punishing share a fabric.",
    metaDescription:
      'Dog dresses can be comfortable as well as cute. Learn movement-first fit, breathable fabrics, quick on-off closures, and the comfort signals that end the outfit.',
    introSummary:
      "The birthday photo happens, the dress looks perfect, and then your dog takes three steps and the skirt wraps around her back legs like a lasso. Decorative apparel has a bad reputation earned one ill-fitting garment at a time. Done right, a dress is a light, breathable, fast-on piece that a relaxed dog wears through a party without changing how she walks, sits, or lifts a leg to toilet. The difference is entirely mechanical: cut, fabric, and closure. Get those three honest and the cuteness takes care of itself.",
    sections: [
      {
        id: 'movement-test',
        title: 'Pretty Means Nothing Without Movement',
        content:
          "The only meaningful test of a dress is what your dog does while wearing it. A proper cut leaves the shoulders completely free so the front legs reach their full stride, drapes over the ribs without cinching, and hangs short enough that the hind legs clear it on every step. Watch her trot away from you: the skirt should swing, not wrap. Watch her sit: the fabric should pool naturally instead of dragging the bodice sideways. And watch the tail, which must lift freely, because a skirt that catches a raised tail also catches toileting, and that ends the outfit and the carpet in one accident.",
        tips: [
          'Trot test away from you; a swinging skirt beats a wrapping one.',
          'Shoulders stay bare so front legs reach their full natural stride.',
          'A skirt that snags a lifted tail will snag toileting within the hour.',
        ],
      },
      {
        id: 'breathable-fabrics',
        title: 'Fabrics That Breathe Through a Party',
        content:
          "Dogs cool themselves through skin and tongue, so decorative layers trap heat faster than they trap compliments. Cotton and cotton-blend weaves breathe best, which is why they dominate dresses meant for longer wear. Tulle and mesh ruffles photograph beautifully and hold heat hardly at all on their own, but stacked over a lined bodice they turn into a small greenhouse. Check the underside, where fabric meets fur directly: smooth linings slide and ventilate, while gathers and rough trims against skin invite rubbing within an hour of wear. Lightweight wins every time, and any listing you compare should say so in its fabric description.",
        tips: [
          'Cotton and cotton blends breathe; stacked ruffles hoard heat.',
          'Smooth linings protect skin; gathers against fur rub quickly.',
          'Weigh the whole dress in your hand; light garments win wear time.',
        ],
      },
      {
        id: 'occasions',
        title: 'Occasions Where Dresses Earn Their Keep',
        content:
          "A dress is occasion wear, and choosing the occasions honestly keeps it a pleasure. Birthday mornings, family photographs, holiday gatherings where a dressed dog sits for portraits, and quiet visits to a dog-friendly café all justify the effort. The common thread is supervision and short duration: you are present, the dog is mostly stationary or strolling, and the garment comes off when the moment passes. Dressing a dog for a long hike, a dog-park romp, or a hot afternoon turns the same garment into a hazard, snagging on brush, tangling with playmates, and cooking a coat that was fine bare.",
        tips: [
          'Reserve dresses for supervised, mostly-strolling occasions of an hour or two.',
          'Hikes, park romps, and heat are dress-free zones, however cute the photos.',
          'Photograph early in the wearing, while novelty still reads as calm.',
        ],
      },
      {
        id: 'fast-on-off',
        title: 'On and Off in Ten Seconds',
        content:
          "Speed of dressing is the difference between a dress that gets used and one that gets donated. Look for wide hook-and-loop closures at the neck and belly, or a step-in design where she walks in, you fasten, done. Buttons and tiny snaps look charming and fail under a wiggling dog, and zippers ask for precise alignment nobody has at party time. The same speed requirement applies in reverse: a dress that comes off fast forgives toileting mistakes and sudden overheating, both of which arrive without warning. Rehearse the dressing order twice before the event so the real thing is boring.",
        tips: [
          'Choose wide closures and step-in designs; skip tiny snaps and buttons.',
          'Fast removal forgives accidents and overheating, which arrive unannounced.',
          'Rehearse the dressing routine twice before any actual event.',
        ],
      },
      {
        id: 'comfort-signals',
        title: 'Comfort Signals That End the Outfit',
        content:
          "Dogs narrate their comfort constantly, and a dressed dog deserves extra listening. Contented wear looks like a normal gait, a loose face, easy lying down, and indifference to the fabric. The end-the-outfit list starts with freezing mid-step, a tail tucked under the skirt, ears pinned flat, lip licking in the absence of food, and any attempt to back out of the bodice. Pawing at the collar line counts double. None of these mean your dog hates dresses forever; they mean this garment, today, has run its course. Take it off without ceremony and try again another day, or shop a roomier cut next time.",
        tips: [
          'Freezing, tucked tails, and lip licking all say the wearing is over.',
          'Pawing at the collar line is the loudest comfortable-dress objection.',
          'Ending wear calmly keeps the next dress an open question.',
        ],
        callout: {
          type: 'warning',
          title: 'Never unsupervised in decorative apparel',
          text: "Snags, chewing, and caught hems are how party clothes become emergencies. A dress belongs on a dog you are watching, and it comes off the moment your attention moves elsewhere, including for photos you are setting up in another room.",
        },
      },
      {
        id: 'healthy-rotation',
        title: 'Sharing the Joy Without Overdressing',
        content:
          "Some dogs visibly enjoy the attention a dress brings, trotting taller when guests gasp, and there is nothing wrong with granting that pleasure. The habit stays healthy when frequency stays low and the fit stays honest: occasional parties, not daily defaults, and a garment cut for movement rather than silhouette. Rotate through two or three pieces so elastic and straps rest between wears, and launder after every event, since decorative trim collects the same drool and dust as anything else in the wardrobe. If your dog brightens at the sight of her party dress, dress her, photograph her, and take it off while she is still enjoying herself.",
        tips: [
          'Keep dress days occasional so novelty never becomes nagging.',
          'Rotate a few pieces so elastic and straps rest between events.',
          'Remove the dress at peak enjoyment; quit ahead, like a good host.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Movement first',
        items: [
          { highlight: 'Trot test always', text: 'a swinging skirt proves the cut, a wrapping one fails it.' },
          { highlight: 'Shoulders stay free', text: 'so front legs reach full stride at any speed.' },
          { highlight: 'Tails must lift', text: 'freely, or toileting pays the price in one accident.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Light and quick',
        items: [
          { highlight: 'Cotton weaves breathe', text: 'while stacked ruffles hoard heat faster than they photograph.' },
          { highlight: 'Wide closures win', text: 'over tiny snaps that fail under one wiggle.' },
          { highlight: 'Ten-second on and off', text: 'forgives toileting slips and sudden overheating alike.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Read her signals',
        items: [
          { highlight: 'Freezing means finished', text: 'even mid-photo, mid-party, or mid-compliment; take it off.' },
          { highlight: 'Supervision is required', text: 'snagged hems and chewing turn parties into emergencies.' },
          { highlight: 'Quit at peak joy', text: 'remove the dress while she is still enjoying herself.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Are dog dresses comfortable?',
        answer:
          "The well-cut ones are, genuinely. Comfort comes from free shoulders, a bodice that drapes rather than cinches, lightweight breathable fabric, and a hem that clears the hind legs. Dogs in such dresses walk, sit, and toilet normally and mostly forget the fabric. The uncomfortable versions share one flaw: a cut chosen for silhouette over stride.",
      },
      {
        question: 'How long can my dog wear a dress?',
        answer:
          "Treat dresses like occasion wear: an hour or two of supervised time is a sensible ceiling, and less in warm rooms or heavy layered designs. The moment your dog freezes, tucks her tail, paws at the neckline, or pants, the outfit has run its course. Never leave a dressed dog unattended, since hems and trim snag and invite chewing.",
      },
      {
        question: 'What size dress does my dog need?',
        answer:
          "Use the same numbers the rest of the wardrobe runs on: neck where a collar sits, chest girth at the deepest ribcage point, and back length to the tail base. For dresses, give chest girth the deciding vote and let the skirt fall where it falls, since a bound chest ruins movement instantly.",
      },
      {
        question: 'Do dogs like wearing dresses?',
        answer:
          "Some clearly do, usually the dogs who already wear gear happily and enjoy the attention dressing brings. Others tolerate it briefly for treats, and a third group finds the entire project insulting. The honest approach is letting your dog's behavior vote: normal gait and relaxed faces say yes, freezing and pawing say no, and both answers deserve respect.",
      },
      {
        question: 'Can male dogs wear dresses?',
        answer:
          "Plenty do, for the same occasions, though the cut matters more. Any bodice must clear the belly generously so nothing interferes with toileting, which is where most male-fit friction appears. Party wear is about joy rather than rules, so if your male dog struts in a tutu and moves freely in it, the question has answered itself.",
      },
    ],
  },

  'apparel-and-accessories/hair-accessories': {
    heroTitle: 'Dog Hair Accessories: Bows and Clips That Stay Put',
    heroSubheadline:
      "For Shih Tzu, Maltese, Yorkie, and Afghan coats, the topknot began as a tool: hair out of the eyes so the dog can see. Choosing bands and bows well keeps that function honest.",
    metaDescription:
      'Dog hair accessories: bows, clips, and bands that keep hair out of eyes for Shih Tzu, Maltese, and Yorkie coats, plus mat prevention and a nightly routine.',
    introSummary:
      "The topknot predates the boutique. Long-coated breeds were gathered and tied centuries before anyone printed a bow on a ribbon, because hair in the eyes of a working-length face means tears, tangles, and a dog that cannot quite see the world. Today the aisle of bows, clips, and bands mixes that old function with fashion, and quality separates them cleanly. For Shih Tzu, Maltese, Yorkshire Terriers, and Afghans, the right accessory keeps vision clear, holds without tearing coat, and comes out at night without leaving a mat behind.",
    sections: [
      {
        id: 'vision-care',
        title: 'The Topknot Started as Vision Care',
        content:
          "Everything decorative about hair accessories sits on top of a working foundation. Long coats grow forward into the eyes, where friction and tears turn face hair into a stiff, crusted curtain that irritates the cornea and blocks sight. Gathering that hair into a topknot clears the visual field, keeps eye discharge from welding the hair together, and lets you inspect the eyes daily, which owners of these breeds know matters. The accessories are the tool: a band holds the gather, a bow clips to it, and the dog sees. Any piece too heavy, too tight, or too grabby stops being care and starts being the problem.",
        tips: [
          'A topknot that clears the eyes counts as daily health care, not vanity.',
          'Tie the hair that would enter the eyes, and only that hair.',
          'Heavy, tight, or grabby pieces fail the function test on sight.',
        ],
      },
      {
        id: 'band-materials',
        title: 'Bands That Hold Without Tearing Coat',
        content:
          "The band decides whether a topknot is maintenance or damage. Fabric-covered elastics and ribbon-wrapped bands grip hair gently and release without dragging a trail of coat out with them. Bare rubber bands, the office kind, are the villain of every groomer's stories: they wrap tight, fuse to hair within days, and pull out a little clump at every removal. Silicone spiral bands hold well and release cleanly, though the spiral can catch a single long hair and snap it. Whatever you use, wrap no more loops than the hold requires, because every extra loop is extra pressure on the hair shaft.",
        tips: [
          'Fabric-covered and ribbon-wrapped bands protect coat; bare rubber never does.',
          'Wrap only the loops the hold needs; extras just pressure hair shafts.',
          'Replace stretched bands promptly before they lose grip entirely.',
        ],
      },
      {
        id: 'placement',
        title: 'Placement That Actually Protects the Eyes',
        content:
          "Where the gather sits decides whether the accessory works. Collect the hair that would fall into the eyes, sweeping upward and slightly forward from the outer eye corners, and tie it just above the brow line so the topknot lifts rather than drags. Two smaller topknots, one over each eye, divide the weight and hold better than one heavy gather on fine-coated faces. Bows attach at the band, where structure exists, never pinned to loose hair that slips by afternoon. A topknot that leaves the eyes clear at noon but droops by dinner was tied too low or too loose, and both are fixable in one session.",
        tips: [
          'Sweep from the outer eye corners upward; the gather lifts, never drags.',
          'Two small topknots beat one heavy gather on fine, silky faces.',
          'Clip bows to the band itself, where structure actually holds them.',
        ],
      },
      {
        id: 'mat-prevention',
        title: 'Preventing Mats at the Attachment Point',
        content:
          "The quiet failure of hair accessories is the mat that forms where the band sat. Hair left gathered for days rotates and knots against itself at the root, and by the time you notice, the mat sits against the scalp where brushing hurts. The prevention is rhythm: take topknots down every night, brush the section from the skin outward, and retie in a slightly different spot so no single point takes constant wear. Felt-lined bows and bands grip enough to hold with less tension, which lowers the odds further. Anything left in for days, especially under a collar line, earns the comb-out nobody enjoys.",
        tips: [
          'Take topknots down nightly; the skin under the band needs checking.',
          'Move the tie point daily so no single spot wears constantly.',
          'Felt-lined accessories hold with less tension and fewer knots.',
        ],
        callout: {
          type: 'warning',
          title: 'Bands left in breed mats',
          text: "A band worn for days creates a root-level mat that can require a clip-out rather than a comb-out, and a mat anchored at skin level hurts to remove. Take topknots down nightly, check under the bow at the skin, and if you find a solid knot, work it apart gently with fingers and a detangling comb rather than pulling it free.",
        },
      },
      {
        id: 'safe-construction',
        title: 'Clips, Bows, and Safe Construction',
        content:
          "Construction details decide whether a pretty piece is safe for a face. Barrettes should close fully with rounded ends and springs firm enough to hold without snapping hair, and no sharp spring edge should touch coat. Bow centers are usually a band or a small elastic loop, which is what actually attaches to the topknot, so check that loop's stitching before the bow's ribbon quality. Match the piece to the dog: a tiny Maltese head carries a small, light bow; an Afghan carries larger ones confidently because the skull and coat can bear them. Avoid glued decorations that shed beads, which end up in curious mouths.",
        tips: [
          'Test barrette springs on your own hair before trusting them on coat.',
          'Check the center loop\'s stitching; it does more work than the ribbon.',
          'Scale bows to the skull; tiny heads need tiny, light pieces.',
        ],
      },
      {
        id: 'rotation-hygiene',
        title: 'Rotation, Washing, and Rest',
        content:
          "Hair accessories are worn fabric, and they collect exactly what the face produces: eye discharge, drool, food mist, and dust. Wash fabric bands and bows in warm water with gentle soap, rinse well, and air dry away from direct heat, because elastics degrade fast when cooked. Rotate at least two sets so each gets rest days, since elastic recovers its grip between wears. Inspect pieces weekly for stretched loops, frayed ribbon edges, and cracked clips, replacing them before they fail mid-wear. A small box with dividers keeps sets together, and the discipline costs about five minutes a week.",
        tips: [
          'Warm water and gentle soap weekly; air dry away from heat.',
          'Rotate two sets so elastic rests and recovers between wears.',
          'Replace frayed and stretched pieces before they fail mid-wear.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'check',
        title: 'Function first',
        items: [
          { highlight: 'Clear the visual field', text: 'by gathering only the hair heading for the eyes.' },
          { highlight: 'Sweep upward, tie high', text: 'above the brow line so the gather lifts hair.' },
          { highlight: 'Two knots beat one', text: 'for fine coats, dividing weight across the forehead.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Kind materials',
        items: [
          { highlight: 'Fabric-wrapped bands', text: 'grip gently and release without pulling out coat.' },
          { highlight: 'Felt linings lower tension', text: 'which means fewer knots at the attachment point.' },
          { highlight: 'Rounded, full-close clips', text: 'because sharp spring edges cut hair at the root.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Nightly rhythm',
        items: [
          { highlight: 'Down every night', text: 'so hair at the band never gets its chance to mat.' },
          { highlight: 'Retie in new spots', text: 'spreading wear so no single point takes it all.' },
          { highlight: 'Wash and rotate weekly', text: 'since face accessories collect discharge, drool, and dust.' },
        ],
      },
    ],
    faqs: [
      {
        question: "How do I keep hair out of my Yorkie's eyes?",
        answer:
          "Sweep up the hair above the eyes from the outer corners and tie it high on the brow with a fabric-covered band. Add a small bow if you like, clipped to the band. Take the topknot down nightly and brush the section before retying.",
      },
      {
        question: 'Are bows safe for dogs?',
        answer:
          "Safe when constructed and worn correctly: fabric-covered or felt-lined attachments, rounded clip ends, a size scaled to the dog's head, and no sharp spring edges touching coat. The real risks are leaving bands in long enough to mat and decorating with pieces that shed small parts. Supervise a dog who chews anything novel.",
      },
      {
        question: 'How tight should a topknot be?',
        answer:
          "Tight enough that the gather holds through head-shaking, loose enough that the skin at the tie does not tent or pull when your dog moves their brow. If the skin below the band moves freely and the eyes stay clear, the tension is right. Bands wrapped with extra loops for security are the classic cause of discomfort.",
      },
      {
        question: 'How often should I wash dog hair accessories?',
        answer:
          "Roughly weekly for anything worn daily, because bands and bows collect eye discharge, drool, and dust straight from the face. Warm water with gentle soap and air drying suits fabric pieces, and elastics last longest away from heat. If a piece smells or looks gray, retire it; replacement costs less than skin irritation under a dirty band.",
      },
      {
        question: 'What bands are best for a Shih Tzu topknot?',
        answer:
          "Fabric-covered elastics or ribbon-wrapped bands, sized small, hold a Shih Tzu gather without fusing to the coat the way bare rubber does. Felt-lined bows grip with almost no tension, which suits a face that also wears a collar line of hair. Silicone spirals work for heavier gathers, though they can snap a single strand at removal.",
      },
    ],
  },

  'apparel-and-accessories/necklaces-and-pendants': {
    heroTitle: 'Pet Necklaces and Pendants That Decorate Safely',
    heroSubheadline:
      "A pendant turns a working collar into a small signature, as long as the collar keeps doing its real jobs: carrying tags, releasing under load, and disappearing from the dog's awareness entirely.",
    metaDescription:
      'Pet necklaces and pendants dress a collar safely: attach without hiding ID tags, keep pendants light, honor breakaway logic for cats, and quiet the clatter.',
    introSummary:
      "You hear the jingle before you see the dog, a bright clatter of tag on tag with a pendant somewhere in the middle, and the owner grinning at the door. Decorative collar jewelry is the lightest-touch corner of pet apparel: no fit to learn, no coat to cover, just a charm riding on gear the pet already wears. That simplicity is exactly why safety lives in the details. Weight, attachment, and noise decide whether a necklace charms or harms, and for cats the breakaway collar rules everything downstream of it.",
    sections: [
      {
        id: 'collar-jobs',
        title: 'The Collar Keeps Its Real Jobs',
        content:
          "A decorative piece rides along; it never takes over. The collar underneath still carries identification tags, anchors a leash attachment, and holds the contact information that gets a lost pet home, so a pendant attaches beside those functions rather than displacing them. Slide a pendant onto the strap itself or hang it from the same D-ring as the tags, and confirm the tag information stays readable and unobstructed afterward. Weight budget matters at this scale: anything heavy enough to change how the collar hangs is heavy enough to bother a neck all day. Decoration earns its place by being forgettable in every way but looks.",
        tips: [
          'ID stays readable first; a pendant that blocks engraving loses.',
          'Attach beside the leash ring and tags, never instead of them.',
          'Weigh the collar in your hand after decorating; heavier is worse.',
        ],
      },
      {
        id: 'lightweight-rule',
        title: 'Lightweight Pendants Only, Always',
        content:
          "Physics is unkind to dangling jewelry on a moving animal. A heavy pendant swings with every stride, tapping the chest or the forelegs, and a dog that feels a rhythmic tap for hours will eventually chew the source. Keep decorative pieces light for the wearer's size: a small tag-weight pendant suits a small dog, and even large dogs carry better with flat, low-profile pieces than with chunky hangs. Felt or fabric-backed pendants sit quietly against the chest and resist tangling with tag hardware. The test is simple: decorated and undecorated, the collar should hang at the same angle on the same neck.",
        tips: [
          'Match pendant weight to the wearer; small dogs feel grams.',
          'Flat, low-profile pieces swing less than chunky dangling hangs.',
          'Felt backing quiets metal-on-metal contact with tag hardware.',
        ],
      },
      {
        id: 'cat-breakaway',
        title: 'Breakaway Logic for Cats',
        content:
          "For cats, decorative neckwear inherits the rule that governs everything a cat wears: it must release under load. Breakaway collars open when snagged on a branch, fence, or furniture edge, converting a strangulation hazard into a lost collar, and any charm added to that collar changes the arithmetic. A pendant can jam a breakaway clasp or add just enough weight to defeat its trigger, so test the release with the charm attached: hook the clasp on your hand and pull. Test it monthly, because wear and grime stiffen the mechanism. Bells are the classic cat charm, and their worth depends on the cat: wildlife-warning for hunters, an annoyance for sharp feline hearing.",
        tips: [
          'Pull-test breakaway clasps with the charm attached, monthly, forever.',
          'Pendant weight can defeat a release; test rather than assume.',
          'Bells suit hunting cats; house-only cats usually prefer silence.',
        ],
        callout: {
          type: 'warning',
          title: 'Test the clasp with the charm on',
          text: "Breakaway collars are only safety equipment while they still release, and a jammed or weighted clasp quietly stops being one. Hook the clasp on your hand, pull, and confirm it opens, with the pendant attached, when it is new and every month after. A decorative piece that defeats the release belongs in the drawer, not on the cat.",
        },
      },
      {
        id: 'charm-noise',
        title: 'Charm Noise and Quiet Options',
        content:
          "The clatter of charm on tag is charming at the door and maddening at three in the morning, and dogs hear it all night whether you do or not. Noise comes from metal striking metal, so quieting it means separating the strikers: rubber o-rings slid over tag edges, felt or fabric backings on pendants, and split-ring attachments that hold hardware snugly rather than letting it swing free. Collar tag silencers, the rubber rims that wrap individual tags, work well when the pendant itself is soft-backed. Some owners engrave the decorative piece itself, merging pendant and identification into one quiet object that never duplicates hardware.",
        tips: [
          'Rubber o-rings on tag edges quiet most metal-on-metal clatter.',
          'Split rings hold hardware snugly and swing far less than jump rings.',
          'An engraved decorative piece merges jewelry and ID into silence.',
        ],
      },
      {
        id: 'attachment-points',
        title: 'Attachment Points Worth Checking',
        content:
          "How a piece hangs decides how long it survives. Thin jump rings, the simple loops that close with a gap, spread open within weeks of daily wear and drop their charm somewhere in the grass. Split rings, the tightly coiled key-ring style, hold through years of scratching and swimming and are worth demanding in any piece you buy. Check where the pendant sits relative to the tag: two pieces of hardware at the same ring will grind against each other, so stagger them on separate rings or separate collar loops. Inspect the stitching on any beaded or fabric strand monthly, because a single broken thread spills the whole design.",
        tips: [
          'Insist on split rings; thin jump rings spread open and drop charms.',
          'Stagger pendant and tag on different rings so hardware stops grinding.',
          'Monthly thread checks catch a failing strand before it spills beads.',
        ],
      },
      {
        id: 'wearing-storing',
        title: 'Wearing and Storing Decorative Pieces',
        content:
          "Even flawless jewelry needs house rules. Remove decorated collars before swimming, since chlorinated and lake water dulls metal and accelerates rust at the spring clasps, and before serious rough play, where a dangling piece becomes a tooth hook. Wipe metal with a dry cloth after wet days, and store pieces off the collar in a dry spot when they will sit unused for a season. Rotate a couple of designs and the collar hardware thanks you for the rest. The last rule is attention: a pet that suddenly scratches at the collar, or fur thinning at the neck line, is telling you something about weight or fit, so listen, remove, and compare something lighter next time.",
        tips: [
          'Remove decorated collars for swimming and rough play, every time.',
          'Dry-wipe metal after wet weather; store unused pieces dry and dark.',
          'Neck scratching or thinning fur says the piece is too heavy.',
        ],
      },
    ],
    takeawayCards: [
      {
        icon: 'shield',
        title: 'Collar first',
        items: [
          { highlight: 'ID stays readable', text: 'always; a pendant that blocks engraving loses immediately.' },
          { highlight: 'Attach, never replace', text: 'tags and leash rings keep their jobs beside the charm.' },
          { highlight: 'Weight hangs level', text: 'decorated or bare, the collar angle should not change.' },
        ],
      },
      {
        icon: 'heart',
        title: 'Cat breakaway rules',
        items: [
          { highlight: 'Release under load', text: 'is the only rule that matters before any decoration.' },
          { highlight: 'Charm changes clasp math', text: 'so pull-test the trigger with the pendant attached.' },
          { highlight: 'Bells suit hunters', text: 'while house cats usually prefer a quieter neckline.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Quiet and durable',
        items: [
          { highlight: 'Split rings outlast', text: 'jump rings, which spread open and drop charms.' },
          { highlight: 'O-rings silence clatter', text: 'by keeping tag edges from striking pendant metal.' },
          { highlight: 'Engraved pieces merge', text: 'jewelry and identification into one quiet object.' },
        ],
      },
    ],
    faqs: [
      {
        question: 'Are necklace charms safe for dogs?',
        answer:
          "When they are lightweight, securely attached with split rings, and worn under supervision. The risks are choking on a chewed-off piece, snagging on crates and fences, and hardware grinding through tag engraving. Choose tag-weight pendants, keep the ID tag readable, and remove the decorated collar before swimming and rough play. Sensible rules turn charms into harmless fun.",
      },
      {
        question: 'Can cats wear necklaces and pendants?',
        answer:
          "Only on a true breakaway collar, and only with the release still working after the charm is attached. Cats snag collars on branches and furniture constantly, and the breakaway clasp is what turns that event into a lost collar rather than an emergency. Pull-test monthly with the pendant on, and keep the charm light enough that the clasp still triggers.",
      },
      {
        question: "How do I quiet my dog's tag and charm noise?",
        answer:
          "Separate the pieces of metal that strike each other: rubber o-rings around tag edges, felt backing on the pendant, and split rings that hold hardware snugly instead of letting it swing. Rubber tag silencers, the rims that wrap each tag, handle the classic clatter. Or engrave the decorative piece itself so jewelry and identification become one quiet object.",
      },
      {
        question: 'Should a pendant replace my dog\'s ID tag?',
        answer:
          "Never. The tag carries the phone number and address that bring a lost dog home, and decoration never outweighs that job. If you like the look of a single quiet object, choose a decorative piece that is itself engravable, so the pendant and the identification merge into one. Otherwise, the pieces share the collar, staggered to stop grinding.",
      },
      {
        question: 'How heavy can a dog pendant be?',
        answer:
          "Light enough that the collar hangs at the same angle decorated as undressed, which usually means tag-weight for small dogs and only modestly more for large ones. A pendant that swings visibly with each stride, or that a dog stops to chew, has already failed the weight test. When in doubt, compare flat, low-profile pieces over dangling designs.",
      },
    ],
  },
};
