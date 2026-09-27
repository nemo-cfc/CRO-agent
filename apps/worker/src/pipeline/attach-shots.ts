import type { Check, CheckShot, PageEvidence, PageRole, Viewport } from '@cro/shared';

type Pick = (pages: PageEvidence[]) => PageEvidence | null;

const find = (role: PageRole, viewport: Viewport): Pick => (pages) =>
  pages.find((p) => p.ok && p.role === role && p.viewport === viewport) ?? null;
const first = (...picks: Pick[]): Pick => (pages) => {
  for (const pick of picks) {
    const page = pick(pages);
    if (page) return page;
  }
  return null;
};

// These mirror the page each rule reads (see rules/util.ts buildContext and
// the `pick` helpers in the rule files), so the picture shows the same view
// that produced the measurement.
const HOME = first(find('home', 'desktop'), find('home', 'mobile'));
const HOME_MOBILE = find('home', 'mobile');
const HOME_DESKTOP = find('home', 'desktop');
const HOME_MOBILE_FIRST = first(find('home', 'mobile'), find('home', 'desktop'));
const secondary = (vp: Viewport) => first(find('keypage', vp), find('product', vp), find('collection', vp));
const KEY_MOBILE = first(secondary('mobile'), secondary('desktop'));
const PRODUCT = first(find('product', 'mobile'), find('product', 'desktop'));
const COLLECTION = first(find('collection', 'mobile'), find('collection', 'desktop'));
const FORM_PAGE: Pick = (pages) =>
  [secondary('desktop'), secondary('mobile'), HOME_DESKTOP, HOME_MOBILE]
    .map((pick) => pick(pages))
    .find((p) => p?.form && p.form.fields > 0) ?? null;

interface Target {
  page: Pick;
  /** Element key tagged in collect-fn; omitted for a whole-viewport shot. */
  element?: string;
  caption: string;
}

const CLEAN = 'The first screen (pop-ups hidden)';
const TARGETS: Record<string, Target> = {
  // The pop-up findings are about the arrival state, so they keep the raw
  // arrival screenshot. Everything else uses a clean view or a crop, never a
  // picture dominated by a pop-up.
  'friction.blockingOverlay': { page: HOME_MOBILE_FIRST, caption: 'What a visitor sees on arrival' },
  'friction.cookieBanner': { page: HOME_MOBILE_FIRST, caption: 'What a visitor sees on arrival' },
  'friction.chatWidget': { page: HOME_MOBILE_FIRST, caption: 'What a visitor sees on arrival' },
  'cta.contrast': { page: HOME, element: 'cta', caption: 'The main button that was measured' },
  'cta.copy': { page: HOME, element: 'cta', caption: 'The main button' },
  'cta.tapTarget': { page: HOME_MOBILE, element: 'cta', caption: 'The main button on a phone' },
  'cta.competing': { page: HOME, element: 'clean', caption: CLEAN },
  'cta.keyPage': { page: KEY_MOBILE, element: 'clean', caption: CLEAN },
  'aboveFold.h1Present': { page: HOME, element: 'h1', caption: 'The headline' },
  'aboveFold.h1Length': { page: HOME, element: 'h1', caption: 'The headline' },
  'aboveFold.heroCopy': { page: HOME, element: 'clean', caption: CLEAN },
  'aboveFold.ctaDesktop': { page: HOME_DESKTOP, element: 'clean', caption: CLEAN },
  'aboveFold.ctaMobile': { page: HOME_MOBILE, element: 'clean', caption: CLEAN },
  'mobile.tapTargets': { page: HOME_MOBILE, element: 'clean', caption: CLEAN },
  'mobile.stickyCta': { page: HOME_MOBILE, element: 'clean', caption: CLEAN },
  'mobile.overflow': { page: HOME_MOBILE, element: 'clean', caption: CLEAN },
  'mobile.textSize': { page: HOME_MOBILE, element: 'clean', caption: CLEAN },
  'trust.testimonials': { page: HOME_MOBILE, element: 'clean', caption: CLEAN },
  'forms.fieldCount': { page: FORM_PAGE, element: 'form', caption: 'The form that was measured' },
  'forms.labels': { page: FORM_PAGE, element: 'form', caption: 'The form that was measured' },
  'forms.autocomplete': { page: FORM_PAGE, element: 'form', caption: 'The form that was measured' },
  'forms.submitCopy': { page: FORM_PAGE, element: 'form', caption: 'The form that was measured' },
  // Things that are not on the first screen are shown by the first screen itself.
  'ecommerce.price': { page: PRODUCT, element: 'clean', caption: 'The first screen of the product page (pop-ups hidden)' },
  'ecommerce.addToCart': { page: PRODUCT, element: 'clean', caption: 'The first screen of the product page (pop-ups hidden)' },
  'ecommerce.socialProof': { page: PRODUCT, element: 'clean', caption: 'The first screen of the product page (pop-ups hidden)' },
  'ecommerce.gallery': { page: PRODUCT, element: 'clean', caption: 'The first screen of the product page (pop-ups hidden)' },
  'ecommerce.addToCartSize': { page: PRODUCT, element: 'cart', caption: 'The buy button' },
  'ecommerce.paymentTrust': { page: PRODUCT, element: 'cart', caption: 'Around the buy button' },
  'ecommerce.stock': { page: PRODUCT, element: 'cart', caption: 'Around the buy button' },
  'ecommerce.deliveryTerms': { page: PRODUCT, element: 'cart', caption: 'Around the buy button' },
  'ecommerce.cartFeedback': { page: PRODUCT, element: 'bag', caption: 'What appeared after tapping the buy button' },
  'ecommerce.cartContinue': { page: PRODUCT, element: 'bag', caption: 'What appeared after tapping the buy button' },
  'ecommerce.cartCrossSell': { page: PRODUCT, element: 'bag', caption: 'What appeared after tapping the buy button' },
  'ecommerce.tilePrices': { page: COLLECTION, element: 'clean', caption: 'The collection page (pop-ups hidden)' },
  'ecommerce.browseTools': { page: COLLECTION, element: 'clean', caption: 'The collection page (pop-ups hidden)' },
  'ecommerce.search': { page: COLLECTION, element: 'clean', caption: 'The collection page (pop-ups hidden)' },
};

/**
 * Attach visual proof to the checks that point at something on screen.
 * Element crops travel with the check; whole-viewport references point at
 * the page shot the report already has, so no image is sent twice.
 */
export function attachShots(checks: Check[], pages: PageEvidence[]): Check[] {
  return checks.map((c) => {
    const target = TARGETS[c.id];
    if (!target || c.status === 'na') return c;
    const page = target.page(pages);
    if (!page) return c;
    let shot: CheckShot | undefined;
    if (target.element) {
      const crop = page.elementShots?.find((s) => s.key === target.element);
      if (crop) {
        shot = { kind: 'element', role: page.role, viewport: page.viewport, caption: target.caption, dataUri: crop.dataUri, highlighted: target.element !== 'bag' && target.element !== 'clean' };
      }
    }
    // Fall back to the page view when the element could not be cropped.
    if (!shot && page.screenshot && (!target.element || !target.element.startsWith('clean')) && (c.id.startsWith('friction.') || !target.element)) {
      shot = {
        kind: 'page',
        role: page.role,
        viewport: page.viewport,
        caption: target.element ? 'Above the fold on arrival' : target.caption,
      };
    }
    return shot ? { ...c, shot } : c;
  });
}
