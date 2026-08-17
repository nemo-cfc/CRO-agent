import type { AuditEvidence, Check, Scorecard } from '@cro/shared';
import { CATEGORY_LABELS, PLATFORM_LABELS, ROLE_LABELS, isStore } from '@cro/shared';

/**
 * The compact packet handed to the model.
 *
 * Passed checks are collapsed into counts rather than listed. Sending all ~48
 * checks in full costs roughly 3x the tokens and gives the model more room to
 * write about things that are already fine — which is exactly the failure mode
 * the rubric spends a paragraph warning against.
 */
export function buildEvidencePacket(
  evidence: AuditEvidence,
  checks: Check[],
  scorecard: Scorecard,
) {
  const problems = checks
    .filter((c) => c.status === 'fail' || c.status === 'warn')
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'fail' ? -1 : 1;
      return b.weight - a.weight;
    })
    .map((c) => ({
      id: c.id,
      category: c.category,
      status: c.status,
      scope: c.scope,
      title: c.title,
      finding: c.detail,
      measured: c.evidence,
    }));

  const passing = checks
    .filter((c) => c.status === 'pass')
    .map((c) => c.title);

  const home = evidence.pages.find((p) => p.role === 'home' && p.ok);
  const product = evidence.pages.find((p) => p.role === 'product' && p.ok);
  const store = isStore(evidence.platform);

  return {
    site: {
      url: evidence.url,
      title: evidence.static?.title ?? null,
      description: evidence.static?.metaDescription ?? null,
      platform: PLATFORM_LABELS[evidence.platform],
      isOnlineStore: store,
      headline: home?.copy.h1 ?? null,
      supportingCopy: home?.copy.heroCopy ?? null,
      primaryCallToAction: home?.ctas[0]?.text ?? null,
    },
    pagesAudited: evidence.targets.map((t) => ({
      role: ROLE_LABELS[t.role],
      url: t.url,
      whyThisPage: t.reason,
    })),
    // Named explicitly because a recommendation about the buy button needs to
    // say which product page it was measured on.
    productPage: product
      ? {
          url: product.finalUrl,
          title: product.copy.h1,
          price: product.ecommerce.priceText,
          buyButton: product.ecommerce.addToCartText,
        }
      : null,
    scores: {
      overall: scorecard.overall,
      byCategory: Object.fromEntries(
        scorecard.categories
          .filter((c) => c.applicable > 0)
          .map((c) => [CATEGORY_LABELS[c.category], c.score]),
      ),
    },
    fieldData: evidence.crux?.available
      ? {
          note: 'Real-visitor measurements from the Chrome UX Report, 75th percentile, mobile.',
          largestContentfulPaintMs: evidence.crux.lcpP75,
          interactionToNextPaintMs: evidence.crux.inpP75,
          cumulativeLayoutShift: evidence.crux.clsP75,
        }
      : null,
    problems,
    alreadyWorking: passing,
  };
}
