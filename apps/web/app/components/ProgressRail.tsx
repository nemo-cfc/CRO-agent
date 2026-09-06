'use client';

import type { Phase } from '@cro/shared';

const STEPS: { phase: Phase; label: string; n: string }[] = [
  { phase: 'fetching', label: 'Read', n: '01' },
  { phase: 'rendering', label: 'Render', n: '02' },
  { phase: 'scoring', label: 'Score', n: '03' },
  { phase: 'writing', label: 'Write', n: '04' },
  { phase: 'done', label: 'Done', n: '05' },
];

export function ProgressRail({
  phase,
  elapsed,
  running,
}: {
  phase: Phase | null;
  elapsed: number;
  running: boolean;
}) {
  const current = STEPS.findIndex((s) => s.phase === phase);
  const seconds = (elapsed / 1000).toFixed(1);
  const pct = Math.min(100, (elapsed / 25_000) * 100);

  return (
    <div className="rail">
      <div className="railBar" aria-hidden>
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="railSteps">
        {STEPS.map((step, i) => {
          const cls = i === current ? 'active' : i < current ? 'past' : '';
          return (
            <div className={`step ${cls}`} key={step.phase}>
              <span className="n">{step.n}</span>
              {step.label}
            </div>
          );
        })}
        <span className={`timer ${elapsed > 30_000 ? 'over' : ''}`}>
          {seconds}s{running ? '' : ' · closed'}
        </span>
      </div>
    </div>
  );
}
