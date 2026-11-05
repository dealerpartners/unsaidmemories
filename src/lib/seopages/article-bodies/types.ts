import type { ArticleSection, FaqItem, TakeawayItem } from '../types';

// ---------------------------------------------------------------------------
// ArticleBody — one original blog article for a Pawzsly U page.
//
// Keys are category paths without the leading slash
// ("beds-and-furniture/stairs-and-steps") or single-segment pillar slugs
// ("harness-fitting-guide"). Every article in this directory is written
// to the WRITING-SPEC.md contract: on-topic, original, at least six body
// sections of authentic prose, blog voice, marketplace-friendly without
// hard selling.
// ---------------------------------------------------------------------------

export interface ArticleBody {
  /** Human headline used for meta title + H1. Blog style, 45-65 chars, contains the topic keyword. */
  heroTitle: string;
  /** One or two sentences under the H1. 20-35 words. */
  heroSubheadline: string;
  /** Meta description, 150-160 chars, includes the topic keyword. */
  metaDescription: string;
  /** Opening paragraph of the article body. 60-90 words. */
  introSummary: string;
  /** At least 6 sections. Each section.content is 70-120 words (40+ if the section carries tableData). */
  sections: ArticleSection[];
  /** Exactly 3 cards, each with exactly 3 items. Practical checks a reader can act on. */
  takeawayCards: TakeawayItem[];
  /** 4-6 real search questions, answers 35-60 words each. */
  faqs: FaqItem[];
  /** Optional hero image. Only set when one of the whitelisted images genuinely fits the topic. */
  heroImageUrl?: string;
  heroImageAlt?: string;
  /** Optional byline. Defaults to the All About Pawz Editorial Team. */
  author?: { name: string; role: string };
}
