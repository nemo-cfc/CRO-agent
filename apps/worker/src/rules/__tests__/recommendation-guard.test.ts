import { describe, expect, it } from 'vitest';
import type { Check, Recommendation } from '@cro/shared';
import { groundedRecommendation } from '../../llm/publication.js';

const rule = (id: string, status: Check['status'] = 'fail'): Check => ({
  id, category: 'cta', title: 'Rule title', status, weight: 1, detail: 'Rule detail.', scope: 'home', evidence: {},
});

const candidate: Recommendation = {
  title: 'Make the hero link a real button',
  category: 'cta',
  severity: 'critical',
  impact: 'high',
  effort: 'quick-win',
  why_it_matters: 'It measures 70×20px on mobile.',
  fix: 'Give it padding and a solid background.',
  evidence_refs: ['cta.tapTarget'],
};

describe('recommendation guard', () => {
  it('accepts advice grounded in a measured check', () => {
    expect(groundedRecommendation(candidate, [rule('cta.tapTarget')])).not.toBeNull();
  });

  it('rejects model advice based on an unverified "missing" claim', () => {
    const claim = { ...candidate, evidence_refs: ['ecommerce.stock'] };
    expect(groundedRecommendation(claim, [rule('ecommerce.stock', 'warn')])).toBeNull();
    const verified = { ...rule('ecommerce.stock', 'warn'), evidence: { verified: true } };
    expect(groundedRecommendation(claim, [verified])).not.toBeNull();
  });

  it('rejects unknown and passing checks, and empty citations', () => {
    expect(groundedRecommendation({ ...candidate, evidence_refs: ['invented'] }, [rule('cta.tapTarget')])).toBeNull();
    expect(groundedRecommendation(candidate, [rule('cta.tapTarget', 'pass')])).toBeNull();
    expect(groundedRecommendation({ ...candidate, evidence_refs: [] }, [rule('cta.tapTarget')])).toBeNull();
  });
});
