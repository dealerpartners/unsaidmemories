// Category imagery for the non-cat/dog species (fish, bird, reptile, small-pet),
// sourced from Wikimedia Commons via scripts/import-shop-images.mjs. The script
// writes both this mapping (src/lib/shop/category-images.json) and the JPGs at
// public/Shop/categories/*.jpg. Re-run the script (FORCE=1 to re-download) to
// refresh either side — this loader stays compatible as long as the JSON shape
// (taxonomy path -> public image URL) is preserved.
import raw from "./category-images.json"

const MAP = raw as Record<string, string>

/**
 * Resolve a taxonomy path ("fish", "fish/aquatics/food") to its category
 * image URL, walking up toward the species level when there is no exact
 * match ("fish/aquatics/x" -> "fish/aquatics" -> "fish").
 * Returns undefined for cat/dog paths (those use the generated department
 * imagery at /Shop/departments instead).
 */
export function categoryImage(taxonomyPath?: string | null): string | undefined {
  if (!taxonomyPath) return undefined
  const key = taxonomyPath.replace(/^\/+|\/+$/g, "")
  if (!key) return undefined
  if (MAP[key]) return MAP[key]
  const segments = key.split("/")
  while (segments.length > 0) {
    segments.pop()
    const candidate = segments.join("/")
    if (candidate && MAP[candidate]) return MAP[candidate]
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Cat/dog department imagery. Resolves by animal + department CONCEPT (not
// exact slug), so the many live-taxonomy spellings ("dog-beds",
// "dog-beds-and-bedding", "beds-bedding") all land on the same owner-designed
// asset and an animal never borrows another animal's picture.
// ---------------------------------------------------------------------------
const DEPT = "/Shop/departments/"

const CONCEPTS: { concept: string; test: RegExp }[] = [
  { concept: "flea", test: /flea|tick/ },
  { concept: "litter", test: /litter/ },
  { concept: "cleanup", test: /clean|potty|waste/ },
  { concept: "toys", test: /toy/ },
  { concept: "treats", test: /treat|chew/ },
  { concept: "food", test: /food/ },
  { concept: "bowls", test: /bowl|feeder|feeding|water/ },
  { concept: "beds", test: /bed/ },
  { concept: "collars", test: /collar|leash|harness/ },
  { concept: "crates", test: /crate|carrier|containment|kennel|housing|gate/ },
  { concept: "grooming", test: /groom|bath/ },
  { concept: "health", test: /health|wellness/ },
  { concept: "training", test: /train|behavior/ },
  { concept: "apparel", test: /apparel|cloth/ },
  { concept: "travel", test: /travel|outdoor/ },
  { concept: "furniture", test: /furniture|scratch|tree/ },
  { concept: "steps", test: /step|ramp/ },
]

const DEPT_FILES: Record<string, Record<string, string>> = {
  cat: {
    flea: "cat-flea-tick.jpeg",
    litter: "cat-litter.jpeg",
    cleanup: "cat-cleaners-waste-disposal.jpeg",
    treats: "cat-treats.jpeg",
    toys: "cat-toys.jpeg",
    food: "cat-food.jpeg",
    bowls: "cat-bowls-feeders.jpeg",
    beds: "cat-beds-bedding.jpeg",
    collars: "cat-collars-leashes-harnesses.png",
    crates: "cat-carriers-containment.jpeg",
    grooming: "cat-grooming-bathing.jpeg",
    health: "cat-health-wellness-extra.jpeg",
    training: "cat-training-behavior.jpeg",
    apparel: "cat-clothing-accessories.jpeg",
    travel: "cat-carriers-containment.jpeg",
    furniture: "cat-furniture-scratchers.jpeg",
    steps: "cat-steps-ramps.jpeg",
  },
  dog: {
    flea: "dog-flea-tick.jpeg",
    cleanup: "dog-cleaning-potty-supplies.jpeg",
    treats: "dog-treats-chews.jpeg",
    toys: "dog-toys.jpeg",
    food: "dog-food.jpeg",
    bowls: "dog-bowls-feeding.jpeg",
    beds: "dog-beds-bedding.jpeg",
    collars: "dog-collars-harnesses-leashes.jpeg",
    crates: "dog-crates-containment.jpeg",
    grooming: "dog-grooming-bathing.jpeg",
    health: "dog-health-wellness.jpeg",
    training: "dog-training-behavior.png",
    apparel: "dog-apparel-accessories.jpeg",
    travel: "dog-outdoor-travel-gear.jpeg",
  },
}

const ANIMAL_IMAGE: Record<string, string> = {
  dog: DEPT + "dog-food.jpeg",
  cat: DEPT + "cat-food.jpeg",
  fish: "/Shop/categories/fish.jpg",
  bird: "/Shop/categories/bird.jpg",
  reptile: "/Shop/categories/reptile.jpg",
  "small-pet": "/Shop/categories/small-pet.jpg",
  "small-animal": "/Shop/categories/small-pet.jpg",
}

export function categoryConcept(label: string): string | null {
  const s = label.toLowerCase()
  for (const c of CONCEPTS) if (c.test.test(s)) return c.concept
  return null
}

/** Animal-correct cat/dog department image, or null if none exists. */
export function departmentImage(animal: string, label: string): string | null {
  const concept = categoryConcept(label)
  const file = concept ? DEPT_FILES[animal]?.[concept] : undefined
  return file ? DEPT + file : null
}

/** Representative image for an animal — never another animal's. */
export function animalImage(animal: string): string | null {
  return ANIMAL_IMAGE[animal] ?? null
}
