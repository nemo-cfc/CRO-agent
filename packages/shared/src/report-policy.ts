import type { Check, Recommendation } from './schema.js';

export const VISIBLE_POLICY = 'visible-v1';
/** Legacy or unclassified findings never become public simply by adding a prompt. */
export function isVisibleFinding(check: Check): boolean {
  return /^visual\.(small-text|low-contrast|generic-action|first-view-overlay)\./.test(check.id)
    && check.evidence.policy === VISIBLE_POLICY
    && check.evidence.stable === true
    && typeof check.evidence.url === 'string'
    && typeof check.evidence.text === 'string'
    && typeof check.evidence.selector === 'string'
    && typeof check.evidence.suggestion === 'string';
}

export function isPublishableFinding(check: Check): boolean {
  return isVisibleFinding(check) || (check.id.startsWith('observed.duplicate-script.') && check.evidence.policy === 'script-v1' && check.evidence.confirmed === true && typeof check.evidence.count === 'number' && check.evidence.count >= 2 && typeof check.evidence.source === 'string' && typeof check.evidence.suggestion === 'string' && typeof check.evidence.url === 'string') || (check.id.startsWith('observed.repeated-event.') && check.evidence.policy === 'network-v1' && check.evidence.confirmed === true && typeof check.evidence.count === 'number' && check.evidence.count >= 2 && typeof check.evidence.url === 'string' && typeof check.evidence.suggestion === 'string');
}

/** Quarantined after real-store false positives; exclude from advice and scoring. */
export const UNRELIABLE_CHECKS: ReadonlySet<string> = new Set([
  'ecommerce.price', 'ecommerce.addToCart', 'cta.keyPage',
]);

/**
 * Whether the model may base a recommendation on this check: a vetted
 * observation, or a failing/warning rule check that is not known-unreliable.
 */
export function isRecommendable(check: Check): boolean {
  if (isPublishableFinding(check)) return true;
  if (check.id.startsWith('visual.') || check.id.startsWith('observed.')) return false;
  return (check.status === 'fail' || check.status === 'warn') && check.weight > 0 && !UNRELIABLE_CHECKS.has(check.id);
}

export function visibleRecommendations(recommendations: Recommendation[], checks: Check[]) {
  const allowed = new Set(checks.filter(isRecommendable).map(c => c.id));
  return recommendations.filter(r => r.evidence_refs.length > 0 && r.evidence_refs.every(id => allowed.has(id)));
}

export function visibleSummary(checks: Check[]) {
  const count = checks.filter(isPublishableFinding).length;
  return count ? `${count} direct observations were recorded on the sampled pages. The suggestions below address those specific elements; they are recommendations, not measured conversion losses.` : 'This visit did not capture a finding that met the evidence requirements. This is a limited result, not a clean bill of health.';
}
