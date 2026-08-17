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
    <section className="panel">
      <h2>What to change</h2>

      {summary ? (
        <div className="summaryBox">{summary}</div>
      ) : (
        writing && (
          <div className="summaryBox">
            <div className="skeleton" style={{ width: '92%' }} />
            <div className="skeleton" style={{ width: '78%', marginTop: 8 }} />
          </div>
        )
      )}

      <ol className="recs">
        {recommendations.map((r, i) => (
          <li className="rec" key={`${r.title}-${i}`}>
            <div className="head">
              <h4>{r.title}</h4>
              <span className={`tag ${r.severity}`}>{r.severity}</span>
              <span className={`tag ${r.effort}`}>{r.effort.replace('-', ' ')}</span>
              <span className="tag">{r.impact} impact</span>
            </div>
            <p className="why">{r.why_it_matters}</p>
            <p className="fix">{r.fix}</p>
            {r.evidence_refs.length > 0 && (
              <div className="refs">based on: {r.evidence_refs.join(', ')}</div>
            )}
          </li>
        ))}
      </ol>

      {writing && (
        <p style={{ color: 'var(--dim)', fontSize: 13, marginTop: 14 }}>
          Writing recommendations…
        </p>
      )}
    </section>
  );
}
