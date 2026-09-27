import { describe, expect, it } from 'vitest';
import { displayTitle, type Check } from '@cro/shared';
import { runRules } from '../index.js';
import { healthyEvidence, healthyStoreEvidence } from './fixtures.js';

const make = (id: string, status: Check['status'], evidence: Check['evidence'] = {}): Check => ({
  id, category: 'friction', title: 'Nothing blocks the page on arrival', status, weight: 1, detail: '', scope: 'home', evidence,
});

describe('display titles', () => {
  it('states the problem when a check is flagged, and the goal when it passes', () => {
    expect(displayTitle(make('friction.blockingOverlay', 'fail'))).toBe('A pop-up blocks the page on arrival');
    expect(displayTitle(make('friction.blockingOverlay', 'pass'))).toBe('Nothing blocks the page on arrival');
    expect(displayTitle(make('friction.blockingOverlay', 'na'))).toBe('Nothing blocks the page on arrival');
  });

  it('words the problem after what was measured', () => {
    expect(displayTitle(make('aboveFold.h1Present', 'fail', { h1Count: 0 }))).toBe('The page has no main headline');
    expect(displayTitle(make('aboveFold.h1Present', 'warn', { h1Count: 3 }))).toBe('Several headlines compete for attention');
    expect(displayTitle(make('ecommerce.deliveryTerms', 'warn', { shipping: true, returns: false }))).toBe('Returns information is missing');
  });

  it('has problem wording for every rule check the audit can flag', () => {
    const checks = [...runRules(healthyEvidence()).checks, ...runRules(healthyStoreEvidence()).checks]
      .filter((c) => !c.id.startsWith('visual.') && !c.id.startsWith('observed.') && c.status !== 'na');
    const missing = [...new Set(checks.filter((c) => displayTitle({ ...c, status: 'fail' }) === c.title).map((c) => c.id))];
    expect(missing).toEqual([]);
  });
});
