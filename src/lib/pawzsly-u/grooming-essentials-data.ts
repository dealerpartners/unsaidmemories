import { ArticleSection, TakeawayItem, RelatedProductItem, FaqItem } from './types';
import { DomainProfile } from './domain-knowledge';

export const GROOMING_ESSENTIALS_PROFILES: Record<string, DomainProfile> = {
  'grooming-essentials': {
    kicker: 'Clinical Home Care & Salon Standards',
    heroTitle: 'Grooming Essentials: Needed for Home Care & Coat Preservation',
    heroSubheadline: 'Veterinary-grade toolkits, safety shears, medicated washes, and precision deshedding hardware to maintain skin barrier health between salon visits.',
    introSummary: 'Home grooming is not merely an aesthetic routine: it is a frontline preventative health assessment. Regular maintenance at home prevents painful pelted matting, detects ectoparasites and cutaneous lesions early, and regulates dermal sebum in the humid Mid-South environment. From sterile hemostatic styptics to cool-running rotary clippers, this guide outlines the non-negotiable equipment every dog and cat owner needs for safe home maintenance.',
    takeaways: [
      {
        icon: 'shield',
        title: 'Safety First Architecture',
        items: [
          { highlight: 'Styptic emergency powders', text: 'instantly halt quick bleeds via ferric subsulfate vascular vasoconstriction.' },
          { highlight: 'Ball-tip safety shears', text: 'protect delicate eye margins, paw webbing, and sanitary zones from puncture risks.' },
          { highlight: 'Cool-running clippers', text: 'eliminate thermal friction burns on sensitive canine and feline abdomens.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Dermatological Balance',
        items: [
          { highlight: 'pH-calibrated formulations', text: 'protect the natural 6.5 to 7.5 canine epidermal acid mantle against bacterial invasion.' },
          { highlight: 'Targeted medicated washes', text: 'eradicate Malassezia yeast overgrowth and Staphylococcus folliculitis during humid months.' },
          { highlight: 'Enzymatic deodorizers', text: 'neutralize lipid oxidation odors without stripping essential coat ceramides.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Ergonomic Tool Execution',
        items: [
          { highlight: 'Dual-depth undercoat rakes', text: 'reach dead secondary hair without slicing through guard hairs or scraping skin.' },
          { highlight: 'Textured silicone bath mitts', text: 'ensure complete lather penetration down to the follicle in dense double coats.' },
          { highlight: 'Electrostatic furniture rollers', text: 'capture shed fur across bedding and upholstery before dander accumulates.' },
        ],
      },
    ],
    sections: [
      {
        id: 'home-grooming-foundation',
        title: '1. The Home Grooming Arsenal: Core Equipment Hierarchy',
        content: 'Maintaining your companion at home requires medical-grade tools built for animal anatomy. Human clippers generate excessive heat, human shampoos disrupt pet epidermal pH, and kitchen scissors pose severe laceration risks. A professional home setup separates into three tiers: preventative hygiene (brushes, wipes, deshedders), therapeutic washing (shampoos, conditioners, sprayers), and safety hardware (styptics, ball-tip shears, safety blades).',
        tips: [
          'Never use human shears near pet skin: one sudden head movement can cause severe soft-tissue laceration.',
          'Always keep active styptic powder open and accessible on your table before trimming nails.',
          'Disinfect all clippers, shears, and slicker brushes with veterinary disinfectant spray after each session.',
        ],
        callout: {
          type: 'pro-tip',
          title: 'Veterinary Equipment Guideline',
          text: 'Dogs possess an epidermal thickness of only 3 to 5 cell layers compared to human skin (10 to 15 layers). Tools must be engineered specifically for thin canine epidermis to prevent micro-abrasions.',
        },
      },
      {
        id: 'equipment-comparison-matrix',
        title: '2. Equipment Comparison Matrix: Essential vs Optional Tools',
        content: 'Review the foundational toolkit required for safe pet maintenance at home, calibrated by frequency and breed coat requirements.',
        tableData: {
          headers: ['Tool Category', 'Primary Medical Function', 'Frequency of Use', 'Key Selection Criterion'],
          rows: [
            ['Hemostatic Styptic Powder', 'Halts quick hemorrhages instantaneously', 'Every nail session', 'Dry powder formulation with benzocaine'],
            ['Undercoat Dematting Rake', 'Extracts dead undercoat without follicle trauma', '1 to 2 times weekly', 'Rounded stainless steel tines with smooth edges'],
            ['pH 7.0 Botanical Shampoo', 'Cleanses without stripping protective lipid sebum', 'Every 2 to 4 weeks', 'Soap-free, oatmeal or aloe-based surfactants'],
            ['Safety Ball-Tip Shears', 'Trims hair around eyes, ears, and paw pads safely', 'Bi-weekly touchups', 'Japanese 440C stainless steel with rounded tips'],
            ['Enzymatic Grooming Wipes', 'Removes ocular discharge and environmental allergens', 'Daily after walks', 'Alcohol-free, enriched with chlorhexidine or chamomile'],
          ],
        },
      },
      {
        id: 'step-by-step-home-protocol',
        title: '3. Step-by-Step Home Maintenance Routine',
        content: 'Follow this sequential workflow to ensure stress-free, efficient care without risking injury to your pet:',
        tips: [
          'Step 1: Diagnostic Full-Body Scan. Run your hands across the entire body to detect ticks, fleas, skin hot spots, and mats before water or shears touch the coat.',
          'Step 2: Pre-Bath Dry Brushing. Always dematt and remove loose undercoat before getting the pet wet, as water tightens existing knots into solid felts.',
          'Step 3: Controlled Hydrotherapy. Use lukewarm water with a concentrated non-slip basin mat, lathering therapeutic shampoo from neck to tail.',
          'Step 4: Precision Drying and Trimming. Dry thoroughly down to the skin before executing minor hygiene trimming around sanitary regions and paw pads.',
        ],
      },
      {
        id: 'midsouth-climate-factors',
        title: '4. Mid-South Climate Considerations for Home Care',
        content: 'In Shelby County and the greater Mid-South region, ambient summer humidity regularly exceeds 75%. Moisture trapped against the skin underneath dead undercoat provides an ideal breeding environment for yeast (Malassezia pachydermatis) and bacteria. Home groomers must prioritize complete drying down to the dermis and integrate antibacterial and antifungal hygiene wipes after outdoor park visits.',
      },
    ],
    testimonials: [
      {
        quote: '“Setting up a proper home kit with ball-tip shears and styptic powder transformed our routine. Our cockapoo no longer dreads nail trims, and our salon groomer complimented how mat-free his coat stays.”',
        authorName: 'Elena Rostova',
        authorRole: 'Pet Parent of Cooper (Cockapoo), Germantown TN',
        avatarUrl: '/images/avatar_sarah_pet_parent_1791411057259.jpg',
        storyLinkText: 'Read Cooper’s care log ↗',
      },
      {
        quote: '“As a veterinary technician, the number one home injury I see is kitchen scissors used for mats. Getting professional dematting rakes and safety shears is the best investment you can make.”',
        authorName: 'David Chen, LVT',
        authorRole: 'Licensed Veterinary Technician, Memphis Pet Emergency Center',
        avatarUrl: '/images/avatar_marcus_pet_parent_1791411068889.jpg',
        storyLinkText: 'Explore home safety protocols ↗',
      },
    ],
  },

  'styptic-gels-and-powders': {
    kicker: 'Emergency Hemostatic Hemostasis',
    heroTitle: 'Styptic Gels & Powders: Hemostatic Quick-Stop Protocols & First Aid',
    heroSubheadline: 'Clinical ferric subsulfate formulations designed to arrest nail quick bleeds within seconds and prevent secondary bacterial infections.',
    introSummary: 'Nail trimming is essential for canine musculoskeletal alignment, yet accidental nicking of the vascular quick remains the most common anxiety trigger for pet parents. The quick contains high-pressure sensory capillaries and nerve endings. Hemostatic styptic powders and gels utilize ferric subsulfate to cause immediate chemical cauterization and coagulate blood protein in seconds. Every home groomer must have an open styptic container at arms reach prior to clipping.',
    takeaways: [
      {
        icon: 'shield',
        title: 'Coagulation Chemistry',
        items: [
          { highlight: 'Ferric subsulfate active', text: 'chemically cauterizes microvascular bleeding in under 5 seconds.' },
          { highlight: 'Benzocaine pain relief', text: 'topical analgesic numbs immediate stinging sensation at the nail bed.' },
          { highlight: 'Bentonite binding matrix', text: 'forms an instant dry scab seal that resists licking and pressure.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Application Precision',
        items: [
          { highlight: 'Direct powder press', text: 'dip the bleeding nail directly into the powder cap or apply via cotton applicator.' },
          { highlight: 'Sustained moderate pressure', text: 'hold firm pressure for 10 to 15 seconds without wiping away the formed clot.' },
          { highlight: 'No liquid dilution', text: 'never flush water over an active styptic plug until fully clotted.' },
        ],
      },
      {
        icon: 'clock',
        title: 'First Aid Readiness',
        items: [
          { highlight: 'Zero expired potency', text: 'keep powder tightly sealed to prevent atmospheric humidity from hardening the compound.' },
          { highlight: 'Gel vs powder options', text: 'powders work fastest for deep quiks: gels are ideal for minor cuticle scrapes.' },
          { highlight: 'Clinical infection barrier', text: 'antimicrobial properties block entry of environmental pathogens into the vascular bed.' },
        ],
      },
    ],
    sections: [
      {
        id: 'hemostatic-mechanism',
        title: '1. Mechanism of Action: How Ferric Subsulfate Works',
        content: 'When the nail quick is nicked, blood flows freely from the dorsal digital artery branches. Traditional direct pressure alone can take 10 to 20 minutes to clot due to the rigid horn capsule surrounding the blood vessel. Ferric subsulfate acts as an aggressive chemical astringent: its trivalent iron ions precipitate blood proteins (albumin and fibrinogen) on contact, creating a microvascular occlusive plug within seconds.',
        tips: [
          'Pre-fill a bottle cap with styptic powder before starting any nail trimming session.',
          'If bleeding occurs, immediately press the nail flat into the powder with moderate thumb pressure.',
          'Do not wipe the black crust away once bleeding stops: that crust is the active sterile seal.',
        ],
        callout: {
          type: 'pro-tip',
          title: 'Emergency Technique Note',
          text: 'If styptic powder is unavailable during an unexpected emergency, clean cornstarch or baking flour mixed with a drop of cold water can provide temporary mechanical compression until medical hemostatic powder is applied.',
        },
      },
      {
        id: 'gel-vs-powder-comparison',
        title: '2. Clinical Comparison: Styptic Powder vs. Hemostatic Gel',
        content: 'Different formulations offer distinct benefits depending on the location and severity of the capillary tear.',
        tableData: {
          headers: ['Parameter', 'Ferric Subsulfate Powder', 'Hemostatic Applicator Gel', 'Cornstarch (Home Backup)'],
          rows: [
            ['Onset of Hemostasis', '3 to 5 seconds', '8 to 15 seconds', '60 to 180 seconds'],
            ['Clot Stability Under Walking', 'Very High (Rigid crust)', 'High (Flexible polymer seal)', 'Low (Disintegrates under friction)'],
            ['Pain Reduction', 'Moderate (With benzocaine)', 'High (Cooling gel base)', 'None (Pure mechanical absorption)'],
            ['Best Use Case', 'Severe nail quick cuts', 'Surface skin scratches & ear tips', 'Temporary emergency backup'],
          ],
        },
      },
      {
        id: 'step-by-step-quick-treatment',
        title: '3. Step-by-Step Protocol: Arresting a Bleeding Quick',
        content: 'Execute this calm, methodical procedure when a nail quick is accidentally breached:',
        tips: [
          'Step 1: Maintain Calm Control. Dogs react instantly to handler panic. Keep a secure hold on the paw without squeezing the digit.',
          'Step 2: Dry the Wound Surface. Quickly dab the free blood droplet with a sterile gauze pad so the styptic directly contacts the vessel mouth.',
          'Step 3: Pack and Press. Dip the tip of the nail directly into the styptic powder or press a heavily coated cotton swab firmly onto the apex for 15 seconds.',
          'Step 4: Restrict Activity. Restrict the pet from vigorous running or outdoor wet grass for at least 30 minutes to preserve the clot.',
        ],
      },
      {
        id: 'midsouth-first-aid',
        title: '4. Mid-South Yard Hazards & Claw Infections',
        content: 'In Memphis, wet clay soil and summer mulch harbor opportunistic bacteria including Pseudomonas and Staphylococcus. An unsealed, bleeding quick exposed to yard soil can quickly develop into painful paronychia (nail bed infection) requiring systemic antibiotics. Always ensure the quick is fully sealed with medical styptic before letting your pet outside.',
      },
    ],
    testimonials: [
      {
        quote: '“I was terrified to trim my rescue hound’s black nails until our groomer showed me how to keep styptic powder ready. When I nicked a quick last month, the powder stopped it in four seconds flat with zero distress.”',
        authorName: 'Marcus T. Vance',
        authorRole: 'Hound Parent, Midtown Memphis',
        avatarUrl: '/images/avatar_marcus_pet_parent_1791411068889.jpg',
        storyLinkText: 'Read Marcus’s first aid review ↗',
      },
    ],
  },

  'shower-and-bath-supplies': {
    kicker: 'Hydrotherapy & Bathing Architecture',
    heroTitle: 'Shower & Bath Supplies: Non-Slip Mats, Sprayers & Bathing Ergonomics',
    heroSubheadline: 'Salon-grade bathing accessories engineered to eliminate canine slipping trauma, optimize water pressure, and protect pet ear canals.',
    introSummary: 'Over 80% of dogs that resist bathing are not afraid of water: they are terrified of slipping on slick porcelain or acrylic bathtub surfaces. Without traction, canines cannot stabilize their joints, triggering acute adrenaline spikes and flight responses. Equipping your home bathroom with high-traction textured rubber mats, targeted 360-degree handheld sprayers, and protective ear wraps transforms chaotic baths into therapeutic wellness sessions.',
    takeaways: [
      {
        icon: 'shield',
        title: 'Biomechanical Stability',
        items: [
          { highlight: 'Heavy suction-cup rubber mats', text: 'provide claw traction that instantly lowers heart rates and panic reactions.' },
          { highlight: 'Targeted water pressure', text: 'massages deep undercoats without the loud hiss that terrifies sound-sensitive dogs.' },
          { highlight: 'Ear canal splash guards', text: 'prevent water ingress that causes chronic fungal otitis externa.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Efficient Lather Penetration',
        items: [
          { highlight: 'Curved massage scrubbers', text: 'distribute shampoo evenly down to the skin barrier with half the water consumption.' },
          { highlight: 'Dual-speed aerator wands', text: 'switch between gentle face rinsing and concentrated rump deshedding pressure.' },
          { highlight: 'Quick-latch tub restraints', text: 'keep pets centered safely without neck strain or choking hazards.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Thermal & Skin Preservation',
        items: [
          { highlight: 'Lukewarm thermal calibration', text: 'maintains water at 98°F to prevent overheating or shivering.' },
          { highlight: 'Splash shields & drain strainers', text: 'capture thick undercoat before it clogs home plumbing drainage.' },
          { highlight: 'Microfiber shammy towels', text: 'wick 7 times their weight in water, slashing blow-drying stress in half.' },
        ],
      },
    ],
    sections: [
      {
        id: 'anti-slip-science',
        title: '1. The Biomechanics of Bathtub Panic: Why Traction Matters',
        content: 'A dog standing on wet enamel lacks claw purchase. Because canine balance relies on paw pad friction and digit flexion, a slipping surface feels to them like an impending fall. When a medical-grade textured rubber mat is installed, dogs immediately anchor their weight, their muscles relax, and handling compliance increases by over 70%.',
        tips: [
          'Always test that tub suction cups are fully engaged before placing the pet in the bath.',
          'Place a secondary non-slip mat outside the tub for the pet’s exit landing.',
          'Never leave a restrained pet unattended in a tub for even three seconds.',
        ],
        callout: {
          type: 'pro-tip',
          title: 'Master Groomer Tip',
          text: 'Pair your non-slip tub mat with a suction-cup silicone peanut butter lick mat positioned at the pet eye level. This engages dopamine-releasing licking behavior that overrides bathing stress.',
        },
      },
      {
        id: 'shower-attachment-matrix',
        title: '2. Home Bathing Hardware Matrix: Standard vs. Professional',
        content: 'Evaluate the equipment differences between makeshift home tools and specialized canine bathing hardware.',
        tableData: {
          headers: ['Hardware Component', 'Standard Human Bathroom', 'Canine-Specific Bathing Gear', 'Clinical Benefit'],
          rows: [
            ['Shower Head', 'Fixed high overhead (loud hiss)', 'Handheld wand with thumb valve & soft spray', 'Eliminates ear water ingress and noise phobia'],
            ['Tub Base', 'Bare porcelain or acrylic enamel', 'Dense textured suction-cup rubber mat', 'Eliminates slip anxiety & joint hyperextension'],
            ['Towel Type', 'Cotton bath towel (soaks rapidly)', 'Ultra-absorbent PVA micro-fiber shammy', 'Extracts 70% of coat moisture in 2 minutes'],
            ['Restraint System', 'Manual collar holding (risky)', 'Swivel suction anchor with padded loop', 'Keeps pet upright and prevents sudden leaps'],
          ],
        },
      },
      {
        id: 'step-by-step-bathing',
        title: '3. Step-by-Step Low-Stress Hydrotherapy Workflow',
        content: 'Follow these sequential steps for a clean, calm bath:',
        tips: [
          'Step 1: Rig the Sanctuary. Secure the non-slip mat, adhere the lick mat at eye height, and test water temperature on your inner wrist.',
          'Step 2: Protect the Ears and Eyes. Place large cotton balls loosely inside the ear canals to block water droplets from seeding yeast infections.',
          'Step 3: Posterior to Anterior Wetting. Begin spraying water at the rear paws and hindquarters, slowly moving forward toward the shoulders.',
          'Step 4: Lather and Rinse Methodology. Massage shampoo against the grain of the coat to reach the dermis, followed by a double freshwater rinse.',
        ],
      },
      {
        id: 'midsouth-water-factors',
        title: '4. Memphis Municipal Water & Coat Rinsing',
        content: 'Memphis is blessed with exceptionally soft, pure artesian aquifer water. However, soft water requires slightly more rinse time to completely clear surfactant residue from dense pet coats. Always conduct a squeak test on the fur: run your damp thumb across the hair shaft to verify zero soapy slickness remains.',
      },
    ],
    testimonials: [
      {
        quote: '“Our Golden Retriever used to fight tub time until we bought a high-traction rubber mat and the handheld sprayer wand. Now he steps into the tub voluntarily!”',
        authorName: 'Rachel & Tim Bradley',
        authorRole: 'Golden Retriever Owners, Collierville TN',
        avatarUrl: '/images/avatar_sarah_pet_parent_1791411057259.jpg',
        storyLinkText: 'Read the Bradleys’ bathing review ↗',
      },
      {
        quote: '“As a groomer, I tell all my clients that 90% of bath drama disappears with a proper non-slip mat. It gives dogs their footing back and eliminates panic instantly.”',
        authorName: 'Camilla Hayes',
        authorRole: 'Senior Stylist, All About Pawz Salon',
        avatarUrl: '/images/avatar_marcus_pet_parent_1791411068889.jpg',
        storyLinkText: 'Learn professional bathing protocols ↗',
      },
    ],
  },

  'shedding-tools': {
    kicker: 'Undercoat De-Shedding & Follicle Care',
    heroTitle: 'Shedding Tools: Undercoat Rakes, Blade Combs & Blow-Out Protocols',
    heroSubheadline: 'Veterinary-recommended deshedding hardware designed to extract dead undercoat without cutting guard hairs or scraping sensitive dermis.',
    introSummary: 'Double-coated breeds (Huskies, Shepherds, Retrievers, Corgis) shed continuously, with catastrophic coat blowing occurring twice each year during seasonal shifts. Using the wrong tool, such as sharp bladed de-shedders that slice the topcoat, damages the weather-resistant guard hairs and ruins the insulating barrier. Proper undercoat rakes and slickers feature rounded, smooth stainless steel tines that bypass outer hairs to collect dead woolly undercoat safely.',
    takeaways: [
      {
        icon: 'shield',
        title: 'Guard Coat Preservation',
        items: [
          { highlight: 'Smooth rounded tines', text: 'glide through outer guard hairs without breaking the protective weather-resistant coat.' },
          { highlight: 'Zero razor blades', text: 'eliminates inadvertent slicing of healthy hair shafts common with cheap knockoff tools.' },
          { highlight: 'Skin-contouring flexible heads', text: 'conform to body curvatures around the ribcage, spine, and flanks.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Undercoat Extraction Efficiency',
        items: [
          { highlight: 'Dual-depth staggered pins', text: 'target both medium and deep undercoat layers in a single methodical pass.' },
          { highlight: 'Static-reducing coatings', text: 'prevent flying fur clouds by neutralizing triboelectric static charges.' },
          { highlight: 'Ergonomic rubberized grip', text: 'reduces handler wrist fatigue during intensive seasonal blow-out sessions.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Thermoregulation Science',
        items: [
          { highlight: 'Preserves natural insulation', text: 'clearing dead undercoat allows air to circulate against the skin for summer cooling.' },
          { highlight: 'Prevents hot spots', text: 'removing dead compacted felt prevents trapped humidity from breeding bacteria.' },
          { highlight: 'Reduces indoor dander', text: 'captures over 90% of shed hair before it settles into household carpets and HVAC ducts.' },
        ],
      },
    ],
    sections: [
      {
        id: 'anatomy-of-double-coat',
        title: '1. Anatomy of the Double Coat: Guard Hair vs Undercoat',
        content: 'A double coat is a marvel of thermal engineering. The outer coat consists of coarse, glistening guard hairs that repel rain, mud, and UV rays. Beneath lies the dense, woolly undercoat that traps air for thermal regulation. When undercoat sheds, it does not immediately fall to the floor: it gets trapped within the guard hairs. If left unbrushed, it forms an impermeable pelt that traps moisture and heat against the skin.',
        tips: [
          'Never shave a double-coated breed: shaving permanently ruins the undercoat-to-guard-hair growth ratio.',
          'Work in small 4-inch sections using the line brushing technique to inspect skin condition.',
          'Always brush in the direction of hair growth with light, even pressure: never dig into the skin.',
        ],
        callout: {
          type: 'pro-tip',
          title: 'Master Groomer Insight',
          text: 'If you see grey, broken stubble or patchy thinning after using a shedding blade, your tool is cutting the coat rather than extracting loose hair. Switch immediately to a rounded undercoat rake.',
        },
      },
      {
        id: 'shedding-tool-matrix',
        title: '2. Shedding Tool Selection Matrix by Coat Type',
        content: 'Select the optimal deshedding instrument based on coat length, density, and breed characteristics.',
        tableData: {
          headers: ['Tool Type', 'Ideal Coat Architecture', 'Working Mechanism', 'Frequency of Use'],
          rows: [
            ['Undercoat Rake (Rotating Pins)', 'Heavy double coats (Huskies, Malamutes, Shepherds)', 'Smooth long tines penetrate deep to pull woolly undercoat', '2 to 3 times weekly'],
            ['Long-Pin Slicker Brush', 'Medium to long coats (Golden Retrievers, Doodles)', 'Angled flexible wire pins separate snarls and loose fuzz', 'Daily or every other day'],
            ['Curved Rubber Curry Brush', 'Short dense coats (Labs, Pugs, Boxers, Beagles)', 'Silicone nubs massage skin and attract loose shedding via friction', 'Weekly during bath time'],
            ['High-Velocity Blower', 'All dense double coats', 'Concentrated air blast displaces dead hair from the follicle without brushing', 'Monthly or seasonal blow-out'],
          ],
        },
      },
      {
        id: 'step-by-step-deshedding',
        title: '3. Step-by-Step Line Brushing Protocol',
        content: 'Execute the salon-standard line brushing method at home:',
        tips: [
          'Step 1: Part the Coat to the Skin. Use your non-dominant hand to push a section of coat upward until you see bare pink skin.',
          'Step 2: Brush the Bottom Layer. Use your rake or slicker to brush a thin horizontal line of fur downward with gentle, sweeping strokes.',
          'Step 3: Move Upward One Inch. Release another thin layer of fur from your non-dominant hand and brush that layer down over the first.',
          'Step 4: Metal Grey-Hound Comb Check. Run a wide-toothed metal comb through the brushed section: if it glides freely without snagging, that zone is completely clear.',
        ],
      },
      {
        id: 'midsouth-shedding-seasons',
        title: '4. Mid-South Seasonal Coat Blowing Cycles',
        content: 'During seasonal weather shifts and rapid springtime temperature surges, canine circadian shedding rhythms trigger heavy coat blows. Dogs typically blow coat heavily in spring as temperatures rise, and again in autumn as winter undercoats develop. During these peak windows, daily line brushing prevents dead coat from compacting into dense mats.',
      },
    ],
    testimonials: [
      {
        quote: '“Our Siberian Husky was filling three vacuum bags a week. Switching from a grocery-store blade to a professional rotating-pin undercoat rake saved his coat and cut our cleaning time in half.”',
        authorName: 'Jonah Vance',
        authorRole: 'Husky Parent, Bartlett TN',
        avatarUrl: '/images/avatar_marcus_pet_parent_1791411068889.jpg',
        storyLinkText: 'See Jonah’s Husky deshedding results ↗',
      },
    ],
  },

  'shampoos-and-conditioners': {
    kicker: 'Dermatological Chemistry & pH Balance',
    heroTitle: 'Shampoos & Conditioners: pH-Balanced Botanical Formulations for Pets',
    heroSubheadline: 'Clinical cleansing agents, colloidal oatmeal soothers, and lipid-replenishing conditioners calibrated to the canine 6.5 to 7.5 acid mantle.',
    introSummary: 'Canine skin is significantly more neutral and delicate than human skin, with an epidermal pH ranging between 6.5 and 7.5 (human skin averages acidic at 5.5). Using human shampoo or harsh dish soap strips the stratum corneum of essential lipid ceramides, causing intense pruritus, xerosis (severe dryness), and opportunistic bacterial invasion. Veterinary-grade pet shampoos utilize gentle coconut-derived glucosides and colloidal oatmeal to cleanse without damaging dermal barriers.',
    takeaways: [
      {
        icon: 'shield',
        title: 'Acid Mantle Preservation',
        items: [
          { highlight: 'Strict pH 7.0 calibration', text: 'maintains the delicate alkaline balance of canine and feline epidermis.' },
          { highlight: 'Zero harsh sulfates', text: 'eliminates sodium lauryl sulfate (SLS) irritation and stripped lipid barriers.' },
          { highlight: 'Biodegradable glucosides', text: 'cleanses deep grease while remaining hypoallergenic and tear-free.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Conditioning & Sebum Restoration',
        items: [
          { highlight: 'Ceramide-3 infusion', text: 'repairs microscopic fissures between epidermal skin cells.' },
          { highlight: 'Colloidal oat avenanthramides', text: 'clinically reduces histamine-induced itching within 15 minutes of application.' },
          { highlight: 'Hydrating jojoba and silk esters', text: 'seals hair cuticle scales to prevent matting and electrostatic friction.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Dilution & Application Ratios',
        items: [
          { highlight: 'Concentrated 10:1 or 16:1 formulas', text: 'mixes with warm water for easy full-body penetration and rapid rinsing.' },
          { highlight: '5-minute contact time', text: 'allows active botanicals to bind to keratin receptors before rinsing.' },
          { highlight: 'Residue-free clean rinsing', text: 'leaves no sticky film that would attract outdoor dust and pollen.' },
        ],
      },
    ],
    sections: [
      {
        id: 'canine-epidermal-chemistry',
        title: '1. The Chemistry of Dog Skin: Why Human Soap Is Toxic to Fur',
        content: 'Human skin is protected by an acidic sebum mantle (pH 5.2 to 5.8) that fends off environmental microbes. Canine skin is much closer to neutral (pH 6.8 to 7.4). When human soap is applied to a dog, the acidic surfactants wash away their protective stratum corneum, creating micro-cracks in the epidermis. Within 48 hours, pets develop intense itchiness, flaky dandruff, and secondary yeast colonization.',
        tips: [
          'Never use dish soap, baby shampoo, or human body washes on your dog or cat.',
          'Always dilute concentrated pet shampoo in a mixing bottle with warm water before pouring over the coat.',
          'Always follow shampoo with a veterinary conditioner: shampoo opens the cuticle, conditioner seals it closed.',
        ],
        callout: {
          type: 'pro-tip',
          title: 'Veterinary Dermatology Fact',
          text: 'Canine skin is only 3 to 5 cell layers thick compared to human skin (10 to 15 layers). Formulations must be exceptionally gentle and free from artificial parabens, synthetic dyes, and heavy perfumes.',
        },
      },
      {
        id: 'botanical-active-matrix',
        title: '2. Active Botanical Ingredients Matrix: What to Look For',
        content: 'Understand key botanical actives and their clinical dermatological applications.',
        tableData: {
          headers: ['Active Ingredient', 'Mechanism of Action', 'Target Skin Condition', 'Recommended Pet Profile'],
          rows: [
            ['Colloidal Oatmeal (USP)', 'Inhibits inflammatory cytokines & histamine release', 'Allergic pruritus, dry skin, flea bite sensitivity', 'All dogs & cats with seasonal itch'],
            ['Aloe Vera Barbadensis', 'Provides mucopolysaccharides that bind moisture', 'Superficial skin abrasions, razor burn, sunburn', 'Short-coated & sensitive-skin breeds'],
            ['Hydrolyzed Silk Protein', 'Penetrates hair shaft to increase tensile strength', 'Brittle, dry, damaged or matted coats', 'Doodles, Poodles, long-haired show coats'],
            ['Tea Tree / Neem Oil (Ultra-Low Dose)', 'Natural antiseptic and insect repellent', 'Summer pest defense and odor elimination', 'Adult dogs only (Strictly toxic to cats)'],
          ],
        },
      },
      {
        id: 'step-by-step-bathing-chemistry',
        title: '3. Step-by-Step Therapeutic Bathing Protocol',
        content: 'Maximize therapeutic results with this professional wash sequence:',
        tips: [
          'Step 1: Dilute and Pre-Mix. Mix shampoo with warm water in a dedicated squeeze applicator at the manufacturer dilution ratio (e.g., 10 parts water to 1 part shampoo).',
          'Step 2: Apply to Damp Coat. Pour the diluted wash along the dorsal spine line and lather downward across the ribcage, legs, and underbelly.',
          'Step 3: Five-Minute Contact Window. Allow active colloidal ingredients to remain on the skin for a full 5 minutes while massaging gently with a bath scrubber.',
          'Step 4: Thorough Double Rinse. Rinse with lukewarm water until runoff is completely crystal clear: any residual surfactant will trigger dry scratching.',
        ],
      },
      {
        id: 'midsouth-allergy-defense',
        title: '4. Mid-South Pollen and Red Clay Cleansing',
        content: 'From March through September, Shelby County records some of the highest tree and ragweed pollen counts in North America. These microscopic environmental allergens penetrate the canine skin barrier transdermally. Weekly baths with a pH-balanced oatmeal botanical wash wash away pollen before it triggers atopic dermatitis and chronic paw chewing.',
      },
    ],
    testimonials: [
      {
        quote: '“Our French Bulldog had red belly rash every spring until our vet told us to stop using baby shampoo and switch to pH 7.0 colloidal oatmeal wash. Within two weeks, his redness completely vanished.”',
        authorName: 'Chloe & Marcus Evans',
        authorRole: 'French Bulldog Parents, East Memphis',
        avatarUrl: '/images/avatar_sarah_pet_parent_1791411057259.jpg',
        storyLinkText: 'Read the Evans family review ↗',
      },
      {
        quote: '“Conditioner is the missing step in most home grooming routines. Shampoo cleans, but conditioner restores the lipid barrier and stops static matting. It cut our doodle client matting in half.”',
        authorName: 'Jessica Taylor',
        authorRole: 'Master Stylist & Educator, All About Pawz',
        avatarUrl: '/images/avatar_marcus_pet_parent_1791411068889.jpg',
        storyLinkText: 'View coat hydration tutorials ↗',
      },
    ],
  },

  'scissors': {
    kicker: 'Precision Shears & Safety Edges',
    heroTitle: 'Scissors & Shears: Japanese Steel, Ball-Tip Safety Shears & Thinning Shears',
    heroSubheadline: 'Salon-grade 440C stainless steel cutting instruments engineered for safe facial trimming, paw pad clearing, and natural coat blending.',
    introSummary: 'Using kitchen or household craft scissors on a live pet is the single most frequent cause of emergency soft-tissue lacerations seen in veterinary clinics. Pets make sudden, unpredictable movements when ears twitch or noises occur. Professional canine shears feature convex razor edges that cut cleanly without folding hair, rounded ball tips that prevent puncture trauma in high-risk zones, and ergonomic offset handles that prevent carpal tunnel strain.',
    takeaways: [
      {
        icon: 'shield',
        title: 'Ball-Tip Safety Geometry',
        items: [
          { highlight: 'Rounded blunt bulb tips', text: 'prevents puncture wounds around eye orbits, ear flaps, and paw webbing.' },
          { highlight: 'Zero sharp point exposure', text: 'safely trims delicate sanitary regions without nicking skin folds.' },
          { highlight: 'High-tension pivot screw', text: 'maintains blade alignment so hair cannot pull or catch between blades.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Japanese 440C Steel Metallurgy',
        items: [
          { highlight: 'Cryogenically tempered steel', text: 'holds a razor-sharp convex edge through thousands of cutting cycles.' },
          { highlight: 'Ultra-light balanced weight', text: 'distributes mass evenly across the palm to eliminate hand tremors.' },
          { highlight: 'Corrosion-resistant finish', text: 'resists rust from contact with pet shampoos and sanitizing sprays.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Specialized Shear Types',
        items: [
          { highlight: 'Thinning shears (28 to 42 teeth)', text: 'softens harsh clipper lines and blends transitions invisibly.' },
          { highlight: 'Curved shears (7 to 8 inch)', text: 'shapes rounded puppy heads, topknots, and spherical pom-poms with ease.' },
          { highlight: 'Straight detail shears', text: 'executes crisp straight lines on leg columns and baseline skirts.' },
        ],
      },
    ],
    sections: [
      {
        id: 'scissor-safety-rules',
        title: '1. The Golden Safety Rules of Canine Scissoring',
        content: 'When wielding shears around a pet, your blades are millimeters away from sensitive tissue. Never cut into a mat blindly where skin may be tented inside the tangle. Always position the cutting edge parallel to the skin surface, never pointed directly perpendicular toward the body. For home pet parents, a 5.5-inch ball-tip safety shear is the mandatory tool for all facial and paw trimming.',
        tips: [
          'Always keep your index finger resting on the pet skin beneath the shear to ensure you feel the skin before blades close.',
          'Never use pointed straight scissors on a moving dog or cat under any circumstances.',
          'Store shears in a padded protective case: dropping shears on tile or concrete instantly ruins blade alignment.',
        ],
        callout: {
          type: 'pro-tip',
          title: 'Master Groomer Insight',
          text: 'Tented skin is a common veterinary emergency. When a mat pulls tightly against the body, it tents a flap of skin directly into the center of the knot. Cutting into the knot with standard scissors amputates that skin flap. Always use a dematting tool or clippers, never scissors, on tight skin mats.',
        },
      },
      {
        id: 'scissor-types-comparison',
        title: '2. Professional Shear Comparison Matrix',
        content: 'Understand the distinct functions of the three essential shear types in a home grooming kit.',
        tableData: {
          headers: ['Shear Category', 'Blade Architecture', 'Primary Application', 'Skill Level Needed'],
          rows: [
            ['Ball-Tip Safety Shears (5.5")', 'Blunt rounded bulb tip, convex edges', 'Eyes, tear paths, muzzle, paw pads, sanitary', 'Beginner to Intermediate'],
            ['Thinning & Blending Shears (30T)', 'Single serrated comb blade + single flat blade', 'Blending harsh lines, thinning bulk, natural finish', 'Intermediate'],
            ['Curved Styling Shears (7.0")', 'Curved upward blade arc (30° curvature)', 'Rounding poodle heads, teddy bear faces, feet', 'Intermediate to Advanced'],
            ['Straight Finishing Shears (7.5")', 'Precision straight mirror-finish convex blades', 'Crisp leg lines, skirts, flat coat leveling', 'Advanced'],
          ],
        },
      },
      {
        id: 'step-by-step-scissoring',
        title: '3. Step-by-Step Face and Paw Pad Trimming Sequence',
        content: 'Execute this safe, controlled sequence for trimming sensitive zones:',
        tips: [
          'Step 1: Anchor the Head. Securely hold the pet’s beard or chin hair with your non-dominant hand so the pet cannot make sudden head thrusts.',
          'Step 2: Clear Eye Corners. Using ball-tip safety shears with tips pointing AWAY from the eye, gently snip hair obscuring the visual field.',
          'Step 3: Clear Paw Pad Hair. Spread the foot pads with your thumb and snip hair level with the pads: never dig the blades into the deep interdigital webbing.',
          'Step 4: Sanitize and Oil. Wipe blades with 70% isopropyl alcohol and apply a drop of shear lubricant to the pivot screw before storage.',
        ],
      },
      {
        id: 'midsouth-paw-care',
        title: '4. Summer Heat and Paw Pad Maintenance in Memphis',
        content: 'In Shelby County summers, asphalt and concrete reach blistering temperatures exceeding 135°F. Excess hair growing out from paw pad crevices traps sticky asphalt oils and prevents natural heat dissipation through paw sweat glands. Trimming pad hair flush with safety shears keeps paws cool and improves indoor hardwood traction.',
      },
    ],
    testimonials: [
      {
        quote: '“I used to be terrified of trimming hair around my Shih Tzu’s eyes. Getting ball-tip safety shears made it completely stress-free. The blunt tip gives me total confidence.”',
        authorName: 'Hannah Montgomery',
        authorRole: 'Shih Tzu Parent, Midtown Memphis',
        avatarUrl: '/images/avatar_sarah_pet_parent_1791411057259.jpg',
        storyLinkText: 'Read Hannah’s review ↗',
      },
    ],
  },

  'hair-removal-mitts-and-rollers': {
    kicker: 'Environmental Hygiene & Dander Control',
    heroTitle: 'Hair Removal Mitts & Rollers: Electrostatic Surface & Fur Cleaners',
    heroSubheadline: 'Reusable electrostatic fabric brushes, silicone pet mitts, and self-cleaning rollers that capture pet fur and allergens without adhesive tape waste.',
    introSummary: 'Pet hair shedding does not end when your dog steps off the grooming table: shed hair immediately transfers to furniture, car seats, clothing, and bed linens. Traditional sticky tape rollers are wasteful, expensive, and fail to pull embedded undercoat from woven upholstery fibers. Modern electrostatic hair removal tools utilize directional micro-bristles and static charge dynamics to trap fur in a self-cleaning chamber without paper waste.',
    takeaways: [
      {
        icon: 'shield',
        title: 'Electrostatic Trapping Physics',
        items: [
          { highlight: 'Directional micro-bristles', text: 'acts like thousands of miniature hooks that lift deeply woven pet hair fibers.' },
          { highlight: 'Built-in static charge generation', text: 'pulls fine airborne undercoat directly onto the roller surface.' },
          { highlight: 'Reusable zero-waste design', text: 'eliminates thousands of single-use adhesive sheets every year.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Dual Grooming & De-Hairing Mitts',
        items: [
          { highlight: 'Textured silicone palm nodules', text: 'massages your pet while simultaneously lifting loose shedding directly off their coat.' },
          { highlight: 'Velvet reverse fabric', text: 'cleans couches, curtains, and car interiors with a simple sweeping stroke.' },
          { highlight: 'Breathable mesh backing', text: 'keeps handler hands cool and machine-washes easily after heavy sessions.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Allergen & Asthma Reduction',
        items: [
          { highlight: 'Captures pet dander (Can f 1 / Fel d 1)', text: 'removes microscopic salivary proteins that trigger human allergies.' },
          { highlight: 'Protects HVAC filtration', text: 'prevents fur buildup in home air intake registers and ventilation blowers.' },
          { highlight: 'Easy trap door chamber release', text: 'empties accumulated hair directly into the trash with a single click.' },
        ],
      },
    ],
    sections: [
      {
        id: 'physics-of-pet-hair',
        title: '1. The Physics of Embedded Hair: Why Vacuuming Isn’t Enough',
        content: 'Canine and feline hair fibers feature microscopic cuticle scales that act like barbed needles. When pets sit on woven upholstery, friction drives these barbed hairs deep into the textile matrix. Standard vacuum suction simply skims the surface. Electrostatic rollers and textured silicone mitts use opposing triboelectric friction and angled micro-filaments to dislodge and extract these barbed hairs from deep inside the fabric weave.',
        tips: [
          'Roll in short, rapid back-and-forth strokes: this activates the electrostatic charge that pulls hair into the collection chamber.',
          'Use the textured silicone mitt during cuddle time to capture loose fur before it ever lands on your couch.',
          'Wipe electrostatic rollers with a damp cloth periodically to remove accumulated dust oils and restore maximum friction.',
        ],
        callout: {
          type: 'pro-tip',
          title: 'Household Allergy Management',
          text: 'Over 85% of human pet allergies are triggered not by the hair itself, but by microscopic dander proteins (Can f 1 in dogs, Fel d 1 in cats) bound to shed hair shafts. Daily rolling of pet sleeping zones dramatically reduces ambient dander concentrations.',
        },
      },
      {
        id: 'hair-tool-matrix',
        title: '2. Environmental Hair Removal Tools Matrix',
        content: 'Compare the efficiency and cost-effectiveness of modern pet hair extraction gear.',
        tableData: {
          headers: ['Tool Type', 'Target Surface', 'Mechanism of Action', 'Waste & Long-Term Cost'],
          rows: [
            ['Self-Cleaning Electrostatic Roller', 'Couches, bedding, area rugs, car upholstery', 'Dual-direction micro-fabric with internal trap chamber', 'Zero waste: lasts for years'],
            ['Dual-Sided Grooming Mitt', 'Pet body + clothing & delicate curtains', 'Silicone nodules (front) + velvet lint fabric (back)', 'Washable & reusable'],
            ['Rubber Squeegee / Pet Rake', 'Deep pile carpets & automotive carpet', 'High-friction rubber blade dragging deeply embedded fur', 'Zero consumable parts'],
            ['Adhesive Tape Roller', 'Light clothing touchups only', 'Chemical glue adhesive sheets', 'High recurring cost & plastic waste'],
          ],
        },
      },
      {
        id: 'step-by-step-furniture-clean',
        title: '3. Step-by-Step Deep Furniture De-Hairing Protocol',
        content: 'Clear stubborn pet hair from home surfaces with this fast 4-step workflow:',
        tips: [
          'Step 1: Mist Lightly with Water or Static Spray. A fine mist of water relaxes fabric tension and increases electrostatic grab.',
          'Step 2: Rapid Back-and-Forth Roller Action. Roll in short 6-inch strokes across the sofa cushions, listening for the internal squeegee mechanism.',
          'Step 3: Detail Edges with Silicone Mitt. Use the glove to sweep crevices, cushion piping, and tight sofa corners where rollers cannot reach.',
          'Step 4: Click and Empty Chamber. Press the release catch and dump the compacted hair cylinder directly into your compost or waste bin.',
        ],
      },
      {
        id: 'midsouth-climate-dander',
        title: '4. High Humidity and Dust Mite Synergy in Shelby County',
        content: 'In Memphis, humid indoor air during summer combined with shed pet dander creates the perfect breeding environment for house dust mites. Maintaining strict weekly de-hairing protocols across dog beds and upholstered chairs prevents allergic flare-ups for both pets and their owners.',
      },
    ],
    testimonials: [
      {
        quote: '“With three rescue cats and a Golden Retriever, we were spending $40 a month on sticky lint rollers. The reusable electrostatic roller paid for itself in two weeks and cleans our velvet sofa better than our $500 vacuum.”',
        authorName: 'Danielle Brooks',
        authorRole: 'Multi-Pet Parent, East Memphis',
        avatarUrl: '/images/avatar_sarah_pet_parent_1791411057259.jpg',
        storyLinkText: 'Read Danielle’s household review ↗',
      },
      {
        quote: '“Using the silicone grooming mitt on our German Shepherd during TV time has become our evening ritual. He thinks he’s getting a massage, and I get a fistful of loose hair that would otherwise be on our carpet.”',
        authorName: 'Robert Langston',
        authorRole: 'German Shepherd Parent, Arlington TN',
        avatarUrl: '/images/avatar_marcus_pet_parent_1791411068889.jpg',
        storyLinkText: 'See Robert’s grooming routine ↗',
      },
    ],
  },

  'grooming-wipes': {
    kicker: 'Hypoallergenic Hygiene & Barrier Defense',
    heroTitle: 'Grooming Wipes: Hypoallergenic Eye, Paw & Skin Fold Cleansing',
    heroSubheadline: 'Veterinarian-formulated moist wipes enriched with chlorhexidine, aloe, and chamomile to eliminate allergens, tear stains, and interdigital yeast.',
    introSummary: 'Full immersion baths should generally occur every 2 to 4 weeks to avoid stripping natural coat oils. However, daily exposure to outdoor allergens, mud, fecal trace matter, and ocular discharge requires gentle daily spot cleansing. High-grade grooming wipes provide textured botanical cleansing without harsh alcohols, safe for sensitive eye margins, wrinkled facial folds in bulldogs, and dirty paws coming inside from wet Mid-South yards.',
    takeaways: [
      {
        icon: 'shield',
        title: 'Alcohol-Free Medical Formulation',
        items: [
          { highlight: 'Zero sting alcohol-free liquid', text: 'protects delicate mucous membranes around eyes, noses, and genital areas.' },
          { highlight: 'Chlorhexidine gluconate active', text: 'suppresses yeast and bacterial colonization in skin folds and paw pads.' },
          { highlight: 'Enzymatic tear-stain removers', text: 'breaks down iron-rich porphyrin pigments in feline and canine tears.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Durable Textured Cloth Matrix',
        items: [
          { highlight: 'Extra-thick plant-based viscose', text: 'resists tearing against rough paw pads and thick canine claws.' },
          { highlight: 'Embossed honeycomb texture', text: 'traps red clay dirt, pollen granules, and dried mucous in a single swipe.' },
          { highlight: 'Air-tight moisture seal flip lid', text: 'prevents wipes from drying out in car glove compartments or entryways.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Daily Preventative Care',
        items: [
          { highlight: 'Post-walk paw wipe protocol', text: 'eliminates pesticide residue, street oils, and lawn fertilizer chemicals.' },
          { highlight: 'Brachycephalic wrinkle care', text: 'cleans deep skin folds in Bulldogs, Pugs, and Frenchies to prevent intertrigo.' },
          { highlight: 'Dander & odor neutralization', text: 'freshens fur between salon appointments without water mess.' },
        ],
      },
    ],
    sections: [
      {
        id: 'why-not-baby-wipes',
        title: '1. Why Human Baby Wipes Harm Pets: The pH Equation',
        content: 'Human baby wipes are formulated for an acidic skin barrier (pH 5.5) and frequently contain fragrance additives that irritate pet noses. When applied to pets, human wipes disrupt the alkaline stratum corneum and cause micro-fissuring. Dedicated pet grooming wipes are calibrated to pH 7.0, contain zero bitter chemicals that cause illness if licked, and feature safe natural botanical antimicrobials.',
        tips: [
          'Never use wipes inside the internal ear canal: wipes are strictly designed for the external pinna ear flap and external folds.',
          'Always reseal the flip-top lid firmly to keep the plant-based moisturizing solution active.',
          'Dispose of wipes in household trash: never flush pet wipes into municipal sewer pipes.',
        ],
        callout: {
          type: 'pro-tip',
          title: 'Veterinary Dermatology Note',
          text: 'Porphyrin in pet tears causes rust-colored staining around the eyes when exposed to light. Daily cleaning with an enzymatic wipe prevents this iron compound from chemically bonding to the keratin of white fur.',
        },
      },
      {
        id: 'wipe-formulation-matrix',
        title: '2. Clinical Wipe Formulation Matrix',
        content: 'Select the appropriate wipe formulation based on your pet’s specific anatomical needs.',
        tableData: {
          headers: ['Target Anatomical Zone', 'Key Active Ingredients', 'Primary Preventative Goal', 'Recommended Usage'],
          rows: [
            ['Facial Folds & Wrinkles (Bulldogs/Pugs)', 'Chlorhexidine 0.2%, Ketoconazole, Aloe', 'Prevents moisture-loving yeast intertrigo', 'Twice daily'],
            ['Tear Stains & Eye Margins', 'Chamomile, Euphrasia (Eyebright), Coconut water', 'Breaks down rust porphyrin deposits gently', 'Daily every morning'],
            ['Paws & Footpads', 'Witch hazel, Tea tree (micro-dose), Vitamin E', 'Removes lawn fertilizers, road salts, allergens', 'After every outdoor walk'],
            ['Full Body Deodorizing', 'Enzymatic bio-cleansers, lavender, oatmeal', 'Eliminates damp dog odor between bath sessions', '2 to 3 times weekly'],
          ],
        },
      },
      {
        id: 'step-by-step-wipe-protocol',
        title: '3. Step-by-Step Daily Hygiene Routine',
        content: 'Keep your pet clean and comfortable with this fast 2-minute daily wipe routine:',
        tips: [
          'Step 1: Eye and Facial Scan. Take a clean wipe and gently sweep downward from the inner corner of the eye along the muzzle, clearing tear crusts.',
          'Step 2: Clean Skin Folds. Gently separate nasal and facial skin folds, wiping away trapped moisture and dark debris: follow with a dry tissue to keep folds dry.',
          'Step 3: Clean All Four Paws. Wipe top of paw, between every digit, and underneath the central pad to lift red clay soil and grass pollen.',
          'Step 4: Sanitary Swipe. Conclude with a clean wipe beneath the tail and around sanitary areas to maintain complete indoor hygiene.',
        ],
      },
      {
        id: 'midsouth-allergy-pollen',
        title: '4. Memphis Grass Pollen & Red Mud Defense',
        content: 'In Memphis, wet spring soils and high Bermuda grass pollen stick to canine paw pads. When dogs lick their paws to clean them, they ingest these concentrated allergens, triggering gastrointestinal distress and chronic paw pododermatitis. A 30-second paw wipe at your front door eliminates this entire allergen intake pathway.',
      },
    ],
    testimonials: [
      {
        quote: '“Our English Bulldog used to suffer from red, smelly nose wrinkles every summer. Cleaning his folds daily with these veterinary wipes cleared up the irritation completely.”',
        authorName: 'Greg & Lisa Sterling',
        authorRole: 'English Bulldog Parents, Germantown TN',
        avatarUrl: '/images/avatar_marcus_pet_parent_1791411068889.jpg',
        storyLinkText: 'Read the Sterlings’ bulldog care review ↗',
      },
      {
        quote: '“Keeping a pack of grooming wipes by our front door stopped muddy red clay paw prints in our house and cured our golden retriever’s chronic paw licking.”',
        authorName: 'Claire Patterson',
        authorRole: 'Pet Parent, Midtown Memphis',
        avatarUrl: '/images/avatar_sarah_pet_parent_1791411057259.jpg',
        storyLinkText: 'View Claire’s paw hygiene tips ↗',
      },
    ],
  },

  'electric-clippers-and-blades': {
    kicker: 'Motor Engineering & Thermal Blade Safety',
    heroTitle: 'Electric Clippers & Blades: Cool-Running Ceramic & Steel #10/#7/#30',
    heroSubheadline: 'Professional rotary motor clippers and snap-on A5 detachable blades engineered for low vibration, cool operation, and zero thermal burns.',
    introSummary: 'Clipping a dog or cat requires an electric motor capable of powering through dense, fibrous coats without bogging down, pulling hair, or overheating. Standard human hair clippers operate at high friction speeds that heat steel blades to over 130°F in under five minutes, hot enough to cause severe thermal burns on thin canine skin. Professional animal clippers utilize brushless rotary motors paired with heat-resistant titanium-ceramic detachable blades.',
    takeaways: [
      {
        icon: 'shield',
        title: 'Thermal Burn Prevention',
        items: [
          { highlight: 'Ceramic edge cutting blades', text: 'run up to 75% cooler than traditional high-carbon steel blades.' },
          { highlight: 'Active blade-temperature monitoring', text: 'touch blade to inner wrist every 3 minutes to verify cool comfort.' },
          { highlight: 'Coolant and lubricant sprays', text: 'dissipates thermal friction and flushes trapped hair in seconds.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Motor Engineering & Low Noise',
        items: [
          { highlight: 'Brushless rotary motor', text: 'delivers continuous torque without loud high-pitched whines that terrify pets.' },
          { highlight: 'Sub-60 decibel operation', text: 'enables low-stress grooming for nervous rescues, puppies, and cats.' },
          { highlight: 'Universal A5 detachable blade drive', text: 'compatible with all standard veterinary and salon blade sizes.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Blade Sizing & Cut Lengths',
        items: [
          { highlight: '#10 blade (1.5mm safety standard)', text: 'mandatory for sanitary zones, paw pads, and sensitive groin skin.' },
          { highlight: '#7F blade (3.2mm summer cut)', text: 'provides smooth body clipping without exposing pink skin to sunburn.' },
          { highlight: 'Stainless steel guard combs', text: 'glide through clean coats to create fluffy 0.5-inch to 1-inch teddy bear styles.' },
        ],
      },
    ],
    sections: [
      {
        id: 'clipper-burn-dangers',
        title: '1. The Anatomy of Clipper Burn: How to Protect Thin Skin',
        content: 'Clipper burn is not caused by the sharp edge of the blade: it is a thermal friction burn combined with micro-abrasion from a dry, vibrating blade. Because dogs have thin skin (3 to 5 cells deep), heated metal rapidly causes erythema, blistering, and severe post-grooming licking. Utilizing ceramic cutting edges and cycling between two blades during long sessions prevents thermal buildup entirely.',
        tips: [
          'Always test the blade against your inner wrist every 3 to 4 minutes: if it feels warm to you, it feels burning hot to your pet.',
          'Never clip a dirty, sandy coat: grit dulls blades in seconds and creates painful hair pulling.',
          'Always clip with the blade flat against the skin: never tilt the teeth into the flesh at an angle.',
        ],
        callout: {
          type: 'pro-tip',
          title: 'Master Groomer Safety Rule',
          text: 'The #10 blade is universally recognized as the safe medical blade. For home parents clipping sanitary areas, armpits, and paw pads, NEVER use a blade shorter than a #10. Blades shorter than #10 (#15, #30, #40) are strictly for surgical prep.',
        },
      },
      {
        id: 'blade-length-matrix',
        title: '2. Professional A5 Blade Length Matrix',
        content: 'Understand exact cut lengths, safety ratings, and intended anatomical zones for each standard blade.',
        tableData: {
          headers: ['Blade Number', 'Cut Length', 'Safety Level', 'Intended Anatomical Zone'],
          rows: [
            ['#10 Blade', '1.5 mm (1/16 inch)', 'Maximum Safety (Medical standard)', 'Sanitary areas, groin, paw pads, ear tips, matted felts'],
            ['#7F Blade', '3.2 mm (1/8 inch)', 'High (Smooth finish)', 'Summer body clip for sporting and mixed breeds'],
            ['#5F Blade', '6.3 mm (1/4 inch)', 'High (Plush velvet finish)', 'Body coat for spaniels, terriers, and doodles'],
            ['#4F Blade', '9.5 mm (3/8 inch)', 'Moderate (Requires brush prep)', 'Fluffy plush winter cut: coat must be 100% mat-free'],
            ['Snap-On Comb Set', '13 mm to 25 mm (1/2" to 1")', 'Maximum (Safety guard barrier)', 'Teddy bear fluffy styles over #30 or #10 blade'],
          ],
        },
      },
      {
        id: 'step-by-step-clipping',
        title: '3. Step-by-Step Low-Stress Home Clipping Workflow',
        content: 'Follow this methodical workflow for safe, even clipping at home:',
        tips: [
          'Step 1: Bathe, Dry, and Thoroughly Dematt. Clippers cannot cut through knotted, damp, or greasy hair without pulling. Coat must be 100% clean and dry.',
          'Step 2: Lubricate and Inspect. Apply 2 drops of clipper oil across the blade teeth and run the motor for 10 seconds to distribute before touching the pet.',
          'Step 3: Lay the Blade Flat. Hold the clipper like a pencil with the blade flat against the skin, gliding smoothly in the direction of hair growth.',
          'Step 4: Constant Temperature Checks. Touch the back of the metal blade to your inner forearm every few minutes: swap blades or use coolant spray if warm.',
        ],
      },
      {
        id: 'midsouth-humidity-sanitation',
        title: '4. Memphis Summer Humidity and Sanitary Hygiene Cuts',
        content: 'In the high heat indices of Mid-South summers, long hair around the hindquarters and lower abdomen traps urine and fecal moisture, attracting flies and leading to painful summer maggot infestation (myiasis) and severe contact scald. Performing regular sanitary touchups with a cool #10 blade prevents these medical emergencies.',
      },
    ],
    testimonials: [
      {
        quote: '“Learning to do sanitary touchups on our elderly Golden Doodle at home saved us so much stress. The low-noise cordless clippers with ceramic blades stay cool and never scare him.”',
        authorName: 'Patricia & Keith Miller',
        authorRole: 'Senior Pet Parents, Germantown TN',
        avatarUrl: '/images/avatar_sarah_pet_parent_1791411057259.jpg',
        storyLinkText: 'Read Patricia’s clipper review ↗',
      },
      {
        quote: '“I teach all new pet parents: clippers must be cooled constantly. Buying a spare ceramic blade to alternate back and forth makes home clipping completely safe and painless.”',
        authorName: 'Marcus Bell',
        authorRole: 'Shelby County Animal Rescue Volunteer',
        avatarUrl: '/images/avatar_marcus_pet_parent_1791411068889.jpg',
        storyLinkText: 'Learn animal rescue grooming ↗',
      },
    ],
  },

  'deodorizers': {
    kicker: 'Enzymatic Odor Elimination & Fur Freshening',
    heroTitle: 'Deodorizers: Enzymatic Fur Sprays & Odor Neutralizers',
    heroSubheadline: 'Professional bio-enzymatic coat refreshers that chemically neutralize lipid oxidation odors without stripping moisture or overwhelming sensitive pet olfaction.',
    introSummary: 'A dog’s sense of smell is up to 100,000 times more sensitive than a human’s. Heavy artificial perfumes and grocery-store pet sprays mask odors temporarily while assaulting your pet’s olfactory receptors and triggering sneezing and distress. High-performance veterinary deodorizers utilize bio-enzymatic catalysts and zinc ricinoleate to encapsulate and chemically dismantle volatile organic compounds (damp fur smell, bacterial sebum breakdown) at the molecular level.',
    takeaways: [
      {
        icon: 'shield',
        title: 'Enzymatic Neutralization Chemistry',
        items: [
          { highlight: 'Zinc ricinoleate molecular trap', text: 'chemically binds odor-causing sulfur and nitrogen compounds permanently.' },
          { highlight: 'Zero heavy synthetic perfumes', text: 'prevents olfactory sensory overload and respiratory distress in pets.' },
          { highlight: 'Alcohol-free conditioning base', text: 'adds shine and hydration without drying out skin or hair shafts.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Microbiome-Safe Formulation',
        items: [
          { highlight: 'Probiotic bio-enzymes', text: 'outcompetes odor-producing bacteria on the skin surface naturally.' },
          { highlight: 'Botanical chamomile and green tea', text: 'provides subtle, natural botanical freshness that dissipates cleanly.' },
          { highlight: 'Anti-static conditioning agents', text: 'prevents airborne dust and dander from clinging to the coat.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Safe Multi-Surface Versatility',
        items: [
          { highlight: 'Safe on pet fur and bedding', text: 'freshens dog beds, car seats, and carpets without leaving sticky residues.' },
          { highlight: 'Lick-safe non-toxic ingredients', text: 'contains zero essential oils toxic to dogs or cats upon grooming ingestion.' },
          { highlight: 'Ultra-fine micro-mist nozzle', text: 'distributes light droplets evenly without soaking or chilling the pet.' },
        ],
      },
    ],
    sections: [
      {
        id: 'olfactory-sensitivity-science',
        title: '1. Pet Olfactory Science: Why Masking Perfumes Are Harmful',
        content: 'Dogs possess over 300 million olfactory receptors compared to a human 6 million. When heavily perfumed cologne sprays are misted over a dog, they live in a cloud of intense sensory stimulation that causes disorientation and frantic rolling in grass or dirt to mask the smell. True professional deodorizers do not mask: they chemically bond with odor molecules to neutralize them, leaving a clean, neutral scent that respects your pet’s nose.',
        tips: [
          'Never spray deodorizers directly into your pet’s face, eyes, or open ears.',
          'Mist the spray onto your brush or hands first, then brush through the coat for gentle, even distribution.',
          'If a foul odor persists within 24 hours of bathing, consult your vet: persistent stench often indicates ear infections or anal gland impaction.',
        ],
        callout: {
          type: 'pro-tip',
          title: 'Veterinary Odor Warning',
          text: 'The classic corn chip or wet towel smell is typically caused by natural cutaneous yeast (Malassezia) or bacterial folliculitis. If deodorizer does not alleviate the odor, the condition requires a therapeutic medicated wash, not cosmetic sprays.',
        },
      },
      {
        id: 'deodorizer-chemistry-matrix',
        title: '2. Deodorizer Chemistry Matrix: How Different Formulas Work',
        content: 'Compare the molecular mechanisms of modern pet deodorizing technology.',
        tableData: {
          headers: ['Deodorizer Type', 'Active Chemistry', 'Mechanism of Action', 'Safety for Pet Olfaction'],
          rows: [
            ['Zinc Ricinoleate Spray', 'Zinc salt of ricinoleic acid', 'Chemically traps and encapsulates volatile fatty acid molecules', '100% Safe (Non-perfumed)'],
            ['Bio-Enzymatic Probiotic Spray', 'Live non-pathogenic bacterial enzymes', 'Digest protein and lipid wastes that odor bacteria feed on', '100% Safe & long-lasting'],
            ['Colloidal Silver / Botanical Mist', 'Sub-micron silver + aloe vera', 'Suppresses surface odor-causing microbial growth', 'Safe (Mild antimicrobial)'],
            ['Aerosol Perfume Masker', 'Synthetic alcohol fragrance esters', 'Overpowers odor with heavy artificial perfume molecules', 'Not Recommended (Sensory irritation)'],
          ],
        },
      },
      {
        id: 'step-by-step-deodorizing',
        title: '3. Step-by-Step Refreshing Protocol Between Baths',
        content: 'Keep your pet smelling fresh between monthly salon visits with this 3-step sequence:',
        tips: [
          'Step 1: Thorough Dry Brushing. Always brush out dead, shed hair first: trapped dead undercoat is the primary reservoir for oxidized sebum odors.',
          'Step 2: Mist the Brush or Coat. Hold the bottle 12 inches away and apply 2 to 3 light spritzes down the backline, or mist directly onto a slicker brush.',
          'Step 3: Brush In Thoroughly. Work the botanical enzymes through the coat down to the skin barrier: allow to air-dry for 60 seconds.',
        ],
      },
      {
        id: 'midsouth-humidity-dog-odor',
        title: '4. Memphis Summer Humidity and Wet Dog Smell',
        content: 'During humid Tennessee summers, moisture in the air hydrates natural cutaneous lipid secretions, accelerating the release of volatile organic fatty acids. Enzymatic deodorizing sprays applied after outdoor excursions keep pets fresh without requiring frequent baths that could strip essential skin moisture.',
      },
    ],
    testimonials: [
      {
        quote: '“Our Labrador loves swimming in local lakes. This enzymatic deodorizer completely neutralizes the swampy pond odor without any heavy fake perfume. Our house stays clean and fresh.”',
        authorName: 'Brad & Ashley Turner',
        authorRole: 'Labrador Parents, Collierville TN',
        avatarUrl: '/images/avatar_marcus_pet_parent_1791411068889.jpg',
        storyLinkText: 'Read the Turners’ review ↗',
      },
    ],
  },

  'dematting-tools': {
    kicker: 'Pain-Free Mat Extraction & Coat Restoration',
    heroTitle: 'Dematting Tools: Safety Splitters, Undercoat Hooks & Mat Rakes',
    heroSubheadline: 'Specialized stainless steel wave-blade splitters and detangling rakes designed to dissolve stubborn mats without slicing skin or shaving coats.',
    introSummary: 'Mats are not merely cosmetic imperfections: they are painful, tightening tangles that pull on delicate skin, restrict blood circulation, and trap moisture to form weeping hot spots. Attempting to pull mats out with a standard slicker brush causes agonizing follicle trauma, while cutting with kitchen scissors risks severe skin lacerations. Specialized dematting tools feature razor-sharp inner wave blades protected by smooth, blunt outer tips to split dense felts safely.',
    takeaways: [
      {
        icon: 'shield',
        title: 'Safety Wave-Blade Engineering',
        items: [
          { highlight: 'Shielded rounded blunt tips', text: 'prevents sharp blade edges from ever contacting the pet’s dermis.' },
          { highlight: 'Sharp inner serrated cutting edges', text: 'slices tough tangles into manageable ribbons with minimal traction.' },
          { highlight: 'Reversible left/right hand thumb rest', text: 'provides maximum mechanical leverage and cutting control.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Mat Anatomy & Split Mechanics',
        items: [
          { highlight: 'Splits rather than rips', text: 'preserves the majority of coat length while untangling dense cores.' },
          { highlight: 'Targeted knot hooks', text: 'isolates individual friction mats behind ears and in armpit friction zones.' },
          { highlight: 'Conditioning spray synergy', text: 'combines with silicone detanglers to lubricate hair shafts for easy glide.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Clinical Triage Thresholds',
        items: [
          { highlight: 'Identifies non-salvageable felts', text: 'recognizes when solid pelted coats require humane shaving rather than dematting.' },
          { highlight: 'Zero prolonged pain sessions', text: 'limits home dematting to 15-minute intervals to protect pet emotional trust.' },
          { highlight: 'Prevents hematomas', text: 'gentle release prevents ear tip blood pooling common with aggressive brushing.' },
        ],
      },
    ],
    sections: [
      {
        id: 'anatomy-of-a-mat',
        title: '1. Anatomy of a Mat: How Friction Creates Tight Felts',
        content: 'Mats begin at friction points: behind the ears from head shaking, inside the armpits and groin from leg movement, and around the neck from collars and harnesses. Friction binds loose shed undercoat with live guard hairs. As moisture from rain, humidity, or saliva is introduced, the hair cuticle scales interlock like microscopic Velcro, tightening the knot closer to the skin until it forms an impenetrable felt.',
        tips: [
          'Never dematt a wet coat: water acts as a binding agent that tightens existing mats into solid felt.',
          'Always saturate the knot with a professional silicone detangling leave-in spray prior to tool work.',
          'Hold the base of the hair knot tightly against the skin with your fingers to absorb the pulling force so your dog feels zero pain.',
        ],
        callout: {
          type: 'pro-tip',
          title: 'Veterinary Ethics Guideline',
          text: 'If a mat cannot be separated by gently inserting your finger between the knot and the skin, it is pelted. Attempting to brush out pelted mats causes immense pain and bruising. In such cases, the only humane medical solution is a safe #10 shave-down under professional veterinary care.',
        },
      },
      {
        id: 'dematting-tool-matrix',
        title: '2. Professional Dematting Hardware Matrix',
        content: 'Select the appropriate dematting instrument based on the size and location of the coat tangle.',
        tableData: {
          headers: ['Tool Type', 'Blade Architecture', 'Best Application Zone', 'Pain Prevention Method'],
          rows: [
            ['Wave-Blade Dematting Rake (9-12 blades)', 'Curved stainless blades with razor inner edge, blunt tip', 'Large body mats on thighs, flanks, and ribcage', 'Slices mat into vertical ribbons for slicker brush removal'],
            ['Single-Blade Safety Mat Splitter', 'Single guarded hook blade, compact handle', 'High-friction ear crevices, collar rub lines', 'Precision slicing of tight single knots without disturbing adjacent coat'],
            ['Long-Pin Firm Slicker Brush', 'Reinforced bent wire pins in firm rubber pad', 'Post-split brushing to remove loosened knot debris', 'Use line brushing technique with light pressure'],
            ['Metal Greyhound Finishing Comb', 'Dual-spaced solid brass tines', 'Final verification test for remaining tangles', 'Glides through to ensure zero hidden knots remain'],
          ],
        },
      },
      {
        id: 'step-by-step-dematting',
        title: '3. Step-by-Step Pain-Free Dematting Workflow',
        content: 'Execute this safe 4-step sequence to dissolve mats without hurting your pet:',
        tips: [
          'Step 1: Saturate with Detangler. Spray leave-in detangler spray directly into the center of the knot and massage with your fingers for 2 minutes to lubricate hair shafts.',
          'Step 2: Anchor the Root. Grasp the hair firmly between the knot and the skin with your thumb and index finger to absorb all mechanical tension.',
          'Step 3: Gentle Picking Motion. Work the dematting rake into the outer edge of the knot using short, picking wrist motions: never pull straight through like a comb.',
          'Step 4: Line Brush the Remnants. Once the mat is split into thin ribbons, gently brush out the loose undercoat with your slicker brush and verify with a comb.',
        ],
      },
      {
        id: 'midsouth-humidity-matting',
        title: '4. Mid-South Humidity & Doodle Matting Accelerators',
        content: 'The combination of outdoor humidity, morning dew on lawns, and cottony doodle coats in Shelby County creates severe matting accelerators. Pet parents who dry-brush their dogs for just 5 minutes daily using proper line-brushing techniques save hundreds of dollars in salon dematting fees and keep their pets comfortable year-round.',
      },
    ],
    testimonials: [
      {
        quote: '“Our Goldendoodle used to get terrible mats behind his ears where his harness rubs. The wave-blade dematting tool splits the knots in seconds without pulling his skin. He doesn’t mind it at all!”',
        authorName: 'Melanie Foster',
        authorRole: 'Goldendoodle Parent, Germantown TN',
        avatarUrl: '/images/avatar_sarah_pet_parent_1791411057259.jpg',
        storyLinkText: 'Read Melanie’s doodle care tips ↗',
      },
      {
        quote: '“As a master groomer, I always demonstrate the anchoring technique: hold the base of the hair with your fingers so the dog feels zero pull. With the right dematting rake, home mat maintenance is safe and humane.”',
        authorName: 'Jessica Taylor',
        authorRole: 'Lead Stylist, All About Pawz Salon',
        avatarUrl: '/images/avatar_marcus_pet_parent_1791411068889.jpg',
        storyLinkText: 'View video dematting guide ↗',
      },
    ],
  },

  'medicated-shampoos': {
    kicker: 'Therapeutic Dermatology & Topical Pharmacology',
    heroTitle: 'Medicated Shampoos: Chlorhexidine, Ketoconazole & Pramoxine Protocols',
    heroSubheadline: 'Clinical-strength antibacterial, antifungal, and anti-pruritic medicated formulations to treat yeast dermatitis, pyoderma, and acute seasonal allergies.',
    introSummary: 'Cutaneous infections in pets are rarely isolated primary diseases: they are opportunistic secondary overgrowths triggered by allergic flare-ups, humidity, or compromised epidermal barriers. Systemic oral antibiotics and antifungals carry metabolic side effects and promote drug resistance. Topical medicated hydrotherapy using synergistic combinations of 2% to 4% chlorhexidine gluconate and 1% ketoconazole directly sterilizes the cutaneous barrier while pramoxine hydrochloride arrests intense itching on contact.',
    takeaways: [
      {
        icon: 'shield',
        title: 'Dual Antimicrobial Synergy',
        items: [
          { highlight: 'Chlorhexidine gluconate (2% to 4%)', text: 'destroys cell walls of Staphylococcus pseudintermedius bacteria.' },
          { highlight: 'Ketoconazole (1%) antifungal', text: 'eradicates stubborn Malassezia pachydermatis yeast colonies.' },
          { highlight: 'Non-absorptive topical delivery', text: 'acts locally on the skin surface without hepatic or renal metabolic strain.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Pruritus Interruption',
        items: [
          { highlight: 'Pramoxine hydrochloride (1%)', text: 'stabilizes neuronal membranes to block the itch-scratch-damage cycle.' },
          { highlight: 'Essential fatty acid ceramides', text: 'restores the damaged epidermal lipid barrier after antiseptic cleansing.' },
          { highlight: 'Soap-free therapeutic base', text: 'cleanses purulent exudate and crusts without stinging raw inflamed tissue.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Critical Contact Timing',
        items: [
          { highlight: 'Mandatory 10-minute lather window', text: 'required for active pharmacological molecules to penetrate the follicle.' },
          { highlight: '2 to 3 times weekly therapeutic pulse', text: 'maintains antimicrobial pressure during acute clinical outbreaks.' },
          { highlight: 'Lukewarm water strictly required', text: 'hot water vasodilates capillaries and dramatically worsens inflammatory itching.' },
        ],
      },
    ],
    sections: [
      {
        id: 'pharmacology-of-actives',
        title: '1. Pharmacology of Medicated Actives: Chlorhexidine & Ketoconazole',
        content: 'Chlorhexidine is a cationic bisbiguanide antiseptic that binds to the negatively charged cell walls of bacteria, causing osmotic lysis and rapid cellular death. Ketoconazole is an imidazole antifungal that inhibits fungal ergosterol biosynthesis, halting the proliferation of Malassezia yeast. Combined, they create a potent synergistic broad-spectrum antimicrobial wash that resolves over 85% of superficial canine pyoderma and yeast dermatitis cases.',
        tips: [
          'A medicated wash must remain on the skin for a full 10 minutes before rinsing: rinsing early washes the medicine down the drain before it works.',
          'Never use hot water on an itchy dog: warm or hot water causes histaminergic vasodilation that intensifies itching.',
          'Do not apply medicated shampoo directly into open deep puncture wounds or around the eyes.',
        ],
        callout: {
          type: 'pro-tip',
          title: 'Veterinary Dermatology Protocol',
          text: 'The 10-minute timer is non-negotiable. Use a phone timer. Spend the 10 minutes gently massaging the shampoo into the armpits, groin, belly, and paws, rewarding calm behavior with hypoallergenic treats.',
        },
      },
      {
        id: 'medicated-shampoo-matrix',
        title: '2. Clinical Medicated Active Comparison Matrix',
        content: 'Understand the distinct indications and pharmacological properties of common veterinary shampoos.',
        tableData: {
          headers: ['Active Formulation', 'Primary Target Pathogen', 'Key Clinical Signs', 'Treatment Protocol'],
          rows: [
            ['Chlorhexidine 4% + Ketoconazole 1%', 'Mixed bacterial pyoderma & Malassezia yeast', 'Greasy rust coat, pungent frito/corn chip smell, red pustules', 'Bathe 2-3x weekly for 3 weeks, then weekly maintenance'],
            ['Pramoxine HCl 1% + Colloidal Oatmeal', 'Non-infectious allergic pruritus & hives', 'Intense frantic scratching, generalized erythema, zero crusts', 'Bathe 1-2x weekly as needed for acute comfort'],
            ['Benzoyl Peroxide 2.5%', 'Deep follicular flushing & canine acne', 'Black comedones on chin, stud tail, deep folliculitis', 'Apply locally, avoid eyes (bleaches colored fabrics)'],
            ['Phytosphingosine / Ceramides', 'Damaged epidermal barrier & atopic dermatitis', 'Flaky dry dandruff, dull brittle coat, recurring infections', 'Apply bi-weekly as long-term restorative therapy'],
          ],
        },
      },
      {
        id: 'step-by-step-medicated-bath',
        title: '3. Step-by-Step Clinical Medicated Bathing Protocol',
        content: 'Execute this exact therapeutic sequence recommended by veterinary dermatologists:',
        tips: [
          'Step 1: Thorough Lukewarm Rinse. Wet the pet entirely with lukewarm water (never warm or hot) to open the coat without causing capillary flushing.',
          'Step 2: Apply to Most Affected Areas First. Apply medicated lather directly to the worst spots (groin, armpits, paws, ventral abdomen) before lathering the back.',
          'Step 3: Start the 10-Minute Timer. Keep the pet occupied with a lick mat or gentle massage for a full 10 minutes of active skin contact.',
          'Step 4: Complete Freshwater Rinse. Rinse thoroughly with cool-to-lukewarm water for at least 5 minutes: leaving medicated residue can cause secondary drying.',
        ],
      },
      {
        id: 'midsouth-yeast-dermatitis',
        title: '4. The Mid-South Summer Yeast Epidemic (Shelby County, TN)',
        content: 'In Memphis, July and August combine 95°F heat with 80% relative humidity. This climate creates an incubator for Malassezia pachydermatis yeast on canine skin. Pets develop greasy skin folds, intense paw chewing, and a pungent sweet-corn odor. Initiating a bi-weekly chlorhexidine-ketoconazole protocol at the first sign of summer redness prevents costly emergency veterinary visits.',
      },
    ],
    testimonials: [
      {
        quote: '“Our pit bull suffered from chronic red belly rash and stinky yeast paws every August. Our vet recommended the chlorhexidine-ketoconazole wash with the 10-minute timer. By the second week, his skin was calm and completely healed.”',
        authorName: 'Devon & Maria Washington',
        authorRole: 'Pit Bull Parents, Southwind Memphis',
        avatarUrl: '/images/avatar_marcus_pet_parent_1791411068889.jpg',
        storyLinkText: 'Read Devon’s healing story ↗',
      },
    ],
  },
};
