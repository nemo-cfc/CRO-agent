import { isPublishableFinding, type Check, type Recommendation } from '@cro/shared';

/** The model may rank/group approved evidence, never publish new factual claims. */
export function groundedRecommendation(candidate: Recommendation, checks: Check[]): Recommendation | null {
  if (!candidate.evidence_refs.length || candidate.evidence_refs.length > 5) return null;
  const refs = [...new Set(candidate.evidence_refs)];
  const selected = refs.map(id => checks.find(c => c.id === id));
  if (selected.some(c => !c || !isPublishableFinding(c))) return null;
  const sources = selected as Check[];
  const first = sources[0]!;
  return {
    title: first.title, category: first.category,
    severity: 'medium', impact: 'low', effort: 'quick-win',
    why_it_matters: sources.map(c => c.detail).join(' '),
    fix: [...new Set(sources.map(c => String(c.evidence.suggestion)))].join(' '),
    evidence_refs: refs,
  };
}
