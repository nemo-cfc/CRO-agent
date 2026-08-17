import type { AuditEvidence, Check, Scorecard } from '@cro/shared';
import { buildContext } from './util.js';
import { aboveFoldRules } from './above-fold.js';
import { ctaRules } from './cta.js';
import { trustRules } from './trust.js';
import { formRules } from './forms.js';
import { speedRules } from './speed.js';
import { mobileRules } from './mobile.js';
import { copyRules } from './copy.js';
import { technicalRules } from './technical.js';
import { trackingRules } from './tracking.js';
import { frictionRules } from './friction.js';
import { ecommerceRules } from './ecommerce.js';
import { scoreChecks } from './score.js';

const RULES = [
  aboveFoldRules,
  ctaRules,
  trustRules,
  formRules,
  speedRules,
  mobileRules,
  copyRules,
  technicalRules,
  trackingRules,
  frictionRules,
  ecommerceRules,
];

/**
 * The whole audit, as pure functions over collected evidence. Runs in well
 * under 100ms, which is why scoring lives here rather than in the model:
 * it is reproducible, free, and testable without a network call.
 */
export function runRules(evidence: AuditEvidence): { checks: Check[]; scorecard: Scorecard } {
  const ctx = buildContext(evidence);

  const checks: Check[] = [];
  for (const rule of RULES) {
    try {
      checks.push(...rule(ctx));
    } catch (err) {
      // One misbehaving rule must not lose the other nine categories.
      checks.push({
        id: `${rule.name}.error`,
        category: 'technical',
        title: 'Check could not run',
        status: 'na',
        weight: 0,
        detail: err instanceof Error ? err.message : String(err),
        scope: 'site',
        evidence: {},
      });
    }
  }

  return { checks, scorecard: scoreChecks(checks) };
}

export { scoreChecks } from './score.js';
export { buildContext } from './util.js';
