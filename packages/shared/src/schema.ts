import { z } from 'zod';

/* ------------------------------------------------------------------ *
 * Categories & scoring weights
 * ------------------------------------------------------------------ */

export const CATEGORIES = [
  'aboveFold',
  'cta',
  'trust',
  'forms',
  'speed',
  'mobile',
  'copy',
  'technical',
  'tracking',
  'friction',
  'ecommerce',
] as const;

export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

export const CATEGORY_LABELS: Record<Category, string> = {
  aboveFold: 'Above the fold',
  cta: 'Calls to action',
  trust: 'Trust & credibility',
  forms: 'Forms & friction',
  speed: 'Speed & stability',
  mobile: 'Mobile experience',
  copy: 'Messaging & copy',
  technical: 'Technical foundations',
  tracking: 'Measurement',
  friction: 'Interruptions',
  ecommerce: 'Shopping experience',
};

/** Relative weight of each category in the overall score. Tune here, not in check logic. */
export const CATEGORY_WEIGHTS: Record<Category, number> = {
  aboveFold: 1.5,
  cta: 1.5,
  trust: 1.25,
  forms: 1.25,
  speed: 1.25,
  mobile: 1.25,
  copy: 1.0,
  technical: 0.75,
  tracking: 0.75,
  friction: 1.0,
  // Weighted highest on a store, because these checks sit directly on the
  // path to a purchase. Scores nothing on a non-commerce site, where the
  // whole category is skipped rather than counted as a free pass.
  ecommerce: 1.75,
};

/* ------------------------------------------------------------------ *
 * Platform
 * ------------------------------------------------------------------ */

export const PlatformSchema = z.enum([
  'shopify',
  'woocommerce',
  'magento',
  'bigcommerce',
  'wordpress',
  'other',
]);
export type Platform = z.infer<typeof PlatformSchema>;

export const ECOMMERCE_PLATFORMS: Platform[] = [
  'shopify',
  'woocommerce',
  'magento',
  'bigcommerce',
];

export const PLATFORM_LABELS: Record<Platform, string> = {
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
  magento: 'Magento',
  bigcommerce: 'BigCommerce',
  wordpress: 'WordPress',
  other: 'Unknown platform',
};

export function isStore(platform: Platform | null | undefined): boolean {
  return !!platform && ECOMMERCE_PLATFORMS.includes(platform);
}

/* ------------------------------------------------------------------ *
 * Checks
 * ------------------------------------------------------------------ */

export const CheckStatusSchema = z.enum(['pass', 'warn', 'fail', 'na']);
export type CheckStatus = z.infer<typeof CheckStatusSchema>;

export const CheckSchema = z.object({
  /** Stable identifier, e.g. "cta.contrast". Referenced by recommendations. */
  id: z.string(),
  category: CategorySchema,
  title: z.string(),
  status: CheckStatusSchema,
  /** Relative importance within its category. */
  weight: z.number().min(0).max(3),
  /** Short factual statement of what was measured. Shown in the UI. */
  detail: z.string(),
  /** Which page produced this. */
  scope: z.enum(['home', 'keypage', 'collection', 'product', 'site']).default('home'),
  /** Raw measured values, for the report and for the model's evidence packet. */
  evidence: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});
export type Check = z.infer<typeof CheckSchema>;

export const CategoryScoreSchema = z.object({
  category: CategorySchema,
  /** 0-100 within this category. */
  score: z.number().min(0).max(100),
  passed: z.number().int(),
  warned: z.number().int(),
  failed: z.number().int(),
  applicable: z.number().int(),
});
export type CategoryScore = z.infer<typeof CategoryScoreSchema>;

export const ScorecardSchema = z.object({
  overall: z.number().min(0).max(100),
  categories: z.array(CategoryScoreSchema),
});
export type Scorecard = z.infer<typeof ScorecardSchema>;

/* ------------------------------------------------------------------ *
 * Evidence — what the collector returns for one page at one viewport
 * ------------------------------------------------------------------ */

export const ViewportSchema = z.enum(['desktop', 'mobile']);
export type Viewport = z.infer<typeof ViewportSchema>;

/**
 * `keypage` is the generic highest-intent page used on non-store sites.
 * Stores get the funnel instead: home → collection → product.
 */
export const PageRoleSchema = z.enum(['home', 'keypage', 'collection', 'product']);
export type PageRole = z.infer<typeof PageRoleSchema>;

export const ROLE_LABELS: Record<PageRole, string> = {
  home: 'Homepage',
  keypage: 'Key page',
  collection: 'Collection page',
  product: 'Product page',
};

export const CtaCandidateSchema = z.object({
  text: z.string(),
  tag: z.string(),
  href: z.string().nullable(),
  aboveFold: z.boolean(),
  width: z.number(),
  height: z.number(),
  /** Contrast ratio of label against its own background, WCAG formula. */
  contrast: z.number().nullable(),
  /** Heuristic weight — how much this looks like a primary action. */
  prominence: z.number(),
});
export type CtaCandidate = z.infer<typeof CtaCandidateSchema>;

export const FormEvidenceSchema = z.object({
  fields: z.number().int(),
  requiredFields: z.number().int(),
  unlabelledFields: z.number().int(),
  fieldsWithAutocomplete: z.number().int(),
  submitText: z.string().nullable(),
  hasCaptcha: z.boolean(),
  inputTypes: z.array(z.string()),
});
export type FormEvidence = z.infer<typeof FormEvidenceSchema>;

export const PerfEvidenceSchema = z.object({
  /** First Contentful Paint, ms. */
  fcp: z.number().nullable().default(null),
  /** Blocking time after FCP until collection; not Lighthouse TBT. */
  blockingTime: z.number().nullable().default(null),
  /** Largest Contentful Paint, ms. Null when the observer never fired. */
  lcp: z.number().nullable(),
  /** Cumulative Layout Shift, unitless. */
  cls: z.number().nullable(),
  /** Time to First Byte, ms. */
  ttfb: z.number().nullable(),
  domContentLoaded: z.number().nullable(),
  /** Count of tasks over 50ms — a Total Blocking Time proxy. */
  longTasks: z.number().int(),
  longTaskMs: z.number(),
  resourceCount: z.number().int(),
  imageBytes: z.number(),
  scriptBytes: z.number(),
  totalBytes: z.number(),
  /** Images rendered without width/height attributes — a layout-shift source. */
  imagesMissingDimensions: z.number().int(),
  imagesWithoutAlt: z.number().int(),
  renderBlockingResources: z.number().int(),
});
export type PerfEvidence = z.infer<typeof PerfEvidenceSchema>;

export const TrustEvidenceSchema = z.object({
  testimonialBlocks: z.number().int(),
  reviewSchema: z.boolean(),
  logoStrip: z.boolean(),
  badgeImages: z.number().int(),
  hasPrivacyLink: z.boolean(),
  hasTermsLink: z.boolean(),
  hasContactLink: z.boolean(),
  hasAboutLink: z.boolean(),
  hasPhone: z.boolean(),
  hasEmail: z.boolean(),
  hasSocialLinks: z.boolean(),
});
export type TrustEvidence = z.infer<typeof TrustEvidenceSchema>;

export const MobileEvidenceSchema = z.object({
  horizontalOverflow: z.boolean(),
  overflowPx: z.number(),
  smallTextNodes: z.number().int(),
  tinyTapTargets: z.number().int(),
  crowdedTapTargets: z.number().int(),
  stickyCta: z.boolean(),
});
export type MobileEvidence = z.infer<typeof MobileEvidenceSchema>;

export const FrictionEvidenceSchema = z.object({
  /** Overlays covering >20% of the viewport at load. */
  blockingOverlays: z.number().int(),
  largestOverlayCoverage: z.number(),
  openDialogs: z.number().int(),
  cookieBanner: z.boolean(),
  chatWidget: z.boolean(),
  /** Chat widget or similar covering a CTA's bounding box. */
  widgetObscuresCta: z.boolean(),
});
export type FrictionEvidence = z.infer<typeof FrictionEvidenceSchema>;

export const TrackingEvidenceSchema = z.object({
  ga4: z.boolean(),
  gtm: z.boolean(),
  metaPixel: z.boolean(),
  clarity: z.boolean(),
  hotjar: z.boolean(),
  hubspot: z.boolean(),
  segment: z.boolean(),
  plausible: z.boolean(),
  other: z.array(z.string()),
});
export type TrackingEvidence = z.infer<typeof TrackingEvidenceSchema>;

export const CopyEvidenceSchema = z.object({
  h1: z.string().nullable(),
  h1Count: z.number().int(),
  h2Count: z.number().int(),
  heroCopy: z.string().nullable(),
  wordCount: z.number().int(),
  /** Flesch reading ease, 0-100. Higher is easier. */
  readingEase: z.number().nullable(),
  avgSentenceWords: z.number().nullable(),
  benefitHits: z.number().int(),
  featureHits: z.number().int(),
  jargonHits: z.number().int(),
  /** Numbers/specifics in the headline — a specificity proxy. */
  headlineHasNumber: z.boolean(),
});
export type CopyEvidence = z.infer<typeof CopyEvidenceSchema>;

/**
 * Shopping signals. Populated on every page, but only scored on the roles
 * where each field means something — a missing Add to cart is a finding on a
 * product page and noise on a homepage.
 */
export const EcommerceEvidenceSchema = z.object({
  /* product-page signals */
  priceVisible: z.boolean(),
  priceAboveFold: z.boolean(),
  priceText: z.string().nullable(),
  addToCartText: z.string().nullable(),
  addToCartAboveFold: z.boolean(),
  addToCartWidth: z.number(),
  addToCartHeight: z.number(),
  variantGroups: z.number().int(),
  stockText: z.string().nullable(),
  galleryImages: z.number().int(),
  reviewWidget: z.boolean(),
  ratingText: z.string().nullable(),
  shippingInfo: z.boolean(),
  returnsInfo: z.boolean(),
  paymentIcons: z.number().int(),
  /* collection-page signals */
  productTiles: z.number().int(),
  tilesWithPrice: z.number().int(),
  hasFilters: z.boolean(),
  hasSort: z.boolean(),
  /* site-wide */
  cartLink: z.boolean(),
  searchBox: z.boolean(),
});
export type EcommerceEvidence = z.infer<typeof EcommerceEvidenceSchema>;

/** Everything one `page.evaluate` returns for a single page at a single viewport. */
export const PageEvidenceSchema = z.object({
  url: z.string(),
  finalUrl: z.string(),
  role: PageRoleSchema,
  viewport: ViewportSchema,
  ok: z.boolean(),
  error: z.string().nullable(),
  timing: z.object({ navMs: z.number(), collectMs: z.number() }),
  ctas: z.array(CtaCandidateSchema),
  ctasAboveFold: z.number().int(),
  form: FormEvidenceSchema.nullable(),
  formCount: z.number().int(),
  perf: PerfEvidenceSchema,
  trust: TrustEvidenceSchema,
  mobile: MobileEvidenceSchema,
  friction: FrictionEvidenceSchema,
  tracking: TrackingEvidenceSchema,
  copy: CopyEvidenceSchema,
  ecommerce: EcommerceEvidenceSchema,
  screenshot: z.string().nullable(),
});
export type PageEvidence = z.infer<typeof PageEvidenceSchema>;

/** Static-HTML track: fetched and parsed without a browser. */
export const StaticEvidenceSchema = z.object({
  url: z.string(),
  finalUrl: z.string(),
  status: z.number().int(),
  title: z.string().nullable(),
  metaDescription: z.string().nullable(),
  canonical: z.string().nullable(),
  lang: z.string().nullable(),
  viewportMeta: z.boolean(),
  og: z.object({
    title: z.boolean(),
    description: z.boolean(),
    image: z.boolean(),
  }),
  twitterCard: z.boolean(),
  favicon: z.boolean(),
  schemaTypes: z.array(z.string()),
  htmlBytes: z.number().int(),
  internalLinks: z.array(z.object({ href: z.string(), text: z.string() })),
  generator: z.string().nullable(),
  ttfbMs: z.number(),
});
export type StaticEvidence = z.infer<typeof StaticEvidenceSchema>;

/** Field data from the Chrome UX Report, when a key is configured. */
export const CruxEvidenceSchema = z.object({
  available: z.boolean(),
  lcpP75: z.number().nullable(),
  inpP75: z.number().nullable(),
  clsP75: z.number().nullable(),
});
export type CruxEvidence = z.infer<typeof CruxEvidenceSchema>;

/** One page the audit decided to load, and why. */
export const AuditTargetSchema = z.object({
  url: z.string(),
  role: PageRoleSchema,
  reason: z.string(),
});
export type AuditTarget = z.infer<typeof AuditTargetSchema>;

export const AuditEvidenceSchema = z.object({
  url: z.string(),
  platform: PlatformSchema,
  targets: z.array(AuditTargetSchema),
  static: StaticEvidenceSchema.nullable(),
  crux: CruxEvidenceSchema.nullable(),
  pages: z.array(PageEvidenceSchema),
});
export type AuditEvidence = z.infer<typeof AuditEvidenceSchema>;

/* ------------------------------------------------------------------ *
 * Recommendations (the model's output)
 * ------------------------------------------------------------------ */

export const RecommendationSchema = z.object({
  title: z.string(),
  category: CategorySchema,
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  impact: z.enum(['high', 'medium', 'low']),
  effort: z.enum(['quick-win', 'moderate', 'significant']),
  why_it_matters: z.string(),
  fix: z.string(),
  /** Check ids this recommendation is grounded in. */
  evidence_refs: z.array(z.string()),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const RecommendationsPayloadSchema = z.object({
  summary: z.string(),
  recommendations: z.array(RecommendationSchema),
});
export type RecommendationsPayload = z.infer<typeof RecommendationsPayloadSchema>;

/* ------------------------------------------------------------------ *
 * SSE events
 * ------------------------------------------------------------------ */

export const PHASES = [
  'queued',
  'resolving',
  'fetching',
  'rendering',
  'scoring',
  'writing',
  'done',
] as const;
export const PhaseSchema = z.enum(PHASES);
export type Phase = z.infer<typeof PhaseSchema>;

export const AuditEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('phase'),
    phase: PhaseSchema,
    label: z.string(),
    at: z.number(),
  }),
  z.object({
    type: z.literal('meta'),
    url: z.string(),
    finalUrl: z.string(),
    title: z.string().nullable(),
    description: z.string().nullable(),
    platform: PlatformSchema,
    targets: z.array(AuditTargetSchema),
    generator: z.string().nullable(),
    tracking: TrackingEvidenceSchema.nullable(),
    at: z.number(),
  }),
  z.object({
    type: z.literal('checks'),
    checks: z.array(CheckSchema),
    scorecard: ScorecardSchema,
    at: z.number(),
  }),
  z.object({
    type: z.literal('shot'),
    role: PageRoleSchema,
    viewport: ViewportSchema,
    url: z.string(),
    dataUri: z.string(),
    at: z.number(),
  }),
  z.object({
    type: z.literal('summary'),
    text: z.string(),
    at: z.number(),
  }),
  z.object({
    type: z.literal('rec'),
    index: z.number().int(),
    recommendation: RecommendationSchema,
    at: z.number(),
  }),
  z.object({
    type: z.literal('done'),
    durationMs: z.number(),
    partial: z.boolean(),
    notes: z.array(z.string()),
    at: z.number(),
  }),
  z.object({
    type: z.literal('error'),
    message: z.string(),
    recoverable: z.boolean(),
    at: z.number(),
  }),
]);
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const StartAuditRequestSchema = z.object({
  url: z.string().min(1),
});
export type StartAuditRequest = z.infer<typeof StartAuditRequestSchema>;

export const StartAuditResponseSchema = z.object({
  jobId: z.string(),
  url: z.string(),
});
export type StartAuditResponse = z.infer<typeof StartAuditResponseSchema>;
