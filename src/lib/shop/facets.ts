// ---------------------------------------------------------------------------
// Shop facets — the canonical taxonomy of filterable product attributes.
//
// Sourced VERBATIM from the owner's pasted-content spec
// (Pasted Content_1791418582040.txt — the tree of filters per shop page).
// Every facet on every page is enumerated here so the sidebar renders
// EXACTLY what the spec calls for — no more, no less.
//
// UI behaviors (per spec):
//   • Every filter section has a Plus (+) button to collapse/expand.
//   • Sections with more than 6 options have a "Show all" button (the spec
//     marks these as "(UI toggle: show all)" or "(UI toggle: collapse)").
//   • Sections without a UI toggle render all options inline.
//
// Facet scaffolding renders with 0 counts until product attribute data
// lands — the owner wants the rail visible per the spec ("Publish
// Information here" sections become actual checkbox lists now).
// ---------------------------------------------------------------------------

export type FacetOption = {
  /** URL-safe value used in ?size=small,small-breed URL params. */
  value: string
  /** Customer-facing label. */
  label: string
}

export type FacetDefinition = {
  /** URL query param key, e.g. "brand", "size", "flavor". */
  key: string
  /** Customer-facing section label, e.g. "Brand", "Size", "Flavor". */
  label: string
  /** The set of options for this facet. */
  options: FacetOption[]
  /** When true, render the section with a brand-style search filter input. */
  searchable?: boolean
  /** When true, render options collapsible after the first N (default 6). */
  collapsible?: boolean
  /** Default number of options shown before "Show all" toggle. Default 6. */
  defaultVisible?: number
}

// ---------------------------------------------------------------------------
// ALL facet options (the union across every spec page) — single source.
// Page-level facet sets (below) reference these by key.
// ---------------------------------------------------------------------------

export const FACET_OPTIONS: Record<string, FacetOption[]> = {
  // ---- Brand (placeholder — published when brand data lands) ----
  brand: [
    { value: "all-about-portal", label: "UnSaid Memories" },
    { value: "portal-signature", label: "Portal Signature" },
    { value: "portal-pro", label: "Portal Pro" },
  ],

  // ---- Food Form (full union — covers cat + dog food + treats pages) ----
  foodForm: [
    { value: "crunchy", label: "Crunchy" },
    { value: "dry-food", label: "Dry Food" },
    { value: "pellet", label: "Pellet" },
    { value: "pellets", label: "Pellets" },
    { value: "blended", label: "Blended" },
    { value: "chunks-in-gravy", label: "Chunks in Gravy" },
    { value: "gravy", label: "Gravy" },
    { value: "pate", label: "Pate" },
    { value: "shredded", label: "Shredded" },
    { value: "flakes", label: "Flakes" },
    { value: "raw-freeze-dried", label: "Raw Freeze Dried" },
    { value: "freeze-dried", label: "Freeze Dried" },
    { value: "wet-food", label: "Wet Food" },
    { value: "liquid", label: "Liquid" },
    { value: "puree", label: "Puree" },
    { value: "powder", label: "Powder" },
    { value: "minced", label: "Minced" },
    { value: "broth", label: "Broth" },
    { value: "chunky", label: "Chunky" },
    { value: "loaf", label: "Loaf" },
    { value: "treats", label: "Treats" },
    { value: "semi-moist", label: "Semi-Moist" },
    { value: "fresh", label: "Fresh" },
    { value: "dehydrated", label: "Dehydrated" },
    { value: "food-topping", label: "Food Topping" },
    { value: "soft-and-chewy", label: "Soft & Chewy" },
    { value: "air-dried", label: "Air Dried" },
    { value: "clusters", label: "Clusters" },
    { value: "frozen-cooked", label: "Frozen Cooked" },
    { value: "raw", label: "Raw" },
    { value: "frozen", label: "Frozen" },
    { value: "frozen-raw", label: "Frozen Raw" },
    { value: "granulated", label: "Granulated" },
    { value: "granules", label: "Granules" },
    { value: "extruded", label: "Extruded" },
    { value: "solid", label: "Solid" },
    { value: "pill-or-tablet", label: "Pill or Tablet" },
    { value: "tablet", label: "Tablet" },
    { value: "capsule", label: "Capsule" },
    { value: "gel", label: "Gel" },
    { value: "paste", label: "Paste" },
    { value: "spray", label: "Spray" },
    { value: "wipe", label: "Wipe" },
    { value: "softgel", label: "Softgel" },
    { value: "sliced", label: "Sliced" },
    { value: "crumble", label: "Crumble" },
    { value: "refrigerated", label: "Refrigerated" },
    { value: "long-lasting-chew", label: "Long Lasting Chew" },
  ],

  // ---- Life Stage ----
  lifeStage: [
    { value: "puppy", label: "Puppy" },
    { value: "kitten", label: "Kitten" },
    { value: "adult", label: "Adult" },
    { value: "senior", label: "Senior" },
    { value: "all-lifestages", label: "All Lifestages" },
  ],

  // ---- Flavor (full union — cat food + dog food + treats) ----
  flavor: [
    { value: "fish", label: "Fish" },
    { value: "salmon", label: "Salmon" },
    { value: "tuna", label: "Tuna" },
    { value: "seafood", label: "Seafood" },
    { value: "whitefish", label: "Whitefish" },
    { value: "shrimp", label: "Shrimp" },
    { value: "chicken", label: "Chicken" },
    { value: "chicken-liver", label: "Chicken Liver" },
    { value: "turkey", label: "Turkey" },
    { value: "beef", label: "Beef" },
    { value: "lamb", label: "Lamb" },
    { value: "pork", label: "Pork" },
    { value: "bacon", label: "Bacon" },
    { value: "ham", label: "Ham" },
    { value: "duck", label: "Duck" },
    { value: "rabbit", label: "Rabbit" },
    { value: "venison", label: "Venison" },
    { value: "boar", label: "Boar" },
    { value: "bison", label: "Bison" },
    { value: "buffalo", label: "Buffalo" },
    { value: "alligator", label: "Alligator" },
    { value: "quail", label: "Quail" },
    { value: "pheasant", label: "Pheasant" },
    { value: "fowl", label: "Fowl" },
    { value: "liver", label: "Liver" },
    { value: "egg", label: "Egg" },
    { value: "cheese", label: "Cheese" },
    { value: "milk", label: "Milk" },
    { value: "yogurt", label: "Yogurt" },
    { value: "rice", label: "Rice" },
    { value: "potato", label: "Potato" },
    { value: "sweet-potato", label: "Sweet Potato" },
    { value: "peas", label: "Peas" },
    { value: "green-pea", label: "Green Pea" },
    { value: "pumpkin", label: "Pumpkin" },
    { value: "carrot", label: "Carrot" },
    { value: "apple", label: "Apple" },
    { value: "banana", label: "Banana" },
    { value: "cranberry", label: "Cranberry" },
    { value: "coconut", label: "Coconut" },
    { value: "fruit", label: "Fruit" },
    { value: "fruits-and-vegetables", label: "Fruits & Vegetables" },
    { value: "vegetable", label: "Vegetable" },
    { value: "peanut-butter", label: "Peanut Butter" },
    { value: "peanut", label: "Peanut" },
    { value: "honey", label: "Honey" },
    { value: "maple", label: "Maple" },
    { value: "mint", label: "Mint" },
    { value: "peppermint", label: "Peppermint" },
    { value: "malt", label: "Malt" },
    { value: "vanilla", label: "Vanilla" },
    { value: "catnip", label: "Catnip" },
    { value: "hickory", label: "Hickory" },
    { value: "barbecue", label: "Barbecue" },
    { value: "bacon-and-cheese", label: "Bacon & Cheese" },
    { value: "carob", label: "Carob" },
    { value: "pepperoni", label: "Pepperoni" },
    { value: "assorted", label: "Assorted" },
    { value: "original", label: "Original" },
    { value: "natural", label: "Natural" },
  ],

  // ---- Health Feature (full union) ----
  healthFeature: [
    { value: "advanced-age", label: "Advanced Age" },
    { value: "allergy-relief", label: "Allergy Relief" },
    { value: "antioxidant", label: "Antioxidant" },
    { value: "appetite-stimulant", label: "Appetite Stimulant" },
    { value: "brain-health", label: "Brain Health" },
    { value: "breath-freshener", label: "Breath Freshener" },
    { value: "calming", label: "Calming" },
    { value: "clumping", label: "Clumping" },
    { value: "dental", label: "Dental" },
    { value: "dental-care", label: "Dental Care" },
    { value: "dental-health", label: "Dental Health" },
    { value: "diabetic-support", label: "Diabetic Support" },
    { value: "digestive-health", label: "Digestive Health" },
    { value: "sensitive-digestion", label: "Sensitive Digestion" },
    { value: "sensitive-stomach", label: "Sensitive Stomach" },
    { value: "eye-care", label: "Eye Care" },
    { value: "grain-free", label: "Grain-Free" },
    { value: "hairball", label: "Hairball" },
    { value: "hairball-control", label: "Hairball Control" },
    { value: "heart-care", label: "Heart Care" },
    { value: "hip-and-joint", label: "Hip and Joint" },
    { value: "holistic", label: "Holistic" },
    { value: "homeopathic", label: "Homeopathic" },
    { value: "hydrolyzed-protein", label: "Hydrolyzed Protein" },
    { value: "hydrolized-protein", label: "Hydrolized Protein" },
    { value: "immune-support", label: "Immune Support" },
    { value: "kidney-care", label: "Kidney Care" },
    { value: "lactose-free", label: "Lactose Free" },
    { value: "liver-care", label: "Liver Care" },
    { value: "low-glycemic", label: "Low Glycemic" },
    { value: "metabolic", label: "Metabolic" },
    { value: "multi-vitamin", label: "Multi-Vitamin" },
    { value: "muli-vitamin", label: "Muli-Vitamin" },
    { value: "muscle-care", label: "Muscle Care" },
    { value: "natural", label: "Natural" },
    { value: "organic", label: "Organic" },
    { value: "recovery", label: "Recovery" },
    { value: "renal-support", label: "Renal Support" },
    { value: "scientific-formula", label: "Scientific Formula" },
    { value: "sensitive-skin-and-coat", label: "Sensitive Skin and Coat" },
    { value: "shed-control", label: "Shed Control" },
    { value: "skin-and-coat", label: "Skin & Coat" },
    { value: "sport-endurance", label: "Sport/Endurance" },
    { value: "stress-relief", label: "Stress Relief" },
    { value: "supplemental-topper", label: "Supplemental Topper" },
    { value: "urinary-tract-health", label: "Urinary Tract Health" },
    { value: "weaning-formula", label: "Weaning Formula" },
    { value: "weight-management", label: "Weight Management" },
    { value: "aging", label: "Aging" },
  ],

  // ---- Color ----
  color: [
    { value: "black", label: "Black" },
    { value: "blue", label: "Blue" },
    { value: "bronze", label: "Bronze" },
    { value: "brown", label: "Brown" },
    { value: "clear", label: "Clear" },
    { value: "copper", label: "Copper" },
    { value: "cream", label: "Cream" },
    { value: "gold", label: "Gold" },
    { value: "green", label: "Green" },
    { value: "grey", label: "Grey" },
    { value: "multi-color", label: "Multi-Color" },
    { value: "natural-wood", label: "Natural Wood" },
    { value: "orange", label: "Orange" },
    { value: "pink", label: "Pink" },
    { value: "purple", label: "Purple" },
    { value: "red", label: "Red" },
    { value: "silver", label: "Silver" },
    { value: "tan", label: "Tan" },
    { value: "teal", label: "Teal" },
    { value: "titanium", label: "Titanium" },
    { value: "white", label: "White" },
    { value: "yellow", label: "Yellow" },
  ],

  // ---- Material (full union) ----
  material: [
    { value: "cardboard", label: "Cardboard" },
    { value: "plastic", label: "Plastic" },
    { value: "synthetic-material", label: "Synthetic Material" },
    { value: "plant-material", label: "Plant Material" },
    { value: "plush", label: "Plush" },
    { value: "fabric", label: "Fabric" },
    { value: "recycled-material", label: "Recycled Material" },
    { value: "vinyl", label: "Vinyl" },
    { value: "wood", label: "Wood" },
    { value: "stone", label: "Stone" },
    { value: "nylon", label: "Nylon" },
    { value: "silicone", label: "Silicone" },
    { value: "metal", label: "Metal" },
    { value: "rubber", label: "Rubber" },
    { value: "catnip", label: "Catnip" },
    { value: "foam", label: "Foam" },
    { value: "feather", label: "Feather" },
    { value: "leather", label: "Leather" },
    { value: "neoprene", label: "Neoprene" },
    { value: "ribbon", label: "Ribbon" },
    { value: "natural-material", label: "Natural Material" },
    { value: "velvet", label: "Velvet" },
    { value: "rope", label: "Rope" },
    { value: "glass", label: "Glass" },
    { value: "paper", label: "Paper" },
    { value: "mesh", label: "Mesh" },
    { value: "microfiber", label: "Microfiber" },
    { value: "satin", label: "Satin" },
    { value: "viscose", label: "Viscose" },
    { value: "tpe", label: "TPE" },
    { value: "tpu", label: "TPU" },
  ],

  // ---- Breed Size ----
  breedSize: [
    { value: "extra-small-breed", label: "Extra Small Breed" },
    { value: "small-breed", label: "Small Breed" },
    { value: "medium-breed", label: "Medium Breed" },
    { value: "large-breed", label: "Large Breed" },
    { value: "extra-large-breed", label: "Extra Large Breed" },
    { value: "all-breeds", label: "All Breeds" },
  ],

  // ---- Product Weight ----
  productWeight: [
    { value: "less-than-1-lb", label: "Less than 1 lb" },
    { value: "1-5-lbs", label: "1-5 lbs" },
    { value: "5-10-lbs", label: "5-10 lbs" },
    { value: "10-20-lbs", label: "10-20 lbs" },
    { value: "10-20-lb", label: "10-20 lb" },
    { value: "20-50-lbs", label: "20-50 lbs" },
    { value: "50-100-lbs", label: "50-100 lbs" },
    { value: "100-lbs-and-more", label: "100 lbs and more" },
  ],

  // ---- Frame Material (furniture-specific) ----
  frameMaterial: [
    { value: "wood", label: "Wood" },
    { value: "cardboard", label: "Cardboard" },
    { value: "artificial-wood", label: "Artificial Wood" },
    { value: "metal", label: "Metal" },
    { value: "plastic", label: "Plastic" },
    { value: "engineered-wood", label: "Engineered Wood" },
  ],

  // ---- Apparel Type ----
  apparelType: [
    { value: "shirt", label: "Shirt" },
    { value: "accessory", label: "Accessory" },
    { value: "hoodie", label: "Hoodie" },
    { value: "life-jackets", label: "Life Jackets" },
    { value: "costume", label: "Costume" },
    { value: "bandanas-scarves", label: "Bandanas & Scarves" },
    { value: "jersey-team-apparel", label: "Jersey & Team Apparel" },
    { value: "pajamas", label: "Pajamas" },
    { value: "coats-jackets", label: "Coats & Jackets" },
    { value: "sweater", label: "Sweater" },
    { value: "onesies", label: "Onesies" },
    { value: "hats", label: "Hats" },
    { value: "dresses", label: "Dresses" },
    { value: "tank-top", label: "Tank Top" },
    { value: "cooling-gear", label: "Cooling Gear" },
    { value: "pouches-bags", label: "Pouches & Bags" },
    { value: "jewelry-charms", label: "Jewelry & Charms" },
    { value: "hair-accessories", label: "Hair Accessories" },
    { value: "swimsuits", label: "Swimsuits" },
  ],

  // ---- Size (apparel / collars / etc) ----
  size: [
    { value: "xxx-small", label: "XXX-Small" },
    { value: "xx-small", label: "XX-Small" },
    { value: "x-small", label: "X-Small" },
    { value: "small", label: "Small" },
    { value: "medium", label: "Medium" },
    { value: "large", label: "Large" },
    { value: "x-large", label: "X-Large" },
    { value: "xx-large", label: "XX-Large" },
    { value: "xxx-large-and-up", label: "XXX-Large & Up" },
    { value: "one-size-fits-most", label: "One Size Fits Most" },
  ],

  // ---- Price Buckets ----
  priceBuckets: [
    { value: "under-10", label: "Under $10" },
    { value: "10-25", label: "$10 to $25" },
    { value: "25-50", label: "$25 to $50" },
    { value: "50-100", label: "$50 to $100" },
    { value: "over-100", label: "Over $100" },
  ],

  // ---- Customer Rating ----
  customerRating: [
    { value: "4", label: "4★ & up" },
    { value: "3", label: "3★ & up" },
    { value: "2", label: "2★ & up" },
    { value: "1", label: "1★ & up" },
  ],

  // ---- NEW facets per the spec ----

  // ---- Litter Material (Cat Litter page) ----
  litterMaterial: [
    { value: "clay", label: "Clay" },
    { value: "corn", label: "Corn" },
    { value: "grass-seed", label: "Grass Seed" },
    { value: "crystal", label: "Crystal" },
    { value: "paper", label: "Paper" },
    { value: "wood", label: "Wood" },
    { value: "walnut", label: "Walnut" },
    { value: "tofu", label: "Tofu" },
    { value: "wheat", label: "Wheat" },
    { value: "pine", label: "Pine" },
  ],

  // ---- Bed Shape (Cat Beds + Dog Beds) ----
  bedShape: [
    { value: "rectangle", label: "Rectangle" },
    { value: "round", label: "Round" },
    { value: "oval", label: "Oval" },
    { value: "square", label: "Square" },
    { value: "circle", label: "Circle" },
    { value: "triangle", label: "Triangle" },
    { value: "bone", label: "Bone" },
    { value: "heart", label: "Heart" },
    { value: "cat", label: "Cat" },
  ],

  // ---- Bed Type (Cat Beds + Dog Beds) ----
  bedType: [
    { value: "fashion-beds", label: "Fashion Beds" },
    { value: "pillow-beds", label: "Pillow Beds" },
    { value: "basic-beds", label: "Basic Beds" },
    { value: "bolster-beds", label: "Bolster Beds" },
    { value: "heated-beds", label: "Heated Beds" },
    { value: "tufted-beds", label: "Tufted Beds" },
    { value: "memory-foam-beds", label: "Memory Foam Beds" },
    { value: "covered-beds", label: "Covered Beds" },
    { value: "cooling-beds", label: "Cooling Beds" },
    { value: "outdoor-beds", label: "Outdoor Beds" },
    { value: "internet", label: "Internet" },
    { value: "sofa-dog-beds", label: "Sofa Dog Beds" },
    { value: "crate-mats", label: "Crate Mats" },
  ],

  // ---- Bed Fill (Cat Beds + Dog Beds) ----
  bedFill: [
    { value: "polyester", label: "Polyester" },
    { value: "fiberfill", label: "Fiberfill" },
    { value: "orthopedic-foam", label: "Orthopedic Foam" },
    { value: "memory-foam", label: "Memory Foam" },
    { value: "foam", label: "Foam" },
  ],

  // ---- Pet (which animal the product is for) ----
  pet: [
    { value: "cat", label: "Cat" },
    { value: "dog", label: "Dog" },
    { value: "cat-and-dog", label: "Cat & Dog" },
  ],

  // ---- Item Height Range (Furniture & Scratchers) ----
  itemHeightRange: [
    { value: "1-7", label: '1"-7"' },
    { value: "8-24", label: '8"-24"' },
    { value: "25-34", label: '25"-34"' },
    { value: "35-44", label: '35"-44"' },
    { value: "45-64", label: '45"-64"' },
    { value: "65-110", label: '65"-110"' },
  ],

  // ---- Furniture Levels (1-9) ----
  furnitureLevels: [
    { value: "1", label: "1" },
    { value: "2", label: "2" },
    { value: "3", label: "3" },
    { value: "4", label: "4" },
    { value: "5", label: "5" },
    { value: "6", label: "6" },
    { value: "7", label: "7" },
    { value: "8", label: "8" },
    { value: "9", label: "9" },
  ],

  // ---- Number of Perches (0-8) ----
  numberOfPerches: [
    { value: "0", label: "0" },
    { value: "1", label: "1" },
    { value: "2", label: "2" },
    { value: "3", label: "3" },
    { value: "4", label: "4" },
    { value: "5", label: "5" },
    { value: "6", label: "6" },
    { value: "7", label: "7" },
    { value: "8", label: "8" },
  ],

  // ---- Number of Condos (0-4) ----
  numberOfCondos: [
    { value: "0", label: "0" },
    { value: "1", label: "1" },
    { value: "2", label: "2" },
    { value: "3", label: "3" },
    { value: "4", label: "4" },
  ],

  // ---- Number of Scratch Posts (0-10) ----
  numberOfScratchPosts: [
    { value: "0", label: "0" },
    { value: "1", label: "1" },
    { value: "2", label: "2" },
    { value: "3", label: "3" },
    { value: "4", label: "4" },
    { value: "5", label: "5" },
    { value: "6", label: "6" },
    { value: "7", label: "7" },
    { value: "8", label: "8" },
    { value: "9", label: "9" },
    { value: "10", label: "10" },
  ],

  // ---- Training Collar Type (Collars/Harnesses/Leashes + Cat/Dog Health) ----
  trainingCollarType: [
    { value: "martingale", label: "Martingale" },
    { value: "choke", label: "Choke" },
    { value: "head-collar", label: "Head Collar" },
    { value: "slip", label: "Slip" },
    { value: "prong", label: "Prong" },
  ],

  // ---- Collar Closure Type ----
  collarClosureType: [
    { value: "buckle", label: "Buckle" },
    { value: "quick-release", label: "Quick Release" },
    { value: "slip-on", label: "Slip On" },
    { value: "hook-and-loop", label: "Hook & Loop" },
    { value: "bolt-snap", label: "Bolt Snap" },
  ],

  // ---- Harness Type (Collars/Harnesses/Leashes) ----
  harnessType: [
    { value: "no-pull", label: "No Pull" },
    { value: "back-clip", label: "Back Clip" },
    { value: "service-dog", label: "Service Dog" },
    { value: "dual-clip", label: "Dual Clip" },
    { value: "car-safety", label: "Car Safety" },
    { value: "headcollar", label: "Headcollar" },
  ],

  // ---- Features (the union across all spec pages that list features) ----
  features: [
    { value: "pullover", label: "Pullover" },
    { value: "step-in", label: "Step In" },
    { value: "water-resistant", label: "Water Resistant" },
    { value: "water-proof", label: "Water Proof" },
    { value: "natural", label: "Natural" },
    { value: "leash-opening", label: "Leash Opening" },
    { value: "padded", label: "Padded" },
    { value: "squeaky", label: "Squeaky" },
    { value: "crinkle", label: "Crinkle" },
    { value: "unscented", label: "Unscented" },
    { value: "teething", label: "Teething" },
    { value: "scented", label: "Scented" },
    { value: "stuffing-free", label: "Stuffing-Free" },
    { value: "adjustable", label: "Adjustable" },
    { value: "traffic-handle", label: "Traffic Handle" },
    { value: "bungee", label: "Bungee" },
    { value: "non-skid", label: "Non-Skid" },
    { value: "reflective", label: "Reflective" },
    { value: "led", label: "LED" },
    { value: "personalized", label: "Personalized" },
    { value: "water-toy", label: "Water Toy" },
    { value: "glow-or-light-up", label: "Glow or Light Up" },
    { value: "tough-chewer", label: "Tough Chewer" },
    { value: "insulated", label: "Insulated" },
    { value: "attractant", label: "Attractant" },
    { value: "multi-dog-system", label: "Multi-Dog System" },
    { value: "clumping", label: "Clumping" },
    { value: "qr-code", label: "QR Code" },
    { value: "catnip", label: "Catnip" },
    { value: "gps", label: "GPS" },
    { value: "multi-pet", label: "Multi Pet" },
    { value: "odor-control", label: "Odor Control" },
    { value: "low-tracking", label: "Low-Tracking" },
    { value: "single-pet", label: "Single Pet" },
    { value: "lightweight", label: "Lightweight" },
    { value: "non-clumping", label: "Non-Clumping" },
    { value: "health-monitoring", label: "Health Monitoring" },
  ],

  // ---- Dietary Preference (food + treats + health pages) ----
  dietaryPreference: [
    { value: "with-grain", label: "With Grain" },
    { value: "grain-free", label: "Grain-Free" },
    { value: "holistic", label: "Holistic" },
    { value: "maintenance", label: "Maintenance" },
    { value: "limited-ingredient-diet", label: "Limited Ingredient Diet" },
    { value: "small-bites", label: "Small Bites" },
    { value: "selective-eater", label: "Selective Eater" },
    { value: "vegetarian", label: "Vegetarian" },
    { value: "organic", label: "Organic" },
    { value: "sensitive-stomach", label: "Sensitive Stomach" },
  ],

  // ---- Quantity (placeholder — "Publish Information here") ----
  quantity: [
    { value: "1", label: "1" },
    { value: "2", label: "2" },
    { value: "3", label: "3" },
    { value: "6", label: "6" },
    { value: "12", label: "12" },
    { value: "24", label: "24" },
    { value: "bulk", label: "Bulk" },
  ],
}

// ---------------------------------------------------------------------------
// The default facet set for the shop home, animal landings, and any path
// not explicitly listed in SHOP_PAGE_FACETS. Per the spec, the cat landing
// page is the canonical "all facets" reference.
// ---------------------------------------------------------------------------

export const DEFAULT_FACETS: string[] = [
  "categories",
  "brand",
  "price",
  "customerRating",
  "lifeStage",
  "breedSize",
  "color",
  "material",
]

// ---------------------------------------------------------------------------
// Page-specific facet sets — EXACTLY per the owner's pasted spec
// (Pasted Content_1791418582040.txt). Each entry matches a spec page's
// filter tree, in order. Subcategory pages inherit their parent
// department's set (the resolver in lib/shop/catalog.ts handles this).
// ---------------------------------------------------------------------------

export const SHOP_PAGE_FACETS: Record<string, string[]> = {
  // ---- Cat Landing (per spec: Categories + Brand + Food Form + Lifestage +
  // Flavor + Health Feature + Color + Price + Customer Rating + Material +
  // Breed Size + Product Weight + Features + Apparel Type + Size + Dietary
  // Preference + Frame Material + Quantity) ----
  "/shop/cat": [
    "categories",
    "brand",
    "foodForm",
    "lifeStage",
    "flavor",
    "healthFeature",
    "color",
    "price",
    "customerRating",
    "material",
    "breedSize",
    "productWeight",
    "features",
    "apparelType",
    "size",
    "dietaryPreference",
    "frameMaterial",
    "quantity",
  ],

  // ---- Cat Food (Categories + Brand + Food Form + Lifestage + Dietary
  // Preference + Health Feature + Flavor + Quantity + Price + Customer
  // Rating) ----
  "/shop/cat/food": [
    "categories",
    "brand",
    "foodForm",
    "lifeStage",
    "dietaryPreference",
    "healthFeature",
    "flavor",
    "quantity",
    "price",
    "customerRating",
  ],

  // ---- Cat Treats (Categories + Brand + Flavor + Lifestage + Customer
  // Rating + Health Feature + Pet + Price + Dietary Preference + Breed Size
  // + Product Weight + Quantity) ----
  "/shop/cat/treats": [
    "categories",
    "brand",
    "flavor",
    "lifeStage",
    "customerRating",
    "healthFeature",
    "pet",
    "price",
    "dietaryPreference",
    "breedSize",
    "productWeight",
    "quantity",
  ],

  // ---- Cat Litter (Categories + Brand + Litter Material + Features + Price
  // + Product Weight + Customer Rating + Quantity) ----
  "/shop/cat/litter-litter-boxes-accessories": [
    "categories",
    "brand",
    "litterMaterial",
    "features",
    "price",
    "productWeight",
    "customerRating",
    "quantity",
  ],

  // ---- Cat Furniture & Scratchers (Categories + Item Height Range + Brand +
  // Price + Customer Rating + Color + Material + Furniture Levels + Number
  // of Perches + Size + Number of Condos + Number of Scratch Posts + Breed
  // Size + Quantity) ----
  "/shop/cat/furniture-scratchers": [
    "categories",
    "itemHeightRange",
    "brand",
    "price",
    "customerRating",
    "color",
    "material",
    "furnitureLevels",
    "numberOfPerches",
    "size",
    "numberOfCondos",
    "numberOfScratchPosts",
    "breedSize",
    "quantity",
  ],

  // ---- Litter Boxes & Accessories subcategory (Categories + Brand +
  // Material + Size + Price + Customer Rating + Quantity) ----
  "/shop/cat/litter-litter-boxes-accessories/cat-litter-boxes-accessories": [
    "categories",
    "brand",
    "material",
    "size",
    "price",
    "customerRating",
    "quantity",
  ],

  // ---- Cat Toys (Categories + Brand + Price + Features + Customer Rating +
  // Lifestage + Size + Material + Flavor + Color + Product Weight +
  // Quantity + Apparel Type) ----
  "/shop/cat/toys": [
    "categories",
    "brand",
    "price",
    "features",
    "customerRating",
    "lifeStage",
    "size",
    "material",
    "flavor",
    "color",
    "productWeight",
    "quantity",
    "apparelType",
  ],

  // ---- Cat Carriers & Containment (Categories + Brand + Price + Breed Size
  // + Material + Pet + Furniture Levels + Lifestage + Product Weight + Bed
  // Shape + Features) ----
  "/shop/cat/carriers-containment": [
    "categories",
    "brand",
    "price",
    "breedSize",
    "material",
    "pet",
    "furnitureLevels",
    "lifeStage",
    "productWeight",
    "bedShape",
    "features",
  ],

  // ---- Cat Health & Wellness (Categories + Brand + Pet + Lifestage + Health
  // Feature + Size + Price + Flavor + Dietary Preference + Food Form +
  // Customer Rating + Material + Features + Collar Closure Type + Product
  // Weight + Quantity + Apparel Type) ----
  "/shop/cat/health-wellness": [
    "categories",
    "brand",
    "pet",
    "lifeStage",
    "healthFeature",
    "size",
    "price",
    "flavor",
    "dietaryPreference",
    "foodForm",
    "customerRating",
    "material",
    "features",
    "collarClosureType",
    "productWeight",
    "quantity",
    "apparelType",
  ],

  // ---- Cat Beds (Categories + Brand + Bed Shape + Size + Bed Type + Color
  // + Lifestage + Material + Bed Fill + Price + Customer Rating) ----
  "/shop/cat/beds-bedding": [
    "categories",
    "brand",
    "bedShape",
    "size",
    "bedType",
    "color",
    "lifeStage",
    "material",
    "bedFill",
    "price",
    "customerRating",
  ],

  // ---- Cat Bowls & Feeders (Categories + Material + Color + Price + Brand
  // + Customer Rating + Quantity + Size) ----
  "/shop/cat/bowls-feeders": [
    "categories",
    "material",
    "color",
    "price",
    "brand",
    "customerRating",
    "quantity",
    "size",
  ],

  // ---- Cat Flea & Tick (Categories + Brand + Quantity + Customer Rating +
  // Price) ----
  "/shop/cat/flea-tick": [
    "categories",
    "brand",
    "quantity",
    "customerRating",
    "price",
  ],

  // ---- Dog Landing (Top Dog Deals — Categories + Brand + Size + Breed Size
  // + Life Stage + Price + Customer Rating + Apparel Type + Flavor + Health
  // Feature + Material + Color + Food Form + Features + Dietary Preference +
  // Product Weight) ----
  "/shop/dog": [
    "categories",
    "brand",
    "size",
    "breedSize",
    "lifeStage",
    "price",
    "customerRating",
    "apparelType",
    "flavor",
    "healthFeature",
    "material",
    "color",
    "foodForm",
    "features",
    "dietaryPreference",
    "productWeight",
  ],

  // ---- Dog Food (Categories + Brand + Flavor + Lifestage + Food Form +
  // Health Feature + Dietary Preference + Breed Size + Pet) ----
  "/shop/dog/food": [
    "categories",
    "brand",
    "flavor",
    "lifeStage",
    "foodForm",
    "healthFeature",
    "dietaryPreference",
    "breedSize",
    "pet",
  ],

  // ---- Dog Treats (Categories + Brand + Flavor + Pet + Price + Size +
  // Lifestage + Health Feature + Dietary Preference + Breed Size + Customer
  // Rating + Food Form + Features + Product Weight + Quantity + Color +
  // Material) ----
  "/shop/dog/treats-chews": [
    "categories",
    "brand",
    "flavor",
    "pet",
    "price",
    "size",
    "lifeStage",
    "healthFeature",
    "dietaryPreference",
    "breedSize",
    "customerRating",
    "foodForm",
    "features",
    "productWeight",
    "quantity",
    "color",
    "material",
  ],

  // ---- Dog Flea & Tick (Categories + Brand + Price + Customer Rating +
  // Product Weight + Quantity + Food Form + Dietary Preference + Flavor) ----
  "/shop/dog/flea-tick": [
    "categories",
    "brand",
    "price",
    "customerRating",
    "productWeight",
    "quantity",
    "foodForm",
    "dietaryPreference",
    "flavor",
  ],

  // ---- Dog Health & Wellness (Categories + Brand + Pet + Health Feature +
  // Lifestage + Price + Food Form + Dietary Preference + Customer Rating +
  // Size + Flavor + Collar Closure Type + Features + Quantity + Product
  // Weight + Apparel Type) ----
  "/shop/dog/health-wellness": [
    "categories",
    "brand",
    "pet",
    "healthFeature",
    "lifeStage",
    "price",
    "foodForm",
    "dietaryPreference",
    "customerRating",
    "size",
    "flavor",
    "collarClosureType",
    "features",
    "quantity",
    "productWeight",
    "apparelType",
  ],

  // ---- Dog Crates & Containment (Categories + Brand + Size + Breed Size +
  // Price + Pet + Material + Color + Features + Quantity + Lifestage + Food
  // Form) ----
  "/shop/dog/crates-containment": [
    "categories",
    "brand",
    "size",
    "breedSize",
    "price",
    "pet",
    "material",
    "color",
    "features",
    "quantity",
    "lifeStage",
    "foodForm",
  ],

  // ---- Dog Cleanup (Categories + Brand + Material + Price + Size + Customer
  // Rating + Features + Quantity + Health Feature + Collar Closure Type) ----
  "/shop/dog/cleaning-potty-supplies": [
    "categories",
    "brand",
    "material",
    "price",
    "size",
    "customerRating",
    "features",
    "quantity",
    "healthFeature",
    "collarClosureType",
  ],

  // ---- Dog Beds (Categories + Size + Brand + Bed Type + Bed Shape + Price
  // + Color + Breed Size + Bed Fill + Lifestage + Customer Rating) ----
  "/shop/dog/beds-bedding": [
    "categories",
    "size",
    "brand",
    "bedType",
    "bedShape",
    "price",
    "color",
    "breedSize",
    "bedFill",
    "lifeStage",
    "customerRating",
  ],

  // ---- Dog Bowls & Feeding (Categories + Brand + Size + Pet + Material +
  // Breed Size + Price + Color + Features + Customer Rating + Quantity +
  // Product Weight) ----
  "/shop/dog/bowls-feeding": [
    "categories",
    "brand",
    "size",
    "pet",
    "material",
    "breedSize",
    "price",
    "color",
    "features",
    "customerRating",
    "quantity",
    "productWeight",
  ],

  // ---- Dog Toys (Categories + Brand + Size + Price + Features + Lifestage
  // + Breed Size + Customer Rating + Material + Color + Product Weight +
  // Flavor + Quantity) ----
  "/shop/dog/toys": [
    "categories",
    "brand",
    "size",
    "price",
    "features",
    "lifeStage",
    "breedSize",
    "customerRating",
    "material",
    "color",
    "productWeight",
    "flavor",
    "quantity",
  ],

  // ---- Dog Collars, Harnesses & Leashes (Categories + Brand + Color + Size
  // + Breed Size + Price + Pet + Customer Rating + Material + Training
  // Collar Type + Collar Closure Type + Features + Harness Type + Product
  // Weight + Quantity) ----
  "/shop/dog/collars-harnesses-leashes": [
    "categories",
    "brand",
    "color",
    "size",
    "breedSize",
    "price",
    "pet",
    "customerRating",
    "material",
    "trainingCollarType",
    "collarClosureType",
    "features",
    "harnessType",
    "productWeight",
    "quantity",
  ],

  // ---- Dog Grooming & Bathing — using the canonical "all facets" default
  //      set (the spec page wasn't enumerated separately). ----

  // ---- Dog Outdoor & Travel Gear — using the canonical "all facets"
  //      default set (the spec page wasn't enumerated separately). ----

  // ---- Dog Apparel & Accessories — using the canonical "all facets"
  //      default set (the spec page wasn't enumerated separately). ----

  // ---- Dog Training & Behavior Supplies — using the canonical "all
  //      facets" default set (the spec page wasn't enumerated separately). ----
}

// ---------------------------------------------------------------------------
// Resolver — given a path, return the facet keys to render. Walks up the
// path until it finds a match in SHOP_PAGE_FACETS, falling back to the
// DEFAULT_FACETS set. Subcategories inherit their department's set.
// ---------------------------------------------------------------------------

export function resolveFacetsForPath(path: string): string[] {
  if (SHOP_PAGE_FACETS[path]) return SHOP_PAGE_FACETS[path]
  // Walk up: /shop/cat/beds-bedding/bolster-cat-beds → /shop/cat/beds-bedding → /shop/cat
  const parts = path.split("/").filter(Boolean)
  for (let i = parts.length; i >= 2; i--) {
    const candidate = "/" + parts.slice(0, i).join("/")
    if (SHOP_PAGE_FACETS[candidate]) return SHOP_PAGE_FACETS[candidate]
  }
  return DEFAULT_FACETS
}

// ---------------------------------------------------------------------------
// The full catalog of facets — used by the sidebar to render each section.
// Each facet definition references FACET_OPTIONS and carries presentation
// hints (searchable, collapsible, defaultVisible).
// ---------------------------------------------------------------------------

export const FACETS: FacetDefinition[] = [
  // ---- Brand — searchable (long list, brand-name search filter) ----
  {
    key: "brand",
    label: "Brand",
    options: FACET_OPTIONS.brand,
    searchable: true,
    collapsible: true,
    defaultVisible: 6,
  },
  // ---- Food Form — collapsible (full union is 47 options) ----
  {
    key: "foodForm",
    label: "Food Form",
    options: FACET_OPTIONS.foodForm,
    collapsible: true,
    defaultVisible: 6,
  },
  // ---- Life Stage ----
  {
    key: "lifeStage",
    label: "Life Stage",
    options: FACET_OPTIONS.lifeStage,
    collapsible: false,
    defaultVisible: 99,
  },
  // ---- Flavor — searchable + collapsible ----
  {
    key: "flavor",
    label: "Flavor",
    options: FACET_OPTIONS.flavor,
    searchable: true,
    collapsible: true,
    defaultVisible: 6,
  },
  // ---- Health Feature — searchable + collapsible ----
  {
    key: "healthFeature",
    label: "Health Feature",
    options: FACET_OPTIONS.healthFeature,
    searchable: true,
    collapsible: true,
    defaultVisible: 6,
  },
  // ---- Color — collapsible (20 options) ----
  {
    key: "color",
    label: "Color",
    options: FACET_OPTIONS.color,
    collapsible: true,
    defaultVisible: 6,
  },
  // ---- Material — collapsible ----
  {
    key: "material",
    label: "Material",
    options: FACET_OPTIONS.material,
    collapsible: true,
    defaultVisible: 6,
  },
  // ---- Breed Size ----
  {
    key: "breedSize",
    label: "Breed Size",
    options: FACET_OPTIONS.breedSize,
    collapsible: true,
    defaultVisible: 6,
  },
  // ---- Product Weight ----
  {
    key: "productWeight",
    label: "Product Weight",
    options: FACET_OPTIONS.productWeight,
    collapsible: true,
    defaultVisible: 6,
  },
  // ---- Frame Material ----
  {
    key: "frameMaterial",
    label: "Frame Material",
    options: FACET_OPTIONS.frameMaterial,
    collapsible: true,
    defaultVisible: 6,
  },
  // ---- Apparel Type — collapsible ----
  {
    key: "apparelType",
    label: "Apparel Type",
    options: FACET_OPTIONS.apparelType,
    collapsible: true,
    defaultVisible: 6,
  },
  // ---- Size — collapsible ----
  {
    key: "size",
    label: "Size",
    options: FACET_OPTIONS.size,
    collapsible: true,
    defaultVisible: 6,
  },
  // ---- Litter Material ----
  {
    key: "litterMaterial",
    label: "Litter Material",
    options: FACET_OPTIONS.litterMaterial,
    collapsible: true,
    defaultVisible: 6,
  },
  // ---- Bed Shape ----
  {
    key: "bedShape",
    label: "Bed Shape",
    options: FACET_OPTIONS.bedShape,
    collapsible: true,
    defaultVisible: 6,
  },
  // ---- Bed Type ----
  {
    key: "bedType",
    label: "Bed Type",
    options: FACET_OPTIONS.bedType,
    collapsible: true,
    defaultVisible: 6,
  },
  // ---- Bed Fill ----
  {
    key: "bedFill",
    label: "Bed Fill",
    options: FACET_OPTIONS.bedFill,
    collapsible: false,
    defaultVisible: 99,
  },
  // ---- Pet ----
  {
    key: "pet",
    label: "Pet",
    options: FACET_OPTIONS.pet,
    collapsible: false,
    defaultVisible: 99,
  },
  // ---- Item Height Range ----
  {
    key: "itemHeightRange",
    label: "Item Height Range",
    options: FACET_OPTIONS.itemHeightRange,
    collapsible: true,
    defaultVisible: 6,
  },
  // ---- Furniture Levels ----
  {
    key: "furnitureLevels",
    label: "Furniture Levels",
    options: FACET_OPTIONS.furnitureLevels,
    collapsible: true,
    defaultVisible: 6,
  },
  // ---- Number of Perches ----
  {
    key: "numberOfPerches",
    label: "Number of Perches",
    options: FACET_OPTIONS.numberOfPerches,
    collapsible: true,
    defaultVisible: 6,
  },
  // ---- Number of Condos ----
  {
    key: "numberOfCondos",
    label: "Number of Condos",
    options: FACET_OPTIONS.numberOfCondos,
    collapsible: false,
    defaultVisible: 99,
  },
  // ---- Number of Scratch Posts ----
  {
    key: "numberOfScratchPosts",
    label: "Number of Scratch Posts",
    options: FACET_OPTIONS.numberOfScratchPosts,
    collapsible: true,
    defaultVisible: 6,
  },
  // ---- Training Collar Type ----
  {
    key: "trainingCollarType",
    label: "Training Collar Type",
    options: FACET_OPTIONS.trainingCollarType,
    collapsible: false,
    defaultVisible: 99,
  },
  // ---- Collar Closure Type ----
  {
    key: "collarClosureType",
    label: "Collar Closure Type",
    options: FACET_OPTIONS.collarClosureType,
    collapsible: false,
    defaultVisible: 99,
  },
  // ---- Harness Type ----
  {
    key: "harnessType",
    label: "Harness Type",
    options: FACET_OPTIONS.harnessType,
    collapsible: true,
    defaultVisible: 6,
  },
  // ---- Features — collapsible (38 options) ----
  {
    key: "features",
    label: "Features",
    options: FACET_OPTIONS.features,
    collapsible: true,
    defaultVisible: 6,
  },
  // ---- Dietary Preference — collapsible ----
  {
    key: "dietaryPreference",
    label: "Dietary Preference",
    options: FACET_OPTIONS.dietaryPreference,
    collapsible: true,
    defaultVisible: 6,
  },
  // ---- Quantity ----
  {
    key: "quantity",
    label: "Quantity",
    options: FACET_OPTIONS.quantity,
    collapsible: false,
    defaultVisible: 99,
  },
]

/**
 * Get a facet definition by key. Returns null for unknown keys.
 */
export function getFacet(key: string): FacetDefinition | null {
  if (key === "price") {
    return {
      key: "price",
      label: "Price",
      options: FACET_OPTIONS.priceBuckets,
      collapsible: false,
      defaultVisible: 99,
    }
  }
  if (key === "customerRating") {
    return {
      key: "customerRating",
      label: "Customer Rating",
      options: FACET_OPTIONS.customerRating,
      collapsible: false,
      defaultVisible: 99,
    }
  }
  return FACETS.find((f) => f.key === key) || null
}

/**
 * The set of facets to render for a given shop path. Always returns an
 * ordered array of FacetDefinition objects ready for the sidebar.
 */
export function getFacetsForPath(path: string): FacetDefinition[] {
  const keys = resolveFacetsForPath(path)
  // "categories" is a special case — it's the navigation tree, rendered by
  // the sidebar's CATEGORIES section, NOT a checkbox facet. Skip it here.
  return keys
    .filter((k) => k !== "categories")
    .map(getFacet)
    .filter((f): f is FacetDefinition => f !== null)
}
