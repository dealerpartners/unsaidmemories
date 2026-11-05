export type TemplateArchetype =
  | 'breed_grooming'
  | 'nutrition_diet'
  | 'buying_guide'
  | 'local_city'
  | 'product_category'
  | 'health_wellness';

export interface TakeawayItem {
  icon: 'scissors' | 'shield' | 'heart' | 'sparkles' | 'check' | 'award' | 'clock' | 'map-pin';
  title: string;
  items: {
    highlight: string;
    text: string;
  }[];
}

export interface WhyFeatureItem {
  icon: 'trust' | 'tools' | 'services' | 'heart' | 'medal';
  title: string;
  description: string;
}

export interface TestimonialItem {
  quote: string;
  authorName: string;
  authorRole: string;
  avatarUrl: string;
  storyLinkText: string;
  petType?: string;
}

export interface ArticleSection {
  id: string;
  title: string;
  content: string;
  tips?: string[];
  callout?: {
    type: 'pro-tip' | 'warning' | 'vet-note';
    title: string;
    text: string;
  };
  tableData?: {
    headers: string[];
    rows: string[][];
  };
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface RelatedProductItem {
  id: string;
  name: string;
  category: string;
  price: string;
  rating: number;
  reviewsCount: number;
  badge?: string;
  description: string;
}

export interface GuidePageData {
  id: string;
  slug: string;
  path: string;
  pillar: string;
  archetype: TemplateArchetype;

  // SEO Metadata
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  targetKeyword: string;
  secondaryKeywords: string[];
  readTime: string;
  lastUpdated: string;
  author: {
    name: string;
    role: string;
  };

  // Hero Section (Amazon style)
  heroTitle: string;
  heroSubheadline: string;
  heroCtaText: string;
  heroCtaSubtext: string;
  heroFootnote: string;
  heroImageUrl: string;
  heroImageAlt: string;

  // 3-Card Incentives / Takeaways Section (Amazon Screenshot 1)
  incentivesHeadline: string;
  incentivesSubhead: string;
  incentivesLinkText: string;
  takeawayCards: TakeawayItem[];

  // Why All About Pawz 2-Col Section (Amazon Screenshot 2)
  whyHeadline: string;
  whyFeatures: WhyFeatureItem[];
  whyCtaText: string;
  testimonials: TestimonialItem[];

  // Longform Guide Content
  introSummary: string;
  tableOfContents: { id: string; label: string }[];
  sections: ArticleSection[];
  relatedProducts: RelatedProductItem[];
  relatedArticles?: { title: string; path: string }[];
  faqs: FaqItem[];

  // Local Mid-South connection
  serviceCity?: string;
  localServiceAreas: string[];
}

export interface CategoryNode {
  name: string;
  slug: string;
  path?: string;
  children?: CategoryNode[];
  itemCount?: number;
}
