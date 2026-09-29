import { describe, expect, it } from 'vitest';
import { runRules } from '../index.js';
import { detectPlatform, findProductInHtml, findStorePages } from '../../pipeline/platform.js';
import { healthyEvidence, healthyStoreEvidence, page } from './fixtures.js';
import type { Check, PageEvidence } from '@cro/shared';

const byId = (checks: Check[], id: string): Check => {
  const found = checks.find((c) => c.id === id);
  if (!found) throw new Error(`no check with id ${id}`);
  return found;
};

/** Replace one role's pages with a perturbed variant, keeping the rest healthy. */
/** A completed full-page scan that found nothing, unless overridden. */
function scan(overrides: Partial<NonNullable<PageEvidence['productScan']>> = {}): NonNullable<PageEvidence['productScan']> {
  return {
    policy: 'scan-v1', completed: true, sections: 6, pageHeight: 4000, elapsedMs: 2000, textLength: 3000,
    price: null, priceSource: null, available: null, buyControl: null, images: 0, imagesSource: null, video: false,
    shipping: null, returns: null, payment: [], stock: null, reviewsWidget: false, reviewCount: null, rating: null, reviewsEmpty: false,
    ...overrides,
  };
}

function withRole(role: PageEvidence['role'], overrides: Partial<PageEvidence>) {
  const base = healthyStoreEvidence();
  return {
    ...base,
    pages: base.pages.map((p) =>
      p.role === role ? page({ ...p, ...overrides, role: p.role, viewport: p.viewport }) : p,
    ),
  };
}

describe('platform detection', () => {
  it('identifies Shopify from asset hosts', () => {
    expect(detectPlatform('<script src="https://cdn.shopify.com/s/files/x.js">')).toBe('shopify');
    expect(detectPlatform('<img src="/cdn/shop/files/hero.png">')).toBe('shopify');
  });

  it('does not mistake "image/" for Magento', () => {
    // A naive `mage/` marker matched every site on the web that serves an
    // image, including every Shopify store. This is that regression.
    const html = '<img src="/assets/image/hero.png"><script src="https://cdn.shopify.com/x.js">';
    expect(detectPlatform(html)).toBe('shopify');
    expect(detectPlatform('<img src="/media/image/photo.jpg">')).toBe('other');
  });

  it('identifies Magento only from namespaced markers', () => {
    expect(detectPlatform('<div data-mage-init=\'{"catalog":{}}\'>')).toBe('magento');
    expect(detectPlatform('<script src="/static/version1699/frontend/x.js">')).toBe('magento');
  });

  it('prefers WooCommerce over plain WordPress', () => {
    const html = '<link href="/wp-content/plugins/woocommerce/assets/css/woocommerce.css">';
    expect(detectPlatform(html)).toBe('woocommerce');
    expect(detectPlatform('<link href="/wp-content/themes/twentytwenty/style.css">')).toBe(
      'wordpress',
    );
  });

  it('trusts response headers over markup', () => {
    const headers = new Headers({ 'x-shopid': '12345' });
    expect(detectPlatform('<html>nothing identifying here</html>', headers)).toBe('shopify');
  });

  it('returns "other" for an ordinary site', () => {
    expect(detectPlatform('<html><body><h1>A blog</h1></body></html>')).toBe('other');
  });
});

describe('store page selection', () => {
  const links = [
    { href: 'https://s.com/collections/all', text: 'All' },
    { href: 'https://s.com/collections/bestsellers', text: 'Best sellers' },
    { href: 'https://s.com/collections/face-care', text: 'Face care' },
    { href: 'https://s.com/products/vitamin-c-serum', text: 'Vitamin C Serum' },
    { href: 'https://s.com/cart', text: 'Cart' },
    { href: 'https://s.com/pages/about', text: 'About' },
  ];

  it('picks one collection and one product', () => {
    const found = findStorePages('shopify', links);
    expect(found.collection).toBe('https://s.com/collections/bestsellers');
    expect(found.product).toBe('https://s.com/products/vitamin-c-serum');
  });

  it('skips /collections/all, which says nothing about merchandising', () => {
    expect(findStorePages('shopify', links).collection).not.toContain('/collections/all');
  });

  it('never treats the cart as a product page', () => {
    const found = findStorePages('shopify', [{ href: 'https://s.com/cart', text: 'Cart' }]);
    expect(found.product).toBeNull();
  });

  it('recognises WooCommerce URL shapes', () => {
    const found = findStorePages('woocommerce', [
      { href: 'https://s.com/product-category/shoes/', text: 'Shoes' },
      { href: 'https://s.com/product/blue-trainer/', text: 'Blue Trainer' },
    ]);
    expect(found.collection).toContain('/product-category/shoes');
    expect(found.product).toContain('/product/blue-trainer');
  });

  it('falls back to schema.org when URL shape is unreliable', () => {
    // Magento URLs are merchant-configurable, so the pattern match fails and
    // the structured data has to carry it.
    const html = `<script type="application/ld+json">
      {"@type":"Product","name":"Chair","url":"https://s.com/office-chair.html"}
    </script>`;
    expect(findProductInHtml('magento', html, 'https://s.com/')).toBe(
      'https://s.com/office-chair.html',
    );
  });
});

describe('store checks', () => {
  it('passes a well-built store', () => {
    const { checks } = runRules(healthyStoreEvidence());
    const ecom = checks.filter((c) => c.category === 'ecommerce');
    expect(ecom.length).toBeGreaterThan(10);
    expect(ecom.filter((c) => c.status === 'fail')).toEqual([]);
  });

  it('is skipped entirely on a site that does not sell anything', () => {
    const { checks, scorecard } = runRules(healthyEvidence());
    const ecom = checks.filter((c) => c.category === 'ecommerce');
    expect(ecom.every((c) => c.status === 'na')).toBe(true);
    // Skipped, not passed — it must not inflate the score of a non-store.
    expect(scorecard.categories.find((c) => c.category === 'ecommerce')?.applicable).toBe(0);
  });

  it('fails a product page with the buy button below the fold', () => {
    const ev = withRole('product', { ecommerce: { ...page().ecommerce, addToCartAboveFold: false } });
    expect(byId(runRules(ev).checks, 'ecommerce.addToCart').status).toBe('warn');
  });

  it('leaves an undetected buy button unverified', () => {
    const ev = withRole('product', {
      ecommerce: { ...page().ecommerce, addToCartText: null, addToCartAboveFold: false },
    });
    expect(byId(runRules(ev).checks, 'ecommerce.addToCart').status).toBe('na');
  });

  it('leaves an undetected price unverified', () => {
    const ev = withRole('product', {
      ecommerce: { ...page().ecommerce, priceVisible: false, priceAboveFold: false, priceText: null },
    });
    expect(byId(runRules(ev).checks, 'ecommerce.price').status).toBe('na');
  });

  it('fails a product page with no reviews once the full scan found none', () => {
    const ev = withRole('product', {
      ecommerce: { ...page().ecommerce, reviewWidget: false, ratingText: null },
      productScan: scan(),
    });
    const c = byId(runRules(ev).checks, 'ecommerce.socialProof');
    expect(c.status).toBe('fail');
    expect(c.evidence.verified).toBe(true);
  });

  it('calls an empty reviews section what it is, a verified warning', () => {
    const ev = withRole('product', {
      ecommerce: { ...page().ecommerce, reviewWidget: true, ratingText: null },
      productScan: scan({ reviewsWidget: true, reviewsEmpty: true, reviewCount: 0 }),
    });
    const c = byId(runRules(ev).checks, 'ecommerce.socialProof');
    expect(c.status).toBe('warn');
    expect(c.evidence.verified).toBe(true);
    expect(c.detail).toMatch(/no reviews yet/);
  });

  it('makes no absence claim without a completed full-page scan', () => {
    const ev = withRole('product', {
      ecommerce: { ...page().ecommerce, reviewWidget: false, ratingText: null, shippingInfo: false, returnsInfo: false, stockText: null, paymentIcons: 0, galleryImages: 1 },
    });
    const checks = runRules(ev).checks;
    for (const id of ['ecommerce.socialProof', 'ecommerce.deliveryTerms', 'ecommerce.stock', 'ecommerce.paymentTrust', 'ecommerce.gallery']) {
      expect(byId(checks, id).status, id).toBe('na');
    }
  });

  it('counts shipping and returns found in closed accordions, and every carousel photo', () => {
    const ev = withRole('product', {
      ecommerce: { ...page().ecommerce, shippingInfo: false, returnsInfo: false, galleryImages: 1 },
      productScan: scan({ shipping: 'FREE Shipping on prepaid orders', returns: 'Easy Exchanges', images: 8, imagesSource: 'shopify' }),
    });
    const checks = runRules(ev).checks;
    expect(byId(checks, 'ecommerce.deliveryTerms').status).toBe('pass');
    expect(byId(checks, 'ecommerce.gallery').status).toBe('pass');
  });

  it('makes no absence claims on a page that is not a product page', () => {
    const ev = withRole('product', {
      ecommerce: { ...page().ecommerce, priceAboveFold: false, priceVisible: false, priceText: null, addToCartAboveFold: false, addToCartText: null, shippingInfo: false, returnsInfo: false },
      productScan: scan({ completed: false, isProductPage: false, sections: 1 }),
    });
    const checks = runRules(ev).checks;
    for (const id of ['ecommerce.price', 'ecommerce.addToCart', 'ecommerce.deliveryTerms']) expect(byId(checks, id).status, id).toBe('na');
    expect(byId(checks, 'ecommerce.productPage').detail).toMatch(/did not look like a product page/);
  });

  it('quotes only the first price of a sale price string', () => {
    const ev = withRole('product', { ecommerce: { ...page().ecommerce, priceAboveFold: false, priceVisible: true, priceText: '₹499₹64522%' } });
    expect(byId(runRules(ev).checks, 'ecommerce.price').detail).toContain('(₹499)');
  });

  it('flags missing shipping and returns information once the full scan found none', () => {
    const ev = withRole('product', {
      ecommerce: { ...page().ecommerce, shippingInfo: false, returnsInfo: false },
      productScan: scan(),
    });
    expect(byId(runRules(ev).checks, 'ecommerce.deliveryTerms').status).toBe('fail');
  });

  it('does not call shipping missing when a site-wide banner states it', () => {
    const ev = withRole('product', {
      ecommerce: { ...page().ecommerce, shippingInfo: false, shippingBanner: true, returnsInfo: false },
      productScan: scan(),
    });
    const c = byId(runRules(ev).checks, 'ecommerce.deliveryTerms');
    expect(c.status).toBe('warn');
    expect(c.detail).toMatch(/only in the site-wide banner/);
    expect(c.detail).not.toMatch(/No shipping/);
  });

  it('fails a collection grid with no prices', () => {
    const ev = withRole('collection', {
      ecommerce: { ...page().ecommerce, productTiles: 24, tilesWithPrice: 0 },
    });
    expect(byId(runRules(ev).checks, 'ecommerce.tilePrices').status).toBe('fail');
  });

  it('flags a collection page with no filters or sorting', () => {
    const ev = withRole('collection', {
      ecommerce: { ...page().ecommerce, hasFilters: false, hasSort: false },
    });
    expect(byId(runRules(ev).checks, 'ecommerce.browseTools').status).toBe('fail');
  });

  it('scopes each finding to the page it came from', () => {
    const { checks } = runRules(healthyStoreEvidence());
    expect(byId(checks, 'ecommerce.addToCart').scope).toBe('product');
    expect(byId(checks, 'ecommerce.browseTools').scope).toBe('collection');
  });

  it('skips product checks but keeps collection checks when no product was found', () => {
    const base = healthyStoreEvidence();
    const ev = {
      ...base,
      targets: base.targets.filter((t) => t.role !== 'product'),
      pages: base.pages.filter((p) => p.role !== 'product'),
    };
    const { checks } = runRules(ev);
    expect(byId(checks, 'ecommerce.productPage').status).toBe('na');
    expect(byId(checks, 'ecommerce.browseTools').status).toBe('pass');
  });
});
