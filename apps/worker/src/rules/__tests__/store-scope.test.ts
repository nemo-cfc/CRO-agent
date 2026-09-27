import { describe, expect, it } from 'vitest';
import { runRules } from '../index.js';
import { healthyEvidence, healthyStoreEvidence } from './fixtures.js';

// Landing-page and lead-gen advice produced nonsense on store audits
// ("FALL COTTON" flagged for having no number, a footer newsletter scored as
// "the main form"). These pin down what runs where.
const LANDING_PAGE_ONLY = ['aboveFold.heroCopy', 'trust.testimonials', 'mobile.stickyCta'];
const REMOVED = [
  'copy.specificity', 'copy.readingEase', 'copy.sentenceLength', 'copy.benefitRatio', 'copy.jargon',
  'trust.reviewSchema',
];

describe('store scoping', () => {
  it('does not run landing-page, form or copy heuristics on a store', () => {
    const { checks, scorecard } = runRules(healthyStoreEvidence());
    const ids = checks.map((c) => c.id);
    for (const id of [...LANDING_PAGE_ONLY, ...REMOVED]) expect(ids).not.toContain(id);
    expect(ids.some((id) => id.startsWith('forms.'))).toBe(false);
    // Categories with no checks are left off the scorecard entirely.
    expect(scorecard.categories.map((c) => c.category)).not.toContain('copy');
    expect(scorecard.categories.map((c) => c.category)).not.toContain('forms');
  });

  it('keeps landing-page checks on a non-store site, and the removed ones stay removed', () => {
    const ids = runRules(healthyEvidence()).checks.map((c) => c.id);
    for (const id of LANDING_PAGE_ONLY) expect(ids).toContain(id);
    for (const id of REMOVED) expect(ids).not.toContain(id);
    // Form checks still run (this fixture has no form, so they report that).
    expect(ids.some((id) => id.startsWith('forms.'))).toBe(true);
  });
});
