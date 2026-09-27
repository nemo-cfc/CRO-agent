'use client';

import { CATEGORY_LABELS, type Scorecard as ScorecardType } from '@cro/shared';

function colorFor(score: number): string {
  return score >= 90 ? 'var(--pass)' : 'var(--warn)';
}

export function Scorecard({ scorecard }: { scorecard: ScorecardType }) {
  return (
    <section className="panel">
      <h2>Score</h2>
      <div className="scoreRow">
        <div className="bigScore" style={{ color: colorFor(scorecard.overall) }}>
          {scorecard.overall}
          <small> / 100</small>
        </div>
        <div className="cats">
          {scorecard.categories.map((c) => {
            // A category with nothing applicable (no form on the page, say) is
            // shown as "n/a" rather than a free 100 — it is excluded from the
            // overall score, and pretending otherwise would be misleading.
            const na = c.applicable === 0;
            return (
              <div className={`cat ${na ? 'na' : ''}`} key={c.category}>
                <span className="label">{CATEGORY_LABELS[c.category]}</span>
                <span className="bar">
                  {!na && (
                    <i style={{ width: `${c.score}%`, background: colorFor(c.score) }} />
                  )}
                </span>
                <span className="num" style={na ? undefined : { color: colorFor(c.score) }}>
                  {na ? 'n/a' : c.score}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
