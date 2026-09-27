import { describe, expect, it } from 'vitest';
import {
  cohortOf, combinedOpportunity, opportunityScore,
  plainLanguage, sectionOf, type Check,
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
    }
  });
});
