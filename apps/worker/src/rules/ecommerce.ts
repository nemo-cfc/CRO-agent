import type { Check, PageEvidence } from '@cro/shared';
import { isStore } from '@cro/shared';
import { check, skipped, type RuleContext } from './util.js';

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

  return out;
}

function pick(ctx: RuleContext, role: 'product' | 'collection'): PageEvidence | null {
  // Mobile first — it is where store traffic and store problems live.
  return (
    ctx.evidence.pages.find((p) => p.role === role && p.viewport === 'mobile' && p.ok) ??
    ctx.evidence.pages.find((p) => p.role === role && p.ok) ??
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

  out.push(
    check({
      id: 'ecommerce.price',
      category: 'ecommerce',
      title: 'Price is visible without scrolling',
      status: e.priceAboveFold ? 'pass' : e.priceVisible ? 'warn' : 'fail',
      weight: 2,
      scope: 'product',
      detail: e.priceAboveFold
        ? `Price (${e.priceText}) is visible on arrival.`
        : e.priceVisible
          ? `The price (${e.priceText}) is on the page but below the fold. Price is the first thing a shopper looks for; making them hunt for it adds doubt.`
          : 'No price could be found on the product page. If price is hidden behind a variant choice, shoppers who are only comparing will leave.',
      evidence: { priceText: e.priceText, aboveFold: e.priceAboveFold },
    }),
  );

  out.push(
    check({
      id: 'ecommerce.addToCart',
      category: 'ecommerce',
      title: 'Add to cart is reachable on arrival',
      status: e.addToCartAboveFold ? 'pass' : e.addToCartText ? 'warn' : 'fail',
      weight: 2,
      scope: 'product',
      detail: e.addToCartAboveFold
        ? `"${e.addToCartText}" is visible above the fold at 390px.`
        : e.addToCartText
          ? `"${e.addToCartText}" sits below the fold on mobile. On a product page the buy button should never require a scroll to find.`
          : 'No add-to-cart button was found on the product page.',
      evidence: {
        text: e.addToCartText,
        aboveFold: e.addToCartAboveFold,
        width: e.addToCartWidth,
        height: e.addToCartHeight,
      },
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
          evidence: { width: e.addToCartWidth, height: e.addToCartHeight },
        })
      : skipped('ecommerce.addToCartSize', 'ecommerce', 'Buy button is thumb-sized', 'No buy button to measure.'),
  );

  out.push(
    check({
      id: 'ecommerce.socialProof',
      category: 'ecommerce',
      title: 'Product carries ratings or reviews',
      status: e.reviewWidget && e.ratingText ? 'pass' : e.reviewWidget ? 'warn' : 'fail',
      weight: 1.5,
      scope: 'product',
      detail:
        e.reviewWidget && e.ratingText
          ? `Reviews present (${e.ratingText}).`
          : e.reviewWidget
            ? 'A review widget is present but no rating or review count was readable, which suggests it is empty.'
            : 'No reviews or ratings on the product page. For an unfamiliar brand this is usually the single largest source of hesitation before checkout.',
      evidence: { widget: e.reviewWidget, rating: e.ratingText },
    }),
  );

  out.push(
    check({
      id: 'ecommerce.gallery',
      category: 'ecommerce',
      title: 'Product is shown from more than one angle',
      status: e.galleryImages >= 4 ? 'pass' : e.galleryImages >= 2 ? 'warn' : 'fail',
      scope: 'product',
      detail:
        e.galleryImages >= 2
          ? `${e.galleryImages} product images detected.`
          : `Only ${e.galleryImages} product image detected. Shoppers cannot handle the item, so images are doing the work of the shop floor.`,
      evidence: { images: e.galleryImages },
    }),
  );

  out.push(
    check({
      id: 'ecommerce.stock',
      category: 'ecommerce',
      title: 'Availability is stated',
      status: e.stockText ? 'pass' : 'warn',
      weight: 0.75,
      scope: 'product',
      detail: e.stockText
        ? `Availability shown as "${e.stockText}".`
        : 'No stock or availability wording found. Saying an item is in stock removes a small doubt at no cost; scarcity wording removes hesitation where it is genuinely true.',
      evidence: { stockText: e.stockText },
    }),
  );

  out.push(
    check({
      id: 'ecommerce.deliveryTerms',
      category: 'ecommerce',
      title: 'Shipping and returns are answered on the page',
      status: e.shippingInfo && e.returnsInfo ? 'pass' : e.shippingInfo || e.returnsInfo ? 'warn' : 'fail',
      weight: 1.5,
      scope: 'product',
      detail:
        e.shippingInfo && e.returnsInfo
          ? 'Both shipping and returns information appear on the product page.'
          : `Missing ${!e.shippingInfo ? 'shipping/delivery information' : ''}${!e.shippingInfo && !e.returnsInfo ? ' and ' : ''}${!e.returnsInfo ? 'returns information' : ''}. Unanswered delivery and returns questions are among the most common reasons a full cart is abandoned.`,
      evidence: { shipping: e.shippingInfo, returns: e.returnsInfo },
    }),
  );

  out.push(
    check({
      id: 'ecommerce.paymentTrust',
      category: 'ecommerce',
      title: 'Accepted payment methods are shown',
      status: e.paymentIcons >= 2 ? 'pass' : e.paymentIcons === 1 ? 'warn' : 'warn',
      weight: 0.75,
      scope: 'product',
      detail:
        e.paymentIcons >= 2
          ? `${e.paymentIcons} payment method marks shown.`
          : 'No payment method marks near the buy action. Recognisable payment logos are cheap reassurance for a shopper who has not bought from you before.',
      evidence: { icons: e.paymentIcons },
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
          ? 'warn'
          : e.tilesWithPrice >= e.productTiles * 0.8
            ? 'pass'
            : e.tilesWithPrice > 0
              ? 'warn'
              : 'fail',
      weight: 1.5,
      scope: 'collection',
      detail:
        e.productTiles === 0
          ? 'No product tiles were detected on the collection page.'
          : `${e.tilesWithPrice} of ${e.productTiles} product tiles show a price. Shoppers filter by price before they click; a grid without prices forces a round trip for every comparison.`,
      evidence: { tiles: e.productTiles, withPrice: e.tilesWithPrice },
    }),
  );

  out.push(
    check({
      id: 'ecommerce.browseTools',
      category: 'ecommerce',
      title: 'Shoppers can filter and sort',
      status: e.hasFilters && e.hasSort ? 'pass' : e.hasFilters || e.hasSort ? 'warn' : 'fail',
      weight: 1.25,
      scope: 'collection',
      detail:
        e.hasFilters && e.hasSort
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
