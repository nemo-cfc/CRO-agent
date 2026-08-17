import type { Check } from '@cro/shared';
import { check, skipped, type RuleContext } from './util.js';

export function mobileRules(ctx: RuleContext): Check[] {
  const out: Check[] = [];
  const staticEv = ctx.evidence.static;

  /* Viewport meta — measurable even when rendering failed ----------- */
  out.push(
    staticEv
      ? check({
          id: 'mobile.viewportMeta',
          category: 'mobile',
          title: 'Page declares a mobile viewport',
          status: staticEv.viewportMeta ? 'pass' : 'fail',
          weight: 1.5,
          detail: staticEv.viewportMeta
            ? 'A viewport meta tag is present.'
            : 'No viewport meta tag. Phones will render the desktop layout scaled down to unreadable size.',
          evidence: { viewportMeta: staticEv.viewportMeta },
        })
      : skipped('mobile.viewportMeta', 'mobile', 'Page declares a mobile viewport', 'HTML could not be fetched.'),
  );

  const m = ctx.homeMobile;
  if (!m) {
    out.push(
      skipped('mobile.rendering', 'mobile', 'Mobile rendering', 'The mobile view did not load.'),
    );
    return out;
  }

  out.push(
    check({
      id: 'mobile.overflow',
      category: 'mobile',
      title: 'No sideways scrolling',
      status: !m.mobile.horizontalOverflow ? 'pass' : m.mobile.overflowPx <= 20 ? 'warn' : 'fail',
      weight: 1.25,
      detail: m.mobile.horizontalOverflow
        ? `The page is ${m.mobile.overflowPx}px wider than a 390px screen, so content sits off the edge and the whole layout slides under the thumb.`
        : 'Content fits the 390px viewport with no horizontal scroll.',
      evidence: { overflowPx: m.mobile.overflowPx },
    }),
  );

  out.push(
    check({
      id: 'mobile.textSize',
      category: 'mobile',
      title: 'Body text is readable without zooming',
      status: m.mobile.smallTextNodes === 0 ? 'pass' : m.mobile.smallTextNodes <= 5 ? 'warn' : 'fail',
      detail:
        m.mobile.smallTextNodes === 0
          ? 'No body text below 12px.'
          : `${m.mobile.smallTextNodes} text block${m.mobile.smallTextNodes === 1 ? '' : 's'} render below 12px on mobile. Anything a visitor has to pinch to read, they skip.`,
      evidence: { smallTextNodes: m.mobile.smallTextNodes },
    }),
  );

  out.push(
    check({
      id: 'mobile.tapTargets',
      category: 'mobile',
      title: 'Buttons are big enough and far enough apart',
      status:
        m.mobile.tinyTapTargets === 0 && m.mobile.crowdedTapTargets === 0
          ? 'pass'
          : m.mobile.tinyTapTargets <= 3 && m.mobile.crowdedTapTargets <= 3
            ? 'warn'
            : 'fail',
      weight: 1.25,
      detail:
        m.mobile.tinyTapTargets === 0 && m.mobile.crowdedTapTargets === 0
          ? 'All button-style targets clear 44×44px with adequate spacing.'
          : `${m.mobile.tinyTapTargets} target${m.mobile.tinyTapTargets === 1 ? '' : 's'} below 44×44px and ${m.mobile.crowdedTapTargets} pair${m.mobile.crowdedTapTargets === 1 ? '' : 's'} sitting within 8px of each other. Both produce mis-taps, and a mis-tap on a checkout page is a lost sale.`,
      evidence: {
        tiny: m.mobile.tinyTapTargets,
        crowded: m.mobile.crowdedTapTargets,
      },
    }),
  );

  out.push(
    check({
      id: 'mobile.stickyCta',
      category: 'mobile',
      title: 'Action stays reachable while scrolling',
      status: m.mobile.stickyCta ? 'pass' : 'warn',
      weight: 0.75,
      detail: m.mobile.stickyCta
        ? 'A persistent action bar follows the visitor down the page.'
        : 'No sticky action bar on mobile. Once a visitor scrolls past the hero, there is nothing to tap until they find the next button.',
      evidence: { stickyCta: m.mobile.stickyCta },
    }),
  );

  return out;
}
