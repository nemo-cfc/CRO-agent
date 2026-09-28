/**
 * Understands what a visitor pasted into the audit form: a product page, a
 * homepage or some other page on their store, written with or without
 * "https://", "http://" or "www.".
 */

export type StoreLink =
  | { kind: 'product'; url: URL; store: URL }
  | { kind: 'home'; url: URL; store: URL }
  | { kind: 'page'; url: URL; store: URL };

export type StoreLinkError = { error: string };

/** Marketplaces and social sites: not the visitor's own store. */
const NOT_A_STORE = /(^|\.)(amazon\.[a-z.]+|amzn\.(to|in|eu)|flipkart\.com|myntra\.com|ajio\.com|nykaa\.com|meesho\.com|etsy\.com|ebay\.[a-z.]+|walmart\.com|instagram\.com|facebook\.com|fb\.com|tiktok\.com|pinterest\.[a-z.]+|youtube\.com|youtu\.be|linktr\.ee|google\.[a-z.]+|bit\.ly)$/i;

/** Product-page URL shapes across Shopify, WooCommerce, BigCommerce, Magento and custom stores. */
const PRODUCT_PATH = [
  /\/products\/[^/]+\/?$/i,
  /\/product\/[^/]+\/?$/i,
  /\/(p|item|items|dp)\/[^/]+/i,
  /\/[^/]+\.html$/i,
];

/** Pages that look like products but are not merchandise. */
const NOT_MERCHANDISE = /gift[-_]?cards?|e-?gift|gift[-_]?(voucher|certificate)s?/i;

const TRACKING = /^(utm_|fbclid$|gclid$|gbraid$|wbraid$|msclkid$|mc_|_ga$|_gl$|ref$|srsltid$)/i;

/** "yourbrand.com" or "shop.yourbrand.com", without "www." — for display. */
export function displayHost(url: URL): string {
  return url.hostname.replace(/^www\./i, '');
}

/** "yourbrand.com/products/tee" — for display. */
export function displayLink(url: URL): string {
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
  return displayHost(url) + path;
}

/** Same store, ignoring "www." and letter case. */
export function sameStore(a: URL, b: URL): boolean {
  return displayHost(a).toLowerCase() === displayHost(b).toLowerCase();
}

export function parseStoreLink(raw: string): StoreLink | StoreLinkError {
  let value = raw.trim().replace(/^["'<\s]+|["'>\s]+$/g, '');
  if (!value) return { error: 'Paste a link, for example yourbrand.com/products/best-seller' };
  if (/\s/.test(value)) return { error: 'That doesn’t look like a link. Copy it straight from your browser’s address bar.' };
  if (!/^https?:\/\//i.test(value)) value = 'https://' + value.replace(/^\/+/, '');

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { error: 'That doesn’t look like a link. Try something like yourbrand.com/products/best-seller' };
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !/\.[a-z]{2,}$/i.test(url.hostname)) {
    return { error: 'Enter your store’s web address, for example yourbrand.com' };
  }
  if (NOT_A_STORE.test(url.hostname)) {
    return { error: 'Please use a link from your own store, not a marketplace or social page.' };
  }

  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);

  const store = new URL(url.origin);
  const path = url.pathname;
  if (path === '/' || path === '') return { kind: 'home', url: store, store };
  if (PRODUCT_PATH.some((re) => re.test(path)) && !NOT_MERCHANDISE.test(path)) return { kind: 'product', url, store };
  return { kind: 'page', url, store };
}
