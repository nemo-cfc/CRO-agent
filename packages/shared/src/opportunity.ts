import type { Check } from './schema.js';

/* ------------------------------------------------------------------ *
 * Opportunity scoring, cohorts and plain-language wording for the
 * store-owner report. An opportunity score is a RELATIVE estimate of how
 * much fixing an item could help conversions, based on how much this kind
 * of problem typically matters, how badly it failed and which page it is
 * on. It is not a revenue forecast.
 * ------------------------------------------------------------------ */

export type PageSection = 'home' | 'collection' | 'product';

export const SECTION_LABELS: Record<PageSection, string> = {
  home: 'Homepage',
  collection: 'Collection page',
  product: 'Product page',
};

export type Cohort =
  | 'interruptions' | 'firstImpression' | 'buttons' | 'readability' | 'speed' | 'findability'
  | 'buyConfidence' | 'bag' | 'trust' | 'forms' | 'searchSharing' | 'measurement';

export const COHORT_LABELS: Record<Cohort, string> = {
  interruptions: 'Pop-ups and interruptions',
  firstImpression: 'First impression',
  buttons: 'Buttons and tapping',
  readability: 'Easy to read',
  speed: 'Loading speed',
  findability: 'Finding products',
  buyConfidence: 'Confidence to buy',
  bag: 'After adding to the bag',
  trust: 'Trust and credibility',
  forms: 'Forms',
  searchSharing: 'Google and link sharing',
  measurement: 'Measurement',
};

interface Plain {
  /** What we found, in plain words. Falls back to the check's own detail. */
  found?: (c: Check) => string;
  /** Why it matters to sales. */
  why: string;
  /** What to do about it. */
  fix: string;
}

interface Meta { cohort: Cohort; impact: 1 | 2 | 3 | 4 | 5; plain: Plain }

const n = (v: unknown) => (typeof v === 'number' ? v : Number(v));
const secs = (ms: unknown) => `${(n(ms) / 1000).toFixed(1)} seconds`;

const META: Record<string, Meta> = {
  'friction.blockingOverlay': { cohort: 'interruptions', impact: 5, plain: {
    found: (c) => `As soon as someone opens your homepage on a phone, a pop-up covers ${Math.round(n(c.evidence.coverage) * 100)}% of the screen before they have seen anything.`,
    why: 'Visitors decide in seconds whether to stay. Being blocked before they see a single product is one of the most common reasons people leave straight away.',
    fix: 'Show the pop-up later (for example after a scroll or 15–20 seconds), or turn it into a small bar at the top or bottom that does not block the page.' } },
  'friction.cookieBanner': { cohort: 'interruptions', impact: 2, plain: {
    found: (c) => `The cookie notice takes up ${Math.round(n(c.evidence.coverage) * 100)}% of the phone screen.`,
    why: 'A large notice hides your products and offers while the visitor decides whether to accept.',
    fix: 'Use a slim bar at the bottom of the screen that still offers accept and reject options.' } },
  'friction.chatWidget': { cohort: 'interruptions', impact: 3, plain: {
    why: 'When the chat bubble sits on top of a button, taps meant for the button open the chat instead.',
    fix: 'Move the chat bubble so it never overlaps a button, or hide it on the first screen.' } },

  'aboveFold.h1Present': { cohort: 'firstImpression', impact: 2, plain: {
    found: (c) => (n(c.evidence.h1Count) === 0 ? 'The homepage has no main headline telling visitors what you sell.' : `The homepage has ${c.evidence.h1Count} main headlines competing for attention.`),
    why: 'A single clear headline tells a first-time visitor in one glance that they are in the right place.',
    fix: 'Give the homepage one main headline that says what you sell and who it is for.' } },
  'aboveFold.h1Length': { cohort: 'firstImpression', impact: 1, plain: {
    found: (c) => `The main headline is ${c.evidence.words} words long.`,
    why: 'Long headlines are skimmed rather than read.',
    fix: 'Cut the headline to under 12 words and move the detail into the line below it.' } },
  'aboveFold.heroCopy': { cohort: 'firstImpression', impact: 2, plain: {
    found: () => 'The top of the homepage has a headline but no short line explaining it.',
    why: 'One supporting sentence answers "why should I care?" before the visitor scrolls away.',
    fix: 'Add one short sentence under the headline about the main benefit.' } },
  'aboveFold.ctaDesktop': { cohort: 'firstImpression', impact: 4, plain: {
    found: () => 'On a computer screen there is nothing to click before scrolling.',
    why: 'Visitors who are ready to shop have no obvious next step.',
    fix: 'Put a clear "Shop" button on the first screen.' } },
  'aboveFold.ctaMobile': { cohort: 'firstImpression', impact: 5, plain: {
    found: () => 'On a phone there is nothing to tap before scrolling.',
    why: 'Most visitors arrive on a phone; without a visible next step many leave.',
    fix: 'Put a clear "Shop" button on the first phone screen.' } },
  'cta.competing': { cohort: 'firstImpression', impact: 2, plain: {
    why: 'When several buttons shout equally loudly, visitors hesitate over which to pick.',
    fix: 'Make one button clearly the main one and tone the others down.' } },
  'cta.keyPage': { cohort: 'firstImpression', impact: 4, plain: {
    found: () => 'The most important page has no visible button on arrival.',
    why: 'People who reach this page are ready to act, but have nothing to act on.',
    fix: 'Place the main action on the first screen of this page.' } },

  'cta.contrast': { cohort: 'readability', impact: 3, plain: {
    found: (c) => `The main button "${c.evidence.text}" does not stand out from its background.`,
    why: 'A button that blends in is easy to miss, so fewer people click it.',
    fix: 'Give the button a solid, strongly contrasting colour.' } },
  'cta.tapTarget': { cohort: 'buttons', impact: 3, plain: {
    found: (c) => `The main button${c.evidence.text ? ` "${c.evidence.text}"` : ''} is only ${c.evidence.width}×${c.evidence.height} pixels on a phone, smaller than a fingertip.`,
    why: 'Small buttons are hard to tap and look like plain text, so fewer people use them.',
    fix: 'Turn it into a proper button at least 44 pixels tall with a solid background.' } },
  'cta.copy': { cohort: 'buttons', impact: 2, plain: {
    found: (c) => `The main button just says "${c.evidence.text}".`,
    why: 'Vague wording does not tell people what happens when they tap.',
    fix: 'Say what the visitor gets, for example "Shop new arrivals".' } },
  'mobile.tapTargets': { cohort: 'buttons', impact: 3, plain: {
    found: (c) => `On a phone, ${c.evidence.tiny} buttons and links on the homepage are smaller than a fingertip, and ${c.evidence.crowded} sit very close to another one.`,
    why: 'Tiny, cramped buttons cause mis-taps, which frustrate shoppers on phones.',
    fix: 'Make buttons at least 44 pixels tall and leave space between neighbouring ones.' } },
  'mobile.stickyCta': { cohort: 'buttons', impact: 2, plain: {
    why: 'Once visitors scroll past the top, the main action disappears from reach.',
    fix: 'Keep a small button fixed at the bottom of the screen while scrolling.' } },
  'ecommerce.addToCartSize': { cohort: 'buttons', impact: 3, plain: {
    found: (c) => `The buy button is ${c.evidence.height} pixels tall on a phone, slightly under the recommended size.`,
    why: 'The buy button is the most valuable tap in the store; it should be effortless to hit.',
    fix: 'Make the buy button at least 44 pixels tall.' } },

  'mobile.textSize': { cohort: 'readability', impact: 2, plain: {
    found: (c) => `${c.evidence.smallTextNodes} blocks of text on the phone homepage are smaller than 12 pixels.`,
    why: 'Tiny text is skipped rather than read.',
    fix: 'Use at least 14–16 pixel text for anything visitors should read.' } },
  'mobile.overflow': { cohort: 'readability', impact: 3, plain: {
    found: () => 'On a phone the page slides sideways.',
    why: 'Sideways wobble makes the site feel broken.',
    fix: 'Find the element that is wider than the screen and make it fit.' } },
  'mobile.viewportMeta': { cohort: 'readability', impact: 5, plain: {
    found: () => 'The page is not set up for phone screens.',
    why: 'Phones show a shrunken desktop page that is hard to read and use.',
    fix: 'Add the standard mobile viewport setting to the page.' } },

  'speed.lcp': { cohort: 'speed', impact: 4, plain: {
    found: (c) => `The main image or text took ${secs(c.evidence.lcpMs)} to appear on a phone.`,
    why: 'Every extra second of waiting loses visitors, especially on mobile data.',
    fix: 'Shrink the first image on the page and load it first; delay anything not needed on the first screen.' } },
  'speed.fcp': { cohort: 'speed', impact: 3, plain: {
    found: (c) => `The page stayed blank for ${secs(c.evidence.fcpMs)} before anything showed.`,
    why: 'A blank screen makes visitors think the site is broken.',
    fix: 'Cut or delay the scripts and styles that load before anything appears.' } },
  'speed.cls': { cohort: 'speed', impact: 3, plain: {
    found: () => 'The page jumps around while it loads.',
    why: 'Content that moves makes people tap the wrong thing and lose their place.',
    fix: 'Reserve space for images, banners and pop-ups before they load.' } },
  'speed.ttfb': { cohort: 'speed', impact: 2, plain: {
    found: (c) => `The server took ${secs(c.evidence.ttfbMs)} to start responding.`,
    why: 'Everything else waits for this first response.',
    fix: 'Check your hosting, caching and any slow apps that run before the page is sent.' } },
  'speed.blocking': { cohort: 'speed', impact: 2, plain: {
    found: (c) => `Scripts kept the phone busy for ${secs(c.evidence.blockingTimeMs)} while the page loaded.`,
    why: 'While scripts run, taps and scrolls feel sluggish or are ignored.',
    fix: 'Remove unused apps and load non-essential scripts after the page appears.' } },
  'speed.inp': { cohort: 'speed', impact: 3, plain: {
    why: 'Pages that react slowly to taps feel broken.',
    fix: 'Reduce heavy scripts that run when people tap or type.' } },
  'speed.imageDimensions': { cohort: 'speed', impact: 2, plain: {
    found: (c) => `${c.evidence.missing} images on the homepage do not reserve their space, so the page shifts as they load.`,
    why: 'Shifting layouts cause mis-taps and feel unpolished.',
    fix: 'Give every image a set width and height (or aspect ratio).' } },
  'speed.weight': { cohort: 'speed', impact: 2, plain: {
    why: 'Heavy pages load slowly on phones and mobile data.',
    fix: 'Serve images no larger than they are shown and in a modern format; remove unused apps.' } },

  'ecommerce.price': { cohort: 'buyConfidence', impact: 5, plain: {
    found: (c) => (c.evidence.priceText ? 'On a phone, the price is not visible until the shopper scrolls.' : 'No price could be found on the product page.'),
    why: 'Price is the first thing shoppers look for; hunting for it adds doubt.',
    fix: 'Show the price right next to the product name at the top of the page.' } },
  'ecommerce.addToCart': { cohort: 'buyConfidence', impact: 5, plain: {
    found: (c) => (c.evidence.text ? 'On a phone, the buy button is not visible until the shopper scrolls.' : 'No buy button could be found on the product page.'),
    why: 'If the buy button is out of sight, ready-to-buy shoppers have to go looking for it.',
    fix: 'Bring the size choice and buy button onto the first phone screen, or add a buy bar that stays at the bottom of the screen.' } },
  'ecommerce.socialProof': { cohort: 'buyConfidence', impact: 5, plain: {
    found: () => 'The product page shows no star ratings or customer reviews.',
    why: 'Reviews from other buyers are one of the strongest reasons first-time shoppers trust a store.',
    fix: 'Add a reviews app and show the star rating near the product name.' } },
  'ecommerce.gallery': { cohort: 'buyConfidence', impact: 3, plain: {
    found: (c) => `The product has only ${c.evidence.images} image.`,
    why: 'Shoppers cannot touch the product, so photos have to answer their questions.',
    fix: 'Add several photos: different angles, close-ups, and the product in use.' } },
  'ecommerce.stock': { cohort: 'buyConfidence', impact: 2, plain: {
    found: () => 'The product page does not say whether the item is in stock.',
    why: 'Saying "In stock" removes a small doubt at no cost.',
    fix: 'Show availability, for example "In stock – ships in 2 days".' } },
  'ecommerce.deliveryTerms': { cohort: 'buyConfidence', impact: 4, plain: {
    why: 'Unanswered delivery and returns questions are among the most common reasons people abandon a purchase.',
    fix: 'Add short delivery and returns lines next to the buy button, with a link to the full policy.' } },
  'ecommerce.paymentTrust': { cohort: 'buyConfidence', impact: 3, plain: {
    found: () => 'No payment options (cards, PayPal, pay-later) are shown near the buy button.',
    why: 'Familiar payment logos reassure shoppers who have not bought from you before.',
    fix: 'Show the accepted payment methods, or a pay-later message, under the buy button.' } },
  'ecommerce.variantLoad': { cohort: 'buyConfidence', impact: 2, plain: {
    why: 'Every extra choice before buying is another chance to hesitate.',
    fix: 'Pre-select the most popular option where it makes sense.' } },

  'ecommerce.tilePrices': { cohort: 'findability', impact: 4, plain: {
    found: (c) => `Only ${c.evidence.withPrice} of ${c.evidence.tiles} products on the collection page show a price.`,
    why: 'Shoppers compare by price; without it they have to open each product.',
    fix: 'Show the price on every product in the grid.' } },
  'ecommerce.browseTools': { cohort: 'findability', impact: 3, plain: {
    found: (c) => (!c.evidence.filters && !c.evidence.sort ? 'The collection page has no way to filter or sort products.' : !c.evidence.sort ? 'The collection page has no way to sort products (by price, newest and so on).' : 'The collection page has no filters.'),
    why: 'Without filters and sorting, shoppers have to scroll through everything to find what suits them.',
    fix: 'Add filters (size, colour, price) and sorting (price, newest, best-selling).' } },
  'ecommerce.search': { cohort: 'findability', impact: 4, plain: {
    found: () => 'There is no search box.',
    why: 'Shoppers who know what they want use search, and they buy more often.',
    fix: 'Add a visible search box to the header.' } },
  'ecommerce.cartAccess': { cohort: 'findability', impact: 3, plain: {
    found: () => 'There is no visible link to the cart.',
    why: 'Shoppers need to get back to their bag at any time.',
    fix: 'Keep a cart icon with an item count in the header on every page.' } },

  'ecommerce.cartFeedback': { cohort: 'bag', impact: 4, plain: {
    found: () => 'After tapping the buy button, nothing clearly showed that the item was added.',
    why: 'Without confirmation, shoppers tap again or wonder whether it worked.',
    fix: 'Open a bag drawer or show a clear "Added to bag" message with a checkout button.' } },
  'ecommerce.cartContinue': { cohort: 'bag', impact: 3, plain: {
    found: () => 'The bag that opens after adding an item offers checkout but no "Continue shopping" option.',
    why: 'Shoppers who want a second item have no easy way back to browsing.',
    fix: 'Add a "Continue shopping" link in the bag.' } },
  'ecommerce.cartCrossSell': { cohort: 'bag', impact: 3, plain: {
    found: () => 'The bag that opens after adding an item suggests nothing else.',
    why: 'This is the moment shoppers are most open to adding a matching item.',
    fix: 'Show two or three complementary products in the bag.' } },

  'trust.testimonials': { cohort: 'trust', impact: 3, plain: {
    found: () => 'The homepage shows no customer quotes or reviews.',
    why: 'First-time visitors trust other customers more than the brand itself.',
    fix: 'Add a few short customer reviews to the homepage.' } },
  'trust.logos': { cohort: 'trust', impact: 2, plain: {
    why: 'Recognisable names and credentials build trust quickly.',
    fix: 'Show press mentions, awards or certifications.' } },
  'trust.legal': { cohort: 'trust', impact: 2, plain: {
    why: 'Missing privacy or terms links look like a red flag at checkout.',
    fix: 'Link to your privacy policy and terms in the footer.' } },
  'trust.contact': { cohort: 'trust', impact: 2, plain: {
    found: () => 'There is no visible phone number, email or contact page.',
    why: 'Shoppers who need reassurance before buying have nowhere to turn.',
    fix: 'Add contact details or a contact page link to the footer.' } },
  'trust.presence': { cohort: 'trust', impact: 1, plain: {
    why: 'An About page and social profiles show there is a real business behind the store.',
    fix: 'Link to your About page and social profiles in the footer.' } },

  'forms.fieldCount': { cohort: 'forms', impact: 3, plain: { why: 'Every extra form field loses some people.', fix: 'Ask only for what you truly need.' } },
  'forms.labels': { cohort: 'forms', impact: 2, plain: { why: 'Fields without labels become confusing once typing starts.', fix: 'Give every field a visible label.' } },
  'forms.autocomplete': { cohort: 'forms', impact: 2, plain: { why: 'Without autofill, phone users type everything by hand.', fix: 'Turn on browser autofill for the form fields.' } },
  'forms.submitCopy': { cohort: 'forms', impact: 1, plain: { why: '"Submit" does not say what happens next.', fix: 'Name the outcome, for example "Get my quote".' } },
  'forms.captcha': { cohort: 'forms', impact: 2, plain: { why: 'Visible puzzles stop real people as well as bots.', fix: 'Use invisible spam protection instead.' } },

  'technical.title': { cohort: 'searchSharing', impact: 1, plain: { why: 'The page title is what people see in Google results.', fix: 'Keep the title under about 60 characters, leading with what you sell.' } },
  'technical.metaDescription': { cohort: 'searchSharing', impact: 1, plain: { why: 'This is the text under your link in Google; too long and it gets cut off.', fix: 'Write a 70–160 character description that sells the click.' } },
  'technical.canonical': { cohort: 'searchSharing', impact: 1, plain: { why: 'Helps Google show the right version of each page.', fix: 'Add a canonical link to each page.' } },
  'technical.socialPreview': { cohort: 'searchSharing', impact: 1, plain: {
    found: () => 'Links shared on WhatsApp, Instagram or Slack show no preview image.',
    why: 'Shared links with an image get noticeably more clicks.',
    fix: 'Add a share image (og:image) to the homepage.' } },
  'technical.schema': { cohort: 'searchSharing', impact: 1, plain: { why: 'Structured data helps Google show richer results for your store.', fix: 'Add organisation and product structured data.' } },
  'technical.lang': { cohort: 'searchSharing', impact: 1, plain: { why: 'Helps browsers and search engines handle your language correctly.', fix: 'Declare the page language.' } },

  'tracking.analytics': { cohort: 'measurement', impact: 1, plain: { why: 'Without analytics you cannot tell what is working.', fix: 'Install Google Analytics or a similar tool.' } },
  'tracking.tagManager': { cohort: 'measurement', impact: 1, plain: { why: 'A tag manager lets you add tracking without a developer.', fix: 'Consider Google Tag Manager.' } },
  'tracking.adPixel': { cohort: 'measurement', impact: 1, plain: { why: 'Without an ad pixel, ad spend cannot be tied to sales.', fix: 'Install the pixel for the ad platforms you use.' } },
  'tracking.behaviour': { cohort: 'measurement', impact: 1, plain: { why: 'Session recordings show where visitors get stuck.', fix: 'Consider a free tool such as Microsoft Clarity.' } },
};

function metaFor(check: Check): Meta {
  const exact = META[check.id];
  if (exact) return exact;
  if (check.id.startsWith('visual.first-view-overlay')) return { cohort: 'interruptions', impact: 4, plain: { why: META['friction.blockingOverlay']!.plain.why, fix: META['friction.blockingOverlay']!.plain.fix } };
  if (check.id.startsWith('visual.low-contrast')) {
    return { cohort: 'readability', impact: 2, plain: {
      found: (c) => `The text “${c.evidence.text}” is hard to read against its background.`,
      why: 'Faint text is skipped rather than read.',
      fix: 'Darken the text or lighten its background until it reads easily.' } };
  }
  if (check.id.startsWith('visual.small-text')) {
    return { cohort: 'readability', impact: 2, plain: {
      found: (c) => `The text “${c.evidence.text}” is only ${Math.round(n(c.evidence.fontSize))} pixels tall.`,
      why: 'Tiny text is skipped rather than read, especially on phones.',
      fix: 'Make it at least 12–14 pixels.' } };
  }
  if (check.id.startsWith('visual.generic-action')) return { cohort: 'buttons', impact: 2, plain: {
    found: (c) => `A button just says “${c.evidence.text}”.`, why: 'Vague button text does not say what happens next.', fix: 'Say what the visitor gets.' } };
  if (check.id.startsWith('observed.')) return { cohort: 'measurement', impact: 1, plain: {
    found: (c) => `Your ${c.evidence.provider ?? 'tracking'} code appears to be loaded twice on this page.`,
    why: 'Tracking set up twice can inflate or confuse your numbers.', fix: 'Remove the duplicate tracking code.' } };
  return { cohort: 'firstImpression', impact: 2, plain: { why: '', fix: '' } };
}

/** The page a finding belongs to in the report. Site-wide items sit with the homepage. */
export function sectionOf(check: Check): PageSection {
  if (check.scope === 'product' || check.scope === 'keypage') return 'product';
  if (check.scope === 'collection') return 'collection';
  if (check.id.startsWith('visual.') || check.id.startsWith('observed.')) {
    const role = check.id.split('.')[2];
    if (role === 'product' || role === 'keypage') return 'product';
    if (role === 'collection') return 'collection';
  }
  return 'home';
}

export function cohortOf(check: Check): Cohort {
  return metaFor(check).cohort;
}

/** Relative 0–100 estimate of how much fixing this could help; higher = bigger opportunity. */
export function opportunityScore(check: Check): number {
  if (check.status !== 'fail' && check.status !== 'warn') return 0;
  const base = [0, 30, 45, 60, 75, 88][metaFor(check).impact]!;
  const severity = check.status === 'fail' ? 8 : 0;
  const page = sectionOf(check) === 'product' ? 4 : sectionOf(check) === 'collection' ? 2 : 0;
  return Math.min(98, base + severity + page);
}

/**
 * Combine several opportunities: the average of the biggest `top` of them.
 * (Adding scores together saturated at 99 for nearly every store.)
 */
export function combinedOpportunity(scores: number[], top = 3): number {
  if (!scores.length) return 0;
  const best = [...scores].sort((a, b) => b - a).slice(0, top);
  return Math.round(best.reduce((s, v) => s + v, 0) / best.length);
}

export function opportunityLevel(score: number): 'High' | 'Moderate' | 'Low' {
  return score >= 80 ? 'High' : score >= 55 ? 'Moderate' : 'Low';
}

/** Plain-language wording for a flagged check. */
export function plainLanguage(check: Check): { found: string; why: string; fix: string } {
  const { plain } = metaFor(check);
  return {
    found: plain.found ? plain.found(check) : check.detail,
    why: plain.why,
    fix: plain.fix,
  };
}
