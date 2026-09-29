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

/**
 * Quarantined after real-store false positives; exclude from advice and
 * scoring. Price and add-to-cart left this list once the full product-page
 * scan (scan-v1) backed them: a missing claim now needs the whole page read.
 */
export const UNRELIABLE_CHECKS: ReadonlySet<string> = new Set([
  'cta.keyPage',
]);

/**
 * Checks whose finding is a direct measurement of something on screen or on
 * the network (a size, a colour contrast, a timing, an element's position, a
 * pop-up's coverage). A fail or warning here describes what was observed,
 * not something the collector failed to find, so it is publishable as-is.
 */
export const MEASURED_CHECKS: ReadonlySet<string> = new Set([
  'friction.blockingOverlay', 'friction.cookieBanner', 'friction.chatWidget',
  'cta.contrast', 'cta.tapTarget', 'cta.copy', 'cta.competing',
  'mobile.tapTargets', 'mobile.textSize', 'mobile.overflow', 'mobile.viewportMeta',
  'aboveFold.h1Length',
  'speed.lcp', 'speed.fcp', 'speed.cls', 'speed.ttfb', 'speed.blocking', 'speed.inp', 'speed.imageDimensions', 'speed.weight',
  'ecommerce.addToCartSize', 'ecommerce.variantLoad', 'ecommerce.cartContinue', 'ecommerce.cartCrossSell',
]);

/**
 * Whether a check may appear in the report and be handed to the model:
 * - a vetted observation (visual/observed policies), or
 * - a failing or warning measured check, or
 * - a failing or warning check whose evidence says it was verified, which
 *   for a "missing" claim means the full product-page scan completed and
 *   found nothing (rules/ecommerce.ts sets evidence.verified).
 * Everything else stays in the diagnostics, never in the report.
 */
export function isRecommendable(check: Check): boolean {
  if (isPublishableFinding(check)) return true;
  if (check.id.startsWith('visual.') || check.id.startsWith('observed.')) return false;
  if ((check.status !== 'fail' && check.status !== 'warn') || check.weight <= 0 || UNRELIABLE_CHECKS.has(check.id)) return false;
  if (MEASURED_CHECKS.has(check.id)) return true;
  return check.evidence.verified === true;
}

export function visibleRecommendations(recommendations: Recommendation[], checks: Check[]) {
  const allowed = new Set(checks.filter(isRecommendable).map(c => c.id));
  return recommendations.filter(r => r.evidence_refs.length > 0 && r.evidence_refs.every(id => allowed.has(id)));
}

export function visibleSummary(checks: Check[]) {
  const count = checks.filter(isPublishableFinding).length;
  return count ? `${count} direct observations were recorded on the sampled pages. The suggestions below address those specific elements; they are recommendations, not measured conversion losses.` : 'This visit did not capture a finding that met the evidence requirements. This is a limited result, not a clean bill of health.';
}
