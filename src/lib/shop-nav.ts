// ---------------------------------------------------------------------------
// Shop navigation data — the FULL cat + dog taxonomy tree per the owner's
// spec. Drives the mega menu, the shop sidebar, the HTML sitemap, and the
// SSR category pages. Data-driven: one change here updates every surface.
//
// URL pattern: /shop/{animal}/{department-slug}/{subcategory-slug}
// Per the Shop SEO Page Architecture spec §2 — segments are opaque path
// segments resolved from data.
//
// The tree mirrors the live taxonomy_nodes table (333 rows seeded by the
// Pet Supply Taxonomy SQL migration). This file is the client-side mirror
// of that data for mega-menu rendering (the server reads from the DB
// directly via getNavTree(); this file is for the client islands).
// ---------------------------------------------------------------------------

export type ShopNavSubcategory = {
  slug: string
  name: string
  productCount?: number
  children?: ShopNavSubcategory[]
}

export type ShopNavDepartment = {
  slug: string
  name: string
  productCount?: number
  subcategories: ShopNavSubcategory[]
}

export type ShopNavAnimal = {
  slug: string
  name: string
  tagline: string
  departments: ShopNavDepartment[]
}

export const SHOP_ANIMALS = [
  { slug: "cat", name: "Cat Supplies", href: "/shop/cat" },
  { slug: "dog", name: "Dog Supplies", href: "/shop/dog" },
  { slug: "fish", name: "Fish & Aquatics", href: "/shop/fish" },
  { slug: "bird", name: "Bird Supplies", href: "/shop/bird" },
  { slug: "reptile", name: "Reptile Supplies", href: "/shop/reptile" },
  { slug: "small-pet", name: "Small Animal Supplies", href: "/shop/small-pet" },
]

const cat = (slug: string) => slug

export const SHOP_NAV_TAXONOMY: ShopNavAnimal[] = [
  {
    slug: "cat",
    name: "Cat Supplies",
    tagline: "Everything for your feline family",
    departments: [
      {
        slug: "beds-bedding",
        name: "Cat Beds & Bedding",
        subcategories: [
          { slug: "bolster-cat-beds", name: "Bolster Cat Beds" },
          { slug: "cat-blankets-throws", name: "Cat Blankets & Throws" },
          { slug: "cat-cave-beds-hideaways", name: "Cat Cave Beds & Hideaways" },
          { slug: "heated-cat-beds", name: "Heated Cat Beds" },
          { slug: "pillow-cat-beds", name: "Pillow Cat Beds" },
        ],
      },
      {
        slug: "bowls-feeders",
        name: "Cat Bowls & Feeders",
        subcategories: [
          { slug: "automatic-cat-feeders", name: "Automatic Cat Feeders" },
          { slug: "cat-bowls", name: "Cat Bowls" },
          { slug: "cat-feeding-accessories", name: "Cat Feeding Accessories" },
          { slug: "cat-placemats", name: "Cat Placemats" },
        ],
      },
      {
        slug: "carriers-containment",
        name: "Cat Carriers & Containment",
        subcategories: [
          { slug: "cat-carriers-crates-kennels", name: "Cat Carriers, Crates & Kennels" },
          { slug: "cat-gates-doors", name: "Cat Gates & Doors" },
        ],
      },
      {
        slug: "cleaners-waste-disposal",
        name: "Cat Cleaners & Waste Disposal",
        subcategories: [],
      },
      {
        slug: "clothing-accessories",
        name: "Cat Clothing & Accessories",
        subcategories: [
        ],
      },
      {
        slug: "food",
        name: "Cat Food",
        subcategories: [
          { slug: "cat-broths-toppers", name: "Cat Broths & Toppers" },
          { slug: "fresh-frozen-freeze-dried-cat-food", name: "Fresh, Frozen, & Freeze-Dried Cat Food" },
          { slug: "veterinary-diet-cat-food", name: "Veterinary Diet Cat Food" },
          { slug: "wet-cat-food", name: "Wet Cat Food" },
        ],
      },
      {
        slug: "furniture-scratchers",
        name: "Cat Furniture & Scratchers",
        subcategories: [
          { slug: "cat-condos-covered-beds", name: "Cat Condos & Covered Beds" },
          { slug: "cat-scratching-posts-cardboard", name: "Cat Scratching Posts & Cardboard" },
          { slug: "cat-window-perches-wall-shelves", name: "Cat Window Perches & Wall Shelves" },
          { slug: "modern-cat-furniture", name: "Modern Cat Furniture" },
          { slug: "outdoor-cat-houses-furniture", name: "Outdoor Cat Houses & Furniture" },
        ],
      },
      {
        slug: "grooming-bathing",
        name: "Cat Grooming & Bathing",
        subcategories: [
          { slug: "grooming-tools", name: "Cat Brushes, Combs & Grooming Gloves" },
          { slug: "sprays-deodorizers", name: "Cat Deodorizers" },
          { slug: "nail-care", name: "Cat Nail Care" },
          { slug: "wipes", name: "Cat Wipes & Waterless Grooming" },
        ],
      },
      {
        slug: "health-wellness",
        name: "Cat Health & Wellness",
        subcategories: [
          { slug: "calming-aids-for-cats", name: "Calming Aids for Cats" },
          { slug: "cat-allergy-itch-relief", name: "Cat Allergy & Itch Relief" },
          { slug: "cat-dna-tests", name: "Cat DNA Tests" },
          { slug: "cat-dental-care", name: "Cat Dental Care" },
          { slug: "cat-ear-eye-care", name: "Cat Ear & Eye Care" },
          { slug: "cat-hairball-control", name: "Cat Hairball Control" },
          { slug: "cat-recovery-cones-surgical-suits", name: "Cat Recovery Cones & Surgical Suits" },
          { slug: "cat-vitamins-supplements", name: "Cat Vitamins & Supplements" },
        ],
      },
      {
        slug: "litter-litter-boxes-accessories",
        name: "Cat Litter, Litter Boxes & Accessories",
        subcategories: [
          { slug: "cat-litter", name: "Cat Litter" },
        ],
      },
      {
        slug: "steps-ramps",
        name: "Cat Steps & Ramps",
        subcategories: [],
      },
      {
        slug: "toys",
        name: "Cat Toys",
        subcategories: [
          { slug: "cat-ball-chaser-toys", name: "Cat Ball & Chaser Toys" },
          { slug: "cat-chew-toys", name: "Cat Chew Toys" },
          { slug: "cat-teasers-wands", name: "Cat Teasers & Wands" },
          { slug: "interactive-electronic-cat-toys", name: "Interactive & Electronic Cat Toys" },
          { slug: "mice-plush-cat-toys", name: "Mice & Plush Cat Toys" },
        ],
      },
      {
        slug: "training-behavior",
        name: "Cat Training & Behavior",
        subcategories: [
          { slug: "cat-repellents-deterrents", name: "Cat Repellents & Deterrents" },
        ],
      },
      {
        slug: "treats",
        name: "Cat Treats",
        subcategories: [
          { slug: "cat-dental-treats-chews", name: "Cat Dental Treats & Chews" },
          { slug: "catnip-cat-grass", name: "Catnip & Cat Grass" },
          { slug: "crunchy-cat-treats", name: "Crunchy Cat Treats" },
          { slug: "puree-lickable-cat-treats", name: "Puree & Lickable Cat Treats" },
          { slug: "soft-chewy-cat-treats", name: "Soft & Chewy Cat Treats" },
        ],
      },
      {
        slug: "flea-tick-solutions",
        name: "Flea & Tick Solutions for Cats",
        subcategories: [
          { slug: "cat-flea-tick-pills-chews", name: "Cat Flea & Tick Pills & Chews" },
          { slug: "cat-flea-prevention-collars", name: "Cat Flea Prevention Collars" },
          { slug: "cat-house-yard-flea-treatments", name: "Cat House & Yard Flea Treatments" },
          { slug: "flea-combs-for-cats", name: "Flea Combs for Cats" },
          { slug: "flea-drops-for-cats", name: "Flea Drops for Cats" },
          { slug: "flea-shampoo-for-cats", name: "Flea Shampoo for Cats" },
          { slug: "flea-sprays-for-cats", name: "Flea Sprays for Cats" },
        ],
      },
    ],
  },
  {
    slug: "dog",
    name: "Dog Supplies",
    tagline: "Everything for your canine companion",
    departments: [
      {
        slug: "cleaning-potty-supplies",
        name: "Cleaning & Potty Supplies",
        subcategories: [
          { slug: "artificial-grass-for-dogs", name: "Artificial Grass for Dogs" },
          { slug: "dog-diapers-wraps", name: "Dog Diapers & Wraps" },
          { slug: "dog-litter-litter-boxes", name: "Dog Litter & Litter Boxes" },
          { slug: "dog-poop-bags-dispensers", name: "Dog Poop Bags & Dispensers" },
          { slug: "dog-potty-pads", name: "Dog Potty Pads" },
          { slug: "dog-waste-disposal", name: "Dog Waste Disposal" },
        ],
      },
      {
        slug: "beds-bedding",
        name: "Dog Beds & Bedding",
        subcategories: [
          { slug: "cooling-dog-beds-pads", name: "Cooling Dog Beds & Pads" },
          { slug: "covered-dog-beds", name: "Covered Dog Beds" },
          { slug: "customizable-dog-beds", name: "Customizable Dog Beds" },
          { slug: "dog-couches-sofa-beds", name: "Dog Couches & Sofa Beds" },
          { slug: "dog-crate-mats-pads", name: "Dog Crate Mats & Pads" },
          { slug: "elevated-dog-beds-raised-cots", name: "Elevated Dog Beds & Raised Cots" },
          { slug: "furniture-protection-covers-for-dogs", name: "Furniture Protection & Covers for Dogs" },
          { slug: "heated-dog-beds-pads", name: "Heated Dog Beds & Pads" },
          { slug: "memory-foam-dog-beds", name: "Memory Foam Dog Beds" },
          { slug: "orthopedic-dog-beds", name: "Orthopedic Dog Beds" },
          { slug: "outdoor-dog-beds", name: "Outdoor Dog Beds" },
        ],
      },
      {
        slug: "bowls-feeding-supplies",
        name: "Dog Bowls & Feeding Supplies",
        subcategories: [
          { slug: "automatic-dog-feeders", name: "Automatic Dog Feeders" },
          { slug: "dog-bowls", name: "Dog Bowls" },
          { slug: "dog-food-scoops-accessories", name: "Dog Food Scoops & Accessories" },
          { slug: "dog-food-storage", name: "Dog Food Storage" },
          { slug: "dog-slow-feeders", name: "Dog Slow Feeders" },
          { slug: "dog-water-bottles", name: "Dog Water Bottles" },
          { slug: "dog-waterers-fountains-accessories", name: "Dog Waterers, Fountains & Accessories" },
          { slug: "lick-snuffle-mats-for-dogs", name: "Lick & Snuffle Mats for Dogs" },
        ],
      },
      {
        slug: "clothes-accessories",
        name: "Dog Clothes & Accessories",
        subcategories: [
          { slug: "dog-dog-apparel-accessories", name: "Dog Apparel Accessories" },
          { slug: "coats-jackets", name: "Dog Coats & Jackets" },
        ],
      },
      {
        slug: "collars-leashes-harnesses",
        name: "Dog Collars, Leashes & Harnesses",
        subcategories: [
          { slug: "dog-collars", name: "Dog Collars" },
          { slug: "dog-harnesses", name: "Dog Harnesses" },
          { slug: "dog-id-tags-accessories", name: "Dog ID Tags & Accessories" },
          { slug: "dog-leashes", name: "Dog Leashes" },
          { slug: "dog-stakes-tie-outs", name: "Dog Stakes & Tie-Outs" },
          { slug: "dog-walking-gear-sets", name: "Dog Walking Gear Sets" },
        ],
      },
      {
        slug: "crates-gates-housing-accessories",
        name: "Dog Crates, Gates, & Housing Accessories",
        subcategories: [
          { slug: "dog-crates-kennels-accessories", name: "Dog Crates, Kennels, & Accessories" },
          { slug: "dog-doors-flaps", name: "Dog Doors & Flaps" },
          { slug: "dog-gates-pens", name: "Dog Gates & Pens" },
          { slug: "outdoor-dog-enclosures", name: "Outdoor Dog Enclosures" },
        ],
      },
      {
        slug: "food",
        name: "Dog Food",
        subcategories: [
          { slug: "air-dried-dog-food", name: "Air-Dried Dog Food" },
          { slug: "dog-food-toppers", name: "Dog Food Toppers" },
          { slug: "dry-dog-food-kibble", name: "Dry Dog Food & Kibble" },
          { slug: "fresh-frozen-freeze-dried-dog-food", name: "Fresh, Frozen, & Freeze Dried Dog Food" },
          { slug: "wet-dog-food", name: "Wet Dog Food" },
        ],
      },
      {
        slug: "grooming-supplies",
        name: "Dog Grooming Supplies",
        subcategories: [
          { slug: "dog-dog-bathing-equipment-supplies", name: "Dog Bathing Equipment & Supplies" },
          { slug: "grooming-tools", name: "Dog Brushes, Combs, & Deshedding Tools" },
          { slug: "dog-dog-paw-nail-care", name: "Dog Paw & Nail Care" },
          { slug: "dog-dog-shampoos-conditioners-sprays", name: "Dog Shampoos, Conditioners & Sprays" },
          { slug: "wipes", name: "Dog Wipes & Waterless Grooming" },
        ],
      },
      {
        slug: "health-wellness",
        name: "Dog Health & Wellness",
        subcategories: [
          { slug: "dog-allergy-medicine-itch-relief", name: "Dog Allergy Medicine & Itch Relief" },
          { slug: "dog-calming-aids-and-supplements", name: "Dog Calming Aids and Supplements" },
          { slug: "dog-dental-care", name: "Dog Dental Care" },
          { slug: "dog-ear-eye-care", name: "Dog Ear & Eye Care" },
          { slug: "dog-first-aid-recovery", name: "Dog First Aid & Recovery" },
          { slug: "dog-pill-capsules", name: "Dog Pill Capsules" },
          { slug: "dog-vitamins-supplements", name: "Dog Vitamins & Supplements" },
        ],
      },
      {
        slug: "outdoor-travel-gear",
        name: "Dog Outdoor & Travel Gear",
        subcategories: [
          { slug: "car-accessories", name: "Dog Car Accessories" },
          { slug: "travel-gear-carriers", name: "Dog Carriers, Strollers & Totes" },
          { slug: "dog-stairs-ramps", name: "Dog Stairs & Ramps" },
        ],
      },
      {
        slug: "toys",
        name: "Dog Toys",
        subcategories: [
          { slug: "dental-dog-toys", name: "Dental Dog Toys" },
          { slug: "dog-chew-toys", name: "Dog Chew Toys" },
          { slug: "fetch-outdoor-dog-toys", name: "Fetch & Outdoor Dog Toys" },
          { slug: "interactive-treat-dispensing-dog-toys", name: "Interactive & Treat Dispensing Dog Toys" },
          { slug: "plush-dog-toys", name: "Plush Dog Toys" },
          { slug: "puppy-toys", name: "Puppy Toys" },
          { slug: "tough-durable-dog-toys", name: "Tough & Durable Dog Toys" },
        ],
      },
      {
        slug: "training-behavior-supplies",
        name: "Dog Training & Behavior Supplies",
        subcategories: [
          { slug: "dog-harnesses", name: "Dog Harnesses and Leashes for Pulling" },
        ],
      },
      {
        slug: "treats-chews",
        name: "Dog Treats & Chews",
        subcategories: [
          { slug: "alternative-rawhide-for-dogs", name: "Alternative Rawhide for Dogs" },
          { slug: "bakery-dog-treats", name: "Bakery Dog Treats" },
          { slug: "bully-sticks-for-dogs", name: "Bully Sticks for Dogs" },
          { slug: "dental-dog-chews", name: "Dental Dog Chews" },
          { slug: "dog-biscuits-cookies-snacks", name: "Dog Biscuits, Cookies & Snacks" },
          { slug: "dog-bones-chews", name: "Dog Bones & Chews" },
          { slug: "dog-training-treats", name: "Dog Training Treats" },
          { slug: "freeze-dried-dog-treats", name: "Freeze-Dried Dog Treats" },
          { slug: "jerky-dog-treats", name: "Jerky Dog Treats" },
        ],
      },
      {
        slug: "flea-tick-solutions",
        name: "Flea & Tick Solutions for Dogs",
        subcategories: [
          { slug: "dog-flea-tick-combs", name: "Dog Flea & Tick Combs" },
          { slug: "flea-tick-prevention-collars-for-dogs", name: "Flea & Tick Prevention Collars for Dogs" },
          { slug: "flea-bombs-foggers-for-dogs", name: "Flea Bombs & Foggers for Dogs" },
          { slug: "topical-flea-tick-treatment-for-dogs", name: "Topical Flea & Tick Treatment" },
        ],
      },
    ],
  },
  {
    slug: "fish",
    name: "Fish & Aquatics",
    tagline: "Aquariums, water care, and supplies for aquatic life",
    departments: [
      {
        slug: "aquatics",
        name: "Aquatics",
        subcategories: [
          { slug: "accessories", name: "Accessories" },
          { slug: "aquarium-cleaning", name: "Aquarium Cleaning" },
          { slug: "aquariums", name: "Aquariums" },
          { slug: "aquariums-parts", name: "Aquariums Parts" },
          { slug: "decor", name: "Decor" },
          { slug: "filter-cartridges", name: "Filter Cartridges" },
          { slug: "filters-pumps", name: "Filters & Pumps" },
          { slug: "food", name: "Food" },
          { slug: "heaters-gauges", name: "Heaters & Gauges" },
          { slug: "light-fixtures-bulbs", name: "Light Fixtures & Bulbs" },
          { slug: "supplements", name: "Supplements" },
          { slug: "water-care", name: "Water Care" },
        ],
      },
    ],
  },
  {
    slug: "bird",
    name: "Bird Supplies",
    tagline: "Food, perches, toys, and everyday care for birds",
    departments: [
      {
        slug: "bird",
        name: "Bird",
        subcategories: [
          { slug: "cage", name: "Cage" },
          { slug: "cage-accessory", name: "Cage Accessory" },
          { slug: "food", name: "Food" },
          { slug: "mineral-block", name: "Mineral Block" },
          { slug: "perches", name: "Perches" },
          { slug: "supplements", name: "Supplements" },
          { slug: "toys", name: "Toys" },
          { slug: "treats", name: "Treats" },
          { slug: "wild-bird-food", name: "Wild Bird Food" },
        ],
      },
    ],
  },
  {
    slug: "reptile",
    name: "Reptile Supplies",
    tagline: "Habitat essentials, food, heat, and lighting for reptiles",
    departments: [
      {
        slug: "reptile",
        name: "Reptile",
        subcategories: [
          { slug: "bedding-substrates", name: "Bedding and Substrates" },
          { slug: "cleaning", name: "Cleaning" },
          { slug: "decor", name: "Decor" },
          { slug: "dishes", name: "Dishes" },
          { slug: "filter-pumps", name: "Filter & Pumps" },
          { slug: "food", name: "Food" },
          { slug: "habitat-accessory", name: "Habitat Accessory" },
          { slug: "habitats", name: "Habitats" },
          { slug: "heaters-gauges", name: "Heaters & Gauges" },
          { slug: "light-fixtures-bulbs", name: "Light Fixtures & Bulbs" },
          { slug: "liners", name: "Liners" },
          { slug: "supplements", name: "Supplements" },
          { slug: "treats", name: "Treats" },
        ],
      },
    ],
  },
  {
    slug: "small-pet",
    name: "Small Animal Supplies",
    tagline: "Habitat, bedding, food, and enrichment for small pets",
    departments: [
      {
        slug: "small-animal",
        name: "Small Animal",
        subcategories: [
          { slug: "accessories", name: "Accessories" },
          { slug: "bedding", name: "Bedding" },
          { slug: "dishes-waterers", name: "Dishes & Waterers" },
          { slug: "feeders-waterers", name: "Feeders and Waterers" },
          { slug: "food", name: "Food" },
          { slug: "food-ferret", name: "Food Ferret" },
          { slug: "food-hamster", name: "Food Hamster" },
          { slug: "food-hamster-gerbil", name: "Food Hamster and Gerbil" },
          { slug: "food-rabbit", name: "Food Rabbit" },
          { slug: "grooming", name: "Grooming" },
          { slug: "habitats", name: "Habitats" },
          { slug: "litter", name: "Litter" },
          { slug: "supplements", name: "Supplements" },
          { slug: "toys", name: "Toys" },
          { slug: "treats", name: "Treats" },
          { slug: "treats-ferret", name: "Treats Ferret" },
        ],
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Helpers — build full paths from the taxonomy tree
// ---------------------------------------------------------------------------

export function departmentPath(animalSlug: string, deptSlug: string): string {
  return `/shop/${animalSlug}/${deptSlug}`
}

export function subcategoryPath(animalSlug: string, deptSlug: string, subSlug: string): string {
  return `/shop/${animalSlug}/${deptSlug}/${subSlug}`
}

// Flatten the tree for sitemap + sidebar rendering
export function flattenTaxonomy(): { animal: string; department: string; subcategory?: string; path: string; name: string }[] {
  const flat: { animal: string; department: string; subcategory?: string; path: string; name: string }[] = []
  for (const animal of SHOP_NAV_TAXONOMY) {
    for (const dept of animal.departments) {
      flat.push({ animal: animal.slug, department: dept.slug, path: departmentPath(animal.slug, dept.slug), name: dept.name })
      for (const sub of dept.subcategories) {
        flat.push({ animal: animal.slug, department: dept.slug, subcategory: sub.slug, path: subcategoryPath(animal.slug, dept.slug, sub.slug), name: sub.name })
      }
    }
  }
  return flat
}

// Backwards compat — the old ShopNavBar still imports SHOP_NAV_CATEGORIES.
// This wraps the new taxonomy in the old shape so the existing component
// keeps rendering until we update the mega-menu component.
export type ShopCategory = {
  slug: string
  name: string
  subcategories: { slug: string; name: string }[]
  whatsNew: { label: string; href: string }[]
  images: { src: string; alt: string; href: string }[]
}

export const SHOP_NAV_CATEGORIES = SHOP_NAV_TAXONOMY.flatMap(animal =>
  animal.departments.map(dept => ({
    slug: `${animal.slug}/${dept.slug}`,
    name: dept.name,
    subcategories: dept.subcategories.map(sub => ({ slug: sub.slug, name: sub.name })),
    whatsNew: dept.subcategories.slice(0, 3).map(sub => ({
      label: sub.name,
      href: subcategoryPath(animal.slug, dept.slug, sub.slug),
    })),
    images: [
      { src: "/Shop/heroes/beagle.jpeg", alt: `${dept.name} — UnSaid Memories`, href: departmentPath(animal.slug, dept.slug) },
      { src: "/Shop/heroes/cocker-spaniel.jpeg", alt: `${dept.name} — UnSaid Memories`, href: departmentPath(animal.slug, dept.slug) },
      { src: "/Shop/heroes/pomeranian.jpeg", alt: `${dept.name} — UnSaid Memories`, href: departmentPath(animal.slug, dept.slug) },
    ],
  }))
)

// Legacy compat — old code imports `cat()` helper
export { departmentPath as cat }

// ---------------------------------------------------------------------------
// Convert SHOP_NAV_TAXONOMY → NavCategory[] shape (the sidebar's existing
// contract from src/lib/shop/types.ts). The sidebar used to read the OLD
// legacy SQL taxonomy via getNavTree() (Feeding & Watering, Grooming, Beds
// & Furniture, Treats, Apparel & Accessories, Chew Toys, …). That no longer
// matches the new shop routes (/shop/cat, /shop/dog/food, …). This converter
// produces the new NavCategory tree directly from SHOP_NAV_TAXONOMY so the
// sidebar renders the real cat/dog departments the owner specified.
//
// Shape produced:
//   level 0  →  animal (Dog Supplies, Cat Supplies) — virtual parent
//   level 1  →  department (Dog Food, Dog Treats, …) — primary
//   level 2  →  subcategory (Dry Dog Food, Wet Dog Food, …) — leaf
// ---------------------------------------------------------------------------

type NavCategoryLike = {
  key: string
  displayName: string
  path: string
  level: number
  count: number
  rawIds: number[]
  children: NavCategoryLike[]
  parentKey: string | null
}

export function buildNavTreeFromTaxonomy(): NavCategoryLike[] {
  const tree: NavCategoryLike[] = []
  for (const animal of SHOP_NAV_TAXONOMY) {
    const animalNode: NavCategoryLike = {
      key: animal.slug,
      displayName: animal.name,
      path: `/shop/${animal.slug}`,
      level: 0,
      count: 0,
      rawIds: [],
      parentKey: null,
      children: animal.departments.map((dept) => ({
        key: `${animal.slug}/${dept.slug}`,
        displayName: dept.name,
        path: departmentPath(animal.slug, dept.slug),
        level: 1,
        count: 0,
        rawIds: [],
        parentKey: animal.slug,
        children: dept.subcategories.map((sub) => ({
          key: `${animal.slug}/${dept.slug}/${sub.slug}`,
          displayName: sub.name,
          path: subcategoryPath(animal.slug, dept.slug, sub.slug),
          level: 2,
          count: 0,
          rawIds: [],
          parentKey: `${animal.slug}/${dept.slug}`,
          children: [],
        })),
      })),
    }
    tree.push(animalNode)
  }
  return tree
}
