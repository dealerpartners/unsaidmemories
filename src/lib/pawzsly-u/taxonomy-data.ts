import { CategoryNode, GuidePageData } from './types';
import { DOMAIN_PROFILES } from './domain-knowledge';
import { FEEDING_WATERING_PROFILES } from './feeding-watering-data';
import { GROOMING_ESSENTIALS_PROFILES } from './grooming-essentials-data';
import { ARTICLE_BODIES, ARTICLE_DEFAULT_AUTHOR, articleHeroImage, articleHeroAlt } from '../seopages/article-bodies';
import type { ArticleBody } from '../seopages/article-bodies/types';
import { seoUrl } from './site-url';

// Full product categories matching prompt
export const PRODUCT_CATEGORIES: CategoryNode[] = [
  {
    name: 'Feeding & Watering',
    slug: 'feeding-and-watering',
    children: [
      { name: 'Water Bottles', slug: 'water-bottles' },
      { name: 'Nursing Supplies', slug: 'nursing-supplies' },
      { name: 'Lick Mats', slug: 'lick-mats' },
      { name: 'Fountains', slug: 'fountains' },
      { name: 'Food Storage', slug: 'food-storage' },
      { name: 'Feeding Mats', slug: 'feeding-mats' },
      { name: 'Bowls & Dishes', slug: 'bowls-and-dishes' },
      { name: 'Automatic Feeders', slug: 'automatic-feeders' },
    ],
  },
  {
    name: 'Grooming at home',
    slug: 'grooming-at-home',
  },
  {
    name: 'Grooming Essentials: Needed for Home Care',
    slug: 'grooming-essentials',
    children: [
      { name: 'Styptic Gels & Powders', slug: 'styptic-gels-and-powders' },
      { name: 'Shower & Bath Supplies', slug: 'shower-and-bath-supplies' },
      { name: 'Shedding Tools', slug: 'shedding-tools' },
      { name: 'Shampoos & Conditioners', slug: 'shampoos-and-conditioners' },
      { name: 'Scissors', slug: 'scissors' },
      { name: 'Hair Removal Mitts & Rollers', slug: 'hair-removal-mitts-and-rollers' },
      { name: 'Grooming Wipes', slug: 'grooming-wipes' },
      { name: 'Electric Clippers & Blades', slug: 'electric-clippers-and-blades' },
      { name: 'Deodorizers', slug: 'deodorizers' },
      { name: 'Dematting Tools', slug: 'dematting-tools' },
      { name: 'Medicated Shampoos', slug: 'medicated-shampoos' },
    ],
  },
  {
    name: 'Beds & Furniture',
    slug: 'beds-and-furniture',
    children: [
      { name: 'Stairs & Steps', slug: 'stairs-and-steps' },
      { name: 'Sofas & Chairs', slug: 'sofas-and-chairs' },
      { name: 'Furniture-Style Crates', slug: 'furniture-style-crates' },
      { name: 'Beds', slug: 'beds' },
      { name: 'Bed Pillows', slug: 'bed-pillows' },
      { name: 'Bed Mats', slug: 'bed-mats' },
      { name: 'Bed Liners', slug: 'bed-liners' },
      { name: 'Bed Covers', slug: 'bed-covers' },
      { name: 'Bed Blankets', slug: 'bed-blankets' },
    ],
  },
  {
    name: 'Treats',
    slug: 'treats',
    children: [
      { name: 'Snacks', slug: 'snacks' },
      { name: 'Biscuits', slug: 'biscuits' },
      { name: 'Cookies', slug: 'cookies' },
    ],
  },
  {
    name: 'Apparel & Accessories',
    slug: 'apparel-and-accessories',
    children: [
      { name: 'Sweaters', slug: 'sweaters' },
      { name: 'Sunglasses', slug: 'sunglasses' },
      { name: 'Shirts', slug: 'shirts' },
      { name: 'Raincoats', slug: 'raincoats' },
      { name: 'Necklaces & Pendants', slug: 'necklaces-and-pendants' },
      { name: 'Lifejackets', slug: 'lifejackets' },
      { name: 'Hoodies', slug: 'hoodies' },
      { name: 'Hats', slug: 'hats' },
      { name: 'Hair Accessories', slug: 'hair-accessories' },
      { name: 'Dresses', slug: 'dresses' },
    ],
  },
  {
    name: 'Chew Toys',
    slug: 'chew-toys',
  },
  {
    name: 'Collars, Harnesses & Leashes',
    slug: 'collars-harnesses-and-leashes',
    children: [
      { name: 'Activity Trackers', slug: 'activity-trackers' },
      { name: 'Location Trackers', slug: 'location-trackers' },
      { name: 'ID Tags & Collar Accessories', slug: 'id-tags-and-collar-accessories' },
      { name: 'Muzzles', slug: 'muzzles' },
      { name: 'Leashes', slug: 'leashes' },
      { name: 'Harnesses', slug: 'harnesses' },
      { name: 'Collars', slug: 'collars' },
    ],
  },
  {
    name: 'Travel & Outdoor',
    slug: 'travel-and-outdoor',
    children: [
      { name: 'Strollers', slug: 'strollers' },
      { name: 'Slings', slug: 'slings' },
      { name: 'Purses', slug: 'purses' },
      { name: 'Carriers', slug: 'carriers' },
      { name: 'Car Travel Accessories', slug: 'car-travel-accessories' },
      { name: 'Bicycle Trailers', slug: 'bicycle-trailers' },
      { name: 'Bicycle Carriers', slug: 'bicycle-carriers' },
      { name: 'Backpack Carriers', slug: 'backpack-carriers' },
    ],
  },
  {
    name: 'Wellness',
    slug: 'wellness',
    children: [
      { name: 'Supplements & Vitamins', slug: 'supplements-and-vitamins' },
      { name: 'Itch Remedies', slug: 'itch-remedies' },
      { name: 'Hip & Joint Care', slug: 'hip-and-joint-care' },
      { name: 'Eye Care', slug: 'eye-care' },
      { name: 'Ear Care', slug: 'ear-care' },
      { name: 'DNA Tests', slug: 'dna-tests' },
      { name: 'Digestive Remedies', slug: 'digestive-remedies' },
      { name: 'Dental Care', slug: 'dental-care' },
    ],
  },
  {
    name: 'Fish & Aquatics',
    slug: 'fish-and-aquatics',
    children: [
      {
        name: 'Aquatics',
        slug: 'aquatics',
        children: [
          { name: 'Accessories', slug: 'accessories' },
          { name: 'Aquarium Cleaning', slug: 'aquarium-cleaning' },
          { name: 'Aquariums', slug: 'aquariums' },
          { name: 'Aquariums Parts', slug: 'aquarium-parts' },
          { name: 'Decor', slug: 'aquarium-decor' },
          { name: 'Filter Cartridges', slug: 'filter-cartridges' },
          { name: 'Filters & Pumps', slug: 'filters-and-pumps' },
          { name: 'Food', slug: 'aquatic-food' },
          { name: 'Heaters & Gauges', slug: 'heaters-and-gauges' },
          { name: 'Light Fixtures & Bulbs', slug: 'light-fixtures-and-bulbs' },
          { name: 'Supplements', slug: 'aquatic-supplements' },
          { name: 'Water Care', slug: 'water-care' },
        ],
      },
    ],
  },
  {
    name: 'Bird',
    slug: 'bird',
    children: [
      { name: 'Cage', slug: 'cage' },
      { name: 'Cage Accessory', slug: 'cage-accessory' },
      { name: 'Food', slug: 'bird-food' },
      { name: 'Mineral Block', slug: 'mineral-block' },
      { name: 'Perches', slug: 'perches' },
      { name: 'Supplements', slug: 'bird-supplements' },
      { name: 'Toys', slug: 'bird-toys' },
      { name: 'Treats', slug: 'bird-treats' },
      { name: 'Wild Bird Food', slug: 'wild-bird-food' },
    ],
  },
  {
    name: 'Reptile',
    slug: 'reptile',
    children: [
      { name: 'Bedding and Substrates', slug: 'bedding-and-substrates' },
      { name: 'Cleaning', slug: 'reptile-cleaning' },
      { name: 'Decor', slug: 'reptile-decor' },
      { name: 'Dishes', slug: 'reptile-dishes' },
      { name: 'Filter & Pumps', slug: 'reptile-filters-and-pumps' },
      { name: 'Food', slug: 'reptile-food' },
      { name: 'Habitat Accessory', slug: 'habitat-accessory' },
      { name: 'Habitats', slug: 'habitats' },
      { name: 'Heaters & Gauges', slug: 'reptile-heaters-and-gauges' },
      { name: 'Light Fixtures & Bulbs', slug: 'reptile-light-fixtures-and-bulbs' },
      { name: 'Liners', slug: 'liners' },
      { name: 'Supplements', slug: 'reptile-supplements' },
      { name: 'Treats', slug: 'reptile-treats' },
    ],
  },
  {
    name: 'Small Animal',
    slug: 'small-animal',
    children: [
      { name: 'Accessories', slug: 'small-animal-accessories' },
      { name: 'Bedding', slug: 'bedding' },
      { name: 'Dishes & Waterers', slug: 'dishes-and-waterers' },
      { name: 'Feeders and Waterers', slug: 'feeders-and-waterers' },
      { name: 'Food', slug: 'small-animal-food' },
      { name: 'Food Ferret', slug: 'food-ferret' },
      { name: 'Food Hamster', slug: 'food-hamster' },
      { name: 'Food Hamster and Gerbil', slug: 'food-hamster-and-gerbil' },
      { name: 'Food Rabbit', slug: 'food-rabbit' },
      { name: 'Grooming', slug: 'small-animal-grooming' },
      { name: 'Habitats', slug: 'small-animal-habitats' },
      { name: 'Litter', slug: 'litter' },
      { name: 'Supplements', slug: 'small-animal-supplements' },
      { name: 'Toys', slug: 'small-animal-toys' },
      { name: 'Treats', slug: 'small-animal-treats' },
      { name: 'Treats Ferret', slug: 'treats-ferret' },
    ],
  },
];

// Full guides directory structure matching user prompt
export const GUIDES_DIRECTORY = [
  {
    pillar: 'Grooming',
    anchor: '/guides#grooming',
    subcategories: [
      {
        name: 'First-timer series (5)',
        items: [
          { name: "Puppy's First Groom: Stress-Free Prep", slug: 'puppys-first-groom', path: '/puppys-first-groom' },
          { name: "Kitten's First Groom: Gentle Touch Guide", slug: 'kittens-first-groom', path: '/kittens-first-groom' },
          { name: "Adult Rescue's First Salon Visit", slug: 'adult-rescues-first', path: '/adult-rescues-first' },
          { name: 'What to Bring to Your Grooming Appointment', slug: 'what-to-bring-to-grooming', path: '/what-to-bring-to-grooming' },
          { name: 'Vaccination Rules & Rabies Protocols for Grooming', slug: 'vaccination-rules-for-grooming', path: '/vaccination-rules-for-grooming' },
        ],
      },
      {
        name: 'Dog Breed Grooming (30)',
        items: [
          { name: 'Labrador Retriever Grooming Guide', slug: 'labrador-retriever-grooming', path: '/labrador-retriever-grooming' },
          { name: 'Golden Retriever Grooming & Coat Care', slug: 'golden-retriever-grooming', path: '/golden-retriever-grooming' },
          { name: 'Poodle Grooming Cuts & Maintenance', slug: 'poodle-grooming', path: '/poodle-grooming' },
          { name: 'Doodle Grooming (Goldendoodle & Labradoodle)', slug: 'doodle-grooming', path: '/doodle-grooming' },
          { name: 'Siberian Husky Undercoat Deshedding', slug: 'siberian-husky-grooming', path: '/siberian-husky-grooming' },
          { name: 'German Shepherd Grooming Standards', slug: 'german-shepherd-grooming', path: '/german-shepherd-grooming' },
          { name: 'Beagle Grooming & Bathing Guide', slug: 'beagle-grooming', path: '/beagle-grooming' },
          { name: 'Bulldog Skin Fold & Wrinkle Care', slug: 'bulldog-grooming', path: '/bulldog-grooming' },
          { name: 'Shih Tzu Coat Styling & Daily Brushing', slug: 'shih-tzu-grooming', path: '/shih-tzu-grooming' },
          { name: 'Yorkshire Terrier Silky Coat Care', slug: 'yorkshire-terrier-grooming', path: '/yorkshire-terrier-grooming' },
          { name: 'Maltese Tear Stain & Coat Maintenance', slug: 'maltese-grooming', path: '/maltese-grooming' },
          { name: 'Pomeranian Fluff & Undercoat Care', slug: 'pomeranian-grooming', path: '/pomeranian-grooming' },
          { name: 'Corgi Double-Coat Seasonal Shedding', slug: 'corgi-grooming', path: '/corgi-grooming' },
          { name: 'Dachshund Smooth, Wire & Longhair Grooming', slug: 'dachshund-grooming', path: '/dachshund-grooming' },
          { name: 'Boxer Short Coat Bathing & Paw Care', slug: 'boxer-grooming', path: '/boxer-grooming' },
          { name: 'Rottweiler Skin & Nail Trimming Guide', slug: 'rottweiler-grooming', path: '/rottweiler-grooming' },
          { name: 'Doberman Pinscher Coat Conditioning', slug: 'doberman-grooming', path: '/doberman-grooming' },
          { name: 'Great Dane Gentle Giant Bathing Guide', slug: 'great-dane-grooming', path: '/great-dane-grooming' },
          { name: 'Chihuahua Gentle Grooming & Nail Grinding', slug: 'chihuahua-grooming', path: '/chihuahua-grooming' },
          { name: 'Pug Facial Fold Cleaning & Deshedding', slug: 'pug-grooming', path: '/pug-grooming' },
          { name: 'Border Collie Agility Coat Care', slug: 'border-collie-grooming', path: '/border-collie-grooming' },
          { name: 'Australian Shepherd Feathering & Grooming', slug: 'australian-shepherd-grooming', path: '/australian-shepherd-grooming' },
          { name: 'Cocker Spaniel Ear Care & Skirt Maintenance', slug: 'cocker-spaniel-grooming', path: '/cocker-spaniel-grooming' },
          { name: 'Bichon Frise Powder-Puff Scissoring', slug: 'bichon-frise-grooming', path: '/bichon-frise-grooming' },
          { name: 'Schnauzer Beard & Furnishings Care', slug: 'schnauzer-grooming', path: '/schnauzer-grooming' },
          { name: 'Bernese Mountain Dog Heavy Coat Care', slug: 'bernese-mountain-dog-grooming', path: '/bernese-mountain-dog-grooming' },
          { name: 'Newfoundland Giant Coat Bathing Protocol', slug: 'newfoundland-grooming', path: '/newfoundland-grooming' },
          { name: 'Greyhound Sensitive Skin Grooming', slug: 'greyhound-grooming', path: '/greyhound-grooming' },
          { name: 'Shiba Inu Blow-Coat Season Management', slug: 'shiba-inu-grooming', path: '/shiba-inu-grooming' },
          { name: 'French Bulldog Facial Hygiene & Bathing', slug: 'french-bulldog-grooming', path: '/french-bulldog-grooming' },
        ],
      },
      {
        name: 'Cat Breed Grooming (10)',
        items: [
          { name: 'Persian Cat Daily Combing & Eye Care', slug: 'persian-grooming', path: '/persian-grooming' },
          { name: 'Maine Coon Majestic Coat & Ruff Care', slug: 'maine-coon-grooming', path: '/maine-coon-grooming' },
          { name: 'Ragdoll Fur Matting Prevention', slug: 'ragdoll-grooming', path: '/ragdoll-grooming' },
          { name: 'Sphynx Hairless Skin Bathing & Oil Balance', slug: 'sphynx-grooming', path: '/sphynx-grooming' },
          { name: 'British Shorthair Dense Plush Coat Care', slug: 'british-shorthair-grooming', path: '/british-shorthair-grooming' },
          { name: 'Siamese Sleek Coat & Claw Trimming', slug: 'siamese-grooming', path: '/siamese-grooming' },
          { name: 'Bengal Glitter Coat & Bath Habituation', slug: 'bengal-grooming', path: '/bengal-grooming' },
          { name: 'Scottish Fold Ear & Fur Maintenance', slug: 'scottish-fold-grooming', path: '/scottish-fold-grooming' },
          { name: 'Russian Blue Silver Tipped Coat Care', slug: 'russian-blue-grooming', path: '/russian-blue-grooming' },
          { name: 'Domestic Shorthair Seasonal Deshedding', slug: 'domestic-shorthair-grooming', path: '/domestic-shorthair-grooming' },
        ],
      },
      {
        name: 'Coat-Type Guides (5)',
        items: [
          { name: 'Double-Coat Grooming: Never Shave Undercoats', slug: 'double-coat-grooming', path: '/double-coat-grooming' },
          { name: 'Curly & Hypoallergenic Coat Maintenance', slug: 'curly-hypoallergenic-coat-grooming', path: '/curly-hypoallergenic-coat-grooming' },
          { name: 'Long & Silky Coat Detangling Protocols', slug: 'long-silky-coat-grooming', path: '/long-silky-coat-grooming' },
          { name: 'Short & Smooth Coat Bathing & Shine', slug: 'short-smooth-coat-grooming', path: '/short-smooth-coat-grooming' },
          { name: 'Hairless Cat Skin Health & Hygiene', slug: 'hairless-cat-grooming', path: '/hairless-cat-grooming' },
        ],
      },
      {
        name: 'Deep Grooming Articles (8)',
        items: [
          { name: 'How Often to Bathe & Groom by Breed, Coat & Lifestyle', slug: 'how-often-to-bathe-groom-by-breed-coat-lifestyle', path: '/how-often-to-bathe-groom-by-breed-coat-lifestyle' },
          { name: 'Matted Coats: Prevention, Dematting vs Shave-Down', slug: 'matted-coats-prevention-dematting-vs-shave-down', path: '/matted-coats-prevention-dematting-vs-shave-down' },
          { name: 'Deshedding & "Blowing Coat" Seasonal Cycles', slug: 'deshedding-blowing-coat-seasons', path: '/deshedding-blowing-coat-seasons' },
          { name: 'Nail Trimming: Grinder vs Clipper & Black Nail Safety', slug: 'nail-trimming-grinder-vs-clipper-black-nail-guide', path: '/nail-trimming-grinder-vs-clipper-black-nail-guide' },
          { name: 'Ears, Eyes & Teeth Cleaning Protocols by Breed', slug: 'ears-eyes-teeth-cleaning-by-breed', path: '/ears-eyes-teeth-cleaning-by-breed' },
          { name: 'Anxious & Senior Pet Gentle Grooming Accommodations', slug: 'anxious-and-senior-pet-grooming', path: '/anxious-and-senior-pet-grooming' },
          { name: 'Style Glossary: Puppy Cut, Teddy Bear & Lion Cut', slug: 'style-glossary-puppy-cut-teddy-bear-lion-cut', path: '/style-glossary-puppy-cut-teddy-bear-lion-cut' },
          { name: 'Seasonal Cuts: Summer Heat, Winter Paw Care & Allergy Skin', slug: 'seasonal-summer-cuts-winter-paw-care-allergy-skin', path: '/seasonal-summer-cuts-winter-paw-care-allergy-skin' },
        ],
      },
    ],
  },
  {
    pillar: 'Nutrition',
    anchor: '/guides#nutrition',
    subcategories: [
      {
        name: 'Diet Finder by Life Stage (4)',
        items: [
          { name: 'Puppy Diet Finder: Growth & Calorie Calculator', slug: 'puppy-diet-finder', path: '/puppy-diet-finder' },
          { name: 'Kitten Diet Finder: Protein & Hydration Needs', slug: 'kitten-diet-finder', path: '/kitten-diet-finder' },
          { name: 'Adult Cat Diet Finder: Urinary Health & Moisture', slug: 'adult-cat-diet-finder', path: '/adult-cat-diet-finder' },
          { name: 'Senior Pet Diet Finder: Joint & Kidney Support', slug: 'senior-pet-diet-finder', path: '/senior-pet-diet-finder' },
        ],
      },
      {
        name: 'Diet Finder by Breed Size (4)',
        items: [
          { name: 'Small Breed Diet Finder: Fast Metabolism Formulas', slug: 'small-breed-diet-finder', path: '/small-breed-diet-finder' },
          { name: 'Medium Breed Diet Finder: Balanced Daily Energy', slug: 'medium-breed-diet-finder', path: '/medium-breed-diet-finder' },
          { name: 'Large Breed Diet Finder: Controlled Growth Ratios', slug: 'large-breed-diet-finder', path: '/large-breed-diet-finder' },
          { name: 'Giant Breed Diet Finder: Calcium & Skeletal Care', slug: 'giant-breed-diet-finder', path: '/giant-breed-diet-finder' },
        ],
      },
      {
        name: 'Core Nutrition Comparisons (6)',
        items: [
          { name: 'Wet vs Dry vs Raw vs Freeze-Dried Pet Food', slug: 'wet-vs-dry-vs-raw-vs-freeze-dried', path: '/wet-vs-dry-vs-raw-vs-freeze-dried' },
          { name: 'Grain-Free vs Grain-Inclusive Diets Decoded', slug: 'grain-free-vs-grain-inclusive', path: '/grain-free-vs-grain-inclusive' },
          { name: 'Limited Ingredient Diets for Itchy & Allergic Pets', slug: 'limited-ingredient-allergy-diets', path: '/limited-ingredient-allergy-diets' },
          { name: 'Weight Management Diets: Satiety without Muscle Loss', slug: 'weight-management-diets', path: '/weight-management-diets' },
          { name: 'How to Read a Pet Food Label: Guaranteed Analysis', slug: 'reading-a-pet-food-label', path: '/reading-a-pet-food-label' },
          { name: '7-Day Food Transition Schedule for Sensitive Stomachs', slug: '7-day-food-transition-guide', path: '/7-day-food-transition-guide' },
        ],
      },
      {
        name: 'Breed-Specific Nutrition (10)',
        items: [
          { name: 'Large Breed Puppy Nutrition & Joint Health', slug: 'large-breed-puppy-nutrition', path: '/large-breed-puppy-nutrition' },
          { name: 'Senior Small Breed Nutrition & Dental Kibble', slug: 'senior-small-breed-nutrition', path: '/senior-small-breed-nutrition' },
          { name: 'French Bulldog Digestive & Anti-Gas Feeding', slug: 'french-bulldog-nutrition', path: '/french-bulldog-nutrition' },
          { name: 'Golden Retriever Cardiac & Omega-3 Diets', slug: 'golden-retriever-nutrition', path: '/golden-retriever-nutrition' },
          { name: 'German Shepherd High-Absorption Gut Formulations', slug: 'german-shepherd-nutrition', path: '/german-shepherd-nutrition' },
          { name: 'Poodle Tear Stain Prevention Diets', slug: 'poodle-nutrition', path: '/poodle-nutrition' },
          { name: 'Maine Coon Giant Jaw Kibble & Hydration', slug: 'maine-coon-nutrition', path: '/maine-coon-nutrition' },
          { name: 'Dachshund Spine Support & Weight Control Diets', slug: 'dachshund-nutrition', path: '/dachshund-nutrition' },
          { name: 'Labrador Calorie Restricted Feeding Plans', slug: 'labrador-nutrition', path: '/labrador-nutrition' },
          { name: 'Shih Tzu Hypoallergenic Protein Diets', slug: 'shih-tzu-nutrition', path: '/shih-tzu-nutrition' },
        ],
      },
      {
        name: 'Treats & Rewards (3)',
        items: [
          { name: 'Low-Calorie Training Treats Guide', slug: 'training-treats-guide', path: '/training-treats-guide' },
          { name: 'Dental Chews & Plaque-Control Treats Guide', slug: 'dental-treats-guide', path: '/dental-treats-guide' },
          { name: 'Safe Pet Treats by Life Stage & Size', slug: 'treats-by-life-stage', path: '/treats-by-life-stage' },
        ],
      },
    ],
  },
  {
    pillar: 'Health & Wellness',
    anchor: '/guides#health',
    subcategories: [
      {
        name: 'Vaccination & Prevention (4)',
        items: [
          { name: 'Puppy Vaccination Schedule (Core & Non-Core)', slug: 'puppy-vaccination-schedule', path: '/puppy-vaccination-schedule' },
          { name: 'Kitten Vaccination & Deworming Timeline', slug: 'kitten-vaccination-schedule', path: '/kitten-vaccination-schedule' },
          { name: 'Adult Booster & Titer Testing Guide', slug: 'adult-vaccination-schedule', path: '/adult-vaccination-schedule' },
          { name: 'Why Professional Groomers Require Rabies Proof', slug: 'why-groomers-require-rabies-proof', path: '/why-groomers-require-rabies-proof' },
        ],
      },
      {
        name: 'Mid-South Care Protocols (4)',
        items: [
          { name: 'Flea & Tick Prevention in the Mid-South Climate', slug: 'flea-tick-prevention-midsouth', path: '/flea-tick-prevention-midsouth' },
          { name: 'Dental, Ear & Eye Preventative Care Basics', slug: 'dental-ear-eye-basics', path: '/dental-ear-eye-basics' },
          { name: 'Itchy Skin, Yeast Infections & Hot Spot Remedies', slug: 'itchy-skin-hot-spots', path: '/itchy-skin-hot-spots' },
          { name: 'Vet vs Groomer: Who Handles What Medical Care?', slug: 'vet-vs-groomer-who-handles-what', path: '/vet-vs-groomer-who-handles-what' },
        ],
      },
    ],
  },
  {
    pillar: 'Buying Guides',
    anchor: '/guides#buying-guides',
    subcategories: [
      {
        name: 'How to Choose (9)',
        items: [
          { name: 'Dog Crate Sizing: Growth Dividers & Travel Specs', slug: 'crate-sizing-guide', path: '/crate-sizing-guide' },
          { name: 'Harness Fitting: No-Pull vs Step-In vs Vest', slug: 'harness-fitting-guide', path: '/harness-fitting-guide' },
          { name: 'Collar Buying Guide: Breakaway, Martingale & Flat', slug: 'collar-buying-guide', path: '/collar-buying-guide' },
          { name: 'Orthopedic Dog Bed Buying Guide by Sleep Style', slug: 'bed-buying-by-sleep-style', path: '/bed-buying-by-sleep-style' },
          { name: 'Slicker, Pin & Undercoat Brush Guide by Coat', slug: 'brush-guide-by-coat-type', path: '/brush-guide-by-coat-type' },
          { name: 'Pet Shampoo & Conditioner Guide by Skin Sensitivity', slug: 'shampoo-guide-by-skin-type', path: '/shampoo-guide-by-skin-type' },
          { name: 'Electric Clippers vs Rotary Nail Grinder Comparison', slug: 'clippers-vs-grinder', path: '/clippers-vs-grinder' },
          { name: 'Slow Feeder & Interactive Maze Bowl Guide', slug: 'slow-feeder-guide', path: '/slow-feeder-guide' },
          { name: 'Pet Water Fountain Guide: Stainless vs Ceramic', slug: 'water-fountain-guide', path: '/water-fountain-guide' },
        ],
      },
      {
        name: 'Starter Checklists (3)',
        items: [
          { name: 'New Puppy Starter Kit Checklist (First 30 Days)', slug: 'new-puppy-starter-kit', path: '/new-puppy-starter-kit' },
          { name: 'New Kitten Starter Kit & Enrichment Checklist', slug: 'new-kitten-starter-kit', path: '/new-kitten-starter-kit' },
          { name: 'Rescue Dog Decompression & Essentials Checklist', slug: 'rescue-dog-essentials', path: '/rescue-dog-essentials' },
        ],
      },
    ],
  },
  {
    pillar: 'Local Mid-South',
    anchor: '/guides#local',
    subcategories: [
      {
        name: 'Local Cities & Counties (6)',
        items: [
          { name: 'Pet Grooming in Memphis, TN (Downtown to East Memphis)', slug: 'grooming-in-memphis-tn', path: '/grooming/memphis-tn' },
          { name: 'Pet Grooming in Bartlett, TN (Day Road & Highway 64)', slug: 'grooming-in-bartlett-tn', path: '/grooming/bartlett-tn' },
          { name: 'Pet Grooming in Arlington, TN & Lakeland', slug: 'grooming-in-arlington-tn', path: '/grooming/arlington-tn' },
          { name: 'Pet Grooming in Collierville, TN & Germantown', slug: 'grooming-in-collierville-tn', path: '/grooming/collierville-tn' },
          { name: 'Pet Grooming in Millington, TN & Naval Base Area', slug: 'grooming-in-millington-tn', path: '/grooming/millington-tn' },
          { name: 'Professional Mobile & Salon Grooming Across Shelby County', slug: 'grooming-across-shelby-county', path: '/grooming/shelby-county' },
        ],
      },
    ],
  },
];

// Rich Sample Data presets for initial load & specific archetypes
export const SAMPLE_PAGES: Record<string, GuidePageData> = {
  'doodle-grooming': {
    id: 'doodle-grooming',
    slug: 'doodle-grooming',
    path: '/doodle-grooming',
    pillar: 'Grooming',
    archetype: 'breed_grooming',
    metaTitle: 'Doodle Grooming Guide: Coat Care, Brushing & Salon Cuts | All About Pawz',
    metaDescription: 'Complete Goldendoodle, Labradoodle & Aussiedoodle grooming guide. Master daily slicker brushing, matting prevention, bath schedules, and salon cuts in Memphis, TN.',
    canonicalUrl: seoUrl('/doodle-grooming'),
    targetKeyword: 'doodle grooming',
    secondaryKeywords: ['goldendoodle haircut', 'doodle matting prevention', 'line brushing doodle', 'memphis dog grooming'],
    readTime: '7 min read',
    lastUpdated: 'Updated October 2026',
    author: { name: 'Brea Stewart', role: 'Certified Dog Groomer' },
    heroTitle: 'Start grooming your Doodle with All About Pawz',
    heroSubheadline: 'Gentle coat care, tangle prevention, and salon-grade styling designed for Mid-South pet parents. Keep your Doodle soft, mat-free, and comfortable in every season.',
    heroCtaText: 'Book Salon Appointment*',
    heroCtaSubtext: 'Save 15% on first puppy appointment',
    heroFootnote: '*All About Pawz professional grooming serves Memphis, Bartlett, Collierville, Germantown & Shelby County.',
    heroImageUrl: '/images/hero_grooming_dog_1791411047518.jpg',
    heroImageAlt: 'Fluffy groomed goldendoodle smiling in clean warm salon environment',
    incentivesHeadline: 'Get started with salon-grade care for your Doodle',
    incentivesSubhead: 'Ready to give your Doodle the healthiest coat possible? Take advantage of our certified salon grooming protocols.',
    incentivesLinkText: 'See all grooming packages ↗',
    takeawayCards: [
      {
        icon: 'scissors',
        title: 'Line brushing routine',
        items: [
          { highlight: 'Daily 10-minute comb', text: 'using a long-pin slicker brush and steel greyhound comb down to the skin surface.' },
          { highlight: 'Focus on high-friction zones', text: 'behind the ears, armpits, tail base, and under the collar where mats form silently.' },
          { highlight: 'Never bathe a matted coat', text: 'without thoroughly brushing out knots first, or hot water will felt them tighter.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Mid-South moisture defense',
        items: [
          { highlight: 'Sulfate-free hydrating botanicals', text: 'that protect natural lipid skin barriers in humid Tennessee summers.' },
          { highlight: 'High-velocity blow drying', text: 'to straighten curls to the root and blow out trapped pollen, dust, and dander.' },
          { highlight: 'Leave-in detangling mist', text: 'with silk proteins to prevent static friction between salon appointments.' },
        ],
      },
      {
        icon: 'clock',
        title: '4 to 6-week salon cadence',
        items: [
          { highlight: 'Sanitary & paw pad trims', text: 'to prevent slipping on hardwood floors and keep hygiene areas immaculately clean.' },
          { highlight: 'Ear canal hair clearance', text: 'and antimicrobial drying flush to prevent moisture-trapped yeast infections.' },
          { highlight: 'Gentle nail grinding', text: 'smooths sharp edges back to the quick for comfortable posture and walking.' },
        ],
      },
    ],
    whyHeadline: 'Why trust All About Pawz for your Doodle’s coat?',
    whyFeatures: [
      {
        icon: 'trust',
        title: 'Groom in a salon more pet parents trust',
        description: 'Our certified master stylists specialize in high-maintenance hybrid coats, utilizing low-stress handling protocols and fear-free certified techniques.',
      },
      {
        icon: 'tools',
        title: 'Equipped with professional equipment that preserves coats',
        description: 'We utilize variable-speed blow dryers that do not overheat skin, stainless Japanese scissoring blades, and hypoallergenic botanical washes tailored to sensitive allergy-prone skin.',
      },
      {
        icon: 'services',
        title: 'Dedicated care with high-impact, optional wellness services',
        description: 'From deshedding mud baths and blueberry facial scrubs to teeth enzyme brushing and deep moisture leave-in conditioning, every appointment is customized to your pet’s lifestyle.',
      },
    ],
    whyCtaText: 'Explore Salon Packages',
    testimonials: [
      {
        quote: '“Finding a groomer who truly understands doodle coats in Memphis was a lifesaver. Jessica took the time to show me how to line-brush at home, and Teddy has never had to be shaved down!”',
        authorName: 'Sarah Jenkins',
        authorRole: 'Pet Parent of Teddy (Mini Goldendoodle)',
        avatarUrl: '/images/avatar_sarah_pet_parent_1791411057259.jpg',
        storyLinkText: 'See Teddy’s transformation ↗',
        petType: 'Goldendoodle',
      },
      {
        quote: '“Our rescue doodle was terrified of blow dryers. The team at All About Pawz used low-noise equipment and soothing treats. Now he wags his tail right through the front door.”',
        authorName: 'Marcus Bell',
        authorRole: 'Memphis Resident & Rescue Advocate',
        avatarUrl: '/images/avatar_marcus_pet_parent_1791411068889.jpg',
        storyLinkText: 'See Marcus & Archie’s story ↗',
        petType: 'Labradoodle Mix',
      },
    ],
    introSummary: 'Doodles, including Goldendoodles, Labradoodles, Bernedoodles, and Aussiedoodles, have become one of the Mid-South’s most beloved companion breeds. However, their luscious fleece and wool coats are notorious for "stealth matting." Because shed hair doesn’t fall to the floor, it weaves itself into living curls, creating painful pelted mats against the skin. This complete guide teaches you daily maintenance techniques, recommended tools, and professional styling choices to keep your doodle happy, healthy, and fluffy.',
    tableOfContents: [
      { id: 'coat-types', label: '1. Understanding Doodle Coat Types' },
      { id: 'line-brushing', label: '2. The Master Technique: Line Brushing' },
      { id: 'popular-cuts', label: '3. Popular Salon Haircuts & Styles' },
      { id: 'matting-vs-shaving', label: '4. Preventing Pelting & Dematting Realities' },
      { id: 'ear-paw-hygiene', label: '5. Ear Cleaning & Paw Pad Maintenance' },
      { id: 'recommended-gear', label: '6. Groomer-Recommended Tools' },
      { id: 'faq', label: '7. Frequently Asked Questions' },
    ],
    sections: [
      {
        id: 'coat-types',
        title: '1. Understanding Doodle Coat Types (Fleece vs. Wool vs. Hair)',
        content: 'Not all doodle coats are created equal. Depending on the generational mix (F1, F1B, Multigen), your dog will inherit one of three distinct textures. Fleece coats are wavy, soft, and silky with moderate maintenance; wool coats are tightly curled like pure poodles and require rigorous daily line brushing; hair or wire coats are straighter and shed more naturally with lower matting risk.',
        tips: [
          'Fleece coats (loose waves): Require line brushing 3-4 times per week.',
          'Wool coats (tight spiral curls): Require daily combing from root to tip.',
          'Puppy coat transition: Occurs around 7-12 months when adult coat grows in beneath soft puppy hair, creating peak matting vulnerability.',
        ],
        callout: {
          type: 'pro-tip',
          title: 'The Puppy Transition Alert',
          text: 'Between 8 and 11 months old, many doodle owners wake up to find their dog suddenly "felted" overnight. As the coarse adult coat grows in, dead puppy fuzz becomes trapped. Increase brushing to twice daily during this 3-month window.',
        },
      },
      {
        id: 'line-brushing',
        title: '2. The Master Technique: Line Brushing to the Skin',
        content: 'The most common mistake pet parents make is "surface petting" with a slicker brush. The top inch looks fluffy and gorgeous, but a solid carpet of felted matting is tightening directly against the skin. Line brushing is the gold-standard technique endorsed by veterinarians and professional groomers worldwide.',
        tips: [
          'Step 1: Part the coat with your non-dominant hand until you can visually see pink skin.',
          'Step 2: Using a long-pin slicker brush (16mm to 22mm pins), gently brush downward in short strokes starting at the root.',
          'Step 3: Move your hand upward by one inch, revealing another line of skin, and repeat.',
          'Step 4: Verification test: Glide a metal greyhound comb through the brushed section. If the comb stops or snags, a knot remains.',
        ],
      },
      {
        id: 'popular-cuts',
        title: '3. Popular Salon Haircuts & Styles',
        content: 'When you bring your doodle to All About Pawz, our pet stylists customize blade lengths and scissor work to match your lifestyle and activity levels. From active outdoor romps to pampered indoor teddy bear silhouettes, here are our most requested styles:',
        tableData: {
          headers: ['Style Name', 'Body Length', 'Head & Muzzle Style', 'Maintenance Level', 'Best For'],
          rows: [
            ['Teddy Bear Cut', '3/4 inch to 1 inch', 'Rounded round face, trimmed chin', 'High (Daily Brushing)', 'Indoor pets, photo-ready families'],
            ['Puppy Cut', 'Uniform 1/2 inch all over', 'Softly blended rounded ears', 'Moderate (3x/week)', 'Active family dogs, first grooms'],
            ['Summer / Utility Clip', '1/4 inch clean body', 'Neat clean face, fluffy tail flag', 'Low (1x/week)', 'Swimmers, park lovers, hot Memphis summers'],
            ['Lamb Cut', 'Short body (1/4"), fuller legs', 'Scissored cylindrical legs & topknot', 'High (Daily)', 'Showmanship, elegant curly coats'],
          ],
        },
      },
      {
        id: 'matting-vs-shaving',
        title: '4. Preventing Pelting & Dematting Realities',
        content: 'Human hair dematting hurts, and dog dematting is even more intense because canine skin is 3 times thinner than human skin. When matting becomes pelted (forming a solid sheet like felt fabric), dematting with blades can cause bruising, skin tears, hematomas, and severe psychological distress. At All About Pawz, our ethical pledge is humanity over vanity: if a coat cannot be brushed out without pain, a clean reset shave is the only compassionate choice.',
        callout: {
          type: 'vet-note',
          title: 'Veterinary Reality Check',
          text: 'Severely matted hair restricts blood flow, traps moisture, and incubates hot spots and bacterial dermatitis. Shaving a pelted doodle allows the skin to heal and the new coat to grow back stronger within 8 weeks.',
        },
      },
      {
        id: 'ear-paw-hygiene',
        title: '5. Ear Cleaning & Paw Pad Maintenance in the Mid-South',
        content: 'With Memphis’s high humidity and warm climate, doodle ears are prone to yeast overgrowth. Curls growing deep inside the ear canal trap moisture from baths and rain. Paw pads also grow thick tufts of hair between pads that collect burrs, mud, and allergens from Memphis parks.',
        tips: [
          'Pad clearance: Shave paw pads flush with paw skin every 4 weeks to maintain traction and hygiene.',
          'Ear cleaning: Clean weekly with a veterinary-approved drying flush containing chlorhexidine or ketoconazole.',
          'Nail trims: Black nails require incremental tipping or rotary diamond grinding to avoid the quick.',
        ],
      },
    ],
    relatedProducts: [
      {
        id: 'slicker-brush-pro',
        name: 'Curved Long-Pin Slicker Brush (Large)',
        category: 'Grooming Essentials',
        price: '$28.99',
        rating: 4.9,
        reviewsCount: 312,
        badge: 'Salon Pick',
        description: '22mm flexible stainless steel pins penetrate thick doodle curls down to the skin without scratching sensitive tissue.',
      },
      {
        id: 'greyhound-steel-comb',
        name: 'Stainless Steel Greyhound Finishing Comb (7.5")',
        category: 'Grooming Essentials',
        price: '$16.50',
        rating: 4.8,
        reviewsCount: 198,
        badge: 'Essential',
        description: 'Coarse and fine dual teeth verify complete knot removal after slicker brushing.',
      },
      {
        id: 'hypoallergenic-oatmeal-shampoo',
        name: 'All About Pawz Oatmeal & Honey Soothing Wash',
        category: 'Shampoos & Conditioners',
        price: '$21.00',
        rating: 5.0,
        reviewsCount: 420,
        badge: 'Mid-South Formula',
        description: 'Formulated with organic colloidal oatmeal and aloe to soothe pollen allergies and moisturize double-textured coats.',
      },
      {
        id: 'slow-feeder-lick-mat',
        name: 'Calming Grooming Suction Lick Mat',
        category: 'Feeding & Watering',
        price: '$14.99',
        rating: 4.7,
        reviewsCount: 156,
        badge: 'Fear-Free',
        description: 'Suctions to bathtub or tile wall; smear with peanut butter for distraction during brushing sessions.',
      },
    ],
    faqs: [
      {
        question: 'How often should a Doodle be professionally groomed?',
        answer: 'Doodles should visit the salon every 4 to 6 weeks for a full bath, blowout, sanitary trim, nail grind, and scissored haircut. In between salon visits, daily 10-minute line brushing at home is required to prevent matting.',
      },
      {
        question: 'Can I bathe my Doodle at home if they have knots?',
        answer: 'No. Water acts like a felting agent on matted hair. Getting mats wet and allowing them to air dry shrinks the tangled hair tight against the skin, making removal impossible without shaving. Always brush and comb 100% mat-free before the bath.',
      },
      {
        question: 'What is the difference between a Puppy Cut and a Teddy Bear Cut?',
        answer: 'A puppy cut trims the coat to a uniform 1/2-inch length over the entire body, legs, and face. A teddy bear cut keeps the face rounded, ears trimmed to the leather, and legs slightly fuller like a stuffed plush toy.',
      },
      {
        question: 'Why do salon groomers require proof of rabies vaccination?',
        answer: 'Under state veterinary public health standards and salon safety mandates, all dogs and cats over 4 months of age must be vaccinated against rabies to protect other pets and human handlers. Valid rabies certificates must be verified prior to entry.',
      },
      {
        question: 'Do you offer fear-free accommodations for nervous or rescue Doodles?',
        answer: 'Yes! All About Pawz utilizes low-stress handling protocols, quiet blowers, calming lavender diffusers, and positive reinforcement reward breaks. You can also book a 15-minute "happy visit" where your pup visits for treats and belly rubs without grooming.',
      },
    ],
    serviceCity: 'Memphis, TN',
    localServiceAreas: ['Memphis', 'Bartlett', 'Collierville', 'Germantown', 'Arlington', 'Lakeland', 'Millington', 'Shelby County'],
  },
};

// Helper generator to dynamically create rich, authentic data for ANY guide or category in the user's taxonomy
export function getGuideDataBySlug(slug: string, routeSegments?: string[]): GuidePageData {
  if ((!routeSegments || routeSegments.length === 1) && SAMPLE_PAGES[slug]) {
    return SAMPLE_PAGES[slug];
  }

  // Find item in directory
  let foundItem: { name: string; slug: string; path: string } | null = null;
  let foundPillar = 'Grooming';

  for (const pillar of GUIDES_DIRECTORY) {
    for (const sub of pillar.subcategories) {
      for (const item of sub.items) {
        if (item.slug === slug) {
          foundItem = item;
          foundPillar = pillar.pillar;
          break;
        }
      }
      if (foundItem) break;
    }
    if (foundItem) break;
  }

  // Resolve product categories recursively so nested paths retain their context.
  let matchedProductCategory: { root: CategoryNode; node: CategoryNode; segments: string[] } | null = null;
  if (!foundItem) {
    if (slug === 'bowls-dishes') slug = 'bowls-and-dishes';

    const findBySegments = (root: CategoryNode, segments: string[]) => {
      if (segments[0] !== root.slug) return null;
      let node = root;
      for (const segment of segments.slice(1)) {
        const child = node.children?.find((candidate) => candidate.slug === segment);
        if (!child) return null;
        node = child;
      }
      return node;
    };
    const findBySlug = (node: CategoryNode, segments: string[]): { node: CategoryNode; segments: string[] } | null => {
      if (node.slug === slug) return { node, segments };
      for (const child of node.children || []) {
        const match = findBySlug(child, [...segments, child.slug]);
        if (match) return match;
      }
      return null;
    };

    for (const root of PRODUCT_CATEGORIES) {
      const match = routeSegments?.length && PRODUCT_CATEGORIES.some((category) => category.slug === routeSegments[0])
        ? (() => {
            const node = findBySegments(root, routeSegments);
            return node ? { node, segments: routeSegments } : null;
          })()
        : routeSegments?.length === 1
          ? findBySlug(root, [root.slug])
          : routeSegments?.length
            ? null
            : findBySlug(root, [root.slug]);
      if (match) {
        matchedProductCategory = { root, node: match.node, segments: match.segments };
        foundItem = { name: match.node.name, slug: match.node.slug, path: `/${match.segments.join('/')}` };
        foundPillar = root.name;
        break;
      }
    }
  }

  const title = foundItem ? foundItem.name : slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  const isLocal = slug.includes('memphis') || slug.includes('bartlett') || slug.includes('arlington') || slug.includes('collierville') || slug.includes('millington') || slug.includes('shelby');
  const isNutrition = foundPillar === 'Nutrition' || slug.includes('diet') || slug.includes('nutrition') || slug.includes('food');
  const isHealth = foundPillar === 'Health & Wellness' || slug.includes('vaccination') || slug.includes('flea') || slug.includes('vet');
  const isBuying = foundPillar === 'Buying Guides' || foundPillar === 'Feeding & Watering' || slug.includes('guide') || slug.includes('kit') || slug.includes('sizing');

  let archetype: GuidePageData['archetype'] = 'breed_grooming';
  if (isLocal) archetype = 'local_city';
  else if (isNutrition) archetype = 'nutrition_diet';
  else if (isHealth) archetype = 'health_wellness';
  else if (isBuying) archetype = 'buying_guide';

  const profile = GROOMING_ESSENTIALS_PROFILES[slug] || FEEDING_WATERING_PROFILES[slug] || DOMAIN_PROFILES[slug] || {};
  const pagePath = foundItem ? foundItem.path : `/${slug}`;

  // ORIGINAL ARTICLE FIRST (owner directive 2026-10-23) — the article-bodies
  // corpus (148 original blog articles) supersedes every legacy profile and
  // template below. This fork feeds the sitemap and search surfaces; the
  // rendered pages come from src/lib/seopages/taxonomy-data.ts, which applies
  // the same priority.
  {
    const key = routeSegments && routeSegments.length > 1 ? routeSegments.join('/') : slug;
    const articleBody: ArticleBody | undefined = ARTICLE_BODIES[key];
    if (articleBody) {
      const wordCount = [articleBody.introSummary, ...articleBody.sections.map((section) => section.content)]
        .join(' ')
        .split(/\s+/)
        .length;
      return {
        id: slug,
        slug,
        path: pagePath,
        pillar: foundPillar,
        archetype: 'product_category',
        metaTitle: `${articleBody.heroTitle} | All About Pawz`,
        metaDescription: articleBody.metaDescription,
        canonicalUrl: seoUrl(pagePath),
        targetKeyword: title.toLowerCase(),
        secondaryKeywords: [`${title.toLowerCase()} tips`, 'pet care blog', 'all about pawz'],
        readTime: `${Math.max(4, Math.round(wordCount / 200))} min read`,
        lastUpdated: 'Updated October 2026',
        author: articleBody.author ?? ARTICLE_DEFAULT_AUTHOR,
        heroTitle: articleBody.heroTitle,
        heroSubheadline: articleBody.heroSubheadline,
        heroCtaText: 'Read the article',
        heroCtaSubtext: '',
        heroFootnote: 'Independent editorial guidance from the All About Pawz marketplace team.',
        heroImageUrl: articleHeroImage(key, articleBody),
        heroImageAlt: articleHeroAlt(key, articleBody),
        incentivesHeadline: `What to weigh when choosing ${title.toLowerCase()}`,
        incentivesSubhead: 'Practical checks from the article you can act on while you compare options.',
        incentivesLinkText: 'Read the article',
        takeawayCards: articleBody.takeawayCards,
        whyHeadline: `Related reading in ${foundPillar}`,
        whyFeatures: [],
        whyCtaText: 'Browse related articles',
        testimonials: [],
        introSummary: articleBody.introSummary,
        tableOfContents: articleBody.sections.map((section, index) => ({
          id: section.id,
          label: `${index + 1}. ${section.title.replace(/^\d+\.\s*/, '')}`,
        })),
        sections: articleBody.sections,
        relatedProducts: [],
        relatedArticles: [],
        faqs: articleBody.faqs,
        localServiceAreas: [],
      };
    }
  }

  if (matchedProductCategory && ['fish-and-aquatics', 'bird', 'reptile', 'small-animal'].includes(matchedProductCategory.root.slug)) {
    const { root, node, segments } = matchedProductCategory;
    const parentSegments = segments.slice(0, -1);
    const parent = parentSegments.length ? findCategoryAtPath(root, parentSegments.slice(1)) : null;
    const relatedNodes = node.children?.length
      ? node.children
      : parent?.children?.filter((item) => item.slug !== node.slug) || [];
    const relatedBaseSegments = node.children?.length ? segments : parentSegments;
    const relatedArticles = relatedNodes.map((item) => ({
      title: item.name,
      path: `/${[...relatedBaseSegments, item.slug].join('/')}`,
    }));
    const title = node.slug === root.slug
      ? `${root.name} Care & Supplies in Memphis`
      : `${node.name} for ${root.name} in Memphis`;
    const localCategoryName = node.slug === root.slug
      ? `${root.name.toLowerCase()} care and supplies`
      : `${node.name.toLowerCase()} for ${root.name.toLowerCase()} pets`;
    const animalName = root.slug === 'fish-and-aquatics'
      ? 'fish'
      : root.slug === 'small-animal'
        ? 'small animal'
        : root.name.toLowerCase();
    const description = `Memphis, TN and Shelby County guide to ${localCategoryName}. Compare fit, safety, cleaning, and care before choosing supplies for your pet.`;
    const sections = [
      {
        id: 'category-overview',
        title: `${node.name} for ${root.name}`,
        content: `This guide covers the main types of ${node.name.toLowerCase()} available for ${root.name.toLowerCase()} pets. Product specifications and animal needs vary, so check manufacturer guidance and consult a qualified veterinarian when a product affects health, nutrition, or habitat conditions. For pet owners in Memphis and Shelby County, choose for the animal's actual home environment, available space, and season-specific conditions rather than relying on generic product claims.`,
      },
      {
        id: 'selection-checklist',
        title: `How to choose ${node.name.toLowerCase()}`,
        content: `Compare materials, dimensions, compatibility, cleaning requirements, and the manufacturer's recommended species and use. Match the item to your animal's size and environment, and avoid products with unclear safety or care instructions.`,
        tips: [
          'Confirm the product is labeled for the animal species and size you keep.',
          'Check dimensions and compatibility with the existing habitat or equipment.',
          'Review cleaning, replacement, and supervision guidance before use.',
        ],
      },
      {
        id: 'care-and-maintenance',
        title: 'Care and maintenance',
        content: `Follow the manufacturer's cleaning and replacement directions, inspect supplies regularly for damage, and keep products in a condition appropriate for your animal's daily environment. Ask a veterinarian about health or dietary questions rather than relying on product marketing claims.`,
      },
      {
        id: 'memphis-area-considerations',
        title: `${root.name} care in Memphis and Shelby County`,
        content: `Local homes can vary in room temperature, indoor humidity, ventilation, and available habitat space. Consider the conditions where your pet actually lives, especially during Memphis-area summer heat and seasonal changes. Monitor species-appropriate habitat conditions and follow product instructions; ask a qualified veterinarian or species specialist when care requirements are unclear.`,
      },
    ];

    return {
      id: segments.join('-'),
      slug: node.slug,
      path: pagePath,
      pillar: root.name,
      archetype: 'product_category',
      metaTitle: node.slug === root.slug
        ? `${root.name} in Memphis | All About Pawz`
        : `${node.name} in Memphis | All About Pawz`,
      metaDescription: description,
      canonicalUrl: seoUrl(pagePath),
      targetKeyword: `${localCategoryName} Memphis`,
      secondaryKeywords: [`${root.name.toLowerCase()} supplies Memphis`, `${node.name.toLowerCase()} care Shelby County`, 'pet product guide'],
      readTime: '4 min read',
      lastUpdated: 'Updated October 2026',
      author: { name: 'Brea Stewart', role: 'Certified Dog Groomer' },
      heroTitle: title,
      heroSubheadline: description,
      heroCtaText: 'Explore related categories',
      heroCtaSubtext: '',
      heroFootnote: `A care and supply guide for Memphis and Shelby County pet owners.`,
      heroImageUrl: '/images/hero_grooming_dog_1791411047518.jpg',
      heroImageAlt: `${root.name} supplies guide`,
      incentivesHeadline: `What to consider when choosing ${node.name.toLowerCase()}`,
      incentivesSubhead: `Use these checks to compare options for ${root.name.toLowerCase()} pets in Memphis and Shelby County.`,
      incentivesLinkText: 'Read the complete guide',
      takeawayCards: [
        { icon: 'check', title: 'Check suitability', items: [{ highlight: 'Species and size', text: 'confirm the item matches your animal and setup.' }, { highlight: 'Clear instructions', text: 'look for practical use, cleaning, and replacement guidance.' }] },
        { icon: 'shield', title: 'Prioritize safe use', items: [{ highlight: 'Inspect materials', text: 'check for damage, loose parts, or unclear construction.' }, { highlight: 'Follow directions', text: 'use products only as labeled and supervise when appropriate.' }] },
        { icon: 'clock', title: 'Plan for upkeep', items: [{ highlight: 'Routine care', text: 'clean and replace items according to their instructions.' }, { highlight: 'Ask an expert', text: 'consult a veterinarian about health or nutrition decisions.' }] },
      ],
      whyHeadline: `More ${root.name} categories`,
      whyFeatures: [],
      whyCtaText: 'Browse related categories',
      testimonials: [],
      introSummary: description,
      tableOfContents: sections.map((section, index) => ({ id: section.id, label: `${index + 1}. ${section.title}` })),
      sections,
      relatedProducts: [],
      relatedArticles,
      faqs: [
        {
          question: node.slug === root.slug
            ? `How do I choose supplies for my ${animalName}?`
            : `How do I choose ${node.name.toLowerCase()} for my ${animalName}?`,
          answer: 'Compare species suitability, size, materials, compatibility, cleaning needs, and manufacturer instructions before choosing.',
        },
        { question: 'How often should supplies be cleaned or replaced?', answer: 'Follow product and manufacturer instructions, and inspect supplies regularly for damage or wear.' },
        { question: 'Who should I ask about health or nutrition needs?', answer: 'A qualified veterinarian can advise on animal-specific health, nutrition, and habitat requirements.' },
        { question: 'What should Memphis-area pet owners consider?', answer: 'Consider your pet’s actual indoor temperature, humidity, ventilation, and available space, especially during seasonal changes. Follow species-specific care guidance and product instructions.' },
      ],
      localServiceAreas: [],
    };
  }

  return {
    id: slug,
    slug,
    path: pagePath,
    pillar: foundPillar,
    archetype,
    metaTitle: profile.heroTitle ? `${profile.heroTitle} | All About Pawz` : `${title} | All About Pawz Guide & Mid-South Pet Care`,
    metaDescription: profile.heroSubheadline ? `${profile.heroSubheadline}` : `Comprehensive guide to ${title.toLowerCase()}. Master expert tips, veterinary-reviewed best practices, and salon recommendations in Memphis & Shelby County.`,
    canonicalUrl: seoUrl(pagePath),
    targetKeyword: title.toLowerCase(),
    secondaryKeywords: [`${title.toLowerCase()} tips`, 'memphis pet care', 'all about pawz guide', 'shelby county dog care'],
    readTime: '6 min read',
    lastUpdated: 'Updated October 2026',
    author: { name: 'Brea Stewart', role: 'Certified Dog Groomer' },
    heroTitle: profile.heroTitle || `The Complete Guide to ${title}`,
    heroSubheadline: profile.heroSubheadline || `Veterinary-backed advice, salon-tested techniques, and curated pet supplies tailored specifically to long-term health and coat vitality.`,
    heroCtaText: isLocal ? 'Book Appointment*' : isNutrition ? 'Find Your Pet’s Diet*' : 'Explore Guide & Tools*',
    heroCtaSubtext: 'Certified fear-free handlers & master groomers',
    heroFootnote: '*Certified master groomers and fear-free handling protocols.',
    heroImageUrl: '/images/hero_grooming_dog_1791411047518.jpg',
    heroImageAlt: `${title} featured care guide`,
    incentivesHeadline: `Essential principles for ${title.toLowerCase()}`,
    incentivesSubhead: `Take advantage of our veterinary-aligned protocols designed to keep your companion healthy, comfortable, and vibrant.`,
    incentivesLinkText: 'See all care protocols ↗',
    takeawayCards: profile.takeaways || [
      {
        icon: 'shield',
        title: 'Safety & Comfort First',
        items: [
          { highlight: 'Low-stress handling', text: 'tailored to puppies, seniors, and rescue dogs with gentle desensitization.' },
          { highlight: 'Sterilized equipment', text: 'autoclaved blades, clean towels, and hospital-grade disinfectant between each pet.' },
          { highlight: 'Strict rabies verification', text: 'protecting every pet and technician in full compliance with Tennessee health statutes.' },
        ],
      },
      {
        icon: 'sparkles',
        title: 'Mid-South Climate Defense',
        items: [
          { highlight: 'Pollen & humidity formulas', text: 'counteracting intense southern summer mold, grass allergies, and red clay staining.' },
          { highlight: 'Coat moisture restoration', text: 'nourishing dry undercoats without weighing down natural curl or fluff.' },
          { highlight: 'Hydration & thermal care', text: 'ensuring safe water intake and safe cooling before and after physical sessions.' },
        ],
      },
      {
        icon: 'award',
        title: 'Verified Results',
        items: [
          { highlight: 'Documented health checks', text: 'inspecting ears, eyes, paw pads, and skin lumps during every service.' },
          { highlight: 'Custom home care plans', text: 'empowering owners with the exact brush, comb, and feed cadence needed.' },
          { highlight: 'Transparent pricing & care', text: 'no surprise fees, clear quotes, and honest humane recommendations.' },
        ],
      },
    ],
    whyHeadline: `Why choose All About Pawz for ${title.toLowerCase()}?`,
    whyFeatures: [
      {
        icon: 'trust',
        title: 'Certified master groomers and passionate pet lovers',
        description: 'Our team undergoes continuous education in animal behavior, dermatological coat care, and fear-free handling techniques.',
      },
      {
        icon: 'tools',
        title: 'State-of-the-art facilities & professional tooling',
        description: 'We invest in quiet variable-speed dryers, hydraulic lifting tubs, natural organic shampoos, and precision Japanese shears.',
      },
      {
        icon: 'services',
        title: 'Full-service convenience across the Mid-South',
        description: 'From salon visits and mobile grooming appointments to expert nutritional guidance and premium retail supplies, we serve you locally.',
      },
    ],
    whyCtaText: 'Schedule an Appointment',
    testimonials: profile.testimonials || [
      {
        quote: `“All About Pawz made our pet’s routine so easy. Their staff is knowledgeable, gentle, and the salon is spotless. We will never go anywhere else in Memphis!”`,
        authorName: 'Sarah Jenkins',
        authorRole: 'Pet Parent & Bartlett Resident',
        avatarUrl: '/images/avatar_sarah_pet_parent_1791411057259.jpg',
        storyLinkText: 'Read full customer review ↗',
      },
      {
        quote: `“The attention to detail and genuine compassion they showed our nervous rescue dog was unmatched. The team explained everything thoroughly.”`,
        authorName: 'Marcus Bell',
        authorRole: 'Memphis Resident & Rescue Advocate',
        avatarUrl: '/images/avatar_marcus_pet_parent_1791411068889.jpg',
        storyLinkText: 'Read Marcus’s story ↗',
      },
    ],
    introSummary: profile.introSummary || `Whether you are preparing for a new routine or addressing specific coat, dietary, or behavioral needs, this guide to ${title} provides actionable, veterinarian-approved insights. Designed for dog and cat parents across the Mid-South, we break down essential equipment, step-by-step methodologies, common pitfalls, and when to seek professional intervention.`,
    tableOfContents: profile.sections ? profile.sections.map((s, i) => ({ id: s.id, label: `${i + 1}. ${s.title}` })) : [
      { id: 'foundational-overview', label: `1. Foundational Overview of ${title}` },
      { id: 'step-by-step-protocol', label: '2. Step-by-Step Practical Protocol' },
      { id: 'midsouth-specifics', label: '3. Mid-South Seasonal & Climate Factors' },
      { id: 'common-mistakes', label: '4. Critical Mistakes to Avoid' },
      { id: 'recommended-tools', label: '5. Recommended Supplies & Products' },
      { id: 'frequently-asked-questions', label: '6. Frequently Asked Questions' },
    ],
    sections: profile.sections || [
      {
        id: 'foundational-overview',
        title: `1. Foundational Overview of ${title}`,
        content: `Caring for pets requires an understanding of their unique anatomy, breed tendencies, and environmental stressors. In Tennessee, high summer heat indices and active tick and flea populations place distinct demands on skin barriers, digestive balance, and coat health. Establishing a predictable routine prevents acute medical crises before they begin.`,
        tips: [
          'Consistency builds trust: Conduct routine handling exercises at the same time each week.',
          'Early intervention: Inspect ears, skin folds, and footpads before minor irritations turn into hot spots.',
          'Nutritional synergy: Healthy fur and skin begin with bioavailable animal proteins and omega-3 fatty acids.',
        ],
      },
      {
        id: 'step-by-step-protocol',
        title: '2. Step-by-Step Practical Protocol',
        content: `Follow this structured, sequential workflow to achieve optimal results with maximum safety and zero stress:`,
        tips: [
          'Step 1: Environment Prep. Secure non-slip mats and prepare high-value treats (freeze-dried liver or lick mats).',
          'Step 2: Gradual Desensitization. Introduce equipment sounds and gentle touch before full application.',
          'Step 3: Targeted Execution. Work in methodical quadrants, always monitoring your pet’s body language for tension.',
          'Step 4: Post-Session Reward. Conclude with enthusiastic praise, a 5-minute walk, or a special chewing treat.',
        ],
        callout: {
          type: 'pro-tip',
          title: 'Master Groomer Insight',
          text: 'If your pet displays whale eye (showing the whites of their eyes), lip licking, or stiffening, pause immediately. Reward calm behavior, allow a 2-minute decompression pause, and resume with lower intensity.',
        },
      },
      {
        id: 'midsouth-specifics',
        title: '3. Mid-South Seasonal & Climate Factors (Shelby County, TN)',
        content: `Pet care in Greater Memphis requires climate-conscious modifications. Between April and October, humidity traps moisture beneath dense undercoats, exacerbating yeast dermatitis and flea allergy dermatitis. In the winter, dry furnace air inside homes leads to flaky skin and brittle coat shafts.`,
        tableData: {
          headers: ['Season', 'Primary Mid-South Risk', 'Recommended Action', 'Product Solution'],
          rows: [
            ['Spring (March - May)', 'Pollen bloom & flea emergence', 'Weekly coat rinse & flea preventative', 'Hypoallergenic Oatmeal Wash'],
            ['Summer (June - Aug)', 'High humidity & heat stroke risk', 'Undercoat deshedding blow-out', 'De-shedding high-velocity session'],
            ['Fall (Sept - Nov)', 'Coat transition & sticker burrs', 'Line brushing & paw balm application', 'Steel greyhound comb & pad balm'],
            ['Winter (Dec - Feb)', 'Dry skin & road salt irritation', 'Leave-in moisture spray & coat oils', 'Omega-3 fish oil supplement'],
          ],
        },
      },
      {
        id: 'common-mistakes',
        title: '4. Critical Mistakes to Avoid',
        content: `Well-intentioned owners often fall into common traps that compromise pet comfort or skin health. Avoid these common pitfalls:`,
        tips: [
          'Do NOT shave double-coated breeds down to the skin: this destroys natural thermal insulation and causes post-clipping alopecia.',
          'Do NOT use human shampoos or dish soaps, which disrupt the neutral 6.5–7.5 canine epidermal pH balance.',
          'Do NOT skip flea and tick prevention during winter months in the Mid-South, as regional winters are frequently mild enough for parasites to survive indoors and in leaf litter.',
        ],
      },
    ],
    relatedProducts: profile.relatedProducts || [
      {
        id: 'brush-pro',
        name: 'Professional Grooming Undercoat Rake',
        category: 'Grooming Essentials',
        price: '$24.99',
        rating: 4.9,
        reviewsCount: 145,
        badge: 'Recommended',
        description: 'Stainless pins gently remove trapped dead undercoat without irritating sensitive skin.',
      },
      {
        id: 'shampoo-oatmeal',
        name: 'All About Pawz Soothing Aloe & Oatmeal Wash',
        category: 'Shampoos & Conditioners',
        price: '$19.50',
        rating: 5.0,
        reviewsCount: 280,
        badge: 'Mid-South Formula',
        description: 'Veterinary-grade gentle formulation calms redness and itchy skin caused by Tennessee grass allergies.',
      },
      {
        id: 'dental-chews',
        name: 'All About Pawz Enzyme Dental Sticks',
        category: 'Wellness',
        price: '$16.99',
        rating: 4.8,
        reviewsCount: 94,
        badge: 'Veterinary Pick',
        description: 'Dual-action enzymatic chew cleans tartar, freshens breath, and protects gums between teeth brushings.',
      },
      {
        id: 'lick-mat-suction',
        name: 'Enrichment Suction Bathing Lick Mat',
        category: 'Feeding & Watering',
        price: '$13.99',
        rating: 4.7,
        reviewsCount: 88,
        badge: 'Fear-Free',
        description: 'Keeps nervous dogs happily distracted during bathing, ear cleaning, and nail trimming sessions.',
      },
    ],
    faqs: profile.faqs || [
      {
        question: `Why is professional handling recommended for ${title.toLowerCase()}?`,
        answer: 'Professional groomers and handlers are trained in canine body language, ergonomic lifting, and specialized tooling, ensuring safety and preventing injuries to both the pet and pet parent.',
      },
      {
        question: 'How do I book an appointment with All About Pawz in Memphis, TN?',
        answer: 'You can request an appointment online through our portal or call our salon. We verify rabies vaccination records prior to booking to guarantee a safe environment for all pets.',
      },
      {
        question: 'What cities and neighborhoods in the Mid-South do you serve?',
        answer: 'We proudly serve pet parents across Memphis, Bartlett, Collierville, Germantown, Arlington, Lakeland, Millington, and the greater Shelby County area.',
      },
      {
        question: 'Are your products safe for pets with sensitive skin or allergies?',
        answer: 'Yes! All our washes, conditioners, and topical treatments are soap-free, paraben-free, dye-free, and formulated specifically for canine and feline skin pH.',
      },
    ],
    serviceCity: isLocal ? title.replace('Pet Grooming in ', '') : 'Memphis, TN',
    localServiceAreas: ['Memphis', 'Bartlett', 'Collierville', 'Germantown', 'Arlington', 'Lakeland', 'Millington', 'Shelby County'],
  };
}

export function getAllSlugs(): string[] {
  const slugs: Set<string> = new Set();

  GUIDES_DIRECTORY.forEach(pillar => {
    pillar.subcategories.forEach(sub => {
      sub.items.forEach(item => {
        slugs.add(item.slug);
      });
    });
  });

  PRODUCT_CATEGORIES.forEach(cat => {
    slugs.add(cat.slug);
    collectCategorySlugs(cat.children, slugs);
  });

  return Array.from(slugs);
}

export function getProductCategoryPaths(): string[] {
  const paths: string[] = [];
  const collectPaths = (nodes: CategoryNode[] | undefined, parentPath: string) => {
    nodes?.forEach((node) => {
      const path = `${parentPath}/${node.slug}`;
      paths.push(path);
      collectPaths(node.children, path);
    });
  };

  PRODUCT_CATEGORIES.forEach((category) => {
    paths.push(`/${category.slug}`);
    collectPaths(category.children, `/${category.slug}`);
  });
  return paths;
}

function collectCategorySlugs(nodes: CategoryNode[] | undefined, slugs: Set<string>) {
  nodes?.forEach((node) => {
    slugs.add(node.slug);
    collectCategorySlugs(node.children, slugs);
  });
}

function findCategoryAtPath(root: CategoryNode, segments: string[]): CategoryNode | null {
  let node = root;
  for (const segment of segments) {
    const child = node.children?.find((candidate) => candidate.slug === segment);
    if (!child) return null;
    node = child;
  }
  return node;
}

export function getLocalCitySlugs(): string[] {
  return [
    'memphis-tn',
    'bartlett-tn',
    'arlington-tn',
    'collierville-tn',
    'millington-tn',
    'shelby-county',
  ];
}

export interface GuideSearchItem {
  name: string;
  url: string;
  group: string;
}

export function getAllSearchItems(): GuideSearchItem[] {
  const items: GuideSearchItem[] = [];
  const addCategoryItems = (nodes: CategoryNode[] | undefined, parentPath: string, group: string) => {
    nodes?.forEach((node) => {
      const path = `${parentPath}/${node.slug}`;
      items.push({ name: node.name, url: path, group });
      addCategoryItems(node.children, path, group);
    });
  };

  GUIDES_DIRECTORY.forEach(pillar => {
    pillar.subcategories.forEach(sub => {
      sub.items.forEach(item => {
        items.push({
          name: item.name,
          url: item.path,
          group: pillar.pillar,
        });
      });
    });
  });

  PRODUCT_CATEGORIES.forEach(cat => {
    items.push({
      name: `${cat.name} (Overview)`,
      url: `/${cat.slug}`,
      group: 'Supplies',
    });
    addCategoryItems(cat.children, `/${cat.slug}`, cat.name);
  });

  return items;
}

export const ALL_GUIDE_ITEMS: GuideSearchItem[] = getAllSearchItems();
