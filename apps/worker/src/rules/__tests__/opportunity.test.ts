import { describe, expect, it } from 'vitest';
import {
  cohortOf, combinedOpportunity, opportunityScore, reportObservation,
  plainLanguage, sectionOf, TEST_TARGETS, type Check,
} from '@cro/shared';
import { runRules } from '../index.js';
import { healthyStoreEvidence } from './fixtures.js';

const make = (id: string, status: Check['status'], scope: Check['scope'] = 'home', evidence: Check['evidence'] = {}): Check => ({
  id, category: 'ecommerce', title: 't', status, weight: 1, detail: 'detail', scope, evidence,
});

describe('opportunity scoring', () => {
  it('ranks a blocking pop-up above a long page title, and failures above warnings', () => {
    expect(opportunityScore(make('friction.blockingOverlay', 'fail'))).toBeGreaterThan(opportunityScore(make('technical.title', 'warn')));
    expect(opportunityScore(make('speed.lcp', 'fail'))).toBeGreaterThan(opportunityScore(make('speed.lcp', 'warn')));
    expect(opportunityScore(make('speed.lcp', 'pass'))).toBe(0);
  });

  it('does not oversell: below-the-fold scores below missing, and only major failures carry a range', () => {
    const belowFold = make('ecommerce.addToCart', 'warn', 'product', { text: 'Add to cart' });
    const missing = make('ecommerce.addToCart', 'fail', 'product', {});
    expect(opportunityScore(belowFold)).toBeLessThan(70);
    expect(opportunityScore(missing)).toBeGreaterThan(opportunityScore(belowFold));
    expect(plainLanguage(belowFold).impact.range).toBeNull();
    expect(plainLanguage(belowFold).impact.contributes).toBe(true);
    expect(plainLanguage(make('ecommerce.stock', 'warn', 'product')).impact.range).toBeNull();
    expect(plainLanguage(make('friction.blockingOverlay', 'fail', 'home', { coverage: 0.9 })).impact.range).toBe('+3–6%');
  });

  it('places findings on the right page and in a cohort', () => {
    expect(sectionOf(make('ecommerce.tilePrices', 'warn', 'collection'))).toBe('collection');
    expect(sectionOf(make('tracking.analytics', 'warn', 'site'))).toBe('home');
    expect(sectionOf(make('visual.small-text.product.mobile.0', 'warn', 'home'))).toBe('product');
    expect(cohortOf(make('ecommerce.cartContinue', 'warn'))).toBe('bag');
  });

  it('combines scores without exceeding 99', () => {
    expect(combinedOpportunity([96, 90, 88, 80, 75, 70])).toBeLessThanOrEqual(99);
    expect(combinedOpportunity([60])).toBe(60);
    expect(combinedOpportunity([96, 92, 83, 40])).toBe(90);
  });

  it('writes every flagged check in plain words with a fix', () => {
    // Checks that can be flagged ("not measured"-only checks are never shown as shortcomings).
    const flagged = runRules(healthyStoreEvidence()).checks.filter((c) => c.status !== 'na').map((c) => ({ ...c, status: 'warn' as const }));
    for (const c of flagged) {
      if (c.id.startsWith('observed.') || c.id.startsWith('visual.')) continue;
      const p = plainLanguage(c);
      expect(p.found.length, c.id).toBeGreaterThan(0);
      expect(p.fix.length, c.id).toBeGreaterThan(0);
      if (reportObservation(c)) { expect(p.impact.range).toBeNull(); expect(p.impact.statement).toBe(''); continue; }
      expect(p.impact.statement.length, `${c.id} needs a business-impact statement`).toBeGreaterThan(0);
      expect(p.impact.checkout.length, `${c.id} needs a checkout-impact statement`).toBeGreaterThan(0);
      expect(p.impact.statement, c.id).not.toMatch(/\d+\s*%/);
      // Any number shown must be one of the illustrative ranges from the deeper-audit table.
      if (p.impact.range) expect(Object.values(TEST_TARGETS).map((t) => t.range), c.id).toContain(p.impact.range);
    }
  });
});
