'use client';

import type { Recommendation } from '@cro/shared';

export function Recommendations({
  summary,
  recommendations,
  writing,
}: {
  summary: string | null;
  recommendations: Recommendation[];
  writing: boolean;
}) {
  if (!summary && recommendations.length === 0 && !writing) return null;

  return (
    <section className="panel recPanel">
      <div className="panelHead">
        <h2>What to change</h2>
        <p>Ordered by impact on the action you want the visitor to take.</p>
      </div>

      {summary ? (
        <blockquote className="summaryBox">{summary}</blockquote>
      ) : (
        writing && (
          <div className="summaryBox">
            <div className="skeleton" style={{ width: '92%' }} />
            <div className="skeleton" style={{ width: '78%', marginTop: 10 }} />
            <div className="skeleton" style={{ width: '64%', marginTop: 10 }} />
          </div>
        )
      )}

      <ol className="recs">
        {recommendations.map((r, i) => (
          <li className="rec" key={`${r.title}-${i}`}>
            <div className="idx">{String(i + 1).padStart(2, '0')}</div>
            <div className="recBody">
              <div className="head">
                <h4>{r.title}</h4>
                <span className={`tag ${r.severity}`}>{r.severity}</span>
                <span className={`tag ${r.effort}`}>{r.effort.replace('-', ' ')}</span>
                <span className="tag">{r.impact} impact</span>
              </div>
              <p className="why">{r.why_it_matters}</p>
              <p className="fix">{r.fix}</p>
              {r.evidence_refs.length > 0 && (
                <div className="refs">grounded in {r.evidence_refs.join(' · ')}</div>
              )}
            </div>
          </li>
        ))}
      </ol>

      {writing && (
        <p className="writingNote">
          Writing the next recommendation<span className="ellipsis" />
        </p>
      )}
    </section>
  );
}
