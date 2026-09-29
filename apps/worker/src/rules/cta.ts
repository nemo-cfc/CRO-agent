import type { Check } from '@cro/shared';
import { check, skipped, type RuleContext } from './util.js';
import { isStore } from '@cro/shared';

const GENERIC = /^(submit|click here|read more|learn more|continue|next|go|here|more|ok|send|enter)$/i;

export function ctaRules(ctx: RuleContext): Check[] {
  const out: Check[] = [];
  const home = ctx.home;

  if (!home) {
    return [skipped('cta.unavailable', 'cta', 'Calls to action', 'The page did not load.')];
  }

  // The primary CTA is the highest-prominence candidate — see the scoring in
  // collect-fn.ts. Nav links and footer links are penalised there.
  const primary = home.ctas[0] ?? null;

  /* Contrast ------------------------------------------------------- */
  out.push(
    primary && primary.contrast !== null
      ? check({
          id: 'cta.contrast',
          category: 'cta',
          title: 'Primary button meets contrast minimums',
          status: primary.contrast >= 4.5 ? 'pass' : primary.contrast >= 3 ? 'warn' : 'fail',
          weight: 1.25,
          detail: `"${primary.text}" has a contrast ratio of ${primary.contrast}:1 against its background. WCAG AA asks for 4.5:1.`,
          evidence: { text: primary.text, contrast: primary.contrast },
        })
      : skipped('cta.contrast', 'cta', 'Primary button meets contrast minimums', primary
          ? `The contrast of "${primary.text}" could not be measured reliably: it sits over an image or a semi-transparent background, so it is not scored.`
          : 'No primary call to action was identified.'),
  );

  /* Tap target ----------------------------------------------------- */
  const mobilePrimary = ctx.homeMobile?.ctas[0] ?? null;
  out.push(
    mobilePrimary
      ? check({
          id: 'cta.tapTarget',
          category: 'cta',
          title: 'Primary button is thumb-sized on mobile',
          status:
            mobilePrimary.height >= 44 && mobilePrimary.width >= 44
              ? 'pass'
              : mobilePrimary.height >= 36
                ? 'warn'
                : 'fail',
          weight: 1.25,
          detail: `"${mobilePrimary.text}" measures ${mobilePrimary.width}×${mobilePrimary.height}px on mobile. 44×44px is the accepted minimum for a comfortable tap.`,
          evidence: { text: mobilePrimary.text, width: mobilePrimary.width, height: mobilePrimary.height, url: ctx.homeMobile!.finalUrl },
        })
      : skipped('cta.tapTarget', 'cta', 'Primary button is thumb-sized on mobile', 'Mobile view did not load.'),
  );

  /* Copy quality --------------------------------------------------- */
  out.push(
    primary
      ? check({
          id: 'cta.copy',
          category: 'cta',
          title: 'Button copy describes the outcome',
          status: GENERIC.test(primary.text.trim()) ? 'fail' : 'pass',
          weight: 1.25,
          detail: GENERIC.test(primary.text.trim())
            ? `The main button says "${primary.text}", which tells the visitor nothing about what happens next.`
            : `Button reads "${primary.text}".`,
          evidence: { text: primary.text },
        })
      : skipped('cta.copy', 'cta', 'Button copy describes the outcome', 'No primary call to action was identified.'),
  );

  /* Competing primary actions -------------------------------------- */
  // Landing-page advice: one page, one goal. A store homepage offering
  // parallel entry points ("Shop Men" / "Shop Women") is doing its job,
  // so this is only judged on non-store sites.
  const store = isStore(ctx.evidence.platform);
  const strong = home.ctas.filter((c) => c.prominence >= 6 && c.aboveFold);
  const distinctStrong = new Set(strong.map((c) => c.text.toLowerCase().trim())).size;
  if (!store) out.push(
    check({
      id: 'cta.competing',
      category: 'cta',
      title: 'One action is clearly the main one',
      status: distinctStrong <= 2 ? 'pass' : distinctStrong <= 4 ? 'warn' : 'fail',
      detail:
        distinctStrong <= 2
          ? `${distinctStrong} prominent action${distinctStrong === 1 ? '' : 's'} above the fold.`
          : `${distinctStrong} equally prominent actions compete above the fold. Every extra choice slows the decision.`,
      evidence: { distinctStrong, examples: strong.slice(0, 4).map((c) => c.text).join(' | ') },
    }),
  );

  /* Key page CTA --------------------------------------------------- */
  const key = ctx.keyMobile ?? ctx.keyDesktop;
  out.push(
    key
      ? check({
          id: 'cta.keyPage',
          category: 'cta',
          title: 'High-intent page has a visible action',
          status: key.ctasAboveFold > 0 ? 'pass' : 'na',
          weight: 1.5,
          scope: 'keypage',
          detail:
            key.ctasAboveFold > 0
              ? `${key.ctasAboveFold} action${key.ctasAboveFold === 1 ? '' : 's'} above the fold on ${key.finalUrl}.`
              : `The collector could not verify an above-fold action on ${key.finalUrl}. Absence is not established.`,
          evidence: { url: key.finalUrl, ctasAboveFold: key.ctasAboveFold },
        })
      : skipped('cta.keyPage', 'cta', 'High-intent page has a visible action', 'No second page was audited.'),
  );

  return out;
}
