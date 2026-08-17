import type { PageEvidence, PageRole, Viewport } from '@cro/shared';
import { config } from '../config.js';
import { pool } from './pool.js';
import { PERF_INIT_SCRIPT } from './init-script.js';
import { collectFn, type CollectResult } from './collect-fn.js';

const EMPTY: CollectResult = {
  ctas: [],
  ctasAboveFold: 0,
  form: null,
  formCount: 0,
  perf: {
    lcp: null, cls: null, ttfb: null, domContentLoaded: null,
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
    cookieBanner: false, chatWidget: false, widgetObscuresCta: false,
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
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CollectOptions {
  url: string;
  role: PageRole;
  viewport: Viewport;
  signal: AbortSignal;
  /** Above-fold JPEG for the report UI. Never sent to the model. */
  screenshot?: boolean;
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
    const page = await ctx.newPage();

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
    // One more tick so layout-shift observers flush.
    await sleep(150);

    if (signal.aborted) {
      return { ...base, timing: { navMs, collectMs: 0 }, error: 'deadline exceeded during load' };
    }

    const collectStart = Date.now();
    const data = (await page.evaluate(collectFn)) as CollectResult;
    const collectMs = Date.now() - collectStart;

    let screenshot: string | null = null;
    if (opts.screenshot && !signal.aborted) {
      // Above-fold only. A full-page screenshot on a long marketing site
      // costs 2-4s, which is a tenth of the budget for a nicer thumbnail.
      const buf = await page
        .screenshot({ type: 'jpeg', quality: 70, fullPage: false })
        .catch(() => null);
      if (buf) screenshot = `data:image/jpeg;base64,${buf.toString('base64')}`;
    }

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
      screenshot,
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
