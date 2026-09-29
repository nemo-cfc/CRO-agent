import type { Platform } from '@cro/shared';

/**
 * Platform fingerprints.
 *
 * Every marker here is deliberately specific. An early version of this used
 * `mage/` for Magento and matched every Shopify store on the web, because
 * `mage/` is a substring of `image/`. Markers must be anchored to something
 * that cannot appear incidentally: a vendor hostname, a namespaced class, a
 * query parameter.
 */
const FINGERPRINTS: { platform: Platform; markers: RegExp[] }[] = [
  {
    platform: 'shopify',
    markers: [
      /cdn\.shopify\.com/i,
      /\/cdn\/shop\//i,
      /Shopify\.theme/,
      /\.myshopify\.com/i,
      /shopify-section/i,
    ],
  },
  {
    platform: 'woocommerce',
    markers: [
      /wp-content\/plugins\/woocommerce/i,
      /\bwoocommerce-page\b/i,
      /\bwc-add-to-cart\b/i,
      /\?wc-ajax=/i,
      /\bwoocommerce-product\b/i,
    ],
  },
  {
    platform: 'magento',
    // `Magento_` is the module namespace (Magento_Catalog, Magento_Theme) and
    // is case-sensitive; `mage-init` is the JS bootstrap attribute. Neither
    // occurs by accident. Plain `mage/` is NOT usable — see the note above.
    markers: [/Magento_[A-Z]/, /mage-init/, /\/static\/version\d+\//, /data-mage-init/],
  },
  {
    platform: 'bigcommerce',
    markers: [/cdn\d*\.bigcommerce\.com/i, /bigcommerce\.com\/s-/i, /\bstencil-utils\b/i],
  },
  {
    platform: 'wordpress',
    markers: [/wp-content\//i, /wp-includes\//i, /\/wp-json\//i],
  },
];

/**
 * Header-based signals, which are harder for a theme to fake than markup.
 * Checked first because they are the strongest evidence available.
 */
const HEADER_HINTS: { platform: Platform; header: string }[] = [
  { platform: 'shopify', header: 'x-shopid' },
  { platform: 'shopify', header: 'x-shopify-stage' },
  { platform: 'magento', header: 'x-magento-cache-debug' },
  { platform: 'bigcommerce', header: 'x-bc-storefront' },
];

export function detectPlatform(html: string, headers?: Headers): Platform {
  if (headers) {
    for (const hint of HEADER_HINTS) {
      if (headers.get(hint.header) !== null) return hint.platform;
    }
  }

  // Only the head and the first slice of body are scanned: asset URLs and
  // bootstrap scripts live there, and it keeps this cheap on 1MB documents.
  const sample = html.slice(0, 250_000);

  // Ordered most-specific first — WooCommerce and Magento sites are also
  // WordPress/PHP sites, so the generic CMS match must lose.
  for (const fp of FINGERPRINTS) {
    const hits = fp.markers.filter((m) => m.test(sample)).length;
    if (hits > 0) return fp.platform;
  }
  // No known platform, but it may still be a store. Two independent signals
  // are required so a blog linking to a shop is not mistaken for one.
  const signals = [
    /href="[^"]*\/(cart|bag|basket)\/?["?#]/i,
    /add to (cart|bag|basket)/i,
    /"@type"\s*:\s*"(Product|Offer|AggregateOffer)"/i,
    /href="[^"]*\/(products?|collections?)\/[^"]+"/i,
    // Built-in mini-cart markup (Bellroy ships "MiniCart_Cart_SubTotal").
    /class="[^"]*(mini-?cart|cart-?drawer|cart_subtotal|cart__subtotal|MiniCart)/i,
  ].filter((re) => re.test(sample)).length;
  if (signals >= 2) return 'store';
  return 'other';
}

/* ------------------------------------------------------------------ *
 * Where collections and products live, per platform
 * ------------------------------------------------------------------ */

export interface UrlPatterns {
  collection: RegExp[];
  product: RegExp[];
}

const PATTERNS: Record<Platform, UrlPatterns> = {
  shopify: {
    collection: [/\/collections\/[^/]+$/i],
    product: [/\/products\/[^/]+$/i],
  },
  woocommerce: {
    collection: [/\/product-category\/[^?]+/i, /\/shop\/?$/i, /\?product_cat=/i],
    product: [/\/product\/[^/?]+\/?$/i, /\?p=\d+&post_type=product/i],
  },
  magento: {
    // Magento category and product URLs are merchant-configurable and often
    // both end in .html, so there is no reliable path shape. These catch the
    // default routes; otherwise the schema.org fallback below does the work.
    collection: [/\/catalog\/category\/view\//i],
    product: [/\/catalog\/product\/view\//i],
  },
  bigcommerce: {
    collection: [/\/categories\//i],
    product: [/\/products\//i],
  },
  // Custom storefronts: common path shapes. /products/category/x is a
  // category, not a product, so product paths must be a single segment.
  store: {
    collection: [/\/(collections?|categor(y|ies)|shop|c)\/[^?#]+/i],
    product: [/\/(products?|p|item|items)\/[^/?#]+\/?$/i, /\/[^/]+\.html$/i],
  },
  wordpress: { collection: [], product: [] },
  other: { collection: [], product: [] },
};

/** Paths that match a product pattern but are never a product page. */
// Gift cards and other non-merchandise are matched anywhere in the path:
// "/products/the-reistor-gift-card" and "/products/rise-ai-giftcard" were
// both audited as a store's "product page".
const NOT_A_PRODUCT =
  /\/(cart|checkout|account|login|register|search|wishlist|compare)\b|gift[-_]?cards?|e-?gift|gift[-_]?(voucher|certificate)s?|\/products\/[^/]*\b(sample|swatch|warranty|insurance|shipping-protection|route-protection|donation)s?\b/i;

/** Collections that exist but tell you nothing about merchandising. */
const WEAK_COLLECTION = /\/collections\/(all|frontpage)\/?$/i;

export interface PageCandidates {
  collection: string | null;
  product: string | null;
}

/**
 * Pick one collection and one product URL out of the homepage link graph.
 *
 * Both stores tested link collections and products directly from the
 * homepage, so this usually resolves without another request. When a product
 * link is absent (common on stores whose homepage only merchandises
 * categories), the caller can fall back to fetching the collection page.
 */
export function findStorePages(
  platform: Platform,
  links: { href: string; text: string }[],
): PageCandidates {
  const patterns = PATTERNS[platform];

  const matches = (href: string, res: RegExp[]) => {
    let path: string;
    try {
      const u = new URL(href);
      path = u.pathname + u.search;
    } catch {
      return false;
    }
    return res.some((r) => r.test(path));
  };

  const collections = links.filter(
    (l) => matches(l.href, patterns.collection) && !WEAK_COLLECTION.test(l.href),
  );
  const products = links.filter(
    (l) => matches(l.href, patterns.product) && !NOT_A_PRODUCT.test(l.href),
  );

  // Prefer a collection whose anchor text reads like merchandising ("Best
  // sellers", "New in") over a footer utility link — those are the pages a
  // store actually drives traffic to.
  const merch = /best|top|new|popular|featured|shop|sale|trending|arrival/i;
  const collection =
    collections.find((c) => merch.test(c.text) || merch.test(c.href))?.href ??
    collections[0]?.href ??
    null;

  return { collection: collection ?? null, product: products[0]?.href ?? null };
}

/**
 * Last resort for stores that do not link products from the homepage, and for
 * Magento, where URL shape is unreliable. Looks for a product URL in the
 * collection page's markup, preferring anything the page itself marks up as a
 * Product via schema.org.
 */
/**
 * First product URL listed in a sitemap. Used when a store renders its
 * collection grid client-side, so neither the homepage nor the collection
 * HTML links a product (Bellroy).
 */
export function findProductInSitemap(platform: Platform, xml: string): string | null {
  const patterns = PATTERNS[platform].product;
  if (patterns.length === 0) return null;
  for (const m of xml.slice(0, 500_000).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    try {
      const u = new URL(m[1]!);
      if (!NOT_A_PRODUCT.test(u.pathname) && patterns.some((p) => p.test(u.pathname))) return u.toString();
    } catch { /* not a URL */ }
  }
  return null;
}

export function findProductInHtml(
  platform: Platform,
  html: string,
  baseUrl: string,
): string | null {
  const sample = html.slice(0, 400_000);

  // schema.org is platform-independent and states intent directly.
  const ldMatch = sample.match(/"@type"\s*:\s*"Product"[\s\S]{0,600}?"url"\s*:\s*"([^"]+)"/);
  if (ldMatch?.[1]) {
    try {
      return new URL(ldMatch[1], baseUrl).toString();
    } catch {
      /* fall through to pattern matching */
    }
  }

  const patterns = PATTERNS[platform].product;
  if (patterns.length === 0) return null;

  for (const m of sample.matchAll(/href=["']([^"']+)["']/gi)) {
    const raw = m[1];
    if (!raw) continue;
    let u: URL;
    try {
      u = new URL(raw, baseUrl);
    } catch {
      continue;
    }
    if (NOT_A_PRODUCT.test(u.pathname)) continue;
    if (patterns.some((p) => p.test(u.pathname + u.search))) {
      u.hash = '';
      return u.toString();
    }
  }
  return null;
}
