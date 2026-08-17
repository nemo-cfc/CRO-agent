import type { Check } from '@cro/shared';
import { check, skipped, type RuleContext } from './util.js';

export function aboveFoldRules(ctx: RuleContext): Check[] {
  const out: Check[] = [];
  const home = ctx.home;

  if (!home) {
    return [skipped('aboveFold.unavailable', 'aboveFold', 'Above-the-fold content', 'The page did not load.')];
  }

  const { copy } = home;

  /* H1 presence ---------------------------------------------------- */
  out.push(
    check({
      id: 'aboveFold.h1Present',
      category: 'aboveFold',
      title: 'Page has a single clear headline',
      status: copy.h1Count === 1 ? 'pass' : copy.h1Count === 0 ? 'fail' : 'warn',
      weight: 1.5,
      detail:
        copy.h1Count === 0
          ? 'No H1 heading found. Visitors have nothing to anchor on in the first two seconds.'
          : copy.h1Count === 1
            ? `One H1: "${copy.h1?.slice(0, 90) ?? ''}"`
            : `${copy.h1Count} H1 headings compete for attention.`,
      evidence: { h1Count: copy.h1Count, h1: copy.h1 },
    }),
  );

  /* H1 length ------------------------------------------------------ */
  const h1Words = copy.h1 ? copy.h1.trim().split(/\s+/).length : 0;
  out.push(
    copy.h1
      ? check({
          id: 'aboveFold.h1Length',
          category: 'aboveFold',
          title: 'Headline is scannable',
          status: h1Words <= 12 ? 'pass' : h1Words <= 18 ? 'warn' : 'fail',
          detail: `Headline is ${h1Words} words. Under 12 reads in a single glance.`,
          evidence: { words: h1Words },
        })
      : skipped('aboveFold.h1Length', 'aboveFold', 'Headline is scannable', 'No headline to measure.'),
  );

  /* Supporting copy ------------------------------------------------ */
  out.push(
    check({
      id: 'aboveFold.heroCopy',
      category: 'aboveFold',
      title: 'Headline is backed by supporting copy',
      status: copy.heroCopy ? 'pass' : 'warn',
      detail: copy.heroCopy
        ? `Supporting paragraph present: "${copy.heroCopy.slice(0, 80)}…"`
        : 'No supporting paragraph above the fold. The headline is carrying the whole value proposition alone.',
      evidence: { heroCopy: copy.heroCopy },
    }),
  );

  /* CTA above the fold, desktop ------------------------------------ */
  const d = ctx.homeDesktop;
  out.push(
    d
      ? check({
          id: 'aboveFold.ctaDesktop',
          category: 'aboveFold',
          title: 'Call to action visible without scrolling (desktop)',
          status: d.ctasAboveFold > 0 ? 'pass' : 'fail',
          weight: 1.5,
          detail:
            d.ctasAboveFold > 0
              ? `${d.ctasAboveFold} actionable element${d.ctasAboveFold === 1 ? '' : 's'} above the fold at 1440px.`
              : 'Nothing actionable is visible at 1440×900 before scrolling.',
          evidence: { ctasAboveFold: d.ctasAboveFold },
        })
      : skipped('aboveFold.ctaDesktop', 'aboveFold', 'Call to action visible without scrolling (desktop)', 'Desktop view did not load.'),
  );

  /* CTA above the fold, mobile — the one that usually fails --------- */
  const m = ctx.homeMobile;
  out.push(
    m
      ? check({
          id: 'aboveFold.ctaMobile',
          category: 'aboveFold',
          title: 'Call to action visible without scrolling (mobile)',
          status: m.ctasAboveFold > 0 ? 'pass' : 'fail',
          weight: 2,
          detail:
            m.ctasAboveFold > 0
              ? `${m.ctasAboveFold} actionable element${m.ctasAboveFold === 1 ? '' : 's'} above the fold at 390px.`
              : 'Nothing actionable is visible at 390×844 before scrolling — this is where most traffic lands.',
          scope: 'home',
          evidence: { ctasAboveFold: m.ctasAboveFold },
        })
      : skipped('aboveFold.ctaMobile', 'aboveFold', 'Call to action visible without scrolling (mobile)', 'Mobile view did not load.'),
  );

  return out;
}
