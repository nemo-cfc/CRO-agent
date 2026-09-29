import type { Page } from 'playwright-core';

/**
 * Full product-page scan: the evidence behind every product-page finding.
 *
 * The first-screen collector only sees what is visible at load, which made
 * "missing" claims unreliable: carousels hide photos, accordions hide
 * shipping and returns, apps render late. This pass scrolls the whole page
 * (loading lazy content), screenshots every section so a reader can check the
 * report, and then reads the whole product area of the DOM, hidden content
 * included, plus the page's own structured product data. A product finding
 * that claims something is absent is only published when this scan completed
 * and found nothing (see rules/ecommerce.ts and report-policy.ts).
 */

export interface SectionShot {
  index: number;
  /** Scroll position of the top of this section, in CSS pixels. */
  y: number;
  dataUri: string;
}

export interface ProductScan {
  policy: 'scan-v1';
  /** Every section was scrolled into view and the DOM read afterwards. */
  completed: boolean;
  sections: number;
  pageHeight: number;
  elapsedMs: number;
  /** Characters of product-area text read, hidden content included. */
  textLength: number;
  price: string | null;
  priceSource: 'structured' | 'shopify' | 'text' | null;
  available: boolean | null;
  buyControl: string | null;
  images: number;
  imagesSource: 'shopify' | 'structured' | 'gallery' | null;
  video: boolean;
  shipping: string | null;
  returns: string | null;
  payment: string[];
  stock: string | null;
  reviewsWidget: boolean;
  reviewCount: number | null;
  rating: number | null;
  /** The review area explicitly says there are no reviews yet. */
  reviewsEmpty: boolean;
  /** Structured product data, a Shopify product record, a buy control or a price was found. */
  isProductPage: boolean;
}

const MAX_SECTIONS = 12;

export async function scanProductPage(
  page: Page,
  signal: AbortSignal,
  budgetMs = 5000,
): Promise<{ scan: ProductScan; sections: SectionShot[] }> {
  const started = Date.now();
  const sections: SectionShot[] = [];
  let completed = true;

  // Hide large overlays (pop-ups, consent) so each section shows the page.
  await page
    .evaluate(() => {
      const vw = innerWidth;
      const vh = innerHeight;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
        const s = getComputedStyle(el);
        if (s.position !== 'fixed' || s.display === 'none') continue;
        const r = el.getBoundingClientRect();
        const cover = (Math.max(0, r.width) * Math.max(0, r.height)) / (vw * vh);
        const named = /cookie|consent|onetrust|gdpr|modal|popup|overlay|dialog|newsletter|klaviyo|kl-private|privy|attentive|justuno|omnisend|wisepops/i.test(`${el.id} ${el.className?.toString() ?? ''}`);
        if (cover > 0.3 || (named && cover > 0.05)) {
          el.setAttribute('data-cro-scan-hidden', el.style.getPropertyValue('opacity'));
          el.style.setProperty('opacity', '0', 'important');
        }
      }
    })
    .catch(() => {});

  const geometry = await page
    .evaluate(() => ({ height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0), vh: innerHeight }))
    .catch(() => ({ height: 0, vh: 800 }));
  const step = Math.max(200, Math.floor(geometry.vh * 0.9));
  // The footer is site-wide; the product story ends well before it.
  const stops: number[] = [];
  for (let y = 0; y < geometry.height - geometry.vh * 0.5 && stops.length < MAX_SECTIONS; y += step) stops.push(y);
  if (stops.length === 0) stops.push(0);

  for (const [index, y] of stops.entries()) {
    if (signal.aborted || Date.now() - started > budgetMs) {
      completed = false;
      break;
    }
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' as ScrollBehavior }), y).catch(() => {});
    // Give lazy images and late apps (reviews, delivery estimates) a moment.
    await page.waitForTimeout(220);
    const buf = await page.screenshot({ type: 'jpeg', quality: 50, scale: 'css' }).catch(() => null);
    if (buf) sections.push({ index, y, dataUri: `data:image/jpeg;base64,${buf.toString('base64')}` });
  }

  await page
    .evaluate(() => {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-cro-scan-hidden]'))) {
        const prev = el.getAttribute('data-cro-scan-hidden') ?? '';
        if (prev) el.style.setProperty('opacity', prev);
        else el.style.removeProperty('opacity');
        el.removeAttribute('data-cro-scan-hidden');
      }
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    })
    .catch(() => {});

  const dom = await page.evaluate(readProductDom).catch(() => null);
  const scan: ProductScan = {
    policy: 'scan-v1',
    // Absence claims need a real product page seen in more than one screen.
    completed: completed && !!dom && dom.isProductPage && sections.length >= 2,
    sections: sections.length,
    pageHeight: geometry.height,
    elapsedMs: Date.now() - started,
    ...(dom ?? emptyDom()),
  };
  return { scan, sections };
}

function emptyDom(): Omit<ProductScan, 'policy' | 'completed' | 'sections' | 'pageHeight' | 'elapsedMs'> {
  return {
    textLength: 0, price: null, priceSource: null, available: null, buyControl: null, images: 0, imagesSource: null,
    video: false, shipping: null, returns: null, payment: [], stock: null, reviewsWidget: false, reviewCount: null,
    rating: null, reviewsEmpty: false, isProductPage: false,
  };
}

/**
 * Runs in the page. Self-contained: no references to module scope.
 */
async function readProductDom(): Promise<Omit<ProductScan, 'policy' | 'completed' | 'sections' | 'pageHeight' | 'elapsedMs'>> {
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

  // ---- the product area: main content minus site chrome and drawers ----
  const root = (document.querySelector('main') as HTMLElement | null) ?? document.body;
  const CHROME = 'script, style, noscript, template, svg, footer, [role="contentinfo"], body > header, [role="banner"], nav, [role="navigation"], [class*="cart-drawer" i], cart-drawer, [id*="CartDrawer"], [class*="mini-cart" i], [class*="menu-drawer" i], [class*="mega-menu" i], [class*="predictive-search" i], [class*="announcement" i], [id*="announcement" i]';
  const parts: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = (n as Text).parentElement;
    if (!parent || parent.closest(CHROME)) continue;
    const t = n.textContent;
    if (t && t.trim()) parts.push(t);
  }
  // Icon badges ("Free shipping", "COD available") often carry their words only here.
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('img[alt], [aria-label], [title]'))) {
    if (el.closest(CHROME)) continue;
    const t = el.getAttribute('alt') || el.getAttribute('aria-label') || el.getAttribute('title');
    if (t && t.trim().length > 2) parts.push(t);
  }
  const text = clean(parts.join(' \n '));

  // The matched phrase, extended to the end of its sentence or line and cut
  // at a word boundary, so a quote in the report reads naturally.
  const first = (re: RegExp, extend = true) => {
    const m = re.exec(text);
    if (!m) return null;
    const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 60);
    const tail = extend ? rest.split(/[.\n|•·]/)[0] ?? '' : '';
    let phrase = clean(m[0] + tail);
    if (phrase.length > 70) phrase = phrase.slice(0, 70).replace(/\s+\S*$/, '');
    return phrase;
  };

  // ---- structured product data (JSON-LD) ----
  let ldProduct = false;
  let ldPrice: string | null = null;
  let ldAvailable: boolean | null = null;
  let ldImages = 0;
  let ldRating: number | null = null;
  let ldReviews: number | null = null;
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const o = node as Record<string, unknown>;
    if (Array.isArray(o['@graph'])) (o['@graph'] as unknown[]).forEach(visit);
    const type = o['@type'];
    const types = Array.isArray(type) ? type : [type];
    if (!types.some((t) => t === 'Product' || t === 'ProductGroup')) return;
    ldProduct = true;
    const offers = ([] as unknown[]).concat(o.offers ?? [], ...(Array.isArray(o.hasVariant) ? (o.hasVariant as Record<string, unknown>[]).map((v) => v.offers ?? []) : []));
    for (const off of offers.flat()) {
      if (!off || typeof off !== 'object') continue;
      const of = off as Record<string, unknown>;
      const p = of.price ?? of.lowPrice;
      if (ldPrice === null && (typeof p === 'string' || typeof p === 'number')) ldPrice = `${of.priceCurrency ?? ''} ${p}`.trim();
      if (typeof of.availability === 'string') ldAvailable = ldAvailable === true || /InStock|LimitedAvailability|PreOrder/i.test(of.availability);
    }
    const img = o.image;
    ldImages = Math.max(ldImages, Array.isArray(img) ? img.length : img ? 1 : 0);
    const agg = o.aggregateRating as Record<string, unknown> | undefined;
    if (agg) {
      const rv = Number(agg.ratingValue);
      const rc = Number(agg.reviewCount ?? agg.ratingCount);
      if (Number.isFinite(rv) && rv > 0) ldRating = rv;
      if (Number.isFinite(rc)) ldReviews = rc;
    }
  };
  for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try { visit(JSON.parse(s.textContent || 'null')); } catch { /* malformed JSON-LD */ }
  }

  // ---- Shopify's own product record: images, price, availability ----
  let shopRecord = false;
  let shopImages = 0;
  let shopPrice: string | null = null;
  let shopAvailable: boolean | null = null;
  let shopVideo = false;
  const handle = location.pathname.match(/\/products\/([^/?#]+)/)?.[1];
  if (handle) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch(`/products/${handle}.js`, { signal: ctrl.signal, headers: { accept: 'application/json' } });
      clearTimeout(timer);
      if (res.ok && /json/i.test(res.headers.get('content-type') ?? '')) {
        const p = (await res.json()) as { images?: unknown[]; price?: number; available?: boolean; media?: { media_type?: string }[]; gift_card?: boolean };
        shopRecord = true;
        shopImages = Array.isArray(p.images) ? p.images.length : 0;
        if (typeof p.price === 'number') shopPrice = (p.price / 100).toString();
        if (typeof p.available === 'boolean') shopAvailable = p.available;
        shopVideo = Array.isArray(p.media) && p.media.some((m) => m.media_type === 'video' || m.media_type === 'external_video');
      }
    } catch { /* not Shopify, or blocked */ }
  }

  // ---- gallery images on the page, hidden slides included ----
  const GALLERY = '[class*="gallery" i], [class*="product__media" i], [class*="product-media" i], [class*="product-images" i], [class*="product-image" i], media-gallery, [class*="slider" i], [class*="carousel" i], [class*="swiper" i], [class*="thumbnails" i]';
  const baseOf = (src: string) => {
    try {
      const u = new URL(src, location.href);
      return (u.pathname.split('/').pop() ?? '').replace(/_(\d+x\d*|\d*x\d+|small|medium|large|grande|compact|master)(?=\.)/i, '').replace(/\.(webp|jpe?g|png|avif)$/i, '').toLowerCase();
    } catch { return ''; }
  };
  const galleryBases = new Set<string>();
  for (const box of Array.from(root.querySelectorAll(GALLERY))) {
    if ((box as HTMLElement).closest(CHROME)) continue;
    // The product's own gallery sits at the top; carousels further down are
    // other products ("you may also like", recently viewed).
    if ((box as HTMLElement).getBoundingClientRect().top + scrollY > innerHeight * 1.2) continue;
    // Recommendation carousels further down are other products, not this one.
    if ((box as HTMLElement).closest('[class*="recommend" i], [class*="related" i], [class*="upsell" i], [class*="you-may" i], [id*="recommend" i]')) continue;
    for (const img of Array.from(box.querySelectorAll('img'))) {
      const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('srcset')?.split(/[ ,]/)[0] || '';
      const w = Number(img.getAttribute('width') || 0);
      if (!src || (w && w < 60)) continue;
      const b = baseOf(src);
      if (b) galleryBases.add(b);
    }
  }

  // ---- buy control anywhere in the product area ----
  const BUY = /add to (cart|bag|basket)|buy (it )?now|pre-?order|purchase|add to my/i;
  let buyControl: string | null = null;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('button, input[type="submit"], a[role="button"], [role="button"], form[action*="/cart/add"] [type="submit"]'))) {
    if (el.closest(CHROME)) continue;
    const label = clean(el.textContent || (el as HTMLInputElement).value || el.getAttribute('aria-label') || '');
    if (BUY.test(label) && label.length < 60) { buyControl = label; break; }
  }
  if (!buyControl && root.querySelector('form[action*="/cart/add"]')) buyControl = 'Add to cart form';

  // ---- price in the product area text ----
  const priceText = first(/(?:[$£€¥₹]|\bRs\.?|\bUSD|\bEUR|\bGBP|\bINR|\bAED|\bAUD|\bCAD)\s?\d[\d.,]*/);

  // ---- reviews ----
  const REVIEW_SELECTOR = '[class*="review" i], [class*="rating" i], [id*="judgeme" i], [class*="jdgm" i], [class*="yotpo" i], [class*="stamped" i], [class*="okendo" i], [class*="loox" i], [class*="junip" i], [data-reviews]';
  const reviewsWidget = !!root.querySelector(REVIEW_SELECTOR);
  const reviewsEmpty = /\b(be the first to (write a )?review|no reviews yet|there are no reviews|write the first review|0 reviews)\b/i.test(text);
  const countMatch = text.match(/\b(\d[\d,]*)\s+(reviews?|ratings?)\b/i);
  const reviewCount = ldReviews ?? (countMatch?.[1] ? Number(countMatch[1].replace(/,/g, '')) : reviewsEmpty ? 0 : null);
  const ratingMatch = text.match(/\b([1-5](?:\.\d)?)\s*(?:out of\s*5|\/\s*5|stars?)\b/i);
  const rating = ldRating ?? (ratingMatch ? Number(ratingMatch[1]) : null);

  const PAYMENT = /\b(cash on delivery|cod available|\bcod\b|upi|rupay|paytm|phonepe|gpay|google pay|apple pay|shop pay|paypal|klarna|afterpay|clearpay|affirm|sezzle|zip pay|simpl|lazypay|emi|pay later|pay in \d|visa|mastercard|amex|american express|razorpay|gokwik)\b/gi;
  const payment = Array.from(new Set((text.match(PAYMENT) ?? []).map((p) => p.toLowerCase()))).slice(0, 8);
  const hasPaymentMarks = !!root.querySelector('shopify-payment-terms, shop-pay-installments-banner, klarna-placement, afterpay-placement, [class*="payment-terms" i], [class*="installment" i]');
  if (hasPaymentMarks && !payment.length) payment.push('instalment messaging');
  // Express checkout buttons (Shop Pay, PayPal, Google Pay, Apple Pay) are
  // payment options on the page even though their labels live in shadow DOM
  // or iframes and often render after load. SKIMS showed a PayPal button that
  // text matching alone missed.
  const express = root.querySelector('shopify-accelerated-checkout, .shopify-payment-button, [data-shopify="payment-button"], shop-pay-wallet-button, [class*="paypal" i], iframe[src*="paypal"], [class*="gpay" i], [class*="apple-pay" i], [class*="additional-checkout" i]');
  if (express && !payment.some((p) => /pay|paypal/.test(p))) payment.push('express checkout (Shop Pay / PayPal / wallets)');

  // The store's own product record is authoritative; the page's gallery is
  // the fallback when there is no such record.
  const images = shopImages > 0 ? shopImages : ldImages > 1 ? ldImages : Math.max(ldImages, galleryBases.size);
  return {
    // A product page shows at least one sign of being one. A redirect to a
    // "we have moved" notice or a blocked page has none, and must never be
    // read as a product page with everything missing.
    isProductPage: ldProduct || shopRecord || !!buyControl || !!priceText,
    textLength: text.length,
    price: ldPrice ?? (shopPrice ? `${shopPrice}` : null) ?? priceText,
    priceSource: ldPrice ? 'structured' : shopPrice ? 'shopify' : priceText ? 'text' : null,
    available: shopAvailable ?? ldAvailable,
    buyControl,
    images,
    imagesSource: images === 0 ? null : images === shopImages ? 'shopify' : images === ldImages ? 'structured' : 'gallery',
    video: shopVideo || !!root.querySelector('video, iframe[src*="youtube"], iframe[src*="vimeo"], deferred-media'),
    shipping: first(/\b(free (?:[a-z.]+ ){0,2}(?:shipping|delivery)[^.\n]{0,40}|ships? (?:by|in|within|today|free)[^.\n]{0,30}|(?:estimated )?delivery (?:by|in|within|date|time)[^.\n]{0,30}|dispatch(?:es|ed)? (?:in|within|by)[^.\n]{0,30}|shipping (?:&|and) returns?|shipping (?:info|information|policy|details|times?|rates?))/i),
    returns: first(/\b(free returns?|easy (?:returns?|exchanges?)|returns? (?:policy|&|and|within|accepted|are free)[^.\n]{0,30}|(?:\d+)[- ]days? (?:free )?(?:returns?|exchanges?)|exchanges? (?:within|accepted|available)|return policy|money[- ]back|refund policy|shipping (?:&|and) returns?)/i),
    payment,
    stock: first(/\b(in stock|out of stock|sold out|only \d+ (?:left|remaining)|low stock|few left|back ?order|pre-?order|ships? (?:by|in|within|today)[^.\n]{0,20}|ready to ship)/i, false),
    reviewsWidget,
    reviewCount,
    rating,
    reviewsEmpty,
  };
}
