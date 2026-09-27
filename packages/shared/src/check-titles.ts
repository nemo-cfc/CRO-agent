import type { Check } from './schema.js';

/**
 * Check titles state the goal ("Nothing blocks the page on arrival"), which
 * reads as a pass. When a check is flagged, the report shows what is actually
 * wrong instead. Entries can depend on the measured evidence where one goal
 * can fail in different ways (no headline vs. several headlines).
 */
const ISSUE_TITLES: Record<string, string | ((c: Check) => string)> = {
  'aboveFold.h1Present': (c) => (c.evidence.h1Count === 0 ? 'The page has no main headline' : 'Several headlines compete for attention'),
  'aboveFold.h1Length': 'The headline is too long to scan',
  'aboveFold.heroCopy': 'The headline has no supporting copy',
  'aboveFold.ctaDesktop': 'No call to action is visible without scrolling on desktop',
  'aboveFold.ctaMobile': 'No call to action is visible without scrolling on mobile',
  'cta.competing': 'Several equally prominent actions compete',
  'cta.contrast': 'The main button has low contrast',
  'cta.copy': 'The main button’s wording is vague',
  'cta.tapTarget': 'The main button is too small to tap comfortably',
  'cta.keyPage': 'The key page has no visible action on arrival',
  'ecommerce.price': (c) => (c.evidence.priceText ? 'The price is not visible without scrolling' : 'No price was found on the product page'),
  'ecommerce.addToCart': (c) => (c.evidence.text ? 'The buy button is below the fold on mobile' : 'No buy button was found on the product page'),
  'ecommerce.addToCartSize': 'The buy button is too small to tap comfortably',
  'ecommerce.socialProof': 'The product shows no ratings or reviews',
  'ecommerce.gallery': 'The product has too few images',
  'ecommerce.stock': 'Availability is not stated',
  'ecommerce.deliveryTerms': (c) =>
    !c.evidence.shipping && !c.evidence.returns
      ? 'Shipping and returns information is missing'
      : !c.evidence.returns
        ? 'Returns information is missing'
        : 'Shipping information is missing',
  'ecommerce.paymentTrust': 'No payment methods are shown near the buy button',
  'ecommerce.variantLoad': 'Too many choices before a shopper can buy',
  'ecommerce.tilePrices': 'Prices are missing from the category grid',
  'ecommerce.browseTools': (c) =>
    !c.evidence.filters && !c.evidence.sort ? 'Shoppers cannot filter or sort' : !c.evidence.sort ? 'Shoppers cannot sort products' : 'Shoppers cannot filter products',
  'ecommerce.search': 'There is no search',
  'ecommerce.cartAccess': 'The cart is hard to reach',
  'ecommerce.cartFeedback': 'Adding to the bag gives no clear feedback',
  'ecommerce.cartContinue': 'The bag offers no way to keep shopping',
  'ecommerce.cartCrossSell': 'The bag suggests no other products',
  'forms.fieldCount': 'The form asks for too much',
  'forms.labels': 'Some form fields have no label',
  'forms.autocomplete': 'Browser autofill is not enabled',
  'forms.submitCopy': 'The submit button does not say what happens',
  'forms.captcha': 'A visible CAPTCHA adds friction',
  'friction.blockingOverlay': 'A pop-up blocks the page on arrival',
  'friction.cookieBanner': 'The consent banner takes up too much of the screen',
  'friction.chatWidget': 'The chat widget covers a button',
  'mobile.viewportMeta': 'The page does not declare a mobile viewport',
  'mobile.overflow': 'The page scrolls sideways on mobile',
  'mobile.textSize': 'Some text is too small to read on mobile',
  'mobile.tapTargets': 'Buttons are too small or too close together',
  'mobile.stickyCta': 'No action stays in reach while scrolling',
  'speed.fcp': 'The first content appears slowly',
  'speed.lcp': 'The main content loads slowly',
  'speed.inp': 'The page responds slowly to taps',
  'speed.cls': 'The layout jumps while loading',
  'speed.ttfb': 'The server responds slowly',
  'speed.blocking': 'Scripts block the page while it loads',
  'speed.imageDimensions': 'Images do not reserve their space',
  'speed.weight': 'The page is heavy to download',
  'technical.title': 'The page title is missing or too long',
  'technical.metaDescription': 'The search-result description is missing or the wrong length',
  'technical.canonical': 'No canonical URL is declared',
  'technical.socialPreview': 'Link previews are incomplete',
  'technical.schema': 'No structured data describes the business',
  'technical.lang': 'The page language is not declared',
  'tracking.analytics': 'No analytics installation was detected',
  'tracking.tagManager': 'No tag manager was detected',
  'tracking.adPixel': 'No ad pixel was detected',
  'tracking.behaviour': 'No session recording or heatmap tool was detected',
  'trust.testimonials': 'No customer testimonials or reviews are shown',
  'trust.logos': 'No recognisable names or credentials are shown',
  'trust.legal': 'Privacy or terms links are missing',
  'trust.contact': 'There is no visible way to contact a person',
  'trust.presence': (c) =>
    !c.evidence.about && !c.evidence.social ? 'No About page or social profiles are linked' : !c.evidence.about ? 'No About page is linked' : 'No social profiles are linked',
};

/** The title to show: the goal when it is met or not measured, the problem when it is not. */
export function displayTitle(check: Check): string {
  if (check.status !== 'fail' && check.status !== 'warn') return check.title;
  const issue = ISSUE_TITLES[check.id];
  if (!issue) return check.title;
  return typeof issue === 'function' ? issue(check) : issue;
}
