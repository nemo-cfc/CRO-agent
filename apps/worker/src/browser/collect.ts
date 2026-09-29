import { recheckProduct } from './product-verification.js';
import { scanProductPage } from './product-scan.js';
import { collectDuplicateScripts } from './duplicate-scripts.js';
import { parseEventReceipt, repeatedEvents, type EventReceipt } from './duplicate-events.js';
import { collectVisualObservations, stableVisualObservations } from './visual.js';
import { detectTracking, mergeTracking } from './tracking.js';
import type { PageEvidence, PageRole, Viewport } from '@cro/shared';
import { config } from '../config.js';
import { pool } from './pool.js';
import { PERF_INIT_SCRIPT } from './init-script.js';
import { collectFn, type CollectResult } from './collect-fn.js';
import { captureElementShots } from './element-shots.js';
import { probeCart } from './cart-probe.js';

const EMPTY: CollectResult = {
  ctas: [],
  ctasAboveFold: 0,
  form: null,
  formCount: 0,
  perf: {
    fcp: null, blockingTime: null, lcp: null, cls: null, ttfb: null, domContentLoaded: null,
    longTasks: 0, longTaskMs: 0, resourceCount: 0,
    imageBytes: 0, scriptBytes: 0, totalBytes: 0,
    imagesMissingDimensions: 0, imagesWithoutAlt: 0, renderBlockingResources: 0,
  },
  trust: {
    testimonialBlocks: 0, reviewSchema: false, logoStrip: false, badgeImages: 0,
    hasPrivacyLink: false, hasTermsLink: false, hasContactLink: false,
    hasAboutLink: false, hasPhone: false, hasEmail: false, hasSocialLinks: false,
  },
  mobile: {
    horizontalOverflow: false, overflowPx: 0, smallTextNodes: 0,
    tinyTapTargets: 0, crowdedTapTargets: 0, stickyCta: false,
  },
  friction: {
    blockingOverlays: 0, largestOverlayCoverage: 0, openDialogs: 0,
    cookieBanner: false, cookieCoverage: 0, overlays: [], chatWidget: false, widgetObscuresCta: false,
  },
  tracking: {
    ga4: false, gtm: false, metaPixel: false, clarity: false, hotjar: false,
    hubspot: false, segment: false, plausible: false, other: [],
  },
  copy: {
    h1: null, h1Count: 0, h2Count: 0, heroCopy: null, wordCount: 0,
    readingEase: null, avgSentenceWords: null, benefitHits: 0,
    featureHits: 0, jargonHits: 0, headlineHasNumber: false,
  },
  ecommerce: {
    priceVisible: false, priceAboveFold: false, priceText: null,
    addToCartText: null, addToCartAboveFold: false, stickyBuyBar: false, structuredRating: null,
    addToCartWidth: 0, addToCartHeight: 0,
    variantGroups: 0, stockText: null, galleryImages: 0,
    reviewWidget: false, ratingText: null,
    shippingInfo: false, shippingBanner: false, returnsInfo: false, paymentIcons: 0,
    productTiles: 0, tilesWithPrice: 0, hasFilters: false, hasSort: false,
    cartLink: false, searchBox: false,
  },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CollectOptions {
  url: string;
  role: PageRole;
  viewport: Viewport;
  signal: AbortSignal;
  /** Above-fold JPEG for the report UI. Never sent to the model. */
  screenshot?: boolean;
  /** Only run the add-to-bag test on this page (see run.ts). */
  probeOnly?: boolean;
}

/**
 * Load one page at one viewport and return everything the rule engine needs.
 *
 * Navigation waits on `domcontentloaded`, never `networkidle` — chat widgets
 * and polling scripts mean networkidle frequently never fires at all, and on
 * the sites where it does it costs 3-10s we do not have.
 */
export async function collectPage(opts: CollectOptions): Promise<PageEvidence> {
  const { url, role, viewport, signal } = opts;
  const started = Date.now();

  const base: PageEvidence = {
    url,
    finalUrl: url,
    role,
    viewport,
    ok: false,
    error: null,
    timing: { navMs: 0, collectMs: 0 },
    ...EMPTY,
    screenshot: null,
  };

  if (signal.aborted) return { ...base, error: 'deadline exceeded before start' };

  const ctx = await pool.acquire(viewport);
  let navMs = 0;

  try {
    await ctx.addInitScript(PERF_INIT_SCRIPT);
    const requestSignals = new Set<string>();
    // Context events include iframe and worker requests that top-level globals miss.
    ctx.on('request', (request) => {
      if (requestSignals.size < 5000) requestSignals.add(request.url());
    });
    const page = await ctx.newPage();
    let navigation = 0;
    const eventReceipts: EventReceipt[] = [];
    const requestNavigation = new WeakMap<object, number>();
    page.on('framenavigated', frame => { if(frame === page.mainFrame()) navigation++; });
    page.on('request', request => requestNavigation.set(request, navigation));
    page.on('response', response => {
      if(eventReceipts.length >= 200 || response.status()<200 || response.status()>=300 || response.fromServiceWorker())return;
      const request=response.request();
      try {
        if(request.frame() !== page.mainFrame() || request.redirectedFrom())return;
        const event=parseEventReceipt(request.url(),request.postData(),request.timing().startTime,requestNavigation.get(request)??navigation);
        if(event)eventReceipts.push(event);
      } catch { /* Requests without a frame are not comparable. */ }
    });

    // Silence page errors — a broken third-party script is the target site's
    // problem, not a reason to fail the audit.
    page.on('pageerror', () => {});
    page.on('crash', () => {});

    const navStart = Date.now();
    let response: Awaited<ReturnType<typeof page.goto>> = null;
    let navTimedOut = false;

    try {
      response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: config.navTimeoutMs,
      });
    } catch (err) {
      // A `domcontentloaded` timeout does not mean there is nothing to audit.
      // Heavy commerce pages routinely sit at readyState "interactive" with a
      // complete DOM — headline, images, buttons all present — while a slow
      // third-party script keeps the event from firing. Throwing away a fully
      // rendered page because of that produces a report with nothing in it,
      // which is strictly worse than a report marked partial.
      const message = err instanceof Error ? err.message : String(err);
      if (!/timeout/i.test(message)) throw err;
      navTimedOut = true;
    }
    navMs = Date.now() - navStart;

    // Bounded settle: give late-rendering frameworks a chance, but cap it.
    // After a nav timeout the page is already as settled as it is going to
    // get, so take a short beat rather than the full window.
    await Promise.race([
      page.waitForLoadState('load').catch(() => {}),
      sleep(navTimedOut ? 400 : config.settleMs),
    ]);
    // Allow asynchronous tags a bounded observation window after load.
    await sleep(navTimedOut ? 150 : Math.max(150, Math.min(config.settleMs, 1500) - (Date.now() - navStart - navMs)));

    if (signal.aborted) {
      return { ...base, timing: { navMs, collectMs: 0 }, error: 'deadline exceeded during load' };
    }

    // Probe-only load: its own session in parallel with the measured product
    // page, so the add-to-bag test is not on the critical path. The page is
    // modified by the test, so nothing else is measured on it.
    if (opts.probeOnly) {
      const { probe, shot } = await probeCart(page, signal);
      await page.close().catch(() => {});
      return {
        ...base,
        ok: true,
        timing: { navMs, collectMs: 0 },
        cartProbe: probe,
        elementShots: shot ? [{ key: 'bag', dataUri: shot }] : [],
      };
    }

    // Collection grids are often rendered client-side after load; reading at
    // the usual moment reported "no product tiles" on grids of 40+ products.
    if (role === 'collection' && !signal.aborted) {
      await page
        .waitForFunction(() => document.querySelectorAll('main a[href*="/product"], a[href*="/products/"]').length >= 8, undefined, { timeout: 2500 })
        .catch(() => {});
    }

    // Sign-up pop-ups (Klaviyo, Privy...) are commonly timed to open 2-5s
    // after load, which is after the homepage is usually read, so the finding
    // came and went between runs. Give the homepage a bounded window for one.
    const popupWindow = role === 'home' && !navTimedOut ? 3500 : 0;
    if (popupWindow > 0 && !signal.aborted) {
      await page
        .waitForFunction(() => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          return Array.from(document.querySelectorAll<HTMLElement>('body *')).some((el) => {
            const s = getComputedStyle(el);
            if (s.position !== 'fixed' || s.display === 'none' || s.visibility === 'hidden') return false;
            const r = el.getBoundingClientRect();
            if ((Math.max(0, r.width) * Math.max(0, r.height)) / (vw * vh) < 0.3) return false;
            // A visible dialog-like layer, not an empty closed drawer.
            return el.innerText.trim().length > 0 && /dialog|modal|popup|newsletter|klaviyo|kl-private|privy|attentive|justuno|omnisend|wisepops/i
              .test(`${el.id} ${el.className?.toString() ?? ''} ${el.getAttribute('role') ?? ''} ${el.innerHTML.slice(0, 400)}`);
          });
        }, undefined, { timeout: popupWindow, polling: 200 })
        // It just appeared: let its fade-in finish before it is measured.
        .then(() => sleep(600), () => {});
    }

    const collectStart = Date.now();
    const data = (await page.evaluate(collectFn)) as CollectResult;
    const frameSignals = await Promise.all(page.frames().map((frame) => frame.evaluate(() =>
      Array.from(document.querySelectorAll('script, iframe, img')).map((el) =>
        [el.getAttribute('src'), el.getAttribute('data-src'), el.tagName === 'SCRIPT' ? el.textContent : ''].filter(Boolean).join(' ')
      ).join('\n')
    ).catch(() => '')));
    data.tracking = mergeTracking(data.tracking, detectTracking([...requestSignals, ...frameSignals].join('\n')));
    const firstScripts = await page.evaluate(collectDuplicateScripts).catch(() => []);
    const firstVisual = await page.evaluate(collectVisualObservations).catch(() => []);
    await sleep(200);
    const secondVisual = signal.aborted ? [] : await page.evaluate(collectVisualObservations).catch(() => []);
    const secondScripts = signal.aborted ? [] : await page.evaluate(collectDuplicateScripts).catch(() => []);
    const duplicateScripts = secondScripts.filter(b => firstScripts.some(a => a.provider === b.provider && a.source === b.source && a.count === b.count));
    const visualObservations = stableVisualObservations(firstVisual, secondVisual);
    const collectMs = Date.now() - collectStart;

    let screenshot: string | null = null;
    if (opts.screenshot && !signal.aborted) {
      // Pop-ups fade in: detection can see one at 10% opacity, and a picture
      // taken then shows the page without it, contradicting the finding. Wait
      // (bounded) until every large fixed layer is fully drawn.
      if (data.friction.overlays.length > 0 || data.friction.cookieBanner) {
        // A just-inserted layer can sit at opacity 0 before its ~400ms fade starts.
        await sleep(500);
        await page
          .waitForFunction(() => {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
              const s = getComputedStyle(el);
              if (s.position !== 'fixed' || s.display === 'none' || s.visibility === 'hidden') continue;
              const r = el.getBoundingClientRect();
              if ((Math.max(0, r.width) * Math.max(0, r.height)) / (vw * vh) < 0.25) continue;
              let opacity = 1;
              for (let e: HTMLElement | null = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
              if (opacity > 0.05 && opacity < 0.95) return false;
            }
            return true;
          }, undefined, { timeout: 1500, polling: 100 })
          .catch(() => {});
        await sleep(150);
      }
      // Above-fold only. A full-page screenshot on a long marketing site
      // costs 2-4s, which is a tenth of the budget for a nicer thumbnail.
      const buf = await page
        .screenshot({ type: 'jpeg', quality: 70, fullPage: false })
        .catch(() => null);
      if (buf) screenshot = `data:image/jpeg;base64,${buf.toString('base64')}`;
    }

    // Element crops scroll the page, so they come after the above-fold shot.
    const elementShots =
      opts.screenshot && !signal.aborted ? await captureElementShots(page, signal) : [];

    // Review apps (Bazaarvoice, Okendo, Yotpo...) often render seconds after
    // load or only once scrolled into view. By now the page has been scrolled
    // for the crops, so look for a rating again before concluding there is none.
    if (role === 'product' && !data.ecommerce.ratingText && !data.ecommerce.structuredRating && !signal.aborted) {
      // Scroll down in steps (review apps often load only when their section
      // comes into view) and give them up to ~1.5s to render.
      const late = await page
        .evaluate(async () => {
          const RATING = /\b([1-5](?:\.\d)?)\s*(?:out of\s*5|\/\s*5(?:\.0)?|stars?)|\b([1-9][\d,]*)\s*(?:reviews?|ratings?)/i;
          const h = document.documentElement.scrollHeight;
          for (const f of [0.35, 0.6, 0.85, 1]) {
            window.scrollTo({ top: h * f, behavior: 'instant' as ScrollBehavior });
            await new Promise((r) => setTimeout(r, 350));
            const m = (document.body.innerText ?? '').match(RATING);
            if (m) return m[0];
          }
          return null;
        })
        .catch(() => null);
      if (late) {
        data.ecommerce.ratingText = late.slice(0, 40);
        data.ecommerce.reviewWidget = true;
      }
    }

    const productVerification = role === 'product' && !signal.aborted
      ? await recheckProduct(page, data, signal) : undefined;
    // Whole-page evidence for the product page: every section screenshotted
    // and the full product area read, so findings can be checked and
    // "missing" claims only stand when the scan saw everything.
    const fullScan = role === 'product' && opts.screenshot && !signal.aborted
      ? await scanProductPage(page, signal).catch(() => null) : null;
    // The add-to-bag test runs in a separate, parallel session (probeOnly).
    const cartProbe: PageEvidence['cartProbe'] = undefined;

    const finalUrl = page.url();
    await page.close().catch(() => {});

    // "Did we actually get a page?" is a question about content, not about
    // whether an event fired. A DOM with copy or actionable elements is
    // auditable regardless of how navigation reported itself.
    const hasContent = data.copy.wordCount > 0 || data.ctas.length > 0;
    const httpError = response !== null && response.status() >= 400;

    let error: string | null = null;
    if (httpError) error = `HTTP ${response!.status()}`;
    else if (!hasContent) error = navTimedOut ? 'Timed out with a blank page' : 'Page rendered empty';
    else if (navTimedOut) error = `Still loading after ${Math.round(config.navTimeoutMs / 1000)}s — audited as rendered`;

    return {
      ...base,
      finalUrl,
      ok: hasContent && !httpError,
      error,
      timing: { navMs, collectMs },
      ...data,
      productVerification,
      productScan: fullScan?.scan,
      sectionShots: fullScan?.sections,
      visualObservations,
      duplicateScripts,
      repeatedEvents: repeatedEvents(eventReceipts),
      screenshot,
      elementShots,
      cartProbe,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ...base,
      timing: { navMs, collectMs: Date.now() - started - navMs },
      error: message.slice(0, 300),
    };
  } finally {
    await pool.release(ctx, viewport);
  }
}
