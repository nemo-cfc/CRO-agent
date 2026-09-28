import 'server-only';
import { assertPublicHost } from '../../worker/src/pipeline/url.js';

export type ProductMatch = {
  title: string;
  url: string;
  image: string | null;
  price: string | null;
  available: boolean | null;
};

export type ProductSearchResult = {
  /** The store address after redirects, e.g. https://www.brand.com */
  store: string;
  /** Which lookup answered, for diagnostics. */
  source: 'shopify' | 'woocommerce' | 'search-page' | 'none';
  products: ProductMatch[];
};

const LIMIT = 6;
const TIMEOUT_MS = 4500;
const UA = 'Mozilla/5.0 (compatible; MonkeymanAudit/1.0; +https://monkeyman.agency)';

/** Gift cards, vouchers and similar are never the product to audit. */
const NOT_MERCHANDISE = /gift[-_ ]?cards?|e-?gift|gift[-_ ]?(voucher|certificate)s?/i;

/**
 * Fetch a URL on the store, following up to three redirects by hand so every
 * hop is checked against private networks (a public store must not be able
 * to redirect the server into an internal address).
 */
async function storeFetch(url: URL, signal: AbortSignal, accept: string): Promise<Response | null> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicHost(current);
    const res = await fetch(current, {
      redirect: 'manual',
      signal,
      headers: { 'user-agent': UA, accept, 'accept-language': 'en-US,en;q=0.9' },
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      if (!next) return null;
      current = new URL(next, current);
      if (!['http:', 'https:'].includes(current.protocol)) return null;
      continue;
    }
    return res.ok ? res : null;
  }
  return null;
}

const absolute = (value: string | null | undefined, base: URL): string | null => {
  if (!value) return null;
  try {
    return new URL(value.startsWith('//') ? `https:${value}` : value, base).toString();
  } catch {
    return null;
  }
};

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

function keep(products: ProductMatch[]): ProductMatch[] {
  const seen = new Set<string>();
  return products
    .filter((p) => p.title && p.url && !NOT_MERCHANDISE.test(`${p.title} ${p.url}`))
    .filter((p) => {
      const key = p.url.replace(/[?#].*$/, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, LIMIT);
}

/** Shopify's predictive search: public on every Shopify storefront. */
async function shopify(base: URL, q: string, signal: AbortSignal): Promise<ProductMatch[] | null> {
  // Fetched alongside the search; only awaited if the search answers.
  const currencyPromise = shopifyCurrency(base, signal);
  const url = new URL('/search/suggest.json', base);
  url.searchParams.set('q', q);
  url.searchParams.set('resources[type]', 'product');
  url.searchParams.set('resources[limit]', '10');
  url.searchParams.set('resources[options][unavailable_products]', 'last');
  const res = await storeFetch(url, signal, 'application/json');
  if (!res || !/json/i.test(res.headers.get('content-type') ?? '')) return null;
  const body = (await res.json().catch(() => null)) as {
    resources?: { results?: { products?: { title?: string; url?: string; image?: string; price?: string; available?: boolean; featured_image?: { url?: string } }[] } };
  } | null;
  const list = body?.resources?.results?.products;
  if (!Array.isArray(list)) return null;
  const currency = await currencyPromise;
  return list.map((p) => ({
    title: clean(p.title ?? ''),
    url: withoutSearchTags(absolute(p.url, base) ?? ''),
    image: absolute(p.image ?? p.featured_image?.url, base),
    price: formatPrice(p.price, currency),
    available: typeof p.available === 'boolean' ? p.available : null,
  }));
}

/** Shopify search adds _pos, _psq, _psid, _ss to result links; they are noise in a report. */
function withoutSearchTags(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) if (/^_(pos|psq|psid|ss|sid)$/.test(key)) u.searchParams.delete(key);
    return u.toString();
  } catch {
    return url;
  }
}

/** The store's currency from its public cart endpoint, e.g. "INR". */
async function shopifyCurrency(base: URL, signal: AbortSignal): Promise<string | null> {
  const res = await storeFetch(new URL('/cart.js', base), signal, 'application/json').catch(() => null);
  if (!res) return null;
  const body = (await res.json().catch(() => null)) as { currency?: string } | null;
  return typeof body?.currency === 'string' && /^[A-Z]{3}$/.test(body.currency) ? body.currency : null;
}

function formatPrice(value: string | undefined, currency: string | null): string | null {
  const amount = Number(value);
  if (!value || !Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat('en', { style: currency ? 'currency' : 'decimal', currency: currency ?? undefined, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
  } catch {
    return String(amount);
  }
}

/** WooCommerce Store API: public on WooCommerce stores with blocks enabled. */
async function woocommerce(base: URL, q: string, signal: AbortSignal): Promise<ProductMatch[] | null> {
  const url = new URL('/wp-json/wc/store/v1/products', base);
  url.searchParams.set('search', q);
  url.searchParams.set('per_page', '10');
  const res = await storeFetch(url, signal, 'application/json');
  if (!res || !/json/i.test(res.headers.get('content-type') ?? '')) return null;
  const list = (await res.json().catch(() => null)) as {
    name?: string; permalink?: string; is_in_stock?: boolean; images?: { src?: string }[];
    prices?: { price?: string; currency_minor_unit?: number; currency_prefix?: string; currency_suffix?: string };
  }[] | null;
  if (!Array.isArray(list)) return null;
  return list.map((p) => {
    const minor = p.prices?.currency_minor_unit ?? 2;
    const amount = p.prices?.price ? Number(p.prices.price) / 10 ** minor : null;
    return {
      title: clean((p.name ?? '').replace(/<[^>]+>/g, '')),
      url: p.permalink ?? '',
      image: p.images?.[0]?.src ?? null,
      price: amount !== null && Number.isFinite(amount) ? `${p.prices?.currency_prefix ?? ''}${amount.toLocaleString('en', { maximumFractionDigits: minor })}${p.prices?.currency_suffix ?? ''}` : null,
      available: typeof p.is_in_stock === 'boolean' ? p.is_in_stock : null,
    };
  });
}

/**
 * Any other store: read its own search results page and take links that look
 * like product pages. No prices or availability, but a title and a link.
 */
async function searchPage(base: URL, q: string, signal: AbortSignal): Promise<ProductMatch[]> {
  const url = new URL('/search', base);
  url.searchParams.set('q', q);
  url.searchParams.set('type', 'product');
  const res = await storeFetch(url, signal, 'text/html,application/xhtml+xml');
  if (!res) return [];
  const html = (await res.text()).slice(0, 600_000);
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const out: ProductMatch[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']*\/(?:products?|p|item)\/[^"'#?]+)[^"']*["'][^>]*>([\s\S]{0,600}?)<\/a>/gi)) {
    const href = absolute(m[1], base);
    if (!href || new URL(href).hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue;
    const inner = m[2] ?? '';
    const alt = inner.match(/alt=["']([^"']{3,120})["']/i)?.[1];
    const title = clean(alt || inner.replace(/<[^>]+>/g, ' ')).slice(0, 120);
    if (!title || title.length < 3) continue;
    if (words.length && !words.some((w) => title.toLowerCase().includes(w))) continue;
    const img = inner.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i)?.[1];
    out.push({ title, url: href, image: absolute(img, base), price: null, available: null });
  }
  return out;
}

export async function searchStoreProducts(storeInput: string, query: string): Promise<ProductSearchResult> {
  const base = new URL(new URL(storeInput).origin);
  const q = query.trim().slice(0, 80);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // One request to the homepage settles www-vs-apex redirects, so later
    // lookups go straight to the right host.
    const home = await storeFetch(base, controller.signal, 'text/html').catch(() => null);
    const store = home?.url ? new URL(new URL(home.url).origin) : base;

    const fromShopify = await shopify(store, q, controller.signal).catch(() => null);
    if (fromShopify) return { store: store.toString(), source: 'shopify', products: keep(fromShopify) };

    const fromWoo = await woocommerce(store, q, controller.signal).catch(() => null);
    if (fromWoo) return { store: store.toString(), source: 'woocommerce', products: keep(fromWoo) };

    const fromPage = await searchPage(store, q, controller.signal).catch(() => []);
    return { store: store.toString(), source: fromPage.length ? 'search-page' : 'none', products: keep(fromPage) };
  } finally {
    clearTimeout(timer);
  }
}
