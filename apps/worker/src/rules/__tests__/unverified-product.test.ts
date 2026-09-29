import { describe, expect, it } from 'vitest';
import { isRecommendable, visibleRecommendations, type Check, type Recommendation } from '@cro/shared';
import { scoreChecks } from '../score.js';
import { runRules } from '../index.js';
import { healthyStoreEvidence } from './fixtures.js';
const ids = ['ecommerce.price', 'ecommerce.addToCart', 'cta.keyPage'];
const make = (id: string): Check => ({ id, category: 'ecommerce', scope: 'product', title: 'Old missing-element claim', detail: 'Legacy finding', status: 'fail', weight: 2, evidence: {} });
describe('unverified product findings', () => {
  it.each(ids)('withholds saved %s findings and their model recommendations', id => {
    const check = make(id);
    expect(isRecommendable(check)).toBe(false);
    expect(isRecommendable({ ...check, status: 'warn' })).toBe(false);
    const recommendation = { evidence_refs: [id] } as Recommendation;
    expect(visibleRecommendations([recommendation], [check])).toEqual([]);
  });
  it('does not penalize diagnostic scores for the quarantined check', () => {
    const verified: Check = { ...make('speed.lcp'), category: 'speed', status: 'pass' };
    expect(scoreChecks([verified, make('cta.keyPage')]).overall).toBe(scoreChecks([verified]).overall);
  });
  it('treats an empty key-page action scan as unverified, not a failure', () => {
    const evidence = healthyStoreEvidence();
    evidence.pages = evidence.pages.map(page => ({ ...page, ctas: [], ctasAboveFold: 0 }));
    const check = runRules(evidence).checks.find(c => c.id === 'cta.keyPage');
    expect(check?.status).toBe('na');
  });
});
