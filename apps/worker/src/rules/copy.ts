import type { Check } from '@cro/shared';
import { check, skipped, type RuleContext } from './util.js';

export function copyRules(ctx: RuleContext): Check[] {
  const home = ctx.home;
  if (!home) {
    return [skipped('copy.unavailable', 'copy', 'Messaging', 'The page did not load.')];
  }

  const c = home.copy;
  const out: Check[] = [];

  out.push(
    c.readingEase !== null
      ? check({
          id: 'copy.readingEase',
          category: 'copy',
          title: 'Copy is easy to read',
          status: c.readingEase >= 60 ? 'pass' : c.readingEase >= 45 ? 'warn' : 'fail',
          detail: `Flesch reading ease is ${c.readingEase}. Above 60 is plain English; below 45 reads like a contract, and visitors skim rather than read.`,
          evidence: { readingEase: c.readingEase },
        })
      : skipped('copy.readingEase', 'copy', 'Copy is easy to read', 'Not enough body text to score readability.'),
  );

  out.push(
    c.avgSentenceWords !== null
      ? check({
          id: 'copy.sentenceLength',
          category: 'copy',
          title: 'Sentences are short enough to scan',
          status: c.avgSentenceWords <= 20 ? 'pass' : c.avgSentenceWords <= 28 ? 'warn' : 'fail',
          weight: 0.75,
          detail: `Sentences average ${c.avgSentenceWords} words. Web copy holds attention best under 20.`,
          evidence: { avgSentenceWords: c.avgSentenceWords },
        })
      : skipped('copy.sentenceLength', 'copy', 'Sentences are short enough to scan', 'Not enough body text to measure.'),
  );

  const ratio = c.featureHits > 0 ? c.benefitHits / c.featureHits : c.benefitHits > 0 ? 3 : 0;
  out.push(
    check({
      id: 'copy.benefitRatio',
      category: 'copy',
      title: 'Copy talks about the visitor, not the product',
      status: ratio >= 2 ? 'pass' : ratio >= 1 ? 'warn' : 'fail',
      weight: 1.25,
      detail: `${c.benefitHits} outcome-oriented words against ${c.featureHits} feature-oriented ones (ratio ${ratio.toFixed(1)}:1). Copy that leads with what the visitor gets outperforms copy that leads with how the product works.`,
      evidence: { benefitHits: c.benefitHits, featureHits: c.featureHits, ratio: Number(ratio.toFixed(2)) },
    }),
  );

  const jargonPer1k = c.wordCount > 0 ? (c.jargonHits / c.wordCount) * 1000 : 0;
  out.push(
    check({
      id: 'copy.jargon',
      category: 'copy',
      title: 'Free of filler business language',
      status: jargonPer1k <= 2 ? 'pass' : jargonPer1k <= 5 ? 'warn' : 'fail',
      detail:
        c.jargonHits === 0
          ? 'No filler business vocabulary detected.'
          : `${c.jargonHits} instance${c.jargonHits === 1 ? '' : 's'} of filler vocabulary ("seamless", "leverage", "best-in-class" and similar) across ${c.wordCount} words. These phrases carry no information and cost credibility.`,
      evidence: { jargonHits: c.jargonHits, per1000Words: Number(jargonPer1k.toFixed(1)) },
    }),
  );

  out.push(
    check({
      id: 'copy.specificity',
      category: 'copy',
      title: 'Headline makes a specific claim',
      status: c.headlineHasNumber ? 'pass' : 'warn',
      weight: 0.75,
      detail: c.headlineHasNumber
        ? 'The headline contains a concrete number.'
        : 'The headline contains no number or concrete specific. Specific claims ("Book a class in 30 seconds") consistently beat abstract ones ("Transform your practice").',
      evidence: { h1: c.h1, headlineHasNumber: c.headlineHasNumber },
    }),
  );

  return out;
}
