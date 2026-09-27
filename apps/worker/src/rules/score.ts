import {
  CATEGORIES,
  CATEGORY_WEIGHTS,
  type CategoryScore,
  type Check,
  type Scorecard,
} from '@cro/shared';

/** Credit awarded per status. A warning is worth half a pass. */
const CREDIT: Record<Check['status'], number> = {
  pass: 1,
  warn: 0.5,
  fail: 0,
  na: 0,
};

/**
 * Weighted rollup. `na` checks are excluded from both numerator and
 * denominator, so a site with no form is not punished for having no form —
 * and a category where everything was skipped scores 100 rather than 0.
 */
export function scoreChecks(checks: Check[]): Scorecard {
  // A category that produced no checks at all (copy, or forms on a store,
  // where they are not run) is left out of the scorecard instead of "n/a".
  const present = CATEGORIES.filter((category) => checks.some((c) => c.category === category));
  const categories: CategoryScore[] = present.map((category) => {
    const own = checks.filter((c) => c.category === category);
    const applicable = own.filter((c) => c.status !== 'na' && c.weight > 0);

    const totalWeight = applicable.reduce((s, c) => s + c.weight, 0);
    const earned = applicable.reduce((s, c) => s + c.weight * CREDIT[c.status], 0);

    return {
      category,
      score: totalWeight > 0 ? Math.round((earned / totalWeight) * 100) : 100,
      passed: applicable.filter((c) => c.status === 'pass').length,
      warned: applicable.filter((c) => c.status === 'warn').length,
      failed: applicable.filter((c) => c.status === 'fail').length,
      applicable: applicable.length,
    };
  });

  // Categories with nothing applicable are dropped from the overall average
  // rather than counted as a free 100.
  const scored = categories.filter((c) => c.applicable > 0);
  const weightSum = scored.reduce((s, c) => s + CATEGORY_WEIGHTS[c.category], 0);
  const overall =
    weightSum > 0
      ? Math.round(
          scored.reduce((s, c) => s + c.score * CATEGORY_WEIGHTS[c.category], 0) / weightSum,
        )
      : 0;

  return { overall, categories };
}
