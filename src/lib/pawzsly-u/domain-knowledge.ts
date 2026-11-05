import { ArticleSection, TakeawayItem, RelatedProductItem, FaqItem, TestimonialItem } from './types';

export interface DomainProfile {
  kicker?: string;
  heroTitle?: string;
  heroSubheadline?: string;
  introSummary?: string;
  takeaways?: TakeawayItem[];
  sections?: ArticleSection[];
  relatedProducts?: RelatedProductItem[];
  faqs?: FaqItem[];
  testimonials?: TestimonialItem[];
}

// Specialized profiles for key pillars
export const DOMAIN_PROFILES: Record<string, Partial<DomainProfile>> = {
  // Breed Grooming
  'labrador-retriever-grooming': {
    kicker: 'Double-Coat Water Dog Protocol',
    heroTitle: 'Labrador Retriever Coat Care & Deshedding Guide',
    heroSubheadline: 'Preserve your Lab’s water-repellent guard hairs, manage seasonal shedding blowout, and prevent Mid-South ear yeast infections with salon-grade care.',
    introSummary: 'Labrador Retrievers have a dense, weather-resistant double coat designed to repel icy water. However, during humid summers and active swimming sessions, dead undercoat becomes trapped against the skin, locking in moisture. This complete guide details the correct deshedding protocols, bathing cadences, and ear flushes to keep your Lab sleek and odor-free.',
    takeaways: [
      {
        icon: 'scissors',
        title: 'Undercoat Deshedding',
        items: [
          { highlight: 'Undercoat rake routine', text: 'using 1/2-inch stainless steel pins to remove dead downy hair without cutting top guard hairs.' },
          { highlight: 'High-velocity blow drying', text: 'blasts loose follicles from root to tip after every bath before brushing begins.' },
          { highlight: 'Rubber curry stimulation', text: 'increases skin blood flow and distributes natural sebum oils across the short jacket.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Otitis & Ear Defense',
        items: [
          { highlight: 'Post-swim drying flushes', text: 'evaporate trapped canal moisture within 15 minutes of water exposure.' },
          { highlight: 'Drop-ear aeration checks', text: 'prevent dark, warm breeding grounds for Malassezia yeast overgrowth.' },
          { highlight: 'Antimicrobial cleaner', text: 'with drying agents (chlorhexidine & ketoconazole) recommended weekly.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Bathing Cadence',
        items: [
          { highlight: '6 to 8-week salon bath', text: 'protects natural hydrophobic skin oils from stripping detergent depletion.' },
          { highlight: 'Hypoallergenic botanical wash', text: 'soothes grass and red clay pollen contact dermatitis.' },
          { highlight: 'Otter tail sanitary trim', text: 'clears mud and burrs while maintaining the iconic breed silhouette.' },
        ],
      },
    ],
    sections: [
      {
        id: 'coat-anatomy',
        title: '1. The Labrador Double Coat: Guard Hairs vs. Soft Undercoat',
        content: 'A Lab’s coat consists of a harsh, oily topcoat that repels dirt and water, and a soft insulating undercoat. Shaving a Labrador is strictly contraindicated by veterinarians and master groomers: shaving destroys the thermal barrier, exposes delicate pale skin to solar sunburn and heat stroke, and frequently causes post-clipping alopecia where hair returns patchy or coarse.',
        tips: [
          'Never use electric clippers on a healthy Labrador body coat.',
          'Shedding spikes occur twice per year (spring thaw and fall freeze) when the undercoat blows in clumps.',
          'Daily brushing for 5 minutes during shedding seasons reduces indoor hair accumulation by up to 80%.',
        ],
        callout: {
          type: 'pro-tip',
          title: 'The High-Velocity Blowout Secret',
          text: 'Bath water loosens dead undercoat. At All About Pawz, we use commercial variable-speed blow dryers while the coat is damp to eject dead fur without mechanical friction.',
        },
      },
      {
        id: 'ear-care-midsouth',
        title: '2. Pendulous Ear Flaps & Memphis Humidity Risks',
        content: 'Because Labs love swimming and have heavy dropped ear flaps, air cannot circulate naturally inside the canal. In the Mid-South’s high heat index, moisture trapped behind the ear flap rapidly turns into yeast and bacterial otitis externa. Weekly inspection and veterinary drying flushes are essential preventive measures.',
        tableData: {
          headers: ['Symptom', 'Normal Ear', 'Mild Yeast', 'Active Infection (See Vet)'],
          rows: [
            ['Odor', 'Neutral / Clean', 'Sweet corn chip smell', 'Pungent sour discharge'],
            ['Color', 'Pale pink skin', 'Light brown waxy film', 'Dark coffee-ground debris or redness'],
            ['Behavior', 'Calm head carriage', 'Occasional ear flap shaking', 'Persistent head tilt, scratching, whimpering'],
            ['Action Plan', 'Routine monthly check', 'Clean with drying flush', 'Immediate veterinary cytology & medication'],
          ],
        },
      },
      {
        id: 'paw-and-nail',
        title: '3. Webbed Paws, Nail Grinding & Pad Conditioning',
        content: 'Labradors have webbed digits that collect red clay and burrs. Overgrown nails alter the angle of the metacarpal joints, causing arthritis in large dogs. Using a rotary diamond grinder smooths black nails back to the quick safely without crushing the sensitive vascular nerve.',
      },
    ],
  },

  'golden-retriever-grooming': {
    kicker: 'Feathered Coat & Furnishings Protocol',
    heroTitle: 'Golden Retriever Grooming, Feathering & Coat Care',
    heroSubheadline: 'Master feather scissoring, hot spot prevention, and shedding management for Mid-South Golden Retrievers with gentle master groomer techniques.',
    introSummary: 'Golden Retrievers are celebrated for their glorious golden furnishings along the chest, legs, and plume tail. In the Mid-South climate, however, dense golden coats easily trap heat, moisture, and burrs. This guide covers how to trim sanitary zones, line-brush heavy leg feathering, and protect against rapid-onset hot spots.',
    takeaways: [
      {
        icon: 'scissors',
        title: 'Feathering & Scissoring',
        items: [
          { highlight: 'Hand-scissored hocks & paws', text: 'trimmed neat to prevent slip hazards and dirt compaction.' },
          { highlight: 'Plume tail shaping', text: 'scissored into a classic inverted crescent curve that sweeps cleanly.' },
          { highlight: 'Chest & bib thinning', text: 'blended with 30-tooth thinning shears to preserve natural draping lines.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Hot Spot Prevention',
        items: [
          { highlight: 'Complete skin dry-down', text: 'high-velocity drying down to the root ensures zero damp spots remain.' },
          { highlight: 'Colloidal oatmeal wash', text: 'relieves acute itchiness from Mid-South Bermuda grass allergies.' },
          { highlight: 'Early lesion aeration', text: 'clears mats that incubate bacterial acute moist dermatitis.' },
        ],
      },
      {
        icon: 'clock',
        title: '4 to 6-Week Maintenance',
        items: [
          { highlight: 'Ear canal trimming', text: 'thins excessive fur inside the ear fold to enhance air circulation.' },
          { highlight: 'Sanitary hygiene cut', text: 'keeps private areas clean between outdoor park romps.' },
          { highlight: 'Diamond rotary nail grind', text: 'maintains balanced orthopedic posture on large retriever frames.' },
        ],
      },
    ],
    sections: [
      {
        id: 'brushing-feathering',
        title: '1. Brushing Strategy: Slicker, Undercoat Rake & Steel Comb',
        content: 'Golden Retrievers require three distinct grooming tools to maintain coat health: a curved long-pin slicker brush for surface debris, an undercoat rake with rotating pins to lift dead wool, and a metal greyhound comb to verify that high-friction feathering (behind ears and thighs) is 100% mat-free.',
        tips: [
          'Always comb behind the ears first: friction from collars causes hidden knots within 72 hours.',
          'Never clip a Golden Retriever short in summer; their double coat insulates them against ambient heat.',
          'Work from the skin outward in layers rather than brushing only the outer golden veil.',
        ],
      },
      {
        id: 'hot-spots-midsouth',
        title: '2. Acute Moist Dermatitis (Hot Spots) in Tennessee Heat',
        content: 'A hot spot can develop from a tiny scratch or flea bite into a painful 3-inch weeping wound in under 6 hours. High summer humidity in Memphis prevents moist fur from evaporating naturally. If your Golden is constantly licking or gnawing a patch of hair, inspect immediately under bright light.',
      },
    ],
  },

  'poodle-grooming': {
    kicker: 'Hypoallergenic Single-Coat Standards',
    heroTitle: 'Poodle Grooming: Precision Scissoring, Cuts & Ear Hygiene',
    heroSubheadline: 'Salon-grade grooming for Standard, Miniature, and Toy Poodles. Learn show clip vs utility clips, daily combing, and sensitive skin care.',
    introSummary: 'Unlike double-coated dogs that shed fur, Poodles have continuously growing hair. Shed hairs remain trapped inside the dense spiral curls, requiring professional scissoring every 4 to 6 weeks and rigorous home combing to avoid painful pelted matting.',
    takeaways: [
      {
        icon: 'scissors',
        title: 'Precision Scissoring',
        items: [
          { highlight: 'Japanese convex shears', text: 'create velvet-smooth cylindrical legs, rounded caps, and topknots.' },
          { highlight: 'Face, feet & sanitary clip', text: 'shaved with #10 or #15 blades for immaculate clean lines.' },
          { highlight: 'Fluff drying blowout', text: 'straightens curl structure completely prior to final hand scissoring.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Ear Canal Health',
        items: [
          { highlight: 'Gentle ear hair clearance', text: 'plucking or clipping hair growth deep in the canal to prevent blockages.' },
          { highlight: 'Drying antiseptic powder', text: 'absorbs canal moisture and provides grip for hygienic hair removal.' },
          { highlight: 'Chlorhexidine rinse', text: 'calms inflammation and kills opportunistic bacterial colonies.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Popular Salon Clips',
        items: [
          { highlight: 'Teddy Bear / Puppy Cut', text: 'uniform fluffy length over body with rounded face and soft ears.' },
          { highlight: 'Lamb Cut', text: 'short clean torso paired with fuller hand-scissored cylindrical legs.' },
          { highlight: 'Utility Summer Clip', text: 'close-cropped low-maintenance coat ideal for outdoor swimmers.' },
        ],
      },
    ],
    sections: [
      {
        id: 'fluff-drying',
        title: '1. The Foundation of Poodle Styling: Fluff Drying',
        content: 'You cannot scissor a curly Poodle coat accurately while curls are spiraled. At All About Pawz, every Poodle undergoes fluff drying: while warm air blows on the coat, our groomers continuously brush the hair straight with a slicker brush, creating a cloud of uniform fur that allows razor-sharp scissor sculpting.',
      },
      {
        id: 'cuts-comparison',
        title: '2. Comparing Popular Poodle Salon Haircuts',
        content: 'Choose a style that matches your home brushing commitment:',
        tableData: {
          headers: ['Clip Name', 'Torso Length', 'Leg Finish', 'Face Finish', 'Home Care Needed'],
          rows: [
            ['Puppy Cut', '1/2" to 3/4" uniform', 'Blended soft', 'Soft rounded or clean', 'Moderate (3x/week)'],
            ['Lamb Cut', '1/4" short', 'Full scissored columns', 'Clean shaved', 'Moderate (3x/week)'],
            ['Sporting / Retriever', '1/4" body jacket', 'Clean scissor blend', 'Clean shaved + topknot', 'Low (Weekly)'],
            ['Teddy Bear Cut', '3/4" fluffy', 'Fluffy straight', 'Round mustache & chin', 'High (Daily line comb)'],
          ],
        },
      },
    ],
  },

  'siberian-husky-grooming': {
    kicker: 'Arctic Undercoat Defense Protocol',
    heroTitle: 'Siberian Husky Grooming & Undercoat Deshedding',
    heroSubheadline: 'Why you must never shave a Siberian Husky, how to survive shedding blowout season, and salon blowouts for Mid-South heat.',
    introSummary: 'Siberian Huskies are built with a dense dual-layer coat that acts like household insulation: it keeps heat out during summer and warmth in during winter. Shaving a Husky ruins this thermal regulation and exposes them to heat stroke. Learn how to manage the seasonal coat blow cleanly.',
    takeaways: [
      {
        icon: 'shield',
        title: 'Never Shave a Husky',
        items: [
          { highlight: 'Thermal insulation barrier', text: 'protects against ambient solar radiation and summer heat stroke.' },
          { highlight: 'Post-clipping alopecia risk', text: 'guard hairs may never regrow properly, resulting in bald patches.' },
          { highlight: 'Mosquito & parasite guard', text: 'dense outer jacket prevents insect bites down to skin tissue.' },
        ],
      },
      {
        icon: 'scissors',
        title: 'Blow-Out Seasons',
        items: [
          { highlight: 'High-velocity air blowers', text: 'separate clumps of dead undercoat without pulling live skin.' },
          { highlight: 'Undercoat rakes with rotating teeth', text: 'lift dead wool gently during spring and autumn shed cycles.' },
          { highlight: 'Zero blade cutting', text: 'preserves the natural harsh guard coat from mechanical damage.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Mid-South Heat Care',
        items: [
          { highlight: 'Clean air circulation', text: 'a thoroughly deshedded coat allows breeze to cool the skin surface.' },
          { highlight: 'Paw pad tuft trimming', text: 'shaves excess hair between pads to allow sweat gland heat dissipation.' },
          { highlight: 'Hydrating coat mist', text: 'replenishes lipid barrier depleted by heavy indoor air conditioning.' },
        ],
      },
    ],
    sections: [
      {
        id: 'husky-coat-science',
        title: '1. The Science of the Husky Double Coat in Warm Climates',
        content: 'Many well-meaning pet parents think shaving a thick-coated Husky in a hot Memphis summer will make them cooler. In reality, it does the exact opposite: guard hairs reflect sunlight and undercoat traps pockets of cool air. Shaving strips away their natural cooling mechanism and leaves them vulnerable to sunburn, skin cancer, and heat exhaustion.',
      },
    ],
  },

  // Nutrition Guides
  '7-day-food-transition-guide': {
    kicker: 'Clinical Gastrointestinal Protocol',
    heroTitle: '7-Day Pet Food Transition Schedule & Gut Health Guide',
    heroSubheadline: 'Prevent vomiting, loose stool, and pancreatitis when switching your pet’s diet with a structured, veterinarian-reviewed schedule.',
    introSummary: 'Switching dog or cat food too rapidly is the number one cause of acute gastroenteritis and diarrhea in companion pets. A pet’s digestive tract contains trillions of specialized gut bacteria adapted to their specific current protein and carbohydrate sources. This clinical 7-day schedule allows the microbiome to adapt smoothly without stress.',
    takeaways: [
      {
        icon: 'clock',
        title: '7-Day Transition Schedule',
        items: [
          { highlight: 'Days 1 & 2 (75% Old / 25% New)', text: 'introduces novel protein antigens in low concentration.' },
          { highlight: 'Days 3 & 4 (50% Old / 50% New)', text: 'microbiome adjusts metabolic enzymes to new nutrient profile.' },
          { highlight: 'Days 5 & 6 (25% Old / 75% New)', text: 'monitors stool consistency and transit time before full switch.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Digestive Buffer Secrets',
        items: [
          { highlight: 'Pure pumpkin puree buffer', text: 'soluble fiber stabilizes water absorption in the large intestine.' },
          { highlight: 'Veterinary probiotics', text: 'Enterococcus faecium strains populate beneficial microflora.' },
          { highlight: 'Warm bone broth addition', text: 'stimulates appetite without adding heavy fats or excess sodium.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'When to Pause & Reset',
        items: [
          { highlight: 'Loose stool indicator', text: 'if stool becomes soft, hold current ratio for 48 hours before progressing.' },
          { highlight: 'Vomiting red flag', text: 'discontinue immediately if acute regurgitation or lethargy occurs.' },
          { highlight: 'Senior pet extension', text: 'stretch schedule to 14 days for geriatric pets with sensitive stomachs.' },
        ],
      },
    ],
    sections: [
      {
        id: 'transition-schedule-table',
        title: '1. The Daily Feeding Ratio Matrix',
        content: 'Measure meal portions precisely by weight or measuring cup throughout the week:',
        tableData: {
          headers: ['Timeline', 'Old Food Ratio', 'New Food Ratio', 'Recommended Digestive Buffer'],
          rows: [
            ['Days 1 - 2', '75%', '25%', '1 tbsp pumpkin puree'],
            ['Days 3 - 4', '50%', '50%', '1 dose daily probiotic powder'],
            ['Days 5 - 6', '25%', '75%', 'Warm water or bone broth topper'],
            ['Day 7 & Beyond', '0%', '100%', 'Monitor body condition score'],
          ],
        },
      },
      {
        id: 'why-abrupt-switches-fail',
        title: '2. The Microbiome Adaptation Period',
        content: 'Digestive enzymes take 5 to 7 days to adjust to shifts in fat content, fiber sources, and novel protein structures. When food is changed cold turkey, undigested proteins pass into the colon, drawing water and causing explosive osmotic diarrhea.',
      },
    ],
  },

  'puppy-diet-finder': {
    kicker: 'Skeletal Growth & Calorie Engine',
    heroTitle: 'Puppy Diet Finder: Growth Stages, Calories & Nutrients',
    heroSubheadline: 'Calculate exact caloric needs, calcium-to-phosphorus ratios, and DHA requirements for growing puppies from weaning to 12 months.',
    introSummary: 'Puppies require nearly twice the calories per pound of body weight compared to adult dogs to support rapid cellular division, bone mineralization, and neural development. However, overfeeding (especially in large and giant breeds) can cause irreversible skeletal deformities like hip dysplasia. This guide helps you choose the perfect nutritional profile.',
    takeaways: [
      {
        icon: 'clock',
        title: 'Nutritional Benchmarks',
        items: [
          { highlight: 'Minimum 22-28% protein', text: 'bioavailable animal meat building blocks for muscle and organ growth.' },
          { highlight: '1.2:1 Calcium-to-Phosphorus ratio', text: 'crucial balance preventing accelerated irregular bone growth.' },
          { highlight: 'Docosahexaenoic Acid (DHA)', text: 'supports cognitive trainability and retinal visual sharpness.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Feeding Frequency',
        items: [
          { highlight: '8 to 16 weeks old', text: '3 to 4 small measured meals daily to prevent hypoglycemia.' },
          { highlight: '4 to 6 months old', text: 'transition to 3 meals daily as stomach capacity expands.' },
          { highlight: '6 months to 1 year', text: 'stabilize on 2 meals daily with structured morning and evening timing.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Breed-Size Customization',
        items: [
          { highlight: 'Small breed kibble', text: 'nutrient-dense mini bites supporting fast resting metabolic rates.' },
          { highlight: 'Large breed formulas', text: 'calibrated energy density controlling growth velocity safely.' },
          { highlight: 'Fresh water access', text: 'essential for kidney function as dry kibble contains less than 10% water.' },
        ],
      },
    ],
    sections: [
      {
        id: 'growth-stages',
        title: '1. Feeding Ratios by Life Stage & Adult Target Weight',
        content: 'Small breeds finish skeletal growth around 9-10 months, whereas giant breeds (Great Danes, Newfoundlands) continue bone mineralization up to 18-24 months.',
      },
    ],
  },

  // Health & Local Guides
  'flea-tick-prevention-midsouth': {
    kicker: 'Mid-South Parasitology Defense',
    heroTitle: 'Flea & Tick Prevention in Memphis & Shelby County',
    heroSubheadline: 'Why the Mid-South’s mild winters require year-round preventative protocols against Lone Star ticks, deer ticks, and flea allergy dermatitis.',
    introSummary: 'Due to Memphis’s warm humid climate and proximity to the Mississippi River basin, parasite dormancy is practically non-existent. Fleas and ticks remain active year-round in leaf litter, crawlspaces, and wooded parks like Shelby Farms and Overton Park. Learn how to protect your pet effectively.',
    takeaways: [
      {
        icon: 'shield',
        title: 'Year-Round Protection',
        items: [
          { highlight: 'Zero winter breaks', text: 'temperatures above 40°F reactivate fleas and adult ticks within hours.' },
          { highlight: 'Oral Isoxazoline preventatives', text: 'kill parasites within 8 hours before pathogen transmission occurs.' },
          { highlight: 'Yard & perimeter management', text: 'clear tall brush, leaf piles, and standing water around pet play zones.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Mid-South Specific Vectors',
        items: [
          { highlight: 'Lone Star Tick prevalence', text: 'transmits Ehrlichiosis and causes acute allergic swelling.' },
          { highlight: 'American Dog Tick risk', text: 'primary regional carrier of Rocky Mountain Spotted Fever.' },
          { highlight: 'Flea Allergy Dermatitis (FAD)', text: 'a single flea bite triggers severe itching and self-mutilation.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Salon Inspection Protocols',
        items: [
          { highlight: 'Mandatory intake check', text: 'every salon guest is checked with a fine flea comb at check-in.' },
          { highlight: 'All-natural citrus baths', text: 'eradicates active parasites safely without harsh organophosphate poisons.' },
          { highlight: 'Salon sanitization cycles', text: 'hospital-grade flea knock-down sprays protect all client pets.' },
        ],
      },
    ],
    sections: [
      {
        id: 'tick-species',
        title: '1. Regional Tick Identification & Disease Risks',
        content: 'Tennessee is home to several dangerous tick species that affect canines and humans alike. Daily tick checks after outdoor romps in Shelby County parks can save your pet’s life.',
      },
    ],
  },

  'crate-sizing-guide': {
    kicker: 'Orthopedic Den Fitting Formula',
    heroTitle: 'Dog Crate Sizing: Measurement Formulas & Growth Dividers',
    heroSubheadline: 'How to calculate the exact crate dimensions for your dog, avoid house-training accidents, and select safe furniture-style or travel crates.',
    introSummary: 'A dog crate should be an inviting, secure bedroom, not a prison or an oversized playpen. If a crate is too small, your dog suffers musculoskeletal cramping; if it is too large, a puppy will sleep on one side and use the opposite corner as a bathroom. Use our proven sizing formula.',
    takeaways: [
      {
        icon: 'scissors',
        title: 'The Measurement Formula',
        items: [
          { highlight: 'Length: Nose to Tail Base + 4 inches', text: 'ensures full stretch when lying down flat.' },
          { highlight: 'Height: Floor to Ears + 3 inches', text: 'permits full comfortable standing and turning around.' },
          { highlight: 'Width: Shoulder to Shoulder + 4 inches', text: 'allows easy natural posture adjustments during sleep.' },
        ],
      },
      {
        icon: 'shield',
        title: 'Puppy Growth Dividers',
        items: [
          { highlight: 'Buy for adult size', text: 'select the crate for your dog’s projected full adult dimensions.' },
          { highlight: 'Use moveable divider panels', text: 'expand internal crate space gradually as the puppy matures.' },
          { highlight: 'Eliminate toilet corners', text: 'puppies instinctively avoid soiling their immediate bed space.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Crate Construction Types',
        items: [
          { highlight: 'Wire collapsible crates', text: 'best for maximum ventilation in warm Mid-South home environments.' },
          { highlight: 'Furniture-style wooden crates', text: 'blend seamlessly into living rooms as end tables and credenzas.' },
          { highlight: 'Rotomolded heavy-duty crates', text: 'tested for vehicular crash safety on Interstate 40 and I-240 travel.' },
        ],
      },
    ],
    sections: [
      {
        id: 'measurement-guide',
        title: '1. Standard Crate Dimensions by Dog Breed Size',
        content: 'Use this reference chart to find the right crate size for your dog:',
        tableData: {
          headers: ['Crate Size', 'Dimensions (L x W x H)', 'Weight Capacity', 'Typical Dog Breeds'],
          rows: [
            ['Small (24")', '24" x 18" x 19"', 'Up to 25 lbs', 'Chihuahua, Yorkie, French Bulldog, Pug'],
            ['Medium (30")', '30" x 19" x 21"', 'Up to 40 lbs', 'Beagle, Dachshund, Cocker Spaniel, Corgi'],
            ['Intermediate (36")', '36" x 23" x 25"', 'Up to 70 lbs', 'Standard Poodle, Border Collie, Bulldog, Aussie'],
            ['Large (42")', '42" x 28" x 30"', 'Up to 90 lbs', 'Golden Retriever, Labrador, Boxer, German Shepherd'],
            ['Extra-Large (48")', '48" x 30" x 33"', 'Up to 110 lbs', 'Rottweiler, Doberman, Bernese Mountain Dog'],
            ['Giant (54")', '54" x 35" x 45"', 'Over 110 lbs', 'Great Dane, Mastiff, Newfoundland'],
          ],
        },
      },
    ],
  },

  'grooming-in-memphis-tn': {
    kicker: 'Premier Shelby County Pet Salon',
    heroTitle: 'Professional Pet Grooming in Memphis, TN',
    heroSubheadline: 'Full-service fear-free dog and cat grooming from East Memphis to Midtown. Gentle master stylings, deshedding baths, and rabies compliance.',
    introSummary: 'All About Pawz is Memphis’s dedicated destination for compassionate, certified pet grooming. Located conveniently in Greater Memphis, our salon provides fear-free accommodations, low-noise blowouts, organic skin-soothing botanical washes, and scissored breed trims.',
    takeaways: [
      {
        icon: 'shield',
        title: 'Memphis Health Compliance',
        items: [
          { highlight: 'Strict Rabies verification', text: 'protecting pets under Shelby County Health Department mandates.' },
          { highlight: 'Hospital-grade sanitation', text: 'sterilized clippers, tubs, and tables between every single appointment.' },
          { highlight: 'Fear-free gentle handling', text: 'low-stress desensitization for anxious rescues and senior companions.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Mid-South Climate Formulas',
        items: [
          { highlight: 'Red clay & pollen cleansers', text: 'deep-cleansing washes remove stubborn Memphis soil and allergens.' },
          { highlight: 'High-velocity undercoat blowout', text: 'lightens dense double coats for optimal summer cooling.' },
          { highlight: 'Ear drying & antiseptic flush', text: 'counteracts heavy humidity and outdoor park swimming moisture.' },
        ],
      },
      {
        icon: 'clock',
        title: 'Full-Service Convenience',
        items: [
          { highlight: 'Express appointments available', text: 'minimal kennel wait times for sensitive and geriatric dogs.' },
          { highlight: 'Cats welcome', text: 'gentle feline lion cuts, sanitary trims, and dematting sessions.' },
          { highlight: 'Transparent salon pricing', text: 'honest quotes with zero hidden upcharges or unexpected fees.' },
        ],
      },
    ],
    sections: [
      {
        id: 'memphis-neighborhoods',
        title: '1. Serving Neighborhoods Across Greater Memphis',
        content: 'From East Memphis and Germantown Parkway to Midtown and Downtown, our salon accommodates pet parents throughout Shelby County. We provide tailored care for busy families who demand the highest standards of safety and comfort.',
      },
    ],
  },
};
