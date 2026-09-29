import type { Check, PageEvidence } from '@cro/shared';
import { isStore } from '@cro/shared';
import { check, isUsablePage, skipped, type RuleContext } from './util.js';

/**
 * Store-funnel checks. Every one is scoped to the page role where it is
 * meaningful — a missing Add to cart is a finding on a product page and
 * meaningless on a homepage, and scoring it everywhere would be noise.
 *
 * The whole category is skipped on non-store sites rather than passed, so it
 * neither helps nor hurts a site that does not sell anything.
 */
export function ecommerceRules(ctx: RuleContext): Check[] {
  if (!isStore(ctx.evidence.platform)) {
    return [
      skipped(
        'ecommerce.notAStore',
        'ecommerce',
        'Shopping experience',
        'This does not appear to be an online store, so the shopping checks do not apply.',
      ),
    ];
  }

  const out: Check[] = [];
  const product = pick(ctx, 'product');
  const collection = pick(ctx, 'collection');

  out.push(...productChecks(product));
  out.push(...collectionChecks(collection));
  out.push(...cartChecks(product?.cartProbe ?? null));

  return out;
}

/**
 * What happens after "Add to bag", from the one tap the collector makes on
 * the product page. When the tap could not be completed automatically the
 * result is `na`, never a finding about the store.
 */
export function cartChecks(probe: PageEvidence['cartProbe'] | null): Check[] {
  if (!probe || probe.status === 'failed') {
    return [
      skipped(
        'ecommerce.cartTest',
        'ecommerce',
        'What happens after Add to bag',
        probe?.reason
          ? `The add-to-bag step could not be tested automatically: ${probe.reason}`
          : 'The add-to-bag step was not tested on this audit.',
      ),
    ];
  }
  const picked = probe.selections.length ? ` after choosing ${probe.selections.join(' / ')}` : '';
  const evidenceBase = { selections: probe.selections.join(' / '), button: probe.buttonText, view: probe.kind, trackingBlocked: probe.trackingBlocked ?? null };

  if (probe.status === 'no-feedback') {
    return [
      check({
        id: 'ecommerce.cartFeedback',
        category: 'ecommerce',
        title: 'Adding to bag gives clear feedback',
        status: 'warn',
        weight: 1.25,
        scope: 'product',
        detail: `Tapping "${probe.buttonText}"${picked} showed no bag drawer, cart page or confirmation message within 5 seconds. A subtle counter change may have been missed, but a shopper may be unsure the item was added.`,
        evidence: evidenceBase,
      }),
    ];
  }

  if (probe.kind === 'toast') {
    // A confirmation message instead of a drawer: clear feedback, but there
    // is no bag view to inspect, so the drawer checks do not apply.
    return [
      check({
        id: 'ecommerce.cartFeedback',
        category: 'ecommerce',
        title: 'Adding to bag gives clear feedback',
        status: 'pass',
        weight: 1.25,
        scope: 'product',
        detail: `Tapping "${probe.buttonText}"${picked} showed a confirmation${probe.reason ? ` ("${probe.reason}")` : ''} rather than opening a bag drawer.`,
        evidence: evidenceBase,
      }),
    ];
  }

  const where = probe.kind === 'drawer' ? 'bag drawer' : 'cart page';
  const out: Check[] = [
    check({
      id: 'ecommerce.cartFeedback',
      category: 'ecommerce',
      title: 'Adding to bag gives clear feedback',
      // The drawer opening is the feedback. A missing checkout button is not
      // claimed: checkout apps often draw it inside closed shadow DOM or
      // cross-origin frames that cannot be read (Allbirds' "Checkout+").
      status: 'pass',
      weight: 1.25,
      scope: 'product',
      detail: probe.hasCheckout
        ? `Tapping "${probe.buttonText}"${picked} opened a ${where} with a checkout button${probe.checkoutText ? ` ("${probe.checkoutText}")` : ''}.`
        : `Tapping "${probe.buttonText}"${picked} opened a ${where}. (Its checkout button could not be read automatically; see the screenshot.)`,
      evidence: { ...evidenceBase, checkout: probe.hasCheckout, checkoutText: probe.checkoutText },
    }),
    check({
      id: 'ecommerce.cartContinue',
      category: 'ecommerce',
      title: 'Shoppers can keep browsing from the bag',
      status: probe.hasContinueShopping ? 'pass' : 'warn',
      weight: 0.75,
      scope: 'product',
      detail: probe.hasContinueShopping
        ? `The ${where} offers a "continue shopping" route back to the store.`
        : `The ${where} has no "continue shopping" link or button${probe.kind === 'drawer' ? '; the only way back to browsing is closing it' : ''}. Shoppers who want to add more items have no prompt to do so.`,
      evidence: { ...evidenceBase, continueShopping: probe.hasContinueShopping },
    }),
    check({
      id: 'ecommerce.cartCrossSell',
      category: 'ecommerce',
      title: 'The bag suggests related products',
      status: probe.hasRecommendations ? 'pass' : 'warn',
      weight: 0.75,
      scope: 'product',
      detail: probe.hasRecommendations
        ? `The ${where} suggests other products.`
        : `The ${where} shows no product suggestions (such as "complete the look" or "you may also like"), so there is no prompt to add a second item.`,
      evidence: { ...evidenceBase, recommendations: probe.hasRecommendations },
    }),
  ];
  return out;
}

function pick(ctx: RuleContext, role: 'product' | 'collection'): PageEvidence | null {
  // Mobile first — it is where store traffic and store problems live.
  return (
    ctx.evidence.pages.find((p) => p.role === role && p.viewport === 'mobile' && isUsablePage(p)) ??
    ctx.evidence.pages.find((p) => p.role === role && isUsablePage(p)) ??
    null
  );
}

function productChecks(page: PageEvidence | null): Check[] {
  if (!page) {
    return [
      skipped(
        'ecommerce.productPage',
        'ecommerce',
        'Product page',
        'No product page was identified, so the product-page checks were skipped.',
      ),
    ];
  }

  const e = page.ecommerce;
  const out: Check[] = [];

  // The full-page scan (browser/product-scan.ts): every section scrolled and
  // screenshotted, the whole product area read including hidden accordions,
  // plus the page's structured data. A claim that something is ABSENT is only
  // made when that scan completed; otherwise the check is "not measured".
  const scan = page.productScan && page.productScan.policy === 'scan-v1' ? page.productScan : null;
  const scanned = !!scan?.completed;
  const scanNote = scan ? `checked across ${scan.sections} page section${scan.sections === 1 ? '' : 's'}, hidden content and the page's product data` : null;
  const verifiedAbsence = { verified: scanned, method: 'full-page-scan', sections: scan?.sections ?? 0, url: page.finalUrl };
  const measured = { verified: true, method: 'measured', url: page.finalUrl, viewport: page.viewport };

  // ---- price ----
  const priceKnown = e.priceVisible || !!scan?.price;
  out.push(
    check({
      id: 'ecommerce.price',
      category: 'ecommerce',
      title: 'Price is visible without scrolling',
      status: e.priceAboveFold ? 'pass' : e.priceVisible ? 'warn' : priceKnown ? 'na' : scanned ? 'fail' : 'na',
      weight: 2,
      scope: 'product',
      detail: e.priceAboveFold
        ? `Price (${e.priceText}) is visible on arrival.`
        : e.priceVisible
          ? `The price (${e.priceText}) is on the page but below the fold on a phone. Price is the first thing a shopper looks for; making them hunt for it adds doubt.`
          : priceKnown
            ? `The product has a price (${scan?.price}), but where it sits on screen could not be measured, so this is not scored.`
            : scanned
              ? `No price was found on the product page (${scanNote}).`
              : 'The price could not be checked on this visit, so this is not scored.',
      evidence: e.priceVisible ? { ...measured, priceText: e.priceText, aboveFold: e.priceAboveFold } : { ...verifiedAbsence, verified: scanned && !priceKnown, price: scan?.price ?? null },
    }),
  );

  // ---- buy button ----
  const buyKnown = !!e.addToCartText || !!scan?.buyControl;
  out.push(
    check({
      id: 'ecommerce.addToCart',
      category: 'ecommerce',
      title: 'Add to cart is reachable on arrival',
      status: e.addToCartAboveFold ? 'pass' : e.addToCartText ? 'warn' : buyKnown || scan?.available === false ? 'na' : scanned ? 'fail' : 'na',
      weight: 2,
      scope: 'product',
      detail: e.addToCartAboveFold
        ? e.stickyBuyBar
          ? `A sticky buy bar is on screen on arrival at 390px, so the buy action ("${e.addToCartText}") is reachable without scrolling.`
          : `"${e.addToCartText}" is visible above the fold at 390px.`
        : e.addToCartText
          ? `"${e.addToCartText}" sits below the fold on a phone. On a product page the buy button should never require a scroll to find.`
          : buyKnown
            ? `The page has a buy control ("${scan?.buyControl}"), but its position on arrival could not be measured, so this is not scored.`
            : scan?.available === false
              ? 'This product is sold out, so the buy button is not checked.'
              : scanned
                ? `No add-to-cart or buy button was found on the product page (${scanNote}).`
                : 'The buy button could not be checked on this visit, so this is not scored.',
      evidence: e.addToCartText
        ? { ...measured, text: e.addToCartText, aboveFold: e.addToCartAboveFold, width: e.addToCartWidth, height: e.addToCartHeight }
        : { ...verifiedAbsence, verified: scanned && !buyKnown && scan?.available !== false, buyControl: scan?.buyControl ?? null },
    }),
  );

  out.push(
    e.addToCartText
      ? check({
          id: 'ecommerce.addToCartSize',
          category: 'ecommerce',
          title: 'Buy button is thumb-sized',
          status: e.addToCartHeight >= 44 ? 'pass' : e.addToCartHeight >= 36 ? 'warn' : 'fail',
          scope: 'product',
          detail: `The buy button measures ${e.addToCartWidth}×${e.addToCartHeight}px on mobile. Below 44px tall it becomes a mis-tap risk on the single most valuable action in the store.`,
          evidence: { ...measured, width: e.addToCartWidth, height: e.addToCartHeight },
        })
      : skipped('ecommerce.addToCartSize', 'ecommerce', 'Buy button is thumb-sized', 'No buy button to measure.'),
  );

  // ---- reviews ----
  const rating = e.ratingText || e.structuredRating || (scan?.rating ? `${scan.rating} / 5${scan.reviewCount ? ` from ${scan.reviewCount} reviews` : ''}` : null);
  const noReviewsYet = !rating && !!scan?.reviewsEmpty;
  const reviewArea = e.reviewWidget || !!scan?.reviewsWidget;
  out.push(
    check({
      id: 'ecommerce.socialProof',
      category: 'ecommerce',
      title: 'Product carries ratings or reviews',
      status: rating ? 'pass' : noReviewsYet ? 'warn' : reviewArea ? 'na' : scanned ? 'fail' : 'na',
      weight: 1.5,
      scope: 'product',
      detail: rating
        ? `Reviews present (${rating}).`
        : noReviewsYet
          ? 'The product page has a reviews section, but it shows no reviews yet ("be the first to review"). A product without reviews asks first-time shoppers to take it on trust.'
          : reviewArea
            ? 'A review section is on the page but no rating could be read during this visit, so this is not scored.'
            : scanned
              ? `No reviews or ratings were found on the product page (${scanNote}).`
              : 'Reviews could not be checked on this visit, so this is not scored.',
      evidence: { ...verifiedAbsence, verified: scanned && !rating && (noReviewsYet || !reviewArea), widget: reviewArea, rating, reviewsEmpty: noReviewsYet },
    }),
  );

  // ---- images: count every photo, not only the one visible in a carousel ----
  // The scan's count (store product data first) is authoritative when it has one.
  const images = scan && scan.images > 0 ? scan.images : e.galleryImages;
  out.push(
    check({
      id: 'ecommerce.gallery',
      category: 'ecommerce',
      title: 'Product is shown from more than one angle',
      status: images >= 4 ? 'pass' : !scanned ? 'na' : images >= 2 ? 'warn' : 'fail',
      scope: 'product',
      detail: images >= 4
        ? `${images} product images${scan?.video ? ' and a video' : ''}.`
        : scanned
          ? `Only ${images} product image${images === 1 ? '' : 's'} (${scanNote}). Shoppers cannot handle the item, so photos have to answer their questions.`
          : 'The product photos could not all be counted on this visit, so this is not scored.',
      evidence: { ...verifiedAbsence, images, source: scan?.imagesSource ?? 'gallery', video: !!scan?.video },
    }),
  );

  // ---- availability ----
  const stock = e.stockText || scan?.stock || null;
  out.push(
    check({
      id: 'ecommerce.stock',
      category: 'ecommerce',
      title: 'Availability is stated',
      status: stock ? 'pass' : scanned ? 'warn' : 'na',
      weight: 0.75,
      scope: 'product',
      detail: stock
        ? `Availability shown as "${stock}".`
        : scanned
          ? `No stock or availability wording on the product page (${scanNote}). Saying an item is in stock removes a small doubt at no cost.`
          : 'Availability wording could not be checked on this visit, so this is not scored.',
      evidence: { ...verifiedAbsence, stockText: stock },
    }),
  );

  // ---- shipping and returns, including closed accordions ----
  const shipping = e.shippingInfo || !!scan?.shipping;
  const returns = e.returnsInfo || !!scan?.returns;
  out.push(
    check({
      id: 'ecommerce.deliveryTerms',
      category: 'ecommerce',
      title: 'Shipping and returns are answered on the page',
      status: shipping && returns ? 'pass' : !scanned ? 'na' : shipping || returns || e.shippingBanner ? 'warn' : 'fail',
      weight: 1.5,
      scope: 'product',
      detail: shipping && returns
        ? `Shipping and returns are both covered on the product page${scan?.shipping && scan?.returns ? ` ("${scan.shipping}", "${scan.returns}")` : ''}.`
        : !scanned
          ? 'Shipping and returns could not be fully checked on this visit, so this is not scored.'
          : [
              !shipping && e.shippingBanner ? 'Shipping terms appear only in the site-wide banner, not on the product page itself.' : !shipping ? 'No shipping or delivery information on the product page.' : '',
              !returns ? 'No returns or exchange information on the product page.' : '',
              `(${scanNote}).`,
            ].filter(Boolean).join(' '),
      evidence: { ...verifiedAbsence, shipping: scan?.shipping ?? (e.shippingInfo ? 'yes' : null), returns: scan?.returns ?? (e.returnsInfo ? 'yes' : null), shippingBanner: !!e.shippingBanner },
    }),
  );

  // ---- payment options ----
  const paymentShown = e.paymentIcons >= 2 || (scan?.payment.length ?? 0) > 0;
  out.push(
    check({
      id: 'ecommerce.paymentTrust',
      category: 'ecommerce',
      title: 'Accepted payment methods are shown',
      status: paymentShown ? 'pass' : scanned ? 'warn' : 'na',
      weight: 0.75,
      scope: 'product',
      detail: paymentShown
        ? `Payment options are shown${scan?.payment.length ? ` (${scan.payment.join(', ')})` : ` (${e.paymentIcons} payment marks)`}.`
        : scanned
          ? `No payment options (cards, UPI, COD, pay-later) are mentioned on the product page (${scanNote}).`
          : 'Payment options could not be checked on this visit, so this is not scored.',
      evidence: { ...verifiedAbsence, icons: e.paymentIcons, payment: scan?.payment.join(', ') ?? '' },
    }),
  );

  out.push(
    check({
      id: 'ecommerce.variantLoad',
      category: 'ecommerce',
      title: 'Choices before buying are kept few',
      status: e.variantGroups <= 2 ? 'pass' : e.variantGroups <= 4 ? 'warn' : 'fail',
      weight: 0.75,
      scope: 'product',
      detail:
        e.variantGroups <= 2
          ? `${e.variantGroups} choice${e.variantGroups === 1 ? '' : 's'} to make before adding to cart.`
          : `${e.variantGroups} separate choices stand between the shopper and the cart. Each one is a chance to hesitate; pre-select sensible defaults where you can.`,
      evidence: { variantGroups: e.variantGroups },
    }),
  );

  return out;
}

function collectionChecks(page: PageEvidence | null): Check[] {
  if (!page) {
    return [
      skipped(
        'ecommerce.collectionPage',
        'ecommerce',
        'Collection page',
        'No collection page was identified, so the category-page checks were skipped.',
      ),
    ];
  }

  const e = page.ecommerce;
  const out: Check[] = [];

  out.push(
    check({
      id: 'ecommerce.tilePrices',
      category: 'ecommerce',
      title: 'Prices are shown on the category grid',
      status:
        e.productTiles === 0
          ? 'na'
          : e.tilesWithPrice >= e.productTiles * 0.8
            ? 'pass'
            : e.tilesWithPrice > 0
              ? 'warn'
              : 'fail',
      weight: 1.5,
      scope: 'collection',
      detail:
        e.productTiles === 0
          ? 'The product grid could not be read during this visit (it may render late), so tile prices were not checked.'
          : `${e.tilesWithPrice} of ${e.productTiles} product tiles show a price. Shoppers filter by price before they click; a grid without prices forces a round trip for every comparison.`,
      evidence: { tiles: e.productTiles, withPrice: e.tilesWithPrice },
    }),
  );

  out.push(
    check({
      id: 'ecommerce.browseTools',
      category: 'ecommerce',
      title: 'Shoppers can filter and sort',
      // Not judged when the grid itself could not be read: the page may not have finished rendering.
      status: e.productTiles === 0 ? 'na' : e.hasFilters && e.hasSort ? 'pass' : e.hasFilters || e.hasSort ? 'warn' : 'fail',
      weight: 1.25,
      scope: 'collection',
      detail:
        e.productTiles === 0
          ? 'The category page had not finished rendering its product grid, so filtering and sorting were not checked.'
          : e.hasFilters && e.hasSort
          ? 'Both filtering and sorting are available on the category page.'
          : `Missing ${!e.hasFilters ? 'filters' : ''}${!e.hasFilters && !e.hasSort ? ' and ' : ''}${!e.hasSort ? 'sorting' : ''}. Once a category runs past about twenty items, browsing without these becomes scrolling.`,
      evidence: { filters: e.hasFilters, sort: e.hasSort },
    }),
  );

  out.push(
    check({
      id: 'ecommerce.search',
      category: 'ecommerce',
      title: 'Search is available',
      status: e.searchBox ? 'pass' : 'fail',
      weight: 1.25,
      scope: 'collection',
      detail: e.searchBox
        ? 'A search box is present.'
        : 'No search box found. Shoppers who arrive knowing what they want are the most likely to buy, and search is how they get there.',
      evidence: { searchBox: e.searchBox },
    }),
  );

  out.push(
    check({
      id: 'ecommerce.cartAccess',
      category: 'ecommerce',
      title: 'Cart is always reachable',
      status: e.cartLink ? 'pass' : 'warn',
      weight: 0.75,
      scope: 'collection',
      detail: e.cartLink
        ? 'A cart link is present in the page furniture.'
        : 'No persistent cart link found. Shoppers need to see what they have added without losing their place.',
      evidence: { cartLink: e.cartLink },
    }),
  );

  return out;
}
