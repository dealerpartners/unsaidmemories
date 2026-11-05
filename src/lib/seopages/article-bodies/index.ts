import type { ArticleBody } from './types';

// ---------------------------------------------------------------------------
// ARTICLE_BODIES — the aggregate record of every original blog article written
// to the WRITING-SPEC.md contract (2026-10 originality program). 148 articles
// across 16 batch files; keys are category paths without the leading slash
// ("beds-and-furniture/stairs-and-steps") or single-segment pillar slugs
// ("harness-fitting-guide").
//
// Resolution priority (owner directive: every buying-guides page becomes an
// ORIGINAL blog article that reinforces shopping in the marketplace):
//   1. ARTICLE_BODIES[key]           — the original article (this record)
//   2. legacy profiles               — PRODUCT_GUIDE_PROFILES / BUYING_GUIDE_
//                                      PROFILES (thin, being superseded)
//   3. overlay / generic templates   — salon overlay, thin category template
//
// Fish/bird/reptile/small-animal articles leave heroImageUrl unset in the
// spec (artwork assigned centrally): articleHeroImage() supplies the species
// root image from the shop category-imagery system.
// ---------------------------------------------------------------------------

import { BEDS_ARTICLES } from './beds-and-furniture';
import { TREATS_ARTICLES } from './treats';
import { APPAREL_ARTICLES } from './apparel-and-accessories';
import { COLLARS_ARTICLES } from './collars-harnesses-and-leashes';
import { TRAVEL_ARTICLES } from './travel-and-outdoor';
import { WELLNESS_ARTICLES } from './wellness';
import { FEEDING_ARTICLES } from './feeding-and-watering';
import { GROOMING_ESSENTIALS_ARTICLES } from './grooming-essentials';
import { CARE_BASICS_ARTICLES } from './care-basics-pillars';
import { BUYING_PILLAR_ARTICLES } from './buying-pillars';
import { FISH_A_ARTICLES } from './fish-aquatics-a';
import { FISH_B_ARTICLES } from './fish-aquatics-b';
import { BIRD_ARTICLES } from './bird';
import { REPTILE_A_ARTICLES } from './reptile-a';
import { REPTILE_B_ARTICLES } from './reptile-b';
import { SMALL_ANIMAL_A_ARTICLES } from './small-animal-a';
import { SMALL_ANIMAL_B_ARTICLES } from './small-animal-b';

export const ARTICLE_BODIES: Record<string, ArticleBody> = {
  ...BEDS_ARTICLES,
  ...TREATS_ARTICLES,
  ...APPAREL_ARTICLES,
  ...COLLARS_ARTICLES,
  ...TRAVEL_ARTICLES,
  ...WELLNESS_ARTICLES,
  ...FEEDING_ARTICLES,
  ...GROOMING_ESSENTIALS_ARTICLES,
  ...CARE_BASICS_ARTICLES,
  ...BUYING_PILLAR_ARTICLES,
  ...FISH_A_ARTICLES,
  ...FISH_B_ARTICLES,
  ...BIRD_ARTICLES,
  ...REPTILE_A_ARTICLES,
  ...REPTILE_B_ARTICLES,
  ...SMALL_ANIMAL_A_ARTICLES,
  ...SMALL_ANIMAL_B_ARTICLES,
};

/** Default byline when an article leaves `author` unset. */
export const ARTICLE_DEFAULT_AUTHOR = { name: 'All About Pawz', role: 'Editorial Team' } as const;

/**
 * Hero image for an article: its own when set, else the species root image
 * (the central assignment for fish/bird/reptile/small-animal families), else
 * the calm golden portrait for dog/cat topics that shipped without one.
 */
export function articleHeroImage(key: string, body: ArticleBody): string {
  if (body.heroImageUrl) return body.heroImageUrl;
  if (key.startsWith('fish-and-aquatics')) return '/Shop/categories/fish.jpg';
  if (key.startsWith('bird')) return '/Shop/categories/bird.jpg';
  if (key.startsWith('reptile')) return '/Shop/categories/reptile.jpg';
  if (key.startsWith('small-animal')) return '/Shop/categories/small-animal.jpg';
  return '/images/golden_portrait.jpg';
}

/** Alt text for the centrally-assigned species heroes. */
export function articleHeroAlt(key: string, body: ArticleBody): string {
  if (body.heroImageAlt) return body.heroImageAlt;
  if (body.heroImageUrl) return body.heroTitle;
  if (key.startsWith('fish-and-aquatics')) return 'Tropical fish swimming in a planted aquarium';
  if (key.startsWith('bird')) return 'Companion bird perched on a natural branch';
  if (key.startsWith('reptile')) return 'Reptile basking in a naturalistic habitat';
  if (key.startsWith('small-animal')) return 'Small pet exploring its habitat';
  return body.heroTitle;
}
