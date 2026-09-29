import type { Page } from 'playwright-core';
import type { CollectResult } from './collect-fn.js';
import { collectFn } from './collect-fn.js';

export interface ProductVerification {
  policy: 'product-v2';
  samples: number;
  scrolled: boolean;
  elapsedMs: number;
  price: 'observed' | 'unverified';
  buy: 'observed' | 'unverified';
  completed: boolean;
}

/** Positive observations only. Never turn an exhausted scan into an absence claim. */
export async function recheckProduct(page: Page, initial: CollectResult, signal: AbortSignal): Promise<ProductVerification> {
  const started = Date.now();
  const result: ProductVerification = { policy: 'product-v2', samples: 1, scrolled: false, elapsedMs: 0,
    price: initial.ecommerce.priceVisible ? 'observed' : 'unverified',
    buy: initial.ecommerce.addToCartText ? 'observed' : 'unverified', completed: false };
  // Reuse screenshot/review scrolling first. Only missing values trigger more scrolling.
  const position = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  try {
    for (let step = 0; step < 4 && !signal.aborted && Date.now() - started < 450; step++) {
      if (step > 0) {
        await page.evaluate(step => window.scrollTo({top: Math.min(document.documentElement.scrollHeight - innerHeight, innerHeight * step * .8), behavior: 'instant'}), step);
        result.scrolled = true;
        await page.waitForTimeout(80);
      }
      const sample = await page.evaluate(collectFn);
      result.samples++;
      if (!initial.ecommerce.priceVisible && sample.ecommerce.priceVisible) {
        initial.ecommerce.priceVisible = true;
        initial.ecommerce.priceText = sample.ecommerce.priceText;
        // Initial fold flags stay unchanged; later observations cannot establish arrival visibility.
      }
      if (!initial.ecommerce.addToCartText && sample.ecommerce.addToCartText) {
        initial.ecommerce.addToCartText = sample.ecommerce.addToCartText;
        initial.ecommerce.addToCartWidth = sample.ecommerce.addToCartWidth;
        initial.ecommerce.addToCartHeight = sample.ecommerce.addToCartHeight;
      }
      if (initial.ecommerce.priceVisible && initial.ecommerce.addToCartText) break;
    }
    result.completed = !signal.aborted;
  } catch { /* Preserve initial evidence; failed rechecks remain unverified. */ }
  finally {
    await page.evaluate(p => window.scrollTo({left:p.x, top:p.y, behavior:'instant'}), position).catch(() => {});
  }
  result.price = initial.ecommerce.priceVisible ? 'observed' : 'unverified';
  result.buy = initial.ecommerce.addToCartText ? 'observed' : 'unverified';
  result.elapsedMs = Date.now() - started;
  return result;
}
