import type { AuditEvidence, PageEvidence, StaticEvidence } from '@cro/shared';

export function page(overrides: Partial<PageEvidence> = {}): PageEvidence {
  const base: PageEvidence = {
    url: 'https://example.com/',
    finalUrl: 'https://example.com/',
    role: 'home',
    viewport: 'desktop',
    ok: true,
    error: null,
    timing: { navMs: 800, collectMs: 40 },
    ctas: [
      {
        text: 'Book a free consultation',
        tag: 'a',
        href: '/book',
        aboveFold: true,
        width: 220,
        height: 52,
        contrast: 7.1,
        prominence: 9,
      },
    ],
    ctasAboveFold: 1,
    form: null,
    formCount: 0,
    perf: {
      fcp: 1000, blockingTime: 40, lcp: 1800, cls: 0.02, ttfb: 320, domContentLoaded: 900,
      longTasks: 1, longTaskMs: 90, resourceCount: 30,
      imageBytes: 400_000, scriptBytes: 200_000, totalBytes: 900_000,
      imagesMissingDimensions: 0, imagesWithoutAlt: 0, renderBlockingResources: 2,
    },
    trust: {
      testimonialBlocks: 3, reviewSchema: true, logoStrip: true, badgeImages: 2,
      hasPrivacyLink: true, hasTermsLink: true, hasContactLink: true,
      hasAboutLink: true, hasPhone: true, hasEmail: true, hasSocialLinks: true,
    },
    mobile: {
      horizontalOverflow: false, overflowPx: 0, smallTextNodes: 0,
      tinyTapTargets: 0, crowdedTapTargets: 0, stickyCta: true,
    },
    friction: {
      blockingOverlays: 0, largestOverlayCoverage: 0, openDialogs: 0,
      cookieBanner: false, cookieCoverage: 0, overlays: [], chatWidget: false, widgetObscuresCta: false,
    },
    tracking: {
      ga4: true, gtm: true, metaPixel: true, clarity: true, hotjar: false,
      hubspot: false, segment: false, plausible: false, other: [],
    },
    copy: {
      h1: 'Book a yoga class in 30 seconds',
      h1Count: 1, h2Count: 4,
      heroCopy: 'Small classes with qualified teachers, near you, at times that actually work.',
      wordCount: 620, readingEase: 68, avgSentenceWords: 14,
      benefitHits: 22, featureHits: 6, jargonHits: 0, headlineHasNumber: true,
    },
    ecommerce: {
      priceVisible: true,
      priceAboveFold: true,
      priceText: '£49.00',
      addToCartText: 'Add to cart',
      addToCartAboveFold: true,
      stickyBuyBar: false,
      structuredRating: null,
      addToCartWidth: 320,
      addToCartHeight: 52,
      variantGroups: 2,
      stockText: 'In stock',
      galleryImages: 6,
      reviewWidget: true,
      ratingText: '4.8 out of 5',
      shippingInfo: true,
      returnsInfo: true,
      paymentIcons: 4,
      productTiles: 24,
      tilesWithPrice: 24,
      hasFilters: true,
      hasSort: true,
      cartLink: true,
      searchBox: true,
    },
    screenshot: null,
  };
  return { ...base, ...overrides };
}

export function staticEvidence(overrides: Partial<StaticEvidence> = {}): StaticEvidence {
  const base: StaticEvidence = {
    url: 'https://example.com/',
    finalUrl: 'https://example.com/',
    status: 200,
    title: 'Book yoga classes near you — Example Studio',
    metaDescription:
      'Find and book small-group yoga classes with qualified teachers near you, at times that fit around work.',
    canonical: 'https://example.com/',
    lang: 'en',
    viewportMeta: true,
    og: { title: true, description: true, image: true },
    twitterCard: true,
    favicon: true,
    schemaTypes: ['Organization', 'LocalBusiness'],
    htmlBytes: 48_000,
    internalLinks: [],
    generator: 'Next.js',
    ttfbMs: 300,
  };
  return { ...base, ...overrides };
}

/** A site where everything is in good shape. Used as the baseline to perturb. */
export function healthyEvidence(overrides: Partial<AuditEvidence> = {}): AuditEvidence {
  const base: AuditEvidence = {
    url: 'https://example.com/',
    platform: 'other',
    targets: [
      { url: 'https://example.com/', role: 'home', reason: 'Where most first-time visitors land' },
      {
        url: 'https://example.com/pricing',
        role: 'keypage',
        reason: 'Highest-intent internal page (pricing)',
      },
    ],
    static: staticEvidence(),
    crux: null,
    pages: [
      page({ role: 'home', viewport: 'desktop' }),
      page({ role: 'home', viewport: 'mobile' }),
      page({ role: 'keypage', viewport: 'desktop', url: 'https://example.com/pricing', finalUrl: 'https://example.com/pricing' }),
      page({ role: 'keypage', viewport: 'mobile', url: 'https://example.com/pricing', finalUrl: 'https://example.com/pricing' }),
    ],
  };
  return { ...base, ...overrides };
}

/** A healthy Shopify store: homepage, collection and product all in good shape. */
export function healthyStoreEvidence(overrides: Partial<AuditEvidence> = {}): AuditEvidence {
  const collectionUrl = 'https://shop.example.com/collections/bestsellers';
  const productUrl = 'https://shop.example.com/products/thing';

  const base: AuditEvidence = {
    url: 'https://shop.example.com/',
    platform: 'shopify',
    targets: [
      { url: 'https://shop.example.com/', role: 'home', reason: 'Where most first-time visitors land' },
      { url: collectionUrl, role: 'collection', reason: 'Category page linked from the homepage' },
      { url: productUrl, role: 'product', reason: 'Representative product page' },
    ],
    static: staticEvidence({ url: 'https://shop.example.com/', finalUrl: 'https://shop.example.com/' }),
    crux: null,
    pages: [
      page({ role: 'home', viewport: 'desktop' }),
      page({ role: 'home', viewport: 'mobile' }),
      page({ role: 'collection', viewport: 'desktop', url: collectionUrl, finalUrl: collectionUrl }),
      page({ role: 'collection', viewport: 'mobile', url: collectionUrl, finalUrl: collectionUrl }),
      page({ role: 'product', viewport: 'desktop', url: productUrl, finalUrl: productUrl }),
      page({ role: 'product', viewport: 'mobile', url: productUrl, finalUrl: productUrl }),
    ],
  };
  return { ...base, ...overrides };
}
