'use client';

import { CATEGORY_LABELS, type Scorecard as ScorecardType } from '@cro/shared';

function colorFor(score: number): string {
  if (score >= 80) return 'var(--pass)';
  if (score >= 55) return 'var(--warn)';
  return 'var(--fail)';
}

function Ring({ score }: { score: number }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color = colorFor(score);

  return (
    <div className="ringWrap">
      <svg className="ring" viewBox="0 0 128 128" aria-hidden>
        <circle className="ringTrack" cx="64" cy="64" r={r} />
        <circle
          className="ringValue"
          cx="64"
          cy="64"
          r={r}
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="bigScore" style={{ color }}>
        {score}
        <small>/100</small>
      </div>
    </div>
  );
}

export function Scorecard({ scorecard }: { scorecard: ScorecardType }) {
  return (
    <section className="panel scorePanel">
      <div className="panelHead">
        <h2>Conversion score</h2>
        <p>Weighted across the checks that actually apply to this site.</p>
      </div>
      <div className="scoreRow">
        <Ring score={scorecard.overall} />
        <div className="cats">
          {scorecard.categories.map((c) => {
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
