import type { AuditTarget, Platform, StaticEvidence } from '@cro/shared';
import { isStore } from '@cro/shared';
import { config } from '../config.js';
import { pickKeyPage } from './keypage.js';
import { findProductInHtml, findStorePages } from './platform.js';

/**
 * Decide which pages to audit.
 *
 * On a store the funnel is what matters — homepage, a collection, a product —
 * because each stage fails in a different way and a homepage-only audit misses
 * where the money is lost. Everywhere else the single highest-intent page is
 * the better use of the budget.
 */
export async function pickTargets(
  homepage: string,
  platform: Platform,
  staticEvidence: StaticEvidence | null,
  signal: AbortSignal,
): Promise<{ targets: AuditTarget[]; notes: string[] }> {
  const notes: string[] = [];
  const targets: AuditTarget[] = [
    { url: homepage, role: 'home', reason: 'Where most first-time visitors land' },
  ];

  if (!staticEvidence) return { targets, notes };

  if (!isStore(platform)) {
    const key = pickKeyPage(staticEvidence.finalUrl, staticEvidence);
    if (key) targets.push({ url: key.url, role: 'keypage', reason: key.reason });
    return { targets, notes };
  }

  const found = findStorePages(platform, staticEvidence.internalLinks);

  if (found.collection) {
    targets.push({
      url: found.collection,
      role: 'collection',
      reason: 'Category page linked from the homepage',
    });
  }

  let productUrl = found.product;

  // Stores that merchandise categories rather than individual items do not
  // link a product from the homepage. One extra HTML fetch (~0.5s, no
  // browser) finds one from the collection page rather than dropping the most
  // important page in the funnel.
  if (!productUrl && found.collection) {
    productUrl = await fetchProductFromCollection(platform, found.collection, signal);
    if (productUrl) notes.push('The product page was found via the collection page.');
  }

  if (productUrl) {
    targets.push({
      url: productUrl,
      role: 'product',
      reason: 'Representative product page — where the buying decision happens',
    });
  } else {
    notes.push(
      'No product page could be identified automatically, so the product-page checks were skipped.',
    );
  }

  return { targets, notes };
}

async function fetchProductFromCollection(
  platform: Platform,
  collectionUrl: string,
  signal: AbortSignal,
): Promise<string | null> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), config.staticTimeoutMs);

  try {
    const res = await fetch(collectionUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': config.userAgent,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return null;
    return findProductInHtml(platform, await res.text(), res.url || collectionUrl);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}
