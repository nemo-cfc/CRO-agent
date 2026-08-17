import * as cheerio from 'cheerio';
import type { Platform, StaticEvidence, TrackingEvidence } from '@cro/shared';
import { config } from '../config.js';
import { detectPlatform } from './platform.js';

const GENERATOR_HINTS: [RegExp, string][] = [
  [/wp-content|wp-includes/i, 'WordPress'],
  [/cdn\.shopify\.com|shopify/i, 'Shopify'],
  [/_next\/static/i, 'Next.js'],
  [/wix(static)?\.com/i, 'Wix'],
  [/squarespace/i, 'Squarespace'],
  [/webflow/i, 'Webflow'],
  [/cdn\.jsdelivr\.net\/npm\/vue|__vue__/i, 'Vue'],
  [/gatsby/i, 'Gatsby'],
  [/hubspot|hs-scripts/i, 'HubSpot CMS'],
  [/framerusercontent/i, 'Framer'],
];

/**
 * Fetch and parse the raw HTML without a browser.
 *
 * Worth its own track because it returns in ~400ms and unblocks two things the
 * browser tracks would otherwise gate: the link graph used to pick the second
 * page, and the metadata shown in the UI at the ~2s mark.
 */
export async function fetchStatic(
  url: string,
  signal: AbortSignal,
): Promise<{
  evidence: StaticEvidence;
  trackingFromHtml: Partial<TrackingEvidence>;
  platform: Platform;
} | null> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), config.staticTimeoutMs);

  const started = Date.now();
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': config.userAgent,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
      },
    });
    const ttfbMs = Date.now() - started;
    const html = await res.text();
    const $ = cheerio.load(html);

    const attr = (sel: string, name: string): string | null =>
      $(sel).first().attr(name)?.trim() || null;

    const finalUrl = res.url || url;
    const origin = new URL(finalUrl).origin;

    const internalLinks: { href: string; text: string }[] = [];
    const seen = new Set<string>();
    $('a[href]').each((_, el) => {
      const raw = $(el).attr('href');
      if (!raw) return;
      let abs: URL;
      try {
        abs = new URL(raw, finalUrl);
      } catch {
        return;
      }
      if (abs.origin !== origin) return;
      if (!/^https?:$/.test(abs.protocol)) return;
      abs.hash = '';
      const key = abs.toString();
      if (seen.has(key)) return;
      seen.add(key);
      internalLinks.push({
        href: key,
        text: $(el).text().replace(/\s+/g, ' ').trim().slice(0, 120),
      });
    });

    const schemaTypes = new Set<string>();
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed: unknown = JSON.parse($(el).text());
        const walk = (node: unknown): void => {
          if (Array.isArray(node)) return node.forEach(walk);
          if (node && typeof node === 'object') {
            const t = (node as Record<string, unknown>)['@type'];
            if (typeof t === 'string') schemaTypes.add(t);
            if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && schemaTypes.add(x));
            Object.values(node as Record<string, unknown>).forEach(walk);
          }
        };
        walk(parsed);
      } catch {
        /* malformed JSON-LD on the target site is itself unremarkable */
      }
    });

    let generator = attr('meta[name="generator"]', 'content');
    if (!generator) {
      const head = html.slice(0, 60_000);
      generator = GENERATOR_HINTS.find(([re]) => re.test(head))?.[1] ?? null;
    }

    // Cross-check tracking against script srcs. More robust than DOM globals
    // alone, which can be defeated by consent gating that defers the loader.
    const scripts = $('script')
      .map((_, el) => `${$(el).attr('src') ?? ''} ${$(el).html()?.slice(0, 2000) ?? ''}`)
      .get()
      .join(' ');

    const trackingFromHtml: Partial<TrackingEvidence> = {
      ga4: /gtag\/js|google-analytics\.com|googletagmanager\.com\/gtag/i.test(scripts),
      gtm: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]+/i.test(scripts),
      metaPixel: /connect\.facebook\.net|fbq\(/i.test(scripts),
      clarity: /clarity\.ms/i.test(scripts),
      hotjar: /static\.hotjar\.com|hjid/i.test(scripts),
      hubspot: /js\.hs-scripts\.com|hs-analytics/i.test(scripts),
      segment: /cdn\.segment\.com/i.test(scripts),
      plausible: /plausible\.io/i.test(scripts),
    };

    const evidence: StaticEvidence = {
      url,
      finalUrl,
      status: res.status,
      title: $('title').first().text().trim() || null,
      metaDescription: attr('meta[name="description"]', 'content'),
      canonical: attr('link[rel="canonical"]', 'href'),
      lang: attr('html', 'lang'),
      viewportMeta: $('meta[name="viewport"]').length > 0,
      og: {
        title: $('meta[property="og:title"]').length > 0,
        description: $('meta[property="og:description"]').length > 0,
        image: $('meta[property="og:image"]').length > 0,
      },
      twitterCard: $('meta[name="twitter:card"]').length > 0,
      favicon: $('link[rel~="icon"]').length > 0,
      schemaTypes: [...schemaTypes].slice(0, 20),
      htmlBytes: Buffer.byteLength(html),
      internalLinks: internalLinks.slice(0, 400),
      generator,
      ttfbMs,
    };

    // Response headers are the strongest platform signal available and are
    // free here — a theme can hide its markup, but not x-shopid.
    const platform = detectPlatform(html, res.headers);

    return { evidence, trackingFromHtml, platform };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}
