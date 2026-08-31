import type { Browser, BrowserContext } from 'playwright-core';
import { isServerless, launchBrowser } from './launcher.js';
import {
  config,
  DESKTOP_UA,
  DESKTOP_VIEWPORT,
  MOBILE_UA,
  MOBILE_VIEWPORT,
} from '../config.js';
import type { Viewport } from '@cro/shared';

/**
 * Hosts that never carry a CRO signal but do cost seconds of load time.
 *
 * Deliberately narrow: analytics and tag-manager hosts are NOT blocked, because
 * measurement coverage is one of the scored categories and blocking those would
 * make every site look untracked. Images are not blocked either — image weight
 * and missing dimensions are themselves findings, and blocking them corrupts LCP.
 */
const AD_HOSTS = [
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'adservice.google.',
  'amazon-adsystem.com',
  'criteo.com',
  'criteo.net',
  'taboola.com',
  'outbrain.com',
  'pubmatic.com',
  'rubiconproject.com',
  'openx.net',
  'adnxs.com',
  'scorecardresearch.com',
  'moatads.com',
];

const BLOCKED_RESOURCE_TYPES = new Set(['font', 'media']);

function shouldAbort(url: string, resourceType: string): boolean {
  if (BLOCKED_RESOURCE_TYPES.has(resourceType)) return true;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return AD_HOSTS.some((h) => host.includes(h));
}

export class BrowserPool {
  #browser: Browser | null = null;
  #idle: Record<Viewport, BrowserContext[]> = { desktop: [], mobile: [] };
  #launching: Promise<Browser> | null = null;
  #filling: Promise<void> | null = null;
  #closed = false;

  /** Contexts kept warm per viewport profile. */
  readonly perProfile: number;

  constructor(poolSize = config.poolSize) {
    this.perProfile = Math.max(1, Math.floor(poolSize / 2));
  }

  async start(): Promise<void> {
    await this.#ensureBrowser();
    // Pre-warming only pays off when there is a next request to be warm for.
    // A serverless instance may serve one audit and be reclaimed, so paying
    // for eight contexts up front is pure cold-start cost; acquire() creates
    // what it needs on demand instead.
    if (!isServerless()) await this.#fill();
  }

  async #ensureBrowser(): Promise<Browser> {
    if (this.#browser?.isConnected()) return this.#browser;
    if (this.#launching) return this.#launching;

    this.#launching = launchBrowser()
      .then((b) => {
        this.#browser = b;
        this.#launching = null;
        // If Chromium dies, drop stale idle contexts so acquire() relaunches.
        b.on('disconnected', () => {
          this.#browser = null;
          this.#idle = { desktop: [], mobile: [] };
        });
        return b;
      })
      .catch((err) => {
        this.#launching = null;
        throw err;
      });

    return this.#launching;
  }

  async #create(viewport: Viewport): Promise<BrowserContext> {
    const browser = await this.#ensureBrowser();
    const isMobile = viewport === 'mobile';

    const ctx = await browser.newContext({
      viewport: isMobile ? { ...MOBILE_VIEWPORT } : { ...DESKTOP_VIEWPORT },
      deviceScaleFactor: isMobile ? 3 : 1,
      isMobile,
      hasTouch: isMobile,
      userAgent: isMobile ? MOBILE_UA : DESKTOP_UA,
      locale: 'en-US',
      timezoneId: 'UTC',
      ignoreHTTPSErrors: true,
      // Keeps a whole class of "please rotate your device" interstitials away.
      screen: isMobile ? { ...MOBILE_VIEWPORT } : { ...DESKTOP_VIEWPORT },
    });

    ctx.setDefaultTimeout(config.navTimeoutMs);
    ctx.setDefaultNavigationTimeout(config.navTimeoutMs);

    await ctx.route('**/*', (route) => {
      const req = route.request();
      if (shouldAbort(req.url(), req.resourceType())) {
        route.abort('blockedbyclient').catch(() => {});
        return;
      }
      route.continue().catch(() => {});
    });

    return ctx;
  }

  /**
   * Serialised so concurrent callers cannot each compute `missing` from the
   * same stale length and collectively over-create. Without this, four
   * simultaneous acquires produce four independent top-ups and the pool grows
   * past `perProfile` — every surplus context holding a live renderer process.
   */
  async #fill(): Promise<void> {
    if (this.#closed) return;
    if (this.#filling) return this.#filling;
    this.#filling = this.#fillOnce().finally(() => {
      this.#filling = null;
    });
    return this.#filling;
  }

  async #fillOnce(): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const vp of ['desktop', 'mobile'] as const) {
      const missing = this.perProfile - this.#idle[vp].length;
      for (let i = 0; i < missing; i++) {
        jobs.push(
          this.#create(vp)
            .then((ctx) => {
              // Re-check on arrival: a release() may have returned a slot
              // while this context was still being created.
              if (this.#closed || this.#idle[vp].length >= this.perProfile) {
                return ctx.close().catch(() => {});
              }
              this.#idle[vp].push(ctx);
            })
            .catch(() => {
              /* replenishment is best-effort; acquire() creates on demand */
            }),
        );
      }
    }
    await Promise.all(jobs);
  }

  /**
   * Borrow a warm context. Falls back to creating one if the pool is drained —
   * slower, but never a failure.
   */
  async acquire(viewport: Viewport): Promise<BrowserContext> {
    const warm = this.#idle[viewport].pop();
    if (warm) {
      // Replenish in the background so the next audit still finds it warm.
      if (!isServerless()) void this.#fill();
      return warm;
    }
    return this.#create(viewport);
  }

  /**
   * Contexts are never reused across audits — cookies, localStorage and
   * service workers would bleed between sites. Close and replace.
   */
  async release(ctx: BrowserContext, viewport: Viewport): Promise<void> {
    await ctx.close().catch(() => {});
    if (this.#closed) return;
    if (this.#idle[viewport].length < this.perProfile) void this.#fill();
  }

  stats() {
    return {
      connected: this.#browser?.isConnected() ?? false,
      idleDesktop: this.#idle.desktop.length,
      idleMobile: this.#idle.mobile.length,
      perProfile: this.perProfile,
    };
  }

  async close(): Promise<void> {
    this.#closed = true;
    const all = [...this.#idle.desktop, ...this.#idle.mobile];
    this.#idle = { desktop: [], mobile: [] };
    await Promise.all(all.map((c) => c.close().catch(() => {})));
    await this.#browser?.close().catch(() => {});
    this.#browser = null;
  }
}

export const pool = new BrowserPool();
