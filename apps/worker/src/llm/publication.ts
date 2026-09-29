import { reportObservation, isPublishableFinding, isRecommendable, type Check, type Recommendation } from '@cro/shared';

const clip = (text: string, max: number) => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/**
 * Guard between the model and the report.
 *
 * Every recommendation must cite 1–5 checks that exist in this audit and are
 * eligible (see `isRecommendable`); anything citing an unknown, passing or
 * known-unreliable check is dropped.
 *
 * Vetted observations (first-view visual findings, confirmed duplicate
 * tracking) keep their approved wording, as before. Recommendations grounded
 * in rule checks keep the model's own title, reasoning and fix, since those
 * checks carry no pre-written suggestion.
 */
export function groundedRecommendation(candidate: Recommendation, checks: Check[]): Recommendation | null {
  if (!candidate.evidence_refs.length || candidate.evidence_refs.length > 5) return null;
  const refs = [...new Set(candidate.evidence_refs)];
  const selected = refs.map(id => checks.find(c => c.id === id));
  if (selected.some(c => !c || !isRecommendable(c))) return null;
  const sources = selected as Check[];
  const first = sources[0]!;

  if (sources.every(isPublishableFinding)) {
    return {
      title: first.title, category: first.category,
      severity: 'medium', impact: 'low', effort: 'quick-win',
      why_it_matters: sources.map(c => c.detail).join(' '),
      fix: [...new Set(sources.map(c => String(c.evidence.suggestion)))].join(' '),
      evidence_refs: refs,
    };
  }

  if (sources.every(c => isPublishableFinding(c) || reportObservation(c))) {
    return {title: reportObservation(first)?.title ?? first.title, category:first.category, severity:'medium',impact:'low',effort:'quick-win',
      why_it_matters:sources.map(c => reportObservation(c)?.detail ?? c.detail).join(' '),
      fix:sources.map(c => reportObservation(c)?.suggestion ?? String(c.evidence.suggestion)).join(' '),evidence_refs:refs};
  }
  const title = clip(candidate.title, 120);
  const why = clip(candidate.why_it_matters, 700);
  const fix = clip(candidate.fix, 700);
  if (!title || !why || !fix) return null;
  return {
    title,
    // The category must match what the evidence is about.
    category: sources.some(c => c.category === candidate.category) ? candidate.category : first.category,
    // A passive, sampled audit cannot establish a critical blocker.
    severity: candidate.severity === 'critical' ? 'high' : candidate.severity,
    impact: candidate.impact,
    effort: candidate.effort,
    why_it_matters: why,
    fix,
    evidence_refs: refs,
  };
}
